/* The ten kits in side view: three-hit combos (up-swings launch, a down-swing in the air is a plunge),
   ranged shots, and every kit's ability ported from the main game. Also the Drowned Sovereign's moves (DS.Boss). */
"use strict";
(function (DS) {
  const G = DS.G, I = DS.Input, Wd = DS.World, P = DS.PHYS;
  const { clamp, rnd } = DS.util;
  const fx = () => DS.fx;
  const STEP_DMG = [1, 1.1, 1.4], STEP_KB = [0.4, 0.5, 1.6]; // the first two hits keep foes in reach, the finisher throws them

  // ---------------- attacks ----------------
  function canAct(p) {
    return !p.dashT && !p.lunge && !p.guard && !(p.cast && p.cast.lock) && !p.waltz && p.hurtT <= 0.2 && !p.plunge && p.charge < 0;
  }

  function startAttack(p) {
    const a = p.k.attack, ranged = a.type === "bolt" || a.type === "frost" || a.type === "chain";
    if (!p.onGround && I.y > 0.5 && !ranged) { // plunge
      p.plunge = true; p.plungeHits = new Set(); p.vx = 0; p.atk = null;
      return;
    }
    const step = p.atk || p.comboT > 0 ? (p.comboStep + 1) % 3 : 0;
    p.comboStep = step;
    let dur = a.cd / (1 + (p.k.tithe ? p.stacks * p.k.tithe.atk : 0));
    if (step === 2 && a.heavy) dur *= 1.15;
    p.atk = { step, t: 0, dur, hits: new Set(), up: I.y < -0.5, down: I.y > 0.5 && !p.onGround, ranged, fired: false, id: ++G.swingId };
    if (p.onGround && !ranged) p.vx += p.dir * (a.heavy ? 90 : 140);
    if (!p.onGround && p.vy > 0) p.vy *= 0.35; // a little hang time in the air
  }

  function meleeBox(p, atk) {
    const a = p.k.attack, d = p.dir;
    if (atk.up) return [p.x - a.range * 0.55, p.y - p.h - a.range * 0.85, p.x + a.range * 0.55, p.y - p.h * 0.35];
    if (a.type === "thrust") {
      const cy = p.y - p.h * 0.6, hh = a.h / 2 + 10;
      return d > 0 ? [p.x - 6, cy - hh, p.x + a.range, cy + hh] : [p.x - a.range, cy - hh, p.x + 6, cy + hh];
    }
    const back = a.back || 12, top = p.y - p.h * 0.5 - a.h / 2 - 14, bot = p.y + 6;
    return d > 0 ? [p.x - back, top, p.x + a.range, bot] : [p.x - a.range, top, p.x + back, bot];
  }
  DS.meleeBox = meleeBox;

  function meleeTick(p) {
    const atk = p.atk, a = p.k.attack;
    if (atk.t < atk.dur * 0.22 || atk.t > atk.dur * 0.58) return;
    if (!atk.slashed) {
      atk.slashed = true;
      G.fx.push({ kind: "slash", follow: p, t: 0, life: 0.16, step: atk.step, up: atk.up, type: a.type, lash: a.lash, range: a.range, h: a.h, color: p.k.color });
    }
    const [x0, y0, x1, y1] = meleeBox(p, atk);
    for (const e of G.foes) {
      if (e.dead || atk.hits.has(e)) continue;
      if (e.x + e.w / 2 > x0 && e.x - e.w / 2 < x1 && e.y > y0 && e.y - e.h < y1) {
        atk.hits.add(e);
        const kbY = atk.up ? 560 : atk.step === 2 ? 240 : 40;
        DS.hitFoe(e, { dmg: a.dmg * STEP_DMG[atk.step], kb: a.kb * STEP_KB[atk.step], kbY, dir: p.dir, heavy: a.heavy, hitstop: atk.step === 2 ? 0.08 : 0.045 });
      }
    }
  }

  // the ranged kits loose at a third of the swing; up aims high
  function fireShot(p) {
    const a = p.k.attack, atk = p.atk;
    const ang = atk.up ? -0.62 : atk.down ? 0.5 : 0;
    const vx = Math.cos(ang) * p.dir, vy = Math.sin(ang);
    const x = p.x + p.dir * 22, y = p.y - p.h * 0.62;
    if (a.type === "bolt") {
      G.shots.push({ team: "p", kind: "bolt", img: "arbBolt", x, y, x0: x, vx: vx * a.speed, vy: vy * a.speed, r: 7, life: a.range / a.speed, pierce: a.pierce, hit: new Set(),
        onHit: (s, e) => {
          const f = a.far, dist = Math.abs(s.x - s.x0), bonus = clamp((dist - f.from) / (f.to - f.from), 0, 1) * f.bonus;
          DS.hitFoe(e, { dmg: a.dmg * (1 + bonus), kb: 140, dir: Math.sign(s.vx) || 1, color: bonus > 0.2 ? "#fff3b0" : "#fff" });
        } });
    } else if (a.type === "frost") {
      G.shots.push({ team: "p", kind: "frost", img: "iceBoltBig", x, y, vx: vx * a.speed, vy: vy * a.speed, r: 9, life: a.range / a.speed, pierce: 0, hit: new Set(),
        onHit: (s, e) => DS.hitFoe(e, { dmg: a.dmg, kb: 110, dir: Math.sign(s.vx) || 1, chill: a.chill, color: "#bfe8ff", sparkColor: "#bfe8ff" }),
        onEnd: (s) => fx().spark(s.x, s.y, "#bfe8ff", 6) });
    } else if (a.type === "chain") {
      // the sickle flies out to range and is torn back, cutting both ways
      const s = { team: "p", kind: "sickle", img: "reaperSickle1", x, y, vx: p.dir * 1150, vy: vy * 1150, r: 14, life: 2, hit: new Set(), ghost: true, out: true, owner: p,
        onHit: (s, e) => DS.hitFoe(e, s.out
          ? { dmg: a.dmg, kb: a.kb, dir: Math.sign(s.vx) || 1, color: "#d9b8ff", sparkColor: "#c9a0ff" }
          : { dmg: a.dmg * a.back, kb: -160, dir: Math.sign(e.x - p.x) || 1, color: "#d9b8ff", sparkColor: "#c9a0ff" }),
        update: (s) => {
          const hx = p.x + p.dir * 10, hy = p.y - p.h * 0.6;
          if (s.out && Math.hypot(s.x - hx, s.y - hy) >= a.range) { s.out = false; s.hit = new Set(); }
          if (!s.out) {
            const dx = hx - s.x, dy = hy - s.y, d = Math.hypot(dx, dy) || 1;
            s.vx = dx / d * 1400; s.vy = dy / d * 1400;
            if (d < 24) s.life = 0;
          }
        } };
      G.shots.push(s);
    }
  }

  // ---------------- abilities ----------------
  const near = (x, y, r, fn) => { for (const e of G.foes.slice()) if (!e.dead && Math.hypot(e.x - x, (e.y - e.h / 2) - y) < r + e.w / 2) fn(e); };

  function ability(p) {
    const ab = p.k.ability;
    switch (ab.id) {
      case "illuminate": {
        p.cast = { anim: "cast", t: 0, dur: 0.25 };
        const cy = p.y - p.h / 2;
        near(p.x, cy, ab.radius, (e) => DS.hitFoe(e, { dmg: ab.dmg, kb: 360, kbY: 300, burn: ab.burn, color: "#ffe9a0", sparkColor: "#ffd27a" }));
        G.zones.push({ kind: "sanct", x: p.x, y: p.y, r: 140, t: 0, dur: ab.dur });
        G.fx.push({ kind: "flare", x: p.x, y: cy, t: 0, life: 0.5, scale: 2.2 });
        fx().shake(6);
        break;
      }
      case "lunge":
        p.cast = { anim: "cast", t: 0, dur: 0.42, lock: true, at: ab.coil, fn: () => {
          const s = { team: "p", kind: "dragon", x: p.x + p.dir * 40, y: p.y - 46, vx: p.dir * ab.speed, vy: 0, r: ab.r, life: ab.reach / ab.speed, ghost: true, eats: true, hit: new Set(), dir: p.dir,
            onHit: (s, e) => DS.hitFoe(e, { dmg: ab.dmg, kb: ab.kb, kbY: 220, dir: s.dir, color: "#ff9aa8", sparkColor: "#ff6070", hitstop: 0.06 }) };
          G.shots.push(s); fx().shake(5);
        } };
        G.fx.push({ kind: "coil", follow: p, t: 0, life: ab.coil });
        break;
      case "scatter":
        p.cast = { anim: "cast", t: 0, dur: 0.42, lock: true, at: 0.16, fn: () => {
          for (let i = 0; i < ab.count; i++) {
            const ang = -0.6 + (i / (ab.count - 1)) * 0.8, sp = 820;
            G.shots.push({ team: "p", kind: "bolt", img: "arbFlareBolt", x: p.x + p.dir * 20, y: p.y - 40, vx: Math.cos(ang) * sp * p.dir, vy: Math.sin(ang) * sp, g: 900, land: true,
              r: 7, life: 1.2, pierce: 0, hit: new Set(), onHit: (s, e) => DS.hitFoe(e, { dmg: ab.dmg, kb: 120, dir: Math.sign(s.vx) || 1 }),
              onEnd: (s) => flare(s.x, s.y, ab.flare) });
          }
        } };
        break;
      case "icebomb": {
        const vx = I.y < -0.5 ? 340 : I.y > 0.5 ? 700 : ab.vx, vy = I.y < -0.5 ? -780 : I.y > 0.5 ? -240 : ab.vy;
        p.cast = { anim: "cast", t: 0, dur: 0.3, at: 0.08, fn: () => {
          G.shots.push({ team: "p", kind: "bomb", img: "iceGem", x: p.x + p.dir * 20, y: p.y - 60, vx: vx * p.dir + p.vx * 0.3, vy, g: 1500, land: true, r: 12, life: 3, pierce: 0, hit: new Set(),
            onHit: () => {}, onEnd: (s) => iceBurst(s.x, s.y, ab) });
        } };
        break;
      }
      case "wall":
        p.cast = { anim: "cast", t: 0, dur: 0.6, lock: true, at: 0.28, fn: () => fireLine(p.x + p.dir * 34, Wd.surfaceBelow(p.x, p.y - 2), p.dir, ab) };
        break;
      case "snare":
        p.cast = { anim: "cast", t: 0, dur: 0.35 };
        near(p.x, p.y - p.h / 2, ab.radius, (e) => DS.hitFoe(e, { dmg: ab.dmg, root: ab.root, kb: -120, color: "#d9b8ff", sparkColor: "#b070ff" }));
        G.fx.push({ kind: "snare", x: p.x, y: p.y - p.h / 2, t: 0, life: 0.55, r: ab.radius });
        fx().shake(4);
        break;
      case "waltz":
        p.waltz = { t: 0, dur: ab.spin, n: 0 };
        break;
      case "reap": {
        const s = p.stacks, r = Math.min(ab.rMax, ab.r + ab.perR * s), dmg = ab.dmg * (1 + ab.perDmg * s);
        const gy = Wd.surfaceBelow(p.x, p.y - 2);
        near(p.x, p.y - p.h / 2, r, (e) => DS.hitFoe(e, { dmg, kb: ab.kb, kbY: 420, color: "#ff8090", sparkColor: "#ff3050" }));
        G.zones.push({ kind: "thorns", x: p.x, y: gy, r, t: 0, dur: 0.9, big: s >= 20 });
        p.stacks = 0;
        p.cast = { anim: "cast", t: 0, dur: 0.3 };
        fx().shake(4 + Math.min(8, s / 4));
        break;
      }
    }
    p.abilCd = ab.cd;
  }

  function flare(x, y, dmg) {
    G.fx.push({ kind: "flare", x, y, t: 0, life: 0.4, scale: 0.8 });
    near(x, y, 50, (e) => DS.hitFoe(e, { dmg, burn: 4, kb: 60, hitstop: 0.02, color: "#ffe9a0" }));
  }

  function iceBurst(x, y, ab) {
    near(x, y, ab.radius, (e) => DS.hitFoe(e, { dmg: ab.dmg, kb: ab.kb, kbY: 220, freeze: ab.freeze, fromX: x, color: "#bfe8ff", sparkColor: "#bfe8ff", hitstop: 0.06 }));
    G.fx.push({ kind: "iceburst", x, y, t: 0, life: 0.6, r: ab.radius });
    fx().shake(7);
  }

  // fire racing along the ground (Flame Bastion) or a line of jade crystals (Jade Tide): segments that erupt in turn
  function segs(x, y, dir, reach, step, speed) {
    const out = [];
    for (let d = 0; d <= reach; d += step) {
      const sx = x + dir * d;
      if (!Wd.groundAt(sx, y) || Wd.solidAt(sx, y - 10)) break;
      out.push({ x: sx, delay: d / speed, up: false, v: Math.floor(Math.random() * 4) });
    }
    return out;
  }
  function fireLine(x, y, dir, ab) {
    const s = segs(x, y, dir, ab.reach, ab.step, 900);
    if (!s.length) return;
    G.zones.push({ kind: "firewall", segs: s, y, dir, t: 0, dur: ab.dur + 0.4, hit: new Set(), tick: 0.3, ab });
    DS.fx.shake(5);
  }
  function tideLine(x, y, dir, ab, mult = 1) {
    const s = segs(x, y, dir, ab.reach, ab.step, ab.speed);
    if (s.length) G.zones.push({ kind: "crystals", segs: s, y, dir, t: 0, dur: 1.2, hit: new Set(), ab, mult });
  }

  function updateZones(dt) {
    const p = G.player;
    for (const z of G.zones) {
      z.t += dt;
      if (z.kind === "sanct") {
        for (const e of G.foes) if (!e.dead && !e.d.boss && Math.abs(e.x - z.x) < z.r && Math.abs(e.y - z.y) < 120) { e.vx = Math.sign(e.x - z.x || 1) * 240; e.kbT = 0.1; }
      } else if (z.kind === "firewall" || z.kind === "crystals" || z.kind === "brandfire") {
        for (const s of z.segs) if (!s.up && z.t >= s.delay) {
          s.up = true; s.t0 = z.t;
          for (const e of G.foes) {
            if (e.dead || z.hit.has(e)) continue;
            if (Math.abs(e.x - s.x) < 22 + e.w / 2 && e.y > z.y - 110 && e.y < z.y + 8) {
              z.hit.add(e);
              if (z.kind === "crystals") DS.hitFoe(e, { dmg: z.ab.dmg * z.mult, kb: z.ab.kb, kbY: 420, dir: z.dir, heavy: true, color: "#a8ffd0", sparkColor: "#60e0a0" });
              else DS.hitFoe(e, { dmg: z.ab.dmg, kb: 240, kbY: 440, dir: z.dir, burn: z.ab.burn, color: "#ffc070", sparkColor: "#ff9040" });
            }
          }
        }
        if (z.kind !== "crystals") {
          z.tick -= dt;
          if (z.tick <= 0 && z.t > 0.4) {
            z.tick = 0.3;
            const xs = z.segs.filter((s) => s.up).map((s) => s.x), x0 = Math.min(...xs) - 18, x1 = Math.max(...xs) + 18;
            for (const e of G.foes) if (!e.dead && e.x + e.w / 2 > x0 && e.x - e.w / 2 < x1 && Math.abs(e.y - z.y) < 30)
              DS.hitFoe(e, { dmg: z.ab.dps * 0.3, kb: 0, hitstop: 0, noHeat: true, color: "#ffa040", sparkColor: "#ff9040" });
          }
        }
      }
    }
    G.zones = G.zones.filter((z) => z.t < z.dur);
    // the Rose's Waltz follows the knight
    if (p && p.waltz) {
      const w = p.waltz, ab = p.k.ability;
      w.t += dt;
      if (w.n < ab.hits && w.t >= (w.n * ab.spin) / ab.hits) {
        w.n++;
        near(p.x, p.y - p.h / 2, ab.r, (e) => DS.hitFoe(e, { dmg: ab.dmg, kb: ab.kb, kbY: 180, color: "#ff9ab8", sparkColor: "#ff4070" }));
        DS.fx.shake(3);
      }
      if (w.t >= w.dur) p.waltz = null;
    }
  }

  // the Flame Bastion's standing fire blocks the Drowned (src/world.js move())
  function walls() {
    const out = [];
    for (const z of G.zones) if (z.kind === "firewall" && z.t > 0.3 && z.t < z.dur - 0.2) {
      const xs = z.segs.filter((s) => s.up).map((s) => s.x);
      if (xs.length) out.push({ x: Math.min(...xs) - 16, y: z.y - 70, w: Math.max(...xs) - Math.min(...xs) + 32, h: 70, soft: true });
    }
    return out;
  }

  // hold-to-charge abilities (Jade Tide, Brand Thrust)
  function holdAbility(p, dt) {
    const ab = p.k.ability;
    if (ab.id === "tide") {
      if (p.charge < 0) {
        if (I.p.ability && p.abilCd <= 0 && canAct(p)) { p.charge = 0; p.atk = null; }
        return;
      }
      if (I.h.ability) { p.charge += dt; return; }
      const charged = p.charge >= ab.charge;
      p.charge = -1; p.abilCd = ab.cd;
      if (charged) { p.lunge = { kind: "rush", t: 0, dur: ab.rush, speed: ab.rushSpeed, hits: new Set(), lastSeg: p.x }; p.inv = Math.max(p.inv, ab.rush); }
      else {
        p.cast = { anim: "cast", t: 0, dur: 0.5, lock: true, at: 0.22, fn: () => tideLine(p.x + p.dir * 40, Wd.surfaceBelow(p.x, p.y - 2), p.dir, ab) };
      }
    } else if (ab.id === "brand") {
      if (!p.guard) {
        if (I.p.ability && canAct(p)) { p.guard = true; p.guardT = 0; p.atk = null; p.vx = 0; }
        return;
      }
      p.guardT += dt;
      if (I.h.ability) return;
      p.guard = false;
      if (p.abilCd > 0) return;
      const erupt = p.heat >= p.k.heat.max;
      if (erupt) p.heat = 0;
      p.lunge = { kind: "brand", t: 0, dur: ab.dash, speed: ab.speed, hits: new Set(), startX: p.x, erupt };
      p.abilCd = ab.cd;
    }
  }

  function lungeTick(p, dt) {
    const L = p.lunge, ab = p.k.ability;
    L.t += dt;
    p.vx = p.dir * L.speed; p.vy = 0;
    const x0 = Math.min(p.x, p.x + p.dir * 40) - 16, x1 = Math.max(p.x, p.x + p.dir * 40) + 16;
    for (const e of G.foes) {
      if (e.dead || L.hits.has(e)) continue;
      if (e.x + e.w / 2 > x0 && e.x - e.w / 2 < x1 && e.y > p.y - p.h - 10 && e.y - e.h < p.y + 10) {
        L.hits.add(e);
        if (L.kind === "rush") DS.hitFoe(e, { dmg: ab.dmg * ab.rushMult, kb: ab.kb, kbY: 300, dir: p.dir, heavy: true, color: "#a8ffd0", sparkColor: "#60e0a0", hitstop: 0.05 });
        else DS.hitFoe(e, { dmg: ab.dmg, kb: ab.kb, kbY: 200, dir: p.dir, burn: ab.burn, heavy: true, color: "#ffc070", sparkColor: "#ff9040", hitstop: 0.05 });
      }
    }
    if (L.kind === "rush" && Math.abs(p.x - L.lastSeg) >= 40) {
      L.lastSeg = p.x;
      const gy = Wd.surfaceBelow(p.x, p.y - 2);
      if (Wd.groundAt(p.x, gy)) G.zones.push({ kind: "crystals", segs: [{ x: p.x - p.dir * 20, delay: 0, up: false, v: Math.floor(Math.random() * 4) }], y: gy, dir: p.dir, t: 0, dur: 0.9, hit: new Set(), ab, mult: 0.6 });
    }
    G.fx.push({ kind: "ghost", x: p.x, y: p.y, dir: p.dir, t: 0, life: 0.16, rec: DS.Sprites.frame(DS.spriteOf(p), L.kind === "rush" ? "dash" : "cast", 0), tint: L.kind === "rush" ? "#60e0a0" : "#ff9040" });
    if (L.t >= L.dur || p.hitWall) {
      p.lunge = null; p.vx *= 0.3;
      if (L.kind === "rush") tideLine(p.x + p.dir * 30, Wd.surfaceBelow(p.x, p.y - 2), p.dir, ab);
      if (L.kind === "brand" && L.erupt) {
        const gy = Wd.surfaceBelow(p.x, p.y - 2), from = Math.min(L.startX, p.x), to = Math.max(L.startX, p.x) + 60 * p.dir;
        const s = [];
        for (let x = Math.min(from, to); x <= Math.max(from, to); x += 26) if (Wd.groundAt(x, gy)) s.push({ x, delay: Math.abs(x - L.startX) / 1400, up: false, v: 0 });
        G.zones.push({ kind: "brandfire", segs: s, y: gy, dir: p.dir, t: 0, dur: 3, hit: new Set(), tick: 0.3, ab: { dmg: 20, burn: 6, dps: 12 } });
        DS.fx.shake(8);
        DS.fx.text(p.x, p.y - p.h - 20, "ERUPT", "#ffb060", 15);
      }
    }
  }

  function dashStrike(p) {
    const ds = p.k.dashStrike;
    for (const e of G.foes) {
      if (e.dead || p.dashHits.has(e)) continue;
      if (Math.abs(e.x - p.x) < (e.w + p.w) / 2 + 8 && e.y > p.y - p.h && e.y - e.h < p.y) {
        p.dashHits.add(e);
        DS.hitFoe(e, { dmg: ds.dmg, kb: 120, dir: p.dir, color: "#ffe9a0", sparkColor: "#ffd27a", hitstop: 0.03 });
      }
    }
  }

  function plungeLand(p) {
    const a = p.k.attack;
    p.plunge = false;
    for (const e of G.foes) if (!e.dead && Math.abs(e.x - p.x) < P.plungeR + e.w / 2 && Math.abs(e.y - p.y) < 70)
      DS.hitFoe(e, { dmg: a.dmg * P.plungeDmg, kb: 220, kbY: 380, heavy: true, plunge: true, hitstop: 0.07 });
    G.fx.push({ kind: "slam", x: p.x, y: p.y, t: 0, life: 0.35, c: p.k.color });
    DS.fx.puff(p.x, p.y, 12, "rgba(160,180,170,0.55)");
    DS.fx.shake(7);
    p.cast = { anim: "attack", t: 0, dur: 0.18, lock: true, frameP: 0.99 };
  }

  function update(p, dt) {
    if (p.dead) return;
    const k = p.k;
    // abilities
    if (k.ability.id === "tide" || k.ability.id === "brand") holdAbility(p, dt);
    else if (I.p.ability && p.abilCd <= 0 && canAct(p)) { p.atk = null; ability(p); }
    // attack input is buffered a little so combos chain cleanly
    if (I.p.attack) p.queued = 0.2;
    p.queued = Math.max(0, (p.queued || 0) - dt);
    if (p.queued > 0 && canAct(p) && (!p.atk || p.atk.t > p.atk.dur * 0.62)) { p.queued = 0; startAttack(p); }
    if (p.plunge) {
      for (const e of G.foes) if (!e.dead && !p.plungeHits.has(e) && Math.abs(e.x - p.x) < (e.w + p.w) / 2 && e.y > p.y - p.h && e.y - e.h < p.y + 20) {
        p.plungeHits.add(e); DS.hitFoe(e, { dmg: k.attack.dmg, kb: 60, heavy: true, plunge: true, hitstop: 0.03 });
      }
    }
    if (p.atk) {
      const atk = p.atk;
      atk.t += dt;
      if (atk.ranged) { if (!atk.fired && atk.t >= atk.dur * 0.3) { atk.fired = true; fireShot(p); } }
      else meleeTick(p);
      if (atk.t >= atk.dur) { p.atk = null; p.comboT = 0.3; }
    }
    if (p.cast) {
      const c = p.cast;
      c.t += dt;
      if (c.fn && !c.fired && c.t >= c.at) { c.fired = true; c.fn(); }
      if (c.t >= c.dur) p.cast = null;
    }
  }

  DS.Kits = { update, updateZones, walls, dashStrike, lungeTick, plungeLand, canAct };

  // ---------------- the Drowned Sovereign ----------------
  DS.Boss = {
    think(e, dx, adx) {
      if (e.boss.phase === 1 && e.hp < e.max * 0.5) { e.boss.phase = 2; DS.fx.text(e.x, e.y - e.h - 30, "The Sovereign rages", "#ff9a6a", 16); }
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const r = Math.random();
        e.move = adx < 170 ? (r < 0.75 ? "slam" : "leap") : adx > 420 ? (r < 0.5 ? "charge" : "leap") : (r < 0.4 ? "charge" : r < 0.75 ? "leap" : "slam");
        e.wind = { slam: 0.75, charge: 0.6, leap: 0.5 }[e.move];
        e.state = "windup"; e.st = 0; e.vx *= 0.2;
        return 0;
      }
      return adx > 120 ? Math.sign(dx) : 0;
    },
    strike(e) {
      const p = G.player;
      e.hitDone = false;
      if (e.move === "slam") {
        e.strikeDur = 0.3; DS.fx.shake(10);
        DS.groundWave(e, e.x + 60, 1, 0, 470, 1.8, 14); DS.groundWave(e, e.x - 60, -1, 0, 470, 1.8, 14);
        if (e.boss.phase > 1) { DS.groundWave(e, e.x + 60, 1, 0.4, 470, 1.8, 14); DS.groundWave(e, e.x - 60, -1, 0.4, 470, 1.8, 14); }
      } else if (e.move === "charge") {
        e.strikeDur = 1.1;
      } else if (e.move === "leap") {
        e.strikeDur = 2.5; e.vy = -950; e.onGround = false;
        e.vx = clamp((p.x - e.x) / 0.9, -720, 720);
      }
    },
    tick(e, dt) {
      const d = e.d;
      if (e.move === "slam") {
        if (!e.hitDone && e.st < 0.12) {
          const x0 = e.dir > 0 ? e.x : e.x - d.reach - 30, x1 = e.dir > 0 ? e.x + d.reach + 30 : e.x;
          if (DS.boxHitsPlayer(x0, e.y - e.h, x1, e.y)) { e.hitDone = true; DS.hurtPlayer(d.dmg, e, d.name); }
        }
      } else if (e.move === "charge") {
        e.vx = e.dir * (e.boss.phase > 1 ? 720 : 620);
        if (Math.random() < 0.5) DS.fx.puff(e.x - e.dir * 30, e.y, 1, "rgba(150,170,160,0.5)");
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w / 2 - 6, e.y - e.h, e.x + e.w / 2 + 6, e.y)) { e.hitDone = true; DS.hurtPlayer(d.dmg, e, d.name); }
        if (e.hitWall) { e.st = 9; e.state = "hurt"; e.stun = 0.9; DS.fx.shake(9); DS.fx.text(e.x, e.y - e.h - 10, "STUNNED", "#ffd27a", 14); }
      } else if (e.move === "leap") {
        if (e.onGround && e.st > 0.2) {
          e.st = 9; e.vx = 0; DS.fx.shake(11);
          DS.groundWave(e, e.x + 50, 1, 0, 520, 1.4, 14); DS.groundWave(e, e.x - 50, -1, 0, 520, 1.4, 14);
          if (DS.boxHitsPlayer(e.x - 120, e.y - e.h, e.x + 120, e.y)) DS.hurtPlayer(d.dmg, e, d.name);
          DS.fx.puff(e.x, e.y, 16, "rgba(150,170,160,0.55)");
        }
      }
    },
  };
})(window.DS = window.DS || {});
