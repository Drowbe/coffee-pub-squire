import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';
import { QuestPanel } from './panel-quest.js';
import { QuestForm } from './window-quest.js';
import { QuestParser } from './utility-quest-parser.js';
import { QuestPin, loadPersistedPinsOnCanvasReady, loadPersistedPins } from './quest-pin.js';
// HookManager import removed - using Blacksmith HookManager instead




// ================================================================== 
// ===== BEGIN: BLACKSMITH API REGISTRATIONS ========================
// ================================================================== 
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
Hooks.once('ready', () => {
    try {
        // Register your module with Blacksmith
        BlacksmithModuleManager.registerModule(MODULE.ID, {
            name: MODULE.NAME,
            version: MODULE.VERSION
        });
        console.log('✅ Module ' + MODULE.NAME + ' registered with Blacksmith successfully');
        
        // Register all hooks after Blacksmith is ready
        const renderActorSheet5eHookId = BlacksmithHookManager.registerHook({
            name: 'renderActorSheet5e',
            description: 'Coffee Pub Squire: Initialize tray when character sheet is rendered',
            context: MODULE.ID,
            priority: 2,
            callback: async (app, html, data) => {
                if (!app.actor) return;
                await PanelManager.initialize(app.actor);
            }
        });
        
        const canvasInitHookId = BlacksmithHookManager.registerHook({
            name: 'canvasInit',
            description: 'Coffee Pub Squire: Create squirePins container on canvas initialization',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                console.log('CanvasInit hook called, canvas.squirePins:', !!canvas.squirePins);
                if (!canvas.squirePins) {
                    console.log('Creating squirePins container...');
                    const squirePins = new PIXI.Container();
                    squirePins.sortableChildren = true;
                    squirePins.interactive = true;
                    squirePins.eventMode = 'static';
                    if (canvas.foregroundGroup) {
                        canvas.foregroundGroup.addChild(squirePins);
                    } else {
                        canvas.stage.addChild(squirePins);
                    }
                    canvas.squirePins = squirePins;
                    console.log('squirePins container created:', !!canvas.squirePins);
                }
            }
        });
        
        const canvasReadyHookId = BlacksmithHookManager.registerHook({
            name: 'canvasReady',
            description: 'Coffee Pub Squire: Ensure squirePins container is properly positioned',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                console.log('CanvasReady hook called, canvas.squirePins:', !!canvas.squirePins);
                if (!canvas.squirePins) {
                    console.log('Creating squirePins container in canvasReady...');
                    const squirePins = new PIXI.Container();
                    squirePins.sortableChildren = true;
                    squirePins.interactive = true;
                    squirePins.eventMode = 'static';
                    if (canvas.foregroundGroup) {
                        canvas.foregroundGroup.addChild(squirePins);
                    } else {
                        canvas.stage.addChild(squirePins);
                    }
                    canvas.squirePins = squirePins;
                    console.log('squirePins container created in canvasReady:', !!canvas.squirePins);
                }
                
                // Move squirePins to top of display order
                if (canvas.squirePins) {
                    const parent = canvas.squirePins.parent;
                    if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
                        parent.addChild(canvas.squirePins);
                    }
                    canvas.squirePins.interactive = true;
                    console.log('squirePins container positioned and interactive:', canvas.squirePins.interactive);
                }
            }
        });
        
        const disableModuleHookId = BlacksmithHookManager.registerHook({
            name: 'disableModule',
            description: 'Coffee Pub Squire: Clean up when module is disabled',
            context: MODULE.ID,
            priority: 2,
            callback: async (moduleId) => {
                if (moduleId === MODULE.ID) {
                    // Clear quest notifications when module is disabled
                    try {
                        // Clear quest notifications through the panel manager
                        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance?.questPanel) {
                            game.modules.get('coffee-pub-squire').api.PanelManager.instance.questPanel.clearQuestNotifications();
                        }
                    } catch (error) {
                        console.error('Coffee Pub Squire | Error clearing quest notifications on disable:', error);
                    }
                    
                    cleanupModule();
                }
            }
        });
        
        const closeGameHookId = BlacksmithHookManager.registerHook({
            name: 'closeGame',
            description: 'Coffee Pub Squire: Clean up when game closes',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                cleanupModule();
            }
        });
        
        // Register all remaining hooks from manager-hooks.js
        const journalHookId = BlacksmithHookManager.registerHook({
            name: "updateJournalEntryPage",
            description: "Coffee Pub Squire: Handle journal entry page updates for codex, quest, notes, and quest pins",
            context: MODULE.ID,
            priority: 2,
            callback: async (page, changes, options, userId) => {
                // Handle journal entry page updates - route to appropriate panels
                await Promise.all([
                    _routeToCodexPanel(page, changes, options, userId),
                    _routeToQuestPanel(page, changes, options, userId),
                    _routeToNotesPanel(page, changes, options, userId),
                    _routeToQuestPins(page, changes, options, userId)
                ]);
            }
        });

        
        // Character Panel Hooks
        const characterActorHookId = BlacksmithHookManager.registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle actor updates for character panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Route to character panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.characterPanel && panelManager.instance.characterPanel._onActorUpdate) {
                    panelManager.instance.characterPanel._onActorUpdate(document, change);
                }
            }
        });
        
        const characterTokenHookId = BlacksmithHookManager.registerHook({
            name: "updateToken",
            description: "Coffee Pub Squire: Handle token updates for character panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Route to character panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.characterPanel && panelManager.instance.characterPanel._onActorUpdate) {
                    panelManager.instance.characterPanel._onActorUpdate(document, change);
                }
            }
        });
        
        // Party Panel Hooks
        const partyTokenHookId = BlacksmithHookManager.registerHook({
            name: "updateToken",
            description: "Coffee Pub Squire: Handle token updates for party panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._onTokenUpdate) {
                    panelManager.instance.partyPanel._onTokenUpdate(document, change);
                }
            }
        });
        
        const partyActorHookId = BlacksmithHookManager.registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle actor updates for party panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._onActorUpdate) {
                    panelManager.instance.partyPanel._onActorUpdate(document, change);
                }
            }
        });
        
        const partyControlTokenHookId = BlacksmithHookManager.registerHook({
            name: "controlToken",
            description: "Coffee Pub Squire: Handle token control for party panel",
            context: MODULE.ID,
            priority: 2,
            callback: (token, controlled) => {
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._onControlToken) {
                    panelManager.instance.partyPanel._onControlToken(token, controlled);
                }
            }
        });
        
        const partyRenderChatMessageHookId = BlacksmithHookManager.registerHook({
            name: "renderChatMessage",
            description: "Coffee Pub Squire: Handle chat message rendering for party panel transfer buttons",
            context: MODULE.ID,
            priority: 2,
            callback: (message, html, data) => {
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._handleTransferButtons) {
                    panelManager.instance.partyPanel._handleTransferButtons(message, html, data);
                }
            }
        });
        
        // Macros Panel Hooks
        const macrosReadyHookId = BlacksmithHookManager.registerHook({
            name: "ready",
            description: "Coffee Pub Squire: Handle ready event for macros panel",
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // Route to macros panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.macrosPanel && panelManager.instance.macrosPanel.updateHotbarVisibility) {
                    panelManager.instance.macrosPanel.updateHotbarVisibility();
                }
            }
        });
        
        const macrosRenderSettingsConfigHookId = BlacksmithHookManager.registerHook({
            name: "renderSettingsConfig",
            description: "Coffee Pub Squire: Handle settings config rendering for macros panel",
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // Route to macros panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.macrosPanel && panelManager.instance.macrosPanel.updateHotbarVisibility) {
                    panelManager.instance.macrosPanel.updateHotbarVisibility();
                }
            }
        });
        
        // Party Stats Panel Hooks
        const partyStatsUpdateCombatHookId = BlacksmithHookManager.registerHook({
            name: "updateCombat",
            description: "Coffee Pub Squire: Handle combat updates for party stats panel",
            context: MODULE.ID,
            priority: 2,
            callback: (combat, change) => {
                // Route to party stats panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyStatsPanel && panelManager.instance.partyStatsPanel._boundUpdateHandler) {
                    panelManager.instance.partyStatsPanel._boundUpdateHandler(combat, change);
                }
            }
        });
        
        const partyStatsUpdateActorHookId = BlacksmithHookManager.registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle actor updates for party stats panel",
            context: MODULE.ID,
            priority: 2,
            callback: (actor, change) => {
                // Route to party stats panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyStatsPanel && panelManager.instance.partyStatsPanel._boundUpdateHandler) {
                    panelManager.instance.partyStatsPanel._boundUpdateHandler(actor, change);
                }
            }
        });
        
        const partyStatsCreateChatMessageHookId = BlacksmithHookManager.registerHook({
            name: "createChatMessage",
            description: "Coffee Pub Squire: Handle chat message creation for party stats panel",
            context: MODULE.ID,
            priority: 2,
            callback: (message) => {
                // Route to party stats panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyStatsPanel && panelManager.instance.partyStatsPanel._boundUpdateHandler) {
                    panelManager.instance.partyStatsPanel._boundUpdateHandler(message);
                }
            }
        });
        
        // Global System Hooks
        const globalControlTokenHookId = BlacksmithHookManager.registerHook({
            name: "controlToken",
            description: "Coffee Pub Squire: Handle global token control for selection display",
            context: MODULE.ID,
            priority: 2,
            callback: async (token, controlled) => {
                // Only proceed if it's a GM or the token owner
                if (!game.user.isGM && !token.actor?.isOwner) return;
                
                // Update selection display for both selection and release
                const panelManager = getPanelManager();
                if (panelManager?.instance) {
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                }
            }
        });
        
        const globalCreateItemHookId = BlacksmithHookManager.registerHook({
            name: "createItem",
            description: "Coffee Pub Squire: Handle global item creation for tray updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (item) => {
                const panelManager = getPanelManager();
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // Check if this item belongs to an actor that the current user owns
                if (item.parent && item.parent.isOwner) {
                    // Update relevant panels and handle
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                    await panelManager.instance.updateHandle();
                }
            }
        });
        
        const globalUpdateItemHookId = BlacksmithHookManager.registerHook({
            name: "updateItem",
            description: "Coffee Pub Squire: Handle global item updates for tray updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (item, changes) => {
                if (!item.parent) return;
                
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Update the tray
                if (panelManager?.instance) {
                    await panelManager.instance.updateHandle();
                }
            }
        });
        
        const globalDeleteItemHookId = BlacksmithHookManager.registerHook({
            name: "deleteItem",
            description: "Coffee Pub Squire: Handle global item deletion for tray updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (item) => {
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Update the tray
                if (panelManager?.instance) {
                    await panelManager.instance.updateHandle();
                }
            }
        });
        
        // Quest Pin Hooks
        const questPinDropCanvasDataHookId = BlacksmithHookManager.registerHook({
            name: "dropCanvasData",
            description: "Coffee Pub Squire: Handle quest pin canvas data drops",
            context: MODULE.ID,
            priority: 2,
            callback: async (canvas, data) => {
                if (data.type !== 'quest-objective' && data.type !== 'quest-quest') return; // Let Foundry handle all other drops!
                
                // Only GMs can create quest pins
                if (!game.user.isGM) return false;
                
                if (data.type === 'quest-objective') {
                    // Handle objective-level pins
                    const { questUuid, objectiveIndex, objectiveState, questIndex, questCategory, questState } = data;
                    
                    // Use the objective state from the drag data (default to 'active' if not provided)
                    const finalObjectiveState = objectiveState || 'active';
                    
                    const pin = new QuestPin({
                        x: data.x, 
                        y: data.y, 
                        questUuid, 
                        objectiveIndex, 
                        objectiveState: finalObjectiveState,
                        questIndex, 
                        questCategory,
                        questState: questState || 'visible'
                    });
                    
                    if (canvas.squirePins) {
                        canvas.squirePins.addChild(pin);
                        // Save to persistence
                        pin._saveToPersistence();
                        
                        // Auto-show quest pins if they're currently hidden and this is a GM
                        const currentVisibility = game.user.getFlag(MODULE.ID, 'hideQuestPins') || false;
                        if (currentVisibility) {
                            await game.user.setFlag(MODULE.ID, 'hideQuestPins', false);
                            ui.notifications.info('Quest pins automatically shown after placing new quest pin.');
                            
                            // Update the toggle button in the quest panel to reflect the new state
                            const toggleButton = document.querySelector('.toggle-pin-visibility');
                            if (toggleButton) {
                                toggleButton.classList.remove('fa-location-dot');
                                toggleButton.classList.add('fa-location-dot-slash');
                                toggleButton.title = 'Show Quest Pins';
                            }
                        }
                    } else {
                        // canvas.squirePins is not available
                    }
                    return true;
                } else if (data.type === 'quest-quest') {
                    // Handle quest-level pins
                    const { questUuid, questIndex, questCategory, questState, questStatus, participants } = data;
                    
                    // Convert participant UUIDs to participant objects with names
                    const processedParticipants = [];
                    if (participants && Array.isArray(participants)) {
                        for (const participantUuid of participants) {
                            try {
                                if (participantUuid && participantUuid.trim()) {
                                    // Try to get actor name from UUID
                                    const actor = await fromUuid(participantUuid);
                                    if (actor && actor.name) {
                                        processedParticipants.push({
                                            uuid: participantUuid,
                                            name: actor.name,
                                            img: actor.img || 'icons/svg/mystery-man.svg'
                                        });
                                    }
                                }
                            } catch (error) {
                                // If we can't resolve the UUID, add a placeholder
                                processedParticipants.push({
                                    uuid: participantUuid,
                                    name: 'Unknown',
                                    img: 'icons/svg/mystery-man.svg'
                                });
                            }
                        }
                    }
                    
                    const pin = new QuestPin({
                        x: data.x, 
                        y: data.y, 
                        questUuid, 
                        objectiveIndex: null, // Indicates quest-level pin
                        objectiveState: null, // Not applicable for quest pins
                        questIndex, 
                        questCategory,
                        questState: questState || 'visible',
                        questStatus: questStatus || 'Not Started',
                        participants: processedParticipants
                    });
                    
                    if (canvas.squirePins) {
                        canvas.squirePins.addChild(pin);
                        // Save to persistence
                        pin._saveToPersistence();
                        
                        // Auto-show quest pins if they're currently hidden and this is a GM
                        const currentVisibility = game.user.getFlag(MODULE.ID, 'hideQuestPins') || false;
                        if (currentVisibility) {
                            await game.user.setFlag(MODULE.ID, 'hideQuestPins', false);
                            ui.notifications.info('Quest pins automatically shown after placing new quest pin.');
                            
                            // Update the toggle button in the quest panel to reflect the new state
                            const toggleButton = document.querySelector('.toggle-pin-visibility');
                            if (toggleButton) {
                                toggleButton.classList.remove('fa-location-dot');
                                toggleButton.classList.add('fa-location-dot-slash');
                                toggleButton.title = 'Show Quest Pins';
                            }
                        }
                    } else {
                        // canvas.squirePins is not available
                    }
                    return true;
                }
            }
        });
        
        const questPinCanvasSceneChangeHookId = BlacksmithHookManager.registerHook({
            name: "canvasSceneChange",
            description: "Coffee Pub Squire: Handle quest pin canvas scene changes",
            context: MODULE.ID,
            priority: 2,
            callback: (scene) => {
                // Delay loading to ensure scene is fully loaded
                setTimeout(() => {
                    loadPersistedPins();
                }, 1000);
            }
        });
        
        const questPinUpdateSceneHookId = BlacksmithHookManager.registerHook({
            name: "updateScene",
            description: "Coffee Pub Squire: Handle quest pin scene updates",
            context: MODULE.ID,
            priority: 2,
            callback: (scene, changes, options, userId) => {
                if (scene.id === canvas.scene?.id && changes.flags && changes.flags[MODULE.ID]) {
                    // Delay loading to ensure the scene update is fully processed
                    setTimeout(() => {
                        loadPersistedPins();
                    }, 500);
                }
            }
        });
        
        const questPinUpdateTokenHookId = BlacksmithHookManager.registerHook({
            name: "updateToken",
            description: "Coffee Pub Squire: Handle quest pin token updates",
            context: MODULE.ID,
            priority: 2,
            callback: (token, changes) => {
                if (changes.x !== undefined || changes.y !== undefined || changes.vision !== undefined) {
                    // Update pin visibility for all pins
                    if (canvas.squirePins) {
                        const pins = canvas.squirePins.children.filter(child => child.constructor.name === 'QuestPin');
                        pins.forEach(pin => {
                            try {
                                if (pin.updateVisibility) {
                                    pin.updateVisibility();
                                }
                            } catch (error) {
                                // Error updating pin visibility
                            }
                        });
                    }
                }
            }
        });
        
        const questPinCreateTokenHookId = BlacksmithHookManager.registerHook({
            name: "createToken",
            description: "Coffee Pub Squire: Handle quest pin token creation",
            context: MODULE.ID,
            priority: 2,
            callback: (token) => {
                // Update pin visibility
                // This would need the actual quest pin logic
            }
        });
        
        const questPinDeleteTokenHookId = BlacksmithHookManager.registerHook({
            name: "deleteToken",
            description: "Coffee Pub Squire: Handle quest pin token deletion",
            context: MODULE.ID,
            priority: 2,
            callback: (token) => {
                // Update pin visibility
                // This would need the actual quest pin logic
            }
        });
        
        const questPinRenderQuestPanelHookId = BlacksmithHookManager.registerHook({
            name: "renderQuestPanel",
            description: "Coffee Pub Squire: Handle quest pin quest panel rendering",
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // Update pin visibility for all pins
                if (canvas.squirePins) {
                    const pins = canvas.squirePins.children.filter(child => child.constructor.name === 'QuestPin');
                    pins.forEach(pin => {
                        try {
                            if (pin.updateVisibility) {
                                pin.updateVisibility();
                            }
                        } catch (error) {
                            // Error updating pin visibility
                        }
                    });
                }
            }
        });
        
        const questPinSightRefreshHookId = BlacksmithHookManager.registerHook({
            name: "sightRefresh",
            description: "Coffee Pub Squire: Handle quest pin sight refresh",
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // Update pin visibility
                // This would need the actual quest pin logic
            }
        });
        
        console.log('✅ Coffee Pub Squire: All hooks registered with Blacksmith successfully');
    } catch (error) {
        console.error('❌ Failed to register ' + MODULE.NAME + ' with Blacksmith:', error);
    }
});
// ================================================================== 
// ===== END: BLACKSMITH API REGISTRATIONS ==========================
// ================================================================== 

