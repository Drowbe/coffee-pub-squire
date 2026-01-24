import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import {
    PERMISSION_LEVELS,
    userCanAccessPage,
    showJournalPicker,
    showPagePicker,
    renderJournalContent,
    getJournalPageContent,
    enrichJournalContent
} from './utility-journal.js';
import { NotesParser } from './utility-notes-parser.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

function logNotePins(message, data = null) {
    const blacksmith = getBlacksmith();
    const detail = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : '';
    blacksmith?.utils?.postConsoleAndNotification(
        MODULE.NAME,
        `NOTE | PINS ${message}`,
        detail,
        true,
        false
    );
}

function getPinsApi() {
    const blacksmith = getBlacksmith();
    return blacksmith?.pins || null;
}

function isPinsApiAvailable(pins) {
    if (!pins) return false;
    if (typeof pins.isAvailable === 'function') {
        return pins.isAvailable();
    }
    return true;
}

const NOTE_PIN_ICON = 'fa-note-sticky';
const NOTE_PIN_COLOR = 0xFFFF00;
const NOTE_PIN_CURSOR_CLASS = 'squire-notes-pin-placement';
const NOTE_PIN_CANVAS_CURSOR_CLASS = 'squire-notes-pin-placement-canvas';
const NOTE_PIN_SIZE = { w: 60, h: 60 };

let notePinClickDisposer = null;
let notePinHandlerController = null;

function toHexColor(color) {
    if (typeof color === 'number') {
        return `#${color.toString(16).padStart(6, '0')}`;
    }
    return color;
}

function extractFirstImageSrc(content) {
    if (!content) return null;
    const match = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return match?.[1] || null;
}

function normalizeNoteIconFlag(iconFlag) {
    if (!iconFlag) return null;
    if (typeof iconFlag === 'string') {
        const type = iconFlag.includes('fa-') ? 'fa' : 'img';
        return { type, value: iconFlag };
    }
    if (typeof iconFlag === 'object') {
        const type = iconFlag.type || iconFlag.kind;
        const value = iconFlag.value || iconFlag.icon || iconFlag.src;
        if (type && value) {
            return { type, value };
        }
    }
    return null;
}

function buildNoteIconHtml(iconData, imgClass = '') {
    if (!iconData) return `<i class="fa-solid ${NOTE_PIN_ICON}"></i>`;
    if (iconData.type === 'fa') {
        return `<i class="fa-solid ${iconData.value}"></i>`;
    }
    const classAttr = imgClass ? ` class="${imgClass}"` : '';
    return `<img src="${iconData.value}"${classAttr}>`;
}

function resolveNoteIconHtmlFromPage(page, imgClass = '') {
    const iconFlag = normalizeNoteIconFlag(page?.getFlag(MODULE.ID, 'noteIcon'));
    if (iconFlag) {
        return buildNoteIconHtml(iconFlag, imgClass);
    }
    const content = page?.text?.content || '';
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        return buildNoteIconHtml({ type: 'img', value: imageSrc }, imgClass);
    }
    return buildNoteIconHtml(null, imgClass);
}

function resolveNoteIconHtmlFromContent(content, imgClass = '') {
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        return buildNoteIconHtml({ type: 'img', value: imageSrc }, imgClass);
    }
    return buildNoteIconHtml(null, imgClass);
}

function createPinPreviewElement(iconHtml) {
    const preview = document.createElement('div');
    preview.className = 'notes-pin-preview';
    preview.style.setProperty('--pin-size', `${NOTE_PIN_SIZE.w}px`);
    preview.style.setProperty('--pin-fill', getNotePinStyle().fill);
    preview.style.setProperty('--pin-stroke', getNotePinStyle().stroke);
    preview.innerHTML = `
        <div class="notes-pin-preview-inner">
            ${iconHtml}
        </div>
    `;
    return preview;
}

class NoteIconPicker extends Application {
    constructor(noteIcon, { onSelect } = {}) {
        super();
        this.onSelect = onSelect;
        this.selected = noteIcon;
        this.icons = [
            { label: 'Sticky Note', value: 'fa-note-sticky' },
            { label: 'Map Pin', value: 'fa-map-pin' },
            { label: 'Location Dot', value: 'fa-location-dot' },
            { label: 'Book', value: 'fa-book' },
            { label: 'Scroll', value: 'fa-scroll' },
            { label: 'Feather', value: 'fa-feather' },
            { label: 'Star', value: 'fa-star' },
            { label: 'Gem', value: 'fa-gem' },
            { label: 'Flag', value: 'fa-flag' },
            { label: 'Compass', value: 'fa-compass' },
            { label: 'Skull', value: 'fa-skull' },
            { label: 'Question', value: 'fa-circle-question' }
        ];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'notes-icon-picker',
            title: ' ',
            template: TEMPLATES.NOTES_ICON_PICKER,
            width: 520,
            height: 560,
            resizable: false,
            classes: ['squire-window', 'notes-icon-picker-window']
        });
    }

    getData() {
        const selected = this.selected || null;
        const previewHtml = buildNoteIconHtml(selected, 'notes-form-header-image');
        const imageValue = selected?.type === 'img' ? selected.value : '';
        const icons = this.icons.map(icon => ({
            ...icon,
            isSelected: selected?.type === 'fa' && selected.value === icon.value
        }));
        return {
            previewHtml,
            imageValue,
            icons
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const nativeHtml = html?.[0] || html;

        const preview = nativeHtml.querySelector('.notes-form-header-icon');
        const imageInput = nativeHtml.querySelector('.notes-icon-image-input');
        const imageRow = nativeHtml.querySelector('.notes-icon-image-row');

        const updatePreview = () => {
            if (!preview) return;
            preview.innerHTML = buildNoteIconHtml(this.selected, 'notes-form-header-image');
            if (imageRow) {
                imageRow.classList.toggle('selected', this.selected?.type === 'img');
            }
        };

        nativeHtml.querySelectorAll('.notes-icon-option').forEach(button => {
            button.addEventListener('click', () => {
                const value = button.dataset.value;
                this.selected = { type: 'fa', value };
                nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                if (imageInput) {
                    imageInput.value = '';
                }
                updatePreview();
            });
        });

        imageInput?.addEventListener('input', () => {
            const value = imageInput.value.trim();
            if (value) {
                this.selected = { type: 'img', value };
                nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                updatePreview();
            }
        });

        nativeHtml.querySelector('.notes-icon-browse')?.addEventListener('click', async () => {
            const picker = new FilePicker({
                type: 'image',
                callback: (path) => {
                    if (!imageInput) return;
                    imageInput.value = path;
                    this.selected = { type: 'img', value: path };
                    nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                    updatePreview();
                }
            });
            picker.browse();
        });

        nativeHtml.querySelector('button.cancel')?.addEventListener('click', () => this.close());

        nativeHtml.querySelector('.notes-icon-use')?.addEventListener('click', () => {
            const finalSelection = this.selected || { type: 'fa', value: NOTE_PIN_ICON };
            if (this.onSelect) {
                this.onSelect(finalSelection);
            }
            this.close();
        });

        updatePreview();
    }
}

