"""Cut Robert's pickup art (2026-11-23) into pixel sprites for src/explore.js.
Source: /mnt/project-files/art-prompts/returned/side-view/pickups/pickups.png (3 x 2 grid, magenta key):
oil flask, heart ember, echo flare / drowned page, kit sigil, sigil turned.
Writes assets/pickups/atlas.png and src/pickart.js (DS.PICKART: name -> [x, y, w, h] in low-res px; 1 px = 2 world units).
Usage: python3 tools/cut_pickups.py [sheet.png]"""
import sys, os, json
import numpy as np
from PIL import Image

# the keyer and shrinker from tools/cut_scenery.py (copied: that script runs on import)
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


SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/returned/side-view/pickups/pickups.png"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# grid cell -> (name, target height in low-res px). The knight stands ~42 px.
CELLS = [("oil", 17), ("ember", 17), ("flare", 18), ("page", 17), ("sigil", 18), ("sigil2", 18)]

im = Image.open(SRC).convert("RGB"); W, H = im.size; cw, ch = W // 3, H // 2
pieces = []
for i, (name, tall) in enumerate(CELLS):
    cell = im.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
    rgba = key(cell)
    bb = Image.fromarray(rgba, "RGBA").getbbox()
    rgba = rgba[bb[1]:bb[3], bb[0]:bb[2]]
    pieces.append((name, crop(shrink(rgba, tall / rgba.shape[0], 0, (0, 0, 0)))))
x = 0; rects = {}; hmax = max(p.height for _, p in pieces)
atlas = Image.new("RGBA", (sum(p.width + 1 for _, p in pieces), hmax), (0, 0, 0, 0))
for name, p in pieces:
    atlas.paste(p, (x, 0)); rects[name] = [x, 0, p.width, p.height]; x += p.width + 1
atlas.save(os.path.join(ROOT, "assets", "pickups", "atlas.png"))
with open(os.path.join(ROOT, "src", "pickart.js"), "w") as f:
    f.write("/* Pickup sprites cut by tools/cut_pickups.py from Robert's art: atlas rects [x, y, w, h] (low-res px). */\n")
    f.write("window.DS = window.DS || {};\nDS.PICKART = " + json.dumps(rects, separators=(",", ":")) + ";\n")
print(rects)
