import { MODULE } from './const.js';
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
        this.selectedHealthTarget = null;

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
        this._validateSelectedHealthTarget(nextTokens);

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

    _validateSelectedHealthTarget(tokens) {
        const target = this.selectedHealthTarget;
        if (!target) return;
        if (target === 'party' && tokens.length > 1 && tokens.some((token) => token.actor?.hasPlayerOwner)) return;
        if (target === 'npcs' && tokens.length > 1 && tokens.some((token) => !token.actor?.hasPlayerOwner)) return;
        if (target.startsWith('actor:')) {
            const actorId = target.slice('actor:'.length);
            if (tokens.some((token) => token.actor?.id === actorId)) return;
        }
        this.selectedHealthTarget = null;
    }

    async render() {
        if (this.window?.rendered) {
            await this.window.render(false);
        }
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = getNativeElement(html);
        if (!panel) return;

        if (game.user.isGM) {
            const bindButton = (selector, callback) => {
                const button = panel.querySelector(selector);
                if (!button) return;
                const newButton = button.cloneNode(true);
                button.parentNode?.replaceChild(newButton, button);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    callback();
                });
            };

            bindButton('.select-party', () => this._selectTokenGroup(true));
            bindButton('.death-toggle', () => this._onDeathToggle());
            bindButton('.hp-down-ten', () => this._onHPChange(-1, 10));
            bindButton('.hp-down', () => this._onHPChange(-1));
            bindButton('.hp-up', () => this._onHPChange(1));
            bindButton('.hp-up-ten', () => this._onHPChange(1, 10));
            bindButton('.hp-full', () => this._onFullHeal());
            bindButton('.select-npcs', () => this._selectTokenGroup(false));
        }

        const hpAmount = panel.querySelector('.hp-amount');
        if (hpAmount) {
            const selectText = () => hpAmount.select();
            hpAmount.addEventListener('focus', selectText);
            hpAmount.addEventListener('click', selectText);
            hpAmount.addEventListener('change', async () => {
                const amount = Math.max(1, parseInt(hpAmount.value || '1') || 1);
                hpAmount.value = String(amount);
                await game.settings.set(MODULE.ID, 'healthAdjustmentAmount', amount);
            });
        }

        panel.querySelectorAll('.health-conditions[data-actor-uuid]').forEach((button) => {
            button.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                const actorUuid = button.dataset.actorUuid;
                const actor = actorUuid ? await foundry.utils.fromUuid(actorUuid) : null;
                if (!actor) {
                    ui.notifications.warn('That character is no longer available.');
                    return;
                }

                const blacksmith = globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api;
                if (typeof blacksmith?.openWindow !== 'function') {
                    ui.notifications.error('The Blacksmith Window API is unavailable.');
                    return;
                }

                await blacksmith.openWindow(`${MODULE.ID}-status-effects-window`, {
                    actor,
                    actorUuid
                });
            });
        });

        panel.querySelectorAll('.health-row[data-health-target]').forEach((row) => {
            row.addEventListener('click', async (ev) => {
                ev.preventDefault();
                const target = row.dataset.healthTarget;
                this.selectedHealthTarget = this.selectedHealthTarget === target ? null : target;
                await this.window?.render(false);
            });
        });
    }

    async openWindow() {
        if (this.window && this.isWindowOpen) {
            this.window.bringToFront();
            return this.window;
        }

        HealthPanel.isWindowOpen = true;
        this.isWindowOpen = true;
        await this._saveWindowState(true);

        // Load the V2 subclass only after Foundry and Blacksmith have initialized
        // their module APIs. panel-health.js itself is loaded earlier from the manifest.
        const { HealthWindow } = await import('./window-health.js');
        this.window = new HealthWindow({ panel: this });
        HealthPanel.activeWindow = this.window;
        await this.window.render(true);
        return this.window;
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

    async _onHPChange(direction, fixedAmount = null) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const hpAmountInput = nativeElement?.querySelector('.hp-amount');
        const amount = fixedAmount ?? (parseInt(hpAmountInput?.value || '1') || 1);
        if (fixedAmount == null) {
            void game.settings.set(MODULE.ID, 'healthAdjustmentAmount', Math.max(1, amount));
        }
        
        for (const token of this._getOperationTokens()) {
            const hp = token.actor.system.attributes.hp;
            const newValue = Math.clamp(hp.value + (amount * direction), 0, hp.max);
            await token.actor.update({'system.attributes.hp.value': newValue});
        }
    }

    _getOperationTokens() {
        const selectedTokens = this.tokens || [];
        const tokens = selectedTokens.length
            ? selectedTokens
            : canvas.tokens.placeables.filter((token) => token.actor?.system?.attributes?.hp);
        const target = this.selectedHealthTarget;
        if (!target) return tokens;
        if (target === 'party') return tokens.filter((token) => token.actor?.hasPlayerOwner);
        if (target === 'npcs') return tokens.filter((token) => !token.actor?.hasPlayerOwner);
        if (target.startsWith('actor:')) {
            const actorId = target.slice('actor:'.length);
            return tokens.filter((token) => token.actor?.id === actorId);
        }
        return tokens;
    }

    _selectTokenGroup(selectParty) {
        const tokens = canvas.tokens.placeables.filter((token) => {
            if (!token.actor?.system?.attributes?.hp) return false;
            return selectParty ? token.actor.hasPlayerOwner : !token.actor.hasPlayerOwner;
        });

        if (!tokens.length) {
            ui.notifications.info(selectParty
                ? 'No party tokens are available on this scene.'
                : 'No non-party tokens are available on this scene.');
            return;
        }

        tokens.forEach((token, index) => token.control({ releaseOthers: index === 0 }));
        this.updateTokens(tokens, { force: true });
    }

    async _onFullHeal() {
        for (const token of this._getOperationTokens()) {
            const hp = token.actor.system.attributes.hp;
            await token.actor.update({'system.attributes.hp.value': hp.max});
        }
    }

    async _onDeathToggle() {
        for (const token of this._getOperationTokens()) {
            await token.actor.update({'system.attributes.hp.value': 0});
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

