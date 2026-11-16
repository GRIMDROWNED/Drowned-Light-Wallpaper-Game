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

def keep_main(fg, cell=3, keep=0.15):
    """Drop loose bits (a drawn bolt beside the bow): label 8-connected blobs on a coarse grid, keep the big ones."""
    h, w = fg.shape; H, W = -(-h // cell), -(-w // cell)
    pad = np.zeros((H * cell, W * cell), bool); pad[:h, :w] = fg
    g = pad.reshape(H, cell, W, cell).any(axis=(1, 3))
    lab = np.zeros((H, W), int); sizes = [0]; n = 0
    for y0, x0 in zip(*np.nonzero(g)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; st = [(y0, x0)]; c = 0
        while st:
            y, x = st.pop(); c += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and g[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
        sizes.append(c)
    big = max(sizes); ok = np.array([s >= big * keep for s in sizes]); ok[0] = False
    full = np.repeat(np.repeat(ok[lab], cell, 0), cell, 1)[:h, :w]
    return fg & full

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
        row = []
        for x0, x1 in bands(fg[y0:y1 + 1].sum(0) > 0):
            ys = np.where(fg[y0:y1 + 1, x0:x1 + 1].any(1))[0]
            row.append((x0, y0 + ys[0], x1 + 1, y0 + ys[-1] + 1, fg[y0:y1 + 1, x0:x1 + 1].sum()))
        biggest = max(b[4] for b in row)
        boxes += [b[:4] for b in row if b[4] > biggest * 0.08]  # a stray bolt is not a figure
    if len(boxes) != len(names): sys.exit(f"{path}: found {len(boxes)} figures, expected {len(names)}: {boxes}")
    for (x0, y0, x1, y1), n in zip(boxes, names):
        if n == "-": continue
        m = keep_main(fg[y0:y1, x0:x1]); ys, xs = np.nonzero(m)
        sub = np.dstack([im[y0:y1, x0:x1], np.where(m, 255, 0)]).astype(np.uint8)
        fr = Image.fromarray(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")
        fr = fr.resize((max(1, round(fr.width * scale)), max(1, round(fr.height * scale))), Image.LANCZOS)
        out = os.path.join(dest, n + ".png"); os.makedirs(os.path.dirname(out), exist_ok=True)
        fr.save(out); print(out, fr.size)

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    cut(sys.argv[1], os.path.join(root, "art", sys.argv[2]), float(sys.argv[3]), sys.argv[4:])
