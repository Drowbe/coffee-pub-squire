/**
 * Quest Pin Event Handlers for Blacksmith Pin API
 *
 * Registers double-click (open Quests tray, correct status tab, scroll, flash) and context menu items
 * (complete, fail, toggle hidden, delete) for quest pins.
 */

import { MODULE } from './const.js';
import {
    getPinsApi,
    isPinsApiAvailable,
    getSquirePinType,
    isSquirePinCategory,
    updateQuestPinVisibility,
    reconcileQuestPins
} from './utility-quest-pins.js';
import { trackModuleTimeout } from './timer-utils.js';
import { notifyObjectiveCompleted } from './panel-quest.js';

let questPinEventsRegistered = false;
let questPinClickDisposer = null;
let questPinHandlerController = null;
let questPinContextMenuDisposers = [];
let questPinSyncRegistered = false;
let questPinSceneSyncHookId = null;
let questPinSyncDebounceTimer = null;
let questPinSyncHookIds = [];
let pendingQuestPinSyncEvents = [];

function deepEqual(a, b) {
    const fn = foundry?.utils?.deepEqual;
    if (typeof fn === 'function') return fn(a, b);
    return JSON.stringify(a) === JSON.stringify(b);
}

async function updateQuestFlagsIfChanged(page, updates) {
    if (!page || !updates) return;
    const changes = {};
    for (const [key, value] of Object.entries(updates)) {
        const current = page.getFlag(MODULE.ID, key);
        if (!deepEqual(current, value)) changes[key] = value;
    }
    if (Object.keys(changes).length) {
        await page.update({ flags: { [MODULE.ID]: changes } });
    }
}

async function syncQuestPinMirror(page, pinData, mode) {
    const objectiveIndex = typeof pinData?.config?.objectiveIndex === 'number'
        ? pinData.config.objectiveIndex
        : null;
    const pinId = pinData?.id ?? null;
    const sceneId = pinData?.sceneId ?? null;

    if (objectiveIndex === null) {
        if (mode === 'deleted') {
            await updateQuestFlagsIfChanged(page, { pinId: null, sceneId: null });
            return;
        }
        if (mode === 'unplaced') {
            await updateQuestFlagsIfChanged(page, { pinId: pinId ?? page.getFlag(MODULE.ID, 'pinId'), sceneId: null });
            return;
        }
        await updateQuestFlagsIfChanged(page, {
            pinId: pinId ?? page.getFlag(MODULE.ID, 'pinId'),
            sceneId
        });
        return;
    }

    const currentObjectivePins = page.getFlag(MODULE.ID, 'objectivePins') || {};
    const nextObjectivePins = { ...currentObjectivePins };
    if (mode === 'deleted') {
        delete nextObjectivePins[String(objectiveIndex)];
    } else if (mode === 'unplaced') {
        const current = currentObjectivePins[String(objectiveIndex)] ?? currentObjectivePins[objectiveIndex];
        const currentPinId = current?.pinId ?? current ?? pinId;
        if (currentPinId) nextObjectivePins[String(objectiveIndex)] = { pinId: currentPinId };
    } else {
        const resolvedPinId = pinId ?? currentObjectivePins[String(objectiveIndex)]?.pinId ?? currentObjectivePins[objectiveIndex]?.pinId;
        if (resolvedPinId) {
            nextObjectivePins[String(objectiveIndex)] = { pinId: resolvedPinId, sceneId };
        }
    }

    if (!deepEqual(currentObjectivePins, nextObjectivePins)) {
        await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);
    }
}

async function resolveQuestPinPayload(payload = {}) {
    const pins = getPinsApi();
    const moduleId = payload.moduleId ?? payload.pin?.moduleId;
    if (moduleId && moduleId !== MODULE.ID) return null;

    const payloadPinId = payload.pinId ?? payload.pin?.id ?? null;
    let pinData = payload.pin ?? null;
    if (payloadPinId && typeof pins?.get === 'function') {
        // Prefer the current live pin state from Blacksmith over the event snapshot.
        pinData = pins.get(payloadPinId, payload.sceneId ? { sceneId: payload.sceneId } : undefined)
            || pins.get(payloadPinId)
            || pinData
            || null;
    }

    const config = payload.config ?? pinData?.config ?? {};
    const questUuid = config.questUuid;
    if (!questUuid) return null;

    return {
        pin: {
            id: pinData?.id ?? payloadPinId ?? null,
            sceneId: pinData?.sceneId ?? payload.sceneId ?? null,
            config,
            moduleId: pinData?.moduleId ?? moduleId ?? MODULE.ID
        },
        questUuid
    };
}

