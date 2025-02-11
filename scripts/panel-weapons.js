import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';
import { FavoritesPanel } from './panel-favorites.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = this._getWeapons();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedWeapons');
        this.hiddenCategories = new Set(); // Track which categories are hidden
    }

    _getWeapons() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get weapons
        const weapons = this.actor.items.filter(item => item.type === 'weapon');
        
        // Map weapons with favorite state and additional data
        const mappedWeapons = weapons.map(weapon => ({
            id: weapon.id,
            name: weapon.name,
            img: weapon.img || 'icons/svg/sword.svg',
            system: weapon.system,
            equipped: weapon.system.equipped,
            weaponType: this._getWeaponType(weapon),
            type: 'weapon',
            isFavorite: favorites.includes(weapon.id)
        }));

        // Group weapons by type
        const weaponsByType = {
            simpleM: mappedWeapons.filter(w => w.weaponType === 'simpleM'),
            martialM: mappedWeapons.filter(w => w.weaponType === 'martialM'),
            simpleR: mappedWeapons.filter(w => w.weaponType === 'simpleR'),
            martialR: mappedWeapons.filter(w => w.weaponType === 'martialR'),
            natural: mappedWeapons.filter(w => w.weaponType === 'natural')
        };

        return {
            all: mappedWeapons,
            byType: weaponsByType
        };
    }

    _getWeaponType(weapon) {
        // Get the base weapon type from the system data
        const weaponType = weapon.system.type?.value;
        
        // If it's explicitly marked as a natural weapon
        if (weaponType === 'natural') return 'natural';
        
        // Get the weapon properties
        const properties = weapon.system.properties || {};
        const isRanged = properties.amm || properties.fir || properties.thr; // ammunition, firearm, or thrown
        
        // Determine if it's simple or martial
        const baseType = weapon.system.baseItem; // This should give us the base weapon type
        const isSimple = baseType?.includes('simple') || weaponType?.includes('simple');
        const isMartial = baseType?.includes('martial') || weaponType?.includes('martial');
        
        // Categorize based on combination of simple/martial and melee/ranged
        if (isSimple) {
            return isRanged ? 'simpleR' : 'simpleM';
        } else if (isMartial) {
            return isRanged ? 'martialR' : 'martialM';
        }
        
        // If we can't determine the exact category but know it's ranged
        if (isRanged) return 'simpleR';
        
        // Default to simple melee if we can't determine the category
        return 'simpleM';
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all weapon items
        const weaponItems = this.element.find('.weapon-item');
        let visibleItems = 0;
        
        weaponItems.each((_, item) => {
            const $item = $(item);
            const weaponName = $item.find('.weapon-name').text().toLowerCase();
            const weaponId = $item.data('weapon-id');
            const weapon = this.weapons.all.find(w => w.id === weaponId);
            
            // Check if the weapon's category is hidden
            const isCategoryHidden = weapon && this.hiddenCategories.has(weapon.weaponType);
            const equippedMatch = !this.showOnlyEquipped || weapon.equipped;
            
            if (!isCategoryHidden && equippedMatch && (searchTerm === '' || weaponName.includes(searchTerm))) {
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
        
        // Refresh weapons data
        this.weapons = this._getWeapons();
        
        const weaponData = {
            weapons: this.weapons.all,
            weaponsByType: this.weapons.byType,
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
            const weapon = this.weapons.all.find(w => w.id === weaponId);
            
            if (!weapon) return;
            
            const isCategoryHidden = this.hiddenCategories.has(weapon.weaponType);
            const equippedMatch = !this.showOnlyEquipped || weapon.equipped;
            $item.toggle(!isCategoryHidden && equippedMatch);
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
            await FavoritesPanel.manageFavorite(this.actor, weaponId);
        });

        // Weapon roll click (image overlay)
        html.find('.weapon-image-container').click(async (event) => {
            // Only handle click if on the overlay
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