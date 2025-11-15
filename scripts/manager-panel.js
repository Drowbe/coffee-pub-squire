import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getTaskText, getObjectiveTooltipData } from './helpers.js';
import { CharacterPanel } from './panel-character.js';
import { GmPanel } from './panel-gm.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { ControlPanel } from './panel-control.js';
import { FeaturesPanel } from './panel-features.js';
import { DiceTrayPanel } from './panel-dicetray.js';
import { ExperiencePanel } from './panel-experience.js';
import { HealthPanel } from './panel-health.js';
import { StatsPanel } from './panel-stats.js';
import { AbilitiesPanel } from './panel-abilities.js';
import { PartyPanel } from './panel-party.js';
import { PartyStatsPanel } from './panel-party-stats.js';
import { NotesPanel } from './panel-notes.js';
import { CodexPanel } from './panel-codex.js';
import { QuestPanel } from './panel-quest.js';
import { MacrosPanel } from './panel-macros.js';
import { PrintCharacterSheet } from './utility-print-character.js';
import { QuestPin } from './quest-pin.js';
import { HandleManager } from './manager-handle.js';
import { trackModuleInterval, trackModuleTimeout, registerTimeoutId, registerIntervalId, clearTrackedInterval, clearTrackedTimeout } from './timer-utils.js';

