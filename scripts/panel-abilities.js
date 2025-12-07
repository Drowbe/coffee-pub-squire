import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, getNativeElement } from './helpers.js';

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
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (nativeElement) {
            const panel = nativeElement.querySelector('[data-panel="abilities"]');
            if (panel) {
                panel.innerHTML = content;
            }
        }
        
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const nativeEl = getNativeElement(this.element);
        if (nativeEl) {
            const panel = nativeEl.querySelector('[data-panel="abilities"]');
            if (panel) {
                const isCollapsed = game.settings.get(MODULE.ID, 'isAbilitiesPanelCollapsed');
                if (isCollapsed) {
                    const abilitiesContent = panel.querySelector('#abilities-content');
                    const toggle = panel.querySelector('#abilities-toggle');
                    if (abilitiesContent) {
                        abilitiesContent.classList.add('collapsed');
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

        const panel = nativeHtml.querySelector('[data-panel="abilities"]');
        if (!panel) return;

        // Abilities toggle - clone to prevent duplicate listeners
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            const newTrayTitle = trayTitle.cloneNode(true);
            trayTitle.parentNode.replaceChild(newTrayTitle, trayTitle);
            newTrayTitle.addEventListener('click', () => {
                const abilitiesContent = panel.querySelector('#abilities-content');
                const toggle = panel.querySelector('#abilities-toggle');
                if (abilitiesContent && toggle) {
                    abilitiesContent.classList.toggle('collapsed');
                    toggle.style.transform = abilitiesContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isAbilitiesPanelCollapsed', abilitiesContent.classList.contains('collapsed'));
                }
            });
        }

        // Ability check and save handlers
        const abilityButtons = panel.querySelectorAll('.ability-btn');
        abilityButtons.forEach(button => {
            // Remove any existing listeners by cloning the button (clean slate)
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // Add click handler for ability check
            newButton.addEventListener('click', async (event) => {
                const abilityKey = event.currentTarget?.dataset?.ability;
                if (!abilityKey) {
                    ui.notifications?.warn('Invalid ability button.');
                    return;
                }
                // v13: D&D5e v5.2.2 API - rollAbilityCheck expects an object with 'ability' property
                try {
                    await this.actor.rollAbilityCheck({ ability: abilityKey });
                } catch (error) {
                    console.error('Error rolling ability check:', error);
                    ui.notifications?.error('Failed to roll ability check.');
                }
            });
            
            // Add contextmenu handler for ability save
            newButton.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                const abilityKey = event.currentTarget?.dataset?.ability;
                if (!abilityKey) {
                    ui.notifications?.warn('Invalid ability button.');
                    return;
                }
                // v13: D&D5e v5.2.2 API - rollSavingThrow expects an object with 'ability' property
                try {
                    await this.actor.rollSavingThrow({ ability: abilityKey });
                } catch (error) {
                    console.error('Error rolling ability save:', error);
                    ui.notifications?.error('Failed to roll ability save.');
                }
            });
        });
    }
} 