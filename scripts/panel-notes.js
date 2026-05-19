import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import {
    getPinsApi,
    isPinsApiAvailable,
    getSquirePinType,
    isSquirePinCategory,
    listSquirePinsByKind,
    buildNoteOwnership,
    createNotePin,
    deleteNotePin,
    unplaceNotePin,
    updateNotePin,
    syncNoteOwnership
} from './manager-pins.js';
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
import { UsersWindow } from './window-users.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

function openNoteWindow(options = {}) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn('Note window is not ready yet.');
        return null;
    }
    return blacksmith.openWindow(`${MODULE.ID}-note-window`, options);
}

// Re-export pin functions for backward compat with window-note.js.
export { createNotePin as createNotePinForPage };
export { deleteNotePin as deleteNotePinForPage };
export { unplaceNotePin as unplaceNotePinForPage };
export { updateNotePin as updateNotePinForPage };
export { buildNoteOwnership };
export { syncNoteOwnership };

const NOTE_PIN_ICON = 'fa-note-sticky';
const NOTE_PIN_CURSOR_CLASS = 'squire-notes-pin-placement';
const NOTE_PIN_CANVAS_CURSOR_CLASS = 'squire-notes-pin-placement-canvas';
const NOTE_EDIT_LOCK_FLAG = 'editLock';

const NOTE_EDIT_LOCK_TTL_MS = 30 * 60 * 1000;

// Export helper functions for use in window-note.js
export function getDefaultNoteIconFlag() {
    return { type: 'fa', value: `fa-solid ${NOTE_PIN_ICON}` };
}

export function normalizePinSize(size) {
    const w = Number(size?.w);
    const h = Number(size?.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w: Math.round(w), h: Math.round(h) };
}

export function normalizePinShape(shape) {
    if (shape === 'circle' || shape === 'square' || shape === 'none') return shape;
    return null;
}

export function normalizePinStyle(style) {
    if (!style || typeof style !== 'object') return null;
    const fill = typeof style.fill === 'string' ? style.fill : null;
    const stroke = typeof style.stroke === 'string' ? style.stroke : null;
    const strokeWidth = Number(style.strokeWidth);
    const normalized = {};
    if (fill) normalized.fill = fill;
    if (stroke) normalized.stroke = stroke;
    if (Number.isFinite(strokeWidth) && strokeWidth >= 0) {
        normalized.strokeWidth = Math.round(strokeWidth);
    }
    return Object.keys(normalized).length ? normalized : null;
}

function normalizePinText(value) {
    if (typeof value === 'string') return value;
    return '';
}

export function normalizePinTextLayout(layout) {
    if (layout === 'around') return 'arc-below';
    if (
        layout === 'under'
        || layout === 'over'
        || layout === 'above'
        || layout === 'right'
        || layout === 'left'
        || layout === 'arc-above'
        || layout === 'arc-below'
    ) return layout;
    return null;
}

export function normalizePinTextDisplay(display) {
    if (display === 'always' || display === 'hover' || display === 'never' || display === 'gm') return display;
    return null;
}

export function normalizePinTextColor(color) {
    if (typeof color === 'string' && color.trim()) return color.trim();
    return null;
}

export function normalizePinTextSize(size) {
    const parsed = Number(size);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
}

export function normalizePinTextMaxLength(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
}

export function normalizePinTextScaleWithPin(value) {
    if (typeof value === 'boolean') return value;
    return null;
}

export function getNoteEditLockInfo(page) {
    if (!page) return null;
    const rawLock = page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG);
    if (!rawLock || typeof rawLock !== 'object') return null;
    const userId = rawLock.userId;
    const at = Number(rawLock.at);
    if (!userId || !Number.isFinite(at)) return null;
    const ageMs = Date.now() - at;
    if (ageMs > NOTE_EDIT_LOCK_TTL_MS) return null;
    const user = game.users.get(userId) || game.users.find(u => u.id === userId);
    return {
        userId,
        userName: rawLock.userName || user?.name || userId,
        at,
        ageMs
    };
}

export function extractFirstImageSrc(content) {
    if (!content) return null;
    const match = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return match?.[1] || null;
}

