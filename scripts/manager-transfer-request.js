// ============================================================================
// GM-MEDIATED ITEM TRANSFER
// ============================================================================
//
// Moving an item between two characters when the player cannot write to both.
//
// This used to be a socketlib op, and it was the module's one real security
// hole. `executeAsGM` runs the handler on a GM's client with a payload the
// caller wrote, and the handler received nothing but that payload:
//
//     socket.register("executeItemTransfer", async (data) => {
//         const sourceActor = game.actors.get(data.sourceActorId);   // whose?
//
// Nothing established WHO was asking, so nothing could check that they were
// entitled to give the thing away. A crafted call moved any item off any actor
// in the world, and the GM's client did it obligingly.
//
// `gmRequest` closes that by handing the handler a SECOND argument the caller
// could not write: the user Foundry says made the request.
//
//     payload   what the client claims. Untrusted. Ids only.
//     user      who Foundry says asked. The only trustworthy thing here.
//
// ---------------------------------------------------------------------------
// TWO PEOPLE CAN START A TRANSFER, AND THEY NEED DIFFERENT RULES
// ---------------------------------------------------------------------------
//
//   GIVE     the sender hands something over. They OWN THE SOURCE, and that is
//            the whole check: you may give away what is yours.
//
//   ACCEPT   the receiver takes up an offer. They own the TARGET and not the
//            source, so they are legitimately asking to move an item off
//            somebody else's character — which is indistinguishable from theft
//            unless something proves the offer was really made.
//
// So an offer is RECORDED, and it is recorded ON THE SOURCE ACTOR. That
// placement is the entire point and the reason the two obvious alternatives
// were rejected:
//
//   - The request CHAT MESSAGE cannot be the record. Players may create chat
//     messages and set flags on them, so a receiver could write their own offer.
//   - A flag on the TARGET actor cannot be the record either, for the same
//     reason one step along: the receiver owns the target.
//
// A flag on the source actor is the one thing in this exchange the receiver
// cannot forge. The accept handler reads the offer from there, checks it names
// this receiver and this item, takes the QUANTITY FROM THE OFFER rather than
// from the payload, and clears it on the way out so it cannot be replayed.
//
// See `manager-build-approval.js`, the same shape for a question rather than an
// action, and Blacksmith's `documentation/api/api-gm-request.md`. Blacksmith
// supplies the verified identity and nothing else: permission checks and domain
// rules are deliberately the calling module's, which is why they are all here.
// ============================================================================

import { MODULE } from './const.js';
import { getBlacksmith, getTransferBlocker, showSquireToast } from './helpers.js';
import { transferFailed, name, sentence } from './manager-cards.js';

/** Op names. Module-prefixed, as `gmRequest` requires. */
const OP_GIVE = `${MODULE.ID}.transferGive`;
const OP_OFFER = `${MODULE.ID}.transferOffer`;
const OP_ACCEPT = `${MODULE.ID}.transferAccept`;
const OP_WITHDRAW = `${MODULE.ID}.transferWithdraw`;

/** Where offers live, on the SOURCE actor. See the header. */
const OFFERS_FLAG = 'pendingTransfers';

const readOffers = actor => actor?.getFlag(MODULE.ID, OFFERS_FLAG) ?? {};

/**
 * Everyone who should be told that a transfer failed.
 *
 * The owners of both characters, plus whoever asked. Derived from the documents
 * and the verified caller rather than read out of the payload: the old version
 * took `sourceUserId` and `targetUserId` from the client, which let a caller
 * choose its own audience for a failure notice and bought nothing.
 */
function interestedUsers(sourceActor, targetActor, user) {
    const owners = actor => game.users.filter(candidate =>
        candidate.active && !candidate.isGM && actor?.testUserPermission(candidate, 'OWNER'));

    return [...new Set([
        ...owners(sourceActor).map(candidate => candidate.id),
        ...owners(targetActor).map(candidate => candidate.id),
        user?.id
    ])].filter(Boolean);
}