async function syncQuestPinEvent(payload = {}, mode = 'upsert') {
    const resolved = await resolveQuestPinPayload(payload);
    if (!resolved?.questUuid) return false;

    const page = await fromUuid(resolved.questUuid);
    if (!page) return false;
    if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
        return false;
    }

    await syncQuestPinMirror(page, resolved.pin, mode);
    return true;
}

async function renderQuestPanelIfOpen() {
    const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
    if (panelManager?.questPanel?.render && panelManager.element) {
        await panelManager.questPanel.render(panelManager.element);
    }
}

async function flushQuestPinSyncQueue() {
    const queue = pendingQuestPinSyncEvents.splice(0, pendingQuestPinSyncEvents.length);
    if (!queue.length) return;

    let needsReconcile = false;
    for (const { payload, mode } of queue) {
        if ((payload.moduleId && payload.moduleId !== MODULE.ID) || (payload.pin?.moduleId && payload.pin.moduleId !== MODULE.ID)) {
            continue;
        }
        if (mode === 'reconcile') {
            needsReconcile = true;
            continue;
        }
        const synced = await syncQuestPinEvent(payload, mode);
        if (!synced && mode === 'deleted') {
            needsReconcile = true;
        }
    }

    if (needsReconcile) {
        await reconcileQuestPins();
    }
    await renderQuestPanelIfOpen();
}

/**
 * Focus and flash the quest entry in the quest panel
 * @param {string} questUuid - Quest journal page UUID
 * @param {number|null} objectiveIndex - Objective index (null for quest-level)
 * @returns {boolean} True if entry was found and focused
 */
function focusQuestEntryInDom(questUuid, objectiveIndex = null) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;

    entry.classList.remove('collapsed');
    entry.classList.add('quest-highlighted');
    entry.scrollIntoView({ behavior: 'smooth', block: 'center' });

    trackModuleTimeout(() => {
        entry.classList.remove('quest-highlighted');
    }, 2000);

    const objIndex = objectiveIndex !== null && objectiveIndex !== undefined
        ? (typeof objectiveIndex === 'number' ? objectiveIndex : parseInt(objectiveIndex, 10))
        : null;
    if (objIndex !== null && !Number.isNaN(objIndex)) {
        const taskItem = entry.querySelector(`.quest-entry-tasks li[data-task-index="${objIndex}"]`);
        if (taskItem) {
            taskItem.classList.add('objective-highlighted');
            trackModuleTimeout(() => taskItem.classList.remove('objective-highlighted'), 2000);
        }
    }
    return true;
}

/**
 * Check whether the quest entry is currently present in rendered DOM.
 * @param {string} questUuid
 * @returns {boolean}
 */
function hasQuestEntryInDom(questUuid) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;
    const section = entry.closest('.quest-section[data-status]');
    if (!section) return true;
    return section.style.display !== 'none';
}

/**
 * Map quest status text to quest panel status filter id.
 * @param {string|null|undefined} questStatus
 * @returns {'active'|'available'|'complete'|null}
 */
function mapQuestStatusToFilter(questStatus) {
    if (typeof questStatus !== 'string') return null;
    switch (questStatus) {
        case 'In Progress': return 'active';
        case 'Not Started': return 'available';
        case 'Complete':
        case 'Failed':
            return 'complete';
        default:
            return null;
    }
}

/**
 * Update objective state in journal content (complete, fail, or hidden)
 * @param {JournalEntryPage} page - Quest journal page
 * @param {number} objectiveIndex - Task index
 * @param {'completed'|'failed'|'hidden'|'active'} newState
 * @returns {Promise<boolean>} True if updated
 */
