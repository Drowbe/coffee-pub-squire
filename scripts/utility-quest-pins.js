/**
 * Quest Pin Utilities for Blacksmith Pin API Integration
 * 
 * This module provides helper functions for managing quest pins via the Blacksmith Pin API.
 * It replaces the legacy PIXI-based QuestPin class with simple API calls.
 * 
 * Key principle: We translate existing quest visibility logic to pin ownership.
 * The underlying quest system (flags, HTML markup, parsing) remains unchanged.
 */

import { MODULE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';

/**
 * Get the Blacksmith Pins API
 * @returns {Object|null} Pins API or null if not available
 */
export function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins || null;
}

/**
 * Check if Blacksmith Pins API is available
 * @returns {boolean} True if API is available
 */
export function isPinsApiAvailable() {
    const pins = getPinsApi();
    return pins?.isAvailable() || false;
}

/**
 * Wait for Blacksmith Pins API to be ready
 * @returns {Promise<boolean>} Resolves to true when ready, false if unavailable
 */
export async function waitForPinsApi() {
    const pins = getPinsApi();
    if (!pins) return false;
    
    try {
        await pins.whenReady();
        return true;
    } catch (error) {
        console.error(`${MODULE.ID} | Failed to wait for Blacksmith Pins API:`, error);
        return false;
    }
}

/**
 * Calculate pin ownership based on quest visibility logic
 * This translates the legacy shouldBeVisible() logic to Blacksmith ownership
 * 
 * @param {JournalEntryPage} page - Quest journal page
 * @param {Object} objective - Objective data (null for quest-level pins)
 * @returns {Object} Ownership object for Blacksmith pins
 */
export function calculateQuestPinOwnership(page, objective = null) {
    // Layer 1: Global hide-all (handled separately in create/update logic)
    const hideAll = game.user.getFlag(MODULE.ID, 'hideQuestPins');
    if (hideAll) {
        return { 
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, 
            users: {} 
        };
    }
    
    // Layer 2: GMs always see everything
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) {
            gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    });
    
    // Layer 3: Check quest visibility
    const questVisible = page?.getFlag(MODULE.ID, 'visible') !== false; // Default true
    if (!questVisible) {
        return { 
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, 
            users: gmUsers 
        };
    }
    
    // Layer 4: For objective pins, also check objective visibility
    if (objective && objective.state === 'hidden') { // From HTML <em> markup
        return { 
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, 
            users: gmUsers 
        };
    }
    
    // Layer 5: Visible to everyone
    return { 
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, 
        users: gmUsers 
    };
}

/**
 * Get quest pin color based on quest status
 * @param {string} status - Quest status ('Not Started', 'In Progress', 'Complete', 'Failed')
 * @param {string} state - Quest state ('visible', 'hidden')
 * @returns {string} Hex color code
 */
export function getQuestPinColor(status, state) {
    // TODO: Load from themes/quest-pins.json or settings
    if (state === 'hidden') return '#000000'; // Black for hidden
    
    switch (status) {
        case 'Complete': return '#00ff00'; // Green
        case 'Failed': return '#ff0000'; // Red
        case 'In Progress': return '#ffff00'; // Yellow
        case 'Not Started': return '#ffffff'; // White
        default: return '#ffff00'; // Default to yellow
    }
}

/**
 * Get objective pin color based on objective state
 * @param {string} state - Objective state ('active', 'completed', 'failed', 'hidden')
 * @returns {string} Hex color code
 */
export function getObjectivePinColor(state) {
    // TODO: Load from themes/quest-pins.json or settings
    switch (state) {
        case 'completed': return '#00ff00'; // Green
        case 'failed': return '#ff0000'; // Red
        case 'hidden': return '#000000'; // Black
        case 'active':
        default: return '#ffff00'; // Yellow
    }
}

/**
 * Create a quest pin via Blacksmith API
 * @param {Object} options - Pin creation options
 * @param {string} options.questUuid - Quest journal page UUID
 * @param {number} options.questIndex - Quest index number
 * @param {string} options.questCategory - Quest category
 * @param {string} options.questStatus - Quest status
 * @param {string} options.questState - Quest state ('visible' or 'hidden')
 * @param {number} options.x - X coordinate
 * @param {number} options.y - Y coordinate
 * @param {string} options.sceneId - Scene ID
 * @returns {Promise<Object|null>} Created pin or null if failed
 */
