import { MODULE, TEMPLATES } from './const.js';
import { CodexParser } from './codex-parser.js';

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournals = {
            Characters: null,
            Locations: null,
            Artifacts: null
        };
        this.categories = ["Characters", "Locations", "Artifacts"];
        this.data = {
            Characters: [],
            Locations: [],
            Artifacts: []
        };
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
            if (this.element && this._isPageInSelectedJournals(page)) {
                await this._refreshData();
                this.render(this.element);
            }
        });
    }

    _isPageInSelectedJournals(page) {
        return Object.values(this.selectedJournals).some(journal => journal && journal.id === page.parent.id);
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Always clear data and tags before repopulating
        this.data = {
            Characters: [],
            Locations: [],
            Artifacts: []
        };
        this.allTags = new Set();

        for (const category of this.categories) {
            const journalId = game.settings.get(MODULE.ID, `codexJournal_${category}`);
            const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
            this.selectedJournals[category] = journal;
            if (journal) {
                for (const page of journal.pages.contents) {
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
                            // Each page is a single entry
                            const entry = await CodexParser.parseSinglePage(page, enriched);
                            if (entry) {
                                this.data[category].push(entry);
                            entry.tags.forEach(tag => this.allTags.add(tag));
                            }
                        }
                    } catch (error) {
                        console.error(`SQUIRE | Error processing page ${page.name} in ${category}:`, error);
                        ui.notifications.error(`Error loading ${category} entry: ${page.name}. See console for details.`);
                    }
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
        const filteredEntries = sortedEntries.filter(entry => game.user.isGM || entry.identified);
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
        const searchInput = html.find('.codex-search input');
        const clearButton = html.find('.clear-search');
        
        searchInput.on('input', (event) => {
            const searchValue = event.target.value.toLowerCase();
            this.filters.search = searchValue;
            
            // Show all entries first (in case we're making the search less restrictive)
            // For non-GMs, only show entries that are already visible (identified)
            if (game.user.isGM) {
                html.find('.codex-entry').show();
            } else {
                html.find('.codex-entry:not(.unidentified)').show();
            }
            html.find('.codex-section').show();
            
            if (searchValue) {
                // Then filter entries
                const entriesToSearch = game.user.isGM ? 
                    html.find('.codex-entry') : 
                    html.find('.codex-entry:not(.unidentified)');

                entriesToSearch.each((i, el) => {
                    const entry = $(el);
                    const name = entry.find('.codex-entry-name').text().toLowerCase();
                    const description = entry.find('.codex-entry-description').text().toLowerCase();
                    const plotHook = entry.find('.codex-entry-hook').text().toLowerCase();
                    
                    const matches = name.includes(searchValue) || 
                        description.includes(searchValue) || 
                        plotHook.includes(searchValue);
                    
                    entry.toggle(matches);
                });
                
                // Hide empty sections
                html.find('.codex-section').each((i, el) => {
                    const section = $(el);
                    const hasVisibleEntries = section.find('.codex-entry:visible').length > 0;
                    section.toggle(hasVisibleEntries);
                });
            }
        });

        // Refresh button
        html.find('.refresh-codex-button').click(async () => {
            if (this.selectedJournals) {
                await this._refreshData();
                this.render(this.element);
                ui.notifications.info("Codex refreshed.");
            }
        });

        // Tag cloud tag selection
        html.find('.codex-tag-cloud .codex-tag').click((event) => {
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

        // Tag filter
        html.find('.codex-tag-filter select').on('change', (event) => {
            const select = event.currentTarget;
            this.filters.tags = Array.from(select.selectedOptions).map(option => option.value);
            this.render(this.element);
        });

        // Clear search button (always enabled)
        clearButton.removeClass('disabled');
        clearButton.off('click').on('click', (event) => {
                this.filters.search = "";
                this.filters.tags = [];
                searchInput.val("");
                // Also update tag filter UI if present
                const tagSelect = html.find('.codex-tag-filter select')[0];
                if (tagSelect) {
                    Array.from(tagSelect.options).forEach(opt => opt.selected = false);
                    $(tagSelect).trigger('change');
                }
                // Also remove selected class from tag cloud
                html.find('.codex-tag.selected').removeClass('selected');
            this.render(this.element);
        });

        // Toggle tags button
        html.find('.toggle-tags-button').click((event) => {
            const button = $(event.currentTarget);
            const tagCloud = html.find('.codex-tag-cloud');
            const isCollapsed = tagCloud.hasClass('collapsed');
            
            // Toggle collapsed state
            tagCloud.toggleClass('collapsed');
            button.toggleClass('active');
            
            // Save state to user flags
            game.user.setFlag(MODULE.ID, 'codexTagCloudCollapsed', !isCollapsed);
        });

        // Category collapse/expand
        html.find('.codex-category').click((event) => {
            const section = $(event.currentTarget).closest('.codex-section');
            section.toggleClass('collapsed');
            
            // Save collapsed state
            const category = section.find('h3').text();
            const collapsed = section.hasClass('collapsed');
            const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
            collapsedCategories[category] = collapsed;
            game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', collapsedCategories);
        });

        // Tag clicks in entries
        html.find('.codex-tag').click((event) => {
            event.preventDefault();
            const tag = event.currentTarget.dataset.tag;
            const select = html.find('.codex-tag-filter select')[0];
            if (!select) {
                console.warn("No tag filter select found in DOM for tag click.");
                return;
            }
            // Find the option
            const option = Array.from(select.options).find(opt => opt.value === tag);
            if (option) {
                option.selected = !option.selected;
                $(select).trigger('change');
            }
        });

        // Tag click in entry: clear search and filters, filter by clicked tag
        html.off('click.codexEntryTag');
        html.on('click.codexEntryTag', '.codex-entry-tags .codex-tag', (event) => {
            event.preventDefault();
            const tag = event.currentTarget.dataset.tag;
            this.filters.search = "";
            this.filters.tags = [tag];
            searchInput.val("");
            this.render(this.element);
        });

        // Journal selection
        html.find('.set-codex-button, .set-codex-button-large').click(() => {
            this._showJournalPicker();
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

        // Remove any existing handlers first
        html.off('click.codexIdentified');
        
        // Identified state toggle - with namespaced event
        html.on('click.codexIdentified', '.codex-toolbar .identified, .codex-toolbar .unidentified', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Prevent multiple rapid clicks
            const target = $(event.currentTarget);
            if (target.data('processing')) return;
            target.data('processing', true);
            
            console.log("SQUIRE | Eye icon clicked", {
                target: event.currentTarget,
                isGM: game.user.isGM,
                hasJournal: !!this.selectedJournals,
                eventType: event.type,
                eventPhase: event.eventPhase,
                bubbles: event.bubbles,
                cancelable: event.cancelable
            });
            
            try {
                if (!game.user.isGM) {
                    console.log("SQUIRE | Not a GM, ignoring click");
                    return;
                }
                
                const entryElement = $(event.currentTarget).closest('.codex-entry');
                const entryName = entryElement.find('.codex-entry-name').text();
                const category = entryElement.closest('.codex-section').find('h3').text().trim();
                
                console.log("SQUIRE | Entry details", {
                    entryName,
                    category,
                    hasSelectedJournal: !!this.selectedJournals,
                    journalPages: this.selectedJournals[category]?.pages.size,
                    entryElementFound: !!entryElement.length,
                    entryNameFound: !!entryName,
                    categoryFound: !!category
                });
                
                // Find the journal page for this category
                const page = this.selectedJournals[category].pages.find(p => p.name === category);
                if (!page) {
                    console.log("SQUIRE | No page found for category:", category);
                    return;
                }
                
                // Get current content
                let content = '';
                if (typeof page.text?.content === 'string') {
                    content = page.text.content;
                } else if (typeof page.text === 'string') {
                    content = page.text;
                } else if (page.text?.content) {
                    content = await page.text.content;
                }
                
                console.log("SQUIRE | Got page content", {
                    hasContent: !!content,
                    contentLength: content?.length,
                    contentType: typeof content
                });
                
                if (!content) {
                    console.log("SQUIRE | No content found in page");
                    return;
                }
                
                // Create a temporary div to parse the HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(content, 'text/html');
                
                // Find the entry's h1 element
                const entryH1 = Array.from(doc.getElementsByTagName('h1')).find(h1 => 
                    h1.textContent.trim() === entryName
                );
                
                console.log("SQUIRE | Found entry H1", {
                    found: !!entryH1,
                    entryName,
                    allH1s: Array.from(doc.getElementsByTagName('h1')).map(h => h.textContent.trim()),
                    h1Count: doc.getElementsByTagName('h1').length
                });
                
                if (!entryH1) return;
                
                // Find the ul element after this h1
                let currentElement = entryH1.nextElementSibling;
                while (currentElement && currentElement.tagName !== 'UL') {
                    currentElement = currentElement.nextElementSibling;
                }
                
                console.log("SQUIRE | Found UL element", {
                    found: !!currentElement,
                    elementType: currentElement?.tagName,
                    nextElements: Array.from(entryH1.parentNode.children)
                        .slice(Array.from(entryH1.parentNode.children).indexOf(entryH1) + 1, 5)
                        .map(el => el.tagName)
                });
                
                if (!currentElement) return;
                
                // Find the Identified list item
                const identifiedLi = Array.from(currentElement.getElementsByTagName('li')).find(li => 
                    li.textContent.trim().toLowerCase().startsWith('identified:')
                );
                
                console.log("SQUIRE | Found Identified LI", {
                    found: !!identifiedLi,
                    currentText: identifiedLi?.textContent.trim(),
                    allLis: Array.from(currentElement.getElementsByTagName('li')).map(li => li.textContent.trim())
                });
                
                if (!identifiedLi) return;
                
                // Toggle the identified state
                const currentState = identifiedLi.textContent.trim().toLowerCase().endsWith('true');
                identifiedLi.innerHTML = `<strong>Identified:</strong> ${!currentState}`;
                
                console.log("SQUIRE | Updating page with new content", {
                    newState: !currentState,
                    contentLength: doc.body.innerHTML.length,
                    newContent: doc.body.innerHTML.substring(0, 100) + "..."
                });
                
                // Update the journal page
                await page.update({ text: { content: doc.body.innerHTML } });
                
                // Update the UI immediately without a full refresh
                const icon = $(event.currentTarget);
                if (currentState) {
                    icon.removeClass('fa-eye').addClass('fa-eye-slash');
                    entryElement.addClass('unidentified');
                } else {
                    icon.removeClass('fa-eye-slash').addClass('fa-eye');
                    entryElement.removeClass('unidentified');
                }
                
                // Refresh the data in the background
                await this._refreshData();
                
                // Show notification
                ui.notifications.info(`Entry "${entryName}" is now ${!currentState ? 'identified' : 'unidentified'}.`);
                
            } catch (error) {
                console.error("SQUIRE | Error toggling identified state:", error);
                ui.notifications.error("Failed to update identified state. See console for details.");
            } finally {
                // Clear the processing flag
                target.removeData('processing');
            }
        });

        // Toggle identified state
        html.find('.toggle-identified').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            console.log("SQUIRE | Toggle identified clicked", {
                target: event.currentTarget,
                uuid: $(event.currentTarget).data('uuid'),
                isGM: game.user.isGM
            });
            
            const icon = $(event.currentTarget);
            const uuid = icon.data('uuid');
            
            if (!uuid) {
                console.error("SQUIRE | No UUID found on clicked element");
                return;
            }
            
            const page = await fromUuid(uuid);
            
            if (!page) {
                console.error("SQUIRE | Could not find page for UUID:", uuid);
                return;
            }
            
            console.log("SQUIRE | Found page:", {
                name: page.name,
                currentPermission: page.ownership.default
            });
            
            // Toggle between NONE and OBSERVER permissions
            const newPermission = page.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER 
                ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE 
                : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                
            console.log("SQUIRE | Updating permission to:", newPermission);
            
            await page.update({ "ownership.default": newPermission });
            // Do not call _refreshData or render here; let the Foundry updateJournalEntryPage hook handle the refresh.
        });

        // --- Codex Card Collapse/Expand ---
        // Always start collapsed
        html.find('.codex-entry').addClass('collapsed');
        // Unbind previous handlers before binding new ones
        html.off('click.codexEntryToggle');
        html.off('click.codexEntryHeader');
        // Toggle collapse on chevron click
        html.on('click.codexEntryToggle', '.codex-entry-toggle', function(e) {
            const card = $(this).closest('.codex-entry');
            card.toggleClass('collapsed');
            e.stopPropagation();
        });
        // Toggle collapse on header click (but not controls)
        html.on('click.codexEntryHeader', '.codex-entry-header', function(e) {
            if ($(e.target).closest('.codex-toolbar').length) return;
            const card = $(this).closest('.codex-entry');
            card.toggleClass('collapsed');
        });

        // Add gear icon handler for each category
        html.find('.codex-set-journal').off('click').on('click', (event) => {
            const category = event.currentTarget.dataset.category;
            this._showJournalPicker(category);
        });

        // Import JSON button opens a dialog
        html.find('.import-json-button').click((event) => {
            event.preventDefault();
            new Dialog({
                title: 'Paste JSON',
                content: `
                    <textarea id="codex-import-json" style="width:100%;height:300px;resize:vertical;"></textarea>
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
                                await this.importCodexJson(data);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON.');
                            }
                        }
                    }
                },
                default: 'import'
            }).render(true);
        });
    }

    /**
     * Show journal picker dialog
     * @private
     */
    _showJournalPicker(category) {
        const journals = game.journal.contents.map(j => ({
            id: j.id,
            name: j.name,
            img: j.thumbnail || j.img || 'icons/svg/book.svg',
            pages: j.pages.size
        }));
        journals.sort((a, b) => a.name.localeCompare(b.name));
        const content = `
        <h2 style="text-align: center; margin-bottom: 15px;">Select a Journal for ${category}</h2>
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
            <p style="margin-bottom: 5px; color: #ddd;"><i class="fas fa-info-circle" style="color: #88f;"></i> Each entry in this journal will be treated as a separate codex entry.</p>
        </div>
        <div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button>
        </div>
        `;
        const dialog = new Dialog({
            title: `Select Journal for ${category}`,
            content: content,
            buttons: {},
            render: html => {
                html.find('.journal-item').click(async event => {
                    const journalId = event.currentTarget.dataset.id;
                    await game.settings.set(MODULE.ID, `codexJournal_${category}`, journalId);
                    ui.notifications.info(`Journal for ${category} ${journalId === 'none' ? 'cleared' : 'selected'}.`);
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
     * Render the codex panel
     * @param {jQuery} element - The element to render into
     */
    async render(element) {
        console.log("SQUIRE | Codex Panel render called", { element });
        if (!element) return;
        this.element = element;

        const codexContainer = element.find('[data-panel="panel-codex"]');
        console.log("SQUIRE | Looking for codex container", { 
            found: codexContainer.length > 0,
            selector: '[data-panel="panel-codex"]',
            allPanels: element.find('[data-panel]').map((i, el) => el.getAttribute('data-panel')).get()
        });

        if (!codexContainer.length) {
            console.log("SQUIRE | Codex container not found");
            return;
        }

        // Refresh data if needed
        if (this.selectedJournals) {
            await this._refreshData();
        }

        // Get collapsed states
        const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: {},
            journalName: {},
            isGM: game.user.isGM,
            categories: this.categories,
            data: {},
            filters: {
                ...this.filters,
                search: this.filters.search || ""
            },
            allTags: Array.from(this.allTags).sort(),
            isTagCloudCollapsed
        };

        // Apply filters to each category
        for (const category of this.categories) {
            const journal = this.selectedJournals[category];
            templateData.hasJournal[category] = !!journal;
            templateData.journalName[category] = journal ? journal.name : "";
            templateData.data[category] = this._applyFilters(this.data[category] || []);
        }
        // Debug output for context
        console.log('SQUIRE | CODEX DEBUG: categories:', this.categories);
        console.log('SQUIRE | CODEX DEBUG: templateData.journalName:', templateData.journalName);
        console.log('SQUIRE | CODEX DEBUG: journalName keys:', Object.keys(templateData.journalName));
        console.log('SQUIRE | CODEX this.data before render:', JSON.parse(JSON.stringify(this.data)));
        console.log('SQUIRE | CODEX FINAL templateData passed to renderTemplate:', templateData);

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        console.log('SQUIRE | CODEX FINAL safeTemplateData passed to renderTemplate:', safeTemplateData);
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

        // After rendering, set initial states
        if (this.filters.search) {
            codexContainer.find('.clear-search').show();
        }
        
        // Set initial filter button state
        if (!isTagCloudCollapsed) {
            codexContainer.find('.toggle-tags-button').addClass('active');
        }
    }

    async _onToggleIdentified(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const entry = event.currentTarget.closest('.codex-entry');
        const uuid = entry.dataset.uuid;
        const page = await fromUuid(uuid);
        
        if (!page) return;
        
        // Toggle between NONE and OBSERVER permissions
        const newPermission = page.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER 
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE 
            : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
            
        await page.update({ "ownership.default": newPermission });
        
        // Refresh the codex to show updated state
        await this.refreshCodex();
    }

    /**
     * Import codex entries from JSON and add them as pages to the correct journals
     * @param {Object} data - Parsed JSON object
     */
    async importCodexJson(data) {
        const categories = ["Characters", "Locations", "Artifacts"];
        let added = 0;
        let updated = 0;
        for (const category of categories) {
            const entries = data[category];
            if (!Array.isArray(entries) || !entries.length) continue;
            const journalId = game.settings.get(MODULE.ID, `codexJournal_${category}`);
            const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
            if (!journal) {
                ui.notifications.warn(`No journal set for ${category}. Skipping import for this category.`);
                continue;
            }
            for (const entry of entries) {
                // Try to find an existing page by name
                const existingPage = journal.pages.find(p => p.name === entry.name);
                if (existingPage) {
                    // Parse the existing HTML content
                    let parser = new DOMParser();
                    let doc = parser.parseFromString(existingPage.text.content, 'text/html');
                    let ul = doc.querySelector('ul');
                    if (!ul) {
                        ul = doc.createElement('ul');
                        doc.body.appendChild(ul);
                    }
                    // Helper to update or add a <li> for a field
                    function upsertLi(label, value) {
                        if (value === undefined) return;
                        let li = Array.from(ul.children).find(li => li.querySelector('strong') && li.querySelector('strong').textContent.trim().replace(/:$/, '').toUpperCase() === label.toUpperCase());
                        if (!li && value !== "") {
                            li = doc.createElement('li');
                            let strong = doc.createElement('strong');
                            strong.textContent = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() + ':';
                            li.appendChild(strong);
                            ul.appendChild(li);
                        }
                        if (li) {
                            if (value === "" || value === null) {
                                li.remove();
                            } else {
                                // Special handling for link and tags
                                if (label.toUpperCase() === 'LINK' && value && value.uuid && value.label) {
                                    li.innerHTML = `<strong>Link:</strong> @UUID[${value.uuid}]{${value.label}}`;
                                } else if (label.toUpperCase() === 'TAGS' && Array.isArray(value)) {
                                    li.innerHTML = `<strong>Tags:</strong> ${value.join(', ')}`;
                                } else {
                                    li.innerHTML = `<strong>${label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}:</strong> ${value}`;
                                }
                            }
                        }
                    }
                    upsertLi('Description', entry.description);
                    upsertLi('Plot Hook', entry.plotHook);
                    upsertLi('Location', entry.location);
                    upsertLi('Link', entry.link);
                    upsertLi('Tags', entry.tags);
                    // Update the page content only (do not update ownership.default)
                    await existingPage.update({
                        'text.content': doc.body.innerHTML
                    });
                    updated++;
                } else {
                    // Create new page as before
                    let html = `<ul>`;
                    if (entry.description) html += `<li><strong>Description:</strong> ${entry.description}</li>`;
                    if (entry.plotHook) html += `<li><strong>Plot Hook:</strong> ${entry.plotHook}</li>`;
                    if (entry.location) html += `<li><strong>Location:</strong> ${entry.location}</li>`;
                    if (entry.link && entry.link.uuid && entry.link.label) html += `<li><strong>Link:</strong> @UUID[${entry.link.uuid}]{${entry.link.label}}</li>`;
                    if (entry.tags && entry.tags.length) html += `<li><strong>Tags:</strong> ${entry.tags.join(', ')}</li>`;
                    html += `</ul>`;
                    await journal.createEmbeddedDocuments('JournalEntryPage', [{
                        name: entry.name,
                        type: 'text',
                        text: { content: html },
                        ownership: { default: entry.identified ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
                    }]);
                    added++;
                }
            }
        }
        ui.notifications.info(`Codex import complete: ${added} added, ${updated} updated.`);
        // Do not call _refreshData or render here; let the Foundry updateJournalEntryPage hook handle the refresh.
    }
} 