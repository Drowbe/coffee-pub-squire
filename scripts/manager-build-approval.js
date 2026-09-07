// ============================================================================
// GEAR BUILD APPROVAL
// ============================================================================
//
// Asking the GM before a player re-kits.
//
// Swapping gear costs an action and swapping a prepared list needs a rest, so a
// player changing build mid-combat is a table decision rather than a click. This
// is where that decision gets asked for.
//
// WHAT THIS IS NOT: a permission system. A player owns their own actor and can
// equip anything on their sheet without going near this window; the setting is
// table etiquette, not a lock, and the dialog says so rather than implying an
// enforcement that does not exist. A check that looks like a control and is not
// one is worse than none.
//
// THREE SURFACES, ONE JOB EACH — the rule this feature is the pilot for:
//
//     a DIALOG decides       Blacksmith's `dialog.wait()`, on the GM's screen,
//                            with Approve and Deny as two peers.
//     a TOAST informs        the player, when there is no GM, or when the answer
//                            comes back no.
//     a CHAT CARD records    (not yet: nothing here writes to chat, and a record
//                            of approvals is a later decision.)
//
// A chat card was the obvious place to put the question and is the wrong one: a
// busy log swallows it, and an approval nobody sees is a player blocked with no
// signal that anything is waiting.
// ============================================================================

import { MODULE } from './const.js';
import { getBlacksmith, showSquireToast } from './helpers.js';
import { buildSummary } from './utility-builds.js';

/** The op name. Module-prefixed, as `gmRequest` requires. */
const OP = `${MODULE.ID}.build-approval`;

/**
 * Does this application need to be asked about?
 *
 * A GM never asks themselves — they are the one who would answer, and a dialog
 * that appears on your own screen because you pressed a button is not an
 * approval, it is a second confirmation.
 *
 * Otherwise it is per-KIND, because the two are different acts. Equipping a
 * build changes what a character can do in a fight; wearing a costume changes
 * what they look like. The first is on by default and the second is off, which
 * is the ratio of how much each one matters to anybody but its owner.
 */
export function needsApproval(build) {
    if (!build || game.user.isGM) return false;

    return game.settings.get(MODULE.ID, build.mode === 'costume'
        ? 'buildsGMApprovesCostumes'
        : 'buildsGMApprovesBuilds');
}

/**
 * What the GM is being asked to allow, in the words the player already saw.
 *
 * Deliberately the same breakdown the player's own confirmation shows. Two
 * descriptions of one act, differing in wording, is how a GM ends up approving
 * something other than what was asked.
 */
function describe(actor, build) {
    const escape = foundry.utils.escapeHTML;
    const costume = build.mode === 'costume';
    const summary = buildSummary(actor, build);

    const lines = costume
        ? ['<li>Change their portrait and token artwork.</li>',
           '<li>Touch no gear and no spells.</li>']
        : [
            `<li>Equip the ${summary.gearCount} item${summary.gearCount === 1 ? '' : 's'} in it, `
                + 'and unequip everything else.</li>',
            summary.spellCount
                ? `<li>Prepare its ${summary.spellCount} spell${summary.spellCount === 1 ? '' : 's'}, `
                    + 'and unprepare everything else that counts against a limit.</li>'
                : '',
            '<li>Leave attunement alone.</li>'
        ].filter(Boolean);

    return `<p><strong>${escape(actor.name)}</strong> wants to `
        + `${costume ? 'wear' : 'equip'} <strong>${escape(build.name)}</strong>.</p>`
        + '<p>This will:</p><ul>' + lines.join('') + '</ul>';
}

/**
 * The GM's side. Runs on exactly one GM, with a caller identity Foundry supplied.
 *
 * Registered on EVERY client, not only a GM's: any client can become the
 * answering GM, and one that registered nothing answers UNKNOWN_OP.
 */
