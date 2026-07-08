(function () {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const applog = document.getElementById("applog");
  const intro = document.getElementById("intro");
  const helpOutput = intro.querySelector(".output");
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("cmd-input");

  const SECTIONS = ["about", "news", "projects", "publications", "contact"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- theme ---------------- */

  function setTheme(name) {
    root.dataset.theme = name;
    localStorage.setItem("theme", name);
    document.dispatchEvent(new CustomEvent("themechange", { detail: name }));
  }
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;

  /* ---------------- output helpers ---------------- */

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function echoLine(cmdText) {
    const p = document.createElement("p");
    p.className = "cmd";
    p.innerHTML = '<span class="prompt">jackie@google:~$</span> ' + escapeHtml(cmdText);
    applog.appendChild(p);
    return p;
  }

  /* scroll so the echoed command line sits at the top of the screen,
     like a terminal that just printed a page of output */
  function scrollToLine(p) {
    screen.scrollTo({ top: p.offsetTop - 8, behavior: reducedMotion ? "auto" : "smooth" });
  }

  /* content: an HTML string (rendered) or a Node (appended) */
  function echo(cmdText, content, opts) {
    const p = echoLine(cmdText);
    if (content != null) {
      const div = document.createElement("div");
      div.className = "output" + (opts && opts.error ? " text error" : typeof content === "string" && opts && opts.text ? " text" : "");
      if (typeof content === "string") div.innerHTML = content;
      else div.appendChild(content);
      applog.appendChild(div);
    }
    scrollToLine(p);
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

    if (name === "whoami" || name === "about") {
      echo(line, sectionContent("about"));
      return;
    }
    if (SECTIONS.includes(name)) {
      echo(line, sectionContent(name));
      return;
    }

    switch (name) {
      case "help":
      case "?": {
        const p = echoLine(line);
        applog.appendChild(helpOutput.cloneNode(true));
        scrollToLine(p);
        break;
      }

      case "cd": {
        const target = arg === "" || arg === "~" ? "about" : arg;
        if (SECTIONS.includes(target)) {
          echo(line, sectionContent(target));
        } else {
          echo(line, "cd: no such directory: " + escapeHtml(arg) + " — try one of: " + SECTIONS.join(", "), { error: true });
        }
        break;
      }

      case "theme":
        if (arg === "dark" || arg === "light") setTheme(arg);
        else setTheme(root.dataset.theme === "dark" ? "light" : "dark");
        break;

      case "clear":
        intro.hidden = true;
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

  /* clicking a command name runs it (works inside intro, help output, etc.) */
  screen.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cmd]");
    if (btn) run(btn.dataset.cmd);
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

  /* keyboard users can start typing from anywhere; skip when a fine
     pointer isn't guaranteed (touch) so the keyboard doesn't pop up */
  if (window.matchMedia("(pointer: fine)").matches) {
    document.addEventListener("keydown", (e) => {
      if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) input.focus();
    });
    input.focus();
  }
})();
