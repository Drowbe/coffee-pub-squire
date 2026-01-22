import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getNativeElement, renderTemplate, getTextEditor } from './helpers.js';
import {
    PERMISSION_LEVELS,
    userCanAccessPage,
    showJournalPicker,
    showPagePicker,
    renderJournalContent
} from './utility-journal.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class NotesPanel {
    constructor() {
        this.element = null;
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

        // Get the selected journal ID - now using notesJournal (new system)
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        
        const journal = journalId !== 'none' ? game.journal.get(journalId) : null;

        // Get the selected page ID (defaulting to the first page if not set)
        const globalPageId = game.settings.get(MODULE.ID, 'notesSharedJournalPage');
        
        // Check for user-specific page preference (for non-GM users)
        const userPageId = !game.user.isGM ? game.user.getFlag(MODULE.ID, 'userSelectedJournalPage') : null;
        
        // Use user-specific page if available, otherwise fall back to global
        const pageId = userPageId || globalPageId;
        
        let page = null;
        let pages = [];
        let canViewJournal = false;
        
        if (journal) {
            // Check if the user can at least observe the journal
            canViewJournal = game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER);

            if (canViewJournal && journal.pages.size > 0) {
                // Filter pages based on user permissions
                const accessiblePages = journal.pages.contents.filter(p => {
                    // GMs can see all pages
                    if (game.user.isGM) return true;
                    
                    // Get the effective permission for this page for this user
                    return userCanAccessPage(p, game.user, PERMISSION_LEVELS);
                });
                
                // Get all accessible pages for the dropdown
                pages = accessiblePages.map(p => ({
                    id: p.id,
                    name: p.name
                }));
                
                // Check if selected page is accessible, otherwise try to find first accessible page
                if (pageId && pageId !== 'none' && journal.pages.has(pageId)) {
                    const selectedPage = journal.pages.get(pageId);
                    
                    // Check if user can access this page
                    const canAccess = game.user.isGM || userCanAccessPage(selectedPage, game.user, PERMISSION_LEVELS);
                                    
                    if (canAccess) {
                        page = selectedPage;
                    } else if (accessiblePages.length > 0) {
                        // Selected page is not accessible, use first accessible page
                        page = accessiblePages[0];
                        // Update the setting if user is GM
                        if (game.user.isGM) {
                            await game.settings.set(MODULE.ID, 'notesSharedJournalPage', page.id);
                        } else {
                            // Update user flag for non-GM users
                            await game.user.setFlag(MODULE.ID, 'userSelectedJournalPage', page.id);
                        }
                    }
                } else if (accessiblePages.length > 0) {
                    // No page selected or invalid page ID, use first accessible page
                    page = accessiblePages[0];
                    // Save this as the selected page if GM
                    if (game.user.isGM && (!pageId || !journal.pages.has(pageId))) {
                        await game.settings.set(MODULE.ID, 'notesSharedJournalPage', page.id);
                    } else if (!game.user.isGM) {
                        // For non-GM users, update their flag
                        await game.user.setFlag(MODULE.ID, 'userSelectedJournalPage', page.id);
                    }
                }
            }
        }

        // If journal ID exists but journal doesn't, reset to 'none'
        if (journalId !== 'none' && !journal && game.user.isGM) {
            await game.settings.set(MODULE.ID, 'notesJournal', 'none');
            ui.notifications.warn("The previously selected notes journal no longer exists. Please select a new one.");
        }



        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            page: page,
            pages: pages,
            pageName: page?.name || '',
            hasPages: pages.length > 1, // Only show selector if more than one page
            hasPermissionIssue: !!journal && !canViewJournal,
            canEditPage: page ? (game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER)) : false,
            isGM: game.user.isGM,
            position: "left" // Hard-code position for now as it's always left in current implementation
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        notesContainer.innerHTML = html;

        this.activateListeners(notesContainer, journal, page);
    }

    activateListeners(html, journal, page) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Add event listeners for notes panel here
        const characterSheetToggle = nativeHtml.querySelector('.character-sheet-toggle');
        if (characterSheetToggle) {
            // Clone to remove existing listeners
            const newToggle = characterSheetToggle.cloneNode(true);
            characterSheetToggle.parentNode?.replaceChild(newToggle, characterSheetToggle);
            
            newToggle.addEventListener('click', async (event) => {
                event.preventDefault();
                
                // Open the current actor's character sheet when the toggle is clicked
                const actor = game.user.character || canvas.tokens?.controlled[0]?.actor;
                if (actor) {
                    actor.sheet.render(true);
                } else {
                    ui.notifications.warn("No character selected. Please select a token first.");
                }
            });
        }

        // Open journal button
        const openJournalButton = nativeHtml.querySelector('.open-journal-button');
        if (openJournalButton) {
            // Clone to remove existing listeners
            const newButton = openJournalButton.cloneNode(true);
            openJournalButton.parentNode?.replaceChild(newButton, openJournalButton);
            
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                
                if (journal) {
                    if (page) {
                        // Open directly to the selected page if we have one
                        journal.sheet.render(true, {pageId: page.id});
                    } else {
                        journal.sheet.render(true);
                    }
                } else {
                    ui.notifications.warn("No journal selected. Please select a journal in the module settings.");
                }
            });
        }

        // Edit page button (for owners)
        const editPageButton = nativeHtml.querySelector('.edit-page-button');
        if (editPageButton) {
            // Clone to remove existing listeners
            const newButton = editPageButton.cloneNode(true);
            editPageButton.parentNode?.replaceChild(newButton, editPageButton);
            
            newButton.addEventListener('click', async (event) => {
            event.preventDefault();

            if (journal && page) {
                // Check if user can edit this page
                const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);

                if (canEdit) {
                    // Use our helper method to embed the editor
                    await this._embedEditor(html, journal, page);
                } else {
                    ui.notifications.warn("You don't have permission to edit this page.");
                }
            }
            });
        }
        
        // Toggle edit mode button
        const toggleEditModeButton = nativeHtml.querySelector('.toggle-edit-mode-button');
        if (toggleEditModeButton) {
            // Clone to remove existing listeners
            const newButton = toggleEditModeButton.cloneNode(true);
            toggleEditModeButton.parentNode?.replaceChild(newButton, toggleEditModeButton);
            
            newButton.addEventListener('click', async (event) => {
            event.preventDefault();
            
            if (journal && page) {
                // Check if user can edit this page
                const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
                
                if (canEdit) {
                    // Use our helper method to embed the editor
                    await this._embedEditor(html, journal, page);
                } else {
                    ui.notifications.warn("You don't have permission to edit this page.");
                }
            }
            });
        }
        
        // Set journal button (GM only) - Now sets notesJournal for new Notes system
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.set-journal-button, .set-journal-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                
                // Show journal picker dialog for GMs
                if (game.user.isGM) {
                    showJournalPicker({
                        title: 'Select Journal for Notes',
                        getCurrentId: () => game.settings.get(MODULE.ID, 'notesJournal'),
                        onSelect: async (journalId) => {
                            await game.settings.set(MODULE.ID, 'notesJournal', journalId);
                            
                            // Verify journal ownership
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

        // Toggle persistent journal button removed - now using notesJournal setting directly
        // (Old functionality removed as part of replacing old system)

        // Page selection dropdown
        // v13: Use nativeHtml instead of html
        const pageSelect = nativeHtml.querySelector('.page-select');
        if (pageSelect) {
            const newSelect = pageSelect.cloneNode(true);
            pageSelect.parentNode?.replaceChild(newSelect, pageSelect);
            newSelect.addEventListener('change', async (event) => {
                const pageId = event.currentTarget.value;
                
                if (pageId === 'browse-pages') {
                    if (game.user.isGM) {
                        showPagePicker(journal, {
                            onSelect: async (pid) => {
                                await game.settings.set(MODULE.ID, 'notesSharedJournalPage', pid);
                            },
                            reRender: () => this.render(this.element)
                        });
                    }
                    return;
                }
                
                // If we have an active editor, ask if they want to close it
                if (this.journalSheet) {
                    // Ask the user if they want to switch away from editing
                    let confirmSwitch = await Dialog.confirm({
                        title: "Switch Page While Editing?",
                        content: "<p>You're currently editing a page. Switching to another page will close the editor.</p><p>Any changes you've made will be saved automatically.</p>",
                        yes: () => true,
                        no: () => false,
                        defaultYes: true
                    });
                    
                    if (!confirmSwitch) {
                        // Reset the dropdown to current page
                        newSelect.value = page.id;
                        return;
                    }
                    
                    // Close the editor
                    this.journalSheet.close();
                    this.journalSheet = null;
                }
            
                if (game.user.isGM) {
                // Save the selected page globally for all users if GM
                await game.settings.set(MODULE.ID, 'notesSharedJournalPage', pageId);
            } else {
                // For players, just update locally
                game.user.setFlag(MODULE.ID, 'userSelectedJournalPage', pageId);
            }
            
            // Re-render the notes panel
            this.render(this.element);
            });
        }

        // If we have a journal and a page, render the page content
        if (journal && page) {
            renderJournalContent(nativeHtml, page, { journal, permLevels: PERMISSION_LEVELS });
        }

        // Inline edit toggle (for text pages)
        // v13: Use nativeHtml instead of html
        const inlineEditToggle = nativeHtml.querySelector('.inline-edit-toggle');
        if (inlineEditToggle) {
            const newToggle = inlineEditToggle.cloneNode(true);
            inlineEditToggle.parentNode?.replaceChild(newToggle, inlineEditToggle);
            newToggle.addEventListener('click', async (event) => {
                event.preventDefault();

                if (journal && page && page.type === 'text') {
                    const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);

                    if (canEdit) {
                        // Use our helper method to embed the editor
                        await this._embedEditor(nativeHtml, journal, page);
                    } else {
                        ui.notifications.warn("You don't have permission to edit this page.");
                    }
                }
            });
        }

        // Save edit button - now just triggers the done button 
        // v13: Use nativeHtml instead of html
        const saveEditButton = nativeHtml.querySelector('.save-edit-button');
        if (saveEditButton) {
            const newButton = saveEditButton.cloneNode(true);
            saveEditButton.parentNode?.replaceChild(newButton, saveEditButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                
                // If we have an active editor, trigger the done button
                if (this.journalSheet) {
                    const doneButton = nativeHtml.querySelector('.done-embedded-edit');
                    if (doneButton) doneButton.click();
                } else if (journal && page) {
                    const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
                    if (canEdit) {
                        await this._embedEditor(nativeHtml, journal, page);
                    }
                }
            });
        }

        // Cancel edit button 
        // v13: Use nativeHtml instead of html
        const cancelEditButton = nativeHtml.querySelector('.cancel-edit-button');
        if (cancelEditButton) {
            const newButton = cancelEditButton.cloneNode(true);
            cancelEditButton.parentNode?.replaceChild(newButton, cancelEditButton);
            newButton.addEventListener('click', (event) => {
                event.preventDefault();
                
                // If we have an active editor sheet, close it
                if (this.journalSheet) {
                    this.journalSheet.close();
                    this.journalSheet = null;
                    this.render(this.element);
                } else if (journal && page) {
                    const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
                    if (canEdit) {
                        this._embedEditor(nativeHtml, journal, page);
                    }
                }
            });
        }
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
            
            // Refresh notes panel if it exists (will be implemented in Phase 4)
            // For now, just close the form
            
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
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Convert FormData to object
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
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
