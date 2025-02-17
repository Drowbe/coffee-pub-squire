import { MODULE } from './const.js';

export class HealthWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-health-window",
            template: "modules/coffee-pub-squire/templates/panel-health.hbs",
            title: "Health Panel",
            width: 400,
            height: "auto",
            minimizable: true,
            resizable: true,
            popOut: true,
            classes: ["squire-window"]
        });
    }

    getData() {
        return {
            actor: this.panel.actor,
            position: "left",
            isGM: game.user.isGM
        };
    }

    async _renderInner(data) {
        const content = await renderTemplate(this.options.template, data);
        
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
        
        const panelContainer = html.find('[data-panel="health"]').closest('.panel-container');
        
        if (this.panel) {
            this.panel.updateElement(panelContainer);
        }

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