/* Input: keyboard, mouse, Xbox pad (standard Gamepad mapping) and touch, merged into one state.
   DS.Input.poll() once a frame; then read held (I.x, I.down, I.jump...) and pressed-this-frame (I.p.jump...). */
"use strict";
(function (DS) {
  const ACTIONS = ["jump", "attack", "dash", "ability", "pause", "kit", "up", "down", "left", "right", "confirm", "back", "flare"];
  const KEYS = {
    jump: ["Space", "KeyW", "ArrowUp", "KeyZ"], attack: ["KeyJ", "KeyX"], dash: ["KeyK", "ShiftLeft", "ShiftRight", "KeyC"],
    ability: ["KeyL", "KeyV", "KeyE"], pause: ["Escape", "KeyP"], kit: ["Tab", "KeyQ"],
    up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
    confirm: ["Enter", "Space", "KeyJ"], back: ["Escape", "Backspace"], flare: ["KeyF", "KeyR"],
  };
  // pad buttons: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu, 12-15 D-pad
  const PAD = { jump: [0], attack: [2, 6], dash: [1, 5], ability: [3, 7], pause: [9], kit: [4, 8], up: [12], down: [13], left: [14], right: [15], confirm: [0], back: [1], flare: [10, 11] }; // flare: click either stick

  const keys = new Set(), tapped = new Set(); // tapped latches a key pressed and released within one frame
  const touch = { x: 0, y: 0, b: {}, tap: {} }; // tap latches a press so a very quick tap is never missed between frames // virtual stick and buttons
  const mouse = { attack: false, ability: false };
  const I = { x: 0, y: 0, p: {}, r: {}, h: {}, source: "keys", padName: "" };
  let prev = {};

  addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    keys.add(e.code); if (!e.repeat) tapped.add(e.code); I.source = "keys";
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  function bindMouse(canvas) {
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) mouse.attack = true;
      if (e.button === 2) mouse.ability = true;
      I.source = "keys";
    });
    addEventListener("mouseup", (e) => { if (e.button === 0) mouse.attack = false; if (e.button === 2) mouse.ability = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Touch: the left 45% of the screen is a floating stick, the buttons are DOM elements with data-act.
  function bindTouch(root, stickEl, knobEl) {
    let stickId = null, ox = 0, oy = 0;
    root.addEventListener("touchstart", (e) => {
      I.source = "touch"; document.body.classList.add("touch");
      for (const t of e.changedTouches) {
        let b = t.target.closest && t.target.closest("[data-act]");
        // a touch on the right side that misses every button goes to the nearest one (fat thumbs, app bars over the edge)
        if (!b && t.clientX > innerWidth * 0.5 && !t.target.closest("button,.menu")) b = nearestButton(root, t.clientX, t.clientY);
        if (b) { touch.b[b.dataset.act] = t.identifier; touch.tap[b.dataset.act] = true; b.classList.add("on"); continue; }
        if (stickId === null && t.clientX < innerWidth * 0.45 && !t.target.closest("button,.menu")) {
          stickId = t.identifier; ox = t.clientX; oy = t.clientY;
          stickEl.style.left = ox + "px"; stickEl.style.top = oy + "px"; stickEl.classList.add("on");
          knobEl.style.transform = "translate(-50%,-50%)";
        }
      }
      if (!e.target.closest(".menu, #pauseBtn")) e.preventDefault();
    }, { passive: false });
    root.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) {
        let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy), m = 46;
        if (d > m) { dx *= m / d; dy *= m / d; }
        touch.x = dx / m; touch.y = dy / m;
        knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      if (!e.target.closest(".menu")) e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; touch.x = touch.y = 0; stickEl.classList.remove("on"); }
        for (const a in touch.b) if (touch.b[a] === t.identifier) {
          delete touch.b[a];
          const el = root.querySelector(`[data-act="${a}"]`); if (el) el.classList.remove("on");
        }
      }
    };
    root.addEventListener("touchend", end); root.addEventListener("touchcancel", end);
  }

  function nearestButton(root, x, y) {
    let best = null, bd = 1e9;
    for (const b of root.querySelectorAll("#touch [data-act]")) {
      const r = b.getBoundingClientRect(); if (!r.width) continue;
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bd) { bd = d; best = b; }
    }
    return bd < 160 ? best : null;
  }

  function pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of list) if (g && g.connected) return g;
    return null;
  }

  function poll() {
    const g = pad();
    const now = {}, fresh = {};
    for (const a of ACTIONS) {
      now[a] = KEYS[a].some((k) => keys.has(k) || tapped.has(k) && !prev[a]);
      // a new key-down counts as a press even while another key of the same action is held:
      // W and Up are both "up" and "jump", so holding W to aim or walk used to swallow every Space press
      fresh[a] = KEYS[a].some((k) => tapped.has(k));
    }
    tapped.clear();
    now.attack = now.attack || mouse.attack; now.ability = now.ability || mouse.ability;
    let x = (now.right ? 1 : 0) - (now.left ? 1 : 0), y = (now.down ? 1 : 0) - (now.up ? 1 : 0);
    if (g) {
      I.padName = g.id;
      const btn = (i) => g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.4);
      let any = false;
      for (const a of ACTIONS) if (PAD[a] && PAD[a].some(btn)) { now[a] = true; any = true; }
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (Math.abs(ax) > 0.25) { x = ax; any = true; }
      if (Math.abs(ay) > 0.35) { y = ay; any = true; }
      if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) y = -1; if (btn(13)) y = 1;
      if (ay < -0.6) now.up = true; if (ay > 0.6) now.down = true;
      if (ax < -0.6) now.left = true; if (ax > 0.6) now.right = true;
      if (any) I.source = "pad";
    }
    if (I.source === "touch") {
      if (Math.abs(touch.x) > 0.25) x = touch.x;
      if (Math.abs(touch.y) > 0.45) y = touch.y;
      for (const a in touch.b) now[a] = true;
      for (const a in touch.tap) if (!prev[a]) now[a] = true;
      if (touch.y < -0.6) now.up = true; if (touch.y > 0.6) now.down = true;
      if (touch.x < -0.6) now.left = true; if (touch.x > 0.6) now.right = true;
    }
    touch.tap = {};
    I.x = Math.max(-1, Math.min(1, x)); I.y = Math.max(-1, Math.min(1, y));
    for (const a of ACTIONS) { I.p[a] = now[a] && (!prev[a] || fresh[a]); I.r[a] = !now[a] && prev[a]; I.h[a] = now[a]; }
    prev = now;
  }

  // A rumble on pads that support it (Chrome's dual-rumble); harmless elsewhere.
  function rumble(strong, weak, ms) {
    if (DS.SET && !DS.SET.rumble) return;
    const g = pad();
    try { if (g && g.vibrationActuator) g.vibrationActuator.playEffect("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* not supported */ }
  }

  DS.Input = Object.assign(I, { poll, bindMouse, bindTouch, rumble, hasPad: () => !!pad() });
})(window.DS = window.DS || {});
