window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore, ZSDB } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");
    if (!ZSDB) return console.error("ZSDB is missing.");

    /**
     * Builds the full backup object (settings + sites + icons + background).
     */
    async function buildBackup() {
        const bgBlob = await ZSDB.getBackground();
        const bgDataUrl = bgBlob ? await ZSCore.blobToDataURL(bgBlob) : null;
        const state = window.ZSApp.state;

        return {
            settings: { ...state.settings, bg: bgDataUrl },
            sites: state.sites.map(site => {
                const copy = { ...site };
                const iconData = window.ZSApp.loadSiteIcon(site.id);
                if (iconData) copy.iconData = iconData;
                return copy;
            }),
        };
    }

    /**
     * Exports the backup to the user's device as a .json download.
     */
    async function exportToDevice() {
        const { ZSProgress } = window;
        ZSProgress.start("Preparing backup…");

        try {
            ZSProgress.set(15, "Collecting data…");
            const backup = await buildBackup();

            ZSProgress.set(55, "Building file…");
            const blob = new Blob(
                [JSON.stringify(backup, null, 2)],
                { type: "application/json" }
            );

            ZSProgress.set(85, "Saving to device…");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `zs-new-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();

            ZSProgress.done("Saved to device");
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error("Export to device failed", err);
            ZSProgress.fail("Export failed");
        }
    }

    /**
     * Exports the backup to Google Drive.
     * Delegates to ZSDrive.backupToDrive() which handles search,
     * create-vs-update, retries, and progress reporting.
     */
    async function exportToDrive() {
        return window.ZSDrive.backupToDrive();
    }

    /**
     * Opens the file picker for importing from the user's device.
     */
    function importFromDevice() {
        document.getElementById("importFile").click();
    }

    /**
     * Imports the backup from Google Drive.
     */
    let driveImporting = false;

    function blockUnloadIfImporting(e) {
        if (driveImporting) {
            e.preventDefault();
            e.returnValue = "";
        }
    }

    async function importFromDrive() {
        const { ZSProgress, ZSCore } = window;
        ZSProgress.start("Connecting to Google Drive...");

        driveImporting = true;
        window.addEventListener("beforeunload", blockUnloadIfImporting);

        try {
            // 1. Auth
            const token = await window.ZSDrive.ensureDriveToken();
            ZSProgress.set(20, "Searching for backup...");

            // 2. Find the file
            const file = await window.ZSDrive.findExistingBackupFile(token);
            if (!file) {
                ZSProgress.fail("No backup found");
                ZSCore.showAlert(
                    "No backup file was found on your Google Drive. Please export one first.",
                    { title: "Import from Drive" }
                );
                return;
            }

            // 3. Download the file content
            ZSProgress.set(50, "Downloading backup...");
            const fileContent = await window.ZSDrive.downloadFromDrive(token, file.id);

            // 4. Parse JSON
            ZSProgress.set(75, "Parsing backup...");
            let parsed;
            try {
                parsed = JSON.parse(fileContent);
            } catch (e) {
                throw new Error("INVALID_JSON");
            }

            // 5. Apply the backup.
            //    applyBackup() shows a confirmation dialog first, then
            //    applies the data only if the user accepts. We split the
            //    progress reporting into two distinct labels so the user
            //    understands that the bar is waiting on THEM, not on
            //    network or disk I/O.
            ZSProgress.set(85, "Waiting for confirmation…");
            const applied = await applyBackup(parsed);

            if (!applied) {
                // User cancelled — no success, no failure, just go away.
                ZSProgress.hide();
                return;
            }

            // The dialog is gone and the backup has been applied.
            // (If the backup was rejected or cancelled, applyBackup() returned
            //  false — we handled that above. If it failed validation, applyBackup()
            //  already showed its own "Import failed" alert and also returned false.)
            ZSProgress.done("Imported from Drive");
        } catch (err) {
            console.error("Import from Drive failed:", err);
            
            let msg = "Failed to import from Drive.";
            if (err.message === "DRIVE_REAUTH_NEEDED") {
                msg = "Drive sign-in was cancelled or denied.";
            } else if (err.message === "FETCH_TIMEOUT") {
                msg = "Import timed out. Please check your internet connection.";
            } else if (err.message === "INVALID_JSON") {
                msg = "The backup file on Drive is corrupted or invalid.";
            } else if (err.status === 401) {
                msg = "Your Drive session expired. Please try again.";
                // Forget the cached token so the next attempt triggers a
                // fresh OAuth flow instead of reusing the dead one —
                // otherwise the user gets stuck in a 401 → retry → 401
                // loop until they restart the browser.
                window.ZSDrive.clearToken();
            }

            ZSProgress.fail("Import failed");
            ZSCore.showAlert(msg, { title: "Import from Drive" });
        } finally {
            driveImporting = false;
            window.removeEventListener("beforeunload", blockUnloadIfImporting);
        }
    }

    /**
     * Applies a parsed backup object to state (shared by device + drive import).
     *
     * Flow:
     *   1. Validate the payload shape.  No mutation, no snapshot.
     *   2. Confirm with the user.      No mutation, no snapshot.
     *   3. Snapshot state + storage    Only now, because we're about to mutate.
     *   4. Mutate.                     Wrapped in try/catch.
     *   5. Roll back on any failure.   Restores state, localStorage, background.
     */
    async function applyBackup(parsed) {
        // ── 1. Validate ──────────────────────────────────────────
        // Nothing has been read or mutated yet, so there's nothing to roll
        // back — the user just gets the alert and we return. No snapshot, no
        // background read, no restore.
        if (!parsed || !parsed.sites || !parsed.settings || !Array.isArray(parsed.sites)) {
            ZSCore.showAlert(
                "This file doesn't look like a valid backup, or it's too large.",
                { title: "Import failed" }
            );
            return false;
        }

        // ── 2. Confirm ───────────────────────────────────────────
        // Still no state touched. A cancel here also needs no rollback.
        const confirmed = await ZSCore.showConfirm(
            "Current data will be lost when you import this file.",
            { title: "Import backup", confirmLabel: "Import", cancelLabel: "Cancel" }
        );
        if (!confirmed) return false;

        // ── 3. Snapshot ──────────────────────────────────────────
        // Only now — when we're actually about to mutate — is the snapshot
        // work worth doing.
        const previousState = window.ZSApp.state;
        const previousBgBlob = await ZSDB.getBackground();

        // Snapshot every ZSNewTab.* key before clearLocalStorageData() wipes
        // them. Without this, a failure later in the flow restores in-memory
        // state and the background, but leaves the storage empty — so the next
        // reload silently resets everything to the defaults, with no way for
        // the user to recover (the alert they saw said "Import failed", not
        // "your data is gone").
        const storageSnapshot = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("ZSNewTab.")) {
                storageSnapshot[key] = localStorage.getItem(key);
            }
        }

        const restoreLocalStorage = () => {
            // The icon cache is a read-through cache, and saveSiteIcon() populated
            // it for the icons that were written before the failure. Those entries
            // now describe localStorage keys we're about to delete — clear the
            // cache so the next loadSiteIcon() falls through to the restored keys
            // instead of returning an imported icon for a site that was rolled back.
            window.ZSApp.iconCache.clear();

            // Drop every ZSNewTab.* key that exists now (a partial import may
            // have written some before failing), then write the snapshot back.
            // Removing all of them first guarantees we have at least as much
            // room as the snapshot needed when it was captured, so the restore
            // itself can't hit the quota.
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("ZSNewTab.")) toRemove.push(key);
            }
            toRemove.forEach(k => localStorage.removeItem(k));
            for (const [k, v] of Object.entries(storageSnapshot)) {
                localStorage.setItem(k, v);
            }
        };

        // ── 4. Mutate ────────────────────────────────────────────
        try {
            const { bg, ...settingsOnly } = parsed.settings;

            const importedSettings = {
                name:   settingsOnly.name ?? "",
                rows:   ZSCore.clampGridDim(settingsOnly.rows, ZSCore.GRID_LIMITS.defaultRows),
                cols:   ZSCore.clampGridDim(settingsOnly.cols, ZSCore.GRID_LIMITS.defaultCols),
                engine: settingsOnly.engine ?? "https://www.google.com/search?q=",
                accent: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(settingsOnly.accent || "")
                            ? settingsOnly.accent
                            : ZSCore.defaultState.settings.accent,
            };

            const importedSites = parsed.sites.map(site => ({
                id: site.id, name: site.name, url: site.url
            }));

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

            // saveState() returns false (doesn't throw) on quota. Throw a
            // sentinel so the catch block can tell this apart from the
            // validation errors that still need their own alert.
            if (!window.ZSApp.saveState()) {
                throw new Error("STORAGE_FULL");
            }

            window.ZSApp.currentPage = 0;
            window.ZSApp.renderWithTransition({ type: "fade" });
            window.ZSApp.panel.classList.remove("open");

            return true;

        // ── 5. Roll back ─────────────────────────────────────────
        // The catch is now only reachable from actual mutations — no "did we
        // touch anything?" ambiguity.
        } catch (err) {
            console.error("Import failed", err);
            window.ZSApp.state = previousState;

            // Restore localStorage first — before the background rollback —
            // so a slow or failing IndexedDB write can't leave the user with
            // the previous background but no sites/settings.
            try {
                restoreLocalStorage();
            } catch (e) {
                console.error("Failed to restore localStorage during import rollback", e);
            }

            try {
                if (previousBgBlob) await ZSDB.setBackground(previousBgBlob);
                else await ZSDB.removeBackground();
            } catch (_) {}

            // Route the alert based on failure kind:
            //   - Quota (thrown by saveSiteIcon, or our STORAGE_FULL sentinel):
            //     notifyStorageFull() — suppressed by the flag if saveState()
            //     already showed an alert, so the user sees exactly one.
            //   - Anything else (IndexedDB, dataURLToBlob, etc.): the usual
            //     "invalid backup" wording.
            if (err.name === "QuotaExceededError" || err.message === "STORAGE_FULL") {
                window.ZSApp.notifyStorageFull(
                    "Import failed — local storage is full."
                );
            } else {
                ZSCore.showAlert(
                    "This file doesn't look like a valid backup, or it's too large.",
                    { title: "Import failed" }
                );
            }

            return false;
        }
    }

    // ---------- File input (device import) ----------
    document.getElementById("importFile").addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;

        const { ZSProgress, ZSCore } = window;
        ZSProgress.start("Reading file…");

        const reader = new FileReader();

        reader.onload = async ev => {
            let parsed;
            try {
                ZSProgress.set(30, "Parsing backup…");
                parsed = JSON.parse(ev.target.result);
            } catch (_) {
                // JSON.parse failed BEFORE applyBackup runs — the old
                // code silently swallowed this and the user saw nothing.
                ZSProgress.fail("Import failed");
                ZSCore.showAlert(
                    "This file doesn't look like a valid backup.",
                    { title: "Import failed" }
                );
                return;
            }

            ZSProgress.set(70, "Waiting for confirmation…");
            const applied = await applyBackup(parsed);

            if (!applied) {
                // Cancelled OR failed — either way, applyBackup already
                // showed its own alert on failure, and cancel needs no
                // feedback. Just make the bar go away.
                ZSProgress.hide();
                return;
            }

            ZSProgress.done("Imported from device");
        };

        reader.onerror = () => {
            ZSProgress.fail("Import failed");
            ZSCore.showAlert("Could not read the file.", { title: "Import failed" });
        };

        reader.readAsText(file);
        e.target.value = "";
    });

    // ---------- Side-panel buttons → open modals ----------
    document.getElementById("exportBtn").addEventListener("click", () => {
        window.ZSApp.openExportModal();
    });

    document.getElementById("importBtn").addEventListener("click", () => {
        window.ZSApp.openImportModal();
    });

    // ---------- Reset (unchanged) ----------
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
                window.ZSApp.renderWithTransition({ type: "fade" });
                window.ZSApp.panel.classList.remove("open");
            } catch (err) {
                ZSCore.showAlert("Could not reset the application.", { title: "Reset failed" });
            }
        }
    });

    return {
        buildBackup,
        applyBackup,
        exportToDevice,
        exportToDrive,
        importFromDevice,
        importFromDrive,
    };
})());