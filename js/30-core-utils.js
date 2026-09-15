window.registerModule('ZSCore', (function () {
    "use strict";

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
     */
    function getFaviconUrl(url) {
        const host = getHostname(url);
        return host ? `https://www.google.com/s2/favicons?sz=128&domain=${host}` : "";
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

                const outputType = isIcon
                    ? "image/webp"
                    : file.type === "image/png"
                        ? "image/png"
                        : "image/jpeg";

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

    return {
        generateId,
        getHostname,
        getFaviconUrl,
        getFirstLetter,
        getColorForName,
        blobToDataURL,
        dataURLToBlob,
        escapeHtml,
        resizeImage
    }
})());