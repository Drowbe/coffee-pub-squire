import { MODULE } from '../const.js';
import { renderTemplate, getTextEditor } from '../helpers.js';

// The CONCRETE text page sheet. (JournalEntryPageTextSheet is abstract and defines
// NO parts — extending it renders neither the view content nor the lore editor.)
const JournalEntryPageProseMirrorSheet = foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet;

/**
 * Sheet for codex journal pages (type "coffee-pub-squire.codex").
 *
 * Extends the standard ProseMirror text page sheet so the page's native
 * text.content — the Expanded Details — keeps stock editing and view rendering.
 *
 * - EDIT mode: a codex field part is inserted between the standard header
 *   (title controls) and the ProseMirror content editor.
 * - VIEW mode: the core view content part is `root: true`, so sibling parts are
 *   not an option; instead the rendered field block is prepended to the enriched
 *   content in _prepareContentContext.
 */
export class CodexPageSheet extends JournalEntryPageProseMirrorSheet {
    static DEFAULT_OPTIONS = {
        classes: ['squire-codex-page']
    };

    static EDIT_PARTS = {
        header: JournalEntryPageProseMirrorSheet.EDIT_PARTS.header,
        codexFields: {
            template: `modules/${MODULE.ID}/templates/page-codex-fields-edit.hbs`
        },
        content: JournalEntryPageProseMirrorSheet.EDIT_PARTS.content,
        footer: JournalEntryPageProseMirrorSheet.EDIT_PARTS.footer
    };

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === 'codexFields') {
            context.document = this.document;
            context.system = this.document.system;
            context.tagsString = (this.document.system.tags || []).join(', ');
        }
        return context;
    }

    /** @inheritDoc */
    async _prepareContentContext(context, options) {
        await super._prepareContentContext(context, options);

        // View mode: prepend the styled codex field block above the enriched lore
        if (this.isView) {
            const system = this.document.system;

            const linksHtml = [];
            for (const link of system.linkList) {
                try {
                    const TextEditor = getTextEditor();
                    linksHtml.push(await TextEditor.enrichHTML(`@UUID[${link.uuid}]{${link.label}}`, { async: true }));
                } catch (_) {
                    linksHtml.push(link.label);
                }
            }

            const fieldsHtml = await renderTemplate(
                `modules/${MODULE.ID}/templates/page-codex-fields-view.hbs`,
                {
                    document: this.document,
                    system,
                    isGM: game.user.isGM,
                    discoveredByString: (system.discoveredBy || []).join(', '),
                    linksHtml
                }
            );

            context.text.enriched = fieldsHtml + (context.text.enriched || '');
        }
    }

    /** @inheritDoc */
    _prepareSubmitData(event, form, formData, updateData) {
        const data = super._prepareSubmitData(event, form, formData, updateData);

        // Tags arrive from the form as a comma-separated string
        const rawTags = foundry.utils.getProperty(data, 'system.tags');
        if (typeof rawTags === 'string') {
            foundry.utils.setProperty(
                data,
                'system.tags',
                rawTags.split(',').map(t => t.trim()).filter(Boolean)
            );
        }

        return data;
    }
}
