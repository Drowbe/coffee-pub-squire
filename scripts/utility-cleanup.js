import { MODULE } from './const.js';
import { scanDuplicates, applyMerges } from './utility-cleanup-merge.js';

/**
 * utility-cleanup.js — tidy a character's sheet data without changing what the
 * character has.
 *
 * Phase 1 is deliberately the half that cannot lose anything:
 *
 *   Currency      consolidated to the fewest coins. Value-preserving — the same
 *                 money in fewer rows.
 *   Source links  `_stats.compendiumSource` backfilled on items that have none,
 *                 so an item knows where it came from.
 *
 * Neither creates, deletes, or removes anything. Merging duplicate stacks is
 * phase 2 and is a different animal: it deletes documents, and every reference
 * to a deleted id breaks with it — including favourites, which Squire and the
 * character sheet now share.
 *
 * ## Why backfilling links is the point, not the warm-up
 *
 * An item with no `compendiumSource` is an orphan. It is a copy of something,
 * with no record of what it is a copy of, so nothing downstream can ever
 * reason about it:
 *
 *   - **It cannot be repaired.** If the world item it was dragged from is
 *     edited, renamed, or deleted, the copy silently keeps whatever it had at
 *     the moment it was dragged — including a broken activity or a stale
 *     formula from an older system version. With a source recorded, Squire can
 *     later offer to refresh it from the compendium and the item survives the
 *     world changing underneath it.
 *   - **It cannot be identified.** Deciding whether two items called "Torch"
 *     are the same thing is guesswork by name; with a source on each it is an
 *     equality check. That is what phase 2 needs.
 *
 * The linking itself is a guess — a name lookup — so it happens once, in front
 * of a GM who can veto each row, rather than silently inside some later
 * operation that depends on it.
 *
 * ## What is deliberately NOT done
 *
 * Nothing is written to an item that already has a `compendiumSource`. A wrong
 * source is worse than a missing one — it would make two unrelated items look
 * identical to phase 2, and would aim any future refresh at the wrong entry —
 * so an existing value is always left alone, even when the resolver is
 * confident it knows better.
 *
 * And nothing is replaced today. Recording where an item came from is the
 * prerequisite for upgrading it later; it is not the upgrade.
 */

/** Only these item types are worth linking; the rest are character-specific. */
const LINKABLE_TYPES = new Set([
    'weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'spell', 'feat'
]);

/** Blacksmith's resolver takes a document kind, not a dnd5e item type. */
const RESOLVER_TYPE = { spell: 'spell', feat: 'feature' };

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

/** Where an item says it came from, or null. */
export function getCompendiumSource(item) {
    return item?._stats?.compendiumSource ?? null;
}

/**
 * A pack id is not a name anybody chose. `dnd-players-handbook.feats` is the
 * key; "D&D Player's Handbook · Feats" is what the GM sees in the sidebar, and
 * it is the only form that lets them judge whether the match came from a book
 * they trust.
 */
function packLabel(packId) {
    if (!packId) return '';
    if (packId === 'world') return 'This world';

    const pack = game.packs?.get(packId);
    if (!pack) return packId;

    const label = pack.metadata?.label ?? packId;
    const packageName = pack.metadata?.packageName;

    let owner = null;
    if (pack.metadata?.packageType === 'world') owner = game.world?.title;
    else if (packageName === game.system?.id) owner = game.system?.title;
    else owner = game.modules?.get(packageName)?.title ?? null;

    return owner && owner !== label ? `${owner} · ${label}` : label;
}

/** dnd5e's own label for an item type, so the wording matches the sheet. */
function typeLabel(type) {
    const key = CONFIG.Item?.typeLabels?.[type];
    return key ? game.i18n.localize(key) : type;
}

/**
 * What consolidating this actor's coins would do.
 *
 * Reports rather than acts, so the window can show the before and after and the
 * GM can decline. The arithmetic is dnd5e's — this mirrors it for the preview
 * only, and the actual write goes through the system.
 *
 * Reports the total as well as the split. "Same value, fewer coins" is a claim,
 * and a claim the GM cannot check at a glance is worth nothing; the total is
 * what makes it checkable. It also reports which denominations actually move,
 * because rendering every denomination in a before/after strip made unchanged
 * ones look like they were changing too.
 */
