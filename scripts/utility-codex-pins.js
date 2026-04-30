/**
 * Codex Pin Utilities – Blacksmith Pins API integration
 *
 * Create, update, delete, and sync codex pins. One pin per codex entry,
 * stored as `codexPinId` / `codexSceneId` flags on the journal page.
 * Ownership mirrors the entry's current visibility (OBSERVER or NONE).
 *
 * Visual design: Squire baseline → Blacksmith type default (Configure Pin
 * "Default for codex") overrides field-by-field when present.
 */

import { MODULE } from './const.js';
import {
    getPinsApi,
    isPinsApiAvailable,
    getSquirePinType,
    listSquirePinsByKind,
    enforceSquirePinTaxonomyType
} from './utility-quest-pins.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODEX_PIN_CURSOR_CLASS        = 'squire-quest-pin-placement';
const CODEX_PIN_CANVAS_CURSOR_CLASS = 'squire-quest-pin-placement-canvas';

const CODEX_PIN_SIZE = { w: 50, h: 50 };
const CODEX_PIN_BACKGROUND = '#022450';
const CODEX_PIN_BORDER_COLOR = '#ffffff';
const CODEX_PIN_BORDER_WIDTH = 4;

/** Squire baseline for codex pins; Blacksmith type defaults override field-by-field. */
const SQUIRE_CODEX_PIN_DEFAULTS = {
    size:             CODEX_PIN_SIZE,
    shape:            'circle',
    dropShadow:       false,
    textLayout:       'right',
    textDisplay:      'hover',
    textColor:        '#ffffff',
    textSize:         12,
    textMaxLength:    0,
    textMaxWidth:     30,
    textScaleWithPin: true,
    lockProportions:  false,
    allowDuplicatePins: false,
    eventAnimations: {
        hover:       { animation: 'ripple',      sound: 'interface-pop-01' },
        click:       { animation: 'scale-small', sound: 'book-open-02' },
        doubleClick: { animation: null,           sound: null },
        add:         { animation: null,           sound: null },
        delete:      { animation: 'fade',         sound: 'interface-error-01' }
    }
};

/** Codex panel category display name → taxonomy tag key (application mapping logic). */
const CODEX_CATEGORY_TAG_MAP = {
    'Artifacts':  'artifact',
    'Books':      'book',
    'Characters': 'character',
    'Events':     'event',
    'Factions':   'faction',
    'Locations':  'location',
    'Items':      'item',
    'Maps':       'map'
};

/** Codex panel category → FontAwesome icon class. Matches CodexPanel.getCategoryIcon(). */
const CODEX_CATEGORY_ICON_MAP = {
    'No Category': 'fa-question-circle',
    'Artifacts':   'fa-gem',
    'Books':       'fa-book',
    'Characters':  'fa-user',
    'Events':      'fa-calendar-star',
    'Factions':    'fa-shield-cross',
    'Items':       'fa-box',
    'Locations':   'fa-location-pin',
    'Maps':        'fa-map'
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getModuleTaxonomyTags(type) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.getModuleTaxonomy !== 'function') return null;
    return pins.getModuleTaxonomy(MODULE.ID)?.[type]?.tags ?? null;
}

function getPinTypeDefault(pins, pinType) {
    if (!isPinsApiAvailable(pins) || typeof pins.getDefaultPinDesign !== 'function') return {};
    try {
        const raw = pins.getDefaultPinDesign(MODULE.ID, pinType) || {};
        if (!raw || typeof raw !== 'object') return {};
        const { type: _t, id: _i, moduleId: _m, ...rest } = raw;
        return rest;
    } catch (_) {
        return {};
    }
}

const PIN_TYPE_DEFAULT_EXTRA_KEYS = ['eventAnimations', 'allowDuplicatePins', 'lockProportions', 'iconText'];

