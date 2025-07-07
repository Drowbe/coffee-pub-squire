import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getTaskText, getObjectiveTooltipData } from './helpers.js';
import { CharacterPanel } from './panel-character.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { ControlPanel } from './panel-control.js';
import { FeaturesPanel } from './panel-features.js';
import { DiceTrayPanel } from "./panel-dicetray.js";
import { ExperiencePanel } from "./panel-experience.js";
import { HealthPanel } from "./panel-health.js";
import { StatsPanel } from "./panel-stats.js";
import { AbilitiesPanel } from "./panel-abilities.js";
import { PartyPanel } from "./panel-party.js";
import { PartyStatsPanel } from "./panel-party-stats.js";
import { NotesPanel } from "./panel-notes.js";
import { CodexPanel } from "./panel-codex.js";
import { QuestPanel } from './panel-quest.js';
import { MacrosPanel } from "./panel-macros.js";
import { PrintCharacterSheet } from './print-character.js';
import { QuestPin } from './quest-pin.js';

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

    constructor(actor) {
        this.actor = actor;
        this.element = null;
        if (actor) {
            this.characterPanel = new CharacterPanel(actor);
            this.controlPanel = new ControlPanel(actor);
            this.favoritesPanel = new FavoritesPanel(actor);
            this.spellsPanel = new SpellsPanel(actor);
            this.weaponsPanel = new WeaponsPanel(actor);
            this.inventoryPanel = new InventoryPanel(actor);
            this.featuresPanel = new FeaturesPanel(actor);
            this.dicetrayPanel = new DiceTrayPanel({ actor });
            this.experiencePanel = new ExperiencePanel(actor);
            this.healthPanel = new HealthPanel(actor);
            this.statsPanel = new StatsPanel(actor);
            this.abilitiesPanel = new AbilitiesPanel(actor);
        }
        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();
        this.notesPanel = new NotesPanel();
        this.codexPanel = new CodexPanel();
        this.questPanel = new QuestPanel();
        this.hiddenCategories = new Set();
        this.macrosPanel = new MacrosPanel({ actor });
    }

    static async initialize(actor = null) {
        // Check if user is excluded
        const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsers').split(',').map(id => id.trim());
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
            
            // Set default viewMode to 'player' only on first load
            if (isFirstLoad) {
                PanelManager.viewMode = 'player';
                await game.settings.set(MODULE.ID, 'viewMode', 'player');
            } else {
                // Otherwise, load the saved viewMode
                PanelManager.viewMode = game.settings.get(MODULE.ID, 'viewMode');
            }
            
            // If we have an instance with the same actor, do nothing
            if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) {
                PanelManager._initializationInProgress = false;
                return;
            }

            // Set up cleanup interval if not already set
            if (!PanelManager._cleanupInterval) {
                const intervalId = setInterval(() => {
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

            // Create or update instance
            PanelManager.currentActor = actor;
            
            // Always create a new instance to ensure clean state
            PanelManager.instance = new PanelManager(actor);

            // Check if this is a monster/NPC and auto-favorite items
            if (actor && actor.type !== "character") {
                await FavoritesPanel.initializeNpcFavorites(actor);
            }
            
            // Restore health window state if it was open
            if (hadHealthWindow && PanelManager.instance.healthPanel) {
                PanelManager.instance.healthPanel.isPoppedOut = true;
                PanelManager.instance.healthPanel.window = oldHealthPanel.window;
                PanelManager.instance.healthPanel.window.panel = PanelManager.instance.healthPanel;
                HealthPanel.isWindowOpen = true;
                HealthPanel.activeWindow = PanelManager.instance.healthPanel.window;
                // Update the panel and window with the new actor
                PanelManager.instance.healthPanel.updateActor(actor);
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
            }

            // Remove any existing trays first
            $('.squire-tray').remove();
            
            // Create the tray
            await PanelManager.instance.createTray();
            
            // Initialize quest markers for the current scene
            if (PanelManager.instance.questMarkers) {
                await PanelManager.instance.questMarkers.initializeSceneMarkers();
            }
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
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
            showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            newlyAddedItems: Object.fromEntries(PanelManager.newlyAddedItems),
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
            favoriteMacros
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
        
        this.activateListeners(trayElement);
        await this.renderPanels(trayElement);
        
        // Set view mode
        if (viewMode === 'player') {
            await this.setViewMode('player');
        }

        // After rendering the tray handle, check for overflow and toggle fade
        function updateTrayHandleFade() {
            const handle = trayElement.find('.tray-handle');
            const container = handle.find('.tray-handle-content-container');
            const fade = handle.find('.tray-handle-fade-bottom');
            if (!container.length || !fade.length) return;
            // Check if content is overflowing vertically
            const isOverflowing = container[0].scrollHeight > container[0].clientHeight;
            fade.toggle(isOverflowing);
        }
        // Initial check
        updateTrayHandleFade();
        // Re-check on window resize
        window.addEventListener('resize', updateTrayHandleFade);
        PanelManager.trackEventListener(window, 'resize', updateTrayHandleFade);
        // Optionally, re-check after a short delay in case of async content
        const timeoutId = setTimeout(updateTrayHandleFade, 250);
        PanelManager.trackTimeout(timeoutId);
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
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
            showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros'),
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
        });
        const newTrayElement = $(trayHtml);
        
        // Preserve expanded/pinned state without animation
        if (wasExpanded) {
            newTrayElement.addClass('expanded').css('animation', 'none');
        }
        if (wasPinned) {
            newTrayElement.addClass('pinned expanded').css('animation', 'none');
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

        // Only create health panel if not popped out
        if (!HealthPanel.isWindowOpen) {
            this.healthPanel = new HealthPanel(this.actor);
        }

        // Only create macros panel if not popped out
        if (!MacrosPanel.isWindowOpen) {
            this.macrosPanel = new MacrosPanel({ actor: this.actor });
        }

        this.statsPanel = new StatsPanel(this.actor);
        this.abilitiesPanel = new AbilitiesPanel(this.actor);
        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();
        this.notesPanel = new NotesPanel();

        // Update panel element references for non-popped panels
        this.characterPanel.element = PanelManager.element;
        this.controlPanel.element = PanelManager.element;
        this.favoritesPanel.element = PanelManager.element;
        this.spellsPanel.element = PanelManager.element;
        this.weaponsPanel.element = PanelManager.element;
        this.inventoryPanel.element = PanelManager.element;
        this.featuresPanel.element = PanelManager.element;
        this.experiencePanel.element = PanelManager.element;
        if (!HealthPanel.isWindowOpen) {
            this.healthPanel.element = PanelManager.element;
        }
        if (!MacrosPanel.isWindowOpen) {
            this.macrosPanel.element = PanelManager.element;
        }
        this.statsPanel.element = PanelManager.element;
        this.abilitiesPanel.element = PanelManager.element;

        // Render all panels
        await this.renderPanels(PanelManager.element);

        // Remove the animation override after a brief delay
        setTimeout(() => {
            PanelManager.element.css('animation', '');
        }, 100);
    }

    /**
     * Get pinned quest data for the handle display
     * @returns {Promise<Object|null>} Pinned quest data or null if no quest is pinned
     */
    async _getPinnedQuestData() {
        const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
        const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
        
        if (!pinnedQuestUuid) return null;
        
        try {
            const doc = await fromUuid(pinnedQuestUuid);
            if (!doc) return null;
            
            const pinnedQuest = {
                name: doc.name,
                status: 'Unknown',
                uuid: pinnedQuestUuid,
                tasks: []
            };
            
            // Try to extract status and tasks from the journal page content
            if (doc.text?.content) {
                const content = doc.text.content;
                const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
                if (statusMatch) {
                    pinnedQuest.status = statusMatch[1].trim();
                }
                
                // Parse tasks from the content
                const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
                if (tasksMatch) {
                    const tasksHtml = tasksMatch[1];
                    const parser = new DOMParser();
                    const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                    const ul = ulDoc.querySelector('ul');
                    if (ul) {
                        const liList = Array.from(ul.children);
                        pinnedQuest.tasks = liList.map((li, index) => {
                            const text = li.textContent.trim();
                            const isCompleted = li.querySelector('s') !== null;
                            const isHidden = li.querySelector('em') !== null;
                            const isFailed = li.querySelector('code') !== null;
                            const objectiveNumber = String(index + 1).padStart(2, '0');

                            let state = 'active';
                            if (isCompleted) state = 'completed';
                            else if (isFailed) state = 'failed';
                            else if (isHidden) state = 'hidden';

                            // Mark if a pin exists on the canvas for this objective (GM: any pin, Player: only visible pins)
                            let hasPinOnCanvas = false;
                            if (canvas.squirePins && canvas.squirePins.children) {
                                if (game.user.isGM) {
                                    hasPinOnCanvas = canvas.squirePins.children.some(child =>
                                        child instanceof QuestPin && child.questUuid === pinnedQuestUuid && child.objectiveIndex === index
                                    );
                                } else {
                                    hasPinOnCanvas = canvas.squirePins.children.some(child =>
                                        child instanceof QuestPin && child.questUuid === pinnedQuestUuid && child.objectiveIndex === index && child.shouldBeVisible()
                                    );
                                }
                            }

                            return {
                                text: text,
                                completed: isCompleted,
                                state: state,
                                index: index,
                                objectiveNumber: objectiveNumber,
                                hasPinOnCanvas: hasPinOnCanvas
                            };
                        });
                        // Reverse the order of tasks for the handle only, so the last objective is at the top
                        // But preserve the original index for proper pin mapping
                        if (pinnedQuest && Array.isArray(pinnedQuest.tasks)) {
                            const totalTasks = pinnedQuest.tasks.length;
                            pinnedQuest.tasks = pinnedQuest.tasks.map((task, reversedIndex) => ({
                                ...task,
                                displayIndex: totalTasks - 1 - reversedIndex // This will be used for data-task-index
                            })).reverse();
                        }
                    }
                }
            }
            
            return pinnedQuest;
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error fetching pinned quest data',
                { error },
                false,
                false,
                false,
                MODULE.TITLE
            );
            return null;
        }
    }

    async updateHandle() {
        console.log('SQUIRE | updateHandle called');
        if (PanelManager.element) {
            // Build favorite macros array
            let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
            let favoriteMacros = favoriteMacroIds.map(id => {
                const macro = game.macros.get(id);
                return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
            }).filter(Boolean);

            // Fetch pinned quest data for quest handle
            let pinnedQuest = null;
            if (PanelManager.viewMode === 'quest') {
                pinnedQuest = await this._getPinnedQuestData();
            }

            // Always gather party context
            const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
            const controlledTokenIds = canvas.tokens.controlled
                .filter(token => token.actor)
                .map(token => token.actor.id);
            let currentActor = null;
            if (controlledTokenIds.length > 0) {
                currentActor = game.actors.get(controlledTokenIds[0]);
            } else if (tokens.length > 0) {
                currentActor = tokens[0].actor;
            }
            const otherPartyMembers = tokens
                .filter(token => token.actor && token.actor.id !== currentActor?.id)
                .map(token => ({
                    id: token.actor.id,
                    name: token.actor.name,
                    img: token.actor.img,
                    system: token.actor.system,
                    isOwner: token.actor.isOwner
                }));

            const handleData = {
                actor: this.actor,
                isGM: game.user.isGM,
                effects: this.actor?.effects?.map(e => ({
                    name: e.name,
                    icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
                })) || [],
                favorites: FavoritesPanel.getFavorites(this.actor),
                favoriteMacros,
                pinnedQuest, // Add pinned quest data
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
                showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
                showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros'),
                isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
                isMacrosPopped: MacrosPanel.isWindowOpen,
                isHealthPopped: HealthPanel.isWindowOpen,
                defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
                // Always include party context
                currentActor,
                otherPartyMembers
            };

            // Use the tray template which includes the correct partial
            const trayData = {
                viewMode: PanelManager.viewMode,
                ...handleData
            };
            const handleTemplate = await renderTemplate(TEMPLATES.TRAY, trayData);
            
            // Extract just the handle-left content from the rendered template
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = handleTemplate;
            const handleContent = tempDiv.querySelector('.handle-left').innerHTML;
            
            const handle = PanelManager.element.find('.handle-left');
            handle.html(handleContent);
            
            // Handle objective clicks in quest progress (handle)
            console.log('SQUIRE | Setting up objective handler, found elements:', handle.find('.handle-quest-progress-fill').length);
            handle.find('.handle-quest-progress-fill').on('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                console.log('SQUIRE | Objective clicked!');
                
                const objectiveElement = $(event.currentTarget);
                const taskIndex = parseInt(objectiveElement.data('task-index'));
                
                console.log('SQUIRE | Task index:', taskIndex);
                
                // Get the pinned quest UUID from the current data
                const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
                
                console.log('SQUIRE | Pinned quest UUID:', pinnedQuestUuid);
                
                if (!pinnedQuestUuid) {
                    ui.notifications.warn('No quest is currently pinned.');
                    return;
                }
                
                // Find the corresponding quest pin on the canvas
                if (canvas.squirePins && canvas.squirePins.children) {
                    const questPins = canvas.squirePins.children.filter(child =>
                        child instanceof QuestPin && child.questUuid === pinnedQuestUuid && child.objectiveIndex === taskIndex
                    );
                    
                    console.log('SQUIRE | Found quest pins:', questPins.length);
                    
                    if (questPins.length > 0) {
                        const pin = questPins[0];
                        console.log('SQUIRE | Panning to pin at:', pin.x, pin.y);
                        // Pan to the pin location
                        canvas.animatePan({ x: pin.x, y: pin.y });
                        // Highlight the pin briefly
                        pin.alpha = 0.6;
                        setTimeout(() => { pin.alpha = 1.0; }, 200);
                    } else {
                        ui.notifications.warn(`No pin found for objective ${taskIndex + 1}.`);
                    }
                } else {
                    ui.notifications.warn('Quest pins are not available on this scene.');
                }
            });
            
            this.activateListeners(PanelManager.element);

            // Add click handler for favorite macros in handle
            handle.find('.handle-macro-favorite').on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const macroId = $(this).data('macro-id');
                const macro = game.macros.get(macroId);
                if (macro) macro.execute();
            });

            // Attach objective click handlers
            this._attachObjectiveClickHandlers(handle);
        }
    }

    async renderPanels(element) {
        if (!element) return;

        // Render all panels
        if (this.actor) {
            this.characterPanel?.render(element);
            this.controlPanel?.render(element);
            this.favoritesPanel?.render(element);
            this.spellsPanel?.render(element);
            this.weaponsPanel?.render(element);
            this.inventoryPanel?.render(element);
            this.featuresPanel?.render(element);
            this.dicetrayPanel?.render(element);
            this.experiencePanel?.render(element);
            this.healthPanel?.render(element);
            this.statsPanel?.render(element);
            this.abilitiesPanel?.render(element);
        }
        
        // These panels don't require an actor
        this.partyPanel?.render(element);
        this.partyStatsPanel?.render(element);
        this.notesPanel?.render(element);
        this.codexPanel?.render(element);
        this.questPanel?.render(element);
        if (this.macrosPanel && !this.macrosPanel.isPoppedOut) await this.macrosPanel.render(element);
    }

    activateListeners(tray) {
        const handle = tray.find('.tray-handle');
        
        // Print character button
        tray.find('.print-character').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.actor) {
                await PrintCharacterSheet.print(this.actor);
            }
        });
        
        // Handle click on handle (collapse chevron)
        handle.on('click', (event) => {
            if ($(event.target).closest('.pin-button').length || 
                $(event.target).closest('.view-toggle-button').length ||
                $(event.target).closest('.tray-refresh').length ||
                $(event.target).closest('.handle-favorite-icon').length ||
                $(event.target).closest('.handle-health-bar').length ||
                $(event.target).closest('.handle-dice-tray').length ||
                $(event.target).closest('.handle-party-member-portrait').length ||
                $(event.target).closest('.handle-party-member-health-bar').length ||
                $(event.target).closest('.handle-character-portrait').length ||
                $(event.target).closest('.handle-quest-progress-fill').length) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            // If pinned, don't allow closing
            if (PanelManager.isPinned) {
                ui.notifications.warn("You have the tray pinned open. Unpin the tray to close it.");
                return false;
            }
            
            // Play tray open sound when expanding
            if (!tray.hasClass('expanded')) {
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
            }
            
            tray.toggleClass('expanded');
            return false;
        });
        
        // Handle refresh button clicks
        handle.find('.tray-refresh').on('click', async (event) => {
            const $refreshIcon = $(event.currentTarget).find('i');
            if (!$refreshIcon.hasClass('spinning')) {
                try {
                    $refreshIcon.addClass('spinning');
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    blacksmith?.utils.postConsoleAndNotification(
                        "Starting tray refresh",
                        { actor: this.actor },
                        false,
                        true,
                        false,
                        MODULE.TITLE
                    );
                    await PanelManager.initialize(this.actor);
                    // Force a re-render of all panels
                    if (PanelManager.instance) {
                        await PanelManager.instance.renderPanels(PanelManager.element);
                    }
                    blacksmith?.utils.postConsoleAndNotification(
                        "Tray Refresh",
                        "The tray has been refreshed.",
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
                } finally {
                    $refreshIcon.removeClass('spinning');
                }
            }
        });

        // Handle dice tray icon clicks
        handle.find('.handle-dice-tray').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.dicetrayPanel && !this.dicetrayPanel.isPoppedOut) {
                await this.dicetrayPanel._onPopOut();
            }
        });

        // Handle pinned quest clicks
        handle.find('.handle-pinned-quest-name').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (pinnedQuestUuid) {
                try {
                    const doc = await fromUuid(pinnedQuestUuid);
                    if (doc) {
                        doc.sheet.render(true);
                    }
                } catch (error) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error opening pinned quest',
                        { error },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                    ui.notifications.warn('Could not open pinned quest.');
                }
            }
        });

        // Handle health bar clicks
        handle.find('.handle-health-bar').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.healthPanel && !this.healthPanel.isPoppedOut) {
                await this.healthPanel._onPopOut();
            }
        });

        // Handle favorite item clicks
        handle.find('.handle-favorite-icon').on('click', async (event) => {
            if ($(event.target).hasClass('handle-favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
        });

        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            PanelManager.isPinned = !PanelManager.isPinned;
            await game.settings.set(MODULE.ID, 'isPinned', PanelManager.isPinned);
            
            // Play pin/unpin sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, PanelManager.isPinned ? 'pinSound' : 'unpinSound');
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
            
            if (PanelManager.isPinned) {
                // When pinning, ensure tray is expanded
                tray.addClass('pinned expanded');
                // Update UI margin when pinned - only need trayWidth + offset since handle is included in width
                const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            } else {
                // When unpinning, maintain expanded state but remove pinned class
                tray.removeClass('pinned');
                // Reset UI margin when unpinned - need both handle width and offset
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            }
            
            return false;
        });

        // Handle condition icon clicks
        tray.find('.condition-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const conditionName = event.currentTarget.dataset.tooltip;
            
            // Try to get the condition data from CONFIG.DND5E.conditionTypes
            let description = "No description available.";
            try {
                // Find the condition by matching the label
                const conditionData = Object.values(CONFIG.DND5E.conditionTypes).find(
                    condition => condition.label === conditionName
                );

                // Get the icon path from the clicked element
                const iconPath = event.currentTarget.src;

                if (conditionData?.reference) {
                    // Parse the reference string: "Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.0b8N4FymGGfbZGpJ"
                    const [, system, packName, type, journalId, , pageId] = conditionData.reference.split(".");
                    const pack = game.packs.get(`${system}.${packName}`);
                    
                    if (pack) {
                        const journal = await pack.getDocument(journalId);
                        if (journal) {
                            const page = journal.pages.get(pageId);
                            if (page) {
                                description = page.text.content;
                            }
                        }
                    }
                }

                // Create a dialog showing the condition details
                const content = `
                    <div class="squire-description-window">
                        <div class="squire-description-header">
                            <img src="${iconPath}"/>
                            <h1>${conditionData?.label || conditionName}</h1>
                        </div>
                        
                        <div class="squire-description-content">
                            ${description.split('\n').filter(line => line.trim()).map(line => 
                                `<p>${line.trim()}</p>`
                            ).join('')}
                            ${game.user.isGM ? '<p class="gm-note"><i>Right-click to remove this condition.</i></p>' : ''}
                        </div>
                    </div>
                    <style>
                        .gm-note {
                            margin-top: 1em;
                            font-size: 0.9em;
                            color: var(--color-text-dark-secondary);
                            font-style: italic;
                        }
                    </style>`;
                
                new Dialog({
                    title: conditionData?.label || conditionName,
                    content: content,
                    buttons: {
                        close: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Close"
                        }
                    },
                    default: "close"
                }, {
                    classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                    width: 400,
                    height: "auto"
                }).render(true);
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error getting condition description',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.warn("Could not load condition description.");
            }
        }).on('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can remove effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can remove effects.");
                return;
            }
            
            const conditionName = event.currentTarget.dataset.tooltip;
            
            try {
                // Find the effect with this condition name
                const effect = this.actor.effects.find(e => e.name === conditionName);
                if (effect) {
                    await effect.delete();
                    ui.notifications.info(`Removed ${conditionName} from ${this.actor.name}`);
                }
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error removing condition',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.error(`Could not remove ${conditionName}`);
            }
        });

        // Handle add effect icon clicks
        tray.find('.add-effect-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can add effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can add effects.");
                return;
            }

            // Get all available conditions from CONFIG.DND5E.conditionTypes
            const conditions = Object.entries(CONFIG.DND5E.conditionTypes).map(([id, condition]) => ({
                id,
                name: condition.label,
                icon: condition.icon,
                isActive: this.actor.effects.some(e => e.name === condition.label)
            }));

            // Create a dialog with condition options
            const content = `
                <div class="squire-description-window">
                    <div class="squire-description-header">
                        <i class="fas fa-sparkles"></i>
                        <h1>Add Condition</h1>
                    </div>
                    
                    <div class="squire-description-content">
                        <div class="effect-grid">
                            ${conditions.map(condition => `
                                <div class="effect-option ${condition.isActive ? 'active' : ''}" data-condition-id="${condition.id}">
                                    <img src="${condition.icon}" title="${condition.name}"/>
                                    <div class="effect-name">${condition.name}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <style>
                    .squire-description-window .effect-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                        gap: 10px;
                        padding: 10px;
                        margin-top: 10px;
                    }
                    .squire-description-window .effect-option {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 5px;
                        background: rgba(255, 255, 255, 0.1);
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                        position: relative;
                    }
                    .squire-description-window .effect-option:hover {
                        background: rgba(255, 255, 255, 0.2);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option.active {
                        background: rgba(var(--color-shadow-primary), 0.5);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight) inset;
                    }
                    .squire-description-window .effect-option.active:hover {
                        background: rgba(var(--color-shadow-primary), 0.7);
                    }
                    .squire-description-window .effect-option.active::after {
                        content: '✓';
                        position: absolute;
                        top: -5px;
                        right: -5px;
                        background: var(--color-shadow-primary);
                        color: var(--color-text-light-highlight);
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        border: 1px solid var(--color-border-highlight);
                        box-shadow: 0 0 5px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option img {
                        width: 40px;
                        height: 40px;
                        object-fit: contain;
                        border: none;
                        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
                    }
                    .squire-description-window .effect-option .effect-name {
                        text-align: center;
                        font-size: 12px;
                        margin-top: 5px;
                        color: var(--color-text-light-highlight);
                        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
                    }
                </style>
            `;

            const dialog = new Dialog({
                title: "Add Effect",
                content: content,
                buttons: {
                    close: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Close"
                    }
                },
                render: (html) => {
                    html.find('.effect-option').click(async (e) => {
                        const conditionId = e.currentTarget.dataset.conditionId;
                        const condition = CONFIG.DND5E.conditionTypes[conditionId];
                        const isActive = $(e.currentTarget).hasClass('active');
                        
                        try {
                            if (isActive) {
                                // Remove the effect
                                const effect = this.actor.effects.find(e => e.name === condition.label);
                                if (effect) {
                                    await effect.delete();
                                    $(e.currentTarget).removeClass('active');
                                    ui.notifications.info(`Removed ${condition.label} from ${this.actor.name}`);
                                }
                            } else {
                                // Add the effect
                                await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                                    name: condition.label,
                                    icon: condition.icon,
                                    origin: this.actor.uuid,
                                    disabled: false
                                }]);
                                $(e.currentTarget).addClass('active');
                                ui.notifications.info(`Added ${condition.label} to ${this.actor.name}`);
                            }
                        } catch (error) {
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                'Error managing condition',
                                { error },
                                false,
                                false,
                                true,
                                MODULE.TITLE
                            );
                            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${condition.label}`);
                        }
                    });
                }
            }, {
                classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                width: 400,
                height: "auto"
            });
            dialog.render(true);
        });

        // View mode toggle button
        tray.find('.view-toggle-button').click(async (event) => {
            event.preventDefault();
            const currentMode = PanelManager.viewMode;
            let newMode;
            
            // Cycle through modes: player -> party -> notes -> codex -> quest -> player
            switch (currentMode) {
                case 'player':
                    newMode = 'party';
                    break;
                case 'party':
                    newMode = 'notes';
                    break;
                case 'notes':
                    newMode = 'codex';
                    break;
                case 'codex':
                    newMode = 'quest';
                    break;
                case 'quest':
                    newMode = 'player';
                    break;
                default:
                    newMode = 'player';
            }
            
            await this.setViewMode(newMode);
        });

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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error launching Award dialog',
                        { error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
            
            // Display notification
            ui.notifications.info(`Selected ${tokensToSelect.length} party member${tokensToSelect.length !== 1 ? 's' : ''}.`);
            
            // Play sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, 'toolbarButtonSound') || 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3';
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        });

        // Handle macros icon clicks
        handle.find('.handle-macros').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.macrosPanel && !this.macrosPanel.isPoppedOut) {
                await this.macrosPanel._onPopOut();
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'DROPZONE | No actor found',
                        { actor },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                    ui.notifications.warn("No character selected.");
                    return;
                }
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'DROPZONE | Current actor',
                    { actorName: actor.name },
                    false,
                    false,
                    false,
                    MODULE.TITLE
                );
                
                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        getBlacksmith()?.utils.postConsoleAndNotification(
                            'DROPZONE | Processing Item drop',
                            { dataType: data.type },
                            false,
                            false,
                            false,
                            MODULE.TITLE
                        );
                        // This could be either a world item OR a drag from character sheet
                        if ((data.actorId && (data.data?.itemId || data.embedId)) || 
                            data.fromInventory || 
                            (data.uuid && data.uuid.startsWith("Actor."))) {
                            
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                'DROPZONE | Item is from character sheet',
                                { data },
                                false,
                                false,
                                false,
                                MODULE.TITLE
                            );
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
                                getBlacksmith()?.utils.postConsoleAndNotification(
                                    'DROPZONE | No source actor or item ID',
                                    { sourceActorId, itemId },
                                    false,
                                    false,
                                    false,
                                    MODULE.TITLE
                                );
                                ui.notifications.warn("Could not determine the source actor or item.");
                                return;
                            }
                            
                            // Get the item from the source actor
                            const sourceItem = sourceActor.items.get(itemId);
                            if (!sourceItem) {
                                getBlacksmith()?.utils.postConsoleAndNotification(
                                    'DROPZONE | No source item found',
                                    { sourceActorId, itemId },
                                    false,
                                    false,
                                    false,
                                    MODULE.TITLE
                                );
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
                                
                                // Create chat message for transfer request
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
                                    }
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
                                
                                // GM: only if approval is required (no Accept/Reject buttons)
                                const gmUsers = game.users.filter(u => u.isGM);
                                const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
                                
                                if (gmUsers.length > 0 && gmApprovalRequired) {
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
                                                isTransferReceiver: false,
                                                transferId,
                                                receiverIds: gmUsers.map(u => u.id),
                                                transferData
                                            });
                                        }
                                    }
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
                                            isTransferReceiver: false,
                                            transferId
                                        }),
                                        speaker: { alias: "System" },
                                        whisper: gmUsers.map(u => u.id),
                                        flags: {
                                            [MODULE.ID]: {
                                                transferId,
                                                type: 'transferRequest',
                                                isTransferReceiver: false,
                                                targetUsers: gmUsers.map(u => u.id),
                                                data: transferData
                                            }
                                        }
                                    });
                                }
                                
                                if (hasSourcePermission && hasTargetPermission) {
                                    await this._completeItemTransfer(sourceActor, actor, sourceItem, selectedQuantity, hasQuantity);
                                    return;
                                } else {
                                    const socket = game.modules.get(MODULE.ID)?.socket;
                                    if (!socket) {
                                        ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                                        return;
                                    }
                                    await socket.executeAsGM('executeItemTransfer', {
                                        sourceActorId: sourceActor.id,
                                        targetActorId: actor.id,
                                        sourceItemId: sourceItem.id,
                                        quantity: selectedQuantity,
                                        hasQuantity: hasQuantity
                                    });
                                    return;
                                }
                            } else {
                                await this._completeItemTransfer(sourceActor, actor, sourceItem, selectedQuantity, hasQuantity);
                                return;
                            }
                        } else {
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                'DROPZONE | Item is from world',
                                { data },
                                false,
                                false,
                                false,
                                MODULE.TITLE
                            );
                            try {
                                // Get the item from the UUID
                                const item = await fromUuid(data.uuid);
                                if (!item) {
                                    getBlacksmith()?.utils.postConsoleAndNotification(
                                        'DROPZONE | Failed to get item from UUID',
                                        { uuid: data.uuid },
                                        false,
                                        false,
                                        false,
                                        MODULE.TITLE
                                    );
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
                                getBlacksmith()?.utils.postConsoleAndNotification(
                                    'DROPZONE | Error processing world item',
                                    { error },
                                    false,
                                    false,
                                    true,
                                    MODULE.TITLE
                                );
                                ui.notifications.error("Error processing dropped item. See console for details.");
                            }
                        }
                        break;
                    default:
                }
                
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'DROPZONE | Error handling drop',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.error("Error handling drop. See console for details.");
            }
        });


    }

    async setViewMode(mode) {
        // Update viewMode
        PanelManager.viewMode = mode;
        await game.settings.set(MODULE.ID, 'viewMode', mode);
        
        // Update tab buttons
        const tray = PanelManager.element;
        tray.find('.tray-tab-button').removeClass('active');
        tray.find(`.tray-tab-button[data-view="${mode}"]`).addClass('active');
        
        // Update view content visibility
        tray.find('.tray-view-content').addClass('hidden');
        tray.find(`.${mode}-view`).removeClass('hidden');
        
        // Update tools toolbar visibility
        tray.find('.tray-tools-toolbar').toggleClass('hidden', mode !== 'party');
        
        // Update toggle button icon
        const icon = tray.find('.view-toggle-button i');
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
        
        // Update handle content
        const handleLeft = tray.find('.handle-left');
        let handleTemplate;
        
        // Build favorite macros array
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);

        // Fetch pinned quest data for quest handle
        let pinnedQuest = null;
        if (mode === 'quest') {
            pinnedQuest = await this._getPinnedQuestData();
        }

        let handleData = {
            actor: this.actor,
            isGM: game.user.isGM,
            effects: this.actor?.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            pinnedQuest, // Add pinned quest data
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
            showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
            favoriteMacros
        };

        // If party view, add party context for handle-party
        if (mode === 'party') {
            // Get all player-owned tokens on the canvas
            const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
            // Get currently controlled tokens' actor IDs
            const controlledTokenIds = canvas.tokens.controlled
                .filter(token => token.actor)
                .map(token => token.actor.id);
            // Use the first controlled actor, or the first party member if none selected
            let currentActor = null;
            if (controlledTokenIds.length > 0) {
                currentActor = game.actors.get(controlledTokenIds[0]);
            } else if (tokens.length > 0) {
                currentActor = tokens[0].actor;
            }
            const otherPartyMembers = tokens
                .filter(token => token.actor && token.actor.id !== currentActor?.id)
                .map(token => ({
                    id: token.actor.id,
                    name: token.actor.name,
                    img: token.actor.img,
                    system: token.actor.system,
                    isOwner: token.actor.isOwner
                }));
            handleData = {
                ...handleData,
                actor: currentActor,
                otherPartyMembers
            };
        }

        // Use the tray template which includes the correct partial
        const trayData = {
            viewMode: mode,
            ...handleData
        };
        handleTemplate = await renderTemplate(TEMPLATES.TRAY, trayData);
        
        // Extract just the handle-left content from the rendered template
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = handleTemplate;
        const handleContent = tempDiv.querySelector('.handle-left').innerHTML;
        
        handleLeft.html(handleContent);
        
        // Reattach event listeners for handle elements
        const handle = tray.find('.tray-handle');
        
        // Handle dice tray icon clicks
        handle.find('.handle-dice-tray').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.dicetrayPanel && !this.dicetrayPanel.isPoppedOut) {
                await this.dicetrayPanel._onPopOut();
            }
        });

        // Handle pinned quest clicks
        handle.find('.handle-pinned-quest-name').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (pinnedQuestUuid) {
                try {
                    const doc = await fromUuid(pinnedQuestUuid);
                    if (doc) {
                        doc.sheet.render(true);
                    }
                } catch (error) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Error opening pinned quest',
                        { error },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                    ui.notifications.warn('Could not open pinned quest.');
                }
            }
        });

        // Handle health bar clicks
        handle.find('.handle-health-bar').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.healthPanel && !this.healthPanel.isPoppedOut) {
                await this.healthPanel._onPopOut();
            }
        });

        // Handle favorite item clicks
        handle.find('.handle-favorite-icon').on('click', async (event) => {
            if ($(event.target).hasClass('handle-favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
        });

        // Handle condition icon clicks
        handle.find('.condition-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const conditionName = event.currentTarget.dataset.tooltip;
            
            // Try to get the condition data from CONFIG.DND5E.conditionTypes
            let description = "No description available.";
            try {
                // Find the condition by matching the label
                const conditionData = Object.values(CONFIG.DND5E.conditionTypes).find(
                    condition => condition.label === conditionName
                );

                // Get the icon path from the clicked element
                const iconPath = event.currentTarget.src;

                if (conditionData?.reference) {
                    // Parse the reference string: "Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.0b8N4FymGGfbZGpJ"
                    const [, system, packName, type, journalId, , pageId] = conditionData.reference.split(".");
                    const pack = game.packs.get(`${system}.${packName}`);
                    
                    if (pack) {
                        const journal = await pack.getDocument(journalId);
                        if (journal) {
                            const page = journal.pages.get(pageId);
                            if (page) {
                                description = page.text.content;
                            }
                        }
                    }
                }

                // Create a dialog showing the condition details
                const content = `
                    <div class="squire-description-window">
                        <div class="squire-description-header">
                            <img src="${iconPath}"/>
                            <h1>${conditionData?.label || conditionName}</h1>
                        </div>
                        
                        <div class="squire-description-content">
                            ${description.split('\n').filter(line => line.trim()).map(line => 
                                `<p>${line.trim()}</p>`
                            ).join('')}
                            ${game.user.isGM ? '<p class="gm-note"><i>Right-click to remove this condition.</i></p>' : ''}
                        </div>
                    </div>
                    <style>
                        .gm-note {
                            margin-top: 1em;
                            font-size: 0.9em;
                            color: var(--color-text-dark-secondary);
                            font-style: italic;
                        }
                    </style>`;
                
                new Dialog({
                    title: conditionData?.label || conditionName,
                    content: content,
                    buttons: {
                        close: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Close"
                        }
                    },
                    default: "close"
                }, {
                    classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                    width: 400,
                    height: "auto"
                }).render(true);
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error getting condition description',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.warn("Could not load condition description.");
            }
        }).on('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can remove effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can remove effects.");
                return;
            }
            
            const conditionName = event.currentTarget.dataset.tooltip;
            
            try {
                // Find the effect with this condition name
                const effect = this.actor.effects.find(e => e.name === conditionName);
                if (effect) {
                    await effect.delete();
                    ui.notifications.info(`Removed ${conditionName} from ${this.actor.name}`);
                }
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error removing condition',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.error(`Could not remove ${conditionName}`);
            }
        });

        // Handle add effect icon clicks
        tray.find('.add-effect-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can add effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can add effects.");
                return;
            }

            // Get all available conditions from CONFIG.DND5E.conditionTypes
            const conditions = Object.entries(CONFIG.DND5E.conditionTypes).map(([id, condition]) => ({
                id,
                name: condition.label,
                icon: condition.icon,
                isActive: this.actor.effects.some(e => e.name === condition.label)
            }));

            // Create a dialog with condition options
            const content = `
                <div class="squire-description-window">
                    <div class="squire-description-header">
                        <i class="fas fa-sparkles"></i>
                        <h1>Add Condition</h1>
                    </div>
                    
                    <div class="squire-description-content">
                        <div class="effect-grid">
                            ${conditions.map(condition => `
                                <div class="effect-option ${condition.isActive ? 'active' : ''}" data-condition-id="${condition.id}">
                                    <img src="${condition.icon}" title="${condition.name}"/>
                                    <div class="effect-name">${condition.name}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <style>
                    .squire-description-window .effect-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                        gap: 10px;
                        padding: 10px;
                        margin-top: 10px;
                    }
                    .squire-description-window .effect-option {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 5px;
                        background: rgba(255, 255, 255, 0.1);
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                        position: relative;
                    }
                    .squire-description-window .effect-option:hover {
                        background: rgba(255, 255, 255, 0.2);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option.active {
                        background: rgba(var(--color-shadow-primary), 0.5);
                        border-color: var(--color-border-highlight);
                        box-shadow: 0 0 10px var(--color-shadow-highlight) inset;
                    }
                    .squire-description-window .effect-option.active:hover {
                        background: rgba(var(--color-shadow-primary), 0.7);
                    }
                    .squire-description-window .effect-option.active::after {
                        content: '✓';
                        position: absolute;
                        top: -5px;
                        right: -5px;
                        background: var(--color-shadow-primary);
                        color: var(--color-text-light-highlight);
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        border: 1px solid var(--color-border-highlight);
                        box-shadow: 0 0 5px var(--color-shadow-highlight);
                    }
                    .squire-description-window .effect-option img {
                        width: 40px;
                        height: 40px;
                        object-fit: contain;
                        border: none;
                        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
                    }
                    .squire-description-window .effect-option .effect-name {
                        text-align: center;
                        font-size: 12px;
                        margin-top: 5px;
                        color: var(--color-text-light-highlight);
                        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
                    }
                </style>
            `;

            const dialog = new Dialog({
                title: "Add Effect",
                content: content,
                buttons: {
                    close: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Close"
                    }
                },
                render: (html) => {
                    html.find('.effect-option').click(async (e) => {
                        const conditionId = e.currentTarget.dataset.conditionId;
                        const condition = CONFIG.DND5E.conditionTypes[conditionId];
                        const isActive = $(e.currentTarget).hasClass('active');
                        
                        try {
                            if (isActive) {
                                // Remove the effect
                                const effect = this.actor.effects.find(e => e.name === condition.label);
                                if (effect) {
                                    await effect.delete();
                                    $(e.currentTarget).removeClass('active');
                                    ui.notifications.info(`Removed ${condition.label} from ${this.actor.name}`);
                                }
                            } else {
                                // Add the effect
                                await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                                    name: condition.label,
                                    icon: condition.icon,
                                    origin: this.actor.uuid,
                                    disabled: false
                                }]);
                                $(e.currentTarget).addClass('active');
                                ui.notifications.info(`Added ${condition.label} to ${this.actor.name}`);
                            }
                        } catch (error) {
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                'Error managing condition',
                                { error },
                                false,
                                false,
                                true,
                                MODULE.TITLE
                            );
                            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${condition.label}`);
                        }
                    });
                }
            }, {
                classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                width: 400,
                height: "auto"
            });
            dialog.render(true);
        });

        // Handle macros icon clicks
        handle.find('.handle-macros').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.macrosPanel && !this.macrosPanel.isPoppedOut) {
                await this.macrosPanel._onPopOut();
            }
        });

        // Add click handler for favorite macros in handle
        handle.find('.handle-macro-favorite').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const macroId = $(this).data('macro-id');
            const macro = game.macros.get(macroId);
            if (macro) macro.execute();
        });
        
        // Play sound effect
        AudioHelper.play({src: game.settings.get(MODULE.ID, 'tabChangeSound'), volume: 0.8, autoplay: true, loop: false}, false);

        // Add click handler for party member portraits in the handle
        handle.find('.handle-party-member-portrait.clickable').on('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(this).closest('.handle-party-member').data('actor-id');
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) {
                token.control({releaseOthers: true});
            }
        });

        // Add click handler for party member health bars in the handle
        handle.find('.handle-party-member-health-bar .handle-health-fill.clickable').on('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(this).closest('.handle-party-member').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor && PanelManager.instance && PanelManager.instance.healthPanel) {
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
                if (token) {
                    token.control({releaseOthers: true});
                }
                PanelManager.instance.healthPanel.updateActor(actor);
                await PanelManager.instance.healthPanel._onPopOut();
            }
        });

        // Handle character portrait click in the handle
        handle.find('.handle-character-portrait').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Use the actor from the handle context
            const actor = this.actor || PanelManager.currentActor;
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Attach objective click handlers
        this._attachObjectiveClickHandlers(handle);
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
    }

    /**
     * Comprehensive cleanup method to prevent memory leaks
     */
    static cleanup() {
        // Clear all intervals
        PanelManager._intervals.forEach(intervalId => {
            clearInterval(intervalId);
        });
        PanelManager._intervals.clear();

        // Clear all timeouts
        PanelManager._timeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
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
            'PanelManager cleanup completed',
            {},
            false,
            false,
            false,
            MODULE.TITLE
        );
    }

    /**
     * Track a timeout for cleanup
     */
    static trackTimeout(timeoutId) {
        PanelManager._timeouts.add(timeoutId);
        return timeoutId;
    }

    /**
     * Track an interval for cleanup
     */
    static trackInterval(intervalId) {
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

    /**
     * Attach objective click handlers to the handle
     * @param {jQuery} handle - The handle element
     */
    _attachObjectiveClickHandlers(handle) {
        // Handle objective clicks in quest progress (handle)
        console.log('SQUIRE | Setting up objective handler, found elements:', handle.find('.handle-quest-progress-fill').length);
        
        // Remove existing handlers first to prevent duplicates
        handle.find('.handle-quest-progress-fill').off('click mouseenter mouseleave');
        
        handle.find('.handle-quest-progress-fill').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const objectiveElement = $(event.currentTarget);
            const taskIndex = parseInt(objectiveElement.data('task-index'));
            
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (!pinnedQuestUuid) {
                ui.notifications.warn('No quest is currently pinned.');
                return;
            }
            
            // Find the corresponding quest pin on the canvas
            if (canvas.squirePins && canvas.squirePins.children) {
                const questPins = canvas.squirePins.children.filter(child =>
                    child instanceof QuestPin && child.questUuid === pinnedQuestUuid && child.objectiveIndex === taskIndex
                );
                if (questPins.length > 0) {
                    const pin = questPins[0];
                    canvas.animatePan({ x: pin.x, y: pin.y });
                    pin.alpha = 0.6;
                    setTimeout(() => { pin.alpha = 1.0; }, 200);
                } else {
                    ui.notifications.warn(`No pin found for objective ${taskIndex + 1}.`);
                }
            } else {
                ui.notifications.warn('Quest pins are not available on this scene.');
            }
        });

        // Add enhanced tooltip functionality
        handle.find('.handle-quest-progress-fill').on('mouseenter', async (event) => {
            const objectiveElement = $(event.currentTarget);
            const taskIndex = parseInt(objectiveElement.data('task-index'));
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            if (!pinnedQuestUuid) return;
            try {
                const tooltipData = await getObjectiveTooltipData(pinnedQuestUuid, taskIndex);
                if (!tooltipData) return;
                // Add handle-specific controls text
                tooltipData.controls = 'Left-click: Pan to objective pin on map';
                showQuestTooltip('squire-handle-objective-tooltip', tooltipData, event, 500); // 500ms delay before showing tooltip
            } catch (error) {
                console.error('Error creating tooltip:', error);
            }
        });

        handle.find('.handle-quest-progress-fill').on('mouseleave', (event) => {
            hideQuestTooltip('squire-handle-objective-tooltip');
        });
    }
}