// Add multi-select tracking variables at the top of the file
export let _multiSelectTimeout = null;
export let _lastSelectionTime = 0;
export let _selectionCount = 0;
export const MULTI_SELECT_DELAY = 150; // ms to wait after last selection event
export const SINGLE_SELECT_THRESHOLD = 300; // ms threshold to consider as single selection

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PanelManager {
    static instance = null;
    static currentActor = null;
    static isPinned = false;
    static viewMode = 'player';
    static element = null;
    static newlyAddedItems = new Map();
    static _cleanupInterval = null;
    static _initializationInProgress = false;
    static _lastInitTime = 0;
    static _eventListeners = new Map(); // Track event listeners for cleanup
    static _timeouts = new Set(); // Track timeouts for cleanup
    static _intervals = new Set(); // Track intervals for cleanup
    static gmDetails = {
        resistances: [],
        immunities: [],
        biography: '',
        biographyHtml: '',
        biographyHtmlRaw: ''
    };

    constructor(actor) {
        this.actor = actor;
        this.element = null;
        this.gmPanel = null;
        if (actor) {
            this.characterPanel = new CharacterPanel(actor);
            if (game.user.isGM) {
                this.gmPanel = new GmPanel(actor);
            }
            this.controlPanel = new ControlPanel(actor);
            this.favoritesPanel = new FavoritesPanel(actor);
            this.spellsPanel = new SpellsPanel(actor);
            this.weaponsPanel = new WeaponsPanel(actor);
            this.inventoryPanel = new InventoryPanel(actor);
            this.featuresPanel = new FeaturesPanel(actor);
            this.experiencePanel = new ExperiencePanel(actor);
            this.statsPanel = new StatsPanel(actor);
            this.abilitiesPanel = new AbilitiesPanel(actor);
        }
        // Always create these panels regardless of actor (for handle icons and multi-select functionality)
        this.dicetrayPanel = new DiceTrayPanel({ actor });
        this.healthPanel = new HealthPanel(actor); // Always create for multi-select
        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();
        this.notesPanel = new NotesPanel();
        this.codexPanel = new CodexPanel();
        this.questPanel = new QuestPanel();
        this.hiddenCategories = new Set();
        this.macrosPanel = new MacrosPanel({ actor });
        
        // Register panels with HookManager
        this._registerPanelsWithHookManager();
        
        // Create handle manager for handle-specific functionality
        this.handleManager = new HandleManager(this);
    }

    static async initialize(actor = null) {
        // Check if user is excluded - with safety check for setting registration
        let excludedUsers = [];
        try {
            const excludedUsersSetting = game.settings.get(MODULE.ID, 'excludedUsers');
            if (excludedUsersSetting) {
                excludedUsers = excludedUsersSetting.split(',').map(id => id.trim());
            }
        } catch (error) {
            // Setting not registered yet, treat as not excluded
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                'Settings not yet registered, treating user as not excluded',
                { error },
                false,
                false
            );
        }
        
        if (excludedUsers.includes(game.user.id)) {
            // If we have an existing tray, remove it
            if (PanelManager.element) {
                PanelManager.element.remove();
                PanelManager.element = null;
            }
            return;
        }

        // Debounce initialization - don't initialize more than once every 100ms
        const now = Date.now();
        if (now - PanelManager._lastInitTime < 100) {
            return;
        }
        PanelManager._lastInitTime = now;
        
        // Prevent overlapping initializations 
        if (PanelManager._initializationInProgress) {
            return;
        }
        
        try {
            PanelManager._initializationInProgress = true;
            
            // Check if this is the first time loading
            const isFirstLoad = !PanelManager.instance;
            
            // Set default viewMode based on user preference
            if (isFirstLoad) {
                const defaultMode = game.settings.get(MODULE.ID, 'viewDefaultMode');
                if (defaultMode === 'last') {
                    // Load whatever was last viewed (or fallback to 'player' if none)
                    PanelManager.viewMode = game.settings.get(MODULE.ID, 'viewMode') || 'player';
                } else {
                    // Use their specified default tab
                    PanelManager.viewMode = defaultMode;
                    await game.settings.set(MODULE.ID, 'viewMode', defaultMode);
                }
            } else {
                // Load the saved viewMode
                PanelManager.viewMode = game.settings.get(MODULE.ID, 'viewMode');
            }
            
            // Validate that the initial viewMode is enabled
            const enabledTabs = ['player']; // Player is always enabled
            if (game.settings.get(MODULE.ID, 'showTabParty')) enabledTabs.push('party');
            if (game.settings.get(MODULE.ID, 'showTabNotes')) enabledTabs.push('notes');
            if (game.settings.get(MODULE.ID, 'showTabCodex')) enabledTabs.push('codex');
            if (game.settings.get(MODULE.ID, 'showTabQuests')) enabledTabs.push('quest');
            
            if (!enabledTabs.includes(PanelManager.viewMode)) {
                // Fallback to first enabled tab
                PanelManager.viewMode = enabledTabs[0];
                await game.settings.set(MODULE.ID, 'viewMode', enabledTabs[0]);
            }
            
            // If we have an instance with the same actor, do nothing
            if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) {
                PanelManager._initializationInProgress = false;
                return;
            }

            // Set up cleanup interval if not already set
            if (!PanelManager._cleanupInterval) {
                const intervalId = trackModuleInterval(() => {
                    PanelManager.cleanupNewlyAddedItems();
                    // Force a re-render of the inventory panel if it exists
                    if (PanelManager.instance?.inventoryPanel?.element) {
                        PanelManager.instance.inventoryPanel.render(PanelManager.instance.inventoryPanel.element);
                    }
                }, 30000); // Check every 30 seconds
                PanelManager._cleanupInterval = intervalId;
                PanelManager.trackInterval(intervalId);
            }

            // Preserve window states from old instance
            const oldHealthPanel = PanelManager.instance?.healthPanel;
            const hadHealthWindow = oldHealthPanel?.isPoppedOut && oldHealthPanel?.window;
            const oldDiceTrayPanel = PanelManager.instance?.dicetrayPanel;
            const hadDiceTrayWindow = oldDiceTrayPanel?.isPoppedOut && oldDiceTrayPanel?.window;

            // Clean up old instance before creating new one to prevent memory leaks
            if (PanelManager.instance) {
                PanelManager._cleanupOldInstance();
            }

            // Create or update instance
            PanelManager.currentActor = actor;
            
            // Always create a new instance to ensure clean state
            PanelManager.instance = new PanelManager(actor);

            // Check if this is a monster/NPC and auto-favorite items
            if (actor && actor.type !== "character") {
                // Check if actor is from a compendium before trying to modify it
                const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
                if (isFromCompendium) {
                    // Skip auto-favoriting for actors from compendiums
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    blacksmith?.utils.postConsoleAndNotification(
                        MODULE.NAME,
                        "SQUIRE | Skipping auto-favorites initialization for actor from compendium",
                        { 
                            actorName: actor.name, 
                            actorType: actor.type,
                            pack: actor.pack,
                            collectionName: actor.collection?.metadata?.name || 'Unknown',
                            collectionId: actor.collection?.id || 'Unknown'
                        },
                        false,
                        false
                    );
                } else {
                    await FavoritesPanel.initializeNpcFavorites(actor);
                }
            }
            
            // Restore window states from user flags
            const savedWindowStates = game.user.getFlag(MODULE.ID, 'windowStates') || {};
            
            // Restore health window state if it was open
            if (hadHealthWindow && PanelManager.instance.healthPanel) {
                PanelManager.instance.healthPanel.isPoppedOut = true;
                PanelManager.instance.healthPanel.window = oldHealthPanel.window;
                PanelManager.instance.healthPanel.window.panel = PanelManager.instance.healthPanel;
                HealthPanel.isWindowOpen = true;
                HealthPanel.activeWindow = PanelManager.instance.healthPanel.window;
                // Update the panel and window with the new actor's token
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actor?.id);
                if (token) {
                    PanelManager.instance.healthPanel.updateTokens([token]);
                }
            } else if (savedWindowStates.health && PanelManager.instance.healthPanel) {
                // Restore from saved state
                await PanelManager.instance.healthPanel._onPopOut();
            }

            // Restore dice tray window state if it was open
            if (hadDiceTrayWindow && PanelManager.instance.dicetrayPanel) {
                PanelManager.instance.dicetrayPanel.isPoppedOut = true;
                PanelManager.instance.dicetrayPanel.window = oldDiceTrayPanel.window;
                PanelManager.instance.dicetrayPanel.window.panel = PanelManager.instance.dicetrayPanel;
                DiceTrayPanel.isWindowOpen = true;
                DiceTrayPanel.activeWindow = PanelManager.instance.dicetrayPanel.window;
                // Update the panel and window with the new actor
                PanelManager.instance.dicetrayPanel.updateActor(actor);
            } else if (savedWindowStates.diceTray && PanelManager.instance.dicetrayPanel) {
                // Restore from saved state
                await PanelManager.instance.dicetrayPanel._onPopOut();
            }

            // Restore macros window state if it was open
            if (savedWindowStates.macros && PanelManager.instance.macrosPanel) {
                // Restore from saved state
                await PanelManager.instance.macrosPanel._onPopOut();
            }

            // Remove any existing trays first
            $('.squire-tray').remove();
            
            // Create the tray
            await PanelManager.instance.createTray();
            
            // Initialize quest markers for the current scene
            if (PanelManager.instance.questMarkers) {
                await PanelManager.instance.questMarkers.initializeSceneMarkers();
            }
            
            // Update health panel with current token selection
            await _updateHealthPanelFromSelection();
        } finally {
            PanelManager._initializationInProgress = false;
        }
    }

    async createTray() {
        // Use the current viewMode (which is either default or from settings)
        const viewMode = PanelManager.viewMode;
        
        // Build favorite macros array
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);

        // Calculate selection data for the template
        const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
        const selectionCount = controlledTokens.length;
        const showSelectionBox = selectionCount > 1;

        const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
            actor: this.actor,
            isGM: game.user.isGM,
            effects: this.actor?.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            settings: {
                showExperiencePanel: game.settings.get(MODULE.ID, 'showExperiencePanel'),
                showHealthPanel: game.settings.get(MODULE.ID, 'showHealthPanel'),
                showAbilitiesPanel: game.settings.get(MODULE.ID, 'showAbilitiesPanel'),
                showStatsPanel: game.settings.get(MODULE.ID, 'showStatsPanel'),
                showDiceTrayPanel: game.settings.get(MODULE.ID, 'showDiceTrayPanel'),
                showMacrosPanel: game.settings.get(MODULE.ID, 'showMacrosPanel'),
                showPartyStatsPanel: game.settings.get(MODULE.ID, 'showPartyStatsPanel')
            },
            viewMode: viewMode,
            showTabParty: game.settings.get(MODULE.ID, 'showTabParty'),
            showTabNotes: game.settings.get(MODULE.ID, 'showTabNotes'),
            showTabCodex: game.settings.get(MODULE.ID, 'showTabCodex'),
            showTabQuests: game.settings.get(MODULE.ID, 'showTabQuests'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            newlyAddedItems: Object.fromEntries(PanelManager.newlyAddedItems),
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
            favoriteMacros,
            selectionCount,
            showSelectionBox
        });
        const trayElement = $(trayHtml);
        $('body').append(trayElement);
        PanelManager.element = trayElement;
        
        // Set initial position and restore pin state
        trayElement.attr('data-position', 'left');
        PanelManager.isPinned = game.settings.get(MODULE.ID, 'isPinned');
        if (PanelManager.isPinned) {
            trayElement.addClass('pinned expanded');
        }

        // Ensure viewMode is properly set
        PanelManager.viewMode = viewMode;
        
        await this.renderPanels(trayElement);
        this.activateListeners(trayElement);
        
        // Populate handle with rich data immediately after creation
        await this.handleManager.updateHandle();
        
        // Set view mode
        if (viewMode === 'player') {
            await this.setViewMode('player');
        }

        // Handle fade effect is now managed by HandleManager
    }

    async updateTray() {
        if (!this.element) return;
        
        // Store current state
        const wasExpanded = this.element.hasClass('expanded');
        const wasPinned = this.element.hasClass('pinned');
        
        // Create new tray element
        const viewMode = PanelManager.viewMode;
        
        // Build favorite macros array
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);

        // Calculate selection data for the template
        const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
        const selectionCount = controlledTokens.length;
        const showSelectionBox = selectionCount > 1;

        const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
            actor: this.actor,
            isGM: game.user.isGM,
            effects: this.actor.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            settings: {
                showExperiencePanel: game.settings.get(MODULE.ID, 'showExperiencePanel'),
                showHealthPanel: game.settings.get(MODULE.ID, 'showHealthPanel'),
                showAbilitiesPanel: game.settings.get(MODULE.ID, 'showAbilitiesPanel'),
                showStatsPanel: game.settings.get(MODULE.ID, 'showStatsPanel'),
                showDiceTrayPanel: game.settings.get(MODULE.ID, 'showDiceTrayPanel'),
                showMacrosPanel: game.settings.get(MODULE.ID, 'showMacrosPanel'),
                showPartyStatsPanel: game.settings.get(MODULE.ID, 'showPartyStatsPanel')
            },
            viewMode: viewMode,
            showTabParty: game.settings.get(MODULE.ID, 'showTabParty'),
            showTabNotes: game.settings.get(MODULE.ID, 'showTabNotes'),
            showTabCodex: game.settings.get(MODULE.ID, 'showTabCodex'),
            showTabQuests: game.settings.get(MODULE.ID, 'showTabQuests'),
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
            selectionCount,
            showSelectionBox
        });
        const newTrayElement = $(trayHtml);
        
        // Preserve expanded/pinned state without animation
        if (wasExpanded) {
            newTrayElement.addClass('expanded');
        }
        if (wasPinned) {
            newTrayElement.addClass('pinned expanded');
        }
        
        // Replace the old tray with the new one
        PanelManager.element.replaceWith(newTrayElement);
        PanelManager.element = newTrayElement;

        // Re-attach listeners and render panels
        this.activateListeners(PanelManager.element);

        // Create new panel instances with updated element references
        this.characterPanel = new CharacterPanel(this.actor);
        this.controlPanel = new ControlPanel(this.actor);
        this.favoritesPanel = new FavoritesPanel(this.actor);
        this.spellsPanel = new SpellsPanel(this.actor);
        this.weaponsPanel = new WeaponsPanel(this.actor);
        this.inventoryPanel = new InventoryPanel(this.actor);
        this.featuresPanel = new FeaturesPanel(this.actor);
        this.experiencePanel = new ExperiencePanel(this.actor);

        // Only create health panel if not popped out and enabled in settings
        if (!HealthPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showHealthPanel')) {
            this.healthPanel = new HealthPanel(this.actor);
            
            // Update health panel with all controlled tokens for bulk operations
            const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
            if (controlledTokens.length > 0) {
                this.healthPanel.updateTokens(controlledTokens);
            }
        } else {
            this.healthPanel = null;
        }

        // Only create dice tray panel if not popped out and enabled in settings
        if (!DiceTrayPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showDiceTrayPanel')) {
            this.dicetrayPanel = new DiceTrayPanel({ actor: this.actor });
        } else {
            this.dicetrayPanel = null;
        }

        // Only create macros panel if not popped out and enabled in settings
        if (!MacrosPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showMacrosPanel')) {
            this.macrosPanel = new MacrosPanel({ actor: this.actor });
        } else {
            this.macrosPanel = null;
        }

        this.statsPanel = new StatsPanel(this.actor);
        this.abilitiesPanel = new AbilitiesPanel(this.actor);
        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();
        this.notesPanel = new NotesPanel();

        // Update panel element references for non-popped panels
        this.characterPanel.element = PanelManager.element;
        if (this.gmPanel) {
            this.gmPanel.element = PanelManager.element;
        }
        this.controlPanel.element = PanelManager.element;
        this.favoritesPanel.element = PanelManager.element;
        this.spellsPanel.element = PanelManager.element;
        this.weaponsPanel.element = PanelManager.element;
        this.inventoryPanel.element = PanelManager.element;
        this.featuresPanel.element = PanelManager.element;
        this.experiencePanel.element = PanelManager.element;
        if (!HealthPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showHealthPanel')) {
            this.healthPanel.element = PanelManager.element;
        }
        if (!DiceTrayPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showDiceTrayPanel')) {
            this.dicetrayPanel.element = PanelManager.element;
        }
        if (!MacrosPanel.isWindowOpen && game.settings.get(MODULE.ID, 'showMacrosPanel')) {
            this.macrosPanel.element = PanelManager.element;
        }
        this.statsPanel.element = PanelManager.element;
        this.abilitiesPanel.element = PanelManager.element;

        // Render all panels
        await this.renderPanels(PanelManager.element);


    }

    async updateHandle() {
        // Delegate to the handle manager
        if (this.handleManager) {
            await this.handleManager.updateHandle();
        }
    }

    async renderPanels(element) {
        if (!element) return;

        // Render all panels
        if (this.actor) {
            this.characterPanel?.render(element);
            if (game.user.isGM) {
                if (this.gmPanel) {
                    this.gmPanel.render(element, PanelManager.gmDetails);
                }
            } else {
                PanelManager.removePanelDom(this.gmPanel);
            }
            this.controlPanel?.render(element);
            this.favoritesPanel?.render(element);
            this.spellsPanel?.render(element);
            this.weaponsPanel?.render(element);
            this.inventoryPanel?.render(element);
            this.featuresPanel?.render(element);

            // Only render panels if they are enabled in settings
            if (game.settings.get(MODULE.ID, 'showDiceTrayPanel')) {
                if (this.dicetrayPanel && !this.dicetrayPanel.isPoppedOut) {
                    this.dicetrayPanel.render(element);
                }
            } else {
                PanelManager.removePanelDom(this.dicetrayPanel);
            }
            if (game.settings.get(MODULE.ID, 'showExperiencePanel')) {
                this.experiencePanel?.render(element);
            } else {
                PanelManager.removePanelDom(this.experiencePanel);
            }
            if (game.settings.get(MODULE.ID, 'showHealthPanel')) {
                if (this.healthPanel && !this.healthPanel.isPoppedOut) {
                    this.healthPanel.render(element);
                }
            } else {
                PanelManager.removePanelDom(this.healthPanel);
            }
            if (game.settings.get(MODULE.ID, 'showStatsPanel')) {
                this.statsPanel?.render(element);
            } else {
                PanelManager.removePanelDom(this.statsPanel);
            }
            if (game.settings.get(MODULE.ID, 'showAbilitiesPanel')) {
                this.abilitiesPanel?.render(element);
            } else {
                PanelManager.removePanelDom(this.abilitiesPanel);
            }
        }

        // These panels don't require an actor
        this.partyPanel?.render(element);
        if (game.settings.get(MODULE.ID, 'showPartyStatsPanel')) {
            this.partyStatsPanel?.render(element);
        } else {
            PanelManager.removePanelDom(this.partyStatsPanel);
        }
        this.notesPanel?.render(element);
        this.codexPanel?.render(element);
        this.questPanel?.render(element);
        if (game.settings.get(MODULE.ID, 'showMacrosPanel')) {
            if (this.macrosPanel && !this.macrosPanel.isPoppedOut) {
                this.macrosPanel.render(element);
            }
        } else {
            PanelManager.removePanelDom(this.macrosPanel);
        }
    }

    activateListeners(tray) {
        const handle = tray.find('.tray-handle');
        
        // Remove existing event listeners to prevent duplicates
        tray.find('.tray-tab-button').off('click');
        tray.find('.tray-gm-button').off('click');
        tray.find('.tray-tools-button').off('click');
        tray.find('#button-clear').off('click');
        
       

        // View tab buttons
        tray.find('.tray-tab-button').click(async (event) => {
            event.preventDefault();
            const view = event.currentTarget.dataset.view;
            await this.setViewMode(view);
        });
        
        // GM-only buttons
        if (game.user.isGM) {
            // Award Button
            tray.find('.tray-gm-button[data-action="award"]').click(async (event) => {
                // Check if DnD5e module is available
                if (!game.dnd5e) {
                    ui.notifications.error("The DnD5e system is required for the Award functionality.");
                    return;
                }
                
                try {
                    // The path might be different between versions, try multiple possibilities
                    const AwardClass = game.dnd5e.applications?.Award || 
                                      game.dnd5e.documents?.Award ||
                                      game.dnd5e.apps?.Award ||
                                      game.dnd5e.api?.Award;
                    
                    if (!AwardClass) {
                        ui.notifications.warn("Award functionality not found in this version of DnD5e. Please check system version.");
                        return;
                    }
                    
                    const tokens = canvas.tokens.controlled;
                    const actors = tokens.map(t => t.actor).filter(a => a);
                    
                    // If no tokens are selected, try to use all party members
                    if (!actors.length) {
                        const partyActors = canvas.tokens.placeables
                            .filter(t => t.actor?.hasPlayerOwner)
                            .map(t => t.actor);
                        
                        if (partyActors.length) {
                            // Create and render the Award dialog
                            new AwardClass(partyActors).render(true);
                        } else {
                            ui.notifications.warn("Please select at least one token or have party members on the canvas.");
                        }
                    } else {
                        // Create and render the Award dialog with selected tokens
                        new AwardClass(actors).render(true);
                    }
                } catch (error) {
                    console.error('Error launching Award dialog:', error);
                    ui.notifications.error("Error launching Award dialog. See console for details.");
                }
                
                // Play sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'toolbarButtonSound') || 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3';
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
            });
        }
            
        // Select Party Button - available to all users
        tray.find('.tray-tools-button[data-action="select-party"]').click(async (event) => {
            // Find all player character tokens on the canvas
            const partyTokens = canvas.tokens.placeables.filter(t => 
                t.actor?.hasPlayerOwner && t.actor?.type === "character"
            );
            
            if (partyTokens.length === 0) {
                ui.notifications.warn("No player character tokens found on this scene.");
                return;
            }
            
            // For players, only select tokens they own
            const tokensToSelect = game.user.isGM 
                ? partyTokens 
                : partyTokens.filter(t => t.actor.isOwner);
                
            if (tokensToSelect.length === 0) {
                ui.notifications.warn("You don't have ownership of any party tokens on this scene.");
                return;
            }
            
            // Deselect all currently selected tokens
            canvas.tokens.releaseAll();
            
            // Select all appropriate party tokens
            tokensToSelect.forEach(token => token.control({releaseOthers: false}));
            
            // Play sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, 'toolbarButtonSound') || 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3';
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        });

        // Selection wrapper button handlers
        // Clear selection button
        tray.find('#button-clear').click(async (event) => {
            // Deselect all currently selected tokens
            canvas.tokens.releaseAll();
            
            // Play sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, 'toolbarButtonSound') || 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3';
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        });


        // Add drag and drop handlers for stacked panels
        const stackedContainer = tray.find('.panel-containers.stacked');
        
        // Remove any existing drag event listeners
        stackedContainer.off('dragenter.squire dragleave.squire dragover.squire drop.squire');
        
        // Add new drag event listeners
        stackedContainer.on('dragenter.squire', (event) => {
            event.preventDefault();
            // Add drop hover styles for any drag operation
            $(event.currentTarget).addClass('drop-target');
            // Play hover sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        });

        stackedContainer.on('dragleave.squire', (event) => {
            event.preventDefault();
            // Remove the style if we're leaving the container or entering a child element
            const container = $(event.currentTarget);
            const relatedTarget = $(event.relatedTarget);
            // Check if we're actually leaving the container
            if (!relatedTarget.closest('.panel-containers.stacked').is(container)) {
                container.removeClass('drop-target');
            }
        });

        stackedContainer.on('dragover.squire', (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        stackedContainer.on('drop.squire', async (event) => {
            event.preventDefault();
            
            // Get the container and remove hover state
            const $container = $(event.currentTarget);
            $container.removeClass('drop-target');
            
            try {
                const dataTransfer = event.originalEvent.dataTransfer.getData('text/plain');
                const data = JSON.parse(dataTransfer);
                
                // Play drop sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Get the current actor
                const actor = PanelManager.currentActor;
                if (!actor) {
                    ui.notifications.warn("No character selected.");
                    return;
                }
                
                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        // This could be either a world item OR a drag from character sheet
                        if ((data.actorId && (data.data?.itemId || data.embedId)) || 
                            data.fromInventory || 
                            (data.uuid && data.uuid.startsWith("Actor."))) {
                            

                            // This is a drag from character sheet
                            let sourceActorId;
                            let itemId;
                            
                            // Parse from UUID format if present (Actor.actorId.Item.itemId)
                            if (data.uuid && data.uuid.startsWith("Actor.")) {
                                const parts = data.uuid.split(".");
                                if (parts.length >= 4 && parts[2] === "Item") {
                                    sourceActorId = parts[1];
                                    itemId = parts[3];
                                }
                            } else {
                                sourceActorId = data.actorId;
                                itemId = data.data?.itemId || data.embedId || data.uuid?.split('.').pop();
                            }
                            
                            const sourceActor = game.actors.get(sourceActorId);
                            if (!sourceActor || !itemId) {
                                ui.notifications.warn("Could not determine the source actor or item.");
                                return;
                            }
                            
                            // Get the item from the source actor
                            const sourceItem = sourceActor.items.get(itemId);
                            if (!sourceItem) {
                                ui.notifications.warn("Could not find the item on the source character.");
                                return;
                            }
                            
                            // Handle quantity logic for stackable items
                            let quantityToTransfer = 1;
                            const hasQuantity = sourceItem.system.quantity != null;
                            const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
                            
                            // Always create a dialog, even for single items
                            const timestamp = Date.now();
                            
                            // Check if we have direct permission to modify both actors
                            const hasSourcePermission = sourceActor.isOwner;
                            const hasTargetPermission = actor.isOwner;
                            
                            // Prepare template data for sender's dialog
                            const senderTemplateData = {
                                sourceItem,
                                sourceActor,
                                targetActor: actor,
                                maxQuantity,
                                timestamp,
                                canAdjustQuantity: hasQuantity && maxQuantity > 1,
                                isReceiveRequest: false,
                                hasQuantity
                            };
                            
                            // Render the transfer dialog template for the sender
                            const senderContent = await renderTemplate(TEMPLATES.TRANSFER_DIALOG, senderTemplateData);
                            
                            // Initiate the transfer process
                            let selectedQuantity = await new Promise(resolve => {
                                new Dialog({
                                    title: "Transfer Item",
                                    content: senderContent,
                                    buttons: {
                                        transfer: {
                                            icon: '<i class="fas fa-exchange-alt"></i>',
                                            label: "Transfer",
                                            callback: () => {
                                                const quantityInput = document.querySelector(`#transfer-item-${timestamp} input[type="number"]`);
                                                resolve(quantityInput ? parseInt(quantityInput.value) : 1);
                                            }
                                        },
                                        cancel: {
                                            icon: '<i class="fas fa-times"></i>',
                                            label: "Cancel",
                                            callback: () => resolve(0)
                                        }
                                    },
                                    default: "transfer",
                                    close: () => resolve(0)
                                }, {
                                    classes: ["transfer-item"],
                                    id: `transfer-item-${timestamp}`,
                                    width: 320,
                                    height: "auto"
                                }).render(true);
                            });
                            
                            if (selectedQuantity <= 0) return; // User cancelled
                            
                            if (!hasSourcePermission || !hasTargetPermission) {
                                // Prepare transfer data
                                const transferId = `transfer_${Date.now()}`;
                                const transferData = {
                                    id: transferId,
                                    sourceActorId: sourceActor.id,
                                    targetActorId: actor.id,
                                    itemId: sourceItem.id,
                                    itemName: sourceItem.name,
                                    quantity: selectedQuantity,
                                    hasQuantity: hasQuantity,
                                    isPlural: selectedQuantity > 1,
                                    sourceActorName: sourceActor.name,
                                    targetActorName: actor.name,
                                    status: 'pending',
                                    timestamp: Date.now(),
                                    sourceUserId: game.user.id
                                };
                                
                                const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
                                
                                // Sender: request sent message
                                await ChatMessage.create({
                                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                        isPublic: false,
                                        cardType: "transfer-request",
                                        strCardIcon: "fas fa-people-arrows",
                                        strCardTitle: "Transfer Request",
                                        sourceActor,
                                        sourceActorName: sourceActor.name,
                                        targetActor: actor,
                                        targetActorName: actor.name,
                                        item: sourceItem,
                                        itemName: sourceItem.name,
                                        quantity: selectedQuantity,
                                        hasQuantity: !!hasQuantity,
                                        isPlural: selectedQuantity > 1,
                                        isTransferSender: true,
                                        transferId,
                                        strCardContent: gmApprovalRequired ? "Waiting for GM approval." : "Waiting for receiver to accept."
                                    }),
                                    speaker: { alias: "System" },
                                    whisper: [game.user.id],
                                    flags: {
                                        [MODULE.ID]: {
                                            transferId,
                                            type: 'transferRequest',
                                            isTransferSender: true,
                                            data: transferData
                                        }
                                    }
                                });
                                
                                if (gmApprovalRequired) {
                                    // GM: approval request with Approve/Deny buttons
                                    const gmUsers = game.users.filter(u => u.isGM);
                                    if (gmUsers.length > 0) {
                                        // If current user is not a GM, use socketlib to have a GM create the message
                                        if (!game.user.isGM) {
                                            const socket = game.modules.get(MODULE.ID)?.socket;
                                            if (socket) {
                                                await socket.executeAsGM('createTransferRequestChat', {
                                                    cardType: "transfer-request",
                                                    sourceActorId: sourceActor.id,
                                                    sourceActorName: `${sourceActor.name} (${game.user.name})`,
                                                    targetActorId: actor.id,
                                                    targetActorName: actor.name,
                                                    itemId: sourceItem.id,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isGMApproval: true,
                                                    transferId,
                                                    receiverIds: gmUsers.map(u => u.id),
                                                    transferData
                                                });
                                            }
                                        } else {
                                            await ChatMessage.create({
                                                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                                    isPublic: false,
                                                    cardType: "transfer-request",
                                                    strCardIcon: "fas fa-gavel",
                                                    strCardTitle: "GM Approval Required",
                                                    sourceActor,
                                                    sourceActorName: `${sourceActor.name} (${game.user.name})`,
                                                    targetActor: actor,
                                                    targetActorName: actor.name,
                                                    item: sourceItem,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isGMApproval: true,
                                                    transferId
                                                }),
                                                speaker: { alias: "System Transfer" },
                                                whisper: gmUsers.map(u => u.id),
                                                flags: {
                                                    [MODULE.ID]: {
                                                        transferId,
                                                        type: 'transferRequest',
                                                        isGMApproval: true,
                                                        data: transferData
                                                    }
                                                }
                                            });
                                        }
                                    }
                                } else {
                                    // Receiver: actionable message (with Accept/Reject buttons) - only if GM approval NOT required
                                    const targetUsers = game.users.filter(u => !u.isGM && actor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                                    if (targetUsers.length > 0) {
                                        // If current user is not a GM, use socketlib to have a GM create the message
                                        if (!game.user.isGM) {
                                            const socket = game.modules.get(MODULE.ID)?.socket;
                                            if (socket) {
                                                await socket.executeAsGM('createTransferRequestChat', {
                                                    cardType: "transfer-request",
                                                    sourceActorId: sourceActor.id,
                                                    sourceActorName: sourceActor.name,
                                                    targetActorId: actor.id,
                                                    targetActorName: actor.name,
                                                    itemId: sourceItem.id,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isTransferReceiver: true,
                                                    transferId,
                                                    receiverIds: targetUsers.map(u => u.id),
                                                    transferData
                                                });
                                            }
                                        } else {
                                            await ChatMessage.create({
                                                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                                    isPublic: false,
                                                    cardType: "transfer-request",
                                                    strCardIcon: "fas fa-people-arrows",
                                                    strCardTitle: "Transfer Request",
                                                    sourceActor,
                                                    sourceActorName: sourceActor.name,
                                                    targetActor: actor,
                                                    targetActorName: actor.name,
                                                    item: sourceItem,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isTransferReceiver: true,
                                                    transferId
                                                }),
                                                speaker: { alias: "System" },
                                                whisper: targetUsers.map(u => u.id),
                                                flags: {
                                                    [MODULE.ID]: {
                                                        transferId,
                                                        type: 'transferRequest',
                                                        isTransferReceiver: true,
                                                        targetUsers: targetUsers.map(u => u.id),
                                                        data: transferData
                                                    }
                                                }
                                            });
                                        }
                                    }
                                }
                                // Do not execute transfer yet - wait for button clicks
                                return;
                            } else {
                                await this._completeItemTransfer(sourceActor, actor, sourceItem, selectedQuantity, hasQuantity);
                                return;
                            }
                        } else {
                            try {
                                // Get the item from the UUID
                                const item = await fromUuid(data.uuid);
                                if (!item) {
                                    return;
                                }
                                // Create the item on the actor
                                const createdItem = await actor.createEmbeddedDocuments('Item', [item.toObject()]);
                                // Add to newlyAddedItems in PanelManager
                                if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                                    game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(createdItem[0].id, Date.now());
                                }
                                
                                // Send chat notification
                                const cardDataWorld = this._getTransferCardData({ cardType: "transfer-gm", targetActor: actor, item });
                                const chatContent = await renderTemplate(TEMPLATES.CHAT_CARD, cardDataWorld);
                                await ChatMessage.create({
                                    content: chatContent,
                                    speaker: ChatMessage.getSpeaker({ actor })
                                });

                                // Determine which panel to re-render based on item type
                                let targetPanel;
                                switch (item.type) {
                                    case 'weapon':
                                        targetPanel = 'weapons';
                                        break;
                                    case 'spell':
                                        targetPanel = 'spells';
                                        break;
                                    case 'feat':
                                        targetPanel = 'features';
                                        break;
                                    default:
                                        targetPanel = 'inventory';
                                }
                                // Re-render the appropriate panel
                                switch (targetPanel) {
                                    case 'favorites':
                                        if (this.favoritesPanel) await this.favoritesPanel.render(this.element);
                                        break;
                                    case 'weapons':
                                        if (this.weaponsPanel) await this.weaponsPanel.render(this.element);
                                        break;
                                    case 'spells':
                                        if (this.spellsPanel) await this.spellsPanel.render(this.element);
                                        break;
                                    case 'features':
                                        if (this.featuresPanel) await this.featuresPanel.render(this.element);
                                        break;
                                    case 'inventory':
                                        if (this.inventoryPanel) await this.inventoryPanel.render(this.element);
                                        break;
                                }
                            } catch (error) {
                                console.error('DROPZONE | Error processing world item:', error);
                                ui.notifications.error("Error processing dropped item. See console for details.");
                            }
                        }
                        break;
                    default:
                }
                
            } catch (error) {
                console.error('DROPZONE | Error handling drop:', error);
                ui.notifications.error("Error handling drop. See console for details.");
            }
        });


    }

    async setViewMode(mode) {
        // Only proceed if the view mode is actually changing
        if (PanelManager.viewMode === mode) {
            return; // No change needed
        }
        
        // Validate that the requested mode is enabled
        const enabledTabs = ['player']; // Player is always enabled
        if (game.settings.get(MODULE.ID, 'showTabParty')) enabledTabs.push('party');
        if (game.settings.get(MODULE.ID, 'showTabNotes')) enabledTabs.push('notes');
        if (game.settings.get(MODULE.ID, 'showTabCodex')) enabledTabs.push('codex');
        if (game.settings.get(MODULE.ID, 'showTabQuests')) enabledTabs.push('quest');
        
        if (!enabledTabs.includes(mode)) {
            return;
        }
        
        // Update viewMode
        PanelManager.viewMode = mode;
        await game.settings.set(MODULE.ID, 'viewMode', mode);
        
        // Play tab change sound only when view mode actually changes
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'tabChangeSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        // Safety check: ensure tray element exists before manipulating it
        const tray = PanelManager.element;
        if (!tray) {
            return;
        }
        
        // Update tab buttons
        tray.find('.tray-tab-button').removeClass('active');
        tray.find(`.tray-tab-button[data-view="${mode}"]`).addClass('active');
        
        // Update view content visibility
        tray.find('.tray-view-content').addClass('hidden');
        tray.find(`.${mode}-view`).removeClass('hidden');
        
        // Update tools toolbar visibility
        tray.find('.tray-tools-toolbar').toggleClass('hidden', mode !== 'party');
        
        // Update toggle button icon
        const icon = tray.find('.tray-handle-button-viewcycle i');
        icon.removeClass('fa-user fa-users fa-sticky-note fa-book fa-scroll');
        switch (mode) {
            case 'party':
                icon.addClass('fa-users');
                break;
            case 'notes':
                icon.addClass('fa-sticky-note');
                break;
            case 'codex':
                icon.addClass('fa-book');
                break;
            case 'quest':
                icon.addClass('fa-scroll');
                break;
            default:
                icon.addClass('fa-user');
        }
        
        // Update handle content using HandleManager to avoid code duplication
        await this.handleManager.updateHandle();
    }

    // Helper method to get the appropriate icon based on item type
    _getDropIcon(type) {
        switch(type) {
            case 'spell': return 'fas fa-stars';
            case 'weapon': return 'fas fa-swords';
            case 'feat': return 'fas fa-sparkles';
            default: return 'fas fa-backpack';
        }
    }

    // Helper method to get the appropriate UUID format
    _getItemUUID(item, data) {
        // For compendium items
        if (data.pack) {
            return `@UUID[Compendium.${data.pack}.Item.${item._id}]{${item.name}}`;
        }
        // For regular items
        return `@UUID[Item.${item._id}]{${item.name}}`;
    }

    // Helper method to get the appropriate title based on item type
    _getDropTitle(type) {
        switch(type) {
            case 'spell': return 'New Spell Added';
            case 'weapon': return 'New Weapon Added';
            case 'feat': return 'New Feature Added';
            default: return 'New Item Added';
        }
    }

    /**
     * Toggle visibility of a category
     * @param {string} categoryId - The ID of the category to toggle
     * @param {HTMLElement} panel - The panel element containing the category
     * @param {boolean} [active] - Optional force state (true = show, false = hide)
     */
    toggleCategory(categoryId, panel, active = null) {
        const filter = panel.querySelector(`[data-filter-id="${categoryId}"]`);
        const items = panel.querySelectorAll(`[data-category-id="${categoryId}"]`);
        
        // If active is not provided, toggle based on current state
        const shouldBeActive = active !== null ? active : !filter?.classList.contains('active');
        
        // Update filter button state
        if (filter) {
            if (shouldBeActive) {
                filter.classList.add('active');
                this.hiddenCategories.delete(categoryId);
            } else {
                filter.classList.remove('active');
                this.hiddenCategories.add(categoryId);
            }
        }

        // Update visibility of items and headers
        items.forEach(item => {
            if (shouldBeActive) {
                item.style.removeProperty('display');
            } else {
                item.style.display = 'none';
            }
        });

        // Update visibility of empty sections
        this._updateEmptyMessage(panel);
    }

    /**
     * Update visibility of items based on search text
     * @param {string} searchText - The text to search for
     * @param {HTMLElement} panel - The panel element containing the items
     * @param {string} itemSelector - The selector for items (e.g., '.spell-item', '.weapon-item')
     */
    updateSearchVisibility(searchText, panel, itemSelector) {
        const items = panel.querySelectorAll(itemSelector);
        const normalizedSearch = searchText.toLowerCase().trim();
        let hasVisibleItems = false;

        items.forEach(item => {
            const name = item.querySelector('.weapon-name, .spell-name, .inventory-name')?.textContent.toLowerCase() || '';
            const categoryId = item.dataset.categoryId;
            const matchesSearch = !normalizedSearch || name.includes(normalizedSearch);
            const categoryVisible = !this.hiddenCategories.has(categoryId);

            if (matchesSearch && categoryVisible) {
                item.style.removeProperty('display');
                hasVisibleItems = true;
            } else {
                item.style.display = 'none';
            }
        });

        // Update headers visibility
        this._updateHeadersVisibility(panel);
        this._updateEmptyMessage(panel, hasVisibleItems);
    }

    /**
     * Update visibility of category headers based on visible items
     * @param {HTMLElement} panel - The panel element
     * @private
     */
    _updateHeadersVisibility(panel) {
        const headers = panel.querySelectorAll('.category-header');
        
        headers.forEach(header => {
            const categoryId = header.dataset.categoryId;
            if (this.hiddenCategories.has(categoryId)) {
                header.style.display = 'none';
                return;
            }

            const items = panel.querySelectorAll(`[data-category-id="${categoryId}"]:not(.category-header)`);
            let hasVisibleItems = false;

            items.forEach(item => {
                if (item.style.display !== 'none') {
                    hasVisibleItems = true;
                }
            });

            header.style.display = hasVisibleItems ? '' : 'none';
        });
    }

    /**
     * Update visibility of the "no matches" message
     * @param {HTMLElement} panel - The panel element
     * @param {boolean} hasVisibleItems - Whether there are any visible items
     * @private
     */
    _updateEmptyMessage(panel, hasVisibleItems = null) {
        const noMatchesMsg = panel.querySelector('.no-matches');
        if (!noMatchesMsg) return;

        if (hasVisibleItems === null) {
            // Calculate if there are visible items
            const items = panel.querySelectorAll('.weapon-item, .spell-item, .inventory-item');
            hasVisibleItems = Array.from(items).some(item => item.style.display !== 'none');
        }

        noMatchesMsg.style.display = hasVisibleItems ? 'none' : 'block';
    }

    /**
     * Reset all categories to visible
     * @param {HTMLElement} panel - The panel element
     */
    resetCategories(panel) {
        this.hiddenCategories.clear();
        const filters = panel.querySelectorAll('[data-filter-id]');
        filters.forEach(filter => {
            filter.classList.add('active');
            this.toggleCategory(filter.dataset.filterId, panel, true);
        });
    }

    // Add this new method for cleanup
    static cleanupNewlyAddedItems() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds
        
        // First clean up items in the Map
        for (const [itemId, timestamp] of PanelManager.newlyAddedItems) {
            if (timestamp < fiveMinutesAgo) {
                PanelManager.newlyAddedItems.delete(itemId);
                // Also clear the isNew flag
                const actor = game.actors.get(PanelManager.currentActor?.id);
                if (actor) {
                    const item = actor.items.get(itemId);
                    if (item) {
                        item.unsetFlag(MODULE.ID, 'isNew');
                    }
                }
            }
        }

        // Then check for any items with the isNew flag that aren't in the Map
        const actor = game.actors.get(PanelManager.currentActor?.id);
        if (actor) {
            for (const item of actor.items) {
                const isNew = item.getFlag(MODULE.ID, 'isNew');
                if (isNew && !PanelManager.newlyAddedItems.has(item.id)) {
                    // If the item has the flag but isn't in the Map, clear the flag
                    item.unsetFlag(MODULE.ID, 'isNew');
                }
            }
        }
    }

    // Add this new method to mark an item as new
    static async markItemAsNew(itemId, actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const item = actor.items.get(itemId);
        if (!item) return;
        
        // Set a flag on the item to mark it as new
        await item.setFlag(MODULE.ID, 'isNew', true);
        
        // Also update the static Map for backward compatibility
        PanelManager.newlyAddedItems.set(itemId, Date.now());
    }

    // Add this new method to clear the new status
    static async clearNewStatus(itemId, actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const item = actor.items.get(itemId);
        if (!item) return;
        
        // Clear the flag
        await item.unsetFlag(MODULE.ID, 'isNew');
        
        // Also update the static Map for backward compatibility
        PanelManager.newlyAddedItems.delete(itemId);
    }

    // Add this new method to get the appropriate transfer card data
    _getTransferCardData(data) {
        return {
            isPublic: true,
            isTransferred: true,
            strCardIcon: this._getDropIcon(data.item.type),
            strCardTitle: this._getDropTitle(data.item.type),
            strCardContent: `<p><strong>${this.actor.name}</strong> received <strong>${data.item.name}</strong> via the Squire tray.</p>`
        };
    }

    // Add this new method to complete an item transfer between actors
    async _completeItemTransfer(sourceActor, targetActor, sourceItem, quantityToTransfer, hasQuantity) {
        // Create a copy of the item data to transfer
        const transferData = sourceItem.toObject();
        if (hasQuantity) {
            transferData.system.quantity = quantityToTransfer;
        }
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [transferData]);
        if (hasQuantity && quantityToTransfer < sourceItem.system.quantity) {
            await sourceItem.update({
                'system.quantity': sourceItem.system.quantity - quantityToTransfer
            });
        } else {
            await sourceItem.delete();
        }
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
            await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
        }
        
        // Create chat messages for direct transfer completion
        try {
            // Find the users who own the source and target actors
            const sourceUsers = game.users.filter(user => sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            const targetUsers = game.users.filter(user => targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            
            // Send message to source actor's owner (sender)
            if (sourceUsers.length > 0) {
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    await socket.executeAsGM('createTransferCompleteChat', {
                        sourceActorId: sourceActor.id,
                        sourceActorName: sourceActor.name,
                        targetActorId: targetActor.id,
                        targetActorName: targetActor.name,
                        itemId: sourceItem.id,
                        itemName: sourceItem.name,
                        quantity: quantityToTransfer,
                        hasQuantity: hasQuantity,
                        isPlural: quantityToTransfer > 1,
                        isTransferSender: true,
                        receiverIds: sourceUsers.map(u => u.id)
                    });
                } else {
                    // Fallback: create message directly if socket not available
                    await ChatMessage.create({
                        content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                            isPublic: false,
                            cardType: "transfer-complete",
                            strCardIcon: "fas fa-backpack",
                            strCardTitle: "Transfer Complete",
                            sourceActor,
                            sourceActorName: sourceActor.name,
                            targetActor,
                            targetActorName: targetActor.name,
                            item: sourceItem,
                            itemName: sourceItem.name,
                            quantity: quantityToTransfer,
                            hasQuantity: hasQuantity,
                            isPlural: quantityToTransfer > 1,
                            isTransferSender: true
                        }),
                        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
                        whisper: sourceUsers.map(u => u.id)
                    });
                }
            }
            
            // Send message to target actor's owner (receiver) - only if different from sender
            if (targetUsers.length > 0 && !targetUsers.some(u => sourceUsers.some(su => su.id === u.id))) {
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    await socket.executeAsGM('createTransferCompleteChat', {
                        sourceActorId: sourceActor.id,
                        sourceActorName: sourceActor.name,
                        targetActorId: targetActor.id,
                        targetActorName: targetActor.name,
                        itemId: sourceItem.id,
                        itemName: sourceItem.name,
                        quantity: quantityToTransfer,
                        hasQuantity: hasQuantity,
                        isPlural: quantityToTransfer > 1,
                        isTransferReceiver: true,
                        receiverIds: targetUsers.map(u => u.id)
                    });
                } else {
                    // Fallback: create message directly if socket not available
                    await ChatMessage.create({
                        content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                            isPublic: false,
                            cardType: "transfer-complete",
                            strCardIcon: "fas fa-backpack",
                            strCardTitle: "Transfer Complete",
                            sourceActor,
                            sourceActorName: sourceActor.name,
                            targetActor,
                            targetActorName: targetActor.name,
                            item: sourceItem,
                            itemName: sourceItem.name,
                            quantity: quantityToTransfer,
                            hasQuantity: hasQuantity,
                            isPlural: quantityToTransfer > 1,
                            isTransferReceiver: true
                        }),
                        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                        whisper: targetUsers.map(u => u.id)
                    });
                }
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error creating transfer complete chat message:', error);
        }
    }

    /**
     * Clean up old instance before creating new one to prevent memory leaks
     * @private
     */
    static _cleanupOldInstance() {
        if (!PanelManager.instance) return;
        
        // Destroy individual panels to clean up their hooks and event listeners
        if (PanelManager.instance.notesPanel && typeof PanelManager.instance.notesPanel.destroy === 'function') {
            PanelManager.instance.notesPanel.destroy();
        }
        if (PanelManager.instance.gmPanel && typeof PanelManager.instance.gmPanel.destroy === 'function') {
            PanelManager.instance.gmPanel.destroy();
        }
        if (PanelManager.instance.codexPanel && typeof PanelManager.instance.codexPanel.destroy === 'function') {
            PanelManager.instance.codexPanel.destroy();
        }
        if (PanelManager.instance.questPanel && typeof PanelManager.instance.questPanel.destroy === 'function') {
            PanelManager.instance.questPanel.destroy();
        }
        if (PanelManager.instance.characterPanel && typeof PanelManager.instance.characterPanel.destroy === 'function') {
            PanelManager.instance.characterPanel.destroy();
        }
        if (PanelManager.instance.macrosPanel && typeof PanelManager.instance.macrosPanel.destroy === 'function') {
            PanelManager.instance.macrosPanel.destroy();
        }
        if (PanelManager.instance.partyPanel && typeof PanelManager.instance.partyPanel.destroy === 'function') {
            PanelManager.instance.partyPanel.destroy();
        }
        if (PanelManager.instance.partyStatsPanel && typeof PanelManager.instance.partyStatsPanel.destroy === 'function') {
            PanelManager.instance.partyStatsPanel.destroy();
        }
        if (PanelManager.instance.handleManager && typeof PanelManager.instance.handleManager.destroy === 'function') {
            PanelManager.instance.handleManager.destroy();
        }
        
        // Clean up other panels that might have event listeners
        if (PanelManager.instance.favoritesPanel && typeof PanelManager.instance.favoritesPanel.destroy === 'function') {
            PanelManager.instance.favoritesPanel.destroy();
        }
        if (PanelManager.instance.spellsPanel && typeof PanelManager.instance.spellsPanel.destroy === 'function') {
            PanelManager.instance.spellsPanel.destroy();
        }
        if (PanelManager.instance.weaponsPanel && typeof PanelManager.instance.weaponsPanel.destroy === 'function') {
            PanelManager.instance.weaponsPanel.destroy();
        }
        if (PanelManager.instance.inventoryPanel && typeof PanelManager.instance.inventoryPanel.destroy === 'function') {
            PanelManager.instance.inventoryPanel.destroy();
        }
        if (PanelManager.instance.featuresPanel && typeof PanelManager.instance.featuresPanel.destroy === 'function') {
            PanelManager.instance.featuresPanel.destroy();
        }
        if (PanelManager.instance.experiencePanel && typeof PanelManager.instance.experiencePanel.destroy === 'function') {
            PanelManager.instance.experiencePanel.destroy();
        }
        if (PanelManager.instance.statsPanel && typeof PanelManager.instance.statsPanel.destroy === 'function') {
            PanelManager.instance.statsPanel.destroy();
        }
        if (PanelManager.instance.abilitiesPanel && typeof PanelManager.instance.abilitiesPanel.destroy === 'function') {
            PanelManager.instance.abilitiesPanel.destroy();
        }
        if (PanelManager.instance.healthPanel && typeof PanelManager.instance.healthPanel.destroy === 'function') {
            PanelManager.instance.healthPanel.destroy();
        }
        if (PanelManager.instance.dicetrayPanel && typeof PanelManager.instance.dicetrayPanel.destroy === 'function') {
            PanelManager.instance.dicetrayPanel.destroy();
        }
        if (PanelManager.instance.controlPanel && typeof PanelManager.instance.controlPanel.destroy === 'function') {
            PanelManager.instance.controlPanel.destroy();
        }
        
        // Clear the old instance reference
        PanelManager.instance = null;
        PanelManager.gmDetails = {
            resistances: [],
            immunities: [],
            biography: '',
            biographyHtml: '',
            biographyHtmlRaw: ''
        };
    }

    /**
     * Comprehensive cleanup method to prevent memory leaks
     */
    static cleanup() {
        // Clear all intervals
        PanelManager._intervals.forEach(intervalId => {
            clearTrackedInterval(intervalId);
        });
        PanelManager._intervals.clear();

        // Clear all timeouts
        PanelManager._timeouts.forEach(timeoutId => {
            clearTrackedTimeout(timeoutId);
        });
        PanelManager._timeouts.clear();

        // Remove all event listeners
        PanelManager._eventListeners.forEach(({ element, event, handler }, key) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        PanelManager._eventListeners.clear();

        // Clear the cleanup interval
        if (PanelManager._cleanupInterval) {
            clearInterval(PanelManager._cleanupInterval);
            PanelManager._cleanupInterval = null;
        }

        // Clear the newly added items map
        PanelManager.newlyAddedItems.clear();

        // Destroy individual panels to clean up their hooks
        if (PanelManager.instance) {
            if (PanelManager.instance.notesPanel && typeof PanelManager.instance.notesPanel.destroy === 'function') {
                PanelManager.instance.notesPanel.destroy();
            }
            if (PanelManager.instance.codexPanel && typeof PanelManager.instance.codexPanel.destroy === 'function') {
                PanelManager.instance.codexPanel.destroy();
            }
            if (PanelManager.instance.questPanel && typeof PanelManager.instance.questPanel.destroy === 'function') {
                PanelManager.instance.questPanel.destroy();
            }
            // Clean up CharacterPanel
            if (PanelManager.instance.characterPanel && typeof PanelManager.instance.characterPanel.destroy === 'function') {
                PanelManager.instance.characterPanel.destroy();
            }
            // Clean up MacrosPanel
            if (PanelManager.instance.macrosPanel && typeof PanelManager.instance.macrosPanel.destroy === 'function') {
                PanelManager.instance.macrosPanel.destroy();
            }
            // Clean up PartyPanel
            if (PanelManager.instance.partyPanel && typeof PanelManager.instance.partyPanel.destroy === 'function') {
                PanelManager.instance.partyPanel.destroy();
            }
            // Clean up PartyStatsPanel
            if (PanelManager.instance.partyStatsPanel && typeof PanelManager.instance.partyStatsPanel.destroy === 'function') {
                PanelManager.instance.partyStatsPanel.destroy();
            }
            // Clean up HandleManager
            if (PanelManager.instance.handleManager && typeof PanelManager.instance.handleManager.destroy === 'function') {
                PanelManager.instance.handleManager.destroy();
            }
        }

        // Remove the tray element
        if (PanelManager.element) {
            PanelManager.element.remove();
            PanelManager.element = null;
        }

        // Reset static properties
        PanelManager.instance = null;
        PanelManager.currentActor = null;
        PanelManager.isPinned = false;
        PanelManager.viewMode = 'player';
        PanelManager._initializationInProgress = false;
        PanelManager._lastInitTime = 0;

        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'PanelManager cleanup completed',
            {},
            false,
            false
        );
    }

    /**
     * Track a timeout for cleanup
     */
    static trackTimeout(timeoutId) {
        registerTimeoutId(timeoutId);
        PanelManager._timeouts.add(timeoutId);
        return timeoutId;
    }

    /**
     * Track an interval for cleanup
     */
    static trackInterval(intervalId) {
        registerIntervalId(intervalId);
        PanelManager._intervals.add(intervalId);
        return intervalId;
    }

    /**
     * Track an event listener for cleanup
     */
    static trackEventListener(element, event, handler) {
        const key = `${element.id || 'unknown'}-${event}`;
        PanelManager._eventListeners.set(key, { element, event, handler });
        return key;
    }

    // Utility to remove a panel's DOM from the tray
    static removePanelDom(panel) {
        if (panel && panel.element) {
            const dom = $(panel.element).find(`#${panel.constructor.name.toLowerCase()}-panel, .${panel.constructor.name.toLowerCase()}-panel`);
            if (dom.length) dom.remove();
        }
    }

    static setGmDetails(details) {
        PanelManager.gmDetails = {
            resistances: details?.resistances ?? [],
            immunities: details?.immunities ?? [],
            biography: details?.biography ?? '',
            biographyHtml: details?.biographyHtml ?? '',
            biographyHtmlRaw: details?.biographyHtmlRaw ?? ''
        };

        if (game.user.isGM && PanelManager.instance?.gmPanel?.element) {
            PanelManager.instance.gmPanel.render(
                PanelManager.instance.gmPanel.element,
                PanelManager.gmDetails
            );
        }
    }
    
    /**
     * Register panels with HookManager
     * @private
     */
    _registerPanelsWithHookManager() {
        try {
            // Import HookManager dynamically to avoid circular dependencies
            // Panel registration is now handled by Blacksmith HookManager
            // No need to register panels with local HookManager
        } catch (error) {
            console.error('Error registering panels with HookManager:', error);
        }
    }

    /**
     * Check if the current view mode should have fade animations
     * Only player and party views need fade animations when changing tokens
     * @private
     * @returns {boolean} True if fade animation should be applied
     */
    _shouldApplyFadeAnimation() {
        return PanelManager.viewMode === 'player' || PanelManager.viewMode === 'party';
    }

    /**
     * Apply fade-out animation to tray panel wrapper if appropriate
     * @private
     */
    _applyFadeOutAnimation() {
        if (this._shouldApplyFadeAnimation() && PanelManager.element) {
            const trayPanelWrapper = PanelManager.element.find('.tray-panel-wrapper');
            trayPanelWrapper.addClass('content-updating');
        }
    }

    /**
     * Apply fade-in animation to tray panel wrapper if appropriate
     * @private
     */
    _applyFadeInAnimation() {
        if (this._shouldApplyFadeAnimation() && PanelManager.element) {
            const trayPanelWrapper = PanelManager.element.find('.tray-panel-wrapper');
            trayPanelWrapper.removeClass('content-updating').addClass('content-updated');
            
            // Remove the content-updated class after animation completes
            trackModuleTimeout(() => {
                trayPanelWrapper.removeClass('content-updated');
            }, 200);
        }
    }
}

