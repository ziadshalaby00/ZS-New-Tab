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
     * Updates a specific setting in the state, saves it, and triggers a UI update.
     */
    function applySetting(field, value, isName = false) {
        window.ZSApp.state.settings[field] = value;
        window.ZSApp.saveState();
        if (isName) window.ZSApp.renderName();
        else window.ZSApp.renderWithTransition({ type: 'layout' });
    }

    document.getElementById("displayName").addEventListener("input", e => 
        applySetting("name", e.target.value, true)
    );
    document.getElementById("rowsInput").addEventListener("change", e => {
        e.target.value = Math.max(1, Math.min(20, parseInt(e.target.value) || 4));
        applySetting("rows", e.target.value);
    });
    document.getElementById("colsInput").addEventListener("change", e => {
        e.target.value = Math.max(1, Math.min(20, parseInt(e.target.value) || 6));
        applySetting("cols", e.target.value);
    });
    document.getElementById("engineSelect").addEventListener("change", e => {
        window.ZSApp.state.settings.engine = e.target.value;
        window.ZSApp.saveState();
    });
    document.getElementById("customAccent").addEventListener("input", e => 
        window.ZSApp.setAccent(e.target.value)
    );

    const bgImageInput = document.getElementById("bgImageInput");
    const removeBgBtn = document.getElementById("removeBgBtn");
    let bgBusy = false;

    function setBgBusy(busy) {
        bgBusy = true && busy;
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
            alert("Could not save background image.");
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