import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';
// REMOVED: import { QuestPin, loadPersistedPins } from './quest-pin.js'; - Migrated to Blacksmith API
import { deleteQuestPins, reloadAllQuestPins, getPinsApi, createQuestPin, createObjectivePin, getQuestPinColor, getObjectivePinColor, setQuestPinModuleVisibility, getQuestPinModuleVisibility } from './utility-quest-pins.js';
import { copyToClipboard, getNativeElement, renderTemplate, getTextEditor } from './helpers.js';
import { trackModuleTimeout, clearTrackedTimeout, moduleDelay } from './timer-utils.js';
import { showJournalPicker } from './utility-journal.js';

// Helper function to get quest number from UUID
function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Quest notification functions - moved to QuestPanel class methods

export function notifyObjectiveCompleted(objectiveText) {
    try {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.addNotification) return;
        
        blacksmith.addNotification(
            `${objectiveText} completed!`,
            "fa-solid fa-check-circle",
            5, // 5 seconds
            MODULE.ID
        );
    } catch (error) {
        console.error('Coffee Pub Squire | Error sending objective completed notification:', error);
    }
}

export function notifyQuestCompleted(questName) {
    try {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.addNotification) return;
        
        blacksmith.addNotification(
            `Quest '${questName}' completed!`,
            "fa-solid fa-trophy",
            5, // 5 seconds
            MODULE.ID
        );
    } catch (error) {
        console.error('Coffee Pub Squire | Error sending quest completed notification:', error);
    }
}

// Quest notification functions - moved to QuestPanel class methods

export class QuestPanel {
    // Global notification IDs to prevent duplicates across QuestPanel instances
    static questNotificationId = null;
    static activeObjectiveNotificationId = null;
    
    constructor() {
        this.element = null;
        this.categories = game.settings.get(MODULE.ID, 'questCategories') || ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"];
        this.data = {};
        for (const category of this.categories) {
            this.data[category] = [];
        }
        this.selectedJournal = null;
        this.filters = {
            search: "",
            tags: [],
            category: "all"
        };
        this.allTags = new Set();
        this.isImporting = false; // Flag to prevent panel refreshes during import
        this._notificationDebounceTimeouts = {}; // Debounce timeouts for notifications
        this._verifyAndUpdateCategories();
        this._setupHooks();
    }

    /**
     * Notify that a quest has been pinned (update existing or create new)
     * @param {string} questName - The quest name
     * @param {string} questCategory - The quest category
     */
    notifyQuestPinned(questName, questCategory) {
        // Debounce rapid calls to prevent duplicate notifications
        const debounceKey = 'questPinned';
        if (this._notificationDebounceTimeouts[debounceKey]) {
            clearTrackedTimeout(this._notificationDebounceTimeouts[debounceKey]);
        }
        
        this._notificationDebounceTimeouts[debounceKey] = trackModuleTimeout(() => {
            this._doNotifyQuestPinned(questName, questCategory);
            delete this._notificationDebounceTimeouts[debounceKey];
        }, 100); // 100ms debounce
    }
    
    _doNotifyQuestPinned(questName, questCategory) {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.addNotification) return;
            
            const icon = questCategory === "Main Quest" ? "fa-solid fa-flag" : "fa-solid fa-map-signs";

            // Check if we already have a notification with this content to prevent duplicates
            if (QuestPanel.questNotificationId) {
                try {
                    // Update existing notification
                    const result = blacksmith.updateNotification(QuestPanel.questNotificationId, {
                        text: questName,
                        icon: icon,
                        duration: 0 // Keep persistent
                    });
                    
                    // If update failed, the notification might have been removed
                    if (!result) {
                        QuestPanel.questNotificationId = null;
                        // Fall through to create new notification
                    } else {
                        return; // Successfully updated, no need to create new
                    }
                } catch (updateError) {
                    console.warn('Coffee Pub Squire | Failed to update quest notification, creating new:', updateError);
                    QuestPanel.questNotificationId = null;
                    // Fall through to create new notification
                }
            }
            
