import { MODULE, TEMPLATES } from './const.js';

export class ExperiencePanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-experience",
            template: TEMPLATES.PANEL_EXPERIENCE,
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

        const content = await renderTemplate(TEMPLATES.PANEL_EXPERIENCE, templateData);
        this.element.find('[data-panel="experience"]').html(content);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        if (!html) return;
    }
} 