export function normalizeNoteIconFlag(iconFlag) {
    if (!iconFlag) return null;
    if (typeof iconFlag === 'string') {
        const trimmed = iconFlag.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('<img')) {
            const imgMatch = trimmed.match(/src=["']([^"']+)["']/i);
            if (imgMatch?.[1]) {
                return { type: 'img', value: imgMatch[1] };
            }
            return null;
        }
        if (trimmed.startsWith('<i') && trimmed.includes('fa-')) {
            const classMatch = trimmed.match(/class=["']([^"']+)["']/i);
            if (classMatch?.[1]) {
                return { type: 'fa', value: classMatch[1] };
            }
            return null;
        }
        const type = trimmed.includes('fa-') ? 'fa' : 'img';
        if (type === 'fa') {
            return { type, value: normalizeFaClassList(trimmed) };
        }
        return { type, value: trimmed };
    }
    if (typeof iconFlag === 'object') {
        const type = iconFlag.type || iconFlag.kind;
        const value = iconFlag.value || iconFlag.icon || iconFlag.src;
        if (type && value) {
            if (type === 'fa') {
                return { type, value: normalizeFaClassList(value) };
            }
            return { type, value };
        }
    }
    return null;
}

function normalizeFaClassList(value) {
    if (typeof value !== 'string') return '';
    const classMatch = value.trim().startsWith('<i')
        ? value.match(/class=["']([^"']+)["']/i)?.[1]
        : value;
    const tokens = String(classMatch || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
    const deduped = Array.from(new Set(tokens));
    if (!deduped.some(token => token.startsWith('fa-') || token.startsWith('fa'))) {
        return '';
    }
    return deduped.join(' ');
}

export function describePinsProxyError(message) {
    const lowered = String(message || '').toLowerCase();
    if (!lowered) return null;
    if (lowered.includes('blacksmith-pins-gm-proxy') || lowered.includes('handler')) {
        if (lowered.includes('refused') || lowered.includes('not registered')) {
            return 'Failed to create pin: GM proxy not registered. Have the GM reload and ensure Blacksmith + SocketLib are active, then try again.';
        }
    }
    return null;
}

export function buildNoteIconHtml(iconData, imgClass = '') {
    if (!iconData) return `<i class="fa-solid ${NOTE_PIN_ICON}"></i>`;
    if (iconData.type === 'fa') {
        const rawValue = String(iconData.value || '');
        const classValue = normalizeFaClassList(rawValue);
        if (!classValue) {
            return `<i class="fa-solid ${NOTE_PIN_ICON}"></i>`;
        }
        return `<i class="${classValue}"></i>`;
    }
    const classAttr = imgClass ? ` class="${imgClass}"` : '';
    const src = normalizePinImageSource(iconData.value);
    if (!src) {
        return `<i class="fa-solid ${NOTE_PIN_ICON}"></i>`;
    }
    return `<img src="${src}"${classAttr}>`;
}

function normalizePinImageSource(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const imgMatch = trimmed.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) return imgMatch[1];
    if (/^(https?:\/\/|\/|data:)/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('modules/')) return `/${trimmed}`;
    return trimmed;
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

export function resolveNoteIconHtmlFromContent(content, imgClass = '') {
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        return buildNoteIconHtml({ type: 'img', value: imageSrc }, imgClass);
    }
    return buildNoteIconHtml(null, imgClass);
}

