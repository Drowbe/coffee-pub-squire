/**
 * manager-notifications.js — Transient menubar notifications for party-visible events.
 *
 * Local UI actions already notify the acting user (the click handlers in
 * panel-quest.js). This file covers everyone ELSE: it watches the document
 * updates that broadcast a change to every client and shows a short-lived
 * Blacksmith menubar notification, with an onClick link to the relevant panel
 * entry where one exists. The initiating user is always skipped — you don't
 * need a toast for something you just did.
 *
 * Events:
 *  - Quest status change (active / completed / failed / available)  → link to quest
 *  - Objective status change (completed / failed / revealed)        → link to objective
 *  - Codex entry unlocked (ownership raised to Observer)            → link to codex entry
 *  - Active effect applied to an actor you own                      → no link
 *  - Party note updated (visibility 'party' or 'all')               → link to note
 *
 * Change detection needs a before-state, which update hooks don't carry, so
 * initTransientNotifications() snapshots quest statuses/objectives and codex
 * visibility at ready. Pages first seen after that (new page, journal setting
 * switched) are recorded silently and only diff from their next change on.
 *
 * Wiring lives in squire.js: the existing updateJournalEntryPage /
 * createJournalEntryPage / createActiveEffect hooks route into the handlers
 * exported here.
 */

import { MODULE } from './const.js';
import { focusQuestInPanel, focusCodexInPanel } from './manager-pins.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';

const NOTIFICATION_SECONDS = 5;

// Before-state baselines, per client.
const _questBaseline = new Map();      // page uuid -> { status, tasks: [{ text, state }] }
const _visibleCodexUuids = new Set();  // codex page uuids currently at Observer or better

// Bulk codex unlocks (auto-discover can reveal many entries at once) collapse
// into a single notification instead of one toast per entry.
let _codexBatch = { count: 0, lastUuid: null, lastName: null, timeout: null };

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

function _getPanelManagerInstance() {
    return game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
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
 * Lightweight quest snapshot for diffing: status plus per-objective state.
 * Mirrors QuestParser's conventions (s = completed, code = failed, em = hidden;
 * ||gm hints|| and ((treasure unlocks)) stripped from display text) without the
 * cost of enrichment — this runs on every quest journal update.
 * @returns {{status: string, tasks: Array<{text: string, state: string}>}|null}
 *          null when the page doesn't look like a quest entry.
 */
function _snapshotQuestPage(page) {
    const content = page?.text?.content;
    if (typeof content !== 'string') return null;
    if (!/<strong>(Status|Tasks):<\/strong>/.test(content)) return null;

    const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
    const status = statusMatch ? statusMatch[1].trim() : 'Not Started';

    const tasks = [];
    const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
    if (tasksMatch) {
        const doc = new DOMParser().parseFromString(`<ul>${tasksMatch[1]}</ul>`, 'text/html');
        for (const li of doc.querySelectorAll('ul > li')) {
            let state = 'active';
            if (li.querySelector('s, del, strike')) state = 'completed';
            else if (li.querySelector('code')) state = 'failed';
            else if (li.querySelector('em, i')) state = 'hidden';
            const text = li.textContent
                .replace(/\|\|[^|]+\|\|/g, '')
                .replace(/\(\([^)]+\)\)/g, '')
                .trim();
            tasks.push({ text, state });
        }
    }
    return { status, tasks };
}

function _getConfiguredJournalId(settingKey) {
    const journalId = game.settings.get(MODULE.ID, settingKey);
    return (!journalId || journalId === 'none') ? null : journalId;
}

