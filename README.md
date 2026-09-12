# ZS New Tab

A minimal, fast, and fully offline **New Tab** replacement for Chrome — a personal bookmark dashboard with a search bar, a customizable grid, and a settings panel. No accounts, no tracking, no backend. Everything is stored locally in your browser.

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
- **Custom icons** — auto-fetched favicons, with the option to upload your own icon per site, and a colored-letter fallback if a favicon fails to load
- **Quick search** — search from the new tab directly, with a switchable search engine (Google, DuckDuckGo, Brave, Bing), or type a URL to go straight there
- **Pagination** — grid pages with dot navigation, arrow buttons, and mouse-wheel scrolling
- **Settings panel** — customize your display name, grid rows/columns, and background image
- **Custom background** — upload any image as your background, with a smooth crossfade whenever it changes
- **Smart image compression** — background images and site icons are automatically downscaled and re-encoded (via canvas, before saving) to keep storage lean and loading fast, without a visible quality hit
- **Backup & restore** — export your full setup (sites, settings, background image) to a `.json` file, and import it back anytime
- **Keyboard shortcuts** — `/` to focus search, `P` to toggle the settings panel, `Esc` to close any open panel or modal
- **Dark UI** — clean dark theme built with plain CSS (no frameworks)
- **Modular architecture** — a shared core module (`ZSCore`) holds default state, helpers, and UI logic; a dedicated storage module (`ZSDB`) handles the background image

## Architecture & storage

The app is a single, unified build (there is no longer a "default" vs "shadow" split). Storage is split by what each piece of data needs:

| Data | Storage | Why |
|---|---|---|
| Sites & settings | `localStorage` | Small, needs to be read instantly on every load |
| Custom site icons | `localStorage` (as WebP data URLs) | Small after compression, read synchronously alongside the grid — no async wait before a tile can render |
| Background image | `IndexedDB` (via `script.db.js` / `ZSDB`) | Can be large; IndexedDB has no practical size ceiling, unlike `localStorage`'s ~5–10 MB limit |

**Why the background gets its own module:** the background is the one asset that can genuinely be large, so it's kept out of `localStorage` and given a dedicated, resilient storage layer (`ZSDB`) with:
- A snapshot-and-rollback save: if writing the new background fails (or the image fails to decode), the previous background is restored automatically — you're never left in a broken state.
- A smooth crossfade transition whenever the background is set, changed, or removed, instead of a hard cut.

## Tech stack

- **Vanilla HTML, CSS, and JavaScript** — no build step, no dependencies.
- **`js/script.core.js` (`ZSCore`)** — default state, utility functions (favicon URLs, color generation, image resizing, HTML escaping), reusable UI components (tiles, pagination, confirm dialogs), and global event wiring (search, shortcuts, scroll/drag navigation).
- **`js/script.db.js` (`ZSDB`)** — a small, self-contained IndexedDB wrapper responsible only for the background image: get / set / remove / apply, with rollback on failure and a crossfade transition.
- **`js/script.js`** — the main application: state management, rendering, the add/edit site modal, the settings panel, and backup import/export. Uses `ZSCore` for shared logic and `ZSDB` for the background.
- **Canvas-based image resizing** — icons are resized to 96×96 and re-encoded as WebP; the background is capped at 1920×1080 as JPEG/PNG.
- **Self-hosted fonts** — Inter and JetBrains Mono are bundled locally in the project (`fonts/`) via `@font-face`, not loaded from an external CDN.

## Supported browsers

Primarily built on Manifest V3 (minimum Chrome 88) for Chromium-based browsers:
- Chrome
- Edge
- Brave
- Opera
- Vivaldi

Also tested on **Firefox Developer Edition**.

## Installation

### From source (developer mode)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Open a new tab — you're done.

### Enable in Incognito (optional)

Go to `chrome://extensions`, find **ZS New Tab**, click **Details**, and toggle **Allow in incognito**.

## Opera Support

Opera's extension store enforces stricter validation on `chrome_url_overrides.newtab` for side-loaded / unpacked extensions, and rejects it with:

> `'chrome_url_overrides' is not allowed for specified extension ID.`

To use **ZS New Tab** on Opera, replace `manifest.json` with the following, and add a `background.js` file next to it. Instead of overriding the new tab page directly, this approach uses a background script that listens for Opera's default start page / new tab URLs and redirects them to `index.html`.

**`manifest.json` (Opera variant):**
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
  "background": {
    "scripts": ["background.js"]
  },
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
  chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL("index.html")
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab.pendingUrl || tab.url || "";

  if (currentUrl) {
    const startPages = [
      "opera://startpage",
      "chrome://startpage",
      "chrome://newtab",
      "edge://newtab",
      "about:blank"
    ];

    if (startPages.some(page => currentUrl.startsWith(page))) {
      redirectToIndex(tabId);
    }
  }
});
```

## Customization

- **Search engines**: Add more options in the `<select id="engineSelect">` element in `index.html`.
- **Colors**: All theme colors are CSS variables at the top of **`styles/styles.css`** (`:root { --accent, --bg-0, ... }`).
- **Default bookmarks**: Edit the `defaultState.sites` array in **`js/script.core.js`** to change what ships by default for a fresh install.
- **Resize limits**: Icon and background dimensions/quality are set inside the `resizeImage(file, type)` function in **`js/script.core.js`** — `type: "icon"` controls the 96×96 WebP icons, anything else controls the 1920×1080 background.

## Data & privacy

Almost everything lives in your browser only:
- Sites, settings, and custom site icons → `localStorage`
- Background image → `IndexedDB` (via `script.db.js`)

One thing does reach outside your browser:
- **Favicon lookups**, via Google's public favicon service (`https://www.google.com/s2/favicons`), used to fetch each site's icon. Fonts are bundled locally and never fetched externally.

No account, analytics, or backend is involved beyond that.

## Backup

Use **Export backup (.json)** in the settings panel to save your full setup (sites, settings, site icons, and background), and **Import backup** to restore it — on this browser or a fresh install. Only backup files exported by this extension are supported; a manually edited or malformed JSON file will show an "invalid backup" alert.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and the PR workflow. Found a bug or have a feature request? Check [ISSUES.md](./ISSUES.md) for the bug report format and a list of known issues before opening a new one.

## License

Developed entirely by [Ziad Shalaby](https://github.com/ziadshalaby00).

MIT — do whatever you'd like with it.