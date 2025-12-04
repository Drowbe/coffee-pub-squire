import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement } from './helpers.js';

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
            return;
        }
        await actor.setFlag(MODULE.ID, 'favoriteHandle', ids);
    }

    static async addHandleFavorite(actor, itemId) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
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
                return;
            }
            
            for (const actor of actors) {
                // Remove old flags
                await actor.unsetFlag(MODULE.ID, 'favorites');
                await actor.unsetFlag(MODULE.ID, 'handleFavorites');
                
                // Remove old per-item flags
                for (const item of actor.items) {
                    await item.unsetFlag(MODULE.ID, 'isHandleFavorite');
                }
            }
            

            
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
            // Cannot clear favorites for actor from compendium
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
                PanelManager.instance.inventoryPanel._updateHeartIcons();
            }
            if (PanelManager.instance.weaponsPanel) {
                PanelManager.instance.weaponsPanel.weapons = PanelManager.instance.weaponsPanel._getWeapons();
                PanelManager.instance.weaponsPanel._updateHeartIcons();
            }
            if (PanelManager.instance.spellsPanel) {
                PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
                PanelManager.instance.spellsPanel._updateHeartIcons();
            }
            if (PanelManager.instance.featuresPanel) {
                PanelManager.instance.featuresPanel.features = PanelManager.instance.featuresPanel._getFeatures();
                PanelManager.instance.featuresPanel._updateHeartIcons();
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
                // Cannot modify favorites for actor from compendium
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
            // (handle favorites must also be panel favorites)
            if (!newPanelFavorites.includes(itemId)) {
                await FavoritesPanel.removeHandleFavorite(actor, itemId);
            }

            // Handle favorites are now completely manual - but must also be panel favorites

            // Get the PanelManager instance directly
            const panelManager = PanelManager.instance;
            if (panelManager) {
                // Handle favorites are now completely manual - no auto-syncing
                
                // Update just the handle to refresh favorites
                await panelManager.updateHandle();
                
                // Update the favorites panel data and refresh display
                if (panelManager.favoritesPanel) {
                    panelManager.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
                    
                    // Refresh the favorites panel display to show changes
                    if (panelManager.favoritesPanel.element) {
                        await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
                    }
                }
                
                // Update other panels' data without full re-render
                if (panelManager.inventoryPanel) {
                    panelManager.inventoryPanel.items = panelManager.inventoryPanel._getItems();
                    panelManager.inventoryPanel._updateHeartIcons();
                }
                if (panelManager.weaponsPanel) {
                    panelManager.weaponsPanel.weapons = panelManager.weaponsPanel._getWeapons();
                    panelManager.weaponsPanel._updateHeartIcons();
                }
                if (panelManager.spellsPanel) {
                    panelManager.spellsPanel.spells = panelManager.spellsPanel._getSpells();
                    panelManager.spellsPanel._updateHeartIcons();
                }
                if (panelManager.featuresPanel) {
                    panelManager.featuresPanel.features = panelManager.featuresPanel._getFeatures();
                    panelManager.featuresPanel._updateHeartIcons();
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
            const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
            if (isFromCompendium) {
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
                item.system.prepared === true
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
            
            // Also add these items to handle favorites for quick access
            await actor.setFlag(MODULE.ID, 'favoriteHandle', itemsToFavorite);
            

            
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
            icon: '<i class="fa-solid fa-angle-double-up"></i>',
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
            icon: '<i class="fa-solid fa-angle-up"></i>',
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
            icon: '<i class="fa-solid fa-angle-down"></i>',
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
            icon: '<i class="fa-solid fa-angle-double-down"></i>',
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
                // Skipping auto-favorites initialization for actor from compendium
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
            .map(item => {
                const isHandleFavorite = FavoritesPanel.isHandleFavorite(this.actor, item.id);
                return {
                    id: item.id,
                    name: item.name,
                    img: item.img || 'icons/svg/item-bag.svg',
                    type: item.type,
                    system: item.system,
                    equipped: item.system.equipped,
                    hasEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                    showEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                    showStarIcon: item.type === 'feat',
                    isHandleFavorite: isHandleFavorite
                };
            });
            
        return favoritedItems;
    }

    async render(html) {
        if (!html) return;
        
        // v13: Convert jQuery to native DOM if needed
        const nativeHtml = getNativeElement(html);
        // Store the element reference
        this.element = nativeHtml;
        
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
        // v13: Use native DOM querySelector
        const favoritesPanel = nativeHtml?.querySelector('[data-panel="favorites"]');
        if (!favoritesPanel) return;
        
        // Clean up old event listeners
        this._removeEventListeners(favoritesPanel);
        
        // Update HTML
        // v13: Use native DOM innerHTML instead of jQuery html()
        favoritesPanel.innerHTML = template;
        
        // Add equipped class and handle shield icon visibility for equipped items
        // v13: Use native DOM querySelectorAll instead of jQuery find().each()
        favoritesPanel.querySelectorAll('.favorite-item').forEach(item => {
            const itemId = item.dataset.itemId;
            const favoriteItem = this.favorites.find(f => f.id === itemId);
            
            if (favoriteItem) {
                // Handle equipped state
                if (favoriteItem.equipped) {
                    item.classList.add('equipped');
                }
                
                // Handle shield icon visibility and state
                const shieldIcon = item.querySelector('.fa-shield-alt');
                if (shieldIcon) {
                    if (favoriteItem.showEquipToggle) {
                        shieldIcon.style.display = '';
                        shieldIcon.classList.toggle('faded', !favoriteItem.equipped);
                    } else {
                        shieldIcon.style.display = 'none';
                    }
                }
            }
        });
        
        // Add new event listeners
        this._activateListeners(html);
        
        // Update visibility
        this._updateVisibility(html);
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        
        // v13: Native DOM doesn't support jQuery's .off() method
        // Event listeners will be removed when elements are cloned in _activateListeners
        // This method is kept for compatibility but does nothing in v13
        
        // Properly cleanup context menu
        // v13: Don't try to close the context menu during render - the DOM is about to be replaced
        // The old context menu will be garbage collected, and a new one will be created in _activateListeners
        if (this._contextMenu) {
            // Just nullify the reference - don't try to close it as the DOM is being replaced
            this._contextMenu = null;
        }
    }

    _updateVisibility(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.favorite-item').forEach((item) => {
            const itemId = item.dataset.itemId;
            const favoriteItem = this.favorites.find(f => f.id === itemId);
            
            if (!favoriteItem) return;

            let shouldShow = false;
            if (favoriteItem.type === 'spell' && this.showSpells) shouldShow = true;
            if (favoriteItem.type === 'weapon' && this.showWeapons) shouldShow = true;
            if (favoriteItem.type === 'feat' && this.showFeatures) shouldShow = true;
            if (['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(favoriteItem.type) && 
                this.showInventory && favoriteItem.type !== 'weapon') shouldShow = true;

            item.style.display = shouldShow ? '' : 'none';
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
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const panel = nativeHtml.querySelector('[data-panel="favorites"]');
        if (!panel) return;
        const favoritesList = panel.querySelector('.favorites-list');
        
        // Always create a fresh context menu
        try {
            this._contextMenu = new ContextMenu(favoritesList, '.favorite-item', this.menuOptions);
        } catch (error) {
            console.error('Error creating context menu:', error);
            // Fallback: use native context menu
            // v13: Use native DOM event delegation
            panel.addEventListener('contextmenu', (event) => {
                const favoriteItem = event.target.closest('.favorite-item');
                if (!favoriteItem) return;
                event.preventDefault();
                const itemId = favoriteItem.dataset.itemId;
                // For now, just log - we can implement a custom context menu later
            });
        }
        
        // Filter toggles
        // v13: Use nativeHtml instead of html, native DOM methods
        const spellToggle = nativeHtml.querySelector('.favorites-spell-toggle');
        if (spellToggle) {
            const newSpellToggle = spellToggle.cloneNode(true);
            spellToggle.parentNode?.replaceChild(newSpellToggle, spellToggle);
            newSpellToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('spells');
                event.currentTarget.classList.toggle('active', this.showSpells);
                event.currentTarget.classList.toggle('faded', !this.showSpells);
            });
        }

        const weaponToggle = nativeHtml.querySelector('.favorites-weapon-toggle');
        if (weaponToggle) {
            const newWeaponToggle = weaponToggle.cloneNode(true);
            weaponToggle.parentNode?.replaceChild(newWeaponToggle, weaponToggle);
            newWeaponToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('weapons');
                event.currentTarget.classList.toggle('active', this.showWeapons);
                event.currentTarget.classList.toggle('faded', !this.showWeapons);
            });
        }

        const featuresToggle = nativeHtml.querySelector('.favorites-features-toggle');
        if (featuresToggle) {
            const newFeaturesToggle = featuresToggle.cloneNode(true);
            featuresToggle.parentNode?.replaceChild(newFeaturesToggle, featuresToggle);
            newFeaturesToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('features');
                event.currentTarget.classList.toggle('active', this.showFeatures);
                event.currentTarget.classList.toggle('faded', !this.showFeatures);
            });
        }

        const inventoryToggle = nativeHtml.querySelector('.favorites-inventory-toggle');
        if (inventoryToggle) {
            const newInventoryToggle = inventoryToggle.cloneNode(true);
            inventoryToggle.parentNode?.replaceChild(newInventoryToggle, inventoryToggle);
            newInventoryToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('inventory');
                event.currentTarget.classList.toggle('active', this.showInventory);
                event.currentTarget.classList.toggle('faded', !this.showInventory);
            });
        }

        // Roll/Use item
        // v13: Use native DOM event delegation
        nativeHtml.querySelectorAll('.favorite-image-container').forEach(container => {
            const newContainer = container.cloneNode(true);
            container.parentNode?.replaceChild(newContainer, container);
            newContainer.addEventListener('click', async (event) => {
                if (event.target.classList.contains('favorite-roll-overlay')) {
                    const favoriteItem = event.currentTarget.closest('.favorite-item');
                    if (!favoriteItem) return;
                    const itemId = favoriteItem.dataset.itemId;
                    const item = this.actor.items.get(itemId);
                    if (item) {
                        await item.use({}, { event });
                    }
                }
            });
        });

        // View item details
        // v13: Use native DOM event delegation
        nativeHtml.querySelectorAll('.favorite-item .fa-feather').forEach(icon => {
            const newIcon = icon.cloneNode(true);
            icon.parentNode?.replaceChild(newIcon, icon);
            newIcon.addEventListener('click', async (event) => {
                const favoriteItem = event.currentTarget.closest('.favorite-item');
                if (!favoriteItem) return;
                const itemId = favoriteItem.dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (item) {
                    item.sheet.render(true);
                }
            });
        });

        // Toggle favorite
        // v13: Use native DOM event delegation on panel (from querySelector)
        panel.addEventListener('click', async (event) => {
            const heartButton = event.target.closest('.tray-buttons .fa-heart');
            if (!heartButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = event.currentTarget.closest('.favorite-item') || heartButton.closest('.favorite-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            if (!itemId) {
                return;
            }
            
            // Check current state before toggle
            const wasFavorite = FavoritesPanel.getPanelFavorites(this.actor).includes(itemId);
            
            const result = await FavoritesPanel.manageFavorite(this.actor, itemId);
            
            // Check state after toggle
            const isFavorite = FavoritesPanel.getPanelFavorites(this.actor).includes(itemId);
        });

        // Toggle prepared state (sun icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const sunButton = event.target.closest('.tray-buttons .fa-sun');
            if (!sunButton) return;
            
            const favoriteItem = sunButton.closest('.favorite-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                const newPrepared = !item.system.prepared;
                await item.update({
                    'system.prepared': newPrepared
                });
                // Update the UI immediately
                favoriteItem.classList.toggle('prepared', newPrepared);
                sunButton.classList.toggle('faded', !newPrepared);

                // Sync handle favorites and update the handle to reflect the new prepared state
                if (PanelManager.instance) {
                    // Update panel data without full re-renders
                    if (PanelManager.instance.spellsPanel) {
                        PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
                        PanelManager.instance.spellsPanel._updateHeartIcons();
                    }
                    // Handle favorites are now completely manual - no auto-syncing
                    await PanelManager.instance.updateHandle();
                }
            }
        });

        // Toggle equip state (shield icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const shieldButton = event.target.closest('.tray-buttons .fa-shield-alt');
            if (!shieldButton) return;
            
            const favoriteItem = shieldButton.closest('.favorite-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                favoriteItem.classList.toggle('equipped', newEquipped);
                shieldButton.classList.toggle('faded', !newEquipped);

                // Update the handle to reflect the new equipped state
                if (PanelManager.instance) {
                    // Update panel data without full re-renders
                    if (PanelManager.instance.inventoryPanel) {
                        PanelManager.instance.inventoryPanel.items = PanelManager.instance.inventoryPanel._getItems();
                        PanelManager.instance.inventoryPanel._updateHeartIcons();
                    }
                    if (PanelManager.instance.weaponsPanel) {
                        PanelManager.instance.weaponsPanel.weapons = PanelManager.instance.weaponsPanel._getWeapons();
                        PanelManager.instance.weaponsPanel._updateHeartIcons();
                    }
                    if (PanelManager.instance.spellsPanel) {
                        PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
                        PanelManager.instance.spellsPanel._updateHeartIcons();
                    }
                    if (PanelManager.instance.featuresPanel) {
                        PanelManager.instance.featuresPanel.features = PanelManager.instance.featuresPanel._getFeatures();
                        PanelManager.instance.featuresPanel._updateHeartIcons();
                    }
                }
                // Handle favorites are now completely manual - no auto-syncing
                await PanelManager.instance.updateHandle();
            }
        });

        // Toggle handle favorite
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const daggerButton = event.target.closest('.tray-buttons .fa-dagger');
            if (!daggerButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = daggerButton.closest('.favorite-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            if (!itemId) return;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            const current = FavoritesPanel.isHandleFavorite(this.actor, itemId);
            if (current) {
                await FavoritesPanel.removeHandleFavorite(this.actor, itemId);
            } else {
                await FavoritesPanel.addHandleFavorite(this.actor, itemId);
            }
            // Update the handle to reflect the change
            if (PanelManager.instance) {
                await PanelManager.instance.updateHandle();
            }
            
            // Refresh the favorites data to update isHandleFavorite properties
            this.favorites = this._getFavorites();
            
            // Update the visual state of the dagger icon immediately
            const newState = FavoritesPanel.isHandleFavorite(this.actor, itemId);
            daggerButton.classList.toggle('faded', !newState);
        });

        // Add clear all button listener
        // v13: Use nativeHtml instead of html
        const clearAllButton = nativeHtml.querySelector('.favorites-clear-all');
        if (clearAllButton) {
            const newClearAllButton = clearAllButton.cloneNode(true);
            clearAllButton.parentNode?.replaceChild(newClearAllButton, clearAllButton);
            newClearAllButton.addEventListener('click', async () => {
                await FavoritesPanel.clearFavorites(this.actor);
            });
        }
    }

    // _syncHandleFavorites method removed - handle favorites are now manual

    async _reorderFavorite(itemId, newIndex) {
        const actor = this.actor;
        if (!actor) {
            return;
        }

        // Check if actor is from a compendium
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return;
        }

        // Get the current panel favorites array
        const panelFavoriteIds = actor.getFlag(MODULE.ID, 'favoritePanel') || [];
        
        // Find the current index of the item ID
        const currentIndex = panelFavoriteIds.indexOf(itemId);
        if (currentIndex === -1) {
            return;
        }

        // Clamp the new index to valid range
        newIndex = Math.max(0, Math.min(newIndex, panelFavoriteIds.length - 1));
        
        // If no change, do nothing
        if (currentIndex === newIndex) {
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
            
            // Handle favorites are now completely manual - no auto-syncing needed
            
            // Update panels and handle
            if (PanelManager.instance) {
                // Update the handle
                await PanelManager.instance.updateHandle();
                
                // Update the favorites panel data and refresh display
                if (PanelManager.instance.favoritesPanel) {
                    PanelManager.instance.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
                    
                    // Refresh the favorites panel display to show the new order
                    if (PanelManager.instance.favoritesPanel.element) {
                        await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                    }
                }
                
                // Update other panels' data
                if (PanelManager.instance.inventoryPanel) {
                    PanelManager.instance.inventoryPanel.items = PanelManager.instance.inventoryPanel._getItems();
                    PanelManager.instance.inventoryPanel._updateHeartIcons();
                }
                if (PanelManager.instance.weaponsPanel) {
                    PanelManager.instance.weaponsPanel.weapons = PanelManager.instance.weaponsPanel._getWeapons();
                    PanelManager.instance.weaponsPanel._updateHeartIcons();
                }
                if (PanelManager.instance.spellsPanel) {
                    PanelManager.instance.spellsPanel.spells = PanelManager.instance.spellsPanel._getSpells();
                    PanelManager.instance.spellsPanel._updateHeartIcons();
                }
                if (PanelManager.instance.featuresPanel) {
                    PanelManager.instance.featuresPanel.features = PanelManager.instance.featuresPanel._getFeatures();
                    PanelManager.instance.featuresPanel._updateHeartIcons();
                }

            }

        } catch (error) {
            console.error('Error reordering favorites:', error);
        }
    }
} 