export async function createQuestPin(options) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) {
        console.warn(`${MODULE.ID} | Blacksmith Pins API not available`);
        return null;
    }
    
    const { questUuid, questIndex, questCategory, questStatus, questState, x, y, sceneId } = options;
    
    // Get the quest page for ownership calculation
    const page = await fromUuid(questUuid);
    if (!page) {
        console.error(`${MODULE.ID} | Quest page not found: ${questUuid}`);
        return null;
    }
    
    // Calculate ownership
    const ownership = calculateQuestPinOwnership(page);
    
    // Get color based on status
    const color = getQuestPinColor(questStatus, questState);
    
    // Build pin data
    const pinData = {
        id: foundry.utils.randomID(),
        moduleId: MODULE.ID,
        type: 'quest',
        shape: 'circle',
        image: '<i class="fa-solid fa-scroll"></i>', // TODO: Make configurable
        text: `Q${questIndex}`,
        size: 32, // TODO: Load from settings
        style: {
            fill: color,
            stroke: '#000000',
            strokeWidth: 2
        },
        ownership,
        config: {
            questUuid,
            questIndex,
            questCategory,
            questStatus,
            questState
        }
    };
    
    try {
        // Create the pin (unplaced)
        const pin = await pins.create(pinData);
        
        // Place it on the scene
        await pins.place(pin.id, { sceneId, x, y });
        
        console.log(`${MODULE.ID} | Created quest pin:`, pin.id);
        return pin;
    } catch (error) {
        console.error(`${MODULE.ID} | Failed to create quest pin:`, error);
        return null;
    }
}

/**
 * Create an objective pin via Blacksmith API
 * @param {Object} options - Pin creation options
 * @param {string} options.questUuid - Quest journal page UUID
 * @param {number} options.questIndex - Quest index number
 * @param {number} options.objectiveIndex - Objective index within quest
 * @param {string} options.questCategory - Quest category
 * @param {string} options.questState - Quest state ('visible' or 'hidden')
 * @param {Object} options.objective - Objective data from QuestParser
 * @param {number} options.x - X coordinate
 * @param {number} options.y - Y coordinate
 * @param {string} options.sceneId - Scene ID
 * @returns {Promise<Object|null>} Created pin or null if failed
 */
export async function createObjectivePin(options) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) {
        console.warn(`${MODULE.ID} | Blacksmith Pins API not available`);
        return null;
    }
    
    const { questUuid, questIndex, objectiveIndex, questCategory, questState, objective, x, y, sceneId } = options;
    
    // Get the quest page for ownership calculation
    const page = await fromUuid(questUuid);
    if (!page) {
        console.error(`${MODULE.ID} | Quest page not found: ${questUuid}`);
        return null;
    }
    
    // Calculate ownership (includes both quest AND objective visibility)
    const ownership = calculateQuestPinOwnership(page, objective);
    
    // Get color based on objective state
    const color = getObjectivePinColor(objective.state);
    
    // Build pin data
    const pinData = {
        id: foundry.utils.randomID(),
        moduleId: MODULE.ID,
        type: 'objective',
        shape: 'square',
        image: '<i class="fa-solid fa-bullseye"></i>', // TODO: Make configurable
        text: `Q${questIndex}.${objectiveIndex + 1}`,
        size: 28, // TODO: Load from settings
        style: {
            fill: color,
            stroke: '#000000',
            strokeWidth: 2
        },
        ownership,
        config: {
            questUuid,
            questIndex,
            objectiveIndex,
            questCategory,
            questState,
            objectiveState: objective.state,
            objectiveText: objective.text
        }
    };
    
    try {
        // Create the pin (unplaced)
        const pin = await pins.create(pinData);
        
        // Place it on the scene
        await pins.place(pin.id, { sceneId, x, y });
        
        console.log(`${MODULE.ID} | Created objective pin:`, pin.id);
        return pin;
    } catch (error) {
        console.error(`${MODULE.ID} | Failed to create objective pin:`, error);
        return null;
    }
}

/**
 * Update quest pin ownership when visibility changes
 * @param {string} questUuid - Quest journal page UUID
 * @param {string} sceneId - Scene ID (optional, defaults to current scene)
 * @returns {Promise<void>}
 */