// Canvas hooks use native FoundryVTT hooks as Blacksmith timing for canvas events is unreliable
Hooks.on('canvasInit', () => {
    console.log('Native CanvasInit hook called, canvas.squirePins:', !!canvas.squirePins);
    if (!canvas.squirePins) {
        console.log('Creating squirePins container via native hook...');
        const squirePins = new PIXI.Container();
        squirePins.sortableChildren = true;
        squirePins.interactive = true;
        squirePins.eventMode = 'static';
        if (canvas.foregroundGroup) {
            canvas.foregroundGroup.addChild(squirePins);
        } else {
            canvas.stage.addChild(squirePins);
        }
        canvas.squirePins = squirePins;
        console.log('squirePins container created via native hook:', !!canvas.squirePins);
    }
});

Hooks.on('canvasReady', () => {
    console.log('Native CanvasReady hook called, canvas.squirePins:', !!canvas.squirePins);
    if (!canvas.squirePins) {
        console.log('Creating squirePins container via native canvasReady...');
        const squirePins = new PIXI.Container();
        squirePins.sortableChildren = true;
        squirePins.interactive = true;
        squirePins.eventMode = 'static';
        if (canvas.foregroundGroup) {
            canvas.foregroundGroup.addChild(squirePins);
        } else {
            canvas.stage.addChild(squirePins);
        }
        canvas.squirePins = squirePins;
        console.log('squirePins container created via native canvasReady:', !!canvas.squirePins);
    }
    
    // Move squirePins to top of display order
    if (canvas.squirePins) {
        const parent = canvas.squirePins.parent;
        if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
            parent.addChild(canvas.squirePins);
        }
        canvas.squirePins.interactive = true;
        console.log('squirePins container positioned and interactive via native hook:', canvas.squirePins.interactive);
    }
});

