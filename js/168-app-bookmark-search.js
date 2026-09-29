/**
 * ZS New Tab – Search within bookmarks
 *
 * A read-only command-palette-style modal that filters the user's
 * bookmarks live. Nothing in this file mutates state — no add, edit,
 * delete, or drag. It only reads ZSApp.state.sites and navigates.
 *
 * Matching rules (see filterSites):
 *   - Query is split into whitespace-separated words.
 *   - EVERY word must match either the site name OR its hostname.
 *   - Arabic normalization: أ/إ/آ/ٱ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي, diacritics dropped.
 *   - Case-insensitive; Latin only.
 *   - Sort: name-starts > name-contains > host-starts > host-contains,
 *     then original grid order as tiebreaker.
 *
 * Keyboard:
 *   ↑ / ↓            move selection (focus stays in input)
 *   Enter            open selected in current tab
 *   Ctrl/Cmd+Enter   open selected in new tab
 *   Middle-click     open row in new tab
 *   Esc              close (handled by ZSCore.modal)
 *   Ctrl/Cmd+F       open / refocus the input (e.code fallback for Arabic layouts)
 */
window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const overlay    = document.getElementById("bookmarkSearchOverlay");
    const input      = document.getElementById("bookmarkSearchInput");
    const resultsEl  = document.getElementById("bookmarkSearchResults");
    const toggleBtn  = document.getElementById("bookmarkSearchToggle");
    const countEl    = document.getElementById("bookmarkSearchCount");

    if (!overlay || !input || !resultsEl) {
        console.warn("Bookmark search: modal DOM not found — feature disabled.");
        return {};
    }

    // ---------------------------------------------------------------
    // Normalization + matching
    // ---------------------------------------------------------------

    /**
     * Arabic-aware, case-insensitive normalization.
     * Drops tashkeel (harakat + tatweel) and unifies alef/ta-marbuta/etc.
     */
    function normalize(str) {
        return String(str || "")
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // harakat + Quranic marks
            .replace(/\u0640/g, "")                              // tatweel
            .replace(/[أإآٱ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي")
            .replace(/ؤ/g, "و")
            .replace(/ئ/g, "ي");
    }

    function hostnameOf(url) {
        try { return new URL(url).hostname; } catch { return ""; }
    }

    /**
     * Per-word scoring. Returns -1 if any word fails to match (all-must-match).
     * Name beats hostname; prefix beats substring.
     */
    function scoreSite(site, words) {
        const name = normalize(site.name);
        const host = normalize(hostnameOf(site.url));
        let total = 0;

        for (const w of words) {
            if (name.startsWith(w))       total += 100;
            else if (name.includes(w))    total += 50;
            else if (host.startsWith(w))  total += 25;
            else if (host.includes(w))    total += 10;
            else                          return -1;
        }
        return total;
    }

    /**
     * Returns [{ site, originalIndex }], sorted. Empty query → all sites
     * in original order.
     */
    function filterSites(query) {
        const sites = window.ZSApp.state.sites;
        const q = normalize(query).trim();

        if (!q) {
            return sites.map((site, i) => ({ site, originalIndex: i, score: 0 }));
        }

        const words = q.split(/\s+/).filter(Boolean);
        const out = [];

        sites.forEach((site, i) => {
            const s = scoreSite(site, words);
            if (s >= 0) out.push({ site, originalIndex: i, score: s });
        });

        out.sort((a, b) =>
            (b.score - a.score) || (a.originalIndex - b.originalIndex)
        );

        return out;
    }

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let displayed = [];   // [{ site, originalIndex, score }]
    let selectedIndex = 0;

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------
    /**
     * Updates the little pill next to the input.
     *   - No bookmarks at all      → hidden
     *   - Query empty (show all)   → "N"
     *   - Filtered                 → "N / M"
     */
    function updateCount(shown, total) {
        if (!countEl) return;

        if (total === 0) {
            countEl.classList.add("hidden");
            return;
        }

        countEl.classList.remove("hidden");
        countEl.textContent = shown === total
            ? String(total)
            : `${shown} / ${total}`;
    }

    function renderResults() {
        const items = filterSites(input.value);
        displayed = items;

        const total = window.ZSApp.state.sites.length;
        updateCount(items.length, total);

        if (items.length === 0) {
            selectedIndex = -1;
            resultsEl.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "bookmark-search-empty";
            empty.textContent = window.ZSApp.state.sites.length === 0
                ? "No bookmarks yet"
                : "No matches";
            resultsEl.appendChild(empty);
            return;
        }

        if (selectedIndex < 0 || selectedIndex >= items.length) selectedIndex = 0;

        const frag = document.createDocumentFragment();

        items.forEach((item, i) => {
            const site = item.site;
            const c = ZSCore.classifyInput(site.url);
            const navigable = c.kind === "navigable";

            const row = document.createElement("div");
            row.className = "bookmark-search-item"
                + (i === selectedIndex ? " selected" : "")
                + (navigable ? "" : " invalid");
            row.dataset.index = String(i);

            // ----- Icon -----
            const icon = document.createElement("div");
            icon.className = "icon";

            const useLetter = () => {
                icon.innerHTML = "";
                icon.style.background = ZSCore.getColorForName(site.name);
                const span = document.createElement("span");
                span.className = "letter";
                span.textContent = ZSCore.getFirstLetter(site.name);
                icon.appendChild(span);
            };

            const customData = window.ZSApp.loadSiteIcon(site.id);
            const isCustom = typeof customData === "string" && customData.startsWith("data:image");

            const img = document.createElement("img");
            img.alt = "";
            img.decoding = "async";
            img.onerror = useLetter;
            img.onload = () => {
                if (!isCustom && img.naturalWidth <= 16) useLetter();
            };

            const src = isCustom ? customData : ZSCore.getFaviconUrl(site.url);
            if (!src) useLetter();
            else img.src = src;
            icon.appendChild(img);

            if (!navigable) {
                const warn = document.createElement("div");
                warn.className = "bookmark-search-warning";
                warn.textContent = "!";
                icon.appendChild(warn);
            }

            // ----- Text -----
            const text = document.createElement("div");
            text.className = "text";

            const nameEl = document.createElement("div");
            nameEl.className = "name";
            nameEl.textContent = site.name;

            const urlEl = document.createElement("div");
            urlEl.className = "url";
            urlEl.textContent = hostnameOf(site.url) || site.url;

            text.appendChild(nameEl);
            text.appendChild(urlEl);

            row.appendChild(icon);
            row.appendChild(text);

            // ----- Interaction -----
            row.addEventListener("mousemove", () => {
                if (selectedIndex === i) return;
                selectedIndex = i;
                updateSelection(false);
            });

            row.addEventListener("click", (e) => {
                if (!navigable) return;
                const newTab = e.ctrlKey || e.metaKey;
                navigate(c.url, newTab);
            });

            row.addEventListener("mousedown", (e) => {
                if (e.button === 1) e.preventDefault();
            });

            row.addEventListener("auxclick", (e) => {
                if (e.button !== 1 || !navigable) return;
                e.preventDefault();
                navigate(c.url, true);
            });

            frag.appendChild(row);
        });

        resultsEl.replaceChildren(frag);
        scrollSelectedIntoView();
    }

    function updateSelection(scroll = true) {
        const rows = resultsEl.querySelectorAll(".bookmark-search-item");
        rows.forEach((r, i) => r.classList.toggle("selected", i === selectedIndex));
        if (scroll) scrollSelectedIntoView();
    }

    function scrollSelectedIntoView() {
        const rows = resultsEl.querySelectorAll(".bookmark-search-item");
        const el = rows[selectedIndex];
        if (el) el.scrollIntoView({ block: "nearest" });
    }

    // ---------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------
    function navigate(url, newTab) {
        if (newTab) window.open(url, "_blank");
        else window.location.href = url;
    }

    function openSelected(newTab) {
        if (selectedIndex < 0) return;
        const item = displayed[selectedIndex];
        if (!item) return;
        const c = ZSCore.classifyInput(item.site.url);
        if (c.kind !== "navigable") return;
        navigate(c.url, newTab);
    }

    // ---------------------------------------------------------------
    // Open / close
    // ---------------------------------------------------------------
    function openBookmarkSearch() {
        input.value = "";
        selectedIndex = 0;

        // Register with the modal manager first so the entry is on the
        // stack before any keyboard handler could fire.
        ZSCore.modal.open(overlay, closeBookmarkSearch);

        // Render after "open" so layout is live and scrollIntoView works.
        renderResults();

        requestAnimationFrame(() => {
            if (overlay.classList.contains("open")) {
                input.focus();
                input.select();
            }
        });
    }

    function closeBookmarkSearch() {
        // Idempotent — safe after Escape already popped us.
        ZSCore.modal.close(overlay);
        input.value = "";
        displayed = [];
        selectedIndex = 0;
    }

    // ---------------------------------------------------------------
    // Wiring
    // ---------------------------------------------------------------
    input.addEventListener("input", () => {
        selectedIndex = 0;
        renderResults();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (displayed.length === 0) return;
            selectedIndex = Math.min(selectedIndex + 1, displayed.length - 1);
            updateSelection();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (displayed.length === 0) return;
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection();
        } else if (e.key === "Enter") {
            e.preventDefault();
            openSelected(e.ctrlKey || e.metaKey);
        }
    });

    /**
     * Global Ctrl/Cmd+F handler.
     * Registered in CAPTURE phase so it beats the browser's native find
     * dialog, which cannot be suppressed from the bubble phase.
     *
     * Uses e.code === "KeyF" as a fallback when the active keyboard layout
     * doesn't produce a Latin "f" (Arabic, Cyrillic, ...) — mirrors the
     * Ctrl+S shortcut pattern in 80-core-events.js.
     */
    document.addEventListener("keydown", (e) => {
        const key = (e.key || "").toLowerCase();
        const isLatin = /^[a-z]$/.test(key);
        const isFKey = key === "f" || (!isLatin && e.code === "KeyF");

        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        if (!isFKey) return;

        e.preventDefault();
        e.stopPropagation();

        // Another modal (edit, confirm, export...) is on top: swallow the
        // shortcut so the browser's find bar doesn't appear, but don't stack
        // the search modal over it.
        if (!overlay.classList.contains("open") && ZSCore.modal.isAnyOpen()) return;

        if (overlay.classList.contains("open")) {
            // Already open → just pull focus back to the input.
            input.focus();
            input.select();
        } else {
            openBookmarkSearch();
        }
    }, true);

    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            if (overlay.classList.contains("open")) closeBookmarkSearch();
            else openBookmarkSearch();
        });
    }

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeBookmarkSearch();
    });

    return {
        openBookmarkSearch,
        closeBookmarkSearch,
    };
})());