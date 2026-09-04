import { TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getBlacksmith, showSquireToast } from './helpers.js';
import {
    getBuilds, createBuild, deleteBuild, duplicateBuild, buildSummary, applyBuild
} from './utility-builds.js';
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
                actorName: this.actor?.name ?? 'this character',
                // Every figure comes from buildSummary, so the tile and the
                // window cannot disagree about the same build.
                builds: builds.map(build => {
                    const summary = buildSummary(this.actor, build);
                    return {
                        id: build.id,
                        name: build.name,
                        preview: summary.preview,
                        armorClass: summary.armorClass.value,
                        gearCount: summary.gearCount,
                        gearMax: summary.gearMax,
                        spellCount: summary.spellCount,
                        weight: summary.weight,
                        missingCount: summary.missingCount
                    };
                })
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

            // Apply is checked BEFORE the row, because the button lives inside
            // it and a click on one is a click on both.
            const applyButton = event.target.closest('.build-tile-apply');
            if (applyButton) {
                event.preventDefault();
                event.stopPropagation();
                await this._applyBuild(applyButton.dataset.buildId);
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
                    name: 'Equip This Build',
                    icon: 'fa-solid fa-person-running',
                    callback: () => this._applyBuild(buildId)
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

    /**
     * Equip a build, after asking.
     *
     * Asks because this is the only thing in the Builds feature that writes to
     * the character, and it writes a lot: every equippable item and every
     * preparable spell on the sheet can change in one click. The confirmation
     * names what will happen rather than saying "are you sure", which is the
     * weakest possible form of the question — the same reasoning the cleanup
     * window's preview follows.
     */
    async _applyBuild(buildId) {
        const build = getBuilds(this.actor).find(b => b.id === buildId);
        if (!build) return;

        const summary = buildSummary(this.actor, build);
        const spellLine = summary.spellCount
            ? `<li>Prepare its ${summary.spellCount} spell${summary.spellCount === 1 ? '' : 's'}, and unprepare everything else that counts against a limit.</li>`
            : '';
        const imageLine = (build.images?.portrait || build.images?.token)
            ? '<li>Change the portrait or token artwork.</li>'
            : '';

        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Equip Build',
            content: `<p>Equip <strong>${foundry.utils.escapeHTML(build.name)}</strong> on `
                + `<strong>${foundry.utils.escapeHTML(this.actor.name)}</strong>?</p>`
                + '<p>This will:</p><ul>'
                + `<li>Equip the ${summary.gearCount} item${summary.gearCount === 1 ? '' : 's'} in this build, and unequip everything else.</li>`
                + spellLine
                + imageLine
                + '</ul><p>Attunement is not changed.</p>',
            confirmLabel: 'Equip Build',
            confirmIcon: 'fa-solid fa-person-running'
        });
        if (!confirmed) return;

        const result = await applyBuild(this.actor, build);
        if (!result) return;

        // A receipt, not a shrug. "Nothing changed" is a real and useful outcome
        // — it means the character was already wearing this — and saying so is
        // better than a success message that looks identical to a no-op.
        const changes = [];
        if (result.equipped) changes.push(`equipped ${result.equipped}`);
        if (result.unequipped) changes.push(`unequipped ${result.unequipped}`);
        if (result.prepared) changes.push(`prepared ${result.prepared}`);
        if (result.unprepared) changes.push(`unprepared ${result.unprepared}`);

        showSquireToast(
            changes.length ? build.name : `${build.name} was already equipped`,
            {
                subtitle: changes.length ? `${changes.join(', ')}.` : undefined,
                icon: 'fa-solid fa-person-running'
            }
        );

        await this.render(this.element);
    }

    destroy() {
        this._listenerController?.abort();
        this._listenerController = null;
        this.element = null;
    }
}
