import { MODULE } from './const.js';
import { renderTemplate } from './helpers.js';

export class HealthWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        
        // Register for actor updates from all actors in the selection
        // Handle both old actors array and new tokens array
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(actor => {
                if (actor) {
                    actor.apps[this.appId] = this;
                }
            });
        } else if (this.panel?.tokens && this.panel.tokens.length > 0) {
            // New token-based approach
            this.panel.tokens.forEach(token => {
                if (token.actor) {
                    token.actor.apps[this.appId] = this;
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
        // Handle both old actors array and new tokens array
        let actors = this.panel.actors;
        if (!actors && this.panel.tokens) {
            actors = this.panel.tokens.map(t => t.actor);
        }
        
        const data = {
            actor: this.panel.actor,
            actors: actors, // Pass all actors for bulk operations
            position: "left",
            isGM: game.user.isGM,
            isHealthPopped: true
        };
        // Update window title with actor name or multiple selection
        if (actors && actors.length > 1) {
            this.options.title = `Health: ${actors.length} Selected`;
        } else {
            this.options.title = `Health: ${this.panel.actor?.name || 'None Selected'}`;
        }
        return data;
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        
        // Create the wrapper structure with window namespace
        // v13: Return native DOM element instead of jQuery
        const wrapper = document.createElement('div');
        wrapper.className = 'squire-popout squire-window-health';
        wrapper.setAttribute('data-position', 'left');
        
        const trayContent = document.createElement('div');
        trayContent.className = 'tray-content';
        
        const panelContainer = document.createElement('div');
        panelContainer.className = 'panel-container';
        panelContainer.setAttribute('data-panel', 'health');
        panelContainer.innerHTML = content;
        
        trayContent.appendChild(panelContainer);
        wrapper.appendChild(trayContent);
        
        return wrapper;
    }

    /**
     * Get native DOM element from this.element (handles jQuery conversion)
     * @returns {HTMLElement|null} Native DOM element
     */
    _getNativeElement() {
        if (!this.element) return null;
        // v13: Detect and convert jQuery to native DOM if needed
        if (this.element.jquery || typeof this.element.find === 'function') {
            return this.element[0] || this.element.get?.(0) || this.element;
        }
        return this.element;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Find the panel container within the window content
        const panelElement = nativeHtml.querySelector('[data-panel="health"]');
        const panelContainer = panelElement?.closest('.panel-container');
        
        if (this.panel && panelContainer) {
            // Update the panel's element reference with the panel container
            this.panel.updateElement(panelContainer);
        }

        // Add close button handler
        const appElement = nativeHtml.closest('.app');
        const closeButton = appElement?.querySelector('.close');
        if (closeButton) {
            closeButton.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.close();
            });
        }
    }

    async _onToggleMinimize(ev) {
        ev?.preventDefault();
        if (!this.rendered) return;
        this._minimized = !this._minimized;
        
        // v13: Use native classList instead of jQuery toggleClass
        const element = this._getNativeElement();
        if (element) {
            element.classList.toggle("minimized");
        }
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

    // Update the panel with tokens for bulk operations (new method)
    updateTokens(tokens) {
        // Convert tokens to actors for the window
        const actors = tokens?.map(t => t.actor) || [];
        
        // Unregister from old actors
        if (this.panel?.actors && this.panel.actors.length > 0) {
            this.panel.actors.forEach(a => {
                if (a) {
                    delete a.apps[this.appId];
                }
            });
        } else if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        // Update panel's actors directly (avoid recursive call)
        if (this.panel) {
            this.panel.actors = actors;
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