/* Menus: the knight picker (title), the pause menu with the testing tools, and pad/keyboard navigation for both. */
"use strict";
(function (DS) {
  const G = DS.G, I = DS.Input;
  const $ = (s) => document.querySelector(s);
  let open = null, focus = 0;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function buildKits() {
    const grid = $("#kitGrid"); grid.innerHTML = "";
    DS.KIT_ORDER.forEach((id) => {
      const k = DS.KITS[id];
      const b = el("button", "kit opt");
      b.style.setProperty("--kc", k.color);
      b.innerHTML = `<span class="por"><img alt="" src="assets/${k.sprite.folder}/right.png?v=${DS.VERSION}"></span>
        <span class="info"><span class="tag">${k.tag}</span><b>${k.name}</b>
        <span class="row"><i>Attack</i> ${k.attack.name}</span><span class="row"><i>Ability</i> ${k.ability.name}</span></span>`;
      b.title = k.ability.text + "\n" + k.passiveText;
      b.addEventListener("click", () => pickKit(id));
      b.addEventListener("focus", () => showKitText(id));
      b.addEventListener("mouseenter", () => showKitText(id));
      grid.appendChild(b);
    });
    showKitText(G.kit);
  }
  function showKitText(id) {
    const k = DS.KITS[id];
    $("#kitText").innerHTML = `<b style="color:rgb(${k.color})">${k.name}</b> · ${k.ability.name}: ${k.ability.text} <span class="pas">${k.passiveText}</span>`;
  }
  function pickKit(id) {
    close();
    if (G.player && G.mode !== "title") DS.switchKit(id); else { G.kit = id; DS.restart(); }
    G.mode = "play";
  }

  function buildPause() {
    const spawn = $("#spawnRow"); spawn.innerHTML = "";
    for (const id of DS.ENEMY_ORDER.concat(["dummy"])) {
      const name = id === "dummy" ? "Training Dummy" : DS.ENEMIES[id].name;
      const b = el("button", "opt small", name);
      b.addEventListener("click", () => {
        const p = G.player;
        if (id === "dummy") DS.spawnFoe("dummy", Math.min(DS.World.W - 100, p.x + p.dir * 160), DS.World.surfaceBelow(p.x + p.dir * 160, p.y - 4));
        else DS.spawnFoe(id);
        flash(b);
      });
      spawn.appendChild(b);
    }
    $("#btnResume").onclick = () => { close(); G.mode = "play"; };
    $("#btnKits").onclick = () => openMenu("kits");
    $("#btnWave").onclick = (e) => { G.waveT = 0; G.foes = G.foes.filter((f) => f.d.dummy); G.waves = true; syncToggles(); flash(e.target); };
    $("#btnClear").onclick = (e) => { G.foes = []; G.shots = []; flash(e.target); };
    $("#btnWaves").onclick = () => { G.waves = !G.waves; syncToggles(); };
    $("#btnGod").onclick = () => { G.god = !G.god; syncToggles(); };
    $("#btnBoxes").onclick = () => { G.boxes = !G.boxes; syncToggles(); };
    $("#btnRestart").onclick = () => { DS.restart(); close(); G.mode = "play"; };
    $("#btnHelp").onclick = () => { $("#help").hidden = !$("#help").hidden; };
    syncToggles();
  }
  function syncToggles() {
    $("#btnWaves").textContent = "Waves: " + (G.waves ? "on" : "off");
    $("#btnGod").textContent = "God mode: " + (G.god ? "on" : "off");
    $("#btnBoxes").textContent = "Hitboxes: " + (G.boxes ? "on" : "off");
  }
  function flash(b) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 300); }

  function openMenu(name) {
    for (const m of document.querySelectorAll(".menu")) m.hidden = m.id !== name;
    open = name; focus = 0;
    if (G.mode === "play") G.mode = "menu";
    if (name === "kits") {
      focus = Math.max(0, DS.KIT_ORDER.indexOf(G.kit));
      $("#kits .back").hidden = !G.player || G.mode === "title";
    }
    setFocus();
  }
  function close() {
    for (const m of document.querySelectorAll(".menu")) m.hidden = true;
    open = null;
  }
  function opts() { return open ? [...document.querySelectorAll(`#${open} .opt`)].filter((b) => b.offsetParent) : []; }
  function setFocus() {
    const o = opts(); if (!o.length) return;
    focus = Math.max(0, Math.min(o.length - 1, focus));
    o.forEach((b, i) => b.classList.toggle("focus", i === focus && I.source !== "touch"));
    if (I.source !== "touch") { o[focus].focus({ preventScroll: true }); o[focus].scrollIntoView({ block: "nearest" }); }
  }
  // move the focus to the nearest option in a direction (spatial navigation for the grids)
  function nav(dx, dy) {
    const o = opts(); if (!o.length) return;
    const r0 = o[focus].getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = -1, bd = 1e9;
    o.forEach((b, i) => {
      if (i === focus) return;
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy; if (along <= 4) return;
      const d = along + Math.abs(x * dy + y * dx) * 2.5;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { focus = best; setFocus(); }
  }

  let navT = 0;
  function update(dt) {
    if (!open) return;
    navT -= dt;
    const dirs = [["left", -1, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
    for (const [a, dx, dy] of dirs) if (I.p[a] || (I.h[a] && navT < -0.25)) { nav(dx, dy); navT = 0; if (I.h[a] && !I.p[a]) navT = -0.15; }
    if (I.p.confirm && I.source !== "keys") { const o = opts(); if (o[focus]) o[focus].click(); }
    if (I.p.back || I.p.pause) {
      if (open === "kits" && G.mode === "title") return;
      if (open === "kits") { openMenu("pause"); return; }
      close(); G.mode = "play";
    }
  }

  function cycleKit(d) {
    const i = DS.KIT_ORDER.indexOf(G.kit), n = DS.KIT_ORDER.length;
    const id = DS.KIT_ORDER[(i + d + n) % n];
    DS.switchKit(id);
    G.banner = { txt: DS.KITS[id].name, t: 0.4 };
  }

  function init() {
    try { const k = localStorage.getItem("dl-side-kit"); if (k && DS.KITS[k]) G.kit = k; } catch (e) { /* storage blocked */ }
    buildKits(); buildPause();
    $("#pauseBtn").addEventListener("click", () => { if (G.mode === "play") openMenu("pause"); });
    document.querySelectorAll(".menu .back").forEach((b) => b.addEventListener("click", () => openMenu("pause")));
    DS.Input.bindMouse(document.getElementById("game"));
    DS.Input.bindTouch(document.body, $("#stick"), $("#knob"));
    $("#ver").textContent = "v" + DS.VERSION;
    openMenu("kits");
  }

  DS.UI = { init, update, open: openMenu, close, cycleKit };
})(window.DS = window.DS || {});
