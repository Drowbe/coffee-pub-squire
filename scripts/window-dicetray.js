import { MODULE, TEMPLATES } from './const.js';
import { getNativeElement } from './helpers.js';

export class DiceTrayWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        
        // Register for actor updates
        if (this.panel?.actor) {
            this.panel.actor.apps[this.appId] = this;
        }
    }

    get appId() {
        return `squire-dicetray-window-${this.panel.actor?.id || 'no-actor'}`;
    }

    static get defaultOptions() {
        // Try to load saved position
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'diceTrayWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = 400;
        const height = 'auto';
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - 300) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-dicetray-window",
            template: TEMPLATES.PANEL_DICETRAY,
            title: "Dice Tray",
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
            position: "left",
            isDiceTrayPopped: true
        };
        // Update window title with actor name
        this.options.title = `Dice Tray: ${this.panel.actor?.name || 'No Character'}`;
        return data;
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        
        // Create the wrapper structure using squire-popout instead of squire-tray
        // v13: Return native DOM element instead of jQuery
        const html = document.createElement('div');
        html.className = 'squire-popout';
        html.setAttribute('data-position', 'left');
        html.innerHTML = `
            <div class="tray-content">
                <div class="panel-container" data-panel="dicetray">
                    ${content}
                </div>
            </div>
        `;
        
        return html;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Update the panel's element reference to point to our window content
        if (this.panel) {
            // We need to pass the entire window element so the panel can find its content
            this.panel.updateElement(nativeHtml);
        }

        // Find the app element (parent window) and add handler for the close button
        const appElement = nativeHtml.closest('.app') || this.element?.closest('.app');
        if (appElement) {
            const closeButton = appElement.querySelector('.close');
            if (closeButton) {
                closeButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
        }
    }

    async _onToggleMinimize(ev) {
        ev?.preventDefault();
        if (!this.rendered) return;
        this._minimized = !this._minimized;
        // v13: Use native DOM classList instead of jQuery toggleClass
        const element = getNativeElement(this.element);
        if (element) {
            element.classList.toggle("minimized");
        }
    }

    async close(options={}) {
        // Unregister from actor updates
        if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        if (this.panel) {
            await this.panel.returnToTray();
        }
        return super.close(options);
    }

    // Handler for actor updates
    async _onUpdateActor(actor, changes) {
        // Always re-render when the actor updates
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
            game.settings.set(MODULE.ID, 'diceTrayWindowPosition', { top, left });
        }
        return pos;
    }

    // Update the panel reference and re-register for updates when the actor changes
    updateActor(actor) {
        // Unregister from old actor
        if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        
        // Update panel's actor
        if (this.panel) {
            this.panel.actor = actor;
        }
        
        // Register with new actor
        if (actor) {
            actor.apps[this.appId] = this;
        }
        
        // Re-render with new actor data
        this.render(false);
    }
} 