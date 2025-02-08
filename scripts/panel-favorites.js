import { MODULE, TEMPLATES } from './const.js';

export class FavoritesPanel {
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
        
        // Get our module's favorites from flags
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        
        // Get only favorited items
        return this.actor.items
            .filter(item => favorites.includes(item.id))
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system
            }));
    }

    async _toggleFavorite(itemId) {
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        const newFavorites = favorites.includes(itemId)
            ? favorites.filter(id => id !== itemId)
            : [...favorites, itemId];
            
        await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
        this.favorites = this._getFavorites();
        
        // Re-render all panels to update favorite status
        if (this.element) {
            await this.render(this.element);
        }
    }

    async render(html) {
        this.element = html;
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
            if ((item.type === 'weapon' || 
                (item.type === 'equipment' && item.system.weaponType)) && 
                this.showWeapons) shouldShow = true;
            if (['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type) && 
                this.showInventory && item.type !== 'weapon' && 
                !item.system.weaponType) shouldShow = true;

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
            await this._toggleFavorite(itemId);

            // Find the original item's heart icon in other panels and update it
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];

            if (panelManager) {
                // Update all panels
                const spellHeart = panelManager.element.find(`.spell-item[data-spell-id="${itemId}"] .fa-heart`);
                const weaponHeart = panelManager.element.find(`.weapon-item[data-weapon-id="${itemId}"] .fa-heart`);
                const inventoryHeart = panelManager.element.find(`.inventory-item[data-item-id="${itemId}"] .fa-heart`);
                
                [spellHeart, weaponHeart, inventoryHeart].forEach(heart => {
                    if (heart.length) heart.addClass('faded');
                });
            }
        });
    }
} 