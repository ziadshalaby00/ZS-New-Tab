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
- **Backup & restore** — export your full setup (sites, settings, background image) to a `.json` file, and import it back anytime
- **Keyboard shortcuts** — `/` to focus search, `Esc` to close any open panel or modal
- **Dark UI** — clean dark theme with smooth transitions, built with plain CSS (no frameworks)

## Supported browsers

Built on Manifest V3, so it works on any Chromium-based browser:
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

## Project structure

```
├── manifest.json           # Chrome extension manifest (MV3)
├── index.html              # New tab page markup
├── styles.css              # All styling (dark theme, responsive grid, panels, modal)
├── script.js               # App logic (state, rendering, IndexedDB, drag & drop, import/export)
├── icons/          
└── images/
```

## Tech stack

- Vanilla HTML, CSS, and JavaScript — no build step, no dependencies
- `localStorage` for app state (sites and settings)
- `IndexedDB` storing background images and custom site icons
- Google Fonts (Inter, JetBrains Mono) loaded via CDN

## Customization

- **Search engines**: add more options in the `<select id="engineSelect">` element in `index.html`.
- **Colors**: all theme colors are CSS variables at the top of `styles.css` (`:root { --accent, --bg-0, ... }`) — change them in one place to re-theme the whole app.
- **Default bookmarks**: edit the `defaultState.sites` array in `script.js` to change what ships by default for a fresh install.

## Data & privacy

Everything lives in your browser only:
- Sites and settings → `localStorage`
- Background image → `IndexedDB`

Nothing is sent to any server except favicon lookups, which go through Google's public favicon service (`https://www.google.com/s2/favicons`) to fetch each site's icon.

## Backup

Use **Export backup (.json)** in the settings panel to save your full setup, and **Import backup** to restore it — on this browser or a fresh install.

## License

Developed entirely by [Ziad Shalaby](https://github.com/ziadshalaby00).

MIT — do whatever you'd like with it.
