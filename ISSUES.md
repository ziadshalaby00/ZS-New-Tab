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

### General

- [ ] Favicons depend on Google's public favicon service — if a site's
  favicon isn't indexed there, the colored-letter fallback is used.
- [ ] Large backgrounds stored in IndexedDB may take a moment on first
  paint after a fresh browser start.
- [ ] Import only accepts backups exported by this extension —
  hand-edited JSON triggers an "invalid backup" alert.
- [ ] The dev server preview does **not** emulate `chrome.*` APIs — test
  extension behavior by loading `dist/` as an unpacked extension.

### Google Drive sync

- [ ] **Firefox: OAuth does not work on temporary extensions.** A
  temporary extension loaded via `about:debugging` gets a random UUID
  on every load, so its redirect URI changes each time and Google
  rejects the request with `redirect_uri_mismatch`. Test on a signed
  build or on Chromium.
- [ ] **Firefox: redirect URI must be registered in Google Cloud Console**
  before Drive sync works. See the "Setup for developers" section in
  the README.
- [ ] **No cancel button during upload.** Once a Drive export starts,
  the user must wait for it to finish (or close the tab — the
  `beforeunload` handler will prompt a warning).
- [ ] **Duplicate backup files.** If multiple files with the same name
  (`zs-new-tab-backup.json`) exist on Drive, the extension keeps the
  newest and trashes the rest automatically. This is intentional, but
  it means a manually uploaded backup with the same name may be
  cleaned up.
- [ ] **401 / session expiry** requires the user to click Export/Import
  again — there is no silent retry on expired tokens.

## Known limitations

- [ ] `build.js` copies the entire `icons/` and `fonts/` folders into
  `dist/` regardless of whether each file is referenced from
  `manifest.json` or `10-fonts.css`. All current assets are used, but
  adding an unreferenced file will silently increase the size of the
  packaged `.zip` / `.xpi`. Fixing this would require `build.js` to parse
  those files and copy only referenced assets.
- [ ] The extension has no "sign out of Google Drive" button in the
  settings panel. The auth token is cached in memory only and is
  discarded when the tab is closed; a `ZSDrive.signOut()` helper exists
  in code but is not yet wired to the UI.

## Build & tooling issues

- Run `npm install` at least once (esbuild lives in `devDependencies`).
- **"files found but not referenced in index.html"** → you added a file under `js/` or `styles/` without a matching tag in `index.html`.
- **"files not in numeric order"** → renumber the files or reorder the tags so prefix matches load order.
- Minified build fails but `--no-minify` works → try `npm update esbuild`.

## Feature requests

Open an issue with the `enhancement` label describing:

- What problem it solves
- How you imagine it working
- Whether it fits the project's scope (offline-first, local by default, opt-in cloud, no backend)

## Security & privacy

If you find a security issue — particularly anything touching OAuth
handling, the `drive.file` scope, or backup import/export — please
**do not** open a public issue. Contact the maintainer directly via
the email on the GitHub profile.