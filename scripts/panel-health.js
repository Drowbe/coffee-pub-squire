import { MODULE } from './const.js';
import { HealthWindow } from './window-health.js';
import { getTokenDisplayName, getNativeElement } from './helpers.js';

export class HealthPanel {
    static isWindowOpen = false;
    static activeWindow = null;

    constructor(actor) {
        this.actor = actor;
        this.tokens = []; // Store tokens instead of actors for proper targeting
        this.element = null;
        this.window = HealthPanel.activeWindow;
        this.isWindowOpen = HealthPanel.isWindowOpen;

        // If actor provided, find its token and store it
        if (actor) {
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
            if (token) {
                this.tokens = [token];
                this.actor.handleDisplayName = getTokenDisplayName(token, this.actor);
                // Register for actor updates
                token.actor.apps[this.id] = this;
            }
        }
    }

    get id() {
        return `squire-health-${this.actor?.id || 'multi'}`;
    }

    destroy() {
        // Unregister from actor.apps so Foundry stops rendering this panel after teardown
        const id = this.id;
        if (this.tokens && this.tokens.length > 0) {
            this.tokens.forEach(token => {
                if (token.actor) {
                    delete token.actor.apps[id];
                }
            });
        }
        if (this.actor) {
            delete this.actor.apps[id];
        }
        this.tokens = [];
        this.element = null;
    }

    // Method to update tokens for bulk operations
    updateTokens(tokens, { force = false } = {}) {
        // Prevent infinite loops by checking if tokens have actually changed
        const currentTokenIds = (this.tokens || []).map(t => t.id).sort();
        const newTokenIds = (tokens || []).map(t => t.id).sort();
        
        if (!force && JSON.stringify(currentTokenIds) === JSON.stringify(newTokenIds)) {
            return; // No change, don't update
        }
        
        // Unregister from old token actors
        if (this.tokens && this.tokens.length > 0) {
            this.tokens.forEach(token => {
                if (token.actor) {
                    delete token.actor.apps[this.id];
                }
            });
        }
        
        const nextTokens = tokens || [];

        // Let the open window unregister from the old selection before changing panel state.
        if (this.isWindowOpen && this.window) {
            this.window.updateTokens(nextTokens);
        }

        this.tokens = nextTokens;
        this.actor = nextTokens[0]?.actor || null; // Keep first actor as primary for compatibility
        if (this.actor) {
            const primaryToken = this.tokens[0];
            this.actor.handleDisplayName = getTokenDisplayName(primaryToken, this.actor);
        }
        
        // Re-register for updates from all token actors
        if (this.tokens && this.tokens.length > 0) {
            this.tokens.forEach(token => {
                if (token.actor) {
                    token.actor.handleDisplayName = getTokenDisplayName(token, token.actor);
                    token.actor.apps[this.id] = this;
                }
            });
        }
        
    }

    async render() {
        if (this.window?.rendered) {
            await this.window.render(false);
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // v13: Convert jQuery to native DOM if needed
        const panel = getNativeElement(html);
        if (!panel) return;

        // HP Controls for GM
        if (game.user.isGM) {
            // v13: Use native DOM event delegation
            const hpDown = panel.querySelector('.hp-down');
            if (hpDown) {
                const newButton = hpDown.cloneNode(true);
                hpDown.parentNode?.replaceChild(newButton, hpDown);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this._onHPChange(-1);
                });
            }
            
            const hpUp = panel.querySelector('.hp-up');
            if (hpUp) {
                const newButton = hpUp.cloneNode(true);
                hpUp.parentNode?.replaceChild(newButton, hpUp);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this._onHPChange(1);
                });
            }
            
            const hpFull = panel.querySelector('.hp-full');
            if (hpFull) {
                const newButton = hpFull.cloneNode(true);
                hpFull.parentNode?.replaceChild(newButton, hpFull);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this._onFullHeal();
                });
            }
            
            const deathToggle = panel.querySelector('.death-toggle');
            if (deathToggle) {
                const newButton = deathToggle.cloneNode(true);
                deathToggle.parentNode?.replaceChild(newButton, deathToggle);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this._onDeathToggle();
                });
            }
        }
    }

    async openWindow() {
        if (this.window && this.isWindowOpen) {
            this.window.bringToTop();
            return;
        }

        HealthPanel.isWindowOpen = true;
        this.isWindowOpen = true;
        await this._saveWindowState(true);

        this.window = new HealthWindow({ panel: this });
        HealthPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async onWindowClosed() {
        HealthPanel.isWindowOpen = false;
        this.isWindowOpen = false;
        HealthPanel.activeWindow = null;
        this.window = null;
        await this._saveWindowState(false);
    }

    // Update the element reference - new method
    updateElement(html) {
        this.element = html;
        this._activateListeners(html);
    }

    // Update actor reference and window if needed (legacy support - wraps updateTokens)
    updateActor(actor) {
        // Find the token for this actor
        const token = canvas.tokens.placeables.find(t => t.actor?.id === actor?.id);
        if (token) {
            this.updateTokens([token]);
        } else {
            // Fallback if no token found - clear tokens
            this.updateTokens([]);
            this.actor = actor;
        }
    }

    async _onHPChange(direction) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const hpAmountInput = nativeElement?.querySelector('.hp-amount');
        const amount = parseInt(hpAmountInput?.value || '1') || 1;
        
        // Handle bulk operations if multiple tokens
        if (this.tokens.length > 1) {
            for (const token of this.tokens) {
                const hp = token.actor.system.attributes.hp;
                const newValue = Math.clamp(hp.value + (amount * direction), 0, hp.max);
                await token.actor.update({'system.attributes.hp.value': newValue});
            }
        } else if (this.tokens[0]) {
            // Single token operation
            const token = this.tokens[0];
            const hp = token.actor.system.attributes.hp;
            const newValue = Math.clamp(hp.value + (amount * direction), 0, hp.max);
            await token.actor.update({'system.attributes.hp.value': newValue});
        }
    }

    async _onFullHeal() {
        // Handle bulk operations if multiple tokens
        if (this.tokens.length > 1) {
            for (const token of this.tokens) {
                const hp = token.actor.system.attributes.hp;
                await token.actor.update({'system.attributes.hp.value': hp.max});
            }
        } else if (this.tokens[0]) {
            // Single token operation
            const token = this.tokens[0];
            const hp = token.actor.system.attributes.hp;
            await token.actor.update({'system.attributes.hp.value': hp.max});
        }
    }

    async _onDeathToggle() {
        // Handle bulk operations if multiple tokens
        if (this.tokens.length > 1) {
            for (const token of this.tokens) {
                const actor = token.actor;
                await actor.update({'system.attributes.hp.value': 0});
            }
        } else if (this.tokens[0]) {
            // Single token operation
            const actor = this.tokens[0].actor;
            await actor.update({'system.attributes.hp.value': 0});
        }
    }

    // Handler for actor updates
    async _onUpdateActor(actor, changes) {
        if (changes.system?.attributes?.hp) {
            if (this.isWindowOpen && this.window) {
                this.window.render(false);
            }
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
            windowStates.health = isOpen;
            await game.user.setFlag(MODULE.ID, 'windowStates', windowStates);
        } catch (error) {
            console.error('Error saving health window state:', error);
        }
    }
} 

