import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement } from './helpers.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) return;

        const templateData = {
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const content = await renderTemplate(TEMPLATES.PANEL_CONTROL, templateData);
        // v13: Use native DOM methods
        const controlPanel = this.element.querySelector('[data-panel="control"]');
        if (controlPanel) {
            controlPanel.innerHTML = content;
        }
        
        this._activateListeners(this.element);
        this._updateVisibility();
    }

    _updateVisibility() {
        if (!this.element) return;
        
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
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();

        // Toggle visibility of individual search boxes based on global search state
        this.element.find('.panel-containers.stacked .panel-container .search-container').toggle(searchTerm === '');

        // Track visible items for each panel
        const visibleCounts = {
            favorites: 0,
            weapons: 0,
            spells: 0,
            features: 0,
            inventory: 0
        };

        // Map panel types to their item class names
        const itemClassMap = {
            favorites: 'favorite',
            weapons: 'weapon',
            spells: 'spell',
            features: 'feature',
            inventory: 'inventory'
        };

        // Process each visible panel separately
        Object.keys(visibleCounts).forEach(panelType => {
            const panelElement = this.element.find(`[data-panel="${panelType}"]`);
            if (!panelElement.hasClass('visible')) return;

            // Find all items in this panel using the correct class name
            const itemClass = itemClassMap[panelType];
            const items = panelElement.find(`.${itemClass}-item`);

            let visibleItemsInPanel = 0;  // Initialize counter for this panel

            // Process items
            items.each((_, item) => {
                const $item = $(item);
                const nameElement = $item.find(`.${itemClass}-name`);
                
                // Skip if no name element found
                if (nameElement.length === 0) {
                    return;
                }

                const itemName = nameElement
                    .clone()
                    .children()
                    .remove()
                    .end()
                    .text()
                    .toLowerCase()
                    .trim();
                
                const shouldShow = searchTerm === '' || itemName.includes(searchTerm);
                
                // Toggle item visibility
                $item.toggle(shouldShow);
                if (shouldShow) visibleItemsInPanel++;
            });

            // Handle ALL category headers in this panel
            if (searchTerm !== '') {
                // First hide all headers
                panelElement.find('.category-header').hide();
                
                // Then only show headers that have visible items
                const visibleItems = panelElement.find(`.${itemClass}-item:visible`);
                const visibleCategories = new Set();
                
                visibleItems.each((_, item) => {
                    const categoryId = $(item).data('category-id');
                    if (categoryId) visibleCategories.add(categoryId);
                });
                
                visibleCategories.forEach(categoryId => {
                    const header = panelElement.find(`.category-header[data-category-id="${categoryId}"]`);
                    if (header.length) {
                        header.show();
                    }
                });
            }

            // Update panel counter
            visibleCounts[panelType] = visibleItemsInPanel;

            // Toggle "No matches" message - only show during search with no results
            const noMatchesElement = panelElement.find('.no-matches');
            if (searchTerm === '') {
                noMatchesElement.removeClass('show').hide();
            } else {
                const shouldShowNoMatches = visibleItemsInPanel === 0 && panelElement.hasClass('visible');
                noMatchesElement.toggleClass('show', shouldShowNoMatches).toggle(shouldShowNoMatches);
            }
        });

        // Handle spell level headers separately since they're structured differently
        const spellsPanel = this.element.find('[data-panel="spells"]');
        if (spellsPanel.length && spellsPanel.hasClass('visible')) {
            spellsPanel.find('.category-header').each((_, header) => {
                const $header = $(header);
                const categoryId = $header.data('category-id');
                const $nextSpells = spellsPanel.find(`[data-category-id="${categoryId}"]:visible`);
                $header.toggle($nextSpells.length > 0);
            });
        }

        // Clear individual search boxes when global search is cleared
        if (searchTerm === '') {
            this.element.find('.panel-containers.stacked .panel-container .search-container input').val('');
            // Show all headers when search is cleared
            this.element.find('.category-header').show();
            // Hide all "No matches" messages
            this.element.find('.no-matches').removeClass('show').hide();
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
                const panelType = event.currentTarget.dataset.togglePanel;
                await this._togglePanel(panelType);
            });
        });

        // Add search input listener
        const searchInput = controlPanel.querySelector('.global-search');
        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                this._handleSearch(event.target.value);
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