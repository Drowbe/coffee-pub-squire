import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class FeaturesPanel {
    constructor(actor) {
        this.actor = actor;
        this.features = this._getFeatures();
        // Don't set panelManager in constructor
    }

    _getFeatures() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
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
                            isFavorite: FavoritesPanel.isHandleFavorite(this.actor, feature.id),
            categoryId: `category-feature-${this._getFeatureType(feature)}`
        }));

        // Group features by type and sort each group alphabetically
        const featuresByType = {
            class: mappedFeatures.filter(f => f.featureType === 'class').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            subclass: mappedFeatures.filter(f => f.featureType === 'subclass').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            race: mappedFeatures.filter(f => f.featureType === 'race').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            background: mappedFeatures.filter(f => f.featureType === 'background').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            feat: mappedFeatures.filter(f => f.featureType === 'feat').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
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
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = feature.system.activities;
        if (!activities) return null;
        
        // Get the first activity (usually there's only one)
        const activity = Object.values(activities)[0];
        if (!activity?.activation?.type) return null;
        
        // Check the activation type
        const activationType = activity.activation.type;
        
        switch(activationType) {
            case 'action': return 'action';
            case 'bonus': return 'bonus';
            case 'reaction': return 'reaction';
            case 'special': return 'special';
            default: return null;
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh features data
        this.features = this._getFeatures();

        const featureData = {
            features: this.features.all,
            featuresByType: this.features.byType,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FEATURES, featureData);
        const featuresPanel = this.element.find('[data-panel="features"]');
        featuresPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(featuresPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.feature-item');
        items.each((_, item) => {
            const $item = $(item);
            const featureId = $item.data('feature-id');
            const feature = this.features.all.find(f => f.id === featureId);
            
            if (!feature) return;
            
            const categoryId = feature.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            
            $item.toggle(!isCategoryHidden);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        panel.off('.squireFeatures');
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="features"]');

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        panel.on('click.squireFeatures', '.features-category-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Feature info click (feather icon)
        panel.on('click.squireFeatures', '.tray-buttons .fa-feather', async (event) => {
            try {
                const featureId = $(event.currentTarget).closest('.feature-item').data('feature-id');
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
        panel.on('click.squireFeatures', '.tray-buttons .fa-heart', async (event) => {
            const featureId = $(event.currentTarget).closest('.feature-item').data('feature-id');
            await FavoritesPanel.manageFavorite(this.actor, featureId);
            // Re-render to update the UI state
            await this.render(this.element);
        });

        // Feature use click (image overlay)
        panel.on('click.squireFeatures', '.feature-image-container .feature-roll-overlay', async (event) => {
            const featureId = $(event.currentTarget).closest('.feature-item').data('feature-id');
            const feature = this.actor.items.get(featureId);
            if (feature) {
                await feature.use({}, { event });
            }
        });
    }
} 
