// ==================================================================
// ===== SQUIRE CHAT CARDS ==========================================
// ==================================================================

/**
 * Every chat card Squire posts, composed as Blacksmith card parts.
 *
 * Squire does not write card HTML. Blacksmith owns the parts, the theme and the
 * card wrapper; this module owns only which parts a Squire card is made of and
 * what goes in them. It replaces `templates/chat-cards.hbs`, which was a fork of
 * Blacksmith's own `cards-common.hbs` that had drifted 231 lines away from it
 * while carrying a whole public half — planning, timers, loot, movement, leader
 * — that nothing in Squire had set for a long time.
 *
 * WHY WORLD NAMES GO THROUGH `literal`. Item and actor names are renamed by
 * users, so they are untrusted text. Interpolated raw into a card, an item
 * called `Ring of *Power*` italicises the rest of the sentence, and one holding
 * `@UUID[...]` or `[[/r 99d6]]` is obeyed by the enricher. A literal is escaped
 * and never read as marks or enricher syntax. It can still be bolded — `mark`
 * names a treatment rather than supplying markup, and Blacksmith puts the tags
 * around text it has already escaped — so the sentences read exactly as they
 * did when they were `<strong>{{itemName}}</strong>`.
 */

import { MODULE } from './const.js';
import { getBlacksmith } from './helpers.js';

// ==================================================================
// ===== PLUMBING ===================================================
// ==================================================================

/** Blacksmith's chat cards API, or null when Blacksmith is absent. */
function chatCards() {
    return getBlacksmith()?.chatCards ?? null;
}

/**
 * Post a card, or say why it could not be posted.
 *
 * Squire's cards report something that has already happened, so a missing
 * Blacksmith must not throw back into the transfer that is reporting itself —
 * the item has moved either way.
 */
async function post({ type, theme, parts, whisper, speaker, flags }) {
    const api = chatCards();
    if (!api) {
        console.error(`${MODULE.ID}: Blacksmith chat cards API unavailable — card "${type}" was not posted.`);
        return null;
    }
    return api.post({
        moduleId: MODULE.ID,
        type,
        ...(theme ? { theme } : {}),
        parts,
        ...(whisper ? { whisper } : {}),
        ...(speaker ? { speaker } : {}),
        ...(flags ? { flags } : {})
    });
}

// ==================================================================
// ===== TEXT =======================================================
// ==================================================================

/**
 * An untrusted world name, bolded the way the old template bolded it.
 *
 * Exported because failure reasons are assembled at their call sites, where the
 * documents are in hand, rather than reaching here as pre-built strings.
 */
export function name(text) {
    return { literal: String(text ?? ''), mark: 'strong' };
}

/**
 * The item as the sentences name it: "3 Arrows", or "Longsword".
 *
 * The plural `s` sits inside the literal so the bold covers it, exactly as
 * `<strong>{{itemName}}{{#if isPlural}}s{{/if}}</strong>` used to.
 */
function item({ itemName, quantity, hasQuantity, isPlural }) {
    const label = `${itemName ?? 'Unknown Item'}${isPlural ? 's' : ''}`;
    return hasQuantity ? [`${quantity} `, name(label)] : [name(label)];
}

/** Flatten segments into one text field, dropping the empty ones. */
export function sentence(...segments) {
    return segments.flat(Infinity).filter((segment) => segment !== '' && segment != null);
}

// ==================================================================
// ===== PART SHORTHANDS ============================================
// ==================================================================

const header = (icon, title) => ({ part: 'header', icon, title });

const prose = (...paragraphs) => ({
    part: 'prose',
    blocks: paragraphs.filter(Boolean).map((text) => ({ type: 'paragraph', text }))
});

/**
 * The trailing aside the cards used to render as an italic paragraph.
 * Returned as an array so a card can spread it and get nothing at all when
 * there is no aside to show.
 */
function note(text, icon = 'fa-solid fa-circle-info') {
    if (!text || (Array.isArray(text) && !text.length)) return [];
    return [{ part: 'notes', items: [{ icon, text }] }];
}

/**
 * A yes/no pair of buttons.
 *
 * The affirmative is `primary` and the negative `critical`, and the part places
 * the primary rightmost whatever order it is given in — so Approve/Deny and
 * Accept/Reject sit the same way round on every Squire card without each caller
 * having to remember which comes first.
 */
