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
        const journalId = game.settings.get(MODULE.ID, 'notesSharedJournal');
        const journal = journalId !== 'none' ? game.journal.get(journalId) : null;

        // If journal ID exists but journal doesn't, reset to 'none'
        if (journalId !== 'none' && !journal && game.user.isGM) {
            await game.settings.set(MODULE.ID, 'notesSharedJournal', 'none');
            ui.notifications.warn("The previously selected journal no longer exists. Please select a new one.");
        }

        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, {
            hasJournal: !!journal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            isGM: game.user.isGM,
            position: "left" // Hard-code position for now as it's always left in current implementation
        });
        notesContainer.html(html);

        this.activateListeners(notesContainer, journal);
    }

    activateListeners(html, journal) {
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
                journal.sheet.render(true);
            } else {
                ui.notifications.warn("No journal selected. Please select a journal in the module settings.");
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

        // If we have a journal and it has pages, render the first page content
        if (journal && journal.pages.size > 0) {
            this._renderJournalContent(html, journal);
        }
    }

    async _renderJournalContent(html, journal) {
        const contentContainer = html.find('.journal-content');
        if (!contentContainer.length) return;
        
        // Get the first page or the default page
        const firstPage = journal.pages.contents[0];
        if (!firstPage) return;
        
        // Create the content based on page type
        let content = '';
        
        if (firstPage.type === 'text') {
            // For text pages, use the content directly
            content = firstPage.text.content;
        } else if (firstPage.type === 'image') {
            // For image pages, create an img tag
            content = `<img src="${firstPage.src}" alt="${firstPage.name}" style="max-width: 100%;">`;
        } else if (firstPage.type === 'pdf') {
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
                    </div>
                    <div class="journal-name" style="margin-top: 5px; font-weight: bold;">${j.name}</div>
                    <div class="journal-pages" style="font-size: 0.8em; color: #999;">${j.pages} page${j.pages !== 1 ? 's' : ''}</div>
                </div>
                `).join('')}
            </div>`
        }
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
                    await game.settings.set(MODULE.ID, 'notesSharedJournal', journalId);
                    ui.notifications.info(`Journal ${journalId === 'none' ? 'selection cleared' : 'selected'}.`);
                    dialog.close();
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
} 