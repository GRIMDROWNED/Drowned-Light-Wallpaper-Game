"""Cut Robert's loot icons and map badges (returned 2026-11-24) for src/loot.js and the map select.
Sources in /mnt/project-files/art-prompts/returned/side-view/ (magenta key):
  kit-pickups-later/loot-icons-a.png, loot-icons-b.png: two rows of icons each (7 + 7, 8 + 8)
  spare-art/emblems.png: 3 x 2 spiked map badges
Writes assets/loot/atlas.png + src/lootart.js (DS.LOOTART: name -> [x, y, w, h], low-res px; 1 px = 2 world units),
assets/loot/icons/<name>.png (menu icons) and assets/maps/<map>.png (map badges).
Pieces are found by empty columns, so uneven spacing in the sheets doesn't matter.
Usage: python3 tools/cut_loot.py [dir]"""
import sys, os, json
import numpy as np
from PIL import Image

def key(im):  # same keyer as tools/cut_pickups.py
    a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 150) & (b > 150) & (g < 110) & (abs(r - b) < 90)
    alpha = np.where(mag, 0, 255).astype(np.uint8)
    spill = (r > g + 40) & (b > g + 40) & ~mag
    a[spill, 0] = np.minimum(r[spill], g[spill] + 30); a[spill, 2] = np.minimum(b[spill], g[spill] + 30)
    return np.dstack([a.astype(np.uint8), alpha])

def shrink(rgba, tall, colors=48):
    im = Image.fromarray(rgba, "RGBA")
    w, h = im.size; s = tall / h; nw, nh = max(1, round(w * s)), max(1, round(h * s))
    arr = np.asarray(im).astype(float); al = arr[..., 3:4] / 255
    pm = Image.fromarray(np.dstack([arr[..., :3] * al, arr[..., 3:]]).astype(np.uint8), "RGBA").resize((nw, nh), Image.BOX)
    p = np.asarray(pm).astype(float); A = p[..., 3:4] / 255
    rgb = np.where(A > 0, p[..., :3] / np.maximum(A, 1e-6), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.where(p[..., 3] > 110, 255, 0)]).astype(np.uint8)
    q = Image.fromarray(out, "RGBA")
    rgbq = q.convert("RGB").quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).convert("RGB")
    res = Image.new("RGBA", q.size, (0, 0, 0, 0)); res.paste(rgbq, (0, 0), q.split()[3])
    return res.crop(res.getbbox())

def pieces(path, rows):
    """Split a sheet into rows (at the emptiest band) and each row into pieces (runs of non-empty columns)."""
    rgba = key(Image.open(path)); fg = rgba[..., 3] > 0; H, W = fg.shape
    out = []
    bands = np.linspace(0, H, rows + 1).astype(int)
    for i in range(rows):
        y0, y1 = bands[i], bands[i + 1]
        cols = fg[y0:y1].sum(0) > 1
        runs, x = [], 0
        while x < W:
            if cols[x]:
                s = x
                while x < W and cols[x]: x += 1
                if runs and s - runs[-1][1] < 8: runs[-1][1] = x  # a hairline gap inside one piece
                else: runs.append([s, x])
            x += 1
        for a, b in runs:
            if b - a < 20: continue  # specks
            sub = rgba[y0:y1, a:b]; ys = np.where(sub[..., 3].any(1))[0]
            out.append(sub[ys[0]:ys[-1] + 1])
    return out

DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/returned/side-view"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NAMES = [
    ("kit-pickups-later/loot-icons-a.png", 2, ["gold", "bloodshard", "frostshard", "timber", "sack", "embercap", "lanternbell",
                                               "pearls", "lotus", "mandrake", "gear", "key", "tonic", "lantern"]),
    ("kit-pickups-later/loot-icons-b.png", 2, ["berries", "toadstool", "glowcap", "twigs", "stone", "emberore", "amethyst", "rosevine",
                                               "bone", "scroll", "redpotion", "bluepotion", "lantern2", "coinbag", "gembag", "chest"]),
]
BADGES = ("spare-art/emblems.png", 2, ["mire", "mines", "abyss", "reaches", "spires", "crucible"])  # Robert liked the art hub's matching

os.makedirs(os.path.join(ROOT, "assets", "loot", "icons"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "assets", "maps"), exist_ok=True)
small = []
for sheet, rows, names in NAMES:
    ps = pieces(os.path.join(DIR, sheet), rows)
    assert len(ps) == len(names), (sheet, len(ps))
    for name, p in zip(names, ps):
        tall = 13 if name not in ("chest", "coinbag", "gembag") else 15
        small.append((name, shrink(p, tall, 32)))
        shrink(p, 44).save(os.path.join(ROOT, "assets", "loot", "icons", name + ".png"))
sheet, rows, names = BADGES
ps = pieces(os.path.join(DIR, sheet), rows)
assert len(ps) == len(names), len(ps)
for name, p in zip(names, ps): shrink(p, 84, 64).save(os.path.join(ROOT, "assets", "maps", name + ".png"))

x = 0; rects = {}; hmax = max(p.height for _, p in small)
atlas = Image.new("RGBA", (sum(p.width + 1 for _, p in small), hmax), (0, 0, 0, 0))
for name, p in small:
    atlas.paste(p, (x, 0)); rects[name] = [x, 0, p.width, p.height]; x += p.width + 1
atlas.save(os.path.join(ROOT, "assets", "loot", "atlas.png"))
with open(os.path.join(ROOT, "src", "lootart.js"), "w") as f:
    f.write("/* Loot icons cut by tools/cut_loot.py from Robert's art: atlas rects [x, y, w, h] (low-res px). */\n")
    f.write("window.DS = window.DS || {};\nDS.LOOTART = " + json.dumps(rects, separators=(",", ":")) + ";\n")
print(len(rects), "icons,", len(names), "badges")
