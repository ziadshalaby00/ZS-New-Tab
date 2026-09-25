window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    /** 
     * Constants
     */
    const SETTINGS_KEY = "ZSNewTab.settings";
    const ICON_KEY_PREFIX = "ZSNewTab.icon.";

    /**
     * In-memory cache for site icons.
     * key   = site id
     * value = data URL string, or null if the site does not have a custom icon.
     */
    const iconCache = new Map();

    /**
     * Validates a raw sites array and returns a clean one.
     *
     * - Non-object entries, or sites missing a usable name or url, are dropped.
     * - Missing or duplicate ids are replaced with a freshly generated one
     *   (the site itself is fine — only the id is unusable).
     * - Every repair or drop is logged so a bad backup / stale schema doesn't
     *   fail silently.
     */
    function sanitizeSites(sites) {
        if (!Array.isArray(sites)) return [];

        const seenIds = new Set();
        const clean = [];
        let dropped = 0;
        let repaired = 0;

        for (const raw of sites) {
            if (!raw || typeof raw !== "object") { dropped++; continue; }

            const name = typeof raw.name === "string" ? raw.name.trim() : "";
            const url  = typeof raw.url  === "string" ? raw.url.trim()  : "";

            if (!name || !url) { dropped++; continue; }

            let id = typeof raw.id === "string" ? raw.id.trim() : "";
            if (!id || seenIds.has(id)) {
                id = ZSCore.generateId();
                repaired++;
            }
            seenIds.add(id);

            clean.push({ id, name, url });
        }

        if (dropped)  console.warn(`loadState: dropped ${dropped} invalid site(s)`);
        if (repaired) console.warn(`loadState: regenerated ${repaired} missing/duplicate id(s)`);

        return clean;
    }

    /**
     * Loads the application state from localStorage, falling back to the default state if empty or invalid.
     */
    function loadState() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return JSON.parse(JSON.stringify(ZSCore.defaultState));
            const parsed = JSON.parse(raw);
            parsed.settings = { ...ZSCore.defaultState.settings, ...(parsed.settings || {}) };

            parsed.settings.rows = ZSCore.clampGridDim(parsed.settings.rows, ZSCore.GRID_LIMITS.defaultRows);
            parsed.settings.cols = ZSCore.clampGridDim(parsed.settings.cols, ZSCore.GRID_LIMITS.defaultCols);

            if (typeof parsed.settings.name !== "string") {
                parsed.settings.name = "";
            }
            if (typeof parsed.settings.engine !== "string" || !parsed.settings.engine) {
                parsed.settings.engine = ZSCore.defaultState.settings.engine;
            }
            if (typeof parsed.settings.accent !== "string" ||
                !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(parsed.settings.accent)) {
                parsed.settings.accent = ZSCore.defaultState.settings.accent;
            }

            parsed.sites = sanitizeSites(parsed.sites);
            return parsed;
        } catch (_) {
            return JSON.parse(JSON.stringify(ZSCore.defaultState));
        }
    }

    /**
     * True while a "storage full" alert is on screen. See the module comment
     * in saveState() below for why this exists.
     */
    let storageAlertActive = false;

    /**
     * Shows a "storage full" alert unless one is already on screen. Every
     * quota-related failure — saveState, saveSite's icon write, applyBackup's
     * import — funnels through here so the user never sees the same message
     * stacked twice.
     *
     * Reset in the alert's .finally() so a fresh alert appears after the user
     * dismisses the previous one, even if the storage stays full.
     *
     * @param {string} [message]  Defaults to the generic settings-save wording.
     */
    function notifyStorageFull(message) {
        if (storageAlertActive) return;
        storageAlertActive = true;
        window.ZSCore.showAlert(
            message || "Couldn't save changes — local storage may be full.",
            { title: "Storage full" }
        ).finally(() => {
            storageAlertActive = false;
        });
    }

    function saveState() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                settings: window.ZSApp.state.settings,
                sites: window.ZSApp.state.sites
            }));
            return true;
        } catch (err) {
            console.error("saveState failed:", err);
            notifyStorageFull();
            return false;
        }
    }

    /**
     * Generates the localStorage key for a specific site's icon.
     */
    function getIconKey(siteId) { return ICON_KEY_PREFIX + siteId; }

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

    return {
        state: loadState(),
        currentPage: 0,
        editingId: null,
        dragSourceId: null,
        tempIconData: null,
        iconCache,
        loadState, 
        notifyStorageFull,
        saveState, 
        getIconKey,
        saveSiteIcon, 
        loadSiteIcon, 
        deleteSiteIcon, 
        clearLocalStorageData,
    };
})());