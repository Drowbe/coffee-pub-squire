import { MODULE, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';

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


    // Default View Mode Setting
    game.settings.register(MODULE.ID, 'viewDefaultMode', {
        name: 'Default Tab',
        hint: 'Set the default tab for when foundry loads.',
        scope: 'user',
        config: true,
        type: String,
        choices: {
            'player': 'Player Tab',
            'party': 'Party Tab',
            'notes': 'Notes Tab',
            'codex': 'Codex Tab',
            'quest': 'Quest Tab',
            'last': 'Last Tab Viewed (Defualt)',
        },
        default: 'last'
    });

    // Tabs

    game.settings.register(MODULE.ID, 'showTabParty', {
        name: 'Show Party Tab',
        hint: 'Show the Party tab on the tray (recommended)',
        scope: 'user',
        requiresReload: true,
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showTabNotes', {
        name: 'Show Notes Tab',
        hint: 'Show the Notes tab on the tray (recommended)',
        scope: 'user',
        requiresReload: true,
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showTabCodex', {
        name: 'Show Codex Tab',
        hint: 'Show the Codex tab on the tray (recommended)',
        scope: 'user',
        requiresReload: true,
        config: true,   
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showTabQuests', {
        name: 'Show Quests Tab',
        hint: 'Show the Quests tab on the tray (recommended)',
        scope: 'user',
        requiresReload: true,
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    // Excluded Users
    game.settings.register(MODULE.ID, 'excludedUsers', {
        name: 'Excluded Users',
        hint: 'List of userIDs that should not see the Squire tray (comma-separated)',
        scope: 'world',
        requiresReload: true,
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

    // // Theme -- THIS IS NOT USED ANYMORE
    // game.settings.register(MODULE.ID, 'theme', {
    //     name: 'Color Theme',
    //     hint: 'Color scheme for the tray interface',
    //     scope: 'client',
    //     config: true,
    //     type: String,
    //     choices: {
    //         'dark': 'Dark Theme',
    //         'light': 'Light Theme',
    //         'custom': 'Custom Theme'
    //     },
    //     default: 'dark',
    //     onChange: value => {
    //         // Update theme in real-time
    //         const tray = document.querySelector('.squire-tray');
    //         if (tray) {
    //             tray.dataset.theme = value;
    //         }
    //     }
    // });


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

	// ---------- Panel Configuration ----------
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
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showPartyStatsPanel', {
        name: 'Show Party Stats Panel',
        hint: 'Display party statistics and achievements panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showHealthPanel', {
        name: 'Show Health Panel',
        hint: 'Display health tracking panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showAbilitiesPanel', {
        name: 'Show Abilities Panel',
        hint: 'Display ability scores and modifiers panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showStatsPanel', {
        name: 'Show Stats Panel',
        hint: 'Display character stats panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showDiceTrayPanel', {
        name: 'Show Dice Tray Panel',
        hint: 'Display dice rolling panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showMacrosPanel', {
        name: 'Show Macros Panel',
        hint: 'Display macros panel for quick access to macros',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false,
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
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

	// ---------- Handle Primary Stats ----------
    game.settings.register(MODULE.ID, 'showHandleStatsPrimary', {
        name: 'Show Primary Stats in Handle',
        hint: 'Display primary stats (HP, AC, Move) in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false
    });
    // ---------- Handle Secondary Stats ----------
    game.settings.register(MODULE.ID, 'showHandleStatsSecondary', {
        name: 'Show Secondary Stats in Handle',
        hint: 'Display secondary stats (Initiative, Proficiency) in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false
    });
    // ---------- Handle Favorites ----------
    game.settings.register(MODULE.ID, 'showHandleFavorites', {
        name: 'Show Favorites in Handle',
        hint: 'Display favorite actions and items in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showHandleHealthBar', {
        name: 'Show Health Bar in Handle',
        hint: 'Display health bar visualization in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    // ---------- Handle Dice Tray ----------
    game.settings.register(MODULE.ID, 'showHandleDiceTray', {
        name: 'Show Dice Tray Icon in Handle',
        hint: 'Display a dice icon in the handle to quickly access the dice tray',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showHandleMacros', {
        name: 'Show Macros Icon in Handle',
        hint: 'Display a macros icon in the handle to quickly access the macros panel',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'hideFoundryHotbar', {
        name: 'Hide the default Foundry hotbar.',
        hint: 'Get some screen real estate back by hiding the default Foundry hotbar.',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            // Update hotbar visibility when setting changes
            import('./panel-macros.js').then(module => {
                if (module.updateHotbarVisibility) {
                    module.updateHotbarVisibility();
                }
            });
        }
    });


    // --------------------------------
    // ---      HEALTH Settings      ---
    // --------------------------------

	// ---------- Health Heading ----------
	game.settings.register(MODULE.ID, "headingH3HealthConfiguration", {
		name: 'Health Configuration',
		hint: 'Settings for the health bars in the tray.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});


    // -- Injured Threshold --
    game.settings.register(MODULE.ID, 'healthThresholdInjured', {
        name:'Injured Threshold',
        hint: 'The percentage of health at which the health bar will turn a dark green.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: Number,
        default: 75,
        range: {
            min: 0,
            max: 100,
            step: 1,
        },
    });

// -- Bloodied Threshold --
    game.settings.register(MODULE.ID, 'healthThresholdBloodied', {
        name:'Bloodied Threshold',
        hint: 'The percentage of health at which the health bar will turn a dark orange.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: Number,
        default: 50,
        range: {
            min: 0,
            max: 100,
            step: 1,
        },
    });

// -- Critical Threshold --
    game.settings.register(MODULE.ID, 'healthThresholdCritical', {
        name:'Critical Threshold',
        hint: 'The percentage of health at which the health bar will turn a dark red.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: Number,
        default: 25,
        range: {
            min: 0,
            max: 100,
            step: 1,
        },
    });




    // --------------------------------
    // ---      NOTES Settings      ---
    // --------------------------------

	// ---------- Notes Heading ----------
	game.settings.register(MODULE.ID, "headingH3NotesConfiguration", {
		name: 'Notes Configuration',
		hint: 'Settings for the party notes, quests, and other shared data.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    // Persistent Journal for Players
    game.settings.register(MODULE.ID, 'notesPersistentJournal', {
        name: 'Persistent Journal for Players',
        hint: 'Journal that is always visible to players in the notes panel',
        scope: 'world',
        config: false,
        type: String,
        default: 'none',
        onChange: () => {
            // Update the notes panel if it exists
            if (PanelManager.instance?.notesPanel) {
                PanelManager.instance.notesPanel.render(PanelManager.element);
            }
        }
    });
    
    // GM's Selected Journal
    game.settings.register(MODULE.ID, 'notesGMJournal', {
        name: 'GM\'s Selected Journal',
        hint: 'Journal currently selected by the GM for their own view',
        scope: 'world',
        config: false,
        type: String,
        default: 'none',
        onChange: () => {
            // Update the notes panel if it exists
            if (PanelManager.instance?.notesPanel) {
                PanelManager.instance.notesPanel.render(PanelManager.element);
            }
        }
    });
    
    // Notes Shared Journal Page setting
    game.settings.register(MODULE.ID, 'notesSharedJournalPage', {
        name: 'Notes Shared Journal Page',
        hint: 'Page within the journal to display in the Notes tab',
        scope: 'world',
        config: false,
        type: String,
        default: 'none'
    });

    game.settings.register(MODULE.ID, 'notesPinDefaultDesign', {
        scope: 'client',
        config: false,
        type: Object,
        default: {
            size: { w: 60, h: 60 },
            lockProportions: true,
            shape: 'circle',
            style: {
                stroke: '#ffffff',
                strokeWidth: 2
            },
            dropShadow: true,
            text: '',
            textLayout: 'under',
            textDisplay: 'always',
            textColor: '#ffffff',
            textSize: 12,
            textMaxLength: 0,
            textScaleWithPin: true
        }
    });

    // --------------------------------
    // --- Transfer Settings ---
    // --------------------------------


	// ---------- Transfer Heading ----------
	game.settings.register(MODULE.ID, "headingH3TransferConfiguration", {
		name: 'Transfer Configuration',
		hint: 'Transfer settings are used to transfer items and artifacts to another user via the tray.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    // ---------- Transfers - GM Approves ----------
    game.settings.register(MODULE.ID, 'transfersGMApproves', {
        name: 'GM Approves Transfers',
        hint: 'If true, the GM must approve transfers of items and artifacts to another user',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    // ---------- Transfers - Timeout ----------
    game.settings.register(MODULE.ID, 'transferTimeout', {
        name: 'Transfer Request Timeout (seconds)',
        hint: 'How long transfer requests remain valid before automatically expiring',
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: 10,
            max: 180,
            step: 10
        },
        default: 30
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

    game.settings.register(MODULE.ID, 'isGmPanelCollapsed', {
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

    game.settings.register(MODULE.ID, 'isMacrosPanelCollapsed', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    // Panel Visibility Settings

    game.settings.register(MODULE.ID, 'showFavoritesPanel', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showWeaponsPanel', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showSpellsPanel', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showInventoryPanel', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showFeaturesPanel', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    // --- Filter States ---

    game.settings.register(MODULE.ID, 'showOnlyPreparedSpells', {
        name: 'Remember Prepared Spells Filter',
        hint: 'Remember if the prepared spells filter was enabled',
        scope: 'user',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'showOnlyEquippedWeapons', {
        name: 'Remember Equipped Weapons Filter',
        hint: 'Remember if the equipped weapons filter was enabled',
        scope: 'user',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'showOnlyEquippedInventory', {
        name: 'Remember Equipped Inventory Filter',
        hint: 'Remember if the equipped inventory filter was enabled',
        scope: 'user',
        config: false,
        type: Boolean,
        default: false
    });

    // Favorites Filter States
    game.settings.register(MODULE.ID, 'showSpellFavorites', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showFeaturesFavorites', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showWeaponFavorites', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'showInventoryFavorites', {
        scope: 'user',
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
            'party': 'Party View',
            'notes': 'Notes View',
            'codex': 'Codex View',
            'quest': 'Quest View'
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
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3'
    });

    game.settings.register(MODULE.ID, 'unpinSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3'
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

    // Macros Panel
    game.settings.register(MODULE.ID, 'userMacros', {
        scope: 'user',
        config: false,
        type: Array,
        default: []
    }); 
    // Macros Favorites
    game.settings.register(MODULE.ID, 'userFavoriteMacros', {
        scope: 'client',
        config: false,
        type: Array,
        default: []
    }); 



    // ---------- SUBHEADING ----------
    game.settings.register(MODULE.ID, "headingH2CampaignSettings", {
        name: 'Campaign Settings',
        hint: 'These settings are used to power both any AI generated content as well as augment any JSON imports for items, journal entries, characters, etc.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });
    // -------------------------------------


    // ---------- CAMPAIGN COMMON ----------
    game.settings.register(MODULE.ID, "headingH3CampaignCommon", {
        name: 'Campaign Common',
        hint: 'General campaign settings that are common to all narratives.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });
    // -------------------------------------


    // -- Default Campaign Name --
    game.settings.register(MODULE.ID, 'defaultCampaignName', {
        name:'Default Campaign Name',
        hint: 'The default campaign name to use when creating new narratives.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: String,
        default: ''
    });

    // -- Default Party Name --
    game.settings.register(MODULE.ID, 'defaultPartyName', {
        name:'Default Party Name',
        hint: 'The default party name to use when creating new narratives.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: String,
        default: ''
    });

    // -- Default Party Size --
    game.settings.register(MODULE.ID, 'defaultPartySize', {
        name:'Default Party Size',
        hint: 'The default party size to use when creating new narratives.',
        scope: "world",
        config: true,
        requiresReload: false,
        type: Number,
        default: 4,
        range: {
            min: 1,
            max: 10,
            step: 1,
        },
    });

    // -- Default Party Makeup --
    game.settings.register(MODULE.ID, 'defaultPartyMakeup', {
        name:'Default Party Makeup',
        hint: 'The default party makeup to use when creating new narratives. (e.g. 1 Fighter, 1 Rogue, 1 Wizard, 1 Cleric)',
        scope: "world",
        config: true,
        requiresReload: false,
        type: String,
        default: ''
    });

    // -- Default Party Level --
    game.settings.register(MODULE.ID, 'defaultPartyLevel', {
        name:'Default Party Level',
        hint: 'The default party level to use when creating new narratives.',
        scope: "world",
        config: true,
        requiresReload: false,	
        type: Number,
        default: 1,
        range: {
            min: 1,
            max: 20,
            step: 1,		
        },
    });

    // -- Default Rulebooks Folder --
    game.settings.register(MODULE.ID, 'defaultRulebooks', {
        name:'Default Rulebooks',
        hint: 'A comma separated list of default rule books to use when creating new narratives. (e.g. 2024 Monster Manual, 2024 Player\'s Handbook, etc.)',
        scope: "world",
        config: true,
        requiresReload: false,
        type: String,
        default: ''
    });


    // --------------------------------
    // ---      NOTES Settings     ---
    // --------------------------------

    // ---------- Notes Heading ----------
    game.settings.register(MODULE.ID, "headingH3NotesConfiguration", {
        name: 'Notes Configuration',
        hint: 'Settings for the notes system that allows players to quickly capture and organize memories.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });

    // Notes Journal
    game.settings.register(MODULE.ID, 'notesJournal', {
        name: 'Notes Journal',
        hint: 'The journal to use for player notes. Journal must have "All Players = Observer" ownership to allow players to create notes.',
        scope: 'world',
        config: true,
        type: String,
        default: 'none',
        choices: () => {
            const choices = { 'none': '- Select Journal -' };
            game.journal.contents.forEach(j => {
                choices[j.id] = j.name;
            });
            return choices;
        },
        onChange: async (journalId) => {
            // Verify journal ownership when selected
            if (journalId && journalId !== 'none') {
                const journal = game.journal.get(journalId);
                if (journal) {
                    const defaultPerm = journal.ownership.default;
                    if (defaultPerm < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                        ui.notifications.warn(`Warning: Notes journal "${journal.name}" should have "All Players = Observer" ownership to allow players to create notes.`);
                    }
                }
            }
        }
    });

    // Codex Journal
    game.settings.register(MODULE.ID, 'codexJournal', {
        name: "Codex Journal",
        hint: "The journal to use for codex entries. Each entry will be a separate page in this journal.",
        scope: "world",
        config: false,
        type: String,
        choices: () => {
            const choices = {
                'none': '- Select Journal -'
            };
            game.journal.contents.forEach(j => {
                choices[j.id] = j.name;
            });
            return choices;
        },
        default: "none",
        onChange: () => {
            // Update the codex panel if it exists
            if (PanelManager.instance?.codexPanel) {
                PanelManager.instance.codexPanel.render(PanelManager.element);
            }
        }
    });

    // --------------------------------
    // ---      CODEX Settings     ---
    // --------------------------------

    // ---------- Codex Heading ----------
    game.settings.register(MODULE.ID, "headingH3CodexConfiguration", {
        name: 'Codex Configuration',
        hint: 'Settings for the codex system that organizes characters, locations, and artifacts.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });

    // Codex Journal
    game.settings.register(MODULE.ID, 'codexJournal', {
        name: "Codex Journal",
        hint: "The journal to use for codex entries. Each entry will be a separate page in this journal.",
        scope: "world",
        config: false,
        type: String,
        choices: () => {
            const choices = {
                'none': '- Select Journal -'
            };
            game.journal.contents.forEach(j => {
                choices[j.id] = j.name;
            });
            return choices;
        },
        default: "none",
        onChange: () => {
            // Update the codex panel if it exists
            if (PanelManager.instance?.codexPanel) {
                PanelManager.instance.codexPanel.render(PanelManager.element);
            }
        }
    });

    // --------------------------------
    // ---      QUEST Settings     ---
    // --------------------------------
    
    // ---------- Quest Heading ----------
    game.settings.register(MODULE.ID, "headingH3QuestConfiguration", {
        name: 'Quest Configuration',
        hint: 'Settings for quest pins and their display on the canvas.',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });
    
    // Quest Pin Title Display
    game.settings.register(MODULE.ID, 'showQuestPinText', {
        name: 'Show Quest Pin Titles',
        hint: 'Display quest and objective names as title text below the pins. When disabled, only the quest numbers (Q85, Q85.03) and icons are shown.',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            // MIGRATED TO BLACKSMITH API: Reload pins when setting changes
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                pins.reload({ moduleId: 'coffee-pub-squire' });
            }
        }
    });
    
    // Quest Pin Title Font Size
    game.settings.register(MODULE.ID, 'questPinTitleSize', {
        name: 'Quest Pin Title Font Size',
        hint: 'Font size for quest pin titles (in pixels). Default: 30px',
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: 12,
            max: 90,
            step: 1
        },
        default: 30,
        onChange: () => {
            // MIGRATED TO BLACKSMITH API: Reload pins when setting changes
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                pins.reload({ moduleId: 'coffee-pub-squire' });
            }
        }
    });
    
    // Quest Pin Title Max Width
    game.settings.register(MODULE.ID, 'questPinTitleMaxWidth', {
        name: 'Quest Pin Title Max Width',
        hint: 'Maximum width for quest pin titles before text wraps to new lines (in pixels). Default: 200px',
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: 100,
            max: 500,
            step: 10
        },
        default: 200,
        onChange: () => {
            // MIGRATED TO BLACKSMITH API: Reload pins when setting changes
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                pins.reload({ moduleId: 'coffee-pub-squire' });
            }
        }
    });
    
    // Quest Pin Title Vertical Offset
    game.settings.register(MODULE.ID, 'questPinTitleOffset', {
        name: 'Quest Pin Title Vertical Offset',
        hint: 'Distance from pin center to text edge. Positive: below pin (to text top). Negative: above pin (to text bottom). Range: -300 to 300px. Default: 50px',
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: -300,
            max: 300,
            step: 1
        },
        default: 50,
        onChange: () => {
            // MIGRATED TO BLACKSMITH API: Reload pins when setting changes
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                pins.reload({ moduleId: 'coffee-pub-squire' });
            }
        }
    });
    
    // Quest Pin Scale
    game.settings.register(MODULE.ID, 'questPinScale', {
        name: 'Quest Pin Scale',
        hint: 'Scale multiplier for quest pins size. 0.5 = 50% size, 1.0 = normal size, 2.0 = double size. Default: 1.0',
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: 0.5,
            max: 2.0,
            step: 0.1
        },
        default: 1.0,
        onChange: () => {
            // MIGRATED TO BLACKSMITH API: Reload pins when setting changes
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                pins.reload({ moduleId: 'coffee-pub-squire' });
            }
        }
    });




	// -- Search World Items First --
	game.settings.register(MODULE.ID, 'autoAddPartyMembers', {
		name: 'Auto Add Party Members',
		hint: 'When enabled, we will automatically add party members to the quest when the quest is created.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,
	});



	// -- Search World Items First --
	game.settings.register(MODULE.ID, 'searchWorldItemsFirst', {
		name: 'Search World Items First',
		hint: 'When enabled, will search for items in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Item Lookup Compendiums (up to 5) --

    for (let i = 1; i <= 5; i++) {
        game.settings.register(MODULE.ID, `itemCompendium${i}`, {
          name: `Item Lookup ${i}`,
          hint: `The #${i} compendium to use for item linking. Searched in order. Set to 'None' to skip.`,
          scope: "world",
          config: true,
          requiresReload: false,
          default: "none",
          choices: (() => {
                               
            // Helper function to safely get Blacksmith API
            function getBlacksmith() {
              return game.modules.get('coffee-pub-blacksmith')?.api;
            }
            
            const blacksmith = getBlacksmith();
            const choices = blacksmith?.BLACKSMITH?.arrCompendiumChoices;

            if (choices && Object.keys(choices).length > 0) return { ...choices };
            return { "none": "No compendiums found. Try reloading Foundry after all modules are enabled." };
          })()
        });
      }


    // -- Search World Items First --
    game.settings.register(MODULE.ID, 'searchWorldItemsFirst', {
        name: 'Search World Items First',
        hint: 'When enabled, will search for items in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
    });






    // ---------- TOKEN LIGHTING ----------
    game.settings.register(MODULE.ID, "headingH3TokenLighting", {
        name: 'Token Light Settings',
        hint: '',
        scope: "world",
        config: true,
        default: "",
        type: String,
    });
    // -------------------------------------


    // -- Fuzzy Match --
    game.settings.register(MODULE.ID, 'tokenLightingFuzzyMatch', {
        name: 'Fuzzy Match',
        hint: 'If common light source words are in the title and there is no perfect match, will use the closest match.',
        type: Boolean,
        config: true,
        scope: 'world',
        default: true,
    });

    // -- Consume Resource --
    game.settings.register(MODULE.ID, 'tokenLightingConsumeResource', {
        name: 'Consume Resource',
        hint: 'When enabled, will consume the resource when the item is used.',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
    });

    // -- Link to Action --
    game.settings.register(MODULE.ID, 'tokenLightingLinktoAction', {
        name: 'Link to Action',
        hint: 'Will take the item action when the light source is used.',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
    });







    // --------------------------------------------------------------
    // THESE QUEST SETTINGS ARE INTERNAL AND NOT EXPOSED IN SETTINGS
    // --------------------------------------------------------------


    // Quest Journal
    game.settings.register(MODULE.ID, 'questJournal', {
        name: "Quest Journal",
        hint: "The journal to use for quest entries. Each quest will be a separate page in this journal.",
        scope: "world",
        config: false,
        type: String,
        choices: () => {
            // Create choices object with 'none' as first option
            const choices = {
                'none': '- Select Journal -'
            };
            
            // Add all available journals
            game.journal.contents.forEach(j => {
                choices[j.id] = j.name;
            });
            
            return choices;
        },
        default: "none",
        onChange: () => {
            // Update the quest panel if it exists
            if (PanelManager.instance?.questPanel) {
                PanelManager.instance.questPanel.render(PanelManager.element);
            }
        }
    });

    // Quest Categories
    game.settings.register(MODULE.ID, 'questCategories', {
        name: "Quest Categories",
        hint: "Available categories for quests",
        scope: "world",
        config: false,
        type: Array,
        default: ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"]
    });



    game.settings.register(MODULE.ID, 'macrosWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE.ID, 'diceTrayWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE.ID, 'healthWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE.ID, 'charactersWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE.ID, 'usersWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE.ID, 'notesWindowPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

};

// ***************************
// *** FUNCTIONS           ***
// ***************************

// None




