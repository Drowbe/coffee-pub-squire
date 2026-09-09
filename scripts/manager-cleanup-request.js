// ============================================================================
// ASKING THE GM TO TIDY A SHEET
// ============================================================================
//
// A player on the approval rung cannot write the cleanup to their own sheet, so
// they ask. The GM gets the SAME window the player was looking at, with the same
// rows and the same wording, so the two are judging identical evidence rather
// than a summary and its source.
//
// THIS WAS TWO SOCKET OPS AND IS NOW ONE.
//
// The old shape was a push in each direction: `requestCleanupApproval` went
// player-to-GM, and `cleanupRequestResolved` came GM-to-player carrying the
// answer. That second one was the only call in the module that pushed to a
// specific player, and it was the single thing standing between Squire and
// dropping socketlib — `gmRequest` elects a GM and has no player-directed
// equivalent, by design.
//
// It did not need porting. It existed because the request was fire-and-forget:
// having thrown the question over the wall, the only way back was to throw the
// answer after it. `gmRequest.request()` RETURNS the handler's value to the
// asker, so the handler simply waits for the GM to decide and answers, and the
// player reads it as the return value of the call they made. The push, and the
// op it needed, are gone.
//
// The waiting is real — a GM may take minutes over this — so the timeout is
// long, and a timeout is reported as "not answered yet" rather than as a
// refusal. It is not a refusal: the window is still open on the GM's screen and
// they may yet approve it.
// ============================================================================

import { MODULE } from './const.js';
import { getBlacksmith, showSquireToast } from './helpers.js';

const OP = `${MODULE.ID}.cleanupApproval`;

/** Ten minutes. A sheet cleanup is a considered decision, not a reflex. */
const DECISION_TIMEOUT = 600000;

/**
 * Register the op. On EVERY client, not only a GM's: any client can become the
 * answering GM, and one that registered nothing answers UNKNOWN_OP.
 */
export function registerCleanupApproval() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.registerOp) return false;

    blacksmith.gmRequest.registerOp({
        op: OP,
        module: MODULE.ID,
        handler: async (payload, user) => {
            // The request may have outlived the ownership that justified it — a
            // character reassigned between the asking and the answering — and
            // the window checks that too. Checked here as well because this is
            // where the VERIFIED caller is: the window only knows the id the
            // payload claims.
            const actor = await fromUuid(payload?.actorUuid);
            if (!actor) return { ok: false, code: 'NO_ACTOR' };
            if (!actor.testUserPermission(user, 'OWNER')) return { ok: false, code: 'NOT_YOURS' };

            // Imported here rather than at the top: this module is loaded on
            // every client at startup, and the window pulls in Blacksmith's
            // base class, the scanner and the merge utilities behind it.
            const { openCleanupApproval } = await import('./window-cleanup.js');

            // Waits for the GM. Approve, Deny, and closing the window all
            // settle it — closing counts as a denial, because the player is
            // waiting either way and silence is the one outcome that helps
            // nobody.
            const answer = await openCleanupApproval({ ...payload, requesterId: user.id, requesterName: user.name });
            return { ok: true, ...answer };
        }
    });

    return true;
}

/**
 * Ask, wait, and say what came back.
 *
 * The toast lives here now rather than in a handler on the other side of a
 * socket, which is the whole benefit: the news is announced where the question
 * was asked, by the code that knows what was asked.
 */
export async function requestCleanupApproval(payload) {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) {
        showSquireToast('Cannot ask the GM', {
            subtitle: 'Blacksmith is too old to send approval requests.',
            icon: 'fa-solid fa-triangle-exclamation',
            color: '#e05c3c'
        });
        return false;
    }

    const actorName = payload?.actorName ?? 'that character';

    showSquireToast('Sent to the GM', {
        subtitle: 'Waiting for approval.',
        icon: 'fa-solid fa-hourglass-half',
        stackKey: `squire-cleanup-request-${payload?.actorUuid ?? actorName}`
    });

    const result = await blacksmith.gmRequest.request(OP, payload, { timeout: DECISION_TIMEOUT });

    // Still open on the GM's screen. Saying "declined" here would be a lie the
    // player could act on.
    if (result?.code === 'TIMEOUT') {
        showSquireToast(`Still waiting on the GM for ${actorName}`, {
            subtitle: 'No answer yet. Nothing has been changed.',
            icon: 'fa-solid fa-hourglass-half'
        });
        return false;
    }

    if (!result?.ok) {
        showSquireToast(`Cleanup could not be sent for ${actorName}`, {
            subtitle: result?.code === 'NO_ACTIVE_GM'
                ? 'No GM is online to approve it.'
                : 'The request did not reach a GM.',
            icon: 'fa-solid fa-triangle-exclamation',
            color: '#e05c3c'
        });
        return false;
    }

    if (result.approved) {
        showSquireToast(`Cleanup approved for ${result.actorName || actorName}`, {
            subtitle: result.summary || 'Your sheet has been tidied.',
            icon: 'fa-solid fa-broom'
        });
    } else {
        showSquireToast(`Cleanup declined for ${result.actorName || actorName}`, {
            subtitle: result.summary || 'The GM did not apply the changes.',
            icon: 'fa-solid fa-ban',
            color: '#e05c3c'
        });
    }

    return !!result.approved;
}
