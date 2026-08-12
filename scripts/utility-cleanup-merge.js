import { MODULE } from './const.js';

/**
 * utility-cleanup-merge.js — phase 2 of character sheet cleanup: fold duplicate
 * stacks of the same item into one.
 *
 * This is the half that deletes documents, so it is built the other way round
 * from phase 1: the snapshot comes first, the identity rules are deliberately
 * stricter than they need to be, and anything that cannot be merged says why
 * rather than quietly not appearing.
 *
 * ## "Duplicate" is the hard part; "merge" is arithmetic
 *
 * Same name is not the same item. Phase 1 exists so that identity can be an
 * equality check on `_stats.compendiumSource` rather than a guess — but a
 * shared source is necessary, not sufficient. Two copies from one compendium
 * entry can still be different things: one equipped and one not, one in a bag
 * and one loose, one identified and one not, one with a GM's edits.
 *
 * So the rule here is not a list of fields to compare. It is: **serialise both
 * copies, ignore the handful of properties that are per-instance bookkeeping,
 * and require the rest to be byte-identical.** A field-by-field comparison can
 * only catch differences somebody thought of in advance; a fingerprint catches
 * the edited description nobody thought of. The named fields below exist only
 * to *explain* a mismatch in English, never to decide one.
 *
 * ## Limited uses: usually fine, twice not
 *
 * Charges look like they should block a merge — one stack, one uses tracker,
 * so surely three torches at 3 uses each become one torch's worth? They do not,
 * for items dnd5e marks `uses.autoDestroy`. Its own `consumeItemUses` decrements
 * the quantity and resets `spent` to 0 when a stacked item runs dry, so uses are
 * per-unit-of-quantity in the system's model and the arithmetic comes out exact.
 * Torches, and most consumables, are precisely this case.
 *
 * Two narrower cases still block:
 *
 *   Not autoDestroy   Without it nothing decrements the quantity, so the stack
 *                     really does share one tracker and merging burns charges.
 *   Partly used       Even with autoDestroy the sum is only exact from full.
 *                     Three torches at 1 of 3 spent hold 6 uses; merged they
 *                     would hold 8, because only the first unit carries the
 *                     spend and the other two come back full. Inventing charges
 *                     is a quieter bug than losing them, not a smaller one.
 *
 * ## Active effects are refused outright
 *
 * The survivor keeps its own effects and the loser's are deleted with it. For
 * two *equipped* identical items — which fingerprint the same, so they would
 * otherwise merge — that halves what the character actually has.
 *
 * Containers are never even considered — each has contents, and merging two
 * bags orphans a bagful.
 *
 * ## Deleting an item breaks every reference to its id
 *
 * This is the part most likely to bite. Favourites are the immediate casualty:
 * Squire's `favoritePanel` holds raw ids and dnd5e's `system.favorites` holds
 * `.Item.<id>`, so a merge that only deletes silently unfavourites things —
 * undoing the sync those two share. References are therefore **remapped to the
 * survivor before the loser is deleted**, not cleaned up afterwards: Squire
 * prunes deleted ids on its own, so doing it in the other order loses the
 * favourite rather than moving it.
 */

/** Stackable physical goods. Containers are absent on purpose. */
const MERGEABLE_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot']);

const SNAPSHOT_FLAG = 'cleanupSnapshot';

/**
 * Per-instance bookkeeping, stripped before comparing. Everything NOT in this
 * list has to match — which is what makes the check honest about differences
 * nobody anticipated.
 */
const IGNORED_ROOT = ['_id', 'sort', 'folder', 'ownership', '_stats', 'flags'];

/**
 * Only used to put a mismatch into words. Adding to this list makes the
 * explanation better; it never makes anything mergeable that was not already.
 */
const SPLIT_REASONS = [
    { path: 'name', text: 'they have been renamed differently' },
    { path: 'system.container', text: 'they are in different containers' },
    { path: 'system.equipped', text: 'one copy is equipped and another is not' },
    { path: 'system.identified', text: 'one copy is unidentified' },
    { path: 'system.attuned', text: 'one copy is attuned' },
    { path: 'system.rarity', text: 'their rarity differs' },
    { path: 'system.price.value', text: 'their prices differ' },
    { path: 'system.description.value', text: 'their descriptions differ' }
];

