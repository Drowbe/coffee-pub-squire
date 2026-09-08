import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate } from './helpers.js';
import { planImport, HAND_CONFLICTS } from './utility-builds.js';

/**
 * The base class comes from Blacksmith's bridge module, not from `module.api` —
 * see the note in window-cleanup.js for why `extends` cannot wait for `game`.
 */
import { BlacksmithToolWindowBaseV2, BLACKSMITH_TOOL_THEMES } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

/**
 * WHERE A CHARACTER'S EQUIPPED GEAR WOULD GO IN A BUILD, as a table to argue
 * with rather than a result to discover.
 *
 * A WINDOW rather than a dialog, and the reasons accumulated rather than being
 * designed for. It began as three tick boxes, which is dialog-shaped. Then it
 * needed a scrolling list, then a live re-sort as rows move between slots, then
 * a per-row control, then resizing — and `dialog.prompt` builds its DialogV2
 * with `window: { title }` and passes nothing else through, so resizable is
 * simply unreachable from there.
 *
 * The deeper reason is the markup. A dialog takes an HTML string, so a hundred
 * lines of table lived in a template literal where nothing checked it — which is
 * exactly where a `display: flex` on a `<td>` hid, silently emptying every
 * column. A window has a real template file.
 *
 * And "map these items onto these slots" is not only a build's problem. A
 * merchant's stock, a loot split, a body search: same screen.
 *
 * ONE PROMISE, kept in the wording and in the code: this reads what is EQUIPPED
 * and writes only the build's flag. Nothing on the character changes here.
 */
/**
 * The two controls this window listens to, named once.
 *
 * Both were spelled out at every site instead, and they drifted: the slot
 * dropdown was renamed to `-slot-select` in the markup to stop it colliding with
 * `.squire-import-slot`, the row's leading icon column, and the handler was left
 * matching the old name. `closest()` then walked past a SIBLING it could never
 * reach and returned null, so every change to a slot was dropped on the floor.
 *
 * That failed quietly and in the worst possible direction. The window kept
 * showing the value you picked, because a `select` displays its own selection
 * with or without a listener — but `answer()` reads `this.assignment`, which the
 * dead handler never wrote to, so Fill Build imported the original plan and
 * discarded every correction made to it. A visibly broken dropdown would have
 * been better; this looked like it worked.
 *
 * Constants because the markup and the listener have to agree and there is no
 * way to notice when they stop.
 */
const SLOT_CONTROL = 'squire-import-slot-select';
const PREPARED_CONTROL = 'squire-import-prepared';

