import { MODULE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';

Hooks.once('init', async function() {
    console.log(`${MODULE.TITLE} | Initializing ${MODULE.NAME}`);
    
    // Register module settings
    registerSettings();

    // Register Handlebars helpers
    registerHelpers();
});

Hooks.once('ready', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }

    // Register with Blacksmith API
    blacksmith.registerModule(MODULE.ID, {
        name: MODULE.TITLE,
        version: game.modules.get(MODULE.ID).version,
        features: [
            {
                type: 'chatPanelIcon',
                data: {
                    icon: 'fas fa-scroll',
                    tooltip: 'Toggle Squire Panel',
                    onClick: () => PanelManager.toggleTray()
                }
            }
        ]
    });
});

// Add button to chat controls
Hooks.on('getChatControlButtons', (controls) => {
    controls.push({
        name: 'squire',
        title: 'Toggle Squire Panel',
        icon: 'fas fa-scroll',
        onClick: () => PanelManager.toggleTray(),
        button: true
    });
});

// Initialize panel when character sheet is rendered
Hooks.on('renderActorSheet5e', async (app, html, data) => {
    if (!app.actor) return;
    await PanelManager.initialize(app.actor);
}); 