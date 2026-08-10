// ================================================================== 
// ===== EXTRACTIONS ================================================
// ================================================================== 

// Get Module Data
export async function getModuleJson(relative = "../module.json") {
    const url = new URL(relative, import.meta.url).href; // resolves relative to THIS file
    // return await foundry.utils.fetchJsonWithTimeout(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.json();
}
const moduleData = await getModuleJson();
/**
 * Extracts the last segment of a module id and uppercases it.
 * Example: "coffee-pub-blacksmith" -> "BLACKSMITH"
 */
function getModuleCodeName(moduleId) {
    if (!moduleId || typeof moduleId !== "string") return "";
    const parts = moduleId.split("-");
    return parts.at(-1)?.toUpperCase() ?? "";
}
const strName = getModuleCodeName(moduleData.id);
// ================================================================== 
// ===== EXPORTS ====================================================
// ================================================================== 

// MODULE CONSTANTS
export const MODULE = {
    ID: moduleData.id, 
    NAME: strName, // Extracted from moduleData.title
    TITLE: moduleData.title,
    VERSION: moduleData.version, 
    AUTHOR: moduleData.authors[0]?.name || 'COFFEE PUB',
    DESCRIPTION: moduleData.description,
};


export const PANELS = {
    FAVORITES: 'favorites',
    SPELLS: 'spells',
    WEAPONS: 'weapons',
    INVENTORY: 'inventory',
    FEATURES: 'features',
    PARTY_STATS: 'party-stats'
};

export const CSS_CLASSES = {
    TRAY: 'squire-tray',
    TRAY_VISIBLE: 'squire-tray-visible',
    TAB_ACTIVE: 'tab-active',
    PANEL_VISIBLE: 'panel-visible'
}; 

export const SQUIRE = {
    TRAY_OFFSET_WIDTH: '6px',
    TRAY_HANDLE_WIDTH: '25px',
    TRAY_HANDLE_ADJUSTMENT: '8px'
}; 

/**
 * Codex category → Font Awesome icon, WITHOUT the `fa-solid` style prefix.
 *
 * The single source of truth. The tray card and the canvas pin each used to keep
 * their own copy, and they drifted: 13.3.9 added Establishments/Landmarks to the
 * tray's map only, so pinning either one silently produced the `fa-book`
 * fallback. Add a category here and both surfaces get it.
 *
 * Keys must match the title-cased form `_refreshData()` produces.
 */
export const CODEX_CATEGORY_ICONS = Object.freeze({
    'No Category':    'fa-question-circle',
    'Artifacts':      'fa-gem',
    'Books':          'fa-book',
    'Characters':     'fa-user',
    'Establishments': 'fa-shop',
    'Events':         'fa-calendar-star',
    'Factions':       'fa-shield-cross',
    'Items':          'fa-box',
    'Landmarks':      'fa-monument',
    'Locations':      'fa-location-pin',
    'Lore':           'fa-scroll',
    'Maps':           'fa-map'
});

/** Icon used when a category has no mapping. */
export const CODEX_CATEGORY_ICON_FALLBACK = 'fa-book';

/**
 * Resolve a codex category to a bare FA icon class.
 * @param {string} category
 * @returns {string} e.g. 'fa-user'
 */
export function getCodexCategoryIcon(category) {
    return CODEX_CATEGORY_ICONS[String(category ?? '').trim()] || CODEX_CATEGORY_ICON_FALLBACK;
}

export const HELPERS = {
    formatNumber: function(number) {
        if (number === undefined || number === null) return "0";
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + "M";
        } else if (number >= 1000) {
            return (number / 1000).toFixed(1) + "K";
        } else {
            return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    }
}; 

// ================================================================== 
// ===== TEMPLATES ==================================================
// ================================================================== 

export const TEMPLATES = {
    TRAY: `modules/${MODULE.ID}/templates/tray.hbs`,
    PANEL_CHARACTER: `modules/${MODULE.ID}/templates/panel-character.hbs`,
    PANEL_GM: `modules/${MODULE.ID}/templates/panel-gm.hbs`,
    PANEL_CONTROL: `modules/${MODULE.ID}/templates/panel-control.hbs`,
    PANEL_COMPENDIUM_SEARCH: `modules/${MODULE.ID}/templates/panel-compendium-search.hbs`,
    PANEL_SPELLS: `modules/${MODULE.ID}/templates/panel-spells.hbs`,
    PANEL_WEAPONS: `modules/${MODULE.ID}/templates/panel-weapons.hbs`,
    PANEL_INVENTORY: `modules/${MODULE.ID}/templates/panel-inventory.hbs`,
    PANEL_FAVORITES: `modules/${MODULE.ID}/templates/panel-favorites.hbs`,
    PANEL_FEATURES: `modules/${MODULE.ID}/templates/panel-features.hbs`,
    PANEL_CHARACTER_SUMMARY: `modules/${MODULE.ID}/templates/panel-character-summary.hbs`,
    PANEL_PARTY: `modules/${MODULE.ID}/templates/panel-party.hbs`,
    PANEL_PARTY_STATS: `modules/${MODULE.ID}/templates/panel-party-stats.hbs`,
    PANEL_NOTES: `modules/${MODULE.ID}/templates/panel-notes.hbs`,
    PANEL_CODEX: `modules/${MODULE.ID}/templates/panel-codex.hbs`,
    HANDLE_PLAYER: `modules/${MODULE.ID}/templates/handle-player.hbs`,
    HANDLE_PARTY: `modules/${MODULE.ID}/templates/handle-party.hbs`,
    CHAT_CARD: `modules/${MODULE.ID}/templates/chat-cards.hbs`,
    PRINT_CHARACTER: `modules/${MODULE.ID}/templates/print-character.hbs`,
};

