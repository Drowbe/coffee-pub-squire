import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getNativeElement, renderTemplate, getTextEditor } from './helpers.js';
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
                tags: note.tags || [] // Ensure tags is always an array
            })),
            allTags: Array.from(this.allTags).sort(),
            scenes: Array.from(this.scenes).sort(),
            filters: this.filters,
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

        // New Note button
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

            // Tag filter
            nativeHtml.querySelectorAll('.tag-item').forEach(tag => {
                const newTag = tag.cloneNode(true);
                tag.parentNode?.replaceChild(newTag, tag);
                newTag.addEventListener('click', (event) => {
                    const tagName = event.currentTarget.dataset.tag;
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
                const page = await foundry.utils.fromUuid(uuid);
                if (page) {
                    page.sheet.render(true);
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
        const selectedTags = this.filters.tags || [];
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
                const cardTags = cardTagsStr ? cardTagsStr.split(',').map(t => t.trim()) : [];
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
            const tagName = tag.dataset.tag;
            if (selectedTags.includes(tagName)) {
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
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'notes-quick-form',
            classes: ['notes-form'],
            title: 'New Note',
            template: 'modules/coffee-pub-squire/templates/notes-form.hbs',
            width: 500,
            height: 'auto',
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        });
    }

    getData() {
        return {
            note: this.note,
            isGM: game.user.isGM,
            sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name : null
        };
    }

    _getDefaultNote() {
        return {
            title: '',
            content: '',
            img: null,
            tags: [],
            visibility: 'private',
            sceneId: null,
            x: null,
            y: null
        };
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
            tags = formData.tags.split(',').map(t => t.trim()).filter(t => t);
        }

        // Generate HTML content (note body only, no metadata)
        const content = this._generateNoteContent(formData);

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
                    visibility: formData.visibility || 'private',
                    sceneId: formData.sceneId || null,
                    x: formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null,
                    y: formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null,
                    authorId: game.user.id,
                    timestamp: new Date().toISOString()
                }
            }
        };

        try {
            // Create journal page
            const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);

            // Set ownership based on visibility
            const ownership = {};
            if (formData.visibility === 'party') {
                // Party note: author = Owner, all players = Observer
                ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
            } else {
                // Private note: author = Owner, others = None (GM can see via journal ownership)
                ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
            }
            await newPage.update({ ownership });

            // If canvas location provided, register pin with Blacksmith (if available)
            if (formData.sceneId && formData.x !== null && formData.y !== null) {
                const blacksmith = getBlacksmith();
                if (blacksmith?.PinAPI) {
                    try {
                        blacksmith.PinAPI.createPin({
                            type: 'note',
                            uuid: newPage.uuid,
                            x: parseFloat(formData.x),
                            y: parseFloat(formData.y),
                            sceneId: formData.sceneId,
                            config: {
                                icon: 'fa-sticky-note',
                                color: 0xFFFF00
                            },
                            onClick: () => {
                                // Open note in panel (will be implemented in Phase 4)
                                // For now, just open the journal
                                journal.sheet.render(true, { pageId: newPage.id });
                            }
                        });
                    } catch (error) {
                        console.warn('Could not create Blacksmith pin:', error);
                        // Continue - pin is optional
                    }
                }
            }

            ui.notifications.info(`Note "${formData.title || 'Untitled Note'}" saved successfully.`);
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
        let content = '';

        // Add image if present
        if (formData.img) {
            content += `<img src="${formData.img}" alt="${formData.title || 'Note image'}">\n\n`;
        }

        // Add note content (markdown/HTML)
        if (formData.content) {
            content += formData.content;
        }

        return content;
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

        // Handle form submission
        const form = nativeHtml.querySelector('form');
        if (form) {
            const handler = (event) => {
                event.preventDefault();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', handler);
            this._eventHandlers.push({ element: form, event: 'submit', handler });
        }

        // Set up image paste/drag
        this._setupImagePaste(nativeHtml);
        
        // Set up tag autocomplete (simple - just show existing tags)
        this._setupTagAutocomplete(nativeHtml);
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target.closest('form') || event.target;
        const formData = new FormData(form);
        
        // Convert FormData to object
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Explicitly get the checked visibility radio button value
        // FormData should include it, but let's be explicit to ensure it's captured
        const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
        if (visibilityRadio) {
            data.visibility = visibilityRadio.value;
        } else {
            // Default to private if no radio is checked (shouldn't happen, but safety)
            data.visibility = 'private';
        }

        // Call _updateObject
        await this._updateObject(event, data);
    }

    _setupImagePaste(html) {
        // Image drop zone
        const imageDropZone = html.querySelector('.notes-image-drop-zone');
        if (imageDropZone) {
            const newDropZone = imageDropZone.cloneNode(true);
            imageDropZone.parentNode?.replaceChild(newDropZone, imageDropZone);

            // Drag handlers
            const dragEnter = (e) => {
                e.preventDefault();
                e.stopPropagation();
                newDropZone.classList.add('drag-active');
            };

            const dragLeave = (e) => {
                e.preventDefault();
                e.stopPropagation();
                newDropZone.classList.remove('drag-active');
            };

            const dragOver = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
            };

            const drop = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                newDropZone.classList.remove('drag-active');

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    await this._handleImageFile(files[0], html);
                }
            };

            newDropZone.addEventListener('dragenter', dragEnter);
            newDropZone.addEventListener('dragleave', dragLeave);
            newDropZone.addEventListener('dragover', dragOver);
            newDropZone.addEventListener('drop', drop);

            this._eventHandlers.push(
                { element: newDropZone, event: 'dragenter', handler: dragEnter },
                { element: newDropZone, event: 'dragleave', handler: dragLeave },
                { element: newDropZone, event: 'dragover', handler: dragOver },
                { element: newDropZone, event: 'drop', handler: drop }
            );
        }

        // Paste handler on content textarea
        const contentTextarea = html.querySelector('textarea[name="content"]');
        if (contentTextarea) {
            const pasteHandler = async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;

                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        e.preventDefault();
                        const file = items[i].getAsFile();
                        await this._handleImageFile(file, html);
                        break;
                    }
                }
            };

            contentTextarea.addEventListener('paste', pasteHandler);
            this._eventHandlers.push({ element: contentTextarea, event: 'paste', handler: pasteHandler });
        }

        // File input for manual image selection
        const fileInput = html.querySelector('input[type="file"]');
        const browseButton = html.querySelector('button[onclick*="image-file-input"]');
        
        if (browseButton && fileInput) {
            // Remove inline onclick and set up proper handler
            browseButton.removeAttribute('onclick');
            const handler = () => {
                fileInput.click();
            };
            browseButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: browseButton, event: 'click', handler });
        }
        
        if (fileInput) {
            const changeHandler = async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    await this._handleImageFile(file, html);
                    // Reset input so same file can be selected again
                    e.target.value = '';
                }
            };
            fileInput.addEventListener('change', changeHandler);
            this._eventHandlers.push({ element: fileInput, event: 'change', handler: changeHandler });
        }

        // Remove image button
        const removeImageButton = html.querySelector('.notes-remove-image');
        if (removeImageButton) {
            const handler = () => {
                this.note.img = null;
                const imgInput = html.querySelector('input[name="img"]');
                const imgPreview = html.querySelector('.notes-image-preview');
                const imgSection = html.querySelector('.notes-image-section');
                if (imgInput) {
                    imgInput.value = '';
                }
                if (imgPreview) {
                    imgPreview.src = '';
                }
                if (imgSection) {
                    imgSection.style.display = 'none';
                }
            };
            removeImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: removeImageButton, event: 'click', handler });
        }
    }

    async _handleImageFile(file, html) {
        if (!file.type.startsWith('image/')) {
            ui.notifications.warn('Please select an image file.');
            return;
        }

        try {
            // Use FoundryVTT's /upload endpoint
            // Files are stored in: FoundryVTT/Data/uploads/ (server uploads directory)
            // The path returned is relative to the FoundryVTT data root
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            // Result contains: { url: string, path: string }
            // Path is typically: "uploads/filename.jpg" (relative to Data directory)
            const imagePath = result.url || result.path;

            // Update hidden img input
            const imgInput = html.querySelector('input[name="img"]');
            if (imgInput) {
                imgInput.value = imagePath;
            }

            // Show image preview
            const imgPreview = html.querySelector('.notes-image-preview');
            const imgSection = html.querySelector('.notes-image-section');
            if (imgPreview) {
                imgPreview.src = imagePath;
            }
            if (imgSection) {
                imgSection.style.display = '';
            }

            this.note.img = imagePath;
            ui.notifications.info('Image uploaded successfully.');
        } catch (error) {
            console.error('Error uploading image:', error);
            ui.notifications.error('Failed to upload image: ' + error.message);
        }
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
            const tagsArray = Array.from(existingTags).sort();
            suggestionsDiv.innerHTML = `<small>Existing tags: ${tagsArray.slice(0, 10).join(', ')}${tagsArray.length > 10 ? '...' : ''}</small>`;
        }
    }
}
