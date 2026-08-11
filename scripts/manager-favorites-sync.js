import { MODULE } from './const.js';

/**
 * manager-favorites-sync.js — keep Squire's favourites and the dnd5e character
 * sheet's favourites in step, in both directions.
 *
 * The two sides store the same idea very differently:
 *
 *   Squire   `flags.coffee-pub-squire.favoritePanel` — an ordered array of raw
 *            item ids. Order is insertion order; there is no sort value.
 *
 *   dnd5e    `system.favorites` — an array of `{ type, id, sort }`. Item entries
 *            carry a RELATIVE uuid (`.Item.<id>`), and sort is an integer.
 *
 * Two things about the sheet's array matter more than the shape:
 *
 *   1. **It is not only items.** Activities (`type: 'activity'`), effects
 *      (`type: 'effect'`) and resources (`id: 'resources.primary'`) live in the
 *      same array. Squire has no concept of any of them, so they are carried
 *      through untouched. Rewriting the array from Squire's item list alone
 *      would silently delete a character's favourited activities — data Squire
 *      never owned and cannot reconstruct.
 *
 *   2. **It is a character-sheet field.** `system.favorites` is declared on the
 *      character data model, so NPCs and vehicles do not have it. Absence is
 *      normal, not an error, and means "nothing to sync".
 *
 * ## Deciding what changed
 *
 * With only two lists in hand, "they differ" does not say which side moved — an
 * item present in Squire and absent from the sheet could be a Squire addition or
 * a sheet removal, and guessing wrong undoes the user's actual edit. So each
 * successful sync records the agreed list in
 * `flags.coffee-pub-squire.favoritesSyncState`, and subsequent syncs diff both
 * sides against that shared ancestor. It is a three-way merge, for the same
 * reason version control uses one.
 *
 * Before the first sync there is no ancestor, so the two lists are unioned
 * rather than diffed — that is the "merge on first run" case, and it is why the
 * state flag doubles as the have-we-synced marker.
 *
 * Squire wins on ORDER, which is the only thing the two sides can genuinely
 * disagree about: both lists are sets, so an add or a remove from either side is
 * simply honoured. The merged list is emitted in Squire's order, with anything
 * the sheet contributed appended in sheet order.
 */

/**
 * Actors currently being written to by this module.
 *
 * Every write here lands as an `updateActor`, which is the same hook that
 * triggers a sync — without this the first sync would re-enter itself. Keyed on
 * actor id and cleared in a `finally`, so a throw mid-sync cannot wedge an actor
 * permanently out of sync.
 */
const _syncing = new Set();

/** dnd5e item favourites are stored as relative uuids. */
const ITEM_PREFIX = '.Item.';

const toFavoriteId = (itemId) => `${ITEM_PREFIX}${itemId}`;
const toItemId = (favoriteId) => favoriteId.slice(ITEM_PREFIX.length);

const isItemFavorite = (favorite) =>
    favorite?.type === 'item' && typeof favorite.id === 'string' && favorite.id.startsWith(ITEM_PREFIX);

/**
 * Whether this actor can and should be synced.
 *
 * Ownership matters because both sides are actor writes: a player without
 * permission would fail on the sheet half and leave the two sides disagreeing,
 * which is worse than not syncing at all.
 */
function canSync(actor) {
    if (!actor?.id || actor.pack) return false;
    if (!actor.isOwner) return false;
    // Character-only: NPCs have no system.favorites, and creating one would be
    // inventing a field the sheet does not read.
    return Array.isArray(actor.system?.favorites);
}

/** Squire's list, filtered to items the actor still has. */
function readSquireFavorites(actor) {
    const raw = actor.getFlag(MODULE.ID, 'favoritePanel');
    if (!Array.isArray(raw)) return [];
    return raw.filter(id => id && actor.items.has(id));
}

/**
 * The sheet's item favourites as raw item ids, plus everything else verbatim.
 *
 * Entries pointing at items the actor no longer has are dropped from `items` but
 * NOT from `others` — a stale item favourite is Squire's to tidy, anything else
 * is not Squire's business.
 */
function readSheetFavorites(actor) {
    const favorites = actor.system.favorites ?? [];
    const items = [];
    const others = [];

    for (const favorite of favorites) {
        if (!isItemFavorite(favorite)) {
            others.push(favorite);
            continue;
        }
        const itemId = toItemId(favorite.id);
        if (actor.items.has(itemId)) items.push(itemId);
    }

    // Sheet order is the sort value, not array order.
    const sortOf = new Map(
        favorites.filter(isItemFavorite).map(f => [toItemId(f.id), f.sort ?? 0])
    );
    items.sort((a, b) => (sortOf.get(a) ?? 0) - (sortOf.get(b) ?? 0));

    return { items, others };
}