// Helper function to get PanelManager dynamically to avoid circular dependencies
function getPanelManager() {
    return game.modules.get('coffee-pub-squire')?.api?.PanelManager;
}

// Helper functions to route journal entry updates to appropriate panels
async function _routeToCodexPanel(page, changes, options, userId) {
    const panelManager = getPanelManager();
    const codexPanel = panelManager?.instance?.codexPanel;
    if (!codexPanel) return;
    
    try {
        // Check if this is a CODEX entry and belongs to the selected journal
        if (codexPanel._isPageInSelectedJournal && 
            codexPanel._isPageInSelectedJournal(page) &&
            codexPanel._isCodexEntry && 
            codexPanel._isCodexEntry(page)) {
            
            // Skip panel refresh if currently importing
            if (codexPanel.isImporting) {
                return;
            }
            
            // Always refresh the data first
            await codexPanel._refreshData();
            
            // Trigger a refresh through the PanelManager if it's available
            if (panelManager?.instance && panelManager.element) {
                // Re-render the codex panel specifically
                codexPanel.render(panelManager.element);
            }
        }
    } catch (error) {
        console.error('Error routing to codex panel:', error);
    }
}

async function _routeToQuestPanel(page, changes, options, userId) {
    const panelManager = getPanelManager();
    const questPanel = panelManager?.instance?.questPanel;
    if (!questPanel) return;
    
    try {
        // Check if this is a QUEST entry and belongs to the selected journal
        if (questPanel._isPageInSelectedJournal && 
            questPanel._isPageInSelectedJournal(page) &&
            questPanel._isQuestEntry && 
            questPanel._isQuestEntry(page)) {
            
            // Always refresh the data first
            await questPanel._refreshData();
            
            // Trigger a refresh through the PanelManager if it's available
            if (panelManager?.instance && panelManager.element) {
                // Re-render the quest panel specifically
                questPanel.render(panelManager.element);
            }
        }
    } catch (error) {
        console.error('Error routing to quest panel:', error);
    }
}

