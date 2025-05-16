import { MODULE, TEMPLATES } from './const.js';

export class MacrosWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        
        // Register for actor updates
        if (this.panel?.actor) {
            this.panel.actor.apps[this.appId] = this;
        }
    }

    static get defaultOptions() {
        // Try to load saved position/size
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'macrosWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = saved.width ?? 400;
        const height = saved.height ?? 300;
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-macros-window",
            title: "Macros",
            template: TEMPLATES.PANEL_MACROS,
            width,
            height,
            top,
            left,
            minimizable: true,
            resizable: true,
            popOut: true,
            classes: ["squire-window"]
        });
    }

    getData() {
        const data = {
            actor: this.panel?.actor,
            position: "left",
            isMacrosPopped: true
        };
        // Update window title with actor name
        this.options.title = `Macros: ${this.panel?.actor?.name || 'No Character'}`;
        return data;
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        // Create the wrapper structure using squire-popout
        const html = `
            <div class="squire-popout" data-position="left">
                <div class="tray-content">
                    <div class="panel-container" data-panel="macros">
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
        const panelContainer = html.find('[data-panel="macros"]').closest('.panel-container');
        if (this.panel) {
            // Update the panel's element reference with the panel container
            this.panel.updateElement(panelContainer);
        }
        // Add close button handler
        html.closest('.app').find('.close').click(ev => {
            ev.preventDefault();
            this.close();
        });
        // Set up data-panel attribute for CSS targeting
        html.closest('.window-content').attr('data-panel', 'macros');
        // Add listeners from the panel
        if (this.panel) {
            this.panel._activateListeners(html);
        }
    }

    get appId() {
        return `squire-macros-window-${this.panel.actor?.id || 'no-actor'}`;
    }

    setPosition(options={}) {
        const pos = super.setPosition(options);
        // Save position/size to settings
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'macrosWindowPosition', { top, left, width, height });
        }
        return pos;
    }

    async _onUpdateActor(actor, changes) {
        this.render(false);
    }

    async _onToggleMinimize(ev) {
        ev?.preventDefault();
        if (!this.rendered) return;
        this._minimized = !this._minimized;
        this.element.toggleClass("minimized");
    }

    async close(options={}) {
        if (this.panel?.actor) {
            delete this.panel.actor.apps[this.appId];
        }
        if (this.panel) {
            await this.panel.returnToTray();
        }
        return super.close(options);
    }

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