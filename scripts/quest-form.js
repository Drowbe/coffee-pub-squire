import { MODULE } from './const.js';

export class QuestForm extends FormApplication {
    constructor(quest = null, options = {}) {
        super(quest, options);
        this.quest = quest || this._getDefaultQuest();
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'quest-form',
            title: 'Quest Form',
            template: 'modules/coffee-pub-squire/templates/quest-form.hbs',
            width: 600,
            height: 'auto',
            resizable: true,
            closeOnSubmit: true
        });
    }

    getData() {
        return {
            quest: this.quest,
            categories: game.settings.get(MODULE.ID, 'questCategories'),
            isGM: game.user.isGM
        };
    }

    _getDefaultQuest() {
        return {
            name: '',
            img: '',
            category: game.settings.get(MODULE.ID, 'questCategories')[0],
            timeframe: {
                duration: ''
            },
            description: '',
            tasks: [],
            reward: {
                xp: 0,
                treasure: 0
            },
            participants: [],
            plotHook: '',
            progress: {
                status: '',
                percentage: 0
            },
            tags: [],
            uuid: '',
            visible: true
        };
    }

    async _updateObject(event, formData) {
        const quest = expandObject(formData);
        
        // Convert string arrays back to arrays
        if (typeof quest.tasks === 'string') {
            quest.tasks = quest.tasks.split('\n').map(t => ({
                text: t.trim(),
                completed: false
            })).filter(t => t.text);
        }
        if (typeof quest.participants === 'string') {
            quest.participants = quest.participants.split('\n')
                .map(p => p.trim())
                .filter(p => p)
                .map(p => ({ name: p, img: 'icons/svg/mystery-man.svg' }));
        }
        if (typeof quest.tags === 'string') {
            quest.tags = quest.tags.split(',').map(t => t.trim()).filter(t => t);
        }

        // Convert numeric values
        quest.reward.xp = Number(quest.reward.xp) || 0;
        quest.reward.treasure = Number(quest.reward.treasure) || 0;
        quest.progress.percentage = Number(quest.progress.percentage) || 0;

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

        // Refresh the quest panel if it exists
        if (PanelManager.instance?.questPanel) {
            PanelManager.instance.questPanel.render(PanelManager.element);
        }
    }

    _generateJournalContent(quest) {
        let content = `<h1>${quest.name}</h1>\n\n`;

        if (quest.img) {
            content += `<img src="${quest.img}" alt="${quest.name}">\n\n`;
        }

        content += `<p><strong>Category:</strong> ${quest.category}</p>\n\n`;

        if (quest.description) {
            content += `<p><strong>Description:</strong> ${quest.description}</p>\n\n`;
        }

        if (quest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${quest.plotHook}</p>\n\n`;
        }

        if (quest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            quest.tasks.forEach(t => content += `<li>${t.text}</li>\n`);
            content += `</ul>\n\n`;
        }

        if (quest.reward.xp || quest.reward.treasure) {
            content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
            content += `<p><strong>Treasure:</strong> ${quest.reward.treasure}</p>\n\n`;
        }

        if (quest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${quest.timeframe.duration}</p>\n\n`;
        }

        if (quest.status) {
            content += `<p><strong>Status:</strong> ${quest.status}</p>\n\n`;
        }

        if (quest.participants.length) {
            const participantList = quest.participants.map(p => {
                if (typeof p === 'string') return p;
                if (p.uuid) return `@UUID[${p.uuid}]{${p.name || 'Actor'}}`;
                return p.name || '';
            }).filter(p => p).join(', ');
            content += `<p><strong>Participants:</strong> ${participantList}</p>\n\n`;
        }

        if (quest.tags.length) {
            content += `<p><strong>Tags:</strong> ${quest.tags.join(', ')}</p>\n\n`;
        }

        return content;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle image upload
        html.find('.quest-image-upload').on('click', async (event) => {
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

        // Handle task completion toggling
        html.find('.task-complete').on('click', (event) => {
            const index = event.currentTarget.dataset.index;
            this.quest.tasks[index].completed = !this.quest.tasks[index].completed;
            this.render();
        });
    }
} 