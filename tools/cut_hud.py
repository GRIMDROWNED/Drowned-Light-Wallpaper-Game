"""HUD pieces from Robert's sheet (art-prompts/ui/hud-pieces-art.png, magenta background), cut to assets/ui/hud/*.png
at half size with the magenta keyed out. Boxes are in the sheet's px (found by connected parts of the non-magenta).

    python3 tools/cut_hud.py /mnt/project-files/art-prompts/ui/hud-pieces-art.png
"""
import sys, os
from PIL import Image
import numpy as np

PIECES = {
    "panel": (12, 16, 596, 280), "frameLong": (644, 32, 1196, 100), "frameMid": (648, 108, 1084, 180), "frameShort": (648, 188, 928, 252),
    "fillRed": (1232, 36, 1656, 80), "fillTeal": (1232, 108, 1644, 148), "fillGold": (1236, 168, 1568, 208), "fillEmber": (1236, 224, 1552, 260),
    "boss": (48, 264, 1632, 476), "famRing": (32, 480, 272, 820), "ribbon": (300, 516, 1144, 668), "purse": (1196, 504, 1628, 652),
    "btnGold": (288, 696, 496, 916), "btnTeal": (516, 696, 728, 916), "btnSilver": (756, 696, 968, 920), "btnCrimson": (996, 696, 1208, 920), "btnEmber": (1232, 696, 1444, 916),
}

def key(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g
    alpha = np.clip(255 - (mag - 60) * 255 / 90, 0, 255)
    out = a.copy(); m = alpha < 255
    out[..., 0][m] = np.minimum(r[m], g[m] + 80); out[..., 2][m] = np.minimum(b[m], g[m] + 60)
    return np.dstack([out, alpha]).astype("uint8")

def main(src):
    a = np.asarray(Image.open(src).convert("RGB")).astype(int)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "ui", "hud")
    os.makedirs(out, exist_ok=True)
    for name, (x0, y0, x1, y1) in PIECES.items():
        im = Image.fromarray(key(a[y0 - 4:y1 + 4, x0 - 4:x1 + 4]), "RGBA")
        im = im.crop(im.getbbox())
        im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS).save(os.path.join(out, name + ".png"), optimize=True)
        print(name, im.size)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/ui/hud-pieces-art.png")
