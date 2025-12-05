import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, getNativeElement } from './helpers.js';

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
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (nativeElement) {
            const panel = nativeElement.querySelector('[data-panel="stats"]');
            if (panel) {
                panel.innerHTML = content;
            }
        }
        
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const nativeEl = getNativeElement(this.element);
        if (nativeEl) {
            const panel = nativeEl.querySelector('[data-panel="stats"]');
            if (panel) {
                const isCollapsed = game.settings.get(MODULE.ID, 'isStatsPanelCollapsed');
                if (isCollapsed) {
                    const statsContent = panel.querySelector('.stats-content');
                    const toggle = panel.querySelector('.stats-toggle');
                    if (statsContent) {
                        statsContent.classList.add('collapsed');
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

        const panel = nativeHtml.querySelector('[data-panel="stats"]');
        if (!panel) return;

        // Stats toggle
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            trayTitle.addEventListener('click', () => {
                const statsContent = panel.querySelector('.stats-content');
                const toggle = panel.querySelector('.stats-toggle');
                if (statsContent && toggle) {
                    statsContent.classList.toggle('collapsed');
                    toggle.style.transform = statsContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isStatsPanelCollapsed', statsContent.classList.contains('collapsed'));
                }
            });
        }
    }
} 