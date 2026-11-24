/* The game: state, main loop, the knight's movement, the Drowned, projectiles, zones and damage.
   Kit-specific attacks and abilities are in src/kits.js; drawing in src/render.js; menus in src/ui.js. */
"use strict";
(function (DS) {
  const P = DS.PHYS, Wd = DS.World, I = DS.Input;
  const G = DS.G = {
    mode: "title", t: 0, foes: [], shots: [], zones: [], fx: [], texts: [],
    cam: { x: 0, y: 400, shake: 0 }, hitstop: 0, wave: 0, waveT: 2, waves: true, scroll: true, level: 0, enc: [], bossX: 0, checkpoint: 300, clearT: 0, tok: 0, auto: false, endless: false, autoT: 0, wall: false, wallT: 0, wallLocked: false, god: false, boxes: false,
    kills: 0, combo: 0, comboT: 0, best: 0, swingId: 0, dummyLog: [], kit: "lanternBlade",
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  DS.util = { clamp, rnd };

  // ---------------- the knight ----------------
  function newPlayer(kitId) {
    const k = DS.KITS[kitId];
    DS.Sprites.loadSet(k.sprite);
    (k.forms || []).forEach((f) => DS.Sprites.loadSet(f.sprite));
    const max = Math.round(P.hp * (k.hpMult || 1) * DS.Explore.hpMult(kitId));
    return {
      kitId, k, x: G.scroll ? G.checkpoint : Wd.W / 2, y: Wd.FLOOR - 200, vx: 0, vy: 0, w: 28, h: 74, dir: 1,
      hp: max, max, onGround: false, coyote: 0, buffer: 0, airJumps: 1, airDash: 1,
      dashT: 0, dashCd: 0, inv: 1, hurtT: 0, dead: 0, atk: null, comboStep: 0, comboT: 0,
      cast: null, abilCd: 0, stillT: 0, moveT: 0, rushT: 0, heat: 0, heatT: 0, stacks: 0, stackT: 0,
      charge: -1, guard: false, guardT: 0, waltz: null, lunge: null, plunge: false, runT: 0, dashHits: null, dropT: 0,
    };
  }
  DS.newPlayer = newPlayer;

  // multipliers the kit passives give to the knight's damage
  function dmgMult(p) {
    let m = 1;
    const k = p.k;
    if (k.stance && p.stillT >= k.stance.after) m *= k.stance.dmg;
    if (k.momentum) m *= 1 + Math.min(1, p.moveT / k.momentum.full) * k.momentum.bonus;
    if (k.heat) m *= 1 + (p.heat / k.heat.max) * k.heat.dmg;
    if (k.tithe) m *= 1 + p.stacks * k.tithe.dmg;
    if (p.bless > 0) m *= 1 + p.blessAmt;   // Abigail's blessing
    if (p.fury > 0) m *= 1 + p.furyAmt;     // David's War Fury
    return m * DS.Explore.dmgMult(p); // kit level from sigils, relics
  }
  function speedMult(p) {
    let m = p.k.speedMult || 1;
    if (p.rushT > 0) m *= p.k.rush.speed;
    if (p.k.tithe) m *= 1 + p.stacks * p.k.tithe.speed;
    if (p.bless > 0) m *= 1 + p.blessAmt;
    return m * DS.Explore.speedMult();
  }
  function atkSpeed(p) { return p.k.tithe ? 1 + p.stacks * p.k.tithe.atk : 1; }
  function spriteOf(p) {
    let s = p.k.sprite;
    for (const f of p.k.forms || []) if (p.stacks >= f.at) s = f.sprite;
    return s;
  }
  DS.dmgMult = dmgMult; DS.spriteOf = spriteOf;

  function updatePlayer(p, dt) {
    const k = p.k;
    if (p.dead) { p.dead += dt; p.vx *= 0.9; p.vy += P.gravity * dt; Wd.move(p, dt); if (p.dead > 2.2) respawn(); return; }
    p.inv = Math.max(0, p.inv - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.flipT = Math.max(0, (p.flipT || 0) - dt); p.landT = Math.max(0, (p.landT || 0) - dt); p.dashCd = Math.max(0, p.dashCd - dt);
    p.abilCd = Math.max(0, p.abilCd - dt); p.rushT = Math.max(0, p.rushT - dt); p.dropT = Math.max(0, p.dropT - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    // Blood Tithe drains, forge heat cools
    if (k.tithe && p.stacks > 0) { p.stackT -= dt; if (p.stackT < 0) { p.stacks--; p.stackT = k.tithe.drain; } }
    if (k.heat) { p.heatT -= dt; if (p.heatT < 0 && !p.guard) p.heat = Math.max(0, p.heat - k.heat.cool * dt); }

    const mx = Math.abs(I.x) > 0.25 ? Math.sign(I.x) : 0;
    const locked = p.cast && p.cast.lock || p.guard || p.lunge || p.hurtT > 0.45;
    // facing
    if (mx && !p.atk && !p.dashT && !locked && !p.plunge) p.dir = mx;

    // dash (cancels attack recovery and casts that allow it)
    if (I.p.dash && p.dashCd <= 0 && !p.guard && !p.lunge && (p.onGround || p.airDash > 0) && !(p.cast && p.cast.lock)) {
      { // a dash cancels any swing at once
        if (mx) p.dir = mx;
        p.atk = null; p.cast = null; p.plunge = false;
        p.dashT = P.dashTime; p.dashCd = k.dashCd || P.dashCd; p.inv = Math.max(p.inv, P.dashInv);
        if (!p.onGround) p.airDash--;
        p.vy = 0; p.dashHits = new Set();
        puff(p.x, p.y, 6, "rgba(180,200,210,0.5)");
      }
    }

    // stance / momentum bookkeeping
    if (p.onGround && !mx && !p.dashT) p.stillT += dt; else p.stillT = 0;
    if (Math.abs(p.vx) > 60 || p.dashT) p.moveT = Math.min(2, p.moveT + dt); else p.moveT = Math.max(0, p.moveT - dt * 2);

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dir * P.dashSpeed * Math.min(1.2, speedMult(p) * 0.9 + 0.1); p.vy = 0;
      if (k.dashStrike) DS.Kits.dashStrike(p);
      if (Math.random() < 0.6) G.fx.push({ kind: "ghost", x: p.x, y: p.y, dir: p.dir, t: 0, life: 0.18, rec: DS.Sprites.frame(spriteOf(p), "dash", 0) });
      if (p.dashT <= 0) { p.dashT = 0; p.vx *= 0.4; } // back to exactly 0: a negative timer read as "still dashing" and locked jump, attack and ability
    } else if (p.lunge) {
      DS.Kits.lungeTick(p, dt);
    } else {
      // run
      const top = P.speed * speedMult(p) * (p.waltz ? k.ability.move : 1) * (p.atk && p.onGround && !p.atk.ranged ? 0.55 : 1) * (p.charge >= 0 ? 0.2 : 1);
      const want = locked ? 0 : mx * top;
      const acc = p.onGround ? P.accel : P.airAccel;
      if (want) p.vx += clamp(want - p.vx, -acc * dt, acc * dt);
      else p.vx -= clamp(p.vx, -P.friction * dt, P.friction * dt);
      // gravity
      if (p.plunge) p.vy = P.plungeSpeed;
      else p.vy = Math.min(P.maxFall, p.vy + P.gravity * dt * (p.vy > 0 ? 1.15 : 1));
    }

    // jumping: no cooldown. Coyote time, buffered presses, a double jump, and a jump cancels a dash or the
    // rest of a swing. Drop through a platform only with the stick held hard down.
    p.coyote = p.onGround ? P.coyote : Math.max(0, p.coyote - dt);
    p.buffer = I.p.jump ? P.buffer : Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && !locked && !p.plunge) {
      const drop = I.y > 0.8 && Math.abs(I.x) < 0.5 && p.onPlat;
      const jumped = drop || p.coyote > 0 || p.airJumps > 0;
      if (jumped && p.dashT > 0) { p.dashT = 0; p.vx *= 0.75; } // dash-jump keeps most of the dash's speed
      if (jumped && p.atk && !p.atk.ranged) p.atk = null;
      if (drop) { p.dropT = 0.25; p.buffer = 0; p.onGround = false; p.y += 2; }
      else if (p.coyote > 0) { p.vy = -P.jump; p.coyote = 0; p.buffer = 0; p.jumpT = 0; puff(p.x, p.y, 5, "rgba(150,170,160,0.5)"); }
      else if (p.airJumps > 0) { p.vy = -P.doubleJump; p.airJumps--; p.buffer = 0; p.jumpT = 0; p.flipT = 0.32; ring(p.x, p.y - 10, "rgba(" + k.color + ",0.6)"); }
    }
    // short hop: letting go early cuts the jump, but never before 0.1 s, so a quick tap still gives a real jump
    p.jumpT = (p.jumpT == null ? 9 : p.jumpT) + dt;
    if (!I.h.jump && p.vy < 0 && !p.dashT && p.jumpT >= 0.1 && p.jumpT < 0.4 && !p.cutDone) { p.vy *= P.cut; p.cutDone = true; }
    if (p.jumpT < dt * 1.5) p.cutDone = false;

    const wasAir = !p.onGround, vyBefore = p.vy;
    Wd.move(p, dt);
    if (p.onGround) {
      p.airJumps = 1; p.airDash = 1;
      if (wasAir && vyBefore > 400) puff(p.x, p.y, 6, "rgba(150,170,160,0.45)");
      if (wasAir) { p.flipT = 0; if (vyBefore > 300 && Math.abs(p.vx) < 120) p.landT = 0.1; } // a short crouch on landing (look only, no lock)
      if (p.plunge) DS.Kits.plungeLand(p);
    }
    p.x = clamp(p.x, 40 + p.w / 2, Wd.W - 40 - p.w / 2);
    if (p.y > Wd.H + 200) { p.y = Wd.FLOOR - 300; p.x = G.scroll ? G.checkpoint : Wd.W / 2; p.vy = 0; }

    // attack / ability
    DS.Kits.update(p, dt);
    p.runT += Math.abs(p.vx) * dt;
  }

  function respawn() {
    const kit = G.player.kitId;
    DS.Explore.onDeath();
    G.player = newPlayer(kit);
    G.foes = G.foes.filter((f) => f.d.dummy);
    G.shots = []; G.zones = [];
    G.waveT = 2.5;
    G.tok++; // drop ambushes still being summoned; the ones from the checkpoint on spring again
    for (const e of G.enc) if (e.x >= G.checkpoint - 10) e.on = false;
    G.combo = 0;
    if (G.wall) nextWallKnight();
    DS.Fam.reset();
  }

  // ---------------- damage ----------------
  // The knight hits a foe. opt: {dmg, kb, kbY, dir, heavy, burn, chill, freeze, root, stun, hitstop, noMult, src, fromX}
  function hitFoe(e, opt) {
    if (e.dead || e.spawnT > 0 || e.under) return false; // e.under: the Starved Bell, buried in the mud
    const p = G.player;
    let dmg = opt.dmg * (opt.noMult ? 1 : dmgMult(p));
    const dir = opt.dir || Math.sign(e.x - (opt.fromX != null ? opt.fromX : p.x)) || 1;
    let blocked = false;
    // the Bone Bulwark's shield: blocks blows from in front unless heavy or from above
    if (e.d.shield && !e.broken && !opt.heavy && !opt.plunge && Math.sign(dir) === -e.dir && e.state !== "hurt") {
      dmg *= e.d.shield; blocked = true; e.blockT = 0.3;
      spark(e.x + e.dir * e.w * 0.5, e.y - e.h * 0.55, "#cfd8dc", 6);
      text(e.x, e.y - e.h - 6, "BLOCK", "#cfd8dc", 12);
    }
    if (e.brittle) dmg *= 1.2;
    if (e.vuln) dmg *= e.vuln; // a boss's weak spot is open (the Magma Golem's core, the Hydra's stumps)
    if (e.thorns && Math.abs(e.x - p.x) < 150) hurtPlayer(e.thorns, null, e.d.name + "'s flame cloak"); // the Ashen Sovereign burns back
    if (e.curse) dmg *= 1 + e.curse; // cursed by Abigail's soul orbs
    if (!opt.noMult) dmg *= DS.Explore.strike(e, opt); else e.alerted = true; // unseen in the mist: the first blow lands harder
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.flash = 0.1;
    if (e.d.dummy) { e.hp = e.max; G.dummyLog.push([G.t, dmg]); }
    // knockback (bosses and shields only budge)
    const kbm = (e.d.boss ? 0.15 : 1) * (blocked ? 0.3 : 1) * (e.d.dummy ? 0 : 1);
    if (opt.kb) { e.vx = dir * opt.kb * kbm; if (!e.root && !e.freeze) e.kbT = 0.18; }
    if (opt.kbY && !e.d.boss && !blocked && !e.d.dummy) { e.vy = -Math.abs(opt.kbY); e.onGround = false; }
    // stagger: a hit interrupts a wind-up, except on poise enemies (unless heavy)
    if (!blocked && !e.d.dummy && (!e.d.poise || opt.heavy && !e.d.boss) && e.state !== "dead") { e.state = "hurt"; e.st = 0; e.stun = opt.stun || 0.22; }
    if (e.d.shield && opt.heavy && !blocked && !e.broken) { e.broken = 1.5; text(e.x, e.y - e.h - 20, "GUARD BROKEN", "#ffd27a", 12); }
    if (e.d.boss) { e.poise = (e.poise || 0) + dmg; if (e.poise > 140) { e.poise = 0; e.state = "hurt"; e.st = 0; e.stun = 0.9; text(e.x, e.y - e.h - 24, "STAGGERED", "#ffd27a", 14); } }
    if (opt.burn) e.burn = { t: 3, dps: opt.burn, tick: 0.5 };
    if (opt.chill) e.chill = Math.max(e.chill || 0, opt.chill);
    if (opt.freeze) { if (e.d.boss) e.chill = Math.max(e.chill || 0, opt.freeze); else e.freeze = Math.max(e.freeze || 0, opt.freeze); }
    if (opt.root) e.root = Math.max(e.root || 0, e.d.boss ? opt.root * 0.3 : opt.root);
    text(e.x + rnd(-8, 8), e.y - e.h - 4, String(dmg), blocked ? "#9aa" : opt.color || "#fff", dmg >= 25 ? 17 : 14);
    spark(e.x - dir * e.w * 0.2, e.y - e.h * 0.55, opt.sparkColor || "#e8f4ff", blocked ? 3 : 8);
    G.hitstop = Math.max(G.hitstop, opt.hitstop != null ? opt.hitstop : 0.045);
    if (!opt.quiet) { shake(opt.heavy ? 5 : 2.5); I.rumble(opt.heavy ? 0.5 : 0.2, 0.3, 60); } // a familiar's blows don't shake the screen
    G.combo++; G.comboT = 2; G.best = Math.max(G.best, G.combo);
    if (G.player.k.heat && !opt.noHeat) { p.heat = Math.min(p.k.heat.max, p.heat + p.k.heat.perHit); p.heatT = p.k.heat.hold; }
    if (e.hp <= 0 && !e.d.dummy) kill(e);
    return true;
  }

  function kill(e) {
    e.dead = true; e.state = "dead"; e.st = 0; e.deadT = 0; e.vy = -260; e.vx = Math.sign(e.x - G.player.x) * 160;
    G.kills++; G.autoKillT = G.t; // the autopilot's proof that the fight is going somewhere
    DS.Fam.onKill(); DS.Loot.onKill(e); // currencies drop (src/loot.js)
    if (e.enc && e.enc.boss) e.enc.won = true; // remembered: his body is cleared away 1.4 s later
    const p = G.player, k = p.k;
    for (let i = 0; i < 14; i++) G.fx.push({ kind: "mote", x: e.x + rnd(-14, 14), y: e.y - rnd(10, e.h), vx: rnd(-60, 60), vy: rnd(-160, -40), t: 0, life: rnd(0.5, 1), c: "rgba(110,230,220," });
    if (k.tithe) { p.stacks += e.d.boss ? k.tithe.boss : 1; p.stackT = k.tithe.hold; }
    if (k.rush) { p.dashCd = 0; p.airDash = 1; p.rushT = k.rush.dur; text(p.x, p.y - p.h - 14, "RUSH", "#c9a0ff", 12); }
    if (e.d.boss) { shake(12); text(e.x, e.y - e.h - 30, e.d.fallen || "SOVEREIGN FALLEN", "#ffd27a", 20); }
  }

  // A foe hits the knight. src = the foe (for thorns and the guard's facing), by = a name for the log
  function hurtPlayer(dmg, src, by, fromX) {
    const p = G.player, k = p.k;
    if (p.dead || p.inv > 0 || p.dashT > 0) return false;
    const fx = fromX != null ? fromX : src ? src.x : p.x;
    const front = Math.sign(fx - p.x) === p.dir;
    let m = 1;
    if (k.guard) m *= 1 - k.guard;
    if (k.aegis) m *= 1 - k.aegis;
    m *= DS.Loot.hurtMult(); // the Guard upgrade
    const stance = k.stance && p.stillT >= k.stance.after;
    if (stance) m *= 1 - k.stance.guard;
    if (p.bless > 0) m *= 1 - p.blessAmt;             // Abigail's blessing
    if (src && src.curse) m *= 1 - src.curse;         // a foe she cursed hits softer
    if (p.guard && front) {
      m *= 1 - k.ability.guard;
      p.heat = Math.min(k.heat.max, p.heat + k.heat.perBlock); p.heatT = k.heat.hold;
      spark(p.x + p.dir * 20, p.y - 40, "#ffb060", 10); text(p.x, p.y - p.h - 10, "GUARD", "#ffb060", 12);
    }
    dmg = Math.max(1, Math.round(dmg * m));
    if (G.god) dmg = 0;
    p.hp -= dmg; p.inv = P.hurtInv; p.hurtT = p.guard || stance ? 0 : 0.3;
    if (!stance && !p.guard) { p.vx = Math.sign(p.x - fx || 1) * 260; p.vy = Math.min(p.vy, -220); p.atk = null; p.cast = p.cast && p.cast.lock ? null : p.cast; p.plunge = false; }
    text(p.x, p.y - p.h - 6, dmg ? "-" + dmg : "0", "#ff6a6a", 15);
    if (dmg) G.redT = 0.25; shake(dmg ? 6 : 2); G.hitstop = Math.max(G.hitstop, 0.06); I.rumble(0.7, 0.5, 140);
    if (k.thorns && src && src.d && !src.dead) hitFoe(src, { dmg: Math.round(dmg * k.thorns) || 1, noMult: true, color: "#ff8fb0", noHeat: true, hitstop: 0 });
    G.combo = 0;
    if (p.hp <= 0) { p.hp = 0; p.dead = 0.001; p.lastHit = by; text(p.x, p.y - p.h - 30, "Fell to the " + by, "#ff9a9a", 14); }
    return true;
  }
  DS.hitFoe = hitFoe; DS.hurtPlayer = hurtPlayer;

  // ---------------- the Drowned ----------------
  function spawnFoe(type, x, y) {
    const d = type === "dummy" ? DUMMY : DS.ENEMIES[type];
    if (d.sprite) DS.Sprites.loadSet(d.sprite);
    if (x == null && G.scroll && G.player) { // in a level: just off screen, either side of the knight
      const p = G.player, s = Math.random() < 0.5 ? -1 : 1;
      x = clamp(p.x + s * (DS.Render.vw / 2 + 60), 100, Wd.W - 100); y = Wd.surfaceBelow(x, -2000);
      if (Wd.solidAt(x, y + 1) && y < Wd.FLOOR) { /* on a stone: fine */ }
    }
    const side = x == null ? (Math.random() < 0.5 ? 0 : 1) : null;
    const sp = side == null ? { x, y } : Wd.spawns[side];
    const px = G.player ? G.player.x : Wd.W / 2;
    const e = {
      type, d, x: sp.x + (side == null ? 0 : rnd(-30, 30)), y: sp.y, vx: 0, vy: 0, w: d.w, h: d.h, dir: sp.x < px ? 1 : -1,
      hp: d.hp, max: d.hp, chill: 0, freeze: 0, root: 0, kbT: 0, broken: 0, state: "move", st: 0, cd: rnd(0.4, 1.2), spawnT: d.dummy ? 0 : 0.5, jumpCd: 0, runT: 0, flash: 0,
      boss: d.boss ? { next: 0, phase: 1 } : null,
    };
    G.foes.push(e);
    if (!d.dummy) G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.7 });
    return e;
  }
  const DUMMY = { name: "Training Dummy", ai: "dummy", hp: 9999, w: 36, h: 80, dummy: true, speed: 0 };
  DS.spawnFoe = spawnFoe;

  function canSee(e, p) { return Math.abs(p.y - e.y) < 260; }

  function updateFoe(e, dt) {
    const d = e.d;
    // a Drowned near one of Derek's walls turns on the wall (it stands in for the knight below)
    if (e.state === "move" || e.state === "hurt") e.lure = DS.Fam.lure(e);
    const p = e.lure && !e.lure.gone ? e.lure : G.player;
    e.flash = Math.max(0, e.flash - dt);
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    if (e.dead) {
      e.deadT += dt; e.vy += P.gravity * dt; e.vx *= 0.95; Wd.move(e, dt);
      return;
    }
    // statuses
    for (const s of ["chill", "freeze", "root", "kbT", "broken", "blockT", "landT"]) if (e[s] > 0) e[s] = Math.max(0, e[s] - dt);
    if (e.burn) {
      e.burn.t -= dt; e.burn.tick -= dt;
      if (e.burn.tick <= 0) { e.burn.tick = 0.5; hitFoe(e, { dmg: e.burn.dps * 0.5, noMult: true, color: "#ffa040", hitstop: 0, noHeat: true, kb: 0 }); if (e.dead) return; }
      if (e.burn.t <= 0) e.burn = null;
    }
    const slow = (e.chill > 0 ? 0.5 : 1) * DS.Fam.tickFoe(e, dt); // frost, Fred's spores, Abigail's curse
    if (e.dead) return; // bled out
    const busy = e.freeze > 0;
    e.cd -= dt * slow * (busy ? 0 : 1);
    e.jumpCd -= dt;
    e.st += dt * (busy ? 0 : slow);
    const dx = p.x - e.x, adx = Math.abs(dx), dy = p.y - e.y;
    let want = 0; // desired walking direction
    const target = !p.dead && !DS.Explore.hidden(e); // in mist they can't see the knight past its light

    if (d.dummy) { e.vx = 0; }
    else if (busy) { /* frozen solid */ }
    else if (e.state === "hurt") {
      if (e.st > e.stun) { e.state = "move"; e.st = 0; e.cd = Math.max(e.cd, 0.25); }
    } else if (e.state === "windup") {
      if (e.root > 0 && !d.boss) { e.state = "move"; }
      else if (e.st >= (e.wind || d.windup) * (e.boss && e.boss.phase > 1 ? 0.75 : 1)) { e.state = "strike"; e.st = 0; strike(e); }
    } else if (e.state === "strike") {
      strikeTick(e, dt);
      if (e.st >= (e.strikeDur || 0.18)) { e.state = "recover"; e.st = 0; }
    } else if (e.state === "recover") {
      if (e.st >= 0.35) { e.state = "move"; e.st = 0; e.cd = d.cd * rnd(0.85, 1.2); }
    } else if (target && e.root <= 0) {
      // decide
      if (d.ai !== "boss" && !(e.kbT > 0)) e.dir = Math.sign(dx) || e.dir;
      if (d.ai === "walker" || d.ai === "shield") {
        if (adx < d.reach && Math.abs(dy) < 70 && e.cd <= 0) begin(e);
        else if (adx > d.reach * 0.7) want = Math.sign(dx);
      } else if (d.ai === "leaper") {
        if (adx < d.reach && adx > 70 && Math.abs(dy) < 90 && e.cd <= 0 && e.onGround) begin(e);
        else if (adx > 120) want = Math.sign(dx); else if (e.cd > 0) want = -Math.sign(dx) * 0.5;
      } else if (d.ai === "archer" || d.ai === "caster") {
        if (adx < d.keep * 0.6) want = -Math.sign(dx); else if (adx > d.keep * 1.2) want = Math.sign(dx);
        if (d.ai === "caster" && adx < 130 && e.cd < d.cd - 0.8 && !e.blinkCd) blink(e);
        if (adx < d.reach && canSee(e, p) && e.cd <= 0) begin(e);
        if (e.hitWall && want) want = 0;
      } else if (d.ai === "boss") want = DS.Boss.think(e, dx, adx, dy);
      // climb: jump toward a knight standing above
      if ((d.ai === "walker" || d.ai === "leaper" || d.ai === "shield") && e.onGround && e.jumpCd <= 0 && dy < -50 && adx < (d.jumpy ? 220 : 170)) {
        const up = Math.min(-dy + 34, 170);
        e.vy = -Math.sqrt(2 * P.gravity * up); e.jumpCd = d.jumpy ? 0.8 : 1.6; e.dropT = 0;
        e.vx = Math.sign(dx) * d.speed;
      }
      if (e.onGround && e.hitWall && want && e.jumpCd <= 0) { e.vy = -620; e.jumpCd = 1; }
      // drop down through a platform toward a knight below
      if (e.onPlat && dy > 60 && adx < 120) { e.dropT = 0.3; e.y += 2; }
    }
    e.blinkCd = Math.max(0, (e.blinkCd || 0) - dt);
    // movement
    const spd = d.speed * slow;
    if (!busy && !(e.kbT > 0) && e.state !== "strike") {
      const tv = e.root > 0 ? 0 : want * spd;
      if (e.onGround) e.vx += clamp(tv - e.vx, -1400 * dt, 1400 * dt);
      else if (want) e.vx += clamp(tv - e.vx, -500 * dt, 500 * dt);
    }
    if (busy || e.root > 0) e.vx *= 0.8;
    if (e.state === "windup" || e.state === "recover" || e.state === "hurt") e.vx *= e.onGround ? 0.85 : 1;
    if (d.ai === "boss") DS.Boss.frame(e, dt); // a boss's every-frame steering (the fliers hold their height)
    if (!e.fly) e.vy = Math.min(P.maxFall, e.vy + P.gravity * dt);
    e.dropT = Math.max(0, (e.dropT || 0) - dt);
    const air = !e.onGround, fallV = e.vy;
    Wd.move(e, dt, DS.Kits.walls().concat(DS.Fam.walls()));
    if (air && e.onGround && fallV > 250) e.landT = 0.14; // the landing crouch
    e.x = clamp(e.x, 40 + e.w / 2, Wd.W - 40 - e.w / 2);
    if (e.leaping && e.onGround && e.st > 0.1) e.leaping = false;
    e.runT += Math.abs(e.vx) * dt;
  }

  function begin(e) { e.state = "windup"; e.st = 0; e.vx *= 0.3; }

  function blink(e) {
    const p = G.player;
    const nx = clamp(e.x + Math.sign(e.x - p.x || 1) * 280, 120, Wd.W - 120);
    G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.4 });
    e.x = nx; e.y = Wd.surfaceBelow(nx, e.y - 200); e.vy = 0; e.blinkCd = 3;
    G.fx.push({ kind: "portal", x: e.x, y: e.y, t: 0, life: 0.4 });
  }

  // the moment an attack lands
  function strike(e) {
    const d = e.d, p = G.player;
    e.hitDone = false; e.famHit = false; e.strikeDur = 0.18;
    if (d.ai === "walker" || d.ai === "shield") {
      if (d.lunge) e.vx = e.dir * d.lunge;
      if (d.ai === "shield") { shake(4); groundWave(e, e.x + e.dir * 50, e.dir, 0, 260, 0.35, d.dmg * 0.6); }
    } else if (d.ai === "leaper") {
      e.vx = e.dir * d.leap[0]; e.vy = d.leap[1]; e.leaping = true; e.onGround = false; e.strikeDur = 0.7;
    } else if (d.ai === "archer") {
      const sx = e.x + e.dir * 24, sy = e.y - e.h * 0.62;
      const tx = p.x, ty = p.y - p.h * 0.5, dist = Math.abs(tx - sx), tt = dist / d.shot, g = 500;
      const vy = (ty - sy) / tt - 0.5 * g * tt;
      G.shots.push({ team: "f", kind: "arrow", x: sx, y: sy, vx: e.dir * d.shot, vy: clamp(vy, -500, 500), g, r: 8, dmg: d.dmg, life: 2, src: e, by: d.name });
    } else if (d.ai === "caster") {
      G.shots.push({ team: "f", kind: "orb", x: e.x + e.dir * 26, y: e.y - e.h * 0.75, vx: e.dir * d.orb, vy: -60, r: 12, dmg: d.dmg, life: 4.5, homing: 2.4, speed: d.orb, src: e, by: d.name });
    } else if (d.ai === "boss") DS.Boss.strike(e);
  }
  function strikeTick(e, dt) {
    const d = e.d, p = G.player;
    if (d.ai === "walker" || d.ai === "shield") {
      if (!e.hitDone && e.st < 0.14) {
        const x0 = e.dir > 0 ? e.x : e.x - d.reach - 10, x1 = e.dir > 0 ? e.x + d.reach + 10 : e.x;
        if (e.lure && !e.lure.gone) { const w = e.lure; if (w.x + w.w / 2 > x0 && w.x - w.w / 2 < x1) { e.hitDone = true; DS.Fam.hitWall(w, e); } }
        else if (boxHitsPlayer(x0, e.y - e.h, x1, e.y)) { e.hitDone = true; hurtPlayer(d.dmg, e, d.name); }
        if (!e.famHit) { e.famHit = true; DS.Fam.struck(x0, e.y - e.h, x1, e.y, d.dmg); }
      }
    } else if (d.ai === "leaper") {
      if (!e.hitDone && boxHitsPlayer(e.x - e.w * 0.7, e.y - e.h, e.x + e.w * 0.7, e.y)) { e.hitDone = true; hurtPlayer(d.dmg, e, d.name); }
      if (!e.famHit && DS.Fam.struck(e.x - e.w * 0.7, e.y - e.h, e.x + e.w * 0.7, e.y, d.dmg)) e.famHit = true;
      if (e.onGround && e.st > 0.15) e.st = 1;
    } else if (d.ai === "boss") DS.Boss.tick(e, dt);
  }
  function boxHitsPlayer(x0, y0, x1, y1) {
    const p = G.player;
    return !p.dead && p.x + p.w / 2 > x0 && p.x - p.w / 2 < x1 && p.y > y0 && p.y - p.h < y1;
  }
  DS.boxHitsPlayer = boxHitsPlayer;

  // a shockwave running along the ground (boss slams, the Bulwark's stomp)
  function groundWave(e, x, dir, delay, speed, life, dmg, opt) {
    const s = Object.assign({ team: "f", kind: "wave", x, y: e.y - 14, vx: dir * speed, vy: 0, r: 16, h: 30, dmg: Math.round(dmg), life, delay, src: e, by: e.d.name, ground: e.y }, opt);
    G.shots.push(s); return s;
  }
  DS.groundWave = groundWave;

  // ---------------- projectiles ----------------
  function updateShots(dt) {
    const p = G.player;
    for (const s of G.shots) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t = (s.t || 0) + dt; s.life -= dt;
      if (s.update) s.update(s, dt);
      if (s.homing && s.team === "f" && !p.dead) {
        const a = Math.atan2(p.y - p.h * 0.5 - s.y, p.x - s.x), cur = Math.atan2(s.vy, s.vx);
        let da = a - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const na = cur + clamp(da, -s.homing * dt, s.homing * dt);
        s.vx = Math.cos(na) * s.speed; s.vy = Math.sin(na) * s.speed;
      }
      if (s.g) s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.kind === "wave") { if (Wd.solidAt(s.x, s.ground - 5) || !Wd.groundAt(s.x, s.ground)) s.life = 0; }
      else if (!s.ghost && (Wd.solidAt(s.x, s.y) || s.land && s.vy > 0 && Wd.groundAt(s.x, Math.round(s.y)))) { if (s.onEnd) s.onEnd(s, "wall"); s.life = 0; s.ended = true; }
      if (s.life <= 0) { if (!s.ended && s.onEnd) s.onEnd(s, "time"); s.ended = true; continue; }
      if (s.team === "f") {
        const h = s.h || s.r * 2;
        if (DS.Fam.blocks(s)) { s.life = 0; continue; } // Derek's walls stop their shots
        if (boxHitsPlayer(s.x - s.r, s.y - h / 2, s.x + s.r, s.y + h / 2)) {
          // the Cinderbrand's guard eats shots from the front
          if (p.guard && Math.sign(s.vx) === -p.dir && s.kind !== "wave") { hurtPlayer(s.dmg, null, s.by, s.x); s.life = 0; continue; }
          if (hurtPlayer(s.dmg, s.kind === "wave" ? s.src : null, s.by, s.x - s.vx * 0.05) && s.kind !== "wave" && !s.stay) s.life = 0; // s.stay: lava pools stay
        }
      } else {
        for (const e of G.foes) {
          if (e.dead || e.spawnT > 0 || s.hit.has(e)) continue;
          if (s.x + s.r > e.x - e.w / 2 && s.x - s.r < e.x + e.w / 2 && s.y + s.r > e.y - e.h && s.y - s.r < e.y) {
            s.hit.add(e);
            if (s.onHit) s.onHit(s, e); else hitFoe(e, { dmg: s.dmg, kb: s.kb || 80, dir: Math.sign(s.vx) || 1 });
            if (s.pierce != null) { s.pierce--; if (s.pierce < 0) { if (s.onEnd) s.onEnd(s, "foe", e); s.life = 0; s.ended = true; break; } }
          }
        }
        // the dragon tears arrows from the air
        if (s.eats) for (const o of G.shots) if (o.team === "f" && o.kind !== "wave" && Math.abs(o.x - s.x) < s.r + 10 && Math.abs(o.y - s.y) < s.r + 10) { o.life = 0; spark(o.x, o.y, "#ff8080", 5); }
      }
    }
    G.shots = G.shots.filter((s) => s.life > 0);
  }

  // ---------------- effects ----------------
  function text(x, y, txt, color, size) { G.texts.push({ x, y, txt, color, size: size || 14, t: 0, vy: -70 }); }
  function spark(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(120, 380); G.fx.push({ kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.12, 0.3), c: color }); } }
  function puff(x, y, n, c) { for (let i = 0; i < n; i++) G.fx.push({ kind: "dust", x: x + rnd(-12, 12), y: y - 2, vx: rnd(-80, 80), vy: rnd(-60, -10), t: 0, life: rnd(0.3, 0.5), c, r: rnd(3, 6) }); }
  function ring(x, y, c) { G.fx.push({ kind: "ring", x, y, t: 0, life: 0.3, c }); }
  function shake(a) { G.cam.shake = Math.max(G.cam.shake, a); }
  DS.fx = { text, spark, puff, ring, shake };

  function updateFx(dt) {
    for (const f of G.fx) {
      f.t += dt;
      if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === "spark") { f.vx *= 0.9; f.vy *= 0.9; } if (f.kind === "mote") f.vy += 30 * dt; }
    }
    G.fx = G.fx.filter((f) => f.t < f.life);
    for (const t of G.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= 0.94; }
    G.texts = G.texts.filter((t) => t.t < 0.9);
  }

  // ---------------- waves ----------------
  function updateWaves(dt) {
    const alive = G.foes.some((f) => !f.dead && !f.d.dummy);
    if (!G.waves || alive) return;
    G.waveT -= dt;
    if (G.waveT > 0) return;
    const list = DS.WAVES[G.wave % DS.WAVES.length], extra = Math.floor(G.wave / DS.WAVES.length);
    G.wave++;
    const all = list.slice();
    for (let i = 0; i < extra; i++) all.push(...list.filter((t) => t !== "champion"));
    all.forEach((type, i) => setTimeout(() => { if (G.mode === "play" || G.mode === "pause") spawnFoe(type); }, i * 380));
    G.banner = { txt: DS.WAVES[(G.wave - 1) % DS.WAVES.length][0] === "champion" ? "Wave " + G.wave + ": the Drowned Sovereign" : "Wave " + G.wave, t: 0 };
    G.waveT = 3;
  }

  // ---------------- the scrolling level ----------------
  // A level is generated as you go: in landscape it ends in the Sovereign's clearing; in portrait (the knight fights
  // on its own, Robert 2026-11-18) it runs on forever until the phone is turned sideways.
  function loadLevel(n) {
    G.level = n; G.tok++; DS.Loot.clear();
    if (!G.auto && !G.wall) DS.Maps.reached(n); // opens maps on the map select
    G.checkpoint = 300; G.clearT = 0; G.famReward = 0;
    G.foes = G.foes.filter((f) => f.d.dummy); G.shots = []; G.zones = [];
    if (G.auto) { Wd.begin(n, 1000 + n * 7919); G.enc = Wd.extend(3600); G.bossX = 0; G.endless = true; }
    else { const lv = Wd.level(n, 1000 + n * 7919); G.enc = lv.enc; G.bossX = lv.bossX; G.endless = false; }
    if (G.endless) DS.Explore.startScenic(n); else DS.Explore.build(n, G.bossX); // mist, traps and pickups (looks only in the endless run)
    G.banner = { txt: G.auto ? "Level " + (n + 1) + ": auto-fight" : "Level " + (n + 1), t: 0 };
  }
  // portrait <-> landscape in the middle of a level
  function setAuto(on) {
    if (G.auto === on) return;
    G.auto = on; document.body.classList.toggle("auto", on);
    if (!G.scroll || !G.player || G.mode === "title") return;
    const bossEnc = G.enc.find((e) => e.boss);
    if (on && bossEnc && !bossEnc.on) { // back to endless: take the clearing away
      G.enc.splice(G.enc.indexOf(bossEnc), 1); Wd.unfinish(); G.endless = true; G.bossX = 0;
      G.banner = { txt: "Auto-fight", t: 0 };
    } else if (!on && G.endless) { // the knight is yours: two more stretches, then the Sovereign
      G.enc.push(...Wd.extend(G.player.x + 2400));
      const b = Wd.finish(DS.bossFor(G.level)); G.enc.push(b); G.bossX = b.bossX; G.endless = false;
      G.banner = { txt: "You have the knight: reach " + (DS.ENEMIES[b.foes[0]].title || "the boss"), t: 0 };
    }
  }
  function updateScroll(dt) {
    const p = G.player, tok = G.tok;
    if (G.endless) {
      G.enc.push(...Wd.extend(p.x + 3600));
      DS.Explore.extendScenic(p.x + 3000);
      if ((G.autoT += dt) > 2) { // tidy up far behind
        G.autoT = 0; const cut = Math.min(p.x, G.checkpoint) - 2500;
        Wd.prune(cut); DS.Explore.prune(cut); G.enc = G.enc.filter((e) => e.x > cut - 1200);
        G.foes = G.foes.filter((f) => f.d.dummy || f.x > cut);
      }
    }
    for (const e of G.enc) {
      if (e.on || p.x < e.x - 150) continue;
      e.on = true; G.checkpoint = Math.max(G.checkpoint, e.x - 250);
      e.foes.forEach((type, i) => setTimeout(() => {
        if (G.tok !== tok || !(G.mode === "play" || G.mode === "menu")) return;
        const x = clamp(e.at[i], 100, Wd.W - 100);
        const f = spawnFoe(type, x, Wd.surfaceBelow(x, -2000)); f.enc = e;
      }, e.boss ? 700 : i * 260));
      if (e.boss) G.banner = { txt: DS.ENEMIES[e.foes[0]].title || DS.ENEMIES[e.foes[0]].name, t: 0 };
    }
    // the level is done once the Sovereign falls: the Drowned still standing crumble with him. (The old check needed his
    // body still lying there AND no Drowned alive anywhere, so one leftover foe stopped the level for good once the body
    // was cleared away: a friend of Robert's beat level 1 and stayed there, 2026-11-19.)
    const bossEnc = G.enc.find((e) => e.boss);
    if (bossEnc && bossEnc.won && !G.clearT) {
      for (const f of G.foes) if (!f.dead && !f.d.dummy) kill(f);
      G.clearT = 3.5; G.banner = { txt: "Level " + (G.level + 1) + " cleared", t: 0 };
      DS.Loot.onClear(G.level);
      if (!G.wall && DS.Fam.rewardLevel(G.level)) G.famReward = 1.6; // a familiar to choose, once the dust settles
    }
    if (G.famReward > 0 && (G.famReward -= dt) <= 0) { G.famReward = 0; DS.UI.open("famWin"); return; }
    if (G.clearT > 0) {
      G.clearT -= dt;
      if (G.clearT <= 0) { loadLevel(G.level + 1); const pl = G.player; pl.x = G.checkpoint; pl.y = Wd.FLOOR - 200; pl.vx = pl.vy = 0; G.cam.x = pl.x - DS.Render.vw / 2; }
    }
  }
  function setScroll(on) {
    G.scroll = on; G.waves = !on;
    if (on) loadLevel(DS.START_LEVEL || 0); else { DS.Explore.clear(); Wd.arena(); G.enc = []; G.tok++; G.endless = false; G.foes = G.foes.filter((f) => f.d.dummy); G.wave = 0; G.waveT = 2; }
  }

  // ---------------- the knight fighting on its own (portrait) ----------------
  // Writes into the input state as if a player pressed things: walk right, hop obstacles, fight what is near.
  function autopilot(dt) {
    const p = G.player, k = p.k, a = { x: 0, y: 0, jump: false, attack: false, dash: false, ability: false };
    if (p.dead) return press(a);
    let tgt = null, bd = 1e9;
    for (const e of G.foes) {
      if (e.dead || e.d.dummy || e.spawnT > 0) continue;
      const d = Math.abs(e.x - p.x) + Math.max(0, Math.abs(e.y - p.y) - 60) * 2;
      if (d < bd) { bd = d; tgt = e; }
    }
    // No kill for a while (shots into a wall, chipping at a shield, foes stuck on other ground): stop standing there.
    // After 4 s close in to melee range, dropping off or climbing to them; after 10 s leave them behind and run on.
    if (!tgt || bd >= 900) G.autoKillT = G.t;
    const idle = G.t - (G.autoKillT || 0), push = idle > 4, giveUp = idle > 10;
    if (idle > 13) G.autoKillT = G.t - 4; // after 3 s of running on, fight again (still pushing)
    const ranged = k.attack.range > 300 && !push;
    const reach = ranged ? 360 : push ? 60 : (k.attack.range || 70) + 6;
    let move = 1;
    if (tgt && bd < 900 && !giveUp) {
      const dx = tgt.x - p.x, adx = Math.abs(dx), s = Math.sign(dx) || 1;
      move = adx > reach * 0.85 ? s : (p.dir !== s ? s * 0.5 : 0);
      // (archers used to back away from foes closer than 120 px, which turned them round to fire at nothing
      // for as long as a foe followed them: now they face the foe and shoot, whatever the distance)
      if (push && Math.abs(tgt.y - p.y) > 40 && adx < 140) move = s; // keep walking at a foe above or below
      if (adx < reach + 10 && Math.abs(tgt.y - p.y) < 90) {
        if (p.dir === s) a.attack = Math.random() < 0.5; // only ever fire at the foe, never with its back to it
        if (p.abilCd <= 0 && Math.random() < 0.04) a.ability = true;
      }
      // A foe above (an archer on a platform): ranged knights shoot up at it when the up-shot's slope fits,
      // otherwise climb: jump, double-jump near the top, up-swing once close. One-way platforms let them through.
      const dy = p.y - tgt.y;
      if (dy > 70 && adx < 320) {
        const upShot = ranged && Math.abs(0.62 * adx - dy) < 60 && adx < k.attack.range;
        if (upShot) { move = p.dir !== s ? s * 0.5 : 0; a.y = -1; if (p.dir === s) a.attack = Math.random() < 0.5; }
        else {
          move = adx > 24 ? s : 0;
          if (p.onGround) a.jump = true;
          else if (p.airJumps > 0 && p.vy > -120 && p.y - 40 > tgt.y) a.jump = true;
          if (adx < 110 && dy < 190) { a.y = -1; a.attack = Math.random() < 0.5; }
        }
      }
      if (tgt.state === "windup" && adx < 140 && p.dashCd <= 0 && Math.random() < 0.08) { a.dash = true; move = -s; }
    }
    // hop stones in the way, and the far side of a gap
    const ahead = p.x + Math.sign(move || p.dir) * (p.w / 2 + 14);
    if (move && (p.hitWall || Wd.solidAt(ahead, p.y - 8)) && (p.onGround || p.vy > 0)) a.jump = true;
    a.hold = !p.onGround && p.vy < 0; // hold jump while rising, or the short-hop cut halves every auto jump
    a.x = move; press(a);
  }
  function press(a) {
    I.x = a.x; I.y = a.y;
    for (const n of ["jump", "attack", "dash", "ability"]) { I.p[n] = a[n]; I.h[n] = a[n]; I.r[n] = false; }
    if (a.hold) I.h.jump = true;
    I.h.up = I.h.down = false;
  }
  Object.assign(DS, { loadLevel, setScroll, setAuto });

  // ---------------- wallpaper ----------------
  // ?wallpaper (for wallpaper apps) or the pause-menu button: no HUD or buttons, the knight fights on forever
  // through the endless level, and a different knight takes over every WALL_SWAP seconds and after each fall.
  const WALL_SWAP = 75;
  // a shuffled bag: every knight takes a turn before any comes round again, and never the same one twice running
  let bag = [];
  function nextWallKnight() {
    if (!bag.length) {
      bag = DS.KIT_ORDER.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag[bag.length - 1] === G.kit) bag.unshift(bag.pop());
    }
    const id = bag.pop();
    DS.switchKit(id); G.wallT = 0;
    // each knight brings a familiar along (or none, now and then); it grows as the knight fights on
    const fams = DS.FAM_ORDER.concat([null]), fam = fams[Math.floor(Math.random() * fams.length)];
    DS.Fam.set(fam, true);
    G.banner = { txt: DS.KITS[id].name, t: 0 };
  }
  function setWall(on) {
    G.wall = on; G.wallT = 0; document.body.classList.toggle("wall", on);
    if (on) { G.scroll = true; bag = []; G.kit = null; nextWallKnight(); G.auto = true; restart(); }
    else { DS.Loot.flush(); setAuto(innerHeight > innerWidth); DS.Fam.set(DS.Fam.picked()); } // hand over what it gathered
  }
  Object.assign(DS, { setWall });

  // ---------------- main loop ----------------
  function step(dt) {
    I.poll();
    setAuto(G.wall || innerHeight > innerWidth); // portrait (or wallpaper): the knight fights on its own
    DS.UI.update(dt);
    if (G.mode !== "play") return;
    if (I.p.pause) { const wasWall = G.wall && !G.wallLocked; if (wasWall) setWall(false); DS.UI.open("pause"); if (wasWall) DS.UI.showHaul("pause"); return; }
    if (G.wall && (G.wallT += dt) > WALL_SWAP) nextWallKnight();
    if (I.p.kit) { DS.UI.cycleKit(1); }
    if (G.auto && G.scroll) autopilot(dt);
    G.t += dt;
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    G.redT = Math.max(0, (G.redT || 0) - dt);
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 2.2) G.banner = null; }
    if (G.hitstop > 0) { G.hitstop -= dt; updateFx(dt * 0.3); return; }
    const p = G.player;
    updatePlayer(p, dt);
    DS.Fam.update(dt);
    for (const e of G.foes) updateFoe(e, dt);
    G.foes = G.foes.filter((e) => !e.dead || e.deadT < 1.4);
    if (G.scroll) DS.Explore.update(dt);
    DS.Loot.update(dt);
    updateShots(dt);
    DS.Kits.updateZones(dt);
    updateFx(dt);
    if (G.scroll) updateScroll(dt); else updateWaves(dt);
    G.dummyLog = G.dummyLog.filter((l) => G.t - l[0] < 5);
    // camera
    const c = G.cam, vw = DS.Render.vw, vh = DS.Render.vh;
    const lead = G.wall ? 0.4 : 1, tx = p.x - vw / 2 + (p.dir * 70 + p.vx * 0.12) * lead, ty = p.y - vh * 0.62;
    c.x += (tx - c.x) * Math.min(1, dt * 6); c.y += (ty - c.y) * Math.min(1, dt * 5);
    c.x = clamp(c.x, 0, Wd.W - vw); // a tall wallpaper keeps the knight above a phone's dock: more mud shows below
    const below = G.wall && vh > vw ? vh * 0.22 : 0;
    c.y = clamp(c.y, Wd.FLOOR + 80 - vh - 500, Wd.FLOOR + 80 + below - vh);
    if (vw > Wd.W) c.x = (Wd.W - vw) / 2;
    c.shake = Math.max(0, c.shake - dt * 30);
  }

  function start(kitId) {
    G.kit = kitId;
    G.player = newPlayer(kitId);
    G.cam.x = G.player.x - DS.Render.vw / 2;
    G.cam.y = Wd.FLOOR + 80 - DS.Render.vh;
    G.mode = "play";
    try { localStorage.setItem("dl-side-kit", kitId); } catch (e) { /* storage blocked */ }
    if (!G.wall) DS.Fam.set(DS.Fam.picked());
  }
  function restart() {
    DS.Explore.reset();
    G.foes = []; G.shots = []; G.zones = []; G.fx = []; G.texts = []; G.wave = 0; G.waveT = 2; G.kills = 0; G.combo = 0; G.best = 0;
    if (G.scroll) loadLevel(DS.START_LEVEL || 0); else { Wd.arena(); G.tok++; }
    start(G.kit);
  }
  function switchKit(kitId) {
    const old = G.player;
    G.kit = kitId;
    G.player = newPlayer(kitId);
    if (old) { G.player.x = old.x; G.player.y = old.y; G.player.dir = old.dir; }
    try { localStorage.setItem("dl-side-kit", kitId); } catch (e) { /* storage blocked */ }
  }
  Object.assign(DS, { start, restart, switchKit });

  let last = 0;
  function frame(now) {
    if (G.wall && now - last < 30) { requestAnimationFrame(frame); return; } // ~30 fps as a wallpaper
    const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    DS.Render.draw();
    requestAnimationFrame(frame);
  }
  DS.boot = function () {
    DS.Render.init(document.getElementById("game"));
    DS.UI.init();
    for (const id of DS.KIT_ORDER) DS.Sprites.loadSet(DS.KITS[id].sprite);
    for (const id of DS.ENEMY_ORDER) DS.Sprites.loadSet(DS.ENEMIES[id].sprite);
    DS.Sprites.loadSet(DS.KING_BODY);
    DS.Fam.load();
    if (/[?&]wallpaper/.test(location.search) || /wallpaper\.html$/.test(location.pathname)) { G.wallLocked = true; DS.UI.close(); DS.Maps.wallStart(); setWall(true); }
    requestAnimationFrame(frame);
  };
  DS.step = step; // for tests
})(window.DS = window.DS || {});
