/* The Jade Hollow's creatures (map 7, Robert 2026-11-25), drawn by Robert (tools/cut_jade_creatures.py -> DS.JADEART):
   - Watchers (his ideas 1 + 2): a cluster of jade crystals like any other, until the knight comes close. Then the shell
     lifts, the eye opens and it shoots jade spikes at whatever is nearest: the knight or the Drowned. Killed, it spills
     jade shards and a pile of loot. While awake it is a foe in G.foes (d.custom), so every attack can hit it.
   - The Gatekeeper (idea 3): coiled across Robert's vault gate. Bring it 3 jade shards (stand by it) and it eats them,
     slides aside and opens its vault: a relic, an ember, a flare and a heap of gold.
   - The Shellback (idea 4): a gentle giant wading back and forth across a pool of jade water that burns the knight and
     the Drowned alike. Its flat shell is a moving platform: ride it across.
   Only in a played level of the Jade Hollow (not the endless auto-fight or the wallpaper). */
"use strict";
(function (DS) {
  const G = DS.G, Wd = DS.World;
  const fx = () => DS.fx;
  const PX = 2; // world units per art pixel
  const N = { watchers: 3, wake: 90, sight: 460, shotCd: 1.6, shotSpeed: 520, hp: 150, shards: 2, feed: 3, pool: 640, poolDps: 9, poolHit: 0.15, foeTick: 0.5, foeDmg: 10, sbSpeed: 60, sbPause: 2.5 };
  const J = DS.Jade = { on: false, watchers: [], gate: null, pool: null, sb: null, shots: [], shards: 0 };

  let img = null;
  function art() {
    if (!img && DS.JADEART) { img = new Image(); img.src = "assets/jade/creatures.png?v=" + DS.VERSION; }
    return img && img.complete && img.naturalWidth ? img : null;
  }
  // a frame by name, feet at (x, y), facing dir (the art faces right), 2 world units a pixel
  function draw(g, k, x, y, dir, alpha, tint) {
    const A = art(), r = DS.JADEART && DS.JADEART[k]; if (!A || !r) return;
    const w = r[2] * PX, h = r[3] * PX;
    g.save(); if (alpha != null) g.globalAlpha = alpha;
    g.translate(Math.round(x), Math.round(y)); if (dir < 0) g.scale(-1, 1);
    g.drawImage(A, r[0], r[1], r[2], r[3], -w / 2, -h, w, h);
    if (tint) { g.globalCompositeOperation = "source-atop"; g.globalAlpha = tint[1]; g.fillStyle = tint[0]; g.fillRect(-w / 2, -h, w, h); }
    g.restore();
  }
  function glow(g, x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const isJade = (n) => !!DS.MAPS && DS.MAPS[Math.floor(n / 10) % DS.MAPS.length].id === "jade";
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  J.clear = function () {
    if (J.sb) { const i = Wd.plats.indexOf(J.sb.plat); if (i >= 0) Wd.plats.splice(i, 1); }
    J.on = false; J.watchers = []; J.gate = null; J.pool = null; J.sb = null; J.shots = []; J.shards = 0; J.thrown = null;
  };

  // after Explore.build: find room on the floor for the pool, the Gatekeeper and the Watchers
  J.build = function (n, bossX) {
    J.clear();
    if (!bossX || !isJade(n)) return;
    J.on = true;
    const r = rng(777 + n * 131), E = DS.Explore, lo = 1500, hi = bossX - 500;
    const stones = Wd.solids.filter((s) => s.kind === "stone");
    const free = (a, b) => !stones.some((s) => s.x < b && s.x + s.w > a);
    const misty = (a, b) => E.patches.some((q) => q.a < b + 200 && q.b > a - 200);
    const taken = [];
    for (const w of E.wells) taken.push([w.x - 250, w.x + 250]); // leave the Mist Wells and their keepers be
    const clash = (a, b) => taken.some(([c, d]) => a < d && b > c);
    const clearOut = (a, b) => { // no stones, traps or floor pickups in [a, b]: pickups move on past it
      for (let i = Wd.solids.length - 1; i >= 3; i--) { const s = Wd.solids[i]; if (s.kind === "stone" && s.x < b && s.x + s.w > a) Wd.solids.splice(i, 1); }
      E.traps = E.traps.filter((t) => t.x < a - 40 || t.x > b + 40);
      for (const it of E.items) if (it.x > a - 40 && it.x < b + 40 && (!Wd.groundAt(it.x, it.y) || it.y >= Wd.FLOOR - 1)) { it.x = b + 100 + r() * 80; it.y = Wd.surfaceBelow(it.x, -2000); }
    };
    // the pool, with the Shellback wading over it (no stones in it, out of the mist)
    let pa = null;
    for (let k = 0; k < 80 && pa == null; k++) { const a = lo + r() * (hi - lo - N.pool); if (free(a - 260, a + N.pool + 260) && !misty(a, a + N.pool)) pa = a; }
    if (pa == null) for (let k = 0; k < 40 && pa == null; k++) { const a = lo + r() * (hi - lo - N.pool); if (!misty(a, a + N.pool)) pa = a; }
    if (pa != null) {
      const a = pa, b = pa + N.pool;
      clearOut(a - 260, b + 260); // the Shellback walks on to each bank: nothing in its way, nothing waiting in the water
      J.pool = { a, b, t: 0 };
      const plat = { x: a - 300, y: Wd.FLOOR - 126, w: 300, ride: true };
      Wd.plats.push(plat);
      J.sb = { x: a - 150, dir: 1, a: a - 150, b: b + 150, pause: 1, run: 0, plat, wade: 0 };
      taken.push([a - 400, b + 400]);
    }
    // the Gatekeeper and its vault
    for (let k = 0; k < 120 && !J.gate; k++) {
      const x = lo + 300 + r() * (hi - lo - 600);
      if ((k > 60 || free(x - 180, x + 300)) && !misty(x - 100, x + 100) && !clash(x - 300, x + 300)) {
        clearOut(x - 180, x + 300);
        J.gate = { x, x0: x, state: "sleep", fed: 0, eatT: 0, moveT: 0, sayT: 0, t: 0, open: false }; taken.push([x - 400, x + 400]);
      }
    }
    // Watchers: one deep in the first mist patch (if there is one), the others out on the floor
    const spot = (a, b) => { for (let k = 0; k < 40; k++) { const x = a + r() * (b - a); if (free(x - 60, x + 60) && !clash(x - 120, x + 120)) { taken.push([x - 200, x + 200]); return x; } } return null; };
    const q = E.patches[0];
    if (q) { const x = spot(q.a + 200, q.b - 200); if (x != null) J.watchers.push({ x, state: "disguise", t: r() * 6 }); }
    for (let k = 0; J.watchers.length < N.watchers && k < 10; k++) { const x = spot(lo, hi); if (x != null) J.watchers.push({ x, state: "disguise", t: r() * 6 }); }
    E.traps = E.traps.filter((t) => !J.watchers.some((w) => Math.abs(w.x - t.x) < 100) && !(J.gate && Math.abs(J.gate.x - t.x) < 200));
  };

  // ---------------- the Watcher, awake: a foe in G.foes ----------------
  const WATCHER = { name: "Jade Watcher", ai: "custom", hp: N.hp, w: 80, h: 56, speed: 0, dmg: 14, custom: { tick, draw: drawWatcher } };
  function tick(e, dt) {
    e.vx = 0; e.st += dt; e.cd -= dt;
    if (e.state === "hurt") { if (e.st > 0.3) { e.state = "move"; e.st = 0; } }
    else if (e.state === "wake") { if (e.st > 0.7) { e.state = "move"; e.st = 0; e.cd = 0.5; } }
    else if (e.state === "shoot") { if (e.st > 0.35) { e.state = "move"; e.st = 0; } }
    else if (e.cd <= 0) { // aim at the nearest thing alive: the knight or a Drowned
      const p = G.player;
      let best = !p.dead ? p : null, bd = best ? Math.hypot(p.x - e.x, p.y - e.y) : 1e9;
      for (const f of G.foes) if (f !== e && !f.dead && !f.d.dummy && !f.d.boss && f.spawnT <= 0 && !f.d.custom) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < bd) { bd = d; best = f; } }
      if (best && bd < N.sight) {
        e.dir = Math.sign(best.x - e.x) || e.dir; e.state = "shoot"; e.st = 0; e.cd = N.shotCd;
        const sx = e.x + e.dir * 34, sy = e.y - 32, tx = best.x, ty = best.y - (best.h || 40) * 0.5, L = Math.hypot(tx - sx, ty - sy) || 1;
        J.shots.push({ x: sx, y: sy, vx: (tx - sx) / L * N.shotSpeed, vy: (ty - sy) / L * N.shotSpeed, life: 1.6, src: e });
        fx().spark(sx, sy, "#7affc0", 6);
      }
    }
    e.vy += DS.PHYS.gravity * dt; Wd.move(e, dt);
  }
  function drawWatcher(g, e) {
    const k = e.dead ? "wDead" : e.state === "wake" ? "wWake" : e.state === "hurt" ? "wHurt" : e.state === "shoot" ? "wShoot" : "wAwake";
    if (!e.dead) glow(g, e.x + e.dir * 20, e.y - 30, e.state === "shoot" ? 70 : 40, "90,255,160", e.state === "shoot" ? 0.5 : 0.25);
    draw(g, k, e.x, e.y + 2, e.dir, e.dead ? Math.max(0, 1 - (e.deadT - 2) / 1) : 1, e.flash > 0 ? ["#ffffff", 0.8] : null);
  }
  function wake(w) {
    const e = DS.spawnFoe("jadeWatcher", w.x, Wd.surfaceBelow(w.x, -2000));
    G.fx = G.fx.filter((f) => !(f.kind === "portal" && Math.abs(f.x - w.x) < 2)); // it was there all along: no portal
    e.spawnT = 0; e.state = "wake"; e.st = 0; e.dir = Math.sign(G.player.x - w.x) || 1; e.alerted = true;
    w.e = e; w.state = "awake";
    fx().text(w.x, Wd.FLOOR - 80, "IT WAS WATCHING", "#7affc0", 13); fx().shake(3);
  }

  // ---------------- the update ----------------
  J.update = function (dt) {
    if (!J.on) return;
    const p = G.player, Lt = DS.Loot;
    for (const w of J.watchers) {
      w.t += dt;
      if (w.state === "disguise") { if (!p.dead && Math.abs(p.x - w.x) < N.wake && Math.abs(p.y - Wd.FLOOR) < 140) wake(w); }
      else if (w.state === "awake") {
        if (w.e.dead) { // spilled: shards for the Gatekeeper, and a heap of loot
          w.state = "dead"; J.shards += N.shards;
          fx().text(w.x, Wd.FLOOR - 90, `+${N.shards} jade shards (${J.shards})`, "#7affc0", 14);
          if (Lt.drop) { Lt.drop("gold", 6 + Math.floor((G.level | 0) / 5), w.x, Wd.FLOOR); Lt.drop("amethyst", 1, w.x, Wd.FLOOR); }
        } else if (!G.foes.includes(w.e)) { w.state = "disguise"; w.e = null; } // the knight fell: it settles back down
      }
    }
    // jade spikes: they hit the knight and the Drowned alike
    for (const s of J.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (Wd.solidAt(s.x, s.y)) { s.life = 0; fx().spark(s.x, s.y, "#7affc0", 4); continue; }
      if (!p.dead && Math.abs(s.x - p.x) < p.w / 2 + 6 && s.y > p.y - p.h && s.y < p.y) {
        if (DS.hurtPlayer(12 + Math.floor((G.level | 0) / 6), s.src, "Jade Watcher", s.x)) { s.life = 0; continue; }
      }
      for (const f of G.foes) if (f !== s.src && !f.dead && !f.d.dummy && !f.d.custom && f.spawnT <= 0 && Math.abs(s.x - f.x) < f.w / 2 + 6 && s.y > f.y - f.h && s.y < f.y) {
        DS.hitFoe(f, { dmg: 30, noMult: true, kb: 160, dir: Math.sign(s.vx) || 1, noHeat: true, hitstop: 0, quiet: true, color: "#7affc0", sparkColor: "#7affc0" });
        s.life = 0; break;
      }
    }
    J.shots = J.shots.filter((s) => s.life > 0);
    gate(p, dt);
    shellback(p, dt);
  };

  function gate(p, dt) {
    const k = J.gate; if (!k) return;
    k.t += dt; k.sayT -= dt;
    const near = !p.dead && Math.abs(p.x - k.x) < 170 && p.y > Wd.FLOOR - 200;
    if (k.state === "sleep" || k.state === "wake" || k.state === "hungry") {
      k.state = !near ? "sleep" : J.shards > 0 ? "hungry" : "wake";
      if (near && k.sayT <= 0) {
        k.sayT = 3;
        fx().text(k.x, Wd.FLOOR - 210, J.shards > 0 ? "It hungers for jade..." : `It wants jade shards (${k.fed}/${N.feed}). The Watchers carry them.`, "#7affc0", 12);
      }
      if (near && J.shards > 0) { k.eatT += dt; if (k.eatT > 0.9) { k.eatT = 0; J.shards--; k.fed++; k.state = "eat"; k.st = 0; fx().spark(k.x - 40, Wd.FLOOR - 60, "#7affc0", 10); fx().text(k.x, Wd.FLOOR - 190, `${k.fed}/${N.feed}`, "#7affc0", 14); } }
      else k.eatT = 0;
    } else if (k.state === "eat") {
      if ((k.st += dt) > 0.7) k.state = k.fed >= N.feed ? "move" : "hungry";
    } else if (k.state === "move") { // slides aside: the tunnel is open
      k.moveT += dt; k.x = k.x0 + Math.min(1, k.moveT / 1.4) * 280;
      if (k.moveT > 1.4) { k.state = "aside"; open(k); }
    }
  }
  function open(k) {
    k.open = true; fx().shake(5); fx().text(k.x0, Wd.FLOOR - 170, "THE VAULT OPENS", "#ffd27a", 16);
    const E = DS.Explore, y = Wd.FLOOR;
    E.items.push({ kind: "relic", x: k.x0 - 20, y, t: 0 }, { kind: "ember", x: k.x0 - 80, y, t: 0 }, { kind: "flare", x: k.x0 + 50, y, t: 0 });
    const Lt = DS.Loot;
    if (Lt.drop) { for (let i = 0; i < 3; i++) Lt.drop("gold", 10 + (G.level | 0), k.x0, y); Lt.drop("amethyst", 2, k.x0, y); }
  }

  function shellback(p, dt) {
    const s = J.sb, q = J.pool; if (!s) return;
    q.t += dt;
    let dx = 0;
    if (s.pause > 0) s.pause -= dt;
    else {
      dx = s.dir * N.sbSpeed * dt; s.x += dx; s.run += Math.abs(dx);
      if (s.dir > 0 && s.x >= s.b) { s.x = s.b; s.dir = -1; s.pause = N.sbPause; }
      else if (s.dir < 0 && s.x <= s.a) { s.x = s.a; s.dir = 1; s.pause = N.sbPause; }
    }
    // knee-deep over the water: it sinks to wading depth and rises again on the banks
    const inWater = s.x > q.a + 60 && s.x < q.b - 60;
    s.wade = Math.max(0, Math.min(1, s.wade + (inWater ? dt : -dt) * 1.6));
    const top = Wd.FLOOR - (84 - 21) * PX + s.wade * 34;
    const plat = s.plat, oy = plat.y;
    plat.x = s.x - 150; plat.y = top;
    // carry whoever stands on it
    for (const o of [p, ...G.foes]) if (o && !o.dead && o.onPlat === plat) { o.x += dx; o.y = plat.y; }
    if (p.onPlat === plat && oy !== plat.y) p.y = plat.y;
    if (J.thrown) { const t = J.thrown; t.t -= dt; p.x += (t.to - p.x) * Math.min(1, dt * 9); if (t.t <= 0 || p.dead) J.thrown = null; }
    // the jade water burns
    const wet = (o) => o.onGround && !o.onPlat && o.x > q.a && o.x < q.b && o.y >= Wd.FLOOR - 2;
    // Robert 2026-11-27: walking through made the Shellback pointless. A knight who steps or falls in is scalded and
    // thrown back out toward the nearer bank, so the only way over is on its back (the autopilot just wades, slowly).
    if (!p.dead && wet(p) && !G.god) {
      if (G.auto) { p.hp -= N.poolDps * dt; p.vx *= Math.max(0, 1 - 4 * dt); }
      else {
        const home = p.x - q.a < q.b - p.x ? -1 : 1;
        DS.hurtPlayer(Math.round(p.max * N.poolHit), null, "the jade water", p.x - home);
        p.vy = -620; p.onGround = false; p.atk = null;
        J.thrown = { to: home < 0 ? q.a - 50 : q.b + 50, t: 0.5 }; // carried out over the bank (air control would stall a plain push)
        fx().spark(p.x, Wd.FLOOR - 6, "#7affc0", 12); fx().text(p.x, p.y - p.h - 20, "SCALDED", "#7affc0", 14);
      }
      if (p.hp <= 0 && !p.dead) { p.hp = 0; p.dead = 0.001; p.lastHit = "jade water"; fx().text(p.x, p.y - p.h - 30, "Fell to the jade water", "#ff9a9a", 14); }
    }
    for (const f of G.foes) if (!f.dead && !f.d.boss && !f.d.custom && f.spawnT <= 0 && wet(f)) {
      f.poolT = (f.poolT || 0) - dt;
      if (f.poolT <= 0) { f.poolT = N.foeTick; DS.hitFoe(f, { dmg: N.foeDmg, noMult: true, kb: 0, noHeat: true, hitstop: 0, quiet: true, color: "#7affc0" }); }
    }
  }

  // ---------------- drawing (world units, behind the Drowned) ----------------
  J.drawBack = function (g) {
    if (!J.on) return;
    const k = J.gate;
    if (k) { // Robert's vault gate behind it: dark with eyes inside, then lit gold with the treasure once it opens
      const x = k.x0, y = Wd.FLOOR;
      glow(g, x, y - 100, k.open ? 180 : 100, k.open ? "255,210,120" : "90,255,160", k.open ? 0.4 : 0.12 + 0.05 * Math.sin(k.t * 2));
      draw(g, k.open ? "vOpen" : "vClosed", x, y + 4, 1);
      const f = k.state === "sleep" ? "gSleep" : k.state === "wake" ? "gWake" : k.state === "hungry" ? "gHungry" : k.state === "eat" ? "gEat" : k.state === "move" ? "gMove" : "gAside";
      if (k.state === "hungry") glow(g, k.x - 30, Wd.FLOOR - 70, 70, "90,255,160", 0.35);
      draw(g, f, k.x, Wd.FLOOR + 4, k.state === "move" || k.state === "aside" ? 1 : -1);
    }
    for (const w of J.watchers) if (w.state === "disguise") { // just another cluster of crystals (a faint glint gives it away)
      glow(g, w.x, Wd.FLOOR - 16, 34, "90,255,160", 0.18 + 0.05 * Math.sin(w.t * 1.7));
      draw(g, "wDisguise", w.x, Wd.FLOOR + 2, 1);
    }
    const q = J.pool, s = J.sb;
    if (s) { // the Shellback, then the water over its legs
      const fr = s.pause > 0 && s.wade < 0.5 ? "sWalk1" : s.wade > 0.5 ? "sWade" : "sWalk" + (1 + (Math.floor(s.run / 26) % 4));
      const bob = s.wade > 0.5 ? Math.sin(q.t * 2) * 2 : 0;
      const y = fr === "sWade" ? s.plat.y + (62 - 21) * PX + bob : s.plat.y + (84 - 21) * PX;
      draw(g, fr, s.x, y, s.dir);
    }
    if (q) {
      const y = Wd.FLOOR - 8;
      g.fillStyle = "rgba(6,40,30,0.92)"; g.fillRect(q.a, y, q.b - q.a, 40);
      g.fillStyle = "rgba(60,220,150,0.55)";
      for (let x = q.a; x < q.b; x += 6) { const h = 2 + Math.sin(x * 0.05 + q.t * 2.4) * 1.5; g.fillRect(x, y - h + 2, 6, 2); }
      glow(g, (q.a + q.b) / 2, y, (q.b - q.a) * 0.55, "60,220,150", 0.12);
    }
  };
  J.drawFront = function (g) {
    if (!J.on) return;
    const q = J.pool;
    if (q) { // the water's surface in front: deep jade water, not a floor
      const y = Wd.FLOOR - 16;
      g.fillStyle = "rgba(10,70,50,0.55)"; g.fillRect(q.a, y, q.b - q.a, 18);
      g.fillStyle = "rgba(120,255,190,0.6)";
      for (let x = q.a; x < q.b; x += 6) { const h = Math.sin(x * 0.05 + q.t * 2.4) * 2; g.fillRect(x, y + h, 6, 2); }
      if (Math.random() < 0.15) fx().spark(q.a + Math.random() * (q.b - q.a), y, "#7affc0", 1);
    }
    for (const s of J.shots) { // a jade spike: a bright sliver along its path
      const a = Math.atan2(s.vy, s.vx);
      glow(g, s.x, s.y, 22, "90,255,160", 0.5);
      g.save(); g.translate(s.x, s.y); g.rotate(a);
      g.fillStyle = "#2a8a5a"; g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -5); g.lineTo(-10, 5); g.fill();
      g.fillStyle = "#c8ffe4"; g.fillRect(-6, -1, 16, 2);
      g.restore();
    }
  };
  J.hud = function () { return J.on && J.gate && !J.gate.open ? `Jade shards ${J.shards} · Gatekeeper ${J.gate.fed}/${N.feed}` : ""; };

  DS.ENEMIES.jadeWatcher = WATCHER;
})(window.DS = window.DS || {});