function getNotePinStyle() {
    return {
        fill: '#000000',
        stroke: '#ffffff',
        strokeWidth: 2,
        alpha: 0.9
    };
}

function getNotePinOwnership() {
    return {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users: {
            [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        }
    };
}

function generateNotePinId() {
    return globalThis.crypto?.randomUUID?.() || foundry.utils.randomID();
}

function registerNotePinHandlers() {
    if (notePinClickDisposer) return;
    const pins = getPinsApi();
    if (!pins?.on || !isPinsApiAvailable(pins)) {
        logNotePins('Pins handler registration skipped (API not available).');
        return;
    }

    notePinHandlerController = new AbortController();
    notePinClickDisposer = pins.on('click', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const pinId = evt?.pin?.id;
        if (pinId && pins.panTo) {
            await pins.panTo(pinId, { sceneId: evt?.sceneId });
        }
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        panelManager?.notesPanel?.showNote(noteUuid);
        logNotePins('Pin click routed to note.', { noteUuid, pinId });
    }, { moduleId: MODULE.ID, signal: notePinHandlerController.signal });

    pins.on('doubleClick', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await foundry.utils.fromUuid(noteUuid);
        if (!page) return;

        const tags = page.getFlag(MODULE.ID, 'tags') || [];
        const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
        const authorId = page.getFlag(MODULE.ID, 'authorId');
        const sceneId = page.getFlag(MODULE.ID, 'sceneId');
        const x = page.getFlag(MODULE.ID, 'x');
        const y = page.getFlag(MODULE.ID, 'y');
        const timestamp = page.getFlag(MODULE.ID, 'timestamp') || null;
        const authorName = authorId
            ? (game.users.get(authorId)?.name || game.users.find(u => u.id === authorId)?.name || authorId)
            : 'Unknown';

        const noteData = {
            pageId: page.id,
            pageUuid: page.uuid,
            title: page.name || 'Untitled Note',
            content: page.text?.content || '',
            noteIcon: page.getFlag(MODULE.ID, 'noteIcon') || null,
            iconHtml: resolveNoteIconHtmlFromPage(page, 'notes-form-header-image'),
            authorName: authorName,
            timestamp: timestamp,
            tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []),
            visibility: visibility,
            sceneId: sceneId,
            x: x,
            y: y,
            authorId: authorId
        };

        const form = new NotesForm(noteData);
        form.render(true);
        logNotePins('Pin double-click opened notes form.', { noteUuid });
    }, { moduleId: MODULE.ID, signal: notePinHandlerController.signal });
    logNotePins('Pins handler registered.');
}

async function createNotePinForPage(page, sceneId, x, y) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        throw new Error('Pins API not available.');
    }

    if (pins.create) {
        if (typeof pins.whenReady === 'function') {
            await pins.whenReady();
        }

        logNotePins('Creating pin via pins.create.', { noteUuid: page.uuid, sceneId, x, y });
        const pinPayload = {
            id: generateNotePinId(),
            x,
            y,
            moduleId: MODULE.ID,
            image: resolveNoteIconHtmlFromPage(page),
            size: NOTE_PIN_SIZE,
            style: getNotePinStyle(),
            ownership: getNotePinOwnership(),
            config: {
                noteUuid: page.uuid
            }
        };

        logNotePins('Pin payload', pinPayload);
        const pinData = await pins.create(pinPayload, { sceneId });

        if (typeof pins.reload === 'function') {
            await pins.reload({ sceneId });
        }

        return pinData?.id || null;
    }

    throw new Error('Pins API does not support create.');
}

async function deleteNotePinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const pinId = page.getFlag(MODULE.ID, 'pinId');
    if (pins.delete) {
        logNotePins('Deleting pin via pins.delete.', { noteUuid: page.uuid, pinId });
        if (pinId) {
            await pins.delete(pinId, { sceneId: page.getFlag(MODULE.ID, 'sceneId') });
        } else if (pins.list) {
            const sceneId = page.getFlag(MODULE.ID, 'sceneId') || canvas?.scene?.id;
            const matches = pins.list({ moduleId: MODULE.ID, sceneId })
                .filter(pin => pin?.config?.noteUuid === page.uuid);
            logNotePins('Deleting pins by note UUID lookup.', { noteUuid: page.uuid, count: matches.length });
            for (const pin of matches) {
                await pins.delete(pin.id, { sceneId });
            }
        }
        return;
    }

    return;
}

