import { MODULE, TEMPLATES } from './const.js';
import { QuestParser } from './quest-parser.js';

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
                            // Add regular tags
                            entry.tags.forEach(tag => this.allTags.add(tag));
                            // Add status as a special tag
                            if (entry.status) {
                                this.allTags.add(entry.status);
                            }
                            // Add participant names as tags
                            if (Array.isArray(entry.participants)) {
                                entry.participants.forEach(p => {
                                    if (typeof p === 'string') {
                                        this.allTags.add(p);
                                    } else if (p && typeof p.name === 'string') {
                                        this.allTags.add(p.name);
                                    }
                                });
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
                    const criteria = entry.find('.quest-entry-criteria').text().toLowerCase();
                    
                    const matches = name.includes(searchValue) || 
                        description.includes(searchValue) || 
                        criteria.includes(searchValue);
                    
                    entry.toggle(matches);
                });
                
                // Hide empty sections
                html.find('.quest-section').each((i, el) => {
                    const section = $(el);
                    const hasVisibleEntries = section.find('.quest-entry:visible').length > 0;
                    section.toggle(hasVisibleEntries);
                });
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

        // Tag cloud tag selection
        html.find('.quest-tag-cloud .quest-tag').click((event) => {
            event.preventDefault();
            const tag = event.currentTarget.dataset.tag;
            // Toggle tag selection
            const tagIndex = this.filters.tags.indexOf(tag);
            if (tagIndex === -1) {
                this.filters.tags.push(tag);
            } else {
                this.filters.tags.splice(tagIndex, 1);
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
            
            const category = section.find('h3').text();
            const collapsed = section.hasClass('collapsed');
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
            collapsedCategories[category] = collapsed;
            game.user.setFlag(MODULE.ID, 'questCollapsedCategories', collapsedCategories);
        });

        // Journal selection
        html.find('.set-quest-button').click(() => {
            this._showJournalPicker();
        });

        // Link clicks
        html.find('.quest-entry-link').click(async (event) => {
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
        // Use mousedown to detect right-click for hidden toggle
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

            if (event.button === 2) { // Right-click: toggle hidden
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
                        
                        // Move to Completed category
                        if (categoryMatch && currentCategory !== 'Completed') {
                            newContent = newContent.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, '$1Completed');
                        }
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
            new Dialog({
                title: 'Import Quests from JSON',
                content: `
                    <div style="margin-bottom: 8px;">Paste your quest JSON below. Each quest should be an object with at least a <code>name</code> field.</div>
                    <textarea id="import-quests-json-input" style="width:100%;height:200px;"></textarea>
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
                default: 'import'
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
                    <textarea id="export-quests-json-output" style="width:100%;height:200px;">${exportData}</textarea>
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
                // Store original category if not already stored and move to Completed
                if (currentCategory !== 'Completed') {
                    if (!originalCategory && currentCategory) {
                        await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
                    }
                    if (categoryMatch) {
                        content = content.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1Completed`);
                    }
                }
            } else if (newStatus === 'Failed') {
                // Store original category if not already stored and move to Failed
                if (currentCategory !== 'Failed') {
                    if (!originalCategory && currentCategory) {
                        await page.setFlag(MODULE.ID, 'originalCategory', currentCategory);
                    }
                    if (categoryMatch) {
                        content = content.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1Failed`);
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
            allTags: Array.from(this.allTags).sort(),
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

        // Restore collapsed states
        if (collapsedCategories["In Progress"]) {
            questContainer.find(`.quest-section[data-status="In Progress"]`).addClass('collapsed');
        }
        if (collapsedCategories["Not Started"]) {
            questContainer.find(`.quest-section[data-status="Not Started"]`).addClass('collapsed');
        }
        if (collapsedCategories["Complete"]) {
            questContainer.find(`.quest-section[data-status="Complete"]`).addClass('collapsed');
        }
        if (collapsedCategories["Failed"]) {
            questContainer.find(`.quest-section[data-status="Failed"]`).addClass('collapsed');
        }

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