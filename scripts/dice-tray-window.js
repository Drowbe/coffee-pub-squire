import { MODULE, TEMPLATES } from './const.js';

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
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-dicetray-window",
            template: TEMPLATES.PANEL_DICETRAY,
            title: "Dice Tray",
            width: 400,
            height: 500,
            resizable: true,
            minimizable: true,
            popOut: true,
            classes: ["squire-window"] // Add a base class for all our popouts
        });
    }

    getData() {
        const data = {
            actor: this.panel.actor,
            position: "left",
            isDiceTrayPopped: true
        };
        // Update window title with actor name
        this.options.title = `Dice Tray: ${this.panel.actor.name}`;
        return data;
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        
        // Create the wrapper structure using squire-popout instead of squire-tray
        const html = `
            <div class="squire-popout" data-position="left">
                <div class="tray-content">
                    <div class="panel-container" data-panel="dicetray">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        return $(html);
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Update the panel's element reference to point to our window content
        if (this.panel) {
            // We need to pass the entire window element so the panel can find its content
            this.panel.updateElement(html);
        }

        // Add handler for the close button
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
        // Always re-render when the actor updates
        this.render(false);
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