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
        
        // Register hooks for HP updates
        Hooks.on('updateActor', this._onActorUpdate);
        Hooks.on('updateToken', this._onActorUpdate);
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

        // Share portrait
        html.find('.character-portrait').click(() => {
            const imagePopout = new ImagePopout(this.actor.img, {
                title: this.actor.name,
                shareable: true,
                uuid: this.actor.uuid
            });
            imagePopout.render(true);
        });

        // Add effect icon click handler
        html.find('#conditions-button').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can add effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can add effects.");
                return;
            }

            // Get all available conditions from CONFIG.DND5E.conditionTypes
            const conditions = Object.entries(CONFIG.DND5E.conditionTypes).map(([id, condition]) => ({
                id,
                name: condition.label,
                icon: condition.icon,
                isActive: this.actor.effects.some(e => e.name === condition.label)
            }));

            // Create a dialog with condition options
            const content = `
                <div class="squire-description-window">
                    <div class="squire-description-header">
                        <i class="fas fa-sparkles"></i>
                        <h1>Add Condition</h1>
                    </div>
                    
                    <div class="squire-description-content">
                        <div class="effect-grid">
                            ${conditions.map(condition => `
                                <div class="effect-option ${condition.isActive ? 'active' : ''}" data-condition-id="${condition.id}">
                                    <img src="${condition.icon}" title="${condition.name}"/>
                                    <div class="effect-name">${condition.name}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <style>
                    .squire-description-window .effect-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                        gap: 10px;
                        padding: 10px;
                        margin-top: 10px;
                    }
                    .squire-description-window .effect-option {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 5px;
                        background: rgba(255, 255, 255, 0.1);
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                        position: relative;
                    }
                    .squire-description-window .effect-option:hover {
                        background: rgba(255, 255, 255, 0.2);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option.active {
                        background: rgba(var(--color-shadow-primary), 0.5);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight) inset;
                    }
                    .squire-description-window .effect-option.active:hover {
                        background: rgba(var(--color-shadow-primary), 0.7);
                    }
                    .squire-description-window .effect-option.active::after {
                        content: '✓';
                        position: absolute;
                        top: -5px;
                        right: -5px;
                        background: var(--color-shadow-primary);
                        color: var(--color-text-light-highlight);
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        border: 1px solid var(--color-border-highlight);
                        box-shadow: 0 0 5px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option img {
                        width: 40px;
                        height: 40px;
                        object-fit: contain;
                        border: none;
                        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
                    }
                    .squire-description-window .effect-option .effect-name {
                        text-align: center;
                        font-size: 12px;
                        margin-top: 5px;
                        color: var(--color-text-light-highlight);
                        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
                    }
                </style>
            `;

            const dialog = new Dialog({
                title: "Add Effect",
                content: content,
                buttons: {
                    close: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Close"
                    }
                },
                render: (html) => {
                    html.find('.effect-option').click(async (e) => {
                        const conditionId = e.currentTarget.dataset.conditionId;
                        const condition = CONFIG.DND5E.conditionTypes[conditionId];
                        const isActive = $(e.currentTarget).hasClass('active');
                        
                        try {
                            if (isActive) {
                                // Remove the effect
                                const effect = this.actor.effects.find(e => e.name === condition.label);
                                if (effect) {
                                    await effect.delete();
                                    $(e.currentTarget).removeClass('active');
                                    ui.notifications.info(`Removed ${condition.label} from ${this.actor.name}`);
                                }
                            } else {
                                // Add the effect
                                await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                                    name: condition.label,
                                    icon: condition.icon,
                                    origin: this.actor.uuid,
                                    disabled: false
                                }]);
                                $(e.currentTarget).addClass('active');
                                ui.notifications.info(`Added ${condition.label} to ${this.actor.name}`);
                            }
                        } catch (error) {
                            console.error('Error managing condition:', error);
                            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${condition.label}`);
                        }
                    });
                }
            });
            dialog.render(true);
        });

        // Refresh tray
        html.find('.tray-refresh').click(async (event) => {
            const $refreshIcon = $(event.currentTarget);
            if (PanelManager.instance && !$refreshIcon.hasClass('spinning')) {
                try {
                    $refreshIcon.addClass('spinning');
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    // Debug: Starting tray refresh
                    await PanelManager.initialize(this.actor);
                    // Force a re-render of all panels
                    if (PanelManager.instance) {
                        await PanelManager.instance.renderPanels(PanelManager.element);
                    }
                    // Debug: Tray refresh completed
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

        // Print character sheet
        html.find('.print-character').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const { PrintCharacterSheet } = await import('./utility-print-character.js');
            await PrintCharacterSheet.print(this.actor);
        });
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
        // Remove hooks when panel is destroyed
        Hooks.off('updateActor', this._onActorUpdate);
        Hooks.off('updateToken', this._onActorUpdate);
    }
} 