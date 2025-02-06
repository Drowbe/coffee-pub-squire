import { MODULE, TEMPLATES } from './const.js';

export class FavoritesPanel {
    constructor(actor) {
        this.actor = actor;
        this.favorites = this._getFavorites();
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
                img: item.img || 'icons/svg/item-bag.svg'
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
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FAVORITES, favoritesData);
        html.find('[data-panel="favorites"]').html(template);
        this._activateListeners(html);
    }

    _activateListeners(html) {
        // Roll/Use item
        html.find('.favorite-image-container').click(async (event) => {
            if ($(event.target).hasClass('favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).closest('.favorite-item').data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use();
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
                // Update both spells and weapons panels
                const spellHeart = panelManager.element.find(`.spell-item[data-spell-id="${itemId}"] .fa-heart`);
                const weaponHeart = panelManager.element.find(`.weapon-item[data-weapon-id="${itemId}"] .fa-heart`);
                
                if (spellHeart.length) {
                    spellHeart.addClass('faded');
                }
                if (weaponHeart.length) {
                    weaponHeart.addClass('faded');
                }
            }
        });
    }
} 