/**
 * Shared journal utilities for Notes, Codex, and Quest panels.
 * Extracted from panel-notes, panel-codex, and panel-quest.
 */

import { getNativeElement, getTextEditor, escapeHtml } from './helpers.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';

/** Permission levels matching Foundry CONST.DOCUMENT_OWNERSHIP_LEVELS */
export const PERMISSION_LEVELS = {
    NONE: 0,
    LIMITED: 1,
    OBSERVER: 2,
    OWNER: 3
};

/**
 * Check if a user can access a journal page (observe or better).
 * @param {JournalEntryPage} page - The page to check
 * @param {User} user - The user to check permissions for
 * @param {Object} permLevels - Permission constants (NONE, LIMITED, OBSERVER, OWNER)
 * @returns {boolean}
 */
export function userCanAccessPage(page, user, permLevels = PERMISSION_LEVELS) {
    if (!page || !user) return false;
    if (user.isGM) return true;

    const journal = page.parent;
    if (!journal) return false;

    if (page.testUserPermission(user, permLevels.OBSERVER)) return true;

    if (page.ownership[user.id] === permLevels.NONE ||
        (page.ownership.default === permLevels.NONE && !page.ownership[user.id])) {
        return false;
    }

    const hasSpecificPermissions = Object.keys(page.ownership).some(id =>
        id !== 'default' && id !== user.id
    );

    if (!hasSpecificPermissions || page.ownership.default === 0) {
        return journal.testUserPermission(user, permLevels.OBSERVER);
    }

    return false;
}

/**
 * Get a human-readable label for page permissions.
 * @param {JournalEntryPage} page - The page to check
 * @param {Object} permLevels - Permission constants
 * @returns {string} HTML string (icon with title)
 */
export function getPagePermissionLabel(page, permLevels = PERMISSION_LEVELS) {
    if (!page) return `<i class="fa-solid fa-question" title="Unknown"></i>`;

    const hasSpecificPermissions = Object.keys(page.ownership).some(id => id !== 'default');
    const defaultPermission = page.ownership.default;

    if (!hasSpecificPermissions && defaultPermission === 0) {
        return `<i class="fa-solid fa-link" title="Inherits journal permissions"></i>`;
    }
    if (defaultPermission >= permLevels.OWNER) {
        return `<i class="fa-solid fa-edit" title="Players can edit"></i>`;
    }
    if (defaultPermission >= permLevels.OBSERVER) {
        return `<i class="fa-solid fa-eye" title="Players can view"></i>`;
    }
    return `<i class="fa-solid fa-lock" title="GM only"></i>`;
}

/**
 * Get raw text content from a journal page.
 * @param {JournalEntryPage} page - The journal page
 * @returns {Promise<string>}
 */
export async function getJournalPageContent(page) {
    if (!page) return '';

    try {
        if (typeof page?.then === 'function') {
            page = await page;
        }

        if (page.type !== 'text') return '';

        let content = null;

        if (page.text && typeof page.text === 'object' && page.text !== null) {
            if (typeof page.text.content !== 'undefined') {
                if (typeof page.text.content.then === 'function') {
                    try { content = await page.text.content; } catch (e) { /* ignore */ }
                } else {
                    content = page.text.content;
                }
            }
            if (content === null && typeof page.text.value !== 'undefined') {
                content = page.text.value;
            }
        }

        if (content === null && page.text) {
            if (typeof page.text === 'string') content = page.text;
            else if (typeof page.text.then === 'function') {
                try { content = await page.text; } catch (e) { /* ignore */ }
            }
        }

        if (content === null && page.content) {
            if (typeof page.content === 'string') content = page.content;
            else if (typeof page.content.then === 'function') {
                try { content = await page.content; } catch (e) { /* ignore */ }
            }
        }

        if (content === null && page.document) {
            if (typeof page.document.text === 'string') content = page.document.text;
            else if (page.document.text?.content) {
                if (typeof page.document.text.content.then === 'function') {
                    try { content = await page.document.text.content; } catch (e) { /* ignore */ }
                } else {
                    content = page.document.text.content;
                }
            }
        }

        if (content === null && page.data) {
            content = page.data.content ?? page.data.text ?? null;
        }

        if (content === null || content === undefined) return '';
        if (typeof content.then === 'function') {
            try { content = await content; } catch (e) { return ''; }
        }
        return typeof content === 'string' ? content : String(content);
    } catch (e) {
        console.error('utility-journal getJournalPageContent:', e);
        return '';
    }
}

