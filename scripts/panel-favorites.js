import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement, renderTemplate, getActivityList, isSpellPrepared, getContainerInfo, activateContainerListener, applyItemTooltips, getBlacksmith, getActionType, getActionTypes, useOrOpenItem} from './helpers.js';
import { LightUtility } from './utility-lights.js';
import { StatblockUtility } from './utility-statblock.js';
import { QuantityEditor } from './utility-quantity.js';

// Universal actions every creature can take — the core-rules set plus common
// table extras. When an actions compendium drops these onto NPC sheets they
// all carry usable activities, which would flood auto-favorites with rules
// reminders (see: 25 hearts on one CR 9 caster). Matched by lowercased name.
/**
 * The tile footprints a favourite can take, as `columns x rows`.
 *
 * Width first, height second, the way CSS grid reads: `2x1` is two cells wide
 * and one tall. Order here is the order they appear in the context menu.
 */
const FAVORITE_SPANS = ['1x1', '2x1', '1x2', '2x2'];

/** Blacksmith addresses an open menu by id, so this is how it gets closed. */
const FAVORITE_MENU_ID = 'squire-favorite-menu';

/** The glyph for each footprint — the shape it makes, not an abstraction of it. */
const SPAN_ICONS = {
    '1x1': 'fa-square',
    '2x1': 'fa-rectangle-wide',
    '1x2': 'fa-rectangle-vertical',
    '2x2': 'fa-table-cells-large'
};

const GENERIC_ACTIONS_DEFAULT = [
    'activate an item', 'attack', 'break an object', 'cast a spell',
    'check cover', 'climb', 'climb onto a bigger creature', 'crawl', 'dash',
    'delay', 'difficult terrain', 'disarm', 'disengage', 'dismount', 'dodge',
    'doff armor', 'don armor', 'drop prone', 'end concentration', 'escape',
    'fall', 'falling', 'forced march', 'grapple', 'help', 'hide', 'high jump',
    'hold breath', 'holding breath', 'improvise', 'influence', 'interact',
    'interact with an object', 'jump', 'long jump', 'long rest', 'magic',
    'mount', 'move', 'opportunity attack', 'overrun', 'ready', 'ready action',
    'ready an action', 'ready spell', 'search', 'shove', 'shove aside',
    'short rest', 'squeeze', 'stabilize', 'stabilize a creature', 'stand up',
    'study', 'suffocating', 'suffocation', 'swim', 'take cover', 'travel pace',
    'tumble', 'two-weapon fighting', 'underwater', 'underwater combat',
    'use a magic item', 'use an object', 'utilize'
];

// The generic actions worth a scarce favorite slot. Everything else on the
// list above is a rules reminder the player already knows they can take —
// Jump and Mount don't earn a heart just because the compendium made them
// clickable. Ready and Disengage are the two that come up mid-turn often
// enough to want one click away.
const GENERIC_ACTIONS_FAVORITED_DEFAULT = [
    'disengage', 'ready', 'ready action', 'ready spell'
];

/** Parse a comma/newline separated setting into a lowercased name list. */
function parseNameListSetting(settingKey) {
    let raw = '';
    try {
        raw = game.settings.get(MODULE.ID, settingKey) || '';
    } catch (error) {
        // Setting not registered yet (early boot).
    }
    return String(raw)
        .split(/[,\n]/)
        .map(n => n.toLowerCase().trim())
        .filter(n => n.length > 0);
}

/**
 * Names treated as rules reminders rather than statblock content.
 *
 * The setting ADDS to the built-in list rather than replacing it. Matching is
 * exact, so this list is only ever as good as its spelling coverage — every
 * actions compendium names these slightly differently ("Suffocation" vs
 * "Suffocating"), and an unlisted name silently becomes a favorite. Replacing
 * would mean restating sixty names to add one, which is why a miss should cost
 * a single word.
 */
function getGenericActions() {
    return new Set([...GENERIC_ACTIONS_DEFAULT, ...parseNameListSetting('autoFavoriteGenericActions')]);
}

/**
 * The generic actions kept as favorites anyway.
 *
 * This one REPLACES the built-in list, because the useful edit here is
 * narrowing rather than extending — the default is already just Ready and
 * Disengage, and there has to be a way to drop even those.
 */
function getFavoritedGenericActions() {
    const configured = parseNameListSetting('autoFavoriteGenericActionsKept');
    return new Set(configured.length ? configured : GENERIC_ACTIONS_FAVORITED_DEFAULT);
}

