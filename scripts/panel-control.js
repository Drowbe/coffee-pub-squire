import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getPanelItemName, setRowFilter, isRowVisible} from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';
import { trackModuleTimeout } from './timer-utils.js';

/**
 * What the tray column can be showing.
 *
 * 'sheet'     the section tabs and the four item panels
 * 'favorites' the favourites list on its own, no search and no filters
 * 'search'    compendium quick-add
 *
 * Three places, one at a time. This was a `_compendiumMode` boolean until
 * favourites became a place of its own, and a boolean cannot answer "which of
 * three" -- the toggles in the title bar are a three-way switch now, so the
 * state behind them has to be too.
 */
const MODES = ['sheet', 'favorites', 'search'];

/** Every stacked panel, in tray order. */
const PANEL_TYPES = ['builds', 'favorites', 'weapons', 'spells', 'features', 'inventory'];

/**
 * The panels the favourites view shows, in order.
 *
 * Builds is above Favorites and appears with it rather than being a fourth
 * mode: a build is assembled out of the same items the list below it holds,
 * and separating them would mean switching views mid-drag.
 */
const FAVORITES_VIEW_PANELS = ['builds', 'favorites'];

/**
 * The panels the section tabs and the filter bar govern.
 *
 * Favorites is not one of them any more. It has its own view, so it is never on
 * screen at the same time as the tabs or the filter bar, and nothing those
 * controls say could reach it. That is also why _applyFilters never stamps a
 * favourites row: the list behind the heart is the whole list, always.
 */
const SHEET_PANELS = ['weapons', 'spells', 'features', 'inventory'];

/**
 * The section tabs, in strip order.
 *
 * Favorites is NOT one of them: a favourite is a flag rather than an item kind,
 * so it was never the same axis as the other four. It gets the heart in the
 * title bar instead -- its own view, rather than a block pinned above every tab
 * showing rows that also appear directly below it.
 */
const PANEL_TABS = ['all', 'weapons', 'spells', 'features', 'inventory'];

/** Tab labels. Short enough that five fit across the tray at its 400px floor. */
const TAB_LABELS = {
    all: 'All',
    weapons: 'Weapons',
    spells: 'Spells',
    features: 'Feats',
    inventory: 'Inventory'
};

/**
 * Which availability toggle each tab is allowed to show.
 *
 * The toggles are global -- one `_onlyEquipped`, one `_onlyPrepared` -- and the
 * tab decides only which of them is on screen, never what they mean. Per-tab
 * state was the alternative and it makes the All tab unanswerable: if Weapons
 * says only-equipped and Inventory says all, All has to invent a rule.
 *
 * A consequence worth knowing: setting "only equipped" on Weapons also filters
 * Inventory, because it is one question about gear asked in two places. That is
 * why neither flag persists across sessions -- a global lens you set last
 * Tuesday is worse than a per-tab one, not better.
 */
const TAB_TOGGLES = {
    all: ['equipped', 'prepared'],
    weapons: ['equipped'],
    spells: ['prepared'],
    features: [],
    inventory: ['equipped']
};

/**
 * Which tab owns an item, keyed by `type`.
 *
 * Only for routing now -- revealAddedItem uses it to open the tab that will
 * hold a newly added item. It used to filter rows within a tab as well, which
 * mattered while Favorites sat above every tab and could hold anything. With
 * favourites in their own view every sheet panel is homogeneous (the inventory
 * panel takes equipment/consumable/tool/loot/containers, all of which are this
 * tab; features takes only feats), so that predicate could never fire and is
 * gone rather than left in as a comforting no-op.
 */
const TAB_FOR_ITEM_TYPE = {
    weapon: 'weapons',
    spell: 'spells',
    feat: 'features',
    equipment: 'inventory',
    consumable: 'inventory',
    tool: 'inventory',
    loot: 'inventory',
    backpack: 'inventory',
    currency: 'inventory'
};

/** Action-economy buckets, in bar order. Passive is what makes the set complete. */
const ACTION_BUCKETS = ['action', 'bonus', 'reaction', 'special', 'passive'];