function choice(affirmative, negative) {
    return {
        part: 'actions',
        buttons: [
            { moduleId: MODULE.ID, ...affirmative, variant: 'primary' },
            { moduleId: MODULE.ID, ...negative, variant: 'critical' }
        ]
    };
}

// ==================================================================
// ===== RETIRING A CARD ============================================
// ==================================================================

/**
 * Replace a card's buttons with an outcome band, in place.
 *
 * These cards used to be deleted the moment they were answered, which left
 * whoever pressed the button looking at a gap and the log holding no record of
 * the decision. `update` rewrites the stored composition and the baked content
 * together, which is the reason to use it rather than writing the flag: the
 * baked HTML is what chat search, exports and any client without Blacksmith
 * actually show, so a flag-only write would leave live buttons in the archive
 * for good.
 *
 * A request card is normally authored by the GM — a player reaches one through
 * `executeAsGM` — so a player pressing Accept cannot update it directly. The
 * socket hop is that case, not an optimisation.
 */
export async function retireCard(message, { text, tone = 'positive', icon = null }) {
    const doc = (typeof message === 'string') ? game.messages?.get(message) : message;
    if (!doc) return null;

    if (!doc.canUserModify(game.user, 'update')) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (socket) await socket.executeAsGM('retireCardMessage', { messageId: doc.id, text, tone, icon });
        return null;
    }
    return applyRetire(doc, { text, tone, icon });
}

/**
 * The write itself, split out so the socket handler runs the same code as a GM
 * pressing the button rather than a second copy of it.
 */
export async function applyRetire(message, { text, tone = 'positive', icon = null }) {
    const api = chatCards();
    if (!api || !message) return null;

    const card = api.getCard(message);
    if (!card) return null;

    const parts = card.parts.filter((part) => part.part !== 'actions');
    parts.push({ part: 'band', text, tone, ...(icon ? { icon } : {}) });
    return api.update(message, { parts });
}

// ==================================================================
// ===== TRANSFERS ==================================================
// ==================================================================

/** Icon and title shared by every ordinary step of a transfer. */
const TRANSFER_ICON = 'fa-solid fa-people-arrows';
const TRANSFER_TITLE = 'Transfer Request';

/** Sender's copy: the request has gone out, and this is what it waits on. */
export function transferRequestSender({ itemName, quantity, hasQuantity, isPlural,
                                        targetActorName, waitingOn, whisper, speaker, flags }) {
    return post({
        type: 'transfer-request',
        theme: 'green',
        whisper,
        speaker,
        flags,
        parts: [
            header(TRANSFER_ICON, TRANSFER_TITLE),
            prose(sentence(
                'The request to send ',
                item({ itemName, quantity, hasQuantity, isPlural }),
                ' to ', name(targetActorName), ' has been sent.'
            )),
            ...note(waitingOn, 'fa-solid fa-hourglass-half')
        ]
    });
}

/** The GM's copy, with the buttons that decide whether it goes any further. */
export function transferRequestGMApproval({ sourceActorName, targetActorName, itemName,
                                            quantity, hasQuantity, isPlural, transferId,
                                            whisper, speaker, flags }) {
    return post({
        type: 'transfer-request',
        theme: 'green',
        whisper,
        speaker,
        flags,
        parts: [
            header('fa-solid fa-gavel', 'GM Approval Required'),
            prose(sentence(
                name(sourceActorName), ' wants to send ',
                item({ itemName, quantity, hasQuantity, isPlural }),
                ' to ', name(targetActorName), '.'
            )),
            choice(
                { action: 'transfer-approve', label: 'Approve', icon: 'fa-solid fa-circle-check', value: transferId },
                { action: 'transfer-deny', label: 'Deny', icon: 'fa-solid fa-circle-xmark', value: transferId }
            )
        ]
    });
}

/** The receiver's copy, with the buttons that accept or turn it down. */
export function transferRequestReceiver({ sourceActorName, targetActorName, itemName,
                                          quantity, hasQuantity, isPlural, transferId,
                                          whisper, speaker, flags }) {
    return post({
        type: 'transfer-request',
        theme: 'green',
        whisper,
        speaker,
        flags,
        parts: [
            header(TRANSFER_ICON, TRANSFER_TITLE),
            prose(sentence(
                name(sourceActorName), ' wants to send ',
                item({ itemName, quantity, hasQuantity, isPlural }),
                ' to ', name(targetActorName), '.'
            )),
            choice(
                { action: 'transfer-accept', label: 'Accept', icon: 'fa-solid fa-circle-check', value: transferId },
                { action: 'transfer-reject', label: 'Reject', icon: 'fa-solid fa-circle-xmark', value: transferId }
            )
        ]
    });
}

