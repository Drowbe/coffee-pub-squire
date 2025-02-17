import { MODULE, SQUIRE } from './const.js';

export const registerSettings = function() {


    // --------------------------------
    // --- Handle Display Settings ---
    // --------------------------------

    // Tray Position
    game.settings.register(MODULE.ID, 'trayPosition', {
        name: 'Tray Position',
        hint: 'Where should the tray appear on the screen',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            'left': 'Left Side'
        },
        default: 'left',
        onChange: value => {
            // Update tray position in real-time
            const tray = document.querySelector('.squire-tray');
            if (tray) {
                tray.dataset.position = value;
            }
        }
    });

    // Theme -- THIS IS NOT USED ANYMORE
    game.settings.register(MODULE.ID, 'theme', {
        name: 'Color Theme',
        hint: 'Color scheme for the tray interface',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            'dark': 'Dark Theme',
            'light': 'Light Theme',
            'custom': 'Custom Theme'
        },
        default: 'dark',
        onChange: value => {
            // Update theme in real-time
            const tray = document.querySelector('.squire-tray');
            if (tray) {
                tray.dataset.theme = value;
            }
        }
    });


    
    // Tray Width setting
    game.settings.register(MODULE.ID, 'trayWidth', {
        name: 'Tray Width',
        hint: 'Adjust the width of the tray (in pixels). Default: 400px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 300,
            max: 600,
            step: 25
        },
        default: 400,
        onChange: value => {
            // Update CSS variables
            document.documentElement.style.setProperty('--squire-tray-width', `${value}px`);
            document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${value - parseInt(SQUIRE.TRAY_HANDLE_WIDTH) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);
            
            // Update UI margin based on pin state
            const uiLeft = document.querySelector('#ui-left');
            const isPinned = game.settings.get(MODULE.ID, 'isPinned');
            if (uiLeft) {
                if (isPinned) {
                    uiLeft.style.marginLeft = `${value + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                } else {
                    uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            }
        }
    });

    // Top Offset setting
    game.settings.register(MODULE.ID, 'topOffset', {
        name: 'Top Offset',
        hint: 'Distance from the top of the screen (in pixels). Default: 70px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 200,
            step: 5
        },
        default: 70,
        onChange: value => {
            document.documentElement.style.setProperty('--squire-tray-top-offset', `${value}px`);
        }
    });

    // Bottom Offset setting
    game.settings.register(MODULE.ID, 'bottomOffset', {
        name: 'Bottom Offset',
        hint: 'Distance from the bottom of the screen (in pixels). Default: 300px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 500,
            step: 5
        },
        default: 300,
        onChange: value => {
            document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${value}px`);
        }
    });


    // Panel Visibility Settings

    game.settings.register(MODULE.ID, 'showExperiencePanel', {
        name: 'Show Experience Panel',
        hint: 'Display experience and level progress panel',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showHealthPanel', {
        name: 'Show Health Panel',
        hint: 'Display health tracking panel',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showAbilitiesPanel', {
        name: 'Show Abilities Panel',
        hint: 'Display ability scores and modifiers panel',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showStatsPanel', {
        name: 'Show Stats Panel',
        hint: 'Display character stats panel',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showDiceTrayPanel', {
        name: 'Show Dice Tray Panel',
        hint: 'Display dice rolling panel',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });


    // --------------------------------
    // --- Handle Display Settings ---
    // --------------------------------

    game.settings.register(MODULE.ID, 'showHandleConditions', {
        name: 'Show Conditions in Handle',
        hint: 'Display condition icons in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showHandleStatsPrimary', {
        name: 'Show Primary Stats in Handle',
        hint: 'Display primary stats (HP, AC, Move) in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showHandleStatsSecondary', {
        name: 'Show Secondary Stats in Handle',
        hint: 'Display secondary stats (Initiative, Proficiency) in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'showHandleFavorites', {
        name: 'Show Favorites in Handle',
        hint: 'Display favorite items in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showHandleHealthBar', {
        name: 'Show Health Bar in Handle',
        hint: 'Display health bar visualization in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });


    // ***************************
    // *** NON-CONFIG SETTINGS ***
    // ***************************

    // Layout

    // Remember pinned state (hidden setting)
    game.settings.register(MODULE.ID, 'isPinned', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });


    // Panel Visibility Settings

    game.settings.register(MODULE.ID, 'showFavoritesPanel', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showWeaponsPanel', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showSpellsPanel', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showInventoryPanel', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showFeaturesPanel', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    // --- Filter States ---

    game.settings.register(MODULE.ID, 'showOnlyPreparedSpells', {
        name: 'Remember Prepared Spells Filter',
        hint: 'Remember if the prepared spells filter was enabled',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'showOnlyEquippedWeapons', {
        name: 'Remember Equipped Weapons Filter',
        hint: 'Remember if the equipped weapons filter was enabled',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'showOnlyEquippedInventory', {
        name: 'Remember Equipped Inventory Filter',
        hint: 'Remember if the equipped inventory filter was enabled',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    // Favorites Filter States
    game.settings.register(MODULE.ID, 'showSpellFavorites', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showFeaturesFavorites', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showWeaponFavorites', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showInventoryFavorites', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    // --- Sound Settings ---

    game.settings.register(MODULE.ID, 'dragEnterSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3'
    });

    game.settings.register(MODULE.ID, 'trayOpenSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/book-flip-02.mp3'
    });

    game.settings.register(MODULE.ID, 'dropSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3'
    });

    // Non-user configurable pin/unpin sounds
    game.settings.register(MODULE.ID, 'pinSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3'
    });

    game.settings.register(MODULE.ID, 'unpinSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3'
    });
};

// ***************************
// *** FUNCTIONS           ***
// ***************************

// Helper function to update custom theme colors
function updateCustomTheme(colors) {
    const style = document.getElementById('squire-custom-theme');
    if (!style) {
        const styleElement = document.createElement('style');
        styleElement.id = 'squire-custom-theme';
        document.head.appendChild(styleElement);
    }

    const css = `
        .squire-tray[data-theme="custom"] {
            background: ${colors.background};
            color: ${colors.text};
            border-color: ${colors.border};
        }
        .squire-tray[data-theme="custom"] .tab-item.tab-active {
            background: ${colors.accent};
        }
        .squire-tray[data-theme="custom"] .cast-spell,
        .squire-tray[data-theme="custom"] .weapon-attack {
            background: ${colors.accent};
        }
    `;

    style.textContent = css;
} 