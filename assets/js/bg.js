/* Background scenery, drawn on a full-screen canvas *behind* the terminal.
   Dark theme: faint "digit rain". Light theme: retro pixel critters.
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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initRain();
    initCritters();
  }

  /* ---------------- dark theme: digit rain ---------------- */

  const CELL = 16;
  let drops = [];

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

  function drawRain(dt) {
    /* translucent wash of the page bg = the fading trail effect */
    ctx.fillStyle = "rgba(1, 4, 9, 0.1)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = CELL + "px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(63, 185, 80, 0.45)"; /* faint accent green */
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.t += dt;
      if (d.t < d.interval) continue;
      d.t = 0;
      ctx.fillText(Math.floor(Math.random() * 10).toString(), i * CELL, d.y * CELL);
      d.y++;
      if (d.y * CELL > H + CELL && Math.random() > 0.97) d.y = Math.floor(Math.random() * -20);
    }
  }

  /* -------------- light theme: pixel critters -------------- */

  /* Solarized accents on the cream background */
  const PAL = { b: "#268bd2", c: "#2aa198", g: "#859900", m: "#d33682", y: "#b58900", o: "#cb4b16", k: "#586e75" };
  const SCALE = 4;

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
  };

  let critters = [];

  function initCritters() {
    const types = ["robot", "slime", "ghost"];
    const n = Math.max(3, Math.min(7, Math.floor(W / 260)));
    critters = Array.from({ length: n }, (_, i) => ({
      type: types[i % types.length],
      x: 20 + Math.random() * Math.max(40, W - 80),
      dir: Math.random() < 0.5 ? -1 : 1,
      frame: 0,
      frameT: Math.random() * 0.25,
      state: "idle",
      stateT: 0.5 + Math.random() * 2,
      bobPhase: Math.random() * Math.PI * 2,
    }));
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

  function drawCritters(dt) {
    ctx.clearRect(0, 0, W, H);
    const ground = H - 8;

    for (const cr of critters) {
      cr.frameT += dt;
      if (cr.frameT > 0.25) {
        cr.frameT = 0;
        cr.frame ^= 1;
      }
      cr.stateT -= dt;
      let yoff = 0;

      if (cr.type === "ghost") {
        /* drifts and bobs forever */
        cr.bobPhase += 1.8 * dt;
        cr.x += cr.dir * 13 * dt;
        yoff = 28 + Math.sin(cr.bobPhase) * 10;
        if (cr.stateT <= 0) {
          cr.stateT = 3 + Math.random() * 6;
          if (Math.random() < 0.4) cr.dir *= -1;
        }
      } else if (cr.type === "slime") {
        /* hop → rest → hop */
        if (cr.state === "hop") {
          const progress = 1 - cr.stateT / 0.45;
          yoff = Math.sin(Math.PI * Math.min(Math.max(progress, 0), 1)) * 14;
          cr.x += cr.dir * 55 * dt;
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
          cr.x += cr.dir * 22 * dt;
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
      drawSprite(art, cr.x, ground - art.length * SCALE - yoff, cr.dir, 0.55);
    }
  }

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
    if (mode === "dark") initRain();
  });

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(loop);
})();
