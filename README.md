# key-j.github.io

Personal site of Jackie (Yikun) Wang, styled as a terminal session. Plain static
HTML/CSS/JS — no build step. GitHub Pages serves this branch directly.

## Editing

- `index.html` — the initial help screen, plus one `<template id="tpl-...">` per
  section; commands (typed or clicked) print a template into the scrollback.
- `assets/css/style.css` — theme colors (`:root` / `[data-theme="light"]`), layout, responsive rules.
- `assets/js/main.js` — the command interpreter (`run()`), theme, history.
- `assets/js/bg.js` — background scenery (dark: digit rain; light: pixel critters).
- `assets/img/` — images (`portrait.jpg` is the profile photo shown by `whoami`).

Preview locally with any static server, e.g. `python3 -m http.server 8000`.

## History

The previous al-folio (Jekyll) version of this site is preserved on the
`al-folio-v1` branch, deployed output on `gh-pages`.
