"""Stand-in art for the Jade Hollow (map 7, Robert 2026-11-25) until his pictures come back from the prompts in
/mnt/project-files/art-prompts/side-view/jade-map-prompts.md: the Abyssal Spires' cut scenery (arches, crystal
pillars, portal, pylons, isles, sky, far layer) and map badge turned from violet to jade green.
world.js THEMES.jade borrows the Spires' rects (rectsFrom) while this stand-in atlas is in use.
Once the real art is in, add "jade" to tools/cut_scenery.py (magenta key) and drop rectsFrom.
Usage: python3 tools/standin_jade.py"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHIFT = -0.33  # hue turn: violet (~0.75) to jade green (~0.42)


def jade(src, dst, sat=1.0, val=1.0, only_violet=False):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(np.float32)
    turn = (hsv[..., 0] > 0.6 * 255) & (hsv[..., 0] < 0.92 * 255) if only_violet else np.ones(hsv.shape[:2], bool)
    hsv[..., 0] = np.where(turn, (hsv[..., 0] + SHIFT * 255) % 255, hsv[..., 0])
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rgb = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    out = np.dstack([rgb, a[..., 3]])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(out, "RGBA").save(dst, optimize=True)


sc = os.path.join(ROOT, "assets", "scenery")
for f in ("atlas.png", "sky.png", "far.png"):
    jade(os.path.join(sc, "spires", f), os.path.join(sc, "jade", f), sat=1.1)
jade(os.path.join(ROOT, "assets", "maps", "spires.png"), os.path.join(ROOT, "assets", "maps", "jade.png"), sat=1.15, only_violet=True)  # keep its bronze ring
print("jade stand-ins written")