async function updateObjectiveStateInJournal(page, objectiveIndex, newState) {
    const content = page.text?.content || '';
    const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
    if (!tasksMatch) return false;

    const parser = new DOMParser();
    const ulDoc = parser.parseFromString(`<ul>${tasksMatch[1]}</ul>`, 'text/html');
    const ul = ulDoc.querySelector('ul');
    const liList = ul ? Array.from(ul.children) : [];
    const li = liList[objectiveIndex];
    if (!li) return false;

    // Unwrap any existing state tag to get plain text content
    let plainHtml = li.innerHTML;
    const s = li.querySelector('s');
    const code = li.querySelector('code');
    const em = li.querySelector('em');
    if (s) plainHtml = s.innerHTML;
    else if (code) plainHtml = code.innerHTML;
    else if (em) plainHtml = em.innerHTML;

    if (newState === 'active') {
        li.innerHTML = plainHtml;
    } else if (newState === 'completed') {
        li.innerHTML = `<s>${plainHtml}</s>`;
    } else if (newState === 'failed') {
        li.innerHTML = `<code>${plainHtml}</code>`;
    } else if (newState === 'hidden') {
        li.innerHTML = `<em>${plainHtml}</em>`;
    }

    const newTasksHtml = ul.innerHTML;
    const newContent = content.replace(tasksMatch[1], newTasksHtml);

    await page.update({ text: { content: newContent } });
    return true;
}

/**
 * Toggle quest visibility flag on journal page
 * @param {string} questUuid - Quest journal page UUID
 * @returns {Promise<void>}
 */
async function toggleQuestVisibility(questUuid) {
    const page = await fromUuid(questUuid);
    if (!page) return;
    const visible = page.getFlag(MODULE.ID, 'visible');
    const newVisible = visible !== false ? false : true;
    await page.setFlag(MODULE.ID, 'visible', newVisible);
    await updateQuestPinVisibility(questUuid, canvas.scene?.id);
}

/**
 * Register context menu items for quest pins
 * @param {Object} pins - Blacksmith Pins API
 */
function registerQuestPinContextMenuItems(pins) {
    if (!pins?.registerContextMenuItem) return;

    // Re-register cleanly to avoid stale disposers if pins re-init.
    questPinContextMenuDisposers.forEach((d) => { try { if (typeof d === 'function') d(); } catch (_) {} });
    questPinContextMenuDisposers = [];

    const disposers = [];

    // Complete Objective (objective pins only, GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-complete-objective`, {
            name: 'Complete Objective',
            icon: '<i class="fa-solid fa-check"></i>',
            moduleId: MODULE.ID,
            order: 10,
            gmOnly: true,
            visible: (pinData) => pinData?.moduleId === MODULE.ID && isSquirePinCategory(pinData?.type, 'objective'),
            onClick: async (pinData) => {
                const questUuid = pinData?.config?.questUuid;
                const objectiveIndex = pinData?.config?.objectiveIndex;
                if (questUuid == null || objectiveIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                const updated = await updateObjectiveStateInJournal(page, objectiveIndex, 'completed');
                if (updated) {
                    notifyObjectiveCompleted(
                        (pinData?.config?.objectiveText || '').trim() || `Objective ${objectiveIndex + 1}`
                    );
                    await updateQuestPinVisibility(questUuid, canvas.scene?.id);
                }
            }
        })
    );

    // Fail Objective (objective pins only, GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-fail-objective`, {
            name: 'Fail Objective',
            icon: '<i class="fa-solid fa-xmark"></i>',
            moduleId: MODULE.ID,
            order: 20,
            gmOnly: true,
            visible: (pinData) => pinData?.moduleId === MODULE.ID && isSquirePinCategory(pinData?.type, 'objective'),
            onClick: async (pinData) => {
                const questUuid = pinData?.config?.questUuid;
                const objectiveIndex = pinData?.config?.objectiveIndex;
                if (questUuid == null || objectiveIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                await updateObjectiveStateInJournal(page, objectiveIndex, 'failed');
                await updateQuestPinVisibility(questUuid, canvas.scene?.id);
            }
        })
    );

    // Toggle Hidden (quest pins only - quest-level visibility, GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-toggle-hidden`, {
            name: 'Toggle Hidden from Players',
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            moduleId: MODULE.ID,
            order: 30,
            gmOnly: true,
            visible: (pinData) => pinData?.moduleId === MODULE.ID && isSquirePinCategory(pinData?.type, 'quest'),
            onClick: async (pinData) => {
                const questUuid = pinData?.config?.questUuid;
                if (!questUuid) return;
                await toggleQuestVisibility(questUuid);
            }
        })
    );

    // Toggle Objective Hidden (objective pins only - wrap in <em>, GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-toggle-objective-hidden`, {
            name: 'Toggle Objective Hidden',
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            moduleId: MODULE.ID,
            order: 32,
            gmOnly: true,
            visible: (pinData) => pinData?.moduleId === MODULE.ID && isSquirePinCategory(pinData?.type, 'objective'),
            onClick: async (pinData) => {
                const questUuid = pinData?.config?.questUuid;
                const objectiveIndex = pinData?.config?.objectiveIndex;
                if (questUuid == null || objectiveIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                const currentState = pinData?.config?.objectiveState;
                const newState = currentState === 'hidden' ? 'active' : 'hidden';
                await updateObjectiveStateInJournal(page, objectiveIndex, newState);
                await updateQuestPinVisibility(questUuid, canvas.scene?.id);
            }
        })
    );

    // Delete Pin (GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-delete-pin`, {
            name: 'Delete Pin',
            icon: '<i class="fa-solid fa-trash"></i>',
            moduleId: MODULE.ID,
            order: 40,
            gmOnly: true,
            visible: (pinData) => pinData?.moduleId === MODULE.ID && (isSquirePinCategory(pinData?.type, 'quest') || isSquirePinCategory(pinData?.type, 'objective')),
            onClick: async (pinData) => {
                const pinId = pinData?.id;
                if (!pinId) return;
                const p = getPinsApi();
                if (p) await p.delete(pinId);
            }
        })
    );

    questPinContextMenuDisposers = disposers;
}

