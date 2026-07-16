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
 * Label for a link whose document is known but whose name is not, e.g. a bare
 * `{ uuid }` treasure entry. Showing the raw uuid as the clickable text is worse
 * than a generic word.
 */
function fallbackLabel(type) {
    switch (String(type ?? '').toLowerCase()) {
        case 'actor': return 'Actor';
        case 'item': return 'Item';
        case 'spell': return 'Spell';
        case 'feature': return 'Feature';
        case 'journal': return 'Journal';
        case 'rolltable': return 'Roll Table';
        default: return 'Document';
    }
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
 * Normalize a stored link, preserving the fields Auto-Link needs to retry it.
 *
 * `name`/`type` are what make an unresolved link retryable; any code path that
 * rebuilds the links array and drops them silently destroys that.
 *
 * Legacy links (pre-13.3.12) carry only `uuid` + `label`. The label was always
 * the document's name, so it backfills `name` — that keeps identity stable for
 * old data without a migration.
 */
export function normalizeCodexLink(link) {
    const uuid = String(link?.uuid ?? '').trim();
    const label = String(link?.label ?? '').trim();
    const name = String(link?.name ?? '').trim() || (label && label !== uuid ? label : '');
    return {
        uuid,
        label: label || name || uuid,
        name,
        type: String(link?.type ?? '').trim()
    };
}

/**
 * Stable identity for a codex link: the NAME the author wrote, falling back to
 * uuid only when there is no name.
 *
 * Name-first is load-bearing. A uuid is the *result* of resolution, not the
 * link's identity — keying on it would give the same link two different keys
 * before and after Auto-Link resolves it, so a merge would emit it twice.
 * Every site that rewrites `system.links` must use this.
 */
export function codexLinkKey(link) {
    const normalized = normalizeCodexLink(link);
    return normalized.name.toLowerCase() || normalized.uuid;
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
            links[index] = `@UUID[${entry.uuid}]{${name || fallbackLabel(type)}}`;
            return;
        }
        if (name) pending.push({ index, name });
    });

    const report = emptyReport(type);
    report.passedThrough = list.length - pending.length;
    if (!pending.length) return { links, report };

    const resolution = await resolveNames(pending.map(p => p.name), type);
    Object.assign(report, resolution.report, { passedThrough: report.passedThrough });

    pending.forEach(({ index, name }, i) => {
        const result = resolution.results[i];
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
 * Links that already carry a uuid pass through. **Unresolved names are RETAINED**
 * with an empty uuid: a codex is authored incrementally, the source JSON is gone
 * after import, and a name written before its document exists is a real statement
 * we must not throw away. They render as plain text and the auto-link scan
 * retries them.
 *
 * @param {{name?: string, category?: string, links?: Array, link?: object}} entry
 * @returns {Promise<{links: Array<{uuid: string, label: string, name: string, type: string}>, reports: object[]}>}
 */
export async function resolveCodexLinks(entry) {
    const links = [];
    const seen = new Set();

    const push = (link) => {
        const entryLink = normalizeCodexLink(link);
        if (!entryLink.label) entryLink.label = entryLink.name || entryLink.uuid;
        const key = codexLinkKey(entryLink);
        if (!key || seen.has(key)) return;
        seen.add(key);
        links.push(entryLink);
    };

    const rawLinks = Array.isArray(entry?.links)
        ? entry.links
        : (entry?.link ? [entry.link] : []);

    const pending = [];
    for (const link of rawLinks) {
        const uuid = typeof link?.uuid === 'string' ? link.uuid.trim() : '';
        if (uuid) {
            push(link);
            continue;
        }
        const name = String(link?.name ?? '').trim();
        if (!name) continue;
        pending.push({ name, type: String(link.type ?? 'journal').trim(), label: link.label || name });
    }

    // resolveMany takes one canonical type per call, so batch by type.
    const byType = new Map();
    pending.forEach(item => {
        if (!byType.has(item.type)) byType.set(item.type, []);
        byType.get(item.type).push(item);
    });

    // The entry's own document is resolved separately from the cross-references
    // so its misses can be marked speculative: we are guessing a document shares
    // this entry's name, and most Locations/Factions/Events legitimately have
    // none. A miss here is not news; a miss on an explicit link is.
    const selfName = String(entry?.name ?? '').trim();
    const groups = [...byType.entries()];

    // Independent lookups — run them together rather than one await at a time.
    const [self, ...resolvedGroups] = await Promise.all([
        selfName
            ? resolveNames([selfName], typeForCategory(entry?.category))
            : Promise.resolve(null),
        ...groups.map(([type, group]) => resolveNames(group.map(g => g.name), type))
    ]);

    const reports = [];

    if (self) {
        self.report.speculative = true;
        reports.push(self.report);
        // Self-links are speculation, so a miss is NOT retained: we invented the
        // name, nobody asserted it. Only explicit links earn a placeholder.
        if (self.results[0]) {
            push({
                uuid: self.results[0].uuid,
                label: selfName,
                name: selfName,
                type: typeForCategory(entry?.category)
            });
        }
    }

    resolvedGroups.forEach(({ results, report }, groupIndex) => {
        reports.push(report);
        const group = groups[groupIndex][1];
        results.forEach((result, i) => {
            const asked = group[i];
            // Retain the miss: the name is an assertion the author made, and it is
            // not recoverable once the import JSON is gone. Auto-Link retries it.
            push({
                uuid: result?.uuid ?? '',
                label: asked.label || result?.matchedName || asked.name,
                name: asked.name,
                type: asked.type
            });
        });
    });

    return { links, reports };
}

/**
 * Merge freshly resolved codex links with the links already on the page.
 *
 * Links on the page that the import doesn't produce are KEPT. Until 13.3.12 the
 * only way to add a codex link was to drag a document onto the entry, so a link
 * absent from the JSON is almost certainly hand-curated — and it is not
 * recoverable once dropped, because it never existed in the JSON to begin with.
 *
 * The trade-off: a link cannot be removed by re-importing. Remove it in the Edit
 * Entry window instead. Silently destroying a GM's manual work is the worse of
 * the two failures.
 *
 * @param {Array<{uuid: string, label?: string}>} existing page's current links
 * @param {Array<{uuid: string, label?: string}>} resolved links from this import
 * @returns {Array<{uuid: string, label: string}>}
 */
export function mergeCodexLinks(existing, resolved) {
    const out = [];
    const seen = new Set();

    const push = (link) => {
        const normalized = normalizeCodexLink(link);
        if (!normalized.label) normalized.label = normalized.name || normalized.uuid;
        // Key on uuid, falling back to name, so an unresolved link the import just
        // produced doesn't duplicate the same one already on the page.
        const key = codexLinkKey(normalized);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(normalized);
    };

    // Import order leads (the self-link first), then anything only the page has.
    (Array.isArray(resolved) ? resolved : []).forEach(push);
    (Array.isArray(existing) ? existing : []).forEach(push);

    // A link the import resolved supersedes the same name still unresolved on the
    // page — otherwise the page's stale placeholder would win on key collision.
    return out;
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

    if (resolved === 0 && missed.length === 0 && uncertain.length === 0) return;

    // Two independent counts, deliberately not phrased as "N of M": the numerator
    // would include speculative wins while the denominator excluded speculative
    // losses, and no total in the sentence would reconcile with the debug payload.
    let message = `${context}: linked ${resolved} ${resolved === 1 ? 'reference' : 'references'}.`;
    if (missed.length) {
        message += ` ${missed.length} named ${missed.length === 1 ? 'reference' : 'references'} did not resolve.`;
    }
    ui.notifications.info(message);

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
