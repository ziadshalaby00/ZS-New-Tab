/**
 * ZS New Tab – Full Application
 * Uses localStorage for settings/state and IndexedDB for large assets (backgrounds/icons).
 */
(async function () {
    "use strict";
    const { ZSShared } = window;
    if (!ZSShared) return console.error("ZSShared is missing. Please load script.shared.js first.");

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const STORE_KEY = "ZSNewTab.v1";
    const DB_NAME = "NewTabDB";
    const STORE_NAME = "background";

    // =============================================
    //  2. LOCAL STORAGE HELPERS
    // =============================================

    /**
     * Loads the application state from localStorage, falling back to the default state if empty or invalid.
     */
    function loadState() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(ZSShared.defaultState));
            
            const parsed = JSON.parse(raw);
            if (!parsed.settings) parsed.settings = ZSShared.defaultState.settings;
            if (!parsed.sites) parsed.sites = [];
            if (typeof parsed.settings.bg !== "boolean") parsed.settings.bg = false;
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(ZSShared.defaultState));
        }
    }

    // =============================================
    //  3. GLOBAL VARIABLES
    // =============================================
    let state = loadState();
    let iconCache = new Map();

    let currentPage = 0;
    let editingId = null;
    let dragSourceId = null;
    let tempIconData = null;

    /**
     * Saves the current application state to localStorage.
     */
    function saveState() {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }

    // =============================================
    //  4. INDEXEDDB HELPERS (backgrounds + icons)
    // =============================================
    let db = null;
    let dbOpenPromise = null;
    
    /**
     * Opens and initializes the IndexedDB database, creating the object store if it doesn't exist.
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Ensures the database is opened and cached, preventing multiple simultaneous open requests.
     */
    async function initDB() {
        if (db) return db;
        if (dbOpenPromise) return dbOpenPromise;
        dbOpenPromise = openDB().then((opened) => {
            db = opened;
            db.onclose = () => { db = null; };
            db.onversionchange = () => { db.close(); db = null; };
            return db;
        }).finally(() => { dbOpenPromise = null; });
        return dbOpenPromise;
    }

    window.addEventListener("beforeunload", () => { if (db) db.close(); });

    /**
     * Executes a generic read/write transaction on the IndexedDB object store.
     */
    async function executeDBRequest(type, action, key, data = null) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, type);
            const store = tx.objectStore(STORE_NAME);
            const request = action === "put" ? store.put(data, key) : action === "get" ? store.get(key) : action === "delete" ? store.delete(key) : store.clear();
            
            if (action === "get") request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            if (action !== "get") tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Clears all assets from the IndexedDB object store.
     */
    async function clearStoredAssets() { 
        return executeDBRequest("readwrite", "clear"); 
    }

    /**
     * Saves a Blob to the IndexedDB store under a specific key.
     */
    async function saveImageBlob(key, blob) { 
        return executeDBRequest("readwrite", "put", key, blob); 
    }

    /**
     * Retrieves a Blob from the IndexedDB store by its key.
     */
    async function loadImageBlob(key) { 
        return executeDBRequest("readonly", "get", key); 
    }

    /**
     * Deletes a Blob from the IndexedDB store by its key.
     */
    async function deleteImageBlob(key) { 
        return executeDBRequest("readwrite", "delete", key); 
    }

    /**
     * Saves the background image Blob to IndexedDB.
     */
    async function saveBackgroundBlob(blob) { 
        return saveImageBlob("bg", blob); 
    }

    /**
     * Loads the background image Blob from IndexedDB.
     */
    async function loadBackgroundBlob() { 
        return loadImageBlob("bg"); 
    }

    /**
     * Deletes the background image Blob from IndexedDB.
     */
    async function deleteBackgroundBlob() { 
        return deleteImageBlob("bg"); 
    }

    /**
     * Generates the IndexedDB key for a specific site's icon.
     */
    function getIconKey(siteId) { 
        return `icon_${siteId}`; 
    }

    /**
     * Saves a site's icon Blob to IndexedDB.
     */
    async function saveSiteIcon(siteId, blob) { 
        return saveImageBlob(getIconKey(siteId), blob); 
    }

    /**
     * Loads a site's icon Blob from IndexedDB.
     */
    async function loadSiteIcon(siteId) { 
        return loadImageBlob(getIconKey(siteId)); 
    }

    /**
     * Deletes a site's icon Blob from IndexedDB.
     */
    async function deleteSiteIcon(siteId) { 
        return deleteImageBlob(getIconKey(siteId)); 
    }

    /**
     * Clears both localStorage and all IndexedDB assets.
     */
    async function clearAllStorageData() {
        localStorage.clear();
        await clearStoredAssets();
    }

    /**
     * Asynchronously loads and caches icons for sites that are marked to have custom icons.
     */
    async function loadIconsForSites(sites) {
        const toLoad = sites.filter(s => s.iconData === true && !iconCache.has(s.id));
        if (toLoad.length === 0) return;

        await Promise.all(toLoad.map(async (site) => {
            try {
                const blob = await loadSiteIcon(site.id);
                if (blob && state.sites.some(s => s.id === site.id) && !iconCache.has(site.id)) {
                    setIconCache(site.id, blob);
                    const img = document.querySelector(`.tile[data-id="${site.id}"] img`);
                    if (img) img.src = iconCache.get(site.id);
                }
            } catch (e) { 
                console.warn(`Failed to load icon for site ${site.id}`, e); 
            }
        }));
    }

    /**
     * Stores a Blob in the icon cache as an Object URL, revoking the old URL if it exists to prevent memory leaks.
     */
    function setIconCache(siteId, blob) {
        const old = iconCache.get(siteId);
        if (old) URL.revokeObjectURL(old);
        iconCache.set(siteId, URL.createObjectURL(blob));
    }

    /**
     * Removes a site's icon from the cache and revokes its Object URL.
     */
    function clearIconCache(siteId) {
        const old = iconCache.get(siteId);
        if (old) {
            URL.revokeObjectURL(old);
            iconCache.delete(siteId);
        }
    }

    // =============================================
    //  5. BACKGROUND IMAGE MANAGEMENT
    // =============================================

    /**
     * Applies the saved background image to the document body using an Object URL, or removes it if disabled/missing.
     */
    async function applyBackground() {
        const body = document.body;
        if (state.settings.bg === true) {
            try {
                const blob = await loadBackgroundBlob();
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    await new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = url;
                    });
                    body.style.setProperty('--bg-image', `url("${url}")`);
                    body.classList.add('has-bg-image');
                    if (window._bgUrl) URL.revokeObjectURL(window._bgUrl);
                    window._bgUrl = url;
                    return;
                }
                state.settings.bg = false;
                saveState();
            } catch (e) { 
                console.warn("Failed to load background", e); 
            }
        }
        body.classList.remove('has-bg-image');
        body.style.removeProperty('--bg-image');
        if (window._bgUrl) { 
            URL.revokeObjectURL(window._bgUrl); 
            window._bgUrl = null; 
        }
    }

    // =============================================
    //  6. RENDERING FUNCTIONS
    // =============================================
    const renderWithTransition = ZSShared.createRenderer('grid', render);

    /**
     * Updates the greeting element with the user's saved name or a default placeholder.
     */
    function renderName() { 
        document.getElementById("greetName").textContent = state.settings.name || "there"; 
    }

    /**
     * Main asynchronous render function that updates the grid, pagination, and loads necessary icons for the current page.
     */
    async function render() {
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        document.documentElement.style.setProperty("--rows", state.settings.rows);
        renderName();
        document.getElementById("engineSelect").value = state.settings.engine;

        const total = ZSShared.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols);
        if (currentPage >= total) currentPage = total - 1;
        if (currentPage < 0) currentPage = 0;

        const pageSize = ZSShared.getPageSize(state.settings.rows, state.settings.cols);
        const start = currentPage * pageSize;
        const pageSites = state.sites.slice(start, start + pageSize);

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        pageSites.forEach(site => grid.appendChild(buildTile(site)));
        await loadIconsForSites(pageSites);

        if (pageSites.length < pageSize) grid.appendChild(ZSShared.buildAddTile(() => openModal(null)));
        
        for (let i = pageSites.length + 1; i < pageSize; i++) grid.appendChild(ZSShared.buildEmptyTile());

        ZSShared.updatePaginationUI(total, currentPage, (idx) => { 
            currentPage = idx; 
            renderWithTransition(); 
        });
    }

    let currentDropTarget = null;
    let currentDropSide = null;

    /**
     * Removes visual drag-and-drop indicators from the grid tiles.
     */
    function clearDropIndicator() {
        if (currentDropTarget) {
            currentDropTarget.classList.remove("drop-before", "drop-after");
            currentDropTarget.style.removeProperty("--drop-line-top");
            currentDropTarget.style.removeProperty("--drop-line-h");
        }
        currentDropTarget = null;
        currentDropSide = null;
    }

    /**
     * Creates and configures a DOM element for a single site tile, including drag-and-drop, click, and action handlers, using cached icons if available.
     */
    function buildTile(site) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.draggable = true;
        tile.dataset.id = site.id;

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.background = "transparent";

        const img = document.createElement("img");
        if (site.iconData === true && iconCache.has(site.id)) {
            img.src = iconCache.get(site.id);
        } else {
            img.src = ZSShared.getFaviconUrl(site.url);
        }
        
        img.alt = "";
        img.onerror = () => {
            icon.innerHTML = "";
            icon.style.background = ZSShared.getColorForName(site.name);

            const span = document.createElement("span");
            span.className = "letter";
            span.textContent = ZSShared.getFirstLetter(site.name);
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
        editBtn.addEventListener("click", e => { 
            e.stopPropagation(); 
            openModal(site); 
        });

        const delBtn = document.createElement("button");
        delBtn.className = "del";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", async e => {
            e.stopPropagation();
            if (await ZSShared.showConfirm(`Delete "${site.name}"?`, "Delete Site")) {
                try { 
                    await deleteSiteIcon(site.id); 
                    clearIconCache(site.id); 
                } catch (err) {}
                state.sites = state.sites.filter(s => s.id !== site.id);
                saveState();
                renderWithTransition();
            }
        });

        actions.appendChild(editBtn); 
        actions.appendChild(delBtn);
        tile.appendChild(icon); 
        tile.appendChild(label); 
        tile.appendChild(actions);

        tile.addEventListener("click", () => {
            window.location.href = site.url;
        });

        tile.addEventListener("mousedown", e => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });

        tile.addEventListener("auxclick", e => {
            if (e.button === 1) {
                e.preventDefault();
                window.open(site.url, "_blank");
            }
        });

        // Drag events
        tile.addEventListener("dragstart", e => {
            dragSourceId = site.id; 
            tile.classList.add("dragging");
            if (e.dataTransfer) { 
                e.dataTransfer.effectAllowed = "move"; 
                e.dataTransfer.setData("text/plain", site.id); 
            }
        });
        tile.addEventListener("dragend", () => {
            tile.classList.remove("dragging");
            clearDropIndicator();
        });

        tile.addEventListener("dragover", e => {
            e.preventDefault();
            if (!dragSourceId || dragSourceId === site.id) return;

            const rect = tile.getBoundingClientRect();
            const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
            const side = isLeftHalf ? "before" : "after";

            if (currentDropTarget !== tile || currentDropSide !== side) {
                clearDropIndicator();
                currentDropTarget = tile;
                currentDropSide = side;

                const iconEl = tile.querySelector(".icon");
                tile.style.setProperty("--drop-line-top", iconEl.offsetTop + "px");
                tile.style.setProperty("--drop-line-h", iconEl.offsetHeight + "px");
                tile.classList.add(side === "before" ? "drop-before" : "drop-after");
            }
        });

        tile.addEventListener("dragleave", e => {
            if (currentDropTarget === tile && !tile.contains(e.relatedTarget)) {
                clearDropIndicator();
            }
        });

        tile.addEventListener("drop", e => {
            e.preventDefault();
            const side = currentDropSide;
            clearDropIndicator();

            if (!dragSourceId || dragSourceId === site.id) return;

            const fromIndex = state.sites.findIndex(s => s.id === dragSourceId);
            if (fromIndex === -1) return;

            const moved = state.sites.splice(fromIndex, 1)[0];
            const toIndex = state.sites.findIndex(s => s.id === site.id);
            if (toIndex === -1) { 
                state.sites.splice(fromIndex, 0, moved); 
                return; 
            }

            const insertIndex = side === "after" ? toIndex + 1 : toIndex;
            state.sites.splice(insertIndex, 0, moved);

            saveState(); 
            render();
        });
        return tile;
    }

    // =============================================
    //  7. MODAL (ADD / EDIT SITE)
    // =============================================
    const overlay = document.getElementById("overlay");
    const siteIconInput = document.getElementById("siteIcon");
    const iconPreview = document.getElementById("iconPreview");
    const iconPreviewImg = document.getElementById("iconPreviewImg");
    const removeIconBtn = document.getElementById("removeIconBtn");

    /**
     * Opens and populates the add/edit site modal, loading the icon preview from the cache or IndexedDB if applicable.
     */
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
                }).catch(() => { 
                    iconPreview.style.display = "none"; 
                });
            }
        }
        overlay.classList.add("open");
        setTimeout(() => document.getElementById("siteName").focus(), 50);
    }

    /**
     * Closes the modal and resets temporary icon data and input fields.
     */
    function closeModal() {
        overlay.classList.remove("open");
        tempIconData = null; 
        siteIconInput.value = ""; 
        iconPreview.style.display = "none";
    }

    document.getElementById("modalCancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { 
        if (e.target === overlay) closeModal(); 
    });

    siteIconInput.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return alert("Please select an image file.");
        try {
            const resizedBlob = await ZSShared.resizeImage(file, 128, 128, 0.85);
            tempIconData = await ZSShared.blobToDataURL(resizedBlob);
            iconPreviewImg.src = tempIconData; 
            iconPreview.style.display = "flex";
        } catch (err) { 
            alert("Failed to read image."); 
        }
    });

    removeIconBtn.addEventListener("click", () => { 
        tempIconData = null; 
        siteIconInput.value = ""; 
        iconPreview.style.display = "none"; 
    });

    /**
     * Validates and saves a new or edited site to the state and IndexedDB, handling icon Blob conversions and cache updates.
     */
    async function saveSite() {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        
        try {
            if (editingId) {
                const existing = state.sites.find(s => s.id === editingId);
                if (existing) {
                    existing.name = name; 
                    existing.url = url;
                    if (typeof tempIconData === "string" && tempIconData.startsWith("data:")) {
                        const blob = ZSShared.dataURLToBlob(tempIconData);
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
                const newSite = { id: ZSShared.generateId(), name, url };
                state.sites.push(newSite);
                if (tempIconData) {
                    const blob = ZSShared.dataURLToBlob(tempIconData);
                    await saveSiteIcon(newSite.id, blob);
                    newSite.iconData = true; 
                    setIconCache(newSite.id, blob);
                }
            }
            saveState(); 
            closeModal(); 
            renderWithTransition();
        } catch (err) { 
            alert("Could not save site icon."); 
        }
    }

    document.getElementById("modalSave").addEventListener("click", saveSite);
    ["siteName", "siteUrl"].forEach(id => {
        document.getElementById(id).addEventListener("keydown", e => { 
            if (e.key === "Enter") { 
                e.preventDefault(); 
                saveSite(); 
            } 
        });
    });

    // =============================================
    //  8. SETTINGS PANEL & ACTIONS
    // =============================================
    const panel = document.getElementById("panel");
    document.getElementById("settingsToggle").addEventListener("click", () => {
        document.getElementById("displayName").value = state.settings.name;
        document.getElementById("rowsInput").value = state.settings.rows;
        document.getElementById("colsInput").value = state.settings.cols;
        panel.classList.toggle("open");
    });
    document.getElementById("panelClose").addEventListener("click", () => panel.classList.remove("open"));

    /**
     * Updates a specific setting in the state, saves it, and triggers a UI update.
     */
    function applySetting(field, value, isName = false) {
        state.settings[field] = value; 
        saveState();
        if (isName) renderName(); 
        else renderWithTransition();
    }
    
    document.getElementById("displayName").addEventListener("input", e => applySetting("name", e.target.value, true));
    document.getElementById("rowsInput").addEventListener("change", e => { 
        e.target.value = Math.max(1, Math.min(20, parseInt(e.target.value) || 4)); 
        applySetting("rows", e.target.value); 
    });
    document.getElementById("colsInput").addEventListener("change", e => { 
        e.target.value = Math.max(1, Math.min(20, parseInt(e.target.value) || 6)); 
        applySetting("cols", e.target.value); 
    });
    document.getElementById("engineSelect").addEventListener("change", e => { 
        state.settings.engine = e.target.value; 
        saveState(); 
    });

    document.getElementById("bgImageInput").addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        try {
            const resizedBlob = await ZSShared.resizeImage(file, 1920, 1080, 0.82);
            await saveBackgroundBlob(resizedBlob);
            state.settings.bg = true; 
            saveState(); 
            await applyBackground();
        } catch (err) { 
            alert("Could not save background image."); 
        }
        e.target.value = "";
    });

    document.getElementById("removeBgBtn").addEventListener("click", async () => {
        try {
            await deleteBackgroundBlob(); 
            state.settings.bg = false; 
            saveState();
            await applyBackground(); 
            document.getElementById("bgImageInput").value = "";
        } catch (err) {}
    });

    document.getElementById("exportBtn").addEventListener("click", async () => {
        try {
            const exportData = JSON.parse(JSON.stringify(state));
            if (state.settings.bg) {
                try { 
                    const blob = await loadBackgroundBlob(); 
                    exportData.settings.bg = blob ? await ZSShared.blobToDataURL(blob) : false; 
                } catch (e) { 
                    exportData.settings.bg = false; 
                }
            }
            for (const site of exportData.sites) {
                if (site.iconData !== true) continue;
                try { 
                    const blob = await loadSiteIcon(site.id); 
                    if (blob) site.iconData = await ZSShared.blobToDataURL(blob); 
                    else delete site.iconData; 
                } catch (e) { 
                    delete site.iconData; 
                }
            }
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); 
            const url = URL.createObjectURL(blob);
            a.href = url; 
            a.download = `zs-new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`; 
            a.click(); 
            URL.revokeObjectURL(url);
        } catch (err) { 
            alert("Could not create backup."); 
        }
    });

    document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
    
    // Handles the file reading and parsing logic when a backup file is selected for import
    document.getElementById("importFile").addEventListener("change", e => {
        const file = e.target.files[0]; 
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.sites || !parsed.settings) throw new Error("Invalid format");
                if (!(await ZSShared.showConfirm("Current data will be lost when you import this file."))) return;
                
                await clearAllStorageData();
                if (typeof parsed.settings.bg === "string" && parsed.settings.bg.startsWith("data:image")) {
                    try { 
                        await saveBackgroundBlob(ZSShared.dataURLToBlob(parsed.settings.bg)); 
                        parsed.settings.bg = true; 
                    } catch (err) { 
                        parsed.settings.bg = false; 
                    }
                } else {
                    parsed.settings.bg = !!parsed.settings.bg;
                }

                for (const site of parsed.sites) {
                    if (typeof site.iconData === "string" && site.iconData.startsWith("data:image")) {
                        try { 
                            await saveSiteIcon(site.id, ZSShared.dataURLToBlob(site.iconData)); 
                            site.iconData = true; 
                        } catch (err) { 
                            delete site.iconData; 
                        }
                    }
                }
                state = parsed; 
                saveState(); 
                currentPage = 0;
                for (const url of iconCache.values()) URL.revokeObjectURL(url);
                iconCache.clear();
                renderWithTransition(); 
                await applyBackground(); 
                panel.classList.remove("open");
            } catch (err) { 
                alert("This file doesn't look like a valid backup."); 
            }
        };
        reader.readAsText(file); 
        e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        if (await ZSShared.showConfirm("This removes all your sites and settings. Continue?", "Reset Everything")) {
            try { 
                await clearAllStorageData(); 
            } catch (err) {}
            for (const url of iconCache.values()) URL.revokeObjectURL(url);
            iconCache.clear();
            state = JSON.parse(JSON.stringify(ZSShared.defaultState)); 
            saveState();
            currentPage = 0; 
            renderWithTransition(); 
            applyBackground(); 
            panel.classList.remove("open");
        }
    });

    // =============================================
    //  9. NAVIGATION & INITIALIZATION
    // =============================================
    document.getElementById("prevPage").addEventListener("click", () => { 
        if (currentPage > 0) { 
            currentPage--; 
            renderWithTransition(); 
        } 
    });
    document.getElementById("nextPage").addEventListener("click", () => { 
        if (currentPage < ZSShared.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols) - 1) { 
            currentPage++; 
            renderWithTransition(); 
        } 
    });

    ZSShared.setupSearchForm("searchForm", "searchInput", () => state.settings.engine);
    ZSShared.setupKeyboardShortcuts("searchInput", () => { 
        closeModal(); 
        panel.classList.remove("open"); 
    }, () => panel.classList.toggle("open"));
    ZSShared.setupClickOutsidePanel("panel", "settingsToggle");
    ZSShared.setupGreeting(".greeting");

    ZSShared.setupScrollNavigation('.grid-wrap', {
        getTotalPages: () => ZSShared.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols),
        getCurrentPage: () => currentPage,
        onPageChange: (newPage) => { 
            currentPage = newPage; 
            renderWithTransition(); 
        }
    });

    ZSShared.setupDragEdgeNavigation(".grid-wrap", {
        canGoPrev: () => currentPage > 0,
        canGoNext: () => currentPage < ZSShared.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols) - 1,
        onNavigate: (dir) => { 
            currentPage += dir; 
            renderWithTransition(); 
        }
    });

    try { 
        await initDB(); 
    } catch (err) { 
        console.warn(err); 
    }
    const bgTimeout = new Promise((resolve) => setTimeout(resolve, 350));
    await Promise.all([Promise.race([applyBackground(), bgTimeout]), render()]);
    requestAnimationFrame(() => document.body.classList.add('loaded'));
})();