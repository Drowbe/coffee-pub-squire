/**
 * Quest Pin Utilities – Blacksmith Pins API integration
 *
 * Create, update, delete, and sync quest/objective pins. Ownership and
 * visibility use Blacksmith ownership; per-user hide-all uses
 * pins.setModuleVisibility(MODULE.ID, visible).
 *
 * Visual design: merge `pins.getDefaultPinDesign(MODULE.ID, type)` (Configure Pin
 * "Default for [type]") with module + page flags. Squire only applies legacy
 * fill/stroke/iconColor when the merged style has no fill and no stroke — otherwise
 * the pin tool / defaults own appearance. See Blacksmith API: Pins.
 */

import { MODULE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';

/** Fallback when no size in defaults / flags (quest pin design baseline: 60×60 circle). */
const QUEST_PIN_SIZE = { w: 60, h: 60 };
/** Border width for quest pins in Squire bootstrap style (when no tool default). */
const QUEST_PIN_STROKE_WIDTH_DEFAULT = 5;
/** Fallback size when no Blacksmith type default (matches Squire objective pin design baseline). */
const OBJECTIVE_PIN_SIZE = { w: 50, h: 50 };
/** Border width for objective pins in Squire bootstrap style (when no tool default). */
const OBJECTIVE_PIN_STROKE_WIDTH_DEFAULT = 5;
export const QUEST_PIN_BACKGROUND = '#682008';
export const OBJECTIVE_PIN_BACKGROUND = '#8c2d0d';
const QUEST_ICON = '<i class="fa-solid fa-flag"></i>';
const OBJECTIVE_ICON = '<i class="fa-solid fa-sign-post"></i>';
const BOOTSTRAP_ICON_COLOR = '#ffffff';

/** Canonical `pin.type` keys from Blacksmith module pin-taxonomy JSON (must match exactly). */
const SQUIRE_PIN_TAXONOMY_KIND = Object.freeze({
    quest: 'quest',
    objective: 'objective',
    note: 'note',
    codex: 'codex'
});

/** Legacy `pin.type` strings from an earlier Squire build (still recognized for reads until migrated). */
const LEGACY_SQUIRE_PIN_TYPE = Object.freeze({
    quest: 'quest-pin',
    objective: 'objective-pin',
    note: 'note-pin',
    codex: 'codex-pin'
});

/**
 * Wrong `pin.type` values seen in the wild (Configure Pin defaults / inverted registrations) → canonical key.
 * Used for post-create correction and GM migration.
 */
const SQUIRE_PIN_TYPE_FIX_MAP = Object.freeze({
    ...Object.fromEntries(
        Object.entries(LEGACY_SQUIRE_PIN_TYPE).map(([k, wrong]) => [wrong, SQUIRE_PIN_TAXONOMY_KIND[k]])
    ),
    'Quest Pin': 'quest',
    'Objective Pin': 'objective',
    'Note Pin': 'note',
    'Codex Pin': 'codex',
    'coffee-pub-squire-sticky-notes': 'note'
});

/**
 * True when the merged style has no fill and no stroke — Squire may apply its
 * bootstrap palette; otherwise defer to Blacksmith / Configure Pin / defaults.
 * @param {object|null|undefined} style
 * @returns {boolean}
 */
function pinStyleUsesSquireBootstrap(style) {
    if (!style || typeof style !== 'object') return true;
    return !style.fill && !style.stroke;
}

/**
 * True when an existing pin already has a tool- or user-defined fill or stroke.
 * @param {object|null|undefined} style
 * @returns {boolean}
 */
function pinHasConfiguredAppearance(style) {
    if (!style || typeof style !== 'object') return false;
    return !!(style.fill || style.stroke);
}

/**
 * Client default for a pin type from Blacksmith ("Default for [type]").
 * @param {object|undefined} pins - Pins API
 * @param {string} pinType - taxonomy key, e.g. 'quest', 'objective'
 * @returns {Record<string, unknown>}
 */
function getPinTypeDefaultDesign(pins, pinType) {
    if (!isPinsApiAvailable(pins) || typeof pins.getDefaultPinDesign !== 'function') return {};
    try {
        const raw = pins.getDefaultPinDesign(MODULE.ID, pinType) || {};
        if (!raw || typeof raw !== 'object') return {};
        // Saved defaults must not override `pin.type` — blobs sometimes wrongly carry display labels as `type`.
        const { type: _t, id: _i, moduleId: _m, ...rest } = raw;
        return rest;
    } catch (_) {
        return {};
    }
}

/**
 * PinData fields Squire does not build explicitly but Blacksmith may store on
 * "Default for [type]" (see API PinData + getDefaultPinDesign return shape).
 * @type {readonly string[]}
 */
const PIN_TYPE_DEFAULT_EXTRA_KEYS = ['eventAnimations', 'allowDuplicatePins', 'lockProportions', 'iconText'];

/**
 * Copy optional PinData keys from `getDefaultPinDesign` onto the create payload.
 * @param {Record<string, unknown>} pinData - Payload for pins.create (mutated)
 * @param {Record<string, unknown>} pinTypeDefault - From getPinTypeDefaultDesign
 */
function applyPinTypeDefaultExtras(pinData, pinTypeDefault) {
    if (!pinTypeDefault || typeof pinTypeDefault !== 'object') return;
    for (const key of PIN_TYPE_DEFAULT_EXTRA_KEYS) {
        if (pinTypeDefault[key] !== undefined) {
            pinData[key] = foundry.utils.deepClone(pinTypeDefault[key]);
        }
    }
}

/**
 * Squire baseline for objective pins when `getDefaultPinDesign` has no entry yet.
 * Aligns with Configure Pin defaults (50×50 circle, #8c2d0d fill, white border, text, event sounds).
 * Blacksmith type defaults override these field-by-field when present.
 */
/**
 * Squire baseline for quest pins when defaults are otherwise empty.
 * Blacksmith `getDefaultPinDesign(MODULE.ID, 'quest')` and page flags override.
 */
const SQUIRE_QUEST_PIN_DEFAULTS = {
    size: QUEST_PIN_SIZE,
    shape: 'circle',
    dropShadow: false,
    textLayout: 'right',
    textDisplay: 'hover',
    textColor: '#ffffff',
    textSize: 10,
    textMaxLength: 100,
    textMaxWidth: 30,
    textScaleWithPin: false,
    lockProportions: false,
    allowDuplicatePins: false,
    eventAnimations: {
        hover: { animation: 'ripple', sound: 'interface-pop-01' },
        click: { animation: 'scale-small', sound: 'book-open-02' },
        doubleClick: { animation: null, sound: null },
        add: { animation: null, sound: null },
        delete: { animation: 'fade', sound: 'interface-error-01' }
    }
};

const SQUIRE_OBJECTIVE_PIN_DEFAULTS = {
    size: OBJECTIVE_PIN_SIZE,
    shape: 'circle',
    dropShadow: false,
    textLayout: 'under',
    textDisplay: 'hover',
    textColor: '#ffffff',
    textSize: 12,
    textMaxLength: 100,
    textMaxWidth: 25,
    textScaleWithPin: false,
    lockProportions: false,
    allowDuplicatePins: false,
    eventAnimations: {
        hover: { animation: 'ripple', sound: 'interface-pop-01' },
        click: { animation: 'scale-small', sound: 'book-open-02' },
        doubleClick: { animation: null, sound: null },
        add: { animation: null, sound: null },
        delete: { animation: 'fade', sound: 'interface-pop-03' }
    }
};

/** Quest status / state → border (stroke) color (hex). Background is fixed QUEST_PIN_BACKGROUND. */
const QUEST_STATUS_COLORS = {
    'Complete': '#0ea40e',
    'Failed': '#d51301',
    'In Progress': '#ffffff',
    'Not Started': '#ffffff',
    'hidden': '#a3a3a3'
};

/** Objective state → border (stroke) color (hex). Background is fixed OBJECTIVE_PIN_BACKGROUND. */
const OBJECTIVE_STATE_COLORS = {
    active: '#ffffff',
    completed: '#0ea40e',
    failed: '#d51301',
    hidden: '#a3a3a3'
};

/** Quest category display name → taxonomy tag key (application mapping logic, not hard-wired tag literals). */
const QUEST_CATEGORY_TAG_MAP = {
    'Main Quest': 'main',
    'Side Quest': 'side',
    'Optional':   'optional',
    'Backstory':  'backstory'
};

/**
 * Read the live taxonomy tags for a pin type from Blacksmith.
 * Returns null if the API or method is unavailable (triggers fallback in callers).
 * @param {string} type - taxonomy key, e.g. 'quest', 'objective'
 * @returns {string[]|null}
 */
function getModuleTaxonomyTags(type) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.getModuleTaxonomy !== 'function') return null;
    return pins.getModuleTaxonomy(MODULE.ID)?.[type]?.tags ?? null;
}

