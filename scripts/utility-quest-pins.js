/**
 * Quest Pin Utilities – Blacksmith Pins API integration
 *
 * Create, update, delete, and sync quest/objective pins. Ownership and
 * visibility use Blacksmith ownership; per-user hide-all uses
 * pins.setModuleVisibility(MODULE.ID, visible).
 */

import { MODULE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';

const QUEST_PIN_SIZE = { w: 32, h: 32 };
const OBJECTIVE_PIN_SIZE = { w: 28, h: 28 };
const QUEST_ICON = '<i class="fa-solid fa-scroll"></i>';
const OBJECTIVE_ICON = '<i class="fa-solid fa-bullseye"></i>';

/** Quest status / state → fill color (hex) */
const QUEST_STATUS_COLORS = {
    'Complete': '#00ff00',
    'Failed': '#ff0000',
    'In Progress': '#ffff00',
    'Not Started': '#ffffff',
    'hidden': '#000000'
};

/** Objective state → fill color (hex) */
const OBJECTIVE_STATE_COLORS = {
    active: '#ffff00',
    completed: '#00ff00',
    failed: '#ff0000',
    hidden: '#000000'
};

function getQuestNumber(questUuid) {
    if (!questUuid || typeof questUuid !== 'string') return 1;
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

/**
 * Get the Blacksmith Pins API.
 * @returns {object|undefined}
 */
export function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins;
}

/**
 * Check whether the Pins API is available.
 * @param {object} [pins] - Optional API instance; if omitted, uses getPinsApi()
 * @returns {boolean}
 */
export function isPinsApiAvailable(pins) {
    const api = pins ?? getPinsApi();
    return typeof api?.isAvailable === 'function' && api.isAvailable();
}

/**
 * Calculate pin ownership from quest/objective visibility.
 * GMs always get OWNER; hidden quest/objective → NONE for default, GMs in users.
 * @param {JournalEntryPage} page - Quest journal page
 * @param {object|null} [objective] - Objective data (null for quest-level pin)
 * @returns {object} Ownership for pins.create/pins.update
 */
export function calculateQuestPinOwnership(page, objective = null) {
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });

    const questVisible = page?.getFlag(MODULE.ID, 'visible') !== false;
    if (!questVisible) {
        return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    }

    if (objective && objective.state === 'hidden') {
        return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    }

    return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, users: gmUsers };
}

/**
 * Get fill color for a quest pin by status (or hidden state).
 * @param {string} status - e.g. 'Not Started', 'In Progress', 'Complete', 'Failed'
 * @param {string} [questState] - 'visible' | 'hidden'; if 'hidden', returns black
 * @returns {string} Hex color
 */
export function getQuestPinColor(status, questState) {
    if (questState === 'hidden') return QUEST_STATUS_COLORS.hidden ?? '#000000';
    return QUEST_STATUS_COLORS[status] ?? QUEST_STATUS_COLORS['Not Started'];
}

/**
 * Get fill color for an objective pin by state.
 * @param {string} state - 'active' | 'completed' | 'failed' | 'hidden'
 * @returns {string} Hex color
 */
export function getObjectivePinColor(state) {
    return OBJECTIVE_STATE_COLORS[state] ?? OBJECTIVE_STATE_COLORS.active;
}

/**
 * Create a quest-level pin and optionally place it on a scene.
 * @param {object} opts - questUuid, questIndex, questCategory, questStatus, questState, x, y, sceneId
 * @returns {Promise<object|null>} Created pin data or null
 */
export async function createQuestPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;

    const {
        questUuid,
        questIndex,
        questCategory = 'Side Quest',
        questStatus = 'Not Started',
        questState = 'visible',
        x,
        y,
        sceneId
    } = opts;

    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership = calculateQuestPinOwnership(page);
    const questNum = typeof questIndex === 'number' ? questIndex : getQuestNumber(questUuid);
    const fillColor = getQuestPinColor(questStatus, questState);

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: 'quest',
        shape: 'circle',
        text: `Q${questNum}`,
        image: QUEST_ICON,
        size: QUEST_PIN_SIZE,
        style: { fill: fillColor, stroke: '#000000', strokeWidth: 2, iconColor: '#ffffff' },
        ownership,
        config: {
            questUuid,
            questIndex: questNum,
            questCategory,
            questStatus,
            questState
        }
    };

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) {
        pinData.x = x;
        pinData.y = y;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createQuestPin:', err);
        return null;
    }
}

/**
 * Create an objective-level pin and optionally place it on a scene.
 * @param {object} opts - questUuid, objectiveIndex, questIndex, questCategory, questState, objective, x, y, sceneId
 * @returns {Promise<object|null>} Created pin data or null
 */
export async function createObjectivePin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;

    const {
        questUuid,
        objectiveIndex,
        questIndex,
        questCategory = 'Side Quest',
        questState = 'visible',
        objective = { state: 'active', text: '' },
        x,
        y,
        sceneId
    } = opts;

    const page = await fromUuid(questUuid);
    if (!page) return null;

    const objState = objective.state || 'active';
    const ownership = calculateQuestPinOwnership(page, objective);
    const questNum = typeof questIndex === 'number' ? questIndex : getQuestNumber(questUuid);
    const fillColor = getObjectivePinColor(objState);

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: 'objective',
        shape: 'square',
        text: `Q${questNum}.${(objectiveIndex ?? 0) + 1}`,
        image: OBJECTIVE_ICON,
        size: OBJECTIVE_PIN_SIZE,
        style: { fill: fillColor, stroke: '#000000', strokeWidth: 2, iconColor: '#ffffff' },
        ownership,
        config: {
            questUuid,
            questIndex: questNum,
            objectiveIndex: objectiveIndex ?? 0,
            questCategory,
            questState,
            objectiveState: objState,
            objectiveText: (objective.text || '').trim()
        }
    };

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) {
        pinData.x = x;
        pinData.y = y;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createObjectivePin:', err);
        return null;
    }
}

