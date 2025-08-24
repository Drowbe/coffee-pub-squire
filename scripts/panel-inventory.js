import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { FavoritesPanel } from './panel-favorites.js';

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = this._getItems();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedInventory');
        // Don't set panelManager in constructor
    }

    _getActionType(item) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = item.system.activities;
        if (!activities) return null;
        
        // Get the first activity (usually there's only one)
        const activity = Object.values(activities)[0];
        if (!activity?.activation?.type) return null;
        
        // Check the activation type
        const activationType = activity.activation.type;
        
        switch(activationType) {
            case 'action': return 'action';
            case 'bonus': return 'bonus';
            case 'reaction': return 'reaction';
            case 'special': return 'special';
            default: return null;
        }
    }

    _getItems() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
        );
        
        // Map items with favorite state and action type
        const mappedItems = items.map(item => ({
            id: item.id,
            name: item.name,
            img: item.img || 'icons/svg/item-bag.svg',
            type: item.type,
            system: item.system,
            isFavorite: favorites.includes(item.id),
            categoryId: `category-inventory-${item.type === 'backpack' ? 'container' : item.type}`,
            actionType: this._getActionType(item),
            flags: item.flags || {},
            isNew: item.getFlag(MODULE.ID, 'isNew') || false
        }));

        // Group items by type and sort alphabetically within each type
        const itemsByType = {};
        mappedItems.forEach(item => {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        });

        // Sort each category alphabetically by name (removing HTML tags for sorting)
        Object.values(itemsByType).forEach(items => {
            items.sort((a, b) => {
                const nameA = a.name.replace(/<[^>]*>/g, '').toLowerCase();
                const nameB = b.name.replace(/<[^>]*>/g, '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        return {
            all: mappedItems,
            byType: itemsByType
        };
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh items data
        this.items = this._getItems();

        const itemData = {
            items: this.items.all,
            itemsByType: this.items.byType,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped,
            newlyAddedItems: PanelManager.newlyAddedItems,
            flags: this.items.all.reduce((acc, item) => {
                acc[item.id] = item.flags || {};
                return acc;
            }, {})
        };

        const template = await renderTemplate(TEMPLATES.PANEL_INVENTORY, itemData);
        const inventoryPanel = this.element.find('[data-panel="inventory"]');
        inventoryPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(inventoryPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.inventory-item');
        items.each((_, item) => {
            const $item = $(item);
            const itemId = $item.data('item-id');
            const inventoryItem = this.items.all.find(i => i.id === itemId);
            
            if (!inventoryItem) return;
            
            const categoryId = inventoryItem.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const equippedMatch = !this.showOnlyEquipped || inventoryItem.system.equipped;
            
            $item.toggle(!isCategoryHidden && equippedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        this.items.all.forEach(item => {
            const $heartIcon = this.element.find(`[data-item-id="${item.id}"] .fa-heart`);
            if ($heartIcon.length) {
                $heartIcon.toggleClass('faded', !item.isFavorite);
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        panel.off('.squireInventory');
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="inventory"]');

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        panel.on('click.squireInventory', '.inventory-category-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Add filter toggle handler
        panel.on('click.squireInventory', '.inventory-filter-toggle', async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedInventory', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
            this._updateVisibility(html);
        });

        // Item info click (feather icon)
        panel.on('click.squireInventory', '.tray-buttons .fa-feather', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        });

        // Toggle favorite
        panel.on('click.squireInventory', '.tray-buttons .fa-heart', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
            // Refresh the panel data to update heart icon states
            this.items = this._getItems();
            this._updateHeartIcons();
        });

        // Item use click (image overlay)
        panel.on('click.squireInventory', '.inventory-image-container .inventory-roll-overlay', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                await item.use({}, { event });
            }
        });

        // Toggle equip state (shield icon)
        panel.on('click.squireInventory', '.tray-buttons .fa-shield-alt', async (event) => {
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