export function scanCurrency(actor) {
    const currency = actor?.system?.currency;
    if (!currency) return null;

    const currencies = Object.entries(CONFIG.DND5E?.currencies ?? {})
        .filter(([, config]) => config.conversion)
        .sort((a, b) => a[1].conversion - b[1].conversion);
    if (!currencies.length) return null;

    const smallest = currencies.at(-1)[1].conversion;
    const totalSmallest = currencies.reduce(
        (total, [denomination, config]) =>
            total + ((Number(currency[denomination]) || 0) * (smallest / config.conversion)),
        0
    );

    let amount = totalSmallest;
    const after = {};
    for (const [denomination, config] of currencies) {
        const ratio = smallest / config.conversion;
        after[denomination] = Math.floor(amount / ratio);
        amount -= after[denomination] * ratio;
    }

    const before = {};
    for (const [denomination] of currencies) before[denomination] = Number(currency[denomination]) || 0;

    const changed = currencies.some(([d]) => before[d] !== after[d]);

    const denominations = currencies.map(([denomination, config]) => ({
        key: denomination,
        label: game.i18n.localize(config.abbreviation ?? denomination),
        before: before[denomination],
        after: after[denomination],
        moved: before[denomination] !== after[denomination]
    }));

    // Expressed in the standard denomination (gp in stock dnd5e) rather than in
    // the smallest, because that is the unit people hold prices in.
    const standard = currencies.find(([, config]) => config.conversion === 1) ?? currencies.at(-1);
    const totalValue = totalSmallest * standard[1].conversion / smallest;

    const countCoins = source => currencies.reduce((sum, [d]) => sum + (source[d] || 0), 0);

    return {
        changed,
        // Whether the row arrives ticked, kept separate from whether there is
        // anything to do. Every tickable row in this window carries its own
        // state so the template never has to infer one from which list it is in.
        selected: changed,
        before,
        after,
        denominations,
        // Only the denominations that hold something, so a row of zeroes does
        // not pad out the strip.
        beforeCoins: denominations.filter(d => d.before > 0),
        afterCoins: denominations.filter(d => d.after > 0),
        coinCountBefore: countCoins(before),
        coinCountAfter: countCoins(after),
        totalValue,
        totalLabel: `${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${game.i18n.localize(standard[1].abbreviation ?? standard[0])}`
    };
}

/**
 * Which items could be told where they came from.
 *
 * Uses Blacksmith's `resolveMany` rather than a loop of `resolve`: it loads each
 * pack index once for the whole batch, and it owns the search order the GM
 * configured, so Squire is not inventing a second opinion about which
 * compendium wins.
 *
 * The results are split by whether they need a human, not by the resolver's
 * internal tier names. `exact` and `startsWith` are the resolver's vocabulary;
 * putting them on screen as tags made the GM learn an implementation detail in
 * order to read their own sheet. What they need to know is only ever "this one
 * is safe" or "look at this one before you accept it".
 *
 * @returns {Promise<object>}
 */
export async function scanCompendiumLinks(actor) {
    const result = {
        review: [],
        ready: [],
        alreadyLinked: 0,
        unmatched: [],
        unmatchedByType: [],
        skipped: 0,
        considered: 0
    };

    const compendiums = getBlacksmith()?.compendiums;
    if (!compendiums?.resolveMany) return result;

    const needsLink = [];
    for (const item of actor?.items ?? []) {
        if (!LINKABLE_TYPES.has(item.type)) { result.skipped++; continue; }
        result.considered++;
        // An existing source is never second-guessed: a wrong link is worse
        // than none, because phase 2 would treat it as identity.
        if (getCompendiumSource(item)) { result.alreadyLinked++; continue; }
        needsLink.push(item);
    }
    if (!needsLink.length) return result;

    // One batch per resolver type, since resolveMany takes a single type.
    const byType = new Map();
    for (const item of needsLink) {
        const type = RESOLVER_TYPE[item.type] ?? 'item';
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(item);
    }

    for (const [type, items] of byType) {
        let resolved = [];
        try {
            resolved = await compendiums.resolveMany(
                items.map(item => item.name),
                type,
                // itemType narrows to the dnd5e subtype where the resolver
                // supports it, so a "Longsword" feat can't match the weapon.
                { itemType: type === 'item' ? items[0]?.type : undefined }
            ) ?? [];
        } catch (error) {
            console.error(`${MODULE.ID}: compendium resolve failed for ${type}:`, error);
            continue;
        }

        items.forEach((item, index) => {
            const match = resolved[index];
            if (!match?.found || !match.uuid) {
                result.unmatched.push({ id: item.id, name: item.name, type: item.type });
                return;
            }

            const exact = match.matchType === 'exact';
            result[exact ? 'ready' : 'review'].push({
                id: item.id,
                name: item.name,
                type: item.type,
                typeLabel: typeLabel(item.type),
                img: item.img,
                uuid: match.uuid,
                matchedName: match.matchedName ?? match.name,
                sourceLabel: packLabel(match.packId ?? match.source),
                // Said in the GM's terms, not the resolver's. The only thing
                // that matters is whether the two names are actually the same.
                reason: exact ? '' : 'Different name',
                // Exact matches are safe to propose; anything looser is shown
                // but left for the GM to tick.
                selected: exact
            });
        });
    }

    const byName = (a, b) => a.name.localeCompare(b.name);
    result.review.sort(byName);
    result.ready.sort(byName);
    result.unmatched.sort(byName);

    // A bare "30 items could not be found" is unreadable: 30 out of what, and
    // is that a problem? The breakdown answers both, because seeing that they
    // are class features and species traits is what makes it obviously fine.
    const counts = new Map();
    for (const item of result.unmatched) {
        counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    }
    result.unmatchedByType = [...counts.entries()]
        .map(([type, count]) => ({ type, label: typeLabel(type), count }))
        .sort((a, b) => b.count - a.count);

    return result;
}

