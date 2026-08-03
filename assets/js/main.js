(function () {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const applog = document.getElementById("applog");
  const boot = document.getElementById("boot");
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("cmd-input");

  /* ---------------- pages ----------------
     One entry per command, in the order it appears in the help list. The
     help list, tab completion and the command dispatcher are all built
     from here, so adding a section is a one-line edit.
       kind "boot" — the static #boot block (whoami)
       kind "tpl"  — a <div class="page" id="page-NAME">, the default  */

  const PAGES = [
    { cmd: "whoami", desc: "who I am", kind: "boot" },
    { cmd: "news", desc: "recent updates" },
    { cmd: "projects", desc: "what I'm building" },
    { cmd: "publications", desc: "papers" },
    { cmd: "misc", desc: "everything else" },
    { cmd: "help", desc: "show this list again" },
  ];

  /* commands that do something rather than print a page */
  const ACTIONS = [
    { cmd: "theme", desc: "switch dark / light colors" },
    { cmd: "clear", desc: "wipe the screen" },
  ];

  const ALIASES = { about: "whoami", "?": "help" };
  const PAGE_BY_CMD = new Map(PAGES.map((p) => [p.cmd, p]));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

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

  /* Typing is a person, so it runs at a person's speed: 30ms/char was ~33
     characters a second, which nobody manages. Printing is the machine
     answering back, so it goes several times faster than the hands do.
     Any key or click still skips to the end. */
  const TYPE_MS = 60; // per character typed into the prompt for a click
  const ENTER_MS = 240; // beat between the last character and "Enter"
  const REVEAL_CPS = 480; // characters a second of printed output
  const ELEMENT_COST = 24; // an image or echoed line is worth this many characters

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

  /* Print a unit sequence. rAF rather than a timer per character: at 480
     characters a second a timer chain would spend more time in scheduling
     overhead than it does waiting, and drift badly. Each frame flips
     however many units have come due, so the rate holds whatever the
     frame rate is. */
  function playStream(units, onDone) {
    finishReveal();
    const show = () => {
      units.forEach((u) => u.classList.remove("pre-reveal"));
      if (onDone) onDone();
    };
    if (!units.length || reducedMotion) return show();

    /* running cost, so an image or an echoed line buys a small beat
       instead of going by in the two milliseconds one character takes */
    let acc = 0;
    const dueAt = units.map((u) => (acc += u.classList.contains("ch") ? 1 : ELEMENT_COST));

    let i = 0;
    let raf = 0;
    let t0 = 0;
    const reveal = {
      finish() {
        cancelAnimationFrame(raf);
        while (i < units.length) units[i++].classList.remove("pre-reveal");
        if (onDone) onDone();
      },
    };
    function frame(ts) {
      if (!t0) t0 = ts;
      const budget = ((ts - t0) / 1000) * REVEAL_CPS;
      while (i < units.length && dueAt[i] <= budget) units[i++].classList.remove("pre-reveal");
      if (i < units.length) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (activeReveal === reveal) activeReveal = null;
      if (onDone) onDone();
    }
    activeReveal = reveal;
    raf = requestAnimationFrame(frame);
  }

  /* the intro (icon → window zoom → boot) always plays in full: clicks
     and keys only fast-forward a reveal once it has finished. (Running
     a command mid-intro still works — playTicks itself fast-forwards.) */
  let introPlaying = true;
  function skipReveal() {
    if (!introPlaying) finishReveal();
  }
  document.addEventListener("keydown", skipReveal, true);
  document.addEventListener("pointerdown", skipReveal, true);

  /* Output prints a character at a time, the way a terminal does, rather
     than a row at a time. Every character becomes its own <span class="ch">
     up front, so printing is just an opacity flip: the text holds its final
     space from the first frame and nothing reflows as it arrives. Inline
     spans add no line-break opportunities, so wrapping is unchanged, and
     both themes are monospace, so there is no kerning to break across them.

     Two things print whole. Images have nothing to type. So do .cmd lines —
     a terminal echoes the command the instant you press Enter, it doesn't
     type it back at you. */
  const WHOLE_UNIT = "img, .cmd";
  /* <noscript> holds its markup as raw *text* when scripting is on, so it
     would otherwise split into hundreds of units that print invisibly */
  const SKIP_UNIT = "noscript, script, style";

  function splitUnits(container) {
    if (container.__units) return container.__units; // idempotent: whoami reprints
    const units = [];
    (function collect(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (!child.nodeValue.trim()) continue; // pure whitespace holds no ink
          const frag = document.createDocumentFragment();
          for (const ch of child.nodeValue) {
            if (/\s/.test(ch)) {
              frag.appendChild(document.createTextNode(ch)); // keep spaces bare: invisible anyway
              continue;
            }
            const span = document.createElement("span");
            span.className = "ch";
            span.textContent = ch;
            frag.appendChild(span);
            units.push(span);
          }
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches(SKIP_UNIT)) continue;
          else if (child.matches(WHOLE_UNIT)) units.push(child);
          else collect(child);
        }
      }
    })(container);
    container.__units = units;
    return units;
  }

  /* hide the units now (opacity only, so layout and the a11y tree keep the
     full content) and hand back the sequence to print */
  function streamUnits(container) {
    const units = splitUnits(container);
    units.forEach((u) => u.classList.add("pre-reveal"));
    return units;
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
     One page at a time: each command replaces whatever is on screen,
     including the whoami block. */
  function echo(cmdText, content, opts) {
    lastLogin.remove(); // the boot-session line never reprints
    boot.hidden = true;
    applog.innerHTML = "";
    const p = echoLine(cmdText);
    let units = [];
    if (content != null) {
      const div = document.createElement("div");
      div.className = "output" + (opts && opts.error ? " text error" : "");
      if (typeof content === "string") div.innerHTML = content;
      else div.appendChild(content);
      applog.appendChild(div);
      units = streamUnits(div);
    }
    scrollToLine(p);
    playStream(units);
  }

  /* sections live as real (hidden) elements in #pagesrc rather than in a
     <template>, so they're in the document for crawlers and no-JS readers.
     Clone the children, not the wrapper, to match what a template gave us. */
  function sectionContent(name) {
    const src = document.getElementById("page-" + name);
    const frag = document.createDocumentFragment();
    for (const child of src.children) {
      /* .page-title labels the section for crawlers and the no-JS view,
         where everything stacks into one document. In the terminal the
         echoed command line already is the heading, so drop it. */
      if (!child.classList.contains("page-title")) frag.appendChild(child.cloneNode(true));
    }
    return frag;
  }

  /* keyboard shortcuts, listed in help but only where a keyboard exists */
  const KEYS = [
    { label: "Tab", desc: "complete a command" },
    { label: "↑ ↓", desc: "previous / next command" },
    { label: "Ctrl-C", desc: "abandon the line" },
    { label: "Ctrl-L", desc: "clear the screen" },
  ];

  /* the equivalent for a touch screen, which has none of those keys */
  const TOUCH_TIPS = [
    { label: "tap", desc: "the prompt to see every command, then tap one" },
    { label: "type", desc: "to narrow the list" },
  ];

  /* Help, grouped: pages are places, actions are things you do, keys are
     how to drive the prompt. Built from the same tables as everything
     else, so it can't drift out of step with what actually runs. */
  function helpContent() {
    const hasKeyboard = window.matchMedia("(pointer: fine)").matches;
    const groups = [
      { title: "Pages", rows: PAGES.filter((p) => p.cmd !== "help").map((p) => ({ ...p, label: p.cmd })) },
      { title: "Actions", rows: [...ACTIONS, PAGE_BY_CMD.get("help")].map((a) => ({ ...a, label: a.cmd })) },
      hasKeyboard ? { title: "Keys", rows: KEYS } : { title: "Touch", rows: TOUCH_TIPS },
    ];

    /* one column width across every group, from the longest label. The +1
       is slack: 1ch is the advance of "0", not of every glyph, so an exact
       fit rounds over and wraps. The +2 covers the "> " on command rows. */
    const widest = Math.max(...groups.flatMap((g) => g.rows.map((r) => r.label.length)));

    const wrap = document.createElement("div");
    wrap.className = "help";
    wrap.style.setProperty("--help-col", widest + 3 + "ch");

    const intro = document.createElement("p");
    intro.className = "help-intro";
    intro.textContent = "This site is a terminal. Type a command, or click one.";
    wrap.appendChild(intro);

    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "help-group";
      const title = document.createElement("h2");
      title.className = "help-title";
      title.textContent = group.title;
      const ul = document.createElement("ul");
      ul.className = "helplist";
      for (const row of group.rows) {
        const li = document.createElement("li");
        /* commands are buttons; keys and tips are just labels */
        const left = document.createElement(row.cmd ? "button" : "span");
        if (row.cmd) {
          left.className = "cmdlink";
          left.type = "button";
          left.dataset.cmd = row.cmd;
        } else {
          left.className = "keyname";
        }
        left.textContent = row.label;
        const desc = document.createElement("span");
        desc.className = "desc";
        desc.textContent = row.desc;
        li.append(left, desc);
        ul.appendChild(li);
      }
      section.append(title, ul);
      wrap.appendChild(section);
    }
    return wrap;
  }

  /* print a page; whoami is the static block. There's no status line to
     mark any more — the echoed command line at the top of the screen
     already says which page you're on. */
  function showPage(page, line) {
    if (page.kind === "boot") showWhoami();
    else echo(line, page.cmd === "help" ? helpContent() : sectionContent(page.cmd));
    route(page.cmd);
  }

  /* ---------------- routing ----------------
     Each page gets a URL, so pages can be linked, and Back walks the
     session instead of leaving the site. whoami is the bare URL.

     pushState fires neither popstate nor hashchange, so navigating never
     re-enters here; only a real Back/Forward or a hand-edited hash does,
     and both land in showRoute(). */

  let currentCmd = "whoami";

  function hashCmd() {
    const h = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
    const name = ALIASES[h] || h;
    return PAGE_BY_CMD.has(name) ? name : h === "" ? "whoami" : null;
  }

  function route(cmd) {
    if (cmd === currentCmd) return;
    currentCmd = cmd;
    const url = cmd === "whoami" ? location.pathname + location.search : "#" + cmd;
    history.pushState({ cmd }, "", url);
  }

  /* render whatever the URL now says, without pushing a new entry */
  function showRoute() {
    const cmd = hashCmd();
    if (!cmd || cmd === currentCmd) return; // unknown hash: leave the screen alone
    currentCmd = cmd;
    const page = PAGE_BY_CMD.get(cmd);
    if (page.kind === "boot") showWhoami();
    else echo(cmd, page.cmd === "help" ? helpContent() : sectionContent(cmd));
  }

  addEventListener("popstate", showRoute);
  addEventListener("hashchange", showRoute);

  /* dead placeholder links (href="#") must not navigate: an empty hash
     means whoami, and jumping there on a stub link is worse than a no-op */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  /* whoami is the static #boot block, not a template — re-running it
     re-shows that block and prints it again */
  function showWhoami() {
    lastLogin.remove(); // the boot-session line never reprints
    applog.innerHTML = "";
    boot.hidden = false;
    screen.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    playStream(streamUnits(boot));
  }

  /* ---------------- commands ---------------- */

  function run(raw) {
    const line = raw.trim();
    if (!line) return;
    const [cmd, ...args] = line.split(/\s+/);
    const arg = (args[0] || "").toLowerCase(); // only `theme dark|light` takes one
    const base = cmd.toLowerCase();
    const name = ALIASES[base] || base;

    const page = PAGE_BY_CMD.get(name);
    if (page) {
      showPage(page, line);
      return;
    }

    switch (name) {
      case "theme":
        if (arg === "dark" || arg === "light") setTheme(arg);
        else setTheme(root.dataset.theme === "dark" ? "light" : "dark");
        break;

      case "clear":
        /* a real clear: blank screen, and no page marked in the status
           line because none is showing */
        lastLogin.remove();
        boot.hidden = true;
        applog.innerHTML = "";
        screen.scrollTo({ top: 0 });
        break;

      /* the one command deliberately absent from help and completion */
      case "sudo":
        echo(line, "jackie is not in the sudoers file. this incident will be reported.", { error: true });
        break;

      default:
        echo(line, "command not found: " + escapeHtml(cmd) + " — type 'help'", { error: true });
    }
  }

  /* clicking a command name types it into the real prompt and submits,
     so it enters the terminal the same way a typed command does */
  function typeAndRun(cmdText) {
    /* focusing on touch would pop up the on-screen keyboard */
    if (finePointer) input.focus();
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

  /* document-level so it covers the status line, not just the screen */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cmd]");
    if (btn) typeAndRun(btn.dataset.cmd);
  });

  /* ---------------- input handling ---------------- */

  /* not `history` — that would shadow window.history for the whole IIFE,
     which is where the router's pushState lives */
  const cmdHistory = [];
  let histIdx = -1;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const line = input.value;
    hideCompletions();
    if (line.trim()) {
      cmdHistory.push(line);
      histIdx = cmdHistory.length;
      run(line);
    }
    input.value = "";
    syncCursor();
    /* touch: drop focus so the on-screen keyboard folds away — otherwise
       the output you just asked for is hidden behind half a screen of keys */
    if (!finePointer) input.blur();
  });

  /* ---------------- tab completion ----------------
     Completes the command word, or a `cd` argument, from the same tables
     everything else is built from. One match completes it; several
     complete as far as they agree, and a second Tab lists them.

     `sudo` is deliberately absent: completing it would give away the joke. */

  /* deliberately not sorted: on touch this list is the navigation, so it
     reads in the order the site presents itself — pages, then actions.
     Alphabetical only earns its keep when there are more than nine. */
  const COMPLETIONS = [...PAGES.map((p) => p.cmd), ...ACTIONS.map((a) => a.cmd)];

  const completions = document.getElementById("completions");
  let flashTimer = 0;

  function hideCompletions() {
    clearTimeout(flashTimer);
    completions.hidden = true;
    completions.textContent = "";
  }

  /* a momentary note in the completion strip (^C). Feedback has to go
     here rather than into the screen, which holds one page at a time and
     would lose whatever you were reading. */
  function flashNote(text) {
    clearTimeout(flashTimer);
    completions.textContent = text;
    completions.hidden = false;
    flashTimer = setTimeout(hideCompletions, 900);
  }

  function commonPrefix(list) {
    let p = list[0];
    for (const s of list) while (!s.startsWith(p)) p = p.slice(0, -1);
    return p;
  }

  /* the command word being typed, plus everything matching it. Every
     command is a single word now, so there are no arguments to complete. */
  function matches() {
    const val = input.value;
    const parts = val.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1 || /\s$/.test(val)) return null;
    const word = (parts[0] || "").toLowerCase();
    return { word, head: "", hits: COMPLETIONS.filter((c) => c.startsWith(word)) };
  }

  /* Candidates are buttons, not text: a touch keyboard has no Tab key, so
     tapping one is the only way to complete there. */
  function showCandidates(hits, head) {
    clearTimeout(flashTimer);
    completions.textContent = "";
    for (const hit of hits) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "comp";
      b.textContent = hit;
      b.addEventListener("click", () => {
        input.value = head + hit;
        hideCompletions();
        form.requestSubmit();
      });
      completions.appendChild(b);
    }
    completions.hidden = false;
  }

  /* One Tab does the whole job: a single match completes, several complete
     as far as they agree and list themselves. bash makes you press twice
     for the list; there's no reason to make you ask for it. */
  function complete() {
    const m = matches();
    if (!m || !m.hits.length) return;
    if (m.hits.length === 1) {
      input.value = m.head + m.hits[0];
      hideCompletions();
    } else {
      const prefix = commonPrefix(m.hits);
      if (prefix.length > m.word.length) input.value = m.head + prefix;
      showCandidates(m.hits, m.head);
    }
    syncCursor();
  }

  /* Touch has no Tab, so there the candidates appear on their own: every
     command when the prompt is focused and empty, narrowing as you type.
     That is the navigation — tapping the prompt summons the list the
     status line used to hold permanently. Pointer devices keep Tab and an
     uncluttered prompt bar. */
  function liveSuggest() {
    if (finePointer) {
      hideCompletions();
      return;
    }
    const m = matches();
    if (!m || !m.hits.length || (m.hits.length === 1 && m.hits[0] === m.word)) {
      hideCompletions();
      return;
    }
    showCandidates(m.hits, m.head);
  }

  input.addEventListener("input", liveSuggest);
  input.addEventListener("focus", liveSuggest);


  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      complete();
      return;
    }

    /* Ctrl-C: abandon the line, like a real shell. Skipped when something
       is selected so the browser's copy still works — the same conflict
       terminal emulators have, resolved the same way. */
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      const selected = input.selectionStart !== input.selectionEnd || String(getSelection() || "").length > 0;
      if (selected) return;
      e.preventDefault();
      finishReveal();
      input.value = "";
      flashNote("^C"); // otherwise abandoning an empty line looks like nothing happened
      histIdx = cmdHistory.length;
      syncCursor();
      return;
    }

    /* Ctrl-L clears the screen. Chrome reserves it for the address bar and
       may not let preventDefault stand; the `clear` command always works. */
    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      run("clear");
      input.value = "";
      hideCompletions();
      syncCursor();
      return;
    }

    if (e.key === "ArrowUp") {
      if (histIdx > 0) input.value = cmdHistory[--histIdx];
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      input.value = histIdx < cmdHistory.length - 1 ? cmdHistory[++histIdx] : ((histIdx = cmdHistory.length), "");
      e.preventDefault();
    }
  });

  /* On a phone the full placeholder is clipped — and the clipped half is
     the part naming the command to try. Shorten it rather than lose it. */
  const narrowScreen = window.matchMedia("(max-width: 560px)");
  function syncPlaceholder() {
    /* no quotes: they read as though you might have to type them */
    input.placeholder = narrowScreen.matches ? "type help" : "type a command — try help";
  }
  narrowScreen.addEventListener("change", syncPlaceholder);
  syncPlaceholder();

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
  if (finePointer) {
    document.addEventListener("keydown", (e) => {
      if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) input.focus();
    });
  }

  /* boot: the terminal runs `whoami` itself — types it into the prompt,
     "presses Enter", then prints the #boot block (which is static HTML,
     so it's simply hidden and printed back out) */
  let bootUnits = streamUnits(boot);

  /* real-date "Last login" line, inserted AFTER the rows are pre-hidden
     so it's already printed the moment the window opens; each session
     (the red dot closes one, the icon starts one) gets a fresh time */
  let lastLogin;
  function printLastLogin() {
    const now = new Date();
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n) => String(n).padStart(2, "0");
    lastLogin = document.createElement("p");
    lastLogin.className = "lastlogin";
    lastLogin.textContent =
      "Last login: " + DAYS[now.getDay()] + " " + MONTHS[now.getMonth()] + " " + now.getDate() +
      " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + " on ttys001";
    boot.insertBefore(lastLogin, boot.firstChild);
  }
  printLastLogin();

  function bootSequence(cmd) {
    if (finePointer) input.focus();
    const ticks = [{ delay: 0, fn: () => { input.value = ""; syncCursor(); } }]; // beat (and drop stray keys)
    for (const ch of cmd) {
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
    /* whoami is already on screen as the static #boot block, so it only
       needs printing; any other command is run for real. Either way
       skipping stays off until the output has finished arriving. */
    if (cmd === "whoami") {
      ticks.push({ delay: 0, fn: () => playStream(bootUnits, () => { introPlaying = false; }) });
    } else {
      ticks.push({ delay: 0, fn: () => run(cmd) });
      ticks.push({ delay: 0, fn: () => { introPlaying = false; } });
    }
    playTicks(ticks);
  }

  /* intro / window lifecycle: a desktop with one app icon. The window
     zooms open after a short beat — or on the first click/keypress,
     which starts it early (never skips it) — then the shell boots.
     Without [data-intro] (no JS gate ran: reduced motion) the terminal
     is already open. The red dot reverses the whole thing. */
  let opened = false;
  let autoOpen = 0;
  /* close (red) ends the session, so reopening boots afresh; minimize
     (yellow) keeps it, so reopening just shows the window again */
  let rebootOnOpen = true;

  function openTerminal() {
    if (opened) return;
    opened = true;
    clearTimeout(autoOpen);
    document.removeEventListener("keydown", openTerminal, true);
    document.removeEventListener("pointerdown", openTerminal, true);
    root.dataset.intro = "open";
    const landed = reducedMotion ? 0 : 450;
    if (rebootOnOpen) setTimeout(() => bootSequence("whoami"), landed); // once the zoom lands
    else if (finePointer) setTimeout(() => input.focus(), landed);
    setTimeout(() => delete root.dataset.intro, reducedMotion ? 0 : 650); // drop icon + transition styles
  }

  function armDesktop(autoDelay, reboot) {
    opened = false;
    rebootOnOpen = reboot !== false;
    document.addEventListener("keydown", openTerminal, true);
    document.addEventListener("pointerdown", openTerminal, true);
    if (autoDelay) autoOpen = setTimeout(openTerminal, autoDelay);
  }

  /* Send the window back to the desktop icon. `reboot` decides what the
     next open does: close (red) starts a fresh session, minimize (yellow)
     restores the one already there. onHidden runs behind the shrunk
     window, before anything can reopen it.

     Arming is deferred until the shrink lands. Arming it immediately —
     as minimize used to — left the "click anywhere to open" listener
     live during the 0.4s animation, so a click while the window was
     still shrinking sprang it straight back open. */
  function hideToDesktop(reboot, onHidden) {
    if (!opened) return;
    finishReveal(); // so the page is whole when it comes back
    opened = false; // a second dot click mid-animation does nothing
    root.dataset.intro = "wait";
    setTimeout(() => {
      if (onHidden) onHidden();
      armDesktop(0, reboot);
    }, reducedMotion ? 0 : 450);
  }

  /* yellow dot: minimize. The session is untouched — no reset, no fresh
     Last login — so reopening puts you back exactly where you were. */
  document.querySelector(".dot-yellow").addEventListener("click", () => hideToDesktop(false));

  /* green dot: maximize. Remembered across visits, like the theme. */
  const greenDot = document.getElementById("dot-green");
  function setMaximized(on) {
    if (on) root.dataset.max = "1";
    else delete root.dataset.max;
    localStorage.setItem("maximized", on ? "1" : "0");
    greenDot.setAttribute("aria-label", (on ? "Restore" : "Maximize") + " terminal");
  }
  greenDot.addEventListener("click", () => setMaximized(!("max" in root.dataset)));
  setMaximized(localStorage.getItem("maximized") === "1");

  /* red dot: close the session — the window zooms back down to the
     desktop icon, and the next open is a fresh boot with a new
     Last login time. Deliberate close, so no auto-reopen timer. */
  document.querySelector(".dot-red").addEventListener("click", () => {
    introPlaying = true; // boot re-enables skipping when it replays
    hideToDesktop(true, () => {
      /* reset the session behind the closed window */
      applog.innerHTML = "";
      boot.hidden = false;
      input.value = "";
      syncCursor();
      lastLogin.remove();
      bootUnits = streamUnits(boot);
      printLastLogin();
      route("whoami"); // a fresh session is back at the top-level URL
      screen.scrollTo({ top: 0 });
    });
  });

  /* A deep link skips the desktop intro: someone following a shared link
     should land on the content, not on two seconds of theatre. The prompt
     still types the command out — that beat is the site's handshake, and
     it costs well under a second. Seed currentCmd from the URL first so
     the boot doesn't push a duplicate history entry over itself. */
  const initialCmd = hashCmd() || "whoami";
  currentCmd = initialCmd;

  /* `opened` means the window is on screen, and the dots check it — so
     the two paths that boot without ever going through openTerminal have
     to set it themselves, or minimize and close silently do nothing. */
  if (initialCmd !== "whoami") {
    delete root.dataset.intro;
    opened = true;
    bootSequence(initialCmd);
  } else if (root.dataset.intro) {
    armDesktop(1500);
  } else {
    opened = true; // no intro to play: reduced motion, or JS-gate skipped
    bootSequence("whoami");
  }
})();
