import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, getNativeElement } from './helpers.js';

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
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (nativeElement) {
            const panel = nativeElement.querySelector('[data-panel="experience"]');
            if (panel) {
                panel.innerHTML = content;
            }
        }
        
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const nativeEl = getNativeElement(this.element);
        if (nativeEl) {
            const panel = nativeEl.querySelector('[data-panel="experience"]');
            if (panel) {
                const isCollapsed = game.settings.get(MODULE.ID, 'isExperiencePanelCollapsed');
                if (isCollapsed) {
                    const expContent = panel.querySelector('#exp-content');
                    const toggle = panel.querySelector('#exp-toggle');
                    if (expContent) {
                        expContent.classList.add('collapsed');
                    }
                    if (toggle) {
                        toggle.style.transform = 'rotate(-90deg)';
                    }
                }
            }
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // v13: Use native DOM instead of jQuery
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;

        const panel = nativeHtml.querySelector('[data-panel="experience"]');
        if (!panel) return;

        // Experience toggle
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            trayTitle.addEventListener('click', () => {
                const expContent = panel.querySelector('#exp-content');
                const toggle = panel.querySelector('#exp-toggle');
                if (expContent && toggle) {
                    expContent.classList.toggle('collapsed');
                    toggle.style.transform = expContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isExperiencePanelCollapsed', expContent.classList.contains('collapsed'));
                }
            });
        }
    }
} 