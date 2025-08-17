import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { CodexParser } from './codex-parser.js';
import { copyToClipboard } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

class CodexForm extends FormApplication {
    constructor(entry = null, options = {}) {
        super(entry, options);
        this.entry = entry || this._getDefaultEntry();
        this.dragActive = false;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'codex-entry-window',
            classes: ['codex-entry-window'],
            title: 'Add Codex Entry',
            template: 'modules/coffee-pub-squire/templates/codex-form.hbs',
            width: 700,
            height: 'auto',
            resizable: true,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false
        });
    }

    getData() {
        return {
            entry: this.entry,
            isGM: game.user.isGM,
            existingCategories: this._getExistingCategories(),
            existingLocations: this._getExistingLocations()
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

    _getExistingCategories() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];
        
        const journal = game.journal.get(journalId);
        if (!journal) return [];
        
        const categories = new Set();
        for (const page of journal.pages.contents) {
            try {
                const content = page.text?.content || '';
                const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]+)/);
                if (categoryMatch) {
                    categories.add(categoryMatch[1].trim());
                }
            } catch (e) {
                // Skip invalid entries
            }
        }
        return Array.from(categories).sort();
    }

    _getExistingLocations() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];
        
        const journal = game.journal.get(journalId);
        if (!journal) return [];
        
        const locations = new Set();
        for (const page of journal.pages.contents) {
            try {
                const content = page.text?.content || '';
                const locationMatch = content.match(/<strong>Location:<\/strong>\s*([^<]+)/);
                if (locationMatch) {
                    // Decode HTML entities and convert &gt; back to >
                    let location = locationMatch[1].trim();
                    location = location.replace(/&gt;/g, '>');
                    locations.add(location);
                }
            } catch (e) {
                // Skip invalid entries
            }
        }
        return Array.from(locations).sort();
    }

    async _updateObject(event, formData) {
        const entry = expandObject(formData);
        
        // Debug: Log the form data
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Processing codex form submission',
            { formData, entry },
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        // Convert tags to array
        if (typeof entry.tags === 'string') {
            entry.tags = entry.tags.split(',').map(t => t.trim()).filter(t => t);
        } else if (!entry.tags) {
            entry.tags = [];
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

            // Debug: Log the page data being created
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Creating journal page',
                { pageData, journalId: journal.id, journalName: journal.name },
                false,
                true,
                false,
                MODULE.TITLE
            );

            // Create new page
            const newPage = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);

            // Debug: Log successful creation
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Journal page created successfully',
                { newPage: newPage[0]?.id, pageName: newPage[0]?.name },
                false,
                true,
                false,
                MODULE.TITLE
            );

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
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error saving codex entry',
                { error, entry, journalId, journalName: journal?.name },
                false,
                false,
                true,
                MODULE.TITLE
            );
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

        // Handle form submission manually to ensure it works
        html.find('form').on('submit', (event) => {
            event.preventDefault();
            this._handleFormSubmit(event);
        });

        // Set up drag and drop zones
        this._setupDragAndDrop(html);
        
        // Set up form field interactions
        this._setupFormInteractions(html);
        
        // Set up image management
        this._setupImageManagement(html);
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        
        // Get form data
        const form = event.target;
        const formData = new FormData(form);
        
        // Convert FormData to object
        const entry = {};
        for (const [key, value] of formData.entries()) {
            // Skip empty values for optional fields
            if (key === 'img' && !value) continue;
            if (key === 'location' && !value) continue;
            if (key === 'plotHook' && !value) continue;
            
            entry[key] = value;
        }
        
        // Debug: Log the form submission
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Form submitted manually',
            { entry, formData: Object.fromEntries(formData) },
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        // Debug: Check specific fields
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Form field values',
            { 
                name: entry.name,
                category: entry.category,
                description: entry.description,
                plotHook: entry.plotHook,
                location: entry.location,
                tags: entry.tags,
                img: entry.img
            },
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        // Call the original _updateObject method
        await this._updateObject(event, entry);
    }

    _setupFormInteractions(html) {
        // Handle category dropdown changes
        const categorySelect = html.find('#category');
        const newCategoryInput = html.find('#new-category');
        
        categorySelect.on('change', function() {
            if ($(this).val() === 'new') {
                newCategoryInput.show().focus();
                newCategoryInput.attr('name', 'category');
                $(this).attr('name', '');
            } else {
                newCategoryInput.hide().attr('name', '');
                $(this).attr('name', 'category');
            }
        });

        // Handle location dropdown changes
        const locationSelect = html.find('#location');
        const newLocationInput = html.find('#new-location');
        
        locationSelect.on('change', function() {
            if ($(this).val() === 'new') {
                newLocationInput.show().focus();
                newLocationInput.attr('name', 'location');
                $(this).attr('name', '');
            } else {
                newLocationInput.hide().attr('name', '');
                $(this).attr('name', 'location');
            }
        });

        // Handle new category input
        newCategoryInput.on('input', function() {
            const value = $(this).val().trim();
            if (value) {
                categorySelect.attr('name', '');
                $(this).attr('name', 'category');
            }
        });

        // Handle new location input
        newLocationInput.on('input', function() {
            const value = $(this).val().trim();
            if (value) {
                locationSelect.attr('name', '');
                $(this).attr('name', 'location');
            }
        });
    }

    _setupImageManagement(html) {
        // Show image section if we have an image
        if (this.entry.img) {
            html.find('.codex-image-section').show();
            html.find('.codex-image-preview').attr('src', this.entry.img);
        }

        // Handle remove image button
        html.find('.codex-remove-image').on('click', () => {
            this.entry.img = null;
            html.find('.codex-image-section').hide();
            html.find('.codex-image-preview').attr('src', '');
        });
    }

    _setupDragAndDrop(html) {
        // Main drag zone for any entity
        const mainDragZone = html.find('.codex-drag-zone');
        
        mainDragZone.off('dragenter.codex dragleave.codex dragover.codex drop.codex');
        
        mainDragZone.on('dragenter.codex', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mainDragZone.addClass('drag-active');
        });

        mainDragZone.on('dragleave.codex', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mainDragZone.removeClass('drag-active');
        });

        mainDragZone.on('dragover.codex', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        mainDragZone.on('drop.codex', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            mainDragZone.removeClass('drag-active');
            
            try {
                const dataTransfer = e.originalEvent.dataTransfer.getData('text/plain');
                const data = JSON.parse(dataTransfer);
                
                if (data.type === 'Actor') {
                    await this._handleActorDrop(data);
                } else if (data.type === 'Item') {
                    await this._handleItemDrop(data);
                } else if (data.type === 'JournalEntry') {
                    await this._handleJournalDrop(data);
                }
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error processing dropped entity',
                    { error, dataTransfer: e.originalEvent.dataTransfer.getData('text/plain') },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        });
    }

    async _handleActorDrop(data) {
        const actor = await fromUuid(data.uuid || `Actor.${data.id}`);
        if (!actor) return;

        // Auto-populate fields for character
        this.entry.name = actor.name;
        this.entry.category = 'Characters';
        this.entry.img = actor.img;
        
        // Generate smart tags
        const tags = ['Characters'];
        if (actor.type) tags.push(actor.type);
        if (actor.system?.race?.value) tags.push(actor.system.race.value);
        if (actor.system?.class?.value) tags.push(actor.system.class.value);
        
        this.entry.tags = tags;
        
        // Update form
        this._updateFormFields();
        
        ui.notifications.info(`Added character: ${actor.name}`);
    }

    async _handleItemDrop(data) {
        const item = await fromUuid(data.uuid || `Item.${data.id}`);
        if (!item) return;

        // Auto-populate fields for item
        this.entry.name = item.name;
        this.entry.category = 'Items';
        this.entry.img = item.img;
        
        // Generate smart tags
        const tags = ['Items'];
        if (item.type) tags.push(item.type);
        if (item.system?.rarity?.value) tags.push(item.system.rarity.value);
        if (item.system?.equipment?.type) tags.push(item.system.equipment.type);
        
        this.entry.tags = tags;
        
        // Update form
        this._updateFormFields();
        
        ui.notifications.info(`Added item: ${item.name}`);
    }

    async _handleJournalDrop(data) {
        const journal = await fromUuid(data.uuid || `JournalEntry.${data.id}`);
        if (!journal) return;

        // Auto-populate fields for journal entry
        this.entry.name = journal.name;
        this.entry.link = { uuid: journal.uuid, label: journal.name };
        
        // Try to extract category from journal content
        if (journal.pages && journal.pages.contents.length > 0) {
            const firstPage = journal.pages.contents[0];
            const content = firstPage.text?.content || '';
            const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]+)/);
            if (categoryMatch) {
                this.entry.category = categoryMatch[1].trim();
            }
        }
        
        // Update form
        this._updateFormFields();
        
        ui.notifications.info(`Added journal entry: ${journal.name}`);
    }

    _updateFormFields() {
        // Update form inputs with new data
        const form = this.element.find('form');
        
        // Update basic fields
        form.find('input[name="name"]').val(this.entry.name);
        form.find('textarea[name="description"]').val(this.entry.description || '');
        form.find('textarea[name="plotHook"]').val(this.entry.plotHook || '');
        form.find('input[name="tags"]').val((this.entry.tags || []).join(', '));
        form.find('input[name="img"]').val(this.entry.img || '');
        
        // Update category dropdown
        if (this.entry.category) {
            const categorySelect = form.find('#category');
            const newCategoryInput = form.find('#new-category');
            
            // Check if category exists in dropdown
            const existingOption = categorySelect.find(`option[value="${this.entry.category}"]`);
            if (existingOption.length > 0) {
                categorySelect.val(this.entry.category);
                newCategoryInput.hide().attr('name', '');
                categorySelect.attr('name', 'category');
            } else {
                // Set to "new" and populate the new category input
                categorySelect.val('new');
                newCategoryInput.show().val(this.entry.category).attr('name', 'category');
                categorySelect.attr('name', '');
            }
        }
        
        // Update location dropdown
        if (this.entry.location) {
            const locationSelect = form.find('#location');
            const newLocationInput = form.find('#new-location');
            
            // Check if location exists in dropdown
            const existingOption = locationSelect.find(`option[value="${this.entry.location}"]`);
            if (existingOption.length > 0) {
                locationSelect.val(this.entry.location);
                newLocationInput.hide().attr('name', '');
                locationSelect.attr('name', 'location');
            } else {
                // Set to "new" and populate the new location input
                locationSelect.val('new');
                newLocationInput.show().val(this.entry.location).attr('name', 'location');
                locationSelect.attr('name', '');
            }
        }
        
        // Update image preview if exists
        if (this.entry.img) {
            const imgSection = form.find('.codex-image-section');
            const imgPreview = form.find('.codex-image-preview');
            
            imgSection.show();
            imgPreview.attr('src', this.entry.img);
        }
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
        this.isImporting = false; // Flag to prevent panel refreshes during import
        this._setupHooks();
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are now handled by the centralized HookManager
        // This method is kept for compatibility but no longer registers hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            'CODEX Panel: Hooks now managed by centralized HookManager',
            {},
            false,
            true,
            false,
            MODULE.TITLE
        );
    }

    /**
     * Show the global progress bar for codex imports
     * @private
     */
    _showProgressBar() {
        const progressArea = this.element?.find('.tray-progress-bar-wrapper');
        const progressFill = this.element?.find('.tray-progress-bar-inner');
        const progressText = this.element?.find('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.show();
            progressFill.css('width', '0%');
            progressText.text('Starting codex import...');
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

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this.element = null;
    }

    /**
     * Check if a page belongs to the selected journal
     * @private
     */
    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page is actually a CODEX entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if this appears to be a CODEX entry
     */
    _isCodexEntry(page) {
        try {
            // Quick check: if no text content, it's not a CODEX entry
            if (!page.text?.content) return false;
            
            // Get the raw text content to check for CODEX structure
            let content = '';
            if (typeof page.text.content === 'string') {
                content = page.text.content;
            } else if (page.text.content) {
                // For async content, we'll need to check it differently
                // For now, assume it might be a CODEX entry if we can't determine otherwise
                return true;
            }
            
            // Check if the content contains CODEX-specific markers
            // CODEX entries should have a CATEGORY field, but we'll be more lenient
            if (content && typeof content === 'string') {
                // Look for CATEGORY field (case-insensitive)
                const hasCategory = /<strong>category<\/strong>|<strong>category:<\/strong>/i.test(content);
                
                // If it has a category field, it's definitely a CODEX entry
                if (hasCategory) return true;
                
                // If no category field, check if it has other CODEX-like structure
                // Look for common CODEX fields to determine if this might be a CODEX entry
                const hasDescription = /<strong>description<\/strong>|<strong>description:<\/strong>/i.test(content);
                const hasTags = /<strong>tags<\/strong>|<strong>tags:<\/strong>/i.test(content);
                const hasPlotHook = /<strong>plot hook<\/strong>|<strong>plot hook:<\/strong>/i.test(content);
                const hasLocation = /<strong>location<\/strong>|<strong>location:<\/strong>/i.test(content);
                
                // If it has multiple CODEX-like fields, it's probably a CODEX entry
                const codexFieldCount = [hasDescription, hasTags, hasPlotHook, hasLocation].filter(Boolean).length;
                if (codexFieldCount >= 2) return true;
                
                // If we can't determine, assume it's not a CODEX entry to be safe
                return false;
            }
            
            // If we can't determine, assume it's not a CODEX entry to be safe
            return false;
        } catch (error) {
            // If there's any error checking, assume it's not a CODEX entry
            // This prevents crashes and excessive processing
            return false;
        }
    }

    /**
     * Get the icon class for a given category
     * @param {string} category
     * @returns {string} FontAwesome icon class
     */
    getCategoryIcon(category) {
        const map = {
            'No Category': 'fa-question-circle',
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
                        if (entry) {
                            // Add ownership info for visibility icon
                            entry.ownership = page.ownership;
                            
                            // Extract "Discovered By" information from the enriched content
                            const doc = new DOMParser().parseFromString(enriched, 'text/html');
                            const pTags = Array.from(doc.querySelectorAll('p'));
                            
                            // Look for "Discovered By" paragraph by finding the strong tag with that text
                            for (const p of pTags) {
                                const strong = p.querySelector('strong');
                                if (strong && strong.textContent.trim() === 'Discovered By:') {
                                    const discovererText = p.textContent.replace('Discovered By:', '').trim();
                                    if (discovererText) {
                                        entry.DiscoveredBy = discovererText;
                                    }
                                    break;
                                }
                            }
                            
                            // Determine category - if no category, use "No Category"
                            let normCategory = "No Category";
                            if (entry.category && entry.category.trim()) {
                                normCategory = entry.category.trim();
                            }
                            
                            // Add to categories set
                            this.categories.add(normCategory);
                            // Initialize category array if needed
                            if (!this.data[normCategory]) {
                                this.data[normCategory] = [];
                            }
                            // Add entry to category
                            this.data[normCategory].push(entry);
                            // Add tags
                            if (entry.tags && Array.isArray(entry.tags)) {
                                entry.tags.forEach(tag => this.allTags.add(tag));
                            }
                        }
                    }
                } catch (error) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error parsing codex entry',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
                }
            }
        }
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
            // Only handle old-style links with data-uuid attribute
            const uuid = event.currentTarget.dataset.uuid;
            if (uuid) {
                event.preventDefault();
                event.stopPropagation();
                const page = await fromUuid(uuid);
                if (page && page.parent) {
                    page.parent.sheet.render(true, { pageId: page.id });
                }
            }
            // Otherwise, let Foundry's default handler process the click
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

        // Auto-discover button
        html.find('.auto-discover-button').click(async () => {
            if (!game.user.isGM) return;
            
            await this._autoDiscoverFromInventories();
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
        html.find('.import-json-button').click(async (event) => {
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
                title: 'Import Codex from JSON',
                width: 600,
                resizable: true,
                content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                    type: 'codex',
                    isImport: true,
                    isExport: false,
                    jsonInputId: 'codex-import-json'
                }),
                buttons: {
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel Import'
                    },
                    import: {
                        icon: '<i class="fas fa-file-import"></i>',
                        label: 'Import JSON',
                        callback: async (html) => {
                            ui.notifications.info('Importing Codex entries. This may take some time as entries are added, updated, indexed, and sorted. You will be notified when the process is complete.');
                            
                            // Set import flag to prevent panel refreshes during import
                            this.isImporting = true;
                            
                            // Show progress bar
                            this._showProgressBar();
                            
                            try {
                                const value = html.find('#codex-import-json').val();
                                const data = JSON.parse(value);
                                if (!Array.isArray(data)) {
                                    ui.notifications.error('Imported JSON must be an array of entries.');
                                    return;
                                }
                                if (!this.selectedJournal) {
                                    ui.notifications.error('No Codex journal selected.');
                                    return;
                                }
                                
                                // Update progress for validation phase
                                this._updateProgressBar(10, 'Validating import data...');
                                
                                let added = 0;
                                let updated = 0;
                                let duplicatesMerged = 0;
                                // Check for duplicate names in the import data itself
                                const importNameCounts = {};
                                const duplicateNames = [];
                                data.forEach(entry => {
                                    if (entry.name) {
                                        importNameCounts[entry.name] = (importNameCounts[entry.name] || 0) + 1;
                                        if (importNameCounts[entry.name] > 1 && !duplicateNames.includes(entry.name)) {
                                            duplicateNames.push(entry.name);
                                        }
                                    }
                                });
                                
                                if (duplicateNames.length > 0) {
                                    ui.notifications.warn(`Warning: Import data contains duplicate entry names: ${duplicateNames.join(', ')}. These will be merged with existing entries.`);
                                }
                                
                                // Update progress for processing phase
                                this._updateProgressBar(20, `Processing ${data.length} entries...`);
                                
                                const totalEntries = data.length;
                                for (let i = 0; i < data.length; i++) {
                                    const entry = data[i];
                                    
                                    // Update progress for each entry
                                    const entryProgress = 20 + ((i / totalEntries) * 60); // 20-80% range for entry processing
                                    this._updateProgressBar(entryProgress, `Processing entry: ${entry.name}`);
                                    
                                    // Find existing page by UUID first (if available), then by name
                                    let page = null;
                                    if (entry.uuid) {
                                        page = this.selectedJournal.pages.find(p => p.getFlag(MODULE.ID, 'codexUuid') === entry.uuid);
                                    }
                                    if (!page) {
                                        page = this.selectedJournal.pages.find(p => p.name === entry.name);
                                    }
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
                                        
                                        // Track if this was a duplicate merge
                                        if (entry.uuid && page.getFlag(MODULE.ID, 'codexUuid') !== entry.uuid) {
                                            duplicatesMerged++;
                                        }
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
                                        const newPage = await this.selectedJournal.createEmbeddedDocuments('JournalEntryPage', [{
                                            name: entry.name,
                                            type: 'text',
                                            text: { content: html },
                                            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
                                        }]);
                                        
                                        // Set the codexUuid flag for future deduplication
                                        if (entry.uuid) {
                                            await newPage[0].setFlag(MODULE.ID, 'codexUuid', entry.uuid);
                                        }
                                        
                                        added++;
                                    }
                                    
                                    // Small delay to make progress visible
                                    if (i % 5 === 0) {
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                }
                                
                                // Update progress for sorting phase
                                this._updateProgressBar(80, 'Sorting entries...');
                                
                                // Sort pages alphabetically by name
                                const sorted = this.selectedJournal.pages.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
                                for (let i = 0; i < sorted.length; i++) {
                                    await sorted[i].update({ sort: (i + 1) * 10 });
                                }
                                
                                // Update progress for completion
                                this._updateProgressBar(90, 'Finalizing import...');
                                
                                let message = `Codex import complete: ${added} added, ${updated} updated.`;
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
                                
                            } catch (e) {
                                // Hide progress bar on error
                                this._hideProgressBar();
                                
                                // Clear import flag on error
                                this.isImporting = false;
                                
                                ui.notifications.error('Invalid JSON.');
                            }
                        }
                    }
                },
                default: 'import',
                render: (html) => {
                    // Apply custom button classes
                    html.find('[data-button="cancel"]').addClass('squire-cancel-button');
                    html.find('[data-button="import"]').addClass('squire-submit-button');
                    
                    html.find('.copy-template-button').click(() => {
                        copyToClipboard(template);
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
                            if (!Array.isArray(importData)) {
                                ui.notifications.error('Invalid file format: Must be an array of codex entries.');
                                return;
                            }
                            
                            // Auto-populate the textarea with the file content
                            html.find('#codex-import-json').val(text);
                            
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
            },
            {
                classes: ['import-export-dialog']
            }).render(true);
        });

        // Export JSON button
        html.find('.export-json-button').click(async (event) => {
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
                width: 600,
                resizable: true,
                content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                    type: 'codex',
                    isImport: false,
                    isExport: true,
                    jsonOutputId: 'codex-export-json',
                    exportData: jsonString,
                    exportSummary: {
                        totalItems: exportData.length,
                        exportVersion: "1.0",
                        timestamp: new Date().toLocaleString()
                    }
                }),
                buttons: {
                    close: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel Export',
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
                                
                                // Build a Windows-safe filename
                                const stamp = new Date().toISOString().replace(/[:]/g, "-");
                                const filename = sanitizeWindowsFilename(`COFFEEPUB-SQUIRE-codex-export-${stamp}.json`);
                                
                                // Use Foundry's built-in helper (v10+) - this handles Blob creation + anchor download correctly
                                if (typeof saveDataToFile === 'function') {
                                    saveDataToFile(jsonString, "application/json;charset=utf-8", filename);
                                    ui.notifications.info(`Codex export saved as ${filename}`);
                                } else {
                                    // Fallback: use the classic anchor approach with sanitized filename
                                    const blob = new Blob([jsonString], { 
                                        type: 'application/json;charset=utf-8' 
                                    });
                                    const url = URL.createObjectURL(blob);
                                    
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = filename;
                                    a.style.display = 'none';
                                    a.rel = "noopener"; // safety
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    
                                    // Always revoke after a tick so the download starts
                                    setTimeout(() => URL.revokeObjectURL(url), 0);
                                    
                                    ui.notifications.info(`Codex export downloaded as ${filename}`);
                                }
                            } catch (error) {
                                // Last resort: copy to clipboard
                                copyToClipboard(jsonString);
                                ui.notifications.warn('Download failed. Export data copied to clipboard instead.');
                                getBlacksmith()?.utils.postConsoleAndNotification('Export download failed', { error }, false, true, true, MODULE.TITLE);
                            }
                        }
                    }
                },
                default: 'download'
            },
            {
                classes: ['import-export-dialog'],
                id: 'import-export-dialog',
                render: (html) => {
                    // Apply custom button classes
                    html.find('[data-button="close"]').addClass('squire-cancel-button');
                    html.find('[data-button="download"]').addClass('squire-submit-button');
                }
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
            width: 600,
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
     * Auto-discover codex entries from party inventories
     * @private
     */
    async _autoDiscoverFromInventories() {
        if (!this.selectedJournal) {
            ui.notifications.warn("No codex journal selected. Please select a journal first.");
            return;
        }

        // Set import flag to prevent panel refreshes during auto-discovery
        this.isImporting = true;

        // Get the button element and show it's working
        const button = this.element?.find('.auto-discover-button');
        if (button) {
            button.addClass('working');
            button.attr('title', 'Scanning party inventories...');
        }

        // Show progress area
        const progressArea = this.element?.find('.tray-progress-bar-wrapper');
        const progressFill = this.element?.find('.tray-progress-bar-inner');
        const progressText = this.element?.find('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.show();
            progressFill.css('width', '0%');
            progressText.text('Starting scan...');
            
            // Small delay to make progress visible
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
            // Show initial notification
            ui.notifications.info("Starting auto-discovery scan...");

            // Get all tokens on the canvas
            const tokens = canvas.tokens.placeables.filter(token => 
                token.actor && 
                token.actor.type === 'character' && 
                token.actor.hasPlayerOwner
            );

            if (tokens.length === 0) {
                ui.notifications.warn("No player character tokens found on the canvas.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.text('No players found');
                    progressFill.css('width', '100%');
                    // Hide progress area after a delay
                    setTimeout(() => {
                        progressArea.hide();
                    }, 2000);
                }
                return;
            }

            // Collect all inventory items from party members
            const inventoryItems = new Set();
            const characterNames = [];
            const totalPlayers = tokens.length;
            let processedPlayers = 0;
            
            // Update progress for character scanning phase
            if (progressText) {
                progressText.text('Scanning party inventories...');
            }
            if (progressFill) {
                progressFill.css('width', '0%');
            }
            
            for (const token of tokens) {
                const actor = token.actor;
                characterNames.push(actor.name);
                processedPlayers++;
                
                // Update progress for this character - REAL PROGRESS
                const playerProgressPercent = (processedPlayers / totalPlayers) * 20; // 0-20% range for player scanning
                if (progressFill) {
                    progressFill.css('width', `${playerProgressPercent}%`);
                }
                if (progressText) {
                    progressText.text(`Scanning ${actor.name}...`);
                }
                
                // Add a small delay to make player scanning visible
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Use the same approach as the inventory panel
                if (actor.items && actor.items.contents) {
                    // Filter items by type (same as inventory panel)
                    const items = actor.items.contents.filter(item => 
                        ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                    );
                    
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        `Scanning ${actor.name}: found ${items.length} inventory items`,
                        { 
                            actorName: actor.name,
                            itemTypes: items.map(i => ({ name: i.name, type: i.type })),
                            totalActorItems: actor.items.contents.length
                        },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                    
                    for (const item of items) {
                        // Normalize spaces: collapse multiple spaces into single spaces, then lowercase and trim
                        const itemNameLower = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
                        inventoryItems.add(itemNameLower);
                        
                        // Debug: Log items that match "Test 2" specifically
                        if (item.name.toLowerCase().includes('test 2') || item.name.toLowerCase().includes('test  2')) {
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                `Found potential "Test 2" item: "${item.name}"`,
                                { 
                                    actorName: actor.name,
                                    itemName: item.name,
                                    normalizedName: itemNameLower,
                                    originalLength: item.name.length,
                                    normalizedLength: itemNameLower.length
                                },
                                false,
                                false,
                                false,
                                MODULE.TITLE
                            );
                        }
                        
                        // If it's a backpack/container, check its contents
                        if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                            for (const containedItem of item.contents) {
                                // Apply same space normalization to contained items
                                const containedItemNameLower = containedItem.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                inventoryItems.add(containedItemNameLower);
                                
                                // Debug: Log contained items that match "Test 2" specifically
                                if (containedItem.name.toLowerCase().includes('test 2') || containedItem.name.toLowerCase().includes('test  2')) {
                                    getBlacksmith()?.utils.postConsoleAndNotification(
                                        `Found potential "Test 2" contained item: "${containedItem.name}"`,
                                        { 
                                            actorName: actor.name,
                                            containerItem: item.name,
                                            containedItemName: containedItem.name,
                                            normalizedName: containedItemNameLower
                                        },
                                        false,
                                        false,
                                        false,
                                        MODULE.TITLE
                                    );
                                }
                            }
                        }
                    }
                } else {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        `No items found for ${actor.name}`,
                        { 
                            actorName: actor.name,
                            hasItems: !!actor.items,
                            itemsLength: actor.items?.contents?.length || 0
                        },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                }
            }

            if (inventoryItems.size === 0) {
                ui.notifications.warn("No inventory items found in party members' inventories.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.text('No items found');
                    progressFill.css('width', '100%');
                    // Hide progress area after a delay
                    setTimeout(() => {
                        progressArea.hide();
                    }, 2000);
                }
                return;
            }

            // Find matching codex entries
            const discoveredEntries = [];
            const updatedPages = [];
            const totalEntries = Object.values(this.data).flat().length;
            let processedEntries = 0;
            let lastDiscoveryTime = 0; // Track when last discovery was shown

            // Update progress for codex scanning phase
            if (progressText) {
                progressText.text(`Scanning ${totalEntries} codex entries...`);
            }
            if (progressFill) {
                progressFill.css('width', '20%');
            }

            for (const [category, entries] of Object.entries(this.data)) {
                for (const entry of entries) {
                    processedEntries++;
                    
                    // Update progress bar with current entry info - REAL PROGRESS, no throttling
                    const progressPercent = 20 + ((processedEntries / totalEntries) * 80); // 20-100% range for codex scanning
                    if (progressFill) {
                        progressFill.css('width', `${progressPercent}%`);
                    }
                    
                    // Only update progress text if we haven't shown a discovery recently
                    const now = Date.now();
                    if (progressText && (now - lastDiscoveryTime) > 1000) {
                        progressText.text(`Scanning: ${entry.name}`);
                    }
                    
                    // Add a small delay every 5 entries to make progress visible
                    if (processedEntries % 5 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // Check if entry name matches any inventory item
                    const entryNameLower = entry.name.toLowerCase().trim();
                    
                    if (inventoryItems.has(entryNameLower)) {
                        // Check if this entry is already visible
                        const page = await fromUuid(entry.uuid);
                        if (page && page.ownership?.default < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                            // Find which character(s) had this item
                            const discoverers = [];
                            
                            // Debug: Log what we're looking for
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                `Checking for item: "${entry.name}" (normalized: "${entryNameLower}")`,
                                { 
                                    entryName: entry.name,
                                    entryNameLower: entryNameLower,
                                    inventoryItems: Array.from(inventoryItems)
                                },
                                false,
                                false,
                                false,
                                MODULE.TITLE
                            );
                            
                            for (const token of tokens) {
                                const actor = token.actor;
                                const items = actor.items.contents.filter(item => 
                                    ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                                );
                                
                                let foundInThisActor = false;
                                
                                for (const item of items) {
                                    // Normalize the item name the same way we did when building inventoryItems
                                    const itemNameLower = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                    
                                    if (itemNameLower === entryNameLower) {
                                        if (!foundInThisActor) {
                                            discoverers.push(actor.name);
                                            foundInThisActor = true;
                                        }
                                        // Don't break - continue checking other items in case there are duplicates
                                    }
                                    
                                    // Check backpack contents
                                    if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                                        for (const containedItem of item.contents) {
                                            const containedItemNameLower = containedItem.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                            if (containedItemNameLower === entryNameLower) {
                                                if (!foundInThisActor) {
                                                    discoverers.push(actor.name);
                                                    foundInThisActor = true;
                                                }
                                                // Don't break - continue checking other contained items
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Debug: Log what we found
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                `Found "${entry.name}" with discoverers: ${discoverers.join(', ')}`,
                                { 
                                    entryName: entry.name,
                                    discoverers: discoverers,
                                    totalDiscoverers: discoverers.length
                                },
                                false,
                                false,
                                false,
                                MODULE.TITLE
                            );
                            
                            // Make it visible
                            await page.update({ 'ownership.default': CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
                            discoveredEntries.push(entry.name);
                            updatedPages.push(page);
                            
                            // Add "Discovered By" information to the journal entry
                            if (discoverers.length > 0) {
                                await this._addDiscoveredByInfo(page, discoverers);
                            }
                            
                            // Show discovery immediately with progress update
                            if (progressText) {
                                progressText.text(`✓ Found: ${entry.name}`);
                                lastDiscoveryTime = Date.now(); // Mark when discovery was shown
                                // Keep discovery visible for a moment - increased delay
                                await new Promise(resolve => setTimeout(resolve, 1200));
                            }
                        }
                    }
                }
            }

            // Show final summary regardless of results
            if (discoveredEntries.length === 0) {
                if (progressText) {
                    progressText.text(`No new entries found`);
                }
            } else {
                if (progressText) {
                    progressText.text(`Found ${discoveredEntries.length} new entries`);
                }
            }
            
            // Keep final summary visible for a moment
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Debug: Log that we're about to refresh
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Auto-discovery scan complete, refreshing panel...',
                { 
                    discoveredEntries: discoveredEntries.length,
                    totalEntries: totalEntries
                },
                false,
                false,
                false,
                MODULE.TITLE
            );
            
            // Log detailed results with discoverer information
            if (discoveredEntries.length > 0) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    `Auto-discovered ${discoveredEntries.length} codex entries from party inventories`,
                    { 
                        characters: characterNames,
                        discoveredEntries,
                        totalItemsScanned: inventoryItems.size,
                        updatedPages: updatedPages.length,
                        message: `Entries discovered by: ${characterNames.join(', ')}`
                    },
                    false,
                    false,
                    false,
                    MODULE.TITLE
                );
            }
            
            // Show completion message and hide progress area after delay
            if (progressArea && progressFill && progressText) {
                // Show prominent completion message
                progressText.text('Scan Complete!');
                progressFill.css('width', '100%');
                
                // Add a visual completion indicator
                progressArea.addClass('scan-complete');
                
                // Keep completion message visible for 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Remove completion styling and hide progress area
                progressArea.removeClass('scan-complete');
                progressArea.hide();
            }
            
            // Clear import flag and refresh panel once at the end
            this.isImporting = false;
            await this._refreshData();
            this.render(this.element);
            
        } catch (error) {
            // Clear import flag on error
            this.isImporting = false;
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error during auto-discovery',
                { error },
                false,
                false,
                true,
                MODULE.TITLE
            );
            ui.notifications.error(`Auto-discovery failed: ${error.message}`);
            
            // Show error in progress area
            if (progressArea && progressFill && progressText) {
                progressText.text(`Error: ${error.message}`);
                progressFill.css('width', '100%');
                
                // Hide progress area after a delay
                setTimeout(() => {
                    progressArea.hide();
                }, 3000);
            }
        } finally {
            // Reset button state
            if (button) {
                button.removeClass('working');
                button.attr('title', 'Auto-Discover from Party Inventories');
            }
        }
    }

    /**
     * Add "Discovered By" information to a journal entry.
     * @private
     * @param {JournalEntryPage} page - The journal entry page to update.
     * @param {string[]} discoverers - An array of character names who discovered the entry.
     */
    async _addDiscoveredByInfo(page, discoverers) {
        try {
            const enrichedContent = await TextEditor.enrichHTML(page.text.content, {
                secrets: game.user.isGM,
                documents: true,
                links: true,
                rolls: true
            });

            const doc = new DOMParser().parseFromString(enrichedContent, 'text/html');
            const pTags = Array.from(doc.querySelectorAll('p'));

            // Find existing "Discovered By" paragraph by looking for the text content
            let discoveredByParagraph = null;
            let existingDiscoverers = [];
            
            for (let i = pTags.length - 1; i >= 0; i--) {
                const p = pTags[i];
                const strong = p.querySelector('strong');
                if (strong && strong.textContent.trim() === 'Discovered By:') {
                    discoveredByParagraph = p;
                    // Extract existing discoverers from the paragraph text
                    const discovererText = p.textContent.replace('Discovered By:', '').trim();
                    if (discovererText) {
                        existingDiscoverers = discovererText.split(',').map(d => d.trim());
                    }
                    break;
                }
            }

            // Combine existing and new discoverers, removing duplicates
            const allDiscoverers = [...new Set([...existingDiscoverers, ...discoverers])];
            
            // Create the "Discovered By" paragraph without the class attribute
            const newDiscoveredByParagraph = document.createElement('p');
            newDiscoveredByParagraph.innerHTML = `<strong>Discovered By:</strong> ${allDiscoverers.join(', ')}`;
            
            if (discoveredByParagraph) {
                // Replace existing paragraph
                discoveredByParagraph.replaceWith(newDiscoveredByParagraph);
            } else {
                // Add new paragraph at the end
                doc.body.appendChild(newDiscoveredByParagraph);
            }

            // Update the page content
            await page.update({ 'text.content': doc.body.innerHTML });
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                `Updated "Discovered By" for ${page.name}`,
                { 
                    existingDiscoverers,
                    newDiscoverers: discoverers,
                    allDiscoverers
                },
                false,
                false,
                false,
                MODULE.TITLE
            );
            
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error updating "Discovered By" information',
                { error, pageName: page.name },
                false,
                false,
                true,
                MODULE.TITLE
            );
        }
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
        // Sort categories with "No Category" always first, then alphabetically for the rest
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            if (a === "No Category") return -1;
            if (b === "No Category") return 1;
            return a.localeCompare(b);
        });
        
        const categoriesData = await Promise.all(sortedCategories.map(async category => {
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
            // Enrich links for Foundry UUID handling
            for (const entry of entries) {
                if (entry.link && entry.link.uuid && entry.link.label) {
                    entry.linkHtml = await TextEditor.enrichHTML(
                        `@UUID[${entry.link.uuid}]{${entry.link.label}}`,
                        { documents: true, links: true }
                    );
                }
            }
            const totalCount = entries.length;
            const visibleEntries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const visibleCount = visibleEntries.length;
            
            // For "No Category", only include if it has visible entries
            if (category === "No Category" && visibleCount === 0) {
                return null;
            }
            
            return {
                name: category,
                icon: this.getCategoryIcon(category),
                entries,
                collapsed: collapsedCategories[category] || false,
                totalCount,
                visibleCount,
                visibleEntries
            };
        }));
        
        // Filter out null entries (empty "No Category" sections)
        const filteredCategoriesData = categoriesData.filter(cat => cat !== null);

        // Build allTags for tag cloud
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all entries
            const allEntries = filteredCategoriesData.flatMap(cat => cat.entries);
            allTags = new Set();
            allEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        } else {
            // Players see tags only from visible entries
            const allVisibleEntries = filteredCategoriesData.flatMap(cat => cat.visibleEntries);
            allTags = new Set();
            allVisibleEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categoriesData: filteredCategoriesData,
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
