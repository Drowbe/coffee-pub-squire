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
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        return this.actor.items.filter(item => 
            item.type === 'weapon' || 
            (item.type === 'equipment' && item.system.weaponType)
        ).map(weapon => ({
            id: weapon.id,
            name: weapon.name,
            img: weapon.img || 'icons/svg/sword.svg',
            quantity: weapon.system.quantity || 1,
            equipped: weapon.system.equipped,
            isFavorite: favorites.includes(weapon.id)
        }));
    }

    async _toggleFavorite(itemId) {
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        const newFavorites = favorites.includes(itemId)
            ? favorites.filter(id => id !== itemId)
            : [...favorites, itemId];
            
        await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
        this.weapons = this._getWeapons();
        await this.render();
        
        // Re-render the favorites panel
        const favoritesPanel = Object.values(ui.windows).find(w => w instanceof FavoritesPanel && w.actor.id === this.actor.id);
        if (favoritesPanel) {
            await favoritesPanel.render();
        } else {
            // If we can't find the panel in ui.windows, try to get it from PanelManager
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];
            if (panelManager?.favoritesPanel) {
                await panelManager.favoritesPanel.render(panelManager.element);
            }
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
            
            const shouldShow = !this.showOnlyEquipped || weapon.equipped;
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