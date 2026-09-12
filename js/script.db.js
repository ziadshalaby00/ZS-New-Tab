/**
 * ZS New Tab – IndexedDB storage layer (single background)
 * Stores ONE background blob in the meta store.
 */
(async function () {
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

    const FADE_MS = 850;
    let _currentBgUrl = null;

    function waitForImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = () => reject(new Error("Image decode failed"));
            img.src = url;
        });
    }

    async function applyBlob(blob) {
        const url = URL.createObjectURL(blob);

        try {
            await waitForImage(url);
        } catch (err) {
            URL.revokeObjectURL(url);
            throw err;
        }

        const body = document.body;
        const oldUrl = _currentBgUrl;
        _currentBgUrl = url;

        body.classList.add("no-fade");
        body.classList.remove("has-bg-image");
        body.style.setProperty("--bg-image", `url("${url}")`);
        void body.offsetHeight;              // flush #1

        body.classList.remove("no-fade");
        void body.offsetHeight;              // flush #2

        body.classList.add("has-bg-image");

        if (oldUrl) {
            setTimeout(() => URL.revokeObjectURL(oldUrl), FADE_MS);
        }
    }

    function clearApplied() {
        const body = document.body;
        const oldUrl = _currentBgUrl;

        if (!body.classList.contains("has-bg-image")) {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            body.style.removeProperty("--bg-image");
            _currentBgUrl = null;
            return;
        }

        void body.offsetHeight;

        body.classList.remove("has-bg-image");

        setTimeout(() => {
            body.style.removeProperty("--bg-image");
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            if (_currentBgUrl === oldUrl) _currentBgUrl = null;
        }, 900);
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
            await applyBlob(blob);
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
                await applyBlob(blob);
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