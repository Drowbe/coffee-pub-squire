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

import { MODULE } from './const.js';
import { QuestParser } from './utility-quest-parser.js';
import { trackModuleTimeout } from './timer-utils.js';

// Initial design defaults per pin type. GM customises further via Configure Pin.
const PIN_DEFAULTS = {
    quest: {
        size: { w: 60, h: 60 }, shape: 'circle',
        style: { fill: '#682008', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: false, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: false, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    },
    objective: {
        size: { w: 50, h: 50 }, shape: 'circle',
        style: { fill: '#8c2d0d', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: false, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: false, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    },
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
    },
    codex: {
        size: { w: 50, h: 50 }, shape: 'circle',
        style: { fill: '#06387a', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: true, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: true, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    }
};

// ============================================================================
// TAXONOMY
// ============================================================================

const SQUIRE_PIN_TAXONOMY_KIND = Object.freeze({
    quest:     'quest',
    objective: 'objective',
    note:      'note',
    codex:     'codex'
});

const LEGACY_SQUIRE_PIN_TYPE = Object.freeze({
    quest:     'quest-pin',
    objective: 'objective-pin',
    note:      'note-pin',
    codex:     'codex-pin'
});

// Legacy type strings → canonical keys (for migration reads only).
const SQUIRE_PIN_TYPE_FIX_MAP = Object.freeze({
    ...Object.fromEntries(
        Object.entries(LEGACY_SQUIRE_PIN_TYPE).map(([k, wrong]) => [wrong, SQUIRE_PIN_TAXONOMY_KIND[k]])
    ),
    'Quest Pin':    'quest',
    'Objective Pin':'objective',
    'Note Pin':     'note',
    'Codex Pin':    'codex',
    'coffee-pub-squire-sticky-notes': 'note'
});

/** Normalize a codex category display name to a tag slug. Works for built-in and user-created categories. */
function _codexCategoryToTag(category) {
    if (!category || category === 'No Category') return null;
    return category.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || null;
}

/** Codex category → FontAwesome icon class. */
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

/** Quest category display name → taxonomy tag key. */
const QUEST_CATEGORY_TAG_MAP = {
    'Main Quest': 'main',
    'Side Quest': 'side',
    'Faction':    'faction',
    'Backstory':  'backstory'
};

const QUEST_ICON     = '<i class="fa-solid fa-flag"></i>';
const OBJECTIVE_ICON = '<i class="fa-solid fa-sign-post"></i>';
const NOTE_PIN_ICON  = 'fa-note-sticky';

// Codex placement state (module-level so cleanup can run from anywhere).
let _codexPinPlacement = null;
const CODEX_PIN_CURSOR_CLASS        = 'squire-quest-pin-placement';
const CODEX_PIN_CANVAS_CURSOR_CLASS = 'squire-quest-pin-placement-canvas';

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
 * @param {'quest'|'objective'|'note'|'codex'} kind
 */
export function getSquirePinType(kind) {
    return SQUIRE_PIN_TAXONOMY_KIND[kind] ?? kind;
}

/**
 * True if `pinType` matches the canonical or legacy type for `kind`.
 * @param {string|null|undefined} pinType
 * @param {'quest'|'objective'|'note'|'codex'} kind
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
 * @param {'quest'|'objective'|'note'|'codex'} kind
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

/**
 * List all Squire quest/objective pins across all scenes (includes unplaced).
 * Attaches a synthetic `sceneId` property for convenience.
 * @param {object} pins
 * @param {{ sceneId?: string, unplacedOnly?: boolean }} [opts]
 */
export function listAllQuestPins(pins, opts = {}) {
    if (!pins?.list) return [];
    const collect = (list, byId, sceneId = null) => {
        for (const pin of list || []) {
            if (!pin?.id || !pin?.config?.questUuid) continue;
            byId.set(pin.id, { ...pin, sceneId });
        }
    };
    const byId = new Map();
    if (opts.sceneId || opts.unplacedOnly) {
        collect(pins.list({ ...opts }) || [], byId, opts.unplacedOnly ? null : (opts.sceneId ?? null));
        return [...byId.values()];
    }
    collect(pins.list({ unplacedOnly: true }) || [], byId, null);
    for (const scene of game.scenes.contents) {
        collect(pins.list({ sceneId: scene.id }) || [], byId, scene.id);
    }
    return [...byId.values()];
}

/**
 * Find the live (preferably placed) quest-level pin for a questUuid.
 * @param {string} questUuid
 */
export function findLiveQuestPin(questUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid) return null;
    let match = null;
    for (const pin of listAllQuestPins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (typeof pin?.config?.objectiveIndex === 'number') continue;
        if (!match || (!match.sceneId && pin.sceneId)) match = pin;
    }
    return match;
}

/**
 * Find the live (preferably placed) objective pin.
 * @param {string} questUuid
 * @param {number} objectiveIndex
 */
export function findLiveObjectivePin(questUuid, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid || !Number.isInteger(objectiveIndex)) return null;
    let match = null;
    for (const pin of listAllQuestPins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (Number(pin?.config?.objectiveIndex) !== objectiveIndex) continue;
        if (!match || (!match.sceneId && pin.sceneId)) match = pin;
    }
    return match;
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

/**
 * Build pin ownership for a quest/objective pin based on visibility flags.
 * @param {JournalEntryPage} page
 * @param {object|null} [objective] - Objective data (null = quest-level pin)
 */
export function calculateQuestPinOwnership(page, objective = null) {
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
    const questVisible = page?.getFlag(MODULE.ID, 'visible') !== false;
    if (!questVisible) return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    if (objective?.state === 'hidden') return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, users: gmUsers };
}

