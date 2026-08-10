/**
 * manager-notifications.js — Transient menubar notifications for party-visible events.
 *
 * Local UI actions already notify the acting user (the panels' own click
 * handlers). This file covers everyone ELSE: it watches the document
 * updates that broadcast a change to every client and shows a short-lived
 * Blacksmith menubar notification, with an onClick link to the relevant panel
 * entry where one exists. The initiating user is always skipped — you don't
 * need a toast for something you just did.
 *
 * Events:
 *  - Active effect applied to an actor you own                      → no link
 *  - Party note updated (visibility 'party' or 'all')               → link to note
 *
 * Wiring lives in squire.js: the existing updateJournalEntryPage /
 * createJournalEntryPage / createActiveEffect hooks route into the handlers
 * exported here.
 */

import { getCampaignPanel } from './campaign-panels.js';
import { MODULE } from './const.js';
import { showSquireToast } from './helpers.js';

const NOTIFICATION_SECONDS = 5;

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

function _getNotesPanel() {
    return getCampaignPanel('notes');
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

function _getConfiguredJournalId(settingKey) {
    const journalId = game.settings.get(MODULE.ID, settingKey);
    return (!journalId || journalId === 'none') ? null : journalId;
}

/**
 * Route one journal page update through the note notifier.
 * Called from the updateJournalEntryPage hook in squire.js.
 */
export async function routeTransientJournalUpdate(page, changes, options, userId) {
    try {
        _handleNoteUpdate(page, changes, userId);
    } catch (error) {
        console.error('Coffee Pub Squire | Error routing transient notification:', error);
    }
}

function _handleNoteUpdate(page, changes, userId) {
    if (page.getFlag(MODULE.ID, 'noteType') !== 'sticky') return;
    if (page?.parent?.id !== _getConfiguredJournalId('notesJournal')) return;
    if (userId === game.user.id) return;

    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    if (visibility === 'private') return; // private notes are the author's business

    // Only content or title edits — flag-only updates (pinId bookkeeping,
    // visibility toggles) would make this fire on housekeeping.
    if (!changes?.text && !changes?.name && !changes?.['==text']) return;

    _notify(`Note updated: ${page.name}`, 'fa-solid fa-note-sticky', {
        onClick: () => _getNotesPanel()?.showNote?.(page.uuid)
    });
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
