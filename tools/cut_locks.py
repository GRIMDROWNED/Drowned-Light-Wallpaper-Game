"""Lock pieces from Robert's sheet (art-prompts/ui/lock-pieces-art.png, magenta background, 2026-11-25), cut to
assets/ui/locks/*.png at half size with the magenta keyed out. Boxes are in the sheet's px, trimmed to the piece.

    python3 tools/cut_locks.py /mnt/project-files/art-prompts/ui/lock-pieces-art.png
"""
import sys, os
from PIL import Image
import numpy as np
from cut_hud import key

PIECES = {
    "padlock": (70, 25, 315, 365), "padlockBroken": (360, 25, 605, 365), "chain": (635, 145, 1360, 260), "seal": (1385, 65, 1625, 335),
    "slot": (280, 365, 545, 640), "slotSel": (700, 365, 965, 640), "slotLock": (1130, 365, 1390, 640),
    "wide": (25, 675, 545, 922), "wideSel": (575, 675, 1090, 922), "wideLock": (1115, 675, 1645, 922),
}

def main(src):
    a = np.asarray(Image.open(src).convert("RGB")).astype(int)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "ui", "locks")
    os.makedirs(out, exist_ok=True)
    for name, (x0, y0, x1, y1) in PIECES.items():
        im = Image.fromarray(key(a[max(0, y0):y1, max(0, x0):x1]), "RGBA")
        im = im.crop(im.getbbox())
        im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS).save(os.path.join(out, name + ".png"), optimize=True)
        print(name, im.size)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/ui/lock-pieces-art.png")