/**
 * Everything about an item except which copy of it this is.
 *
 * `system.quantity` is excluded because it is the thing being summed. Effect
 * ids and origins are excluded because they are generated per embedded copy and
 * would make two otherwise identical items look different.
 */
function mergeFingerprint(item) {
    const data = item.toObject();
    for (const key of IGNORED_ROOT) delete data[key];
    if (data.system) delete data.system.quantity;
    data.effects = (data.effects ?? []).map(effect => {
        const copy = foundry.utils.deepClone(effect);
        delete copy._id;
        delete copy.origin;
        return copy;
    });
    return JSON.stringify(data);
}

/** A reason this item can never be merged, or null. */
function hardBlocker(item) {
    if (item.effects?.size) return 'they carry active effects';
    if (item.system?.attuned) return 'they are attuned';

    // Read from `_source`, not from `item.system`. `uses.max` is a formula field
    // that dnd5e evaluates during prepareData, so the prepared value can be a
    // number where the stored value is an empty string — and a prepared `0`
    // would read as "has limited uses" on every ordinary item on the sheet.
    const uses = item._source?.system?.uses ?? {};
    const max = String(uses.max ?? '').trim();
    if (max === '' || max === '0') return null;

    // See the header: autoDestroy is what makes uses per-unit-of-quantity, and
    // the sum is only exact from full.
    if (!uses.autoDestroy) return 'their charges are tracked per stack rather than per item';
    if (Number(uses.spent) > 0) return 'they have already been partly used';

    return null;
}

/** Why these copies did not cluster together, in English. */
function explainSplit(samples) {
    const differences = [];
    for (const reason of SPLIT_REASONS) {
        const values = new Set(samples.map(item => JSON.stringify(
            foundry.utils.getProperty(item, reason.path) ?? null
        )));
        if (values.size > 1) differences.push(reason.text);
    }
    return differences.length ? differences.join(', and ') : 'the copies are not identical';
}

/**
 * Which stacks could be folded together.
 *
 * @returns {{groups: Array, blocked: Array, considered: number}}
 */
export function scanDuplicates(actor) {
    const result = { groups: [], blocked: [], considered: 0 };
    if (!actor) return result;

    // Identity comes from the compendium source, so an item without one is not
    // a candidate — it is a phase 1 job first.
    const bySource = new Map();
    for (const item of actor.items ?? []) {
        if (!MERGEABLE_TYPES.has(item.type)) continue;
        const source = item._stats?.compendiumSource;
        if (!source) continue;
        result.considered++;
        if (!bySource.has(source)) bySource.set(source, []);
        bySource.get(source).push(item);
    }

    const favourites = new Set(actor.getFlag(MODULE.ID, 'favoritePanel') ?? []);

    for (const items of bySource.values()) {
        if (items.length < 2) continue;

        const usable = [];
        const refusals = new Set();
        for (const item of items) {
            const blocker = hardBlocker(item);
            if (blocker) refusals.add(blocker);
            else usable.push(item);
        }

        const clusters = new Map();
        for (const item of usable) {
            const key = mergeFingerprint(item);
            if (!clusters.has(key)) clusters.set(key, []);
            clusters.get(key).push(item);
        }

        let mergedAny = false;
        for (const cluster of clusters.values()) {
            if (cluster.length < 2) continue;
            mergedAny = true;

            // The survivor is a favourited copy where there is one, so the
            // fewest references have to move. They are identical, so which one
            // survives matters only for the remapping.
            const survivor = cluster.find(item => favourites.has(item.id)) ?? cluster[0];
            const losers = cluster.filter(item => item !== survivor);

            result.groups.push({
                id: survivor.id,
                name: survivor.name,
                img: survivor.img,
                stacks: cluster.length,
                totalQuantity: cluster.reduce((sum, item) => sum + (Number(item.system?.quantity) || 0), 0),
                quantities: cluster.map(item => Number(item.system?.quantity) || 0),
                favourited: cluster.some(item => favourites.has(item.id)),
                survivorId: survivor.id,
                loserIds: losers.map(item => item.id),
                // Flattened here rather than joined in the template: a dataset
                // attribute is a string either way, and Handlebars has no join.
                loserIdsCsv: losers.map(item => item.id).join(','),
                selected: true
            });
        }

        if (!mergedAny) {
            const reasons = [...refusals];
            if (clusters.size > 1) reasons.push(explainSplit([...clusters.values()].map(cluster => cluster[0])));
            result.blocked.push({
                name: items[0].name,
                img: items[0].img,
                count: items.length,
                reason: reasons.filter(Boolean).join('; ') || 'the copies are not identical'
            });
        }
    }

    const byName = (a, b) => a.name.localeCompare(b.name);
    result.groups.sort(byName);
    result.blocked.sort(byName);
    return result;
}

