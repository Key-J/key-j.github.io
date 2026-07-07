/* Background scenery, drawn on a full-screen canvas *behind* the terminal.
   Dark theme: "digit rain" with bright column heads; the cursor makes nearby
   digits glow and a click/tap sends out a ripple of bright digits.
   Light theme: retro pixel scene, plus CC0 sprite characters (GrafxKid,
   opengameart.org "Classic Hero" + "Classic Hero and Baddies Pack") that
   occasionally walk across the bottom of the page in response to activity.
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
    initCritters();
  }

  /* ---------------- dark theme: digit rain ---------------- */

  const CELL = 16;
  const GLOW_R2 = 130 * 130;
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

  function nearPointer(x, y) {
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    return dx * dx + dy * dy < GLOW_R2;
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
      ctx.fillStyle = nearPointer(x, headY - CELL) ? "rgba(126, 231, 135, 0.9)" : "rgba(63, 185, 80, 0.55)";
      ctx.fillText(digit(), x, headY - CELL);
      /* bright leading digit, near-white when the cursor is close */
      ctx.fillStyle = nearPointer(x, headY) ? "rgba(255, 255, 255, 0.95)" : "rgba(200, 255, 214, 0.85)";
      ctx.fillText(digit(), x, headY);
      d.y++;
      if (d.y * CELL > H + CELL && Math.random() > 0.97) d.y = Math.floor(Math.random() * -20);
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

  /* -------------- light theme: pixel critters -------------- */

  /* Solarized accents on the cream background */
  const PAL = { b: "#268bd2", c: "#2aa198", g: "#859900", m: "#d33682", y: "#b58900", o: "#cb4b16", k: "#586e75", a: "#93a1a1" };
  const SCALE = 6;

  const ART = {
    robot: [
      ["..bbb..", ".bbbbb.", ".bkbkb.", ".bbbbb.", "..yyy..", ".y.y.y.", "..b.b..", "..b.b.."],
      ["..bbb..", ".bbbbb.", ".bkbkb.", ".bbbbb.", "..yyy..", ".y.y.y.", "..b.b..", ".b...b."],
    ],
    slime: [
      ["..ggg..", ".ggggg.", "ggkgkgg", "ggggggg", "ggggggg"],
      [".ggggg.", "ggkgkgg", "ggggggg", "ggggggg"],
    ],
    ghost: [
      ["..mmm..", ".mmmmm.", ".mkmkm.", ".mmmmm.", ".mmmmm.", ".m.m.m."],
      ["..mmm..", ".mmmmm.", ".mkmkm.", ".mmmmm.", ".mmmmm.", "..m.m.."],
    ],
    cloud: [["...aaaa....", ".aaaaaaaa..", "aaaaaaaaaaa"]],
    sun: [["..yyy..", ".yyyyy.", "yyyyyyy", "yyyyyyy", "yyyyyyy", ".yyyyy.", "..yyy.."]],
  };

  let critters = [];
  let clouds = [];

  function initCritters() {
    const types = ["robot", "slime", "ghost"];
    const n = Math.max(3, Math.min(6, Math.floor(W / 260)));
    critters = Array.from({ length: n }, (_, i) => ({
      type: types[i % types.length],
      x: 20 + Math.random() * Math.max(40, W - 80),
      dir: Math.random() < 0.5 ? -1 : 1,
      frame: 0,
      frameT: Math.random() * 0.25,
      state: "idle",
      stateT: 0.5 + Math.random() * 2,
      bobPhase: Math.random() * Math.PI * 2,
      baseY: H * (0.2 + Math.random() * 0.55), /* ghosts roam mid-air */
    }));
    const cn = Math.max(2, Math.min(5, Math.floor(W / 450)));
    clouds = Array.from({ length: cn }, () => ({
      x: Math.random() * W,
      y: H * (0.04 + Math.random() * 0.15),
      speed: 6 + Math.random() * 8,
    }));
    walkers = [];
  }

  function drawSprite(art, x, y, dir, alpha) {
    ctx.globalAlpha = alpha;
    const w = art[0].length;
    for (let r = 0; r < art.length; r++) {
      for (let c = 0; c < w; c++) {
        const ch = art[r][dir === -1 ? w - 1 - c : c];
        if (ch === ".") continue;
        ctx.fillStyle = PAL[ch];
        ctx.fillRect(Math.round(x) + c * SCALE, Math.round(y) + r * SCALE, SCALE, SCALE);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- walk-by characters (CC0 sprite sheets by GrafxKid) ---- */

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
      speed: 40 + Math.random() * 35,
      frame: 0,
      frameT: 0,
    });
    lastSpawn = now;
  }
  window.__bgSpawnWalker = spawnWalker; /* handle for headless tests */

  function drawWalkers(dt) {
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

  function drawCritters(dt) {
    ctx.clearRect(0, 0, W, H);
    const ground = H - 8;

    /* sun in the top-right corner */
    drawSprite(ART.sun[0], W - 7 * SCALE - 28, 24, 1, 0.55);

    /* clouds drifting across the top */
    for (const cl of clouds) {
      cl.x -= cl.speed * dt;
      if (cl.x < -11 * SCALE - 20) cl.x = W + 20;
      drawSprite(ART.cloud[0], cl.x, cl.y, 1, 0.5);
    }

    for (const cr of critters) {
      cr.frameT += dt;
      if (cr.frameT > 0.25) {
        cr.frameT = 0;
        cr.frame ^= 1;
      }
      cr.stateT -= dt;
      let yoff = 0;

      if (cr.type === "ghost") {
        /* roams mid-air across the whole page, bobbing */
        cr.bobPhase += 1.8 * dt;
        cr.x += cr.dir * 18 * dt;
        if (cr.stateT <= 0) {
          cr.stateT = 3 + Math.random() * 6;
          if (Math.random() < 0.4) cr.dir *= -1;
        }
      } else if (cr.type === "slime") {
        /* hop → rest → hop */
        if (cr.state === "hop") {
          const progress = 1 - cr.stateT / 0.45;
          yoff = Math.sin(Math.PI * Math.min(Math.max(progress, 0), 1)) * 20;
          cr.x += cr.dir * 70 * dt;
          if (cr.stateT <= 0) {
            cr.state = "idle";
            cr.stateT = 0.6 + Math.random() * 1.8;
          }
        } else if (cr.stateT <= 0) {
          cr.state = "hop";
          cr.stateT = 0.45;
          if (Math.random() < 0.25) cr.dir *= -1;
        }
        cr.frame = cr.state === "hop" ? 1 : 0;
      } else {
        /* robot: walk → pause → walk */
        if (cr.state === "walk") {
          cr.x += cr.dir * 28 * dt;
          if (cr.stateT <= 0) {
            cr.state = "idle";
            cr.stateT = 1 + Math.random() * 2.5;
          }
        } else {
          cr.frame = 0;
          if (cr.stateT <= 0) {
            cr.state = "walk";
            cr.stateT = 2 + Math.random() * 3;
            if (Math.random() < 0.35) cr.dir *= -1;
          }
        }
      }

      const spriteW = 7 * SCALE;
      if (cr.x < 10) cr.dir = 1;
      if (cr.x > W - spriteW - 10) cr.dir = -1;

      const art = ART[cr.type][cr.frame];
      const y = cr.type === "ghost" ? cr.baseY + Math.sin(cr.bobPhase) * 14 : ground - art.length * SCALE - yoff;
      drawSprite(art, cr.x, y, cr.dir, 0.75);
    }

    drawWalkers(dt);
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
    else drawCritters(dt);
    requestAnimationFrame(loop);
  }

  document.addEventListener("themechange", (e) => {
    mode = e.detail === "light" ? "light" : "dark";
    ctx.clearRect(0, 0, W, H);
    ripples = [];
    if (mode === "dark") initRain();
    else setTimeout(spawnWalker, 1200); /* greet the light theme with a walk-by */
  });

  window.addEventListener("resize", resize);
  resize();
  if (mode === "light") setTimeout(spawnWalker, 1500);
  requestAnimationFrame(loop);
})();
