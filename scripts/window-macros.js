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
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-macros-window",
            title: "Macros",
            template: TEMPLATES.PANEL_MACROS,
            width: 300,
            height: 300,
            resizable: true,
            classes: ["squire-popout"],
            popOut: true,
            minimizable: true
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

    activateListeners(html) {
        super.activateListeners(html);
        
        // Set up data-panel attribute for CSS targeting
        html.closest('.window-content').attr('data-panel', 'macros');
        
        // Add listeners from the panel
        if (this.panel) {
            this.panel._activateListeners(html);
        }
    }

    updateActor(actor) {
        this.setPosition({ height: "auto" });
        this.render(false);
    }

    async close(options = {}) {
        // Return the panel to the tray when the window is closed
        if (this.panel) {
            await this.panel.returnToTray();
        }
        return super.close(options);
    }
} 