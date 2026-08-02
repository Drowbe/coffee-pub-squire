import { MODULE } from './const.js';
import { showSquireToast } from './helpers.js';

/**
 * Adapter over Blacksmith's Compendiums API for the tray's quick-add search.
 *
 * Everything that touches the upstream API is funnelled through here, so an
 * upstream signature change is one file to reconcile — the panel below only
 * ever sees the normalized shape defined by `_normalize()`.
 *
 *   api.compendiums.searchDetailed(query, type, {
 *       itemType, limit, sources, minLength, fuzzy
 *   }) -> Promise<{
 *       results: Array<{ uuid, name, type, documentClass, img,
 *                        source, sourceLabel, sourcePackage, matchType }>,
 *       truncated, searchOrder, scannedSources, skippedSources
 *   }>
 *
 * `search()` returns the same thing as `.results` alone; we use the detailed
 * form so the truncation notice can state a fact instead of inferring one.
 *
 * When the API is absent `isAvailable()` is false and the panel says so rather
 * than silently returning nothing. Deliberately no local fallback that reads
 * pack indexes directly: that would build a second index cache alongside
 * Blacksmith's with independent invalidation, which is the whole reason the
 * search belongs upstream.
 */

// Types worth offering in a character-facing quick-add. Blacksmith maps these
// separately (a weapon is an Item, a spell is a Spell), which is also what makes
// "search items vs search spells" unnecessary as a mode: each type resolves to
// its own configured packs, so grouping results by source separates them anyway.
const SEARCHABLE_TYPES = ['Item', 'Spell', 'Feature'];

// Below this, a query matches most of the SRD and isn't worth running.
const MIN_QUERY_LENGTH = 2;

// Per-type cap. The panel renders into a narrow tray column, and a two-letter
// query against a full pack set is thousands of hits.
const RESULT_LIMIT = 40;

export class CompendiumSearchUtility {

    static getApi() {
        return game.modules.get('coffee-pub-blacksmith')?.api?.compendiums;
    }

    /** Whether the upstream search method exists yet. */
    static isAvailable() {
        return typeof this.getApi()?.search === 'function';
    }

    static getMinQueryLength() {
        return MIN_QUERY_LENGTH;
    }

    /**
     * Types this world actually has mappings for, intersected with the ones we
     * care about — searching a type with no configured packs just wastes a call.
     */
    static getSearchableTypes() {
        const api = this.getApi();
        try {
            const available = api?.getTypes?.();
            if (!Array.isArray(available)) return SEARCHABLE_TYPES;
            const lookup = new Set(available.map(t => String(t).toLowerCase()));
            const matched = SEARCHABLE_TYPES.filter(t => lookup.has(t.toLowerCase()));
            return matched.length ? matched : SEARCHABLE_TYPES;
        } catch (error) {
            return SEARCHABLE_TYPES;
        }
    }

    /**
     * Coerce one upstream result into the shape the panel renders.
     * Tolerant about field names so a small upstream naming difference doesn't
     * break the panel — this is the seam that absorbs it.
     */
    static _normalize(entry, fallbackType) {
        if (!entry?.uuid) return null;
        const source = entry.source ?? 'world';
        return {
            uuid: entry.uuid,
            name: entry.name ?? 'Unknown',
            // Blacksmith's index entries carry the document subtype; the API
            // type is the fallback when a result omits it.
            type: entry.type ?? fallbackType ?? '',
            // The document CLASS, for Foundry's native drag payload — distinct
            // from `type`, which is the subtype shown on the row badge. Not
            // derivable from the type token we searched: a Spell result is
            // documentClass 'Item', because spells live in Item packs.
            documentClass: entry.documentClass ?? '',
            img: entry.img || 'icons/svg/item-bag.svg',
            source,
            // Take both label fields as given. Never rebuild them from
            // getChoices(), whose values are display strings for a settings
            // dropdown rather than structured data.
            //
            // The pack name alone is ambiguous — several packages ship a pack
            // called "Equipment" — so the package name is rendered alongside it
            // as a quiet second element rather than concatenated into one string.
            sourceLabel: entry.sourceLabel || source,
            sourcePackage: entry.sourcePackage ?? '',
            matchType: entry.matchType ?? ''
        };
    }

