import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager, _updateHealthPanelFromSelection, _updateSelectionDisplay } from './manager-panel.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings } from './settings.js';
import { registerHelpers, renderTemplate } from './helpers.js';
import { QuestPanel } from './panel-quest.js';
import { QuestForm } from './window-quest.js';
import { QuestParser } from './utility-quest-parser.js';
import { QuestPin, loadPersistedPinsOnCanvasReady, loadPersistedPins } from './quest-pin.js';
import { FavoritesPanel } from './panel-favorites.js';
import { NotesForm } from './window-note.js';
import {
    getDefaultNotePinDesign,
    normalizeNoteIconFlag,
    normalizePinShape,
    normalizePinSize,
    normalizePinStyle,
    normalizePinTextColor,
    normalizePinTextDisplay,
    normalizePinTextLayout,
    normalizePinTextMaxLength,
    normalizePinTextScaleWithPin,
    normalizePinTextSize
} from './panel-notes.js';
import { trackModuleTimeout, clearAllModuleTimers } from './timer-utils.js';
// HookManager import removed - using Blacksmith HookManager instead




// ================================================================== 
// ===== BEGIN: BLACKSMITH API REGISTRATIONS ========================
// ================================================================== 
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

let nativeSelectObjects = null;
let wrappedSelectObjects = null;
let selectionUpdateFrameId = null;
let suppressNotesPanelRoute = false;

function queueSelectionDisplayUpdate() {
    if (selectionUpdateFrameId !== null) {
        return;
    }

    selectionUpdateFrameId = requestAnimationFrame(async () => {
        selectionUpdateFrameId = null;
        try {
            await _updateSelectionDisplay();
        } catch (error) {
            console.error('Coffee Pub Squire | Failed to update selection display:', error);
        }
    });
}

function normalizePinImageForNoteIcon(image) {
    if (!image || typeof image !== 'string') return null;
    const trimmed = image.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('<img')) {
        const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
        if (srcMatch?.[1]) {
            return { type: 'img', value: srcMatch[1] };
        }
        return null;
    }
    if (trimmed.startsWith('<i') && trimmed.includes('fa-')) {
        const classMatch = trimmed.match(/class=["']([^"']+)["']/i);
        if (classMatch?.[1]) {
            return { type: 'fa', value: classMatch[1] };
        }
    }
    return normalizeNoteIconFlag(trimmed);
}

async function updateNoteFlagsIfChanged(page, updates) {
    if (!page || !updates) return;
    const changes = {};
    const deepEqual = foundry?.utils?.deepEqual;
    for (const [key, value] of Object.entries(updates)) {
        const current = page.getFlag(MODULE.ID, key);
        const isEqual = typeof deepEqual === 'function'
            ? deepEqual(current, value)
            : JSON.stringify(current) === JSON.stringify(value);
        if (!isEqual) {
            changes[key] = value;
        }
    }

    if (Object.keys(changes).length) {
        await page.update({ flags: { [MODULE.ID]: changes } });
    }
}

function ensureSelectObjectsWrapper() {
    if (!canvas || typeof canvas.selectObjects !== 'function') {
        return;
    }

    const currentMethod = canvas.selectObjects;

    if (currentMethod === wrappedSelectObjects) {
        return;
    }

    nativeSelectObjects = currentMethod;

    wrappedSelectObjects = function(...args) {
        const result = nativeSelectObjects.apply(this, args);
        queueSelectionDisplayUpdate();
        return result;
    };

    canvas.selectObjects = wrappedSelectObjects;
}