/**
 * Point every reference at the survivor.
 *
 * Runs BEFORE the deletion. Squire prunes ids of deleted items from its own
 * favourites, so remapping afterwards would find nothing left to move.
 */
async function remapReferences(actor, remap) {
    if (!remap.size) return;

    const update = {};
    const remapIds = (list) => {
        const seen = new Set();
        const next = [];
        for (const id of list) {
            const mapped = remap.get(id) ?? id;
            if (seen.has(mapped)) continue;
            seen.add(mapped);
            next.push(mapped);
        }
        return next;
    };

    for (const key of ['favoritePanel', 'favoritesSyncState']) {
        const current = actor.getFlag(MODULE.ID, key);
        if (!Array.isArray(current)) continue;
        const next = remapIds(current);
        if (JSON.stringify(next) !== JSON.stringify(current)) update[`flags.${MODULE.ID}.${key}`] = next;
    }

    // dnd5e stores item favourites as relative uuids, and the same array also
    // holds activity, effect and resource entries that must survive untouched.
    const favorites = actor.system?.favorites;
    if (Array.isArray(favorites)) {
        const seen = new Set();
        const next = [];
        for (const favorite of favorites) {
            const match = /^\.Item\.(.+)$/.exec(String(favorite?.id ?? ''));
            const mapped = match ? remap.get(match[1]) : null;
            const id = mapped ? `.Item.${mapped}` : favorite?.id;
            if (seen.has(id)) continue;
            seen.add(id);
            next.push({ ...favorite, id });
        }
        if (JSON.stringify(next) !== JSON.stringify(favorites)) update['system.favorites'] = next;
    }

    // Containers are never merged, so this cannot fire today. It is here because
    // the day that rule is relaxed, its absence would orphan a bagful silently.
    const contained = (actor.items ?? []).filter(item => remap.has(item.system?.container));
    if (contained.length) {
        await actor.updateEmbeddedDocuments('Item', contained.map(item => ({
            _id: item.id,
            'system.container': remap.get(item.system.container)
        })));
    }

    const effectUpdates = [];
    for (const effect of actor.effects ?? []) {
        const origin = String(effect.origin ?? '');
        for (const [loser, survivor] of remap) {
            if (!origin.endsWith(`.Item.${loser}`)) continue;
            effectUpdates.push({ _id: effect.id, origin: origin.replace(`.Item.${loser}`, `.Item.${survivor}`) });
            break;
        }
    }
    if (effectUpdates.length) await actor.updateEmbeddedDocuments('ActiveEffect', effectUpdates);

    if (Object.keys(update).length) await actor.update(update);
}

/**
 * Fold the selected groups together.
 *
 * @param {Actor} actor
 * @param {Array<{survivorId: string, loserIds: string[]}>} groups
 * @returns {Promise<{merged: number, removed: number, failed: number}>}
 */
