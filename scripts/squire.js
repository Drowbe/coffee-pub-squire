import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager, _updateTrayFromSelection, _updateSelectionDisplay } from './manager-panel.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings, migrateCompendiumAccessSetting } from './settings.js';
import { getTransferBlocker, registerHelpers, renderTemplate, showSquireToast } from './helpers.js';
import { CompendiumRequestUtils } from './compendium-request-utils.js';
import { StatblockUtility } from './utility-statblock.js';

import { FavoritesPanel } from './panel-favorites.js';
import { trackModuleTimeout, clearTrackedTimeout, clearAllModuleTimers } from './timer-utils.js';
import {
    notifyEffectApplied,
    notifyQuantityChanged
} from './manager-notifications.js';
import { syncFavorites, onActorUpdated, onItemRemoved } from './manager-favorites-sync.js';
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

        // Declare `isNew` as carrying no identity, so Blacksmith's stack-merge
        // predicate ignores it for every consumer without any of them needing to
        // know Squire exists. Without this, an item that has been stamped and one
        // that hasn't compare as different documents and identical stacks stop
        // merging. Optional-chained because it lands with api.inventory, which
        // may be newer than the Blacksmith a given world has installed.
        blacksmithApi?.inventory?.registerTransientFlag?.(`${MODULE.ID}.isNew`);

        await migrateCompendiumAccessSetting();

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

                // Party reputation is per scene, so the readout describes the
                // wrong place until the party panel re-renders. Only when it has
                // rendered at least once — the party tab is lazy.
                const partyPanel = pm?.instance?.partyPanel;
                if (partyPanel?._hasRenderedOnce && partyPanel.element) {
                    await partyPanel.render(partyPanel.element);
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
        
        // Party reputation is Blacksmith's. It broadcasts changes as
        // `blacksmith.partyReputationChanged`, which replaced Squire watching
        // their setting key directly.
        //
        // The payload is deliberately ignored. Blacksmith emits it from Foundry's
        // `updateSetting` so it lands on every client, but its `sceneId` is always
        // the ACTIVE scene — change reputation for a scene nobody is viewing and
        // the payload still describes the active one. The tray only ever shows the
        // active scene's standing, so re-reading through the panel is both simpler
        // and correct, where trusting the payload would be correct only by luck.
        const reputationHookId = getBlacksmithHookManager().registerHook({
            name: 'blacksmith.partyReputationChanged',
            description: 'Coffee Pub Squire: Refresh the party panel when reputation changes',
            context: MODULE.ID,
            priority: 2,
            callback: async () => {
                const partyPanel = getPanelManager()?.instance?.partyPanel;
                if (partyPanel?.element) await partyPanel.render(partyPanel.element);
            }
        });

        // The handle shows the current actor's conditions, so it has to redraw
        // when they change — whoever changed them. This used to be three
        // updateHandle() calls inside the Status Effects window, which meant a
        // condition toggled from the token HUD, the character sheet, or any
        // other module left the handle stale until something else rebuilt it.
        //
        // Reacting to the actor changing rather than to one particular window
        // having changed it is both more correct and what lets that window move
        // to Blacksmith without taking a Squire dependency with it.
        const handleEffectRefresh = (effect) => {
            const parent = effect?.parent;
            if (!parent || parent.documentName !== 'Actor') return;
            const current = PanelManager.currentActor;
            if (!current || parent.uuid !== current.uuid) return;
            void PanelManager.instance?.handleManager?.updateHandle?.();
        };

        for (const name of ['createActiveEffect', 'deleteActiveEffect', 'updateActiveEffect']) {
            getBlacksmithHookManager().registerHook({
                name,
                description: "Coffee Pub Squire: Refresh the handle when the current actor's conditions change",
                context: MODULE.ID,
                priority: 2,
                callback: handleEffectRefresh
            });
        }

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

        // Deliberately its own hook rather than a branch inside the party
        // panel's: a GM approving a compendium request may have no tray open at
        // all, and routing through PanelManager.instance would make the buttons
        // work or not depending on whether a token happened to be selected.
        const compendiumRequestHookId = getBlacksmithHookManager().registerHook({
            name: "renderChatMessage",
            description: "Coffee Pub Squire: Handle compendium add request approval buttons",
            context: MODULE.ID,
            priority: 2,
            callback: (message, html) => {
                CompendiumRequestUtils.handleRequestButtons(message, html);
                // Ammunition restock requests ride the same hook: both are a
                // player asking the GM to approve equipment reaching a sheet.
                StatblockUtility.handleRequestButtons(message, html);
            }
        });
        
        // The two macros-panel hooks here existed only to re-apply Squire's own
        // hotbar-hiding style, which Blacksmith now owns exclusively.

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
        
        // Favourites are kept in step with the dnd5e character sheet's own
        // favourites, in both directions. The handler is a no-op unless the
        // update actually touched one of the two lists, and it writes nothing
        // when they already agree — which is what stops it re-triggering itself.
        const favoritesSyncHookId = getBlacksmithHookManager().registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Keep Squire and character sheet favourites in sync",
            context: MODULE.ID,
            priority: 2,
            callback: async (actor, changes) => {
                await onActorUpdated(actor, changes);
            }
        });

        const favoritesItemDeleteHookId = getBlacksmithHookManager().registerHook({
            name: "deleteItem",
            description: "Coffee Pub Squire: Drop deleted items from both favourites lists",
            context: MODULE.ID,
            priority: 2,
            callback: async (item) => {
                await onItemRemoved(item);
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
        
        // Stamp the "just arrived" badge into the item's own creation data.
        //
        // This used to be a setFlag in the createItem hook below, which is a
        // second write to the Actor landing after the create returns. dnd5e
        // recomputes encumbrance after every item write, and that recompute is a
        // check-then-create against one fixed effect id with no lock, so the
        // second write's recompute reads the same still-empty effects collection
        // and tries to create `dnd5eencumbered0` again — the server rejects it.
        // Awaiting the first write doesn't help: the recompute outlives it.
        //
        // It also made stack-merge identity timing-dependent for anything
        // comparing item flags, since a stamped item and an unstamped one differ
        // until the follow-up write lands. Injecting at preCreate means one
        // write, no window, and the same persisted flag.
        //
        // Registered natively rather than through Blacksmith's hook manager:
        // preCreate hooks cancel the operation when a handler returns false, and
        // routing a cancel-capable hook through a wrapper whose return value
        // Squire doesn't control risks silently blocking item creation for the
        // whole world. `updateSource` mutates the pending document in place; the
        // callback returns nothing.
        registerNativeHook('preCreateItem', (item, data, options, userId) => {
            if (item?.parent?.documentName !== 'Actor') return;
            if (!item.parent.isOwner) return;
            item.updateSource({ flags: { [MODULE.ID]: { isNew: true } } });
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
                    // Session half of the NEW badge. The durable half is the flag,
                    // injected at preCreate above; this map is in-memory, so it
                    // costs no write and is only meaningful on the client that
                    // made the item.
                    if (userId === game.user.id && item.parent.documentName === 'Actor') {
                        panelManager?.newlyAddedItems?.set(item.id, Date.now());
                    }

                    // Check if this is an NPC/monster and trigger auto-favoring if needed
                    if (item.parent.type !== "character") {
                        // Check if actor is from a compendium before trying to modify it
                        const isFromCompendium = item.parent.pack || (item.parent.collection && item.parent.collection.locked);
                        if (!isFromCompendium) {
                            // Pick up the new item if it qualifies; existing
                            // favorites and manual removals are left alone.
                            await FavoritesPanel.syncNpcAutoFavorites(item.parent);
                        }
                    }
                    
                    // A new consumable can clear an ammunition warning that
                    // hangs off a weapon, which none of the refreshes below
                    // would reach.
                    await StatblockUtility.refreshIfWarningsAffected(item);

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
            callback: async (item, changes, options, userId) => {
                if (!item.parent) return;

                // Before the currentActor gate below, which only governs panel
                // refreshes — the GM should hear about a player's edit whether
                // or not their own tray happens to be showing that actor.
                if (options?.squireQuantityEdit && changes?.system?.quantity !== undefined) {
                    notifyQuantityChanged(item, userId, changes.system.quantity);
                }

                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // An NPC weapon being equipped, or a spell being prepared, becomes
                // part of its usable kit — favorite it.
                //
                // Gated on the *change* payload, not the item's current state: this
                // hook fires for every edit, so testing `item.system.equipped === true`
                // matched on unrelated edits (a description tweak) to an already-equipped
                // weapon. Paired with manageFavorite — which toggles — that silently
                // un-favorited the weapon. Add-only, and only on the transition.
                if (item.parent.type !== "character") {
                    // Check if actor is from a compendium before trying to modify it
                    const isFromCompendium = item.parent.pack || (item.parent.collection && item.parent.collection.locked);
                    if (isFromCompendium) {
                        // Skip auto-favoriting for actors from compendiums
                    } else if (game.settings.get(MODULE.ID, 'autoFavoriteNpcs')) {
                        const equippedChange = changes.system?.equipped;
                        // dnd5e 5.x: `prepared` is a number (0/1/2), not a boolean.
                        const preparedChange = changes.system?.prepared;
                        const nowEquipped = item.type === "weapon" && equippedChange === true;
                        const nowPrepared = item.type === "spell" && preparedChange !== undefined && Number(preparedChange) > 0;

                        if (nowEquipped || nowPrepared) {
                            await FavoritesPanel.addPanelFavorite(item.parent, item.id);
                            await FavoritesPanel.markItemsAutoFavoriteSeen(item.parent, [item.id]);
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

                // Same as creation: a quantity change on ammunition clears a
                // warning on the weapon that needs it, not on the ammunition.
                await StatblockUtility.refreshIfWarningsAffected(item);

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
            callback: async (item, options, userId) => {
                // Before the currentActor gate, same reasoning as updateItem.
                if (options?.squireQuantityEdit) {
                    notifyQuantityChanged(item, userId, null);
                }

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
                // Toast an owning player when a status/effect lands on their actor —
                // before the currentActor gate, which only serves the handle update.
                notifyEffectApplied(effect, userId);

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
                                         changes.system?.attributes?.movement ||
                                         changes.system?.attributes?.init ||
                                         changes.system?.abilities ||
                                         changes.system?.skills ||
                                         changes.system?.details?.xp;

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
                    if (panelManager.instance.characterSummaryPanel && panelManager.instance.element) {
                        await panelManager.instance.characterSummaryPanel.render(panelManager.instance.element);
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
        
        // Ownership changes must reach the character switcher.
        //
        // This needs its own registration because every other updateActor hook is
        // scoped to something that is false in exactly this case: the party and
        // party-stats hooks bail on `hasPlayerOwner`, and the global hook bails
        // unless the changed actor IS the one being viewed. Granting a player a new
        // actor while they were looking at a different one therefore reached nothing,
        // and the chips only appeared after a reload.
        //
        // The switcher is built from `game.actors.filter(a => a.isOwner)` in the TRAY
        // render data, so refreshing it means re-rendering the tray, not a panel.
        const ownershipHookId = getBlacksmithHookManager().registerHook({
            name: "updateActor",
            description: "Coffee Pub Squire: Refresh the character switcher when actor ownership changes",
            context: MODULE.ID,
            priority: 2,
            callback: async (actor, changes) => {
                // The switcher is player-only; getOwnedCharacters() returns null for a GM.
                if (game.user.isGM) return;

                // Cheap gate to stay off the hot path — updateActor also fires for every
                // HP tick and effect.
                //
                // The key is NOT `ownership`. Foundry prefixes diff keys with operators:
                // `==` replaces an object wholesale, `-=` deletes, and paths may be
                // flattened (`ownership.<userId>`). A permission change arrives as
                //   { "==ownership": { default: 0, "<userId>": 3 }, _stats, _id }
                // so `changes.ownership` is undefined and any check for it silently
                // rejects every grant. Strip the operators and match the path root.
                const touchesOwnership = Object.keys(changes ?? {})
                    .some(k => k.replace(/^(==|-=|\+=)/, '').split('.')[0] === 'ownership');
                if (!touchesOwnership) return;

                const panelManager = getPanelManager();
                if (!panelManager?.instance?.element) return;

                // Ask the world, not the diff: did the set of actors I own actually change?
                // The diff says what changed on ONE actor; `isOwner` folds in default
                // permission, per-user grants and removals, and GM status without us having
                // to re-derive any of it. This also collapses a GM's bulk permission edit
                // into a single rebuild instead of one per actor.
                const signature = game.actors.filter(a => a.isOwner).map(a => a.id).sort().join(',');
                if (signature === PanelManager._ownedActorSignature) return;
                PanelManager._ownedActorSignature = signature;

                const current = panelManager.currentActor;
                if (current && !current.isOwner) {
                    // We are looking at an actor we no longer own. Leaving the tray on it
                    // would show a sheet the user can't open, so fall back the same way
                    // the switcher ranks them: assigned character, then any character,
                    // then anything else owned. initialize(null) is the no-character state.
                    const owned = game.actors.filter(a => a.isOwner);
                    const next = owned.find(a => a.id === game.user.character?.id)
                        ?? owned.find(a => a.type === 'character')
                        ?? owned[0]
                        ?? null;
                    if (next) await panelManager.switchToCharacter(next.id);
                    else await panelManager.initialize(null, { force: true });
                    return;
                }

                // Gained or lost some OTHER actor: the tray keeps its actor, the chips change.
                await panelManager.instance.updateTray();
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

                // A packed container can't be handed over: dnd5e keeps containment
                // on the child as `system.container`, so the copy made below lands
                // with an id its contents never point at and they stay orphaned on
                // the source. The panels refuse this before the quantity dialog;
                // this is the GM-side backstop for anything that reaches the socket.
                const containerBlocker = getTransferBlocker(sourceItem, sourceActor);
                if (containerBlocker) {
                    const sourceUsers = game.users.filter(user => sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const targetUsers = game.users.filter(user => targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
                    const allUsers = [...new Set([...sourceUsers.map(u => u.id), ...targetUsers.map(u => u.id), data.sourceUserId, data.targetUserId])].filter(id => id);

                    await ChatMessage.create({
                        content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                            isPublic: false,
                            cardType: "transfer-failed",
                            failureReason: containerBlocker.message
                        }),
                        speaker: { alias: "System" },
                        whisper: allUsers
                    });
                    return false;
                }
                
                // Validate against the live document, not the client's hasQuantity
                // claim — a caller that reports an item as non-stackable would
                // otherwise skip the check entirely.
                const available = sourceItem.system?.quantity ?? 1;
                if (data.quantity > available) {
                    console.error('Insufficient quantity for transfer:', { 
                        requested: data.quantity, 
                        available, 
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
                            failureReason: `Insufficient quantity. Only ${available} ${sourceItem.name}${available !== 1 ? 's' : ''} available, but ${data.quantity} requested.`
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

        // A player asking the GM to restock ammunition. Players never write to
        // their own inventory for this — see StatblockUtility.canRepairFor.
        socket.register("createAmmoRequestChat", async (data) => {
            if (!game.user.isGM) return;

            try {
                await StatblockUtility.createRequestChat(data);
            } catch (error) {
                console.error('Error creating ammo request message:', { data, error });
            }
        });

        // A player asking the GM to tidy their sheet. Players never write to
        // their own sheet for this — see CleanupWindow.needsApproval. The GM
        // gets the same preview window the player was looking at, so the two
        // are judging identical rows rather than a summary and its source.
        socket.register("requestCleanupApproval", async (data) => {
            if (!game.user.isGM) return;

            try {
                const { openCleanupApproval } = await import('./window-cleanup.js');
                await openCleanupApproval(data);
            } catch (error) {
                console.error('Error opening the cleanup approval window:', { data, error });
            }
        });

        // The answer, back to whoever asked.
        socket.register("cleanupRequestResolved", async ({ approved, actorName, summary }) => {
            const { showSquireToast } = await import('./helpers.js');
            if (approved) {
                showSquireToast(`Cleanup approved for ${actorName}`, {
                    subtitle: summary || 'Your sheet has been tidied.',
                    icon: 'fa-solid fa-broom'
                });
            } else {
                showSquireToast(`Cleanup declined for ${actorName}`, {
                    subtitle: 'The GM did not apply the changes.',
                    icon: 'fa-solid fa-ban',
                    color: '#e05c3c'
                });
            }
        });

        // Compendium add requests from players on the "ask the GM" access rung.
        socket.register("createCompendiumRequestChat", async (data) => {
            if (!game.user.isGM) return;

            try {
                await CompendiumRequestUtils.createRequestChat(data);
            } catch (error) {
                console.error('Error creating compendium request message:', { data, error });
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
    
    
    // Register handle section partials with error handling
    const partials = [
        { name: 'handle-health', path: 'handle-health.hbs' },
        { name: 'handle-health-tray', path: 'handle-health-tray.hbs' },
        { name: 'handle-favorites', path: 'handle-favorites.hbs' },
        { name: 'handle-conditions', path: 'handle-conditions.hbs' }
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
        PanelManager
    };
    
    // Create and store PartyPanel instance
    game.modules.get(MODULE.ID).PartyPanel = new PartyPanel();

});

Hooks.once('ready', async function() {
    // Foundry invokes ready-hook callbacks without awaiting other modules' async
    // callbacks. This registration block must perform its own Blacksmith wait;
    // Squire's earlier ready callback can still be waiting concurrently.
    await waitForBlacksmithWhenActive();

    const blacksmith = getBlacksmith();
    if (!blacksmith) {
        console.error('Required dependency coffee-pub-blacksmith not found:', { blacksmith });
        return;
    }
    if (!blacksmith.BlacksmithWindowBaseV2 || !blacksmith.BlacksmithToolWindowBaseV2) {
        console.error('Coffee Pub Squire | Required Blacksmith Window V2 APIs are unavailable after Blacksmith became ready.', {
            BlacksmithWindowBaseV2: Boolean(blacksmith.BlacksmithWindowBaseV2),
            BlacksmithToolWindowBaseV2: Boolean(blacksmith.BlacksmithToolWindowBaseV2)
        });
        return;
    }

    // Register module settings
    registerSettings();




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
                await _updateTrayFromSelection();
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
        
        const timestamp = transferData.timestamp;
        
        // Play notification sound
        const blacksmith = getBlacksmith();
        if (blacksmith) {
            blacksmith.utils.playSound('notification', 0.7, false, false);
        }
        
        const { showTransferApprovalTool } = await import('./window-transfer-tool.js');
        const response = await showTransferApprovalTool({
            sourceActor,
            targetActor,
            item: sourceItem,
            requestedQuantity: transferData.selectedQuantity || transferData.quantity || 1
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
                showSquireToast('Transfer Accepted', {
                    subtitle: `${transferData.selectedQuantity || transferData.quantity || 1} × ${sourceItem.name} accepted.`,
                    image: sourceItem.img,
                    color: '#5f8f3f'
                });
            }
        } else {
            // No socketlib - notify the user to coordinate manually
            if (response) {
                showSquireToast('Transfer Accepted', {
                    subtitle: 'Socketlib is unavailable; the GM must complete the transfer manually.',
                    image: sourceItem.img,
                    color: '#b78325'
                });
            } else {
                showSquireToast('Transfer Declined', {
                    subtitle: `${sourceItem.name} was not transferred.`,
                    image: sourceItem.img,
                    color: '#9f3434'
                });
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
        showSquireToast('Transfer Accepted', {
            subtitle: `${targetActorName} accepted ${transferData.itemName || 'the item'}.`,
            icon: 'fa-solid fa-right-left',
            color: '#5f8f3f'
        });
    } else {
        showSquireToast('Transfer Declined', {
            subtitle: `${targetActorName} declined ${transferData.itemName || 'the item'}.`,
            icon: 'fa-solid fa-xmark',
            color: '#9f3434'
        });
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