/** How long an offer stands, from the same setting the cards expire on. */
function offerTimeoutMs() {
    try {
        return (Number(game.settings.get(MODULE.ID, 'transferTimeout')) || 300) * 1000;
    } catch (error) {
        return 300000;
    }
}

/**
 * The move itself, once somebody has been found entitled to ask for it.
 *
 * Everything here is checked against the LIVE documents. A caller that reports
 * an item as non-stackable, or asks for more than there is, is answered by what
 * the item actually says rather than by what the payload claims about it.
 */
async function performTransfer({ sourceActor, targetActor, itemId, quantity, itemName, user }) {
    const sourceItem = sourceActor.items.get(itemId);
    if (!sourceItem) {
        await transferFailed({
            reason: sentence(name(itemName || 'Unknown Item'),
                             ' no longer exists and cannot be transferred.'),
            speaker: { alias: 'System' },
            whisper: interestedUsers(sourceActor, targetActor, user)
        });
        return { ok: false, code: 'NO_ITEM' };
    }

    // A packed container cannot be handed over: dnd5e keeps containment on the
    // child as `system.container`, so the copy made below lands with an id its
    // contents never point at and they stay orphaned on the source. The panels
    // refuse this before the quantity dialog; this is the backstop for anything
    // that reaches the op.
    const blocker = getTransferBlocker(sourceItem, sourceActor);
    if (blocker) {
        // Rebuilt from the blocker's parts rather than using its ready-made
        // `message`: that string has the item's name baked into it, and a name
        // reaching a card has to arrive as a literal rather than as prose.
        const packed = blocker.contentCount;
        await transferFailed({
            reason: sentence(name(sourceItem.name), ' still holds ',
                             `${packed} item${packed === 1 ? '' : 's'}`,
                             '. Unpack it before handing it over.'),
            speaker: { alias: 'System' },
            whisper: interestedUsers(sourceActor, targetActor, user)
        });
        return { ok: false, code: 'PACKED_CONTAINER' };
    }

    const stackable = sourceItem.system?.quantity != null;
    const available = stackable ? sourceItem.system.quantity : 1;
    const wanted = Math.floor(Number(quantity) || 0);

    if (wanted < 1 || wanted > available) {
        await transferFailed({
            reason: sentence('Insufficient quantity. Only ', `${available} `,
                             name(`${sourceItem.name}${available !== 1 ? 's' : ''}`),
                             ` available, but ${wanted} requested.`),
            speaker: { alias: 'System' },
            whisper: interestedUsers(sourceActor, targetActor, user)
        });
        return { ok: false, code: 'NOT_ENOUGH', available };
    }

    const itemData = sourceItem.toObject();
    if (stackable) itemData.system.quantity = wanted;

    const [created] = await targetActor.createEmbeddedDocuments('Item', [itemData]);

    if (stackable && wanted < available) {
        await sourceItem.update({ 'system.quantity': available - wanted });
    } else {
        await sourceItem.delete();
    }

    // So the receiving tray can mark it new.
    const panels = game.modules.get(MODULE.ID)?.api?.PanelManager;
    if (panels && created) panels.newlyAddedItems.set(created.id, Date.now());

    return { ok: true, itemId: created?.id };
}

/**
 * UUIDS, not ids. An unlinked token's actor shares the base actor's id and only
 * its uuid is unique, so `game.actors.get(id)` on a token actor silently
 * returns the prototype rather than the one on the canvas. That was a second
 * bug living inside the first.
 */
async function resolvePair(payload) {
    const sourceActor = await fromUuid(payload?.sourceActorUuid);
    const targetActor = await fromUuid(payload?.targetActorUuid);
    return { sourceActor, targetActor };
}

/**
 * Register the ops. On EVERY client, not only a GM's: any client can become the
 * answering GM, and one that registered nothing answers UNKNOWN_OP.
 */
