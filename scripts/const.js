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
// Post the data
console.log(moduleData.title, `Module ID: `, moduleData.id);
console.log(moduleData.title, `Module Name: `, strName);
console.log(moduleData.title, `Module Title: `, moduleData.title);
console.log(moduleData.title, `Module Version: `, moduleData.version);
console.log(moduleData.title, `Module Author: `, moduleData.authors[0]?.name);
console.log(moduleData.title, `Module Description: `, moduleData.description);

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
    TRAY_OFFSET_WIDTH: '10px',
    TRAY_HANDLE_WIDTH: '30px',
    TRAY_HANDLE_ADJUSTMENT: '16px'
}; 

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
    PANEL_CONTROL: `modules/${MODULE.ID}/templates/panel-control.hbs`,
    PANEL_SPELLS: `modules/${MODULE.ID}/templates/panel-spells.hbs`,
    PANEL_WEAPONS: `modules/${MODULE.ID}/templates/panel-weapons.hbs`,
    PANEL_INVENTORY: `modules/${MODULE.ID}/templates/panel-inventory.hbs`,
    PANEL_FAVORITES: `modules/${MODULE.ID}/templates/panel-favorites.hbs`,
    PANEL_FEATURES: `modules/${MODULE.ID}/templates/panel-features.hbs`,
    PANEL_DICETRAY: `modules/${MODULE.ID}/templates/panel-dicetray.hbs`,
    PANEL_MACROS: `modules/${MODULE.ID}/templates/panel-macros.hbs`,
    PANEL_EXPERIENCE: `modules/${MODULE.ID}/templates/panel-experience.hbs`,
    PANEL_HEALTH: `modules/${MODULE.ID}/templates/panel-health.hbs`,
    PANEL_STATS: `modules/${MODULE.ID}/templates/panel-stats.hbs`,
    PANEL_ABILITIES: `modules/${MODULE.ID}/templates/panel-abilities.hbs`,
    PANEL_PARTY: `modules/${MODULE.ID}/templates/panel-party.hbs`,
    PANEL_PARTY_STATS: `modules/${MODULE.ID}/templates/panel-party-stats.hbs`,
    PANEL_NOTES: `modules/${MODULE.ID}/templates/panel-notes.hbs`,
    PANEL_CODEX: `modules/${MODULE.ID}/templates/panel-codex.hbs`,
    PANEL_QUEST: `modules/${MODULE.ID}/templates/panel-quest.hbs`,
    HANDLE_PLAYER: `modules/${MODULE.ID}/templates/handle-player.hbs`,
    HANDLE_PARTY: `modules/${MODULE.ID}/templates/handle-party.hbs`,
    TRANSFER_DIALOG: `modules/${MODULE.ID}/templates/window-transfer.hbs`,
    WINDOW_CHARACTERS: `modules/${MODULE.ID}/templates/window-characters.hbs`,
    CHAT_CARD: `modules/${MODULE.ID}/templates/chat-cards.hbs`,
    PRINT_CHARACTER: `modules/${MODULE.ID}/templates/print-character.hbs`,
    TOOLTIP_QUEST: `modules/${MODULE.ID}/templates/tooltip-pin-quests-objective.hbs`,
    TOOLTIP_QUEST_PIN: `modules/${MODULE.ID}/templates/tooltip-pin-quests-quest.hbs`
};