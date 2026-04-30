import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { CodexParser } from './utility-codex-parser.js';
import { copyToClipboard, getNativeElement, renderTemplate, getTextEditor } from './helpers.js';
import { trackModuleTimeout, moduleDelay } from './timer-utils.js';
import { showJournalPicker } from './utility-journal.js';
import {
    createCodexPin,
    deleteCodexPin,
    beginCodexPinPlacement,
    unplaceCodexPin,
    updateCodexPinVisibility,
    updateCodexPinForEntry
} from './utility-codex-pins.js';
import { getPinsApi, isPinsApiAvailable } from './utility-quest-pins.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

function resolveCodexWindowBase() {
    const blacksmith = getBlacksmith();
    const base = blacksmith?.BlacksmithWindowBaseV2 || blacksmith?.getWindowBaseV2?.();
    if (base) return base;

    const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
    return class extends HandlebarsApplicationMixin(ApplicationV2) {
        static ROOT_CLASS = 'codex-window-root';

        _getRoot() {
            const byId = document.getElementById(this.id);
            if (byId) return byId;
            return document.querySelector(`.${this.constructor.ROOT_CLASS}`) ?? this.element ?? null;
        }

        async _prepareContext(options = {}) {
            const baseContext = await super._prepareContext?.(options) ?? {};
            const data = await this.getData(options);
            return foundry.utils.mergeObject(baseContext, data);
        }
    };
}

const CodexWindowBase = resolveCodexWindowBase();

