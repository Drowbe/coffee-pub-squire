import { MODULE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { registerSettings } from './settings.js';

Hooks.once('init', async function() {
    console.log(`${MODULE.TITLE} | Initializing ${MODULE.NAME}`);
    
    // Register module settings
    registerSettings();
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

    // Initialize panel manager
    await PanelManager.initialize();
}); 