/**
 * Derive pin taxonomy tags from a quest category string, validated against live taxonomy.
 * @param {string}        baseTag      - 'quest' or 'objective'
 * @param {string}        category     - questCategory display name (e.g. 'Main Quest')
 * @param {string[]|null} taxonomyTags - Live tags from getModuleTaxonomyTags(); null triggers fallback
 * @returns {string[]}
 */
function questCategoryToPinTags(baseTag, category, taxonomyTags) {
    const extra = QUEST_CATEGORY_TAG_MAP[category];
    if (!taxonomyTags) {
        return extra ? [baseTag, extra] : [baseTag];
    }
    const tags = [];
    if (taxonomyTags.includes(baseTag)) tags.push(baseTag);
    if (extra && taxonomyTags.includes(extra)) tags.push(extra);
    return tags.length ? tags : [baseTag];
}

function getQuestNumber(questUuid) {
    if (!questUuid || typeof questUuid !== 'string') return 1;
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

/**
 * Resolve quest pin image string from page flags (for pins.create image property).
 * @param {JournalEntryPage} page - Quest journal page
 * @returns {string} FA HTML, FA class string, or image URL
 */
function getQuestPinImageFromPage(page) {
    if (!page) return QUEST_ICON;
    const iconFlag = page.getFlag(MODULE.ID, 'questIcon');
    if (!iconFlag) return QUEST_ICON;
    if (typeof iconFlag === 'object') {
        if (iconFlag.type === 'fa' && iconFlag.value) {
            const v = String(iconFlag.value).trim();
            return v.startsWith('<i') ? v : `<i class="${v}"></i>`;
        }
        if (iconFlag.type === 'img' && iconFlag.value) return iconFlag.value;
    }
    if (typeof iconFlag === 'string') {
        const t = iconFlag.trim();
        if (t.startsWith('<i') && t.includes('fa-')) return t;
        if (t.includes('fa-')) return `<i class="${t}"></i>`;
        return t;
    }
    return QUEST_ICON;
}

/**
 * Get quest pin design: Squire baseline → Blacksmith type default → module setting → page flags.
 * @param {JournalEntryPage} page - Quest journal page
 * @returns {{ size, shape, style, dropShadow, textLayout, textDisplay, textColor, textSize, textMaxLength, textMaxWidth, textScaleWithPin, lockProportions, allowDuplicatePins, eventAnimations }}
 */
function getQuestPinDesignFromPage(page) {
    const pins = getPinsApi();
    const pinTypeDefault = getPinTypeDefaultDesign(pins, getSquirePinType('quest'));
    const layered = foundry.utils.mergeObject(
        foundry.utils.deepClone(SQUIRE_QUEST_PIN_DEFAULTS),
        pinTypeDefault,
        { inplace: false }
    );
    const defaultDesign = foundry.utils.mergeObject(
        layered,
        game.settings.get(MODULE.ID, 'questPinDefaultDesign') || {},
        { inplace: false }
    );
    const pageStyle = page?.getFlag(MODULE.ID, 'questPinStyle');
    const mergedStyle = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, typeof defaultDesign.style === 'object' ? defaultDesign.style : {}),
        typeof pageStyle === 'object' && pageStyle ? pageStyle : {},
        { inplace: false }
    );
    const size = page?.getFlag(MODULE.ID, 'questPinSize') ?? defaultDesign.size ?? QUEST_PIN_SIZE;
    const shape = page?.getFlag(MODULE.ID, 'questPinShape') ?? defaultDesign.shape ?? 'circle';
    const dropShadow = page?.getFlag(MODULE.ID, 'questPinDropShadow') ?? defaultDesign.dropShadow ?? SQUIRE_QUEST_PIN_DEFAULTS.dropShadow;
    const textLayout = page?.getFlag(MODULE.ID, 'questPinTextLayout') ?? defaultDesign.textLayout ?? SQUIRE_QUEST_PIN_DEFAULTS.textLayout;
    const textDisplay = page?.getFlag(MODULE.ID, 'questPinTextDisplay') ?? defaultDesign.textDisplay ?? SQUIRE_QUEST_PIN_DEFAULTS.textDisplay;
    const textColor = page?.getFlag(MODULE.ID, 'questPinTextColor') ?? defaultDesign.textColor ?? SQUIRE_QUEST_PIN_DEFAULTS.textColor;
    const textSize = page?.getFlag(MODULE.ID, 'questPinTextSize') ?? defaultDesign.textSize ?? SQUIRE_QUEST_PIN_DEFAULTS.textSize;
    const textMaxLength = page?.getFlag(MODULE.ID, 'questPinTextMaxLength') ?? defaultDesign.textMaxLength ?? SQUIRE_QUEST_PIN_DEFAULTS.textMaxLength;
    const textMaxWidth = page?.getFlag(MODULE.ID, 'questPinTextMaxWidth') ?? defaultDesign.textMaxWidth ?? SQUIRE_QUEST_PIN_DEFAULTS.textMaxWidth;
    const textScaleWithPin = page?.getFlag(MODULE.ID, 'questPinTextScaleWithPin') ?? defaultDesign.textScaleWithPin ?? SQUIRE_QUEST_PIN_DEFAULTS.textScaleWithPin;
    const lockProportions = typeof defaultDesign.lockProportions === 'boolean'
        ? defaultDesign.lockProportions
        : SQUIRE_QUEST_PIN_DEFAULTS.lockProportions;
    const allowDuplicatePins = typeof defaultDesign.allowDuplicatePins === 'boolean'
        ? defaultDesign.allowDuplicatePins
        : SQUIRE_QUEST_PIN_DEFAULTS.allowDuplicatePins;
    const eventAnimations = defaultDesign.eventAnimations
        ? foundry.utils.deepClone(defaultDesign.eventAnimations)
        : foundry.utils.deepClone(SQUIRE_QUEST_PIN_DEFAULTS.eventAnimations);
    return {
        size: size && typeof size.w === 'number' && typeof size.h === 'number' ? size : QUEST_PIN_SIZE,
        shape: shape === 'circle' || shape === 'square' || shape === 'none' ? shape : 'circle',
        style: mergedStyle,
        dropShadow: typeof dropShadow === 'boolean' ? dropShadow : SQUIRE_QUEST_PIN_DEFAULTS.dropShadow,
        textLayout,
        textDisplay,
        textColor,
        textSize,
        textMaxLength,
        textMaxWidth,
        textScaleWithPin,
        lockProportions,
        allowDuplicatePins,
        eventAnimations
    };
}

