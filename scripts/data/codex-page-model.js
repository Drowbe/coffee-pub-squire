import { MODULE } from '../const.js';
import { codexLinkKey, normalizeCodexLink } from '../utility-resolver.js';

/**
 * The fully-qualified page subtype string ("coffee-pub-squire.codex").
 * Declared in module.json documentTypes; Foundry auto-prefixes with the module id.
 */
export const CODEX_PAGE_TYPE = `${MODULE.ID}.codex`;

/**
 * Data model for codex journal pages. Structured fields live here (page.system)
 * with schema validation — nothing is parsed from HTML. The page's native
 * text.content holds the free-form Expanded Details, edited with ProseMirror
 * through the standard journal machinery.
 */
export class CodexPageModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            // The bite-size card text shown in the tray (formerly "Description")
            summary: new fields.StringField({ required: false, blank: true, initial: '' }),
            category: new fields.StringField({ required: false, blank: true, initial: '' }),
            categoryIcon: new fields.StringField({ required: false, blank: true, initial: '' }),
            // GM-only in the tray
            plotHook: new fields.StringField({ required: false, blank: true, initial: '' }),
            // "A > B > C" convention
            location: new fields.StringField({ required: false, blank: true, initial: '' }),
            // Links to game DOCUMENTS (actors, items, ...) resolved through
            // Blacksmith's compendium mapping. `name`/`type` are retained even
            // once resolved so an unresolved link can be retried later by the
            // auto-link scan — a codex is authored incrementally and the source
            // JSON is gone by then. An entry with no uuid renders as plain text.
            links: new fields.ArrayField(new fields.SchemaField({
                uuid: new fields.StringField({ required: false, blank: true, initial: '' }),
                label: new fields.StringField({ required: false, blank: true, initial: '' }),
                name: new fields.StringField({ required: false, blank: true, initial: '' }),
                type: new fields.StringField({ required: false, blank: true, initial: '' })
            }), { initial: [] }),
            // Related CODEX ENTRIES, by name. Deliberately not UUIDs: entries are
            // pages in one journal, so the name -> page lookup is cheap and is done
            // at render. Storing only the name means a relationship to an entry that
            // doesn't exist yet is kept verbatim and links itself the moment that
            // entry is created — no migration, no rescan, no import ordering problem.
            related: new fields.ArrayField(new fields.StringField(), { initial: [] }),
            tags: new fields.ArrayField(new fields.StringField(), { initial: [] }),
            img: new fields.StringField({ required: false, blank: true, initial: '' }),
            // Character names that auto-discovery matched (replaces the old
            // "Discovered By:" HTML paragraph)
            discoveredBy: new fields.ArrayField(new fields.StringField(), { initial: [] })
        };
    }

    /** Whether this page has Expanded Details content. */
    get hasExpandedDetails() {
        const content = this.parent?.text?.content;
        return typeof content === 'string' && content.trim().length > 0;
    }

    /**
     * Normalized links: array of { uuid, label, name, type }.
     *
     * Unresolved links (no uuid) are KEPT — they render as plain text and the
     * auto-link scan retries them later. Consumers that need a real document
     * must check `uuid` themselves rather than assume every entry has one.
     */
    get linkList() {
        return (this.links || [])
            .map(l => {
                const normalized = normalizeCodexLink(l);
                return {
                    ...normalized,
                    // Same identity the removal handlers and merge use.
                    key: codexLinkKey(normalized),
                    resolved: !!normalized.uuid
                };
            })
            .filter(l => l.key);
    }

    /** Links that actually resolved to a document. */
    get resolvedLinkList() {
        return this.linkList.filter(l => l.uuid);
    }

    /** Legacy alias: the first resolved link, or null. */
    get linkData() {
        return this.resolvedLinkList[0] ?? null;
    }
}
