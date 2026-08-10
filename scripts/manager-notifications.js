/**
 * manager-notifications.js — Transient menubar notifications.
 *
 * Local UI actions already notify the acting user. This file covers everyone
 * ELSE: it watches the document updates that broadcast a change to every client
 * and shows a short-lived Blacksmith menubar notification. The initiating user
 * is always skipped — you don't need a toast for something you just did.
 *
 * Events:
 *  - Active effect applied to an actor you own
 *  - Item quantity changed on an actor you own
 *
 * The journal half of this file left with Notes; what remains is actor-scoped,
 * which is why it stayed in Squire at all.
 *
 * Wiring lives in squire.js.
 */

import { MODULE } from './const.js';
import { showSquireToast } from './helpers.js';

const NOTIFICATION_SECONDS = 5;

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

function _notify(text, icon, options = null) {
    try {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.addNotification) return;
        blacksmith.addNotification(text, icon, NOTIFICATION_SECONDS, MODULE.ID, options ?? undefined);
    } catch (error) {
        console.error('Coffee Pub Squire | Error sending transient notification:', error);
    }
}

/**
 * Notify the GM when a player changes an item's quantity from the tray.
 *
 * Called from the updateItem and deleteItem hooks in squire.js. No socket is
 * involved: the document hooks already fire on every client, and the hook's
 * `userId` says who did it — so the GM's own client decides to notify itself.
 *
 * Fires only for deliberate tray edits, which the editor tags via update
 * options. Hooking every quantity change would toast on each arrow dnd5e
 * consumes during a ranged attack.
 *
 * Uses the toast surface rather than `_notify`'s menubar notification like the
 * rest of this file: an inventory change the GM didn't make should be visible
 * without looking at the menubar.
 *
 * @param {Item} item
 * @param {string} userId - the user who made the change
 * @param {number|null} quantity - the new quantity, or null when deleted
 */
export function notifyQuantityChanged(item, userId, quantity) {
    try {
        if (!game.user.isGM) return;      // GM-facing only
        if (userId === game.user.id) return; // your own edit
        const actor = item?.parent;
        if (!(actor instanceof Actor)) return;

        const who = game.users.get(userId)?.name ?? 'Someone';
        const removed = quantity === null;

        showSquireToast(`${actor.name}: ${item.name}`, {
            subtitle: removed ? `${who} removed this item` : `${who} set the quantity to ${quantity}`,
            icon: removed ? 'fa-solid fa-trash' : 'fa-solid fa-cubes-stacked',
            color: removed ? '#e05c3c' : '#ffb020',
            // Repeated edits to the same item replace in place instead of
            // stacking; edits to different items still queue separately.
            stackKey: `squire-quantity-${item.id}`
        });
    } catch (error) {
        console.error('Coffee Pub Squire | Error sending quantity notification:', error);
    }
}

/**
 * Notify an owning player when an active effect lands on their actor.
 * Called from the createActiveEffect hook in squire.js. No link — there is
 * no panel entry for an effect.
 */
export function notifyEffectApplied(effect, userId) {
    try {
        if (userId === game.user.id) return; // you applied it, you know
        if (game.user.isGM) return;          // GM owns every actor; this is a player-facing notice
        const actor = effect?.parent;
        if (!(actor instanceof Actor) || !actor.isOwner) return;
        const label = effect.name || effect.label || 'Effect';
        _notify(`${actor.name}: ${label}`, 'fa-solid fa-person-burst');
    } catch (error) {
        console.error('Coffee Pub Squire | Error sending effect notification:', error);
    }
}
