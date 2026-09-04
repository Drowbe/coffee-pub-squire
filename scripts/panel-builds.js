import { TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getBlacksmith } from './helpers.js';
import { BUILD_SLOT_KEYS, getBuilds, createBuild, deleteBuild, duplicateBuild } from './utility-builds.js';
import { BuildWindow } from './window-build.js';

/** Blacksmith addresses an open menu by id; this is how this panel's gets closed. */
const BUILD_MENU_ID = 'squire-build-menu';

/**
 * The Builds section, above Favorites in the favourites view.
 *
 * A thin panel: the list of builds and the two gestures that manage it. Every
 * build's contents live behind its own window, because sixteen slots around a
 * portrait is not a thing that fits in a 400px column.
 */
export class BuildsPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
        this._listenerController = null;
    }

    /**
     * Draw the section.
     *
     * Wrapped in its own try/catch because PanelManager calls this WITHOUT
     * awaiting it, alongside every other panel. An unhandled rejection there is
     * invisible: the container stays empty and nothing anywhere says why, which
     * is exactly how this panel spent its first outing looking like a wiring
     * problem. The same reasoning the cleanup launcher's click handler carries.
     */
    async render(html) {
        if (!html) return;

        this.element = getNativeElement(html);
        if (!this.element?.querySelector('[data-panel="builds"]')) return;

        try {
            const builds = this.actor ? getBuilds(this.actor) : [];

            const content = await renderTemplate(TEMPLATES.PANEL_BUILDS, {
                // `hasBuilds` rather than testing the array in the template: an
                // empty array is TRUTHY in Handlebars, so `{{#if builds}}` was
                // taking the populated branch and rendering nothing at all —
                // the empty-state message could never appear.
                hasBuilds: builds.length > 0,
                builds: builds.map(build => ({
                    id: build.id,
                    name: build.name,
                    // A count rather than a preview: the tile is small, and
                    // "7 of 16" answers "did I finish this one" — which is the
                    // only question a list of builds is asked before one is
                    // opened.
                    filledCount: Object.values(build.slots).filter(Boolean).length,
                    slotCount: BUILD_SLOT_KEYS.length
                }))
            });

            // Re-query AFTER the await rather than reusing the node found above.
            //
            // PanelManager builds a brand-new tray element, appends it and
            // reassigns `PanelManager.element` — and it fires every panel's
            // render without awaiting any of them. So a tray rebuilt while this
            // template was being fetched leaves the node found before the await
            // detached, and writing to it puts this panel's markup in a document
            // fragment nobody is looking at. That is not hypothetical: it is
            // exactly how this panel spent its first outing rendering perfectly
            // into nothing. Favourites never showed the bug because six other
            // call sites re-render it afterwards; this one has none.
            const panel = (PanelManager.element ?? this.element)
                ?.querySelector('[data-panel="builds"]');
            if (!panel) return;

            panel.innerHTML = content;
            this._activateListeners(panel);
        } catch (error) {
            console.error('Coffee Pub Squire | Failed to render the Builds panel:', error);
        }
    }

    _activateListeners(panel) {
        // Same AbortController teardown the favourites panel uses: one signal,
        // aborted on the next render, no element cloning.
        this._listenerController?.abort();
        this._listenerController = new AbortController();
        const signal = this._listenerController.signal;

        panel.addEventListener('click', async (event) => {
            if (event.target.closest('.builds-create')) {
                event.preventDefault();
                event.stopPropagation();
                if (!this.actor) return;
                // Opens what it just made. Creating a build and then having to
                // find and click it is two gestures for one intention.
                const build = await createBuild(this.actor);
                await this.render(this.element);
                await BuildWindow.open(this.actor, build.id);
                return;
            }

            const tile = event.target.closest('.build-tile');
            if (!tile) return;
            event.preventDefault();
            event.stopPropagation();
            await BuildWindow.open(this.actor, tile.dataset.buildId);
        }, { signal });

        panel.addEventListener('contextmenu', (event) => {
            const tile = event.target.closest('.build-tile');
            if (!tile) return;
            event.preventDefault();
            event.stopPropagation();

            const buildId = tile.dataset.buildId;
            const build = getBuilds(this.actor).find(b => b.id === buildId);
            if (!build) return;

            getBlacksmith().uiContextMenu.show({
                id: BUILD_MENU_ID,
                x: event.clientX,
                y: event.clientY,
                zones: [{
                    name: 'Open',
                    icon: 'fa-solid fa-up-right-from-square',
                    callback: () => BuildWindow.open(this.actor, buildId)
                }, {
                    // The obvious next move once a build is full is "the same,
                    // but swap one thing" — sixteen drags without this.
                    name: 'Duplicate',
                    icon: 'fa-solid fa-clone',
                    callback: async () => {
                        const copy = await duplicateBuild(this.actor, buildId);
                        await this.render(this.element);
                        if (copy) await BuildWindow.open(this.actor, copy.id);
                    }
                }, {
                    separator: true
                }, {
                    // Deleting is the one destructive thing this panel does, and
                    // a build is a lot of drags to rebuild — so it asks, the same
                    // way clearing all favourites does.
                    name: 'Delete Build',
                    icon: 'fa-solid fa-trash',
                    callback: async () => {
                        const confirmed = await getBlacksmith().dialog.confirm({
                            title: 'Delete Build',
                            content: `<p>Delete <strong>${foundry.utils.escapeHTML(build.name)}</strong>?</p><p>This cannot be undone.</p>`,
                            confirmLabel: 'Delete Build',
                            confirmIcon: 'fa-solid fa-trash',
                            destructive: true
                        });
                        if (!confirmed) return;
                        await deleteBuild(this.actor, buildId);
                        await this.render(this.element);
                    }
                }],
                className: 'squire-favorite-context-menu'
            });
        }, { signal });
    }

    destroy() {
        this._listenerController?.abort();
        this._listenerController = null;
        this.element = null;
    }
}
