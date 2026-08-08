import { MODULE, TEMPLATES } from './const.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';
import { CompendiumRequestUtils } from './compendium-request-utils.js';

// Wait this long after the last keystroke before searching. Long enough that
// typing "longbow" is one query rather than seven, short enough to feel live.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Quick-add results panel.
 *
 * Takes over the stacked panel area when compendium-search mode is active,
 * driven by the same global search box that filters the panels normally.
 * Results are grouped by compendium in Blacksmith's configured priority order.
 */
export class CompendiumSearchPanel {
    constructor(actor) {
        this.actor = actor;
        this.query = '';
        this.searching = false;
        this.results = {
            available: CompendiumSearchUtility.isAvailable(),
            tooShort: true,
            groups: [],
            total: 0,
            truncated: false
        };
        this._listenerController = null;
        this._debounceHandle = null;
        // Guards against an earlier slow search overwriting a later fast one.
        this._searchToken = 0;
    }

    /**
     * Run a search for the current term and re-render when it lands.
     * Debounced; safe to call on every keystroke.
     */
    setQuery(query) {
        this.query = String(query ?? '');

        if (this._debounceHandle) {
            clearTimeout(this._debounceHandle);
            this._debounceHandle = null;
        }

        // Short queries resolve synchronously — no spinner flash for a state
        // the adapter answers without touching a pack.
        if (this.query.trim().length < CompendiumSearchUtility.getMinQueryLength()) {
            this._searchToken++;
            this.searching = false;
            this.results = {
                available: CompendiumSearchUtility.isAvailable(),
                tooShort: true,
                groups: [],
                total: 0,
                truncated: false
            };
            this.render(this.element);
            return;
        }

        this.searching = true;
        this.render(this.element);

        this._debounceHandle = setTimeout(async () => {
            const token = ++this._searchToken;
            const results = await CompendiumSearchUtility.search(this.query);
            // A newer keystroke already superseded this search.
            if (token !== this._searchToken) return;
            this.results = results;
            this.searching = false;
            await this.render(this.element);
        }, SEARCH_DEBOUNCE_MS);
    }

    async render(html) {
        if (html) this.element = getNativeElement(html);
        if (!this.element) return;

        const panel = this.element.querySelector('[data-panel="compendium-search"]');
        if (!panel) return;

        // The results list is the same list at every access level; only what you
        // can do with a row changes. Resolved per render rather than held on the
        // instance so a GM flipping the setting mid-session reaches an open tray.
        const canAdd = CompendiumSearchUtility.canAdd(this.actor);
        const canRequest = CompendiumSearchUtility.canRequest(this.actor);

        const templateData = {
            canAdd,
            canRequest,
            panelIcon: canAdd ? 'fa-circle-plus' : (canRequest ? 'fa-paper-plane' : 'fa-book-open-cover'),
            panelTitle: canAdd
                ? 'Add From Compendiums'
                : (canRequest ? 'Request From Compendiums' : 'Browse Compendiums'),
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            query: this.query,
            searching: this.searching,
            minLength: CompendiumSearchUtility.getMinQueryLength(),
            available: this.results.available,
            tooShort: this.results.tooShort,
            groups: this.results.groups,
            total: this.results.total,
            truncated: this.results.truncated,
            skippedCount: this.results.skippedCount
        };

        const content = await renderTemplate(TEMPLATES.PANEL_COMPENDIUM_SEARCH, templateData);
        this._removeEventListeners();
        panel.innerHTML = content;
        this._activateListeners(panel);
    }


    /**
     * The rendered result for a uuid. Rows carry a uuid and a document class and
     * nothing else, but a request card wants the name, image, and source that
     * were on screen when the player clicked.
     */
    _findResult(uuid) {
        for (const group of this.results.groups ?? []) {
            const match = group.items?.find(item => item.uuid === uuid);
            if (match) return match;
        }
        return null;
    }

    _removeEventListeners() {
        if (this._listenerController) {
            this._listenerController.abort();
            this._listenerController = null;
        }
    }

