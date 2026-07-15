import { MODULE } from './const.js';
import { QuestParser, getQuestStatusDisplayLabel } from './utility-quest-parser.js';
import { getTextEditor, getPartyActors } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2 || getBlacksmith()?.getWindowBaseV2?.();
if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for QuestWindow');
}

export const QUEST_WINDOW_ID = `${MODULE.ID}-quest-window`;

const TASK_PREFIXES = {
    completed: '[x]',
    failed: '[!]',
    hidden: '[-]',
    active: '[ ]'
};

export class QuestWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'quest-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: QUEST_WINDOW_ID,
            classes: ['quest-entry-window', 'quest-window', 'squire-window'],
            position: { width: 860, height: 900 },
            window: { title: 'Quest', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 700, minHeight: 640 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-quest.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(quest = null, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${QUEST_WINDOW_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, QuestWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, QuestWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.pageUuid = opts.pageUuid || null;
        this.page = opts.page || null;
        this.isEditing = !!this.pageUuid;
        this.quest = this._normalizeQuest(foundry.utils.mergeObject(this._getDefaultQuest(), quest || {}, { inplace: false }));
        this.quest.pageUuid = this.pageUuid;
        this._eventHandlers = [];
    }

    static async fromPage(page, options = {}) {
        let quest = null;
        try {
            let content = '';
            if (typeof page?.text?.content === 'string') {
                content = page.text.content;
            } else if (typeof page?.text === 'string') {
                content = page.text;
            } else if (page?.text?.content) {
                content = await page.text.content;
            }

            const TextEditor = getTextEditor();
            const enriched = await TextEditor.enrichHTML(content || '', {
                secrets: game.user.isGM,
                documents: true,
                links: true,
                rolls: true
            });
            quest = await QuestParser.parseSinglePage(page, enriched);
        } catch (error) {
            console.error('Coffee Pub Squire | Error parsing quest page for edit:', error);
        }

        const pageQuestUuid = page?.getFlag?.(MODULE.ID, 'questUuid') || '';
        const pageVisible = page?.getFlag?.(MODULE.ID, 'visible');
        const originalCategory = page?.getFlag?.(MODULE.ID, 'originalCategory') || '';

        return new QuestWindow(
            foundry.utils.mergeObject(
                quest || { name: page?.name || '' },
                {
                    questUuid: pageQuestUuid,
                    originalCategory,
                    visible: pageVisible !== false
                },
                { inplace: false }
            ),
            {
                ...options,
                pageUuid: page?.uuid || options.pageUuid || null,
                page
            }
        );
    }

    async getData() {
        const tagGroups = this._getSuggestedTagGroups();
        const activeObjectiveIndex = await this._getActiveObjectiveIndexForWindow();
        return {
            appId: this.id,
            quest: this.quest,
            isEditing: this.isEditing,
            isGM: game.user.isGM,
            windowTitle: 'Quest',
            headerTitle: this._getHeaderTitle(),
            subtitle: this.isEditing ? 'Edit Quest' : '',
            existingCategories: this._getExistingCategories(),
            existingLocations: this._getExistingLocations(),
            statusOptions: this._getStatusOptions(),
            objectiveCards: this._getObjectiveCards(activeObjectiveIndex),
            partyParticipants: this._getPartyParticipantsView(),
            extraParticipants: this._getExtraParticipantsView(),
            suggestedTags: tagGroups.suggested,
            otherTags: tagGroups.other,
            treasureText: this._serializeTreasure(this.quest.reward?.treasure)
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;
        this._clearEventHandlers();
        this._attachLocalListeners(root);
    }

    _attachLocalListeners(root) {
        const form = root.querySelector('form');
        if (form) {
            const handler = (event) => {
                event.preventDefault();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', handler);
            this._eventHandlers.push({ element: form, event: 'submit', handler });
        }

        this._setupDragAndDrop(root);
        this._setupFormInteractions(root);
        this._setupImageManagement(root);
        this._updateFormFields();
    }

    _getDefaultQuest() {
        const defaultCategory = this._getDefaultCategory();
        return {
            name: '',
            img: null,
            category: defaultCategory,
            description: '',
            plotHook: '',
            location: '',
            timeframe: {
                duration: ''
            },
            tasks: [],
            reward: {
                xp: 0,
                treasure: []
            },
            participants: [],
            status: 'Not Started',
            tags: [],
            visible: false,
            questUuid: '',
            originalCategory: '',
            pageUuid: null
        };
    }

    _getDefaultCategory() {
        const categories = this._getExistingCategories().filter(category => category !== 'Pinned');
        if (categories.includes('Main Quest')) return 'Main Quest';
        if (categories.includes('Side Quest')) return 'Side Quest';
        return categories[0] || '';
    }

    _normalizeQuest(quest) {
        const normalized = foundry.utils.mergeObject(this._getDefaultQuest(), quest || {}, { inplace: false });
        normalized.name = String(normalized.name || '').trim();
        normalized.img = normalized.img ? String(normalized.img).trim() : null;
        normalized.category = String(normalized.category || '').trim();
        normalized.description = String(normalized.description || '').trim();
        normalized.plotHook = String(normalized.plotHook || '').trim();
        normalized.location = String(normalized.location || '').trim();
        normalized.status = this._normalizeStatus(normalized.status);
        normalized.tags = this._normalizeTags(normalized.tags);
        normalized.tasks = this._normalizeTaskArray(normalized.tasks);
        normalized.participants = this._normalizeParticipants(normalized.participants);
        normalized.reward = normalized.reward && typeof normalized.reward === 'object' ? normalized.reward : {};
        normalized.reward.xp = Number(normalized.reward.xp) || 0;
        normalized.reward.treasure = this._normalizeTreasure(normalized.reward.treasure);
        normalized.timeframe = normalized.timeframe && typeof normalized.timeframe === 'object' ? normalized.timeframe : {};
        normalized.timeframe.duration = String(normalized.timeframe.duration || '').trim();
        normalized.visible = normalized.visible === true;
        normalized.questUuid = String(normalized.questUuid || '').trim();
        normalized.originalCategory = String(normalized.originalCategory || '').trim();
        normalized.pageUuid = normalized.pageUuid || this.pageUuid || null;
        return normalized;
    }

    _getHeaderTitle() {
        if (this.isEditing) {
            return String(this.quest?.name || this.page?.name || 'Untitled Quest').trim() || 'Untitled Quest';
        }
        return 'New Quest';
    }

    _getStatusOptions() {
        return [
            { value: 'Not Started', label: 'Available' },
            { value: 'In Progress', label: 'Active' },
            { value: 'Complete', label: 'Succeeded' },
            { value: 'Failed', label: 'Failed' }
        ];
    }

    _getSuggestedTagGroups() {
        return {
            suggested: [
                'Main',
                'Side',
                'Urgent',
                'Narrative',
                'Exploration',
                'Combat'
            ],
            other: [
                'Artifact',
                'Bounty',
                'Dungeon',
                'Escort',
                'Faction',
                'Investigation',
                'Mystery',
                'Party',
                'Personal',
                'Political',
                'Social',
                'Travel'
            ]
        };
    }

    _getPartyActors() {
        // Sorted by name for the picker; the helper returns configured order.
        return getPartyActors()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }

    _getPartyParticipantsView() {
        const selected = this._normalizeParticipants(this.quest.participants);
        return this._getPartyActors().map(actor => {
            const match = selected.find(participant =>
                (participant.uuid && participant.uuid === actor.uuid)
                || (!participant.uuid && participant.name && participant.name === actor.name)
            );
            return {
                uuid: actor.uuid,
                name: actor.name,
                img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg',
                selected: !!match
            };
        });
    }

    _getExtraParticipantsView() {
        return this._getExtraParticipants(this.quest.participants).map((participant, index) => ({
            index,
            uuid: participant.uuid || '',
            name: participant.name || 'Participant',
            img: participant.img || ''
        }));
    }

    _getExtraParticipants(participants = this.quest.participants) {
        const partyActors = this._getPartyActors();
        return this._normalizeParticipants(participants).filter(participant => {
            return !partyActors.some(actor =>
                (participant.uuid && participant.uuid === actor.uuid)
                || (!participant.uuid && participant.name && participant.name === actor.name)
            );
        });
    }

    _getObjectiveCards(activeObjectiveIndex = null) {
        return this._normalizeTaskArray(this.quest.tasks).map((task, index) => ({
            index,
            number: index + 1,
            isCurrent: activeObjectiveIndex === index,
            status: task.state || 'active',
            description: task.text || '',
            gmNote: task.gmHint || '',
            treasure: Array.isArray(task.treasureUnlocks) ? task.treasureUnlocks.join(', ') : ''
        }));
    }

    async _getActiveObjectiveIndexForWindow() {
        if (!this.pageUuid) return null;
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            const activeData = activeObjectives.active;
            if (activeData && typeof activeData === 'string') {
                const [storedUuid, indexStr] = activeData.split('|');
                if (storedUuid === this.pageUuid) {
                    const index = Number.parseInt(indexStr, 10);
                    return Number.isNaN(index) ? null : index;
                }
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error getting active objective for quest window:', error);
        }
        return null;
    }

    _decodeHtmlEntities(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        try {
            const parsed = new DOMParser().parseFromString(`<div>${text}</div>`, 'text/html');
            return parsed.body?.textContent?.trim() || text;
        } catch (_) {
            return text;
        }
    }

    _getExistingCategories() {
        const storedCategories = game.settings.get(MODULE.ID, 'questCategories') || [];
        const categories = [];
        for (const category of storedCategories) {
            const normalized = this._decodeHtmlEntities(category);
            if (!normalized || normalized === 'Pinned') continue;
            if (!categories.some(existing => existing.toLowerCase() === normalized.toLowerCase())) {
                categories.push(normalized);
            }
        }

        const currentCategory = String(this.quest?.category || '').trim();
        if (currentCategory && !categories.some(category => category.toLowerCase() === currentCategory.toLowerCase())) {
            categories.push(currentCategory);
        }

        return categories;
    }

    _getExistingLocations() {
        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        if (!journalId || journalId === 'none') return [];

        const journal = game.journal.get(journalId);
        if (!journal) return [];

        const locations = new Set();
        for (const page of journal.pages.contents) {
            try {
                const content = page.text?.content || '';
                const locationMatch = content.match(/<strong>Location:<\/strong>\s*([^<]+)/);
                if (locationMatch) {
                    const location = this._decodeHtmlEntities(locationMatch[1]);
                    if (location) locations.add(location);
                }
            } catch (_) {}
        }

        const currentLocation = String(this.quest?.location || '').trim();
        if (currentLocation) locations.add(currentLocation);

        return Array.from(locations).sort((a, b) => a.localeCompare(b));
    }

    async _handleFormSubmit(event) {
        event?.preventDefault?.();
        const form = event?.target?.closest?.('form') || event?.target || this._getRoot()?.querySelector('form');
        if (!form) return;
        const quest = this._collectFormQuest(form);
        await this._updateObject(event, quest);
    }

    _collectFormQuest(form) {
        const formData = new FormData(form);
        const quest = {};
        for (const [key, value] of formData.entries()) {
            foundry.utils.setProperty(quest, key, value);
        }
        quest.visible = !(form.querySelector('#quest-hidden-toggle')?.checked ?? !this.quest.visible);
        quest.tasks = this._collectObjectivesFromForm(form);
        quest.participants = this._collectParticipantsFromForm(form);
        quest.activeObjectiveIndex = this._collectCurrentObjectiveIndex(form);
        return quest;
    }

    async _updateObject(_event, formData) {
        const wasEditing = this.isEditing;
        const quest = (formData?.reward || formData?.timeframe || Array.isArray(formData?.tasks) || Array.isArray(formData?.participants))
            ? foundry.utils.mergeObject({}, formData, { inplace: false })
            : foundry.utils.expandObject(formData);
        quest.pageUuid = this.pageUuid || quest.pageUuid || null;
        quest.visible = quest.visible === true;
        quest.questUuid = String(quest.questUuid || this.quest.questUuid || foundry.utils.randomID()).trim();
        quest.category = String(quest.category || '').trim();
        quest.location = String(quest.location || '').trim();
        quest.description = String(quest.description || '').trim();
        quest.plotHook = String(quest.plotHook || '').trim();
        quest.status = this._normalizeStatus(quest.status);
        quest.tags = this._normalizeTags(quest.tags);
        quest.tasks = Array.isArray(quest.tasks)
            ? this._normalizeTaskArray(quest.tasks)
            : this._parseTasksInput(quest.tasks);
        quest.participants = Array.isArray(quest.participants)
            ? this._normalizeParticipants(quest.participants)
            : this._parseParticipantsInput(quest.participants);
        quest.reward = quest.reward && typeof quest.reward === 'object' ? quest.reward : {};
        quest.reward.xp = Number(quest.reward.xp) || 0;
        quest.reward.treasure = Array.isArray(quest.reward.treasure)
            ? this._normalizeTreasure(quest.reward.treasure)
            : this._parseTreasureInput(quest.reward.treasure);
        quest.timeframe = quest.timeframe && typeof quest.timeframe === 'object' ? quest.timeframe : {};
        quest.timeframe.duration = String(quest.timeframe.duration || '').trim();
        quest.img = quest.img ? String(quest.img).trim() : null;
        quest.originalCategory = this._resolveOriginalCategoryForSave(quest);
        quest.activeObjectiveIndex = Number.isInteger(quest.activeObjectiveIndex) ? quest.activeObjectiveIndex : null;

        this.quest = this._normalizeQuest(foundry.utils.mergeObject(this.quest, quest, { inplace: false }));

        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No quest journal selected. Please select a journal in the quest panel settings.');
            return false;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected quest journal not found.');
            return false;
        }

        try {
            await this._ensureCategoryRegistered(this.quest.category);

            const pageData = {
                name: this.quest.name,
                type: 'text',
                text: {
                    content: this._generateJournalContent(this.quest)
                }
            };

            let page = this.page;
            if (this.isEditing && this.pageUuid) {
                page = page || await fromUuid(this.pageUuid);
                if (!page) {
                    ui.notifications.error('The quest you are editing could not be found.');
                    return false;
                }
                await page.update(pageData);
            } else {
                pageData.flags = {
                    [MODULE.ID]: {
                        questUuid: this.quest.questUuid
                    }
                };
                const [createdPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                page = createdPage || null;
            }

            if (!page) {
                ui.notifications.error('Failed to save the quest page.');
                return false;
            }

            this.page = page;
            this.pageUuid = page.uuid;
            this.isEditing = true;
            this.quest.pageUuid = page.uuid;

            if (page.getFlag(MODULE.ID, 'questUuid') !== this.quest.questUuid) {
                await page.setFlag(MODULE.ID, 'questUuid', this.quest.questUuid);
            }
            await page.setFlag(MODULE.ID, 'visible', this.quest.visible !== false);

            if (this.quest.originalCategory) {
                await page.setFlag(MODULE.ID, 'originalCategory', this.quest.originalCategory);
            } else if (page.getFlag(MODULE.ID, 'originalCategory')) {
                if (typeof page.unsetFlag === 'function') {
                    await page.unsetFlag(MODULE.ID, 'originalCategory');
                } else {
                    await page.setFlag(MODULE.ID, 'originalCategory', null);
                }
            }

            await this._applyActiveObjectiveSelection(page.uuid, quest.activeObjectiveIndex);

            ui.notifications.info(`Quest "${this.quest.name}" ${wasEditing ? 'updated' : 'saved'} successfully.`);
            await this._refreshQuestPanel();
            await this.close();
            return true;
        } catch (error) {
            console.error('Coffee Pub Squire | Error saving quest:', error);
            ui.notifications.error(`Failed to save quest: ${error.message}`);
            return false;
        }
    }

    _resolveOriginalCategoryForSave(quest) {
        const originalFlag = this.page?.getFlag?.(MODULE.ID, 'originalCategory') || this.quest.originalCategory || '';
        const category = String(quest.category || '').trim();
        if (quest.status === 'Complete' || quest.status === 'Failed') {
            if (category && !['Completed', 'Failed'].includes(category)) {
                return category;
            }
            return originalFlag;
        }
        if (category && !['Completed', 'Failed'].includes(category)) {
            return '';
        }
        return originalFlag;
    }

    _generateJournalContent(quest) {
        let content = '';

        if (quest.img) {
            content += `<img src="${this._escapeAttribute(quest.img)}" alt="${this._escapeAttribute(quest.name)}">\n\n`;
        }
        if (quest.category) {
            content += `<p><strong>Category:</strong> ${this._renderInlineText(quest.category)}</p>\n\n`;
        }
        if (quest.description) {
            content += `<p><strong>Description:</strong> ${this._renderInlineText(quest.description)}</p>\n\n`;
        }
        if (quest.location) {
            content += `<p><strong>Location:</strong> ${this._renderInlineText(quest.location)}</p>\n\n`;
        }
        if (quest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${this._renderInlineText(quest.plotHook)}</p>\n\n`;
        }
        if (quest.tasks?.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            for (const task of quest.tasks) {
                const rawText = this._escapeHtml(task.originalText || task.text || '');
                if (!rawText) continue;
                if (task.state === 'completed') {
                    content += `<li><s>${rawText}</s></li>\n`;
                } else if (task.state === 'failed') {
                    content += `<li><code>${rawText}</code></li>\n`;
                } else if (task.state === 'hidden') {
                    content += `<li><em>${rawText}</em></li>\n`;
                } else {
                    content += `<li>${rawText}</li>\n`;
                }
            }
            content += `</ul>\n\n`;
        }
        if (quest.reward?.xp) {
            content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
        }
        if (quest.reward?.treasure?.length) {
            content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
            for (const treasure of quest.reward.treasure) {
                const line = this._renderLinkableLine(treasure);
                if (line) content += `<li>${line}</li>\n`;
            }
            content += `</ul>\n\n`;
        }
        if (quest.timeframe?.duration) {
            content += `<p><strong>Duration:</strong> ${this._renderInlineText(quest.timeframe.duration)}</p>\n\n`;
        }
            content += `<p><strong>Status:</strong> ${this._renderInlineText(getQuestStatusDisplayLabel(quest.status || 'Not Started'))}</p>\n\n`;
        if (quest.tags?.length) {
            content += `<p><strong>Tags:</strong> ${this._renderInlineText(quest.tags.join(', '))}</p>\n\n`;
        }
        if (quest.participants?.length) {
            content += `<p><strong>Participants:</strong></p>\n<ul>\n`;
            for (const participant of quest.participants) {
                const line = this._renderLinkableLine(participant);
                if (line) content += `<li>${line}</li>\n`;
            }
            content += `</ul>\n\n`;
        }

        return content;
    }

    _setupFormInteractions(root) {
        const nameInput = root.querySelector('#name');
        if (nameInput) {
            const handler = () => {
                this.quest.name = nameInput.value || '';
                this._updateHeaderFields();
            };
            nameInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: nameInput, event: 'input', handler });
        }

        const hiddenToggle = root.querySelector('#quest-hidden-toggle');
        if (hiddenToggle) {
            const handler = () => {
                this.quest.visible = !hiddenToggle.checked;
            };
            hiddenToggle.addEventListener('change', handler);
            this._eventHandlers.push({ element: hiddenToggle, event: 'change', handler });
        }

        const locationSelect = root.querySelector('#location');
        const newLocationInput = root.querySelector('#new-location');
        const newLocationInputField = root.querySelector('.new-location-input-field');
        if (locationSelect) {
            const handler = () => this._syncLocationFieldVisibility(locationSelect, newLocationInput, newLocationInputField);
            locationSelect.addEventListener('change', handler);
            this._eventHandlers.push({ element: locationSelect, event: 'change', handler });
        }

        const tagsInput = root.querySelector('#tags');
        if (tagsInput) {
            const handler = () => {
                this.quest.tags = this._normalizeTags(tagsInput.value);
                this._updateTagChipStates(root);
            };
            tagsInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: tagsInput, event: 'input', handler });
        }

        root.querySelectorAll('.quest-tag-chip').forEach(chip => {
            const handler = () => {
                const value = String(chip.dataset.tagValue || '').trim();
                if (!value) return;
                const current = this._normalizeTags(tagsInput?.value || this.quest.tags || []);
                const exists = current.some(tag => tag.toLowerCase() === value.toLowerCase());
                this.quest.tags = exists
                    ? current.filter(tag => tag.toLowerCase() !== value.toLowerCase())
                    : [...current, value];
                if (tagsInput) {
                    tagsInput.value = this.quest.tags.join(', ');
                }
                this._updateTagChipStates(root);
            };
            chip.addEventListener('click', handler);
            this._eventHandlers.push({ element: chip, event: 'click', handler });
        });

        const addObjectiveButton = root.querySelector('.quest-add-objective');
        if (addObjectiveButton) {
            const handler = async () => {
                this._syncFormStateFromDom();
                const tasks = this._normalizeTaskArray(this.quest.tasks);
                tasks.push({
                    text: '',
                    originalText: '',
                    gmHint: null,
                    treasureUnlocks: [],
                    state: 'active',
                    completed: false,
                    objectiveNumber: tasks.length + 1,
                    isDraft: true
                });
                this.quest.tasks = tasks;
                await this.render(true);
            };
            addObjectiveButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: addObjectiveButton, event: 'click', handler });
        }

        root.querySelectorAll('.quest-objective-delete-btn').forEach(button => {
            const handler = async () => {
                const index = Number(button.dataset.objectiveIndex);
                if (Number.isNaN(index)) return;
                this._syncFormStateFromDom();
                const tasks = this._normalizeTaskArray(this.quest.tasks);
                tasks.splice(index, 1);
                this.quest.tasks = tasks.map((task, taskIndex) => ({ ...task, objectiveNumber: taskIndex + 1 }));
                await this.render(true);
            };
            button.addEventListener('click', handler);
            this._eventHandlers.push({ element: button, event: 'click', handler });
        });

        root.querySelectorAll('.quest-objective-move-btn').forEach(button => {
            const handler = async () => {
                const index = Number(button.dataset.objectiveIndex);
                const direction = String(button.dataset.moveDirection || '');
                if (Number.isNaN(index) || !['up', 'down'].includes(direction)) return;
                this._syncFormStateFromDom();
                const tasks = this._normalizeTaskArray(this.quest.tasks);
                const targetIndex = direction === 'up' ? index - 1 : index + 1;
                if (targetIndex < 0 || targetIndex >= tasks.length) return;
                [tasks[index], tasks[targetIndex]] = [tasks[targetIndex], tasks[index]];
                this.quest.tasks = tasks.map((task, taskIndex) => ({ ...task, objectiveNumber: taskIndex + 1 }));
                await this.render(true);
            };
            button.addEventListener('click', handler);
            this._eventHandlers.push({ element: button, event: 'click', handler });
        });

        root.querySelectorAll('.quest-objective-current-btn').forEach(button => {
            const handler = () => {
                const alreadyCurrent = button.classList.contains('is-current');
                root.querySelectorAll('.quest-objective-current-btn').forEach(other => {
                    other.classList.remove('is-current');
                    other.dataset.current = 'false';
                    const span = other.querySelector('span');
                    if (span) span.textContent = 'Set Current';
                });
                if (!alreadyCurrent) {
                    button.classList.add('is-current');
                    button.dataset.current = 'true';
                    const span = button.querySelector('span');
                    if (span) span.textContent = 'Current';
                }
            };
            button.addEventListener('click', handler);
            this._eventHandlers.push({ element: button, event: 'click', handler });
        });

        root.querySelectorAll('.quest-party-member-checkbox').forEach(checkbox => {
            const handler = () => {
                checkbox.closest('.quest-party-member')?.classList.toggle('is-selected', checkbox.checked);
            };
            checkbox.addEventListener('change', handler);
            this._eventHandlers.push({ element: checkbox, event: 'change', handler });
        });

        root.querySelectorAll('.quest-extra-participant-remove').forEach(button => {
            const handler = async () => {
                const index = Number(button.dataset.extraIndex);
                if (Number.isNaN(index)) return;
                this._syncFormStateFromDom();
                const extras = this._getExtraParticipants(this.quest.participants);
                extras.splice(index, 1);
                this.quest.participants = this._mergeParticipants(this._getSelectedPartyParticipantsFromQuest(), extras);
                await this.render(true);
            };
            button.addEventListener('click', handler);
            this._eventHandlers.push({ element: button, event: 'click', handler });
        });
    }

    _syncLocationFieldVisibility(locationSelect, newLocationInput, newLocationInputField) {
        if (!locationSelect || !newLocationInput) return;
        if (locationSelect.value === 'new') {
            if (newLocationInputField) newLocationInputField.style.display = 'flex';
            newLocationInput.setAttribute('name', 'location');
            locationSelect.removeAttribute('name');
            newLocationInput.focus();
        } else {
            if (newLocationInputField) newLocationInputField.style.display = 'none';
            newLocationInput.removeAttribute('name');
            locationSelect.setAttribute('name', 'location');
        }
    }

    _syncFormStateFromDom() {
        const form = this._getRoot()?.querySelector('form');
        if (!form) return;
        const draft = this._collectFormQuest(form);
        this.quest = this._normalizeQuest(foundry.utils.mergeObject(this.quest, draft, { inplace: false }));
    }

    _collectObjectivesFromForm(form) {
        return Array.from(form.querySelectorAll('.quest-objective-card')).map((card, index) => {
            const status = String(card.querySelector('.quest-objective-status-input')?.value || 'active').trim();
            const description = String(card.querySelector('.quest-objective-description-input')?.value || '').trim();
            const gmNote = String(card.querySelector('.quest-objective-note-input')?.value || '').trim();
            const treasureText = String(card.querySelector('.quest-objective-treasure-input')?.value || '').trim();
            if (!description) return null;

            const treasureUnlocks = this._tokenizeCommaSeparated(treasureText);
            const originalText = this._buildObjectiveOriginalText(description, gmNote, treasureUnlocks);
            return {
                text: description,
                originalText,
                gmHint: gmNote || null,
                treasureUnlocks,
                state: ['completed', 'failed', 'hidden', 'active'].includes(status) ? status : 'active',
                completed: status === 'completed',
                objectiveNumber: index + 1
            };
        }).filter(Boolean);
    }

    _buildObjectiveOriginalText(description, gmNote, treasureUnlocks) {
        const segments = [String(description || '').trim()];
        if (gmNote) segments.push(`||${String(gmNote).trim()}||`);
        for (const treasure of treasureUnlocks || []) {
            if (treasure) segments.push(`((${treasure}))`);
        }
        return segments.filter(Boolean).join(' ').trim();
    }

    _collectParticipantsFromForm(form) {
        const selectedParty = Array.from(form.querySelectorAll('.quest-party-member-checkbox:checked')).map(input => {
            const actor = this._getPartyActors().find(entry => entry.uuid === input.value);
            if (!actor) return null;
            return {
                uuid: actor.uuid,
                name: actor.name,
                img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
            };
        }).filter(Boolean);

        const extras = Array.from(form.querySelectorAll('.quest-extra-participant')).map(element => ({
            uuid: String(element.dataset.uuid || '').trim(),
            name: String(element.dataset.name || '').trim(),
            img: String(element.dataset.img || '').trim()
        })).filter(participant => participant.uuid || participant.name);

        return this._mergeParticipants(selectedParty, extras);
    }

    _collectCurrentObjectiveIndex(form) {
        const currentButton = form.querySelector('.quest-objective-current-btn.is-current, .quest-objective-current-btn[data-current="true"]');
        if (!currentButton) return null;
        const index = Number(currentButton.dataset.objectiveIndex);
        return Number.isNaN(index) ? null : index;
    }

    _getSelectedPartyParticipantsFromQuest() {
        const selected = this._normalizeParticipants(this.quest.participants);
        return this._getPartyActors().map(actor => {
            const match = selected.find(participant =>
                (participant.uuid && participant.uuid === actor.uuid)
                || (!participant.uuid && participant.name && participant.name === actor.name)
            );
            if (!match) return null;
            return {
                uuid: actor.uuid,
                name: actor.name,
                img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
            };
        }).filter(Boolean);
    }

    _setupImageManagement(root) {
        const browseImageButton = root.querySelector('.quest-browse-image');
        if (browseImageButton) {
            const handler = async () => {
                if (typeof FilePicker !== 'function') {
                    ui.notifications.warn('Image browser is unavailable.');
                    return;
                }

                const picker = new FilePicker({
                    type: 'imagevideo',
                    current: this.quest.img || '',
                    callback: (path) => {
                        this.quest.img = path || null;
                        this._updateFormFields();
                    }
                });
                picker.render(true);
            };
            browseImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: browseImageButton, event: 'click', handler });
        }

        const removeImageButton = root.querySelector('.quest-remove-image');
        if (removeImageButton) {
            const handler = () => {
                this.quest.img = null;
                this._updateFormFields();
            };
            removeImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: removeImageButton, event: 'click', handler });
        }

        const preview = root.querySelector('.quest-image-preview');
        if (preview) {
            const handler = async () => {
                if (!this.quest.img) return;
                // v13 AppV2 signature: src and title live in options
                const popout = new foundry.applications.apps.ImagePopout({
                    src: this.quest.img,
                    uuid: this.pageUuid || undefined,
                    window: { title: this.quest.name || 'Quest Image' }
                });
                await popout.render(true);
            };
            preview.addEventListener('click', handler);
            this._eventHandlers.push({ element: preview, event: 'click', handler });
        }
    }

    _setupDragAndDrop(root) {
        const dragZone = root.querySelector('.quest-drag-zone');
        if (dragZone) {
            const newDragZone = dragZone.cloneNode(true);
            dragZone.parentNode?.replaceChild(newDragZone, dragZone);

            const dragEnterHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                newDragZone.classList.add('drag-active');
            };
            const dragLeaveHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                newDragZone.classList.remove('drag-active');
            };
            const dragOverHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
            };
            const dropHandler = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                newDragZone.classList.remove('drag-active');

                try {
                    this._syncFormStateFromDom();
                    const TextEditor = getTextEditor();
                    const data = TextEditor?.getDragEventData?.(event)
                        || JSON.parse(event.dataTransfer.getData('text/plain'));

                    if (data.type === 'Actor') {
                        await this._handleActorDrop(data);
                    } else if (data.type === 'Item') {
                        await this._handleItemDrop(data);
                    } else if (data.type === 'JournalEntry' || data.type === 'JournalEntryPage') {
                        await this._handleJournalDrop(data);
                    }
                } catch (error) {
                    console.error('Coffee Pub Squire | Error processing dropped Quest entity:', error);
                }
            };

            newDragZone.addEventListener('dragenter', dragEnterHandler);
            newDragZone.addEventListener('dragleave', dragLeaveHandler);
            newDragZone.addEventListener('dragover', dragOverHandler);
            newDragZone.addEventListener('drop', dropHandler);

            this._eventHandlers.push(
                { element: newDragZone, event: 'dragenter', handler: dragEnterHandler },
                { element: newDragZone, event: 'dragleave', handler: dragLeaveHandler },
                { element: newDragZone, event: 'dragover', handler: dragOverHandler },
                { element: newDragZone, event: 'drop', handler: dropHandler }
            );
        }

        root.querySelectorAll('.quest-item-drop-target').forEach(target => {
            const dragEnterHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                target.classList.add('drag-active');
            };
            const dragLeaveHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                target.classList.remove('drag-active');
            };
            const dragOverHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
            };
            const dropHandler = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                target.classList.remove('drag-active');

                try {
                    this._syncFormStateFromDom();
                    const TextEditor = getTextEditor();
                    const data = TextEditor?.getDragEventData?.(event)
                        || JSON.parse(event.dataTransfer.getData('text/plain'));
                    if (data.type !== 'Item') return;
                    await this._handleTreasureFieldDrop(data, target);
                } catch (error) {
                    console.error('Coffee Pub Squire | Error processing treasure drop:', error);
                }
            };

            target.addEventListener('dragenter', dragEnterHandler);
            target.addEventListener('dragleave', dragLeaveHandler);
            target.addEventListener('dragover', dragOverHandler);
            target.addEventListener('drop', dropHandler);

            this._eventHandlers.push(
                { element: target, event: 'dragenter', handler: dragEnterHandler },
                { element: target, event: 'dragleave', handler: dragLeaveHandler },
                { element: target, event: 'dragover', handler: dragOverHandler },
                { element: target, event: 'drop', handler: dropHandler }
            );
        });
    }

    async _handleActorDrop(data) {
        const actor = await fromUuid(data.uuid || `Actor.${data.id}`);
        if (!actor) return;

        this.quest.img = this.quest.img || actor.img || null;
        this.quest.description = this._appendPlainText(this.quest.description, this._extractDocumentDescription(actor));
        this.quest.location = this.quest.location || this._pickFirstString(actor, [
            'system.details.location',
            'system.details.birthplace',
            'system.details.origin',
            'system.details.home'
        ]);
        this.quest.participants = this._mergeParticipants(this.quest.participants, [
            {
                uuid: actor.uuid,
                name: actor.name,
                img: actor.img || 'icons/svg/mystery-man.svg'
            }
        ]);
        this.quest.tags = this._uniqueTags([
            ...this.quest.tags,
            'Character',
            actor.type
        ]);

        await this.render(true);
        ui.notifications.info(`Added participant: ${actor.name}`);
    }

    async _handleItemDrop(data) {
        const item = await fromUuid(data.uuid || `Item.${data.id}`);
        if (!item) return;

        this.quest.img = this.quest.img || item.img || null;
        this.quest.description = this._appendPlainText(this.quest.description, this._extractDocumentDescription(item));
        this.quest.reward.treasure = this._mergeTreasure(this.quest.reward.treasure, [
            {
                uuid: item.uuid,
                name: item.name
            }
        ]);
        this.quest.tags = this._uniqueTags([
            ...this.quest.tags,
            'Treasure',
            item.type
        ]);

        await this.render(true);
        ui.notifications.info(`Added treasure: ${item.name}`);
    }

    async _handleTreasureFieldDrop(data, target) {
        const item = await fromUuid(data.uuid || `Item.${data.id}`);
        if (!item || !target) return;

        const mode = target.dataset.dropMode;
        if (mode === 'reward-treasure') {
            this.quest.reward.treasure = this._mergeTreasure(this.quest.reward.treasure, [
                {
                    uuid: item.uuid,
                    name: item.name
                }
            ]);
            const rewardField = this._getRoot()?.querySelector('#reward-treasure');
            if (rewardField) rewardField.value = this._serializeTreasure(this.quest.reward.treasure);
            ui.notifications.info(`Added treasure reward: ${item.name}`);
            return;
        }

        if (mode === 'objective-treasure') {
            const current = String(target.value || '').trim();
            const names = this._tokenizeCommaSeparated(current);
            if (!names.some(name => name.toLowerCase() === item.name.toLowerCase())) {
                names.push(item.name);
            }
            target.value = names.join(', ');
            ui.notifications.info(`Added objective treasure: ${item.name}`);
        }
    }

    async _handleJournalDrop(data) {
        const dropped = await fromUuid(data.uuid || (data.type === 'JournalEntryPage' ? `JournalEntryPage.${data.id}` : `JournalEntry.${data.id}`));
        if (!dropped) return;

        let page = null;
        let journal = null;
        if (dropped.documentName === 'JournalEntryPage') {
            page = dropped;
            journal = dropped.parent || null;
        } else {
            journal = dropped;
            page = journal.pages?.contents?.[0] || null;
        }

        if (page) {
            try {
                const content = typeof page.text?.content === 'string' ? page.text.content : '';
                const TextEditor = getTextEditor();
                const enriched = await TextEditor.enrichHTML(content, {
                    secrets: game.user.isGM,
                    documents: true,
                    links: true,
                    rolls: true
                });
                const parsed = await QuestParser.parseSinglePage(page, enriched);
                if (parsed) {
                    if (!this.quest.name) this.quest.name = parsed.name || this.quest.name;
                    this.quest.img = this.quest.img || parsed.img || null;
                    if (!this.quest.category || this.quest.category === this._getDefaultCategory()) {
                        this.quest.category = parsed.category || this.quest.category || this._getDefaultCategory();
                    }
                    this.quest.description = this._appendPlainText(this.quest.description, parsed.description);
                    this.quest.plotHook = this._appendPlainText(this.quest.plotHook, parsed.plotHook);
                    this.quest.location = this.quest.location || parsed.location || '';
                    this.quest.timeframe.duration = this.quest.timeframe.duration || parsed.timeframe?.duration || '';
                    if (this.quest.status === 'Not Started' && parsed.status) {
                        this.quest.status = this._normalizeStatus(parsed.status);
                    }
                    this.quest.tasks = this._mergeTasks(this.quest.tasks, parsed.tasks);
                    this.quest.participants = this._mergeParticipants(this.quest.participants, parsed.participants);
                    this.quest.reward.xp = this.quest.reward.xp || parsed.reward?.xp || 0;
                    this.quest.reward.treasure = this._mergeTreasure(this.quest.reward.treasure, parsed.reward?.treasure);
                    this.quest.tags = this._uniqueTags([...(this.quest.tags || []), ...(parsed.tags || []), 'Journal']);
                    await this.render(true);
                    ui.notifications.info(`Imported quest data from: ${page.name}`);
                    return;
                }
            } catch (error) {
                console.warn('Coffee Pub Squire | Error parsing dropped journal for Quest entry:', error);
            }
        }

        const source = page || journal || dropped;
        if (!this.quest.name) this.quest.name = source.name || this.quest.name;
        this.quest.description = this._appendPlainText(this.quest.description, this._extractDocumentDescription(source));
        this.quest.tags = this._uniqueTags([...(this.quest.tags || []), 'Journal']);
        await this.render(true);
        ui.notifications.info(`Added journal content from: ${source.name}`);
    }

    _updateFormFields() {
        const form = this._getRoot()?.querySelector('form');
        if (!form) return;

        const nameInput = form.querySelector('input[name="name"]');
        if (nameInput) nameInput.value = this.quest.name || '';

        const descriptionTextarea = form.querySelector('textarea[name="description"]');
        if (descriptionTextarea) descriptionTextarea.value = this.quest.description || '';

        const plotHookTextarea = form.querySelector('textarea[name="plotHook"]');
        if (plotHookTextarea) plotHookTextarea.value = this.quest.plotHook || '';

        const treasureTextarea = form.querySelector('textarea[name="reward.treasure"]');
        if (treasureTextarea) treasureTextarea.value = this._serializeTreasure(this.quest.reward?.treasure);

        const tagsInput = form.querySelector('input[name="tags"]');
        if (tagsInput) tagsInput.value = (this.quest.tags || []).join(', ');

        const statusSelect = form.querySelector('select[name="status"]');
        if (statusSelect) statusSelect.value = this._normalizeStatus(this.quest.status);

        const xpInput = form.querySelector('input[name="reward.xp"]');
        if (xpInput) xpInput.value = this.quest.reward?.xp || 0;

        const durationInput = form.querySelector('input[name="timeframe.duration"]');
        if (durationInput) durationInput.value = this.quest.timeframe?.duration || '';

        const imgInput = form.querySelector('input[name="img"]');
        if (imgInput) imgInput.value = this.quest.img || '';

        const pageUuidInput = form.querySelector('input[name="pageUuid"]');
        if (pageUuidInput) pageUuidInput.value = this.pageUuid || '';

        const questUuidInput = form.querySelector('input[name="questUuid"]');
        if (questUuidInput) questUuidInput.value = this.quest.questUuid || '';

        const hiddenToggle = form.querySelector('#quest-hidden-toggle');
        if (hiddenToggle) hiddenToggle.checked = this.quest.visible !== true;

        this._updateHeaderFields();

        const categorySelect = form.querySelector('#category');
        if (categorySelect) {
            const hasExisting = this.quest.category
                && Array.from(categorySelect.options).some(option => option.value === this.quest.category);
            categorySelect.value = hasExisting ? this.quest.category : '';
        }

        const locationSelect = form.querySelector('#location');
        const newLocationInput = form.querySelector('#new-location');
        const newLocationInputField = form.querySelector('.new-location-input-field');
        if (locationSelect && newLocationInput) {
            const hasExisting = this.quest.location
                && Array.from(locationSelect.options).some(option => option.value === this.quest.location);
            if (hasExisting) {
                locationSelect.value = this.quest.location;
                newLocationInput.value = '';
                this._syncLocationFieldVisibility(locationSelect, newLocationInput, newLocationInputField);
            } else if (this.quest.location) {
                locationSelect.value = 'new';
                newLocationInput.value = this.quest.location;
                this._syncLocationFieldVisibility(locationSelect, newLocationInput, newLocationInputField);
            } else {
                locationSelect.value = '';
                newLocationInput.value = '';
                this._syncLocationFieldVisibility(locationSelect, newLocationInput, newLocationInputField);
            }
        }

        const imgSection = form.querySelector('.quest-image-section');
        const imgPlaceholder = form.querySelector('.quest-image-placeholder');
        const imgPreview = form.querySelector('.quest-image-preview');
        const removeImageButton = form.querySelector('.quest-remove-image');
        if (imgSection) {
            imgSection.style.display = '';
        }
        if (imgPlaceholder) {
            imgPlaceholder.style.display = this.quest.img ? 'none' : '';
        }
        if (imgPreview) {
            imgPreview.setAttribute('src', this.quest.img || '');
        }
        if (removeImageButton) {
            removeImageButton.classList.toggle('is-visible', !!this.quest.img);
        }

        const selectedPartyUuids = new Set(this._getSelectedPartyParticipantsFromQuest().map(participant => participant.uuid));
        form.querySelectorAll('.quest-party-member').forEach(card => {
            const uuid = card.dataset.actorUuid;
            const checked = !!uuid && selectedPartyUuids.has(uuid);
            card.classList.toggle('is-selected', checked);
            const checkbox = card.querySelector('.quest-party-member-checkbox');
            if (checkbox) checkbox.checked = checked;
        });

        this._updateTagChipStates(form);
    }

    _updateTagChipStates(root) {
        const tags = this._normalizeTags(this.quest.tags || []);
        root.querySelectorAll('.quest-tag-chip').forEach(chip => {
            const value = String(chip.dataset.tagValue || '').trim().toLowerCase();
            chip.classList.toggle('active', tags.some(tag => tag.toLowerCase() === value));
        });
    }

    _updateHeaderFields() {
        const root = this._getRoot();
        if (!root) return;
        const titleEl = root.querySelector('.quest-window-header-title');
        if (titleEl) {
            titleEl.textContent = this._getHeaderTitle();
        }
    }

    _normalizeStatus(status) {
        const normalized = String(status || '').trim();
        const values = this._getStatusOptions().map(o => o.value);
        return values.includes(normalized) ? normalized : 'Not Started';
    }

    _normalizeTags(tags) {
        if (Array.isArray(tags)) return this._uniqueTags(tags);
        if (typeof tags === 'string') return this._uniqueTags(tags.split(','));
        return [];
    }

    _uniqueTags(tags) {
        const values = [];
        for (const tag of tags || []) {
            if (tag === undefined || tag === null) continue;
            const normalized = String(tag).trim();
            if (!normalized) continue;
            if (!values.some(existing => existing.toLowerCase() === normalized.toLowerCase())) {
                values.push(normalized);
            }
        }
        return values;
    }

    _normalizeTaskArray(tasks) {
        if (typeof tasks === 'string') return this._parseTasksInput(tasks);
        if (!Array.isArray(tasks)) return [];
        return tasks
            .map((task, index) => {
                const raw = typeof task === 'string' ? { text: task } : (task || {});
                const originalText = String(raw.originalText || raw.text || '').trim();
                const parsedMeta = this._parseTaskMetadata(originalText || raw.text || '');
                const text = String(raw.text || parsedMeta.displayText || raw.originalText || '').trim();
                if (!text && !originalText && !raw.isDraft) return null;
                const state = ['completed', 'failed', 'hidden', 'active'].includes(raw.state) ? raw.state : (raw.completed ? 'completed' : 'active');
                return {
                    text: text || originalText,
                    originalText: originalText || text,
                    gmHint: raw.gmHint || parsedMeta.gmHint || null,
                    treasureUnlocks: Array.isArray(raw.treasureUnlocks) && raw.treasureUnlocks.length ? raw.treasureUnlocks : (parsedMeta.treasureUnlocks || []),
                    state,
                    completed: state === 'completed',
                    objectiveNumber: index + 1,
                    isDraft: !!raw.isDraft
                };
            })
            .filter(Boolean);
    }

    _parseTasksInput(tasksText) {
        const lines = String(tasksText || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        return lines.map((line, index) => {
            let state = 'active';
            let text = line;

            if (line.startsWith(TASK_PREFIXES.completed)) {
                state = 'completed';
                text = line.slice(TASK_PREFIXES.completed.length).trim();
            } else if (line.startsWith(TASK_PREFIXES.failed)) {
                state = 'failed';
                text = line.slice(TASK_PREFIXES.failed.length).trim();
            } else if (line.startsWith(TASK_PREFIXES.hidden)) {
                state = 'hidden';
                text = line.slice(TASK_PREFIXES.hidden.length).trim();
            } else if (line.startsWith(TASK_PREFIXES.active)) {
                text = line.slice(TASK_PREFIXES.active.length).trim();
            }

            const { displayText, gmHint, treasureUnlocks } = this._parseTaskMetadata(text);
            return {
                text: displayText,
                originalText: text,
                gmHint,
                treasureUnlocks,
                state,
                completed: state === 'completed',
                objectiveNumber: index + 1
            };
        }).filter(task => task.text);
    }

    _parseTaskMetadata(text) {
        let displayText = String(text || '').trim();
        let gmHint = null;
        let treasureUnlocks = [];

        const gmHintRegex = /\|\|([^|]+)\|\|/g;
        const gmHints = [];
        let gmHintMatch;
        while ((gmHintMatch = gmHintRegex.exec(displayText)) !== null) {
            gmHints.push(gmHintMatch[1].trim());
        }
        if (gmHints.length > 0) {
            gmHint = gmHints.join(' ');
            displayText = displayText.replace(gmHintRegex, '').trim();
        }

        const treasureRegex = /\(\(([^)]+)\)\)/g;
        const treasures = [];
        let treasureMatch;
        while ((treasureMatch = treasureRegex.exec(displayText)) !== null) {
            treasures.push(treasureMatch[1].trim());
        }
        if (treasures.length > 0) {
            treasureUnlocks = treasures;
            displayText = displayText.replace(treasureRegex, '').trim();
        }

        return { displayText, gmHint, treasureUnlocks };
    }

    _serializeTasks(tasks) {
        return this._normalizeTaskArray(tasks).map(task => {
            const raw = task.originalText || task.text || '';
            const prefix = task.state && task.state !== 'active' ? (TASK_PREFIXES[task.state] || '') : '';
            return prefix ? `${prefix} ${raw}` : raw;
        }).join('\n');
    }

    _tokenizeCommaSeparated(text) {
        return String(text || '')
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
    }

    _parseParticipantsInput(text) {
        return this._tokenizeLineList(text).map(token => {
            const match = token.match(/^@UUID\[([^\]]+)\]\{([^}]+)\}$/i);
            if (match) {
                return {
                    uuid: match[1].trim(),
                    name: match[2].trim()
                };
            }
            return { name: token };
        }).filter(participant => participant.uuid || participant.name);
    }

    _serializeParticipants(participants) {
        return this._normalizeParticipants(participants).map(participant => {
            if (participant.uuid) {
                return `@UUID[${participant.uuid}]{${participant.name || 'Participant'}}`;
            }
            return participant.name || '';
        }).filter(Boolean).join('\n');
    }

    _normalizeParticipants(participants) {
        if (typeof participants === 'string') return this._parseParticipantsInput(participants);
        if (!Array.isArray(participants)) return [];
        return participants.map(participant => {
            if (!participant) return null;
            if (typeof participant === 'string') {
                const name = participant.trim();
                return name ? { name } : null;
            }
            const uuid = String(participant.uuid || '').trim();
            const name = String(participant.name || '').trim();
            const img = String(participant.img || '').trim();
            if (!uuid && !name) return null;
            return { uuid, name: name || 'Participant', img };
        }).filter(Boolean);
    }

    _mergeParticipants(existing, incoming) {
        const merged = [...this._normalizeParticipants(existing)];
        for (const participant of this._normalizeParticipants(incoming)) {
            const uuid = String(participant.uuid || '').trim().toLowerCase();
            const name = String(participant.name || '').trim().toLowerCase();
            const exists = merged.some(entry => {
                const entryUuid = String(entry.uuid || '').trim().toLowerCase();
                const entryName = String(entry.name || '').trim().toLowerCase();
                return (uuid && entryUuid === uuid) || (!uuid && name && entryName === name);
            });
            if (!exists) merged.push(participant);
        }
        return merged;
    }

    _parseTreasureInput(text) {
        return this._tokenizeLineList(text).map(token => {
            const match = token.match(/^@UUID\[([^\]]+)\]\{([^}]+)\}$/i);
            if (match) {
                return {
                    uuid: match[1].trim(),
                    name: match[2].trim()
                };
            }
            return { name: token };
        }).filter(treasure => treasure.uuid || treasure.name);
    }

    _serializeTreasure(treasure) {
        return this._normalizeTreasure(treasure).map(entry => {
            if (entry.uuid) {
                return `@UUID[${entry.uuid}]{${entry.name || 'Item'}}`;
            }
            return entry.name || entry.text || '';
        }).filter(Boolean).join('\n');
    }

    _normalizeTreasure(treasure) {
        if (typeof treasure === 'string') return this._parseTreasureInput(treasure);
        if (!Array.isArray(treasure)) return [];
        return treasure.map(entry => {
            if (!entry) return null;
            if (typeof entry === 'string') {
                const name = entry.trim();
                return name ? { name } : null;
            }
            const uuid = String(entry.uuid || '').trim();
            const name = String(entry.name || '').trim();
            const text = String(entry.text || '').trim();
            if (!uuid && !name && !text) return null;
            return { uuid, name, text };
        }).filter(Boolean);
    }

    _mergeTreasure(existing, incoming) {
        const merged = [...this._normalizeTreasure(existing)];
        for (const treasure of this._normalizeTreasure(incoming)) {
            const uuid = String(treasure.uuid || '').trim().toLowerCase();
            const label = String(treasure.name || treasure.text || '').trim().toLowerCase();
            const exists = merged.some(entry => {
                const entryUuid = String(entry.uuid || '').trim().toLowerCase();
                const entryLabel = String(entry.name || entry.text || '').trim().toLowerCase();
                return (uuid && entryUuid === uuid) || (!uuid && label && entryLabel === label);
            });
            if (!exists) merged.push(treasure);
        }
        return merged;
    }

    _mergeTasks(existing, incoming) {
        const merged = [...this._normalizeTaskArray(existing)];
        for (const task of this._normalizeTaskArray(incoming)) {
            const key = String(task.originalText || task.text || '').trim().toLowerCase();
            if (!key) continue;
            if (!merged.some(existingTask => String(existingTask.originalText || existingTask.text || '').trim().toLowerCase() === key)) {
                merged.push(task);
            }
        }
        return merged.map((task, index) => ({ ...task, objectiveNumber: index + 1 }));
    }

    _tokenizeLineList(text) {
        const source = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
        if (!source) return [];

        return source
            .split('\n')
            .flatMap(line => line.split(','))
            .map(token => token.trim())
            .filter(Boolean);
    }

    async _ensureCategoryRegistered(category) {
        const normalized = String(category || '').trim();
        if (!normalized) return;

        const categories = game.settings.get(MODULE.ID, 'questCategories') || [];
        if (categories.some(existing => String(existing || '').trim().toLowerCase() === normalized.toLowerCase())) {
            return;
        }

        const updated = [...categories, normalized];
        await game.settings.set(MODULE.ID, 'questCategories', updated);
    }

    _renderLinkableLine(entry) {
        if (!entry) return '';
        if (entry.uuid) {
            const label = this._escapeHtml(entry.name || entry.text || 'Item');
            return `@UUID[${this._escapeAttribute(entry.uuid)}]{${label}}`;
        }
        const text = entry.name || entry.text || '';
        return this._escapeHtml(text);
    }

    _renderInlineText(text) {
        return this._escapeHtml(String(text || '')).replace(/\n/g, '<br>');
    }

    _escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _escapeAttribute(text) {
        return this._escapeHtml(text).replace(/`/g, '&#96;');
    }

    _pickFirstString(document, paths = []) {
        for (const path of paths) {
            const value = foundry.utils.getProperty(document, path);
            if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
    }

    _extractDocumentDescription(document) {
        const raw = this._pickFirstString(document, [
            'system.description.value',
            'system.description.chat',
            'system.details.biography.value',
            'system.details.appearance',
            'system.details.notes.value',
            'text.content'
        ]);
        if (!raw) return '';
        const parsed = new DOMParser().parseFromString(raw, 'text/html');
        return parsed.body?.textContent?.trim() || raw.trim();
    }

    _appendPlainText(existingText, incomingText) {
        const normalize = (value) => String(value || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const current = normalize(existingText);
        const incoming = normalize(incomingText);

        if (!incoming) return current;
        if (!current) return incoming;
        if (current === incoming) return current;

        return `${current}\n\n${incoming}`;
    }

    async _refreshQuestPanel() {
        const questPanel = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.questPanel;
        if (!questPanel) return;
        await questPanel._refreshData();
        questPanel.render(questPanel.element);
    }

    async _applyActiveObjectiveSelection(pageUuid, activeObjectiveIndex) {
        if (!pageUuid) return;
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            activeObjectives.active = (activeObjectiveIndex === null || activeObjectiveIndex === undefined)
                ? null
                : `${pageUuid}|${activeObjectiveIndex}`;
            await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
        } catch (error) {
            console.error('Coffee Pub Squire | Error saving current objective selection:', error);
        }
    }

    async _deleteQuest() {
        const page = this.page || (this.pageUuid ? await fromUuid(this.pageUuid) : null);
        if (!page) {
            ui.notifications.error('The quest you are trying to delete could not be found.');
            return false;
        }

        const confirmed = await this._confirmDelete(page.name || this.quest.name || 'this quest');
        if (!confirmed) return false;

        try {
            if (this.pageUuid) {
                const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
                const activeData = activeObjectives.active;
                if (typeof activeData === 'string') {
                    const [storedUuid] = activeData.split('|');
                    if (storedUuid === this.pageUuid) {
                        activeObjectives.active = null;
                        await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
                    }
                }
            }
            await page.delete();
            ui.notifications.info(`Quest "${page.name || this.quest.name}" deleted.`);
            await this._refreshQuestPanel();
            await this.close();
            return true;
        } catch (error) {
            console.error('Coffee Pub Squire | Error deleting quest:', error);
            ui.notifications.error(`Failed to delete quest: ${error.message}`);
            return false;
        }
    }

    async _confirmDelete(name) {
        if (globalThis.Dialog?.confirm) {
            return Dialog.confirm({
                title: 'Delete Quest',
                content: `<p>Delete <strong>${this._escapeHtml(name)}</strong>?</p>`
            });
        }
        return globalThis.confirm?.(`Delete "${name}"?`) ?? false;
    }

    _clearEventHandlers() {
        for (const { element, event, handler } of this._eventHandlers) {
            try {
                element?.removeEventListener?.(event, handler);
            } catch (_) {}
        }
        this._eventHandlers = [];
    }

    async close(options = {}) {
        this._clearEventHandlers();
        return super.close(options);
    }

    static async _actionSave(event, _target) {
        const instance = QuestWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance._handleFormSubmit({ preventDefault() {}, target: instance._getRoot()?.querySelector('form') });
    }

    static async _actionCancel(event, _target) {
        const instance = QuestWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance.close();
    }

    static async _actionDelete(event, _target) {
        const instance = QuestWindow._ref;
        if (!instance || !instance.isEditing || !instance.pageUuid) return;
        event?.preventDefault?.();
        await instance._deleteQuest();
    }
}

QuestWindow.ACTION_HANDLERS = {
    save: QuestWindow._actionSave,
    cancel: QuestWindow._actionCancel,
    delete: QuestWindow._actionDelete
};

export const QuestForm = QuestWindow;

export async function openQuestWindow(options = {}) {
    let windowInstance;
    if (options.page) {
        windowInstance = await QuestWindow.fromPage(options.page, options);
    } else if (options.pageUuid) {
        const page = await fromUuid(options.pageUuid);
        windowInstance = page ? await QuestWindow.fromPage(page, options) : new QuestWindow(options.quest || null, options);
    } else {
        windowInstance = new QuestWindow(options.quest || null, options);
    }
    await windowInstance.render(true);
    return windowInstance;
}

export function registerQuestWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(QUEST_WINDOW_ID, {
        open: openQuestWindow,
        title: 'Quest',
        moduleId: MODULE.ID
    });
}
