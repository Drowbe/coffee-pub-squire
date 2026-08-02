import { MODULE, TEMPLATES } from './const.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { CompendiumSearchUtility } from './utility-compendium-search.js';

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
        this.results = { available: CompendiumSearchUtility.isAvailable(), tooShort: true, groups: [], total: 0 };
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
                total: 0
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

        const templateData = {
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            query: this.query,
            searching: this.searching,
            minLength: CompendiumSearchUtility.getMinQueryLength(),
            available: this.results.available,
            tooShort: this.results.tooShort,
            groups: this.results.groups
        };

        const content = await renderTemplate(TEMPLATES.PANEL_COMPENDIUM_SEARCH, templateData);
        this._removeEventListeners();
        panel.innerHTML = content;
        this._activateListeners(panel);
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
            button.classList.add('fa-spin');

            try {
                await CompendiumSearchUtility.addToActor(this.actor, uuid, 1);
            } finally {
                button.dataset.processing = 'false';
                button.classList.remove('fa-spin');
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
