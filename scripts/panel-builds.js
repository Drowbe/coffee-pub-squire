import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { getBuilds, getActiveBuildId, buildSummary, resolveTileImage } from './utility-builds.js';
import { BuildWindow } from './window-build.js';

/**
 * THE FAVOURITE BUILDS, IN THE TRAY.
 *
 * A build is planned in a window and worn from one — which is fine for making
 * them and wrong for using them. The thing you actually do at a table is put a
 * kit on, and that was three clicks away behind a window nobody has open.
 *
 * So the ones marked FAVOURITE come out here, under the item favourites, where
 * they can be worn with a click.
 *
 * IT DISAPPEARS WHEN IT IS EMPTY, and that is the whole of its visibility rule.
 * Most characters never make a build; a permanent empty panel would be a
 * standing question put to every one of them. Star one and it appears.
 *
 * NOT the same list as the builds on the tray handle. The handle is a narrow
 * strip with room for two or three and costs screen space whether or not the
 * tray is open; this is a panel in a column that already scrolls. A build can be
 * in both, one, or neither.
 */
export class BuildsPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
        this._listenerController = null;
    }

    /** The favourited builds, with what the tray needs to draw each one. */
    _getBuilds() {
        if (!this.actor) return [];

        const activeId = getActiveBuildId(this.actor);

        return getBuilds(this.actor)
            .filter(build => build.favorite)
            .map(build => {
                const summary = buildSummary(this.actor, build);
                return {
                    id: build.id,
                    name: build.name,
                    img: resolveTileImage(this.actor, build),
                    costume: build.mode === 'costume',
                    // Worn is a fact about the character, not about the build,
                    // and it is the one thing this list can say that the window
                    // says better — so it says it briefly and gets out of the way.
                    worn: build.id === activeId,
                    armorClass: summary.armorClass.value,
                    gearCount: summary.gearCount
                };
            });
    }

    async render(html) {
        if (html) this.element = getNativeElement(html);
        if (!this.element) return;

        this.panelManager = PanelManager.instance;

        const panel = this.element.querySelector('[data-panel="builds"]');
        if (!panel) return;

        const builds = this._getBuilds();

        // Nothing starred, nothing drawn. Emptying the container rather than
        // hiding it means the panel takes no space and leaves no gap between
        // the favourites above and the sheet below.
        if (!builds.length) {
            this._removeEventListeners();
            panel.innerHTML = '';
            return;
        }

        panel.innerHTML = await renderTemplate(TEMPLATES.PANEL_BUILDS, { builds });

        this._removeEventListeners();
        this._listenerController = new AbortController();
        this._activateListeners(panel, this._listenerController.signal);
    }

    _removeEventListeners() {
        this._listenerController?.abort();
        this._listenerController = null;
    }

    _activateListeners(panel, signal) {
        // Delegated: the rows are rebuilt whenever a build changes, and a
        // listener per row would die with the row it was on.
        panel.addEventListener('click', async (event) => {
            const row = event.target.closest('.squire-tray-build[data-build-id]');
            if (!row) return;

            event.preventDefault();
            // Applying from here goes through the same path the window uses, so
            // the confirmation, the approval, the sound, the undo toast and the
            // tray refresh all behave identically. A second way in must not mean
            // a second set of rules.
            await BuildWindow.applyFromAnywhere(this.actor, row.dataset.buildId);
        }, { signal });

        // Right-click opens the builder ON this build, which is the other thing
        // somebody wants from a row like this: not to wear it, but to change it.
        panel.addEventListener('contextmenu', async (event) => {
            const row = event.target.closest('.squire-tray-build[data-build-id]');
            if (!row) return;

            event.preventDefault();
            await BuildWindow.open(this.actor, row.dataset.buildId);
        }, { signal });
    }
}
