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
            context.linkChips = this.document.system.linkList;
        }
        return context;
    }

    /** @inheritDoc */
    _onRender(context, options) {
        super._onRender?.(context, options);

        // Edit mode: the links zone accepts document drops and chip removal,
        // writing system.links directly (the document update re-renders the sheet)
        const zone = this.element?.querySelector('.codex-page-links-edit');
        if (!zone || zone.dataset.linksBound) return;
        zone.dataset.linksBound = 'true';

        const currentLinks = () => Array.from(this.document.system.links || [])
            .map(l => ({ uuid: l.uuid, label: l.label }));

        zone.addEventListener('click', async (event) => {
            const removeBtn = event.target.closest('.codex-link-chip-remove');
            if (!removeBtn) return;
            event.preventDefault();
            const uuid = removeBtn.closest('.codex-link-chip')?.dataset?.uuid;
            if (!uuid) return;
            await this.document.update({ 'system.links': currentLinks().filter(l => l.uuid !== uuid) });
        });

        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'link';
            zone.classList.add('drag-active');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
        zone.addEventListener('drop', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            zone.classList.remove('drag-active');
            try {
                const TextEditor = getTextEditor();
                const data = TextEditor?.getDragEventData?.(event)
                    || JSON.parse(event.dataTransfer.getData('text/plain'));
                const doc = data?.uuid ? await fromUuid(data.uuid) : null;
                if (!doc) return;
                const links = currentLinks();
                if (links.some(l => l.uuid === doc.uuid)) return;
                links.push({ uuid: doc.uuid, label: doc.name || doc.uuid });
                await this.document.update({ 'system.links': links });
                ui.notifications.info(`Linked: ${doc.name}`);
            } catch (error) {
                console.error('Coffee Pub Squire | Error linking dropped document:', error);
            }
        });
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
