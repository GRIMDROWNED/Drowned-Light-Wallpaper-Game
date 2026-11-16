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
function ground(){
  const h=72,c=mk(TILE,h),g=c.getContext('2d'),r=rng(21),o=8; // y offset: row o == GY
  // dirt bands
  const bands=[[o+5,'#3b2c22'],[o+16,'#33261e'],[o+28,'#2a1f19'],[o+40,'#211915'],[h,'#181210']];
  for(let y=o;y<h;y++){let i=0;while(y>=bands[i][0])i++;
    for(let x=0;x<TILE;x++){let col=bands[i][1];
      if(i>0&&y-bands[i-1][0]<3&&(x+y)%2===0)col=bands[i-1][1];px(g,x,y,col);}}
  // cracks + roots
  for(let k=0;k<26;k++){let x=r()*TILE,y=o+6+r()*6;const len=6+r()*16|0;
    for(let j=0;j<len;j++){px(g,(x|0+TILE)%TILE,y|0,k%3?'#1b1310':'#4a3426');x+=(r()-0.5)*1.6;y+=0.7;}}
  // stones
  for(let k=0;k<30;k++){const x=r()*TILE|0,y=o+8+r()*(h-o-12)|0,rw=1.5+r()*2.5,rh=rw*0.75;
    for(let Y=-3;Y<=3;Y++)for(let X=-5;X<=5;X++){const d=(X/rw)**2+(Y/rh)**2;if(d>1.35)continue;
      let col=d>0.95?'#16110f':(X<0&&Y<0)?'#7a7b80':(Y>0)?'#3d3e45':'#5a5b62';px(g,(x+X+TILE)%TILE,y+Y,col);}}
  // grass edge: lip with blades on top and tufts hanging over the dirt
  for(let x=0;x<TILE;x++){
    const lip=3+(Math.sin(x*0.35)+Math.sin(x*0.13+2)>0.6?1:0)+(r()<0.25?1:0);
    for(let y=o;y<o+lip+2;y++)px(g,x,y,y<o+2?'#4c7a3c':y<o+lip?'#3a6232':'#24401f');
    if(r()<0.18)px(g,x,o+lip+2,'#24401f');
    const bl=r()*4|0;for(let j=1;j<=bl;j++)px(g,x,o-j,j===bl?'#6c9a4a':'#4c7a3c');
  }
  for(let x=0;x<TILE;x+=2)if(r()<0.35)px(g,x,o+1,'#7aa654');
  // small flowers / glow caps
  for(let k=0;k<18;k++){const x=r()*TILE|0;px(g,x,o-2,k%3?'#c9d36a':'#b07acb');px(g,x,o-1,'#3a6232');}
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
  function build() {
    L = { sky: sky(), clouds: clouds(), hills: hills(), far: trees(5, true), mid: trees(8, false), reeds: reeds(), ground: ground(), wall: wall(20, 600), plats: new Map() };
    const d = solids[3]; L.dais = stone(d.w / 2, d.h / 2);
    for (const p of plats) L.plats.set(p, wood(p.w / 2));
    const r = rng(77); L.wisps = []; for (let i = 0; i < 14; i++) L.wisps.push({ x: r() * TILE, y: 60 + r() * 80, p: r() * 6 });
  }
  function tiled(g, img, off, y, lw) { const x0 = -((Math.round(off) % TILE) + TILE) % TILE; for (let x = x0; x < lw; x += TILE) g.drawImage(img, x, Math.round(y)); }

  function drawBackdrop(g, cam, lw, lh, t) {
    if (!L) build();
    const fy = Math.round((FLOOR - cam.y) / 2), cx = cam.x / 2, top = fy - GY;
    g.fillStyle = "#0d1422"; g.fillRect(0, 0, lw, lh);
    g.drawImage(L.sky, 0, 0);
    tiled(g, L.clouds, cx * 0.08 + t * 3, 8 + top * 0.2, lw);
    tiled(g, L.hills, cx * 0.2, top * 0.5, lw);
    tiled(g, L.far, cx * 0.35, top * 0.7, lw);
    tiled(g, L.mid, cx * 0.6, top * 0.85, lw);
    for (const w of L.wisps) {
      const x = ((w.x - cx * 0.7) % TILE + TILE) % TILE, y = Math.round(w.y + top * 0.8 + Math.sin(t * 1.5 + w.p) * 3);
      if (x < lw) { const on = Math.sin(t * 3 + w.p) > -0.3; px(g, x, y, on ? "#d7f08a" : "#7f9a50"); if (on) { px(g, x + 1, y, "#5f7a3c"); px(g, x - 1, y, "#5f7a3c"); } }
    }
    tiled(g, L.reeds, cx * 0.85, fy - 38, lw);
  }
  function drawNear() { /* no foreground layer in the pixel style */ }

  // terrain, in low-res screen pixels
  function drawWorld(g, cam, lw, lh) {
    if (!L) build();
    const X = (wx) => Math.round((wx - cam.x) / 2), Y = (wy) => Math.round((wy - cam.y) / 2), fy = Y(FLOOR);
    // posts first, then planks
    for (const p of plats) for (const wx of [p.x + 12, p.x + p.w - 20]) {
      const y0 = Y(p.y) + 6, y1 = Y(surfaceBelow(wx + 4, p.y + 12));
      g.fillStyle = "#160e0b"; g.fillRect(X(wx) - 1, y0, 6, y1 - y0);
      g.fillStyle = "#4a3624"; g.fillRect(X(wx), y0, 4, y1 - y0);
      g.fillStyle = "#6b5034"; g.fillRect(X(wx), y0, 1, y1 - y0);
    }
    const d = solids[3]; g.drawImage(L.dais, X(d.x), Y(d.y));
    g.fillStyle = "#181210"; g.fillRect(0, fy + 60, lw, Math.max(0, lh - fy - 60));
    tiled(g, L.ground, cam.x / 2, fy - 8, lw);
    for (const s of [solids[1], solids[2]]) {
      const x0 = X(s.x), w = Math.round(s.w / 2);
      if (x0 > lw || x0 + w < 0) continue;
      g.drawImage(L.wall, 0, 0, 20, 600, x0, Y(s.y), w, Math.round(s.h / 2));
      const ex = s === solids[1] ? x0 + w - 1 : x0;
      for (let y = Math.max(0, Y(s.y)); y < Math.min(lh, fy + 2); y++) { px(g, ex, y, y % 2 ? "#3b2c22" : "#16110f"); }
    }
    for (const p of plats) g.drawImage(L.plats.get(p), X(p.x), Y(p.y));
  }

  DS.World = { W, H, FLOOR, solids, plats, spawns, move, groundAt, solidAt, surfaceBelow, drawBackdrop, drawNear, drawWorld };
})(window.DS = window.DS || {});