function _calculateCodexPinOwnership(page) {
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
 * Merge the Squire initial defaults (pin-defaults.json) with the GM's saved
 * Configure Pin defaults for a given kind. Never mutates the JSON defaults.
 * @param {object} pins
 * @param {'quest'|'objective'|'note'|'codex'} kind
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

/** Map quest category string → taxonomy tags, validated against live taxonomy. */
function _questCategoryToPinTags(baseTag, category, taxonomyTags) {
    const extra = QUEST_CATEGORY_TAG_MAP[category];
    if (!taxonomyTags) return extra ? [baseTag, extra] : [baseTag];
    const tags = [];
    if (taxonomyTags.includes(baseTag)) tags.push(baseTag);
    if (extra && taxonomyTags.includes(extra)) tags.push(extra);
    return tags.length ? tags : [baseTag];
}

/** Derive codex pin tags from the category name. Works for any category including user-created ones. */
function _codexCategoryToPinTags(category) {
    const tag = _codexCategoryToTag(category);
    return tag ? [tag] : [];
}

/** Map codex category → Font Awesome icon HTML. */
function _codexCategoryToImage(category) {
    const icon = CODEX_CATEGORY_ICON_MAP[category] || 'fa-book';
    return `<i class="fa-solid ${icon}"></i>`;
}

/**
 * Resolve quest pin image from the quest page's `questIcon` flag.
 * Falls back to the default quest flag icon.
 */
function _getQuestPinImage(page) {
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

/** Stable quest number derived from UUID. */
function _getQuestNumber(questUuid) {
    if (!questUuid || typeof questUuid !== 'string') return 1;
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
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
// QUEST PINS
// ============================================================================

/**
 * Create a quest-level pin (unplaced or placed immediately).
 * Ownership reflects the quest's current `visible` flag.
 * @param {object} opts
 * @param {string}  opts.questUuid
 * @param {number}  [opts.questIndex]
 * @param {string}  [opts.questCategory='Side Quest']
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>} Created PinData or null on failure.
 */
export async function createQuestPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const { questUuid, questIndex, questCategory = 'Side Quest', x, y, sceneId } = opts;
    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership  = calculateQuestPinOwnership(page);
    const questNum   = typeof questIndex === 'number' ? questIndex : _getQuestNumber(questUuid);
    const design     = _buildMergedDesign(pins, 'quest');
    const image      = _getQuestPinImage(page);
    const questTitle = (page?.name || 'Quest').trim();
    const pinTitle   = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
    const taxTags    = _getModuleTaxonomyTags('quest');

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('quest'),
        tags:            _questCategoryToPinTags('quest', questCategory, taxTags),
        text:            pinTitle,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.quest.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.quest.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'right',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 10,
        textMaxLength:   design.textMaxLength ?? 100,
        textMaxWidth:    design.textMaxWidth ?? 30,
        textScaleWithPin:design.textScaleWithPin ?? false,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.quest.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.quest.config.blacksmithAccess,
            blacksmithVisibility: page.getFlag(MODULE.ID, 'visible') !== false ? 'visible' : 'hidden',
            questUuid,
            questIndex:   questNum,
            questCategory
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'quest'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createQuestPin:', err);
        return null;
    }
}

/**
 * Create an objective-level pin (unplaced or placed immediately).
 * @param {object} opts
 * @param {string}  opts.questUuid
 * @param {number}  opts.objectiveIndex
 * @param {number}  [opts.questIndex]
 * @param {string}  [opts.questCategory='Side Quest']
 * @param {string}  [opts.questState='visible']
 * @param {object}  [opts.objective={state:'active',text:''}]
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>}
 */
export async function createObjectivePin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const {
        questUuid, objectiveIndex, questIndex, questCategory = 'Side Quest',
        questState = 'visible', objective = { state: 'active', text: '' }, x, y, sceneId
    } = opts;
    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership = calculateQuestPinOwnership(page, objective);
    const questNum  = typeof questIndex === 'number' ? questIndex : _getQuestNumber(questUuid);
    const design    = _buildMergedDesign(pins, 'objective');
    const objNum    = String((objectiveIndex ?? 0) + 1).padStart(2, '0');
    const objText   = (objective?.text || 'Objective').trim();
    const pinTitle  = `Quest ${questNum}.${objNum}: ${objText}${objText.endsWith('.') ? '' : '.'}`;
    const taxTags   = _getModuleTaxonomyTags('objective');
    const image     = typeof design.image === 'string' && design.image.trim() ? design.image : OBJECTIVE_ICON;

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('objective'),
        tags:            _questCategoryToPinTags('objective', questCategory, taxTags),
        text:            pinTitle,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.objective.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.objective.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'under',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 12,
        textMaxLength:   design.textMaxLength ?? 100,
        textMaxWidth:    design.textMaxWidth ?? 25,
        textScaleWithPin:design.textScaleWithPin ?? false,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.objective.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.objective.config.blacksmithAccess,
            blacksmithVisibility: questState === 'hidden' || objective?.state === 'hidden' ? 'hidden' : 'visible',
            questUuid,
            questIndex:     questNum,
            objectiveIndex: objectiveIndex ?? 0,
            questCategory,
            questState,
            objectiveState: objective.state || 'active',
            objectiveText:  (objective.text || '').trim()
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'objective'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Squire | createObjectivePin:', err);
        return null;
    }
}

/**
 * Delete all quest (and objective) pins for a quest on all scenes (or one scene).
 * @param {string} questUuid
 * @param {string} [sceneId] - If provided, only delete pins placed on this scene.
 */
export async function deleteQuestPins(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const all = listAllQuestPins(pins).filter(p => p?.config?.questUuid === questUuid);
    const targets = sceneId ? all.filter(p => p.sceneId === sceneId) : all;
    for (const pin of targets) {
        try {
            await pins.delete(pin.id, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Squire | deleteQuestPins:', e);
        }
    }
}

/**
 * Unplace the quest-level pin from the canvas (pin data kept, can be re-placed).
 * @param {JournalEntryPage} page - Quest page
 */
export async function unplaceQuestPin(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const livePin = page?.uuid ? findLiveQuestPin(page.uuid) : null;
    if (!livePin?.id || !livePin.sceneId) return;
    try {
        if (typeof pins.unplace === 'function') await pins.unplace(livePin.id);
        else if (typeof pins.update === 'function') await pins.update(livePin.id, { unplace: true });
    } catch (e) {
        console.warn('Coffee Pub Squire | unplaceQuestPin:', e);
    }
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene?.id });
}

/**
 * Unplace an objective pin from the canvas.
 * @param {JournalEntryPage} page
 * @param {number} objectiveIndex
 */
export async function unplaceObjectivePin(page, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const livePin = page?.uuid ? findLiveObjectivePin(page.uuid, objectiveIndex) : null;
    if (!livePin?.id) return;
    try {
        if (typeof pins.unplace === 'function') await pins.unplace(livePin.id);
        else if (typeof pins.update === 'function') await pins.update(livePin.id, { unplace: true });
    } catch (e) {
        console.warn('Coffee Pub Squire | unplaceObjectivePin:', e);
    }
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene?.id });
}

/** Reload quest/objective pins on the current scene canvas. */
export async function reloadAllQuestPins() {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !canvas?.scene) return;
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
}

