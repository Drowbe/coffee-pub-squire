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
    // The handle is the part of the tray that stays on screen when it collapses,
    // so the collapsed transform and the #ui-left margin are both measured off
    // this.
    //
    // = 2 borders + 5 gutter + 44 content column + 5 gutter + 4 HP rail. Keep in
    // step with the custom properties at the top of handle.css, which is where
    // those five numbers live.
    TRAY_HANDLE_WIDTH: '60px',
    // Extra tray body left showing beside the handle when collapsed. This used to
    // be 8px, propping up a handle whose width declaration named a variable that
    // did not exist, so the strip was however wide its contents forced. Now that
    // the width is real, the handle is the whole of what shows.
    TRAY_HANDLE_ADJUSTMENT: '0px',
    // Gap between the tray and the top/bottom of the viewport. These were user
    // settings, but nobody moved them off the default and two sliders is a lot of
    // settings-page real estate for that; change them here if the tray ever needs
    // to clear something.
    TRAY_TOP_OFFSET: '10px',
    TRAY_BOTTOM_OFFSET: '10px'
}; 

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
    HANDLE_PLAYER: `modules/${MODULE.ID}/templates/handle-player.hbs`,
    HANDLE_PARTY: `modules/${MODULE.ID}/templates/handle-party.hbs`,
    PRINT_CHARACTER: `modules/${MODULE.ID}/templates/print-character.hbs`,
};

