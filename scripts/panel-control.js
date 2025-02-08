import { MODULE } from './const.js';

export class ControlPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (!html) return;
        this.element = html;
        this._activateListeners(this.element);
        this._updateVisibility();
    }

    _updateVisibility() {
        const stacked = this.element.find('.panel-containers.stacked');
        ['favorites', 'weapons', 'spells', 'inventory'].forEach(panel => {
            const isVisible = game.settings.get(MODULE.ID, `show${panel.charAt(0).toUpperCase() + panel.slice(1)}Panel`);
            stacked.find(`[data-panel="${panel}"]`).toggle(isVisible);
            this.element.find(`[data-panel="control"] .control-toggle[data-panel="${panel}"]`)
                .toggleClass('active', isVisible)
                .toggleClass('faded', !isVisible);
        });
    }

    async _togglePanel(panelType) {
        const settingKey = `show${panelType.charAt(0).toUpperCase() + panelType.slice(1)}Panel`;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        await game.settings.set(MODULE.ID, settingKey, !currentValue);
        this._updateVisibility();
    }

    _activateListeners(html) {
        html.find('[data-panel="control"] .control-toggle').click(async (event) => {
            const panelType = $(event.currentTarget).data('panel');
            await this._togglePanel(panelType);
        });
    }
} 