/**
 * Register quest pin click and context menu handlers.
 * Call once when pins API is ready (e.g. from canvasReady after migration).
 */
export async function registerQuestPinEvents() {
    const pins = getPinsApi();
    if (!pins || !isPinsApiAvailable()) return;
    if (questPinEventsRegistered) return;

    if (typeof pins.whenReady === 'function') {
        try { await pins.whenReady(); } catch (_) {}
    }

    // Register friendly names for pin types (helps menus/tools label correctly)
    if (typeof pins.registerPinType === 'function') {
        try {
            pins.registerPinType(MODULE.ID, getSquirePinType('quest'), 'Quest Pin');
            pins.registerPinType(MODULE.ID, getSquirePinType('objective'), 'Objective Pin');
        } catch (_) {}
    }

    registerQuestPinContextMenuItems(pins);

    questPinHandlerController = new AbortController();
    const signal = questPinHandlerController.signal;

    questPinClickDisposer = pins.on(
        'doubleClick',
        async (evt) => {
            let pin = evt?.pin ?? evt?.pinData;
            if (!pin && evt?.pinId && typeof pins.get === 'function') {
                pin = pins.get(evt.pinId, evt.sceneId ? { sceneId: evt.sceneId } : undefined);
            }
            if (!pin) return;
            const config = pin.config || {};
            const isQuestOrObjectivePin = isSquirePinCategory(pin.type, 'quest')
                || isSquirePinCategory(pin.type, 'objective')
                || !!config.questUuid;
            if (!isQuestOrObjectivePin) return;
            const questUuid = config.questUuid;
            if (!questUuid) return;
            const objectiveIndex = config.objectiveIndex;

            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (!panelManager) return;

            if (panelManager.setViewMode) {
                await panelManager.setViewMode('quest');
            }
            if (panelManager.element && !panelManager.element.classList.contains('expanded')) {
                panelManager.element.classList.add('expanded');
            }
            const qp = panelManager.questPanel;
            if (qp?.render && panelManager.element) {
                await qp.render(panelManager.element);
            }

            // Switch Active / Available / Complete using live journal data (pin config can be stale).
            const pinGuess = mapQuestStatusToFilter(config.questStatus);
            let targetFilter = qp?.resolveStatusFilterForQuestUuid?.(questUuid) ?? pinGuess ?? 'active';
            if (typeof qp?.applyQuestStatusFilter === 'function') {
                qp.applyQuestStatusFilter(targetFilter);
            }
            if (!hasQuestEntryInDom(questUuid)) {
                const order = pinGuess
                    ? [...new Set([pinGuess, 'active', 'available', 'complete'])]
                    : ['active', 'available', 'complete'];
                for (const f of order) {
                    if (hasQuestEntryInDom(questUuid)) break;
                    qp?.applyQuestStatusFilter?.(f);
                }
            }

            const tryFocus = () => focusQuestEntryInDom(questUuid, objectiveIndex);
            tryFocus();
            trackModuleTimeout(tryFocus, 200);
            trackModuleTimeout(tryFocus, 500);
            trackModuleTimeout(tryFocus, 1000);
        },
        { moduleId: MODULE.ID, signal }
    );

    questPinEventsRegistered = true;
}

