import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = this._getWeapons();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedWeapons');
        this.panelManager = PanelManager.instance;
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
                isFavorite: favorites.includes(weapon.id),
                categoryId: `category-weapon-${weaponType}`
            };
        });

        // Group weapons by type
        const weaponsByType = {
            'simple-melee': mappedWeapons.filter(w => w.weaponType === 'simple-melee'),
            'martial-melee': mappedWeapons.filter(w => w.weaponType === 'martial-melee'),
            'simple-ranged': mappedWeapons.filter(w => w.weaponType === 'simple-ranged'),
            'martial-ranged': mappedWeapons.filter(w => w.weaponType === 'martial-ranged'),
            'natural': mappedWeapons.filter(w => w.weaponType === 'natural')
        };

        return {
            all: mappedWeapons,
            byType: weaponsByType
        };
    }

    _getWeaponType(weapon) {
        const weaponData = weapon.system;
        
        // Debug logging
        console.log("SQUIRE | Weapon Data Debug:", {
            name: weapon.name,
            weaponData: weaponData,
            type: weaponData.type,
            properties: weaponData.properties
        });
        
        // Check for natural weapons first
        if (weaponData.type.value === 'natural') return 'natural';
        
        // Get the weapon type (martial or simple)
        const typeValue = weaponData.type.value || '';
        
        // Check if it's martial and if it's ranged based on type value
        const isMartial = typeValue.startsWith('martial');
        const isRanged = typeValue.endsWith('R'); // DND5E uses 'martialR' for ranged, 'martialM' for melee
        
        // Debug logging for classification
        console.log("SQUIRE | Weapon Classification:", {
            name: weapon.name,
            typeValue: typeValue,
            isMartial: isMartial,
            isRanged: isRanged,
            finalCategory: isMartial ? (isRanged ? 'martial-ranged' : 'martial-melee') : (isRanged ? 'simple-ranged' : 'simple-melee')
        });
        
        if (isMartial) {
            return isRanged ? 'martial-ranged' : 'martial-melee';
        } else {
            return isRanged ? 'simple-ranged' : 'simple-melee';
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

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

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="weapons"]');

        // Category filter toggles
        panel.on('click', '.weapons-category-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Add filter toggle handler
        panel.on('click', '.weapon-filter-toggle', async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedWeapons', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
            this._updateVisibility(html);
        });

        // Weapon info click (feather icon)
        panel.on('click', '.tray-buttons .fa-feather', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                weapon.sheet.render(true);
            }
        });

        // Toggle favorite
        panel.on('click', '.tray-buttons .fa-heart', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            await FavoritesPanel.manageFavorite(this.actor, weaponId);
        });

        // Weapon use click (image overlay)
        panel.on('click', '.weapon-image-container .weapon-roll-overlay', async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.use({}, { event });
            }
        });

        // Toggle equip state (shield icon)
        panel.on('click', '.tray-buttons .fa-shield-alt', async (event) => {
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