# ZS New Tab

A minimal, fast, and fully offline **New Tab** replacement for Chrome — a personal bookmark dashboard with a search bar, a customizable grid, and a settings panel. No accounts, no tracking, no backend. Everything is stored locally in your browser (`localStorage` + `IndexedDB`).

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
- **Custom background** — upload any image as your background, stored locally via IndexedDB (not localStorage, so large images don't hit storage limits)
- **Smart image compression** — background and icon uploads are automatically downscaled (via canvas, before saving) to keep storage lean and loading fast, without a visible quality hit
- **Seamless first load** — the background image and bookmark grid are synchronized to fade in together as one unified reveal, instead of popping in separately
- **Backup & restore** — export your full setup (sites, settings, background image) to a `.json` file, and import it back anytime
- **Keyboard shortcuts** — `/` to focus search, `Esc` to close any open panel or modal
- **Dark UI** — clean dark theme with smooth transitions, built with plain CSS (no frameworks)

## Supported browsers

Built on Manifest V3 (minimum Chrome 88), so it works on any Chromium-based browser:
- Chrome
- Edge
- Brave
- Opera
- Vivaldi

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

Opera's extension store enforces stricter validation on `chrome_url_overrides.newtab` for
side-loaded / unpacked extensions, and rejects it with:

> `'chrome_url_overrides' is not allowed for specified extension ID.`

To use **ZS New Tab** on Opera, replace `manifest.json` with the following, and add a
`background.js` file next to it. Instead of overriding the new tab page directly, this
approach uses a background script that listens for Opera's default start page / new tab
URLs and redirects them to `index.html`.

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

## Project structure

```
├── manifest.json             # Chrome extension manifest (MV3)
├── index.html                # New tab page markup
├── styles.css                # All styling (dark theme, responsive grid, panels, modal)
├── script.js                 # App logic (state, rendering, IndexedDB, drag & drop, import/export)
├── CONTRIBUTING.md           # How to set up the project and submit changes
├── ISSUES.md                 # Known issues and how to report bugs
├── icons/
└── images/
```

## Tech stack

- Vanilla HTML, CSS, and JavaScript — no build step, no dependencies
- `localStorage` for app state (sites and settings)
- `IndexedDB` for storing background images and custom site icons
- Canvas-based image resizing pipeline for compressing uploads before storage
- Google Fonts (Inter, JetBrains Mono) loaded via CDN

## Performance & UX details

- **Unified load sequence**: on startup, the app waits for both the grid render and the background image to be ready before revealing anything, so the page appears as a single smooth transition instead of the background and bookmarks popping in at different times. A short timeout safeguard ensures a slow background load never blocks the page from appearing.
- **Automatic image resizing**: any image you upload (background or site icon) is resized on a `<canvas>` before being saved — backgrounds are capped at 1920×1080 and icons at 128×128 — cutting down storage size and speeding up future loads, with no manual compression needed from the user.

## Customization

- **Search engines**: add more options in the `<select id="engineSelect">` element in `index.html`.
- **Colors**: all theme colors are CSS variables at the top of `styles.css` (`:root { --accent, --bg-0, ... }`) — change them in one place to re-theme the whole app.
- **Default bookmarks**: edit the `defaultState.sites` array in `script.js` to change what ships by default for a fresh install.
- **Resize limits**: adjust the max width/height/quality passed to `resizeImage()` in `script.js` if you want larger or smaller stored images.

## Data & privacy

Almost everything lives in your browser only:
- Sites and settings → `localStorage`
- Background image and custom site icons → `IndexedDB` (resized before storage to keep things light)

Two things do reach outside your browser:
- **Favicon lookups**, via Google's public favicon service (`https://www.google.com/s2/favicons`), used to fetch each site's icon.
- **Google Fonts**, loaded from `fonts.googleapis.com` and `fonts.gstatic.com` for the Inter and JetBrains Mono typefaces used in the UI.

No account, analytics, or backend is involved beyond that.

## Backup

Use **Export backup (.json)** in the settings panel to save your full setup, and **Import backup** to restore it — on this browser or a fresh install. Only backup files exported by this extension are supported; a manually edited or malformed JSON file will show an "invalid backup" alert.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and the PR workflow. Found a bug or have a feature request? Check [ISSUES.md](./ISSUES.md) for the bug report format and a list of known issues before opening a new one.

## License

Developed entirely by [Ziad Shalaby](https://github.com/ziadshalaby00).

MIT — do whatever you'd like with it.