function focusNoteCardInDom(noteUuid) {
    const card = document.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`);
    if (!card) {
        return false;
    }
    card.classList.add('note-card-highlight');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    trackModuleTimeout(() => {
        card.classList.remove('note-card-highlight');
    }, 3200);
    return true;
}

function createPinPreviewElement(iconHtml, pinSize, pinStyle, pinShape, dropShadow) {
    const size = normalizePinSize(pinSize) || { w: 60, h: 60 };
    const style = mergeNotePinStyle(pinStyle);
    const shape = normalizePinShape(pinShape) || 'circle';
    const shadow = typeof dropShadow === 'boolean' ? dropShadow : true;
    const preview = document.createElement('div');
    preview.className = 'notes-pin-preview';
    preview.dataset.shape = shape;
    preview.style.setProperty('--pin-width', `${size.w}px`);
    preview.style.setProperty('--pin-height', `${size.h}px`);
    preview.style.setProperty('--pin-fill', style.fill);
    preview.style.setProperty('--pin-stroke', style.stroke);
    preview.style.setProperty('--pin-stroke-width', `${style.strokeWidth}px`);
    preview.style.setProperty('--pin-drop-shadow', shadow ? '0 0 10px rgba(0, 0, 0, 0.4)' : 'none');
    preview.innerHTML = `
        <div class="notes-pin-preview-inner">
            ${iconHtml}
        </div>
    `;
    return preview;
}

function getNotePinStyle() {
    return {
        fill: 'rgba(205, 200, 117, 0.9)',
        stroke: '#ffffff',
        strokeWidth: 2,
        alpha: 0.9
    };
}

function mergeNotePinStyle(override) {
    const base = getNotePinStyle();
    const normalized = normalizePinStyle(override);
    if (!normalized) return base;
    return {
        ...base,
        ...normalized
    };
}

/** Compute pin ownership from a note page's visibility/authorId flags. */
export function getNotePinOwnershipForPage(page) {
    if (!page) return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: {} };
    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId   = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
    return buildNoteOwnership(visibility, authorId);
}

function buildNoteDataFromPage(page) {
    if (!page) return null;
    const tags       = page.getFlag(MODULE.ID, 'tags') || [];
    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId   = page.getFlag(MODULE.ID, 'authorId');
    const pinId      = page.getFlag(MODULE.ID, 'pinId') || null;
    const timestamp  = page.getFlag(MODULE.ID, 'timestamp') || null;
    const authorName = authorId
        ? (game.users.get(authorId)?.name || game.users.find(u => u.id === authorId)?.name || authorId)
        : 'Unknown';
    return {
        pageId:     page.id,
        pageUuid:   page.uuid,
        title:      page.name || 'Untitled Note',
        content:    page.text?.content || '',
        noteIcon:   page.getFlag(MODULE.ID, 'noteIcon') || null,
        iconHtml:   resolveNoteIconHtmlFromPage(page, 'window-note-header-image'),
        authorName,
        timestamp,
        tags:         Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []),
        visibility,
        pinId,
        authorId,
        editorIds: page.getFlag(MODULE.ID, 'editorIds') || [],
        editLock:  getNoteEditLockInfo(page)
    };
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
        /** @type {'date'|'alpha'} */
        this.sortMode = 'date';
        this.allTags = new Set();
        this.scenes = new Set();
        this._pinPlacement = null;
        // Pin events registered centrally by manager-pins.js initPinManager().
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
        const previousScrollTop = notesContainer.querySelector('.notes-content')?.scrollTop;

        this.sortMode = (await game.user?.getFlag(MODULE.ID, 'notesSortMode')) || 'date';
        if (this.sortMode !== 'date' && this.sortMode !== 'alpha') {
            this.sortMode = 'date';
        }

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
        const cardTheme = (await game.user?.getFlag(MODULE.ID, 'notesCardTheme')) || 'dark';
        const viewMode = (await game.user?.getFlag(MODULE.ID, 'notesViewMode')) || 'cards';
        const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            notes: this.notes.map(note => ({
                ...note,
                tags: note.tags || [], // Ensure tags is always an array
                tagsCsv: (note.tags || []).map(tag => String(tag).toUpperCase()).join(','),
                searchText: [
                    note.name,
                    stripHtml(note.content),
                    (note.tags || []).join(' ')
                ].filter(Boolean).join(' ')
            })),
            allTags: Array.from(this.allTags).sort(),
            scenes: Array.from(this.scenes).sort(),
            filters: this.filters,
            filtersOpen: this.filtersOpen,
            sortMode: this.sortMode,
            isGM: game.user.isGM,
            currentUserId: game.user.id,
            cardTheme,
            viewMode,
            position: "left"
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        notesContainer.innerHTML = html;
        const newContent = notesContainer.querySelector('.notes-content');
        if (newContent && typeof previousScrollTop === 'number') {
            newContent.scrollTop = previousScrollTop;
        }

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
                    if (!note.sceneId) {
                        const storedSceneId = page.getFlag(MODULE.ID, 'sceneId');
                        if (storedSceneId) {
                            note.sceneId = storedSceneId;
                            note.sceneName = game.scenes?.get(storedSceneId)?.name || note.sceneName || null;
                        }
                    }
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
                    
                    // Ensure tags is always an array (even if empty)
                    if (!Array.isArray(note.tags)) {
                        note.tags = [];
                    }
                    note.tags = note.tags.map(tag => String(tag).toUpperCase());
                    note.pinId = page.getFlag(MODULE.ID, 'pinId') || null;
                    // get() now includes sceneId for placed pins (Blacksmith 13.7.6+).
                    const livePinSceneId = note.pinId ? (getPinsApi()?.get?.(note.pinId)?.sceneId ?? null) : null;
                    note.hasPinOnScene = !!(note.pinId && livePinSceneId);
                    if (livePinSceneId) {
                        note.sceneId = livePinSceneId;
                        note.sceneName = game.scenes?.get(livePinSceneId)?.name || note.sceneName || null;
                    }
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

        this._applyNotesSort();

        if (game.user.isGM) {
            await this._syncPinnedNotesOwnership();
        }
    }

    _updateNoteCardPinState(page) {
        if (!page) return;
        const root = this.element;
        if (!root) return;
        const card = root.querySelector(`[data-note-uuid="${page.uuid}"]`);
        if (!card) return;

        const pinId = page.getFlag(MODULE.ID, 'pinId') || null;
        const sceneId = pinId ? (getPinsApi()?.get?.(pinId)?.sceneId ?? null) : null;
        const sceneName = sceneId ? (game.scenes?.get(sceneId)?.name || 'none') : null;
        card.dataset.scene = sceneName || 'none';

        const pinButton = card.querySelector('.note-pin, .note-unpin');
        if (!pinButton) return;

        if (sceneId) {
            pinButton.classList.remove('note-pin');
            pinButton.classList.add('note-unpin');
            pinButton.title = 'Unpin from Canvas';
            pinButton.innerHTML = '<i class="fa-solid fa-location-dot note-pin-icon note-pin-active"></i>';
        } else {
            pinButton.classList.remove('note-unpin');
            pinButton.classList.add('note-pin');
            pinButton.title = 'Pin to Canvas';
            pinButton.innerHTML = '<i class="fa-solid fa-location-dot note-pin-icon note-pin-dim"></i>';
        }

        const locationEl = card.querySelector('.note-location-section');
        if (sceneId) {
            const label = sceneName || 'Scene';
            if (locationEl) {
                if (pinId) locationEl.dataset.pinId = pinId;
                locationEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${label}`;
            } else {
                const footer = card.querySelector('.note-footer');
                const newLocation = document.createElement('div');
                newLocation.classList.add('note-location-section');
                if (pinId) newLocation.dataset.pinId = pinId;
                newLocation.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${label}`;
                if (footer?.parentNode) {
                    footer.parentNode.insertBefore(newLocation, footer.nextSibling);
                } else {
                    card.appendChild(newLocation);
                }
            }
        } else if (locationEl) {
            locationEl.remove();
        }
    }

    async _syncPinnedNotesOwnership() {
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins) || !pins?.update) return;
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        for (const note of this.notes) {
            if (!note?.uuid) continue;
            const page = await foundry.utils.fromUuid(note.uuid);
            if (!page) continue;
            const pinId = page.getFlag(MODULE.ID, 'pinId');
            if (!pinId) continue;
            await updateNotePin(page);
        }
    }

    async _cleanupMissingPins() {
        if (!game.user?.isGM) return;
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
        if (!journal) return;
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) return;
        if (typeof pins.whenReady === 'function') await pins.whenReady();

        // Build index of all live note pins by noteUuid.
        const pinIndex = new Map();
        const collect = (list) => {
            for (const pin of list || []) {
                const noteUuid = pin?.config?.noteUuid;
                if (noteUuid && !pinIndex.has(noteUuid)) pinIndex.set(noteUuid, pin);
            }
        };
        collect(listSquirePinsByKind(pins, 'note', { unplacedOnly: true }));
        for (const scene of game.scenes.contents) {
            collect(listSquirePinsByKind(pins, 'note', { sceneId: scene.id }));
        }

        // Reconcile page flags: clear stale pinId, set correct pinId.
        for (const page of journal.pages.contents) {
            const livePin = pinIndex.get(page.uuid);
            const storedPinId = page.getFlag(MODULE.ID, 'pinId');
            if (livePin) {
                if (storedPinId !== livePin.id) await page.setFlag(MODULE.ID, 'pinId', livePin.id);
            } else if (storedPinId) {
                const exists = typeof pins.exists === 'function' ? pins.exists(storedPinId) : !!pins.get?.(storedPinId);
                if (!exists) await page.setFlag(MODULE.ID, 'pinId', null);
            }
        }

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        const targetElement = panelManager?.element || this.element;
        if (targetElement) await this.render(targetElement);
    }

    async _deleteAllPins(scope) {
        if (!game.user?.isGM) return;
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins) || !pins?.deleteAllByType) {
            ui.notifications.warn('Blacksmith Pins API not available.');
            return;
        }

        const sceneIds = [];
        if (scope === 'scene') {
            if (!canvas?.scene?.id) {
                ui.notifications.warn('No active scene.');
                return;
            }
            sceneIds.push(canvas.scene.id);
        } else {
            game.scenes?.forEach(scene => {
                if (scene?.id) sceneIds.push(scene.id);
            });
        }

        if (!sceneIds.length) return;

        for (const sceneId of sceneIds) {
            const noteType = getSquirePinType('note');
            await pins.deleteAllByType(noteType, { sceneId, moduleId: MODULE.ID });
            if (noteType !== 'note-pin') {
                try {
                    await pins.deleteAllByType('note-pin', { sceneId, moduleId: MODULE.ID });
                } catch (_) {}
            }
        }

        await this._cleanupMissingPins();

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        const targetElement = panelManager?.element || this.element;
        if (targetElement) {
            await this.render(targetElement);
        }
    }

    activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Set journal button - only the large button in no-journal state (titlebar Set Journal moved to menu)
        nativeHtml.querySelectorAll('.set-journal-button-large').forEach(button => {
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

        // Notes titlebar "..." context menu (Blacksmith) - all actions except New Note
        const notesTitlebarMenuBtn = nativeHtml.querySelector('.notes-titlebar-menu');
        if (notesTitlebarMenuBtn && getBlacksmith()?.uiContextMenu?.show) {
            const newMenuBtn = notesTitlebarMenuBtn.cloneNode(true);
            notesTitlebarMenuBtn.parentNode?.replaceChild(newMenuBtn, notesTitlebarMenuBtn);
            newMenuBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const cardTheme = game.user?.getFlag(MODULE.ID, 'notesCardTheme') || 'dark';
                const viewMode = game.user?.getFlag(MODULE.ID, 'notesViewMode') || 'cards';
                const coreItems = [
                    {
                        name: 'Refresh',
                        icon: 'fa-solid fa-sync-alt',
                        callback: async () => {
                            await this._refreshData();
                            this.render(this.element);
                            ui.notifications.info('Notes refreshed.');
                        }
                    },
                    {
                        name: cardTheme === 'light' ? 'Dark theme' : 'Light theme',
                        icon: cardTheme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
                        callback: async () => {
                            const next = cardTheme === 'light' ? 'dark' : 'light';
                            await game.user?.setFlag(MODULE.ID, 'notesCardTheme', next);
                            this.render(this.element);
                        }
                    },
                    {
                        name: viewMode === 'list' ? 'Card view' : 'List view',
                        icon: viewMode === 'list' ? 'fa-solid fa-address-card' : 'fa-solid fa-list',
                        callback: async () => {
                            const next = viewMode === 'list' ? 'cards' : 'list';
                            await game.user?.setFlag(MODULE.ID, 'notesViewMode', next);
                            this.render(this.element);
                        }
                    }
                ];
                const gmItems = game.user.isGM ? [
                    {
                        name: 'Select Journal for Notes',
                        icon: 'fa-solid fa-cog',
                        callback: () => {
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
                    },
                    {
                        name: 'Clean up missing pins',
                        icon: 'fa-solid fa-broom',
                        callback: async () => {
                            const confirmed = await Dialog.confirm({
                                title: 'Clean Up Missing Pins',
                                content: '<p>Scan notes and clear pin flags when the pin no longer exists?</p>',
                                yes: () => true,
                                no: () => false,
                                defaultYes: false
                            });
                            if (!confirmed) return;
                            await this._cleanupMissingPins();
                            ui.notifications.info('Pin cleanup complete.');
                        }
                    },
                    {
                        name: 'Delete all note pins',
                        icon: 'fa-solid fa-trash-can',
                        callback: async () => {
                            const choice = await Dialog.wait({
                                title: 'Delete Note Pins',
                                content: '<p>Delete note pins for this scene, or all scenes?</p>',
                                buttons: {
                                    scene: { label: 'This Scene', callback: () => 'scene' },
                                    all: { label: 'All Scenes', callback: () => 'all' },
                                    cancel: { label: 'Cancel', callback: () => null }
                                },
                                default: 'cancel',
                                close: () => null
                            });
                            if (!choice) return;
                            const confirmed = await Dialog.confirm({
                                title: 'Confirm Deletion',
                                content: choice === 'scene' ? '<p>Delete all note pins for this scene?</p>' : '<p>Delete all note pins across all scenes?</p>',
                                yes: () => true,
                                no: () => false,
                                defaultYes: false
                            });
                            if (!confirmed) return;
                            await this._deleteAllPins(choice);
                            ui.notifications.info('Note pins deleted.');
                        }
                    }
                ] : [];
                getBlacksmith().uiContextMenu.show({
                    id: `${MODULE.ID}-notes-titlebar-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones: { core: coreItems, gm: gmItems }
                });
            });
        }

        // New Note button - opens Note window (only action outside menu)
        nativeHtml.querySelectorAll('.new-note-button, .new-note-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                await openNoteWindow();
            });
        });

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
        const sortNotesButton = nativeHtml.querySelector('.toggle-notes-sort-button');
        if (sortNotesButton) {
            const newSortBtn = sortNotesButton.cloneNode(true);
            sortNotesButton.parentNode?.replaceChild(newSortBtn, sortNotesButton);
            newSortBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                const next = this.sortMode === 'alpha' ? 'date' : 'alpha';
                await game.user?.setFlag(MODULE.ID, 'notesSortMode', next);
                await this.render(this.element);
            });
        }

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
                    
                    const noteData = buildNoteDataFromPage(page);
                    if (!noteData) return;

                    await openNoteWindow({ note: noteData, page, pageUuid: page.uuid, pageId: page.id, viewMode: false });
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
                            await deleteNotePin(page);
                            await page.delete();
                            if (this.element) {
                                await this._refreshData();
                                this.render(this.element);
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

                await this._beginNotePinPlacement(page);
            });
        });

        nativeHtml.querySelectorAll('.note-open-title').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', async (event) => {
                event.preventDefault();
                const row = event.currentTarget.closest('[data-note-uuid]');
                const noteUuid = row?.dataset?.noteUuid;
                if (!noteUuid) return;

                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                const noteData = buildNoteDataFromPage(page);
                if (!noteData) return;

                await openNoteWindow({ note: noteData, page, pageUuid: page.uuid, pageId: page.id, viewMode: true });
            });
        });

        nativeHtml.querySelectorAll('.note-give').forEach(giveButton => {
            const newButton = giveButton.cloneNode(true);
            giveButton.parentNode?.replaceChild(newButton, giveButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const noteUuid = newButton.dataset.uuid;
                if (!noteUuid) return;

                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                const authorId = page.getFlag(MODULE.ID, 'authorId');
                if (!game.user.isGM && authorId !== game.user.id) {
                    ui.notifications.warn('You do not own this note.');
                    return;
                }
                const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                if (visibility !== 'private') {
                    ui.notifications.warn('Only private notes can be given to another player.');
                    return;
                }

                    const picker = new UsersWindow({
                        onUserSelected: async (user) => {
                            if (!user) return;
                            await page.setFlag(MODULE.ID, 'authorId', user.id);
                            await page.setFlag(MODULE.ID, 'editorIds', [user.id]);
                            await syncNoteOwnership(page, visibility, user.id);
                            await updateNotePin(page);
                            this.render(this.element);
                        }
                    });
                picker.render(true);
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

        nativeHtml.querySelectorAll('.note-location-section').forEach(location => {
            const newLocation = location.cloneNode(true);
            location.parentNode?.replaceChild(newLocation, location);
            newLocation.addEventListener('click', async (event) => {
                event.preventDefault();
                const pinId = event.currentTarget.dataset.pinId;
                if (!pinId) {
                    return;
                }
                const pins = getPinsApi();
                if (!pins?.panTo) {
                    return;
                }
                const success = await pins.panTo(pinId, {
                    ping: {
                        animation: 'ping',
                        sound: 'interface-ping-01'
                    }
                });
            });
        });

        // Apply initial filters
        this._applyFilters(nativeHtml);
        this._updateClearSearchState(nativeHtml);
    }

    async _beginNotePinPlacement(page) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place a note pin.');
            return;
        }

        const existingPinId = page.getFlag(MODULE.ID, 'pinId');
        const existingSceneId = existingPinId ? getPinsApi()?.get?.(existingPinId)?.sceneId : null;
        if (existingSceneId) {
            ui.notifications.warn('This note is already pinned. Unpin it first to place a new pin.');
            return;
        }

        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            ui.notifications.warn('Blacksmith Pins API not available. Install or enable Coffee Pub Blacksmith.');
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
        const previewEl = createPinPreviewElement(
            resolveNoteIconHtmlFromPage(page, 'notes-pin-preview-image'),
            { w: 60, h: 60 },
            { fill: 'rgba(205, 200, 117, 0.9)', stroke: '#ffffff', strokeWidth: 2, alpha: 0.9 },
            'circle',
            true
        );
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
            // MIGRATED TO BLACKSMITH API: No longer need squirePins container
            const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });

            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearNotePinPlacement();
                return;
            }

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
    }

    async _createNotePin(page, sceneId, x, y) {
        try {
            await createNotePin(page, sceneId, x, y);
        } catch (error) {
            const message = String(error?.message || error || '');
            const proxyMessage = describePinsProxyError(message);
            if (proxyMessage) {
                ui.notifications.error(proxyMessage);
                return;
            }
            if (message.toLowerCase().includes('permission denied')) {
                const hasPagePermission = page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                if (hasPagePermission) {
                    ui.notifications.error('Permission denied: Unable to create pin. The pin ownership may need to be synced. Try again or contact your GM.');
                } else {
                    ui.notifications.error('Permission denied: You do not have Owner permission on this note.');
                }
            } else {
                ui.notifications.error(`Failed to create pin: ${message}`);
            }
        }
        // createNotePin writes pinId flag → updateJournalEntryPage → render.
        // created hook → _scheduleNotesPanelRefresh(). No explicit render needed.
    }

    async _unpinNote(page) {
        try {
            await unplaceNotePin(page);
        } catch (error) {}
        this._updateNoteCardPinState(page);
        // unplaced hook → _scheduleNotesPanelRefresh(). No explicit render needed.
    }

    async showNote(noteUuid) {
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.setViewMode) {
            await panelManager.setViewMode('notes');
        }
        if (this.element && !this.element.classList.contains('expanded')) {
            this.element.classList.add('expanded');
        }

        let focused = false;
        const tryFocus = () => {
            if (focused) return true;
            focused = this.scrollToNote?.(noteUuid, this.element) === true;
            return focused;
        };

        if (this.element) {
            await this.render(this.element);
            tryFocus();
            trackModuleTimeout(tryFocus, 200);
            trackModuleTimeout(tryFocus, 500);
            trackModuleTimeout(tryFocus, 1000);
            trackModuleTimeout(() => {
                if (!focused) {
                } else {
                }
            }, 1200);
        }
    }

    scrollToNote(noteUuid, panelElement = null) {
        const root = panelElement ? getNativeElement(panelElement) : this.element;
        const notesContainer = root?.querySelector('[data-panel="panel-notes"]');
        let card = notesContainer?.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`) || null;

        if (!card) {
            card = document.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`);
        }

        if (!card) {
            return false;
        }

        card.classList.add('note-card-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => {
            card.classList.remove('note-card-highlight');
        }, 2000);
        return true;
    }

    /**
     * Apply filters to note cards (DOM-based filtering)
     * @private
     */
    /**
     * Order `this.notes` by current sort mode (date added vs alphabetical).
     * @private
     */
    _applyNotesSort() {
        const mode = this.sortMode === 'alpha' ? 'alpha' : 'date';
        if (mode === 'alpha') {
            this.notes.sort((a, b) => {
                const na = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
                return na;
            });
            return;
        }
        this.notes.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }

    _applyFilters(html) {
        const search = (this.filters.search || '').trim().toLowerCase();
        const selectedTags = (this.filters.tags || []).map(tag => tag.toUpperCase());
        const selectedScene = this.filters.scene || 'all';
        const selectedVisibility = this.filters.visibility || 'all';

        html.querySelectorAll('.note-card, .note-row').forEach(card => {
            let visible = true;

            // Search filter
            if (search) {
                const text = (card.dataset.search || card.textContent || '').toLowerCase();
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

// NotesForm has been moved to window-note.js

