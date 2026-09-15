window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Calculates and logs the size of all items in localStorage to the console, returning a summary object with total size metrics.
     */
    function getLocalStorageSize() {
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const value = localStorage.getItem(key);
            const size = (key.length + value.length) * 2;
            items.push({ key, bytes: size, kb: size / 1024 });
        }
        items.sort((a, b) => b.bytes - a.bytes);
        console.table(items.map(item => ({ Key: item.key, "Size (KB)": item.kb.toFixed(2), "Size (Bytes)": item.bytes })));
        const total = items.reduce((sum, item) => sum + item.bytes, 0);
        console.log(`Total localStorage size: ${(total / 1024).toFixed(2)} KB`);
        return { totalBytes: total, totalKB: total / 1024, totalMB: total / (1024 * 1024), items };
    }

    return {
        getLocalStorageSize
    }
})());

window.gl = window.ZSCore.getLocalStorageSize;