function applyPinTypeDefaultExtras(pinData, pinTypeDefault) {
    if (!pinTypeDefault || typeof pinTypeDefault !== 'object') return;
    for (const key of PIN_TYPE_DEFAULT_EXTRA_KEYS) {
        if (pinTypeDefault[key] !== undefined) {
            pinData[key] = foundry.utils.deepClone(pinTypeDefault[key]);
        }
    }
}

/**
 * Category string → pin image HTML (FA icon from the category icon map).
 * @param {string} category
 * @returns {string}
 */
function getCodexPinImage(category) {
    const icon = CODEX_CATEGORY_ICON_MAP[category] || 'fa-book';
    return `<i class="fa-solid ${icon}"></i>`;
}

/**
 * Derive pin taxonomy tags from a codex category, validated against live taxonomy.
 * @param {string}        category     - Codex category display name (e.g. 'Characters')
 * @param {string[]|null} taxonomyTags - Live tags from getModuleTaxonomyTags(); null = fallback
 * @returns {string[]}
 */
function codexCategoryToPinTags(category, taxonomyTags) {
    const tag = CODEX_CATEGORY_TAG_MAP[category] ?? null;
    if (!taxonomyTags) return tag ? [tag] : [];
    if (tag && taxonomyTags.includes(tag)) return [tag];
    return [];
}

/**
 * Ownership for a codex pin: mirrors the entry's current visibility setting.
 * @param {JournalEntryPage} page
 * @returns {object}
 */
function calculateCodexPinOwnership(page) {
    const isVisible = (page?.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
    return {
        default: isVisible ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users: gmUsers
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a codex pin (unplaced, or immediately placed on a scene).
 * @param {object} opts
 * @param {string} opts.entryUuid     - Journal page UUID for this codex entry
 * @param {string} opts.entryName     - Display name of the entry (becomes pin label)
 * @param {string} [opts.entryCategory] - Codex category (drives icon + tag)
 * @param {number} [opts.x]           - Canvas X if placing immediately
 * @param {number} [opts.y]           - Canvas Y if placing immediately
 * @param {string} [opts.sceneId]     - Scene ID if placing immediately
 * @returns {Promise<object|null>} Created PinData, or null on failure
 */
export async function createCodexPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;

    const {
        entryUuid,
        entryName,
        entryCategory = '',
        x,
        y,
        sceneId
    } = opts;

    const page = await fromUuid(entryUuid);
    if (!page) return null;

    const pinType      = getSquirePinType('codex');
    const taxonomyTags = getModuleTaxonomyTags(pinType);
    const pinTypeDefault = getPinTypeDefault(pins, pinType);
    const merged       = foundry.utils.mergeObject(
        foundry.utils.deepClone(SQUIRE_CODEX_PIN_DEFAULTS),
        pinTypeDefault,
        { inplace: false }
    );

    const ownership = calculateCodexPinOwnership(page);
    const tags      = codexCategoryToPinTags(entryCategory, taxonomyTags);
    const image     = getCodexPinImage(entryCategory);

    const style = pinTypeDefault?.style ?? {
        fill:        CODEX_PIN_BACKGROUND,
        stroke:      CODEX_PIN_BORDER_COLOR,
        strokeWidth: CODEX_PIN_BORDER_WIDTH,
        iconColor:   '#ffffff'
    };

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            pinType,
        tags,
        text:            entryName,
        image,
        size:            merged.size            ?? CODEX_PIN_SIZE,
        shape:           merged.shape           ?? 'circle',
        dropShadow:      merged.dropShadow      ?? false,
        textLayout:      merged.textLayout      ?? 'right',
        textDisplay:     merged.textDisplay     ?? 'hover',
        textColor:       merged.textColor       ?? '#ffffff',
        textSize:        merged.textSize        ?? 12,
        textMaxLength:   merged.textMaxLength   ?? 0,
        textMaxWidth:    merged.textMaxWidth    ?? 30,
        textScaleWithPin: merged.textScaleWithPin ?? true,
        lockProportions: merged.lockProportions ?? false,
        ownership,
        style,
        config: {
            codexUuid:     entryUuid,
            codexCategory: entryCategory
        }
    };

    applyPinTypeDefaultExtras(pinData, pinTypeDefault);

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) {
        pinData.x = x;
        pinData.y = y;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (created?.id) {
            await page.setFlag(MODULE.ID, 'codexPinId', created.id);
            if (hasPlacement) {
                await page.setFlag(MODULE.ID, 'codexSceneId', sceneId);
            }
            await enforceSquirePinTaxonomyType(pins, created.id, 'codex', hasPlacement ? { sceneId } : undefined);
        }
        if (hasPlacement && typeof pins.reload === 'function') {
            await pins.reload({ sceneId });
        }
        return created ?? null;
    } catch (err) {
        console.error('Coffee Pub Squire | createCodexPin:', err);
        return null;
    }
}

