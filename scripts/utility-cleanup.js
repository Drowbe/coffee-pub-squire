import { MODULE } from './const.js';

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
 * ## Why backfilling links comes first
 *
 * It looks like the least interesting step and it is the one that makes phase 2
 * possible. Deciding whether two items called "Torch" are the same thing is
 * guesswork by name; with a compendium source on each it is an equality check.
 * Doing it now also means the guessing happens once, under a GM's eye, rather
 * than silently inside a merge.
 *
 * ## What is deliberately NOT done
 *
 * Nothing is written to an item that already has a `compendiumSource`. A wrong
 * source is worse than a missing one — it would make two unrelated items look
 * identical to phase 2 — so an existing value is always left alone, even when
 * the resolver is confident it knows better.
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
 * What consolidating this actor's coins would do.
 *
 * Reports rather than acts, so the window can show the before and after and the
 * GM can decline. The arithmetic is dnd5e's — this mirrors it for the preview
 * only, and the actual write goes through the system.
 *
 * @returns {{changed: boolean, before: object, after: object, denominations: Array}|null}
 */
export function scanCurrency(actor) {
    const currency = actor?.system?.currency;
    if (!currency) return null;

    const currencies = Object.entries(CONFIG.DND5E?.currencies ?? {})
        .filter(([, config]) => config.conversion)
        .sort((a, b) => a[1].conversion - b[1].conversion);
    if (!currencies.length) return null;

    const smallest = currencies.at(-1)[1].conversion;
    let amount = currencies.reduce(
        (total, [denomination, config]) =>
            total + ((Number(currency[denomination]) || 0) * (smallest / config.conversion)),
        0
    );

    const after = {};
    for (const [denomination, config] of currencies) {
        const ratio = smallest / config.conversion;
        after[denomination] = Math.floor(amount / ratio);
        amount -= after[denomination] * ratio;
    }

    const before = {};
    for (const [denomination] of currencies) before[denomination] = Number(currency[denomination]) || 0;

    const changed = currencies.some(([d]) => before[d] !== after[d]);

    return {
        changed,
        before,
        after,
        denominations: currencies.map(([denomination, config]) => ({
            key: denomination,
            label: game.i18n.localize(config.abbreviation ?? denomination),
            before: before[denomination],
            after: after[denomination]
        }))
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
 * Results carry the resolver's own confidence. Only exact matches are proposed
 * ticked — a `startsWith` hit on "Potion of Healing" against "Potion of Healing
 * (Greater)" is exactly the kind of thing that should need a human.
 *
 * @returns {Promise<{candidates: Array, alreadyLinked: number, unmatched: Array, skipped: number}>}
 */
export async function scanCompendiumLinks(actor) {
    const result = { candidates: [], alreadyLinked: 0, unmatched: [], skipped: 0 };

    const compendiums = getBlacksmith()?.compendiums;
    if (!compendiums?.resolveMany) return result;

    const needsLink = [];
    for (const item of actor?.items ?? []) {
        if (!LINKABLE_TYPES.has(item.type)) { result.skipped++; continue; }
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
            result.candidates.push({
                id: item.id,
                name: item.name,
                type: item.type,
                img: item.img,
                uuid: match.uuid,
                matchedName: match.matchedName ?? match.name,
                source: match.source ?? '',
                matchType: match.matchType ?? 'unknown',
                confidence: match.confidence ?? 'low',
                // Exact matches are safe to propose; anything looser is shown
                // but left for the GM to tick.
                selected: match.matchType === 'exact'
            });
        });
    }

    return result;
}

/** Everything phase 1 would do to this actor. */
export async function scanActor(actor) {
    return {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? '',
        currency: scanCurrency(actor),
        links: await scanCompendiumLinks(actor)
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
 * @returns {Promise<{currency: boolean, linked: number, failed: number}>}
 */
export async function applyCleanup(actor, plan) {
    const applied = { currency: false, linked: 0, failed: 0 };
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

    return applied;
}