// =====================================================
// ======================  Hooks  ======================    
// =====================================================

Hooks.on('canvasReady', async () => {
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
    } else {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'No Initial Actor Found',
            { reason: "Could not find any suitable token or character" },
            false,
            false,
            false,
            MODULE.TITLE
        );
    }
});

// Also handle when tokens are selected
Hooks.on('controlToken', async (token, controlled) => {
    // Only care about token selection, not deselection
    if (!controlled) return;
    
    // Only proceed if it's a GM or the token owner
    if (!game.user.isGM && !token.actor?.isOwner) return;

    // Get a list of all controlled tokens that the user owns
    const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    
    // If no tokens are controlled, return
    if (!controlledTokens.length) return;

    // Determine which actor to use:
    // - If the list includes player-owned characters, use the most recent player character
    // - Otherwise, use the most recently selected token's actor
    let actorToUse = token.actor; // Default to the current token that triggered the hook
   
    // Look for player character tokens
    const playerTokens = controlledTokens.filter(t => t.actor?.type === 'character' && t.actor?.hasPlayerOwner);
    
    if (playerTokens.length > 0) {
        // Use the most recent player token (last one in the array)
        actorToUse = playerTokens[playerTokens.length - 1].actor;
    }

    // Save the current view mode before initializing
    const currentViewMode = PanelManager.viewMode;

    // If not pinned, handle the animation sequence
    if (!PanelManager.isPinned && PanelManager.element) {
        PanelManager.element.removeClass('expanded');
        await PanelManager.initialize(actorToUse);
        
        // Play tray open sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        PanelManager.element.addClass('expanded');
        // Restore the previous view mode after initializing
        if (PanelManager.instance) {
            await PanelManager.instance.setViewMode(currentViewMode);
        }
        return;
    }

    // If pinned, just update the data immediately
    await PanelManager.initialize(actorToUse);
    // Restore the previous view mode after initializing
    if (PanelManager.instance) {
        await PanelManager.instance.setViewMode(currentViewMode);
    }
});

