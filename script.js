/**
 * ----------------------------------------------
 *  New Tab – Full Application (with IndexedDB for backgrounds)
 * ----------------------------------------------
 */
(function () {
    "use strict";

    // =============================================
    //  1.  CONSTANTS
    // =============================================
    const STORE_KEY = "ZSNewTab.v1";
    const DB_NAME = "NewTabDB";
    const STORE_NAME = "background";

    // =============================================
    //  2.  DEFAULT STATE
    // =============================================
    const defaultState = {
        settings: {
            name: "",
            rows: 4,
            cols: 6,
            engine: "https://www.google.com/search?q=",
            bg: false
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
    //  3.  LOCAL STORAGE HELPERS
    // =============================================
    function loadState() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(defaultState));
            const parsed = JSON.parse(raw);
            if (!parsed.settings) parsed.settings = defaultState.settings;
            if (!parsed.sites) parsed.sites = [];
            if (typeof parsed.settings.bg !== "boolean") parsed.settings.bg = false;
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(defaultState));
        }
    }

    // =============================================
    //  4.  GLOBAL VARIABLES
    // =============================================

    let state = loadState();
    let currentPage = 0;
    let editingId = null;
    let dragSourceId = null;
    let isTransitioning = false;
    let tempIconData = null; // temporary Data URL for uploaded icon

    function saveState() {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // =============================================
    //  5.  INDEXEDDB HELPERS (background images)
    // =============================================
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = function (e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = function (e) {
                resolve(e.target.result);
            };
            request.onerror = function (e) {
                reject(e.target.error);
            };
        });
    }

    async function saveBackgroundBlob(blob) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(blob, "bg");
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
    }

    async function loadBackgroundBlob() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get("bg");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
    }

    async function deleteBackgroundBlob() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete("bg");
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
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
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    }

    // =============================================
    //  6.  BACKGROUND IMAGE MANAGEMENT
    // =============================================
    async function applyBackground() {
        const bgExists = state.settings.bg === true;
        if (bgExists) {
            try {
                const blob = await loadBackgroundBlob();
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    document.body.classList.add("has-bg-image");
                    document.body.style.backgroundImage = `url('${url}')`;
                    if (window._bgUrl) URL.revokeObjectURL(window._bgUrl);
                    window._bgUrl = url;
                } else {
                    state.settings.bg = false;
                    saveState();
                    document.body.classList.remove("has-bg-image");
                    document.body.style.backgroundImage = "";
                }
            } catch (e) {
                console.warn("Failed to load background from IndexedDB", e);
                document.body.classList.remove("has-bg-image");
                document.body.style.backgroundImage = "";
            }
        } else {
            document.body.classList.remove("has-bg-image");
            document.body.style.backgroundImage = "";
            if (window._bgUrl) {
                URL.revokeObjectURL(window._bgUrl);
                window._bgUrl = null;
            }
        }
    }

    // =============================================
    //  7.  UTILITY FUNCTIONS
    // =============================================
    function getHostname(url) {
        try {
            return new URL(url).hostname;
        } catch (_) {
            return "";
        }
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
        for (let i = 0; i < name.length; i++) {
            sum += name.charCodeAt(i);
        }
        return palette[sum % palette.length];
    }

    // =============================================
    //  8.  PAGINATION HELPERS
    // =============================================
    function getPageSize() {
        return state.settings.rows * state.settings.cols;
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil((state.sites.length + 1) / getPageSize()));
    }

    // =============================================
    //  9.  RENDERING FUNCTIONS
    // =============================================

    // Main render function
    function render() {
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        document.documentElement.style.setProperty("--rows", state.settings.rows);

        const name = state.settings.name || "there";
        document.getElementById("greetName").textContent = name;

        document.getElementById("engineSelect").value = state.settings.engine;

        const total = getTotalPages();
        if (currentPage >= total) currentPage = total - 1;
        if (currentPage < 0) currentPage = 0;

        const pageSize = getPageSize();
        const start = currentPage * pageSize;
        const pageSites = state.sites.slice(start, start + pageSize);

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        pageSites.forEach(site => {
            grid.appendChild(buildTile(site));
        });

        if (pageSites.length < getPageSize()) {
            grid.appendChild(buildAddTile());
        }

        const totalCells = pageSize;
        const filled = pageSites.length + 1;
        for (let i = filled; i < totalCells; i++) {
            grid.appendChild(buildEmptyTile());
        }

        const dotsContainer = document.getElementById("dots");
        dotsContainer.innerHTML = "";
        if (total > 1) {
            for (let i = 0; i < total; i++) {
                const dot = document.createElement("div");
                dot.className = "dot" + (i === currentPage ? " active" : "");
                dot.addEventListener("click", (function (idx) {
                    return function () {
                        currentPage = idx;
                        renderWithTransition();
                    };
                })(i));
                dotsContainer.appendChild(dot);
            }
        }

        document.getElementById("prevPage").classList.toggle("active", currentPage > 0);
        document.getElementById("nextPage").classList.toggle("active", currentPage < total - 1);
    }

    // Build a tile for a site
    function buildTile(site) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.draggable = true;
        tile.dataset.id = site.id;

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.background = getColorForName(site.name);

        const img = document.createElement("img");
        if (site.iconData) {
            img.src = site.iconData;
        } else {
            img.src = getFaviconUrl(site.url);
        }
        img.alt = "";
        img.onerror = function () {
            icon.innerHTML = "";
            const span = document.createElement("span");
            span.className = "letter";
            span.textContent = getFirstLetter(site.name);
            icon.appendChild(span);
        };
        icon.appendChild(img);

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = site.name;

        const actions = document.createElement("div");
        actions.className = "tile-actions";

        const editBtn = document.createElement("button");
        editBtn.textContent = "✎";
        editBtn.title = "Edit";
        editBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            openModal(site);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "del";
        delBtn.textContent = "✕";
        delBtn.title = "Delete";
        delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (confirm(`Delete "${site.name}"?`)) {
                state.sites = state.sites.filter(s => s.id !== site.id);
                saveState();
                render();
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        tile.appendChild(icon);
        tile.appendChild(label);
        tile.appendChild(actions);

        tile.addEventListener("click", function () {
            window.location.href = site.url;
        });

        tile.addEventListener("auxclick", function (e) {
            if (e.button === 1) {
                e.preventDefault();
                window.open(site.url, "_blank");
            }
        });

        tile.addEventListener("dragstart", function () {
            dragSourceId = site.id;
            tile.classList.add("dragging");
        });
        tile.addEventListener("dragend", function () {
            tile.classList.remove("dragging");
        });
        tile.addEventListener("dragover", function (e) {
            e.preventDefault();
        });
        tile.addEventListener("drop", function (e) {
            e.preventDefault();
            if (!dragSourceId || dragSourceId === site.id) return;

            const fromIndex = state.sites.findIndex(s => s.id === dragSourceId);
            const toIndex = state.sites.findIndex(s => s.id === site.id);
            if (fromIndex === -1 || toIndex === -1) return;

            const moved = state.sites.splice(fromIndex, 1)[0];
            state.sites.splice(toIndex, 0, moved);
            saveState();
            render();
        });

        return tile;
    }

    // Build the "Add site" tile
    function buildAddTile() {
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

        tile.addEventListener("click", function () {
            openModal(null);
        });

        return tile;
    }

    // Build an empty (invisible) tile to fill the grid
    function buildEmptyTile() {
        const tile = document.createElement("div");
        tile.className = "tile empty";
        tile.draggable = false;

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.cssText = `
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            opacity: 0 !important;
            transform: none !important;
            pointer-events: none;
        `;

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = "";
        label.style.opacity = "0";

        tile.appendChild(icon);
        tile.appendChild(label);

        tile.style.cssText = `
            cursor: default;
            pointer-events: none;
            opacity: 0;
        `;

        return tile;
    }

    // Render with a fade transition
    function renderWithTransition(force = false) {
        const grid = document.getElementById('grid');

        if (force) {
            render();
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
            render();
            requestAnimationFrame(() => {
                grid.style.opacity = '1';
                setTimeout(() => {
                    isTransitioning = false;
                }, 50);
            });
        }, 150);
    }

    // =============================================
    //  10.  MODAL (ADD / EDIT SITE)
    // =============================================
    const overlay = document.getElementById("overlay");
    const siteIconInput = document.getElementById("siteIcon");
    const iconPreview = document.getElementById("iconPreview");
    const iconPreviewImg = document.getElementById("iconPreviewImg");
    const removeIconBtn = document.getElementById("removeIconBtn");

    function openModal(site) {
        editingId = site ? site.id : null;
        document.getElementById("modalTitle").textContent = site ? "Edit site" : "Add site";
        document.getElementById("siteName").value = site ? site.name : "";
        document.getElementById("siteUrl").value = site ? site.url : "";

        tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";

        if (site && site.iconData) {
            tempIconData = site.iconData;
            iconPreviewImg.src = site.iconData;
            iconPreview.style.display = "flex";
        }

        overlay.classList.add("open");
        setTimeout(() => document.getElementById("siteName").focus(), 50);
    }

    function closeModal() {
        overlay.classList.remove("open");
        tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";
    }

    document.getElementById("modalCancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeModal();
    });

    // Handle icon upload
    siteIconInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("Please select an image file.");
            siteIconInput.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            tempIconData = ev.target.result;
            iconPreviewImg.src = tempIconData;
            iconPreview.style.display = "flex";
        };
        reader.onerror = function () {
            alert("Failed to read image.");
            siteIconInput.value = "";
        };
        reader.readAsDataURL(file);
    });

    // Remove uploaded icon
    removeIconBtn.addEventListener("click", function () {
        tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";
    });

    // Save site (add or edit)
    document.getElementById("modalSave").addEventListener("click", function () {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        if (editingId) {
            const existing = state.sites.find(s => s.id === editingId);
            if (existing) {
                existing.name = name;
                existing.url = url;
                if (tempIconData) {
                    existing.iconData = tempIconData;
                } else {
                    delete existing.iconData;
                }
            }
        } else {
            const newSite = { id: generateId(), name, url };
            if (tempIconData) {
                newSite.iconData = tempIconData;
            }
            state.sites.push(newSite);
        }

        saveState();
        closeModal();
        renderWithTransition();
    });

    // =============================================
    //  11. SETTINGS PANEL
    // =============================================
    const panel = document.getElementById("panel");

    document.getElementById("settingsToggle").addEventListener("click", function () {
        document.getElementById("displayName").value = state.settings.name;
        document.getElementById("rowsInput").value = state.settings.rows;
        document.getElementById("colsInput").value = state.settings.cols;
        panel.classList.toggle("open");
    });

    document.getElementById("panelClose").addEventListener("click", function () {
        panel.classList.remove("open");
    });

    function applySetting(field, value) {
        state.settings[field] = value;
        saveState();
        renderWithTransition();
    }

    document.getElementById("displayName").addEventListener("input", function (e) {
        applySetting("name", e.target.value);
    });

    document.getElementById("rowsInput").addEventListener("change", function (e) {
        let val = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 4));
        e.target.value = val;
        applySetting("rows", val);
    });

    document.getElementById("colsInput").addEventListener("change", function (e) {
        let val = Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 6));
        e.target.value = val;
        applySetting("cols", val);
    });

    // Background image upload
    document.getElementById("bgImageInput").addEventListener("change", async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please choose an image file.");
            e.target.value = "";
            return;
        }

        try {
            await saveBackgroundBlob(file);
            state.settings.bg = true;
            saveState();
            await applyBackground();
        } catch (err) {
            console.error("Failed to save background:", err);
            alert("Could not save background image.");
        }
        e.target.value = "";
    });

    // Remove background image
    document.getElementById("removeBgBtn").addEventListener("click", async function () {
        try {
            await deleteBackgroundBlob();
            state.settings.bg = false;
            saveState();
            await applyBackground();
            document.getElementById("bgImageInput").value = "";
        } catch (err) {
            console.error("Failed to remove background:", err);
            alert("Could not remove background.");
        }
    });

    // Search engine selector
    document.getElementById("engineSelect").addEventListener("change", function (e) {
        state.settings.engine = e.target.value;
        saveState();
    });

    // =============================================
    //  12. EXPORT / IMPORT / RESET
    // =============================================
    document.getElementById("exportBtn").addEventListener("click", async function () {
        const exportData = JSON.parse(JSON.stringify(state));
        if (state.settings.bg) {
            try {
                const blob = await loadBackgroundBlob();
                if (blob) {
                    const dataURL = await blobToDataURL(blob);
                    exportData.settings.bg = dataURL;
                } else {
                    exportData.settings.bg = false;
                }
            } catch (e) {
                console.warn("Could not read background for export", e);
                exportData.settings.bg = false;
            }
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    });

    document.getElementById("importBtn").addEventListener("click", function () {
        document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.sites || !parsed.settings) throw new Error("Invalid format");

                let bgDataURL = parsed.settings.bg;
                if (bgDataURL && typeof bgDataURL === "string" && bgDataURL.startsWith("data:image")) {
                    try {
                        const blob = dataURLToBlob(bgDataURL);
                        await saveBackgroundBlob(blob);
                        parsed.settings.bg = true;
                    } catch (err) {
                        console.warn("Failed to import background image", err);
                        parsed.settings.bg = false;
                    }
                } else {
                    parsed.settings.bg = !!parsed.settings.bg;
                }

                state = parsed;
                saveState();
                currentPage = 0;
                renderWithTransition();
                panel.classList.remove("open");
            } catch (_) {
                alert("This file doesn't look like a valid backup.");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", async function () {
        if (confirm("This removes all your sites and settings. Continue?")) {
            try {
                await deleteBackgroundBlob();
            } catch (_) { /* ignore */ }
            state = JSON.parse(JSON.stringify(defaultState));
            saveState();
            currentPage = 0;
            renderWithTransition();
            panel.classList.remove("open");
        }
    });

    // =============================================
    //  13. NAVIGATION CONTROLS (prev / next / dots)
    // =============================================
    document.getElementById("prevPage").addEventListener("click", function () {
        if (currentPage > 0) { currentPage--; renderWithTransition(); }
    });

    document.getElementById("nextPage").addEventListener("click", function () {
        if (currentPage < getTotalPages() - 1) { currentPage++; renderWithTransition(); }
    });

    // =============================================
    //  14. SEARCH FORM
    // =============================================
    document.getElementById("searchForm").addEventListener("submit", function (e) {
        e.preventDefault();
        const query = document.getElementById("searchInput").value.trim();
        if (!query) return;

        const looksLikeUrl = /^https?:\/\//i.test(query) ||
            (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(query) && !query.includes(" "));

        if (looksLikeUrl) {
            window.location.href = /^https?:\/\//i.test(query) ? query : `https://${query}`;
        } else {
            window.location.href = state.settings.engine + encodeURIComponent(query);
        }
    });

    // =============================================
    //  15. KEYBOARD SHORTCUTS
    // =============================================
    document.addEventListener("keydown", function (e) {
        if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
            e.preventDefault();
            document.getElementById("searchInput").focus();
        }
        if (e.key === "Escape") {
            closeModal();
            panel.classList.remove("open");
        }
    });

    // =============================================
    //  16. CLOCK AND GREETING
    // =============================================
    function updateClockAndGreeting() {
        const now = new Date();
        const hour = now.getHours();
        let greeting = hour < 5 ? "Good night" :
            hour < 12 ? "Good morning" :
            hour < 18 ? "Good afternoon" :
            "Good evening";
        document.querySelector(".greeting").firstChild.textContent = `${greeting}, `;
    }

    // =============================================
    //  17. CLICK OUTSIDE PANEL TO CLOSE
    // =============================================
    document.addEventListener('click', function (e) {
        const panelElem = document.getElementById('panel');
        const toggleBtn = document.getElementById('settingsToggle');

        if (panelElem.classList.contains('open')) {
            const target = e.target;
            if (!panelElem.contains(target) && target !== toggleBtn && !toggleBtn.contains(target)) {
                panelElem.classList.remove('open');
            }
        }
    });

    // =============================================
    //  18. SCROLL NAVIGATION (wheel on grid)
    // =============================================
    const gridWrap = document.querySelector('.grid-wrap');
    let scrollTimeout = false;

    gridWrap.addEventListener('wheel', function (e) {
        const total = getTotalPages();
        if (total <= 1) return;
        if (scrollTimeout) return;

        const delta = e.deltaY;
        if (delta > 20) {
            if (currentPage < total - 1) {
                currentPage++;
                renderWithTransition();
                scrollTimeout = true;
                setTimeout(() => { scrollTimeout = false; }, 250);
            }
        } else if (delta < -20) {
            if (currentPage > 0) {
                currentPage--;
                renderWithTransition();
                scrollTimeout = true;
                setTimeout(() => { scrollTimeout = false; }, 250);
            }
        }
    });

    // =============================================
    //  19. INITIALIZATION
    // =============================================
    updateClockAndGreeting();
    setInterval(updateClockAndGreeting, 15000);

    render();
    applyBackground();

})();