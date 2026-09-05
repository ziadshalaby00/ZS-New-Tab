# Known Issues & Reporting Bugs

## How to report a bug

If you run into a problem, please open a [GitHub Issue](https://github.com/ziadshalaby00/ZS-New-Tab/issues) and include:

1. **Browser & version** (e.g. Chrome 128, Edge 127)
2. **Steps to reproduce** the issue
3. **Expected behavior** vs **what actually happened**
4. **Screenshots** if it's a visual bug
5. Any errors shown in the console (`F12` → Console tab)

## Known issues

- [ ] Favicons depend on Google's public favicon service — if a site's favicon isn't indexed there, the colored-letter fallback is used instead.
- [ ] Large background images stored via IndexedDB may take a moment to load on first paint after a fresh browser start.
- [ ] Import only accepts backup files exported by this extension — importing a manually edited JSON with the wrong structure will show an "invalid backup" alert.

## Feature requests

Feature requests are welcome! Please open an issue with the `enhancement` label and describe:
- What problem it solves
- How you imagine it working