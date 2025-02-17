import { MODULE, TEMPLATES } from './const.js';

export class HealthPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-health",
            template: TEMPLATES.PANEL_HEALTH,
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
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isGM: game.user.isGM
        };

        const content = await renderTemplate(TEMPLATES.PANEL_HEALTH, templateData);
        this.element.find('[data-panel="health"]').html(content);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="health"]');

        // Health toggle
        panel.find('.tray-title-small').click(() => {
            const healthContent = panel.find('.health-content');
            const toggle = panel.find('.health-toggle');
            healthContent.toggleClass('collapsed');
            toggle.css('transform', healthContent.hasClass('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)');
        });

        // HP Controls for GM
        if (game.user.isGM) {
            panel.find('.hp-down').click(() => this._onHPChange(-1));
            panel.find('.hp-up').click(() => this._onHPChange(1));
            panel.find('.hp-full').click(() => this._onFullHeal());
            panel.find('.death-toggle').click(() => this._onDeathToggle());
        }
    }

    async _onHPChange(direction) {
        const amount = parseInt(this.element.find('.hp-amount').val()) || 1;
        const hp = this.actor.system.attributes.hp;
        const newValue = Math.clamped(hp.value + (amount * direction), 0, hp.max);
        await this.actor.update({'system.attributes.hp.value': newValue});
    }

    async _onFullHeal() {
        const hp = this.actor.system.attributes.hp;
        await this.actor.update({'system.attributes.hp.value': hp.max});
    }

    async _onDeathToggle() {
        const isDead = this.actor.effects.find(e => e.statuses.has('dead'));
        if (isDead) {
            await this.actor.deleteEmbeddedDocuments('ActiveEffect', [isDead.id]);
        } else {
            const effect = CONFIG.statusEffects.find(e => e.id === 'dead');
            if (effect) {
                await this.actor.createEmbeddedDocuments('ActiveEffect', [effect]);
            }
        }
    }
} 