/**
 * Get the Blacksmith Pins API.
 * @returns {object|undefined}
 */
export function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins;
}

/**
 * Check whether the Pins API is available.
 * @param {object} [pins] - Optional API instance; if omitted, uses getPinsApi()
 * @returns {boolean}
 */
export function isPinsApiAvailable(pins) {
    const api = pins ?? getPinsApi();
    return typeof api?.isAvailable === 'function' && api.isAvailable();
}

/**
 * Resolve `pin.type` for Squire categories — must match Blacksmith taxonomy keys (`quest`, `objective`, `note`, `codex`).
 * When `getModuleTaxonomy` is available, returns the key only if present on the module taxonomy object.
 * @param {'quest'|'objective'|'note'|'codex'} kind
 * @returns {string}
 */
export function getSquirePinType(kind) {
    const expected = SQUIRE_PIN_TAXONOMY_KIND[kind] ?? kind;
    const pins = getPinsApi();
    try {
        if (pins && typeof pins.getModuleTaxonomy === 'function') {
            const tax = pins.getModuleTaxonomy(MODULE.ID);
            if (tax && typeof tax === 'object' && Object.prototype.hasOwnProperty.call(tax, expected)) {
                return expected;
            }
        }
    } catch (_) {}
    return expected;
}

/**
 * True if `pinType` is the canonical or legacy Squire category for `kind`.
 * @param {string|undefined|null} pinType
 * @param {'quest'|'objective'|'note'|'codex'} kind
 * @returns {boolean}
 */
