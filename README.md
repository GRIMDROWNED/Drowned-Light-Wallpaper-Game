# Drowned Light: Wallpaper Game

A side-on Drowned Light game that doubles as a live wallpaper: plain JavaScript on a canvas, no build step, no npm.
Open `index.html` through any static server, or play it on GitHub Pages.

- **Portrait:** the knight fights on its own through an endless drowned swamp.
- **Landscape:** you take the knight, and the Drowned Sovereign waits ahead.
- **Wallpaper:** `wallpaper.html` (or `index.html?wallpaper`, or Pause → Wallpaper) hides every button and HUD, swaps in a random knight every 75 s and runs at 30 fps.
  For Lively Wallpaper on Windows, zip `LivelyInfo.json`, `wallpaper.html`, `style.css`, `src/` and `assets/`; on Android, point a web-page live-wallpaper app at the Pages address of `wallpaper.html`.
- All 10 knight kits with their main-game attacks and abilities, 3-hit combos, up-swings, air plunge, double jump, air dash.
- Familiars from the main game fight beside the knight (pick one on the knight screen or in the pause menu): the Bone Hound, Derek, Kindle, Abigail, Fred and David, each growing through its forms as it racks up kills. They are won one at a time: beating the boss of level 5 of each 10-level map (5, 15, 25...) lets you choose one; until then they show as ??? (`dl-side-fam-won` in local storage; Pause → Unlock all familiars for testing). `src/familiars.js`, numbers in `DS.FAMILIARS`.
- 8 Drowned types (the Drowned Sovereign as a boss); keyboard + mouse, Xbox pad and touch.
- Pause menu: spawn any enemy, skip to the boss, god mode, hitboxes, arena mode with waves.

Art: Robert's side-view sheets cut by `tools/cut_side.py` into `art/` (full size), shrunk to pixel sprites and packed into one
`atlas.png` per character by `tools/pixelize.py` (familiars straight from the main game's side frames, listed in its `FAMILIARS`). Numbers live in `src/data.js`.
