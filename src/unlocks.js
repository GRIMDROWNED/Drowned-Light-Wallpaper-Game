/* What the player has unlocked (Robert 2026-11-25): knights, familiars, maps and the wallpaper's level.
   - Levels beaten: a count kept in dl-side-beat (levels 1..beat are beaten; a played clear raises it). Old saves start
     from dl-side-best, the furthest level reached, since reaching a level means the one before it was cleared.
   - Knights: the six in DS.KIT_UNLOCK are won by beating that level's boss (10, 20 ... 60); the rest are open from the start.
   - Familiars: chosen after each map's level 5 boss (src/familiars.js keeps them); maps open as a run reaches them (src/maps.js).
   - The wallpaper only shows what is unlocked, on a level already beaten: the one picked in Pause -> Wallpaper
     (dl-side-wall-level), or a random beaten level when set to Roam (-1, the default).
   - Testers (DS.TESTER) can view the game with everything open or everything locked without touching the saved
     progress: Pause -> tester tools -> Unlocks (dl-side-unlock-test = real | all | none). Locking the tester tools
     goes back to the real progress. */
"use strict";
(function (DS) {
  const LAST = 60; // the wallpaper picker offers levels 1-60 (the Sunken King's hall, level 61, has no endless run of its own)
  const getN = (k, d) => { try { const v = parseInt(localStorage.getItem(k), 10); return isNaN(v) ? d : v; } catch (e) { return d; } };
  const setS = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } };
  let beat = getN("dl-side-beat", -1);
  if (beat < 0) { beat = Math.max(0, getN("dl-side-best", 0)); setS("dl-side-beat", beat); }
  let test = (() => { try { return localStorage.getItem("dl-side-unlock-test") || "real"; } catch (e) { return "real"; } })();
  let wallPick = getN("dl-side-wall-level", -1);

  const U = DS.Unlock = {
    MODES: ["real", "all", "none"],
    mode: () => (DS.TESTER && U.MODES.includes(test) ? test : "real"),
    setMode(m) { test = U.MODES.includes(m) ? m : "real"; setS("dl-side-unlock-test", test); },
    // levels beaten (as the game sees them, with a tester view on top)
    beat: () => (U.mode() === "all" ? LAST : U.mode() === "none" ? 0 : beat),
    cleared(n) { if (n + 1 > beat) { beat = n + 1; setS("dl-side-beat", beat); } }, // n: the level index (0-based) just cleared

    // ---------------- knights ----------------
    kitAt: (id) => DS.KIT_UNLOCK[id] || 0, // the level whose boss wins it (0 = open from the start)
    kitOpen: (id) => !!DS.KITS[id] && U.beat() >= U.kitAt(id),
    kits: () => DS.KIT_ORDER.filter(U.kitOpen),
    usableKit: (id) => (U.kitOpen(id) ? id : U.kitOpen("lanternBlade") ? "lanternBlade" : U.kits()[0]),
    // the knight that clearing level index n wins now (null if none, or already won)
    kitFor(n) { const id = DS.KIT_ORDER.find((k) => U.kitAt(k) === n + 1); return id && !U.kitOpen(id) ? id : null; },

    // ---------------- the wallpaper's level ----------------
    LAST,
    wallLevels: () => Array.from({ length: Math.min(U.beat(), LAST) }, (_, i) => i), // level indexes it may run
    wallPick: () => (wallPick >= 0 && wallPick < Math.min(U.beat(), LAST) ? wallPick : -1), // -1 = Roam
    setWallPick(n) { wallPick = n; setS("dl-side-wall-level", n); },
    // the level index the wallpaper runs this time: the picked one, or a random beaten one (level 1 before any are beaten)
    wallLevel() {
      const p = U.wallPick(); if (p >= 0) return p;
      const all = U.wallLevels();
      return all.length ? all[Math.floor(Math.random() * all.length)] : 0;
    },
  };
})(window.DS = window.DS || {});
