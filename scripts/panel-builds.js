import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getBlacksmith, showSquireToast } from './helpers.js';
import {
    getBuilds, getActiveBuildId, buildSummary, resolveTileImage,
    getHandleBuildIds, addBuildToHandle, removeBuildFromHandle, toggleBuildFavorite
} from './utility-builds.js';
import { BuildWindow } from './window-build.js';

/** Blacksmith addresses an open menu by id, so this is how it gets closed. */
const BUILD_MENU_ID = 'squire-build-tray-menu';

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
 *
 * Constructed like the Favourites panel: same header switch, same overlay click,
 * same ⋯ / right-click menu, same tile CSS. A second shape here is a second set
 * of rules, and a second set is a set that drifts.
 */
export class BuildsPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
        this._listenerController = null;
    }

    /** List or tiles. A user setting, like the favourites panel's. */
    static getLayout() {
        try {
            return game.settings.get(MODULE.ID, 'buildsLayout') === 'tiles' ? 'tiles' : 'list';
        } catch (error) {
            return 'list';
        }
    }

    /** The favourited builds, with what the tray needs to draw each one. */
    _getBuilds() {
        if (!this.actor) return [];

        const activeId = getActiveBuildId(this.actor);
        const onHandle = new Set(getHandleBuildIds(this.actor));

        return getBuilds(this.actor)
            .filter(build => build.favorite)
            .map(build => {
                const summary = buildSummary(this.actor, build);
                const costume = build.mode === 'costume';
                return {
                    id: build.id,
                    name: build.name,
                    img: resolveTileImage(this.actor, build),
                    costume,
                    // Worn is a fact about the character, not about the build,
                    // and it is the one thing this list can say that the window
                    // says better — so it says it briefly and gets out of the way.
                    worn: build.id === activeId,
                    onHandle: onHandle.has(build.id),
                    armorClass: summary.armorClass.value,
                    gearCount: summary.gearCount,
                    // Drawn only by the tile layout, which hides the rest of the
                    // row's context behind a clipped two-line name. The list has
                    // the whole panel width and does not need a second line.
                    detailLabel: costume
                        ? 'Costume'
                        : `AC ${summary.armorClass.value} · ${summary.gearCount}`
                };
            });
    }

    async render(html) {
        if (!html) return;

        const nativeHtml = getNativeElement(html);
        this.element = nativeHtml;
        if (!this.element) return;

        this.panelManager = PanelManager.instance;

        const panel = this.element.querySelector('[data-panel="builds"]');
        if (!panel) return;

        // Guarded, and loudly. This panel draws nothing when nothing is
        // favourited, so a failure in here is indistinguishable from a character
        // who has made no builds — the one shape of bug that reports itself as
        // normal behaviour. If the summary cannot be computed, say so rather
        // than showing an empty column.
        let builds;
        try {
            builds = this._getBuilds();
        } catch (error) {
            console.error('Coffee Pub Squire | The Builds panel could not read the builds:', error);
            return;
        }

        this._removeEventListeners(panel);

        // ALWAYS RENDER, and let the template draw nothing when there is nothing
        // — which is what every other panel here does.
        panel.innerHTML = await renderTemplate(TEMPLATES.PANEL_BUILDS, {
            builds,
            layout: BuildsPanel.getLayout()
        });

        this._activateListeners(this.element);

        PanelManager.instance?.controlPanel?.reapplyFilters();
    }

    _removeEventListeners(panel) {
        this._listenerController?.abort();
        this._listenerController = null;
        getBlacksmith()?.uiContextMenu?.close(BUILD_MENU_ID);
    }

    _buildMenuItems(buildId) {
        const row = this._getBuilds().find(build => build.id === buildId);
        if (!row) return [];

        return [
            row.costume
                ? { name: 'Wear This Costume', icon: 'fa-solid fa-masks-theater',
                    callback: () => this._apply(buildId) }
                : { name: 'Equip This Build', icon: 'fa-solid fa-shirt',
                    callback: () => this._apply(buildId) },
            { name: 'Edit', icon: 'fa-solid fa-pen',
              callback: () => BuildWindow.open(this.actor, buildId) },
            { separator: true },
            row.onHandle
                ? { name: 'Remove from Handle', icon: 'fa-solid fa-dagger',
                    callback: () => this._toggleHandle(buildId, true) }
                : { name: 'Add to Handle', icon: 'fa-solid fa-dagger',
                    callback: () => this._toggleHandle(buildId, false) },
            { name: 'Remove from Favorites', icon: 'fa-solid fa-heart-crack',
              callback: () => this._unfavourite(buildId) }
        ];
    }

    async _apply(buildId) {
        try {
            await BuildWindow.applyFromAnywhere(this.actor, buildId);
        } catch (error) {
            console.error('Coffee Pub Squire | Could not apply the build from the tray:', error);
        }
    }

    async _toggleHandle(buildId, onHandle) {
        try {
            if (onHandle) await removeBuildFromHandle(this.actor, buildId);
            else await addBuildToHandle(this.actor, buildId);
            const name = this._getBuilds().find(build => build.id === buildId)?.name
                ?? getBuilds(this.actor).find(build => build.id === buildId)?.name;
            showSquireToast(name || 'Build', {
                subtitle: onHandle ? 'Taken off the tray handle' : 'Added to the tray handle',
                icon: 'fa-solid fa-dagger'
            });
            await PanelManager.instance?.updateHandle();
            await this.render(this.element);
        } catch (error) {
            console.error('Coffee Pub Squire | Could not update the handle from the Builds panel:', error);
        }
    }

    async _unfavourite(buildId) {
        try {
            await toggleBuildFavorite(this.actor, buildId);
            await this.render(this.element);
            await PanelManager.instance?.updateHandle();
        } catch (error) {
            console.error('Coffee Pub Squire | Could not unfavourite the build:', error);
        }
    }

    _activateListeners(html) {
        if (!html) return;

        const nativeHtml = getNativeElement(html);
        const panel = nativeHtml?.querySelector('[data-panel="builds"]');
        if (!panel) return;

        this._removeEventListeners(panel);
        this._listenerController = new AbortController();
        const signal = this._listenerController.signal;

        // Two ways in, one menu: right-click anywhere on the row, or the ⋯.
        // Blacksmith's menu, not Foundry's — a tile is overflow:hidden, and
        // Foundry injects into the row, which clips the menu to nothing. Same
        // reason Favourites does not use Foundry's ContextMenu.
        const openRowMenu = (event) => {
            const row = event.target.closest('.squire-tray-build[data-build-id]');
            if (!row) return;

            event.preventDefault();
            event.stopPropagation();

            const items = this._buildMenuItems(row.dataset.buildId);
            if (!items.length) return;

            getBlacksmith()?.uiContextMenu?.show({
                id: BUILD_MENU_ID,
                x: event.clientX,
                y: event.clientY,
                zones: items,
                className: 'squire-favorite-context-menu'
            });
        };

        panel.addEventListener('contextmenu', openRowMenu, { signal });
        panel.addEventListener('click', (event) => {
            if (event.target.closest('.squire-item-menu')) openRowMenu(event);
        }, { signal });

        // Primary action — the overlay on the picture, the same target every
        // other panel in this tray uses for a row's click. Equipping from a
        // click anywhere on the row was both the odd one out and the riskier of
        // the two: a build takes off everything it does not name.
        panel.addEventListener('click', async (event) => {
            const overlay = event.target.closest('.panel-item-image-container .panel-item-roll-overlay');
            if (!overlay) return;

            const row = overlay.closest('.squire-tray-build[data-build-id]');
            if (!row) return;

            event.preventDefault();
            event.stopPropagation();
            await this._apply(row.dataset.buildId);
        }, { signal });

        // List / tiles. Delegated on the panel like Favourites, and re-rendered
        // rather than just re-classed so the header's lit state stays in step.
        panel.addEventListener('click', async (event) => {
            const toggle = event.target.closest('.builds-layout-toggle');
            if (!toggle) return;
            event.preventDefault();
            event.stopPropagation();

            const wanted = toggle.dataset.layout === 'tiles' ? 'tiles' : 'list';
            if (wanted === BuildsPanel.getLayout()) return;

            try {
                await game.settings.set(MODULE.ID, 'buildsLayout', wanted);
                await this.render(this.element);
            } catch (error) {
                console.error('Coffee Pub Squire | Could not switch the Builds layout:', error);
            }
        }, { signal });
    }
}