/**
 * Enrich HTML content using Foundry TextEditor.
 * @param {string} content - Raw HTML/markdown
 * @param {Object} [options] - { secrets, documents, links, rolls }
 * @returns {Promise<string>}
 */
export async function enrichJournalContent(content, options = {}) {
    if (!content || typeof content !== 'string') return '';
    try {
        const TextEditor = getTextEditor();
        return await TextEditor.enrichHTML(content, {
            secrets: options.secrets ?? game.user.isGM,
            documents: options.documents ?? true,
            links: options.links ?? true,
            rolls: options.rolls ?? true
        });
    } catch (e) {
        console.error('utility-journal enrichJournalContent:', e);
        return content;
    }
}

/**
 * Apply Foundry-like structure to journal HTML (sections, headings).
 * @param {string} html - Raw HTML
 * @returns {string}
 */
function applyFoundryJournalStyling(html) {
    if (!html) return '';
    try {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const firstHeader = temp.querySelector('h1, h2, h3');
        if (!firstHeader || firstHeader !== temp.firstElementChild) {
            const section = document.createElement('section');
            while (temp.firstChild) section.appendChild(temp.firstChild);
            temp.appendChild(section);
        }
        const headings = temp.querySelectorAll('h1, h2, h3');
        headings.forEach(h => {
            if (h.nextElementSibling && h.nextElementSibling.tagName !== 'SECTION') {
                const section = document.createElement('section');
                let next = h.nextElementSibling;
                while (next && !['H1', 'H2', 'H3'].includes(next.tagName)) {
                    const move = next;
                    next = next.nextElementSibling;
                    section.appendChild(move);
                }
                if (h.nextSibling) h.parentNode.insertBefore(section, h.nextSibling);
                else h.parentNode.appendChild(section);
            }
        });
        return temp.innerHTML;
    } catch (e) {
        console.error('utility-journal applyFoundryJournalStyling:', e);
        return html;
    }
}

/**
 * Add journal-content classes to a container.
 * @param {HTMLElement} container
 */
function adjustJournalContentStyles(container) {
    if (container?.classList) {
        container.classList.add('journal-entry-page', 'journal-page-content');
    }
}

/**
 * Try to get content from an open journal sheet or via direct enrichment.
 * @param {JournalEntry} journal
 * @param {JournalEntryPage} page
 * @returns {Promise<string|null>}
 */
