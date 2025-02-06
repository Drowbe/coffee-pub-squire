import { MODULE, TEMPLATES } from './const.js';

export class InfoPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (!this.actor) return;

        const infoData = {
            name: this.actor.name,
            hp: {
                value: this.actor.system.attributes.hp.value,
                max: this.actor.system.attributes.hp.max,
                temp: this.actor.system.attributes.hp.temp
            },
            ac: this.actor.system.attributes.ac.value,
            movement: this.actor.system.attributes.movement,
            abilities: this._getAbilityScores(),
            resources: this._getResources(),
            proficiencyBonus: this.actor.system.attributes.prof
        };

        const template = await renderTemplate(TEMPLATES.PANEL_INFO, infoData);
        html.find('[data-panel="info"]').html(template);
        this._activateListeners(html);
    }

    _getAbilityScores() {
        const abilities = this.actor.system.abilities;
        return Object.entries(abilities).map(([key, ability]) => ({
            key,
            label: game.i18n.localize(`DND5E.Ability${key.toUpperCase()}`),
            value: ability.value,
            mod: ability.mod,
            save: ability.save
        }));
    }

    _getResources() {
        const resources = this.actor.system.resources;
        return Object.entries(resources).map(([key, resource]) => ({
            key,
            label: game.i18n.localize(`DND5E.Resource${key.titleCase()}`),
            value: resource.value,
            max: resource.max
        }));
    }

    _activateListeners(html) {
        // Ability checks
        html.find('.ability-check').click(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilityTest(ability);
        });

        // Saving throws
        html.find('.ability-save').click(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilitySave(ability);
        });

        // Resource management
        html.find('.resource-adjust').click(async (event) => {
            const resource = event.currentTarget.dataset.resource;
            const change = parseInt(event.currentTarget.dataset.change);
            
            const resources = duplicate(this.actor.system.resources);
            const current = resources[resource];
            
            if (current) {
                current.value = Math.clamped(
                    current.value + change,
                    0,
                    current.max
                );
                await this.actor.update({ 'system.resources': resources });
            }
        });

        // HP management
        html.find('.hp-adjust').click(async (event) => {
            const change = parseInt(event.currentTarget.dataset.change);
            const hp = duplicate(this.actor.system.attributes.hp);
            
            hp.value = Math.clamped(
                hp.value + change,
                0,
                hp.max + (hp.temp || 0)
            );
            
            await this.actor.update({ 'system.attributes.hp': hp });
        });
    }
} 