Hooks.once('ready', () => {
    try {
        // Register your module with Blacksmith
        BlacksmithModuleManager.registerModule(MODULE.ID, {
            name: MODULE.NAME,
            version: MODULE.VERSION
        });
        // Module registered with Blacksmith successfully

        Hooks.on('blacksmith.pins.updated', async ({ pinId, sceneId, moduleId, pin }) => {
            if (moduleId !== MODULE.ID) return;
            const noteUuid = pin?.config?.noteUuid;
            if (!noteUuid) return;

            suppressNotesPanelRoute = true;
            try {
                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) return;
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    return;
                }

                const defaultDesign = getDefaultNotePinDesign();
                const icon = normalizePinImageForNoteIcon(pin?.image);
                await updateNoteFlagsIfChanged(page, {
                    pinId: pinId ?? page.getFlag(MODULE.ID, 'pinId'),
                    sceneId: sceneId ?? page.getFlag(MODULE.ID, 'sceneId'),
                    x: pin?.x !== undefined ? pin.x : page.getFlag(MODULE.ID, 'x'),
                    y: pin?.y !== undefined ? pin.y : page.getFlag(MODULE.ID, 'y'),
                    noteIcon: icon || null,
                    notePinSize: normalizePinSize(pin?.size) || defaultDesign.size,
                    notePinShape: normalizePinShape(pin?.shape) || defaultDesign.shape,
                    notePinStyle: normalizePinStyle(pin?.style) || defaultDesign.style,
                    notePinDropShadow: typeof pin?.dropShadow === 'boolean' ? pin.dropShadow : defaultDesign.dropShadow,
                    notePinTextLayout: normalizePinTextLayout(pin?.textLayout) || defaultDesign.textLayout,
                    notePinTextDisplay: normalizePinTextDisplay(pin?.textDisplay) || defaultDesign.textDisplay,
                    notePinTextColor: normalizePinTextColor(pin?.textColor) || defaultDesign.textColor,
                    notePinTextSize: normalizePinTextSize(pin?.textSize) || defaultDesign.textSize,
                    notePinTextMaxLength: normalizePinTextMaxLength(pin?.textMaxLength) ?? defaultDesign.textMaxLength,
                    notePinTextScaleWithPin: normalizePinTextScaleWithPin(pin?.textScaleWithPin) ?? defaultDesign.textScaleWithPin
                });

                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                if (panelManager?.notesPanel && panelManager.element) {
                    panelManager.notesPanel._suppressPinOwnershipSync = true;
                    await panelManager.notesPanel._refreshData();
                    panelManager.notesPanel.render(panelManager.element);
                    panelManager.notesPanel._suppressPinOwnershipSync = false;
                }
            } finally {
                suppressNotesPanelRoute = false;
            }
        });

        Hooks.on('blacksmith.pins.deleted', async ({ pinId, sceneId, moduleId, pin, config }) => {
            if (moduleId !== MODULE.ID) return;
            const noteUuid = config?.noteUuid || pin?.config?.noteUuid;
            if (!noteUuid) return;

            suppressNotesPanelRoute = true;
            try {
                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) return;
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    return;
                }

                if (pinId && page.getFlag(MODULE.ID, 'pinId') !== pinId) {
                    return;
                }

                await updateNoteFlagsIfChanged(page, {
                    pinId: null,
                    sceneId: null,
                    x: null,
                    y: null
                });

                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                if (panelManager?.notesPanel && panelManager.element) {
                    panelManager.notesPanel._suppressPinOwnershipSync = true;
                    await panelManager.notesPanel._refreshData();
                    panelManager.notesPanel.render(panelManager.element);
                    panelManager.notesPanel._suppressPinOwnershipSync = false;
                }
            } finally {
                suppressNotesPanelRoute = false;
            }
        });

        Hooks.on('blacksmith.pins.deletedAll', async ({ moduleId }) => {
            if (moduleId && moduleId !== MODULE.ID) return;
            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (panelManager?.notesPanel && panelManager.element) {
                suppressNotesPanelRoute = true;
                panelManager.notesPanel._suppressPinOwnershipSync = true;
                await panelManager.notesPanel._cleanupMissingPins();
                panelManager.notesPanel._suppressPinOwnershipSync = false;
                suppressNotesPanelRoute = false;
            }
        });

        Hooks.on('blacksmith.pins.deletedAllByType', async ({ moduleId }) => {
            if (moduleId && moduleId !== MODULE.ID) return;
            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (panelManager?.notesPanel && panelManager.element) {
                suppressNotesPanelRoute = true;
                panelManager.notesPanel._suppressPinOwnershipSync = true;
                await panelManager.notesPanel._cleanupMissingPins();
                panelManager.notesPanel._suppressPinOwnershipSync = false;
                suppressNotesPanelRoute = false;
            }
        });
        
        // Register all hooks after Blacksmith is ready
        const renderActorSheet5eHookId = BlacksmithHookManager.registerHook({
            name: 'renderActorSheet5e',
            description: 'Coffee Pub Squire: Initialize tray when character sheet is rendered',
            context: MODULE.ID,
            priority: 2,
            callback: async (app, html, data) => {
                if (!app.actor) return;
                const panelManager = getPanelManager();
                if (panelManager?.instance?._suppressSheetRender) {
                    panelManager.instance._suppressSheetRender = false;
                    return;
                }
                await PanelManager.initialize(app.actor);
            }
        });
        
        const canvasInitHookId = BlacksmithHookManager.registerHook({
            name: 'canvasInit',
            description: 'Coffee Pub Squire: Create squirePins container on canvas initialization',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // CanvasInit hook called
                if (!canvas.squirePins) {
                    // Creating squirePins container
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
                    // squirePins container created
                }
            }
        });
        
        const canvasReadyHookId = BlacksmithHookManager.registerHook({
            name: 'canvasReady',
            description: 'Coffee Pub Squire: Ensure squirePins container is properly positioned and handle canvas selection',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // CanvasReady hook called
                if (!canvas.squirePins) {
                    // Creating squirePins container in canvasReady
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
                    // squirePins container created in canvasReady
                }
                
                // Move squirePins to top of display order
                if (canvas.squirePins) {
                    const parent = canvas.squirePins.parent;
                    if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
                        parent.addChild(canvas.squirePins);
                    }
                    canvas.squirePins.interactive = true;
                    // squirePins container positioned and interactive
                }

                // Monitor canvas selection changes for bulk selection support
                ensureSelectObjectsWrapper();
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

        // Hook for creating journal pages (for notes)
        const createJournalPageHookId = BlacksmithHookManager.registerHook({
            name: "createJournalEntryPage",
            description: "Coffee Pub Squire: Handle journal entry page creation for notes panel",
            context: MODULE.ID,
            priority: 2,
            callback: async (page, options, userId) => {
                // Route to notes panel when a new page is created
                await _routeToNotesPanel(page, {}, options, userId);
            }
        });

        // Hook for deleting journal pages (for notes)
        const deleteJournalPageHookId = BlacksmithHookManager.registerHook({
            name: "deleteJournalEntryPage",
            description: "Coffee Pub Squire: Handle journal entry page deletion for notes panel",
            context: MODULE.ID,
            priority: 2,
            callback: async (page, options, userId) => {
                // Route to notes panel when a page is deleted
                await _routeToNotesPanel(page, {}, options, userId);
            }
        });

        // Hook to embed note metadata box in journal entry page sheet
        // Try multiple hook names for compatibility
        const renderJournalPageSheetHookId = BlacksmithHookManager.registerHook({
            name: "renderJournalPageSheet",
            description: "Coffee Pub Squire: Embed note metadata box in journal entry page sheet",
            context: MODULE.ID,
            priority: 2,
            callback: async (sheet, html, data) => {
                await _embedNoteMetadataBox(sheet, html, data);
            }
        });
        
        // Also try renderApplication hook with filter
        const renderApplicationHookId = BlacksmithHookManager.registerHook({
            name: "renderApplication",
            description: "Coffee Pub Squire: Embed note metadata box in journal entry page sheet (via renderApplication)",
            context: MODULE.ID,
            priority: 2,
            callback: async (app, html, data) => {
                // Check if this is a JournalPageSheet
                if (app?.constructor?.name === 'JournalPageSheet' || app?.object?.constructor?.name === 'JournalEntryPage') {
                    await _embedNoteMetadataBox(app, html, data);
                }
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
        // Multi-select tracking variables
        let _multiSelectTimeout = null;
        let _lastSelectionTime = 0;
        let _selectionCount = 0;
        
        const globalControlTokenHookId = BlacksmithHookManager.registerHook({
            name: "controlToken",
            description: "Coffee Pub Squire: Handle global token control for selection display",
            context: MODULE.ID,
            priority: 2,
            callback: async (token, controlled) => {
                // Only proceed if it's a GM or the token owner
                if (!game.user.isGM && !token.actor?.isOwner) return;
                
                // Simple approach: just update selection display, skip expensive operations
                await _updateSelectionDisplay();
            }
        });
        
        const globalCreateItemHookId = BlacksmithHookManager.registerHook({
            name: "createItem",
            description: "Coffee Pub Squire: Handle global item creation for tray updates and auto-favoriting",
            context: MODULE.ID,
            priority: 2,
            callback: async (item) => {
                const panelManager = getPanelManager();
                
                // Check if this item belongs to an actor that the current user owns
                if (item.parent && item.parent.isOwner) {
                    // Check if this is an NPC/monster and trigger auto-favoring if needed
                    if (item.parent.type !== "character") {
                        // Check if actor is from a compendium before trying to modify it
                        const isFromCompendium = item.parent.pack || (item.parent.collection && item.parent.collection.locked);
                        if (!isFromCompendium) {
                            // Try to initialize NPC favorites (will only work if actor has no favorites yet)
                            await FavoritesPanel.initializeNpcFavorites(item.parent);
                        }
                    }
                    
                    // Only refresh panels if PanelManager instance exists
                    if (panelManager?.instance) {
                        // Only refresh weapons and inventory panels for item transfers
                        if (panelManager.instance.weaponsPanel?.element) {
                            await panelManager.instance.weaponsPanel.render(panelManager.instance.weaponsPanel.element);
                        }
                        if (panelManager.instance.inventoryPanel?.element) {
                            await panelManager.instance.inventoryPanel.render(panelManager.instance.inventoryPanel.element);
                        }
                        await panelManager.instance.updateHandle();
                    }
                }
            }
        });
        
        const globalUpdateItemHookId = BlacksmithHookManager.registerHook({
            name: "updateItem",
            description: "Coffee Pub Squire: Handle global item updates for tray updates and auto-favoriting",
            context: MODULE.ID,
            priority: 2,
            callback: async (item, changes) => {
                if (!item.parent) return;
                
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // Check if this is an NPC/monster and the item is a weapon being equipped
                // or a spell being prepared
                if (item.parent.type !== "character") {
                    // Check if actor is from a compendium before trying to modify it
                    const isFromCompendium = item.parent.pack || (item.parent.collection && item.parent.collection.locked);
                    if (isFromCompendium) {
                        // Skip auto-favoriting for actors from compendiums
                    } else {
                        // For weapons, check if equipped status changed to true
                        if (item.type === "weapon" && item.system.equipped === true) {
                            // Add to favorites if it's now equipped
                            await FavoritesPanel.manageFavorite(item.parent, item.id);
                        }
                        // For spells, check if prepared status changed to true
                        else if (item.type === "spell" && item.system.method === "prepared" && item.system.prepared === true) {
                            // Add to favorites if it's now prepared
                            await FavoritesPanel.manageFavorite(item.parent, item.id);
                        }
                    }
                }
                
                // Refresh relevant panels when items are updated
                // Check if the update affects inventory/weapons (quantity, equipped status, etc.)
                const affectsInventory = ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type);
                const affectsWeapons = item.type === 'weapon';
                
                if (affectsInventory || affectsWeapons) {
                    // Refresh the appropriate panels
                    if (affectsWeapons && panelManager.instance.weaponsPanel?.element) {
                        await panelManager.instance.weaponsPanel.render(panelManager.instance.weaponsPanel.element);
                    }
                    if (affectsInventory && panelManager.instance.inventoryPanel?.element) {
                        await panelManager.instance.inventoryPanel.render(panelManager.instance.inventoryPanel.element);
                    }
                    // Also update favorites panel if item favorite status might have changed
                    if (panelManager.instance.favoritesPanel?.element) {
                        await panelManager.instance.favoritesPanel.render(panelManager.instance.favoritesPanel.element);
                    }
                }
                
                // Always update the handle to reflect any changes
                await panelManager.instance.updateHandle();
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
                
                const actor = item.parent;
                const itemId = item.id;
                
                // Remove item from favorites if it's favorited
                const panelFavorites = FavoritesPanel.getPanelFavorites(actor);
                if (panelFavorites.includes(itemId)) {
                    // Remove from panel favorites
                    const newPanelFavorites = panelFavorites.filter(id => id !== itemId);
                    await actor.setFlag(MODULE.ID, 'favoritePanel', newPanelFavorites);
                    
                    // Also remove from handle favorites if present
                    await FavoritesPanel.removeHandleFavorite(actor, itemId);
                }
                
                // Refresh all panels for item deletions
                if (panelManager?.instance) {
                    if (panelManager.instance.weaponsPanel?.element) {
                        await panelManager.instance.weaponsPanel.render(panelManager.instance.weaponsPanel.element);
                    }
                    if (panelManager.instance.inventoryPanel?.element) {
                        await panelManager.instance.inventoryPanel.render(panelManager.instance.inventoryPanel.element);
                    }
                    if (panelManager.instance.favoritesPanel?.element) {
                        await panelManager.instance.favoritesPanel.render(panelManager.instance.favoritesPanel.element);
                    }
                    await panelManager.instance.updateHandle();
                }
            }
        });
        
        const globalCreateActiveEffectHookId = BlacksmithHookManager.registerHook({
            name: "createActiveEffect",
            description: "Coffee Pub Squire: Handle global active effect creation for handle updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (effect, options, userId) => {
                const panelManager = getPanelManager();
                // Only process if this effect belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== effect.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
            }
        });
        
        const globalDeleteActiveEffectHookId = BlacksmithHookManager.registerHook({
            name: "deleteActiveEffect",
            description: "Coffee Pub Squire: Handle global active effect deletion for handle updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (effect, options, userId) => {
                const panelManager = getPanelManager();
                // Only process if this effect belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== effect.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
            }
        });
        
        const globalUpdateActorHookId = BlacksmithHookManager.registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle global actor updates",
            context: MODULE.ID,
            priority: 2,
            callback: async (actor, changes) => {
                const panelManager = getPanelManager();
                // Only process if this is the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== actor.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // Only handle major changes that require full re-initialization
                const needsFullUpdate = changes.name || // Name change
                                       changes.img || // Image change
                                       changes.system?.attributes?.prof || // Proficiency change
                                       changes.system?.details?.level || // Level change
                                       changes.system?.attributes?.ac || // AC change
                                       changes.system?.attributes?.movement; // Movement change

                if (needsFullUpdate) {
                    await panelManager.initialize(actor);
                    // Force a re-render of all panels
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                    await panelManager.instance.updateHandle();
                }
                // For health, effects, and spell slot changes, update appropriately
                else {
                    // Handle health and effects changes
                    if (changes.system?.attributes?.hp || changes.effects) {
                        await panelManager.instance.updateHandle();
                    }
                    // Handle spell slot changes
                    if (changes.system?.spells) {
                        // Re-render just the spells panel
                        if (panelManager.instance.spellsPanel?.element) {
                            await panelManager.instance.spellsPanel.render(panelManager.instance.spellsPanel.element);
                        }
                    } else {
                        // For other changes, just update the handle
                        await panelManager.instance.updateHandle();
                    }
                }
            }
        });
        
        const globalDeleteTokenHookId = BlacksmithHookManager.registerHook({
            name: "deleteToken",
            description: "Coffee Pub Squire: Handle global token deletion",
            context: MODULE.ID,
            priority: 2,
            callback: async (token) => {
                const panelManager = getPanelManager();
                if (panelManager?.currentActor?.id === token.actor?.id) {
                    // Try to find another token to display
                    const nextToken = canvas.tokens?.placeables.find(t => t.actor?.isOwner);
                    if (nextToken) {
                        // Add fade-out animation to tray panel wrapper if appropriate
                        if (panelManager.instance) {
                            panelManager.instance._applyFadeOutAnimation();
                        }
                        
                        // Update the actor without recreating the tray
                        panelManager.currentActor = nextToken.actor;
                        if (panelManager.instance) {
                            panelManager.instance.actor = nextToken.actor;
                            
                            // Update the actor reference in all panel instances
                            if (panelManager.instance.characterPanel) panelManager.instance.characterPanel.actor = nextToken.actor;
                            if (panelManager.instance.controlPanel) panelManager.instance.controlPanel.actor = nextToken.actor;
                            if (panelManager.instance.favoritesPanel) panelManager.instance.favoritesPanel.actor = nextToken.actor;
                            if (panelManager.instance.spellsPanel) panelManager.instance.spellsPanel.actor = nextToken.actor;
                            if (panelManager.instance.weaponsPanel) panelManager.instance.weaponsPanel.actor = nextToken.actor;
                            if (panelManager.instance.inventoryPanel) panelManager.instance.inventoryPanel.actor = nextToken.actor;
                            if (panelManager.instance.featuresPanel) panelManager.instance.featuresPanel.actor = nextToken.actor;
                            if (panelManager.instance.experiencePanel) panelManager.instance.experiencePanel.actor = nextToken.actor;
                            if (panelManager.instance.statsPanel) panelManager.instance.statsPanel.actor = nextToken.actor;
                            if (panelManager.instance.abilitiesPanel) panelManager.instance.abilitiesPanel.actor = nextToken.actor;
                            if (panelManager.instance.dicetrayPanel) panelManager.instance.dicetrayPanel.actor = nextToken.actor;
                            if (panelManager.instance.macrosPanel) panelManager.instance.macrosPanel.actor = nextToken.actor;
                            
                            // Update the handle manager's actor reference
                            if (panelManager.instance.handleManager) {
                                panelManager.instance.handleManager.updateActor(nextToken.actor);
                            }
                            
                            await panelManager.instance.updateHandle();
                            
                            // Re-render all panels with the new actor data
                            await panelManager.instance.renderPanels(panelManager.instance.element);
                            
                            // Add fade-in animation to tray panel wrapper after update if appropriate
                            if (panelManager.instance) {
                                panelManager.instance._applyFadeInAnimation();
                            }
                            
                            // Re-attach event listeners to ensure tray functionality works
                        }
                    } else {
                        // No more tokens, clear the instance
                        panelManager.instance = null;
                        panelManager.currentActor = null;
                    }
                }
            }
        });
        
        const globalPauseGameHookId = BlacksmithHookManager.registerHook({
            name: "pauseGame",
            description: "Coffee Pub Squire: Handle global game pause/unpause",
            context: MODULE.ID,
            priority: 2,
            callback: async (paused) => {
                const panelManager = getPanelManager();
                if (!paused && panelManager?.instance && panelManager.instance.element) {
                    await panelManager.instance.renderPanels(panelManager.instance.element);
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
                trackModuleTimeout(() => {
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
                    trackModuleTimeout(() => {
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
        
        const globalCreateTokenHookId = BlacksmithHookManager.registerHook({
            name: "createToken",
            description: "Coffee Pub Squire: Handle global token creation",
            context: MODULE.ID,
            priority: 2,
            callback: async (token) => {
                // Only process if this token is owned by the user
                if (!token.actor?.isOwner) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                const panelManager = getPanelManager();
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
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
        
        // All hooks registered with Blacksmith successfully
    } catch (error) {
        console.error('❌ Failed to register ' + MODULE.NAME + ' with Blacksmith:', error);
    }
});
// ================================================================== 
// ===== END: BLACKSMITH API REGISTRATIONS ==========================
// ================================================================== 

// Canvas hooks use native FoundryVTT hooks as Blacksmith timing for canvas events is unreliable
Hooks.on('canvasInit', () => {
    // Native CanvasInit hook called
    if (!canvas.squirePins) {
        // Creating squirePins container via native hook
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
        // squirePins container created via native hook
    }
});

Hooks.on('canvasReady', () => {
    // Native CanvasReady hook called
    if (!canvas.squirePins) {
        // Creating squirePins container via native canvasReady
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
        // squirePins container created via native canvasReady
    }
    
    // Move squirePins to top of display order
    if (canvas.squirePins) {
        const parent = canvas.squirePins.parent;
        if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
            parent.addChild(canvas.squirePins);
        }
        canvas.squirePins.interactive = true;
        // squirePins container positioned and interactive via native hook
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
    if (suppressNotesPanelRoute) return;
    
    try {
        // Check if this is a note (has noteType flag)
        const noteType = page.getFlag(MODULE.ID, 'noteType');
        if (noteType !== 'sticky') {
            // Not a note, ignore it
            return;
        }
        
        // Check if this page belongs to the notes journal
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') return;
        
        const journal = game.journal.get(journalId);
        if (!journal || page.parent.id !== journal.id) {
            // Page doesn't belong to notes journal
            return;
        }
        
        // Refresh the notes panel
        if (panelManager?.instance && panelManager.element) {
            await notesPanel._refreshData();
            notesPanel.render(panelManager.element);
        }
    } catch (error) {
        console.error('Error routing to notes panel:', error);
    }
}

/**
 * Embed note metadata box in journal entry page sheet
 * @private
 */
async function _embedNoteMetadataBox(sheet, html, data) {
    try {
        
        // Only show for notes journal
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        if (!journalId || journalId === 'none') {
            return;
        }
        
        // For JournalEntrySheet, we need to get the current page being viewed
        let page = sheet?.object;
        if (!page && sheet?.pages) {
            // This is a JournalEntrySheet, get the active page
            const activePageId = sheet.pages?.active;
            if (activePageId) {
                page = sheet.pages?.get(activePageId);
            }
        }
        
        if (!page) {
            return;
        }
        
        if (!page.parent) {
            return;
        }
        
        // Check if this page belongs to the notes journal
        if (page.parent.id !== journalId) {
            return;
        }
        
        
        // Check if this is a note (has noteType flag) or if we're creating a new page
        const noteType = page.getFlag(MODULE.ID, 'noteType');
        const isNote = noteType === 'sticky';
        
        // If it's a new page without noteType, set it
        if (!isNote && page.id) {
            try {
                await page.setFlag(MODULE.ID, 'noteType', 'sticky');
                if (!page.getFlag(MODULE.ID, 'authorId')) {
                    await page.setFlag(MODULE.ID, 'authorId', game.user.id);
                }
                if (!page.getFlag(MODULE.ID, 'timestamp')) {
                    await page.setFlag(MODULE.ID, 'timestamp', new Date().toISOString());
                }
                if (!page.getFlag(MODULE.ID, 'visibility')) {
                    await page.setFlag(MODULE.ID, 'visibility', 'private');
                }
                if (!page.getFlag(MODULE.ID, 'tags')) {
                    await page.setFlag(MODULE.ID, 'tags', []);
                }
            } catch (error) {
                console.error('_embedNoteMetadataBox: Error setting flags:', error);
            }
        }
        
        // Get note metadata from flags - read directly for reliability
        const tags = page.getFlag(MODULE.ID, 'tags') || [];
        const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
        const authorId = page.getFlag(MODULE.ID, 'authorId') || game.user.id;
        
        // Ensure tags is an array
        const tagsArray = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []);
        
        // Look up author name
        let authorName = 'Unknown';
        if (authorId) {
            try {
                let user = game.users.get(authorId);
                if (!user) user = game.users.find(u => u.id === authorId);
                authorName = user?.name || authorId;
            } catch (e) {
                authorName = authorId;
            }
        }
        
        // Convert jQuery/html to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        if (!nativeHtml || !nativeHtml.querySelector) {
            // Try getting native element from jQuery
            if (html && html.length) nativeHtml = html[0];
            if (!nativeHtml) return;
        }
        
        
        // Find where to insert the meta box (after title, before content)
        // Try multiple selectors for different Foundry versions
        const titleElement = nativeHtml.querySelector('.journal-entry-page-title, .journal-page-title, .page-title, h1.page-title, h1');
        const contentArea = nativeHtml.querySelector('.journal-entry-content, .editor-content, .editor, .editor-edit, textarea[name="text.content"]');
        
        // Escape HTML in values
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        
        // Create meta box HTML
        const metaBoxHtml = `
            <div class="squire-note-metadata-box" data-page-id="${page.id}">
                <div class="squire-note-meta-header">
                    <i class="fa-solid fa-sticky-note"></i> Note Metadata
                </div>
                <div class="squire-note-meta-fields">
                    <div class="squire-note-meta-field">
                        <label>Tags:</label>
                        <input type="text" class="squire-note-tags-input" 
                               value="${escapeHtml(tagsArray.join(', '))}" 
                               placeholder="npc, phlan, informant">
                        <small>Comma-separated tags</small>
                    </div>
                    <div class="squire-note-meta-field">
                        <label>Visibility:</label>
                        <div class="squire-note-visibility-options">
                            <label>
                                <input type="radio" name="squire-note-visibility-${page.id}" value="private" ${visibility === 'private' ? 'checked' : ''}>
                                <i class="fa-solid fa-lock"></i> Private
                            </label>
                            <label>
                                <input type="radio" name="squire-note-visibility-${page.id}" value="party" ${visibility === 'party' ? 'checked' : ''}>
                                <i class="fa-solid fa-users"></i> Party
                            </label>
                        </div>
                    </div>
                    <div class="squire-note-meta-field">
                        <label>Author:</label>
                        <span class="squire-note-author">${escapeHtml(authorName)}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Create DOM element from HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = metaBoxHtml;
        const metaBoxElement = tempDiv.firstElementChild;
        
        // Insert meta box
        let inserted = false;
        if (titleElement && titleElement.parentNode) {
            titleElement.parentNode.insertBefore(metaBoxElement, titleElement.nextSibling);
            inserted = true;
        } else if (contentArea && contentArea.parentNode) {
            contentArea.parentNode.insertBefore(metaBoxElement, contentArea);
            inserted = true;
        } else {
            // Fallback: insert at top of sheet content
            const sheetContent = nativeHtml.querySelector('.sheet-content, .window-content, form');
            if (sheetContent) {
                sheetContent.insertBefore(metaBoxElement, sheetContent.firstChild);
                inserted = true;
            } else {
            }
        }
        
        if (!inserted) {
            console.error('_embedNoteMetadataBox: Failed to insert meta box!');
            return;
        }
        
        // Set up event listeners for meta box
        const metaBox = nativeHtml.querySelector('.squire-note-metadata-box');
        if (metaBox) {
            // Handle tags input
            const tagsInput = metaBox.querySelector('.squire-note-tags-input');
            if (tagsInput) {
                const handleTagsChange = async function() {
                    const tagsValue = this.value;
                    const tagsArray = tagsValue.split(',').map(t => t.trim()).filter(t => t);
                    await page.setFlag(MODULE.ID, 'tags', tagsArray);
                    // Ensure noteType is set
                    if (!isNote) {
                        await page.setFlag(MODULE.ID, 'noteType', 'sticky');
                    }
                };
                tagsInput.addEventListener('change', handleTagsChange);
                tagsInput.addEventListener('blur', handleTagsChange);
            }
            
            // Handle visibility radio buttons
            const visibilityRadios = metaBox.querySelectorAll('input[name^="squire-note-visibility"]');
            visibilityRadios.forEach(radio => {
                radio.addEventListener('change', async function() {
                    const newVisibility = this.value;
                    await page.setFlag(MODULE.ID, 'visibility', newVisibility);
                    // Ensure noteType is set
                    if (!isNote) {
                        await page.setFlag(MODULE.ID, 'noteType', 'sticky');
                    }
                    // Update ownership if GM
                    if (game.user.isGM) {
                        const ownership = {};
                        ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                        ownership.default = newVisibility === 'party' 
                            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER 
                            : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
                        await page.update({ ownership });
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error embedding note metadata box:', error);
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
        if (changes.text && changes.text.content && canvas.squirePins) {
            const updatedContent = changes?.text?.content ?? page.text?.content ?? '';
            let newStatus = '';

            // Check for markdown-style status first ("## Quest Status: ...")
            const markdownStatus = updatedContent.match(/## Quest Status:\s*(.+)/);
            if (markdownStatus) {
                newStatus = markdownStatus[1].trim();
            } else {
                // Fallback to HTML structure "<strong>Status:</strong> ..."
                const htmlStatus = updatedContent.match(/<strong>Status:<\/strong>\s*([^<]*)/i);
                if (htmlStatus) {
                    newStatus = htmlStatus[1].trim();
                }
            }

            const questPins = canvas.squirePins.children.filter(child => 
                child.constructor.name === 'QuestPin' && child.questUuid === page.uuid
            );
            
            questPins.forEach(pin => {
                try {
                    // Update quest status for quest-level pins when we have it
                    if (pin.pinType === 'quest' && newStatus && pin.updateQuestStatus) {
                        pin.updateQuestStatus(newStatus);
                    }
                    
                    // Update objective states for objective pins regardless of quest status
                    if (pin.pinType === 'objective') {
                        _updateQuestPinObjectiveStates(pin, updatedContent);
                    }
                } catch (error) {
                    console.error('Error updating quest pin status:', { error, pin, page });
                }
            });
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
function _updateQuestPinObjectiveStates(pin, pageContent) {
    try {
        if (pin.pinType === 'objective' && pin.objectiveIndex !== null && pin.objectiveIndex !== undefined) {
            // Parse the quest content to find the objective state
            const content = pageContent || '';
            let listItems = [];

            // Attempt to match markdown-style tasks first
            const markdownMatch = content.match(/## Tasks:\s*([\s\S]*?)(?=##|$)/);
            if (markdownMatch) {
                const tasksHtml = markdownMatch[1];
                const parser = new DOMParser();
                const doc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                listItems = Array.from(doc.querySelectorAll('li'));
            }

            // If markdown match failed, look for HTML structure
            if (!listItems.length) {
                const htmlMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
                if (htmlMatch) {
                    const tasksHtml = htmlMatch[1];
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                    listItems = Array.from(doc.querySelectorAll('li'));
                }
            }

            // Final fallback: parse full document and locate the Tasks section
            if (!listItems.length) {
                const parser = new DOMParser();
                const fullDoc = parser.parseFromString(content, 'text/html');
                const strongTags = Array.from(fullDoc.querySelectorAll('strong'));
                const tasksStrong = strongTags.find(tag => tag.textContent.trim().toUpperCase() === 'TASKS:');

                if (tasksStrong) {
                    const parentParagraph = tasksStrong.closest('p');
                    const potentialList = parentParagraph?.nextElementSibling;
                    if (potentialList && potentialList.tagName === 'UL') {
                        listItems = Array.from(potentialList.querySelectorAll('li'));
                    }
                }
            }

            const li = listItems[pin.objectiveIndex];
            if (li) {
                let newState = 'active';
                if (li.querySelector('s, del, strike')) {
                    newState = 'completed';
                } else if (li.querySelector('code')) {
                    newState = 'failed';
                } else if (li.querySelector('em, i')) {
                    newState = 'hidden';
                }
                
                if (pin.updateObjectiveState) {
                    pin.updateObjectiveState(newState);
                }
            }
        }
    } catch (error) {
        console.error('Error updating quest pin objective states:', { error, pin });
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
                        strCardIcon: data.isGMApproval ? "fa-solid fa-gavel" : "fa-solid fa-people-arrows",
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
                        strCardIcon: "fa-solid fa-backpack",
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
                        strCardIcon: "fa-solid fa-times-circle",
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
                        strCardIcon: "fa-solid fa-clock",
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
    
    // Register module settings
    //registerSettings();

    // CSS is loaded via styles/default.css imports.

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
            // Successfully registered partial
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
        // Successfully registered handle-character-portrait partial
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering handle-character-portrait partial:', error);
        // Register a fallback partial to prevent template errors
        Handlebars.registerPartial('handle-character-portrait', '{{!-- Character portrait partial failed to load --}}');
    }
    
    // Set up API to expose PanelManager and NotesForm to other modules
    game.modules.get(MODULE.ID).api = {
        PanelManager,
        NotesForm,
        openNotesForm: (options = {}) => {
            const form = new NotesForm(null, options);
            form.render(true);
            return form;
        }
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
    
    // Add NotesForm to window for console access
    window.NotesForm = NotesForm;
});

Hooks.once('ready', async function() {
    const blacksmith = getBlacksmith();
    if (!blacksmith) {
        console.error('Required dependency coffee-pub-blacksmith not found:', { blacksmith });
        return;
    }

    // Register module settings
    registerSettings();

    // Register socket handler for GM ownership sync on notes
    try {
        await blacksmith.sockets?.register('squire:updateNoteOwnership', async (data) => {
            if (!game.user.isGM) return;
            if (!data?.pageUuid) return;
            const page = await foundry.utils.fromUuid(data.pageUuid);
            if (!page) return;
            const visibility = data.visibility === 'party' ? 'party' : 'private';
            const authorId = data.authorId || page.getFlag(MODULE.ID, 'authorId') || null;

            const ownership = {
                default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
            };
            if (visibility === 'party') {
                game.users.forEach(user => {
                    if (!user.isGM) {
                        ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                    }
                });
                if (authorId && !ownership[authorId]) {
                    ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                }
            } else if (authorId) {
                ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }

            await page.setFlag(MODULE.ID, 'visibility', visibility);
            if (authorId) {
                await page.setFlag(MODULE.ID, 'authorId', authorId);
            }
            await page.update({ ownership });
        });
    } catch (error) {
        blacksmith.utils?.postConsoleAndNotification?.(
            MODULE.NAME,
            'Failed to register notes ownership socket handler',
            { error },
            true,
            false
        );
    }


    // Register dice tray with Blacksmith menubar
    try {
        const { openDiceTray } = await import('./panel-dicetray.js');
        
        const success = blacksmith.registerMenubarTool('squire-dice-tray', {
            icon: "fa-solid fa-dice-d20",
            name: "squire-dice-tray",
            title: "Dice Tray",
            zone: "middle",
            tooltip: "Open the Macros window",
            onClick: openDiceTray,
            zone: "middle",
            group: "utility",
            groupOrder: null,
            order: 1,
            moduleId: MODULE.ID,  
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null
        });

        if (success) {
            // Successfully registered dice tray with Blacksmith menubar
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
            icon: "fa-solid fa-sun",
            name: "squire-macros",
            title: "Macros",
            tooltip: "Open the Macros window",
            onClick: openMacros,
            zone: "middle",
            group: "utility",
            groupOrder: null,
            order: 2,
            moduleId: MODULE.ID,  
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            toggleable: false,
            active: false,
            iconColor: null,
            buttonNormalTint: null,
            buttonSelectedTint: null
        });

        if (success) {
            // Successfully registered macros with Blacksmith menubar
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
    trackModuleTimeout(async () => {
        // Hook management is now handled by Blacksmith HookManager
        // No need to initialize local HookManager
        
        // Fallback: Direct hook registration for journal page sheet (in case Blacksmith doesn't support it)
        // Try multiple hook names for FoundryVTT v12/v13 compatibility
        Hooks.on('renderJournalPageSheet', async (sheet, html, data) => {
            await _embedNoteMetadataBox(sheet, html, data);
        });
        
        // Also try renderApplication with filter
        Hooks.on('renderApplication', async (app, html, data) => {
            const className = app?.constructor?.name;
            const objectName = app?.object?.constructor?.name;
            if (className === 'JournalPageSheet' || className === 'JournalTextPageSheet' || objectName === 'JournalEntryPage') {
                await _embedNoteMetadataBox(app, html, data);
            }
        });
        
        // Also try the JournalEntrySheet hook (for the parent journal)
        Hooks.on('renderJournalEntrySheet', async (sheet, html, data) => {
            // This is for the journal itself, but we can check if a page is being viewed
            // The meta box hook should handle individual pages
        });
        
        // Load quest pins first
        loadPersistedPinsOnCanvasReady();
        
        // Register the controlToken hook AFTER settings are registered
        const controlTokenHookId = BlacksmithHookManager.registerHook({
            name: 'controlToken',
            description: 'Coffee Pub Squire: Handle token control for tray initialization',
            context: MODULE.ID,
            priority: 2,
            callback: async (token, controlled) => {
            // Only proceed if it's a GM or the token owner
            if (!game.user.isGM && !token.actor?.isOwner) return;
            
            // Initialize panel manager if needed
            await PanelManager.initialize(token.actor);
            
            // Update health panel with current selection (works for both selection and deselection)
            if (PanelManager.instance) {
                await _updateHealthPanelFromSelection();
            }
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

// Hook registrations handled in ready hook

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
                        icon: '<i class="fa-solid fa-check"></i>',
                        label: "Accept",
                        cssClass: "accept",
                        callback: () => resolve(true)
                    },
                    decline: {
                        icon: '<i class="fa-solid fa-times"></i>',
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
        // v13: Use native DOM instead of jQuery
        document.querySelectorAll('.squire-tray').forEach(el => el.remove());
        document.querySelectorAll('.squire-questpin-tooltip').forEach(el => el.remove());

        if (selectionUpdateFrameId !== null) {
            cancelAnimationFrame(selectionUpdateFrameId);
            selectionUpdateFrameId = null;
        }

        if (nativeSelectObjects && canvas?.selectObjects === wrappedSelectObjects) {
            canvas.selectObjects = nativeSelectObjects;
        }
        nativeSelectObjects = null;
        wrappedSelectObjects = null;

        clearAllModuleTimers();

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

// Hook registrations handled in ready hook
