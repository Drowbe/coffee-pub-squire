import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = this._getWeapons();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedWeapons');
    }

    _getWeapons() {
        if (!this.actor) return [];
        
        // Get current favorites and filter out null values
        const favorites = (this.actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null);
        
        // Get weapons
        const weapons = this.actor.items.filter(item => item.type === 'weapon');
        
        // Map weapons with favorite state
        return weapons.map(weapon => ({
            id: weapon.id,
            name: weapon.name,
            img: weapon.img || 'icons/svg/sword.svg',
            system: weapon.system,
            equipped: weapon.system.equipped,
            type: 'weapon',
            isFavorite: favorites.includes(weapon.id)
        }));
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all weapon items
        const weaponItems = this.element.find('.weapon-item');
        
        weaponItems.each((_, item) => {
            const $item = $(item);
            const weaponName = $item.find('.weapon-name').text().toLowerCase();
            
            if (searchTerm === '' || weaponName.includes(searchTerm)) {
                $item.show();
            } else {
                $item.hide();
            }
        });
    }

    async _toggleFavorite(itemId) {
        try {
            // Get current favorites
            const favorites = (this.actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null);
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Current favorites before toggle",
                favorites,
                true,
                true,
                false
            );
            
            const newFavorites = favorites.includes(itemId)
                ? favorites.filter(id => id !== itemId)
                : [...favorites, itemId];
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | New favorites after toggle",
                newFavorites,
                true,
                true,
                false
            );
            
            // Update the flag
            await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            
            // Update our local weapons data
            this.weapons = this._getWeapons();
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Updated weapons data",
                this.weapons,
                true,
                true,
                false
            );
            
            // Find the PanelManager instance
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];
            
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | PanelManager lookup",
                {
                    foundViaWindows: !!panelManager,
                    actorId: this.actor.id
                },
                true,
                true,
                false
            );

            // Update the heart icon state immediately
            const heartIcon = this.element.find(`.weapon-item[data-weapon-id="${itemId}"] .fa-heart`);
            if (heartIcon.length) {
                heartIcon.toggleClass('faded', !newFavorites.includes(itemId));
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Heart icon state updated",
                    {
                        itemId,
                        isFavorite: newFavorites.includes(itemId),
                        heartIconFound: true
                    },
                    true,
                    true,
                    false
                );
            } else {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Heart icon not found",
                    {
                        itemId,
                        isFavorite: newFavorites.includes(itemId),
                        heartIconFound: false
                    },
                    true,
                    true,
                    false
                );
            }

            // Re-render this panel
            if (this.element) {
                await this.render();
            }

            // Re-render the favorites panel through PanelManager
            if (panelManager?.favoritesPanel) {
                await panelManager.favoritesPanel.render(panelManager.element);
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Favorites panel re-rendered",
                    {
                        panelManagerFound: true,
                        favoritesPanelFound: true
                    },
                    true,
                    true,
                    false
                );
            } else {
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Could not re-render favorites panel",
                    {
                        panelManagerFound: !!panelManager,
                        favoritesPanelFound: false,
                        moduleFound: !!game.modules.get(MODULE.ID)
                    },
                    true,
                    true,
                    false
                );
            }

            // Force a full refresh of both panels to ensure sync
            if (panelManager) {
                await panelManager.updateTray();
            }

        } catch (error) {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            blacksmith?.utils.postConsoleAndNotification(
                "SQUIRE | Error in _toggleFavorite",
                error,
                true,
                true,
                true
            );
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;
        
        const weaponData = {
            weapons: this.weapons,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped
        };

        const template = await renderTemplate(TEMPLATES.PANEL_WEAPONS, weaponData);
        this.element.find('[data-panel="weapons"]').html(template);
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        html.find('.weapon-item').each((i, el) => {
            const $item = $(el);
            const weaponId = $item.data('weapon-id');
            const weapon = this.weapons.find(w => w.id === weaponId);
            
            if (!weapon) return;
            
            const shouldShow = !this.showOnlyEquipped || weapon.system.equipped;
            $item.toggle(shouldShow);
        });
    }

    _activateListeners(html) {
        // Add filter toggle handler
        html.find('.weapon-filter-toggle').click(async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedWeapons', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
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

        // Weapon info click (feather icon)
        html.find('.tray-buttons .fa-feather').click(async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                weapon.sheet.render(true);
            }
        });

        // Toggle favorite (heart icon)
        html.find('.tray-buttons .fa-heart').click(async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            await this._toggleFavorite(weaponId);
        });

        // Weapon roll click (image overlay)
        html.find('.weapon-image-container').click(async (event) => {
            // Only handle click if on the overlay
            if ($(event.target).hasClass('weapon-roll-overlay')) {
                const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
                const weapon = this.actor.items.get(weaponId);
                if (weapon) {
                    await weapon.use({}, { event, legacy: false });
                }
            }
        });

        // Toggle equip state (shield icon)
        html.find('.tray-buttons .fa-shield-alt').click(async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                const newEquipped = !weapon.system.equipped;
                await weapon.update({
                    'system.equipped': newEquipped
                });
                // Refresh weapons data
                this.weapons = this._getWeapons();
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.weapon-item');
                $item.toggleClass('prepared', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(html);
            }
        });
    }
} 