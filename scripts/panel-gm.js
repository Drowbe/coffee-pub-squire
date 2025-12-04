import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { getNativeElement, renderTemplate } from './helpers.js';

export class GmPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    async render(html, details = {}) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) return;

        const panel = this.element.querySelector('[data-panel="gm"]');
        if (!panel) return;

        const collapsed = !!game.settings.get(MODULE.ID, 'isGmPanelCollapsed');
        const templateData = {
            resistances: details.resistances ?? [],
            immunities: details.immunities ?? [],
            biographyHtmlRaw: details.biographyHtmlRaw ?? '',
            isCollapsed: collapsed
        };

        const content = await renderTemplate(TEMPLATES.PANEL_GM, templateData);
        // v13: Use native DOM innerHTML instead of jQuery html()
        panel.innerHTML = content;

        this._applyCollapsedState(panel, collapsed);
        this._activateListeners(panel);
    }

    _applyCollapsedState(panel, collapsed) {
        // v13: Use native DOM methods
        const content = panel.querySelector('.gmdetails-content');
        const toggle = panel.querySelector('.gmdetails-toggle');
        if (!content || !toggle) return;

        if (collapsed) {
            content.classList.add('collapsed');
            toggle.style.transform = 'rotate(-90deg)';
        } else {
            content.classList.remove('collapsed');
            toggle.style.transform = 'rotate(0deg)';
        }
    }

    _activateListeners(panel) {
        if (!panel) return;

        // v13: Use native DOM methods
        const title = panel.querySelector('.gmdetails-header');
        if (!title) return;

        // Clone to remove existing listeners
        const newTitle = title.cloneNode(true);
        title.parentNode?.replaceChild(newTitle, title);

        newTitle.addEventListener('click', async () => {
            const content = panel.querySelector('.gmdetails-content');
            const toggle = panel.querySelector('.gmdetails-toggle');
            if (!content || !toggle) return;

            const isCollapsed = !content.classList.contains('collapsed');
            if (isCollapsed) {
                content.classList.add('collapsed');
                toggle.style.transform = 'rotate(-90deg)';
            } else {
                content.classList.remove('collapsed');
                toggle.style.transform = 'rotate(0deg)';
            }
            await game.settings.set(MODULE.ID, 'isGmPanelCollapsed', isCollapsed);
        });
    }

    destroy() {
        // v13: Use native DOM methods
        const panel = this.element?.querySelector('[data-panel="gm"]');
        const header = panel?.querySelector('.gmdetails-header');
        if (header) {
            // Create a new element to remove listeners
            const newHeader = header.cloneNode(true);
            header.parentNode?.replaceChild(newHeader, header);
        }
        this.element = null;
    }
}

