import { MODULE } from './const.js';
import { showSquireToast } from './helpers.js';
import { itemAcquired } from './manager-cards.js';

/**
 * The single door for content entering a character sheet from outside a character.
 *
 * "Acquisition" is compendium content, a world item, or an Item Directory entry
 * landing on an actor. It is deliberately NOT actor-to-actor transfer: a transfer
 * moves an existing document between two sheets, has a source to validate a
 * quantity against and to roll back, and carries its own policy axis
 * (`transfersGMApproves`) with its own approval cards. Routing transfers through
 * here as well would make a player on the `request` rung need two approvals for
 * one handoff.
 *
 * Every acquisition path in Squire calls `acquire()`. That is the point of the
 * file: the policy used to live in the compendium search panel, which meant it
 * governed the one path that happened to be ours and none of the others — a
 * player could drag the same document out of Blacksmith's compendium palette,
 * the Items sidebar, or another sheet and drop it on the tray with nothing
 * checked but "is an actor selected". A gate beside an open wall.
 */

const ACCESS_LEVELS = ['none', 'request', 'add'];

export class ItemAcquisition {

    /* ---------------------------------------------------------------- */
    /*  Policy                                                           */
    /* ---------------------------------------------------------------- */

    /**
     * What this user may do with outside content, from the
     * `compendiumPlayerAccess` world setting.
     *
     *   none     nothing — acquisitions are refused, and the tray's link to
     *            Blacksmith's compendium palette is not offered
     *   request  acquiring asks the GM, who approves or denies
     *   add      acquiring happens immediately
     *
     * The GM is always on the top rung.
     *
     * There was a fourth, `browse` — search and read, no acquiring — from when
     * Squire carried its own compendium column and could therefore offer looking
     * without adding. Blacksmith's palette is a player's to open from their own
     * menubar, so Squire has nothing to permit there and `browse` had become
     * `none` with a longer name. migrateCompendiumAccessSetting() folds it.
     *
     * @returns {'none'|'request'|'add'}
     */
    static getAccessLevel() {
        if (game.user.isGM) return 'add';
        try {
            const level = game.settings.get(MODULE.ID, 'compendiumPlayerAccess');
            return ACCESS_LEVELS.includes(level) ? level : 'none';
        } catch (error) {
            // Setting not registered yet — nothing sensible to do this early.
            return 'none';
        }
    }

    /**
     * Whether the actor can receive content at all, independent of who is
     * asking: a pack actor or one in a locked collection can't be written to,
     * and an actor you don't own isn't yours to modify.
     *
     * Ownership is checked against the TARGET, which is what makes a party-card
     * drop onto someone else's character refuse here with a toast rather than
     * further downstream as a raw Foundry permission error. Requesting onto an
     * actor you don't own is refused for the same reason: the GM side of the
     * request flow re-checks the requester's ownership at approval time, so a
     * request that could only ever be denied is better refused at the click.
     */
    static _isEligibleActor(actor) {
        if (!actor) return false;
        if (actor.pack || (actor.collection && actor.collection.locked)) return false;
        return actor.isOwner;
    }

    /**
     * Whether this user may put outside content on the actor directly.
     *
     * Acquisition is an additive, explicitly-invoked mutation of actor content,
     * which is the narrow case Squire permits. Off for players by default
     * because who may pull arbitrary content onto a sheet is a table policy
     * question, not a UI one.
     */
    static canAdd(actor) {
        return this._isEligibleActor(actor) && this.getAccessLevel() === 'add';
    }

    /** Whether this user's acquisitions go to the GM as a request instead. */
    static canRequest(actor) {
        return this._isEligibleActor(actor) && this.getAccessLevel() === 'request';
    }

    /* ---------------------------------------------------------------- */
    /*  Describing what is being acquired                                */
    /* ---------------------------------------------------------------- */

    /**
     * Icon and title for the item type. Lived twice, once on PanelManager and
     * once on PartyPanel, drifting independently; now the acquisition card is
     * built in one place and so are these.
     */
    static getIcon(type) {
        switch (type) {
            case 'spell': return 'fa-solid fa-stars';
            case 'weapon': return 'fa-solid fa-swords';
            case 'feat': return 'fa-solid fa-sparkles';
            default: return 'fa-solid fa-backpack';
        }
    }

    static getTitle(type) {
        switch (type) {
            case 'spell': return 'New Spell Added';
            case 'weapon': return 'New Weapon Added';
            case 'feat': return 'New Feature Added';
            default: return 'New Item Added';
        }
    }

    /**
     * Where a uuid came from, in words, for the request card.
     *
     * Best-effort and display-only: a request card that says "from the Player's
     * Handbook" helps a GM decide, and one that says nothing is still a valid
     * request. Never used to make a decision.
     */
    static describeSource(uuid) {
        const text = String(uuid ?? '');
        if (!text.startsWith('Compendium.')) return 'World Items';
        const parts = text.split('.');
        const collection = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : '';
        const pack = game.packs?.get(collection);
        return pack?.metadata?.label || collection || 'Compendium';
    }

    /**
     * Normalize whatever a caller has into the entry shape the request card and
     * the toasts want. Accepts a document or a plain object; a caller that
     * already has a richer entry (the compendium search panel has the source
     * label the row was rendered with) passes it through in `extra`.
     */
    static describe(doc, extra = {}) {
        const uuid = extra.uuid ?? doc?.uuid ?? '';
        return {
            uuid,
            name: extra.name ?? doc?.name ?? 'Unknown',
            img: extra.img ?? doc?.img ?? 'icons/svg/item-bag.svg',
            type: extra.type ?? doc?.type ?? '',
            sourceLabel: extra.sourceLabel || this.describeSource(uuid)
        };
    }

