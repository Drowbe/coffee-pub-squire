import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const templateData = {
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const content = await renderTemplate(TEMPLATES.PANEL_CONTROL, templateData);
        this.element.find('[data-panel="control"]').html(content);
        
        this._activateListeners(this.element);
        this._updateVisibility();
    }

    _updateVisibility() {
        ['favorites', 'weapons', 'spells', 'features', 'inventory'].forEach(panel => {
            const isVisible = game.settings.get(MODULE.ID, `show${panel.charAt(0).toUpperCase() + panel.slice(1)}Panel`);
            // Update icon state
            this.element.find(`[data-panel="control"] .control-toggle[data-toggle-panel="${panel}"]`)
                .toggleClass('active', isVisible)
                .toggleClass('faded', !isVisible);
            
            // Update panel visibility
            this.element.find(`.panel-containers.stacked .panel-container[data-panel="${panel}"]`)
                .toggleClass('visible', isVisible);
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

        // Process each visible panel separately
        Object.keys(visibleCounts).forEach(panelType => {
            const panelElement = this.element.find(`[data-panel="${panelType}"]`);
            if (!panelElement.hasClass('visible')) return;

            // Find all items in this panel
            const items = panelType === 'features' 
                ? panelElement.find('.weapon-item')  // Features panel uses weapon-item class
                : panelElement.find(`.${panelType.slice(0, -1)}-item`);  // Others use panel-specific classes
            let visibleItemsInPanel = 0;

            console.log(`${panelType} panel - Total items found:`, items.length);

            // Process items
            items.each((_, item) => {
                const $item = $(item);
                const itemName = $item.find('.inventory-name, .weapon-name, .spell-name, .feature-name, .favorite-name').text().toLowerCase();
                const shouldShow = searchTerm === '' || itemName.includes(searchTerm);
                
                // Toggle item visibility
                $item.toggle(shouldShow);
                if (shouldShow) visibleItemsInPanel++;

                // Handle category headers
                const categoryId = $item.data('category-id');
                if (categoryId) {
                    const categoryHeader = panelElement.find(`.category-header[data-category-id="${categoryId}"]`);
                    const visibleItemsInCategory = panelElement.find(`[data-category-id="${categoryId}"]:visible`).length;
                    categoryHeader.toggle(visibleItemsInCategory > 0);
                }
            });

            console.log(`${panelType} panel - Visible items:`, visibleItemsInPanel);

            // Update panel counter
            visibleCounts[panelType] = visibleItemsInPanel;

            // Toggle "No matches" message
            const shouldShowNoMatches = visibleItemsInPanel === 0 && searchTerm !== '' && panelElement.hasClass('visible');
            console.log(`${panelType} panel - Should show "No matches":`, shouldShowNoMatches, {
                visibleItemsInPanel,
                hasSearchTerm: searchTerm !== '',
                isPanelVisible: panelElement.hasClass('visible')
            });

            panelElement.find('.no-matches').toggle(shouldShowNoMatches);
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
        }
    }

    async _togglePanel(panelType) {
        const settingKey = `show${panelType.charAt(0).toUpperCase() + panelType.slice(1)}Panel`;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        await game.settings.set(MODULE.ID, settingKey, !currentValue);
        this._updateVisibility();
        
        // Update all panels through the panel manager
        if (PanelManager.instance) {
            await PanelManager.instance.updateTray();
        }
    }

    _activateListeners(html) {
        html.find('[data-panel="control"] .control-toggle').click(async (event) => {
            const panelType = $(event.currentTarget).data('toggle-panel');
            await this._togglePanel(panelType);
        });

        // Add search input listener
        html.find('[data-panel="control"] .global-search').on('input', (event) => {
            this._handleSearch(event.target.value);
        });

        // Add search clear button listener
        html.find('[data-panel="control"] .search-clear').click((event) => {
            const $search = $(event.currentTarget).siblings('.global-search');
            $search.val('').trigger('input');
        });
    }
} 