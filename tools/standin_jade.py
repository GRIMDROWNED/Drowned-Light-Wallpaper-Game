"""Stand-in art for the Jade Hollow (map 7, Robert 2026-11-25) until his pictures come back from the prompts in
/mnt/project-files/art-prompts/side-view/jade-map-prompts.md: turn() makes the Abyssal Spires' violet jade green.
Run on its own it writes the map badge (assets/maps/jade.png); tools/cut_scenery.py uses turn() for the walkways,
posts and blocks the Jade Hollow still borrows from the Spires (BORROW there).
Usage: python3 tools/standin_jade.py"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHIFT = -0.33  # hue turn: violet (~0.75) to jade green (~0.42)


def turn(im, sat=1.0, val=1.0, only_violet=False):
    im = im.convert("RGBA")
    a = np.array(im)
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(np.float32)
    turn = (hsv[..., 0] > 0.6 * 255) & (hsv[..., 0] < 0.92 * 255) if only_violet else np.ones(hsv.shape[:2], bool)
    hsv[..., 0] = np.where(turn, (hsv[..., 0] + SHIFT * 255) % 255, hsv[..., 0])
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rgb = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    return Image.fromarray(np.dstack([rgb, a[..., 3]]), "RGBA")


if __name__ == "__main__":  # the map badge (Robert's sky and middle layer came in 2026-11-26: tools/cut_scenery.py cuts those)
    turn(Image.open(os.path.join(ROOT, "assets", "maps", "spires.png")), sat=1.15, only_violet=True).save(  # keep its bronze ring
        os.path.join(ROOT, "assets", "maps", "jade.png"), optimize=True)
    print("jade badge written")
