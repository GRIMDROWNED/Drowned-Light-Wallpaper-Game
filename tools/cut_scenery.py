"""Cut Robert's GPT level art (2026-11-19) into pixel scenery for each level's backdrop.
Sources: /mnt/project-files/art-prompts/returned/side-view/levels/<level>/*.png (magenta key, objects in a row).
Writes assets/scenery/<level>/atlas.png (+ sky.png / far.png strips) and src/scenery.js (DS.SCENERY: rects, sizes).
Heights are in low-res pixels (1 px = 2 world units); a knight stands ~42 px.
Usage: python3 tools/cut_scenery.py [/path/to/returned/side-view/levels]"""
import sys, os, json
import numpy as np
from PIL import Image, ImageEnhance

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/returned/side-view/levels"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "scenery")

# level -> sheet -> (names in left-to-right order, target height of the TALLEST piece in the sheet (px), fog 0..1)
# Pieces keep their relative sizes within a sheet, so a cart stays smaller than its lantern post.
SHEETS = {
    "shallows": {
        "shrines.png": (["shrine1", "shrine2", "shrine3"], 62, 0.25),
        "posts-cart.png": (["post1", "post2", "cart"], 66, 0.15),
    },
    "mire": {
        "chapel.png": (["chapel"], 132, 0.35),
        "hanging-trees.png": (["hang1", "hang2", "hang3"], 118, 0.2),
        "graves.png": (["grave1", "grave2", "grave3", "grave4", "grave5", "grave6"], 22, 0.0),
        "mid.png": (["tree1", "tree2", "tree3", "tree4", "tree5", "tree6"], 92, 0.3),
    },
    "reaches": {
        "bridge-tower.png": (["bridge", "tower"], 128, 0.3),
        "crags.png": (["crag1", "crag2", "crag3"], 140, 0.35),
    },
    "abyss": {
        "graves-amethyst.png": (["agrave1", "agrave2", "agrave3", "crystal1", "crystal2", "crystal3"], 40, 0.0),
        "briars-bell.png": (["briar1", "briar2", "bellframe"], 96, 0.15),
    },
}
# full-width strips: (target height px, fog). The sky is a plain picture; "far" is silhouettes on magenta.
STRIPS = {"mire": {"sky.png": 240, "far.png": 250}}
# sheets whose pieces overlap in x (branches): rough cut columns, each moved to the emptiest column within 50 px
SPLIT = {("mire", "mid.png"): [350, 760, 1040, 1440, 1705]}
FOG = {"shallows": (36, 58, 64), "mire": (52, 62, 36), "reaches": (60, 70, 80), "abyss": (40, 18, 22)}


def key(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 150) & (b > 150) & (g < 110) & (abs(r - b) < 90)
    alpha = np.where(mag, 0, 255).astype(np.uint8)
    # despill: pinkish fringe pixels next to the key lose their magenta cast
    spill = (r > g + 40) & (b > g + 40) & ~mag
    a[spill, 0] = np.minimum(r[spill], g[spill] + 30); a[spill, 2] = np.minimum(b[spill], g[spill] + 30)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return rgba


def runs(alpha, gap=24, minw=12):
    cols = (alpha > 0).sum(0) > 1
    out, x, n = [], 0, len(cols)
    while x < n:
        if not cols[x]: x += 1; continue
        x0 = x; empty = 0
        while x < n and empty < gap:
            empty = 0 if cols[x] else empty + 1; x += 1
        x1 = x - empty
        if x1 - x0 >= minw: out.append((x0, x1))
    return out