export function isSquirePinCategory(pinType, kind) {
    if (!pinType || typeof pinType !== 'string') return false;
    const canonical = getSquirePinType(kind);
    const legacy = LEGACY_SQUIRE_PIN_TYPE[kind];
    return pinType === canonical || pinType === legacy;
}

/**
 * List pins for this module that match a quest/objective category (canonical or legacy type), deduped by id.
 * @param {object} pins - Pins API
 * @param {'quest'|'objective'|'note'|'codex'} kind
 * @param {{ unplacedOnly?: boolean, sceneId?: string }} [opts] - forwarded to pins.list (without `type` / `moduleId`)
 * @returns {object[]}
 */
/**
 * If Blacksmith merged a bad `type` onto the pin, force the taxonomy key for this category.
 * @param {object} pins
 * @param {string} pinId
 * @param {'quest'|'objective'|'note'|'codex'} kind
 * @param {object|undefined} sceneOpt - e.g. `{ sceneId }` for placed pins; omit for unplaced
 */
export async function enforceSquirePinTaxonomyType(pins, pinId, kind, sceneOpt) {
    if (!pins?.update || !pinId) return;
    const expected = getSquirePinType(kind);
    try {
        const pin = typeof pins.get === 'function' ? pins.get(pinId, sceneOpt) : null;
        const current = pin?.type;
        if (!current || current === expected) return;
        const viaMap = SQUIRE_PIN_TYPE_FIX_MAP[current];
        const shouldFix = viaMap === expected || (isSquirePinCategory(current, kind) && current !== expected);
        if (!shouldFix) return;
        await pins.update(pinId, { type: expected }, sceneOpt);
    } catch (e) {
        console.warn('Coffee Pub Squire | enforceSquirePinTaxonomyType:', e);
    }
}

export function listSquirePinsByKind(pins, kind, opts = {}) {
    if (!pins?.list) return [];
    const base = { moduleId: MODULE.ID, ...opts };
    const canonical = getSquirePinType(kind);
    const legacy = LEGACY_SQUIRE_PIN_TYPE[kind];
    const primary = pins.list({ ...base, type: canonical }) || [];
    const secondary = legacy && legacy !== canonical
        ? (pins.list({ ...base, type: legacy }) || [])
        : [];
    const byId = new Map();
    for (const p of [...primary, ...secondary]) {
        if (p?.id) byId.set(p.id, p);
    }
    return [...byId.values()];
}

export function listAllModulePins(pins, opts = {}) {
    if (!pins?.list) return [];
    if (opts.sceneId || opts.unplacedOnly) {
        const list = pins.list({ moduleId: MODULE.ID, ...opts }) || [];
        const byId = new Map();
        for (const pin of list) {
            if (pin?.id) byId.set(pin.id, pin);
        }
        return [...byId.values()];
    }

    const byId = new Map();
    const unplaced = pins.list({ moduleId: MODULE.ID, unplacedOnly: true }) || [];
    for (const pin of unplaced) {
        if (pin?.id) byId.set(pin.id, pin);
    }
    for (const scene of game.scenes.contents) {
        const placed = pins.list({ moduleId: MODULE.ID, sceneId: scene.id }) || [];
        for (const pin of placed) {
            if (pin?.id) byId.set(pin.id, pin);
        }
    }
    return [...byId.values()];
}

function listAllSquirePinsByKind(pins, kind) {
    if (!isPinsApiAvailable(pins)) return [];
    const unplaced = listSquirePinsByKind(pins, kind, { unplacedOnly: true });
    const placed = game.scenes.contents.flatMap(scene => listSquirePinsByKind(pins, kind, { sceneId: scene.id }));
    const byId = new Map();
    for (const pin of [...unplaced, ...placed]) {
        if (pin?.id) byId.set(pin.id, pin);
    }
    return [...byId.values()];
}

