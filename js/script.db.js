/**
 * ZS New Tab – IndexedDB storage layer (single background)
 * Stores ONE background blob in the meta store.
 */
window.ZSDB = (function () {
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

    /**
     * Reads the fade duration from the CSS variable --bg-fade-ms so the
     * JS-side revoke timing can never drift from the CSS transition.
     * Falls back to 700ms if the stylesheet hasn't loaded yet.
     */
    let _fadeMsCache = null;
    function getFadeMs() {
        if (_fadeMsCache !== null) return _fadeMsCache;
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue("--bg-fade-ms")
            .trim();
        const parsed = parseFloat(raw);
        _fadeMsCache = Number.isFinite(parsed) && parsed > 0 ? parsed : 700;
        return _fadeMsCache;
    }

    let _currentBgUrl = null;
    let _activeLayer = 1;

    /**
     * Waits for the browser to fully decode the image off-main-thread
     * using img.decode(). This is significantly faster than onload for
     * large images and guarantees the bitmap is ready for paint.
     */
    function waitForImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onerror = () => reject(new Error("Image decode failed"));
            img.src = url;
            // decode() resolves once the image is decoded and ready to paint.
            if (typeof img.decode === "function") {
                img.decode().then(resolve, reject);
            } else {
                // Fallback for very old browsers (unlikely in MV3).
                img.onload = resolve;
            }
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
            * apply instantly on layer 1.
            * `no-fade` disables the CSS transition for this first paint
            * so the stored image shows up immediately on new tab load,
            * with no 700ms fade-in from a black screen.
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
            * This creates a real crossfade between the old and new
            * background images when `animate` is true.
            *
            * When `animate` is false (e.g. rollback after a failed save),
            * we still swap layers, but suppress the CSS transition so the
            * previous image reappears instantly instead of fading.
            */
            const nextLayer = _activeLayer === 1 ? 2 : 1;
            const variableName =
                nextLayer === 1 ? "--bg-image-1" : "--bg-image-2";

            body.style.setProperty(
                variableName,
                `url("${url}")`
            );

            if (!animate) {
                body.classList.add("no-fade");
            }

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

            void body.offsetHeight;

            if (!animate) {
                body.classList.remove("no-fade");
            }

            const oldUrl = _currentBgUrl;

            _currentBgUrl = url;
            _activeLayer = nextLayer;

            /*
            * The old object URL is no longer needed.
            * If a crossfade is playing, wait until it finishes before
            * revoking. If the swap was instant, revoke right away.
            */
            const revokeDelay = animate ? getFadeMs() : 0;

            setTimeout(() => {
                if (oldUrl && oldUrl !== _currentBgUrl) {
                    URL.revokeObjectURL(oldUrl);
                }
            }, revokeDelay);

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
        }, getFadeMs());
    }

    // =============================================
    //  4. PUBLIC API
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
                    await applyBlob(oldBlob, { animate: false });
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
                await applyBlob(blob, { animate: false });
            } catch (err) {
                console.warn("Stored background failed to apply", err);
                clearApplied();
            }
        } else {
            clearApplied();
        }
    }

    // =============================================
    //  5. EXPORTS
    // =============================================
    return {
        initDB,
        getBackground,
        setBackground,
        removeBackground,
        applyBackground,
    };
})();