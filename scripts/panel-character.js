import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Register custom Handlebars helper for health percentage
Handlebars.registerHelper('healthOverlayHeight', function(hp) {
    if (!hp?.max) return '0%';
    const percentage = Math.round(100 - ((hp.value / hp.max) * 100));
    return `${percentage}%`;
});

export class CharacterPanel {
    constructor(actor) {
        this.actor = actor;
        
        // Bind the update method to this instance
        this._onActorUpdate = this._onActorUpdate.bind(this);
        
        // Note: Hooks are now managed centrally by HookManager
        // No need to register hooks here anymore
    }

    _onActorUpdate(document, change) {
        // Check if this update is for our actor and if HP changed
        if (document.id !== this.actor.id) return;
        if (!foundry.utils.hasProperty(change, "system.attributes.hp")) return;

        // Update the health overlay
        const hp = this.actor.system.attributes.hp;
        const percentage = Math.round(100 - ((hp.value / hp.max) * 100));
        const portraitElement = this.element?.find('.character-portrait');
        
        // Update health overlay height
        portraitElement?.find('.health-overlay').css('height', `${percentage}%`);
        
        // Update death skull
        if (hp.value <= 0) {
            if (!portraitElement?.find('.death-skull').length) {
                portraitElement?.append('<i class="fas fa-skull death-skull"></i>');
            }
        } else {
            portraitElement?.find('.death-skull').remove();
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const template = await renderTemplate(TEMPLATES.PANEL_CHARACTER, {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isGM: game.user.isGM,
        });
        
        this.element.find('[data-panel="character"]').html(template);
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        // Character sheet toggle
        html.find('.character-sheet-toggle').click(() => {
            this.actor.sheet.render(true);
        });

        // Print character button
        html.find('.print-character').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.actor) {
                const { PrintCharacterSheet } = await import('./utility-print-character.js');
                await PrintCharacterSheet.print(this.actor);
            }
        });

        // Share portrait
        html.find('.character-portrait').click(() => {
            const imagePopout = new ImagePopout(this.actor.img, {
                title: this.actor.name,
                shareable: true,
                uuid: this.actor.uuid
            });
            imagePopout.render(true);
        });

        // Note: Conditions button is handled by the handle manager, not the character panel

        // Refresh tray
        html.find('.tray-refresh').click(async (event) => {
            const $refreshIcon = $(event.currentTarget);
            if (PanelManager.instance && !$refreshIcon.hasClass('spinning')) {
                try {
                    $refreshIcon.addClass('spinning');
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    await PanelManager.initialize(this.actor);
                    // Force a re-render of all panels
                    if (PanelManager.instance) {
                        await PanelManager.instance.renderPanels(PanelManager.element);
                    }
                } catch (error) {
                    console.error('Error refreshing tray:', error);
                    ui.notifications.error("Failed to refresh tray");
                } finally {
                    $refreshIcon.removeClass('spinning');
                }
            }
        });

        // HP Controls
        html.find('.death-toggle').click(async () => {
            const isDead = this.actor.system.attributes.hp.value <= 0;
            await this.actor.update({
                'system.attributes.hp.value': isDead ? 1 : 0,
                'system.attributes.death.failure': isDead ? 0 : 3
            });
            await this._updateHPDisplay();
        });

        // Clear HP amount input on click
        html.find('.hp-amount').click(function() {
            $(this).val('');
        });

        html.find('.hp-up, .hp-down').click(async (event) => {
            const isIncrease = event.currentTarget.classList.contains('hp-up');
            const hp = this.actor.system.attributes.hp;
            const inputValue = parseInt(html.find('.hp-amount').val()) || 1;
            const change = isIncrease ? inputValue : -inputValue;
            
            await this.actor.update({
                'system.attributes.hp.value': Math.clamp(
                    hp.value + change,
                    0,
                    hp.max
                )
            });
            await this._updateHPDisplay();
        });

        html.find('.hp-full').click(async () => {
            const hp = this.actor.system.attributes.hp;
            await this.actor.update({
                'system.attributes.hp.value': hp.max
            });
            await this._updateHPDisplay();
        });

        // Ability Score Buttons
        html.find('.ability-btn').click(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilityTest(ability);
        });

        html.find('.ability-btn').contextmenu(async (event) => {
            event.preventDefault();
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilitySave(ability);
        });

        // Note: Print character button is handled by the panel manager, not the character panel
    }

    async _updateHPDisplay() {
        const hp = this.actor.system.attributes.hp;
        const hpBar = this.element.find('.hp-bar');
        const hpValue = hpBar.find('.hp-current .hp-value');
        const hpMax = hpBar.find('.hp-max .hp-value');
        const hpFill = hpBar.find('.hp-fill');
        
        if (hpValue.length && hpMax.length && hpFill.length) {
            hpValue.text(hp.value);
            hpMax.text(hp.max);
            const percentage = Math.clamped((hp.value / hp.max) * 100, 0, 100);
            hpFill.css('width', `${percentage}%`);
        }
    }

    destroy() {
        // Note: Hooks are now managed centrally by HookManager
        // No need to manually remove hooks here anymore
        this.element = null;
    }
} 