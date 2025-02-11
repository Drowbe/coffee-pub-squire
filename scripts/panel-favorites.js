import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';

export class FavoritesPanel {
    static getFavorites(actor) {
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

        // Remove from favorites
        html.find('.favorite-item .fa-heart').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
        });

        // Add clear all button listener
        html.find('.favorites-clear-all').click(async () => {
            await FavoritesPanel.clearFavorites(this.actor);
        });
    }
} 