async function _routeToNotesPanel(page, changes, options, userId) {
    const panelManager = getPanelManager();
    const notesPanel = panelManager?.instance?.notesPanel;
    if (!notesPanel) return;
    
    try {
        // Check if this is the currently displayed page in notes panel
        if (notesPanel.element) {
            const currentPageId = notesPanel.element.find('.journal-content').data('page-id');
            if (currentPageId === page.id) {
                // Trigger a refresh through the PanelManager if it's available
                if (panelManager?.instance && panelManager.element) {
                    // Re-render the notes panel specifically
                    notesPanel.render(panelManager.element);
                }
            }
        }
    } catch (error) {
        console.error('Error routing to notes panel:', error);
    }
}

async function _routeToQuestPins(page, changes, options, userId) {
    try {
        // Handle quest-specific updates (visibility, pin updates, etc.)
        if (changes.flags && changes.flags[MODULE.ID] && changes.flags[MODULE.ID].visible !== undefined) {
            const isVisible = changes.flags[MODULE.ID].visible;
            
            // Update quest pins for this quest
            if (canvas.squirePins) {
                const questPins = canvas.squirePins.children.filter(child => 
                    child.constructor.name === 'QuestPin' && child.questUuid === page.uuid
                );
                
                questPins.forEach(pin => {
                    try {
                        // Update quest state
                        pin.questState = isVisible ? 'visible' : 'hidden';
                        
                        // Update pin appearance
                        if (pin._updatePinAppearance) {
                            pin._updatePinAppearance();
                        }
                        
                        // Update visibility
                        if (pin.updateVisibility) {
                            pin.updateVisibility();
                        }
                    } catch (error) {
                        console.error('Error updating quest pin state:', { error, pin, page });
                    }
                });
            }
        }
        
        // Handle quest content changes (objective states, quest status, etc.)
        if (changes.text && changes.text.content) {
            // Update quest status
            const statusMatch = changes.text.content.match(/## Quest Status:\s*(.+)/);
            const newStatus = statusMatch ? statusMatch[1].trim() : '';
            
            if (newStatus && canvas.squirePins) {
                const questPins = canvas.squirePins.children.filter(child => 
                    child.constructor.name === 'QuestPin' && child.questUuid === page.uuid
                );
                
                questPins.forEach(pin => {
                    try {
                        // Update quest status for quest-level pins
                        if (pin.pinType === 'quest' && pin.updateQuestStatus) {
                            pin.updateQuestStatus(newStatus);
                        }
                        
                        // Update objective states for objective pins
                        if (pin.pinType === 'objective') {
                            _updateQuestPinObjectiveStates(pin, page);
                        }
                    } catch (error) {
                        console.error('Error updating quest pin status:', { error, pin, page });
                    }
                });
            }
        }
        
        // Update pin visibility for all pins
        if (canvas.squirePins) {
            const pins = canvas.squirePins.children.filter(child => child.constructor.name === 'QuestPin');
            pins.forEach(pin => {
                try {
                    if (pin.updateVisibility) {
                        pin.updateVisibility();
                    }
                } catch (error) {
                    // Error updating pin visibility
                }
            });
        }
    } catch (error) {
        console.error('Error routing to quest pins:', error);
    }
}

// Helper function to update quest pin objective states
function _updateQuestPinObjectiveStates(pin, page) {
    try {
        if (pin.pinType === 'objective' && pin.objectiveIndex !== null && pin.objectiveIndex !== undefined) {
            // Parse the quest content to find the objective state
            const content = page.text?.content || '';
            const tasksMatch = content.match(/## Tasks:\s*([\s\S]*?)(?=##|$)/);
            
            if (tasksMatch) {
                const tasksHtml = tasksMatch[1];
                const li = tasksHtml.split('<li>')[pin.objectiveIndex + 1];
                
                if (li) {
                    let newState = 'active';
                    if (li.includes('<s>')) {
                        newState = 'completed';
                    } else if (li.includes('<code>')) {
                        newState = 'failed';
                    } else if (li.includes('<em>')) {
                        newState = 'hidden';
                    }
                    
                    if (pin.updateObjectiveState) {
                        pin.updateObjectiveState(newState);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error updating quest pin objective states:', { error, pin, page });
    }
}




// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

let socket;

// Move socketlib registration to its own hook
Hooks.once('socketlib.ready', () => {
    try {
        if (typeof socketlib === 'undefined') {
            throw new Error("Global socketlib variable is not defined");
        }

        socket = socketlib.registerModule(MODULE.ID);
        
        if (!socket) {
            throw new Error("Failed to register socket");
        }
        
        // Store socket in module API for access from other files
        game.modules.get(MODULE.ID).socket = socket;
        
        // HookManager is now exposed in the ready hook to ensure proper initialization order
        
        // Register socket functions with socket handlers
        socket.register("executeItemTransfer", async (data) => {
            if (!game.user.isGM) return false;
            
            try {
                // Get actors and item
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error('Missing actor data for transfer:', { data });
                    return false;
                }
                
                // Get the item and validate it still exists
                const sourceItem = sourceActor.items.get(data.sourceItemId);
                if (!sourceItem) {
                    console.error('Source item no longer exists for transfer:', { data });
                    // Send error message to all relevant users
                    const sourceUsers = game.users.filter(user => sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const targetUsers = game.users.filter(user => targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const allUsers = [...new Set([...sourceUsers.map(u => u.id), ...targetUsers.map(u => u.id), data.sourceUserId, data.targetUserId])].filter(id => id);
                    
                    await ChatMessage.create({
                        content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                            isPublic: false,
                            cardType: "transfer-failed",
                            failureReason: `The item "${data.itemName || 'Unknown Item'}" no longer exists and cannot be transferred.`
                        }),
                        speaker: { alias: "System" },
                        whisper: allUsers
                    });
                    return false;
                }
                
                // Validate quantity if applicable
                if (data.hasQuantity && data.quantity > sourceItem.system.quantity) {
                    console.error('Insufficient quantity for transfer:', { 
                        requested: data.quantity, 
                        available: sourceItem.system.quantity, 
                        data 
                    });
                    // Send error message to all relevant users
                    const sourceUsers = game.users.filter(user => sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const targetUsers = game.users.filter(user => targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const allUsers = [...new Set([...sourceUsers.map(u => u.id), ...targetUsers.map(u => u.id), data.sourceUserId, data.targetUserId])].filter(id => id);
                    
                    await ChatMessage.create({
                        content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                            isPublic: false,
                            cardType: "transfer-failed",
                            failureReason: `Insufficient quantity. Only ${sourceItem.system.quantity} ${sourceItem.name}${sourceItem.system.quantity !== 1 ? 's' : ''} available, but ${data.quantity} requested.`
                        }),
                        speaker: { alias: "System" },
                        whisper: allUsers
                    });
                    return false;
                }
                
                // Create a copy of the item data to transfer
                const itemData = sourceItem.toObject();
                
                // Set the correct quantity on the new item if applicable
                if (data.hasQuantity) {
                    itemData.system.quantity = data.quantity;
                }
                
                // Create the item on the target actor
                const transferredItem = await targetActor.createEmbeddedDocuments('Item', [itemData]);
                
                // Reduce quantity or remove the item from source actor
                if (data.hasQuantity && data.quantity < sourceItem.system.quantity) {
                    // Just reduce the quantity
                    await sourceItem.update({
                        'system.quantity': sourceItem.system.quantity - data.quantity
                    });
                } else {
                    // Remove the item entirely
                    await sourceItem.delete();
                }
                
                // Mark the item as newly added
                if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                    game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
                    await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
                }
                
                return true; // Success
                
            } catch (error) {
                console.error('Error executing item transfer:', error);
                return false;
            }
        });
        
        socket.register("createTransferRequestChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error('Missing required actors for transfer request message:', { data });
                    return;
                }

                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-request",
                        strCardIcon: data.isGMApproval ? "fas fa-gavel" : "fas fa-people-arrows",
                        strCardTitle: data.isGMApproval ? "GM Approval Required" : "Transfer Request",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural,
                        isTransferReceiver: data.isTransferReceiver || false,
                        isTransferSender: data.isTransferSender || false,
                        isGMApproval: data.isGMApproval || false,
                        transferId: data.transferId
                    }),
                    speaker: { alias: "System" },
                    whisper: data.receiverIds,
                    flags: {
                        [MODULE.ID]: {
                            transferId: data.transferId,
                            type: 'transferRequest',
                            isTransferReceiver: data.isTransferReceiver || false,
                            isTransferSender: data.isTransferSender || false,
                            isGMApproval: data.isGMApproval || false,
                            data: data.transferData,
                            targetUsers: data.receiverIds
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating transfer request message:', error);
            }
        });
        
        socket.register("setTransferRequestFlag", setTransferRequestFlag);
        socket.register("processTransferResponse", processTransferResponse);
        
        socket.register("createTransferCompleteChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error('Missing required actors for transfer complete message:', { data });
                    return;
                }
                
                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-complete",
                        strCardIcon: "fas fa-backpack",
                        strCardTitle: "Transfer Complete",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural,
                        isTransferSender: data.isTransferSender || false,
                        isTransferReceiver: data.isTransferReceiver || false,
                        isGMNotification: data.isGMNotification || false
                    }),
                    whisper: data.receiverIds || [data.receiverId] || [],
                    speaker: ChatMessage.getSpeaker({user: game.user}) // From GM
                });
            } catch (error) {
                console.error('Error creating transfer complete message:', error);
            }
        });

        socket.register("createTransferRejectedChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error('Missing required actors for transfer rejected message:', { data });
                    return;
                }
                
                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-rejected",
                        strCardIcon: "fas fa-times-circle",
                        strCardTitle: "Transfer Rejected",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural
                    }),
                    whisper: data.isTransferSender ? [data.receiverId] : data.receiverIds,
                    speaker: ChatMessage.getSpeaker({user: game.user}) // From GM
                });
            } catch (error) {
                console.error('Error creating transfer rejected message:', error);
            }
        });

        socket.register("createTransferExpiredChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error('Missing required actors for transfer expired message:', { data });
                    return;
                }
                
                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-expired",
                        strCardIcon: "fas fa-clock",
                        strCardTitle: "Transfer Request Expired",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural,
                        isTransferSender: data.isTransferSender || false,
                        isTransferReceiver: data.isTransferReceiver || false,
                        isGMNotification: data.isGMNotification || false
                    }),
                    whisper: data.receiverIds || [data.receiverId] || [],
                    speaker: ChatMessage.getSpeaker({user: game.user}) // From GM
                });
            } catch (error) {
                console.error('Error creating transfer expired message:', error);
            }
        });
        
        // Add socket handler for deleting transfer request messages
        socket.register("deleteTransferRequestMessage", async (messageId) => {
            if (!game.user.isGM) return;
            
            try {
                const message = game.messages.get(messageId);
                if (message) {
                    await message.delete();
                } else {
                    console.error(`Could not find message with ID ${messageId} to delete:`, { messageId });
                }
            } catch (error) {
                console.error('Error deleting transfer request message:', { messageId, error });
            }
        });
        
        // Add socket handler for deleting sender's waiting messages by transferId
        socket.register("deleteSenderWaitingMessage", async (transferId) => {
            if (!game.user.isGM) return;
            
            try {
                const senderWaitingMessage = game.messages.find(msg => 
                    msg.getFlag(MODULE.ID, 'transferId') === transferId && 
                    msg.getFlag(MODULE.ID, 'isTransferSender') === true
                );
                if (senderWaitingMessage) {
                    await senderWaitingMessage.delete();
                }
            } catch (error) {
                console.error('Error deleting sender waiting message:', { transferId, error });
            }
        });
        
    } catch (error) {
        console.error('Error during socketlib initialization:', error);
    }
});



