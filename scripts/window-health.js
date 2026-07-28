import { MODULE, TEMPLATES } from './const.js';
import { getHealthbarStatusClass, renderTemplate } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithToolWindowBaseV2 is unavailable for HealthWindow');
}

export const HEALTH_WINDOW_ID = `${MODULE.ID}-health-window`;

export class HealthWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'squire-health-window',
            classes: ['squire-health-tool-window'],
            position: {
                width: 400,
                height: 'auto'
            },
            window: {
                title: 'Health',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 300,
                maxWidth: 520,
                maxHeight: 'calc(100vh - 16px)'
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'squire-health-tool-position'
        }
    );

    constructor({ panel, ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? HealthWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, HealthWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, HealthWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.panel = panel;
        this._registeredActors = new Set();
        this._registerCurrentActors();
    }

    get actors() {
        if (this.panel?.actors) return this.panel.actors.filter(Boolean);
        return (this.panel?.tokens || []).map((token) => token.actor).filter(Boolean);
    }

    get title() {
        const actors = this.actors;
        if (actors.length > 1) return `Health: ${actors.length} Selected`;
        return `Health: ${this.panel?.actor?.name || 'None Selected'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        const healthEntries = this.actors.map((actor) => ({
            actor,
            healthbarStatus: getHealthbarStatusClass(actor.system?.attributes?.hp)
        }));
        const content = await renderTemplate(TEMPLATES.WINDOW_HEALTH, {
            actor: this.panel?.actor || null,
            actors: this.actors,
            healthEntries,
            isGM: game.user.isGM
        });

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this._registerCurrentActors();
        this.panel?.updateElement(this.element);
    }

    _registerActors(actors = []) {
        for (const actor of actors.filter(Boolean)) {
            actor.apps[this.id] = this;
            this._registeredActors.add(actor);
        }
    }

    _registerCurrentActors() {
        this._registerActors(this.actors);
    }

    _unregisterActors() {
        for (const actor of this._registeredActors) {
            delete actor.apps[this.id];
        }
        this._registeredActors.clear();
    }

    async _onUpdateActor() {
        await this.render(false);
    }

    async updateActor(actor) {
        this._unregisterActors();
        if (this.panel) {
            this.panel.actor = actor || null;
            this.panel.actors = actor ? [actor] : [];
            this.panel.tokens = [];
        }
        this._registerActors([actor]);
        await this.render(false);
    }

    async updateTokens(tokens) {
        const nextTokens = tokens || [];
        const actors = nextTokens.map((token) => token.actor).filter(Boolean);

        this._unregisterActors();
        if (this.panel) {
            this.panel.actors = actors;
            this.panel.actor = actors[0] || null;
            this.panel.tokens = nextTokens;
        }
        this._registerActors(actors);
        await this.render(false);
    }

    async updateActors(actors) {
        const nextActors = (actors || []).filter(Boolean);

        this._unregisterActors();
        if (this.panel) {
            this.panel.actors = nextActors;
            this.panel.actor = nextActors[0] || null;
            this.panel.tokens = [];
        }
        this._registerActors(nextActors);
        await this.render(false);
    }

    _onClose(options) {
        this._unregisterActors();
        super._onClose?.(options);
        void this.panel?.onWindowClosed();
    }
}

export function registerHealthWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(HEALTH_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Health',
        open: async () => {
            const { PanelManager } = await import('./manager-panel.js');
            const panel = PanelManager.instance?.healthPanel;
            if (!panel) {
                ui.notifications.warn('Coffee Pub Squire health tool is not available.');
                return null;
            }
            return panel.openWindow();
        }
    });
}
