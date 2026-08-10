/**
 * manager-pins.js — Unified Blacksmith Pins API manager for Coffee Pub Squire.
 *
 * This is the single point of contact between Squire and the Blacksmith Pins API.
 * All pin creation, deletion, updates, event routing, context menus, lifecycle
 * hooks, ownership, taxonomy registration, and migrations live here.
 *
 * Panels import from this file. They never access game.modules.get('coffee-pub-blacksmith')?.api?.pins directly.
 *
 * Flag contract: Squire stores ONLY `pinId` on journal pages.
 * Position (x, y, sceneId) and design are owned by Blacksmith — never cached in page flags.
 */

import { getCampaignPanel, refreshCampaignPanel, revealCampaignPanel } from './campaign-panels.js';
import { MODULE } from './const.js';
import { trackModuleTimeout } from './timer-utils.js';

// Initial design defaults per pin type. GM customises further via Configure Pin.
const PIN_DEFAULTS = {
    note: {
        size: { w: 60, h: 60 }, shape: 'circle',
        style: { fill: '#756c00', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: true, textLayout: 'under', textDisplay: 'always',
        textColor: '#ffffff', textSize: 18, textMaxLength: 0, textMaxWidth: 40,
        textScaleWithPin: true, lockProportions: true, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-pop-03' },
            click:       { animation: 'scale-small', sound: 'book-flip-01'     },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'     },
            add:         { animation: null,          sound: 'interface-pop-02' },
            delete:      { animation: 'dissolve',    sound: 'interface-error-05' }
        },
        config: { blacksmithAccess: 'private', blacksmithVisibility: 'visible' }
    }
};

// ============================================================================
// TAXONOMY
// ============================================================================

const SQUIRE_PIN_TAXONOMY_KIND = Object.freeze({
    note: 'note'
});

const LEGACY_SQUIRE_PIN_TYPE = Object.freeze({
    note: 'note-pin'
});

// Legacy type strings → canonical keys (for migration reads only).
const SQUIRE_PIN_TYPE_FIX_MAP = Object.freeze({
    ...Object.fromEntries(
        Object.entries(LEGACY_SQUIRE_PIN_TYPE).map(([k, wrong]) => [wrong, SQUIRE_PIN_TAXONOMY_KIND[k]])
    ),
    'Note Pin':     'note',
    'coffee-pub-squire-sticky-notes': 'note'
});

const NOTE_PIN_ICON  = 'fa-note-sticky';


// ============================================================================
// API HELPERS (exported — used by panels that call pins API indirectly)
// ============================================================================

/** Return the Blacksmith Pins API, or undefined if unavailable. */
export function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins;
}

/**
 * Return true if the Pins API is loaded and available.
 * @param {object} [pins] - Optional cached reference; falls back to getPinsApi().
 */
export function isPinsApiAvailable(pins) {
    const api = pins ?? getPinsApi();
    return typeof api?.isAvailable === 'function' && api.isAvailable();
}

/**
 * Return the canonical `pin.type` key for a Squire pin kind.
 * @param {'note'} kind
 */
export function getSquirePinType(kind) {
    return SQUIRE_PIN_TAXONOMY_KIND[kind] ?? kind;
}

/**
 * True if `pinType` matches the canonical or legacy type for `kind`.
 * @param {string|null|undefined} pinType
 * @param {'note'} kind
 */
export function isSquirePinCategory(pinType, kind) {
    if (!pinType || typeof pinType !== 'string') return false;
    return pinType === getSquirePinType(kind) || pinType === LEGACY_SQUIRE_PIN_TYPE[kind];
}

// ============================================================================
// LIST HELPERS
// ============================================================================

/**
 * List Squire pins matching a kind (canonical + legacy type), deduped by id.
 * @param {object} pins - Pins API instance
 * @param {'note'} kind
 * @param {{ unplacedOnly?: boolean, sceneId?: string }} [opts]
 */
export function listSquirePinsByKind(pins, kind, opts = {}) {
    if (!pins?.list) return [];
    const base     = { moduleId: MODULE.ID, ...opts };
    const canonical = getSquirePinType(kind);
    const legacy    = LEGACY_SQUIRE_PIN_TYPE[kind];
    const primary   = pins.list({ ...base, type: canonical }) || [];
    const secondary = legacy && legacy !== canonical
        ? (pins.list({ ...base, type: legacy }) || [])
        : [];
    const byId = new Map();
    for (const p of [...primary, ...secondary]) {
        if (p?.id) byId.set(p.id, p);
    }
    return [...byId.values()];
}

