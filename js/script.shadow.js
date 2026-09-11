/**
 * ZS New Tab Shadow – Full Application
 * Uses ONLY localStorage for settings/state, background image, and site icons.
 */
(async function () {
    "use strict";
    const { ZSShared } = window;
    if (!ZSShared) return console.error("ZSShared is missing. Please load script.shared.js first.");

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const SETTINGS_KEY = "ZSNewTab.settings";
    const BACKGROUND_KEY = "ZSNewTab.background";
    const ICON_KEY_PREFIX = "ZSNewTab.icon.";

    // =============================================
    //  2. LOCAL STORAGE HELPERS
    // =============================================

    /**
     * Loads the application state from localStorage, falling back to the default state if empty or invalid.
     */
    function loadState() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return JSON.parse(JSON.stringify(ZSShared.defaultState));
            const parsed = JSON.parse(raw);
            if (!parsed.settings) parsed.settings = { ...ZSShared.defaultState.settings };
            if (!Array.isArray(parsed.sites)) parsed.sites = [];
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(ZSShared.defaultState));
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
     * Saves a site's icon data URL to localStorage.
     */
    function saveSiteIcon(siteId, dataUrl) { 
        localStorage.setItem(getIconKey(siteId), dataUrl); 
    }

    /**
     * Retrieves a site's icon data URL from localStorage.
     */
    function loadSiteIcon(siteId) { 
        return localStorage.getItem(getIconKey(siteId)); 
    }

    /**
     * Removes a specific site's icon data from localStorage.
     */
    function deleteSiteIcon(siteId) { 
        localStorage.removeItem(getIconKey(siteId)); 
    }
    
    /**
     * Saves the background image data URL to localStorage.
     */
    function saveBackground(dataUrl) { 
        localStorage.setItem(BACKGROUND_KEY, dataUrl); 
    }

    /**
     * Retrieves the background image data URL from localStorage.
     */
    function loadBackground() { 
        return localStorage.getItem(BACKGROUND_KEY); 
    }

    /**
     * Removes the background image data from localStorage.
     */
    function deleteBackground() { 
        localStorage.removeItem(BACKGROUND_KEY); 
    }

    /**
     * Clears all data from localStorage.
     */
    function clearAllStorageData() { 
        localStorage.clear(); 
    }

    // =============================================
    //  4. BACKGROUND IMAGE MANAGEMENT
    // =============================================

    /**
     * Applies the saved background image to the document body, or removes it if none exists.
     */
    function applyBackground() {
        const body = document.body;
        const bgData = loadBackground();
        if (typeof bgData === "string" && bgData.startsWith("data:image")) {
            body.style.setProperty('--bg-image', `url("${bgData}")`);
            body.classList.add('has-bg-image');
        } else {
            body.classList.remove('has-bg-image');
            body.style.removeProperty('--bg-image');
        }
    }

    // =============================================
    //  5. RENDERING FUNCTIONS
    // =============================================
    const renderWithTransition = ZSShared.createRenderer('grid', render);

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
    //  6. MODAL (ADD / EDIT SITE)
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
     * Validates and saves a new or edited site to the state and localStorage, handling icon updates.
     */
    function saveSite() {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        const snapshot = JSON.parse(JSON.stringify(state));
        try {
            if (editingId) {
                const existing = state.sites.find(s => s.id === editingId);
                if (existing) {
                    existing.name = name; 
                    existing.url = url;
                    if (typeof tempIconData === "string" && tempIconData.startsWith("data:image")) {
                        saveSiteIcon(existing.id, tempIconData);
                    } else if (tempIconData === null) {
                        deleteSiteIcon(existing.id);
                    }
                }
            } else {
                const newSite = { id: ZSShared.generateId(), name, url };
                state.sites.push(newSite);
                if (tempIconData) saveSiteIcon(newSite.id, tempIconData);
            }
            saveState(); 
            closeModal(); 
            renderWithTransition();
        } catch (err) {
            state = snapshot; 
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
    //  7. SETTINGS PANEL
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
            const dataUrl = await ZSShared.blobToDataURL(resizedBlob);
            saveBackground(dataUrl); 
            applyBackground();
        } catch (err) { 
            alert("Could not save background image."); 
        }
        e.target.value = "";
    });

    document.getElementById("removeBgBtn").addEventListener("click", () => { 
        deleteBackground(); 
        applyBackground(); 
        document.getElementById("bgImageInput").value = ""; 
    });

    document.getElementById("exportBtn").addEventListener("click", () => {
        try {
            const backup = {
                settings: { ...state.settings, bg: loadBackground() || false },
                sites: state.sites.map(site => {
                    const copy = { ...site };
                    const iconData = loadSiteIcon(site.id);
                    if (iconData) copy.iconData = iconData;
                    return copy;
                })
            };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
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
            const previousState = state;
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed || !parsed.sites || !parsed.settings || !Array.isArray(parsed.sites)) {
                    throw new Error("Invalid backup format");
                }
                if (!(await ZSShared.showConfirm("Current data will be lost when you import this file."))) return;

                let background = typeof parsed.settings.bg === "string" && parsed.settings.bg.startsWith("data:image") ? parsed.settings.bg : false;
                const importedSettings = { 
                    name: parsed.settings.name ?? "", 
                    rows: parsed.settings.rows ?? 4, 
                    cols: parsed.settings.cols ?? 6, 
                    engine: parsed.settings.engine ?? "https://www.google.com/search?q=" 
                };
                const importedSites = parsed.sites.map(site => ({ id: site.id, name: site.name, url: site.url }));

                state = { settings: importedSettings, sites: importedSites };
                clearAllStorageData();
                if (background) saveBackground(background); 
                else deleteBackground();

                for (const site of parsed.sites) {
                    if (typeof site.iconData === "string" && site.iconData.startsWith("data:image")) {
                        saveSiteIcon(site.id, site.iconData);
                    }
                }
                saveState(); 
                currentPage = 0; 
                renderWithTransition(); 
                applyBackground(); 
                panel.classList.remove("open");
            } catch (err) {
                state = previousState; 
                alert("This file doesn't look like a valid backup, or it's too large.");
            }
        };
        reader.readAsText(file); 
        e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        if (await ZSShared.showConfirm("This removes all your sites and settings. Continue?", "Reset Everything")) {
            try {
                clearAllStorageData();
                state = JSON.parse(JSON.stringify(ZSShared.defaultState));
                currentPage = 0; 
                saveState(); 
                renderWithTransition(); 
                applyBackground(); 
                panel.classList.remove("open");
            } catch (err) { 
                alert("Could not reset the application."); 
            }
        }
    });

    // =============================================
    //  8. NAVIGATION & INITIALIZATION
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

    render();
    applyBackground();
})();