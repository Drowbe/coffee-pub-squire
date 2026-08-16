import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getPanelItemName, setRowFilter, isRowVisible} from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';
import { trackModuleTimeout } from './timer-utils.js';

/** The stacked panels the filter bar governs, in tray order. */
const PANEL_TYPES = ['favorites', 'weapons', 'spells', 'features', 'inventory'];

/**
 * Which item-type chip owns a row, keyed by the row's `data-item-type`.
 *
 * 'favorites' is deliberately absent: a favourite is a flag rather than an item
 * kind, so that chip hides its own section without filtering rows anywhere else.
 * Every other chip reaches every panel — turning off Weapons hides weapons in
 * the favourites list too, and the weapons panel collapses because nothing is
 * left in it rather than because the chip hid it directly.
 */
const CHIP_FOR_ITEM_TYPE = {
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

/** Availability buckets, keyed by the row attribute that answers each question. */
const STATE_BUCKETS = {
    equipState: ['equipped', 'unequipped'],
    prepareState: ['prepared', 'unprepared']
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

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
        // When true the stacked panels are hidden and the quick-add results
        // panel takes their place; the same search box drives both.
        this._compendiumMode = false;
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
        searchPanel.onRequestClose = () => this.setCompendiumMode(false);
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
        await this.setCompendiumMode(false);

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
     * True when something other than section visibility is hiding rows.
     *
     * Every group is now "on by default", so a filter is active when a chip is
     * switched *off* rather than on.
     */
    hasActiveFilters() {
        if (this._searchTerm !== '') return true;
        if (this._shownActions.size < ACTION_BUCKETS.length) return true;
        return Object.values(STATE_BUCKETS).flat()
            .some(bucket => !game.settings.get(MODULE.ID, `filterShow${capitalize(bucket)}`));
    }

    /**
     * Enter or leave compendium quick-add mode.
     *
     * The stacked panels and the results panel are mutually exclusive: the tray
     * column isn't tall enough to show both, and the search box means something
     * different in each mode (filter what you have vs. find what you don't).
     */
    async setCompendiumMode(enabled) {
        if (this._compendiumMode === enabled) return;
        this._compendiumMode = enabled;

        const searchPanel = PanelManager.instance?.compendiumSearchPanel;
        this._bindSearchPanelClose();

        this._updateVisibility();

        const controlPanel = this.element?.querySelector('[data-panel="control"]');
        const searchInput = controlPanel?.querySelector('.global-search');
        if (searchInput) {
            searchInput.placeholder = enabled ? 'Search Compendiums...' : 'Search All Sections...';
            searchInput.value = '';
        }

        // The term means something different on each side — "longbow" as a panel
        // filter hides everything you own, and as a compendium query it's a
        // search you didn't ask for. Carrying it across is wrong in both
        // directions, so each mode starts clean.
        this._searchTerm = '';

        if (enabled) {
            await searchPanel?.render(this.element);
            searchPanel?.setQuery('');
            searchInput?.focus();
        } else {
            // Clear the filter the panels were showing, and restore any category
            // headers and "no matches" rows the previous search had hidden.
            this._handleSearch('');
        }
    }

    _updateVisibility() {
        if (!this.element) return;

        // Swap the stack and the quick-add results panel.
        const stack = this.element.querySelector('.panel-containers.stacked');
        if (stack) stack.style.display = this._compendiumMode ? 'none' : '';

        // Class only — the stylesheet owns hidden vs shown for this container,
        // so there's no inline style racing the CSS.
        this.element
            .querySelector('.panel-container[data-panel="compendium-search"]')
            ?.classList.toggle('visible', this._compendiumMode);

        const controlEl = this.element.querySelector('[data-panel="control"]');

        // Two-state mode switch: the selected side is active, the other dimmed.
        controlEl?.querySelectorAll('.control-mode-toggle').forEach(toggle => {
            const selected = (toggle.dataset.mode === 'search') === this._compendiumMode;
            toggle.classList.toggle('active', selected);
            toggle.classList.toggle('faded', !selected);
        });

        // The bar has nothing to act on in quick-add mode, so it collapses
        // rather than sitting there greyed out — it's pure dead space in a
        // column where vertical room is the scarce thing.
        controlEl?.classList.toggle('compendium-mode', this._compendiumMode);

        PANEL_TYPES.forEach(panel => {
            const isVisible = game.settings.get(MODULE.ID, `filterType${capitalize(panel)}`);

            controlEl
                ?.querySelector(`.filter-chip[data-filter-kind="type"][data-filter-value="${panel}"]`)
                ?.classList.toggle('active', isVisible);

            this.element
                .querySelector(`.panel-containers.stacked .panel-container[data-panel="${panel}"]`)
                ?.classList.toggle('visible', isVisible);
        });

        controlEl?.querySelectorAll('.filter-chip[data-filter-kind="action"]').forEach(chip => {
            chip.classList.toggle('active', this._shownActions.has(chip.dataset.filterValue));
        });

        controlEl?.querySelectorAll('.filter-chip[data-filter-kind="state"]').forEach(chip => {
            chip.classList.toggle('active',
                game.settings.get(MODULE.ID, `filterShow${capitalize(chip.dataset.filterValue)}`));
        });

        this._applyFilters();
    }

    /**
     * The one place row visibility is decided.
     *
     * Each predicate stamps its own reason and reads none of the others, so the
     * four of them intersect: a weapon that matches the search, survives the
     * type chips, costs a bonus action and is equipped shows; failing any one of
     * those hides it, and clearing that one filter brings it back without
     * disturbing the rest.
     *
     * A chip only judges rows that can answer it. `data-equip-state` is absent
     * from a spell and `data-prepare-state` from a rope, and an absent attribute
     * never matches the failing value — so "where applicable" is the default
     * behaviour here rather than a case anyone has to remember to write.
     */
    _applyFilters() {
        if (!this.element || this._compendiumMode) return;

        const term = this._searchTerm.toLowerCase();
        const shownActions = this._shownActions;
        const filtering = this.hasActiveFilters();

        const shownStates = {};
        Object.values(STATE_BUCKETS).flat().forEach(bucket => {
            shownStates[bucket] = game.settings.get(MODULE.ID, `filterShow${capitalize(bucket)}`);
        });

        const typeEnabled = {};
        PANEL_TYPES.forEach(panel => {
            typeEnabled[panel] = game.settings.get(MODULE.ID, `filterType${capitalize(panel)}`);
        });

        PANEL_TYPES.forEach(panelType => {
            const panelElement = this.element.querySelector(`[data-panel="${panelType}"]`);
            if (!panelElement) return;

            const rows = panelElement.querySelectorAll('.panel-item');

            rows.forEach(row => {
                const name = getPanelItemName(row).toLowerCase();
                setRowFilter(row, 'search', term !== '' && name !== '' && !name.includes(term));

                const chip = CHIP_FOR_ITEM_TYPE[row.dataset.itemType];
                setRowFilter(row, 'type', !!chip && !typeEnabled[chip]);

                // An item usable two ways survives while either bucket is on.
                // A row listing no action types at all can't answer this group
                // and is left alone — though Passive means that shouldn't happen.
                const rowActions = (row.dataset.actionTypes || '').split(' ').filter(Boolean);
                setRowFilter(row, 'action',
                    rowActions.length > 0 && !rowActions.some(a => shownActions.has(a)));

                // Availability is one reason covering two questions, so both are
                // decided here rather than each overwriting the other. A row
                // without the attribute isn't in either bucket and so isn't
                // judged — which is the whole of "where applicable".
                setRowFilter(row, 'state', Object.keys(STATE_BUCKETS).some(attribute => {
                    const bucket = row.dataset[attribute];
                    return bucket !== undefined && !shownStates[bucket];
                }));
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
            const emptied = filtering
                && !Array.from(rows).some(isRowVisible);
            panelElement.classList.toggle('filtered-empty', emptied);
        });
    }

    _handleSearch(searchTerm) {
        if (!this.element) return;

        this._searchTerm = searchTerm;

        // In quick-add mode the box searches compendiums instead of filtering
        // the panels, which are hidden anyway.
        if (this._compendiumMode) {
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
     * Availability solos within its question, not across the whole group.
     * Shift-clicking Equipped means "equipped rather than stowed" and says
     * nothing about spells — the same thing the old equipped toggle meant, and
     * the same "where applicable" rule the chips already follow. Soloing across
     * all four would instead hide every spell, which is not what the tooltip
     * promises.
     */
    async _soloChip(kind, value) {
        if (kind === 'type') {
            const soloed = PANEL_TYPES.every(type =>
                game.settings.get(MODULE.ID, `filterType${capitalize(type)}`) === (type === value));
            for (const type of PANEL_TYPES) {
                await game.settings.set(MODULE.ID, `filterType${capitalize(type)}`, soloed || type === value);
            }
        } else if (kind === 'action') {
            const soloed = this._shownActions.size === 1 && this._shownActions.has(value);
            this._shownActions = new Set(soloed ? ACTION_BUCKETS : [value]);
        } else if (kind === 'state') {
            const siblings = Object.values(STATE_BUCKETS).find(group => group.includes(value));
            if (!siblings) return;
            const soloed = siblings.every(bucket =>
                game.settings.get(MODULE.ID, `filterShow${capitalize(bucket)}`) === (bucket === value));
            for (const bucket of siblings) {
                await game.settings.set(MODULE.ID, `filterShow${capitalize(bucket)}`, soloed || bucket === value);
            }
        } else {
            return;
        }

        this._updateVisibility();
    }

    /**
     * Flip one chip.
     *
     * Type and availability chips are written to settings and survive a reload;
     * action-economy chips live on this instance and don't. That split is
     * deliberate — closing a section is a standing preference, "what can I do
     * this turn" is not.
     */
    async _toggleChip(kind, value) {
        if (kind === 'type') {
            const key = `filterType${capitalize(value)}`;
            await game.settings.set(MODULE.ID, key, !game.settings.get(MODULE.ID, key));
        } else if (kind === 'state') {
            const key = `filterShow${capitalize(value)}`;
            await game.settings.set(MODULE.ID, key, !game.settings.get(MODULE.ID, key));
        } else if (kind === 'action') {
            if (this._shownActions.has(value)) this._shownActions.delete(value);
            else this._shownActions.add(value);
        } else {
            return;
        }

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
                // Dynamic, like every other Squire tool window. window-cleanup.js
                // resolves BlacksmithToolWindowBaseV2 at module scope, and a static
                // import evaluates it while Squire's own modules are still loading —
                // before Blacksmith has published its API. ESM caches the failure, so
                // that throw kills the module for the whole session rather than
                // retrying later.
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

        // The filter bar. Delegated on the container rather than bound per chip:
        // twelve listeners to rewire on every render is twelve chances to leave
        // one behind, and the bar's contents are still settling.
        const filterBar = controlPanel.querySelector('.control-filter-bar');
        if (filterBar) {
            const newBar = filterBar.cloneNode(true);
            filterBar.parentNode?.replaceChild(newBar, filterBar);

            newBar.addEventListener('click', async (event) => {
                // The bar is hidden in quick-add mode, so a click here would be
                // changing state the user can't see.
                if (this._compendiumMode) return;

                const chip = event.target.closest('.filter-chip');
                if (!chip) return;

                if (event.shiftKey) {
                    await this._soloChip(chip.dataset.filterKind, chip.dataset.filterValue);
                    return;
                }
                await this._toggleChip(chip.dataset.filterKind, chip.dataset.filterValue);
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
                // Idempotent: clicking the already-selected side is a no-op
                // rather than a toggle, which is what a two-state switch means.
                await this.setCompendiumMode(toggle.dataset.mode === 'search');
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
            // (setCompendiumMode clears the box on the way), or from a filtered
            // sheet back to the unfiltered one.
            //
            // stopPropagation because Foundry binds Escape globally — without it
            // the keypress also closes the topmost application or opens the game
            // menu, so backing out of a search would shut something else.
            newInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();

                if (this._compendiumMode) {
                    await this.setCompendiumMode(false);
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

