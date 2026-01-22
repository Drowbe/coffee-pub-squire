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

        // Get the selected journal ID
        const persistentJournalId = game.settings.get(MODULE.ID, 'notesPersistentJournal');
        
        // For GMs, they can view a different journal than the persistent one
        const gmJournalId = game.user.isGM ? game.settings.get(MODULE.ID, 'notesGMJournal') : null;
        
        // Determine which journal to display
        // - If user is GM and has a selected journal, use that
        // - Otherwise use the persistent journal
        const journalId = (game.user.isGM && gmJournalId !== 'none') ? gmJournalId : persistentJournalId;
        
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
            await game.settings.set(MODULE.ID, 'notesSharedJournal', 'none');
            await game.settings.set(MODULE.ID, 'notesSharedJournalPage', 'none');
            ui.notifications.warn("The previously selected journal no longer exists. Please select a new one.");
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
            isPersistent: game.user.isGM && persistentJournalId === journalId && journalId !== 'none',
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
        
        // Set journal button (GM only)
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
                        getCurrentId: () => game.settings.get(MODULE.ID, 'notesPersistentJournal'),
                        onSelect: async (journalId) => {
                            await game.settings.set(MODULE.ID, 'notesGMJournal', journalId);
                            ui.notifications.info(`Journal ${journalId === 'none' ? 'selection cleared' : 'selected'}.`);
                        },
                        reRender: () => this.render(this.element),
                        afterSelect: (journalId, j) => showPagePicker(j, {
                            onSelect: async (pageId) => {
                                await game.settings.set(MODULE.ID, 'notesSharedJournalPage', pageId);
                            },
                            reRender: () => this.render(this.element)
                        }),
                        infoHtml: '<p style="margin-bottom: 5px; color: #ddd;"><i class="fa-solid fa-info-circle" style="color: #88f;"></i> As GM, you can select a journal for your own viewing without changing what players see.</p><p style="color: #ddd;">Use the <i class="fa-solid fa-thumbtack" style="color: gold;"></i> button to set what journal players will see.</p>',
                        showRefreshButton: true
                    });
                }
            });
        });

        // Toggle persistent journal (GM only)
        // v13: Use nativeHtml instead of html
        const togglePersistentButton = nativeHtml.querySelector('.toggle-persistent-button');
        if (togglePersistentButton) {
            const newButton = togglePersistentButton.cloneNode(true);
            togglePersistentButton.parentNode?.replaceChild(newButton, togglePersistentButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                
                if (!game.user.isGM) return;
                
                if (!journal) {
                    ui.notifications.warn("No journal selected. Please select a journal first.");
                    return;
                }
                
                // Get current persistent and GM journal IDs
                const persistentJournalId = game.settings.get(MODULE.ID, 'notesPersistentJournal');
                const gmJournalId = game.settings.get(MODULE.ID, 'notesGMJournal');
                
                if (persistentJournalId === journal.id) {
                    // Journal is already persistent, unpin it
                    await game.settings.set(MODULE.ID, 'notesPersistentJournal', 'none');
                    ui.notifications.info(`Journal "${journal.name}" unpinned from players view.`);
                } else {
                    // Make this journal persistent
                    await game.settings.set(MODULE.ID, 'notesPersistentJournal', journal.id);
                    
                    // Also update the GM journal to match
                    await game.settings.set(MODULE.ID, 'notesGMJournal', journal.id);
                    
                    ui.notifications.info(`Journal "${journal.name}" pinned for all players.`);
                }
                
                // Re-render the notes panel
                this.render(this.element);
            });
        }

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
