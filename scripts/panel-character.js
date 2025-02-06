import { MODULE, TEMPLATES } from './const.js';

export class CharacterPanel {
    constructor(actor) {
        this.actor = actor;
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const template = await renderTemplate(TEMPLATES.PANEL_CHARACTER, {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        });
        
        this.element.find('[data-panel="character"]').html(template);
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
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
                'system.attributes.hp.value': Math.clamped(
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
} 