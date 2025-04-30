import { MODULE, TEMPLATES } from './const.js';

export class NotesPanel {
    constructor() {
        this.element = null;
        this.journalSheet = null;
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

        // For debugging
        if (journal && !game.user.isGM) {
            console.log(`SQUIRE | Notes Panel Journal Permissions:`, {
                journal: journal.name,
                journalId: journal.id,
                canViewJournal,
                userLevel: journal.getUserLevel(game.user),
                permission: journal.permission,
                ownership: journal.ownership,
                defaultOwnership: journal.ownership.default,
                userOwnership: journal.ownership[game.user.id],
                page: page?.name,
                pageId: page?.id,
                accessiblePageCount: pages.length,
                userIsGM: game.user.isGM
            });
            
            if (page) {
                console.log(`SQUIRE | Notes Panel Page Permissions:`, {
                    page: page.name,
                    pageId: page.id,
                    canAccess: this._userCanAccessPage(page, game.user, PERMISSION_LEVELS),
                    userLevel: page.getUserLevel(game.user),
                    permission: page.permission,
                    ownership: page.ownership,
                    defaultOwnership: page.ownership.default,
                    userOwnership: page.ownership[game.user.id]
                });
            }
        }

        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            page: page,
            pages: pages,
            pageName: page?.name || '',
            hasPages: pages.length > 0,
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
                    // Open the page for editing
                    if (page.sheet) {
                        page.sheet.render(true);
                    } else {
                        // Fallback to opening journal and navigating to page
                        journal.sheet.render(true, {pageId: page.id, editable: true});
                    }
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
            
            // If we have an editor open, clean it up
            if (this.editor) {
                this.editor.destroy();
                this.editor = null;
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

        // If we have a journal and a page, render the page content
        if (journal && page) {
            this._renderJournalContent(html, journal, page);
        }
    }

    async _renderJournalContent(html, journal, page) {
        // Define permission levels
        const PERMISSION_LEVELS = {
            NONE: 0,
            LIMITED: 1,
            OBSERVER: 2,
            OWNER: 3
        };
        
        const contentContainer = html.find('.journal-content');
        if (!contentContainer.length) return;
        
        if (!page) return;
        
        // Verify permission to view this page
        const canViewPage = game.user.isGM || this._userCanAccessPage(page, game.user, PERMISSION_LEVELS);
        if (!canViewPage) {
            contentContainer.html(`<div class="permission-error"><i class="fas fa-lock"></i><p>You don't have permission to view this page.</p></div>`);
            return;
        }
        
        // Check if user can edit this page
        const canEditPage = game.user.isGM || page.testUserPermission(game.user, PERMISSION_LEVELS.OWNER);
        
        // Create the content based on page type
        let content = '';
        
        if (page.type === 'text') {
            // For text pages, use the content directly via our helper
            content = this._getPageContent(page);
            
            // Log to help debug content issues
            console.log("SQUIRE | Rendering journal content:", {
                pageId: page.id,
                pageName: page.name,
                contentLength: content.length,
                firstChars: content.substring(0, 50)
            });
            
            // If content is empty but the page exists, show a helpful message
            if (!content || content.trim() === '') {
                content = `<p class="empty-content">${canEditPage ? 
                    'This page is empty. Click the edit button to add content.' : 
                    'This page is empty.'}</p>`;
            }
        } else if (page.type === 'image') {
            // For image pages, create an img tag
            content = `<img src="${page.src}" alt="${page.name}" style="max-width: 100%;">`;
        } else if (page.type === 'pdf') {
            // For PDF pages, create a link
            content = `<p>This journal contains a PDF that cannot be displayed directly. Click the "Open Journal" button to view it.</p>`;
        } else {
            // For other types, show a placeholder
            content = `<p>This journal uses a special page type. Click the "Open Journal" button to view it properly.</p>`;
        }
        
        // Insert the content
        contentContainer.html(content);
        
        // Make links open in a new tab
        contentContainer.find('a').attr('target', '_blank');
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
     * Gets the text content from a journal page safely
     * @param {JournalEntryPage} page - The journal page
     * @returns {string} The content of the page
     * @private
     */
    _getPageContent(page) {
        if (!page) return '';
        
        try {
            // Handle different ways content might be stored depending on Foundry version
            if (page.type === 'text') {
                // Try different possible locations for the content
                if (page.text && typeof page.text.content === 'string') {
                    return page.text.content;
                } else if (page.text && typeof page.text === 'string') {
                    return page.text;
                } else if (page.content && typeof page.content === 'string') {
                    return page.content;
                } else if (typeof page.text === 'object' && page.text !== null) {
                    // Maybe it's stored in a different format
                    return JSON.stringify(page.text) || '';
                }
            }
            // For non-text types or if we couldn't find the content
            return '';
        } catch (error) {
            console.error("SQUIRE | Error getting page content:", error);
            return '';
        }
    }
} 