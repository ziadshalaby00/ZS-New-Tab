window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    /**
     * Modal (Add / Edit Site)
     */
    const overlay = document.getElementById("overlay");
    const siteIconInput = document.getElementById("siteIcon");
    const iconPreview = document.getElementById("iconPreview");
    const iconPreviewImg = document.getElementById("iconPreviewImg");
    const removeIconBtn = document.getElementById("removeIconBtn");

    /**
     * Opens and populates the add/edit site modal with existing data or defaults.
     */
    function openModal(site) {
        window.ZSApp.editingId = site ? site.id : null;
        document.getElementById("modalTitle").textContent = site ? "Edit site" : "Add site";
        document.getElementById("siteName").value = site ? site.name : "";
        document.getElementById("siteUrl").value = site ? site.url : "";
        window.ZSApp.tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";

        if (site) {
            const existingIcon = window.ZSApp.loadSiteIcon(site.id);
            if (typeof existingIcon === "string" && existingIcon.startsWith("data:image")) {
                window.ZSApp.tempIconData = existingIcon;
                iconPreviewImg.src = existingIcon;
                iconPreview.style.display = "flex";
            }
        }
        overlay.classList.add("open");
        requestAnimationFrame(() => {
            if (overlay.classList.contains("open")) document.getElementById("siteName").focus();
        });
    }

    /**
     * Closes the modal and resets temporary icon data and input fields.
     */
    function closeModal() {
        overlay.classList.remove("open");
        window.ZSApp.tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";
    }

    document.getElementById("modalCancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

    siteIconInput.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return alert("Please select an image file.");
        try {
            const resizedBlob = await ZSCore.resizeImage(file, "icon");
            window.ZSApp.tempIconData = await ZSCore.blobToDataURL(resizedBlob);
            iconPreviewImg.src = window.ZSApp.tempIconData;
            iconPreview.style.display = "flex";
        } catch (err) {
            alert("Failed to read image.");
        }
    });

    removeIconBtn.addEventListener("click", () => {
        window.ZSApp.tempIconData = null;
        siteIconInput.value = "";
        iconPreview.style.display = "none";
    });

    /**
     * Validates and saves a new or edited site to the state and localStorage, handling icon updates.
     */
    function saveSite() {
        const name = document.getElementById("siteName").value.trim();
        let url = document.getElementById("siteUrl").value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        const state = window.ZSApp.state;
        const editingId = window.ZSApp.editingId;
        const stateSnapshot = JSON.parse(JSON.stringify(state));
        const targetId = editingId || ZSCore.generateId();
        const iconKey = window.ZSApp.getIconKey(targetId);
        const iconSnapshot = localStorage.getItem(iconKey);
        const hadCacheEntry = window.ZSApp.iconCache.has(targetId);
        const cacheSnapshot = window.ZSApp.iconCache.get(targetId);

        try {
            if (editingId) {
                const existing = state.sites.find(s => s.id === editingId);
                if (existing) { existing.name = name; existing.url = url; }
            } else {
                state.sites.push({ id: targetId, name, url });
            }

            const tempIconData = window.ZSApp.tempIconData;
            if (typeof tempIconData === "string" && tempIconData.startsWith("data:image")) {
                window.ZSApp.saveSiteIcon(targetId, tempIconData);
            } else if (tempIconData === null) {
                window.ZSApp.deleteSiteIcon(targetId);
            }

            const wasEditing = !!editingId;
            window.ZSApp.saveState();
            closeModal();
            window.ZSApp.renderWithTransition({ type: wasEditing ? 'edit' : 'add', tileId: targetId });
        } catch (err) {
            window.ZSApp.state = stateSnapshot;
            if (iconSnapshot === null) localStorage.removeItem(iconKey);
            else localStorage.setItem(iconKey, iconSnapshot);
            if (hadCacheEntry) window.ZSApp.iconCache.set(targetId, cacheSnapshot);
            else window.ZSApp.iconCache.delete(targetId);
            alert("Could not save site — local storage may be full.");
        }
    }

    document.getElementById("modalSave").addEventListener("click", saveSite);
    ["siteName", "siteUrl"].forEach(id => {
        document.getElementById(id).addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); saveSite(); }
        });
    });

    return { 
        openModal, 
        closeModal 
    };
})());