import { MODULE, TEMPLATES, SQUIRE } from './const.js';

export class MacrosWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        this.macros = options.macros || [];
        this.showAddSlot = false;
        
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
        // Load macros and favorites from settings
        let macros = this.macros || game.settings.get(MODULE.ID, 'userMacros') || [];
        // Ensure at least one empty slot if macros is empty
        if (!macros.length) {
            macros = [{ id: null, name: null, img: null }];
        }
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);

        
        return {
            actor: this.panel?.actor,
            position: "left",
            isMacrosPopped: true,
            macros,
            showAddSlot: this.showAddSlot === true,
            favoriteMacroIds,
            favoriteMacros
        };
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
        // Header button is now provided by _getHeaderButtons
        // Add tooltip to the header button
        const tooltipHtml = "<div class='squire-data-tooltip-label'>Open Macros Folder</div><div class='squire-data-tooltip-text'>Once open, drag macros to the macro window. Dragging over an existing macro replaces it.</div>";
        html.closest('.app').find('.window-header .open-macro-folder').attr('data-tooltip', tooltipHtml);
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.splice(buttons.length - 1, 0, {
            label: 'Macros',
            class: 'open-macro-folder',
            icon: 'fas fa-folder-open',
            onclick: (ev) => {
                ev?.preventDefault();
                if (ui.macros && typeof ui.macros.renderPopout === 'function') ui.macros.renderPopout();
            }
        });
        return buttons;
    }

    get appId() {
        return `squire-macros-window-${this.panel.actor?.id || 'no-actor'}`;
    }

    setPosition(options={}) {
        // Enforce minimum size: 1 slot (48px) + padding/margins (let's use 32px for safety)
        const minWidth = 48 + 32;
        const minHeight = 48 + 32 + 40; // 40px for header/title bar
        if (options.width && options.width < minWidth) options.width = minWidth;
        if (options.height && options.height < minHeight) options.height = minHeight;
        
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
