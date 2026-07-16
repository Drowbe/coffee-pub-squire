import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { CodexParser } from './utility-codex-parser.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { copyToClipboard, getNativeElement, renderTemplate, getTextEditor, escapeHtml } from './helpers.js';
import { trackModuleTimeout, moduleDelay } from './timer-utils.js';
import { showJournalPicker } from './utility-journal.js';
import {
    resolveCodexLinks,
    mergeCodexLinks,
    reportResolution,
    normalizeCodexLink,
    codexLinkKey
} from './utility-resolver.js';
import {
    getPinsApi,
    isPinsApiAvailable,
    createCodexPin,
    deleteCodexPin,
    beginCodexPinPlacement,
    unplaceCodexPin,
    updateCodexPinVisibility
} from './manager-pins.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

/**
 * Normalize a name for matching: lowercase, collapse interior runs of
 * whitespace, trim. "Wayfinder  Casing" and "Wayfinder Casing" are the same name.
 *
 * Used for both inventory auto-discovery and codex entry references. BOTH sides
 * of every comparison must go through this — inlining the expression is how the
 * codex-entry side drifted from the item side and stopped matching any name
 * containing a double space.
 */
function normalizeName(name) {
    return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Index every codex entry in the journal by normalized name, for resolving
 * `related` names and location levels to pages.
 *
 * Built fresh per render rather than cached: the index changes whenever ANY
 * entry is added or renamed, so a cached one would leave "Phlan" unlinked after
 * "Moonsea" is created. It is one O(n) pass over pages already in memory.
 *
 * Respects the viewer: entries a player can't observe are omitted, so their
 * names render as plain text rather than as links to something they can't open.
 */
function buildCodexPageIndex(journal) {
    const index = new Map();
    for (const page of (journal?.pages ?? [])) {
        if (page.type !== CODEX_PAGE_TYPE) continue;
        if (!game.user.isGM
            && (page.ownership?.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) continue;
        const key = normalizeName(page.name);
        if (key && !index.has(key)) index.set(key, { uuid: page.uuid, name: page.name });
    }
    return index;
}

const CODEX_WINDOW_ID = `${MODULE.ID}-codex-window`;

function openCodexWindow(options = {}) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn('Codex window is not ready yet.');
        return null;
    }
    return blacksmith.openWindow(CODEX_WINDOW_ID, options);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournal = null;
        this.categories = new Set();
        this.data = {};
        // One-time GM notice about legacy (pre-data-model) text pages in the journal
        this._legacyNoticeShown = false;
        this.filters = {
            search: "",
            tags: [],
            category: "all"
        };
        this.allTags = new Set();
        this.isImporting = false;
        // Entry uuids the user has expanded. Entries default to collapsed, so this
        // tracks the exceptions. Held here rather than only as a DOM class: the
        // template renders every card collapsed, so ANY re-render (pinning,
        // toggling visibility, an Auto-Link pass) used to slam every open entry
        // shut under the user. Hydrated lazily from the user flag on first use —
        // the constructor can run before `game.user` exists.
        this._expandedEntries = null;
        this._setupHooks();
        // Pin events registered centrally by manager-pins.js initPinManager().
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are handled by HookManager
        // This method is kept for compatibility but no longer registers hooks
    }

    /**
     * Show the global progress bar for codex imports
     * @private
     */
    _showProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting codex import...';
        }
    }

    /**
     * Update the global progress bar
     * @private
     */
    _updateProgressBar(percent, text) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = text;
        }
    }

    /**
     * Hide the global progress bar
     * @private
     */
    _hideProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        if (progressArea) {
            progressArea.style.display = 'none';
        }
    }

    /**
     * Expanded entry uuids, hydrated once from the user flag.
     *
     * Persisted the same way category collapse is (`codexCollapsedCategories`),
     * so the tray comes back the way the user left it.
     *
     * @returns {Set<string>}
     * @private
     */
    _getExpandedEntries() {
        if (!this._expandedEntries) {
            const stored = game.user?.getFlag(MODULE.ID, 'codexExpandedEntries');
            this._expandedEntries = new Set(Array.isArray(stored) ? stored : []);
        }
        return this._expandedEntries;
    }

    /**
     * Persist expansion across reloads.
     *
     * Prunes uuids whose page no longer exists: re-import replaces pages with new
     * ones, so without this the flag would accumulate dead ids forever. Skipped
     * when no journal is selected — an empty page list there means "unknown",
     * not "everything was deleted".
     *
     * @private
     */
    _persistExpandedEntries() {
        const set = this._getExpandedEntries();
        if (this.selectedJournal?.pages) {
            const live = new Set(this.selectedJournal.pages.contents.map(p => p.uuid));
            for (const uuid of set) if (!live.has(uuid)) set.delete(uuid);
        }
        game.user?.setFlag(MODULE.ID, 'codexExpandedEntries', Array.from(set));
    }

    /**
     * Record a category's collapsed state.
     *
     * Category collapse is driven by the `codexCollapsedCategories` flag at render
     * time, so expanding a section in the DOM alone is undone by the next render.
     * Anything that opens a section must come through here.
     *
     * @param {string|undefined} category
     * @param {boolean} collapsed
     * @private
     */
    _setCategoryCollapsed(category, collapsed) {
        if (!category) return;
        const flags = game.user?.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        if (!!flags[category] === !!collapsed) return; // no-op; skip the write
        flags[category] = !!collapsed;
        game.user?.setFlag(MODULE.ID, 'codexCollapsedCategories', flags);
    }

    /**
     * Purge malformed keys from `codexCollapsedCategories`, once per session.
     *
     * Older versions derived the key from rendered element text instead of the
     * `data-category` attribute, so the flag accumulated entries like
     * `" Locations\n "`, `" Artifacts\n \n Browse\n \n \n "`, and HTML-escaped
     * `"Crafting &amp; gathering"`. A junk key is one that isn't identical to its
     * own trimmed form, or that contains markup/newlines.
     *
     * Harmless now that collapse is read by exact key, but they're removed so the
     * flag stops growing and so any future trim-style matching can't resurrect
     * this bug. The clean key always wins — junk never overwrites a real value.
     *
     * @private
     */
    _pruneCategoryFlags() {
        if (this._categoryFlagsPruned) return;
        this._categoryFlagsPruned = true;
        const flags = game.user?.getFlag(MODULE.ID, 'codexCollapsedCategories');
        if (!flags || typeof flags !== 'object') return;

        const clean = {};
        let dropped = 0;
        for (const [key, value] of Object.entries(flags)) {
            const isJunk = key !== key.trim() || /[\n\r<>&]/.test(key);
            if (isJunk) { dropped++; continue; }
            clean[key] = !!value;
        }
        if (!dropped) return;

        game.user?.setFlag(MODULE.ID, 'codexCollapsedCategories', clean);
        getBlacksmith()?.utils?.postConsoleAndNotification(
            MODULE.NAME,
            `Codex: pruned ${dropped} malformed category-collapse key(s)`,
            { dropped, kept: Object.keys(clean) },
            false,
            false
        );
    }

    /**
     * Toggle a card's collapsed state, recording it so it survives re-render
     * and reload.
     * @param {HTMLElement|null} card
     * @private
     */
    _toggleEntryCollapsed(card) {
        if (!card) return;
        const uuid = card.dataset?.uuid;
        const collapsed = card.classList.toggle('collapsed');
        if (!uuid) return;
        const set = this._getExpandedEntries();
        if (collapsed) set.delete(uuid);
        else set.add(uuid);
        this._persistExpandedEntries();
    }

    /**
     * Open a codex entry IN THE TRAY: expand it, reveal its category, scroll to
     * it, and flash it.
     *
     * This is what `related` names and location levels point at — a codex entry,
     * not the journal page behind it. Same destination as double-clicking a codex
     * pin, so a reference and a pin behave identically. (Document `links` are
     * different: those are real documents and open their own sheets.)
     *
     * @param {string} uuid
     * @returns {boolean} false if the entry isn't currently rendered
     * @private
     */
    _focusEntry(uuid) {
        const card = this.element?.querySelector(`.codex-entry[data-uuid="${uuid}"]`);
        if (!card) return false;
        const section = card.closest('.codex-section');
        if (section) {
            section.classList.remove('collapsed');
            // Persist it. Expanding the section in the DOM alone lasts until the
            // next render, which then snaps it shut — that is what made pinning an
            // entry look like it collapsed the whole category.
            this._setCategoryCollapsed(section.dataset?.category, false);
        }
        card.classList.remove('collapsed');
        this._getExpandedEntries().add(uuid);
        this._persistExpandedEntries();
        card.classList.add('codex-highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => card.classList.remove('codex-highlighted'), 2000);
        return true;
    }

    /**
     * Render a reference to another codex entry by name.
     *
     * Resolved → an anchor the panel opens on click. Unresolved → the plain name,
     * which is NOT an error: a codex is authored incrementally, so a relationship
     * may name an entry that doesn't exist yet. It becomes a link on the next
     * render after that entry is created — no rescan, no stored uuid to migrate.
     *
     * @param {string} name
     * @param {Map<string, {uuid: string, name: string}>} index
     * @returns {string} HTML
     * @private
     */
    _renderCodexRef(name, index) {
        const raw = String(name ?? '').trim();
        if (!raw) return '';
        const hit = index.get(normalizeName(raw));
        if (!hit) return `<span class="codex-ref-unresolved">${escapeHtml(raw)}</span>`;
        return `<a class="codex-ref" data-uuid="${escapeHtml(hit.uuid)}">${escapeHtml(raw)}</a>`;
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this.element = null;
    }

    /**
     * Check if a page belongs to the selected journal
     * @private
     */
    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page is actually a CODEX entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if this appears to be a CODEX entry
     */
    _isCodexEntry(page) {
        try {
            // Quick check: if no text content, it's not a CODEX entry
            if (!page.text?.content) return false;
            
            // Get the raw text content to check for CODEX structure
            let content = '';
            if (typeof page.text.content === 'string') {
                content = page.text.content;
            } else if (page.text.content) {
                // For async content, we'll need to check it differently
                // For now, assume it might be a CODEX entry if we can't determine otherwise
                return true;
            }
            
            // Check if the content contains CODEX-specific markers
            // CODEX entries should have a CATEGORY field, but we'll be more lenient
            if (content && typeof content === 'string') {
                // Look for CATEGORY field (case-insensitive)
                const hasCategory = /<strong>category<\/strong>|<strong>category:<\/strong>/i.test(content);
                
                // If it has a category field, it's definitely a CODEX entry
                if (hasCategory) return true;
                
                // If no category field, check if it has other CODEX-like structure
                // Look for common CODEX fields to determine if this might be a CODEX entry
                const hasDescription = /<strong>description<\/strong>|<strong>description:<\/strong>/i.test(content);
                const hasTags = /<strong>tags<\/strong>|<strong>tags:<\/strong>/i.test(content);
                const hasPlotHook = /<strong>plot hook<\/strong>|<strong>plot hook:<\/strong>/i.test(content);
                const hasLocation = /<strong>location<\/strong>|<strong>location:<\/strong>/i.test(content);
                
                // If it has multiple CODEX-like fields, it's probably a CODEX entry
                const codexFieldCount = [hasDescription, hasTags, hasPlotHook, hasLocation].filter(Boolean).length;
                if (codexFieldCount >= 2) return true;
                
                // If we can't determine, assume it's not a CODEX entry to be safe
                return false;
            }
            
            // If we can't determine, assume it's not a CODEX entry to be safe
            return false;
        } catch (error) {
            // If there's any error checking, assume it's not a CODEX entry
            // This prevents crashes and excessive processing
            return false;
        }
    }

    /**
     * Get the icon class for a given category
     * @param {string} category
     * @returns {string} FontAwesome icon class
     */
    getCategoryIcon(category, customIcon = '') {
        const normalizedCustomIcon = String(customIcon || '').trim();
        if (normalizedCustomIcon) return normalizedCustomIcon;
        const map = {
            'No Category': 'fa-solid fa-question-circle',
            'Artifacts': 'fa-solid fa-gem',
            'Characters': 'fa-solid fa-user',
            'Establishments': 'fa-solid fa-shop',
            'Events': 'fa-solid fa-calendar-star',
            'Factions': 'fa-solid fa-shield-cross',
            'Items': 'fa-solid fa-box',
            'Landmarks': 'fa-solid fa-monument',
            'Locations': 'fa-solid fa-location-pin',
            'Maps': 'fa-solid fa-map'
            // Add more mappings as needed
        };
        return map[category] || 'fa-solid fa-book';
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.categories.clear();
        this.data = {};
        this.allTags.clear();

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        this.selectedJournal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (this.selectedJournal) {
            // Typed pages only: fields come straight from page.system — no parsing.
            // Legacy text pages are counted and surfaced to the GM once (re-import converts).
            let legacyPageCount = 0;

            for (const page of this.selectedJournal.pages.contents) {
                try {
                    if (page.type !== CODEX_PAGE_TYPE) {
                        legacyPageCount++;
                        continue;
                    }

                    const sys = page.system;
                    const entry = {
                        name: page.name,
                        uuid: page.uuid,
                        // Explicit image wins; otherwise the first illustration in the
                        // Expanded Details is the entry image (the pre-data-model behavior)
                        img: sys.img || CodexParser.extractImage(page.text?.content || '') || '',
                        category: sys.category || '',
                        categoryIcon: sys.categoryIcon || '',
                        summary: sys.summary || '',
                        description: sys.summary || '', // legacy alias
                        plotHook: sys.plotHook || '',
                        location: sys.location || '',
                        links: sys.linkList,
                        link: sys.linkData, // legacy alias (first resolved link)
                        // Names only. Resolved to pages at render, not here: this parse
                        // is cached per page, but the name -> page index changes whenever
                        // ANY entry is added or renamed, so caching a resolution would
                        // leave "Phlan" unlinked after "Moonsea" is created.
                        related: Array.from(sys.related || []),
                        tags: Array.from(sys.tags || []),
                        hasExpandedDetails: sys.hasExpandedDetails,
                        DiscoveredBy: (sys.discoveredBy || []).join(', '),
                        pinId: page.getFlag(MODULE.ID, 'pinId') ?? null
                    };

                    if (entry.category.length > 0) {
                        entry.category = entry.category.charAt(0).toUpperCase() + entry.category.slice(1).toLowerCase();
                    }

                    // Split the location path into labeled hierarchy levels for display
                    const LOCATION_LEVELS = ['Realm', 'Region', 'Site', 'Area'];
                    entry.locationParts = entry.location
                        .split('>')
                        .map(p => p.trim())
                        .filter(Boolean)
                        .map((value, i) => ({ label: LOCATION_LEVELS[i] || `Level ${i + 1}`, value }));

                    if (entry) {
                        // Volatile per refresh: ownership reference and live pin/scene state
                        entry.ownership = page.ownership;

                        // Pin state — get() now includes sceneId for placed pins (Blacksmith 13.7.6+).
                        entry.pinSceneId = entry.pinId ? (getPinsApi()?.get?.(entry.pinId)?.sceneId ?? null) : null;
                        const activeSceneId = canvas?.scene?.id;
                        entry.hasPinOnScene = !!(entry.pinId && entry.pinSceneId);
                        entry.pinOnActiveScene = !!(
                            entry.pinId
                            && entry.pinSceneId
                            && activeSceneId
                            && entry.pinSceneId === activeSceneId
                        );
                        entry.pinSceneName = entry.pinSceneId
                            ? (game.scenes.get(entry.pinSceneId)?.name?.trim() || 'Unknown scene')
                            : '';

                        // Determine category - if no category, use "No Category"
                        let normCategory = "No Category";
                        if (entry.category && entry.category.trim()) {
                            normCategory = entry.category.trim();
                        }

                        // Add to categories set
                        this.categories.add(normCategory);
                        // Initialize category array if needed
                        if (!this.data[normCategory]) {
                            this.data[normCategory] = [];
                        }
                        // Add entry to category
                        this.data[normCategory].push(entry);
                        // Add tags
                        if (entry.tags && Array.isArray(entry.tags)) {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                        }
                    }
                } catch (error) {
                    console.error('Error parsing codex entry:', error);
                }
            }

            // Surface legacy (pre-data-model) text pages to the GM once per session
            if (legacyPageCount > 0 && game.user.isGM && !this._legacyNoticeShown) {
                this._legacyNoticeShown = true;
                ui.notifications.warn(`Codex: ${legacyPageCount} legacy text page(s) in the codex journal are not shown. Re-import your codex JSON to convert them to codex pages.`);
            }
        }
    }

    /**
     * Set up event listeners
     * @private
     */
    _activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Search input - live DOM filtering
        const codexSearchContainer = nativeHtml.querySelector('.codex-search');
        const searchInput = codexSearchContainer?.querySelector('input');
        const clearButton = nativeHtml.querySelector('.clear-search');
        
        // --- DOM-based filtering for search and tags ---
        const filterEntries = () => {
            const search = this.filters.search.trim().toLowerCase();
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                let text = entry.textContent?.toLowerCase() || '';
                let searchMatch = true;
                if (search) {
                    searchMatch = text.includes(search);
                }
                // Hide entries the user cannot see (non-GMs)
                if (!game.user.isGM) {
                    // Try to get ownership from data attribute, fallback to hiding if not present
                    const ownershipDefault = entry.dataset.ownershipDefault;
                    if (typeof ownershipDefault !== 'undefined' && parseInt(ownershipDefault) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                        entry.style.display = 'none';
                        return;
                    }
                }
                entry.style.display = searchMatch ? '' : 'none';
            });
            // Hide category sections with no visible entries
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                // Check if section has any visible entries
                const hasVisible = section.querySelector('.codex-entry[style*="display: block"], .codex-entry:not([style*="display: none"])') !== null;
                section.style.display = hasVisible ? '' : 'none';
            });
        };

        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                const searchValue = event.target.value.toLowerCase();
            this.filters.search = searchValue;
            // Show all entries and sections before filtering
            // v13: Use nativeHtml instead of html
            nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                entry.style.display = '';
            });
            nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                section.style.display = '';
            });
            if (searchValue) {
                if (clearButton) {
                    clearButton.classList.remove('disabled');
                }
                // Always expand all categories during search
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.classList.remove('collapsed');
                });
                filterEntries();
            } else {
                if (clearButton) {
                    clearButton.classList.add('disabled');
                }
                // When search is cleared, restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        // v13: Use safer selector approach to handle values with newlines/whitespace
                        const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                        const section = Array.from(sections).find(s => {
                            const attrValue = s.getAttribute('data-category');
                            return attrValue && attrValue.trim() === category.trim();
                        });
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                }
                // Only filter by tags if any are selected
                if (this.filters.tags && this.filters.tags.length > 0) {
                    // Always expand all categories for tag filtering
                    nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                        section.classList.remove('collapsed');
                    });
                    filterEntries();
                }
            }
            });
        }

        // Clear search button
        if (clearButton) {
            clearButton.classList.remove('disabled');
            // Clone to remove existing listeners
            const newClearButton = clearButton.cloneNode(true);
            clearButton.parentNode?.replaceChild(newClearButton, clearButton);
            
            newClearButton.addEventListener('click', (event) => {
                this.filters.search = "";
                this.filters.tags = [];
                if (searchInput) {
                    searchInput.value = "";
                }
                // v13: Use native DOM methods
                nativeHtml.querySelectorAll('.codex-tag.selected').forEach(tag => {
                    tag.classList.remove('selected');
                });
                
                // Show all entries and sections
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
                
                // Restore original collapsed states
                const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                    if (collapsed) {
                        // Match by iterating to handle category values with newlines/whitespace
                        const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                        const section = Array.from(sections).find(s => {
                            const attrValue = s.getAttribute('data-category');
                            return attrValue && attrValue.trim() === category.trim();
                        });
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                }
                
                this.render(this.element);
            });
        }

        // Tag cloud tag selection
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-tag-cloud .codex-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagValue = event.currentTarget.dataset.tag;
                const tagIndex = this.filters.tags.indexOf(tagValue);
                if (tagIndex === -1) {
                    this.filters.tags.push(tagValue);
                } else {
                    this.filters.tags.splice(tagIndex, 1);
                }
                
                // Show all entries and sections before filtering
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
                
                // If we have tags selected, expand all categories
                if (this.filters.tags.length > 0) {
                    nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                        section.classList.remove('collapsed');
                    });
                    // Temporarily clear the collapsed state in user flags while filtering
                    game.user.setFlag(MODULE.ID, 'codexCollapsedCategories', {});
                } else {
                    // If no tags selected, restore original collapsed states
                    const collapsedCategories = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
                    for (const [category, collapsed] of Object.entries(collapsedCategories)) {
                        if (collapsed) {
                            // Match by iterating to handle category values with newlines/whitespace
                            const sections = nativeHtml.querySelectorAll('.codex-section[data-category]');
                            const section = Array.from(sections).find(s => {
                                const attrValue = s.getAttribute('data-category');
                                return attrValue && attrValue.trim() === category.trim();
                            });
                            if (section) {
                                section.classList.add('collapsed');
                            }
                        }
                    }
                }
                
                this.render(this.element);
            });
        });

        // Toggle tag cloud
        // v13: Use nativeHtml instead of html
        const toggleTagsButton = nativeHtml.querySelector('.toggle-tags-button');
        if (toggleTagsButton) {
            const newButton = toggleTagsButton.cloneNode(true);
            toggleTagsButton.parentNode?.replaceChild(newButton, toggleTagsButton);
            newButton.addEventListener('click', () => {
                const tagCloud = nativeHtml.querySelector('.codex-tag-cloud');
                if (tagCloud) {
                    const isCollapsed = tagCloud.classList.contains('collapsed');
                    game.user.setFlag(MODULE.ID, 'codexTagCloudCollapsed', !isCollapsed);
                    this.render(this.element);
                }
            });
        }

        // Codex titlebar "..." context menu (Blacksmith) - all actions except Add
        const codexTitlebarMenuBtn = nativeHtml.querySelector('.codex-titlebar-menu');
        if (codexTitlebarMenuBtn && getBlacksmith()?.uiContextMenu?.show) {
            const newMenuBtn = codexTitlebarMenuBtn.cloneNode(true);
            codexTitlebarMenuBtn.parentNode?.replaceChild(newMenuBtn, codexTitlebarMenuBtn);
            newMenuBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const coreItems = [
                    {
                        name: 'Refresh Codex',
                        icon: 'fa-solid fa-sync-alt',
                        callback: async () => {
                            await this._refreshData();
                            this.render(this.element);
                            ui.notifications.info('Codex refreshed.');
                        }
                    }
                ];
                if (this.selectedJournal) {
                    coreItems.unshift({
                        name: 'Open Codex Journal',
                        icon: 'fa-solid fa-feather',
                        callback: () => this.selectedJournal.sheet.render(true)
                    });
                }
                const gmItems = game.user.isGM ? [
                    {
                        name: 'Select Journal for Codex',
                        icon: 'fa-solid fa-cog',
                        callback: () => {
                            showJournalPicker({
                                title: 'Select Codex Journal',
                                mode: 'select',
                                choices: (() => {
                                    const choices = { 'none': '- Select Journal -' };
                                    game.journal.contents.forEach(j => {
                                        choices[j.id] = j.name;
                                    });
                                    return choices;
                                })(),
                                selectedId: game.settings.get(MODULE.ID, 'codexJournal'),
                                onSelect: async (journalId) => {
                                    await game.settings.set(MODULE.ID, 'codexJournal', journalId);
                                },
                                reRender: async () => {
                                    await this._refreshData();
                                    this.render(this.element);
                                }
                            });
                        }
                    },
                    {
                        name: 'Auto-Discover from Party Inventories',
                        icon: 'fa-solid fa-search-plus',
                        callback: () => this._autoDiscoverFromInventories()
                    },
                    {
                        name: 'Auto-Link Unresolved Links',
                        icon: 'fa-solid fa-link',
                        callback: () => this._autoLinkUnresolved()
                    },
                    {
                        name: 'Import Codex from JSON',
                        icon: 'fa-solid fa-file-import',
                        callback: () => this._openImportCodexDialog()
                    },
                    {
                        name: 'Export Codex as JSON',
                        icon: 'fa-solid fa-file-export',
                        callback: () => this._openExportCodexDialog()
                    }
                ] : [];
                getBlacksmith().uiContextMenu.show({
                    id: `${MODULE.ID}-codex-titlebar-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones: { core: coreItems, gm: gmItems }
                });
            });
        }

        // Add new codex entry button (only action outside menu)
        // v13: Use nativeHtml instead of html
        const addCodexButton = nativeHtml.querySelector('.add-codex-button');
        if (addCodexButton) {
            const newButton = addCodexButton.cloneNode(true);
            addCodexButton.parentNode?.replaceChild(newButton, addCodexButton);
            newButton.addEventListener('click', async () => {
                if (!game.user.isGM) return;

                const journalId = game.settings.get(MODULE.ID, 'codexJournal');
                if (!journalId || journalId === 'none') {
                    ui.notifications.warn("No codex journal selected. Use the … menu to select one.");
                    return;
                }

                const journal = game.journal.get(journalId);
                if (!journal) {
                    ui.notifications.error("Could not find the codex journal.");
                    return;
                }

                await openCodexWindow();
            });
        }

        // "Read more" opens the entry's journal page (full Expanded Details)
        nativeHtml.querySelectorAll('.codex-read-more').forEach(link => {
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                if (!uuid) return;
                const page = await fromUuid(uuid);
                // Open the parent journal focused on the page — page.sheet.render(true)
                // would open the page's standalone EDIT sheet, not the reading view
                if (page?.parent) {
                    page.parent.sheet.render(true, { pageId: page.id });
                }
            });
        });

        // Related-entry and location references jump to that entry IN THE TRAY —
        // the same destination as double-clicking its codex pin. These name codex
        // entries, not documents; opening the journal behind one would be a
        // different (and more disruptive) thing than the user asked for.
        // Document `links` are unaffected: those are real documents and keep
        // Foundry's own content-link behavior.
        nativeHtml.querySelectorAll('.codex-ref[data-uuid]').forEach(ref => {
            ref.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                if (!uuid) return;
                if (this._focusEntry(uuid)) return;
                // Rendered out by an active tag filter — say so rather than
                // silently doing nothing.
                ui.notifications.info(
                    `"${event.currentTarget.textContent}" is filtered out of the current view.`
                );
            });
        });

        // Feather icon opens the current journal page (Player / non-GM)
        nativeHtml.querySelectorAll('.codex-entry-feather-user').forEach(feather => {
            const newFeather = feather.cloneNode(true);
            feather.parentNode?.replaceChild(newFeather, feather);
            newFeather.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const page = await fromUuid(uuid);
                    if (page && page.parent) {
                        page.parent.sheet.render(true, { pageId: page.id });
                    }
                }
            });
        });

        // Link clicks (old-style data-uuid links; enriched @UUID links are handled by Foundry)
        nativeHtml.querySelectorAll('.codex-entry-link').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    event.preventDefault();
                    event.stopPropagation();
                    const page = await fromUuid(uuid);
                    if (page && page.parent) {
                        page.parent.sheet.render(true, { pageId: page.id });
                    }
                }
            });
        });

        nativeHtml.querySelectorAll('.codex-entry-image img').forEach(image => {
            const newImage = image.cloneNode(true);
            image.parentNode?.replaceChild(newImage, image);
            newImage.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const imgEl = event.currentTarget;
                const src = imgEl.getAttribute('src');
                if (!src) return;

                const entryEl = imgEl.closest('.codex-entry');
                const uuid = entryEl?.dataset?.uuid || null;
                let title = imgEl.getAttribute('alt') || 'Codex Image';

                if (uuid) {
                    try {
                        const page = await fromUuid(uuid);
                        if (page?.name) title = page.name;
                    } catch (_) {}
                }

                // v13 AppV2 signature: src and title live in options
                const imagePopout = new foundry.applications.apps.ImagePopout({
                    src,
                    uuid,
                    shareable: true,
                    window: { title }
                });
                imagePopout.render(true);
            });
        });

        // Per-entry "..." context menu (GM only)
        nativeHtml.querySelectorAll('.codex-entry-menu').forEach(menuBtn => {
            const newBtn = menuBtn.cloneNode(true);
            menuBtn.parentNode?.replaceChild(newBtn, menuBtn);
            newBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;

                const uuid      = newBtn.dataset.uuid;
                const entryEl   = newBtn.closest('.codex-entry');
                const isVisible = entryEl?.dataset?.ownershipDefault >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                    || parseInt(entryEl?.dataset?.ownershipDefault ?? '0') >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                const hasPinId  = !!(entryEl?.dataset?.pinId);

                const ctxMenu = getBlacksmith()?.uiContextMenu;
                if (!ctxMenu?.show) return;

                ctxMenu.show({
                    id: `${MODULE.ID}-codex-entry-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones: {
                        gm: [
                            {
                                name: 'Open Journal Page',
                                icon: 'fa-solid fa-feather',
                                callback: async () => {
                                    const doc = await fromUuid(uuid);
                                    // Journal reading view, not the page's standalone edit sheet
                                    if (doc?.parent) doc.parent.sheet.render(true, { pageId: doc.id });
                                    else if (doc) doc.sheet.render(true);
                                }
                            },
                            {
                                name: 'Edit Entry',
                                icon: 'fa-solid fa-pen',
                                callback: async () => {
                                    const page = await fromUuid(uuid);
                                    if (!page) return;
                                    await openCodexWindow({ page });
                                }
                            },
                            ...(hasPinId ? [{
                                name: 'Configure Pin',
                                icon: 'fa-solid fa-palette',
                                callback: async () => {
                                    const pins = getPinsApi();
                                    const pinId = entryEl?.dataset?.pinId;
                                    if (pins?.configure && pinId) {
                                        await pins.configure(pinId);
                                    }
                                }
                            },
                            {
                                name: 'Clear Pin',
                                icon: 'fa-solid fa-eraser',
                                callback: async () => {
                                    await deleteCodexPin(uuid);
                                    await this._refreshData();
                                    this.render(this.element);
                                }
                            }] : []),
                            {
                                name: 'Delete Entry',
                                icon: 'fa-solid fa-trash',
                                callback: async () => {
                                    const confirmed = await Dialog.confirm({
                                        title: 'Delete Entry',
                                        content: '<p>Delete this codex entry? This cannot be undone.</p>'
                                    });
                                    if (!confirmed) return;
                                    if (hasPinId) await deleteCodexPin(uuid);
                                    const page = await fromUuid(uuid);
                                    if (page) await page.delete();
                                }
                            }
                        ]
                    }
                });
            });
        });

        // Per-entry visibility toggle (GM only): direct eye/eye-slash icon in toolbar
        nativeHtml.querySelectorAll('.codex-entry-visibility').forEach(visBtn => {
            const newBtn = visBtn.cloneNode(true);
            visBtn.parentNode?.replaceChild(newBtn, visBtn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;
                const uuid = newBtn.dataset.uuid;
                if (!uuid) return;
                const page = await fromUuid(uuid);
                if (!page) return;
                const current      = page.ownership?.default ?? 0;
                const newPermission = current >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
                    : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                const isVisible = newPermission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                // Skip the full panel re-render this ownership change would otherwise trigger
                // (via the updateJournalEntryPage hook). A re-render collapses entries and resets
                // scroll, forcing the GM to re-find their place. Instead we patch the icon in place.
                await page.update({ 'ownership.default': newPermission }, { squireSkipCodexRender: true });
                await updateCodexPinVisibility(uuid);
                // Patch the visibility icon + sibling menu state in place.
                newBtn.classList.toggle('visible', isVisible);
                newBtn.setAttribute('title', isVisible ? 'Hide from Players' : 'Show to Players');
                const menuIcon = newBtn.parentNode?.querySelector(`.codex-entry-menu[data-uuid="${uuid}"]`);
                if (menuIcon) menuIcon.dataset.visible = String(isVisible);
            });
        });

        // Per-entry pin button (GM only): place on scene or unplace
        nativeHtml.querySelectorAll('.codex-entry-pin').forEach(pinBtn => {
            const newBtn = pinBtn.cloneNode(true);
            pinBtn.parentNode?.replaceChild(newBtn, pinBtn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user.isGM) return;

                const uuid         = newBtn.dataset.uuid;
                const name         = newBtn.dataset.name;
                const category     = newBtn.dataset.category;
                const hasPinOnScene = newBtn.dataset.hasPinOnScene === 'true';

                if (hasPinOnScene) {
                    // Unplace from scene (keep pin data); sync hooks re-render the panel
                    await unplaceCodexPin(uuid);
                    await this._refreshData();
                    this.render(this.element);
                } else {
                    // Enter canvas placement mode; sync hooks re-render when pin lands
                    await beginCodexPinPlacement(uuid, name, category);
                }
            });
        });

        // Entry collapse/expand
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-entry-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                this._toggleEntryCollapsed(e.currentTarget.closest('.codex-entry'));
                e.stopPropagation();
            });
        });

        nativeHtml.querySelectorAll('.codex-entry-name').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', (e) => {
                this._toggleEntryCollapsed(e.currentTarget.closest('.codex-entry'));
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Category collapse/expand
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.codex-category .fa-chevron-down').forEach(chevron => {
            chevron.addEventListener('click', (e) => {
                const section = e.currentTarget.closest('.codex-section');
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                this._setCategoryCollapsed(section.dataset.category, collapsed);
                e.stopPropagation();
            });
        });

        nativeHtml.querySelectorAll('.codex-category h3').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', (e) => {
                const section = e.currentTarget.closest('.codex-section');
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                this._setCategoryCollapsed(section.dataset.category, collapsed);
                e.preventDefault();
                e.stopPropagation();
            });
        });


        // On load, ensure all entries are visible if no filters are set
        trackModuleTimeout(() => {
            if (!this.filters.search && (!this.filters.tags || this.filters.tags.length === 0)) {
                // v13: Use native DOM methods
                nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.codex-section').forEach(section => {
                    section.style.display = '';
                });
            } else {
                filterEntries();
            }
        }, 0);
    }


    /**
     * Auto-discover codex entries from party inventories
     * @private
     */
    /**
     * Retry every unresolved codex link against Blacksmith's compendium mapping.
     *
     * Only `links` need this. `related` names and location levels resolve against
     * the journal's own pages at render, so they heal on their own — this is for
     * document links, which are a cross-module lookup too expensive to redo per
     * render and which cannot self-heal.
     *
     * Manual by design: it is a bulk write to journal pages, so the GM triggers it.
     */
    async _autoLinkUnresolved() {
        if (!game.user.isGM) return;
        if (!this.selectedJournal) {
            ui.notifications.warn('No codex journal selected.');
            return;
        }

        const pages = (this.selectedJournal.pages?.contents ?? [])
            .filter(p => p.type === CODEX_PAGE_TYPE);
        const pending = pages.filter(p =>
            (p.system?.links ?? []).some(l => !String(l?.uuid ?? '').trim() && String(l?.name ?? '').trim())
        );

        if (!pending.length) {
            ui.notifications.info('Auto-Link: every codex link is already resolved.');
            return;
        }

        this.isImporting = true;
        const nativeElement = getNativeElement(this.element);
        const button = nativeElement?.querySelector('.codex-titlebar-menu');
        if (button) {
            button.classList.add('working');
            button.setAttribute('title', 'Auto-linking codex entries...');
        }

        const progressArea = nativeElement?.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement?.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement?.querySelector('.tray-progress-bar-text');
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = `Auto-linking ${pending.length} entries...`;
            await moduleDelay(300);
        }

        const reports = [];
        let linked = 0;
        let touched = 0;

        try {
            for (let i = 0; i < pending.length; i++) {
                const page = pending[i];
                const percent = (i / pending.length) * 100;
                if (progressFill) progressFill.style.width = `${percent}%`;
                if (progressText) progressText.textContent = `Auto-linking: ${page.name}`;

                const existing = (page.system?.links ?? []).map(normalizeCodexLink);
                // Only the unresolved ones go back to the resolver; anything already
                // linked is left exactly as it is.
                const unresolved = existing.filter(l => !l.uuid && l.name);
                const { links: retried, reports: entryReports } = await resolveCodexLinks({
                    // No name/category: a self-link was already tried at import and a
                    // speculative retry would just re-report the same non-miss.
                    links: unresolved.map(l => ({ name: l.name, type: l.type, label: l.label }))
                });
                reports.push(...entryReports);

                const byKey = new Map(retried.map(l => [codexLinkKey(l), l]));
                let changed = false;
                const merged = existing.map(l => {
                    if (l.uuid) return l;
                    const hit = byKey.get(codexLinkKey(l));
                    if (!hit?.uuid) return l;
                    changed = true;
                    linked++;
                    return hit;
                });

                if (changed) {
                    await page.update({ 'system.links': merged });
                    touched++;
                }
                if (i % 5 === 0) await moduleDelay(50);
            }

            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = 'Auto-Link complete!';

            ui.notifications.info(
                linked
                    ? `Auto-Link: resolved ${linked} ${linked === 1 ? 'link' : 'links'} across ${touched} ${touched === 1 ? 'entry' : 'entries'}.`
                    : 'Auto-Link: nothing new resolved — those documents still do not exist.'
            );
            reportResolution(reports, 'Auto-Link');
        } catch (error) {
            console.error('Coffee Pub Squire | Auto-Link failed:', error);
            ui.notifications.error('Auto-Link failed. See console for details.');
        } finally {
            if (button) {
                button.classList.remove('working');
                button.setAttribute('title', 'Codex options');
            }
            this.isImporting = false;
            trackModuleTimeout(() => this._hideProgressBar(), 2000);
            await this._refreshData();
            this.render(this.element);
        }
    }

    async _autoDiscoverFromInventories() {
        if (!this.selectedJournal) {
            ui.notifications.warn("No codex journal selected. Please select a journal first.");
            return;
        }

        // Set import flag to prevent panel refreshes during auto-discovery
        this.isImporting = true;

        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;

        // Get the titlebar menu button for working state during scan
        const button = nativeElement.querySelector('.codex-titlebar-menu');
        if (button) {
            button.classList.add('working');
            button.setAttribute('title', 'Scanning party inventories...');
        }

        // Show progress area
        const progressArea = nativeElement.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting scan...';
            
            // Small delay to make progress visible
            await moduleDelay(500);
        }

        try {
            // Show initial notification
            ui.notifications.info("Starting auto-discovery scan...");

            // Get all tokens on the canvas
            const tokens = canvas.tokens.placeables.filter(token => 
                token.actor && 
                token.actor.type === 'character' && 
                token.actor.hasPlayerOwner
            );

            if (tokens.length === 0) {
                ui.notifications.warn("No player character tokens found on the canvas.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.textContent = 'No players found';
                    progressFill.style.width = '100%';
                    // Hide progress area after a delay
                    trackModuleTimeout(() => {
                        progressArea.style.display = 'none';
                    }, 2000);
                }
                return;
            }

            // Collect all inventory items from party members
            const inventoryItems = new Set();
            const characterNames = [];
            const totalPlayers = tokens.length;
            let processedPlayers = 0;
            
            // Update progress for character scanning phase
            if (progressText) {
                progressText.textContent = 'Scanning party inventories...';
            }
            if (progressFill) {
                progressFill.style.width = '0%';
            }
            
            for (const token of tokens) {
                const actor = token.actor;
                characterNames.push(actor.name);
                processedPlayers++;
                
                // Update progress for this character - REAL PROGRESS
                const playerProgressPercent = (processedPlayers / totalPlayers) * 20; // 0-20% range for player scanning
                if (progressFill) {
                    progressFill.style.width = `${playerProgressPercent}%`;
                }
                if (progressText) {
                    progressText.textContent = `Scanning ${actor.name}...`;
                }
                
                // Add a small delay to make player scanning visible
                await moduleDelay(200);
                
                // Use the same approach as the inventory panel
                if (actor.items && actor.items.contents) {
                    // Filter items by type (same as inventory panel)
                    const items = actor.items.contents.filter(item => 
                        ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                    );
                    
                    for (const item of items) {
                        // Normalize spaces: collapse multiple spaces into single spaces, then lowercase and trim
                        const itemNameLower = normalizeName(item.name);
                        inventoryItems.add(itemNameLower);
                        
                        // If it's a backpack/container, check its contents
                        if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                            for (const containedItem of item.contents) {
                                // Apply same space normalization to contained items
                                const containedItemNameLower = normalizeName(containedItem.name);
                                inventoryItems.add(containedItemNameLower);
                            }
                        }
                    }
                }
            }

            if (inventoryItems.size === 0) {
                ui.notifications.warn("No inventory items found in party members' inventories.");
                // Clean up progress bar before returning
                if (progressArea && progressFill && progressText) {
                    progressText.textContent = 'No items found';
                    progressFill.style.width = '100%';
                    // Hide progress area after a delay
                    trackModuleTimeout(() => {
                        progressArea.style.display = 'none';
                    }, 2000);
                }
                return;
            }

            // Find matching codex entries
            const discoveredEntries = [];
            const updatedPages = [];
            const totalEntries = Object.values(this.data).flat().length;
            let processedEntries = 0;
            let lastDiscoveryTime = 0; // Track when last discovery was shown

            // Update progress for codex scanning phase
            if (progressText) {
                progressText.textContent = `Scanning ${totalEntries} codex entries...`;
            }
            if (progressFill) {
                progressFill.style.width = '20%';
            }

            for (const [category, entries] of Object.entries(this.data)) {
                for (const entry of entries) {
                    processedEntries++;
                    
                    // Update progress bar with current entry info - REAL PROGRESS, no throttling
                    const progressPercent = 20 + ((processedEntries / totalEntries) * 80); // 20-100% range for codex scanning
                    if (progressFill) {
                        progressFill.style.width = `${progressPercent}%`;
                    }
                    
                    // Only update progress text if we haven't shown a discovery recently
                    const now = Date.now();
                    if (progressText && (now - lastDiscoveryTime) > 1000) {
                        progressText.textContent = `Scanning: ${entry.name}`;
                    }
                    
                    // Add a small delay every 5 entries to make progress visible
                    if (processedEntries % 5 === 0) {
                        await moduleDelay(100);
                    }
                    
                    // Check if entry name matches any inventory item
                    const entryNameLower = normalizeName(entry.name);
                    
                    if (inventoryItems.has(entryNameLower)) {
                        // Check if this entry is already visible
                        const page = await fromUuid(entry.uuid);
                        if (page && page.ownership?.default < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                            // Find which character(s) had this item
                            const discoverers = [];
                            
                            // Log what we're looking for
                            
                            for (const token of tokens) {
                                const actor = token.actor;
                                const items = actor.items.contents.filter(item => 
                                    ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
                                );
                                
                                let foundInThisActor = false;
                                
                                for (const item of items) {
                                    // Normalize the item name the same way we did when building inventoryItems
                                    const itemNameLower = normalizeName(item.name);
                                    
                                    if (itemNameLower === entryNameLower) {
                                        if (!foundInThisActor) {
                                            discoverers.push(actor.name);
                                            foundInThisActor = true;
                                        }
                                        // Don't break - continue checking other items in case there are duplicates
                                    }
                                    
                                    // Check backpack contents
                                    if (item.type === 'backpack' && item.contents && Array.isArray(item.contents)) {
                                        for (const containedItem of item.contents) {
                                            const containedItemNameLower = normalizeName(containedItem.name);
                                            if (containedItemNameLower === entryNameLower) {
                                                if (!foundInThisActor) {
                                                    discoverers.push(actor.name);
                                                    foundInThisActor = true;
                                                }
                                                // Don't break - continue checking other contained items
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Log what we found
                            
                            // Make it visible
                            await page.update({ 'ownership.default': CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
                            discoveredEntries.push(entry.name);
                            updatedPages.push(page);
                            
                            // Add "Discovered By" information to the journal entry
                            if (discoverers.length > 0) {
                                await this._addDiscoveredByInfo(page, discoverers);
                            }
                            
                            // Show discovery immediately with progress update
                            if (progressText) {
                                progressText.textContent = `✓ Found: ${entry.name}`;
                                lastDiscoveryTime = Date.now(); // Mark when discovery was shown
                                // Keep discovery visible for a moment - increased delay
                                await moduleDelay(1200);
                            }
                        }
                    }
                }
            }

            // Show final summary regardless of results
            if (discoveredEntries.length === 0) {
                if (progressText) {
                    progressText.textContent = `No new entries found`;
                }
            } else {
                if (progressText) {
                    progressText.textContent = `Found ${discoveredEntries.length} new entries`;
                }
            }
            
            // Keep final summary visible for a moment
            await moduleDelay(1500);
            
            // Log detailed results with discoverer information
            
            // Show completion message and hide progress area after delay
            if (progressArea && progressFill && progressText) {
                // Show prominent completion message
                progressText.textContent = 'Scan Complete!';
                progressFill.style.width = '100%';
                
                // Add a visual completion indicator
                progressArea.classList.add('scan-complete');
                
                // Keep completion message visible for 5 seconds
                await moduleDelay(5000);
                
                // Remove completion styling and hide progress area
                progressArea.classList.remove('scan-complete');
                progressArea.style.display = 'none';
            }
            
            // Clear import flag and refresh panel once at the end
            this.isImporting = false;
            await this._refreshData();
            this.render(this.element);
            
        } catch (error) {
            // Clear import flag on error
            this.isImporting = false;
            
            console.error('Error during auto-discovery:', error);
            ui.notifications.error(`Auto-discovery failed: ${error.message}`);
            
            // Show error in progress area
            if (progressArea && progressFill && progressText) {
                progressText.textContent = `Error: ${error.message}`;
                progressFill.style.width = '100%';
                
                // Hide progress area after a delay
                trackModuleTimeout(() => {
                    progressArea.style.display = 'none';
                }, 3000);
            }
        } finally {
            // Reset button state (titlebar menu icon)
            const menuBtn = nativeElement.querySelector('.codex-titlebar-menu');
            if (menuBtn) {
                menuBtn.classList.remove('working');
                menuBtn.setAttribute('title', 'Codex options');
            }
        }
    }

    /**
     * Open the Import Codex from JSON dialog (used from titlebar menu).
     * @private
     */
    async _openImportCodexDialog() {
        let template = '';
        try {
            const response = await fetch('modules/coffee-pub-squire/prompts/prompt-codex.txt');
            if (response.ok) template = await response.text();
            else template = 'Failed to load prompt-codex.txt.';
        } catch (e) {
            template = 'Failed to load prompt-codex.txt.';
        }
        new Dialog({
            title: 'Import Codex from JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                type: 'codex',
                isImport: true,
                isExport: false,
                jsonInputId: 'codex-import-json'
            }),
            buttons: {
                cancel: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Import' },
                import: {
                    icon: '<i class="fa-solid fa-file-import"></i>',
                    label: 'Import JSON',
                    callback: async (html) => {
                        ui.notifications.info('Importing Codex entries. This may take some time as entries are added, updated, indexed, and sorted. You will be notified when the process is complete.');
                        this.isImporting = true;
                        this._showProgressBar();
                        try {
                            let nativeDlgHtml = html;
                            if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            const value = jsonInput?.value || '';
                            const data = JSON.parse(value);
                            if (!Array.isArray(data)) {
                                ui.notifications.error('Imported JSON must be an array of entries.');
                                return;
                            }
                            if (!this.selectedJournal) {
                                ui.notifications.error('No Codex journal selected.');
                                return;
                            }
                            this._updateProgressBar(10, 'Validating import data...');
                            let added = 0, updated = 0, duplicatesMerged = 0;
                            const importNameCounts = {};
                            const duplicateNames = [];
                            data.forEach(entry => {
                                if (entry.name) {
                                    importNameCounts[entry.name] = (importNameCounts[entry.name] || 0) + 1;
                                    if (importNameCounts[entry.name] > 1 && !duplicateNames.includes(entry.name)) duplicateNames.push(entry.name);
                                }
                            });
                            if (duplicateNames.length > 0) ui.notifications.warn(`Warning: Import data contains duplicate entry names: ${duplicateNames.join(', ')}. These will be merged with existing entries.`);
                            this._updateProgressBar(20, `Processing ${data.length} entries...`);
                            // Filled as entries resolve their links; reported once below.
                            this._resolveReports = [];
                            const totalEntries = data.length;
                            for (let i = 0; i < data.length; i++) {
                                const entry = data[i];
                                const entryProgress = 20 + ((i / totalEntries) * 60);
                                this._updateProgressBar(entryProgress, `Processing: ${entry.name}`);
                                let page = null;
                                if (entry.uuid) page = this.selectedJournal.pages.find(p => p.getFlag(MODULE.ID, 'codexUuid') === entry.uuid);
                                if (!page) page = this.selectedJournal.pages.find(p => p.name === entry.name);
                                // Canonical field is `summary`; accept legacy `description` imports.
                                const summary = entry.summary ?? entry.description ?? '';
                                // Links: uuid-bearing links pass through, bare names resolve via
                                // Blacksmith (entry's own name typed by category, cross-references
                                // by their own `type`). Legacy single `link` is folded in by the helper.
                                const { links: resolvedLinks, reports } = await resolveCodexLinks(entry);
                                this._resolveReports?.push(...reports);
                                const systemData = {
                                    summary,
                                    category: entry.category || '',
                                    plotHook: entry.plotHook || '',
                                    location: entry.location || '',
                                    links: resolvedLinks,
                                    tags: Array.isArray(entry.tags) ? entry.tags : [],
                                    img: entry.img || ''
                                };
                                // Related codex entries: plain names, resolved at render against
                                // the journal's pages, so a name whose entry doesn't exist yet
                                // links itself once it does. Present in the import replaces;
                                // absent preserves (same rule as expandedDetails) — importing an
                                // older JSON must not silently wipe the relationships.
                                if (Array.isArray(entry.related)) {
                                    systemData.related = entry.related
                                        .map(r => String(r ?? '').trim())
                                        .filter(Boolean);
                                }

                                if (page && page.type !== CODEX_PAGE_TYPE) {
                                    // Legacy text page matched — re-import IS the conversion path:
                                    // replace it with a typed page (preserving ownership and sort)
                                    const ownership = foundry.utils.deepClone(page.ownership);
                                    const sort = page.sort;
                                    await page.delete();
                                    const [newPage] = await this.selectedJournal.createEmbeddedDocuments('JournalEntryPage', [{
                                        name: entry.name,
                                        type: CODEX_PAGE_TYPE,
                                        system: systemData,
                                        text: { content: entry.expandedDetails || '' },
                                        ownership,
                                        sort
                                    }]);
                                    if (entry.uuid) await newPage.setFlag(MODULE.ID, 'codexUuid', entry.uuid);
                                    updated++;
                                } else if (page) {
                                    // Links already on the page that this import doesn't produce were
                                    // put there by hand (dragging was the only way to add one before
                                    // 13.3.10) and aren't recoverable from the JSON, so keep them.
                                    // Foundry replaces arrays wholesale, so this has to be explicit.
                                    const patch = {
                                        system: {
                                            ...systemData,
                                            links: mergeCodexLinks(page.system?.links, resolvedLinks)
                                        }
                                    };
                                    // expandedDetails present in the import (even '') replaces; absent/null preserves
                                    if (entry.expandedDetails !== undefined && entry.expandedDetails !== null) {
                                        patch['text.content'] = entry.expandedDetails;
                                    }
                                    await page.update(patch);
                                    updated++;
                                    if (entry.uuid && page.getFlag(MODULE.ID, 'codexUuid') !== entry.uuid) duplicatesMerged++;
                                } else {
                                    const newPage = await this.selectedJournal.createEmbeddedDocuments('JournalEntryPage', [{
                                        name: entry.name,
                                        type: CODEX_PAGE_TYPE,
                                        system: systemData,
                                        text: { content: entry.expandedDetails || '' },
                                        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
                                    }]);
                                    if (entry.uuid) await newPage[0].setFlag(MODULE.ID, 'codexUuid', entry.uuid);
                                    added++;
                                }
                                if (i % 5 === 0) await moduleDelay(100);
                            }
                            this._updateProgressBar(80, 'Sorting entries...');
                            const sorted = this.selectedJournal.pages.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
                            for (let i = 0; i < sorted.length; i++) await sorted[i].update({ sort: (i + 1) * 10 });
                            this._updateProgressBar(90, 'Finalizing import...');
                            let message = `Codex import complete: ${added} added, ${updated} updated.`;
                            if (duplicatesMerged > 0) message += ` ${duplicatesMerged} duplicates were merged.`;
                            ui.notifications.info(message);
                            reportResolution(this._resolveReports, 'Codex import');
                            this._resolveReports = null;
                            // Unresolved links are kept, not dropped — tell the GM the
                            // retry exists rather than running a bulk write unasked.
                            const stillUnresolved = (this.selectedJournal.pages?.contents ?? [])
                                .filter(p => p.type === CODEX_PAGE_TYPE)
                                .reduce((sum, p) => sum + (p.system?.links ?? [])
                                    .filter(l => !String(l?.uuid ?? '').trim() && String(l?.name ?? '').trim()).length, 0);
                            if (stillUnresolved > 0) {
                                ui.notifications.info(
                                    `${stillUnresolved} codex ${stillUnresolved === 1 ? 'link is' : 'links are'} still unresolved and kept as plain text. `
                                    + `Run "Auto-Link Unresolved Links" from the codex menu once those documents exist.`
                                );
                            }
                            this._updateProgressBar(100, 'Import complete!');
                            await moduleDelay(2000);
                            this._hideProgressBar();
                            this.isImporting = false;
                            await this._refreshData();
                            this.render(this.element);
                        } catch (e) {
                            this._hideProgressBar();
                            this.isImporting = false;
                            ui.notifications.error('Invalid JSON.');
                        }
                    }
                }
            },
            default: 'import',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                const cancelButton = nativeDlgHtml.querySelector('[data-button="cancel"]');
                if (cancelButton) cancelButton.classList.add('squire-cancel-button');
                const importButton = nativeDlgHtml.querySelector('[data-button="import"]');
                if (importButton) importButton.classList.add('squire-submit-button');
                const copyTemplateButton = nativeDlgHtml.querySelector('.copy-template-button');
                if (copyTemplateButton) {
                    copyTemplateButton.addEventListener('click', () => {
                        let output = template;
                        const rulebooks = game.settings.get(MODULE.ID, 'defaultRulebooks');
                        if (rulebooks && rulebooks.trim()) output = output.replace('[ADD-RULEBOOKS-HERE]', rulebooks);
                        copyToClipboard(output);
                        ui.notifications.info('Template copied to clipboard!');
                    });
                }
                const browseFileButton = nativeDlgHtml.querySelector('.browse-file-button');
                if (browseFileButton) {
                    browseFileButton.addEventListener('click', () => {
                        const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                        if (fileInput) fileInput.click();
                    });
                }
                const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                if (fileInput) {
                    fileInput.addEventListener('change', async (event) => {
                        const file = event.target.files[0];
                        if (!file) return;
                        try {
                            if (!file.name.toLowerCase().endsWith('.json')) {
                                ui.notifications.error('Please select a JSON file.');
                                return;
                            }
                            const text = await file.text();
                            let importData;
                            try {
                                importData = JSON.parse(text);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON in file: ' + e.message);
                                return;
                            }
                            if (!Array.isArray(importData)) {
                                ui.notifications.error('Invalid file format: Must be an array of codex entries.');
                                return;
                            }
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            if (jsonInput) jsonInput.value = text;
                            ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                            event.target.value = '';
                        } catch (error) {
                            console.error('Error reading file:', error);
                            ui.notifications.error(`Error reading file: ${error.message}`);
                        }
                    });
                }
            }
        }, { classes: ['import-export-dialog'], id: 'import-export-dialog-codex-import' }).render(true);
    }

    /**
     * Open the Export Codex as JSON dialog (used from titlebar menu).
     * @private
     */
    async _openExportCodexDialog() {
        const exportData = [];
        for (const cat of this.categories) {
            for (const entry of (this.data[cat] || [])) {
                // Export only the EXPLICIT image (system.img) — an image derived from
                // the first Expanded Details illustration already travels inside
                // expandedDetails and would be duplicated if exported here too
                let img = null;

                // Expanded Details is the page's raw text content — exported raw so
                // @UUID links and embeds survive a round trip through export → import
                let expandedDetails = null;
                try {
                    const page = await fromUuid(entry.uuid);
                    const raw = typeof page?.text?.content === 'string' ? page.text.content : '';
                    if (raw.trim()) expandedDetails = raw;
                    img = (typeof page?.system?.img === 'string' && page.system.img) ? page.system.img : null;
                } catch (_) { /* page unavailable — export without expanded details */ }
                if (img) {
                    const origin = window.location.origin + '/';
                    if (img.startsWith(origin)) img = img.slice(origin.length);
                }

                // Emit the authoring shape, not the render shape: `key`/`resolved`
                // are computed by linkList and must not round-trip. An unresolved
                // link exports as { name, type } — exactly what the AI prompt asks
                // for — so export → import → Auto-Link is lossless.
                const links = (entry.links || []).map(l => {
                    const out = {};
                    if (l.name) out.name = l.name;
                    if (l.type) out.type = l.type;
                    if (l.uuid) out.uuid = l.uuid;
                    if (l.label && l.label !== l.name) out.label = l.label;
                    return out;
                }).filter(l => Object.keys(l).length > 0);

                exportData.push({
                    name: entry.name,
                    img,
                    category: entry.category || null,
                    summary: entry.summary || '',
                    plotHook: entry.plotHook || null,
                    location: entry.location || null,
                    links,
                    related: entry.related || [],
                    tags: entry.tags || [],
                    uuid: entry.uuid,
                    expandedDetails
                });
            }
        }
        const jsonString = JSON.stringify(exportData, null, 2);
        new Dialog({
            title: 'Export Codex as JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate('modules/coffee-pub-squire/templates/window-import-export.hbs', {
                type: 'codex',
                isImport: false,
                isExport: true,
                jsonOutputId: 'codex-export-json',
                exportData: jsonString,
                exportSummary: { totalItems: exportData.length, exportVersion: "1.0", timestamp: new Date().toLocaleString() }
            }),
            buttons: {
                close: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Export' },
                download: {
                    icon: '<i class="fa-solid fa-download"></i>',
                    label: 'Download JSON',
                    callback: () => {
                        try {
                            const sanitizeWindowsFilename = (name) => name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+$/g, "").replace(/\.+$/g, "").slice(0, 150);
                            const stamp = new Date().toISOString().replace(/[:]/g, "-");
                            const filename = sanitizeWindowsFilename(`COFFEEPUB-SQUIRE-codex-export-${stamp}.json`);
                            if (typeof saveDataToFile === 'function') {
                                saveDataToFile(jsonString, "application/json;charset=utf-8", filename);
                                ui.notifications.info(`Codex export saved as ${filename}`);
                            } else {
                                const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = filename;
                                a.style.display = 'none';
                                a.rel = "noopener";
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                trackModuleTimeout(() => URL.revokeObjectURL(url), 0);
                                ui.notifications.info(`Codex export downloaded as ${filename}`);
                            }
                        } catch (error) {
                            copyToClipboard(jsonString);
                            ui.notifications.warn('Download failed. Export data copied to clipboard instead.');
                            console.error('Export download failed:', error);
                        }
                    }
                }
            },
            default: 'download'
        }, {
            classes: ['import-export-dialog'],
            id: 'import-export-dialog-codex-export',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                const closeButton = nativeDlgHtml.querySelector('[data-button="close"]');
                if (closeButton) closeButton.classList.add('squire-cancel-button');
                const downloadButton = nativeDlgHtml.querySelector('[data-button="download"]');
                if (downloadButton) downloadButton.classList.add('squire-submit-button');
            }
        }).render(true);
    }

    /**
     * Add "Discovered By" information to a journal entry.
     * @private
     * @param {JournalEntryPage} page - The journal entry page to update.
     * @param {string[]} discoverers - An array of character names who discovered the entry.
     */
    async _addDiscoveredByInfo(page, discoverers) {
        try {
            // Typed pages: merge into system.discoveredBy — no HTML manipulation
            const existing = Array.from(page.system?.discoveredBy || []);
            const allDiscoverers = [...new Set([...existing, ...discoverers])];
            await page.update({ 'system.discoveredBy': allDiscoverers });
        } catch (error) {
            console.error('Error updating "Discovered By" information:', error);
        }
    }

    /**
     * Render the codex panel
     * @param {HTMLElement|jQuery} element - The element to render into (may be jQuery, will be converted)
     */
    async render(element) {
        if (!element) return;
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);

        // codexContainer is guaranteed native DOM (from querySelector on already-converted element)
        const codexContainer = this.element?.querySelector('[data-panel="panel-codex"]');
        if (!codexContainer) return;

        // Refresh data if needed
        await this._refreshData();

        // Get collapsed states
        this._pruneCategoryFlags();
        const collapsedCategories = this.filters.tags.length > 0 ? {} : (game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {});
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Build categoriesData array for the template
        // Sort categories with "No Category" always first, then alphabetically for the rest
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            if (a === "No Category") return -1;
            if (b === "No Category") return 1;
            return a.localeCompare(b);
        });
        
        // One index per render, shared by every entry's related names and location
        // levels. Rebuilt each time so a newly created entry links itself everywhere.
        const pageIndex = buildCodexPageIndex(this.selectedJournal);

        const categoriesData = await Promise.all(sortedCategories.map(async category => {
            let entries = this.data[category] || [];
            if (!game.user.isGM) {
                // Only show visible entries for non-GMs
                entries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            }
            if (this.filters.tags && this.filters.tags.length > 0) {
                entries = entries.filter(entry => entry.tags.some(tag => this.filters.tags.includes(tag)));
            }
            // Sort entries alphabetically by name
            entries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
            const customCategoryIcon = entries.find(entry => String(entry.categoryIcon || '').trim())?.categoryIcon || '';
            // Enrich links for Foundry UUID handling
            for (const entry of entries) {
                const links = entry.links || (entry.link ? [entry.link] : []);
                entry.linksHtml = [];
                for (const link of links) {
                    // Unresolved link: render the plain name rather than skipping it.
                    // The relationship was asserted by the author; Auto-Link retries it.
                    if (!link?.uuid) {
                        const label = link?.label || link?.name;
                        if (label) entry.linksHtml.push(`<span class="codex-link-unresolved">${escapeHtml(label)}</span>`);
                        continue;
                    }
                    try {
                        const TextEditor = getTextEditor();
                        entry.linksHtml.push(await TextEditor.enrichHTML(
                            `@UUID[${link.uuid}]{${link.label || link.uuid}}`,
                            { documents: true, links: true }
                        ));
                    } catch (_) {}
                }

                // Related entries and location levels both point at other codex
                // entries, so they resolve through the same page index — cheaply,
                // every render, which is what makes them self-healing.
                // Survives re-render AND reload: without this, pinning or revealing
                // an entry collapses every open card.
                entry.isExpanded = this._getExpandedEntries().has(entry.uuid);

                entry.relatedHtml = (entry.related || [])
                    .map(name => this._renderCodexRef(name, pageIndex))
                    .filter(Boolean);
                entry.locationParts = (entry.locationParts || []).map(part => ({
                    ...part,
                    valueHtml: this._renderCodexRef(part.value, pageIndex) || escapeHtml(part.value)
                }));
            }
            const totalCount = entries.length;
            const visibleEntries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const visibleCount = visibleEntries.length;
            
            // For "No Category", only include if it has visible entries
            if (category === "No Category" && visibleCount === 0) {
                return null;
            }
            
            return {
                name: category,
                icon: this.getCategoryIcon(category, customCategoryIcon),
                entries,
                collapsed: collapsedCategories[category] || false,
                totalCount,
                visibleCount,
                visibleEntries
            };
        }));
        
        // Filter out null entries (empty "No Category" sections)
        const filteredCategoriesData = categoriesData.filter(cat => cat !== null);

        // Build allTags for tag cloud
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all entries
            const allEntries = filteredCategoriesData.flatMap(cat => cat.entries);
            allTags = new Set();
            allEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        } else {
            // Players see tags only from visible entries
            const allVisibleEntries = filteredCategoriesData.flatMap(cat => cat.visibleEntries);
            allTags = new Set();
            allVisibleEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categoriesData: filteredCategoriesData,
            filters: {
                ...this.filters,
                search: this.filters.search || ""
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed
        };

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX, safeTemplateData);
        // Preserve the scroll position across the re-render. Replacing innerHTML destroys
        // the .codex-content scroll container and recreates it at scrollTop 0, so actions
        // like placing/unplacing a pin or toggling visibility would otherwise jump the GM
        // back to the top and force them to scroll back down to find their place.
        // (Same fix the quest and notes panels already carry.)
        const prevScrollTop = codexContainer.querySelector('.codex-content')?.scrollTop ?? 0;

        // v13: Use native DOM innerHTML instead of jQuery html()
        codexContainer.innerHTML = html;

        // Activate listeners
        this._activateListeners(codexContainer);

        // Restored last, after listeners: _activateListeners schedules a pass that
        // sets entry/section display, which changes layout and would otherwise
        // land the restore on a stale height.
        const scrollContent = codexContainer.querySelector('.codex-content');
        if (scrollContent) scrollContent.scrollTop = prevScrollTop;

        // NOTE: collapsed state is applied by the template (`cat.collapsed`, an
        // exact key lookup). There used to be a second pass here that re-applied
        // it by iterating every flag key and matching with `.trim()`. It was both
        // redundant and actively wrong: older versions derived keys from rendered
        // element text, so the flag holds junk like `" Locations\n "` and
        // `" Artifacts\n \n Browse\n \n \n "`. Trim-matching made a junk key
        // saying "collapsed" override the real key saying "expanded", on every
        // single render — which is why pinning an entry appeared to collapse its
        // category. Exact keys only; junk keys are inert and pruned below.
    }
}

