import { TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { renderTemplate, showSquireToast } from './helpers.js';
import {
    BUILD_BODY_SLOTS, BUILD_WEAPON_SLOTS, BUILD_SLOT_KEYS,
    getBuild, renameBuild, setBuildSlot, resolveSlots, attunementSummary,
    getPreparingClasses, getSpellSlots, getCantrips, resolvePreparedSpells, setBuildSpell,
    refuseSlotDrop, gearWeight, resolveImageSlots, setBuildImage, captureDefaultImages,
    estimateArmorClass, previewSlotChange
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
/** How much width the build rail takes. Mirrored in panel-builds.css. */
const RAIL_WIDTH = 180;

export class BuildWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            // squire-tool-window carries the shared height chain, the same way
            // the cleanup window does.
            classes: ['squire-tool-window', 'squire-build-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Gear Build', resizable: false, minimizable: true },
            windowSizeConstraints: { minWidth: 460, maxWidth: 980 },
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

        // A caster needs the second column; everyone else would get 300px of
        // empty. Set at construction because options are frozen afterwards.
        // The rail adds its own column on top of the doll and, for a caster,
        // the spell page.
        const width = (getPreparingClasses(actor).length ? 840 : 520) + RAIL_WIDTH;
        // Before the window is even drawn. Applying a build will one day
        // overwrite the actor's portrait and token, and once it has, the
        // character's own artwork exists nowhere — so it is recorded at the
        // first moment a build is in play at all. Idempotent, so opening a
        // second window cannot overwrite what the first one captured.
        await captureDefaultImages(actor);

        // Whichever build was asked for, else the first there is. Opening on
        // nothing would make the common case — one build — need a click before
        // it showed anything.
        const selected = buildId ?? getBuilds(actor)[0]?.id ?? null;
        const win = new BuildWindow({ id, actor, buildId: selected, position: { width, height: 'auto' } });
        await win.render({ force: true });
        return win;
    }

    /** The build this window is showing, re-read every time rather than cached. */
    get build() {
        return getBuild(this.actor, this.buildId);
    }

    /**
     * Equip a build without a window necessarily being open.
     *
     * The handle needs to apply builds too, and the confirmation, the rules and
     * the receipt should exist once rather than in every place that can trigger
     * them. An open window applies through itself so its own view refreshes;
     * anything else gets a detached instance that never renders.
     */
    static async applyFromAnywhere(actor, buildId) {
        const open = foundry.applications.instances.get(`squire-builds-${actor.id}`);
        if (open) return open.applySelected(buildId);

        const detached = new BuildWindow({ id: `squire-builds-apply-${foundry.utils.randomID()}`, actor });
        await detached.applySelected(buildId);
    }

    /** Show a different build. */
    async selectBuild(buildId) {
        if (!buildId || buildId === this.buildId) return;
        this.buildId = buildId;
        await this.render(false);
    }

    /** Make one and show it. */
    async createAndSelect() {
        const build = await createBuild(this.actor);
        this.buildId = build.id;
        await this._refresh();
    }

    async duplicateSelected(buildId) {
        const copy = await duplicateBuild(this.actor, buildId);
        if (copy) this.buildId = copy.id;
        await this._refresh();
    }

    async deleteSelected(buildId) {
        const build = getBuild(this.actor, buildId);
        if (!build) return;

        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Delete Build',
            content: `<p>Delete <strong>${foundry.utils.escapeHTML(build.name)}</strong>?</p><p>This cannot be undone.</p>`,
            confirmLabel: 'Delete Build',
            confirmIcon: 'fa-solid fa-trash',
            destructive: true
        });
        if (!confirmed) return;

        await deleteBuild(this.actor, buildId);
        // Fall to whatever is left rather than showing a build that is gone.
        if (this.buildId === buildId) this.buildId = getBuilds(this.actor)[0]?.id ?? null;
        await this._refresh();
    }

    /**
     * Equip the selected build, after asking.
     *
     * The confirmation names what will happen rather than asking "are you sure",
     * which is the weakest form of the question — nobody can evaluate a prompt
     * that does not say what it will do. Same reasoning as the cleanup window.
     */
    async applySelected(buildId) {
        const build = getBuild(this.actor, buildId);
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
                + spellLine + imageLine
                + '</ul><p>Attunement is not changed.</p>',
            confirmLabel: 'Equip Build',
            confirmIcon: 'fa-solid fa-person-running'
        });
        if (!confirmed) return;

        const result = await applyBuild(this.actor, build);
        if (!result) return;

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

        await this._refresh();
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
        // `rendered` guards the detached instance applyFromAnywhere() builds to
        // borrow the apply logic — it has no DOM and must not grow one.
        if (this.rendered) await this.render(false);

        // The handle can carry builds, and their armour class and item pictures
        // come from the same build this just changed.
        await PanelManager.instance?.handleManager?.updateHandle();
    }

    async getData() {
        const build = this.build;

        const builds = getBuilds(this.actor);
        const rail = builds.map(entry => {
            const summary = buildSummary(this.actor, entry);
            return {
                id: entry.id,
                name: entry.name,
                active: entry.id === this.buildId,
                armorClass: summary.armorClass.value,
                gearCount: summary.gearCount,
                preview: summary.preview.slice(0, 3)
            };
        });

        // `build` may be null — no builds yet, or the selected one was deleted.
        // The doll still resolves, as sixteen empty slots, and the template hides
        // it behind `hasBuilds`; resolveSlots reading a null build is exactly the
        // "never filled" case it already handles.
        const bodySlots = resolveSlots(this.actor, build, BUILD_BODY_SLOTS);
        const weaponSlots = resolveSlots(this.actor, build, BUILD_WEAPON_SLOTS);

        // Counted across BOTH grids: a build's attunement cost is the whole set,
        // and a sword is as capable of demanding attunement as an amulet.
        const attunement = attunementSummary(this.actor, [...bodySlots, ...weaponSlots]);

        // One section per class that prepares. `used` counts what this BUILD has
        // slotted, not what the sheet currently has prepared — the window is
        // asking whether the plan fits, not reporting today's state.
        const casters = getPreparingClasses(this.actor).map(casterClass => {
            const slots = resolvePreparedSpells(this.actor, build, casterClass);
            return {
                ...casterClass,
                slots,
                used: slots.filter(slot => slot.filled).length
            };
        });

        return {
            appId: this.id,
            bodyContent: await renderTemplate(TEMPLATES.WINDOW_BUILD, {
                rail,
                hasBuilds: builds.length > 0,
                build,
                actorName: this.actor?.name ?? '',
                actorImg: this.actor?.img ?? 'icons/svg/mystery-man.svg',
                bodySlots,
                weaponSlots,
                attunement: { ...attunement, over: attunement.used > attunement.max },
                weight: gearWeight(this.actor, build),
                armorClass: estimateArmorClass(this.actor, build),
                imageSlots: resolveImageSlots(this.actor, build),
                casters,
                cantrips: casters.length ? getCantrips(this.actor) : [],
                spellSlots: casters.length ? getSpellSlots(this.actor) : []
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

        // The rail. Delegated on the strip, because its rows are rebuilt on every
        // selection and per-row listeners would die with them.
        const rail = root.querySelector('.squire-build-rail');
        if (rail) {
            rail.addEventListener('click', async (event) => {
                if (event.target.closest('.squire-build-rail-new')) {
                    await this.createAndSelect();
                    return;
                }

                const apply = event.target.closest('.squire-build-rail-apply');
                if (apply) {
                    event.stopPropagation();
                    await this.applySelected(apply.dataset.buildId);
                    return;
                }

                const entry = event.target.closest('.squire-build-rail-entry');
                if (entry) await this.selectBuild(entry.dataset.buildId);
            });

            // Dragging a rail entry onto the tray handle keeps that build within
            // reach when the tray is shut. A flag rather than a payload, because
            // dataTransfer is protected during dragover and the handle has to
            // know it is being offered a BUILD before the drop — the same reason
            // the tray parks an item id for the AC preview.
            rail.addEventListener('dragstart', (event) => {
                const entry = event.target.closest('.squire-build-rail-entry');
                if (!entry) return;

                PanelManager._buildDragId = entry.dataset.buildId;
                event.dataTransfer.effectAllowed = 'copy';
                // Deliberately not a Foundry document payload. A real one would
                // let this drop on the canvas and make something; "put this
                // build on the handle" must not be able to do that.
                event.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'squire-build', buildId: entry.dataset.buildId
                }));
            });

            rail.addEventListener('dragend', () => {
                PanelManager._buildDragId = null;
            });

            rail.addEventListener('contextmenu', (event) => {
                const entry = event.target.closest('.squire-build-rail-entry');
                if (!entry) return;
                event.preventDefault();
                event.stopPropagation();

                const buildId = entry.dataset.buildId;
                getBlacksmith().uiContextMenu.show({
                    id: 'squire-build-rail-menu',
                    x: event.clientX,
                    y: event.clientY,
                    zones: [
                        { name: 'Equip This Build', icon: 'fa-solid fa-person-running',
                          callback: () => this.applySelected(buildId) },
                        { name: 'Duplicate', icon: 'fa-solid fa-clone',
                          callback: () => this.duplicateSelected(buildId) },
                        { separator: true },
                        { name: 'Delete Build', icon: 'fa-solid fa-trash',
                          callback: () => this.deleteSelected(buildId) }
                    ],
                    className: 'squire-favorite-context-menu'
                });
            });
        }

        // Portrait and token take a click, not a drop — they hold an image path
        // rather than an item, so there is nothing on the sheet to drag in.
        // The system's own item card on anything holding an item — the same card
        // the tray rows and the character sheet show. Set here rather than in the
        // template because it replaces the slot's plain tooltip, and only a
        // FILLED slot has an item to describe; an empty one keeps its "drag
        // something here" text, which is the more useful thing to say about it.
        //
        // dnd5e's tooltip layer resolves any `.loading[data-uuid]` placeholder
        // itself, so this is three attributes rather than a lookup — see
        // applyItemTooltips() in helpers.js, which does the same for tray rows.
        root.querySelectorAll('[data-item-uuid]').forEach(element => {
            const uuid = element.dataset.itemUuid;
            if (!uuid) return;
            element.dataset.tooltip =
                `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
            element.dataset.tooltipClass = 'dnd5e2 dnd5e-tooltip item-tooltip themed theme-light';
            element.dataset.tooltipDirection ??= 'LEFT';
        });

        root.querySelectorAll('.squire-build-image-slot').forEach(slot => {
            slot.addEventListener('click', () => this._pickImage(slot.dataset.image));
            slot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.build?.images?.[slot.dataset.image]) return;
                await setBuildImage(this.actor, this.buildId, slot.dataset.image, null);
                await this._refresh();
            });
        });

        root.querySelectorAll('.squire-build-slot:not(.squire-build-image-slot), .squire-build-spell-slot').forEach(slot => {
            // dragover must preventDefault or the browser refuses the drop. The
            // class is added here rather than on dragenter because dragenter
            // fires again for every child element crossed, and a slot with an
            // image in it has children.
            slot.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                slot.classList.add('is-drop-target');
                this._previewDrop(slot);
            });

            slot.addEventListener('dragleave', (event) => {
                // Only when the pointer has actually left the slot, not when it
                // crosses onto a child of it.
                if (slot.contains(event.relatedTarget)) return;
                slot.classList.remove('is-drop-target');
                this._clearPreview();
            });

            // A drop and a cancelled drag both end the preview. Without the
            // second, dragging away and releasing over nothing would leave the
            // badge showing a swap that never happened.
            slot.addEventListener('drop', () => this._clearPreview());

            slot.addEventListener('drop', (event) => this._onDrop(event, slot));

            // Right-click empties a slot. A visible × on every filled slot was
            // the alternative and it costs a control on all sixteen to serve the
            // rarest thing anyone does here; the tooltip says so.
            slot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this._clearSlot(slot);
            });
        });
    }

    /**
     * Choose the portrait or token image for this build.
     *
     * Foundry's own picker, opened the way core opens it from a document sheet,
     * so it lands where people expect with the sources they already have. It
     * starts at whatever the slot is currently showing — the build's choice if
     * it has one, otherwise the character's own image — because the common edit
     * is a variation on the current picture rather than a search from the root.
     */
    async _pickImage(key) {
        const current = resolveImageSlots(this.actor, this.build)
            .find(slot => slot.key === key)?.path ?? '';

        const picker = new foundry.applications.apps.FilePicker.implementation({
            type: 'image',
            current,
            callback: async (path) => {
                await setBuildImage(this.actor, this.buildId, key, path);
                await this._refresh();
            },
            position: {
                top: (this.position?.top ?? 0) + 40,
                left: (this.position?.left ?? 0) + 10
            }
        });

        await picker.browse();
    }

    /**
     * Show what the hovering item would do, before it lands.
     *
     * `dataTransfer` is protected during dragover — a drop target is told that
     * something is over it, never what — so the item comes from the id the
     * tray's own dragstart parked on PanelManager. That is the same trick the
     * handle's reorder uses, and the only way to answer "would this be better?"
     * at the moment the question is actually being asked.
     *
     * Writes to the badge directly rather than re-rendering: dragover fires
     * continuously, and a re-render per frame would tear down the drag.
     */
    _previewDrop(slot) {
        const slotKey = slot.dataset.slot;
        if (!slotKey || !this.build) return;

        const itemId = PanelManager._trayDragItemId;
        const item = itemId ? this.actor?.items?.get(itemId) : null;
        // Silent on an item this slot would refuse: promising an AC change for a
        // drop that is about to be turned down would be a lie.
        if (!item || refuseSlotDrop(slotKey, item)) return;

        const now = {
            ac: estimateArmorClass(this.actor, this.build).value,
            weight: gearWeight(this.actor, this.build) ?? 0
        };
        const next = previewSlotChange(this.actor, this.build, slotKey, item.id);

        this._paintPreview(next.armorClass, next.armorClass - now.ac, next.weight);
    }

    /** Put the badge and the weight back to what the build actually is. */
    _clearPreview() {
        this._paintPreview(
            estimateArmorClass(this.actor, this.build).value,
            0,
            gearWeight(this.actor, this.build) ?? 0
        );
    }

    /**
     * Write the numbers into the badge.
     *
     * One place, so the live preview and the reset cannot drift apart in how
     * they format the same figures.
     */
    _paintPreview(armorClass, delta, weight) {
        const root = this.element;
        if (!root) return;

        const badge = root.querySelector('.squire-build-ac-badge');
        const value = root.querySelector('.squire-build-ac-badge-value');
        const deltaEl = root.querySelector('.squire-build-ac-badge-delta');
        const weightEl = root.querySelector('.squire-build-weight-value');

        if (value) value.textContent = armorClass;
        if (weightEl) weightEl.textContent = Number(weight.toFixed(2));

        if (deltaEl) {
            deltaEl.hidden = !delta;
            deltaEl.textContent = delta > 0 ? `+${delta}` : `${delta}`;
            deltaEl.classList.toggle('is-better', delta > 0);
            deltaEl.classList.toggle('is-worse', delta < 0);
        }
        badge?.classList.toggle('is-previewing', !!delta);
    }

    /**
     * Say what a dropped item changed, when it changed anything worth saying.
     *
     * Only AC and weight, and only when they moved. A silent swap is the right
     * outcome for a torch; a breastplate that costs two points of armour class
     * is the thing somebody wanted to know before they closed the window.
     */
    _reportSwap(item, before) {
        const after = {
            ac: estimateArmorClass(this.actor, this.build).value,
            weight: gearWeight(this.actor, this.build) ?? 0
        };

        const parts = [];
        if (after.ac !== before.ac) {
            const delta = after.ac - before.ac;
            parts.push(`AC ${before.ac} → ${after.ac} (${delta > 0 ? '+' : ''}${delta})`);
        }
        if (after.weight !== before.weight) {
            const delta = Number((after.weight - before.weight).toFixed(2));
            parts.push(`${delta > 0 ? '+' : ''}${delta} lb`);
        }
        if (!parts.length) return;

        showSquireToast(item.name, { subtitle: parts.join(' · '), icon: 'fa-solid fa-shield' });
    }

    /** Empty whichever kind of slot this is — gear by key, spell by class and index. */
    async _clearSlot(slot) {
        const { slot: slotKey, spellClass, spellIndex } = slot.dataset;

        if (spellClass !== undefined) {
            const list = this.build?.spells?.[spellClass] ?? [];
            if (!list[Number(spellIndex)]) return;
            await setBuildSpell(this.actor, this.buildId, spellClass, spellIndex, null);
        } else {
            if (!this.build?.slots?.[slotKey]) return;
            await setBuildSlot(this.actor, this.buildId, slotKey, null);
        }

        await this._refresh();
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

        const { slot: slotKey, spellClass, spellIndex } = slot.dataset;
        const isSpellSlot = spellClass !== undefined;
        if (!this.build) return;
        if (!isSpellSlot && !BUILD_SLOT_KEYS.includes(slotKey)) return;

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

        if (!isSpellSlot) {
            // Enforced only where dnd5e has a field to answer with — nothing
            // non-physical anywhere, plus rings, ammo, and hands. See
            // SLOT_RULES. A refusal always says what the slot wanted, because
            // "nothing happened" is the least useful answer to a failed drag.
            const refusal = refuseSlotDrop(slotKey, item);
            if (refusal) {
                ui.notifications.warn(refusal);
                return;
            }

            // Measured before and after, so a swap can say whether it was an
            // improvement. This is the honest version of "which is better": no
            // invented score, just the two numbers that actually changed.
            const before = {
                ac: estimateArmorClass(this.actor, this.build).value,
                weight: gearWeight(this.actor, this.build) ?? 0
            };

            await setBuildSlot(this.actor, this.buildId, slotKey, item.id);
            await this._refresh();
            this._reportSwap(item, before);
            return;
        }

        if (item.type !== 'spell') {
            ui.notifications.warn(`${item.name} is not a spell, so it cannot be prepared.`);
            return;
        }

        // A cantrip is always available and never counts against the limit, so
        // putting one in a prepared slot spends a slot on nothing. Refused
        // rather than allowed-and-ignored: silently accepting it would make the
        // count wrong in the one place the count is the point.
        if (item.system?.level === 0) {
            ui.notifications.warn(`${item.name} is a cantrip — it is always available and does not need preparing.`);
            return;
        }

        await setBuildSpell(this.actor, this.buildId, spellClass, spellIndex, item.id);
        await this._refresh();
    }
}
