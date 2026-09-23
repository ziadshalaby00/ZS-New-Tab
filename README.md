# ZS New Tab

A minimal, fast, and offline-first New Tab replacement for Chromium-based browsers and Firefox. Enjoy a clean and customizable bookmark dashboard with quick search, drag-and-drop organization, customizable grids and layouts, custom backgrounds, themes, and a settings panel. Built with privacy in mind — no accounts, no tracking, no backend. Everything is stored locally, with built-in backup and restore.

![Version](https://img.shields.io/github/v/release/ziadshalaby00/ZS-New-Tab)
![Stars](https://img.shields.io/github/stars/ziadshalaby00/ZS-New-Tab)
![Issues](https://img.shields.io/github/issues/ziadshalaby00/ZS-New-Tab)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Available-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/zs-new-tab/)

<p align="center">
  <img src="./images/s1.png" width="32%">
  <img src="./images/s2.png" width="32%">
  <img src="./images/s3.png" width="32%">
</p>

## Features

- **Bookmark grid** — add, edit, delete, and reorder sites with drag & drop
- **Custom icons** — auto-fetched favicons, optional per-site upload, colored-letter fallback
- **Quick search** — switchable engines (Google, DuckDuckGo, Brave, Bing); typing a URL, IP, or bare domain (e.g. `github.com`) navigates directly
- **Pagination** — dot navigation, arrow buttons, mouse-wheel scrolling, and drag-to-edge paging (hold a dragged tile near the left/right edge to flip pages)
- **Accent colors** — 18 presets + custom color picker; the whole UI re-themes instantly
- **Settings panel** — display name, grid rows/columns, background image, accent color
- **Custom background** — upload any image, with a smooth crossfade on change
- **Smart compression** — icons (96×96 WebP) and backgrounds (1920×1080) are downscaled before saving
- **Backup & restore** — export/import your full setup (sites, settings, icons, background) as `.json`
- **Styled confirm dialogs** — custom in-app modals for destructive actions
- **Dark UI** — plain CSS, no frameworks

### Keyboard & mouse shortcuts

| Input | Action |
|---|---|
| `/` | Focus search |
| `P` | Toggle settings panel |
| `Esc` | Close any open panel / modal / dialog |
| `Enter` / `Ctrl`+`Enter` | Open focused tile (current / new tab) |
| Arrow keys | Move focus between tiles; flips page at edges |
| Middle-click | Open tile in new tab |
| Right-click tile icon | Edit site |
| Scroll over grid | Previous / next page |

## Storage

| Data | Storage | Why |
|---|---|---|
| Sites & settings | `localStorage` | Small, read instantly on every load |
| Custom site icons | `localStorage` (WebP data URLs) | Small after compression, read synchronously |
| Background image | `IndexedDB` (DB `ZSNewTab`, store `meta`) | Can be large; no practical size ceiling |

The background has its own module (`js/100-db.js`) with a **snapshot-and-rollback** save (restores the previous image if anything fails) and a **two-layer crossfade** transition.

## Supported browsers

**Chromium-based** (Manifest V3, minimum Chrome 88):
- Chrome
- Edge
- Brave
- Opera
- Vivaldi

**Firefox:**
- Tested on Firefox Developer Edition
- **Published on Firefox Add-ons:** [ZS New Tab](https://addons.mozilla.org/firefox/addon/zs-new-tab/)

## Project structure

Source files are split by concern and prefixed with a number that defines their load order in `index.html`. The build script uses those same numbers to bundle everything into a single stylesheet and a single script for the packaged extension.

**Why the numeric prefixes?**

- `index.html` loads them in that order, so `00-init.js` runs first and defines `registerModule()` before anything else calls it.
- `build.js` parses `index.html` and warns if the load order breaks the numeric order.
- Each file merges into a shared namespace (`ZSCore`, `ZSDB`, or `ZSApp`) instead of overwriting it, so any file can add capabilities without caring whether it loads first or tenth.

## Development

### Prerequisites

- Node.js 18+
- `npm install` (installs esbuild, the only dependency)

### Dev server (recommended while working)

```bash
node dev-server.js            # fast rebuilds, no minification
node dev-server.js --minify   # rebuilds with minification
```

It does five things:

1. Runs `build.js` once in-process (no child process spawned).
2. Serves `dist/` over HTTP at `http://localhost:5500`.
3. Opens the URL in your default browser.
4. Watches `styles/`, `js/`, `index.html`, `manifest.json`, `fonts/`, `icons/` and rebuilds on change (debounced).
5. Injects a live-reload snippet so the page refreshes itself after each rebuild — no manual F5.

> ⚠️ This previews `dist/index.html` as a normal web page. It does **not** emulate `chrome.*` extension APIs. To actually test the extension behavior, load `dist/` as an unpacked extension in the browser.

### Manual build

```bash
node build.js                 # full build with minification
node build.js --no-minify     # skip minification (faster, easier to debug)
node build.js --no-clean      # keep existing dist/ instead of wiping it first
```

`build.js`:

- Parses `index.html` to discover which CSS/JS files to bundle, in which order.
- Warns about files present in `styles/` or `js/` that aren't referenced from `index.html` (dead files).
- Warns about out-of-order numeric prefixes.
- Concatenates everything, minifies with esbuild (if installed), copies `fonts/`, `icons/`, and `manifest.json`, rewrites `index.html` to point at the bundles.
- Reports the size of the bundled CSS/JS and the total size of `dist/`.

### Packaging

Once `dist/` is built:

```powershell
.\package-extension.ps1                 # builds both .zip (Chrome) and .xpi (Firefox)
.\package-extension.ps1 -Zip            # only .zip
.\package-extension.ps1 -Xpi            # only .xpi
.\package-extension.ps1 -Name my-name   # custom output name
```

Uses .NET's `ZipArchive` directly instead of `Compress-Archive`, so entry names always use `/` separators — required for Firefox to load scripts under `js/` correctly.

## Installation

### From source (development)

1. Clone the repo.
2. `npm install`
3. `node build.js`
4. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the **`dist/`** folder.
5. Open a new tab.

### From a release

1. Download `zs-new-tab.zip` from the [Releases page](https://github.com/ziadshalaby00/ZS-New-Tab/releases).
2. Extract it anywhere.
3. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder.
4. Open a new tab.

**Incognito:** `chrome://extensions` → **ZS New Tab** → **Details** → toggle **Allow in incognito**.

## Opera Support

Opera rejects `chrome_url_overrides.newtab` for side-loaded extensions. Replace `manifest.json` with the MV2 variant below and add a `background.js` that redirects Opera's start-page URLs to `index.html`.

**`manifest.json`:**
```json
{
  "manifest_version": 2,
  "name": "ZS New Tab",
  "short_name": "New Tab",
  "version": "1.0.0",
  "description": "A custom new tab page with a bookmark grid, quick search, and a settings panel for background image, layout, and backups.",
  "author": "Ziad Shalaby",
  "minimum_chrome_version": "88",
  "permissions": [ "tabs" ],
  "background": { "scripts": ["background.js"] },
  "icons": {
    "16": "./icons/favicon-16x16.png",
    "48": "./icons/favicon-48x48.png",
    "128": "./icons/favicon-128x128.png"
  },
  "incognito": "split"
}
```

**`background.js`:**
```javascript
function redirectToIndex(tabId) {
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL("index.html") });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab.pendingUrl || tab.url || "";
  if (!currentUrl) return;

  const startPages = [
    "opera://startpage", "chrome://startpage", "chrome://newtab",
    "edge://newtab", "about:blank"
  ];

  if (startPages.some(page => currentUrl.startsWith(page))) {
    redirectToIndex(tabId);
  }
});
```

## Customization

| What | Where |
|---|---|
| Search engines | `<select id="engineSelect">` in `index.html` |
| Accent presets | `THEMES` in `js/10-core-state.js` |
| Default bookmarks | `defaultState.sites` in `js/10-core-state.js` |
| Theme colors (CSS) | CSS variables at the top of `styles/20-variables.css` |
| Resize limits | `resizeImage()` in `js/30-core-utils.js` |
| Background fade duration | `--bg-fade-ms` in `styles/20-variables.css` |

After editing anything in `js/` or `styles/`, run `node build.js` (or leave the dev server running) to regenerate `dist/`.

## Debugging

Run `window.gl()` in the DevTools console for a table of every `localStorage` key with its size and the total — useful when checking quota usage.

The main namespaces exposed on `window`:

- `window.ZSCore` — helpers, theme, renderer, dialog, events
- `window.ZSDB` — IndexedDB background storage
- `window.ZSApp` — application state and controllers

## Privacy

Everything lives in your browser. The only external request is favicon lookups via Google's public favicon service. Fonts are bundled locally. No accounts, analytics, or backend.

## Backup

**Export backup (.json)** saves sites, settings, icons, and background. **Import backup** restores them. The importer is strict (only accepts files exported by this extension), sanitizes invalid fields, and snapshots current state + background before running — rolling back automatically if anything fails.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and feature requests — check [ISSUES.md](./ISSUES.md) first.