    _activateListeners(panel) {
        this._listenerController = new AbortController();
        const signal = this._listenerController.signal;

        // Add to character
        panel.addEventListener('click', async (event) => {
            const button = event.target.closest('.compendium-search-add');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();

            const row = button.closest('.compendium-search-item');
            const uuid = row?.dataset.uuid;
            if (!uuid) return;

            // A compendium round-trip is slow enough to double-click through.
            if (button.dataset.processing === 'true') return;
            button.dataset.processing = 'true';
            // `.faded` is the tray's existing in-flight/inactive vocabulary.
            // Spinning a plus is close to invisible — it's near enough to
            // radially symmetric that it reads as nothing happening.
            button.classList.add('faded');

            try {
                const created = await CompendiumSearchUtility.addToActor(this.actor, uuid, 1);
                // Both branches only fire on a successful add: after a failure
                // the query is what you need to retry with, and there is no item
                // to go and look at.
                if (created) {
                    if (game.settings.get(MODULE.ID, 'compendiumClearOnAdd')) {
                        // Adding several things: empty the box, stay here.
                        this.onRequestClearSearch?.();
                    } else {
                        // Adding one thing: go look at it on the sheet.
                        this.onRequestRevealItem?.(created);
                    }
                }
            } finally {
                button.dataset.processing = 'false';
                button.classList.remove('faded');
            }
        }, { signal });

        // Open the compendium item's sheet without adding it
        panel.addEventListener('click', async (event) => {
            const button = event.target.closest('.compendium-search-view');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();

            const row = button.closest('.compendium-search-item');
            const uuid = row?.dataset.uuid;
            if (!uuid) return;
            const doc = await fromUuid(uuid);
            doc?.sheet?.render(true);
        }, { signal });

        // Ask the GM to add it — the "request" rung. Only rendered at that
        // level, and the row carries no more than a uuid, so the entry is read
        // back out of the results the row was rendered from.
        panel.addEventListener('click', async (event) => {
            const button = event.target.closest('.compendium-search-request');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();

            const row = button.closest('.compendium-search-item');
            const uuid = row?.dataset.uuid;
            if (!uuid) return;

            if (button.dataset.processing === 'true') return;
            button.dataset.processing = 'true';
            button.classList.add('faded');

            try {
                const entry = this._findResult(uuid);
                if (entry) await CompendiumRequestUtils.sendRequest(this.actor, entry);
            } finally {
                button.dataset.processing = 'false';
                button.classList.remove('faded');
            }
        }, { signal });

        // Drag straight onto a sheet, the canvas, or a journal.
        //
        // `{type, uuid}` on `text/plain` is what TextEditor.getDragEventData
        // parses and every core _onDrop* handler expects. `type` here is the
        // document CLASS from the API, not the row's subtype badge — a spell
        // result is class 'Item', so deriving this from the searched type token
        // would build payloads no sheet accepts, and only for spell rows.
        //
        // Add rung only. Dropping a row onto a sheet creates the item directly,
        // which is the same mutation the add button performs, so leaving the
        // drag live for a browsing or requesting player would be a second
        // unguarded door into what the setting just closed. `draggable` is
        // already false on those rows; this is the half that survives someone
        // editing the attribute in devtools.
        panel.addEventListener('dragstart', (event) => {
            if (!CompendiumSearchUtility.canAdd(this.actor)) return;

            const row = event.target.closest?.('.compendium-search-item');
            if (!row?.dataset.uuid || !row.dataset.documentClass) return;

            event.dataTransfer.setData('text/plain', JSON.stringify({
                type: row.dataset.documentClass,
                uuid: row.dataset.uuid
            }));
            event.dataTransfer.effectAllowed = 'copy';

            // Drag the icon, not the row: a full-width row ghost covers the
            // sheet you're aiming at.
            const thumb = row.querySelector('.panel-item-image');
            if (thumb) event.dataTransfer.setDragImage(thumb, 16, 16);
        }, { signal });

        // Leave search mode
        panel.addEventListener('click', (event) => {
            if (!event.target.closest('.compendium-search-close')) return;
            event.preventDefault();
            event.stopPropagation();
            // The control panel owns the mode and knows how to restore the stack.
            this.onRequestClose?.();
        }, { signal });
    }

    destroy() {
        if (this._debounceHandle) {
            clearTimeout(this._debounceHandle);
            this._debounceHandle = null;
        }
        this._removeEventListeners();
        this.element = null;
    }
}
