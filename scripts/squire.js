import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager, _updateHealthPanelFromSelection, _updateSelectionDisplay } from './manager-panel.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings } from './settings.js';
import { registerHelpers, renderTemplate } from './helpers.js';
import { QuestPanel } from './panel-quest.js';
import { QuestParser } from './utility-quest-parser.js';
// Legacy PIXI-based quest pins - TO BE REMOVED
// import { QuestPin, loadPersistedPinsOnCanvasReady, loadPersistedPins } from './quest-pin.js';

import { FavoritesPanel } from './panel-favorites.js';
import {
    initPinManager,
    teardownPinManager,
    migrateSquireNotePinTypes,
    migrateSquirePinStyles,
    buildNoteOwnership,
    updateQuestPinVisibility,
    updateQuestPinText
} from './manager-pins.js';
import { trackModuleTimeout, clearTrackedTimeout, clearAllModuleTimers } from './timer-utils.js';
// HookManager import removed - using Blacksmith HookManager instead




// ================================================================== 
// ===== BEGIN: BLACKSMITH API REGISTRATIONS ========================
// ================================================================== 
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

let nativeSelectObjects = null;
let wrappedSelectObjects = null;
let selectionUpdateFrameId = null;
const nativeHookRegistrations = [];

function registerNativeHook(name, callback) {
    const id = Hooks.on(name, callback);
    nativeHookRegistrations.push({ name, id });
    return id;
}

function unregisterNativeHooks() {
    for (const { name, id } of nativeHookRegistrations) {
        try {
            Hooks.off(name, id);
        } catch (_) {}
    }
    nativeHookRegistrations.length = 0;
}


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

const NOTE_EDIT_LOCK_FLAG = 'editLock';
const NOTE_EDIT_LOCK_TTL_MS = 30 * 60 * 1000;

async function clearNoteEditLocks({ userId = null, clearExpired = false } = {}) {
    if (!game.settings?.settings?.has(`${MODULE.ID}.notesJournal`)) {
        return;
    }
    const journalId = game.settings.get(MODULE.ID, 'notesJournal');
    if (!journalId || journalId === 'none') return;
    const journal = game.journal.get(journalId);
    if (!journal) return;
    const now = Date.now();

    for (const page of journal.pages.contents) {
        const lock = page.getFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG);
        if (!lock || typeof lock !== 'object') continue;
        const lockUserId = lock.userId;
        const lockAt = Number(lock.at);
        const expired = !Number.isFinite(lockAt) || (now - lockAt > NOTE_EDIT_LOCK_TTL_MS);
        if ((userId && lockUserId === userId) || (clearExpired && expired)) {
            if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) continue;
            if (typeof page.unsetFlag === 'function') {
                await page.unsetFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG);
            } else {
                await page.setFlag(MODULE.ID, NOTE_EDIT_LOCK_FLAG, null);
            }
        }
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

