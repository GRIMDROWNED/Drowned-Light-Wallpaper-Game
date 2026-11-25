/* The familiars: the main game's companions fighting beside the knight, side on. One at a time (G.fam).
   The Bone Hound runs down and bites; Derek raises stone walls the Drowned turn on; Kindle tips fire into the
   knight's lantern (the ability comes back sooner); Abigail throws homing soul orbs that curse and blesses her
   knight; Fred spits slowing spores and sprouts healing glowcaps; David flies at the shoulder spitting fire bolts.
   Each grows a form after enough kills (DS.FAMILIARS[id].grow). Numbers: DS.FAMILIARS in src/data.js. */
"use strict";
(function (DS) {
  const G = DS.G, S = DS.Sprites, Wd = DS.World, P = DS.PHYS;
  const { clamp, rnd } = DS.util;
  const fx = () => DS.fx;
  const TAU = Math.PI * 2;
  const F = (DS.Fam = {});
  G.fam = null;      // the familiar out now
  G.famWalls = [];   // Derek's stone walls
  G.caps = [];       // Fred's glowcaps
  let pick = null;   // the familiar id picked (null = none)
  let famT = 0;      // the familiar's own clock

  const def = () => (G.fam ? DS.FAMILIARS[G.fam.id] : null);
  const form = (f = G.fam) => DS.FAMILIARS[f.id].forms[f.form];
  F.def = def; F.form = () => (G.fam ? form() : null);
  F.picked = () => (pick && F.won(pick) ? pick : null); // (a tester's "all locked" view hides it without forgetting it)

  // ---------------- choosing ----------------
  F.set = function (id, keep) {
    id = id && DS.FAMILIARS[id] ? id : null;
    if (!keep) { pick = id; try { localStorage.setItem("dl-side-fam", id || ""); } catch (e) { /* storage blocked */ } } // (the wallpaper's random ones aren't kept)
    if (id && !F.won(id)) id = null; // never one still to be won
    G.famWalls = []; G.caps = [];
    if (!id) { G.fam = null; return; }
    for (const fm of DS.FAMILIARS[id].forms) S.loadSet(fm.sprite);
    G.fam = make(id, 0);
  };
  F.load = function () {
    try { const u = JSON.parse(localStorage.getItem("dl-side-fam-won") || "[]"); if (Array.isArray(u)) won = new Set(u.filter((id) => DS.FAMILIARS[id])); } catch (e) { /* storage blocked */ }
    try { const id = localStorage.getItem("dl-side-fam"); if (id && won.has(id)) pick = id; } catch (e) { /* storage blocked */ }
  };

  // ---------------- winning them (Robert 2026-11-20) ----------------
  // Every map is 10 levels; the boss of each map's level 5 lets the player choose one familiar to win, for good (kept on
  // this device). Until won, a familiar stays a secret "???" in the pickers, and the wallpaper leaves it out too.
  // A tester can view them all won or all locked (src/unlocks.js) without changing what is saved.
  let won = new Set();
  F.won = (id) => { const t = DS.Unlock.mode(); return t === "all" ? !!DS.FAMILIARS[id] : t === "none" ? false : won.has(id); };
  F.locked = () => DS.FAM_ORDER.filter((id) => !F.won(id));
  F.win = function (id) {
    if (!DS.FAMILIARS[id]) return;
    won.add(id);
    try { localStorage.setItem("dl-side-fam-won", JSON.stringify([...won])); } catch (e) { /* storage blocked */ }
  };
  F.winAll = () => DS.FAM_ORDER.forEach(F.win);
  // Does clearing level index n (0-based) earn a familiar? Level 5, 15, 25... (each map's middle boss), while any are left.
  F.rewardLevel = (n) => (n + 1) % DS.FAM_UNLOCK.every === DS.FAM_UNLOCK.at && F.locked().length > 0;
  function make(id, formIx) {
    const d = DS.FAMILIARS[id], p = G.player;
    const x = p ? p.x - (p.dir || 1) * 40 : 300, y = p ? p.y + (d.fly ? d.fly[1] : 0) : Wd.FLOOR;
    return { id, form: formIx, kills: 0, x, y, vx: 0, vy: 0, w: 22, h: 26, dir: p ? p.dir : 1, onGround: false,
      state: "move", st: 0, cd: 1, runT: 0, hp: 1, max: 1, down: 0, stuckT: 0, jumpCd: 0, tgt: null,
      blessT: 0, blessCd: d.blessEvery || 0, furyCd: 0, howlCd: 6, wailCd: 8, stormCd: 10, capCd: 4, flash: 0 };
  }
  // after a fall or a new level: back at the knight's side, healed
  F.reset = function () {
    if (!G.fam) return;
    const f = G.fam, p = G.player;
    G.famWalls = []; G.caps = [];
    Object.assign(f, { x: p.x - p.dir * 40, y: p.y, vx: 0, vy: 0, state: "move", st: 0, down: 0, tgt: null });
    sizeUp(f); f.hp = f.max;
  };
  function sizeUp(f) {
    const d = DS.FAMILIARS[f.id], fm = form(f);
    f.max = Math.round((d.hp || 1) * (fm.mult || 1));
    f.hp = Math.min(f.hp, f.max);
  }
  // the next form (or straight to `to`, for testing)
  F.grow = function (to) {
    const f = G.fam; if (!f) return;
    const d = def(), n = d.forms.length;
    const nf = to == null ? Math.min(n - 1, f.form + 1) : clamp(to, 0, n - 1);
    if (nf === f.form) return;
    f.form = nf; sizeUp(f); f.hp = f.max;
    fx().ring(f.x, f.y - 10, "rgba(" + d.color + ",0.8)"); fx().ring(f.x, f.y - 20, "rgba(" + d.color + ",0.6)");
    G.banner = { txt: (f.form > 0 ? d.name + " grows: " : "") + form(f).name, t: 0 };
    puffAt(f.x, f.y - 12, d.color, 16);
  };
  F.onKill = function () {
    const f = G.fam; if (!f) return;
    f.kills++;
    const g = def().grow;
    if (f.form < g.length && f.kills >= g[f.form]) F.grow();
  };

  // ---------------- helpers ----------------
  const alive = (e) => !e.dead && e.spawnT <= 0 && !e.d.dummy;
  // the Drowned near the knight, nearest the familiar first; `pref` picks a kind of foe first
  function seek(f, sight, pref) {
    const p = G.player;
    let best = null, bd = 1e9;
    for (const e of G.foes) {
      if (!alive(e) || Math.abs(e.x - p.x) > sight || Math.abs(e.y - p.y) > 220) continue;
      const d = Math.abs(e.x - f.x) + Math.abs(e.y - f.y) * 0.6 - (pref && pref(e) ? 600 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function near(x, y, r, fn) { for (const e of G.foes) if (alive(e) && Math.hypot(e.x - x, (e.y - e.h / 2) - y) < r + e.w / 2) fn(e); }
  function hit(e, opt) { return DS.hitFoe(e, Object.assign({ noMult: true, noHeat: true, hitstop: 0, quiet: true, fam: true }, opt)); }
  function puffAt(x, y, c, n) { for (let i = 0; i < n; i++) G.fx.push({ kind: "mote", x: x + rnd(-14, 14), y: y + rnd(-14, 10), vx: rnd(-50, 50), vy: rnd(-120, -30), t: 0, life: rnd(0.4, 0.9), c: "rgba(" + c + "," }); }
  function blink(f, x, y) {
    G.fx.push({ kind: "portal", x: f.x, y: f.y, t: 0, life: 0.4 });
    f.x = x; f.y = y; f.vx = f.vy = 0; f.stuckT = 0;
    G.fx.push({ kind: "portal", x: f.x, y: f.y, t: 0, life: 0.4 });
  }

  // ---------------- the loop ----------------
  F.update = function (dt) {
    const f = G.fam, p = G.player;
    famT += dt;
    updateWalls(dt); updateCaps(dt);
    if (!f || !p) return;
    const d = def();
    f.st += dt; f.cd -= dt; f.jumpCd -= dt; f.flash = Math.max(0, f.flash - dt);
    if (p.bless > 0) p.bless = Math.max(0, p.bless - dt);
    if (p.fury > 0) p.fury = Math.max(0, p.fury - dt);
    // beaten down (the hound): lies there, then gets back up
    if (f.down > 0) {
      f.down -= dt; f.vx *= 0.9; physics(f, dt);
      if (f.down <= 0) { f.hp = f.max; f.state = "move"; fx().text(f.x, f.y - 30, "back up", "#e8d8b0", 11); }
      return;
    }
    if (p.dead) { follow(f, dt, -60); return; }
    // too far behind (another level, a cliff it can't climb): slips through a portal to its knight
    const far = Math.abs(f.x - p.x) > 600 || Math.abs(f.y - p.y) > 420;
    if (!d.fly && Math.abs(f.y - p.y) > 150 && Math.abs(f.x - p.x) < 260) f.stuckT += dt; else f.stuckT = 0;
    if (far || f.stuckT > 3) blink(f, p.x - p.dir * 40, d.fly ? p.y + d.fly[1] : p.y);
    ({ hound, golem, kindle, abigail, fred, wyvern })[f.id](f, d, dt);
  };

  // walk (or fly) to a spot beside the knight; off = how far in front (+) or behind (-) of where it faces
  function follow(f, dt, off, speedMult = 1) {
    const p = G.player, d = def();
    const tx = p.x + p.dir * off;
    if (d.fly) {
      const ty = p.y + d.fly[1] - (form(f).up || 0) + Math.sin(famT * 2.4) * 6; // bigger forms fly higher
      const k = Math.min(1, dt * 4);
      f.vx = (tx - f.x) * 4; f.vy = (ty - f.y) * 4;
      f.x += (tx - f.x) * k; f.y += (ty - f.y) * k;
      if (Math.abs(tx - f.x) > 6) f.dir = Math.sign(tx - f.x); else f.dir = p.dir;
      f.runT += Math.abs(f.vx) * dt;
      return;
    }
    walkTo(f, dt, tx, d.speed * speedMult * (Math.abs(tx - f.x) > 200 ? 1.4 : 1), 18); // hurries to catch up
    if (Math.abs(tx - f.x) <= 18 && Math.abs(f.vx) < 30) f.dir = p.dir;
  }
  function walkTo(f, dt, tx, speed, stop) {
    const dx = tx - f.x, want = Math.abs(dx) > stop ? Math.sign(dx) * Math.min(speed, Math.abs(dx) * 5) : 0;
    const acc = f.onGround ? 2400 : 1400;
    f.vx += clamp(want - f.vx, -acc * dt, acc * dt);
    if (want) f.dir = Math.sign(want);
    // climb to a knight (or a foe) above, hop what's in the way, drop through a platform to one below
    const p = G.player, dy = f.y - p.y;
    if (f.onGround && f.jumpCd <= 0 && ((dy > 60 && Math.abs(p.x - f.x) < 240) || (f.hitWall && want))) {
      f.vy = -Math.sqrt(2 * P.gravity * Math.min(240, Math.max(90, dy + 40))); f.jumpCd = 0.6; f.onGround = false;
    }
    if (f.onPlat && dy < -60) { f.dropT = 0.3; f.y += 2; }
    physics(f, dt);
  }
  function physics(f, dt) {
    f.vy = Math.min(P.maxFall, f.vy + P.gravity * dt);
    f.dropT = Math.max(0, (f.dropT || 0) - dt);
    Wd.move(f, dt);
    f.x = clamp(f.x, 40 + f.w / 2, Wd.W - 40 - f.w / 2);
    if (f.y > Wd.H + 200) { const p = G.player; blink(f, p.x - p.dir * 40, p.y); }
    f.runT += Math.abs(f.vx) * dt;
  }

  // ---------------- the Bone Hound ----------------
  const shooter = (e) => e.d.ai === "archer" || e.d.ai === "caster";
  function hound(f, d, dt) {
    const fm = form(f), b = d.bite, mult = fm.mult;
    // the Grave Warg howls: the Drowned near it freeze in terror
    if (d.howl && f.form === 3 && (f.howlCd -= dt) <= 0 && seek(f, d.howl.r)) {
      f.howlCd = d.howl.every; f.state = "howl"; f.st = 0;
      fx().text(f.x, f.y - 34, "HOWL", "#c8b0ff", 12); fx().shake(3);
      near(f.x, f.y - 10, d.howl.r, (e) => { if (!e.d.boss) { e.state = "hurt"; e.st = 0; e.stun = d.howl.stun; } });
    }
    if (f.state === "howl") { f.vx *= 0.8; physics(f, dt); if (f.st > 0.6) { f.state = "move"; f.st = 0; } return; }
    if (f.state === "bite") {
      if (!f.bit && f.st >= b.at) {
        f.bit = true;
        const e = f.tgt;
        if (e && alive(e) && Math.abs(e.x - f.x) < b.reach + e.w / 2 + 10 && Math.abs(e.y - f.y) < 50) bite(f, d, e, mult);
      }
      f.vx *= 0.85; physics(f, dt);
      if (f.st >= b.dur) { f.state = "move"; f.st = 0; f.cd = b.cd; }
      return;
    }
    if (f.state === "leap") {
      const e = f.tgt;
      if (e && alive(e) && !f.bit && Math.abs(e.x - f.x) < e.w / 2 + 16 && f.y > e.y - e.h && f.y - f.h < e.y) { f.bit = true; bite(f, d, e, mult * 1.2); }
      physics(f, dt);
      if (f.onGround && f.st > 0.1) { f.state = "move"; f.st = 0; f.cd = b.cd; }
      return;
    }
    const e = f.tgt = seek(f, d.sight, (x) => shooter(x) || x.kbT > 0);
    if (!e) { follow(f, dt, -50); return; }
    const dx = e.x - f.x, adx = Math.abs(dx);
    f.dir = Math.sign(dx) || f.dir;
    if (f.cd <= 0 && adx < b.reach + e.w / 2 && Math.abs(e.y - f.y) < 40) { f.state = "bite"; f.st = 0; f.bit = false; f.vx = f.dir * 120; physics(f, dt); return; }
    // from the Bone Hound on: leaps at prey from afar
    if (f.form >= 1 && f.cd <= 0 && f.onGround && adx > d.leap.min && adx < d.leap.max && Math.abs(e.y - f.y) < 60) {
      f.state = "leap"; f.st = 0; f.bit = false; f.vx = f.dir * d.leap.vx; f.vy = d.leap.vy; f.onGround = false; physics(f, dt); return;
    }
    walkTo(f, dt, e.x - f.dir * (b.reach * 0.6 + e.w / 2), d.speed, 4);
  }
  function bite(f, d, e, mult) {
    const fm = form(f);
    hit(e, { dmg: d.bite.dmg * mult, kb: d.bite.kb, dir: f.dir, fromX: f.x, burn: f.form >= 2 ? d.burn : 0, color: "#f0e0c0", sparkColor: "#e8d8b0" });
    const mx = d.bleed.max[f.form];
    e.bleed = { n: Math.min(mx, ((e.bleed && e.bleed.n) || 0) + 1), t: d.bleed.dur, tick: 0.5, dps: d.bleed.dps * fm.mult };
  }
  // a Drowned's blow lands on the hound (the only familiar they can hurt)
  F.struck = function (x0, y0, x1, y1, dmg) {
    const f = G.fam;
    if (!f || f.id !== "hound" || f.down > 0 || f.hurtCd > famT) return false;
    if (f.x + f.w / 2 < x0 || f.x - f.w / 2 > x1 || f.y < y0 || f.y - f.h > y1) return false;
    f.hp -= dmg; f.flash = 0.15; f.hurtCd = famT + 0.4;
    if (f.state === "bite" || f.state === "leap") { f.state = "move"; f.st = 0; }
    fx().text(f.x, f.y - 30, "-" + Math.round(dmg), "#e0a080", 11);
    if (f.hp <= 0) { const d = def(); f.down = d.down * (f.form === 3 ? 0.5 : 1); f.state = "down"; f.vx = 0; fx().text(f.x, f.y - 40, d.forms[f.form].name + " is down", "#e0b090", 12); }
    return true;
  };

  // ---------------- Derek ----------------
  function golem(f, d, dt) {
    const fm = form(f), p = G.player;
    if (f.state === "cast") {
      f.vx *= 0.7; physics(f, dt);
      if (!f.built && f.st >= d.castAt) { f.built = true; raise(f, d, fm); }
      if (f.st >= d.cast) { f.state = "move"; f.st = 0; f.cd = d.cd; }
      return;
    }
    // the Drowned closing in on his knight, on the knight's ground, with room for a wall between
    let e = null, bd = 1e9;
    for (const x of G.foes) {
      if (!alive(x) || x.d.ai === "archer" || x.d.ai === "caster") continue;
      const adx = Math.abs(x.x - p.x);
      if (adx < d.trigger && adx > 40 && Math.abs(x.y - p.y) < 60 && adx < bd) { bd = adx; e = x; }
    }
    if (e && f.cd <= 0 && p.onGround) {
      // the wall rises between them; a foe already close is shoved back past it
      const side = Math.sign(e.x - p.x), wx = p.x + side * Math.max(48, Math.min(d.gap, bd - 30));
      const taken = G.famWalls.some((w) => Math.abs(w.x - wx) < 60);
      if (!taken && !Wd.solidAt(wx, p.y - 10) && Wd.groundAt(wx, p.y)) { f.state = "cast"; f.st = 0; f.built = false; f.dir = side; f.at = wx; f.atY = Wd.surfaceBelow(wx, p.y - 30); return; }
    }
    follow(f, dt, -55);
  }
  function raise(f, d, fm) {
    const own = G.famWalls.filter((w) => !w.gone);
    while (own.length >= fm.walls) { const o = own.shift(); o.gone = true; }
    const w = { x: f.at, y: f.atY, w: d.wall.w * (f.form === 3 ? 1.2 : 1), h: d.wall.h * (f.form === 3 ? 1.2 : 1), hits: fm.hits, max: fm.hits, t: 0, life: d.life, v: f.form >= 2 ? 3 : 1 + (G.famWalls.length % 2), cut: fm.cut || 0, burst: fm.burst || null, hitT: 0, dead: false, isWall: true };
    // anything standing where it rises is shoved aside
    const side = Math.sign(w.x - G.player.x) || 1;
    for (const e of G.foes) if (alive(e) && Math.abs(e.y - w.y) < 40 && (e.x - w.x) * side < w.w / 2 + e.w / 2 && (e.x - G.player.x) * side > 0) { e.x = w.x + side * (w.w / 2 + e.w / 2 + 2); e.vx = side * 200; e.kbT = 0.15; }
    G.famWalls.push(w);
    fx().shake(3); fx().puff(w.x, w.y, 10, "rgba(140,130,110,0.6)");
  }
  function updateWalls(dt) {
    for (const w of G.famWalls) {
      w.t += dt; w.hitT = Math.max(0, w.hitT - dt);
      if (w.t >= w.life && !w.gone) fall(w);
    }
    G.famWalls = G.famWalls.filter((w) => !w.gone || w.t < w.goneAt + 0.4);
  }
  function fall(w) {
    if (w.gone) return;
    w.gone = true; w.dead = true; w.goneAt = w.t;
    fx().puff(w.x, w.y, 12, "rgba(140,130,110,0.6)");
    if (w.burst) { // Derek the Bastion: his walls burst
      fx().shake(5); G.fx.push({ kind: "slam", x: w.x, y: w.y, t: 0, life: 0.4, c: "200,190,160" });
      near(w.x, w.y - 30, w.burst.r, (e) => { hit(e, { dmg: w.burst.dmg, kb: 260, kbY: 260, dir: Math.sign(e.x - w.x) || 1, fromX: w.x, color: "#e0d8c0" }); if (!e.d.boss && alive(e)) { e.state = "hurt"; e.st = 0; e.stun = w.burst.stun; } });
    }
  }
  // the walls the Drowned can't walk through (src/world.js move)
  F.walls = () => G.famWalls.filter((w) => !w.gone && w.t > 0.15).map((w) => ({ x: w.x - w.w / 2, y: w.y - w.h, w: w.w, h: w.h }));
  // a melee Drowned near a wall (and nearer it than the knight) turns on the wall
  F.lure = function (e) {
    if (!G.famWalls.length || e.d.boss || !(e.d.ai === "walker" || e.d.ai === "shield" || e.d.ai === "leaper")) return null;
    const d = DS.FAMILIARS.golem, p = G.player;
    let best = null, bd = d.lure;
    for (const w of G.famWalls) {
      if (w.gone || w.t < 0.15) continue;
      const dd = Math.abs(w.x - e.x);
      if (dd < bd && Math.abs(w.y - e.y) < 60 && (p.dead || dd < Math.abs(p.x - e.x))) { bd = dd; best = w; }
    }
    return best;
  };
  F.hitWall = function (w, e) {
    if (w.gone) return;
    w.hits--; w.hitT = 0.2;
    fx().spark(w.x, w.y - w.h * 0.5, "#d8d0c0", 6);
    if (w.cut && e && alive(e)) hit(e, { dmg: w.cut, kb: 140, dir: Math.sign(e.x - w.x) || 1, fromX: w.x, color: "#a8f0ff", sparkColor: "#a8f0ff" });
    if (w.hits <= 0) fall(w);
  };
  // the foes' shots stop on a wall (and knock a hit off it)
  F.blocks = function (s) {
    for (const w of G.famWalls) if (!w.gone && Math.abs(s.x - w.x) < w.w / 2 + 4 && s.y > w.y - w.h && s.y < w.y + 4) { F.hitWall(w, null); return true; }
    return false;
  };

  // ---------------- Kindle ----------------
  function kindle(f, d, dt) {
    const p = G.player;
    if (f.state === "pour") {
      f.vx *= 0.7; physics(f, dt); f.dir = Math.sign(p.x - f.x) || f.dir;
      if (!f.poured && f.st > d.pour * 0.5) {
        f.poured = true;
        const left = p.abilCd; p.abilCd *= d.cut;
        fx().text(p.x, p.y - p.h - 20, "Kindle: -" + (left - p.abilCd).toFixed(1) + " s", "#ffc870", 12);
        puffAt(p.x, p.y - p.h * 0.5, "255,190,90", 10);
      }
      if (f.st >= d.pour) { f.state = "move"; f.st = 0; f.cd = d.every; }
      return;
    }
    const busy = G.foes.some((e) => alive(e) && Math.abs(e.x - p.x) < 260 && Math.abs(e.y - p.y) < 160);
    if (f.cd <= 0 && p.abilCd > d.minLeft && Math.abs(f.x - p.x) < 120 && Math.abs(f.y - p.y) < 40) { f.state = "pour"; f.st = 0; f.poured = false; return; }
    // he scuttles ahead to light the way, and keeps behind his knight in a fight
    follow(f, dt, busy ? -45 : d.lead, busy ? 1 : 1.05);
  }

  // ---------------- Abigail ----------------
  function abigail(f, d, dt) {
    const fm = form(f), p = G.player;
    if ((f.blessCd -= dt) <= 0 && G.foes.some(alive)) { // she blesses her knight
      f.blessCd = d.blessEvery; p.bless = d.blessFor; p.blessAmt = fm.bless; f.state = "bless"; f.st = 0;
      fx().text(p.x, p.y - p.h - 22, "Blessed", "#8ff5d8", 13); fx().ring(p.x, p.y - 4, "rgba(90,245,205,0.8)");
    }
    if (fm.wail && (f.wailCd -= dt) <= 0 && seek(f, fm.wail.r)) { // the Queen of Sorrows wails
      f.wailCd = fm.wail.every; f.state = "bless"; f.st = 0;
      fx().text(f.x, f.y - 30, "WAIL", "#8ff5d8", 13); fx().shake(3);
      G.fx.push({ kind: "slam", x: f.x, y: f.y, t: 0, life: 0.5, c: "90,245,205" });
      near(p.x, p.y - 30, fm.wail.r, (e) => { curse(e, fm.curse); if (!e.d.boss) { e.state = "hurt"; e.st = 0; e.stun = fm.wail.stun; } });
    }
    if (f.state === "throw" && !f.thrown && f.st >= d.throwAt) { f.thrown = true; if (f.tgt && alive(f.tgt)) orb(f, d, fm, f.tgt, false); }
    if ((f.state === "throw" && f.st >= d.throwT) || (f.state === "bless" && f.st >= 0.6)) { f.state = "move"; f.st = 0; }
    if (f.state === "move" && f.cd <= 0) {
      const e = seek(f, d.sight);
      if (e) { f.tgt = e; f.state = "throw"; f.st = 0; f.thrown = false; f.cd = d.cd; }
    }
    follow(f, dt, d.fly[0]);
    if (f.state === "throw" && f.tgt) f.dir = Math.sign(f.tgt.x - f.x) || f.dir;
  }
  function curse(e, amt) {
    if ((e.curse || 0) >= amt) return;
    e.curse = amt; fx().text(e.x, e.y - e.h - 16, "CURSED", "#8ff5d8", 10);
  }
  function orb(f, d, fm, e, leapt, x = f.x + f.dir * 10, y = f.y - 14) {
    const a = Math.atan2(e.y - e.h / 2 - y, e.x - x) + (leapt ? 0 : rnd(-0.6, 0.6));
    G.shots.push({ team: "p", kind: "soul", x, y, vx: Math.cos(a) * d.orbSpeed, vy: Math.sin(a) * d.orbSpeed, r: 9, life: d.orbLife, hit: new Set(), ghost: true,
      tgt: e, dmg: d.dmg * fm.mult, pierce: 0,
      update(s, dt) { // homes on its foe (a new one if it falls)
        if (!s.tgt || !alive(s.tgt)) s.tgt = nearestTo(s.x, s.y, 300, s.hit);
        if (!s.tgt) return;
        const want = Math.atan2(s.tgt.y - s.tgt.h / 2 - s.y, s.tgt.x - s.x), cur = Math.atan2(s.vy, s.vx);
        let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = cur + clamp(da, -5 * dt, 5 * dt), sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      },
      onHit(s, t) {
        hit(t, { dmg: s.dmg, kb: 60, dir: Math.sign(s.vx) || 1, fromX: s.x - s.vx, color: "#8ff5d8", sparkColor: "#5af5cd" });
        curse(t, fm.curse);
        if (fm.leap && !leapt) { const n = nearestTo(t.x, t.y - t.h / 2, 220, new Set([t])); if (n) orb(f, d, fm, n, true, t.x, t.y - t.h / 2); }
      } });
  }
  function nearestTo(x, y, r, skip) {
    let best = null, bd = r;
    for (const e of G.foes) { if (!alive(e) || (skip && skip.has(e))) continue; const dd = Math.hypot(e.x - x, e.y - e.h / 2 - y); if (dd < bd) { bd = dd; best = e; } }
    return best;
  }

  // ---------------- Fred ----------------
  function fred(f, d, dt) {
    const fm = form(f), p = G.player;
    if (fm.storm && (f.stormCd -= dt) <= 0 && seek(f, fm.storm.r)) { // Spore Storm
      f.stormCd = fm.storm.every; f.state = "heal"; f.st = 0;
      fx().text(f.x, f.y - 40, "SPORE STORM", "#b8f080", 12);
      for (let i = 0; i < 30; i++) G.fx.push({ kind: "mote", x: p.x + rnd(-fm.storm.r, fm.storm.r), y: p.y - rnd(0, 120), vx: rnd(-40, 40), vy: rnd(-40, 20), t: 0, life: rnd(0.8, 1.6), c: "rgba(170,230,110," });
      near(p.x, p.y - 30, fm.storm.r, (e) => { if (!e.d.boss) { e.state = "hurt"; e.st = 0; e.stun = fm.storm.sleep; e.sleep = fm.storm.sleep; } });
    }
    if ((f.capCd -= dt) <= 0 && f.state === "move" && f.onGround && Math.abs(f.x - p.x) < 240) { // a glowcap sprouts where he stands
      f.capCd = fm.capEvery;
      const mine = G.caps.filter((c) => !c.used);
      if (mine.length >= d.capMax) mine[0].used = true;
      G.caps.push({ x: f.x, y: f.y, t: 0, life: d.capLife, heal: fm.heal, v: 1 + Math.floor(Math.random() * 3), used: false });
      f.state = "heal"; f.st = 0;
    }
    if (f.state === "spit" && !f.spat && f.st >= d.spitAt) { f.spat = true; if (f.tgt && alive(f.tgt)) glob(f, d, fm, f.tgt); }
    if ((f.state === "spit" && f.st >= d.spit) || (f.state === "heal" && f.st >= 0.6)) { f.state = "move"; f.st = 0; }
    const lagging = Math.abs(f.x - p.x) > 240; // left behind: catch up first, spit later
    if (f.state === "move" && f.cd <= 0 && !lagging) {
      const e = seek(f, d.sight);
      if (e && Math.abs(e.x - f.x) < d.sight + 60) { f.tgt = e; f.state = "spit"; f.st = 0; f.spat = false; f.cd = d.cd; }
    }
    if (f.state === "move") follow(f, dt, -70); else { f.vx *= 0.8; physics(f, dt); }
    if (f.state === "spit" && f.tgt) f.dir = Math.sign(f.tgt.x - f.x) || f.dir;
  }
  function glob(f, d, fm, e) {
    const sx = f.x + f.dir * 10, sy = f.y - 18, tx = e.x, ty = e.y - e.h * 0.5;
    const tt = Math.max(0.25, Math.abs(tx - sx) / d.globSpeed), g = 700;
    const burst = (s, t) => {
      const slowIt = (x) => { x.spore = Math.max(x.spore || 0, d.slowFor); };
      if (t) { hit(t, { dmg: d.dmg * fm.mult, kb: 40, dir: Math.sign(s.vx) || 1, fromX: s.x - s.vx, color: "#c8f090", sparkColor: "#a0e060" }); slowIt(t); }
      if (fm.cloud) { near(s.x, s.y, fm.cloud, slowIt); for (let i = 0; i < 10; i++) G.fx.push({ kind: "dust", x: s.x + rnd(-fm.cloud * 0.6, fm.cloud * 0.6), y: s.y + rnd(-20, 20), vx: rnd(-20, 20), vy: rnd(-20, 5), t: 0, life: rnd(0.6, 1), c: "rgba(160,220,100,0.35)", r: rnd(8, 14) }); }
    };
    G.shots.push({ team: "p", kind: "spore", x: sx, y: sy, vx: (tx - sx) / tt, vy: clamp((ty - sy) / tt - 0.5 * g * tt, -600, 400), g, r: 7, life: 2, hit: new Set(), pierce: 0,
      onHit: (s, t) => burst(s, t), onEnd: (s, why) => { if (why !== "foe") burst(s, null); } });
  }
  function updateCaps(dt) {
    const p = G.player;
    for (const c of G.caps) {
      c.t += dt;
      if (c.used || !p || p.dead) continue;
      if (Math.abs(p.x - c.x) < 22 && Math.abs(p.y - c.y) < 20 && c.t > 0.5 && p.hp < p.max) {
        c.used = true; c.usedAt = c.t;
        const h = Math.min(c.heal, p.max - p.hp); p.hp += h;
        fx().text(p.x, p.y - p.h - 10, "+" + Math.round(h), "#9af07a", 14);
        puffAt(c.x, c.y - 6, "170,240,120", 10);
      }
    }
    G.caps = G.caps.filter((c) => (c.used ? c.t - (c.usedAt || c.t) < 0.3 : c.t < c.life));
  }

  // ---------------- David ----------------
  function wyvern(f, d, dt) {
    const fm = form(f), p = G.player;
    if (fm.fury && (f.furyCd -= dt) <= 0 && G.foes.filter((e) => alive(e) && Math.abs(e.x - p.x) < 320).length >= 2) { // War Fury
      f.furyCd = fm.fury.every; p.fury = fm.fury.dur; p.furyAmt = fm.fury.dmg; f.state = "roar"; f.st = 0;
      fx().text(p.x, p.y - p.h - 24, "WAR FURY", "#ff8a6a", 14); fx().ring(p.x, p.y - 4, "rgba(255,90,70,0.8)");
    }
    if (f.state === "spit" && !f.spat && f.st >= d.spitAt) { f.spat = true; if (f.tgt && alive(f.tgt)) bolt(f, d, fm, f.tgt); }
    if ((f.state === "spit" && f.st >= d.spit) || (f.state === "roar" && f.st >= 0.6)) { f.state = "move"; f.st = 0; }
    if (f.state === "move" && f.cd <= 0) {
      const e = seek(f, d.sight);
      if (e) { f.tgt = e; f.state = "spit"; f.st = 0; f.spat = false; f.cd = fm.cd; }
    }
    follow(f, dt, d.fly[0]);
    if (f.state === "spit" && f.tgt) f.dir = Math.sign(f.tgt.x - f.x) || f.dir;
  }
  function bolt(f, d, fm, e) {
    const sx = f.x + f.dir * 18, sy = f.y - 10, a = Math.atan2(e.y - e.h * 0.55 - sy, e.x - sx);
    G.shots.push({ team: "p", kind: "wyvbolt", x: sx, y: sy, vx: Math.cos(a) * d.boltSpeed, vy: Math.sin(a) * d.boltSpeed, r: 8, life: d.boltLife, hit: new Set(), pierce: 0,
      onHit(s, t) {
        hit(t, { dmg: d.dmg * fm.mult, kb: 90, dir: Math.sign(s.vx) || 1, fromX: s.x - s.vx, burn: fm.burn || 0, color: "#ff9a7a", sparkColor: "#ff6040" });
        if (fm.chain) { // it leaps on to the Drowned nearby
          let from = t; const done = new Set([t]);
          for (let i = 0; i < fm.chain.n; i++) {
            const n = nearestTo(from.x, from.y - from.h / 2, fm.chain.r, done); if (!n) break;
            done.add(n); G.fx.push({ kind: "zap", x: from.x, y: from.y - from.h / 2, x2: n.x, y2: n.y - n.h / 2, t: 0, life: 0.2 });
            hit(n, { dmg: d.dmg * fm.mult * fm.chain.dmg, kb: 40, dir: Math.sign(n.x - from.x) || 1, fromX: from.x, color: "#ffb090", sparkColor: "#ff6040" });
            from = n;
          }
        }
      } });
  }

  // ---------------- what the Drowned carry from them ----------------
  // bleeding from the hound's bites, Fred's spores wearing off; returns how much slower the foe moves
  F.tickFoe = function (e, dt) {
    if (e.spore > 0) e.spore = Math.max(0, e.spore - dt);
    if (e.sleep > 0) e.sleep = Math.max(0, e.sleep - dt);
    if (e.bleed) {
      e.bleed.t -= dt; e.bleed.tick -= dt;
      if (e.bleed.tick <= 0) { e.bleed.tick = 0.5; hit(e, { dmg: e.bleed.dps * e.bleed.n * 0.5, kb: 0, color: "#e05050", sparkColor: "#a02020" }); }
      if (e.bleed && e.bleed.t <= 0) e.bleed = null;
    }
    return (e.spore > 0 ? 1 - DS.FAMILIARS.fred.slow : 1) * (e.curse ? 1 - e.curse : 1);
  };

  // ---------------- drawing ----------------
  function frameOf(f) {
    const set = form(f).sprite, fr = (a, q) => S.frame(set, a, q);
    if (f.down > 0) return set.death ? fr("death", 0) : fr("hurt", 0);
    if (f.flash > 0.05 && set.hurt) return fr("hurt", 0);
    switch (f.state) {
      case "bite": return fr("attack", f.st / DS.FAMILIARS.hound.bite.dur);
      case "leap": return fr(f.vy < 0 ? "jump" : "fall", 0);
      case "howl": return fr("attack", 0.99);
      case "cast": return fr("cast", f.st / DS.FAMILIARS.golem.cast);
      case "pour": return fr("cast", 0);
      case "throw": return fr("attack", f.st / DS.FAMILIARS.abigail.throwT);
      case "spit": return fr("attack", f.st / (DS.FAMILIARS[f.id].spit || 0.5));
      case "bless": case "heal": case "roar": return fr("cast", 0);
    }
    const d = def();
    if (f.id === "wyvern") return fr("run", ((famT * 9) % 4) / 4); // his wings never stop
    if (d.fly) return fr(Math.abs(f.vx) > 30 ? "run" : "idle", ((f.runT / 26) % 4) / 4);
    if (!f.onGround) return fr(f.vy < 0 ? "jump" : "fall", 0);
    if (Math.abs(f.vx) > 20) return fr("run", ((f.runT / (f.id === "hound" ? 26 : 16)) % 4) / 4);
    return fr("idle", 0);
  }
  // behind the knight: walking familiars, Derek's walls, glowcaps; in front: the fliers
  F.draw = function (ctx, front) {
    if (!front) {
      for (const c of G.caps) {
        const a = c.used ? 1 - (c.t - c.usedAt) / 0.3 : Math.min(1, c.t / 0.3, (c.life - c.t) / 1.5);
        glow(ctx, c.x, c.y - 6, 18, "170,240,120", 0.35 * a);
        S.drawFx(ctx, "glowcap" + c.v, c.x, c.y + 2, { ay: 1, alpha: a, sy: Math.min(1, c.t / 0.25) });
      }
      for (const w of G.famWalls) {
        const rise = Math.min(1, w.t / 0.3), a = w.gone ? Math.max(0, 1 - (w.t - w.goneAt) / 0.4) : 1;
        const shake = w.hitT > 0 ? Math.sin(w.t * 80) * 2 : 0;
        const name = "boulder" + w.v + (w.hits >= w.max * 0.6 ? 1 : 2), sc = w.h / 58;
        ctx.save(); ctx.beginPath(); ctx.rect(w.x - 60, w.y - w.h - 30, 120, w.h + 32); ctx.clip();
        S.drawFx(ctx, name, w.x + shake, w.y + 3 + (1 - rise) * w.h, { ay: 1, scale: sc, alpha: a });
        ctx.restore();
      }
    }
    const f = G.fam; if (!f) return;
    const d = def();
    if (!!d.fly !== !!front) return;
    if (f.id === "kindle") glow(ctx, f.x, f.y - 14, d.light, "255,190,90", 0.22 + 0.04 * Math.sin(famT * 7));
    if (f.id === "abigail") glow(ctx, f.x, f.y - 14, 40, "90,245,205", 0.18);
    if (!d.fly) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(f.x, Wd.surfaceBelow(f.x, f.y - 2), f.w * 0.7, 3, 0, 0, TAU); ctx.fill(); }
    const rec = frameOf(f), blink = f.down > 0 && f.down < 1.5 && Math.floor(famT * 10) % 2;
    S.draw(ctx, rec, f.x, f.y + 1, f.dir, 1, f.flash > 0 ? ["#ffffff", 0.7] : null, blink ? 0.5 : 1);
  };
  // the knight's blessing / fury glow
  F.drawAura = function (ctx, p) {
    if (p.bless > 0) glow(ctx, p.x, p.y - p.h / 2, 46, "90,245,205", 0.18 * Math.min(1, p.bless));
    if (p.fury > 0) glow(ctx, p.x, p.y - p.h / 2, 46, "255,90,70", 0.18 * Math.min(1, p.fury));
  };
  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  F.glow = glow;
})(window.DS = window.DS || {});
