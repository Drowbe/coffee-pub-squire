/**
 * Quest Pin Utilities – Blacksmith Pins API integration
 *
 * Create, update, delete, and sync quest/objective pins. Ownership and
 * visibility use Blacksmith ownership; per-user hide-all uses
 * pins.setModuleVisibility(MODULE.ID, visible).
 */

import { MODULE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';

const QUEST_PIN_SIZE = { w: 50, h: 50 };
const OBJECTIVE_PIN_SIZE = { w: 30, h: 30 };
export const QUEST_PIN_BACKGROUND = '#682008';
export const OBJECTIVE_PIN_BACKGROUND = '#8c2d0d';
const QUEST_ICON = '<i class="fa-solid fa-flag"></i>';
const OBJECTIVE_ICON = '<i class="fa-solid fa-sign-post"></i>';

/** Quest status / state → border (stroke) color (hex). Background is fixed QUEST_PIN_BACKGROUND. */
const QUEST_STATUS_COLORS = {
    'Complete': '#0ea40e',
    'Failed': '#d51301',
    'In Progress': '#ffffff',
    'Not Started': '#ffffff',
    'hidden': '#a3a3a3'
};

/** Objective state → border (stroke) color (hex). Background is fixed OBJECTIVE_PIN_BACKGROUND. */
const OBJECTIVE_STATE_COLORS = {
    active: '#ffffff',
    completed: '#0ea40e',
    failed: '#d51301',
    hidden: '#a3a3a3'
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
 * Resolve quest pin image string from page flags (for pins.create image property).
 * @param {JournalEntryPage} page - Quest journal page
 * @returns {string} FA HTML, FA class string, or image URL
 */
function getQuestPinImageFromPage(page) {
    if (!page) return QUEST_ICON;
    const iconFlag = page.getFlag(MODULE.ID, 'questIcon');
    if (!iconFlag) return QUEST_ICON;
    if (typeof iconFlag === 'object') {
        if (iconFlag.type === 'fa' && iconFlag.value) {
            const v = String(iconFlag.value).trim();
            return v.startsWith('<i') ? v : `<i class="${v}"></i>`;
        }
        if (iconFlag.type === 'img' && iconFlag.value) return iconFlag.value;
    }
    if (typeof iconFlag === 'string') {
        const t = iconFlag.trim();
        if (t.startsWith('<i') && t.includes('fa-')) return t;
        if (t.includes('fa-')) return `<i class="${t}"></i>`;
        return t;
    }
    return QUEST_ICON;
}

/**
 * Get quest pin design from page flags and default setting.
 * @param {JournalEntryPage} page - Quest journal page
 * @returns {{ size, shape, style, dropShadow, textLayout, textDisplay, textColor, textSize, textMaxLength, textMaxWidth, textScaleWithPin }}
 */
function getQuestPinDesignFromPage(page) {
    const defaultDesign = game.settings.get(MODULE.ID, 'questPinDefaultDesign') || {};
    const size = page?.getFlag(MODULE.ID, 'questPinSize') ?? defaultDesign.size ?? QUEST_PIN_SIZE;
    const shape = page?.getFlag(MODULE.ID, 'questPinShape') ?? defaultDesign.shape ?? 'circle';
    const style = page?.getFlag(MODULE.ID, 'questPinStyle') ?? defaultDesign.style ?? {};
    const dropShadow = page?.getFlag(MODULE.ID, 'questPinDropShadow') ?? defaultDesign.dropShadow ?? true;
    const textLayout = page?.getFlag(MODULE.ID, 'questPinTextLayout') ?? defaultDesign.textLayout ?? 'right';
    const textDisplay = page?.getFlag(MODULE.ID, 'questPinTextDisplay') ?? defaultDesign.textDisplay ?? 'hover';
    const textColor = page?.getFlag(MODULE.ID, 'questPinTextColor') ?? defaultDesign.textColor ?? '#ffffff';
    const textSize = page?.getFlag(MODULE.ID, 'questPinTextSize') ?? defaultDesign.textSize ?? 12;
    const textMaxLength = page?.getFlag(MODULE.ID, 'questPinTextMaxLength') ?? defaultDesign.textMaxLength ?? 0;
    const textMaxWidth = page?.getFlag(MODULE.ID, 'questPinTextMaxWidth') ?? defaultDesign.textMaxWidth ?? 30;
    const textScaleWithPin = page?.getFlag(MODULE.ID, 'questPinTextScaleWithPin') ?? defaultDesign.textScaleWithPin ?? true;
    return {
        size: size && typeof size.w === 'number' && typeof size.h === 'number' ? size : QUEST_PIN_SIZE,
        shape: shape === 'circle' || shape === 'square' || shape === 'none' ? shape : 'square',
        style: typeof style === 'object' ? style : {},
        dropShadow: !!dropShadow,
        textLayout,
        textDisplay,
        textColor,
        textSize,
        textMaxLength,
        textMaxWidth,
        textScaleWithPin
    };
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
 * Get border (stroke) color for a quest pin by status (or hidden state). Background is fixed.
 * @param {string} status - e.g. 'Not Started', 'In Progress', 'Complete', 'Failed'
 * @param {string} [questState] - 'visible' | 'hidden'; if 'hidden', returns hidden color
 * @returns {string} Hex color
 */
export function getQuestPinColor(status, questState) {
    if (questState === 'hidden') return QUEST_STATUS_COLORS.hidden ?? '#a3a3a3';
    return QUEST_STATUS_COLORS[status] ?? QUEST_STATUS_COLORS['Not Started'];
}

/**
 * Get border (stroke) color for an objective pin by state. Background is fixed.
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
    const strokeColor = getQuestPinColor(questStatus, questState);
    const design = getQuestPinDesignFromPage(page);
    const image = getQuestPinImageFromPage(page);
    const style = { ...design.style, fill: QUEST_PIN_BACKGROUND, stroke: strokeColor, strokeWidth: design.style?.strokeWidth ?? 2, iconColor: design.style?.iconColor ?? '#ffffff' };

    const questTitle = (page?.name || 'Quest').trim();
    const pinTitle = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: 'quest',
        shape: design.shape,
        text: pinTitle,
        image,
        size: design.size,
        style,
        dropShadow: design.dropShadow,
        textLayout: design.textLayout,
        textDisplay: design.textDisplay,
        textColor: design.textColor,
        textSize: design.textSize,
        textMaxLength: design.textMaxLength,
        textMaxWidth: design.textMaxWidth,
        textScaleWithPin: design.textScaleWithPin,
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
    const strokeColor = getObjectivePinColor(objState);

    const objNum = String((objectiveIndex ?? 0) + 1).padStart(2, '0');
    const objectiveText = (objective?.text || 'Objective').trim();
    const pinTitle = `Quest ${questNum}.${objNum}: ${objectiveText}${objectiveText.endsWith('.') ? '' : '.'}`;

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: 'objective',
        shape: 'square',
        text: pinTitle,
        image: OBJECTIVE_ICON,
        size: OBJECTIVE_PIN_SIZE,
        style: { fill: OBJECTIVE_PIN_BACKGROUND, stroke: strokeColor, strokeWidth: 2, iconColor: '#ffffff' },
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
 * Uses stored pinId and objectivePins on the page when present; otherwise finds by config.questUuid.
 * @param {string} questUuid - Quest page UUID
 * @param {string} [sceneId] - If provided, only delete from this scene
 */
export async function deleteQuestPins(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page = await fromUuid(questUuid);
    const storedPinId = page?.getFlag(MODULE.ID, 'pinId');
    const storedSceneId = page?.getFlag(MODULE.ID, 'sceneId');
    const objectivePins = page?.getFlag(MODULE.ID, 'objectivePins') || {};
    const targetScenes = sceneId ? [sceneId] : game.scenes.contents.map(s => s.id);

    if (storedPinId && (!sceneId || storedSceneId === sceneId)) {
        try {
            await pins.delete(storedPinId, { sceneId: storedSceneId });
        } catch (e) {
            console.warn('Coffee Pub Squire | deleteQuestPins (quest pin):', e);
        }
    }
    for (const key of Object.keys(objectivePins)) {
        const obj = objectivePins[key];
        const pinId = obj?.pinId ?? obj;
        const objSceneId = typeof obj === 'object' && obj?.sceneId != null ? obj.sceneId : null;
        if (!pinId || (sceneId && objSceneId !== sceneId)) continue;
        try {
            await pins.delete(pinId, { sceneId: objSceneId });
        } catch (e) {
            console.warn('Coffee Pub Squire | deleteQuestPins (objective pin):', e);
        }
    }
    for (const sid of targetScenes) {
        const list = pins.list({ moduleId: MODULE.ID, sceneId: sid }) || [];
        const forQuest = list.filter(p => p.config?.questUuid === questUuid);
        for (const pin of forQuest) {
            try {
                await pins.delete(pin.id, { sceneId: sid });
            } catch (e) {
                console.warn('Coffee Pub Squire | deleteQuestPins (orphan):', e);
            }
        }
    }

    if (page) {
        if (!sceneId) {
            await page.setFlag(MODULE.ID, 'pinId', null);
            await page.setFlag(MODULE.ID, 'sceneId', null);
            await page.setFlag(MODULE.ID, 'objectivePins', {});
        } else {
            if (storedPinId && storedSceneId === sceneId) {
                await page.setFlag(MODULE.ID, 'pinId', null);
                await page.setFlag(MODULE.ID, 'sceneId', null);
            }
            const nextObjectivePins = { ...objectivePins };
            for (const key of Object.keys(nextObjectivePins)) {
                const obj = nextObjectivePins[key];
                const objSceneId = typeof obj === 'object' && obj?.sceneId != null ? obj.sceneId : null;
                if (objSceneId === sceneId) delete nextObjectivePins[key];
            }
            await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);
        }
    }
}

/**
 * Unplace the quest-level pin from the canvas (pin remains, can be placed again).
 * Caller should clear page flags (sceneId) after this so UI shows dim.
 * @param {JournalEntryPage} page - Quest journal page
 */
export async function unplaceQuestPinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const pinId = page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;
    const sceneId = page?.getFlag(MODULE.ID, 'sceneId') || canvas?.scene?.id || undefined;

    if (typeof pins.unplace === 'function') {
        try {
            await pins.unplace(pinId);
        } catch (e) {
            if (typeof pins.update === 'function') {
                await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
            } else {
                throw e;
            }
        }
    } else if (typeof pins.update === 'function') {
        await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
    }

    if (sceneId && typeof pins.reload === 'function') {
        await pins.reload({ sceneId });
    }
}

/**
 * Unplace an objective pin from the canvas (pin remains, can be placed again).
 * Updates page flag objectivePins so that entry keeps pinId but no sceneId.
 * @param {JournalEntryPage} page - Quest journal page
 * @param {number} objectiveIndex - Task index
 */
export async function unplaceObjectivePinForPage(page, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const objectivePins = page?.getFlag(MODULE.ID, 'objectivePins') || {};
    const objPin = objectivePins[String(objectiveIndex)] ?? objectivePins[objectiveIndex];
    const pinId = objPin?.pinId ?? objPin;
    const sceneId = typeof objPin === 'object' && objPin?.sceneId != null ? objPin.sceneId : (canvas?.scene?.id || undefined);
    if (!pinId) return;

    // If the pin isn't actually on a scene anymore, treat it as already unplaced and
    // clear the stored sceneId so the UI shows dim instead of trying to unplace again.
    const pinExistsOnScene = typeof pins.exists === 'function'
        ? pins.exists(pinId, sceneId ? { sceneId } : undefined)
        : !!pins.get?.(pinId, sceneId ? { sceneId } : undefined);
    if (!pinExistsOnScene) {
        const nextObjectivePins = { ...objectivePins };
        nextObjectivePins[String(objectiveIndex)] = { pinId };
        await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);
        return;
    }

    if (typeof pins.unplace === 'function') {
        try {
            await pins.unplace(pinId);
        } catch (e) {
            if (typeof pins.update === 'function') {
                await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
            } else {
                throw e;
            }
        }
    } else if (typeof pins.update === 'function') {
        await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
    }

    const nextObjectivePins = { ...objectivePins };
    nextObjectivePins[String(objectiveIndex)] = { pinId };
    await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);

    if (sceneId && typeof pins.reload === 'function') {
        await pins.reload({ sceneId });
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
    const questNum = getQuestNumber(page.uuid);
    const questTitle = (page?.name || 'Quest').trim();

    for (const pin of forQuest) {
        const patch = {};
        if (pin.type === 'quest') {
            patch.style = {
                ...(pin.style || {}),
                fill: QUEST_PIN_BACKGROUND,
                stroke: getQuestPinColor(questStatus, questState),
                strokeWidth: 2,
                iconColor: '#ffffff'
            };
            patch.config = { ...(pin.config || {}), questStatus, questState };
            patch.text = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
        } else if (pin.type === 'objective' && typeof pin.config?.objectiveIndex === 'number') {
            const obj = quest.tasks[pin.config.objectiveIndex];
            const objState = obj?.state || 'active';
            patch.style = {
                ...(pin.style || {}),
                fill: OBJECTIVE_PIN_BACKGROUND,
                stroke: getObjectivePinColor(objState),
                strokeWidth: 2,
                iconColor: '#ffffff'
            };
            patch.config = { ...(pin.config || {}), objectiveState: objState, objectiveText: (obj?.text || '').trim() };
            const objNum = String((pin.config.objectiveIndex ?? 0) + 1).padStart(2, '0');
            const objectiveText = (obj?.text || 'Objective').trim();
            patch.text = `Quest ${questNum}.${objNum}: ${objectiveText}${objectiveText.endsWith('.') ? '' : '.'}`;
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

/**
 * Reconcile quest/objective page flags with actual pins in the Pins API.
 * - Restores pinId/sceneId on pages when pins exist.
 * - Clears stale flags when pins were deleted or unplaced externally.
 * @param {object} [opts]
 * @param {string|string[]} [opts.sceneId] - Scene(s) to scope placed pin lookup; defaults to all scenes.
 */
export async function reconcileQuestPins(opts = {}) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const sceneIds = opts.sceneId
        ? Array.isArray(opts.sceneId) ? opts.sceneId : [opts.sceneId]
        : game.scenes.contents.map(s => s.id);

    // Gather placed pins from scoped scenes and unplaced pins.
    const placedPins = [];
    for (const sid of sceneIds) {
        const list = pins.list({ moduleId: MODULE.ID, sceneId: sid }) || [];
        placedPins.push(...list);
    }
    const unplacedPins = pins.list({ moduleId: MODULE.ID, unplacedOnly: true }) || [];
    const allPins = [...placedPins, ...unplacedPins].filter(p => p?.config?.questUuid);

    // Build lookup by questUuid + objectiveIndex (nullable).
    const byQuest = new Map();
    for (const pin of allPins) {
        const qid = pin.config.questUuid;
        if (!qid) continue;
        const objIndex = typeof pin.config.objectiveIndex === 'number' ? pin.config.objectiveIndex : null;
        const key = objIndex === null ? qid : `${qid}|${objIndex}`;
        byQuest.set(key, pin);
    }

    // Walk all quest pages to repair flags.
    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    const pages = journal?.pages ?? [];

    for (const page of pages) {
        if (!page) continue;
        const qid = page.uuid;

        // Quest-level pin
        const questPin = byQuest.get(qid);
        const questExists = questPin ? true : false;
        if (questExists) {
            await page.setFlag(MODULE.ID, 'pinId', questPin.id);
            await page.setFlag(MODULE.ID, 'sceneId', questPin.sceneId ?? null);
        } else {
            // Verify stored pinId still exists; clear if not.
            const storedId = page.getFlag(MODULE.ID, 'pinId');
            if (storedId && !pins.exists(storedId)) {
                await page.setFlag(MODULE.ID, 'pinId', null);
                await page.setFlag(MODULE.ID, 'sceneId', null);
            }
        }

        // Objective pins
        const objectivePinsFlag = page.getFlag(MODULE.ID, 'objectivePins') || {};
        const nextObjectivePins = { ...objectivePinsFlag };

        // Clear stale entries
        for (const [key, val] of Object.entries(objectivePinsFlag)) {
            const pinId = val?.pinId ?? val;
            const exists = pinId && pins.exists(pinId);
            if (!exists) delete nextObjectivePins[key];
        }

        // Add/refresh entries from live pins
        const questPinsForPage = allPins.filter(p => p.config.questUuid === qid && p.type === 'objective');
        for (const pin of questPinsForPage) {
            const idx = pin.config.objectiveIndex;
            if (typeof idx !== 'number') continue;
            nextObjectivePins[String(idx)] = { pinId: pin.id, sceneId: pin.sceneId ?? null };
        }

        await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);
    }
}
