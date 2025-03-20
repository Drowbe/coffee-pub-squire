import { MODULE, SQUIRE } from './const.js';

export const registerSettings = function() {


    // --------------------------------
    // --- Handle Display Settings ---
    // --------------------------------



    // *** INTRODUCTION ***
    // ---------- TITLE ----------
    game.settings.register(MODULE.ID, "headingH1Squire", {
        name: 'Introduction',
        hint: 'A FoundryVTT module from the Coffee Pub suite that provides quick access to character-specific combat information through a sliding tray interface. It features automatic character detection, spell and weapon management with favorites and filtering, HP tracking, ability rolls, an integrated dice tray, quick condition application, and customizable themes. The UI adjusts automatically for better usability and fully integrates with the Coffee Pub Blacksmith API.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });
    // -------------------------------------


	// ---------- Tray Configuration ----------
	game.settings.register(MODULE.ID, "headingH3TrayConfiguration", {
		name: 'Tray Configuration',
		hint: 'Automation of token actions.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    // Excluded Users
    game.settings.register(MODULE.ID, 'excludedUsers', {
        name: 'Excluded Users',
        hint: 'List of userIDs that should not see the Squire tray (comma-separated)',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        onChange: async value => {
            // Only process if game is ready and user exists
            if (!game.user) return;

            // Force a refresh if the current user's status changes
            const currentUserId = game.user.id;
            const isExcluded = value.split(',').map(id => id.trim()).includes(currentUserId);
            
            // Handle UI margins and CSS variables
            const uiLeft = document.querySelector('#ui-left');
            if (uiLeft) {
                if (isExcluded) {
                    // Reset margin if user is excluded
                    uiLeft.style.marginLeft = '0px';
                    // Remove the partial if user is excluded
                    if (Handlebars.partials['handle-player']) {
                        delete Handlebars.partials['handle-player'];
                    }
                    // Reset CSS variables
                    document.documentElement.style.removeProperty('--squire-tray-handle-width');
                    document.documentElement.style.removeProperty('--squire-tray-handle-adjustment');
                    document.documentElement.style.removeProperty('--squire-tray-width');
                    document.documentElement.style.removeProperty('--squire-tray-transform');
                    document.documentElement.style.removeProperty('--squire-tray-top-offset');
                    document.documentElement.style.removeProperty('--squire-tray-bottom-offset');
                } else {
                    // Restore margin based on pin state if user is not excluded
                    const isPinned = game.settings.get(MODULE.ID, 'isPinned');
                    const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                    
                    // Restore CSS variables
                    document.documentElement.style.setProperty('--squire-tray-handle-width', SQUIRE.TRAY_HANDLE_WIDTH);
                    document.documentElement.style.setProperty('--squire-tray-handle-adjustment', SQUIRE.TRAY_HANDLE_ADJUSTMENT);
                    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
                    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - parseInt(SQUIRE.TRAY_HANDLE_WIDTH) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);
                    
                    // Set offset variables
                    const topOffset = game.settings.get(MODULE.ID, 'topOffset');
                    const bottomOffset = game.settings.get(MODULE.ID, 'bottomOffset');
                    document.documentElement.style.setProperty('--squire-tray-top-offset', `${topOffset}px`);
                    document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${bottomOffset}px`);

                    if (isPinned) {
                        uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                    } else {
                        uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                    }
                    // Register the partial if user is not excluded
                    if (!Handlebars.partials['handle-player']) {
                        const handlePlayerTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-player.hbs`).then(response => response.text());
                        Handlebars.registerPartial('handle-player', handlePlayerTemplate);
                    }
                }
            }

            // Handle tray visibility
            if (isExcluded && PanelManager.element) {
                PanelManager.element.remove();
                PanelManager.element = null;
            } else if (!isExcluded && !PanelManager.element) {
                PanelManager.initialize(PanelManager.currentActor);
            }
        }
    });


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
            min: 350,
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
        hint: 'Distance from the top of the screen (in pixels). Default: 10px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 200,
            step: 5
        },
        default: 10,
        onChange: value => {
            document.documentElement.style.setProperty('--squire-tray-top-offset', `${value}px`);
        }
    });

    // Bottom Offset setting
    game.settings.register(MODULE.ID, 'bottomOffset', {
        name: 'Bottom Offset',
        hint: 'Distance from the bottom of the screen (in pixels). Default: 10px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 500,
            step: 5
        },
        default: 10,
        onChange: value => {
            document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${value}px`);
        }
    });

	// ---------- Tray Configuration ----------
	game.settings.register(MODULE.ID, "headingH3PanelConfiguration", {
		name: 'Panel Configuration',
		hint: 'Panels appear at the top of the tray, above the spells, weapons, and inventory. They can be collapsed or hidden completely. Several of them can be accessed via the handle even if the panel is disabled.',
		scope: "world",
		config: true,
		default: "",
		type: String,
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

    game.settings.register(MODULE.ID, 'showPartyStatsPanel', {
        name: 'Show Party Stats Panel',
        hint: 'Display party statistics and achievements panel',
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


	// ---------- Handle Configuration ----------
	game.settings.register(MODULE.ID, "headingH3HandleConfiguration", {
		name: 'Handle Configuration',
		hint: 'The handle is the bit of the tray that always shows. Many actions can be performed via the handle, even if the panels are disabled.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	// ---------- Handle Conditions ----------
    game.settings.register(MODULE.ID, 'showHandleConditions', {
        name: 'Show Conditions in Handle',
        hint: 'Display condition icons in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

	// ---------- Handle Primary Stats ----------
    game.settings.register(MODULE.ID, 'showHandleStatsPrimary', {
        name: 'Show Primary Stats in Handle',
        hint: 'Display primary stats (HP, AC, Move) in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
    // ---------- Handle Secondary Stats ----------
    game.settings.register(MODULE.ID, 'showHandleStatsSecondary', {
        name: 'Show Secondary Stats in Handle',
        hint: 'Display secondary stats (Initiative, Proficiency) in the handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
    });
    // ---------- Handle Favorites ----------
    game.settings.register(MODULE.ID, 'showHandleFavorites', {
        name: 'Show Favorites in Handle',
        hint: 'Display favorite actions and items in the handle',
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

    // ---------- Handle Dice Tray ----------
    game.settings.register(MODULE.ID, 'showHandleDiceTray', {
        name: 'Show Dice Tray Icon in Handle',
        hint: 'Display a dice icon in the handle to quickly access the dice tray',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });


    // --------------------------------
    // --- Transfer Settings ---
    // --------------------------------


	// ---------- Handle Configuration ----------
	game.settings.register(MODULE.ID, "headingH3TransferConfiguration", {
		name: 'Transfer Configuration',
		hint: 'Transfer settings are used to transfer items and artifacts to another user via the tray.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    // ---------- Handle Dice Tray ----------
    game.settings.register(MODULE.ID, 'transfersGMApproves', {
        name: 'GM Approves Transfers',
        hint: 'If true, the GM must approve transfers of items and artifacts to another user',
        scope: 'world',
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

    // Remember panel collapsed states
    game.settings.register(MODULE.ID, 'isExperiencePanelCollapsed', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'isHealthPanelCollapsed', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'isAbilitiesPanelCollapsed', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'isStatsPanelCollapsed', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'isDiceTrayPanelCollapsed', {
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

    // View Mode Setting
    game.settings.register(MODULE.ID, 'viewMode', {
        name: 'View Mode',
        hint: 'Switch between player and party view',
        scope: 'client',
        config: false,
        type: String,
        choices: {
            'player': 'Player View',
            'party': 'Party View'
        },
        default: 'player'
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


    game.settings.register(MODULE.ID, 'tabChangeSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3'
    });

    game.settings.register(MODULE.ID, 'toolbarButtonSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3'
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