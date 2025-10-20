import { MODULE, TEMPLATES } from './const.js';
import { HealthWindow } from './window-health.js';
import { PanelManager } from './manager-panel.js';

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
        
        // Re-register for updates from all token actors
        if (this.tokens && this.tokens.length > 0) {
            this.tokens.forEach(token => {
                if (token.actor) {
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
            const placeholder = $('#health-panel-placeholder');
            let container = placeholder.find('.panel-container[data-panel="health"]');
            if (!container.length) {
                // Create the panel container if it doesn't exist
                container = $('<div class="panel-container" data-panel="health"></div>');
                placeholder.append(container);
            }
            this.element = container;
        } else if (html) {
            this.element = html;
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

        const content = await renderTemplate(TEMPLATES.PANEL_HEALTH, templateData);
        this.element.html(content);
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element;
        const isCollapsed = game.settings.get(MODULE.ID, 'isHealthPanelCollapsed');
        if (isCollapsed) {
            const healthContent = panel.find('.health-content');
            const toggle = panel.find('.health-toggle');
            healthContent.addClass('collapsed');
            toggle.css('transform', 'rotate(-90deg)');
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // Find the panel container - the element itself is the panel
        const panel = html;

        // Health toggle
        panel.find('.tray-title-small').click(ev => {
            ev.preventDefault();
            const healthContent = panel.find('.health-content');
            const toggle = panel.find('.health-toggle');
            healthContent.toggleClass('collapsed');
            toggle.css('transform', healthContent.hasClass('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)');
            // Save collapsed state
            game.settings.set(MODULE.ID, 'isHealthPanelCollapsed', healthContent.hasClass('collapsed'));
        });

        // Add pop-out button handler
        panel.find('.pop-out-button').click(ev => {
            ev.preventDefault();
            this._onPopOut();
        });

        // HP Controls for GM
        if (game.user.isGM) {
            panel.find('.hp-down').click(ev => {
                ev.preventDefault();
                this._onHPChange(-1);
            });
            panel.find('.hp-up').click(ev => {
                ev.preventDefault();
                this._onHPChange(1);
            });
            panel.find('.hp-full').click(ev => {
                ev.preventDefault();
                this._onFullHeal();
            });
            panel.find('.death-toggle').click(ev => {
                ev.preventDefault();
                this._onDeathToggle();
            });
        }
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Remove the panel container from the placeholder
        const container = $('#health-panel-placeholder .panel-container[data-panel="health"]');
        if (container.length) {
            container.remove();
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
        const placeholder = $('#health-panel-placeholder');
        let container = placeholder.find('.panel-container[data-panel="health"]');
        if (!container.length) {
            container = $('<div class="panel-container" data-panel="health"></div>');
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
        const amount = parseInt(this.element.find('.hp-amount').val()) || 1;
        
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
                const isDead = actor.effects.find(e => e.statuses.has('dead'));
                if (isDead) {
                    // Remove dead status
                    await actor.deleteEmbeddedDocuments('ActiveEffect', [isDead.id]);
                } else {
                    // Add dead status and set HP to 0
                    const effect = CONFIG.statusEffects.find(e => e.id === 'dead');
                    if (effect) {
                        await actor.createEmbeddedDocuments('ActiveEffect', [effect]);
                        await actor.update({'system.attributes.hp.value': 0});
                    }
                }
            }
        } else if (this.tokens[0]) {
            // Single token operation
            const actor = this.tokens[0].actor;
            const isDead = actor.effects.find(e => e.statuses.has('dead'));
            if (isDead) {
                await actor.deleteEmbeddedDocuments('ActiveEffect', [isDead.id]);
            } else {
                const effect = CONFIG.statusEffects.find(e => e.id === 'dead');
                if (effect) {
                    await actor.createEmbeddedDocuments('ActiveEffect', [effect]);
                    // Set HP to 0 when applying dead status
                    await actor.update({'system.attributes.hp.value': 0});
                }
            }
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