// ============================================================================
// OWNERSHIP BUILDERS
// ============================================================================

/**
 * Build pin ownership for a note based on its visibility setting.
 * @param {'party'|'private'|string} visibility
 * @param {string} authorId - User ID of note author
 */
export function buildNoteOwnership(visibility, authorId) {
    const users = {};
    if (visibility === 'party') {
        game.users.forEach(user => {
            if (!user.isGM) users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        });
        if (authorId && !users[authorId]) users[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    } else if (authorId) {
        users[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
    game.users.forEach(user => {
        if (user.isGM) users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
    return {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users
    };
}

// ============================================================================
// PRIVATE DESIGN HELPERS
// ============================================================================

/**
 * Get the GM's saved design for a type via Configure Pin "Default for [type]".
 * Returns {} if unavailable (strips id/type/moduleId to avoid polluting PinData).
 */
function _getPinTypeDefaultDesign(pins, kind) {
    if (!isPinsApiAvailable(pins) || typeof pins.getDefaultPinDesign !== 'function') return {};
    try {
        const raw = pins.getDefaultPinDesign(MODULE.ID, getSquirePinType(kind)) || {};
        if (!raw || typeof raw !== 'object') return {};
        const { type: _t, id: _i, moduleId: _m, ...rest } = raw;
        return rest;
    } catch (_) { return {}; }
}

/** Apply extra PinData keys from type defaults (animations, allowDuplicates, etc.). */
function _applyPinTypeDefaultExtras(pinData, pinTypeDefault) {
    if (!pinTypeDefault || typeof pinTypeDefault !== 'object') return;
    for (const key of ['eventAnimations', 'allowDuplicatePins', 'lockProportions', 'iconText']) {
        if (pinTypeDefault[key] !== undefined) {
            pinData[key] = foundry.utils.deepClone(pinTypeDefault[key]);
        }
    }
}

/**
 * Merge the Squire initial defaults (PIN_DEFAULTS) with the GM's saved
 * Configure Pin defaults for a given kind. Never mutates the JSON defaults.
 * @param {object} pins
 * @param {'note'} kind
 */
function _buildMergedDesign(pins, kind) {
    const typeDefault = _getPinTypeDefaultDesign(pins, kind);
    return foundry.utils.mergeObject(
        foundry.utils.deepClone(PIN_DEFAULTS[kind] ?? {}),
        typeDefault,
        { inplace: false }
    );
}

/** Validate and clamp a PinData size object. */
function _safeSize(size, fallback) {
    if (size && typeof size.w === 'number' && typeof size.h === 'number') return size;
    return fallback;
}

/** Resolve live taxonomy tags for a pin kind; returns null if unavailable. */
function _getModuleTaxonomyTags(kind) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.getModuleTaxonomy !== 'function') return null;
    return pins.getModuleTaxonomy(MODULE.ID)?.[getSquirePinType(kind)]?.tags ?? null;
}

/** Resolve the note pin image value from page content or noteIcon flag. */
function _resolveNotePinImage(page) {
    const content = page?.text?.content || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch?.[1]) {
        const src = imgMatch[1].trim();
        if (src) return src.startsWith('modules/') ? `/${src}` : src;
    }
    const iconFlag = page?.getFlag(MODULE.ID, 'noteIcon');
    if (!iconFlag) return `fa-solid ${NOTE_PIN_ICON}`;
    if (typeof iconFlag === 'object' && iconFlag.type === 'fa' && iconFlag.value) {
        return String(iconFlag.value).trim();
    }
    if (typeof iconFlag === 'object' && iconFlag.type === 'img' && iconFlag.value) {
        return iconFlag.value;
    }
    if (typeof iconFlag === 'string') {
        const t = iconFlag.trim();
        if (t.includes('fa-')) return t.startsWith('<i') ? (t.match(/class=["']([^"']+)["']/i)?.[1] || t) : t;
        return t;
    }
    return `fa-solid ${NOTE_PIN_ICON}`;
}

/** Resolve note pin tags from page visibility flag, validated against taxonomy. */
function _resolveNotePinTags(page) {
    const pins = getPinsApi();
    const taxonomyTags = (isPinsApiAvailable(pins) && typeof pins.getModuleTaxonomy === 'function')
        ? (pins.getModuleTaxonomy(MODULE.ID)?.[getSquirePinType('note')]?.tags ?? null)
        : null;
    const tag = page.getFlag(MODULE.ID, 'visibility') === 'party' ? 'party' : 'personal';
    if (!taxonomyTags) return [tag];
    return taxonomyTags.includes(tag) ? [tag] : (taxonomyTags.length ? [taxonomyTags[0]] : [tag]);
}

// ============================================================================
// NOTE PINS
// ============================================================================

function _isPermissionDeniedError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('permission denied') || msg.includes('lacks permission') || msg.includes('permission to update setting');
}

/**
 * Create a note pin for a journal page, with optional immediate placement.
 * @param {JournalEntryPage} page
 * @param {string}  [sceneId]
 * @param {number}  [x]
 * @param {number}  [y]
 * @returns {Promise<string|null>} The pinId created, or null on failure.
 */
export async function createNotePin(page, sceneId, x, y) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) throw new Error('Pins API not available.');
    if (!game.user.isGM && !page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
        throw new Error('Permission denied: You do not have Owner permission on this note.');
    }

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement && typeof pins.whenReady === 'function') await pins.whenReady();

    // If a pin already exists for this page, delete it before creating a new placed pin.
    const existingPinId = page.getFlag(MODULE.ID, 'pinId');
    if (existingPinId) {
        const pinExists = typeof pins.exists === 'function' ? pins.exists(existingPinId) : !!pins.get?.(existingPinId);
        if (!pinExists) {
            await page.setFlag(MODULE.ID, 'pinId', null);
        } else if (!hasPlacement) {
            // No coordinates — return existing pinId as-is (already placed or unplaced).
            return existingPinId;
        } else {
            // Delete the existing pin so we can create a fresh placed one.
            const existingPin = pins.get?.(existingPinId) || null;
            try {
                await pins.delete(existingPinId, existingPin?.sceneId ? { sceneId: existingPin.sceneId } : undefined);
            } catch (err) {
                console.warn('Coffee Pub Squire | createNotePin: failed to delete existing pin before re-place:', err);
            }
            await page.setFlag(MODULE.ID, 'pinId', null);
        }
    }

    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId   = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
    const design     = _buildMergedDesign(pins, 'note');

    const pinPayload = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('note'),
        tags:            _resolveNotePinTags(page),
        image:           _resolveNotePinImage(page),
        text:            page.name || '',
        size:            _safeSize(design.size, PIN_DEFAULTS.note.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.note.style,
        dropShadow:      design.dropShadow ?? true,
        textLayout:      design.textLayout ?? 'under',
        textDisplay:     design.textDisplay ?? 'always',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 12,
        textMaxLength:   design.textMaxLength ?? 0,
        textMaxWidth:    design.textMaxWidth ?? 0,
        textScaleWithPin:design.textScaleWithPin ?? true,
        lockProportions: design.lockProportions ?? true,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.note.eventAnimations),
        ownership:       buildNoteOwnership(visibility, authorId),
        config: {
            blacksmithAccess:     PIN_DEFAULTS.note.config.blacksmithAccess,
            blacksmithVisibility: 'visible',
            noteUuid:   page.uuid,
            visibility,
            authorId
        }
    };
    _applyPinTypeDefaultExtras(pinPayload, _getPinTypeDefaultDesign(pins, 'note'));
    if (hasPlacement) { pinPayload.x = x; pinPayload.y = y; }

    let pinData;
    try {
        pinData = await pins.create(pinPayload, hasPlacement ? { sceneId } : undefined);
    } catch (error) {
        if (!game.user.isGM && _isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
            pinData = await pins.requestGM('create', { payload: pinPayload, ...(hasPlacement ? { sceneId } : {}) });
        } else { throw error; }
    }

    if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
    if (pinData?.id) await page.setFlag(MODULE.ID, 'pinId', pinData.id);
    return pinData?.id || null;
}

