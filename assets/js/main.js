(function () {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const applog = document.getElementById("applog");
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("cmd-input");

  const SECTIONS = ["news", "projects", "publications", "contact"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- theme ---------------- */

  function setTheme(name) {
    root.dataset.theme = name;
    localStorage.setItem("theme", name);
    document.dispatchEvent(new CustomEvent("themechange", { detail: name }));
  }
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;

  /* titlebar toggle, labeled with the theme it switches TO; the `theme`
     command routes through setTheme too, so themechange keeps it in sync */
  const themeBtn = document.getElementById("theme-toggle");
  function syncThemeBtn() {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    themeBtn.textContent = "[" + next + "]";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
  }
  themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light"));
  document.addEventListener("themechange", syncThemeBtn);
  syncThemeBtn();

  /* ---------------- output helpers ---------------- */

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  const PS1 = '<span class="prompt"><span class="p-host">jackie@google</span>:<span class="p-path">~</span>$</span>';

  /* ---------------- typewriter reveal ----------------
     Output streams in line by line like a real terminal; a command run
     by clicking (not typing) is first typed into the real prompt and
     submitted. Any key or click skips to the end of the current reveal. */

  const REVEAL_MS = 70; // per output line
  const TYPE_MS = 30; // per character typed into the prompt for a click
  const ENTER_MS = 150; // beat between the last character and "Enter"

  let activeReveal = null;

  function finishReveal() {
    if (activeReveal) {
      const r = activeReveal;
      activeReveal = null;
      r.finish();
    }
  }

  /* ticks: [{ delay, fn }] — delay is the pause BEFORE that tick */
  function playTicks(ticks) {
    finishReveal();
    if (!ticks.length) return;
    if (reducedMotion) {
      ticks.forEach((t) => t.fn());
      return;
    }
    let i = 0;
    let timer = 0;
    const reveal = {
      finish() {
        clearTimeout(timer);
        while (i < ticks.length) ticks[i++].fn();
      },
    };
    function step() {
      ticks[i++].fn();
      if (i < ticks.length) timer = setTimeout(step, ticks[i].delay);
      /* a tick can start a nested reveal (the Enter tick submits a
         command), which becomes activeReveal — don't clobber it */
      else if (activeReveal === reveal) activeReveal = null;
    }
    activeReveal = reveal;
    step();
  }

  document.addEventListener("keydown", finishReveal, true);
  document.addEventListener("pointerdown", finishReveal, true);

  /* what counts as one printed "line": block rows, minus nested matches
     (a .card reveals as one unit, not its inner paragraphs) */
  const ROW_SELECTOR = "p, li, h1, h2, dt, dd, figure, .card";

  function rowsOf(container) {
    const all = Array.from(container.querySelectorAll(ROW_SELECTOR));
    const rows = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
    return rows.length ? rows : [container];
  }

  /* hide rows now (opacity only, so layout and the a11y tree keep the
     full content) and return the ticks that show them one by one */
  function revealTicks(container) {
    const rows = rowsOf(container);
    rows.forEach((r) => r.classList.add("pre-reveal"));
    return rows.map((r) => ({ delay: REVEAL_MS, fn: () => r.classList.remove("pre-reveal") }));
  }

  function echoLine(cmdText) {
    const p = document.createElement("p");
    p.className = "cmd";
    p.innerHTML = PS1 + " " + escapeHtml(cmdText);
    applog.appendChild(p);
    return p;
  }

  /* scroll so the echoed command line sits at the top of the screen,
     like a terminal that just printed a page of output */
  function scrollToLine(p) {
    screen.scrollTo({ top: p.offsetTop - 8, behavior: reducedMotion ? "auto" : "smooth" });
  }

  /* content: an HTML string (rendered) or a Node (appended).
     The log is transient — each command replaces the previous one's
     echo + output; only the pinned #boot block above survives. */
  function echo(cmdText, content, opts) {
    applog.innerHTML = "";
    const ticks = [];
    const p = echoLine(cmdText);
    if (content != null) {
      const div = document.createElement("div");
      div.className = "output" + (opts && opts.error ? " text error" : typeof content === "string" && opts && opts.text ? " text" : "");
      if (typeof content === "string") div.innerHTML = content;
      else div.appendChild(content);
      applog.appendChild(div);
      ticks.push(...revealTicks(div));
    }
    scrollToLine(p);
    playTicks(ticks);
  }

  function sectionContent(name) {
    return document.getElementById("tpl-" + name).content.cloneNode(true);
  }

  /* ---------------- commands ---------------- */

  function run(raw) {
    const line = raw.trim();
    if (!line) return;
    const [cmd, ...args] = line.split(/\s+/);
    const arg = (args[0] || "").replace(/\/+$/, "").toLowerCase();
    const name = cmd.toLowerCase();

    /* whoami is pinned at the top, not re-printed: wipe the transient
       output and scroll back up to it */
    if (name === "whoami" || name === "about") {
      applog.innerHTML = "";
      screen.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      return;
    }
    if (SECTIONS.includes(name)) {
      echo(line, sectionContent(name));
      return;
    }

    switch (name) {
      case "help":
      case "?":
        echo(line, sectionContent("help"));
        break;

      case "cd": {
        const target = arg === "" || arg === "~" ? "about" : arg;
        if (target === "about") {
          applog.innerHTML = "";
          screen.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        } else if (SECTIONS.includes(target)) {
          echo(line, sectionContent(target));
        } else {
          echo(line, "cd: no such directory: " + escapeHtml(arg) + " — try one of: about, " + SECTIONS.join(", "), { error: true });
        }
        break;
      }

      case "theme":
        if (arg === "dark" || arg === "light") setTheme(arg);
        else setTheme(root.dataset.theme === "dark" ? "light" : "dark");
        break;

      case "clear":
        applog.innerHTML = "";
        screen.scrollTo({ top: 0 });
        break;

      case "top":
      case "home":
        screen.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        break;

      case "email":
        echo(line, '<a href="mailto:yikunw@andrew.cmu.edu">yikunw@andrew.cmu.edu</a>');
        break;

      case "sudo":
        if (args.join(" ") === "hire-me") {
          echo(line, 'permission granted. run <button class="cmdlink" type="button" data-cmd="contact">contact</button> to get in touch.');
        } else {
          echo(line, "jackie is not in the sudoers file. this incident will be reported.", { error: true });
        }
        break;

      default:
        echo(line, "command not found: " + escapeHtml(cmd) + " — type 'help'", { error: true });
    }
  }

  /* clicking a command name types it into the real prompt and submits,
     so it enters the terminal the same way a typed command does */
  function typeAndRun(cmdText) {
    input.focus();
    input.value = "";
    syncCursor();
    const ticks = [];
    for (const ch of cmdText) {
      ticks.push({
        delay: TYPE_MS,
        fn: () => {
          input.value += ch;
          syncCursor();
        },
      });
    }
    ticks.push({ delay: ENTER_MS, fn: () => form.requestSubmit() });
    playTicks(ticks);
  }

  screen.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cmd]");
    if (btn) typeAndRun(btn.dataset.cmd);
  });

  /* ---------------- input handling ---------------- */

  const history = [];
  let histIdx = -1;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const line = input.value;
    if (line.trim()) {
      history.push(line);
      histIdx = history.length;
      run(line);
    }
    input.value = "";
    syncCursor();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      if (histIdx > 0) input.value = history[--histIdx];
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      input.value = histIdx < history.length - 1 ? history[++histIdx] : ((histIdx = history.length), "");
      e.preventDefault();
    }
  });

  /* the blinking block cursor tracks the real caret (ch works: mono font) */
  const cursor = document.getElementById("cmd-cursor");
  function syncCursor() {
    cursor.style.left = (input.selectionStart || 0) + "ch";
  }
  ["input", "focus", "click", "keyup"].forEach((ev) => input.addEventListener(ev, syncCursor));
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === input) syncCursor();
  });
  syncCursor();

  /* keyboard users can start typing from anywhere; skip when a fine
     pointer isn't guaranteed (touch) so the keyboard doesn't pop up */
  if (window.matchMedia("(pointer: fine)").matches) {
    document.addEventListener("keydown", (e) => {
      if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) input.focus();
    });
    input.focus();
  }

  /* boot: the terminal runs `whoami` itself — types it into the prompt,
     "presses Enter", then streams the pinned #boot block (which is
     static HTML, so it's simply hidden and revealed row by row) */
  const bootTicks = revealTicks(document.getElementById("boot"));
  const ticks = [{ delay: 0, fn: () => {} }]; // beat before typing starts
  for (const ch of "whoami") {
    ticks.push({
      delay: TYPE_MS,
      fn: () => {
        input.value += ch;
        syncCursor();
      },
    });
  }
  ticks[1].delay = 400;
  ticks.push({
    delay: ENTER_MS,
    fn: () => {
      input.value = "";
      syncCursor();
    },
  });
  ticks.push(...bootTicks);
  playTicks(ticks);
})();
