import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { getNativeElement, renderTemplate } from './helpers.js';

export class MacrosWindow extends Application {
    /**
     * Override to prevent FoundryVTT core from trying to access form elements we don't have
     * @override
     */
    _activateCoreListeners(html) {
        // Override FoundryVTT's core _activateCoreListeners to prevent it from
        // trying to find form elements that don't exist in this simple window.
        // This prevents the "parentElement" error.
        // We handle our own listeners in activateListeners.
        return;
    }

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
        // v13: Return native DOM element instead of jQuery
        const html = document.createElement('div');
        html.className = 'squire-popout';
        html.setAttribute('data-position', 'left');
        html.innerHTML = `
            <div class="tray-content">
                <div class="panel-container" data-panel="macros">
                    ${content}
                </div>
            </div>
        `;
        return html;
    }

    activateListeners(html) {
        // v13: Call super first, but wrap in try-catch since our window doesn't have forms
        // FoundryVTT's _activateCoreListeners expects form elements that we don't have
        // (We've overridden _activateCoreListeners to prevent this, but keeping try-catch for safety)
        try {
            super.activateListeners(html);
        } catch (error) {
            // FoundryVTT core may fail if it expects form elements we don't have
            // This is safe to ignore since we handle all our own listeners below
            console.debug('MacrosWindow: super.activateListeners error (expected for non-form windows):', error);
        }
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Find the panel container within the window content
        const panelContainer = nativeHtml.querySelector('[data-panel="macros"]')?.closest('.panel-container');
        if (this.panel && panelContainer) {
            // Update the panel's element reference with the panel container
            this.panel.updateElement(panelContainer);
        }

        // Find the app element (parent window)
        const appElement = nativeHtml.closest('.app') || this.element?.closest('.app');
        if (appElement) {
            // Add close button handler
            const closeButton = appElement.querySelector('.close');
            if (closeButton) {
                closeButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
            
            // Set up data-panel attribute for CSS targeting
            const windowContent = appElement.querySelector('.window-content');
            if (windowContent) {
                windowContent.setAttribute('data-panel', 'macros');
            }
            
            // Header button is now provided by _getHeaderButtons
            // Add tooltip to the header button
            const tooltipHtml = "<div class='squire-data-tooltip-label'>Open Macros Folder</div><div class='squire-data-tooltip-text'>Once open, drag macros to the macro window. Dragging over an existing macro replaces it.</div>";
            const headerButton = appElement.querySelector('.window-header .open-macro-folder');
            if (headerButton) {
                headerButton.setAttribute('data-tooltip', tooltipHtml);
            }
        }
        
        // Add listeners from the panel
        if (this.panel) {
            this.panel._activateListeners(nativeHtml);
        }
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.splice(buttons.length - 1, 0, {
            label: 'Macros',
            class: 'open-macro-folder',
            icon: 'fa-solid fa-folder-open',
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
        // v13: Use native DOM classList instead of jQuery toggleClass
        const element = getNativeElement(this.element);
        if (element) {
            element.classList.toggle("minimized");
        }
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
