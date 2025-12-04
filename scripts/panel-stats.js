import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate } from './helpers.js';

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

        // Apply saved collapsed state
        const panel = this.element.find('[data-panel="stats"]');
        const isCollapsed = game.settings.get(MODULE.ID, 'isStatsPanelCollapsed');
        if (isCollapsed) {
            const statsContent = panel.find('.stats-content');
            const toggle = panel.find('.stats-toggle');
            statsContent.addClass('collapsed');
            toggle.css('transform', 'rotate(-90deg)');
        }
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="stats"]');

        // Stats toggle
        panel.find('.tray-title-small').click(() => {
            const statsContent = panel.find('.stats-content');
            const toggle = panel.find('.stats-toggle');
            statsContent.toggleClass('collapsed');
            toggle.css('transform', statsContent.hasClass('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)');
            // Save collapsed state
            game.settings.set(MODULE.ID, 'isStatsPanelCollapsed', statsContent.hasClass('collapsed'));
        });
    }
} 