Hooks.once('init', async function() {
    game.modules.get('coffee-pub-blacksmith')?.api?.utils?.postConsoleAndNotification(
        MODULE.NAME,
        `${MODULE.TITLE} | Initializing ${MODULE.TITLE}`,
        null,
        true,
        false
    );
    
    // Register module settings -- moved to READY
    //registerSettings();

    // Load CSS
    const cssFiles = [
        `modules/${MODULE.ID}/styles/window-transfer.css`,
        `modules/${MODULE.ID}/styles/panel-notes.css`
    ];
    
    // Add CSS files to head
    cssFiles.forEach(cssPath => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssPath;
        document.head.appendChild(link);
    });

    // Register handle-player template
    const handlePlayerTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-player.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-player', handlePlayerTemplate);
    
    // Register handle-party template
    const handlePartyTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-party.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-party', handlePartyTemplate);
    
    // Register handle-quest template
    const handleQuestTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-quest.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-quest', handleQuestTemplate);
    
    // Register handle-codex template
    const handleCodexTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-codex.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-codex', handleCodexTemplate);
    
    // Register handle-notes template
    const handleNotesTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-notes.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-notes', handleNotesTemplate);
    
    // Register quest-entry partial
    const questEntryPartial = await fetch(`modules/${MODULE.ID}/templates/partials/quest-entry.hbs`).then(response => response.text());
    Handlebars.registerPartial('quest-entry', questEntryPartial);
    
    // Register handle section partials with error handling
    const partials = [
        { name: 'handle-health', path: 'handle-health.hbs' },
        { name: 'handle-health-tray', path: 'handle-health-tray.hbs' },
        { name: 'handle-dice-tray', path: 'handle-dice-tray.hbs' },
        { name: 'handle-macros', path: 'handle-macros.hbs' },
        { name: 'handle-favorites', path: 'handle-favorites.hbs' },
        { name: 'handle-conditions', path: 'handle-conditions.hbs' },
        { name: 'handle-primary-stats', path: 'handle-primary-stats.hbs' },
        { name: 'handle-secondary-stats', path: 'handle-secondary-stats.hbs' }
    ];
    
    for (const partial of partials) {
        try {
            const partialContent = await fetch(`modules/${MODULE.ID}/templates/partials/${partial.path}`).then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${partial.path}: ${response.status} ${response.statusText}`);
                }
                return response.text();
            });
            Handlebars.registerPartial(partial.name, partialContent);
            console.log(`Coffee Pub Squire | Successfully registered ${partial.name} partial`);
        } catch (error) {
            console.error(`Coffee Pub Squire | Error registering ${partial.name} partial:`, error);
            // Register a fallback partial to prevent template errors
            Handlebars.registerPartial(partial.name, `{{!-- ${partial.name} partial failed to load --}}`);
        }
    }
    
    try {
        const handleCharacterPortraitPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-character-portrait.hbs`).then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch handle-character-portrait.hbs: ${response.status} ${response.statusText}`);
            }
            return response.text();
        });
        Handlebars.registerPartial('handle-character-portrait', handleCharacterPortraitPartial);
        console.log('Coffee Pub Squire | Successfully registered handle-character-portrait partial');
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering handle-character-portrait partial:', error);
        // Register a fallback partial to prevent template errors
        Handlebars.registerPartial('handle-character-portrait', '{{!-- Character portrait partial failed to load --}}');
    }
    
    // Set up API to expose PanelManager to other modules
    game.modules.get(MODULE.ID).api = {
        PanelManager
    };
    
    // Create and store PartyPanel instance
    game.modules.get(MODULE.ID).PartyPanel = new PartyPanel();

    // Add quest panel to panel manager
    PanelManager.prototype.initializePanels = function() {
        // ... existing code ...
        this.questPanel = new QuestPanel();
        // ... existing code ...
    };

    // Add quest panel to render
    PanelManager.prototype.render = function(element) {
        // ... existing code ...
        this.questPanel.render(element);
        // ... existing code ...
    };

    // Add quest form to Hooks
    window.QuestForm = QuestForm;
});

Hooks.once('ready', async function() {
    const blacksmith = getBlacksmith();
    if (!blacksmith) {
        console.error('Required dependency coffee-pub-blacksmith not found:', { blacksmith });
        return;
    }

    // Register module settings
    registerSettings();

    // Register dice tray with Blacksmith menubar
    try {
        const { openDiceTray } = await import('./panel-dicetray.js');
        
        const success = blacksmith.registerMenubarTool('squire-dice-tray', {
            icon: "fa-solid fa-dice-d20",
            name: "squire-dice-tray",
            title: "Dice Tray",
            zone: "middle",
            order: 5,
            moduleId: MODULE.ID,
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            onClick: openDiceTray
        });

        if (success) {
            console.log('Coffee Pub Squire | Successfully registered dice tray with Blacksmith menubar');
        } else {
            console.error('Coffee Pub Squire | Failed to register dice tray with Blacksmith menubar');
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering dice tray with Blacksmith menubar:', error);
    }

    // Register macros with Blacksmith menubar
    try {
        const { openMacros } = await import('./panel-macros.js');
        
        const success = blacksmith.registerMenubarTool('squire-macros', {
            icon: "fas fa-sun",
            name: "squire-macros",
            title: "Macros",
            zone: "middle",
            order: 6,
            moduleId: MODULE.ID,
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            onClick: openMacros
        });

        if (success) {
            console.log('Coffee Pub Squire | Successfully registered macros with Blacksmith menubar');
        } else {
            console.error('Coffee Pub Squire | Failed to register macros with Blacksmith menubar');
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering macros with Blacksmith menubar:', error);
    }


    // Check if current user is excluded - with safety check for setting registration
    let excludedUsers = [];
    try {
        const excludedUsersSetting = game.settings.get(MODULE.ID, 'excludedUsers');
        if (excludedUsersSetting) {
            excludedUsers = excludedUsersSetting.split(',').map(id => id.trim());
        }
    } catch (error) {
        // Setting not registered yet, treat as not excluded
        blacksmith.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Settings not yet registered, treating user as not excluded',
            { error },
            true,
            false
        );
    }
    
    const currentUserId = game.user.id;
    const currentUserName = game.user.name;
    
    // Check if user is excluded by either ID or name
    const isExcluded = excludedUsers.some(excluded => 
        excluded === currentUserId || excluded === currentUserName
    );



    if (isExcluded) {
        // Simply hide the tray with CSS
        const style = document.createElement('style');
        style.textContent = '.squire-tray { display: none !important; }';
        document.head.appendChild(style);
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
    


    // Initialize Squire after settings are registered (with delay to ensure everything is ready)
    setTimeout(async () => {
        // Hook management is now handled by Blacksmith HookManager
        // No need to initialize local HookManager
        
        // Load quest pins first
        loadPersistedPinsOnCanvasReady();
        
        // Register the controlToken hook AFTER settings are registered
        const controlTokenHookId = BlacksmithHookManager.registerHook({
            name: 'controlToken',
            description: 'Coffee Pub Squire: Handle token control for tray initialization',
            context: MODULE.ID,
            priority: 2,
            callback: async (token, controlled) => {
            // Only care about token selection, not deselection
            if (!controlled) return;
            
            // Only proceed if it's a GM or the token owner
            if (!game.user.isGM && !token.actor?.isOwner) return;
            
            await PanelManager.initialize(token.actor);
            }
        });
        
        // Then initialize the main interface
        const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        await PanelManager.initialize(firstOwnedToken?.actor || null);
        
        // Clean up old favorite flags from all actors (one-time migration)
        if (game.user.isGM) {
            const { FavoritesPanel } = await import('./panel-favorites.js');
            await FavoritesPanel.cleanupOldFavoriteFlags();
        }
        
        // Add console command for testing favorites system
        if (game.user.isGM) {
            window.testFavorites = async () => {
                const { FavoritesPanel } = await import('./panel-favorites.js');
                const currentActor = PanelManager.instance?.actor;
                if (!currentActor) {
                    getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, 'No actor selected.', '', false, false);
                    return;
                }

            };
            getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, 'Favorites system ready.', '', false, false);
        }
    }, 1000); // 1 second delay to ensure settings and canvas are fully ready
});

// All hook registrations moved to ready hook below

/**
 * Handle an incoming transfer request notification from another player
 * @param {Object} transferData The transfer request data
 */
async function handleTransferRequest(transferData) {
    try {
        // Get the actors and item involved
        const sourceActor = game.actors.get(transferData.sourceActorId);
        const targetActor = game.actors.get(transferData.targetActorId);
        const sourceItem = sourceActor.items.get(transferData.sourceItemId);
        
        if (!sourceActor || !targetActor || !sourceItem) {
            ui.notifications.error("Cannot process item transfer: Missing actor or item data");
            return;
        }
        
        // Create the request dialog
        const timestamp = transferData.timestamp;
        
        // Prepare template data for receiver's dialog
        const receiverTemplateData = {
            sourceItem,
            sourceActor,
            targetActor,
            maxQuantity: transferData.hasQuantity ? sourceItem.system.quantity : 1,
            timestamp,
            selectedQuantity: transferData.selectedQuantity,
            canAdjustQuantity: false,
            isReceiveRequest: true,
            hasQuantity: transferData.hasQuantity
        };
        
        // Render the transfer dialog template for the receiver
        const receiverContent = await renderTemplate(`modules/${MODULE.ID}/templates/window-transfer.hbs`, receiverTemplateData);
        
        // Play notification sound
        const blacksmith = getBlacksmith();
        if (blacksmith) {
            blacksmith.utils.playSound('notification', 0.7, false, false);
        }
        
        // Create a dialog to approve/reject the transfer
        let response = await new Promise(resolve => {
            new Dialog({
                title: "Item Transfer Request",
                content: receiverContent,
                buttons: {
                    accept: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Accept",
                        cssClass: "accept",
                        callback: () => resolve(true)
                    },
                    decline: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Decline",
                        cssClass: "decline",
                        callback: () => resolve(false)
                    }
                },
                default: "accept",
                close: () => resolve(false)
            }, {
                classes: ["transfer-item"],
                id: `transfer-item-request-${timestamp}`,
                width: 320,
                height: "auto"
            }).render(true);
        });
        
        // Send response back through socketlib
        if (game.modules.get('socketlib')?.active) {
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Notify the requester of the response
            socket.executeAsUser(
                'processTransferResponse', 
                transferData.requester, 
                { 
                    accepted: response,
                    transferData: transferData
                }
            );
            
            // If accepted, find a GM to execute the transfer
            if (response) {
                // Transfer processing is now handled by the socket handler executeItemTransfer
                // This legacy code path is no longer needed
                ui.notifications.info(`Transfer request processed.`);
            }
        } else {
            // No socketlib - notify the user to coordinate manually
            if (response) {
                ui.notifications.info(`You've accepted the transfer, but without socketlib module, the GM needs to manually execute the transfer.`);
            } else {
                ui.notifications.info(`You've declined the transfer.`);
            }
        }
        
        // Update the flag status if we have permission
        if (targetActor.isOwner) {
            try {
                await targetActor.setFlag(MODULE.ID, `transferRequest_${timestamp}`, {
                    ...transferData,
                    status: response ? 'accepted' : 'rejected'
                });
            } catch (error) {
                console.error('Error updating transfer request flag:', error);
            }
        } else if (game.modules.get('socketlib')?.active) {
            // Ask a GM to update the flag
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Find a GM to handle this
            const gmUsers = game.users.filter(u => u.isGM && u.active);
            if (gmUsers.length > 0) {
                const updatedFlagData = {
                    ...transferData,
                    status: response ? 'accepted' : 'rejected'
                };
                socket.executeAsGM('setTransferRequestFlag', targetActor.id, `transferRequest_${timestamp}`, updatedFlagData);
            }
        }
        
    } catch (error) {
        console.error('Error handling transfer request:', error);
        ui.notifications.error("Error processing transfer request");
    }
}

