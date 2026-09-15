window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    /**
     * Renders the preset swatches and marks the active one.
     */
    function renderSwatches() {
        const wrap = document.getElementById("swatches");
        if (!wrap) return;

        const normalize = (hex) => {
            let h = String(hex || "").trim().replace(/^#/, "").toLowerCase();
            if (h.length === 3) h = h.split("").map(c => c + c).join("");
            return /^[0-9a-f]{6}$/.test(h) ? "#" + h : "";
        };

        const current = normalize(window.ZSApp.state.settings.accent);
        const picker = document.getElementById("customAccent");
        if (picker && current) picker.value = current;

        if (!wrap.dataset.built) {
            wrap.innerHTML = "";
            ZSCore.THEMES.forEach(theme => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "swatch";
                btn.style.background = theme.accent;
                btn.title = theme.name;
                btn.setAttribute("aria-label", theme.name);
                btn.dataset.accent = normalize(theme.accent);
                btn.addEventListener("click", () => setAccent(theme.accent));
                wrap.appendChild(btn);
            });
            wrap.dataset.built = "1";
        }

        wrap.querySelectorAll(".swatch").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.accent === current);
        });
    }

    /**
     * Applies + persists a new accent color and syncs the whole palette UI.
     */
    function setAccent(hex) {
        if (!ZSCore.applyAccent(hex)) return;
        window.ZSApp.state.settings.accent = hex;
        window.ZSApp.saveState();
        renderSwatches();
    }

    return {
        renderSwatches, 
        setAccent 
    };
})());