async function getContentFromJournalUI(journal, page) {
    if (!journal || !page) return null;
    try {
        if (page.type === 'image') {
            return `<div class="journal-image-container" style="text-align: center;">
                <img src="${page.src}" alt="${page.name}" style="max-width: 100%; max-height: 500px;">
                ${page.title ? `<h3>${page.title}</h3>` : ''}
                ${page.caption ? `<div class="image-caption">${page.caption}</div>` : ''}
            </div>`;
        }
        if (page.type === 'pdf') {
            return `<div class="pdf-container" style="text-align: center; padding: 20px;">
                <p>This journal contains a PDF file that cannot be displayed directly in the panel.</p>
                <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Open in Journal Viewer</button>
            </div>`;
        }
        if (!['text', 'markdown'].includes(page.type)) {
            return `<div class="unsupported-type" style="text-align: center; padding: 20px;">
                <p>This journal page uses a special type (${page.type}) that cannot be displayed directly in the panel.</p>
                <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Open in Journal Viewer</button>
            </div>`;
        }

        if (!journal.sheet?.element) {
            const raw = page.text?.content ?? page.text ?? '';
            if (raw && typeof raw === 'string') {
                return await enrichJournalContent(raw, { secrets: game.user.isGM, documents: true, links: true, rolls: true });
            }
            return null;
        }

        const sheetEl = getNativeElement(journal.sheet.element);
        if (sheetEl?.querySelector) {
            const pageContent = sheetEl.querySelector(`.journal-page-content[data-page-id="${page.id}"]`);
            const html = pageContent?.innerHTML ?? '';
            if (html) return html;
        }

        const raw = page.text?.content ?? page.text ?? '';
        if (raw && typeof raw === 'string') {
            return await enrichJournalContent(raw, { secrets: game.user.isGM, documents: true, links: true, rolls: true });
        }
        return null;
    } catch (e) {
        console.error('utility-journal getContentFromJournalUI:', e);
        return null;
    }
}

/**
 * Render journal page content into a container. Uses multiple fallbacks.
 * @param {HTMLElement} container - Element containing .journal-content, or the content div itself
 * @param {JournalEntryPage} page - The page to render
 * @param {Object} options - { journal, canEditPage, permLevels }
 * @returns {Promise<void>}
 */
