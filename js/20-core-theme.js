window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Converts "#rrggbb" (or "#rgb") into { r, g, b }, or null if invalid.
     */
    function hexToRgb(hex) {
        let h = String(hex || "").trim().replace(/^#/, "");
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        if (!/^[0-9a-f]{6}$/i.test(h)) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    /**
     * Applies an accent color to the whole UI by updating the CSS variables.
     * --accent-dim / --accent-soft / --accent-glow derive from --accent-rgb
     * automatically, so we only need to set two variables here.
     * @returns {boolean} false if the color is invalid
     */
    function applyAccent(hex) {
        const rgb = hexToRgb(hex);
        if (!rgb) return false;

        const root = document.documentElement;
        const norm = "#" + [rgb.r, rgb.g, rgb.b]
            .map(v => v.toString(16).padStart(2, "0"))
            .join("");

        // Perceived brightness → pick readable text on top of the accent
        const brightness = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;

        root.style.setProperty("--accent", norm);
        root.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        root.style.setProperty(
            "--accent-contrast",
            brightness > 150 ? "#1a1408" : "#ffffff"
        );
        return true;
    }

    return {
        hexToRgb,
        applyAccent
    }
})());