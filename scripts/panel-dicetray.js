import { MODULE, TEMPLATES } from './const.js';
import { DiceTrayWindow } from './window-dicetray.js';
import { PanelManager } from './manager-panel.js';
import { renderTemplate, getNativeElement } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Function to open dice tray from menubar
export async function openDiceTray() {
  try {
    // Get the current actor from PanelManager
    const actor = PanelManager.instance?.actor;
    
    // Create or get the dice tray panel
    let dicetrayPanel = PanelManager.instance?.dicetrayPanel;
    if (!dicetrayPanel) {
      dicetrayPanel = new DiceTrayPanel({ actor });
      PanelManager.instance.dicetrayPanel = dicetrayPanel;
    }
    
    // If already popped out, just focus the window
    if (dicetrayPanel.isPoppedOut && dicetrayPanel.window) {
      dicetrayPanel.window.bringToTop();
      return;
    }
    
    // Pop out the dice tray
    await dicetrayPanel._onPopOut();
    
  } catch (error) {
    console.error('Coffee Pub Squire | Error opening dice tray:', error);
    ui.notifications.error('Failed to open dice tray');
  }
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
            // v13: Use native DOM instead of jQuery
            const placeholder = document.querySelector('#dicetray-panel-placeholder');
            if (placeholder) {
                let container = placeholder.querySelector('.panel-container[data-panel="dicetray"]');
                if (!container) {
                    // Create the panel container if it doesn't exist
                    container = document.createElement('div');
                    container.className = 'panel-container';
                    container.setAttribute('data-panel', 'dicetray');
                    placeholder.appendChild(container);
                }
                this.element = container;
            }
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
                const nativeElement = getNativeElement(this.window.element);
                const windowContent = nativeElement?.querySelector('.window-content');
                if (windowContent) {
                    windowContent.innerHTML = content;
                }
                this._activateListeners(this.window.element);
            }
            return; // Don't render in tray if popped out
        }

        // Only render in tray if not popped out
        const content = await renderTemplate(TEMPLATES.PANEL_DICETRAY, templateData);
        const nativeElement = getNativeElement(this.element);
        if (nativeElement) {
            nativeElement.innerHTML = content;
        }
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = getNativeElement(this.element);
        if (panel) {
            const isCollapsed = game.settings.get(MODULE.ID, 'isDiceTrayPanelCollapsed');
            if (isCollapsed) {
                const dicetrayContent = panel.querySelector('#dicetray-content');
                const toggle = panel.querySelector('#dicetray-toggle');
                if (dicetrayContent) {
                    dicetrayContent.classList.add('collapsed');
                }
                if (toggle) {
                    toggle.style.transform = 'rotate(-90deg)';
                }
            }
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // v13: Convert jQuery to native DOM if needed
        const panel = getNativeElement(html);
        if (!panel) return;

        // Add dice tray toggle handler
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            trayTitle.addEventListener('click', () => {
                const dicetrayContent = panel.querySelector('#dicetray-content');
                const toggle = panel.querySelector('#dicetray-toggle');
                if (dicetrayContent && toggle) {
                    dicetrayContent.classList.toggle('collapsed');
                    toggle.style.transform = dicetrayContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isDiceTrayPanelCollapsed', dicetrayContent.classList.contains('collapsed'));
                }
            });
        }

        // Add pop-out button handler
        const popOutButton = panel.querySelector('.pop-out-button');
        if (popOutButton) {
            popOutButton.addEventListener('click', () => this._onPopOut());
        }

        // Dice icons with right-click support
        const diceIcons = panel.querySelectorAll('.squire-dice-icon');
        diceIcons.forEach(icon => {
            icon.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._onDieClick(ev, panel);
            });
            icon.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                this._onDieClick(ev, panel);
            });
        });
        
        // Operator icons
        const operatorIcons = panel.querySelectorAll('.squire-operator-icon');
        operatorIcons.forEach(icon => {
            icon.addEventListener('click', (ev) => this._onOperatorClick(ev, panel));
        });
        
        // Modifier icons with right-click support
        const modifierIcons = panel.querySelectorAll('.squire-modifier-icon');
        modifierIcons.forEach(icon => {
            icon.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._onModifierClick(ev, panel);
            });
            icon.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                this._onModifierClick(ev, panel);
            });
        });
        
        // Roll button
        const rollButtons = panel.querySelectorAll('.squire-roll-button');
        rollButtons.forEach(button => {
            button.addEventListener('click', (ev) => {
                if (button.classList.contains('advantage')) {
                    this._onAdvantageClick(true, panel);
                } else if (button.classList.contains('disadvantage')) {
                    this._onAdvantageClick(false, panel);
                } else {
                    this._onRollClick(panel);
                }
            });
        });
        
        // Clear button
        const clearButton = panel.querySelector('.squire-clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                const input = panel.querySelector('.squire-formula-input');
                if (input) {
                    input.value = '';
                    this.currentFormula = '';
                }
            });
        }
        
        // Formula input
        const formulaInput = panel.querySelector('.squire-formula-input');
        if (formulaInput) {
            formulaInput.addEventListener('input', (ev) => {
                this.currentFormula = ev.target.value;
            });
        }

        // History toggle
        const historyHeader = panel.querySelector('.history-header');
        if (historyHeader) {
            historyHeader.addEventListener('click', () => {
                const historyList = panel.querySelector('.squire-history-list');
                const toggle = panel.querySelector('.history-toggle');
                if (historyList && toggle) {
                    historyList.classList.toggle('collapsed');
                    toggle.style.transform = historyList.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
                }
            });
        }

        // Clear history button
        const historyClear = panel.querySelector('.history-clear');
        if (historyClear) {
            historyClear.addEventListener('click', (ev) => {
                ev.stopPropagation(); // Prevent triggering the collapse/expand
                const historyList = panel.querySelector('.squire-history-list');
                if (historyList) {
                    historyList.innerHTML = '';
                    
                    // Add the "No recent rolls" message
                    historyList.innerHTML = '<div class="history-entry empty-message">No recent rolls</div>';

                    // If we're in a window, trigger a resize
                    if (this.isPoppedOut && this.window) {
                        this.window.setPosition({height: "auto"});
                    }
                }
            });
        }
    }

    _onDieClick(event, panel) {
        const die = event.currentTarget.dataset.die;
        const input = panel.querySelector('.squire-formula-input');
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
        const input = panel.querySelector('.squire-formula-input');
        if (!input) return;
        
        // Add spaces around operators
        input.value += ` ${op} `;
        this.currentFormula = input.value;
    }

    _onModifierClick(event, panel) {
        const mod = event.currentTarget.dataset.mod;
        const input = panel.querySelector('.squire-formula-input');
        if (!input) return;
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
            const input = panel.querySelector('.squire-formula-input');
            if (input) {
                input.value = '';
            }
            this.currentFormula = '';

        } catch (err) {
            console.error('Dice roll error:', err);
            ui.notifications.error("Invalid dice formula");
        }
    }

    _addToHistory(formula, result) {
        // v13: Use native DOM instead of jQuery
        let panelElement;
        if (this.isPoppedOut && this.window?.element) {
            const nativeWindowElement = getNativeElement(this.window.element);
            panelElement = nativeWindowElement?.querySelector('[data-panel="dicetray"]');
        } else if (this.element) {
            panelElement = getNativeElement(this.element);
        }
        
        if (!panelElement) return;
        
        const historyList = panelElement.querySelector('.squire-history-list');
        if (!historyList) return;
        
        // Remove empty message if it exists
        const emptyMessage = historyList.querySelector('.empty-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
        
        const historyEntry = document.createElement('div');
        historyEntry.classList.add('history-entry');
        historyEntry.innerHTML = `
            <span class="history-formula">${formula} = ${result}</span>
            <i class="fa-solid fa-dice reroll-button" title="Re-roll this formula"></i>
        `;

        // Add click handler for the re-roll button
        const rerollButton = historyEntry.querySelector('.reroll-button');
        if (rerollButton) {
            rerollButton.addEventListener('click', (ev) => {
                ev.stopPropagation(); // Prevent triggering the collapse/expand
                this.currentFormula = formula;
                const input = panelElement.querySelector('.squire-formula-input');
                if (input) {
                    input.value = formula;
                }
                this._onRollClick(panelElement);
            });
        }
        
        // Add to the top of the list
        historyList.insertBefore(historyEntry, historyList.firstChild);
        
        // Keep only last 10 entries
        const entries = Array.from(historyList.children);
        if (entries.length > 10) {
            entries[entries.length - 1].remove();
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
            const input = panel.querySelector('.squire-formula-input');
            if (input) {
                input.value = newFormula;
            }
            this.currentFormula = newFormula;
            
            // Automatically roll
            this._onRollClick(panel);
        } catch (err) {
            console.error('Error processing advantage/disadvantage:', err);
            ui.notifications.error("Invalid formula for advantage/disadvantage");
        }
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Remove the panel container from the placeholder
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#dicetray-panel-placeholder');
        if (placeholder) {
            const container = placeholder.querySelector('.panel-container[data-panel="dicetray"]');
            if (container) {
                container.remove();
            }
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
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#dicetray-panel-placeholder');
        if (placeholder) {
            let container = placeholder.querySelector('.panel-container[data-panel="dicetray"]');
            if (!container) {
                container = document.createElement('div');
                container.className = 'panel-container';
                container.setAttribute('data-panel', 'dicetray');
                placeholder.appendChild(container);
            }
            this.element = container;
        }
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
            console.error('Error saving dice tray window state:', error);
        }
    }
} 
