(function () {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const applog = document.getElementById("applog");
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("cmd-input");

  const SECTIONS = ["about", "news", "projects", "publications", "contact"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- theme ---------------- */

  function setTheme(name) {
    root.dataset.theme = name;
    localStorage.setItem("theme", name);
  }
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;
  document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  /* ---------------- output helpers ---------------- */

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function echo(cmdText, outputHtml, isError) {
    const p = document.createElement("p");
    p.className = "cmd";
    p.innerHTML = '<span class="prompt">jackie@cmu:~$</span> ' + escapeHtml(cmdText);
    applog.appendChild(p);
    if (outputHtml) {
      const div = document.createElement("div");
      div.className = "output" + (isError ? " error" : "");
      div.innerHTML = outputHtml;
      applog.appendChild(div);
    }
    screen.scrollTo({ top: screen.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function goTo(id) {
    document.getElementById(id).scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }

  /* ---------------- commands ---------------- */

  const HELP = [
    "available commands:",
    "  help                     show this list",
    "  cd <section>             go to a section (" + SECTIONS.join(", ") + ")",
    "  ls [projects]            list sections, or project names",
    "  whoami                   about me",
    "  contact                  how to reach me",
    "  theme [dark|light]       switch colors",
    "  clear                    clear typed output",
    "  top                      scroll back to the top",
  ].join("\n");

  function projectNames() {
    return Array.from(document.querySelectorAll("#projects .card h2 a")).map((a) => a.textContent.trim());
  }

  function run(raw) {
    const line = raw.trim();
    if (!line) return;
    const [cmd, ...args] = line.split(/\s+/);
    const arg = (args[0] || "").replace(/\/+$/, "").toLowerCase();

    switch (cmd.toLowerCase()) {
      case "help":
      case "?":
        echo(line, escapeHtml(HELP));
        break;

      case "cd": {
        const target = arg === "" || arg === "~" ? "about" : arg;
        if (SECTIONS.includes(target)) {
          goTo(target);
        } else {
          echo(line, "cd: no such directory: " + escapeHtml(arg) + " — try one of: " + SECTIONS.join(", "), true);
        }
        break;
      }

      case "ls":
        if (arg === "projects") {
          echo(line, projectNames().map(escapeHtml).join("\n"));
        } else {
          echo(line, SECTIONS.map((s) => s + "/").join("  "));
        }
        break;

      case "whoami":
      case "about":
        goTo("about");
        break;

      case "news":
      case "projects":
      case "publications":
      case "contact":
        goTo(cmd.toLowerCase());
        break;

      case "theme":
        if (arg === "dark" || arg === "light") setTheme(arg);
        else setTheme(root.dataset.theme === "dark" ? "light" : "dark");
        break;

      case "clear":
        applog.innerHTML = "";
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
          echo(line, "permission granted. → <a href=\"#contact\">get in touch</a>");
        } else {
          echo(line, "jackie is not in the sudoers file. this incident will be reported.", true);
        }
        break;

      default:
        echo(line, "command not found: " + escapeHtml(cmd) + " — type 'help'", true);
    }
  }

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
