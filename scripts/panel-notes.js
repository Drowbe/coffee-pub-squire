import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import {
    PERMISSION_LEVELS,
    userCanAccessPage,
    showJournalPicker,
    showPagePicker,
    renderJournalContent,
    getJournalPageContent,
    enrichJournalContent
} from './utility-journal.js';
import { NotesParser } from './utility-notes-parser.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class NotesPanel {
    constructor() {
        this.element = null;
        this.notes = [];
        this.filters = {
            search: '',
            tags: [],
            scene: 'all',
            visibility: 'all' // all, private, party
        };
        this.filtersOpen = false;
        this.allTags = new Set();
        this.scenes = new Set();
        // Hooks are now managed centrally by HookManager
    }





    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this.element = null;
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);
        const notesContainer = this.element?.querySelector('[data-panel="panel-notes"]');
        if (!notesContainer) return;

        // Refresh data (load notes)
        await this._refreshData();

        // Get the selected journal ID
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId !== 'none' ? game.journal.get(journalId) : null;
        const canViewJournal = journal ? (game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER)) : false;

        // If journal ID exists but journal doesn't, reset to 'none'
        if (journalId !== 'none' && !journal && game.user.isGM) {
            await game.settings.set(MODULE.ID, 'notesJournal', 'none');
            ui.notifications.warn("The previously selected notes journal no longer exists. Please select a new one.");
        }

        // Render template with notes data
        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            notes: this.notes.map(note => ({
                ...note,
                tags: note.tags || [], // Ensure tags is always an array
                tagsCsv: (note.tags || []).map(tag => String(tag).toUpperCase()).join(',')
            })),
            allTags: Array.from(this.allTags).sort(),
            scenes: Array.from(this.scenes).sort(),
            filters: this.filters,
            filtersOpen: this.filtersOpen,
            isGM: game.user.isGM,
            position: "left"
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        notesContainer.innerHTML = html;

        this.activateListeners(notesContainer);
    }

    /**
     * Refresh data from the journal - load all notes using NotesParser
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.notes = [];
        this.allTags.clear();
        this.scenes.clear();

        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (!journal) return;

        // Check if user can view this journal
        const canViewJournal = game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER);
        if (!canViewJournal) return;

        // Process all pages in the journal
        for (const page of journal.pages.contents) {
            try {
                // Check if this is a note (has noteType flag)
                const noteType = page.getFlag(MODULE.ID, 'noteType');
                if (noteType !== 'sticky') {
                    // Not a note, skip it
                    continue;
                }

                // Check visibility - filter private notes
                const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                if (visibility === 'private' && !game.user.isGM) {
                    // Private notes: only show to author or GM
                    const authorId = page.getFlag(MODULE.ID, 'authorId');
                    if (authorId !== game.user.id) {
                        continue; // Skip this note
                    }
                }

                // Get page content
                const content = await getJournalPageContent(page);
                
                // Enrich content
                const enriched = await enrichJournalContent(content, {
                    secrets: game.user.isGM,
                    documents: true,
                    links: true,
                    rolls: true
                });

                // Parse the note
                const note = await NotesParser.parseSinglePage(page, enriched);
                
                if (note) {
                    // Ensure authorName is always set (fallback to user ID if name lookup failed)
                    if (!note.authorName && note.authorId) {
                        note.authorName = note.authorId;
                    }

                    if (!Array.isArray(note.editorIds)) {
                        note.editorIds = [];
                    }

                    const editorIds = [...new Set(note.editorIds.length ? note.editorIds : (note.authorId ? [note.authorId] : []))];
                    note.editorAvatars = editorIds.map(id => {
                        const user = game.users.get(id) || game.users.find(u => u.id === id);
                        return {
                            id,
                            name: user?.name || id || 'Unknown',
                            img: user?.avatar || user?.img || 'icons/svg/mystery-man.svg'
                        };
                    });
                    
                    // Debug: Log visibility to verify it's being read correctly
                    const savedVisibility = page.getFlag(MODULE.ID, 'visibility');
                    const allFlags = page.getFlag(MODULE.ID) || {};
                    console.log('NotesPanel._refreshData: Note parsed:', {
                        name: note.name,
                        parsedVisibility: note.visibility,
                        savedVisibilityFlag: savedVisibility,
                        allFlags: allFlags,
                        tags: note.tags,
                        authorName: note.authorName,
                        authorId: note.authorId
                    });
                    
                    // Ensure tags is always an array (even if empty)
                    if (!Array.isArray(note.tags)) {
                        note.tags = [];
                    }
                    note.tags = note.tags.map(tag => String(tag).toUpperCase());
                    this.notes.push(note);
                    
                    // Collect tags
                    if (note.tags && Array.isArray(note.tags)) {
                        note.tags.forEach(tag => this.allTags.add(tag));
                    }
                    
                    // Collect scenes
                    if (note.sceneId && note.sceneName) {
                        this.scenes.add(note.sceneName);
                    }
                }
            } catch (error) {
                console.error(`Error processing note page ${page.id}:`, error);
                // Continue processing other notes
            }
        }

        // Sort notes by timestamp (newest first)
        this.notes.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }

    activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Set journal button (GM only)
        nativeHtml.querySelectorAll('.set-journal-button, .set-journal-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                if (game.user.isGM) {
                    showJournalPicker({
                        title: 'Select Journal for Notes',
                        getCurrentId: () => game.settings.get(MODULE.ID, 'notesJournal'),
                        onSelect: async (journalId) => {
                            await game.settings.set(MODULE.ID, 'notesJournal', journalId);
                            if (journalId && journalId !== 'none') {
                                const journal = game.journal.get(journalId);
                                if (journal) {
                                    const defaultPerm = journal.ownership.default;
                                    if (defaultPerm < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                                        ui.notifications.warn(`Warning: Notes journal "${journal.name}" should have "All Players = Observer" ownership to allow players to create notes.`);
                                    } else {
                                        ui.notifications.info(`Notes journal "${journal.name}" selected.`);
                                    }
                                }
                            } else {
                                ui.notifications.info('Notes journal selection cleared.');
                            }
                        },
                        reRender: () => this.render(this.element),
                        infoHtml: '<p style="margin-bottom: 5px; color: #ddd;"><i class="fa-solid fa-info-circle" style="color: #88f;"></i> This journal will be used for all player notes. Players can create notes if they have Observer access or better.</p><p style="color: #ddd;">Make sure the journal has "All Players = Observer" ownership to allow players to create notes.</p>',
                        showRefreshButton: true
                    });
                }
            });
        });

        // New Note button - opens NotesForm window
        nativeHtml.querySelectorAll('.new-note-button, .new-note-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const form = new NotesForm();
                form.render(true);
            });
        });

        // Refresh button
        const refreshButton = nativeHtml.querySelector('.refresh-notes-button');
        if (refreshButton) {
            const newButton = refreshButton.cloneNode(true);
            refreshButton.parentNode?.replaceChild(newButton, refreshButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._refreshData();
                this.render(this.element);
            });
        }

        // Search filter
        const searchInput = nativeHtml.querySelector('.notes-search-input');
        if (searchInput) {
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            newInput.addEventListener('input', (event) => {
                this.filters.search = event.target.value;
                this._applyFilters(nativeHtml);
            });
        }
        const clearSearchButton = nativeHtml.querySelector('.clear-notes-search');
        if (clearSearchButton) {
            const newClear = clearSearchButton.cloneNode(true);
            clearSearchButton.parentNode?.replaceChild(newClear, clearSearchButton);
            newClear.addEventListener('click', (event) => {
                event.preventDefault();
                this.filters.search = '';
                this.filters.tags = [];
                const input = nativeHtml.querySelector('.notes-search-input');
                if (input) {
                    input.value = '';
                }
                this.render(this.element);
            });
        }

            // Tag filter
            nativeHtml.querySelectorAll('.tag-item').forEach(tag => {
                const newTag = tag.cloneNode(true);
                tag.parentNode?.replaceChild(newTag, tag);
                newTag.addEventListener('click', (event) => {
                    const tagName = event.currentTarget.dataset.tag?.toUpperCase();
                    if (!this.filters.tags) {
                        this.filters.tags = [];
                    }
                    const index = this.filters.tags.indexOf(tagName);
                    if (index > -1) {
                        this.filters.tags.splice(index, 1);
                    } else {
                        this.filters.tags.push(tagName);
                    }
                    this._applyFilters(nativeHtml);
                });
            });

        // Tag cloud toggle
        const tagToggle = nativeHtml.querySelector('.tag-filter-toggle');
        if (tagToggle) {
            const newToggle = tagToggle.cloneNode(true);
            tagToggle.parentNode?.replaceChild(newToggle, tagToggle);
            newToggle.addEventListener('click', (event) => {
                const tagCloud = nativeHtml.querySelector('.tag-cloud');
                if (tagCloud) {
                    tagCloud.classList.toggle('collapsed');
                    newToggle.classList.toggle('fa-chevron-down');
                    newToggle.classList.toggle('fa-chevron-up');
                }
            });
        }

        const toggleFiltersButton = nativeHtml.querySelector('.toggle-notes-filters-button');
        if (toggleFiltersButton) {
            const newToggle = toggleFiltersButton.cloneNode(true);
            toggleFiltersButton.parentNode?.replaceChild(newToggle, toggleFiltersButton);
            newToggle.addEventListener('click', (event) => {
                event.preventDefault();
                this.filtersOpen = !this.filtersOpen;
                this.render(this.element);
            });
        }

        // Scene filter
        const sceneFilter = nativeHtml.querySelector('.scene-filter-select');
        if (sceneFilter) {
            const newSelect = sceneFilter.cloneNode(true);
            sceneFilter.parentNode?.replaceChild(newSelect, sceneFilter);
            newSelect.addEventListener('change', (event) => {
                this.filters.scene = event.target.value;
                this._applyFilters(nativeHtml);
            });
        }

        // Visibility filter
        const visibilityFilter = nativeHtml.querySelector('.visibility-filter-select');
        if (visibilityFilter) {
            const newSelect = visibilityFilter.cloneNode(true);
            visibilityFilter.parentNode?.replaceChild(newSelect, visibilityFilter);
            newSelect.addEventListener('change', (event) => {
                this.filters.visibility = event.target.value;
                this._applyFilters(nativeHtml);
            });
        }

        // Note actions
        nativeHtml.querySelectorAll('.note-edit').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                try {
                    const page = await foundry.utils.fromUuid(uuid);
                    if (!page) {
                        ui.notifications.error('Note not found.');
                        return;
                    }
                    
                    // Load note data from the page
                    const tags = page.getFlag(MODULE.ID, 'tags') || [];
                    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                    const authorId = page.getFlag(MODULE.ID, 'authorId');
                    const sceneId = page.getFlag(MODULE.ID, 'sceneId');
                    const x = page.getFlag(MODULE.ID, 'x');
                    const y = page.getFlag(MODULE.ID, 'y');
                    const timestamp = page.getFlag(MODULE.ID, 'timestamp') || null;
                    const authorName = authorId
                        ? (game.users.get(authorId)?.name || game.users.find(u => u.id === authorId)?.name || authorId)
                        : 'Unknown';
                    
                    // Get page content
                    const content = page.text?.content || '';
                    
                    // Create note object for form
                    const noteData = {
                        pageId: page.id,
                        pageUuid: page.uuid,
                        title: page.name || 'Untitled Note',
                        content: content,
                        authorName: authorName,
                        timestamp: timestamp,
                        tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []),
                        visibility: visibility,
                        sceneId: sceneId,
                        x: x,
                        y: y,
                        authorId: authorId
                    };
                    
                    // Open NotesForm with existing note data
                    const form = new NotesForm(noteData);
                    form.render(true);
                } catch (error) {
                    console.error('Error opening note for editing:', error);
                    ui.notifications.error(`Failed to open note: ${error.message}`);
                }
            });
        });

        nativeHtml.querySelectorAll('.note-delete').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                const confirmed = await Dialog.confirm({
                    title: 'Delete Note',
                    content: '<p>Are you sure you want to delete this note?</p>',
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (confirmed) {
                    const page = await foundry.utils.fromUuid(uuid);
                    if (page) {
                        await page.delete();
                        // Refresh the panel using panel manager's element
                        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                        if (panelManager && panelManager.element) {
                            await this._refreshData();
                            this.render(panelManager.element);
                        }
                    }
                }
            });
        });

        nativeHtml.querySelectorAll('.note-pin, .note-unpin').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                // Pin/unpin functionality will be implemented in Phase 5 (Blacksmith Pin API)
                ui.notifications.info('Pin functionality coming in Phase 5');
            });
        });

        // Apply initial filters
        this._applyFilters(nativeHtml);
    }

    /**
     * Apply filters to note cards (DOM-based filtering)
     * @private
     */
    _applyFilters(html) {
        const search = (this.filters.search || '').trim().toLowerCase();
        const selectedTags = (this.filters.tags || []).map(tag => tag.toUpperCase());
        const selectedScene = this.filters.scene || 'all';
        const selectedVisibility = this.filters.visibility || 'all';

        html.querySelectorAll('.note-card').forEach(card => {
            let visible = true;

            // Search filter
            if (search) {
                const text = card.textContent.toLowerCase();
                if (!text.includes(search)) {
                    visible = false;
                }
            }

            // Tag filter
            if (selectedTags.length > 0) {
                const cardTagsStr = card.dataset.tags || '';
                const cardTags = cardTagsStr ? cardTagsStr.split(',').map(t => t.trim().toUpperCase()) : [];
                const hasTag = selectedTags.some(tag => cardTags.includes(tag));
                if (!hasTag) {
                    visible = false;
                }
            }

            // Scene filter
            if (selectedScene !== 'all') {
                const cardScene = card.dataset.scene || 'none';
                if (cardScene !== selectedScene) {
                    visible = false;
                }
            }

            // Visibility filter
            if (selectedVisibility !== 'all') {
                const cardVisibility = card.dataset.visibility || 'private';
                if (cardVisibility !== selectedVisibility) {
                    visible = false;
                }
            }

            // Show/hide card
            card.style.display = visible ? '' : 'none';
        });

        // Update tag active states
        html.querySelectorAll('.tag-item').forEach(tag => {
            const tagName = tag.dataset.tag?.toUpperCase();
            if (tagName && selectedTags.includes(tagName)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
    }

    
    /**
     * Opens the native Foundry journal page for editing instead of embedding an editor
     * @param {jQuery} html - The panel HTML element
     * @param {JournalEntry} journal - The journal document
     * @param {JournalEntryPage} page - The journal page to edit
     * @private
     */
    async _embedEditor(html, journal, page) {
        try {
            if (!journal || !page) return null;
            
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeHtml = html;
            if (html && (html.jquery || typeof html.find === 'function')) {
                nativeHtml = html[0] || html.get?.(0) || html;
            }
            
            // Get the content container
            const contentContainer = nativeHtml.querySelector('.journal-content');
            if (!contentContainer) return;
            
            // Open the native journal sheet directly to this page
            if (page.sheet) {
                page.sheet.render(true);
            } else {
                journal.sheet.render(true, {pageId: page.id});
            }
            
            // Note: Journal updates are now handled centrally by HookManager
            // No need to register local hooks here
            
            return true;
        } catch (error) {
            console.error('Error opening journal page:', error);
            ui.notifications.error("Error opening journal page: " + error.message);
            return null;
        }
    }
}

/**
 * NotesForm - Lightweight form for quick note capture
 * Uses FormApplication for simplicity (like CodexForm)
 */
export class NotesForm extends FormApplication {
    constructor(note = null, options = {}) {
        super(note, options);
        // If note has pageId/pageUuid, it's an existing note being edited
        this.isEditing = !!(note?.pageId || note?.pageUuid);
        this.pageId = note?.pageId || null;
        this.pageUuid = note?.pageUuid || null;
        this.note = note || this._getDefaultNote();
        this.dragActive = false;
        this._eventHandlers = [];
        
        // If options contain canvas location, pre-fill it
        if (options.sceneId) {
            this.note.sceneId = options.sceneId;
            this.note.x = options.x || null;
            this.note.y = options.y || null;
        }
    }

    static get defaultOptions() {
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'notesWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = saved.width ?? 600;
        const height = saved.height ?? 560;
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);

        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'notes-quick-form',
            classes: ['notes-form-window', 'squire-window'],
            title: 'New Note', // Will be updated in getData if editing
            template: 'modules/coffee-pub-squire/templates/notes-form.hbs',
            width,
            height,
            top,
            left,
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false,
            minimizable: true
        });
    }
    
    get title() {
        return this.isEditing ? `Edit Note: ${this.note.title || 'Untitled'}` : 'New Note';
    }

    getData() {
        // Update window title
        if (this.isEditing) {
            this.options.title = `Edit Note: ${this.note.title || 'Untitled'}`;
        } else {
            this.options.title = 'New Note';
        }

        const tagsText = Array.isArray(this.note.tags)
            ? this.note.tags.join(', ')
            : (typeof this.note.tags === 'string' ? this.note.tags : '');
        const headerImageMatch = (this.note.content || '').match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        const headerImage = headerImageMatch ? headerImageMatch[1] : null;

        return {
            note: {
                ...this.note,
                tagsText,
                headerImage
            },
            isGM: game.user.isGM,
            isEditing: this.isEditing,
            sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name : null
        };
    }

    _getDefaultNote() {
        return {
            title: '',
            content: '',
            authorName: game.user?.name || 'Unknown',
            timestamp: null,
            tags: [],
            visibility: 'party',
            sceneId: null,
            x: null,
            y: null
        };
    }

    _buildNoteOwnership(visibility, authorId) {
        const ownership = {
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
        };
        if (visibility === 'party') {
            game.users.forEach(user => {
                if (!user.isGM) {
                    ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                }
            });
            if (authorId && !ownership[authorId]) {
                ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        } else if (authorId) {
            ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
        return ownership;
    }

    async _syncNoteOwnership(page, visibility, authorId) {
        if (!page) return;
        if (game.user.isGM) {
            const ownership = this._buildNoteOwnership(visibility, authorId);
            await page.update({ ownership });
            return;
        }

        const blacksmith = getBlacksmith();
        if (blacksmith?.sockets?.emit) {
            await blacksmith.sockets.emit('squire:updateNoteOwnership', {
                pageUuid: page.uuid,
                visibility,
                authorId
            });
        } else {
            ui.notifications.warn('Socket manager is not ready. Ownership sync will occur when a GM saves.');
        }
    }

    setPosition(options={}) {
        const minWidth = 420;
        const minHeight = 420;
        if (options.width && options.width < minWidth) options.width = minWidth;
        if (options.height && options.height < minHeight) options.height = minHeight;

        if (options.top !== undefined || options.left !== undefined) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const windowWidth = options.width || this.position.width || 600;
            const windowHeight = options.height || this.position.height || 560;

            if (options.left !== undefined) {
                options.left = Math.max(0, Math.min(options.left, viewportWidth - windowWidth));
            }
            if (options.top !== undefined) {
                options.top = Math.max(0, Math.min(options.top, viewportHeight - windowHeight));
            }
        }

        const pos = super.setPosition(options);
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'notesWindowPosition', { top, left, width, height });
        }
        return pos;
    }

    async _updateObject(event, formData) {
        // Get selected journal from settings
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No notes journal selected. Please select a journal in module settings.');
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected notes journal not found.');
            return;
        }

        // Convert tags to array
        let tags = [];
        if (formData.tags) {
            tags = formData.tags.split(',')
                .map(t => t.trim())
                .filter(t => t)
                .map(t => t.toUpperCase());
        }

        // Ensure visibility is set - check form directly if not in formData
        let visibility = formData.visibility;
        if (!visibility || (visibility !== 'party' && visibility !== 'private')) {
            // Try to get it from the form element directly
            const form = getNativeElement(this.element)?.querySelector('form');
            if (form) {
                const visibilityToggle = form.querySelector('#notes-visibility-private');
                if (visibilityToggle) {
                    visibility = visibilityToggle.checked ? 'private' : 'party';
                    console.log('NotesForm._updateObject: Got visibility from toggle:', visibility);
                } else {
                    const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
                    if (visibilityRadio) {
                        visibility = visibilityRadio.value;
                        console.log('NotesForm._updateObject: Got visibility from form radio:', visibility);
                    } else {
                        console.warn('NotesForm._updateObject: No checked visibility input found, defaulting to private');
                        visibility = 'private';
                    }
                }
            } else {
                console.warn('NotesForm._updateObject: No form found, defaulting to private');
                visibility = 'private';
            }
        }
        
        // Final check - ensure it's either 'party' or 'private'
        visibility = visibility === 'party' ? 'party' : 'private';
        console.log('NotesForm._updateObject: Final visibility =', visibility, 'formData.visibility =', formData.visibility, 'formData keys:', Object.keys(formData));

        // Generate HTML content (note body only, no metadata)
        const content = this._generateNoteContent(formData);

        try {
            let page;
            
            if (this.isEditing && this.pageUuid) {
                // Editing existing note - update it
                try {
                    page = await foundry.utils.fromUuid(this.pageUuid);
                    if (!page) {
                        ui.notifications.error('Note not found.');
                        return false;
                    }
                    
                    // Check permissions
                    if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                        ui.notifications.error('You do not have permission to edit this note.');
                        return false;
                    }
                    
                    // Update the page
                    await page.update({
                        name: formData.title || 'Untitled Note',
                        text: { content: content }
                    });
                    
                    // Update flags
                    await page.setFlag(MODULE.ID, 'tags', tags);
                    await page.setFlag(MODULE.ID, 'visibility', visibility);
                    const existingEditors = page.getFlag(MODULE.ID, 'editorIds') || [];
                    const editorIds = Array.isArray(existingEditors) ? [...new Set([...existingEditors, game.user.id])] : [game.user.id];
                    await page.setFlag(MODULE.ID, 'editorIds', editorIds);
                    if (formData.sceneId) {
                        await page.setFlag(MODULE.ID, 'sceneId', formData.sceneId);
                        await page.setFlag(MODULE.ID, 'x', formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null);
                        await page.setFlag(MODULE.ID, 'y', formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null);
                    }
                    
                    console.log('NotesForm: Updated existing note', { pageId: page.id, flags: page.getFlag(MODULE.ID) });
                    const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                    await this._syncNoteOwnership(page, visibility, authorId);
                } catch (error) {
                    console.error('Error updating note:', error);
                    ui.notifications.error(`Failed to update note: ${error.message}`);
                    return false;
                }
            } else {
                // Creating new note
                // Check if user has permission to create pages in this journal
                // Users need at least OBSERVER permission to create embedded documents
                if (!journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
                    ui.notifications.error('You do not have permission to create notes in this journal. Please contact your GM.');
                    return false;
                }

                // Create journal page with flags
                const pageData = {
                    name: formData.title || 'Untitled Note',
                    type: 'text',
                    text: {
                        content: content
                    },
                    flags: {
                        [MODULE.ID]: {
                            noteType: 'sticky',
                            tags: tags,
                            visibility: visibility,
                            editorIds: [game.user.id],
                            sceneId: formData.sceneId || null,
                            x: formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null,
                            y: formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null,
                            authorId: game.user.id,
                            timestamp: new Date().toISOString()
                        }
                    }
                };

                // Create journal page
                const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                page = newPage;

                // Verify the flag was saved correctly
                const savedVisibility = page.getFlag(MODULE.ID, 'visibility');
                console.log('NotesForm: Page created, saved visibility flag:', savedVisibility, 'expected:', visibility);

                const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                await this._syncNoteOwnership(page, visibility, authorId);
            }

            // If canvas location provided, register pin with Blacksmith (if available)
            // Only for new notes (editing doesn't change pin location)
            if (!this.isEditing && formData.sceneId && formData.x !== null && formData.y !== null) {
                const blacksmith = getBlacksmith();
                if (blacksmith?.PinAPI) {
                    try {
                        blacksmith.PinAPI.createPin({
                            type: 'note',
                            uuid: page.uuid,
                            x: parseFloat(formData.x),
                            y: parseFloat(formData.y),
                            sceneId: formData.sceneId,
                            config: {
                                icon: 'fa-sticky-note',
                                color: 0xFFFF00
                            },
                            onClick: () => {
                                // Open note form for editing
                                const form = new NotesForm({
                                    pageId: page.id,
                                    pageUuid: page.uuid,
                                    title: page.name,
                                    content: page.text?.content || '',
                                    tags: page.getFlag(MODULE.ID, 'tags') || [],
                                    visibility: page.getFlag(MODULE.ID, 'visibility') || 'private',
                                    sceneId: formData.sceneId,
                                    x: formData.x,
                                    y: formData.y
                                });
                                form.render(true);
                            }
                        });
                    } catch (error) {
                        console.warn('Could not create Blacksmith pin:', error);
                        // Continue - pin is optional
                    }
                }
            }

            ui.notifications.info(`Note "${formData.title || 'Untitled Note'}" ${this.isEditing ? 'updated' : 'saved'} successfully.`);
            this.close();
            
            // Refresh notes panel if it exists
            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (panelManager?.notesPanel && panelManager.element) {
                await panelManager.notesPanel._refreshData();
                panelManager.notesPanel.render(panelManager.element);
            }
            
            return true;
        } catch (error) {
            console.error('Error saving note:', error);
            ui.notifications.error(`Failed to save note: ${error.message}`);
            return false;
        }
    }

    _generateNoteContent(formData) {
        return formData.content || '';
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Handle cancel button
        const cancelButton = nativeHtml.querySelector('button.cancel');
        if (cancelButton) {
            const handler = () => this.close();
            cancelButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: cancelButton, event: 'click', handler });
        }

        // Handle form submission - prevent default FormApplication behavior
        const form = nativeHtml.querySelector('form');
        if (form) {
            const handler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', handler);
            this._eventHandlers.push({ element: form, event: 'submit', handler });
        }

        // Set up tag autocomplete (simple - just show existing tags)
        this._setupTagAutocomplete(nativeHtml);
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target.closest('form') || event.target;
        if (this._saveEditor) {
            await this._saveEditor('content');
        } else if (this._saveEditors) {
            await this._saveEditors();
        } else if (this.editors?.content?.save) {
            await this.editors.content.save();
        }
        const formData = new FormData(form);
        
        // Convert FormData to object
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        const visibilityToggle = form.querySelector('#notes-visibility-private');
        if (visibilityToggle) {
            data.visibility = visibilityToggle.checked ? 'private' : 'party';
        } else {
            const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
            if (visibilityRadio) {
                data.visibility = visibilityRadio.value;
                console.log('NotesForm._handleFormSubmit: Found checked radio:', visibilityRadio.value);
            } else {
                const allRadios = form.querySelectorAll('input[name="visibility"]');
                console.warn('NotesForm._handleFormSubmit: No checked radio found! Available radios:', Array.from(allRadios).map(r => ({ value: r.value, checked: r.checked })));
                data.visibility = 'private';
            }
        }

        // Debug: Log visibility value to help diagnose issues
        console.log('NotesForm._handleFormSubmit: Final visibility value:', data.visibility, 'All formData:', data);

        // Call _updateObject
        await this._updateObject(event, data);
    }

    _setupTagAutocomplete(html) {
        // Simple tag autocomplete - just show existing tags from notes journal
        const tagsInput = html.querySelector('input[name="tags"]');
        if (!tagsInput) return;

        // Get existing tags from notes journal
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') return;

        const journal = game.journal.get(journalId);
        if (!journal) return;

        const existingTags = new Set();
        for (const page of journal.pages.contents) {
            const flags = page.getFlag(MODULE.ID, 'tags');
            if (Array.isArray(flags)) {
                flags.forEach(tag => existingTags.add(tag));
            }
        }

        // Show tag suggestions (simple - could be enhanced later)
        const suggestionsDiv = html.querySelector('.tag-suggestions');
        if (suggestionsDiv && existingTags.size > 0) {
            const tagsArray = Array.from(existingTags).sort().slice(0, 20);
            const tagChips = tagsArray.map(tag => `<span class="common-tag" data-tag="${tag}">${tag}</span>`).join('');
            suggestionsDiv.innerHTML = `<small>Common Tags:</small><div class="common-tags">${tagChips}</div>`;

            suggestionsDiv.querySelectorAll('.common-tag').forEach(tagEl => {
                const handler = () => {
                    const tag = tagEl.dataset.tag;
                    if (!tag) return;
                    const current = (tagsInput.value || '')
                        .split(',')
                        .map(t => t.trim())
                        .filter(t => t);
                    const exists = current.some(t => t.toLowerCase() === tag.toLowerCase());
                    if (!exists) {
                        current.push(tag);
                        tagsInput.value = current.join(', ');
                        tagsInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };
                tagEl.addEventListener('click', handler);
                this._eventHandlers.push({ element: tagEl, event: 'click', handler });
            });
        }
    }
}
