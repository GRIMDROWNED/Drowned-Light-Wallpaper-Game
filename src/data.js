/* Drowned Light: Side View — numbers and sprite lists.
   Every kit keeps its main-game name, attack and ability; numbers are tuned for a fast side-on fight.
   Sprites are the main game's side frames (facing right). `feet` = [x, y] of the foot point in file pixels;
   a frame without one gets its feet guessed from its lowest opaque pixels (src/sprites.js). */
"use strict";
(function (DS) {
  DS.VERSION = "0.2.2";

  // Physics and the player's movement (px, px/s, px/s²)
  DS.PHYS = {
    gravity: 2100, maxFall: 950, speed: 250, accel: 2600, airAccel: 1900, friction: 2600,
    jump: 720, doubleJump: 640, coyote: 0.1, buffer: 0.13, cut: 0.45,
    dashSpeed: 700, dashTime: 0.17, dashCd: 0.35, dashInv: 0.2,
    plungeSpeed: 1150, plungeDmg: 1.4, plungeR: 90,
    hurtInv: 0.7, hp: 140,
  };

  // Shorthands for sprite lists: "side/walk" + 1..4 etc.
  const seq = (p, n, from = 1) => Array.from({ length: n }, (_, i) => p + (from + i));
  const pick = (p, idx) => idx.map((i) => p + i);
  const std = (folder, walkFeet, extra = {}) => Object.assign({
    folder: "knights/" + folder,
    idle: ["right"], run: seq("side/walk", 4), jump: ["side/walk2"], fall: ["side/walk4"],
    attack: ["attackA", "attackB", "attackC"], hurt: ["side/hurt"], death: ["side/death"],
    dash: ["side/dash"], cast: ["attackC"],
    feet: Object.fromEntries(seq("side/walk", 4).map((f) => [f, walkFeet])),
  }, extra);

  DS.KITS = {
    lanternBlade: {
      name: "Lantern Blade", tag: "Kit 01", color: "255,197,106",
      sprite: std("lantern-knight", [44, 80]),
      attack: { type: "arc", name: "Blade Arc", dmg: 12, range: 70, h: 64, cd: 0.32, kb: 220 },
      dashStrike: { dmg: 10, name: "Lantern Strike" },
      ability: { id: "illuminate", name: "Illuminate", cd: 9, radius: 160, dmg: 22, burn: 6, dur: 4,
        text: "A burst of firelight that burns and hurls back the Drowned, then a sanctuary that keeps them out." },
      passiveText: "Lantern Strike: your dash cuts every Drowned you pass through.",
    },
    pikeWarden: {
      name: "Dragon Spear", tag: "Kit 02", color: "220,60,80",
      sprite: std("pike-warden", [46, 101], { dash: ["attackB"] }),
      attack: { type: "thrust", name: "Spear Thrust", dmg: 15, range: 116, h: 30, cd: 0.42, kb: 280 },
      stance: { after: 0.35, guard: 0.25, dmg: 1.15 },
      ability: { id: "lunge", name: "Dragon Lunge", cd: 8, dmg: 24, kb: 380, reach: 420, speed: 900, coil: 0.3, r: 44,
        text: "A crimson spirit dragon coils, then lunges far ahead, hurling back every Drowned and tearing arrows from the air." },
      passiveText: "Stable Form: stand still a moment to take 25% less damage, shrug off knockback and thrust 15% harder.",
    },
    ashenArbalist: {
      name: "Ashen Arbalist", tag: "Kit 03", color: "220,225,235",
      sprite: std("ashen-arbalist", [37, 83], { cast: ["side/castA", "side/castB"] }),
      attack: { type: "bolt", name: "Piercing Bolt", dmg: 14, range: 520, cd: 0.42, pierce: 1, speed: 900, far: { from: 120, to: 420, bonus: 0.35 } },
      ability: { id: "scatter", name: "Scatter Shot", cd: 7, count: 7, dmg: 12, spread: 0.5, flare: 8,
        text: "Kneel and loose a fan of bolts. Where each lands, light flares and burns." },
      passiveText: "Quiet Light: bolts strike up to 35% harder the farther they fly.",
    },
    relicBearer: {
      name: "Frostweaver", tag: "Kit 04", color: "150,210,255",
      sprite: std("ice-mage", [53, 106], { dash: ["side/walk3"], feet: Object.assign(Object.fromEntries(seq("side/walk", 4).map((f) => [f, [53, 106]])),
        { right: [48, 105], attackA: [48, 103], attackB: [40, 94], attackC: [41, 102] }) }),
      attack: { type: "frost", name: "Frost Bolt", dmg: 13, range: 460, cd: 0.4, speed: 640, chill: 1.4 },
      ability: { id: "icebomb", name: "Ice Bomb", cd: 8, radius: 150, dmg: 30, kb: 160, freeze: 2.2, vx: 520, vy: -560,
        text: "Lob a bomb of ice that bursts over a wide area, striking and freezing every Drowned in the blast." },
      passiveText: "Frost Bolt chills: the Drowned it hits move and swing slower.",
    },
    flameBastion: {
      name: "Flame Bastion", tag: "Kit 05", color: "255,120,50",
      sprite: {
        folder: "knights/flame-bastion",
        idle: pick("side/idle", [1, 1, 1, 2, 2, 2]), run: seq("side/step", 8), jump: ["side/step3"], fall: ["side/step7"],
        attack: pick("side/cleave", [1, 2, 3, 5, 6, 7, 8]), hurt: ["side/hurt"], death: ["side/death"],
        dash: ["side/step4"], cast: seq("side/plant", 8),
        feet: Object.assign({}, ...[["side/idle", [32, 105], 8], ["side/step", [39, 96], 8], ["side/cleave", [67, 134], 8], ["side/plant", [42, 135], 8]]
          .map(([p, xy, n]) => Object.fromEntries(seq(p, n).map((f) => [f, xy])))),
      },
      attack: { type: "arc", name: "Bastion Blade", dmg: 20, range: 82, h: 90, cd: 0.55, kb: 300, heavy: true },
      guard: 0.25,
      ability: { id: "wall", name: "Flame Bastion", cd: 10, reach: 260, step: 30, dmg: 24, burn: 6, dps: 14, dur: 6,
        text: "Plant the blade: fire races ahead along the ground, hurling the Drowned, then stands as a burning wall they can't cross." },
      passiveText: "Bastion Shield: blocks 25% of every blow. His cleaves break shields.",
    },
    chainReaper: {
      name: "Chain Reaper", tag: "Kit 06", color: "170,90,255",
      sprite: std("chain-reaper", [44, 80], { attack: ["attackA", "attackB", "attackB"], cast: ["attackC"] }),
      hpMult: 0.7, speedMult: 1.2, dashCd: 0.4,
      attack: { type: "chain", name: "Sickle Throw", dmg: 18, back: 0.5, range: 190, cd: 0.36, kb: 120 },
      rush: { speed: 1.25, dur: 1.5 },
      ability: { id: "snare", name: "Violet Snare", cd: 9, radius: 200, dmg: 16, root: 2,
        text: "Whirl the chain round you: it cuts every Drowned in reach and roots them for 2 seconds. Rooted, they can't attack." },
      passiveText: "Reaper's Rush: every kill gives your dash back and a burst of speed. Fast but fragile.",
    },
    jadeBreaker: {
      name: "Jade Breaker", tag: "Kit 07", color: "80,220,150",
      sprite: {
        folder: "knights/jade-breaker",
        idle: seq("side/idle", 8), run: seq("side/step", 8), jump: ["side/step2"], fall: ["side/step6"],
        attack: pick("side/sweep", [1, 2, 3, 4, 6, 7, 8]), hurt: ["side/hurt"], death: ["side/death"],
        dash: ["side/dash"], cast: seq("side/tide", 8), charge: ["side/castA"],
        feet: Object.assign({}, ...[["side/idle", [35, 89]], ["side/step", [35, 91]], ["side/sweep", [61, 124]], ["side/tide", [37, 126]]]
          .map(([p, xy]) => Object.fromEntries(seq(p, 8).map((f) => [f, xy])))),
      },
      speedMult: 1.15,
      attack: { type: "arc", name: "Jade Sweep", dmg: 26, range: 96, h: 96, cd: 0.62, kb: 420, heavy: true },
      momentum: { full: 1, bonus: 0.3 },
      ability: { id: "tide", name: "Jade Tide", cd: 8, dmg: 30, kb: 340, reach: 300, step: 40, speed: 700, charge: 0.35, rush: 0.26, rushSpeed: 900, rushMult: 1.3,
        text: "Crystals burst from the ground in a line ahead, hurling the Drowned. Hold to charge, then let go to rush in a dash strike with the tide racing beside you." },
      passiveText: "Momentum: up to 30% more damage after a second on the move. Sweeps break shields.",
    },
    rosePaladin: {
      name: "Rose Paladin", tag: "Kit 08", color: "230,60,90",
      sprite: std("rose-paladin", [66, 98], { dash: ["side/walk3"], feet: Object.assign(Object.fromEntries(seq("side/walk", 4).map((f) => [f, [66, 98]])),
        { right: [56, 97], attackA: [54, 88], attackB: [48, 78], attackC: [52, 77], "side/hurt": [58, 85] }) }),
      attack: { type: "arc", lash: true, name: "Thorn Lash", dmg: 22, range: 140, h: 110, back: 40, cd: 0.6, kb: 260 },
      aegis: 0.15, thorns: 0.5,
      ability: { id: "waltz", name: "Rose's Waltz", cd: 8, r: 130, spin: 1.2, hits: 3, dmg: 16, kb: 220, move: 0.6,
        text: "Whirl as the Deadly Rose did: a ring of thorn whips spins round you three times, cutting and hurling back the Drowned. You can move while you waltz." },
      passiveText: "Thorned Aegis: takes 15% off every blow, and the Drowned that strike you are pricked for half of it.",
    },
    bloodsworn: {
      name: "Bloodsworn", tag: "Kit 09", color: "200,40,70",
      sprite: std("bloodsworn", [37, 86], { dash: ["side/walk3"] }),
      forms: [{ at: 10, sprite: std("bloodsworn-f2", [34, 88], { dash: ["side/walk3"] }) }, { at: 30, sprite: std("bloodsworn-f3", [37, 92], { dash: ["side/walk3"] }) }],
      attack: { type: "arc", name: "Red Edge", dmg: 11, range: 74, h: 66, cd: 0.3, kb: 180 },
      tithe: { dmg: 0.02, speed: 0.01, atk: 0.01, hold: 4, drain: 0.4, boss: 5 },
      ability: { id: "reap", name: "Reap the Tithe", cd: 7, r: 90, perR: 6, rMax: 300, dmg: 18, perDmg: 0.08, kb: 280,
        text: "Spend your Blood Tithe: thorns of blood burst from the ground all round you, wider and harder with every stack spent." },
      passiveText: "Blood Tithe: each kill is a stack: +2% damage, +1% speed, +1% swing speed. They bleed away 4 s after your last kill.",
    },
    cinderbrand: {
      name: "Cinderbrand", tag: "Kit 10", color: "255,140,40",
      sprite: std("cinderbrand", [40, 97], {
        attack: ["side/lungeL", "guardF", "side/lunge"], dash: ["side/lunge"], cast: ["side/lunge"], guard: ["side/guard1", "side/guard2", "side/guard3"],
        feet: Object.assign(Object.fromEntries(seq("side/walk", 4).map((f) => [f, [40, 97]])), { right: [35, 95], attackA: [58, 84], attackB: [36, 73], attackC: [32, 77],
          "side/lungeL": [80, 67], "side/lunge": [38, 67], "side/chop": [50, 100], guardF: [36, 71], "side/guard1": [41, 77], "side/guard2": [41, 77], "side/guard3": [41, 78] }),
      }),
      attack: { type: "arc", name: "Forge Cleave", dmg: 24, range: 92, h: 84, cd: 0.6, kb: 280, heavy: true },
      heat: { perHit: 9, perBlock: 20, max: 100, hold: 3, cool: 14, dmg: 0.25 },
      ability: { id: "brand", name: "Brand Thrust", cd: 5, dmg: 30, kb: 300, burn: 5, speed: 820, dash: 0.2, guard: 0.8,
        text: "Hold to plant the greatsword and guard the front: blocked blows stoke the blade. Let go to lunge in a thrust that pierces a whole line. At full heat it erupts in fire." },
      passiveText: "Forge Heat: every hit and block heats the blade, up to 25% more damage. Cleaves break shields.",
    },
  };
  DS.KIT_ORDER = Object.keys(DS.KITS);

  // The Drowned. ai: walker | leaper | archer | shield | caster | boss. All side-walk sheets face right.
  const foe = (type, walkFeet, extra) => Object.assign({
    sprite: {
      folder: "drowned/" + type, idle: ["right"], run: seq("side/walk", 4), jump: ["side/walk2"], fall: ["side/walk4"],
      attack: ["attackA", "attackB", "attackC"], hurt: ["side/hurt"], death: ["side/death"],
      feet: Object.fromEntries(seq("side/walk", 4).map((f) => [f, walkFeet])),
    },
  }, extra);
  DS.ENEMIES = {
    footman: foe("footman", [56, 78], { name: "Drowned Wretch", ai: "walker", hp: 42, speed: 95, dmg: 10, reach: 60, windup: 0.45, cd: 1.1, w: 34, h: 74 }),
    revenant: foe("revenant", [54, 79], { name: "Swarming Revenant", ai: "walker", hp: 20, speed: 175, dmg: 6, reach: 50, windup: 0.3, cd: 0.8, w: 30, h: 70, jumpy: true }),
    squire: foe("squire", [46, 86], { name: "Mire Stalker", ai: "leaper", hp: 32, speed: 150, dmg: 10, reach: 210, windup: 0.4, cd: 1.6, w: 32, h: 78, leap: [480, -420] }),
    defiler: foe("defiler", [54, 84], { name: "Lantern Reaver", ai: "walker", hp: 55, speed: 115, dmg: 13, reach: 80, windup: 0.55, cd: 1.3, w: 34, h: 78, lunge: 300 }),
    archer: foe("archer", [44, 83], { name: "Tide Archer", ai: "archer", hp: 28, speed: 120, dmg: 9, reach: 560, keep: 300, windup: 0.7, cd: 1.8, w: 30, h: 76, shot: 620 }),
    blackguard: foe("blackguard", [61, 87], { name: "Bone Bulwark", ai: "shield", hp: 95, speed: 62, dmg: 17, reach: 70, windup: 0.8, cd: 1.6, w: 44, h: 82, shield: 0.2, poise: true }),
    hexbearer: foe("hexbearer", [55, 91], { name: "Marsh Hexbearer", ai: "caster", hp: 48, speed: 90, dmg: 11, reach: 500, keep: 260, windup: 0.8, cd: 2.4, w: 34, h: 86, orb: 230 }),
    champion: foe("champion", [87, 128], { name: "Drowned Sovereign", ai: "boss", hp: 900, speed: 120, dmg: 20, reach: 110, windup: 0.7, cd: 1.0, w: 70, h: 124, boss: true, poise: true }),
  };
  DS.ENEMY_ORDER = Object.keys(DS.ENEMIES);

  // Waves of the arena: enemy types per wave (repeat with more of them after the list ends).
  DS.WAVES = [
    ["footman", "footman", "footman"],
    ["footman", "revenant", "revenant", "squire"],
    ["archer", "footman", "footman", "squire", "revenant"],
    ["blackguard", "footman", "archer", "revenant", "revenant"],
    ["hexbearer", "squire", "squire", "defiler", "archer"],
    ["champion"],
    ["blackguard", "defiler", "hexbearer", "archer", "squire", "revenant", "revenant"],
  ];
})(window.DS = window.DS || {});