def shrink(rgba, scale, fog, fogc):
    im = Image.fromarray(rgba, "RGBA")
    w, h = im.size; nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    # premultiplied downscale so the key doesn't bleed into edges
    arr = np.asarray(im).astype(float); al = arr[..., 3:4] / 255
    pm = Image.fromarray(np.dstack([arr[..., :3] * al, arr[..., 3:]]).astype(np.uint8), "RGBA").resize((nw, nh), Image.BOX)
    p = np.asarray(pm).astype(float); A = p[..., 3:4] / 255
    rgb = np.where(A > 0, p[..., :3] / np.maximum(A, 1e-6), 0)
    pink = (rgb[..., 0] - rgb[..., 1] > 14) & (rgb[..., 2] - rgb[..., 1] > 14)  # leftover key in twig tips
    m = rgb[..., 1][pink]; rgb[pink] = np.stack([m * 1.05, m, m * 0.85], -1)
    rgb = rgb * (1 - fog) + np.array(fogc) * fog
    out = np.dstack([np.clip(rgb, 0, 255), np.where(p[..., 3] > 110, 255, 0)]).astype(np.uint8)
    q = Image.fromarray(out, "RGBA")
    rgbq = q.convert("RGB").quantize(colors=40, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).convert("RGB")
    res = Image.new("RGBA", q.size, (0, 0, 0, 0)); res.paste(rgbq, (0, 0), q.split()[3])
    return res


def crop(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def pack(pieces):
    W = 1024; x = y = row = 0; rects = {}
    for name, im in pieces:
        if x + im.width > W: x, y, row = 0, y + row + 1, 0
        rects[name] = (x, y, im.width, im.height); x += im.width + 1; row = max(row, im.height)
    atlas = Image.new("RGBA", (W, y + row + 1), (0, 0, 0, 0))
    for name, im in pieces: atlas.paste(im, rects[name][:2])
    return atlas.crop((0, 0, W, y + row + 1)), rects


data = {}
for lv, sheets in SHEETS.items():
    os.makedirs(os.path.join(OUT, lv), exist_ok=True)
    pieces, info = [], {}
    for fn, (names, tall, fog) in sheets.items():
        rgba = key(Image.open(os.path.join(SRC, lv, fn)))
        rs = runs(rgba[..., 3])
        if (lv, fn) in SPLIT:
            cols = (rgba[..., 3] > 0).sum(0); xs = [c - 50 + int(np.argmin(cols[c - 50:c + 50])) for c in SPLIT[(lv, fn)]]
            edges = [rs[0][0]] + xs + [rs[-1][1]]; rs = list(zip(edges[:-1], edges[1:]))
        if len(rs) != len(names): raise SystemExit(f"{lv}/{fn}: found {len(rs)} pieces {rs}, expected {len(names)}")
        cuts = []
        for (x0, x1) in rs:
            sub = rgba[:, x0:x1]; rows = np.where((sub[..., 3] > 0).sum(1) > 0)[0]
            cuts.append(sub[rows[0]:rows[-1] + 1])
        scale = tall / max(c.shape[0] for c in cuts)
        for name, c in zip(names, cuts):
            im = crop(shrink(c, scale, fog, FOG[lv]))
            pieces.append((name, im))
    atlas, rects = pack(pieces)
    atlas.save(os.path.join(OUT, lv, "atlas.png"))
    data[lv] = {"atlas": rects}
    for fn, tall in STRIPS.get(lv, {}).items():
        im = Image.open(os.path.join(SRC, lv, fn)).convert("RGB")
        if fn == "sky.png":
            s = tall / im.height
            out = im.resize((round(im.width * s), tall), Image.BOX)
            out = out.quantize(colors=32, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).convert("RGB")
        else:
            rgba = key(im); rows = np.where((rgba[..., 3] > 0).sum(1) > 2)[0]
            band = rgba[rows[0]:rows[-1] + 1]
            s = 64 / band.shape[0] * (band.shape[0] / (rows[-1] - rows[0] + 1))  # silhouette band ~64 px tall
            out = crop(shrink(band, s, 0.45, FOG[lv]))
        out.save(os.path.join(OUT, lv, fn))
        data[lv][fn[:-4]] = list(out.size)
    print(lv, {k: v[2:] for k, v in rects.items()})

with open(os.path.join(ROOT, "src", "scenery.js"), "w") as f:
    f.write("/* Level scenery cut by tools/cut_scenery.py from Robert's GPT art: atlas rects [x, y, w, h] and strip sizes. */\n")
    f.write("window.DS = window.DS || {};\nDS.SCENERY = " + json.dumps(data, separators=(",", ":")) + ";\n")
