import { MODULE, TEMPLATES, SQUIRE } from './const.js';

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
        
        this.element = element;
        const notesContainer = element.find('[data-panel="panel-notes"]');
        if (!notesContainer.length) return;

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
        
        // Define permission levels
        // In Foundry, these are typically:
        // NONE = 0, LIMITED = 1, OBSERVER = 2, OWNER = 3
        const PERMISSION_LEVELS = {
            NONE: 0,
            LIMITED: 1,
            OBSERVER: 2,
            OWNER: 3
        };
        
        if (journal) {
            // Check if the user can at least observe the journal
            canViewJournal = game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER);

            if (canViewJournal && journal.pages.size > 0) {
                // Filter pages based on user permissions
                const accessiblePages = journal.pages.contents.filter(p => {
                    // GMs can see all pages
                    if (game.user.isGM) return true;
                    
                    // Get the effective permission for this page for this user
                    return this._userCanAccessPage(p, game.user, PERMISSION_LEVELS);
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
                    const canAccess = game.user.isGM || this._userCanAccessPage(selectedPage, game.user, PERMISSION_LEVELS);
                                    
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
        notesContainer.html(html);

        this.activateListeners(notesContainer, journal, page);
    }

    /**
     * Checks if a user can access a specific journal page
     * @param {JournalEntryPage} page - The page to check 
     * @param {User} user - The user to check permissions for
     * @param {Object} permLevels - Permission level constants
     * @returns {boolean} Whether the user can access the page
     * @private
     */
    _userCanAccessPage(page, user, permLevels) {
        if (!page || !user) return false;
        
        // GM always has access
        if (user.isGM) return true;
        
        // Get the page's parent journal
        const journal = page.parent;
        if (!journal) return false;
        
        // Check direct user permissions on the page
        const pagePermission = page.testUserPermission(user, permLevels.OBSERVER);
        if (pagePermission) return true;
        
        // If page has explicit permissions that deny access, don't inherit from journal
        if (page.ownership[user.id] === permLevels.NONE ||
            (page.ownership.default === permLevels.NONE && !page.ownership[user.id])) {
            return false;
        }
        
        // Check if page should inherit from journal (no specific permissions)
        const hasSpecificPermissions = Object.keys(page.ownership).some(id => 
            id !== "default" && id !== user.id
        );
        
        // If no specific permissions are set, inherit from journal
        if (!hasSpecificPermissions || page.ownership.default === 0) {
            return journal.testUserPermission(user, permLevels.OBSERVER);
        }
        
        return false;
    }

    activateListeners(html, journal, page) {
        // Define permission levels
        const PERMISSION_LEVELS = {
            NONE: 0,
            LIMITED: 1,
            OBSERVER: 2,
            OWNER: 3
        };
        
        // Add event listeners for notes panel here
        html.find('.character-sheet-toggle').click(async (event) => {
            event.preventDefault();
            
            // Open the current actor's character sheet when the toggle is clicked
            const actor = game.user.character || canvas.tokens?.controlled[0]?.actor;
            if (actor) {
                actor.sheet.render(true);
            } else {
                ui.notifications.warn("No character selected. Please select a token first.");
            }
        });

        // Open journal button
        html.find('.open-journal-button').click(async (event) => {
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

        // Edit page button (for owners)
        html.find('.edit-page-button').click(async (event) => {
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
        
        // Toggle edit mode button 
        html.find('.toggle-edit-mode-button').click(async (event) => {
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
        
        // Set journal button (GM only)
        html.find('.set-journal-button, .set-journal-button-large').click(async (event) => {
            event.preventDefault();
            
            // Show journal picker dialog for GMs
            if (game.user.isGM) {
                this._showJournalPicker();
            }
        });

        // Toggle persistent journal (GM only)
        html.find('.toggle-persistent-button').click(async (event) => {
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

        // Page selection dropdown
        html.find('.page-select').change(async (event) => {
            const pageId = event.currentTarget.value;
            
            if (pageId === 'browse-pages') {
                // Show page picker dialog - GM only option
                if (game.user.isGM) {
                    this._showPagePicker(journal);
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
                    html.find('.page-select').val(page.id);
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

        // If we have a journal and a page, render the page content
        if (journal && page) {
            this._renderJournalContent(html, journal, page);
        }

        // Inline edit toggle (for text pages)
        html.find('.inline-edit-toggle').click(async (event) => {
            event.preventDefault();

            if (journal && page && page.type === 'text') {
                const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);

                if (canEdit) {
                    // Use our helper method to embed the editor
                    await this._embedEditor(html, journal, page);
                } else {
                    ui.notifications.warn("You don't have permission to edit this page.");
                }
            }
        });

        // Save edit button - now just triggers the done button 
        html.find('.save-edit-button').click(async (event) => {
            event.preventDefault();
            
            // If we have an active editor, trigger the done button
            if (this.journalSheet) {
                html.find('.done-embedded-edit').click();
            } else if (journal && page) {
                const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
                if (canEdit) {
                    await this._embedEditor(html, journal, page);
                }
            }
        });

        // Cancel edit button 
        html.find('.cancel-edit-button').click((event) => {
            event.preventDefault();
            
            // If we have an active editor sheet, close it
            if (this.journalSheet) {
                this.journalSheet.close();
                this.journalSheet = null;
                this.render(this.element);
            } else if (journal && page) {
                const canEdit = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
                if (canEdit) {
                    this._embedEditor(html, journal, page);
                }
            }
        });
    }

    async _renderJournalContent(html, journal, page) {
        // Define permission levels
        const PERMISSION_LEVELS = {
            NONE: 0,
            LIMITED: 1,
            OBSERVER: 2,
            OWNER: 3
        };
        
        // Set a global error handler for any unexpected errors in this method
        try {
            const contentContainer = html.find('.journal-content');
            if (!contentContainer.length) {
                console.error('Journal content container not found');
                return;
            }
            
            if (!page) {
                return;
            }
            
            // Store the page ID in a data attribute for reference by hooks
            contentContainer.attr('data-page-id', page.id);
            
            // Verify the page is a valid object
            if (typeof page !== 'object' || page === null) {
                console.error('Invalid page object:', page);
                contentContainer.html(`
                    <div class="render-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Invalid journal page data.</p>
                        <p>Click the "Open Journal" button to view it in the full journal viewer.</p>
                    </div>
                `);
                return;
            }
            
            // Verify permission to view this page
            const canViewPage = game.user.isGM || this._userCanAccessPage(page, game.user, PERMISSION_LEVELS);
            if (!canViewPage) {
                contentContainer.html(`<div class="permission-error"><i class="fas fa-lock"></i><p>You don't have permission to view this page.</p></div>`);
                return;
            }
            
            // Check if user can edit this page
            const canEditPage = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
            
            // Clear the container and prepare for rendering
            contentContainer.empty();
            
            // Track if rendering was successful with any approach
            let renderSuccessful = false;
            
            // APPROACH 1: PREFERRED - Use renderContent() (V12/V13 approach)
            try {
                if (typeof page.renderContent === 'function') {
                    // Validate page type first - renderContent works best with text/markdown
                    if (!['text', 'markdown'].includes(page.type)) {
                        // Don't return - let it try but prepare for failure
                    }
                    
                    try {
                        // Try the standard renderContent approach
                        let renderedContent = await page.renderContent();
                        
                        // Check if content is valid
                        if (!renderedContent || (typeof renderedContent === 'string' && renderedContent.trim() === '')) {
                            // Fallback with Manual Enrichment as suggested
                            let content = page.text?.content ?? page.text ?? '';
                            if (content && typeof content === 'string') {
                                renderedContent = await TextEditor.enrichHTML(content, {
                                    secrets: game.user.isGM,
                                    documents: true,
                                    links: true,
                                    rolls: true
                                });
                            } else {
                                throw new Error("Empty or invalid content");
                            }
                        }
                        
                        // Apply Foundry-like styling to the content
                        const formattedContent = this._applyFoundryJournalStyling(contentContainer, renderedContent);
                        
                        // Add classes to match Foundry's styling
                        contentContainer.addClass("journal-entry-page journal-page-content prose");
                        
                        // Insert the content
                        contentContainer.html(formattedContent || renderedContent);
                        
                        // Activate listeners to enable rollables, links, etc.
                        if (typeof JournalTextPageSheet !== 'undefined' && JournalTextPageSheet.activateListeners) {
                            JournalTextPageSheet.activateListeners(contentContainer[0]);
                        }
                        
                        // Check if content was actually rendered
                        const contentText = contentContainer.text();
                        const hasContent = contentContainer.children().length > 0 || contentText.trim().length > 0;
                        
                        // If no content was rendered, add placeholder text
                        if (!hasContent) {
                            contentContainer.html(`
                                <div class="empty-page-content">
                                    <p>${canEditPage ? 
                                        'This page appears to be empty. Click the edit button to add content.' : 
                                        'This page appears to be empty.'}</p>
                                </div>
                            `);
                        }
                        
                        renderSuccessful = true;
                        
                        // Make all links open in a new tab
                        contentContainer.find('a').attr('target', '_blank');
                        return;
                    } catch (innerError) {
                        console.error('Error rendering content:', innerError);
                        throw innerError; // Rethrow to outer catch block
                    }
                }
            } catch (renderContentError) {
                console.error('Error using renderContent method:', renderContentError);
                // Continue to fallback methods
            }
            
            // APPROACH 2: FALLBACK - Try to use the new UI extraction method
            try {
                if (!renderSuccessful) {
                    // Extract content from journal UI
                    const uiContent = await this._getContentFromJournalUI(journal, page);
                    
                    if (uiContent) {
                        // Add classes for consistent styling
                        contentContainer.addClass("journal-entry-page journal-page-content");
                        
                        // Insert the content
                        contentContainer.html(uiContent);
                        
                        // Apply styling
                        this._adjustJournalContentStyles(contentContainer);
                        
                        renderSuccessful = true;
                        
                        // Make all links open in a new tab
                        contentContainer.find('a').attr('target', '_blank');
                        return;
                    } else {
                        // Debug: Failed to extract content from journal UI
                    }
                }
            } catch (uiError) {
                // Continue to fallback methods
            }
            
            // APPROACH 3: FALLBACK - Try to use the native render method
            try {
                if (!renderSuccessful && typeof page.render === 'function') {
                    // Wrap in a promise with a timeout to prevent hanging
                    const renderPromise = new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error("Render timeout"));
                        }, 3000);
                        
                        // Track timeout for cleanup
                        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                            game.modules.get('coffee-pub-squire').api.PanelManager.trackTimeout(timeout);
                        }
                        
                        try {
                            // Check if render returns a Promise - if not, handle it accordingly
                            const renderResult = page.render(contentContainer[0], { editable: false });
                            
                            if (renderResult && typeof renderResult.then === 'function') {
                                renderResult
                                    .then(() => {
                                        clearTimeout(timeout);
                                        resolve(true);
                                    })
                                    .catch(err => {
                                        clearTimeout(timeout);
                                        reject(err);
                                    });
                            } else {
                                // If render doesn't return a Promise, resolve immediately
                                clearTimeout(timeout);
                                resolve(true);
                            }
                        } catch (immediateError) {
                            clearTimeout(timeout);
                            reject(immediateError);
                        }
                    });
                    
                    await renderPromise;
                    
                    // If we get here, render was successful
                    this._adjustJournalContentStyles(contentContainer);
                    
                    // Check if content was actually rendered
                    const contentText = contentContainer.text();
                    const hasContent = contentContainer.children().length > 0 || contentText.trim().length > 0;
                    
                    // If no content was rendered, add placeholder text
                    if (!hasContent) {
                        contentContainer.html(`
                            <div class="empty-page-content">
                                <p>${canEditPage ? 
                                    'This page appears to be empty. You can edit it in the journal.' : 
                                    'This page appears to be empty.'}</p>
                            </div>
                        `);
                    }
                    
                    renderSuccessful = true;
                    
                    // Make all links open in a new tab
                    contentContainer.find('a').attr('target', '_blank');
                    return;
                }
            } catch (error) {
                // Continue to fallback methods
            }
            
            // APPROACH 4: LAST RESORT - Direct content rendering
            if (!renderSuccessful) {
                try {
                    // First, handle specific page types differently
                    if (page.type === 'image') {
                        contentContainer.html(`
                            <div class="journal-image-container" style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                                <img src="${page.src}" alt="${page.name}" style="max-width: 100%; max-height: 500px;">
                                ${page.title ? `<h3>${page.title}</h3>` : ''}
                                ${page.caption ? `<div class="image-caption">${page.caption}</div>` : ''}
                            </div>
                        `);
                        renderSuccessful = true;
                        this._adjustJournalContentStyles(contentContainer);
                        return;
                    }
                    
                    if (page.type === 'pdf') {
                        contentContainer.html(`
                            <div class="pdf-container" style="text-align: center; padding: 20px; background: white; border-radius: 5px;">
                                <p>This journal contains a PDF file that cannot be displayed directly in the panel.</p>
                                <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">
                                    Open in Journal Viewer
                                </button>
                            </div>
                        `);
                        
                        // Add click handler to open journal button
                        contentContainer.find('.open-journal-button').click(async (event) => {
                            event.preventDefault();
                            if (journal) {
                                journal.sheet.render(true, {pageId: page.id});
                            }
                        });
                        
                        renderSuccessful = true;
                        this._adjustJournalContentStyles(contentContainer);
                        return;
                    }
                    
                    if (!['text', 'markdown'].includes(page.type)) {
                        contentContainer.html(`
                            <div class="unsupported-type" style="text-align: center; padding: 20px; background: white; border-radius: 5px;">
                                <p>This journal page uses a special type (${page.type}) that cannot be displayed directly in the panel.</p>
                                <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">
                                    Open in Journal Viewer
                                </button>
                            </div>
                        `);
                        
                        // Add click handler to open journal button
                        contentContainer.find('.open-journal-button').click(async (event) => {
                            event.preventDefault();
                            if (journal) {
                                journal.sheet.render(true, {pageId: page.id});
                            }
                        });
                        
                        renderSuccessful = true;
                        this._adjustJournalContentStyles(contentContainer);
                        return;
                    }
                    
                    // For text-based pages, try to get content
                    let content = '';
                    
                    // Try different approaches to get the content
                    if (page.text?.content) {
                        // Most common format in v12/v13
                        content = page.text.content;
                    } else if (typeof page.text === 'string') {
                        // Older format or simple text
                        content = page.text;
                    } else if (page.content) {
                        // Alternative location
                        content = typeof page.content === 'string' ? page.content : JSON.stringify(page.content);
                    } else {
                        // Last resort
                        const directContent = await this._getPageContent(page);
                        if (directContent) {
                            content = directContent;
                        }
                    }
                    
                    // If we have content, enrich it
                    if (content && typeof content === 'string') {
                        try {
                            content = await TextEditor.enrichHTML(content, {
                                secrets: game.user.isGM,
                                documents: true,
                                links: true,
                                rolls: true
                            });
                        } catch (enrichError) {
                            console.error('Error enriching content:', enrichError);
                        }
                    }
                    
                    // If we still don't have content, show empty message
                    if (!content || (typeof content === 'string' && content.trim() === '')) {
                        content = `
                            <div class="empty-page-content" style="text-align: center; padding: 40px 20px; color: #666; font-style: italic; background: white; border-radius: 5px;">
                                <p>${canEditPage ? 
                                    'This page appears to be empty. You can edit it in the journal.' : 
                                    'This page appears to be empty.'}</p>
                                <p style="margin-top: 10px">
                                    <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">
                                        Open Full Journal
                                    </button>
                                </p>
                            </div>
                        `;
                    }
                    
                    // Add classes for consistent styling
                    contentContainer.addClass("journal-entry-page journal-page-content");
                    
                    // Insert the content
                    contentContainer.html(content);
                    
                    // Add click handler to open journal button if there is one
                    contentContainer.find('.open-journal-button').click(async (event) => {
                        event.preventDefault();
                        if (journal) {
                            if (page) {
                                journal.sheet.render(true, {pageId: page.id});
                            } else {
                                journal.sheet.render(true);
                            }
                        }
                    });
                    
                    renderSuccessful = true;
                    
                    // Apply additional styling
                    this._adjustJournalContentStyles(contentContainer);
                    
                    // Make all links open in a new tab
                    contentContainer.find('a:not(.open-journal-button)').attr('target', '_blank');
                } catch (textError) {
                    console.error('Text fallback rendering failed:', textError);
                }
            }
        } catch (globalError) {
            console.error('Catastrophic error in _renderJournalContent:', globalError);
            try {
                html.find('.journal-content').html(`
                    <div class="render-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>An unexpected error occurred while rendering the journal.</p>
                        <p>Error: ${globalError.message || "Unknown error"}</p>
                        <p>Click the "Open Journal" button to view it in the full journal viewer.</p>
                    </div>
                `);
                
                // Add click handler to open journal directly
                html.find('.open-journal-button').click(async (event) => {
                    event.preventDefault();
                    if (journal) {
                        if (page) {
                            journal.sheet.render(true, {pageId: page.id});
                        } else {
                            journal.sheet.render(true);
                        }
                    }
                });
            } catch (e) {
                console.error('Failed to display error message:', e);
            }
        }
    }

    /**
     * Adjust styles of the journal content to fit in our panel
     * @param {jQuery} container - The journal content container
     * @private
     */
    _adjustJournalContentStyles(container) {
        // Add journal-specific classes if they don't exist
        container.addClass("journal-entry-page journal-page-content");
    }

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
        
        // Get current persistent journal
        const persistentJournalId = game.settings.get(MODULE.ID, 'notesPersistentJournal');
        
        // Create a more visual journal picker with journal covers
        const content = `
        <h2 style="text-align: center; margin-bottom: 15px;">Select a Journal for Notes</h2>
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
                        ${j.id === persistentJournalId ? `<i class="fas fa-thumbtack" style="position: absolute; top: 10px; right: 10px; color: gold; font-size: 1.2em;" title="Pinned for players"></i>` : ''}
                    </div>
                    <div class="journal-name" style="margin-top: 5px; font-weight: bold;">${j.name}</div>
                    <div class="journal-pages" style="font-size: 0.8em; color: #999;">${j.pages} page${j.pages !== 1 ? 's' : ''}</div>
                </div>
                `).join('')}
            </div>`
        }
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(50, 50, 80, 0.3); border-radius: 5px;">
            <p style="margin-bottom: 5px; color: #ddd;"><i class="fas fa-info-circle" style="color: #88f;"></i> As GM, you can select a journal for your own viewing without changing what players see.</p>
            <p style="color: #ddd;">Use the <i class="fas fa-thumbtack" style="color: gold;"></i> button to set what journal players will see.</p>
        </div>
        <div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button>
            <button class="refresh-button" style="flex: 1; margin-left: 5px;">Refresh List</button>
        </div>
        `;
        
        const dialog = new Dialog({
            title: "Select Journal for Notes",
            content: content,
            buttons: {},
            render: html => {
                // Handle journal item clicks
                html.find('.journal-item').click(async event => {
                    const journalId = event.currentTarget.dataset.id;
                    
                    
                    
                    // For GMs, update their personal view first
                    if (game.user.isGM) {
                        await game.settings.set(MODULE.ID, 'notesGMJournal', journalId);
                    }
                    
                    ui.notifications.info(`Journal ${journalId === 'none' ? 'selection cleared' : 'selected'}.`);
                    dialog.close();
                    
                    // If we've selected a journal (not 'none'), show the page picker
                    if (journalId !== 'none') {
                        const journal = game.journal.get(journalId);
                        if (journal && journal.pages.size > 0) {
                            this._showPagePicker(journal);
                        } else {
                            this.render(this.element);
                        }
                    } else {
                        this.render(this.element);
                    }
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
    
    _showPagePicker(journal) {
        if (!journal || !game.user.isGM) return;
        
        // Define permission levels
        const PERMISSION_LEVELS = {
            NONE: 0,
            LIMITED: 1,
            OBSERVER: 2,
            OWNER: 3
        };
        
        // Get all pages from the journal
        const pages = journal.pages.contents.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            img: p.type === 'image' ? p.src : (p.type === 'text' ? 'icons/svg/book.svg' : 'icons/svg/page.svg'),
            permissions: this._getPagePermissionLabel(p, PERMISSION_LEVELS)
        }));
        
        // Sort alphabetically
        pages.sort((a, b) => a.name.localeCompare(b.name));
        
        // Create a visual page picker
        const content = `
        <h2 style="text-align: center; margin-bottom: 5px;">${journal.name}</h2>
        <p style="text-align: center; margin-bottom: 15px; color: #999;">Select a page to display</p>
        ${pages.length === 0 ? 
            `<div class="no-pages-message" style="text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-circle" style="font-size: 2em; margin-bottom: 10px; color: #aa0000;"></i>
                <p>No pages found in this journal.</p>
                <p>You need to add at least one page to the journal first.</p>
            </div>` :
            `<div class="page-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 15px;">
                ${pages.map(p => `
                <div class="page-item" data-id="${p.id}" style="cursor: pointer; text-align: center; border: 1px solid #666; border-radius: 5px; padding: 10px; background: rgba(0,0,0,0.2);">
                    <div class="page-image" style="height: 80px; display: flex; align-items: center; justify-content: center; background-size: contain; background-position: center; background-repeat: no-repeat; ${p.type === 'image' ? `background-image: url('${p.img}');` : ''}">
                        ${p.type !== 'image' ? `<i class="fas ${p.type === 'text' ? 'fa-book-open' : 'fa-file'}" style="font-size: 2em; color: #666;"></i>` : ''}
                    </div>
                    <div class="page-name" style="margin-top: 5px; font-weight: bold;">${p.name}</div>
                    <div class="page-info" style="display: flex; justify-content: space-between; font-size: 0.8em; color: #999;">
                        <span style="text-transform: capitalize;">${p.type}</span>
                        <span title="Page permissions">${p.permissions}</span>
                    </div>
                </div>
                `).join('')}
            </div>`
        }
        <div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button>
            <button class="open-journal-button" style="flex: 1; margin-left: 5px;">Open Journal</button>
        </div>
        `;
        
        const dialog = new Dialog({
            title: "Select Journal Page",
            content: content,
            buttons: {},
            render: html => {
                // Handle page item clicks
                html.find('.page-item').click(async event => {
                    const pageId = event.currentTarget.dataset.id;
                    await game.settings.set(MODULE.ID, 'notesSharedJournalPage', pageId);
                    ui.notifications.info(`Journal page selected.`);
                    dialog.close();
                    this.render(this.element);
                });
                
                // Handle cancel button
                html.find('.cancel-button').click(() => dialog.close());
                
                // Handle open journal button
                html.find('.open-journal-button').click(() => {
                    journal.sheet.render(true);
                    dialog.close();
                });
            },
            default: '',
            close: () => {}
        });
        
        dialog.render(true);
    }
    
    /**
     * Get a human-readable label for page permissions
     * @param {JournalEntryPage} page - The page to check permissions for
     * @param {Object} permLevels - Permission level constants
     * @returns {string} A label indicating permission level
     * @private
     */
    _getPagePermissionLabel(page, permLevels) {
        if (!page) return `<i class="fas fa-question" title="Unknown"></i>`;
        
        // Check if page has specific permissions or inherits from journal
        const hasSpecificPermissions = Object.keys(page.ownership).some(id => id !== "default");
        const defaultPermission = page.ownership.default;
        
        if (!hasSpecificPermissions && defaultPermission === 0) {
            return `<i class="fas fa-link" title="Inherits journal permissions"></i>`;
        }
        
        if (defaultPermission >= permLevels.OWNER) {
            return `<i class="fas fa-edit" title="Players can edit"></i>`;
        } else if (defaultPermission >= permLevels.OBSERVER) {
            return `<i class="fas fa-eye" title="Players can view"></i>`;
        } else {
            return `<i class="fas fa-lock" title="GM only"></i>`;
        }
    }

    /**
     * Gets the text content from a journal page safely, handling all Promise scenarios
     * @param {JournalEntryPage} page - The journal page
     * @returns {string} The content of the page
     * @private
     */
    async _getPageContent(page) {
        if (!page) return '';
        
        try {
            // Handle if the entire page is a Promise
            if (page && typeof page.then === 'function') {
                try {
                    page = await page;
                } catch (pagePromiseError) {
                    console.error('Failed to resolve page promise:', pagePromiseError);
                    return '';
                }
            }
            
            // Handle different ways content might be stored depending on Foundry version
            if (page.type === 'text') {
                let content = null;
                
                // CASE 1: Check page.text.content (typical in v13)
                if (page.text && typeof page.text === 'object' && page.text !== null) {
                    // Check if text.content is available
                    if (typeof page.text.content !== 'undefined') {
                        // Handle Promise
                        if (typeof page.text.content.then === 'function') {
                            try {
                                content = await page.text.content;
                            } catch (contentPromiseError) {
                                console.error('Failed to resolve content promise:', contentPromiseError);
                            }
                        } else {
                            content = page.text.content;
                        }
                    }
                    // If content is null after text.content check, look for other properties
                    if (content === null && typeof page.text.value !== 'undefined') {
                        content = page.text.value;
                    }
                }
                
                // CASE 2: Check page.text as string (typical in v11-v12)
                if (content === null && page.text) {
                    if (typeof page.text === 'string') {
                        content = page.text;
                    } 
                    // Handle if page.text is a Promise
                    else if (typeof page.text.then === 'function') {
                        try {
                            content = await page.text;
                        } catch (textPromiseError) {
                            console.error('Failed to resolve text promise:', textPromiseError);
                        }
                    }
                }
                
                // CASE 3: Check page.content (sometimes used)
                if (content === null && page.content) {
                    if (typeof page.content === 'string') {
                        content = page.content;
                    }
                    // Handle if page.content is a Promise
                    else if (typeof page.content.then === 'function') {
                        try {
                            content = await page.content;
                        } catch (contentPromiseError) {
                            console.error('Failed to resolve content promise:', contentPromiseError);
                        }
                    }
                }
                
                // CASE 4: Check page.document structure (sometimes in v13)
                if (content === null && page.document) {
                    if (typeof page.document.text === 'string') {
                        content = page.document.text;
                    }
                    else if (page.document.text && page.document.text.content) {
                        if (typeof page.document.text.content.then === 'function') {
                            try {
                                content = await page.document.text.content;
                            } catch (docContentPromiseError) {
                                console.error('Failed to resolve document content promise:', docContentPromiseError);
                            }
                        } else {
                            content = page.document.text.content;
                        }
                    }
                }
                
                // CASE 5: Check page.data structure (sometimes in v10-v11)
                if (content === null && page.data) {
                    if (page.data.content) {
                        content = page.data.content;
                    }
                    else if (page.data.text) {
                        content = page.data.text;
                    }
                }
                
                // Final processing - ensure content is a string
                if (content !== null) {
                    // If content is a Promise (after all our attempts)
                    if (content && typeof content.then === 'function') {
                        try {
                            content = await content;
                        } catch (finalPromiseError) {
                            console.error('Failed to resolve final content promise:', finalPromiseError);
                            content = '';
                        }
                    }
                    
                    // Convert content to string
                    if (content === null || content === undefined) {
                        content = '';
                    } else if (typeof content !== 'string') {
                        try {
                            content = String(content);
                        } catch (stringError) {
                            console.error('Failed to convert content to string:', stringError);
                            content = '';
                        }
                    }
                    
                    return content;
                }
                
                // If we've exhausted all options and found nothing
                return '';
            }
            
            // For non-text types
            return '';
        } catch (error) {
            console.error('Error getting page content:', error);
            return '';
        }
    }

    /**
     * Try to get content directly from an open journal sheet
     * @param {Journal} journal - The journal document
     * @param {JournalEntryPage} page - The journal page
     * @returns {string|null} The HTML content or null if not found
     * @private
     */
    _getContentFromJournalUI(journal, page) {
        if (!journal || !page) return null;
        
        try {
            // For non-text page types, create appropriate representation
            if (page.type === 'image') {
                return `<div class="journal-image-container" style="text-align: center;">
                    <img src="${page.src}" alt="${page.name}" style="max-width: 100%; max-height: 500px;">
                    ${page.title ? `<h3>${page.title}</h3>` : ''}
                    ${page.caption ? `<div class="image-caption">${page.caption}</div>` : ''}
                </div>`;
            }
            
            if (page.type === 'pdf') {
                return `<div class="pdf-container" style="text-align: center; padding: 20px;">
                    <p>This journal contains a PDF file that cannot be displayed directly in the panel.</p>
                    <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">
                        Open in Journal Viewer
                    </button>
                </div>`;
            }
            
            if (!['text', 'markdown'].includes(page.type)) {
                return `<div class="unsupported-type" style="text-align: center; padding: 20px;">
                    <p>This journal page uses a special type (${page.type}) that cannot be displayed directly in the panel.</p>
                    <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">
                        Open in Journal Viewer
                    </button>
                </div>`;
            }
            
            // First check if the journal sheet is open
            if (!journal.sheet || !journal.sheet.element) {
                // If not, we need to temporarily render it to get content
                
                // Create a temporary journal sheet to extract content
                const tempSheet = new JournalSheet(journal);
                tempSheet.render(true, { pageId: page.id });
                
                // Delay slightly to let the rendering complete
                return new Promise(resolve => {
                    setTimeout(() => {
                        try {
                            // Try to extract content from the rendered journal
                            const pageContent = tempSheet.element.find(`.journal-page-content[data-page-id="${page.id}"]`);
                            let content = pageContent.html();
                            
                            // If we can't get content from the sheet, try a direct enrichment
                            if (!content) {
                                // Get the raw text content
                                let rawContent = page.text?.content ?? page.text ?? '';
                                if (rawContent && typeof rawContent === 'string') {
                                    // Enrich the content
                                    TextEditor.enrichHTML(rawContent, {
                                        secrets: game.user.isGM,
                                        documents: true,
                                        links: true,
                                        rolls: true
                                    }).then(enriched => {
                                        content = enriched;
                                        try { tempSheet.close(); } catch (e) {}
                                        resolve(content);
                                    });
                                    return; // Don't resolve yet, wait for enrichment
                                }
                            }
                            
                            // Close the temporary sheet
                            tempSheet.close();
                            
                            // Return the content
                            resolve(content || null);
                        } catch (extractError) {
                            console.error('Error extracting content from temporary journal:', extractError);
                            
                            // Make sure to close the sheet even if there's an error
                            try { tempSheet.close(); } catch (e) {}
                            
                            resolve(null);
                        }
                    }, 100);
                });
            } else {
                // If the journal is already open, extract directly
                const pageContent = journal.sheet.element.find(`.journal-page-content[data-page-id="${page.id}"]`);
                const content = pageContent.html();
                
                // If we can't get content from the sheet, try a direct enrichment
                if (!content && ['text', 'markdown'].includes(page.type)) {
                    // Get the raw text content
                    let rawContent = page.text?.content ?? page.text ?? '';
                    if (rawContent && typeof rawContent === 'string') {
                        // Return a promise to match the async pattern
                        return TextEditor.enrichHTML(rawContent, {
                            secrets: game.user.isGM,
                            documents: true,
                            links: true,
                            rolls: true
                        });
                    }
                }
                
                return content || null;
            }
        } catch (error) {
            console.error('Error getting content from journal UI:', error);
            return null;
        }
    }

    /**
     * Function to style the content to match Foundry's native journal
     * @param {jQuery} contentContainer - The content container
     * @param {string} html - The HTML content
     * @private
     */
    _applyFoundryJournalStyling(contentContainer, html) {
        // Skip if content is empty
        if (!html) return;
        
        try {
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Add header section if missing
            const firstHeader = tempDiv.querySelector('h1, h2, h3');
            
            // If the first element is not a header, wrap all content in a section
            if (!firstHeader || firstHeader !== tempDiv.firstElementChild) {
                // Create a section to wrap the existing content
                const section = document.createElement('section');
                
                // Move all content to the section
                while (tempDiv.firstChild) {
                    section.appendChild(tempDiv.firstChild);
                }
                
                // Add the section back to the temp div
                tempDiv.appendChild(section);
            }
            
            // Style headings and add Foundry-like structure
            const headings = tempDiv.querySelectorAll('h1, h2, h3');
            headings.forEach(heading => {
                // If heading doesn't have a section after it, wrap all following elements until the next heading
                if (heading.nextElementSibling && heading.nextElementSibling.tagName !== 'SECTION') {
                    const section = document.createElement('section');
                    let nextEl = heading.nextElementSibling;
                    
                    while (nextEl && !['H1', 'H2', 'H3'].includes(nextEl.tagName)) {
                        const toMove = nextEl;
                        nextEl = nextEl.nextElementSibling;
                        section.appendChild(toMove);
                    }
                    
                    // Insert the section after the heading
                    if (heading.nextSibling) {
                        heading.parentNode.insertBefore(section, heading.nextSibling);
                    } else {
                        heading.parentNode.appendChild(section);
                    }
                }
            });
            
            // Return the formatted HTML
            return tempDiv.innerHTML;
        } catch (e) {
            console.error('Error applying Foundry styling:', e);
            return html;
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
            
            // Get the content container
            const contentContainer = html.find('.journal-content');
            if (!contentContainer.length) return;
            
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
