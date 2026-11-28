/* ══════════════════════════════════════════════════════════════════════════
   KNOXYZ · СИСТЕМА БИОМОВ — отдельный файл, не зависит от логики игры.

   Подключение (рядом с knoxyz.html, ПЕРЕД основным скриптом):
       <script src="biomes.js"></script>

   Игра знает только этот API (window.Biomes):
     Biomes.reset({seed,cell,radius,fade,chance,startX,startY})  новый мир
     Biomes.update(dt, nowMs, playerX, playerY)                   каждый кадр
     Biomes.drawBackground(ctx, view, nowMs)                      до мира
     Biomes.drawTrail(ctx, view, dt, player)                      следы, до шара
     Biomes.drawForeground(ctx, view, nowMs)                      после мира
     Biomes.wallClass(wx, wy)  → число      класс цвета стены в точке мира
     Biomes.wallStyle(class)   → {core,glow,soft}  CSS-цвета для класса
     Biomes.coverage           0..1  насколько небо закрыто биомом (гасит звёзды меню)
     Biomes.amountAt(id, wx, wy)  0..1  сколько биома в точке (для отладки)
   где view = {camX, camY, W, H}, player = {x, y, vx, vy, r}; dt — в «кадрах 60 Гц».

   Новый биом: описать объект по образцу DESERT и добавить в REGISTRY.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

const STEPS = 8;                                  // ступеней цвета стен между обычным и биомным
const CFG = { cell: 15360, radius: 2880, fade: 1440, chance: .25, bgRamp: 1.8, weedSpeed: 1 };
let seed = 0, safeIx = 0, safeIy = 0;

// ── общие помощники ───────────────────────────────────────────────────────
const hash = (x, y, s) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(((seed | 0) + s * 7919) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const wrap = (x, p) => ((x % p) + p) % p;
const soft = (v, lim) => Math.tanh(v / lim) * lim;      // мягкий предел: параллакс не уезжает от центра

// ── размещение: редкие отдельные пятна (по одному на ячейку с шансом CFG.chance) ──
function blobAmount(wx, wy, salt) {
  const ix = Math.floor(wx / CFG.cell), iy = Math.floor(wy / CFG.cell);
  if (ix === safeIx && iy === safeIy) return 0;         // старт всегда в обычном коридоре
  if (hash(ix, iy, salt * 10 + 1) > CFG.chance) return 0;
  const m = CFG.radius * 1.4 + CFG.fade;                // пятно целиком внутри своей ячейки
  const cx = ix * CFG.cell + m + hash(ix, iy, salt * 10 + 2) * (CFG.cell - 2 * m);
  const cy = iy * CFG.cell + m + hash(ix, iy, salt * 10 + 3) * (CFG.cell - 2 * m);
  const dx = wx - cx, dy = wy - cy, a = Math.atan2(dy, dx), ph = hash(ix, iy, salt * 10 + 4) * 6.283;
  const rr = CFG.radius * (1 + .25 * Math.sin(a * 3 + ph) + .12 * Math.sin(a * 5 - ph * 2));   // неровный край
  const k = 1 - (Math.hypot(dx, dy) - rr) / CFG.fade;
  return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
}

// ══════════════════════════════ ПУСТЫНЯ ═══════════════════════════════════
const DESERT = (() => {
  const SAND = '#ffd98a';
  let windDir = 1, sand = [], weeds = [], stars = [], dust = [];
  const windAt = t => 1 + .9 * Math.max(0, Math.sin(t * .0006)) + .3 * Math.sin(t * .003);
  const duneY = (v, par, base, amp, sc, x) => {
    const w = (x + v.camX * par) * sc;
    return base - soft(v.camY * par * .25, 60) + Math.sin(w * .0031) * amp + Math.sin(w * .0087 + 1.7) * amp * .45 + Math.sin(w * .019 + 4) * amp * .15;
  };
  function dune(ctx, v, par, base, amp, fill, edge, sc) {
    ctx.beginPath(); ctx.moveTo(0, v.H + 10);
    for (let x = 0; x <= v.W + 12; x += 12) ctx.lineTo(x, duneY(v, par, base, amp, sc, x));
    ctx.lineTo(v.W, v.H + 10); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 6; ctx.stroke(); ctx.lineWidth = 1.5; ctx.stroke();   // мягкая кромка без размытия
  }
  function drawSand(ctx, v, now, al, front) {
    const wd = windAt(now);
    ctx.fillStyle = SAND;
    for (const p of sand) {
      if ((p.z > .8) !== front) continue;
      const x = wrap(p.x - v.camX * p.z * .6, v.W), y = wrap(p.y - v.camY * p.z * .6 + Math.sin(now * .0007 + p.ph) * 8, v.H), len = p.z * wd * 5 + 1;
      ctx.globalAlpha = p.z * .55 * al; ctx.fillRect(windDir > 0 ? x : x - len, y, len, p.z * 1.6 + .4);
    }
    ctx.globalAlpha = 1;
  }

  return {
    id: 'desert',
    wall: { core: [255, 210, 74], glow: [255, 200, 60, .75], soft: [255, 190, 40, .08] },
    amountAt: (wx, wy) => blobAmount(wx, wy, 1),

    reset() {
      windDir = 1; dust = [];
      stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * .55, s: Math.random() * 1.4 + .3, p: Math.random() * 6 }));
      sand = Array.from({ length: 170 }, () => ({ x: Math.random() * 2000, y: Math.random() * 2000, z: .25 + Math.random() * .75, ph: Math.random() * 6.283 }));
      weeds = [0, 1, 2].map(() => {
        const r = 12 + Math.random() * 10;
        return { x: Math.random() * 2000, r, s: .6 + Math.random() * .8, rot: Math.random() * 6.28, h: 0, vh: Math.random() * 1.2, sq: 0,
          tw: Array.from({ length: 16 }, () => ({ a: Math.random() * 6.283, sw: .8 + Math.random() * 2.2, rr: r * (.45 + Math.random() * .6), ox: (Math.random() - .5) * r * .35, oy: (Math.random() - .5) * r * .35 })) };
      });
    },
    onEnter() { windDir = Math.random() < .5 ? -1 : 1; },   // сторона ветра — случайно при входе в пустыню

    tick(dt, now) {                                         // физика: песок и перекати-поле
      const wd = windAt(now), TD = dt * CFG.weedSpeed;
      for (const p of sand) p.x += wd * p.z * 2.4 * dt * windDir;
      for (const w of weeds) {
        const vx = wd * w.s * .9 * TD * windDir; w.x += vx; w.rot += vx / w.r;
        w.vh -= .045 * TD; w.h += w.vh * TD;
        if (w.h <= 0) {
          const imp = -w.vh; w.h = 0; w.sq = Math.min(imp / 3, 1);
          w.vh = imp * .72;                                  // каждый удар забирает энергию
          if (w.vh < .7) { w.vh = 0; if (Math.random() < .006 * TD * wd) w.vh = 1 + Math.random() * .9; }   // катится, пока порыв не подбросит
        }
        w.sq *= Math.pow(.9, TD);
      }
    },

    drawBackground(ctx, v, now, al) {
      const W = v.W, H = v.H;
      ctx.globalAlpha = al;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0a0a'); g.addColorStop(.62, '#170c04'); g.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (const s of stars) { ctx.globalAlpha = al * (.25 + .25 * Math.sin(now * .002 + s.p)); ctx.fillRect(wrap(s.x * W - v.camX * .01, W), s.y * H, s.s, s.s); }
      ctx.globalAlpha = al;
      // солнце: неоновое кольцо + мягкое свечение (позиция ограничена, не уезжает за экран)
      const sx = wrap(W * .72 - v.camX * .02 + 260, W + 520) - 260, sy = H * .32 - soft(v.camY * .015, 60), sr = 64;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3); sg.addColorStop(0, 'rgba(255,170,50,.28)'); sg.addColorStop(1, 'rgba(255,170,50,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr * 3, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.283); ctx.strokeStyle = 'rgba(255,200,80,.15)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,80,.5)'; ctx.lineWidth = 2; ctx.stroke();
      dune(ctx, v, .05, H * .60, 60, '#150d06', 'rgba(255,190,60,.10)', 1);
      dune(ctx, v, .10, H * .72, 80, '#1b1108', 'rgba(255,190,60,.16)', 1.3);
      for (const w of weeds) {                               // перекати-поле лежит на склоне средней дюны
        const px = wrap(w.x - v.camX * .12, W + 200) - 100, gy = duneY(v, .10, H * .72, 80, 1.3, px) + 6;
        ctx.fillStyle = 'rgba(0,0,0,' + (.35 / (1 + w.h * .08)) + ')';
        ctx.beginPath(); ctx.ellipse(px, gy, w.r * (1 - w.h * .01), w.r * .22, 0, 0, 6.283); ctx.fill();
        ctx.save(); ctx.translate(px, gy - w.r * .85 - w.h); ctx.scale(1 + w.sq * .14, 1 - w.sq * .14); ctx.rotate(w.rot);
        ctx.strokeStyle = 'rgba(255,200,90,.3)'; ctx.lineWidth = 1; ctx.beginPath();
        for (const s of w.tw) { ctx.moveTo(s.ox + Math.cos(s.a) * s.rr, s.oy + Math.sin(s.a) * s.rr); ctx.arc(s.ox, s.oy, s.rr, s.a, s.a + s.sw); }
        ctx.stroke(); ctx.restore();
      }
      dune(ctx, v, .18, H * .86, 70, '#241609', 'rgba(255,190,60,.24)', 1.7);
      drawSand(ctx, v, now, al, false);
      ctx.globalAlpha = 1;
    },
    drawForeground(ctx, v, now, al) { drawSand(ctx, v, now, al, true); },

    drawTrail(ctx, v, dt, pl, amount) {                      // пыль за шаром
      if (amount > .2 && Math.hypot(pl.vx, pl.vy) > 1.2 && Math.random() < .6 * dt)
        dust.push({ x: pl.x, y: pl.y + pl.r * .5, vx: -pl.vx * .2 + (Math.random() - .5) * .6, vy: -pl.vy * .2 - .2, l: 1 });
      ctx.fillStyle = SAND;
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.l -= .03 * dt;
        if (d.l <= 0) { dust.splice(i, 1); continue; }
        ctx.globalAlpha = d.l * .5; ctx.beginPath(); ctx.arc(d.x - v.camX, d.y - v.camY, 2 + (1 - d.l) * 3, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };
})();

// ═══════════════════════════ РЕЕСТР И API ══════════════════════════════════
const REGISTRY = [DESERT];                                   // сюда добавлять новые биомы
const state = REGISTRY.map(() => ({ amount: 0, visible: 0, was: 0 }));
let coverage = 0;

// палитра стен: класс 0 = обычные белые; класс bi*STEPS+step = смесь белого и цвета биома
const BASE_WALL = { core: [255, 255, 255], glow: [200, 230, 255, .75], soft: [255, 255, 255, .07] };
const mix = (a, b, k) => a.map((x, i) => { const r = x + (b[i] - x) * k; return i < 3 ? Math.round(r) : Math.round(r * 100) / 100; });
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`, rgba = a => `rgba(${a[0]},${a[1]},${a[2]},${a[3]})`;
const styles = [];
REGISTRY.forEach((b, bi) => { for (let s = 0; s < STEPS; s++) { const k = s / (STEPS - 1);
  styles[bi * STEPS + s] = { core: rgb(mix(BASE_WALL.core, b.wall.core, k)), glow: rgba(mix(BASE_WALL.glow, b.wall.glow, k)), soft: rgba(mix(BASE_WALL.soft, b.wall.soft, k)) }; } });

const Biomes = {
  get coverage() { return coverage; },
  wallClassCount: REGISTRY.length * STEPS,

  reset(o = {}) {
    seed = o.seed | 0;
    for (const k of ['cell', 'radius', 'fade', 'chance', 'bgRamp', 'weedSpeed']) if (o[k] != null) CFG[k] = o[k];
    safeIx = Math.floor((o.startX || 0) / CFG.cell); safeIy = Math.floor((o.startY || 0) / CFG.cell);
    REGISTRY.forEach((b, i) => { state[i].amount = state[i].visible = state[i].was = 0; if (b.reset) b.reset(); });
    coverage = 0;
  },

  update(dt, now, px, py) {
    let cov = 0;
    REGISTRY.forEach((b, i) => {
      const s = state[i];
      s.amount += (b.amountAt(px, py) - s.amount) * (1 - Math.pow(.98, dt));   // плавное «вплывание»
      if (s.was <= .01 && s.amount > .01 && b.onEnter) b.onEnter();
      s.was = s.amount;
      s.visible = Math.min(1, s.amount * CFG.bgRamp);                          // фон проявляется быстрее цвета стен
      if (s.visible > .01 && b.tick) b.tick(dt, now);
      if (s.visible > cov) cov = s.visible;
    });
    coverage = cov;
  },

  drawBackground(ctx, v, now) { REGISTRY.forEach((b, i) => { if (state[i].visible > .01 && b.drawBackground) b.drawBackground(ctx, v, now, state[i].visible); }); },
  drawForeground(ctx, v, now) { REGISTRY.forEach((b, i) => { if (state[i].visible > .01 && b.drawForeground) b.drawForeground(ctx, v, now, state[i].visible); }); },
  drawTrail(ctx, v, dt, pl)   { REGISTRY.forEach((b, i) => { if (b.drawTrail) b.drawTrail(ctx, v, dt, pl, state[i].amount); }); },

  wallClass(wx, wy) {
    let bi = -1, bv = 0;
    for (let i = 0; i < REGISTRY.length; i++) { const a = REGISTRY[i].amountAt(wx, wy); if (a > bv) { bv = a; bi = i; } }
    if (bi < 0) return 0;
    const step = Math.round(bv * (STEPS - 1));
    return step ? bi * STEPS + step : 0;
  },
  wallStyle(cls) { return styles[cls] || styles[0]; },
  amountAt(id, wx, wy) { const b = REGISTRY.find(x => x.id === id); return b ? b.amountAt(wx, wy) : 0; }
};

REGISTRY.forEach(b => { if (b.reset) b.reset(); });
global.Biomes = Biomes;
})(window);
