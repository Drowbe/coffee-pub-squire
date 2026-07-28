import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithToolWindowBaseV2 is unavailable for MacrosWindow');
}

export const MACROS_WINDOW_ID = `${MODULE.ID}-macros-window`;

export class MacrosWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'squire-macros-window',
            classes: ['squire-macros-tool-window'],
            position: {
                width: 400,
                height: 300
            },
            window: {
                title: 'Macros',
                resizable: true,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: null,
                minHeight: 66,
                maxWidth: 2400,
                maxHeight: null
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'squire-macros-tool-position'
        }
    );

    constructor({ panel, macros = [], ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? MacrosWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, MacrosWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, MacrosWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.panel = panel;
        this.macros = macros;
        this.showAddSlot = false;
        this.actor = panel?.actor || null;
        this._registeredActor = null;
        this._registerActor(this.actor);
    }

    get title() {
        return `Macros: ${this.actor?.name || 'No Character'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    getToolHeaderActions() {
        return [{
            id: 'open-macro-folder',
            icon: 'fa-solid fa-folder-open',
            label: 'Open Macros Folder',
            onClick: () => ui.macros?.renderPopout?.()
        }];
    }

    async getData() {
        let macros = this.macros || game.settings.get(MODULE.ID, 'userMacros') || [];
        if (!macros.length) macros = [{ id: null, name: null, img: null }];

        const favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        const favoriteMacros = favoriteMacroIds
            .map((id) => game.macros.get(id))
            .filter(Boolean)
            .map((macro) => ({ id: macro.id, name: macro.name, img: macro.img }));

        const content = await renderTemplate(TEMPLATES.WINDOW_MACROS, {
            actor: this.actor,
            position: 'left',
            isMacrosPopped: true,
            macros,
            showAddSlot: this.showAddSlot === true,
            favoriteMacroIds,
            favoriteMacros
        });

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this.panel?.updateElement(this.element);
        this.panel?._activateListeners(this.element);
    }

    _registerActor(actor) {
        if (!actor || this._registeredActor === actor) return;
        this._unregisterActor();
        actor.apps[this.id] = this;
        this._registeredActor = actor;
    }

    _unregisterActor() {
        if (!this._registeredActor) return;
        delete this._registeredActor.apps[this.id];
        this._registeredActor = null;
    }

    async _onUpdateActor() {
        await this.render(false);
    }

    async updateActor(actor) {
        this._unregisterActor();
        this.actor = actor || null;
        if (this.panel) this.panel.actor = this.actor;
        this._registerActor(this.actor);
        await this.render(false);
    }

    _onClose(options) {
        this._unregisterActor();
        super._onClose?.(options);
        void this.panel?.onWindowClosed();
    }
}

export function registerMacrosWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(MACROS_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Macros',
        open: async () => {
            const { openMacros } = await import('./panel-macros.js');
            return openMacros();
        }
    });
}
