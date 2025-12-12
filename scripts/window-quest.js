import { MODULE } from './const.js';
import { getNativeElement } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class QuestForm extends FormApplication {
    constructor(quest = null, options = {}) {
        super(quest, options);
        this.quest = quest || this._getDefaultQuest();
    }

    /**
     * Get native DOM element from this.element (handles jQuery conversion)
     * @returns {HTMLElement|null} Native DOM element
     */
    _getNativeElement() {
        if (!this.element) return null;
        // v13: Detect and convert jQuery to native DOM if needed
        if (this.element.jquery || typeof this.element.find === 'function') {
            return this.element[0] || this.element.get?.(0) || this.element;
        }
        return this.element;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'quest-form',
            title: 'Add Quest',
            template: 'modules/coffee-pub-squire/templates/quest-form.hbs',
            width: 600,
            height: 'auto',
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        });
    }

    getData() {
        // Ensure participants is properly formatted for display
        if (this.quest.participants && Array.isArray(this.quest.participants)) {
            this.quest.participants = this.quest.participants.join(', ');
        }
        
        return {
            quest: this.quest,
            categories: game.settings.get(MODULE.ID, 'questCategories'),
            isGM: game.user.isGM
        };
    }

    _getDefaultQuest() {
        // Get categories from settings, but filter out "Pinned"
        const allCategories = game.settings.get(MODULE.ID, 'questCategories');
        const filteredCategories = allCategories.filter(cat => cat !== "Pinned");
        
        // Set default category to "Main Quest" if it exists, otherwise first available
        const defaultCategory = filteredCategories.includes("Main Quest") ? 
            "Main Quest" : 
            (filteredCategories.length > 0 ? filteredCategories[0] : "");
            
        return {
            name: '',
            img: '',
            category: defaultCategory,
            timeframe: {
                duration: ''
            },
            description: '',
            tasks: [],
            reward: {
                xp: 0,
                treasure: []
            },
            location: '',
            plotHook: '',
            status: 'Not Started',
            tags: [],
            participants: [],
            uuid: '',
            visible: false
        };
    }

    async _updateObject(event, formData) {
        const quest = expandObject(formData);
        
        // Ensure the status is set
        quest.status = quest.status || 'Not Started';
        
        // Convert string arrays back to arrays
        if (typeof quest.tasks === 'string') {
            quest.tasks = quest.tasks.split('\n').map(t => ({
                text: t.trim(),
                completed: false,
                state: 'active'
            })).filter(t => t.text);
        }
        
        // Convert tags to array
        if (typeof quest.tags === 'string') {
            quest.tags = quest.tags.split(',').map(t => t.trim()).filter(t => t);
        }

        // Convert participants to array
        if (typeof quest.participants === 'string') {
            quest.participants = quest.participants.split(',').map(p => p.trim()).filter(p => p);
        }

        // Convert numeric values
        quest.reward.xp = Number(quest.reward.xp) || 0;
        
        // Make sure reward.treasure is a string if it's a number
        if (typeof quest.reward.treasure === 'number') {
            quest.reward.treasure = String(quest.reward.treasure);
        }

        // Generate UUID if new quest
        if (!quest.uuid) {
            quest.uuid = foundry.utils.randomID();
        }

        // Get the journal
        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No quest journal selected. Please select a journal in the quest panel settings.');
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected quest journal not found.');
            return;
        }

        try {
            // Create or update the journal page
            const pageData = {
                name: quest.name,
                type: 'text',
                text: {
                    content: this._generateJournalContent(quest)
                }
            };

            let page;
            if (this.quest.uuid) {
                // Update existing page
                page = journal.pages.find(p => p.getFlag(MODULE.ID, 'questUuid') === this.quest.uuid);
                if (page) {
                    await page.update(pageData);
                }
            } else {
                // Create new page
                pageData.flags = {
                    [MODULE.ID]: {
                        questUuid: quest.uuid
                    }
                };
                const created = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                page = created[0];
            }

            // Set the visible flag
            if (page) {
                await page.setFlag(MODULE.ID, 'visible', quest.visible !== false);
            }

            // Show success notification
            ui.notifications.info(`Quest "${quest.name}" saved successfully.`);
            
            // Explicitly close the form
            this.close();
            
            return true;
        } catch (error) {
            console.error('Error saving quest:', error);
            ui.notifications.error(`Failed to save quest: ${error.message}`);
            return false;
        }
    }

    _generateJournalContent(quest) {
        let content = "";
        
        if (quest.img) {
            content += `<img src="${quest.img}" alt="${quest.name}">\n\n`;
        }

        if (quest.category) {
            content += `<p><strong>Category:</strong> ${quest.category}</p>\n\n`;
        }

        if (quest.description) {
            content += `<p><strong>Description:</strong> ${quest.description}</p>\n\n`;
        }
        
        if (quest.location) {
            content += `<p><strong>Location:</strong> ${quest.location}</p>\n\n`;
        }

        if (quest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${quest.plotHook}</p>\n\n`;
        }

        if (quest.tasks && quest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            quest.tasks.forEach(t => {
                if (typeof t === 'string') {
                    content += `<li>${t}</li>\n`;
                } else {
                    content += `<li>${t.text}</li>\n`;
                }
            });
            content += `</ul>\n\n`;
        }

        if (quest.reward) {
            if (quest.reward.xp) {
                content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
            }
            
            if (quest.reward.treasure && typeof quest.reward.treasure === 'string' && quest.reward.treasure.trim() !== '') {
                content += `<p><strong>Treasure:</strong> ${quest.reward.treasure}</p>\n\n`;
            } else if (Array.isArray(quest.reward.treasure) && quest.reward.treasure.length > 0) {
                content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
                quest.reward.treasure.forEach(t => {
                    if (typeof t === 'string') {
                        content += `<li>${t}</li>\n`;
                    } else if (t.uuid) {
                        content += `<li>@UUID[${t.uuid}]{${t.name || 'Item'}}</li>\n`;
                    } else {
                        content += `<li>${t.text || t.name || ''}</li>\n`;
                    }
                });
                content += `</ul>\n\n`;
            }
        }

        if (quest.timeframe && quest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${quest.timeframe.duration}</p>\n\n`;
        }

        // Always include status, default to "Not Started" if not specified
        content += `<p><strong>Status:</strong> ${quest.status || 'Not Started'}</p>\n\n`;

        if (quest.tags && quest.tags.length) {
            content += `<p><strong>Tags:</strong> ${quest.tags.join(', ')}</p>\n\n`;
        }

        // Add participants section if there are any
        if (quest.participants && quest.participants.length) {
            content += `<p><strong>Participants:</strong></p>\n<ul>\n`;
            quest.participants.forEach(participant => {
                if (participant.uuid) {
                    content += `<li>@UUID[${participant.uuid}]{${participant.name || 'Unknown'}}</li>\n`;
                } else {
                    content += `<li>${participant.name || 'Unknown'}</li>\n`;
                }
            });
            content += `</ul>\n\n`;
        }

        return content;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // v13: Use helper method for consistency
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;

        // Handle image upload
        const imageUpload = nativeHtml.querySelector('.quest-image-upload');
        if (imageUpload) {
            imageUpload.addEventListener('click', async (event) => {
                event.preventDefault();
                const file = await new Promise(resolve => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => resolve(input.files[0]);
                    input.click();
                });

                if (file) {
                    const formData = new FormData();
                    formData.append('file', file);
                    const response = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.url) {
                        this.quest.img = result.url;
                        this.render();
                    }
                }
            });
        }

        // Handle task completion toggling
        const taskCompleteButtons = nativeHtml.querySelectorAll('.task-complete');
        taskCompleteButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const index = event.currentTarget.dataset.index;
                this.quest.tasks[index].completed = !this.quest.tasks[index].completed;
                this.render();
            });
        });
        
        // Handle cancel button click
        const cancelButton = nativeHtml.querySelector('button.cancel');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.close();
            });
        }
    }
} 
