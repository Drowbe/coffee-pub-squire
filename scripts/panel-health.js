import { MODULE, TEMPLATES } from './const.js';
import { HealthWindow } from './window-health.js';
import { PanelManager } from './panel-manager.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class HealthPanel {
    static isWindowOpen = false;
    static activeWindow = null;

    constructor(actor) {
        this.actor = actor;
        this.element = null;
        // Check if there's an active window and restore state
        this.window = HealthPanel.activeWindow;
        this.isPoppedOut = HealthPanel.isWindowOpen;
        this.previousSibling = null; // Store reference for position

        // Register for actor updates
        if (this.actor) {
            this.actor.apps[this.id] = this;
        }
    }

    get id() {
        return `squire-health-${this.actor.id}`;
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
        // Skip rendering in tray if popped out
        if (!this.element || this.isPoppedOut) return;

        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isGM: game.user.isGM,
            isHealthPopped: this.isPoppedOut
        };

        const content = await renderTemplate(TEMPLATES.PANEL_HEALTH, templateData);
        this.element.find('[data-panel="health"]').html(content);
        
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element.find('[data-panel="health"]');
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

        // Find the panel container
        const panel = html.is('[data-panel="health"]') ? html : html.find('[data-panel="health"]');
        if (!panel.length) return;

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

        // Store position information before removing
        const container = this.element.find('[data-panel="health"]').closest('.panel-container');
        if (container.length) {
            this.previousSibling = container.prev('.panel-container');
            if (!this.previousSibling.length) {
                this.previousSibling = container.parent();
            }
        }

        // Set state before creating window
        HealthPanel.isWindowOpen = true;
        this.isPoppedOut = true;

        // Remove the entire panel structure first
        if (this.element) {
            // Find and remove the panel container
            if (container.length) {
                // Also check for and remove any wrapper divs that might be left behind
                const wrappers = container.parents().filter(function() {
                    // Only target empty wrappers that are specific to the health panel
                    return ($(this).children().length === 0 || 
                           ($(this).children().length === 1 && $(this).find('[data-panel="health"]').length > 0)) &&
                           !$(this).is('.squire-tray'); // Don't remove the main tray
                });
                wrappers.remove();
                container.remove();
            }
        }

        // Create and render the window
        this.window = new HealthWindow({ panel: this });
        HealthPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async returnToTray() {
        if (!this.isPoppedOut) return; // Don't do anything if not popped out

        // Reset state
        HealthPanel.isWindowOpen = false;
        HealthPanel.activeWindow = null;
        this.window = null;
        this.isPoppedOut = false;

        // Check if health panel is enabled in settings
        const isHealthEnabled = game.settings.get(MODULE.ID, 'showHealthPanel');
        if (!isHealthEnabled) {
            return; // Don't return to tray if panel is disabled
        }

        // Get a fresh reference to the main tray
        const mainTray = $('.squire-tray');
        if (!mainTray.length) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Could not find main tray when returning health panel',
                { mainTray },
                false,
                false,
                true,
                MODULE.TITLE
            );
            return;
        }

        // Update our element reference
        this.element = mainTray;

        // Create the new panel container
        const healthContainer = $('<div class="panel-container" data-panel="health"></div>');
        
        // Insert at the stored position
        if (this.previousSibling && this.previousSibling.length) {
            if (this.previousSibling.is('.squire-tray')) {
                // If the previous sibling was the tray itself, we were first
                this.previousSibling.find('.tray-content').prepend(healthContainer);
            } else {
                // Otherwise insert after the stored sibling
                healthContainer.insertAfter(this.previousSibling);
            }
        } else {
            // Fallback to prepending to tray content if no position info
            mainTray.find('.tray-content').prepend(healthContainer);
        }

        try {
            // Render the content into the new container
            const templateData = {
                actor: this.actor,
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                isGM: game.user.isGM
            };
            const content = await renderTemplate(TEMPLATES.PANEL_HEALTH, templateData);
            healthContainer.html(content);
            
            // Activate listeners on the new content
            this._activateListeners(healthContainer);
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error returning health panel to main tray',
                { error },
                false,
                false,
                true,
                MODULE.TITLE
            );
            ui.notifications.error("Error returning health panel to main tray");
        }
    }

    // Update the element reference - new method
    updateElement(html) {
        this.element = html;
        this._activateListeners(html);
    }

    // Update actor reference and window if needed
    updateActor(actor) {
        // Update actor reference
        this.actor = actor;
        
        // Re-register for updates
        if (actor) {
            actor.apps[this.id] = this;
        }
        
        // Update window if popped out
        if (this.isPoppedOut && this.window) {
            this.window.updateActor(actor);
        }
    }

    async _onHPChange(direction) {
        const amount = parseInt(this.element.find('.hp-amount').val()) || 1;
        const hp = this.actor.system.attributes.hp;
        const newValue = Math.clamp(hp.value + (amount * direction), 0, hp.max);
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
                // Set HP to 0 when applying dead status
                await this.actor.update({'system.attributes.hp.value': 0});
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
} 