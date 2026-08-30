import { MODULE, SQUIRE, getHandleWidth } from './const.js';
import { PanelManager } from './manager-panel.js';

/**
 * Starting rung for `compendiumPlayerAccess`.
 *
 * Asking rather than refusing: a player who wants something is a table
 * conversation, and the request card is where that happens. The GM can drop it
 * to Off or raise it to Add freely per world.
 *
 * Shared with migrateCompendiumAccessSetting(), which reads "still at the
 * default" as "the GM hasn't chosen yet" — so this constant has to be the same
 * value in both places or the migration stops recognising an untouched world.
 */
const COMPENDIUM_ACCESS_DEFAULT = 'request';

export const registerSettings = function() {


    // --------------------------------
    // --- Handle Display Settings ---
    // --------------------------------



    // *** INTRODUCTION ***
    // ---------- TITLE ----------
    game.settings.register(MODULE.ID, "headingH1Squire", {
        name: 'Introduction',
        hint: 'A FoundryVTT module from the Coffee Pub suite that provides quick access to character-specific combat information through a sliding tray interface. It features automatic character detection, spell and weapon management with favorites and filtering, HP tracking, ability rolls, an integrated dice tray, quick condition application, and customizable themes. The UI adjusts automatically for better usability and fully integrates with the Coffee Pub Blacksmith API.',
        scope: "user",
        config: true,
        default: "",
        type: String,
    });
    // -------------------------------------


	// ================================
	// ===        THE TRAY          ===
	// ================================
	game.settings.register(MODULE.ID, "headingH2Tray", {
		name: 'The Tray',
		hint: 'How the tray itself looks and behaves — which tabs and panels appear, what sits on the handle, and which Squire tools live in the menubar.',
		scope: "user",
		config: true,
		default: "",
		type: String,
	});

	// ---------- Tray Configuration ----------
	game.settings.register(MODULE.ID, "headingH3TrayConfiguration", {
		name: 'Tray Configuration',
		hint: 'Automation of token actions.',
		scope: "user",
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
            'player': 'Character Tab',
            'party': 'Party Tab',
            'last': 'Last Tab Viewed (Default)',
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
                    const handleWidth = parseInt(getHandleWidth());
                    document.documentElement.style.setProperty('--squire-tray-handle-width', `${handleWidth}px`);
                    document.documentElement.style.setProperty('--squire-tray-handle-adjustment', SQUIRE.TRAY_HANDLE_ADJUSTMENT);
                    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
                    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - handleWidth - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);
                    
                    // Set offset variables
                    document.documentElement.style.setProperty('--squire-tray-top-offset', SQUIRE.TRAY_TOP_OFFSET);
                    document.documentElement.style.setProperty('--squire-tray-bottom-offset', SQUIRE.TRAY_BOTTOM_OFFSET);

                    PanelManager.isPinned = isPinned;
                    PanelManager.updateUiMargin();
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
            document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${value - parseInt(getHandleWidth()) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);
            
            // onChange fires after the new value is stored, so the shared
            // calculation reads the same `value` this handler was given.
            PanelManager.updateUiMargin();
        }
    });

    // Auto-collapse when the user works elsewhere
    game.settings.register(MODULE.ID, 'trayAutoCollapse', {
        name: 'Collapse Tray When You Click Away',
        hint: 'When the tray is not pinned, collapse it shortly after you click somewhere else. Turn this off to leave the tray open until you close it yourself.',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    // Open on hover
    game.settings.register(MODULE.ID, 'trayOpenOnHover', {
        name: 'Open Tray on Hover',
        hint: 'Expand the tray when you move the mouse over the handle, and collapse it again shortly after you move off the tray. Ignored while the tray is pinned.',
        scope: 'user',
        config: true,
        type: Boolean,
        default: false
    });

    // How long "shortly after" is for both of the above
    game.settings.register(MODULE.ID, 'trayCollapseDelay', {
        name: 'Tray Collapse Delay',
        hint: 'How long to wait, in seconds, before an unpinned tray collapses after you click away or move off it.',
        scope: 'user',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 5,
            step: 0.25
        },
        default: 0.75
    });

	// ---------- Panel Configuration ----------
	game.settings.register(MODULE.ID, "headingH3PanelConfiguration", {
		name: 'Panel Configuration',
		hint: 'Panels appear at the top of the tray, above the spells, weapons, and inventory. They can be collapsed or hidden completely. Several of them can be accessed via the handle even if the panel is disabled.',
		scope: "user",
		config: true,
		default: "",
		type: String,
	});

    // Panel Visibility Settings

    game.settings.register(MODULE.ID, 'showGmPanel', {
        name: 'Show GM Details Panel',
        hint: 'Display the GM Details panel at the top of the tray. GM only — players never see this panel regardless of this setting.',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.squire) ui.squire.render();
        }
    });

    game.settings.register(MODULE.ID, 'showCharacterSummaryPanel', {
        name: 'Show Character Summary Panel',
        hint: 'Display one compact panel with experience, core statistics, abilities, and skills.',
        scope: 'user',
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
		scope: "user",
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

    // ---------- Handle Favorites ----------
    game.settings.register(MODULE.ID, 'showHandleFavorites', {
        name: 'Show Favorites in Handle',
        hint: 'Display favorite actions and items in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });

    // Not on the settings page: it is toggled from the handle itself, which is
    // the only place the difference is visible. A settings-page control for it
    // would be a second way to say something you can already say by looking at
    // the thing and clicking it.
    game.settings.register(MODULE.ID, 'handleMode', {
        scope: 'user',
        config: false,
        type: String,
        choices: { minimal: 'Minimal', full: 'Full' },
        default: 'minimal'
    });

    // Not on the settings page: it is a view switch on the panel's own title
    // bar, and the panel is the only place the difference means anything.
    game.settings.register(MODULE.ID, 'inventoryViewMode', {
        scope: 'user',
        config: false,
        type: String,
        choices: { list: 'List', bag: 'Grouped by container' },
        default: 'list'
    });

    game.settings.register(MODULE.ID, 'showHandleHealthBar', {
        name: 'Show Health Bar in Handle',
        hint: 'Display health bar visualization in the handle',
        scope: 'user',
        config: true,
        type: Boolean,
        default: true
    });




    // --------------------------------
    // ---     MENUBAR Settings     ---
    // --------------------------------



    // --------------------------------
    // ---   AUTO-FAVORITE Settings  ---
    // --------------------------------

	// ================================
	// ===       RUN THE GAME       ===
	// ================================
	game.settings.register(MODULE.ID, "headingH2RunTheGame", {
		name: 'Run the Game',
		hint: 'What Squire does with actor content at the table — favoriting a monster\'s usable actions, repairing statblocks that cannot be used as written, adjusting health, and moving items between characters.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	// ---------- Auto-Favorite Heading ----------
	game.settings.register(MODULE.ID, "headingH3AutoFavorites", {
		name: 'NPC Auto-Favorites',
		hint: 'When an NPC or monster token is first seen, Squire can favorite its usable statblock content (attacks, castable spells, activated features) so it is one click away in the tray and handle.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    game.settings.register(MODULE.ID, 'autoFavoriteNpcs', {
        name: 'Auto-Favorite NPC Statblock Content',
        hint: 'Automatically favorite an NPC\'s attacks, castable spells, and activated features. Newly added items are favorited too; anything you unfavorite by hand stays unfavorited.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'autoFavoriteGenericActions', {
        name: 'Also Ignore These Actions',
        hint: 'Comma-separated feature names to treat as rules reminders rather than statblock content, ADDED to the built-in list. Names are matched exactly (ignoring case), so if an actions compendium spells one differently — "Suffocation" where the built-in list has "Suffocating" — it slips through and gets favorited. Add the spelling you use here.',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });

    game.settings.register(MODULE.ID, 'autoFavoriteGenericActionsKept', {
        name: 'Generic Actions to Keep',
        hint: 'Comma-separated exceptions to the list above — generic actions worth a favorite slot anyway. This REPLACES the built-in list rather than adding to it, so you can narrow it. Leave blank for the default: Ready and Disengage.',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });


    game.settings.register(MODULE.ID, 'quantityConfirmValue', {
        name: 'Confirm Deleting Items Worth More Than',
        hint: 'Setting an item\'s quantity to zero deletes it. Deletion is always confirmed for magical, attuned, or better-than-common items; this adds a confirmation for anything whose total value in gold exceeds this amount. Set to 0 to confirm on value never.',
        scope: 'world',
        config: true,
        type: Number,
        default: 50,
        range: {
            min: 0,
            max: 1000,
            step: 10,
        },
    });


    // --------------------------------
    // ---  STATBLOCK CHECK Settings ---
    // --------------------------------

	// ---------- Statblock Heading ----------
	game.settings.register(MODULE.ID, "headingH3Statblock", {
		name: 'NPC Statblock Checks',
		hint: 'GM-only checks for statblocks that cannot actually be used in play — a bow with no arrows, a crossbow with no bolts, or a slot-casting spell list with no spell slots. Problems show as a warning badge on the affected item; click the badge to repair it.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    game.settings.register(MODULE.ID, 'inventoryWarnings', {
        name: 'Inventory Warnings',
        hint: 'Flag player characters whose weapons have no usable ammunition. The owning player sees the warning on their own characters; only the GM can act on it, and clicking it asks the GM rather than adding anything.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'cleanupPlayerRequests', {
        name: 'Players Can Request Cleanup',
        hint: 'Let players run the character sheet cleanup on characters they own. They never write to their own sheet: applying sends the plan to the GM as an approval window, and the GM decides row by row.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'statblockShowWarnings', {
        name: 'Show Statblock Warnings',
        hint: 'Display a clickable warning badge on NPC weapons and spells that cannot be used as configured. GM only. Player characters are covered by Inventory Warnings instead.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'statblockAutoFix', {
        name: 'Repair Statblocks Automatically',
        hint: 'Repair these problems as soon as an NPC is selected, instead of waiting for a click. Adds missing ammunition and grants the spell slots the creature\'s own spell list requires. Never removes or changes anything else. NPCs only — a player character is never repaired without the GM clicking.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE.ID, 'statblockAmmoQuantity', {
        name: 'Ammunition Restock Quantity',
        hint: 'How many arrows, bolts, bullets, or needles to give an NPC when repairing missing or depleted ammunition.',
        scope: 'world',
        config: true,
        type: Number,
        default: 20,
        range: {
            min: 1,
            max: 100,
            step: 1,
        },
    });









    // --------------------------------
    // --- Compendium Settings ---
    // --------------------------------


	// ---------- Compendiums Heading ----------
	game.settings.register(MODULE.ID, "headingH3Compendiums", {
		name: 'Compendiums',
		hint: 'The tray\'s compendium search, and how much of it players get. Sits next to Transfers because both govern how content arrives on a character sheet.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

    // Four rungs rather than a boolean, because "may they add things" and "may
    // they look things up" are different questions. A player who doesn't
    // understand how grappling works, or who wants to read the other party
    // member's spell, needs the compendium open — not write access to their own
    // sheet. Migrated from the old `compendiumAddPlayers` boolean by
    // migrateCompendiumAccessSetting().
    game.settings.register(MODULE.ID, 'compendiumPlayerAccess', {
        name: 'Let Players Use Compendiums',
        hint: 'What players may do with the tray\'s compendium search on characters they own. The GM can always search and add.',
        scope: 'world',
        config: true,
        type: String,
        choices: {
            none: 'Off — no compendium mode for players',
            browse: 'Look only — search and read details, no adding',
            request: 'Ask the GM — adding sends a request to approve or deny',
            add: 'Add freely — players add straight to their own sheet'
        },
        default: COMPENDIUM_ACCESS_DEFAULT,
        onChange: () => {
            // World-scoped, so a GM flipping this has to reach players who
            // already have the tray open. The toggle lives in the control panel
            // and the results panel changes shape with the mode.
            if (PanelManager.instance?.controlPanel) {
                PanelManager.instance.controlPanel.render(PanelManager.element);
            }
            if (PanelManager.instance?.compendiumSearchPanel) {
                PanelManager.instance.compendiumSearchPanel.render(PanelManager.element);
            }
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
    game.settings.register(MODULE.ID, 'isCharacterSummaryPanelCollapsed', {
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

    // Remembered per-user state for the compendium quick-add checkbox. Not in
    // the config UI — it's toggled inline where it takes effect.
    game.settings.register(MODULE.ID, 'compendiumClearOnAdd', {
        scope: 'user',
        config: false,
        type: Boolean,
        default: true
    });

    // --- Filter Bar ---
    //
    // Twelve chips under the tray title, in three groups. They replace the old
    // per-panel filter icons: an equipped toggle sitting inside the weapons
    // panel and another inside inventory answered the same question twice, and
    // neither reached favourites, where the answer is most useful.
    //
    // Item-type chips persist because closing a section is a deliberate,
    // remembered choice. Action-economy chips deliberately do NOT persist and
    // live on the ControlPanel instance instead: logging in a week later to a
    // half-empty sheet, with one dimmed chip as the only clue, is a bad morning.

    // Item types. "Favorites" is the odd one of the five — a flag rather than a
    // type — so it hides its panel without filtering rows anywhere else.
    for (const type of ['Favorites', 'Weapons', 'Spells', 'Features', 'Inventory']) {
        game.settings.register(MODULE.ID, `filterType${type}`, {
            scope: 'user',
            config: false,
            type: Boolean,
            default: true
        });
    }

    // Availability, as four buckets rather than two toggles. A toggle can only
    // ever hide one side, so "what am I carrying that isn't equipped" and "what
    // could I prepare that I haven't" were unaskable. Splitting each question
    // into its two answers makes them chips like every other chip: on shows that
    // slice, and all four on is everything.
    //
    // Equipped and prepared stay separate questions. Preparing a fixed number of
    // spells and equipping what you can carry have something in common
    // mechanically, but not in anyone's head, which is the part that matters.
    //
    // Named `filterShow*` rather than reusing the old `filterState*` keys: those
    // were stored with the opposite meaning — true meant "restrict to equipped"
    // — so a stored `false` would now read as "hide everything equipped" and
    // empty the panel for anyone who ran the previous build.
    for (const bucket of ['Equipped', 'Unequipped', 'Prepared', 'Unprepared']) {
        game.settings.register(MODULE.ID, `filterShow${bucket}`, {
            scope: 'user',
            config: false,
            type: Boolean,
            default: true
        });
    }

    // View Mode Setting
    game.settings.register(MODULE.ID, 'viewMode', {
        name: 'View Mode',
        hint: 'Switch between player and party view',
        scope: 'client',
        config: false,
        type: String,
        choices: {
            'player': 'Character View',
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

    // -------------------------------------


    // Campaign details — name, party name/size/level/makeup, and rulebooks —
    // are read from Blacksmith rather than collected here. Squire registered its
    // own six settings for these; four were never read by any code, and the two
    // that were duplicated fields Blacksmith already owns, so a GM configured the
    // same campaign twice and the copies could disagree. Blacksmith is the single
    // source now: see getCampaignContext() in helpers.js.


    // ================================
    // ===          CANVAS          ===
    // ================================
    game.settings.register(MODULE.ID, "headingH2Canvas", {
        name: 'Canvas',
        hint: 'Things Squire does outside the tray, on the canvas itself.',
        scope: "world",
        config: true,
        default: "",
        type: String,
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








};

// ***************************
// *** FUNCTIONS           ***
// ***************************


/**
 * Fold the retired `compendiumAddPlayers` boolean into `compendiumPlayerAccess`.
 *
 * A world where the GM had turned players loose on the compendiums keeps that
 * permission — `true` becomes the top rung — and everything else lands on
 * COMPENDIUM_ACCESS_DEFAULT. Only migrates while the new setting still reads as
 * that default, so a GM who has already picked a rung isn't overruled by a stale
 * boolean. That test is why the default lives in a constant: written literally
 * here, changing the default in the registration would silently stop this from
 * recognising an untouched world, and worlds that had the old switch on would
 * quietly lose the permission.
 *
 * The legacy key is read straight out of world settings storage rather than
 * being kept registered for a release: registering a setting purely so it can
 * be read once leaves a dead switch in the file that the next person has to work
 * out is vestigial. The Setting document is deleted afterwards, so this is a
 * no-op on every subsequent load.
 */
export async function migrateCompendiumAccessSetting() {
    if (!game.user.isGM) return;

    const legacy = game.settings.storage.get('world')?.getSetting?.(`${MODULE.ID}.compendiumAddPlayers`);
    if (!legacy) return;

    try {
        // Stored serialized, and tolerant of both shapes because a Boolean
        // setting written by an older core version may arrive either way.
        const wasEnabled = legacy.value === true || legacy.value === 'true';
        if (wasEnabled && game.settings.get(MODULE.ID, 'compendiumPlayerAccess') === COMPENDIUM_ACCESS_DEFAULT) {
            await game.settings.set(MODULE.ID, 'compendiumPlayerAccess', 'add');
        }
        await legacy.delete();
    } catch (error) {
        console.error(`${MODULE.ID}: Failed to migrate compendiumAddPlayers:`, error);
    }
}
