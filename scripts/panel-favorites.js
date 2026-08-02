import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getContextMenu, getActivityList, isSpellPrepared, showSquireToast } from './helpers.js';
import { LightUtility } from './utility-lights.js';
import { StatblockUtility } from './utility-statblock.js';
import { QuantityEditor } from './utility-quantity.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Universal actions every creature can take — the core-rules set plus common
// table extras. When an actions compendium drops these onto NPC sheets they
// all carry usable activities, which would flood auto-favorites with rules
// reminders (see: 25 hearts on one CR 9 caster). Matched by lowercased name.
const GENERIC_ACTIONS_DEFAULT = [
    'activate an item', 'attack', 'break an object', 'cast a spell',
    'check cover', 'climb', 'crawl', 'dash', 'delay', 'difficult terrain',
    'disengage', 'dismount', 'dodge', 'drop prone', 'end concentration',
    'escape', 'fall', 'falling', 'forced march', 'grapple', 'help',
    'hide', 'high jump', 'holding breath', 'improvise', 'influence',
    'interact', 'interact with an object', 'jump', 'long jump', 'magic',
    'mount', 'move', 'opportunity attack', 'overrun', 'ready', 'ready action',
    'ready spell', 'search', 'shove', 'squeeze', 'stand up', 'study',
    'suffocating', 'swim', 'travel pace', 'tumble', 'two-weapon fighting',
    'underwater', 'underwater combat', 'use an object', 'utilize'
];

// The generic actions worth a scarce favorite slot. Everything else on the
// list above is a rules reminder the player already knows they can take —
// Jump and Mount don't earn a heart just because the compendium made them
// clickable. Ready and Disengage are the two that come up mid-turn often
// enough to want one click away.
const GENERIC_ACTIONS_FAVORITED_DEFAULT = [
    'disengage', 'ready', 'ready action', 'ready spell'
];

// Parse a comma/newline separated setting into a lowercased name Set, falling
// back to the built-in list when the setting is blank or unregistered.
function parseNameListSetting(settingKey, defaults) {
    let raw = '';
    try {
        raw = game.settings.get(MODULE.ID, settingKey) || '';
    } catch (error) {
        // Setting not registered yet (early boot) — fall back to defaults.
    }
    const names = String(raw)
        .split(/[,\n]/)
        .map(n => n.toLowerCase().trim())
        .filter(n => n.length > 0);
    return new Set(names.length ? names : defaults);
}

function getGenericActions() {
    return parseNameListSetting('autoFavoriteGenericActions', GENERIC_ACTIONS_DEFAULT);
}

function getFavoritedGenericActions() {
    return parseNameListSetting('autoFavoriteGenericActionsKept', GENERIC_ACTIONS_FAVORITED_DEFAULT);
}

