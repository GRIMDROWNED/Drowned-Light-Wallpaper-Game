"""Cut Robert's Jade Hollow creature sheets (2026-11-25, magenta key) into pixel frames for src/jade.js.
Sources: /mnt/project-files/art-prompts/returned/side-view/levels/jade/{watcher,gatekeeper,shellback}.png
Writes assets/jade/creatures.png (one atlas) and src/jadeart.js (DS.JADEART: name -> [x, y, w, h] (+ top row for the shellback), in pixel px;
1 px = 2 world units, a knight stands ~42 px). Every frame of a creature keeps the sheet's relative sizes; the
shellback's wading frame is cut at the waterline (the game draws its own water).
Usage: python3 tools/cut_jade_creatures.py [/path/to/returned/side-view/levels/jade]"""
import sys, os, json
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_side import key_mask, keep_main
from cut_boss import splits

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/returned/side-view/levels/jade"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# sheet -> (cols, rows, frame names in reading order, height of the tallest frame in pixel px)
SHEETS = {
    "watcher.png": (3, 2, ["wDisguise", "wWake", "wAwake", "wShoot", "wHurt", "wDead"], 30),
    "gatekeeper.png": (3, 2, ["gSleep", "gWake", "gHungry", "gEat", "gMove", "gAside"], 96),
    "shellback.png": (2, 3, ["sWalk1", "sWalk2", "sWalk3", "sWalk4", "sWade", "sSleep"], 82),
}

def pixelize(im, scale, colors=14, outline=(10, 14, 12)):
    w, h = im.size; nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = im.resize((nw, nh), Image.LANCZOS)
    a = small.split()[3].point(lambda v: 255 if v > 120 else 0)
    rgb = small.convert("RGB").filter(ImageFilter.UnsharpMask(1, 120, 2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.2); rgb = ImageEnhance.Color(rgb).enhance(1.2)
    tmp = Image.new("RGB", rgb.size); tmp.paste(rgb, (0, 0), a)
    q = tmp.quantize(colors=colors + 1, method=Image.Quantize.MAXCOVERAGE, kmeans=4, dither=Image.Dither.NONE).convert("RGB")
    out = Image.new("RGBA", (nw + 2, nh + 2), (0, 0, 0, 0))
    body = Image.new("RGBA", (nw, nh), (0, 0, 0, 0)); body.paste(q, (0, 0), a)
    A = Image.new("L", out.size, 0); A.paste(a, (1, 1))
    out.paste(Image.new("RGBA", out.size, outline + (255,)), (0, 0), A.filter(ImageFilter.MaxFilter(3)))
    out.paste(body, (1, 1), a)
    return out

def cells(path, cols, rows):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    fg = ~key_mask(im)
    fg &= ~(np.abs(im - im[2:12, 2:12].reshape(-1, 3).mean(0)).sum(-1) < 160)
    ys = splits(fg.sum(1).astype(float), rows)
    for r in range(rows):
        band = fg[ys[r]:ys[r + 1]]
        xs = splits(band.sum(0).astype(float), cols)
        for c in range(cols):
            m = keep_main(band[:, xs[c]:xs[c + 1]], keep=0.25)
            yield np.dstack([im[ys[r]:ys[r + 1], xs[c]:xs[c + 1]], np.where(m, 255, 0)]).astype(np.uint8)

def crop(a):
    yy, xx = np.nonzero(a[..., 3]); return a[yy.min():yy.max() + 1, xx.min():xx.max() + 1]

def waterline(a):
    """The wading pose stands in a painted strip of water: cut where the figure suddenly runs the full width."""
    on = a[..., 3] > 0; wid = on.sum(1); full = wid.max()
    for y in range(len(wid) * 2 // 3, len(wid)):
        if wid[y] > full * 0.97: return a[:y]
    return a

frames = {}
for sheet, (cols, rows, names, top) in SHEETS.items():
    cut = [crop(c) for c in cells(os.path.join(SRC, sheet), cols, rows)]
    for i, n in enumerate(names):
        if n == "sWade": cut[i] = crop(waterline(cut[i]))
    scale = top / max(c.shape[0] for c in cut)
    for n, c in zip(names, cut): frames[n] = pixelize(Image.fromarray(c, "RGBA"), scale)

# pack in rows
W = 1024; x = y = rh = 0; rects = {}
for n, f in frames.items():
    if x + f.width > W: x, y, rh = 0, y + rh + 1, 0
    rects[n] = [x, y, f.width, f.height]; x += f.width + 1; rh = max(rh, f.height)
atlas = Image.new("RGBA", (W, y + rh), (0, 0, 0, 0))
for n, f in frames.items(): atlas.paste(f, tuple(rects[n][:2]))
os.makedirs(os.path.join(ROOT, "assets", "jade"), exist_ok=True)
atlas.save(os.path.join(ROOT, "assets", "jade", "creatures.png"), optimize=True)
# the shellback's flat top: the first row where the shell runs more than half the frame wide (crystals stick up above it)
for n, f in frames.items():
    if n[0] == "s":
        on = (np.array(f)[..., 3] > 0).sum(1)
        rects[n].append(int(next(y for y, v in enumerate(on) if v > f.width * 0.55)))
with open(os.path.join(ROOT, "src", "jadeart.js"), "w") as fh:
    fh.write("/* The Jade Hollow's creatures, cut by tools/cut_jade_creatures.py from Robert's sheets: atlas rects [x, y, w, h] (+ the shellback's flat top row). */\n")
    fh.write("window.DS = window.DS || {};\nDS.JADEART = " + json.dumps(rects, separators=(",", ":")) + ";\n")
for n, r in rects.items(): print(n, r[2:])
