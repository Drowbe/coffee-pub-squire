import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './panel-manager.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const templateData = {
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const content = await renderTemplate(TEMPLATES.PANEL_CONTROL, templateData);
        this.element.find('[data-panel="control"]').html(content);
        
        this._activateListeners(this.element);
        this._updateVisibility();
    }

    _updateVisibility() {
        ['favorites', 'weapons', 'spells', 'inventory'].forEach(panel => {
            const isVisible = game.settings.get(MODULE.ID, `show${panel.charAt(0).toUpperCase() + panel.slice(1)}Panel`);
            // Update icon state
            this.element.find(`[data-panel="control"] .control-toggle[data-toggle-panel="${panel}"]`)
                .toggleClass('active', isVisible)
                .toggleClass('faded', !isVisible);
            
            // Update panel visibility
            this.element.find(`.panel-containers.stacked .panel-container[data-panel="${panel}"]`)
                .toggleClass('visible', isVisible);
        });
    }

    async _togglePanel(panelType) {
        const settingKey = `show${panelType.charAt(0).toUpperCase() + panelType.slice(1)}Panel`;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        await game.settings.set(MODULE.ID, settingKey, !currentValue);
        this._updateVisibility();
        
        // Update all panels through the panel manager
        if (PanelManager.instance) {
            await PanelManager.instance.updateTray();
        }
    }

    _activateListeners(html) {
        html.find('[data-panel="control"] .control-toggle').click(async (event) => {
            const panelType = $(event.currentTarget).data('toggle-panel');
            await this._togglePanel(panelType);
        });
    }
} 