function listAllPinsForQuest(pins, questUuid) {
    if (!questUuid) return [];
    return listAllModulePins(pins).filter(pin => pin?.config?.questUuid === questUuid);
}

function pickPreferredLivePin(existing, candidate) {
    if (!candidate) return existing ?? null;
    if (!existing) return candidate;
    if (!existing.sceneId && candidate.sceneId) return candidate;
    return existing;
}

export function findLiveQuestPin(questUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid) return null;
    let match = null;
    for (const pin of listAllModulePins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (typeof pin?.config?.objectiveIndex === 'number') continue;
        match = pickPreferredLivePin(match, pin);
    }
    return match;
}

export function findLiveObjectivePin(questUuid, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid || !Number.isInteger(objectiveIndex)) return null;
    let match = null;
    for (const pin of listAllModulePins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (Number(pin?.config?.objectiveIndex) !== objectiveIndex) continue;
        match = pickPreferredLivePin(match, pin);
    }
    return match;
}

/**
 * Calculate pin ownership from quest/objective visibility.
 * GMs always get OWNER; hidden quest/objective → NONE for default, GMs in users.
 * @param {JournalEntryPage} page - Quest journal page
 * @param {object|null} [objective] - Objective data (null for quest-level pin)
 * @returns {object} Ownership for pins.create/pins.update
 */
export function calculateQuestPinOwnership(page, objective = null) {
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });

    const questVisible = page?.getFlag(MODULE.ID, 'visible') !== false;
    if (!questVisible) {
        return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    }

    if (objective && objective.state === 'hidden') {
        return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    }

    return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, users: gmUsers };
}

/**
 * Get border (stroke) color for a quest pin by status (or hidden state). Background is fixed.
 * @param {string} status - e.g. 'Not Started', 'In Progress', 'Complete', 'Failed'
 * @param {string} [questState] - 'visible' | 'hidden'; if 'hidden', returns hidden color
 * @returns {string} Hex color
 */
export function getQuestPinColor(status, questState) {
    if (questState === 'hidden') return QUEST_STATUS_COLORS.hidden ?? '#a3a3a3';
    return QUEST_STATUS_COLORS[status] ?? QUEST_STATUS_COLORS['Not Started'];
}

/**
 * Get border (stroke) color for an objective pin by state. Background is fixed.
 * @param {string} state - 'active' | 'completed' | 'failed' | 'hidden'
 * @returns {string} Hex color
 */
export function getObjectivePinColor(state) {
    return OBJECTIVE_STATE_COLORS[state] ?? OBJECTIVE_STATE_COLORS.active;
}

/**
 * Create a quest-level pin and optionally place it on a scene.
 * @param {object} opts - questUuid, questIndex, questCategory, questStatus, questState, x, y, sceneId
 * @returns {Promise<object|null>} Created pin data or null
 */
export async function createQuestPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;

    const {
        questUuid,
        questIndex,
        questCategory = 'Side Quest',
        questStatus = 'Not Started',
        questState = 'visible',
        x,
        y,
        sceneId
    } = opts;

    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership = calculateQuestPinOwnership(page);
    const questNum = typeof questIndex === 'number' ? questIndex : getQuestNumber(questUuid);
    const strokeColor = getQuestPinColor(questStatus, questState);
    const design = getQuestPinDesignFromPage(page);
    const image = getQuestPinImageFromPage(page);
    const style = pinStyleUsesSquireBootstrap(design.style)
        ? {
            ...design.style,
            fill: QUEST_PIN_BACKGROUND,
            stroke: strokeColor,
            strokeWidth: design.style?.strokeWidth ?? QUEST_PIN_STROKE_WIDTH_DEFAULT,
            iconColor: design.style?.iconColor ?? BOOTSTRAP_ICON_COLOR
        }
        : { ...design.style };

    const questTitle = (page?.name || 'Quest').trim();
    const pinTitle = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
    const questTaxonomyTags = getModuleTaxonomyTags(getSquirePinType('quest'));

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: getSquirePinType('quest'),
        tags: questCategoryToPinTags('quest', questCategory, questTaxonomyTags),
        shape: design.shape,
        text: pinTitle,
        image,
        size: design.size,
        style,
        dropShadow: design.dropShadow,
        textLayout: design.textLayout,
        textDisplay: design.textDisplay,
        textColor: design.textColor,
        textSize: design.textSize,
        textMaxLength: design.textMaxLength,
        textMaxWidth: design.textMaxWidth,
        textScaleWithPin: design.textScaleWithPin,
        lockProportions: design.lockProportions,
        allowDuplicatePins: design.allowDuplicatePins,
        eventAnimations: design.eventAnimations,
        ownership,
        config: {
            questUuid,
            questIndex: questNum,
            questCategory,
            questStatus,
            questState
        }
    };

    applyPinTypeDefaultExtras(pinData, getPinTypeDefaultDesign(pins, getSquirePinType('quest')));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) {
        pinData.x = x;
        pinData.y = y;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (created?.id) {
            await enforceSquirePinTaxonomyType(
                pins,
                created.id,
                'quest',
                hasPlacement ? { sceneId } : undefined
            );
        }
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createQuestPin:', err);
        return null;
    }
}

