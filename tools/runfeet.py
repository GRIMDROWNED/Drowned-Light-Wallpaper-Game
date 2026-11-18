"""Feet points for the knights' side-view run cycles (art/knights/<folder>/side/run1-4.png, full-size px).
Guessing the feet from the lowest pixels made the runs skip: a striding frame has its feet far apart, a passing
frame has them together, and a low sword tip drags the guess, so the body jumped back and forth each frame.
Here x follows the torso (median of the 15-55% band) plus the folder's mean offset, so the body runs steady,
and the passing frames (shorter than the strides) are lifted half the height difference, halving the head bob.
Usage: python3 tools/runfeet.py   (rewrites the DS.RUNFEET line of src/pixscale.js; tools/pixelize.py calls it too)"""
import os, re, json, numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RUN = ["side/run%d" % i for i in range(1, 5)]

def measure(p):
    a = np.array(Image.open(p).convert("RGBA"))[..., 3] > 40
    ys = np.where(a.any(1))[0]; top, low = ys.min(), ys.max() + 1; H = low - top
    tx = float(np.median(np.where(a[int(top + H * .15):int(top + H * .55)])[1]))
    bottom = np.where(a[max(0, low - 8):low])[1]
    return dict(H=H, low=int(low), tx=tx, gx=float(bottom.mean()))

def table():
    out = {}
    base = os.path.join(ROOT, "art", "knights")
    for folder in sorted(os.listdir(base)):
        ps = [os.path.join(base, folder, n + ".png") for n in RUN]
        if not all(os.path.exists(p) for p in ps): continue
        m = [measure(p) for p in ps]
        off = sum(r["gx"] - r["tx"] for r in m) / len(m)
        tall = max(r["H"] for r in m)
        out["knights/" + folder] = {n: [round(r["tx"] + off, 1), round(r["low"] + (tall - r["H"]) * 0.5, 1)] for n, r in zip(RUN, m)}
    return out

def guesses():
    """The lowest-pixel feet sprites.js would guess, worked out here so a page opened from disk (file://, e.g. by a
    wallpaper app) where the canvas can't be read still stands every frame right. Pixel-sprite px."""
    import glob
    out = {}
    for group in ("knights", "drowned"):
        for d in sorted(glob.glob(os.path.join(ROOT, "assets", group, "*"))):
            t = {}
            for f in sorted(glob.glob(d + "/**/*.png", recursive=True)):
                if f.endswith("/atlas.png"): continue
                a = np.array(Image.open(f).convert("RGBA"))[..., 3] > 40
                ys = np.where(a.any(1))[0]
                if not len(ys): continue
                low = ys.max(); xs = np.where(a[max(0, low - 8):low + 1])[1]
                t[os.path.relpath(f, d)[:-4]] = [round(float(xs.mean()), 1), int(low) + 1]
            out[group + "/" + os.path.basename(d)] = t
    return out

def write():
    p = os.path.join(ROOT, "src", "pixscale.js"); s = open(p).read()
    line = "/* run-cycle feet from tools/runfeet.py (full-size px) */\nDS.RUNFEET = " + json.dumps(table(), separators=(",", ":")) + ";\n"
    line += "/* guessed feet of every frame (pixel px), for pages opened from disk */\nDS.GUESSFEET = " + json.dumps(guesses(), separators=(",", ":")) + ";\n"
    s = re.sub(r"/\* run-cycle feet.*?\*/\nDS\.RUNFEET = .*?;\n", "", s, flags=re.S)
    s = re.sub(r"/\* guessed feet.*?\*/\nDS\.GUESSFEET = .*?;\n", "", s, flags=re.S)
    open(p, "w").write(s + line)

if __name__ == "__main__":
    write(); print(open(os.path.join(ROOT, "src", "pixscale.js")).read().split("DS.RUNFEET")[1][:400])
