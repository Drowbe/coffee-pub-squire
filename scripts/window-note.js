import { MODULE, TEMPLATES } from './const.js';
import { getNativeElement } from './helpers.js';

// Import helper functions from panel-notes.js
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

function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins || null;
}

const NOTE_EDIT_LOCK_FLAG = 'editLock';
const NOTE_EDIT_LOCK_TTL_MS = 30 * 60 * 1000;
const NOTE_EDIT_LOCK_TOUCH_MIN_MS = 30 * 1000;

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
        this.isViewMode = !!options.viewMode && this.isEditing;
        if (!this.isEditing) {
            this.isViewMode = false;
        }
        this.isEditMode = !this.isViewMode;
        this.dragActive = false;
        this._eventHandlers = [];
        this.page = null; // Store reference to page document for editor binding
        this.usingCollabEditor = false; // Track if we're using collaborative editor
        this.isDraft = false;
        this._draftCreating = false;
        this._draftCreated = false;
        this._didSubmit = false;
        this._placeAfterSave = false;
        this._editLock = null;
        this._editLockExpiryTimeout = null;
        this._lockNoticeUserId = null;
        this._lastEditLockTouch = 0;
        
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
            classes: ['window-note', 'squire-window'],
            title: 'New Note', // Will be updated in getData if editing
            template: TEMPLATES.WINDOW_NOTE,
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
        if (this.isDraft || !this.isEditing) return 'New Note';
        return this.isEditMode ? 'Edit Note' : 'View Note';
    }

    async getData() {
        if (!this.isEditing) {
            await this._ensureDraftNote();
        }

        // Update window title
        if (this.isDraft || !this.isEditing) {
            this.options.title = 'New Note';
        } else {
            this.options.title = this.isEditMode ? 'Edit Note' : 'View Note';
        }

        // For existing notes, load the page document so we can pull fresh content
        if (this.isEditing && this.pageUuid && !this.page) {
            try {
                this.page = await foundry.utils.fromUuid(this.pageUuid);
                // Set object immediately when we have the page - this is critical for collab editor
                if (this.page) {
                    this.object = this.page;
                    
                    // Ensure text field exists and is properly structured
                    const hasTextObject = this.page?.text && typeof this.page.text === 'object';
                    const hasContentField = hasTextObject && ('content' in this.page.text);
                    
                    if (!hasTextObject || !hasContentField) {
                        // If text field doesn't exist or is malformed, try to ensure data is loaded
                        if (typeof this.page.prepareData === 'function') {
                            await this.page.prepareData();
                        }
                        // Re-check after prepareData
                        const hasTextObjectAfter = this.page?.text && typeof this.page.text === 'object';
                        const hasContentFieldAfter = hasTextObjectAfter && ('content' in this.page.text);
                        if (!hasTextObjectAfter || !hasContentFieldAfter) {
                            console.warn('Page text field not available or malformed, falling back to content string');
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading page for editor:', error);
                this.page = null;
            }
        }

        if (this.isEditing && this.page) {
            await this._syncEditLockState();
        }

        const tagsText = Array.isArray(this.note.tags)
            ? this.note.tags.join(', ')
            : (typeof this.note.tags === 'string' ? this.note.tags : '');
        // Extract pageContent first so we can use it for icon resolution
        let pageContent = this.note.content || '';
        if (this.isEditing && this.page) {
            const pageText = this.page.text;
            if (typeof pageText === 'string') {
                pageContent = pageText;
            } else if (pageText && typeof pageText === 'object' && 'content' in pageText) {
                if (typeof pageText.content === 'string') {
                    pageContent = pageText.content;
                } else if (pageText.content !== undefined) {
                    pageContent = String(pageText.content || '');
                }
            }
        }
        
        this.note.content = pageContent;
        const iconHtml = this.note.iconHtml ||
            (this.note.noteIcon ? buildNoteIconHtml(normalizeNoteIconFlag(this.note.noteIcon), 'window-note-header-image') : null) ||
            resolveNoteIconHtmlFromContent(pageContent, 'window-note-header-image');
        const editorIds = Array.isArray(this.note.editorIds) && this.note.editorIds.length
            ? this.note.editorIds
            : (this.note.authorId ? [this.note.authorId] : []);
        const uniqueEditorIds = [...new Set(editorIds)];
        const editorAvatars = uniqueEditorIds.map(id => {
            const user = game.users.get(id) || game.users.find(u => u.id === id);
            return {
                id,
                name: user?.name || id || 'Unknown',
                img: user?.avatar || user?.img || 'icons/svg/mystery-man.svg'
            };
        });

        // For collaborative editing, we need to ensure the page is properly loaded
        // The editor helper needs the page document with its text field
        // If page isn't available or text field is missing, fall back to content string
        let usePageForEditor = false;
        
        if (this.isEditing && this.page) {
            const pageText = this.page?.text;
            const hasTextObject = pageText && typeof pageText === 'object';
            const hasContentField = hasTextObject && ('content' in pageText);
            if (hasTextObject && hasContentField) {
                const contentValue = pageText.content;
                if (contentValue !== undefined && contentValue !== null && typeof contentValue === 'string') {
                    usePageForEditor = true;
                } else {
                    console.warn('Page text.content is not a valid string, falling back to content string', {
                        type: typeof contentValue,
                        value: contentValue
                    });
                }
            } else if (typeof pageText !== 'string') {
                console.warn('Page text field not available or wrong type, using content string instead', {
                    hasText: !!pageText,
                    textType: typeof pageText
                });
            }
        }

        // Collaborative editor requires the native JournalEntryPage sheet DOM.
        // Disable it in this custom window to avoid ProseMirror step errors.
        const allowCollabEditor = false;
        usePageForEditor = usePageForEditor && allowCollabEditor;
        if (!usePageForEditor) {
            this.object = this.note;
        }

        // Track whether we're using collaborative editor for defensive save logic
        this.usingCollabEditor = usePageForEditor && this.isEditMode;

        // Debug logging to verify document setup
        console.log("NotesForm getData", {
            isEditing: this.isEditing,
            isEditMode: this.isEditMode,
            hasPage: !!this.page,
            pageType: this.page?.constructor?.name,
            objectType: this.object?.constructor?.name,
            textType: typeof this.page?.text,
            contentType: typeof this.page?.text?.content,
            usePageForEditor: usePageForEditor
        });

        // Always provide content as fallback - editor will use page.text if available
        return {
            note: {
                ...this.note,
                tagsText,
                iconHtml,
                editorAvatars,
                sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name : null,
                content: pageContent // Use extracted content or fallback
            },
            editLock: this._editLock
                ? { ...this._editLock, isSelf: this._editLock.userId === game.user.id }
                : null,
            canEdit: !this._editLock || this._editLock.userId === game.user.id,
            isGM: game.user.isGM,
            isEditing: this.isEditing,
            isEditMode: this.isEditMode,
            isViewMode: this.isViewMode,
            sceneName: this.note.sceneId ? game.scenes.get(this.note.sceneId)?.name : null,
            page: usePageForEditor ? this.page : null // Only pass page if we can use it for collaborative editing
        };
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
            this._editLockExpiryTimeout = null;
        }
        const remaining = NOTE_EDIT_LOCK_TTL_MS - (Date.now() - lock.at);
        if (remaining <= 0) {
            this._handleEditLockExpiry();
            return;
        }
        this._editLockExpiryTimeout = setTimeout(() => {
            this._handleEditLockExpiry();
        }, remaining);
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
        this.render(true);
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

        const visibility = this.note?.visibility === 'party' ? 'party' : 'private';
        const tags = Array.isArray(this.note?.tags) ? this.note.tags : [];
        const sceneId = this.note?.sceneId || null;
        const x = this.note?.x ?? null;
        const y = this.note?.y ?? null;

        const pageData = {
            name: this.note?.title || 'Untitled Note',
            type: 'text',
            text: {
                content: this.note?.content || ''
            },
            flags: {
                [MODULE.ID]: {
                    noteType: 'sticky',
                    tags,
                    visibility,
                    editorIds: [game.user.id],
                    sceneId,
                    x: x !== undefined && x !== '' ? x : null,
                    y: y !== undefined && y !== '' ? y : null,
                    noteIcon: this.note?.noteIcon || null,
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
                this._draftCreating = false;
                return;
            }

            this.page = newPage;
            this.pageUuid = newPage.uuid;
            this.pageId = newPage.id;
            this.note.pageUuid = newPage.uuid;
            this.note.pageId = newPage.id;
            this.object = newPage;
            this.isEditing = true;
            this.isDraft = true;
            this.isViewMode = false;
            this.isEditMode = true;

            try {
                const hasPlacement = !!sceneId && x !== null && y !== null;
                const pinId = await createNotePinForPage(
                    newPage,
                    hasPlacement ? sceneId : undefined,
                    hasPlacement ? x : undefined,
                    hasPlacement ? y : undefined
                );
                if (pinId) {
                    await newPage.setFlag(MODULE.ID, 'pinId', pinId);
                    this.note.pinId = pinId;
                }
            } catch (error) {
                const message = String(error?.message || error || '');
                const proxyMessage = describePinsProxyError(message);
                if (proxyMessage) {
                    ui.notifications.error(proxyMessage);
                } else {
                    ui.notifications.warn('Draft note created, but pin creation failed.');
                }
            }
            await this._setEditLock(newPage);
        } catch (error) {
            console.error('Error creating draft note:', error);
            ui.notifications.error(`Failed to create draft note: ${error.message}`);
        } finally {
            this._draftCreated = true;
            this._draftCreating = false;
        }
    }

    async _deleteDraftNote() {
        if (!this.isDraft || !this.pageUuid) return;
        try {
            const page = this.page || await foundry.utils.fromUuid(this.pageUuid);
            if (page) {
                try {
                    await deleteNotePinForPage(page);
                } catch (error) {
                    console.warn('Failed to delete draft pin:', error);
                }
                await page.delete();
            }
        } catch (error) {
            console.warn('Failed to delete draft note:', error);
        }
    }

    _getDefaultNote() {
        return {
            title: '',
            content: '',
            authorName: game.user?.name || 'Unknown',
            timestamp: null,
            tags: [],
            visibility: 'private',
            sceneId: null,
            x: null,
            y: null,
            noteIcon: null,
            notePinSize: getDefaultNotePinDesign().size,
            notePinShape: getDefaultNotePinDesign().shape,
            notePinStyle: getDefaultNotePinDesign().style,
            notePinDropShadow: getDefaultNotePinDesign().dropShadow,
            notePinTextLayout: getDefaultNotePinDesign().textLayout,
            notePinTextDisplay: getDefaultNotePinDesign().textDisplay,
            notePinTextColor: getDefaultNotePinDesign().textColor,
            notePinTextSize: getDefaultNotePinDesign().textSize,
            notePinTextMaxLength: getDefaultNotePinDesign().textMaxLength,
            notePinTextScaleWithPin: getDefaultNotePinDesign().textScaleWithPin,
            editorIds: []
        };
    }

    _buildNoteOwnership(visibility, authorId) {
        return buildNoteOwnership(visibility, authorId);
    }

    async _syncNoteOwnership(page, visibility, authorId) {
        await syncNoteOwnership(page, visibility, authorId);
    }

    setPosition(options={}) {
        const minWidth = 550;
        const minHeight = 650;
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
                } else {
                    const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
                    if (visibilityRadio) {
                        visibility = visibilityRadio.value;
                    } else {
                        visibility = 'private';
                    }
                }
            } else {
                visibility = 'private';
            }
        }
        
        // Final check - ensure it's either 'party' or 'private'
        visibility = visibility === 'party' ? 'party' : 'private';

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
                    
                    // When using collaborative editing (collaborate=true), the editor updates the document directly
                    // However, we still update text.content defensively as a "last-write-wins" safety net
                    // This ensures changes aren't lost if collab binding fails or user closes without proper save
                    const updateData = {
                        name: formData.title || 'Untitled Note'
                    };
                    
                    // Only skip text.content update if we're definitely using collab editor
                    // Otherwise, update it defensively to prevent data loss
                    if (!this.usingCollabEditor) {
                        updateData['text.content'] = content;
                    }
                    
                    await page.update(updateData);
                    
                    // Update flags
                    await page.setFlag(MODULE.ID, 'tags', tags);
                    await page.setFlag(MODULE.ID, 'visibility', visibility);
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
                    let authorId = page.getFlag(MODULE.ID, 'authorId');
                    if (!authorId) {
                        authorId = game.user.id;
                        await page.setFlag(MODULE.ID, 'authorId', authorId);
                    }

                    const existingEditors = page.getFlag(MODULE.ID, 'editorIds') || [];
                    let editorIds = Array.isArray(existingEditors) ? [...new Set([...existingEditors, game.user.id])] : [game.user.id];
                    if (visibility === 'private') {
                        editorIds = [authorId];
                    }
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

                const normalizedIcon = normalizeNoteIconFlag(this.note.noteIcon) || getDefaultNoteIconFlag();
                this.note.noteIcon = normalizedIcon;

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
                };

                // Create journal page
                const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                page = newPage;

                // Verify the flag was saved correctly
                const savedVisibility = page.getFlag(MODULE.ID, 'visibility');

                const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
                await this._syncNoteOwnership(page, visibility, authorId);
            }

            // Create pin data for new notes (unplaced by default; placed if scene coords provided)
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
                    const message = String(error?.message || error || '');
                    const proxyMessage = describePinsProxyError(message);
                    if (proxyMessage) {
                        ui.notifications.error(proxyMessage);
                        return false;
                    }
                    if (message.toLowerCase().includes('permission denied')) {
                        const hasPagePermission = page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                        if (hasPagePermission) {
                            ui.notifications.error('Permission denied: Unable to create pin. The pin ownership may need to be synced. Try saving the note again or contact your GM.');
                        } else {
                            ui.notifications.error('Permission denied: You do not have Owner permission on this note.');
                        }
                    } else {
                        ui.notifications.warn('Could not create Blacksmith pin for this note.');
                    }
                }
            }

            const shouldPlace = this._placeAfterSave;
            this._placeAfterSave = false;
            ui.notifications.info(`Note "${formData.title || 'Untitled Note'}" ${this.isEditing ? 'updated' : 'saved'} successfully.`);
            this._didSubmit = true;
            await this._clearEditLock(this.page, game.user.id);
            await this.close();

            if (shouldPlace && page) {
                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                const notesPanel = panelManager?.notesPanel;
                if (notesPanel?._beginNotePinPlacement) {
                    await notesPanel._beginNotePinPlacement(page);
                } else {
                    ui.notifications.warn('Unable to place pin: Notes panel not available.');
                }
            }
            
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

    activateEditor(name, options = {}) {
        // For collaborative editing, ensure document and fieldName are explicitly provided
        if (this.usingCollabEditor && this.page && name === 'text.content') {
            options.document = this.page;
            options.fieldName = 'text.content';
        }
        return super.activateEditor(name, options);
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const headerIcon = nativeHtml.querySelector('.window-note-header-icon');
        if (headerIcon) {
            const handler = async () => {
                const pins = getPinsApi();
                let pinId = this.note?.pinId || this.page?.getFlag?.(MODULE.ID, 'pinId') || null;
                const sceneId = this.note?.sceneId || this.page?.getFlag?.(MODULE.ID, 'sceneId') || null;

                if (pins?.configure) {
                    const pinExists = pinId && (typeof pins.exists === 'function' ? pins.exists(pinId) : !!pins.get?.(pinId));
                    if (pinId && !pinExists && this.page) {
                        const recoveryPins = [];
                        if (typeof pins.list === 'function') {
                            if (sceneId) {
                                recoveryPins.push(...(pins.list({ moduleId: MODULE.ID, sceneId }) || []));
                            }
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
                    if (!pinId && this.page) {
                        try {
                            const createdPinId = await createNotePinForPage(this.page);
                            if (createdPinId) {
                                pinId = createdPinId;
                                await this.page.setFlag(MODULE.ID, 'pinId', createdPinId);
                            }
                        } catch (error) {
                            console.error('Failed to create unplaced pin:', error);
                            ui.notifications.error('Failed to create pin for this note.');
                            return;
                        }
                    }
                }

                if (pins?.configure && pinId) {
                    const verifiedPin = typeof pins.get === 'function'
                        ? pins.get(pinId)
                        : (typeof pins.exists === 'function' ? (pins.exists(pinId) ? pinId : null) : pinId);
                    if (!verifiedPin) {
                        ui.notifications.error('Pin not found. This looks like a pins API issue with unplaced pins. Try refreshing or placing the pin once on a scene.');
                        return;
                    }
                    const openConfig = async () => {
                        await pins.configure(pinId, {
                            sceneId: sceneId || undefined,
                            moduleId: MODULE.ID,
                            useAsDefault: true,
                            onSelect: async (config) => {
                                const icon = config?.icon || null;
                                this.note.noteIcon = icon;
                                this.note.notePinSize = normalizePinSize(config?.pinSize) || getDefaultNotePinDesign().size;
                                this.note.notePinStyle = normalizePinStyle(config?.pinStyle) || getDefaultNotePinDesign().style;
                                this.note.notePinShape = normalizePinShape(config?.pinShape) || getDefaultNotePinDesign().shape;
                                this.note.notePinDropShadow = typeof config?.pinDropShadow === 'boolean' ? config.pinDropShadow : getDefaultNotePinDesign().dropShadow;
                                this.note.notePinTextLayout = normalizePinTextLayout(config?.pinTextConfig?.textLayout) || getDefaultNotePinDesign().textLayout;
                                this.note.notePinTextDisplay = normalizePinTextDisplay(config?.pinTextConfig?.textDisplay) || getDefaultNotePinDesign().textDisplay;
                                this.note.notePinTextColor = normalizePinTextColor(config?.pinTextConfig?.textColor) || getDefaultNotePinDesign().textColor;
                                this.note.notePinTextSize = normalizePinTextSize(config?.pinTextConfig?.textSize) || getDefaultNotePinDesign().textSize;
                                this.note.notePinTextMaxLength = normalizePinTextMaxLength(config?.pinTextConfig?.textMaxLength) ?? getDefaultNotePinDesign().textMaxLength;
                                this.note.notePinTextScaleWithPin = normalizePinTextScaleWithPin(config?.pinTextConfig?.textScaleWithPin) ?? getDefaultNotePinDesign().textScaleWithPin;
                                this.note.iconHtml = buildNoteIconHtml(icon, 'window-note-header-image');
                                headerIcon.innerHTML = this.note.iconHtml;

                                if (this.isEditing && this.pageUuid) {
                                    const page = await foundry.utils.fromUuid(this.pageUuid);
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

                                    const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                                    if (panelManager?.notesPanel && panelManager.element) {
                                        await panelManager.notesPanel._refreshData();
                                        panelManager.notesPanel.render(panelManager.element);
                                    }
                                }
                            }
                        });
                    };
                    try {
                        await openConfig();
                        return;
                    } catch (error) {
                        const message = String(error?.message || error || '');
                        const isNotFound = message.toLowerCase().includes('pin not found');
                        const isPermission = message.toLowerCase().includes('permission denied');
                        if (isPermission && this.page && typeof pins.requestGM === 'function') {
                            try {
                                await pins.requestGM('update', {
                                    pinId,
                                    patch: { ownership: getNotePinOwnershipForPage(this.page) }
                                });
                                await openConfig();
                                return;
                            } catch (retryError) {
                                console.error('Failed to update pin ownership before configure:', retryError);
                            }
                        }
                        if (isNotFound && this.page) {
                            try {
                                await this.page.setFlag(MODULE.ID, 'pinId', null);
                                const recreatedId = await createNotePinForPage(this.page);
                                if (recreatedId) {
                                    pinId = recreatedId;
                                    await this.page.setFlag(MODULE.ID, 'pinId', recreatedId);
                                    await pins.configure(recreatedId, {
                                        sceneId: sceneId || undefined,
                                        moduleId: MODULE.ID,
                                        useAsDefault: true,
                                        onSelect: async (config) => {
                                            const icon = config?.icon || null;
                                            this.note.noteIcon = icon;
                                            this.note.notePinSize = normalizePinSize(config?.pinSize) || getDefaultNotePinDesign().size;
                                            this.note.notePinStyle = normalizePinStyle(config?.pinStyle) || getDefaultNotePinDesign().style;
                                            this.note.notePinShape = normalizePinShape(config?.pinShape) || getDefaultNotePinDesign().shape;
                                            this.note.notePinDropShadow = typeof config?.pinDropShadow === 'boolean' ? config.pinDropShadow : getDefaultNotePinDesign().dropShadow;
                                            this.note.notePinTextLayout = normalizePinTextLayout(config?.pinTextConfig?.textLayout) || getDefaultNotePinDesign().textLayout;
                                            this.note.notePinTextDisplay = normalizePinTextDisplay(config?.pinTextConfig?.textDisplay) || getDefaultNotePinDesign().textDisplay;
                                            this.note.notePinTextColor = normalizePinTextColor(config?.pinTextConfig?.textColor) || getDefaultNotePinDesign().textColor;
                                            this.note.notePinTextSize = normalizePinTextSize(config?.pinTextConfig?.textSize) || getDefaultNotePinDesign().textSize;
                                            this.note.notePinTextMaxLength = normalizePinTextMaxLength(config?.pinTextConfig?.textMaxLength) ?? getDefaultNotePinDesign().textMaxLength;
                                            this.note.notePinTextScaleWithPin = normalizePinTextScaleWithPin(config?.pinTextConfig?.textScaleWithPin) ?? getDefaultNotePinDesign().textScaleWithPin;
                                            this.note.iconHtml = buildNoteIconHtml(icon, 'window-note-header-image');
                                            headerIcon.innerHTML = this.note.iconHtml;

                                            if (this.isEditing && this.pageUuid) {
                                                const page = await foundry.utils.fromUuid(this.pageUuid);
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

                                                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                                                if (panelManager?.notesPanel && panelManager.element) {
                                                    await panelManager.notesPanel._refreshData();
                                                    panelManager.notesPanel.render(panelManager.element);
                                                }
                                            }
                                        }
                                    });
                                    return;
                                }
                            } catch (retryError) {
                                console.error('Failed to recover from missing pin:', retryError);
                            }
                        }

                        console.error('Failed to open pin configuration window:', error);
                        ui.notifications.error('Failed to open pin configuration window.');
                        return;
                    }
                }
                ui.notifications?.warn('Create a pin for this note before configuring its design.');
            };
            headerIcon.addEventListener('click', handler);
            this._eventHandlers.push({ element: headerIcon, event: 'click', handler });
        }


        const editToggle = nativeHtml.querySelector('#notes-edit-toggle');
        if (editToggle) {
            const handler = async (event) => {
                event.preventDefault();
                if (this.isEditMode) {
                    await this._captureFormState();
                    await this._clearEditLock(this.page, game.user.id);
                }
                this.isEditMode = !!event.currentTarget.checked;
                this.isViewMode = !this.isEditMode;
                this.render(true);
            };
            editToggle.addEventListener('change', handler);
            this._eventHandlers.push({ element: editToggle, event: 'change', handler });
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

        const savePlaceButton = nativeHtml.querySelector('button.notes-save-place-pin');
        if (savePlaceButton) {
            const handler = () => {
                this._placeAfterSave = true;
                const form = nativeHtml.querySelector('form');
                if (form) {
                    form.dataset.placePin = 'true';
                }
            };
            savePlaceButton.addEventListener('click', handler);
            this._eventHandlers.push({ element: savePlaceButton, event: 'click', handler });
        }

        if (this.isEditMode) {
            const touchHandler = () => {
                this._touchEditLock().catch(error => {
                    console.warn('Failed to refresh edit lock:', error);
                });
            };
            nativeHtml.addEventListener('keydown', touchHandler);
            nativeHtml.addEventListener('mousedown', touchHandler);
            nativeHtml.addEventListener('touchstart', touchHandler);
            this._eventHandlers.push({ element: nativeHtml, event: 'keydown', handler: touchHandler });
            this._eventHandlers.push({ element: nativeHtml, event: 'mousedown', handler: touchHandler });
            this._eventHandlers.push({ element: nativeHtml, event: 'touchstart', handler: touchHandler });
        }

        // Set up tag autocomplete (simple - just show existing tags)
        this._setupTagAutocomplete(nativeHtml);
    }

    async _captureFormState() {
        const nativeHtml = getNativeElement(this.element);
        const form = nativeHtml?.querySelector('form');
        if (!form) return;

        if (this._saveEditor) {
            await this._saveEditor('content');
        } else if (this._saveEditors) {
            await this._saveEditors();
        } else if (this.editors?.content?.save) {
            await this.editors.content.save();
        }

        const data = new FormData(form);
        const title = data.get('title');
        const content = data.get('content');
        const tagsText = data.get('tags');
        const visibilityToggle = form.querySelector('#notes-visibility-private');

        if (typeof title === 'string') {
            this.note.title = title;
        }
        if (typeof content === 'string') {
            this.note.content = content;
        }
        if (typeof tagsText === 'string') {
            this.note.tags = tagsText
                .split(',')
                .map(t => t.trim())
                .filter(t => t);
        }
        if (visibilityToggle) {
            this.note.visibility = visibilityToggle.checked ? 'private' : 'party';
        }
    }

    async _handleFormSubmit(event) {
        event.preventDefault();
        if (!this.isEditMode) return;

        const form = event.target.closest('form') || event.target;
        const submitter = event.submitter || form?.querySelector('button[type="submit"][data-place-pin=\"true\"]:focus');
        this._placeAfterSave = submitter?.dataset?.placePin === 'true' || submitter?.name === 'placePin';

        if (this._saveEditor) {
            await this._saveEditor('content');
        } else if (this._saveEditors) {
            await this._saveEditors();
        } else if (this.editors?.content?.save) {
            await this.editors.content.save();
        }
        const formData = submitter && typeof FormData === 'function'
            ? new FormData(form, submitter)
            : new FormData(form);
        
        // Convert FormData to object
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'placePin')) {
            this._placeAfterSave = String(data.placePin) === '1' || String(data.placePin).toLowerCase() === 'true';
        }
        if (!this._placeAfterSave && form?.dataset?.placePin === 'true') {
            this._placeAfterSave = true;
        }
        if (form?.dataset) {
            delete form.dataset.placePin;
        }

        const visibilityToggle = form.querySelector('#notes-visibility-private');
        if (visibilityToggle) {
            data.visibility = visibilityToggle.checked ? 'private' : 'party';
        } else {
            const visibilityRadio = form.querySelector('input[name="visibility"]:checked');
            if (visibilityRadio) {
                data.visibility = visibilityRadio.value;
            } else {
                const allRadios = form.querySelectorAll('input[name="visibility"]');
                data.visibility = 'private';
            }
        }

        // Debug: Log visibility value to help diagnose issues

        // Call _updateObject
        await this._updateObject(event, data);
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

        return super.close(options);
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
