// ============================================================================
// CARDS A PLAYER CANNOT POST FOR THEMSELVES
// ============================================================================
//
// A player cannot whisper on somebody else's behalf, and cannot rewrite a
// message a GM authored. Both come up constantly in the transfer flow: the
// receiver's Accept has to retire a request card the GM wrote, and a completion
// notice has to reach the sender, the receiver and the GMs at once.
//
// So the GM posts it. That was ten socketlib ops; it is three here.
//
// WHY THREE AND NOT TEN. Six of those ops were the same op — "post this card,
// as you, to these people" — differing only in which card builder they called
// and which fields they forwarded. A dispatch table over a whitelist of card
// names says that once. The other two are not card writes at all: one rewrites
// an existing message and one deletes it, and those keep their own ops because
// they take a message rather than a card.
//
// WHAT THIS DOES NOT PRETEND TO BE. `gmRequest` hands the handler a verified
// caller, and these handlers barely use it: the worst a crafted call achieves
// is a chat card describing something that did not happen, which is graffiti
// rather than theft. The ONE place identity does real work is the item move,
// in `manager-transfer-request.js`, and that is where the checks are. The value
// here is dropping socketlib, not authorisation — and saying so plainly is
// better than checks that imply a guarantee they do not give.
//
// The card whitelist matters for a smaller reason: it is what stops the op
// being a general "call any function on the GM's client with my arguments",
// which is what a dispatch table without one would be.
// ============================================================================

import { MODULE } from './const.js';
import { getBlacksmith } from './helpers.js';
import {
    transferRequestGMApproval, transferRequestReceiver, transferComplete,
    transferRejected, transferExpired, applyRetire
} from './manager-cards.js';

// `utility-statblock.js` and `compendium-request-utils.js` are imported inside
// their handlers rather than here, and deliberately: both of them call
// `postGmCard` from this file, so a static import in either direction closes a
// cycle. A cycle is survivable only while nothing touches the binding during
// module evaluation, which is a condition nobody reading either file would
// know to preserve — and a failed evaluation is cached for the session, so the
// cost of getting it wrong is the whole module for that player.

const OP_POST = `${MODULE.ID}.postCard`;
const OP_RETIRE = `${MODULE.ID}.retireCard`;
const OP_DELETE_WAITING = `${MODULE.ID}.deleteWaitingCard`;

/**
 * Which sentence an outcome card should carry.
 *
 * Every one of these messages is whispered to a single audience, so the
 * perspective is a property of the message rather than of whoever reads it —
 * which is why the cards need no per-reader gating and cannot show anybody an
 * empty body the way the old template's else-less branches could.
 */
function perspective(data) {
    if (data.isTransferSender) return 'sender';
    if (data.isTransferReceiver) return 'receiver';
    if (data.isGMNotification) return 'gm';
    return 'neutral';
}

/**
 * Whichever list the caller supplied.
 *
 * An earlier version keyed off `isTransferSender`, so a caller that sent
 * `receiverId` without that flag produced `undefined` — and an undefined
 * whisper posts the card to the WHOLE TABLE, which is what a player rejecting
 * a transfer was doing.
 */
const audience = data => data.receiverIds ?? (data.receiverId ? [data.receiverId] : undefined);

/** The shared shape of every transfer outcome card. */
const outcome = data => ({
    perspective: perspective(data),
    sourceActorName: data.sourceActorName,
    targetActorName: data.targetActorName,
    itemName: data.itemName,
    quantity: data.quantity,
    hasQuantity: data.hasQuantity,
    isPlural: data.isPlural,
    whisper: audience(data),
    speaker: ChatMessage.getSpeaker({ user: game.user })
});

/**
 * THE WHITELIST. A name a caller may ask for, and what it does.
 *
 * Nothing else is reachable. Adding an entry here is the deliberate act of
 * saying "any client may ask a GM to post this".
 */