    /**
     * Search every relevant type at once and return results grouped by source.
     *
     * Groups preserve first-appearance order, which — given the API returns
     * results in configured source priority — means the GM's Priority 1 pack
     * heads the list without us re-deriving the ordering.
     *
     * @returns {Promise<{available: boolean, tooShort: boolean, groups: Array, total: number}>}
     */
    static async search(query) {
        const trimmed = String(query ?? '').trim();

        if (!this.isAvailable()) {
            return { available: false, tooShort: false, groups: [], total: 0, truncated: false, skippedCount: 0 };
        }
        if (trimmed.length < MIN_QUERY_LENGTH) {
            return { available: true, tooShort: true, groups: [], total: 0, truncated: false, skippedCount: 0 };
        }

        const api = this.getApi();
        const types = this.getSearchableTypes();

        // `limit` stops the scan, not just the output: once reached, remaining
        // packs are never indexed, so the tail of the priority order can drop
        // out entirely rather than being sampled. The API reports this directly.
        //
        // Deliberately not inferred from `results.length === limit`: a scan that
        // fills the cap exactly with the last available candidate is complete,
        // so that test raises a false "content is missing" on any query that
        // happens to land on a round number.
        let truncated = false;
        const skipped = new Set();
        const detailed = typeof api.searchDetailed === 'function';

        const options = {
            limit: RESULT_LIMIT,
            minLength: MIN_QUERY_LENGTH,
            fuzzy: true
        };

        const settled = await Promise.all(types.map(async type => {
            try {
                const raw = detailed
                    ? await api.searchDetailed(trimmed, type, options)
                    : { results: await api.search(trimmed, type, options) };

                const results = raw?.results;
                if (!Array.isArray(results)) return [];

                if (raw.truncated) truncated = true;
                // A source skipped for one type may have been scanned for
                // another, so this counts sources where some content went
                // unsearched — which is what the notice claims.
                for (const source of raw.skippedSources ?? []) skipped.add(source);

                return results.map(entry => this._normalize(entry, type)).filter(Boolean);
            } catch (error) {
                console.error(`${MODULE.ID}: Compendium search failed for type ${type}:`, error);
                return [];
            }
        }));

        // Merge, dropping any uuid seen twice — a pack mapped to more than one
        // type would otherwise show the same item in two groups.
        const seen = new Set();
        const groups = [];
        const groupsBySource = new Map();
        let total = 0;

        for (const entry of settled.flat()) {
            if (seen.has(entry.uuid)) continue;
            seen.add(entry.uuid);
            total++;

            // Keyed on source, never on sourceLabel: two packs can share a label
            // but never an id, so grouping by name would silently merge the
            // PHB's "Equipment" with the DMG's.
            let group = groupsBySource.get(entry.source);
            if (!group) {
                group = {
                    source: entry.source,
                    sourceLabel: entry.sourceLabel,
                    // Suppressed when it just repeats the pack name.
                    sourcePackage: entry.sourcePackage && entry.sourcePackage !== entry.sourceLabel
                        ? entry.sourcePackage
                        : '',
                    items: []
                };
                groupsBySource.set(entry.source, group);
                groups.push(group);
            }
            group.items.push(entry);
        }

        return { available: true, tooShort: false, groups, total, truncated, skippedCount: skipped.size };
    }

    /* ---------------------------------------------------------------- */
    /*  Adding                                                           */
    /* ---------------------------------------------------------------- */

    /**
     * Whether this user may add compendium content to the actor.
     *
     * Adding items is an additive, explicitly-invoked mutation of actor content,
     * which is the narrow case Squire permits. Restricted to the GM by default
     * because who may pull arbitrary compendium content onto a sheet is a table
     * policy question, not a UI one.
     */
    static canAdd(actor) {
        if (!actor) return false;
        if (actor.pack || (actor.collection && actor.collection.locked)) return false;
        if (!actor.isOwner) return false;
        if (game.user.isGM) return true;
        try {
            return game.settings.get(MODULE.ID, 'compendiumAddPlayers') === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Copy a compendium document onto the actor.
     * @returns {Promise<Item|null>} the created item
     */
    static async addToActor(actor, uuid, quantity = 1) {
        if (!this.canAdd(actor)) return null;

        try {
            const source = await fromUuid(uuid);
            if (!source) {
                showSquireToast('Could not load that item.', {
                    subtitle: 'Its compendium may be unavailable.',
                    icon: 'fa-solid fa-triangle-exclamation',
                    color: '#e05c3c'
                });
                return null;
            }

            const data = source.toObject();
            delete data._id;
            // Only stackables carry a quantity; writing one onto a spell or
            // feature would invent a field the sheet doesn't model.
            if (data.system?.quantity !== undefined) {
                data.system.quantity = Math.max(1, Math.floor(Number(quantity)) || 1);
            }

            const [created] = await actor.createEmbeddedDocuments('Item', [data]);
            if (created) {
                showSquireToast(`Added ${created.name}`, {
                    subtitle: actor.name,
                    icon: 'fa-solid fa-circle-plus',
                    image: created.img,
                    stackKey: `squire-add-${created.id}`
                });
            }
            return created ?? null;
        } catch (error) {
            console.error(`${MODULE.ID}: Error adding compendium item:`, error);
            showSquireToast('Could not add that item.', {
                subtitle: 'See the console for details.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return null;
        }
    }
}
