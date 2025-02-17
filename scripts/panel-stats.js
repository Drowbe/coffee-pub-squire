import { MODULE, TEMPLATES } from './const.js';

export class StatsPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-stats",
            template: TEMPLATES.PANEL_STATS,
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

        const content = await renderTemplate(TEMPLATES.PANEL_STATS, templateData);
        this.element.find('[data-panel="stats"]').html(content);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="stats"]');

        // Stats toggle
        panel.find('.tray-title-small').click(() => {
            const statsContent = panel.find('.stats-content');
            const toggle = panel.find('.stats-toggle');
            statsContent.toggleClass('collapsed');
            toggle.css('transform', statsContent.hasClass('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)');
        });
    }
} 