const CARDS = {
    transferRequest: async (data) => {
        // Which card this is decides which buttons it carries, so the two are
        // chosen together rather than by flags read back out of a single shared
        // composition.
        const post = data.isGMApproval ? transferRequestGMApproval : transferRequestReceiver;
        await post({
            sourceActorName: data.sourceActorName,
            targetActorName: data.targetActorName,
            itemName: data.itemName,
            quantity: data.quantity,
            hasQuantity: data.hasQuantity,
            isPlural: data.isPlural,
            transferId: data.transferId,
            speaker: { alias: 'System' },
            whisper: data.receiverIds,
            flags: {
                transferId: data.transferId,
                type: 'transferRequest',
                isTransferReceiver: data.isTransferReceiver || false,
                isTransferSender: data.isTransferSender || false,
                isGMApproval: data.isGMApproval || false,
                data: data.transferData,
                targetUsers: data.receiverIds
            }
        });
    },

    transferComplete: async (data) => transferComplete(outcome(data)),

    transferRejected: async (data) => transferRejected({
        ...outcome(data),
        // Literal, not prose: this arrives in a payload, and anything a client
        // can put in a payload is untrusted text.
        reason: data.reason ? { literal: String(data.reason) } : null
    }),

    transferExpired: async (data) => transferExpired(outcome(data)),

    ammoRequest: async (data) => {
        const { StatblockUtility } = await import('./utility-statblock.js');
        return StatblockUtility.createRequestChat(data);
    },

    compendiumRequest: async (data) => {
        const { CompendiumRequestUtils } = await import('./compendium-request-utils.js');
        return CompendiumRequestUtils.createRequestChat(data);
    }
};

/**
 * Register the ops. On EVERY client, not only a GM's: any client can become the
 * answering GM, and one that registered nothing answers UNKNOWN_OP.
 */
export function registerGmCards() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.registerOp) return false;

    blacksmith.gmRequest.registerOp({
        op: OP_POST,
        module: MODULE.ID,
        handler: async (payload) => {
            const write = CARDS[payload?.card];
            if (!write) return { ok: false, code: 'UNKNOWN_CARD' };

            await write(payload);
            return { ok: true };
        }
    });

    blacksmith.gmRequest.registerOp({
        op: OP_RETIRE,
        module: MODULE.ID,
        handler: async ({ messageId, text, tone, icon }) => {
            const message = game.messages.get(messageId);
            if (!message) return { ok: false, code: 'NO_MESSAGE' };

            await applyRetire(message, { text, tone, icon });
            return { ok: true };
        }
    });

    blacksmith.gmRequest.registerOp({
        op: OP_DELETE_WAITING,
        module: MODULE.ID,
        handler: async ({ transferId }) => {
            const waiting = game.messages.find(message =>
                message.getFlag(MODULE.ID, 'transferId') === transferId
                && message.getFlag(MODULE.ID, 'isTransferSender') === true);

            if (waiting) await waiting.delete();
            return { ok: true };
        }
    });

    return true;
}

/**
 * Ask a GM to post one of the whitelisted cards.
 *
 * Silent on failure by design. Every caller is already telling the user what
 * happened through the thing the card is ABOUT — a toast, a moved item, a
 * retired request — and a second "the notice about it did not post" would be
 * noise about the wrong subject. Failures go to the console.
 */
export async function postGmCard(card, data = {}) {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) return false;

    const result = await blacksmith.gmRequest.request(OP_POST, { ...data, card }, { timeout: 30000 });
    if (!result?.ok) console.warn(`Coffee Pub Squire | The ${card} card was not posted:`, result);
    return !!result?.ok;
}

/** Ask a GM to stamp a band on a card they authored. */
export async function retireGmCard(messageId, { text, tone, icon } = {}) {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) return false;

    const result = await blacksmith.gmRequest.request(
        OP_RETIRE, { messageId, text, tone, icon }, { timeout: 30000 });
    if (!result?.ok) console.warn('Coffee Pub Squire | A card could not be retired:', result);
    return !!result?.ok;
}

/** Ask a GM to take away the sender's "waiting" notice, now that it is answered. */
export async function deleteWaitingCard(transferId) {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) return false;

    const result = await blacksmith.gmRequest.request(
        OP_DELETE_WAITING, { transferId }, { timeout: 30000 });
    return !!result?.ok;
}