/**
 * Update pin ownership for all pins belonging to a quest after visibility changes.
 * Also updates blacksmithVisibility on quest-level pins.
 * @param {string} questUuid
 * @param {string} [sceneId]
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
    const quest    = await QuestParser.parseSinglePage(page, enrichedHtml);
    const tasks    = quest?.tasks ?? [];
    const forQuest = listAllQuestPins(pins).filter(p => p?.config?.questUuid === questUuid);
    const questHidden = page.getFlag(MODULE.ID, 'visible') === false;

    for (const pin of forQuest) {
        const objective  = typeof pin.config?.objectiveIndex === 'number' ? tasks[pin.config.objectiveIndex] : null;
        const ownership  = calculateQuestPinOwnership(page, objective);
        const isHidden   = questHidden || objective?.state === 'hidden';
        const patch = {
            ownership,
            config: {
                ...(pin.config || {}),
                blacksmithVisibility: isHidden ? 'hidden' : 'visible'
            }
        };
        try {
            await pins.update(pin.id, patch, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Squire | updateQuestPinVisibility:', e);
        }
    }
    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Update pin text, tags, and config for all pins on a quest page after content changes.
 * Does NOT update style/design — Blacksmith owns appearance after initial create.
 * @param {JournalEntryPage} page
 * @param {string} [sceneId]
 */
export async function updateQuestPinText(page, sceneId) {
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
    const quest    = await QuestParser.parseSinglePage(page, enrichedHtml);
    if (!quest) return;

    const forQuest = listAllQuestPins(pins).filter(p => p?.config?.questUuid === page.uuid);
    const questNum = _getQuestNumber(page.uuid);
    const questTitle = (page?.name || 'Quest').trim();
    const questTaxTags = _getModuleTaxonomyTags('quest');
    const objTaxTags   = _getModuleTaxonomyTags('objective');

    for (const pin of forQuest) {
        const patch = {};
        if (typeof pin.config?.objectiveIndex !== 'number') {
            // Quest-level pin: update title and tags
            patch.text = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
            patch.tags = _questCategoryToPinTags('quest', pin.config?.questCategory, questTaxTags);
            patch.config = { ...(pin.config || {}), questState: page.getFlag(MODULE.ID, 'visible') !== false ? 'visible' : 'hidden' };
        } else {
            // Objective-level pin: update text and tags
            const obj    = quest.tasks[pin.config.objectiveIndex];
            const objNum = String((pin.config.objectiveIndex ?? 0) + 1).padStart(2, '0');
            const objText = (obj?.text || 'Objective').trim();
            patch.text  = `Quest ${questNum}.${objNum}: ${objText}${objText.endsWith('.') ? '' : '.'}`;
            patch.tags  = _questCategoryToPinTags('objective', pin.config?.questCategory, objTaxTags);
            patch.config = {
                ...(pin.config || {}),
                objectiveState: obj?.state || 'active',
                objectiveText:  (obj?.text || '').trim()
            };
        }
        if (Object.keys(patch).length) {
            try {
                await pins.update(pin.id, patch, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
            } catch (e) {
                console.warn('Coffee Pub Squire | updateQuestPinText:', e);
            }
        }
    }
    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Reconcile quest page `pinId` flags against live Blacksmith pin data. GM only.
 * Restores pinId when a pin exists; clears it when the pin is gone.
 */
export async function reconcileQuestPins() {
    if (!game.user.isGM) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const allPins = listAllQuestPins(pins);
    const byQuest = new Map();
    for (const pin of allPins) {
        const qid = pin.config?.questUuid;
        if (!qid) continue;
        const objIndex = typeof pin.config?.objectiveIndex === 'number' ? pin.config.objectiveIndex : null;
        const key = objIndex === null ? qid : `${qid}|${objIndex}`;
        byQuest.set(key, pin);
    }

    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    for (const page of journal?.pages ?? []) {
        if (!page) continue;
        const livePin = byQuest.get(page.uuid);
        if (livePin) {
            await page.setFlag(MODULE.ID, 'pinId', livePin.id);
        } else {
            const storedId = page.getFlag(MODULE.ID, 'pinId');
            if (storedId && !pins.exists(storedId)) {
                await page.setFlag(MODULE.ID, 'pinId', null);
            }
        }
    }
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

// ============================================================================
// CODEX PINS
// ============================================================================

/**
 * Create a codex pin (unplaced or placed immediately).
 * @param {object} opts
 * @param {string}  opts.entryUuid
 * @param {string}  opts.entryName
 * @param {string}  [opts.entryCategory='']
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>}
 */
export async function createCodexPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const { entryUuid, entryName, entryCategory = '', x, y, sceneId } = opts;
    const page = await fromUuid(entryUuid);
    if (!page) return null;

    const design     = _buildMergedDesign(pins, 'codex');
    const ownership  = _calculateCodexPinOwnership(page);
    const tags       = _codexCategoryToPinTags(entryCategory);
    const image      = _codexCategoryToImage(entryCategory);

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('codex'),
        tags,
        text:            entryName,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.codex.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.codex.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'right',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 12,
        textMaxLength:   design.textMaxLength ?? 0,
        textMaxWidth:    design.textMaxWidth ?? 30,
        textScaleWithPin:design.textScaleWithPin ?? true,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.codex.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.codex.config.blacksmithAccess,
            blacksmithVisibility: (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? 'visible' : 'hidden',
            codexUuid:     entryUuid,
            codexCategory: entryCategory
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'codex'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (created?.id) {
            await page.setFlag(MODULE.ID, 'pinId', created.id);
        }
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created ?? null;
    } catch (err) {
        console.error('Coffee Pub Squire | createCodexPin:', err);
        return null;
    }
}

/**
 * Delete a codex pin and clear the page pinId flag.
 * @param {string} entryUuid
 */
export async function deleteCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');

    if (pinId) {
        try { await pins.delete(pinId); } catch (e) { console.warn('Coffee Pub Squire | deleteCodexPin:', e); }
    } else if (pins.list) {
        // Fallback: find by config.codexUuid in case page flag is missing.
        const found = [
            ...listSquirePinsByKind(pins, 'codex', {}),
            ...listSquirePinsByKind(pins, 'codex', { unplacedOnly: true })
        ].find(p => p?.config?.codexUuid === entryUuid);
        if (found?.id) { try { await pins.delete(found.id); } catch (e) { console.warn('Coffee Pub Squire | deleteCodexPin:', e); } }
    }

    if (page) await page.setFlag(MODULE.ID, 'pinId', null);
    const sceneId = canvas?.scene?.id;
    if (sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId }); } catch (_) {}
    }
}

/**
 * Unplace a codex pin from the canvas without deleting it.
 * @param {string} entryUuid
 */
