# key-j.github.io

Personal site of Jackie (Yikun) Wang, styled as a terminal session. Plain static
HTML/CSS/JS — no build step. GitHub Pages serves this branch directly.

## Editing

- `index.html` — the initial help screen, plus one `<template id="tpl-...">` per
  section; commands (typed or clicked) print a template into the scrollback.
- `assets/css/style.css` — theme colors (`:root` / `[data-theme="light"]`), layout, responsive rules.
- `assets/js/main.js` — the command interpreter (`run()`), theme, history.
- `assets/js/bg.js` — background scenery (dark: digit rain + cursor glow + click
  ripples; light: pixel critters + interaction-triggered walk-by characters).
- `assets/img/` — images (`portrait.jpg` is the profile photo shown by `whoami`).
- `assets/img/sprites/` — CC0 walk-cycle sheets: [GrafxKid](https://opengameart.org/users/grafxkid)
  ("Classic Hero", "Classic Hero and Baddies Pack" on OpenGameArt) and
  [0x72](https://0x72.itch.io/dungeontileset-ii) ("DungeonTileset II" v1.3);
  monster palette-swap variants are generated at load time in `bg.js`.

Preview locally with any static server, e.g. `python3 -m http.server 8000`.

## History

The previous al-folio (Jekyll) version of this site is preserved on the
`al-folio-v1` branch, deployed output on `gh-pages`.
