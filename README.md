# Drowned Light: Wallpaper Game

A side-on Drowned Light game that doubles as a live wallpaper: plain JavaScript on a canvas, no build step, no npm.
Open `index.html` through any static server, or play it on GitHub Pages.

- **Portrait:** the knight fights on its own through an endless drowned swamp.
- **Landscape:** you take the knight, and a boss waits at the end of the level (the Drowned Sovereign, or a map's own boss on its levels 5 and 10).
- **Wallpaper:** `wallpaper.html` (or `index.html?wallpaper`, or Pause → Wallpaper) hides every button and HUD, swaps in a random knight every 75 s and runs at 30 fps.
  For Lively Wallpaper on Windows, zip `LivelyInfo.json`, `wallpaper.html`, `style.css`, `src/` and `assets/`; on Android, point a web-page live-wallpaper app at the Pages address of `wallpaper.html`.
- All 10 knight kits with their main-game attacks and abilities, 3-hit combos, up-swings, air plunge, double jump, air dash.
- Familiars from the main game fight beside the knight (pick one on the knight screen or in the pause menu): the Bone Hound, Derek, Kindle, Abigail, Fred and David, each growing through its forms as it racks up kills. They are won one at a time: beating the boss of level 5 of each 10-level map (5, 15, 25...) lets you choose one; until then they show as ??? (`dl-side-fam-won` in local storage; Pause → Unlock all familiars, a tester tool). `src/familiars.js`, numbers in `DS.FAMILIARS`.
- **Upgrades and loot:** fallen Drowned drop Gold and materials (Robert's loot icons). Gold plus one material buys ranks in Might, Vitality, Guard, Swiftness, Focus and Lantern, for every knight; ranks 6-10 also take Amethyst (bosses). `src/loot.js`, numbers at its top (`dl-side-wallet`, `dl-side-ranks`).
- **The wallpaper farms:** while it runs, the wallpaper gathers 40% of what its fights drop into a satchel (`dl-side-haul`, capped at `HAUL_CAP`). The next time the game opens, a "While you were away" screen hands it over. The Android and Windows apps load the wallpaper and the game from the same origin, so they share the satchel.
- **Knight screen:** Robert's painted frame (`assets/ui/knight-screen.jpg`, 1672 x 941) with the map badges, the ten knights, an info bar, the familiars, Upgrades and control hints placed on its slots in art pixels (`.ks` parts with `--x --y --w --h` in index.html, styles at the end of style.css). Each knight sits on the frame nearest its colour (`SCREEN_ORDER` in src/ui.js).
- **Map select:** Robert's spiked badges on the knight screen (lantern = the Mire, trident = Reaches, rose = Abyss, crystal = Spires, stone face = Molten Mines, winged skull = Crucible Throne). A map opens once a played run reaches it; the wallpaper starts on a random open map. `src/maps.js`. Art cut by `tools/cut_loot.py`.
- 8 Drowned types and the bosses: the Drowned Sovereign, the Drowned Colossus (level 5), the Mother Wyvern (level 15), the Crucible Wyrm (level 20), the Starved Bell (level 25), The Deadly Rose (level 30), the Seething Seraph (level 35, recoloured violet by `tools/recolor_seraph.py`), the Lord of the Rift Throne (level 40), the Magma Golem (level 45) and the Furnace Hydra (level 50); `src/bosses.js` holds their moves, `DS.bossFor` in `src/data.js` places them. Keyboard + mouse, Xbox pad and touch.
- Boss art: Robert's two side-view move sheets per boss, cut by `tools/cut_boss.py` (3 across, 2 down), colour-matched by `tools/foe_color.py`, then shrunk with the rest.
- Pause menu: Wallpaper, Controls, Journal, Upgrades, familiar pick. **Tester tools** (spawn any enemy, skip to the boss, god mode, hitboxes, arena mode, unlock familiars/maps, free currency, reset upgrades, and the `?level=N` jump) stay hidden until Pause → Tester code → **1045** is entered on that device (`dl-side-tester` in local storage; "Lock tester tools" hides them again). The code is `DS.TESTER_CODE` in `src/data.js`.

Art: Robert's side-view sheets cut by `tools/cut_side.py` into `art/` (full size), shrunk to pixel sprites and packed into one
`atlas.png` per character by `tools/pixelize.py` (familiars straight from the main game's side frames, listed in its `FAMILIARS`). Numbers live in `src/data.js`.
