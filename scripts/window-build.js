import { TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { renderTemplate } from './helpers.js';
import {
    BUILD_BODY_SLOTS, BUILD_WEAPON_SLOTS, BUILD_SLOT_KEYS,
    getBuild, renameBuild, setBuildSlot, resolveSlots, attunementSummary
} from './utility-builds.js';

/**
 * The base class comes from Blacksmith's bridge module, not from `module.api` —
 * see the note in window-cleanup.js for why `extends` cannot wait for `game`.
 */
import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

/**
 * One gear build: a paper doll you drag items onto.
 *
 * Reads the actor and writes only its own flag. Nothing in here touches
 * `system.equipped` — a build records what you would wear, and making it
 * actually wear things is a separate feature with its own questions to answer
 * (what gets unequipped, what about attunement, what about items you no longer
 * own). The note at the foot of the window says so, because a ring of slots
 * around a portrait otherwise reads as a statement about the character now.
 */
export class BuildWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            // squire-tool-window carries the shared height chain, the same way
            // the cleanup window does.
            classes: ['squire-tool-window', 'squire-build-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Gear Build', resizable: false, minimizable: true },
            windowSizeConstraints: { minWidth: 460, maxWidth: 720 },
            toolTitlebar: 'full',
            rememberPosition: false
        }
    );

    constructor(options = {}) {
        super(options);
        this.actor = options.actor ?? null;
        this.buildId = options.buildId ?? null;
    }

    /**
     * Open the window for one build, or focus it if it is already open.
     *
     * Keyed on the BUILD, not the actor: two builds open side by side is the
     * point of having more than one, and keying on the actor would make the
     * second click steal the first window. The id carries both, so a repeat
     * click on the same build finds the same application instead of stacking a
     * duplicate on top of it.
     *
     * Uses `foundry.applications.instances` rather than the base class's
     * per-target registry, because that registry keys on a document and a build
     * is a flag entry rather than one.
     */
    static async open(actor, buildId) {
        if (!actor || !buildId) return null;

        const id = `squire-build-${actor.id}-${buildId}`;
        const existing = foundry.applications.instances.get(id);
        if (existing) {
            existing.bringToFront?.();
            return existing;
        }

        const win = new BuildWindow({ id, actor, buildId });
        await win.render({ force: true });
        return win;
    }

    /** The build this window is showing, re-read every time rather than cached. */
    get build() {
        return getBuild(this.actor, this.buildId);
    }

    /**
     * Redraw this window and the tray's tile for it.
     *
     * The tile carries the name and a filled-slot count, so every change made
     * here is a change to something visible over there. Nothing else refreshes
     * it: the Builds panel has no hooks of its own, by design — a flag write
     * that fires `updateActor` would re-render the whole tray for a slot.
     */
    async _refresh() {
        await this.render(false);
        const panel = PanelManager.instance?.buildsPanel;
        if (panel) await panel.render(PanelManager.element);
    }

    async getData() {
        const build = this.build;

        // A build deleted from the panel while its window is open leaves nothing
        // to draw. Say so rather than rendering sixteen empty slots that would
        // silently write back to a build that no longer exists.
        if (!build) {
            return {
                appId: this.id,
                bodyContent: '<p class="squire-build-note">This build has been deleted.</p>'
            };
        }

        const bodySlots = resolveSlots(this.actor, build, BUILD_BODY_SLOTS);
        const weaponSlots = resolveSlots(this.actor, build, BUILD_WEAPON_SLOTS);

        // Counted across BOTH grids: a build's attunement cost is the whole set,
        // and a sword is as capable of demanding attunement as an amulet.
        const attunement = attunementSummary(this.actor, [...bodySlots, ...weaponSlots]);

        return {
            appId: this.id,
            bodyContent: await renderTemplate(TEMPLATES.WINDOW_BUILD, {
                build,
                actorName: this.actor?.name ?? '',
                actorImg: this.actor?.img ?? 'icons/svg/mystery-man.svg',
                bodySlots,
                weaponSlots,
                attunement: { ...attunement, over: attunement.used > attunement.max }
            })
        };
    }

    /**
     * Listeners are bound here rather than through ACTION_HANDLERS because these
     * are drag events and a text input, none of which `data-action` covers.
     * The API's note that scripts inside body HTML do not run is the same reason.
     */
    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const root = this.element;
        if (!root) return;

        // Rename on blur and on Enter, not on every keystroke: each write is an
        // actor flag update that re-renders the builds panel, and doing that per
        // character typed would fight the caret.
        const nameInput = root.querySelector('.squire-build-name');
        if (nameInput) {
            const commit = async () => {
                const value = nameInput.value;
                if (value.trim() && value !== this.build?.name) {
                    await renameBuild(this.actor, this.buildId, value);
                    await this._refresh();
                }
            };
            nameInput.addEventListener('blur', commit);
            nameInput.addEventListener('keydown', async (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    nameInput.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    nameInput.value = this.build?.name ?? '';
                    nameInput.blur();
                }
            });
        }

        root.querySelectorAll('.squire-build-slot').forEach(slot => {
            // dragover must preventDefault or the browser refuses the drop. The
            // class is added here rather than on dragenter because dragenter
            // fires again for every child element crossed, and a slot with an
            // image in it has children.
            slot.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                slot.classList.add('is-drop-target');
            });

            slot.addEventListener('dragleave', (event) => {
                // Only when the pointer has actually left the slot, not when it
                // crosses onto a child of it.
                if (!slot.contains(event.relatedTarget)) slot.classList.remove('is-drop-target');
            });

            slot.addEventListener('drop', (event) => this._onDrop(event, slot));

            // Right-click empties a slot. A visible × on every filled slot was
            // the alternative and it costs a control on all sixteen to serve the
            // rarest thing anyone does here; the tooltip says so.
            slot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const slotKey = slot.dataset.slot;
                if (!this.build?.slots?.[slotKey]) return;
                await setBuildSlot(this.actor, this.buildId, slotKey, null);
                await this._refresh();
            });
        });
    }

    /**
     * Accept an item drop into one slot.
     *
     * Only items this actor owns. A drop from a compendium, another sheet or the
     * canvas resolves to an item belonging to someone else, and storing its id
     * would produce a slot that renders empty forever — the id would never
     * resolve against this actor. Rejecting it with a warning is the honest
     * answer to "why did nothing happen".
     */
    async _onDrop(event, slot) {
        event.preventDefault();
        event.stopPropagation();
        slot.classList.remove('is-drop-target');

        const slotKey = slot.dataset.slot;
        if (!BUILD_SLOT_KEYS.includes(slotKey) || !this.build) return;

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }
        if (data?.type !== 'Item') return;

        // toDragData() gives a uuid; the flag stores an id. fromUuid resolves
        // both an owned item and a foreign one, which is exactly what makes the
        // ownership check below possible rather than a guess from the string.
        const item = data.uuid ? await fromUuid(data.uuid) : null;
        if (!item) return;

        if (item.parent?.id !== this.actor?.id) {
            ui.notifications.warn(`${item.name} is not on this character's sheet, so it cannot go in a build.`);
            return;
        }

        await setBuildSlot(this.actor, this.buildId, slotKey, item.id);
        await this._refresh();
    }
}
