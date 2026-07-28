(function () {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const applog = document.getElementById("applog");
  const boot = document.getElementById("boot");
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("cmd-input");

  /* ---------------- pages ----------------
     One entry per command, in the order it appears in the status line and
     the help list. Everything that used to be repeated across the SECTIONS
     array, the status-line markup and the help template is generated from
     here, so adding a section is a one-line edit.
       kind "boot" — the static #boot block (whoami), not a template
       kind "tpl"  — <template id="tpl-NAME">, the default              */

  const PAGES = [
    { cmd: "whoami", desc: "who I am", kind: "boot" },
    { cmd: "news", desc: "recent updates" },
    { cmd: "projects", desc: "what I'm building" },
    { cmd: "publications", desc: "papers" },
    { cmd: "contact", desc: "how to reach me" },
    { cmd: "misc", desc: "everything else" },
    { cmd: "help", desc: "show this list again" },
  ];

  /* commands that do something rather than print a page: listed in help,
     absent from the status line (there is no page for them to mark) */
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

  /* the intro (icon → window zoom → boot) always plays in full: clicks
     and keys only fast-forward a reveal once it has finished. (Running
     a command mid-intro still works — playTicks itself fast-forwards.) */
  let introPlaying = true;
  function skipReveal() {
    if (!introPlaying) finishReveal();
  }
  document.addEventListener("keydown", skipReveal, true);
  document.addEventListener("pointerdown", skipReveal, true);

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
     One page at a time: each command replaces whatever is on screen,
     including the whoami block. */
  function echo(cmdText, content, opts) {
    lastLogin.remove(); // the boot-session line never reprints
    boot.hidden = true;
    applog.innerHTML = "";
    const ticks = [];
    const p = echoLine(cmdText);
    if (content != null) {
      const div = document.createElement("div");
      div.className = "output" + (opts && opts.error ? " text error" : "");
      if (typeof content === "string") div.innerHTML = content;
      else div.appendChild(content);
      applog.appendChild(div);
      ticks.push(...revealTicks(div));
    }
    scrollToLine(p);
    playTicks(ticks);
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

  /* the help list, built from the same definitions as everything else.
     The first column is sized here from the longest command name (plus
     the "> " prefix) so the two columns line up whatever PAGES becomes. */
  function helpContent() {
    const entries = [...PAGES, ...ACTIONS];
    const ul = document.createElement("ul");
    ul.className = "helplist";
    /* longest name + "> " + a character of slack: 1ch is the width of "0",
       which isn't exactly every glyph's advance, so an exact fit rounds
       over and wraps ("publications" measured 143.3px in a 143.28px column) */
    ul.style.setProperty("--help-col", Math.max(...entries.map((e) => e.cmd.length)) + 3 + "ch");
    for (const e of entries) {
      const li = document.createElement("li");
      const link = document.createElement("button");
      link.className = "cmdlink";
      link.type = "button";
      link.dataset.cmd = e.cmd;
      link.textContent = e.cmd;
      const desc = document.createElement("span");
      desc.className = "desc";
      desc.textContent = e.desc;
      li.append(link, desc);
      ul.appendChild(li);
    }
    return ul;
  }

  /* the tmux-style status line, also generated from PAGES */
  const statusbar = document.getElementById("statusbar");
  for (const p of PAGES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.cmd = p.cmd;
    b.textContent = p.cmd;
    statusbar.appendChild(b);
  }

  function setActive(name) {
    statusbar.querySelectorAll("[data-cmd]").forEach((b) => b.classList.toggle("active", b.dataset.cmd === name));
    /* when the line is panned (narrow screens), keep the marked page on
       screen — otherwise the * marker is off past the right edge */
    const marked = statusbar.querySelector(".active");
    if (marked && statusbar.scrollWidth > statusbar.clientWidth) {
      marked.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  /* the shell boots into whoami, so it starts marked — this replaces the
     class="active" that used to be hard-coded into the status-line markup */
  setActive("whoami");

  /* print a page and mark it current; whoami is the static block */
  function showPage(page, line) {
    if (page.kind === "boot") {
      showWhoami();
    } else {
      echo(line, page.cmd === "help" ? helpContent() : sectionContent(page.cmd));
      setActive(page.cmd);
    }
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
    else {
      echo(cmd, page.cmd === "help" ? helpContent() : sectionContent(cmd));
      setActive(cmd);
    }
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
     re-shows that block with the same echo + streamed reveal */
  function showWhoami() {
    lastLogin.remove(); // the boot-session line never reprints
    applog.innerHTML = "";
    boot.hidden = false;
    screen.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    setActive("whoami");
    playTicks(revealTicks(boot));
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
        setActive("");
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

  const COMPLETIONS = [...PAGES.map((p) => p.cmd), ...ACTIONS.map((a) => a.cmd), "email"].sort();

  const completions = document.getElementById("completions");
  let flashTimer = 0;

  function hideCompletions() {
    clearTimeout(flashTimer);
    completions.hidden = true;
    completions.textContent = "";
  }

  /* a transient note in the completion strip (^C). Feedback has to go here
     rather than into the screen, which holds one page at a time and would
     lose whatever you were reading. */
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

  /* Touch has no Tab, so there the candidates appear as you type and are
     tapped. Pointer devices keep Tab and an uncluttered prompt. */
  function liveSuggest() {
    if (finePointer) {
      hideCompletions();
      return;
    }
    const m = matches();
    if (!m || !m.word || !m.hits.length || (m.hits.length === 1 && m.hits[0] === m.word)) {
      hideCompletions();
      return;
    }
    showCandidates(m.hits, m.head);
  }

  input.addEventListener("input", liveSuggest);

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
    input.placeholder = narrowScreen.matches ? "try 'help'" : "type a command — try 'help'";
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
     "presses Enter", then streams the #boot block (which is static
     HTML, so it's simply hidden and revealed row by row) */
  let bootTicks = revealTicks(boot);

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
       needs revealing; any other command is run for real */
    if (cmd === "whoami") ticks.push(...bootTicks);
    else ticks.push({ delay: 0, fn: () => run(cmd) });
    ticks.push({ delay: 0, fn: () => { introPlaying = false; } }); // skipping re-enabled
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

  /* yellow dot: minimize. The session is untouched — no reset, no fresh
     Last login — so reopening puts you back exactly where you were. */
  document.querySelector(".dot-yellow").addEventListener("click", () => {
    if (!opened) return;
    finishReveal(); // so the page is whole when it comes back
    root.dataset.intro = "wait";
    armDesktop(0, false);
  });

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
    finishReveal();
    introPlaying = true; // boot re-enables skipping when it replays
    root.dataset.intro = "wait";
    setTimeout(() => {
      /* reset the session behind the closed window */
      applog.innerHTML = "";
      boot.hidden = false;
      input.value = "";
      syncCursor();
      lastLogin.remove();
      bootTicks = revealTicks(boot);
      printLastLogin();
      setActive("whoami");
      route("whoami"); // a fresh session is back at the top-level URL
      screen.scrollTo({ top: 0 });
      armDesktop(0);
    }, reducedMotion ? 0 : 450);
  });

  /* A deep link skips the desktop intro: someone following a shared link
     should land on the content, not on two seconds of theatre. The prompt
     still types the command out — that beat is the site's handshake, and
     it costs well under a second. Seed currentCmd from the URL first so
     the boot doesn't push a duplicate history entry over itself. */
  const initialCmd = hashCmd() || "whoami";
  currentCmd = initialCmd;

  if (initialCmd !== "whoami") {
    delete root.dataset.intro;
    bootSequence(initialCmd);
  } else if (root.dataset.intro) {
    armDesktop(1500);
  } else {
    bootSequence("whoami");
  }
})();
