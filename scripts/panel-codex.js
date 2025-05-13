import { MODULE, TEMPLATES } from './const.js';
import { CodexParser } from './codex-parser.js';

class CodexForm extends FormApplication {
    constructor(entry = null, options = {}) {
        super(entry, options);
        this.entry = entry || this._getDefaultEntry();
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'codex-form',
            title: 'Add Codex Entry',
            template: 'modules/coffee-pub-squire/templates/codex-form.hbs',
            width: 600,
            height: 'auto',
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        });
    }

    getData() {
        return {
            entry: this.entry,
            isGM: game.user.isGM
        };
    }

    _getDefaultEntry() {
        return {
            name: '',
            img: null,
            category: '',
            description: '',
            plotHook: '',
            location: '',
            link: null,
            tags: []
        };
    }

    async _updateObject(event, formData) {
        const entry = expandObject(formData);
        
        // Convert tags to array
        if (typeof entry.tags === 'string') {
            entry.tags = entry.tags.split(',').map(t => t.trim()).filter(t => t);
        }

        // Get the journal
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No codex journal selected. Please select a journal in the codex panel settings.');
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected codex journal not found.');
            return;
        }

        try {
            // Create the journal page
            const pageData = {
                name: entry.name,
                type: 'text',
                text: {
                    content: this._generateJournalContent(entry)
                }
            };

            // Create new page
            await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);

            // Show success notification
            ui.notifications.info(`Codex entry "${entry.name}" saved successfully.`);
            
            // Explicitly close the form
            this.close();
            
            // Refresh the codex panel if it exists
            if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance?.codexPanel) {
                await game.modules.get('coffee-pub-squire').api.PanelManager.instance.codexPanel._refreshData();
                game.modules.get('coffee-pub-squire').api.PanelManager.instance.codexPanel.render(game.modules.get('coffee-pub-squire').api.PanelManager.instance.codexPanel.element);
            }
            
            return true;
        } catch (error) {
            console.error("Error saving codex entry:", error);
            ui.notifications.error(`Failed to save codex entry: ${error.message}`);
            return false;
        }
    }

    _generateJournalContent(entry) {
        let content = "";
        
        if (entry.img) {
            content += `<img src="${entry.img}" alt="${entry.name}">\n\n`;
        }

        if (entry.category) {
            content += `<p><strong>Category:</strong> ${entry.category}</p>\n\n`;
        }

        if (entry.description) {
            content += `<p><strong>Description:</strong> ${entry.description}</p>\n\n`;
        }
        
        if (entry.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>\n\n`;
        }
        
        if (entry.location) {
            content += `<p><strong>Location:</strong> ${entry.location}</p>\n\n`;
        }

        if (entry.tags && entry.tags.length) {
            content += `<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>\n\n`;
        }

        return content;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Handle cancel button click
        html.find('button.cancel').on('click', () => {
            this.close();
        });
    }
}

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournal = null;
        this.categories = new Set();
        this.data = {};
        this.filters = {
            search: "",
            tags: [],
            category: "all"
        };
        this.allTags = new Set();
        this._setupHooks();
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

    /**
     * Check if a page belongs to the selected journal
     * @private
     */
    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Get the icon class for a given category
     * @param {string} category
     * @returns {string} FontAwesome icon class
     */
    getCategoryIcon(category) {
        const map = {
            'Artifacts': 'fa-gem',
            'Characters': 'fa-user',
            'Events': 'fa-calendar-star',
            'Factions': 'fa-shield-cross',
            'Items': 'fa-box',
            'Locations': 'fa-location-pin',
            'Maps': 'fa-map'
            // Add more mappings as needed
        };
        return map[category] || 'fa-book';
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.categories.clear();
        this.data = {};
        this.allTags.clear();

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
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
                        
                        const entry = await CodexParser.parseSinglePage(page, enriched);
                        if (entry && entry.category) {
                            // Use the category string exactly as provided (trimmed)
                            let normCategory = entry.category.trim();
                            // Add ownership info for visibility icon
                            entry.ownership = page.ownership;
                            // Add to categories set
                            this.categories.add(normCategory);
                            // Initialize category array if needed
                            if (!this.data[normCategory]) {
                                this.data[normCategory] = [];
                            }
                            // Add entry to category
                            this.data[normCategory].push(entry);
                            // Add tags
                            entry.tags.forEach(tag => this.allTags.add(tag));
                        }
                    }
                } catch (error) {
                    console.error("Error parsing codex entry:", error);
                }
            }
        }
        // Debug output
        console.log('SQUIRE | CODEX: categories', Array.from(this.categories));
        console.log('SQUIRE | CODEX: data', this.data);
    }

    /**
     * Set up event listeners
     * @private
     */
    _activateListeners(html) {
        // Search input - live DOM filtering
        const searchInput = html.find('.codex-search input');
        const clearButton = html.find('.clear-search');
        
        // --- DOM-based filtering for search and tags ---
        const filterEntries = () => {
            const search = this.filters.search.trim().toLowerCase();
            html.find('.codex-entry').each(function() {
                const entry = $(this);
                let text = entry.text().toLowerCase();
                let searchMatch = true;
                if (search) {
                    searchMatch = text.includes(search);
                }
                // Hide entries the user cannot see (non-GMs)
                if (!game.user.isGM) {
                    // Try to get ownership from data attribute, fallback to hiding if not present
                    const ownershipDefault = entry.data('ownershipDefault');
                    if (typeof ownershipDefault !== 'undefined' && ownershipDefault < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                        entry.hide();
                        return;
                    }
                }
                entry.toggle(searchMatch);
            });
            // Hide category sections with no visible entries
            html.find('.codex-section').each(function() {
                const section = $(this);
                const hasVisible = section.find('.codex-entry:visible').length > 0;
                section.toggle(hasVisible);
            });
        };

        searchInput.on('input', (event) => {
            const searchValue = event.target.value.toLowerCase();
            this.filters.search = searchValue;
            // Show all entries and sections before filtering
            html.find('.codex-entry').show();
            html.find('.codex-section').show();
            if (searchValue) {
                html.find('.clear-search').removeClass('disabled');
                // Always expand all categories during search
                html.find('.codex-section').removeClass('collapsed');
                filterEntries();
            } else {
                html.find('.clear-search').addClass('disabled');
                // When search is cleared, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        html.find(`.codex-section[data-category="${category}"]`).addClass('collapsed');
                    }
                }
                // Only filter by tags if any are selected
                if (this.filters.tags && this.filters.tags.length > 0) {
                    // Always expand all categories for tag filtering
                    html.find('.codex-section').removeClass('collapsed');
                    filterEntries();
                }
            }
        });

        // Clear search button
        clearButton.removeClass('disabled');
        clearButton.off('click').on('click', (event) => {
            this.filters.search = "";
            this.filters.tags = [];
            searchInput.val("");
            html.find('.codex-tag.selected').removeClass('selected');
            
            // Show all entries and sections
            html.find('.codex-entry').show();
            html.find('.codex-section').show();
            
            // Restore original collapsed states
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
            for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                if (collapsed) {
                    html.find(`.codex-section[data-category="${category}"]`).addClass('collapsed');
                }
            }
            
            this.render(this.element);
        });

        // Tag cloud tag selection
        html.find('.codex-tag-cloud .codex-tag').click((event) => {
            event.preventDefault();
            const tag = event.currentTarget.dataset.tag;
            const tagIndex = this.filters.tags.indexOf(tag);
            if (tagIndex === -1) {
                this.filters.tags.push(tag);
            } else {
                this.filters.tags.splice(tagIndex, 1);
            }
            
            // Show all entries and sections before filtering
            html.find('.codex-entry').show();
            html.find('.codex-section').show();
            
            // If we have tags selected, expand all categories
            if (this.filters.tags.length > 0) {
                html.find('.codex-section').removeClass('collapsed');
                // Temporarily clear the collapsed state in user flags while filtering
                game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', {});
            } else {
                // If no tags selected, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        html.find(`.codex-section[data-category="${category}"]`).addClass('collapsed');
                    }
                }
            }
            
            this.render(this.element);
        });

        // Toggle tag cloud
        html.find('.toggle-tags-button').click(() => {
            const isCollapsed = html.find('.codex-tag-cloud').hasClass('collapsed');
            game.user.setFlag(MODULE.ID, 'codexTagCloudCollapsed', !isCollapsed);
            this.render(this.element);
        });

        // Journal selection
        html.find('.codex-set-journal').click(() => {
            this._showJournalPicker();
        });

        // Open selected journal from titlebar
        html.find('.codex-open-journal').click(() => {
            if (this.selectedJournal) {
                this.selectedJournal.sheet.render(true);
            }
        });

        // Feather icon opens the current journal page (GM)
        html.find('.codex-entry-feather').click(async (event) => {
            event.preventDefault();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) doc.sheet.render(true);
            }
        });
        // Feather icon opens the current journal page (User)
        html.find('.codex-entry-feather-user').click(async (event) => {
            event.preventDefault();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const page = await fromUuid(uuid);
                if (page && page.parent) {
                    page.parent.sheet.render(true, { pageId: page.id });
                }
            }
        });
        // Link clicks
        html.find('.codex-entry-link').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const page = await fromUuid(uuid);
                if (page && page.parent) {
                    page.parent.sheet.render(true, { pageId: page.id });
                }
            }
        });

        // Delete entry button
        html.find('.codex-entry-delete').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const uuid = event.currentTarget.dataset.uuid;
            if (!uuid) return;
            
            // Confirm deletion
            const confirmed = await new Dialog({
                title: 'Delete Entry',
                content: 'Are you sure you want to delete this entry? This cannot be undone.',
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-trash"></i>',
                        label: 'Delete',
                        callback: async () => {
                            const page = await fromUuid(uuid);
                            if (page) {
                                await page.delete();
                                return true;
                            }
                            return false;
                        }
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel'
                    }
                },
                default: 'no'
            }).render(true);

            if (confirmed) {
                await this._refreshData();
                this.render(this.element);
            }
        });

        
        // Entry collapse/expand
        html.find('.codex-entry-toggle').click(function(e) {
            const card = $(this).closest('.codex-entry');
            card.toggleClass('collapsed');
            e.stopPropagation();
        });

        // Category collapse/expand
        html.find('.codex-category .fa-chevron-down').click(function(e) {
            const section = $(this).closest('.codex-section');
            section.toggleClass('collapsed');
            
            const category = section.data('category');
            const collapsed = section.hasClass('collapsed');
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
            collapsedCategories[category] = collapsed;
            game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', collapsedCategories);
            
            e.stopPropagation();
        });

        // Refresh button
        html.find('.refresh-codex-button').click(async () => {
            await this._refreshData();
            this.render(this.element);
        });

        // Add new codex entry button
        html.find('.add-codex-button').click(() => {
            if (!game.user.isGM) return;
            
            const journalId = game.settings.get(MODULE.ID, 'codexJournal');
            if (!journalId || journalId === 'none') {
                ui.notifications.warn("No codex journal selected. Click the gear icon to select one.");
                return;
            }
            
            const journal = game.journal.get(journalId);
            if (!journal) {
                ui.notifications.error("Could not find the codex journal.");
                return;
            }
            
            const codexForm = new CodexForm();
            codexForm.render(true);
        });

        // Import JSON button
        html.find('.import-json-button').click((event) => {
            event.preventDefault();
            const template = `I want you to build a JSON template based on the criteria I will share below. Here are the rules for how you will add data to the JSON.

**NAME** - The name of the entry. DO not add "the" or "a" to the name.
**CATEGORY** - This will be the organizing and grouping mechanism for the entry, so be smart about it as we do not want a bunch of similar categories. They should be unique and specific. For example: Character, Locations, and Items. Any non-unique classifications would be better as tags. It should be plural as there will be multiple things in the category. e.g. "Characters"
**DESCRIPTION** - A description of the entry that would help someone understand what, where, or show this is, and enough context to make it interesting. (make it 200 to 500 characters)
**PLOTHOOK** - The relationship to the plot,  especially if they have something the party might need (under 200 characters)
**LOCATION** - where the character is located (a city, area, or establishment). It is fine to add a location and area, but use a greater-than symbol between them, e.g, "Phlan > Thorne Island > Aquatic Crypt"
**TAGS** - a list of tags that would help filter this entry when looking it up. These will be used for filtering, so characteristics and identifying attributes like type, location, faction, etc., would be useful. There should never be tags for words like "the" and there should never be single-letter tags like "a". The first tag should always be the category. Add no more than 5 tags. Having spaces in the tag is okay, but do not divide words with special characters like underscores. You should always add the location as a tag, but the location should be specific. Something like "Phlan - Thorne Island - Aquatic Crypt" would be three tags. Also, be mindful of when a particular tag might need to be a second, less specific tag. For instance, "black cult of the dragon" is a particular tag, but we should add a second tag for "cult" which would be another proper tag. They should be formatted to be json-friendly and will be an array formatted like: "npc", "inn", "drinking game", "informant", "phlan".

Replace the above items in their matching placeholder below. Be sure the text is JSON-friendly. Do not change any of the code, replace the placeholders. This JSON  will be cut and pasted into an importer. Here is the template to use to build the JSON. It is an array, so be sure the JSON is valid, creates proper arrays, and has no linter errors:

[
  {
    "name": "**NAME**",
    "img": null,
    "category": "**CATEGORY**",
    "description": "**DESCRIPTION**",
    "plotHook": "**PLOTHOOK**",
    "location": "**LOCATION**",
    "link": null,
    "tags": [ **TAGS** ]
  }
]

Here are the specific instructions I want you to use to build the above JSON array:

SPECIFIC INSTRUCTIONS HERE`;
            new Dialog({
                title: 'Paste JSON',
                content: `
                    <button type="button" class="copy-template-button" style="margin-bottom:8px;">Copy a Blank Pasteable JSON Template to the Clipboard</button>
                    <textarea id="codex-import-json" style="width:100%;height:500px;resize:vertical;"></textarea>
                `,
                buttons: {
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel'
                    },
                    import: {
                        icon: '<i class="fas fa-theater-masks"></i>',
                        label: 'Import JSON',
                        callback: async (html) => {
                            ui.notifications.info('Importing Codex entries. This may take some time as entries are added, updated, indexed, and sorted. You will be notified when the process is complete.');
                            const value = html.find('#codex-import-json').val();
                            try {
                                const data = JSON.parse(value);
                                if (!Array.isArray(data)) {
                                    ui.notifications.error('Imported JSON must be an array of entries.');
                                    return;
                                }
                                if (!this.selectedJournal) {
                                    ui.notifications.error('No Codex journal selected.');
                                    return;
                                }
                                let added = 0;
                                let updated = 0;
                                for (const entry of data) {
                                    // Find existing page by name
                                    const page = this.selectedJournal.pages.find(p => p.name === entry.name);
                                    if (page) {
                                        // Update only description, tags, location, category, plotHook
                                        let parser = new DOMParser();
                                        let doc = parser.parseFromString(page.text.content, 'text/html');
                                        // Remove all <p> with <strong> labels for fields we update
                                        const pTags = Array.from(doc.querySelectorAll('p'));
                                        for (const p of pTags) {
                                            const strong = p.querySelector('strong');
                                            if (!strong) continue;
                                            const label = strong.textContent.trim().replace(/:$/, '').toUpperCase();
                                            if (["CATEGORY","DESCRIPTION","PLOT HOOK","LOCATION","TAGS"].includes(label)) {
                                                p.remove();
                                            }
                                        }
                                        // Insert new/updated fields at the top
                                        const newFields = [];
                                        if (entry.category) newFields.push(`<p><strong>Category:</strong> ${entry.category}</p>`);
                                        if (entry.description) newFields.push(`<p><strong>Description:</strong> ${entry.description}</p>`);
                                        if (entry.plotHook) newFields.push(`<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>`);
                                        if (entry.location) newFields.push(`<p><strong>Location:</strong> ${entry.location}</p>`);
                                        if (entry.tags && entry.tags.length) newFields.push(`<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>`);
                                        doc.body.innerHTML = newFields.join('\n') + doc.body.innerHTML;
                                        await page.update({ 'text.content': doc.body.innerHTML });
                                        updated++;
                                    } else {
                                        // Create new page with all fields, formatted as expected
                                        let html = '';
                                        if (entry.img) html += `<img src="${entry.img}" alt="${entry.name}">`;
                                        if (entry.category) html += `<p><strong>Category:</strong> ${entry.category}</p>`;
                                        if (entry.description) html += `<p><strong>Description:</strong> ${entry.description}</p>`;
                                        if (entry.plotHook) html += `<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>`;
                                        if (entry.location) html += `<p><strong>Location:</strong> ${entry.location}</p>`;
                                        if (entry.link && entry.link.uuid && entry.link.label) html += `<p><strong>Link:</strong> @UUID[${entry.link.uuid}]{${entry.link.label}}</p>`;
                                        if (entry.tags && entry.tags.length) html += `<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>`;
                                        await this.selectedJournal.createEmbeddedDocuments('JournalEntryPage', [{
                                            name: entry.name,
                                            type: 'text',
                                            text: { content: html },
                                            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
                                        }]);
                                        added++;
                                    }
                                }
                                // Sort pages alphabetically by name
                                const sorted = this.selectedJournal.pages.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
                                for (let i = 0; i < sorted.length; i++) {
                                    await sorted[i].update({ sort: (i + 1) * 10 });
                                }
                                ui.notifications.info(`Codex import complete: ${added} added, ${updated} updated.`);
                                await this._refreshData();
                                this.render(this.element);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON.');
                            }
                        }
                    }
                },
                default: 'import',
                render: (html) => {
                    html.find('.copy-template-button').click(() => {
                        navigator.clipboard.writeText(template).then(() => {
                            ui.notifications.info('Template copied to clipboard!');
                        });
                    });
                }
            }).render(true);
        });

        // Export JSON button
        html.find('.export-json-button').click((event) => {
            event.preventDefault();
            // Collect all entries as a flat array (single journal format)
            const exportData = [];
            for (const cat of this.categories) {
                const entries = (this.data[cat] || []).map(entry => {
                    const newEntry = { ...entry };
                    if (newEntry.img && typeof newEntry.img === 'string') {
                        // Remove site origin from img path if present
                        const origin = window.location.origin + '/';
                        if (newEntry.img.startsWith(origin)) {
                            newEntry.img = newEntry.img.slice(origin.length);
                        }
                    }
                    return newEntry;
                });
                exportData.push(...entries);
            }
            const jsonString = JSON.stringify(exportData, null, 2);
            new Dialog({
                title: 'Export Codex as JSON',
                content: `
                    <div style="margin-bottom: 8px;">Here are your codex entries in JSON format. Copy this text to save it, or use the download button.</div>
                    <textarea id="codex-export-json" style="width:100%;height:500px;resize:vertical;">${jsonString}</textarea>
                `,
                buttons: {
                    download: {
                        icon: '<i class="fas fa-download"></i>',
                        label: 'Download JSON',
                        callback: () => {
                            const blob = new Blob([jsonString], { type: 'application/json' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `codex-export-${new Date().toISOString().split('T')[0]}.json`;
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

        // Toggle visibility (ownership) icon
        html.find('.codex-entry-visibility').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const uuid = event.currentTarget.dataset.uuid;
            if (!uuid) return;
            const page = await fromUuid(uuid);
            if (!page) return;
            const current = page.ownership?.default ?? 0;
            const newPermission = current >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
                : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
            await page.update({ 'ownership.default': newPermission });
            // No need to refresh/render here; the updateJournalEntryPage hook will handle it.
        });

        // On load, ensure all entries are visible if no filters are set
        setTimeout(() => {
            if (!this.filters.search && (!this.filters.tags || this.filters.tags.length === 0)) {
                html.find('.codex-entry').show();
                html.find('.codex-section').show();
            } else {
                filterEntries();
            }
        }, 0);
    }

    /**
     * Show journal picker dialog
     * @private
     */
    async _showJournalPicker() {
        const journals = game.journal.contents;
        const choices = {
            'none': '- Select Journal -'
        };
        journals.forEach(j => {
            choices[j.id] = j.name;
        });

        new Dialog({
            title: 'Select Codex Journal',
            content: `
                <form>
                    <div class="form-group">
                        <label>Journal:</label>
                        <select name="journal">
                            ${Object.entries(choices).map(([id, name]) => 
                                `<option value="${id}" ${id === game.settings.get(MODULE.ID, 'codexJournal') ? 'selected' : ''}>${name}</option>`
                            ).join('')}
                        </select>
                    </div>
                </form>
            `,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: 'Save',
                    callback: async (html) => {
                        const journalId = html.find('select[name="journal"]').val();
                        await game.settings.set(MODULE.ID, 'codexJournal', journalId);
                        await this._refreshData();
                        this.render(this.element);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: 'Cancel'
                }
            },
            default: 'save'
        }).render(true);
    }

    /**
     * Render the codex panel
     * @param {jQuery} element - The element to render into
     */
    async render(element) {
        if (!element) return;
        this.element = element;

        const codexContainer = element.find('[data-panel="panel-codex"]');
        if (!codexContainer.length) return;

        // Refresh data if needed
        await this._refreshData();

        // Get collapsed states
        const collapsedCategories = this.filters.tags.length > 0 ? {} : (game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {});
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Build categoriesData array for the template
        const categoriesData = Array.from(this.categories).sort().map(category => {
            let entries = this.data[category] || [];
            if (!game.user.isGM) {
                // Only show visible entries for non-GMs
                entries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            }
            if (this.filters.tags && this.filters.tags.length > 0) {
                entries = entries.filter(entry => entry.tags.some(tag => this.filters.tags.includes(tag)));
            }
            // Sort entries alphabetically by name
            entries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
            const totalCount = entries.length;
            const visibleEntries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const visibleCount = visibleEntries.length;
            return {
                name: category,
                icon: this.getCategoryIcon(category),
                entries,
                collapsed: collapsedCategories[category] || false,
                totalCount,
                visibleCount,
                visibleEntries
            };
        });

        // Build allTags for tag cloud
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all entries
            const allEntries = categoriesData.flatMap(cat => cat.entries);
            allTags = new Set();
            allEntries.forEach(entry => entry.tags.forEach(tag => allTags.add(tag)));
        } else {
            // Players see tags only from visible entries
            const allVisibleEntries = categoriesData.flatMap(cat => cat.visibleEntries);
            allTags = new Set();
            allVisibleEntries.forEach(entry => entry.tags.forEach(tag => allTags.add(tag)));
        }

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categoriesData,
            filters: {
                ...this.filters,
                search: this.filters.search || ""
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed
        };

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX, safeTemplateData);
        codexContainer.html(html);

        // Activate listeners
        this._activateListeners(codexContainer);

        // Restore collapsed states
        for (const [category, collapsed] of Object.entries(collapsedCategories)) {
            if (collapsed) {
                codexContainer.find(`.codex-section[data-category="${category}"]`).addClass('collapsed');
            }
        }
    }
} 