function _isCodexVisible(page) {
    return (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
}

/**
 * Snapshot the current quest statuses/objectives and codex visibility.
 * Call once at ready, after journals are loaded.
 */
export function initTransientNotifications() {
    try {
        _questBaseline.clear();
        const questJournalId = _getConfiguredJournalId('questJournal');
        if (questJournalId) {
            for (const page of game.journal.get(questJournalId)?.pages?.contents ?? []) {
                const snap = _snapshotQuestPage(page);
                if (snap) _questBaseline.set(page.uuid, snap);
            }
        }

        _visibleCodexUuids.clear();
        const codexJournalId = _getConfiguredJournalId('codexJournal');
        if (codexJournalId) {
            for (const page of game.journal.get(codexJournalId)?.pages?.contents ?? []) {
                if (page.type === CODEX_PAGE_TYPE && _isCodexVisible(page)) {
                    _visibleCodexUuids.add(page.uuid);
                }
            }
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error initializing notification baselines:', error);
    }
}

/**
 * Record a newly created page in the baselines without notifying — creation is
 * not a status *change*, and diffing it against nothing produces nonsense.
 */
export function recordCreatedPageBaseline(page) {
    try {
        if (page?.parent?.id === _getConfiguredJournalId('questJournal')) {
            const snap = _snapshotQuestPage(page);
            if (snap) _questBaseline.set(page.uuid, snap);
        }
        if (page?.parent?.id === _getConfiguredJournalId('codexJournal')
            && page.type === CODEX_PAGE_TYPE && _isCodexVisible(page)) {
            _visibleCodexUuids.add(page.uuid);
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error recording page baseline:', error);
    }
}

/**
 * Route one journal page update through the quest / codex / note notifiers.
 * Called from the updateJournalEntryPage hook in squire.js.
 */
export async function routeTransientJournalUpdate(page, changes, options, userId) {
    try {
        _handleQuestUpdate(page, userId);
        _handleCodexUpdate(page, userId);
        _handleNoteUpdate(page, changes, userId);
    } catch (error) {
        console.error('Coffee Pub Squire | Error routing transient notification:', error);
    }
}

function _handleQuestUpdate(page, userId) {
    if (page?.parent?.id !== _getConfiguredJournalId('questJournal')) return;
    const snap = _snapshotQuestPage(page);
    if (!snap) return;
    const prev = _questBaseline.get(page.uuid);
    _questBaseline.set(page.uuid, snap);
    if (!prev) return;                    // first sighting — nothing to diff against
    if (userId === game.user.id) return;  // the acting client notified itself locally

    // Players don't hear about quests hidden from them
    const isGM = game.user.isGM;
    if (!isGM && page.getFlag(MODULE.ID, 'visible') === false) return;

    const questName = page.name || 'Unknown Quest';

    if (snap.status !== prev.status) {
        const statusNotices = {
            'In Progress': { text: `Quest active: ${questName}`,        icon: 'fa-solid fa-flag' },
            'Complete':    { text: `Quest '${questName}' completed!`,   icon: 'fa-solid fa-trophy', pulse: true },
            'Failed':      { text: `Quest failed: ${questName}`,        icon: 'fa-solid fa-skull' },
            'Not Started': { text: `Quest available: ${questName}`,     icon: 'fa-solid fa-map-signs' }
        };
        const notice = statusNotices[snap.status];
        if (notice) {
            _notify(notice.text, notice.icon, {
                pulse: !!notice.pulse,
                onClick: () => focusQuestInPanel(page.uuid, null, snap.status)
            });
        }
    }

    // Per-objective diff only when the list shape is stable — if objectives were
    // added or removed, positions shifted and an index diff would mislabel them.
    if (snap.tasks.length !== prev.tasks.length) return;
    snap.tasks.forEach((task, index) => {
        const before = prev.tasks[index];
        if (!before || task.state === before.state) return;
        if (!isGM && task.state === 'hidden') return; // hiding is GM housekeeping

        let text = null;
        let icon = null;
        if (task.state === 'completed') {
            text = `Objective completed: ${task.text}`;
            icon = 'fa-solid fa-circle-check';
        } else if (task.state === 'failed') {
            text = `Objective failed: ${task.text}`;
            icon = 'fa-solid fa-circle-xmark';
        } else if (task.state === 'active' && before.state === 'hidden') {
            text = `New objective: ${task.text}`;
            icon = 'fa-solid fa-bullseye';
        } else if (task.state === 'active') {
            text = `Objective reopened: ${task.text}`;
            icon = 'fa-solid fa-bullseye';
        } else {
            return; // became hidden — the panel reflects it; no toast
        }
        _notify(text, icon, { onClick: () => focusQuestInPanel(page.uuid, index, snap.status) });
    });
}

function _handleCodexUpdate(page, userId) {
    if (page?.parent?.id !== _getConfiguredJournalId('codexJournal')) return;
    if (page.type !== CODEX_PAGE_TYPE) return;

    const visible = _isCodexVisible(page);
    const wasVisible = _visibleCodexUuids.has(page.uuid);
    if (visible) _visibleCodexUuids.add(page.uuid);
    else _visibleCodexUuids.delete(page.uuid);

    if (!visible || wasVisible) return;   // only newly unlocked entries
    if (userId === game.user.id) return;  // the unlocking GM watched themselves do it

    // Batch: auto-discover can unlock a burst of entries; collapse them.
    _codexBatch.count++;
    _codexBatch.lastUuid = page.uuid;
    _codexBatch.lastName = page.name;
    if (_codexBatch.timeout) clearTrackedTimeout(_codexBatch.timeout);
    _codexBatch.timeout = trackModuleTimeout(() => {
        const { count, lastUuid, lastName } = _codexBatch;
        _codexBatch = { count: 0, lastUuid: null, lastName: null, timeout: null };
        if (count === 1) {
            _notify(`Codex unlocked: ${lastName}`, 'fa-solid fa-book-open', {
                onClick: () => focusCodexInPanel(lastUuid)
            });
        } else if (count > 1) {
            _notify(`${count} codex entries unlocked`, 'fa-solid fa-book-open', {
                onClick: () => focusCodexInPanel(lastUuid)
            });
        }
    }, 1500);
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
        onClick: () => _getPanelManagerInstance()?.notesPanel?.showNote?.(page.uuid)
    });
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
