/* Background scenery, drawn on a full-screen canvas *behind* the terminal.
   Dark theme: "digit rain" with bright column heads; a shimmering spotlight
   of digits follows the cursor and a click/tap sends out a ripple.
   Light theme: CC0 sprite characters (GrafxKid, opengameart.org
   "Classic Hero" + "Classic Hero and Baddies Pack") walk across the bottom
   of the page — one is always around, activity summons more.
   Purely decorative: pointer-events are off and the terminal covers it,
   so it can never interfere with the actual terminal. */
(function () {
  "use strict";
  const canvas = document.getElementById("bg");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");

  let mode = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let W = 0;
  let H = 0;
  const pointer = { x: -1e4, y: -1e4 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false; /* keep pixel art crisp when scaled */
    initRain();
    walkers = [];
  }

  /* ---------------- dark theme: digit rain ---------------- */

  const CELL = 16;
  const GLOW_R = 120;
  let drops = [];
  let ripples = [];

  function initRain() {
    const cols = Math.ceil(W / CELL);
    drops = Array.from({ length: cols }, () => ({
      y: Math.floor(Math.random() * -40),
      t: Math.random() * 0.1,
      interval: 0.05 + Math.random() * 0.1, /* per-column speed */
    }));
    if (mode === "dark") {
      ctx.fillStyle = "#010409";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function digit() {
    return Math.floor(Math.random() * 10).toString();
  }

  function drawRain(dt) {
    /* translucent wash of the page bg = the fading trail effect */
    ctx.fillStyle = "rgba(1, 4, 9, 0.1)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = CELL + "px ui-monospace, Menlo, Consolas, monospace";
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.t += dt;
      if (d.t < d.interval) continue;
      d.t = 0;
      const x = i * CELL;
      const headY = d.y * CELL;
      /* the previous head cools down into a regular trail digit */
      ctx.fillStyle = "rgba(63, 185, 80, 0.55)";
      ctx.fillText(digit(), x, headY - CELL);
      /* bright leading digit */
      ctx.fillStyle = "rgba(200, 255, 214, 0.85)";
      ctx.fillText(digit(), x, headY);
      d.y++;
      if (d.y * CELL > H + CELL && Math.random() > 0.97) d.y = Math.floor(Math.random() * -20);
    }
    /* cursor spotlight: a shimmer of bright digits hugging the pointer,
       redrawn every frame so it tracks the cursor exactly */
    if (pointer.x > -CELL) {
      const c0 = Math.max(0, Math.floor((pointer.x - GLOW_R) / CELL));
      const c1 = Math.min(drops.length - 1, Math.ceil((pointer.x + GLOW_R) / CELL));
      const r0 = Math.floor((pointer.y - GLOW_R) / CELL);
      const r1 = Math.ceil((pointer.y + GLOW_R) / CELL);
      for (let ci = c0; ci <= c1; ci++) {
        for (let ri = r0; ri <= r1; ri++) {
          const gx = ci * CELL;
          const gy = ri * CELL;
          const dx = gx - pointer.x;
          const dy = gy - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > GLOW_R * GLOW_R || Math.random() > 0.15) continue;
          const t = 1 - Math.sqrt(d2) / GLOW_R;
          ctx.fillStyle = "rgba(160, 255, 190, " + (0.2 + 0.65 * t).toFixed(3) + ")";
          ctx.fillText(digit(), gx, gy);
        }
      }
    }
    /* click/tap ripples: an expanding ring of bright digits */
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 260 * dt;
      rp.age += dt;
      const a = 0.85 * (1 - rp.age / 0.8);
      if (a <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.fillStyle = "rgba(150, 255, 180, " + a.toFixed(3) + ")";
      const steps = Math.max(12, Math.floor(rp.r / 7));
      for (let s = 0; s < steps; s++) {
        const ang = (s / steps) * Math.PI * 2;
        const gx = Math.round((rp.x + Math.cos(ang) * rp.r) / CELL) * CELL;
        const gy = Math.round((rp.y + Math.sin(ang) * rp.r) / CELL) * CELL;
        ctx.fillText(digit(), gx, gy);
      }
    }
  }

  /* ---- light theme: walk-by characters (CC0 sprites by GrafxKid) ---- */

  function loadSheet(src) {
    const sheet = { canvas: null, ready: false };
    const img = new Image();
    img.onload = () => {
      /* the sheets have opaque backgrounds; chroma-key using pixel (0,0) */
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      const bg = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - bg[0]) < 12 && Math.abs(d[i + 1] - bg[1]) < 12 && Math.abs(d[i + 2] - bg[2]) < 12) d[i + 3] = 0;
      }
      g.putImageData(id, 0, 0);
      sheet.canvas = c;
      sheet.ready = true;
    };
    img.src = src;
    return sheet;
  }

  const SHEETS = {
    hero: loadSheet("assets/img/sprites/old_hero.png"),
    pack: loadSheet("assets/img/sprites/baddies.png"),
  };

  /* frames are tight [sx, sy, sw, sh] boxes; characters are drawn feet-down */
  const WALKER_DEFS = [
    { sheet: "hero", facesLeft: false,
      frames: [[19, 33, 11, 15], [35, 32, 12, 15], [52, 33, 9, 15], [67, 33, 11, 15], [83, 32, 12, 15], [99, 33, 12, 15]] },
    { sheet: "pack", facesLeft: false,
      frames: [[17, 142, 15, 18], [32, 142, 16, 17], [48, 142, 16, 18]] },
    { sheet: "pack", facesLeft: true,
      frames: [[96, 148, 16, 12], [113, 147, 14, 12], [129, 148, 14, 12], [144, 148, 16, 12], [160, 147, 16, 12], [176, 148, 16, 12]] },
    { sheet: "pack", facesLeft: true,
      frames: [[98, 161, 12, 15], [113, 160, 13, 15], [130, 161, 12, 15], [146, 161, 12, 15], [162, 160, 12, 15], [178, 161, 12, 15]] },
  ];
  const WSCALE = 3;

  let walkers = [];
  let lastSpawn = -1e9;
  let emptyT = 0;

  function spawnWalker(forceDef, forceDir) {
    if (mode !== "light" || walkers.length >= 3) return;
    const now = performance.now();
    if (forceDef === undefined && now - lastSpawn < 4000) return;
    const def = WALKER_DEFS[forceDef !== undefined ? forceDef : Math.floor(Math.random() * WALKER_DEFS.length)];
    if (!SHEETS[def.sheet].ready) return;
    const dir = forceDir !== undefined ? forceDir : Math.random() < 0.5 ? -1 : 1;
    const maxW = Math.max.apply(null, def.frames.map((f) => f[2])) * WSCALE;
    walkers.push({
      def,
      dir,
      x: dir === 1 ? -maxW : W + maxW, /* x is the sprite's center */
      speed: 45 + Math.random() * 40,
      frame: 0,
      frameT: 0,
    });
    lastSpawn = now;
  }
  window.__bgSpawnWalker = spawnWalker; /* handle for headless tests */

  function drawWalkers(dt) {
    ctx.clearRect(0, 0, W, H);
    /* keep the scene alive: if nobody is on screen, someone strolls in */
    if (walkers.length === 0) {
      emptyT += dt;
      if (emptyT > 2) {
        spawnWalker();
        if (walkers.length > 0) emptyT = 0;
      }
    } else {
      emptyT = 0;
    }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const wk = walkers[i];
      wk.x += wk.dir * wk.speed * dt;
      wk.frameT += dt;
      if (wk.frameT > 0.14) {
        wk.frameT = 0;
        wk.frame = (wk.frame + 1) % wk.def.frames.length;
      }
      const sheet = SHEETS[wk.def.sheet];
      const f = wk.def.frames[wk.frame];
      const dw = f[2] * WSCALE;
      const dh = f[3] * WSCALE;
      const y = H - 6 - dh;
      const mirror = wk.def.facesLeft ? wk.dir === 1 : wk.dir === -1;
      ctx.save();
      ctx.globalAlpha = 0.92;
      if (mirror) {
        ctx.translate(wk.x + dw / 2, y);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet.canvas, f[0], f[1], f[2], f[3], 0, 0, dw, dh);
      } else {
        ctx.drawImage(sheet.canvas, f[0], f[1], f[2], f[3], wk.x - dw / 2, y, dw, dh);
      }
      ctx.restore();
      if (wk.x < -dw - 60 || wk.x > W + dw + 60) walkers.splice(i, 1);
    }
  }

  /* ---------------- interaction wiring ---------------- */
  /* Listeners are passive and read-only, so the terminal is unaffected. */

  let moveGate = 0;

  document.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (mode === "light") {
        const now = performance.now();
        if (now > moveGate) {
          moveGate = now + 900;
          if (Math.random() < 0.07) spawnWalker();
        }
      }
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerdown",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (mode === "dark") {
        ripples.push({ x: e.clientX, y: e.clientY, r: 8, age: 0 });
        if (ripples.length > 6) ripples.shift();
      } else if (Math.random() < 0.3) {
        spawnWalker();
      }
    },
    { passive: true }
  );

  document.addEventListener("keydown", () => {
    if (mode === "light" && Math.random() < 0.05) spawnWalker();
  });

  document.addEventListener(
    "scroll",
    () => {
      if (mode === "light" && Math.random() < 0.03) spawnWalker();
    },
    { capture: true, passive: true }
  );

  /* ---------------- loop + wiring ---------------- */

  let last = performance.now();
  function loop(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    if (mode === "dark") drawRain(dt);
    else drawWalkers(dt);
    requestAnimationFrame(loop);
  }

  document.addEventListener("themechange", (e) => {
    mode = e.detail === "light" ? "light" : "dark";
    ctx.clearRect(0, 0, W, H);
    ripples = [];
    walkers = [];
    emptyT = 1.5; /* a walk-by greets the light theme almost immediately */
    if (mode === "dark") initRain();
  });

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(loop);
})();
