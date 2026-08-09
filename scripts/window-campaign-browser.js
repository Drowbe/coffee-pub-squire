import { MODULE } from './const.js';
import { registerCampaignPanel, unregisterCampaignPanel } from './campaign-panels.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.();

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for CampaignBrowserWindow');
}

/**
 * Standalone browser windows for quests, codex, and notes.
 *
 * These host the existing panel classes rather than reimplementing them. The
 * panels were always `render(hostElement)` classes that look for their own
 * `[data-panel="panel-x"]` container inside whatever they're given — the tray
 * was one such host, and there was never anything tray-specific about the
 * contract. So a window that supplies the same container is a second host, and
 * the panel neither knows nor cares.
 *
 * That is the whole reason this file is short. The alternative — rewriting
 * three browsers as native ApplicationV2 views — would reimplement roughly
 * 7,800 lines of working list rendering, filtering, pin placement, and
 * import/export to gain nothing that a container div doesn't already give.
 *
 * The panels' stylesheets key off `.squire-panel-host[data-position="left"]`,
 * which the tray and this window's body both carry.
 */

const KINDS = {
    quest: {
        id: `${MODULE.ID}-quest-browser-window`,
        title: 'Quests',
        panelKey: 'panel-quest',
        headerIcon: 'fa-solid fa-flag',
        rootClass: 'quest-browser-window',
        position: { width: 520, height: 860 },
        constraints: { minWidth: 420, minHeight: 480 }
    },
    codex: {
        id: `${MODULE.ID}-codex-browser-window`,
        title: 'Codex',
        panelKey: 'panel-codex',
        headerIcon: 'fa-solid fa-book',
        rootClass: 'codex-browser-window',
        position: { width: 520, height: 860 },
        constraints: { minWidth: 420, minHeight: 480 }
    },
    notes: {
        id: `${MODULE.ID}-notes-browser-window`,
        title: 'Notes',
        panelKey: 'panel-notes',
        headerIcon: 'fa-solid fa-sticky-note',
        rootClass: 'notes-browser-window',
        position: { width: 520, height: 860 },
        constraints: { minWidth: 420, minHeight: 480 }
    }
};

/** Live window instances, so a second launch focuses rather than duplicates. */
const openWindows = new Map();

export class CampaignBrowserWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'campaign-browser-window';

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-campaign-browser.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(kind, options = {}) {
        const config = KINDS[kind];
        if (!config) throw new Error(`Coffee Pub Squire | Unknown campaign browser kind: ${kind}`);

        const opts = foundry.utils.mergeObject({}, options);
        opts.id = config.id;
        opts.classes = ['squire-window', 'campaign-browser-window', config.rootClass];
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, config.position),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            { title: config.title, resizable: true, minimizable: true },
            opts.window || {}
        );
        opts.windowSizeConstraints = config.constraints;
        opts.rememberPosition = true;
        opts.windowPositionKey = `${config.id}-position`;

        super(opts);
        this.kind = kind;
        this.config = config;
    }

    _viewContext() {
        return {
            appId: this.id,
            panelKey: this.config.panelKey,
            headerIcon: this.config.headerIcon,
            headerTitle: this.config.title
        };
    }

    async getData() {
        return this._viewContext();
    }

    async _prepareContext(options) {
        const base = await super._prepareContext?.(options) ?? {};
        return foundry.utils.mergeObject(base, this._viewContext());
    }

    /**
     * Claim the panel for this window and render it here.
     *
     * Registration happens on every render, not only on first open: the tray
     * registers the same panels, and whichever host rendered most recently is
     * the one a pin click or a notification should reach.
     */
    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const panel = this._getPanel();
        if (!panel) return;

        registerCampaignPanel(this.kind, {
            panel,
            getElement: () => this.element ?? null,
            reveal: () => {
                // v13 renamed bringToTop -> bringToFront; the old name still
                // resolves through a shim that logs a deprecation on every call.
                (this.bringToFront ?? this.bringToTop)?.call(this);
                if (this.minimized) this.maximize?.();
            }
        });

        await panel.render(this.element);
    }

    /**
     * The panel instance to host. Sourced from PanelManager because that is
     * still what constructs them; when campaign content moves out, this is the
     * line that changes and nothing else in the window does.
     */
    _getPanel() {
        const instance = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (!instance) return null;
        if (this.kind === 'quest') return instance.questPanel ?? null;
        if (this.kind === 'codex') return instance.codexPanel ?? null;
        return instance.notesPanel ?? null;
    }

    _onClose(options) {
        openWindows.delete(this.kind);
        // Leave the registry pointing at nothing rather than at a dead element.
        // A caller that finds no panel skips quietly, which is the correct
        // behaviour for "the browser isn't open".
        unregisterCampaignPanel(this.kind);
        super._onClose?.(options);
    }
}

/** Open (or focus) the browser for a kind. */
export async function openCampaignBrowser(kind) {
    const existing = openWindows.get(kind);
    if (existing) {
        (existing.bringToFront ?? existing.bringToTop)?.call(existing);
        if (existing.minimized) existing.maximize?.();
        await existing.render(false);
        return existing;
    }

    const win = new CampaignBrowserWindow(kind);
    openWindows.set(kind, win);
    await win.render(true);
    return win;
}

/** Register all three with Blacksmith's window registry. */
export function registerCampaignBrowserWindows() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    let allOk = true;
    for (const [kind, config] of Object.entries(KINDS)) {
        const ok = blacksmith.registerWindow(config.id, {
            moduleId: MODULE.ID,
            title: config.title,
            open: async () => openCampaignBrowser(kind)
        });
        if (!ok) allOk = false;
    }
    return allOk;
}
