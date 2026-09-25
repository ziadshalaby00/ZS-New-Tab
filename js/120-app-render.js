window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const renderWithTransition = ZSCore.createRenderer('grid', render);

    /**
     * Updates the greeting element with the user's saved name or a default placeholder.
     */
    function renderName() {
        document.getElementById("greetName").textContent = window.ZSApp.state.settings.name || "there";
    }

    /**
     * Builds the search engine <select> from ZSCore.SEARCH_ENGINES the
     * first time it runs, then only updates the selected value on
     * subsequent renders. Guards against the `render()` function being
     * called many times per second (every edit / delete / reorder).
     */
    function renderEngineSelect(currentValue) {
        const select = document.getElementById("engineSelect");
        if (!select) return;

        if (!select.dataset.built) {
            const groups = new Map();
            for (const eng of ZSCore.SEARCH_ENGINES) {
                const key = eng.group || "Other";
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(eng);
            }

            const frag = document.createDocumentFragment();
            for (const [groupName, engines] of groups) {
                const optgroup = document.createElement("optgroup");
                optgroup.label = groupName;

                for (const eng of engines) {
                    const opt = document.createElement("option");
                    opt.value = eng.url;
                    opt.textContent = eng.name;
                    optgroup.appendChild(opt);
                }
                frag.appendChild(optgroup);
            }

            select.replaceChildren(frag);
            select.dataset.built = "1";
        }

        const has = Array.from(select.options).some(o => o.value === currentValue);
        select.value = has ? currentValue : (select.options[0]?.value || "");

        if (!has && select.value) {
            // Intentional: don't persist this — it's a display-only fallback
            // when the stored engine isn't in the current list. The user's own
            // selection from the dropdown goes through 150-app-settings.js.
            window.ZSApp.state.settings.engine = select.value;
        }
    }

    /**
     * Main render function that updates the grid, pagination, and settings UI based on the current state.
     */
    function render() {
        const state = window.ZSApp.state;
        ZSCore.applyAccent(state.settings.accent);
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        document.documentElement.style.setProperty("--rows", state.settings.rows);

        renderName();
        renderEngineSelect(state.settings.engine);

        const total = ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols);
        if (window.ZSApp.currentPage >= total) window.ZSApp.currentPage = total - 1;
        if (window.ZSApp.currentPage < 0) window.ZSApp.currentPage = 0;

        const pageSize = ZSCore.getPageSize(state.settings.rows, state.settings.cols);
        const start = window.ZSApp.currentPage * pageSize;
        const pageSites = state.sites.slice(start, start + pageSize);

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        pageSites.forEach(site => grid.appendChild(buildTile(site)));
        if (pageSites.length < pageSize) grid.appendChild(ZSCore.buildAddTile(() => window.ZSApp.openModal(null)));

        ZSCore.updatePaginationUI(total, window.ZSApp.currentPage, (idx) => {
            const dir = idx > window.ZSApp.currentPage ? 1 : -1;
            window.ZSApp.currentPage = idx;
            renderWithTransition({ type: 'page', direction: dir });
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
        tile.tabIndex = 0;

        const c = ZSCore.classifyInput(site.url);

        tile.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (c.kind !== "navigable") { window.ZSApp.openModal(site); return; }
                else if (e.ctrlKey || e.metaKey) window.open(c.url, "_blank");
                else window.location.href = c.url;
            }
        });

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.style.background = "transparent";

        const useLetterFallback = () => {
            icon.innerHTML = "";
            icon.style.background = ZSCore.getColorForName(site.name);
            const span = document.createElement("span");
            span.className = "letter";
            span.textContent = ZSCore.getFirstLetter(site.name);
            icon.appendChild(span);
        };

        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";

        const iconData = window.ZSApp.loadSiteIcon(site.id);
        const isCustomIcon = typeof iconData === "string" && iconData.startsWith("data:image");

        const src = isCustomIcon ? iconData : ZSCore.getFaviconUrl(site.url);
        
        // Attach handlers BEFORE setting src so a cached/immediate
        // error can't fire before the handler exists.
        img.onerror = useLetterFallback;
        img.onload = () => {
            // Google's faviconV2 returns a 16x16 globe when it has no
            // real favicon, even though we asked for size=128.
            if (!isCustomIcon && img.naturalWidth <= 16) useLetterFallback();
        };

        if (!src) {
            useLetterFallback();
        } else {
            img.src = src;
        }

        icon.appendChild(img);

        icon.addEventListener("contextmenu", e => {
            e.preventDefault();
            e.stopPropagation();
            window.ZSApp.openModal(site);
        });

        // Warning badge for disabled/invalid URLs
        if (c.kind !== "navigable") {
            tile.classList.add("tile-invalid");
            const warn = document.createElement("div");
            warn.className = "tile-warning";
            warn.textContent = "!";
            icon.appendChild(warn);
        }

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = site.name;

        const actions = document.createElement("div");
        actions.className = "tile-actions";

        const editBtn = document.createElement("button");
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
        `;
        editBtn.addEventListener("click", e => {
            e.stopPropagation();
            window.ZSApp.openModal(site);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "del";
        delBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
            </svg>
        `;
        delBtn.addEventListener("click", async e => {
            e.stopPropagation();
            if (await ZSCore.showConfirm(
                `Delete "${site.name}"? This can't be undone.`,
                { title: "Delete site", confirmLabel: "Delete", cancelLabel: "Cancel" }
            )) {
                const state = window.ZSApp.state;
                const sitesSnapshot = state.sites.slice();
                const iconKey = window.ZSApp.getIconKey(site.id);
                const iconSnapshot = localStorage.getItem(iconKey);
                const hadCacheEntry = window.ZSApp.iconCache.has(site.id);
                const cacheSnapshot = window.ZSApp.iconCache.get(site.id);

                state.sites = state.sites.filter(s => s.id !== site.id);
                window.ZSApp.deleteSiteIcon(site.id);

                if (!window.ZSApp.saveState()) {
                    // saveState() already showed its own "storage full" alert.
                    // Restore the sites list, the icon, and the cache — otherwise
                    // the tile disappears from the UI but comes back on reload,
                    // and the icon is already gone by then.
                    state.sites = sitesSnapshot;
                    if (iconSnapshot === null) localStorage.removeItem(iconKey);
                    else localStorage.setItem(iconKey, iconSnapshot);
                    if (hadCacheEntry) window.ZSApp.iconCache.set(site.id, cacheSnapshot);
                    else window.ZSApp.iconCache.delete(site.id);
                    return;
                }

                renderWithTransition({ type: 'delete', tileId: site.id });
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        tile.appendChild(icon);
        tile.appendChild(label);
        tile.appendChild(actions);

        tile.addEventListener("click", (e) => {
            if (c.kind !== "navigable") {
                window.ZSApp.openModal(site);
                return;
            }
            // Ctrl+Click (Windows/Linux) or Cmd+Click (Mac) → open in new tab,
            // matching the middle-click behavior handled by the auxclick listener.
            if (e.ctrlKey || e.metaKey) {
                window.open(c.url, "_blank");
            } else {
                window.location.href = c.url;
            }
        });
        tile.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
        tile.addEventListener("auxclick", e => {
            if (e.button === 1) {
                e.preventDefault();
                if (c.kind === "navigable") window.open(c.url, "_blank");
                else window.ZSApp.openModal(site);
            }
        });
        tile.addEventListener("dragstart", e => {
            window.ZSApp.dragSourceId = site.id;
            tile.classList.add("dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", site.id);
            }
        });

        tile.addEventListener("dragend", () => {
            tile.classList.remove("dragging");
            window.ZSApp.dragSourceId = null;
            clearDropIndicator();
        });

        tile.addEventListener("dragover", e => {
            e.preventDefault();
            // Only respond to internal tile drags — ignore OS file drags
            // (which have no text/plain payload and would otherwise try to
            // reorder using a stale dragSourceId).
            if (!e.dataTransfer?.types.includes("text/plain")) return;
            const dragSourceId = window.ZSApp.dragSourceId;
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
            if (currentDropTarget === tile && !tile.contains(e.relatedTarget)) clearDropIndicator();
        });

        tile.addEventListener("drop", e => {
            e.preventDefault();
            const side = currentDropSide;
            const dragSourceId = window.ZSApp.dragSourceId;
            window.ZSApp.dragSourceId = null;
            clearDropIndicator();

            if (!dragSourceId || dragSourceId === site.id) return;

            const state = window.ZSApp.state;
            // Shallow copy is enough — we only reorder array slots, never mutate
            // the site objects themselves.
            const sitesSnapshot = state.sites.slice();

            const fromIndex = state.sites.findIndex(s => s.id === dragSourceId);
            if (fromIndex === -1) return;

            const moved = state.sites.splice(fromIndex, 1)[0];
            const toIndex = state.sites.findIndex(s => s.id === site.id);
            if (toIndex === -1) { state.sites.splice(fromIndex, 0, moved); return; }

            const insertIndex = side === "after" ? toIndex + 1 : toIndex;
            state.sites.splice(insertIndex, 0, moved);

            if (!window.ZSApp.saveState()) {
                // saveState() already showed its own "storage full" alert.
                // Restore the original order so a failed drag doesn't leave the
                // in-memory list out of sync with what's on disk.
                state.sites = sitesSnapshot;
                return;
            }

            renderWithTransition({ type: 'reorder', tileId: dragSourceId });
        });

        return tile;
    }

    return { 
        render, 
        renderWithTransition, 
        renderName, 
        buildTile 
    };
})());