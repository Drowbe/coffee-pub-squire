export const MODULE = {
    ID: 'coffee-pub-squire',
    NAME: 'SQUIRE',
    TITLE: 'Coffee Pub Squire',
    AUTHOR: "Coffee Pub"
};




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
    CHAT_CARD: `modules/${MODULE.ID}/templates/chat-cards.hbs`,
    PRINT_CHARACTER: `modules/${MODULE.ID}/templates/print-character.hbs`,
    TOOLTIP_QUEST: `modules/${MODULE.ID}/templates/tooltip-pin-quests-objective.hbs`,
    TOOLTIP_QUEST_PIN: `modules/${MODULE.ID}/templates/tooltip-pin-quests-quest.hbs`
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