// Also handle when tokens are deleted or actors are updated
Hooks.on('deleteToken', async (token) => {
    if (PanelManager.currentActor?.id === token.actor?.id) {
        PanelManager.instance = null;
        PanelManager.currentActor = null;
        
        // Try to find another token to display
        const nextToken = canvas.tokens?.placeables.find(t => t.actor?.isOwner);
        if (nextToken) {
            await PanelManager.initialize(nextToken.actor);
        }
    }
});

// Handle actor updates that require full re-initialization
Hooks.on('updateActor', async (actor, changes) => {
    // Only handle major changes that require full re-initialization
    const needsFullUpdate = changes.name || // Name change
                           changes.img || // Image change
                           changes.system?.attributes?.prof || // Proficiency change
                           changes.system?.details?.level || // Level change
                           changes.system?.attributes?.ac || // AC change
                           changes.system?.attributes?.movement; // Movement change

    if (PanelManager.currentActor?.id === actor.id && needsFullUpdate) {
        await PanelManager.initialize(actor);
        
        // Force a re-render of all panels
        if (PanelManager.instance) {
            await PanelManager.instance.renderPanels(PanelManager.element);
        }
    }
    // For health, effects, and spell slot changes, update appropriately
    else if (PanelManager.currentActor?.id === actor.id) {
        if (PanelManager.instance) {
            // Handle health and effects changes
            if (changes.system?.attributes?.hp || changes.effects) {
                await PanelManager.instance.updateHandle();
            }
            
            // Handle spell slot changes
            if (changes.system?.spells) {
                // Re-render just the spells panel
                if (PanelManager.instance.spellsPanel?.element) {
                    await PanelManager.instance.spellsPanel.render(PanelManager.instance.spellsPanel.element);
                }
            }
        }
    }
});

