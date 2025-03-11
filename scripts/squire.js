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

    // Register handle-player template
    const handlePlayerTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-player.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-player', handlePlayerTemplate);
});

Hooks.once('ready', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }

    // Check if current user is excluded
    const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsers').split(',').map(id => id.trim());
    const isExcluded = excludedUsers.includes(game.user.id);

    if (isExcluded) {
        // Reset UI position for excluded users
        const uiLeft = document.querySelector('#ui-left');
        if (uiLeft) {
            uiLeft.style.marginLeft = '0px';
        }

        // Remove the partial if user is excluded
        if (Handlebars.partials['handle-player']) {
            delete Handlebars.partials['handle-player'];
        }

        // Reset any CSS variables
        document.documentElement.style.removeProperty('--squire-tray-handle-width');
        document.documentElement.style.removeProperty('--squire-tray-handle-adjustment');
        document.documentElement.style.removeProperty('--squire-tray-width');
        document.documentElement.style.removeProperty('--squire-tray-transform');
        document.documentElement.style.removeProperty('--squire-tray-top-offset');
        document.documentElement.style.removeProperty('--squire-tray-bottom-offset');

        blacksmith.utils.postConsoleAndNotification(
            `${MODULE.TITLE} | User is excluded from seeing the Squire tray`,
            null,
            false,
            true,
            false,
            MODULE.TITLE
        );
        return;
    }

    // Set up tray for non-excluded users
    const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
    document.documentElement.style.setProperty('--squire-tray-handle-width', SQUIRE.TRAY_HANDLE_WIDTH);
    document.documentElement.style.setProperty('--squire-tray-handle-adjustment', SQUIRE.TRAY_HANDLE_ADJUSTMENT);
    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - parseInt(SQUIRE.TRAY_HANDLE_WIDTH) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);

    // Set offset variables
    const topOffset = game.settings.get(MODULE.ID, 'topOffset');
    const bottomOffset = game.settings.get(MODULE.ID, 'bottomOffset');
    document.documentElement.style.setProperty('--squire-tray-top-offset', `${topOffset}px`);
    document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${bottomOffset}px`);

    // Set UI position
    const isPinned = game.settings.get(MODULE.ID, 'isPinned');
    const uiLeft = document.querySelector('#ui-left');
    if (uiLeft) {
        if (isPinned) {
            uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        } else {
            uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        }
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
    
    // Check if current user is excluded
    const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsers').split(',').map(id => id.trim());
    if (excludedUsers.includes(game.user.id)) return;
    
    await PanelManager.initialize(app.actor);
}); 