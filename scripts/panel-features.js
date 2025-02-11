import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class FeaturesPanel {
    constructor(actor) {
        this.actor = actor;
        this.features = this._getFeatures();
        this.hiddenCategories = new Set(); // Track which categories are hidden
    }

    _getFeatures() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get features
        const features = this.actor.items.filter(item => item.type === 'feat');
        
        // Map features with favorite state and additional data
        const mappedFeatures = features.map(feature => ({
            id: feature.id,
            name: feature.name,
            img: feature.img || 'icons/svg/book.svg',
            system: feature.system,
            actionType: this._getActionType(feature),
            featureType: this._getFeatureType(feature),
            isFavorite: favorites.includes(feature.id)
        }));

        // Group features by type
        const featuresByType = {
            class: mappedFeatures.filter(f => f.featureType === 'class'),
            subclass: mappedFeatures.filter(f => f.featureType === 'subclass'),
            race: mappedFeatures.filter(f => f.featureType === 'race'),
            background: mappedFeatures.filter(f => f.featureType === 'background'),
            feat: mappedFeatures.filter(f => f.featureType === 'feat')
        };

        return {
            all: mappedFeatures,
            byType: featuresByType
        };
    }

    _getFeatureType(feature) {
        // Check if it's a class feature
        if (feature.system.type?.value === 'class') return 'class';
        
        // Check if it's a subclass feature
        if (feature.system.type?.value === 'subclass') return 'subclass';
        
        // Check if it's a racial trait
        if (feature.system.type?.value === 'race') return 'race';
        
        // Check if it's a background feature
        if (feature.system.type?.value === 'background') return 'background';
        
        // If it's a feat or we can't determine the type, default to feat
        return 'feat';
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
        
        // Get all feature items
        const featureItems = this.element.find('.weapon-item');
        let visibleItems = 0;
        
        featureItems.each((_, item) => {
            const $item = $(item);
            const featureName = $item.find('.weapon-name').text().toLowerCase();
            const featureId = $item.data('feature-id');
            const feature = this.features.all.find(f => f.id === featureId);
            
            // Check if the feature's category is hidden
            const isCategoryHidden = feature && this.hiddenCategories.has(feature.featureType);
            
            if (!isCategoryHidden && (searchTerm === '' || featureName.includes(searchTerm))) {
                $item.show();
                visibleItems++;
            } else {
                $item.hide();
            }
        });

        // Update headers visibility
        this.element.find('.level-header').each((_, header) => {
            const $header = $(header);
            const $nextItems = $header.nextUntil('.level-header', '.weapon-item:visible');
            $header.toggle($nextItems.length > 0);
        });

        // Show/hide no matches message
        this.element.find('.no-matches').toggle(visibleItems === 0 && searchTerm !== '');
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Refresh features data
        this.features = this._getFeatures();

        const featureData = {
            features: this.features.all,
            featuresByType: this.features.byType,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FEATURES, featureData);
        this.element.find('[data-panel="features"]').html(template);
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        html.find('.weapon-item').each((i, el) => {
            const $item = $(el);
            const featureId = $item.data('feature-id');
            const feature = this.features.all.find(f => f.id === featureId);
            
            if (!feature) return;
            
            const isCategoryHidden = this.hiddenCategories.has(feature.featureType);
            $item.toggle(!isCategoryHidden);
        });

        // Update headers visibility
        html.find('.level-header').each((_, header) => {
            const $header = $(header);
            const $nextItems = $header.nextUntil('.level-header', '.weapon-item:visible');
            $header.toggle($nextItems.length > 0);
        });
    }

    _activateListeners(html) {
        // Category filter toggles
        html.find('.category-filter').click((event) => {
            const $filter = $(event.currentTarget);
            const type = $filter.data('type');
            
            $filter.toggleClass('active');
            
            if ($filter.hasClass('active')) {
                this.hiddenCategories.delete(type);
            } else {
                this.hiddenCategories.add(type);
            }
            
            this._updateVisibility(html);
        });

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
            try {
                const featureId = $(event.currentTarget).closest('.weapon-item').data('feature-id');
                const feature = this.actor.items.get(featureId);
                if (!feature) {
                    console.error('Feature not found:', featureId);
                    return;
                }

                feature.sheet.render(true);
            } catch (error) {
                console.error('Error rendering feature sheet:', error);
                ui.notifications.error("Error displaying feature sheet.");
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