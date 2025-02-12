import { MODULE, TEMPLATES } from './const.js';

export class DiceTrayPanel {
    constructor(options = {}) {
        this.currentFormula = "";
        this.rollHistory = [];
        this.element = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-dicetray",
            template: TEMPLATES.PANEL_DICETRAY,
            popOut: false,
        });
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        const templateData = {
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };

        const content = await renderTemplate(TEMPLATES.PANEL_DICETRAY, templateData);
        this.element.find('[data-panel="dicetray"]').html(content);
        
        this._activateListeners(this.element);
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html.find('[data-panel="dicetray"]');

        // Dice icons
        panel.find('.squire-dice-icon').click(ev => this._onDieClick(ev));
        
        // Operator icons
        panel.find('.squire-operator-icon').click(ev => this._onOperatorClick(ev));
        
        // Roll button
        panel.find('.squire-roll-button').click(() => this._onRollClick());
        
        // Clear button
        panel.find('.squire-clear-button').click(() => {
            this.element.find('.squire-formula-input')[0].value = '';
            this.currentFormula = '';
        });
        
        // Formula input
        panel.find('.squire-formula-input').on('input', (ev) => {
            this.currentFormula = ev.target.value;
        });
    }

    _onDieClick(event) {
        const die = event.currentTarget.dataset.die;
        const input = this.element.find('.squire-formula-input')[0];
        
        // Get the current formula
        let formula = input.value;
        
        // If empty, start with 1 die
        if (!formula) {
            formula = `1${die}`;
        } else {
            // Check if we're adding to an existing die roll or starting a new one
            const lastDieMatch = formula.match(new RegExp(`(\\d+)${die}$`));
            if (lastDieMatch) {
                // Increment the number of dice
                const currentCount = parseInt(lastDieMatch[1]);
                formula = formula.replace(new RegExp(`${currentCount}${die}$`), `${currentCount + 1}${die}`);
            } else {
                // If the formula doesn't end with an operator, add a plus
                if (!formula.trim().match(/[\+\-\*\/]$/)) {
                    formula = formula.trim() + ' + ';
                }
                // Add the new die
                formula += `1${die}`;
            }
        }
        
        input.value = formula;
        this.currentFormula = formula;
    }

    _onOperatorClick(event) {
        const op = event.currentTarget.dataset.op;
        const input = this.element.find('.squire-formula-input')[0];
        
        // Add spaces around operators
        input.value += ` ${op} `;
        this.currentFormula = input.value;
    }

    async _onRollClick() {
        if (!this.currentFormula) return;

        try {
            // Clean up the formula
            let formula = this.currentFormula;
            
            // Remove any existing /r prefix
            formula = formula.replace(/^\/r\s*/, '');
            
            // Create and execute the roll
            const roll = await new Roll(formula).evaluate({async: true});
            
            // Display the roll in chat
            await roll.toMessage({
                speaker: ChatMessage.getSpeaker(),
                flavor: "Dice Tray Roll"
            });

            // Add to history
            this._addToHistory(formula, roll.total);

            // Clear the input
            this.element.find('.squire-formula-input')[0].value = '';
            this.currentFormula = '';

        } catch (err) {
            console.error("Dice roll error:", err);
            ui.notifications.error("Invalid dice formula");
        }
    }

    _addToHistory(formula, result) {
        const historyList = this.element.find('.history-list');
        const historyEntry = document.createElement('div');
        historyEntry.classList.add('history-entry');
        historyEntry.innerHTML = `${formula} = ${result}`;
        
        // Add to the top of the list
        historyList.prepend(historyEntry);
        
        // Keep only last 10 entries
        const entries = historyList.children();
        if (entries.length > 10) {
            entries.last().remove();
        }
    }
} 