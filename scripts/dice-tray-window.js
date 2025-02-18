import { MODULE, TEMPLATES } from './const.js';

export class DiceTrayWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
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
            position: "left",
            isDiceTrayPopped: true
        };
        // Update window title with actor name
        this.options.title = `Dice Tray: ${game.user.character?.name || 'No Character'}`;
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
        if (this.panel) {
            await this.panel.returnToTray();
        }
        return super.close(options);
    }
} 