/**
 * Create an objective-level pin and optionally place it on a scene.
 * @param {object} opts - questUuid, objectiveIndex, questIndex, questCategory, questState, objective, x, y, sceneId
 * @returns {Promise<object|null>} Created pin data or null
 */
export async function createObjectivePin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;

    const {
        questUuid,
        objectiveIndex,
        questIndex,
        questCategory = 'Side Quest',
        questState = 'visible',
        objective = { state: 'active', text: '' },
        x,
        y,
        sceneId
    } = opts;

    const page = await fromUuid(questUuid);
    if (!page) return null;

    const objState = objective.state || 'active';
    const ownership = calculateQuestPinOwnership(page, objective);
    const questNum = typeof questIndex === 'number' ? questIndex : getQuestNumber(questUuid);
    const strokeColor = getObjectivePinColor(objState);

    const objNum = String((objectiveIndex ?? 0) + 1).padStart(2, '0');
    const objectiveText = (objective?.text || 'Objective').trim();
    const pinTitle = `Quest ${questNum}.${objNum}: ${objectiveText}${objectiveText.endsWith('.') ? '' : '.'}`;
    const objectiveTaxonomyTags = getModuleTaxonomyTags(getSquirePinType('objective'));

    const pinTypeDefault = getPinTypeDefaultDesign(pins, getSquirePinType('objective'));
    const { style: _ignoreTdStyle, type: _ignorePinType, ...pinTypeDefaultRest } = pinTypeDefault;
    const structural = foundry.utils.mergeObject(
        foundry.utils.deepClone(SQUIRE_OBJECTIVE_PIN_DEFAULTS),
        pinTypeDefaultRest,
        { inplace: false }
    );

    const mergedStyle = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, typeof pinTypeDefault.style === 'object' ? pinTypeDefault.style : {}),
        {},
        { inplace: false }
    );
    const style = pinStyleUsesSquireBootstrap(mergedStyle)
        ? {
            ...mergedStyle,
            fill: OBJECTIVE_PIN_BACKGROUND,
            stroke: strokeColor,
            strokeWidth: mergedStyle.strokeWidth ?? OBJECTIVE_PIN_STROKE_WIDTH_DEFAULT,
            iconColor: mergedStyle.iconColor ?? BOOTSTRAP_ICON_COLOR
        }
        : { ...mergedStyle };

    const size = structural.size && typeof structural.size.w === 'number' && typeof structural.size.h === 'number'
        ? structural.size
        : OBJECTIVE_PIN_SIZE;
    const shape = structural.shape === 'circle' || structural.shape === 'square' || structural.shape === 'none'
        ? structural.shape
        : 'circle';
    const image = typeof structural.image === 'string' && structural.image.trim()
        ? structural.image
        : OBJECTIVE_ICON;
    const dropShadow = typeof structural.dropShadow === 'boolean'
        ? structural.dropShadow
        : SQUIRE_OBJECTIVE_PIN_DEFAULTS.dropShadow;
    const textLayout = structural.textLayout ?? 'under';
    const textDisplay = structural.textDisplay ?? 'hover';
    const textColor = structural.textColor ?? '#ffffff';
    const textSize = structural.textSize ?? 12;
    const textMaxLength = structural.textMaxLength ?? 100;
    const textMaxWidth = structural.textMaxWidth ?? 25;
    const textScaleWithPin = typeof structural.textScaleWithPin === 'boolean'
        ? structural.textScaleWithPin
        : SQUIRE_OBJECTIVE_PIN_DEFAULTS.textScaleWithPin;
    const lockProportions = typeof structural.lockProportions === 'boolean'
        ? structural.lockProportions
        : SQUIRE_OBJECTIVE_PIN_DEFAULTS.lockProportions;
    const allowDuplicatePins = typeof structural.allowDuplicatePins === 'boolean'
        ? structural.allowDuplicatePins
        : SQUIRE_OBJECTIVE_PIN_DEFAULTS.allowDuplicatePins;
    const eventAnimations = structural.eventAnimations
        ? foundry.utils.deepClone(structural.eventAnimations)
        : foundry.utils.deepClone(SQUIRE_OBJECTIVE_PIN_DEFAULTS.eventAnimations);

    const pinData = {
        id: crypto.randomUUID(),
        moduleId: MODULE.ID,
        type: getSquirePinType('objective'),
        tags: questCategoryToPinTags('objective', questCategory, objectiveTaxonomyTags),
        shape,
        text: pinTitle,
        image,
        size,
        style,
        dropShadow,
        textLayout,
        textDisplay,
        textColor,
        textSize,
        textMaxLength,
        textMaxWidth,
        textScaleWithPin,
        lockProportions,
        allowDuplicatePins,
        eventAnimations,
        ownership,
        config: {
            questUuid,
            questIndex: questNum,
            objectiveIndex: objectiveIndex ?? 0,
            questCategory,
            questState,
            objectiveState: objState,
            objectiveText: (objective.text || '').trim()
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
            await enforceSquirePinTaxonomyType(
                pins,
                created.id,
                'objective',
                hasPlacement ? { sceneId } : undefined
            );
        }
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createObjectivePin:', err);
        return null;
    }
}