export async function renderJournalContent(container, page, options = {}) {
    const permLevels = options.permLevels ?? PERMISSION_LEVELS;
    let nativeHtml = getNativeElement(container);
    if (nativeHtml?.querySelector && !nativeHtml.classList?.contains('journal-content')) {
        nativeHtml = nativeHtml.querySelector('.journal-content');
    }
    if (!nativeHtml) return;

    const { journal, canEditPage } = options;
    const contentContainer = nativeHtml.classList?.contains('journal-content') ? nativeHtml : nativeHtml.querySelector?.('.journal-content');
    if (!contentContainer) return;

    if (!page) return;
    contentContainer.setAttribute('data-page-id', page.id);

    if (typeof page !== 'object' || page === null) {
        contentContainer.innerHTML = `<div class="render-error"><i class="fa-solid fa-exclamation-triangle"></i><p>Invalid journal page data.</p><p>Click the "Open Journal" button to view it in the full journal viewer.</p></div>`;
        return;
    }

    const canView = game.user.isGM || userCanAccessPage(page, game.user, permLevels);
    if (!canView) {
        contentContainer.innerHTML = `<div class="permission-error"><i class="fa-solid fa-lock"></i><p>You don't have permission to view this page.</p></div>`;
        return;
    }

    const canEdit = canEditPage ?? (game.user.isGM || page.testUserPermission(game.user, permLevels.OWNER));
    contentContainer.innerHTML = '';
    let renderSuccessful = false;

    try {
        if (typeof page.renderContent === 'function' && ['text', 'markdown'].includes(page.type)) {
            try {
                let rendered = await page.renderContent();
                if (!rendered || (typeof rendered === 'string' && rendered.trim() === '')) {
                    const raw = page.text?.content ?? page.text ?? '';
                    if (raw && typeof raw === 'string') {
                        rendered = await enrichJournalContent(raw, { secrets: game.user.isGM, documents: true, links: true, rolls: true });
                    } else throw new Error('Empty or invalid content');
                }
                const formatted = applyFoundryJournalStyling(rendered);
                contentContainer.classList.add('journal-entry-page', 'journal-page-content', 'prose');
                contentContainer.innerHTML = formatted || rendered;
                const JTS = foundry?.appv1?.sheets?.JournalTextPageSheet ?? foundry?.applications?.sheets?.JournalTextPageSheet ?? globalThis.JournalTextPageSheet;
                if (JTS?.activateListeners) JTS.activateListeners(contentContainer);
                const hasContent = contentContainer.children.length > 0 || (contentContainer.textContent || '').trim().length > 0;
                if (!hasContent) {
                    contentContainer.innerHTML = `<div class="empty-page-content"><p>${canEdit ? 'This page appears to be empty. Click the edit button to add content.' : 'This page appears to be empty.'}</p></div>`;
                }
                renderSuccessful = true;
                contentContainer.querySelectorAll('a').forEach(a => { a.target = '_blank'; });
                return;
            } catch (innerErr) {
                console.error('utility-journal renderContent:', innerErr);
            }
        }
    } catch (e) {
        console.error('utility-journal renderContent fallback:', e);
    }

    if (!renderSuccessful) {
        try {
            const uiContent = await getContentFromJournalUI(journal, page);
            if (uiContent) {
                contentContainer.classList.add('journal-entry-page', 'journal-page-content');
                contentContainer.innerHTML = uiContent;
                adjustJournalContentStyles(contentContainer);
                contentContainer.querySelectorAll('a').forEach(a => { a.target = '_blank'; });
                renderSuccessful = true;
                return;
            }
        } catch (uiErr) {
            /* continue */
        }
    }

    if (!renderSuccessful && typeof page.render === 'function') {
        try {
            const renderPromise = new Promise((resolve, reject) => {
                const timeout = trackModuleTimeout(() => reject(new Error('Render timeout')), 3000);
                try {
                    const result = page.render(contentContainer, { editable: false });
                    if (result?.then) {
                        result.then(() => { clearTrackedTimeout(timeout); resolve(); }).catch(e => { clearTrackedTimeout(timeout); reject(e); });
                    } else {
                        clearTrackedTimeout(timeout);
                        resolve();
                    }
                } catch (e) {
                    clearTrackedTimeout(timeout);
                    reject(e);
                }
            });
            await renderPromise;
            adjustJournalContentStyles(contentContainer);
            const hasContent = contentContainer.children.length > 0 || (contentContainer.textContent || '').trim().length > 0;
            if (!hasContent) {
                contentContainer.innerHTML = `<div class="empty-page-content"><p>${canEdit ? 'This page appears to be empty. You can edit it in the journal.' : 'This page appears to be empty.'}</p></div>`;
            }
            renderSuccessful = true;
            contentContainer.querySelectorAll('a').forEach(a => { a.target = '_blank'; });
            return;
        } catch (e) {
            /* continue to next fallback */
        }
    }

    if (!renderSuccessful) {
        try {
            if (page.type === 'image') {
                contentContainer.innerHTML = `<div class="journal-image-container" style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <img src="${page.src}" alt="${page.name}" style="max-width: 100%; max-height: 500px;">
                    ${page.title ? `<h3>${page.title}</h3>` : ''}
                    ${page.caption ? `<div class="image-caption">${page.caption}</div>` : ''}
                </div>`;
                adjustJournalContentStyles(contentContainer);
                return;
            }
            if (page.type === 'pdf') {
                contentContainer.innerHTML = `<div class="pdf-container" style="text-align: center; padding: 20px; background: white; border-radius: 5px;">
                    <p>This journal contains a PDF file that cannot be displayed directly in the panel.</p>
                    <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Open in Journal Viewer</button>
                </div>`;
                const btn = contentContainer.querySelector('.open-journal-button');
                if (btn && journal) btn.addEventListener('click', () => journal.sheet?.render(true, { pageId: page.id }));
                adjustJournalContentStyles(contentContainer);
                return;
            }
            if (!['text', 'markdown'].includes(page.type)) {
                contentContainer.innerHTML = `<div class="unsupported-type" style="text-align: center; padding: 20px; background: white; border-radius: 5px;">
                    <p>This journal page uses a special type (${page.type}) that cannot be displayed directly in the panel.</p>
                    <button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Open in Journal Viewer</button>
                </div>`;
                const btn = contentContainer.querySelector('.open-journal-button');
                if (btn && journal) btn.addEventListener('click', () => journal.sheet?.render(true, { pageId: page.id }));
                adjustJournalContentStyles(contentContainer);
                return;
            }

            let content = page.text?.content ?? (typeof page.text === 'string' ? page.text : '');
            if (!content) content = await getJournalPageContent(page);
            if (content && typeof content === 'string') {
                content = await enrichJournalContent(content, { secrets: game.user.isGM, documents: true, links: true, rolls: true });
            }
            if (!content || (typeof content === 'string' && content.trim() === '')) {
                content = `<div class="empty-page-content" style="text-align: center; padding: 40px 20px; color: #666; font-style: italic; background: white; border-radius: 5px;">
                    <p>${canEdit ? 'This page appears to be empty. You can edit it in the journal.' : 'This page appears to be empty.'}</p>
                    <p style="margin-top: 10px"><button class="open-journal-button" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Open Full Journal</button></p>
                </div>`;
            }
            contentContainer.classList.add('journal-entry-page', 'journal-page-content');
            contentContainer.innerHTML = content;
            const openBtn = contentContainer.querySelector('.open-journal-button');
            if (openBtn && journal) {
                openBtn.addEventListener('click', () => journal.sheet?.render(true, page ? { pageId: page.id } : undefined));
            }
            adjustJournalContentStyles(contentContainer);
            contentContainer.querySelectorAll('a:not(.open-journal-button)').forEach(a => { a.target = '_blank'; });
        } catch (textErr) {
            console.error('utility-journal text fallback:', textErr);
            contentContainer.innerHTML = `<div class="render-error"><i class="fa-solid fa-exclamation-triangle"></i><p>An unexpected error occurred.</p><p>Click the "Open Journal" button to view it in the full journal viewer.</p></div>`;
        }
    }
}