/** Everything cleanup would do to this actor. */
export async function scanActor(actor) {
    const links = await scanCompendiumLinks(actor);
    const duplicates = scanDuplicates(actor);
    return {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? '',
        currency: scanCurrency(actor),
        links,
        duplicates,
        // Precomputed for the template: Handlebars has no arithmetic, and the
        // counts are needed as denominators in several places.
        candidateCount: links.ready.length + links.review.length,
        // Merging identifies stacks by compendium source, so anything linked in
        // this same run only becomes a candidate on the next one. Said out loud
        // in the window rather than left to be discovered.
        mergeNeedsRescan: links.ready.length + links.review.length > 0
    };
}

/**
 * Apply the parts of a scan the GM kept.
 *
 * @param {Actor} actor
 * @param {object} plan
 * @param {boolean} plan.currency        consolidate coins
 * @param {string[]} plan.linkItemIds    item ids to stamp, and the uuid for each
 * @param {Map<string,string>} plan.linkUuids
 * @param {Array} plan.merges            duplicate groups to fold together
 * @returns {Promise<{currency: boolean, linked: number, merged: number, removed: number, failed: number}>}
 */
export async function applyCleanup(actor, plan) {
    const applied = { currency: false, linked: 0, merged: 0, removed: 0, failed: 0 };
    if (!actor) return applied;

    if (plan?.currency) {
        try {
            // dnd5e's own conversion, not a reimplementation: it reads the
            // configured rates, so homebrew currencies convert correctly and
            // the result matches what the sheet's own button would produce.
            const CurrencyManager = game.dnd5e?.applications?.CurrencyManager;
            if (CurrencyManager?.convertCurrency) {
                await CurrencyManager.convertCurrency(actor);
                applied.currency = true;
            }
        } catch (error) {
            console.error(`${MODULE.ID}: currency conversion failed:`, error);
            applied.failed++;
        }
    }

    const ids = plan?.linkItemIds ?? [];
    if (ids.length) {
        const updates = [];
        for (const id of ids) {
            const uuid = plan.linkUuids?.get?.(id);
            const item = actor.items.get(id);
            // Re-checked at apply time: the scan may be minutes old, and an
            // item that has since gained a source must not be overwritten.
            if (!uuid || !item || getCompendiumSource(item)) continue;
            updates.push({ _id: id, '_stats.compendiumSource': uuid });
        }

        if (updates.length) {
            try {
                await actor.updateEmbeddedDocuments('Item', updates);
                applied.linked = updates.length;
            } catch (error) {
                console.error(`${MODULE.ID}: linking items failed:`, error);
                applied.failed += updates.length;
            }
        }
    }

    // Merging last: it deletes documents, so anything that reads the sheet
    // should have had its turn first, and a link written above is still on the
    // survivor afterwards.
    if (plan?.merges?.length) {
        const result = await applyMerges(actor, plan.merges);
        applied.merged = result.merged;
        applied.removed = result.removed;
        applied.failed += result.failed;
    }

    return applied;
}
