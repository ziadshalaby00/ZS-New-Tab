window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Creates a render controller with animation support.
     *
     * Usage:
     *   const renderWithTransition = ZSCore.createRenderer('grid', render);
     *   renderWithTransition();                                       // default fade
     *   renderWithTransition({ type: 'instant' });                    // no animation
     *   renderWithTransition({ type: 'page', direction: 1 });         // next page
     *   renderWithTransition({ type: 'page', direction: -1 });        // prev page
     *   renderWithTransition({ type: 'add', tileId: 'abc' });
     *   renderWithTransition({ type: 'delete', tileId: 'abc' });
     *   renderWithTransition({ type: 'edit', tileId: 'abc' });
     *   renderWithTransition({ type: 'reorder', tileId: 'abc' });
     *   renderWithTransition({ type: 'layout' });                     // rows/cols change
     *   renderWithTransition({ type: 'fade' });                       // generic
     *
     */
    function createRenderer(gridId, renderFn) {
        let busy = false;
        let pending = null;

        /**
         * Plays a WAAPI animation and resolves when it finishes.
         * Includes a safety timeout in case the event never fires
         * (e.g. tab was hidden mid-animation).
         */
        function play(el, keyframes, options) {
            return new Promise(resolve => {
                if (!el || typeof el.animate !== 'function') return resolve();

                const anim = el.animate(keyframes, options);
                let settled = false;

                const finish = () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                };

                anim.onfinish = finish;
                anim.oncancel = finish;

                const guard = (options?.duration || 0) + 400;
                setTimeout(finish, guard);
            });
        }

        // ---- Individual animation runners ----

        async function runFade(grid) {
            await play(grid, [{ opacity: 1 }, { opacity: 0 }],
                { duration: 130, easing: 'ease-out' });
            renderFn();
            await play(grid, [{ opacity: 0 }, { opacity: 1 }],
                { duration: 180, easing: 'ease-in' });
        }

        async function runPage(grid, direction) {
            const shift = 60 * (direction > 0 ? -1 : 1);

            await play(grid,
                [{ opacity: 1, transform: 'translateX(0)' },
                { opacity: 0, transform: `translateX(${shift}px)` }],
                { duration: 140, easing: 'ease-in' }
            );

            renderFn();

            await play(grid,
                [{ opacity: 0, transform: `translateX(${-shift}px)` },
                { opacity: 1, transform: 'translateX(0)' }],
                { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
        }

        async function runAdd(grid, tileId) {
            renderFn();
            const tile = tileId ? grid.querySelector(`.tile[data-id="${tileId}"]`) : null;
            if (!tile) return;

            await play(tile,
                [{ opacity: 0, transform: 'scale(0.55)' },
                { opacity: 1, transform: 'scale(1.08)' },
                { opacity: 1, transform: 'scale(1)' }],
                { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
            );
        }

        async function runDelete(grid, tileId) {
            const tile = tileId ? grid.querySelector(`.tile[data-id="${tileId}"]`) : null;

            if (tile) {
                await play(tile,
                    [{ opacity: 1, transform: 'scale(1)' },
                    { opacity: 0, transform: 'scale(0.4)' }],
                    { duration: 180, easing: 'ease-in' }
                );
            }

            renderFn();
        }

        async function runEdit(grid, tileId) {
            renderFn();

            const tile = tileId ? grid.querySelector(`.tile[data-id="${tileId}"]`) : null;
            if (!tile) return;

            await play(tile,
                [{ transform: 'scale(1)' },
                { transform: 'scale(1.12)' },
                { transform: 'scale(1)' }],
                { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
            );
        }

        async function runReorder(grid, tileId) {
            renderFn();

            const tile = tileId ? grid.querySelector(`.tile[data-id="${tileId}"]`) : null;
            if (!tile) return;

            await play(tile,
                [{ opacity: 0.5, transform: 'scale(0.94)' },
                { opacity: 1, transform: 'scale(1)' }],
                { duration: 220, easing: 'ease-out' }
            );
        }

        async function runLayout(grid) {
            await play(grid,
                [{ opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(0.96)' }],
                { duration: 130, easing: 'ease-in' }
            );

            renderFn();

            await play(grid,
                [{ opacity: 0, transform: 'scale(1.04)' },
                { opacity: 1, transform: 'scale(1)' }],
                { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
        }

        // ---- Main dispatcher ----

        return function run(options) {
            return new Promise(resolveRun => {
                const grid = document.getElementById(gridId);
                if (!grid) { resolveRun(); return; }

                // Only one animation at a time. Keep the latest request + its resolver.
                if (busy) {
                    if (!pending) pending = { options: options || {}, resolvers: [] };
                    else pending.options = options || {};
                    pending.resolvers.push(resolveRun);
                    return;
                }

                busy = true;

                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    busy = false;
                    resolveRun();

                    if (pending) {
                        const next = pending;
                        pending = null;
                        run(next.options).then(
                            () => next.resolvers.forEach(r => r()),
                            () => next.resolvers.forEach(r => r())
                        );
                    }
                };

                const opts = options || {};
                const type = opts.type || 'fade';

                let promise;
                switch (type) {
                    case 'instant':
                        renderFn();
                        finish();
                        return;
                    case 'page':
                        promise = runPage(grid, opts.direction ?? 1);
                        break;
                    case 'add':
                        promise = runAdd(grid, opts.tileId);
                        break;
                    case 'delete':
                        promise = runDelete(grid, opts.tileId);
                        break;
                    case 'edit':
                        promise = runEdit(grid, opts.tileId);
                        break;
                    case 'reorder':
                        promise = runReorder(grid, opts.tileId);
                        break;
                    case 'layout':
                        promise = runLayout(grid);
                        break;
                    case 'fade':
                    default:
                        promise = runFade(grid);
                }

                promise.then(finish, finish);
            });
        };
    }

    return {
        createRenderer
    }
})());