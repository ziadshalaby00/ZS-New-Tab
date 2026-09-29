/**
 * ZS New Tab – Modal stack manager
 *
 * Centralizes open/close/Escape handling for every overlay in the app.
 *
 * Before this file existed, each modal (edit-site, export, import, and the
 * dynamic confirm/alert dialogs) wired up its own Escape listener and
 * checked `document.querySelector(".overlay.open")` independently. That
 * worked, but:
 *
 *   - Escape behavior depended on capture-vs-bubble registration order,
 *     which is invisible at the call site.
 *   - Every new modal had to copy the same 6 lines correctly, or it would
 *     silently break (e.g. Escape closing two modals at once).
 *   - `setupKeyboardShortcuts` had to know the `.overlay.open` selector.
 *
 * The stack keeps the ordering explicit: only the topmost entry reacts to
 * Escape. Modals still own their own open/close animations, DOM lifecycle,
 * and click-outside handling — the manager only tracks *who is open* and
 * *what to call when Escape closes them*.
 */
window.registerModule("ZSCore", (function () {
    "use strict";

    // [{ element, onClose }] — LIFO. Index 0 is the oldest, last is topmost.
    const stack = [];
    
    function syncInert() {
        const top = stack.length ? stack[stack.length - 1].element : null;
        for (const child of document.body.children) {
            if (child.tagName === "SCRIPT") continue;
            child.inert = top !== null && child !== top;
        }
    }

    /**
     * Central Escape handler. Registered in capture phase so it runs before
     * every other keydown listener — including the one in 80-core-events.js
     * that closes the settings panel — and can stop the event from reaching
     * them.
     *
     * If the stack is empty, we deliberately do NOT call
     * preventDefault()/stopImmediatePropagation(), so Escape still reaches
     * the panel-closing handler. That's how the user closes the settings
     * panel with Escape while no modal is open.
     */
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (stack.length === 0) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const top = stack.pop();
        syncInert();
        top.element.classList.remove("open");

        if (typeof top.onClose === "function") {
            // onClose is expected to finish the visual close (transition,
            // DOM removal, promise resolution). It should NOT call
            // ZSCore.modal.close() itself — the manager already popped the
            // entry. Calling close() again is safe (see below), but not
            // necessary.
            top.onClose();
        }
    }, true);

    /**
     * Opens a modal: adds the "open" class and pushes it onto the stack.
     *
     * @param {HTMLElement} element      The .overlay element.
     * @param {Function}    onClose      Called when Escape closes this modal.
     *                                   Should perform the same cleanup the
     *                                   modal's own Cancel/X button does.
     */
    function open(element, onClose) {
        if (!element) return;

        // Guard against double-open. Reopening an already-open modal would
        // push a duplicate onto the stack, so Escape would fire onClose
        // twice before the modal is really closed.
        if (stack.some(entry => entry.element === element)) return;

        element.classList.add("open");
        stack.push({ element, onClose });
        syncInert();
    }

    /**
     * Closes a modal by element. Idempotent — safe to call from any cleanup
     * path, including after the Escape handler has already removed it.
     *
     * This is the "I closed it myself" entry point: the modal's Cancel
     * button, the X icon, a click on the backdrop, or a successful form
     * submission all funnel here. It removes the entry from the stack and
     * clears the "open" class; the modal's own cleanup code is still
     * responsible for hiding content, resetting inputs, and playing the
     * exit transition.
     */
    function close(element) {
        if (!element) return;
        const idx = stack.findIndex(entry => entry.element === element);
        if (idx === -1) return;
        stack.splice(idx, 1);
        syncInert();
        element.classList.remove("open");
    }

    /**
     * True while any registered modal is open. Used by
     * 80-core-events.js to decide whether Escape should close the settings
     * panel — it shouldn't while a modal is on top of it.
     */
    function isAnyOpen() {
        return stack.length > 0;
    }

    return { 
        modal: { open, close, isAnyOpen }
    };
})());