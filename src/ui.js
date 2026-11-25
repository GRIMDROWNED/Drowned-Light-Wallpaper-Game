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
      const k = DS.KITS[id];
      const b = el("button", "kit opt");
      b.style.setProperty("--kc", k.color); b.dataset.kit = id;
      // head-and-chest portrait cut from the knight's front picture (tools/cut_portraits.py); the side sprite if there is none
      b.innerHTML = `<span class="por"><img alt="" src="assets/ui/portraits/${id}.png?v=${DS.VERSION}" onerror="this.onerror=null;this.src='assets/${k.sprite.folder}/right.png?v=${DS.VERSION}';this.className='px'"></span>
        <span class="info"><b>${k.name}</b><span class="tag">${k.tag}</span>
        <span class="row"><i>Attack:</i> ${k.attack.name}</span><span class="row"><i>Ability:</i> ${k.ability.name}</span></span>`;
      b.title = k.ability.text + "\n" + k.passiveText;
      b.addEventListener("click", () => pickKit(id));
      b.addEventListener("focus", () => showKitText(id));
      b.addEventListener("mouseenter", () => showKitText(id));
      grid.appendChild(b);
    });
    showKitText(G.kit);
  }
  // the knight screen has one info bar: it shows the knight, map or familiar last pointed at
  function info(sel, html) { const e = $(sel); e.innerHTML = html; for (const p of e.parentNode.children) p.classList.toggle("cur", p === e); }
  function showKitText(id) {
    const k = DS.KITS[id];
    info("#kitText", `<b style="color:rgb(${k.color})">${k.name}</b> · ${k.attack.name} · <b style="color:rgb(${k.color})">${k.ability.name}:</b> ${k.ability.text} <span class="pas">${k.passiveText}</span>`);
  }
  function syncKits() { for (const b of document.querySelectorAll("#kitGrid .kit")) b.classList.toggle("cur", b.dataset.kit === G.kit); }
  function pickKit(id) {
    close();
    if (G.player && G.mode !== "title") DS.switchKit(id); else { G.kit = id; DS.restart(); }
    G.mode = "play";
  }

  // the familiar picker: one row on the knight screen, one in the pause menu
  function buildFams() {
    for (const row of [$("#famPick"), $("#famPause")]) {
      row.innerHTML = "";
      for (const id of [null].concat(DS.FAM_ORDER)) {
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
      b.innerHTML = `<span class="fwpic"><img alt="" src="assets/${d.forms[0].sprite.folder}/right.png?v=${DS.VERSION}"></span><b>${d.name}</b><span class="fwtext">${have ? "Already at your side." : d.text}</span>`;
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

  // ---------------- the Journal on Robert's book art: a tab per map, six Drowned pages a spread ----------------
  // entry boxes and tabs in art px (assets/ui/journal-screen.jpg)
  const J_BOX = [[550, 185, 415, 130], [550, 340, 415, 130], [550, 500, 415, 135], [1045, 185, 405, 130], [1045, 340, 405, 130], [1045, 500, 405, 135]];
  const J_TAB = [200, 272, 348, 426, 502, 580], J_TABC = ["224,165,60", "60,170,165", "200,50,60", "150,70,190", "230,120,30", "215,80,130"];
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
        DS.Maps.pick(i); syncMaps(); flash(b);
        if (G.player && G.mode !== "title") { close(); DS.restart(); G.mode = "play"; } // mid-run: go there now
      });
      b.addEventListener("focus", () => showMapText(i));
      b.addEventListener("mouseenter", () => showMapText(i));
      row.appendChild(b);
    });
    // the painted arrows step through the open maps
    for (const a of document.querySelectorAll("#kits .karrow")) a.addEventListener("click", () => {
      const n = DS.MAPS.length, d = +a.dataset.d; let i = DS.Maps.picked();
      for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (DS.Maps.open(i)) break; }
      document.querySelector(`#mapPick .map[data-map="${i}"]`).click();
    });
    syncMaps();
  }
  function syncMaps() {
    const cur = DS.Maps.picked();
    for (const b of document.querySelectorAll(".map")) {
      const i = +b.dataset.map, m = DS.MAPS[i], on = DS.Maps.open(i);
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
    $("#btnMaps").onclick = (e) => { DS.Maps.unlockAll(); syncMaps(); flash(e.target); };
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
    $("#btnRestart").onclick = () => { DS.restart(); close(); G.mode = "play"; };
    $("#btnGrow").onclick = (e) => { if (G.fam) { const d = DS.Fam.def(); DS.Fam.grow((G.fam.form + 1) % d.forms.length); } flash(e.target); };
    $("#btnWinFams").onclick = (e) => { DS.Fam.winAll(); syncFams(); flash(e.target); };
    $("#btnWall").onclick = () => { close(); G.mode = "play"; DS.setWall(true); };
    $("#btnHelp").onclick = () => panel($("#help").hidden ? "#help" : null);
    $("#btnJournal").onclick = () => openJournal(); // Drowned pages found so far (src/explore.js)
    for (const b of document.querySelectorAll("#pause .resume")) b.addEventListener("click", () => { close(); G.mode = "play"; });
    buildCodePad();
    syncToggles();
  }
  // the pause art's right-hand panel: Journal, Controls or the tester keypad (one at a time), and the tester tools
  function panel(sel) {
    for (const id of ["#help", "#codePad"]) $(id).hidden = id !== sel;
    syncPanel();
  }
  function syncPanel() { $("#pPanel").hidden = ["#help", "#codePad", "#devTools"].every((id) => $(id).hidden); }

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
    code = ""; $("#codePad").hidden = true; syncPanel();
    if (!on) { // put the run back the way a player has it
      G.god = false; G.boxes = false;
      if (!G.scroll) { DS.setScroll(true); DS.restart(); }
    }
    syncToggles();
  }
  function syncToggles() {
    $("#devTools").hidden = !DS.TESTER; syncPanel();
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
    for (const m of document.querySelectorAll(".menu")) m.hidden = m.id !== name;
    open = name; focus = 0;
    if (name === "pause") syncToggles();
    if (name === "famWin") buildFamWin();
    if (name === "upgrades") buildUpgrades();
    if (name === "journalMenu") { buildJournal(); syncJournal(); }
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
    for (const [a, dx, dy] of dirs) if (I.p[a] || (I.h[a] && navT < -0.25)) { nav(dx, dy); navT = 0; if (I.h[a] && !I.p[a]) navT = -0.15; }
    if (I.p.confirm && I.source !== "keys") { const o = opts(); if (o[focus]) o[focus].click(); }
    if (I.p.back || I.p.pause) {
      if (open === "kits" && G.mode === "title") return;
      if (open === "famWin") return; // the reward has to be chosen
      if (open === "upgrades" || open === "haul") { openMenu(back || "kits"); return; }
      if (open === "journalMenu") { openMenu("pause"); return; }
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
    openMenu("kits");
    showHaul("kits"); // what the wallpaper gathered since last time
    // the desktop and phone apps keep the game open behind the wallpaper: check again whenever it comes back
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || G.wall || G.mode === "title" || open === "haul" || open === "famWin") return;
      if (L().haul().gold || Object.keys(L().haul()).length > 1) { if (G.mode === "play") G.mode = "menu"; showHaul(open || "pause"); }
    });
  }

  DS.UI = { init, update, open: openMenu, close, cycleKit, showHaul };
})(window.DS = window.DS || {});
