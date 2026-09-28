window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Default accent color. Single source of truth — used by defaultState
     * and the "Sunset" theme entry.
     *
     * styles/20-variables.css has a matching fallback for the cold-start
     * case (before any JS runs) that CANNOT reference this constant —
     * keep them in sync manually. If you change this, also change
     * `--accent-rgb` in that file.
     */
    const DEFAULT_ACCENT = "#e8a33d";

    /**
     * Grid dimension limits and defaults.
     * Single source of truth — used by loadState(), applyBackup(), and the
     * rows/cols input handlers in 150-app-settings.js.
     */
    const GRID_LIMITS = {
        min: 1,
        max: 20,
        defaultRows: 4,
        defaultCols: 6,
    };

    /**
     * Parses and clamps a grid dimension value.
     * Returns `fallback` if the input can't be parsed as a number.
     */
    function clampGridDim(value, fallback) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(GRID_LIMITS.min, Math.min(GRID_LIMITS.max, n));
    }

    /**
     * Default state
     */
    const defaultState = {
        settings: {
            name: "",
            rows: 4,
            cols: 6,
            engine: "https://www.google.com/search?q=",
            accent: DEFAULT_ACCENT,
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

    /**
     * Preset accent colors shown in the settings panel.
     */
    const THEMES = [
        { name: "Red",       accent: "#e5484d" },
        { name: "Wine",      accent: "#a83250" },
        { name: "Coral",     accent: "#f4776d" },
        { name: "Orange",    accent: "#f76b15" },
        { name: "Peach",     accent: "#f5a97f" },
        { name: "Sunset",    accent: DEFAULT_ACCENT },
        { name: "Amber",     accent: "#ffc53d" },
        { name: "Yellow",    accent: "#ffe629" },
        { name: "Lime",      accent: "#bde56c" },

        { name: "Green",     accent: "#30a46c" },
        { name: "Forest",    accent: "#2f7d4f" },
        { name: "Mint",      accent: "#86ead4" },
        { name: "Teal",      accent: "#12a594" },
        { name: "Cyan",      accent: "#00a2c7" },
        { name: "Sky",       accent: "#7ce2fe" },
        { name: "Blue",      accent: "#0090ff" },
        { name: "Navy",      accent: "#2f4bb5" },
        { name: "Indigo",    accent: "#3e63dd" },

        { name: "Violet",    accent: "#6e56cf" },
        { name: "Lavender",  accent: "#b9a7ef" },
        { name: "Purple",    accent: "#8e4ec6" },
        { name: "Pink",      accent: "#d6409f" },
        { name: "Rose",      accent: "#f2a0b5" },
        { name: "Brown",     accent: "#ad7f58" },
        { name: "Gold",      accent: "#978365" },
        { name: "Slate",     accent: "#8b8d98" },
        { name: "Snow",      accent: "#f0f0f0" },
    ];

    /**
     * Search engines shown in the search bar dropdown.
     * Grouped with <optgroup> for readability — a flat list this long would be a wall.
     * `url` is the prefix; the query is appended (encodeURIComponent) at submit time.
     */
    const SEARCH_ENGINES = [
        // ── General ─────────────────────────────────────────
        { group: "General",         name: "Google",           url: "https://www.google.com/search?q=" },
        { group: "General",         name: "DuckDuckGo",       url: "https://duckduckgo.com/?q=" },
        { group: "General",         name: "Bing",             url: "https://www.bing.com/search?q=" },
        { group: "General",         name: "Brave",            url: "https://search.brave.com/search?q=" },
        { group: "General",         name: "Yahoo",            url: "https://search.yahoo.com/search?p=" },
        { group: "General",         name: "Ecosia",           url: "https://www.ecosia.org/search?q=" },
        { group: "General",         name: "Startpage",        url: "https://www.startpage.com/sp/search?query=" },
        { group: "General",         name: "Qwant",            url: "https://www.qwant.com/?q=" },
        { group: "General",         name: "Mojeek",           url: "https://www.mojeek.com/search?q=" },
        { group: "General",         name: "Yandex",           url: "https://yandex.com/search/?text=" },

        // ── AI ──────────────────────────────────────────────
        { group: "AI",              name: "ChatGPT",          url: "https://chatgpt.com/?q=" },
        { group: "AI",              name: "Claude",           url: "https://claude.ai/new?q=" },
        { group: "AI",              name: "Perplexity",       url: "https://www.perplexity.ai/search?q=" },
        { group: "AI",              name: "Gemini",           url: "https://gemini.google.com/app?q=" },
        { group: "AI",              name: "Copilot",          url: "https://copilot.microsoft.com/?q=" },

        // ── Google Tools ────────────────────────────────────
        { group: "Google Tools", name: "Google Images",  url: "https://www.google.com/search?tbm=isch&q=" },
        { group: "Google Tools", name: "Google Maps",    url: "https://www.google.com/maps/search/" },
        { group: "Google Tools", name: "Google News",    url: "https://news.google.com/search?q=" },
        { group: "Google Tools", name: "Google Scholar", url: "https://scholar.google.com/scholar?q=" },
        { group: "Google Tools", name: "Google Videos",  url: "https://www.google.com/search?tbm=vid&q=" },

        // ── Developer ───────────────────────────────────────
        { group: "Developer",       name: "GitHub",           url: "https://github.com/search?q=" },
        { group: "Developer",       name: "GitLab",           url: "https://gitlab.com/search?search=" },
        { group: "Developer",       name: "Stack Overflow",   url: "https://stackoverflow.com/search?q=" },
        { group: "Developer",       name: "MDN",              url: "https://developer.mozilla.org/en-US/search?q=" },
        { group: "Developer",       name: "DevDocs",          url: "https://devdocs.io/#q=" },
        { group: "Developer",       name: "Can I use",        url: "https://caniuse.com/?search=" },
        { group: "Developer",       name: "npm",              url: "https://www.npmjs.com/search?q=" },
        { group: "Developer",       name: "PyPI",             url: "https://pypi.org/search/?q=" },
        { group: "Developer",       name: "crates.io",        url: "https://crates.io/search?q=" },
        { group: "Developer",       name: "Packagist",        url: "https://packagist.org/search/?q=" },
        { group: "Developer",       name: "Docker Hub",       url: "https://hub.docker.com/search?q=" },

        // ── Reference ───────────────────────────────────────
        { group: "Reference",       name: "Wikipedia",        url: "https://en.wikipedia.org/w/index.php?search=" },
        { group: "Reference",       name: "Wiktionary",       url: "https://en.wiktionary.org/w/index.php?search=" },
        { group: "Reference",       name: "Wolfram Alpha",    url: "https://www.wolframalpha.com/input?i=" },
        { group: "Reference",       name: "Internet Archive", url: "https://archive.org/search?query=" },
        { group: "Reference",       name: "arXiv",            url: "https://arxiv.org/search/?query=" },

        // ── Quran & Islamic ─────────────────────────────────
        { group: "Quran & Islamic", name: "Quran.com",        url: "https://quran.com/search?query=" },
        { group: "Quran & Islamic", name: "Tafsir.app",       url: "https://tafsir.app/search?q=" },
        { group: "Quran & Islamic", name: "Sunnah.com",       url: "https://sunnah.com/search?q=" },

        // ── Media ───────────────────────────────────────────
        { group: "Media",           name: "YouTube",          url: "https://www.youtube.com/results?search_query=" },
        { group: "Media",           name: "Vimeo",            url: "https://vimeo.com/search?q=" },

        // ── Social ──────────────────────────────────────────
        { group: "Social",          name: "Reddit",           url: "https://www.reddit.com/search/?q=" },
        { group: "Social",          name: "Hacker News",      url: "https://hn.algolia.com/?q=" },
        { group: "Social",          name: "X (Twitter)",      url: "https://x.com/search?q=" },
        { group: "Social",          name: "LinkedIn",         url: "https://www.linkedin.com/search/results/all/?keywords=" },
        { group: "Social",          name: "Pinterest",        url: "https://www.pinterest.com/search/pins/?q=" },

        // ── Shopping ────────────────────────────────────────
        { group: "Shopping",        name: "Amazon",           url: "https://www.amazon.com/s?k=" },
        { group: "Shopping",        name: "eBay",             url: "https://www.ebay.com/sch/i.html?_nkw=" },
        { group: "Shopping",        name: "AliExpress",       url: "https://www.aliexpress.com/wholesale?SearchText=" },
        { group: "Shopping",        name: "Etsy",             url: "https://www.etsy.com/search?q=" },
    ];

    return {
        defaultState,
        THEMES,
        SEARCH_ENGINES,
        GRID_LIMITS,
        clampGridDim,
        DEFAULT_ACCENT
    }
})());