import { MODULE } from './const.js';
import { showSquireToast } from './helpers.js';

/**
 * Adapter over Blacksmith's Compendiums API for the tray's quick-add search.
 *
 * Everything that touches the upstream API is funnelled through here, so an
 * upstream signature change is one file to reconcile — the panel below only
 * ever sees the normalized shape defined by `_normalize()`.
 *
 *   api.compendiums.searchDetailed(query, types[], {
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
 * The type parameter takes an array, and passing all of them in one call is
 * load-bearing rather than a convenience — see the comment in search().
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

// Below this, a query matches most of the SRD and isn't worth running. Matches
// Blacksmith's own minimum, raised to 3 to cut per-keystroke churn — a
// multi-type search opens every mapped pack, so short queries are expensive as
// well as useless.
//
// This is passed explicitly on every call, which means a change to the API's
// default does NOT reach us. Deliberate — the same number gates the local
// short-circuit and the "type at least N characters" prompt, so it has to be a
// value we hold. Update it here when the upstream minimum moves.
const MIN_QUERY_LENGTH = 3;

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
     * care about. Passed to the API as a single array.
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
    static _normalize(entry) {
        if (!entry?.uuid) return null;
        const source = entry.source ?? 'world';
        return {
            uuid: entry.uuid,
            name: entry.name ?? 'Unknown',
            // Document subtype, shown as the row badge. With one multi-type call
            // there's no per-call type to fall back on, and none is needed —
            // index entries carry it.
            type: entry.type ?? '',
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
     * Whether the pack a result came from is visible to the current user.
     *
     * Search runs on the requesting client against Blacksmith's configured
     * sources, and pack ownership is Foundry's own permission layer over those
     * sources — a GM-only homebrew pack is still in `game.packs` on a player's
     * client. Now that players can search, an unfiltered result list would show
     * them names out of packs they aren't allowed to open.
     *
     * Compendium results whose pack can't be resolved are dropped rather than
     * kept: an unresolvable pack is exactly the case where the visibility answer
     * is unknown, and the cost of being wrong runs one way. World results carry
     * no pack and are governed by document ownership instead.
     */
    static _isVisibleToUser(entry) {
        const uuid = String(entry?.uuid ?? '');
        if (!uuid.startsWith('Compendium.')) return true;

        // Compendium.<scope>.<packName>.<DocumentType>.<id>
        const parts = uuid.split('.');
        const collection = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : '';
        const pack = game.packs?.get(collection);
        if (!pack) return false;
        return pack.visible !== false;
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

        // One call with every type, never one call per type.
        //
        // Synthetic types have no packs of their own — spells and features live
        // in Item packs, reached by subtype filter. So a pack mapped to both
        // Item and Spell returns its spells through both passes (the Item pass
        // unfiltered, the Spell pass subtype-filtered over the same entries),
        // and merging those listed every such row twice. Whether that happened
        // depended on the GM's mapping rather than on anything here.
        //
        // The single call also keeps the grouping intact: per-call results are
        // grouped by source, but merging three of them re-interleaves the packs,
        // undoing the source-then-tier ordering the API provides. And `limit`
        // becomes one shared budget rather than three, so a 40-cap means 40 rows
        // and not 120.
        //
        // `limit` stops the scan, not just the output: once reached, remaining
        // packs are never opened, so the tail of the priority order drops out
        // rather than being sampled. The API reports that directly — deliberately
        // not inferred from a full result page, since a scan that fills the cap
        // with the last available candidate is complete and that test would
        // raise a false "content is missing" on any round-numbered result set.
        const options = {
            limit: RESULT_LIMIT,
            minLength: MIN_QUERY_LENGTH,
            fuzzy: true
        };

        let entries = [];
        let truncated = false;
        let skippedCount = 0;

        try {
            const detailed = typeof api.searchDetailed === 'function';
            const raw = detailed
                ? await api.searchDetailed(trimmed, types, options)
                : { results: await api.search(trimmed, types, options) };

            if (Array.isArray(raw?.results)) {
                // Deduped upstream at bucketing time, so a doubled entry can't
                // even occupy two result slots.
                entries = raw.results
                    .map(entry => this._normalize(entry))
                    .filter(entry => entry && this._isVisibleToUser(entry));
            }
            truncated = raw?.truncated === true;
            skippedCount = Array.isArray(raw?.skippedSources) ? raw.skippedSources.length : 0;
        } catch (error) {
            console.error(`${MODULE.ID}: Compendium search failed:`, error);
        }

        const groups = [];
        const groupsBySource = new Map();
        let total = 0;

        for (const entry of entries) {
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

        return { available: true, tooShort: false, groups, total, truncated, skippedCount };
    }

    /* ---------------------------------------------------------------- */
    /*  Access and adding                                                */
    /* ---------------------------------------------------------------- */

    /**
     * What this user may do with compendium content on this actor.
     *
     * Four rungs, from the `compendiumPlayerAccess` world setting:
     *   none     nothing — the mode toggle doesn't appear
     *   browse   search and open item sheets, no adding
     *   request  adding asks the GM, who approves or denies
     *   add      adding happens immediately
     *
     * The GM is always on the top rung. Looking things up and putting things on
     * a sheet are separate permissions because they answer different questions:
     * a player reading how grappling works needs the compendium open, not write
     * access to their own character.
     *
     * @returns {'none'|'browse'|'request'|'add'}
     */
    static getAccessLevel() {
        if (game.user.isGM) return 'add';
        try {
            const level = game.settings.get(MODULE.ID, 'compendiumPlayerAccess');
            return ['none', 'browse', 'request', 'add'].includes(level) ? level : 'none';
        } catch (error) {
            // Setting not registered yet — nothing sensible to do this early.
            return 'none';
        }
    }

    /**
     * Whether the actor can receive compendium content at all, independent of
     * who is asking: a pack actor or one in a locked collection can't be
     * written to, and an actor you don't own isn't yours to modify.
     */
    static _isEligibleActor(actor) {
        if (!actor) return false;
        if (actor.pack || (actor.collection && actor.collection.locked)) return false;
        return actor.isOwner;
    }

    /** Whether this user may open compendium search against this actor. */
    static canBrowse(actor) {
        return this._isEligibleActor(actor) && this.getAccessLevel() !== 'none';
    }

    /**
     * Whether this user may add compendium content to the actor directly.
     *
     * Adding is an additive, explicitly-invoked mutation of actor content, which
     * is the narrow case Squire permits. Off for players by default because who
     * may pull arbitrary compendium content onto a sheet is a table policy
     * question, not a UI one.
     */
    static canAdd(actor) {
        return this._isEligibleActor(actor) && this.getAccessLevel() === 'add';
    }

    /** Whether this user's adds go to the GM as a request instead. */
    static canRequest(actor) {
        return this._isEligibleActor(actor) && this.getAccessLevel() === 'request';
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
