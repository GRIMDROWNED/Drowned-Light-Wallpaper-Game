/* Menus: the knight picker (title), the pause menu with the testing tools, and pad/keyboard navigation for both. */
"use strict";
(function (DS) {
  const G = DS.G, I = DS.Input;
  const $ = (s) => document.querySelector(s);
  let open = null, focus = 0, back = null; // back: the menu the upgrades / haul screens return to

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // the knight screen's ten painted frames are coloured: each knight sits on the frame nearest its own colour (Robert's art 2026-11-25)
  const SCREEN_ORDER = ["jadeBreaker", "flameBastion", "pikeWarden", "relicBearer", "ashenArbalist", "chainReaper", "rosePaladin", "bloodsworn", "cinderbrand", "lanternBlade"];
  function buildKits() {
    const grid = $("#kitGrid"); grid.innerHTML = "";
    const order = SCREEN_ORDER.filter((id) => DS.KITS[id]).concat(DS.KIT_ORDER.filter((id) => !SCREEN_ORDER.includes(id)));
    order.forEach((id) => {
      const b = el("button", "kit opt");
      b.dataset.kit = id;
      kitButton(b);
      b.addEventListener("click", () => { if (DS.Unlock.kitOpen(id)) pickKit(id); else showKitText(id); }); // a locked one only says how to win it
      b.addEventListener("focus", () => showKitText(id));
      b.addEventListener("mouseenter", () => showKitText(id));
      grid.appendChild(b);
    });
    showKitText(G.kit);
  }
  // a knight still to be won is a dark "???" silhouette with the level that wins it (the secrecy rule of the main game)
  function kitButton(b) {
    const id = b.dataset.kit, k = DS.KITS[id], on = DS.Unlock.kitOpen(id), at = DS.Unlock.kitAt(id);
    if (b.dataset.on === String(on)) return; b.dataset.on = on;
    b.classList.toggle("locked", !on);
    b.style.setProperty("--kc", on ? k.color : "150,140,125");
    // head-and-chest portrait cut from the knight's front picture (tools/cut_portraits.py); the side sprite if there is none
    const por = `<span class="por"><img alt="" src="assets/ui/portraits/${id}.png?v=${DS.VERSION}" onerror="this.onerror=null;this.src='assets/${k.sprite.folder}/right.png?v=${DS.VERSION}';this.className='px'"></span>`;
    b.innerHTML = on ? por + `<span class="info"><b>${k.name}</b><span class="tag">${k.tag}</span>
        <span class="row"><i>Attack:</i> ${k.attack.name}</span><span class="row"><i>Ability:</i> ${k.ability.name}</span></span>`
      : por.replace("</span>", "<i class=\"lk\"></i></span>") + `<span class="info"><b>???</b><span class="tag">Locked</span><span class="row">Beat the boss of</span><span class="row">level ${at} to win</span></span>`;
    b.title = on ? k.ability.text + "\n" + k.passiveText : "";
  }
  // the knight screen has one info bar: it shows the knight, map or familiar last pointed at
  function info(sel, html) { const e = $(sel); e.innerHTML = html; for (const p of e.parentNode.children) p.classList.toggle("cur", p === e); }
  function showKitText(id) {
    const k = DS.KITS[id];
    if (!DS.Unlock.kitOpen(id)) { info("#kitText", `<b>???</b> · A knight still lost in the dark. Beat the boss of level ${DS.Unlock.kitAt(id)} to win them.`); return; }
    info("#kitText", `<b style="color:rgb(${k.color})">${k.name}</b> · ${k.attack.name} · <b style="color:rgb(${k.color})">${k.ability.name}:</b> ${k.ability.text} <span class="pas">${k.passiveText}</span>`);
  }
  function syncKits() { for (const b of document.querySelectorAll("#kitGrid .kit")) { kitButton(b); b.classList.toggle("cur", b.dataset.kit === G.kit); } }
  function pickKit(id) {
    close();
    if (G.player && G.mode !== "title") DS.switchKit(id); else { G.kit = id; DS.restart(); }
    G.mode = "play";
  }

  // the familiar picker: one row on the knight screen, one in the pause menu
  function buildFams() {
    for (const row of [$("#famPick"), $("#famPause")]) {
      row.innerHTML = "";
      // David first and "No familiar" last: his wide wings sit better in the first frame (Robert 2026-11-25)
      for (const id of ["wyvern"].concat(DS.FAM_ORDER.filter((f) => f !== "wyvern"), [null])) {
        const b = el("button", "opt small fam" + (id ? "" : " none"));
        b.dataset.fam = id || "";
        b.addEventListener("click", () => {
          if (id && !DS.Fam.won(id)) { showFamText(id); return; } // still a secret
          DS.Fam.set(id); syncFams(); flash(b);
        });
        b.addEventListener("focus", () => showFamText(id));
        b.addEventListener("mouseenter", () => showFamText(id));
        row.appendChild(b);
      }
    }
    syncFams();
  }
  // a familiar not yet won shows as a dark "???" (the secrecy rule of the main game)
  function famButton(b) {
    const id = b.dataset.fam || null, d = id && DS.FAMILIARS[id], won = !id || DS.Fam.won(id);
    b.classList.toggle("locked", !won);
    b.style.setProperty("--fc", d && won ? d.color : "160,180,185");
    b.innerHTML = d ? `<img alt="" src="assets/${d.forms[0].sprite.folder}/right.png?v=${DS.VERSION}">${won ? d.name : "???"}` : "No familiar";
  }
  function showFamText(id) {
    const d = id && DS.FAMILIARS[id], at = DS.FAM_UNLOCK.at;
    info("#famText", !d ? (DS.Fam.locked().length === DS.FAM_ORDER.length ? `Fight alone. Beat the boss of level ${at} to choose your first familiar.` : "Fight alone.")
      : !DS.Fam.won(id) ? `<b>???</b> · Not yet won. Beat the boss of level ${at} of a map (${at}, ${at + 10}, ${at + 20}...) to choose a familiar.`
        : `<b style="color:rgb(${d.color})">${d.name}:</b> ${d.text} <span class="pas">Forms: ${d.forms.map((f) => f.name).join(" → ")}</span>`);
  }
  function syncFams() {
    const cur = G.wall && G.fam ? G.fam.id : DS.Fam.picked();
    for (const b of document.querySelectorAll(".fam")) { famButton(b); b.classList.toggle("sel", (b.dataset.fam || null) === (cur || null)); }
    showFamText(cur);
  }
  // after a map's level 5 boss: Robert's shrine art has a card per familiar (DS.FAM_ORDER, frame colours bone, grey,
  // gold, blue, green, red); the ones still to win can be chosen, the ones you have are dimmed
  function buildFamWin() {
    const row = $("#famWinRow"); row.innerHTML = "";
    const say = (d) => { $("#famWinText").innerHTML = `<b style="color:rgb(${d.color})">${d.name}</b> · ${d.text} <span class="pas">Forms: ${d.forms.map((f) => f.name).join(" → ")}</span>`; };
    DS.FAM_ORDER.forEach((id, i) => {
      const d = DS.FAMILIARS[id], have = DS.Fam.won(id);
      const b = el("button", "opt fwcard" + (have ? " have" : ""));
      b.style.setProperty("--i", i); b.style.setProperty("--fc", d.color); b.disabled = have;
      b.innerHTML = `<span class="fwpic"><img alt="" src="assets/ui/portraits/fam-${id}.png?v=${DS.VERSION}"></span><b>${d.name}</b><span class="fwtext">${have ? "Already at your side." : d.text}</span>`;
      b.addEventListener("click", () => {
        if (have) return;
        DS.Fam.win(id); DS.Fam.set(id);
        close(); G.mode = "play";
        G.banner = { txt: d.name + " joins you", t: 0 };
      });
      b.addEventListener("focus", () => say(d));
      b.addEventListener("mouseenter", () => say(d));
      row.appendChild(b);
    });
    $("#famWinText").textContent = "Choose well: the others wait for the next map's fifth level.";
  }

  // ---------------- a new knight won (a map's last boss): Robert's arch art, after the Level cleared screen ----------------
  let kBack = null, kId = null;
  function kitWin(id) {
    const k = DS.KITS[id]; if (!k) return;
    kBack = open || "cleared"; kId = id;
    const pic = $("#kitWinPic"); pic.style.setProperty("--kc", k.color);
    pic.innerHTML = `<img alt="" src="assets/ui/portraits/${id}.png?v=${DS.VERSION}" onerror="this.onerror=null;this.src='assets/${k.sprite.folder}/right.png?v=${DS.VERSION}';this.className='px'">`;
    $("#kitWinName").innerHTML = `<b style="color:rgb(${k.color})">${k.name}</b>`;
    $("#kitWinText").innerHTML = `<span>${k.attack.name} · <b style="color:rgb(${k.color})">${k.ability.name}:</b> ${k.ability.text} <span class="pas">${k.passiveText}</span></span>`;
    openMenu("kitWin");
    syncKits();
  }
  function kitWinDone(take) {
    const id = kId; kId = null;
    if (take && id) { DS.switchKit(id); syncKits(); G.banner = { txt: DS.KITS[id].name, t: 0 }; }
    openMenu(kBack || "cleared");
  }

  // ---------------- the wallpaper's level, on Robert's art: levels already beaten only (src/unlocks.js) ----------------
  // ring centres and slots in art px (assets/ui/wallpaper-screen.jpg): Roam is the wide slot, then levels 1-10 of the map
  const W_RING = [392, 540, 685, 832, 980, 1128], W_RING_Y = 185;
  const W_SLOT = [[232, 318, 205, 107], [457, 318, 103, 107], [580, 318, 105, 107], [703, 318, 105, 107], [826, 318, 106, 107],
    [242, 450, 100, 105], [359, 450, 101, 105], [476, 450, 101, 105], [594, 450, 101, 105], [711, 450, 101, 105], [829, 450, 101, 105]];
  let wMap = 0;
  function openWallMenu() {
    const p = DS.Unlock.wallPick();
    wMap = Math.min(DS.MAPS.length - 1, Math.floor(Math.max(0, p >= 0 ? p : DS.Unlock.beat() - 1) / 10));
    openMenu("wallMenu");
  }
  function wallSay(html) { $("#wallInfo").innerHTML = `<span>${html}</span>`; } // one span: the bar is a grid
  function wallDefault() {
    const beat = Math.min(DS.Unlock.beat(), DS.Unlock.LAST), pick = DS.Unlock.wallPick();
    wallSay(!beat ? "Beat level 1 to choose here. Until then the wallpaper fights on level 1."
      : pick < 0 ? `<b>Roam</b> · a different beaten level each time (1 to ${beat})`
        : `<b style="color:rgb(${DS.MAPS[Math.floor(pick / 10)].c})">Level ${pick + 1}</b> · ${DS.MAPS[Math.floor(pick / 10)].name}`);
  }
  function syncWall() {
    const beat = Math.min(DS.Unlock.beat(), DS.Unlock.LAST), pick = DS.Unlock.wallPick();
    const maps = $("#wallMaps"); maps.innerHTML = "";
    // six rings are painted: with more maps (the Jade Hollow is map 7) they page, 6 at a time, with arrows either side
    const page = Math.floor(wMap / W_RING.length), pages = Math.ceil(DS.MAPS.length / W_RING.length);
    const turn = (d, x) => { // a page arrow (always there, so a map not yet reached still shows as "???")
      const to = page + d; if (to < 0 || to >= pages) return;
      const a = el("button", "opt wpage", d < 0 ? "\u2039" : "\u203a");
      a.setAttribute("aria-label", d < 0 ? "Earlier maps" : "Later maps");
      a.style.left = x / 1672 * 100 + "%"; a.style.top = W_RING_Y / 941 * 100 + "%";
      a.addEventListener("click", () => { wMap = to * W_RING.length; syncWall(); });
      maps.appendChild(a);
    };
    turn(-1, 268);
    DS.MAPS.forEach((m, i) => {
      if (Math.floor(i / W_RING.length) !== page) return;
      const ok = beat > i * 10; // a map shows once one of its levels is beaten
      const b = el("button", "opt map" + (i === wMap ? " sel" : "") + (ok ? "" : " locked"));
      b.style.setProperty("--mc", m.c); b.style.left = W_RING[i % W_RING.length] / 1672 * 100 + "%"; b.style.top = W_RING_Y / 941 * 100 + "%";
      b.innerHTML = `<span class="hole"><img alt="" src="${DS.Maps.badge(i)}" style="--ex:${m.em[0]};--ey:${m.em[1]}"></span>`;
      b.addEventListener("click", () => { if (ok) { wMap = i; syncWall(); } });
      const say = () => wallSay(ok ? `<b style="color:rgb(${m.c})">${m.name}</b> · levels ${i * 10 + 1} to ${i * 10 + 10}` : `<b>???</b> · Beat level ${i * 10 + 1} to fight here.`);
      b.addEventListener("focus", say); b.addEventListener("mouseenter", say);
      maps.appendChild(b);
    });
    turn(1, 1252);
    const lv = $("#wallLevels"); lv.innerHTML = "";
    W_SLOT.forEach(([x, y, w, h], k) => {
      const n = k === 0 ? -1 : wMap * 10 + k - 1, ok = n < beat, sel = n === pick;
      const b = el("button", "ks opt wslot" + (k === 0 ? " wide" : "") + (sel ? " sel" : "") + (ok ? "" : " locked"), ok ? (k === 0 ? "Roam" : String(n + 1)) : "");
      b.style.cssText = `--x:${x};--y:${y};--w:${w};--h:${h}`; b.dataset.lv = n;
      b.addEventListener("click", () => { if (!ok) return; DS.Unlock.setWallPick(n); syncWall(); });
      const say = () => wallSay(k === 0 ? (beat ? `<b>Roam</b> · a different beaten level each time (1 to ${beat})` : "<b>Roam</b> · beat level 1 first.")
        : ok ? `<b>Level ${n + 1}</b> · ${DS.MAPS[wMap].name}` : `<b>Level ${n + 1}</b> · beat it first.`);
      b.addEventListener("focus", say); b.addEventListener("mouseenter", say);
      lv.appendChild(b);
    });
    wallDefault();
    if (open === "wallMenu") { // keep the focus on the picked slot (the buttons were just rebuilt)
      const o = opts(), f = o.findIndex((x) => x.classList.contains("wslot") && x.classList.contains("sel"));
      focus = f >= 0 ? f : Math.max(0, o.indexOf($("#btnWallStart"))); setFocus();
    }
  }

  // ---------------- tester view of the unlocks: your progress / everything open / everything locked ----------------
  const UNLOCK_NAMES = { real: "as earned", all: "all UNLOCKED", none: "all LOCKED" };
  function refreshUnlocks() {
    syncKits(); syncFams(); syncMaps();
    if (G.player && !DS.Unlock.kitOpen(G.kit)) DS.switchKit(DS.Unlock.usableKit(G.kit));
    if (!G.wall && G.player) { const f = DS.Fam.picked(); if ((G.fam ? G.fam.id : null) !== f) DS.Fam.set(f, true); }
    if (open === "wallMenu") syncWall();
    syncToggles();
  }

  // ---------------- death, level cleared and the confirm pop-up (Robert's art) ----------------
  function syncDeath() {
    const by = G.player && G.player.lastHit;
    $("#deathText").innerHTML = (by ? `Struck down by the <b>${by}</b>` : "The light gutters out") + `<small>Level ${G.level + 1} · you rise again at the last checkpoint</small>`;
  }
  function syncCleared() {
    const lv = G.lv, n = G.level, pages = DS.Explore.pages().filter((k) => +k.split(":")[0] === n).length;
    const t = Math.round(lv.t), time = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    $("#clearTitle").textContent = "Level " + (n + 1) + " cleared";
    const rows = [["⌛", "Time", time], ["☠", "Drowned felled", lv.kills], ["⚔", "Best combo", lv.best], ["✦", "Drowned pages", pages + " of 3"], ["♰", "Falls", lv.deaths]];
    $("#clearRows").innerHTML = rows.map(([ic, k, v], r) => `<div class="crow" style="--r:${r}"><i>${ic}</i><span>${k}<b>${v}</b></span></div>`).join("");
    const got = DS.CUR_ORDER.filter((k) => lv.bag[k] > 0).slice(0, 8);
    $("#clearLoot").innerHTML = Array.from({ length: 8 }, (_, i) => got[i] ? `<span class="lc" title="${DS.CURRENCY[got[i]].name}"><img alt="" src="${L().icon(got[i])}"><b>${lv.bag[got[i]]}</b></span>` : "<span class=\"lc\"></span>").join("");
  }
  // a yes/no question over the menu that asked; no (or back) returns to it
  let cBack = null, cYes = null;
  function confirmBox(q, yes, fn) {
    cBack = open; cYes = fn;
    $("#confirmText").textContent = q; $("#confirmYes").textContent = yes;
    openMenu("confirm");
  }

  // ---------------- Settings on Robert's art: three rose sliders, three two-part toggles (DS.SETTINGS in data.js) ----------------
  // rows in art px: label plates, slider tracks (x 600-996), toggles (x 700-918, split at 813)
  const SET_ROWS = [[192, 63, 222], [279, 63, 302], [366, 63, 393], [453, 64, 486], [539, 64, 571], [623, 64, 656]];
  function applySettings() {
    const c = document.getElementById("game"); if (c) c.style.filter = DS.SET.bright === 1 ? "" : `brightness(${DS.SET.bright})`;
    document.body.style.setProperty("--tscale", DS.SET.touch);
  }
  function buildSettings() {
    const box = $("#setRows"); box.innerHTML = "";
    DS.SETTINGS.forEach((o, r) => {
      const [ly, lh, cy] = SET_ROWS[r], slider = o.kind === "slider";
      const lab = el("div", "ks setlabel"); lab.style.cssText = `--x:212;--y:${ly};--w:${slider ? 346 : 406};--h:${lh}`;
      lab.innerHTML = `<b>${o.name}</b><span></span>`; box.appendChild(lab);
      const b = el("button", "ks opt " + (slider ? "sld" : "tgl"));
      b.dataset.set = o.id;
      if (slider) {
        b.style.cssText = `--x:600;--y:${cy - 24};--w:396;--h:48`;
        b.innerHTML = `<i class="fill"></i><img alt="" src="assets/ui/rose-knob.png?v=${DS.VERSION}">`;
        const at = (e) => { const r0 = b.getBoundingClientRect(); setVal(o, o.min + (o.max - o.min) * Math.max(0, Math.min(1, (e.clientX - r0.left) / r0.width))); };
        b.addEventListener("pointerdown", (e) => { at(e); b.setPointerCapture(e.pointerId); b.onpointermove = at; });
        b.addEventListener("pointerup", () => { b.onpointermove = null; });
      } else {
        b.style.cssText = `--x:700;--y:${cy - 30};--w:218;--h:60`;
        b.innerHTML = "<span>Off</span><span>On</span>";
        b.addEventListener("click", () => setVal(o, !DS.SET[o.id]));
      }
      box.appendChild(b);
    });
    syncSettings();
  }
  function setVal(o, v) {
    if (o.kind === "slider") v = Math.round(Math.max(o.min, Math.min(o.max, v)) * 20) / 20;
    DS.SET[o.id] = v; DS.saveSettings(); applySettings(); syncSettings();
  }
  function stepSetting(b, d) { const o = DS.SETTINGS.find((x) => x.id === b.dataset.set); setVal(o, DS.SET[o.id] + d * 0.05); }
  function syncSettings() {
    DS.SETTINGS.forEach((o, r) => {
      const b = document.querySelector(`#setRows [data-set="${o.id}"]`), lab = document.querySelectorAll("#setRows .setlabel")[r]; if (!b) return;
      if (o.kind === "slider") { const f = (DS.SET[o.id] - o.min) / (o.max - o.min); b.style.setProperty("--f", f); lab.lastChild.textContent = o.show(DS.SET[o.id]); }
      else { b.classList.toggle("on", !!DS.SET[o.id]); lab.lastChild.textContent = DS.SET[o.id] ? "On" : "Off"; }
    });
  }

  // ---------------- Controls on Robert's art: twelve plates round the painted pad (art px), one list per tab ----------------
  const CTL_PLATES = [[215, 307, 190], [205, 375, 205], [190, 445, 195], [185, 513, 200], [200, 584, 190], [200, 654, 195],
    [930, 307, 195], [945, 375, 195], [955, 442, 190], [955, 512, 190], [955, 582, 185], [950, 654, 190]];
  const CTL = {
    keys: [["A / D", "Move"], ["Space / W", "Jump"], ["J / click", "Attack"], ["K / Shift", "Dash"], ["L / R-click", "Ability"], ["F / R", "Flare"],
      ["Q / Tab", "Swap knight"], ["Esc / P", "Pause"], ["W + attack", "Up-swing"], ["S + attack", "Plunge (air)"], ["S + jump", "Drop down"], ["Jump twice", "Double jump"]],
    pad: [["LB / View", "Swap knight"], ["Left stick", "Move"], ["Down + A", "Drop down"], ["D-pad", "Move"], ["LT", "Attack"], ["Menu", "Pause"],
      ["RB", "Dash"], ["Y / RT", "Ability"], ["B", "Dash"], ["Click a stick", "Flare"], ["X", "Attack"], ["A", "Jump (twice: double)"]],
    touch: [["Drag left side", "Move"], ["Up + Attack", "Up-swing"], ["Down + Attack", "Plunge (air)"], ["Down + Jump", "Drop down"], ["II", "Pause"], ["Hold upright", "Autopilot"],
      ["Attack", "Attack (combo)"], ["Jump", "Jump (twice: double)"], ["Dash", "Dash"], ["Ability", "Ability"], ["Flare", "Throw a flare"], ["Settings", "Button size"]],
  };
  let ctlTab = "keys", ctlBack = "pause";
  function syncControls() {
    $("#ctlPlates").innerHTML = CTL[ctlTab].map(([k, a], i) => { const [x, y, w] = CTL_PLATES[i];
      return `<div class="ks cplate" style="--x:${x};--y:${y};--w:${w};--h:43"><b>${k}</b><span>${a}</span></div>`; }).join("");
    document.querySelectorAll("#controls .ctab").forEach((t) => t.classList.toggle("cur", t.dataset.tab === ctlTab));
  }
  function openControls(from) {
    ctlBack = from || open || "pause";
    ctlTab = I.source === "pad" ? "pad" : I.source === "touch" ? "touch" : "keys";
    openMenu("controls");
  }

  // ---------------- the Journal on Robert's book art: a tab per map, six Drowned pages a spread ----------------
  // entry boxes and tabs in art px (assets/ui/journal-screen.jpg)
  const J_BOX = [[550, 185, 415, 130], [550, 340, 415, 130], [550, 500, 415, 135], [1045, 185, 405, 130], [1045, 340, 405, 130], [1045, 500, 405, 135]];
  const J_TAB = [200, 272, 348, 426, 502, 580, 656], J_TABC = ["224,165,60", "60,170,165", "200,50,60", "150,70,190", "230,120,30", "215,80,130", "80,220,150"];
  const J_PER_MAP = 30, J_SPREADS = J_PER_MAP / 6; // 10 levels x 3 pages
  let jMap = 0, jSpread = 0;
  function buildJournal() {
    const tabs = $("#jTabs"); tabs.innerHTML = "";
    DS.MAPS.forEach((m, i) => {
      const t = el("button", "opt jtab");
      t.style.setProperty("--t", J_TAB[i] - 176); t.style.setProperty("--tc", J_TABC[i]);
      const ok = DS.Maps.open(i);
      t.disabled = !ok; t.textContent = ok ? (m.short || m.name.replace(/^The /, "")) : "???";
      t.title = ok ? m.name : "Not reached yet";
      t.addEventListener("click", () => { if (ok) { jMap = i; jSpread = 0; syncJournal(); } });
      tabs.appendChild(t);
    });
    $("#jPrev").onclick = () => { if (jSpread > 0) { jSpread--; syncJournal(); } };
    $("#jNext").onclick = () => { if (jSpread < J_SPREADS - 1) { jSpread++; syncJournal(); } };
  }
  function syncJournal() {
    const have = new Set(DS.Explore.pages()), box = $("#jEntries"); box.innerHTML = "";
    J_BOX.forEach(([x, y, w, h], k) => {
      const n = jSpread * 6 + k, lv = jMap * 10 + Math.floor(n / 3), pg = n % 3, key = lv + ":" + pg, got = have.has(key);
      const e = el("div", "jentry" + (got ? "" : " missing"));
      e.style.cssText = `--l:${x - 550};--t:${y - 185};--bw:${w};--bh:${h}`;
      e.innerHTML = `<b>Level ${lv + 1} · page ${pg + 1}</b>` + (got ? `<span>“${DS.Explore.pageText(key)}”</span>` : "<span>Not found yet. Look up on the high planks and deep in the mist.</span>");
      box.appendChild(e);
    });
    document.querySelectorAll("#jTabs .jtab").forEach((t, i) => t.classList.toggle("cur", i === jMap));
    $("#jPrev").disabled = jSpread === 0; $("#jNext").disabled = jSpread === J_SPREADS - 1;
    const m = DS.MAPS[jMap], found = [...have].filter((k) => Math.floor(+k.split(":")[0] / 10) === jMap).length;
    $("#jPage").innerHTML = `<b style="color:rgb(${m.c})">${m.name}</b> · ${found} of ${J_PER_MAP} pages found`;
    $("#jSpread").textContent = `Levels ${jMap * 10 + jSpread * 2 + 1} and ${jMap * 10 + jSpread * 2 + 2}`;
  }
  function openJournal() {
    const lv = G.level | 0; jMap = Math.min(DS.MAPS.length - 1, Math.floor(lv / 10));
    jSpread = Math.floor(((lv % 10) * 3) / 6);
    openMenu("journalMenu");
  }

  // ---------------- the map select: Robert's spiked badges (src/maps.js) ----------------
  function buildMaps() {
    const row = $("#mapPick"); row.innerHTML = "";
    DS.MAPS.forEach((m, i) => {
      const b = el("button", "opt map");
      b.dataset.map = i;
      b.addEventListener("click", () => {
        if (!DS.Maps.open(i)) { showMapText(i); return; }
        kView = i; DS.Maps.pick(i); syncMaps(); flash(b);
        if (G.player && G.mode !== "title") { close(); DS.restart(); G.mode = "play"; } // mid-run: go there now
      });
      b.addEventListener("focus", () => showMapText(i));
      b.addEventListener("mouseenter", () => showMapText(i));
      row.appendChild(b);
    });
    // the painted arrows step through every map: an open one is picked, a shut one is shown as "???" with how to open
    // it (so the maps past the six painted rings, from the Jade Hollow on, can always be seen)
    for (const a of document.querySelectorAll("#kits .karrow")) a.addEventListener("click", () => {
      const n = DS.MAPS.length, d = +a.dataset.d, i = ((kView >= 0 ? kView : DS.Maps.picked()) + d + n) % n;
      kView = i;
      if (DS.Maps.open(i)) document.querySelector(`#mapPick .map[data-map="${i}"]`).click();
      else { syncMaps(); showMapText(i); }
    });
    syncMaps();
  }
  const K_RINGS = 6; // rings painted on the knight screen; with more maps (the Jade Hollow, map 7) the strip pages, six at a time
  let kView = -1; // the map the arrows last stepped to (-1: the picked one); its page is shown
  function syncMaps() {
    const cur = DS.Maps.picked(), page = Math.floor((kView >= 0 ? kView : cur) / K_RINGS);
    for (const b of document.querySelectorAll("#mapPick .map")) {
      const i = +b.dataset.map, m = DS.MAPS[i], on = DS.Maps.open(i);
      b.hidden = Math.floor(i / K_RINGS) !== page;
      b.classList.toggle("locked", !on); b.classList.toggle("sel", on && i === cur);
      b.style.setProperty("--mc", m.c);
      b.innerHTML = `<span class="hole"><img alt="" src="${DS.Maps.badge(i)}"></span><span>${on ? m.short || m.name : "???"}</span>`;
      if (m.ring) { // centred on its ring in the art (the strip starts at art x 490, y 98 and is 1056 x 200)
        b.style.left = (m.ring[0] - 490) / 1056 * 100 + "%"; b.style.top = (m.ring[1] - 98) / 200 * 100 + "%";
        const img = b.querySelector("img"); img.style.setProperty("--ex", m.em[0]); img.style.setProperty("--ey", m.em[1]);
        b.style.setProperty("--ly", 195 - m.ring[1]); // names on one line whatever the ring's height
      }
    }
    showMapText(cur);
  }
  function showMapText(i) {
    const m = DS.MAPS[i];
    info("#mapText", DS.Maps.open(i) ? `<b style="color:rgb(${m.c})">${m.name}</b> · levels ${i * 10 + 1} to ${i * 10 + 10}`
      : `<b>???</b> · Reach level ${i * 10 + 1} to open this map.`);
  }

  // ---------------- upgrades: currencies from src/loot.js ----------------
  const L = () => DS.Loot;
  const chip = (k, n, ok) => `<span class="chip${ok === false ? " short" : ""}"><img alt="" src="${L().icon(k)}">${n}</span>`;
  function buildWallet(box, bag) {
    box.innerHTML = DS.CUR_ORDER.map((k) => `<span class="coin" title="${DS.CURRENCY[k].name}" style="--cc:${DS.CURRENCY[k].c}"><img alt="" src="${L().icon(k)}"><b>${bag ? bag[k] | 0 : L().have(k)}</b><i>${DS.CURRENCY[k].name}</i></span>`).join("");
  }
  function buildUpgrades() {
    buildWallet($("#wallet"));
    const list = $("#upList"); list.innerHTML = "";
    DS.UPGRADES.forEach((u, row) => {
      const r = L().rank(u.id), max = r >= L().MAX_RANK, c = L().cost(u.id);
      // Robert's forge art paints three cost plates on rows 1, 3 and 5 and two on the others
      const b = el("button", "opt upg" + (row % 2 ? " two" : " three") + (max ? " max" : L().canBuy(u.id) ? " can" : ""));
      b.dataset.up = u.id;
      // the art paints 9 diamonds: ranks 1-9 light them, rank 10 (max) makes them all glow
      const pips = Array.from({ length: 9 }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
      const costs = max ? "<span class=\"chip maxed\">Max rank</span>" : Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => chip(k, n, L().have(k) >= n)).join("");
      b.innerHTML = `<img class="mat" alt="" src="${L().icon(u.mat)}"><span class="un"><b>${u.name}</b><span class="ef">${r ? u.text(r) : "no ranks yet"}${max ? "" : " → " + u.text(r + 1)}</span></span><span class="pips">${pips}</span><span class="cost">${costs}</span>`;
      b.addEventListener("click", () => {
        if (L().buy(u.id)) { $("#upText").innerHTML = `<b>${u.name}</b> rank ${L().rank(u.id)}: ${u.text(L().rank(u.id))}.`; const f = focus; buildUpgrades(); focus = f; setFocus(); }
        else $("#upText").textContent = max ? `${u.name} is at its highest rank.` : `Not enough yet. ${DS.CURRENCY[u.mat].name} and Gold drop from the Drowned; Amethyst from bosses.`;
      });
      b.addEventListener("focus", () => showUpText(u));
      b.addEventListener("mouseenter", () => showUpText(u));
      list.appendChild(b);
    });
  }
  function showUpText(u) { $("#upText").innerHTML = `<b>${u.name}</b> takes Gold and ${DS.CURRENCY[u.mat].name}. Each rank: ${u.text(1)}.`; }
  function openUpgrades(from) {
    back = from || open || "kits"; openMenu("upgrades");
    $("#upText").textContent = "Spend what the Drowned drop on lasting upgrades for every knight. Ranks 6 to 10 also take Amethyst.";
  }
  // what the wallpaper gathered: taken into the wallet as the screen opens
  function showHaul(from) {
    const got = L().collect(); if (!got) return false;
    const mins = got.since ? Math.round((Date.now() - got.since) / 60000) : 0;
    $("#haulSub").textContent = "Your wallpaper kept fighting" + (mins > 1 ? ` (since ${mins >= 120 ? Math.round(mins / 60) + " hours" : mins + " minutes"} ago)` : "") + " and gathered this for you.";
    buildWallet($("#haulList"), got);
    for (const c of [...$("#haulList").children]) if (c.querySelector("b").textContent === "0") c.remove();
    back = from || "kits"; openMenu("haul");
    return true;
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
    $("#btnUpPause").onclick = () => openUpgrades("pause");
    $("#btnUpKits").onclick = () => openUpgrades("kits");
    $("#btnUpBack").onclick = () => openMenu(back || "kits");
    $("#btnHaulOk").onclick = () => openMenu(back || "kits");
    $("#btnHaulUp").onclick = () => openUpgrades(back || "kits");
    $("#btnRich").onclick = (e) => { for (const k of DS.CUR_ORDER) DS.Loot.give(k, 500); flash(e.target); };
    $("#btnUnlocks").onclick = (e) => { // cycles the tester's view; the saved progress is never touched
      const M = DS.Unlock.MODES; DS.Unlock.setMode(M[(M.indexOf(DS.Unlock.mode()) + 1) % M.length]); refreshUnlocks(); flash(e.target);
    };
    $("#kitWinLater").onclick = () => kitWinDone(false);
    $("#kitWinTake").onclick = () => kitWinDone(true);
    $("#btnWallStart").onclick = () => { close(); G.mode = "play"; DS.setWall(true); };
    $("#btnUpReset").onclick = (e) => { DS.Loot.resetAll(); flash(e.target); };
    $("#btnWave").onclick = (e) => {
      if (G.scroll) { for (const en of G.enc) if (!en.boss) en.on = true; const p = G.player; p.x = G.bossX - 200; p.y = DS.World.FLOOR - 200; p.vx = p.vy = 0; G.foes = G.foes.filter((f) => f.d.dummy); }
      else { G.waveT = 0; G.foes = G.foes.filter((f) => f.d.dummy); G.waves = true; }
      syncToggles(); flash(e.target);
    };
    $("#btnClear").onclick = (e) => { G.foes = []; G.shots = []; flash(e.target); };
    $("#btnWaves").onclick = () => { DS.setScroll(!G.scroll); DS.restart(); close(); G.mode = "play"; };
    $("#btnGod").onclick = () => { G.god = !G.god; syncToggles(); };
    $("#btnBoxes").onclick = () => { G.boxes = !G.boxes; syncToggles(); };
    $("#btnRestart").onclick = () => confirmBox(G.scroll ? "Start this map again from its first level?" : "Restart the arena?", "Restart", () => { DS.restart(); close(); G.mode = "play"; });
    $("#confirmNo").onclick = () => openMenu(cBack || "pause");
    $("#confirmYes").onclick = () => { const f = cYes; cYes = null; if (f) f(); };
    $("#btnTryAgain").onclick = () => { DS.respawn(); close(); G.mode = "play"; };
    $("#btnDeathKits").onclick = () => { DS.respawn(); openMenu("kits"); };
    $("#btnClearNext").onclick = () => { close(); DS.nextLevel(); G.mode = "play"; };
    $("#btnClearUp").onclick = () => openUpgrades("cleared");
    $("#btnGrow").onclick = (e) => { if (G.fam) { const d = DS.Fam.def(); DS.Fam.grow((G.fam.form + 1) % d.forms.length); } flash(e.target); };
    $("#btnWall").onclick = () => openWallMenu(); // pick its level, then start it
    for (const b of document.querySelectorAll("#wallMenu .wback")) b.addEventListener("click", () => openMenu("pause"));
    $("#btnSettings").onclick = () => openMenu("settings");
    $("#btnSetControls").onclick = () => openControls("settings");
    for (const t of document.querySelectorAll("#controls .ctab")) t.addEventListener("click", () => { ctlTab = t.dataset.tab; syncControls(); });
    for (const b of document.querySelectorAll("#controls .cback")) b.addEventListener("click", () => openMenu(ctlBack));
    $("#btnJournal").onclick = () => openJournal(); // Drowned pages found so far (src/explore.js)
    for (const b of document.querySelectorAll("#pause .resume")) b.addEventListener("click", () => { close(); G.mode = "play"; });
    buildCodePad();
    syncToggles();
  }
  // the pause art's right-hand panel: Journal, Controls or the tester keypad (one at a time), and the tester tools
  function panel(sel) {
    for (const id of ["#codePad"]) $(id).hidden = id !== sel;
    syncPanel();
  }
  function syncPanel() { $("#pPanel").hidden = ["#codePad", "#devTools"].every((id) => $(id).hidden); }

  // ---------------- the tester code (src/data.js DS.TESTER): a keypad the pad, keys and touch can all use ----------------
  let code = "";
  function buildCodePad() {
    const row = $("#codePad .keyRow"); row.innerHTML = "";
    for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "Clear", "OK"]) {
      const b = el("button", "opt small key", k);
      b.addEventListener("click", () => press(k));
      row.appendChild(b);
    }
    $("#btnCode").onclick = () => {
      if (DS.TESTER) { setTester(false); return; }
      const was = $("#codePad").hidden; panel(was ? "#codePad" : null); code = ""; showCode("Enter the tester code");
    };
    addEventListener("keydown", (e) => {
      if (open !== "pause" || $("#codePad").hidden) return;
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) press(e.code.slice(-1));
      else if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); press("OK"); }
      else if (e.code === "Backspace") { e.stopPropagation(); code = code.slice(0, -1); showCode(); } // not "back" (closes the menu)
    }, true); // capture, so it runs before src/input.js sees the key
  }
  function showCode(msg) { $("#codeShow").textContent = msg || (code ? "• ".repeat(code.length).trim() : "Enter the tester code"); }
  function press(k) {
    if (k === "Clear") { code = ""; showCode(); return; }
    if (k !== "OK") { if (code.length < 8) code += k; showCode(); if (code.length < DS.TESTER_CODE.length) return; }
    if (code === DS.TESTER_CODE) { setTester(true); return; }
    if (k === "OK" || code.length >= DS.TESTER_CODE.length) { code = ""; showCode("Wrong code"); }
  }
  function setTester(on) {
    DS.TESTER = on;
    try { if (on) localStorage.setItem("dl-side-tester", "1"); else localStorage.removeItem("dl-side-tester"); } catch (e) { /* storage blocked */ }
    code = ""; panel(null);
    if (!on) { // put the run back the way a player has it
      G.god = false; G.boxes = false;
      if (!G.scroll) { DS.setScroll(true); DS.restart(); }
    }
    refreshUnlocks(); // a tester's view of the unlocks ends with the tools
  }
  function syncToggles() {
    $("#devTools").hidden = !DS.TESTER; syncPanel();
    $("#btnUnlocks").textContent = "Lock/unlock knights, familiars, maps: " + UNLOCK_NAMES[DS.Unlock.mode()];
    $("#btnCode").textContent = DS.TESTER ? "Lock tester tools" : "Tester code";
    $("#btnJournal").textContent = "Journal (" + DS.Explore.pages().length + " pages)";
    $("#btnWaves").textContent = G.scroll ? "Switch to the arena" : "Switch to the scrolling level";
    $("#btnWave").textContent = G.scroll ? "Skip to the boss" : "Next wave now";
    $("#btnRestart").textContent = G.scroll ? "Restart level" : "Restart arena";
    $("#btnGod").textContent = "God mode: " + (G.god ? "on" : "off");
    $("#btnBoxes").textContent = "Hitboxes: " + (G.boxes ? "on" : "off");
  }
  function flash(b) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 300); }

  function openMenu(name) {
    const over = name === "confirm"; // a pop-up sits over its menu
    for (const m of document.querySelectorAll(".menu")) m.hidden = m.id !== name && !(over && m.id === open);
    open = name; focus = 0;
    if (name === "pause") { panel(null); syncToggles(); }
    if (name === "wallMenu") syncWall(); // (it puts the focus on the picked slot)
    if (name === "famWin") buildFamWin();
    if (name === "upgrades") buildUpgrades();
    if (name === "journalMenu") { buildJournal(); syncJournal(); }
    if (name === "death") syncDeath();
    if (name === "settings") buildSettings();
    if (name === "controls") { syncControls(); focus = Math.max(0, opts().findIndex((b) => b.dataset.tab === ctlTab)); }
    if (name === "cleared") syncCleared();
    if (name === "kits") syncMaps();
    syncFams();
    if (G.mode === "play") G.mode = "menu";
    if (name === "kits") {
      syncKits(); showKitText(G.kit);
      focus = Math.max(0, opts().findIndex((b) => b.dataset.kit === G.kit));
      for (const b of document.querySelectorAll("#kits .back")) b.disabled = !G.player || G.mode === "title";
    }
    setFocus();
  }
  function close() {
    for (const m of document.querySelectorAll(".menu")) m.hidden = true;
    open = null;
  }
  function opts() { return open ? [...document.querySelectorAll(`#${open} .opt`)].filter((b) => b.offsetParent && !b.disabled) : []; }
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
    for (const [a, dx, dy] of dirs) if (I.p[a] || (I.h[a] && navT < -0.25)) { const fb = opts()[focus]; if (dx && fb && fb.classList.contains("sld")) stepSetting(fb, dx); else nav(dx, dy); navT = 0; if (I.h[a] && !I.p[a]) navT = -0.15; }
    if (I.p.confirm && I.source !== "keys") { const o = opts(); if (o[focus]) o[focus].click(); }
    if (I.p.back || I.p.pause) {
      if (open === "kits" && G.mode === "title") return;
      if (open === "famWin") return; // the reward has to be chosen
      if (open === "upgrades" || open === "haul") { openMenu(back || "kits"); return; }
      if (open === "journalMenu" || open === "settings") { openMenu("pause"); return; }
      if (open === "controls") { openMenu(ctlBack); return; }
      if (open === "confirm") { openMenu(cBack || "pause"); return; }
      if (open === "kitWin") { kitWinDone(false); return; }
      if (open === "wallMenu") { openMenu("pause"); return; }
      if (open === "death" || open === "cleared") return; // choose a button
      if (open === "kits") { openMenu("pause"); return; }
      close(); G.mode = "play";
    }
  }

  function cycleKit(d) {
    const list = DS.Unlock.kits(), i = list.indexOf(G.kit), n = list.length; // only the knights won so far
    if (!n) return;
    const id = list[(i + d + n) % n];
    DS.switchKit(id);
    G.banner = { txt: DS.KITS[id].name, t: 0.4 };
  }

  function init() {
    try { const k = localStorage.getItem("dl-side-kit"); if (k && DS.KITS[k]) G.kit = k; } catch (e) { /* storage blocked */ }
    G.kit = DS.Unlock.usableKit(G.kit); // a saved knight that is still locked (an old save) falls back to the Lantern Blade
    DS.Fam.load();
    buildKits(); buildPause(); buildFams(); buildMaps();
    $("#pauseBtn").addEventListener("click", () => { if (G.mode === "play") openMenu("pause"); });
    document.querySelectorAll(".menu .back").forEach((b) => b.addEventListener("click", () => openMenu("pause")));
    DS.Input.bindMouse(document.getElementById("game"));
    DS.Input.bindTouch(document.body, $("#stick"), $("#knob"));
    // a tap or click leaves the wallpaper for the pause menu (not when opened as ?wallpaper by a wallpaper app)
    document.addEventListener("pointerdown", (e) => {
      if (!G.wall || G.wallLocked || G.mode !== "play" || e.target.closest(".menu")) return;
      DS.setWall(false); openMenu("pause"); showHaul("pause");
    });
    $("#ver").textContent = "v" + DS.VERSION;
    fullscreen();
    applySettings();
    openMenu("kits");
    showHaul("kits"); // what the wallpaper gathered since last time
    // the desktop and phone apps keep the game open behind the wallpaper: check again whenever it comes back
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || G.wall || G.mode === "title" || open === "haul" || open === "famWin") return;
      if (L().haul().gold || Object.keys(L().haul()).length > 1) { if (G.mode === "play") G.mode = "menu"; showHaul(open || "pause"); }
    });
  }

  // ---------------- Full screen, like a real game ----------------
  // In a browser the page asks for full screen on the first click, tap or key press (browsers only allow it after one);
  // F11 is the browser's own toggle. Chrome also lets the game keep Esc (it pauses), so Esc held down leaves full screen.
  // The Windows app opens its window full screen itself (desktop/Program.cs, F11 or Alt+Enter toggles) and the Android
  // app hides the system bars (GameActivity.immersive), so neither page asks; nor does a page a wallpaper app opened.
  function fullscreen() {
    const d = document.documentElement, app = !!(window.chrome && window.chrome.webview) || /; wv\)/.test(navigator.userAgent);
    if (app || !d.requestFullscreen) return; // iPhone Safari has no full screen for pages
    const go = (e) => {
      if (G.wallLocked || document.fullscreenElement || (e.type === "keydown" && e.key === "F11")) return;
      removeEventListener("pointerup", go, true); removeEventListener("keydown", go, true);
      d.requestFullscreen({ navigationUI: "hide" }).then(() => {
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {});
      }).catch(() => { /* refused: carry on in the window */ });
    };
    addEventListener("pointerup", go, true); addEventListener("keydown", go, true);
  }

  DS.UI = { init, update, open: openMenu, close, cycleKit, showHaul, kitWin };
})(window.DS = window.DS || {});
