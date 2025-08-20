import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = this._getWeapons();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedWeapons');
        // Don't set panelManager in constructor
    }

    _getWeapons() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get weapons
        const weapons = this.actor.items.filter(item => item.type === 'weapon');
        
        // Map weapons with favorite state and additional data
        const mappedWeapons = weapons.map(weapon => {
            const weaponType = this._getWeaponType(weapon);
            return {
                id: weapon.id,
                name: weapon.name,
                img: weapon.img || 'icons/svg/sword.svg',
                system: weapon.system,
                weaponType: weaponType,
                actionType: this._getActionType(weapon),
                isFavorite: FavoritesPanel.isHandleFavorite(this.actor, weapon.id),
                categoryId: `category-weapon-${weaponType}`
            };
        });

        // Group weapons by type and sort each group alphabetically
        const weaponsByType = {
            'simple-melee': mappedWeapons.filter(w => w.weaponType === 'simple-melee').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'martial-melee': mappedWeapons.filter(w => w.weaponType === 'martial-melee').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'simple-ranged': mappedWeapons.filter(w => w.weaponType === 'simple-ranged').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'martial-ranged': mappedWeapons.filter(w => w.weaponType === 'martial-ranged').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'natural': mappedWeapons.filter(w => w.weaponType === 'natural').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        };

        return {
            all: mappedWeapons,
            byType: weaponsByType
        };
    }

    _getWeaponType(weapon) {
        const weaponData = weapon.system;
        
        // Check for natural weapons first
        if (weaponData.type.value === 'natural') return 'natural';
        
        // Get the weapon type (martial or simple)
        const typeValue = weaponData.type.value || '';
        
        // Check if it's martial and if it's ranged based on type value
        const isMartial = typeValue.startsWith('martial');
        const isRanged = typeValue.endsWith('R'); // DND5E uses 'martialR' for ranged, 'martialM' for melee
        
        if (isMartial) {
            return isRanged ? 'martial-ranged' : 'martial-melee';
        } else {
            return isRanged ? 'simple-ranged' : 'simple-melee';
        }
    }

    _getActionType(weapon) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = weapon.system.activities;
        if (activities) {
            // Get the first activity (usually there's only one)
            const activity = Object.values(activities)[0];
            if (activity?.activation?.type) {
                switch (activity.activation.type) {
                    case 'action': return 'action';
                    case 'bonus': return 'bonus';
                    case 'reaction': return 'reaction';
                    case 'special': return 'special';
                    default: return null;
                }
            }
        }

        // Default to action for most weapons if no specific type is set
        return 'action';
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh weapons data
        this.weapons = this._getWeapons();

        const weaponData = {
            weapons: this.weapons.all,
            weaponsByType: this.weapons.byType,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped
        };

        const template = await renderTemplate(TEMPLATES.PANEL_WEAPONS, weaponData);
        const weaponsPanel = this.element.find('[data-panel="weapons"]');
        weaponsPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(weaponsPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.weapon-item');
        items.each((_, item) => {
            const $item = $(item);
            const weaponId = $item.data('weapon-id');
            const weapon = this.weapons.all.find(w => w.id === weaponId);
            
            if (!weapon) return;
            
            const categoryId = weapon.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const equippedMatch = !this.showOnlyEquipped || weapon.system.equipped;
            
            $item.toggle(!isCategoryHidden && equippedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        panel.off('.squireWeapons');
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="weapons"]');

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        panel.on('click.squireWeapons', '.weapons-category-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Add filter toggle handler
        panel.on('click.squireWeapons', '.weapon-filter-toggle', async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedWeapons', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
            this._updateVisibility(html);
        });

        // Weapon info click (feather icon)
        panel.on('click.squireWeapons', '.tray-buttons .fa-feather', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                weapon.sheet.render(true);
            }
        });

        // Toggle favorite
        panel.on('click.squireWeapons', '.tray-buttons .fa-heart', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            await FavoritesPanel.manageFavorite(this.actor, weaponId);
        });

        // Weapon use click (image overlay)
        panel.on('click.squireWeapons', '.weapon-image-container .weapon-roll-overlay', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.use({}, { event });
            }
        });

        // Toggle equip state (shield icon)
        panel.on('click.squireWeapons', '.tray-buttons .fa-shield-alt', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                const newEquipped = !weapon.system.equipped;
                await weapon.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.weapon-item');
                $item.toggleClass('prepared', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(html);
            }
        });
    }

    _toggleCategory(categoryId) {
        // Implementation of _toggleCategory method
    }

    _onWeaponRoll(event) {
        // Implementation of _onWeaponRoll method
    }

    _onToggleEquipped(event) {
        // Implementation of _onToggleEquipped method
    }

    _onToggleFavorite(event) {
        // Implementation of _onToggleFavorite method
    }

    _onShowDetails(event) {
        // Implementation of _onShowDetails method
    }
} 