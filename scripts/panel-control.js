import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate } from './helpers.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
        this._searchTerm = '';
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
        // v13: Use native DOM methods instead of jQuery
        if (!this.element) return;

        this._searchTerm = searchTerm;

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
            // v13: Use native DOM querySelector
            const panelElement = this.element.querySelector(`[data-panel="${panelType}"]`);
            if (!panelElement || !panelElement.classList.contains('visible')) return;

            // Find all items in this panel using the correct class name
            const itemClass = itemClassMap[panelType];
            const items = panelElement.querySelectorAll(`.${itemClass}-item`);

            let visibleItemsInPanel = 0;  // Initialize counter for this panel

            // Process items
            // v13: Use native DOM forEach
            items.forEach(item => {
                const nameElement = item.querySelector(`.${itemClass}-name`);
                
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
                const visibleItems = Array.from(panelElement.querySelectorAll(`.${itemClass}-item`))
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