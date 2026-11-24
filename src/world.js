/* The arena: a drowned ruin with a floor, a raised dais, walls and one-way platforms, plus physics and the
   parallax backdrop (painted in code: the main game has no side-on scenery yet). */
"use strict";
(function (DS) {
  // The world is either the old arena or a scrolling level (Robert 2026-11-18: "make it a scroller").
  // solids/plats are filled in place by arena() / level(); W is the current world width.
  const H = 1000, FLOOR = 860;
  const solids = [], plats = [], spawns = [];
  const W0 = 2400;
  function frame(w) { // floor and the two end walls
    solids.length = 0; plats.length = 0; spawns.length = 0;
    solids.push({ x: -200, y: FLOOR, w: w + 400, h: 300, kind: "floor" },
      { x: -200, y: -400, w: 240, h: H + 600, kind: "wall" }, { x: w - 40, y: -400, w: 240, h: H + 600, kind: "wall" });
    spawns.push({ x: 120, y: FLOOR }, { x: w - 120, y: FLOOR });
    World.W = w; L && L.cache.clear();
  }
  function arena() {
    frame(W0); gen = null; theme(0);
    solids.push({ x: 1100, y: 790, w: 200, h: 80, kind: "stone" }); // the dais
    plats.push( // one-way: stand on top, jump up through, hold down + jump to drop
      { x: 190, y: 755, w: 220 }, { x: 470, y: 655, w: 200 }, { x: 790, y: 745, w: 200 },
      { x: 1110, y: 655, w: 180 }, { x: 1080, y: 540, w: 240 }, { x: 1440, y: 745, w: 220 },
      { x: 1740, y: 655, w: 200 }, { x: 2010, y: 755, w: 220 });
  }

  // A scrolling level, generated a 1200-wide stretch of swamp at a time, each stretch with an ambush of the Drowned.
  // begin() starts one; extend(x) builds on until x (the endless auto-fight run in portrait keeps calling it);
  // finish() closes it with the Sovereign's clearing; unfinish() takes that away again (back to endless).
  const POOL = [["footman", 0], ["revenant", 0], ["squire", 1], ["archer", 1], ["defiler", 2], ["blackguard", 3], ["hexbearer", 3]];
  const SEG = 1200, START = 700, BOSS_W = 1900;
  let gen = null;
  function begin(n, seed) {
    theme(n);
    frame(START + 2400);
    gen = { r: rng(seed), n, i: 0, x: START, done: null };
  }
  function ends(w) { // move the floor's end and the right wall to w
    solids[0].w = w + 400; solids[2].x = w - 40; spawns[1].x = w - 120; World.W = w;
  }
  function stretch() {
    const r = gen.r, x0 = gen.x, n = gen.n, i = gen.i;
    for (let k = 0; k < 4; k++) { // four slots of 300 per stretch
      const sx = x0 + k * 300 + 30, roll = r();
      if (roll < 0.22) continue;
      if (roll < 0.42) { const sw = 120 + (r() * 3 | 0) * 40, sh = [60, 80, 80][r() * 3 | 0]; solids.push({ x: sx + 20, y: FLOOR - sh, w: sw, h: sh, kind: "stone" }); }
      else if (roll < 0.52) { solids.push({ x: sx, y: FLOOR - 60, w: 100, h: 60, kind: "stone" }, { x: sx + 100, y: FLOOR - 120, w: 120, h: 120, kind: "stone" }); }
      else if (roll < 0.78) { plats.push({ x: sx, y: r() < 0.5 ? 755 : 745, w: 200 + (r() * 3 | 0) * 20 }); if (r() < 0.5) plats.push({ x: sx + 40, y: 645, w: 180 }); }
      else { plats.push({ x: sx, y: 655, w: 220 }); if (r() < 0.6) plats.push({ x: sx + 20, y: 545, w: 200 }); }
    }
    const avail = POOL.filter((t) => t[1] <= n + Math.floor(i / 2)).map((t) => t[0]);
    const count = Math.min(9, 2 + Math.floor(i * 0.6) + n);
    const foes = [], at = [];
    for (let j = 0; j < count; j++) {
      foes.push(avail[r() * avail.length | 0]);
      const behind = (n > 0 || i > 6) && j === count - 1 && r() < 0.5; // later on, one comes from behind
      at.push(behind ? x0 - 650 : x0 + 650 + r() * 500);
    }
    gen.i++; gen.x += SEG;
    return { x: x0, foes, at };
  }
  function extend(toX) {
    const enc = [];
    if (!gen || gen.done) return enc;
    while (gen.x < toX) enc.push(stretch());
    ends(gen.x + 2400);
    return enc;
  }
  function finish(type) { // the boss's clearing: flat, two ledges to dodge onto
    const bossX = gen.x, a = { x: bossX + 350, y: 700, w: 220 }, b = { x: bossX + 1250, y: 700, w: 220 };
    plats.push(a, b); ends(bossX + BOSS_W);
    gen.done = { bossX, plats: [a, b] };
    return { x: bossX + 150, foes: [type || "champion"], at: [bossX + 1300], boss: true, bossX };
  }
  function unfinish() {
    if (!gen || !gen.done) return;
    for (const p of gen.done.plats) plats.splice(plats.indexOf(p), 1);
    gen.done = null; ends(gen.x + 2400);
  }
  // the endless run: forget the swamp far behind and wall it off
  function prune(beforeX) {
    if (beforeX < 1000) return;
    for (let i = solids.length - 1; i >= 3; i--) if (solids[i].x + solids[i].w < beforeX) { L && L.cache.delete(solids[i]); solids.splice(i, 1); }
    for (let i = plats.length - 1; i >= 0; i--) if (plats[i].x + plats[i].w < beforeX) { L && L.cache.delete(plats[i]); plats.splice(i, 1); }
    solids[1].x = Math.max(solids[1].x, beforeX - 240); spawns[0].x = solids[1].x + 360;
  }
  // a whole level at once (landscape play)
  function level(n, seed, segs) {
    begin(n, seed);
    const enc = extend(START + (segs || 6 + Math.min(4, n)) * SEG);
    const boss = finish(DS.bossFor(n)); enc.push(boss);
    return { enc, bossX: boss.bossX };
  }

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

  // ---------- backdrop and terrain: a pixel swamp painted in code (art direction 2026-11-16, from the pixel style test) ----------
  // Everything here draws on the low-res canvas (1 px = 2 world units, src/render.js); g is that canvas's context.
  const TILE = 640, LH = 240, GY = 188;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
const px=(g,x,y,c)=>{g.fillStyle=c;g.fillRect(x|0,y|0,1,1)};

/* ---------- background layers ---------- */
function sky(){
  const c=mk(TILE,LH),g=c.getContext('2d');
  const bands=['#0d1422','#111a2b','#152234','#1a2a3a','#20333f','#283e45','#324a4a'];
  const bh=Math.ceil(GY/ (bands.length-1));
  for(let y=0;y<LH;y++){
    const i=Math.min(bands.length-1,Math.floor(y/bh)), f=(y%bh)/bh;
    for(let x=0;x<TILE;x++){
      let col=bands[i];
      if(i<bands.length-1 && f>0.75 && ((x+y)%2===0)) col=bands[i+1];
      else if(i<bands.length-1 && f>0.88 && ((x+y)%2===1 || x%4===0)) col=bands[i+1];
      px(g,x,y,col);
    }
  }
  // moon with dithered halo
  const mx=430,my=40;
  for(let y=-18;y<=18;y++)for(let x=-18;x<=18;x++){const d=Math.hypot(x,y);
    if(d<=8.5){let col=d>7?'#b9c7a8':'#dfe8cc'; if((x+3)**2+(y+2)**2<5||(x-3)**2+(y-3)**2<3)col='#c3cfb0';px(g,mx+x,my+y,col)}
    else if(d<12&&(x+y)%2===0)px(g,mx+x,my+y,'#3d5250');
    else if(d<16&&(x%2===0&&y%2===0))px(g,mx+x,my+y,'#2f4246');}
  // stars
  const r=rng(9);for(let i=0;i<40;i++){const x=r()*TILE|0,y=r()*90|0;px(g,x,y,r()<.3?'#8fa6a0':'#4f6466')}
  return c;
}
function clouds(){
  const h=90,c=mk(TILE,h),g=c.getContext('2d'),r=rng(4);
  const mask=new Uint8Array(TILE*h);
  for(let k=0;k<7;k++){
    const cx=k*TILE/7+r()*40,cy=18+r()*50,n=4+r()*4|0,s=0.6+r()*0.6;
    for(let j=0;j<n;j++){const ox=(j-n/2)*9*s+r()*6,oy=-r()*7*s,rad=(6+r()*8)*s,flat=cy+5*s;
      for(let y=-rad;y<=rad;y++)for(let x=-rad;x<=rad;x++)if(x*x+y*y<=rad*rad){
        const X=((cx+ox+x)|0+TILE)%TILE,Y=(cy+oy+y)|0;if(Y>=0&&Y<h&&Y<=flat)mask[Y*TILE+X]=1}}
  }
  const at=(x,y)=>y>=0&&y<h&&mask[y*TILE+((x+TILE)%TILE)];
  for(let y=0;y<h;y++)for(let x=0;x<TILE;x++){if(!at(x,y))continue;
    const top=!at(x,y-1)||!at(x,y-2), bot=!at(x,y+1)||!at(x,y+2), edge=!at(x-1,y)||!at(x+1,y)||!at(x,y-1)||!at(x,y+1);
    if(edge&&(x+y)%2) continue; // dithered rim like the reference
    px(g,x,y, top?'#56717a': bot?'#24343f':'#344a55');
  }
  return c;
}
function hills(){ // far: misty ridge + dead trees
  const h=LH,c=mk(TILE,h),g=c.getContext('2d'),r=rng(11);
  for(let x=0;x<TILE;x++){const t=x/TILE*Math.PI*2;
    const top=GY-32+Math.sin(t*2)*6+Math.sin(t*5+1)*3+Math.sin(t*11)*1.5|0;
    g.fillStyle='#1b2a30';g.fillRect(x,top,1,h-top);
    if(x%2===0)px(g,x,top,'#26383c');}
  for(let i=0;i<14;i++){const x=r()*TILE|0,base=GY-24,ht=22+r()*26|0;
    g.fillStyle='#17242a';g.fillRect(x,base-ht,2,ht);
    for(let b=0;b<4;b++){const by=base-ht+4+r()*ht*0.6|0,dir=r()<.5?-1:1,len=4+r()*7|0;
      for(let k=0;k<len;k++)px(g,x+(dir>0?2:-1)+dir*k,by-(k*0.6|0),'#17242a');}}
  // mist band
  for(let y=GY-28;y<GY;y++)for(let x=0;x<TILE;x++){const f=(y-GY+28)/28;
    if((x+y)%2===0&&((x*13+y*7)%9)<f*7)px(g,x,y,'#2b4043');}
  return c;
}
function trees(seed,dark){ // mid: drooping swamp trees
  const h=LH,c=mk(TILE,h),g=c.getContext('2d'),r=rng(seed);
  const P=dark?{o:'#0c1510',t:'#1d1712',th:'#2a2219',l0:'#13251a',l1:'#1a3222',l2:'#24442b',m:'#1e3a26'}
              :{o:'#0d1a10',t:'#2a2018',th:'#3e3022',l0:'#1c3a24',l1:'#28512f',l2:'#3c6e3a',m:'#355b34'};
  const n=dark?10:7;
  for(let i=0;i<n;i++){
    const x=(i+0.2+r()*0.6)*TILE/n|0, base=dark?GY-10:GY+2, th=dark?34+r()*14:44+r()*20|0, tw=dark?3:4+(r()*3|0);
    // trunk with roots
    for(let y=base-th;y<base;y++){const wob=Math.sin(y*0.15+i)*1.2|0;
      g.fillStyle=P.o;g.fillRect(x+wob-1,y,tw+2,1);g.fillStyle=P.t;g.fillRect(x+wob,y,tw,1);px(g,x+wob,y,P.th);}
    g.fillStyle=P.o;g.fillRect(x-4,base-2,tw+8,2);g.fillStyle=P.t;g.fillRect(x-3,base-2,tw+6,1);
    // canopy blobs
    const cx=x+tw/2,cy=base-th,blobs=[];
    for(let b=0;b<6;b++)blobs.push([cx+(r()-0.5)*26,cy+(r()-0.6)*12,7+r()*7]);
    const inC=(X,Y)=>blobs.some(([bx,by,br])=>(X-bx)**2+(Y-by)**2<=br*br);
    for(let Y=cy-26;Y<cy+16;Y++)for(let X=cx-34;X<cx+34;X++){
      if(!inC(X,Y))continue;
      const edge=!inC(X-1,Y)||!inC(X+1,Y)||!inC(X,Y-1)||!inC(X,Y+1);
      const lit=!inC(X-2,Y-2), shade=!inC(X+2,Y+3);
      let col=edge?P.o:lit?P.l2:shade?P.l0:P.l1;
      if(!edge&&!lit&&!shade&&r()<0.07)col=P.l2; // leaf speckle
      px(g,((X|0)+TILE)%TILE,Y,col);
    }
    // hanging moss
    for(let k=0;k<7;k++){const mxx=cx-14+r()*28|0;let my=cy+4;while(inC(mxx,my+1)&&my<cy+20)my++;
      const len=4+r()*10|0;for(let j=0;j<len;j++)px(g,(mxx+(j>len/2&&k%2?1:0)+TILE)%TILE,my+j,P.m);}
  }
  return c;
}
// ground palettes per level: dirt bands, grass lip (top, mid, under), blades, highlight, flowers
const GROUND={
  shallows:{d:['#3b2c22','#33261e','#2a1f19','#211915','#181210'],g:['#4c7a3c','#3a6232','#24401f'],b:'#6c9a4a',hi:'#7aa654',f:['#c9d36a','#b07acb'],crack:['#1b1310','#4a3426']},
  reaches:{d:['#3a3d42','#323439','#2a2c30','#222327','#1a1b1e'],g:['#6d6a52','#55533f','#34332a'],b:'#8a8466',hi:'#9c977a',f:['#c9c7b0','#8fa0b0'],crack:['#16171a','#4a4d54']},
  abyss:{d:['#221a1c','#1c1517','#171113','#120d0f','#0c090a'],g:['#3a1c20','#2a1418','#1a0c0f'],b:'#5a2a30',hi:'#6e3238',f:['#4fa0ff','#a02030'],crack:['#0a0708','#3a2a2e']},
  mines:{d:['#2a1f1a','#231a16','#1c1512','#16100e','#0f0b09'],g:['#4a2a18','#3a2014','#24140c'],b:'#7a3a18',hi:'#a84a1a',f:['#ff8a2a','#ffc040'],crack:['#0a0706','#5a2a12']},
  mire:{d:['#2c2a1c','#242218','#1d1c14','#171610','#11100c'],g:['#5f6a34','#4a5428','#2c3318'],b:'#7d8840',hi:'#8f9a4c',f:['#d6d860','#9fb04a'],crack:['#12110c','#3a3624']},
};
function ground(pal){
  const P=GROUND[pal]||GROUND.shallows;
  const h=72,c=mk(TILE,h),g=c.getContext('2d'),r=rng(21),o=8; // y offset: row o == GY
  // dirt bands
  const bands=[[o+5,P.d[0]],[o+16,P.d[1]],[o+28,P.d[2]],[o+40,P.d[3]],[h,P.d[4]]];
  for(let y=o;y<h;y++){let i=0;while(y>=bands[i][0])i++;
    for(let x=0;x<TILE;x++){let col=bands[i][1];
      if(i>0&&y-bands[i-1][0]<3&&(x+y)%2===0)col=bands[i-1][1];px(g,x,y,col);}}
  // cracks + roots
  for(let k=0;k<26;k++){let x=r()*TILE,y=o+6+r()*6;const len=6+r()*16|0;
    for(let j=0;j<len;j++){px(g,(x|0+TILE)%TILE,y|0,k%3?P.crack[0]:P.crack[1]);x+=(r()-0.5)*1.6;y+=0.7;}}
  // stones
  for(let k=0;k<30;k++){const x=r()*TILE|0,y=o+8+r()*(h-o-12)|0,rw=1.5+r()*2.5,rh=rw*0.75;
    for(let Y=-3;Y<=3;Y++)for(let X=-5;X<=5;X++){const d=(X/rw)**2+(Y/rh)**2;if(d>1.35)continue;
      let col=d>0.95?'#16110f':(X<0&&Y<0)?'#7a7b80':(Y>0)?'#3d3e45':'#5a5b62';px(g,(x+X+TILE)%TILE,y+Y,col);}}
  // grass edge: lip with blades on top and tufts hanging over the dirt
  for(let x=0;x<TILE;x++){
    const lip=3+(Math.sin(x*0.35)+Math.sin(x*0.13+2)>0.6?1:0)+(r()<0.25?1:0);
    for(let y=o;y<o+lip+2;y++)px(g,x,y,y<o+2?P.g[0]:y<o+lip?P.g[1]:P.g[2]);
    if(r()<0.18)px(g,x,o+lip+2,P.g[2]);
    const bl=r()*4|0;for(let j=1;j<=bl;j++)px(g,x,o-j,j===bl?P.b:P.g[0]);
  }
  for(let x=0;x<TILE;x+=2)if(r()<0.35)px(g,x,o+1,P.hi);
  // small flowers / glow caps
  for(let k=0;k<18;k++){const x=r()*TILE|0;px(g,x,o-2,k%3?P.f[0]:P.f[1]);px(g,x,o-1,P.g[1]);}
  return c;
}
function reeds(){
  const c=mk(TILE,40),g=c.getContext('2d'),r=rng(33);
  for(let k=0;k<26;k++){const x=r()*TILE|0;const n=3+r()*4|0;
    for(let j=0;j<n;j++){const hx=x+j*2+(r()*2|0),ht=8+r()*16|0,lean=r()-0.5;
      for(let y=0;y<ht;y++)px(g,(hx+(lean*y*0.4|0)+TILE)%TILE,39-y,y>ht-3?'#5b4a2c':'#1f3a22');
      if(r()<0.4){const tx=(hx+(lean*ht*0.4|0)+TILE)%TILE;g.fillStyle='#4a3020';g.fillRect(tx,39-ht-2,2,4)}}
  }
  return c;
}


  let L = null;
  function wood(w) { // a boardwalk plank strip w px wide
    const c = mk(w, 8), g = c.getContext("2d"), r = rng(w * 7 + 3);
    for (let x = 0; x < w; x++) for (let y = 0; y < 8; y++) {
      let col = y === 0 || y === 7 || x === 0 || x === w - 1 ? "#160e0b" : y === 1 ? "#8a6a44" : y < 4 ? "#6b5034" : y < 6 ? "#57402a" : "#3b2a1c";
      if (y > 0 && y < 7 && x % 23 === 0) col = "#160e0b"; // plank joints
      if (y === 3 && x % 23 === 3) col = "#b8a070";        // nails
      px(g, x, y, col);
    }
    for (let x = 2; x < w - 2; x++) if (r() < 0.2) { px(g, x, -0 + 0, "#3a6232"); }
    return c;
  }
  function stone(w, h) { // the dais: mossy stone blocks
    const c = mk(w, h), g = c.getContext("2d"), r = rng(w + h);
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / 8), off = row % 2 ? 6 : 0;
      for (let x = 0; x < w; x++) {
        let col = y % 8 === 0 || (x + off) % 12 === 0 ? "#1d1f24" : y % 8 === 1 ? "#77797f" : (x + off) % 12 === 1 ? "#62646b" : "#4b4d55";
        if (col === "#4b4d55" && r() < 0.08) col = "#3d3e45";
        if (y > h - 10 && (x + y) % 2 === 0) col = "#2b2c32";
        px(g, x, y, col);
      }
    }
    for (let x = 0; x < w; x++) { px(g, x, 0, "#4c7a3c"); if (x % 3 && r() < 0.6) px(g, x, 1, "#3a6232"); if (r() < 0.25) for (let j = 2; j < 2 + (r() * 5 | 0); j++) px(g, x, j, "#2f5a2a"); }
    for (let x = 0; x < w; x++) px(g, x, h - 1, "#14100e");
    return c;
  }
  function wall(w, h) { // the arena's mud walls
    const c = mk(w, h), g = c.getContext("2d"), r = rng(5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(g, x, y, (x + y) % 2 && r() < 0.15 ? "#2a1f19" : "#1d1512");
    for (let k = 0; k < h / 6; k++) { const x = r() * w | 0, y = r() * h | 0; px(g, x, y, "#3d3e45"); px(g, x + 1, y, "#5a5b62"); px(g, x, y + 1, "#16110f"); }
    return c;
  }
  // ---------- each level's look (Robert 2026-11-19): code layers for the Shallows, Robert's GPT art for the rest ----------
  // Maps walk through LEVEL_THEMES and loop. A theme can swap the sky and the far/mid layers for pictures and scatter
  // cut-out pieces (tools/cut_scenery.py -> assets/scenery/<theme>/atlas.png, rects in DS.SCENERY) on parallax rows.
  // Row: f = how fast it scrolls with the camera (1 = with the ground), ty = how far it follows the camera up and down,
  // sink = px pushed into the ground, lift = px floated above it (islands), gap = [min, max] px between pieces, pick = pieces to draw from (repeats allowed).
  const THEMES = {
    shallows: { code: true, ground: "shallows", rows: [
      { f: 0.75, ty: 0.9, sink: 3, gap: [260, 520], pick: ["shrine1", "shrine2", "shrine3", "post1", "post2", "cart"] },
    ] },
    reaches: { sky: true, far: true, plats: true, ground: "reaches", top: "#0e1216", fog: "#36505f", wisp: ["#c8d8e8", "#5a6a7a"],
      post: [16, 10], rows: [
      { f: 0.55, ty: 0.82, sink: 2, gap: [-10, 60], pick: ["rock1", "rock2", "window", "rock3", "scaffold", "banner"] },
      { f: 0.72, ty: 0.9, sink: 3, gap: [160, 420], pick: ["bridge", "tower", "crag1", "crag2", "crag3"] },
    ] },
    abyss: { sky: true, far: true, plats: true, ground: "abyss", top: "#050000", fog: "#1c0f10", wisp: ["#7fb8ff", "#3a5a8a"],
      posts: ["post1", "post2", "post3"], rows: [ // post4 carries a banner that would repeat when stretched
      { f: 0.55, ty: 0.82, sink: 2, gap: [-10, 60], pick: ["dtree1", "dtree2", "dtree3", "dtree4", "dtree5", "dtree6"] },
      { f: 0.75, ty: 0.9, sink: 3, gap: [200, 480], pick: ["briar1", "bellframe", "briar1"] },
      { f: 1, ty: 1, sink: 2, gap: [70, 260], pick: ["agrave1", "agrave2", "agrave3", "crystal1", "crystal2", "crystal3", "briar2"] },
    ] },
    spires: { sky: true, far: true, plats: true, ground: "abyss", top: "#0a0410", fog: "#2c1640", wisp: ["#d890ff", "#6a3a9a"],
      posts: ["post1", "post2", "post3"], rows: [ // post4's crystal crown would be cut by stretching
      { f: 0.5, ty: 0.8, sink: 0, lift: 70, gap: [120, 320], pick: ["fisle1", "fisle2", "isle1", "isle2", "isle3"] },
      { f: 0.6, ty: 0.84, sink: 2, gap: [-10, 70], pick: ["arch", "cpillar", "wall", "chpillar"] },
      { f: 0.75, ty: 0.9, sink: 3, gap: [220, 520], pick: ["portal", "pylon", "pylonBroken"] },
    ] },
    mines: { reeds: false, sky: true, far: true, plats: true, ground: "mines", top: "#1a0c08", fog: "#341a0c", wisp: ["#ffb040", "#a04010"],
      posts: ["post1", "post3"], post: [10, 14], rows: [ // the lantern posts' arms would repeat when stretched
      { f: 0.55, ty: 0.82, sink: 2, gap: [-10, 60], pick: ["basalt", "scaffold", "chimney", "mheadframe", "lavarock", "parch"] },
      { f: 0.75, ty: 0.9, sink: 3, gap: [200, 480], pick: ["headframe", "lavafall", "pillar", "gate"] },
      { f: 1, ty: 1, sink: 2, gap: [260, 620], pick: ["cart", "brazier"] },
    ] },
    throne: { reeds: false, sky: true, far: true, plats: true, ground: "mines", top: "#0a0606", fog: "#2a1210", wisp: ["#ffcf60", "#a0401a"],
      posts: ["post1", "post2", "post4"], post: [12, 12], rows: [ // post3's banner would repeat when stretched
      { f: 0.6, ty: 0.84, sink: 2, gap: [10, 90], pick: ["tpillar1", "tbanner1", "tbrazier1", "tbroken1", "tbanner2", "tbrazier2",
        "tpillar2", "tbanner3", "tbrazier3", "tpillar3", "tbanner4", "tbrazier4", "tbroken2"] },
      { f: 0.75, ty: 0.9, sink: 3, gap: [240, 560], pick: ["throne", "curtain", "statue", "statue"] },
    ] },
    mire: { sky: true, far: true, plats: true, ground: "mire", top: "#10140e", fog: "#232a1b", wisp: ["#d8e070", "#8a9a48"], rows: [
      { f: 0.55, ty: 0.82, sink: 2, gap: [-20, 50], pick: ["tree1", "tree2", "tree3", "tree4", "tree5", "tree6"] },
      { f: 0.72, ty: 0.9, sink: 3, gap: [160, 420], pick: ["chapel", "hang1", "hang2", "hang3", "hang1", "hang2", "hang3"] },
      { f: 1, ty: 1, sink: 2, gap: [90, 300], pick: ["grave1", "grave2", "grave3", "grave4", "grave5", "grave6"] },
    ] },
  };
  // One map per 10 levels (Robert 2026-11-19), then round again.
  // Robert 2026-11-20: maps follow the boss order (Mire, Reaches, Abyss, Spires, Mines, Crucible Throne); the Shallows
  // is dropped from the run. Reaches and Abyss have their full sets (2026-11-24). The code-sky path (T.code, with an
  // optional sky picture and tint) stays for maps whose pictures haven't come in yet.
  const LEVEL_THEMES = ["mire", "reaches", "abyss", "spires", "mines", "throne"], MAP_LEVELS = 10;
  let T = THEMES.shallows, themeName = "shallows";
  const img = (src) => { const i = new Image(); i.src = src + "?v=" + DS.VERSION; return i; };
  function theme(n) {
    const m = Math.floor(Math.max(0, n | 0) / MAP_LEVELS);
    themeName = LEVEL_THEMES[m % LEVEL_THEMES.length];
    T = THEMES[themeName];
    if (!T.ready) { // load its pictures and lay out each row once: a loop of pieces long enough not to notice
      const sc = (DS.SCENERY || {})[themeName];
      T.atlas = sc && img(`assets/scenery/${themeName}/atlas.png`);
      T.rects = sc ? sc.atlas : {};
      if (T.sky) T.skyImg = img(`assets/scenery/${themeName}/sky.png`);
      if (T.far) T.farImg = img(`assets/scenery/${themeName}/far.png`);
      const r = rng(themeName.length * 131 + 7);
      for (const row of T.rows) {
        row.list = []; let x = 0;
        const pool = row.pick.filter((k) => T.rects[k]);
        for (let i = 0; pool.length && (i < pool.length * 2 || x < 1800); i++) {
          const k = pool[r() * pool.length | 0];
          if (row.list.length && row.list[row.list.length - 1].k === k) continue;
          row.list.push({ k, x, flip: r() < 0.5 }); x += T.rects[k][2] + row.gap[0] + r() * (row.gap[1] - row.gap[0]);
        }
        row.len = Math.max(1, x);
      }
      T.ready = true;
    }
    if (L) L.ground = groundFor(T);
  }
  const grounds = {};
  function groundFor(t) { return grounds[t.ground] || (grounds[t.ground] = ground(t.ground)); }
  function build() {
    L = { sky: sky(), clouds: clouds(), hills: hills(), far: trees(5, true), mid: trees(8, false), reeds: reeds(), ground: groundFor(T), wall: wall(20, 600), cache: new Map() };
    const r = rng(77); L.wisps = []; for (let i = 0; i < 14; i++) L.wisps.push({ x: r() * TILE, y: 60 + r() * 80, p: r() * 6 });
  }
  // a platform's drawing, made once; tag says which art it was made from, so it is redrawn once the theme's pictures load
  function art(o, make, tag) { let e = L.cache.get(o); if (!e || e.tag !== tag) { e = { c: make(), tag }; L.cache.set(o, e); } return e.c; }
  function tiled(g, img, off, y, lw) { const tw = img.width || TILE, x0 = -((Math.round(off) % tw) + tw) % tw; for (let x = x0; x < lw; x += tw) g.drawImage(img, x, Math.round(y)); }
  // a picture that doesn't repeat seamlessly: every other copy mirrored, so the edges always meet
  function pingpong(g, img, off, y, lw) {
    const w = img.width; if (!w) return;
    const o = Math.round(off), i0 = Math.floor(o / w);
    for (let i = i0, x = i0 * w - o; x < lw; i++, x += w) {
      if (i & 1) { g.save(); g.translate(x + w, Math.round(y)); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
      else g.drawImage(img, x, Math.round(y));
    }
  }
  function drawRow(g, row, cx, base, lw) {
    if (!T.atlas || !T.atlas.complete || !T.atlas.naturalWidth) return;
    const off = cx * row.f, n = Math.floor((off - 300) / row.len);
    for (let rep = n; rep * row.len - off < lw; rep++) for (const p of row.list) {
      const [sx, sy, w, h] = T.rects[p.k], x = Math.round(rep * row.len + p.x - off), y = Math.round(base - h + row.sink - (row.lift || 0));
      if (x > lw || x + w < 0) continue;
      if (p.flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(T.atlas, sx, sy, w, h, 0, 0, w, h); g.restore(); }
      else g.drawImage(T.atlas, sx, sy, w, h, x, y, w, h);
    }
  }

  function drawBackdrop(g, cam, lw, lh, t) {
    if (!L) build();
    const fy = Math.round((FLOOR - cam.y) / 2), cx = cam.x / 2, top = fy - GY;
    if (T.code) {
      const own = T.skyImg && T.skyImg.naturalWidth; // the map's own sky picture over the code hills (Abyss, until its far/mid come in)
      g.fillStyle = own ? T.top : "#0d1422"; g.fillRect(0, 0, lw, lh);
      if (own) pingpong(g, T.skyImg, cx * 0.05 + t * 2, Math.max(0, Math.round(top * 0.5)), lw);
      else {
        g.drawImage(L.sky, 0, Math.max(0, Math.round(top * 0.5))); // tall portrait views: night sky above it
        tiled(g, L.clouds, cx * 0.08 + t * 3, 8 + top * 0.2, lw);
      }
      tiled(g, L.hills, cx * 0.2, top * 0.5, lw);
      if (T.trees !== false) { tiled(g, L.far, cx * 0.35, top * 0.7, lw); tiled(g, L.mid, cx * 0.6, top * 0.85, lw); }
      if (T.tint) { // stand-in mood until the map's own pictures come in; spare the sky picture
        const ty = own ? Math.round(top * 0.5 + GY - 45) : 0;
        g.fillStyle = T.tint; g.fillRect(0, ty, lw, lh - ty);
      }
    } else {
      g.fillStyle = T.top; g.fillRect(0, 0, lw, lh);
      const sy = Math.max(0, Math.round(top * 0.5));
      if (T.skyImg && T.skyImg.naturalWidth) pingpong(g, T.skyImg, cx * 0.05 + t * 2, sy, lw);
      if (T.farImg && T.farImg.naturalWidth) { // far silhouettes standing in a fog bank
        const fb = top * 0.7 + GY - 6;
        pingpong(g, T.farImg, cx * 0.3, fb - T.farImg.height, lw);
        g.fillStyle = T.fog; g.fillRect(0, Math.round(fb) - 1, lw, lh);
      }
    }
    const wc = T.wisp || ["#d7f08a", "#7f9a50"];
    for (const row of T.rows) if (row.f < 1) drawRow(g, row, cx, top * row.ty + GY, lw);
    for (const w of L.wisps) {
      const x = ((w.x - cx * 0.7) % TILE + TILE) % TILE, y = Math.round(w.y + top * 0.8 + Math.sin(t * 1.5 + w.p) * 3);
      if (x < lw) { const on = Math.sin(t * 3 + w.p) > -0.3; px(g, x, y, on ? wc[0] : wc[1]); if (on) { px(g, x + 1, y, "#5f7a3c"); px(g, x - 1, y, "#5f7a3c"); } }
    }
    for (const row of T.rows) if (row.f >= 1) drawRow(g, row, cx, fy, lw);
    if (T.reeds !== false) tiled(g, L.reeds, cx * 0.85, fy - 38, lw); // no marsh reeds indoors or by the lava
  }
  function drawNear() { /* no foreground layer in the pixel style */ }

  // ---- platforms from the theme's pictures (Robert's Mire walkways, posts and blocks, 2026-11-19) ----
  const piece = (k) => T.rects[k];
  // a walkway w px long: the picture's two ends with a stretch of its middle between, starting at a spot set by the seed
  function walk(w, seed) {
    const [sx, sy, W, H] = piece("walk"), cap = 14, c = mk(w, H), g = c.getContext("2d");
    const mid = W - cap * 2, inner = Math.max(0, w - cap * 2);
    let at = (Math.abs(seed | 0) * 7) % Math.max(1, mid - inner), x = cap;
    while (x < cap + inner) { const n = Math.min(cap + inner - x, mid - at); g.drawImage(T.atlas, sx + cap + at, sy, n, H, x, 0, n, H); x += n; at = 0; }
    g.drawImage(T.atlas, sx, sy, Math.min(cap, w), H, 0, 0, Math.min(cap, w), H);
    g.drawImage(T.atlas, sx + W - cap, sy, cap, H, w - cap, 0, cap, H);
    return c;
  }
  // a post from y0 down to y1, centred on x: its cap, the middle repeated, its rotten foot
  function post(g, k, x, y0, y1) {
    const [sx, sy, W, H] = piece(k), [top, foot] = T.post || [8, 12], left = Math.round(x - W / 2);
    if (y1 - y0 < top + foot) return;
    g.drawImage(T.atlas, sx, sy, W, top, left, y0, W, top);
    const midH = H - top - foot;
    for (let y = y0 + top; y < y1 - foot; y += midH) { const n = Math.min(midH, y1 - foot - y); g.drawImage(T.atlas, sx, sy + top, W, n, left, y, W, n); }
    g.drawImage(T.atlas, sx, sy + H - foot, W, foot, left, y1 - foot, W, foot);
  }
  // a stone block of any size, nine-sliced from the big block: mossy top band, edge columns, the masonry repeated inside
  function block(w, h) {
    const [sx, sy, W, H] = piece("block3"), t = Math.min(12, h - 3), e = 3, b = 3, c = mk(w, h), g = c.getContext("2d");
    const iw = W - e * 2, ih = H - t - b;
    const fill = (srcY, srcH, dy, dh) => { // one band across: left edge, repeated middle, right edge
      g.drawImage(T.atlas, sx, sy + srcY, e, srcH, 0, dy, e, dh);
      for (let x = e; x < w - e; x += iw) { const n = Math.min(iw, w - e - x); g.drawImage(T.atlas, sx + e, sy + srcY, n, srcH, x, dy, n, dh); }
      g.drawImage(T.atlas, sx + W - e, sy + srcY, e, srcH, w - e, dy, e, dh);
    };
    fill(0, t, 0, t);
    for (let y = t; y < h - b; y += ih) { const n = Math.min(ih, h - b - y); fill(t, n, y, n); }
    fill(H - b, b, h - b, b);
    return c;
  }

  // terrain, in low-res screen pixels
  function drawWorld(g, cam, lw, lh) {
    if (!L) build();
    const X = (wx) => Math.round((wx - cam.x) / 2), Y = (wy) => Math.round((wy - cam.y) / 2), fy = Y(FLOOR);
    const vis = (x, w) => X(x) < lw + 4 && X(x + w) > -4;
    const pa = T.plats && T.atlas && T.atlas.complete && T.atlas.naturalWidth ? T : null, tag = pa ? themeName : "code";
    // posts first, then planks
    for (const p of plats) if (vis(p.x, p.w)) for (const wx of [p.x + 12, p.x + p.w - 20]) {
      const y0 = Y(p.y) + 6, y1 = Y(surfaceBelow(wx + 4, p.y + 12));
      if (pa) { const ps = T.posts || ["post1", "post2", "post3", "post4"]; post(g, ps[((wx / 7) | 0) % ps.length], X(wx) + 2, y0 - 4, y1 + 2); continue; }
      g.fillStyle = "#160e0b"; g.fillRect(X(wx) - 1, y0, 6, y1 - y0);
      g.fillStyle = "#4a3624"; g.fillRect(X(wx), y0, 4, y1 - y0);
      g.fillStyle = "#6b5034"; g.fillRect(X(wx), y0, 1, y1 - y0);
    }
    for (const s of solids) if (s.kind === "stone" && vis(s.x, s.w)) g.drawImage(art(s, () => pa && pa.rects.block3 ? block(Math.round(s.w / 2), Math.round(s.h / 2)) : stone(s.w / 2, s.h / 2), pa && pa.rects.block3 ? tag : "code"), X(s.x), Y(s.y)); // a map without its blocks yet keeps the code stone
    g.fillStyle = "#181210"; g.fillRect(0, fy + 60, lw, Math.max(0, lh - fy - 60));
    tiled(g, L.ground, cam.x / 2, fy - 8, lw);
    for (const s of solids) {
      if (s.kind !== "wall") continue;
      const x0 = X(s.x), w = Math.round(s.w / 2);
      if (x0 > lw || x0 + w < 0) continue;
      g.drawImage(L.wall, 0, 0, 20, 600, x0, Y(s.y), w, Math.round(s.h / 2));
      const ex = s.x < 0 ? x0 + w - 1 : x0;
      for (let y = Math.max(0, Y(s.y)); y < Math.min(lh, fy + 2); y++) { px(g, ex, y, y % 2 ? "#3b2c22" : "#16110f"); }
    }
    for (const p of plats) if (vis(p.x, p.w)) g.drawImage(art(p, () => pa ? walk(Math.round(p.w / 2), p.x) : wood(p.w / 2), tag), X(p.x), Y(p.y) - (pa ? 2 : 0));
  }

  const World = DS.World = { theme, get themeName() { return themeName; }, W: W0, H, FLOOR, solids, plats, spawns, arena, level, begin, extend, finish, unfinish, prune, move, groundAt, solidAt, surfaceBelow, drawBackdrop, drawNear, drawWorld };
  arena();
})(window.DS = window.DS || {});
