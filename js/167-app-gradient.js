/**
 * ZS New Tab – Gradient background picker
 *
 * Modal that lets the user pick a preset gradient for the page background.
 * Uses ZSCore.modal for open/close/Escape so it plays nicely with every
 * other dialog in the app.
 *
 * Live-preview + transactional commit:
 *   - Opening the modal snapshots the current gradient id.
 *   - Clicking a swatch applies it visually right away, but does NOT
 *     touch state or localStorage.
 *   - Apply   → writes to state + persists, then closes.
 *   - Cancel  → restores the snapshot, then closes.
 *   - Escape  → same as Cancel (modal manager calls the same onClose).
 *
 * The background image (if any) is a separate layer above the gradient
 * and is managed by ZSDB / 150-app-settings.js. This file only reads
 * body.has-bg-image to decide whether to show the "image is covering
 * the gradient" notice.
 */
window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    const overlay       = document.getElementById("gradientOverlay");
    const grid          = document.getElementById("gradientGrid");
    const noneBtn       = document.getElementById("gradientNone");
    const applyBtn      = document.getElementById("gradientApply");
    const cancelBtn     = document.getElementById("gradientCancel");
    const imageNotice   = document.getElementById("gradientImageNotice");
    const removeImageBtn = document.getElementById("gradientRemoveImage");

    /**
     * The gradient id that was active when the modal opened. Restored on
     * Cancel/Escape. Null means "no preset — use the CSS default".
     */
    let originalId = null;

    /**
     * The gradient id currently shown in the preview. This is what Apply
     * commits. Null means "None / Default".
     */
    let previewId = null;

    /**
     * Updates the visual selection rings to match previewId. Called after
     * any change to previewId.
     */
    function syncActiveState() {
        if (grid) {
            grid.querySelectorAll(".gradient-swatch").forEach(btn => {
                btn.classList.toggle(
                    "active",
                    btn.dataset.gradientId === previewId
                );
            });
        }
        if (noneBtn) {
            noneBtn.classList.toggle("active", previewId === null);
        }
    }

    /**
     * Live preview: applies the gradient to the page without persisting.
     */
    function preview(id) {
        previewId = id;
        ZSCore.applyGradient(id);
        syncActiveState();
    }

    /**
     * Builds the 16 swatches exactly once. Idempotent.
     */
    function buildGrid() {
        if (!grid || grid.dataset.built) return;

        const frag = document.createDocumentFragment();
        for (const preset of ZSCore.GRADIENTS) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "gradient-swatch";
            btn.style.background = preset.value;
            btn.title = preset.name;
            btn.setAttribute("aria-label", preset.name);
            btn.dataset.gradientId = preset.id;
            btn.addEventListener("click", () => preview(preset.id));
            frag.appendChild(btn);
        }
        grid.replaceChildren(frag);
        grid.dataset.built = "1";
    }

    // ---------- Public: open ----------
    function openGradientModal() {
        buildGrid();

        // Snapshot what's currently persisted. The rendered page should
        // already match this (120-app-render.js calls applyGradient on every
        // render), but re-applying here keeps the modal self-contained if
        // it's ever opened before the first render.
        originalId = window.ZSApp.state.settings.gradient || null;
        previewId = originalId;
        ZSCore.applyGradient(originalId);
        syncActiveState();

        // Show the "image is covering the gradient" notice only when an
        // image is actually applied. body.has-bg-image is set by ZSDB
        // whenever a blob is drawn or cleared.
        if (imageNotice) {
            imageNotice.hidden = !document.body.classList.contains("has-bg-image");
        }

        // Escape fires the same handler as Cancel — revert + close.
        ZSCore.modal.open(overlay, cancel);
    }

    // ---------- Public: close (no revert) ----------
    function closeGradientModal() {
        ZSCore.modal.close(overlay);
    }

    // ---------- Cancel / Escape ----------
    function cancel() {
        // Revert the live preview to the snapshot. state was never touched.
        ZSCore.applyGradient(originalId);
        previewId = originalId;
        // If the modal manager already popped us (Escape path), this is a
        // no-op. If the Cancel button triggered it, this removes the class.
        ZSCore.modal.close(overlay);
    }

    // ---------- Apply ----------
    function commit() {
        const previous = window.ZSApp.state.settings.gradient;
        window.ZSApp.state.settings.gradient = previewId;

        if (!window.ZSApp.saveState()) {
            // saveState() showed its own "storage full" alert. Undo the
            // state change so the UI doesn't drift from disk, and restore
            // the visual to whatever was persisted before.
            window.ZSApp.state.settings.gradient = previous;
            ZSCore.applyGradient(previous);
            previewId = previous;
            syncActiveState();
            return;
        }

        ZSCore.modal.close(overlay);
    }

    // ---------- Wire up ----------
    if (noneBtn) {
        noneBtn.addEventListener("click", () => preview(null));
    }

    if (applyBtn) {
        applyBtn.addEventListener("click", commit);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", cancel);
    }

    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cancel();
        });
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener("click", async () => {
            const ok = await ZSCore.showConfirm(
                "This will delete the saved background image. The gradient underneath will show through.",
                { title: "Remove image", confirmLabel: "Remove", cancelLabel: "Keep" }
            );
            if (!ok) return;

            try {
                await window.ZSDB.removeBackground();
                if (imageNotice) imageNotice.hidden = true;
            } catch (err) {
                console.error("Failed to remove background image", err);
            }
        });
    }

    return {
        openGradientModal,
        closeGradientModal,
    };
})());