/* The arena: a drowned ruin with a floor, a raised dais, walls and one-way platforms, plus physics and the
   parallax backdrop (painted in code: the main game has no side-on scenery yet). */
"use strict";
(function (DS) {
  const W = 2400, H = 1000, FLOOR = 860;
  const solids = [
    { x: -200, y: FLOOR, w: W + 400, h: 300 },           // floor
    { x: -200, y: -400, w: 240, h: H + 600 },            // left wall
    { x: W - 40, y: -400, w: 240, h: H + 600 },          // right wall
    { x: 1100, y: 790, w: 200, h: 80 },                  // the dais
  ];
  const plats = [ // one-way: stand on top, jump up through, hold down + jump to drop
    { x: 190, y: 755, w: 220 }, { x: 470, y: 655, w: 200 }, { x: 790, y: 745, w: 200 },
    { x: 1110, y: 655, w: 180 }, { x: 1080, y: 540, w: 240 }, { x: 1440, y: 745, w: 220 },
    { x: 1740, y: 655, w: 200 }, { x: 2010, y: 755, w: 220 },
  ];
  const spawns = [{ x: 120, y: FLOOR }, { x: W - 120, y: FLOOR }];

  // Move an entity (x = centre, y = feet) through the world. Sets e.onGround, e.hitWall, e.onPlat.
  function move(e, dt, blockers) {
    const hw = e.w / 2;
    e.hitWall = 0;
    e.x += e.vx * dt;
    const all = blockers ? solids.concat(blockers) : solids;
    for (const s of all) {
      if (e.y > s.y + 0.01 && e.y - e.h < s.y + s.h && e.x + hw > s.x && e.x - hw < s.x + s.w) {
        if (e.x < s.x + s.w / 2) { e.x = s.x - hw; e.hitWall = 1; } else { e.x = s.x + s.w + hw; e.hitWall = -1; }
        if (!s.soft) e.vx = 0;
      }
    }
    const py = e.y;
    e.y += e.vy * dt;
    e.onGround = false; e.onPlat = null;
    for (const s of solids) {
      if (e.x + hw > s.x && e.x - hw < s.x + s.w && e.y > s.y && e.y - e.h < s.y + s.h) {
        if (py <= s.y + 1 || e.vy >= 0) { e.y = s.y; e.vy = Math.min(0, e.vy); e.onGround = true; }
        else { e.y = s.y + s.h + e.h; e.vy = Math.max(0, e.vy); }
      }
    }
    if (e.vy >= 0 && !(e.dropT > 0)) {
      for (const p of plats) {
        if (e.x + hw * 0.6 > p.x && e.x - hw * 0.6 < p.x + p.w && py <= p.y + 0.5 && e.y >= p.y) {
          e.y = p.y; e.vy = 0; e.onGround = true; e.onPlat = p;
        }
      }
    }
  }

  // Is there floor (solid or platform) right under (x, y)?
  function groundAt(x, y) {
    for (const s of solids) if (x > s.x && x < s.x + s.w && Math.abs(y - s.y) < 3) return true;
    for (const p of plats) if (x > p.x && x < p.x + p.w && Math.abs(y - p.y) < 3) return true;
    return false;
  }
  // Does a point sit inside a solid?
  function solidAt(x, y) {
    for (const s of solids) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
    return false;
  }
  // The highest surface at or below y under x.
  function surfaceBelow(x, y) {
    let best = FLOOR;
    for (const s of solids) if (x > s.x && x < s.x + s.w && s.y >= y - 1 && s.y < best) best = s.y;
    for (const p of plats) if (x > p.x && x < p.x + p.w && p.y >= y - 1 && p.y < best) best = p.y;
    return best;
  }

  // ---------- backdrop ----------
  let layers = null;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function buildLayers() {
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
    // far: spires of a drowned city against the mist
    const [far, f] = mk(1600, 520), r = rng(7);
    f.fillStyle = "#1b2a3a";
    for (let x = 0; x < 1600; x += 40 + r() * 70) {
      const w = 26 + r() * 50, h = 120 + r() * 260, bx = x;
      f.fillRect(bx, 520 - h, w, h);
      f.beginPath(); f.moveTo(bx - 4, 520 - h); f.lineTo(bx + w / 2, 520 - h - 30 - r() * 80); f.lineTo(bx + w + 4, 520 - h); f.fill();
      if (r() < 0.5) { f.fillStyle = "rgba(120,200,220,0.35)"; f.fillRect(bx + w * 0.4, 520 - h + 30, 4, 6); f.fillStyle = "#1b2a3a"; }
    }
    // mid: dead trees and broken arches
    const [mid, m] = mk(1800, 600), r2 = rng(19);
    m.fillStyle = "#101a24"; m.strokeStyle = "#101a24";
    for (let x = 60; x < 1800; x += 180 + r2() * 220) {
      if (r2() < 0.45) { // arch
        const w = 120 + r2() * 80, h = 200 + r2() * 120;
        m.fillRect(x, 600 - h, 22, h); m.fillRect(x + w, 600 - h * 0.8, 22, h * 0.8);
        m.beginPath(); m.lineWidth = 20; m.arc(x + w / 2 + 11, 600 - h * 0.8, w / 2, Math.PI, Math.PI * 1.6); m.stroke();
      } else { // dead tree
        const h = 220 + r2() * 200; m.lineCap = "round";
        const branch = (bx, by, len, ang, wdt) => {
          if (wdt < 1.5 || len < 10) return;
          const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
          m.lineWidth = wdt; m.beginPath(); m.moveTo(bx, by); m.lineTo(ex, ey); m.stroke();
          branch(ex, ey, len * 0.72, ang - 0.4 - r2() * 0.4, wdt * 0.62);
          if (r2() < 0.8) branch(ex, ey, len * 0.66, ang + 0.35 + r2() * 0.4, wdt * 0.6);
        };
        branch(x, 600, h * 0.4, -Math.PI / 2 + (r2() - 0.5) * 0.2, 16);
      }
    }
    // near: reeds and roots, very dark
    const [near, n] = mk(1400, 260), r3 = rng(41);
    n.strokeStyle = "#070c11"; n.lineCap = "round";
    for (let x = 0; x < 1400; x += 4 + r3() * 10) {
      const h = 40 + r3() * 140; n.lineWidth = 2 + r3() * 3;
      n.beginPath(); n.moveTo(x, 260); n.quadraticCurveTo(x + (r3() - 0.5) * 30, 260 - h * 0.6, x + (r3() - 0.5) * 50, 260 - h); n.stroke();
    }
    layers = { far, mid, near };
  }

  function drawBackdrop(ctx, cam, vw, vh, t) {
    if (!layers) buildLayers();
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, "#0a1420"); sky.addColorStop(0.55, "#1d3346"); sky.addColorStop(1, "#2a4552");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);
    // the pale drowned moon
    const mx = vw * 0.72 - cam.x * 0.03, my = vh * 0.2 - (cam.y - 400) * 0.03;
    const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
    glow.addColorStop(0, "rgba(200,235,240,0.55)"); glow.addColorStop(0.25, "rgba(150,210,220,0.18)"); glow.addColorStop(1, "rgba(150,210,220,0)");
    ctx.fillStyle = glow; ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = "#d8eef0"; ctx.beginPath(); ctx.arc(mx, my, 26, 0, 7); ctx.fill();
    const tile = (img, f, yOff, alpha) => {
      const w = img.width, ox = -((cam.x * f) % w + w) % w, y = vh - img.height + yOff - (cam.y - 400) * f * 0.6;
      ctx.globalAlpha = alpha;
      for (let x = ox - w; x < vw + w; x += w) ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
    };
    tile(layers.far, 0.12, -40, 1);
    // mist band
    const mist = ctx.createLinearGradient(0, vh * 0.45, 0, vh);
    mist.addColorStop(0, "rgba(90,140,150,0)"); mist.addColorStop(1, "rgba(90,140,150,0.28)");
    ctx.fillStyle = mist; ctx.fillRect(0, vh * 0.45, vw, vh * 0.55);
    tile(layers.mid, 0.32, 10, 1);
  }

  function drawNear(ctx, cam, vw, vh) {
    if (!layers) return;
    const img = layers.near, w = img.width, f = 1.25, ox = -((cam.x * f) % w + w) % w;
    const y = (FLOOR + 140 - cam.y) * 1.0 - img.height * 0.55 + (FLOOR - cam.y - vh * 0.7) * 0.25;
    ctx.globalAlpha = 0.9;
    for (let x = ox - w; x < vw + w; x += w) ctx.drawImage(img, x, y);
    ctx.globalAlpha = 1;
  }

  // Ground, dais and platforms (in world space: the caller has translated by -cam).
  let pats = {};
  function pattern(ctx, name) {
    if (pats[name]) return pats[name];
    const rec = DS.Sprites.ground(name);
    if (!rec.ok) return null;
    return (pats[name] = ctx.createPattern(rec.img, "repeat"));
  }

  function drawWorld(ctx, cam, vw, vh) {
    const floorPat = pattern(ctx, "caveFloor"), daisPat = pattern(ctx, "campFlags"), boardPat = pattern(ctx, "boardwalk");
    // floor
    ctx.fillStyle = floorPat || "#2a2f2c"; ctx.fillRect(cam.x - 10, FLOOR, vw + 20, H - FLOOR + 400);
    const shade = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 160);
    shade.addColorStop(0, "rgba(5,10,14,0.15)"); shade.addColorStop(1, "rgba(5,10,14,0.85)");
    ctx.fillStyle = shade; ctx.fillRect(cam.x - 10, FLOOR, vw + 20, 400);
    ctx.fillStyle = "#3f6b4a"; ctx.fillRect(cam.x - 10, FLOOR - 3, vw + 20, 5); // moss lip
    ctx.fillStyle = "#2b4b39";
    for (let x = Math.floor(cam.x / 14) * 14; x < cam.x + vw + 14; x += 14) {
      const h = 4 + ((x * 7919) % 9); ctx.fillRect(x, FLOOR - h, 2, h);
    }
    // walls
    for (const s of solids.slice(1, 3)) {
      ctx.fillStyle = floorPat || "#262b28"; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(4,8,12,0.6)"; ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    // dais
    const d = solids[3];
    ctx.fillStyle = daisPat || "#555"; ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = "rgba(10,16,22,0.35)"; ctx.fillRect(d.x, d.y + 10, d.w, d.h - 10);
    ctx.fillStyle = "#7d8a86"; ctx.fillRect(d.x - 4, d.y - 4, d.w + 8, 8);
    // platforms: boardwalk planks on posts
    for (const p of plats) {
      ctx.fillStyle = "#1a1410";
      for (const px of [p.x + 14, p.x + p.w - 22]) { const b = surfaceBelow(px + 4, p.y + 12); ctx.fillRect(px, p.y + 10, 8, b - p.y - 10); }
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = boardPat || "#6b5136"; ctx.fillRect(0, 0, p.w, 14);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(p.x, p.y + 9, p.w, 5);
      ctx.fillStyle = "rgba(255,230,180,0.18)"; ctx.fillRect(p.x, p.y, p.w, 2);
    }
  }

  DS.World = { W, H, FLOOR, solids, plats, spawns, move, groundAt, solidAt, surfaceBelow, drawBackdrop, drawNear, drawWorld };
})(window.DS = window.DS || {});
