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
        revert: (_event, _target, win) => win.revert(),
        deny: (_event, _target, win) => win.deny()
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
        const request = opts.request ?? null;
        delete opts.request;
        // A GM may be looking at their own cleanup for this actor and a player's
        // request for it at the same time; they are different windows.
        opts.id = request
            ? `${MODULE.ID}-cleanup-${request.type ?? 'plan'}-${actor.id}-${request.requesterId}`
            : `${MODULE.ID}-cleanup-${actor.id}`;
        super(opts);

        this.actor = actor;
        this.request = request;
        this.scan = null;
        this.result = null;
        this.restored = null;
        this._busy = false;
        this._answered = false;

        if (!request) CleanupWindow.open.set(actor.id, this);
    }

    /** Reviewing somebody else's proposal rather than making one. */
    get isApproval() {
        return Boolean(this.request);
    }

    /**
     * An undo somebody else asked for.
     *
     * All-or-nothing, unlike a cleanup request: there is one snapshot and it
     * goes back whole, so there is nothing here for the GM to tick.
     */
    get isRestoreRequest() {
        return this.request?.type === 'restore';
    }

    /**
     * A player proposing rather than writing.
     *
     * The same reasoning as the ammunition request: Foundry would allow it —
     * they own the character and could do every one of these edits by hand — but
     * consolidating coins, rewriting item provenance and deleting rows in one
     * click is a table decision, not a permissions one.
     */
    get needsApproval() {
        return !game.user.isGM && !this.isApproval;
    }

    get title() {
        if (this.isApproval) return `Cleanup request: ${this.actor?.name ?? ''}`;
        return `Cleanup: ${this.actor?.name ?? ''}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        // Scanned once, then held. Re-scanning on every render would fight the
        // ticks the GM has just set; `apply()` clears it deliberately so the
        // next render picks up what the writes just made possible.
        //
        // Skipped entirely after a restore. A plan rendered under a restore
        // notice reads as part of it, and the scan is expensive enough that
        // building one nobody asked for is worth avoiding on its own.
        if (!this.scan && !this.restored && !this.isRestoreRequest) {
            this.scan = await scanActor(this.actor);
            // An approval shows the request, not the GM's own idea of what this
            // sheet needs. Everything the player did not ask for is dropped, so
            // the question stays "do I allow this?" rather than becoming a
            // second cleanup the GM has to re-read.
            if (this.isApproval) this._narrowToRequest();
        }

        const bodyContent = await renderTemplate(CLEANUP_TEMPLATE, {
            actorName: this.actor?.name ?? '',
            scan: this.scan,
            result: this.result,
            hasWork: this._hasWork(),
            // A receipt can carry a fresh plan underneath it — linking items is
            // what reveals which of them are duplicates — so "nothing to do
            // here" is its own state rather than the absence of a result.
            restored: this.restored,
            isRestoreRequest: this.isRestoreRequest,
            // Nothing to put back: the GM may have already restored it, or run a
            // fresh merge, either of which replaces the snapshot the player saw.
            restoreGone: this.isRestoreRequest && !getSnapshot(this.actor),
            // A player asks; a GM does. Same section, same place, different verb.
            restoreLabel: game.user.isGM ? 'Restore' : 'Request Restore',
            restoreIcon: game.user.isGM ? 'fa-rotate-left' : 'fa-paper-plane',
            isTidy: !this.result && !this.restored && !this._hasWork() && !this.isApproval,
            // The request resolved to nothing on this side. Rare, but reachable:
            // the sheet may have moved on, or the GM's compendium access may
            // resolve an item differently than the player's did. "This actor is
            // tidy" would be the wrong thing to say about somebody else's ask.
            requestEmpty: this.isApproval && !this.isRestoreRequest && !this.result && !this._hasWork(),
            isApproval: this.isApproval,
            needsApproval: this.needsApproval,
            // The undo writes to the actor, so it stays with the GM. Inside an
            // approval it would also be answering a different question than the
            // one on screen.
            // Owners see the undo too. A player's button asks rather than acts,
            // for the same reason their Apply does.
            canRevert: !this.isApproval,
            requesterName: this.request?.requesterName ?? '',
            busy: this._busy,
            // Read at render time rather than carried on the scan: the receipt
            // clears the scan, and that is exactly the moment an undo is most
            // likely to be wanted.
            snapshot: getSnapshot(this.actor)
        });

        // Buttons live in the tool footer, not in bodyContent. That is where the
        // base renders them, and Blacksmith's own button classes are theme-aware
        // — the same reason the body consumes tool tokens rather than colours.
        // Keyed on whether work remains, not on whether something has been
        // applied: after the first pass there is usually a second one to offer,
        // and closing the window would be the wrong default.
        //
        // A restore is the exception and says so explicitly. It would fall out
        // of `_hasWork()` anyway, but only because the scan is skipped — and a
        // footer whose buttons depend on a scan not having happened is one
        // refactor away from offering Cancel and Apply under a restore notice
        // again, which is exactly the confusion this avoids.
        const done = Boolean(this.restored)
            || (this.isRestoreRequest ? !getSnapshot(this.actor) : !this._hasWork());
        const label = this.needsApproval ? 'Request Approval' : 'Apply';
        const icon = this.needsApproval ? 'fa-paper-plane' : 'fa-broom';

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
                    <button type="button" class="blacksmith-window-btn-secondary" data-action="${this.isApproval ? 'deny' : 'cancel'}">
                        <i class="fa-solid ${this.isApproval ? 'fa-ban' : (this.result ? 'fa-check' : 'fa-xmark')}"></i>
                        ${this.isApproval ? 'Deny' : (this.result ? 'Close' : 'Cancel')}
                    </button>
                    <button type="button" class="blacksmith-window-btn-primary" data-action="apply" ${this._busy ? 'disabled' : ''}>
                        <i class="fa-solid ${this.isApproval ? 'fa-check' : icon}"></i>
                        ${this._busy ? 'Working…' : (this.isApproval ? 'Approve' : label)}
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

    /**
     * Keep only what the request asked for.
     *
     * Filtering rather than merely unticking: an approval that also shows the
     * rows the player declined invites the GM to accept things nobody asked
     * for, which turns "approve this request" into "do a cleanup" — and the
     * player would have no idea it happened.
     */
    _narrowToRequest() {
        const wanted = new Set(this.request?.linkItemIds ?? []);
        const merges = new Set((this.request?.merges ?? []).map(group => group.survivorId));

        if (!this.request?.currency && this.scan.currency) this.scan.currency.changed = false;

        this.scan.links.ready = this.scan.links.ready.filter(row => wanted.has(row.id));
        this.scan.links.review = this.scan.links.review.filter(row => wanted.has(row.id));
        // Review rows arrive ticked here, unlike on the player's own plan. The
        // player already made that judgement; the GM is confirming it, and an
        // unticked row would read as rejected before they had even looked.
        for (const row of this.scan.links.review) row.selected = true;
        this.scan.candidateCount = this.scan.links.ready.length + this.scan.links.review.length;

        this.scan.duplicates.groups = this.scan.duplicates.groups
            .filter(group => merges.has(group.survivorId));
        // Not part of the question being asked.
        this.scan.duplicates.blocked = [];
        this.scan.links.unmatched = [];
        this.scan.mergeNeedsRescan = false;
    }

    /** Hand the plan to a GM instead of writing it. */
    async _sendForApproval(plan) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        if (!game.users.some(user => user.isGM && user.active)) {
            showSquireToast('No GM is online', {
                subtitle: 'Cleanup needs GM approval.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return;
        }

        this._busy = true;
        await this.render(false);
        try {
            // The actor's UUID, not its id: a token actor on a scene is not
            // reachable through game.actors.get(). A Map does not survive a
            // socket, so the uuid lookup travels as pairs.
            await socket.executeAsGM('requestCleanupApproval', {
                actorUuid: this.actor.uuid,
                actorName: this.actor.name,
                requesterId: game.user.id,
                requesterName: game.user.name,
                currency: plan.currency,
                linkItemIds: plan.linkItemIds,
                linkUuids: [...plan.linkUuids.entries()],
                merges: plan.merges
            });
            showSquireToast('Sent to the GM', {
                subtitle: 'Waiting for approval.',
                icon: 'fa-solid fa-hourglass-half',
                stackKey: `squire-cleanup-request-${this.actor.id}`
            });
            await this.close();
        } catch (error) {
            console.error(`${MODULE.ID}: cleanup request failed:`, error);
            ui.notifications.error('The cleanup request could not be sent. See the console for details.');
        } finally {
            this._busy = false;
        }
    }

    /** Tell the requester what happened. Never throws into the caller. */
    async _notifyRequester(approved, summary = '') {
        if (!this.isApproval || this._answered) return;
        this._answered = true;
        try {
            await game.modules.get(MODULE.ID)?.socket?.executeAsUser(
                'cleanupRequestResolved',
                this.request.requesterId,
                { approved, actorName: this.actor?.name ?? '', summary }
            );
        } catch (error) {
            console.error(`${MODULE.ID}: could not notify the requester:`, error);
        }
    }

    /** Player side: ask a GM to put the last merge back. */
    async _requestRestore() {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        if (!game.users.some(user => user.isGM && user.active)) {
            showSquireToast('No GM is online', {
                subtitle: 'Restoring needs GM approval.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return;
        }

        this._busy = true;
        await this.render(false);
        try {
            await socket.executeAsGM('requestCleanupApproval', {
                type: 'restore',
                actorUuid: this.actor.uuid,
                actorName: this.actor.name,
                requesterId: game.user.id,
                requesterName: game.user.name
            });
            showSquireToast('Sent to the GM', {
                subtitle: 'Waiting for approval to restore.',
                icon: 'fa-solid fa-hourglass-half',
                stackKey: `squire-restore-request-${this.actor.id}`
            });
            await this.close();
        } catch (error) {
            console.error(`${MODULE.ID}: restore request failed:`, error);
            ui.notifications.error('The restore request could not be sent. See the console for details.');
        } finally {
            this._busy = false;
        }
    }

    /** GM side: carry out a restore somebody asked for. */
    async _approveRestore() {
        this._busy = true;
        await this.render(false);
        try {
            const { restored, failed } = await revertMerge(this.actor);
            if (failed) {
                ui.notifications.error('The merge could not be undone. See the console for details.');
                return;
            }
            await this._notifyRequester(true, `${restored} ${restored === 1 ? 'stack' : 'stacks'} restored`);
            await this.close();
        } finally {
            this._busy = false;
        }
    }

    /** The GM says no. */
    async deny() {
        await this._notifyRequester(false);
        await this.close();
    }

    async apply() {
        if (this._busy) return;
        if (this.isRestoreRequest) return this._approveRestore();

        const plan = this._collectPlan();
        if (!plan.currency && !plan.linkItemIds.length && !plan.merges.length) {
            showSquireToast('Nothing selected.', { icon: 'fa-solid fa-circle-info' });
            return;
        }

        if (this.needsApproval) {
            await this._sendForApproval(plan);
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
                // The one thing the receipt cannot take from the plan: whether
                // the conversion actually held its value. The plan is what was
                // promised, this is what the sheet said afterwards.
                currencyMismatch: applied.currencyMismatch,
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
            // Loud, and separate from the receipt: the receipt can be scrolled
            // past, and an approval closes the window entirely.
            if (applied.currencyMismatch) {
                showSquireToast('Consolidating the coins changed their total value, so they were put back. See the console.', {
                    icon: 'fa-solid fa-triangle-exclamation',
                    color: '#e05c3c'
                });
            }

            if (this.isApproval) {
                const parts = [];
                if (applied.currency) parts.push('coins consolidated');
                // Said to the player too. An approval closes this window, so the
                // receipt they never see is the only other place it appears.
                if (applied.currencyMismatch) parts.push('coins left as they were');
                if (applied.linked) parts.push(`${applied.linked} linked`);
                if (applied.merged) parts.push(`${applied.merged} merged`);
                await this._notifyRequester(true, parts.join(', '));
                await this.close();
                return;
            }

            // Re-scanned rather than cleared. Writing the source links is what
            // lets duplicates be recognised at all, so the work this pass just
            // unlocked is offered here instead of behind a close and reopen.
            this.scan = await scanActor(this.actor);
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
        if (!game.user.isGM) return this._requestRestore();

        this._busy = true;
        await this.render(false);

        try {
            const { restored, failed } = await revertMerge(this.actor);
            if (!failed) this.restored = { count: restored };
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
        // Closing an approval without answering is a refusal. The player is
        // waiting either way, and silence is the one outcome that helps nobody.
        if (this.isApproval && !this._answered) this._notifyRequester(false);

        // Identity-checked: a rebuild may already have replaced this entry.
        if (CleanupWindow.open.get(this.actor?.id) === this) {
            CleanupWindow.open.delete(this.actor.id);
        }
        super._onClose?.(options);
    }
}

/**
 * GM side: review a player's request.
 *
 * The same window, deliberately. The GM should be looking at exactly what the
 * player looked at, with the same rows and the same wording, rather than at a
 * summary that could quietly disagree with it.
 */
export async function openCleanupApproval(request) {
    const actor = await fromUuid(request?.actorUuid);
    if (!actor) {
        ui.notifications.warn(`Squire: ${request?.actorName ?? 'that character'} could not be found, so the cleanup request was dropped.`);
        return null;
    }

    // The request may have outlived the ownership that justified it — a
    // character reassigned between the send and the answer.
    const requester = game.users.get(request.requesterId);
    if (requester && !actor.testUserPermission(requester, 'OWNER')) {
        ui.notifications.warn(`Squire: ${request.requesterName} no longer owns ${actor.name}, so the cleanup request was dropped.`);
        return null;
    }

    const win = new CleanupWindow(actor, { request });
    await win.render(true);
    return win;
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
