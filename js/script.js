/**
 * ZS New Tab – Full Application
 * Uses localStorage for settings, site's, icons and IndexedDB for backgrounds.
 */
(async function () {
    "use strict";
    const { ZSCore, ZSDB } = window;
    if (!ZSCore) return console.error("ZSCore is missing. Please load script.shared.js first.");
    if (!ZSDB) return console.error("ZSDB is missing. Please load script.db.js first.");

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const SETTINGS_KEY = "ZSNewTab.settings";
    const ICON_KEY_PREFIX = "ZSNewTab.icon.";

    // =============================================
    //  2. LOCAL STORAGE HELPERS
    // =============================================
    /**
     * In-memory cache for site icons.
     * key   = site id
     * value = data URL string, or null if the site does not have a custom icon.
     */
    const iconCache = new Map();

    /**
     * Loads the application state from localStorage, falling back to the default state if empty or invalid.
     */
    function loadState() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return JSON.parse(JSON.stringify(ZSCore.defaultState));
            const parsed = JSON.parse(raw);
            if (!parsed.settings) parsed.settings = { ...ZSCore.defaultState.settings };
            if (!Array.isArray(parsed.sites)) parsed.sites = [];
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(ZSCore.defaultState));
        }
    }

    // =============================================
    //  3. GLOBAL VARIABLES
    // =============================================
    let state = loadState();
    let currentPage = 0;
    let editingId = null;
    let dragSourceId = null;
    let tempIconData = null;

    /**
     * Saves the current settings and sites array to localStorage.
     */
    function saveState() { 
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: state.settings, sites: state.sites })); 
    }
    
    /**
     * Generates the localStorage key for a specific site's icon.
     */
    function getIconKey(siteId) { 
        return ICON_KEY_PREFIX + siteId; 
    }

    /**
     * Saves a site's icon data URL to localStorage and keeps the cache in sync.
     */
    function saveSiteIcon(siteId, dataUrl) {
        localStorage.setItem(getIconKey(siteId), dataUrl);
        iconCache.set(siteId, dataUrl);
    }

    /**
     * Retrieves a site's icon data URL
     */
    function loadSiteIcon(siteId) {
        if (iconCache.has(siteId)) return iconCache.get(siteId);
        const dataUrl = localStorage.getItem(getIconKey(siteId));
        iconCache.set(siteId, dataUrl);
        return dataUrl;
    }

    /**
     * Removes a specific site's icon from localStorage and cache.
     */
    function deleteSiteIcon(siteId) {
        localStorage.removeItem(getIconKey(siteId));
        iconCache.set(siteId, null);
    }

    /**
     * Clears all data from localStorage and the icon cache.
     */
    function clearLocalStorageData() {
        iconCache.clear();
        Object.keys(localStorage)
            .filter(k => k.startsWith("ZSNewTab."))
            .forEach(k => localStorage.removeItem(k));
    }

    // =============================================
    //  4. RENDERING FUNCTIONS
    // =============================================
    const renderWithTransition = ZSCore.createRenderer('grid', render);

    /**
     * Updates the greeting element with the user's saved name or a default placeholder.
     */
    function renderName() { 
        document.getElementById("greetName").textContent = state.settings.name || "there"; 
    }

    /**
     * Main render function that updates the grid, pagination, and settings UI based on the current state.
     */
    function render() {
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        renderName();
        document.getElementById("engineSelect").value = state.settings.engine;

        const total = ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols);
        if (currentPage >= total) currentPage = total - 1;
        if (currentPage < 0) currentPage = 0;

        const pageSize = ZSCore.getPageSize(state.settings.rows, state.settings.cols);
        const start = currentPage * pageSize;
        const pageSites = state.sites.slice(start, start + pageSize);

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        pageSites.forEach(site => grid.appendChild(buildTile(site)));
        if (pageSites.length < pageSize) grid.appendChild(ZSCore.buildAddTile(() => openModal(null)));
        for (let i = pageSites.length + 1; i < pageSize; i++) grid.appendChild(ZSCore.buildEmptyTile());

        ZSCore.updatePaginationUI(total, currentPage, (idx) => { 
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
     * Creates and configures a DOM element for a single site tile, including drag-and-drop, click, and action handlers.
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
        const iconData = loadSiteIcon(site.id);
        if (typeof iconData === "string" && iconData.startsWith("data:image")) {
            img.src = iconData;
        } else {
            img.src = ZSCore.getFaviconUrl(site.url);
        }

        img.alt = "";
        img.onerror = () => {
            icon.innerHTML = "";
            icon.style.background = ZSCore.getColorForName(site.name);

            const span = document.createElement("span");
            span.className = "letter";
            span.textContent = ZSCore.getFirstLetter(site.name);
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
            if (await ZSCore.showConfirm(
                `Delete "${site.name}"? This can't be undone.`,
                {
                    title: "Delete site",
                    confirmLabel: "Delete",
                    cancelLabel: "Cancel",
                }
            )) {
                state.sites = state.sites.filter(s => s.id !== site.id);
                deleteSiteIcon(site.id); 
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
    //  5. MODAL (ADD / EDIT SITE)
    // =============================================
    const overlay = document.getElementById("overlay");
    const siteIconInput = document.getElementById("siteIcon");
    const iconPreview = document.getElementById("iconPreview");
    const iconPreviewImg = document.getElementById("iconPreviewImg");
    const removeIconBtn = document.getElementById("removeIconBtn");

    /**
     * Opens and populates the add/edit site modal with existing data or defaults.
     */
    function openModal(site) {
        editingId = site ? site.id : null;
        document.getElementById("modalTitle").textContent = site ? "Edit site" : "Add site";
        document.getElementById("siteName").value = site ? site.name : "";
        document.getElementById("siteUrl").value = site ? site.url : "";
        tempIconData = null; 
        siteIconInput.value = ""; 
        iconPreview.style.display = "none";

        if (site) {
            const existingIcon = loadSiteIcon(site.id);
            if (typeof existingIcon === "string" && existingIcon.startsWith("data:image")) {
                tempIconData = existingIcon; 
                iconPreviewImg.src = existingIcon; 
                iconPreview.style.display = "flex";
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
            const resizedBlob = await ZSCore.resizeImage(file, "icon");
            tempIconData = await ZSCore.blobToDataURL(resizedBlob);
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
     * Validates and saves a new or edited site to the state and localStorage, handling icon updates.
     */
    function saveSite() {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        const stateSnapshot = JSON.parse(JSON.stringify(state));
        const targetId = editingId || ZSCore.generateId();
        const iconKey = getIconKey(targetId);
        const iconSnapshot = localStorage.getItem(iconKey);
        const hadCacheEntry = iconCache.has(targetId);
        const cacheSnapshot = iconCache.get(targetId);

        try {
            if (editingId) {
                const existing = state.sites.find(s => s.id === editingId);
                if (existing) {
                    existing.name = name;
                    existing.url = url;
                }
            } else {
                state.sites.push({ id: targetId, name, url });
            }

            if (typeof tempIconData === "string" && tempIconData.startsWith("data:image")) {
                saveSiteIcon(targetId, tempIconData);
            } else if (tempIconData === null) {
                deleteSiteIcon(targetId);
            }

            saveState();
            closeModal();
            renderWithTransition();
        } catch (err) {
            // rollback state
            state = stateSnapshot;

            if (iconSnapshot === null) {
                localStorage.removeItem(iconKey);
            } else {
                localStorage.setItem(iconKey, iconSnapshot);
            }
            if (hadCacheEntry) {
                iconCache.set(targetId, cacheSnapshot);
            } else {
                iconCache.delete(targetId);
            }

            alert("Could not save site — local storage may be full.");
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
    //  6. SETTINGS PANEL
    // =============================================
    const panel = document.getElementById("panel");
    function openSettingsPanel() {
        document.getElementById("displayName").value = state.settings.name;
        document.getElementById("rowsInput").value = state.settings.rows;
        document.getElementById("colsInput").value = state.settings.cols;
        panel.classList.toggle("open");
    }
    document.getElementById("settingsToggle").addEventListener("click", openSettingsPanel);
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

    const bgImageInput = document.getElementById("bgImageInput");
    const removeBgBtn = document.getElementById("removeBgBtn");
    bgImageInput.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        
        try {
            const resizedBlob = await ZSCore.resizeImage(file, 'bg');
            await ZSDB.setBackground(resizedBlob);
        } catch (err) {
            alert("Could not save background image.");
        } finally {
            e.target.value = "";
        }
    });

    removeBgBtn.addEventListener("click", async () => {
        if (removeBgBtn.disabled) return;

        const ok = await ZSCore.showConfirm(
            "This will delete the saved background. You can't undo this.",
            {
                title: "Remove background",
                confirmLabel: "Remove",
                cancelLabel: "Keep",
            }
        );
        if (!ok) return;

        removeBgBtn.disabled = true;
        try {
            await ZSDB.removeBackground();
            bgImageInput.value = "";
        } catch (err) {
            console.error("Failed to remove background", err);
        } finally {
            removeBgBtn.disabled = false;
        }
    });

    document.getElementById("exportBtn").addEventListener("click", async () => {
        const btn = document.getElementById("exportBtn");
        if (btn.disabled) return;
        btn.disabled = true;

        try {
            const bgBlob = await ZSDB.getBackground();
            const bgDataUrl = bgBlob ? await ZSCore.blobToDataURL(bgBlob) : null;

            const backup = {
                settings: {
                    ...state.settings,
                    bg: bgDataUrl, 
                },
                sites: state.sites.map(site => {
                    const copy = { ...site };
                    const iconData = loadSiteIcon(site.id);
                    if (iconData) copy.iconData = iconData;
                    return copy;
                }),
            };

            const blob = new Blob([JSON.stringify(backup, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `zs-new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error("Export failed", err);
            alert("Could not create backup.");
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById("importBtn").addEventListener("click", () =>
        document.getElementById("importFile").click()
    );

    document.getElementById("importFile").addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = async ev => {
            const previousState = state;

            try {
                const parsed = JSON.parse(ev.target.result);

                if (!parsed || !parsed.sites || !parsed.settings || !Array.isArray(parsed.sites)) {
                    throw new Error("Invalid backup format");
                }

                if (!(await ZSCore.showConfirm(
                    "Current data will be lost when you import this file.",
                    {
                        title: "Import backup",
                        confirmLabel: "Import",
                        cancelLabel: "Cancel",
                    }
                ))) return;

                const { bg, ...settingsOnly } = parsed.settings;

                const importedSettings = {
                    name:   settingsOnly.name   ?? "",
                    rows:   settingsOnly.rows   ?? 4,
                    cols:   settingsOnly.cols   ?? 6,
                    engine: settingsOnly.engine ?? "https://www.google.com/search?q=",
                };
                const importedSites = parsed.sites.map(site => ({
                    id: site.id, name: site.name, url: site.url,
                }));

                if (typeof bg === "string" && bg.startsWith("data:image")) {
                    await ZSDB.setBackground(ZSCore.dataURLToBlob(bg));
                } else {
                    await ZSDB.removeBackground();
                }

                state = { settings: importedSettings, sites: importedSites };
                clearLocalStorageData();

                for (const site of parsed.sites) {
                    if (typeof site.iconData === "string" && site.iconData.startsWith("data:image")) {
                        saveSiteIcon(site.id, site.iconData);
                    }
                }

                saveState();
                currentPage = 0;
                renderWithTransition();
                panel.classList.remove("open");

            } catch (err) {
                console.error("Import failed", err);

                state = previousState;

                try {
                    await ZSDB.applyBackground();
                } catch (_) {}

                alert("This file doesn't look like a valid backup, or it's too large.");
            }
        };

        reader.readAsText(file);
        e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        if (await ZSCore.showConfirm(
            "This removes all your sites, settings and background. Continue?",
            {
                title: "Reset everything",
                confirmLabel: "Reset",
                cancelLabel: "Cancel",
            }
        )) {
            try {
                clearLocalStorageData();
                await ZSDB.removeBackground();

                state = JSON.parse(JSON.stringify(ZSCore.defaultState));
                currentPage = 0;

                saveState(); 
                renderWithTransition(); 
                panel.classList.remove("open");
            } catch (err) { 
                alert("Could not reset the application."); 
            }
        }
    });

    // =============================================
    //  7. NAVIGATION & INITIALIZATION
    // =============================================
    document.getElementById("prevPage").addEventListener("click", () => { 
        if (currentPage > 0) { 
            currentPage--; 
            renderWithTransition(); 
        } 
    });
    
    document.getElementById("nextPage").addEventListener("click", () => { 
        if (currentPage < ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols) - 1) { 
            currentPage++; 
            renderWithTransition(); 
        } 
    });

    ZSCore.setupSearchForm("searchForm", "searchInput", () => state.settings.engine);
    ZSCore.setupKeyboardShortcuts("searchInput", () => { 
        closeModal(); 
        panel.classList.remove("open"); 
    }, openSettingsPanel);
    ZSCore.setupClickOutsidePanel("panel", "settingsToggle");
    ZSCore.setupGreeting();

    ZSCore.setupScrollNavigation('.grid-wrap', {
        getTotalPages: () => ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols),
        getCurrentPage: () => currentPage,
        onPageChange: (newPage) => { 
            currentPage = newPage; 
            renderWithTransition(); 
        }
    });

    ZSCore.setupDragEdgeNavigation(".grid-wrap", {
        canGoPrev: () => currentPage > 0,
        canGoNext: () => currentPage < ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols) - 1,
        onNavigate: (dir) => { 
            currentPage += dir; 
            renderWithTransition(); 
        }
    });

    render();

    try {
        await ZSDB.applyBackground();
    } catch (err) {
        console.warn("Background failed", err);
    }
})();