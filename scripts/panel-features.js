import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class FeaturesPanel {
    constructor(actor) {
        this.actor = actor;
        this.features = this._getFeatures();
    }

    _getFeatures() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get features
        const features = this.actor.items.filter(item => item.type === 'feat');
        
        // Map features with favorite state and additional data
        return features.map(feature => ({
            id: feature.id,
            name: feature.name,
            img: feature.img || 'icons/svg/book.svg',
            system: feature.system,
            actionType: this._getActionType(feature),
            isFavorite: favorites.includes(feature.id)
        }));
    }

    _getActionType(feature) {
        const actionType = feature.system.activation?.type;
        if (!actionType) return null;
        
        switch(actionType) {
            case 'action': return 'action';
            case 'bonus': return 'bonus';
            case 'reaction': return 'reaction';
            case 'special': return 'special';
            default: return null;
        }
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all feature items using weapon classes
        const featureItems = this.element.find('.weapon-item[data-feature-id]');
        
        featureItems.each((_, item) => {
            const $item = $(item);
            const featureName = $item.find('.weapon-name').text().toLowerCase();
            
            if (searchTerm === '' || featureName.includes(searchTerm)) {
                $item.show();
            } else {
                $item.hide();
            }
        });
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Refresh features data
        this.features = this._getFeatures();

        const featureData = {
            features: this.features,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FEATURES, featureData);
        this.element.find('[data-panel="features"]').html(template);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        // Add search input listener
        html.find('.weapon-search').on('input', (event) => {
            this._handleSearch(event.target.value);
        });

        // Add search clear button listener
        html.find('.search-clear').click((event) => {
            const $search = $(event.currentTarget).siblings('.weapon-search');
            $search.val('').trigger('input');
        });

        // Feature info click (feather icon)
        html.find('.tray-buttons .fa-feather').click(async (event) => {
            const featureId = $(event.currentTarget).closest('.weapon-item').data('feature-id');
            const feature = this.actor.items.get(featureId);
            if (feature) {
                feature.sheet.render(true);
            }
        });

        // Toggle favorite
        html.find('.tray-buttons .fa-heart').click(async (event) => {
            const featureId = $(event.currentTarget).closest('.weapon-item').data('feature-id');
            await FavoritesPanel.manageFavorite(this.actor, featureId);
        });

        // Feature use click (image overlay)
        html.find('.weapon-image-container').click(async (event) => {
            if ($(event.target).hasClass('weapon-roll-overlay')) {
                const featureId = $(event.currentTarget).closest('.weapon-item').data('feature-id');
                const feature = this.actor.items.get(featureId);
                if (feature) {
                    await feature.use({}, { event });
                }
            }
        });
    }
} 