# Known Issues & Reporting Bugs

## How to report a bug

Open a [GitHub Issue](https://github.com/ziadshalaby00/ZS-New-Tab/issues) with:

1. **Browser & version** (e.g. Chrome 128, Edge 127, Firefox 130)
2. **How you installed it** — built from source (`node build.js` → load `dist/`), or from a release `.zip`
3. **Steps to reproduce**
4. **Expected** vs **actual** behavior
5. **Screenshots** for visual bugs
6. Any console errors (`F12` → Console tab)

## Known issues

- [ ] Favicons depend on Google's public favicon service — if a site's favicon isn't indexed there, the colored-letter fallback is used.
- [ ] Large backgrounds stored in IndexedDB may take a moment on first paint after a fresh browser start.
- [ ] Import only accepts backups exported by this extension — hand-edited JSON triggers an "invalid backup" alert.
- [ ] `build.js` copies the entire `icons/` and `fonts/` folders into `dist/`, even if some files aren't referenced anywhere — dead assets end up in the packaged `.zip` / `.xpi`.
- [ ] The dev server preview does **not** emulate `chrome.*` APIs — test extension behavior by loading `dist/` as an unpacked extension.

## Build & tooling issues

- Run `npm install` at least once (esbuild lives in `devDependencies`).
- **"files found but not referenced in index.html"** → you added a file under `js/` or `styles/` without a matching tag in `index.html`.
- **"files not in numeric order"** → renumber the files or reorder the tags so prefix matches load order.
- Minified build fails but `--no-minify` works → try `npm update esbuild`.

## Feature requests

Open an issue with the `enhancement` label describing:

- What problem it solves
- How you imagine it working
- Whether it fits the project's scope (offline-first, no accounts, no backend)
