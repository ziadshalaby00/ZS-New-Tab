/**
 *  ZS New Tab – Shared Module
 *  It contains default settings, common helper functions, and UI event settings.
 *  (This file must be loaded before script.js or script.shadow.js.)
 */
window.ZSShared = (function () {
    "use strict";

    // =============================================
    //  1. DEFAULT STATE
    // =============================================
    const defaultState = {
        settings: {
            name: "",
            rows: 4,
            cols: 6,
            engine: "https://www.google.com/search?q=",
            bg: false // Shadow version doesn't strictly need this but it is harmless
        },
        sites: [
            { id: "1", name: "Google", url: "https://google.com" },
            { id: "2", name: "YouTube", url: "https://youtube.com" },
            { id: "3", name: "Facebook", url: "https://facebook.com" },
            { id: "4", name: "Instagram", url: "https://instagram.com" },
            { id: "5", name: "X (Twitter)", url: "https://x.com" },
            { id: "7", name: "Wikipedia", url: "https://wikipedia.org" },
            { id: "8", name: "Amazon", url: "https://amazon.com" },
            { id: "11", name: "LinkedIn", url: "https://linkedin.com" },
            { id: "12", name: "Reddit", url: "https://reddit.com" },
            { id: "13", name: "Pinterest", url: "https://pinterest.com" },
            { id: "14", name: "Twitch", url: "https://twitch.tv" },
            { id: "16", name: "Yahoo", url: "https://yahoo.com" },
            { id: "17", name: "Bing", url: "https://bing.com" },
            { id: "18", name: "Microsoft", url: "https://microsoft.com" },
            { id: "19", name: "Apple", url: "https://apple.com" },
            { id: "20", name: "GitHub", url: "https://github.com" },
            { id: "21", name: "ChatGPT", url: "https://chat.openai.com" },
            { id: "22", name: "Gmail", url: "https://mail.google.com" },
            { id: "23", name: "Google Drive", url: "https://drive.google.com" },
            { id: "24", name: "Google Maps", url: "https://maps.google.com" },
            { id: "25", name: "Telegram", url: "https://web.telegram.org" },
            { id: "26", name: "Discord", url: "https://discord.com" },
            { id: "27", name: "Zoom", url: "https://zoom.us" },
            { id: "28", name: "eBay", url: "https://ebay.com" },
            { id: "29", name: "AliExpress", url: "https://aliexpress.com" },
            { id: "30", name: "Canva", url: "https://canva.com" }
        ]
    };

    // =============================================
    //  2. UTILITY FUNCTIONS
    // =============================================
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function getHostname(url) {
        try { return new URL(url).hostname; } catch (_) { return ""; }
    }

    function getFaviconUrl(url) {
        const host = getHostname(url);
        return host ? `https://www.google.com/s2/favicons?sz=128&domain=${host}` : "";
    }

    function getFirstLetter(name) {
        return (name || "?").trim().charAt(0).toUpperCase();
    }

    function getColorForName(name) {
        const palette = ["#e8a33d", "#5fd3c4", "#6f9be0", "#c77dd1", "#e2685f", "#7fbf7f", "#d4a24d", "#8a8fe0"];
        let sum = 0;
        for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
        return palette[sum % palette.length];
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    function dataURLToBlob(dataURL) {
        const parts = dataURL.split(",");
        const mime = parts[0].match(/:(.*?);/)[1];
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        return new Blob([ab], { type: mime });
    }

    function showConfirm(message, title = "Confirm") {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "overlay open";
            const modal = document.createElement("div");
            modal.className = "modal";
            modal.innerHTML = `
                <h2>${title}</h2>
                <p class="hint" style="margin-bottom:18px; font-size:13px; color:var(--text);">${message}</p>
                <div class="actions">
                    <button class="cancel">Cancel</button>
                    <button class="save danger-fill">Confirm</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            function cleanup(result) {
                overlay.remove();
                resolve(result);
            }

            modal.querySelector(".cancel").addEventListener("click", () => cleanup(false));
            modal.querySelector(".save").addEventListener("click", () => cleanup(true));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });

            function onKey(e) {
                if (e.key === "Escape") {
                    document.removeEventListener("keydown", onKey);
                    cleanup(false);
                }
            }
            document.addEventListener("keydown", onKey);
        });
    }

    function resizeImage(file, maxWidth, maxHeight, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = function () {
                URL.revokeObjectURL(objectUrl);
                let { width, height } = img;

                if (width <= maxWidth && height <= maxHeight) return resolve(file);

                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
                canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), outputType, quality);
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Failed to load image for resizing"));
            };
            img.src = objectUrl;
        });
    }

    // =============================================
    //  3. UI COMPONENTS & RENDER HELPERS
    // =============================================
    function buildEmptyTile() {
        const tile = document.createElement("div");
        tile.className = "tile empty";
        tile.draggable = false;
        tile.style.cssText = "cursor: default; pointer-events: none; opacity: 0;";
        
        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.cssText = "background: transparent !important; border: none !important; box-shadow: none !important; opacity: 0 !important; transform: none !important; pointer-events: none;";
        
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = "";
        label.style.opacity = "0";
        
        tile.appendChild(icon);
        tile.appendChild(label);
        return tile;
    }

    function buildAddTile(onClickFn) {
        const tile = document.createElement("div");
        tile.className = "tile add";
        
        const icon = document.createElement("div");
        icon.className = "icon";
        icon.textContent = "+";
        
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = "Add site";
        
        tile.appendChild(icon);
        tile.appendChild(label);
        tile.addEventListener("click", onClickFn);
        return tile;
    }

    function createRenderer(gridId, renderFn) {
        let isTransitioning = false;
        return function (force = false) {
            const grid = document.getElementById(gridId);
            if (!grid) return;
            if (force) {
                renderFn();
                grid.style.transition = 'none';
                grid.style.opacity = '1';
                isTransitioning = false;
                return;
            }
            if (isTransitioning) return;
            
            grid.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            grid.style.opacity = '0';
            isTransitioning = true;
            
            setTimeout(() => {
                renderFn();
                requestAnimationFrame(() => {
                    grid.style.opacity = '1';
                    setTimeout(() => { isTransitioning = false; }, 50);
                });
            }, 150);
        };
    }

    function updatePaginationUI(total, currentPage, onPageSelect) {
        const dotsContainer = document.getElementById("dots");
        if (dotsContainer) {
            dotsContainer.innerHTML = "";
            if (total > 1) {
                for (let i = 0; i < total; i++) {
                    const dot = document.createElement("div");
                    dot.className = "dot" + (i === currentPage ? " active" : "");
                    dot.addEventListener("click", () => onPageSelect(i));
                    dotsContainer.appendChild(dot);
                }
            }
        }
        document.getElementById("prevPage")?.classList.toggle("active", currentPage > 0);
        document.getElementById("nextPage")?.classList.toggle("active", currentPage < total - 1);
    }

    // =============================================
    //  4. PAGINATION MATH
    // =============================================
    function getPageSize(rows, cols) {
        return rows * cols;
    }

    function getTotalPages(sitesCount, rows, cols) {
        return Math.max(1, Math.ceil((sitesCount + 1) / getPageSize(rows, cols)));
    }

    // =============================================
    //  5. GLOBAL EVENT SETUPS
    // =============================================
    function setupGreeting(selector) {
        const node = document.querySelector(selector)?.firstChild;
        if (!node) return;
        const update = () => {
            const hour = new Date().getHours();
            const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
            node.textContent = `${greeting}, `;
        };
        update();
        setInterval(update, 15000);
    }

    function setupSearchForm(formId, inputId, getEngineFn) {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = document.getElementById(inputId).value.trim();
            if (!query) return;
            const looksLikeUrl = /^https?:\/\//i.test(query) || (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(query) && !query.includes(" "));
            window.location.href = looksLikeUrl ? (/^https?:\/\//i.test(query) ? query : `https://${query}`) : getEngineFn() + encodeURIComponent(query);
        });
    }

    function setupKeyboardShortcuts(searchInputId, onEscapeFn) {
        document.addEventListener("keydown", (e) => {
            if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
                e.preventDefault();
                document.getElementById(searchInputId)?.focus();
            }
            if (e.key === "Escape" && onEscapeFn) {
                onEscapeFn();
            }
        });
    }

    function setupClickOutsidePanel(panelId, toggleBtnId) {
        document.addEventListener("click", (e) => {
            const panel = document.getElementById(panelId);
            const toggle = document.getElementById(toggleBtnId);
            if (panel?.classList.contains("open")) {
                if (!panel.contains(e.target) && e.target !== toggle && !toggle?.contains(e.target)) {
                    panel.classList.remove("open");
                }
            }
        });
    }

    function setupScrollNavigation(gridWrapSelector, callbacks) {
        const gridWrap = document.querySelector(gridWrapSelector);
        if (!gridWrap) return;
        let scrollTimeout = false;
        gridWrap.addEventListener('wheel', function (e) {
            e.preventDefault();
            const total = callbacks.getTotalPages();
            if (total <= 1 || scrollTimeout) return;
            
            const delta = e.deltaY;
            const current = callbacks.getCurrentPage();
            if (delta > 20 && current < total - 1) {
                callbacks.onPageChange(current + 1);
                scrollTimeout = true;
                setTimeout(() => { scrollTimeout = false; }, 250);
            } else if (delta < -20 && current > 0) {
                callbacks.onPageChange(current - 1);
                scrollTimeout = true;
                setTimeout(() => { scrollTimeout = false; }, 250);
            }
        });
    }

    // =============================================
    //  6. STORAGE INSPECTOR (Global Utility)
    // =============================================
    function getLocalStorageSize() {
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const value = localStorage.getItem(key);
            const size = (key.length + value.length) * 2;
            items.push({ key, bytes: size, kb: size / 1024 });
        }
        items.sort((a, b) => b.bytes - a.bytes);
        console.table(items.map(item => ({ Key: item.key, "Size (KB)": item.kb.toFixed(2), "Size (Bytes)": item.bytes })));
        const total = items.reduce((sum, item) => sum + item.bytes, 0);
        console.log(`Total localStorage size: ${(total / 1024).toFixed(2)} KB`);
        return { totalBytes: total, totalKB: total / 1024, totalMB: total / (1024 * 1024), items };
    }

    return {
        defaultState,
        generateId,
        getHostname,
        getFaviconUrl,
        getFirstLetter,
        getColorForName,
        blobToDataURL,
        dataURLToBlob,
        showConfirm,
        resizeImage,
        buildEmptyTile,
        buildAddTile,
        createRenderer,
        updatePaginationUI,
        getPageSize,
        getTotalPages,
        setupGreeting,
        setupSearchForm,
        setupKeyboardShortcuts,
        setupClickOutsidePanel,
        setupScrollNavigation,
        getLocalStorageSize
    };
})();

window.getLocalStorageSize = ZSShared.getLocalStorageSize;