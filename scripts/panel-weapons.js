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
        const isNatural = weaponData.weaponType === 'natural';
        if (isNatural) return 'natural';
        
        const isMartial = weaponData.weaponType === 'martial';
        const isRanged = weaponData.properties?.rng;
        
        if (isMartial) {
            return isRanged ? 'martial-ranged' : 'martial-melee';
        } else {
            return isRanged ? 'simple-ranged' : 'simple-melee';
        }
    }

    _handleSearch(searchTerm) {
        if (!this.element || !this.panelManager) return;
        this.panelManager.updateSearchVisibility(searchTerm, this.element[0], '.weapon-item');
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

        // Category filter toggles
        html.find('.weapons-category-filter').click((event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, html[0]);
        });

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

        // Toggle favorite
        html.find('.tray-buttons .fa-heart').click(async (event) => {
            const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
            await FavoritesPanel.manageFavorite(this.actor, weaponId);
        });

        // Weapon use click (image overlay)
        html.find('.weapon-image-container').click(async (event) => {
            if ($(event.target).hasClass('weapon-roll-overlay')) {
                const weaponId = $(event.currentTarget).closest('.weapon-item').data('weapon-id');
                const weapon = this.actor.items.get(weaponId);
                if (weapon) {
                    await weapon.use({}, { event });
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