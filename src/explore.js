/* Exploration (Robert 2026-11-20): Hollow Mist, the lantern, traps and pickups that pull the knight off the floor path.
   - Stretches of each level lie under Hollow Mist: you only see what your lantern lights. The lantern drains only in
     mist; at empty the mist starts eating your health. A Mist Well deep in a patch, once lit, burns that patch away
     for good and becomes your checkpoint.
   - Traps (spike pits, snare roots, hex runes) are hidden in mist until light touches them. They hurt the Drowned too.
   - In mist the Drowned can't see you past your light: the first blow on one that hasn't noticed you lands UNSEEN.
   - Pickups: lantern oil, heart embers (the only healing), echo flares (thrown light), relics (boosts until you die or
     the map changes), Drowned pages (3 per level, kept for good, read in the Journal) and kit sigils (one per level
     per knight, kept for good: each raises that knight's kit level, so it grows as the levels get harder).
   Only in a played level (landscape): the endless auto-fight and the wallpaper have none of it. */
"use strict";
(function (DS) {
  const G = DS.G, Wd = DS.World, I = DS.Input;
  const TAU = Math.PI * 2;
  const fx = () => DS.fx;

  const LIGHT = { max: 100, drain: 3.5, starve: 4, r0: 70, r1: 110, oil: 35, wellOil: 40, ember: 0.3 };
  const FLARE = { start: 1, max: 3, burn: 5, r: 380 };
  const KITLV = { max: 20, dmg: 0.05, hp: 0.04, cdEvery: 5, cd: 0.1 };
  const RELICS = {
    wick:   { name: "Bright Wick", text: "Your light reaches 35% farther and burns 30% slower.", c: "#ffd27a" },
    heart:  { name: "Ember Heart", text: "+25% health.", c: "#ff7a6a" },
    stone:  { name: "Drowned Whetstone", text: "+15% damage.", c: "#cfe6e8" },
    hood:   { name: "Mistwalker's Hood", text: "Unseen strikes hit x2.2 instead of x1.6, and the Drowned notice you later.", c: "#9fb4bb" },
    greave: { name: "Swift Greaves", text: "+12% speed.", c: "#7fe3d4" },
    flask:  { name: "Deep Flask", text: "Oil fills 50% more, and you carry one more flare.", c: "#e6a040" },
  };
  // Drowned pages: one line of the swamp's story each, found 3 a level, kept for good.
  const LORE = [
    "The first lantern was lit from the last ember of the sun. We swore it would never go out.",
    "The water rose in a single night. By morning the bell tower was an island, then a reef.",
    "The Drowned do not hate us. They only want to be warm again, and they have forgotten how.",
    "Mist came after the flood. It is not water. It drinks light the way the marsh drinks boots.",
    "Brother Aldric walked into the mist with no lantern to prove it was only fog. We heard him for an hour.",
    "The Mist Wells were dug by the old order. Light one and the mist remembers it is afraid.",
    "Spikes in the mud are ours, not theirs. We set them for the Drowned and forgot where.",
    "Roots in the mist grab anything warm. Cut free, or wait. Waiting is worse.",
    "The violet runes were carved by the Hexbearers. They feed on light and give back sickness.",
    "A knight's kit remembers every battle. Sigils of ember wake that memory in the steel.",
    "The Sovereign was a king once. He drowned holding his crown above the water.",
    "Oil from the marsh lamps burns blue for a heartbeat, then gold. The blue is the mist leaving.",
    "If you hear footsteps in the mist that stop when you stop, light a flare. Do not wait.",
    "The chapel bell still rings at low tide. Nobody pulls the rope.",
    "We buried the first Drowned with candles. In the morning the graves were open and the candles lit.",
    "My lantern is nearly dry. I am writing by its last light so the next knight knows the way: keep to the high planks.",
    "The Drowned cannot see through the mist any better than we can. That is the only mercy in it.",
    "Embers of the heart: the old healers swore a knight could live a week on one if the fire was true.",
    "The relic-keepers hid their treasures where only the brave or the lost would find them.",
    "Something larger moves beneath the Mire. The water bulges where it passes.",
    "Ten knights rode into the swamp. Ten kits came back, carried by the Drowned, and laid at our gate.",
    "The sky over the Mire is never black. There is always a green light under the clouds.",
    "Flares were a gift from the Arbalists. Thrown high, they show the truth for a breath.",
    "I found my own name carved on a grave stone. The date was tomorrow.",
    "The Sunken King sleeps at the bottom of everything. Every Drowned is a dream he is having.",
    "Do not rest in the mist. The mist is patient. It counts your breaths.",
    "Lit wells stay lit. That is the whole of our hope: what we win, we keep.",
    "A page of a page: the scribe who wrote these drowned writing them. Keep reading.",
    "The light is not a weapon. It is a promise. The Drowned remember promises.",
    "When every page is gathered, read them in order. The swamp is telling you how it ends.",
  ];

  const E = DS.Explore = { on: false, light: LIGHT.max, flares: FLARE.start, relics: [], patches: [], items: [], traps: [], wells: [], thrown: [], note: null };
  let mistCv = null, mctx = null;

  // ---------------- saved for good: pages and kit levels ----------------
  function load(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  let pages = load("dl-side-pages", []);      // ["level:i", ...]
  let sigils = load("dl-side-kitlv", {});     // { kitId: [level, ...] }
  const kitLevel = (id) => Math.min(KITLV.max, (sigils[id] || []).length);
  E.kitLevel = kitLevel;
  E.pages = () => pages.slice();
  E.pageText = (key) => { const [l, i] = key.split(":").map(Number); return LORE[(l * 3 + i) % LORE.length]; };

  // ---------------- what the kit level and relics change (read by game.js / kits.js) ----------------
  const has = (r) => E.relics.includes(r);
  E.dmgMult = (p) => (1 + kitLevel(p.kitId) * KITLV.dmg) * (has("stone") ? 1.15 : 1);
  E.hpMult = (kitId) => (1 + kitLevel(kitId) * KITLV.hp) * (has("heart") ? 1.25 : 1);
  E.speedMult = () => (has("greave") ? 1.12 : 1);
  E.cdMult = (p) => Math.max(0.5, 1 - Math.floor(kitLevel(p.kitId) / KITLV.cdEvery) * KITLV.cd);
  const radius = () => (LIGHT.r0 + LIGHT.r1 * E.light / LIGHT.max) * (has("wick") ? 1.35 : 1);
  const flareMax = () => FLARE.max + (has("flask") ? 1 : 0);

  // ---------------- building a level's mist and pickups ----------------
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const floorAt = (x) => { // the floor or a stone's top under x (never a plank: wells and floor pickups sit on the ground)
    let y = Wd.FLOOR;
    for (const s of Wd.solids) if (s.kind === "stone" && x > s.x && x < s.x + s.w && s.y < y) y = s.y;
    return y;
  };
  const clearFloor = (x) => !Wd.solidAt(x, Wd.FLOOR - 5) && !Wd.solidAt(x - 30, Wd.FLOOR - 5) && !Wd.solidAt(x + 30, Wd.FLOOR - 5);

  E.clear = function () { E.on = false; E.scenic = false; E.genX = 0; E.patches = []; E.items = []; E.traps = []; E.wells = []; E.thrown = []; syncFlareBtn(); };
  E.reset = function () { E.relics = []; E.flares = FLARE.start; E.light = LIGHT.max; }; // a fresh run
  E.build = function (n, bossX) {
    E.clear();
    if (!bossX) return; // the endless run: none of it
    E.on = true; E.light = LIGHT.max;
    if (n % 10 === 0) E.relics = []; // relics last until the map changes
    const r = rng(1000 + n * 7919 + 13), lo = 1400, hi = bossX - 300;
    // the mist: 2 patches on level 1, up to 4 later, never on the opening stretch or the boss clearing
    const want = Math.min(4, 2 + Math.floor(n / 3));
    for (let tries = 0; E.patches.length < want && tries < 60; tries++) {
      const len = 800 + r() * 500, a = lo + r() * Math.max(1, hi - lo - len), b = a + len;
      if (b > hi || E.patches.some((q) => a < q.b + 600 && b > q.a - 600)) continue;
      E.patches.push({ a, b, fade: 1, cleared: false });
    }
    E.patches.sort((p, q) => p.a - q.a);
    // places to put things: high planks, the very top planks, stone tops, the floor
    const high = [], top = [];
    for (const p of Wd.plats) if (p.x > lo - 600 && p.x < hi) (p.y <= 560 ? top : p.y <= 660 ? high : []).push({ x: p.x + p.w * (0.3 + r() * 0.4), y: p.y });
    for (const s of Wd.solids) if (s.kind === "stone" && s.x > lo - 600 && s.x < hi && s.h >= 80) high.push({ x: s.x + s.w / 2, y: s.y });
    const inMist = (x) => E.patches.some((q) => x > q.a && x < q.b);
    const take = (list, pred) => { const i = list.findIndex(pred || (() => true)); return i < 0 ? null : list.splice(i, 1)[0]; };
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuffle(high); shuffle(top);
    const item = (kind, x, y, extra) => { // never two pickups on top of each other: slide along until there is room
      for (let k = 0; k < 8 && E.items.some((o) => Math.abs(o.x - x) < 60 && (y == null || Math.abs(o.y - y) < 40)); k++) x += 70;
      if (y != null && !Wd.groundAt(x, y)) y = null; // slid off its plank: down on the ground
      E.items.push(Object.assign({ kind, x, y: y == null ? floorAt(x) : y, t: r() * 6 }, extra));
    };
    const trap = (x, kinds) => {
      if (!clearFloor(x) || E.traps.some((t) => Math.abs(t.x - x) < 140)) return;
      const kind = kinds[r() * kinds.length | 0];
      E.traps.push({ kind, x, y: Wd.FLOOR, w: kind === "spikes" ? 70 : 60, cd: 0, seen: !inMist(x), t: 0 });
    };
    E.patches.forEach((q, qi) => {
      const L = q.b - q.a;
      const wx = q.a + L * 0.62;
      E.wells.push({ x: wx, y: floorAt(wx), patch: q, charge: 0, lit: false });
      item("oil", q.a + 90);                    // a drop of oil just inside the edge
      if (qi % 2 === 0) item("flare", q.a - 160); // a flare waiting before every other patch
      const traps = 2 + (n >= 3 ? 1 : 0) + (n >= 7 ? 1 : 0);
      for (let k = 0; k < traps * 3 && E.traps.filter((t) => t.x > q.a && t.x < q.b).length < traps; k++) {
        const x = q.a + 150 + r() * (L - 250);
        if (Math.abs(x - wx) > 90) trap(x, n < 2 ? ["spikes", "snare"] : ["spikes", "snare", "rune"]);
      }
      // the prize at the far end of the mist
      const deep = q.b - 110;
      if (qi === 0) item("relic", deep);
      else if (qi === 1) item("ember", deep);
      else item("oil", deep);
    });
    // a few visible traps out in the open (to learn them), from level 2 on
    if (n >= 1) for (let x = lo; x < hi; x += 1100 + r() * 700) if (!inMist(x)) trap(x, ["spikes", "snare"]);
    // the kit sigil: the highest plank, or deep in the second patch
    const kit = G.player ? G.player.kitId : G.kit;
    if (!(sigils[kit] || []).includes(n) && kitLevel(kit) < KITLV.max) {
      const s = take(top) || take(high);
      if (s) item("sigil", s.x, s.y); else if (E.patches[1]) item("sigil", E.patches[1].b - 200); else item("sigil", hi - 200);
    }
    // three pages: one deep in mist, two up high
    for (let i = 0; i < 3; i++) {
      if (pages.includes(n + ":" + i)) continue;
      const q = E.patches[i % E.patches.length];
      const s = i === 0 && q ? { x: q.a + (q.b - q.a) * 0.85 } : take(top) || take(high) || (q ? { x: q.a + (q.b - q.a) * (0.3 + 0.1 * i) } : { x: lo + i * 500 });
      item("page", s.x, s.y, { key: n + ":" + i });
    }
    // embers, oil and a flare up on the planks
    for (const kind of ["ember", "ember", "oil", "oil", "flare"]) { const s = take(high); if (s) item(kind, s.x, s.y); }
    if (n >= 2) { const s = take(high); if (s) item("ember", s.x, s.y); }
    syncFlareBtn();
  };
  // The wallpaper and the portrait auto-fight (Robert 2026-11-23: "add some of these features to the wallpaper"): the
  // endless run gets mist banks, Mist Wells the knight lights as it passes, glowing oil and embers, flares it throws
  // into the mist and traps that only catch the Drowned. Looks only: no lantern drain, no pages, sigils or relics.
  E.startScenic = function (n) { E.clear(); E.on = true; E.scenic = true; E.genX = 1600; E.lvl = n; E.rng = rng(4242 + n * 31); E.light = LIGHT.max; E.flares = 2; };
  E.extendScenic = function (toX) {
    if (!E.on) return;
    if (!E.scenic) { E.scenic = true; E.rng = E.rng || rng(777); E.genX = Math.max(E.genX || 0, G.player.x + 1800); }
    const r = E.rng;
    while (E.genX < toX) {
      const x0 = E.genX, seg = 1800 + r() * 1400;
      E.genX += seg;
      if (r() < 0.6) { // a bank of mist with its well
        const len = 700 + r() * 500, a = x0 + 200, b = a + len, q = { a, b, fade: 1, cleared: false };
        E.patches.push(q);
        const wx = a + len * 0.62;
        E.wells.push({ x: wx, y: floorAt(wx), patch: q, charge: 0, lit: false });
        for (let k = 0; k < 2; k++) { const x = a + 150 + r() * (len - 250); if (Math.abs(x - wx) > 90 && clearFloor(x) && !E.traps.some((t) => Math.abs(t.x - x) < 140)) { const kind = ["spikes", "snare", "rune"][r() * 3 | 0]; E.traps.push({ kind, x, y: Wd.FLOOR, w: kind === "spikes" ? 70 : 60, cd: 0, seen: false, t: 0 }); } }
        E.items.push({ kind: r() < 0.5 ? "oil" : "ember", x: b - 120, y: floorAt(b - 120), t: r() * 6 });
        if (r() < 0.6) E.items.push({ kind: "flare", x: a - 180, y: floorAt(a - 180), t: r() * 6 });
      }
      // glowing pickups up on the planks of this stretch
      let n = 0;
      for (const pl of Wd.plats) if (pl.x > x0 && pl.x < x0 + seg && pl.y <= 660 && n < 2 && r() < 0.5) { n++; E.items.push({ kind: ["oil", "ember", "flare"][r() * 3 | 0], x: pl.x + pl.w / 2, y: pl.y, t: r() * 6 }); }
    }
  };
  E.prune = function (beforeX) { // forget what the endless run left far behind
    E.patches = E.patches.filter((q) => q.b > beforeX); E.wells = E.wells.filter((w) => w.x > beforeX);
    E.items = E.items.filter((i) => i.x > beforeX); E.traps = E.traps.filter((t) => t.x > beforeX);
  };
  E.onDeath = function () { // relics are lost; the lantern refills
    if (E.relics.length) fx().text(G.player.x, G.player.y - 120, "Relics lost to the mist", "#c0a0ff", 14);
    E.relics = []; E.light = LIGHT.max; E.flares = Math.max(E.flares, FLARE.start); syncFlareBtn();
  };

  // ---------------- the mist and the knight ----------------
  function patchAt(x) { for (const q of E.patches) if (!q.cleared && x > q.a && x < q.b) return q; return null; }
  E.inMist = (x) => !!patchAt(x);
  E.hidden = function (e) { // in mist the Drowned can't see the knight past its light
    if (!E.on || e.alerted || e.d.boss) return false;
    const p = G.player;
    if (!patchAt(p.x)) return false;
    const r = radius() * (has("hood") ? 0.55 : 0.8);
    if (Math.hypot(e.x - p.x, e.y - p.y) < r) { e.alerted = true; return false; }
    return true;
  };
  E.strike = function (e, opt) { // the first blow on a Drowned that hasn't noticed you
    if (!E.on || opt.trap) return 1;
    const unseen = !e.alerted && !e.d.boss && !e.d.dummy && patchAt(G.player.x);
    e.alerted = true;
    if (!unseen) return 1;
    fx().text(e.x, e.y - e.h - 24, "UNSEEN", "#d0e8ff", 13);
    return has("hood") ? 2.2 : 1.6;
  };

  function lights() { // world-space light sources that cut the mist: [x, y, r]
    const p = G.player, out = [[p.x, p.y - p.h * 0.55, radius()]];
    for (const f of E.thrown) out.push([f.x, f.y - 10, f.landed ? FLARE.r * Math.min(1, f.burn / 1.5, (FLARE.burn - f.burn + 0.3) * 3) : 90]);
    for (const w of E.wells) if (w.lit || w.charge > 0) out.push([w.x, w.y - 30, w.lit ? 260 : 60 + 120 * w.charge]);
    for (const it of E.items) if (it.kind === "ember" || it.kind === "sigil") out.push([it.x, it.y - 18, 34]);
    return out;
  }

  E.update = function (dt) {
    if (!E.on) return;
    const p = G.player;
    // the lantern drains in mist (not while the knight fights on its own)
    const q = patchAt(p.x);
    if (q && !p.dead && !G.auto && !E.scenic) {
      E.light = Math.max(0, E.light - LIGHT.drain * (has("wick") ? 0.7 : 1) * dt);
      if (E.light <= 0 && !G.god) { // the mist eats the knight
        p.hp -= LIGHT.starve * dt;
        if (Math.random() < dt * 3) fx().text(p.x, p.y - p.h - 6, "the mist", "#8a9a9a", 11);
        if (p.hp <= 0) { p.hp = 0; p.dead = 0.001; p.lastHit = "Hollow Mist"; fx().text(p.x, p.y - p.h - 30, "Fell to the Hollow Mist", "#ff9a9a", 14); }
      }
    }
    for (const qq of E.patches) if (qq.cleared && qq.fade > 0) qq.fade = Math.max(0, qq.fade - dt / 1.5);
    // light reveals traps for good
    const ls = lights();
    for (const t of E.traps) {
      t.cd = Math.max(0, t.cd - dt); t.fired = Math.max(0, (t.fired || 0) - dt); t.t += dt;
      if (!t.seen && (!patchAt(t.x) || ls.some((l) => Math.hypot(l[0] - t.x, l[1] - t.y) < l[2] * 0.85))) t.seen = true;
    }
    if (!p.dead) {
      traps(p, dt);
      wells(p, dt);
      pickups(p);
      if (p.snareT > 0) { p.snareT -= dt; p.x = p.snareX; p.vx = 0; if (I.p.jump || I.p.dash) { p.snareT -= 0.25; fx().spark(p.x, p.y - 10, "#8a6a40", 3); } }
      if (I.p.flare) throwFlare(p);
      if (G.auto) { // the knight on its own throws a flare ahead into a bank of mist
        const q2 = patchAt(p.x); // half the time, once well inside, so the mist is seen first
        if (q2 && !q2.flared && p.x > q2.a + 260) { q2.flared = true; if (E.flares > 0 && Math.random() < 0.5) throwFlare(p); }
      }
    }
    for (const f of E.thrown) {
      if (!f.landed) {
        f.vy += 1400 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        if (Wd.solidAt(f.x, f.y)) { f.vx = -f.vx * 0.3; f.x += f.vx * dt * 2; }
        const g = Wd.surfaceBelow(f.x, f.y - 20);
        if (f.vy > 0 && f.y >= g) { f.y = g; f.landed = true; f.burn = FLARE.burn; fx().ring(f.x, f.y - 10, "rgba(160,220,255,0.8)"); }
      } else f.burn -= dt;
    }
    E.thrown = E.thrown.filter((f) => !f.landed || f.burn > 0);
    for (const it of E.items) it.t += dt;
    if (E.note) { E.note.t += dt; if (E.note.t > 6) E.note = null; }
  };

  function throwFlare(p) {
    if (E.flares <= 0) { fx().text(p.x, p.y - p.h - 8, "no flares", "#8a9aa2", 11); return; }
    E.flares--; syncFlareBtn();
    E.thrown.push({ x: p.x + p.dir * 10, y: p.y - p.h * 0.7, vx: p.dir * 520 + p.vx * 0.3, vy: -480, landed: false, burn: 0 });
  }

  function traps(p, dt) {
    for (const t of E.traps) {
      if (t.cd > 0) continue;
      const on = (o) => o.onGround && Math.abs(o.x - t.x) < t.w / 2 && Math.abs(o.y - t.y) < 4;
      if (on(p) && !E.scenic) spring(t, p, null);
      else for (const e of G.foes) if (!e.dead && !e.d.boss && !e.d.dummy && e.spawnT <= 0 && on(e)) { spring(t, null, e); break; }
    }
  }
  function spring(t, p, e) {
    t.seen = true; t.fired = 0.35;
    const lv = G.level;
    if (t.kind === "spikes") {
      t.cd = 1.4;
      if (p) DS.hurtPlayer(14 + lv * 2, null, "spike pit", t.x - (p.dir || 1) * 30);
      else DS.hitFoe(e, { dmg: 40, noMult: true, kbY: 380, kb: 0, noHeat: true, hitstop: 0, color: "#d8d8d8", trap: true });
      fx().spark(t.x, t.y - 8, "#cfd8dc", 8);
    } else if (t.kind === "snare") {
      t.cd = 3;
      if (p) { p.snareT = 1.1; p.snareX = p.x; p.atk = null; fx().text(p.x, p.y - p.h - 10, "SNARED", "#c8a070", 13); }
      else { e.root = Math.max(e.root || 0, 3); fx().text(e.x, e.y - e.h - 10, "SNARED", "#c8a070", 12); }
    } else { // hex rune
      t.cd = 4;
      if (p) { E.light = Math.max(0, E.light - 35); DS.hurtPlayer(6 + lv, null, "hex rune", t.x); fx().text(p.x, p.y - p.h - 22, "your light dims", "#c090ff", 12); }
      else DS.hitFoe(e, { dmg: 20, noMult: true, chill: 3, kb: 0, noHeat: true, hitstop: 0, color: "#c090ff", trap: true });
      fx().ring(t.x, t.y - 6, "rgba(190,120,255,0.8)");
    }
  }

  function wells(p, dt) {
    for (const w of E.wells) {
      if (w.lit) continue;
      const near = Math.abs(p.x - w.x) < (E.scenic ? 70 : 46) && Math.abs(p.y - w.y) < (E.scenic ? 200 : 30);
      w.charge = near ? Math.min(1, w.charge + dt / (E.scenic ? 0.5 : 1.2)) : Math.max(0, w.charge - dt * (E.scenic ? 0.2 : 1));
      if (w.charge >= 1) {
        w.lit = true; w.patch.cleared = true;
        E.light = Math.min(LIGHT.max, E.light + LIGHT.wellOil);
        G.checkpoint = Math.max(G.checkpoint, w.x - 60);
        if (!E.scenic) G.banner = { txt: "Mist Well lit", t: 0 };
        if (!E.scenic) note("The mist burns away for good. You will wake here if you fall.");
        fx().ring(w.x, w.y - 30, "rgba(255,210,120,0.9)"); fx().shake(4);
      }
    }
  }

  function pickups(p) {
    for (const it of E.items) {
      if (it.got || Math.abs(p.x - it.x) > 28 || p.y < it.y - 44 || p.y - p.h > it.y + 6) continue;
      if (it.kind === "ember" && p.hp >= p.max) continue; // leave it for later
      if (it.kind === "oil" && E.light >= LIGHT.max) continue;
      if (it.kind === "flare" && E.flares >= flareMax()) continue;
      it.got = true;
      const say = (t, c) => fx().text(it.x, it.y - 40, t, c, 14);
      if (it.kind === "oil") { E.light = Math.min(LIGHT.max, E.light + LIGHT.oil * (has("flask") ? 1.5 : 1)); say("+ lantern oil", "#ffc060"); }
      else if (it.kind === "ember") { const h = Math.round(p.max * LIGHT.ember); p.hp = Math.min(p.max, p.hp + h); say("+" + h, "#ff8a7a"); }
      else if (it.kind === "flare") { E.flares++; syncFlareBtn(); say("+ echo flare", "#a0dcff"); }
      else if (it.kind === "relic") {
        const left = Object.keys(RELICS).filter((k) => !has(k));
        if (left.length) {
          const k = left[Math.floor(Math.random() * left.length)], R = RELICS[k];
          const hp0 = p.max; E.relics.push(k);
          if (k === "heart") { p.max = Math.round(p.max * 1.25); p.hp += p.max - hp0; }
          if (k === "flask") { E.flares++; syncFlareBtn(); }
          G.banner = { txt: R.name, t: 0 }; note(R.text);
        } else { E.light = LIGHT.max; say("the cache is empty: oil", "#ffc060"); }
      } else if (it.kind === "page") {
        if (!pages.includes(it.key)) { pages.push(it.key); save("dl-side-pages", pages); }
        const here = pages.filter((k) => k.split(":")[0] === String(G.level)).length;
        G.banner = { txt: "Drowned page " + here + " / 3", t: 0 }; note("“" + E.pageText(it.key) + "”");
      } else if (it.kind === "sigil") {
        const id = p.kitId, list = sigils[id] = sigils[id] || [];
        if (!list.includes(G.level)) list.push(G.level);
        save("dl-side-kitlv", sigils);
        const lv = kitLevel(id), hp0 = p.max;
        p.max = Math.round(DS.PHYS.hp * (p.k.hpMult || 1) * E.hpMult(id)); p.hp = Math.min(p.max, p.hp + (p.max - hp0) + 20);
        G.banner = { txt: p.k.name + " reaches kit level " + lv, t: 0 };
        note(lv % KITLV.cdEvery === 0 ? "+5% damage, +4% health, and " + p.k.ability.name + " comes back 10% sooner." : "+5% damage and +4% health for this knight, for good.");
        fx().ring(p.x, p.y - p.h / 2, "rgba(255,200,120,0.9)");
      }
      fx().spark(it.x, it.y - 18, "#fff0c0", 8);
    }
    E.items = E.items.filter((it) => !it.got);
  }
  function note(txt) { E.note = { txt, t: 0 }; }

  function syncFlareBtn() { document.body.classList.toggle("flares", E.on && E.flares > 0); }

  // ---------------- drawing ----------------
  // pickups, wells and traps in world units on the low-res canvas (the caller sets the 0.5 transform); placeholders
  // drawn in code until Robert's art comes back (prompts: art-prompts/side-view/pickup-prompts.md).
  function glow(g, x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  E.drawWorld = function (g) {
    if (!E.on) return;
    for (const w of E.wells) drawWell(g, w);
    for (const t of E.traps) drawTrap(g, t);
    for (const it of E.items) drawItem(g, it);
    for (const f of E.thrown) {
      glow(g, f.x, f.y - 8, f.landed ? 60 : 24, "160,220,255", 0.6);
      g.fillStyle = "#e8f8ff"; g.fillRect(f.x - 3, f.y - 10, 6, 8);
    }
  };
  function drawItem(g, it) {
    const b = Math.sin(it.t * 2.4) * 4, x = Math.round(it.x), y = Math.round(it.y - 22 + b);
    const box = (c, x0, y0, w, h) => { g.fillStyle = c; g.fillRect(x0, y0, w, h); };
    if (it.kind === "oil") {
      glow(g, x, y, 26, "255,190,90", 0.35);
      box("#2a1a10", x - 7, y - 9, 14, 18); box("#d08a30", x - 5, y - 5, 10, 12); box("#ffd27a", x - 3, y - 3, 3, 6); box("#5a4030", x - 3, y - 13, 6, 5);
    } else if (it.kind === "ember") {
      glow(g, x, y, 30, "255,90,70", 0.5);
      box("#601010", x - 9, y - 6, 18, 10); box("#601010", x - 6, y + 4, 12, 4); box("#601010", x - 3, y + 8, 6, 3);
      box("#e04030", x - 7, y - 5, 6, 8); box("#e04030", x + 1, y - 5, 6, 8); box("#e04030", x - 5, y + 3, 10, 3); box("#ffb080", x - 5, y - 3, 3, 3);
    } else if (it.kind === "flare") {
      glow(g, x, y, 26, "140,210,255", 0.4);
      box("#203040", x - 4, y - 12, 8, 22); box("#8fd0ff", x - 2, y - 10, 4, 14); box("#ffffff", x - 1, y - 14, 2, 4);
    } else if (it.kind === "relic") {
      glow(g, x, y, 36, "255,210,120", 0.45);
      box("#2a1a0e", x - 15, y - 10, 30, 22); box("#7a5028", x - 13, y - 8, 26, 18); box("#4a3018", x - 13, y - 2, 26, 3); box("#ffd27a", x - 3, y - 3, 6, 6);
    } else if (it.kind === "page") {
      glow(g, x, y, 24, "220,230,210", 0.3);
      g.save(); g.translate(x, y); g.rotate(Math.sin(it.t * 1.3) * 0.2);
      box("#3a3428", -9, -12, 18, 24); box("#d8d0b0", -7, -10, 14, 20);
      for (let i = 0; i < 4; i++) box("#6a6050", -5, -6 + i * 4, 10 - (i === 3 ? 4 : 0), 1);
      g.restore();
    } else if (it.kind === "sigil") {
      glow(g, x, y, 40, "255,170,80", 0.55);
      g.save(); g.translate(x, y); g.rotate(it.t * 0.8);
      box("#401808", -10, -10, 20, 20); box("#ff9a40", -7, -7, 14, 14); box("#fff0b0", -2, -2, 4, 4);
      g.restore();
    }
  }
  function drawWell(g, w) {
    const x = Math.round(w.x), y = Math.round(w.y);
    g.fillStyle = "#14161a"; g.fillRect(x - 24, y - 26, 48, 26);
    g.fillStyle = "#3a3e44"; g.fillRect(x - 22, y - 24, 44, 22);
    g.fillStyle = "#565c62"; g.fillRect(x - 26, y - 30, 52, 6);
    g.fillStyle = "#2a2e32"; for (let i = 0; i < 4; i++) g.fillRect(x - 20 + i * 11, y - 18, 8, 1);
    if (w.lit || w.charge > 0) {
      const a = w.lit ? 1 : w.charge, fl = Math.sin(G.t * 12) * 3;
      glow(g, x, y - 40, w.lit ? 70 : 30 + 40 * a, "255,190,90", 0.6 * a);
      g.fillStyle = `rgba(255,140,40,${a})`; g.fillRect(x - 8, y - 44 - fl, 16, 14 + fl);
      g.fillStyle = `rgba(255,230,140,${a})`; g.fillRect(x - 4, y - 40 - fl, 8, 10 + fl);
    } else { g.fillStyle = "#1e2226"; g.fillRect(x - 12, y - 32, 24, 3); }
  }
  function drawTrap(g, t) {
    const x = Math.round(t.x), y = t.y, f = t.fired > 0 ? 1 : 0;
    if (t.kind === "spikes") {
      g.fillStyle = "#120e0c"; g.fillRect(x - t.w / 2, y - 3, t.w, 5);
      for (let i = 0; i < 6; i++) {
        const sx = x - t.w / 2 + 6 + i * 11, h = f ? 20 : 9;
        g.fillStyle = "#7c8288"; g.beginPath(); g.moveTo(sx - 4, y); g.lineTo(sx, y - h); g.lineTo(sx + 4, y); g.fill();
        g.fillStyle = "#c8ccd0"; g.fillRect(sx - 1, y - h + 2, 1, 3);
      }
    } else if (t.kind === "snare") {
      g.strokeStyle = t.cd > 0 ? "#5a3e22" : "#7a5a32"; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const sx = x - 22 + i * 15, h = (f ? 26 : 12) + (i % 2) * 5;
        g.beginPath(); g.moveTo(sx, y); g.quadraticCurveTo(sx + 9, y - h * 0.6, sx + 3, y - h); g.stroke();
      }
    } else {
      const a = t.cd > 0 ? 0.3 : 0.6 + 0.3 * Math.sin(t.t * 3);
      g.fillStyle = `rgba(150,80,220,${a})`; g.fillRect(x - 24, y - 3, 48, 3);
      g.fillStyle = `rgba(210,150,255,${a})`; for (let i = -2; i <= 2; i++) g.fillRect(x + i * 9 - 2, y - 6 - (i & 1) * 3, 4, 3);
      if (a > 0.5) glow(g, x, y - 4, 26, "170,100,255", 0.25);
    }
  }

  // The mist, painted in low-res screen pixels on top of the scene, with holes burned by every light.
  E.drawMist = function (g, cam, lw, lh) {
    if (!E.on) return;
    const vis = E.patches.filter((q) => q.fade > 0 && (q.b - cam.x) / 2 > -60 && (q.a - cam.x) / 2 < lw + 60);
    if (!vis.length) return;
    if (!mistCv || mistCv.width !== lw || mistCv.height !== lh) { mistCv = document.createElement("canvas"); mistCv.width = lw; mistCv.height = lh; mctx = mistCv.getContext("2d"); }
    const m = mctx, X = (wx) => (wx - cam.x) / 2, Y = (wy) => (wy - cam.y) / 2, t = G.t;
    m.globalCompositeOperation = "source-over"; m.clearRect(0, 0, lw, lh);
    for (const q of vis) {
      const a = X(q.a), b = X(q.b), edge = 45, al = 0.95 * q.fade;
      const gr = m.createLinearGradient(a - edge, 0, b + edge, 0), w = b - a + edge * 2;
      gr.addColorStop(0, "rgba(22,28,25,0)"); gr.addColorStop(edge * 1.6 / w, `rgba(22,28,25,${al})`);
      gr.addColorStop(1 - edge * 1.6 / w, `rgba(22,28,25,${al})`); gr.addColorStop(1, "rgba(22,28,25,0)");
      m.fillStyle = gr; m.fillRect(a - edge, 0, w, lh);
      // slow pale banks rolling through it, heavier near the ground: stepped blobs in the pixel style
      for (let i = 0; i < 16; i++) {
        const span = b - a + 80, wx = a - 40 + (((i * 131 + t * (5 + (i % 3) * 3)) % span) + span) % span;
        const wy = Y(Wd.FLOOR) - 6 - ((i * 47) % 200) + Math.sin(t * 0.5 + i * 1.7) * 4, ww = 30 + (i % 5) * 12;
        const al2 = (0.07 + (i % 3) * 0.03) * q.fade * (wy > Y(Wd.FLOOR) - 80 ? 1.4 : 1);
        m.fillStyle = `rgba(120,138,128,${al2})`;
        m.fillRect(Math.round(wx - ww / 2), Math.round(wy) - 2, Math.round(ww), 5);
        m.fillRect(Math.round(wx - ww / 2 + 6), Math.round(wy) - 5, Math.round(ww - 12), 3);
        m.fillRect(Math.round(wx - ww / 2 + 14), Math.round(wy) - 7, Math.max(2, Math.round(ww - 28)), 2);
      }
    }
    // holes: dithered rims keep it in the pixel style
    m.globalCompositeOperation = "destination-out";
    for (const [lx, ly, r] of lights()) {
      const sx = X(lx), sy = Y(ly), sr = r / 2;
      if (sx + sr < 0 || sx - sr > lw) continue;
      const gr = m.createRadialGradient(sx, sy, sr * 0.35, sx, sy, sr);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.7, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      m.fillStyle = gr; m.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    g.drawImage(mistCv, 0, 0);
    // the lantern's warm glow inside the mist
    const p = G.player;
    if (patchAt(p.x)) {
      const sx = X(p.x), sy = Y(p.y - p.h * 0.55), sr = radius() / 2;
      const gr = g.createRadialGradient(sx, sy, 2, sx, sy, sr);
      gr.addColorStop(0, `rgba(255,200,120,${0.10 + 0.12 * E.light / LIGHT.max})`); gr.addColorStop(1, "rgba(255,200,120,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); g.globalCompositeOperation = "source-over";
    }
    // traps the knight has seen stay marked through the mist
    for (const tr of E.traps) if (tr.seen && patchAt(tr.x)) {
      const sx = Math.round(X(tr.x)), sy = Math.round(Y(tr.y)) - 2, c = tr.kind === "spikes" ? "#c84040" : tr.kind === "snare" ? "#b08040" : "#a060e0";
      if (sx < -10 || sx > lw + 10) continue;
      g.fillStyle = c; g.fillRect(sx - 4, sy, 9, 1); g.fillRect(sx, sy - 4, 1, 3);
    }
    g.restore();
  };

  // HUD rows under the kit box (full-res canvas, view units)
  E.hud = function (ctx, x, y, bar) {
    if (!E.on) return 0;
    const p = G.player, inM = patchAt(p.x);
    ctx.font = '600 10px "Inter", system-ui, sans-serif'; ctx.textAlign = "left";
    ctx.fillStyle = E.light <= 0 && inM ? `rgba(255,120,120,${0.6 + 0.4 * Math.sin(G.t * 8)})` : "#e6c88a";
    ctx.fillText("Lantern", x, y + 8);
    bar(x + 46, y + 2, 84, 6, E.light / LIGHT.max, inM ? "#ffb040" : "#a07a3a", "#1c160c");
    ctx.fillStyle = E.flares ? "#a0dcff" : "#5a6870"; ctx.fillText("Flares " + E.flares, x + 138, y + 8);
    const here = pages.filter((k) => k.split(":")[0] === String(G.level)).length;
    if (!E.scenic) { ctx.fillStyle = "#d8d0b0"; ctx.fillText("Pages " + here + "/3", x + 182, y + 8); }
    if (E.relics.length) { ctx.fillStyle = "#ffd27a"; ctx.fillText("Relics: " + E.relics.map((k) => RELICS[k].name).join(", "), x, y + 22); return 26; }
    return 14;
  };
  E.drawNote = function (ctx, vw, vh) {
    if (!E.note) return;
    const a = Math.min(1, E.note.t * 3, (6 - E.note.t) * 1.5);
    ctx.textAlign = "center"; ctx.font = 'italic 600 13px "Inter", system-ui, sans-serif';
    const lines = wrap(ctx, E.note.txt, Math.min(560, vw - 60));
    lines.forEach((l, i) => {
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(8,10,12,${0.8 * a})`; ctx.strokeText(l, vw / 2, vh * 0.34 + i * 17);
      ctx.fillStyle = `rgba(232,224,200,${a})`; ctx.fillText(l, vw / 2, vh * 0.34 + i * 17);
    });
  };
  function wrap(ctx, txt, w) {
    const out = []; let line = "";
    for (const word of txt.split(" ")) { const t = line ? line + " " + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line); return out;
  }
  E.RELICS = RELICS; E.LORE = LORE;
})(window.DS = window.DS || {});