/**
 * The outcome cards below take a `perspective` rather than the three booleans
 * the template branched on.
 *
 * Each of these messages is whispered to exactly the audience its sentence is
 * written for — the sender gets one, the receiver another, the GMs a third — so
 * the card says one thing and every reader of it is the right reader. That is
 * also why none of them carries `readableBy`: the old template gated blocks on
 * `isTransferSender`/`isTransferReceiver` with no else branch, so a reader who
 * was neither saw a card with an empty body. One unconditional sentence per
 * audience removes that failure by construction rather than reproducing it.
 */
export function transferComplete({ perspective, sourceActorName, targetActorName, itemName,
                                   quantity, hasQuantity, isPlural, whisper, speaker, flags }) {
    const what = item({ itemName, quantity, hasQuantity, isPlural });
    const body = {
        sender: sentence('You have sent ', what, ' to ', name(targetActorName), '.'),
        receiver: sentence('You have received ', what, ' from ', name(sourceActorName), '.')
    }[perspective] ?? sentence(
        'The transfer of ', what, ' has been completed between ',
        name(sourceActorName), ' and ', name(targetActorName), '.'
    );

    return post({
        type: 'transfer-complete',
        whisper,
        speaker,
        flags,
        parts: [header('fa-solid fa-backpack', 'Transfer Complete'), prose(body)]
    });
}

export function transferRejected({ perspective, title = 'Transfer Rejected', sourceActorName,
                                   targetActorName, itemName, quantity, hasQuantity, isPlural,
                                   reason, whisper, speaker, flags }) {
    const what = item({ itemName, quantity, hasQuantity, isPlural });
    const body = {
        sender: sentence('Your transfer of ', what, ' to ', name(targetActorName), ' was rejected.'),
        receiver: sentence('You rejected the transfer of ', what, ' from ', name(sourceActorName), '.')
    }[perspective] ?? sentence('The transfer of ', what, ' was rejected.');

    return post({
        type: 'transfer-rejected',
        whisper,
        speaker,
        flags,
        parts: [
            header('fa-solid fa-times-circle', title),
            prose(body),
            ...note(reason, 'fa-solid fa-circle-xmark')
        ]
    });
}

/**
 * `reason` is segments rather than a string: every one of these sentences names
 * an item or an actor, and those are the names that must not reach the enricher.
 */
export function transferFailed({ reason, whisper, speaker }) {
    return post({
        type: 'transfer-failed',
        theme: 'red',
        whisper,
        speaker,
        parts: [
            header('fa-solid fa-exclamation-triangle', 'Transfer Failed'),
            prose(reason)
        ]
    });
}

export function transferExpired({ perspective, sourceActorName, targetActorName, itemName,
                                  quantity, hasQuantity, isPlural, whisper, speaker, flags }) {
    const what = item({ itemName, quantity, hasQuantity, isPlural });
    const body = {
        sender: sentence('Your transfer request to send ', what, ' to ', name(targetActorName), ' has expired.'),
        receiver: sentence('The transfer request to receive ', what, ' from ', name(sourceActorName), ' has expired.'),
        gm: sentence('The transfer request for ', what, ' between ', name(sourceActorName),
                     ' and ', name(targetActorName), ' has expired.')
    }[perspective] ?? 'The transfer request has expired and was automatically rejected.';

    return post({
        type: 'transfer-expired',
        theme: 'orange',
        whisper,
        speaker,
        flags,
        parts: [header('fa-solid fa-clock', 'Transfer Request Expired'), prose(body)]
    });
}

/** The GM put something on a sheet directly, with no request in between. */
export function transferByGM({ icon, title, itemName, targetActorName, speaker }) {
    return post({
        type: 'transfer-gm',
        speaker,
        parts: [
            header(icon, title),
            prose(sentence(
                'The GM added ', name(itemName), ' to ',
                name(`${targetActorName ?? 'the actor'}'s inventory`), '.'
            ))
        ]
    });
}

