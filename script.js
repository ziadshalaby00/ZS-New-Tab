/**
 * ZS New Tab – Full Application
 * Uses localStorage for settings/state and IndexedDB for large assets (backgrounds/icons).
 */
(async function () {
    "use strict";

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const STORE_KEY = "ZSNewTab.v1";
    const DB_NAME = "NewTabDB";
    const STORE_NAME = "background";

    // =============================================
    //  2. DEFAULT STATE
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
    //  3. LOCAL STORAGE HELPERS
    // =============================================
    function loadState() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(defaultState));
            
            const parsed = JSON.parse(raw);
            // Ensure required properties exist to prevent crashes on old states
            if (!parsed.settings) parsed.settings = defaultState.settings;
            if (!parsed.sites) parsed.sites = [];
            if (typeof parsed.settings.bg !== "boolean") parsed.settings.bg = false;
            
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(defaultState));
        }
    }

    // =============================================
    //  4. GLOBAL VARIABLES
    // =============================================
    let state = loadState();
    let iconCache = new Map(); // siteId -> objectURL

    let currentPage = 0;
    let editingId = null;
    let dragSourceId = null;
    let isTransitioning = false;
    let tempIconData = null; // Temporary Data URL for uploaded icon in the modal

    function saveState() {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // =============================================
    //  5. INDEXEDDB HELPERS (backgrounds + icons)
    //  Note: We use IndexedDB because localStorage has a ~5MB limit, 
    //  which is easily exceeded by base64 images.
    // =============================================
    let db = null;
    let dbOpenPromise = null;
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2);

            request.onupgradeneeded = function (e) {
                const database = e.target.result;

                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
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

    async function initDB() {
        if (db) return db;
        if (dbOpenPromise) return dbOpenPromise;

        dbOpenPromise = openDB().then((opened) => {
            db = opened;
            db.onclose = () => {
                db = null;
            };
            db.onversionchange = () => {
                db.close();
                db = null;
            };
            return db;
        }).finally(() => {
            dbOpenPromise = null;
        });

        return dbOpenPromise;
    }

    window.addEventListener("beforeunload", () => {
        if (db) db.close();
    });

    async function clearStoredAssets() {
        const database = await initDB();

        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);

            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function saveImageBlob(key, blob) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(blob, key);
            
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => {
                resolve();
            };
            tx.onerror = () => {
                reject(tx.error);
            };
        });
    }

    async function loadImageBlob(key) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.onerror = () => {
                reject(tx.error);
            };
        });
    }

    async function deleteImageBlob(key) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => {
                resolve();
            };
            tx.onerror = () => {
                reject(tx.error);
            };
        });
    }

    // --- Background helpers ---
    async function saveBackgroundBlob(blob) {
        return saveImageBlob("bg", blob);
    }

    async function loadBackgroundBlob() {
        return loadImageBlob("bg");
    }

    async function deleteBackgroundBlob() {
        return deleteImageBlob("bg");
    }

    // --- Site icon helpers ---
    function getIconKey(siteId) {
        return `icon_${siteId}`;
    }

    async function saveSiteIcon(siteId, blob) {
        return saveImageBlob(getIconKey(siteId), blob);
    }

    async function loadSiteIcon(siteId) {
        return loadImageBlob(getIconKey(siteId));
    }

    async function deleteSiteIcon(siteId) {
        return deleteImageBlob(getIconKey(siteId));
    }

    // Lazily loads icons only for the sites passed in (i.e. the sites on the
    // currently visible page), instead of pulling every custom icon out of
    // IndexedDB up front. Already-cached icons are skipped.
    async function loadIconsForSites(sites) {
        const toLoad = sites.filter(s => s.iconData === true && !iconCache.has(s.id));
        if (toLoad.length === 0) return;

        await Promise.all(toLoad.map(async (site) => {
            try {
                const blob = await loadSiteIcon(site.id);
                // Site may have been deleted or re-edited while this was in flight.
                const stillExists = state.sites.some(s => s.id === site.id);
                if (blob && stillExists && !iconCache.has(site.id)) {
                    setIconCache(site.id, blob);
                    const img = document.querySelector(`.tile[data-id="${site.id}"] img`);
                    if (img) img.src = iconCache.get(site.id);
                }
            } catch (e) {
                console.warn(`Failed to load icon for site ${site.id}`, e);
            }
        }));
    }

    function setIconCache(siteId, blob) {
        const old = iconCache.get(siteId);
        if (old) URL.revokeObjectURL(old);
        iconCache.set(siteId, URL.createObjectURL(blob));
    }

    function clearIconCache(siteId) {
        const old = iconCache.get(siteId);
        if (old) {
            URL.revokeObjectURL(old);
            iconCache.delete(siteId);
        }
    }

    // --- Conversion helpers for Export/Import ---
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
    //  6. BACKGROUND IMAGE MANAGEMENT
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
                    
                    // Revoke previous object URL to prevent memory leaks
                    if (window._bgUrl) URL.revokeObjectURL(window._bgUrl);
                    window._bgUrl = url;
                } else {
                    // Fallback if blob is missing but flag is true
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
    //  7. UTILITY FUNCTIONS
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
        const palette = [
            "#e8a33d", "#5fd3c4", "#6f9be0", "#c77dd1", 
            "#e2685f", "#7fbf7f", "#d4a24d", "#8a8fe0"
        ];
        let sum = 0;
        for (let i = 0; i < name.length; i++) {
            sum += name.charCodeAt(i);
        }
        return palette[sum % palette.length];
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
            
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) cleanup(false);
            });

            function onKey(e) {
                if (e.key === "Escape") {
                    document.removeEventListener("keydown", onKey);
                    cleanup(false);
                }
            }
            document.addEventListener("keydown", onKey);
        });
    }

    // =============================================
    //  8. PAGINATION HELPERS
    // =============================================
    function getPageSize() {
        return state.settings.rows * state.settings.cols;
    }

    function getTotalPages() {
        // We add 1 to sites.length to account for the "Add site" tile
        return Math.max(1, Math.ceil((state.sites.length + 1) / getPageSize()));
    }

    // =============================================
    //  9. RENDERING FUNCTIONS
    // =============================================
    function renderName() {
        const name = state.settings.name || "there";
        document.getElementById("greetName").textContent = name;
    }

    // Main render function
    function render() {
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        document.documentElement.style.setProperty("--rows", state.settings.rows);
        
        renderName();
        document.getElementById("engineSelect").value = state.settings.engine;

        const total = getTotalPages();
        if (currentPage >= total) currentPage = total - 1;
        if (currentPage < 0) currentPage = 0;

        const pageSize = getPageSize();
        const start = currentPage * pageSize;
        const pageSites = state.sites.slice(start, start + pageSize);

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        // Render site tiles
        pageSites.forEach(site => {
            grid.appendChild(buildTile(site));
        });

        // Only fetch icon blobs for sites actually visible on this page
        loadIconsForSites(pageSites);

        // Render "Add site" tile if there's space
        if (pageSites.length < getPageSize()) {
            grid.appendChild(buildAddTile());
        }

        // Fill remaining empty space with invisible tiles to maintain grid layout
        const totalCells = pageSize;
        const filled = pageSites.length + 1; // +1 for the "Add site" tile
        for (let i = filled; i < totalCells; i++) {
            grid.appendChild(buildEmptyTile());
        }

        // Render pagination dots
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

        // Update prev/next buttons state
        document.getElementById("prevPage").classList.toggle("active", currentPage > 0);
        document.getElementById("nextPage").classList.toggle("active", currentPage < total - 1);
    }

    // Build a tile for a specific site
    function buildTile(site) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.draggable = true;
        tile.dataset.id = site.id;

        // Icon container
        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.background = getColorForName(site.name);

        const img = document.createElement("img");
        
        // Check if site has a custom icon stored in IndexedDB
        if (site.iconData === true && iconCache.has(site.id)) {
            img.src = iconCache.get(site.id);
        } else {
            img.src = getFaviconUrl(site.url);
        }
        
        img.alt = "";
        img.onerror = function () {
            // Fallback to first letter if favicon fails
            icon.innerHTML = "";
            const span = document.createElement("span");
            span.className = "letter";
            span.textContent = getFirstLetter(site.name);
            icon.appendChild(span);
        };
        icon.appendChild(img);

        // Label
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = site.name;

        // Action buttons (Edit / Delete)
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
        delBtn.addEventListener("click", async function (e) {
            e.stopPropagation();
            if (await showConfirm(`Delete "${site.name}"?`, "Delete Site")) {
                try {
                    await deleteSiteIcon(site.id);
                    clearIconCache(site.id);
                } catch (err) {
                    console.warn(`Failed to delete icon for site ${site.id}`, err);
                }
                state.sites = state.sites.filter(s => s.id !== site.id);
                saveState();
                renderWithTransition();
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        // Assemble tile
        tile.appendChild(icon);
        tile.appendChild(label);
        tile.appendChild(actions);

        // Event Listeners
        tile.addEventListener("click", function () {
            window.location.href = site.url;
        });

        tile.addEventListener("auxclick", function (e) {
            // Open in new tab on middle mouse click
            if (e.button === 1) {
                e.preventDefault();
                window.open(site.url, "_blank");
            }
        });

        // Drag and Drop logic
        tile.addEventListener("dragstart", function (e) {
            dragSourceId = site.id;
            tile.classList.add("dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", site.id);
            }
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

    // Build an empty (invisible) tile to fill the grid and maintain layout
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

    // Render with a fade transition to make UI changes smoother
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
    //  10. MODAL (ADD / EDIT SITE)
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
        
        if (site && site.iconData === true) {
            tempIconData = true;
            iconPreview.style.display = "flex";
            
            if (iconCache.has(site.id)) {
                iconPreviewImg.src = iconCache.get(site.id);
            } else {
                loadSiteIcon(site.id).then(blob => {
                    if (blob) {
                        setIconCache(site.id, blob);
                        iconPreviewImg.src = iconCache.get(site.id);
                    }
                }).catch(() => { iconPreview.style.display = "none"; });
            }
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

    async function saveSite() {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        
        if (!name || !url) return;
        
        // Ensure URL has a protocol
        if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
        }
        
        try {
            if (editingId) {
                // Update existing site
                const existing = state.sites.find(s => s.id === editingId);
                if (existing) {
                    existing.name = name;
                    existing.url = url;

                    if (typeof tempIconData === "string" && tempIconData.startsWith("data:")) {
                        const blob = dataURLToBlob(tempIconData);
                        await saveSiteIcon(existing.id, blob);
                        existing.iconData = true;
                        setIconCache(existing.id, blob); 
                    } else if (tempIconData === null) {
                        if (existing.iconData) await deleteSiteIcon(existing.id);
                        delete existing.iconData;
                        clearIconCache(existing.id);   
                    }
                }
            } else {
                // Create new site
                const newSite = {
                    id: generateId(),
                    name,
                    url
                };
                state.sites.push(newSite);
                
                if (tempIconData) {
                    const blob = dataURLToBlob(tempIconData);
                    await saveSiteIcon(newSite.id, blob);
                    newSite.iconData = true;
                    setIconCache(newSite.id, blob);  
                }
            }
            
            saveState();
            closeModal();
            renderWithTransition();
        } catch (err) {
            console.error("Failed to save site:", err);
            alert("Could not save site icon.");
        }
    }

    // Save button
    document.getElementById("modalSave").addEventListener("click", saveSite);

    // Enter key triggers save
    document.getElementById("siteName").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            saveSite();
        }
    });

    document.getElementById("siteUrl").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            saveSite();
        }
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

    function applySetting(field, value, isName = false) {
        state.settings[field] = value;
        saveState();
        
        if (isName) {
            renderName();
            return;
        }
        renderWithTransition();
    }

    document.getElementById("displayName").addEventListener("input", function (e) {
        applySetting("name", e.target.value, true);
    });

    document.getElementById("rowsInput").addEventListener("change", function (e) {
        let val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 4));
        e.target.value = val;
        applySetting("rows", val);
    });

    document.getElementById("colsInput").addEventListener("change", function (e) {
        let val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6));
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
    
    // Export backup (converts IndexedDB blobs to DataURLs for JSON serialization)
    document.getElementById("exportBtn").addEventListener("click", async function () {
        try {
            const exportData = JSON.parse(JSON.stringify(state));

            // 1. Export background
            if (state.settings.bg) {
                try {
                    const blob = await loadBackgroundBlob();
                    if (blob) {
                        exportData.settings.bg = await blobToDataURL(blob);
                    } else {
                        exportData.settings.bg = false;
                    }
                } catch (e) {
                    console.warn("Could not read background for export", e);
                    exportData.settings.bg = false;
                }
            }

            // 2. Export site icons
            for (const site of exportData.sites) {
                if (site.iconData !== true) continue;
                
                try {
                    const blob = await loadSiteIcon(site.id);
                    if (blob) {
                        site.iconData = await blobToDataURL(blob);
                    } else {
                        delete site.iconData;
                    }
                } catch (e) {
                    console.warn(`Could not read icon for site ${site.id}`, e);
                    delete site.iconData;
                }
            }

            // 3. Create and download backup file
            const blob = new Blob(
                [JSON.stringify(exportData, null, 2)],
                { type: "application/json" }
            );
            const a = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            a.href = url;
            a.download = `zs-new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to export backup:", err);
            alert("Could not create backup.");
        }
    });

    // Import backup
    document.getElementById("importBtn").addEventListener("click", function () {
        document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.sites || !parsed.settings) {
                    throw new Error("Invalid format");
                }

                // Now that the backup is valid, clear old assets
                await clearStoredAssets();

                // 1. Import background
                const bgDataURL = parsed.settings.bg;
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

                // 2. Import site icons
                for (const site of parsed.sites) {
                    // Backward compatibility: Older backups stored iconData as a DataURL string.
                    // Newer backups store it as a boolean `true` and fetch from IndexedDB.
                    if (typeof site.iconData === "string" && site.iconData.startsWith("data:image")) {
                        try {
                            const blob = dataURLToBlob(site.iconData);
                            await saveSiteIcon(site.id, blob);
                            // Replace Data URL string with boolean flag
                            site.iconData = true;
                        } catch (err) {
                            console.warn(`Failed to import icon for site ${site.id}`, err);
                            delete site.iconData;
                        }
                    }
                }

                // 3. Apply imported state
                state = parsed;
                saveState();
                currentPage = 0;

                for (const url of iconCache.values()) URL.revokeObjectURL(url);
                iconCache.clear();

                renderWithTransition();
                await applyBackground();
                panel.classList.remove("open");
            } catch (err) {
                console.error("Import failed:", err);
                alert("This file doesn't look like a valid backup.");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    });

    // Reset everything to default
    document.getElementById("resetBtn").addEventListener("click", async function () {
        if (await showConfirm("This removes all your sites and settings. Continue?", "Reset Everything")) {
            try {
                await deleteBackgroundBlob();
                for (const site of state.sites) {
                    if (site.iconData === true) {
                        await deleteSiteIcon(site.id);
                    }
                }
            } catch (_) {
                // Ignore cleanup errors
            }

            for (const url of iconCache.values()) URL.revokeObjectURL(url);
            iconCache.clear();
            
            state = JSON.parse(JSON.stringify(defaultState));
            saveState();
            currentPage = 0;
            renderWithTransition();
            applyBackground();
            panel.classList.remove("open");
        }
    });

    // =============================================
    //  13. NAVIGATION CONTROLS (prev / next / dots)
    // =============================================
    document.getElementById("prevPage").addEventListener("click", function () {
        if (currentPage > 0) {
            currentPage--;
            renderWithTransition();
        }
    });

    document.getElementById("nextPage").addEventListener("click", function () {
        if (currentPage < getTotalPages() - 1) {
            currentPage++;
            renderWithTransition();
        }
    });

    // =============================================
    //  14. SEARCH FORM
    // =============================================
    document.getElementById("searchForm").addEventListener("submit", function (e) {
        e.preventDefault();
        const query = document.getElementById("searchInput").value.trim();
        if (!query) return;

        // Check if the query looks like a URL
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
        // Focus search input on '/'
        if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
            e.preventDefault();
            document.getElementById("searchInput").focus();
        }
        // Close modals/panels on 'Escape'
        if (e.key === "Escape") {
            closeModal();
            panel.classList.remove("open");
        }
    });

    // =============================================
    //  16. GREETING
    // =============================================
    const greetingTextNode = document.querySelector(".greeting").firstChild;
    function updateGreeting() {
        const now = new Date();
        const hour = now.getHours();
        
        let greeting = hour < 5 ? "Good night" :
            hour < 12 ? "Good morning" :
            hour < 18 ? "Good afternoon" :
            "Good evening";
            
        greetingTextNode.textContent = `${greeting}, `;
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
    let scrollTimeout = false; // Debounce flag to prevent rapid page switching

    gridWrap.addEventListener('wheel', function (e) {
        e.preventDefault();
        
        const total = getTotalPages();
        if (total <= 1) return;
        if (scrollTimeout) return;
        
        const delta = e.deltaY;
        
        if (delta > 20) {
            // Scroll down -> Next page
            if (currentPage < total - 1) {
                currentPage++;
                renderWithTransition();
                scrollTimeout = true;
                setTimeout(() => { scrollTimeout = false; }, 250);
            }
        } else if (delta < -20) {
            // Scroll up -> Previous page
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
    await initDB();

    updateGreeting();
    setInterval(updateGreeting, 15000); // Update greeting every 15 seconds
    
    render();
    applyBackground();

})();

// =============================================
// GLOBAL UTILITY: Get LocalStorage Size (Call from Console)
// =============================================
function getLocalStorageSize() {
    let total = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            // Multiply by 2 because JS strings are UTF-16
            total += (localStorage[key].length + key.length) * 2;
        }
    }
    console.log(`Total localStorage size: ${(total / 1024).toFixed(2)} KB`);
}