export class FavoritesPanel {
    static getPanelFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoritePanel') || [];
    }

    // Handle favorites methods using array-based approach
    /**
     * Whether this actor cannot hold favorites at all.
     *
     * True for a null actor as well as for a compendium one, because the answer
     * to "can I store a flag on this" is no in both cases and every caller wants
     * to stop either way.
     *
     * It exists because the compendium test used to be inlined in nine methods,
     * each reading `actor.pack` as its very first statement — so any of them
     * handed a null actor threw before reaching a guard. That stayed hidden
     * while every path happened to be filtered by an earlier call that did
     * guard; the moment one of them became unconditional, it surfaced as a
     * TypeError from a hook.
     */
    static cannotHoldFavorites(actor) {
        if (!actor) return true;
        return Boolean(actor.pack || (actor.collection && actor.collection.locked));
    }

    static getHandleFavorites(actor) {
        if (!actor) return [];
        return actor.getFlag(MODULE.ID, 'favoriteHandle') || [];
    }

    static async setHandleFavorites(actor, ids) {
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
        if (isFromCompendium) {
            return;
        }
        await actor.setFlag(MODULE.ID, 'favoriteHandle', ids);
    }

    /**
     * Idempotently add an item to the panel favorites, preserving order.
     * Unlike manageFavorite this never removes — use it for automation paths
     * where a toggle would silently undo itself on a repeat event.
     * @returns {Promise<boolean>} true if the item was newly added
     */
    static async addPanelFavorite(actor, itemId) {
        if (!actor || !itemId) return false;
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
        if (isFromCompendium) return false;

        const current = this.getPanelFavorites(actor).filter(id => id !== null && id !== undefined);
        if (current.includes(itemId)) return false;
        await actor.setFlag(MODULE.ID, 'favoritePanel', [...current, itemId]);
        return true;
    }

    static async removeHandleFavorite(actor, itemId) {
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
        if (isFromCompendium) {
            return;
        }
        const ids = this.getHandleFavorites(actor)
            .filter(id => id !== null && id !== undefined && id !== itemId);
        await this.setHandleFavorites(actor, ids);
    }

    static async clearHandleFavorites(actor) {
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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

    /**
     * Repaint everything that shows favourite state, after the flag has changed.
     *
     * The heart icons live in four other panels and the handle, none of which
     * watch the flag — so whoever writes it is responsible for saying so. This
     * was inline in manageFavorite; it was extracted when the character-sheet
     * sync became a second writer and favourites toggled on the sheet did not
     * appear until the tray was rebuilt.
     *
     * @param {Actor} actor
     */
    static async refreshFavoritesUI(actor) {
        const panelManager = PanelManager.instance;
        if (!panelManager) return;

        // The handle carries its own favourites row.
        await panelManager.updateHandle();

        if (panelManager.favoritesPanel) {
            panelManager.favoritesPanel.favorites = FavoritesPanel.getPanelFavorites(actor);
            if (panelManager.favoritesPanel.element) {
                await panelManager.favoritesPanel.render(panelManager.favoritesPanel.element);
            }
        }

        // The others only need their hearts repainted, not a full re-render.
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

    static async manageFavorite(actor, itemId) {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        try {
            // Ensure we have a valid itemId and actor
            if (!itemId || !actor) {
                console.error("Invalid item ID or actor in manageFavorite:", { itemId, actor });
                return false;
            }

            const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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

            // Unfavouriting does NOT take the item off the handle. The two lists
            // are independent: the heart manages the Favourites panel, and the
            // handle holds what was dragged onto it. Removing something from the
            // panel used to silently empty its handle slot, which is the coupling
            // this pass exists to delete.

            await FavoritesPanel.refreshFavoritesUI(actor);

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
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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
            const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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
                // the generic actions: Ready/Disengage belong to every creature,
                // not this one's kit.
                //
                // Not truncated. It used to be cut to the handle's cap, which
                // meant a big statblock silently lost most of its kit; the strip
                // decides how many it can show at render time, and the rest wait
                // in the flag for a taller window rather than being discarded.
                const handleToAdd = [...weapons, ...spells, ...statblockFeatures].map(item => item.id);
                const existingHandle = FavoritesPanel.getHandleFavorites(actor)
                    .filter(id => id !== null && id !== undefined);
                const newHandleFavorites = [...existingHandle, ...handleToAdd.filter(id => !existingHandle.includes(id))];
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

    /**
     * The right-click menu for one favourite, built fresh each time it opens.
     *
     * Blacksmith's menu takes a plain array and has no `condition` hook, which
     * suits this better than the one it replaced: the entries that depend on
     * where a row sits in the list are simply not pushed, rather than pushed and
     * then hidden by a callback that re-derives the same index.
     */
    _buildMenuItems(itemId) {
        const favorites = this.actor.getFlag(MODULE.ID, 'favoritePanel') || [];
        const index = favorites.indexOf(itemId);
        const items = [];

        if (index > 0) {
            items.push({
                name: 'Move to Top',
                icon: 'fa-solid fa-angle-double-up',
                callback: () => this._reorderFavorite(itemId, 0)
            }, {
                name: 'Move Up',
                icon: 'fa-solid fa-angle-up',
                callback: () => this._reorderFavorite(itemId, index - 1)
            });
        }

        if (index > -1 && index < favorites.length - 1) {
            items.push({
                name: 'Move Down',
                icon: 'fa-solid fa-angle-down',
                callback: () => this._reorderFavorite(itemId, index + 1)
            }, {
                name: 'Move to Bottom',
                icon: 'fa-solid fa-angle-double-down',
                callback: () => this._reorderFavorite(itemId, favorites.length - 1)
            });
        }

        // Tile size, as a flyout. The four footprints are one question with four
        // answers, and four sibling rows in the top level would have read as four
        // unrelated commands. Only in the tile layout: offering to make a list
        // row two cells tall would be offering nothing.
        if (FavoritesPanel.getLayout() === 'tiles') {
            const current = FavoritesPanel.getSpan(this.actor, itemId);
            if (items.length) items.push({ separator: true });
            items.push({
                name: 'Tile Size',
                icon: 'fa-solid fa-up-right-and-down-left-from-center',
                description: current.replace('x', ' × '),
                submenu: FAVORITE_SPANS.map(span => ({
                    name: span.replace('x', ' × '),
                    icon: `fa-solid ${SPAN_ICONS[span]}`,
                    // The current size is shown but not clickable, so the menu
                    // says which one you are on instead of leaving you to infer
                    // it from the tile — and clicking it cannot be a silent
                    // no-op that looks like a failure.
                    disabled: span === current,
                    callback: async () => {
                        await FavoritesPanel.setSpan(this.actor, itemId, span);
                        await this.render(this.element);
                    }
                }))
            });
        }

        return items;
    }

    /**
     * How much of the tile grid one favourite takes, as `columns x rows`.
     *
     * Stored per actor in a `favoriteSpans` map rather than as a flag on the
     * item, because it is a fact about this panel's layout and not about the
     * longsword. Writing it to the item would also put a Squire key on a
     * document that may be shared, moved or exported, to say something that
     * means nothing outside this grid.
     *
     * Keys for items that are no longer favourites are simply ignored on read.
     * They cost a few bytes, and clearing them on unfavourite would mean the
     * heart silently discarding a layout choice that comes straight back the
     * moment the item is favourited again.
     */
    static getSpan(actor, itemId) {
        const spans = actor?.getFlag(MODULE.ID, 'favoriteSpans') || {};
        const span = spans[itemId];
        return FAVORITE_SPANS.includes(span) ? span : '1x1';
    }

    static async setSpan(actor, itemId, span) {
        if (!actor || !itemId || !FAVORITE_SPANS.includes(span)) return;

        const spans = { ...(actor.getFlag(MODULE.ID, 'favoriteSpans') || {}) };
        // 1x1 is the default, so it is stored as absence rather than as a value.
        // Otherwise every tile anybody ever touched would sit in the map saying
        // "ordinary", and the map would only ever grow.
        if (span === '1x1') delete spans[itemId];
        else spans[itemId] = span;

        await actor.setFlag(MODULE.ID, 'favoriteSpans', spans);
    }

    /**
     * The tile caption's second line: what kind of thing this is, and how heavy.
     *
     * Only the tiles draw it -- a list row has the whole panel width for its
     * name and does not need telling that a longsword is a weapon. A tile
     * clips the name to two short lines over a picture, where "Weapon · 4 lb"
     * is most of what distinguishes two similar-looking icons.
     *
     * Shaped after the merchant module's rows, which read "Weapon · 4 lb" in
     * the same slot. Spells say their level instead of a weight, because a
     * spell has no weight and its level is the thing you actually sort them by.
     */
    static _getDetailLabel(item) {
        const kind = item.type === 'feat'
            ? 'Feature'
            : item.type.charAt(0).toUpperCase() + item.type.slice(1);

        if (item.type === 'spell') {
            const level = Number(item.system?.level);
            if (!Number.isFinite(level)) return kind;
            return level === 0 ? 'Cantrip' : `${kind} · Level ${level}`;
        }

        // dnd5e moved weight from a plain number to `{value, units}` partway
        // through 3.x, so both shapes are still in the wild on older worlds.
        let weight = item.system?.weight;
        if (weight && typeof weight === 'object') weight = weight.value;
        const pounds = Number(weight);
        if (!Number.isFinite(pounds) || pounds <= 0) return kind;

        // Trailing zeroes off a fractional weight: "0.25 lb" but "4 lb", not
        // "4.00 lb". A column of ragged decimals reads as noise.
        return `${kind} · ${Number(pounds.toFixed(2))} lb`;
    }

    /**
     * How the favourites view draws its rows: 'list' or 'tiles'.
     *
     * Validated rather than returned raw, so a setting written by an older
     * build or edited by hand lands on the list instead of on a layout class
     * no stylesheet defines -- which would render as an unstyled column of
     * naked rows rather than as anything recognisable.
     */
    static getLayout() {
        const stored = game.settings.get(MODULE.ID, 'favoritesLayout');
        return stored === 'tiles' ? 'tiles' : 'list';
    }

    constructor(actor) {
        this.actor = actor;
        this.favorites = []; // Initialize empty, will be populated in render
        this._listenerController = null;
        // Initialize filter states

        
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
                const isLightSource = await LightUtility.isLightSource(item);
                let isLightActive = false;
                
                if (isLightSource && effectiveActiveLightSourceId) {
                    const itemLightSourceId = await LightUtility.getLightSourceId(item);
                    isLightActive = itemLightSourceId === effectiveActiveLightSourceId;
                }
                
                const isSpell = item.type === 'spell';
                const hasActionBadge = getActionType(item) !== 'passive';
                const canEditThisQuantity = canEditQuantity && item.system?.quantity !== undefined;

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
                    actionType: getActionType(item),
                    actionTypes: getActionTypes(item).join(' '),
                    // Favorites is the one list that mixes every item kind, so
                    // "where applicable" has to be decided per row rather than
                    // per panel: a spell carries a prepare state and no equip
                    // state, a rope carries neither, and each chip simply skips
                    // the rows that don't answer to it.
                    equipState: item.system?.equipped === undefined
                        ? null
                        : (item.system.equipped ? 'equipped' : 'unequipped'),
                    prepareState: isSpell
                        ? ((item.system.level === 0 || isSpellPrepared(item)) ? 'prepared' : 'unprepared')
                        : null,
                    // The context span carries 4px of margin, so it only earns
                    // its place when something is going inside it.
                    showContext: hasActionBadge || canEditThisQuantity,
                    statblockIssue: StatblockUtility.getBadge(issueMap.get(item.id), this.actor),
                    canEditQuantity: canEditThisQuantity,
                    isNew: !!(item.getFlag(MODULE.ID, 'isNew') || PanelManager.newlyAddedItems?.has(item.id)),
                    container: getContainerInfo(item, this.actor),
                    detailLabel: FavoritesPanel._getDetailLabel(item),
                    span: FavoritesPanel.getSpan(this.actor, item.id),
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
            hasFavorites: this.favorites.length > 0,
            layout: FavoritesPanel.getLayout()
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
        
        // Update light icons
        this._updateLightIcons(html);

        PanelManager.instance?.controlPanel?.reapplyFilters();
    }

    _removeEventListeners(panel) {
        if (this._listenerController) {
            this._listenerController.abort();
            this._listenerController = null;
        }
        
        // All listeners are registered with this controller's signal, so aborting it
        // above removes them — no element cloning needed.
        
        // An open menu is closed rather than left floating. Blacksmith's menu
        // lives on `document.body`, not inside the row it was opened from, so
        // replacing this panel's markup no longer takes it with it — it would
        // otherwise sit there over an empty panel, its entries still pointing at
        // rows that have been rebuilt underneath it.
        getBlacksmith()?.uiContextMenu?.close(FAVORITE_MENU_ID);
    }

    _activateListeners(html) {
        if (!html) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Same rich hover card the dnd5e sheet shows for these items.
        applyItemTooltips(nativeHtml, this.actor);

        const panel = nativeHtml.querySelector('[data-panel="favorites"]');
        if (!panel) return;
        this._removeEventListeners(panel);
        this._listenerController = new AbortController();
        const listenerSignal = this._listenerController.signal;
        
        // The right-click menu, from Blacksmith rather than from Foundry.
        //
        // Foundry's ContextMenu INJECTS its markup into the row it was opened
        // on and positions it there. A favourites tile is `overflow: hidden` —
        // it has to be, to keep the artwork inside its rounded corners — so the
        // menu was being clipped to nothing on every tile while still working
        // in the list. Blacksmith's appends to `document.body` at the pointer,
        // which no ancestor can clip, and brings flyouts and zones with it.
        panel.addEventListener('contextmenu', (event) => {
            const row = event.target.closest('.panel-item[data-item-id]');
            if (!row) return;

            const menu = getBlacksmith()?.uiContextMenu;
            // No Blacksmith means no menu. Letting the browser's own appear
            // instead would offer Copy Image on a tile, which is worse than
            // nothing happening.
            if (!menu) return;

            event.preventDefault();
            event.stopPropagation();

            const items = this._buildMenuItems(row.dataset.itemId);
            if (!items.length) return;

            menu.show({
                id: FAVORITE_MENU_ID,
                x: event.clientX,
                y: event.clientY,
                zones: items,
                className: 'squire-favorite-context-menu'
            });
        }, { signal: listenerSignal });

        // Roll/Use item — delegated to the panel (one listener regardless of list size)
        panel.addEventListener('click', async (event) => {
            if (!event.target.classList.contains('panel-item-roll-overlay')) return;
            if (!event.target.closest('.panel-item-image-container')) return;
            event.preventDefault();
            event.stopPropagation();
            const favoriteItem = event.target.closest('.panel-item');
            if (!favoriteItem) return;
            const itemId = favoriteItem.dataset.itemId;
            await useOrOpenItem(this.actor.items.get(itemId), event);
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

        // Open the container an item is stored inside
        activateContainerListener(panel, this.actor, listenerSignal);

        // List / tiles. Delegated on the panel like everything else here, and
        // re-rendered rather than just re-classed: the row markup is identical
        // in both layouts, but a re-render is what keeps the header's own lit
        // state in step with what it just did.
        panel.addEventListener('click', async (event) => {
            const toggle = event.target.closest('.favorites-layout-toggle');
            if (!toggle) return;
            event.preventDefault();
            event.stopPropagation();

            const layout = toggle.dataset.layout;
            if (layout === FavoritesPanel.getLayout()) return;
            await game.settings.set(MODULE.ID, 'favoritesLayout', layout);
            await this.render(this.element);
        }, { signal: listenerSignal });

        // Add clear all button listener
        // v13: Use nativeHtml instead of html
        const clearAllButton = nativeHtml.querySelector('.favorites-clear-all');
        if (clearAllButton) {
            clearAllButton.addEventListener('click', async () => {
                // One click used to empty the whole list with nothing to undo it,
                // and the icon sits in a header row beside things that only
                // change what you're looking at. Rebuilding a favourites list is
                // slow and fiddly, so this asks first — the same shape of confirm
                // the quantity editor uses before deleting an item.
                const count = FavoritesPanel.getPanelFavorites(this.actor)?.length ?? 0;
                if (!count) return;

                const dialog = getBlacksmith()?.dialog;
                if (!dialog) {
                    // Without a confirm surface, refuse rather than silently
                    // throwing the list away.
                    ui.notifications.warn('Squire: cannot confirm clearing favorites — remove them individually instead.');
                    return;
                }

                const confirmed = await dialog.confirm({
                    title: 'Clear Favorites',
                    content: `<p>Remove all <strong>${count}</strong> favorite${count === 1 ? '' : 's'} from <strong>${foundry.utils.escapeHTML(this.actor.name)}</strong>?</p><p>This also clears the handle favorites, and cannot be undone.</p>`,
                    confirmLabel: 'Clear Favorites',
                    confirmIcon: 'fa-solid fa-heart-circle-xmark',
                    destructive: true
                });
                if (!confirmed) return;

                await FavoritesPanel.clearFavorites(this.actor);
            }, { signal: listenerSignal });
        }
    }

    destroy() {
        this._removeEventListeners(this.element);
        this.element = null;
    }

    // _syncHandleFavorites method removed - handle favorites are now manual

    async _reorderFavorite(itemId, newIndex) {
        const actor = this.actor;
        if (!actor) {
            return;
        }

        // Check if actor is from a compendium
        const isFromCompendium = FavoritesPanel.cannotHoldFavorites(actor);
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


