window.registerModule('ZSCore', (function () {
    "use strict";

    const INVALID_SCHEMES = new Set([
        "javascript",   "data", 
        "vbscript",     "about", 
        "chrome",       "edge", 
        "brave",        "opera", 
        "vivaldi",      "file", 
        "ftp", "mailto", "tel"
    ]);

    /**
     * Generates a unique alphanumeric ID based on the current timestamp and a random string.
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Extracts the hostname from a given URL string, returning an empty string if the URL is invalid.
     */
    function getHostname(url) {
        try { 
            return new URL(url).hostname; 
        } catch (_) { 
            return ""; 
        }
    }

    /**
     * Returns the Google favicon URL for a given website URL.
     * Uses faviconV2 directly (s2/favicons just redirects here anyway)
     * so we control the requested size and know that a 16x16 response
     * means "no real favicon — Google returned its default globe".
     */
    function getFaviconUrl(url) {
        const host = getHostname(url);
        if (!host) return "";
        return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${host}&size=128`;
    }

    /**
     * Returns the first uppercase letter of a given name, or "?" if the name is empty.
     */
    function getFirstLetter(name) {
        return (name || "?").trim().charAt(0).toUpperCase();
    }

    /**
     * Generates a consistent color from a predefined palette based on the sum of character codes in the name.
     */
    function getColorForName(name) {
        const palette = ["#e8a33d", "#5fd3c4", "#6f9be0", "#c77dd1", "#e2685f", "#7fbf7f", "#d4a24d", "#8a8fe0"];
        let sum = 0;
        for (let i = 0; i < name.length; i++) {
            sum += name.charCodeAt(i);
        }
        return palette[sum % palette.length];
    }

    /**
     * Converts a Blob object to a Data URL string using a Promise.
     */
    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Converts a Data URL string back to a Blob object with the correct MIME type.
     */
    function dataURLToBlob(dataURL) {
        const parts = dataURL.split(",");
        const mime = parts[0].match(/:(.*?);/)[1];
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    }

    /**
     * Escapes HTML special characters so a string can be safely placed inside HTML.
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /**
     * Resizes an image file to fit within specified maximum width and height, returning a Promise that resolves to a resized Blob.
     */
    function resizeImage(file, type) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = function () {
                URL.revokeObjectURL(objectUrl);

                let { width, height } = img;

                const isIcon = type === "icon";
                const maxWidth = isIcon ? 96 : 1920;
                const maxHeight = isIcon ? 96 : 1080;
                const quality = isIcon ? 0.85 : 0.82;

                const ratio = Math.min(
                    maxWidth / width,
                    maxHeight / height,
                    1
                );

                width = Math.round(width * ratio);
                height = Math.round(height * ratio);

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // WebP for both icons and backgrounds:
                //   - Icons: already WebP; nothing changes.
                //   - Backgrounds: the old PNG branch ignored the `quality` parameter
                //     (PNG is lossless), so large PNG uploads were never actually
                //     compressed. WebP handles both photographic and graphic content
                //     well, supports alpha, and actually respects `quality`.
                const outputType = "image/webp";

                canvas.toBlob(
                    (blob) => blob
                        ? resolve(blob)
                        : reject(new Error("Canvas toBlob failed")),
                    outputType,
                    quality
                );
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Failed to load image for resizing"));
            };

            img.src = objectUrl;
        });
    }

    /**
     * Classifies a raw string into one of four kinds:
     *   - navigable : safe URL that can be opened
     *   - search    : not a URL, treat as search query
     *   - invalid   : has a scheme we refuse to navigate to
     *   - empty     : nothing usable
     *
     * Pure function. Never throws.
     */
    function classifyInput(raw) {
        const input = String(raw || "").trim();
        if (!input) {
            return { kind: "empty", url: null, query: null, scheme: null, reason: null };
        }

        const schemeMatch = input.match(/^([a-z][a-z0-9+\-]*):/i);
        const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;

        // 1) Invalid schemes — checked first for security
        if (scheme && INVALID_SCHEMES.has(scheme)) {
            return {
                kind: "invalid", url: null, query: null, scheme,
                reason: `"${scheme}:" links are not allowed.`
            };
        }

        // 2) http / https
        if (scheme === "http" || scheme === "https") {
            try {
                const u = new URL(input);
                if (!u.hostname) throw new Error("no host");
                return { kind: "navigable", url: u.href, query: null, scheme, reason: null };
            } catch {
                return {
                    kind: "invalid", url: null, query: null, scheme,
                    reason: `"${input}" is not a valid ${scheme} URL.`
                };
            }
        }

        // 3) Pattern-based checks — run BEFORE generic scheme handling,
        //    because "localhost:" and "example.com:" look like schemes
        //    to a naive regex but are actually host + port.

        // 3a) localhost (optional port + path)
        if (/^localhost(:\d+)?(\/.*)?$/i.test(input)) {
            return { kind: "navigable", url: "http://" + input, query: null, scheme: "http", reason: null };
        }

        // 3b) IPv4 (optional port + path)
        if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?(\/.*)?$/.test(input)) {
            const octets = input.split(/[.:/]/).slice(0, 4).map(Number);
            if (octets.every(n => n >= 0 && n <= 255)) {
                return { kind: "navigable", url: "http://" + input, query: null, scheme: "http", reason: null };
            }
        }

        // 3c) Bare domain (with optional port + path)
        if (!input.includes(" ") &&
            /^([a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input)) {
            return { kind: "navigable", url: "https://" + input, query: null, scheme: "https", reason: null };
        }

        // 5) Fallback → search
        return { kind: "search", url: null, query: input, scheme: null, reason: null };
    }

    return {
        generateId,
        getHostname,
        getFaviconUrl,
        getFirstLetter,
        getColorForName,
        blobToDataURL,
        dataURLToBlob,
        escapeHtml,
        resizeImage,
        classifyInput,
    }
})());