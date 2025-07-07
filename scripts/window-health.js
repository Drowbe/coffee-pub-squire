import { MODULE } from './const.js';

export class HealthWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        
        // Register for actor updates from all actors in the selection
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(actor => {
                if (actor) {
                    actor.apps[this.appId] = this;
                }
            });
        } else if (this.panel?.actor) {
            this.panel.actor.apps[this.appId] = this;
        }
    }

    async render(force = false, options = {}) {
        const result = await super.render(force, options);
        
        // Ensure we're registered for actor updates after rendering
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(actor => {
                if (actor && !actor.apps[this.appId]) {
                    actor.apps[this.appId] = this;
                }
            });
        } else if (this.panel?.actor && !this.panel.actor.apps[this.appId]) {
            this.panel.actor.apps[this.appId] = this;
        }
        
        return result;
    }

    get appId() {
        return `squire-health-window-${this.panel.actor?.id || 'no-actor'}`;
    }

    static get defaultOptions() {
        // Try to load saved position
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'healthWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = 400;
        const height = 'auto';
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - 300) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-health-window",
            template: "modules/coffee-pub-squire/templates/panel-health.hbs",
            title: "Health Panel",
            width,
            height,
            top,
            left,
            minimizable: true,
            resizable: false,
            popOut: true,
            classes: ["squire-window"]
        });
    }

    getData() {
        const data = {
            actor: this.panel.actor,
            actors: this.panel.actors, // Pass all actors for bulk operations
            position: "left",
            isGM: game.user.isGM,
            isHealthPopped: true
        };
        // Update window title with actor name or multiple selection
        if (this.panel.actors && this.panel.actors.length > 1) {
            this.options.title = `Health: Multiple Selected (${this.panel.actors.length})`;
        } else {
            this.options.title = `Health: ${this.panel.actor?.name || 'No Character Selected'}`;
        }
        return data;
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        
        // Create the wrapper structure
        const html = `
            <div class="squire-popout" data-position="left">
                <div class="tray-content">
                    <div class="panel-container" data-panel="health">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        return $(html);
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Find the panel container within the window content
        const panelContainer = html.find('[data-panel="health"]').closest('.panel-container');
        
        if (this.panel) {
            // Update the panel's element reference with the panel container
            this.panel.updateElement(panelContainer);
        }

        // Add close button handler
        html.closest('.app').find('.close').click(ev => {
            ev.preventDefault();
            this.close();
        });
    }

    async _onToggleMinimize(ev) {
        ev?.preventDefault();
        if (!this.rendered) return;
        this._minimized = !this._minimized;
        this.element.toggleClass("minimized");
    }

    async close(options={}) {
        // Unregister from actor updates from all actors
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(actor => {
                if (actor) {
                    delete actor.apps[this.appId];
                }
            });
        } else if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        if (this.panel) {
            await this.panel.returnToTray();
        }
        return super.close(options);
    }

    // Handler for actor updates
    async _onUpdateActor(actor, changes) {
        // Always re-render when the actor updates to ensure we catch all changes
        this.render(false);
    }

    // Override setPosition to ensure window stays in place when re-rendering
    setPosition(options={}) {
        // Validate position is within viewport
        if (options.top !== undefined || options.left !== undefined) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const windowWidth = options.width || this.position.width || 400;
            const windowHeight = options.height || this.position.height || 300;
            
            // Ensure window doesn't go off-screen
            if (options.left !== undefined) {
                options.left = Math.max(0, Math.min(options.left, viewportWidth - windowWidth));
            }
            if (options.top !== undefined) {
                options.top = Math.max(0, Math.min(options.top, viewportHeight - windowHeight));
            }
        }
        
        const pos = super.setPosition(options);
        // Save position to settings
        if (this.rendered) {
            const { top, left } = this.position;
            game.settings.set(MODULE.ID, 'healthWindowPosition', { top, left });
        }
        return pos;
    }

    // Update the panel reference and re-register for updates when the actor changes
    updateActor(actor) {
        // Unregister from all actors
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(a => {
                if (a) {
                    delete a.apps[this.appId];
                }
            });
        } else if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        // Update panel's actor
        if (this.panel) {
            this.panel.actor = actor;
            this.panel.actors = actor ? [actor] : [];
        }
        
        // Register with new actor
        if (actor) {
            actor.apps[this.appId] = this;
        }
        
        // Re-render with new actor data
        this.render(false);
    }

    // Update the panel with multiple actors for bulk operations
    updateActors(actors) {
        // Unregister from old actor
        if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        // Update panel's actors directly (avoid recursive call)
        if (this.panel) {
            this.panel.actors = actors || [];
            this.panel.actor = actors?.[0] || null;
        }
        
        // Register with ALL actors in the selection for updates
        if (actors && actors.length > 0) {
            actors.forEach(actor => {
                if (actor) {
                    actor.apps[this.appId] = this;
                }
            });
        }
        
        // Re-render with new actor data
        this.render(false);
    }
} 