window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Displays a custom confirmation modal and returns a Promise that resolves to true or false based on user action.
     *
     * Custom confirmation modal.
     *
     * @param {string} message
     * @param {object|string} [opts]              // string = title (backward compat)
     * @param {string} [opts.title="Confirm"]
     * @param {string} [opts.confirmLabel="Confirm"]
     * @param {string} [opts.cancelLabel="Cancel"]
     * @returns {Promise<boolean>}
     */
    function showConfirm(message, opts = {}) {
        // backward compat: showConfirm("msg", "Title")
        if (typeof opts === "string") opts = { title: opts };

        const {
            title = "Confirm",
            confirmLabel = "Confirm",
            cancelLabel = "Cancel",
        } = opts;

        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "overlay"; // no "open" yet — let the transition play in

            const modal = document.createElement("div");
            modal.className = "modal";
            modal.innerHTML = `
                <h2>${window.ZSCore.escapeHtml(title)}</h2>
                <p class="hint" style="margin-bottom:18px; font-size:13px; color:var(--text);">${window.ZSCore.escapeHtml(message)}</p>
                <div class="actions">
                    <button class="cancel">${window.ZSCore.escapeHtml(cancelLabel)}</button>
                    <button class="save danger-fill">${window.ZSCore.escapeHtml(confirmLabel)}</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Force the initial (closed) state to be committed before adding
            // "open", so the enter transition actually plays.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => overlay.classList.add("open"));
            });

            let settled = false;

            function onKey(e) {
                if (e.key === "Escape") {
                    e.preventDefault();
                    cleanup(false);
                }
            }

            function cleanup(result) {
                if (settled) return;
                settled = true;
                document.removeEventListener("keydown", onKey);

                // Play the close transition, then remove from the DOM.
                overlay.classList.remove("open");

                let removed = false;
                const remove = () => {
                    if (removed) return;
                    removed = true;
                    overlay.removeEventListener("transitionend", onTransitionEnd);
                    overlay.remove();
                    resolve(result);
                };

                const onTransitionEnd = (e) => {
                    if (e.target === overlay && e.propertyName === "opacity") remove();
                };

                overlay.addEventListener("transitionend", onTransitionEnd);
                // Safety net in case transitionend never fires (e.g. reduced motion).
                setTimeout(remove, 260);
            }

            modal.querySelector(".cancel").addEventListener("click", () => cleanup(false));
            modal.querySelector(".save").addEventListener("click", () => cleanup(true));
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) cleanup(false);
            });

            document.addEventListener("keydown", onKey);
        });
    }

    /**
     * Custom alert popup (window.alert).
     *
     * @param {string} message
     * @param {object|string} [opts]              // string = title (backward compat)
     * @param {string} [opts.title="Notice"]
     * @param {string} [opts.okLabel="OK"]
     * @returns {Promise<void>}
     */
    function showAlert(message, opts = {}) {
        if (typeof opts === "string") opts = { title: opts };

        const {
            title = "Notice",
            okLabel = "OK",
        } = opts;

        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "overlay";

            const modal = document.createElement("div");
            modal.className = "modal";
            modal.innerHTML = `
                <h2>${window.ZSCore.escapeHtml(title)}</h2>
                <p class="hint" style="margin-bottom:18px; font-size:13px; color:var(--text);">${window.ZSCore.escapeHtml(message)}</p>
                <div class="actions">
                    <button class="save">${window.ZSCore.escapeHtml(okLabel)}</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => overlay.classList.add("open"));
            });

            let settled = false;

            function onKey(e) {
                if (e.key === "Escape" || e.key === "Enter") {
                    e.preventDefault();
                    cleanup();
                }
            }

            function cleanup() {
                if (settled) return;
                settled = true;
                document.removeEventListener("keydown", onKey);

                overlay.classList.remove("open");

                let removed = false;
                const remove = () => {
                    if (removed) return;
                    removed = true;
                    overlay.removeEventListener("transitionend", onTransitionEnd);
                    overlay.remove();
                    resolve();
                };

                const onTransitionEnd = (e) => {
                    if (e.target === overlay && e.propertyName === "opacity") remove();
                };

                overlay.addEventListener("transitionend", onTransitionEnd);
                setTimeout(remove, 260);
            }

            modal.querySelector(".save").addEventListener("click", cleanup);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) cleanup();
            });

            document.addEventListener("keydown", onKey);
        });
    }

    return {
        showConfirm,
        showAlert
    }
})());