export async function unplaceCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    if (!page) return;
    let pinId = page.getFlag(MODULE.ID, 'pinId');

    if (!pinId) {
        const found = listSquirePinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid);
        if (found?.id) {
            pinId = found.id;
            await page.setFlag(MODULE.ID, 'pinId', pinId);
        }
    }
    if (!pinId) return;

    const live = pins.get?.(pinId) ?? null;
    if (!live?.sceneId) return;

    try {
        if (typeof pins.unplace === 'function') await pins.unplace(pinId);
        else if (typeof pins.update === 'function') await pins.update(pinId, { unplace: true }, { sceneId: live.sceneId });
    } catch (e) {
        console.warn('Coffee Pub Squire | unplaceCodexPin:', e);
        ui.notifications.warn('Could not unplace the codex pin. Try again on the scene where it appears.');
        return;
    }
    if (live.sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId: live.sceneId }); } catch (_) {}
    }
}

/**
 * Update codex pin ownership to match current entry visibility.
 * @param {string} entryUuid
 */
export async function updateCodexPinVisibility(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;
    const isVisible  = (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const ownership  = _calculateCodexPinOwnership(page);
    const live       = pins.get?.(pinId);
    try {
        await pins.update(pinId, {
            ownership,
            config: { ...(live?.config || {}), blacksmithVisibility: isVisible ? 'visible' : 'hidden' }
        });
    } catch (e) {
        console.warn('Coffee Pub Squire | updateCodexPinVisibility:', e);
    }
}

/**
 * Warn the GM when a codex pin's visibility is edited directly in Configure Pin.
 *
 * Codex pin visibility is DERIVED from the entry's ownership, not configured:
 *  - the pin's `ownership` (not `blacksmithVisibility`) is what actually gates
 *    players, so flipping this to 'visible' on a hidden entry shows them nothing;
 *  - `updateCodexPinVisibility()` re-derives it whenever the entry is revealed or
 *    hidden, so the edit is silently reverted later.
 *
 * The edit is therefore a no-op that looks like it worked. Say so, rather than
 * let the GM believe they revealed something. Reveal the entry in the tray and
 * the pin follows.
 *
 * Self-limiting: our own sync writes always patch visibility to the derived
 * value, so they never trip the warning.
 */
async function _warnIfCodexPinVisibilityEdited(evt) {
    try {
        if (!game.user?.isGM) return;
        // Only react when this update actually carried a visibility value.
        const next = evt?.patch?.config?.blacksmithVisibility;
        if (next !== 'visible' && next !== 'hidden') return;

        const entryUuid = evt.pin?.config?.codexUuid;
        if (!entryUuid) return;
        const page = await fromUuid(entryUuid);
        if (!page) return;

        const derived = (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
            ? 'visible'
            : 'hidden';
        if (next === derived) return;

        ui.notifications.warn(
            `Codex pin visibility follows the codex entry, not the pin — this change won't reach players and will be overwritten. `
            + `Use the visibility toggle on "${page.name}" in the Squire codex tray instead.`
        );
    } catch (e) {
        console.warn('Coffee Pub Squire | _warnIfCodexPinVisibilityEdited:', e);
    }
}

/**
 * Update codex pin text, image, tags, and config after entry changes.
 * @param {string} entryUuid
 * @param {{ entryName?: string, entryCategory?: string }} [opts]
 */
export async function updateCodexPin(entryUuid, opts = {}) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;

    const taxonomyTags  = _getModuleTaxonomyTags('codex');
    const entryName     = String(opts.entryName || page?.name || '').trim();
    const entryCategory = String(opts.entryCategory || '').trim();

    const patch = {
        text:  entryName || page?.name || '',
        image: _codexCategoryToImage(entryCategory),
        tags:  _codexCategoryToPinTags(entryCategory),
        config: { codexUuid: entryUuid, codexCategory: entryCategory }
    };
    try {
        await pins.update(pinId, patch);
    } catch (e) {
        console.warn('Coffee Pub Squire | updateCodexPin:', e);
    }
}

/**
 * Reconcile codex page pinId flags against live Blacksmith data. GM only.
 * Clears pinId when the referenced pin no longer exists.
 */
export async function reconcileCodexPins() {
    if (!game.user.isGM) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    if (!journal) return;
    for (const page of journal.pages.contents) {
        const storedPinId = page.getFlag(MODULE.ID, 'pinId');
        if (!storedPinId) continue;
        const exists = typeof pins.exists === 'function' ? pins.exists(storedPinId) : !!pins.get?.(storedPinId);
        if (!exists) await page.setFlag(MODULE.ID, 'pinId', null);
    }
}

/**
 * Begin interactive placement of a codex pin on the current canvas scene.
 * @param {string} entryUuid
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

    const page = await fromUuid(entryUuid);
    if (!page) return;

    // Guard: check if already placed via API (live source of truth).
    const placed = listSquirePinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid && p.sceneId);
    if (placed?.id) {
        if (placed.sceneId === canvas.scene.id) {
            ui.notifications.warn('This codex entry is already pinned on this scene. Unplace it first to move it.');
        } else {
            ui.notifications.warn('This codex entry is pinned on another scene. Unplace it first to pin here.');
        }
        return;
    }

    // Clear stale page flag if the referenced pin no longer exists.
    const storedPinId = page.getFlag(MODULE.ID, 'pinId');
    if (storedPinId && !(typeof pins.exists === 'function' ? pins.exists(storedPinId) : !!pins.get?.(storedPinId))) {
        await page.setFlag(MODULE.ID, 'pinId', null);
    }

    if (_codexPinPlacement) _clearCodexPinPlacement();

    ui.notifications.info('Click on the map to place the codex pin. Press Esc to cancel.');
    document.body.classList.add(CODEX_PIN_CURSOR_CLASS);
    document.body.style.cursor = 'crosshair';
    const view = canvas.app.view;
    view.classList.add(CODEX_PIN_CANVAS_CURSOR_CLASS);

    const sizePx    = PIN_DEFAULTS.codex.size.w;
    const previewEl = document.createElement('div');
    previewEl.className      = 'quest-pin-preview';
    previewEl.dataset.shape  = 'circle';
    previewEl.style.setProperty('--quest-pin-width',        `${sizePx}px`);
    previewEl.style.setProperty('--quest-pin-height',       `${sizePx}px`);
    previewEl.style.setProperty('--quest-pin-fill',         PIN_DEFAULTS.codex.style.fill);
    previewEl.style.setProperty('--quest-pin-stroke',       PIN_DEFAULTS.codex.style.stroke);
    previewEl.style.setProperty('--quest-pin-stroke-width', `${PIN_DEFAULTS.codex.style.strokeWidth}px`);
    previewEl.innerHTML = `<div class="quest-pin-preview-inner">${_codexCategoryToImage(entryCategory)}</div>`;
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
        const localPos = canvas.stage?.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        if (!localPos) {
            ui.notifications.warn('Unable to place pin: canvas position unavailable.');
            _clearCodexPinPlacement();
            return;
        }

        const freshPage = await fromUuid(entryUuid);
        if (!freshPage) { _clearCodexPinPlacement(); return; }

        // Delete any existing codex pin for this entry before re-placing to avoid duplicates.
        // Check both the active scene and the unplaced store.
        const existingPin =
            listSquirePinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid) ||
            listSquirePinsByKind(pins, 'codex', { unplacedOnly: true }).find(p => p?.config?.codexUuid === entryUuid);
        if (existingPin?.id) {
            try {
                await pins.delete(existingPin.id, existingPin.sceneId ? { sceneId: existingPin.sceneId } : undefined);
            } catch (e) {
                console.warn('Coffee Pub Squire | Auto-delete codex pin before re-place:', e);
            }
        }

        const created = await createCodexPin({
            entryUuid,
            entryName,
            entryCategory,
            sceneId: canvas.scene.id,
            x: localPos.x,
            y: localPos.y
        });
        if (!created?.id) {
            ui.notifications.error('Failed to create codex pin.');
            _clearCodexPinPlacement();
            return;
        }
        await freshPage.setFlag(MODULE.ID, 'pinId', created.id);
        _clearCodexPinPlacement();
        ui.notifications.info('Codex pin placed.');
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
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove);
    _codexPinPlacement = { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown };
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

/**
 * One-time migration: clear legacy status-based stroke colors from quest/objective pins.
 *
 * The pre-13.3.0 quest-pin.js (since deleted) drew quest/objective rings with state colors
 * (failed = red, completed = green, hidden = grey). The 13.3.0 Blacksmith migration baked
 * each pin's then-current ring color into `style.stroke`, where it is now frozen. Blacksmith
 * renders the border purely from `style.stroke` — it has no status-based border logic; the
 * only status visual it owns is the visible/hidden opacity, which we deliberately leave alone.
 *
 * We are not adding or overriding any rendering: this is data hygiene on Squire-owned style.
 * Each existing quest/objective pin's stroke (+ strokeWidth, iconColor) is reset to what the
 * current create path writes today (via `_buildMergedDesign`, so a GM-saved "default for type"
 * still wins). `fill`, `ownership`, and `blacksmithVisibility` are untouched.
 *
 * Gated by the world flag `pinStrokeMigrationDone` so it runs exactly once — afterward a GM's
 * own stroke customizations persist. GM-only.
 */
export async function migrateSquirePinStyles() {
    const result = { checked: 0, updated: 0, failed: 0 };
    if (!game.user?.isGM) return result;
    if (game.settings.get(MODULE.ID, 'pinStrokeMigrationDone')) return result;

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.list !== 'function' || typeof pins.update !== 'function') return result;
    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
    } catch (e) {
        console.warn('Coffee Pub Squire | migrateSquirePinStyles: pins API not ready', e);
        return result; // Do not set the flag — retry on a later load.
    }

    // Target stroke per kind = what a freshly created pin gets today (respects GM-saved defaults).
    const targetStyle = {
        quest:     _buildMergedDesign(pins, 'quest').style     ?? PIN_DEFAULTS.quest.style,
        objective: _buildMergedDesign(pins, 'objective').style ?? PIN_DEFAULTS.objective.style
    };

    const reloadedSceneIds = new Set();
    // listAllQuestPins covers quest AND objective pins (both carry config.questUuid),
    // placed and unplaced, with a synthetic sceneId (null when unplaced).
    for (const pin of listAllQuestPins(pins)) {
        if (!pin?.id) continue;
        result.checked++;
        const kind = pin?.config?.objectiveIndex != null ? 'objective' : 'quest';
        const want = targetStyle[kind];
        const cur  = pin.style || {};
        // Idempotent: skip pins whose stroke already matches the current design.
        if (cur.stroke === want.stroke
            && cur.strokeWidth === want.strokeWidth
            && cur.iconColor === want.iconColor) continue;
        const patch = {
            style: { ...cur, stroke: want.stroke, strokeWidth: want.strokeWidth, iconColor: want.iconColor }
        };
        try {
            const sceneId = pin.sceneId || undefined;
            await pins.update(pin.id, patch, sceneId ? { sceneId } : undefined);
            result.updated++;
            if (sceneId) reloadedSceneIds.add(sceneId);
        } catch (e) {
            result.failed++;
            console.warn('Coffee Pub Squire | migrateSquirePinStyles:', e);
        }
    }

    for (const sceneId of reloadedSceneIds) {
        try { await pins.reload?.({ sceneId }); } catch (_) {}
    }

    // Mark done only on a clean run, so a partial failure retries on the next load.
    if (result.failed === 0) {
        try { await game.settings.set(MODULE.ID, 'pinStrokeMigrationDone', true); } catch (_) {}
    }
    if (result.updated || result.failed) {
        console.info(`Coffee Pub Squire | Quest/objective pin stroke migration: checked ${result.checked}, updated ${result.updated}, failed ${result.failed}.`);
    }
    return result;
}