/**
 * Delete a codex pin (placed or unplaced) and clear the page flags.
 * @param {string} entryUuid - Journal page UUID
 */
export async function deleteCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page = await fromUuid(entryUuid);
    const pinId   = page?.getFlag(MODULE.ID, 'codexPinId');
    const sceneId = page?.getFlag(MODULE.ID, 'codexSceneId');

    if (pinId) {
        try {
            await pins.delete(pinId, sceneId ? { sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Squire | deleteCodexPin:', e);
        }
    }

    if (page) {
        await page.setFlag(MODULE.ID, 'codexPinId', null);
        await page.setFlag(MODULE.ID, 'codexSceneId', null);
    }

    if (sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId }); } catch (_) {}
    }
}

// ---------------------------------------------------------------------------
// Placement mode state (module-level so cleanup can run from anywhere)
// ---------------------------------------------------------------------------

let _codexPinPlacement = null;

function _createCodexPinPreview(fillColor, strokeColor, strokeWidthPx, iconHtml) {
    const sizePx = CODEX_PIN_SIZE.w;
    const preview = document.createElement('div');
    preview.className = 'quest-pin-preview'; // reuse existing quest pin preview CSS
    preview.dataset.shape = 'circle';
    preview.style.setProperty('--quest-pin-width',        `${sizePx}px`);
    preview.style.setProperty('--quest-pin-height',       `${sizePx}px`);
    preview.style.setProperty('--quest-pin-fill',         fillColor);
    preview.style.setProperty('--quest-pin-stroke',       strokeColor);
    preview.style.setProperty('--quest-pin-stroke-width', `${strokeWidthPx}px`);
    preview.innerHTML = `<div class="quest-pin-preview-inner">${iconHtml || ''}</div>`;
    return preview;
}

function _clearCodexPinPlacement() {
    if (!_codexPinPlacement) return;
    const { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown } = _codexPinPlacement;
    view?.removeEventListener('pointerdown', onPointerDown, true);
    view?.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointermove', onPointerMove);
    previewEl?.remove();
    document.body.classList.remove(CODEX_PIN_CURSOR_CLASS);
    document.body.style.cursor = '';
    view?.classList.remove(CODEX_PIN_CANVAS_CURSOR_CLASS);
    _codexPinPlacement = null;
}

/**
 * Begin interactive placement of a codex pin on the current canvas scene.
 * Shows a pin preview that follows the mouse (same pattern as quest pins).
 * @param {string} entryUuid     - Journal page UUID
 * @param {string} entryName
 * @param {string} entryCategory
 */