/**
 * Show a journal picker dialog: a single, alphabetically-sorted dropdown.
 *
 * There used to be a second "grid" mode — a wall of book cards with a gold
 * thumbtack on the current selection — and it was the DEFAULT, so quest and
 * notes got it simply by never passing `mode`. Only codex opted into the
 * dropdown. The grid is gone: one picker, one behaviour, sorted everywhere.
 *
 * @param {Object} options
 * @param {string} [options.title] - Dialog title
 * @param {Object} [options.choices] - { id: name }; built from world journals when omitted
 * @param {string} [options.selectedId] - Pre-selected id
 * @param {() => string} [options.getCurrentId] - Legacy alias for selectedId
 * @param {(journalId: string) => Promise<void>} options.onSelect - Called on save
 * @param {() => void} [options.reRender] - Called after selection to refresh the panel
 * @param {string} [options.hint] - Short plain-text hint, rendered in Foundry's native hint style
 */
export function showJournalPicker(options) {
    const {
        title = 'Select Journal',
        choices = null,
        selectedId = null,
        getCurrentId,
        onSelect,
        reRender,
        hint = ''
    } = options;

    const currentId = selectedId
        ?? (typeof getCurrentId === 'function' ? getCurrentId() : getCurrentId)
        ?? 'none';

    // Alphabetical, with the clear option pinned first.
    const entries = (() => {
        const byLabel = (a, b) => String(a[1]).localeCompare(String(b[1]));
        if (choices) {
            const list = Object.entries(choices);
            return [
                ...list.filter(([id]) => id === 'none'),
                ...list.filter(([id]) => id !== 'none').sort(byLabel)
            ];
        }
        return [
            ['none', '- Select Journal -'],
            ...game.journal.contents.map(j => [j.id, j.name]).sort(byLabel)
        ];
    })();

    const optionsHtml = entries.map(([id, name]) =>
        `<option value="${escapeHtml(id)}"${id === currentId ? ' selected' : ''}>${escapeHtml(name)}</option>`
    ).join('');

    new Dialog({
        title,
        width: 600,
        content: `<form>${hint ? `<p class="notes">${escapeHtml(hint)}</p>` : ''}<div class="form-group"><label>Journal:</label><select name="journal">${optionsHtml}</select></div></form>`,
        buttons: {
            save: {
                icon: '<i class="fa-solid fa-save"></i>',
                label: 'Save',
                callback: async (html) => {
                    const el = getNativeElement(html);
                    const id = el?.querySelector?.('select[name="journal"]')?.value ?? null;
                    if (onSelect && id != null) await onSelect(id);
                    if (reRender) reRender();
                }
            },
            cancel: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel' }
        },
        default: 'save'
    }).render(true);
}


