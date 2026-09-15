window.registerModule("ZSApp", (function () {
    "use strict";

    const { ZSCore } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");

    function focusTileAtEdge(fromEnd) {
        const grid = document.getElementById("grid");
        const tiles = Array.from(grid.querySelectorAll(".tile:not(.empty)"));
        if (!tiles.length) return;
        (fromEnd ? tiles[tiles.length - 1] : tiles[0]).focus();
    }

    function setupGridKeyboardNav() {
        const grid = document.getElementById("grid");
        grid.addEventListener("keydown", e => {
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;

            const tiles = Array.from(grid.querySelectorAll(".tile:not(.empty)"));
            const currentIndex = tiles.indexOf(document.activeElement);
            if (currentIndex === -1) return;

            const state = window.ZSApp.state;
            const cols = parseInt(state.settings.cols, 10) || 1;
            const totalPages = ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols);

            if (e.key === "ArrowRight" && currentIndex === tiles.length - 1 && window.ZSApp.currentPage < totalPages - 1) {
                e.preventDefault();
                window.ZSApp.currentPage++;
                window.ZSApp.renderWithTransition({ type: 'page', direction: 1 }).then(() => focusTileAtEdge(false));
                return;
            }
            if (e.key === "ArrowLeft" && currentIndex === 0 && window.ZSApp.currentPage > 0) {
                e.preventDefault();
                window.ZSApp.currentPage--;
                window.ZSApp.renderWithTransition({ type: 'page', direction: -1 }).then(() => focusTileAtEdge(true));
                return;
            }

            let target;
            if (e.key === "ArrowRight") target = currentIndex + 1;
            else if (e.key === "ArrowLeft") target = currentIndex - 1;
            else if (e.key === "ArrowDown") target = currentIndex + cols;
            else if (e.key === "ArrowUp") target = currentIndex - cols;

            if (target >= 0 && target < tiles.length) {
                e.preventDefault();
                tiles[target].focus();
            }
        });
    }

    document.getElementById("prevPage").addEventListener("click", () => {
        if (window.ZSApp.currentPage > 0) {
            window.ZSApp.currentPage--;
            window.ZSApp.renderWithTransition({ type: 'page', direction: -1 });
        }
    });

    document.getElementById("nextPage").addEventListener("click", () => {
        const state = window.ZSApp.state;
        const total = ZSCore.getTotalPages(state.sites.length, state.settings.rows, state.settings.cols);
        if (window.ZSApp.currentPage < total - 1) {
            window.ZSApp.currentPage++;
            window.ZSApp.renderWithTransition({ type: 'page', direction: 1 });
        }
    });

    return { 
        focusTileAtEdge, 
        setupGridKeyboardNav 
    };
})());