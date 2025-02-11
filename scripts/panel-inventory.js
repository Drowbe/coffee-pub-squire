import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';
import { FavoritesPanel } from './panel-favorites.js';

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = this._getItems();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedInventory');
        this.hiddenCategories = new Set(); // Track which categories are hidden
    }

    _getItems() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
        );
        
        // Map items with favorite state
        const mappedItems = items.map(item => ({
            id: item.id,
            name: item.name,
            img: item.img || 'icons/svg/item-bag.svg',
            type: item.type,
            system: item.system,
            isFavorite: favorites.includes(item.id)
        }));

        // Group items by type
        const itemsByType = {};
        mappedItems.forEach(item => {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        });

        return {
            all: mappedItems,
            byType: itemsByType
        };
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all inventory items
        const inventoryItems = this.element.find('.inventory-item');
        let visibleItems = 0;
        
        inventoryItems.each((_, item) => {
            const $item = $(item);
            const itemName = $item.find('.inventory-name').text().toLowerCase();
            const itemType = this.items.all.find(i => i.id === $item.data('item-id'))?.type;
            
            // Check if the item's category is hidden
            const isCategoryHidden = itemType && this.hiddenCategories.has(itemType);
            
            if (!isCategoryHidden && (searchTerm === '' || itemName.includes(searchTerm))) {
                $item.show();
                visibleItems++;
            } else {
                $item.hide();
            }
        });

        // Update headers visibility
        this.element.find('.level-header').each((_, header) => {
            const $header = $(header);
            const $nextItems = $header.nextUntil('.level-header', '.inventory-item:visible');
            $header.toggle($nextItems.length > 0);
        });

        // Show/hide no matches message
        this.element.find('.no-matches').toggle(visibleItems === 0 && searchTerm !== '');
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Refresh items data
        this.items = this._getItems();

        const itemData = {
            items: this.items.all,
            itemsByType: this.items.byType,
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
        
        html.find('.inventory-item').each((i, el) => {
            const $item = $(el);
            const itemId = $item.data('item-id');
            const item = this.items.all.find(i => i.id === itemId);
            
            if (!item) return;

            const isCategoryHidden = this.hiddenCategories.has(item.type);
            const equippedMatch = !this.showOnlyEquipped || item.system.equipped;
            const shouldShow = !isCategoryHidden && equippedMatch;
            
            $item.toggle(shouldShow);
        });

        // Update headers visibility
        html.find('.level-header').each((_, header) => {
            const $header = $(header);
            const $nextItems = $header.nextUntil('.level-header', '.inventory-item:visible');
            $header.toggle($nextItems.length > 0);
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

        // Category filter toggles
        html.find('.category-filter').click((event) => {
            const $filter = $(event.currentTarget);
            const type = $filter.data('type');
            
            $filter.toggleClass('active');
            
            if ($filter.hasClass('active')) {
                this.hiddenCategories.delete(type);
            } else {
                this.hiddenCategories.add(type);
            }
            
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
            await FavoritesPanel.manageFavorite(this.actor, itemId);
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

        // Toggle equip state (shield icon)
        html.find('.tray-buttons .fa-shield-alt').click(async (event) => {
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
    }
} 