/**
 * Plain text -> document links.
 *
 * Blacksmith owns the GM's compendium mapping and the name -> UUID resolver.
 * Squire never searches packs, reads Blacksmith's settings, or hand-builds
 * search order. See documents/architecture-squire.md and the Blacksmith repo's
 * documentation/api/api-compendiums.md.
 */

import { MODULE } from './const.js';

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

function getCompendiums() {
    return getBlacksmith()?.compendiums ?? null;
}

function emptyReport(type) {
    return { type, resolved: 0, passedThrough: 0, missed: [], uncertain: [], speculative: false };
}

/**
 * Codex categories describe the entry itself, not the documents it links to,
 * so a category may only type an entry's OWN name. Cross-reference links carry
 * their own type. Categories absent here resolve as journals, which covers the
 * place/event/faction categories in prompts/prompt-codex.txt.
 */
const CATEGORY_TYPES = {
    characters: 'actor',
    items: 'item',
    artifacts: 'item'
};

export function typeForCategory(category) {
    return CATEGORY_TYPES[String(category ?? '').trim().toLowerCase()] ?? 'journal';
}

/**
 * Core resolver: bare names in, Blacksmith result objects out, index-aligned.
 * Unresolved entries come back as null. Never throws.
 *
 * @param {string[]} names
 * @param {string} type Blacksmith type token ('item', 'actor', 'journal', ...)
 * @returns {Promise<{results: Array<object|null>, report: object}>}
 */
async function resolveNames(names, type) {
    const report = emptyReport(type);
    const compendiums = getCompendiums();

    if (!compendiums || !names.length) return { results: names.map(() => null), report };

    let raw;
    try {
        // resolveMany warms each pack index once for the whole batch — materially
        // faster than a loop of resolve() and the reason we batch by type.
        raw = await compendiums.resolveMany(names, type);
    } catch (error) {
        // resolveMany is documented not to throw on misses, but a link lookup
        // must never take an import down with it.
        getBlacksmith()?.utils?.postConsoleAndNotification(
            MODULE.NAME,
            'Compendium resolution failed; falling back to plain names',
            { type, error },
            false,
            false
        );
        return { results: names.map(() => null), report };
    }

    const results = names.map((name, index) => {
        const result = raw?.[index];
        if (!result?.found) {
            report.missed.push(name);
            return null;
        }
        report.resolved++;
        // exact is the only tier we treat as certain; startsWith/includes may
        // have grabbed the wrong document and the GM should get a look.
        if (result.matchType !== 'exact') {
            report.uncertain.push({ name, matchedName: result.matchedName, matchType: result.matchType });
        }
        return result;
    });

    return { results, report };
}

/**
 * Resolve `{uuid?, name?}` entries to enricher link strings.
 *
 * Entries already carrying a uuid pass through untouched; bare names go to the
 * resolver. Anything that fails to resolve falls back to its plain name, so the
 * worst case is exactly the pre-resolver behaviour.
 *
 * @returns {Promise<{links: Array<string|null>, report: object}>} links are
 *          index-aligned with `entries`; null means no linkable name.
 */
export async function resolveEntries(entries, type) {
    const list = Array.isArray(entries) ? entries : [];
    const links = new Array(list.length).fill(null);
    const pending = [];

    list.forEach((entry, index) => {
        const name = String(entry?.name ?? '').trim();
        if (entry?.uuid) {
            links[index] = `@UUID[${entry.uuid}]{${name || entry.uuid}}`;
            return;
        }
        if (name) pending.push({ index, name });
    });

    if (!pending.length) return { links, report: emptyReport(type) };

    const { results, report } = await resolveNames(pending.map(p => p.name), type);
    report.passedThrough = list.length - pending.length;

    pending.forEach(({ index, name }, i) => {
        const result = results[i];
        links[index] = result
            ? (result.link ?? `@UUID[${result.uuid}]{${result.matchedName ?? name}}`)
            : name;
    });

    return { links, report };
}

