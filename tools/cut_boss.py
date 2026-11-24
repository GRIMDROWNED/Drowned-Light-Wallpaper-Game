"""Cut Robert's side-view boss move sheets (3 across, 2 down, magenta or green key) into full-size frames in art/.
Big bosses' poses sit close together, so instead of tools/cut_side.py's gap search each row is split where the
fewest pixels are, near the thirds; each cell keeps its main figure (tools/cut_side.keep_main).
Usage: python3 tools/cut_boss.py <sheet.png> <group/folder> <scale> name1 ... name6   ("-" skips a pose)"""
import sys, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_side import key_mask, keep_main, bands

def splits(v, n, win=0.12):
    W = len(v); out = [0]
    for i in range(1, n):
        c = W * i // n; a, b = int(c - W * win), int(c + W * win)
        out.append(a + int(np.argmin(np.convolve(v[a:b], np.ones(9), "same"))))
    return out + [W]

def cut(path, dest, scale, names, cols=3, rows=2):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    fg = ~key_mask(im)
    fg &= ~(np.abs(im - im[2:12, 2:12].reshape(-1, 3).mean(0)).sum(-1) < 160)  # key-coloured fringe
    ys = splits(fg.sum(1).astype(float), rows)
    k = 0
    for r in range(rows):
        band = fg[ys[r]:ys[r + 1]]
        xs = splits(band.sum(0).astype(float), cols)
        for c in range(cols):
            n = names[k]; k += 1
            if n == "-": continue
            m = keep_main(band[:, xs[c]:xs[c + 1]], keep=0.25)
            yy, xx = np.nonzero(m)
            sub = np.dstack([im[ys[r]:ys[r + 1], xs[c]:xs[c + 1]], np.where(m, 255, 0)]).astype(np.uint8)
            fr = Image.fromarray(sub[yy.min():yy.max() + 1, xx.min():xx.max() + 1], "RGBA")
            fr = fr.resize((max(1, round(fr.width * scale)), max(1, round(fr.height * scale))), Image.LANCZOS)
            out = os.path.join(dest, n + ".png"); os.makedirs(os.path.dirname(out), exist_ok=True)
            fr.save(out); print(out, fr.size)

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    cut(sys.argv[1], os.path.join(root, "art", sys.argv[2]), float(sys.argv[3]), sys.argv[4:])
