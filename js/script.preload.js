/**
 * ZS New Tab – Preload script
 * Applies the saved accent color synchronously before the stylesheet loads
 * to prevent an accent-color flash on startup.
 */
(function () {
    try {
        var raw = localStorage.getItem('ZSNewTab.settings');
        if (!raw) return;

        var settings = JSON.parse(raw).settings;
        if (!settings || !settings.accent) return;

        var hex = String(settings.accent)
            .trim()
            .replace(/^#/, '');

        if (hex.length === 3) {
            hex = hex.split('').map(function (c) {
                return c + c;
            }).join('');
        }

        if (!/^[0-9a-f]{6}$/i.test(hex)) return;

        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);

        var root = document.documentElement;

        root.style.setProperty('--accent', '#' + hex);
        root.style.setProperty('--accent-rgb', r + ', ' + g + ', ' + b);

        var brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        root.style.setProperty(
            '--accent-contrast',
            brightness > 150 ? '#1a1408' : '#ffffff'
        );
    } catch (e) {
        // Fail silently — CSS defaults will take effect.
    }
})();