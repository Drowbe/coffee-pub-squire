import { MODULE, TEMPLATES } from './const.js';

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = this._getItems();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedInventory');
    }

    _getItems() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
        );
        
        // Map items with favorite state
        return items.map(item => ({
            id: item.id,
            name: item.name,
            img: item.img || 'icons/svg/item-bag.svg',
            type: item.type,
            system: item.system,
            isFavorite: favorites.includes(item.id)
        }));
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all inventory items
        const inventoryItems = this.element.find('.inventory-item');
        
        inventoryItems.each((_, item) => {
            const $item = $(item);
            const itemName = $item.find('.inventory-name').text().toLowerCase();
            
            if (searchTerm === '' || itemName.includes(searchTerm)) {
                $item.show();
            } else {
                $item.hide();
            }
        });
    }

    async _toggleFavorite(itemId) {
        try {
            // Get current favorites
            const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
            const newFavorites = favorites.includes(itemId)
                ? favorites.filter(id => id !== itemId)
                : [...favorites, itemId];
            
            // Update the flag
            await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            
            // Update our local items data
            this.items = this._getItems();
            
            // Find the PanelManager instance
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];

            // Re-render this panel
            if (this.element) {
                await this.render();
            }

            // Re-render the favorites panel through PanelManager
            if (panelManager?.favoritesPanel) {
                await panelManager.favoritesPanel.render(panelManager.element);
            }

            // Update the heart icon state immediately
            const heartIcon = this.element.find(`.inventory-item[data-item-id="${itemId}"] .fa-heart`);
            if (heartIcon.length) {
                heartIcon.toggleClass('faded', !newFavorites.includes(itemId));
            }

        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const itemData = {
            items: this.items,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped
        };

        const template = await renderTemplate(TEMPLATES.PANEL_INVENTORY, itemData);
        this.element.find('[data-panel="inventory"]').html(template);
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        const searchInput = html.find('.inventory-search');
        const searchTerm = searchInput.val()?.toLowerCase() || '';
        const filterValue = html.find('.inventory-filter').val();
        
        const inventoryItems = html.find('.inventory-item');
        inventoryItems.each((i, el) => {
            const $item = $(el);
            const itemId = $item.data('item-id');
            const item = this.items.find(i => i.id === itemId);
            
            if (!item) return;

            const nameMatch = item.name.toLowerCase().includes(searchTerm);
            const typeMatch = filterValue === 'all' || filterValue === item.type;
            const equippedMatch = !this.showOnlyEquipped || item.system.equipped;

            const shouldShow = nameMatch && typeMatch && equippedMatch;
            $item.toggle(shouldShow);
        });
    }

    _activateListeners(html) {
        // Add filter toggle handler
        html.find('.inventory-filter-toggle').click(async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedInventory', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
            this._updateVisibility(html);
        });

        // Toggle equipped state (box icon)
        html.find('.tray-buttons .fa-box').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.inventory-item');
                $item.toggleClass('prepared', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(html);
            }
        });

        // Item info click (feather icon)
        html.find('.tray-buttons .fa-feather').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        });

        // Toggle favorite
        html.find('.tray-buttons .fa-heart').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            await this._toggleFavorite(itemId);
        });

        // Item use click (image overlay)
        html.find('.inventory-image-container').click(async (event) => {
            if ($(event.target).hasClass('inventory-roll-overlay')) {
                const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
        });

        // Search and filter
        const searchInput = html.find('.inventory-search');
        const filterSelect = html.find('.inventory-filter');

        searchInput.off('input keyup change').on('input keyup change', () => {
            this._updateVisibility(html);
        });

        filterSelect.off('change').on('change', () => {
            this._updateVisibility(html);
        });

        // Add search input listener
        html.find('.inventory-search').on('input', (event) => {
            this._handleSearch(event.target.value);
        });

        // Add search clear button listener
        html.find('.search-clear').click((event) => {
            const $search = $(event.currentTarget).siblings('.inventory-search');
            $search.val('').trigger('input');
        });
    }
} 