/**
 * Migrate codex `codexPinId` flags → standardized `pinId`.
 * Also clears stale `codexSceneId` flags. GM-only, runs once on init.
 */
async function _migrateCodexPinFlags() {
    if (!game.user.isGM) return;
    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    if (!journal) return;
    for (const page of journal.pages.contents) {
        const codexPinId = page.getFlag(MODULE.ID, 'codexPinId');
        if (codexPinId) {
            await page.setFlag(MODULE.ID, 'pinId', codexPinId);
            await page.unsetFlag(MODULE.ID, 'codexPinId');
        }
        // codexSceneId is no longer tracked — Blacksmith owns position.
        const codexSceneId = page.getFlag(MODULE.ID, 'codexSceneId');
        if (codexSceneId !== undefined && codexSceneId !== null) {
            await page.unsetFlag(MODULE.ID, 'codexSceneId');
        }
    }
}

// ============================================================================
// LIFECYCLE — EVENT HANDLERS & CONTEXT MENUS (internal)
// ============================================================================

let _pinManagerController = null;
let _contextMenuDisposers = [];
let _sceneSyncHookId      = null;
let _resolveOwnershipHookId = null;
let _pinManagerInitialized = false;
let _syncDebounceTimer    = null;
let _syncPending          = false;

function _getPanelManager() {
    return game.modules.get(MODULE.ID)?.api?.PanelManager?.instance ?? null;
}

let _notesSyncPending = false;
let _notesSyncTimer   = null;
let _codexSyncPending = false;
let _codexSyncTimer   = null;