/**
 * Build a codex entry's link list as `{uuid, label}` pairs.
 *
 * Two distinct things resolve here:
 *  - the entry's OWN document, typed by its category (the only place a category
 *    may type a name);
 *  - cross-reference links, each carrying its own `type`, because a category
 *    describes the entry rather than the documents it points at.
 *
 * Links that already carry a uuid pass through. Unresolved names are dropped,
 * matching the existing contract that a codex link without a uuid does not exist.
 *
 * @param {{name?: string, category?: string, links?: Array, link?: object}} entry
 * @returns {Promise<{links: Array<{uuid: string, label: string}>, reports: object[]}>}
 */
export async function resolveCodexLinks(entry) {
    const reports = [];
    const links = [];
    const seen = new Set();

    const push = (uuid, label) => {
        const id = String(uuid ?? '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        links.push({ id, label: String(label || id) });
    };

    const rawLinks = Array.isArray(entry?.links)
        ? entry.links
        : (entry?.link ? [entry.link] : []);

    // The entry's own document, typed by category. Resolved on its own so its
    // misses can be marked speculative: we are guessing a document shares this
    // entry's name, and most Locations/Factions/Events legitimately have none.
    // A miss here is not news; a miss on an explicit link below is.
    const selfName = String(entry?.name ?? '').trim();
    if (selfName) {
        const { results, report } = await resolveNames([selfName], typeForCategory(entry?.category));
        report.speculative = true;
        reports.push(report);
        if (results[0]) push(results[0].uuid, selfName);
    }

    const pending = [];

    for (const link of rawLinks) {
        const uuid = typeof link?.uuid === 'string' ? link.uuid.trim() : '';
        if (uuid) {
            push(uuid, link.label);
            continue;
        }
        const name = String(link?.name ?? '').trim();
        if (!name) continue;
        pending.push({ name, type: link.type ?? 'journal', label: link.label || name });
    }

    // resolveMany takes one canonical type per call, so batch by type.
    const byType = new Map();
    pending.forEach(item => {
        if (!byType.has(item.type)) byType.set(item.type, []);
        byType.get(item.type).push(item);
    });

    for (const [type, group] of byType) {
        const { results, report } = await resolveNames(group.map(g => g.name), type);
        reports.push(report);
        results.forEach((result, i) => {
            if (result) push(result.uuid, group[i].label || result.matchedName);
        });
    }

    return { links: links.map(l => ({ uuid: l.id, label: l.label })), reports };
}

/**
 * Tell the GM what resolved and what did not.
 *
 * Silence is what let five dead "Item Lookup" settings sit in the settings pane
 * for years while linking quietly did nothing, so misses are reported rather
 * than swallowed.
 *
 * @param {Array<object>} reports collected report objects
 * @param {string} context human label, e.g. 'Quest import'
 */
export function reportResolution(reports, context) {
    if (!game.user.isGM) return;

    const all = (reports || []).filter(Boolean);
    // Speculative misses (a self-link whose document simply doesn't exist) are
    // expected and would drown the real signal; they stay in the debug payload.
    const missed = all.filter(r => !r.speculative).flatMap(r => r.missed);
    const speculativeMisses = all.filter(r => r.speculative).flatMap(r => r.missed);
    const uncertain = all.flatMap(r => r.uncertain);
    const resolved = all.reduce((sum, r) => sum + r.resolved, 0);
    const attempted = resolved + missed.length;

    if (attempted === 0 && uncertain.length === 0) return;

    if (missed.length) {
        ui.notifications.info(`${context}: linked ${resolved} of ${attempted} names. ${missed.length} did not resolve.`);
    } else if (resolved > 0) {
        ui.notifications.info(`${context}: linked ${resolved} of ${attempted} names.`);
    }

    if (uncertain.length) {
        const detail = uncertain
            .map(u => `"${u.name}" -> "${u.matchedName}" (${u.matchType})`)
            .join(', ');
        ui.notifications.warn(`${context}: ${uncertain.length} matched inexactly: ${detail}`);
    }

    if (missed.length || uncertain.length || speculativeMisses.length) {
        getBlacksmith()?.utils?.postConsoleAndNotification(
            MODULE.NAME,
            `${context}: link resolution report`,
            { resolved, missed, uncertain, speculativeMisses },
            false,
            false
        );
    }
}
