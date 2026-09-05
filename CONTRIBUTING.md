# Contributing to ZS New Tab

Thanks for wanting to contribute! This is a small vanilla HTML/CSS/JS project — no build step, no dependencies — so getting set up is quick.

## Getting started

1. Fork the repository and clone your fork.
2. Go to `chrome://extensions`, enable **Developer mode**, and click **Load unpacked** on the project folder to test your changes live.
3. Make your changes in `index.html`, `styles.css`, or `script.js`.
4. Reload the extension (or just open a new tab) to see your changes.

## Guidelines

- Keep it dependency-free — no frameworks or build tools.
- Match the existing code style (plain functions, clear comments per section).
- Theme colors live as CSS variables at the top of `styles.css` — reuse them instead of hardcoding new colors.
- Test any storage-related change (localStorage/IndexedDB) after a full browser restart, not just a page reload.

## Submitting changes

1. Create a branch: `git checkout -b fix/short-description`
2. Commit with a clear message describing what and why.
3. Open a Pull Request against `main` and describe:
   - What the change does
   - How you tested it
   - Screenshots for any UI changes

## Reporting bugs

See [ISSUES.md](./ISSUES.md) for the bug report format.