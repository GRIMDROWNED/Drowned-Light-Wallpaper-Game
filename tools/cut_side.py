"""Cut Robert's side-view movement sheets (magenta or green key) into full-size frames in art/.
tools/pixelize.py then shrinks them like the main game's frames (art/ is checked before the main repo).
Usage: python3 tools/cut_side.py <sheet.png> <group/folder> <scale> name1 name2 ...
`scale` brings the sheet to main-game size (a standing knight ~80 px tall). Frames are found row by row,
left to right, split at empty gaps, so a sword that crosses a grid line stays whole."""
import sys, os
import numpy as np
from PIL import Image

def bands(v, gap=14, min_len=30):
    out, s, e = [], None, None
    for i, x in enumerate(v):
        if x:
            if s is None: s = i
            e = i
        elif s is not None and i - e > gap: out.append((s, e)); s = None
    if s is not None: out.append((s, e))
    return [o for o in out if o[1] - o[0] > min_len]

def key_mask(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    if (r[2, 2] > 170 and b[2, 2] > 170):  # magenta
        return (r - g > 70) & (b - g > 70) & (abs(r - b) < 90)
    return (g - r > 70) & (g - b > 70)  # green

def cut(path, dest, scale, names):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    bg = key_mask(im); fg = ~bg
    boxes = []
    for y0, y1 in bands(fg.sum(1) > 2):
        for x0, x1 in bands(fg[y0:y1 + 1].sum(0) > 0):
            ys = np.where(fg[y0:y1 + 1, x0:x1 + 1].any(1))[0]
            boxes.append((x0, y0 + ys[0], x1 + 1, y0 + ys[-1] + 1))
    if len(boxes) != len(names): sys.exit(f"{path}: found {len(boxes)} figures, expected {len(names)}: {boxes}")
    rgba = np.dstack([im, np.where(bg, 0, 255)]).astype(np.uint8)
    for (x0, y0, x1, y1), n in zip(boxes, names):
        if n == "-": continue
        fr = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")
        fr = fr.resize((max(1, round(fr.width * scale)), max(1, round(fr.height * scale))), Image.LANCZOS)
        out = os.path.join(dest, n + ".png"); os.makedirs(os.path.dirname(out), exist_ok=True)
        fr.save(out); print(out, fr.size)

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    cut(sys.argv[1], os.path.join(root, "art", sys.argv[2]), float(sys.argv[3]), sys.argv[4:])
