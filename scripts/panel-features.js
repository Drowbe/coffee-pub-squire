import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate } from './helpers.js';

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
        if (!this.actor) return { all: [], byType: {} };
        
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
            isFavorite: favorites.includes(feature.id),
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
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
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
        // v13: Use native DOM querySelector
        const featuresPanel = this.element.querySelector('[data-panel="features"]');
        
        // Clean up old event listeners before updating HTML
        this._removeEventListeners(featuresPanel);
        
        // v13: Use native DOM innerHTML instead of jQuery html()
        featuresPanel.innerHTML = template;
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(featuresPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.feature-item').forEach((item) => {
            const featureId = item.dataset.featureId;
            const feature = this.features.all.find(f => f.id === featureId);
            
            if (!feature) return;
            
            const categoryId = feature.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            
            item.style.display = !isCategoryHidden ? '' : 'none';
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(nativeHtml);
        this.panelManager._updateEmptyMessage(nativeHtml);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        this.features.all.forEach(feature => {
            const heartIcon = nativeElement.querySelector(`[data-feature-id="${feature.id}"] .fa-heart`);
            if (heartIcon) {
                if (feature.isFavorite) {
                    heartIcon.classList.remove('faded');
                } else {
                    heartIcon.classList.add('faded');
                }
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        // v13: Native DOM doesn't support jQuery's .off() method
        // Event listeners will be removed when elements are cloned in _activateListeners
        // This method is kept for compatibility but does nothing in v13
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Use event delegation for all handlers
        const panel = nativeHtml.querySelector('[data-panel="features"]');
        if (!panel) return;

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        // v13: Use native DOM event delegation
        panel.addEventListener('click', (event) => {
            const filter = event.target.closest('.features-category-filter');
            if (!filter) return;
            const categoryId = filter.dataset.filterId;
            if (categoryId) {
                this.panelManager.toggleCategory(categoryId, panel);
            }
        });

        // Feature info click (feather icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            try {
                const featureItem = featherIcon.closest('.feature-item');
                if (!featureItem) return;
                const featureId = featureItem.dataset.featureId;
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
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const heartIcon = event.target.closest('.tray-buttons .fa-heart');
            if (!heartIcon) return;
            
            const featureItem = heartIcon.closest('.feature-item');
            if (!featureItem) return;
            const featureId = featureItem.dataset.featureId;
            await FavoritesPanel.manageFavorite(this.actor, featureId);
            // Refresh the panel data to update heart icon states
            this.features = this._getFeatures();
            this._updateHeartIcons();
        });

        // Feature use click (image overlay)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const rollOverlay = event.target.closest('.feature-image-container .feature-roll-overlay');
            if (!rollOverlay) return;
            
            const featureItem = rollOverlay.closest('.feature-item');
            if (!featureItem) return;
            const featureId = featureItem.dataset.featureId;
            const feature = this.actor.items.get(featureId);
            if (feature) {
                await feature.use({}, { event });
            }
        });
    }
} 
