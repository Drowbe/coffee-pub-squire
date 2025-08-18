import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { QuestParser } from './quest-parser.js';
import { QuestPin, loadPersistedPins } from './quest-pin.js';
import { copyToClipboard } from './helpers.js';

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

export class QuestPanel {
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
        this._verifyAndUpdateCategories();
        this._setupHooks();
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
        // Journal hooks are now handled by the centralized HookManager
        // This method is kept for compatibility but no longer registers hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Quest Panel: Hooks now managed by centralized HookManager',
            {},
            false,
            true,
            false,
            MODULE.TITLE
        );
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this.element = null;
    }

    /**
     * Clear all quest pins from specified scenes
     * @param {string} scope - 'thisScene' or 'allScenes'
     * @private
     */
    async _clearAllQuestPins(scope) {
        try {
            if (scope === 'thisScene') {
                // Clear pins from current scene only
                if (canvas.scene && canvas.squirePins) {
                    const pins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
                    let clearedCount = pins.length;
                    
                    if (clearedCount > 0) {
                        // Remove all pins from canvas first
                        pins.forEach(pin => {
                            canvas.squirePins.removeChild(pin);
                        });
                        
                        // Clear all pins from persistence in one operation (prevents multiple refreshes)
                        await canvas.scene.setFlag(MODULE.ID, 'questPins', []);
                        
                        ui.notifications.info(`Cleared ${clearedCount} quest pins from the current scene.`);
                    }
                }
            } else if (scope === 'allScenes') {
                // Clear pins from all scenes
                let totalCleared = 0;
                
                for (const scene of game.scenes.contents) {
                    const scenePins = scene.getFlag(MODULE.ID, 'questPins') || [];
                    if (scenePins.length > 0) {
                        await scene.setFlag(MODULE.ID, 'questPins', []);
                        totalCleared += scenePins.length;
                    }
                }
                
                // Also clear pins from current canvas if they exist
                if (canvas.squirePins) {
                    const pins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
                    pins.forEach(pin => {
                        canvas.squirePins.removeChild(pin);
                    });
                }
                
                ui.notifications.info(`Cleared ${totalCleared} quest pins from all scenes.`);
            }
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error clearing quest pins',
                { error, scope },
                false,
                true,
                true,
                MODULE.TITLE
            );
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
            if (!canvas.scene || !canvas.squirePins) return;
            
            // First, remove pins from the scene flags
            const scenePins = canvas.scene.getFlag(MODULE.ID, 'questPins') || [];
            const updatedScenePins = scenePins.filter(pinData => pinData.questUuid !== questUuid);
            await canvas.scene.setFlag(MODULE.ID, 'questPins', updatedScenePins);
            
            // Then remove pins from the canvas
            const pins = canvas.squirePins.children.filter(child => 
                child instanceof QuestPin && child.questUuid === questUuid
            );
            
            let clearedCount = 0;
            for (const pin of pins) {
                canvas.squirePins.removeChild(pin);
                clearedCount++;
            }
            
            ui.notifications.info(`Cleared ${clearedCount} quest pins from the current scene.`);
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error clearing quest pins',
                { error, questUuid },
                false,
                true,
                true,
                MODULE.TITLE
            );
            ui.notifications.error('Error clearing quest pins. See console for details.');
        }
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
                    
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Unpinned hidden quest from player',
                        { user: user.name, questUuid, category: pinnedCategory },
                        false,
                        true,
                        false,
                        MODULE.TITLE
                    );
                    
                    // Notify the player if they're online
                    if (user.active) {
                        ui.notifications.info(`${user.name}: Your pinned quest "${questName}" has been hidden by the GM and automatically unpinned.`);
                    }
                }
            }
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error unpinning hidden quest from players',
                { error, questUuid },
                false,
                true,
                true,
                MODULE.TITLE
            );
        }
    }

    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        `Error processing quest page ${page.name}`,
                        { page: page.name, error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
        // Search input - live DOM filtering
        const searchInput = html.find('.quest-search input');
        const clearButton = html.find('.clear-search');
        
        searchInput.on('input', (event) => {
            const searchValue = event.target.value.toLowerCase();
            this.filters.search = searchValue;
            
            // Show all entries first
            if (game.user.isGM) {
                html.find('.quest-entry').show();
            } else {
                html.find('.quest-entry:not(.unidentified)').show();
            }
            html.find('.quest-section').show();
            
            if (searchValue) {
                // Then filter entries
                const entriesToSearch = game.user.isGM ? 
                    html.find('.quest-entry') : 
                    html.find('.quest-entry:not(.unidentified)');

                entriesToSearch.each((i, el) => {
                    const entry = $(el);
                    const name = entry.find('.quest-entry-name').text().toLowerCase();
                    const description = entry.find('.quest-entry-description').text().toLowerCase();
                    const location = entry.find('.quest-entry-location').text().toLowerCase();
                    const tasks = entry.find('.quest-entry-tasks').text().toLowerCase();
                    const plotHook = entry.find('.quest-entry-plothook').text().toLowerCase();
                    const tags = entry.find('.quest-entry-tags').text().toLowerCase();
                    const treasure = entry.find('.quest-entry-reward').text().toLowerCase();
                    
                    // Special handling for participants - extract names from portrait title attributes
                    let participants = '';
                    entry.find('.participant-portrait').each(function() {
                        participants += $(this).attr('title') + ' ';
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
                    
                    entry.toggle(matches);
                });
                
                // Hide empty sections
                html.find('.quest-section').each((i, el) => {
                    const section = $(el);
                    const hasVisibleEntries = section.find('.quest-entry:visible').length > 0;
                    section.toggle(hasVisibleEntries);
                });
            } else {
                // When search is cleared, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        html.find(`.quest-section[data-status="${category}"]`).addClass('collapsed');
                    }
                }
            }
        });

        // Refresh button
        html.find('.refresh-quest-button').click(async () => {
            if (this.selectedJournal) {
                await this._refreshData();
                this.render(this.element);
                ui.notifications.info("Quests refreshed.");
            }
        });

        // Open quest journal button
        html.find('.open-quest-journal').click(async () => {
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

        // Add new quest button
        html.find('.add-quest-button').click(() => {
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

        // Tag cloud tag selection
        html.find('.quest-tag-cloud .quest-tag').click((event) => {
            event.preventDefault();
            const tag = event.currentTarget.dataset.tag;
            const tagIndex = this.filters.tags.indexOf(tag);
            if (tagIndex === -1) {
                this.filters.tags.push(tag);
            } else {
                this.filters.tags.splice(tagIndex, 1);
            }
            
            // Show all entries and sections before filtering
            html.find('.quest-entry').show();
            html.find('.quest-section').show();
            
            // If we have tags selected, expand all categories
            if (this.filters.tags.length > 0) {
                html.find('.quest-section').removeClass('collapsed');
            } else {
                // If no tags selected, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        html.find(`.quest-section[data-status="${category}"]`).addClass('collapsed');
                    }
                }
            }
            
            this.render(this.element);
        });

        // Clear search button
        clearButton.removeClass('disabled');
        clearButton.off('click').on('click', (event) => {
            this.filters.search = "";
            this.filters.tags = [];
            searchInput.val("");
            html.find('.quest-tag.selected').removeClass('selected');
            
            // Show all entries and sections
            html.find('.quest-entry').show();
            html.find('.quest-section').show();
            
            // Restore original collapsed states
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
            for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                if (collapsed) {
                    html.find(`.quest-section[data-status="${category}"]`).addClass('collapsed');
                }
            }
            
            this.render(this.element);
        });

        // Toggle tags button
        html.find('.toggle-tags-button').click((event) => {
            const button = $(event.currentTarget);
            const tagCloud = html.find('.quest-tag-cloud');
            const isCollapsed = tagCloud.hasClass('collapsed');
            
            tagCloud.toggleClass('collapsed');
            button.toggleClass('active');
            
            game.user.setFlag(MODULE.ID, 'questTagCloudCollapsed', !isCollapsed);
        });

        // Category collapse/expand
        html.find('.quest-category').click((event) => {
            const section = $(event.currentTarget).closest('.quest-section');
            section.toggleClass('collapsed');
            const status = section.data('status');
            const collapsed = section.hasClass('collapsed');
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
            collapsedCategories[status] = collapsed;
            game.user.setFlag(MODULE.ID, 'questCollapsedCategories', collapsedCategories);
        });

        // Journal selection
        html.find('.set-quest-button').click(() => {
            this._showJournalPicker();
        });

        // Link clicks
        html.find('.quest-entry-link').click(async (event) => {
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

        // Feather icon opens the current journal page
        html.find('.quest-entry-feather').click(async (event) => {
            event.preventDefault();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) doc.sheet.render(true);
            }
        });

        // Participant portrait clicks
        html.find('.participant-portrait').click(async (event) => {
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) doc.sheet.render(true);
            }
        });

        // Treasure UUID link clicks
        html.find('.quest-entry-reward a[data-uuid]').click(async (event) => {
            event.preventDefault();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) doc.sheet.render(true);
            }
        });

        // Task completion and hidden toggling
        const taskCheckboxes = html.find('.task-checkbox');
        
        // Add drag functionality for quest objectives (GM only)
        if (game.user.isGM) {
            // Make the objective text draggable (not the entire list item)
            const objectiveTexts = html.find('.quest-entry-tasks .objective-text-draggable');
            objectiveTexts.on('dragstart', (event) => {
                // Prevent drag if clicking on the checkbox
                if ($(event.target).hasClass('task-checkbox')) {
                    event.preventDefault();
                    return;
                }
                
                const textElement = $(event.currentTarget);
                const listItem = textElement.closest('li');
                const checkbox = listItem.find('.task-checkbox');
                const taskIndex = parseInt(checkbox.data('task-index'));
                const questEntry = listItem.closest('.quest-entry');
                const questUuid = questEntry.find('.quest-entry-feather').data('uuid');
                const questName = questEntry.find('.quest-entry-name').text().trim();
                const objectiveText = listItem.find('.objective-text-draggable').text().trim();
                
                // Get objective state from data attribute on the checkbox
                const objectiveState = checkbox.data('task-state') || 'active';

                
                // Get quest visibility state
                const questState = questEntry.data('visible') === false ? 'hidden' : 'visible';
                
                // Create drag data
                const dragData = {
                    type: 'quest-objective',
                    questUuid: questUuid,
                    objectiveIndex: taskIndex,
                    questName: questName,
                    objectiveText: objectiveText,
                    objectiveState: objectiveState,
                    questIndex: questEntry.data('quest-number') || '??',
                    questCategory: questEntry.data('category') || '??',
                    questState: questState
                };
                
                event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                event.originalEvent.dataTransfer.effectAllowed = 'copy';
                
                // Add visual feedback
                textElement.addClass('dragging');
            });
            
            objectiveTexts.on('dragend', (event) => {
                const textElement = $(event.currentTarget);
                textElement.removeClass('dragging');
            });
            
            // Make quest names draggable for quest-level pins (GM only)
            const questNames = html.find('.quest-entry-name');
            questNames.on('dragstart', (event) => {
                // Prevent drag if clicking on interactive elements
                if ($(event.target).hasClass('quest-entry-feather') ||
                    $(event.target).hasClass('quest-entry-visibility') ||
                    $(event.target).hasClass('quest-entry-toggle') ||
                    $(event.target).closest('.quest-entry-feather').length > 0 ||
                    $(event.target).closest('.quest-entry-visibility').length > 0 ||
                    $(event.target).closest('.quest-entry-toggle').length > 0) {
                    event.preventDefault();
                    return;
                }
                
                const questName = $(event.currentTarget);
                const questEntry = questName.closest('.quest-entry');
                const questUuid = questEntry.find('.quest-entry-feather').data('uuid');
                const questNameText = questName.text().trim();
                
                // Get quest visibility state
                const questState = questEntry.data('visible') === false ? 'hidden' : 'visible';
                
                // Get quest status from data attribute or default
                const questStatus = questEntry.data('quest-status') || 'Not Started';
                
                // Get participants from data attribute or default
                const participantsData = questEntry.data('participants') || '';
                const participants = participantsData ? participantsData.split(',').filter(p => p.trim()) : [];
                
                // Create drag data for quest-level pin
                const dragData = {
                    type: 'quest-quest',
                    questUuid: questUuid,
                    questName: questNameText,
                    questIndex: questEntry.data('quest-number') || '??',
                    questCategory: questEntry.data('category') || '??',
                    questState: questState,
                    questStatus: questStatus,
                    participants: participants
                };
                
                event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                event.originalEvent.dataTransfer.effectAllowed = 'copy';
                
                // Add visual feedback
                questName.addClass('dragging');
            });
            
            questNames.on('dragend', (event) => {
                const questName = $(event.currentTarget);
                questName.removeClass('dragging');
            });
        }
        
        // Use mousedown to detect different click types
        taskCheckboxes.on('mousedown', async function(event) {
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
            const checkbox = $(event.currentTarget);
            const taskIndex = parseInt(checkbox.data('task-index'));
            const questEntry = checkbox.closest('.quest-entry');
            const questUuid = questEntry.find('.quest-entry-feather').data('uuid');
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error updating journal page (hidden toggle)',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error updating journal page (failed task toggle)',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error updating journal page (completion toggle)',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
                }
            }
        }.bind(this));
        
        // Remove double-click handler since we've moved it to right-click
        taskCheckboxes.off('dblclick');
        
        // Prevent context menu on right-click
        taskCheckboxes.on('contextmenu', (event) => {
            event.preventDefault();
        });

        // --- Quest Card Collapse/Expand ---
        // Always start collapsed unless remembered
        html.find('.quest-entry').addClass('collapsed');
        // Restore open/closed state from user flag
        const questCardCollapsed = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
        html.find('.quest-entry').each(function() {
            const uuid = $(this).find('.quest-entry-feather').data('uuid');
            if (uuid && questCardCollapsed[uuid] === false) {
                $(this).removeClass('collapsed');
            }
        });
        // Unbind previous handlers before binding new ones
        html.off('click.questEntryToggle');
        html.off('click.questEntryHeader');
        // Toggle collapse on chevron click
        html.on('click.questEntryToggle', '.quest-entry-toggle', async function(e) {
            const card = $(this).closest('.quest-entry');
            card.toggleClass('collapsed');
            const uuid = card.find('.quest-entry-feather').data('uuid');
            if (uuid) {
                const collapsed = card.hasClass('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
            e.stopPropagation();
        });
        // Toggle collapse on header click (but not controls)
        html.on('click.questEntryHeader', '.quest-entry-header', async function(e) {
            if ($(e.target).closest('.quest-toolbar').length) return;
            const card = $(this).closest('.quest-entry');
            card.toggleClass('collapsed');
            const uuid = card.find('.quest-entry-feather').data('uuid');
            if (uuid) {
                const collapsed = card.hasClass('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
        });

        // Toggle quest visibility (show/hide to players)
        html.find('.toggle-visible').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!game.user.isGM) return;
            const icon = $(event.currentTarget);
            const uuid = icon.data('uuid');
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

        // Pin quest handler
        html.find('.quest-pin').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const icon = $(event.currentTarget);
            const uuid = icon.data('uuid');
            const category = icon.data('category');
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
            } else {
                // Clear any existing pins
                for (const cat in pinnedQuests) {
                    pinnedQuests[cat] = null;
                }
                // Pin this quest
                pinnedQuests[category] = uuid;
            }
            
            await game.user.setFlag(MODULE.ID, 'pinnedQuests', pinnedQuests);
            this.render(this.element);
            
            // Update the handle to reflect the pinned quest change
            if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance) {
                await game.modules.get('coffee-pub-squire').api.PanelManager.instance.updateHandle();
            }
        });

        // Clear All Quest Pins (GM only)
        html.find('.clear-all-quest-pins').click(async (event) => {
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
                        icon: '<i class="fas fa-trash-alt"></i>',
                        label: 'Clear Pins',
                        callback: async (dlgHtml) => {
                            const scope = dlgHtml.find('input[name="clearScope"]:checked').val();
                            await this._clearAllQuestPins(scope);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel'
                    }
                }
            }).render(true);
        });

        // Clear Quest Pins for specific quest (GM only)
        html.find('.clear-quest-pins').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!game.user.isGM) return;
            
            const icon = $(event.currentTarget);
            const uuid = icon.data('uuid');
            if (!uuid) return;
            
            const page = await fromUuid(uuid);
            if (!page) return;
            new Dialog({
                title: `Clear Pins for "${page.name}"`,
                content: `
                    <p>This will remove all quest pins for "${page.name}" from the current scene.</p>
                    <p><strong>This action cannot be undone.</strong></p>
                `,
                buttons: {
                    clear: {
                        icon: '<i class="fas fa-trash-alt"></i>',
                        label: 'Clear Quest Pins',
                        callback: async () => {
                            await this._clearQuestPins(uuid);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel'
                    }
                }
            }).render(true);
        });

        // Toggle Pin Visibility (GM and Players)
        html.find('.toggle-pin-visibility').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const currentVisibility = game.user.getFlag(MODULE.ID, 'hideQuestPins') || false;
            const newVisibility = !currentVisibility;
            
            await game.user.setFlag(MODULE.ID, 'hideQuestPins', newVisibility);
            
            // Update the icon
            const icon = $(event.currentTarget);
            if (newVisibility) {
                icon.removeClass('fa-location-dot-slash').addClass('fa-location-dot').attr('title', 'Show Quest Pins');
            } else {
                icon.removeClass('fa-location-dot').addClass('fa-location-dot-slash').attr('title', 'Hide Quest Pins');
            }
            
            // Update pin visibility on canvas
            if (canvas.squirePins) {
                const pins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
                pins.forEach(pin => {
                    pin.updateVisibility();
                });
            }
            
            ui.notifications.info(`Quest pins ${newVisibility ? 'hidden' : 'shown'}.`);
        });

        // Toggle Pin Labels
        html.find('.toggle-pin-labels').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const currentLabels = game.settings.get(MODULE.ID, 'showQuestPinText');
            const newLabels = !currentLabels;
            
            await game.settings.set(MODULE.ID, 'showQuestPinText', newLabels);
            
            // Update the icon
            const icon = $(event.currentTarget);
            if (newLabels) {
                icon.removeClass('fa-text-slash').addClass('fa-text').attr('title', 'Hide Quest Labels');
            } else {
                icon.removeClass('fa-text').addClass('fa-text-slash').attr('title', 'Show Quest Labels');
            }
            
            // Update pin appearance on canvas to show/hide labels
            if (canvas.squirePins) {
                canvas.squirePins.children.forEach(child => {
                    if (child._updatePinAppearance) {
                        child._updatePinAppearance();
                    }
                });
            }
            
            ui.notifications.info(`Quest pin labels ${newLabels ? 'shown' : 'hidden'}.`);
        });

        // Import Quests from JSON (GM only)
        html.find('.import-quests-json').click(async () => {
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
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel Import'
                    },
                    import: {
                        icon: '<i class="fas fa-file-import"></i>',
                        label: 'Import JSON',
                        callback: async (dlgHtml) => {
                            const input = dlgHtml.find('#import-quests-json-input').val();
                            let importData;
                            try {
                                importData = JSON.parse(input);
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
                                    
                                    // Debug logging for duplicate detection
                                    getBlacksmith()?.utils.postConsoleAndNotification(
                                        `Quest import: "${quest.name}" (${quest.uuid}) - Match: ${matchType}`,
                                        { quest: quest.name, uuid: quest.uuid, matchType, existingPage: existingPage?.name },
                                        false, true, false, MODULE.TITLE
                                    );
                                    
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
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                }
                                
                                // Update progress for scene pins import
                                this._updateProgressBar(80, 'Importing scene pins...');
                                
                                // Import scene pins if available
                                if (Object.keys(scenePins).length > 0) {
                                    try {
                                        await this._importScenePins(scenePins);
                                    } catch (error) {
                                        getBlacksmith()?.utils.postConsoleAndNotification('Error during scene pin import', { error }, false, true, true, MODULE.TITLE);
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
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
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
                                
                                getBlacksmith()?.utils.postConsoleAndNotification(
                                    'Error during quest import',
                                    { error },
                                    false,
                                    false,
                                    true,
                                    MODULE.TITLE
                                );
                                ui.notifications.error(`Quest import failed: ${error.message}`);
                            }
                        }
                    }
                },
                default: 'import',
                render: (html) => {
                    // Apply custom button classes
                    html.find('[data-button="cancel"]').addClass('squire-cancel-button');
                    html.find('[data-button="import"]').addClass('squire-submit-button');
                    
                    // Copy template button
                    html.find('.copy-template-button').click(() => {
                        let output = template;
                        const rulebooks = game.settings.get(MODULE.ID, 'defaultRulebooks');
                        if (rulebooks && rulebooks.trim()) {
                            output = output.replace('[ADD-RULEBOOKS-HERE]', rulebooks);
                        }
                        copyToClipboard(output);
                        ui.notifications.info('Template copied to clipboard!');
                    });
                    
                    // Browse file button
                    html.find('.browse-file-button').click(() => {
                        const fileInput = html.find('#import-file-input');
                        fileInput.click();
                    });
                    
                    // File input change handler
                    html.find('#import-file-input').change(async (event) => {
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
                            html.find('#import-quests-json-input').val(text);
                            
                            // Show success message
                            ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                            
                            // Reset file input
                            event.target.value = '';
                            
                        } catch (error) {
                            getBlacksmith()?.utils.postConsoleAndNotification('Error reading file', { error, fileName: file.name }, false, true, true, MODULE.TITLE);
                            ui.notifications.error(`Error reading file: ${error.message}`);
                        }
                    });
                }
            }, {
                classes: ['import-export-dialog'],
                id: 'import-export-dialog-quest-import',
            }).render(true);
        });

        // Export Quests to JSON (GM only)
        html.find('.export-quests-json').click(async () => {
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
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel Export'
                    },
                    download: {
                        icon: '<i class="fas fa-download"></i>',
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
                                    setTimeout(() => URL.revokeObjectURL(url), 0);
                                    
                                    ui.notifications.info(`Quest export downloaded as ${filename}`);
                                }
                            } catch (error) {
                                // Last resort: copy to clipboard
                                copyToClipboard(exportData);
                                ui.notifications.warn('Download failed. Export data copied to clipboard instead.');
                                getBlacksmith()?.utils.postConsoleAndNotification('Export download failed', { error }, false, true, true, MODULE.TITLE);
                            }
                        }
                    }
                },
                default: 'download'
            }, {
                classes: ['import-export-dialog'],
                id: 'import-export-dialog-quest-export',
                render: (html) => {
                    // Apply custom button classes
                    html.find('[data-button="close"]').addClass('squire-cancel-button');
                    html.find('[data-button="download"]').addClass('squire-submit-button');
                }
            }).render(true);
        });

        // Status menu (GM only)
        html.find('.quest-status-menu').click(function(event) {
            event.preventDefault();
            event.stopPropagation();
            // Hide any other open dropdowns
            html.find('.quest-status-dropdown').hide();
            // Show the dropdown next to this button
            const btn = $(this);
            const dropdown = btn.siblings('.quest-status-dropdown');
            
            if (dropdown.is(':visible')) {
                dropdown.hide();
            } else {
                // Position the dropdown properly before showing it
                const btnRect = btn[0].getBoundingClientRect();
                const toolbar = btn.closest('.quest-toolbar');
                const toolbarRect = toolbar[0].getBoundingClientRect();
                
                // Calculate position relative to the toolbar
                let left = btnRect.left - toolbarRect.left;
                const top = btnRect.bottom - toolbarRect.top + 4; // 4px gap
                
                // Get dropdown dimensions to check boundaries
                const dropdownWidth = 120; // min-width from CSS
                const toolbarWidth = toolbarRect.width;
                
                // Check if dropdown would run off the right edge
                if (left + dropdownWidth > toolbarWidth) {
                    // Position dropdown to the left of the button instead
                    left = Math.max(0, btnRect.right - toolbarRect.left - dropdownWidth);
                }
                
                // Apply positioning
                dropdown.css({
                    left: left + 'px',
                    top: top + 'px',
                    right: 'auto' // Override the CSS right: 0
                });
                
                dropdown.show();
            }
            
            // Close on click outside
            $(document).one('click.questStatusDropdown', () => dropdown.hide());
        });
        // Status option click
        html.find('.quest-status-option').click(async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const option = $(this);
            const newStatus = option.data('status');
            const uuid = option.data('uuid');
            if (!uuid) return;
            const page = await fromUuid(uuid);
            if (!page) return;
            
            let content = page.text.content;
            const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
            const currentStatus = statusMatch ? statusMatch[1].trim() : '';
            
            // Update the status in the content
            if (statusMatch) {
                content = content.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, `$1${newStatus}`);
            } else {
                content += `<p><strong>Status:</strong> ${newStatus}</p>`;
            }
            
            // Get the current category
            const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]*)/);
            const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';
            
            // Get the original category from flag or current category
            let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
            if (!originalCategory && currentCategory && !['Completed', 'Failed'].includes(currentCategory)) {
                originalCategory = currentCategory;
                await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
            }
            
            // Handle category changes based on status
            if (newStatus === 'Complete') {
                // Store original category if not already stored
                if (currentCategory !== 'Completed') {
                    if (!originalCategory && currentCategory) {
                        await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
                    }
                }
            } else if (newStatus === 'Failed') {
                // Store original category if not already stored
                if (currentCategory !== 'Failed') {
                    if (!originalCategory && currentCategory) {
                        await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
                    }
                }
            } else if (['Not Started', 'In Progress'].includes(newStatus)) {
                // Restore original category if quest is active again
                if (['Completed', 'Failed'].includes(currentCategory) && originalCategory) {
                    if (categoryMatch) {
                        content = content.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
                    }
                }
            }
            
            await page.update({ text: { content } });
            // No manual refresh; let the updateJournalEntryPage hook handle it
            option.closest('.quest-status-dropdown').hide();
        });

        // --- Drag and Drop for Quest Entries (GM only) ---
        if (game.user.isGM) {
            const questEntries = html.find('.quest-entry');
            questEntries.off('dragenter.squire dragleave.squire dragover.squire drop.squire');
            
            questEntries.on('dragenter.squire', function(event) {
                event.preventDefault();
                event.stopPropagation();
                let isValid = false;
                try {
                    const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                    if (["Actor", "Item"].includes(data.type)) isValid = true;
                } catch (e) {
                    // If we can't parse the data yet, assume it might be valid
                    isValid = true;
                }
                
                if (isValid) {
                    $(this).addClass('drop-target');
    
                }
            });

            questEntries.on('dragleave.squire', function(event) {
                event.preventDefault();
                event.stopPropagation();
                $(this).removeClass('drop-target');

            });

            questEntries.on('dragover.squire', function(event) {
                event.preventDefault();
                event.stopPropagation();
                // Make sure the class stays applied during dragover
                $(this).addClass('drop-target');
                event.originalEvent.dataTransfer.dropEffect = 'copy';
            });

            questEntries.on('drop.squire', async (event) => {
                event.preventDefault();
                const $entry = $(event.currentTarget);
                $entry.removeClass('drop-target');
                
                try {
                    const dataTransfer = event.originalEvent.dataTransfer.getData('text/plain');
                    const data = JSON.parse(dataTransfer);
                    const blacksmith = getBlacksmith();
                    if (blacksmith) {
                        const sound = game.settings.get(MODULE.ID, 'dropSound');
                        blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                    }
                    const uuid = $entry.find('.quest-entry-feather').data('uuid');
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
                                $entry.addClass('dropped-success');
                                setTimeout(() => $entry.removeClass('dropped-success'), 800);
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
                                $entry.addClass('dropped-success');
                                setTimeout(() => $entry.removeClass('dropped-success'), 800);
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
                                $entry.addClass('dropped-success');
                                setTimeout(() => $entry.removeClass('dropped-success'), 800);
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
                                $entry.addClass('dropped-success');
                                setTimeout(() => $entry.removeClass('dropped-success'), 800);
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error handling quest entry drop',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
                    ui.notifications.error('Failed to add participant or treasure.');
                }
            });
        }

        // Participant portrait right-click to remove (GM only)
        const self = this; // Capture the QuestPanel reference
        html.find('.participant-portrait').on('contextmenu', async function(event) {
            event.preventDefault();
            if (!game.user.isGM) return;
            
            const $portrait = $(this);
            const participantUuid = $portrait.data('uuid');
            const participantName = $portrait.attr('title');
            const $questEntry = $portrait.closest('.quest-entry');
            const questUuid = $questEntry.find('.quest-entry-feather').data('uuid');
            
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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error removing participant',
                    { participantName, error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.error(`Failed to remove ${participantName} from the quest.`);
            }
        });
    }

    /**
     * Show journal picker dialog
     * @private
     */
    _showJournalPicker() {
        const journals = game.journal.contents.map(j => ({
            id: j.id,
            name: j.name,
            img: j.thumbnail || j.img || 'icons/svg/book.svg',
            pages: j.pages.size
        }));
        journals.sort((a, b) => a.name.localeCompare(b.name));
        const content = `
        <h2 style="text-align: center; margin-bottom: 15px;">Select a Journal for Quests</h2>
        ${journals.length === 0 ? 
            `<div class="no-journals-message" style="text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-circle" style="font-size: 2em; margin-bottom: 10px; color: #aa0000;"></i>
                <p>No journals found in your world.</p>
                <p>You need to create at least one journal in the Journals tab first.</p>
            </div>` :
            `<div class="journal-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 15px;">
                <div class="journal-item" data-id="none" style="cursor: pointer; text-align: center; border: 1px solid #666; border-radius: 5px; padding: 10px; background: rgba(0,0,0,0.2);">
                    <div class="journal-image" style="height: 100px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-times-circle" style="font-size: 3em; color: #aa0000;"></i>
                    </div>
                    <div class="journal-name" style="margin-top: 5px; font-weight: bold;">None</div>
                </div>
                ${journals.map(j => `
                <div class="journal-item" data-id="${j.id}" style="cursor: pointer; text-align: center; border: 1px solid #666; border-radius: 5px; padding: 10px; background: rgba(0,0,0,0.2);">
                    <div class="journal-image" style="height: 100px; display: flex; align-items: center; justify-content: center; background-size: contain; background-position: center; background-repeat: no-repeat; background-image: url('${j.img}');">
                        ${!j.img ? `<i class="fas fa-book" style="font-size: 3em; color: #666;"></i>` : ''}
                    </div>
                    <div class="journal-name" style="margin-top: 5px; font-weight: bold;">${j.name}</div>
                    <div class="journal-pages" style="font-size: 0.8em; color: #999;">${j.pages} page${j.pages !== 1 ? 's' : ''}</div>
                </div>
                `).join('')}
            </div>`
        }
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(50, 50, 80, 0.3); border-radius: 5px;">
            <p style="margin-bottom: 5px; color: #ddd;"><i class="fas fa-info-circle" style="color: #88f;"></i> Each entry in this journal will be treated as a separate quest.</p>
        </div>
        <div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button>
        </div>
        `;
        const dialog = new Dialog({
            title: `Select Journal for Quests`,
            content: content,
            buttons: {},
            render: html => {
                html.find('.journal-item').click(async event => {
                    const journalId = event.currentTarget.dataset.id;
                    await game.settings.set(MODULE.ID, 'questJournal', journalId);
                    ui.notifications.info(`Journal for Quests ${journalId === 'none' ? 'cleared' : 'selected'}.`);
                    dialog.close();
                    this.render(this.element);
                });
                html.find('.cancel-button').click(() => dialog.close());
            },
            default: '',
            close: () => {}
        });
        dialog.render(true);
    }

    /**
     * Render the quest panel
     * @param {jQuery} element - The element to render into
     */
    async render(element) {
        if (!element) return;
        this.element = element;

        const questContainer = element.find('[data-panel="panel-quest"]');
        if (!questContainer.length) return;

        // Always refresh data (safe even if no journal)
        await this._refreshData();

        // Get collapsed states
        const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'questTagCloudCollapsed') || false;
        // Get pinned quests
        const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
        // Get the current pinned quest (only one allowed)
        const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);

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
            entries.forEach(entry => {
                // Ensure entry is valid
                if (!entry || typeof entry !== 'object') return;
                
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
            });
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
        questContainer.html(html);

        // Activate listeners
        this._activateListeners(questContainer);

        // After rendering, set initial states
        if (this.filters.search) {
            questContainer.find('.clear-search').show();
        }
        if (!isTagCloudCollapsed) {
            questContainer.find('.toggle-tags-button').addClass('active');
        }
        
        // Set initial state of pin visibility toggle for all users
        const hideQuestPins = game.user.getFlag(MODULE.ID, 'hideQuestPins') || false;
        const toggleButton = questContainer.find('.toggle-pin-visibility');
        if (hideQuestPins) {
            toggleButton.removeClass('fa-location-dot-slash').addClass('fa-location-dot').attr('title', 'Show Quest Pins');
        } else {
            toggleButton.removeClass('fa-location-dot').addClass('fa-location-dot-slash').attr('title', 'Hide Quest Pins');
        }
        
        // Set initial state of pin labels toggle for all users
        const showQuestPinText = game.settings.get(MODULE.ID, 'showQuestPinText');
        const labelsToggleButton = questContainer.find('.toggle-pin-labels');
        if (showQuestPinText) {
            labelsToggleButton.removeClass('fa-text-slash').addClass('fa-text').attr('title', 'Hide Quest Labels');
        } else {
            labelsToggleButton.removeClass('fa-text').addClass('fa-text-slash').attr('title', 'Show Quest Labels');
        }
        
        // Trigger hook for pin visibility updates
        Hooks.call('renderQuestPanel');
        
        // Auto-expand pinned quests
        if (pinnedQuestUuid) {
            // Make sure the In Progress section is expanded
            questContainer.find(`.quest-section[data-status="In Progress"]`).removeClass('collapsed');
            // Expand the pinned quest
            questContainer.find(`.quest-entry:has(.quest-pin.pinned)`).removeClass('collapsed');
        }

        // Apply collapsed states to sections
        for (const [status, collapsed] of Object.entries(collapsedCategories)) {
            if (collapsed) {
                questContainer.find(`.quest-section[data-status="${status}"]`).addClass('collapsed');
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
            getBlacksmith()?.utils.postConsoleAndNotification('Error extracting existing state', { error }, false, true, false, MODULE.TITLE);
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
            
            getBlacksmith()?.utils.postConsoleAndNotification('Scene pins export completed', { 
                scenesWithPins: Object.keys(scenePins).length, 
                totalPins: totalPins 
            }, false, true, false, MODULE.TITLE);
            
            return scenePins;
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification('Error exporting scene pins', { error }, false, true, false, MODULE.TITLE);
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
                
                // Reload pins on canvas if available
                if (canvas.squirePins && typeof loadPersistedPins === 'function') {
                    setTimeout(() => {
                        loadPersistedPins();
                    }, 1000);
                }
            }
            
            if (skippedScenes > 0) {
                ui.notifications.warn(`${skippedScenes} scenes from import were not found in this world and were skipped.`);
            }
            
            if (importedScenes === 0 && skippedScenes === 0) {
                ui.notifications.info('No scene pins to import.');
            }
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification('Error importing scene pins', { error }, false, true, true, MODULE.TITLE);
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
                getBlacksmith()?.utils.postConsoleAndNotification('Skipping invalid pin data during merge', { 
                    pin: importedPin 
                }, false, true, false, MODULE.TITLE);
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
        const progressArea = this.element?.find('.tray-progress-bar-wrapper');
        const progressFill = this.element?.find('.tray-progress-bar-inner');
        const progressText = this.element?.find('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.show();
            progressFill.css('width', '0%');
            progressText.text('Starting quest import...');
        }
    }

    /**
     * Update the global progress bar
     * @private
     */
    _updateProgressBar(percent, text) {
        const progressFill = this.element?.find('.tray-progress-bar-inner');
        const progressText = this.element?.find('.tray-progress-bar-text');
        
        if (progressFill && progressText) {
            progressFill.css('width', `${percent}%`);
            progressText.text(text);
        }
    }

    /**
     * Hide the global progress bar
     * @private
     */
    _hideProgressBar() {
        const progressArea = this.element?.find('.tray-progress-bar-wrapper');
        if (progressArea) {
            progressArea.hide();
        }
    }
} 