export async function applyMerges(actor, groups = []) {
    const applied = { merged: 0, removed: 0, failed: 0 };
    if (!actor || !groups.length) return applied;

    // Re-validated at apply time. The scan may be minutes old, and equipping one
    // copy between the preview and the click is exactly the kind of thing that
    // makes two items stop being the same item.
    const work = [];
    for (const group of groups) {
        const survivor = actor.items.get(group.survivorId);
        if (!survivor || hardBlocker(survivor)) continue;
        const fingerprint = mergeFingerprint(survivor);
        const losers = (group.loserIds ?? [])
            .map(id => actor.items.get(id))
            .filter(item => item && !hardBlocker(item) && mergeFingerprint(item) === fingerprint);
        if (losers.length) work.push({ survivor, losers });
    }
    if (!work.length) return applied;

    // The snapshot carries the survivors as well as the losers: reverting has to
    // put the quantity back, not just resurrect what was removed.
    const snapshot = {
        at: Date.now(),
        actorName: actor.name,
        items: [],
        favoritePanel: foundry.utils.deepClone(actor.getFlag(MODULE.ID, 'favoritePanel') ?? null),
        favoritesSyncState: foundry.utils.deepClone(actor.getFlag(MODULE.ID, 'favoritesSyncState') ?? null),
        systemFavorites: foundry.utils.deepClone(actor.system?.favorites ?? null)
    };

    const updates = [];
    const deletes = [];
    const remap = new Map();
    for (const { survivor, losers } of work) {
        snapshot.items.push(survivor.toObject());
        for (const loser of losers) snapshot.items.push(loser.toObject());

        const total = [survivor, ...losers]
            .reduce((sum, item) => sum + (Number(item.system?.quantity) || 0), 0);
        updates.push({ _id: survivor.id, 'system.quantity': total });
        for (const loser of losers) {
            deletes.push(loser.id);
            remap.set(loser.id, survivor.id);
        }
    }

    try {
        // Written first, so a failure halfway through still leaves a way back.
        await actor.setFlag(MODULE.ID, SNAPSHOT_FLAG, snapshot);
        await actor.updateEmbeddedDocuments('Item', updates);
        await remapReferences(actor, remap);
        await actor.deleteEmbeddedDocuments('Item', deletes);
        applied.merged = work.length;
        applied.removed = deletes.length;
    } catch (error) {
        console.error(`${MODULE.ID}: merging duplicates failed:`, error);
        applied.failed = work.length;
    }

    return applied;
}

/** The last merge on this actor, if there is one to undo. */
export function getSnapshot(actor) {
    const snapshot = actor?.getFlag?.(MODULE.ID, SNAPSHOT_FLAG);
    if (!snapshot?.items?.length) return null;
    return {
        count: snapshot.items.length,
        at: snapshot.at ?? null,
        atLabel: snapshot.at ? new Date(snapshot.at).toLocaleString() : ''
    };
}

/**
 * Put the last merge back.
 *
 * Deleted items are re-created with `keepId`, which is what makes the undo
 * complete rather than approximate: the ids favourites and effect origins
 * pointed at come back too, so the restored favourites resolve.
 */
export async function revertMerge(actor) {
    const snapshot = actor?.getFlag?.(MODULE.ID, SNAPSHOT_FLAG);
    if (!snapshot?.items?.length) return { restored: 0, failed: false };

    const updates = [];
    const creates = [];
    for (const data of snapshot.items) {
        if (actor.items.get(data._id)) updates.push(data);
        else creates.push(data);
    }

    try {
        if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
        if (creates.length) await actor.createEmbeddedDocuments('Item', creates, { keepId: true });

        const restore = { [`flags.${MODULE.ID}.-=${SNAPSHOT_FLAG}`]: null };
        if (snapshot.favoritePanel !== null) restore[`flags.${MODULE.ID}.favoritePanel`] = snapshot.favoritePanel;
        if (snapshot.favoritesSyncState !== null) restore[`flags.${MODULE.ID}.favoritesSyncState`] = snapshot.favoritesSyncState;
        if (snapshot.systemFavorites !== null) restore['system.favorites'] = snapshot.systemFavorites;
        await actor.update(restore);

        return { restored: creates.length, failed: false };
    } catch (error) {
        console.error(`${MODULE.ID}: reverting the merge failed:`, error);
        return { restored: 0, failed: true };
    }
}