/**
 * Process the response from a transfer request
 * @param {Object} responseData The response data
 */
async function processTransferResponse(responseData) {
    const { accepted, transferData } = responseData;
    
    // If we have the transfer data, try to get the real actor names
    const targetActorName = game.actors.get(transferData.targetActorId)?.name || transferData.targetActorName;
    
    if (accepted) {
        ui.notifications.info(`${targetActorName} accepted your item transfer.`);
    } else {
        ui.notifications.warn(`${targetActorName} declined your item transfer.`);
    }
}

/**
 * Helper function to get an icon for item type
 */
function getIconForItemType(itemType) {
    switch(itemType) {
        case 'weapon': return 'fa-sword';
        case 'equipment': return 'fa-shield-alt';
        case 'consumable': return 'fa-flask';
        case 'tool': return 'fa-hammer';
        case 'backpack': return 'fa-backpack';
        case 'loot': return 'fa-coins';
        default: return 'fa-box';
    }
}

/**
 * Handler for setting transfer request flags on actors (GM only)
 * @param {string} targetActorId The ID of the target actor
 * @param {string} flagKey The flag key to set
 * @param {Object} flagData The flag data to set
 */
async function setTransferRequestFlag(targetActorId, flagKey, flagData) {
    if (!game.user.isGM) return;
    
    const targetActor = game.actors.get(targetActorId);
    if (!targetActor) {
        console.error(`Could not find actor with ID ${targetActorId}:`, { targetActorId });
        return;
    }
    
    await targetActor.setFlag(MODULE.ID, flagKey, flagData);
}