/**
 * Delete a note pin completely (data + canvas).
 * @param {JournalEntryPage} page
 */
export async function deleteNotePin(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const pinId = page.getFlag(MODULE.ID, 'pinId');
    const deleteById = async (id) => {
        try {
            await pins.delete(id);
        } catch (error) {
            if (!game.user.isGM && _isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
                await pins.requestGM('delete', { pinId: id });
            } else { throw error; }
        }
    };

    if (pinId) {
        await deleteById(pinId);
    } else if (pins.list) {
        const matches = [
            ...listSquirePinsByKind(pins, 'note', {}),
            ...listSquirePinsByKind(pins, 'note', { unplacedOnly: true })
        ].filter(p => p?.config?.noteUuid === page.uuid);
        for (const pin of matches) {
            if (pin?.id) await deleteById(pin.id);
        }
    }
    // Trigger reload if we know which scene (best effort via findScene, fall back to current).
    const currentScene = canvas?.scene?.id;
    if (currentScene && typeof pins.reload === 'function') await pins.reload({ sceneId: currentScene });
}

/**
 * Unplace a note pin from the canvas (data kept, can be re-placed).
 * @param {JournalEntryPage} page
 */
export async function unplaceNotePin(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const pinId = page.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;

    const doUnplace = async () => {
        if (typeof pins.unplace === 'function') await pins.unplace(pinId);
        else if (typeof pins.update === 'function') await pins.update(pinId, { unplace: true });
    };
    try {
        await doUnplace();
    } catch (error) {
        if (!game.user.isGM && _isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
            await pins.requestGM('unplace', { pinId });
        } else { throw error; }
    }
    if (canvas?.scene?.id && typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
}

/**
 * Update a note pin's non-design fields: text, image, tags, ownership, config.
 * Does NOT update size/style/shape/colors — Blacksmith owns those after initial create.
 * @param {JournalEntryPage} page
 */
export async function updateNotePin(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !pins.update) return;
    const pinId = page.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;

    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId   = page.getFlag(MODULE.ID, 'authorId') || game.user.id;

    const patch = {
        text:      page.name || '',
        image:     _resolveNotePinImage(page),
        tags:      _resolveNotePinTags(page),
        type:      getSquirePinType('note'),
        ownership: buildNoteOwnership(visibility, authorId),
        config: {
            noteUuid: page.uuid,
            visibility,
            authorId
        }
    };

    try {
        const updated = await pins.update(pinId, patch);
        if (updated === null) {
            const pinExists = typeof pins.exists === 'function' ? pins.exists(pinId) : !!pins.get?.(pinId);
            if (!pinExists) await page.setFlag(MODULE.ID, 'pinId', null);
        }
    } catch (error) {
        if (!game.user.isGM && _isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
            await pins.requestGM('update', { pinId, patch });
        } else { throw error; }
    }
}

