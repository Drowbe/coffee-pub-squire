import { MODULE } from '../const.js';

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
            link: new fields.SchemaField({
                uuid: new fields.StringField({ required: false, blank: true, initial: '' }),
                label: new fields.StringField({ required: false, blank: true, initial: '' })
            }),
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

    /** Normalized link object for the tray ({ uuid, label } or null). */
    get linkData() {
        const uuid = this.link?.uuid?.trim();
        if (!uuid) return null;
        return { uuid, label: this.link.label || uuid };
    }
}
