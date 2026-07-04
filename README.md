# key-j.github.io

Personal site of Jackie (Yikun) Wang, styled as a terminal session. Plain static
HTML/CSS/JS — no build step. GitHub Pages serves this branch directly.

## Editing

- `index.html` — all content lives here, one `<section>` per "command".
- `assets/css/style.css` — theme colors (`:root` / `[data-theme="light"]`), layout, responsive rules.
- `assets/js/main.js` — theme toggle only.
- `assets/img/` — images. Replace `portrait.svg` with a real photo (update the `<img>` in `index.html`).

Preview locally with any static server, e.g. `python3 -m http.server 8000`.

## History

The previous al-folio (Jekyll) version of this site is preserved on the
`al-folio-v1` branch, deployed output on `gh-pages`.
