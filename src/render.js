/* Drawing: backdrop, arena, the Drowned, the knight, shots, zones, effects and the HUD. */
"use strict";
(function (DS) {
  const G = DS.G, S = DS.Sprites, Wd = DS.World;
  const R = DS.Render = { vw: 900, vh: 470 };
  // The scene is drawn on a low-res canvas (1 px = 2 world units) and blown up with no smoothing, so terrain, sprites
  // and effects share one pixel grid. Numbers and the HUD go on the full-res canvas on top.
  let cv, ctx, main, lo, lctx, k = 1, LW = 1, LH = 1;

  R.init = function (canvas) {
    cv = canvas; main = ctx = cv.getContext("2d");
    lo = document.createElement("canvas"); lctx = lo.getContext("2d");
    addEventListener("resize", resize); resize();
  };
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight, aspect = w / h;
    let vh = 470;
    if (vh * aspect < 640) vh = Math.min(760, 640 / aspect);
    R.vh = vh; R.vw = vh * aspect;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    k = cv.width / R.vw;
    LW = Math.ceil(R.vw / 2) + 1; LH = Math.ceil(vh / 2) + 1;
    lo.width = LW; lo.height = LH;
  }

  const TAU = Math.PI * 2;
  const pct = (a, b) => Math.max(0, Math.min(1, a / b));

  R.draw = function () {
    const vw = R.vw, vh = R.vh, c = G.cam;
    const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
    const cam = { x: Math.round((c.x + sx) / 2) * 2, y: Math.round((c.y + sy) / 2) * 2 };
    // the pixel pass
    ctx = lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    Wd.drawBackdrop(ctx, cam, LW, LH, G.t);
    Wd.drawWorld(ctx, cam, LW, LH);
    ctx.setTransform(0.5, 0, 0, 0.5, -cam.x / 2, -cam.y / 2);
    if (G.player) {
      for (const z of G.zones) drawZone(z, true);
      DS.Explore.drawWorld(ctx);
      DS.Loot.draw(ctx); // dropped currencies
      DS.Fam.draw(ctx, false); // walking familiars, Derek's walls, Fred's glowcaps
      for (const e of G.foes) drawFoe(e);
      DS.Fam.drawAura(ctx, G.player);
      drawPlayer(G.player);
      DS.Fam.draw(ctx, true);  // Abigail and David fly in front
      for (const z of G.zones) drawZone(z, false);
      for (const s of G.shots) drawShot(s);
      for (const f of G.fx) drawFx(f);
      if (G.boxes) drawBoxes();
      DS.Explore.drawMist(ctx, cam, LW, LH);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // blow it up
    ctx = main;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lo, 0, 0, LW, LH, 0, 0, LW * 2 * k, LH * 2 * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (G.player) {
      ctx.save(); ctx.translate(-cam.x, -cam.y);
      for (const t of G.texts) {
        ctx.globalAlpha = 1 - pct(t.t - 0.5, 0.4);
        ctx.font = `700 ${t.size + 2}px "Pixelify Sans", monospace`; ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,6,8,0.9)"; ctx.strokeText(t.txt, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // vignette and the red flash when hurt
    const v = ctx.createRadialGradient(vw / 2, vh * 0.55, Math.min(vw, vh) * 0.35, vw / 2, vh * 0.55, Math.max(vw, vh) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,4,8,0.45)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, vw, vh);
    if (G.redT > 0) { ctx.fillStyle = `rgba(160,20,20,${G.redT * 0.6})`; ctx.fillRect(0, 0, vw, vh); }
    if (G.player && G.mode !== "title") { if (G.wall) wallBanner(); else hud(); }
  };

  // ---------------- the knight ----------------
  const FLIP = 0.32; // keep in step with game.js
  function playerFrame(p) {
    const set = DS.spriteOf(p);
    const f = (anim, prog) => S.frame(set, anim, prog);
    if (p.dead) return [f("death", 0), 0];
    if (p.guard) { const h = p.heat / p.k.heat.max; return [f("guard", h >= 1 ? 0.99 : h >= 0.5 ? 0.5 : 0), 0]; }
    if (p.lunge) return [f(p.lunge.kind === "rush" ? "dash" : "cast", 0), 0];
    if (p.charge >= 0) return [f(set.charge ? "charge" : "cast", 0), 0];
    if (p.cast) return [f(p.cast.anim, p.cast.frameP != null ? p.cast.frameP : p.cast.t / p.cast.dur), 0];
    if (p.dashT > 0) return [f("dash", 0), 0];
    if (p.plunge) return set.plunge ? [f("plunge", 0), 0] : [f("attack", 0.99), 0.35];
    if (p.atk) {
      if (p.atk.up && set.upAtk) return [f("upAtk", Math.min(0.99, p.atk.t / (p.atk.dur * 0.45))), 0]; // wind-up, then the swing
      if (p.atk.down && set.plunge) return [f("plunge", 0), 0]; // a shot straight down
      if (!p.onGround && set.airAtk) return [f("airAtk", 0), 0];
      return [f("attack", p.atk.t / p.atk.dur), 0];
    }
    if (p.hurtT > 0.1) return [f("hurt", 0), 0];
    if (!p.onGround && set.rise) {
      if (p.flipT > 0 && set.flip) return [f("flip", 0), (1 - p.flipT / FLIP) * TAU, -p.h * 0.4]; // spun round its middle // the double jump somersault
      return [f(p.vy < -220 ? "rise" : p.vy < 200 ? "apex" : "fall", 0), 0];
    }
    if (!p.onGround) return [f(p.vy < 0 ? "jump" : "fall", 0), p.vy < 0 ? -0.06 : 0.05];
    if (p.landT > 0 && set.land) return [f("land", 0), 0];
    if (Math.abs(p.vx) > 25) { const n = set.run.length, stride = n > 4 ? 11 : 20; return [f("run", ((p.runT / stride) % n) / n), 0]; }
    const n = set.idle.length;
    return [f("idle", n > 1 ? ((G.t * 7) % n) / n : 0), 0];
  }

  function drawPlayer(p) {
    const [rec, rot, lift = 0] = playerFrame(p);
    const kc = p.k.color;
    // kit glows: stance, heat, tithe
    let glow = 0;
    if (p.k.stance && p.stillT >= p.k.stance.after) glow = 0.5;
    if (p.k.heat) glow = p.heat / p.k.heat.max;
    if (p.k.tithe) glow = Math.min(1, p.stacks / 30);
    if (p.charge >= 0) glow = Math.min(1, p.charge / p.k.ability.charge);
    if (glow > 0.05) {
      const g = ctx.createRadialGradient(p.x, p.y - p.h / 2, 4, p.x, p.y - p.h / 2, 70);
      g.addColorStop(0, `rgba(${kc},${0.35 * glow})`); g.addColorStop(1, `rgba(${kc},0)`);
      ctx.fillStyle = g; ctx.fillRect(p.x - 70, p.y - p.h / 2 - 70, 140, 140);
    }
    // shadow
    const gy = Wd.surfaceBelow(p.x, p.y - 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(p.x, gy, 18 * Math.max(0.4, 1 - (gy - p.y) / 300), 4, 0, 0, TAU); ctx.fill();
    let dir = p.dir;
    if (p.waltz) dir = Math.floor(p.waltz.t / 0.09) % 2 ? -p.dir : p.dir;
    const blink = p.inv > 0 && p.hurtT <= 0 && !p.dashT && Math.floor(G.t * 20) % 2 === 0 && p.inv < 0.65;
    const alpha = p.dead ? Math.max(0, 1 - (p.dead - 1.2)) : blink ? 0.45 : 1;
    const tint = p.hurtT > 0.2 ? ["#ff5050", 0.5] : p.lunge && p.lunge.kind === "brand" ? ["#ff9040", 0.25] : null;
    if (!S.draw(ctx, rec, p.x, p.y + 1 + lift, dir, 1, tint, alpha, rot)) {
      ctx.fillStyle = `rgb(${kc})`; ctx.fillRect(p.x - p.w / 2, p.y - p.h, p.w, p.h);
    }
    if (p.waltz) {
      const ab = p.k.ability, fr = 1 + (Math.floor(p.waltz.t * 16) % 4), s = (ab.r * 2.2) / 342;
      S.drawFx(ctx, "roseWaltz" + fr, p.x, p.y - p.h * 0.45, { scale: s, sy: 0.55, alpha: 0.9 });
    }
    if (p.k.tithe && p.stacks >= 20) S.drawFx(ctx, "haloLitS", p.x + p.dir * 2, p.y - p.h - 6, { scale: 1, alpha: 0.9 });
    if (p.charge >= 0 && p.charge >= p.k.ability.charge) { ctx.strokeStyle = "rgba(120,255,190,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - p.h / 2, 30 + Math.sin(G.t * 30) * 3, 0, TAU); ctx.stroke(); }
  }

  // ---------------- the Drowned ----------------
  function drawFoe(e) {
    if (e.d.dummy) return drawDummy(e);
    const set = e.d.sprite, f = (a, p) => S.frame(set, a, p);
    let rec, rot = 0;
    const has = (a) => set[a] && set[a].length;
    if (e.dead) rec = f("death", 0);
    else if (e.state === "hurt") rec = f(has("knock") && (!e.onGround || e.kbT > 0 || !has("flinch")) ? "knock" : has("flinch") ? "flinch" : "hurt", 0);
    else if (e.blockT > 0 && has("block") && e.state !== "windup" && e.state !== "strike") rec = f("block", 0);
    else if (e.d.boss && has("charge") && e.state !== "hurt" && (e.state === "windup" || e.state === "strike" || e.state === "recover")) {
      // the Sovereign: slam (mace overhead, then smashed down), charge (crouch, rush, skid), leap (crouch, mace up in the air, smash on landing)
      const m = e.move;
      const leapAir = e.vy < -280 ? "leapRise" : e.vy < 200 ? "leapApex" : "leapDive";
      if (e.state === "windup") rec = f(m === "slam" ? "windup" : m === "leap" ? "leapCrouch" : "chargeWind", 0);
      else if (e.state === "strike") rec = f(m === "charge" ? "charge" : m === "leap" ? (e.onGround ? (e.st > 0.2 ? "leapLand" : "leapCrouch") : leapAir) : "strike", 0);
      else rec = f(m === "charge" ? "skid" : m === "leap" ? "leapLand" : "recover", 0);
    }
    else if (e.state === "windup") rec = has("aimUp") && G.player.y < e.y - 70 ? f("aimUp", 0) : has("windup") ? f("windup", 0) : f("attack", 0);
    else if (e.state === "strike") rec = e.leaping && !e.onGround && has("pounce") ? f("pounce", 0) : has("strike") ? f("strike", 0) : f("attack", 0.5);
    else if (e.state === "recover") rec = has("recover") ? f("recover", 0) : f("attack", 0.9);
    else if (!e.onGround) rec = f(e.vy < 0 ? "jump" : "fall", 0);
    else if (e.landT > 0 && has("land")) rec = f("land", 0);
    else if (Math.abs(e.vx) > 15) rec = f("run", ((e.runT / 22) % 4) / 4);
    else rec = f("idle", 0);
    let alpha = 1;
    if (e.spawnT > 0) alpha = 1 - e.spawnT / 0.5;
    if (e.dead) alpha = Math.max(0, 1 - (e.deadT - 0.7) / 0.7);
    let tint = null;
    if (e.flash > 0) tint = ["#ffffff", 0.85];
    else if (e.freeze > 0) tint = ["#a8e4ff", 0.55];
    else if (e.state === "windup") tint = ["#ff3030", 0.25 + 0.25 * Math.sin(G.t * 40)];
    else if (e.root > 0) tint = ["#a060ff", 0.3];
    else if (e.chill > 0) tint = ["#80c8ff", 0.25];
    else if (e.burn) tint = ["#ff8020", 0.15 + 0.1 * Math.sin(G.t * 25)];
    else if (e.sleep > 0) tint = ["#b8f080", 0.3];
    else if (e.spore > 0) tint = ["#a0e060", 0.2];
    else if (e.curse) tint = ["#5af5cd", 0.15];
    else if (e.broken > 0) tint = ["#ffd27a", 0.2];
    if (!e.dead) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.w * 0.6, 4, 0, 0, TAU); ctx.fill(); }
    if (!S.draw(ctx, rec, e.x, e.y + 1, e.dir, 1, tint, alpha, rot)) { ctx.fillStyle = "#355"; ctx.fillRect(e.x - e.w / 2, e.y - e.h, e.w, e.h); }
    if (e.dead) return;
    if (e.root > 0) S.drawFx(ctx, "reaperSnared", e.x, e.y - 4, { scale: e.w / 30 });
    if (e.bleed && Math.random() < 0.2) G.fx.push({ kind: "mote", x: e.x + (Math.random() - 0.5) * e.w * 0.6, y: e.y - e.h * (0.3 + Math.random() * 0.4), vx: 0, vy: 60, t: 0, life: 0.4, c: "rgba(200,30,40," });
    if (e.burn && Math.random() < 0.3) G.fx.push({ kind: "mote", x: e.x + (Math.random() - 0.5) * e.w, y: e.y - Math.random() * e.h, vx: 0, vy: -60, t: 0, life: 0.4, c: "rgba(255,150,50," });
    // the tell: an ! above an enemy about to strike
    if (e.state === "windup") {
      ctx.font = `900 ${e.d.boss ? 30 : 20}px Georgia, serif`; ctx.textAlign = "center";
      ctx.fillStyle = "#ffdf6a"; ctx.strokeStyle = "#400"; ctx.lineWidth = 3;
      ctx.strokeText("!", e.x, e.y - e.h - 14); ctx.fillText("!", e.x, e.y - e.h - 14);
    }
    // health bar
    if (!e.d.boss && e.hp < e.max) {
      const w = 40;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - w / 2, e.y - e.h - 10, w, 4);
      ctx.fillStyle = "#6fe0d0"; ctx.fillRect(e.x - w / 2, e.y - e.h - 10, w * pct(e.hp, e.max), 4);
    }
    if (e.d.shield && !e.broken) { // shield side marker
      ctx.fillStyle = "rgba(200,215,220,0.25)"; ctx.fillRect(e.x + e.dir * e.w * 0.45 - 2, e.y - e.h * 0.85, 4, e.h * 0.7);
    }
  }

  function drawDummy(e) {
    const x = e.x, y = e.y, wob = e.flash > 0 ? Math.sin(G.t * 80) * 3 : 0;
    ctx.fillStyle = "#3b2a1c"; ctx.fillRect(x - 3, y - 80, 6, 80);
    ctx.fillStyle = e.flash > 0 ? "#fff3c0" : "#b8a060"; ctx.beginPath(); ctx.ellipse(x + wob, y - 50, 16, 24, 0, 0, TAU); ctx.fill();
    ctx.fillRect(x - 26 + wob, y - 64, 52, 6);
    ctx.beginPath(); ctx.arc(x + wob, y - 84, 10, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#6a5530"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10 + wob, y - 40); ctx.lineTo(x + 10 + wob, y - 60); ctx.stroke();
  }

  // ---------------- shots ----------------
  function drawShot(s) {
    if (s.delay > 0) return;
    const ang = Math.atan2(s.vy, s.vx);
    if (s.kind === "bolt" || s.kind === "frost") {
      S.drawFx(ctx, s.img, s.x, s.y, { rot: ang });
      if (s.kind === "frost") glowDot(s.x, s.y, 16, "150,220,255", 0.5);
    } else if (s.kind === "bomb") {
      glowDot(s.x, s.y, 20, "150,220,255", 0.6);
      S.drawFx(ctx, s.img, s.x, s.y, { rot: s.t * 12, scale: 1.4 });
    } else if (s.kind === "sickle") {
      const p = s.owner;
      ctx.strokeStyle = "rgba(190,150,255,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(p.x + p.dir * 10, p.y - p.h * 0.6); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]);
      S.drawFx(ctx, "reaperSickle" + (1 + (Math.floor(s.t * 24) % 4)), s.x, s.y, { scale: 1.2 });
    } else if (s.kind === "dragon") {
      glowDot(s.x, s.y, 70, "255,80,100", 0.35);
      S.drawFx(ctx, "dragon6", s.x - s.dir * 50, s.y, { dir: s.dir, scale: 0.9, alpha: 0.95 });
    } else if (s.kind === "arrow") {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
      ctx.strokeStyle = "#c8b48a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = "#7ff0e0"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(3, -4); ctx.lineTo(3, 4); ctx.fill();
      ctx.restore();
    } else if (s.kind === "orb") {
      glowDot(s.x, s.y, 22, "120,255,200", 0.55);
      ctx.fillStyle = "#d8fff4"; ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, TAU); ctx.fill();
    } else if (s.kind === "soul") { // Abigail's soul orb
      glowDot(s.x, s.y, 20, "90,245,205", 0.55);
      S.drawFx(ctx, "soulOrb", s.x, s.y, { scale: 0.45, rot: ang + Math.PI / 2 });
    } else if (s.kind === "spore") { // Fred's spore glob
      glowDot(s.x, s.y, 14, "170,230,110", 0.5);
      ctx.fillStyle = "#c8f090"; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#6a9a40"; ctx.fillRect(s.x - 1, s.y - 1, 3, 3);
    } else if (s.kind === "wyvbolt") { // David's bolt of blood-red fire
      glowDot(s.x, s.y, 22, "255,80,60", 0.6);
      ctx.strokeStyle = "rgba(255,120,80,0.7)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04); ctx.stroke();
      ctx.fillStyle = "#ffe0c0"; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill();
    } else if (s.kind === "wave") {
      const a = Math.min(1, s.life * 3);
      ctx.fillStyle = `rgba(120,230,210,${0.75 * a})`;
      ctx.beginPath(); ctx.moveTo(s.x - 22, s.ground); ctx.quadraticCurveTo(s.x - Math.sign(s.vx) * 4, s.ground - 44, s.x + 22, s.ground); ctx.fill();
      ctx.fillStyle = `rgba(20,40,40,${0.6 * a})`; ctx.fillRect(s.x - 20, s.ground - 3, 40, 3);
    }
  }
  function glowDot(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ---------------- zones ----------------
  function drawZone(z, behind) {
    if (z.kind === "sanct" && behind) {
      const a = Math.min(1, (z.dur - z.t) * 2) * 0.5;
      const g = ctx.createRadialGradient(z.x, z.y - 30, 10, z.x, z.y - 30, z.r);
      g.addColorStop(0, `rgba(255,220,140,${a * 0.6})`); g.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.9, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,230,160,${a})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.9, 0, Math.PI, TAU); ctx.stroke();
    }
    if ((z.kind === "firewall" || z.kind === "brandfire") && !behind) {
      const fade = Math.min(1, (z.dur - z.t) * 2.5);
      for (const s of z.segs) if (s.up) {
        const grow = Math.min(1, (z.t - s.t0) / 0.15), fr = 1 + (Math.floor(z.t * 14 + s.x * 0.1) % 6);
        glowDot(s.x, z.y - 20, 34, "255,140,40", 0.25 * fade);
        S.drawFx(ctx, z.kind === "brandfire" ? "brandFlame" : "fire" + fr, s.x, z.y + 2, { ay: 1, scale: (z.kind === "brandfire" ? 1.1 : 0.95) * grow, alpha: fade, sx: s.x % 2 ? 1 : -1 });
      }
    }
    if (z.kind === "crystals" && !behind) {
      for (const s of z.segs) if (s.up) {
        const a = z.t - s.t0, rise = Math.min(1, a / 0.1), fade = 1 - Math.max(0, (a - 0.5) / 0.4);
        if (fade <= 0) continue;
        glowDot(s.x, z.y - 20, 30, "80,240,160", 0.3 * fade);
        S.drawFx(ctx, "jadeCrystal" + (s.v + 1), s.x, z.y + 4, { ay: 1, sy: rise, alpha: fade, scale: 1.1 });
      }
    }
    if (z.kind === "thorns" && !behind) {
      const n = Math.max(2, Math.floor(z.r / 24));
      for (let i = -n; i <= n; i++) {
        const x = z.x + (i / n) * z.r, d = Math.abs(i / n) * z.r, a = z.t - d / 900;
        if (a < 0 || !Wd.groundAt(x, z.y)) continue;
        const rise = Math.min(1, a / 0.08), fade = 1 - Math.max(0, (z.t - 0.5) / 0.4);
        S.drawFx(ctx, i % 2 ? "bloodThorn" : "bloodThorns", x, z.y + 3, { ay: 1, sy: rise * (z.big ? 1.4 : 1.1), scale: z.big ? 1.3 : 1.1, alpha: fade, dir: i < 0 ? -1 : 1 });
      }
    }
  }

  // ---------------- effects ----------------
  function drawFx(f) {
    const q = f.t / f.life;
    switch (f.kind) {
      case "slash": return drawSlash(f, q);
      case "ghost": if (f.rec) S.draw(ctx, f.rec, f.x, f.y, f.dir, 1, [f.tint || "#9fd8ff", 0.7], 0.45 * (1 - q)); return;
      case "spark":
        ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - q; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke(); ctx.globalAlpha = 1; return;
      case "dust":
        ctx.fillStyle = f.c; ctx.globalAlpha = 1 - q; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + q), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return;
      case "mote":
        ctx.fillStyle = f.c + (1 - q) + ")"; ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); return;
      case "ring":
        ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - q; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, 10 + q * 30, 4 + q * 8, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; return;
      case "slam":
        ctx.strokeStyle = `rgba(${f.c},${1 - q})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(f.x, f.y, 20 + q * 90, 5 + q * 14, 0, 0, TAU); ctx.stroke(); return;
      case "portal": {
        const a = Math.sin(q * Math.PI);
        glowDot(f.x, f.y - 40, 60, "60,200,190", 0.5 * a);
        ctx.fillStyle = `rgba(5,20,25,${0.8 * a})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, 34 * a, 8 * a, 0, 0, TAU); ctx.fill();
        return;
      }
      case "zap": { // David's bolt leaping on
        ctx.strokeStyle = `rgba(255,170,130,${1 - q})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y);
        for (let i = 1; i < 5; i++) { const u = i / 5; ctx.lineTo(f.x + (f.x2 - f.x) * u + (Math.random() - 0.5) * 14, f.y + (f.y2 - f.y) * u + (Math.random() - 0.5) * 14); }
        ctx.lineTo(f.x2, f.y2); ctx.stroke(); return;
      }
      case "flare": S.drawFx(ctx, "arbFlare" + (1 + Math.min(3, Math.floor(q * 4))), f.x, f.y, { scale: f.scale, alpha: 1 - q * 0.6, add: true }); return;
      case "coil": { const p = f.follow; S.drawFx(ctx, "dragon" + (1 + Math.min(4, Math.floor(q * 5))), p.x + p.dir * 20, p.y - 60, { dir: p.dir, scale: 0.55, alpha: 0.85 }); return; }
      case "snare": S.drawFx(ctx, "reaperSnare", f.x, f.y, { scale: (f.r * 2 / 232) * (0.6 + 0.4 * Math.min(1, q * 3)), sy: 0.55, rot: q * 0.6, alpha: 1 - q * q }); return;
      case "iceburst": {
        ctx.strokeStyle = `rgba(190,235,255,${1 - q})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * Math.min(1, q * 3), 0, TAU); ctx.stroke();
        glowDot(f.x, f.y, f.r, "160,220,255", 0.4 * (1 - q));
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; S.drawFx(ctx, i % 2 ? "iceSpike1" : "iceSpike2", f.x + Math.cos(a) * f.r * 0.55, f.y + Math.sin(a) * f.r * 0.3, { ay: 1, rot: Math.cos(a) * 0.5, alpha: 1 - q, sy: Math.min(1, q * 5) }); }
        return;
      }
    }
  }

  function drawSlash(f, q) {
    const p = f.follow, d = p.dir, cx = p.x, cy = p.y - p.h * 0.55, a = 1 - q;
    ctx.save();
    if (f.lash) {
      const fr = 1 + Math.min(2, Math.floor(q * 3));
      S.drawFx(ctx, "roseLash" + fr, cx + d * f.range * 0.45, cy + (f.up ? -50 : 0), { dir: d, alpha: a, scale: 1.1, rot: f.up ? -d * 1.2 : 0 });
      ctx.restore(); return;
    }
    if (f.type === "thrust") {
      const y = f.up ? cy - 40 : cy - 4;
      const g = ctx.createLinearGradient(cx, y, cx + d * f.range, y);
      g.addColorStop(0, `rgba(${f.color},0)`); g.addColorStop(1, `rgba(255,240,230,${a})`);
      ctx.strokeStyle = g; ctx.lineWidth = 5 * a + 1;
      ctx.beginPath(); ctx.moveTo(cx + d * 10, y); ctx.lineTo(cx + d * f.range, f.up ? y - 60 : y); ctx.stroke();
      ctx.restore(); return;
    }
    const r = f.range * 0.85, arcs = [[-1.3, 0.7], [0.9, -0.9], [-1.6, 1.1]];
    let [a0, a1] = f.up ? [-2.8, -0.3] : arcs[f.step];
    const sweep = a0 + (a1 - a0) * Math.min(1, q * 1.6);
    ctx.translate(cx, cy); ctx.scale(d, 1);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? `rgba(${f.color},${0.35 * a})` : i === 1 ? `rgba(${f.color},${0.7 * a})` : `rgba(255,250,235,${0.9 * a})`;
      ctx.lineWidth = [14, 7, 2.5][i] * (f.step === 2 ? 1.4 : 1);
      ctx.beginPath();
      if (a1 > a0) ctx.arc(0, 0, r - i * 3, a0, sweep); else ctx.arc(0, 0, r - i * 3, sweep, a0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoxes() {
    const p = G.player;
    ctx.strokeStyle = "rgba(0,255,0,0.6)"; ctx.lineWidth = 1;
    ctx.strokeRect(p.x - p.w / 2, p.y - p.h, p.w, p.h);
    if (p.atk && !p.atk.ranged) { const [x0, y0, x1, y1] = DS.meleeBox(p, p.atk); ctx.strokeStyle = "rgba(255,80,80,0.8)"; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    ctx.strokeStyle = "rgba(0,200,255,0.6)";
    for (const e of G.foes) ctx.strokeRect(e.x - e.w / 2, e.y - e.h, e.w, e.h);
  }

  // wallpaper: only the name of the knight taking over, low and soft
  function wallBanner() {
    if (!G.banner) return;
    const a = Math.min(1, G.banner.t * 2, (2.2 - G.banner.t) * 1.5) * 0.8;
    ctx.textAlign = "center"; ctx.font = '700 16px "Pixelify Sans", monospace';
    ctx.fillStyle = `rgba(220,240,240,${Math.max(0, a)})`; ctx.fillText(G.banner.txt, R.vw / 2, R.vh * 0.2);
  }

  // ---------------- HUD ----------------
  function hud() {
    const p = G.player, k = p.k, vw = R.vw;
    ctx.textAlign = "left";
    const x = 14, y = 14;
    const fam = DS.Fam.form(), ex = DS.Explore.on ? (DS.Explore.relics.length ? 32 : 16) : 0;
    ctx.fillStyle = "rgba(6,12,18,0.55)"; ctx.fillRect(x - 6, y - 6, 232, (fam ? 88 : 72) + ex);
    ctx.font = '700 13px "Pixelify Sans", monospace'; ctx.fillStyle = `rgb(${k.color})`;
    ctx.fillText(k.name.toUpperCase(), x, y + 10);
    ctx.font = '600 10px "Inter", system-ui, sans-serif'; ctx.fillStyle = "#9fb4bb"; const klv = DS.Explore.kitLevel(p.kitId); // kit level from sigils (Robert 2026-11-20)
    if (klv) { ctx.fillStyle = "#ffb060"; ctx.fillText("Lv " + klv, x + 170, y + 10); } else ctx.fillText(k.tag, x + 170, y + 10);
    // health
    bar(x, y + 18, 220, 9, p.hp / p.max, "#d24848", "#3a1212");
    ctx.fillStyle = "#e8eef0"; ctx.font = '600 9px "Inter", system-ui, sans-serif'; ctx.fillText(Math.ceil(p.hp) + " / " + p.max, x + 4, y + 26);
    // ability
    const ab = k.ability, ready = p.abilCd <= 0;
    bar(x, y + 34, 220, 7, ready ? 1 : 1 - p.abilCd / ab.cd, ready ? `rgb(${k.color})` : "#5a6870", "#141c22");
    ctx.fillStyle = ready ? "#fff" : "#8a9aa2"; ctx.font = '600 10px "Inter", system-ui, sans-serif';
    ctx.fillText(ab.name + (ready ? "  ready" : "  " + p.abilCd.toFixed(1) + "s"), x, y + 54);
    // kit meters
    let meter = null;
    if (k.heat) meter = ["Heat", p.heat / k.heat.max, p.heat >= k.heat.max ? "#ffffff" : "#ff9040"];
    if (k.tithe) meter = ["Tithe " + p.stacks, Math.min(1, p.stacks / 30), "#e03050"];
    if (k.momentum) meter = ["Momentum", Math.min(1, p.moveT / k.momentum.full), "#60e0a0"];
    if (k.stance) meter = ["Stable Form", Math.min(1, p.stillT / k.stance.after), p.stillT >= k.stance.after ? "#ff8090" : "#7a4a52"];
    if (k.rush) meter = ["Rush", p.rushT / k.rush.dur, "#c9a0ff"];
    if (fam) { // the familiar: its form, the kills to its next one, the knight's blessing or fury
      const fd = DS.Fam.def(), f = G.fam, next = fd.grow[f.form];
      ctx.fillStyle = `rgb(${fd.color})`; ctx.font = '600 10px "Inter", system-ui, sans-serif';
      let t = fam.name + (next != null ? "  ·  grows in " + Math.max(0, next - f.kills) : "");
      if (f.down > 0) t = fam.name + "  ·  down " + f.down.toFixed(0) + " s";
      if (p.bless > 0) t += "  ·  blessed";
      if (p.fury > 0) t += "  ·  fury";
      ctx.fillText(t, x, y + 70);
    }
    if (meter) { ctx.fillStyle = "#cfd8dc"; ctx.fillText(meter[0], x + 130, y + 54); bar(x + 130, y + 58, 90, 4, meter[1], meter[2], "#141c22"); }
    DS.Explore.hud(ctx, x, y + (fam ? 78 : 62), bar); // lantern, flares, pages, relics (under the familiar row)
    // top right: wave, kills, combo, dummy dps
    ctx.textAlign = "right"; ctx.font = '700 12px "Pixelify Sans", monospace'; ctx.fillStyle = "#cfe6e8";
    const left = G.foes.filter((e) => !e.dead && !e.d.dummy).length;
    const rx = vw - 14 - (document.body.classList.contains("touch") ? 64 : 0);
    ctx.fillText(G.scroll ? (G.endless ? `Level ${G.level + 1}  ·  auto  ·  ${Math.round(G.player.x / 100)} m` : `Level ${G.level + 1}  ·  ${Math.min(100, Math.max(0, Math.round(G.player.x / (G.bossX + 150) * 100)))}%  ·  ${left} foes`) : G.waves ? `Wave ${G.wave}  ·  ${left} left` : `Free play  ·  ${left} foes`, rx, y + 10);
    ctx.font = '600 11px "Inter", system-ui, sans-serif'; ctx.fillStyle = "#9fb4bb";
    ctx.fillText(`Kills ${G.kills}   Best combo ${G.best}`, rx, y + 26);
    if (G.combo >= 3) { ctx.font = '900 22px "Pixelify Sans", monospace'; ctx.fillStyle = `rgba(255,220,140,${Math.min(1, G.comboT)})`; ctx.fillText(G.combo + " HITS", rx, y + 52); }
    if (G.foes.some((e) => e.d.dummy)) {
      const sum = G.dummyLog.reduce((a, l) => a + l[1], 0), span = G.dummyLog.length ? Math.max(1, G.t - G.dummyLog[0][0]) : 1;
      ctx.font = '600 11px "Inter", system-ui, sans-serif'; ctx.fillStyle = "#e8d6a0";
      ctx.fillText(`Dummy DPS ${(sum / span).toFixed(0)}  (last 5 s: ${sum})`, rx, y + 72);
    }
    if (G.god) { ctx.font = '600 11px "Inter", system-ui, sans-serif'; ctx.fillStyle = "#ffd27a"; ctx.fillText("God mode", rx, y + 88); }
    if (G.auto && G.scroll) { // portrait: the knight fights on its own
      ctx.textAlign = "center"; ctx.font = '700 13px "Pixelify Sans", monospace';
      ctx.fillStyle = `rgba(230,240,235,${0.55 + 0.35 * Math.sin(G.t * 3)})`;
      ctx.fillText("Turn your phone sideways to take control", vw / 2, R.vh - (G.foes.some((e) => e.d.boss && !e.dead) ? 60 : 24));
    }
    // boss bar
    const boss = G.foes.find((e) => e.d.boss && !e.dead);
    if (boss) {
      const w = Math.min(420, vw - 120), bx = (vw - w) / 2, by = R.vh - 34;
      ctx.textAlign = "center"; ctx.font = '700 13px "Pixelify Sans", monospace'; ctx.fillStyle = "#e6d2b0";
      ctx.fillText(boss.d.name, vw / 2, by - 6);
      bar(bx, by, w, 8, boss.hp / boss.max, "#c0a060", "#201810");
    }
    if (G.banner) {
      const a = Math.min(1, G.banner.t * 3, (2.2 - G.banner.t) * 2);
      ctx.textAlign = "center"; ctx.font = '700 26px "Pixelify Sans", monospace';
      ctx.fillStyle = `rgba(220,240,240,${a})`; ctx.fillText(G.banner.txt, vw / 2, R.vh * 0.28);
    }
    DS.Explore.drawNote(ctx, vw, R.vh);
    DS.Loot.hud(ctx, vw);
    if (p.dead) {
      ctx.textAlign = "center"; ctx.font = '700 28px "Pixelify Sans", monospace'; ctx.fillStyle = "#e8b0b0";
      ctx.fillText("The light gutters…", vw / 2, R.vh * 0.42);
    }
    ctx.textAlign = "left";
  }
  function bar(x, y, w, h, f, c, bg) {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = c; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
})(window.DS = window.DS || {});
