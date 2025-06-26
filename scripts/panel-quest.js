import { MODULE, TEMPLATES } from './const.js';
import { QuestParser } from './quest-parser.js';
import { copyToClipboard } from './helpers.js';

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
        Hooks.on("updateJournalEntryPage", async (page, changes, options, userId) => {
            if (this.element && this._isPageInSelectedJournal(page)) {
                await this._refreshData();
                this.render(this.element);
            }
        });
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
                            const category = entry.category && this.categories.includes(entry.category) ? entry.category : this.categories[0];
                            this.data[category].push(entry);
                            
                            // Add only the explicit tags from the entry
                            if (entry.tags && Array.isArray(entry.tags)) {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                            }
                        }
                    }
                } catch (error) {
                    console.error(`SQUIRE | Error processing quest page ${page.name}:`, error);
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
        // Use mousedown to detect different click types
        taskCheckboxes.on('mousedown', async (event) => {
            if (!game.user.isGM) return;
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

            if (event.button === 1) { // Middle-click: toggle hidden
                event.preventDefault();
                const emTag = li.querySelector('em');
                if (emTag) {
                    // Unwrap <em>
                    emTag.replaceWith(...emTag.childNodes);
                } else {
                    // Wrap all inner HTML in <em>, preserving <s> if present
                    if (li.querySelector('s')) {
                        // If already completed, wrap <s> in <em>
                        const sTag = li.querySelector('s');
                        sTag.innerHTML = `<em>${sTag.innerHTML}</em>`;
                    } else {
                        li.innerHTML = `<em>${li.innerHTML}</em>`;
                    }
                }
                const newTasksHtml = ul.innerHTML;
                const newContent = content.replace(tasksMatch[1], newTasksHtml);
                try {
                    await page.update({ text: { content: newContent } });
                } catch (error) {
                    console.error('SQUIRE | Error updating journal page (hidden toggle):', error);
                }
                return;
            }
            
            if (event.button === 2) { // Right-click: toggle failed state
                event.preventDefault();
                
                // Use the EXACT same pattern as left-click/middle-click
                const codeTag = li.querySelector('code');
                if (codeTag) {
                    // Task is already failed, revert to normal - unwrap code
                    li.innerHTML = codeTag.innerHTML;
                } else {
                    // Task is not failed, mark as failed - wrap in code
                    li.innerHTML = `<code>${li.innerHTML}</code>`;
                }
                
                const newTasksHtml = ul.innerHTML;
                let newContent = content.replace(tasksMatch[1], newTasksHtml);
                
                try {
                    await page.update({ text: { content: newContent } });
                } catch (error) {
                    console.error('SQUIRE | Error updating journal page (failed task toggle):', error);
                }
                return;
            }
            
            if (event.button === 0) { // Left-click: toggle completed (existing logic)
                const sTag = li.querySelector('s');
                if (sTag) {
                    li.innerHTML = sTag.innerHTML;
                } else {
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
                } catch (error) {
                    console.error('SQUIRE | Error updating journal page (completion toggle):', error);
                }
            }
        });
        
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
            // If making visible, set status to In Progress if not Complete/Failed
            if (visible) {
                let content = page.text.content;
                // Try to find <strong>Status:</strong> ... and update it
                const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
                let currentStatus = statusMatch ? statusMatch[1].trim() : '';
                if (currentStatus !== 'Complete' && currentStatus !== 'Failed') {
                    if (statusMatch) {
                        content = content.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1In Progress');
                    } else {
                        // If no status, add it at the end
                        content += `<p><strong>Status:</strong> In Progress</p>`;
                    }
                    await page.update({ text: { content } });
                }
            }
            // No manual refresh; let the updateJournalEntryPage hook handle it
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
        });

        // Import Quests from JSON (GM only)
        html.find('.import-quests-json').click(() => {
            if (!game.user.isGM) return;
            const template = `I want you to build a JSON template based on the criteria I will share below. Here are the rules for how you will add data to the JSON.

**NAME** - the name of the Quest. DO not add "the" or "a" to the name.
**CATEGORY** - This will either be "Main Quest" or "Side Quest"
**DESCRIPTION** - A description of the entry that would help someone understand what, where, or show this is and enough context to make it interesting. (under 600 characters)
**PLOTHOOK** - The relationship to the plot,  especially if they have something the party might need to know or understand. (under 300 characters) 
**LOCATION** - where the character is located (a city, area, or establishment). It is fine to add a locationan and area, but use a greater-than symbol between them e.g "Phlan > Thorne Island > Aquatic Crypt"
**TASK** - These represent the list of objectives that must be met to complete the quest. You can have several of these, but there has to be at least one. They are part of an array. 
**DURATION** - Optional. If the quest is time-bound, add the duration here. Valid durations include "number of days" or a qualifier like "Before bob dies."
**XP** - The amount of experience points the party gets for completing the task. Note it if is per person or overall.
**TREASURE** - List any specific item that the party might get upon comp-letion of the quest.
**TAGS** - a list of tags that would help filter this entry when looking it up. These will be used for filtering, so characteristics and idenitifying attributes like type, location, faction, etc. would be useful. The first tag should always be the category. There should never be tags for words like "the" and there should never be single-letter tags like "a". Add no more than 5 tags. It is okay to have spaces in the tag, but do not divide words with special character like underscores. You should always add th elocation as a tag, but the location should be specific. Something like "Phlan - Thorne Island - Aquatic Crypt" would actually be three tags. Also, be mindfule of when a specific tag might need to be a second, less specific tag. For instance, "black cult of the dragon" is a specific tag, but we shoudl add a second tag for "cult" which would be another useful tag. They should be formatted to be json-friendly and will be an array formatted like: "npc", "inn", "drinking game", "informant", "phlan". For most tags they should be lowercase, single-word tags unless the tag is the name of something like "black cult of the dragon". A tag would be something that would likely be applied to more than one entry. For example, "arena beast" is unnecessary... it should be "arena" and "beast". They should not be niche or overly specific phrases. Remember, these are used to group like things based on characteristics of the entry.

Replace the above items in their matching placeholder below. Be sure the text is JSON-friendly. Do not change any of the code, just replace the placeholders. This JSON  will be cut and pasted into an importer

[
    {
    "name": "**NAME**", 
    "img": null,
    "category": "**CATEGORY**", 
    "description": "**DESCRIPTION**", 
    "plotHook": "**PLOTHOOK**",   
    "location": "**LOCATION**",   
    "tasks": [  
        { "text": "**TASK**", "state": "active" }
    ],
    "reward": { 
        "xp": **XP** 
        "treasure": "**TREASURE**" 
    },
    "timeframe": { 
        "duration": "**DURATION**"
    },
    "status": "Not Started", 
    "tags": [ **TAGS** ],
    "visible": false  
    }
]

Here are the specific instructions I want you to use to build the above JSON array:

SPECIFIC INSTRUCTIONS HERE`;
            new Dialog({
                title: 'Import Quests from JSON',
                content: `
                    <button type="button" class="copy-template-button" style="margin-bottom:8px;">Copy a Blank, Pasteable JSON template to the clipboard</button>
                    <div style="margin-bottom: 8px;">Paste your quest JSON below. Each quest should be an object with at least a <code>name</code> field.</div>
                    <textarea id="import-quests-json-input" style="width:100%;height:500px;resize:vertical;"></textarea>
                `,
                buttons: {
                    import: {
                        icon: '<i class="fas fa-file-import"></i>',
                        label: 'Import',
                        callback: async (dlgHtml) => {
                            const input = dlgHtml.find('#import-quests-json-input').val();
                            let quests;
                            try {
                                quests = JSON.parse(input);
                                if (!Array.isArray(quests)) throw new Error('JSON must be an array of quest objects.');
                            } catch (e) {
                                ui.notifications.error('Invalid JSON: ' + e.message);
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
                            let imported = 0;
                            let updated = 0;
                            for (const quest of quests) {
                                if (!quest.name) continue;
                                
                                // Check if a quest with this name already exists
                                const existingPage = journal.pages.find(p => p.name === quest.name);
                                
                                if (existingPage) {
                                    // Update existing quest
                                    await existingPage.update({
                                        text: {
                                            content: this._generateJournalContentFromImport(quest)
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
                                    
                                    // Set original category flag if status is Complete or Failed
                                    if (quest.status === 'Complete' || quest.status === 'Failed') {
                                        // Only set if not already set and the quest has a category
                                        if (!await existingPage.getFlag(MODULE.ID, 'originalCategory') && quest.category) {
                                            await existingPage.setFlag(MODULE.ID, 'originalCategory', quest.category);
                                        }
                                    }
                                    
                                    updated++;
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
                            }
                            ui.notifications.info(`Quest import complete: ${imported} added, ${updated} updated.`);
                            this._refreshData();
                            this.render(this.element);
                        }
                    },
                    cancel: {
                        label: 'Cancel'
                    }
                },
                default: 'import',
                render: (html) => {
                    html.find('.copy-template-button').click(() => {
                        copyToClipboard(template);
                    });
                }
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
                        state: t.state || "active"
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
            
            // Create a download dialog with the JSON
            const exportData = JSON.stringify(exportQuests, null, 2);
            new Dialog({
                title: 'Export Quests to JSON',
                content: `
                    <div style="margin-bottom: 8px;">Here are your ${exportQuests.length} quests in JSON format. Copy this text to save it, or use the download button.</div>
                    <textarea id="export-quests-json-output" style="width:100%;height:500px;resize:vertical;">${exportData}</textarea>
                `,
                buttons: {
                    download: {
                        icon: '<i class="fas fa-download"></i>',
                        label: 'Download JSON',
                        callback: () => {
                            const blob = new Blob([exportData], { type: 'application/json' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `quests-export-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }
                    },
                    close: {
                        label: 'Close'
                    }
                },
                default: 'download'
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
            dropdown.toggle();
            // Close on click outside
            $(document).one('click.questStatusDropdown', () => dropdown.hide());
        });
        // Status option click
        html.find('.quest-status-option').click(async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const option = $(this);
            const newStatus = option.data('status');
            const uuid = option.closest('.quest-toolbar').find('.quest-status-menu').data('uuid');
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
                    console.log("SQUIRE | Added drop-target class");
                }
            });

            questEntries.on('dragleave.squire', function(event) {
                event.preventDefault();
                event.stopPropagation();
                $(this).removeClass('drop-target');
                console.log("SQUIRE | Removed drop-target class on dragleave");
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
                    console.log("SQUIRE | Quest Panel Raw drop data:", dataTransfer);
                    const data = JSON.parse(dataTransfer);
                    console.log("SQUIRE | Quest Panel Parsed drop data:", data);
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
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
                    console.error('SQUIRE | Error handling quest entry drop:', error);
                    ui.notifications.error('Failed to add participant or treasure.');
                }
            });
        }
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

        // Set view mode to quest so the tray does not intercept drops
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.viewMode = "quest";
        }

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
                search: this.filters.search || ""
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
                // Add additional properties needed for the template
                entry.category = category; // Ensure category is included in the entry
                entry.isPinned = entry.uuid === pinnedQuestUuid;
                
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
     * Generate journal content from imported quest object
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
            quest.tasks.forEach(t => content += `<li>${typeof t === 'string' ? t : t.text}</li>\n`);
            content += `</ul>\n\n`;
        }
        if (quest.reward) {
            if (quest.reward.xp) content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
            if (quest.reward.treasure) content += `<p><strong>Treasure:</strong> ${quest.reward.treasure}</p>\n\n`;
        }
        if (quest.timeframe && quest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${quest.timeframe.duration}</p>\n\n`;
        }
        if (quest.status) {
            content += `<p><strong>Status:</strong> ${quest.status}</p>\n\n`;
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
} 