Hooks.once('ready', async () => {
    try {
        await waitForBlacksmithWhenActive();

        const blacksmithApi = getBlacksmith();
        if (typeof blacksmithApi?.registerModule === 'function') {
            blacksmithApi.registerModule(MODULE.ID, {
                name: MODULE.NAME,
                version: MODULE.VERSION
            });
        } else if (typeof globalThis.BlacksmithModuleManager?.registerModule === 'function') {
            globalThis.BlacksmithModuleManager.registerModule(MODULE.ID, {
                name: MODULE.NAME,
                version: MODULE.VERSION
            });
        } else {
            console.error(
                'Coffee Pub Squire | Failed to register SQUIRE with Blacksmith: registerModule not available (is coffee-pub-blacksmith active?)'
            );
        }

        // Initialize unified pin manager (taxonomy, events, context menus, hooks).
        await initPinManager();
        await migrateSquireNotePinTypes();
        await migrateSquirePinStyles();
        await clearNoteEditLocks({ userId: game.user.id, clearExpired: true });

        registerNativeHook('userDisconnected', async (user) => {
            if (!user?.id) return;
            await clearNoteEditLocks({ userId: user.id });
        });

        // Register all hooks after Blacksmith is ready
        if (!getBlacksmithHookManager()?.registerHook) {
            throw new Error(
                'Blacksmith HookManager not available after waitForReady. Ensure coffee-pub-blacksmith is enabled and updated.'
            );
        }
        const renderActorSheet5eHookId = getBlacksmithHookManager().registerHook({
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

        const canvasReadyHookId = getBlacksmithHookManager().registerHook({
            name: 'canvasReady',
            description: 'Coffee Pub Squire: Handle canvas ready (selection monitoring)',
            context: MODULE.ID,
            priority: 2,
            callback: async () => {
                // Monitor canvas selection changes for bulk selection support
                ensureSelectObjectsWrapper();

                // Scene changed — re-resolve the tray actor from the new canvas
                // (players fall back to their character; GMs get the no-character tray)
                await reinitializeTrayForCanvas();

                // If the tray didn't rebuild (current actor still valid here), refresh the
                // character panel so the switcher chips' on/off-scene states track the new scene
                const pm = getPanelManager();
                if (pm?.instance?.characterPanel && pm.element) {
                    await pm.instance.characterPanel.render(pm.element);
                }
            }
        });

        const disableModuleHookId = getBlacksmithHookManager().registerHook({
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
        
        const closeGameHookId = getBlacksmithHookManager().registerHook({
            name: 'closeGame',
            description: 'Coffee Pub Squire: Clean up when game closes',
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                cleanupModule();
            }
        });
        
        // Register all remaining hooks from manager-hooks.js
        const journalHookId = getBlacksmithHookManager().registerHook({
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
        const createJournalPageHookId = getBlacksmithHookManager().registerHook({
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
        const deleteJournalPageHookId = getBlacksmithHookManager().registerHook({
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
        const renderJournalPageSheetHookId = getBlacksmithHookManager().registerHook({
            name: "renderJournalPageSheet",
            description: "Coffee Pub Squire: Embed note metadata box in journal entry page sheet",
            context: MODULE.ID,
            priority: 2,
            callback: async (sheet, html, data) => {
                await _embedNoteMetadataBox(sheet, html, data);
            }
        });
        
        // Also try renderApplication hook with filter
        const renderApplicationHookId = getBlacksmithHookManager().registerHook({
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
        const characterActorHookId = getBlacksmithHookManager().registerHook({
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
        
        const characterTokenHookId = getBlacksmithHookManager().registerHook({
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
        const partyTokenHookId = getBlacksmithHookManager().registerHook({
            name: "updateToken",
            description: "Coffee Pub Squire: Handle token updates for party panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Party panel only shows player-owned tokens — ignore NPC/monster movement
                if (!document?.actor?.hasPlayerOwner) return;
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._onTokenUpdate) {
                    panelManager.instance.partyPanel._onTokenUpdate(document, change);
                }
            }
        });
        
        const partyActorHookId = getBlacksmithHookManager().registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle actor updates for party panel",
            context: MODULE.ID,
            priority: 2,
            callback: (document, change) => {
                // Party panel only shows player-owned actors — ignore NPC/monster updates
                if (!document?.hasPlayerOwner) return;
                // Route to party panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyPanel && panelManager.instance.partyPanel._onActorUpdate) {
                    panelManager.instance.partyPanel._onActorUpdate(document, change);
                }
            }
        });
        
        const partyControlTokenHookId = getBlacksmithHookManager().registerHook({
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
        
        const partyRenderChatMessageHookId = getBlacksmithHookManager().registerHook({
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
        const macrosReadyHookId = getBlacksmithHookManager().registerHook({
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
        
        const macrosRenderSettingsConfigHookId = getBlacksmithHookManager().registerHook({
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
        const partyStatsUpdateCombatHookId = getBlacksmithHookManager().registerHook({
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
        
        const partyStatsUpdateActorHookId = getBlacksmithHookManager().registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Handle actor updates for party stats panel",
            context: MODULE.ID,
            priority: 2,
            callback: (actor, change) => {
                // Leaderboard only tracks player characters — ignore NPC/monster updates
                if (actor?.type !== 'character' || !actor?.hasPlayerOwner) return;
                // Route to party stats panel if it exists
                const panelManager = getPanelManager();
                if (panelManager?.instance?.partyStatsPanel && panelManager.instance.partyStatsPanel._boundUpdateHandler) {
                    panelManager.instance.partyStatsPanel._boundUpdateHandler(actor, change);
                }
            }
        });
        
        const partyStatsCreateChatMessageHookId = getBlacksmithHookManager().registerHook({
            name: "createChatMessage",
            description: "Coffee Pub Squire: Handle chat message creation for party stats panel",
            context: MODULE.ID,
            priority: 2,
            callback: (message) => {
                // MVP scores move on rolls, not table talk — skip plain chat messages
                if (!message?.rolls?.length) return;
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
        
        const globalControlTokenHookId = getBlacksmithHookManager().registerHook({
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
        
        const globalCreateItemHookId = getBlacksmithHookManager().registerHook({
            name: "createItem",
            description: "Coffee Pub Squire: Handle global item creation for tray updates and auto-favoriting",
            context: MODULE.ID,
            priority: 2,
            callback: async (item, options, userId) => {
                const panelManager = getPanelManager();

                // Check if this item belongs to an actor that the current user owns
                if (item.parent && item.parent.isOwner) {
                    // Mark the item as new for the NEW badge — only on the creating client
                    // so multiple clients don't race to write the same flag
                    if (userId === game.user.id && item.parent.documentName === 'Actor') {
                        try {
                            await item.setFlag(MODULE.ID, 'isNew', true);
                            panelManager?.newlyAddedItems?.set(item.id, Date.now());
                        } catch (error) {
                            // Non-fatal: the badge just won't show for this item
                        }
                    }

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
        
        const globalUpdateItemHookId = getBlacksmithHookManager().registerHook({
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
                
                // Skip rerenders entirely when nothing visible changed (e.g. description edits)
                const sys = changes.system ?? {};
                const hasVisibleChange = ('name' in changes) || ('img' in changes) || ('sort' in changes)
                    || sys.equipped !== undefined
                    || sys.prepared !== undefined
                    || sys.preparation !== undefined
                    || sys.uses !== undefined
                    || sys.quantity !== undefined
                    || sys.weight !== undefined
                    || sys.attunement !== undefined
                    || changes.flags?.[MODULE.ID] !== undefined;
                if (!hasVisibleChange) return;

                // Refresh only the panels this item type appears in
                const affectsInventory = ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type);
                const affectsWeapons = item.type === 'weapon';

                if (affectsWeapons && panelManager.instance.weaponsPanel?.element) {
                    await panelManager.instance.weaponsPanel.render(panelManager.instance.weaponsPanel.element);
                }
                if (affectsInventory && panelManager.instance.inventoryPanel?.element) {
                    await panelManager.instance.inventoryPanel.render(panelManager.instance.inventoryPanel.element);
                }
                // Favorites panel only shows favorited items — skip the rerender otherwise
                if ((affectsInventory || affectsWeapons)
                    && panelManager.instance.favoritesPanel?.element
                    && FavoritesPanel.getPanelFavorites(item.parent).includes(item.id)) {
                    await panelManager.instance.favoritesPanel.render(panelManager.instance.favoritesPanel.element);
                }

                // The handle only shows handle-favorited items — skip the full rebuild otherwise
                if (FavoritesPanel.getHandleFavorites(item.parent).includes(item.id)) {
                    await panelManager.instance.updateHandle();
                }
            }
        });
        
        const globalDeleteItemHookId = getBlacksmithHookManager().registerHook({
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
        
        const globalCreateActiveEffectHookId = getBlacksmithHookManager().registerHook({
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
        
        const globalDeleteActiveEffectHookId = getBlacksmithHookManager().registerHook({
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
        
        const globalUpdateActorHookId = getBlacksmithHookManager().registerHook({
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
                
                // Only handle major identity changes with full re-initialization
                const needsFullUpdate = changes.name || // Name change
                                       changes.img || // Image change
                                       changes.system?.attributes?.prof || // Proficiency change
                                       changes.system?.details?.level; // Level change

                // AC and movement recompute constantly (active effects, conditions, mounts) —
                // they only need the character/stats displays and the handle, not a full rebuild
                const needsStatsUpdate = changes.system?.attributes?.ac ||
                                         changes.system?.attributes?.movement;

                if (needsFullUpdate) {
                    await panelManager.initialize(actor);
                    // Force a re-render of all panels
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                    await panelManager.instance.updateHandle();
                }
                else if (needsStatsUpdate) {
                    if (panelManager.instance.characterPanel && panelManager.instance.element) {
                        await panelManager.instance.characterPanel.render(panelManager.instance.element);
                    }
                    if (panelManager.instance.statsPanel && panelManager.instance.element) {
                        await panelManager.instance.statsPanel.render(panelManager.instance.element);
                    }
                    await panelManager.instance.updateHandle();
                }
                // For health, effects, and spell slot changes, update appropriately
                else {
                    // Handle spell slot changes
                    if (changes.system?.spells) {
                        // Re-render just the spells panel
                        if (panelManager.instance.spellsPanel?.element) {
                            await panelManager.instance.spellsPanel.render(panelManager.instance.spellsPanel.element);
                        }
                    }
                    // Handle health, effects, and other changes — update the handle at most once
                    if (changes.system?.attributes?.hp || changes.effects || !changes.system?.spells) {
                        await panelManager.instance.updateHandle();
                    }
                }
            }
        });
        
        const globalDeleteTokenHookId = getBlacksmithHookManager().registerHook({
            name: "deleteToken",
            description: "Coffee Pub Squire: Handle global token deletion",
            context: MODULE.ID,
            priority: 2,
            callback: async (token) => {
                const panelManager = getPanelManager();
                if (panelManager?.currentActor?.id !== token.actor?.id) return;

                // Coalesce deletion bursts (GM removing several tokens at once) into ONE rebuild.
                // The old per-event path reassigned panel actors directly and raced against
                // itself when two deletions landed back-to-back, leaving the tray half-updated.
                if (_tokenDeletionRebuildTimer) clearTrackedTimeout(_tokenDeletionRebuildTimer);
                _tokenDeletionRebuildTimer = trackModuleTimeout(async () => {
                    _tokenDeletionRebuildTimer = null;
                    await reinitializeTrayForCanvas();
                }, 100);
            }
        });
        
        const globalPauseGameHookId = getBlacksmithHookManager().registerHook({
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
        
        // REMOVED: dropCanvasData quest pin handler - Use "Pin to Scene" button only (like Notes).
        
        // REMOVED: questPinCanvasSceneChangeHookId - Migration now handled in canvasReady hook
        // No need to manually reload pins on scene change - Blacksmith handles this automatically
        
        // REMOVED: questPinUpdateSceneHookId - No longer needed with Blacksmith API
        // Blacksmith automatically handles scene flag updates
        
        const questPinUpdateTokenHookId = getBlacksmithHookManager().registerHook({
            name: "updateToken",
            description: "Coffee Pub Squire: Handle quest pin token updates",
            context: MODULE.ID,
            priority: 2,
            callback: (token, changes) => {
                // REMOVED: Pin visibility updates - Blacksmith handles this automatically via ownership
                // No manual visibility updates needed
            }
        });
        
        const questPinCreateTokenHookId = getBlacksmithHookManager().registerHook({
            name: "createToken",
            description: "Coffee Pub Squire: Handle quest pin token creation",
            context: MODULE.ID,
            priority: 2,
            callback: (token) => {
                // Update pin visibility
                // This would need the actual quest pin logic
            }
        });
        
        const globalCreateTokenHookId = getBlacksmithHookManager().registerHook({
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
        
        const questPinDeleteTokenHookId = getBlacksmithHookManager().registerHook({
            name: "deleteToken",
            description: "Coffee Pub Squire: Handle quest pin token deletion",
            context: MODULE.ID,
            priority: 2,
            callback: (token) => {
                // Update pin visibility
                // This would need the actual quest pin logic
            }
        });
        
        const questPinRenderQuestPanelHookId = getBlacksmithHookManager().registerHook({
            name: "renderQuestPanel",
            description: "Coffee Pub Squire: Handle quest pin quest panel rendering",
            context: MODULE.ID,
            priority: 2,
            callback: () => {
                // REMOVED: Pin visibility updates - Blacksmith handles this automatically via ownership
                // No manual visibility updates needed
            }
        });
        
        const questPinSightRefreshHookId = getBlacksmithHookManager().registerHook({
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

// REMOVED: Native canvas hooks for PIXI container creation
// Blacksmith handles all pin rendering now - no need for canvas.squirePins container

// Helper function to get PanelManager dynamically to avoid circular dependencies
function getPanelManager() {
    return game.modules.get('coffee-pub-squire')?.api?.PanelManager;
}

// Debounce timer for tray rebuilds triggered by token deletion (coalesces bursts)
let _tokenDeletionRebuildTimer = null;

// When no owned token is on the canvas: players fall back to the character they last
// picked via the switcher, then their assigned character, then any character they own;
// GMs get null so the tray shows its no-character state.
function getFallbackActor() {
    if (game.user.isGM) return null;
    const lastId = game.user.getFlag(MODULE.ID, 'lastCharacterId');
    const last = lastId ? game.actors.get(lastId) : null;
    if (last?.isOwner) return last;
    return game.user.character
        ?? game.actors.find(a => a.type === 'character' && a.isOwner)
        ?? game.actors.find(a => a.isOwner)
        ?? null;
}

// Re-resolve which actor the tray should show from current canvas state. Shared by
// scene load (canvasReady), token deletion, and world load so the rules stay in one place:
// - current actor still has a token on this scene → leave the tray alone
// - a controlled token wins (e.g. multi-select where one token was deleted)
// - players: their token on this scene, else their assigned/owned character
// - GMs: the no-character tray until they select a token (selection drives the GM tray)
async function reinitializeTrayForCanvas() {
    const pm = getPanelManager();
    if (!pm) return;

    const sceneHas = (t) => canvas.scene?.tokens.get(t.id);
    const currentHasToken = pm.currentActor && canvas.tokens?.placeables.some(t =>
        t.actor?.id === pm.currentActor.id && sceneHas(t));
    if (currentHasToken) return;

    const controlled = canvas.tokens?.controlled.find(t => t.actor?.isOwner && sceneHas(t));
    const ownedOnScene = game.user.isGM ? null
        : canvas.tokens?.placeables.find(t => t.actor?.isOwner && sceneHas(t));

    // force: bypass the init debounce — controlToken release events during scene
    // teardown / token deletion stamp it and would otherwise swallow this rebuild
    await pm.initialize(controlled?.actor ?? ownedOnScene?.actor ?? getFallbackActor(), { force: true });
}

// Helper functions to route journal entry updates to appropriate panels
async function _routeToCodexPanel(page, changes, options, userId) {
    const panelManager = getPanelManager();
    const codexPanel = panelManager?.instance?.codexPanel;
    if (!codexPanel) return;

    // The visibility toggle patches the codex icon in place and opts out of the full
    // re-render here, so the panel keeps its scroll position and expanded entries.
    if (options?.squireSkipCodexRender) return;

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
            
            if (panelManager?.instance && panelManager.element) {
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
            
            if (panelManager?.instance && panelManager.element) {
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
        
        if (panelManager?.instance && panelManager.element) {
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
        // Sync ownership/visibility when the quest visible flag changes.
        if (changes.flags?.[MODULE.ID]?.visible !== undefined) {
            await updateQuestPinVisibility(page.uuid, canvas.scene?.id);
        }
        // Update pin text/tags when quest content changes (title, objective states).
        if (changes.text && Object.keys(changes.text).length) {
            await updateQuestPinText(page, canvas.scene?.id);
            await updateQuestPinVisibility(page.uuid, canvas.scene?.id);
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error routing to quest pins:', error);
    }
}




// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

/**
 * Prefer HookManager from module.api (available once Blacksmith assigns api); fall back to window global
 * after {@link waitForBlacksmithWhenActive} (markReadyForConsumers).
 */
function getBlacksmithHookManager() {
  const api = getBlacksmith();
  return api?.HookManager ?? api?.hookManager ?? globalThis.BlacksmithHookManager ?? null;
}

/**
 * When Blacksmith is active, wait until consumer wiring (globals, asset phase) is safe.
 * See https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Core-Blacksmith
 */
async function waitForBlacksmithWhenActive() {
  const mod = game.modules.get('coffee-pub-blacksmith');
  if (!mod?.active) return;
  const bridge = typeof BlacksmithAPI !== 'undefined' ? BlacksmithAPI : globalThis.BlacksmithAPI;
  try {
    if (typeof bridge?.waitForReady === 'function') {
      await bridge.waitForReady();
    }
  } catch (error) {
    console.error('Coffee Pub Squire | Blacksmith waitForReady failed:', error);
  }
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
    
    // Set up API to expose PanelManager and window open helpers to other modules
    game.modules.get(MODULE.ID).api = {
        PanelManager,
        openCodexWindow: (options = {}) => {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (typeof blacksmith?.openWindow !== 'function') {
                ui.notifications.warn('Codex window is not ready yet.');
                return null;
            }
            return blacksmith.openWindow(`${MODULE.ID}-codex-window`, options);
        },
        openQuestWindow: (options = {}) => {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (typeof blacksmith?.openWindow !== 'function') {
                ui.notifications.warn('Quest window is not ready yet.');
                return null;
            }
            return blacksmith.openWindow(`${MODULE.ID}-quest-window`, options);
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

});

Hooks.once('ready', async function() {
    const blacksmith = getBlacksmith();
    if (!blacksmith) {
        console.error('Required dependency coffee-pub-blacksmith not found:', { blacksmith });
        return;
    }

    // Register module settings
    registerSettings();

    try {
        const { registerNoteWindow, openNotesWindow, NoteWindow, NotesForm, NOTE_WINDOW_ID } = await import('./window-note.js');
        registerNoteWindow();
        game.modules.get(MODULE.ID).api.openNotesWindow = openNotesWindow;
        game.modules.get(MODULE.ID).api.openNotesForm = openNotesWindow;
        game.modules.get(MODULE.ID).api.NoteWindow = NoteWindow;
        game.modules.get(MODULE.ID).api.NotesForm = NotesForm;
        game.modules.get(MODULE.ID).api.NOTE_WINDOW_ID = NOTE_WINDOW_ID;
        window.NoteWindow = NoteWindow;
        window.NotesForm = NotesForm;
    } catch (error) {
        console.error('Coffee Pub Squire | Failed to register Note window:', error);
    }

    try {
        const { registerCodexWindow, openCodexWindow, CodexWindow, CODEX_WINDOW_ID } = await import('./window-codex.js');
        registerCodexWindow();
        game.modules.get(MODULE.ID).api.openCodexWindow = openCodexWindow;
        game.modules.get(MODULE.ID).api.CodexWindow = CodexWindow;
        game.modules.get(MODULE.ID).api.CODEX_WINDOW_ID = CODEX_WINDOW_ID;
        window.CodexWindow = CodexWindow;
    } catch (error) {
        console.error('Coffee Pub Squire | Failed to register Codex window:', error);
    }

    try {
        const { registerQuestWindow, openQuestWindow, QuestWindow, QuestForm, QUEST_WINDOW_ID } = await import('./window-quest.js');
        registerQuestWindow();
        game.modules.get(MODULE.ID).api.openQuestWindow = openQuestWindow;
        game.modules.get(MODULE.ID).api.QuestWindow = QuestWindow;
        game.modules.get(MODULE.ID).api.QuestForm = QuestForm;
        game.modules.get(MODULE.ID).api.QUEST_WINDOW_ID = QUEST_WINDOW_ID;
        window.QuestWindow = QuestWindow;
        window.QuestForm = QuestForm;
    } catch (error) {
        console.error('Coffee Pub Squire | Failed to register Quest window:', error);
    }

    // Pin type names and taxonomy registered by manager-pins.js initPinManager().

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

    // Menubar tools (require tray / PanelManager — register only for non-excluded users)
    try {
        const { openDiceTray } = await import('./panel-dicetray.js');

        const diceOk = blacksmith.registerMenubarTool('squire-dice-tray', {
            icon: "fa-solid fa-dice-d20",
            name: "squire-dice-tray",
            title: null,
            tooltip: "Dice Tray",
            onClick: openDiceTray,
            zone: "left",
            group: "general",
            groupOrder: 999,
            order: 200,
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
        if (!diceOk) {
            console.error('Coffee Pub Squire | Failed to register dice tray with Blacksmith menubar');
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering dice tray with Blacksmith menubar:', error);
    }

    try {
        const { openMacros } = await import('./panel-macros.js');

        const macrosOk = blacksmith.registerMenubarTool('squire-macros', {
            icon: "fa-solid fa-code",
            name: "squire-macros",
            title: null,
            tooltip: "Macro window",
            onClick: openMacros,
            zone: "left",
            group: "general",
            groupOrder: 999,
            order: 201,
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
        if (!macrosOk) {
            console.error('Coffee Pub Squire | Failed to register macros with Blacksmith menubar');
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering macros with Blacksmith menubar:', error);
    }

    try {
        const openQuickNote = () => {
            const api = game.modules.get(MODULE.ID)?.api;
            if (typeof api?.openNotesWindow === 'function') {
                return api.openNotesWindow({});
            }
            ui.notifications.warn('Note window is not ready yet.');
            return null;
        };

        const noteOk = blacksmith.registerMenubarTool('squire-quick-note', {
            icon: "fa-solid fa-note-sticky",
            name: "squire-quick-note",
            title: null,
            tooltip: "Quick Note",
            onClick: openQuickNote,
            zone: "left",
            group: "general",
            groupOrder: 999,
            order: 202,
            moduleId: MODULE.ID,
            gmOnly: false,
            leaderOnly: false,
            visible: true,
            toggleable: false,
            active: false,
            iconColor: "rgba(205, 200, 117, 0.9)",
            buttonNormalTint: null,
            buttonSelectedTint: null
        });
        if (!noteOk) {
            console.error('Coffee Pub Squire | Failed to register quick note with Blacksmith menubar');
        }
    } catch (error) {
        console.error('Coffee Pub Squire | Error registering quick note with Blacksmith menubar:', error);
    }

    blacksmith.renderMenubar?.(true);

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
        await waitForBlacksmithWhenActive();
        if (!getBlacksmithHookManager()?.registerHook) {
            console.error('Coffee Pub Squire | Delayed tray init skipped: Blacksmith HookManager not available.');
            return;
        }

        // Hook management is now handled by Blacksmith HookManager
        // No need to initialize local HookManager
        
        // Fallback: Direct hook registration for journal page sheet (in case Blacksmith doesn't support it)
        // Try multiple hook names for FoundryVTT v12/v13 compatibility
        registerNativeHook('renderJournalPageSheet', async (sheet, html, data) => {
            await _embedNoteMetadataBox(sheet, html, data);
        });
        
        // Also try renderApplication with filter
        registerNativeHook('renderApplication', async (app, html, data) => {
            const className = app?.constructor?.name;
            const objectName = app?.object?.constructor?.name;
            if (className === 'JournalPageSheet' || className === 'JournalTextPageSheet' || objectName === 'JournalEntryPage') {
                await _embedNoteMetadataBox(app, html, data);
            }
        });
        
        // Also try the JournalEntrySheet hook (for the parent journal)
        registerNativeHook('renderJournalEntrySheet', async (sheet, html, data) => {
            // This is for the journal itself, but we can check if a page is being viewed
            // The meta box hook should handle individual pages
        });
        
        // REMOVED: loadPersistedPinsOnCanvasReady() - Quest pins now loaded via migration in canvasReady hook
        
        // Register the controlToken hook AFTER settings are registered
        const controlTokenHookId = getBlacksmithHookManager().registerHook({
            name: 'controlToken',
            description: 'Coffee Pub Squire: Handle token control for tray initialization',
            context: MODULE.ID,
            priority: 2,
            callback: async (token, controlled) => {
            // Only proceed if it's a GM or the token owner
            if (!game.user.isGM && !token.actor?.isOwner) return;

            // Ignore control released by token deletion — the deleteToken handler owns
            // that transition (re-initializing here would resurrect the deleted actor)
            if (!controlled && !canvas.scene?.tokens.get(token.id)) return;

            // Only initialize on control GAIN. A release event must never re-initialize
            // the tray to the released actor — releaseOthers during a character-switcher
            // click was re-initializing the old actor and swallowing the switch.
            if (controlled) {
                await PanelManager.initialize(token.actor);
            }
            
            // Update health panel with current selection (works for both selection and deselection)
            if (PanelManager.instance) {
                await _updateHealthPanelFromSelection();
            }
            }
    });
        
        // Then initialize the main interface via the shared canvas resolution — players with
        // no owned token on the canvas fall back to their assigned/owned character; GMs get
        // the no-character tray until they select a token
        await reinitializeTrayForCanvas();
        
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
        const hookManager = getBlacksmithHookManager();
        if (hookManager?.disposeByContext) {
            hookManager.disposeByContext(MODULE.ID);
        }

        unregisterNativeHooks();
        teardownPinManager();

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

