/* The later levels' bosses, ported from the main game (Robert 2026-11-18/20): the Drowned Colossus (map 1, level 5),
   the Mother Wyvern (map 2, level 15), the Crucible Wyrm (map 2, level 20), the Starved Bell (map 3, level 25) and
   The Deadly Rose (map 3, level 30), the Seething Seraph (map 4, level 35), the Lord of the Rift Throne (level 40), the Magma Golem (map 5, level 45)
   and the Furnace Hydra (level 50), the Cinder Colossus (map 6, level 55), the Ashen Sovereign (level 60) and the
   Sunken King (the finale, level 71, after the Jade Hollow), and the Jade Hollow's Hollow Stag (level 65) and Jade Carapace (level 70). DS.bossFor in data.js puts them at the
   end of their level; the Sovereign's moves stay in kits.js (DS.BOSS_AI.champion).
   Every boss is a DS.BOSS_AI entry: think() picks a move (sets e.move, e.wind, state "windup"), strike() starts it,
   tick() runs it while it lands, frame() steers every frame (the fliers hold their height: e.fly turns gravity off),
   pose() names the move-sheet frame to draw (null = walk/idle as usual). */
"use strict";
(function (DS) {
  const G = DS.G, Wd = DS.World, P = DS.PHYS;
  const { clamp, rnd } = DS.util;
  const AI = DS.BOSS_AI = DS.BOSS_AI || {};
  const ai = (e) => AI[e.type] || AI.champion;
  const noop = () => null;

  DS.Boss = {
    think: (e, dx, adx, dy) => ai(e).think(e, dx, adx, dy),
    strike: (e) => ai(e).strike(e),
    tick: (e, dt) => ai(e).tick(e, dt),
    frame: (e, dt) => (ai(e).frame || noop)(e, dt),
    pose: (e) => (ai(e).pose || noop)(e),
  };

  // ---- shared bits ----
  const fx = () => DS.fx;
  const hurt = (e, dmg) => DS.hurtPlayer(Math.round(dmg), e, e.d.name);
  // a blow in front: x from the boss's middle out to `reach`, from `top` (fraction of its height) down to its feet
  function front(e, reach, top = 1, back = 0) {
    const x0 = e.dir > 0 ? e.x - back : e.x - reach, x1 = e.dir > 0 ? e.x + reach : e.x + back;
    return DS.boxHitsPlayer(x0, e.y - e.h * top, x1, e.y);
  }
  function rage(e, txt) {
    if (e.boss.phase === 1 && e.hp < e.max * 0.5) { e.boss.phase = 2; fx().text(e.x, e.y - e.h - 30, txt, "#ff9a6a", 16); fx().shake(6); }
    return e.boss.phase > 1;
  }
  function start(e, move, wind) { e.move = move; e.wind = wind; e.state = "windup"; e.st = 0; e.vx *= 0.2; e.boss.count = (e.boss.count || 0) + 1; }
  const pick = (list) => { let r = Math.random() * list.reduce((a, b) => a + b[1], 0); for (const [m, w] of list) if ((r -= w) <= 0) return m; return list[0][0]; };
  const groundY = (x, y) => Wd.surfaceBelow(x, y - 2);
  const camL = () => G.cam.x, camR = () => G.cam.x + DS.Render.vw; // the screen's edges in the world
  // a falling boulder with a warning mark on the ground first
  function rock(e, x, delay, dmg, landed) {
    const p = G.player, gy = groundY(x, p.y - 40);
    G.shots.push({ team: "f", kind: "rock", x, y: gy - 560, vx: 0, vy: 200, g: 1500, r: 18, dmg: Math.round(dmg), life: 3, delay, warn: gy, land: true, src: e, by: e.d.name,
      onEnd: (s) => { fx().puff(s.x, s.y, 8, "rgba(150,160,130,0.6)"); fx().shake(3); if (landed) landed(s); } });
  }
  // a gout of fire: a short-lived flame that drifts along (the dragons' breath)
  function flame(e, x, y, vx, vy, dmg, life = 0.7) {
    G.shots.push({ team: "f", kind: "flame", x, y, vx, vy, r: 16, h: 30, dmg: Math.round(dmg), life, life0: life, src: e, by: e.d.name, ghost: true });
  }

  // a pool of burning lava on the ground that stays for `life` seconds (hurts on touch; the knight's i-frames space it)
  function pool(e, x, dmg, life, r = 42, delay = 0) {
    const gy = groundY(x, e.y - 40);
    if (Math.abs(gy - e.y) > 80) return; // only on the boss's own floor: ledges stay safe
    G.shots.push({ team: "f", kind: "pool", x, y: gy - 8, vx: 0, vy: 0, r, h: 16, dmg: Math.round(dmg), life, life0: life, ghost: true, stay: true, src: e, by: e.d.name, delay, warn: delay ? gy : 0 });
  }

  // ---------------- the Drowned Colossus (map 1, level 5: wins a familiar) ----------------
  // Its own fight (Robert 2026-11-24: no boss may copy another's moves). Geyser Line: its fists split the floor and
  // water bursts up in a line, one geyser after another. Collapse: stones fall where the knight stands, and the ones
  // that land STAY as rubble for a while. Surge: a tall wave rolls out; rubble breaks it, so the fallen stones are
  // cover (or jump it). It always calls the surge soon after a collapse. Below half the geysers go both ways, more
  // stones fall and two surges come.
  const WATER = "120,215,255";
  AI["drowned-colossus"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Colossus tears loose");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        let m;
        if (e.boss.next) { m = e.boss.next; e.boss.next = null; }
        else m = adx < 220 ? pick([["geyser", 5], ["collapse", 2]])
          : adx < 560 ? pick([["collapse", 3], ["geyser", 3], ["surge", 2]])
          : pick([["surge", 3], ["collapse", 3]]);
        start(e, m, { geyser: 0.8, surge: 0.9, collapse: 0.75 }[m]);
        return 0;
      }
      return adx > 150 ? Math.sign(dx) : 0;
    },
    frame(e, dt) {
      const rub = e.boss.rubble = e.boss.rubble || [];
      for (const r of rub) r.t -= dt;
      e.boss.rubble = rub.filter((r) => r.t > 0);
      // rubble breaks its waves
      for (const s of G.shots) if (s.src === e && s.kind === "wave" && s.life > 0 && !(s.delay > 0))
        for (const r of e.boss.rubble) if (Math.abs(s.x - r.x) < 28 && Math.abs(s.ground - r.y) < 30) { s.life = 0; s.ended = true; fx().puff(s.x, s.ground, 10, "rgba(160,220,255,0.6)"); break; }
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "geyser") {
        e.strikeDur = 0.6; fx().shake(9);
        for (const sd of hot ? [e.dir, -e.dir] : [e.dir])
          for (let i = 0; i < 6; i++) spike(e, "beam", clamp(e.x + sd * (90 + i * 75), 40, Wd.W - 40), 0.12 + i * 0.09, d.dmg * 0.7, 130, 0.35, WATER);
      } else if (e.move === "surge") {
        e.strikeDur = 0.55; fx().shake(6);
        DS.groundWave(e, e.x + e.dir * 80, e.dir, 0.05, 380, 2.8, d.dmg * 0.8, { y: e.y - 28, r: 22, h: 56, big: 1 });
        if (hot) DS.groundWave(e, e.x + e.dir * 80, e.dir, 0.65, 380, 2.8, d.dmg * 0.8, { y: e.y - 28, r: 22, h: 56, big: 1 });
      } else if (e.move === "collapse") {
        e.strikeDur = 0.6; fx().shake(5);
        const n = hot ? 5 : 3, xs = [p.x];
        for (let i = 1; i < n; i++) xs.push(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * rnd(110, 150));
        xs.forEach((x, i) => rock(e, clamp(x, 80, Wd.W - 80), 0.45 + i * 0.16, d.dmg * 0.7, (s) => {
          const rub = e.boss.rubble = e.boss.rubble || [];
          if (Math.abs(s.y - e.y) < 60 && !rub.some((r) => Math.abs(r.x - s.x) < 50)) { rub.push({ x: s.x, y: s.y, t: 8 }); if (rub.length > 4) rub.shift(); }
        }));
        e.boss.next = "surge";
      }
    },
    tick(e) {
      const d = e.d;
      if (e.move === "geyser" && !e.hitDone && e.st < 0.12 && front(e, d.reach, 0.9, 30)) { e.hitDone = true; hurt(e, d.dmg); }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return e.stun >= 0.5 ? "stun" : !e.onGround ? "knock" : null;
      if (e.state === "windup") return { geyser: "slamUp", surge: "surgeWind", collapse: "callUp" }[m];
      if (e.state === "strike" || e.state === "recover") return { geyser: "slam", surge: "surge", collapse: "callUp" }[m];
      return null;
    },
  };

  // ---------------- the Mother Wyvern (map 2, level 15: wins a familiar) ----------------
  // She hovers off to one side of the knight, out of sword reach: swoops through, spits fire down, and every few moves
  // lands to rake and breathe fire along the ground before she takes off again. A stagger knocks her out of the sky.
  const HOVER = 135; // low enough to reach with a jump, and to stay on screen
  AI["mother-wyvern"] = {
    think(e, dx, adx, dy) {
      const hot = rage(e, "The Mother shrieks");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd > 0) return 0;
      if (!e.fly) { // on the ground
        e.boss.grounded = (e.boss.grounded || 0) + 1;
        const m = e.boss.grounded > (hot ? 2 : 3) ? "takeoff" : adx < 170 ? pick([["rake", 3], ["breath", 1]]) : pick([["breath", 3], ["takeoff", 1]]);
        if (m === "takeoff") e.boss.grounded = 0;
        start(e, m, { rake: 0.55, breath: 0.75, takeoff: 0.6 }[m]);
      } else {
        e.boss.air = (e.boss.air || 0) + 1;
        const m = e.boss.air > (hot ? 4 : 3) ? "land" : pick([["swoop", 3], ["spit", hot ? 3 : 2]]);
        if (m === "land") e.boss.air = 0;
        start(e, m, { swoop: 0.6, spit: 0.5, land: 0.3 }[m]);
      }
      return 0;
    },
    frame(e, dt) {
      const p = G.player;
      if (e.state === "hurt" && e.stun >= 0.5 && e.fly) { e.fly = false; e.vy = 120; } // staggered: she drops out of the sky
      if (e.fly === undefined) { e.fly = false; e.boss.grounded = 9; } // she starts perched: first move, take off
      if (!e.fly || e.state === "strike") return;
      // hover beside the knight, bobbing; climb a little while winding up a swoop
      const side = e.x < p.x ? -1 : 1, hx = p.x + side * 210, hy = groundY(p.x, p.y) - HOVER + Math.sin(G.t * 2.4) * 18 - (e.state === "windup" && e.move === "swoop" ? 30 : 0);
      const ax = clamp((hx - e.x) * 3 - e.vx * 1.6, -900, 900), ay = clamp((hy - e.y) * 4 - e.vy * 2.2, -1200, 1200);
      e.vx = clamp(e.vx + ax * dt, -e.d.speed * 1.8, e.d.speed * 1.8); e.vy = clamp(e.vy + ay * dt, -420, 420);
      if (e.state === "move" || e.state === "recover") e.dir = Math.sign(p.x - e.x) || e.dir;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "swoop") { // dive at where the knight stands, then skim along and pull up
        e.strikeDur = 1.2; e.dir = Math.sign(p.x - e.x) || e.dir;
        const tx = p.x + e.dir * 40, ty = groundY(p.x, p.y) - 30, sp = hot ? 900 : 760, L = Math.hypot(tx - e.x, ty - e.y) || 1;
        e.vx = (tx - e.x) / L * sp; e.vy = (ty - e.y) / L * sp; e.boss.skim = 0;
      } else if (e.move === "spit") {
        e.strikeDur = 0.6;
        const n = hot ? 5 : 3, sx = e.x + e.dir * 40, sy = e.y - e.h * 0.55;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(p.y - p.h * 0.5 - sy, p.x - sx) + (i - (n - 1) / 2) * 0.16;
          G.shots.push({ team: "f", kind: "wyvbolt", x: sx, y: sy, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 9, dmg: Math.round(d.dmg * 0.6), life: 2.2, src: e, by: d.name });
        }
      } else if (e.move === "land") { // drop to the ground near the knight
        e.strikeDur = 2; e.fly = false; e.vy = 300; e.vx = clamp((p.x + (e.x < p.x ? -160 : 160) - e.x) / 0.7, -400, 400);
      } else if (e.move === "rake") {
        e.strikeDur = 0.35; e.vx = e.dir * 260;
      } else if (e.move === "breath") {
        e.strikeDur = 0.9; e.boss.puff = 0;
      } else if (e.move === "takeoff") {
        e.strikeDur = 0.5; e.fly = true; e.vy = -520; fx().puff(e.x, e.y, 12, "rgba(180,160,140,0.5)");
      }
    },
    tick(e, dt) {
      const d = e.d;
      if (e.move === "swoop") {
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.5, e.y - e.h, e.x + e.w * 0.5, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
        if (!e.boss.skim && (e.onGround || e.y >= groundY(e.x, e.y) - 40 || e.st > 0.8)) { e.boss.skim = 1; e.vy = -60; e.vx = e.dir * 460; }
        if (e.boss.skim) { e.vy = Math.max(e.vy - 900 * dt, -380); e.vx *= 0.97; }
      } else if (e.move === "land") {
        e.vy = Math.min(e.vy + P.gravity * dt, 700);
        if (e.onGround && e.st > 0.1) { e.st = 9; e.vx = 0; fx().shake(5); fx().puff(e.x, e.y, 14, "rgba(180,160,140,0.5)"); }
      } else if (e.move === "rake") {
        if (!e.hitDone && e.st < 0.2 && front(e, d.reach, 0.9, 20)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "breath") {
        if ((e.boss.puff -= dt) <= 0) {
          e.boss.puff = 0.06;
          flame(e, e.x + e.dir * 70, e.y - 40, e.dir * rnd(380, 520), rnd(10, 70), d.dmg * 0.45, 0.75);
        }
      } else if (e.move === "takeoff") {
        e.vy = Math.max(-520, e.vy);
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return e.fly ? "knockAir" : e.stun >= 0.5 ? "land" : null;
      if (e.state === "windup") return { swoop: "climb", spit: "hoverUp", land: "hoverDown", rake: "rakeUp", breath: "breathWind", takeoff: "roar" }[m];
      if (e.state === "strike") return m === "swoop" ? (e.boss.skim ? "glide" : "swoop") : m === "land" ? (e.onGround ? "land" : "hoverDown") : { spit: "swoop", rake: "rake", breath: "breath", takeoff: "climb" }[m];
      if (e.state === "recover") return m === "land" ? "land" : { swoop: "glide", spit: "hoverDown", rake: "rake", breath: "breath", takeoff: "hoverUp" }[m];
      if (!e.fly) return e.onGround ? "ground" : "hoverDown";
      return null; // in the air: the flapping idle loop
    },
  };

  // ---------------- the Crucible Wyrm (map 2, level 20: wins the Dragon Spear) ----------------
  // A heavy lava dragon on the ground: bite lunge, fire breath along the ground, a tail sweep to jump (front and back),
  // a wing gust that shoves the knight away (and is followed by fire), and a flight: it rises, circles over the knight
  // and dives down in a burst of lava waves.
  AI["crucible-wyrm"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Wyrm's scales split with fire");
      const behind = Math.sign(dx) !== e.dir;
      if (e.cd <= 0) {
        let m;
        if (e.boss.next) { m = e.boss.next; e.boss.next = null; }
        else if (adx < 160 && behind) m = "tail";
        else if ((e.boss.count || 0) % (hot ? 3 : 4) === 3) m = "fly";
        else m = adx < 190 ? pick([["bite", 4], ["tail", 2], ["gust", 1]]) : adx < 480 ? pick([["breath", 4], ["gust", 2], ["bite", 1]]) : pick([["breath", 2], ["fly", 2]]);
        if (m !== "tail") e.dir = Math.sign(dx) || e.dir;
        start(e, m, { bite: 0.55, breath: 0.8, tail: 0.5, gust: 0.6, fly: 0.6 }[m]);
        return 0;
      }
      e.dir = Math.sign(dx) || e.dir;
      return adx > 160 ? Math.sign(dx) : 0;
    },
    frame(e) {
      if (e.fly && e.state === "hurt") { e.fly = false; e.vy = 200; } // knocked out of the air
    },
    strike(e) {
      const p = G.player, d = e.d;
      e.hitDone = false;
      if (e.move === "bite") { e.strikeDur = 0.3; e.vx = e.dir * 560; }
      else if (e.move === "breath") { e.strikeDur = 1.0; e.boss.puff = 0; }
      else if (e.move === "tail") { e.strikeDur = 0.3; fx().shake(4); }
      else if (e.move === "gust") {
        e.strikeDur = 0.4; fx().shake(4);
        for (let i = 0; i < 10; i++) G.fx.push({ kind: "dust", x: e.x + e.dir * rnd(40, 120), y: e.y - rnd(10, 90), vx: e.dir * rnd(300, 600), vy: rnd(-40, 40), t: 0, life: 0.5, c: "rgba(255,170,90,0.5)", r: rnd(3, 6) });
        if (front(e, 420, 1.3, 0)) { p.vx = e.dir * 900; p.vy = Math.min(p.vy, -260); p.onGround = false; hurt(e, d.dmg * 0.3); }
        e.boss.next = "breath"; e.cd = 0;
      } else if (e.move === "fly") {
        e.strikeDur = 4; e.fly = true; e.vy = -700; e.boss.air = "up"; fx().puff(e.x, e.y, 16, "rgba(255,150,80,0.5)");
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, hot = e.boss.phase > 1;
      if (e.move === "bite") {
        if (!e.hitDone && front(e, d.reach, 0.8, 10)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "breath") {
        if ((e.boss.puff -= dt) <= 0) {
          e.boss.puff = 0.055;
          flame(e, e.x + e.dir * 90, e.y - 46, e.dir * rnd(420, 600), rnd(0, 60), d.dmg * 0.45, hot ? 0.95 : 0.8);
        }
      } else if (e.move === "tail") {
        if (!e.hitDone && e.st < 0.2 && DS.boxHitsPlayer(e.x - 190, e.y - 50, e.x + 190, e.y)) { e.hitDone = true; hurt(e, d.dmg * 0.8); }
      } else if (e.move === "fly") {
        const gy = groundY(p.x, p.y);
        if (e.boss.air === "up") { // climb high, then circle over the knight
          e.vy += (gy - 330 - e.y) * 6 * dt - e.vy * 3 * dt; e.vx += ((p.x - e.x) * 2 - e.vx * 1.5) * dt;
          e.dir = Math.sign(p.x - e.x) || e.dir;
          if (e.st > (hot ? 1.1 : 1.5)) { e.boss.air = "dive"; const L = Math.hypot(p.x - e.x, gy - e.y) || 1; e.vx = (p.x - e.x) / L * 900; e.vy = (gy - e.y) / L * 900; }
        } else if (e.boss.air === "dive") {
          if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.5, e.y - e.h, e.x + e.w * 0.5, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
          if (e.onGround || e.y >= gy - 4) {
            e.fly = false; e.boss.air = "land"; e.st = e.strikeDur - 0.3; e.vx = 0; fx().shake(12);
            // its own mark: the crash splashes burning lava pools that stay a while (no ground waves)
            for (const k of hot ? [-2, -1, 1, 2] : [-1, 1]) pool(e, e.x + k * 120, d.dmg * 0.35, hot ? 5 : 4);
            if (DS.boxHitsPlayer(e.x - 150, e.y - e.h, e.x + 150, e.y)) hurt(e, d.dmg);
            fx().puff(e.x, e.y, 18, "rgba(255,140,60,0.5)");
          }
        }
        if (e.fly && e.st > e.strikeDur - 0.35) e.st = e.strikeDur - 0.35; // keep flying till it lands
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return !e.onGround ? "knockAir" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { bite: "breathWind", breath: "breathWind", tail: "land", gust: "gust", fly: "takeoff" }[m];
      if (e.state === "strike") {
        if (m === "fly") return e.boss.air === "dive" ? "dive" : e.boss.air === "land" ? "land" : Math.floor(G.t * 6) % 2 ? "hoverUp" : "hoverDown";
        return { bite: "bite", breath: "breath", tail: "tail", gust: "gust" }[m];
      }
      if (e.state === "recover") return { bite: "bite", breath: "breath", tail: "tail", gust: "gust", fly: "land" }[m];
      if (!e.onGround) return e.vy < 0 ? "takeoff" : "dive";
      return null;
    },
  };

  // ---------------- the Starved Bell (map 3, level 25: wins a familiar) ----------------
  // An ambush: it waits buried in the mud (it can't be hurt there) and erupts when the knight comes near. Claw, Toll
  // (rings of sound along the ground, both ways), a Swallow lunge mouth-first, a pounce, and it sinks back into the mud
  // to come up right under the knight. Below half health it tolls twice and burrows more often.
  AI["starved-bell"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Bell tolls for you");
      e.dir = Math.sign(dx) || e.dir;
      if (e.boss.waiting === undefined) { e.boss.waiting = G.t; e.under = true; } // it starts buried, down in the mud
      if (e.onPlat && e.boss.waiting) { e.dropT = 0.3; e.y += 2; }
      if (e.boss.waiting) { // it bursts out when the knight comes near (or loses patience)
        if (e.onGround && !e.onPlat && (adx < 280 || G.t - e.boss.waiting > 6)) { e.boss.waiting = false; start(e, "erupt", 0.35); }
        else if (e.onGround && !e.onPlat) e.vx = clamp(dx * 0.8, -160, 160); // a ripple in the mud, creeping closer
        return 0;
      }
      if (e.cd <= 0) {
        const m = (e.boss.count || 0) % (hot ? 3 : 4) === 3 ? "burrow"
          : adx < 170 ? pick([["claw", 4], ["swallow", 2], ["toll", 1]])
          : adx < 420 ? pick([["swallow", 3], ["toll", 3], ["pounce", 2]])
          : pick([["pounce", 3], ["toll", 2], ["burrow", 2]]);
        start(e, m, { claw: 0.5, swallow: 0.6, toll: 0.85, pounce: 0.5, burrow: 0.45 }[m]);
        return 0;
      }
      return adx > 120 ? Math.sign(dx) : 0;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "erupt") { // out of the mud: a blow straight up where it stood
        e.under = false; e.strikeDur = 0.4; fx().shake(9); fx().puff(e.x, e.y, 18, "rgba(110,90,60,0.6)");
        if (DS.boxHitsPlayer(e.x - 90, e.y - e.h * 1.3, e.x + 90, e.y)) { hurt(e, d.dmg); p.vy = -520; p.onGround = false; }
      } else if (e.move === "claw") { e.strikeDur = 0.3; }
      else if (e.move === "toll") {
        e.strikeDur = 0.5; fx().shake(7); fx().ring(e.x, e.y - e.h * 0.6, "rgba(230,190,110,0.8)");
        for (const sd of [1, -1]) {
          DS.groundWave(e, e.x + sd * 60, sd, 0, 430, 1.9, d.dmg * 0.6, { c: "220,180,100" });
          if (hot) DS.groundWave(e, e.x + sd * 60, sd, 0.45, 430, 1.9, d.dmg * 0.6, { c: "220,180,100" });
        }
      } else if (e.move === "swallow") { e.strikeDur = 0.45; e.vx = e.dir * 720; }
      else if (e.move === "pounce") {
        e.strikeDur = 2; e.vy = -720; e.onGround = false; e.vx = clamp((p.x - e.x) / 0.7, -620, 620);
      } else if (e.move === "burrow") { // sink, creep under the knight, burst up
        e.strikeDur = 2.2; e.under = true; e.vx = 0; e.boss.bx = null; fx().puff(e.x, e.y, 14, "rgba(110,90,60,0.6)");
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player;
      if (e.move === "claw") {
        if (!e.hitDone && e.st < 0.15 && front(e, d.reach, 1, 20)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "swallow") { // caught in the mouth: a hard bite and spat out
        if (!e.hitDone && front(e, 90, 0.8, 40)) { e.hitDone = true; if (hurt(e, d.dmg * 1.4)) { p.vx = -e.dir * 520; p.vy = -380; p.onGround = false; } }
      } else if (e.move === "pounce") {
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.5, e.y - e.h, e.x + e.w * 0.5, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
        if (e.onGround && e.st > 0.2) { e.st = 9; e.vx = 0; fx().shake(6); fx().puff(e.x, e.y, 10, "rgba(110,90,60,0.5)"); }
      } else if (e.move === "burrow") {
        if (e.st > 0.4 && e.st < 1.5) { // a ripple in the mud hunting the knight
          e.vx = clamp((p.x - e.x) * 4, -520, 520);
          if (Math.random() < 0.6) fx().puff(e.x + rnd(-30, 30), e.y, 1, "rgba(110,90,60,0.5)");
        } else e.vx = 0;
        if (e.st >= 1.5 && e.under) {
          e.under = false; fx().shake(10); fx().puff(e.x, e.y, 20, "rgba(110,90,60,0.6)");
          if (DS.boxHitsPlayer(e.x - 80, e.y - e.h * 1.3, e.x + 80, e.y)) { hurt(e, d.dmg * 1.2); p.vy = -560; p.onGround = false; }
          e.vy = -420; e.onGround = false;
        }
      }
    },
    pose(e) {
      const m = e.move;
      if (e.boss.waiting || (e.under && m === "burrow" && e.st > 0.3)) return "buried";
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { erupt: "buried", claw: "crouch", swallow: "tollFwd", toll: "tollBack", pounce: "crouch", burrow: "crouch" }[m];
      if (e.state === "strike") return m === "pounce" ? (e.onGround ? "crouch" : e.vy < 0 ? "leap" : "drop") : m === "burrow" ? (e.onGround ? "crouch" : "leap") : { erupt: "erupt", claw: "claw", toll: "tollFwd", swallow: "swallow" }[m];
      if (e.state === "recover") return { erupt: "erupt", claw: "claw", toll: "tollFwd", swallow: "swallow", pounce: "crouch", burrow: "crouch" }[m];
      return null;
    },
  };

  // ---------------- The Deadly Rose (map 3, level 30: wins the Rose Paladin) ----------------
  // Lash (a long thorn whip), Up-lash (at a knight in the air), Briar (thorns burst from marked spots round the knight),
  // Waltz (a spinning advance that cuts both sides), and a glide: she rises and sweeps across the clearing. Below half
  // health the briar spreads wider and the waltz lasts longer.
  AI["deadly-rose"] = {
    think(e, dx, adx, dy) {
      const hot = rage(e, "The Rose bares her thorns");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = dy < -70 && adx < 240 ? "upLash"
          : adx < 150 ? pick([["waltz", 3], ["lash", 2], ["glide", 1]])
          : adx < 330 ? pick([["lash", 4], ["briar", 3], ["waltz", 1]])
          : pick([["briar", 3], ["glide", 3], ["lash", 1]]);
        start(e, m, { lash: 0.6, upLash: 0.45, briar: 0.8, waltz: 0.45, glide: 0.5 }[m] * (hot ? 0.85 : 1));
        return 0;
      }
      return adx > 260 ? Math.sign(dx) : adx < 120 ? -Math.sign(dx) * 0.6 : 0; // keeps to whip's length
    },
    frame(e) {
      if (e.fly && e.state === "hurt") { e.fly = false; } // struck from the air
      if (e.state === "windup" && e.move === "glide" && !e.fly) { e.fly = true; e.vy = -260; e.onGround = false; }
      if (e.fly && e.state === "windup") e.vy *= 0.9;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "lash") { e.strikeDur = 0.3; }
      else if (e.move === "upLash") { e.strikeDur = 0.3; }
      else if (e.move === "briar") {
        e.strikeDur = 0.5;
        const n = hot ? 7 : 5, step = 110;
        for (let i = 0; i < n; i++) {
          const x = clamp(p.x + (i - (n - 1) / 2) * step + rnd(-15, 15), 80, Wd.W - 80), gy = groundY(x, p.y - 40);
          G.shots.push({ team: "f", kind: "thorn", x, y: gy - 36, vx: 0, vy: 0, r: 18, h: 72, dmg: Math.round(d.dmg * 0.7), life: 0.45, delay: 0.55 + Math.abs(i - (n - 1) / 2) * 0.12, warn: gy, ghost: true, big: i % 2, src: e, by: d.name });
        }
      } else if (e.move === "waltz") { e.strikeDur = hot ? 1.5 : 1.1; e.boss.cut = 0; }
      else if (e.move === "glide") { e.strikeDur = 0.8; e.dir = Math.sign(p.x - e.x) || e.dir; e.vx = e.dir * 640; e.vy = 0; }
    },
    tick(e, dt) {
      const d = e.d, p = G.player;
      if (e.move === "lash") {
        if (!e.hitDone && e.st < 0.15 && DS.boxHitsPlayer(e.dir > 0 ? e.x : e.x - d.reach, e.y - e.h * 0.85, e.dir > 0 ? e.x + d.reach : e.x, e.y - e.h * 0.35)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "upLash") {
        if (!e.hitDone && e.st < 0.15 && DS.boxHitsPlayer(e.x - 110, e.y - e.h - 220, e.x + 110, e.y - e.h * 0.5)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "waltz") {
        e.vx = e.dir * 230; e.dir = Math.sign(p.x - e.x) || e.dir;
        if ((e.boss.cut -= dt) <= 0) {
          e.boss.cut = 0.3;
          if (DS.boxHitsPlayer(e.x - 120, e.y - e.h * 0.7, e.x + 120, e.y)) hurt(e, d.dmg * 0.5);
          if (Math.random() < 0.8) for (let i = 0; i < 3; i++) G.fx.push({ kind: "mote", x: e.x + rnd(-90, 90), y: e.y - rnd(10, 80), vx: rnd(-120, 120), vy: rnd(-80, 20), t: 0, life: 0.6, c: "rgba(200,30,50," });
        }
      } else if (e.move === "glide") {
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.6, e.y - e.h, e.x + e.w * 0.6, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
        if (e.st > 0.6) { e.fly = false; e.vx *= 0.9; }
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return m === "glide" ? (e.st > 0.25 ? "hover" : "rise") : { lash: "lashWind", upLash: "lashWind", briar: "briar", waltz: "lashWind" }[m];
      if (e.state === "strike") return m === "glide" ? (e.fly ? "glide" : "drop") : { lash: "lash", upLash: "upLash", briar: "briar", waltz: "waltz" }[m];
      if (e.state === "recover") return m === "glide" ? (e.onGround ? "land" : "drop") : { lash: "lash", upLash: "upLash", briar: "briar", waltz: "waltz" }[m];
      if (!e.onGround) return e.vy < 0 ? "rise" : "drop";
      return null;
    },
  };

  // a spike of shot that bursts up from the ground after a warning mark (the Rose's briar, the Rift's crystals, the Seraph's beam)
  function spike(e, kind, x, delay, dmg, h = 72, life = 0.45, c) {
    const gy = groundY(x, G.player.y - 40);
    G.shots.push({ team: "f", kind, x, y: gy - h / 2, vx: 0, vy: 0, r: 18, h, dmg: Math.round(dmg), life, delay, warn: gy, ghost: true, src: e, by: e.d.name, c });
  }

  // ---------------- the Seething Seraph (map 4, level 35: wins a familiar) ----------------
  // Recoloured to the Spires' violet (Robert 2026-11-24). It never walks: it floats a little off the ground, keeping its
  // distance. Orb rings, pillars of light on marked spots, a banner sweep across the hall, and it sinks into the floor
  // to rise behind the knight. Staggered, it drops to the ground for a moment.
  const SERAPH_UP = 46;
  AI["seething-seraph"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Seraph's halo burns white");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = adx < 170 ? pick([["sweep", 3], ["sink", 2], ["orbs", 1]])
          : adx < 450 ? pick([["orbs", 3], ["beam", 3], ["sweep", 1]])
          : pick([["beam", 3], ["sink", 2], ["orbs", 1]]);
        start(e, m, { orbs: 0.7, beam: 0.8, sweep: 0.55, sink: 0.4 }[m] * (hot ? 0.85 : 1));
      }
      return 0; // it drifts (frame), it doesn't walk
    },
    frame(e, dt) {
      const p = G.player;
      if (e.state === "hurt") { if (e.stun >= 0.5) e.fly = false; return; } // staggered: it drops
      if (e.state === "strike" && (e.move === "sweep" || e.move === "sink")) return;
      if (!e.fly) { e.fly = true; e.onGround = false; }
      const want = e.state === "move" ? 260 : Math.abs(e.x - p.x), side = e.x < p.x ? -1 : 1;
      const hx = e.state === "move" ? p.x + side * want : e.x, hy = groundY(e.x, e.y) - SERAPH_UP + Math.sin(G.t * 2) * 8;
      e.vx += clamp((hx - e.x) * 2.5 - e.vx * 1.8, -700, 700) * dt; e.vx = clamp(e.vx, -e.d.speed, e.d.speed);
      e.vy += clamp((hy - e.y) * 5 - e.vy * 2.5, -900, 900) * dt;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "orbs") { // a ring of slow orbs, and one sent straight at the knight
        e.strikeDur = 0.5;
        const n = hot ? 10 : 7, cx = e.x, cy = e.y - e.h * 0.6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + G.t;
          G.shots.push({ team: "f", kind: "orb", x: cx, y: cy, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 10, dmg: Math.round(d.dmg * 0.5), life: 3, src: e, by: d.name, c: "220,110,255", ghost: true });
        }
        const a = Math.atan2(p.y - p.h * 0.5 - cy, p.x - cx);
        G.shots.push({ team: "f", kind: "orb", x: cx, y: cy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 12, dmg: Math.round(d.dmg * 0.6), life: 3, homing: 1.2, speed: 330, src: e, by: d.name, c: "255,150,255" });
      } else if (e.move === "beam") { // pillars of light where the knight stands, then either side
        e.strikeDur = 0.6;
        const n = hot ? 5 : 3;
        for (let i = 0; i < n; i++) spike(e, "beam", clamp(p.x + (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 150 : 0), 80, Wd.W - 80), 0.5 + Math.ceil(i / 2) * 0.25, d.dmg * 0.8, 420, 0.4);
      } else if (e.move === "sweep") { // banners whipped forward: it rushes across the hall
        e.strikeDur = 0.75; e.dir = Math.sign(p.x - e.x) || e.dir; e.vx = e.dir * 640; e.vy = 0;
      } else if (e.move === "sink") { // into the floor, and up behind the knight
        e.strikeDur = 1.4; e.under = true; e.vx = 0; e.vy = 0; e.boss.rose = false;
        G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.5 });
      }
    },
    tick(e) {
      const d = e.d, p = G.player;
      if (e.move === "sweep") {
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.6, e.y - e.h, e.x + e.w * 0.6, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
        if (e.st > 0.5) e.vx *= 0.9;
      } else if (e.move === "sink") {
        e.vx = 0; e.vy = 0;
        if (e.st > 0.7 && !e.boss.rose) {
          e.boss.rose = true; e.under = false;
          const side = p.dir > 0 ? -1 : 1; // behind the knight
          e.x = clamp(p.x + side * 120, 80, Wd.W - 80); e.y = groundY(e.x, p.y - 40); e.dir = -side;
          G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.5 }); fx().shake(6);
          if (DS.boxHitsPlayer(e.x - 70, e.y - e.h, e.x + 70, e.y)) { hurt(e, d.dmg); p.vy = -460; p.onGround = false; }
          e.vy = -260;
        }
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return !e.fly && !e.onGround ? "drop" : e.stun >= 0.5 ? "stun" : "knock";
      if (e.state === "windup") return { orbs: "orbWind", beam: "beamWind", sweep: "float", sink: "sink" }[m];
      if (e.state === "strike") return m === "sink" ? (e.boss.rose ? "rise" : "sink") : { orbs: "orbCast", beam: "beam", sweep: "sweep" }[m];
      if (e.state === "recover") return { orbs: "orbCast", beam: "beam", sweep: "float", sink: "rise" }[m];
      return Math.abs(e.vx) > 40 ? "float" : null;
    },
  };

  // ---------------- the Lord of the Rift Throne (map 4, level 40: wins the Chain Reaper) ----------------
  // Scythe sweep that throws a crescent of violet light, an overhead that drives crystals up from the floor in a line,
  // a rift blink behind the knight straight into a sweep, and a leap that ends in a dive. Below half health he hangs in
  // the air at the top of the leap, throwing rift lightning, and the crystals come on both sides.
  AI["rift-throne"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Rift tears open");
      if (e.cd <= 0) {
        let m;
        if (e.boss.next) { m = e.boss.next; e.boss.next = null; }
        else m = adx < 160 ? pick([["over", 3], ["sweep", 2], ["blink", hot ? 2 : 1]])
          : adx < 420 ? pick([["sweep", 4], ["leap", 2], ["blink", 2]])
          : pick([["sweep", 2], ["leap", 3], ["blink", 2]]);
        e.dir = Math.sign(dx) || e.dir;
        start(e, m, { sweep: 0.6, over: 0.7, blink: 0.35, leap: 0.5 }[m] * (hot ? 0.85 : 1));
        return 0;
      }
      e.dir = Math.sign(dx) || e.dir;
      return adx > 150 ? Math.sign(dx) : 0;
    },
    frame(e) {
      if (e.fly && e.state === "hurt") e.fly = false;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "sweep") {
        e.strikeDur = 0.35;
        G.shots.push({ team: "f", kind: "crescent", x: e.x + e.dir * 60, y: e.y - e.h * 0.45, vx: e.dir * 560, vy: 0, r: 26, h: 96, dmg: Math.round(d.dmg * 0.7), life: 1.6, ghost: true, src: e, by: d.name });
      } else if (e.move === "over") {
        e.strikeDur = 0.5; fx().shake(7);
        for (const sd of hot ? [1, -1] : [e.dir]) for (let i = 0; i < 6; i++) spike(e, "crystal", clamp(e.x + sd * (70 + i * 70), 60, Wd.W - 60), 0.05 + i * 0.08, d.dmg * 0.7, 78);
      } else if (e.move === "blink") { // gone in shards, back behind the knight, sweeping
        e.strikeDur = 0.25;
        G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.45 });
        const side = p.dir > 0 ? -1 : 1;
        e.x = clamp(p.x + side * 150, 80, Wd.W - 80); e.y = groundY(e.x, p.y - 40); e.dir = -side; e.vx = 0; e.vy = 0;
        G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.45 });
        e.boss.next = "sweep"; e.cd = 0;
      } else if (e.move === "leap") {
        e.strikeDur = 4; e.vy = -950; e.onGround = false; e.vx = clamp((p.x - e.x) / 1.4, -380, 380); e.boss.air = "up"; e.boss.zap = 0;
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, hot = e.boss.phase > 1;
      if (e.move === "sweep") {
        if (!e.hitDone && e.st < 0.15 && front(e, d.reach, 0.9, 20)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "over") {
        if (!e.hitDone && e.st < 0.12 && front(e, 130, 1, 10)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "leap") {
        if (e.boss.air === "up" && e.vy > -60) { // the top of the leap: hang there (phase 2: throwing lightning), then dive
          e.boss.air = "hang"; e.fly = true; e.vx = 0; e.vy = 0; e.boss.hangT = hot ? 1.3 : 0.35;
        } else if (e.boss.air === "hang") {
          e.vy = 0; e.vx = 0; e.dir = Math.sign(p.x - e.x) || e.dir;
          if (hot && (e.boss.zap -= dt) <= 0) {
            e.boss.zap = 0.4;
            const a = Math.atan2(p.y - p.h * 0.5 - (e.y - e.h * 0.6), p.x - e.x);
            G.shots.push({ team: "f", kind: "orb", x: e.x, y: e.y - e.h * 0.6, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, r: 10, dmg: Math.round(d.dmg * 0.5), life: 2, src: e, by: d.name, c: "210,120,255" });
          }
          if ((e.boss.hangT -= dt) <= 0) {
            e.boss.air = "dive"; const gy = groundY(p.x, p.y), L = Math.hypot(p.x - e.x, gy - e.y) || 1;
            e.vx = (p.x - e.x) / L * 950; e.vy = (gy - e.y) / L * 950;
          }
        } else if (e.boss.air === "dive") {
          if (!e.hitDone && DS.boxHitsPlayer(e.x - 50, e.y - e.h, e.x + 50, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
          if (e.onGround || e.y >= groundY(e.x, e.y) - 4) {
            e.fly = false; e.boss.air = "land"; e.vx = 0; e.st = e.strikeDur - 0.4; fx().shake(11);
            for (const sd of [1, -1]) for (let i = 1; i <= 4; i++) spike(e, "crystal", clamp(e.x + sd * (40 + i * 60), 40, Wd.W - 40), 0.05 + i * 0.08, d.dmg * 0.6);
            if (DS.boxHitsPlayer(e.x - 120, e.y - e.h, e.x + 120, e.y)) hurt(e, d.dmg);
          }
        }
        if (e.boss.air !== "land" && e.st > e.strikeDur - 0.45) e.st = e.strikeDur - 0.45; // until he lands
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { sweep: "sweepWind", over: "overWind", blink: "blink", leap: "crouch" }[m];
      if (e.state === "strike") return m === "leap" ? ({ up: "leap", hang: e.boss.phase > 1 ? "float" : "leap", dive: "dive", land: "land" }[e.boss.air]) : { sweep: "sweep", over: "over", blink: "blink" }[m];
      if (e.state === "recover") return { sweep: "sweep", over: "over", blink: "sweepWind", leap: "land" }[m];
      return null;
    },
  };

  const LAVA = "255,140,50";
  // a lump thrown in an arc that lands on (tx, ty) after T seconds
  function lobAt(sx, sy, tx, ty, T, g) { return { vx: (tx - sx) / T, vy: (ty - sy - 0.5 * g * T * T) / T }; }

  // ---------------- the Magma Golem (map 5, level 45: wins a familiar) ----------------
  // Its own fight (Robert 2026-11-24). Shatter: fists into the floor throw a spray of molten shards both ways.
  // Fissure: a punch sends a glowing crack along the floor that CHASES the knight and bursts up as a lava pillar
  // where it catches them. Hurl: molten boulders in an arc. Its mechanic: every fourth move the chest opens and the
  // core takes 50% more damage; when the rocks drift back they harden into Stone Skin (half damage for 3 s), so
  // the fight is hit hard at the core, then back off. Below half: more shards, two cracks, three boulders.
  AI["magma-golem"] = {
    think(e, dx, adx, dy) {
      const hot = rage(e, "The Golem's core blazes");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = e.boss.count % 4 === 3 ? "core"
          : adx < 180 ? pick([["shatter", 5], ["fissure", 1]])
          : adx < 480 ? pick([["fissure", 3], ["hurl", 3], ["shatter", 1]])
          : pick([["hurl", 4], ["fissure", 3]]);
        start(e, m, { shatter: 0.75, hurl: 0.7, fissure: 0.6, core: 0.3 }[m]);
        return 0;
      }
      return adx > 120 ? Math.sign(dx) : 0;
    },
    frame(e, dt) {
      const b = e.boss;
      if (e.state === "strike" && e.move === "core" && e.st <= 1.9) e.vuln = 1.5;
      else if (b.skinT > 0) { b.skinT -= dt; e.vuln = 0.5; }
      else e.vuln = 0;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "shatter") { // molten shards sprayed both ways
        e.strikeDur = 0.45; fx().shake(10);
        const n = hot ? 10 : 6, sx = e.x + e.dir * 40, sy = e.y - 20;
        for (let i = 0; i < n; i++) {
          const k = i % 2 ? 1 : -1, dist = 120 + Math.floor(i / 2) * rnd(70, 95);
          const tx = clamp(sx + k * dist, 40, Wd.W - 40), T = 0.55 + Math.floor(i / 2) * 0.07, g = 1400;
          const v = lobAt(sx, sy, tx, groundY(tx, e.y - 40) - 8, T, g);
          G.shots.push({ team: "f", kind: "rock", hot: 1, sc: 0.45, x: sx, y: sy, vx: v.vx, vy: v.vy, g, r: 10, dmg: Math.round(d.dmg * 0.45), life: 3, land: true, src: e, by: d.name,
            onEnd: (s) => fx().puff(s.x, s.y, 5, "rgba(255,140,60,0.6)") });
        }
      } else if (e.move === "fissure") { // a crack in the floor that hunts the knight, then bursts
        e.strikeDur = 0.5; fx().shake(6);
        const crack = (x0, delay) => G.shots.push({ team: "f", kind: "crack", x: x0, y: e.y + 80, gy: e.y, vx: 0, vy: 0, r: 0, h: 0, dmg: 0, life: 3, delay, ghost: true, src: e, by: d.name,
          update: (s, dt) => {
            const pp = G.player;
            s.x += clamp(pp.x - s.x, -330 * dt, 330 * dt); s.gy = groundY(s.x, s.gy - 40); s.y = s.gy + 80;
            if (s.t > 1.25 && !s.done) { s.done = true; s.life = 0; spike(e, "beam", s.x, 0.15, d.dmg * 0.85, 150, 0.4, LAVA); }
          } });
        crack(e.x + e.dir * 50, 0);
        if (hot) crack(e.x - e.dir * 50, 0.35);
      } else if (e.move === "hurl") {
        e.strikeDur = 0.45;
        const n = hot ? 3 : 1, sx = e.x + e.dir * 40, sy = e.y - e.h * 0.95, g = 1100;
        for (let i = 0; i < n; i++) {
          const tx = clamp(p.x + (i ? (i % 2 ? 1 : -1) * 140 : 0), 60, Wd.W - 60), ty = groundY(tx, p.y - 40) - 14;
          const T = clamp(Math.abs(tx - sx) / 520, 0.6, 1.15), v = lobAt(sx, sy, tx, ty, T, g);
          G.shots.push({ team: "f", kind: "rock", hot: 1, x: sx, y: sy, vx: v.vx, vy: v.vy, g, r: 18, dmg: Math.round(d.dmg * 0.75), life: 3, land: true, src: e, by: d.name,
            onEnd: (s) => { fx().puff(s.x, s.y, 8, "rgba(255,140,60,0.6)"); fx().shake(3); } });
        }
      } else if (e.move === "core") {
        e.strikeDur = 2.4; e.vx = 0;
        fx().text(e.x, e.y - e.h - 30, "CORE OPEN", "#ffb070", 14);
      }
    },
    tick(e) {
      const d = e.d;
      if (e.move === "shatter") {
        if (!e.hitDone && e.st < 0.12 && front(e, d.reach, 0.9, 30)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "core") {
        e.vx = 0;
        if (e.st > 1.9 && !e.boss.skinT && !e.boss.skinSet) { e.boss.skinSet = true; e.boss.skinT = 3; fx().text(e.x, e.y - e.h - 30, "STONE SKIN", "#c9b8a8", 14); }
        if (e.st < 0.1) e.boss.skinSet = false;
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "regrow" : null;
      if (e.state === "windup") return { shatter: "slamUp", hurl: "hurlWind", fissure: "crouch", core: "regrow" }[m];
      if (e.state === "strike") {
        if (m === "core") return e.st > 1.9 ? "regrow" : "core";
        return { shatter: "slam", hurl: "hurl", fissure: "land" }[m];
      }
      if (e.state === "recover") return { shatter: "slam", hurl: "hurl", fissure: "land", core: "regrow" }[m];
      return null;
    },
  };

  // ---------------- the Furnace Hydra (map 5, level 50: wins a kit) ----------------
  // Three lava heads on a rock mound. It never walks: it breathes fire along the ground, lobs fireballs, snaps a head far
  // forward or straight up, and sinks into the lava to come up again in front of the knight. At 70%, 45% and 20% health
  // a head is cut down (a breather, its stumps take more damage) and then bursts back. Below half it roars fire from above.
  const CUTS = [0.7, 0.45, 0.2];
  AI["furnace-hydra"] = {
    think(e, dx, adx, dy) {
      const hot = rage(e, "The Hydra's heads blaze white");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = dy > 90 || adx > 650 ? "sink" // stranded on a ledge or left far behind: it moves pits
          : dy < -70 && adx < 220 ? "strikeUp"
          : adx < 230 ? pick([["strike", 4], ["breath", 3], ["strikeUp", 1]])
          : adx < 420 ? pick([["breath", 3], ["lob", 3], ["strike", 2], ["roar", hot ? 2 : 0]])
          : pick([["lob", 4], ["breath", 1], ["roar", hot ? 3 : 0]]);
        start(e, m, { breath: 0.7, lob: 0.6, strike: 0.5, strikeUp: 0.45, roar: 0.8, sink: 0.35 }[m]);
      }
      return 0;
    },
    frame(e, dt) {
      const b = e.boss;
      if (!(e.state === "strike" && e.move === "sink")) e.vx = 0;
      b.cut = b.cut || 0;
      if (!e.dead && !(b.cutT > 0) && !(b.regT > 0) && b.cut < CUTS.length && e.hp < e.max * CUTS[b.cut]) { // a head falls
        b.cutN = b.cut === 1 ? 2 : 1; b.cut++; b.cutT = b.cutN === 2 ? 3.4 : 2.8; b.regT = 0;
        e.under = false; e.vuln = 1.3;
        fx().text(e.x, e.y - e.h - 30, b.cutN === 2 ? "TWO HEADS DOWN" : "A HEAD FALLS", "#ffd27a", 15); fx().shake(7);
        fx().puff(e.x + e.dir * 30, e.y - e.h * 0.7, 14, "rgba(90,80,80,0.6)");
      }
      if (b.cutT > 0) {
        e.state = "hurt"; e.st = 0; e.stun = 9; b.cutT -= dt;
        if (b.cutT <= 0) { b.regT = 0.8; e.vuln = 0; fx().text(e.x, e.y - e.h - 30, "IT REGROWS", "#ff9a6a", 14); }
      } else if (b.regT > 0) {
        e.state = "hurt"; e.st = 0; e.stun = 9; b.regT -= dt;
        if (b.regT <= 0) { e.state = "move"; e.cd = 0.3; }
      }
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "breath") { e.strikeDur = 1.0; e.boss.puff = 0; }
      else if (e.move === "strike") e.strikeDur = 0.4;
      else if (e.move === "strikeUp") e.strikeDur = 0.4;
      else if (e.move === "lob") {
        e.strikeDur = 0.5;
        const n = hot ? 4 : 3, sx = e.x + e.dir * 10, sy = e.y - e.h * 1.05, g = 900;
        for (let i = 0; i < n; i++) {
          const tx = clamp(p.x + (i - (n - 1) / 2) * 130 + rnd(-30, 30), 60, Wd.W - 60), ty = groundY(tx, p.y - 40) - 8;
          const T = clamp(Math.abs(tx - sx) / 480, 0.7, 1.3) + i * 0.08, v = lobAt(sx, sy, tx, ty, T, g);
          G.shots.push({ team: "f", kind: "orb", c: LAVA, x: sx, y: sy, vx: v.vx, vy: v.vy, g, r: 12, dmg: Math.round(d.dmg * 0.6), life: 3, land: true, src: e, by: d.name,
            onEnd: (s) => { for (const k of [1, -1]) flame(e, s.x, s.y - 12, k * 90, 0, d.dmg * 0.35, 0.6); } });
        }
      } else if (e.move === "roar") { // fire rains around the knight
        e.strikeDur = 0.7; fx().shake(6);
        const n = hot ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const x = clamp(p.x + (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 120 : 0), 60, Wd.W - 60), gy = groundY(x, p.y - 40);
          G.shots.push({ team: "f", kind: "orb", c: LAVA, x, y: gy - 520, vx: 0, vy: 250, g: 1100, r: 12, dmg: Math.round(d.dmg * 0.6), life: 3, delay: 0.45 + i * 0.14, warn: gy, land: true, src: e, by: d.name,
            onEnd: (s) => flame(e, s.x, s.y - 12, 0, 0, d.dmg * 0.3, 0.5) });
        }
      } else if (e.move === "sink") { // under the lava, and up again in front of the knight
        e.strikeDur = 1.5; e.under = true; e.boss.rose = false;
        fx().puff(e.x, e.y, 16, "rgba(255,140,60,0.5)");
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, hot = e.boss.phase > 1;
      if (e.move === "breath") {
        e.boss.puff -= dt;
        if (e.st < 0.85 && e.boss.puff <= 0) {
          e.boss.puff = 0.06;
          flame(e, e.x + e.dir * 100, e.y - e.h * 0.5, e.dir * rnd(380, 560), rnd(30, 90), d.dmg * 0.45, hot ? 0.9 : 0.75);
        }
      } else if (e.move === "strike") {
        if (!e.hitDone && e.st < 0.2 && front(e, d.reach, 0.55, 0)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "strikeUp") {
        if (!e.hitDone && e.st < 0.2 && DS.boxHitsPlayer(e.x - 40 + e.dir * 40, e.y - e.h * 2.1, e.x + 40 + e.dir * 40, e.y - e.h * 0.4)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "sink") {
        if (e.st > 0.8 && !e.boss.rose) {
          e.boss.rose = true; e.under = false;
          const side = e.x < p.x ? -1 : 1;
          e.x = clamp(p.x + side * 230, 100, Wd.W - 100); e.y = groundY(e.x, p.y - 40); e.dir = -side; e.vy = 0;
          fx().puff(e.x, e.y, 18, "rgba(255,140,60,0.55)"); fx().shake(7);
        }
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (b.cutT > 0) return "cut" + b.cutN;
      if (b.regT > 0) return "regrow";
      if (e.state === "hurt") return "hurt";
      if (e.state === "windup") return { breath: "roar", lob: "roar", strike: "hurt", strikeUp: "rise", roar: "rise", sink: "sink" }[m];
      if (e.state === "strike") return m === "sink" ? (b.rose ? "rise" : "sink") : { breath: "breath", lob: "lob", strike: "strike", strikeUp: "strikeUp", roar: "roar" }[m];
      if (e.state === "recover") return { breath: "breath", lob: "lob", strike: "strike", strikeUp: "strikeUp", roar: "roar", sink: "rise" }[m];
      return null;
    },
  };

  // ---------------- the Cinder Colossus (map 6, level 55: wins a familiar) ----------------
  // A walking bastion. Chain Fist: the fist flies out on its chain; it only hits at the END of the chain, so the safe
  // place is right up against it. Brand: both fists pound and, after a glow, the floor around the knight burns
  // (get up on a ledge). Tower Fire: each tower on its back lobs fire that burns where it lands. Bastion Drop: it
  // jumps out of sight, its shadow hunts the knight, then it crashes down. Its towers break off at 2/3 and 1/3
  // health: fewer fire lobs, but it moves faster with every one lost.
  AI["cinder-colossus"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Colossus's chains glow white");
      e.dir = Math.sign(dx) || e.dir;
      const b = e.boss; if (b.towers == null) b.towers = 2;
      if (e.cd <= 0) {
        let m;
        if (b.next) { m = b.next; b.next = null; }
        else m = b.count % 5 === 4 ? "drop"
          : adx < 110 ? pick([["pound", 4], ["drop", 1]])
          : adx < 460 ? pick([["chain", 5], ["pound", 2], ["towers", b.towers ? 2 : 0]])
          : pick([["towers", b.towers ? 4 : 0], ["drop", 3], ["pound", 1]]);
        start(e, m, { chain: 0.7, pound: 0.8, towers: 0.7, drop: 0.5 }[m] * (hot ? 0.9 : 1));
        if (m === "chain" && hot && !b.again) { b.next = "chain"; b.again = true; } else b.again = false;
        return 0;
      }
      return adx > 300 ? Math.sign(dx) : 0;
    },
    frame(e, dt) {
      const b = e.boss; if (b.towers == null) b.towers = 2;
      if (!e.dead && b.towers > 0 && e.hp < e.max * b.towers / 3) { // a tower cracks off
        b.towers--; fx().text(e.x, e.y - e.h - 30, "A TOWER BREAKS", "#ffd27a", 15); fx().shake(8);
        rock(e, clamp(e.x - e.dir * 90, 60, Wd.W - 60), 0.2, e.d.dmg * 0.6);
      }
      if (e.state === "move" && e.cd > 0) e.cd -= dt * (2 - b.towers) * 0.3; // lighter, angrier
      if (e.move === "drop" && e.state === "strike" && b.air === "up") b.shadowX = clamp(G.player.x, 60, Wd.W - 60);
      else b.shadowX = null;
    },
    strike(e) {
      const p = G.player, d = e.d, b = e.boss, hot = b.phase > 1;
      e.hitDone = false;
      if (e.move === "chain") { e.strikeDur = 0.45; fx().shake(4); }
      else if (e.move === "pound") {
        e.strikeDur = 0.5; fx().shake(10);
        pool(e, p.x, d.dmg * 0.4, hot ? 3.2 : 2.6, hot ? 200 : 160, 0.55);
      } else if (e.move === "towers") {
        e.strikeDur = 0.6;
        const g = 1000, n = Math.max(1, b.towers) * (hot ? 2 : 1);
        for (let i = 0; i < n; i++) {
          const sx = e.x + e.dir * (i % 2 ? 10 : -20), sy = e.y - e.h * 1.05;
          const tx = clamp(p.x + (i % 2 ? 1 : -1) * rnd(20, 110), 60, Wd.W - 60), ty = groundY(tx, p.y - 40) - 8;
          const T = clamp(Math.abs(tx - sx) / 460, 0.75, 1.3) + Math.floor(i / 2) * 0.35, v = lobAt(sx, sy, tx, ty, T, g);
          G.shots.push({ team: "f", kind: "orb", c: LAVA, x: sx, y: sy, vx: v.vx, vy: v.vy, g, r: 12, dmg: Math.round(d.dmg * 0.55), life: 3.5, land: true, src: e, by: d.name,
            onEnd: (s) => pool(e, s.x, d.dmg * 0.3, 2.5, 50) });
        }
      } else if (e.move === "drop") {
        e.strikeDur = 3; b.air = "up"; e.vy = -1500; e.onGround = false; e.vx = 0; e.under = true;
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, b = e.boss;
      if (e.move === "chain") {
        if (!e.hitDone && e.st < 0.2) { // only the end of the chain hurts
          const a = e.x + e.dir * 110, z = e.x + e.dir * 440;
          if (DS.boxHitsPlayer(Math.min(a, z), e.y - e.h * 0.9, Math.max(a, z), e.y - e.h * 0.15)) { e.hitDone = true; hurt(e, d.dmg); p.vx = e.dir * 380; }
        }
      } else if (e.move === "pound") {
        if (!e.hitDone && e.st < 0.12 && front(e, 120, 0.8, 30)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "drop") {
        if (b.air === "up") {
          if (e.st > 0.55) { b.air = "fall"; e.x = clamp(p.x, 80, Wd.W - 80); e.y = groundY(e.x, p.y - 40) - 900; e.vy = 300; }
          else if (e.st > 0.4) e.vy = Math.min(e.vy, -200);
        } else if (b.air === "fall") {
          if (e.st > 0.95) e.under = false;
          if (e.onGround) {
            b.air = "land"; e.under = false; e.st = e.strikeDur - 0.5; fx().shake(13);
            if (DS.boxHitsPlayer(e.x - 140, e.y - e.h, e.x + 140, e.y)) hurt(e, d.dmg * 1.2);
            for (const k of [1, -1]) for (let i = 0; i < 3; i++) flame(e, e.x + k * (50 + i * 40), e.y - 16, k * rnd(200, 360), -rnd(0, 60), d.dmg * 0.35, 0.6);
            fx().puff(e.x, e.y, 20, "rgba(255,140,60,0.5)");
          }
        }
        if (b.air !== "land" && e.st > e.strikeDur - 0.55) e.st = e.strikeDur - 0.55;
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { chain: "chainWind", pound: "poundUp", towers: "towerFire", drop: "crouch" }[m];
      if (e.state === "strike" && m === "drop") return { up: "jump", fall: "fall", land: "land" }[b.air];
      if (e.state === "strike" || e.state === "recover") return { chain: "chain", pound: "pound", towers: "towerFire", drop: "land" }[m];
      return Math.abs(e.vx) > 15 && Math.sin(G.t * 6) > 0.6 ? "stomp" : null;
    },
  };

  // ---------------- the Ashen Sovereign (map 6, level 60: wins a kit) ----------------
  // Trident Sweep with a fan of flame left hanging in the air; Thrust, a lunge across the hall (below half it leaves
  // fire behind); Pillar Call: he plants the trident and pillars of fire rise in two alternating rows, so the knight
  // must step from the first row's gaps into the second's; Flame Cloak: for a while he burns to the touch and every
  // blow struck on him up close burns the striker back. Plunge: he leaps out of sight and drives straight down on the
  // knight, then is stuck pulling the trident from the floor (open to blows).
  AI["ashen-sovereign"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Sovereign's crown flares");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const b = e.boss;
        const m = b.count % 6 === 5 ? "cloak"
          : adx < 160 ? pick([["sweep", 5], ["plunge", 1], ["pillars", 1]])
          : adx < 480 ? pick([["thrust", 4], ["pillars", 3], ["plunge", 2]])
          : pick([["pillars", 3], ["plunge", 3], ["thrust", 2]]);
        start(e, m, { sweep: 0.55, thrust: 0.5, pillars: 0.8, cloak: 0.45, plunge: 0.45 }[m] * (hot ? 0.85 : 1));
        return 0;
      }
      return adx > 130 ? Math.sign(dx) : 0;
    },
    frame(e, dt) {
      const b = e.boss;
      e.thorns = e.state === "strike" && e.move === "cloak" ? Math.round(e.d.dmg * 0.3) : 0;
      e.vuln = e.state === "strike" && e.move === "plunge" && b.air === "stuck" ? 1.4 : 0;
      b.shadowX = e.state === "strike" && e.move === "plunge" && (b.air === "up" || b.air === "hang") ? clamp(G.player.x, 60, Wd.W - 60) : null;
    },
    strike(e) {
      const p = G.player, d = e.d, b = e.boss, hot = b.phase > 1;
      e.hitDone = false;
      if (e.move === "sweep") {
        e.strikeDur = 0.35;
        for (let i = 0; i < 4; i++) flame(e, e.x + e.dir * (60 + i * 45), e.y - e.h * (0.85 - i * 0.15), e.dir * 30, 0, d.dmg * 0.35, 0.7);
      } else if (e.move === "thrust") {
        e.strikeDur = 0.45; e.dir = Math.sign(p.x - e.x) || e.dir; e.vx = e.dir * 720; b.trail = 0;
      } else if (e.move === "pillars") {
        e.strikeDur = hot ? 2.0 : 1.4;
        const rows = hot ? [0, 1, 0] : [0, 1];
        rows.forEach((r, k) => {
          for (const sd of [1, -1]) for (let i = 0; i < 5; i++) {
            const x = e.x + sd * (110 + r * 100 + i * 200);
            if (x > 40 && x < Wd.W - 40) spike(e, "beam", x, 0.35 + k * 0.7, d.dmg * 0.75, 200, 0.4, LAVA);
          }
        });
      } else if (e.move === "cloak") {
        e.strikeDur = 4; fx().text(e.x, e.y - e.h - 30, "FLAME CLOAK", "#ff9a5a", 15);
      } else if (e.move === "plunge") {
        e.strikeDur = 4; b.air = "up"; e.vy = -1450; e.onGround = false; e.vx = 0;
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, b = e.boss, hot = b.phase > 1;
      if (e.move === "sweep") {
        if (!e.hitDone && e.st < 0.15 && front(e, d.reach, 1, 20)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "thrust") {
        if (!e.hitDone && front(e, 150, 0.8, 0)) { e.hitDone = true; hurt(e, d.dmg); }
        if (hot && (b.trail -= dt) <= 0) { b.trail = 0.09; pool(e, e.x - e.dir * 30, d.dmg * 0.3, 2.5, 30); }
        if (e.st > 0.3) e.vx *= 0.8;
      } else if (e.move === "cloak") {
        e.vx = e.dir * 110; e.dir = Math.sign(p.x - e.x) || e.dir;
        if (DS.boxHitsPlayer(e.x - 80, e.y - e.h, e.x + 80, e.y)) hurt(e, d.dmg * 0.4);
        if (Math.random() < 0.5) G.fx.push({ kind: "mote", x: e.x + rnd(-40, 40), y: e.y - rnd(0, e.h), vx: 0, vy: -90, t: 0, life: 0.5, c: "rgba(255,140,50," });
      } else if (e.move === "plunge") {
        if (b.air === "up" && e.st > 0.5) { b.air = "hang"; e.fly = true; e.vy = 0; e.y = groundY(p.x, p.y - 40) - 700; e.x = clamp(p.x, 80, Wd.W - 80); b.hang = 0; }
        else if (b.air === "hang") { e.x += clamp(p.x - e.x, -500 * dt, 500 * dt); if ((b.hang += dt) > 0.45) { b.air = "dive"; e.fly = false; e.vy = 1700; } }
        else if (b.air === "dive" && e.onGround) {
          b.air = "stuck"; e.st = e.strikeDur - 1.3; fx().shake(12); fx().text(e.x, e.y - e.h - 30, "STUCK", "#ffd27a", 14);
          if (DS.boxHitsPlayer(e.x - 90, e.y - e.h, e.x + 90, e.y)) hurt(e, d.dmg * 1.2);
          for (const k of [1, -1]) flame(e, e.x + k * 40, e.y - 14, k * 300, 0, d.dmg * 0.35, 0.6);
        }
        if (b.air !== "stuck" && e.st > e.strikeDur - 1.35) e.st = e.strikeDur - 1.35;
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { sweep: "sweepWind", thrust: "sweepWind", pillars: "pillar", cloak: "cloak", plunge: "crouch" }[m];
      if (e.state === "strike" && m === "plunge") return { up: "leap", hang: "apex", dive: "plunge", stuck: "land" }[b.air];
      if (e.state === "strike" || e.state === "recover") return { sweep: "sweep", thrust: "thrust", pillars: "pillar", cloak: "cloak", plunge: "land" }[m];
      return null;
    },
  };

  // ---------------- the Sunken King (the finale, level 71) ----------------
  // A giant in the black water behind the hall (his body is drawn behind the world; DS.KING_BODY). Only his hands
  // reach the causeway. Slam: a hand rises over the knight, follows, and crashes down, then lies there: his heart
  // opens and ONLY the resting hand can be wounded. Sweep: a hand comes in flat from the side of the hall and slides
  // the whole way across (jump it). Grab: a fist closes on the knight and flings them. Below half: Drowning Hands
  // burst up out of the floor under the knight, and he roars down a rain of black water.
  AI["sunken-king"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Sunken King roars");
      const b = e.boss;
      if (e.cd <= 0) {
        const m = b.count % 3 === 2 ? "slam" : pick([["slam", 3], ["sweep", 3], ["grab", 3], ["rise", hot ? 3 : 0], ["rain", hot ? 2 : 0]]);
        b.side = Math.random() < 0.5 ? -1 : 1;
        start(e, m, { slam: 0.9, sweep: 0.8, grab: 0.7, rise: 0.8, rain: 0.9 }[m]);
      }
      return 0;
    },
    frame(e, dt) {
      const b = e.boss, p = G.player;
      if (b.home == null) { b.home = e.x - 380; b.side = 1; b.hx = e.x; }
      e.fly = true; e.vx = 0; e.vy = 0; e.onGround = false;
      const gy = groundY(e.x, p.y - 40);
      const rest = (e.state === "strike" || e.state === "recover") && e.move === "slam" && e.st > 0.25 || e.state === "hurt" && b.wasRest;
      e.under = !rest && !e.dead; // only the resting hand can be struck
      if (rest) b.wasRest = true; else if (e.state !== "hurt") b.wasRest = false;
      b.body = e.dead ? "dying" : rest ? "open" : e.move === "rain" && e.state !== "move" ? "roar" : "still";
      if (e.state === "move") { // hovering out of reach above the water's edge
        e.x += clamp(b.home + b.side * 420 - e.x, -400 * dt, 400 * dt); e.y = groundY(e.x, p.y - 40) - 260;
      } else if (e.state === "windup") {
        if (e.move === "slam" || e.move === "grab") { e.x += clamp(p.x - b.side * 20 - e.x, -520 * dt, 520 * dt); e.y += (groundY(e.x, p.y - 40) - (e.move === "slam" ? 170 : 90) - e.y) * Math.min(1, dt * 8); }
        if (e.move === "sweep") { e.x = b.side < 0 ? camL() + 30 : camR() - 30; e.y = groundY(e.x, p.y - 40); }
        if (e.move === "rise" || e.move === "rain") e.y = gy + 400; // hidden in the deep
        e.dir = e.move === "sweep" ? -b.side : Math.sign(p.x - e.x) || 1;
      }
    },
    strike(e) {
      const p = G.player, d = e.d, b = e.boss, hot = b.phase > 1;
      e.hitDone = false;
      if (e.move === "slam") { e.strikeDur = hot ? 2.0 : 2.4; e.y = groundY(e.x, p.y - 40); fx().shake(12); fx().puff(e.x, e.y, 20, "rgba(120,215,255,0.5)"); }
      else if (e.move === "sweep") { e.strikeDur = 2.2; }
      else if (e.move === "grab") { e.strikeDur = 0.5; }
      else if (e.move === "rise") {
        e.strikeDur = 1.2; e.x = clamp(p.x, 60, Wd.W - 60); b.riseY = groundY(e.x, p.y - 40); e.y = b.riseY + 400; b.riseT = 0;
        b.shadowX = e.x; // the dark patch where the hand will burst up
        for (const k of [1, -1]) spike(e, "beam", clamp(p.x + k * 220, 60, Wd.W - 60), 0.55, d.dmg * 0.7, 150, 0.4, WATER);
      } else if (e.move === "rain") {
        e.strikeDur = 1.2; fx().shake(6);
        for (let i = 0; i < 9; i++) {
          const x = clamp(p.x + (i - 4) * 110 + rnd(-30, 30), 60, Wd.W - 60), gy = groundY(x, p.y - 40);
          G.shots.push({ team: "f", kind: "orb", c: WATER, x, y: gy - 560, vx: 0, vy: 300, g: 1200, r: 11, dmg: Math.round(d.dmg * 0.5), life: 3, delay: 0.3 + (i % 3) * 0.25, warn: gy, land: true, src: e, by: d.name });
        }
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, b = e.boss;
      if (e.move === "slam") {
        if (!e.hitDone && e.st < 0.12 && DS.boxHitsPlayer(e.x - e.w * 0.55, e.y - e.h * 1.2, e.x + e.w * 0.55, e.y)) { e.hitDone = true; hurt(e, d.dmg * 1.2); }
      } else if (e.move === "sweep") {
        e.x += -b.side * 640 * dt; e.y = groundY(e.x, p.y - 40);
        if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.5, e.y - 46, e.x + e.w * 0.5, e.y)) { e.hitDone = true; hurt(e, d.dmg); }
        if (e.x < camL() - 100 || e.x > camR() + 100) e.st = e.strikeDur;
      } else if (e.move === "grab") {
        if (e.st < 0.15) e.y += (groundY(e.x, p.y - 40) - e.y) * Math.min(1, dt * 20);
        if (!e.hitDone && e.st < 0.2 && DS.boxHitsPlayer(e.x - 60, e.y - 90, e.x + 60, e.y + 10)) {
          e.hitDone = true; hurt(e, d.dmg * 1.1); p.vy = -720; p.vx = (p.x < b.home ? 1 : -1) * 520; p.onGround = false; fx().text(p.x, p.y - 100, "FLUNG", "#9fe8ff", 14);
        }
      } else if (e.move === "rise") {
        b.riseT += dt;
        if (b.riseT > 0.45) {
          b.shadowX = null; e.y += (b.riseY - e.y) * Math.min(1, dt * 18);
          if (!e.hitDone && DS.boxHitsPlayer(e.x - 60, b.riseY - 110, e.x + 60, b.riseY)) { e.hitDone = true; hurt(e, d.dmg); p.vy = -600; p.onGround = false; }
        }
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (b.wasRest && e.state === "hurt") return "rest";
      if (e.state === "windup") return { slam: "raised", sweep: "sweep", grab: "raised", rise: "rise", rain: "rise" }[m];
      if (e.state === "strike" || e.state === "recover") {
        if (m === "slam") return e.st > 0.25 || e.state === "recover" ? "rest" : "slam";
        return { sweep: "sweep", grab: "grab", rise: "rise", rain: "rise" }[m];
      }
      return "raised";
    },
  };
  // ---------------- the Hollow Stag (map 7, the Jade Hollow, level 65: wins a familiar) ----------------
  // Robert drew it 2026-11-27. Fast and tall. Antler Charge: it scrapes the floor, then gallops flat out straight
  // through where the knight stood (jump it); below half it wheels round and charges back. Shard Volley: it throws
  // its head back and flings its antlers, and jade shards arc high and rain down on marked spots round the knight.
  // Crown Leap: it leaps on to the knight and its landing bucks the whole floor round it (Crown Quake): a knight on
  // the ground is thrown and hurt, one in the air at that moment is safe. Root Call: it rears and stamps, and roots burst up on marked spots; a knight
  // caught in them is HELD fast for a moment. Every fourth move is a leap.
  const JADE = "90,255,160";
  AI["jade-stag"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Stag's antlers blaze");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = e.boss.count % 4 === 3 ? "leap"
          : adx < 200 ? pick([["roots", 3], ["leap", 2], ["volley", 1]])
          : adx < 520 ? pick([["charge", 4], ["volley", 3], ["roots", 2]])
          : pick([["charge", 3], ["volley", 3], ["leap", 2]]);
        start(e, m, { charge: 0.75, volley: 0.7, leap: 0.5, roots: 0.65 }[m] * (hot ? 0.85 : 1));
        e.boss.turns = hot && m === "charge" ? 1 : 0;
        return 0;
      }
      return adx > 260 ? Math.sign(dx) : adx < 140 ? -Math.sign(dx) * 0.6 : 0;
    },
    frame(e, dt) {
      const b = e.boss, p = G.player, h = b.held;
      if (h && (h.t -= dt) > 0 && !p.dead) { p.x = h.x; p.vx = 0; if (p.vy < 0) p.vy = 0; } // caught in the roots
      else b.held = null;
      if (e.state === "windup" && e.move === "charge" && Math.random() < 0.3) fx().puff(e.x + e.dir * e.w * 0.4, e.y, 1, "rgba(120,160,120,0.5)");
    },
    strike(e) {
      const p = G.player, d = e.d, b = e.boss, hot = b.phase > 1;
      e.hitDone = false;
      if (e.move === "charge") {
        e.dir = Math.sign(p.x - e.x) || e.dir; e.strikeDur = 2.2; b.goal = clamp(p.x + e.dir * 260, camL() + 70, camR() - 70);
        if (Math.sign(b.goal - e.x) !== e.dir) b.goal = e.x + e.dir * 200;
        fx().shake(4);
      } else if (e.move === "volley") {
        e.strikeDur = 0.6; fx().shake(3);
        const n = hot ? 8 : 5, g = 1300, sx = e.x + e.dir * e.w * 0.3, sy = e.y - e.h * 1.05;
        for (let i = 0; i < n; i++) {
          const tx = clamp(p.x + (i - (n - 1) / 2) * (hot ? 70 : 95) + rnd(-15, 15), 40, Wd.W - 40), gy = groundY(tx, p.y - 40);
          const T = 1.05 + i * 0.07, v = lobAt(sx, sy, tx, gy - 6, T, g);
          G.shots.push({ team: "f", kind: "jshard", x: sx, y: sy, vx: v.vx, vy: v.vy, g, r: 9, dmg: Math.round(d.dmg * 0.6), life: T + 0.3, land: true, warn: gy, tx, src: e, by: d.name,
            onEnd: (s) => fx().spark(s.x, s.y, "#7affc0", 6) });
        }
      } else if (e.move === "leap") {
        e.dir = Math.sign(p.x - e.x) || e.dir; e.strikeDur = 3; b.air = "up";
        const tx = clamp(p.x, camL() + 80, camR() - 80), T = 0.75;
        e.vy = -0.5 * P.gravity * T; e.vx = (tx - e.x) / T; e.onGround = false;
      } else if (e.move === "roots") {
        e.strikeDur = hot ? 1.5 : 0.9; fx().shake(9);
        const xs = [p.x, p.x - 170, p.x + 170];
        xs.forEach((x, i) => roots(e, clamp(x, 40, Wd.W - 40), 0.45 + i * 0.12, d.dmg * 0.7));
        if (hot) roots(e, 0, 1.05, d.dmg * 0.7, true); // a second burst right under wherever the knight went
        fx().puff(e.x + e.dir * 60, e.y, 12, "rgba(110,90,60,0.6)");
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, b = e.boss;
      if (e.move === "charge") {
        e.vx = e.dir * 820;
        if (Math.random() < 0.5) fx().puff(e.x - e.dir * e.w * 0.4, e.y, 1, "rgba(120,160,120,0.5)");
        if (!e.hitDone && front(e, e.w * 0.6, 0.85, e.w * 0.3)) { e.hitDone = true; hurt(e, d.dmg * 1.1); p.vx = e.dir * 520; p.vy = -380; p.onGround = false; }
        const past = (b.goal - e.x) * e.dir <= 0 || e.hitWall;
        if (past) {
          if (b.turns > 0) { b.turns--; e.dir = -e.dir; e.hitDone = false; b.goal = clamp(p.x + e.dir * 260, camL() + 70, camR() - 70); if ((b.goal - e.x) * e.dir < 100) b.goal = e.x + e.dir * 200; fx().shake(5); }
          else { e.vx = e.dir * 200; e.st = e.strikeDur; fx().puff(e.x + e.dir * 40, e.y, 10, "rgba(120,160,120,0.5)"); }
        }
      } else if (e.move === "leap") {
        if (b.air === "up" && e.vy > 0) b.air = "fall";
        if (b.air !== "land" && e.onGround && e.st > 0.1) {
          b.air = "land"; e.vx = 0; e.st = e.strikeDur - 0.7; fx().shake(12);
          if (DS.boxHitsPlayer(e.x - e.w * 0.5, e.y - e.h, e.x + e.w * 0.5, e.y)) hurt(e, d.dmg * 1.2);
          // Crown Quake: the whole floor round it bucks; a knight standing on it is thrown up, one in the air is safe
          const R = e.boss.phase > 1 ? 380 : 300;
          if (!e.hitDone && p.onGround && !p.dead && Math.abs(p.x - e.x) < R && Math.abs(p.y - e.y) < 60) {
            e.hitDone = true; hurt(e, d.dmg * 0.8); p.vy = -620; p.vx = Math.sign(p.x - e.x || 1) * 260; p.onGround = false;
            fx().text(p.x, p.y - 100, "THROWN", "#b8ff9a", 14);
          }
          for (let i = -6; i <= 6; i++) fx().puff(e.x + i * R / 6, e.y, 2, "rgba(120,255,180,0.45)");
        }
        if (b.air !== "land" && e.st > e.strikeDur - 0.75) e.st = e.strikeDur - 0.75;
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (e.state === "hurt") return !e.onGround ? "knock" : e.stun >= 0.5 ? "stun" : null;
      if (e.state === "windup") return { charge: "chargeWind", volley: "volleyWind", leap: "crouch", roots: "rear" }[m];
      if (e.state === "strike" && m === "leap") return { up: "leap", fall: "fall", land: "land" }[b.air];
      if (e.state === "strike" || e.state === "recover") return { charge: e.state === "recover" ? null : "charge", volley: "volley", leap: "land", roots: "slam" }[m];
      return null;
    },
  };
  // ---------------- the Jade Carapace (map 7, the Jade Hollow, level 70: wins the Jade Breaker) ----------------
  // Robert drew it 2026-11-27. Slow and heavy, under a crystal shell that turns blows from the front (e.shell, see
  // hitFoe): strike it from behind or from above. Bite: a short lunge of the tusks. Jade Line: it stabs the floor and
  // crystals burst up in a running line toward the knight and STAY as a hedge for a couple of seconds (unlike the Rift
  // Throne's, which vanish), herding the knight round behind it where the shell is weak; below half a second line runs
  // behind it too. Crystal Shake: it heaves its shell and crystals rain down all round; where they land they STAY as
  // jade shards on the floor for a while. Shell Guard: it pulls in and waits, then rolls out in a Spin across the
  // hall, rebounding off the screen's edges (twice below half). Plunge on to its guarded shell and it flips on its
  // back, legs waving, open to blows.
  AI["jade-carapace"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Carapace's crystals blaze");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const b = e.boss;
        let m;
        if (b.next) { m = b.next; b.next = null; }
        else m = b.count % 5 === 4 ? "guard"
          : adx < 190 ? pick([["bite", 4], ["shake", 2], ["line", 1]])
          : adx < 600 ? pick([["line", 4], ["shake", 3], ["guard", 1]])
          : pick([["line", 3], ["shake", 2], ["guard", 2]]);
        start(e, m, { bite: 0.55, line: 0.75, shake: 0.8, guard: 0.3, spin: 0.6 }[m] * (hot ? 0.85 : 1));
        return 0;
      }
      return adx > 170 ? Math.sign(dx) : 0;
    },
    frame(e, dt) {
      const b = e.boss;
      const shelled = (e.move === "guard" && e.state !== "move") || (e.move === "spin" && e.state === "strike" && b.roll);
      e.shell = shelled && e.state !== "hurt" ? b.shellObj || (b.shellObj = { flip: () => flip(e) }) : null;
      if (b.flipped && e.state !== "hurt") { b.flipped = false; e.vuln = 0; }
    },
    strike(e) {
      const p = G.player, d = e.d, b = e.boss, hot = b.phase > 1;
      e.hitDone = false;
      if (e.move === "bite") { e.strikeDur = 0.35; e.vx = e.dir * 460; }
      else if (e.move === "line") {
        e.strikeDur = 0.8; fx().shake(7);
        for (const sd of hot ? [e.dir, -e.dir] : [e.dir])
          for (let i = 0; i < (hot ? 12 : 10); i++) {
            const x = e.x + sd * (e.w * 0.5 + 20 + i * 52);
            if (x > 30 && x < Wd.W - 30) { spike(e, "crystal", x, 0.1 + i * 0.07 + (sd !== e.dir ? 0.35 : 0), d.dmg * 0.65, 64 + (i % 3) * 14, hot ? 3 : 2.4, JADE); G.shots[G.shots.length - 1].stay = true; }
          }
      } else if (e.move === "shake") {
        e.strikeDur = 0.7; fx().shake(6);
        const n = hot ? 9 : 6, g = 1300, sx = e.x, sy = e.y - e.h * 0.9;
        for (let i = 0; i < n; i++) {
          const tx = clamp(i === 0 ? p.x : e.x + (i % 2 ? 1 : -1) * rnd(90, 460), camL() + 30, camR() - 30), gy = groundY(tx, e.y - 40);
          const T = 1.0 + rnd(0, 0.5), v = lobAt(sx, sy, tx, gy - 6, T, g);
          G.shots.push({ team: "f", kind: "jshard", x: sx + rnd(-30, 30), y: sy, vx: v.vx, vy: v.vy, g, r: 9, dmg: Math.round(d.dmg * 0.55), life: T + 0.3, land: true, warn: gy, tx, src: e, by: d.name,
            onEnd: (s) => { // it stays where it fell: a shard in the floor
              fx().spark(s.x, s.y, "#7affc0", 5);
              if (Math.abs(gy - e.y) < 80) G.shots.push({ team: "f", kind: "crystal", x: tx, y: gy - 16, vx: 0, vy: 0, r: 12, h: 32, dmg: Math.round(d.dmg * 0.35), life: hot ? 5 : 4, warn: gy, ghost: true, stay: true, src: e, by: d.name, c: JADE });
            } });
        }
      } else if (e.move === "guard") {
        e.strikeDur = 2.2; e.vx = 0; fx().text(e.x, e.y - e.h - 24, "SHELL GUARD", "#7affc0", 14);
        b.next = "spin";
      } else if (e.move === "spin") {
        e.dir = Math.sign(p.x - e.x) || e.dir; e.strikeDur = 6; b.roll = true; b.bounces = hot ? 2 : 1; b.endT = 0;
      }
    },
    tick(e, dt) {
      const d = e.d, p = G.player, b = e.boss;
      if (e.move === "bite") {
        e.vx *= 0.86;
        if (!e.hitDone && front(e, e.w * 0.5 + 70, 0.7, 10)) { e.hitDone = true; hurt(e, d.dmg); p.vx = e.dir * 320; }
      } else if (e.move === "guard") { e.vx = 0; }
      else if (e.move === "spin") {
        if (b.roll) {
          e.vx = e.dir * 720;
          if (!e.hitDone && DS.boxHitsPlayer(e.x - e.w * 0.45, e.y - e.h * 0.8, e.x + e.w * 0.45, e.y)) { e.hitDone = true; hurt(e, d.dmg * 1.1); p.vx = e.dir * 480; p.vy = -420; p.onGround = false; }
          const edge = e.dir > 0 ? e.x > camR() - e.w * 0.5 : e.x < camL() + e.w * 0.5;
          if (edge || e.hitWall) {
            fx().shake(8); fx().puff(e.x + e.dir * e.w * 0.4, e.y - 30, 10, "rgba(120,255,180,0.5)");
            if (b.bounces-- > 0) { e.dir = -e.dir; e.hitDone = false; }
            else { b.roll = false; e.vx = -e.dir * 120; e.st = e.strikeDur - 0.6; }
          }
          if (e.st > e.strikeDur - 0.7) e.st = e.strikeDur - 0.7; // it rolls until it runs out of rebounds
        } else e.vx *= 0.9;
      }
    },
    pose(e) {
      const m = e.move, b = e.boss;
      if (e.state === "hurt") return b.flipped ? "flipped" : null;
      if (e.state === "windup") return { bite: "biteWind", line: "spikeWind", shake: "shakeWind", guard: "guard", spin: "spinStart" }[m];
      if (e.state === "strike") return m === "spin" ? (b.roll ? "spin" : "spinEnd") : { bite: "bite", line: "spike", shake: "shake", guard: "guard" }[m];
      if (e.state === "recover") return { bite: "bite", line: "spike", shake: "shake", guard: "guard", spin: "spinEnd" }[m];
      return null;
    },
  };
  // a plunge on to the Carapace's guarded shell tips it on its back: legs waving, open to blows
  function flip(e) {
    const b = e.boss; if (b.flipped) return;
    b.flipped = true; b.roll = false; b.next = null; e.shell = null; e.vuln = 1.6;
    e.state = "hurt"; e.st = 0; e.stun = 2.6; e.vx = 0;
    fx().text(e.x, e.y - e.h - 30, "FLIPPED!", "#ffd27a", 16); fx().shake(9);
  }
  // roots bursting up from a marked spot: a knight they catch is held fast (follow: aimed under the knight when they burst)
  function roots(e, x, delay, dmg, follow) {
    const gy0 = groundY(x, G.player.y - 40);
    G.shots.push({ team: "f", kind: "roots", x, y: gy0 - 34, vx: 0, vy: 0, r: 30, h: 68, dmg: Math.round(dmg), life: 0.7, delay, warn: gy0, ghost: true, src: e, by: e.d.name, c: "150,120,70", follow,
      update(s) {
        if (s.t > 0.2) return;
        const p = G.player;
        if (s.follow && !s.aimed) { s.aimed = true; s.x = clamp(p.x, 40, Wd.W - 40); s.warn = groundY(s.x, p.y - 40); s.y = s.warn - 34; }
        if (!e.boss.held && !p.dead && DS.boxHitsPlayer(s.x - s.r, s.y - s.h / 2, s.x + s.r, s.y + s.h / 2)) {
          e.boss.held = { x: p.x, t: 0.9 }; fx().text(p.x, p.y - 100, "HELD", "#b8ff9a", 14);
        }
      } });
  }
})(window.DS = window.DS || {});
