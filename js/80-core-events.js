window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Sets up a dynamic greeting message based on the current time of day and updates it periodically.
     */
    function setupGreeting() {
        const node = document.getElementById('greetingMessage');
        if (!node) return;
        const update = () => {
            const hour = new Date().getHours();
            const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
            node.textContent = `${greeting}, `;
        };
        update();
        setInterval(update, 15000);
    }

    /**
     * Attaches a submit event listener to a search form to handle URL detection or search engine queries.
     */
    function setupSearchForm(formId, inputId, getEngineFn) {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = document.getElementById(inputId).value.trim();
            if (!query) return;

            const hasScheme = /^https?:\/\//i.test(query);

            const looksLikeIp = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(query);

            const looksLikeDomain = /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(query)
                && !query.includes(" ")
                && /^[a-z]{2,}(\/.*)?$/i.test(query.split("/")[0].split(".").pop());

            const looksLikeUrl = hasScheme || looksLikeIp || looksLikeDomain;
            window.location.href = looksLikeUrl ? (hasScheme ? query : `https://${query}`) : getEngineFn() + encodeURIComponent(query);
        });
    }

    /**
     * Sets up global keyboard shortcuts, such as focusing the search input on "/" and triggering an escape callback.
     */
    function setupKeyboardShortcuts(searchInputId, onEscapeFn, onToggleSettingsFn) {
        document.addEventListener("keydown", (e) => {
            const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(
                document.activeElement.tagName
            );
            const isModalOpen = document.getElementById("overlay")?.classList.contains("open");

            if (e.key === "/" && !isTyping) {
                e.preventDefault();
                document.getElementById(searchInputId)?.focus();
            }

            if (e.key.toLowerCase() === "p" && !isTyping && !isModalOpen && onToggleSettingsFn) {
                e.preventDefault();
                onToggleSettingsFn();
            }

            if (e.key === "Escape" && onEscapeFn) {
                onEscapeFn();
            }
        });
    }

    /**
     * Adds a document-level click listener to close a specified panel if the click occurs outside of it and its toggle button.
     */
    function setupClickOutsidePanel(panelId, toggleBtnId) {
        document.addEventListener("click", (e) => {
            const panel = document.getElementById(panelId);
            const toggle = document.getElementById(toggleBtnId);
            if (!panel?.classList.contains("open")) return;

            const path = typeof e.composedPath === "function" ? e.composedPath() : [];

            const clickedInsidePanel = path.includes(panel) || panel.contains(e.target);
            const clickedToggle = (toggle && path.includes(toggle)) || toggle?.contains(e.target);
            const clickedOverlay = path.some(el => el.classList?.contains?.("overlay"))
                || !!e.target.closest?.(".overlay");

            if (!clickedInsidePanel && !clickedToggle && !clickedOverlay) {
                panel.classList.remove("open");
            }
        });
    }

    /**
     * Enables mouse wheel scrolling to navigate between pages in a grid wrapper, with a debounce mechanism to prevent rapid firing.
     */
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
        }, { passive: false });
    }

    /**
     * Triggers page navigation when a dragged item hovers near the left or right edge of the grid wrapper for a specified duration.
     */
    function setupDragEdgeNavigation(gridWrapSelector, callbacks, edgeSize = 45, holdMs = 500) {
        const gridWrap = document.querySelector(gridWrapSelector);
        if (!gridWrap) return;

        gridWrap.style.setProperty("--edge-size", edgeSize + "px");

        let hoverTimer = null;
        let activeDir = 0;

        function clearTimer() {
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverTimer = null;
            activeDir = 0;
            gridWrap.classList.remove("drag-edge-left", "drag-edge-right");
        }

        gridWrap.addEventListener("dragover", e => {
            e.preventDefault();

            const rect = gridWrap.getBoundingClientRect();
            const x = e.clientX;
            let dir = 0;

            if (x - rect.left < edgeSize) dir = -1;
            else if (rect.right - x < edgeSize) dir = 1;

            if (dir === 0) {
                clearTimer();
                return;
            }

            const canGo = dir === -1 ? callbacks.canGoPrev() : callbacks.canGoNext();
            if (!canGo) {
                clearTimer();
                return;
            }

            if (activeDir === dir && hoverTimer) {
                return;
            }

            clearTimer();
            activeDir = dir;
            gridWrap.classList.add(dir === -1 ? "drag-edge-left" : "drag-edge-right");

            hoverTimer = setTimeout(() => {
                callbacks.onNavigate(dir);
                hoverTimer = null;
                activeDir = 0;
                gridWrap.classList.remove("drag-edge-left", "drag-edge-right");
            }, holdMs);
        });

        gridWrap.addEventListener("dragleave", e => {
            if (!gridWrap.contains(e.relatedTarget)) clearTimer();
        });

        gridWrap.addEventListener("drop", clearTimer);
    }

    return {
        setupGreeting,
        setupSearchForm,
        setupKeyboardShortcuts,
        setupClickOutsidePanel,
        setupScrollNavigation,
        setupDragEdgeNavigation
    }
})());