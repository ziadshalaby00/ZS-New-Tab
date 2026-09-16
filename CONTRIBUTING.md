# Contributing to ZS New Tab

Thanks for wanting to contribute! The runtime is still plain HTML/CSS/JS — the only build tooling is esbuild for bundling and a small dev server for live reload.

## Getting started

```bash
git clone https://github.com/<your-username>/ZS-New-Tab.git
cd ZS-New-Tab
npm install          # installs esbuild (only dependency)
node dev-server.js   # watch + live-reload at http://localhost:5500
```

For testing **extension behavior** (chrome.* APIs, new-tab override, incognito):

```bash
node build.js
```

Then load the `dist/` folder via `chrome://extensions` → **Load unpacked**. Edit files in `js/` or `styles/` — never `dist/` (it's generated and wiped on each build).

## File layout

Files under `js/` and `styles/` are prefixed with a number that defines load order:

```
js/00-init.js          ← runs first
js/10-core-state.js
…
js/180-app-init.js     ← runs last
```

`index.html` loads them in that order, and `build.js` warns if the order breaks. If you add a file, give it a number between its neighbours (e.g. `25-core-color.js`) and add the matching tag in `index.html`.

## Module pattern

Every JS file merges into a shared namespace:

```js
window.registerModule('ZSCore', (function () {
    "use strict";
    return { myHelper };
})());
```

| Namespace | Purpose | Files |
|---|---|---|
| `ZSCore` | Pure helpers, no state | `10-*` … `90-*` |
| `ZSDB`   | IndexedDB for backgrounds | `100-db.js` |
| `ZSApp`  | State + controllers | `110-*` … `180-*` |

Never redefine an existing function — extend it.

## CSS

- One concern per file (`70-search.css`, `120-modal.css`, …).
- Reuse the variables in `styles/20-variables.css` — **do not hardcode colors or radii**.
- Accent-dependent values derive from `--accent-rgb` automatically.

## Guidelines

- No runtime dependencies. No frameworks.
- Match the existing style — plain functions, `"use strict"` in each module, section-banner comments.
- Test storage changes (localStorage / IndexedDB) after a **full browser restart**, not just a reload.
- Run `node build.js` before opening a PR — it should print no new warnings.

## Submitting changes

1. Branch: `git checkout -b fix/short-description`
2. One logical change per commit. Conventional Commits preferred (`fix:`, `feat:`, `chore:`, `docs:`).
3. Open a PR against `main` describing **what** changed, **how** you tested it, and screenshots for UI changes.

## Reporting bugs

See [ISSUES.md](./ISSUES.md) for the bug report format.
