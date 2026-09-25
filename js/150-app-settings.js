window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore, ZSDB } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const panel = document.getElementById("panel");

    function openSettingsPanel() {
        document.getElementById("displayName").value = window.ZSApp.state.settings.name;
        document.getElementById("rowsInput").value = window.ZSApp.state.settings.rows;
        document.getElementById("colsInput").value = window.ZSApp.state.settings.cols;
        window.ZSApp.renderSwatches();
        panel.classList.toggle("open");
    }
    document.getElementById("settingsToggle").addEventListener("click", openSettingsPanel);
    document.getElementById("panelClose").addEventListener("click", () => panel.classList.remove("open"));

    /**
     * Push GRID_LIMITS into the rows/cols inputs so the HTML doesn't have to
     * hardcode min/max. Keeps the JS constants as the single source of truth.
     */
    (function applyGridLimitsToInputs() {
        const { min, max, defaultRows, defaultCols } = ZSCore.GRID_LIMITS;

        const rowsInput = document.getElementById("rowsInput");
        const colsInput = document.getElementById("colsInput");

        rowsInput.min = min;
        rowsInput.max = max;
        rowsInput.placeholder = defaultRows;

        colsInput.min = min;
        colsInput.max = max;
        colsInput.placeholder = defaultCols;
    })();

    /**
     * Updates a specific setting in the state, saves it, and triggers a UI update.
     * On save failure (quota), restores the previous value in both memory and
     * (when provided) the source input, so the panel never shows a setting
     * that isn't actually persisted.
     *
     * @param {string} field
     * @param {*} value
     * @param {boolean} [isName=false]
     * @param {HTMLElement} [inputEl=null]  The input that triggered this change.
     */
    function applySetting(field, value, isName = false, inputEl = null) {
        const previous = window.ZSApp.state.settings[field];
        window.ZSApp.state.settings[field] = value;

        if (!window.ZSApp.saveState()) {
            // saveState() already showed its own "storage full" alert.
            window.ZSApp.state.settings[field] = previous;
            if (inputEl) inputEl.value = previous;
            return;
        }

        if (isName) window.ZSApp.renderName();
        else window.ZSApp.renderWithTransition({ type: 'layout' });
    }

    document.getElementById("displayName").addEventListener("input", e =>
        applySetting("name", e.target.value, true, e.target)
    );
    document.getElementById("rowsInput").addEventListener("change", e => {
        const rows = ZSCore.clampGridDim(e.target.value, ZSCore.GRID_LIMITS.defaultRows);
        e.target.value = rows;
        applySetting("rows", rows, false, e.target);
    });
    document.getElementById("colsInput").addEventListener("change", e => {
        const cols = ZSCore.clampGridDim(e.target.value, ZSCore.GRID_LIMITS.defaultCols);
        e.target.value = cols;
        applySetting("cols", cols, false, e.target);
    });
    // Engine change doesn't re-render the grid — it's just a stored URL.
    // Handle it inline instead of through applySetting so we don't trigger
    // a layout animation on every engine switch.
    document.getElementById("engineSelect").addEventListener("change", e => {
        const previous = window.ZSApp.state.settings.engine;
        window.ZSApp.state.settings.engine = e.target.value;
        if (!window.ZSApp.saveState()) {
            window.ZSApp.state.settings.engine = previous;
            e.target.value = previous;
        }
    });
    document.getElementById("customAccent").addEventListener("input", e => 
        window.ZSApp.setAccent(e.target.value)
    );

    const bgImageInput = document.getElementById("bgImageInput");
    const removeBgBtn = document.getElementById("removeBgBtn");
    let bgBusy = false;

    function setBgBusy(busy) {
        bgBusy = busy;
        bgImageInput.disabled = busy;
        removeBgBtn.disabled = busy;
        document.getElementById("panel").classList.toggle("bg-busy", busy);
    }

    bgImageInput.addEventListener("change", async e => {
        if (bgBusy) { e.target.value = ""; return; }
        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        setBgBusy(true);
        try {
            const resizedBlob = await ZSCore.resizeImage(file, "bg");
            await ZSDB.setBackground(resizedBlob);
        } catch (err) {
            ZSCore.showAlert("Could not save background image.", { title: "Background error" });
        } finally {
            setBgBusy(false);
            e.target.value = "";
        }
    });

    removeBgBtn.addEventListener("click", async () => {
        if (bgBusy) return;
        const ok = await ZSCore.showConfirm(
            "This will delete the saved background. You can't undo this.",
            { title: "Remove background", confirmLabel: "Remove", cancelLabel: "Keep" }
        );
        if (!ok) return;
        setBgBusy(true);
        try {
            await ZSDB.removeBackground();
            bgImageInput.value = "";
        } catch (err) {
            console.error("Failed to remove background", err);
        } finally {
            setBgBusy(false);
        }
    });

    return { 
        panel, 
        openSettingsPanel, 
        applySetting 
    };
})());