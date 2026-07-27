/* Background scenery, drawn on a full-screen canvas *behind* the terminal.
   Dark theme: nothing — plain page background, kept deliberately simple.
   Light theme: a bank of CC0 pixel characters (GrafxKid's "Classic Hero" +
   "Classic Hero and Baddies Pack", 0x72's "DungeonTileset II", both on
   opengameart.org/itch.io, plus retro palette-swap recolors of the
   monsters) walk across the bottom of the page — one is always around,
   activity summons more.
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
    ctx.imageSmoothingEnabled = false; /* keep pixel art crisp when scaled */
    walkers = [];
  }

  /* ---- light theme: walk-by characters (CC0 sprite sheets) ---- */

  const SHEETS = {};

  /* classic palette-swap recolor: rotate the RGB channels; grays (outlines,
     whites, bone) stay put, everything colored lands on a new palette */
  function rotChannels(src, times) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i];
      const gr = d[i + 1];
      const b = d[i + 2];
      if (times === 1) {
        d[i] = gr; d[i + 1] = b; d[i + 2] = r;
      } else {
        d[i] = b; d[i + 1] = r; d[i + 2] = gr;
      }
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  /* registers SHEETS[name] (and recolor variants name~1, name~2) up front so
     defs can reference them before the image finishes loading */
  function registerSheet(name, src, variants) {
    SHEETS[name] = { canvas: null, ready: false };
    if (variants) {
      SHEETS[name + "~1"] = { canvas: null, ready: false };
      SHEETS[name + "~2"] = { canvas: null, ready: false };
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      /* sheets with opaque backgrounds get chroma-keyed on pixel (0,0);
         sheets that already have transparency are left alone */
      if (d[3] !== 0) {
        const bg = [d[0], d[1], d[2]];
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - bg[0]) < 12 && Math.abs(d[i + 1] - bg[1]) < 12 && Math.abs(d[i + 2] - bg[2]) < 12) d[i + 3] = 0;
        }
        g.putImageData(id, 0, 0);
      }
      SHEETS[name].canvas = c;
      SHEETS[name].ready = true;
      if (variants) {
        SHEETS[name + "~1"].canvas = rotChannels(c, 1);
        SHEETS[name + "~1"].ready = true;
        SHEETS[name + "~2"].canvas = rotChannels(c, 2);
        SHEETS[name + "~2"].ready = true;
      }
    };
    img.src = src;
  }

  registerSheet("hero", "assets/img/sprites/old_hero.png", false);
  registerSheet("pack", "assets/img/sprites/baddies.png", true);
  registerSheet("dungeon", "assets/img/sprites/dungeon.png", true);

  /* GrafxKid characters: tight [sx, sy, sw, sh] frame boxes, drawn feet-down */
  const WALKER_DEFS = [
    { sheet: "hero", facesLeft: false, scale: 3,
      frames: [[19, 33, 11, 15], [35, 32, 12, 15], [52, 33, 9, 15], [67, 33, 11, 15], [83, 32, 12, 15], [99, 33, 12, 15]] },
    { sheet: "pack", facesLeft: false, scale: 3,
      frames: [[20, 147, 9, 13], [35, 146, 11, 13], [52, 147, 9, 13]] },
    { sheet: "pack", facesLeft: true, scale: 3,
      frames: [[96, 148, 16, 12], [113, 147, 14, 12], [129, 148, 14, 12], [144, 148, 16, 12], [160, 147, 16, 12], [176, 148, 16, 12]] },
    { sheet: "pack", facesLeft: true, scale: 3,
      frames: [[98, 161, 12, 15], [113, 160, 13, 15], [130, 161, 12, 15], [146, 161, 12, 15], [162, 160, 12, 15], [178, 161, 12, 15]] },
  ];

  /* recolored twins of the two GrafxKid monsters */
  for (const base of [WALKER_DEFS[2], WALKER_DEFS[3]]) {
    WALKER_DEFS.push({ sheet: "pack~1", facesLeft: base.facesLeft, scale: base.scale, frames: base.frames });
    WALKER_DEFS.push({ sheet: "pack~2", facesLeft: base.facesLeft, scale: base.scale, frames: base.frames });
  }

  /* 0x72 DungeonTileset II run cycles: [x, y, w, h, monster] straight from
     tiles_list_v1.3 (4 frames each, laid out horizontally, all face right).
     monster=1 rows also get the two palette-swap recolors. */
  const DUNGEON_RUNS = [
    [432, 16, 16, 16, 1], [432, 32, 16, 16, 1], [432, 48, 16, 16, 1], [432, 80, 16, 16, 1],
    [368, 112, 16, 16, 1], [432, 112, 16, 16, 1], [368, 144, 16, 16, 1], [432, 144, 16, 16, 1],
    [432, 172, 16, 20, 1], [432, 204, 16, 20, 1], [432, 236, 16, 20, 1], [368, 268, 16, 20, 1],
    [432, 300, 16, 20, 1], [432, 328, 16, 24, 1],
    [144, 270, 32, 34, 1], [144, 320, 32, 32, 1], [144, 364, 32, 36, 1],
    [192, 4, 16, 28, 0], [192, 36, 16, 28, 0], [192, 68, 16, 28, 0], [192, 100, 16, 28, 0],
    [192, 132, 16, 28, 0], [192, 164, 16, 28, 0], [192, 196, 16, 28, 0], [192, 228, 16, 28, 0],
  ];
  for (const [x, y, w, h, monster] of DUNGEON_RUNS) {
    const frames = [0, 1, 2, 3].map((i) => [x + i * w, y, w, h]);
    const scale = h > 24 ? 2 : 3;
    for (const v of monster ? ["", "~1", "~2"] : [""]) {
      WALKER_DEFS.push({ sheet: "dungeon" + v, facesLeft: false, scale, frames });
    }
  }

  let walkers = [];
  let lastSpawn = -1e9;
  let emptyT = 0;

  function spawnWalker(forceDef, forceDir) {
    if (mode !== "light" || walkers.length >= 6) return;
    const now = performance.now();
    if (forceDef === undefined && now - lastSpawn < 2500) return;
    const def = WALKER_DEFS[forceDef !== undefined ? forceDef : Math.floor(Math.random() * WALKER_DEFS.length)];
    if (!SHEETS[def.sheet].ready) return;
    const dir = forceDir !== undefined ? forceDir : Math.random() < 0.5 ? -1 : 1;
    const maxW = Math.max.apply(null, def.frames.map((f) => f[2])) * def.scale;
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
  window.__bgDefCount = WALKER_DEFS.length;

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
      const dw = f[2] * wk.def.scale;
      const dh = f[3] * wk.def.scale;
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
    () => {
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
    () => {
      if (mode === "light" && Math.random() < 0.3) spawnWalker();
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

  /* The loop only runs while the light theme is showing — the dark theme
     draws nothing, so leaving it armed would burn a callback every frame
     on the default theme. rAF ids are always non-zero, so 0 means parked. */

  let last = 0;
  let rafId = 0;

  function loop(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    drawWalkers(dt);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId) return;
    last = performance.now(); /* same time origin as the rAF timestamp */
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  document.addEventListener("themechange", (e) => {
    mode = e.detail === "light" ? "light" : "dark";
    ctx.clearRect(0, 0, W, H);
    walkers = [];
    emptyT = 1.5; /* a walk-by greets the light theme almost immediately */
    if (mode === "light") start();
    else stop();
  });

  window.addEventListener("resize", resize);
  resize();
  if (mode === "light") start();
})();
