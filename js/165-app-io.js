window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const exportOverlay = document.getElementById("exportOverlay");
    const importOverlay = document.getElementById("importOverlay");

    // ---------- Export modal ----------
    function openExportModal() {
        exportOverlay.classList.add("open");
    }

    function closeExportModal() {
        exportOverlay.classList.remove("open");
    }

    exportOverlay.querySelectorAll(".io-option").forEach(btn => {
        btn.addEventListener("click", async () => {
            const target = btn.dataset.target;
            closeExportModal();

            if (target === "device") {
                await window.ZSApp.exportToDevice();
            } else if (target === "drive") {
                await window.ZSApp.exportToDrive();
            } else if (target === "both") {
                await window.ZSApp.exportToDevice();
                await window.ZSApp.exportToDrive();
            }
        });
    });

    document.getElementById("exportCancel")
        .addEventListener("click", closeExportModal);
    exportOverlay.addEventListener("click", e => {
        if (e.target === exportOverlay) closeExportModal();
    });

    // ---------- Import modal ----------
    function openImportModal() {
        importOverlay.classList.add("open");
    }

    function closeImportModal() {
        importOverlay.classList.remove("open");
    }

    importOverlay.querySelectorAll(".io-option").forEach(btn => {
        btn.addEventListener("click", async () => {
            const source = btn.dataset.source;
            closeImportModal();

            if (source === "device") {
                window.ZSApp.importFromDevice();
            } else if (source === "drive") {
                await window.ZSApp.importFromDrive();
            }
        });
    });

    document.getElementById("importCancel")
        .addEventListener("click", closeImportModal);
    importOverlay.addEventListener("click", e => {
        if (e.target === importOverlay) closeImportModal();
    });

    // ---------- Escape to close ----------
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (exportOverlay.classList.contains("open")) closeExportModal();
        if (importOverlay.classList.contains("open")) closeImportModal();
    });

    return {
        openExportModal,
        closeExportModal,
        openImportModal,
        closeImportModal,
    };
})());