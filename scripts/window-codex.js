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
        this.entry.links = this._normalizeLinks(this.entry.links, this.entry.link, this.entry.linkLabel);
        delete this.entry.link;
        delete this.entry.linkLabel;
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
                    links: sys.linkList,
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
                if (entry?.link) {
                    entry.links = [entry.link];
                    delete entry.link;
                }
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
            locationLevels: this._getLocationLevels(),
            suggestedTags: this._getSuggestedTags()
        };
    }

    /**
     * Build the segmented location path (Realm > Region > Site > Area): current
     * values from the entry's location string plus per-depth suggestions gathered
     * from every existing location in the codex.
     * @private
     */
    _getLocationLevels() {
        const LEVELS = [
            {
                label: 'Realm',
                placeholder: 'e.g. Faerûn',
                tooltip: 'The broad world or plane of existence, encompassing vast continents, cultures, and histories (e.g. Faerûn, Eberron).'
            },
            {
                label: 'Region',
                placeholder: 'e.g. Moonsea',
                tooltip: 'A defined area within a realm, such as a kingdom, territory, or geographic expanse (e.g. Moonsea, Daggerdale).'
            },
            {
                label: 'Site',
                placeholder: 'e.g. Teshwave',
                tooltip: 'A specific location or structure within a region, like a city, mine, or stronghold (e.g. Teshwave, Dagger Fall).'
            },
            {
                label: 'Area',
                placeholder: 'e.g. Broken Anvil',
                tooltip: 'A distinct location within a site, like a room, street, or zone (e.g. Broken Anvil, Shrine Row).'
            }
        ];
        const parts = String(this.entry.location || '').split('>').map(p => p.trim());
        const suggestions = LEVELS.map(() => new Set());
        for (const location of this._getExistingLocations()) {
            String(location).split('>').map(p => p.trim()).forEach((part, depth) => {
                if (part && depth < suggestions.length) suggestions[depth].add(part);
            });
        }
        return LEVELS.map((level, i) => ({
            ...level,
            value: parts[i] || '',
            suggestions: Array.from(suggestions[i]).sort((a, b) => a.localeCompare(b))
        }));
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
        this._setupLocationCombos(root);
        this._mountExpandedEditor(root);
        this._updateFormFields();
    }

    /**
     * Custom combo dropdowns for the location path segments. Native <datalist>
     * popups are positioned in pre-transform viewport coordinates by Chromium and
     * render nowhere near the input inside Foundry's transformed windows.
     * @private
     */
    _setupLocationCombos(root) {
        const combos = Array.from(root.querySelectorAll('.codex-location-combo'));
        if (!combos.length) return;

        const closeAll = (except = null) => {
            for (const combo of combos) {
                if (combo !== except) combo.classList.remove('open');
            }
        };

        for (const combo of combos) {
            const input = combo.querySelector('input');
            const toggle = combo.querySelector('.codex-location-combo-toggle');
            const menu = combo.querySelector('.codex-location-combo-menu');
            if (!input || !menu) continue;

            const filterOptions = () => {
                const needle = input.value.trim().toLowerCase();
                let visible = 0;
                menu.querySelectorAll('.codex-location-combo-option').forEach(option => {
                    const match = !needle || option.textContent.toLowerCase().includes(needle);
                    option.style.display = match ? '' : 'none';
                    if (match) visible++;
                });
                return visible;
            };

            if (toggle) {
                const toggleHandler = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const opening = !combo.classList.contains('open');
                    closeAll();
                    if (opening) {
                        // Toggle shows the FULL list regardless of current value
                        menu.querySelectorAll('.codex-location-combo-option').forEach(o => { o.style.display = ''; });
                        combo.classList.add('open');
                    }
                };
                toggle.addEventListener('click', toggleHandler);
                this._eventHandlers.push({ element: toggle, event: 'click', handler: toggleHandler });
            }

            const inputHandler = () => {
                const visible = filterOptions();
                combo.classList.toggle('open', visible > 0 && input.value.trim().length > 0);
            };
            input.addEventListener('input', inputHandler);
            this._eventHandlers.push({ element: input, event: 'input', handler: inputHandler });

            const menuHandler = (event) => {
                // "+ New …" clears the segment and focuses it for fresh input
                const newOption = event.target.closest('.codex-location-combo-new');
                if (newOption) {
                    event.preventDefault();
                    event.stopPropagation();
                    input.value = '';
                    combo.classList.remove('open');
                    input.focus();
                    return;
                }
                const option = event.target.closest('.codex-location-combo-option');
                if (!option) return;
                event.preventDefault();
                event.stopPropagation();
                input.value = option.textContent;
                combo.classList.remove('open');
            };
            menu.addEventListener('pointerdown', menuHandler);
            this._eventHandlers.push({ element: menu, event: 'pointerdown', handler: menuHandler });
        }

        // Any click elsewhere in the window closes open menus
        const outsideHandler = (event) => {
            if (!event.target.closest('.codex-location-combo')) closeAll();
        };
        root.addEventListener('pointerdown', outsideHandler);
        this._eventHandlers.push({ element: root, event: 'pointerdown', handler: outsideHandler });
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
            links: [],
            pageUuid: null,
            tags: [],
            expandedDetails: ''
        };
    }

    /**
     * Normalize a links array, folding in a legacy single link if provided.
     * @private
     */
    _normalizeLinks(links, legacyLink = null, legacyLabel = '') {
        const out = [];
        const push = (l) => {
            const uuid = typeof l?.uuid === 'string' ? l.uuid.trim() : '';
            if (!uuid) return;
            if (out.some(existing => existing.uuid === uuid)) return;
            out.push({ uuid, label: String(l.label || legacyLabel || uuid) });
        };
        if (Array.isArray(links)) links.forEach(push);
        if (legacyLink) push(legacyLink);
        return out;
    }

    /**
     * Add a link (deduped by UUID) and refresh the list display.
     * @private
     */
    _addLink(link) {
        const uuid = typeof link?.uuid === 'string' ? link.uuid.trim() : '';
        if (!uuid) return false;
        if (this.entry.links.some(l => l.uuid === uuid)) return false;
        this.entry.links.push({ uuid, label: String(link.label || uuid) });
        this._renderLinksList(this._getRoot());
        return true;
    }

    /**
     * Render the current links as removable chips.
     * @private
     */
    _renderLinksList(root = this._getRoot()) {
        const list = root?.querySelector('.codex-links-list');
        if (!list) return;
        list.innerHTML = '';
        for (const link of (this.entry.links || [])) {
            const chip = document.createElement('span');
            chip.className = 'codex-link-chip';
            chip.dataset.uuid = link.uuid;
            chip.innerHTML = `<i class="fa-solid fa-link"></i><span class="codex-link-chip-label"></span><i class="fa-solid fa-times codex-link-chip-remove" title="Remove link"></i>`;
            chip.querySelector('.codex-link-chip-label').textContent = link.label || link.uuid;
            chip.title = link.uuid;
            list.appendChild(chip);
        }
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
        // The save action invokes this programmatically, which bypasses the browser's
        // required-field enforcement — run it explicitly so the user gets the native
        // "please fill out this field" cues instead of a document validation error
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;
        const entry = this._collectFormEntry(form);
        await this._updateObject(event, entry);
    }

    _collectFormEntry(form) {
        const formData = new FormData(form);
        const entry = {};
        const locationParts = [];
        for (const [key, value] of formData.entries()) {
            const segmentMatch = key.match(/^location-(\d+)$/);
            if (segmentMatch) {
                locationParts[Number(segmentMatch[1])] = String(value).trim();
                continue;
            }
            if (key === 'img' && !value) continue;
            if (key === 'plotHook' && !value) continue;
            entry[key] = value;
        }
        // Compose the hierarchical location path from the segment inputs,
        // dropping empty levels (trailing OR interior)
        entry.location = locationParts.filter(Boolean).join(' > ');

        // Read the ProseMirror element directly — its .value serializes the LIVE
        // editor state, which FormData is not guaranteed to capture
        const expandedEditor = form.querySelector('prose-mirror[name="expandedDetails"]');
        if (expandedEditor) entry.expandedDetails = expandedEditor.value ?? '';
        return entry;
    }

    async _updateObject(_event, formData) {
        const entry = foundry.utils.expandObject(formData);
        entry.pageUuid = this.pageUuid || entry.pageUuid || null;
        entry.name = String(entry.name || '').trim();
        entry.category = this._normalizeCategoryValue(entry.category);
        entry.categoryIcon = String(entry.categoryIcon || '').trim();
        entry.tags = this._normalizeTags(entry.tags);

        // Hard guard on mandatory fields — never hand invalid data to the document layer
        if (!entry.name) {
            ui.notifications.warn('A name is required to save a codex entry.');
            return false;
        }
        if (!entry.category) {
            ui.notifications.warn('A category is required to save a codex entry.');
            return false;
        }

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
                links: this._normalizeLinks(this.entry.links),
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

        // Links: remove chips (delegated) and accept drops directly on the links zone
        const linksZone = root.querySelector('.codex-links-dropzone');
        if (linksZone) {
            const removeHandler = (event) => {
                const removeBtn = event.target.closest('.codex-link-chip-remove');
                if (!removeBtn) return;
                event.preventDefault();
                event.stopPropagation();
                const uuid = removeBtn.closest('.codex-link-chip')?.dataset?.uuid;
                if (!uuid) return;
                this.entry.links = (this.entry.links || []).filter(l => l.uuid !== uuid);
                this._renderLinksList(root);
            };
            const overHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'link';
                linksZone.classList.add('drag-active');
            };
            const leaveHandler = (event) => {
                event.preventDefault();
                linksZone.classList.remove('drag-active');
            };
            const dropHandler = async (event) => {
                event.preventDefault();
                // Don't let the auto-populate drop zone logic also fire
                event.stopPropagation();
                linksZone.classList.remove('drag-active');
                try {
                    const TextEditor = getTextEditor();
                    const data = TextEditor?.getDragEventData?.(event)
                        || JSON.parse(event.dataTransfer.getData('text/plain'));
                    const doc = data?.uuid ? await fromUuid(data.uuid) : null;
                    if (!doc) return;
                    if (this._addLink({ uuid: doc.uuid, label: doc.name || doc.uuid })) {
                        ui.notifications.info(`Linked: ${doc.name}`);
                    }
                } catch (error) {
                    console.error('Coffee Pub Squire | Error linking dropped document:', error);
                }
            };
            linksZone.addEventListener('click', removeHandler);
            linksZone.addEventListener('dragover', overHandler);
            linksZone.addEventListener('dragleave', leaveHandler);
            linksZone.addEventListener('drop', dropHandler);
            this._eventHandlers.push(
                { element: linksZone, event: 'click', handler: removeHandler },
                { element: linksZone, event: 'dragover', handler: overHandler },
                { element: linksZone, event: 'dragleave', handler: leaveHandler },
                { element: linksZone, event: 'drop', handler: dropHandler }
            );
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
        // Both browse triggers: the empty-state button and the on-image overlay
        root.querySelectorAll('.codex-browse-image').forEach(browseImageButton => {
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
        });

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
        this._addLink(this._buildDocumentLink(actor));
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
        this._addLink(this._buildDocumentLink(item));
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
        this._addLink(this._buildDocumentLink(page || journal || dropped));
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

        // Location path segments
        const locationParts = String(this.entry.location || '').split('>').map(p => p.trim());
        form.querySelectorAll('input[name^="location-"]').forEach(input => {
            const depth = Number(input.name.split('-')[1]);
            input.value = locationParts[depth] || '';
        });

        this._renderLinksList();

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

        const imgSection = form.querySelector('.codex-image-section');
        const imgPlaceholder = form.querySelector('.codex-image-placeholder');
        const imgPreview = form.querySelector('.codex-image-preview');
        const removeImageButton = form.querySelector('.codex-remove-image');
        if (imgSection) {
            imgSection.style.display = '';
            imgSection.classList.toggle('has-image', !!this.entry.img);
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