/**
 * Delete all pins for a quest on a scene (or all scenes if sceneId omitted).
 * @param {string} questUuid - Quest page UUID
 * @param {string} [sceneId] - If provided, only delete from this scene
 */
export async function deleteQuestPins(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const targetScenes = sceneId ? [sceneId] : game.scenes.contents.map(s => s.id);
    for (const sid of targetScenes) {
        const list = pins.list({ moduleId: MODULE.ID, sceneId: sid }) || [];
        const forQuest = list.filter(p => p.config?.questUuid === questUuid);
        for (const pin of forQuest) {
            try {
                await pins.delete(pin.id, { sceneId: sid });
            } catch (e) {
                console.warn('Coffee Pub Squire | deleteQuestPins:', e);
            }
        }
    }
}

/**
 * Reload pins for the current scene (e.g. after visibility toggle).
 */
export async function reloadAllQuestPins() {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !canvas?.scene) return;
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
}

/**
 * Update ownership for all pins belonging to a quest (e.g. after visibility flag change).
 * @param {string} questUuid - Quest page UUID
 * @param {string} [sceneId] - Optional scene; defaults to canvas.scene.id
 */
export async function updateQuestPinVisibility(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const sid = sceneId ?? canvas?.scene?.id;
    if (!sid) return;

    const page = await fromUuid(questUuid);
    if (!page) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}

    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest = await QuestParser.parseSinglePage(page, enrichedHtml);
    const tasks = quest?.tasks ?? [];

    const list = pins.list({ moduleId: MODULE.ID, sceneId: sid }) || [];
    const forQuest = list.filter(p => p.config?.questUuid === questUuid);

    for (const pin of forQuest) {
        const objective = pin.type === 'objective' && typeof pin.config?.objectiveIndex === 'number'
            ? tasks[pin.config.objectiveIndex]
            : null;
        const ownership = calculateQuestPinOwnership(page, objective);
        try {
            await pins.update(pin.id, { ownership }, { sceneId: sid });
        } catch (e) {
            console.warn('Coffee Pub Squire | updateQuestPinVisibility:', e);
        }
    }

    if (typeof pins.reload === 'function') await pins.reload({ sceneId: sid });
}

/**
 * Update pin styles (colors) for all pins belonging to a quest page after content change.
 * @param {JournalEntryPage} page - Quest journal page
 * @param {string} [sceneId] - Optional scene; defaults to canvas.scene.id
 */
export async function updateQuestPinStylesForPage(page, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !page) return;

    const sid = sceneId ?? canvas?.scene?.id;
    if (!sid) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}

    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest = await QuestParser.parseSinglePage(page, enrichedHtml);
    if (!quest) return;

    const list = pins.list({ moduleId: MODULE.ID, sceneId: sid }) || [];
    const forQuest = list.filter(p => p.config?.questUuid === page.uuid);
    const questStatus = quest.status || 'Not Started';
    const questState = page.getFlag(MODULE.ID, 'visible') === false ? 'hidden' : 'visible';

    for (const pin of forQuest) {
        const patch = {};
        if (pin.type === 'quest') {
            patch.style = {
                ...(pin.style || {}),
                fill: getQuestPinColor(questStatus, questState),
                stroke: '#000000',
                strokeWidth: 2,
                iconColor: '#ffffff'
            };
            patch.config = { ...(pin.config || {}), questStatus, questState };
        } else if (pin.type === 'objective' && typeof pin.config?.objectiveIndex === 'number') {
            const obj = quest.tasks[pin.config.objectiveIndex];
            const objState = obj?.state || 'active';
            patch.style = {
                ...(pin.style || {}),
                fill: getObjectivePinColor(objState),
                stroke: '#000000',
                strokeWidth: 2,
                iconColor: '#ffffff'
            };
            patch.config = { ...(pin.config || {}), objectiveState: objState, objectiveText: (obj?.text || '').trim() };
        }
        if (Object.keys(patch).length) {
            try {
                await pins.update(pin.id, patch, { sceneId: sid });
            } catch (e) {
                console.warn('Coffee Pub Squire | updateQuestPinStylesForPage:', e);
            }
        }
    }

    if (typeof pins.reload === 'function') await pins.reload({ sceneId: sid });
}

/**
 * Set per-user visibility of all Squire quest pins (Blacksmith module visibility).
 * @param {boolean} visible
 */
export async function setQuestPinModuleVisibility(visible) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.setModuleVisibility !== 'function') return;
    await pins.setModuleVisibility(MODULE.ID, visible);
}

/**
 * Get current per-user visibility of Squire quest pins.
 * @returns {boolean}
 */
export function getQuestPinModuleVisibility() {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.getModuleVisibility !== 'function') return true;
    return pins.getModuleVisibility(MODULE.ID) !== false;
}