function _scheduleQuestPanelRefresh() {
    _syncPending = true;
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = trackModuleTimeout(async () => {
        _syncDebounceTimer = null;
        if (!_syncPending) return;
        _syncPending = false;
        const pins = getPinsApi();
        if (canvas?.scene?.id && typeof pins?.reload === 'function') {
            try { await pins.reload({ sceneId: canvas.scene.id }); } catch (_) {}
        }
        const pm = _getPanelManager();
        const panelEl = pm?.questPanel?.element;
        if (!pm?.questPanel || !panelEl) return;
        if (typeof pm.questPanel.render === 'function') await pm.questPanel.render(panelEl);
    }, 50);
}

function _scheduleNotesPanelRefresh(cleanupMissingPins = false) {
    _notesSyncPending = true;
    if (_notesSyncTimer) clearTimeout(_notesSyncTimer);
    _notesSyncTimer = trackModuleTimeout(async () => {
        _notesSyncTimer = null;
        if (!_notesSyncPending) return;
        _notesSyncPending = false;
        const pm = _getPanelManager();
        const panel = pm?.notesPanel;
        const panelEl = panel?.element;
        if (!panel || !panelEl) return;
        if (cleanupMissingPins && typeof panel._cleanupMissingPins === 'function') {
            await panel._cleanupMissingPins();
        } else {
            if (typeof panel.render === 'function') await panel.render(panelEl);
        }
    }, 75);
}

function _scheduleCodexPanelRefresh() {
    _codexSyncPending = true;
    if (_codexSyncTimer) clearTimeout(_codexSyncTimer);
    _codexSyncTimer = trackModuleTimeout(async () => {
        _codexSyncTimer = null;
        if (!_codexSyncPending) return;
        _codexSyncPending = false;
        const pm = _getPanelManager();
        const panel = pm?.codexPanel;
        const panelEl = panel?.element;
        if (!panel || !panelEl) return;
        if (typeof panel.render === 'function') await panel.render(panelEl);
    }, 50);
}

// ---- Context menu item helpers ----

async function _updateObjectiveStateInJournal(page, objectiveIndex, newState) {
    const content    = page.text?.content || '';
    const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
    if (!tasksMatch) return false;
    const ulDoc = new DOMParser().parseFromString(`<ul>${tasksMatch[1]}</ul>`, 'text/html');
    const ul    = ulDoc.querySelector('ul');
    const li    = (ul ? Array.from(ul.children) : [])[objectiveIndex];
    if (!li) return false;
    let plainHtml = li.innerHTML;
    const s = li.querySelector('s'), code = li.querySelector('code'), em = li.querySelector('em');
    if (s) plainHtml = s.innerHTML;
    else if (code) plainHtml = code.innerHTML;
    else if (em)   plainHtml = em.innerHTML;
    if (newState === 'active')     li.innerHTML = plainHtml;
    else if (newState === 'completed') li.innerHTML = `<s>${plainHtml}</s>`;
    else if (newState === 'failed')    li.innerHTML = `<code>${plainHtml}</code>`;
    else if (newState === 'hidden')    li.innerHTML = `<em>${plainHtml}</em>`;
    const newContent = content.replace(tasksMatch[1], ul.innerHTML);
    await page.update({ text: { content: newContent } });
    return true;
}

async function _toggleQuestVisibility(questUuid) {
    const page = await fromUuid(questUuid);
    if (!page) return;
    const visible    = page.getFlag(MODULE.ID, 'visible');
    const newVisible = visible !== false;
    await page.setFlag(MODULE.ID, 'visible', !newVisible);
    await updateQuestPinVisibility(questUuid, canvas.scene?.id);
}