export function registerItemTransfer() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.registerOp) return false;

    // GIVE — the sender hands something over.
    blacksmith.gmRequest.registerOp({
        op: OP_GIVE,
        module: MODULE.ID,
        handler: async (payload, user) => {
            const { sourceActor, targetActor } = await resolvePair(payload);
            if (!sourceActor || !targetActor) return { ok: false, code: 'NO_ACTOR' };

            // You may give away what is yours.
            if (!sourceActor.testUserPermission(user, 'OWNER')) {
                return { ok: false, code: 'NOT_YOURS' };
            }

            return performTransfer({
                sourceActor, targetActor,
                itemId: payload?.sourceItemId,
                quantity: payload?.quantity,
                itemName: payload?.itemName,
                user
            });
        }
    });

    // OFFER — the sender records that an offer was made, so the receiver's
    // acceptance can later be proved rather than trusted.
    blacksmith.gmRequest.registerOp({
        op: OP_OFFER,
        module: MODULE.ID,
        handler: async (payload, user) => {
            const { sourceActor, targetActor } = await resolvePair(payload);
            if (!sourceActor || !targetActor) return { ok: false, code: 'NO_ACTOR' };

            if (!sourceActor.testUserPermission(user, 'OWNER')) {
                return { ok: false, code: 'NOT_YOURS' };
            }

            const transferId = String(payload?.transferId || '');
            if (!transferId) return { ok: false, code: 'NO_TRANSFER_ID' };

            const item = sourceActor.items.get(payload?.sourceItemId);
            if (!item) return { ok: false, code: 'NO_ITEM' };

            // Stale offers are swept on write rather than on a timer. Nothing
            // else ever visits this flag, so the moment it is being rewritten
            // is the only moment it is certain to be looked at.
            const cutoff = Date.now() - offerTimeoutMs();
            const offers = Object.fromEntries(
                Object.entries(readOffers(sourceActor)).filter(([, offer]) => offer?.at > cutoff));

            offers[transferId] = {
                targetActorUuid: targetActor.uuid,
                itemId: item.id,
                itemName: item.name,
                quantity: Math.max(1, Math.floor(Number(payload?.quantity) || 1)),
                offeredBy: user.id,
                at: Date.now()
            };

            await sourceActor.setFlag(MODULE.ID, OFFERS_FLAG, offers);
            return { ok: true };
        }
    });

    // ACCEPT — the receiver takes up an offer they did not write.
    blacksmith.gmRequest.registerOp({
        op: OP_ACCEPT,
        module: MODULE.ID,
        handler: async (payload, user) => {
            const { sourceActor, targetActor } = await resolvePair(payload);
            if (!sourceActor || !targetActor) return { ok: false, code: 'NO_ACTOR' };

            // The receiver must own what is receiving. They must NOT be
            // required to own the source — that is the whole case this exists
            // for — which is why the offer below does the rest of the work.
            if (!targetActor.testUserPermission(user, 'OWNER')) {
                return { ok: false, code: 'NOT_YOURS' };
            }

            const offers = readOffers(sourceActor);
            const offer = offers[String(payload?.transferId || '')];
            if (!offer) return { ok: false, code: 'NO_OFFER' };

            // The offer has to have been made to THIS character.
            if (offer.targetActorUuid !== targetActor.uuid) {
                return { ok: false, code: 'NO_OFFER' };
            }

            if (!(offer.at > Date.now() - offerTimeoutMs())) {
                await clearOffer(sourceActor, payload?.transferId);
                return { ok: false, code: 'EXPIRED' };
            }

            // FROM THE OFFER, not from the payload. The receiver may say which
            // offer they are taking up and nothing else about it — otherwise
            // accepting an offer of one arrow would move the whole quiver.
            const result = await performTransfer({
                sourceActor, targetActor,
                itemId: offer.itemId,
                quantity: offer.quantity,
                itemName: offer.itemName,
                user
            });

            // Cleared either way: a failed accept has still been answered, and
            // an offer left standing could be replayed.
            await clearOffer(sourceActor, payload?.transferId);
            return result;
        }
    });

    // WITHDRAW — a rejection or an expiry, from either side of the exchange.
    blacksmith.gmRequest.registerOp({
        op: OP_WITHDRAW,
        module: MODULE.ID,
        handler: async (payload, user) => {
            const { sourceActor, targetActor } = await resolvePair(payload);
            if (!sourceActor) return { ok: false, code: 'NO_ACTOR' };

            const entitled = sourceActor.testUserPermission(user, 'OWNER')
                || targetActor?.testUserPermission(user, 'OWNER');
            if (!entitled) return { ok: false, code: 'NOT_YOURS' };

            await clearOffer(sourceActor, payload?.transferId);
            return { ok: true };
        }
    });

    return true;
}

