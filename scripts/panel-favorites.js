import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class FavoritesPanel {
    static getPanelFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoritePanel') || [];
    }

    // Handle favorites methods using array-based approach
    static getHandleFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoriteHandle') || [];
    }

    static async setHandleFavorites(actor, ids) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot set handle favorites for actor from compendium
            return;
        }
        await actor.setFlag(MODULE.ID, 'favoriteHandle', ids);
    }

    static async addHandleFavorite(actor, itemId) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot add handle favorite for actor from compendium
            return;
        }
        const ids = new Set(this.getHandleFavorites(actor));
        ids.add(itemId);
        await this.setHandleFavorites(actor, Array.from(ids));
    }

    static async removeHandleFavorite(actor, itemId) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot remove handle favorite for actor from compendium
            return;
        }
        const ids = new Set(this.getHandleFavorites(actor));
        ids.delete(itemId);
        await this.setHandleFavorites(actor, Array.from(ids));
    }

    static isHandleFavorite(actor, itemId) {
        return this.getHandleFavorites(actor).includes(itemId);
    }

    /**
     * Clean up old favorite flags from all actors in the world
     * This should be called once to migrate to the new system
     */
    static async cleanupOldFavoriteFlags() {
        try {
            const actors = game.actors.filter(actor => 
                actor.getFlag(MODULE.ID, 'favorites') || 
                actor.getFlag(MODULE.ID, 'handleFavorites') ||
                actor.getFlag(MODULE.ID, 'isHandleFavorite')
            );
            
            if (actors.length === 0) {
                console.log(`${MODULE.ID}: No actors with old favorite flags found`);
                return;
            }
            
            console.log(`${MODULE.ID}: Cleaning up old favorite flags from ${actors.length} actors`);
            
            for (const actor of actors) {
                // Remove old flags
                await actor.unsetFlag(MODULE.ID, 'favorites');
                await actor.unsetFlag(MODULE.ID, 'handleFavorites');
                
                // Remove old per-item flags
                for (const item of actor.items) {
                    await item.unsetFlag(MODULE.ID, 'isHandleFavorite');
                }
            }
            
            console.log(`${MODULE.ID}: Successfully cleaned up old favorite flags`);
            
            // Refresh the UI if panels are open
            if (PanelManager.instance) {
                await PanelManager.instance.updateHandle();
                if (PanelManager.instance.favoritesPanel?.element) {
                    await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                }
            }
            
        } catch (error) {
            console.error(`${MODULE.ID}: Error cleaning up old favorite flags:`, error);
        }
    }



    static async clearHandleFavorites(actor) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot clear handle favorites for actor from compendium
            return [];
        }
        await actor.unsetFlag(MODULE.ID, 'favoriteHandle');
        if (PanelManager.instance) {
            // Update the handle to reflect the cleared handle favorites
            await PanelManager.instance.updateHandle();
        }
        return [];
    }

    static async clearFavorites(actor) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot clear favorites for actor from compendium
            return [];
        }
        await actor.unsetFlag(MODULE.ID, 'favoritePanel');
        // Also clear handle favorites when clearing all favorites
        await actor.unsetFlag(MODULE.ID, 'favoriteHandle');
        if (PanelManager.instance) {
            // Update just the handle to reflect the cleared favorites
            await PanelManager.instance.updateHandle();
            
            // Update panel data without full re-renders
            if (PanelManager.instance.favoritesPanel) {
                PanelManager.instance.favoritesPanel.favorites = [];
                // Clear the favorites list from DOM
                if (PanelManager.instance.favoritesPanel.element) {
                    const $favoritesList = $(PanelManager.instance.favoritesPanel.element).find('.favorites-list');
                    $favoritesList.find('.favorite-item').remove();
                    $favoritesList.append('<div class="tray-title-small" style="text-align: center; padding: 10px;">No favorites available</div>');
                }
            }
            
            // Update other panels' data
            if (PanelManager.instance.inventoryPanel) {
                PanelManager.instance.inventoryPanel.items = PanelManager.instance.inventoryPanel._getItems();
            }
            if (PanelManager.instance.weaponsPanel) {
                PanelManager.instance.weaponsPanel.weapons = PanelManager.instance.weaponsPanel._getWeapons();
            }
            if (PanelManager.instance.spellsPanel) {
                PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
            }
        }
        return [];
    }

    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Ensure we have a valid itemId and actor
            if (!itemId || !actor) {
                console.error("Invalid item ID or actor in manageFavorite:", { itemId, actor });
                return false;
            }

            // Check if actor is from a compendium (more robust check)
            const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
            if (isFromCompendium) {
                // Debug: Cannot modify favorites for actor from compendium
                return false;
            }

            // Get current panel favorites and ensure it's an array
            const panelFavorites = Array.isArray(actor.getFlag(MODULE.ID, 'favoritePanel')) ? 
                actor.getFlag(MODULE.ID, 'favoritePanel') : [];
            
            // Filter out any null/undefined values and create new array
            const newPanelFavorites = panelFavorites.includes(itemId)
                ? panelFavorites.filter(id => id !== null && id !== undefined && id !== itemId)
                : [...panelFavorites.filter(id => id !== null && id !== undefined), itemId];

            // Update the panel favorites flag
            await actor.setFlag(MODULE.ID, 'favoritePanel', newPanelFavorites);

            // If we're removing a panel favorite, also remove it from handle favorites
            if (!newPanelFavorites.includes(itemId)) {
                await FavoritesPanel.removeHandleFavorite(actor, itemId);
            }

            // Get the PanelManager instance directly
            const panelManager = PanelManager.instance;
            if (panelManager) {
                // Update just the handle to refresh favorites
                await panelManager.updateHandle();
                
                // Update the favorites panel data without full re-render
                if (panelManager.favoritesPanel) {
                    panelManager.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
                    
                    // Targeted DOM update for the favorites panel
                    if (panelManager.favoritesPanel.element) {
                        const $favoritesPanel = $(panelManager.favoritesPanel.element);
                        const $favoriteItem = $favoritesPanel.find(`[data-item-id="${itemId}"]`);
                        
                        if ($favoriteItem.length) {
                            if (newPanelFavorites.includes(itemId)) {
                                // Item was added to favorites - add it to the list
                                // This would require more complex logic, so we'll do a minimal re-render
                                await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
                            } else {
                                // Item was removed from favorites - remove it from the list
                                $favoriteItem.remove();
                            }
                        } else if (newPanelFavorites.includes(itemId)) {
                            // Item was added but not in DOM yet - do minimal re-render
                            await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
                        }
                    }
                }
                
                // Update other panels' data without full re-render
                if (panelManager.inventoryPanel) {
                    panelManager.inventoryPanel.items = panelManager.inventoryPanel._getItems();
                    
                    // Targeted DOM update for heart icons
                    if (panelManager.inventoryPanel.element) {
                        const $inventoryPanel = $(panelManager.inventoryPanel.element);
                        const $heartIcon = $inventoryPanel.find(`[data-item-id="${itemId}"] .fa-heart`);
                        if ($heartIcon.length) {
                            $heartIcon.toggleClass('active', newPanelFavorites.includes(itemId));
                        }
                    }
                }
                if (panelManager.weaponsPanel) {
                    panelManager.weaponsPanel.weapons = panelManager.weaponsPanel._getWeapons();
                    
                    // Targeted DOM update for heart icons
                    if (panelManager.weaponsPanel.element) {
                        const $weaponsPanel = $(panelManager.weaponsPanel.element);
                        const $heartIcon = $weaponsPanel.find(`[data-item-id="${itemId}"] .fa-heart`);
                        if ($heartIcon.length) {
                            $heartIcon.toggleClass('active', newPanelFavorites.includes(itemId));
                        }
                    }
                }
                if (panelManager.spellsPanel) {
                    panelManager.spellsPanel.spells = panelManager.spellsPanel._getSpells();
                    
                    // Targeted DOM update for heart icons
                    if (panelManager.spellsPanel.element) {
                        const $spellsPanel = $(panelManager.spellsPanel.element);
                        const $heartIcon = $spellsPanel.find(`[data-item-id="${itemId}"] .fa-heart`);
                        if ($heartIcon.length) {
                            $heartIcon.toggleClass('active', newPanelFavorites.includes(itemId));
                        }
                    }
                }
            }

            return newPanelFavorites.includes(itemId);
        } catch (error) {
            console.error("Error in manageFavorite:", error);
            return false;
        }
    }

    /**
     * Automatically adds equipped weapons and prepared spells to favorites for monster/NPC actors
     * @param {Actor} actor - The actor to check and update favorites for
     * @returns {Promise<boolean>} - Returns true if any changes were made
     */
    static async initializeNpcFavorites(actor) {
        if (!actor) return false;

        // Only process for non-player characters (monsters/NPCs)
        if (actor.type === "character") return false;
        
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Check if actor is from a compendium (more robust check)
            const isFromCompendium = actor.pack || (this.actor.collection && this.actor.collection.locked);
            if (isFromCompendium) {
                // Debug: Skipping auto-favorites initialization for actor from compendium
                return false;
            }
            
            // Get current panel favorites
            const currentPanelFavorites = FavoritesPanel.getPanelFavorites(actor);
            
            // If panel favorites already exist, don't override them
            if (currentPanelFavorites.length > 0) return false;
            
            // Get all items from the actor
            const newPanelFavorites = [];
            
            // Add equipped weapons to panel favorites
            const weapons = actor.items.filter(item => 
                item.type === "weapon" && 
                item.system.equipped === true
            );
            // Add prepared spells to panel favorites
            const spells = actor.items.filter(item => 
                item.type === "spell" && 
                item.system.preparation?.prepared === true
            );
            // Add monster features that are actions
            const monsterFeatures = actor.items.filter(item => 
                (item.type === "feat" || item.type === "feature") &&
                item.system.featureType === "Monster Feature" &&
                !!item.system.activation?.type
            );
            // Get the IDs of all items to favorite
            const itemsToFavorite = [...weapons, ...spells, ...monsterFeatures].map(item => item.id);
            
            // If no items to favorite, don't do anything
            if (itemsToFavorite.length === 0) return false;
            
            // Save the new panel favorites
            await actor.setFlag(MODULE.ID, 'favoritePanel', itemsToFavorite);
            
            // Force refresh of items collection to ensure up-to-date data
            if (actor.items && typeof actor.items._flush === 'function') {
                await actor.items._flush();
            }
            
            // Refresh the panels if they exist
            if (PanelManager.instance && PanelManager.currentActor?.id === actor.id) {
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
                // Update the handle to reflect the new favorites
                await PanelManager.instance.updateHandle();
            }
            return true;
        } catch (error) {
            console.error("Error in initializeNpcFavorites:", error);
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

        // Set up the context menu options once
        this.menuOptions = [{
            name: "Move to Top",
            icon: '<i class="fas fa-angle-double-up"></i>',
            condition: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex > 0;
            },
            callback: li => {
                const itemId = $(li).data('item-id');
                this._reorderFavorite(itemId, 0);
            }
        }, {
            name: "Move Up",
            icon: '<i class="fas fa-angle-up"></i>',
            condition: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex > 0;
            },
            callback: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                this._reorderFavorite(itemId, currentIndex - 1);
            }
        }, {
            name: "Move Down",
            icon: '<i class="fas fa-angle-down"></i>',
            condition: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex < favorites.length - 1;
            },
            callback: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                this._reorderFavorite(itemId, currentIndex + 1);
            }
        }, {
            name: "Move to Bottom",
            icon: '<i class="fas fa-angle-double-down"></i>',
            condition: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex < favorites.length - 1;
            },
            callback: li => {
                const itemId = $(li).data('item-id');
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                this._reorderFavorite(itemId, favorites.length - 1);
            }
        }];
        
        // Auto-favorite for NPC/Monster
        // (No longer auto-adds to handle; only user can set isHandleFavorite)
        if (this.actor && this.actor.type !== "character") {
            // Check if actor is from a compendium before trying to modify it
            const isFromCompendium = this.actor.pack || (this.actor.collection && this.actor.collection.locked);
            if (isFromCompendium) {
                // Debug: Skipping auto-favorites initialization for actor from compendium
            } else {
                FavoritesPanel.initializeNpcFavorites(this.actor);
            }
        }
        

    }

    _getFavorites() {
        if (!this.actor) return [];
        
        // Get our module's panel favorites from flags and filter out null values
        const panelFavorites = (this.actor.getFlag(MODULE.ID, 'favoritePanel') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(this.actor.items.map(item => [item.id, item]));
        
        // Map panel favorites in their original order
        const favoritedItems = panelFavorites
            .map(id => itemsById.get(id))
            .filter(item => item) // Remove any undefined items (in case an item was deleted)
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                equipped: item.system.equipped,
                hasEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showStarIcon: item.type === 'feat',
                isHandleFavorite: FavoritesPanel.isHandleFavorite(this.actor, item.id)
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
        
        // Properly cleanup context menu
        if (this._contextMenu) {
            this._contextMenu.close();
            this._contextMenu = null;
        }
        // Remove any existing context menu bindings
        panel.find('.favorites-list').off('contextmenu');
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
        const favoritesList = panel.find('.favorites-list');
        
        // Always create a fresh context menu
        this._contextMenu = new ContextMenu(favoritesList, '.favorite-item', this.menuOptions);
        
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
            event.preventDefault();
            event.stopPropagation();
            const $item = $(event.currentTarget).closest('.favorite-item');
            const itemId = $item.data('item-id');
            if (!itemId) {
                console.error('No item ID found for favorite toggle:', { $item });
                return;
            }
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

        // Toggle handle favorite
        panel.on('click', '.tray-buttons .handle-favorite-toggle', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const $item = $(event.currentTarget).closest('.favorite-item');
            const itemId = $item.data('item-id');
            if (!itemId) return;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            const current = FavoritesPanel.isHandleFavorite(this.actor, itemId);
            if (current) {
                await FavoritesPanel.removeHandleFavorite(this.actor, itemId);
            } else {
                await FavoritesPanel.addHandleFavorite(this.actor, itemId);
            }
            // Re-render the panel and update the handle
            if (PanelManager.instance) {
                if (PanelManager.instance.favoritesPanel?.element) {
                    await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                }
                await PanelManager.instance.updateHandle();
            }
        });

        // Add clear all button listener
        html.find('.favorites-clear-all').click(async () => {
            await FavoritesPanel.clearFavorites(this.actor);
        });
    }

    async _reorderFavorite(itemId, newIndex) {
        const actor = this.actor;
        if (!actor) {
            // Debug: No actor found in _reorderFavorite
            return;
        }

        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Debug: Cannot reorder favorites for actor from compendium
            return;
        }

        // Get the raw panel favorites array (just IDs) from flags
        const panelFavoriteIds = actor.getFlag(MODULE.ID, 'favoritePanel') || [];
        
        
        // Find the current index of the item ID
        const currentIndex = panelFavoriteIds.indexOf(itemId);
        if (currentIndex === -1) {
            // Debug: Item not found in panel favorites
            return;
        }

        

        // Remove item from current position and insert at new position
        const [movedId] = panelFavoriteIds.splice(currentIndex, 1);
        panelFavoriteIds.splice(newIndex, 0, movedId);

        try {
            // Clean up context menu before updates
            if (this._contextMenu) {
                this._contextMenu.close();
                delete this._contextMenu;
            }

            // Update the actor's panel favorites flag
            await actor.setFlag(MODULE.ID, 'favoritePanel', panelFavoriteIds);
            
            // Update panels and handle
            if (PanelManager.instance) {
                // Get the current tray element and state
                const tray = PanelManager.element;
                const wasExpanded = tray.hasClass('expanded');
                const wasPinned = tray.hasClass('pinned');
                
                // Update just the handle - no need to re-render all panels
                await PanelManager.instance.updateHandle();
                
                // Update the favorites panel data
                if (PanelManager.instance.favoritesPanel) {
                    PanelManager.instance.favoritesPanel.favorites = PanelManager.instance.favoritesPanel._getFavorites();
                }
                
                // Update other panels' data
                if (PanelManager.instance.inventoryPanel) {
                    PanelManager.instance.inventoryPanel.items = PanelManager.instance.inventoryPanel._getItems();
                }
                if (PanelManager.instance.weaponsPanel) {
                    PanelManager.instance.weaponsPanel.weapons = PanelManager.instance.weaponsPanel._getWeapons();
                }
                if (PanelManager.instance.spellsPanel) {
                    PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
                }

                // Re-bind the handle click event
                const handle = tray.find('.tray-handle');
                handle.off('click').on('click', (event) => {
                    if ($(event.target).closest('.tray-handle-button-pin').length || 
                        $(event.target).closest('.handle-favorite-icon').length ||
                        $(event.target).closest('.handle-healthbar').length ||
                        $(event.target).closest('.handle-dice-tray').length) return;
                    
                    event.preventDefault();
                    event.stopPropagation();
                    
                    if (PanelManager.isPinned) {
                        ui.notifications.warn("You have the tray pinned open. Unpin the tray to close it.");
                        return false;
                    }
                    
                    // Play tray open sound when expanding
                    if (!tray.hasClass('expanded')) {
                        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                        if (blacksmith) {
                            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
                            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                        }
                    }
                    
                    tray.toggleClass('expanded');
                    return false;
                });

                // Re-bind pin button event
                const pinButton = handle.find('.tray-handle-button-pin');
                pinButton.off('click').on('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    PanelManager.isPinned = !PanelManager.isPinned;
                    await game.settings.set(MODULE.ID, 'isPinned', PanelManager.isPinned);
                    
                    // Play pin/unpin sound
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    if (blacksmith) {
                        const sound = game.settings.get(MODULE.ID, PanelManager.isPinned ? 'pinSound' : 'unpinSound');
                        blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                    }
                    
                    if (PanelManager.isPinned) {
                        tray.addClass('pinned expanded');
                        // Update UI margin when pinned - only need trayWidth + offset since handle is included in width
                        const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                        const uiLeft = document.querySelector('#ui-left');
                        if (uiLeft) {
                            uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                        }
                    } else {
                        tray.removeClass('pinned expanded');
                        // Reset UI margin when unpinned - need both handle width and offset
                        const uiLeft = document.querySelector('#ui-left');
                        if (uiLeft) {
                            uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                        }
                    }
                    
                    return false;
                });

                // Restore previous state if needed
                if (wasExpanded) tray.addClass('expanded');
                if (wasPinned) tray.addClass('pinned');
            }

        } catch (error) {
            console.error('Error reordering favorites:', error);
        }
    }
} 
