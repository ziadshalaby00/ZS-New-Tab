(async function () {
    "use strict";

    const { ZSCore, ZSDB, ZSApp } = window;
    if (!ZSCore) return console.error("ZSCore is missing.");
    if (!ZSDB) return console.error("ZSDB is missing.");
    if (!ZSApp) return console.error("ZSApp is missing. Make sure all app-*.js files are loaded first.");

    ZSApp.setupGridKeyboardNav();

    ZSCore.setupSearchForm("searchForm", "searchInput", () => ZSApp.state.settings.engine);
    ZSCore.setupKeyboardShortcuts("searchInput", () => {
        ZSApp.closeModal();
        ZSApp.panel.classList.remove("open");
    }, ZSApp.openSettingsPanel);
    ZSCore.setupClickOutsidePanel("panel", "settingsToggle");
    ZSCore.setupGreeting();

    ZSCore.setupScrollNavigation('.grid-wrap', {
        getTotalPages: () => ZSCore.getTotalPages(
                                ZSApp.state.sites.length, 
                                ZSApp.state.settings.rows, 
                                ZSApp.state.settings.cols
                            ),
        getCurrentPage: () => ZSApp.currentPage,
        onPageChange: (newPage) => {
            const dir = newPage > ZSApp.currentPage ? 1 : -1;
            ZSApp.currentPage = newPage;
            ZSApp.renderWithTransition({ type: 'page', direction: dir });
        }
    });

    ZSCore.setupDragEdgeNavigation(".grid-wrap", {
        canGoPrev: () => ZSApp.currentPage > 0,
        canGoNext: () => ZSApp.currentPage < ZSCore.getTotalPages(
                                                ZSApp.state.sites.length, 
                                                ZSApp.state.settings.rows,
                                                ZSApp.state.settings.cols
                                            ) - 1,
        onNavigate: (dir) => {
            ZSApp.currentPage += dir;
            ZSApp.renderWithTransition({ type: 'page', direction: dir });
        }
    });

    ZSApp.render();

    try {
        await ZSDB.applyBackground();
    } catch (err) {
        console.warn("Background failed", err);
    }
})();