import { MODULE } from './const.js';

export class HealthWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        
        // Register for actor updates
        if (this.panel?.actor) {
            this.panel.actor.apps[this.appId] = this;
        }
    }

    get appId() {
        return `squire-health-window-${this.panel.actor.id}`;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-health-window",
            template: "modules/coffee-pub-squire/templates/panel-health.hbs",
            title: "Health Panel",
            width: 400,
            height: "auto",
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
            isGM: game.user.isGM,
            isHealthPopped: true
        };
        // Update window title with actor name
        this.options.title = `Health: ${this.panel.actor.name}`;
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
        if (changes.system?.attributes?.hp) {
            this.render(false);
        }
    }

    // Override setPosition to ensure window stays in place when re-rendering
    setPosition(options={}) {
        // If we already have a position, preserve it
        if (this.element && this._position) {
            options = foundry.utils.mergeObject(this._position, options);
        }
        return super.setPosition(options);
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