/**
 * Delete all pins for a quest on a scene (or all scenes if sceneId omitted).
 * @param {string} questUuid - Quest page UUID
 * @param {string} [sceneId] - If provided, only delete from this scene
 */
export async function deleteQuestPins(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const livePins = listAllPinsForQuest(pins, questUuid)
        .filter(pin => !sceneId || pin.sceneId === sceneId);

    for (const pin of livePins) {
        try {
            await pins.delete(pin.id, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Squire | deleteQuestPins:', e);
        }
    }
}

/**
 * Unplace the quest-level pin from the canvas (pin remains, can be placed again).
 * Caller should clear page flags (sceneId) after this so UI shows dim.
 * @param {JournalEntryPage} page - Quest journal page
 */
export async function unplaceQuestPinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const livePin = page?.uuid ? findLiveQuestPin(page.uuid) : null;
    const pinId = livePin?.id ?? page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;
    let sceneId = livePin?.sceneId;
    if (sceneId == null) sceneId = page?.getFlag(MODULE.ID, 'sceneId');
    if (sceneId == null) sceneId = canvas?.scene?.id;

    if (typeof pins.unplace === 'function') {
        try {
            await pins.unplace(pinId);
        } catch (e) {
            if (typeof pins.update === 'function') {
                await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
            } else {
                throw e;
            }
        }
    } else if (typeof pins.update === 'function') {
        await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
    }

    if (sceneId && typeof pins.reload === 'function') {
        await pins.reload({ sceneId });
    }
}

/**
 * Unplace an objective pin from the canvas (pin remains, can be placed again).
 * @param {JournalEntryPage} page - Quest journal page
 * @param {number} objectiveIndex - Task index
 */
export async function unplaceObjectivePinForPage(page, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const livePin = page?.uuid ? findLiveObjectivePin(page.uuid, objectiveIndex) : null;
    const objectivePins = page?.getFlag(MODULE.ID, 'objectivePins') || {};
    const objPin = objectivePins[String(objectiveIndex)] ?? objectivePins[objectiveIndex];
    const pinId = livePin?.id ?? objPin?.pinId ?? objPin;
    let sceneId = livePin?.sceneId;
    if (sceneId == null && typeof objPin === 'object' && objPin?.sceneId != null) sceneId = objPin.sceneId;
    if (sceneId == null) sceneId = canvas?.scene?.id;
    if (!pinId) return;

    const pinExistsOnScene = typeof pins.exists === 'function'
        ? pins.exists(pinId, sceneId ? { sceneId } : undefined)
        : !!pins.get?.(pinId, sceneId ? { sceneId } : undefined);
    if (!pinExistsOnScene) {
        return;
    }

    if (typeof pins.unplace === 'function') {
        try {
            await pins.unplace(pinId);
        } catch (e) {
            if (typeof pins.update === 'function') {
                await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
            } else {
                throw e;
            }
        }
    } else if (typeof pins.update === 'function') {
        await pins.update(pinId, { unplace: true }, sceneId ? { sceneId } : undefined);
    }

    if (sceneId && typeof pins.reload === 'function') {
        await pins.reload({ sceneId });
    }
}

/**
 * Reload pins for the current scene (e.g. after visibility toggle).
 */
export async function reloadAllQuestPins() {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !canvas?.scene) return;
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
}

/**
 * Update ownership for all pins belonging to a quest (e.g. after visibility flag change).
 * @param {string} questUuid - Quest page UUID
 * @param {string} [sceneId] - Optional scene; defaults to canvas.scene.id
 */
