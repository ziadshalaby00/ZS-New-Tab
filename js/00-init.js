/**
 * Registers (merges) an object's members onto a global namespace on `window`,
 * creating the namespace first if it doesn't already exist.
 *
 * Safe to call multiple times for the same namespace — each call extends
 * the existing object instead of overwriting it, so file load order
 * (e.g. across split module files) does not matter.
 *
 * @param {string} name - The name of the global namespace on `window`
 *                         (e.g. "ZSCore", "ZSDB", "ZSUI").
 * @param {Object} [obj] - The object whose properties should be merged
 *                          into the namespace. Defaults to an empty object.
 * @returns {void}
 *
 * @example
 * window.registerModule("ZSCore", (function () {
 *     "use strict";
 *     function hexToRgb(hex) { ... }
 *     return { hexToRgb };
 * })());
 */
window.registerModule = function (name, obj) {
    obj = obj || {};
    window[name] = window[name] || {};

    // Warn on key collisions before merging. A silent overwrite means two
    // files export the same name and one of them loses — which is exactly
    // the kind of bug that only surfaces much later, as a missing function
    // or a wrong value. Cheap to check: only runs at script load time.
    for (const key of Object.keys(obj)) {
        if (key in window[name]) {
            console.warn(
                `registerModule("${name}"): overwriting existing key "${key}"`
            );
        }
    }

    Object.assign(window[name], obj);
};