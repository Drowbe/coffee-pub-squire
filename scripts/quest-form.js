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
            criteria: [],
            timeframe: {
                dueDate: '',
                duration: ''
            },
            description: '',
            tasks: [],
            reward: {
                xp: 0,
                gold: 0,
                items: []
            },
            participants: [],
            plotHook: '',
            progress: {
                status: '',
                percentage: 0
            },
            related: [],
            tags: [],
            identified: true,
            uuid: ''
        };
    }

    async _updateObject(event, formData) {
        const quest = expandObject(formData);
        
        // Convert string arrays back to arrays
        if (typeof quest.criteria === 'string') {
            quest.criteria = quest.criteria.split('\n').filter(c => c.trim());
        }
        if (typeof quest.tasks === 'string') {
            quest.tasks = quest.tasks.split('\n').map(t => ({
                text: t.trim(),
                completed: false
            })).filter(t => t.text);
        }
        if (typeof quest.participants === 'string') {
            quest.participants = quest.participants.split('\n').filter(p => p.trim());
        }
        if (typeof quest.related === 'string') {
            quest.related = quest.related.split('\n').filter(r => r.trim());
        }
        if (typeof quest.tags === 'string') {
            quest.tags = quest.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        if (typeof quest.reward.items === 'string') {
            quest.reward.items = quest.reward.items.split('\n').filter(i => i.trim());
        }

        // Convert numeric values
        quest.reward.xp = Number(quest.reward.xp) || 0;
        quest.reward.gold = Number(quest.reward.gold) || 0;
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

        if (this.quest.uuid) {
            // Update existing page
            const page = journal.pages.find(p => p.getFlag(MODULE.ID, 'questUuid') === this.quest.uuid);
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
            await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
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

        content += `<p><strong>CATEGORY:</strong> ${quest.category}</p>\n\n`;

        if (quest.criteria.length) {
            content += `<p><strong>CRITERIA:</strong></p>\n<ul>\n`;
            quest.criteria.forEach(c => content += `<li>${c}</li>\n`);
            content += `</ul>\n\n`;
        }

        if (quest.timeframe.dueDate || quest.timeframe.duration) {
            content += `<p><strong>TIMEFRAME:</strong></p>\n<ul>\n`;
            if (quest.timeframe.dueDate) content += `<li>Due: ${quest.timeframe.dueDate}</li>\n`;
            if (quest.timeframe.duration) content += `<li>Duration: ${quest.timeframe.duration}</li>\n`;
            content += `</ul>\n\n`;
        }

        if (quest.description) {
            content += `<p><strong>DESCRIPTION:</strong></p>\n<p>${quest.description}</p>\n\n`;
        }

        if (quest.tasks.length) {
            content += `<p><strong>TASKS:</strong></p>\n<ul>\n`;
            quest.tasks.forEach(t => content += `<li>${t.text}</li>\n`);
            content += `</ul>\n\n`;
        }

        if (quest.reward.xp || quest.reward.gold || quest.reward.items.length) {
            content += `<p><strong>REWARD:</strong></p>\n<ul>\n`;
            if (quest.reward.xp) content += `<li>XP: ${quest.reward.xp}</li>\n`;
            if (quest.reward.gold) content += `<li>Gold: ${quest.reward.gold}</li>\n`;
            if (quest.reward.items.length) {
                quest.reward.items.forEach(i => content += `<li>${i}</li>\n`);
            }
            content += `</ul>\n\n`;
        }

        if (quest.participants.length) {
            content += `<p><strong>PARTICIPANTS:</strong></p>\n<ul>\n`;
            quest.participants.forEach(p => content += `<li>${p}</li>\n`);
            content += `</ul>\n\n`;
        }

        if (quest.plotHook) {
            content += `<p><strong>PLOT HOOK:</strong></p>\n<p>${quest.plotHook}</p>\n\n`;
        }

        if (quest.progress.status || quest.progress.percentage) {
            content += `<p><strong>PROGRESS:</strong></p>\n<ul>\n`;
            if (quest.progress.status) content += `<li>Status: ${quest.progress.status}</li>\n`;
            if (quest.progress.percentage) content += `<li>Progress: ${quest.progress.percentage}%</li>\n`;
            content += `</ul>\n\n`;
        }

        if (quest.related.length) {
            content += `<p><strong>RELATED:</strong></p>\n<ul>\n`;
            quest.related.forEach(r => content += `<li>${r}</li>\n`);
            content += `</ul>\n\n`;
        }

        if (quest.tags.length) {
            content += `<p><strong>TAGS:</strong> ${quest.tags.join(', ')}</p>\n\n`;
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