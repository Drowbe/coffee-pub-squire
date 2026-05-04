import { MODULE } from './const.js';
import {
    buildNoteIconHtml,
    normalizeNoteIconFlag,
    resolveNoteIconHtmlFromContent,
    getDefaultNoteIconFlag,
    getDefaultNotePinDesign,
    buildNoteOwnership,
    describePinsProxyError,
    syncNoteOwnership,
    createNotePinForPage,
    deleteNotePinForPage,
    updateNotePinForPage,
    getNotePinOwnershipForPage,
    getNotePinSizeForNote,
    getNotePinShapeForNote,
    getNotePinStyleForNote,
    getNotePinDropShadowForNote,
    getNotePinTextLayoutForNote,
    getNotePinTextDisplayForNote,
    getNotePinTextColorForNote,
    getNotePinTextSizeForNote,
    getNotePinTextMaxLengthForNote,
    getNotePinTextScaleWithPinForNote,
    NOTES_PIN_DEFAULT_DESIGN_SETTING_KEY,
    normalizePinSize,
    normalizePinStyle,
    normalizePinShape,
    normalizePinTextLayout,
    normalizePinTextDisplay,
    normalizePinTextColor,
    normalizePinTextSize,
    normalizePinTextMaxLength,
    normalizePinTextScaleWithPin
} from './panel-notes.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

function getPinsApi() {
    return getBlacksmith()?.pins || null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.()
    || (await import('/modules/coffee-pub-blacksmith/scripts/window-base.js')).BlacksmithWindowBaseV2;
if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for NoteWindow');
}

const NOTE_EDIT_LOCK_FLAG = 'editLock';
const NOTE_EDIT_LOCK_TTL_MS = 30 * 60 * 1000;
const NOTE_EDIT_LOCK_TOUCH_MIN_MS = 30 * 1000;

export const NOTE_WINDOW_ID = `${MODULE.ID}-note-window`;

function buildNoteFromPage(page) {
    const authorId = page.getFlag(MODULE.ID, 'authorId');
    const author = game.users.get(authorId) || game.users.find(u => u.id === authorId);
    const content = typeof page?.text?.content === 'string'
        ? page.text.content
        : (typeof page?.text === 'string' ? page.text : '');

    return {
        title: page.name || '',
        content,
        authorId: authorId || null,
        authorName: author?.name || page?.author?.name || 'Unknown',
        timestamp: page.getFlag(MODULE.ID, 'timestamp') || null,
        tags: Array.isArray(page.getFlag(MODULE.ID, 'tags')) ? page.getFlag(MODULE.ID, 'tags') : [],
        visibility: page.getFlag(MODULE.ID, 'visibility') || 'private',
        sceneId: page.getFlag(MODULE.ID, 'sceneId') || null,
        x: page.getFlag(MODULE.ID, 'x') ?? null,
        y: page.getFlag(MODULE.ID, 'y') ?? null,
        pageId: page.id,
        pageUuid: page.uuid,
        pinId: page.getFlag(MODULE.ID, 'pinId') || null,
        noteIcon: page.getFlag(MODULE.ID, 'noteIcon') || null,
        notePinSize: page.getFlag(MODULE.ID, 'notePinSize') || getDefaultNotePinDesign().size,
        notePinShape: page.getFlag(MODULE.ID, 'notePinShape') || getDefaultNotePinDesign().shape,
        notePinStyle: page.getFlag(MODULE.ID, 'notePinStyle') || getDefaultNotePinDesign().style,
        notePinDropShadow: page.getFlag(MODULE.ID, 'notePinDropShadow'),
        notePinTextLayout: page.getFlag(MODULE.ID, 'notePinTextLayout') || getDefaultNotePinDesign().textLayout,
        notePinTextDisplay: page.getFlag(MODULE.ID, 'notePinTextDisplay') || getDefaultNotePinDesign().textDisplay,
        notePinTextColor: page.getFlag(MODULE.ID, 'notePinTextColor') || getDefaultNotePinDesign().textColor,
        notePinTextSize: page.getFlag(MODULE.ID, 'notePinTextSize') || getDefaultNotePinDesign().textSize,
        notePinTextMaxLength: page.getFlag(MODULE.ID, 'notePinTextMaxLength') ?? getDefaultNotePinDesign().textMaxLength,
        notePinTextScaleWithPin: page.getFlag(MODULE.ID, 'notePinTextScaleWithPin'),
        editorIds: Array.isArray(page.getFlag(MODULE.ID, 'editorIds')) ? page.getFlag(MODULE.ID, 'editorIds') : [],
        iconHtml: resolveNoteIconHtmlFromContent(content, 'note-window-header-image')
    };
}