/**
 * Sync journal page ownership to match note pin visibility.
 * Delegates to GM via socket if caller is a player.
 * @param {JournalEntryPage} page
 * @param {'party'|'private'|string} visibility
 * @param {string} authorId
 */
export async function syncNoteOwnership(page, visibility, authorId) {
    if (!page) return;
    if (game.user.isGM) {
        const built = buildNoteOwnership(visibility, authorId);
        const ownership = { default: built.default, ...built.users };
        await page.update({ ownership });
        return;
    }
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (blacksmith?.sockets?.emit) {
        await blacksmith.sockets.emit('squire:updateNoteOwnership', { pageUuid: page.uuid, visibility, authorId });
    } else {
        ui.notifications.warn('Socket manager is not ready. Ownership sync will occur when a GM saves.');
    }
}

/**
 * Pan the canvas to a pin and ping it.
 *
 * Panels must not reach for
 * `pins.panTo` themselves; this file is the only place that touches the pins API.
 *
 * Verifies the pin is on the scene being viewed rather than trusting the caller.
 * Callers gate their button on `pinOnActiveScene`, but that is computed when the
 * panel last refreshed — change scene without a refresh and the button goes stale.
 * Acting on it would pan the CURRENT canvas to another scene's coordinates: a
 * viewport jump to nothing, with a ping on empty ground.
 *
 * @param {string} pinId
 * @returns {Promise<boolean>} false when the pin is unavailable or elsewhere
 */
