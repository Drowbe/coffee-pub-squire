import { MODULE, SQUIRE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';

Hooks.once('init', async function() {
    console.log(`${MODULE.TITLE} | Initializing ${MODULE.NAME}`);
    
    // Register module settings
    registerSettings();

    // Register Handlebars helpers
    registerHelpers();

    // Set initial CSS variables
    const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
    document.documentElement.style.setProperty('--squire-tray-handle-width', SQUIRE.TRAY_OFFSET_WIDTH);
    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
    document.documentElement.style.setProperty('--squire-tray-content-width', `${trayWidth - parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`);
    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px)`);

    // Set initial UI position
    const isPinned = game.settings.get(MODULE.ID, 'isPinned');
    const uiLeft = document.querySelector('#ui-left');
    
    if (uiLeft) {
        if (isPinned) {
            // If pinned, set margin to tray width minus handle width
            uiLeft.style.marginLeft = `${trayWidth - parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        } else {
            // If not pinned, set margin to handle width
            uiLeft.style.marginLeft = SQUIRE.TRAY_OFFSET_WIDTH;
        }
    }
});

Hooks.once('ready', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }
});

// Initialize panel when character sheet is rendered
Hooks.on('renderActorSheet5e', async (app, html, data) => {
    if (!app.actor) return;
    await PanelManager.initialize(app.actor);
}); 