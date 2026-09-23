/**
 * ZS New Tab – Progress bar controller
 * Shared across export/import operations.
 *
 * Usage:
 *   ZSProgress.start("Preparing…");
 *   ZSProgress.set(45, "Collecting data…");
 *   ZSProgress.set(80);                 // label unchanged
 *   ZSProgress.done("Saved");           // 100% → auto-hide
 *   ZSProgress.fail("Export failed");   // red → auto-hide
 *   ZSProgress.hide();                  // instant hide
 */
window.registerModule("ZSProgress", (function () {
    "use strict";

    const rootEl     = document.getElementById("panelProgress");
    const barEl      = document.getElementById("panelProgressBarEl");
    const fillEl     = document.getElementById("panelProgressFill");
    const textEl     = document.getElementById("panelProgressText");
    const percentEl  = document.getElementById("panelProgressPercent");

    /**
     * If the progress bar markup is missing (e.g. HTML changed, script
     * loaded too early, or an id typo), we degrade gracefully: every
     * method becomes a no-op instead of throwing on every call.
     *
     * This matters because ZSProgress is called from export/import
     * flows — a crash here would take the whole operation down.
     */
    const missing = !rootEl || !barEl || !fillEl || !textEl || !percentEl;
    if (missing) {
        console.warn(
            "ZSProgress: progress bar DOM not found — " +
            "progress reporting is disabled. " +
            "Check that #panelProgress and its children exist in the HTML."
        );
        return {
            start() {}, set() {}, done() {}, fail() {}, hide() {},
        };
    }

    let hideTimer = null;
    let currentPercent = 0;

    function clearHideTimer() {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function render() {
        const rounded = Math.round(currentPercent);
        fillEl.style.width = rounded + "%";
        percentEl.textContent = rounded + "%";
        barEl.setAttribute("aria-valuenow", String(rounded));
    }

    /**
     * Shows the bar, resets to 0%, and sets an initial label.
     * @param {string} [label="Working…"]
     */
    function start(label = "Working…") {
        clearHideTimer();
        rootEl.classList.remove("error");
        rootEl.classList.add("active");
        textEl.textContent = label;
        currentPercent = 0;
        render();
    }

    /**
     * Sets the progress percentage (0–100).
     * @param {number} percent
     * @param {string} [label]   Optional label update.
     */
    function set(percent, label) {
        if (typeof percent === "number" && !Number.isNaN(percent)) {
            currentPercent = Math.max(0, Math.min(100, percent));
        }
        if (typeof label === "string") textEl.textContent = label;
        render();
    }

    /**
     * Jumps to 100%, shows a final label, then auto-hides.
     * @param {string} [label="Done"]
     * @param {number} [delayMs=1200]
     */
    function done(label = "Done", delayMs = 1200) {
        clearHideTimer();
        rootEl.classList.remove("error");
        currentPercent = 100;
        if (typeof label === "string") textEl.textContent = label;
        render();
        hideTimer = setTimeout(hide, delayMs);
    }

    /**
     * Shows an error state (red fill), then auto-hides.
     * @param {string} [label="Failed"]
     * @param {number} [delayMs=2200]
     */
    function fail(label = "Failed", delayMs = 2200) {
        clearHideTimer();
        rootEl.classList.add("error");
        if (typeof label === "string") textEl.textContent = label;
        render();
        hideTimer = setTimeout(hide, delayMs);
    }

    function hide() {
        clearHideTimer();
        rootEl.classList.remove("active", "error");
        // Reset width after the slide-out transition finishes
        setTimeout(() => {
            currentPercent = 0;
            if (!rootEl.classList.contains("active")) render();
        }, 350);
    }

    return { start, set, done, fail, hide };
})());