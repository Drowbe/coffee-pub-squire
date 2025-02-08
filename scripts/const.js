export const MODULE = {
    ID: 'coffee-pub-squire',
    NAME: 'Coffee Pub Squire',
    TITLE: 'SQUIRE'
};

export const TEMPLATES = {
    TRAY: `modules/${MODULE.ID}/templates/tray.hbs`,
    PANEL_CHARACTER: `modules/${MODULE.ID}/templates/panel-character.hbs`,
    PANEL_CONTROL: `modules/${MODULE.ID}/templates/panel-control.hbs`,
    PANEL_SPELLS: `modules/${MODULE.ID}/templates/panel-spells.hbs`,
    PANEL_WEAPONS: `modules/${MODULE.ID}/templates/panel-weapons.hbs`,
    PANEL_INVENTORY: `modules/${MODULE.ID}/templates/panel-inventory.hbs`,
    PANEL_FAVORITES: `modules/${MODULE.ID}/templates/panel-favorites.hbs`
};

export const PANELS = {
    FAVORITES: 'favorites',
    SPELLS: 'spells',
    WEAPONS: 'weapons',
    INVENTORY: 'inventory'
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