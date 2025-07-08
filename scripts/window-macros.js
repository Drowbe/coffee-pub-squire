import { MODULE, TEMPLATES } from './const.js';

export class MacrosWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.panel = options.panel;
        this.macros = options.macros || [];
        
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
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);
        // Ensure at least one empty slot if macros is empty
        let macros = this.macros && this.macros.length ? this.macros : [{ id: null, name: null, img: null }];
        console.log('SQUIRE | MacrosWindow.getData macros:', macros, 'favoriteMacros:', favoriteMacros);
        return {
            actor: this.panel?.actor,
            position: "left",
            isMacrosPopped: true,
            macros,
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
        // --- Add open macro folder icon to window header ---
        const header = html.closest('.app').find('.window-header');
        if (header.length && !header.find('.open-macro-folder').length) {
            // Insert before the close button
            const closeBtn = header.find('.close');
            const macroBtn = $('<a class="header-button open-macro-folder" title="Open Macro Folder"><i class="fas fa-folder-open"></i></a>');
            macroBtn.insertBefore(closeBtn);
            macroBtn.on('click', (e) => {
                e.preventDefault();
                if (ui.macros && typeof ui.macros.renderPopout === 'function') ui.macros.renderPopout();
            });
        }
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