export class NoteWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'note-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: NOTE_WINDOW_ID,
            tag: 'form',
            classes: ['note-window', 'note-entry-window', 'squire-window'],
            form: {
                submitOnChange: false,
                closeOnSubmit: false
            },
            position: { width: 760, height: 860 },
            window: { title: 'Note', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 620, minHeight: 680 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-note.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(note = null, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${NOTE_WINDOW_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NoteWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NoteWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.page = opts.page || null;
        this.pageId = opts.pageId || note?.pageId || null;
        this.pageUuid = opts.pageUuid || note?.pageUuid || null;
        this.isEditing = !!(this.pageId || this.pageUuid);
        this.note = this._normalizeNote(foundry.utils.mergeObject(this._getDefaultNote(), note || {}, { inplace: false }));
        this.note.pageId = this.pageId;
        this.note.pageUuid = this.pageUuid;
        this.isViewMode = !!opts.viewMode && this.isEditing;
        if (!this.isEditing) this.isViewMode = false;
        this.isEditMode = !this.isViewMode;
        this.isDraft = false;
        this.usingCollabEditor = false;
        this._draftCreating = false;
        this._draftCreated = false;
        this._didSubmit = false;
        this._placeAfterSave = false;
        this._editLock = null;
        this._editLockExpiryTimeout = null;
        this._lockNoticeUserId = null;
        this._lastEditLockTouch = 0;
        this._eventHandlers = [];
    }

    static async fromPage(page, options = {}) {
        const note = buildNoteFromPage(page);
        return new NoteWindow(note, {
            ...options,
            page,
            pageId: page?.id || options.pageId || null,
            pageUuid: page?.uuid || options.pageUuid || null
        });
    }

    _getDefaultNote() {
        const defaults = getDefaultNotePinDesign();
        return {
            title: '',
            content: '',
            authorId: game.user?.id || null,
            authorName: game.user?.name || 'Unknown',
            timestamp: null,
            tags: [],
            visibility: 'private',
            sceneId: null,
            x: null,
            y: null,
            pageId: null,
            pageUuid: null,
            pinId: null,
            noteIcon: null,
            notePinSize: defaults.size,
            notePinShape: defaults.shape,
            notePinStyle: defaults.style,
            notePinDropShadow: defaults.dropShadow,
            notePinTextLayout: defaults.textLayout,
            notePinTextDisplay: defaults.textDisplay,
            notePinTextColor: defaults.textColor,
            notePinTextSize: defaults.textSize,
            notePinTextMaxLength: defaults.textMaxLength,
            notePinTextScaleWithPin: defaults.textScaleWithPin,
            editorIds: []
        };
    }

    _normalizeNote(note) {
        const normalized = foundry.utils.mergeObject(this._getDefaultNote(), note || {}, { inplace: false });
        normalized.title = String(normalized.title || normalized.name || '').trim();
        normalized.content = String(normalized.content || '').trim();
        normalized.authorId = normalized.authorId || null;
        normalized.authorName = String(normalized.authorName || 'Unknown').trim() || 'Unknown';
        normalized.tags = Array.isArray(normalized.tags)
            ? normalized.tags.map(tag => String(tag || '').trim()).filter(Boolean)
            : (typeof normalized.tags === 'string'
                ? normalized.tags.split(',').map(tag => tag.trim()).filter(Boolean)
                : []);
        normalized.visibility = normalized.visibility === 'party' ? 'party' : 'private';
        normalized.sceneId = normalized.sceneId || null;
        normalized.x = normalized.x ?? null;
        normalized.y = normalized.y ?? null;
        normalized.pageId = normalized.pageId || this.pageId || null;
        normalized.pageUuid = normalized.pageUuid || this.pageUuid || null;
        normalized.pinId = normalized.pinId || null;
        normalized.noteIcon = normalized.noteIcon || null;
        normalized.notePinSize = getNotePinSizeForNote(normalized);
        normalized.notePinShape = getNotePinShapeForNote(normalized);
        normalized.notePinStyle = getNotePinStyleForNote(normalized);
        normalized.notePinDropShadow = getNotePinDropShadowForNote(normalized);
        normalized.notePinTextLayout = getNotePinTextLayoutForNote(normalized);
        normalized.notePinTextDisplay = getNotePinTextDisplayForNote(normalized);
        normalized.notePinTextColor = getNotePinTextColorForNote(normalized);
        normalized.notePinTextSize = getNotePinTextSizeForNote(normalized);
        normalized.notePinTextMaxLength = getNotePinTextMaxLengthForNote(normalized);
        normalized.notePinTextScaleWithPin = getNotePinTextScaleWithPinForNote(normalized);
        normalized.editorIds = Array.isArray(normalized.editorIds) ? normalized.editorIds.filter(Boolean) : [];
        return normalized;
    }

    async _loadPageIfNeeded() {
        if (this.page || !this.pageUuid) return;
        try {
            this.page = await foundry.utils.fromUuid(this.pageUuid);
        } catch (error) {
            console.error('Coffee Pub Squire | Failed to load note page:', error);
            this.page = null;
        }
    }

    _normalizeEditLock(lock) {
        if (!lock || typeof lock !== 'object') return null;
        const userId = lock.userId;
        const at = Number(lock.at);
        if (!userId || !Number.isFinite(at)) return null;
        const user = game.users.get(userId) || game.users.find(u => u.id === userId);
        return {
            userId,
            userName: lock.userName || user?.name || userId,
            at
        };
    }

    _isEditLockExpired(lock) {
        if (!lock || !Number.isFinite(lock.at)) return true;
        return Date.now() - lock.at > NOTE_EDIT_LOCK_TTL_MS;
    }

    async _setEditLock(page) {
        if (!page) return null;
        const lock = {
            userId: game.user.id,
            userName: game.user.name,
            at: Date.now()
        };
        await page.setFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG, lock);
        this._editLock = lock;
        this._lastEditLockTouch = lock.at;
        this._scheduleEditLockExpiry(lock);
        return lock;
    }

    async _clearEditLock(page, onlyIfUserId = null) {
        if (!page) return;
        const existing = this._normalizeEditLock(page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG));
        if (!existing) return;
        if (onlyIfUserId && existing.userId !== onlyIfUserId) return;
        if (typeof page.unsetFlag === 'function') {
            await page.unsetFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG);
        } else {
            await page.setFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG, null);
        }
        this._editLock = null;
        if (this._editLockExpiryTimeout) {
            clearTimeout(this._editLockExpiryTimeout);
            this._editLockExpiryTimeout = null;
        }
    }

    _scheduleEditLockExpiry(lock) {
        if (!lock) return;
        if (this._editLockExpiryTimeout) {
            clearTimeout(this._editLockExpiryTimeout);
        }
        const remaining = NOTE_EDIT_LOCK_TTL_MS - (Date.now() - lock.at);
        if (remaining <= 0) {
            this._handleEditLockExpiry();
            return;
        }
        this._editLockExpiryTimeout = setTimeout(() => this._handleEditLockExpiry(), remaining);
    }

    async _touchEditLock() {
        if (!this.page || !this._editLock) return;
        if (this._editLock.userId !== game.user.id) return;
        const now = Date.now();
        if (now - this._lastEditLockTouch < NOTE_EDIT_LOCK_TOUCH_MIN_MS) return;
        const lock = {
            userId: game.user.id,
            userName: game.user.name,
            at: now
        };
        await this.page.setFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG, lock);
        this._editLock = lock;
        this._lastEditLockTouch = now;
        this._scheduleEditLockExpiry(lock);
    }

    async _handleEditLockExpiry() {
        if (!this.page) return;
        const lock = this._normalizeEditLock(this.page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG));
        if (!lock || lock.userId !== game.user.id) return;
        ui.notifications.warn('Your edit session expired. This note is now read-only.');
        await this._clearEditLock(this.page, game.user.id);
        this.isEditMode = false;
        this.isViewMode = true;
        await this.render(true);
    }

    async _syncEditLockState() {
        const page = this.page;
        if (!page) return;

        const rawLock = this._normalizeEditLock(page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG));
        if (rawLock && this._isEditLockExpired(rawLock)) {
            await this._clearEditLock(page);
        }

        const currentLock = this._normalizeEditLock(page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG));
        if (currentLock && currentLock.userId !== game.user.id) {
            if (this.isEditMode && this._lockNoticeUserId !== currentLock.userId) {
                ui.notifications.warn(`${currentLock.userName} is editing this note. Opening read-only.`);
                this._lockNoticeUserId = currentLock.userId;
            }
            this.isEditMode = false;
            this.isViewMode = true;
            this._editLock = currentLock;
            return;
        }

        this._lockNoticeUserId = null;
        if (this.isEditMode) {
            if (!currentLock) {
                await this._setEditLock(page);
            } else {
                this._editLock = currentLock;
                this._scheduleEditLockExpiry(currentLock);
            }
        } else if (currentLock && currentLock.userId === game.user.id) {
            await this._clearEditLock(page, game.user.id);
        } else {
            this._editLock = currentLock;
        }
    }

    async _ensureDraftNote() {
        if (this.isEditing || this._draftCreating || this._draftCreated) return;
        this._draftCreating = true;

        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No notes journal selected. Please select a journal in module settings.');
            this._draftCreating = false;
            return;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected notes journal not found.');
            this._draftCreating = false;
            return;
        }

        if (!journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
            ui.notifications.error('You do not have permission to create notes in this journal. Please contact your GM.');
            this._draftCreating = false;
            return;
        }

        const visibility = this.note.visibility === 'party' ? 'party' : 'private';
        const pageData = {
            name: this.note.title || 'Untitled Note',
            type: 'text',
            text: { content: this.note.content || '' },
            flags: {
                [MODULE.ID]: {
                    noteType: 'sticky',
                    tags: this.note.tags,
                    visibility,
                    editorIds: [game.user.id],
                    sceneId: this.note.sceneId || null,
                    x: this.note.x ?? null,
                    y: this.note.y ?? null,
                    noteIcon: this.note.noteIcon || null,
                    notePinSize: getNotePinSizeForNote(this.note),
                    notePinShape: getNotePinShapeForNote(this.note),
                    notePinStyle: getNotePinStyleForNote(this.note),
                    notePinDropShadow: getNotePinDropShadowForNote(this.note),
                    notePinTextLayout: getNotePinTextLayoutForNote(this.note),
                    notePinTextDisplay: getNotePinTextDisplayForNote(this.note),
                    notePinTextColor: getNotePinTextColorForNote(this.note),
                    notePinTextSize: getNotePinTextSizeForNote(this.note),
                    notePinTextMaxLength: getNotePinTextMaxLengthForNote(this.note),
                    notePinTextScaleWithPin: getNotePinTextScaleWithPinForNote(this.note),
                    authorId: game.user.id,
                    timestamp: new Date().toISOString()
                }
            }
        };

        try {
            const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
            if (!newPage) {
                ui.notifications.error('Failed to create draft note.');
                return;
            }

            this.page = newPage;
            this.pageId = newPage.id;
            this.pageUuid = newPage.uuid;
            this.isEditing = true;
            this.isDraft = true;
            this.note = this._normalizeNote(foundry.utils.mergeObject(this.note, buildNoteFromPage(newPage), { inplace: false }));
            this.note.pageId = newPage.id;
            this.note.pageUuid = newPage.uuid;

            try {
                const hasPlacement = !!this.note.sceneId && this.note.x !== null && this.note.y !== null;
                const pinId = await createNotePinForPage(
                    newPage,
                    hasPlacement ? this.note.sceneId : undefined,
                    hasPlacement ? this.note.x : undefined,
                    hasPlacement ? this.note.y : undefined
                );
                if (pinId) {
                    await newPage.setFlag(MODULE.ID, 'pinId', pinId);
                    this.note.pinId = pinId;
                }
            } catch (error) {
                const proxyMessage = describePinsProxyError(String(error?.message || error || ''));
                if (proxyMessage) ui.notifications.error(proxyMessage);
                else ui.notifications.warn('Draft note created, but pin creation failed.');
            }

            await this._setEditLock(newPage);
        } catch (error) {
            console.error('Coffee Pub Squire | Error creating draft note:', error);
            ui.notifications.error(`Failed to create draft note: ${error.message}`);
        } finally {
            this._draftCreated = true;
            this._draftCreating = false;
        }
    }

    async getData() {
        if (!this.isEditing) {
            await this._ensureDraftNote();
        } else {
            await this._loadPageIfNeeded();
        }

        if (this.isEditing && this.page) {
            await this._syncEditLockState();
        }

        const content = this._getPageContent();
        this.note.content = content;
        const iconHtml = (this.note.noteIcon ? buildNoteIconHtml(normalizeNoteIconFlag(this.note.noteIcon), 'note-window-header-image') : null)
            || resolveNoteIconHtmlFromContent(content, 'note-window-header-image');
        this.note.iconHtml = iconHtml;

        const editorContent = this._getEditorContent(content);

        return {
            appId: this.id,
            note: {
                ...this.note,
                tagsText: this.note.tags.join(', '),
                content,
                editorContent,
                iconHtml,
                sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name || null : null,
                editorAvatars: this._getEditorAvatars()
            },
            editLock: this._editLock ? { ...this._editLock, isSelf: this._editLock.userId === game.user.id } : null,
            canEdit: !this._editLock || this._editLock.userId === game.user.id,
            isGM: game.user.isGM,
            isEditing: this.isEditing,
            isEditMode: this.isEditMode,
            isViewMode: this.isViewMode,
            suggestedTags: this._getSuggestedTags(),
            commonTags: this._getExistingTags(),
            windowTitle: 'Note',
            headerTitle: this.note.title || 'Untitled Note',
            subtitle: this.isEditing ? (this.isEditMode ? 'Edit Note' : 'View Note') : 'New Note'
        };
    }

    _getPageContent() {
        if (this.page) {
            if (typeof this.page?.text?.content === 'string') return this.page.text.content;
            if (typeof this.page?.text === 'string') return this.page.text;
        }
        return String(this.note.content || '');
    }

    _getEditorAvatars() {
        const editorIds = Array.isArray(this.note.editorIds) && this.note.editorIds.length
            ? this.note.editorIds
            : (this.note.authorId ? [this.note.authorId] : []);
        return [...new Set(editorIds)].map(id => {
            const user = game.users.get(id) || game.users.find(u => u.id === id);
            return {
                id,
                name: user?.name || id || 'Unknown',
                img: user?.avatar || user?.img || 'icons/svg/mystery-man.svg'
            };
        });
    }

    _getExistingTags() {
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') return [];
        const journal = game.journal.get(journalId);
        if (!journal) return [];

        const tags = new Map();
        for (const page of journal.pages.contents) {
            const pageTags = page.getFlag(MODULE.ID, 'tags');
            if (!Array.isArray(pageTags)) continue;
            for (const tag of pageTags) {
                const normalized = String(tag || '').trim().toUpperCase();
                if (normalized) tags.set(normalized, normalized);
            }
        }
        return Array.from(tags.values()).sort((a, b) => a.localeCompare(b)).slice(0, 24);
    }

    _getSuggestedTags() {
        return [
            'NPC',
            'Location',
            'Faction',
            'Quest',
            'Clue',
            'Rumor',
            'Loot',
            'Shop',
            'Tavern',
            'Dungeon',
            'Travel',
            'Party'
        ];
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;
        this._clearEventHandlers();
        this._attachLocalListeners(root);
        if (this.isEditMode) {
            this._mountEditor(root);
        }
    }

    _getForm(root = this._getRoot()) {
        if (root?.matches?.('form')) return root;
        const closest = root?.closest?.('form');
        if (closest) return closest;
        const nested = root?.querySelector?.('form');
        if (nested) return nested;
        if (this.element?.matches?.('form')) return this.element;
        return this.element?.querySelector?.('form') || null;
    }

    _getEditorContent(content = this._getPageContent()) {
        const html = String(content || '').trim();
        if (!html) return '';

        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const blockTags = new Set([
            'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption',
            'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav',
            'ol', 'p', 'pre', 'section', 'table', 'ul'
        ]);

        const hasBlockRoot = Array.from(wrapper.childNodes).some(node =>
            (node.nodeType === Node.ELEMENT_NODE) && blockTags.has(node.tagName.toLowerCase())
        );

        if (hasBlockRoot) return html;
        return `<p>${html}</p>`;
    }

    _mountEditor(root) {
        const host = root.querySelector('.note-editor-host');
        if (!host) return;

        const config = {
            name: 'content',
            value: this._getEditorContent(this.note.content),
            compact: true
        };
        if (this.note.pageUuid) config.documentUUID = this.note.pageUuid;

        const editor = foundry.applications.elements.HTMLProseMirrorElement.create(config);
        editor.classList.add('note-window-editor');
        editor.disabled = false;
        editor.removeAttribute('readonly');
        editor.addEventListener('open', () => {
            editor.disabled = false;
            editor.removeAttribute('readonly');
            requestAnimationFrame(() => {
                const content = editor.querySelector('.editor-content');
                content?.setAttribute('contenteditable', 'true');
                content?.focus();
                if (!content) {
                    console.warn('Coffee Pub Squire | Note editor opened without an .editor-content element.', {
                        pageUuid: this.note.pageUuid,
                        title: this.note.title
                    });
                    return;
                }
                if (editor.disabled || editor.matches(':disabled') || content.getAttribute('contenteditable') !== 'true') {
                    console.warn('Coffee Pub Squire | Note editor may be non-editable after mount.', {
                        pageUuid: this.note.pageUuid,
                        title: this.note.title,
                        editorDisabled: editor.disabled,
                        editorMatchesDisabled: editor.matches(':disabled'),
                        contentEditable: content.getAttribute('contenteditable'),
                        contentChildCount: content.childNodes.length
                    });
                }
            });
        }, { once: true });
        host.replaceChildren(editor);
    }

    _attachLocalListeners(root) {
        const form = this._getForm(root);
        if (form) {
            const submitHandler = (event) => {
                event.preventDefault();
                this._handleFormSubmit(event);
            };
            form.addEventListener('submit', submitHandler);
            this._eventHandlers.push({ element: form, event: 'submit', handler: submitHandler });
        }

        const headerIcon = root.querySelector('.note-window-header-icon');
        if (headerIcon) {
            const iconHandler = async (event) => {
                event.preventDefault();
                await this._openPinConfiguration(headerIcon);
            };
            headerIcon.addEventListener('click', iconHandler);
            this._eventHandlers.push({ element: headerIcon, event: 'click', handler: iconHandler });
        }

        const editToggle = root.querySelector('#notes-edit-toggle');
        if (editToggle) {
            const toggleHandler = async (event) => {
                event.preventDefault();
                const checked = !!event.currentTarget?.checked;
                if (this.isEditMode) {
                    await this._captureFormState();
                    await this._clearEditLock(this.page, game.user.id);
                }
                this.isEditMode = checked;
                this.isViewMode = !this.isEditMode;
                await this.render(true);
            };
            editToggle.addEventListener('change', toggleHandler);
            this._eventHandlers.push({ element: editToggle, event: 'change', handler: toggleHandler });
        }

        const titleInput = root.querySelector('#title');
        if (titleInput) {
            const inputHandler = (event) => {
                this.note.title = String(event.currentTarget.value || '').trim();
            };
            titleInput.addEventListener('input', inputHandler);
            this._eventHandlers.push({ element: titleInput, event: 'input', handler: inputHandler });
        }

        if (this.isEditMode) {
            const touchHandler = () => {
                this._touchEditLock().catch(error => console.warn('Failed to refresh edit lock:', error));
            };
            root.addEventListener('keydown', touchHandler);
            root.addEventListener('mousedown', touchHandler);
            root.addEventListener('touchstart', touchHandler, { passive: true });
            this._eventHandlers.push({ element: root, event: 'keydown', handler: touchHandler });
            this._eventHandlers.push({ element: root, event: 'mousedown', handler: touchHandler });
            this._eventHandlers.push({ element: root, event: 'touchstart', handler: touchHandler });
        }

        this._setupTagSuggestions(root);
    }

    _setupTagSuggestions(root) {
        const tagsInput = root.querySelector('input[name="tags"]');
        if (!tagsInput) return;

        root.querySelectorAll('.note-tag-chip').forEach(tagChip => {
            const handler = () => {
                const tag = String(tagChip.dataset.tagValue || '').trim().toUpperCase();
                if (!tag) return;
                const current = (tagsInput.value || '')
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean)
                    .map(value => value.toUpperCase());
                const index = current.indexOf(tag);
                if (index >= 0) current.splice(index, 1);
                else current.push(tag);
                tagsInput.value = current.join(', ');
                tagChip.classList.toggle('active', index < 0);
            };
            tagChip.addEventListener('click', handler);
            this._eventHandlers.push({ element: tagChip, event: 'click', handler });
        });

        const syncHandler = () => {
            const active = new Set(
                (tagsInput.value || '')
                    .split(',')
                    .map(value => value.trim().toUpperCase())
                    .filter(Boolean)
            );
            root.querySelectorAll('.note-tag-chip').forEach(tagChip => {
                const tag = String(tagChip.dataset.tagValue || '').trim().toUpperCase();
                tagChip.classList.toggle('active', active.has(tag));
            });
        };
        tagsInput.addEventListener('input', syncHandler);
        this._eventHandlers.push({ element: tagsInput, event: 'input', handler: syncHandler });
    }

    _readEditorContent(root = this._getRoot()) {
        const editor = root?.querySelector?.('prose-mirror[name="content"]');
        if (!editor) return String(this.note.content || '');
        return String(editor.value || '');
    }

    async _captureFormState() {
        const root = this._getRoot();
        const form = this._getForm(root);
        if (!form) return;

        const data = new FormData(form);
        const title = data.get('title');
        const tagsText = data.get('tags');
        const visibilityToggle = form.querySelector('#notes-visibility-private');

        if (typeof title === 'string') this.note.title = title;
        this.note.content = this._readEditorContent(root);
        if (typeof tagsText === 'string') {
            this.note.tags = tagsText.split(',').map(tag => tag.trim()).filter(Boolean);
        }
        if (visibilityToggle) {
            this.note.visibility = visibilityToggle.checked ? 'private' : 'party';
        }
    }

    async _handleFormSubmit(event, { placePin = false } = {}) {
        event?.preventDefault?.();
        if (!this.isEditMode) return;

        const root = this._getRoot();
        const form = this._getForm(root);
        if (!form) return;

        this._placeAfterSave = placePin;
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        data.content = this._readEditorContent(root);
        const visibilityToggle = form.querySelector('#notes-visibility-private');
        data.visibility = visibilityToggle?.checked ? 'private' : 'party';

        await this._updateObject(event, data);
    }

    async _persistPinFlags(page) {
        if (!page) return;
        await page.setFlag(MODULE.ID, 'noteIcon', this.note.noteIcon || null);
        await page.setFlag(MODULE.ID, 'notePinSize', getNotePinSizeForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinShape', getNotePinShapeForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinStyle', getNotePinStyleForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinDropShadow', getNotePinDropShadowForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextLayout', getNotePinTextLayoutForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextDisplay', getNotePinTextDisplayForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextColor', getNotePinTextColorForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextSize', getNotePinTextSizeForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextMaxLength', getNotePinTextMaxLengthForNote(this.note));
        await page.setFlag(MODULE.ID, 'notePinTextScaleWithPin', getNotePinTextScaleWithPinForNote(this.note));
    }

    async _applyPinConfiguration(config, headerIcon) {
        const defaults = getDefaultNotePinDesign();
        const icon = config?.icon || null;
        this.note.noteIcon = icon;
        this.note.notePinSize = normalizePinSize(config?.pinSize) || defaults.size;
        this.note.notePinStyle = normalizePinStyle(config?.pinStyle) || defaults.style;
        this.note.notePinShape = normalizePinShape(config?.pinShape) || defaults.shape;
        this.note.notePinDropShadow = typeof config?.pinDropShadow === 'boolean' ? config.pinDropShadow : defaults.dropShadow;
        this.note.notePinTextLayout = normalizePinTextLayout(config?.pinTextConfig?.textLayout) || defaults.textLayout;
        this.note.notePinTextDisplay = normalizePinTextDisplay(config?.pinTextConfig?.textDisplay) || defaults.textDisplay;
        this.note.notePinTextColor = normalizePinTextColor(config?.pinTextConfig?.textColor) || defaults.textColor;
        this.note.notePinTextSize = normalizePinTextSize(config?.pinTextConfig?.textSize) || defaults.textSize;
        this.note.notePinTextMaxLength = normalizePinTextMaxLength(config?.pinTextConfig?.textMaxLength) ?? defaults.textMaxLength;
        this.note.notePinTextScaleWithPin = normalizePinTextScaleWithPin(config?.pinTextConfig?.textScaleWithPin) ?? defaults.textScaleWithPin;
        this.note.iconHtml = buildNoteIconHtml(icon, 'note-window-header-image');
        if (headerIcon) headerIcon.innerHTML = this.note.iconHtml;

        if (this.page) {
            await this._persistPinFlags(this.page);
            await this._refreshNotesPanel();
        }
    }

    async _openPinConfiguration(headerIcon) {
        const pins = getPinsApi();
        if (!pins?.configure) {
            ui.notifications.warn('Blacksmith pins are not available.');
            return;
        }

        let pinId = this.note?.pinId || this.page?.getFlag?.(MODULE.ID, 'pinId') || null;
        const sceneId = this.note?.sceneId || this.page?.getFlag?.(MODULE.ID, 'sceneId') || null;

        if (pinId && this.page) {
            const pinExists = typeof pins.exists === 'function' ? pins.exists(pinId) : !!pins.get?.(pinId);
            if (!pinExists) {
                const recoveryPins = [];
                if (typeof pins.list === 'function') {
                    if (sceneId) recoveryPins.push(...(pins.list({ moduleId: MODULE.ID, sceneId }) || []));
                    recoveryPins.push(...(pins.list({ moduleId: MODULE.ID, unplacedOnly: true }) || []));
                }
                const recovered = recoveryPins.find(candidate => candidate?.config?.noteUuid === this.page.uuid);
                if (recovered?.id) {
                    pinId = recovered.id;
                    await this.page.setFlag(MODULE.ID, 'pinId', recovered.id);
                    if (recovered.sceneId) {
                        await this.page.setFlag(MODULE.ID, 'sceneId', recovered.sceneId);
                        await this.page.setFlag(MODULE.ID, 'x', typeof recovered.x === 'number' ? recovered.x : null);
                        await this.page.setFlag(MODULE.ID, 'y', typeof recovered.y === 'number' ? recovered.y : null);
                    }
                } else {
                    await this.page.setFlag(MODULE.ID, 'pinId', null);
                    pinId = null;
                }
            }
        }

        if (!pinId && this.page) {
            try {
                const createdPinId = await createNotePinForPage(this.page);
                if (createdPinId) {
                    pinId = createdPinId;
                    await this.page.setFlag(MODULE.ID, 'pinId', createdPinId);
                }
            } catch (error) {
                console.error('Coffee Pub Squire | Failed to create note pin:', error);
                ui.notifications.error('Failed to create pin for this note.');
                return;
            }
        }

        if (!pinId) {
            ui.notifications.warn('Create a pin for this note before configuring its design.');
            return;
        }

        const openConfig = async (targetPinId) => {
            await pins.configure(targetPinId, {
                sceneId: sceneId || undefined,
                moduleId: MODULE.ID,
                useAsDefault: true,
                defaultSettingKey: NOTES_PIN_DEFAULT_DESIGN_SETTING_KEY,
                onSelect: async (config) => this._applyPinConfiguration(config, headerIcon)
            });
        };

        try {
            await openConfig(pinId);
        } catch (error) {
            const message = String(error?.message || error || '').toLowerCase();
            if (message.includes('permission denied') && this.page && typeof pins.requestGM === 'function') {
                try {
                    await pins.requestGM('update', {
                        pinId,
                        patch: { ownership: getNotePinOwnershipForPage(this.page) }
                    });
                    await openConfig(pinId);
                    return;
                } catch (retryError) {
                    console.error('Coffee Pub Squire | Failed to update note pin ownership:', retryError);
                }
            }

            if (message.includes('pin not found') && this.page) {
                try {
                    await this.page.setFlag(MODULE.ID, 'pinId', null);
                    const recreatedId = await createNotePinForPage(this.page);
                    if (recreatedId) {
                        await this.page.setFlag(MODULE.ID, 'pinId', recreatedId);
                        await openConfig(recreatedId);
                        return;
                    }
                } catch (retryError) {
                    console.error('Coffee Pub Squire | Failed to recover note pin:', retryError);
                }
            }

            console.error('Coffee Pub Squire | Failed to open note pin configuration window:', error);
            ui.notifications.error('Failed to open pin configuration window.');
        }
    }

    async _refreshNotesPanel() {
        const notesPanel = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.notesPanel;
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (!notesPanel || !panelManager?.element) return;
        await notesPanel._refreshData();
        notesPanel.render(panelManager.element);
    }

    async _updateObject(event, formData) {
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.error('No notes journal selected. Please select a journal in module settings.');
            return false;
        }

        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error('Selected notes journal not found.');
            return false;
        }

        const tags = String(formData.tags || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
            .map(tag => tag.toUpperCase());
        const visibility = formData.visibility === 'party' ? 'party' : 'private';
        const content = this._generateNoteContent(formData);

        try {
            let page = this.page;

            if (this.isEditing && this.pageUuid) {
                page = page || await foundry.utils.fromUuid(this.pageUuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return false;
                }
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    ui.notifications.error('You do not have permission to edit this note.');
                    return false;
                }

                await page.update({
                    name: formData.title || 'Untitled Note',
                    'text.content': content
                });

                await page.setFlag(MODULE.ID, 'tags', tags);
                await page.setFlag(MODULE.ID, 'visibility', visibility);
                await this._persistPinFlags(page);

                let authorId = page.getFlag(MODULE.ID, 'authorId');
                if (!authorId) {
                    authorId = game.user.id;
                    await page.setFlag(MODULE.ID, 'authorId', authorId);
                }

                const existingEditors = page.getFlag(MODULE.ID, 'editorIds') || [];
                let editorIds = Array.isArray(existingEditors) ? [...new Set([...existingEditors, game.user.id])] : [game.user.id];
                if (visibility === 'private') editorIds = [authorId];
                await page.setFlag(MODULE.ID, 'editorIds', editorIds);
                if (this.isDraft) {
                    await page.setFlag(MODULE.ID, 'draft', false);
                    this.isDraft = false;
                }
                if (formData.sceneId) {
                    await page.setFlag(MODULE.ID, 'sceneId', formData.sceneId);
                    await page.setFlag(MODULE.ID, 'x', formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null);
                    await page.setFlag(MODULE.ID, 'y', formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null);
                }

                await this._syncNoteOwnership(page, visibility, authorId);
                await updateNotePinForPage(page);
            } else {
                if (!journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
                    ui.notifications.error('You do not have permission to create notes in this journal. Please contact your GM.');
                    return false;
                }

                const normalizedIcon = normalizeNoteIconFlag(this.note.noteIcon) || getDefaultNoteIconFlag();
                this.note.noteIcon = normalizedIcon;
                const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
                    name: formData.title || 'Untitled Note',
                    type: 'text',
                    text: { content },
                    flags: {
                        [MODULE.ID]: {
                            noteType: 'sticky',
                            tags,
                            visibility,
                            editorIds: [game.user.id],
                            sceneId: formData.sceneId || null,
                            x: formData.x !== undefined && formData.x !== '' ? parseFloat(formData.x) : null,
                            y: formData.y !== undefined && formData.y !== '' ? parseFloat(formData.y) : null,
                            noteIcon: normalizedIcon,
                            notePinSize: getNotePinSizeForNote(this.note),
                            notePinShape: getNotePinShapeForNote(this.note),
                            notePinStyle: getNotePinStyleForNote(this.note),
                            notePinDropShadow: getNotePinDropShadowForNote(this.note),
                            notePinTextLayout: getNotePinTextLayoutForNote(this.note),
                            notePinTextDisplay: getNotePinTextDisplayForNote(this.note),
                            notePinTextColor: getNotePinTextColorForNote(this.note),
                            notePinTextSize: getNotePinTextSizeForNote(this.note),
                            notePinTextMaxLength: getNotePinTextMaxLengthForNote(this.note),
                            notePinTextScaleWithPin: getNotePinTextScaleWithPinForNote(this.note),
                            authorId: game.user.id,
                            timestamp: new Date().toISOString()
                        }
                    }
                }]);
                page = newPage;
                const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                await this._syncNoteOwnership(page, visibility, authorId);
            }

            this.page = page;

            if (!this.isEditing) {
                try {
                    const hasPlacement = !!formData.sceneId && formData.x !== null && formData.y !== null;
                    const pinId = await createNotePinForPage(
                        page,
                        hasPlacement ? formData.sceneId : undefined,
                        hasPlacement ? parseFloat(formData.x) : undefined,
                        hasPlacement ? parseFloat(formData.y) : undefined
                    );
                    if (pinId) {
                        await page.setFlag(MODULE.ID, 'pinId', pinId);
                    }
                } catch (error) {
                    const proxyMessage = describePinsProxyError(String(error?.message || error || ''));
                    if (proxyMessage) {
                        ui.notifications.error(proxyMessage);
                        return false;
                    }
                    if (String(error?.message || error || '').toLowerCase().includes('permission denied')) {
                        ui.notifications.error('Permission denied: Unable to create pin for this note.');
                    } else {
                        ui.notifications.warn('Could not create Blacksmith pin for this note.');
                    }
                }
            }

            const shouldPlace = this._placeAfterSave;
            this._placeAfterSave = false;
            this._didSubmit = true;
            ui.notifications.info(`Note "${formData.title || 'Untitled Note'}" ${this.isEditing ? 'updated' : 'saved'} successfully.`);
            await this._clearEditLock(page, game.user.id);
            await this.close();

            if (shouldPlace && page) {
                const notesPanel = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.notesPanel;
                if (notesPanel?._beginNotePinPlacement) {
                    await notesPanel._beginNotePinPlacement(page);
                } else {
                    ui.notifications.warn('Unable to place pin: Notes panel not available.');
                }
            }

            await this._refreshNotesPanel();
            return true;
        } catch (error) {
            console.error('Coffee Pub Squire | Error saving note:', error);
            ui.notifications.error(`Failed to save note: ${error.message}`);
            return false;
        }
    }

    _generateNoteContent(formData) {
        return String(formData.content || '');
    }

    _buildNoteOwnership(visibility, authorId) {
        return buildNoteOwnership(visibility, authorId);
    }

    async _syncNoteOwnership(page, visibility, authorId) {
        await syncNoteOwnership(page, visibility, authorId);
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
        try {
            if (!this._didSubmit && this.isEditMode && this.page) {
                await this._clearEditLock(this.page, game.user.id);
            }
        } catch (error) {
            console.warn('Failed to clear edit lock on close:', error);
        }

        if (this._editLockExpiryTimeout) {
            clearTimeout(this._editLockExpiryTimeout);
            this._editLockExpiryTimeout = null;
        }
        this._clearEventHandlers();
        return super.close(options);
    }

    static async _actionSave(event, _target) {
        const instance = NoteWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance._handleFormSubmit(event, { placePin: false });
    }

    static async _actionSavePlace(event, _target) {
        const instance = NoteWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance._handleFormSubmit(event, { placePin: true });
    }

    static async _actionCancel(event, _target) {
        const instance = NoteWindow._ref;
        if (!instance) return;
        event?.preventDefault?.();
        await instance.close();
    }
}

NoteWindow.ACTION_HANDLERS = {
    save: NoteWindow._actionSave,
    savePlace: NoteWindow._actionSavePlace,
    cancel: NoteWindow._actionCancel
};

export const NotesForm = NoteWindow;

export async function openNotesWindow(options = {}) {
    let windowInstance;
    if (options.page) {
        windowInstance = await NoteWindow.fromPage(options.page, options);
    } else if (options.pageUuid) {
        const page = await foundry.utils.fromUuid(options.pageUuid);
        windowInstance = page ? await NoteWindow.fromPage(page, options) : new NoteWindow(options.note || null, options);
    } else {
        windowInstance = new NoteWindow(options.note || null, options);
    }
    await windowInstance.render(true);
    return windowInstance;
}

export function registerNoteWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(NOTE_WINDOW_ID, {
        open: openNotesWindow,
        title: 'Note',
        moduleId: MODULE.ID
    });
}
