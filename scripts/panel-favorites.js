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
            await PanelManager.instance.updateTray();
        }
        return [];
    }

    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Log the stack trace to see where this is being called from
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | manageFavorite call stack",
                new Error().stack,
                false,
                true,
                false,
                MODULE.TITLE
            );

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
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Managing favorites - Before Update",
                { favorites, newFavorites, itemId, action: favorites.includes(itemId) ? 'remove' : 'add' },
                false,
                true,
                false,
                MODULE.TITLE
            );

            // Update the flag and wait for it to complete
            await actor.unsetFlag(MODULE.ID, 'favorites');
            await actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            
            // Verify the update
            const verifyFavorites = actor.getFlag(MODULE.ID, 'favorites') || [];
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Verifying favorites after update",
                { verifyFavorites, shouldMatch: newFavorites },
                false,
                true,
                false,
                MODULE.TITLE
            );

            // Get the PanelManager instance directly
            const panelManager = PanelManager.instance;
            if (panelManager) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Starting panel updates",
                    { itemId, action: favorites.includes(itemId) ? 'remove' : 'add' },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );

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

                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Panel updates complete",
                    { itemId, action: favorites.includes(itemId) ? 'remove' : 'add' },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
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
        
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Favorites from flag in _getFavorites",
            favorites,
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        // Get only favorited items
        const favoritedItems = this.actor.items
            .filter(item => favorites.includes(item.id))
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                equipped: item.system.equipped
            }));
            
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Mapped favorited items",
            favoritedItems,
            false,
            true,
            false,
            MODULE.TITLE
        );
        
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
        console.log('SQUIRE | Favorites Panel - Activating Listeners', {
            html: html ? 'exists' : 'missing',
            panelExists: html?.find('[data-panel="favorites"]').length > 0
        });

        if (!html) return;

        const panel = html.find('[data-panel="favorites"]');

        // Drag and drop events for items
        panel.find('.favorite-item')
            .on('dragstart', function(event) {
                const $item = $(this);
                $item.addClass('dragging');
                
                // Add class to tray to prevent showing drop area
                $('.squire-tray').addClass('reordering-favorites');
                
                const dragData = {
                    type: 'favorite-reorder',
                    itemId: $item.data('item-id')
                };
                
                console.log('SQUIRE | Drag started:', dragData);
                
                // Set drag data and effect
                event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                event.originalEvent.dataTransfer.effectAllowed = 'move';
                event.originalEvent.dataTransfer.dropEffect = 'move';
                
                // Set a custom drag image if needed
                const dragImage = $item[0].cloneNode(true);
                dragImage.style.opacity = '0.7';
                document.body.appendChild(dragImage);
                event.originalEvent.dataTransfer.setDragImage(dragImage, 0, 0);
                setTimeout(() => document.body.removeChild(dragImage), 0);
            })
            .on('dragend', function(event) {
                console.log('SQUIRE | Drag ended');
                $(this).removeClass('dragging');
                panel.find('.drag-over').removeClass('drag-over');
                $('.squire-tray').removeClass('reordering-favorites');
            })
            .on('dragenter', function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                const $target = $(this);
                const $dragging = panel.find('.favorite-item.dragging');
                
                if ($dragging.length && !$target.is($dragging)) {
                    console.log('SQUIRE | Drag entered:', $target.data('item-id'));
                    $target.addClass('drag-over');
                }
            })
            .on('dragover', function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                // Always set move effect during dragover
                event.originalEvent.dataTransfer.dropEffect = 'move';
                
                const $target = $(this);
                const $dragging = panel.find('.favorite-item.dragging');
                
                // Only show drop indicator if we're not dragging over the dragged item itself
                if ($dragging.length && !$target.is($dragging)) {
                    const targetRect = this.getBoundingClientRect();
                    const mouseY = event.originalEvent.clientY;
                    const threshold = targetRect.top + (targetRect.height / 2);
                    
                    // Remove drag-over class from all items except current target
                    panel.find('.drag-over').not($target).removeClass('drag-over');
                    $target.addClass('drag-over');
                    
                    console.log('SQUIRE | Dragging over:', {
                        itemId: $target.data('item-id'),
                        position: mouseY < threshold ? 'above' : 'below',
                        mouseY,
                        threshold
                    });
                }
            })
            .on('dragleave', function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                console.log('SQUIRE | Drag left:', $(this).data('item-id'));
                $(this).removeClass('drag-over');
            })
            .on('drop', async function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                const $target = $(this);
                console.log('SQUIRE | Drop on target:', $target.data('item-id'));
                
                try {
                    const dragData = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                    console.log('SQUIRE | Drop data:', dragData);
                    
                    if (dragData.type !== 'favorite-reorder') {
                        console.log('SQUIRE | Not a favorite reorder, ignoring drop');
                        return;
                    }
                    
                    const $items = panel.find('.favorite-item:visible');
                    const $draggedItem = $items.filter(`[data-item-id="${dragData.itemId}"]`);
                    
                    if (!$draggedItem.length) {
                        console.log('SQUIRE | Dragged item not found:', dragData.itemId);
                        return;
                    }
                    
                    const fromIndex = $items.index($draggedItem);
                    const toIndex = $items.index($target);
                    
                    console.log('SQUIRE | Reordering:', { fromIndex, toIndex });
                    
                    if (fromIndex === toIndex) {
                        console.log('SQUIRE | Same position, no reorder needed');
                        return;
                    }
                    
                    // Get current favorites and reorder
                    const currentFavorites = FavoritesPanel.getFavorites(this.actor);
                    const newFavorites = [...currentFavorites];
                    const [movedId] = newFavorites.splice(fromIndex, 1);
                    newFavorites.splice(toIndex, 0, movedId);
                    
                    console.log('SQUIRE | New favorites order:', newFavorites);
                    
                    // Save new order
                    await this.actor.unsetFlag(MODULE.ID, 'favorites');
                    await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
                    
                    // Re-render
                    await this.render(this.element);
                } catch (error) {
                    console.error('SQUIRE | Error during drop:', error);
                } finally {
                    // Clean up
                    $target.removeClass('drag-over');
                    panel.find('.drag-over').removeClass('drag-over');
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
            console.log('SQUIRE | Favorites Panel - Heart Click Handler Triggered');
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
                $item.toggleClass('prepared', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);

                // Update the handle to reflect the new equipped state
                if (PanelManager.instance) {
                    await PanelManager.instance.updateHandle();
                }
            }
        });

        // Add clear all button listener
        html.find('.favorites-clear-all').click(async () => {
            await FavoritesPanel.clearFavorites(this.actor);
        });
    }
} 