function _registerContextMenuItems(pins) {
    if (!pins?.registerContextMenuItem) return;
    _contextMenuDisposers.forEach(d => { try { if (typeof d === 'function') d(); } catch (_) {} });
    _contextMenuDisposers = [];

    // --- Quest context menu items ---
    _contextMenuDisposers.push(
        pins.registerContextMenuItem(`${MODULE.ID}-quest-complete-objective`, {
            name: 'Complete Objective',
            icon: '<i class="fa-solid fa-check"></i>',
            moduleId: MODULE.ID,
            order: 10,
            gmOnly: true,
            visible: (pin) => pin?.moduleId === MODULE.ID && isSquirePinCategory(pin?.type, 'objective'),
            onClick: async (pin) => {
                const questUuid = pin?.config?.questUuid;
                const objIndex  = pin?.config?.objectiveIndex;
                if (questUuid == null || objIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                const updated = await _updateObjectiveStateInJournal(page, objIndex, 'completed');
                if (updated) {
                    const objText = (pin?.config?.objectiveText || '').trim() || `Objective ${objIndex + 1}`;
                    const pm = _getPanelManager();
                    if (typeof pm?.questPanel?.notifyObjectiveCompleted === 'function') {
                        pm.questPanel.notifyObjectiveCompleted(objText);
                    } else {
                        ui.notifications.info(`Objective completed: ${objText}`);
                    }
                    await updateQuestPinVisibility(questUuid, canvas.scene?.id);
                }
            }
        }),

        pins.registerContextMenuItem(`${MODULE.ID}-quest-fail-objective`, {
            name: 'Fail Objective',
            icon: '<i class="fa-solid fa-xmark"></i>',
            moduleId: MODULE.ID,
            order: 20,
            gmOnly: true,
            visible: (pin) => pin?.moduleId === MODULE.ID && isSquirePinCategory(pin?.type, 'objective'),
            onClick: async (pin) => {
                const questUuid = pin?.config?.questUuid;
                const objIndex  = pin?.config?.objectiveIndex;
                if (questUuid == null || objIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                await _updateObjectiveStateInJournal(page, objIndex, 'failed');
                await updateQuestPinVisibility(questUuid, canvas.scene?.id);
            }
        }),

        pins.registerContextMenuItem(`${MODULE.ID}-quest-toggle-hidden`, {
            name: 'Toggle Hidden from Players',
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            moduleId: MODULE.ID,
            order: 30,
            gmOnly: true,
            visible: (pin) => pin?.moduleId === MODULE.ID && isSquirePinCategory(pin?.type, 'quest'),
            onClick: async (pin) => {
                const questUuid = pin?.config?.questUuid;
                if (!questUuid) return;
                await _toggleQuestVisibility(questUuid);
            }
        }),

        pins.registerContextMenuItem(`${MODULE.ID}-quest-toggle-objective-hidden`, {
            name: 'Toggle Objective Hidden',
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            moduleId: MODULE.ID,
            order: 32,
            gmOnly: true,
            visible: (pin) => pin?.moduleId === MODULE.ID && isSquirePinCategory(pin?.type, 'objective'),
            onClick: async (pin) => {
                const questUuid = pin?.config?.questUuid;
                const objIndex  = pin?.config?.objectiveIndex;
                if (questUuid == null || objIndex == null) return;
                const page = await fromUuid(questUuid);
                if (!page) return;
                const newState = pin?.config?.objectiveState === 'hidden' ? 'active' : 'hidden';
                await _updateObjectiveStateInJournal(page, objIndex, newState);
                await updateQuestPinVisibility(questUuid, canvas.scene?.id);
            }
        })
    );

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
                const confirmed = await Dialog.confirm({ title: 'Delete Note', content: '<p>Delete this note?</p>', defaultYes: false });
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
            pins.registerPinType(MODULE.ID, getSquirePinType('quest'),     'Quest Pin');
            pins.registerPinType(MODULE.ID, getSquirePinType('objective'), 'Objective Pin');
            pins.registerPinType(MODULE.ID, getSquirePinType('note'),      'Note Pin');
            pins.registerPinType(MODULE.ID, getSquirePinType('codex'),     'Codex Pin');
        } catch (_) {}
    }

    // Quest / Objective — doubleClick opens quest panel
    pins.on('doubleClick', async (evt) => {
        const pin = evt?.pin ?? evt?.pinData;
        if (!pin) return;
        const config = pin.config || {};
        const isQuestPin = isSquirePinCategory(pin.type, 'quest')
            || isSquirePinCategory(pin.type, 'objective')
            || !!config.questUuid;
        if (!isQuestPin) return;
        const questUuid = config.questUuid;
        if (!questUuid) return;
        const objectiveIndex = config.objectiveIndex;

        const pm = _getPanelManager();
        if (!pm) return;
        if (pm.setViewMode) await pm.setViewMode('quest');
        if (pm.element && !pm.element.classList.contains('expanded')) pm.element.classList.add('expanded');
        if (pm.questPanel?.render && pm.element) await pm.questPanel.render(pm.element);

        const pinFilter = _mapQuestStatusToFilter(config.questStatus);
        let targetFilter = pm.questPanel?.resolveStatusFilterForQuestUuid?.(questUuid) ?? pinFilter ?? 'active';
        if (typeof pm.questPanel?.applyQuestStatusFilter === 'function') pm.questPanel.applyQuestStatusFilter(targetFilter);
        if (!_hasQuestEntryInDom(questUuid)) {
            for (const f of [...new Set([pinFilter, 'active', 'available', 'complete'].filter(Boolean))]) {
                if (_hasQuestEntryInDom(questUuid)) break;
                pm.questPanel?.applyQuestStatusFilter?.(f);
            }
        }
        const tryFocus = () => _focusQuestEntryInDom(questUuid, objectiveIndex);
        tryFocus();
        trackModuleTimeout(tryFocus, 200);
        trackModuleTimeout(tryFocus, 500);
        trackModuleTimeout(tryFocus, 1000);
    }, { moduleId: MODULE.ID, signal });

    // Note — click opens note card; doubleClick opens note window
    pins.on('click', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const pm = _getPanelManager();
        if (!pm) return;
        if (pm.notesPanel?.showNote) {
            pm.notesPanel.showNote(noteUuid);
        } else {
            if (pm.setViewMode) await pm.setViewMode('notes');
            if (pm.element && !pm.element.classList.contains('expanded')) pm.element.classList.add('expanded');
            if (pm.notesPanel?.render && pm.element) await pm.notesPanel.render(pm.element);
        }
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

    // Codex — doubleClick opens codex panel
    pins.on('doubleClick', async (evt) => {
        const pin = evt?.pin;
        if (!pin) return;
        if (pin.moduleId != null && pin.moduleId !== MODULE.ID) return;
        const codexUuid = pin.config?.codexUuid;
        if (!codexUuid) return;
        const pm = _getPanelManager();
        if (!pm) return;
        if (pm.element && !pm.element.classList.contains('expanded')) pm.element.classList.add('expanded');
        if (pm.setViewMode) await pm.setViewMode('codex');
        if (pm.codexPanel?.render && pm.element) await pm.codexPanel.render(pm.element);
        const tryFocus = () => {
            // Prefer the panel's own focus: it records the expansion, so the entry
            // stays open across the next re-render. The raw-DOM fallback below only
            // sets a class, which any render would immediately undo.
            if (pm.codexPanel?._focusEntry) return pm.codexPanel._focusEntry(codexUuid);
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
    }, { moduleId: MODULE.ID, signal });

    // ---- Lifecycle events -------------------------------------------------------

    // deleted: clear pinId flag from note/codex page; refresh quest panel.
    pins.on('deleted', (evt) => {
        const noteUuid  = evt.pin?.config?.noteUuid  ?? evt.config?.noteUuid;
        const codexUuid = evt.pin?.config?.codexUuid ?? evt.config?.codexUuid;
        const questUuid = evt.pin?.config?.questUuid ?? evt.config?.questUuid;
        if (noteUuid) {
            fromUuid(noteUuid).then(page => {
                if (!page) return;
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
                const storedId = page.getFlag(MODULE.ID, 'pinId');
                if (evt.pinId && storedId !== evt.pinId) return;
                page.setFlag(MODULE.ID, 'pinId', null).then(() => _scheduleNotesPanelRefresh());
            });
        } else if (codexUuid) {
            fromUuid(codexUuid).then(page => {
                if (!page) return;
                const storedId = page.getFlag(MODULE.ID, 'pinId');
                if (evt.pinId && storedId !== evt.pinId) return;
                page.setFlag(MODULE.ID, 'pinId', null).then(() => _scheduleCodexPanelRefresh());
            });
        } else if (questUuid) {
            _scheduleQuestPanelRefresh();
        }
    }, { moduleId: MODULE.ID, signal });

    // unplaced: refresh the relevant panel.
    pins.on('unplaced', (evt) => {
        const noteUuid  = evt.pin?.config?.noteUuid;
        const codexUuid = evt.pin?.config?.codexUuid;
        if (noteUuid)       _scheduleNotesPanelRefresh();
        else if (codexUuid) _scheduleCodexPanelRefresh();
        else                _scheduleQuestPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // placed: sync pinId flag for codex; quest refresh; notes handle their own flag.
    pins.on('placed', (evt) => {
        const noteUuid  = evt.pin?.config?.noteUuid;
        const codexUuid = evt.pin?.config?.codexUuid;
        if (noteUuid) return; // createNotePin writes pinId flag itself
        if (codexUuid) {
            fromUuid(codexUuid).then(page => {
                if (!page) return;
                if (evt.pinId && page.getFlag(MODULE.ID, 'pinId') !== evt.pinId) {
                    page.setFlag(MODULE.ID, 'pinId', evt.pinId).then(() => _scheduleCodexPanelRefresh());
                } else {
                    _scheduleCodexPanelRefresh();
                }
            });
        } else {
            _scheduleQuestPanelRefresh();
        }
    }, { moduleId: MODULE.ID, signal });

    // updated: notes ignore (Blacksmith owns design); codex and quest refresh.
    pins.on('updated', (evt) => {
        const noteUuid  = evt.pin?.config?.noteUuid;
        const codexUuid = evt.pin?.config?.codexUuid;
        if (noteUuid) return;
        if (codexUuid) {
            // Fire-and-forget: never let a diagnostic block the refresh.
            _warnIfCodexPinVisibilityEdited(evt);
            _scheduleCodexPanelRefresh();
        }
        else _scheduleQuestPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // created: notes handle their own flag; codex and quest refresh.
    pins.on('created', (evt) => {
        const noteUuid  = evt.pin?.config?.noteUuid;
        const codexUuid = evt.pin?.config?.codexUuid;
        if (noteUuid) return; // createNotePin writes pinId flag; updateJournalEntryPage → render
        if (codexUuid) _scheduleCodexPanelRefresh();
        else           _scheduleQuestPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // bulk deletes: refresh all panels.
    pins.on('deletedAll',       () => { _scheduleNotesPanelRefresh(true); _scheduleCodexPanelRefresh(); _scheduleQuestPanelRefresh(); }, { moduleId: MODULE.ID, signal });
    pins.on('deletedAllByType', () => { _scheduleNotesPanelRefresh(true); _scheduleCodexPanelRefresh(); _scheduleQuestPanelRefresh(); }, { moduleId: MODULE.ID, signal });
}


/** Clean up stale quest pinId flags after a scene update. */
async function _syncQuestForScene(sceneId) {
    if (!game.user?.isGM) return;
    const pins = getPinsApi();
    if (!sceneId || !isPinsApiAvailable(pins)) return;
    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    if (!journalId || journalId === 'none') return;
    const journal = game.journal.get(journalId);
    if (!journal?.pages) return;
    let changed = false;
    for (const page of journal.pages.contents || []) {
        if (!page?.id || typeof page.getFlag !== 'function') continue;
        const pinId = page.getFlag(MODULE.ID, 'pinId');
        if (!pinId) continue;
        const exists = typeof pins.exists === 'function' ? pins.exists(pinId) : !!pins.get?.(pinId);
        if (!exists) {
            await page.setFlag(MODULE.ID, 'pinId', null);
            changed = true;
        }
    }
    if (changed) _scheduleQuestPanelRefresh();
}

// ---- DOM helpers used by event handlers ----

function _hasQuestEntryInDom(questUuid) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;
    const section = entry.closest('.quest-section[data-status]');
    if (!section) return true;
    return section.style.display !== 'none';
}

function _focusQuestEntryInDom(questUuid, objectiveIndex = null) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;
    entry.classList.remove('collapsed');
    entry.classList.add('quest-highlighted');
    entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
    trackModuleTimeout(() => entry.classList.remove('quest-highlighted'), 2000);
    const objIndex = objectiveIndex !== null ? parseInt(objectiveIndex, 10) : null;
    if (objIndex !== null && !Number.isNaN(objIndex)) {
        const taskItem = entry.querySelector(`.quest-entry-tasks li[data-task-index="${objIndex}"]`);
        if (taskItem) {
            taskItem.classList.add('objective-highlighted');
            trackModuleTimeout(() => taskItem.classList.remove('objective-highlighted'), 2000);
        }
    }
    return true;
}

function _mapQuestStatusToFilter(questStatus) {
    if (typeof questStatus !== 'string') return null;
    switch (questStatus) {
        case 'In Progress': return 'active';
        case 'Not Started': return 'available';
        case 'Complete':
        case 'Failed':      return 'complete';
        default:            return null;
    }
}

/** Normalize a pin image string back to the {type, value} flag shape for noteIcon. */
function _normalizeImageToNoteIconFlag(image) {
    if (!image || typeof image !== 'string') return null;
    const trimmed = image.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('<img')) {
        const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
        return srcMatch?.[1] ? { type: 'img', value: srcMatch[1] } : null;
    }
    if (trimmed.startsWith('<i') && trimmed.includes('fa-')) {
        const classMatch = trimmed.match(/class=["']([^"']+)["']/i);
        return classMatch?.[1] ? { type: 'fa', value: classMatch[1] } : null;
    }
    if (trimmed.includes('fa-')) return { type: 'fa', value: trimmed };
    if (/^(https?:\/\/|\/|modules\/)/.test(trimmed)) return { type: 'img', value: trimmed };
    return null;
}

// ============================================================================
// TAXONOMY REGISTRATION
// ============================================================================

async function _registerTaxonomy(pins) {
    if (!isPinsApiAvailable(pins) || typeof pins.registerPinTaxonomy !== 'function') return;
    try {
        pins.registerPinTaxonomy(MODULE.ID, getSquirePinType('quest'),     { label: 'Quest',       tags: ['quest', 'main', 'side', 'faction', 'backstory'] });
        pins.registerPinTaxonomy(MODULE.ID, getSquirePinType('objective'), { label: 'Objective',   tags: ['objective', 'main', 'side', 'faction', 'backstory'] });
        pins.registerPinTaxonomy(MODULE.ID, getSquirePinType('note'),      { label: 'Note',        tags: ['personal', 'party', 'gm-notes', 'reminder'] });
        pins.registerPinTaxonomy(MODULE.ID, getSquirePinType('codex'),     { label: 'Codex Entry', tags: [] });
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

    // Scene flag changes — no pins.on() equivalent; keep as Foundry Hook.
    if (!_sceneSyncHookId) {
        _sceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || scene.id !== canvas?.scene?.id || !changes?.flags) return;
            _syncQuestForScene(scene.id);
        });
    }

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

    // Run migrations (GM only).
    await _migrateCodexPinFlags();

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

    if (_sceneSyncHookId !== null) {
        try { Hooks.off('updateScene', _sceneSyncHookId); } catch (_) {}
        _sceneSyncHookId = null;
    }

    if (_resolveOwnershipHookId !== null) {
        try { Hooks.off('blacksmith.pins.resolveOwnership', _resolveOwnershipHookId); } catch (_) {}
        _resolveOwnershipHookId = null;
    }

    if (_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
    _syncPending = false;
    if (_notesSyncTimer) { clearTimeout(_notesSyncTimer); _notesSyncTimer = null; }
    _notesSyncPending = false;
    if (_codexSyncTimer) { clearTimeout(_codexSyncTimer); _codexSyncTimer = null; }
    _codexSyncPending = false;

    if (_codexPinPlacement) _clearCodexPinPlacement();

    _pinManagerInitialized = false;
    console.info('Coffee Pub Squire | Pin manager torn down.');
}
