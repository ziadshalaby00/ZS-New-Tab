/**
 * ZS New Tab – Google Drive sync layer
 * Handles upload / search / dedupe / download for the backup file.
 *
 * Depends on (at CALL time, not load time):
 *   - ZSDrive    (105-app-drive-auth.js)  → getAccessToken()
 *   - ZSApp      (160-app-backup.js)      → buildBackup()
 *   - ZSProgress (166-app-progress.js)    → progress bar
 *
 * Load-order note:
 *   This file is loaded BEFORE 160-app-backup.js and 166-app-progress.js
 *   in index.html. That's fine because every reference to ZSApp and
 *   ZSProgress happens inside functions that run later, never at module
 *   initialization time. Do not move any of those references to the top
 *   level — that would cause a "cannot read property of undefined" error.
 *
 * Design principle (inspired by Gem):
 *   The locally cached fileId is NEVER trusted as authoritative.
 *   Always search Drive first; fall back to the local ID only when the
 *   search itself fails. This prevents duplicate files across devices.
 */
window.registerModule("ZSDrive", (function () {
    "use strict";

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const DRIVE_FILE_NAME   = "zs-new-tab-backup.json";
    const DRIVE_FILE_ID_KEY = "ZSNewTab.drive.fileId";

    // Default timeout for auth, search, and download — small responses.
    const FETCH_TIMEOUT_MS = 20000;

    // Upload timeout scales with the payload. A 20s fixed timeout fails on
    // slow connections as soon as the backup contains a real background
    // image (150 KB – 5 MB), which is the common case.
    const UPLOAD_TIMEOUT_BASE_MS = 20000;
    const UPLOAD_TIMEOUT_PER_500KB_MS = 5000;
    const UPLOAD_TIMEOUT_MAX_MS = 90000;

    function getUploadTimeoutMs(payloadBytes) {
        const extra = Math.floor(payloadBytes / (500 * 1024)) * UPLOAD_TIMEOUT_PER_500KB_MS;
        return Math.min(UPLOAD_TIMEOUT_BASE_MS + extra, UPLOAD_TIMEOUT_MAX_MS);
    }

    // =============================================
    //  2. RUNTIME STATE
    // =============================================
    let pendingBackupRequest = null;
    let driveUploading = false;

    // =============================================
    //  3. HELPERS
    // =============================================

    /**
     * fetch() wrapper with an AbortController timeout.
     * Throws Error("FETCH_TIMEOUT") on timeout so callers can distinguish
     * it from real network errors.
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (e) {
            if (e.name === "AbortError") {
                const err = new Error("FETCH_TIMEOUT");
                err.status = 0;
                throw err;
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Returns a valid access token via the auth layer.
     * Normalizes AUTH_CANCELLED into DRIVE_REAUTH_NEEDED so the caller
     * can tell "user said no" apart from "network blew up".
     */
    async function ensureDriveToken() {
        try {
            return await window.ZSDrive.getAccessToken();
        } catch (err) {
            if (err.message === "AUTH_CANCELLED") {
                throw new Error("DRIVE_REAUTH_NEEDED");
            }
            throw err;
        }
    }

    // =============================================
    //  4. DRIVE REST
    // =============================================

    /**
     * Multipart upload: metadata + content in one request.
     *   - fileId provided → PATCH (update existing)
     *   - fileId null     → POST  (create new)
     */
    async function uploadToDrive(token, fileId, jsonData) {
        const boundary = "zs_backup_boundary";

        const metadata = fileId
            ? {}
            : { name: DRIVE_FILE_NAME, mimeType: "application/json" };

        const body =
            `--${boundary}\r\n` +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) +
            `\r\n--${boundary}\r\n` +
            "Content-Type: application/json\r\n\r\n" +
            JSON.stringify(jsonData, null, 2) +
            `\r\n--${boundary}--`;

        // Scale the timeout to the actual upload size. Blob().size gives the
        // UTF-8 byte length, which matches what the network sees.
        const payloadBytes = new Blob([body]).size;
        const timeoutMs = getUploadTimeoutMs(payloadBytes);

        const fields = "fields=id,name,trashed,modifiedTime";
        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&${fields}`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${fields}`;

        const res = await fetchWithTimeout(url, {
            method: fileId ? "PATCH" : "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
        }, timeoutMs);

        if (!res.ok) {
            const errorBody = await res.json().catch(() => null);
            console.error("Drive upload failed:", res.status, errorBody);
            const err = new Error(`Drive upload failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }

        const file = await res.json();

        if (file.trashed) {
            const err = new Error("FILE_TRASHED");
            err.status = 404;
            throw err;
        }

        localStorage.setItem(DRIVE_FILE_ID_KEY, file.id);
        return file;
    }

    /**
     * Searches Drive for our backup file.
     *
     * Return contract:
     *   - file object → found (newest if duplicates exist)
     *   - null        → search succeeded, no match
     *   - throws      → search itself failed
     *
     * If duplicates exist, keeps the newest and trashes the rest
     * (fire-and-forget) so stale copies don't keep piling up.
     */
    async function findExistingBackupFile(token) {
        const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
        const url =
            "https://www.googleapis.com/drive/v3/files" +
            `?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)` +
            "&orderBy=modifiedTime desc";

        const res = await fetchWithTimeout(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const err = new Error(`Drive search failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }

        const data = await res.json();
        const files = data.files || [];

        if (files.length > 1) {
            console.warn(
                `Found ${files.length} backup files with the same name; ` +
                "keeping the newest and trashing the rest."
            );
            const [newest, ...stale] = files;
            stale.forEach((f) => {
                trashDriveFile(token, f.id).catch((err) =>
                    console.warn("Could not trash stale backup file", f.id, err)
                );
            });
            return newest;
        }

        return files.length ? files[0] : null;
    }

    async function trashDriveFile(token, fileId) {
        const res = await fetchWithTimeout(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ trashed: true }),
            }
        );
        if (!res.ok) {
            const err = new Error(`Trash failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
    }

    /**
     * Downloads the raw text content of a Drive file.
     * Exposed for the import step (3.3).
     */
    async function downloadFromDrive(token, fileId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const err = new Error(`Drive download failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return await res.text();
    }

    // =============================================
    //  5. PUBLIC: backupToDrive()
    // =============================================

    /**
     * Exports current state to Google Drive.
     * Idempotent — one file per user, always updated in place.
     * Safe against double-clicks (returns the in-flight promise).
     *
     * @returns {Promise<boolean>} true on success, false on failure
     */
    function backupToDrive() {
        if (pendingBackupRequest) return pendingBackupRequest;

        pendingBackupRequest = runBackupToDrive().finally(() => {
            pendingBackupRequest = null;
        });

        return pendingBackupRequest;
    }

    async function runBackupToDrive() {
        const { ZSProgress, ZSCore, ZSApp } = window;

        if (!ZSApp || !ZSApp.state) return false;

        driveUploading = true;
        window.addEventListener("beforeunload", blockUnloadIfUploading);

        ZSProgress.start("Signing in to Google…");

        try {
            // ── 1. Auth ─────────────────────────────────────────────
            let token;
            try {
                token = await ensureDriveToken();
            } catch (err) {
                if (err.message === "DRIVE_REAUTH_NEEDED") {
                    ZSProgress.fail("Drive sign-in cancelled");
                    ZSCore.showAlert(
                        "Drive sign-in was cancelled or denied.",
                        { title: "Drive sign-in" }
                    );
                } else {
                    ZSProgress.fail("Drive sign-in failed");
                    ZSCore.showAlert(
                        "Couldn't sign in to Google Drive. Please try again.",
                        { title: "Drive sign-in" }
                    );
                }
                return false;
            }

            // ── 2. Locate target file ────────────────────────────────
            ZSProgress.set(20, "Searching your Drive…");

            let fileId = null;

            try {
                const existing = await findExistingBackupFile(token);
                if (existing) {
                    fileId = existing.id;
                    localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
                } else {
                    // Search confirmed no file exists yet → clear any stale local ID.
                    localStorage.removeItem(DRIVE_FILE_ID_KEY);
                }
            } catch (searchErr) {
                // Search failed (network/timeout/5xx). Fall back to local ID.
                // If that's also stale, the 404 retry below will recover.
                console.warn("Drive search failed, using local fileId:", searchErr.message);
                fileId = localStorage.getItem(DRIVE_FILE_ID_KEY);
            }

            // ── 3. Build backup payload ──────────────────────────────
            ZSProgress.set(40, "Collecting your data…");
            const exportObj = await ZSApp.buildBackup();

            // ── 4. Upload (with stale-ID retry) ──────────────────────
            ZSProgress.set(60, "Uploading to Drive…");

            try {
                await uploadToDrive(token, fileId, exportObj);
            } catch (err) {
                if (err.status === 404 || err.status === 403) {
                    console.warn("Stale fileId, retrying with a fresh search…");
                    localStorage.removeItem(DRIVE_FILE_ID_KEY);

                    let retryId = null;
                    try {
                        const existing = await findExistingBackupFile(token);
                        retryId = existing ? existing.id : null;
                    } catch (searchErr) {
                        console.warn("Search failed during retry:", searchErr.message);
                    }

                    if (retryId) {
                        localStorage.setItem(DRIVE_FILE_ID_KEY, retryId);
                    }

                    ZSProgress.set(75, "Retrying upload…");
                    await uploadToDrive(token, retryId, exportObj);
                } else {
                    throw err;
                }
            }

            // ── 5. Done ──────────────────────────────────────────────
            ZSProgress.done("Backed up to Drive");
            return true;

        } catch (err) {
            console.error("Drive backup failed:", err);

            let msg = "Backup to Drive failed.";
            if (err.message === "FETCH_TIMEOUT") {
                msg = "Backup timed out — check your connection.";
            } else if (err.status === 401) {
                msg = "Your Drive session expired. Please try again.";
                // Same reasoning as in 160-app-backup.js: drop the stale
                // token so we don't loop on the same 401 indefinitely.
                window.ZSDrive.clearToken();
            } else if (err.status === 403) {
                msg = "Drive refused the request (permissions).";
            } else if (err.status >= 500) {
                msg = "Google Drive is having issues. Try again in a moment.";
            }

            ZSProgress.fail("Drive backup failed");
            ZSCore.showAlert(msg, { title: "Drive backup" });
            return false;

        } finally {
            driveUploading = false;
            window.removeEventListener("beforeunload", blockUnloadIfUploading);
        }
    }

    function blockUnloadIfUploading(e) {
        if (driveUploading) {
            e.preventDefault();
            e.returnValue = "";
        }
    }

    // =============================================
    //  6. EXPORTS
    // =============================================
    return {
        backupToDrive,

        // Shared with the import step (3.3)
        findExistingBackupFile,
        downloadFromDrive,
        trashDriveFile,
        ensureDriveToken,

        // Constants
        DRIVE_FILE_NAME,
        DRIVE_FILE_ID_KEY,
    };
})());