// =====================================================
// ======================  Hooks  ======================    
// =====================================================

// Consolidated initialization function - called after settings are registered
async function initializeSquireAfterSettings() {
    // Try to find a suitable actor in this order:
    // 1. Currently controlled token(s) - prioritizing player character tokens
    // 2. User's default character
    // 3. First owned character-type token
    // 4. Any owned token
    let initialActor = null;
    let selectionReason = "";
    
    // 1. Check for controlled tokens
    const controlledTokens = canvas.tokens?.controlled.filter(t => t.actor?.isOwner);
    if (controlledTokens?.length > 0) {
        // First check for player character tokens
        const playerTokens = controlledTokens.filter(t => t.actor?.type === 'character' && t.actor?.hasPlayerOwner);
        
        if (playerTokens.length > 0) {
            // Use the most recent player token (last one in the array)
            initialActor = playerTokens[playerTokens.length - 1].actor;
            selectionReason = "most recent player character token";
        } else {
            // Use the most recent controlled token
            initialActor = controlledTokens[controlledTokens.length - 1].actor;
            selectionReason = "most recent controlled token";
        }
    }
    
    // 2. Try default character if no controlled token
    if (!initialActor) {
        initialActor = game.user.character;
        if (initialActor) {
            selectionReason = "default character";
        }
    }
    
    // 3. Try to find first owned character token
    if (!initialActor) {
        const characterToken = canvas.tokens?.placeables.find(token => 
            token.actor?.isOwner && token.actor?.type === 'character'
        );
        initialActor = characterToken?.actor;
        if (initialActor) {
            selectionReason = "first owned character token";
        }
    }
    
    // 4. Fall back to any owned token
    if (!initialActor) {
        const anyToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        initialActor = anyToken?.actor;
        if (initialActor) {
            selectionReason = "first owned token";
        }
    }

    // Initialize with the found actor
    if (initialActor) {
        if (PanelManager.element) {
            PanelManager.element.removeClass('expanded');
        }
        
        await PanelManager.initialize(initialActor);
        
        // Force a complete tray refresh
        if (PanelManager.instance) {
            await PanelManager.instance.updateTray();
        }
        
        // Play tray open sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        if (PanelManager.element) {
            PanelManager.element.addClass('expanded');
        }
    }
}