    /* ---------------------------------------------------------------- */
    /*  Acquiring                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Put outside content on an actor, subject to policy.
     *
     * This is the only function any acquisition path should call. It resolves
     * the document, applies the rung, and either performs the add, sends the GM
     * a request, or refuses with a toast that says which.
     *
     * @param {Actor} actor            who is receiving it
     * @param {string|object} source   a uuid, a document, or an entry from the
     *                                 compendium search panel
     * @param {object} [options]
     * @param {number} [options.quantity=1]
     * @returns {Promise<{outcome: 'added'|'requested'|'refused'|'failed', item: Item|null}>}
     */
    static async acquire(actor, source, options = {}) {
        const { quantity = 1 } = options;

        // Resolve first, so a refusal can still name what was refused and a
        // request card can carry the name, image, and type that were on screen.
        let doc = null;
        if (typeof source === 'string') {
            doc = await fromUuid(source);
        } else if (source?.uuid && typeof source.toObject !== 'function') {
            doc = await fromUuid(source.uuid);
        } else {
            doc = source ?? null;
        }

        const entry = this.describe(doc, typeof source === 'object' && source ? source : {});

        if (!doc) {
            showSquireToast('Could not load that item.', {
                subtitle: 'Its source may be unavailable.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return { outcome: 'failed', item: null };
        }

        if (this.canAdd(actor)) {
            const item = await this._performAdd(actor, doc, quantity);
            return { outcome: item ? 'added' : 'failed', item };
        }

        if (this.canRequest(actor)) {
            // Dynamic so the request utility can import this module statically
            // for the approval-side add without the two forming a cycle.
            const { CompendiumRequestUtils } = await import('./compendium-request-utils.js');
            const sent = await CompendiumRequestUtils.sendRequest(actor, entry);
            return { outcome: sent ? 'requested' : 'failed', item: null };
        }

        this._refuse(actor, entry);
        return { outcome: 'refused', item: null };
    }

    /**
     * Say no in the terms of whichever rule was hit, because "nothing happened"
     * is the same on screen whether the GM turned the feature off or the player
     * is holding the wrong sheet.
     */
    static _refuse(actor, entry) {
        const subtitle = !this._isEligibleActor(actor)
            ? `You don't have permission to modify ${actor?.name ?? 'that character'}.`
            : 'Your GM has turned off adding content to sheets.';

        showSquireToast(`Can't add ${entry.name}`, {
            subtitle,
            icon: 'fa-solid fa-ban',
            color: '#e0a53c',
            image: entry.img,
            stackKey: `squire-acquire-refused-${entry.uuid || entry.name}`
        });
    }

    /**
     * The add itself, plus everything that used to be copy-pasted around it:
     * the newly-added highlight, the toast, and the chat record.
     *
     * Assumes policy has already passed — `acquire()` and the GM-side approval
     * are the only callers, and both check first.
     */
    static async _performAdd(actor, doc, quantity) {
        try {
            const data = doc.toObject();
            delete data._id;
            // Only stackables carry a quantity; writing one onto a spell or
            // feature would invent a field the sheet doesn't model.
            if (data.system?.quantity !== undefined) {
                data.system.quantity = Math.max(1, Math.floor(Number(quantity)) || 1);
            }

            const [created] = await actor.createEmbeddedDocuments('Item', [data]);
            if (!created) return null;

            // Drives the tray's "just arrived" highlight.
            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager;
            panelManager?.newlyAddedItems?.set(created.id, Date.now());

            showSquireToast(`Added ${created.name}`, {
                subtitle: actor.name,
                icon: 'fa-solid fa-circle-plus',
                image: created.img,
                stackKey: `squire-add-${created.id}`
            });

            // A GM adding to a sheet does not need a card telling them what they
            // just did, and a GM stocking a character out of the compendium
            // search does it many times in a row — a card each would bury the
            // log. A player acquisition is the one worth a record, which is also
            // the one this whole file exists to govern.
            if (!game.user.isGM) {
                await itemAcquired({
                    icon: this.getIcon(created.type),
                    title: this.getTitle(created.type),
                    actorName: actor.name,
                    itemName: created.name,
                    userName: game.user.name,
                    speaker: ChatMessage.getSpeaker({ actor })
                });
            }

            return created;
        } catch (error) {
            console.error(`${MODULE.ID}: Error acquiring item:`, error);
            showSquireToast('Could not add that item.', {
                subtitle: 'See the console for details.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return null;
        }
    }

    /**
     * Policy-checked add by uuid, for the GM resolving an approved request.
     *
     * Separate from `acquire()` because the GM has already made the decision:
     * routing the approval back through `acquire()` would re-read the rung and,
     * on a `request` world, answer "send a request" — which is where the
     * approval came from.
     *
     * @returns {Promise<Item|null>}
     */
    static async addToActor(actor, uuid, quantity = 1) {
        if (!this.canAdd(actor)) return null;

        const doc = await fromUuid(uuid);
        if (!doc) {
            showSquireToast('Could not load that item.', {
                subtitle: 'Its compendium may be unavailable.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return null;
        }

        return this._performAdd(actor, doc, quantity);
    }
}
