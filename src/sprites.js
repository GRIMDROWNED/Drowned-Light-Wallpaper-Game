/* Sprite loading and drawing. One PNG per frame, facing right, drawn 1:1 (as in the main game).
   DS.Sprites.frame(set, anim, t) picks a frame; DS.Sprites.draw() draws it at the feet, mirrored when facing left,
   optionally tinted (hit flash, frozen, rooted). */
"use strict";
(function (DS) {
  const imgs = {};      // url -> {img, ok, fx, fy}
  const tints = new Map(); // url|color -> canvas
  let pending = 0, loaded = 0;

  // Characters are small pixel sprites (tools/pixelize.py) drawn at 2 world units a pixel, so one sprite pixel is one
  // pixel of the low-res canvas (src/render.js). `scale` maps a feet point given in full-size pixels onto the pixel sprite.
  const PX = 2;
  // Character frames live packed in one atlas.png per folder (DS.ATLAS from tools/pixelize.py); a rec is a rectangle of it.
  const sheets = {};
  function sheet(src) {
    if (sheets[src]) return sheets[src];
    const sh = sheets[src] = { img: new Image(), ok: false, wait: [] };
    pending++;
    sh.img.onload = () => { sh.ok = true; loaded++; for (const f of sh.wait) f(); sh.wait = null; };
    sh.img.onerror = () => { loaded++; };
    sh.img.src = src + "?v=" + DS.VERSION;
    return sh;
  }
  function load(url, feet, scale = 1) {
    if (imgs[url]) return imgs[url];
    const rec = { img: null, ok: false, sx: 0, sy: 0, w: 0, h: 0, fx: feet ? feet[0] * scale + (scale < 1 ? 1 : 0) : 0, fy: feet ? feet[1] * scale + (scale < 1 ? 1 : 0) : 0, guess: !feet };
    imgs[url] = rec;
    const m = url.match(/^assets\/((?:knights|drowned)\/[^/]+)\/(.+)\.png$/);
    const r = m && DS.ATLAS && DS.ATLAS[m[1]] && DS.ATLAS[m[1]][m[2]];
    if (r) {
      const sh = sheet("assets/" + m[1] + "/atlas.png");
      rec.img = sh.img; [rec.sx, rec.sy, rec.w, rec.h] = r;
      const ready = () => { rec.ok = true; if (rec.guess) guessFeet(rec); };
      if (sh.ok) ready(); else sh.wait.push(ready);
      return rec;
    }
    rec.img = new Image(); pending++;
    rec.img.onload = () => {
      rec.ok = true; loaded++; rec.w = rec.img.width; rec.h = rec.img.height;
      if (rec.guess) guessFeet(rec);
    };
    rec.img.onerror = () => { loaded++; };
    rec.img.src = url + "?v=" + DS.VERSION;
    return rec;
  }

  // Feet = the lowest opaque row; x = the middle of the opaque pixels in the bottom few rows.
  function guessFeet(rec) {
    const { img } = rec, w = rec.w, h = rec.h;
    rec.fx = w / 2; rec.fy = h;
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"); g.drawImage(img, rec.sx, rec.sy, w, h, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let low = -1;
      for (let y = h - 1; y >= 0 && low < 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { low = y; break; }
      if (low < 0) return;
      let sx = 0, n = 0;
      for (let y = Math.max(0, low - 8); y <= low; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { sx += x; n++; }
      rec.fy = low + 1; rec.fx = n ? sx / n : w / 2;
    } catch (e) { /* tainted canvas (opened from file://): keep the bottom middle */ }
  }

  // Load every frame of a sprite set. A set lists frame names per animation and a feet table.
  function loadSet(set) {
    if (set._frames) return set;
    set._frames = {};
    const base = "assets/" + set.folder + "/";
    set.px = (DS.PIXSCALE && DS.PIXSCALE[set.folder]) || 1;
    for (const anim of ["idle", "run", "jump", "fall", "attack", "hurt", "death", "dash", "cast", "charge", "guard", "rise", "apex", "land", "flip", "airAtk", "upAtk", "plunge", "plungeLand", "windup", "strike", "recover", "knock", "flinch", "block", "aimUp", "pounce", "chargeWind", "charge", "skid"]) {
      if (!set[anim]) continue;
      set._frames[anim] = set[anim].map((f) => load(base + f + ".png", set.feet && set.feet[f], set.px));
    }
    return set;
  }

  const fxCache = {};
  function fx(name) { return fxCache[name] || (fxCache[name] = load("assets/fx/" + name + ".png", [0, 0])); }
  function ground(name) { return fxCache["g/" + name] || (fxCache["g/" + name] = load("assets/ground/" + name + ".png", [0, 0])); }

  // frame by progress p in [0,1) (loops if loop) or by time t at fps
  function frame(set, anim, p) {
    const list = (set._frames[anim] && set._frames[anim].length ? set._frames[anim] : set._frames.idle) || [];
    if (!list.length) return null;
    const i = Math.min(list.length - 1, Math.max(0, Math.floor(p * list.length)));
    return list[i];
  }

  function tinted(rec, color) {
    const key = rec.img.src + "|" + rec.sx + "," + rec.sy + "|" + color;
    let c = tints.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = rec.w; c.height = rec.h;
      const g = c.getContext("2d");
      g.drawImage(rec.img, rec.sx, rec.sy, rec.w, rec.h, 0, 0, rec.w, rec.h); g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      tints.set(key, c);
    }
    return c;
  }

  // Draw a frame with its feet at (x, y). dir 1 = facing right. scale for bosses. tint = [color, alpha].
  function draw(ctx, rec, x, y, dir, scale = 1, tint = null, alpha = 1, rot = 0) {
    if (!rec || !rec.ok) return false;
    ctx.save();
    ctx.translate(Math.round(x / PX) * PX, Math.round(y / PX) * PX);
    scale *= PX;
    if (rot) ctx.rotate(rot * dir);
    ctx.scale(dir * scale, scale);
    ctx.globalAlpha = alpha;
    ctx.drawImage(rec.img, rec.sx, rec.sy, rec.w, rec.h, -rec.fx, -rec.fy, rec.w, rec.h);
    if (tint) { ctx.globalAlpha = alpha * tint[1]; ctx.drawImage(tinted(rec, tint[0]), -rec.fx, -rec.fy); }
    ctx.restore();
    return true;
  }

  // Draw an effect image centred at (x, y), rotated, scaled, mirrored by dir.
  function drawFx(ctx, name, x, y, opt = {}) {
    const rec = fx(name);
    if (!rec.ok) return false;
    const w = rec.img.width, h = rec.img.height, s = opt.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.scale((opt.dir || 1) * s * (opt.sx || 1), s * (opt.sy || 1));
    ctx.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
    if (opt.add) ctx.globalCompositeOperation = "lighter";
    const ax = opt.ax == null ? 0.5 : opt.ax, ay = opt.ay == null ? 0.5 : opt.ay;
    ctx.drawImage(rec.img, -w * ax, -h * ay);
    ctx.restore();
    return true;
  }

  function progress() { return pending ? loaded / pending : 1; }

  DS.Sprites = { load, loadSet, frame, draw, drawFx, fx, ground, progress };
})(window.DS = window.DS || {});