// Note: controlToken hook is now managed centrally by HookManager

// Helper function to update selection display
export async function _updateSelectionDisplay() {
    if (!PanelManager.instance || !PanelManager.element) return;
    
    // Calculate selection data
    const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    const selectionCount = controlledTokens.length;
    const showSelectionBox = selectionCount > 1;
    
    // Update the selection display
    const selectionWrapper = PanelManager.element.find('.tray-selection-wrapper');
    const selectionCountSpan = PanelManager.element.find('.tray-selection-count');
    
    if (showSelectionBox) {
        // Show selection box if it doesn't exist
        if (selectionWrapper.length === 0) {
            const selectionHtml = `
                <div class="tray-selection-wrapper">
                    <span class="tray-selection-count">${selectionCount} tokens selected</span>
                    <div class="tray-selection-actions" data-tooltip="Use Shift+Click to select multiple or modify selection">
                        <button id="button-clear" class="tray-selection-button button-clear" data-tooltip="Clear all selections">Clear All</button>
                    </div>
                </div>
            `;
            
            // Insert after the party toolbar
            const partyToolbar = PanelManager.element.find('.tray-tools-toolbar');
            if (partyToolbar.length > 0) {
                partyToolbar.after(selectionHtml);
            }
            
            // Re-attach event listeners for the new buttons
            PanelManager.instance.activateListeners(PanelManager.element);
        } else {
            // Update existing selection count
            selectionCountSpan.text(`${selectionCount} tokens selected`);
        }
    } else {
        // Hide selection box if it exists
        if (selectionWrapper.length > 0) {
            selectionWrapper.remove();
        }
    }
}

