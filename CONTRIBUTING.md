# Contributing to ZS New Tab

Thanks for wanting to contribute! The runtime is still plain HTML/CSS/JS — the only build tooling is esbuild for bundling and a small dev server for live reload.

## Getting started

```bash
git clone https://github.com/<your-username>/ZS-New-Tab.git
cd ZS-New-Tab
npm install          # installs esbuild (only dependency)
node dev-server.js   # watch + live-reload at http://localhost:5500
```

For testing **extension behavior** (chrome.* APIs, new-tab override, incognito, **Google Drive sync**):

```bash
node build.js
```

Then load the `dist/` folder via `chrome://extensions` → **Load unpacked**. Edit files in `js/` or `styles/` — never `dist/` (it's generated and wiped on each build).

> ⚠️ The dev server previews `dist/index.html` as a normal web page — it does **not** emulate `chrome.*` extension APIs. Google Drive sync in particular requires loading `dist/` as an unpacked extension.

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
| `ZSDrive` | Google Drive auth + sync (optional) | `105-*`, `107-*` |
| `ZSApp`  | State + controllers | `110-*` … `180-*` |
| `ZSProgress` | Progress bar UI for long-running operations | `166-app-progress.js` |

Never redefine an existing function — extend it.

## Google Drive feature

If you touch anything under `105-app-drive-auth.js` or `107-app-drive-sync.js`, keep in mind:

- **The client ID is duplicated** in `js/105-app-drive-auth.js` and `manifest.json` → `oauth2.client_id`. Chrome reads the manifest; Firefox reads the JS. If you change one, change both.
- **Only use the `drive.file` scope.** It's the least-privileged Drive scope that still allows creating and managing the extension's own files — the extension never sees the rest of the user's Drive.
- **Never trust the cached `fileId`.** `findExistingBackupFile()` always searches first, then falls back to the cached ID only if the search itself failed. This prevents duplicate files across devices — see the comment at the top of `107-app-drive-sync.js`.
- **Firefox requires a registered redirect URI.** The OAuth flow silently breaks on temporary extensions because the extension hash changes on every load. Test on a signed build or on Chromium.

Full setup steps (Google Cloud Console, client ID, redirect URIs) live in the [README](./README.md#setup-for-developers-running-from-source).

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