/** Drop one offer. GM-side only; the callers above are already on a GM. */
async function clearOffer(sourceActor, transferId) {
    const offers = { ...readOffers(sourceActor) };
    if (!(String(transferId) in offers)) return;
    delete offers[String(transferId)];
    await sourceActor.setFlag(MODULE.ID, OFFERS_FLAG, offers);
}

/** Why a refusal happened, in words a player can act on. */
const REASONS = {
    NOT_YOURS: 'That character is not yours.',
    NO_ACTOR: 'One of the characters could not be found.',
    NO_ITEM: 'That item no longer exists.',
    NO_OFFER: 'That offer is no longer open.',
    EXPIRED: 'That offer has expired.',
    PACKED_CONTAINER: 'Unpack the container before handing it over.',
    NOT_ENOUGH: 'There is not enough of it left.',
    NO_ACTIVE_GM: 'No GM is online to move it.',
    TIMEOUT: 'The GM did not answer in time.',
    UNKNOWN_OP: 'The GM is running an older version of Squire.',
    IDENTITY_UNVERIFIED: 'Foundry could not confirm who was asking.'
};

/** Failures the handler already whispered as a card do not also need a toast. */
const REPORTED_IN_CHAT = ['NO_ITEM', 'PACKED_CONTAINER', 'NOT_ENOUGH'];

async function ask(op, payload, { itemName, quiet = false } = {}) {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) {
        showSquireToast('Cannot hand that over', {
            subtitle: 'Blacksmith is too old to move items through the GM.',
            icon: 'fa-solid fa-triangle-exclamation',
            color: '#c04a3a'
        });
        return false;
    }

    const result = await blacksmith.gmRequest.request(op, payload, { timeout: 120000 });
    if (result?.ok) return true;

    if (!quiet && !REPORTED_IN_CHAT.includes(result?.code)) {
        showSquireToast(itemName || 'That item', {
            subtitle: REASONS[result?.code] ?? 'The transfer could not be completed.',
            icon: 'fa-solid fa-triangle-exclamation',
            color: '#c04a3a'
        });
    }

    return false;
}

/** Hand something over now. The caller must own the source. */
export async function requestItemTransfer({ sourceActor, targetActor, item, quantity, hasQuantity }) {
    return ask(OP_GIVE, {
        // No user id. The envelope carries a verified one; putting a second,
        // claimed one in the payload is exactly the step that makes it forgeable.
        sourceActorUuid: sourceActor?.uuid,
        targetActorUuid: targetActor?.uuid,
        sourceItemId: item?.id,
        itemName: item?.name,
        quantity: hasQuantity ? quantity : 1
    }, { itemName: item?.name });
}

/** Record an offer, so the receiver's acceptance can be proved later. */
export async function offerItemTransfer({ transferId, sourceActor, targetActor, item, quantity }) {
    return ask(OP_OFFER, {
        transferId,
        sourceActorUuid: sourceActor?.uuid,
        targetActorUuid: targetActor?.uuid,
        sourceItemId: item?.id,
        quantity
    }, { itemName: item?.name });
}

/** Take up an offer. The caller must own the target; the offer proves the rest. */
export async function acceptItemTransfer({ transferId, sourceActor, targetActor, itemName }) {
    return ask(OP_ACCEPT, {
        transferId,
        sourceActorUuid: sourceActor?.uuid,
        targetActorUuid: targetActor?.uuid
    }, { itemName });
}

/** Take an offer off the table — a rejection, or an expiry. Never nags. */
export async function withdrawItemTransfer({ transferId, sourceActor, targetActor }) {
    return ask(OP_WITHDRAW, {
        transferId,
        sourceActorUuid: sourceActor?.uuid,
        targetActorUuid: targetActor?.uuid
    }, { quiet: true });
}