export class ImportWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['squire-tool-window', 'squire-import-window'],
            // A stated height, not auto. A resizable window needs something to
            // be dragged from, and auto plus a max-height lets the cap refuse
            // the drag silently — the same reasoning as the cleanup window.
            position: { width: 620, height: 660 },
            window: { title: 'Fill From Currently Equipped', resizable: true, minimizable: true },
            windowSizeConstraints: {
                minWidth: 480,
                minHeight: 360,
                maxWidth: 900,
                maxHeight: 'calc(100vh - 80px)'
            },
            toolTitlebar: 'full',
            // DARK, like the builds window this opens from — and not only for
            // consistency. `blacksmith-list`, which draws every row here, sets
            // its title to rgba(232,232,232,.95) and its meta to
            // rgba(180,180,180,.72): light-on-dark literals rather than theme
            // tokens. On the light ground the base defaults to, that is
            // near-white text on cream and the names cannot be read.
            toolTheme: BLACKSMITH_TOOL_THEMES.DARK,
            rememberPosition: false,
            windowPositionKey: 'squire-import',
            toolThemePreferenceKey: 'squire-import-theme'
        }
    );

    static ACTION_HANDLERS = {
        cancel: (_event, _target, win) => win.decide(null),
        fill: (_event, _target, win) => win.decide(win.answer())
    };

    constructor(actor, build, options = {}) {
        super(foundry.utils.mergeObject({ id: `${MODULE.ID}-import-${actor.id}` }, options));

        this.actor = actor;
        this.build = build;
        this.plan = planImport(actor, build);

        // The proposal as a plain map of item id to slot key. EVERYTHING the
        // table draws comes from this, so a change is one write and a redraw
        // rather than a hunt through the DOM for what moved — and reading the
        // answer back cannot disagree with what was shown.
        this.assignment = Object.fromEntries(this.plan.rows.map(item => [item.id, item.slot]));
        this._resolve = null;
    }

    /**
     * Open it and wait for an answer: the decided plan, or null if dismissed.
     *
     * A promise rather than a callback because the caller reads as a sentence —
     * ask, then act on the reply — and because closing the window by any route
     * has to resolve it, or the caller waits forever.
     */
    static async ask(actor, build) {
        const win = new ImportWindow(actor, build);
        const answer = new Promise(resolve => { win._resolve = resolve; });
        await win.render({ force: true });
        return answer;
    }

    /** Hand the caller its answer once, then close. */
    async decide(value) {
        const resolve = this._resolve;
        this._resolve = null;
        resolve?.(value);
        await this.close();
    }

    /** A dismissal is an answer too — otherwise `ask()` never settles. */
    async close(options) {
        this._resolve?.(null);
        this._resolve = null;
        return super.close(options);
    }

    /** What the table currently says, read from the map rather than the DOM. */
    answer() {
        return {
            slots: { ...this.assignment },
            spells: [...(this.element?.querySelectorAll(`.${PREPARED_CONTROL}`) ?? [])]
                .filter(control => control.value)
                .map(control => control.dataset.spellId)
        };
    }

    // ==================================================================
    // DRAWING
    // ==================================================================

    /** A slot's dropdown: where this item is going, and everywhere it could. */
    _select(item, chosen) {
        const escape = foundry.utils.escapeHTML;
        return `
            <select class="blacksmith-select ${SLOT_CONTROL}" data-item-id="${item.id}">
                <option value=""${chosen ? '' : ' selected'}>&mdash; Not mapped &mdash;</option>
                ${item.options.map(option => `
                    <option value="${option.key}"${option.key === chosen ? ' selected' : ''}>
                        ${escape(option.label)}
                    </option>`).join('')}
            </select>`;
    }

    /**
     * One row, in Blacksmith's canonical shape.
     *
     * `blacksmith-list-row` is thumbnail + title + meta + action, which is
     * exactly this screen's row — and it was hand-rolled as a table with three
     * columns, a fixed layout, stated widths and its own hover, ellipsis and
     * empty state. All of that already existed. The slot's name goes in `meta`
     * where a category belongs, and the dropdown in `action`, and every rule
     * behind them is the API's.
     */
    _row(slot, item) {
        const escape = foundry.utils.escapeHTML;

        // THE SLOT IS A COLUMN, on the left of everything and the same on every
        // row. It used to be the row's `meta` line when something was in the
        // slot and the row's `title` when nothing was, so the one thing you scan
        // down the list for moved between two positions depending on whether it
        // had been filled — which is the opposite of scannable.
        //
        // The only structural addition to `blacksmith-list-row`, and it is one
        // the API's row does not have: it carries a single image zone, and this
        // screen needs two marks — what the slot is, and what is in it.
        const slotCell = `
            <div class="squire-import-slot">
                <i class="fa-solid ${escape(slot?.icon ?? 'fa-circle-question')}"></i>
                <span>${escape(slot?.label ?? 'No slot')}</span>
            </div>`;

        // An empty slot keeps every column so the list stays in line — the image
        // space included. It carries no control, because there is nothing to
        // decide on it: only something to notice, filled from the item's own row
        // further down, which is what the action says.
        if (!item) {
            return `
                <div class="blacksmith-list-row squire-import-empty">
                    ${slotCell}
                    <div class="squire-import-noimg"></div>
                    <div class="blacksmith-list-row-main">
                        <div class="blacksmith-list-row-title">Nothing assigned</div>
                    </div>
                    <div class="blacksmith-list-row-action">Set item below</div>
                </div>`;
        }

        // Why a row landed nowhere, said on the row. Two different answers with
        // two different fixes: nothing could name a home for it, or something
        // could and the slot was already taken. Told apart from the outside they
        // look identical, which is how the same item can be a mystery three
        // times running.
        const wanted = this.plan.order.find(entry => entry.key === item.location
            || (item.location === 'ring' && entry.key.startsWith('ring'))
            || (item.location === 'carried' && entry.key.startsWith('hip')));

        // THREE reasons, not two, and the third is the one that kept an Amulet
        // of Health unexplained: dnd5e types some wearable magic items as
        // `consumable`/`trinket`, which the classifier reads — correctly, by its
        // own rules — as "not body equipment at all", the same answer it gives a
        // potion. It is still yours to map, and the dropdown still offers every
        // slot; it simply had no proposal to make.
        const reason = !item.location
            ? 'Nothing could work out where this goes'
            : item.location === 'none'
                ? 'Not read as something worn &mdash; map it yourself if it is'
                : `Belongs in ${escape(wanted?.label ?? item.location)} &mdash; already taken`;

        const why = slot ? '' : `<div class="blacksmith-list-row-meta">${reason}</div>`;

        return `
            <div class="blacksmith-list-row" data-item-uuid="${escape(item.uuid ?? '')}">
                ${slotCell}
                <img class="blacksmith-list-row-img" src="${escape(item.img ?? '')}" alt="">
                <div class="blacksmith-list-row-main">
                    <div class="blacksmith-list-row-title">${escape(item.name)}</div>
                    ${why}
                </div>
                <div class="blacksmith-list-row-action">${this._select(item, this.assignment[item.id] ?? '')}</div>
            </div>`;
    }

    /**
     * The gear list: a row per slot in reading order, then whatever is loose.
     *
     * Rebuilt whole on every change rather than patched. The rows MOVE — taking
     * a slot from something else drops that thing into the loose list — and a
     * list that reorders itself is far easier to get right by redrawing from one
     * map than by working out which rows to shuffle.
     */
    _gearRows() {
        const byId = new Map(this.plan.rows.map(item => [item.id, item]));

        const occupant = new Map();
        for (const [itemId, slotKey] of Object.entries(this.assignment)) {
            if (slotKey) occupant.set(slotKey, itemId);
        }

        const placed = this.plan.order
            .map(slot => this._row(slot, byId.get(occupant.get(slot.key))))
            .join('');

        const loose = this.plan.rows
            .filter(item => !this.assignment[item.id])
            .map(item => this._row(null, item));

        return placed + (loose.length
            ? `<div class="squire-import-divider">Not mapped to a slot</div>${loose.join('')}`
            : '');
    }

    _spellRows() {
        const escape = foundry.utils.escapeHTML;
        return this.plan.spells.map(spell => `
            <div class="blacksmith-list-row" data-item-uuid="${escape(spell.uuid ?? '')}">
                <div class="squire-import-slot">
                    <i class="fa-solid fa-sparkles"></i>
                    <span>${spell.level ? `Level ${spell.level}` : 'Cantrip'}</span>
                </div>
                <img class="blacksmith-list-row-img" src="${escape(spell.img ?? '')}" alt="">
                <div class="blacksmith-list-row-main">
                    <div class="blacksmith-list-row-title">${escape(spell.name)}</div>
                </div>
                <div class="blacksmith-list-row-action">
                    <select class="blacksmith-select ${PREPARED_CONTROL}" data-spell-id="${spell.id}">
                        <option value="1"${spell.prepared ? ' selected' : ''}>Prepared</option>
                        <option value=""${spell.prepared ? '' : ' selected'}>Not prepared</option>
                    </select>
                </div>
            </div>`).join('');
    }

    async getData() {
        return {
            appId: this.id,
            bodyContent: await renderTemplate(TEMPLATES.WINDOW_IMPORT, {
                actorName: this.actor?.name ?? '',
                buildName: this.build?.name ?? '',
                hasSpells: this.plan.spells.length > 0,
                limit: this.plan.limit,
                gearRows: this._gearRows(),
                spellRows: this._spellRows()
            }),
            showToolFooter: true,
            toolFooterRight: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
                    <i class="fa-solid fa-xmark"></i> Cancel
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="fill">
                    <i class="fa-solid fa-download"></i> Fill Build
                </button>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const root = this.element;
        if (!root) return;

        // Delegated from the root, because the gear rows are replaced wholesale
        // on every change and per-row listeners would die with them.
        //
        // Bound ONCE. ApplicationV2 replaces the contents of `this.element` on a
        // redraw and keeps the element, so a listener added here survives and a
        // second render adds a second copy — one change firing twice.
        //
        // The guard wraps the BINDING alone and does not return out of the
        // method, which it used to. Everything after it is per-render work: the
        // item cards attach to rows that were just drawn, so skipping it on
        // every render after the first would leave a redrawn list with no
        // tooltips and a stale count.
        if (root.dataset.importBound !== 'true') {
            root.dataset.importBound = 'true';
            this._bindChanges(root);
        }

        this._applyCards();
        this._recount();
    }

    /** The one change handler, attached to the root exactly once. */
    _bindChanges(root) {
        root.addEventListener('change', (event) => {
            const control = event.target.closest(`.${SLOT_CONTROL}`);
            if (control) {
                const itemId = control.dataset.itemId;
                const slotKey = control.value;

                // ONE ITEM PER SLOT. Taking a slot something else holds turns
                // that one loose rather than double-booking the doll — and
                // because the table is drawn from the map, you watch it drop
                // into the unmapped list as it happens.
                //
                // AND TWO HANDS. Both Hands turns Main and Off loose; either of
                // those turns Both loose. Same eviction, same visible result —
                // the displaced item drops to Not mapped where you can see it —
                // so the rule needs no second idiom to express itself here.
                const freed = new Set([slotKey, ...(HAND_CONFLICTS[slotKey] ?? [])]);
                if (slotKey) {
                    for (const [other, key] of Object.entries(this.assignment)) {
                        if (other !== itemId && freed.has(key)) this.assignment[other] = '';
                    }
                }
                this.assignment[itemId] = slotKey;

                const body = root.querySelector('[data-role="gear"]');
                if (body) {
                    body.innerHTML = this._gearRows();
                    // The rows that carried the cards are gone.
                    this._applyCards();
                }
                return;
            }

            if (event.target.closest(`.${PREPARED_CONTROL}`)) this._recount();
        });
    }

    /**
     * The system's own item card on every row, so a choice can be made from what
     * the item DOES rather than from its name.
     *
     * That is the whole reason it is here: this screen asks where a Rod of
     * Lordly Might should go, and nobody can answer without knowing what it is.
     *
     * dnd5e's tooltip layer resolves a `.loading[data-uuid]` placeholder itself,
     * so this is three attributes rather than a lookup — the same trick the tray
     * rows use, see applyItemTooltips() in helpers.js. Re-run after every redraw,
     * because the gear rows are replaced wholesale.
     */
    _applyCards() {
        for (const cell of this.element?.querySelectorAll('[data-item-uuid]') ?? []) {
            const uuid = cell.dataset.itemUuid;
            if (!uuid) continue;

            cell.dataset.tooltip =
                `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
            cell.dataset.tooltipClass = 'dnd5e2 dnd5e-tooltip item-tooltip themed theme-light';
            // LEFT, unlike the tray's rows: this window opens near the middle of
            // the screen and its rows run to the right edge, so a card opening
            // rightward would sit off it.
            cell.dataset.tooltipDirection ??= 'LEFT';
        }
    }

    /**
     * The prepared count, live.
     *
     * This is the one screen where the limit can actually be exceeded — the doll
     * itself has only as many cells as the character has slots — so it has to
     * say when it has been rather than refusing the choice.
     */
    _recount() {
        const counter = this.element?.querySelector('.squire-import-count');
        if (!counter) return;

        const chosen = [...this.element.querySelectorAll(`.${PREPARED_CONTROL}`)]
            .filter(control => control.value).length;

        // No limit means nothing to count against, so it says how many rather
        // than how many of what. `chosen > null` is false in JavaScript, which
        // would have been the right answer by accident — said properly instead.
        const limit = this.plan.limit;
        counter.textContent = limit === null ? `${chosen}` : `${chosen} / ${limit}`;
        counter.classList.toggle('is-over', limit !== null && chosen > limit);
    }
}
