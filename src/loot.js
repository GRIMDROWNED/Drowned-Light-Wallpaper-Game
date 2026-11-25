/* Loot and upgrades (Robert 2026-11-24): the Drowned drop currencies, the knight spends them on lasting stat upgrades,
   and the wallpaper farms them while nobody is playing.
   - Currencies use Robert's loot icons (tools/cut_loot.py -> assets/loot, DS.LOOTART). Gold pays for every upgrade;
     each stat also takes its own material; ranks 6 to 10 also take Amethyst (bosses, and now and then any Drowned).
   - Drops pop out of a fallen Drowned and fly to the knight. Played (and portrait auto-fight) drops go to the wallet.
   - Wallpaper drops go to the haul instead: a satchel kept in local storage that fills while the wallpaper runs (up
     to HAUL_CAP), and is handed over the next time the game opens ("While you were away"). The wallpaper apps load
     the same pages from the same origin as the game, so they share local storage.
   - Upgrades count for every knight (kit sigils stay per knight). Read by src/explore.js (damage, health, speed,
     ability cooldown, mist drain) and src/game.js (damage taken).
   Saved: dl-side-wallet, dl-side-ranks, dl-side-haul. */
"use strict";
(function (DS) {
  const G = DS.G, Wd = DS.World;
  const CURRENCY = DS.CURRENCY = {
    gold: { name: "Gold", c: "255,210,110" },
    bone: { name: "Drowned Bone", c: "230,215,190" },
    berries: { name: "Bloodberries", c: "235,80,80" },
    gear: { name: "Rust Gears", c: "210,130,90" },
    glowcap: { name: "Glowcaps", c: "90,230,220" },
    emberore: { name: "Ember Ore", c: "255,160,60" },
    lanternbell: { name: "Lanternbells", c: "120,190,255" },
    amethyst: { name: "Amethyst", c: "190,140,255" },
  };
  const CUR_ORDER = DS.CUR_ORDER = Object.keys(CURRENCY);
  const MATS = ["bone", "berries", "gear", "glowcap", "emberore", "lanternbell"];
  // each stat: its material and what one rank gives
  const UPGRADES = DS.UPGRADES = [
    { id: "might", name: "Might", mat: "bone", per: 0.04, text: (r) => `+${r * 4}% damage` },
    { id: "vigor", name: "Vitality", mat: "berries", per: 0.06, text: (r) => `+${r * 6}% health` },
    { id: "guard", name: "Guard", mat: "gear", per: 0.03, text: (r) => `${r * 3}% less damage taken` },
    { id: "swift", name: "Swiftness", mat: "glowcap", per: 0.02, text: (r) => `+${r * 2}% speed` },
    { id: "focus", name: "Focus", mat: "emberore", per: 0.03, text: (r) => `${r * 3}% faster ability` },
    { id: "lantern", name: "Lantern", mat: "lanternbell", per: 0.06, text: (r) => `mist drains the lantern ${r * 6}% slower` },
  ];
  const MAX_RANK = 10;
  // gold 15, 45, 87 ... 597 (2,670 for all ten); material 3, 5 ... 21; Amethyst 1 to 5 for ranks 6 to 10
  const cost = (r) => ({ gold: Math.round(15 * Math.pow(r + 1, 1.6)), mat: 3 + 2 * r, amethyst: r >= 5 ? r - 4 : 0 });
  const DROP = { matChance: 0.35, gemChance: 1 / 120, bossGold: 20, bossLevelGold: 2, bossMats: 3, clearGold: 10 };
  // The wallpaper gathers WALL_SHARE of what a played fight drops (it fights ~16 Drowned a minute: about 800 Gold and
  // 20 of each material an hour), and its satchel holds at most HAUL_CAP until the game takes it: roughly 3 to 6 hours.
  const WALL_SHARE = 0.4;
  const HAUL_CAP = { gold: 2500, bone: 120, berries: 120, gear: 120, glowcap: 120, emberore: 120, lanternbell: 120, amethyst: 8 };

  function load(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === "object" ? v : def; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  let wallet = load("dl-side-wallet", {}), ranks = load("dl-side-ranks", {});
  const L = DS.Loot = { drops: [], CURRENCY, UPGRADES, MAX_RANK, HAUL_CAP };

  // ---------------- wallet and ranks ----------------
  L.have = (k) => wallet[k] | 0;
  L.rank = (id) => Math.min(MAX_RANK, ranks[id] | 0);
  L.cost = (id) => { const u = UPGRADES.find((x) => x.id === id), c = cost(L.rank(id)); return { gold: c.gold, [u.mat]: c.mat, amethyst: c.amethyst }; };
  L.canBuy = (id) => L.rank(id) < MAX_RANK && Object.entries(L.cost(id)).every(([k, n]) => L.have(k) >= n);
  L.buy = function (id) {
    if (!L.canBuy(id)) return false;
    wallet = load("dl-side-wallet", wallet); // another window may have added to it
    for (const [k, n] of Object.entries(L.cost(id))) wallet[k] = (wallet[k] | 0) - n;
    ranks[id] = L.rank(id) + 1;
    save("dl-side-wallet", wallet); save("dl-side-ranks", ranks);
    if (G.player && !G.player.dead) { // more health now, at the same fraction
      const p = G.player, f = p.hp / p.max;
      p.max = Math.round(DS.PHYS.hp * (p.k.hpMult || 1) * DS.Explore.hpMult(p.kitId)); p.hp = Math.max(1, Math.round(p.max * f));
    }
    return true;
  };
  function add(bag, k, n) { bag[k] = (bag[k] | 0) + n; }
  L.give = (k, n) => { wallet = load("dl-side-wallet", wallet); add(wallet, k, n); save("dl-side-wallet", wallet); if (G.lv && n > 0) add(G.lv.bag, k, n); }; // G.lv.bag: this level's takings
  L.resetAll = () => { wallet = {}; ranks = {}; save("dl-side-wallet", wallet); save("dl-side-ranks", ranks); };

  // what the ranks change (read by explore.js and game.js)
  const per = (id) => L.rank(id) * UPGRADES.find((u) => u.id === id).per;
  L.dmgMult = () => 1 + per("might");
  L.hpMult = () => 1 + per("vigor");
  L.hurtMult = () => 1 - per("guard");
  L.speedMult = () => 1 + per("swift");
  L.cdMult = () => 1 - per("focus");
  L.drainMult = () => 1 - per("lantern");

  // ---------------- the wallpaper's haul ----------------
  let pending = {}, pendT = 0;
  L.haul = () => load("dl-side-haul", {});
  const room = (k) => { const h = L.haul(); return (h[k] | 0) + (pending[k] | 0) < HAUL_CAP[k]; };
  function flushHaul() { // the wallpaper adds what it gathered, a few seconds at a time
    if (!Object.keys(pending).length) return;
    const h = L.haul();
    for (const [k, n] of Object.entries(pending)) if (k !== "since") h[k] = Math.min(HAUL_CAP[k], (h[k] | 0) + n);
    if (!h.since) h.since = Date.now();
    save("dl-side-haul", h); pending = {};
  }
  // the game takes the haul into the wallet; returns what it held (or null)
  L.flush = flushHaul;
  L.collect = function () {
    const h = L.haul(), got = {};
    for (const k of CUR_ORDER) if (h[k] > 0) got[k] = h[k] | 0;
    if (!Object.keys(got).length) return null;
    save("dl-side-haul", {});
    wallet = load("dl-side-wallet", wallet);
    for (const [k, n] of Object.entries(got)) add(wallet, k, n);
    save("dl-side-wallet", wallet);
    got.since = h.since; return got;
  };

  // ---------------- drops ----------------
  const rnd = (a, b) => a + Math.random() * (b - a);
  function drop(k, n, x, y) { L.drops.push({ k, n, x: x + rnd(-10, 10), y: y - 30, y0: y, vx: rnd(-140, 140), vy: rnd(-380, -240), t: 0 }); }
  function pile(e) { // what a fallen Drowned leaves
    const out = [], lv = G.level | 0;
    if (e.d.boss) {
      out.push(["gold", DROP.bossGold + lv * DROP.bossLevelGold]);
      for (let i = 0; i < DROP.bossMats; i++) out.push([MATS[Math.random() * MATS.length | 0], 2]);
      out.push(["amethyst", lv % 10 === 9 ? 3 : 1]); // a map's last boss gives more
    } else {
      out.push(["gold", 1 + (Math.random() * 3 | 0) + Math.floor(lv / 5)]);
      if (Math.random() < DROP.matChance) out.push([MATS[Math.random() * MATS.length | 0], 1]);
      if (Math.random() < DROP.gemChance) out.push(["amethyst", 1]);
    }
    return out;
  }
  L.onKill = function (e) {
    if (!e || e.d.dummy || !G.scroll) return; // the arena is for testing
    for (let [k, n] of pile(e)) {
      if (G.wall) { // the wallpaper's share, while its satchel has room
        if (!room(k)) continue;
        if (k === "gold") n = Math.max(1, Math.round(n * WALL_SHARE)); else if (Math.random() > WALL_SHARE) continue;
      }
      if (k === "gold") { const parts = n > 6 ? 3 : n > 2 ? 2 : 1; for (let i = 0; i < parts; i++) { const m = Math.round(n / parts); drop(k, i === parts - 1 ? n - m * (parts - 1) : m, e.x, e.y); } }
      else drop(k, n, e.x, e.y);
    }
  };
  L.onClear = function (n) { // a level's reward, straight to the wallet
    if (G.wall) return;
    L.give("gold", DROP.clearGold + n * 2);
  };
  L.clear = () => { L.drops = []; };

  function credit(k, n) {
    if (G.wall) add(pending, k, n); else L.give(k, n);
  }
  L.update = function (dt) {
    const p = G.player; if (!p) return;
    for (const d of L.drops) {
      d.t += dt;
      if (d.t < 0.55 || p.dead) { // pop out, then lie on the ground
        d.vy += 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.97;
        const fl = Wd.surfaceBelow ? Wd.surfaceBelow(d.x, d.y0 - 40) : d.y0;
        if (d.y > fl) { d.y = fl; d.vy *= -0.35; d.vx *= 0.6; }
      } else { // then fly to the knight
        const tx = p.x, ty = p.y - p.h * 0.5, dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
        const sp = 250 + (d.t - 0.55) * 1400;
        d.x += dx / dist * Math.min(dist, sp * dt); d.y += dy / dist * Math.min(dist, sp * dt);
        if (dist < 18) {
          d.got = true; credit(d.k, d.n);
          const c = CURRENCY[d.k];
          G.texts.push({ x: p.x + rnd(-14, 14), y: p.y - p.h - 20, txt: (d.k === "gold" ? "+" + d.n : "+" + d.n + " " + c.name), color: `rgb(${c.c})`, size: d.k === "gold" ? 10 : 11, t: 0, vy: -50 });
        }
      }
    }
    L.drops = L.drops.filter((d) => !d.got && d.t < 20);
    if (G.wall && (pendT += dt) > 4) { pendT = 0; flushHaul(); }
  };
  addEventListener("pagehide", flushHaul);
  addEventListener("visibilitychange", () => { if (document.hidden) flushHaul(); });

  // ---------------- drawing ----------------
  let img = null;
  function art() {
    if (!img && DS.LOOTART) { img = new Image(); img.src = "assets/loot/atlas.png?v=" + DS.VERSION; }
    return img && img.complete && img.naturalWidth ? img : null;
  }
  L.draw = function (g) { // world units, on the pixel canvas
    const A = art(); if (!A) return;
    for (const d of L.drops) {
      const r = DS.LOOTART[d.k]; if (!r) continue;
      const w = r[2] * 2, h = r[3] * 2;
      if (d.k === "amethyst") { g.fillStyle = "rgba(190,140,255,0.25)"; g.beginPath(); g.arc(d.x, d.y - h / 2, 16, 0, 7); g.fill(); }
      g.drawImage(A, r[0], r[1], r[2], r[3], Math.round(d.x - w / 2), Math.round(d.y - h), w, h);
    }
  };
  // a small purse at the top of the screen while playing
  L.hud = function (ctx, vw) {
    const A = art(); if (!A) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.font = '700 12px "Pixelify Sans", monospace'; ctx.textAlign = "left";
    const items = [["gold", L.have("gold")], ["amethyst", L.have("amethyst")]];
    const widths = items.map(([, n]) => 22 + ctx.measureText(String(n)).width + 12), total = widths.reduce((a, b) => a + b, 0);
    // Robert's coin-purse plate (434 x 150; its dark slot runs from 27% across)
    const purse = DS.Render.hudImg && DS.Render.hudImg("purse"), pw = Math.max(150, total / 0.62), ph = pw * 150 / 434;
    let x = Math.round(vw / 2 - pw / 2 + pw * 0.3 + (pw * 0.62 - total) / 2); const y = purse ? 4 + ph * 0.5 - 7 : 12;
    if (purse) { ctx.imageSmoothingEnabled = true; ctx.drawImage(purse, vw / 2 - pw / 2, 4, pw, ph); ctx.imageSmoothingEnabled = false; }
    else { ctx.fillStyle = "rgba(6,12,18,0.55)"; ctx.fillRect(x - 6, y - 4, total + 4, 22); }
    items.forEach(([k, n], i) => {
      const r = DS.LOOTART[k], s = 14 / r[3];
      ctx.drawImage(A, r[0], r[1], r[2], r[3], x, y, Math.round(r[2] * s), 14);
      ctx.fillStyle = `rgb(${CURRENCY[k].c})`; ctx.fillText(String(n), x + 20, y + 12);
      x += widths[i];
    });
    ctx.restore();
  };
  L.icon = (k) => `assets/loot/icons/${k}.png?v=${DS.VERSION}`;
})(window.DS = window.DS || {});