            // Create new notification and store ID
            QuestPanel.questNotificationId = blacksmith.addNotification(
                questName,
                icon,
                0, // 0 = persistent until manually removed
                MODULE.ID
            );
        } catch (error) {
            console.error('Coffee Pub Squire | Error sending quest pinned notification:', error);
        }
    }

    /**
     * Clear quest notifications (remove the persistent quest notification)
     */
    clearQuestNotifications() {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.removeNotification || !QuestPanel.questNotificationId) return;
            
            blacksmith.removeNotification(QuestPanel.questNotificationId);
            QuestPanel.questNotificationId = null;
        } catch (error) {
            console.error('Coffee Pub Squire | Error clearing quest notifications:', error);
        }
    }

    /**
     * Notify that an objective is active (update existing or create new)
     * @param {string} questName - The quest name
     * @param {string} objectiveText - The objective text
     * @param {number} objectiveNumber - The objective number
     */
    notifyActiveObjective(questName, objectiveText, objectiveNumber) {
        // Debounce rapid calls to prevent duplicate notifications
        const debounceKey = 'activeObjective';
        if (this._notificationDebounceTimeouts[debounceKey]) {
            clearTrackedTimeout(this._notificationDebounceTimeouts[debounceKey]);
        }
        
        this._notificationDebounceTimeouts[debounceKey] = trackModuleTimeout(() => {
            this._doNotifyActiveObjective(questName, objectiveText, objectiveNumber);
            delete this._notificationDebounceTimeouts[debounceKey];
        }, 100); // 100ms debounce
    }
    
    _doNotifyActiveObjective(questName, objectiveText, objectiveNumber) {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.addNotification) {
                return;
            }
            
            const notificationText = objectiveText;
            const icon = "fa-solid fa-bullseye";
                       
            // Check if we already have a notification with this content to prevent duplicates
            if (QuestPanel.activeObjectiveNotificationId) {
                try {
                    // Update existing notification
                    const result = blacksmith.updateNotification(QuestPanel.activeObjectiveNotificationId, {
                        text: notificationText,
                        icon: icon,
                        duration: 0 // Keep persistent
                    });
                    
                    // If update failed, the notification might have been removed
                    if (!result) {
                        QuestPanel.activeObjectiveNotificationId = null;
                        // Fall through to create new notification
                    } else {
                        return; // Successfully updated, no need to create new
                    }
                } catch (updateError) {
                    QuestPanel.activeObjectiveNotificationId = null;
                    // Fall through to create new notification
                }
            }
            
            // Create new notification and store ID
            QuestPanel.activeObjectiveNotificationId = blacksmith.addNotification(
                notificationText,
                icon,
                0, // 0 = persistent until manually removed
                MODULE.ID
            );
        } catch (error) {
            console.error('Coffee Pub Squire | Error sending active objective notification:', error);
        }
    }

    /**
     * Clear active objective notification (remove the persistent active objective notification)
     */
    clearActiveObjectiveNotification() {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.removeNotification || !QuestPanel.activeObjectiveNotificationId) return;
            
            blacksmith.removeNotification(QuestPanel.activeObjectiveNotificationId);
            QuestPanel.activeObjectiveNotificationId = null;
        } catch (error) {
            console.error('Coffee Pub Squire | Error clearing active objective notification:', error);
        }
    }

    /**
     * Check for pinned quests and show notification if found
     * @private
     */
    async _checkAndNotifyPinnedQuest() {
        try {
            // Get pinned quests
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (pinnedQuestUuid) {
                // Get the quest page to get name and category
                const questPage = await fromUuid(pinnedQuestUuid);
                if (questPage) {
                    const questName = questPage.name || 'Unknown Quest';
                    
                    // Find which category this quest is pinned to
                    let questCategory = 'Main Quest'; // default
                    for (const [category, uuid] of Object.entries(pinnedQuests)) {
                        if (uuid === pinnedQuestUuid) {
                            questCategory = category;
                            break;
                        }
                    }
                    
                    // Send quest pinned notification
                    this.notifyQuestPinned(questName, questCategory);
                }
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error checking pinned quest:', error);
        }
    }

    /**
     * Get the active objective index for a quest
     * @param {string} questUuid - The quest UUID
     * @returns {number|null} The active objective index or null if none
     * @private
     */
    async _getActiveObjectiveIndex(questUuid) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            const activeData = activeObjectives.active;
            
            if (activeData && typeof activeData === 'string') {
                const [storedUuid, indexStr] = activeData.split('|');
                if (storedUuid === questUuid) {
                    return parseInt(indexStr);
                }
            }
            
            return null;
        } catch (error) {
            console.error('Coffee Pub Squire | Error getting active objective index:', error);
            return null;
        }
    }

    /**
     * Set the active objective for a quest
     * @param {string} questUuid - The quest UUID
     * @param {number} objectiveIndex - The objective index to set as active
     * @private
     */
    async _setActiveObjective(questUuid, objectiveIndex) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
           
            // Clear any existing active objective first
            for (const key in activeObjectives) {
                if (activeObjectives[key] !== null) {
                    activeObjectives[key] = null;
                }
            }
            
            // Set the new active objective using a simple key
            activeObjectives.active = `${questUuid}|${objectiveIndex}`;
            await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
            
            // Get quest and objective details for notification from panel data
            const questPage = await fromUuid(questUuid);
            if (questPage) {
                const questName = questPage.name || 'Unknown Quest';
                
                // Find the quest in our panel data
                let questEntry = null;
                for (const category of this.categories) {
                    questEntry = this.data[category]?.find(entry => entry.uuid === questUuid);
                    if (questEntry) break;
                }
                
                if (questEntry?.tasks && questEntry.tasks[objectiveIndex]) {
                    const objectiveText = questEntry.tasks[objectiveIndex].text || 'Unknown Objective';
                    const objectiveNumber = objectiveIndex + 1;
                    this.notifyActiveObjective(questName, objectiveText, objectiveNumber);
                } else {
                    // No quest entry or tasks found in panel data
                }
            } else {
                // Quest page not found
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error setting active objective:', error);
        }
    }

    /**
     * Clear the active objective for a quest
     * @param {string} questUuid - The quest UUID
     * @private
     */
    async _clearActiveObjective(questUuid) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            const activeData = activeObjectives.active;
            
            if (activeData && typeof activeData === 'string') {
                const [storedUuid] = activeData.split('|');
                if (storedUuid === questUuid) {
                    activeObjectives.active = null;
                    await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
                    
                    // Clear the active objective notification
                    this.clearActiveObjectiveNotification();
                }
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error clearing active objective:', error);
        }
    }

    /**
     * Clear ALL active objectives (only one can be active at a time)
     * @private
     */
    async _clearAllActiveObjectives() {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            activeObjectives.active = null;
            await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
            
            // Clear the active objective notification
            this.clearActiveObjectiveNotification();
        } catch (error) {
            console.error('Coffee Pub Squire | Error clearing all active objectives:', error);
        }
    }

    /**
     * Verifies that all required categories exist and updates if needed
     * @private
     */
    _verifyAndUpdateCategories() {
        const requiredCategories = ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"];
        const storedCategories = game.settings.get(MODULE.ID, 'questCategories') || [];
        
        // Create a new array with required categories at their specific positions
        let updatedCategories = [...requiredCategories]; // Start with the required categories
        
        // Add any custom categories that aren't in the required list
        storedCategories.forEach(cat => {
            if (!requiredCategories.includes(cat)) {
                updatedCategories.push(cat);
            }
        });
        
        // Remove duplicates while preserving order
        updatedCategories = [...new Set(updatedCategories)];
        
        // Update settings if there's a change
        const currentCategories = JSON.stringify(storedCategories);
        const newCategories = JSON.stringify(updatedCategories);
        
        if (currentCategories !== newCategories) {
            game.settings.set(MODULE.ID, 'questCategories', updatedCategories);
        }
        
        // Update this instance's categories
        this.categories = updatedCategories;
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are handled by HookManager
        // This method is kept for compatibility but no longer registers hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Quest Panel: Hooks managed by HookManager',
            {},
            true,
            false
        );
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        // Clear any pending debounce timeouts
        Object.values(this._notificationDebounceTimeouts).forEach(timeout => {
            if (timeout) clearTrackedTimeout(timeout);
        });
        this._notificationDebounceTimeouts = {};
        
        this.element = null;
    }

    /**
     * Clear all quest pins from specified scenes
     * @param {string} scope - 'thisScene' or 'allScenes'
     * @private
     */
    async _clearAllQuestPins(scope) {
        try {
            // MIGRATED TO BLACKSMITH API
            const pins = getPinsApi();
            if (!pins || !pins.isAvailable()) {
                ui.notifications.warn('Quest pins require the Blacksmith module');
                return;
            }
            
            if (scope === 'thisScene') {
                // Clear pins from current scene only
                if (canvas.scene) {
                    const allPins = pins.list({ moduleId: MODULE.ID, sceneId: canvas.scene.id });
                    let clearedCount = allPins.length;
                    
                    if (clearedCount > 0) {
                        // Delete all pins via Blacksmith API
                        for (const pin of allPins) {
                            await pins.delete(pin.id);
                        }
                        
                        ui.notifications.info(`Cleared ${clearedCount} quest pins from the current scene.`);
                    }
                }
            } else if (scope === 'allScenes') {
                // Clear pins from all scenes
                let totalCleared = 0;
                
                for (const scene of game.scenes.contents) {
                    const scenePins = pins.list({ moduleId: MODULE.ID, sceneId: scene.id });
                    for (const pin of scenePins) {
                        await pins.delete(pin.id);
                        totalCleared++;
                    }
                }
                
                ui.notifications.info(`Cleared ${totalCleared} quest pins from all scenes.`);
            }
        } catch (error) {
            console.error('Error clearing quest pins:', { error, scope });
            ui.notifications.error('Error clearing quest pins. See console for details.');
        }
    }

    /**
     * Clear quest pins for a specific quest from the current scene
     * @param {string} questUuid - The UUID of the quest
     * @private
     */
    async _clearQuestPins(questUuid) {
        try {
            if (!canvas.scene) return;
            
            // MIGRATED TO BLACKSMITH API
            await deleteQuestPins(questUuid, canvas.scene?.id);
            ui.notifications.info('Quest pins cleared from the current scene.');
        } catch (error) {
            console.error('Error clearing quest pins:', { error, questUuid });
            ui.notifications.error('Error clearing quest pins. See console for details.');
        }
    }

    /**
     * Apply quest status change (Not Started, In Progress, Complete, Failed).
     * @param {string} uuid - Quest journal page UUID
     * @param {string} newStatus - New status value
     * @private
     */
    async _applyQuestStatus(uuid, newStatus) {
        const page = await fromUuid(uuid);
        if (!page) return;

        let content = '';
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
        const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
        const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]*)/);
        const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';

        if (statusMatch) {
            content = content.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, `$1${newStatus}`);
        } else {
            content += `<p><strong>Status:</strong> ${newStatus}</p>`;
        }

        let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
        if (!originalCategory && currentCategory && !['Completed', 'Failed'].includes(currentCategory)) {
            originalCategory = currentCategory;
            await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
        }

        if (newStatus === 'Complete' && currentCategory !== 'Completed') {
            if (!originalCategory && currentCategory) {
                await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
            }
        } else if (newStatus === 'Failed' && currentCategory !== 'Failed') {
            if (!originalCategory && currentCategory) {
                await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
            }
        } else if (['Not Started', 'In Progress'].includes(newStatus) && ['Completed', 'Failed'].includes(currentCategory) && originalCategory) {
            if (categoryMatch) {
                content = content.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
            }
        }

        await page.update({ text: { content } });
    }

    /** Cursor class for Pin to Scene placement mode */
    static QUEST_PIN_CURSOR_CLASS = 'squire-quest-pin-placement';
    static QUEST_PIN_CANVAS_CURSOR_CLASS = 'squire-quest-pin-placement-canvas';

    /**
     * Create a preview element for Pin to Scene (follows mouse, like Notes).
     * @param {'circle'|'square'} shape - Pin shape
     * @param {number} sizePx - Size in pixels
     * @param {string} fillColor - Fill hex color
     * @param {string} text - Label text (e.g. Q85)
     * @param {string} iconHtml - Icon HTML (e.g. <i class="fa-solid fa-scroll"></i>)
     * @returns {HTMLDivElement}
     * @private
     */
    _createQuestPinPreviewElement(shape, sizePx, fillColor, text, iconHtml) {
        const preview = document.createElement('div');
        preview.className = 'quest-pin-preview';
        preview.dataset.shape = shape;
        preview.style.setProperty('--quest-pin-width', `${sizePx}px`);
        preview.style.setProperty('--quest-pin-height', `${sizePx}px`);
        preview.style.setProperty('--quest-pin-fill', fillColor);
        preview.style.setProperty('--quest-pin-stroke', '#000000');
        preview.style.setProperty('--quest-pin-stroke-width', '2px');
        preview.innerHTML = `
            <div class="quest-pin-preview-inner">
                ${iconHtml || ''}
                <span>${text || ''}</span>
            </div>
        `;
        return preview;
    }

    /**
     * Begin Pin to Scene placement for a quest-level pin. User clicks on canvas to place.
     * @param {string} questUuid - Quest journal page UUID
     * @param {number} questIndex - Quest number for label
     * @param {string} questCategory - Quest category
     * @param {string} questStatus - Quest status
     * @param {string} questState - 'visible' or 'hidden'
     * @private
     */
    async _beginQuestPinPlacement(questUuid, questIndex, questCategory, questStatus, questState) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place a quest pin.');
            return;
        }
        if (!getPinsApi()?.isAvailable()) {
            ui.notifications.warn('Quest pins require the Blacksmith module.');
            return;
        }
        if (this._questPinPlacement) this._clearQuestPinPlacement();

        ui.notifications.info('Click on the map to place the quest pin. Press Esc to cancel.');
        document.body.classList.add(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';
        const view = canvas.app.view;
        view.classList.add(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);

        const questStateVal = questState === 'true' || questState === true ? 'visible' : 'hidden';
        const fillColor = getQuestPinColor(questStatus || 'Not Started', questStateVal);
        const questNum = typeof questIndex === 'string' ? parseInt(questIndex, 10) || 0 : (questIndex ?? 0);
        const previewEl = this._createQuestPinPreviewElement(
            'circle',
            32,
            fillColor,
            `Q${questNum}`,
            '<i class="fa-solid fa-scroll"></i>'
        );
        document.body.appendChild(previewEl);

        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };

        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });
            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearQuestPinPlacement();
                return;
            }
            const pin = await createQuestPin({
                questUuid,
                questIndex: questNum,
                questCategory: questCategory || 'Side Quest',
                questStatus: questStatus || 'Not Started',
                questState: questStateVal,
                x: localPos.x,
                y: localPos.y,
                sceneId: canvas.scene.id
            });
            this._clearQuestPinPlacement();
            if (pin) {
                ui.notifications.info('Quest pin placed.');
                this.render(this.element);
            }
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearQuestPinPlacement();
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearQuestPinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._questPinPlacement = {
            view,
            previewEl,
            onPointerDown,
            onPointerMove,
            onContextMenu,
            onKeyDown
        };
    }

    /**
     * Begin Pin to Scene placement for an objective-level pin.
     * @param {string} questUuid - Quest journal page UUID
     * @param {number} objectiveIndex - Task index
     * @param {number} questIndex - Quest number for label
     * @param {string} questCategory - Quest category
     * @param {string} questState - 'visible' or 'hidden'
     * @param {Object} objective - { state, text }
     * @private
     */
    async _beginObjectivePinPlacement(questUuid, objectiveIndex, questIndex, questCategory, questState, objective) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place an objective pin.');
            return;
        }
        if (!getPinsApi()?.isAvailable()) {
            ui.notifications.warn('Quest pins require the Blacksmith module.');
            return;
        }
        if (this._questPinPlacement) this._clearQuestPinPlacement();

        ui.notifications.info('Click on the map to place the objective pin. Press Esc to cancel.');
        document.body.classList.add(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';
        const view = canvas.app.view;
        view.classList.add(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);

        const questStateVal = questState === 'true' || questState === true ? 'visible' : 'hidden';
        const objectiveState = objective?.state || 'active';
        const fillColor = getObjectivePinColor(objectiveState);
        const questNum = typeof questIndex === 'string' ? parseInt(questIndex, 10) || 0 : (questIndex ?? 0);
        const previewEl = this._createQuestPinPreviewElement(
            'square',
            28,
            fillColor,
            `Q${questNum}.${objectiveIndex + 1}`,
            '<i class="fa-solid fa-bullseye"></i>'
        );
        document.body.appendChild(previewEl);

        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };

        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });
            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearQuestPinPlacement();
                return;
            }
            const pin = await createObjectivePin({
                questUuid,
                questIndex: questNum,
                objectiveIndex,
                questCategory: questCategory || 'Side Quest',
                questState: questStateVal,
                objective: objective || { state: 'active', text: '' },
                x: localPos.x,
                y: localPos.y,
                sceneId: canvas.scene.id
            });
            this._clearQuestPinPlacement();
            if (pin) {
                ui.notifications.info('Objective pin placed.');
                this.render(this.element);
            }
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearQuestPinPlacement();
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearQuestPinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._questPinPlacement = {
            view,
            previewEl,
            onPointerDown,
            onPointerMove,
            onContextMenu,
            onKeyDown
        };
    }

    _clearQuestPinPlacement() {
        if (!this._questPinPlacement) return;
        const { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown } = this._questPinPlacement;
        view?.removeEventListener('pointerdown', onPointerDown, true);
        view?.removeEventListener('contextmenu', onContextMenu, true);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointermove', onPointerMove);
        previewEl?.remove();
        document.body.classList.remove(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = '';
        view?.classList.remove(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);
        this._questPinPlacement = null;
    }

    /**
     * Unpin a hidden quest from all players
     * @param {string} questUuid - The UUID of the quest to unpin
     * @private
     */
    async _unpinHiddenQuestFromPlayers(questUuid) {
        // Get the quest page for the name
        const questPage = await fromUuid(questUuid);
        const questName = questPage?.name || 'Unknown Quest';
        try {
            // Get all users who are not GMs
            const nonGMUsers = game.users.filter(user => !user.isGM);
            
            for (const user of nonGMUsers) {
                const pinnedQuests = await user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                
                // Check if this quest is pinned for this user
                let isPinned = false;
                let pinnedCategory = null;
                
                for (const [category, uuid] of Object.entries(pinnedQuests)) {
                    if (uuid === questUuid) {
                        isPinned = true;
                        pinnedCategory = category;
                        break;
                    }
                }
                
                // If pinned, unpin it
                if (isPinned && pinnedCategory) {
                    pinnedQuests[pinnedCategory] = null;
                    await user.setFlag(MODULE.ID, 'pinnedQuests', pinnedQuests);
                    
                    // Notify the player if they're online
                    if (user.active) {
                        ui.notifications.info(`${user.name}: Your pinned quest "${questName}" has been hidden by the GM and automatically unpinned.`);
                    }
                }
            }
        } catch (error) {
            console.error('Error unpinning hidden quest from players:', { error, questUuid });
        }
    }

    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page looks like a quest entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if the page appears to be a quest entry
     */
    _isQuestEntry(page) {
        try {
            const rawContent = page?.text?.content;
            if (!rawContent || typeof rawContent !== 'string') return false;

            const normalized = rawContent.toLowerCase();
            return normalized.includes('## tasks') || normalized.includes('<strong>tasks:');
        } catch (error) {
            console.error('QuestPanel | Error checking quest entry:', error);
            return false;
        }
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Always verify categories are correct
        this._verifyAndUpdateCategories();
        
        // Always clear data and tags before repopulating
        this.data = {};
        for (const category of this.categories) {
            this.data[category] = [];
        }
        this.allTags = new Set();

        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        this.selectedJournal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (this.selectedJournal) {
            for (const page of this.selectedJournal.pages.contents) {
                try {
                    let content = '';
                    if (typeof page.text?.content === 'string') {
                        content = page.text.content;
                    } else if (typeof page.text === 'string') {
                        content = page.text;
                    } else if (page.text?.content) {
                        content = await page.text.content;
                    }
                    if (content) {
                        const TextEditor = getTextEditor();
                        const enriched = await TextEditor.enrichHTML(content, {
                            secrets: game.user.isGM,
                            documents: true,
                            links: true,
                            rolls: true
                        });
                        // Each page is a single quest entry
                        const entry = await QuestParser.parseSinglePage(page, enriched);
                        if (entry) {
                            // Set visible from flag, default true
                            let visible = await page.getFlag(MODULE.ID, 'visible');
                            if (typeof visible === 'undefined') visible = true;
                            entry.visible = visible;
                            
                            // Add quest number
                            entry.questNumber = getQuestNumber(page.uuid);
                            
                            // Ensure all required properties exist
                            entry.tasks = entry.tasks || [];
                            entry.reward = entry.reward || { xp: 0, treasure: [] };
                            entry.participants = entry.participants || [];
                            entry.tags = entry.tags || [];
                            entry.timeframe = entry.timeframe || { duration: '' };
                            entry.progress = entry.progress || 0;
                            
                            // Add objective numbers to tasks
                            if (entry.tasks && Array.isArray(entry.tasks)) {
                                entry.tasks.forEach((task, index) => {
                                    task.objectiveNumber = String(index + 1).padStart(2, '0');
                                    // Ensure task properties exist
                                    task.text = task.text || '';
                                    task.completed = task.completed || false;
                                    task.state = task.state || 'active';
                                    task.treasureUnlocks = task.treasureUnlocks || [];
                                });
                            }
                            
                            const category = entry.category && this.categories.includes(entry.category) ? entry.category : this.categories[0];
                            this.data[category].push(entry);
                            
                            // Add only the explicit tags from the entry
                            if (entry.tags && Array.isArray(entry.tags)) {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing quest page ${page.name}:`, { page: page.name, error });
                    ui.notifications.error(`Error loading quest: ${page.name}. See console for details.`);
                }
            }
        }
    }

    /**
     * Apply current filters to entries
     * @private
     */
    _applyFilters(entries) {
        const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
        // Only show visible quests to non-GMs
        const filteredEntries = sortedEntries.filter(entry => game.user.isGM || entry.visible !== false);
        if (this.filters.tags.length > 0) {
            return filteredEntries.filter(entry => {
                // Only check for tags in the explicit tags array
                if (!entry.tags || !Array.isArray(entry.tags)) return false;
                const hasAnyTag = this.filters.tags.some(tag => entry.tags.includes(tag));
                return hasAnyTag;
            });
        }
        return filteredEntries;
    }

    /**
     * Set up event listeners
     * @private
     */
    _activateListeners(html) {
        // v13: Use helper method for consistency
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;
        
        // Search input - live DOM filtering
        const questSearchContainer = nativeHtml.querySelector('.quest-search');
        const searchInput = questSearchContainer?.querySelector('input');
        const clearButton = nativeHtml.querySelector('.clear-search');
        
        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                const searchValue = event.target.value.toLowerCase();
                this.filters.search = searchValue;
                
                // Show all entries first
                // v13: Use nativeHtml instead of html
                if (game.user.isGM) {
                    nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                        entry.style.display = '';
                    });
                } else {
                    nativeHtml.querySelectorAll('.quest-entry:not(.unidentified)').forEach(entry => {
                        entry.style.display = '';
                    });
                }
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                if (searchValue) {
                    // Then filter entries
                    // v13: Use nativeHtml instead of html
                    const entriesToSearch = game.user.isGM ? 
                        nativeHtml.querySelectorAll('.quest-entry') : 
                        nativeHtml.querySelectorAll('.quest-entry:not(.unidentified)');

                    entriesToSearch.forEach((entry) => {
                        const name = (entry.querySelector('.quest-entry-name')?.textContent || '').toLowerCase();
                        const description = (entry.querySelector('.quest-entry-description')?.textContent || '').toLowerCase();
                        const location = (entry.querySelector('.quest-entry-location')?.textContent || '').toLowerCase();
                        const tasks = (entry.querySelector('.quest-entry-tasks')?.textContent || '').toLowerCase();
                        const plotHook = (entry.querySelector('.quest-entry-plothook')?.textContent || '').toLowerCase();
                        const tags = (entry.querySelector('.quest-entry-tags')?.textContent || '').toLowerCase();
                        const treasure = (entry.querySelector('.quest-entry-reward')?.textContent || '').toLowerCase();
                        
                        // Special handling for participants - extract names from portrait title attributes
                        let participants = '';
                        entry.querySelectorAll('.participant-portrait').forEach(portrait => {
                            participants += (portrait.title || '') + ' ';
                        });
                        participants = participants.toLowerCase();
                        
                        const matches = name.includes(searchValue) || 
                            description.includes(searchValue) || 
                            location.includes(searchValue) ||
                            tasks.includes(searchValue) ||
                            plotHook.includes(searchValue) ||
                            participants.includes(searchValue) ||
                            tags.includes(searchValue) ||
                            treasure.includes(searchValue);
                        
                        entry.style.display = matches ? '' : 'none';
                    });
                    
                    // Hide empty sections
                    // v13: Use nativeHtml instead of html
                    nativeHtml.querySelectorAll('.quest-section').forEach((section) => {
                        const hasVisibleEntries = section.querySelector('.quest-entry[style*="display: block"], .quest-entry:not([style*="display: none"])') !== null;
                        section.style.display = hasVisibleEntries ? '' : 'none';
                    });
                } else {
                    // When search is cleared, restore original collapsed states
                    const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                    for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                        if (collapsed) {
                            // v13: Use safer selector approach to handle values with newlines/whitespace
                            const sections = nativeHtml.querySelectorAll('.quest-section[data-status]');
                            const section = Array.from(sections).find(s => {
                                const attrValue = s.getAttribute('data-status');
                                return attrValue && attrValue.trim() === category.trim();
                            });
                            if (section) {
                                section.classList.add('collapsed');
                            }
                        }
                    }
                }
            });
        }

        // Refresh button
        const refreshButton = nativeHtml.querySelector('.refresh-quest-button');
        if (refreshButton) {
            // Clone to remove existing listeners
            const newButton = refreshButton.cloneNode(true);
            refreshButton.parentNode?.replaceChild(newButton, refreshButton);
            
            newButton.addEventListener('click', async () => {
                if (this.selectedJournal) {
                    await this._refreshData();
                    this.render(this.element);
                    ui.notifications.info("Quests refreshed.");
                }
            });
        }

        // Open quest journal button
        // v13: Use nativeHtml instead of html
        const openQuestJournalButton = nativeHtml.querySelector('.open-quest-journal');
        if (openQuestJournalButton) {
            const newButton = openQuestJournalButton.cloneNode(true);
            openQuestJournalButton.parentNode?.replaceChild(newButton, openQuestJournalButton);
            newButton.addEventListener('click', async () => {
                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                if (!journalId || journalId === 'none') {
                    if (game.user.isGM) {
                        ui.notifications.warn("No quest journal selected. Click the gear icon to select one.");
                    } else {
                        ui.notifications.warn("No quest journal has been set by the GM.");
                    }
                    return;
                }
                
                const journal = game.journal.get(journalId);
                if (!journal) {
                    ui.notifications.error("Could not find the quest journal.");
                    return;
                }
                
                journal.sheet.render(true);
            });
        }

        // Add new quest button
        // v13: Use nativeHtml instead of html
        const addQuestButton = nativeHtml.querySelector('.add-quest-button');
        if (addQuestButton) {
            const newButton = addQuestButton.cloneNode(true);
            addQuestButton.parentNode?.replaceChild(newButton, addQuestButton);
            newButton.addEventListener('click', () => {
                if (!game.user.isGM) return;
                
                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                if (!journalId || journalId === 'none') {
                    ui.notifications.warn("No quest journal selected. Click the gear icon to select one.");
                    return;
                }
                
                const journal = game.journal.get(journalId);
                if (!journal) {
                    ui.notifications.error("Could not find the quest journal.");
                    return;
                }
                
                const questForm = new QuestForm();
                questForm.render(true);
            });
        }

        // Tag cloud tag selection
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-tag-cloud .quest-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagValue = event.currentTarget.dataset.tag;
                const tagIndex = this.filters.tags.indexOf(tagValue);
                if (tagIndex === -1) {
                    this.filters.tags.push(tagValue);
                } else {
                    this.filters.tags.splice(tagIndex, 1);
                }
                
                // Show all entries and sections before filtering
                // v13: Use nativeHtml instead of html
                nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                // If we have tags selected, expand all categories
                if (this.filters.tags.length > 0) {
                    nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                        section.classList.remove('collapsed');
                    });
                } else {
                    // If no tags selected, restore original collapsed states
                    const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                    for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                        if (collapsed) {
                            // v13: Use safer selector approach to handle values with newlines/whitespace
                            const sections = nativeHtml.querySelectorAll('.quest-section[data-status]');
                            const section = Array.from(sections).find(s => {
                                const attrValue = s.getAttribute('data-status');
                                return attrValue && attrValue.trim() === category.trim();
                            });
                            if (section) {
                                section.classList.add('collapsed');
                            }
                        }
                    }
                }
                
                this.render(this.element);
            });
        });

        // Clear search button
        // v13: Use native DOM methods
        if (clearButton) {
            clearButton.classList.remove('disabled');
            const newClearButton = clearButton.cloneNode(true);
            clearButton.parentNode?.replaceChild(newClearButton, clearButton);
            newClearButton.addEventListener('click', (event) => {
                this.filters.search = "";
                this.filters.tags = [];
                if (searchInput) {
                    searchInput.value = "";
                }
                // v13: Use nativeHtml instead of html
                nativeHtml.querySelectorAll('.quest-tag.selected').forEach(tag => {
                    tag.classList.remove('selected');
                });
                
                // Show all entries and sections
                nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                // Restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        const section = nativeHtml.querySelector(`.quest-section[data-status="${category}"]`);
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                }
                
                this.render(this.element);
            });
        }

        // Toggle tags button
        // v13: Use nativeHtml instead of html
        const toggleTagsButton = nativeHtml.querySelector('.toggle-tags-button');
        if (toggleTagsButton) {
            const newButton = toggleTagsButton.cloneNode(true);
            toggleTagsButton.parentNode?.replaceChild(newButton, toggleTagsButton);
            newButton.addEventListener('click', (event) => {
                const tagCloud = nativeHtml.querySelector('.quest-tag-cloud');
                if (!tagCloud) return;
                const isCollapsed = tagCloud.classList.contains('collapsed');
                
                tagCloud.classList.toggle('collapsed');
                event.currentTarget.classList.toggle('active');
                
                game.user.setFlag(MODULE.ID, 'questTagCloudCollapsed', !isCollapsed);
            });
        }

        // Category collapse/expand
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-category').forEach(category => {
            const newCategory = category.cloneNode(true);
            category.parentNode?.replaceChild(newCategory, category);
            newCategory.addEventListener('click', (event) => {
                const section = event.currentTarget.closest('.quest-section');
                if (!section) return;
                section.classList.toggle('collapsed');
                const status = section.dataset.status;
                const collapsed = section.classList.contains('collapsed');
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                collapsedCategories[status] = collapsed;
                game.user.setFlag(MODULE.ID, 'questCollapsedCategories', collapsedCategories);
            });
        });

        // Journal selection
        // v13: Use nativeHtml instead of html
        const setQuestButton = nativeHtml.querySelector('.set-quest-button');
        if (setQuestButton) {
            const newButton = setQuestButton.cloneNode(true);
            setQuestButton.parentNode?.replaceChild(newButton, setQuestButton);
            newButton.addEventListener('click', () => {
                showJournalPicker({
                    title: 'Select Journal for Quests',
                    getCurrentId: () => game.settings.get(MODULE.ID, 'questJournal'),
                    onSelect: async (journalId) => {
                        await game.settings.set(MODULE.ID, 'questJournal', journalId);
                        ui.notifications.info(`Journal for Quests ${journalId === 'none' ? 'cleared' : 'selected'}.`);
                    },
                    reRender: () => this.render(this.element),
                    infoHtml: '<p style="margin-bottom: 5px; color: #ddd;"><i class="fa-solid fa-info-circle" style="color: #88f;"></i> Each entry in this journal will be treated as a separate quest.</p>'
                });
            });
        }

        // Link clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry-link').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) {
                        doc.sheet.render(true);
                    }
                }
            });
        });

        // Participant portrait clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.participant-portrait').forEach(portrait => {
            const newPortrait = portrait.cloneNode(true);
            portrait.parentNode?.replaceChild(newPortrait, portrait);
            newPortrait.addEventListener('click', async (event) => {
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) doc.sheet.render(true);
                }
            });
        });

        // Treasure UUID link clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry-reward a[data-uuid]').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) doc.sheet.render(true);
                }
            });
        });

        // Task completion and hidden toggling
        // v13: Use nativeHtml instead of html
        const taskCheckboxes = nativeHtml.querySelectorAll('.task-checkbox');
        
        // Add drag functionality for quest objectives (GM only)
        if (game.user.isGM) {
            // Make the objective text draggable (not the entire list item)
            // v13: Use nativeHtml instead of html
            const objectiveTexts = nativeHtml.querySelectorAll('.quest-entry-tasks .objective-text-draggable');
            objectiveTexts.forEach(textElement => {
                textElement.addEventListener('dragstart', (event) => {
                    // Prevent drag if clicking on the checkbox
                    if (event.target.classList.contains('task-checkbox')) {
                        event.preventDefault();
                        return;
                    }
                    
                    const listItem = event.currentTarget.closest('li');
                    if (!listItem) return;
                    const checkbox = listItem.querySelector('.task-checkbox');
                    if (!checkbox) return;
                    const taskIndex = parseInt(checkbox.dataset.taskIndex);
                    const questEntry = listItem.closest('.quest-entry');
                    if (!questEntry) return;
                    const questUuid = questEntry.dataset.questUuid;
                    const questNameElement = questEntry.querySelector('.quest-entry-name');
                    const questName = questNameElement?.textContent?.trim() || '';
                    const objectiveText = event.currentTarget.textContent?.trim() || '';
                    
                    // Get objective state from data attribute on the checkbox
                    const objectiveState = checkbox.dataset.taskState || 'active';
                    
                    // Get quest visibility state
                    const questState = questEntry.dataset.visible === 'false' ? 'hidden' : 'visible';
                    
                    // Create drag data
                    const dragData = {
                        type: 'quest-objective',
                        questUuid: questUuid,
                        objectiveIndex: taskIndex,
                        questName: questName,
                        objectiveText: objectiveText,
                        objectiveState: objectiveState,
                        questIndex: questEntry.dataset.questNumber || '??',
                        questCategory: questEntry.dataset.category || '??',
                        questState: questState
                    };
                    
                    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                    event.dataTransfer.effectAllowed = 'copy';
                    
                    // Add visual feedback
                    event.currentTarget.classList.add('dragging');
                });
                
                textElement.addEventListener('dragend', (event) => {
                    event.currentTarget.classList.remove('dragging');
                });
            });
            
            // Make the quest header draggable for quest-level pins (GM only)
            // v13: Use nativeHtml instead of html
            const questDragHandles = nativeHtml.querySelectorAll('.quest-entry-header[draggable="true"]');
            const ignoreDragSelectors = ['.quest-toolbar', '.quest-entry-toggle', '.quest-entry-visibility'];

            questDragHandles.forEach(handle => {
                handle.addEventListener('dragstart', (event) => {
                    const target = event.target;
                    if (ignoreDragSelectors.some(selector => target.closest(selector))) {
                        event.preventDefault();
                        return;
                    }

                    const questEntry = event.currentTarget.closest('.quest-entry');
                    if (!questEntry) {
                        event.preventDefault();
                        return;
                    }

                    const questUuid = questEntry.dataset.questUuid;
                    if (!questUuid) {
                        event.preventDefault();
                        return;
                    }

                    const questNameElement = questEntry.querySelector('.quest-entry-name');
                    const questNameText = questNameElement?.textContent?.trim() || '';

                    // Get quest visibility state
                    const questState = questEntry.dataset.visible === 'false' ? 'hidden' : 'visible';

                    // Get quest status from data attribute or default
                    const questStatus = questEntry.dataset.questStatus || 'Not Started';

                    // Get participants from data attribute or default
                    const participantsData = questEntry.dataset.participants || '';
                    const participants = participantsData ? participantsData.split(',').filter(p => p.trim()) : [];

                    // Create drag data for quest-level pin
                    const dragData = {
                        type: 'quest-quest',
                        questUuid: questUuid,
                        questName: questNameText,
                        questIndex: questEntry.dataset.questNumber || '??',
                        questCategory: questEntry.dataset.category || '??',
                        questState: questState,
                        questStatus: questStatus,
                        participants: participants
                    };

                    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                    event.dataTransfer.effectAllowed = 'copy';

                    // Add visual feedback
                    event.currentTarget.classList.add('dragging');
                });

                handle.addEventListener('dragend', (event) => {
                    event.currentTarget.classList.remove('dragging');
                });
            });
        }
        
        // Use mousedown to detect different click types
        // v13: Use native DOM event listeners
        taskCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('mousedown', async function(event) {
                // Check for shift-left-click (same as middle-click for hidden toggle)
                const isShiftLeftClick = event.button === 0 && event.shiftKey;
                const isMiddleClick = event.button === 1;
                const isRightClick = event.button === 2;
                const isLeftClick = event.button === 0 && !event.shiftKey;
                if (!game.user.isGM) {
                    ui.notifications.warn("Only the GM can edit objectives. Please ask the GM to do so.");
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const taskIndex = parseInt(event.currentTarget.dataset.taskIndex);
                const questEntry = event.currentTarget.closest('.quest-entry');
                if (!questEntry) return;
                const questUuid = questEntry.dataset.questUuid;
                if (!questUuid) return;
                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                if (!journalId || journalId === 'none') return;
                const journal = game.journal.get(journalId);
                if (!journal) return;
                const page = journal.pages.find(p => p.uuid === questUuid);
                if (!page) return;
                let content = page.text.content;
                const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
                if (!tasksMatch) return;
                const tasksHtml = tasksMatch[1];
                const parser = new DOMParser();
                const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                const ul = ulDoc.querySelector('ul');
                const liList = ul ? Array.from(ul.children) : [];
                const li = liList[taskIndex];
                if (!li) return;

                if (isMiddleClick || isShiftLeftClick) { // Middle-click or Shift+Left-click: toggle hidden
                event.preventDefault();
                const emTag = li.querySelector('em');
                if (emTag) {
                    // Task is already hidden, unhide it - unwrap <em>
                    emTag.replaceWith(...emTag.childNodes);
                } else {
                    // Task is not hidden, hide it - wrap in <em> and remove other states
                    // First, unwrap any existing state tags to ensure clean state
                    const sTag = li.querySelector('s');
                    const codeTag = li.querySelector('code');
                    
                    if (sTag) {
                        // If completed, unwrap <s> first
                        li.innerHTML = sTag.innerHTML;
                    } else if (codeTag) {
                        // If failed, unwrap <code> first
                        li.innerHTML = codeTag.innerHTML;
                    }
                    
                    // Now wrap in <em>
                    li.innerHTML = `<em>${li.innerHTML}</em>`;
                }
                const newTasksHtml = ul.innerHTML;
                const newContent = content.replace(tasksMatch[1], newTasksHtml);
                try {
                    await page.update({ text: { content: newContent } });
                    
                    // Refresh the panel display to show the updated checkbox state
                    if (this.element) {
                        await this._refreshData();
                        this.render(this.element);
                    }
                } catch (error) {
                    console.error('Error updating journal page (hidden toggle):', error);
                }
                    return;
                }
                
                if (isRightClick) { // Right-click: toggle failed state
                    event.preventDefault();
                    
                    const codeTag = li.querySelector('code');
                    if (codeTag) {
                        // Task is already failed, unfail it - unwrap <code>
                        li.innerHTML = codeTag.innerHTML;
                    } else {
                        // Task is not failed, fail it - wrap in <code> and remove other states
                        // First, unwrap any existing state tags to ensure clean state
                        const sTag = li.querySelector('s');
                        const emTag = li.querySelector('em');
                        
                        if (sTag) {
                            // If completed, unwrap <s> first
                            li.innerHTML = sTag.innerHTML;
                        } else if (emTag) {
                            // If hidden, unwrap <em> first
                            li.innerHTML = emTag.innerHTML;
                        }
                        
                        // Now wrap in <code>
                        li.innerHTML = `<code>${li.innerHTML}</code>`;
                    }
                    
                    const newTasksHtml = ul.innerHTML;
                    let newContent = content.replace(tasksMatch[1], newTasksHtml);
                    
                    try {
                        await page.update({ text: { content: newContent } });
                        
                        // Refresh the panel display to show the updated checkbox state
                        if (this.element) {
                            await this._refreshData();
                            this.render(this.element);
                        }
                    } catch (error) {
                        console.error('Error updating journal page (failed task toggle):', error);
                    }
                    return;
                }
                
                if (isLeftClick) { // Left-click: toggle completed
                const sTag = li.querySelector('s');
                if (sTag) {
                    // Task is already completed, uncomplete it - unwrap <s>
                    li.innerHTML = sTag.innerHTML;
                } else {
                    // Task is not completed, complete it - wrap in <s> and remove other states
                    // First, unwrap any existing state tags to ensure clean state
                    const codeTag = li.querySelector('code');
                    const emTag = li.querySelector('em');
                    
                    if (codeTag) {
                        // If failed, unwrap <code> first
                        li.innerHTML = codeTag.innerHTML;
                    } else if (emTag) {
                        // If hidden, unwrap <em> first
                        li.innerHTML = emTag.innerHTML;
                    }
                    
                    // Now wrap in <s>
                    li.innerHTML = `<s>${li.innerHTML}</s>`;
                    
                    // Send objective completed notification
                    const objectiveText = li.textContent.trim();
                    notifyObjectiveCompleted(objectiveText);
                }
                const newTasksHtml = ul.innerHTML;
                let newContent = content.replace(tasksMatch[1], newTasksHtml);
                // After toggling, check if all tasks are completed
                const allLis = Array.from(ul.children);
                const allCompleted = allLis.length > 0 && allLis.every(l => l.querySelector('s'));
                // Find current status and category
                const statusMatch = newContent.match(/<strong>Status:<\/strong>\s*([^<]*)/);
                let currentStatus = statusMatch ? statusMatch[1].trim() : '';
                const categoryMatch = newContent.match(/<strong>Category:<\/strong>\s*([^<]*)/);
                const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';
                
                if (allCompleted) {
                    // Change status to Complete
                    if (currentStatus !== 'Complete') {
                        if (statusMatch) {
                            newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Complete');
                        } else {
                            newContent += `<p><strong>Status:</strong> Complete</p>`;
                        }
                        
                        // Get or store original category
                        let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
                        if (!originalCategory && currentCategory && currentCategory !== 'Completed') {
                            originalCategory = currentCategory;
                            await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
                        }
                        
                        // Send quest completed notification
                        const questName = page.name || 'Unknown Quest';
                        notifyQuestCompleted(questName);
                        
                        // Remove automatic category change to Completed
                    }
                } else {
                    // If status is Complete and not all tasks are completed, set to In Progress
                    if (currentStatus === 'Complete') {
                        newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1In Progress');
                        
                        // Restore original category if quest is in Completed
                        if (currentCategory === 'Completed') {
                            const originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
                            if (originalCategory && categoryMatch) {
                                newContent = newContent.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
                            }
                        }
                    }
                }
                try {
                    await page.update({ text: { content: newContent } });
                    
                    // Refresh the panel display to show the updated checkbox state
                    if (this.element) {
                        await this._refreshData();
                        this.render(this.element);
                    }
                } catch (error) {
                        console.error('Error updating journal page (completion toggle):', error);
                    }
                }
            }.bind(this));
        });

        // --- Quest Card Collapse/Expand ---
        // Always start collapsed unless remembered
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
            entry.classList.add('collapsed');
        });
        // Restore open/closed state from user flag
        const questCardCollapsed = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
        nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
            const uuid = entry.dataset.questUuid;
            if (uuid && questCardCollapsed[uuid] === false) {
                entry.classList.remove('collapsed');
            }
        });
        // v13: Use native DOM event delegation
        // Toggle collapse on chevron click
        nativeHtml.addEventListener('click', async function(e) {
            // Check if the clicked element is the toggle or is inside the toggle
            const toggle = e.target.closest('.quest-entry-toggle');
            if (!toggle) return;
            
            // Prevent the header click handler from also firing
            e.stopPropagation();
            
            const card = toggle.closest('.quest-entry');
            if (!card) return;
            card.classList.toggle('collapsed');
            const uuid = card.dataset.questUuid;
            if (uuid) {
                const collapsed = card.classList.contains('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
        });
        // Toggle collapse on header click (but not controls)
        nativeHtml.addEventListener('click', async function(e) {
            const header = e.target.closest('.quest-entry-header');
            if (!header) return;
            
            // Don't toggle if clicking on toolbar
            if (e.target.closest('.quest-toolbar')) return;
            
            const card = header.closest('.quest-entry');
            if (!card) return;
            card.classList.toggle('collapsed');
            const uuid = card.dataset.questUuid;
            if (uuid) {
                const collapsed = card.classList.contains('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
        });

        // Toggle quest visibility (show/hide to players)
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.toggle-visible').forEach(toggle => {
            const newToggle = toggle.cloneNode(true);
            toggle.parentNode?.replaceChild(newToggle, toggle);
            newToggle.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;
                const uuid = event.currentTarget.dataset.uuid;
                if (!uuid) return;
                const page = await fromUuid(uuid);
                if (!page) return;
                let visible = await page.getFlag(MODULE.ID, 'visible');
                if (typeof visible === 'undefined') visible = true;
                visible = !visible;
                await page.setFlag(MODULE.ID, 'visible', visible);
                
                // Refresh the panel display to show the updated visibility state
                if (this.element) {
                    await this._refreshData();
                    this.render(this.element);
                }
                
                // Note: No longer automatically changing quest status when making visible
                // This allows GMs to show quests to players without forcing them into "In Progress" status
            });
        });

        // Pin quest handler
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-pin').forEach(pin => {
            const newPin = pin.cloneNode(true);
            pin.parentNode?.replaceChild(newPin, pin);
            newPin.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                const category = event.currentTarget.dataset.category;
                if (!uuid || !category) return;
                
                // Check if this quest is in "In Progress" status
                // Since we only show pins in In Progress section,
                // and we only process clicks on pins that exist,
                // this check is now redundant and can be removed
                
                // Get current pinned quests
                const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                
                // Check if this quest is already pinned
                const isPinned = Object.values(pinnedQuests).includes(uuid);
                
                if (isPinned) {
                    // Unpin this quest
                    for (const cat in pinnedQuests) {
                        if (pinnedQuests[cat] === uuid) {
                            pinnedQuests[cat] = null;
                        }
                    }
                    
                    // Clear active objective when unpinning
                    await this._clearActiveObjective(uuid);
                    
                    // Clear quest notifications when unpinning
                    this.clearQuestNotifications();
                } else {
                    // Clear any existing pins
                    for (const cat in pinnedQuests) {
                        pinnedQuests[cat] = null;
                    }
                    // Pin this quest
                    pinnedQuests[category] = uuid;
                    
                    // Clear active objectives when pinning a new quest
                    await this._clearAllActiveObjectives();
                    
                    // Get quest name for notification
                    const questPage = await fromUuid(uuid);
                    const questName = questPage?.name || 'Unknown Quest';
                    
                    // Send quest pinned notification
                    this.notifyQuestPinned(questName, category);
                }
                
                await game.user.setFlag(MODULE.ID, 'pinnedQuests', pinnedQuests);
                this.render(this.element);
                
                // Update the handle to reflect the pinned quest change
                if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance) {
                    await game.modules.get('coffee-pub-squire').api.PanelManager.instance.updateHandle();
                }
            });
        });

        // Pin to Scene (quest-level) - GM only
        nativeHtml.querySelectorAll('.quest-pin-to-scene').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = newBtn.dataset.uuid;
                const questNumber = newBtn.dataset.questNumber;
                const category = newBtn.dataset.category;
                const visible = newBtn.dataset.visible;
                const questStatus = newBtn.dataset.questStatus;
                if (!uuid) return;
                await this._beginQuestPinPlacement(uuid, questNumber, category, questStatus, visible);
            });
        });

        // Pin to Scene (objective-level) - GM only
        nativeHtml.querySelectorAll('.objective-pin-to-scene').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const questUuid = newBtn.dataset.questUuid;
                const questNumber = newBtn.dataset.questNumber;
                const category = newBtn.dataset.category;
                const visible = newBtn.dataset.visible;
                const taskIndex = parseInt(newBtn.dataset.taskIndex, 10);
                const taskState = newBtn.dataset.taskState || 'active';
                const taskText = newBtn.dataset.taskText || '';
                if (questUuid == null || isNaN(taskIndex)) return;
                await this._beginObjectivePinPlacement(
                    questUuid,
                    taskIndex,
                    questNumber,
                    category,
                    visible,
                    { state: taskState, text: taskText }
                );
            });
        });

        
        // Active objective click handler (pinned quests only)
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.clickable-objective').forEach(objective => {
            const newObjective = objective.cloneNode(true);
            objective.parentNode?.replaceChild(newObjective, objective);
            newObjective.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const taskIndex = parseInt(event.currentTarget.dataset.taskIndex);
                const questUuid = event.currentTarget.dataset.questUuid;
                
                if (isNaN(taskIndex) || !questUuid) return;
                
                // Get current active objective for this quest
                const currentActiveIndex = await this._getActiveObjectiveIndex(questUuid);
                            
                if (currentActiveIndex === taskIndex) {
                    // If clicking the same objective, clear it
                    await this._clearActiveObjective(questUuid);
                    ui.notifications.info('Active objective cleared.');
                } else {
                    // Clear ALL active objectives first (only one can be active at a time)
                    await this._clearAllActiveObjectives();
                    
                    // Set new active objective
                    await this._setActiveObjective(questUuid, taskIndex);
                    ui.notifications.info(`Objective ${taskIndex + 1} set as active.`);
                }
                
                // Re-render to update the display
                this.render(this.element);
            });
        });

        // Clear All Quest Pins (GM only)
        // v13: Use nativeHtml instead of html
        const clearAllQuestPinsButton = nativeHtml.querySelector('.clear-all-quest-pins');
        if (clearAllQuestPinsButton) {
            const newButton = clearAllQuestPinsButton.cloneNode(true);
            clearAllQuestPinsButton.parentNode?.replaceChild(newButton, clearAllQuestPinsButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;
                new Dialog({
                    title: 'Clear All Quest Pins',
                    content: `
                        <p>Choose which scenes to clear quest pins from:</p>
                        <div style="margin: 10px 0;">
                            <label><input type="radio" name="clearScope" value="thisScene" checked> This Scene Only</label>
                        </div>
                        <div style="margin: 10px 0;">
                            <label><input type="radio" name="clearScope" value="allScenes"> All Scenes</label>
                        </div>
                    `,
                    buttons: {
                        clear: {
                            icon: '<i class="fa-solid fa-trash-alt"></i>',
                            label: 'Clear Pins',
                            callback: async (dlgHtml) => {
                                // v13: Detect and convert jQuery to native DOM if needed
                                let nativeDlgHtml = dlgHtml;
                                if (dlgHtml && (dlgHtml.jquery || typeof dlgHtml.find === 'function')) {
                                    nativeDlgHtml = dlgHtml[0] || dlgHtml.get?.(0) || dlgHtml;
                                }
                                const checkedInput = nativeDlgHtml.querySelector('input[name="clearScope"]:checked');
                                const scope = checkedInput?.value;
                                if (scope) {
                                    await this._clearAllQuestPins(scope);
                                }
                            }
                        },
                        cancel: {
                            icon: '<i class="fa-solid fa-times"></i>',
                            label: 'Cancel'
                        }
                    }
                }).render(true);
            });
        }

        // Toggle Pin Visibility (GM and Players) - uses Blacksmith setModuleVisibility
        // v13: Use nativeHtml instead of html
        const togglePinVisibilityButton = nativeHtml.querySelector('.toggle-pin-visibility');
        if (togglePinVisibilityButton) {
            const newButton = togglePinVisibilityButton.cloneNode(true);
            togglePinVisibilityButton.parentNode?.replaceChild(newButton, togglePinVisibilityButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const currentVisible = getQuestPinModuleVisibility();
                const newVisible = !currentVisible;
                await setQuestPinModuleVisibility(newVisible);

                // Update the icon - use currentTarget or fallback to finding the element
                const icon = event.currentTarget || newButton;
                if (icon && icon.classList) {
                    if (newVisible) {
                        icon.classList.remove('fa-location-dot-slash');
                        icon.classList.add('fa-location-dot');
                        icon.title = 'Hide Quest Pins';
                    } else {
                        icon.classList.remove('fa-location-dot');
                        icon.classList.add('fa-location-dot-slash');
                        icon.title = 'Show Quest Pins';
                    }
                }

                ui.notifications.info(`Quest pins ${newVisible ? 'shown' : 'hidden'}.`);
            });
        }

        // Toggle Pin Labels
        // v13: Use nativeHtml instead of html
        const togglePinLabelsButton = nativeHtml.querySelector('.toggle-pin-labels');
        if (togglePinLabelsButton) {
            const newButton = togglePinLabelsButton.cloneNode(true);
            togglePinLabelsButton.parentNode?.replaceChild(newButton, togglePinLabelsButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const currentLabels = game.settings.get(MODULE.ID, 'showQuestPinText');
                const newLabels = !currentLabels;
                
                await game.settings.set(MODULE.ID, 'showQuestPinText', newLabels);
                
                // Update the icon
                const icon = event.currentTarget;
                if (newLabels) {
                    icon.classList.remove('fa-text-slash');
                    icon.classList.add('fa-text');
                    icon.title = 'Hide Quest Labels';
                } else {
                    icon.classList.remove('fa-text');
                    icon.classList.add('fa-text-slash');
                    icon.title = 'Show Quest Labels';
                }
                
                // MIGRATED TO BLACKSMITH API: Reload pins to apply label changes
                const pins = getPinsApi();
                if (pins?.isAvailable()) {
                    await pins.reload({ moduleId: MODULE.ID });
                }
                
                ui.notifications.info(`Quest pin labels ${newLabels ? 'shown' : 'hidden'}.`);
            });
        }

        // Import Quests from JSON (GM only)
        // v13: Use nativeHtml instead of html
        const importQuestsButton = nativeHtml.querySelector('.import-quests-json');
        if (importQuestsButton) {
            const newButton = importQuestsButton.cloneNode(true);
            importQuestsButton.parentNode?.replaceChild(newButton, importQuestsButton);
            newButton.addEventListener('click', async () => {
                if (!game.user.isGM) return;
            // Load the template from prompts/prompt-quests.txt
            let template = '';
            try {
                const response = await fetch('modules/coffee-pub-squire/prompts/prompt-quests.txt');
                if (response.ok) {
                    template = await response.text();
                } else {
                    template = 'Failed to load prompt-quests.txt.';
                }
            } catch (e) {
                template = 'Failed to load prompt-quests.txt.';
            }
            new Dialog({
                title: 'Import Quests and Scene Pins from JSON',
                width: 600,
                resizable: true,
                content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                    type: 'quests',
                    isImport: true,
                    isExport: false,
                    jsonInputId: 'import-quests-json-input'
                }),
                buttons: {
                    cancel: {
                        icon: '<i class="fa-solid fa-times"></i>',
                        label: 'Cancel Import'
                    },
                    import: {
                        icon: '<i class="fa-solid fa-file-import"></i>',
                        label: 'Import JSON',
                        callback: async (dlgHtml) => {
                            // v13: Detect and convert jQuery to native DOM if needed
                            let nativeDlgHtml = dlgHtml;
                            if (dlgHtml && (dlgHtml.jquery || typeof dlgHtml.find === 'function')) {
                                nativeDlgHtml = dlgHtml[0] || dlgHtml.get?.(0) || dlgHtml;
                            }
                            const input = nativeDlgHtml.querySelector('#import-quests-json-input');
                            const inputValue = input?.value || '';
                            let importData;
                            try {
                                importData = JSON.parse(inputValue);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON: ' + e.message);
                                return;
                            }
                            
                            // Set import flag to prevent panel refreshes during import
                            this.isImporting = true;
                            
                            // Show progress bar
                            this._showProgressBar();
                            
                            try {
                                // Handle both legacy and enhanced formats
                                let quests, scenePins;
                                if (Array.isArray(importData)) {
                                    // Legacy format: direct array of quests
                                    quests = importData;
                                    scenePins = {};
                                } else if (importData.quests && Array.isArray(importData.quests)) {
                                    // Enhanced format: object with quests and scenePins
                                    quests = importData.quests;
                                    scenePins = importData.scenePins || {};
                                    
                                    // Show enhanced import info
                                    if (importData.exportVersion) {
                                        ui.notifications.info(`Importing enhanced export (v${importData.exportVersion}) with ${quests.length} quests and ${Object.keys(scenePins).length} scenes with pins.`);
                                    }
                                } else {
                                    ui.notifications.error('Invalid format: JSON must be either an array of quests or an object with quests and scenePins properties.');
                                    return;
                                }
                                
                                // Ensure categories include all required categories
                                let categories = game.settings.get(MODULE.ID, 'questCategories') || [];
                                let changed = false;
                                for (const cat of ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"]) {
                                    if (!categories.includes(cat)) { categories.push(cat); changed = true; }
                                }
                                if (changed) await game.settings.set(MODULE.ID, 'questCategories', categories);
                                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                                if (!journalId || journalId === 'none') {
                                    ui.notifications.error('No quest journal selected.');
                                    return;
                                }
                                const journal = game.journal.get(journalId);
                                if (!journal) {
                                    ui.notifications.error('Selected quest journal not found.');
                                    return;
                                }
                                
                                // Update progress for validation phase
                                this._updateProgressBar(10, 'Validating import data...');
                                
                                // Check for duplicate names in the import data itself
                                const importNameCounts = {};
                                const duplicateNames = [];
                                quests.forEach(q => {
                                    if (q.name) {
                                        importNameCounts[q.name] = (importNameCounts[q.name] || 0) + 1;
                                        if (importNameCounts[q.name] > 1 && !duplicateNames.includes(q.name)) {
                                            duplicateNames.push(q.name);
                                        }
                                    }
                                });
                                
                                if (duplicateNames.length > 0) {
                                    ui.notifications.warn(`Warning: Import data contains duplicate quest names: ${duplicateNames.join(', ')}. These will be merged with existing quests.`);
                                }
                                
                                // Update progress for quest processing phase
                                this._updateProgressBar(20, `Processing ${quests.length} quests...`);
                                
                                let imported = 0;
                                let updated = 0;
                                let duplicatesMerged = 0;
                                const totalQuests = quests.length;
                                
                                for (let i = 0; i < quests.length; i++) {
                                    const quest = quests[i];
                                    if (!quest.name) continue;
                                    
                                    // Update progress for each quest
                                    const questProgress = 20 + ((i / totalQuests) * 60); // 20-80% range for quest processing
                                    this._updateProgressBar(questProgress, `Processing: ${quest.name}`);
                                    
                                    // Check if a quest with this UUID already exists (UUID takes priority)
                                    let existingPage = null;
                                    let matchType = 'none';
                                    
                                    if (quest.uuid) {
                                        existingPage = journal.pages.find(p => p.getFlag(MODULE.ID, 'questUuid') === quest.uuid);
                                        if (existingPage) matchType = 'uuid';
                                    }
                                    
                                    // If no UUID match, check by name as fallback
                                    if (!existingPage) {
                                        existingPage = journal.pages.find(p => p.name === quest.name);
                                        if (existingPage) matchType = 'name';
                                    }
                                    
                                    // Quest import duplicate detection
                                    
                                    if (existingPage) {
                                        // Update existing quest - PRESERVE EXISTING STATE
                                        const existingContent = existingPage.text.content;
                                        const updatedContent = this._mergeJournalContent(existingContent, quest);
                                        
                                        await existingPage.update({
                                            text: {
                                                content: updatedContent
                                            }
                                        });
                                        // Update flags if necessary
                                        if (quest.visible !== undefined) {
                                            await existingPage.setFlag(MODULE.ID, 'visible', quest.visible !== false);
                                        }
                                        // Make sure the questUuid flag is set
                                        const uuid = quest.uuid || existingPage.getFlag(MODULE.ID, 'questUuid') || foundry.utils.randomID();
                                        if (uuid !== existingPage.getFlag(MODULE.ID, 'questUuid')) {
                                            await existingPage.setFlag(MODULE.ID, 'questUuid', uuid);
                                        }
                                        
                                        // Update the page name if it's different (in case of name changes)
                                        if (quest.name && quest.name !== existingPage.name) {
                                            await existingPage.update({ name: quest.name });
                                        }
                                        // Set original category flag if status is Complete or Failed
                                        if (quest.status === 'Complete' || quest.status === 'Failed') {
                                            // Only set if not already set and the quest has a category
                                            if (!await existingPage.getFlag(MODULE.ID, 'originalCategory') && quest.category) {
                                                await existingPage.setFlag(MODULE.ID, 'originalCategory', quest.category);
                                            }
                                        }
                                        updated++;
                                        if (matchType === 'name') {
                                            duplicatesMerged++;
                                        }
                                    } else {
                                        // Create new quest
                                        const uuid = quest.uuid || foundry.utils.randomID();
                                        const pageData = {
                                            name: quest.name,
                                            type: 'text',
                                            text: {
                                                content: this._generateJournalContentFromImport(quest)
                                            },
                                            flags: {
                                                [MODULE.ID]: {
                                                    questUuid: uuid
                                                }
                                            }
                                        };
                                        const created = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                                        const page = created[0];
                                        if (page) {
                                            await page.setFlag(MODULE.ID, 'visible', quest.visible !== false);
                                            // Set original category flag if status is Complete or Failed
                                            if ((quest.status === 'Complete' || quest.status === 'Failed') && quest.category) {
                                                await page.setFlag(MODULE.ID, 'originalCategory', quest.category);
                                            }
                                            imported++;
                                        }
                                    }
                                    
                                    // Small delay to make progress visible
                                    if (i % 5 === 0) {
                                        await moduleDelay(100);
                                    }
                                }
                                
                                // Update progress for scene pins import
                                this._updateProgressBar(80, 'Importing scene pins...');
                                
                                // Import scene pins if available
                                if (Object.keys(scenePins).length > 0) {
                                    try {
                                        await this._importScenePins(scenePins);
                                    } catch (error) {
                                        console.error('Error during scene pin import:', error);
                                        ui.notifications.warn('Scene pins import failed, but quests were imported successfully. Check console for details.');
                                    }
                                }
                                
                                // Update progress for completion
                                this._updateProgressBar(90, 'Finalizing import...');
                                
                                let message = `Quest import complete: ${imported} added, ${updated} updated.`;
                                if (duplicatesMerged > 0) {
                                    message += ` ${duplicatesMerged} duplicates were merged.`;
                                }
                                ui.notifications.info(message);
                                
                                // Show completion message in progress bar
                                this._updateProgressBar(100, 'Import complete!');
                                
                                // Keep completion message visible for a moment
                                await moduleDelay(2000);
                                
                                // Hide progress bar
                                this._hideProgressBar();
                                
                                // Clear import flag and refresh panel once at the end
                                this.isImporting = false;
                                await this._refreshData();
                                this.render(this.element);
                                
                            } catch (error) {
                                // Hide progress bar on error
                                this._hideProgressBar();
                                
                                // Clear import flag on error
                                this.isImporting = false;
                                
                                console.error('Error during quest import:', error);
                                ui.notifications.error(`Quest import failed: ${error.message}`);
                            }
                        }
                    }
                },
                default: 'import',
                render: (html) => {
                    // v13: Detect and convert jQuery to native DOM if needed
                    let nativeDlgHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeDlgHtml = html[0] || html.get?.(0) || html;
                    }
                    
                    // Apply custom button classes
                    const cancelButton = nativeDlgHtml.querySelector('[data-button="cancel"]');
                    if (cancelButton) cancelButton.classList.add('squire-cancel-button');
                    const importButton = nativeDlgHtml.querySelector('[data-button="import"]');
                    if (importButton) importButton.classList.add('squire-submit-button');
                    
                    // Copy template button
                    const copyTemplateButton = nativeDlgHtml.querySelector('.copy-template-button');
                    if (copyTemplateButton) {
                        copyTemplateButton.addEventListener('click', () => {
                            let output = template;
                            const rulebooks = game.settings.get(MODULE.ID, 'defaultRulebooks');
                            if (rulebooks && rulebooks.trim()) {
                                output = output.replace('[ADD-RULEBOOKS-HERE]', rulebooks);
                            }
                            copyToClipboard(output);
                            ui.notifications.info('Template copied to clipboard!');
                        });
                    }
                    
                    // Browse file button
                    const browseFileButton = nativeDlgHtml.querySelector('.browse-file-button');
                    if (browseFileButton) {
                        browseFileButton.addEventListener('click', () => {
                            const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                            if (fileInput) fileInput.click();
                        });
                    }
                    
                    // File input change handler
                    const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                    if (fileInput) {
                        fileInput.addEventListener('change', async (event) => {
                            const file = event.target.files[0];
                            if (!file) return;
                            
                            try {
                                // Check file type
                                if (!file.name.toLowerCase().endsWith('.json')) {
                                    ui.notifications.error('Please select a JSON file.');
                                    return;
                                }
                                
                                // Read file content
                                const text = await file.text();
                                let importData;
                                
                                try {
                                    importData = JSON.parse(text);
                                } catch (e) {
                                    ui.notifications.error('Invalid JSON in file: ' + e.message);
                                    return;
                                }
                                
                                // Validate format
                                let quests, scenePins;
                                if (Array.isArray(importData)) {
                                    quests = importData;
                                    scenePins = {};
                                } else if (importData.quests && Array.isArray(importData.quests)) {
                                    quests = importData.quests;
                                    scenePins = importData.scenePins || {};
                                    
                                    if (importData.exportVersion) {
                                        ui.notifications.info(`File contains enhanced export (v${importData.exportVersion}) with ${quests.length} quests and ${Object.keys(scenePins).length} scenes with pins.`);
                                    }
                                } else {
                                    ui.notifications.error('Invalid file format: Must be either an array of quests or an object with quests and scenePins properties.');
                                    return;
                                }
                                
                                // Auto-populate the textarea with the file content
                                const jsonInput = nativeDlgHtml.querySelector('#import-quests-json-input');
                                if (jsonInput) {
                                    jsonInput.value = text;
                                }
                                
                                // Show success message
                                ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                                
                                // Reset file input
                                event.target.value = '';
                                
                            } catch (error) {
                                console.error('Error reading file:', { error, fileName: file.name });
                                ui.notifications.error(`Error reading file: ${error.message}`);
                            }
                        });
                    }
                }
            }, {
                classes: ['import-export-dialog'],
                id: 'import-export-dialog-quest-import',
            }).render(true);
            });
        }

        // Export Quests to JSON (GM only)
        // Export Quests to JSON (GM only)
        // v13: Use nativeHtml instead of html
        const exportQuestsButton = nativeHtml.querySelector('.export-quests-json');
        if (exportQuestsButton) {
            const newButton = exportQuestsButton.cloneNode(true);
            exportQuestsButton.parentNode?.replaceChild(newButton, exportQuestsButton);
            newButton.addEventListener('click', async () => {
                if (!game.user.isGM) return;
            
            // Make sure data is refreshed
            await this._refreshData();
            
            // Collect all quests from all categories
            const allQuests = [];
            for (const category of this.categories) {
                allQuests.push(...this.data[category] || []);
            }
            
            // Remove duplicates by UUID
            const uniqueQuests = [];
            const seenUUIDs = new Set();
            allQuests.forEach(quest => {
                if (quest.uuid && !seenUUIDs.has(quest.uuid)) {
                    seenUUIDs.add(quest.uuid);
                    uniqueQuests.push(quest);
                }
            });
            
            if (uniqueQuests.length === 0) {
                ui.notifications.warn("No quests to export");
                return;
            }
            
            // Convert quests to a simpler exportable format
            const exportQuests = uniqueQuests.map(q => {
                const quest = {
                    name: q.name,
                    uuid: q.uuid,
                    img: q.img || "",
                    category: q.category || "Side Quest",
                    description: q.description || "",
                    plotHook: q.plotHook || "",
                    status: q.status || "Not Started",
                    visible: q.visible !== false,
                    timeframe: q.timeframe || { duration: "" },
                    tasks: q.tasks?.map(t => ({
                        text: t.text,
                        completed: t.completed || false,
                        state: t.state || "active",
                        gmnotes: t.gmHint || "",
                        tasktreasure: t.treasureUnlocks || [],
                        originalText: t.originalText || ""
                    })) || [],
                    reward: {
                        xp: q.reward?.xp || 0,
                        treasure: q.reward?.treasure || []
                    },
                    participants: q.participants || [],
                    tags: q.tags || [],
                    location: q.location || ""
                };
                if (quest.img && typeof quest.img === 'string') {
                    const origin = window.location.origin + '/';
                    if (quest.img.startsWith(origin)) {
                        quest.img = quest.img.slice(origin.length);
                    }
                }
                return quest;
            });
            
            // Export scene pins data
            const scenePins = await this._exportScenePins();
            
            // Create enhanced export data with both quests and scene pins
            const enhancedExportData = {
                quests: exportQuests,
                scenePins: scenePins,
                exportVersion: "1.1",
                timestamp: new Date().toISOString(),
                metadata: {
                    totalQuests: exportQuests.length,
                    totalScenesWithPins: Object.keys(scenePins).length,
                    totalPins: Object.values(scenePins).reduce((sum, scene) => sum + (scene.questPins ? scene.questPins.length : 0), 0)
                }
            };
            
            // Create a download dialog with the enhanced JSON
            const exportData = JSON.stringify(enhancedExportData, null, 2);
            new Dialog({
                title: 'Export Quests and Scene Pins to JSON',
                width: 600,
                resizable: true,
                content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                    type: 'quests',
                    isImport: false,
                    isExport: true,
                    jsonOutputId: 'export-quests-json-output',
                    exportData: exportData,
                    exportSummary: {
                        totalItems: exportQuests.length,
                        totalScenes: Object.keys(scenePins).length,
                        totalPins: Object.values(scenePins).reduce((sum, scene) => sum + (scene.questPins ? scene.questPins.length : 0), 0),
                        exportVersion: enhancedExportData.exportVersion,
                        timestamp: enhancedExportData.timestamp
                    },
                    hasScenePins: Object.keys(scenePins).length > 0,
                    scenePins: Object.keys(scenePins).length > 0 ? Object.values(scenePins).map(scene => ({ sceneName: scene.sceneName })) : []
                }),
                buttons: {
                    close: {
                        icon: '<i class="fa-solid fa-times"></i>',
                        label: 'Cancel Export'
                    },
                    download: {
                        icon: '<i class="fa-solid fa-download"></i>',
                        label: 'Download JSON',
                        callback: () => {
                            try {
                                // Windows-safe filename sanitization
                                const sanitizeWindowsFilename = (name) => {
                                    return name
                                        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
                                        .replace(/\s+$/g, "")
                                        .replace(/\.+$/g, "")
                                        .slice(0, 150); // keep it reasonable
                                };
                                
                                // Build a Windows-safe filename (avoid colons from timestamps!)
                                const stamp = new Date().toISOString().replace(/[:]/g, "-"); // 2025-08-15T23-10-05.123Z
                                const filename = sanitizeWindowsFilename(`COFFEEPUB-SQUIRE-quests-export-${stamp}.json`);
                                
                                // Use Foundry's built-in helper (v10+) - this handles Blob creation + anchor download correctly
                                if (typeof saveDataToFile === 'function') {
                                    saveDataToFile(exportData, "application/json;charset=utf-8", filename);
                                    ui.notifications.info(`Quest export saved as ${filename}`);
                                } else {
                                    // Fallback: use the classic anchor approach with sanitized filename
                                    const blob = new Blob([exportData], { 
                                        type: 'application/json;charset=utf-8' 
                                    });
                                    const url = URL.createObjectURL(blob);
                                    
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = filename;
                                    a.rel = "noopener"; // safety
                                    a.style.display = 'none';
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    
                                    // Always revoke after a tick so the download starts
                                    trackModuleTimeout(() => URL.revokeObjectURL(url), 0);
                                    
                                    ui.notifications.info(`Quest export downloaded as ${filename}`);
                                }
                            } catch (error) {
                                // Last resort: copy to clipboard
                                copyToClipboard(exportData);
                                ui.notifications.warn('Download failed. Export data copied to clipboard instead.');
                                console.error('Export download failed:', error);
                            }
                        }
                    }
                },
                default: 'download'
            }, {
                classes: ['import-export-dialog'],
                id: 'import-export-dialog-quest-export',
                render: (html) => {
                    // v13: Detect and convert jQuery to native DOM if needed
                    let nativeDlgHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeDlgHtml = html[0] || html.get?.(0) || html;
                    }
                    // Apply custom button classes
                    const closeButton = nativeDlgHtml.querySelector('[data-button="close"]');
                    if (closeButton) closeButton.classList.add('squire-cancel-button');
                    const downloadButton = nativeDlgHtml.querySelector('[data-button="download"]');
                    if (downloadButton) downloadButton.classList.add('squire-submit-button');
                }
            }).render(true);
            });
        }

        // Quest options menu (GM only) - Blacksmith Context Menu
        const ctxMenu = getBlacksmith()?.uiContextMenu;
        if (ctxMenu?.show) {
            nativeHtml.querySelectorAll('.quest-status-menu').forEach(menuButton => {
                const newButton = menuButton.cloneNode(true);
                menuButton.parentNode?.replaceChild(newButton, menuButton);
                newButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!game.user.isGM) return;
                    const uuid = newButton.dataset.uuid;
                    if (!uuid) return;

                    const zones = {
                        gm: [
                            {
                                name: 'Open Journal Page',
                                icon: 'fa-solid fa-feather',
                                callback: async () => {
                                    const doc = await fromUuid(uuid);
                                    if (doc) doc.sheet.render(true);
                                }
                            },
                            {
                                name: 'Clear Quest Pins',
                                icon: 'fa-solid fa-eraser',
                                callback: async () => {
                                    await this._clearQuestPins(uuid);
                                }
                            },
                            {
                                name: 'Change Status',
                                icon: 'fa-solid fa-pen',
                                submenu: [
                                    { name: 'Not Started', icon: 'fa-solid fa-circle', callback: () => this._applyQuestStatus(uuid, 'Not Started') },
                                    { name: 'In Progress', icon: 'fa-solid fa-spinner', callback: () => this._applyQuestStatus(uuid, 'In Progress') },
                                    { name: 'Complete', icon: 'fa-solid fa-check', callback: () => this._applyQuestStatus(uuid, 'Complete') },
                                    { name: 'Failed', icon: 'fa-solid fa-xmark', callback: () => this._applyQuestStatus(uuid, 'Failed') }
                                ]
                            }
                        ]
                    };

                    ctxMenu.show({
                        id: `${MODULE.ID}-quest-entry-menu`,
                        x: event.clientX,
                        y: event.clientY,
                        zones
                    });
                });
            });
        }

        // --- Drag and Drop for Quest Entries (GM only) ---
        if (game.user.isGM) {
            // v13: Use nativeHtml instead of html
            const questEntries = nativeHtml.querySelectorAll('.quest-entry');
            // v13: Cloning elements removes old listeners, so no need for .off()
            
            // v13: Use native DOM event listeners
            questEntries.forEach(entry => {
                entry.addEventListener('dragenter', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    let isValid = false;
                    try {
                        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
                        if (["Actor", "Item"].includes(data.type)) isValid = true;
                    } catch (e) {
                        // If we can't parse the data yet, assume it might be valid
                        isValid = true;
                    }
                    
                    if (isValid) {
                        event.currentTarget.classList.add('drop-target');
                    }
                });

                entry.addEventListener('dragleave', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.classList.remove('drop-target');
                });

                entry.addEventListener('dragover', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    // Make sure the class stays applied during dragover
                    event.currentTarget.classList.add('drop-target');
                    event.dataTransfer.dropEffect = 'copy';
                });

                entry.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    const entryEl = event.currentTarget;
                    entryEl.classList.remove('drop-target');
                    
                    try {
                        const dataTransfer = event.dataTransfer.getData('text/plain');
                        const data = JSON.parse(dataTransfer);
                        const blacksmith = getBlacksmith();
                        if (blacksmith) {
                            const sound = game.settings.get(MODULE.ID, 'dropSound');
                            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                        }
                        const uuid = entryEl.dataset.questUuid;
                        if (!uuid) {
                            ui.notifications.warn("Could not find the quest entry.");
                            return;
                        }
                    const page = await fromUuid(uuid);
                    if (!page) {
                        ui.notifications.warn("Could not find the quest page.");
                        return;
                    }
                    
                    // Get the document content
                    let content = page.text.content;
                    let updated = false;
                    
                    if (data.type === 'Actor') {
                        const actor = await fromUuid(data.uuid || (data.id ? `Actor.${data.id}` : undefined));
                        if (actor) {
                            // Create the UUID link for the actor
                            const uuidLink = actor.uuid ? `@UUID[${actor.uuid}]{${actor.name}}` : `@UUID[Actor.${actor.id}]{${actor.name}}`;

                            // NEW APPROACH: More aggressive HTML parsing to fix duplicate sections
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = content;
                            
                            // Find all Participants sections
                            const participantHeadings = [...tempDiv.querySelectorAll('p')].filter(p => 
                                p.textContent.trim().startsWith('Participants:') || 
                                (p.querySelector('strong') && p.querySelector('strong').textContent.trim() === 'Participants:')
                            );
                            
                            if (participantHeadings.length > 0) {
                                // Get the first heading
                                const firstHeading = participantHeadings[0];
                                
                                // Find all participant lists following any heading
                                const allParticipantLists = [];
                                for (const heading of participantHeadings) {
                                    let nextElement = heading.nextElementSibling;
                                    while (nextElement && nextElement.tagName === 'UL') {
                                        allParticipantLists.push(nextElement);
                                        nextElement = nextElement.nextElementSibling;
                                    }
                                }
                                
                                // Collect all participant items
                                const allParticipants = [];
                                for (const list of allParticipantLists) {
                                    const items = list.querySelectorAll('li');
                                    for (const item of items) {
                                        allParticipants.push(item.innerHTML);
                                    }
                                }
                                
                                // Check if actor is already in participants
                                // We need to improve this check to handle various formats
                                const isActorAlreadyAdded = allParticipants.some(p => {
                                    // Check direct matches of the actor name or UUID
                                    if (p.includes(actor.name) || p.includes(actor.uuid)) return true;
                                    
                                    // Check for UUID pattern matches
                                    if (p.includes(`@UUID[${actor.uuid}]`) || p.includes(`@UUID[Actor.${actor.id}]`)) return true;
                                    
                                    // Parse the HTML to find data-uuid attributes
                                    const tempEl = document.createElement('div');
                                    tempEl.innerHTML = p;
                                    const links = tempEl.querySelectorAll('a[data-uuid]');
                                    for (const link of links) {
                                        const linkUuid = link.dataset.uuid;
                                        if (linkUuid === actor.uuid || linkUuid === `Actor.${actor.id}`) return true;
                                    }
                                    
                                    return false;
                                });
                                
                                if (isActorAlreadyAdded) {
                                    ui.notifications.warn(`${actor.name} is already a participant.`);
                                    return;
                                }
                                
                                // Add new actor
                                allParticipants.push(uuidLink);
                                
                                // Remove all existing participant lists
                                for (const list of allParticipantLists) {
                                    list.parentNode.removeChild(list);
                                }
                                
                                // Remove all participant headings except the first one
                                for (let i = 1; i < participantHeadings.length; i++) {
                                    participantHeadings[i].parentNode.removeChild(participantHeadings[i]);
                                }
                                
                                // Create new list after the first heading
                                const newList = document.createElement('ul');
                                newList.innerHTML = allParticipants.map(p => `<li class="quest-participant">${p}</li>`).join('');
                                
                                // Insert after the first heading
                                if (firstHeading.nextSibling) {
                                    firstHeading.parentNode.insertBefore(newList, firstHeading.nextSibling);
                                } else {
                                    firstHeading.parentNode.appendChild(newList);
                                }
                                
                                // Update the content
                                content = tempDiv.innerHTML;
                                updated = true;
                                ui.notifications.info(`Added ${actor.name} as a participant.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            } else {
                                // No participants section exists, create one at the end
                                const participantsSection = `
                                    <p><strong>Participants:</strong></p>
                                    <ul>
                                        <li class="quest-participant">${uuidLink}</li>
                                    </ul>
                                `;
                                content += participantsSection;
                                updated = true;
                                ui.notifications.info(`Added ${actor.name} as a participant.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            }
                        } else {
                            ui.notifications.error('Could not resolve actor from drop.');
                        }
                    } else if (data.type === 'Item') {
                        const item = await fromUuid(data.uuid || (data.id ? `Item.${data.id}` : undefined));
                        if (item) {
                            // Create the UUID link for the item
                            const uuidLink = item.uuid ? `@UUID[${item.uuid}]{${item.name}}` : `@UUID[Item.${item.id}]{${item.name}}`;

                            // Use DOM-based approach to fix duplicate sections
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = content;
                            
                            // Find all Treasure sections
                            const treasureHeadings = [...tempDiv.querySelectorAll('p')].filter(p => 
                                p.textContent.trim().startsWith('Treasure:') || 
                                (p.querySelector('strong') && p.querySelector('strong').textContent.trim() === 'Treasure:')
                            );
                            
                            if (treasureHeadings.length > 0) {
                                // Get the first heading
                                const firstHeading = treasureHeadings[0];
                                
                                // Find all treasure lists following any heading
                                const allTreasureLists = [];
                                for (const heading of treasureHeadings) {
                                    let nextElement = heading.nextElementSibling;
                                    while (nextElement && nextElement.tagName === 'UL') {
                                        allTreasureLists.push(nextElement);
                                        nextElement = nextElement.nextElementSibling;
                                    }
                                }
                                
                                // Collect all treasure items
                                const allTreasures = [];
                                for (const list of allTreasureLists) {
                                    const items = list.querySelectorAll('li');
                                    for (const item of items) {
                                        allTreasures.push(item.innerHTML);
                                    }
                                }
                                
                                // Check if item is already in treasures
                                const isItemAlreadyAdded = allTreasures.some(t => {
                                    // Check direct matches of the item name or UUID
                                    if (t.includes(item.name) || t.includes(item.uuid)) return true;
                                    
                                    // Check for UUID pattern matches
                                    if (t.includes(`@UUID[${item.uuid}]`) || t.includes(`@UUID[Item.${item.id}]`)) return true;
                                    
                                    // Parse the HTML to find data-uuid attributes
                                    const tempEl = document.createElement('div');
                                    tempEl.innerHTML = t;
                                    const links = tempEl.querySelectorAll('a[data-uuid]');
                                    for (const link of links) {
                                        const linkUuid = link.dataset.uuid;
                                        if (linkUuid === item.uuid || linkUuid === `Item.${item.id}`) return true;
                                    }
                                    
                                    return false;
                                });
                                
                                if (isItemAlreadyAdded) {
                                    ui.notifications.warn(`${item.name} is already listed as treasure.`);
                                    return;
                                }
                                
                                // Add new item
                                allTreasures.push(uuidLink);
                                
                                // Remove all existing treasure lists
                                for (const list of allTreasureLists) {
                                    list.parentNode.removeChild(list);
                                }
                                
                                // Remove all treasure headings except the first one
                                for (let i = 1; i < treasureHeadings.length; i++) {
                                    treasureHeadings[i].parentNode.removeChild(treasureHeadings[i]);
                                }
                                
                                // Create new list after the first heading
                                const newList = document.createElement('ul');
                                newList.innerHTML = allTreasures.map(t => `<li class="quest-treasure">${t}</li>`).join('');
                                
                                // Insert after the first heading
                                if (firstHeading.nextSibling) {
                                    firstHeading.parentNode.insertBefore(newList, firstHeading.nextSibling);
                                } else {
                                    firstHeading.parentNode.appendChild(newList);
                                }
                                
                                // Update the content
                                content = tempDiv.innerHTML;
                                updated = true;
                                ui.notifications.info(`Added ${item.name} as treasure.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            } else {
                                // No treasure section exists, create one at the end
                                const treasureSection = `
                                    <p><strong>Treasure:</strong></p>
                                    <ul>
                                        <li class="quest-treasure">${uuidLink}</li>
                                    </ul>
                                `;
                                content += treasureSection;
                                updated = true;
                                ui.notifications.info(`Added ${item.name} as treasure.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            }
                        } else {
                            ui.notifications.error('Could not resolve item from drop.');
                        }
                    }
                    if (updated) {
                        await page.update({ text: { content } });
                        this.render(this.element);
                    }
                } catch (error) {
                    console.error('Error handling quest entry drop:', error);
                    ui.notifications.error('Failed to add participant or treasure.');
                }
            });
            }); // Close forEach callback
        }

        // Participant portrait right-click to remove (GM only)
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.participant-portrait').forEach(portrait => {
            portrait.addEventListener('contextmenu', async function(event) {
                event.preventDefault();
                if (!game.user.isGM) return;
                
                const participantUuid = event.currentTarget.dataset.uuid;
                const participantName = event.currentTarget.title;
                const questEntry = event.currentTarget.closest('.quest-entry');
                if (!questEntry) return;
                const questUuid = questEntry.dataset.questUuid;
                
                if (!questUuid) {
                    ui.notifications.warn("Could not find the quest entry.");
                    return;
                }
                
                try {
                    // Get the quest page
                    const page = await fromUuid(questUuid);
                    if (!page) {
                        ui.notifications.warn("Could not find the quest page.");
                        return;
                    }
                    
                    // Get current content
                    let content = page.text.content;
                    
                    // Parse the content to find and remove the participant
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(content, 'text/html');
                    
                    // Find the participants paragraph
                    const participantsP = Array.from(doc.querySelectorAll('p')).find(p => {
                        const strong = p.querySelector('strong');
                        if (!strong) return false;
                        const text = strong.textContent.trim();
                        return text === 'Participants' || text === 'Participants:';
                    });
                    
                    if (participantsP) {
                        // Remove the specific participant from the content
                        const participantRegex = new RegExp(`@UUID\\[${participantUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\{[^}]+\\}`, 'g');
                        const nameRegex = new RegExp(`\\b${participantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                        
                        // Replace the participant with empty string and clean up
                        let newContent = content.replace(participantRegex, '');
                        newContent = newContent.replace(nameRegex, '');
                        
                        // Clean up extra commas and spaces
                        newContent = newContent.replace(/,\s*,/g, ',');
                        newContent = newContent.replace(/,\s*$/g, '');
                        newContent = newContent.replace(/^\s*,/g, '');
                        
                        // If no participants left, remove the entire participants section
                        if (!newContent.includes('@UUID[') && !newContent.match(/Participants:\s*[^,\s]/)) {
                            newContent = newContent.replace(/<p><strong>Participants:<\/strong>\s*[^<]*<\/p>\s*\n?/g, '');
                        }
                        
                        // Update the page
                        await page.update({
                            text: { content: newContent }
                        });
                        
                        ui.notifications.info(`Removed ${participantName} from the quest.`);
                    } else {
                        ui.notifications.warn("Could not find participants section in the quest.");
                    }
                } catch (error) {
                    console.error('Error removing participant:', { participantName, error });
                    ui.notifications.error(`Failed to remove ${participantName} from the quest.`);
                }
            });
        });
    }


    /**
     * Render the quest panel
     * @param {jQuery} element - The element to render into
     */
    async render(element) {
        if (!element) return;
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);

        const questContainer = this.element?.querySelector('[data-panel="panel-quest"]');
        if (!questContainer) return;

        // Always refresh data (safe even if no journal)
        await this._refreshData();

        // Check for pinned quests and show notification
        await this._checkAndNotifyPinnedQuest();

        // Get collapsed states
        const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'questTagCloudCollapsed') || false;
        // Get pinned quests
        const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
        // Get the current pinned quest (only one allowed)
        const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
        
        // Get active objectives (only one can be active at a time)
        const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
        const activeData = activeObjectives.active;
        
        let activeQuestUuid = null;
        let activeObjectiveIndex = null;
        
        if (activeData && typeof activeData === 'string') {
            const [storedUuid, indexStr] = activeData.split('|');
            activeQuestUuid = storedUuid;
            activeObjectiveIndex = parseInt(indexStr);
        }
        
        // Show active objective notification if there's an active objective
        if (activeQuestUuid && activeObjectiveIndex !== null) {
            try {
                const questPage = await fromUuid(activeQuestUuid);
                if (questPage) {
                    const questName = questPage.name || 'Unknown Quest';
                    
                    // Find the quest in our panel data
                    let questEntry = null;
                    for (const category of this.categories) {
                        questEntry = this.data[category]?.find(entry => entry.uuid === activeQuestUuid);
                        if (questEntry) break;
                    }
                    
                    if (questEntry?.tasks && questEntry.tasks[activeObjectiveIndex]) {
                        const objectiveText = questEntry.tasks[activeObjectiveIndex].text || 'Unknown Objective';
                        const objectiveNumber = activeObjectiveIndex + 1;
                        this.notifyActiveObjective(questName, objectiveText, objectiveNumber);
                    }
                }
            } catch (error) {
                console.error('Coffee Pub Squire | Error loading active objective notification:', error);
            }
        } else {
            // Clear notification if no active objective
            this.clearActiveObjectiveNotification();
        }

        // Prepare template data
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all quests
            allTags = new Set();
            for (const category of this.categories) {
                for (const entry of this.data[category] || []) {
                    // Add only explicit tags
                    if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                    }
                }
            }
        } else {
            // Players see tags only from visible quests
            allTags = new Set();
            for (const category of this.categories) {
                for (const entry of this.data[category] || []) {
                    if (entry.visible !== false) {
                        // Add only explicit tags
                        if (entry.tags && Array.isArray(entry.tags)) {
                        entry.tags.forEach(tag => allTags.add(tag));
                        }
                    }
                }
            }
        }
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categories: this.categories,
            statusGroups: {
                inProgress: [],
                notStarted: [],
                completed: [],
                failed: []
            },
            filters: {
                ...this.filters,
                search: this.filters.search || "",
                tags: this.filters.tags || []
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed,
            pinnedQuests
        };

        // Process all quests from all categories
        for (const category of this.categories) {
            let entries = this._applyFilters(this.data[category] || []);
            // Process each entry to add status and pinning info
            for (const entry of entries) {
                // Ensure entry is valid
                if (!entry || typeof entry !== 'object') continue;
                
                // Add additional properties needed for the template
                entry.category = category; // Ensure category is included in the entry
                entry.isPinned = entry.uuid === pinnedQuestUuid;

                // Ensure all required properties exist
                entry.tasks = entry.tasks || [];
                entry.reward = entry.reward || { xp: 0, treasure: [] };
                entry.participants = entry.participants || [];
                entry.tags = entry.tags || [];
                entry.timeframe = entry.timeframe || { duration: '' };
                entry.progress = entry.progress || 0;
                entry.status = entry.status || 'Not Started';

                // Add active objective data to tasks
                if (entry.tasks.length > 0) {
                    for (let index = 0; index < entry.tasks.length; index++) {
                        entry.tasks[index].isActive = (entry.uuid === activeQuestUuid && index === activeObjectiveIndex);
                    }
                }

                // --- UNLOCKED TREASURE LOGIC ---
                if (entry.reward && Array.isArray(entry.reward.treasure)) {
                    // Collect all treasure unlock names from all tasks
                    const allUnlockNames = (Array.isArray(entry.tasks) ? entry.tasks.flatMap(task => Array.isArray(task.treasureUnlocks) ? task.treasureUnlocks : []) : []).map(n => n && n.trim().toLowerCase());
                    entry.reward.treasure.forEach(treasure => {
                        if (!treasure) return;
                        // Get the treasure name or text
                        const treasureName = (treasure.name || treasure.text || '').trim().toLowerCase();
                        // Is this treasure referenced by any objective?
                        treasure.boundToObjective = allUnlockNames.includes(treasureName);
                        // Is this treasure unlocked by any completed task?
                        treasure.unlocked = treasure.boundToObjective && Array.isArray(entry.tasks) && entry.tasks.some(task =>
                            task.completed && Array.isArray(task.treasureUnlocks) &&
                            task.treasureUnlocks.some(unlockName => unlockName && treasureName && unlockName.trim().toLowerCase() === treasureName)
                        );
                    });
                }

                // Add to the appropriate status group
                if (entry.status === "Complete") {
                    templateData.statusGroups.completed.push(entry);
                } else if (entry.status === "Failed") {
                    templateData.statusGroups.failed.push(entry);
                } else if (entry.status === "In Progress") {
                    templateData.statusGroups.inProgress.push(entry);
                } else {
                    // Default to Not Started
                    templateData.statusGroups.notStarted.push(entry);
                }
            }
        }
        
        // Put pinned quests at the top of their respective groups
        for (const groupKey in templateData.statusGroups) {
            const group = templateData.statusGroups[groupKey];
            const pinnedIndex = group.findIndex(e => e.isPinned);
            if (pinnedIndex > 0) {
                const [pinned] = group.splice(pinnedIndex, 1);
                group.unshift(pinned);
            }
        }

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        const html = await renderTemplate(TEMPLATES.PANEL_QUEST, safeTemplateData);
        // v13: Use native DOM innerHTML instead of jQuery html()
        questContainer.innerHTML = html;

        // Activate listeners
        this._activateListeners(questContainer);

        // After rendering, set initial states
        if (this.filters.search) {
            const clearSearch = questContainer.querySelector('.clear-search');
            if (clearSearch) clearSearch.style.display = '';
        }
        if (!isTagCloudCollapsed) {
            const toggleTagsButton = questContainer.querySelector('.toggle-tags-button');
            if (toggleTagsButton) toggleTagsButton.classList.add('active');
        }
        
        // Set initial state of pin visibility toggle for all users (Blacksmith getModuleVisibility)
        const pinsVisible = getQuestPinModuleVisibility();
        const toggleButton = questContainer.querySelector('.toggle-pin-visibility');
        if (toggleButton) {
            if (pinsVisible) {
                toggleButton.classList.remove('fa-location-dot-slash');
                toggleButton.classList.add('fa-location-dot');
                toggleButton.setAttribute('title', 'Hide Quest Pins');
            } else {
                toggleButton.classList.remove('fa-location-dot');
                toggleButton.classList.add('fa-location-dot-slash');
                toggleButton.setAttribute('title', 'Show Quest Pins');
            }
        }
        
        // Set initial state of pin labels toggle for all users
        const showQuestPinText = game.settings.get(MODULE.ID, 'showQuestPinText');
        const labelsToggleButton = questContainer.querySelector('.toggle-pin-labels');
        if (labelsToggleButton) {
            if (showQuestPinText) {
                labelsToggleButton.classList.remove('fa-text-slash');
                labelsToggleButton.classList.add('fa-text');
                labelsToggleButton.setAttribute('title', 'Hide Quest Labels');
            } else {
                labelsToggleButton.classList.remove('fa-text');
                labelsToggleButton.classList.add('fa-text-slash');
                labelsToggleButton.setAttribute('title', 'Show Quest Labels');
            }
        }
        
        // Trigger hook for pin visibility updates
        Hooks.call('renderQuestPanel');
        
        // Auto-expand pinned quests
        if (pinnedQuestUuid) {
            // Make sure the In Progress section is expanded
            const inProgressSection = questContainer.querySelector('.quest-section[data-status="In Progress"]');
            if (inProgressSection) inProgressSection.classList.remove('collapsed');
            // Expand the pinned quest (v13: :has() selector not supported, manually filter)
            const questEntries = questContainer.querySelectorAll('.quest-entry');
            questEntries.forEach(entry => {
                const hasPinnedPin = entry.querySelector('.quest-pin.pinned');
                if (hasPinnedPin) entry.classList.remove('collapsed');
            });
        }

        // Apply collapsed states to sections
        // v13: Use safer selector approach to handle values with newlines/whitespace
        for (const [status, collapsed] of Object.entries(collapsedCategories)) {
            if (collapsed) {
                // Use querySelectorAll and filter to handle values with special characters
                const sections = questContainer.querySelectorAll('.quest-section[data-status]');
                const section = Array.from(sections).find(s => {
                    const attrValue = s.getAttribute('data-status');
                    return attrValue && attrValue.trim() === status.trim();
                });
                if (section) section.classList.add('collapsed');
            }
        }
    }

    /**
     * Merge imported quest data with existing journal content, preserving state
     * @param {string} existingContent - Current journal content
     * @param {Object} importedQuest - Quest data from import
     * @returns {string} Merged content with state preserved
     */
    _mergeJournalContent(existingContent, importedQuest) {
        // Parse existing content to extract current state
        const existingState = this._extractExistingState(existingContent);
        
        // Generate new content with preserved state
        let content = "";
        
        // Basic quest info (always update these)
        if (importedQuest.img) {
            content += `<img src="${importedQuest.img}" alt="${importedQuest.name}">\n\n`;
        }
        if (importedQuest.category) {
            content += `<p><strong>Category:</strong> ${importedQuest.category}</p>\n\n`;
        }
        if (importedQuest.description) {
            content += `<p><strong>Description:</strong> ${importedQuest.description}</p>\n\n`;
        }
        if (importedQuest.location) {
            content += `<p><strong>Location:</strong> ${importedQuest.location}</p>\n\n`;
        }
        if (importedQuest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${importedQuest.plotHook}</p>\n\n`;
        }
        
        // Tasks - PRESERVE EXISTING STATE
        if (importedQuest.tasks && importedQuest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            importedQuest.tasks.forEach((t, index) => {
                let taskText = typeof t === 'string' ? t : t.text;
                
                // Add GM hint if present (check both field names)
                if (t.gmHint || t.gmnotes) {
                    const hint = t.gmHint || t.gmnotes;
                    taskText += ` ||${hint}||`;
                }
                
                // Add treasure unlocks if present (check both field names and convert format)
                const treasures = t.treasureUnlocks || t.tasktreasure || [];
                if (treasures.length > 0) {
                    treasures.forEach(treasure => {
                        taskText += ` ((${treasure}))`;
                    });
                }
                
                // PRESERVE EXISTING TASK STATE
                const existingTaskState = existingState.tasks[index];
                if (existingTaskState) {
                    // Wrap in appropriate state tags based on existing state
                    if (existingTaskState.state === 'completed') {
                        taskText = `<s>${taskText}</s>`;
                    } else if (existingTaskState.state === 'failed') {
                        taskText = `<code>${taskText}</code>`;
                    } else if (existingTaskState.state === 'hidden') {
                        taskText = `<em>${taskText}</em>`;
                    }
                    // If state is 'active', no wrapping needed
                }
                
                content += `<li>${taskText}</li>\n`;
            });
            content += `</ul>\n\n`;
        }
        
        // Rewards
        if (importedQuest.reward) {
            if (importedQuest.reward.xp) content += `<p><strong>XP:</strong> ${importedQuest.reward.xp}</p>\n\n`;
            if (Array.isArray(importedQuest.reward.treasure) && importedQuest.reward.treasure.length > 0) {
                content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
                importedQuest.reward.treasure.forEach(t => {
                    if (t.uuid) {
                        content += `<li>@UUID[${t.uuid}]{${t.name || 'Item'}}</li>\n`;
                    } else if (t.name) {
                        content += `<li>${t.name}</li>\n`;
                    } else if (t.text) {
                        content += `<li>${t.text}</li>\n`;
                    }
                });
                content += `</ul>\n\n`;
            } else if (importedQuest.reward.treasure) {
                content += `<p><strong>Treasure:</strong> ${importedQuest.reward.treasure}</p>\n\n`;
            }
        }
        
        // Timeframe
        if (importedQuest.timeframe && importedQuest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${importedQuest.timeframe.duration}</p>\n\n`;
        }
        
        // Status - PRESERVE EXISTING STATUS
        const statusToUse = existingState.status || importedQuest.status || 'Not Started';
        content += `<p><strong>Status:</strong> ${statusToUse}</p>\n\n`;
        
        // Participants - PRESERVE EXISTING PARTICIPANTS
        const participantsToUse = existingState.participants.length > 0 ? existingState.participants : importedQuest.participants;
        
        // Auto-add party members if setting is enabled
        if (game.settings.get(MODULE.ID, 'autoAddPartyMembers')) {
            const partyActors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
            for (const actor of partyActors) {
                const alreadyPresent = participantsToUse.some(p => {
                    if (typeof p === 'string') return p === actor.name;
                    return (p.uuid && p.uuid === actor.uuid) || (p.name && p.name === actor.name);
                });
                if (!alreadyPresent) {
                    participantsToUse.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                    });
                }
            }
        }
        
        if (participantsToUse && participantsToUse.length) {
            const participantList = participantsToUse.map(p => {
                if (typeof p === 'string') return p;
                if (p.uuid) return `@UUID[${p.uuid}]{${p.name || 'Actor'}}`;
                return p.name || '';
            }).filter(p => p).join(', ');
            content += `<p><strong>Participants:</strong> ${participantList}</p>\n\n`;
        }
        
        // Tags
        if (importedQuest.tags && importedQuest.tags.length) {
            content += `<p><strong>Tags:</strong> ${importedQuest.tags.join(', ')}</p>\n\n`;
        }
        
        return content;
    }

    /**
     * Extract existing state from journal content
     * @param {string} content - Journal content
     * @returns {Object} Extracted state information
     */
    _extractExistingState(content) {
        const state = {
            tasks: [],
            status: 'Not Started',
            participants: []
        };
        
        try {
            // Extract task states
            const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
            if (tasksMatch) {
                const tasksHtml = tasksMatch[1];
                const parser = new DOMParser();
                const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                const ul = ulDoc.querySelector('ul');
                if (ul) {
                    const liList = Array.from(ul.children);
                    liList.forEach(li => {
                        let taskState = 'active';
                        if (li.querySelector('s')) {
                            taskState = 'completed';
                        } else if (li.querySelector('code')) {
                            taskState = 'failed';
                        } else if (li.querySelector('em')) {
                            taskState = 'hidden';
                        }
                        
                        // Extract task text (remove state tags)
                        let taskText = li.innerHTML;
                        taskText = taskText.replace(/<\/?[sema]>/g, ''); // Remove state tags
                        taskText = taskText.replace(/\|\|[^|]*\|\|/g, ''); // Remove GM hints
                        taskText = taskText.replace(/\[\[[^\]]*\]\]/g, ''); // Remove treasure unlocks
                        taskText = taskText.trim();
                        
                        state.tasks.push({
                            text: taskText,
                            state: taskState
                        });
                    });
                }
            }
            
            // Extract status
            const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
            if (statusMatch) {
                state.status = statusMatch[1].trim();
            }
            
            // Extract participants
            const participantsMatch = content.match(/<strong>Participants:<\/strong>\s*([^<]*)/);
            if (participantsMatch) {
                const participantsText = participantsMatch[1].trim();
                if (participantsText) {
                    // Parse participant references
                    const participantRefs = participantsText.match(/@UUID\[([^\]]+)\]\{([^}]+)\}/g);
                    if (participantRefs) {
                        participantRefs.forEach(ref => {
                            const uuidMatch = ref.match(/@UUID\[([^\]]+)\]\{([^}]+)\}/);
                            if (uuidMatch) {
                                state.participants.push({
                                    uuid: uuidMatch[1],
                                    name: uuidMatch[2]
                                });
                            }
                        });
                    } else {
                        // Simple comma-separated names
                        const names = participantsText.split(',').map(n => n.trim()).filter(n => n);
                        names.forEach(name => {
                            state.participants.push({ name });
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting existing state:', error);
        }
        
        return state;
    }

    /**
     * Generate journal content from imported quest object (for new quests only)
     */
    _generateJournalContentFromImport(quest) {
        let content = "";
        if (quest.img) {
            content += `<img src="${quest.img}" alt="${quest.name}">\n\n`;
        }
        if (quest.category) {
            content += `<p><strong>Category:</strong> ${quest.category}</p>\n\n`;
        }
        if (quest.description) {
            content += `<p><strong>Description:</strong> ${quest.description}</p>\n\n`;
        }
        if (quest.location) {
            content += `<p><strong>Location:</strong> ${quest.location}</p>\n\n`;
        }
        if (quest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${quest.plotHook}</p>\n\n`;
        }
        if (quest.tasks && quest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            quest.tasks.forEach(t => {
                let taskText = typeof t === 'string' ? t : t.text;
                
                // Add GM hint if present (check both field names)
                if (t.gmHint || t.gmnotes) {
                    const hint = t.gmHint || t.gmnotes;
                    taskText += ` ||${hint}||`;
                }
                
                // Add treasure unlocks if present (check both field names and convert format)
                const treasures = t.treasureUnlocks || t.tasktreasure || [];
                if (treasures.length > 0) {
                    treasures.forEach(treasure => {
                        taskText += ` ((${treasure}))`;
                    });
                }
                
                content += `<li>${taskText}</li>\n`;
            });
            content += `</ul>\n\n`;
        }
        if (quest.reward) {
            if (quest.reward.xp) content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
            if (Array.isArray(quest.reward.treasure) && quest.reward.treasure.length > 0) {
                content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
                quest.reward.treasure.forEach(t => {
                    if (t.uuid) {
                        content += `<li>@UUID[${t.uuid}]{${t.name || 'Item'}}</li>\n`;
                    } else if (t.name) {
                        content += `<li>${t.name}</li>\n`;
                    } else if (t.text) {
                        content += `<li>${t.text}</li>\n`;
                    }
                });
                content += `</ul>\n\n`;
            } else if (quest.reward.treasure) {
                content += `<p><strong>Treasure:</strong> ${quest.reward.treasure}</p>\n\n`;
            }
        }
        if (quest.timeframe && quest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${quest.timeframe.duration}</p>\n\n`;
        }
        if (quest.status) {
            content += `<p><strong>Status:</strong> ${quest.status}</p>\n\n`;
        }
        
        // --- AUTO ADD PARTY MEMBERS (JSON Import Only) ---
        const autoAddParty = game.settings.get(MODULE.ID, 'autoAddPartyMembers');
        if (autoAddParty) {
            // Ensure participants is an array
            if (!quest.participants) quest.participants = [];
            if (!Array.isArray(quest.participants)) quest.participants = [quest.participants];
            
            // Get all party members (actors of type 'character' with a player owner)
            const partyActors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
            for (const actor of partyActors) {
                // Only add if not already present by uuid or name
                const alreadyPresent = quest.participants.some(p => {
                    if (typeof p === 'string') return p === actor.name;
                    return (p.uuid && p.uuid === actor.uuid) || (p.name && p.name === actor.name);
                });
                if (!alreadyPresent) {
                    quest.participants.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                    });
                }
            }
        }
        
        if (quest.participants && quest.participants.length) {
            const participantList = quest.participants.map(p => {
                if (typeof p === 'string') return p;
                if (p.uuid) return `@UUID[${p.uuid}]{${p.name || 'Actor'}}`;
                return p.name || '';
            }).filter(p => p).join(', ');
            content += `<p><strong>Participants:</strong> ${participantList}</p>\n\n`;
        }
        if (quest.tags && quest.tags.length) {
            content += `<p><strong>Tags:</strong> ${quest.tags.join(', ')}</p>\n\n`;
        }
        return content;
    }

    /**
     * Export scene pins data for all scenes that have quest pins
     * @returns {Object} Object containing scene pin data
     */
    async _exportScenePins() {
        try {
            const allScenes = game.scenes.contents;
            const scenePins = {};
            let totalPins = 0;
            
            for (const scene of allScenes) {
                const pins = scene.getFlag(MODULE.ID, 'questPins') || [];
                if (pins.length > 0) {
                    // Validate pin data before export
                    const validPins = pins.filter(pin => {
                        return pin && 
                               pin.questUuid && 
                               typeof pin.x === 'number' && 
                               typeof pin.y === 'number';
                    });
                    
                    if (validPins.length > 0) {
                        scenePins[scene.id] = {
                            sceneName: scene.name,
                            sceneId: scene.id,
                            questPins: validPins
                        };
                        totalPins += validPins.length;
                    }
                }
            }
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                'Scene pins export completed', 
                { 
                    scenesWithPins: Object.keys(scenePins).length, 
                    totalPins: totalPins 
                }, 
                true, 
                false
            );
            
            return scenePins;
        } catch (error) {
            console.error('Error exporting scene pins:', error);
            return {};
        }
    }

    /**
     * Import scene pins data to scenes
     * @param {Object} scenePins - Scene pin data from export
     */
    async _importScenePins(scenePins) {
        try {
            let importedScenes = 0;
            let updatedPins = 0;
            let skippedScenes = 0;
            
            for (const [sceneId, sceneData] of Object.entries(scenePins)) {
                // Find scene by name (since ID might be different in target world)
                const scene = game.scenes.find(s => s.name === sceneData.sceneName);
                if (scene) {
                    // Get existing pins for this scene
                    const existingPins = scene.getFlag(MODULE.ID, 'questPins') || [];
                    const importedPins = sceneData.questPins;
                    
                    // Smart merge: avoid duplicates, preserve existing progress
                    const mergedPins = this._mergePinData(existingPins, importedPins);
                    
                    // Only update if there are changes
                    if (JSON.stringify(existingPins) !== JSON.stringify(mergedPins)) {
                        await scene.setFlag(MODULE.ID, 'questPins', mergedPins);
                        updatedPins += mergedPins.length;
                        importedScenes++;
                    }
                } else {
                    skippedScenes++;
                }
            }
            
            if (importedScenes > 0) {
                ui.notifications.info(`Scene pins imported: ${importedScenes} scenes updated with ${updatedPins} total pins.`);
                
                // MIGRATED TO BLACKSMITH API: Reload pins on canvas
                await reloadAllQuestPins();
            }
            
            if (skippedScenes > 0) {
                ui.notifications.warn(`${skippedScenes} scenes from import were not found in this world and were skipped.`);
            }
            
            if (importedScenes === 0 && skippedScenes === 0) {
                ui.notifications.info('No scene pins to import.');
            }
        } catch (error) {
            console.error('Error importing scene pins:', error);
            ui.notifications.error('Error importing scene pins. Check console for details.');
        }
    }

    /**
     * Smart merge of existing and imported pin data
     * @param {Array} existingPins - Current pins on the scene
     * @param {Array} importedPins - Pins from import data
     * @returns {Array} Merged pin data
     */
    _mergePinData(existingPins, importedPins) {
        const merged = [...existingPins];
        
        for (const importedPin of importedPins) {
            // Validate imported pin data
            if (!importedPin || !importedPin.questUuid || 
                typeof importedPin.x !== 'number' || typeof importedPin.y !== 'number') {
                continue;
            }
            
            // Check if pin already exists (by questUuid + objectiveIndex combination)
            const existingIndex = merged.findIndex(p => 
                p.questUuid === importedPin.questUuid && 
                p.objectiveIndex === importedPin.objectiveIndex
            );
            
            if (existingIndex >= 0) {
                // Update existing pin with new position but preserve state and progress
                merged[existingIndex] = {
                    ...importedPin,
                    // Preserve existing progress and state
                    objectiveState: merged[existingIndex].objectiveState || importedPin.objectiveState,
                    questStatus: merged[existingIndex].questStatus || importedPin.questStatus,
                    questState: merged[existingIndex].questState || importedPin.questState,
                    // Preserve existing pinId for continuity
                    pinId: merged[existingIndex].pinId
                };
            } else {
                // Add new pin with generated pinId
                merged.push({
                    ...importedPin,
                    pinId: `${importedPin.questUuid}-${importedPin.objectiveIndex || 'quest'}-${Date.now()}`
                });
            }
        }
        
        return merged;
    }

    /**
     * Show the global progress bar for quest imports
     * @private
     */
    _showProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressArea = nativeElement?.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement?.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement?.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting quest import...';
        }
    }

    /**
     * Update the global progress bar
     * @private
     */
    _updateProgressBar(percent, text) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressFill = nativeElement?.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement?.querySelector('.tray-progress-bar-text');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = text;
        }
    }

    /**
     * Hide the global progress bar
     * @private
     */
    _hideProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressArea = nativeElement?.querySelector('.tray-progress-bar-wrapper');
        if (progressArea) {
            progressArea.style.display = 'none';
        }
    }
} 