export async function panToPin(pinId) {
    if (!pinId) return false;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.panTo !== 'function') {
        ui.notifications.warn('Canvas pins are not available.');
        return false;
    }

    const pin = pins.get?.(pinId) ?? null;
    if (!pin) {
        ui.notifications.warn('That pin no longer exists.');
        return false;
    }
    if (!pin.sceneId) {
        ui.notifications.info('That pin is not placed on any scene.');
        return false;
    }
    if (pin.sceneId !== canvas?.scene?.id) {
        const sceneName = game.scenes?.get(pin.sceneId)?.name || 'another scene';
        ui.notifications.info(`Pinned on ${sceneName} — open that scene to see it.`);
        return false;
    }

    try {
        await pins.panTo(pinId, { ping: { animation: 'ping', sound: 'interface-ping-01' } });
        return true;
    } catch (error) {
        console.warn('Coffee Pub Squire | panToPin:', error);
        return false;
    }
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate Squire note pins that pre-date the canonical `type: 'note'` key.
 * Also rewrites legacy moduleId strings. GM-only.
 */
export async function migrateSquireNotePinTypes() {
    const result = { checked: 0, updated: 0, failed: 0 };
    if (!game.user?.isGM) return result;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.list !== 'function' || typeof pins.update !== 'function') return result;

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
    } catch (e) {
        console.warn('Coffee Pub Squire | migrateSquireNotePinTypes: pins API not ready', e);
        return result;
    }

    const canonicalType = getSquirePinType('note');
    const legacyNoteTypes = new Set(
        Object.entries(SQUIRE_PIN_TYPE_FIX_MAP)
            .filter(([, mapped]) => mapped === canonicalType)
            .map(([legacyType]) => legacyType)
    );
    const seen = new Set();
    const reloadedSceneIds = new Set();

    const migratePin = async (pin, sceneId = null) => {
        if (!pin?.id) return;
        const key = `${sceneId ?? 'unplaced'}:${pin.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.checked++;
        const isSquireNotePin = !!pin?.config?.noteUuid
            && (pin?.moduleId === MODULE.ID || pin?.type === canonicalType || legacyNoteTypes.has(pin?.type));
        if (!isSquireNotePin) return;
        const patch = {};
        if (pin.moduleId !== MODULE.ID) patch.moduleId = MODULE.ID;
        if (pin.type !== canonicalType && legacyNoteTypes.has(pin.type)) patch.type = canonicalType;
        if (!Object.keys(patch).length) return;
        try {
            await pins.update(pin.id, patch, sceneId ? { sceneId } : undefined);
            result.updated++;
            if (sceneId) reloadedSceneIds.add(sceneId);
        } catch (e) {
            result.failed++;
            console.warn('Coffee Pub Squire | migrateSquireNotePinTypes:', e);
        }
    };

    for (const pin of pins.list({ unplacedOnly: true }) || []) await migratePin(pin);
    for (const scene of game.scenes?.contents || []) {
        if (!scene?.id) continue;
        for (const pin of pins.list({ sceneId: scene.id }) || []) await migratePin(pin, scene.id);
    }
    for (const sceneId of reloadedSceneIds) {
        try { await pins.reload?.({ sceneId }); } catch (_) {}
    }
    if (result.updated || result.failed) {
        console.info(`Coffee Pub Squire | Note pin taxonomy migration: checked ${result.checked}, updated ${result.updated}, failed ${result.failed}.`);
    }
    return result;
}

// ============================================================================
// LIFECYCLE — EVENT HANDLERS & CONTEXT MENUS (internal)
// ============================================================================

let _pinManagerController = null;
let _contextMenuDisposers = [];
let _resolveOwnershipHookId = null;
let _pinManagerInitialized = false;

let _notesSyncPending = false;
let _notesSyncTimer   = null;

function _scheduleNotesPanelRefresh(cleanupMissingPins = false) {
    _notesSyncPending = true;
    if (_notesSyncTimer) clearTimeout(_notesSyncTimer);
    _notesSyncTimer = trackModuleTimeout(async () => {
        _notesSyncTimer = null;
        if (!_notesSyncPending) return;
        _notesSyncPending = false;
        const panel = getCampaignPanel('notes');
        if (!panel) return;
        if (cleanupMissingPins && typeof panel._cleanupMissingPins === 'function') {
            await panel._cleanupMissingPins();
        } else {
            await refreshCampaignPanel('notes');
        }
    }, 75);
}

function _registerContextMenuItems(pins) {
    if (!pins?.registerContextMenuItem) return;
    _contextMenuDisposers.forEach(d => { try { if (typeof d === 'function') d(); } catch (_) {} });
    _contextMenuDisposers = [];

    // --- Note context menu items ---
    const makeNoteOpenHandler = (viewMode) => async (pin) => {
        const noteUuid = pin?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await fromUuid(noteUuid);
        if (!page) { ui.notifications.error('Note not found.'); return; }
        if (!viewMode && !page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
            ui.notifications.warn('You do not have permission to edit this note.');
            return;
        }
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (typeof blacksmith?.openWindow === 'function') {
            blacksmith.openWindow(`${MODULE.ID}-note-window`, { page, pageUuid: page.uuid, pageId: page.id, viewMode });
        }
    };

    _contextMenuDisposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-view-note`, {
            name: 'View Note',
            icon: '<i class="fa-solid fa-eye"></i>',
            moduleId: MODULE.ID,
            order: 10,
            visible: (pin) => pin?.moduleId === MODULE.ID && (isSquirePinCategory(pin?.type, 'note') || !!pin?.config?.noteUuid),
            onClick: makeNoteOpenHandler(true)
        }),

        pins.registerContextMenuItem(`${MODULE.ID}-edit-note`, {
            name: 'Edit Note',
            icon: '<i class="fa-solid fa-pen"></i>',
            moduleId: MODULE.ID,
            order: 20,
            visible: (pin) => pin?.moduleId === MODULE.ID && (isSquirePinCategory(pin?.type, 'note') || !!pin?.config?.noteUuid),
            onClick: makeNoteOpenHandler(false)
        }),

        pins.registerContextMenuItem(`${MODULE.ID}-delete-note`, {
            name: 'Delete Note',
            icon: '<i class="fa-solid fa-trash"></i>',
            moduleId: MODULE.ID,
            order: 40,
            visible: (pin) => pin?.moduleId === MODULE.ID && (isSquirePinCategory(pin?.type, 'note') || !!pin?.config?.noteUuid),
            onClick: async (pin) => {
                const noteUuid = pin?.config?.noteUuid;
                if (!noteUuid) return;
                const page = await fromUuid(noteUuid);
                if (!page) { ui.notifications.error('Note not found.'); return; }
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    ui.notifications.warn('You do not have permission to delete this note.');
                    return;
                }
                const dialog = game.modules.get('coffee-pub-blacksmith')?.api?.dialog;
                if (!dialog) throw new Error('Coffee Pub Squire | Blacksmith api.dialog is unavailable');
                const confirmed = await dialog.confirm({
                    title: 'Delete Note',
                    content: '<p>Delete this note?</p>',
                    confirmLabel: 'Delete Note',
                    confirmIcon: 'fa-solid fa-trash',
                    destructive: true
                });
                if (!confirmed) return;
                await deleteNotePin(page);
                await page.delete();
                _scheduleNotesPanelRefresh();
            }
        })
    );
}

