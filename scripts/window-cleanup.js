import { MODULE } from './const.js';
import { renderTemplate, showSquireToast } from './helpers.js';
import { scanActor, applyCleanup } from './utility-cleanup.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithToolWindowBaseV2 is unavailable for CleanupWindow');
}

const CLEANUP_TEMPLATE = `modules/${MODULE.ID}/templates/window-cleanup.hbs`;

/**
 * Character sheet cleanup — the report, and the confirmation.
 *
 * Deliberately a preview rather than a yes/no prompt. "Are you sure?" on a bulk
 * operation is the weakest useful safeguard: nobody can evaluate a question that
 * does not say what will happen. This shows the actual plan — these coins become
 * those coins, these fourteen items would be linked to these compendium entries
 * — and every row can be unticked.
 *
 * Exact matches arrive ticked; anything looser arrives unticked. A `startsWith`
 * hit on "Potion of Healing" against "Potion of Healing (Greater)" is precisely
 * the case that needs a person, so the default is to not act on it.
 *
 * After applying, the same window becomes the report of what was done rather
 * than closing behind a toast — a bulk write deserves a receipt.
 */
export class CleanupWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['squire-cleanup-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Cleanup', resizable: false, minimizable: true },
            windowSizeConstraints: {
                minWidth: 420,
                maxWidth: 680,
                maxHeight: 'calc(100vh - 16px)'
            },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'squire-cleanup'
        }
    );

    static ACTION_HANDLERS = {
        cancel: (_event, _target, win) => win.close(),
        apply: (_event, _target, win) => win.apply()
    };

    /**
     * One window per actor.
     *
     * Assigned in the constructor rather than read from
     * `foundry.applications.instances`, which is not written until the first
     * render completes — two rapid clicks would both miss it and both build a
     * window.
     */
    static open = new Map();

    constructor(actor, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = `${MODULE.ID}-cleanup-${actor.id}`;
        super(opts);

        this.actor = actor;
        this.scan = null;
        this.result = null;
        this._busy = false;

        CleanupWindow.open.set(actor.id, this);
    }

    get title() {
        return `Cleanup: ${this.actor?.name ?? ''}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        // Scanned once per open. Re-scanning on every render would fight the
        // ticks the GM has just set.
        if (!this.scan && !this.result) this.scan = await scanActor(this.actor);

        const bodyContent = await renderTemplate(CLEANUP_TEMPLATE, {
            actorName: this.actor?.name ?? '',
            scan: this.scan,
            result: this.result,
            hasWork: this._hasWork(),
            busy: this._busy
        });

        return { appId: this.id, bodyContent };
    }

    _hasWork() {
        if (!this.scan) return false;
        return Boolean(this.scan.currency?.changed) || this.scan.links.candidates.length > 0;
    }

    /** What the GM has left ticked. */
    _collectPlan() {
        const root = this.element;
        const currency = root?.querySelector('[data-cleanup="currency"]')?.checked ?? false;

        const linkItemIds = [];
        const linkUuids = new Map();
        for (const box of root?.querySelectorAll('[data-cleanup="link"]') ?? []) {
            if (!box.checked) continue;
            const { itemId, uuid } = box.dataset;
            if (!itemId || !uuid) continue;
            linkItemIds.push(itemId);
            linkUuids.set(itemId, uuid);
        }

        return { currency, linkItemIds, linkUuids };
    }

    async apply() {
        if (this._busy) return;

        const plan = this._collectPlan();
        if (!plan.currency && !plan.linkItemIds.length) {
            showSquireToast('Nothing selected.', { icon: 'fa-solid fa-circle-info' });
            return;
        }

        this._busy = true;
        await this.render(false);

        try {
            const applied = await applyCleanup(this.actor, plan);

            // The window becomes the receipt. A toast alone would be the only
            // record of a bulk write, and it disappears.
            this.result = {
                currency: applied.currency,
                currencyBefore: this.scan?.currency?.before ?? null,
                currencyAfter: this.scan?.currency?.after ?? null,
                denominations: this.scan?.currency?.denominations ?? [],
                linked: applied.linked,
                failed: applied.failed
            };
            this.scan = null;
        } finally {
            this._busy = false;
            await this.render(false);
        }
    }

    _onClose(options) {
        // Identity-checked: a rebuild may already have replaced this entry.
        if (CleanupWindow.open.get(this.actor?.id) === this) {
            CleanupWindow.open.delete(this.actor.id);
        }
        super._onClose?.(options);
    }
}

/** Open, or focus what is already open for this actor. */
export async function openCleanupWindow(actor) {
    if (!actor) return null;

    const existing = CleanupWindow.open.get(actor.id);
    if (existing) {
        (existing.bringToFront ?? existing.bringToTop)?.call(existing);
        if (existing.minimized) existing.maximize?.();
        return existing;
    }

    const win = new CleanupWindow(actor);
    await win.render(true);
    return win;
}
