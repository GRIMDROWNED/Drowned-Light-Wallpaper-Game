"""Shrink the main game's side sprites to small pixel art (art direction 2026-11-16).
Reads the full-size frames from the main repo, writes pixel frames into assets/ and the
per-folder scale into src/pixscale.js (data.js feet are in full-size pixels; sprites.js scales them).
Usage: python3 tools/pixelize.py /path/to/Drowned-Light"""
import sys, os, glob, json
from PIL import Image, ImageEnhance, ImageFilter

SRC = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "../Drowned-Light", "assets/sprites/")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
ART = os.path.join(os.path.dirname(__file__), "..", "art")
KNIGHT_H, FOE_H, BOSS_H = 42, 36, 56
VIOLET = {"chain-reaper"}  # his purple turns neon magenta at 1.35
CRIMSON = {"deadly-rose", "pike-warden", "rose-paladin", "bloodsworn", "bloodsworn-f2", "bloodsworn-f3", "cinderbrand", "flame-bastion"}
# the frame whose height sets each folder's scale
REF = {"jade-breaker": "side/idle1", "flame-bastion": "side/idle1", "mother-wyvern": "side/fly1"}
# The later levels' bosses (2026-11-24): drowned/<folder> here, but their main-game frames live elsewhere; height in pixel px
BOSSES = {"drowned-colossus": ("colossus", 64), "mother-wyvern": ("wyvern-mother", 70), "crucible-wyrm": ("mines-bosses/wyrm", 66),
           "starved-bell": ("starved-bell", 58), "deadly-rose": ("deadly-rose", 74)}

def pixelize(im, scale, colors=10, outline=(14, 10, 18), sat=1.35, bright=1.1):
    w, h = im.size; nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = im.resize((nw, nh), Image.LANCZOS)
    a = small.split()[3].point(lambda v: 255 if v > 120 else 0)
    rgb = small.convert("RGB").filter(ImageFilter.UnsharpMask(1, 120, 2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.3); rgb = ImageEnhance.Color(rgb).enhance(sat); rgb = ImageEnhance.Brightness(rgb).enhance(bright)
    tmp = Image.new("RGB", rgb.size); tmp.paste(rgb, (0, 0), a)
    q = tmp.quantize(colors=colors + 1, method=Image.Quantize.MAXCOVERAGE, kmeans=4, dither=Image.Dither.NONE).convert("RGB")
    out = Image.new("RGBA", (nw + 2, nh + 2), (0, 0, 0, 0))
    body = Image.new("RGBA", (nw, nh), (0, 0, 0, 0)); body.paste(q, (0, 0), a)
    A = Image.new("L", out.size, 0); A.paste(a, (1, 1))
    out.paste(Image.new("RGBA", out.size, outline + (255,)), (0, 0), A.filter(ImageFilter.MaxFilter(3)))
    out.paste(body, (1, 1), a)
    return out

scales, atlas = {}, {}

def pack(folder_dir):
    """Pack every frame of a folder into one atlas.png (a shelf per row), so a publish holds one file per character."""
    fs = sorted(f for f in glob.glob(folder_dir + "/**/*.png", recursive=True) if not f.endswith("/atlas.png"))
    ims = [(os.path.relpath(f, folder_dir)[:-4], Image.open(f).convert("RGBA")) for f in fs]
    W = 512; x = y = row = 0; rects = {}
    for rel, im in ims:
        if x + im.width > W: x, y, row = 0, y + row + 1, 0
        rects[rel] = [x, y, im.width, im.height]; x += im.width + 1; row = max(row, im.height)
    sheet = Image.new("RGBA", (W, y + row), (0, 0, 0, 0))
    for rel, im in ims: sheet.paste(im, tuple(rects[rel][:2]))
    sheet.save(folder_dir + "/atlas.png", optimize=True)
    return rects
# The familiars (src/familiars.js): each form's main-game folder and the file px per art px it was cut at (res).
# Shown 1.2 times the size the main game gives them beside a 40 px knight, so the smallest still read as pixel art.
FAMILIARS = {"bone-hound-f0": 4, "bone-hound": 2, "bone-hound-f2": 4, "bone-hound-f3": 4,
             "derek-f0": 4, "derek": 4, "derek-f2": 4, "derek-f3": 4, "kindle": 4,
             "abigail": 4, "abigail-f2": 4, "abigail-f3": 4,
             "fred-f0": 4, "fred-f1": 4, "fred-f2": 4, "fred-f3": 4,
             "wyvern-f0": 4, "wyvern-f1": 4, "wyvern-f2": 4, "wyvern-f3": 4}
FAM_X = 1.2 * KNIGHT_H / 40
def fam_frames(src):
    """Every side-on frame of a familiar: the stills and actions (right, attacks, pour, bless...) and side/*, not the
    front and back views."""
    out = []
    for f in glob.glob(src + "*.png") + glob.glob(src + "side/*.png"):
        rel = os.path.relpath(f, src)
        if rel in ("front.png", "back.png") or rel.startswith(("walkF", "walkB")): continue
        out.append(rel)
    return out
for fam in FAMILIARS: os.makedirs(os.path.join(OUT, "familiars", fam), exist_ok=True)
for group, target in (("knights", KNIGHT_H), ("drowned", FOE_H), ("familiars", None)):
    for folder in sorted(os.listdir(os.path.join(OUT, group))):
        src = SRC + (BOSSES[folder][0] if folder in BOSSES else "drowned/" + folder if group == "drowned" else folder) + "/"
        ref = Image.open(src + REF.get(folder, "side/walk1") + ".png").convert("RGBA")
        bb = ref.getbbox(); hgt = bb[3] - bb[1]
        s = (BOSS_H if folder == "champion" else BOSSES[folder][1] if folder in BOSSES else target) / hgt if target else FAM_X / FAMILIARS[folder]
        scales[group + "/" + folder] = round(s, 4)
        sat = 1.0 if group == "familiars" else 0.95 if folder in CRIMSON else 1.0 if folder in VIOLET else 1.35
        art = os.path.join(ART, group, folder) + "/"  # frames cut from the side-view sheets (tools/cut_side.py)
        rels = {os.path.relpath(f, os.path.join(OUT, group, folder)) for f in glob.glob(os.path.join(OUT, group, folder, "**/*.png"), recursive=True) if not f.endswith("/atlas.png")}
        rels |= {os.path.relpath(f, art) for f in glob.glob(art + "**/*.png", recursive=True)}
        if group == "familiars": rels |= set(fam_frames(src))
        for rel in sorted(rels):
            f = os.path.join(OUT, group, folder, rel); os.makedirs(os.path.dirname(f), exist_ok=True)
            pixelize(Image.open(art + rel if os.path.exists(art + rel) else src + rel).convert("RGBA"), s, sat=sat).save(f)
        atlas[group + "/" + folder] = pack(os.path.join(OUT, group, folder))
        print(group, folder, hgt, "->", round(s, 3))
open(os.path.join(os.path.dirname(__file__), "..", "src", "pixscale.js"), "w").write(
    "/* Generated by tools/pixelize.py: each sprite folder's shrink factor (1 px of outline added on every side). */\n"
    '"use strict";\nwindow.DS = window.DS || {};\nDS.PIXSCALE = ' + json.dumps(scales, indent=1) + ";\n"
    "/* each folder's frames packed in assets/<folder>/atlas.png: name -> [x, y, w, h] */\n"
    "DS.ATLAS = " + json.dumps(atlas, separators=(",", ":")) + ";\n")
import runfeet; runfeet.write()