function _registerEventHandlers(pins) {
    if (!pins?.on) return;
    const signal = _pinManagerController.signal;

    // Register type friendly names
    if (typeof pins.registerPinType === 'function') {
        try {
            pins.registerPinType(MODULE.ID, getSquirePinType('note'),      'Note Pin');
        } catch (_) {}
    }

    // Note — click opens note card; doubleClick opens note window
    pins.on('click', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        // showNote() reveals the panel itself, so don't reveal here as well —
        // that renders the panel twice for one click.
        await revealCampaignPanel('notes');
        const notesPanel = getCampaignPanel('notes');
        if (!notesPanel?.showNote) return;
        await notesPanel.showNote(noteUuid);
        const tryFocus = () => {
            const row = document.querySelector(`.note-row[data-note-uuid="${noteUuid}"]`);
            if (!row) return false;
            row.classList.add('note-row-highlight');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            trackModuleTimeout(() => row.classList.remove('note-row-highlight'), 3200);
            return true;
        };
        tryFocus();
        trackModuleTimeout(tryFocus, 200);
        trackModuleTimeout(tryFocus, 500);
        trackModuleTimeout(tryFocus, 1000);
    }, { moduleId: MODULE.ID, signal });

    pins.on('doubleClick', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await fromUuid(noteUuid);
        if (!page) return;
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (typeof blacksmith?.openWindow === 'function') {
            blacksmith.openWindow(`${MODULE.ID}-note-window`, { page, pageUuid: page.uuid, pageId: page.id, viewMode: true });
        }
    }, { moduleId: MODULE.ID, signal });

    // ---- Lifecycle events -------------------------------------------------------

    // deleted: clear the pinId flag from the note page it belonged to.
    pins.on('deleted', (evt) => {
        const noteUuid = evt.pin?.config?.noteUuid ?? evt.config?.noteUuid;
        if (!noteUuid) return;
        fromUuid(noteUuid).then(page => {
            if (!page) return;
            if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
            const storedId = page.getFlag(MODULE.ID, 'pinId');
            if (evt.pinId && storedId !== evt.pinId) return;
            page.setFlag(MODULE.ID, 'pinId', null).then(() => _scheduleNotesPanelRefresh());
        });
    }, { moduleId: MODULE.ID, signal });

    // unplaced: refresh the notes panel.
    pins.on('unplaced', (evt) => {
        if (evt.pin?.config?.noteUuid) _scheduleNotesPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // placed / updated / created: notes write their own pinId flag in
    // createNotePin, and Blacksmith owns note pin design, so there is nothing
    // for this module to do on those events any more.

    // bulk deletes: refresh the notes panel.
    pins.on('deletedAll',       () => _scheduleNotesPanelRefresh(true), { moduleId: MODULE.ID, signal });
    pins.on('deletedAllByType', () => _scheduleNotesPanelRefresh(true), { moduleId: MODULE.ID, signal });
}

// ============================================================================
// TAXONOMY REGISTRATION
// ============================================================================

async function _registerTaxonomy(pins) {
    if (!isPinsApiAvailable(pins) || typeof pins.registerPinTaxonomy !== 'function') return;
    try {
        pins.registerPinTaxonomy(MODULE.ID, getSquirePinType('note'),      { label: 'Note',        tags: ['personal', 'party', 'gm-notes', 'reminder'] });
    } catch (e) {
        console.warn('Coffee Pub Squire | registerPinTaxonomy failed:', e);
    }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the pin manager. Call once in the Foundry `ready` hook.
 * Registers taxonomy, event handlers, context menus, and lifecycle hooks.
 */
export async function initPinManager() {
    if (_pinManagerInitialized) return;

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        console.warn('Coffee Pub Squire | Pin manager init deferred: Blacksmith pins API not available.');
        return;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
    } catch (e) {
        console.warn('Coffee Pub Squire | pins.whenReady() failed during initPinManager:', e);
    }

    _pinManagerController = new AbortController();

    await _registerTaxonomy(pins);
    _registerEventHandlers(pins);
    _registerContextMenuItems(pins);

    // Ownership resolver — Blacksmith asks Squire for note pin ownership.
    // Guarded + tracked so disable→re-enable cycles don't register duplicates.
    if (!_resolveOwnershipHookId) {
        _resolveOwnershipHookId = Hooks.on('blacksmith.pins.resolveOwnership', (context) => {
            if (!context || context.moduleId !== MODULE.ID) return null;
            const visibility = context.metadata?.visibility || 'private';
            const authorId   = context.metadata?.authorId   || game.user?.id;
            return buildNoteOwnership(visibility, authorId);
        });
    }

    _pinManagerInitialized = true;
    console.info('Coffee Pub Squire | Pin manager initialized.');
}

/**
 * Tear down the pin manager. Call from module cleanup / disable hooks.
 * Aborts all pin event handlers and disposes context menu items.
 */
export function teardownPinManager() {
    if (_pinManagerController) {
        _pinManagerController.abort();
        _pinManagerController = null;
    }

    _contextMenuDisposers.forEach(d => { try { if (typeof d === 'function') d(); } catch (_) {} });
    _contextMenuDisposers = [];

    // All pins.on() lifecycle handlers are cleaned up by the AbortController above.

    if (_resolveOwnershipHookId !== null) {
        try { Hooks.off('blacksmith.pins.resolveOwnership', _resolveOwnershipHookId); } catch (_) {}
        _resolveOwnershipHookId = null;
    }

    if (_notesSyncTimer) { clearTimeout(_notesSyncTimer); _notesSyncTimer = null; }
    _notesSyncPending = false;

    _pinManagerInitialized = false;
    console.info('Coffee Pub Squire | Pin manager torn down.');
}
