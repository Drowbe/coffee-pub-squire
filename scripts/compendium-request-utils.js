import { MODULE } from './const.js';
import { getBlacksmith, showSquireToast } from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';
import {
    compendiumRequest, compendiumApproved, compendiumDenied, compendiumFailed,
    retireCard, name, sentence
} from './manager-cards.js';

/**
 * The ask-the-GM rung of compendium access.
 *
 * A player on the `request` level clicks add and nothing happens to their sheet:
 * a card goes to the GM, who approves or denies it, and the approval performs
 * the add. The player never writes to the actor, so this works on tables where
 * players hold Observer on their own sheet as easily as on tables where they
 * hold Owner.
 *
 * Modelled on the transfer approval flow rather than sharing code with it. The
 * two look alike from a distance and diverge everywhere it matters: transfers
 * move an existing document between two actors and have to validate quantity
 * against a live stack, while this copies a compendium document onto one actor
 * and has nothing to reserve or roll back. Merging them would mean one function
 * with two mutually exclusive halves.
 */
export class CompendiumRequestUtils {

    /**
     * Ask the GM to add a compendium document to the actor.
     *
     * Sends actor and item UUIDs rather than ids: the GM resolving a request
     * has to reach a token actor on a scene as readily as one in the directory,
     * and `game.actors.get()` returns nothing for the former.
     *
     * @returns {Promise<boolean>} whether the request reached a GM
     */
    static async sendRequest(actor, entry) {
        if (!actor || !entry?.uuid) return false;

        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return false;
        }

        if (!game.users.some(user => user.isGM && user.active)) {
            showSquireToast('No GM is online', {
                subtitle: 'Adding this needs GM approval.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return false;
        }

        await socket.executeAsGM('createCompendiumRequestChat', {
            actorUuid: actor.uuid,
            actorName: actor.name,
            itemUuid: entry.uuid,
            itemName: entry.name ?? 'Unknown',
            itemImg: entry.img ?? 'icons/svg/item-bag.svg',
            itemType: entry.type ?? '',
            sourceLabel: entry.sourceLabel ?? '',
            requesterId: game.user.id,
            requesterName: game.user.name
        });

        showSquireToast(`Requested ${entry.name}`, {
            subtitle: 'Waiting for the GM.',
            icon: 'fa-solid fa-hourglass-half',
            image: entry.img,
            stackKey: `squire-request-${entry.uuid}`
        });
        return true;
    }

    /**
     * GM side: put the request in front of every GM.
     */
    static async createRequestChat(data) {
        if (!game.user.isGM) return;

        const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
        if (!gmIds.length) return;

        await compendiumRequest({
            ...data,
            whisper: gmIds,
            speaker: { alias: 'System' },
            flags: { type: 'compendiumRequest', data }
        });
    }

    /**
     * Wire the Approve/Deny buttons. Registered once per client at startup, not
     * per rendered message: the handler is resolved fresh from Blacksmith's
     * registry every time a card paints, which is why the buttons still work
     * after a browser reload and why nothing here has to guard against
     * collecting a second listener on a re-render.
     */
    static registerCardActions() {
        const chatCards = getBlacksmith()?.chatCards;
        if (!chatCards) return;

        const resolve = (approved) => async ({ message }) => {
            // Hiding a button is not authorisation — any client can fire an
            // action whatever its copy of the card looks like.
            if (!game.user.isGM) return;
            const data = message?.flags?.[MODULE.ID]?.data ?? {};
            await this.resolveRequest(data, approved, message);
        };

        chatCards.registerAction(MODULE.ID, 'compendium-approve', resolve(true));
        chatCards.registerAction(MODULE.ID, 'compendium-deny', resolve(false));
    }

    /**
     * Carry out the GM's decision: add the item and tell the player, or tell the
     * player it was declined. Either way the request card retires in place to a
     * band saying what was decided, so the log keeps the decision instead of the
     * card vanishing from under whoever pressed the button.
     */
    static async resolveRequest(data, approved, message) {
        const requester = game.users.get(data.requesterId);
        const whisper = [data.requesterId, ...game.users.filter(u => u.isGM).map(u => u.id)]
            .filter(Boolean);
        const speaker = { alias: 'System' };

        // The band the request card ends up wearing. Reassigned by whichever
        // branch below actually runs, so the card and the outcome message can
        // never disagree about what happened.
        let verdict = { text: 'Approved', tone: 'positive', icon: 'fa-solid fa-circle-check' };
        const failed = { text: 'Failed', tone: 'negative', icon: 'fa-solid fa-triangle-exclamation' };

        try {
            if (!approved) {
                verdict = { text: 'Denied', tone: 'negative', icon: 'fa-solid fa-circle-xmark' };
                await compendiumDenied({ ...data, whisper, speaker });
                return;
            }

            const actor = await fromUuid(data.actorUuid);
            if (!actor) {
                verdict = failed;
                await compendiumFailed({
                    reason: sentence(name(data.actorName), ' could not be found, so ',
                                     name(data.itemName), ' was not added.'),
                    whisper, speaker
                });
                return;
            }

            // The request may have outlived the ownership that justified it —
            // a character reassigned between the click and the approval. The GM
            // is approving "give this to that player's character", not "write to
            // whatever that actor is now".
            if (requester && !actor.testUserPermission(requester, 'OWNER')) {
                verdict = failed;
                await compendiumFailed({
                    reason: sentence(name(data.requesterName), ' no longer owns ',
                                     name(data.actorName), ', so ', name(data.itemName),
                                     ' was not added.'),
                    whisper, speaker
                });
                return;
            }

            const created = await CompendiumSearchUtility.addToActor(actor, data.itemUuid, 1);
            if (!created) {
                verdict = failed;
                await compendiumFailed({
                    reason: sentence(name(data.itemName), ' could not be added to ',
                                     name(data.actorName), '. Its compendium may be unavailable.'),
                    whisper, speaker
                });
                return;
            }

            await compendiumApproved({ ...data, whisper, speaker });
        } catch (error) {
            // The buttons are gone either way, so a throw that said nothing would
            // leave the player watching a request that had simply stopped.
            console.error(`${MODULE.ID}: Failed to resolve compendium request:`, error);
            verdict = failed;
            await compendiumFailed({
                reason: sentence('Something went wrong adding ', name(data.itemName),
                                 ' to ', name(data.actorName), '.'),
                whisper, speaker
            });
        } finally {
            await retireCard(message, verdict);
        }
    }
}