export async function beginCodexPinPlacement(entryUuid, entryName, entryCategory) {
    if (!canvas?.scene || !canvas?.app?.view) {
        ui.notifications.warn('Canvas is not ready. Open a scene to place a codex pin.');
        return;
    }

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        ui.notifications.warn('Codex pins require the Blacksmith module.');
        return;
    }

    // Guard: already pinned on a scene → must unpin first
    const page = await fromUuid(entryUuid);
    const storedSceneId = page?.getFlag(MODULE.ID, 'codexSceneId');
    const storedPinId   = page?.getFlag(MODULE.ID, 'codexPinId');
    if (storedSceneId && storedPinId) {
        const pinExists = typeof pins.exists === 'function'
            ? pins.exists(storedPinId)
            : !!pins.get?.(storedPinId);
        if (pinExists) {
            ui.notifications.warn('This codex entry is already pinned. Unpin it first to place elsewhere.');
            return;
        }
        await page.setFlag(MODULE.ID, 'codexPinId',   null);
        await page.setFlag(MODULE.ID, 'codexSceneId', null);
    }

    if (_codexPinPlacement) _clearCodexPinPlacement();

    ui.notifications.info('Click on the map to place the codex pin. Press Esc to cancel.');
    document.body.classList.add(CODEX_PIN_CURSOR_CLASS);
    document.body.style.cursor = 'crosshair';
    const view = canvas.app.view;
    view.classList.add(CODEX_PIN_CANVAS_CURSOR_CLASS);

    const iconHtml  = getCodexPinImage(entryCategory);
    const previewEl = _createCodexPinPreview(
        CODEX_PIN_BACKGROUND, CODEX_PIN_BORDER_COLOR, CODEX_PIN_BORDER_WIDTH, iconHtml
    );
    document.body.appendChild(previewEl);

    const onPointerMove = (event) => {
        previewEl.style.left = `${event.clientX}px`;
        previewEl.style.top  = `${event.clientY}px`;
    };

    const onPointerDown = async (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const rect    = view.getBoundingClientRect();
        const globalX = event.clientX - rect.left;
        const globalY = event.clientY - rect.top;
        const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });
        if (!localPos) {
            ui.notifications.warn('Unable to place pin: canvas position unavailable.');
            _clearCodexPinPlacement();
            return;
        }

        const page2 = await fromUuid(entryUuid);
        if (!page2) { _clearCodexPinPlacement(); return; }

        let pinId = page2.getFlag(MODULE.ID, 'codexPinId') || null;
        if (pinId && typeof pins.exists === 'function' && !pins.exists(pinId)) {
            pinId = null;
            await page2.setFlag(MODULE.ID, 'codexPinId',   null);
            await page2.setFlag(MODULE.ID, 'codexSceneId', null);
        }

        if (!pinId) {
            const unplaced = listSquirePinsByKind(pins, 'codex', { unplacedOnly: true });
            const placed   = listSquirePinsByKind(pins, 'codex', {});
            const existing = [...unplaced, ...placed].find(p => p?.config?.codexUuid === entryUuid);
            if (existing?.id) pinId = existing.id;
        }

        if (!pinId) {
            const created = await createCodexPin({ entryUuid, entryName, entryCategory });
            pinId = created?.id ?? null;
        }

        if (!pinId) {
            ui.notifications.error('Failed to create codex pin.');
            _clearCodexPinPlacement();
            return;
        }

        try {
            if (typeof pins.whenReady === 'function') await pins.whenReady();
            if (typeof pins.place === 'function') {
                await pins.place(pinId, { sceneId: canvas.scene.id, x: localPos.x, y: localPos.y });
            } else if (typeof pins.update === 'function') {
                await pins.update(pinId, { sceneId: canvas.scene.id, x: localPos.x, y: localPos.y }, { sceneId: canvas.scene.id });
            }
            await page2.setFlag(MODULE.ID, 'codexPinId',   pinId);
            await page2.setFlag(MODULE.ID, 'codexSceneId', canvas.scene.id);
            if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
            _clearCodexPinPlacement();
            ui.notifications.info('Codex pin placed.');
        } catch (e) {
            console.warn('Coffee Pub Squire | Place codex pin failed:', e);
            _clearCodexPinPlacement();
        }
    };

    const onContextMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        _clearCodexPinPlacement();
        ui.notifications.info('Codex pin placement cancelled.');
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            _clearCodexPinPlacement();
            ui.notifications.info('Codex pin placement cancelled.');
        }
    };

    view.addEventListener('pointerdown', onPointerDown, true);
    view.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown',      onKeyDown);
    window.addEventListener('pointermove',  onPointerMove);

    _codexPinPlacement = { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown };
}

