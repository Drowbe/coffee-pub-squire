import { MODULE, TEMPLATES } from './const.js';

export class AbilitiesPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-abilities",
            template: TEMPLATES.PANEL_ABILITIES,
            popOut: false,
        });
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const content = await renderTemplate(TEMPLATES.PANEL_ABILITIES, templateData);
        this.element.find('[data-panel="abilities"]').html(content);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="abilities"]');

        // Abilities toggle
        panel.find('.tray-title-small').click(() => {
            const abilitiesContent = panel.find('.abilities-content');
            const toggle = panel.find('.abilities-toggle');
            abilitiesContent.toggleClass('collapsed');
            toggle.css('transform', abilitiesContent.hasClass('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)');
        });

        // Ability check and save handlers
        panel.find('.ability-btn').click(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            if (event.type === 'click') {
                await this.actor.rollAbilityTest(ability);
            }
        });

        panel.find('.ability-btn').contextmenu(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilitySave(ability);
        });
    }
} 