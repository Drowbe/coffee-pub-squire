import { MODULE, TEMPLATES } from './const.js';
import { HealthWindow } from './window-health.js';
import { PanelManager } from './manager-panel.js';
import { getTokenDisplayName, renderTemplate, getNativeElement } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class HealthPanel {
    static isWindowOpen = false;
    static activeWindow = null;

    constructor(actor) {
        this.actor = actor;
        this.tokens = []; // Store tokens instead of actors for proper targeting
        this.element = null;
        // Check if there's an active window and restore state
        this.window = HealthPanel.activeWindow;
        this.isPoppedOut = HealthPanel.isWindowOpen;
        this.previousSibling = null; // Store reference for position

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

    // Method to update tokens for bulk operations
    updateTokens(tokens) {
        // Prevent infinite loops by checking if tokens have actually changed
        const currentTokenIds = (this.tokens || []).map(t => t.id).sort();
        const newTokenIds = (tokens || []).map(t => t.id).sort();
        
        if (JSON.stringify(currentTokenIds) === JSON.stringify(newTokenIds)) {
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
        
        this.tokens = tokens || [];
        this.actor = tokens?.[0]?.actor || null; // Keep first actor as primary for compatibility
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
        
        // Update window if popped out
        if (this.isPoppedOut && this.window) {
            this.window.updateTokens(tokens);
        }
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-health",
            template: TEMPLATES.PANEL_HEALTH,
            popOut: false,
        });
    }

    async render(html) {
        // Always render into the panel container inside the placeholder if not popped out
        if (!this.isPoppedOut) {
            // v13: Use native DOM instead of jQuery
            const placeholder = document.querySelector('#health-panel-placeholder');
            if (!placeholder) return;
            let container = placeholder.querySelector('.panel-container[data-panel="health"]');
            if (!container) {
                // Create the panel container if it doesn't exist
                container = document.createElement('div');
                container.className = 'panel-container';
                container.setAttribute('data-panel', 'health');
                placeholder.appendChild(container);
            }
            this.element = container;
        } else if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element || this.isPoppedOut) {
            return;
        }

        // Determine if we are in player view mode
        const isPlayerView = PanelManager.viewMode === 'player';
        let templateData;
        if (isPlayerView) {
            // Only show the tray's character, never multiple
            templateData = {
                actor: this.actor,
                actors: this.actor ? [this.actor] : [],
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                isGM: game.user.isGM,
                isHealthPopped: this.isPoppedOut
            };
        } else {
            // Allow multi-token health - convert tokens to actors for template
            templateData = {
                actor: this.actor,
                actors: this.tokens.map(t => t.actor),
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                isGM: game.user.isGM,
                isHealthPopped: this.isPoppedOut
            };
        }

        // HealthPanel render data logged

        const content = await renderTemplate(TEMPLATES.PANEL_HEALTH, templateData);
        // v13: Use native DOM innerHTML instead of jQuery html()
        this.element.innerHTML = content;
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element;
        const isCollapsed = game.settings.get(MODULE.ID, 'isHealthPanelCollapsed');
        if (isCollapsed) {
            // v13: Use native DOM instead of jQuery
            const healthContent = panel.querySelector('.health-content');
            const toggle = panel.querySelector('.health-toggle');
            if (healthContent) healthContent.classList.add('collapsed');
            if (toggle) toggle.style.transform = 'rotate(-90deg)';
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // v13: Convert jQuery to native DOM if needed
        const panel = getNativeElement(html);
        if (!panel) return;

        // Health toggle
        // v13: Use native DOM event delegation
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            const newTitle = trayTitle.cloneNode(true);
            trayTitle.parentNode?.replaceChild(newTitle, trayTitle);
            newTitle.addEventListener('click', (ev) => {
                ev.preventDefault();
                const healthContent = panel.querySelector('#health-content');
                const toggle = panel.querySelector('#health-toggle');
                if (healthContent && toggle) {
                    const isCollapsed = healthContent.classList.contains('collapsed');
                    healthContent.classList.toggle('collapsed');
                    toggle.style.transform = healthContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isHealthPanelCollapsed', healthContent.classList.contains('collapsed'));
                }
            });
        }

        // Add pop-out button handler
        // v13: Use native DOM event delegation
        const popOutButton = panel.querySelector('.pop-out-button');
        if (popOutButton) {
            const newButton = popOutButton.cloneNode(true);
            popOutButton.parentNode?.replaceChild(newButton, popOutButton);
            newButton.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._onPopOut();
            });
        }

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

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Remove the panel container from the placeholder
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#health-panel-placeholder');
        if (placeholder) {
            const container = placeholder.querySelector('.panel-container[data-panel="health"]');
            if (container) {
                container.remove();
            }
        }

        // Set state before creating window
        HealthPanel.isWindowOpen = true;
        this.isPoppedOut = true;
        await this._saveWindowState(true);

        // Create and render the window
        this.window = new HealthWindow({ panel: this });
        HealthPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async returnToTray() {
        if (!this.isPoppedOut) return;

        // Reset state
        HealthPanel.isWindowOpen = false;
        this.isPoppedOut = false;
        HealthPanel.activeWindow = null;
        this.window = null;
        await this._saveWindowState(false);

        // Check if health panel is enabled in settings
        const isHealthEnabled = game.settings.get(MODULE.ID, 'showHealthPanel');
        if (!isHealthEnabled) return;

        // (Re)create the panel container inside the placeholder if missing
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#health-panel-placeholder');
        if (!placeholder) return;
        let container = placeholder.querySelector('.panel-container[data-panel="health"]');
        if (!container) {
            container = document.createElement('div');
            container.className = 'panel-container';
            container.setAttribute('data-panel', 'health');
            placeholder.appendChild(container);
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
            if (this.isPoppedOut && this.window) {
                this.window.render(false);
            } else {
                this.render();
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
