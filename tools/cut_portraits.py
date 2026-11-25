"""Knight-screen portraits (Robert 2026-11-25: "I want the kits to reveal their upper torso").
Takes each knight's full-size front picture (magenta or green background) from the project's art folder, keys the
background out, and crops head and chest into assets/ui/portraits/<kit id>.png (152 x 200, the card's portrait window).

    python3 tools/cut_portraits.py /mnt/project-files/art-prompts
"""
import sys, os
from PIL import Image
import numpy as np

SRC = {  # kit id -> front picture, relative to the art-prompts folder
    "lanternBlade": "kit-refs/knight-front.png",
    "pikeWarden": "returned/pike-warden/01_front.png",
    "ashenArbalist": "returned/ashen-arbalist/01_front.png",
    "relicBearer": "returned/ice-mage/01_front.png",
    "flameBastion": "returned/flame-bastion/01_front.png",
    "chainReaper": "returned/chain-reaper/01_front.png",
    "jadeBreaker": "returned/jade-breaker/01_front.png",
    "rosePaladin": "returned/rose-paladin/01_front.png",
    "bloodsworn": "returned/bloodsworn/01_front.png",
    "cinderbrand": "returned/crimson-greatsword/01_front.png",
}
OUT_W, OUT_H = 152, 200
SHIFT = {}  # nudge a portrait sideways (source px) if its centre lands off the head
TOP, KEEP = 0.02, 0.50  # start just above the head, keep the top half of the figure (head and chest)

def key(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 170) & (b > 170) & (g < 100)
    grn = (g > 170) & (r < 110) & (b < 110)
    alpha = np.where(mag | grn, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return Image.fromarray(rgba, "RGBA")

def main(root):
    out = os.path.join(os.path.dirname(__file__), "..", "assets", "ui", "portraits")
    os.makedirs(out, exist_ok=True)
    for kit, rel in SRC.items():
        im = key(Image.open(os.path.join(root, rel)))
        al = np.asarray(im)[..., 3] > 0
        ys, xs = np.nonzero(al)
        y0, y1 = ys.min(), ys.max(); h = y1 - y0
        top = int(y0 - h * TOP); bot = int(y0 + h * KEEP)
        # centre on the body: the middle of the widest stretch of each row in the shoulders and chest band
        # (a mean over the top rows would follow a raised spear, staff or sword hilt instead of the head)
        mids = []
        for y in range(y0 + int(h * 0.12), y0 + int(h * 0.35)):
            row = np.flatnonzero(np.diff(np.concatenate([[0], al[y].astype(int), [0]])))
            runs = row.reshape(-1, 2)
            a, b = max(runs, key=lambda r: r[1] - r[0])
            mids.append((a + b) / 2)
        hx = int(np.median(mids)) + SHIFT.get(kit, 0)
        w = int((bot - top) * OUT_W / OUT_H)
        box = (hx - w // 2, top, hx - w // 2 + w, bot)
        crop = Image.new("RGBA", (w, bot - top), (0, 0, 0, 0))
        crop.paste(im.crop(box), (0, 0))
        crop = crop.resize((OUT_W, OUT_H), Image.LANCZOS)
        crop.save(os.path.join(out, kit + ".png"))
        print(kit, im.size, "->", box)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts")