/**
 * Merge the two lists.
 *
 * @param {string[]} squire     item ids favourited in Squire, in Squire's order
 * @param {string[]} sheet      item ids favourited on the sheet, in sheet order
 * @param {string[]|null} last  the agreed list at the previous sync, or null for the first
 * @returns {string[]} the list both sides should hold
 */
export function mergeFavorites(squire, sheet, last) {
    // First run: no ancestor to diff against, so neither side's absence can mean
    // "removed". Union, Squire's order first.
    if (!Array.isArray(last)) {
        return [...squire, ...sheet.filter(id => !squire.includes(id))];
    }

    const lastSet = new Set(last);
    const squireSet = new Set(squire);
    const sheetSet = new Set(sheet);

    // Membership has no conflicts to arbitrate. An item is either in the shared
    // ancestor or it is not, and each side has either changed that or left it
    // alone — "still has it" is not a competing edit, it is the absence of one.
    // So an addition on either side is honoured, and so is a removal.
    //
    // Resolving removals in Squire's favour instead would make unfavouriting on
    // the character sheet impossible: the item would reappear on the next sync,
    // which is the opposite of honouring changes to each side.
    const keep = new Set();
    for (const id of new Set([...squire, ...sheet, ...last])) {
        const inSquire = squireSet.has(id);
        const inSheet = sheetSet.has(id);

        if (lastSet.has(id)) {
            // Known to both at the last sync: it survives only if neither has
            // since dropped it.
            if (inSquire && inSheet) keep.add(id);
        } else {
            // New since the last sync: whichever side added it, keep it.
            keep.add(id);
        }
    }

    // Squire's order leads; anything the sheet contributed follows in sheet order.
    const ordered = squire.filter(id => keep.has(id));
    for (const id of sheet) if (keep.has(id) && !ordered.includes(id)) ordered.push(id);
    for (const id of last) if (keep.has(id) && !ordered.includes(id)) ordered.push(id);
    return ordered;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Bring both sides into agreement for one actor.
 *
 * Safe to call spuriously: when nothing differs it writes nothing, which is what
 * stops the `updateActor` hook from ping-ponging.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} true if anything was written
 */
export async function syncFavorites(actor) {
    if (!canSync(actor) || _syncing.has(actor.id)) return false;

    _syncing.add(actor.id);
    try {
        const squire = readSquireFavorites(actor);
        const { items: sheet, others } = readSheetFavorites(actor);
        const last = actor.getFlag(MODULE.ID, 'favoritesSyncState');

        const merged = mergeFavorites(squire, sheet, Array.isArray(last) ? last : null);

        let wrote = false;

        if (!sameList(merged, squire)) {
            await actor.setFlag(MODULE.ID, 'favoritePanel', merged);
            wrote = true;
        }

        if (!sameList(merged, sheet)) {
            // Rebuilt from `others` + our items, so activities, effects and
            // resource favourites survive untouched. Sorts are reassigned in
            // merged order using Foundry's own density so the sheet's own
            // drag-to-reorder keeps working afterwards.
            const density = CONST.SORT_INTEGER_DENSITY;
            const rebuilt = [
                ...others,
                ...merged.map((itemId, index) => ({
                    type: 'item',
                    id: toFavoriteId(itemId),
                    sort: (index + 1) * density
                }))
            ];
            await actor.update({ 'system.favorites': rebuilt });
            wrote = true;
        }

        if (!Array.isArray(last) || !sameList(merged, last)) {
            await actor.setFlag(MODULE.ID, 'favoritesSyncState', merged);
            wrote = true;
        }

        return wrote;
    } catch (error) {
        console.error('Coffee Pub Squire | Error syncing favorites:', error);
        return false;
    } finally {
        _syncing.delete(actor.id);
    }
}

/**
 * Hook entry point: something changed on an actor.
 *
 * Only reacts to the two fields that matter, so an unrelated actor update — HP,
 * conditions, anything — does not drag a sync in behind it.
 */
export async function onActorUpdated(actor, changes) {
    if (!actor?.id || _syncing.has(actor.id)) return;

    const touchedSheet = foundry.utils.hasProperty(changes, 'system.favorites');
    const touchedSquire = foundry.utils.hasProperty(changes, `flags.${MODULE.ID}.favoritePanel`);
    if (!touchedSheet && !touchedSquire) return;

    await syncFavorites(actor);
}

/**
 * Hook entry point: an item left the actor.
 *
 * A deleted item leaves a dangling entry on both sides. Squire's own list is
 * filtered on read, but the sheet's is not, so a sync is the tidiest way to have
 * both drop it — and it keeps the recorded state honest for the next merge.
 */
export async function onItemRemoved(item) {
    const actor = item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!canSync(actor)) return;

    const stale = (actor.getFlag(MODULE.ID, 'favoritesSyncState') ?? []).includes(item.id);
    if (!stale) return;

    await syncFavorites(actor);
}
