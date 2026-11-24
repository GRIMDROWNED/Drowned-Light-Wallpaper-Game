"""Clean up the Drowned side-view move frames after tools/cut_side.py:
remove magenta spill from the key, then match each frame's colours to the folder's walk1
from the main game (ChatGPT's move sheets drift pinker/oranger than the walk art).
Usage: python3 tools/foe_color.py /path/to/Drowned-Light type [type ...]"""
import sys, os, glob
import numpy as np
from PIL import Image

MAIN = os.path.join(sys.argv[1], "assets/sprites/drowned/")
ART = os.path.join(os.path.dirname(__file__), "..", "art", "drowned")

def stats(a):
    m = a[..., 3] > 120; px = a[m][:, :3].astype(float)
    return px.mean(0), px.std(0) + 1e-3

# the bosses' main-game frames live outside drowned/ (see BOSSES in tools/pixelize.py)
BOSS_REF = {"drowned-colossus": "colossus/side/walk1", "mother-wyvern": "wyvern-mother/side/fly1", "crucible-wyrm": "mines-bosses/wyrm/side/walk1",
            "starved-bell": "starved-bell/side/walk1", "deadly-rose": "deadly-rose/side/walk1"}
GREEN = {"mother-wyvern", "crucible-wyrm", "deadly-rose"}
for t in sys.argv[2:]:
    ref = np.array(Image.open(os.path.join(sys.argv[1], "assets/sprites", BOSS_REF[t]) + ".png" if t in BOSS_REF else MAIN + t + "/side/walk1.png").convert("RGBA"))
    rm, rs = stats(ref)
    for f in glob.glob(os.path.join(ART, t, "side", "*.png")):
        a = np.array(Image.open(f).convert("RGBA")).astype(float)
        rgb = a[..., :3]
        spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
        rgb[..., 0] -= spill * 0.85; rgb[..., 2] -= spill * 0.85
        gspill = np.clip(rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]) - 30, 0, None) if t in GREEN else 0  # green-key fringe
        rgb[..., 1] -= gspill * 0.85
        m = a[..., 3] > 120
        fm, fs = rgb[m].mean(0), rgb[m].std(0) + 1e-3
        k = 0.8  # how far to pull toward the walk art
        rgb[:] = (rgb - fm) * (1 - k + k * rs / fs) + (1 - k) * fm + k * rm
        a[..., :3] = np.clip(rgb, 0, 255)
        Image.fromarray(a.astype(np.uint8)).save(f)
    print(t, "done")
