import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';
import { trackModuleTimeout } from './timer-utils.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
        this._searchTerm = '';
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
            clearOnAdd: game.settings.get(MODULE.ID, 'compendiumClearOnAdd')
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
     * Re-apply the current search filter. Call this after stacked panels
     * (favorites, weapons, spells, features, inventory) re-render to restore
     * the filtered view, since their DOM replacement clears display styles.
     */
    reapplySearch() {
        if (!this._searchTerm) return;
        const controlPanel = this.element?.querySelector('[data-panel="control"]');
        const searchInput = controlPanel?.querySelector('.global-search');
        if (searchInput) {
            searchInput.value = this._searchTerm;
        }
        this._handleSearch(this._searchTerm);
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

        // The panel toggles have nothing to toggle in quick-add mode, so the row
        // collapses rather than sitting there greyed out — it's pure dead space
        // in a column where vertical room is the scarce thing.
        controlEl?.classList.toggle('compendium-mode', this._compendiumMode);

        // v13: Use native DOM methods instead of jQuery
        ['favorites', 'weapons', 'spells', 'features', 'inventory'].forEach(panel => {
            const isVisible = game.settings.get(MODULE.ID, `show${panel.charAt(0).toUpperCase() + panel.slice(1)}Panel`);
            
            // Update icon state
            const controlPanel = this.element.querySelector('[data-panel="control"]');
            if (controlPanel) {
                const toggle = controlPanel.querySelector(`.control-toggle[data-toggle-panel="${panel}"]`);
                if (toggle) {
                    if (isVisible) {
                        toggle.classList.add('active');
                        toggle.classList.remove('faded');
                    } else {
                        toggle.classList.remove('active');
                        toggle.classList.add('faded');
                    }
                }
            }
            
            // Update panel visibility
            const panelContainer = this.element.querySelector(`.panel-containers.stacked .panel-container[data-panel="${panel}"]`);
            if (panelContainer) {
                if (isVisible) {
                    panelContainer.classList.add('visible');
                } else {
                    panelContainer.classList.remove('visible');
                }
            }
        });
    }

    _handleSearch(searchTerm) {
        // v13: Use native DOM methods instead of jQuery
        if (!this.element) return;

        this._searchTerm = searchTerm;

        // In quick-add mode the box searches compendiums instead of filtering
        // the panels, which are hidden anyway.
        if (this._compendiumMode) {
            PanelManager.instance?.compendiumSearchPanel?.setQuery(searchTerm);
            return;
        }

        // Convert search term to lowercase for case-insensitive comparison
        const normalizedTerm = searchTerm.toLowerCase();

        // Toggle visibility of individual search boxes based on global search state
        // v13: Use native DOM querySelectorAll
        const searchContainers = this.element.querySelectorAll('.panel-containers.stacked .panel-container .search-container');
        searchContainers.forEach(container => {
            container.style.display = normalizedTerm === '' ? '' : 'none';
        });

        // Track visible items for each panel
        const visibleCounts = {
            favorites: 0,
            weapons: 0,
            spells: 0,
            features: 0,
            inventory: 0
        };

        // Process each visible panel separately
        Object.keys(visibleCounts).forEach(panelType => {
            // v13: Use native DOM querySelector
            const panelElement = this.element.querySelector(`[data-panel="${panelType}"]`);
            if (!panelElement || !panelElement.classList.contains('visible')) return;

            // Find all items in this panel using the shared panel item class
            const items = panelElement.querySelectorAll('.panel-item');

            let visibleItemsInPanel = 0;  // Initialize counter for this panel

            // Process items
            // v13: Use native DOM forEach
            items.forEach(item => {
                const nameElement = item.querySelector('.panel-item-name');
                
                // Skip if no name element found
                if (!nameElement) {
                    return;
                }

                // v13: Clone element, remove children, get text content
                const clonedName = nameElement.cloneNode(true);
                clonedName.querySelectorAll('*').forEach(child => child.remove());
                const itemName = clonedName.textContent.toLowerCase().trim();
                
                const shouldShow = normalizedTerm === '' || itemName.includes(normalizedTerm);
                
                // Toggle item visibility
                // v13: Use style.display instead of jQuery toggle
                item.style.display = shouldShow ? '' : 'none';
                if (shouldShow) visibleItemsInPanel++;
            });

            // Handle ALL category headers in this panel
            if (normalizedTerm !== '') {
                // First hide all headers
                // v13: Use native DOM querySelectorAll
                const categoryHeaders = panelElement.querySelectorAll('.category-header');
                categoryHeaders.forEach(header => {
                    header.style.display = 'none';
                });
                
                // Then only show headers that have visible items
                // v13: Use native DOM querySelectorAll with :not([style*="display: none"])
                const visibleItems = Array.from(panelElement.querySelectorAll('.panel-item'))
                    .filter(item => item.style.display !== 'none');
                const visibleCategories = new Set();
                
                visibleItems.forEach(item => {
                    const categoryId = item.dataset.categoryId;
                    if (categoryId) visibleCategories.add(categoryId);
                });
                
                visibleCategories.forEach(categoryId => {
                    // v13: Use safer selector approach for data attributes
                    const headers = panelElement.querySelectorAll('.category-header[data-category-id]');
                    const header = Array.from(headers).find(h => h.dataset.categoryId === categoryId);
                    if (header) {
                        header.style.display = '';
                    }
                });
            }

            // Update panel counter
            visibleCounts[panelType] = visibleItemsInPanel;

            // Toggle "No matches" message - only show during search with no results
            // v13: Use native DOM querySelector
            const noMatchesElement = panelElement.querySelector('.no-matches');
            if (noMatchesElement) {
                if (normalizedTerm === '') {
                    noMatchesElement.classList.remove('show');
                    noMatchesElement.style.display = 'none';
                } else {
                    const shouldShowNoMatches = visibleItemsInPanel === 0 && panelElement.classList.contains('visible');
                    if (shouldShowNoMatches) {
                        noMatchesElement.classList.add('show');
                        noMatchesElement.style.display = '';
                    } else {
                        noMatchesElement.classList.remove('show');
                        noMatchesElement.style.display = 'none';
                    }
                }
            }
        });

        // Handle spell level headers separately since they're structured differently
        // v13: Use native DOM querySelector
        const spellsPanel = this.element.querySelector('[data-panel="spells"]');
        if (spellsPanel && spellsPanel.classList.contains('visible')) {
            const spellHeaders = spellsPanel.querySelectorAll('.category-header');
            spellHeaders.forEach(header => {
                const categoryId = header.dataset.categoryId;
                // v13: Find visible items with this category ID
                const categoryItems = Array.from(spellsPanel.querySelectorAll(`[data-category-id="${categoryId}"]`))
                    .filter(item => item.style.display !== 'none' && !item.classList.contains('category-header'));
                header.style.display = categoryItems.length > 0 ? '' : 'none';
            });
        }

        // Clear individual search boxes when global search is cleared
        if (normalizedTerm === '') {
            // v13: Use native DOM querySelectorAll
            const searchInputs = this.element.querySelectorAll('.panel-containers.stacked .panel-container .search-container input');
            searchInputs.forEach(input => {
                input.value = '';
            });
            // Show all headers when search is cleared
            const allHeaders = this.element.querySelectorAll('.category-header');
            allHeaders.forEach(header => {
                header.style.display = '';
            });
            // Hide all "No matches" messages
            const noMatchesElements = this.element.querySelectorAll('.no-matches');
            noMatchesElements.forEach(element => {
                element.classList.remove('show');
                element.style.display = 'none';
            });
        }
    }

    async _togglePanel(panelType) {
        const settingKey = `show${panelType.charAt(0).toUpperCase() + panelType.slice(1)}Panel`;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        await game.settings.set(MODULE.ID, settingKey, !currentValue);
        this._updateVisibility();
        
        // Update panel visibility without recreating the entire tray
        this._updateVisibility();
    }

    _activateListeners(html) {
        // v13: Use native DOM methods instead of jQuery
        const controlPanel = html.querySelector('[data-panel="control"]');
        if (!controlPanel) return;

        // Control toggle buttons
        const toggleButtons = controlPanel.querySelectorAll('.control-toggle');
        toggleButtons.forEach(button => {
            // Clone to remove existing listeners
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async (event) => {
                // Toggling a hidden panel would silently change state the user
                // can't see; the icons are faded to say so.
                if (this._compendiumMode) return;
                const panelType = event.currentTarget.dataset.togglePanel;
                await this._togglePanel(panelType);
            });
        });

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