/**
 * The two availability questions: the flag that answers each, the row attribute
 * that carries the answer, and the value that fails when the flag is on.
 *
 * `hideWhen` is the whole safety property of this feature. "Only equipped" means
 * hide rows that say `unequipped` -- NOT rows that fail to say `equipped`. A
 * spell carries no `data-equip-state` at all, so written the first way it is
 * untouched and written the second way your entire spell list disappears. Same
 * for a weapon under "only prepared". Where-applicable falls out of matching the
 * failing value rather than negating the passing one.
 */
const AVAILABILITY = {
    equipped: { attribute: 'equipState', hideWhen: 'unequipped' },
    prepared: { attribute: 'prepareState', hideWhen: 'unprepared' }
};

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
        this._searchTerm = '';
        // The action buckets currently shown. All of them to begin with, like
        // every other group in the bar — a chip that is off hides its slice, so
        // starting empty would start the tray empty.
        //
        // Held here rather than in settings on purpose: this answers "what can I
        // do right now", which is a question about this moment, not a preference
        // worth restoring next week. See settings.js.
        this._shownActions = new Set(ACTION_BUCKETS);
        // Narrow to what is usable right now. Global rather than per-tab, and
        // deliberately not persisted -- see TAB_TOGGLES. Both start off, so the
        // tray opens showing everything.
        this._onlyEquipped = false;
        this._onlyPrepared = false;
        // Which of MODES the column is showing. Seeded from the remembered view
        // -- see `controlMode` in settings.js for why 'search' is never one of
        // the values that can come back.
        this._mode = ControlPanel._rememberedMode();
    }

    /**
     * The open section tab. Read through a getter so a stored value that is no
     * longer a tab -- a world that saw an older build, a hand-edited setting --
     * falls back to All rather than showing an empty tray with no lit tab to
     * explain it.
     */
    get activeTab() {
        const stored = game.settings.get(MODULE.ID, 'controlActiveTab');
        return PANEL_TABS.includes(stored) ? stored : 'all';
    }

    async setActiveTab(tab) {
        if (!PANEL_TABS.includes(tab) || tab === this.activeTab) return;
        await game.settings.set(MODULE.ID, 'controlActiveTab', tab);
        this._updateVisibility();
    }

    async render(html) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) return;

        // Browsing and adding are separate rungs, so the mode toggle and the
        // add-flow option are gated separately: "clear the search and stay
        // here after adding" is meaningless to a player who can only look.
        const canAdd = CompendiumSearchUtility.canAdd(this.actor);
        const templateData = {
            canUseCompendiums: CompendiumSearchUtility.canBrowse(this.actor),
            canAddFromCompendiums: canAdd,
            compendiumToggleTitle: canAdd
                ? 'Search Compendiums to Add Items'
                : 'Search Compendiums',
            clearOnAdd: game.settings.get(MODULE.ID, 'compendiumClearOnAdd'),
            tabs: PANEL_TABS.map(tab => ({
                key: tab,
                label: TAB_LABELS[tab],
                active: tab === this.activeTab
            })),
            // Owners, not just GMs. A player never writes to their own sheet
            // here: applying sends the plan to the GM as an approval window, and
            // the GM decides. `isOwner` rather than a player check, because the
            // tray follows canvas selection and a player who can select another
            // character's token must not be able to propose changes to it.
            // A player's click asks; a GM's click does. The tooltip has to say
            // which, or the same icon promises two different things.
            cleanupTooltip: game.user.isGM
                ? 'Clean up this sheet — consolidate coins, link items to their compendium entry, and merge duplicates'
                : 'Tidy this sheet — consolidate coins, link items, and merge duplicates. Sends the plan to your GM to approve.',
            canCleanup: this.actor?.type === 'character'
                && this.actor?.isOwner
                && (game.user.isGM || game.settings.get(MODULE.ID, 'cleanupPlayerRequests'))
        };

        const content = await renderTemplate(TEMPLATES.PANEL_CONTROL, templateData);
        // v13: Use native DOM methods
        const controlPanel = this.element.querySelector('[data-panel="control"]');
        if (controlPanel) {
            controlPanel.innerHTML = content;
        }
        
        this._activateListeners(this.element);
        this._updateVisibility();
        this._bindSearchPanelClose();
    }

    /**
     * Point the results panel's × at this control panel.
     *
     * Bound on every render, not just on entering the mode: PanelManager builds
     * fresh panel instances when the tray rebuilds, and a callback captured on a
     * previous instance would leave the × doing nothing.
     */
    _bindSearchPanelClose() {
        const searchPanel = PanelManager.instance?.compendiumSearchPanel;
        if (!searchPanel) return;
        searchPanel.onRequestClose = () => this.setMode('sheet');
        // The results panel doesn't own the search box, so it asks for the reset
        // rather than reaching across to clear it.
        searchPanel.onRequestClearSearch = () => this.clearSearch();
        searchPanel.onRequestRevealItem = (item) => this.revealAddedItem(item);
    }

    /**
     * Leave search mode and scroll the freshly added item into view.
     *
     * The alternative to staying in search: you added the one thing you came
     * for, so the useful next view is the sheet with that item in front of you.
     */
    async revealAddedItem(item) {
        if (!item) return;
        await this.setMode('sheet');

        // Switch to the tab that holds it first. Adding a longbow while the
        // Spells tab is open used to land you on a sheet with no longbow on it,
        // and _waitForItemRow would poll a hidden panel and give up in silence.
        const owner = TAB_FOR_ITEM_TYPE[item.type];
        if (owner && this.activeTab !== 'all') await this.setActiveTab(owner);

        // The item arrives via createItem hooks that re-render whichever panel
        // holds it, and those run independently of this call — so poll briefly
        // for the row rather than guessing which render wins the race.
        const row = await this._waitForItemRow(item.id);
        if (!row) return;

        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Items already get a NEW badge from the createItem hook; this is just a
        // momentary "here" so the eye lands in the right place after the scroll.
        row.classList.add('just-added');
        trackModuleTimeout(() => row.classList.remove('just-added'), 2500);
    }

    /**
     * Poll for an item's row, bounded so a hidden or unrendered panel gives up
     * quietly rather than looping. Returns null if it never appears — which is
     * the normal outcome when the panel holding it is toggled off.
     */
    async _waitForItemRow(itemId, attempts = 12) {
        for (let i = 0; i < attempts; i++) {
            const row = this.element?.querySelector(
                `.panel-containers.stacked .panel-item[data-item-id="${itemId}"]`
            );
            // offsetParent is null for anything inside a display:none panel.
            if (row?.offsetParent) return row;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return null;
    }

    /** Empty the search box and reset whatever it was driving. */
    clearSearch() {
        const searchInput = this.element
            ?.querySelector('[data-panel="control"]')
            ?.querySelector('.global-search');
        if (searchInput) searchInput.value = '';
        this._handleSearch('');
        // The point of clearing after an add is to type the next lookup, so put
        // the caret back rather than making the user click the box again.
        searchInput?.focus();
    }

    /**
     * Re-apply every active filter. Call this after a stacked panel re-renders:
     * the replacement rows arrive unstamped, so the bar has to say its piece
     * again or a re-render silently clears the view.
     *
     * Unlike the search-only version this replaced, it runs even with an empty
     * search box — the action and availability chips can be filtering on their
     * own, and returning early left those panels showing everything.
     */
    reapplyFilters() {
        const controlPanel = this.element?.querySelector('[data-panel="control"]');
        const searchInput = controlPanel?.querySelector('.global-search');
        if (searchInput) {
            searchInput.value = this._searchTerm;
        }
        this._applyFilters();
    }

    /**
     * True when a FILTER is hiding rows.
     *
     * The open tab is deliberately not counted. A tab is a place, not a filter:
     * it is labelled, lit, and cannot be switched off, so it needs none of the
     * "you are looking at less than everything" machinery the chips did. The
     * emptied-section test in _applyFilters adds the tab back for its own
     * purposes, which is a different question.
     */
    hasActiveFilters() {
        if (this._searchTerm !== '') return true;
        if (this._shownActions.size < ACTION_BUCKETS.length) return true;
        return this._onlyEquipped || this._onlyPrepared;
    }

    /**
     * The view to open on, from the remembered setting.
     *
     * Static because the constructor needs it before there is an instance, and
     * validating here rather than trusting the stored string means a value
     * written by an older build -- or one naming a mode that no longer exists --
     * lands on favourites instead of on nothing at all.
     *
     * 'search' is rejected as well as unknown values: it is never written, but
     * a hand-edited setting should not be able to open the tray into quick-add.
     */
    static _rememberedMode() {
        const stored = game.settings.get(MODULE.ID, 'controlMode');
        return (stored === 'sheet' || stored === 'favorites') ? stored : 'favorites';
    }

    /** True while the compendium quick-add results panel is showing. */
    get isCompendiumMode() {
        return this._mode === 'search';
    }

    /**
     * Switch the column between the sheet, the favourites list and quick-add.
     *
     * The three are mutually exclusive because the column is not tall enough to
     * be two of them at once, and because the search box means something
     * different in each: filter what you have, nothing at all, find what you
     * don't.
     */
    async setMode(mode) {
        if (!MODES.includes(mode) || this._mode === mode) return;
        this._mode = mode;

        // Remember where they were, but never quick-add: leaving it should put
        // you back where you were before you went looking, not leave the tray
        // opening into a search box next session.
        if (mode !== 'search') {
            await game.settings.set(MODULE.ID, 'controlMode', mode);
        }

        const searchPanel = PanelManager.instance?.compendiumSearchPanel;
        this._bindSearchPanelClose();

        this._updateVisibility();

        const controlPanel = this.element?.querySelector('[data-panel="control"]');
        const searchInput = controlPanel?.querySelector('.global-search');
        if (searchInput) {
            searchInput.placeholder = this.isCompendiumMode
                ? 'Search Compendiums...'
                : 'Search All Sections...';
            searchInput.value = '';
        }

        // The term means something different on each side — "longbow" as a panel
        // filter hides everything you own, and as a compendium query it's a
        // search you didn't ask for. Carrying it across is wrong in both
        // directions, so each mode starts clean.
        this._searchTerm = '';

        if (this.isCompendiumMode) {
            await searchPanel?.render(this.element);
            searchPanel?.setQuery('');
            searchInput?.focus();
        } else {
            // Clear the filter the panels were showing, and restore any category
            // headers and "no matches" rows the previous search had hidden.
            // Runs for favourites too: the box is gone from that view, so a term
            // left behind would be filtering from somewhere you cannot see.
            this._handleSearch('');
        }
    }

    _updateVisibility() {
        if (!this.element) return;

        // Swap the stack and the quick-add results panel. Favourites live in
        // the stack like every other panel, so the stack shows for two of the
        // three modes and only which panels are `.visible` differs.
        const stack = this.element.querySelector('.panel-containers.stacked');
        if (stack) stack.style.display = this.isCompendiumMode ? 'none' : '';

        // Class only — the stylesheet owns hidden vs shown for this container,
        // so there's no inline style racing the CSS.
        this.element
            .querySelector('.panel-container[data-panel="compendium-search"]')
            ?.classList.toggle('visible', this.isCompendiumMode);

        const controlEl = this.element.querySelector('[data-panel="control"]');

        // Three-way switch: the mode you are in is lit, the other two dimmed.
        controlEl?.querySelectorAll('.control-mode-toggle').forEach(toggle => {
            const selected = toggle.dataset.mode === this._mode;
            toggle.classList.toggle('active', selected);
            toggle.classList.toggle('faded', !selected);
        });

        // Neither quick-add nor favourites has anything for the tabs and the
        // filter bar to act on, so they collapse rather than sitting there
        // greyed out — pure dead space in a column where vertical room is the
        // scarce thing. Favourites drops the search box with them.
        controlEl?.classList.toggle('compendium-mode', this.isCompendiumMode);
        controlEl?.classList.toggle('favorites-mode', this._mode === 'favorites');

        const activeTab = this.activeTab;

        // Favourites shows in its own view and nowhere else; the four sheet
        // panels show in the sheet view, one per tab or all together on All.
        PANEL_TYPES.forEach(panel => {
            const isVisible = FAVORITES_VIEW_PANELS.includes(panel)
                ? this._mode === 'favorites'
                : this._mode === 'sheet' && (activeTab === 'all' || panel === activeTab);

            const container = this.element
                .querySelector(`.panel-containers.stacked .panel-container[data-panel="${panel}"]`);
            container?.classList.toggle('visible', isVisible);

            // `filtered-empty` is set inside the SHEET_PANELS loop in
            // _applyFilters, which no longer reaches favourites -- so nothing
            // would ever clear it again. The containers outlive their contents
            // (only innerHTML is replaced on render), and a stale one here would
            // beat `.visible` and leave the heart opening onto nothing.
            if (FAVORITES_VIEW_PANELS.includes(panel)) container?.classList.remove('filtered-empty');
        });

        controlEl?.querySelectorAll('.control-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === activeTab);
        });

        controlEl?.querySelectorAll('.filter-chip[data-filter-kind="action"]').forEach(chip => {
            chip.classList.toggle('active', this._shownActions.has(chip.dataset.filterValue));
        });

        // A toggle the open tab has no use for is removed, not dimmed: "only
        // prepared" on the Inventory tab is a control with nothing to act on,
        // and dimming it would say it was switched off instead.
        const allowed = TAB_TOGGLES[activeTab] ?? [];
        controlEl?.querySelectorAll('.availability-toggle').forEach(toggle => {
            const key = toggle.dataset.availability;
            toggle.hidden = !allowed.includes(key);
            toggle.classList.toggle('active', this._availabilityFlag(key));
        });

        this._applyFilters();
    }

    /** Read one availability flag by name. */
    _availabilityFlag(key) {
        return key === 'equipped' ? this._onlyEquipped : this._onlyPrepared;
    }

    /**
     * The one place row visibility is decided.
     *
     * Each predicate stamps its own reason and reads none of the others, so they
     * intersect: a weapon that matches the search, costs a bonus action and is
     * equipped shows; failing any one of those hides it, and clearing that one
     * filter brings it back without disturbing the rest.
     *
     * A predicate only judges rows that can answer it. `data-equip-state` is
     * absent from a spell and `data-prepare-state` from a rope, and each
     * availability flag matches the FAILING value rather than negating the
     * passing one -- so "where applicable" is the default behaviour here rather
     * than a case anyone has to remember to write. See AVAILABILITY.
     */
    _applyFilters() {
        // Only the sheet has anything to filter. Favourites carries no controls
        // that could hide a row, so its rows are left unstamped rather than
        // stamped-and-cleared -- there is no state to get out of step.
        if (!this.element || this._mode !== 'sheet') return;

        const term = this._searchTerm.toLowerCase();
        const shownActions = this._shownActions;
        const activeTab = this.activeTab;

        const filtering = this.hasActiveFilters();

        SHEET_PANELS.forEach(panelType => {
            const panelElement = this.element.querySelector(`[data-panel="${panelType}"]`);
            if (!panelElement) return;

            const rows = panelElement.querySelectorAll('.panel-item');

            rows.forEach(row => {
                const name = getPanelItemName(row).toLowerCase();
                setRowFilter(row, 'search', term !== '' && name !== '' && !name.includes(term));

                // An item usable two ways survives while either bucket is on.
                // A row listing no action types at all can't answer this group
                // and is left alone — though Passive means that shouldn't happen.
                const rowActions = (row.dataset.actionTypes || '').split(' ').filter(Boolean);
                setRowFilter(row, 'action',
                    rowActions.length > 0 && !rowActions.some(a => shownActions.has(a)));

                // Availability is one reason covering two questions, so both are
                // decided here rather than each overwriting the other. A row is
                // hidden only when it positively declares the failing value, so
                // a row that cannot answer is never judged.
                setRowFilter(row, 'state', Object.entries(AVAILABILITY).some(
                    ([key, { attribute, hideWhen }]) =>
                        this._availabilityFlag(key) && row.dataset[attribute] === hideWhen
                ));
            });

            PanelManager.instance?._updateHeadersVisibility(panelElement);

            // A section that a filter has emptied is suppressed outright rather
            // than left standing over a "no matches" line. Asking for bonus
            // actions means you want the bonus actions, not a tour of every
            // section that hasn't got one — and in a tall narrow column, five
            // headings over five apologies buries the one section that answered.
            //
            // Only when a filter is doing it. A character who simply owns no
            // weapons still gets the "No weapons available" line, because that
            // is a fact about the sheet rather than about the question asked.
            //
            // Category collapse is deliberately excluded from that test: those
            // chips live inside the panel's own heading, so hiding the panel
            // would take away the only control that could bring it back.
            //
            // The open tab's OWN panel is exempt. It is the thing that was
            // clicked, so it has to answer for itself: a character on the
            // Weapons tab whose weapons a filter has just emptied needs to see
            // "no matches", not a blank column under a lit tab. On All nothing
            // is exempt, which is the case this test is really for.
            const emptied = filtering
                && panelType !== activeTab
                && !Array.from(rows).some(isRowVisible);
            panelElement.classList.toggle('filtered-empty', emptied);
        });
    }

    _handleSearch(searchTerm) {
        if (!this.element) return;

        this._searchTerm = searchTerm;

        // In quick-add mode the box searches compendiums instead of filtering
        // the panels, which are hidden anyway.
        if (this.isCompendiumMode) {
            PanelManager.instance?.compendiumSearchPanel?.setQuery(searchTerm);
            return;
        }

        // The per-panel search boxes would be filtering a list the global box
        // has already filtered, so they step aside while it holds a term.
        const searchContainers = this.element.querySelectorAll('.panel-containers.stacked .panel-container .search-container');
        searchContainers.forEach(container => {
            container.style.display = searchTerm === '' ? '' : 'none';
        });

        if (searchTerm === '') {
            const searchInputs = this.element.querySelectorAll('.panel-containers.stacked .panel-container .search-container input');
            searchInputs.forEach(input => {
                input.value = '';
            });
        }

        this._applyFilters();
    }

    /**
     * Shift-click: show only this bucket, and nothing else it competes with.
     *
     * Every group is on by default, so isolating one bucket otherwise means
     * switching off its four siblings one at a time — and "only bonus actions"
     * is a thing you want mid-turn, not after four clicks.
     *
     * Shift-clicking an already-soloed chip puts its siblings back. Without that
     * the gesture is a trap: it can reach a state that takes four ordinary
     * clicks to leave.
     *
     * Only the action chips have siblings to solo against now -- the tabs are
     * single-select by construction and the availability toggles are two
     * independent booleans, so neither has a group for this gesture to mean
     * anything within.
     */
    _soloChip(kind, value) {
        if (kind !== 'action') return;

        const soloed = this._shownActions.size === 1 && this._shownActions.has(value);
        this._shownActions = new Set(soloed ? ACTION_BUCKETS : [value]);
        this._updateVisibility();
    }

    /**
     * Flip one action chip. Lives on the instance and does not persist: "what
     * can I do this turn" is a question about this moment.
     */
    _toggleChip(kind, value) {
        if (kind !== 'action') return;

        if (this._shownActions.has(value)) this._shownActions.delete(value);
        else this._shownActions.add(value);
        this._updateVisibility();
    }

    /**
     * Flip "only equipped" or "only prepared".
     *
     * Global, so this reaches every tab that shows the same toggle -- Weapons
     * and Inventory share the equipped flag. Not persisted, for the reason in
     * TAB_TOGGLES.
     */
    _toggleAvailability(key) {
        if (key === 'equipped') this._onlyEquipped = !this._onlyEquipped;
        else if (key === 'prepared') this._onlyPrepared = !this._onlyPrepared;
        else return;

        this._updateVisibility();
    }

    /**
     * The cleanup launcher. Separate from the mode toggles it sits beside: those
     * switch what the panel shows, this opens a window that writes to the sheet.
     */
    /**
     * The cleanup launcher.
     *
     * DELEGATED to the panel's stable container rather than bound to the icon,
     * and bound once per container. The control panel replaces its own innerHTML
     * on every render, so a listener attached to the icon dies with the node the
     * next time anything re-renders the panel — which is what made this button
     * silently do nothing. The handle solved the same problem the same way.
     */
    _activateCleanupListener(container) {
        if (!container || container.dataset.cleanupBound === 'true') return;
        container.dataset.cleanupBound = 'true';

        container.addEventListener('click', async (event) => {
            const button = event.target.closest('.control-cleanup');
            if (!button) return;

            event.preventDefault();
            event.stopPropagation();
            if (!this.actor) return;

            try {
                // Dynamic for lazy loading, not for timing. It used to be for
                // timing: window-cleanup.js read its superclass off module.api at
                // module scope, which a static import would have evaluated before
                // Blacksmith published anything. It imports the class from
                // Blacksmith's bridge module now, so evaluation order is no longer
                // a hazard and this could be static — it stays dynamic because the
                // cleanup window is a rarely-opened GM tool.
                const { openCleanupWindow } = await import('./window-cleanup.js');
                await openCleanupWindow(this.actor);
            } catch (error) {
                // An async click handler swallows its own rejection: without this
                // a failure here is a button that silently does nothing.
                console.error('Coffee Pub Squire | Failed to open the cleanup window:', error);
                ui.notifications.error('The cleanup window could not be opened. See the console for details.');
            }
        });
    }

    _activateListeners(html) {
        // v13: Use native DOM methods instead of jQuery
        const controlPanel = html.querySelector('[data-panel="control"]');
        if (!controlPanel) return;

        // The tray root, not the panel: the panel's innerHTML is replaced on
        // every render, the root is not.
        this._activateCleanupListener(html);

        // The section tabs. Delegated on the strip rather than bound per tab,
        // for the same reason the filter bar is.
        const tabStrip = controlPanel.querySelector('.control-tabs');
        if (tabStrip) {
            const newStrip = tabStrip.cloneNode(true);
            tabStrip.parentNode?.replaceChild(newStrip, tabStrip);

            newStrip.addEventListener('click', async (event) => {
                // The strip is hidden outside the sheet, so a click here would
                // be changing state the user cannot see.
                if (this._mode !== 'sheet') return;
                const tab = event.target.closest('.control-tab');
                if (!tab) return;
                await this.setActiveTab(tab.dataset.tab);
            });
        }

        // The filter bar: five action chips and the two availability toggles.
        // Delegated on the container rather than bound per control, because the
        // panel replaces its own innerHTML on every render and a listener bound
        // to a chip dies with the node.
        const filterBar = controlPanel.querySelector('.control-filter-bar');
        if (filterBar) {
            const newBar = filterBar.cloneNode(true);
            filterBar.parentNode?.replaceChild(newBar, filterBar);

            newBar.addEventListener('click', (event) => {
                // As above: the bar only exists on the sheet.
                if (this._mode !== 'sheet') return;

                const toggle = event.target.closest('.availability-toggle');
                if (toggle) {
                    this._toggleAvailability(toggle.dataset.availability);
                    return;
                }

                const chip = event.target.closest('.filter-chip');
                if (!chip) return;

                if (event.shiftKey) {
                    this._soloChip(chip.dataset.filterKind, chip.dataset.filterValue);
                    return;
                }
                this._toggleChip(chip.dataset.filterKind, chip.dataset.filterValue);
            });
        }

        // "Clear search after adding" — remembered per user.
        const clearOnAdd = controlPanel.querySelector('.compendium-clear-on-add');
        if (clearOnAdd) {
            const newClearOnAdd = clearOnAdd.cloneNode(true);
            clearOnAdd.parentNode?.replaceChild(newClearOnAdd, clearOnAdd);

            newClearOnAdd.addEventListener('change', async (event) => {
                await game.settings.set(MODULE.ID, 'compendiumClearOnAdd', event.target.checked);
            });
        }

        // Sheet / search mode switch. Delegated on the container rather than
        // bound per icon, so the header markup can change without rewiring.
        const modeToggles = controlPanel.querySelector('.control-mode-toggles');
        if (modeToggles) {
            const newToggles = modeToggles.cloneNode(true);
            modeToggles.parentNode?.replaceChild(newToggles, modeToggles);

            newToggles.addEventListener('click', async (event) => {
                const toggle = event.target.closest('.control-mode-toggle');
                if (!toggle) return;
                // Idempotent: clicking the mode you are already in is a no-op
                // rather than a toggle, which is what a three-way switch means.
                await this.setMode(toggle.dataset.mode);
            });
        }

        // Add search input listener
        const searchInput = controlPanel.querySelector('.global-search');
        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                this._handleSearch(event.target.value);
            });

            // Escape backs out one step: from compendium search to the sheet
            // (setMode clears the box on the way), or from a filtered sheet
            // back to the unfiltered one.
            //
            // stopPropagation because Foundry binds Escape globally — without it
            // the keypress also closes the topmost application or opens the game
            // menu, so backing out of a search would shut something else.
            newInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();

                if (this.isCompendiumMode) {
                    await this.setMode('sheet');
                    return;
                }
                if (newInput.value !== '') {
                    newInput.value = '';
                    this._handleSearch('');
                }
            });
        }

        // Add search clear button listener
        const clearButton = controlPanel.querySelector('.search-clear');
        if (clearButton) {
            // Clone to remove existing listeners
            const newButton = clearButton.cloneNode(true);
            clearButton.parentNode?.replaceChild(newButton, clearButton);
            
            newButton.addEventListener('click', (event) => {
                const searchInput = event.currentTarget.parentElement?.querySelector('.global-search');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                }
            });
        }
    }
}