class CodexForm extends CodexWindowBase {
    static ROOT_CLASS = 'codex-window-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'codex-entry-window',
            classes: ['codex-entry-window', 'squire-window'],
            position: { width: 700, height: 760 },
            window: { title: 'Codex', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 620, minHeight: 560 },
            actions: {}
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-squire/templates/codex-form.hbs'
        }
    };

    constructor(entry = null, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `codex-entry-window-${foundry.utils.randomID().slice(0, 8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CodexForm.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CodexForm.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.pageUuid = opts.pageUuid || null;
        this.page = opts.page || null;
        this.isEditing = !!this.pageUuid;
        this.entry = foundry.utils.mergeObject(this._getDefaultEntry(), entry || {}, { inplace: false });
        this.entry.pageUuid = this.pageUuid;
        this.entry.link = this._normalizeLinkValue(this.entry.link, this.entry.linkLabel || this.entry.name || 'Link');
        this.dragActive = false;
        this._eventHandlers = [];
    }

    static async open(options = {}) {
        let windowInstance;
        if (options.page) {
            windowInstance = await CodexForm.fromPage(options.page, options);
        } else {
            windowInstance = new CodexForm(options.entry || null, options);
        }
        await windowInstance.render(true);
        return windowInstance;
    }

    static async fromPage(page, options = {}) {
        let entry = null;
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
            entry = await CodexParser.parseSinglePage(page, enriched);
        } catch (error) {
            console.error('Error parsing codex page for edit:', error);
        }

        return new CodexForm(entry || { name: page?.name || '' }, {
            ...options,
            pageUuid: page?.uuid || options.pageUuid || null,
            page
        });
    }

    _getNativeElement() {
        if (!this.element) return null;
        if (this.element.jquery || typeof this.element.find === 'function') {
            return this.element[0] || this.element.get?.(0) || this.element;
        }
        return this.element;
    }

    getData() {
        return {
            appId: this.id,
            entry: this.entry,
            isEditing: this.isEditing,
            isGM: game.user.isGM,
            existingCategories: this._getExistingCategories(),
            existingLocations: this._getExistingLocations()
        };
    }

    _getDefaultEntry() {
        return {
            name: '',
            img: null,
            category: '',
            description: '',
            plotHook: '',
            location: '',
            link: null,
            linkLabel: '',
            pageUuid: null,
            tags: []
        };
    }

    _getExistingCategories() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];
        
        const journal = game.journal.get(journalId);
        if (!journal) return [];
        
        const categories = new Set();
        for (const page of journal.pages.contents) {
            try {
                const content = page.text?.content || '';
                const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]+)/);
                if (categoryMatch) {
                    categories.add(categoryMatch[1].trim());
                }
            } catch (e) {
                // Skip invalid entries
            }
        }
        return Array.from(categories).sort();
    }

    _getExistingLocations() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];
        
        const journal = game.journal.get(journalId);
        if (!journal) return [];
        
        const locations = new Set();
        for (const page of journal.pages.contents) {
            try {
                const content = page.text?.content || '';
                const locationMatch = content.match(/<strong>Location:<\/strong>\s*([^<]+)/);
                if (locationMatch) {
                    // Decode HTML entities and convert &gt; back to >
                    let location = locationMatch[1].trim();
                    location = location.replace(/&gt;/g, '>');
                    locations.add(location);
                }
            } catch (e) {
                // Skip invalid entries
            }
        }
        return Array.from(locations).sort();
    }

    async _updateObject(event, formData) {
        const entry = expandObject(formData);
        entry.pageUuid = this.pageUuid || entry.pageUuid || null;
        entry.link = await this._resolveLinkFromForm(entry.link, entry.linkLabel, entry.name);
        entry.linkLabel = entry.link?.label || '';
        entry.tags = this._normalizeTags(entry.tags);
        this.entry = foundry.utils.mergeObject(this.entry, entry, { inplace: false });

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No codex journal selected. Please select a journal in the codex panel settings.');
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected codex journal not found.');
            return;
        }

        try {
            const pageData = {
                name: entry.name,
                type: 'text',
                text: {
                    content: this._generateJournalContent(entry)
                }
            };

            if (this.isEditing && this.pageUuid) {
                const page = this.page || await fromUuid(this.pageUuid);
                if (!page) {
                    ui.notifications.error('The codex entry you are editing could not be found.');
                    return false;
                }
                await page.update(pageData);
                this.page = page;
                await updateCodexPinForEntry(page.uuid, {
                    entryName: entry.name,
                    entryCategory: entry.category
                });
                ui.notifications.info(`Codex entry "${entry.name}" updated successfully.`);
            } else {
                const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                this.page = newPage || null;
                this.pageUuid = newPage?.uuid || null;
                this.isEditing = !!this.pageUuid;
                this.entry.pageUuid = this.pageUuid;
                ui.notifications.info(`Codex entry "${entry.name}" saved successfully.`);
            }

            await this._refreshCodexPanel();
            await this.close();
            return true;
        } catch (error) {
            console.error('Error saving codex entry:', error);
            ui.notifications.error(`Failed to save codex entry: ${error.message}`);
            return false;
        }
    }

    _generateJournalContent(entry) {
        let content = '';

        if (entry.img) {
            content += `<img src="${entry.img}" alt="${entry.name}">\n\n`;
        }

        if (entry.category) {
            content += `<p><strong>Category:</strong> ${entry.category}</p>\n\n`;
        }

        if (entry.description) {
            content += `<p><strong>Description:</strong> ${entry.description}</p>\n\n`;
        }
        
        if (entry.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>\n\n`;
        }

        if (entry.link) {
            const linkUuid = typeof entry.link === 'string' ? entry.link.trim() : (entry.link.uuid || '').trim();
            if (linkUuid) {
                const linkLabel = typeof entry.link === 'string'
                    ? (entry.linkLabel || entry.name || 'Link')
                    : (entry.link.label || entry.linkLabel || entry.name || 'Link');
                content += `<p><strong>Link:</strong> @UUID[${linkUuid}]{${linkLabel}}</p>\n\n`;
            }
        }

        if (entry.location) {
            content += `<p><strong>Location:</strong> ${entry.location}</p>\n\n`;
        }

        if (entry.tags && entry.tags.length) {
            content += `<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>\n\n`;
        }

        return content;
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const nativeHtml = this._getNativeElement();
        if (!nativeHtml) return;
        this._clearEventHandlers();
        this._attachLocalListeners(nativeHtml);
    }

    _attachLocalListeners(nativeHtml) {
        const cancelButton = nativeHtml.querySelector('button.cancel');
        if (cancelButton) {
            const handler = () => {
                this.close();
            };
            cancelButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: cancelButton, event: 'click', handler });
        }

        // Handle form submission manually to ensure it works
        const form = nativeHtml.querySelector('form');
        if (form) {
            const handler = (event) => {
                event.preventDefault();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', handler);
            this._eventHandlers.push({ element: form, event: 'submit', handler });
        }

        this._setupDragAndDrop(nativeHtml);
        this._setupFormInteractions(nativeHtml);
        this._setupImageManagement(nativeHtml);
        this._updateFormFields();
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        const form = event.target.closest('form') || event.target;
        const formData = new FormData(form);
        const entry = {};
        for (const [key, value] of formData.entries()) {
            if (key === 'img' && !value) continue;
            if (key === 'location' && !value) continue;
            if (key === 'plotHook' && !value) continue;
            if (key === 'link' && !value) continue;
            entry[key] = value;
        }
        await this._updateObject(event, entry);
    }

    _setupFormInteractions(html) {
        // html is guaranteed native DOM (already converted in activateListeners)
        // Handle category dropdown changes
        const categorySelect = html.querySelector('#category');
        const newCategoryInput = html.querySelector('#new-category');
        
        if (categorySelect) {
            const handler = function() {
                if (this.value === 'new') {
                    newCategoryInput.style.display = '';
                    newCategoryInput.focus();
                    newCategoryInput.setAttribute('name', 'category');
                    categorySelect.removeAttribute('name');
                } else {
                    newCategoryInput.style.display = 'none';
                    newCategoryInput.removeAttribute('name');
                    categorySelect.setAttribute('name', 'category');
                }
            };
            categorySelect.addEventListener('change', handler);
            this._eventHandlers.push({ element: categorySelect, event: 'change', handler });
        }

        // Handle location dropdown changes
        const locationSelect = html.querySelector('#location');
        const newLocationInput = html.querySelector('#new-location');
        
        if (locationSelect) {
            const handler = function() {
                if (this.value === 'new') {
                    newLocationInput.style.display = '';
                    newLocationInput.focus();
                    newLocationInput.setAttribute('name', 'location');
                    locationSelect.removeAttribute('name');
                } else {
                    newLocationInput.style.display = 'none';
                    newLocationInput.removeAttribute('name');
                    locationSelect.setAttribute('name', 'location');
                }
            };
            locationSelect.addEventListener('change', handler);
            this._eventHandlers.push({ element: locationSelect, event: 'change', handler });
        }

        // Handle new category input
        if (newCategoryInput) {
            const handler = function() {
                const value = this.value.trim();
                if (value) {
                    categorySelect.removeAttribute('name');
                    this.setAttribute('name', 'category');
                }
            };
            newCategoryInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: newCategoryInput, event: 'input', handler });
        }

        // Handle new location input
        if (newLocationInput) {
            const handler = function() {
                const value = this.value.trim();
                if (value) {
                    locationSelect.removeAttribute('name');
                    this.setAttribute('name', 'location');
                }
            };
            newLocationInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: newLocationInput, event: 'input', handler });
        }
    }

    _setupImageManagement(html) {
        if (this.entry.img) {
            const imgSection = html.querySelector('.codex-image-section');
            const imgPreview = html.querySelector('.codex-image-preview');
            if (imgSection) {
                imgSection.style.display = '';
            }
            if (imgPreview) {
                imgPreview.setAttribute('src', this.entry.img);
            }
        }

        // Handle remove image button
        const removeImageButton = html.querySelector('.codex-remove-image');
        if (removeImageButton) {
            const handler = () => {
                this.entry.img = null;
                this._updateFormFields();
            };
            removeImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: removeImageButton, event: 'click', handler });
        }
    }

    _setupDragAndDrop(html) {
        const mainDragZone = html.querySelector('.codex-drag-zone');
        if (!mainDragZone) return;

        const newDragZone = mainDragZone.cloneNode(true);
        mainDragZone.parentNode?.replaceChild(newDragZone, mainDragZone);

        const dragEnterHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            newDragZone.classList.add('drag-active');
        };
        
        const dragLeaveHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            newDragZone.classList.remove('drag-active');
        };
        
        const dragOverHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        };
        
        const dropHandler = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            newDragZone.classList.remove('drag-active');

            try {
                const TextEditor = getTextEditor();
                const data = TextEditor?.getDragEventData?.(e)
                    || JSON.parse(e.dataTransfer.getData('text/plain'));

                if (data.type === 'Actor') {
                    await this._handleActorDrop(data);
                } else if (data.type === 'Item') {
                    await this._handleItemDrop(data);
                } else if (data.type === 'JournalEntry' || data.type === 'JournalEntryPage') {
                    await this._handleJournalDrop(data);
                }
            } catch (error) {
                console.error('Error processing dropped entity:', error);
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

    async _handleActorDrop(data) {
        const actor = await fromUuid(data.uuid || `Actor.${data.id}`);
        if (!actor) return;

        this.entry.name = actor.name;
        this.entry.category = 'Characters';
        this.entry.img = actor.img;
        this.entry.description = this._appendPlainText(this.entry.description, this._extractDocumentDescription(actor));
        this.entry.location = this._pickFirstString(actor, [
            'system.details.location',
            'system.details.birthplace',
            'system.details.origin',
            'system.details.home'
        ]) || this.entry.location;
        this.entry.link = this._buildDocumentLink(actor);
        this.entry.linkLabel = this.entry.link?.label || '';
        this.entry.tags = this._uniqueTags([
            'Characters',
            actor.type,
            this._pickFirstString(actor, ['system.details.race', 'system.details.race.value', 'system.traits.race']),
            this._pickFirstString(actor, ['system.details.class', 'system.class.name', 'system.class.value'])
        ]);

        this._updateFormFields();
        ui.notifications.info(`Added character: ${actor.name}`);
    }

    async _handleItemDrop(data) {
        const item = await fromUuid(data.uuid || `Item.${data.id}`);
        if (!item) return;

        this.entry.name = item.name;
        this.entry.category = 'Items';
        this.entry.img = item.img;
        this.entry.description = this._appendPlainText(this.entry.description, this._extractDocumentDescription(item));
        this.entry.link = this._buildDocumentLink(item);
        this.entry.linkLabel = this.entry.link?.label || '';
        this.entry.tags = this._uniqueTags([
            'Items',
            item.type,
            this._pickFirstString(item, ['system.rarity', 'system.rarity.value']),
            this._pickFirstString(item, ['system.equipment.type', 'system.type.value', 'system.category'])
        ]);

        this._updateFormFields();
        ui.notifications.info(`Added item: ${item.name}`);
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

        this.entry.name = page?.name || journal?.name || dropped.name;
        this.entry.link = this._buildDocumentLink(page || journal || dropped);
        this.entry.linkLabel = this.entry.link?.label || '';
        this.entry.category = this.entry.category || 'Books';

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
                const parsed = await CodexParser.parseSinglePage(page, enriched);
                if (parsed?.category) this.entry.category = parsed.category;
                if (parsed?.description) {
                    this.entry.description = this._appendPlainText(this.entry.description, parsed.description);
                }
                if (parsed?.plotHook) this.entry.plotHook = parsed.plotHook;
                if (parsed?.location) this.entry.location = parsed.location;
                if (parsed?.img) this.entry.img = parsed.img;
                if (Array.isArray(parsed?.tags) && parsed.tags.length) {
                    this.entry.tags = parsed.tags;
                } else {
                    this.entry.tags = this._uniqueTags(['Books', 'Journal']);
                }
            } catch (error) {
                console.warn('Error parsing dropped journal for codex entry:', error);
                this.entry.description = this._appendPlainText(this.entry.description, this._extractDocumentDescription(page));
                this.entry.tags = this._uniqueTags(['Books', 'Journal']);
            }
        } else {
            this.entry.description = this._appendPlainText(this.entry.description, this._extractDocumentDescription(journal || dropped));
            this.entry.tags = this._uniqueTags(['Books', 'Journal']);
        }

        this._updateFormFields();

        ui.notifications.info(`Added journal entry: ${this.entry.name}`);
    }

    _updateFormFields() {
        const element = this._getNativeElement();
        if (!element) return;

        const form = element.querySelector('form');
        if (!form) return;

        const nameInput = form.querySelector('input[name="name"]');
        if (nameInput) nameInput.value = this.entry.name || '';

        const descriptionTextarea = form.querySelector('textarea[name="description"]');
        if (descriptionTextarea) descriptionTextarea.value = this.entry.description || '';

        const plotHookTextarea = form.querySelector('textarea[name="plotHook"]');
        if (plotHookTextarea) plotHookTextarea.value = this.entry.plotHook || '';

        const tagsInput = form.querySelector('input[name="tags"]');
        if (tagsInput) tagsInput.value = (this.entry.tags || []).join(', ');

        const imgInput = form.querySelector('input[name="img"]');
        if (imgInput) imgInput.value = this.entry.img || '';

        const pageUuidInput = form.querySelector('input[name="pageUuid"]');
        if (pageUuidInput) pageUuidInput.value = this.pageUuid || '';

        const linkInput = form.querySelector('input[name="link"]');
        if (linkInput) linkInput.value = this.entry.link?.uuid || '';

        const linkLabelInput = form.querySelector('input[name="linkLabel"]');
        if (linkLabelInput) linkLabelInput.value = this.entry.link?.label || this.entry.linkLabel || '';

        const categorySelect = form.querySelector('#category');
        const newCategoryInput = form.querySelector('#new-category');
        if (categorySelect && newCategoryInput) {
            if (this.entry.category) {
                const existingOption = categorySelect.querySelector(`option[value="${this.entry.category}"]`);
                if (existingOption) {
                    categorySelect.value = this.entry.category;
                    newCategoryInput.style.display = 'none';
                    newCategoryInput.value = '';
                    newCategoryInput.removeAttribute('name');
                    categorySelect.setAttribute('name', 'category');
                } else {
                    categorySelect.value = 'new';
                    newCategoryInput.style.display = '';
                    newCategoryInput.value = this.entry.category;
                    newCategoryInput.setAttribute('name', 'category');
                    categorySelect.removeAttribute('name');
                }
            } else {
                categorySelect.value = '';
                newCategoryInput.style.display = 'none';
                newCategoryInput.value = '';
                newCategoryInput.removeAttribute('name');
                categorySelect.setAttribute('name', 'category');
            }
        }

        const locationSelect = form.querySelector('#location');
        const newLocationInput = form.querySelector('#new-location');
        if (locationSelect && newLocationInput) {
            if (this.entry.location) {
                const existingOption = locationSelect.querySelector(`option[value="${this.entry.location}"]`);
                if (existingOption) {
                    locationSelect.value = this.entry.location;
                    newLocationInput.style.display = 'none';
                    newLocationInput.value = '';
                    newLocationInput.removeAttribute('name');
                    locationSelect.setAttribute('name', 'location');
                } else {
                    locationSelect.value = 'new';
                    newLocationInput.style.display = '';
                    newLocationInput.value = this.entry.location;
                    newLocationInput.setAttribute('name', 'location');
                    locationSelect.removeAttribute('name');
                }
            } else {
                locationSelect.value = '';
                newLocationInput.style.display = 'none';
                newLocationInput.value = '';
                newLocationInput.removeAttribute('name');
                locationSelect.setAttribute('name', 'location');
            }
        }

        const imgSection = form.querySelector('.codex-image-section');
        const imgPreview = form.querySelector('.codex-image-preview');
        if (imgSection) {
            imgSection.style.display = this.entry.img ? '' : 'none';
        }
        if (imgPreview) {
            imgPreview.setAttribute('src', this.entry.img || '');
        }
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

    _buildDocumentLink(document) {
        if (!document?.uuid) return null;
        return {
            uuid: document.uuid,
            label: document.name || 'Link'
        };
    }

    _normalizeLinkValue(link, fallbackLabel = 'Link') {
        if (!link) return null;
        if (typeof link === 'string') {
            const uuid = link.trim();
            if (!uuid) return null;
            return { uuid, label: fallbackLabel || 'Link' };
        }
        if (typeof link === 'object') {
            const uuid = String(link.uuid || '').trim();
            if (!uuid) return null;
            return {
                uuid,
                label: String(link.label || fallbackLabel || 'Link').trim() || 'Link'
            };
        }
        return null;
    }

    async _resolveLinkFromForm(linkValue, linkLabel, fallbackLabel = 'Link') {
        const normalized = this._normalizeLinkValue(linkValue, linkLabel || fallbackLabel);
        if (!normalized) return null;
        if (!linkLabel) {
            try {
                const document = await fromUuid(normalized.uuid);
                if (document?.name) normalized.label = document.name;
            } catch (_) {}
        }
        return normalized;
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

    async _refreshCodexPanel() {
        const codexPanel = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.codexPanel;
        if (!codexPanel) return;
        await codexPanel._refreshData();
        codexPanel.render(codexPanel.element);
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
}

// ---------------------------------------------------------------------------
// Codex pin event registration (follows the same pattern as notes pins)
// ---------------------------------------------------------------------------

let _codexPinClickDisposer     = null;
let _codexPinHandlerController = null;
let _codexPinSceneSyncHookId   = null;

/**
 * Sync codex page flags when pins are removed from a scene.
 * Mirrors syncNotesForDeletedPins in panel-notes.js exactly.
 * - Pin unplaced (exists elsewhere): clear codexSceneId only
 * - Pin deleted entirely: clear both codexPinId and codexSceneId
 * @param {string} sceneId
 */
async function syncCodexForDeletedPins(sceneId) {
    if (!game.user?.isGM) return;
    const pins = getPinsApi();
    if (!sceneId || !isPinsApiAvailable(pins)) return;

    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    if (!journalId || journalId === 'none') return;
    const journal = game.journal.get(journalId);
    if (!journal?.pages) return;

    const pages = journal.pages.contents || journal.pages;
    if (!pages?.length) return;

    let changed = false;
    for (const page of pages) {
        if (!page?.id || typeof page.getFlag !== 'function') continue;
        const pinId = page.getFlag(MODULE.ID, 'codexPinId');
        if (!pinId) continue;
        const pageSceneId = page.getFlag(MODULE.ID, 'codexSceneId');
        if (pageSceneId && pageSceneId !== sceneId) continue;

        const pinExistsOnScene = typeof pins.exists === 'function'
            ? pins.exists(pinId, { sceneId })
            : !!pins.get?.(pinId, { sceneId });

        if (!pinExistsOnScene) {
            const pinExistsAnywhere = typeof pins.exists === 'function'
                ? pins.exists(pinId)
                : !!pins.get?.(pinId);
            if (pinExistsAnywhere) {
                await page.setFlag(MODULE.ID, 'codexSceneId', null);
            } else {
                await page.setFlag(MODULE.ID, 'codexPinId',   null);
                await page.setFlag(MODULE.ID, 'codexSceneId', null);
            }
            changed = true;
        }
    }

    if (changed) {
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.codexPanel && panelManager.element) {
            await panelManager.codexPanel._refreshData();
            panelManager.codexPanel.render(panelManager.element);
        }
    }
}

/**
 * Register codex pin event handlers (doubleClick → open panel + focus entry).
 * Called from CodexPanel constructor, guarded against double-registration.
 * Follows the pattern of registerNotePinHandlers() in panel-notes.js.
 */
function registerCodexPinHandlers() {
    const pins = getPinsApi();
    if (!pins?.on || !isPinsApiAvailable(pins)) return;

    if (!_codexPinSceneSyncHookId) {
        _codexPinSceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || scene.id !== canvas?.scene?.id) return;
            if (!changes?.flags) return;
            syncCodexForDeletedPins(scene.id);
        });
    }

    if (_codexPinClickDisposer) return;

    _codexPinHandlerController = new AbortController();
    const signal = _codexPinHandlerController.signal;

    // Double-click: open codex panel and navigate to the entry
    _codexPinClickDisposer = pins.on('doubleClick', async (evt) => {
        try {
            const codexUuid = evt?.pin?.config?.codexUuid;
            if (!codexUuid) return;

            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (!panelManager) return;

            if (panelManager.element && !panelManager.element.classList.contains('expanded')) {
                panelManager.element.classList.add('expanded');
            }
            if (typeof panelManager.setViewMode === 'function') {
                await panelManager.setViewMode('codex');
            }
            if (panelManager.codexPanel && typeof panelManager.codexPanel.render === 'function' && panelManager.element) {
                await panelManager.codexPanel.render(panelManager.element);
            }

            const tryFocus = () => {
                const entry = document.querySelector(`.codex-entry[data-uuid="${codexUuid}"]`);
                if (!entry) return false;
                const section = entry.closest('.codex-section');
                if (section) section.classList.remove('collapsed');
                entry.classList.remove('collapsed');
                entry.classList.add('codex-highlighted');
                entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
                trackModuleTimeout(() => entry.classList.remove('codex-highlighted'), 2000);
                return true;
            };
            tryFocus();
            trackModuleTimeout(tryFocus, 200);
            trackModuleTimeout(tryFocus, 500);
            trackModuleTimeout(tryFocus, 1000);
        } catch (err) {
            console.error('Coffee Pub Squire | codex pin doubleClick handler:', err);
        }
    }, { moduleId: MODULE.ID, signal });
}

