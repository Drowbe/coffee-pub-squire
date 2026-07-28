import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithToolWindowBaseV2 is unavailable for DiceTrayWindow');
}

export const DICE_TRAY_WINDOW_ID = `${MODULE.ID}-dice-tray-window`;

export class DiceTrayWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'squire-dicetray-window',
            classes: ['squire-dicetray-tool-window'],
            position: {
                width: 400,
                height: 'auto'
            },
            window: {
                title: 'Dice Tray',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 300,
                maxWidth: 520,
                maxHeight: 'calc(100vh - 16px)'
            },
            rememberPosition: true,
            windowPositionKey: 'squire-dice-tray-tool-position'
        }
    );

    constructor({ panel, ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? DiceTrayWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.panel = panel;
        this.actor = panel?.actor || null;
        this._registeredActor = null;
        this._registerActor(this.actor);
    }

    get title() {
        return `Dice Tray: ${this.actor?.name || 'No Character'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        const content = await renderTemplate(TEMPLATES.WINDOW_DICETRAY, {
            actor: this.actor
        });

        return {
            appId: this.id,
            bodyContent: `
                <div class="squire-popout" data-position="left">
                    <div class="tray-content">
                        <div class="panel-container" data-panel="dicetray">
                            ${content}
                        </div>
                    </div>
                </div>
            `
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this.panel?.updateElement(this.element);
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

export function registerDiceTrayWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(DICE_TRAY_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Dice Tray',
        open: async () => {
            const { openDiceTray } = await import('./panel-dicetray.js');
            return openDiceTray();
        }
    });
}