// Add a hook for when the game is paused/unpaused to ensure panels stay responsive
Hooks.on('pauseGame', async (paused) => {
    if (!paused && PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle active effect creation
Hooks.on('createActiveEffect', async (effect) => {
    if (PanelManager.currentActor?.id === effect.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
});

// Handle active effect deletion
Hooks.on('deleteActiveEffect', async (effect) => {
    if (PanelManager.currentActor?.id === effect.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
});

// Handle item creation
Hooks.on('createItem', async (item) => {
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle item updates
Hooks.on('updateItem', async (item) => {
    if (!item.parent) return;
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        // Check if this is an NPC/monster and the item is a weapon being equipped
        // or a spell being prepared
        if (item.parent.type !== "character") {
            // For weapons, check if equipped status changed to true
            if (item.type === "weapon" && item.system.equipped === true) {
                // Add to favorites if it's now equipped
                await FavoritesPanel.manageFavorite(item.parent, item.id);
            }
            // For spells, check if prepared status changed to true
            else if (item.type === "spell" && item.system.preparation?.prepared === true) {
                // Add to favorites if it's now prepared
                await FavoritesPanel.manageFavorite(item.parent, item.id);
            }
        }
        
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle item deletion
Hooks.on('deleteItem', async (item) => {
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Set up periodic cleanup of newly added items
const globalCleanupInterval = setInterval(() => {
    if (PanelManager.instance) {
        PanelManager.cleanupNewlyAddedItems();
        // Update the tray if there are any changes
        if (PanelManager.instance.element) {
            PanelManager.instance.updateTray();
        }
    }
}, 60000); // Check every minute
PanelManager.trackInterval(globalCleanupInterval);

// Cleanup hooks to prevent memory leaks
// Only clean up when the game is actually closing, not when module is disabled
Hooks.on('closeGame', () => {
    if (PanelManager.instance) {
        PanelManager.cleanup();
    }
});

// Clean up when the module is disabled
Hooks.on('disableModule', (moduleId) => {
    if (moduleId === MODULE.ID) {
        PanelManager.cleanup();
    }
}); 