/**
 * Unregister quest pin events (for cleanup / teardown)
 */
export function unregisterQuestPinEvents() {
    if (questPinHandlerController) {
        questPinHandlerController.abort();
        questPinHandlerController = null;
    }
    if (questPinClickDisposer && typeof questPinClickDisposer === 'function') {
        questPinClickDisposer();
        questPinClickDisposer = null;
    }
    questPinContextMenuDisposers.forEach((d) => {
        if (typeof d === 'function') d();
    });
    questPinContextMenuDisposers = [];
    questPinEventsRegistered = false;
}

export function unregisterQuestPinSync() {
    if (questPinSyncDebounceTimer) {
        clearTimeout(questPinSyncDebounceTimer);
        questPinSyncDebounceTimer = null;
    }
    pendingQuestPinSyncEvents = [];

    for (const hookId of questPinSyncHookIds) {
        Hooks.off('blacksmith.pins.deleted', hookId.deleted);
        Hooks.off('blacksmith.pins.unplaced', hookId.unplaced);
        Hooks.off('blacksmith.pins.placed', hookId.placed);
        Hooks.off('blacksmith.pins.updated', hookId.updated);
        Hooks.off('blacksmith.pins.created', hookId.created);
        Hooks.off('blacksmith.pins.deletedAll', hookId.deletedAll);
        Hooks.off('blacksmith.pins.deletedAllByType', hookId.deletedAllByType);
    }
    questPinSyncHookIds = [];

    if (questPinSceneSyncHookId !== null) {
        Hooks.off('updateScene', questPinSceneSyncHookId);
        questPinSceneSyncHookId = null;
    }

    questPinSyncRegistered = false;
}

/**
 * Register sync hooks so quest/objective flags stay aligned with the Pins API.
 * Mirrors the Notes panel resilience: any external pin change triggers a reconcile.
 */
export function registerQuestPinSync() {
    if (questPinSyncRegistered) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const queueHandle = (payload = {}, mode = 'upsert') => {
        if ((payload.moduleId && payload.moduleId !== MODULE.ID) || (payload.pin?.moduleId && payload.pin.moduleId !== MODULE.ID)) return;
        pendingQuestPinSyncEvents.push({ payload, mode });
        if (questPinSyncDebounceTimer) clearTimeout(questPinSyncDebounceTimer);
        questPinSyncDebounceTimer = trackModuleTimeout(() => {
            questPinSyncDebounceTimer = null;
            flushQuestPinSyncQueue();
        }, 50);
    };

    questPinSyncHookIds.push({
        deleted: Hooks.on('blacksmith.pins.deleted', (payload = {}) => queueHandle(payload, 'deleted')),
        unplaced: Hooks.on('blacksmith.pins.unplaced', (payload = {}) => queueHandle(payload, 'unplaced')),
        placed: Hooks.on('blacksmith.pins.placed', (payload = {}) => queueHandle(payload, 'upsert')),
        updated: Hooks.on('blacksmith.pins.updated', (payload = {}) => queueHandle(payload, 'upsert')),
        created: Hooks.on('blacksmith.pins.created', (payload = {}) => queueHandle(payload, 'upsert')),
        deletedAll: Hooks.on('blacksmith.pins.deletedAll', (payload = {}) => queueHandle(payload, 'reconcile')),
        deletedAllByType: Hooks.on('blacksmith.pins.deletedAllByType', (payload = {}) => queueHandle(payload, 'reconcile'))
    });

    // Scene flag changes can also desync after bulk deletes.
    if (!questPinSceneSyncHookId) {
        questPinSceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || !changes?.flags) return;
            queueHandle({}, 'reconcile');
        });
    }

    questPinSyncRegistered = true;
}