/** Something arrived on a sheet by being dropped on the Squire tray. */
export function itemReceived({ icon, title, actorName, itemName, speaker }) {
    return post({
        type: 'item-received',
        speaker,
        parts: [
            header(icon, title),
            prose(sentence(name(actorName), ' received ', name(itemName), ' via the Squire tray.'))
        ]
    });
}

// ==================================================================
// ===== AMMUNITION REQUESTS ========================================
// ==================================================================

export function ammoRequest({ requesterName, ammoLabel, weaponName, actorName, quantity,
                              whisper, speaker, flags }) {
    return post({
        type: 'ammo-request',
        theme: 'green',
        whisper,
        speaker,
        flags,
        parts: [
            header('fa-solid fa-quiver', 'Ammunition Request'),
            prose(sentence(
                name(requesterName), ' is out of ', name(ammoLabel), ' for ',
                name(weaponName), ' on ', name(actorName), '.'
            )),
            ...note(sentence('Approving adds ', String(quantity), '.'), 'fa-solid fa-circle-plus'),
            choice(
                { action: 'ammo-approve', label: 'Approve', icon: 'fa-solid fa-circle-check' },
                { action: 'ammo-deny', label: 'Deny', icon: 'fa-solid fa-circle-xmark' }
            )
        ]
    });
}

export function ammoApproved({ actorName, quantity, ammoLabel, whisper, speaker }) {
    return post({
        type: 'ammo-approved',
        whisper,
        speaker,
        parts: [
            header('fa-solid fa-circle-check', 'Request Approved'),
            prose(sentence(name(actorName), ' restocked ', String(quantity), ' ', name(ammoLabel), '.'))
        ]
    });
}

export function ammoDenied({ ammoLabel, whisper, speaker }) {
    return post({
        type: 'ammo-denied',
        whisper,
        speaker,
        parts: [
            header('fa-solid fa-circle-xmark', 'Request Denied'),
            prose(sentence('The GM declined the request for ', name(ammoLabel), '.'))
        ]
    });
}

export function ammoFailed({ reason, whisper, speaker }) {
    return post({
        type: 'ammo-failed',
        whisper,
        speaker,
        parts: [header('fa-solid fa-triangle-exclamation', 'Request Failed'), prose(reason)]
    });
}

// ==================================================================
// ===== COMPENDIUM REQUESTS ========================================
// ==================================================================

export function compendiumRequest({ requesterName, itemName, itemType, actorName, sourceLabel,
                                    whisper, speaker, flags }) {
    return post({
        type: 'compendium-request',
        theme: 'green',
        whisper,
        speaker,
        flags,
        parts: [
            header('fa-solid fa-book-open-cover', 'Compendium Request'),
            prose(sentence(
                name(requesterName), ' wants to add ', name(itemName),
                itemType ? [' (', { literal: String(itemType) }, ')'] : '',
                ' to ', name(actorName), '.'
            )),
            ...note(sourceLabel ? sentence('From ', { literal: String(sourceLabel) }, '.') : null,
                    'fa-solid fa-book'),
            choice(
                { action: 'compendium-approve', label: 'Approve', icon: 'fa-solid fa-circle-check' },
                { action: 'compendium-deny', label: 'Deny', icon: 'fa-solid fa-circle-xmark' }
            )
        ]
    });
}

export function compendiumApproved({ itemName, actorName, whisper, speaker }) {
    return post({
        type: 'compendium-approved',
        whisper,
        speaker,
        parts: [
            header('fa-solid fa-circle-check', 'Request Approved'),
            prose(sentence(name(itemName), ' was added to ', name(actorName), '.'))
        ]
    });
}

export function compendiumDenied({ itemName, actorName, whisper, speaker }) {
    return post({
        type: 'compendium-denied',
        theme: 'orange',
        whisper,
        speaker,
        parts: [
            header('fa-solid fa-circle-xmark', 'Request Denied'),
            prose(sentence('The GM declined to add ', name(itemName), ' to ', name(actorName), '.'))
        ]
    });
}

export function compendiumFailed({ reason, whisper, speaker }) {
    return post({
        type: 'compendium-failed',
        theme: 'red',
        whisper,
        speaker,
        parts: [header('fa-solid fa-exclamation-triangle', 'Request Failed'), prose(reason)]
    });
}
