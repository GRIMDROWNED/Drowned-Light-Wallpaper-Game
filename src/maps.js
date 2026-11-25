/* The map select (Robert 2026-11-24): one spiked badge per 10-level map, from Robert's emblem sheet (tools/cut_loot.py ->
   assets/maps). Lantern = the Mire, trident = the Reaches, rose = the Abyss, crystal = the Spires, stone face = the
   Molten Mines, winged skull = the Crucible Throne. A map opens once a played run reaches its first level
   (dl-side-best); the chosen map (dl-side-map) is where a run starts. ?level=N in the address still wins for testers.
   The wallpaper starts on a random open map, so farming moves around the maps you have reached. */
"use strict";
(function (DS) {
  const MAPS = DS.MAPS = [
    { id: "mire", name: "The Mire", c: "230,170,80" , ring: [575, 193], em: [37, 40] },
    { id: "reaches", name: "Drowned Reaches", short: "Reaches", c: "90,190,180" , ring: [750, 193], em: [37, 38] },
    { id: "abyss", name: "The Abyss", c: "220,70,80" , ring: [931, 190], em: [40, 38] },
    { id: "spires", name: "Abyssal Spires", short: "Spires", c: "170,120,240" , ring: [1108, 193], em: [35, 38] },
    { id: "mines", name: "Molten Mines", c: "200,190,150" , ring: [1283, 195], em: [38, 42] },
    { id: "crucible", name: "Crucible Throne", c: "220,150,190" , ring: [1455, 195], em: [40, 35] },
  ];
  // ring: the centre of this map's spiked ring in Robert's knight-screen art (art px); em: the centre of the badge's own
  // emblem circle in its picture (px), so the emblem sits dead centre in the ring (src/ui.js syncMaps)
  const LEVELS = 10;
  const get = (k, d) => { try { const v = parseInt(localStorage.getItem(k), 10); return isNaN(v) ? d : v; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } };
  const fromUrl = DS.TESTER && /[?&]level=/.test(location.search); // the ?level= jump is a tester tool (src/data.js)
  let best = get("dl-side-best", 0), pick = get("dl-side-map", 0);

  const M = DS.Maps = {
    best: () => best,
    open: (m) => m === 0 || best >= m * LEVELS,
    picked: () => pick,
    reached(n) { if (n > best) { best = n; set("dl-side-best", n); } },
    pick(m) {
      if (!M.open(m)) return false;
      pick = m; set("dl-side-map", m);
      if (!fromUrl) DS.START_LEVEL = m * LEVELS;
      return true;
    },
    unlockAll() { best = Math.max(best, (MAPS.length - 1) * LEVELS); set("dl-side-best", best); },
    badge: (m) => `assets/maps/${MAPS[m].id}.png?v=${DS.VERSION}`,
    // the wallpaper roams: a random open map each time it starts
    wallStart() {
      if (fromUrl) return;
      const open = MAPS.map((_, i) => i).filter(M.open);
      DS.START_LEVEL = open[Math.floor(Math.random() * open.length)] * LEVELS;
    },
  };
  if (!fromUrl && M.open(pick)) DS.START_LEVEL = pick * LEVELS;
})(window.DS = window.DS || {});