// ---------------------------------------------------------------------------

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournal = null;
        this.categories = new Set();
        this.data = {};
        this.filters = {
            search: "",
            tags: [],
            category: "all"
        };
        this.allTags = new Set();
        this.isImporting = false; // Flag to prevent panel refreshes during import
        this._setupHooks();
        registerCodexPinHandlers();
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are handled by HookManager
        // This method is kept for compatibility but no longer registers hooks
    }

    /**
     * Show the global progress bar for codex imports
     * @private
     */
    _showProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting codex import...';
        }
    }

    /**
     * Update the global progress bar
     * @private
     */
    _updateProgressBar(percent, text) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = text;
        }
    }

    /**
     * Hide the global progress bar
     * @private
     */
    _hideProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        if (progressArea) {
            progressArea.style.display = 'none';
        }
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this.element = null;
    }

    /**
     * Check if a page belongs to the selected journal
     * @private
     */
    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page is actually a CODEX entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if this appears to be a CODEX entry
     */
    _isCodexEntry(page) {
        try {
            // Quick check: if no text content, it's not a CODEX entry
            if (!page.text?.content) return false;
            
            // Get the raw text content to check for CODEX structure
            let content = '';
            if (typeof page.text.content === 'string') {
                content = page.text.content;
            } else if (page.text.content) {
                // For async content, we'll need to check it differently
                // For now, assume it might be a CODEX entry if we can't determine otherwise
                return true;
            }
            
            // Check if the content contains CODEX-specific markers
            // CODEX entries should have a CATEGORY field, but we'll be more lenient
            if (content && typeof content === 'string') {
                // Look for CATEGORY field (case-insensitive)
                const hasCategory = /<strong>category<\/strong>|<strong>category:<\/strong>/i.test(content);
                
                // If it has a category field, it's definitely a CODEX entry
                if (hasCategory) return true;
                
                // If no category field, check if it has other CODEX-like structure
                // Look for common CODEX fields to determine if this might be a CODEX entry
                const hasDescription = /<strong>description<\/strong>|<strong>description:<\/strong>/i.test(content);
                const hasTags = /<strong>tags<\/strong>|<strong>tags:<\/strong>/i.test(content);
                const hasPlotHook = /<strong>plot hook<\/strong>|<strong>plot hook:<\/strong>/i.test(content);
                const hasLocation = /<strong>location<\/strong>|<strong>location:<\/strong>/i.test(content);
                
                // If it has multiple CODEX-like fields, it's probably a CODEX entry
                const codexFieldCount = [hasDescription, hasTags, hasPlotHook, hasLocation].filter(Boolean).length;
                if (codexFieldCount >= 2) return true;
                
                // If we can't determine, assume it's not a CODEX entry to be safe
                return false;
            }
            
            // If we can't determine, assume it's not a CODEX entry to be safe
            return false;
        } catch (error) {
            // If there's any error checking, assume it's not a CODEX entry
            // This prevents crashes and excessive processing
            return false;
        }
    }

    /**
     * Get the icon class for a given category
     * @param {string} category
     * @returns {string} FontAwesome icon class
     */
    getCategoryIcon(category) {
        const map = {
            'No Category': 'fa-question-circle',
            'Artifacts': 'fa-gem',
            'Characters': 'fa-user',
            'Events': 'fa-calendar-star',
            'Factions': 'fa-shield-cross',
            'Items': 'fa-box',
            'Locations': 'fa-location-pin',
            'Maps': 'fa-map'
            // Add more mappings as needed
        };
        return map[category] || 'fa-book';
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.categories.clear();
        this.data = {};
        this.allTags.clear();

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        this.selectedJournal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (this.selectedJournal) {
            for (const page of this.selectedJournal.pages.contents) {
                try {
                    let content = '';
                    if (typeof page.text?.content === 'string') {
                        content = page.text.content;
                    } else if (typeof page.text === 'string') {
                        content = page.text;
                    } else if (page.text?.content) {
                        content = await page.text.content;
                    }
                    
                    if (content) {
                        const TextEditor = getTextEditor();
                        const enriched = await TextEditor.enrichHTML(content, {
                            secrets: game.user.isGM,
                            documents: true,
                            links: true,
                            rolls: true
                        });
                        
                        const entry = await CodexParser.parseSinglePage(page, enriched);
                        if (entry) {
                            // Add ownership info for visibility icon
                            entry.ownership = page.ownership;

                            // Pin state flags
                            entry.pinId        = page.getFlag(MODULE.ID, 'codexPinId')   ?? null;
                            entry.pinSceneId   = page.getFlag(MODULE.ID, 'codexSceneId') ?? null;
                            entry.hasPinOnScene = !!(entry.pinId && entry.pinSceneId && entry.pinSceneId === canvas?.scene?.id);
                            
                            // Extract "Discovered By" information from the enriched content
                            const doc = new DOMParser().parseFromString(enriched, 'text/html');
                            const pTags = Array.from(doc.querySelectorAll('p'));
                            
                            // Look for "Discovered By" paragraph by finding the strong tag with that text
                            for (const p of pTags) {
                                const strong = p.querySelector('strong');
                                if (strong && strong.textContent.trim() === 'Discovered By:') {
                                    const discovererText = p.textContent.replace('Discovered By:', '').trim();
                                    if (discovererText) {
                                        entry.DiscoveredBy = discovererText;
                                    }
                                    break;
                                }
                            }
                            
                            // Determine category - if no category, use "No Category"
                            let normCategory = "No Category";
                            if (entry.category && entry.category.trim()) {
                                normCategory = entry.category.trim();
                            }
                            
                            // Add to categories set
                            this.categories.add(normCategory);
                            // Initialize category array if needed
                            if (!this.data[normCategory]) {
                                this.data[normCategory] = [];
                            }
                            // Add entry to category
                            this.data[normCategory].push(entry);
                            // Add tags
                            if (entry.tags && Array.isArray(entry.tags)) {
                                entry.tags.forEach(tag => this.allTags.add(tag));
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error parsing codex entry:', error);
                }
            }
        }
    }

    /**
     * Set up event listeners
     * @private
     */
    _activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Search input - live DOM filtering
        const codexSearchContainer = nativeHtml.querySelector('.codex-search');
        const searchInput = codexSearchContainer?.querySelector('input');
        const clearButton = nativeHtml.querySelector('.clear-search');
        
        // --- DOM-based filtering for search and tags ---
        const filterEntries = () => {
            const search = this.filters.search.trim().toLowerCase();
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                let text = entry.textContent?.toLowerCase() || '';
                let searchMatch = true;
                if (search) {
                    searchMatch = text.includes(search);
                }
                // Hide entries the user cannot see (non-GMs)
                if (!game.user.isGM) {
                    // Try to get ownership from data attribute, fallback to hiding if not present
                    const ownershipDefault = entry.dataset.ownershipDefault;
                    if (typeof ownershipDefault !== 'undefined' && parseInt(ownershipDefault) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                        entry.style.display = 'none';
                        return;
                    }
                }
                entry.style.display = searchMatch ? '' : 'none';
            });
            // Hide category sections with no visible entries
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                // Check if section has any visible entries
                const hasVisible = section.querySelector('.codex-entry[style*="display: block"], .codex-entry:not([style*="display: none"])') !== null;
                section.style.display = hasVisible ? '' : 'none';
            });
        };

        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                const searchValue = event.target.value.toLowerCase();
            this.filters.search = searchValue;
            // Show all entries and sections before filtering
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                entry.style.display = '';
            });
            nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                section.style.display = '';
            });
            if (searchValue) {
                if (clearButton) {
                    clearButton.classList.remove('disabled');
                }
                // Always expand all categories during search
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.classList.remove('collapsed');
                });
                filterEntries();
            } else {
                if (clearButton) {
                    clearButton.classList.add('disabled');
                }
                // When search is cleared, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        // v13: Use safer selector approach to handle values with newlines/whitespace
                        const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                        const section = Array.from(sections).find(s => {
                            const attrValue = s.getAttribute('data-category');
                            return attrValue && attrValue.trim() === category.trim();
                        });
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                }
                // Only filter by tags if any are selected
                if (this.filters.tags && this.filters.tags.length > 0) {
                    // Always expand all categories for tag filtering
                    nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                        section.classList.remove('collapsed');
                    });
                    filterEntries();
                }
            }
            });
        }

        // Clear search button
        if (clearButton) {
            clearButton.classList.remove('disabled');
            // Clone to remove existing listeners
            const newClearButton = clearButton.cloneNode(true);
            clearButton.parentNode?.replaceChild(newClearButton, clearButton);
            
            newClearButton.addEventListener('click', (event) => {
                this.filters.search = "";
                this.filters.tags = [];
                if (searchInput) {
                    searchInput.value = "";
                }
                // v13: Use native DOM methods
                nativeHtml.querySelectorAll('.codex-tag.selected').forEach(tag => {
                    tag.classList.remove('selected');
                });
                
                // Show all entries and sections
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
                
                // Restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        // Match by iterating to handle category values with newlines/whitespace
                        const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                        const section = Array.from(sections).find(s => {
                            const attrValue = s.getAttribute('data-category');
                            return attrValue && attrValue.trim() === category.trim();
                        });
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                }
                
                this.render(this.element);
            });
        }

        // Tag cloud tag selection
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-tag-cloud .codex-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagValue = event.currentTarget.dataset.tag;
                const tagIndex = this.filters.tags.indexOf(tagValue);
                if (tagIndex === -1) {
                    this.filters.tags.push(tagValue);
                } else {
                    this.filters.tags.splice(tagIndex, 1);
                }
                
                // Show all entries and sections before filtering
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
                
                // If we have tags selected, expand all categories
                if (this.filters.tags.length > 0) {
                    nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                        section.classList.remove('collapsed');
                    });
                    // Temporarily clear the collapsed state in user flags while filtering
                    game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', {});
                } else {
                    // If no tags selected, restore original collapsed states
                    const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                    for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                        if (collapsed) {
                            // Match by iterating to handle category values with newlines/whitespace
                            const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                            const section = Array.from(sections).find(s => {
                                const attrValue = s.getAttribute('data-category');
                                return attrValue && attrValue.trim() === category.trim();
                            });
                            if (section) {
                                section.classList.add('collapsed');
                            }
                        }
                    }
                }
                
                this.render(this.element);
            });
        });

        // Toggle tag cloud
        // v13: Use nativeHtml instead of html
        const toggleTagsButton = nativeHtml.querySelector('.toggle-tags-button');
        if (toggleTagsButton) {
            const newButton = toggleTagsButton.cloneNode(true);
            toggleTagsButton.parentNode?.replaceChild(newButton, toggleTagsButton);
            newButton.addEventListener('click', () => {
                const tagCloud = nativeHtml.querySelector('.codex-tag-cloud');
                if (tagCloud) {
                    const isCollapsed = tagCloud.classList.contains('collapsed');
                    game.user.setFlag(MODULE.ID, 'codexTagCloudCollapsed', !isCollapsed);
                    this.render(this.element);
                }
            });
        }

        // Codex titlebar "..." context menu (Blacksmith) - all actions except Add
        const codexTitlebarMenuBtn = nativeHtml.querySelector('.codex-titlebar-menu');
        if (codexTitlebarMenuBtn && getBlacksmith()?.uiContextMenu?.show) {
            const newMenuBtn = codexTitlebarMenuBtn.cloneNode(true);
            codexTitlebarMenuBtn.parentNode?.replaceChild(newMenuBtn, codexTitlebarMenuBtn);
            newMenuBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const coreItems = [
                    {
                        name: 'Refresh Codex',
                        icon: 'fa-solid fa-sync-alt',
                        callback: async () => {
                            await this._refreshData();
                            this.render(this.element);
                            ui.notifications.info('Codex refreshed.');
                        }
                    }
                ];
                if (this.selectedJournal) {
                    coreItems.unshift({
                        name: 'Open Codex Journal',
                        icon: 'fa-solid fa-feather',
                        callback: () => this.selectedJournal.sheet.render(true)
                    });
                }
                const gmItems = game.user.isGM ? [
                    {
                        name: 'Select Journal for Codex',
                        icon: 'fa-solid fa-cog',
                        callback: () => {
                            showJournalPicker({
                                title: 'Select Codex Journal',
                                mode: 'select',
                                choices: (() => {
                                    const choices = { 'none': '- Select Journal -' };
                                    game.journal.contents.forEach(j => {
                                        choices[j.id] = j.name;
                                    });
                                    return choices;
                                })(),
                                selectedId: game.settings.get(MODULE.ID, 'codexJournal'),
                                onSelect: async (journalId) => {
                                    await game.settings.set(MODULE.ID, 'codexJournal', journalId);
                                },
                                reRender: async () => {
                                    await this._refreshData();
                                    this.render(this.element);
                                }
                            });
                        }
                    },
                    {
                        name: 'Auto-Discover from Party Inventories',
                        icon: 'fa-solid fa-search-plus',
                        callback: () => this._autoDiscoverFromInventories()
                    },
                    {
                        name: 'Import Codex from JSON',
                        icon: 'fa-solid fa-file-import',
                        callback: () => this._openImportCodexDialog()
                    },
                    {
                        name: 'Export Codex as JSON',
                        icon: 'fa-solid fa-file-export',
                        callback: () => this._openExportCodexDialog()
                    }
                ] : [];
                getBlacksmith().uiContextMenu.show({
                    id: `${MODULE.ID}-codex-titlebar-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones: { core: coreItems, gm: gmItems }
                });
            });
        }

        // Add new codex entry button (only action outside menu)
        // v13: Use nativeHtml instead of html
        const addCodexButton = nativeHtml.querySelector('.add-codex-button');
        if (addCodexButton) {
            const newButton = addCodexButton.cloneNode(true);
            addCodexButton.parentNode?.replaceChild(newButton, addCodexButton);
            newButton.addEventListener('click', async () => {
                if (!game.user.isGM) return;

                const journalId = game.settings.get(MODULE.ID, 'codexJournal');
                if (!journalId || journalId === 'none') {
                    ui.notifications.warn("No codex journal selected. Use the … menu to select one.");
                    return;
                }

                const journal = game.journal.get(journalId);
                if (!journal) {
                    ui.notifications.error("Could not find the codex journal.");
                    return;
                }

                await CodexForm.open();
            });
        }

        // Feather icon opens the current journal page (Player / non-GM)
        nativeHtml.querySelectorAll('.codex-entry-feather-user').forEach(feather => {
            const newFeather = feather.cloneNode(true);
            feather.parentNode?.replaceChild(newFeather, feather);
            newFeather.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const page = await fromUuid(uuid);
                    if (page && page.parent) {
                        page.parent.sheet.render(true, { pageId: page.id });
                    }
                }
            });
        });

        // Link clicks (old-style data-uuid links; enriched @UUID links are handled by Foundry)
        nativeHtml.querySelectorAll('.codex-entry-link').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    event.preventDefault();
                    event.stopPropagation();
                    const page = await fromUuid(uuid);
                    if (page && page.parent) {
                        page.parent.sheet.render(true, { pageId: page.id });
                    }
                }
            });
        });

        nativeHtml.querySelectorAll('.codex-entry-image img').forEach(image => {
            const newImage = image.cloneNode(true);
            image.parentNode?.replaceChild(newImage, image);
            newImage.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const imgEl = event.currentTarget;
                const src = imgEl.getAttribute('src');
                if (!src) return;

                const entryEl = imgEl.closest('.codex-entry');
                const uuid = entryEl?.dataset?.uuid || null;
                let title = imgEl.getAttribute('alt') || 'Codex Image';

                if (uuid) {
                    try {
                        const page = await fromUuid(uuid);
                        if (page?.name) title = page.name;
                    } catch (_) {}
                }

                const imagePopout = new ImagePopout(src, {
                    title,
                    shareable: true,
                    uuid
                });
                imagePopout.render(true);
            });
        });

        // Per-entry "..." context menu (GM only)
        nativeHtml.querySelectorAll('.codex-entry-menu').forEach(menuBtn => {
            const newBtn = menuBtn.cloneNode(true);
            menuBtn.parentNode?.replaceChild(newBtn, menuBtn);
            newBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;

                const uuid      = newBtn.dataset.uuid;
                const entryEl   = newBtn.closest('.codex-entry');
                const isVisible = entryEl?.dataset?.ownershipDefault >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                    || parseInt(entryEl?.dataset?.ownershipDefault ?? '0') >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                const hasPinId  = !!(entryEl?.dataset?.pinId);

                const ctxMenu = getBlacksmith()?.uiContextMenu;
                if (!ctxMenu?.show) return;

                ctxMenu.show({
                    id: `${MODULE.ID}-codex-entry-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones: {
                        gm: [
                            {
                                name: 'Open Journal Page',
                                icon: 'fa-solid fa-feather',
                                callback: async () => {
                                    const doc = await fromUuid(uuid);
                                    if (doc) doc.sheet.render(true);
                                }
                            },
                            {
                                name: 'Edit Entry',
                                icon: 'fa-solid fa-pen',
                                callback: async () => {
                                    const page = await fromUuid(uuid);
                                    if (!page) return;
                                    await CodexForm.open({ page });
                                }
                            },
                            ...(hasPinId ? [{
                                name: 'Configure Pin',
                                icon: 'fa-solid fa-palette',
                                callback: async () => {
                                    const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                                    const pinId = entryEl?.dataset?.pinId;
                                    if (pins?.configure && pinId) {
                                        await pins.configure(pinId);
                                    }
                                }
                            },
                            {
                                name: 'Clear Pin',
                                icon: 'fa-solid fa-eraser',
                                callback: async () => {
                                    await deleteCodexPin(uuid);
                                    await this._refreshData();
                                    this.render(this.element);
                                }
                            }] : []),
                            {
                                name: 'Delete Entry',
                                icon: 'fa-solid fa-trash',
                                callback: async () => {
                                    const confirmed = await Dialog.confirm({
                                        title: 'Delete Entry',
                                        content: '<p>Delete this codex entry? This cannot be undone.</p>'
                                    });
                                    if (!confirmed) return;
                                    if (hasPinId) await deleteCodexPin(uuid);
                                    const page = await fromUuid(uuid);
                                    if (page) await page.delete();
                                }
                            }
                        ]
                    }
                });
            });
        });

        // Per-entry visibility toggle (GM only): direct eye/eye-slash icon in toolbar
        nativeHtml.querySelectorAll('.codex-entry-visibility').forEach(visBtn => {
            const newBtn = visBtn.cloneNode(true);
            visBtn.parentNode?.replaceChild(newBtn, visBtn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;
                const uuid = newBtn.dataset.uuid;
                if (!uuid) return;
                const page = await fromUuid(uuid);
                if (!page) return;
                const current      = page.ownership?.default ?? 0;
                const newPermission = current >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
                    : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                await page.update({ 'ownership.default': newPermission });
                await updateCodexPinVisibility(uuid);
            });
        });

        // Per-entry pin button (GM only): place on scene or unplace
        nativeHtml.querySelectorAll('.codex-entry-pin').forEach(pinBtn => {
            const newBtn = pinBtn.cloneNode(true);
            pinBtn.parentNode?.replaceChild(newBtn, pinBtn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;

                const uuid         = newBtn.dataset.uuid;
                const name         = newBtn.dataset.name;
                const category     = newBtn.dataset.category;
                const hasPinOnScene = newBtn.dataset.hasPinOnScene === 'true';

                if (hasPinOnScene) {
                    // Unplace from scene (keep pin data); sync hooks re-render the panel
                    await unplaceCodexPin(uuid);
                    await this._refreshData();
                    this.render(this.element);
                } else {
                    // Enter canvas placement mode; sync hooks re-render when pin lands
                    await beginCodexPinPlacement(uuid, name, category);
                }
            });
        });

        // Entry collapse/expand
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-entry-toggle').forEach(toggle => {
            toggle.addEventListener('click', function(e) {
                const card = e.currentTarget.closest('.codex-entry');
                if (card) {
                    card.classList.toggle('collapsed');
                }
                e.stopPropagation();
            });
        });

        nativeHtml.querySelectorAll('.codex-entry-name').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', function(e) {
                const card = e.currentTarget.closest('.codex-entry');
                if (card) {
                    card.classList.toggle('collapsed');
                }
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Category collapse/expand
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-category .fa-chevron-down').forEach(chevron => {
            chevron.addEventListener('click', function(e) {
                const section = e.currentTarget.closest('.codex-section');
                if (!section) return;
                section.classList.toggle('collapsed');
                
                const category = section.dataset.category;
                const collapsed = section.classList.contains('collapsed');
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                collapsedCategories[category] = collapsed;
                game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', collapsedCategories);
                
                e.stopPropagation();
            });
        });

        nativeHtml.querySelectorAll('.codex-category h3').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', function(e) {
                const section = e.currentTarget.closest('.codex-section');
                if (!section) return;
                section.classList.toggle('collapsed');

                const category = section.dataset.category;
                const collapsed = section.classList.contains('collapsed');
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                collapsedCategories[category] = collapsed;
                game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', collapsedCategories);

                e.preventDefault();
                e.stopPropagation();
            });
        });


        // On load, ensure all entries are visible if no filters are set
        trackModuleTimeout(() => {
            if (!this.filters.search && (!this.filters.tags || this.filters.tags.length === 0)) {
                // v13: Use native DOM methods
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
            } else {
                filterEntries();
            }
        }, 0);
    }


    /**
     * Auto-discover codex entries from party inventories
     * @private
     */
    async _autoDiscoverFromInventories() {
        if (!this.selectedJournal) {
            ui.notifications.warn("No codex journal selected. Please select a journal first.");
            return;
        }

        // Set import flag to prevent panel refreshes during auto-discovery
        this.isImporting = true;

        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;

        // Get the titlebar menu button for working state during scan
        const button = nativeElement.querySelector('.codex-titlebar-menu');
        if (button) {
            button.classList.add('working');
            button.setAttribute('title', 'Scanning party inventories...');
        }

        // Show progress area
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting scan...';
            
            // Small delay to make progress visible
            await moduleDelay(500);
        }

        try {
            // Show initial notification
            ui.notifications.info("Starting auto-discovery scan...");

            // Get all tokens on the canvas
            const tokens = canvas.tokens.placeables.filter(token => 
                token.actor && 
                token.actor.type === 'character' && 
                token.actor.hasPlayerOwner
            );

            if (tokens.length === 0) {
                ui.notifications.warn("No player character tokens found on the canvas.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.textContent = 'No players found';
                    progressFill.style.width = '100%';
                    // Hide progress area after a delay
                    trackModuleTimeout(() => {
                        progressArea.style.display = 'none';
                    }, 2000);
                }
                return;
            }

            // Collect all inventory items from party members
            const inventoryItems = new Set();
            const characterNames = [];
            const totalPlayers = tokens.length;
            let processedPlayers = 0;
            
            // Update progress for character scanning phase
            if (progressText) {
                progressText.textContent = 'Scanning party inventories...';
            }
            if (progressFill) {
                progressFill.style.width = '0%';
            }
            
            for (const token of tokens) {
                const actor = token.actor;
                characterNames.push(actor.name);
                processedPlayers++;
                
                // Update progress for this character - REAL PROGRESS
                const playerProgressPercent = (processedPlayers / totalPlayers) * 20; // 0-20% range for player scanning
                if (progressFill) {
                    progressFill.style.width = `${playerProgressPercent}%`;
                }
                if (progressText) {
                    progressText.textContent = `Scanning ${actor.name}...`;
                }
                
                // Add a small delay to make player scanning visible
                await moduleDelay(200);
                
                // Use the same approach as the inventory panel
                if (actor.items && actor.items.contents) {
                    // Filter items by type (same as inventory panel)
                    const items = actor.items.contents.filter(item => 
                        ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                    );
                    
                    for (const item of items) {
                        // Normalize spaces: collapse multiple spaces into single spaces, then lowercase and trim
                        const itemNameLower = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
                        inventoryItems.add(itemNameLower);
                        
                        // If it's a backpack/container, check its contents
                        if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                            for (const containedItem of item.contents) {
                                // Apply same space normalization to contained items
                                const containedItemNameLower = containedItem.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                inventoryItems.add(containedItemNameLower);
                            }
                        }
                    }
                }
            }

            if (inventoryItems.size === 0) {
                ui.notifications.warn("No inventory items found in party members' inventories.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.textContent = 'No items found';
                    progressFill.style.width = '100%';
                    // Hide progress area after a delay
                    trackModuleTimeout(() => {
                        progressArea.style.display = 'none';
                    }, 2000);
                }
                return;
            }

            // Find matching codex entries
            const discoveredEntries = [];
            const updatedPages = [];
            const totalEntries = Object.values(this.data).flat().length;
            let processedEntries = 0;
            let lastDiscoveryTime = 0; // Track when last discovery was shown

            // Update progress for codex scanning phase
            if (progressText) {
                progressText.textContent = `Scanning ${totalEntries} codex entries...`;
            }
            if (progressFill) {
                progressFill.style.width = '20%';
            }

            for (const [category, entries] of Object.entries(this.data)) {
                for (const entry of entries) {
                    processedEntries++;
                    
                    // Update progress bar with current entry info - REAL PROGRESS, no throttling
                    const progressPercent = 20 + ((processedEntries / totalEntries) * 80); // 20-100% range for codex scanning
                    if (progressFill) {
                        progressFill.style.width = `${progressPercent}%`;
                    }
                    
                    // Only update progress text if we haven't shown a discovery recently
                    const now = Date.now();
                    if (progressText && (now - lastDiscoveryTime) > 1000) {
                        progressText.textContent = `Scanning: ${entry.name}`;
                    }
                    
                    // Add a small delay every 5 entries to make progress visible
                    if (processedEntries % 5 === 0) {
                        await moduleDelay(100);
                    }
                    
                    // Check if entry name matches any inventory item
                    const entryNameLower = entry.name.toLowerCase().trim();
                    
                    if (inventoryItems.has(entryNameLower)) {
                        // Check if this entry is already visible
                        const page = await fromUuid(entry.uuid);
                        if (page && page.ownership?.default < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                            // Find which character(s) had this item
                            const discoverers = [];
                            
                            // Log what we're looking for
                            
                            for (const token of tokens) {
                                const actor = token.actor;
                                const items = actor.items.contents.filter(item => 
                                    ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                                );
                                
                                let foundInThisActor = false;
                                
                                for (const item of items) {
                                    // Normalize the item name the same way we did when building inventoryItems
                                    const itemNameLower = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                    
                                    if (itemNameLower === entryNameLower) {
                                        if (!foundInThisActor) {
                                            discoverers.push(actor.name);
                                            foundInThisActor = true;
                                        }
                                        // Don't break - continue checking other items in case there are duplicates
                                    }
                                    
                                    // Check backpack contents
                                    if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                                        for (const containedItem of item.contents) {
                                            const containedItemNameLower = containedItem.name.toLowerCase().replace(/\s+/g, ' ').trim();
                                            if (containedItemNameLower === entryNameLower) {
                                                if (!foundInThisActor) {
                                                    discoverers.push(actor.name);
                                                    foundInThisActor = true;
                                                }
                                                // Don't break - continue checking other contained items
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Log what we found
                            
                            // Make it visible
                            await page.update({ 'ownership.default': CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
                            discoveredEntries.push(entry.name);
                            updatedPages.push(page);
                            
                            // Add "Discovered By" information to the journal entry
                            if (discoverers.length > 0) {
                                await this._addDiscoveredByInfo(page, discoverers);
                            }
                            
                            // Show discovery immediately with progress update
                            if (progressText) {
                                progressText.textContent = `✓ Found: ${entry.name}`;
                                lastDiscoveryTime = Date.now(); // Mark when discovery was shown
                                // Keep discovery visible for a moment - increased delay
                                await moduleDelay(1200);
                            }
                        }
                    }
                }
            }

            // Show final summary regardless of results
            if (discoveredEntries.length === 0) {
                if (progressText) {
                    progressText.textContent = `No new entries found`;
                }
            } else {
                if (progressText) {
                    progressText.textContent = `Found ${discoveredEntries.length} new entries`;
                }
            }
            
            // Keep final summary visible for a moment
            await moduleDelay(1500);
            
            // Log detailed results with discoverer information
            
            // Show completion message and hide progress area after delay
            if (progressArea && progressFill && progressText) {
                // Show prominent completion message
                progressText.textContent = 'Scan Complete!';
                progressFill.style.width = '100%';
                
                // Add a visual completion indicator
                progressArea.classList.add('scan-complete');
                
                // Keep completion message visible for 5 seconds
                await moduleDelay(5000);
                
                // Remove completion styling and hide progress area
                progressArea.classList.remove('scan-complete');
                progressArea.style.display = 'none';
            }
            
            // Clear import flag and refresh panel once at the end
            this.isImporting = false;
            await this._refreshData();
            this.render(this.element);
            
        } catch (error) {
            // Clear import flag on error
            this.isImporting = false;
            
            console.error('Error during auto-discovery:', error);
            ui.notifications.error(`Auto-discovery failed: ${error.message}`);
            
            // Show error in progress area
            if (progressArea && progressFill && progressText) {
                progressText.textContent = `Error: ${error.message}`;
                progressFill.style.width = '100%';
                
                // Hide progress area after a delay
                trackModuleTimeout(() => {
                    progressArea.style.display = 'none';
                }, 3000);
            }
        } finally {
            // Reset button state (titlebar menu icon)
            const menuBtn = nativeElement.querySelector('.codex-titlebar-menu');
            if (menuBtn) {
                menuBtn.classList.remove('working');
                menuBtn.setAttribute('title', 'Codex options');
            }
        }
    }

    /**
     * Open the Import Codex from JSON dialog (used from titlebar menu).
     * @private
     */
    async _openImportCodexDialog() {
        let template = '';
        try {
            const response = await fetch('modules/coffee-pub-squire/prompts/prompt-codex.txt');
            if (response.ok) template = await response.text();
            else template = 'Failed to load prompt-codex.txt.';
        } catch (e) {
            template = 'Failed to load prompt-codex.txt.';
        }
        new Dialog({
            title: 'Import Codex from JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                type: 'codex',
                isImport: true,
                isExport: false,
                jsonInputId: 'codex-import-json'
            }),
            buttons: {
                cancel: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Import' },
                import: {
                    icon: '<i class="fa-solid fa-file-import"></i>',
                    label: 'Import JSON',
                    callback: async (html) => {
                        ui.notifications.info('Importing Codex entries. This may take some time as entries are added, updated, indexed, and sorted. You will be notified when the process is complete.');
                        this.isImporting = true;
                        this._showProgressBar();
                        try {
                            let nativeDlgHtml = html;
                            if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            const value = jsonInput?.value || '';
                            const data = JSON.parse(value);
                            if (!Array.isArray(data)) {
                                ui.notifications.error('Imported JSON must be an array of entries.');
                                return;
                            }
                            if (!this.selectedJournal) {
                                ui.notifications.error('No Codex journal selected.');
                                return;
                            }
                            this._updateProgressBar(10, 'Validating import data...');
                            let added = 0, updated = 0, duplicatesMerged = 0;
                            const importNameCounts = {};
                            const duplicateNames = [];
                            data.forEach(entry => {
                                if (entry.name) {
                                    importNameCounts[entry.name] = (importNameCounts[entry.name] || 0) + 1;
                                    if (importNameCounts[entry.name] > 1 && !duplicateNames.includes(entry.name)) duplicateNames.push(entry.name);
                                }
                            });
                            if (duplicateNames.length > 0) ui.notifications.warn(`Warning: Import data contains duplicate entry names: ${duplicateNames.join(', ')}. These will be merged with existing entries.`);
                            this._updateProgressBar(20, `Processing ${data.length} entries...`);
                            const totalEntries = data.length;
                            for (let i = 0; i < data.length; i++) {
                                const entry = data[i];
                                const entryProgress = 20 + ((i / totalEntries) * 60);
                                this._updateProgressBar(entryProgress, `Processing: ${entry.name}`);
                                let page = null;
                                if (entry.uuid) page = this.selectedJournal.pages.find(p => p.getFlag(MODULE.ID, 'codexUuid') === entry.uuid);
                                if (!page) page = this.selectedJournal.pages.find(p => p.name === entry.name);
                                if (page) {
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(page.text.content, 'text/html');
                                    const pTags = Array.from(doc.querySelectorAll('p'));
                                    for (const p of pTags) {
                                        const strong = p.querySelector('strong');
                                        if (!strong) continue;
                                        const label = strong.textContent.trim().replace(/:$/, '').toUpperCase();
                                        if (["CATEGORY","DESCRIPTION","PLOT HOOK","LINK","LOCATION","TAGS"].includes(label)) p.remove();
                                    }
                                    const newFields = [];
                                    if (entry.category) newFields.push(`<p><strong>Category:</strong> ${entry.category}</p>`);
                                    if (entry.description) newFields.push(`<p><strong>Description:</strong> ${entry.description}</p>`);
                                    if (entry.plotHook) newFields.push(`<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>`);
                                    if (entry.link?.uuid && entry.link?.label) newFields.push(`<p><strong>Link:</strong> @UUID[${entry.link.uuid}]{${entry.link.label}}</p>`);
                                    if (entry.location) newFields.push(`<p><strong>Location:</strong> ${entry.location}</p>`);
                                    if (entry.tags && entry.tags.length) newFields.push(`<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>`);
                                    doc.body.innerHTML = newFields.join('\n') + doc.body.innerHTML;
                                    await page.update({ 'text.content': doc.body.innerHTML });
                                    updated++;
                                    if (entry.uuid && page.getFlag(MODULE.ID, 'codexUuid') !== entry.uuid) duplicatesMerged++;
                                } else {
                                    let htmlContent = '';
                                    if (entry.img) htmlContent += `<img src="${entry.img}" alt="${entry.name}">`;
                                    if (entry.category) htmlContent += `<p><strong>Category:</strong> ${entry.category}</p>`;
                                    if (entry.description) htmlContent += `<p><strong>Description:</strong> ${entry.description}</p>`;
                                    if (entry.plotHook) htmlContent += `<p><strong>Plot Hook:</strong> ${entry.plotHook}</p>`;
                                    if (entry.location) htmlContent += `<p><strong>Location:</strong> ${entry.location}</p>`;
                                    if (entry.link && entry.link.uuid && entry.link.label) htmlContent += `<p><strong>Link:</strong> @UUID[${entry.link.uuid}]{${entry.link.label}}</p>`;
                                    if (entry.tags && entry.tags.length) htmlContent += `<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>`;
                                    const newPage = await this.selectedJournal.createEmbeddedDocuments('JournalEntryPage', [{
                                        name: entry.name,
                                        type: 'text',
                                        text: { content: htmlContent },
                                        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
                                    }]);
                                    if (entry.uuid) await newPage[0].setFlag(MODULE.ID, 'codexUuid', entry.uuid);
                                    added++;
                                }
                                if (i % 5 === 0) await moduleDelay(100);
                            }
                            this._updateProgressBar(80, 'Sorting entries...');
                            const sorted = this.selectedJournal.pages.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
                            for (let i = 0; i < sorted.length; i++) await sorted[i].update({ sort: (i + 1) * 10 });
                            this._updateProgressBar(90, 'Finalizing import...');
                            let message = `Codex import complete: ${added} added, ${updated} updated.`;
                            if (duplicatesMerged > 0) message += ` ${duplicatesMerged} duplicates were merged.`;
                            ui.notifications.info(message);
                            this._updateProgressBar(100, 'Import complete!');
                            await moduleDelay(2000);
                            this._hideProgressBar();
                            this.isImporting = false;
                            await this._refreshData();
                            this.render(this.element);
                        } catch (e) {
                            this._hideProgressBar();
                            this.isImporting = false;
                            ui.notifications.error('Invalid JSON.');
                        }
                    }
                }
            },
            default: 'import',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                const cancelButton = nativeDlgHtml.querySelector('[data-button="cancel"]');
                if (cancelButton) cancelButton.classList.add('squire-cancel-button');
                const importButton = nativeDlgHtml.querySelector('[data-button="import"]');
                if (importButton) importButton.classList.add('squire-submit-button');
                const copyTemplateButton = nativeDlgHtml.querySelector('.copy-template-button');
                if (copyTemplateButton) {
                    copyTemplateButton.addEventListener('click', () => {
                        let output = template;
                        const rulebooks = game.settings.get(MODULE.ID, 'defaultRulebooks');
                        if (rulebooks && rulebooks.trim()) output = output.replace('[ADD-RULEBOOKS-HERE]', rulebooks);
                        copyToClipboard(output);
                        ui.notifications.info('Template copied to clipboard!');
                    });
                }
                const browseFileButton = nativeDlgHtml.querySelector('.browse-file-button');
                if (browseFileButton) {
                    browseFileButton.addEventListener('click', () => {
                        const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                        if (fileInput) fileInput.click();
                    });
                }
                const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                if (fileInput) {
                    fileInput.addEventListener('change', async (event) => {
                        const file = event.target.files[0];
                        if (!file) return;
                        try {
                            if (!file.name.toLowerCase().endsWith('.json')) {
                                ui.notifications.error('Please select a JSON file.');
                                return;
                            }
                            const text = await file.text();
                            let importData;
                            try {
                                importData = JSON.parse(text);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON in file: ' + e.message);
                                return;
                            }
                            if (!Array.isArray(importData)) {
                                ui.notifications.error('Invalid file format: Must be an array of codex entries.');
                                return;
                            }
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            if (jsonInput) jsonInput.value = text;
                            ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                            event.target.value = '';
                        } catch (error) {
                            console.error('Error reading file:', error);
                            ui.notifications.error(`Error reading file: ${error.message}`);
                        }
                    });
                }
            }
        }, { classes: ['import-export-dialog'], id: 'import-export-dialog-codex-import' }).render(true);
    }

    /**
     * Open the Export Codex as JSON dialog (used from titlebar menu).
     * @private
     */
    async _openExportCodexDialog() {
        const exportData = [];
        for (const cat of this.categories) {
            const entries = (this.data[cat] || []).map(entry => {
                const newEntry = { ...entry };
                if (newEntry.img && typeof newEntry.img === 'string') {
                    const origin = window.location.origin + '/';
                    if (newEntry.img.startsWith(origin)) newEntry.img = newEntry.img.slice(origin.length);
                }
                return newEntry;
            });
            exportData.push(...entries);
        }
        const jsonString = JSON.stringify(exportData, null, 2);
        new Dialog({
            title: 'Export Codex as JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                type: 'codex',
                isImport: false,
                isExport: true,
                jsonOutputId: 'codex-export-json',
                exportData: jsonString,
                exportSummary: { totalItems: exportData.length, exportVersion: "1.0", timestamp: new Date().toLocaleString() }
            }),
            buttons: {
                close: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Export' },
                download: {
                    icon: '<i class="fa-solid fa-download"></i>',
                    label: 'Download JSON',
                    callback: () => {
                        try {
                            const sanitizeWindowsFilename = (name) => name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+$/g, "").replace(/\.+$/g, "").slice(0, 150);
                            const stamp = new Date().toISOString().replace(/[:]/g, "-");
                            const filename = sanitizeWindowsFilename(`COFFEEPUB-SQUIRE-codex-export-${stamp}.json`);
                            if (typeof saveDataToFile === 'function') {
                                saveDataToFile(jsonString, "application/json;charset=utf-8", filename);
                                ui.notifications.info(`Codex export saved as ${filename}`);
                            } else {
                                const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = filename;
                                a.style.display = 'none';
                                a.rel = "noopener";
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                trackModuleTimeout(() => URL.revokeObjectURL(url), 0);
                                ui.notifications.info(`Codex export downloaded as ${filename}`);
                            }
                        } catch (error) {
                            copyToClipboard(jsonString);
                            ui.notifications.warn('Download failed. Export data copied to clipboard instead.');
                            console.error('Export download failed:', error);
                        }
                    }
                }
            },
            default: 'download'
        }, {
            classes: ['import-export-dialog'],
            id: 'import-export-dialog-codex-export',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                const closeButton = nativeDlgHtml.querySelector('[data-button="close"]');
                if (closeButton) closeButton.classList.add('squire-cancel-button');
                const downloadButton = nativeDlgHtml.querySelector('[data-button="download"]');
                if (downloadButton) downloadButton.classList.add('squire-submit-button');
            }
        }).render(true);
    }

    /**
     * Add "Discovered By" information to a journal entry.
     * @private
     * @param {JournalEntryPage} page - The journal entry page to update.
     * @param {string[]} discoverers - An array of character names who discovered the entry.
     */
    async _addDiscoveredByInfo(page, discoverers) {
        try {
            const TextEditor = getTextEditor();
            const enrichedContent = await TextEditor.enrichHTML(page.text.content, {
                secrets: game.user.isGM,
                documents: true,
                links: true,
                rolls: true
            });

            const doc = new DOMParser().parseFromString(enrichedContent, 'text/html');
            const pTags = Array.from(doc.querySelectorAll('p'));

            // Find existing "Discovered By" paragraph by looking for the text content
            let discoveredByParagraph = null;
            let existingDiscoverers = [];
            
            for (let i = pTags.length - 1; i >= 0; i--) {
                const p = pTags[i];
                const strong = p.querySelector('strong');
                if (strong && strong.textContent.trim() === 'Discovered By:') {
                    discoveredByParagraph = p;
                    // Extract existing discoverers from the paragraph text
                    const discovererText = p.textContent.replace('Discovered By:', '').trim();
                    if (discovererText) {
                        existingDiscoverers = discovererText.split(',').map(d => d.trim());
                    }
                    break;
                }
            }

            // Combine existing and new discoverers, removing duplicates
            const allDiscoverers = [...new Set([...existingDiscoverers, ...discoverers])];
            
            // Create the "Discovered By" paragraph without the class attribute
            const newDiscoveredByParagraph = document.createElement('p');
            newDiscoveredByParagraph.innerHTML = `<strong>Discovered By:</strong> ${allDiscoverers.join(', ')}`;
            
            if (discoveredByParagraph) {
                // Replace existing paragraph
                discoveredByParagraph.replaceWith(newDiscoveredByParagraph);
            } else {
                // Add new paragraph at the end
                doc.body.appendChild(newDiscoveredByParagraph);
            }

            // Update the page content
            await page.update({ 'text.content': doc.body.innerHTML });
            
        } catch (error) {
            console.error('Error updating "Discovered By" information:', error);
        }
    }

    /**
     * Render the codex panel
     * @param {HTMLElement|jQuery} element - The element to render into (may be jQuery, will be converted)
     */
    async render(element) {
        if (!element) return;
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);

        // codexContainer is guaranteed native DOM (from querySelector on already-converted element)
        const codexContainer = this.element?.querySelector('[data-panel="panel-codex"]');
        if (!codexContainer) return;

        // Refresh data if needed
        await this._refreshData();

        // Get collapsed states
        const collapsedCategories = this.filters.tags.length > 0 ? {} : (game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {});
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Build categoriesData array for the template
        // Sort categories with "No Category" always first, then alphabetically for the rest
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            if (a === "No Category") return -1;
            if (b === "No Category") return 1;
            return a.localeCompare(b);
        });
        
        const categoriesData = await Promise.all(sortedCategories.map(async category => {
            let entries = this.data[category] || [];
            if (!game.user.isGM) {
                // Only show visible entries for non-GMs
                entries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            }
            if (this.filters.tags && this.filters.tags.length > 0) {
                entries = entries.filter(entry => entry.tags.some(tag => this.filters.tags.includes(tag)));
            }
            // Sort entries alphabetically by name
            entries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
            // Enrich links for Foundry UUID handling
            for (const entry of entries) {
                if (entry.link && entry.link.uuid && entry.link.label) {
                    const TextEditor = getTextEditor();
                    entry.linkHtml = await TextEditor.enrichHTML(
                        `@UUID[${entry.link.uuid}]{${entry.link.label}}`,
                        { documents: true, links: true }
                    );
                }
            }
            const totalCount = entries.length;
            const visibleEntries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const visibleCount = visibleEntries.length;
            
            // For "No Category", only include if it has visible entries
            if (category === "No Category" && visibleCount === 0) {
                return null;
            }
            
            return {
                name: category,
                icon: this.getCategoryIcon(category),
                entries,
                collapsed: collapsedCategories[category] || false,
                totalCount,
                visibleCount,
                visibleEntries
            };
        }));
        
        // Filter out null entries (empty "No Category" sections)
        const filteredCategoriesData = categoriesData.filter(cat => cat !== null);

        // Build allTags for tag cloud
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all entries
            const allEntries = filteredCategoriesData.flatMap(cat => cat.entries);
            allTags = new Set();
            allEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        } else {
            // Players see tags only from visible entries
            const allVisibleEntries = filteredCategoriesData.flatMap(cat => cat.visibleEntries);
            allTags = new Set();
            allVisibleEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categoriesData: filteredCategoriesData,
            filters: {
                ...this.filters,
                search: this.filters.search || ""
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed
        };

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX, safeTemplateData);
        // v13: Use native DOM innerHTML instead of jQuery html()
        codexContainer.innerHTML = html;

        // Activate listeners
        this._activateListeners(codexContainer);

        // Restore collapsed states
        // v13: Use safer selector approach to handle values with newlines/whitespace
        for (const [category, collapsed] of Object.entries(collapsedCategories)) {
            if (collapsed) {
                // Use querySelectorAll and filter to handle values with special characters
                const sections = codexContainer.querySelectorAll('.codex-section[data-category]');
                const section = Array.from(sections).find(s => {
                    const attrValue = s.getAttribute('data-category');
                    return attrValue && attrValue.trim() === category.trim();
                });
                if (section) {
                    section.classList.add('collapsed');
                }
            }
        }
    }
}