export async function updateQuestPinVisibility(questUuid, sceneId = null) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) return;
    
    sceneId = sceneId || canvas.scene?.id;
    if (!sceneId) return;
    
    // Get the quest page
    const page = await fromUuid(questUuid);
    if (!page) return;
    
    // Get all pins for this quest
    const allPins = pins.list({ moduleId: MODULE.ID, sceneId });
    const questPins = allPins.filter(p => p.config?.questUuid === questUuid);
    
    // Update ownership for each pin
    for (const pin of questPins) {
        const objective = pin.type === 'objective' && pin.config?.objectiveIndex !== undefined
            ? { state: pin.config.objectiveState } // Reconstruct objective for ownership calc
            : null;
        
        const ownership = calculateQuestPinOwnership(page, objective);
        
        try {
            await pins.update(pin.id, { ownership });
        } catch (error) {
            console.error(`${MODULE.ID} | Failed to update pin ownership:`, pin.id, error);
        }
    }
}

/**
 * Delete all pins for a quest
 * @param {string} questUuid - Quest journal page UUID
 * @param {string} sceneId - Scene ID (optional, defaults to current scene)
 * @returns {Promise<void>}
 */
export async function deleteQuestPins(questUuid, sceneId = null) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) return;
    
    sceneId = sceneId || canvas.scene?.id;
    if (!sceneId) return;
    
    // Get all pins for this quest
    const allPins = pins.list({ moduleId: MODULE.ID, sceneId });
    const questPins = allPins.filter(p => p.config?.questUuid === questUuid);
    
    // Delete each pin
    for (const pin of questPins) {
        try {
            await pins.delete(pin.id);
        } catch (error) {
            console.error(`${MODULE.ID} | Failed to delete pin:`, pin.id, error);
        }
    }
}

/**
 * Reload all quest pins (useful when global hide-all toggle changes)
 * @returns {Promise<void>}
 */
export async function reloadAllQuestPins() {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) return;
    
    try {
        await pins.reload({ moduleId: MODULE.ID });
        console.log(`${MODULE.ID} | Reloaded all quest pins`);
    } catch (error) {
        console.error(`${MODULE.ID} | Failed to reload quest pins:`, error);
    }
}

/**
 * Update pin styles (colors) and config when quest journal content changes.
 * Call from updateJournalEntryPage when changes.text is present.
 * @param {JournalEntryPage} page - Quest journal page (with updated content)
 * @param {string} sceneId - Scene ID (optional, defaults to current scene)
 * @returns {Promise<void>}
 */
export async function updateQuestPinStylesForPage(page, sceneId = null) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) return;
    
    sceneId = sceneId || canvas.scene?.id;
    if (!sceneId) return;
    
    const questUuid = page.uuid;
    const questVisible = page.getFlag(MODULE.ID, 'visible') !== false;
    const questState = questVisible ? 'visible' : 'hidden';
    
    let entry = null;
    try {
        const enrichedHtml = await TextEditor.enrichHTML(page.text?.content || '', { async: true });
        entry = await QuestParser.parseSinglePage(page, enrichedHtml);
    } catch (e) {
        console.warn(`${MODULE.ID} | Could not parse quest for pin style update:`, e);
        return;
    }
    
    if (!entry) return;
    
    const questStatus = entry.status || 'Not Started';
    const allPins = pins.list({ moduleId: MODULE.ID, sceneId });
    const questPins = allPins.filter(p => p.config?.questUuid === questUuid);
    
    for (const pin of questPins) {
        try {
            if (pin.type === 'quest') {
                const color = getQuestPinColor(questStatus, questState);
                await pins.update(pin.id, {
                    style: {
                        fill: color,
                        stroke: '#000000',
                        strokeWidth: 2
                    },
                    config: {
                        ...pin.config,
                        questStatus,
                        questState
                    }
                });
            } else if (pin.type === 'objective') {
                const objectiveIndex = pin.config?.objectiveIndex;
                if (objectiveIndex == null || !entry.tasks || !entry.tasks[objectiveIndex]) continue;
                const task = entry.tasks[objectiveIndex];
                const color = getObjectivePinColor(task.state);
                await pins.update(pin.id, {
                    style: {
                        fill: color,
                        stroke: '#000000',
                        strokeWidth: 2
                    },
                    config: {
                        ...pin.config,
                        objectiveState: task.state,
                        objectiveText: task.text
                    }
                });
            }
        } catch (error) {
            console.error(`${MODULE.ID} | Failed to update pin style:`, pin.id, error);
        }
    }
}
