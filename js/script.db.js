/**
 * ZS New Tab – IndexedDB storage layer (single background)
 * Stores ONE background blob in the meta store.
 */
(function () {
    "use strict";

    // =============================================
    //  1. CONSTANTS
    // =============================================
    const DB_NAME = "ZSNewTab";
    const DB_VERSION = 4;
    const STORE_META = "meta";
    const BG_KEY = "background";

    // =============================================
    //  2. CONNECTION (single, kept open)
    // =============================================
    let db = null;
    let dbOpenPromise = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (database.objectStoreNames.contains("backgrounds")) {
                    database.deleteObjectStore("backgrounds");
                }
                if (!database.objectStoreNames.contains(STORE_META)) {
                    database.createObjectStore(STORE_META);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    function initDB() {
        if (db) return Promise.resolve(db);
        if (dbOpenPromise) return dbOpenPromise;
        dbOpenPromise = openDB()
            .then((opened) => {
                db = opened;
                db.onclose = () => { db = null; };
                db.onversionchange = () => { db.close(); db = null; };
                return db;
            })
            .finally(() => { dbOpenPromise = null; });
        return dbOpenPromise;
    }

    window.addEventListener("beforeunload", () => { if (db) db.close(); });

    // =============================================
    //  3. GENERIC DB HELPERS
    // =============================================
    async function dbGet(storeName, key) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbPut(storeName, value, key) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const req = tx.objectStore(storeName).put(value, key);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    async function dbDelete(storeName, key) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    const FADE_MS = 750;
    let _currentBgUrl = null;
    let _activeLayer = 1;

    function waitForImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = () => reject(new Error("Image decode failed"));
            img.src = url;
        });
    }

    async function applyBlob(blob, { animate = true } = {}) {
        if (!blob) {
            clearApplied();
            return;
        }

        const url = URL.createObjectURL(blob);

        try {
            await waitForImage(url);

            const body = document.body;

            /*
            * Initial background:
            * apply instantly without animation.
            */
            if (!_currentBgUrl) {
                const nextLayer = 1;

                body.style.setProperty(
                    "--bg-image-1",
                    `url("${url}")`
                );

                if (!animate) {
                    body.classList.add("no-fade");
                }

                void body.offsetHeight;

                body.classList.add("bg-layer-1");
                body.classList.add("has-bg-image");

                void body.offsetHeight;

                if (!animate) {
                    body.classList.remove("no-fade");
                }

                _currentBgUrl = url;
                _activeLayer = nextLayer;

                return;
            }

            /*
            * Switch to the other layer.
            * This creates a real crossfade between
            * the old and new background images.
            */
            const nextLayer = _activeLayer === 1 ? 2 : 1;
            const variableName =
                nextLayer === 1 ? "--bg-image-1" : "--bg-image-2";

            body.style.setProperty(
                variableName,
                `url("${url}")`
            );

            /*
            * Force style calculation so the browser
            * sees the new image before starting the transition.
            */
            void body.offsetHeight;

            if (nextLayer === 1) {
                body.classList.remove("bg-layer-2");
                body.classList.add("bg-layer-1");
            } else {
                body.classList.remove("bg-layer-1");
                body.classList.add("bg-layer-2");
            }

            const oldUrl = _currentBgUrl;

            _currentBgUrl = url;
            _activeLayer = nextLayer;

            /*
            * The old object URL is no longer needed after
            * the crossfade has completed.
            */
            setTimeout(() => {
                if (oldUrl && oldUrl !== _currentBgUrl) {
                    URL.revokeObjectURL(oldUrl);
                }
            }, FADE_MS);

        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    }

    function clearApplied() {
        const body = document.body;

        body.classList.remove(
            "has-bg-image",
            "bg-layer-1",
            "bg-layer-2"
        );

        const oldUrl = _currentBgUrl;

        _currentBgUrl = null;

        setTimeout(() => {
            body.style.removeProperty("--bg-image-1");
            body.style.removeProperty("--bg-image-2");

            if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
            }
        }, FADE_MS);
    }

    // =============================================
    //  5. PUBLIC API
    // =============================================

    /**
     * Returns the stored blob (or null).
     */
    async function getBackground() {
        const record = await dbGet(STORE_META, BG_KEY);
        return record ? record.blob : null;
    }

    /**
     * Saves the new blob and applies it.
     * Rolls back to the previous blob if save OR apply fails.
     * @param {Blob} blob
     */
    async function setBackground(blob) {
        if (!(blob instanceof Blob)) throw new Error("setBackground expects a Blob");

        const oldBlob = await getBackground(); // snapshot for rollback

        try {
            await dbPut(STORE_META, { blob, createdAt: Date.now() }, BG_KEY);
            await applyBlob(blob, { animate: true });
        } catch (err) {
            // rollback
            try {
                if (oldBlob) {
                    await dbPut(STORE_META, { blob: oldBlob, createdAt: Date.now() }, BG_KEY);
                    await applyBlob(oldBlob);
                } else {
                    await dbDelete(STORE_META, BG_KEY);
                    clearApplied();
                }
            } catch (rollbackErr) {
                console.warn("Rollback failed", rollbackErr);
            }
            throw err;
        }
    }

    /**
     * Removes the stored background and clears the UI.
     */
    async function removeBackground() {
        await dbDelete(STORE_META, BG_KEY);
        clearApplied();
    }

    /**
     * Loads and applies whatever is stored (call on startup).
     */
    async function applyBackground() {
        const blob = await getBackground();
        if (blob) {
            try {
                await applyBlob(blob, { animate: true });
            } catch (err) {
                console.warn("Stored background failed to apply", err);
                clearApplied();
            }
        } else {
            clearApplied();
        }
    }

    // =============================================
    //  6. EXPORTS
    // =============================================
    window.ZSDB = {
        initDB,
        getBackground,
        setBackground,
        removeBackground,
        applyBackground,
    };
})();