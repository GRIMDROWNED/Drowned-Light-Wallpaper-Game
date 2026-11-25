"""Familiar head portraits for the Choose-a-familiar cards (Robert 2026-11-25: "just the head, like the kits").
Crops each familiar's head from its reference sheet (front view on a flat slate background, made from the drawn
sprites), keys the background out and writes assets/ui/portraits/fam-<id>.png (200 x 200).

    python3 tools/cut_fam_portraits.py /mnt/project-files/art-prompts/ui/character-refs
"""
import sys, os
from PIL import Image
import numpy as np

HEAD = {  # familiar id -> (reference file, square head box in its px)
    "hound": ("familiar-bone-hound.png", (250, 170, 650, 570)),
    "golem": ("familiar-derek.png", (455, 120, 765, 430)),
    "kindle": ("familiar-kindle.png", (230, 85, 650, 505)),
    "abigail": ("familiar-abigail.png", (300, 85, 690, 475)),
    "fred": ("familiar-fred.png", (230, 90, 830, 690)),
    "wyvern": ("familiar-david.png", (400, 160, 720, 480)),
}

def main(root):
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "ui", "portraits")
    for fid, (name, box) in HEAD.items():
        a = np.asarray(Image.open(os.path.join(root, name)).convert("RGB")).astype(int)
        bg = a[5, 5]
        d = np.abs(a - bg).sum(2)
        alpha = np.clip((d - 18) * 12, 0, 255).astype(np.uint8)
        im = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), "RGBA").crop(box)
        im.resize((200, 200), Image.NEAREST if im.width % 200 == 0 else Image.LANCZOS).save(os.path.join(out, f"fam-{fid}.png"), optimize=True)
        print(fid, "ok")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/art-prompts/ui/character-refs")
