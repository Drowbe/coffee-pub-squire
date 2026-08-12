import { MODULE } from './const.js';
import { renderTemplate, showSquireToast } from './helpers.js';
import { scanActor, applyCleanup } from './utility-cleanup.js';
import { revertMerge, getSnapshot } from './utility-cleanup-merge.js';

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
            // squire-tool-window carries the shared height chain; without it the
            // body cannot scroll and the window grows to fill the screen instead.
            classes: ['squire-tool-window', 'squire-cleanup-window'],
            // An explicit height rather than auto: a resizable window needs a
            // height it can be dragged from, and auto plus a max-height lets the
            // cap silently refuse the drag. A sheet with forty unlinked items
            // would otherwise open as tall as the monitor.
            position: { width: 560, height: 620 },
            window: { title: 'Cleanup', resizable: true, minimizable: true },
            windowSizeConstraints: {
                minWidth: 420,
                minHeight: 320,
                maxWidth: 820,
                maxHeight: 'calc(100vh - 80px)'
            },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'squire-cleanup'
        }
    );

    static ACTION_HANDLERS = {
        cancel: (_event, _target, win) => win.close(),
        apply: (_event, _target, win) => win.apply(),
        revert: (_event, _target, win) => win.revert()
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
            busy: this._busy,
            // Read at render time rather than carried on the scan: the receipt
            // clears the scan, and that is exactly the moment an undo is most
            // likely to be wanted.
            snapshot: getSnapshot(this.actor)
        });

        // Buttons live in the tool footer, not in bodyContent. That is where the
        // base renders them, and Blacksmith's own button classes are theme-aware
        // — the same reason the body consumes tool tokens rather than colours.
        const done = Boolean(this.result) || !this._hasWork();

        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterRight: done
                ? `
                    <button type="button" class="blacksmith-window-btn-primary" data-action="cancel">
                        <i class="fa-solid fa-check"></i> Close
                    </button>`
                : `
                    <button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
                        <i class="fa-solid fa-xmark"></i> Cancel
                    </button>
                    <button type="button" class="blacksmith-window-btn-primary" data-action="apply" ${this._busy ? 'disabled' : ''}>
                        <i class="fa-solid fa-broom"></i> ${this._busy ? 'Working…' : 'Apply'}
                    </button>`
        };
    }

    _hasWork() {
        if (!this.scan) return false;
        return Boolean(this.scan.currency?.changed)
            || this.scan.candidateCount > 0
            || this.scan.duplicates.groups.length > 0;
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

        const merges = [];
        for (const box of root?.querySelectorAll('[data-cleanup="merge"]') ?? []) {
            if (!box.checked) continue;
            const { survivorId, loserIds } = box.dataset;
            if (!survivorId || !loserIds) continue;
            merges.push({ survivorId, loserIds: loserIds.split(',').filter(Boolean) });
        }

        return { currency, linkItemIds, linkUuids, merges };
    }

    async apply() {
        if (this._busy) return;

        const plan = this._collectPlan();
        if (!plan.currency && !plan.linkItemIds.length && !plan.merges.length) {
            showSquireToast('Nothing selected.', { icon: 'fa-solid fa-circle-info' });
            return;
        }

        this._busy = true;
        await this.render(false);

        try {
            const applied = await applyCleanup(this.actor, plan);

            // The window becomes the receipt. A toast alone would be the only
            // record of a bulk write, and it disappears.
            // The receipt reuses the scan's own coin strips and total, so what
            // it reports is literally the plan that was shown, not a second
            // calculation that could disagree with it.
            const currency = this.scan?.currency ?? null;
            this.result = {
                currency: applied.currency,
                beforeCoins: currency?.beforeCoins ?? [],
                afterCoins: currency?.afterCoins ?? [],
                coinCountBefore: currency?.coinCountBefore ?? 0,
                coinCountAfter: currency?.coinCountAfter ?? 0,
                totalLabel: currency?.totalLabel ?? '',
                linked: applied.linked,
                merged: applied.merged,
                removed: applied.removed,
                failed: applied.failed
            };
            this.scan = null;
        } finally {
            this._busy = false;
            await this.render(false);
        }
    }

    /**
     * Put the last merge back.
     *
     * Re-scans afterwards rather than restoring the previous view: the sheet has
     * changed, and showing the plan that produced the merge would invite running
     * it again by accident.
     */
    async revert() {
        if (this._busy) return;
        this._busy = true;
        await this.render(false);

        try {
            const { restored, failed } = await revertMerge(this.actor);
            if (failed) {
                showSquireToast('The merge could not be undone. See the console for details.', {
                    icon: 'fa-solid fa-triangle-exclamation',
                    color: '#e05c3c'
                });
            } else {
                showSquireToast(`Restored ${restored} ${restored === 1 ? 'stack' : 'stacks'}.`, {
                    icon: 'fa-solid fa-rotate-left'
                });
            }
        } finally {
            this.result = null;
            this.scan = null;
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
