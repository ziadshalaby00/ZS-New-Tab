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
     * Main render function that updates the grid, pagination, and settings UI based on the current state.
     */
    function render() {
        const state = window.ZSApp.state;
        ZSCore.applyAccent(state.settings.accent);
        document.documentElement.style.setProperty("--cols", state.settings.cols);
        renderName();
        document.getElementById("engineSelect").value = state.settings.engine;

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
        for (let i = pageSites.length + 1; i < pageSize; i++) grid.appendChild(ZSCore.buildEmptyTile());

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
        editBtn.textContent = "✎";
        editBtn.addEventListener("click", e => {
            e.stopPropagation();
            window.ZSApp.openModal(site);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "del";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", async e => {
            e.stopPropagation();
            if (await ZSCore.showConfirm(
                `Delete "${site.name}"? This can't be undone.`,
                { title: "Delete site", confirmLabel: "Delete", cancelLabel: "Cancel" }
            )) {
                window.ZSApp.state.sites = window.ZSApp.state.sites.filter(s => s.id !== site.id);
                window.ZSApp.deleteSiteIcon(site.id);
                window.ZSApp.saveState();
                renderWithTransition({ type: 'delete', tileId: site.id });
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        tile.appendChild(icon);
        tile.appendChild(label);
        tile.appendChild(actions);

        tile.addEventListener("click", () => {
            if (c.kind === "navigable") window.location.href = c.url;
            else window.ZSApp.openModal(site);
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
            clearDropIndicator();
        });

        tile.addEventListener("dragover", e => {
            e.preventDefault();
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
            clearDropIndicator();

            const dragSourceId = window.ZSApp.dragSourceId;
            if (!dragSourceId || dragSourceId === site.id) return;

            const state = window.ZSApp.state;
            const fromIndex = state.sites.findIndex(s => s.id === dragSourceId);
            if (fromIndex === -1) return;

            const moved = state.sites.splice(fromIndex, 1)[0];
            const toIndex = state.sites.findIndex(s => s.id === site.id);
            if (toIndex === -1) { state.sites.splice(fromIndex, 0, moved); return; }

            const insertIndex = side === "after" ? toIndex + 1 : toIndex;
            state.sites.splice(insertIndex, 0, moved);

            window.ZSApp.saveState();
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