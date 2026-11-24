/* The later levels' bosses, ported from the main game (Robert 2026-11-18/20): the Drowned Colossus (map 1, level 5),
   the Mother Wyvern (map 2, level 15) and the Crucible Wyrm (map 2, level 20). DS.bossFor in data.js puts them at the
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
  // a falling boulder with a warning mark on the ground first
  function rock(e, x, delay, dmg) {
    const p = G.player, gy = groundY(x, p.y - 40);
    G.shots.push({ team: "f", kind: "rock", x, y: gy - 560, vx: 0, vy: 200, g: 1500, r: 18, dmg: Math.round(dmg), life: 3, delay, warn: gy, land: true, src: e, by: e.d.name,
      onEnd: (s) => { fx().puff(s.x, s.y, 8, "rgba(150,160,130,0.6)"); fx().shake(3); } });
  }
  // a gout of fire: a short-lived flame that drifts along (the dragons' breath)
  function flame(e, x, y, vx, vy, dmg, life = 0.7) {
    G.shots.push({ team: "f", kind: "flame", x, y, vx, vy, r: 16, h: 30, dmg: Math.round(dmg), life, life0: life, src: e, by: e.d.name, ghost: true });
  }

  // ---------------- the Drowned Colossus (map 1, level 5: wins a familiar) ----------------
  // Slam (shockwaves both ways), Surge (a tall wave to jump), Collapse (boulders rain where the knight stands),
  // and a leap that shakes the ground. Below half health the waves come in pairs and more boulders fall.
  AI["drowned-colossus"] = {
    think(e, dx, adx) {
      const hot = rage(e, "The Colossus tears loose");
      e.dir = Math.sign(dx) || e.dir;
      if (e.cd <= 0) {
        const m = adx < 200 ? pick([["slam", 6], ["leap", 2], ["collapse", hot ? 2 : 1]])
          : adx < 520 ? pick([["surge", 4], ["collapse", hot ? 3 : 2], ["leap", 3]])
          : pick([["surge", 5], ["leap", 4]]);
        start(e, m, { slam: 0.8, surge: 0.9, collapse: 0.75, leap: 0.55 }[m]);
        return 0;
      }
      return adx > 130 ? Math.sign(dx) : 0;
    },
    strike(e) {
      const p = G.player, d = e.d, hot = e.boss.phase > 1;
      e.hitDone = false;
      if (e.move === "slam") {
        e.strikeDur = 0.35; fx().shake(11);
        for (const s of [1, -1]) {
          DS.groundWave(e, e.x + s * 70, s, 0, 480, 1.8, d.dmg * 0.65);
          if (hot) DS.groundWave(e, e.x + s * 70, s, 0.4, 480, 1.8, d.dmg * 0.65);
        }
      } else if (e.move === "surge") {
        e.strikeDur = 0.55; fx().shake(6);
        DS.groundWave(e, e.x + e.dir * 80, e.dir, 0.05, 380, 2.8, d.dmg * 0.8, { y: e.y - 28, r: 22, h: 56, big: 1 });
        if (hot) DS.groundWave(e, e.x + e.dir * 80, e.dir, 0.55, 380, 2.8, d.dmg * 0.8, { y: e.y - 28, r: 22, h: 56, big: 1 });
      } else if (e.move === "collapse") {
        e.strikeDur = 0.6; fx().shake(5);
        const n = hot ? 6 : 4, xs = [p.x];
        for (let i = 1; i < n; i++) xs.push(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * rnd(110, 150));
        xs.forEach((x, i) => rock(e, clamp(x, 80, Wd.W - 80), 0.45 + i * 0.16, d.dmg * 0.7));
      } else if (e.move === "leap") {
        e.strikeDur = 2.6; e.vy = -900; e.onGround = false;
        e.vx = clamp((p.x - e.x) / 0.85, -640, 640);
      }
    },
    tick(e) {
      const d = e.d;
      if (e.move === "slam") {
        if (!e.hitDone && e.st < 0.12 && front(e, d.reach, 0.9, 30)) { e.hitDone = true; hurt(e, d.dmg); }
      } else if (e.move === "leap") {
        if (e.onGround && e.st > 0.2) {
          e.st = 9; e.vx = 0; fx().shake(12);
          for (const s of [1, -1]) DS.groundWave(e, e.x + s * 60, s, 0, 520, 1.4, d.dmg * 0.6);
          if (DS.boxHitsPlayer(e.x - 130, e.y - e.h, e.x + 130, e.y)) hurt(e, d.dmg);
          fx().puff(e.x, e.y, 18, "rgba(140,160,110,0.55)");
        }
      }
    },
    pose(e) {
      const m = e.move;
      if (e.state === "hurt") return e.stun >= 0.5 ? "stun" : !e.onGround ? "knock" : null;
      if (e.state === "windup") return { slam: "slamUp", surge: "surgeWind", collapse: "callUp", leap: "crouch" }[m];
      if (e.state === "strike") return m === "leap" ? (e.onGround ? (e.st > 0.2 ? "land" : "crouch") : e.vy < 0 ? "jump" : "fall") : { slam: "slam", surge: "surge", collapse: "callUp" }[m];
      if (e.state === "recover") return { slam: "slam", surge: "surge", collapse: "callUp", leap: "land" }[m];
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
            for (const s of [1, -1]) DS.groundWave(e, e.x + s * 70, s, 0, 500, 1.5, d.dmg * 0.6, { c: "255,140,50" });
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
})(window.DS = window.DS || {});