/**
 * Unplace a codex pin from the canvas without deleting it.
 * @param {string} entryUuid
 */
export async function unplaceCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page    = await fromUuid(entryUuid);
    const pinId   = page?.getFlag(MODULE.ID, 'codexPinId');
    const sceneId = page?.getFlag(MODULE.ID, 'codexSceneId');

    if (!pinId) return;

    try {
        if (typeof pins.unplace === 'function') {
            await pins.unplace(pinId);
        }
    } catch (e) {
        console.warn('Coffee Pub Squire | unplaceCodexPin:', e);
    }

    if (page) {
        await page.setFlag(MODULE.ID, 'codexSceneId', null);
    }

    if (sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId }); } catch (_) {}
    }
}

/**
 * Update the ownership of a codex pin to match the entry's current visibility.
 * Called after a GM toggles entry visibility.
 * @param {string} entryUuid
 */
export async function updateCodexPinVisibility(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page    = await fromUuid(entryUuid);
    const pinId   = page?.getFlag(MODULE.ID, 'codexPinId');
    const sceneId = page?.getFlag(MODULE.ID, 'codexSceneId');

    if (!pinId) return;

    const ownership = calculateCodexPinOwnership(page);
    try {
        await pins.update(pinId, { ownership }, sceneId ? { sceneId } : undefined);
    } catch (e) {
        console.warn('Coffee Pub Squire | updateCodexPinVisibility:', e);
    }
}

/**
 * Update codex pin metadata after the entry itself changes.
 * Keeps pin text, category icon/tag mapping, and config in sync with the page.
 * @param {string} entryUuid
 * @param {object} opts
 * @param {string} [opts.entryName]
 * @param {string} [opts.entryCategory]
 */
export async function updateCodexPinForEntry(entryUuid, opts = {}) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'codexPinId');
    const sceneId = page?.getFlag(MODULE.ID, 'codexSceneId');
    if (!pinId) return;

    const pinType = getSquirePinType('codex');
    const taxonomyTags = getModuleTaxonomyTags(pinType);
    const entryName = String(opts.entryName || page?.name || '').trim();
    const entryCategory = String(opts.entryCategory || '').trim();

    const patch = {
        text: entryName || page?.name || '',
        image: getCodexPinImage(entryCategory),
        tags: codexCategoryToPinTags(entryCategory, taxonomyTags),
        config: {
            codexUuid: entryUuid,
            codexCategory: entryCategory
        }
    };

    try {
        await pins.update(pinId, patch, sceneId ? { sceneId } : undefined);
    } catch (e) {
        console.warn('Coffee Pub Squire | updateCodexPinForEntry:', e);
    }
}

/**
 * Reconcile codex pin flags against the live Pins API. GM only.
 * Clears stale pinId/sceneId flags when pins have been deleted externally.
 * @param {object} [opts]
 * @param {string} [opts.sceneId] - Restrict placed pin lookup to this scene.
 */
export async function reconcileCodexPins(opts = {}) {
    if (!game.user.isGM) return;

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    if (!journal) return;

    for (const page of journal.pages.contents) {
        const storedPinId   = page.getFlag(MODULE.ID, 'codexPinId');
        const storedSceneId = page.getFlag(MODULE.ID, 'codexSceneId');
        if (!storedPinId) continue;

        const exists = typeof pins.exists === 'function'
            ? pins.exists(storedPinId)
            : !!pins.get?.(storedPinId, storedSceneId ? { sceneId: storedSceneId } : undefined);

        if (!exists) {
            await page.setFlag(MODULE.ID, 'codexPinId', null);
            await page.setFlag(MODULE.ID, 'codexSceneId', null);
        }
    }
}