export async function updateQuestPinVisibility(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const page = await fromUuid(questUuid);
    if (!page) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}

    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest = await QuestParser.parseSinglePage(page, enrichedHtml);
    const tasks = quest?.tasks ?? [];
    const forQuest = listAllPinsForQuest(pins, questUuid);

    for (const pin of forQuest) {
        const objective = typeof pin.config?.objectiveIndex === 'number'
            ? tasks[pin.config.objectiveIndex]
            : null;
        const ownership = calculateQuestPinOwnership(page, objective);
        try {
            await pins.update(pin.id, { ownership }, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Squire | updateQuestPinVisibility:', e);
        }
    }

    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Update pin styles (colors) for all pins belonging to a quest page after content change.
 * @param {JournalEntryPage} page - Quest journal page
 * @param {string} [sceneId] - Optional scene; defaults to canvas.scene.id
 */
export async function updateQuestPinStylesForPage(page, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !page) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}

    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest = await QuestParser.parseSinglePage(page, enrichedHtml);
    if (!quest) return;
    const forQuest = listAllPinsForQuest(pins, page.uuid);
    const questStatus = quest.status || 'Not Started';
    const questState = page.getFlag(MODULE.ID, 'visible') === false ? 'hidden' : 'visible';
    const questNum = getQuestNumber(page.uuid);
    const questTitle = (page?.name || 'Quest').trim();
    const questPinTaxTags = getModuleTaxonomyTags(getSquirePinType('quest'));
    const objectivePinTaxTags = getModuleTaxonomyTags(getSquirePinType('objective'));

    for (const pin of forQuest) {
        const patch = {};
        if (typeof pin.config?.objectiveIndex !== 'number') {
            patch.config = { ...(pin.config || {}), questStatus, questState };
            patch.tags = questCategoryToPinTags('quest', pin.config?.questCategory, questPinTaxTags);
            patch.text = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
            if (!pinHasConfiguredAppearance(pin.style)) {
                patch.style = {
                    ...(pin.style || {}),
                    fill: QUEST_PIN_BACKGROUND,
                    stroke: getQuestPinColor(questStatus, questState),
                    strokeWidth: Number.isFinite(pin.style?.strokeWidth)
                        ? pin.style.strokeWidth
                        : QUEST_PIN_STROKE_WIDTH_DEFAULT,
                    iconColor: BOOTSTRAP_ICON_COLOR
                };
            }
        } else if (typeof pin.config?.objectiveIndex === 'number') {
            const obj = quest.tasks[pin.config.objectiveIndex];
            const objState = obj?.state || 'active';
            patch.config = { ...(pin.config || {}), objectiveState: objState, objectiveText: (obj?.text || '').trim() };
            patch.tags = questCategoryToPinTags('objective', pin.config?.questCategory, objectivePinTaxTags);
            const objNum = String((pin.config.objectiveIndex ?? 0) + 1).padStart(2, '0');
            const objectiveText = (obj?.text || 'Objective').trim();
            patch.text = `Quest ${questNum}.${objNum}: ${objectiveText}${objectiveText.endsWith('.') ? '' : '.'}`;
            if (!pinHasConfiguredAppearance(pin.style)) {
                patch.style = {
                    ...(pin.style || {}),
                    fill: OBJECTIVE_PIN_BACKGROUND,
                    stroke: getObjectivePinColor(objState),
                    strokeWidth: Number.isFinite(pin.style?.strokeWidth)
                        ? pin.style.strokeWidth
                        : OBJECTIVE_PIN_STROKE_WIDTH_DEFAULT,
                    iconColor: BOOTSTRAP_ICON_COLOR
                };
            }
        }
        if (Object.keys(patch).length) {
            try {
                await pins.update(pin.id, patch, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
            } catch (e) {
                console.warn('Coffee Pub Squire | updateQuestPinStylesForPage:', e);
            }
        }
    }

    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Reconcile quest/objective page flags with actual pins in the Pins API.
 * - Restores pinId/sceneId on pages when pins exist.
 * - Clears stale flags when pins were deleted or unplaced externally.
 * Journal page writes require edit permission; only GMs run this to avoid
 * "lacks permission to update JournalEntryPage" on player clients.
 */
export async function reconcileQuestPins() {
    if (!game.user.isGM) return;

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const allPins = listAllModulePins(pins).filter(p => p?.config?.questUuid);

    // Build lookup by questUuid + objectiveIndex (nullable).
    const byQuest = new Map();
    for (const pin of allPins) {
        const qid = pin.config.questUuid;
        if (!qid) continue;
        const objIndex = typeof pin.config.objectiveIndex === 'number' ? pin.config.objectiveIndex : null;
        const key = objIndex === null ? qid : `${qid}|${objIndex}`;
        byQuest.set(key, pin);
    }

    // Walk all quest pages to repair flags.
    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    const pages = journal?.pages ?? [];

    for (const page of pages) {
        if (!page) continue;
        const qid = page.uuid;

        // Quest-level pin
        const questPin = byQuest.get(qid);
        const questExists = questPin ? true : false;
        if (questExists) {
            await page.setFlag(MODULE.ID, 'pinId', questPin.id);
            await page.setFlag(MODULE.ID, 'sceneId', questPin.sceneId ?? null);
        } else {
            // Verify stored pinId still exists; clear if not.
            const storedId = page.getFlag(MODULE.ID, 'pinId');
            if (storedId && !pins.exists(storedId)) {
                await page.setFlag(MODULE.ID, 'pinId', null);
                await page.setFlag(MODULE.ID, 'sceneId', null);
            }
        }

        // Objective pins
        const objectivePinsFlag = page.getFlag(MODULE.ID, 'objectivePins') || {};
        const nextObjectivePins = { ...objectivePinsFlag };

        // Clear stale entries
        for (const [key, val] of Object.entries(objectivePinsFlag)) {
            const pinId = val?.pinId ?? val;
            const exists = pinId && pins.exists(pinId);
            if (!exists) delete nextObjectivePins[key];
        }

        // Add/refresh entries from live pins
        const questPinsForPage = allPins.filter(p => p.config.questUuid === qid && typeof p.config?.objectiveIndex === 'number');
        for (const pin of questPinsForPage) {
            const idx = pin.config.objectiveIndex;
            if (typeof idx !== 'number') continue;
            nextObjectivePins[String(idx)] = { pinId: pin.id, sceneId: pin.sceneId ?? null };
        }

        await page.setFlag(MODULE.ID, 'objectivePins', nextObjectivePins);
    }
}

