import { MODULE, TEMPLATES } from './const.js';
import { DiceTrayWindow } from './window-dicetray.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class DiceTrayPanel {
    static isWindowOpen = false;
    static activeWindow = null;

    constructor(options = {}) {
        this.currentFormula = "";
        this.rollHistory = [];
        this.element = null;
        this.actor = options.actor || null;
        // Check if there's an active window and restore state
        this.window = DiceTrayPanel.activeWindow;
        this.isPoppedOut = DiceTrayPanel.isWindowOpen;

        // Only register for actor updates if we have an actor
        if (this.actor) {
            this.actor.apps[this.id] = this;
        }
    }

    get id() {
        return `squire-dicetray-${this.actor?.id || 'no-actor'}`;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-dicetray",
            template: TEMPLATES.PANEL_DICETRAY,
            popOut: false,
        });
    }

    async render(html) {
        // Always render into the panel container inside the placeholder if not popped out
        if (!this.isPoppedOut) {
            const placeholder = $('#dicetray-panel-placeholder');
            let container = placeholder.find('.panel-container[data-panel="dicetray"]');
            if (!container.length) {
                // Create the panel container if it doesn't exist
                container = $('<div class="panel-container" data-panel="dicetray"></div>');
                placeholder.append(container);
            }
            this.element = container;
        } else if (html) {
            this.element = html;
        }
        if (!this.element || this.isPoppedOut) {
            return;
        }

        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isDiceTrayPopped: this.isPoppedOut
        };

        // If popped out, only update the window content and don't render in tray
        if (this.isPoppedOut) {
            if (this.window?.element) {
                const content = await renderTemplate(TEMPLATES.PANEL_DICETRAY, templateData);
                this.window.element.find('.window-content').html(content);
                this._activateListeners(this.window.element);
            }
            return; // Don't render in tray if popped out
        }

        // Only render in tray if not popped out
        const content = await renderTemplate(TEMPLATES.PANEL_DICETRAY, templateData);
        this.element.html(content);
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element;
        const isCollapsed = game.settings.get(MODULE.ID, 'isDiceTrayPanelCollapsed');
        if (isCollapsed) {
            const dicetrayContent = panel.find('.dicetray-content');
            const toggle = panel.find('.dicetray-toggle');
            dicetrayContent.addClass('collapsed');
            toggle.css('transform', 'rotate(-90deg)');
        }
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html;

        // Add dice tray toggle handler
        panel.find('.tray-title-small').click(() => {
            const dicetrayContent = panel.find('.dicetray-content');
            const toggle = panel.find('.dicetray-toggle');
            dicetrayContent.toggleClass('collapsed');
            toggle.css('transform', dicetrayContent.hasClass('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)');
            // Save collapsed state
            game.settings.set(MODULE.ID, 'isDiceTrayPanelCollapsed', dicetrayContent.hasClass('collapsed'));
        });

        // Add pop-out button handler
        panel.find('.pop-out-button').click(() => this._onPopOut());

        // Dice icons with right-click support
        panel.find('.squire-dice-icon').on('click contextmenu', ev => {
            ev.preventDefault();
            this._onDieClick(ev, panel);
        });
        
        // Operator icons
        panel.find('.squire-operator-icon').click(ev => this._onOperatorClick(ev, panel));
        
        // Modifier icons with right-click support
        panel.find('.squire-modifier-icon').on('click contextmenu', ev => {
            ev.preventDefault();
            this._onModifierClick(ev, panel);
        });
        
        // Roll button
        panel.find('.squire-roll-button').click((ev) => {
            const button = ev.currentTarget;
            if (button.classList.contains('advantage')) {
                this._onAdvantageClick(true, panel);
            } else if (button.classList.contains('disadvantage')) {
                this._onAdvantageClick(false, panel);
            } else {
                this._onRollClick(panel);
            }
        });
        
        // Clear button
        panel.find('.squire-clear-button').click(() => {
            panel.find('.squire-formula-input')[0].value = '';
            this.currentFormula = '';
        });
        
        // Formula input
        panel.find('.squire-formula-input').on('input', (ev) => {
            this.currentFormula = ev.target.value;
        });

        // History toggle
        panel.find('.history-header').click(() => {
            const historyList = panel.find('.squire-history-list');
            const toggle = panel.find('.history-toggle');
            historyList.toggleClass('collapsed');
            toggle.css('transform', historyList.hasClass('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)');
        });

        // Clear history button
        panel.find('.history-clear').click((ev) => {
            ev.stopPropagation(); // Prevent triggering the collapse/expand
            const historyList = panel.find('.squire-history-list');
            historyList.empty();
            
            // Add the "No recent rolls" message
            historyList.html('<div class="history-entry empty-message">No recent rolls</div>');

            // If we're in a window, trigger a resize
            if (this.isPoppedOut && this.window) {
                this.window.setPosition({height: "auto"});
            }
        });
    }

    _onDieClick(event, panel) {
        const die = event.currentTarget.dataset.die;
        const input = panel.find('.squire-formula-input')[0];
        const isRightClick = event.type === 'contextmenu';
        
        // Get the current formula
        let formula = input.value;
        
        // Extract any existing bonus/penalty from the end
        const bonusMatch = formula.match(/\s*([\+\-]\d+)$/);
        const bonus = bonusMatch ? ` ${bonusMatch[1]}` : '';
        const cleanFormula = bonusMatch ? formula.slice(0, -bonusMatch[0].length) : formula;
        
        // If empty and not right click, start with 1 die
        if (!cleanFormula && !isRightClick) {
            formula = `1${die}${bonus}`;
        } else if (cleanFormula) {
            // Check if we're modifying an existing die roll or starting a new one
            const lastDieMatch = cleanFormula.match(new RegExp(`(\\d+)${die}$`));
            if (lastDieMatch) {
                // Get current count
                const currentCount = parseInt(lastDieMatch[1]);
                if (isRightClick) {
                    // Decrease dice count, remove if reaching 0
                    if (currentCount <= 1) {
                        // If it's the only term, clear the formula
                        if (cleanFormula.trim() === `1${die}`) {
                            formula = '';
                        } else {
                            // Remove the die and any preceding operator
                            formula = cleanFormula.replace(new RegExp(`\\s*[+\\-*\\/]?\\s*${currentCount}${die}$`), '') + bonus;
                        }
                    } else {
                        formula = cleanFormula.replace(new RegExp(`${currentCount}${die}$`), `${currentCount - 1}${die}`) + bonus;
                    }
                } else {
                    // Increment the number of dice
                    formula = cleanFormula.replace(new RegExp(`${currentCount}${die}$`), `${currentCount + 1}${die}`) + bonus;
                }
            } else if (!isRightClick) {
                // Check if the formula ends with an operator
                const endsWithOperator = cleanFormula.trim().match(/[\+\-\*\/]\s*$/);
                
                // Only add a plus if there's no operator at the end
                if (!endsWithOperator) {
                    formula = cleanFormula.trim() + ' + ' + `1${die}${bonus}`;
                } else {
                    // If there is an operator, just add the die
                    formula = cleanFormula + `1${die}${bonus}`;
                }
            }
        }
        
        input.value = formula;
        this.currentFormula = formula;
    }

    _onOperatorClick(event, panel) {
        const op = event.currentTarget.dataset.op;
        const input = panel.find('.squire-formula-input')[0];
        
        // Add spaces around operators
        input.value += ` ${op} `;
        this.currentFormula = input.value;
    }

    _onModifierClick(event, panel) {
        const mod = event.currentTarget.dataset.mod;
        const input = panel.find('.squire-formula-input')[0];
        const isRightClick = event.type === 'contextmenu';
        
        // Get the current formula
        let formula = input.value;
        
        // If empty, do nothing
        if (!formula) return;
        
        // Handle bonus and penalty differently as they affect the whole roll
        if (mod === 'bonus' || mod === 'penalty') {
            // Remove any existing bonus/penalty first
            const cleanFormula = formula.replace(/\s*[\+\-]\d+$/, '');
            const operator = mod === 'bonus' ? '\\+' : '\\-';
            const bonusRegex = new RegExp(` ${operator}(\\d+)$`);
            const bonusMatch = formula.match(bonusRegex);
            
            if (bonusMatch) {
                const currentNum = parseInt(bonusMatch[1]);
                if (isRightClick) {
                    // Decrease the bonus/penalty
                    if (currentNum <= 1) {
                        formula = cleanFormula; // Remove if reaching 0
                    } else {
                        formula = cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}${currentNum - 1}`;
                    }
                } else {
                    // Increase the bonus/penalty
                    formula = cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}${currentNum + 1}`;
                }
            } else if (!isRightClick) {
                // Add new bonus/penalty
                formula = cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}1`;
            }
            
            input.value = formula;
            this.currentFormula = formula;
            return;
        }
        
        // Extract any existing bonus/penalty from the end before modifying dice
        const bonusMatch = formula.match(/\s*([\+\-]\d+)$/);
        const bonus = bonusMatch ? bonusMatch[1] : '';
        const cleanFormula = bonusMatch ? formula.slice(0, -bonusMatch[0].length) : formula;
        
        // Find the last dice term for other modifiers
        // This pattern will match a dice term that might already have kh/kl modifiers
        const lastDiceTerm = cleanFormula.match(/\d*d\d+(?:kh\d+|kl\d+)?(?=[^\d]*(?:\+|-|\*|$))/g);
        
        if (lastDiceTerm) {
            // Get the last dice term (in case there are multiple)
            const currentTerm = lastDiceTerm[lastDiceTerm.length - 1];
            // Get the base dice without any existing modifiers
            const baseDice = currentTerm.match(/\d*d\d+/)[0];
            
            // Handle keep highest/lowest incrementing/decrementing
            if (mod === 'kh' || mod === 'kl') {
                const currentModRegex = new RegExp(`${baseDice}(${mod}\\d+)?`);
                const currentModMatch = currentTerm.match(currentModRegex);
                
                if (currentModMatch && currentModMatch[1]) {
                    // There's an existing modifier
                    const currentNum = parseInt(currentModMatch[1].substring(2));
                    if (isRightClick) {
                        // Decrease the number or remove if reaching 0
                        if (currentNum <= 1) {
                            formula = cleanFormula.replace(currentTerm, baseDice) + (bonus || '');
                        } else {
                            formula = cleanFormula.replace(currentTerm, `${baseDice}${mod}${currentNum - 1}`) + (bonus || '');
                        }
                    } else {
                        // Increase the number
                        formula = cleanFormula.replace(currentTerm, `${baseDice}${mod}${currentNum + 1}`) + (bonus || '');
                    }
                } else if (!isRightClick) {
                    // Start with 1 if no number exists
                    formula = cleanFormula.replace(currentTerm, `${baseDice}${mod}1`) + (bonus || '');
                }
            }
            
            input.value = formula;
            this.currentFormula = formula;
        }
    }

    async _onRollClick(panel) {
        if (!this.currentFormula) return;

        try {
            // Clean up the formula
            let formula = this.currentFormula;
            let displayFormula = this.currentFormula;
            
            // Remove any existing /r prefix
            formula = formula.replace(/^\/r\s*/, '');
            displayFormula = displayFormula.replace(/^\/r\s*/, '');
            
            // Create and execute the roll
            const roll = new Roll(formula);
            await roll.evaluate();
            
            // Format the display formula to be more readable
            displayFormula = displayFormula
                // Add spaces around operators if they're missing
                .replace(/([+\-*/])/g, ' $1 ')
                // Remove extra spaces
                .replace(/\s+/g, ' ')
                .trim();
            
            // Add "Bonus" label to the display if there's a bonus/penalty
            const bonusMatch = displayFormula.match(/\s*([\+\-]\d+)$/);
            if (bonusMatch) {
                displayFormula = displayFormula.slice(0, -bonusMatch[0].length) + 
                    ` ${bonusMatch[1]} Bonus`;
            }

            // Create a descriptive message
            let description = '';
            const diceTerms = formula.match(/\d*d\d+(?:kh\d+|kl\d+)?/g) || [];
            const hasBonus = bonusMatch !== null;
            
            if (diceTerms.length === 1) {
                // Single die term
                const term = diceTerms[0];
                if (term.includes('kh')) {
                    const keepNum = parseInt(term.match(/kh(\d+)/)[1]);
                    description = `Keep the ${keepNum} highest roll${keepNum > 1 ? 's' : ''}`;
                } else if (term.includes('kl')) {
                    const keepNum = parseInt(term.match(/kl(\d+)/)[1]);
                    description = `Keep the ${keepNum} lowest roll${keepNum > 1 ? 's' : ''}`;
                }
                if (hasBonus) {
                    const bonusNum = parseInt(bonusMatch[1]);
                    description += description ? ' and ' : '';
                    description += `${bonusNum > 0 ? 'add' : 'subtract'} ${Math.abs(bonusNum)}`;
                }
            } else if (diceTerms.length > 1) {
                // Multiple dice terms
                const modifiers = [];
                diceTerms.forEach(term => {
                    if (term.includes('kh')) {
                        const keepNum = parseInt(term.match(/kh(\d+)/)[1]);
                        modifiers.push(`keep ${keepNum} highest from ${term.split('kh')[0]}`);
                    } else if (term.includes('kl')) {
                        const keepNum = parseInt(term.match(/kl(\d+)/)[1]);
                        modifiers.push(`keep ${keepNum} lowest from ${term.split('kl')[0]}`);
                    }
                });
                if (modifiers.length > 0) {
                    description = modifiers.join(', ');
                }
                if (hasBonus) {
                    const bonusNum = parseInt(bonusMatch[1]);
                    description += description ? ' and ' : '';
                    description += `${bonusNum > 0 ? 'add' : 'subtract'} ${Math.abs(bonusNum)}`;
                }
            } else if (hasBonus) {
                // Only bonus/penalty
                const bonusNum = parseInt(bonusMatch[1]);
                description = `${bonusNum > 0 ? 'Add' : 'Subtract'} ${Math.abs(bonusNum)}`;
            }
            
            // Format the flavor text with HTML
            const flavorHtml = `<div class="dice-roll-description">
                ${description ? `<div class="description">${description}</div>` : ''}
                <div class="roll-formula"><strong>Rolling:</strong> ${displayFormula}</div>
            </div>`;
            
            // Display the roll in chat with the formatted formula and description
            const tooltip = await roll.getTooltip();
            await roll.toMessage({
                speaker: ChatMessage.getSpeaker(),
                flavor: flavorHtml,
                content: `<div class="dice-roll">
                    <div class="dice-result">
                        <div class="dice-formula">${displayFormula}</div>
                        <div class="dice-tooltip" style="display: none;">
                            ${tooltip}
                        </div>
                        <h4 class="dice-total">${roll.total}</h4>
                    </div>
                </div>`,
                flags: {
                    "coffee-pub-squire": {
                        css: `
                            .dice-roll-description {
                                font-family: var(--font-primary);
                                color: #191813;
                                margin-bottom: 4px;
                                font-style: normal !important;
                            }
                            .dice-roll-description .description {
                                font-size: 14px;
                                margin-bottom: 4px;
                                font-style: normal !important;
                            }
                            .dice-roll-description .roll-formula {
                                font-size: 13px;
                                color: #666;
                                font-style: normal !important;
                            }
                            .dice-roll-description .roll-formula strong {
                                color: #191813;
                                font-style: normal !important;
                            }
                        `
                    }
                }
            });

            // Add to history with the display formula
            this._addToHistory(displayFormula, roll.total);

            // Clear the input
            panel.find('.squire-formula-input')[0].value = '';
            this.currentFormula = '';

        } catch (err) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Dice roll error',
                { err },
                false,
                false,
                true,
                MODULE.TITLE
            );
            ui.notifications.error("Invalid dice formula");
        }
    }

    _addToHistory(formula, result) {
        const panel = this.isPoppedOut ? this.window.element.find('[data-panel="dicetray"]') : this.element.find('[data-panel="dicetray"]');
        const historyList = panel.find('.squire-history-list');
        
        // Remove empty message if it exists
        historyList.find('.empty-message').remove();
        
        const historyEntry = document.createElement('div');
        historyEntry.classList.add('history-entry');
        historyEntry.innerHTML = `
            <span class="history-formula">${formula} = ${result}</span>
            <i class="fas fa-dice reroll-button" title="Re-roll this formula"></i>
        `;

        // Add click handler for the re-roll button
        const rerollButton = historyEntry.querySelector('.reroll-button');
        rerollButton.addEventListener('click', (ev) => {
            ev.stopPropagation(); // Prevent triggering the collapse/expand
            this.currentFormula = formula;
            panel.find('.squire-formula-input')[0].value = formula;
            this._onRollClick(panel);
        });
        
        // Add to the top of the list
        historyList.prepend(historyEntry);
        
        // Keep only last 10 entries
        const entries = historyList.children();
        if (entries.length > 10) {
            entries.last().remove();
        }
    }

    _onAdvantageClick(isAdvantage, panel) {
        if (!this.currentFormula) return;

        try {
            // Extract any bonus/penalty from the end first
            const bonusMatch = this.currentFormula.match(/\s*([\+\-]\d+)$/);
            const bonus = bonusMatch ? bonusMatch[1] : '';
            const cleanFormula = bonusMatch ? this.currentFormula.slice(0, -bonusMatch[0].length) : this.currentFormula;

            // Split the formula into parts (handling +, -, *)
            const parts = cleanFormula.split(/(?=[+\-*])/);
            
            // Process each part
            const transformedParts = parts.map(part => {
                // Remove leading operator and spaces
                const cleanPart = part.trim().replace(/^[+\-*]\s*/, '');
                
                // Find the dice count and type
                const diceMatch = cleanPart.match(/(\d+)d(\d+)/);
                if (diceMatch) {
                    const [_, count, sides] = diceMatch;
                    const doubledCount = parseInt(count) * 2;
                    const keepCount = Math.floor(doubledCount / 2);
                    const keepMod = isAdvantage ? 'kh' : 'kl';
                    
                    // Reconstruct the part with the operator
                    const operator = part.match(/^[+\-*]/)?.[0] || '';
                    return `${operator} ${doubledCount}d${sides}${keepMod}${keepCount}`;
                }
                return part; // Return unchanged if not a dice roll
            });

            // Join the parts and add back any bonus
            const newFormula = transformedParts.join('').trim() + (bonus ? ` ${bonus}` : '');
            
            // Update the input and current formula
            panel.find('.squire-formula-input')[0].value = newFormula;
            this.currentFormula = newFormula;
            
            // Automatically roll
            this._onRollClick(panel);
        } catch (err) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error processing advantage/disadvantage',
                { err },
                false,
                false,
                true,
                MODULE.TITLE
            );
            ui.notifications.error("Invalid formula for advantage/disadvantage");
        }
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Remove the panel container from the placeholder
        const container = $('#dicetray-panel-placeholder .panel-container[data-panel="dicetray"]');
        if (container.length) {
            container.remove();
        }

        // Set state before creating window
        DiceTrayPanel.isWindowOpen = true;
        this.isPoppedOut = true;
        await this._saveWindowState(true);

        // Create and render the window
        this.window = new DiceTrayWindow({ panel: this });
        DiceTrayPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async returnToTray() {
        if (!this.isPoppedOut) return;

        // Reset state
        DiceTrayPanel.isWindowOpen = false;
        this.isPoppedOut = false;
        DiceTrayPanel.activeWindow = null;
        this.window = null;
        await this._saveWindowState(false);

        // Check if dice tray panel is enabled in settings
        const isDiceTrayEnabled = game.settings.get(MODULE.ID, 'showDiceTrayPanel');
        if (!isDiceTrayEnabled) return;

        // (Re)create the panel container inside the placeholder if missing
        const placeholder = $('#dicetray-panel-placeholder');
        let container = placeholder.find('.panel-container[data-panel="dicetray"]');
        if (!container.length) {
            container = $('<div class="panel-container" data-panel="dicetray"></div>');
            placeholder.append(container);
        }
        this.element = container;
        // Re-render into the panel container
        await this.render();
    }

    // Update the element reference - new method
    updateElement(html) {
        this.element = html;
        this._activateListeners(html);
    }

    // Update actor reference and window if needed
    updateActor(actor) {
        // Unregister from old actor
        if (this.actor) {
            delete this.actor.apps[this.id];
        }

        // Update actor reference
        this.actor = actor || null;
        
        // Register with new actor
        if (this.actor) {
            this.actor.apps[this.id] = this;
        }
        
        // Update window if popped out
        if (this.isPoppedOut && this.window) {
            this.window.actor = this.actor;
            this.window.updateActor(this.actor);
        } else {
            // Re-render in tray if not popped out
            this.render();
        }
    }

    /**
     * Save window state to user flags
     * @param {boolean} isOpen - Whether the window is open
     * @private
     */
    async _saveWindowState(isOpen) {
        try {
            const windowStates = game.user.getFlag(MODULE.ID, 'windowStates') || {};
            windowStates.diceTray = isOpen;
            await game.user.setFlag(MODULE.ID, 'windowStates', windowStates);
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error saving dice tray window state',
                { error, isOpen },
                false,
                true,
                true,
                MODULE.TITLE
            );
        }
    }
} 