// Add this to your Handlebars helpers
Handlebars.registerHelper('getFlag', function(flags, itemId, flagName) {
    if (!flags || !itemId || !flagName) return false;
    return flags[itemId]?.[flagName] || false;
});

Handlebars.registerHelper('add', function(a, b) {
    return a + b;
});

function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

/**
 * Comprehensive cleanup function for the entire module
 */
function cleanupModule() {
    try {
        // Clean up HookManager
        if (HookManager.cleanup) {
            HookManager.cleanup();
        }

        // Clean up PanelManager
        if (PanelManager.cleanup) {
            PanelManager.cleanup();
        }

        // Clean up socket
        if (socket) {
            socket.close();
            socket = null;
        }

        // Remove any remaining DOM elements
        $('.squire-tray').remove();
        $('.squire-questpin-tooltip').remove();

        // Clear any remaining timeouts or intervals
        const highestTimeoutId = setTimeout(() => {}, 0);
        for (let i = 0; i < highestTimeoutId; i++) {
            clearTimeout(i);
        }

        const highestIntervalId = setInterval(() => {}, 0);
        for (let i = 0; i < highestIntervalId; i++) {
            clearInterval(i);
        }

        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Squire module cleanup completed',
            {},
            false,
            false
        );
    } catch (error) {
        console.error('Error during module cleanup:', error);
    }
}

// All hook registrations moved to ready hook below
