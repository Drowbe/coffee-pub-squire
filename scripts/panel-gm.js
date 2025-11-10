import { MODULE, SQUIRE, TEMPLATES } from './const.js';

export class GmPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    async render(html, details = {}) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const panel = this.element.find('[data-panel="gm"]');
        if (!panel.length) return;

        const collapsed = !!game.settings.get(MODULE.ID, 'isGmPanelCollapsed');
        const templateData = {
            resistances: details.resistances ?? [],
            immunities: details.immunities ?? [],
            biographyHtmlRaw: details.biographyHtmlRaw ?? '',
            isCollapsed: collapsed
        };

        const content = await renderTemplate(TEMPLATES.PANEL_GM, templateData);
        panel.html(content);

        this._applyCollapsedState(panel, collapsed);
        this._activateListeners(panel);
    }

    _applyCollapsedState(panel, collapsed) {
        const content = panel.find('.gmdetails-content');
        const toggle = panel.find('.gmdetails-toggle');
        if (!content.length || !toggle.length) return;

        if (collapsed) {
            content.addClass('collapsed');
            toggle.css('transform', 'rotate(-90deg)');
        } else {
            content.removeClass('collapsed');
            toggle.css('transform', 'rotate(0deg)');
        }
    }

    _activateListeners(panel) {
        if (!panel?.length) return;

        const title = panel.find('.gmdetails-header');
        if (!title.length) return;

        title.off('click.squire-gm').on('click.squire-gm', async () => {
            const content = panel.find('.gmdetails-content');
            const toggle = panel.find('.gmdetails-toggle');
            if (!content.length || !toggle.length) return;

            const isCollapsed = !content.hasClass('collapsed');
            content.toggleClass('collapsed', isCollapsed);
            toggle.css('transform', isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)');
            await game.settings.set(MODULE.ID, 'isGmPanelCollapsed', isCollapsed);
        });
    }

    destroy() {
        const panel = this.element?.find('[data-panel="gm"]');
        panel?.find('.gmdetails-header')?.off('click.squire-gm');
        this.element = null;
    }
}

