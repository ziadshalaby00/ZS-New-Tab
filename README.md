# ZS New Tab

A minimal, fast, fully offline **New Tab** replacement for Chrome — a personal bookmark dashboard with a search bar, customizable grid, and settings panel. No accounts, no tracking, no backend. Everything is stored locally.

![Version](https://img.shields.io/github/v/release/ziadshalaby00/ZS-New-Tab)
![Stars](https://img.shields.io/github/stars/ziadshalaby00/ZS-New-Tab)
![Issues](https://img.shields.io/github/issues/ziadshalaby00/ZS-New-Tab)

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
| Middle-click / `Ctrl`+click | Open tile in new tab |
| Right-click tile icon | Edit site |
| Scroll over grid | Previous / next page |

## Storage

| Data | Storage | Why |
|---|---|---|
| Sites & settings | `localStorage` | Small, read instantly on every load |
| Custom site icons | `localStorage` (WebP data URLs) | Small after compression, read synchronously |
| Background image | `IndexedDB` (`ZSDB`) | Can be large; no practical size ceiling |

The background has its own module (`js/script.db.js`) with a **snapshot-and-rollback** save (restores the previous image if anything fails) and a **two-layer crossfade** transition.

## Project structure

- **`js/script.core.js` (`ZSCore`)** — default state, utilities (favicons, colors, image resizing, HTML escaping), shared UI components, accent theme system, global event wiring.
- **`js/script.db.js` (`ZSDB`)** — IndexedDB wrapper for the background image.
- **`js/script.js`** — main app: state, rendering, add/edit modal, settings panel, keyboard grid navigation, backup import/export.
- **`styles/styles.css`** — theme variables at the top; accent derived from `--accent-rgb` at runtime.
- **Self-hosted fonts** — Inter and JetBrains Mono, bundled locally.

## Supported browsers

Chromium-based (Chrome, Edge, Brave, Opera, Vivaldi) on Manifest V3, minimum Chrome 88. Also tested on **Firefox Developer Edition**.

## Installation

1. Clone or download this repo.
2. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the project folder.
3. Open a new tab.

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
    "48": "./icons/favicon-32x32.png",
    "128": "./icons/android-chrome-192x192.png"
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

- **Search engines** — edit `<select id="engineSelect">` in `index.html`.
- **Accent presets** — edit `ZSCore.THEMES` in `js/script.core.js`.
- **Theme colors** — CSS variables at the top of `styles/styles.css`.
- **Default bookmarks** — `defaultState.sites` in `js/script.core.js`.
- **Resize limits** — inside `resizeImage()` in `js/script.core.js`.

## Debugging

Run `window.gl()` in the DevTools console for a table of every `ZSNewTab.*` `localStorage` key with its size and the total — useful when checking quota usage.

## Privacy

Everything lives in your browser. The only external request is favicon lookups via Google's public favicon service (`https://www.google.com/s2/favicons`). Fonts are bundled locally. No accounts, analytics, or backend.

## Backup

**Export backup (.json)** saves sites, settings, icons, and background. **Import backup** restores them. The importer is strict (only accepts files exported by this extension), sanitizes invalid fields, and snapshots current state + background before running — rolling back automatically if anything fails.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and feature requests — check [ISSUES.md](./ISSUES.md) first.

## License

Developed by [Ziad Shalaby](https://github.com/ziadshalaby00). MIT — do whatever you'd like with it.