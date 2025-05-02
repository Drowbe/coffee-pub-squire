import { MODULE, TEMPLATES } from './const.js';
import { CodexParser } from './codex-parser.js';

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournal = null;
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
            if (this.element && this.selectedJournal?.id === page.parent.id) {
                await this._refreshData();
                this.render(this.element);
            }
        });
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        if (!this.selectedJournal) return;

        // Clear existing data
        this.data = {
            Characters: [],
            Locations: [],
            Artifacts: []
        };
        this.allTags.clear();

        // Process each category
        for (const category of this.categories) {
            const page = this.selectedJournal.pages.find(p => p.name === category);
            if (page) {
                try {
                    let content = '';
                    
                    // Try different methods to get the content
                    if (typeof page.text?.content === 'string') {
                        content = page.text.content;
                    } else if (typeof page.text === 'string') {
                        content = page.text;
                    } else if (page.text?.content) {
                        content = await page.text.content;
                    }

                    // If we have content, enrich it
                    if (content) {
                        const enriched = await TextEditor.enrichHTML(content, {
                            secrets: game.user.isGM,
                            documents: true,
                            links: true,
                            rolls: true
                        });

                        // Parse the enriched content
                        const entries = await CodexParser.parseContent(enriched);
                        this.data[category] = entries;

                        // Collect all tags
                        entries.forEach(entry => {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                        });
                    }
                } catch (error) {
                    console.error(`SQUIRE | Error processing ${category} page:`, error);
                    ui.notifications.error(`Error loading ${category} entries. See console for details.`);
                }
            } else {
                console.log(`SQUIRE | No ${category} page found in journal`);
            }
        }
    }

    /**
     * Apply current filters to entries
     * @private
     */
    _applyFilters(entries) {
        // First sort entries alphabetically by name
        const sortedEntries = [...entries].sort((a, b) => 
            a.name.localeCompare(b.name)
        );

        // Filter out unidentified entries for non-GM users
        const filteredEntries = sortedEntries.filter(entry => 
            game.user.isGM || entry.identified
        );

        // Only filter by tags since search is now handled in DOM
        if (this.filters.tags.length > 0) {
            return filteredEntries.filter(entry => {
                const hasAnyTag = this.filters.tags.some(tag => 
                    entry.tags.includes(tag)
                );
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
            
            // Toggle disabled state of clear button
            clearButton.toggleClass('disabled', !searchValue);
            
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
            if (this.selectedJournal) {
                await this._refreshData();
                this.render(this.element);
                ui.notifications.info("Codex refreshed.");
            }
        });

        // Clear search button
        clearButton.click((event) => {
            if (!$(event.currentTarget).hasClass('disabled')) {
                this.filters.search = "";
                this.filters.tags = [];
                searchInput.val("");
                // Show all entries and sections
                html.find('.codex-entry, .codex-section').show();
                // Update clear button state
                $(event.currentTarget).addClass('disabled');
                // Also update tag filter UI if present
                const tagSelect = html.find('.codex-tag-filter select')[0];
                if (tagSelect) {
                    Array.from(tagSelect.options).forEach(opt => opt.selected = false);
                    $(tagSelect).trigger('change');
                }
                // Also remove selected class from tag cloud
                html.find('.codex-tag.selected').removeClass('selected');
            }
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
            // Enable/disable clear button based on tags or search
            const clearButton = html.find('.clear-search');
            if (this.filters.tags.length > 0 || this.filters.search) {
                clearButton.removeClass('disabled');
            } else {
                clearButton.addClass('disabled');
            }
            this.render(this.element);
        });

        // Tag filter
        html.find('.codex-tag-filter select').on('change', (event) => {
            const select = event.currentTarget;
            this.filters.tags = Array.from(select.selectedOptions).map(option => option.value);
            // Enable/disable clear button based on tags or search
            const clearButton = html.find('.clear-search');
            if (this.filters.tags.length > 0 || this.filters.search) {
                clearButton.removeClass('disabled');
            } else {
                clearButton.addClass('disabled');
            }
            this.render(this.element);
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

        // Remove any existing handlers first
        html.off('click.codexIdentified');
        
        // Identified state toggle - with namespaced event
        html.on('click.codexIdentified', '.codex-entry-controls .fa-eye, .codex-entry-controls .fa-eye-slash', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Prevent multiple rapid clicks
            const target = $(event.currentTarget);
            if (target.data('processing')) return;
            target.data('processing', true);
            
            console.log("SQUIRE | Eye icon clicked", {
                target: event.currentTarget,
                isGM: game.user.isGM,
                hasJournal: !!this.selectedJournal,
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
                const category = entryElement.closest('.codex-section').find('h3').text();
                
                console.log("SQUIRE | Entry details", {
                    entryName,
                    category,
                    hasSelectedJournal: !!this.selectedJournal,
                    journalPages: this.selectedJournal?.pages.size,
                    entryElementFound: !!entryElement.length,
                    entryNameFound: !!entryName,
                    categoryFound: !!category
                });
                
                // Find the journal page for this category
                const page = this.selectedJournal.pages.find(p => p.name === category);
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
    }

    /**
     * Show journal picker dialog
     * @private
     */
    _showJournalPicker() {
        // Get all available journals
        const journals = game.journal.contents.map(j => ({
            id: j.id,
            name: j.name,
            img: j.thumbnail || j.img || 'icons/svg/book.svg',
            pages: j.pages.size
        }));
        
        // Sort alphabetically
        journals.sort((a, b) => a.name.localeCompare(b.name));
        
        // Create a more visual journal picker with journal covers
        const content = `
        <h2 style="text-align: center; margin-bottom: 15px;">Select a Journal for Codex</h2>
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
            <p style="margin-bottom: 5px; color: #ddd;"><i class="fas fa-info-circle" style="color: #88f;"></i> The codex journal should have pages named "Characters", "Locations", and "Artifacts".</p>
            <p style="color: #ddd;">Each page should contain entries formatted with headings and lists as described in the journal template.</p>
        </div>
        <div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button>
            <button class="refresh-button" style="flex: 1; margin-left: 5px;">Refresh List</button>
        </div>
        `;
        
        const dialog = new Dialog({
            title: "Select Codex Journal",
            content: content,
            buttons: {},
            render: html => {
                // Handle journal item clicks
                html.find('.journal-item').click(async event => {
                    const journalId = event.currentTarget.dataset.id;
                    
                    // Update the setting
                    await game.settings.set(MODULE.ID, 'codexJournal', journalId);
                    
                    ui.notifications.info(`Journal ${journalId === 'none' ? 'selection cleared' : 'selected'}.`);
                    dialog.close();
                    
                    // Re-render the codex panel
                    this.render(this.element);
                });
                
                // Handle cancel button
                html.find('.cancel-button').click(() => dialog.close());
                
                // Handle refresh button
                html.find('.refresh-button').click(() => {
                    dialog.close();
                    this._showJournalPicker();
                });
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

        // Get the selected journal
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        this.selectedJournal = journalId !== 'none' ? game.journal.get(journalId) : null;
        
        console.log("SQUIRE | Codex journal", {
            journalId,
            journal: this.selectedJournal,
            hasJournal: !!this.selectedJournal
        });

        // Refresh data if needed
        if (this.selectedJournal && Object.values(this.data).flat().length === 0) {
            await this._refreshData();
        }

        // Get collapsed states
        const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal?.name || "Codex",
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
            templateData.data[category] = this._applyFilters(this.data[category] || []);
        }

        console.log("SQUIRE | Rendering codex template", {
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal?.name || 'No Journal Selected',
            categories: this.categories,
            dataCount: Object.values(templateData.data).flat().length,
            filters: this.filters,
            tagCount: this.allTags.size
        });

        // Render the template
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX, templateData);
        codexContainer.html(html);

        // Activate listeners
        this._activateListeners(codexContainer);

        // Restore collapsed states
        for (const [category, collapsed] of Object.entries(collapsedCategories)) {
            if (collapsed) {
                codexContainer.find(`.codex-section h3:contains("${category}")`).closest('.codex-section').addClass('collapsed');
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

        // --- Codex Card Collapse/Expand ---
        // Always start collapsed
        codexContainer.find('.codex-entry').addClass('collapsed');
        // Toggle collapse on chevron click
        codexContainer.on('click', '.codex-entry-toggle', function(e) {
            const card = $(this).closest('.codex-entry');
            card.toggleClass('collapsed');
            e.stopPropagation();
        });
        // Toggle collapse on header click (but not controls)
        codexContainer.on('click', '.codex-entry-header', function(e) {
            if ($(e.target).closest('.codex-entry-controls').length) return;
            const card = $(this).closest('.codex-entry');
            card.toggleClass('collapsed');
        });
    }
} 