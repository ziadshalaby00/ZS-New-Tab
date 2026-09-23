window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore, ZSDB } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");
    if (!ZSDB) return console.error("ZSDB is missing.");

    document.getElementById("exportBtn").addEventListener("click", async () => {
        const btn = document.getElementById("exportBtn");
        if (btn.disabled) return;
        btn.disabled = true;
        try {
            const bgBlob = await ZSDB.getBackground();
            const bgDataUrl = bgBlob ? await ZSCore.blobToDataURL(bgBlob) : null;
            const state = window.ZSApp.state;
            const backup = {
                settings: { ...state.settings, bg: bgDataUrl },
                sites: state.sites.map(site => {
                    const copy = { ...site };
                    const iconData = window.ZSApp.loadSiteIcon(site.id);
                    if (iconData) copy.iconData = iconData;
                    return copy;
                }),
            };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `zs-new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error("Export failed", err);
            ZSCore.showAlert("Could not create backup.", { title: "Export failed" });
        } finally {
            document.getElementById("exportBtn").disabled = false;
        }
    });

    document.getElementById("importBtn").addEventListener("click", () =>
        document.getElementById("importFile").click()
    );

    document.getElementById("importFile").addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();

        reader.onload = async ev => {
            const previousState = window.ZSApp.state;
            const previousBgBlob = await ZSDB.getBackground();
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed || !parsed.sites || !parsed.settings || !Array.isArray(parsed.sites)) {
                    throw new Error("Invalid backup format");
                }
                if (!(await ZSCore.showConfirm(
                    "Current data will be lost when you import this file.",
                    { title: "Import backup", confirmLabel: "Import", cancelLabel: "Cancel" }
                ))) return;

                const { bg, ...settingsOnly } = parsed.settings;
                const importedSettings = {
                    name:   settingsOnly.name   ?? "",
                    rows:   Math.max(1, Math.min(20, parseInt(settingsOnly.rows, 10) || 4)),
                    cols:   Math.max(1, Math.min(20, parseInt(settingsOnly.cols, 10) || 6)),
                    engine: settingsOnly.engine ?? "https://www.google.com/search?q=",
                    accent: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(settingsOnly.accent || "")
                                ? settingsOnly.accent : ZSCore.defaultState.settings.accent,
                };
                const importedSites = parsed.sites.map(site => ({ id: site.id, name: site.name, url: site.url }));

                if (typeof bg === "string" && bg.startsWith("data:image")) {
                    await ZSDB.setBackground(ZSCore.dataURLToBlob(bg));
                } else {
                    await ZSDB.removeBackground();
                }

                window.ZSApp.state = { settings: importedSettings, sites: importedSites };
                window.ZSApp.clearLocalStorageData();

                for (const site of parsed.sites) {
                    if (typeof site.iconData === "string" && site.iconData.startsWith("data:image")) {
                        window.ZSApp.saveSiteIcon(site.id, site.iconData);
                    }
                }

                window.ZSApp.saveState();
                window.ZSApp.currentPage = 0;
                window.ZSApp.renderWithTransition({ type: 'fade' });
                window.ZSApp.panel.classList.remove("open");
            } catch (err) {
                console.error("Import failed", err);
                window.ZSApp.state = previousState;
                try {
                    if (previousBgBlob) await ZSDB.setBackground(previousBgBlob);
                    else await ZSDB.removeBackground();
                } catch (_) {}
                ZSCore.showAlert(
                    "This file doesn't look like a valid backup, or it's too large.",
                    { title: "Import failed" }
                );
            }
        };

        reader.readAsText(file);
        e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        if (await ZSCore.showConfirm(
            "This removes all your sites, settings and background. Continue?",
            { title: "Reset everything", confirmLabel: "Reset", cancelLabel: "Cancel" }
        )) {
            try {
                window.ZSApp.clearLocalStorageData();
                await ZSDB.removeBackground();
                window.ZSApp.state = JSON.parse(JSON.stringify(ZSCore.defaultState));
                window.ZSApp.currentPage = 0;
                window.ZSApp.saveState();
                window.ZSApp.renderWithTransition({ type: 'fade' });
                window.ZSApp.panel.classList.remove("open");
            } catch (err) {
                ZSCore.showAlert("Could not reset the application.", { title: "Reset failed" });
            }
        }
    });

    return {};
})());