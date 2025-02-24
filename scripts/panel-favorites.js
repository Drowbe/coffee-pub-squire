import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';

export class FavoritesPanel {
    static getFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favorites') || [];
    }

    static async clearFavorites(actor) {
        await actor.unsetFlag(MODULE.ID, 'favorites');
        if (PanelManager.instance) {
            // First update the favorites panel
            if (PanelManager.instance.favoritesPanel?.element) {
                await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
            }

            // Then update all other panels
            if (PanelManager.instance.inventoryPanel?.element) {
                await PanelManager.instance.inventoryPanel.render(PanelManager.instance.inventoryPanel.element);
            }
            if (PanelManager.instance.weaponsPanel?.element) {
                await PanelManager.instance.weaponsPanel.render(PanelManager.instance.weaponsPanel.element);
            }
            if (PanelManager.instance.spellsPanel?.element) {
                await PanelManager.instance.spellsPanel.render(PanelManager.instance.spellsPanel.element);
            }

            // Update the handle to reflect the cleared favorites
            await PanelManager.instance.updateHandle();
        }
        return [];
    }

    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Ensure we have a valid itemId
            if (!itemId) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Invalid item ID in manageFavorite",
                    { itemId, stack: new Error().stack },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
                return;
            }

            // Get current favorites
            const favorites = (actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null && id !== undefined);
            const newFavorites = favorites.includes(itemId)
                ? favorites.filter(id => id !== itemId)
                : [...favorites, itemId];

            // Update the flag and wait for it to complete
            await actor.unsetFlag(MODULE.ID, 'favorites');
            await actor.setFlag(MODULE.ID, 'favorites', newFavorites);

            // Get the PanelManager instance directly
            const panelManager = PanelManager.instance;
            if (panelManager) {
                // First update the favorites panel
                if (panelManager.favoritesPanel?.element) {
                    await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
                }

                // Then update all other panels
                if (panelManager.inventoryPanel?.element) {
                    await panelManager.inventoryPanel.render(panelManager.inventoryPanel.element);
                }
                if (panelManager.weaponsPanel?.element) {
                    await panelManager.weaponsPanel.render(panelManager.weaponsPanel.element);
                }
                if (panelManager.spellsPanel?.element) {
                    await panelManager.spellsPanel.render(panelManager.spellsPanel.element);
                }

                // Update just the handle to refresh favorites
                await panelManager.updateHandle();
            }

            return newFavorites.includes(itemId);
        } catch (error) {
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Error in manageFavorite",
                error,
                false,
                true,
                false,
                MODULE.TITLE
            );
            return false;
        }
    }

    constructor(actor) {
        this.actor = actor;
        this.favorites = this._getFavorites();
        // Initialize filter states
        this.showSpells = game.settings.get(MODULE.ID, 'showSpellFavorites');
        this.showWeapons = game.settings.get(MODULE.ID, 'showWeaponFavorites');
        this.showFeatures = game.settings.get(MODULE.ID, 'showFeaturesFavorites');
        this.showInventory = game.settings.get(MODULE.ID, 'showInventoryFavorites');
    }

    _getFavorites() {
        if (!this.actor) return [];
        
        // Get our module's favorites from flags and filter out null values
        const favorites = (this.actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null && id !== undefined);
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        
        // Get only favorited items
        const favoritedItems = this.actor.items
            .filter(item => favorites.includes(item.id))
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                equipped: item.system.equipped,
                hasEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showStarIcon: item.type === 'feat'
            }));
            
        return favoritedItems;
    }

    async render(html) {
        if (!html) return;
        
        // Store the element reference
        this.element = html;
        
        // Refresh favorites data
        this.favorites = this._getFavorites();
        
        const favoritesData = {
            favorites: this.favorites,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showSpells: this.showSpells,
            showWeapons: this.showWeapons,
            showFeatures: this.showFeatures,
            showInventory: this.showInventory,
            hasFavorites: this.favorites.length > 0
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FAVORITES, favoritesData);
        
        // Get the favorites panel element
        const favoritesPanel = html.find('[data-panel="favorites"]');
        if (!favoritesPanel.length) return;
        
        // Clean up old event listeners
        this._removeEventListeners(favoritesPanel);
        
        // Update HTML
        favoritesPanel.html(template);
        
        // Add equipped class and handle shield icon visibility for equipped items
        favoritesPanel.find('.favorite-item').each((_, item) => {
            const $item = $(item);
            const itemId = $item.data('item-id');
            const favoriteItem = this.favorites.find(f => f.id === itemId);
            
            if (favoriteItem) {
                // Handle equipped state
                if (favoriteItem.equipped) {
                    $item.addClass('equipped');
                }
                
                // Handle shield icon visibility and state
                const $shieldIcon = $item.find('.fa-shield-alt');
                if (favoriteItem.showEquipToggle) {
                    $shieldIcon.show();
                    $shieldIcon.toggleClass('faded', !favoriteItem.equipped);
                } else {
                    $shieldIcon.hide();
                }
            }
        });
        
        // Add new event listeners
        this._activateListeners(html);
        
        // Update visibility
        this._updateVisibility(html);
    }

    _removeEventListeners(panel) {
        // Remove all event listeners from elements that will be replaced
        panel.find('.favorite-item .fa-heart').off();
        panel.find('.favorite-image-container').off();
        panel.find('.fa-feather').off();
        panel.find('.favorites-spell-toggle').off();
        panel.find('.favorites-weapon-toggle').off();
        panel.find('.favorites-features-toggle').off();
        panel.find('.favorites-inventory-toggle').off();
    }

    _updateVisibility(html) {
        html.find('.favorite-item').each((i, el) => {
            const $item = $(el);
            const itemId = $item.data('item-id');
            const item = this.favorites.find(f => f.id === itemId);
            
            if (!item) return;

            let shouldShow = false;
            if (item.type === 'spell' && this.showSpells) shouldShow = true;
            if (item.type === 'weapon' && this.showWeapons) shouldShow = true;
            if (item.type === 'feat' && this.showFeatures) shouldShow = true;
            if (['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type) && 
                this.showInventory && item.type !== 'weapon') shouldShow = true;

            $item.toggle(shouldShow);
        });
    }

    async _toggleFilter(filterType) {
        switch(filterType) {
            case 'spells':
                this.showSpells = !this.showSpells;
                await game.settings.set(MODULE.ID, 'showSpellFavorites', this.showSpells);
                break;
            case 'weapons':
                this.showWeapons = !this.showWeapons;
                await game.settings.set(MODULE.ID, 'showWeaponFavorites', this.showWeapons);
                break;
            case 'features':
                this.showFeatures = !this.showFeatures;
                await game.settings.set(MODULE.ID, 'showFeaturesFavorites', this.showFeatures);
                break;
            case 'inventory':
                this.showInventory = !this.showInventory;
                await game.settings.set(MODULE.ID, 'showInventoryFavorites', this.showInventory);
                break;
        }
        this._updateVisibility(this.element);
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all favorite items
        const favoriteItems = this.element.find('.favorite-item');
        let visibleItems = 0;
        
        favoriteItems.each((_, item) => {
            const $item = $(item);
            const itemName = $item.find('.favorite-name').text().toLowerCase();
            
            if (searchTerm === '' || itemName.includes(searchTerm)) {
                $item.show();
                visibleItems++;
            } else {
                $item.hide();
            }
        });

        // Show/hide no matches message
        this.element.find('.no-matches').toggle(visibleItems === 0 && searchTerm !== '');
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="favorites"]');
        const self = this; // Store panel instance reference

        // Add context menu for reordering
        new ContextMenu(panel.find('.favorite-item'), {
            callback: (target) => {
                const $item = $(target);
                const itemId = $item.data('item-id');
                const $items = panel.find('.favorite-item:visible');
                const currentIndex = $items.index($item);
                const totalItems = $items.length;
                
                const menuItems = [];
                
                // Only add "Move Up" if not at top
                if (currentIndex > 0) {
                    menuItems.push({
                        name: "Move to Top",
                        icon: '<i class="fas fa-angle-double-up"></i>',
                        callback: () => self._reorderFavorite(itemId, 0)
                    });
                    menuItems.push({
                        name: "Move Up",
                        icon: '<i class="fas fa-angle-up"></i>',
                        callback: () => self._reorderFavorite(itemId, currentIndex - 1)
                    });
                }
                
                // Only add "Move Down" if not at bottom
                if (currentIndex < totalItems - 1) {
                    menuItems.push({
                        name: "Move Down",
                        icon: '<i class="fas fa-angle-down"></i>',
                        callback: () => self._reorderFavorite(itemId, currentIndex + 1)
                    });
                    menuItems.push({
                        name: "Move to Bottom",
                        icon: '<i class="fas fa-angle-double-down"></i>',
                        callback: () => self._reorderFavorite(itemId, totalItems - 1)
                    });
                }
                
                return menuItems;
            }
        });

        // Filter toggles
        html.find('.favorites-spell-toggle').click(async (event) => {
            await this._toggleFilter('spells');
            $(event.currentTarget)
                .toggleClass('active', this.showSpells)
                .toggleClass('faded', !this.showSpells);
        });

        html.find('.favorites-weapon-toggle').click(async (event) => {
            await this._toggleFilter('weapons');
            $(event.currentTarget)
                .toggleClass('active', this.showWeapons)
                .toggleClass('faded', !this.showWeapons);
        });

        html.find('.favorites-features-toggle').click(async (event) => {
            await this._toggleFilter('features');
            $(event.currentTarget)
                .toggleClass('active', this.showFeatures)
                .toggleClass('faded', !this.showFeatures);
        });

        html.find('.favorites-inventory-toggle').click(async (event) => {
            await this._toggleFilter('inventory');
            $(event.currentTarget)
                .toggleClass('active', this.showInventory)
                .toggleClass('faded', !this.showInventory);
        });

        // Roll/Use item
        html.find('.favorite-image-container').click(async (event) => {
            if ($(event.target).hasClass('favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
        });

        // View item details
        html.find('.favorite-item .fa-feather').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        });

        // Toggle favorite
        panel.on('click', '.tray-buttons .fa-heart', async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
        });

        // Toggle prepared state (sun icon)
        panel.on('click', '.tray-buttons .fa-sun', async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                const newPrepared = !item.system.preparation.prepared;
                await item.update({
                    'system.preparation.prepared': newPrepared
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.favorite-item');
                $item.toggleClass('prepared', newPrepared);
                $(event.currentTarget).toggleClass('faded', !newPrepared);

                // Update the handle to reflect the new prepared state
                if (PanelManager.instance) {
                    await PanelManager.instance.updateHandle();
                }
            }
        });

        // Toggle equip state (shield icon)
        panel.on('click', '.tray-buttons .fa-shield-alt', async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.favorite-item');
                $item.toggleClass('equipped', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);

                // Update the handle to reflect the new equipped state
                if (PanelManager.instance) {
                    // First update the favorites panel
                    if (PanelManager.instance.favoritesPanel?.element) {
                        await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                    }

                    // Then update all other panels
                    if (PanelManager.instance.inventoryPanel?.element) {
                        await PanelManager.instance.inventoryPanel.render(PanelManager.instance.inventoryPanel.element);
                    }
                    if (PanelManager.instance.weaponsPanel?.element) {
                        await PanelManager.instance.weaponsPanel.render(PanelManager.instance.weaponsPanel.element);
                    }
                    if (PanelManager.instance.spellsPanel?.element) {
                        await PanelManager.instance.spellsPanel.render(PanelManager.instance.spellsPanel.element);
                    }

                    // Update the handle to reflect the new equipped state
                    await PanelManager.instance.updateHandle();
                }
            }
        });

        // Add clear all button listener
        html.find('.favorites-clear-all').click(async () => {
            await FavoritesPanel.clearFavorites(this.actor);
        });
    }

    async _reorderFavorite(itemId, newIndex) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Get current favorites
            const currentFavorites = FavoritesPanel.getFavorites(this.actor);
            if (!Array.isArray(currentFavorites)) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Invalid favorites data structure",
                    { currentFavorites },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
                return;
            }

            // Find current index of the item
            const currentIndex = currentFavorites.indexOf(itemId);
            if (currentIndex === -1) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Could not find item in favorites",
                    { itemId },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
                return;
            }

            // Reorder the array
            const newFavorites = [...currentFavorites];
            const [movedId] = newFavorites.splice(currentIndex, 1);
            newFavorites.splice(newIndex, 0, movedId);

            // Save new order
            try {
                await this.actor.unsetFlag(MODULE.ID, 'favorites');
                await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            } catch (flagError) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Error updating favorites flags",
                    flagError,
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
                return;
            }

            // Re-render
            await this.render(this.element);

        } catch (error) {
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Error during favorites reordering",
                error,
                false,
                true,
                false,
                MODULE.TITLE
            );
        }
    }
} 