// Helper function to update health panel from current selection
export async function _updateHealthPanelFromSelection() {
    // Get a list of all controlled tokens that the user owns
    const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    
    // If no tokens are controlled, return
    if (!controlledTokens.length) return;

    // Determine which token to use for primary operations:
    // - If the list includes player-owned characters, use the most recent player character
    // - Otherwise, use the most recently selected token
    let tokenToUse = controlledTokens[0]; // Default to the first token
   
    // Look for player character tokens
    const playerTokens = controlledTokens.filter(t => t.actor?.type === 'character' && t.actor?.hasPlayerOwner);
    
    if (playerTokens.length > 0) {
        // Use the most recent player token (last one in the array)
        tokenToUse = playerTokens[playerTokens.length - 1];
    }

    // Use the actor from the primary token for the tray
    const actorToUse = tokenToUse.actor;

    // EARLY RETURN OPTIMIZATION: Skip expensive operations if nothing changed
    // This prevents lag during multi-select when selecting same-type tokens
    const actorUnchanged = PanelManager.currentActor?.id === actorToUse.id;
    
    if (actorUnchanged) {
        // Check if tokens actually changed by comparing IDs
        const currentTokens = PanelManager.instance?.healthPanel?.tokens || [];
        const currentTokenIds = currentTokens.map(t => t.id).sort();
        const newTokenIds = controlledTokens.map(t => t.id).sort();
        const tokensUnchanged = JSON.stringify(currentTokenIds) === JSON.stringify(newTokenIds);
        
        if (tokensUnchanged) {
            // Nothing meaningful changed - skip all expensive operations
            return;
        }
    }

    // Save the current view mode before initializing
    const currentViewMode = PanelManager.viewMode;

    // Store the current tray state before initializing
    const wasExpanded = PanelManager.element?.hasClass('expanded') || false;
    
    // Check if we need to change actors
    if (PanelManager.currentActor?.id !== actorToUse.id) {
        // Actor changed - update the instance without recreating the tray
        
        // Add fade-out animation to tray panel wrapper if appropriate
        if (PanelManager.instance) {
            PanelManager.instance._applyFadeOutAnimation();
        }
        
        PanelManager.currentActor = actorToUse;
        if (PanelManager.instance) {
            PanelManager.instance.actor = actorToUse;
            
            // Update the actor reference in all panel instances
            if (PanelManager.instance.characterPanel) PanelManager.instance.characterPanel.actor = actorToUse;
            if (PanelManager.instance.controlPanel) PanelManager.instance.controlPanel.actor = actorToUse;
            if (PanelManager.instance.favoritesPanel) PanelManager.instance.favoritesPanel.actor = actorToUse;
            if (PanelManager.instance.spellsPanel) PanelManager.instance.spellsPanel.actor = actorToUse;
            if (PanelManager.instance.weaponsPanel) PanelManager.instance.weaponsPanel.actor = actorToUse;
            if (PanelManager.instance.inventoryPanel) PanelManager.instance.inventoryPanel.actor = actorToUse;
            if (PanelManager.instance.featuresPanel) PanelManager.instance.featuresPanel.actor = actorToUse;
            if (PanelManager.instance.experiencePanel) PanelManager.instance.experiencePanel.actor = actorToUse;
            if (PanelManager.instance.statsPanel) PanelManager.instance.statsPanel.actor = actorToUse;
            if (PanelManager.instance.abilitiesPanel) PanelManager.instance.abilitiesPanel.actor = actorToUse;
            if (PanelManager.instance.dicetrayPanel) PanelManager.instance.dicetrayPanel.actor = actorToUse;
            if (PanelManager.instance.macrosPanel) PanelManager.instance.macrosPanel.actor = actorToUse;
            
            // Update the handle manager's actor reference
            if (PanelManager.instance.handleManager) {
                PanelManager.instance.handleManager.updateActor(actorToUse);
            }
        }
    }
    
    // Force refresh of items collection to ensure up-to-date handle favorites
    if (PanelManager.instance && PanelManager.instance.actor?.items && typeof PanelManager.instance.actor.items._flush === 'function') {
        await PanelManager.instance.actor.items._flush();
    }
    
    // Update health panel with all controlled tokens for bulk operations
    if (PanelManager.instance && PanelManager.instance.healthPanel) {
        // Only update if the tokens have actually changed
        const currentTokens = PanelManager.instance.healthPanel.tokens || [];
        const currentTokenIds = currentTokens.map(t => t.id).sort();
        const newTokenIds = controlledTokens.map(t => t.id).sort();
        
        if (JSON.stringify(currentTokenIds) !== JSON.stringify(newTokenIds)) {
            PanelManager.instance.healthPanel.updateTokens(controlledTokens);
            // Only render if not popped out and health panel is enabled
            if (!PanelManager.instance.healthPanel.isPoppedOut && game.settings.get(MODULE.ID, 'showHealthPanel')) {
                await PanelManager.instance.healthPanel.render(PanelManager.instance.element);
            }
        }
    }
    
    // Always update the handle for the new actor
    if (PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
    
    // Re-render all panels with the new actor data
    if (PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
    
    // Add fade-in animation to tray panel wrapper after update if appropriate
    if (PanelManager.instance) {
        PanelManager.instance._applyFadeInAnimation();
    }
    
    // Re-attach event listeners to ensure tray functionality works
    if (PanelManager.instance && PanelManager.element) {
        // Bind the instance to ensure proper 'this' context
        PanelManager.instance.activateListeners.call(PanelManager.instance, PanelManager.element);
    }
    
    // Restore the previous view mode after initializing
    if (PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.setViewMode(currentViewMode);
    }
    
    // Only play sound and expand tray if it was previously expanded AND not pinned
    if (wasExpanded && !PanelManager.isPinned && PanelManager.element) {
        // Play tray open sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        // Restore expanded state
        PanelManager.element.addClass('expanded');
    }


}


// Set up periodic cleanup of newly added items
const globalCleanupInterval = trackModuleInterval(() => {
    if (PanelManager.instance) {
        PanelManager.cleanupNewlyAddedItems();
        // No need to recreate the entire tray for cleanup - just clean up data
    }
}, 60000); // Check every minute
PanelManager.trackInterval(globalCleanupInterval);

// Note: closeGame hook is now managed centrally by HookManager

// Note: disableModule hook is now managed centrally by HookManager

// Note: canvasReady hook is now managed centrally by HookManager


// Note: createToken hook is now managed centrally by HookManager
