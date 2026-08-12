import { MODULE } from './const.js';
import { getTokenDisplayName, renderTemplate } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithToolWindowBaseV2 is unavailable for TransferToolWindow');
}

const TRANSFER_TOOL_TEMPLATE = `modules/${MODULE.ID}/templates/window-transfer-tool.hbs`;
const DEFAULT_IMAGE = 'icons/svg/mystery-man.svg';

/**
 * One entry per actor, keyed on uuid.
 *
 * Not `id`: every unlinked token derived from the same prototype carries the
 * BASE actor's id, so an id-keyed set collapses a dozen distinct Cultists into
 * one. A linked actor with two tokens does share a uuid, and should collapse.
 */
function uniqueTokensByActor(tokens = []) {
    const seen = new Set();
    return tokens.filter(token => {
        const key = token?.actor?.uuid;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function actorRecipients(sourceActor) {
    const canReceive = (actor) => game.user.isGM
        ? ['character', 'npc', 'monster'].includes(actor.type)
        : (actor.hasPlayerOwner && actor.type === 'character');

    // Kept as tokens rather than mapped straight to actors: the token carries
    // the name the GM sees on the canvas, and a synthetic actor's `name` is the
    // prototype's ("Cultist") for every one of them.
    const tokens = uniqueTokensByActor(
        (canvas.tokens?.placeables || []).filter(token => token?.actor && canReceive(token.actor))
    );

    // Party first, then everyone else. The list renders a header where each
    // group's first member appears and does not reorder, so the sort here is
    // what produces the sections.
    //
    // Grouped on `type` alone, deliberately: the row already prints
    // "Character" or "NPC", and gating Party on hasPlayerOwner as well puts a
    // row labelled Character under the NPCS heading whenever a PC has no player
    // assigned — which reads as a sorting bug rather than a rule.
    const isParty = (actor) => actor.type === 'character';
    const ordered = [...tokens].sort((a, b) => {
        const aParty = isParty(a.actor) ? 0 : 1;
        const bParty = isParty(b.actor) ? 0 : 1;
        if (aParty !== bParty) return aParty - bParty;
        return getTokenDisplayName(a, a.actor).localeCompare(getTokenDisplayName(b, b.actor));
    });

    return ordered.map(token => {
        const actor = token.actor;
        // Compared on uuid, not id. Unlinked tokens sharing a prototype share
        // the base actor's id, so an id test disables every Cultist on the
        // scene rather than the one the item came from.
        const isSource = !!sourceActor?.uuid && actor.uuid === sourceActor.uuid;
        return {
            id: actor.uuid || actor.id,
            uuid: actor.uuid,
            name: getTokenDisplayName(token, actor),
            img: token.document?.texture?.src || actor.img || DEFAULT_IMAGE,
            type: actor.type === 'character' ? 'Character' : (actor.type === 'npc' ? 'NPC' : 'Monster'),
            group: isParty(actor) ? 'Party' : 'NPCs',
            disabled: isSource,
            disabledReason: isSource ? 'Cannot transfer an item to its source.' : '',
            metadata: { actor, token }
        };
    });
}

export class TransferToolWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            // squire-tool-window carries the shared height chain; without it the
            // body cannot scroll and the window grows to fill the screen instead.
            classes: ['squire-tool-window', 'squire-transfer-tool-window'],
            // An explicit height rather than auto: a resizable window needs a
            // height it can be dragged from, and auto plus a max-height lets the
            // cap silently refuse the drag. A crowded scene would otherwise open
            // a recipient list as tall as the monitor.
            position: { width: 460, height: 540 },
            window: {
                title: 'Transfer',
                resizable: true,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 380,
                minHeight: 300,
                maxWidth: 700,
                maxHeight: 'calc(100vh - 80px)'
            },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'squire-transfer-tool'
        }
    );

    static ACTION_HANDLERS = {
        cancel: (_event, _target, win) => win.close(),
        submit: (_event, _target, win) => win.submit()
    };

    constructor({
        mode = 'item',
        sourceActor = null,
        item = null,
        currency = null,
        targetActor = null,
        requestedQuantity = 1,
        onSubmit = null,
        onClose = null,
        ...options
    } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id || `${MODULE.ID}-transfer-${foundry.utils.randomID()}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, TransferToolWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, TransferToolWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.mode = ['approval', 'currency'].includes(mode) ? mode : 'item';
        this.sourceActor = sourceActor;
        this.item = item;
        this.currency = currency;
        this.targetActor = targetActor;
        this.requestedQuantity = Math.max(1, Number(requestedQuantity) || 1);
        this.onSubmit = onSubmit;
        this.onClose = onClose;
        this._busy = false;
        this._closedNotified = false;

        const blacksmith = getBlacksmith();
        if (!blacksmith?.entityList?.create || !blacksmith?.quantitySplit?.create) {
            throw new Error('Coffee Pub Squire | Blacksmith entityList and quantitySplit APIs are required');
        }

        // Party and NPCs are built as two lists rather than one list with
        // internal group headings, so each gets a real section of its own —
        // the same separation the Loot window gives Items and Currency.
        //
        // They share one `inputName`, which is what keeps the choice single:
        // radios group by name across the whole document, so ticking an NPC
        // clears the party selection. Each list only knows its own entities,
        // so a list whose row is not the checked one reports no selection and
        // `recipient` takes the first list that has one.
        this.recipientLists = [];
        if (!this.targetActor && this.mode !== 'approval') {
            const inputName = `${this.id}-recipient`;
            const recipients = actorRecipients(this.sourceActor);
            const groups = [
                { key: 'party', label: 'Party', icon: 'fa-solid fa-users' },
                { key: 'npcs', label: 'NPCs', icon: 'fa-solid fa-masks-theater' }
            ];

            for (const group of groups) {
                const entities = recipients.filter(entity => entity.group === group.label);
                if (!entities.length) continue;
                this.recipientLists.push({
                    ...group,
                    count: entities.length,
                    list: blacksmith.entityList.create({
                        // `group` is dropped on the way in: the list emits a
                        // heading wherever a group starts, and every row in this
                        // list shares one group, so it would print a second
                        // heading directly under the section heading.
                        entities: entities.map(({ group: _group, ...entity }) => entity),
                        mode: 'single',
                        inputName,
                        onSelectionChange: () => this._syncSubmitState()
                    })
                });
            }
        }

        const maxQuantity = this.mode === 'currency'
            ? Math.max(1, Number(this.currency?.available) || 1)
            : Math.max(1, Number(this.item?.system?.quantity) || 1);
        if ((this.mode === 'item' || this.mode === 'currency') && maxQuantity > 1) {
            this.quantitySplit = blacksmith.quantitySplit.create({
                max: maxQuantity,
                value: 1,
                inputName: `${this.id}-quantity`
            });
        }
    }

    get title() {
        if (this.mode === 'approval') return 'Item Transfer Request';
        if (this.mode === 'currency') return `Send ${this.currency?.name ?? 'Coins'}`;
        return 'Transfer Item';
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    get recipient() {
        if (this.targetActor) return { actor: this.targetActor };
        for (const group of this.recipientLists ?? []) {
            const selected = group.list?.getSelection?.()[0]?.metadata;
            if (selected) return selected;
        }
        return null;
    }

    get canSubmit() {
        return !this._busy && (this.mode === 'approval' || Boolean(this.recipient));
    }

    async getData() {
        const subject = this.mode === 'currency'
            ? { name: this.currency?.name, img: this.currency?.img }
            : this.item;
        const fixedRecipient = this.targetActor
            ? {
                name: this.targetActor.name,
                img: this.targetActor.img || DEFAULT_IMAGE,
                type: this.targetActor.type === 'character' ? 'Character' : 'NPC'
            }
            : null;
        const bodyContent = await renderTemplate(TRANSFER_TOOL_TEMPLATE, {
            mode: this.mode,
            isApproval: this.mode === 'approval',
            isCurrency: this.mode === 'currency',
            subjectName: subject?.name || 'Unknown',
            subjectImg: subject?.img || subject?.src || DEFAULT_IMAGE,
            sourceName: this.sourceActor?.name || game.user?.name || '',
            fixedRecipient,
            requestedQuantity: this.requestedQuantity,
            recipientGroups: (this.recipientLists ?? []).map(group => ({
                label: group.label,
                icon: group.icon,
                count: group.count,
                html: group.list?.html || ''
            })),
            // Nobody eligible is on the scene: said once, rather than repeated
            // as an empty state inside each of two sections.
            noRecipients: !this.targetActor && this.mode !== 'approval' && !(this.recipientLists ?? []).length,
            quantityHtml: this.quantitySplit?.html || ''
        });

        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
                    <i class="fa-solid fa-xmark"></i> ${this.mode === 'approval' ? 'Decline' : 'Cancel'}
                </button>`,
            toolFooterRight: `
                <button type="button" class="blacksmith-window-btn-primary" data-action="submit" ${this.canSubmit ? '' : 'disabled'}>
                    <i class="fa-solid ${this.mode === 'approval' ? 'fa-check' : (this.mode === 'currency' ? 'fa-coins' : 'fa-right-left')}"></i>
                    ${this.mode === 'approval' ? 'Accept' : (this.mode === 'currency' ? 'Send' : 'Transfer')}
                </button>`
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        // Attached to the window root rather than to each section: the lists
        // share one input name, so either root sees every radio in the group.
        for (const group of this.recipientLists ?? []) group.list?.attach?.(this.element);
        this.quantitySplit?.attach?.(this.element);
        this._syncSubmitState();
    }

    _syncSubmitState() {
        const button = this.element?.querySelector?.('[data-action="submit"]');
        if (button) button.disabled = !this.canSubmit;
    }

    async submit() {
        if (!this.canSubmit) return;

        const recipient = this.recipient;
        const quantity = this.quantitySplit?.getValue?.() || 1;
        this._busy = true;
        this._syncSubmitState();
        this.element?.classList?.add('squire-transfer-busy');

        try {
            const result = await this.onSubmit?.({
                recipient,
                targetActor: recipient?.actor || null,
                targetUser: recipient?.user || null,
                quantity
            });
            if (result === false) return;
            await this.close();
        } catch (error) {
            console.error('Coffee Pub Squire | Transfer Tool submission failed:', error);
            ui.notifications.error(error?.message || 'The transfer could not be completed.');
        } finally {
            this._busy = false;
            this.element?.classList?.remove('squire-transfer-busy');
            this._syncSubmitState();
        }
    }

    _notifyClosed() {
        if (this._closedNotified) return;
        this._closedNotified = true;
        this.onClose?.();
    }

    _onClose(options) {
        for (const group of this.recipientLists ?? []) group.list?.destroy?.();
        this.quantitySplit?.destroy?.();
        this._notifyClosed();
        super._onClose?.(options);
    }
}

export async function openItemTransferTool(options = {}) {
    const app = new TransferToolWindow({ ...options, mode: 'item' });
    await app.render(true);
    return app;
}

/** Hand coins to another character. Same picker, same quantity split. */
export async function openCurrencyTransferTool({ denomination, denominationName, denominationImg, available, ...options } = {}) {
    const app = new TransferToolWindow({
        ...options,
        mode: 'currency',
        currency: { key: denomination, name: denominationName, img: denominationImg, available }
    });
    await app.render(true);
    return app;
}

export async function showTransferApprovalTool(options = {}) {
    return new Promise(async (resolve, reject) => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        try {
            const app = new TransferToolWindow({
                ...options,
                mode: 'approval',
                onSubmit: async () => finish(true),
                onClose: () => finish(false)
            });
            await app.render(true);
        } catch (error) {
            reject(error);
        }
    });
}

export async function selectTransferQuantityWithTool({ sourceActor, targetActor, item }) {
    return new Promise(async (resolve, reject) => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        try {
            await openItemTransferTool({
                sourceActor,
                targetActor,
                item,
                onSubmit: async ({ quantity }) => finish(quantity),
                onClose: () => finish(0)
            });
        } catch (error) {
            reject(error);
        }
    });
}
