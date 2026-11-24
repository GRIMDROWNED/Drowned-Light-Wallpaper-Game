"""The Seething Seraph moved to the Abyssal Spires (Robert 2026-11-24): its side-view sheets were hue-shifted from
lava orange to the Spires' violet (+268 deg, saturation x0.85, value x0.92). This does the same to the main game's
frames it borrows (still, walk, hurt, death), into art/drowned/seething-seraph/, so every frame matches.
Usage: python3 tools/recolor_seraph.py /path/to/Drowned-Light"""
import sys, os
import numpy as np
from PIL import Image

SRC = os.path.join(sys.argv[1], "assets/sprites/mines-bosses/seraph/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art", "drowned", "seething-seraph")
for rel in ["right", "side/walk1", "side/walk2", "side/walk3", "side/walk4", "side/hurt", "side/death"]:
    im = Image.open(SRC + rel + ".png").convert("RGBA")
    h, s, v = [np.asarray(c).astype(float) for c in im.convert("RGB").convert("HSV").split()]
    h = (h + 268 / 360 * 255) % 256; s *= 0.85; v *= 0.92
    out = Image.merge("HSV", [Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)) for x in (h, s, v)]).convert("RGBA")
    out.putalpha(im.split()[3])
    f = os.path.join(OUT, rel + ".png"); os.makedirs(os.path.dirname(f), exist_ok=True); out.save(f)
print("seraph frames recoloured")