export class FavoritesPanel {
    static getPanelFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoritePanel') || [];
    }

    // Handle favorites methods using array-based approach
    static getHandleFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoriteHandle') || [];
    }

    static async setHandleFavorites(actor, ids) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return;
        }
        await actor.setFlag(MODULE.ID, 'favoriteHandle', ids);
    }

    /**
     * How many items may sit on the handle at once. The handle is a narrow
     * vertical strip; past a handful the icons shrink below a comfortable
     * click target, so this is a real constraint rather than a preference.
     */
    static getHandleFavoriteLimit() {
        try {
            const limit = Number(game.settings.get(MODULE.ID, 'handleFavoritesMax'));
            return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
        } catch (error) {
            return 5;
        }
    }

    /**
     * @returns {Promise<boolean>} false if the handle is full and nothing was added
     */
    static async addHandleFavorite(actor, itemId) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return false;
        }

        const ids = new Set(this.getHandleFavorites(actor));
        if (ids.has(itemId)) return true;

        // Refuse rather than silently evicting someone else's pick — which one
        // to drop is the user's call, and a slot vanishing without being asked
        // is worse than being told to free one.
        const limit = this.getHandleFavoriteLimit();
        if (ids.size >= limit) {
            const item = actor.items.get(itemId);
            showSquireToast(`The handle is full (${limit} maximum).`, {
                subtitle: `Remove one before adding ${item?.name ?? 'another item'}.`,
                icon: 'fa-solid fa-circle-exclamation',
                color: '#ffb020'
            });
            return false;
        }

        // Handle favorites are a subset of panel favorites — the handle sorts by
        // panel order and the panel is where you manage them, so an orphaned
        // handle entry would be unremovable from the UI. Promote it instead.
        await this.addPanelFavorite(actor, itemId);
        ids.add(itemId);
        await this.setHandleFavorites(actor, Array.from(ids));
        return true;
    }

    /**
     * Idempotently add an item to the panel favorites, preserving order.
     * Unlike manageFavorite this never removes — use it for automation paths
     * where a toggle would silently undo itself on a repeat event.
     * @returns {Promise<boolean>} true if the item was newly added
     */
    static async addPanelFavorite(actor, itemId) {
        if (!actor || !itemId) return false;
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) return false;

        const current = this.getPanelFavorites(actor).filter(id => id !== null && id !== undefined);
        if (current.includes(itemId)) return false;
        await actor.setFlag(MODULE.ID, 'favoritePanel', [...current, itemId]);
        return true;
    }

    static async removeHandleFavorite(actor, itemId) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return;
        }
        const ids = new Set(this.getHandleFavorites(actor));
        ids.delete(itemId);
        await this.setHandleFavorites(actor, Array.from(ids));
    }

    static isHandleFavorite(actor, itemId) {
        return this.getHandleFavorites(actor).includes(itemId);
    }

    /**
     * Clean up old favorite flags from all actors in the world
     * This should be called once to migrate to the new system
     */
    static async cleanupOldFavoriteFlags() {
        try {
            const actors = game.actors.filter(actor => 
                actor.getFlag(MODULE.ID, 'favorites') || 
                actor.getFlag(MODULE.ID, 'handleFavorites') ||
                actor.getFlag(MODULE.ID, 'isHandleFavorite')
            );
            
            if (actors.length === 0) {
                return;
            }
            
            for (const actor of actors) {
                // Remove old flags
                await actor.unsetFlag(MODULE.ID, 'favorites');
                await actor.unsetFlag(MODULE.ID, 'handleFavorites');
                
                // Remove old per-item flags
                for (const item of actor.items) {
                    await item.unsetFlag(MODULE.ID, 'isHandleFavorite');
                }
            }
            

            
            // Refresh the UI if panels are open
            if (PanelManager.instance) {
                await PanelManager.instance.updateHandle();
                if (PanelManager.instance.favoritesPanel?.element) {
                    await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                }
            }
            
        } catch (error) {
            console.error(`${MODULE.ID}: Error cleaning up old favorite flags:`, error);
        }
    }



    static async clearHandleFavorites(actor) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return [];
        }
        await actor.unsetFlag(MODULE.ID, 'favoriteHandle');
        if (PanelManager.instance) {
            // Update the handle to reflect the cleared handle favorites
            await PanelManager.instance.updateHandle();
        }
        return [];
    }

    static async clearFavorites(actor) {
        // Check if actor is from a compendium (more robust check)
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            // Cannot clear favorites for actor from compendium
            return [];
        }
        await actor.unsetFlag(MODULE.ID, 'favoritePanel');
        // Also clear handle favorites when clearing all favorites
        await actor.unsetFlag(MODULE.ID, 'favoriteHandle');
        // Mark everything currently on the sheet as already considered, so the
        // next auto-favorite pass doesn't undo the clear. Without this, simply
        // re-selecting the token would repopulate the whole list.
        await FavoritesPanel.markItemsAutoFavoriteSeen(actor, actor.items.map(i => i.id));
        if (PanelManager.instance) {
            // Update just the handle to reflect the cleared favorites
            await PanelManager.instance.updateHandle();
            
            // Update panel data without full re-renders
            if (PanelManager.instance.favoritesPanel) {
                PanelManager.instance.favoritesPanel.favorites = [];
                // Clear the favorites list from DOM
                if (PanelManager.instance.favoritesPanel.element) {
                    const $favoritesList = $(PanelManager.instance.favoritesPanel.element).find('.favorites-list');
                    $favoritesList.find('.panel-item').remove();
                    $favoritesList.append('<div class="tray-title-small" style="text-align: center; padding: 10px;">No favorites available</div>');
                }
            }
            
            // Update other panels' data
            if (PanelManager.instance.inventoryPanel) {
                PanelManager.instance.inventoryPanel.items = await PanelManager.instance.inventoryPanel._getItems();
                PanelManager.instance.inventoryPanel._updateHeartIcons();
            }
            if (PanelManager.instance.weaponsPanel) {
                PanelManager.instance.weaponsPanel.weapons = await PanelManager.instance.weaponsPanel._getWeapons();
                PanelManager.instance.weaponsPanel._updateHeartIcons();
            }
            if (PanelManager.instance.spellsPanel) {
                PanelManager.instance.spellsPanel.spells = await PanelManager.instance.spellsPanel._getSpells();
                PanelManager.instance.spellsPanel._updateHeartIcons();
            }
            if (PanelManager.instance.featuresPanel) {
                PanelManager.instance.featuresPanel.features = await PanelManager.instance.featuresPanel._getFeatures();
                PanelManager.instance.featuresPanel._updateHeartIcons();
            }
        }
        return [];
    }

    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Ensure we have a valid itemId and actor
            if (!itemId || !actor) {
                console.error("Invalid item ID or actor in manageFavorite:", { itemId, actor });
                return false;
            }

            // Check if actor is from a compendium (more robust check)
            const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
            if (isFromCompendium) {
                // Cannot modify favorites for actor from compendium
                return false;
            }

            // Get current panel favorites and ensure it's an array
            const panelFavorites = Array.isArray(actor.getFlag(MODULE.ID, 'favoritePanel')) ? 
                actor.getFlag(MODULE.ID, 'favoritePanel') : [];
            
            // Filter out any null/undefined values and create new array
            const newPanelFavorites = panelFavorites.includes(itemId)
                ? panelFavorites.filter(id => id !== null && id !== undefined && id !== itemId)
                : [...panelFavorites.filter(id => id !== null && id !== undefined), itemId];

            // Update the panel favorites flag
            await actor.setFlag(MODULE.ID, 'favoritePanel', newPanelFavorites);

            // If we're removing a panel favorite, also remove it from handle favorites
            // (handle favorites must also be panel favorites)
            if (!newPanelFavorites.includes(itemId)) {
                await FavoritesPanel.removeHandleFavorite(actor, itemId);
            }

            // Handle favorites are now completely manual - but must also be panel favorites

            // Get the PanelManager instance directly
            const panelManager = PanelManager.instance;
            if (panelManager) {
                // Handle favorites are now completely manual - no auto-syncing
                
                // Update just the handle to refresh favorites
                await panelManager.updateHandle();
                
                // Update the favorites panel data and refresh display
                if (panelManager.favoritesPanel) {
                    panelManager.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
                    
                    // Refresh the favorites panel display to show changes
                    if (panelManager.favoritesPanel.element) {
                        await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
                    }
                }
                
                // Update other panels' data without full re-render
                if (panelManager.inventoryPanel) {
                    panelManager.inventoryPanel.items = await panelManager.inventoryPanel._getItems();
                    panelManager.inventoryPanel._updateHeartIcons();
                }
                if (panelManager.weaponsPanel) {
                    panelManager.weaponsPanel.weapons = await panelManager.weaponsPanel._getWeapons();
                    panelManager.weaponsPanel._updateHeartIcons();
                }
                if (panelManager.spellsPanel) {
                    panelManager.spellsPanel.spells = await panelManager.spellsPanel._getSpells();
                    panelManager.spellsPanel._updateHeartIcons();
                }
                if (panelManager.featuresPanel) {
                    panelManager.featuresPanel.features = await panelManager.featuresPanel._getFeatures();
                    panelManager.featuresPanel._updateHeartIcons();
                }
            }

            return newPanelFavorites.includes(itemId);
        } catch (error) {
            console.error("Error in manageFavorite:", error);
            return false;
        }
    }

    /**
     * Items auto-favorite has already considered for this actor. Anything in
     * here is never auto-favorited again, which is what makes manual removals
     * (and Clear All) stick across token re-selection.
     */
    static getAutoFavoriteSeen(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'autoFavoriteSeen') || [];
    }

    static async markItemsAutoFavoriteSeen(actor, itemIds) {
        if (!actor) return;
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) return;
        const seen = new Set(this.getAutoFavoriteSeen(actor));
        for (const id of itemIds) seen.add(id);
        await actor.setFlag(MODULE.ID, 'autoFavoriteSeen', Array.from(seen));
    }

    /**
     * Auto-favorite an NPC's usable statblock content: attacks, castable spells,
     * and activated features.
     *
     * Incremental rather than all-or-nothing. Every item on the sheet is recorded
     * in the `autoFavoriteSeen` flag once considered, so a later pass only looks
     * at items it has never seen. That gives three behaviours at once: a fresh
     * NPC gets seeded, an item added later gets picked up, and anything the user
     * unfavorites by hand (or clears wholesale) stays gone.
     *
     * @param {Actor} actor - The actor to check and update favorites for
     * @returns {Promise<boolean>} - Returns true if any changes were made
     */
    static async syncNpcAutoFavorites(actor) {
        if (!actor) return false;

        // Only process for non-player characters (monsters/NPCs)
        if (actor.type === "character") return false;

        try {
            if (!game.settings.get(MODULE.ID, 'autoFavoriteNpcs')) return false;
        } catch (error) {
            // Setting not registered yet — nothing sensible to do this early.
            return false;
        }

        try {
            // Check if actor is from a compendium (more robust check)
            const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
            if (isFromCompendium) {
                return false;
            }

            // Migration: actors favorited under the old all-or-nothing rule have
            // no seen list. Adopt their sheet as already-considered so this pass
            // doesn't re-add items they curated away, then let future items flow
            // through normally.
            const hasSeenFlag = actor.getFlag(MODULE.ID, 'autoFavoriteSeen') !== undefined;
            if (!hasSeenFlag && FavoritesPanel.getPanelFavorites(actor).length > 0) {
                await FavoritesPanel.markItemsAutoFavoriteSeen(actor, actor.items.map(i => i.id));
                return false;
            }

            const seen = new Set(FavoritesPanel.getAutoFavoriteSeen(actor));
            const isUnseen = (item) => !seen.has(item.id);

            // Weapons: anything already equipped, plus anything with an attack
            // activity — a weapon with an attack is part of the statblock's action
            // list whether or not the importer remembered to equip it.
            //
            // Deliberately read-only: favorites are Squire's own metadata, but
            // `system.equipped` is the actor's data — Squire acts on what the
            // token has and never writes to it. Fixing an unequipped statblock
            // weapon is a content problem for the sheet/import side.
            const hasAttackActivity = (item) =>
                getActivityList(item).some(a => a?.type === "attack");
            const weapons = actor.items.filter(item =>
                item.type === "weapon" &&
                isUnseen(item) &&
                (item.system.equipped === true || hasAttackActivity(item))
            );

            // Spells: dnd5e 5.x `prepared` is a number (0 unprepared / 1 prepared /
            // 2 always), and statblock spells may instead be at-will, innate, or
            // pact — favorite anything the actor can actually cast.
            const spells = actor.items.filter(item =>
                item.type === "spell" &&
                isUnseen(item) &&
                (item.system.prepared > 0 ||
                 ["atwill", "innate", "pact"].includes(item.system.method))
            );

            // Features: any feat with an activation-typed activity. Requiring an
            // activation keeps actions, bonus actions, and reactions while leaving
            // passive traits (Amphibious, Keen Senses) out — a text-only feat with
            // no activities is indistinguishable from a passive trait in the data.
            // Deliberately NOT gated on `system.type.value === "monster"`: dnd5e only
            // stamps that on feats created directly on an NPC, so hand-built pets and
            // drag-copied abilities never carry it. On an NPC, usable = statblock
            // content. 2024-style statblocks express attacks as these feat items
            // rather than weapon items, so this filter carries most modern monsters.
            const genericActionNames = getGenericActions();
            const keptGenericActionNames = getFavoritedGenericActions();
            const isGenericAction = (item) => genericActionNames.has(item.name.toLowerCase().trim());
            const feats = actor.items.filter(item => {
                if (item.type !== "feat") return false;
                if (!isUnseen(item)) return false;
                if (!getActivityList(item).some(a => a?.activation?.type)) return false;
                // Generic actions: only the curated few make the cut; real
                // statblock features (Multiattack, breath weapons) pass through.
                if (isGenericAction(item)) {
                    return keptGenericActionNames.has(item.name.toLowerCase().trim());
                }
                return true;
            });
            // Statblock features are what the creature IS; generic actions are
            // rules reminders — they sort to the bottom of the favorites list.
            const statblockFeatures = feats.filter(f => !isGenericAction(f));
            const genericActions = feats.filter(isGenericAction);

            // Get the IDs of all items to favorite
            const itemsToFavorite = [...weapons, ...spells, ...statblockFeatures, ...genericActions].map(item => item.id);

            if (itemsToFavorite.length > 0) {
                // Append to whatever the user already has rather than replacing it,
                // so a top-up pass can't reorder or drop their curated list.
                const existingPanel = FavoritesPanel.getPanelFavorites(actor)
                    .filter(id => id !== null && id !== undefined);
                const newPanelFavorites = [...existingPanel, ...itemsToFavorite.filter(id => !existingPanel.includes(id))];
                await actor.setFlag(MODULE.ID, 'favoritePanel', newPanelFavorites);

                // Also add these items to handle favorites for quick access — minus
                // the generic actions: handle slots are scarce, and Ready/Disengage
                // belong to every creature, not this one's kit.
                //
                // Truncated to the same limit the manual toggle enforces. A big
                // statblock has far more usable content than the handle can show,
                // so the first few in statblock order win and the rest stay in
                // the favorites panel where there's room for them.
                const handleToAdd = [...weapons, ...spells, ...statblockFeatures].map(item => item.id);
                const existingHandle = FavoritesPanel.getHandleFavorites(actor)
                    .filter(id => id !== null && id !== undefined);
                const newHandleFavorites = [...existingHandle, ...handleToAdd.filter(id => !existingHandle.includes(id))]
                    .slice(0, FavoritesPanel.getHandleFavoriteLimit());
                await actor.setFlag(MODULE.ID, 'favoriteHandle', newHandleFavorites);
            }

            // Record every item on the sheet as considered, even the ones that
            // didn't qualify — a passive trait shouldn't get re-evaluated on
            // every token select, and this is what makes removals stick. Written
            // after the favorites land so a failed write doesn't burn the items.
            //
            // Set to exactly the current item IDs rather than unioned in: a seen
            // ID that's no longer on the sheet belongs to a deleted item and can
            // never recur, so this doubles as a prune and keeps the flag bounded.
            await actor.setFlag(MODULE.ID, 'autoFavoriteSeen', actor.items.map(i => i.id));

            if (itemsToFavorite.length === 0) return false;

            // Force refresh of items collection to ensure up-to-date data
            if (actor.items && typeof actor.items._flush === 'function') {
                await actor.items._flush();
            }
            
            // Refresh the panels if they exist
            if (PanelManager.instance && PanelManager.currentActor?.id === actor.id) {
                // First update the favorites panel
                if (PanelManager.instance.favoritesPanel?.element) {
                    await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                }
                // Then update all other panels
                if (PanelManager.instance.inventoryPanel?.element) {
                    await PanelManager.instance.inventoryPanel.render(PanelManager.instance.inventoryPanel.element);
                }
                if (PanelManager.instance.weaponsPanel?.element) {
                    await PanelManager.instance.weaponsPanel.render(PanelManager.instance.weaponsPanel.element);
                }
                if (PanelManager.instance.spellsPanel?.element) {
                    await PanelManager.instance.spellsPanel.render(PanelManager.instance.spellsPanel.element);
                }
                // Update the handle to reflect the new favorites
                await PanelManager.instance.updateHandle();
            }
            return true;
        } catch (error) {
            console.error("Error in syncNpcAutoFavorites:", error);
            return false;
        }
    }

    constructor(actor) {
        this.actor = actor;
        this.favorites = []; // Initialize empty, will be populated in render
        this._listenerController = null;
        // Initialize filter states
        this.showSpells = game.settings.get(MODULE.ID, 'showSpellFavorites');
        this.showWeapons = game.settings.get(MODULE.ID, 'showWeaponFavorites');
        this.showFeatures = game.settings.get(MODULE.ID, 'showFeaturesFavorites');
        this.showInventory = game.settings.get(MODULE.ID, 'showInventoryFavorites');

        // Set up the context menu options once
        // v13: Callbacks receive native DOM elements (not jQuery) when jQuery: false is passed
        this.menuOptions = [{
            name: "Move to Top",
            icon: '<i class="fa-solid fa-angle-double-up"></i>',
            condition: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex > 0;
            },
            callback: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                this._reorderFavorite(itemId, 0);
            }
        }, {
            name: "Move Up",
            icon: '<i class="fa-solid fa-angle-up"></i>',
            condition: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex > 0;
            },
            callback: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                this._reorderFavorite(itemId, currentIndex - 1);
            }
        }, {
            name: "Move Down",
            icon: '<i class="fa-solid fa-angle-down"></i>',
            condition: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex < favorites.length - 1;
            },
            callback: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                this._reorderFavorite(itemId, currentIndex + 1);
            }
        }, {
            name: "Move to Bottom",
            icon: '<i class="fa-solid fa-angle-double-down"></i>',
            condition: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                const currentIndex = favorites.indexOf(itemId);
                return currentIndex < favorites.length - 1;
            },
            callback: li => {
                // v13: Use native DOM dataset instead of jQuery .data()
                const itemId = li.dataset.itemId;
                const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
                this._reorderFavorite(itemId, favorites.length - 1);
            }
        }];
        
        // Auto-favorite is driven by PanelManager on actor init and by the
        // createItem hook — both of which await it. Firing it from the
        // constructor too raced those writes for the same flag.

    }

    async _getFavorites() {
        if (!this.actor) return [];
        
        // Get our module's panel favorites from flags and filter out null values
        const panelFavorites = (this.actor.getFlag(MODULE.ID, 'favoritePanel') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(this.actor.items.map(item => [item.id, item]));
        
        // Get active light source ID for this actor (from actor flag - most reliable)
        // This is similar to how favorites work - direct flag check
        const effectiveActiveLightSourceId = LightUtility.getActiveLightSourceId(this.actor);

        // Built once per render rather than per row — detection walks the whole
        // actor, so doing it inside the map would be quadratic.
        const issueMap = StatblockUtility.getIssueMap(this.actor);
        const canEditQuantity = QuantityEditor.canEdit(this.actor);
        
        // Map panel favorites in their original order
        const favoritedItems = await Promise.all(panelFavorites
            .map(id => itemsById.get(id))
            .filter(item => item) // Remove any undefined items (in case an item was deleted)
            .map(async item => {
                const isHandleFavorite = FavoritesPanel.isHandleFavorite(this.actor, item.id);
                const isLightSource = await LightUtility.isLightSource(item);
                let isLightActive = false;
                
                if (isLightSource && effectiveActiveLightSourceId) {
                    const itemLightSourceId = await LightUtility.getLightSourceId(item);
                    isLightActive = itemLightSourceId === effectiveActiveLightSourceId;
                }
                
                return {
                    id: item.id,
                    name: item.name,
                    img: item.img || 'icons/svg/item-bag.svg',
                    type: item.type,
                    system: item.system,
                    equipped: item.system.equipped,
                    hasEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                    showEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                    showStarIcon: item.type === 'feat',
                    isPrepared: isSpellPrepared(item),
                    statblockIssue: StatblockUtility.getBadge(issueMap.get(item.id)),
                    canEditQuantity: canEditQuantity && item.system?.quantity !== undefined,
                    isHandleFavorite: isHandleFavorite,
                    isLightSource: isLightSource,
                    isLightActive: isLightActive
                };
            }));
            
        return favoritedItems;
    }

    async render(html) {
        if (!html) return;
        
        // v13: Convert jQuery to native DOM if needed
        const nativeHtml = getNativeElement(html);
        // Store the element reference
        this.element = nativeHtml;
        
        // Refresh favorites data
        this.favorites = await this._getFavorites();
        
        const favoritesData = {
            favorites: this.favorites,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showSpells: this.showSpells,
            showWeapons: this.showWeapons,
            showFeatures: this.showFeatures,
            showInventory: this.showInventory,
            hasFavorites: this.favorites.length > 0
        };

        const template = await renderTemplate(TEMPLATES.PANEL_FAVORITES, favoritesData);
        
        // Get the favorites panel element
        // v13: Use native DOM querySelector
        const favoritesPanel = nativeHtml?.querySelector('[data-panel="favorites"]');
        if (!favoritesPanel) return;
        
        // Clean up old event listeners
        this._removeEventListeners(favoritesPanel);
        
        // Update HTML
        // v13: Use native DOM innerHTML instead of jQuery html()
        favoritesPanel.innerHTML = template;
        
        // Add equipped class and handle shield icon visibility for equipped items
        // v13: Use native DOM querySelectorAll instead of jQuery find().each()
        favoritesPanel.querySelectorAll('.panel-item').forEach(item => {
            const itemId = item.dataset.itemId;
            const favoriteItem = this.favorites.find(f => f.id === itemId);
            
            if (favoriteItem) {
                // Handle equipped state
                if (favoriteItem.equipped) {
                    item.classList.add('equipped');
                }
                
                // Handle shield icon visibility and state
                const shieldIcon = item.querySelector('.fa-shield-alt');
                if (shieldIcon) {
                    if (favoriteItem.showEquipToggle) {
                        shieldIcon.style.display = '';
                        shieldIcon.classList.toggle('faded', !favoriteItem.equipped);
                    } else {
                        shieldIcon.style.display = 'none';
                    }
                }
                
                // Handle light icon visibility and state
                const lightIcon = item.querySelector('.fa-lightbulb');
                if (lightIcon) {
                    if (favoriteItem.isLightSource) {
                        lightIcon.style.display = '';
                        lightIcon.classList.toggle('faded', !favoriteItem.isLightActive);
                        lightIcon.classList.toggle('light-active', favoriteItem.isLightActive);
                    } else {
                        lightIcon.style.display = 'none';
                    }
                }
            }
        });
        
        // Add new event listeners
        this._activateListeners(html);
        
        // Update visibility
        this._updateVisibility(html);
        
        // Update light icons
        this._updateLightIcons(html);

        PanelManager.instance?.controlPanel?.reapplySearch();
    }

    _removeEventListeners(panel) {
        if (this._listenerController) {
            this._listenerController.abort();
            this._listenerController = null;
        }
        
        // All listeners are registered with this controller's signal, so aborting it
        // above removes them — no element cloning needed.
        
        // Properly cleanup context menu
        // v13: Don't try to close the context menu during render - the DOM is about to be replaced
        // The old context menu will be garbage collected, and a new one will be created in _activateListeners
        if (this._contextMenu) {
            // Just nullify the reference - don't try to close it as the DOM is being replaced
            this._contextMenu = null;
        }
    }

    _updateVisibility(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.panel-item').forEach((item) => {
            const itemId = item.dataset.itemId;
            const favoriteItem = this.favorites.find(f => f.id === itemId);
            
            if (!favoriteItem) return;

            let shouldShow = false;
            if (favoriteItem.type === 'spell' && this.showSpells) shouldShow = true;
            if (favoriteItem.type === 'weapon' && this.showWeapons) shouldShow = true;
            if (favoriteItem.type === 'feat' && this.showFeatures) shouldShow = true;
            if (['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(favoriteItem.type) && 
                this.showInventory && favoriteItem.type !== 'weapon') shouldShow = true;

            item.style.display = shouldShow ? '' : 'none';
        });
    }

    async _toggleFilter(filterType) {
        switch(filterType) {
            case 'spells':
                this.showSpells = !this.showSpells;
                await game.settings.set(MODULE.ID, 'showSpellFavorites', this.showSpells);
                break;
            case 'weapons':
                this.showWeapons = !this.showWeapons;
                await game.settings.set(MODULE.ID, 'showWeaponFavorites', this.showWeapons);
                break;
            case 'features':
                this.showFeatures = !this.showFeatures;
                await game.settings.set(MODULE.ID, 'showFeaturesFavorites', this.showFeatures);
                break;
            case 'inventory':
                this.showInventory = !this.showInventory;
                await game.settings.set(MODULE.ID, 'showInventoryFavorites', this.showInventory);
                break;
        }
        this._updateVisibility(this.element);
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all favorite items
        const favoriteItems = this.element.find('.panel-item');
        let visibleItems = 0;
        
        favoriteItems.each((_, item) => {
            const $item = $(item);
            const itemName = $item.find('.panel-item-name').text().toLowerCase();
            
            if (searchTerm === '' || itemName.includes(searchTerm)) {
                $item.show();
                visibleItems++;
            } else {
                $item.hide();
            }
        });

        // Show/hide no matches message
        this.element.find('.no-matches').toggle(visibleItems === 0 && searchTerm !== '');
    }

    _activateListeners(html) {
        if (!html) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const panel = nativeHtml.querySelector('[data-panel="favorites"]');
        if (!panel) return;
        this._removeEventListeners(panel);
        this._listenerController = new AbortController();
        const listenerSignal = this._listenerController.signal;
        const favoritesList = panel.querySelector('.favorites-list');
        
        // Always create a fresh context menu
        // v13: Use namespaced API and opt out of jQuery
        try {
            const ContextMenu = getContextMenu();
            this._contextMenu = new ContextMenu(favoritesList, '.panel-item', this.menuOptions, { jQuery: false });
        } catch (error) {
            console.error('Error creating context menu:', error);
            // Fallback: use native context menu
            // v13: Use native DOM event delegation
            panel.addEventListener('contextmenu', (event) => {
                const favoriteItem = event.target.closest('.panel-item');
                if (!favoriteItem) return;
                event.preventDefault();
                const itemId = favoriteItem.dataset.itemId;
                // For now, just log - we can implement a custom context menu later
            }, { signal: listenerSignal });
        }
        
        // Filter toggles
        // v13: Use nativeHtml instead of html, native DOM methods
        const spellToggle = nativeHtml.querySelector('.favorites-spell-toggle');
        if (spellToggle) {
            spellToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('spells');
                event.currentTarget.classList.toggle('active', this.showSpells);
                event.currentTarget.classList.toggle('faded', !this.showSpells);
            }, { signal: listenerSignal });
        }

        const weaponToggle = nativeHtml.querySelector('.favorites-weapon-toggle');
        if (weaponToggle) {
            weaponToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('weapons');
                event.currentTarget.classList.toggle('active', this.showWeapons);
                event.currentTarget.classList.toggle('faded', !this.showWeapons);
            }, { signal: listenerSignal });
        }

        const featuresToggle = nativeHtml.querySelector('.favorites-features-toggle');
        if (featuresToggle) {
            featuresToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('features');
                event.currentTarget.classList.toggle('active', this.showFeatures);
                event.currentTarget.classList.toggle('faded', !this.showFeatures);
            }, { signal: listenerSignal });
        }

        const inventoryToggle = nativeHtml.querySelector('.favorites-inventory-toggle');
        if (inventoryToggle) {
            inventoryToggle.addEventListener('click', async (event) => {
                await this._toggleFilter('inventory');
                event.currentTarget.classList.toggle('active', this.showInventory);
                event.currentTarget.classList.toggle('faded', !this.showInventory);
            }, { signal: listenerSignal });
        }

        // Roll/Use item — delegated to the panel (one listener regardless of list size)
        panel.addEventListener('click', async (event) => {
            if (!event.target.classList.contains('panel-item-roll-overlay')) return;
            if (!event.target.closest('.panel-item-image-container')) return;
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = event.target.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                await item.use({}, { event });
            }
        }, { signal: listenerSignal });

        // View item details — delegated
        panel.addEventListener('click', async (event) => {
            const featherIcon = event.target.closest('.panel-item .fa-feather');
            if (!featherIcon) return;
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = featherIcon.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        }, { signal: listenerSignal });

        // Toggle favorite
        // v13: Use native DOM event delegation on panel (from querySelector)
        panel.addEventListener('click', async (event) => {
            const heartButton = event.target.closest('.tray-buttons .fa-heart');
            if (!heartButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = event.currentTarget.closest('.panel-item') || heartButton.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            if (!itemId) {
                return;
            }
            
            // Check current state before toggle
            const wasFavorite = FavoritesPanel.getPanelFavorites(this.actor).includes(itemId);
            
            const result = await FavoritesPanel.manageFavorite(this.actor, itemId);
            
            // Check state after toggle
            const isFavorite = FavoritesPanel.getPanelFavorites(this.actor).includes(itemId);
        }, { signal: listenerSignal });

        // Toggle prepared state (sun icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const sunButton = event.target.closest('.tray-buttons .fa-sun');
            if (!sunButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            const favoriteItem = sunButton.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                // dnd5e 5.x models `prepared` as a number (0 unprepared /
                // 1 prepared / 2 always prepared), not a boolean.
                const isPrepared = Number(item.system.prepared) > 0;
                const newPrepared = isPrepared ? 0 : 1;
                await item.update({
                    'system.prepared': newPrepared
                });
                // Update the UI immediately
                favoriteItem.classList.toggle('prepared', !isPrepared);
                sunButton.classList.toggle('faded', isPrepared);

                // Sync handle favorites and update the handle to reflect the new prepared state
                if (PanelManager.instance) {
                    // Update panel data without full re-renders
                    if (PanelManager.instance.spellsPanel) {
                        PanelManager.instance.spellsPanel.spells = await PanelManager.instance.spellsPanel._getSpells();
                        PanelManager.instance.spellsPanel._updateHeartIcons();
                    }
                    // Handle favorites are now completely manual - no auto-syncing
                    await PanelManager.instance.updateHandle();
                }
            }
        }, { signal: listenerSignal });

        // Toggle equip state (shield icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const shieldButton = event.target.closest('.tray-buttons .fa-shield-alt');
            if (!shieldButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            const favoriteItem = shieldButton.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                favoriteItem.classList.toggle('equipped', newEquipped);
                shieldButton.classList.toggle('faded', !newEquipped);

                // Update the handle to reflect the new equipped state
                if (PanelManager.instance) {
                // Update panel data without full re-renders
                if (PanelManager.instance.inventoryPanel) {
                    PanelManager.instance.inventoryPanel.items = await PanelManager.instance.inventoryPanel._getItems();
                    PanelManager.instance.inventoryPanel._updateHeartIcons();
                    PanelManager.instance.inventoryPanel._updateLightIcons(PanelManager.instance.inventoryPanel.element);
                }
                    if (PanelManager.instance.weaponsPanel) {
                        PanelManager.instance.weaponsPanel.weapons = await PanelManager.instance.weaponsPanel._getWeapons();
                        PanelManager.instance.weaponsPanel._updateHeartIcons();
                    }
                    if (PanelManager.instance.spellsPanel) {
                        PanelManager.instance.spellsPanel.spells = await PanelManager.instance.spellsPanel._getSpells();
                        PanelManager.instance.spellsPanel._updateHeartIcons();
                    }
                    if (PanelManager.instance.featuresPanel) {
                        PanelManager.instance.featuresPanel.features = await PanelManager.instance.featuresPanel._getFeatures();
                        PanelManager.instance.featuresPanel._updateHeartIcons();
                    }
                }
                // Handle favorites are now completely manual - no auto-syncing
                await PanelManager.instance.updateHandle();
            }
        }, { signal: listenerSignal });

        // Toggle handle favorite
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const daggerButton = event.target.closest('.tray-buttons .fa-dagger');
            if (!daggerButton) return;
            
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = daggerButton.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            if (!itemId) return;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            const current = FavoritesPanel.isHandleFavorite(this.actor, itemId);
            if (current) {
                await FavoritesPanel.removeHandleFavorite(this.actor, itemId);
            } else {
                // May refuse when the handle is full; it reports that itself.
                await FavoritesPanel.addHandleFavorite(this.actor, itemId);
            }
            // Update the handle to reflect the change
            if (PanelManager.instance) {
                await PanelManager.instance.updateHandle();
            }

            // Refresh the favorites data to update isHandleFavorite properties
            this.favorites = await this._getFavorites();

            // Read the state back rather than assuming the toggle took, so a
            // refused add leaves the icon faded instead of lying about it.
            const newState = FavoritesPanel.isHandleFavorite(this.actor, itemId);
            daggerButton.classList.toggle('faded', !newState);
        }, { signal: listenerSignal });

        // Light source click (light icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const lightIcon = event.target.closest('.tray-buttons .fa-lightbulb');
            if (!lightIcon) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            // Prevent multiple rapid clicks
            if (lightIcon.dataset.processing === 'true') return;
            lightIcon.dataset.processing = 'true';
            
            try {
                const favoriteItem = lightIcon.closest('.panel-item');
                if (!favoriteItem) return;
                const itemId = favoriteItem.dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (!item) return;

                // Get the player's token
                const token = LightUtility.getPlayerToken(this.actor);
                if (!token) {
                    ui.notifications.warn('No token selected. Please select a token on the canvas.');
                    return;
                }

                // Toggle light on/off
                const result = await LightUtility.toggleLightForToken(token, item);
                
                // Refresh favorites to update all light icon states
                this.favorites = await this._getFavorites();
                
                // Update all light icons in the panel
                this._updateLightIcons(nativeHtml);
                
                // Also update inventory panel if it exists
                if (PanelManager.instance?.inventoryPanel) {
                    PanelManager.instance.inventoryPanel.items = await PanelManager.instance.inventoryPanel._getItems();
                    PanelManager.instance.inventoryPanel._updateLightIcons(PanelManager.instance.inventoryPanel.element);
                }
            } finally {
                // Remove processing flag after a short delay to allow for async operations
                setTimeout(() => {
                    lightIcon.dataset.processing = 'false';
                }, 500);
            }
        }, { signal: listenerSignal });

        // Statblock warning badge — click to repair
        StatblockUtility.activateBadgeListener(panel, this.actor, listenerSignal);

        // Inline quantity editing on the count badge
        QuantityEditor.activateListener(panel, this.actor, listenerSignal);

        // Add clear all button listener
        // v13: Use nativeHtml instead of html
        const clearAllButton = nativeHtml.querySelector('.favorites-clear-all');
        if (clearAllButton) {
            clearAllButton.addEventListener('click', async () => {
                await FavoritesPanel.clearFavorites(this.actor);
            }, { signal: listenerSignal });
        }
    }

    destroy() {
        this._removeEventListeners(this.element);
        if (this._contextMenu) {
            this._contextMenu.close();
            this._contextMenu = null;
        }
        this.element = null;
    }

    // _syncHandleFavorites method removed - handle favorites are now manual

    async _reorderFavorite(itemId, newIndex) {
        const actor = this.actor;
        if (!actor) {
            return;
        }

        // Check if actor is from a compendium
        const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
        if (isFromCompendium) {
            return;
        }

        // Get the current panel favorites array
        const panelFavoriteIds = actor.getFlag(MODULE.ID, 'favoritePanel') || [];
        
        // Find the current index of the item ID
        const currentIndex = panelFavoriteIds.indexOf(itemId);
        if (currentIndex === -1) {
            return;
        }

        // Clamp the new index to valid range
        newIndex = Math.max(0, Math.min(newIndex, panelFavoriteIds.length - 1));
        
        // If no change, do nothing
        if (currentIndex === newIndex) {
            return;
        }

        // Remove item from current position and insert at new position
        const [movedId] = panelFavoriteIds.splice(currentIndex, 1);
        panelFavoriteIds.splice(newIndex, 0, movedId);

        try {
            // Clean up context menu before updates
            if (this._contextMenu) {
                this._contextMenu.close();
                delete this._contextMenu;
            }

            // Update the actor's panel favorites flag
            await actor.setFlag(MODULE.ID, 'favoritePanel', panelFavoriteIds);
            
            // Handle favorites are now completely manual - no auto-syncing needed
            
            // Update panels and handle
            if (PanelManager.instance) {
                // Update the handle
                await PanelManager.instance.updateHandle();
                
                // Update the favorites panel data and refresh display
                if (PanelManager.instance.favoritesPanel) {
                    PanelManager.instance.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
                    
                    // Refresh the favorites panel display to show the new order
                    if (PanelManager.instance.favoritesPanel.element) {
                        await PanelManager.instance.favoritesPanel.render(PanelManager.instance.favoritesPanel.element);
                    }
                }
                
                // Update other panels' data
                if (PanelManager.instance.inventoryPanel) {
                    PanelManager.instance.inventoryPanel.items = await PanelManager.instance.inventoryPanel._getItems();
                    PanelManager.instance.inventoryPanel._updateHeartIcons();
                }
                if (PanelManager.instance.weaponsPanel) {
                    PanelManager.instance.weaponsPanel.weapons = await PanelManager.instance.weaponsPanel._getWeapons();
                    PanelManager.instance.weaponsPanel._updateHeartIcons();
                }
                if (PanelManager.instance.spellsPanel) {
                    PanelManager.instance.spellsPanel.spells = await PanelManager.instance.spellsPanel._getSpells();
                    PanelManager.instance.spellsPanel._updateHeartIcons();
                }
                if (PanelManager.instance.featuresPanel) {
                    PanelManager.instance.featuresPanel.features = await PanelManager.instance.featuresPanel._getFeatures();
                    PanelManager.instance.featuresPanel._updateHeartIcons();
                }

            }

        } catch (error) {
            console.error('Error reordering favorites:', error);
        }
    }

    /**
     * Update light icon states to reflect current light status
     */
    _updateLightIcons(html) {
        if (!html) {
            html = this.element;
        }
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(html);
        if (!nativeElement) return;
        
        this.favorites.forEach(item => {
            if (!item.isLightSource) return;
            
            const lightIcon = nativeElement.querySelector(`[data-item-id="${item.id}"] .fa-lightbulb`);
            if (lightIcon) {
                if (item.isLightActive) {
                    lightIcon.classList.remove('faded');
                    lightIcon.classList.add('light-active');
                } else {
                    lightIcon.classList.add('faded');
                    lightIcon.classList.remove('light-active');
                }
            }
        });
    }
}


