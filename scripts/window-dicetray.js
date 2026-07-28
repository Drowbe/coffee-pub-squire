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
                height: 280
            },
            window: {
                title: 'Dice Tray',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 300,
                maxWidth: 520,
                minHeight: 150,
                maxHeight: 280
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'squire-dice-tray-micro-position'
        }
    );

    constructor({ panel, ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        const showRecentRolls = game.settings.get(MODULE.ID, 'diceTrayShowRecentRolls');
        opts.id = opts.id ?? DiceTrayWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.position.height = showRecentRolls ? 280 : 150;
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.panel = panel;
        this.actor = panel?.actor || null;
        this.showRecentRolls = showRecentRolls;
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

    getToolHeaderActions() {
        return [
            ...(super.getToolHeaderActions?.() ?? []),
            {
                id: 'toggle-recent-rolls',
                icon: 'fa-solid fa-clock-rotate-left',
                label: this.showRecentRolls ? 'Hide Recent Rolls' : 'Show Recent Rolls',
                active: this.showRecentRolls,
                onClick: () => this._toggleRecentRolls()
            }
        ];
    }

    async _toggleRecentRolls() {
        this.showRecentRolls = !this.showRecentRolls;
        await game.settings.set(MODULE.ID, 'diceTrayShowRecentRolls', this.showRecentRolls);
        await this.render(false);
        if (this.showRecentRolls) {
            this.setPosition({ height: 280 });
            return;
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        this._fitHiddenHistoryHeight();
    }

    _fitHiddenHistoryHeight() {
        if (this.showRecentRolls || !this.element) return;
        const body = this.element?.querySelector?.('.blacksmith-window-tool-body');
        const content = this.element?.querySelector?.('#dicetray-content');
        const frameHeight = this.element?.getBoundingClientRect?.().height || 0;
        const bodyHeight = body?.getBoundingClientRect?.().height || 0;
        const contentRect = content?.getBoundingClientRect?.();
        const contentStyle = content ? getComputedStyle(content) : null;
        const lastChild = content?.lastElementChild;
        const lastChildBottom = lastChild?.getBoundingClientRect?.().bottom;
        const paddingBottom = parseFloat(contentStyle?.paddingBottom || '0') || 0;
        const contentHeight = contentRect && Number.isFinite(lastChildBottom)
            ? Math.ceil(lastChildBottom - contentRect.top + paddingBottom)
            : (contentRect?.height || 0);
        const chromeHeight = Math.max(0, frameHeight - bodyHeight);
        this.setPosition({ height: Math.ceil(chromeHeight + contentHeight) });
    }

    async getData() {
        const content = await renderTemplate(TEMPLATES.WINDOW_DICETRAY, {
            actor: this.actor,
            showRecentRolls: this.showRecentRolls,
            rollHistory: this.panel?.rollHistory || []
        });

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this.panel?.updateElement(this.element);
        if (!this.showRecentRolls) {
            requestAnimationFrame(() => this._fitHiddenHistoryHeight());
        }
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
