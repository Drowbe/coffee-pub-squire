import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, showSquireToast } from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';

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

        await ChatMessage.create({
            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                isPublic: false,
                cardType: 'compendium-request',
                ...data
            }),
            speaker: { alias: 'System' },
            whisper: gmIds,
            flags: {
                [MODULE.ID]: {
                    type: 'compendiumRequest',
                    data
                }
            }
        });
    }

    /**
     * Wire the Approve/Deny buttons on a request card. Called for every chat
     * message render; returns immediately for anything that isn't ours.
     */
    static handleRequestButtons(message, html) {
        if (message?.flags?.[MODULE.ID]?.type !== 'compendiumRequest') return;
        if (!game.user.isGM) return;

        // v13: the hook hands over jQuery in some paths and a node in others.
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        if (!nativeHtml) return;

        const buttons = nativeHtml.querySelectorAll('.compendium-request-button');
        if (!buttons.length) return;
        // Chat re-renders on edit and on scrollback; without this the same
        // button collects a second handler and one click approves twice.
        if (buttons[0].dataset.handlersAttached === 'true') return;

        const data = message.flags[MODULE.ID].data ?? {};

        buttons.forEach(button => {
            button.dataset.handlersAttached = 'true';
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                buttons.forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('disabled');
                });

                const approved = button.classList.contains('approve');
                await this.resolveRequest(data, approved, message);
            });
        });
    }

    /**
     * Carry out the GM's decision: add the item and tell the player, or tell the
     * player it was declined. Either way the request card goes away, so the
     * chat log doesn't accumulate decisions already made.
     */
    static async resolveRequest(data, approved, message) {
        const requester = game.users.get(data.requesterId);
        const whisperIds = [data.requesterId, ...game.users.filter(u => u.isGM).map(u => u.id)]
            .filter(Boolean);

        try {
            if (!approved) {
                await this._sendOutcomeChat('compendium-denied', data, whisperIds);
                return;
            }

            const actor = await fromUuid(data.actorUuid);
            if (!actor) {
                await this._sendOutcomeChat('compendium-failed', {
                    ...data,
                    failureReason: `${data.actorName} could not be found, so ${data.itemName} was not added.`
                }, whisperIds);
                return;
            }

            // The request may have outlived the ownership that justified it —
            // a character reassigned between the click and the approval. The GM
            // is approving "give this to that player's character", not "write to
            // whatever that actor is now".
            if (requester && !actor.testUserPermission(requester, 'OWNER')) {
                await this._sendOutcomeChat('compendium-failed', {
                    ...data,
                    failureReason: `${data.requesterName} no longer owns ${data.actorName}, so ${data.itemName} was not added.`
                }, whisperIds);
                return;
            }

            const created = await CompendiumSearchUtility.addToActor(actor, data.itemUuid, 1);
            if (!created) {
                await this._sendOutcomeChat('compendium-failed', {
                    ...data,
                    failureReason: `${data.itemName} could not be added to ${data.actorName}. Its compendium may be unavailable.`
                }, whisperIds);
                return;
            }

            await this._sendOutcomeChat('compendium-approved', data, whisperIds);
        } catch (error) {
            // The card is deleted either way, so a throw that said nothing would
            // leave the player watching a request that simply vanished.
            console.error(`${MODULE.ID}: Failed to resolve compendium request:`, error);
            await this._sendOutcomeChat('compendium-failed', {
                ...data,
                failureReason: `Something went wrong adding ${data.itemName} to ${data.actorName}.`
            }, whisperIds);
        } finally {
            const current = game.messages.get(message?.id);
            if (current) await current.delete();
        }
    }

    static async _sendOutcomeChat(cardType, data, whisperIds) {
        await ChatMessage.create({
            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                isPublic: false,
                cardType,
                ...data
            }),
            speaker: { alias: 'System' },
            whisper: whisperIds
        });
    }
}
