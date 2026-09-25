window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Creates and returns a DOM element for an "Add site" tile with an attached click event listener.
     */
    function buildAddTile(onClickFn) {
        const tile = document.createElement("div");
        tile.className = "tile add";
        tile.tabIndex = 0;

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
            </svg>
        `;

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = "Add site";

        tile.appendChild(icon);
        tile.appendChild(label);
        tile.addEventListener("click", onClickFn);
        tile.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClickFn();
            }
        });
        return tile;
    }

    return {
        buildAddTile
    }
})());