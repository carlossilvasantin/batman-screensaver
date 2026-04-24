(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const standby = document.getElementById('standby');

  let W, H;
  let screenIndex = 0;
  let totalScreens = 1;
  let mode = 'individual';
  let active = false;
  let startTime = 0;
  let raf = null;

  // ─── Resize ───────────────────────────────────────────────────────────────

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── Seeded PRNG ─────────────────────────────────────────────────────────

  function mkRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s ^ (s >>> 15), 1 | s);
      s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
      return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── City Skyline ─────────────────────────────────────────────────────────

  let cityBuildings = null;

  function buildCity(totalW) {
    const rng = mkRng(0xBAT_SEED || 0xba77);
    const buildings = [];
    let x = 0;
    while (x < totalW + 200) {
      const bw = 45 + rng() * 110;
      const bh = H * (0.12 + rng() * 0.58);
      const dark = Math.floor(4 + rng() * 14);
      const wins = [];
      for (let wy = 6; wy < bh - 12; wy += 18) {
        for (let wx = 6; wx < bw - 10; wx += 13) {
          if (rng() > 0.42) wins.push({ x: wx, y: wy, lit: rng() > 0.28 });
        }
      }
      buildings.push({ x, y: H - bh, w: bw, h: bh, dark, wins });
      x += bw + rng() * 6;
    }
    return buildings;
  }

  function ensureCity() {
    if (!cityBuildings) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(totalScreens)));
      cityBuildings = buildCity(W * cols);
    }
  }

  function drawCity(offsetX) {
    if (!cityBuildings) return;
    cityBuildings.forEach((b) => {
      const bx = b.x - offsetX;
      if (bx > W + 10 || bx + b.w < -10) return;
      const d = b.dark;
      ctx.fillStyle = `rgb(${d},${d},${d + 6})`;
      ctx.fillRect(bx, b.y, b.w, b.h);
      b.wins.forEach((w) => {
        if (w.lit) {
          ctx.fillStyle = 'rgba(255,215,80,0.65)';
          ctx.fillRect(bx + w.x, b.y + w.y, 5, 7);
        }
      });
    });
  }

  // ─── Background ───────────────────────────────────────────────────────────

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#02020a');
    g.addColorStop(0.65, '#05050f');
    g.addColorStop(1, '#090914');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Bat Shape ────────────────────────────────────────────────────────────

  function batPath(ctx, size, wing) {
    const w = wing * 0.38;
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.22, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // head + ears
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.18, size * 0.13, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    [[- 1, -1], [1, -1]].forEach(([sx]) => {
      ctx.beginPath();
      ctx.moveTo(sx * size * 0.06, -size * 0.26);
      ctx.lineTo(sx * size * 0.2, -size * 0.5);
      ctx.lineTo(sx * -0.02 + sx * size * 0.0, -size * 0.28);
      ctx.closePath();
      ctx.fill();
    });
    // wings
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx * size * 0.18, 0);
      ctx.bezierCurveTo(
        sx * size * 0.48, -size * (0.28 + w),
        sx * size * 0.82, -size * (0.18 + w),
        sx * size, 0
      );
      ctx.bezierCurveTo(
        sx * size * 0.78, size * 0.22,
        sx * size * 0.38, size * 0.24,
        sx * size * 0.18, size * 0.1
      );
      ctx.closePath();
      ctx.fill();
    });
  }

  // ─── Batman Logo ──────────────────────────────────────────────────────────

  function drawLogo(cx, cy, size, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    const s = size / 180;
    ctx.scale(s, s);

    // gold oval
    ctx.beginPath();
    ctx.ellipse(0, 8, 172, 108, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.shadowBlur = size * 0.25;
    ctx.shadowColor = '#FFD700';
    ctx.fill();
    ctx.shadowBlur = 0;

    // bat body + wings
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, 62);
    ctx.bezierCurveTo(10, 52, 20, 38, 16, 20);
    ctx.bezierCurveTo(28, 10, 40, 20, 36, 36);
    ctx.bezierCurveTo(52, 50, 88, 22, 138, -28);
    ctx.bezierCurveTo(118, 4, 126, 28, 108, 44);
    ctx.bezierCurveTo(90, 60, 58, 50, 40, 60);
    ctx.bezierCurveTo(28, 68, 14, 73, 0, 76);
    ctx.bezierCurveTo(-14, 73, -28, 68, -40, 60);
    ctx.bezierCurveTo(-58, 50, -90, 60, -108, 44);
    ctx.bezierCurveTo(-126, 28, -118, 4, -138, -28);
    ctx.bezierCurveTo(-88, 22, -52, 50, -36, 36);
    ctx.bezierCurveTo(-40, 20, -28, 10, -16, 20);
    ctx.bezierCurveTo(-20, 38, -10, 52, 0, 62);
    ctx.closePath();
    ctx.fill();

    // ears
    [[8, 22, 28, -42, 48, 18], [-8, 22, -28, -42, -48, 18]].forEach(
      ([x1, y1, x2, y2, x3, y3]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
      }
    );

    ctx.restore();
  }

  // ─── Bat-Signal ───────────────────────────────────────────────────────────

  function drawSignal(x, y, rot, intensity) {
    if (intensity <= 0.02) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = intensity;

    const len = Math.hypot(W, H) * 1.8;
    const spread = Math.PI / 7;

    // cone
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(-spread) * len, -Math.cos(-spread) * len);
    ctx.lineTo(Math.sin(spread) * len, -Math.cos(spread) * len);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, -len);
    cg.addColorStop(0, 'rgba(255,255,190,0.48)');
    cg.addColorStop(0.25, 'rgba(255,255,190,0.14)');
    cg.addColorStop(1, 'rgba(255,255,190,0)');
    ctx.fillStyle = cg;
    ctx.fill();

    // source glow
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 80);
    sg.addColorStop(0, 'rgba(255,255,200,0.5)');
    sg.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.fillStyle = sg;
    ctx.fill();

    ctx.restore();

    // logo projected in the beam
    const dist = H * 0.38;
    const lx = x + Math.sin(rot) * dist;
    const ly = y - Math.cos(rot) * dist;
    drawLogo(lx, ly, 145 * Math.min(1, intensity), intensity);
  }

  // ─── Entities ─────────────────────────────────────────────────────────────

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = -0.08 - Math.random() * 0.35;
      this.r = 0.8 + Math.random() * 2.2;
      this.phase = Math.random() * Math.PI * 2;
      this.spd = 0.6 + Math.random() * 1.6;
      this.hue = 38 + Math.random() * 22;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -4 || this.x < -4 || this.x > W + 4) this.reset();
      if (this.y > H + 4) { this.y = -4; this.x = Math.random() * W; }
    }
    draw(t) {
      const a = 0.35 + 0.45 * Math.sin(t * this.spd + this.phase);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${this.hue},88%,62%)`;
      ctx.shadowBlur = 7;
      ctx.shadowColor = `hsl(${this.hue},100%,68%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class FlyingBat {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 1.8;
      this.vy = -0.4 - Math.random() * 1.2;
      this.size = 9 + Math.random() * 16;
      this.phase = Math.random() * Math.PI * 2;
      this.ws = 3.5 + Math.random() * 4;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -35) { this.y = H + 10; this.x = Math.random() * W; }
      if (this.x < -35) this.x = W + 35;
      if (this.x > W + 35) this.x = -35;
    }
    draw(t) {
      const wing = Math.sin(t * this.ws + this.phase);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = 'rgba(4,4,16,0.88)';
      batPath(ctx, this.size, wing);
      ctx.restore();
    }
  }

  class RainBat {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -30;
      this.vy = 1.8 + Math.random() * 3.5;
      this.vx = (Math.random() - 0.5) * 0.7;
      this.size = 7 + Math.random() * 18;
      this.phase = Math.random() * Math.PI * 2;
      this.ws = 4 + Math.random() * 5;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y > H + 35) this.reset(false);
      if (this.x < -35 || this.x > W + 35) this.x = Math.random() * W;
    }
    draw(t) {
      const wing = Math.sin(t * this.ws + this.phase);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.PI); // heads down when falling
      ctx.fillStyle = 'rgba(5,5,18,0.92)';
      batPath(ctx, this.size, wing);
      ctx.restore();
    }
  }

  let particles = [];
  let flyBats = [];
  let rainBats = [];

  function initEntities() {
    cityBuildings = null;
    ensureCity();
    particles = Array.from({ length: 130 }, () => new Particle());
    flyBats = Array.from({ length: 11 }, () => new FlyingBat());
    rainBats = Array.from({ length: 28 }, () => new RainBat());
  }

  // ─── Mode Renderers ───────────────────────────────────────────────────────

  function renderIndividual(t) {
    drawBg();
    const rot = Math.sin(t * 0.22) * 0.32;
    drawSignal(W * 0.5, H * 0.88, rot, 1);
    drawCity(0);
    particles.forEach((p) => { p.update(); p.draw(t); });
    flyBats.forEach((b) => { b.update(); b.draw(t); });
  }

  function renderUnificado(t) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(totalScreens)));
    const col = screenIndex % cols;
    const offX = col * W;
    const totalW = cols * W;

    drawBg();

    // signal centered in the virtual panorama
    const sigVX = totalW / 2;
    const sigLX = sigVX - offX;
    const dist = Math.abs(sigLX - W / 2);
    const intensity = Math.max(0, 1 - dist / (W * 1.6));
    const rot = Math.sin(t * 0.16) * 0.28;
    drawSignal(sigLX, H * 0.86, rot, intensity);

    drawCity(offX);
    particles.forEach((p) => { p.update(); p.draw(t); });
    flyBats.forEach((b) => { b.update(); b.draw(t); });
  }

  function renderBatsignal(t) {
    drawBg();

    const cols = Math.max(1, Math.ceil(Math.sqrt(totalScreens)));
    const col = screenIndex % cols;
    const offX = col * W;
    const totalW = cols * W;

    // signal sweeps left→right→left across virtual canvas
    const sweepX = ((Math.sin(t * 0.28) * 0.5 + 0.5) * totalW);
    const localX = sweepX - offX;
    const dist = Math.abs(sweepX - (offX + W / 2));
    const intensity = Math.max(0, 1 - dist / (W * 1.4));

    const rot = Math.sin(t * 0.18) * 0.22;
    drawSignal(localX, H * 0.85, rot, intensity);

    drawCity(0);
    particles.forEach((p) => { p.update(); p.draw(t); });
  }

  function renderLluvia(t) {
    // fade instead of clear → ghostly trails
    ctx.fillStyle = 'rgba(2,2,10,0.16)';
    ctx.fillRect(0, 0, W, H);

    rainBats.forEach((b) => { b.update(); b.draw(t); });

    // sporadic bat-signal flashes
    const flash = Math.sin(t * 0.55) * Math.sin(t * 1.4);
    if (flash > 0.72) {
      const i = (flash - 0.72) * 3.57;
      drawSignal(W * 0.5, H * 0.88, Math.sin(t * 0.35) * 0.45, i * 0.55);
    }

    particles.forEach((p) => { p.update(); p.draw(t); });
  }

  // ─── Main Loop ────────────────────────────────────────────────────────────

  function loop() {
    if (!active) return;
    const t = (Date.now() - startTime) / 1000;

    if (mode !== 'lluvia') ctx.clearRect(0, 0, W, H);

    switch (mode) {
      case 'individual': renderIndividual(t); break;
      case 'unificado':  renderUnificado(t);  break;
      case 'batsignal':  renderBatsignal(t);  break;
      case 'lluvia':     renderLluvia(t);     break;
      default:           renderIndividual(t); break;
    }

    raf = requestAnimationFrame(loop);
  }

  // ─── Command Handler ──────────────────────────────────────────────────────

  function handleCommand(cmd) {
    switch (cmd.action) {
      case 'activate':
        screenIndex = cmd.screenIndex ?? 0;
        totalScreens = cmd.totalScreens ?? 1;
        mode = cmd.mode ?? 'individual';
        startTime = cmd.startTime ?? Date.now();
        active = true;
        initEntities();
        standby.classList.add('hidden');
        if (!raf) loop();
        break;

      case 'deactivate':
        active = false;
        cancelAnimationFrame(raf);
        raf = null;
        standby.classList.remove('hidden');
        ctx.clearRect(0, 0, W, H);
        break;

      case 'setMode':
        if (mode === 'lluvia' && cmd.mode !== 'lluvia') ctx.clearRect(0, 0, W, H);
        if (cmd.mode) mode = cmd.mode;
        break;
    }
  }

  if (window.batman) window.batman.onCommand(handleCommand);
})();
