import { MODULE, TEMPLATES } from './const.js';
import { CodexParser } from './codex-parser.js';

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
            'Characters': 'fa-user',
            'Locations': 'fa-map',
            'Artifact': 'fa-gem',
            'Artifacts': 'fa-gem',
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
            }
        });

        // Clear search button
        clearButton.removeClass('disabled');
        clearButton.off('click').on('click', (event) => {
            this.filters.search = "";
            this.filters.tags = [];
            searchInput.val("");
            html.find('.codex-tag.selected').removeClass('selected');
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

        // Link clicks
        html.find('.codex-entry-link').click(async (event) => {
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) {
                    doc.sheet.render(true);
                }
            }
        });

        // Feather icon opens the current journal page
        html.find('.codex-entry-feather').click(async (event) => {
            event.preventDefault();
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                const doc = await fromUuid(uuid);
                if (doc) doc.sheet.render(true);
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
            e.stopPropagation();
        });

        // Refresh button
        html.find('.refresh-codex-button').click(async () => {
            await this._refreshData();
            this.render(this.element);
        });

        // Import JSON button
        html.find('.import-json-button').click((event) => {
            event.preventDefault();
            new Dialog({
                title: 'Paste JSON',
                content: `
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
                default: 'import'
            }).render(true);
        });

        // Export JSON button
        html.find('.export-json-button').click((event) => {
            event.preventDefault();
            // Collect all entries as a flat array (single journal format)
            const exportData = [];
            for (const cat of this.categories) {
                exportData.push(...(this.data[cat] || []));
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
        const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Build categoriesData array for the template
        const categoriesData = Array.from(this.categories).sort().map(category => {
            let entries = this.data[category] || [];
            if (this.filters.tags && this.filters.tags.length > 0) {
                entries = entries.filter(entry => entry.tags.some(tag => this.filters.tags.includes(tag)));
            }
            return {
                name: category,
                icon: this.getCategoryIcon(category),
                entries
            };
        });

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
            allTags: Array.from(this.allTags).sort(),
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