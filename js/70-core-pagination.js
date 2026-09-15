window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Updates the visual state of pagination dots and prev/next buttons based on the current page and total pages.
     */
    function updatePaginationUI(total, currentPage, onPageSelect) {
        const dotsContainer = document.getElementById("dots");
        if (dotsContainer) {
            dotsContainer.innerHTML = "";
            if (total > 1) {
                for (let i = 0; i < total; i++) {
                    const dot = document.createElement("div");
                    dot.className = "dot" + (i === currentPage ? " active" : "");
                    dot.addEventListener("click", () => onPageSelect(i));
                    dotsContainer.appendChild(dot);
                }
            }
        }
        document.getElementById("prevPage")?.classList.toggle("active", currentPage > 0);
        document.getElementById("nextPage")?.classList.toggle("active", currentPage < total - 1);
    }

    /**
     * Calculates the total number of items that can fit on a single page based on rows and columns.
     */
    function getPageSize(rows, cols) {
        return rows * cols;
    }

    /**
     * Calculates the total number of pages needed for a given number of sites, rows, and columns.
     */
    function getTotalPages(sitesCount, rows, cols) {
        return Math.max(1, Math.ceil((sitesCount + 1) / getPageSize(rows, cols)));
    }

    return {
        updatePaginationUI,
        getPageSize,
        getTotalPages
    }
})());