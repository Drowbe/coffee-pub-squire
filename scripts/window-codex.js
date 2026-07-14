import { MODULE } from './const.js';
import { CodexParser } from './utility-codex-parser.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { trackModuleTimeout } from './timer-utils.js';
import { getTextEditor } from './helpers.js';
import { updateCodexPin as updateCodexPinForEntry } from './manager-pins.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2 || getBlacksmith()?.getWindowBaseV2?.();
if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for CodexWindow');
}

export const CODEX_WINDOW_ID = `${MODULE.ID}-codex-window`;

export class CodexWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'codex-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: CODEX_WINDOW_ID,
            classes: ['codex-entry-window', 'codex-window', 'squire-window'],
            position: { width: 760, height: 820 },
            window: { title: 'Codex', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 640, minHeight: 620 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-codex.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(entry = null, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${CODEX_WINDOW_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CodexWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CodexWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.pageUuid = opts.pageUuid || null;
        this.page = opts.page || null;
        this.isEditing = !!this.pageUuid;
        // When the preview image was derived from the first Expanded Details
        // illustration (no explicit system.img), remember it so saving doesn't
        // freeze the derived value into system.img
        this._imgDerivedFromLore = opts.imgDerivedFromLore || null;
        this.entry = foundry.utils.mergeObject(this._getDefaultEntry(), entry || {}, { inplace: false });
        this.entry.pageUuid = this.pageUuid;
        this.entry.link = this._normalizeLinkValue(this.entry.link, this.entry.linkLabel || this.entry.name || 'Link');
        this._eventHandlers = [];
    }

    static async fromPage(page, options = {}) {
        let entry = null;
        let imgDerivedFromLore = null;
        try {
            if (page?.type === CODEX_PAGE_TYPE) {
                // Typed page: fields come straight from system — no parsing
                const sys = page.system;
                const rawContent = typeof page.text?.content === 'string' ? page.text.content : '';
                // Explicit image wins; else preview the first Expanded Details illustration
                if (!sys.img) {
                    imgDerivedFromLore = CodexParser.extractImage(rawContent) || null;
                }
                entry = {
                    name: page.name,
                    img: sys.img || imgDerivedFromLore || null,
                    category: sys.category || '',
                    categoryIcon: sys.categoryIcon || '',
                    description: sys.summary || '',
                    plotHook: sys.plotHook || '',
                    location: sys.location || '',
                    link: sys.linkData,
                    linkLabel: sys.link?.label || '',
                    tags: Array.from(sys.tags || []),
                    expandedDetails: rawContent
                };
            } else {
                // Legacy text page: parse the old HTML format
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
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error parsing codex page for edit:', error);
        }

        return new CodexWindow(entry || { name: page?.name || '' }, {
            ...options,
            pageUuid: page?.uuid || options.pageUuid || null,
            page,
            imgDerivedFromLore
        });
    }

    async getData() {
        return {
            appId: this.id,
            entry: this.entry,
            isEditing: this.isEditing,
            isGM: game.user.isGM,
            windowTitle: 'Codex',
            headerTitle: this._getHeaderTitle(),
            subtitle: this.isEditing ? 'Edit Codex Entry' : '',
            existingCategories: this._getExistingCategories(),
            existingLocations: this._getExistingLocations(),
            suggestedTags: this._getSuggestedTags()
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
        this._mountExpandedEditor(root);
        this._updateFormFields();
    }

    /**
     * Mount the Expanded Details ProseMirror editor. The <prose-mirror> element takes
     * its content from a `value` config/attribute — innerHTML is discarded — so it must
     * be created programmatically (same pattern as the note window editor).
     * @private
     */
    _mountExpandedEditor(root) {
        const host = root.querySelector('.codex-expanded-editor-host');
        if (!host) return;
        this._expandedEditorRemounted = false;

        const mount = () => {
            host.innerHTML = '';

            let value = String(this.entry.expandedDetails || '');
            // Resilience: if the entry somehow arrived without its lore, read it
            // straight from the page document
            if (!value && this.page && typeof this.page.text?.content === 'string') {
                value = this.page.text.content;
            }

            const config = {
                name: 'expandedDetails',
                value,
                compact: true
            };
            if (this.pageUuid) config.documentUUID = this.pageUuid;

            const editor = foundry.applications.elements.HTMLProseMirrorElement.create(config);
            editor.classList.add('codex-expanded-editor');
            host.appendChild(editor);

            // Dead-editor detector: if the element was disconnected and reconnected
            // during window assembly, it comes back permanently empty (its internal
            // active flag survives disconnection, so refresh and re-activation are
            // both skipped). Detect that state and remount once with a fresh element.
            trackModuleTimeout(() => {
                if (!host.isConnected) return;
                const contentEl = host.querySelector('.editor-content');
                const dead = !contentEl || (!contentEl.childNodes.length && value.length);
                console.debug('SQUIRE | Codex expanded editor state', {
                    usedChars: value.length,
                    hasEditorContent: !!contentEl,
                    renderedNodes: contentEl?.childNodes?.length ?? null,
                    dead,
                    remounting: dead && !this._expandedEditorRemounted
                });
                if (dead && !this._expandedEditorRemounted) {
                    this._expandedEditorRemounted = true;
                    mount();
                }
            }, 300);
        };

        // Mount on the next frame: the <prose-mirror> element builds itself in
        // connectedCallback, so it must be created AFTER the window's DOM is attached
        // and settled — creating it while the framework is still assembling/moving
        // nodes triggers the disconnect/reconnect trap described above.
        requestAnimationFrame(() => {
            if (host.isConnected) return mount();
            requestAnimationFrame(mount);
        });
    }

    _getDefaultEntry() {
        return {
            name: '',
            img: null,
            category: '',
            categoryIcon: '',
            description: '',
            plotHook: '',
            location: '',
            link: null,
            linkLabel: '',
            pageUuid: null,
            tags: [],
            expandedDetails: ''
        };
    }

    _getHeaderTitle() {
        if (this.isEditing) {
            return String(this.entry?.name || this.page?.name || 'Untitled Codex Entry').trim() || 'Untitled Codex Entry';
        }
        return 'New Codex Entry';
    }

    _normalizeCategoryValue(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
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

    _getSuggestedTags() {
        return [
            'Artifact',
            'Book',
            'Character',
            'City',
            'Dungeon',
            'Event',
            'Faction',
            'History',
            'Item',
            'Location',
            'Lore',
            'Map',
            'NPC',
            'Organization',
            'Quest',
            'Region',
            'Rumor',
            'Settlement'
        ];
    }

    _getExistingCategories() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];

        const journal = game.journal.get(journalId);
        if (!journal) return [];

        const categories = new Map();
        for (const page of journal.pages.contents) {
            try {
                let raw = '';
                if (page.type === CODEX_PAGE_TYPE) {
                    // Typed page: category lives in system data
                    raw = page.system?.category || '';
                } else {
                    // Legacy text page: scrape the old HTML field
                    const content = page.text?.content || '';
                    const categoryMatch = content.match(/<strong>Category:<\/strong>\s*([^<]+)/);
                    raw = categoryMatch ? this._decodeHtmlEntities(categoryMatch[1]) : '';
                }
                const normalized = this._normalizeCategoryValue(raw);
                if (normalized) {
                    categories.set(normalized.toLowerCase(), normalized);
                }
            } catch (_) {}
        }
        return Array.from(categories.values()).sort((a, b) => a.localeCompare(b));
    }

    _getExistingLocations() {
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') return [];

        const journal = game.journal.get(journalId);
        if (!journal) return [];

        const locations = new Set();
        for (const page of journal.pages.contents) {
            try {
                let location = '';
                if (page.type === CODEX_PAGE_TYPE) {
                    // Typed page: location lives in system data
                    location = (page.system?.location || '').trim();
                } else {
                    // Legacy text page: scrape the old HTML field
                    const content = page.text?.content || '';
                    const locationMatch = content.match(/<strong>Location:<\/strong>\s*([^<]+)/);
                    if (locationMatch) location = this._decodeHtmlEntities(locationMatch[1]);
                }
                if (location) locations.add(location);
            } catch (_) {}
        }
        return Array.from(locations).sort();
    }

    async _handleFormSubmit(event) {
        event?.preventDefault?.();
        const form = event?.target?.closest?.('form') || event?.target || this._getRoot()?.querySelector('form');
        if (!form) return;
        const entry = this._collectFormEntry(form);
        await this._updateObject(event, entry);
    }

    _collectFormEntry(form) {
        const formData = new FormData(form);
        const entry = {};
        for (const [key, value] of formData.entries()) {
            if (key === 'img' && !value) continue;
            if (key === 'location' && !value) continue;
            if (key === 'plotHook' && !value) continue;
            if (key === 'link' && !value) continue;
            entry[key] = value;
        }
        // Read the ProseMirror element directly — its .value serializes the LIVE
        // editor state, which FormData is not guaranteed to capture
        const expandedEditor = form.querySelector('prose-mirror[name="expandedDetails"]');
        if (expandedEditor) entry.expandedDetails = expandedEditor.value ?? '';
        return entry;
    }

    async _updateObject(_event, formData) {
        const entry = foundry.utils.expandObject(formData);
        entry.pageUuid = this.pageUuid || entry.pageUuid || null;
        entry.category = this._normalizeCategoryValue(entry.category);
        entry.categoryIcon = String(entry.categoryIcon || '').trim();
        entry.link = await this._resolveLinkFromForm(entry.link, entry.linkLabel, entry.name);
        entry.linkLabel = entry.link?.label || '';
        entry.tags = this._normalizeTags(entry.tags);
        this.entry = foundry.utils.mergeObject(this.entry, entry, { inplace: false });

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No codex journal selected. Please select a journal in the codex panel settings.');
            return false;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected codex journal not found.');
            return false;
        }

        try {
            // Structured fields live in page.system; Expanded Details (the page's
            // text.content) is edited via the form's ProseMirror element.
            const systemData = {
                summary: entry.description || '',
                category: entry.category || '',
                categoryIcon: entry.categoryIcon || '',
                plotHook: entry.plotHook || '',
                location: entry.location || '',
                link: (entry.link?.uuid)
                    ? { uuid: entry.link.uuid, label: entry.link.label || entry.linkLabel || entry.name || 'Link' }
                    : { uuid: '', label: '' },
                tags: entry.tags || [],
                // Don't freeze a lore-derived preview image into system.img — the entry
                // image stays dynamic (first Expanded Details illustration) unless the
                // user explicitly picked a different one
                img: (entry.img && entry.img !== this._imgDerivedFromLore) ? entry.img : ''
            };
            const pageData = {
                name: entry.name,
                type: CODEX_PAGE_TYPE,
                system: systemData,
                text: { content: entry.expandedDetails ?? '' }
            };

            if (this.isEditing && this.pageUuid) {
                const page = this.page || await fromUuid(this.pageUuid);
                if (!page) {
                    ui.notifications.error('The codex entry you are editing could not be found.');
                    return false;
                }
                if (page.type !== CODEX_PAGE_TYPE) {
                    ui.notifications.error('This is a legacy codex page — re-import your codex JSON to convert it before editing.');
                    return false;
                }
                const patch = { name: pageData.name, system: pageData.system };
                // Only write Expanded Details if the editor was present in the form
                if (entry.expandedDetails !== undefined) patch['text.content'] = entry.expandedDetails;
                await page.update(patch);
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
            console.error('Coffee Pub Squire | Error saving codex entry:', error);
            ui.notifications.error(`Failed to save codex entry: ${error.message}`);
            return false;
        }
    }

    _setupFormInteractions(root) {
        const nameInput = root.querySelector('#name');
        if (nameInput) {
            const handler = () => {
                this.entry.name = nameInput.value || '';
                this._updateHeaderFields();
            };
            nameInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: nameInput, event: 'input', handler });
        }

        const categorySelect = root.querySelector('#category');
        const newCategoryInput = root.querySelector('#new-category');
        const categoryIconInput = root.querySelector('#categoryIcon');
        const newCategoryInputField = root.querySelector('.new-category-input-field');
        const categoryIconField = root.querySelector('.new-category-icon-field');
        if (categorySelect) {
            const handler = function() {
                if (this.value === 'new') {
                    if (newCategoryInputField) newCategoryInputField.style.display = 'flex';
                    newCategoryInput.focus();
                    newCategoryInput.setAttribute('name', 'category');
                    newCategoryInput.required = true;
                    if (categoryIconField) categoryIconField.style.display = 'flex';
                    if (categoryIconInput) {
                        categoryIconInput.setAttribute('name', 'categoryIcon');
                        categoryIconInput.required = true;
                    }
                    categorySelect.removeAttribute('name');
                } else {
                    if (newCategoryInputField) newCategoryInputField.style.display = 'none';
                    newCategoryInput.removeAttribute('name');
                    newCategoryInput.required = false;
                    if (categoryIconField) categoryIconField.style.display = 'none';
                    if (categoryIconInput) {
                        categoryIconInput.removeAttribute('name');
                        categoryIconInput.required = false;
                        categoryIconInput.value = '';
                    }
                    categorySelect.setAttribute('name', 'category');
                }
            };
            categorySelect.addEventListener('change', handler);
            this._eventHandlers.push({ element: categorySelect, event: 'change', handler });
        }

        const locationSelect = root.querySelector('#location');
        const newLocationInput = root.querySelector('#new-location');
        const newLocationInputField = root.querySelector('.new-location-input-field');
        if (locationSelect) {
            const handler = function() {
                if (this.value === 'new') {
                    if (newLocationInputField) newLocationInputField.style.display = 'flex';
                    newLocationInput.focus();
                    newLocationInput.setAttribute('name', 'location');
                    locationSelect.removeAttribute('name');
                } else {
                    if (newLocationInputField) newLocationInputField.style.display = 'none';
                    newLocationInput.removeAttribute('name');
                    locationSelect.setAttribute('name', 'location');
                }
            };
            locationSelect.addEventListener('change', handler);
            this._eventHandlers.push({ element: locationSelect, event: 'change', handler });
        }

        if (newCategoryInput) {
            const handler = function() {
                if (this.value.trim()) {
                    categorySelect.removeAttribute('name');
                    this.setAttribute('name', 'category');
                }
            };
            newCategoryInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: newCategoryInput, event: 'input', handler });
        }

        if (newLocationInput) {
            const handler = function() {
                if (this.value.trim()) {
                    locationSelect.removeAttribute('name');
                    this.setAttribute('name', 'location');
                }
            };
            newLocationInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: newLocationInput, event: 'input', handler });
        }

        const tagsInput = root.querySelector('#tags');
        if (tagsInput) {
            const handler = () => {
                this.entry.tags = this._normalizeTags(tagsInput.value);
                this._updateTagChipStates(root);
            };
            tagsInput.addEventListener('input', handler);
            this._eventHandlers.push({ element: tagsInput, event: 'input', handler });
        }

        root.querySelectorAll('.codex-tag-chip').forEach(chip => {
            const handler = () => {
                const value = String(chip.dataset.tagValue || '').trim();
                if (!value) return;
                const current = this._normalizeTags(tagsInput?.value || this.entry.tags || []);
                const exists = current.some(tag => tag.toLowerCase() === value.toLowerCase());
                this.entry.tags = exists
                    ? current.filter(tag => tag.toLowerCase() !== value.toLowerCase())
                    : [...current, value];
                if (tagsInput) {
                    tagsInput.value = this.entry.tags.join(', ');
                }
                this._updateTagChipStates(root);
            };
            chip.addEventListener('click', handler);
            this._eventHandlers.push({ element: chip, event: 'click', handler });
        });
    }

    _setupImageManagement(root) {
        const browseImageButton = root.querySelector('.codex-browse-image');
        if (browseImageButton) {
            const handler = async () => {
                if (typeof FilePicker !== 'function') {
                    ui.notifications.warn('Image browser is unavailable.');
                    return;
                }

                const picker = new FilePicker({
                    type: 'imagevideo',
                    current: this.entry.img || '',
                    callback: (path) => {
                        this.entry.img = path || null;
                        this._updateFormFields();
                    }
                });

                picker.render(true);
            };
            browseImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: browseImageButton, event: 'click', handler });
        }

        const removeImageButton = root.querySelector('.codex-remove-image');
        if (removeImageButton) {
            const handler = () => {
                this.entry.img = null;
                this._updateFormFields();
            };
            removeImageButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: removeImageButton, event: 'click', handler });
        }
    }

    _setupDragAndDrop(root) {
        const dragZone = root.querySelector('.codex-drag-zone');
        if (!dragZone) return;

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
                console.error('Coffee Pub Squire | Error processing dropped Codex entity:', error);
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
                if (parsed?.categoryIcon) this.entry.categoryIcon = parsed.categoryIcon;
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
                console.warn('Coffee Pub Squire | Error parsing dropped journal for Codex entry:', error);
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
        const form = this._getRoot()?.querySelector('form');
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

        const categoryIconInput = form.querySelector('#categoryIcon');
        if (categoryIconInput) categoryIconInput.value = this.entry.categoryIcon || '';

        this._updateHeaderFields();

        const categorySelect = form.querySelector('#category');
        const newCategoryInput = form.querySelector('#new-category');
        const newCategoryInputField = form.querySelector('.new-category-input-field');
        const categoryIconField = form.querySelector('.new-category-icon-field');
        if (categorySelect && newCategoryInput) {
            if (this.entry.category) {
                const existingOption = categorySelect.querySelector(`option[value="${this.entry.category}"]`);
                if (existingOption) {
                    categorySelect.value = this.entry.category;
                    if (newCategoryInputField) newCategoryInputField.style.display = 'none';
                    newCategoryInput.value = '';
                    newCategoryInput.removeAttribute('name');
                    newCategoryInput.required = false;
                    if (categoryIconField) categoryIconField.style.display = 'none';
                    if (categoryIconInput) {
                        categoryIconInput.removeAttribute('name');
                        categoryIconInput.required = false;
                        categoryIconInput.value = '';
                    }
                    categorySelect.setAttribute('name', 'category');
                } else {
                    categorySelect.value = 'new';
                    if (newCategoryInputField) newCategoryInputField.style.display = 'flex';
                    newCategoryInput.value = this.entry.category;
                    newCategoryInput.setAttribute('name', 'category');
                    newCategoryInput.required = true;
                    if (categoryIconField) categoryIconField.style.display = 'flex';
                    if (categoryIconInput) {
                        categoryIconInput.setAttribute('name', 'categoryIcon');
                        categoryIconInput.required = true;
                    }
                    categorySelect.removeAttribute('name');
                }
            } else {
                categorySelect.value = '';
                if (newCategoryInputField) newCategoryInputField.style.display = 'none';
                newCategoryInput.value = '';
                newCategoryInput.removeAttribute('name');
                newCategoryInput.required = false;
                if (categoryIconField) categoryIconField.style.display = 'none';
                if (categoryIconInput) {
                    categoryIconInput.removeAttribute('name');
                    categoryIconInput.required = false;
                    categoryIconInput.value = '';
                }
                categorySelect.setAttribute('name', 'category');
            }
        }

        const locationSelect = form.querySelector('#location');
        const newLocationInput = form.querySelector('#new-location');
        const newLocationInputField = form.querySelector('.new-location-input-field');
        if (locationSelect && newLocationInput) {
            if (this.entry.location) {
                const existingOption = locationSelect.querySelector(`option[value="${this.entry.location}"]`);
                if (existingOption) {
                    locationSelect.value = this.entry.location;
                    if (newLocationInputField) newLocationInputField.style.display = 'none';
                    newLocationInput.value = '';
                    newLocationInput.removeAttribute('name');
                    locationSelect.setAttribute('name', 'location');
                } else {
                    locationSelect.value = 'new';
                    if (newLocationInputField) newLocationInputField.style.display = 'flex';
                    newLocationInput.value = this.entry.location;
                    newLocationInput.setAttribute('name', 'location');
                    locationSelect.removeAttribute('name');
                }
            } else {
                locationSelect.value = '';
                if (newLocationInputField) newLocationInputField.style.display = 'none';
                newLocationInput.value = '';
                newLocationInput.removeAttribute('name');
                locationSelect.setAttribute('name', 'location');
            }
        }

        const imgSection = form.querySelector('.codex-image-section');
        const imgPlaceholder = form.querySelector('.codex-image-placeholder');
        const imgPreview = form.querySelector('.codex-image-preview');
        const removeImageButton = form.querySelector('.codex-remove-image');
        if (imgSection) {
            imgSection.style.display = '';
        }
        if (imgPlaceholder) {
            imgPlaceholder.style.display = this.entry.img ? 'none' : '';
        }
        if (imgPreview) {
            imgPreview.setAttribute('src', this.entry.img || '');
        }
        if (removeImageButton) {
            removeImageButton.classList.toggle('is-visible', !!this.entry.img);
        }

        this._updateTagChipStates(form);
    }

    _updateTagChipStates(root) {
        const tags = this._normalizeTags(this.entry.tags || []);
        root.querySelectorAll('.codex-tag-chip').forEach(chip => {
            const value = String(chip.dataset.tagValue || '').trim().toLowerCase();
            chip.classList.toggle('active', tags.some(tag => tag.toLowerCase() === value));
        });
    }

    _updateHeaderFields() {
        const root = this._getRoot();
        if (!root) return;
        const titleEl = root.querySelector('.codex-window-header-title');
        if (titleEl) {
            titleEl.textContent = this._getHeaderTitle();
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

    static async _actionSave(event, _target) {
        const instance = CodexWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance._handleFormSubmit({ preventDefault() {}, target: instance._getRoot()?.querySelector('form') });
    }

    static async _actionCancel(event, _target) {
        const instance = CodexWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance.close();
    }
}

CodexWindow.ACTION_HANDLERS = {
    save: CodexWindow._actionSave,
    cancel: CodexWindow._actionCancel
};

export async function openCodexWindow(options = {}) {
    let windowInstance;
    if (options.page) {
        windowInstance = await CodexWindow.fromPage(options.page, options);
    } else if (options.pageUuid) {
        const page = await fromUuid(options.pageUuid);
        windowInstance = page ? await CodexWindow.fromPage(page, options) : new CodexWindow(options.entry || null, options);
    } else {
        windowInstance = new CodexWindow(options.entry || null, options);
    }
    await windowInstance.render(true);
    return windowInstance;
}

export function registerCodexWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(CODEX_WINDOW_ID, {
        open: openCodexWindow,
        title: 'Codex',
        moduleId: MODULE.ID
    });
}