export function registerBuildApproval() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.registerOp) return false;

    blacksmith.gmRequest.registerOp({
        op: OP,
        module: MODULE.ID,
        handler: async (payload, user) => {
            // `payload` came from a client and is untrusted; `user` did not and
            // is the one thing here that could not have been forged. Every uuid
            // is re-resolved and every rule re-checked against the documents
            // that come back, never against what the payload says about them.
            const actor = await fromUuid(payload?.actorUuid);
            if (!actor) return { ok: false, code: 'NO_ACTOR' };

            // The asker must own the character they are asking about. Without
            // this, one player could put another's build up for approval and a
            // GM pressing Approve would be approving something nobody asked for.
            if (!actor.testUserPermission(user, 'OWNER')) return { ok: false, code: 'NOT_YOURS' };

            const build = (actor.getFlag(MODULE.ID, 'builds') ?? [])
                .find(entry => entry?.id === payload?.buildId);
            if (!build) return { ok: false, code: 'NO_BUILD' };

            const costume = build.mode === 'costume';

            // `wait`, not `confirm`: Approve and Deny are two peers, and a
            // confirm's Cancel would read as "not now" rather than "no".
            const answer = await blacksmith.dialog.wait({
                title: costume ? 'Costume Change' : 'Build Change',
                content: describe(actor, build)
                    + `<p><em>${foundry.utils.escapeHTML(user.name)} is asking.</em></p>`,
                buttons: [
                    { action: 'deny', label: 'Deny', icon: 'fa-solid fa-circle-xmark', destructive: true },
                    { action: 'approve', label: 'Approve', icon: 'fa-solid fa-circle-check', default: true }
                ]
            });

            // The pressed button is on `value`. `action` is only ever one of
            // submit / cancel / close, so reading the decision off it would make
            // every answer look the same.
            //
            // Dismissing resolves rather than rejecting, and lands here as
            // neither button — which is a denial. That is the right fail-safe:
            // an unanswered request must not become an approved one, and the
            // player is told so instead of waiting on a dialog that is gone.
            return { ok: true, approved: answer?.value === 'approve' };
        }
    });

    return true;
}

/**
 * Ask, and say what came back. `true` means go ahead.
 *
 * Returns `true` unasked when the setting is off or the asker is a GM, so the
 * call site reads as one question rather than a branch around one.
 */
export async function askToApply(actor, build) {
    if (!needsApproval(build)) return true;

    const blacksmith = getBlacksmith();
    if (!blacksmith?.gmRequest?.request) {
        // The approval cannot be asked for, so it cannot be granted. Failing
        // OPEN here would quietly turn the setting off for everyone the moment
        // Blacksmith was a version behind, and a gate that lapses silently is
        // worse than one that is honestly unavailable.
        showSquireToast('Cannot ask the GM', {
            subtitle: 'Approval needs a newer Coffee Pub Blacksmith.',
            icon: 'fa-solid fa-triangle-exclamation',
            color: '#e05c3c'
        });
        return false;
    }

    showSquireToast(build.name, {
        subtitle: 'Waiting for the GM to approve…',
        icon: 'fa-solid fa-hourglass-half',
        stackKey: `${MODULE.ID}-build-approval`
    });

    const result = await blacksmith.gmRequest.request(OP, {
        actorUuid: actor.uuid,
        buildId: build.id
        // No user id. The envelope carries a verified one; putting a second,
        // claimed one in the payload is exactly the step that makes it forgeable.
    }, { timeout: 120000 });

    if (result?.ok && result.approved) return true;

    // Every refusal says which kind it was, because "denied" and "nobody was
    // there to ask" call for completely different things from the player.
    const reasons = {
        NO_ACTIVE_GM: 'No GM is online to approve it.',
        NOT_YOURS: 'That character is not yours to change.',
        NO_ACTOR: 'The character could not be found.',
        NO_BUILD: 'The build could not be found.',
        TIMEOUT: 'The GM did not answer in time.',
        IDENTITY_UNVERIFIED: 'Squire could not prove who was asking, so it did not ask.'
    };

    showSquireToast(build.name, {
        subtitle: result?.ok ? 'The GM did not approve this change.' : (reasons[result?.code] ?? 'The request failed.'),
        icon: 'fa-solid fa-ban',
        color: '#e05c3c',
        stackKey: `${MODULE.ID}-build-approval`
    });

    return false;
}
