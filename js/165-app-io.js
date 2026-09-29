window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const exportOverlay = document.getElementById("exportOverlay");
    const importOverlay = document.getElementById("importOverlay");

    // ---------- Export modal ----------
    function openExportModal() {
        ZSCore.modal.open(exportOverlay, closeExportModal);
    }

    function closeExportModal() {
        ZSCore.modal.close(exportOverlay);
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
        ZSCore.modal.open(importOverlay, closeImportModal);
    }

    function closeImportModal() {
        ZSCore.modal.close(importOverlay);
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

    return {
        openExportModal,
        closeExportModal,
        openImportModal,
        closeImportModal,
    };
})());