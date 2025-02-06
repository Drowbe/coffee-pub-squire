import { MODULE, TEMPLATES } from './const.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = this._getWeapons();
    }

    _getWeapons() {
        if (!this.actor) return [];
        return this.actor.items.filter(item => 
            item.type === 'weapon' || 
            (item.type === 'equipment' && item.system.weaponType)
        );
    }

    async render(html) {
        const weaponData = {
            weapons: this.weapons.map(weapon => ({
                id: weapon.id,
                name: weapon.name,
                type: weapon.system.weaponType,
                damage: weapon.system.damage?.parts?.[0]?.[0] || '',
                damageType: weapon.system.damage?.parts?.[0]?.[1] || '',
                properties: weapon.system.properties || {},
                quantity: weapon.system.quantity,
                equipped: weapon.system.equipped
            }))
        };

        const template = await renderTemplate(TEMPLATES.PANEL_WEAPONS, weaponData);
        html.find('[data-panel="weapons"]').html(template);
        this._activateListeners(html);
    }

    _activateListeners(html) {
        // Weapon attacks
        html.find('.weapon-attack').click(async (event) => {
            const weaponId = event.currentTarget.dataset.weaponId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.roll();
            }
        });

        // Damage rolls
        html.find('.weapon-damage').click(async (event) => {
            const weaponId = event.currentTarget.dataset.weaponId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.rollDamage();
            }
        });

        // Toggle equip state
        html.find('.weapon-equip').click(async (event) => {
            const weaponId = event.currentTarget.dataset.weaponId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.update({
                    'system.equipped': !weapon.system.equipped
                });
            }
        });

        // Ammunition tracking
        html.find('.ammo-decrease').click(async (event) => {
            const weaponId = event.currentTarget.dataset.weaponId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon && weapon.system.quantity > 0) {
                await weapon.update({
                    'system.quantity': weapon.system.quantity - 1
                });
            }
        });
    }
} 