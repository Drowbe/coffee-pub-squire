/**
 * Quest Pin Event Handlers for Blacksmith Pin API
 *
 * Registers left-click (open quest tab, scroll, flash) and context menu items
 * (complete, fail, toggle hidden, delete) for quest pins.
 */

import { MODULE } from './const.js';
import {
    getPinsApi,
    isPinsApiAvailable,
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
    if (questPinContextMenuDisposers.length > 0) return;
    if (!pins?.registerContextMenuItem) return;

    const disposers = [];

    // Complete Objective (objective pins only, GM only)
    disposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-complete-objective`, {
            name: 'Complete Objective',
            icon: '<i class="fa-solid fa-check"></i>',
            moduleId: MODULE.ID,
            order: 10,
            gmOnly: true,
            visible: (pinData) => pinData?.type === 'objective',
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
            visible: (pinData) => pinData?.type === 'objective',
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
            visible: (pinData) => pinData?.type === 'quest',
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
            visible: (pinData) => pinData?.type === 'objective',
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
export function registerQuestPinEvents() {
    const pins = getPinsApi();
    if (!pins || !isPinsApiAvailable()) return;
    if (questPinEventsRegistered) return;

    registerQuestPinContextMenuItems(pins);

    questPinHandlerController = new AbortController();
    const signal = questPinHandlerController.signal;

    questPinClickDisposer = pins.on(
        'click',
        async (evt) => {
            let pin = evt?.pin ?? evt?.pinData;
            if (!pin && evt?.pinId && typeof pins.get === 'function') {
                pin = pins.get(evt.pinId, evt.sceneId ? { sceneId: evt.sceneId } : undefined);
            }
            if (!pin) return;
            if (pin.moduleId != null && pin.moduleId !== MODULE.ID) return;
            const config = pin.config || {};
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
            if (panelManager.questPanel?.render && panelManager.element) {
                await panelManager.questPanel.render(panelManager.element);
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

/**
 * Register sync hooks so quest/objective flags stay aligned with the Pins API.
 * Mirrors the Notes panel resilience: any external pin change triggers a reconcile.
 */
export function registerQuestPinSync() {
    if (questPinSyncRegistered) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const handle = async (payload = {}) => {
        if (payload.moduleId && payload.moduleId !== MODULE.ID) return;
        await reconcileQuestPins({ sceneId: payload.sceneId });
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.questPanel?.render && panelManager.element) {
            await panelManager.questPanel.render(panelManager.element);
        }
    };

    Hooks.on('blacksmith.pins.deleted', handle);
    Hooks.on('blacksmith.pins.unplaced', handle);
    Hooks.on('blacksmith.pins.placed', handle);
    Hooks.on('blacksmith.pins.updated', handle);
    Hooks.on('blacksmith.pins.created', handle);
    Hooks.on('blacksmith.pins.deletedAll', handle);
    Hooks.on('blacksmith.pins.deletedAllByType', handle);

    // Scene flag changes can also desync after bulk deletes.
    if (!questPinSceneSyncHookId) {
        questPinSceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || !changes?.flags) return;
            reconcileQuestPins({ sceneId: scene.id });
        });
    }

    questPinSyncRegistered = true;
}
