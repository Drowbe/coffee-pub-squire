import { MODULE, SQUIRE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';

Hooks.once('init', async function() {
    game.modules.get('coffee-pub-blacksmith')?.api?.utils?.postConsoleAndNotification(
        `${MODULE.TITLE} | Initializing ${MODULE.NAME}`,
        null,
        false,
        true,
        false,
        MODULE.TITLE
    );
    
    // Register module settings
    registerSettings();

    // Set initial CSS variables
    const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
    document.documentElement.style.setProperty('--squire-tray-handle-width', SQUIRE.TRAY_HANDLE_WIDTH);
    document.documentElement.style.setProperty('--squire-tray-handle-adjustment', SQUIRE.TRAY_HANDLE_ADJUSTMENT);
    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - parseInt(SQUIRE.TRAY_HANDLE_WIDTH) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);

    // Set initial offset variables
    const topOffset = game.settings.get(MODULE.ID, 'topOffset');
    const bottomOffset = game.settings.get(MODULE.ID, 'bottomOffset');
    document.documentElement.style.setProperty('--squire-tray-top-offset', `${topOffset}px`);
    document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${bottomOffset}px`);

    // Set initial UI position
    const isPinned = game.settings.get(MODULE.ID, 'isPinned');
    const uiLeft = document.querySelector('#ui-left');
    
    if (uiLeft) {
        if (isPinned) {
            // If pinned, set margin to tray width plus offset width (handle is included in tray width)
            uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        } else {
            // If not pinned, set margin to handle width plus offset width
            uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        }
    }

    // Add this near the top of the initialization code
    const handlePlayerTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-player.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-player', handlePlayerTemplate);
});

Hooks.once('ready', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }
    
    // Register Handlebars helpers
    registerHelpers();
    
    // Debug log for Blacksmith sound choices
    blacksmith.utils.postConsoleAndNotification(
        `${MODULE.TITLE} | Blacksmith API`,
        {
            api: blacksmith,
            BLACKSMITH: blacksmith.BLACKSMITH,
            soundChoices: blacksmith.BLACKSMITH?.arrSoundChoices
        },
        false,
        true,
        false,
        MODULE.TITLE
    );

    const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
    await PanelManager.initialize(firstOwnedToken?.actor || null);
});

// Initialize panel when character sheet is rendered
Hooks.on('renderActorSheet5e', async (app, html, data) => {
    if (!app.actor) return;
    await PanelManager.initialize(app.actor);
}); 