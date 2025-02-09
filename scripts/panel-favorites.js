import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';

export class FavoritesPanel {
    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Ensure we have a valid itemId
            if (!itemId) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Invalid item ID in manageFavorite",
                    { itemId },
                    true,
                    true,
                    true
                );
                return;
            }

            // Get current favorites
            const favorites = (actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null && id !== undefined);
            const newFavorites = favorites.includes(itemId)
                ? favorites.filter(id => id !== itemId)
                : [...favorites, itemId];
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Managing favorites",
                { favorites, newFavorites, itemId, action: favorites.includes(itemId) ? 'remove' : 'add' },
                true,
                true,
                false
            );

            // Update the flag
            await actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            
            // Get the PanelManager instance directly and update all panels
            const panelManager = PanelManager.instance;
            if (panelManager) {
                await panelManager.updateTray();
            }

            return newFavorites.includes(itemId);
        } catch (error) {
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Error in manageFavorite",
                error,
                true,
                true,
                true
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
        this.showInventory = game.settings.get(MODULE.ID, 'showInventoryFavorites');
    }

    _getFavorites() {
        if (!this.actor) return [];
        
        // Get our module's favorites from flags and filter out null values
        const favorites = (this.actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null);
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Favorites from flag in _getFavorites",
            favorites,
            true,
            true,
            false
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
            true,
            true,
            false
        );
        
        return favoritedItems;
    }

    async _toggleFavorite(itemId) {
        await FavoritesPanel.manageFavorite(this.actor, itemId);
    }

    async render(html) {
        this.element = html;
        // Refresh favorites data before rendering
        this.favorites = this._getFavorites();
        
        const favoritesData = {
            favorites: this.favorites,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showSpells: this.showSpells,
            showWeapons: this.showWeapons,
            showInventory: this.showInventory
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FAVORITES, favoritesData);
        html.find('[data-panel="favorites"]').html(template);
        this._activateListeners(html);
        this._updateVisibility(html);
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
            case 'inventory':
                this.showInventory = !this.showInventory;
                await game.settings.set(MODULE.ID, 'showInventoryFavorites', this.showInventory);
                break;
        }
        this._updateVisibility(this.element);
    }

    _activateListeners(html) {
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

        // Remove from favorites
        html.find('.favorite-item .fa-heart').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            
            try {
                // Ensure we have a valid itemId
                if (!itemId) {
                    blacksmith?.utils.postConsoleAndNotification(
                        "SQUIRE | Invalid item ID in favorites heart click",
                        { itemId },
                        true,
                        true,
                        true
                    );
                    return;
                }

                // Get current favorites
                const favorites = (this.actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null && id !== undefined);
                const newFavorites = favorites.includes(itemId)
                    ? favorites.filter(id => id !== itemId)
                    : [...favorites, itemId];
                
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Favorites before update",
                    { favorites, newFavorites, itemId },
                    true,
                    true,
                    false
                );

                // Update the flag
                await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
                
                // Update our local favorites data
                this.favorites = this._getFavorites();
                
                // Get the PanelManager instance directly
                const panelManager = PanelManager.instance;
                
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | PanelManager lookup from favorites",
                    {
                        foundDirectly: !!panelManager,
                        actorId: this.actor.id,
                        currentActorId: PanelManager.currentActor?.id
                    },
                    true,
                    true,
                    false
                );

                // Re-render this panel
                if (this.element) {
                    await this.render(this.element);
                }

                // Force a full refresh of all panels to ensure sync
                if (panelManager) {
                    await panelManager.updateTray();
                }

            } catch (error) {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Error in favorites heart click",
                    error,
                    true,
                    true,
                    true
                );
            }
        });
    }
} 