/**
 * Show a page picker dialog for a journal.
 * @param {JournalEntry} journal - The journal
 * @param {Object} options - { onSelect(pageId), reRender, permLevels }
 */
export function showPagePicker(journal, options = {}) {
    if (!journal || !game.user.isGM) return;
    const permLevels = options.permLevels ?? PERMISSION_LEVELS;
    const onSelect = options.onSelect;
    const reRender = options.reRender;

    const pages = journal.pages.contents.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        img: p.type === 'image' ? p.src : (p.type === 'text' ? 'icons/svg/book.svg' : 'icons/svg/page.svg'),
        permissions: getPagePermissionLabel(p, permLevels)
    }));
    pages.sort((a, b) => a.name.localeCompare(b.name));

    const gridHtml = pages.length === 0
        ? `<div class="no-pages-message" style="text-align: center; padding: 20px;">
            <i class="fa-solid fa-exclamation-circle" style="font-size: 2em; margin-bottom: 10px; color: #aa0000;"></i>
            <p>No pages found in this journal.</p>
            <p>You need to add at least one page to the journal first.</p>
          </div>`
        : `<div class="page-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 15px;">
            ${pages.map(p => `
            <div class="page-item" data-id="${p.id}" style="cursor: pointer; text-align: center; border: 1px solid #666; border-radius: 5px; padding: 10px; background: rgba(0,0,0,0.2);">
                <div class="page-image" style="height: 80px; display: flex; align-items: center; justify-content: center; background-size: contain; background-position: center; background-repeat: no-repeat; ${p.type === 'image' ? `background-image: url('${p.img}');` : ''}">
                    ${p.type !== 'image' ? `<i class="fas ${p.type === 'text' ? 'fa-book-open' : 'fa-file'}" style="font-size: 2em; color: #666;"></i>` : ''}
                </div>
                <div class="page-name" style="margin-top: 5px; font-weight: bold;">${p.name}</div>
                <div class="page-info" style="display: flex; justify-content: space-between; font-size: 0.8em; color: #999;">
                    <span style="text-transform: capitalize;">${p.type}</span>
                    <span title="Page permissions">${p.permissions}</span>
                </div>
            </div>
            `).join('')}
          </div>`;

    const content = `<h2 style="text-align: center; margin-bottom: 5px;">${journal.name}</h2><p style="text-align: center; margin-bottom: 15px; color: #999;">Select a page to display</p>${gridHtml}<div class="dialog-buttons" style="display: flex; justify-content: space-between; margin-top: 15px;"><button class="cancel-button" style="flex: 1; margin-right: 5px;">Cancel</button><button class="open-journal-button" style="flex: 1; margin-left: 5px;">Open Journal</button></div>`;

    const dialog = new Dialog({
        title: 'Select Journal Page',
        content,
        buttons: {},
        render: html => {
            const dlg = getNativeElement(html);
            dlg.querySelectorAll('.page-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const pageId = item.dataset.id;
                    if (onSelect) await onSelect(pageId);
                    ui.notifications.info('Journal page selected.');
                    dialog.close();
                    if (reRender) reRender();
                });
            });
            const cancelBtn = dlg.querySelector('.cancel-button');
            if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.close());
            const openBtn = dlg.querySelector('.open-journal-button');
            if (openBtn) openBtn.addEventListener('click', () => { journal.sheet?.render(true); dialog.close(); });
        },
        default: '',
        close: () => {}
    });
    dialog.render(true);
}

