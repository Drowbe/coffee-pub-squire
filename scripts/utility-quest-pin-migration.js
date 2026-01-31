/**
 * Quest Pin Data Migration Utilities
 * 
 * One-time migration from legacy PIXI-based quest pins (stored in scene flags)
 * to Blacksmith Pin API (managed by Blacksmith).
 */

import { MODULE } from './const.js';
import { getPinsApi, calculateQuestPinOwnership } from './utility-quest-pins.js';
import { QuestParser } from './utility-quest-parser.js';

/**
 * Migrate legacy quest pins from scene flags to Blacksmith API
 * This function should be called once per scene when canvas is ready
 * 
 * @param {Scene} scene - The scene to migrate pins for
 * @returns {Promise<Object>} Migration result { migrated: number, skipped: number, errors: number }
 */
export async function migrateLegacyQuestPins(scene) {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) {
        console.warn(`${MODULE.ID} | Cannot migrate pins: Blacksmith API not available`);
        return { migrated: 0, skipped: 0, errors: 0 };
    }
    
    // Check if migration already completed for this scene
    const migrationComplete = scene.getFlag(MODULE.ID, 'questPinsMigrated');
    if (migrationComplete) {
        console.log(`${MODULE.ID} | Quest pins already migrated for scene: ${scene.name}`);
        return { migrated: 0, skipped: 0, errors: 0 };
    }
    
    // Get legacy pin data from scene flags
    const legacyPins = scene.getFlag(MODULE.ID, 'questPins') || [];
    
    if (legacyPins.length === 0) {
        console.log(`${MODULE.ID} | No legacy quest pins to migrate for scene: ${scene.name}`);
        await scene.setFlag(MODULE.ID, 'questPinsMigrated', true);
        return { migrated: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`${MODULE.ID} | Migrating ${legacyPins.length} legacy quest pins for scene: ${scene.name}`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const legacyPin of legacyPins) {
        try {
            // Validate legacy pin data
            if (!legacyPin.questUuid || !legacyPin.pinId) {
                console.warn(`${MODULE.ID} | Skipping invalid legacy pin:`, legacyPin);
                skipped++;
                continue;
            }
            
            // Check if quest still exists
            const page = await fromUuid(legacyPin.questUuid);
            if (!page) {
                console.warn(`${MODULE.ID} | Skipping orphaned pin (quest not found): ${legacyPin.questUuid}`);
                skipped++;
                continue;
            }
            
            // Determine pin type
            const isObjectivePin = legacyPin.objectiveIndex !== null && legacyPin.objectiveIndex !== undefined;
            const pinType = isObjectivePin ? 'objective' : 'quest';
            
            // For objective pins, get the objective data
            let objective = null;
            if (isObjectivePin) {
                // Parse quest to get objective data
                const enrichedHtml = await TextEditor.enrichHTML(page.text?.content || '', { async: true });
                const quest = await QuestParser.parseSinglePage(page, enrichedHtml);
                
                if (quest && quest.tasks && quest.tasks[legacyPin.objectiveIndex]) {
                    objective = quest.tasks[legacyPin.objectiveIndex];
                } else {
                    console.warn(`${MODULE.ID} | Objective not found for pin:`, legacyPin);
                    skipped++;
                    continue;
                }
            }
            
            // Calculate ownership
            const ownership = calculateQuestPinOwnership(page, objective);
            
            // Build pin data
            const pinData = {
                id: legacyPin.pinId, // Preserve original pin ID
                moduleId: MODULE.ID,
                type: pinType,
                shape: pinType === 'quest' ? 'circle' : 'square',
                image: pinType === 'quest' 
                    ? '<i class="fa-solid fa-scroll"></i>' 
                    : '<i class="fa-solid fa-bullseye"></i>',
                text: isObjectivePin 
                    ? `Q${legacyPin.questIndex}.${legacyPin.objectiveIndex + 1}`
                    : `Q${legacyPin.questIndex}`,
                size: pinType === 'quest' ? 32 : 28,
                style: {
                    fill: '#ffff00', // Default yellow, will be updated by state sync
                    stroke: '#000000',
                    strokeWidth: 2
                },
                ownership,
                config: {
                    questUuid: legacyPin.questUuid,
                    questIndex: legacyPin.questIndex,
                    ...(isObjectivePin && {
                        objectiveIndex: legacyPin.objectiveIndex,
                        objectiveState: objective?.state || 'active'
                    }),
                    ...(legacyPin.questCategory && { questCategory: legacyPin.questCategory }),
                    ...(legacyPin.questState && { questState: legacyPin.questState }),
                    ...(legacyPin.questStatus && { questStatus: legacyPin.questStatus })
                }
            };
            
            // Create the pin via API
            const newPin = await pins.create(pinData);
            
            // Place it on the scene at the original coordinates
            await pins.place(newPin.id, { 
                sceneId: scene.id, 
                x: legacyPin.x, 
                y: legacyPin.y 
            });
            
            migrated++;
            console.log(`${MODULE.ID} | Migrated pin: ${newPin.id} (${pinType})`);
            
        } catch (error) {
            console.error(`${MODULE.ID} | Error migrating pin:`, legacyPin, error);
            errors++;
        }
    }
    
    // Mark migration as complete
    await scene.setFlag(MODULE.ID, 'questPinsMigrated', true);
    
    // Clear legacy pin data (optional - keep for rollback safety)
    // await scene.unsetFlag(MODULE.ID, 'questPins');
    
    console.log(`${MODULE.ID} | Migration complete for scene ${scene.name}: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
    
    return { migrated, skipped, errors };
}

/**
 * Migrate all scenes in the world
 * Should be called once after module update
 * 
 * @returns {Promise<Object>} Total migration results
 */
export async function migrateAllScenes() {
    const pins = getPinsApi();
    if (!pins || !pins.isAvailable()) {
        ui.notifications.warn('Cannot migrate quest pins: Blacksmith module not available');
        return { migrated: 0, skipped: 0, errors: 0 };
    }
    
    await pins.whenReady();
    
    const totalResults = { migrated: 0, skipped: 0, errors: 0 };
    
    for (const scene of game.scenes) {
        const result = await migrateLegacyQuestPins(scene);
        totalResults.migrated += result.migrated;
        totalResults.skipped += result.skipped;
        totalResults.errors += result.errors;
    }
    
    if (totalResults.migrated > 0) {
        ui.notifications.info(`Quest pin migration complete: ${totalResults.migrated} pins migrated`);
    }
    
    return totalResults;
}

/**
 * Check if a scene needs migration
 * @param {Scene} scene - The scene to check
 * @returns {boolean} True if migration is needed
 */
export function needsMigration(scene) {
    const migrationComplete = scene.getFlag(MODULE.ID, 'questPinsMigrated');
    const legacyPins = scene.getFlag(MODULE.ID, 'questPins') || [];
    return !migrationComplete && legacyPins.length > 0;
}