async function updateNotePinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    if (!pins.update) return;

    const pinId = page.getFlag(MODULE.ID, 'pinId');
    const sceneId = page.getFlag(MODULE.ID, 'sceneId');
    if (!pinId || !sceneId) return;

    const patch = {
        image: resolveNoteIconHtmlFromPage(page),
        size: NOTE_PIN_SIZE,
        style: getNotePinStyle(),
        config: { noteUuid: page.uuid }
    };

    logNotePins('Updating pin via pins.update.', { noteUuid: page.uuid, pinId });
    await pins.update(pinId, patch, { sceneId });
}

export class NotesPanel {
    constructor() {
        this.element = null;
        this.notes = [];
        this.filters = {
            search: '',
            tags: [],
            scene: 'all',
            visibility: 'all' // all, private, party
        };
        this.filtersOpen = false;
        this.allTags = new Set();
        this.scenes = new Set();
        this._pinPlacement = null;
        registerNotePinHandlers();
        // Hooks are now managed centrally by HookManager
    }





    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this._clearNotePinPlacement();
        this.element = null;
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);
        const notesContainer = this.element?.querySelector('[data-panel="panel-notes"]');
        if (!notesContainer) return;

        // Refresh data (load notes)
        await this._refreshData();

        // Get the selected journal ID
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId !== 'none' ? game.journal.get(journalId) : null;
        const canViewJournal = journal ? (game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER)) : false;

        // If journal ID exists but journal doesn't, reset to 'none'
        if (journalId !== 'none' && !journal && game.user.isGM) {
            await game.settings.set(MODULE.ID, 'notesJournal', 'none');
            ui.notifications.warn("The previously selected notes journal no longer exists. Please select a new one.");
        }

        // Render template with notes data
        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            notes: this.notes.map(note => ({
                ...note,
                tags: note.tags || [], // Ensure tags is always an array
                tagsCsv: (note.tags || []).map(tag => String(tag).toUpperCase()).join(',')
            })),
            allTags: Array.from(this.allTags).sort(),
            scenes: Array.from(this.scenes).sort(),
            filters: this.filters,
            filtersOpen: this.filtersOpen,
            isGM: game.user.isGM,
            position: "left"
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        notesContainer.innerHTML = html;

        this.activateListeners(notesContainer);
    }

    /**
     * Refresh data from the journal - load all notes using NotesParser
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.notes = [];
        this.allTags.clear();
        this.scenes.clear();

        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (!journal) return;

        // Check if user can view this journal
        const canViewJournal = game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER);
        if (!canViewJournal) return;

        // Process all pages in the journal
        for (const page of journal.pages.contents) {
            try {
                // Check if this is a note (has noteType flag)
                const noteType = page.getFlag(MODULE.ID, 'noteType');
                if (noteType !== 'sticky') {
                    // Not a note, skip it
                    continue;
                }

                // Check visibility - filter private notes
                const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                if (visibility === 'private' && !game.user.isGM) {
                    // Private notes: only show to author or GM
                    const authorId = page.getFlag(MODULE.ID, 'authorId');
                    if (authorId !== game.user.id) {
                        continue; // Skip this note
                    }
                }

                // Get page content
                const content = await getJournalPageContent(page);
                
                // Enrich content
                const enriched = await enrichJournalContent(content, {
                    secrets: game.user.isGM,
                    documents: true,
                    links: true,
                    rolls: true
                });

                // Parse the note
                const note = await NotesParser.parseSinglePage(page, enriched);
                
                if (note) {
                    // Ensure authorName is always set (fallback to user ID if name lookup failed)
                    if (!note.authorName && note.authorId) {
                        note.authorName = note.authorId;
                    }

                    if (!Array.isArray(note.editorIds)) {
                        note.editorIds = [];
                    }

                    const editorIds = [...new Set(note.editorIds.length ? note.editorIds : (note.authorId ? [note.authorId] : []))];
                    note.editorAvatars = editorIds.map(id => {
                        const user = game.users.get(id) || game.users.find(u => u.id === id);
                        return {
                            id,
                            name: user?.name || id || 'Unknown',
                            img: user?.avatar || user?.img || 'icons/svg/mystery-man.svg'
                        };
                    });
                    
                    // Debug: Log visibility to verify it's being read correctly
                    const savedVisibility = page.getFlag(MODULE.ID, 'visibility');
                    const allFlags = page.getFlag(MODULE.ID) || {};
                    console.log('NotesPanel._refreshData: Note parsed:', {
                        name: note.name,
                        parsedVisibility: note.visibility,
                        savedVisibilityFlag: savedVisibility,
                        allFlags: allFlags,
                        tags: note.tags,
                        authorName: note.authorName,
                        authorId: note.authorId
                    });
                    
                    // Ensure tags is always an array (even if empty)
                    if (!Array.isArray(note.tags)) {
                        note.tags = [];
                    }
                    note.tags = note.tags.map(tag => String(tag).toUpperCase());
                    note.iconHtml = resolveNoteIconHtmlFromPage(page, 'note-icon-image');
                    this.notes.push(note);
                    
                    // Collect tags
                    if (note.tags && Array.isArray(note.tags)) {
                        note.tags.forEach(tag => this.allTags.add(tag));
                    }
                    
                    // Collect scenes
                    if (note.sceneId && note.sceneName) {
                        this.scenes.add(note.sceneName);
                    }
                }
            } catch (error) {
                console.error(`Error processing note page ${page.id}:`, error);
                // Continue processing other notes
            }
        }

        // Sort notes by timestamp (newest first)
        this.notes.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }

    activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Set journal button (GM only)
        nativeHtml.querySelectorAll('.set-journal-button, .set-journal-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                if (game.user.isGM) {
                    showJournalPicker({
                        title: 'Select Journal for Notes',
                        getCurrentId: () => game.settings.get(MODULE.ID, 'notesJournal'),
                        onSelect: async (journalId) => {
                            await game.settings.set(MODULE.ID, 'notesJournal', journalId);
                            if (journalId && journalId !== 'none') {
                                const journal = game.journal.get(journalId);
                                if (journal) {
                                    const defaultPerm = journal.ownership.default;
                                    if (defaultPerm < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                                        ui.notifications.warn(`Warning: Notes journal "${journal.name}" should have "All Players = Observer" ownership to allow players to create notes.`);
                                    } else {
                                        ui.notifications.info(`Notes journal "${journal.name}" selected.`);
                                    }
                                }
                            } else {
                                ui.notifications.info('Notes journal selection cleared.');
                            }
                        },
                        reRender: () => this.render(this.element),
                        infoHtml: '<p style="margin-bottom: 5px; color: #ddd;"><i class="fa-solid fa-info-circle" style="color: #88f;"></i> This journal will be used for all player notes. Players can create notes if they have Observer access or better.</p><p style="color: #ddd;">Make sure the journal has "All Players = Observer" ownership to allow players to create notes.</p>',
                        showRefreshButton: true
                    });
                }
            });
        });

        // New Note button - opens NotesForm window
        nativeHtml.querySelectorAll('.new-note-button, .new-note-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const form = new NotesForm();
                form.render(true);
            });
        });

        // Refresh button
        const refreshButton = nativeHtml.querySelector('.refresh-notes-button');
        if (refreshButton) {
            const newButton = refreshButton.cloneNode(true);
            refreshButton.parentNode?.replaceChild(newButton, refreshButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._refreshData();
                this.render(this.element);
            });
        }

        // Search filter
        const searchInput = nativeHtml.querySelector('.notes-search-input');
        if (searchInput) {
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            newInput.addEventListener('input', (event) => {
                this.filters.search = event.target.value;
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        }
        const clearSearchButton = nativeHtml.querySelector('.clear-notes-search');
        if (clearSearchButton) {
            const newClear = clearSearchButton.cloneNode(true);
            clearSearchButton.parentNode?.replaceChild(newClear, clearSearchButton);
            newClear.addEventListener('click', (event) => {
                event.preventDefault();
                this.filters.search = '';
                this.filters.tags = [];
                this.filters.scene = 'all';
                this.filters.visibility = 'all';
                const input = nativeHtml.querySelector('.notes-search-input');
                if (input) {
                    input.value = '';
                }
                this.render(this.element);
            });
        }

            // Tag filter
            nativeHtml.querySelectorAll('.tag-item').forEach(tag => {
                const newTag = tag.cloneNode(true);
                tag.parentNode?.replaceChild(newTag, tag);
                newTag.addEventListener('click', (event) => {
                    const tagName = event.currentTarget.dataset.tag?.toUpperCase();
                    if (!this.filters.tags) {
                        this.filters.tags = [];
                    }
                    const index = this.filters.tags.indexOf(tagName);
                if (index > -1) {
                    this.filters.tags.splice(index, 1);
                } else {
                    this.filters.tags.push(tagName);
                }
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        });

        // Tag cloud toggle
        const toggleFiltersButton = nativeHtml.querySelector('.toggle-notes-filters-button');
        if (toggleFiltersButton) {
            const newToggle = toggleFiltersButton.cloneNode(true);
            toggleFiltersButton.parentNode?.replaceChild(newToggle, toggleFiltersButton);
            newToggle.addEventListener('click', (event) => {
                event.preventDefault();
                this.filtersOpen = !this.filtersOpen;
                this.render(this.element);
            });
        }

        // Scene filter
        const sceneFilter = nativeHtml.querySelector('.scene-filter-select');
        if (sceneFilter) {
            const newSelect = sceneFilter.cloneNode(true);
            sceneFilter.parentNode?.replaceChild(newSelect, sceneFilter);
            newSelect.addEventListener('change', (event) => {
                this.filters.scene = event.target.value;
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        }

        nativeHtml.querySelectorAll('.notes-visibility-button').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', (event) => {
                event.preventDefault();
                const visibility = event.currentTarget.dataset.visibility || 'all';
                this.filters.visibility = visibility;
                this._applyFilters(nativeHtml);
                nativeHtml.querySelectorAll('.notes-visibility-button').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.visibility === visibility);
                });
                this._updateClearSearchState(nativeHtml);
            });
        });

        // Note actions
        nativeHtml.querySelectorAll('.note-edit').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                try {
                    const page = await foundry.utils.fromUuid(uuid);
                    if (!page) {
                        ui.notifications.error('Note not found.');
                        return;
                    }
                    
                    // Load note data from the page
                    const tags = page.getFlag(MODULE.ID, 'tags') || [];
                    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                    const authorId = page.getFlag(MODULE.ID, 'authorId');
                    const sceneId = page.getFlag(MODULE.ID, 'sceneId');
                    const x = page.getFlag(MODULE.ID, 'x');
                    const y = page.getFlag(MODULE.ID, 'y');
                    const timestamp = page.getFlag(MODULE.ID, 'timestamp') || null;
                    const authorName = authorId
                        ? (game.users.get(authorId)?.name || game.users.find(u => u.id === authorId)?.name || authorId)
                        : 'Unknown';
                    
                    // Get page content
                    const content = page.text?.content || '';
                    
                    // Create note object for form
                    const noteData = {
                        pageId: page.id,
                        pageUuid: page.uuid,
                        title: page.name || 'Untitled Note',
                        content: content,
                        noteIcon: page.getFlag(MODULE.ID, 'noteIcon') || null,
                        iconHtml: resolveNoteIconHtmlFromPage(page, 'notes-form-header-image'),
                        authorName: authorName,
                        timestamp: timestamp,
                        tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []),
                        visibility: visibility,
                        sceneId: sceneId,
                        x: x,
                        y: y,
                        authorId: authorId
                    };
                    
                    // Open NotesForm with existing note data
                    const form = new NotesForm(noteData);
                    form.render(true);
                } catch (error) {
                    console.error('Error opening note for editing:', error);
                    ui.notifications.error(`Failed to open note: ${error.message}`);
                }
            });
        });

        nativeHtml.querySelectorAll('.note-delete').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                const confirmed = await Dialog.confirm({
                    title: 'Delete Note',
                    content: '<p>Are you sure you want to delete this note?</p>',
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                    if (confirmed) {
                        const page = await foundry.utils.fromUuid(uuid);
                        if (page) {
                            const sceneId = page.getFlag(MODULE.ID, 'sceneId');
                            if (sceneId) {
                                await this._unpinNote(page);
                            }
                            await page.delete();
                            // Refresh the panel using panel manager's element
                            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                            if (panelManager && panelManager.element) {
                                await this._refreshData();
                                this.render(panelManager.element);
                            }
                        }
                    }
                });
            });

        nativeHtml.querySelectorAll('.note-pin, .note-unpin').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                const isUnpin = event.currentTarget.classList.contains('note-unpin');
                if (!uuid) return;

                const page = await foundry.utils.fromUuid(uuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    ui.notifications.warn('You do not have permission to pin this note.');
                    return;
                }

                if (isUnpin) {
                    await this._unpinNote(page);
                    return;
                }

                logNotePins('Pin placement requested.', { noteUuid: page.uuid });
                await this._beginNotePinPlacement(page);
            });
        });

        nativeHtml.querySelectorAll('.note-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagName = event.currentTarget.dataset.tag?.toUpperCase();
                if (!tagName) return;
                this.filters.tags = [tagName];
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        });

        // Apply initial filters
        this._applyFilters(nativeHtml);
        this._updateClearSearchState(nativeHtml);
    }

    async _beginNotePinPlacement(page) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place a note pin.');
            logNotePins('Pin placement aborted: canvas not ready.');
            return;
        }

        const existingSceneId = page.getFlag(MODULE.ID, 'sceneId');
        if (existingSceneId) {
            ui.notifications.warn('This note is already pinned. Unpin it first to place a new pin.');
            logNotePins('Pin placement aborted: note already pinned.', { noteUuid: page.uuid });
            return;
        }

        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            ui.notifications.warn('Blacksmith Pins API not available. Install or enable Coffee Pub Blacksmith.');
            logNotePins('Pin placement aborted: pins API unavailable.');
            return;
        }

        if (this._pinPlacement) {
            this._clearNotePinPlacement();
        }

        ui.notifications.info('Click on the map to place the note pin. Press Esc to cancel.');
        document.body.classList.add(NOTE_PIN_CURSOR_CLASS);
        document.documentElement.classList.add(NOTE_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';

        const view = canvas.app.view;
        view.classList.add(NOTE_PIN_CANVAS_CURSOR_CLASS);
        const previewEl = createPinPreviewElement(resolveNoteIconHtmlFromPage(page, 'notes-pin-preview-image'));
        document.body.appendChild(previewEl);
        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };
        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();

            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.squirePins?.toLocal({ x: globalX, y: globalY }) ||
                canvas.stage?.toLocal({ x: globalX, y: globalY });

            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                logNotePins('Pin placement failed: local position unavailable.');
                this._clearNotePinPlacement();
                return;
            }

            logNotePins('Canvas click captured for pin placement.', { x: localPos.x, y: localPos.y });
            await this._createNotePin(page, canvas.scene.id, localPos.x, localPos.y);
            this._clearNotePinPlacement();
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearNotePinPlacement();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearNotePinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._pinPlacement = {
            pageUuid: page.uuid,
            view,
            onPointerDown,
            onContextMenu,
            onKeyDown,
            onPointerMove,
            previewEl
        };
        logNotePins('Pin placement armed.', { noteUuid: page.uuid });
    }

    _clearNotePinPlacement() {
        if (!this._pinPlacement) return;
        const { view, onPointerDown, onContextMenu, onKeyDown, onPointerMove, previewEl } = this._pinPlacement;
        view?.removeEventListener('pointerdown', onPointerDown, true);
        view?.removeEventListener('contextmenu', onContextMenu, true);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointermove', onPointerMove);
        document.body.classList.remove(NOTE_PIN_CURSOR_CLASS);
        document.documentElement.classList.remove(NOTE_PIN_CURSOR_CLASS);
        document.body.style.cursor = '';
        view?.classList.remove(NOTE_PIN_CANVAS_CURSOR_CLASS);
        previewEl?.remove();
        this._pinPlacement = null;
        logNotePins('Pin placement cleared.');
    }

    async _createNotePin(page, sceneId, x, y) {
        try {
            logNotePins('Creating note pin.', { noteUuid: page.uuid, sceneId, x, y });
            const pinId = await createNotePinForPage(page, sceneId, x, y);
            if (pinId) {
                await page.setFlag(MODULE.ID, 'pinId', pinId);
            }
            await page.setFlag(MODULE.ID, 'sceneId', sceneId);
            await page.setFlag(MODULE.ID, 'x', x);
            await page.setFlag(MODULE.ID, 'y', y);
            logNotePins('Note pin created and flags updated.', { noteUuid: page.uuid, pinId });
        } catch (error) {
            const message = String(error?.message || error || '');
            if (message.toLowerCase().includes('permission denied')) {
                ui.notifications.error('Blacksmith pins are GM-only unless "Allow player writes" is enabled in Blacksmith settings.');
            } else {
                ui.notifications.error(`Failed to create pin: ${message}`);
            }
            logNotePins('Failed to create note pin.', { noteUuid: page.uuid, error: message });
            return;
        }

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    async _unpinNote(page) {
        try {
            logNotePins('Unpinning note.', { noteUuid: page.uuid });
            await deleteNotePinForPage(page);
        } catch (error) {
            logNotePins('Failed to delete note pin.', { noteUuid: page.uuid, error });
        }

        await page.setFlag(MODULE.ID, 'sceneId', null);
        await page.setFlag(MODULE.ID, 'x', null);
        await page.setFlag(MODULE.ID, 'y', null);
        await page.setFlag(MODULE.ID, 'pinId', null);
        logNotePins('Note pin flags cleared.', { noteUuid: page.uuid });

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    async showNote(noteUuid) {
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.setViewMode) {
            await panelManager.setViewMode('notes');
        }
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
            panelManager.notesPanel.scrollToNote?.(noteUuid);
        }
    }

    scrollToNote(noteUuid) {
        const notesContainer = this.element?.querySelector('[data-panel="panel-notes"]');
        if (!notesContainer) return;
        const card = notesContainer.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`);
        if (!card) return;
        card.classList.add('note-card-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => {
            card.classList.remove('note-card-highlight');
        }, 2000);
    }

    /**
     * Apply filters to note cards (DOM-based filtering)
     * @private
     */
    _applyFilters(html) {
        const search = (this.filters.search || '').trim().toLowerCase();
        const selectedTags = (this.filters.tags || []).map(tag => tag.toUpperCase());
        const selectedScene = this.filters.scene || 'all';
        const selectedVisibility = this.filters.visibility || 'all';

        html.querySelectorAll('.note-card').forEach(card => {
            let visible = true;

            // Search filter
            if (search) {
                const text = card.textContent.toLowerCase();
                if (!text.includes(search)) {
                    visible = false;
                }
            }

            // Tag filter
            if (selectedTags.length > 0) {
                const cardTagsStr = card.dataset.tags || '';
                const cardTags = cardTagsStr ? cardTagsStr.split(',').map(t => t.trim().toUpperCase()) : [];
                const hasTag = selectedTags.some(tag => cardTags.includes(tag));
                if (!hasTag) {
                    visible = false;
                }
            }

            // Scene filter
            if (selectedScene !== 'all') {
                const cardScene = card.dataset.scene || 'none';
                if (cardScene !== selectedScene) {
                    visible = false;
                }
            }

            // Visibility filter
            if (selectedVisibility !== 'all') {
                const cardVisibility = card.dataset.visibility || 'private';
                if (cardVisibility !== selectedVisibility) {
                    visible = false;
                }
            }

            // Show/hide card
            card.style.display = visible ? '' : 'none';
        });

        // Update tag active states
        html.querySelectorAll('.tag-item').forEach(tag => {
            const tagName = tag.dataset.tag?.toUpperCase();
            if (tagName && selectedTags.includes(tagName)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
    }

    _updateClearSearchState(html) {
        const clearButton = html.querySelector('.clear-notes-search');
        if (!clearButton) return;
        const hasSearch = !!(this.filters.search && this.filters.search.trim().length > 0);
        const hasTags = (this.filters.tags || []).length > 0;
        const hasScene = this.filters.scene && this.filters.scene !== 'all';
        const hasVisibility = this.filters.visibility && this.filters.visibility !== 'all';
        const shouldEnable = hasSearch || hasTags || hasScene || hasVisibility;
        clearButton.classList.toggle('disabled', !shouldEnable);
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
            
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeHtml = html;
            if (html && (html.jquery || typeof html.find === 'function')) {
                nativeHtml = html[0] || html.get?.(0) || html;
            }
            
            // Get the content container
            const contentContainer = nativeHtml.querySelector('.journal-content');
            if (!contentContainer) return;
            
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

/**
 * NotesForm - Lightweight form for quick note capture
 * Uses FormApplication for simplicity (like CodexForm)
 */
export class NotesForm extends FormApplication {
    constructor(note = null, options = {}) {
        super(note, options);
        // If note has pageId/pageUuid, it's an existing note being edited
        this.isEditing = !!(note?.pageId || note?.pageUuid);
        this.pageId = note?.pageId || null;
        this.pageUuid = note?.pageUuid || null;
        this.note = note || this._getDefaultNote();
        this.dragActive = false;
        this._eventHandlers = [];
        
        // If options contain canvas location, pre-fill it
        if (options.sceneId) {
            this.note.sceneId = options.sceneId;
            this.note.x = options.x || null;
            this.note.y = options.y || null;
        }
    }

    static get defaultOptions() {
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'notesWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = saved.width ?? 600;
        const height = saved.height ?? 560;
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);

        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'notes-quick-form',
            classes: ['notes-form-window', 'squire-window'],
            title: 'New Note', // Will be updated in getData if editing
            template: 'modules/coffee-pub-squire/templates/notes-form.hbs',
            width,
            height,
            top,
            left,
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false,
            minimizable: true
        });
    }
    
    get title() {
        return this.isEditing ? `Edit Note: ${this.note.title || 'Untitled'}` : 'New Note';
    }

    getData() {
        // Update window title
        if (this.isEditing) {
            this.options.title = `Edit Note: ${this.note.title || 'Untitled'}`;
        } else {
            this.options.title = 'New Note';
        }

        const tagsText = Array.isArray(this.note.tags)
            ? this.note.tags.join(', ')
            : (typeof this.note.tags === 'string' ? this.note.tags : '');
        const iconHtml = this.note.iconHtml ||
            (this.note.noteIcon ? buildNoteIconHtml(normalizeNoteIconFlag(this.note.noteIcon), 'notes-form-header-image') : null) ||
            resolveNoteIconHtmlFromContent(this.note.content, 'notes-form-header-image');

        return {
            note: {
                ...this.note,
                tagsText,
                iconHtml
            },
            isGM: game.user.isGM,
            isEditing: this.isEditing,
            sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name : null
        };
    }

    _getDefaultNote() {
        return {
            title: '',
            content: '',
            authorName: game.user?.name || 'Unknown',
            timestamp: null,
            tags: [],
            visibility: 'party',
            sceneId: null,
            x: null,
            y: null,
            noteIcon: null
        };
    }

    _buildNoteOwnership(visibility, authorId) {
        const ownership = {
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
        };
        if (visibility === 'party') {
            game.users.forEach(user => {
                if (!user.isGM) {
                    ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                }
            });
            if (authorId && !ownership[authorId]) {
                ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        } else if (authorId) {
            ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
        return ownership;
    }

    async _syncNoteOwnership(page, visibility, authorId) {
        if (!page) return;
        if (game.user.isGM) {
            const ownership = this._buildNoteOwnership(visibility, authorId);
            await page.update({ ownership });
            return;
        }

        const blacksmith = getBlacksmith();
        if (blacksmith?.sockets?.emit) {
            await blacksmith.sockets.emit('squire:updateNoteOwnership', {
                pageUuid: page.uuid,
                visibility,
                authorId
            });
        } else {
            ui.notifications.warn('Socket manager is not ready. Ownership sync will occur when a GM saves.');
        }
    }

    setPosition(options={}) {
        const minWidth = 420;
        const minHeight = 420;
        if (options.width && options.width < minWidth) options.width = minWidth;
        if (options.height && options.height < minHeight) options.height = minHeight;

        if (options.top !== undefined || options.left !== undefined) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const windowWidth = options.width || this.position.width || 600;
            const windowHeight = options.height || this.position.height || 560;

            if (options.left !== undefined) {
                options.left = Math.max(0, Math.min(options.left, viewportWidth - windowWidth));
            }
            if (options.top !== undefined) {
                options.top = Math.max(0, Math.min(options.top, viewportHeight - windowHeight));
            }
        }

        const pos = super.setPosition(options);
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'notesWindowPosition', { top, left, width, height });
        }
        return pos;
    }

    async _updateObject(event, formData) {
        // Get selected journal from settings
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No notes journal selected. Please select a journal in module settings.');
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected notes journal not found.');
            return;
        }

        // Convert tags to array
        let tags = [];
        if (formData.tags) {
            tags = formData.tags.split(',')
                .map(t => t.trim())
                .filter(t => t)
                .map(t => t.toUpperCase());
        }

        // Ensure visibility is set - check form directly if not in formData
        let visibility = formData.visibility;
        if (!visibility || (visibility !== 'party' && visibility !== 'private')) {
            // Try to get it from the form element directly
            const form = getNativeElement(this.element)?.querySelector('form');
            if (form) {
                const visibilityToggle = form.querySelector('#notes-visibility-private');
                if (visibilityToggle) {
                    visibility = visibilityToggle.checked ? 'private' : 'party';
                    console.log('NotesForm._updateObject: Got visibility from toggle:', visibility);
                } else {
                    const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
                    if (visibilityRadio) {
                        visibility = visibilityRadio.value;
                        console.log('NotesForm._updateObject: Got visibility from form radio:', visibility);
                    } else {
                        console.warn('NotesForm._updateObject: No checked visibility input found, defaulting to private');
                        visibility = 'private';
                    }
                }
            } else {
                console.warn('NotesForm._updateObject: No form found, defaulting to private');
                visibility = 'private';
            }
        }
        
        // Final check - ensure it's either 'party' or 'private'
        visibility = visibility === 'party' ? 'party' : 'private';
        console.log('NotesForm._updateObject: Final visibility =', visibility, 'formData.visibility =', formData.visibility, 'formData keys:', Object.keys(formData));

        // Generate HTML content (note body only, no metadata)
        const content = this._generateNoteContent(formData);

        try {
            let page;
            
            if (this.isEditing && this.pageUuid) {
                // Editing existing note - update it
                try {
                    page = await foundry.utils.fromUuid(this.pageUuid);
                    if (!page) {
                        ui.notifications.error('Note not found.');
                        return false;
                    }
                    
                    // Check permissions
                    if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                        ui.notifications.error('You do not have permission to edit this note.');
                        return false;
                    }
                    
                    // Update the page
                    await page.update({
                        name: formData.title || 'Untitled Note',
                        text: { content: content }
                    });
                    
                    // Update flags
                    await page.setFlag(MODULE.ID, 'tags', tags);
                    await page.setFlag(MODULE.ID, 'visibility', visibility);
                    await page.setFlag(MODULE.ID, 'noteIcon', this.note.noteIcon || null);
                    const existingEditors = page.getFlag(MODULE.ID, 'editorIds') || [];
                    const editorIds = Array.isArray(existingEditors) ? [...new Set([...existingEditors, game.user.id])] : [game.user.id];
                    await page.setFlag(MODULE.ID, 'editorIds', editorIds);
                    if (formData.sceneId) {
                        await page.setFlag(MODULE.ID, 'sceneId', formData.sceneId);
                        await page.setFlag(MODULE.ID, 'x', formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null);
                        await page.setFlag(MODULE.ID, 'y', formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null);
                    }

                    console.log('NotesForm: Updated existing note', { pageId: page.id, flags: page.getFlag(MODULE.ID) });
                    const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                    await this._syncNoteOwnership(page, visibility, authorId);
                    await updateNotePinForPage(page);
                } catch (error) {
                    console.error('Error updating note:', error);
                    ui.notifications.error(`Failed to update note: ${error.message}`);
                    return false;
                }
            } else {
                // Creating new note
                // Check if user has permission to create pages in this journal
                // Users need at least OBSERVER permission to create embedded documents
                if (!journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
                    ui.notifications.error('You do not have permission to create notes in this journal. Please contact your GM.');
                    return false;
                }

                // Create journal page with flags
                const pageData = {
                    name: formData.title || 'Untitled Note',
                    type: 'text',
                    text: {
                        content: content
                    },
                    flags: {
                        [MODULE.ID]: {
                            noteType: 'sticky',
                            tags: tags,
                            visibility: visibility,
                            editorIds: [game.user.id],
                            sceneId: formData.sceneId || null,
                            x: formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null,
                            y: formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null,
                            noteIcon: this.note.noteIcon || null,
                            authorId: game.user.id,
                            timestamp: new Date().toISOString()
                        }
                    }
                };

                // Create journal page
                const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                page = newPage;

                // Verify the flag was saved correctly
                const savedVisibility = page.getFlag(MODULE.ID, 'visibility');
                console.log('NotesForm: Page created, saved visibility flag:', savedVisibility, 'expected:', visibility);

                const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                await this._syncNoteOwnership(page, visibility, authorId);
            }

            // If canvas location provided, register pin with Blacksmith (if available)
            // Only for new notes (editing doesn't change pin location)
            if (!this.isEditing && formData.sceneId && formData.x !== null && formData.y !== null) {
                try {
                    const pinId = await createNotePinForPage(
                        page,
                        formData.sceneId,
                        parseFloat(formData.x),
                        parseFloat(formData.y)
                    );
                    if (pinId) {
                        await page.setFlag(MODULE.ID, 'pinId', pinId);
                    }
                } catch (error) {
                    const message = String(error?.message || error || '');
                    if (message.toLowerCase().includes('permission denied')) {
                        ui.notifications.error('Blacksmith pins are GM-only unless "Allow player writes" is enabled in Blacksmith settings.');
                    } else {
                        ui.notifications.warn('Could not create Blacksmith pin for this note.');
                    }
                }
            }

            ui.notifications.info(`Note "${formData.title || 'Untitled Note'}" ${this.isEditing ? 'updated' : 'saved'} successfully.`);
            this.close();
            
            // Refresh notes panel if it exists
            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (panelManager?.notesPanel && panelManager.element) {
                await panelManager.notesPanel._refreshData();
                panelManager.notesPanel.render(panelManager.element);
            }
            
            return true;
        } catch (error) {
            console.error('Error saving note:', error);
            ui.notifications.error(`Failed to save note: ${error.message}`);
            return false;
        }
    }

    _generateNoteContent(formData) {
        return formData.content || '';
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const headerIcon = nativeHtml.querySelector('.notes-form-header-icon');
        if (headerIcon) {
            const handler = () => {
                let currentIcon = normalizeNoteIconFlag(this.note.noteIcon);
                if (!currentIcon) {
                    const imageSrc = extractFirstImageSrc(this.note.content);
                    if (imageSrc) {
                        currentIcon = { type: 'img', value: imageSrc };
                    }
                }
                const picker = new NoteIconPicker(currentIcon, {
                    onSelect: (selection) => {
                        this.note.noteIcon = selection;
                        this.note.iconHtml = buildNoteIconHtml(selection, 'notes-form-header-image');
                        headerIcon.innerHTML = this.note.iconHtml;
                    }
                });
                picker.render(true);
            };
            headerIcon.addEventListener('click', handler);
            this._eventHandlers.push({ element: headerIcon, event: 'click', handler });
        }

        // Handle cancel button
        const cancelButton = nativeHtml.querySelector('button.cancel');
        if (cancelButton) {
            const handler = () => this.close();
            cancelButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: cancelButton, event: 'click', handler });
        }

        // Handle form submission - prevent default FormApplication behavior
        const form = nativeHtml.querySelector('form');
        if (form) {
            const handler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', handler);
            this._eventHandlers.push({ element: form, event: 'submit', handler });
        }

        // Set up tag autocomplete (simple - just show existing tags)
        this._setupTagAutocomplete(nativeHtml);
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target.closest('form') || event.target;
        if (this._saveEditor) {
            await this._saveEditor('content');
        } else if (this._saveEditors) {
            await this._saveEditors();
        } else if (this.editors?.content?.save) {
            await this.editors.content.save();
        }
        const formData = new FormData(form);
        
        // Convert FormData to object
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        const visibilityToggle = form.querySelector('#notes-visibility-private');
        if (visibilityToggle) {
            data.visibility = visibilityToggle.checked ? 'private' : 'party';
        } else {
            const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
            if (visibilityRadio) {
                data.visibility = visibilityRadio.value;
                console.log('NotesForm._handleFormSubmit: Found checked radio:', visibilityRadio.value);
            } else {
                const allRadios = form.querySelectorAll('input[name="visibility"]');
                console.warn('NotesForm._handleFormSubmit: No checked radio found! Available radios:', Array.from(allRadios).map(r => ({ value: r.value, checked: r.checked })));
                data.visibility = 'private';
            }
        }

        // Debug: Log visibility value to help diagnose issues
        console.log('NotesForm._handleFormSubmit: Final visibility value:', data.visibility, 'All formData:', data);

        // Call _updateObject
        await this._updateObject(event, data);
    }

    _setupTagAutocomplete(html) {
        // Simple tag autocomplete - just show existing tags from notes journal
        const tagsInput = html.querySelector('input[name="tags"]');
        if (!tagsInput) return;

        // Get existing tags from notes journal
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') return;

        const journal = game.journal.get(journalId);
        if (!journal) return;

        const existingTags = new Set();
        for (const page of journal.pages.contents) {
            const flags = page.getFlag(MODULE.ID, 'tags');
            if (Array.isArray(flags)) {
                flags.forEach(tag => existingTags.add(tag));
            }
        }

        // Show tag suggestions (simple - could be enhanced later)
        const suggestionsDiv = html.querySelector('.tag-suggestions');
        if (suggestionsDiv && existingTags.size > 0) {
            const tagsArray = Array.from(existingTags).sort().slice(0, 20);
            const tagChips = tagsArray.map(tag => `<span class="common-tag" data-tag="${tag}">${tag}</span>`).join('');
            suggestionsDiv.innerHTML = `<small>Common Tags:</small><div class="common-tags">${tagChips}</div>`;

            suggestionsDiv.querySelectorAll('.common-tag').forEach(tagEl => {
                const handler = () => {
                    const tag = tagEl.dataset.tag;
                    if (!tag) return;
                    const current = (tagsInput.value || '')
                        .split(',')
                        .map(t => t.trim())
                        .filter(t => t);
                    const exists = current.some(t => t.toLowerCase() === tag.toLowerCase());
                    if (!exists) {
                        current.push(tag);
                        tagsInput.value = current.join(', ');
                        tagsInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };
                tagEl.addEventListener('click', handler);
                this._eventHandlers.push({ element: tagEl, event: 'click', handler });
            });
        }
    }
}
