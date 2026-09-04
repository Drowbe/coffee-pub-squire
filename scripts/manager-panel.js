import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE, getHandleWidth } from './const.js';
import { getTransferBlocker, renderTemplate, getCampaignContext, resolveDroppedItem, showSquireToast, getActorDisplayName, isGMOrPartyLeader, setRowFilter, isRowVisible} from './helpers.js';
import {
    transferRequestSender, transferRequestGMApproval, transferRequestReceiver,
    transferComplete, itemReceived
} from './manager-cards.js';
import { CharacterPanel } from './panel-character.js';
import { GmPanel } from './panel-gm.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { BuildsPanel } from './panel-builds.js';
import { syncFavorites } from './manager-favorites-sync.js';
import { ControlPanel } from './panel-control.js';
import { CompendiumSearchPanel } from './panel-compendium-search.js';
import { FeaturesPanel } from './panel-features.js';
import { CharacterSummaryPanel } from './panel-character-summary.js';
import { PartyPanel } from './panel-party.js';
import { PartyStatsPanel } from './panel-party-stats.js';
import { PrintCharacterSheet } from './utility-print-character.js';
import { StatblockUtility } from './utility-statblock.js';
import { HandleManager } from './manager-handle.js';
import { trackModuleInterval, trackModuleTimeout, registerTimeoutId, registerIntervalId, clearTrackedInterval, clearTrackedTimeout } from './timer-utils.js';

// Add multi-select tracking variables at the top of the file
export let _multiSelectTimeout = null;
export let _lastSelectionTime = 0;
export let _selectionCount = 0;

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

/**
 * Whether to offer the Deploy / Clear Party buttons.
 *
 * GM-only, and only when Blacksmith actually exposes them (13.16.1+). Blacksmith
 * keeps the GM guard inside the functions themselves and returns an empty result
 * for anyone else, so this is about not rendering a control we cannot honour --
 * not a second guard that could disagree with theirs.
 */
function canDeployParty() {
    if (!game.user.isGM) return false;
    const blacksmith = getBlacksmith();
    return typeof blacksmith?.deployParty === 'function'
        && typeof blacksmith?.clearPartyFromCanvas === 'function';
}

/** The shared click sound for the party toolbar buttons. */
function playToolbarSound() {
    const blacksmith = getBlacksmith();
    if (!blacksmith) return;
    const sound = game.settings.get(MODULE.ID, 'toolbarButtonSound')
        || 'modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3';
    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
}

export class PanelManager {
    static instance = null;
    static currentActor = null;
    /**
     * Comma-joined ids of the actors this user owns, as of the last time the
     * character switcher was refreshed. Compared against a freshly computed one on
     * ownership changes so the tray rebuilds only when the chip list really moved.
     * @type {string|null}
     */
    static _ownedActorSignature = null;
    static isPinned = false;
    static viewMode = 'player';
    static element = null;
    static newlyAddedItems = new Map();
    static _cleanupInterval = null;
    static _lastFlagSweepActorId = null; // Last actor swept for stray isNew flags (flags persist; the map doesn't)
    /** Token ids the selection handler last acted on, for its no-change check. */
    static _lastControlledTokenIds = [];
    static _initializationInProgress = false;
    static _lastInitTime = 0;
    static _eventListeners = new Map(); // Track event listeners for cleanup
    static _timeouts = new Set(); // Track timeouts for cleanup
    static _intervals = new Set(); // Track intervals for cleanup
    static gmDetails = {
        resistances: [],
        immunities: [],
        biography: '',
        biographyHtml: ''
    };

    /**
     * The live tray element.
     *
     * A getter onto the static, NOT an own field. Every panel class sets
     * `this.element` in its own render(); PanelManager declared the same field to
     * match that convention and then never assigned it — `createTray`/`updateTray`
     * only ever wrote `PanelManager.element`. So `instance.element` was permanently
     * null while ~10 call sites across squire.js, panel-party.js and this file read
     * it to decide whether to render, or passed it straight into render(). All of
     * them silently did nothing: `updateTray()` could never run at all, and the
     * global updateActor hook's stats branch was gated behind `&& instance.element`.
     *
     * A getter rather than a mirrored assignment so the two can never drift again.
     * @returns {HTMLElement|null}
     */
    get element() {
        return PanelManager.element;
    }

    // -------------------------------------------------------------------------
    // TRAY OPEN / CLOSE
    //
    // One state machine for the whole tray. The chevron, the rest of the handle,
    // the pin, the hover option and the click-away timer all go through these,
    // because when each of them toggled `.expanded` itself they disagreed about
    // what "open" meant — most visibly, the chevron used to refuse to close a
    // pinned tray and just scolded the user instead.
    //
    // The rules:
    //   UNPINNED  chevron/handle toggles; collapses a moment after you click away.
    //   PINNED    stays open; closing it unpins it, because it cannot be both
    //             "always open" and closed.
    //   HOVER     optional: entering the handle opens, leaving the tray closes.
    // -------------------------------------------------------------------------

    /** Pending auto-collapse, so a re-entry or a deliberate open can cancel it. */
    static _collapseTimeout = null;

    /** @returns {boolean} Whether the tray is currently open. */
    static isExpanded() {
        return !!PanelManager.element?.classList.contains('expanded');
    }

    /**
     * Push #ui-left clear of whatever the tray currently occupies.
     * Pinned reserves the full tray width; unpinned reserves only the handle.
     *
     * The ONLY place this arithmetic lives. It was written out four times — here,
     * in the ready hook, and twice in settings.js — and the copies are what let
     * the load path drift: three of them handled the pinned case correctly while
     * the fourth ran before the pin state was restored and overwrote them.
     *
     * Reads `PanelManager.isPinned`, not the setting, so it stays synchronous.
     * That makes the static a precondition rather than a cache: anything calling
     * this before the tray is built must seed it from the setting first.
     */
    static updateUiMargin() {
        const uiLeft = document.querySelector('#ui-left');
        if (!uiLeft) return;
        const reserved = PanelManager.isPinned
            ? game.settings.get(MODULE.ID, 'trayWidth')
            : parseInt(getHandleWidth());
        uiLeft.style.marginLeft = `${reserved + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
    }

    /**
     * Put the handle into the width the user asked for.
     *
     * Three things have to move together and they live in three different
     * places, which is why this is one function rather than three call sites:
     * the class the stylesheet keys off, the custom property the COLLAPSED
     * transform is computed from, and the #ui-left margin. Change the class
     * alone and the tray slides to the wrong place; change the property alone
     * and the strip is the wrong width behind a correctly-placed edge.
     *
     * Only the closed width is ever in question. Open, the handle is always
     * minimal — the tray is right there, so the strip has nothing to be wide
     * for — and the transform is translateX(0) either way.
     */
    static applyHandleMode() {
        const full = (() => {
            try {
                return game.settings.get(MODULE.ID, 'handleMode') === 'full';
            } catch (error) {
                return false;
            }
        })();

        PanelManager.element?.classList?.toggle('handle-full', full);

        const handleWidth = parseInt(getHandleWidth());
        const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
        document.documentElement.style.setProperty('--squire-tray-handle-width', `${handleWidth}px`);
        document.documentElement.style.setProperty(
            '--squire-tray-transform',
            `translateX(-${trayWidth - handleWidth - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`
        );

        PanelManager.updateUiMargin();
    }

    /**
     * Pin or unpin the tray. Pinning always opens it; unpinning leaves it open,
     * so the pin button alone never hides anything the user was looking at.
     * @param {boolean} pinned
     * @param {object} [options]
     * @param {boolean} [options.sound=true] Play the pin/unpin sound.
     */
    static async setPinned(pinned, { sound = true } = {}) {
        PanelManager.isPinned = !!pinned;
        await game.settings.set(MODULE.ID, 'isPinned', PanelManager.isPinned);

        if (sound) {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const key = PanelManager.isPinned ? 'pinSound' : 'unpinSound';
                blacksmith.utils.playSound(game.settings.get(MODULE.ID, key), blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        }

        const tray = PanelManager.element;
        if (tray) {
            if (PanelManager.isPinned) tray.classList.add('pinned', 'expanded');
            else tray.classList.remove('pinned');
        }
        PanelManager.updateUiMargin();
    }

    /**
     * Open the tray.
     * @param {object} [options]
     * @param {boolean} [options.sound=true] Play the open sound. Hover-opens pass
     *   false: sweeping the mouse past the handle should not chirp every time.
     */
    static expandTray({ sound = true } = {}) {
        PanelManager.cancelCollapse();
        const tray = PanelManager.element;
        if (!tray || PanelManager.isExpanded()) return;

        if (sound) {
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const openSound = game.settings.get(MODULE.ID, 'trayOpenSound');
                blacksmith.utils.playSound(openSound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
        }
        tray.classList.add('expanded');
    }

    /** Close the tray, unpinning it first if it was pinned. */
    static async collapseTray() {
        PanelManager.cancelCollapse();
        const tray = PanelManager.element;
        if (!tray) return;
        if (PanelManager.isPinned) await PanelManager.setPinned(false);
        tray.classList.remove('expanded');
    }

    /** Open a closed tray, close an open one. */
    static async toggleTray() {
        if (PanelManager.isExpanded()) await PanelManager.collapseTray();
        else PanelManager.expandTray();
    }

    /** Drop any pending auto-collapse. */
    static cancelCollapse() {
        if (PanelManager._collapseTimeout === null) return;
        clearTrackedTimeout(PanelManager._collapseTimeout);
        PanelManager._collapseTimeout = null;
    }

    /**
     * Close the tray after the configured grace period, unless something cancels
     * first — clicking back into the tray, hovering it, or opening it again. A
     * no-op while pinned or already closed. Callers decide *whether* to arm this;
     * it only owns the timing.
     */
    static scheduleCollapse() {
        PanelManager.cancelCollapse();
        if (PanelManager.isPinned || !PanelManager.isExpanded()) return;

        const delay = Math.max(0, game.settings.get(MODULE.ID, 'trayCollapseDelay') ?? 1) * 1000;
        PanelManager._collapseTimeout = trackModuleTimeout(() => {
            PanelManager._collapseTimeout = null;
            // Re-check: the tray may have been pinned or closed during the wait.
            if (PanelManager.isPinned || !PanelManager.isExpanded()) return;
            PanelManager.element?.classList.remove('expanded');
        }, delay);
    }

    constructor(actor) {
        this.actor = actor;
        this.gmPanel = null;
        if (actor) {
            this.characterPanel = new CharacterPanel(actor);
            if (game.user.isGM) {
                this.gmPanel = new GmPanel(actor);
            }
            this.controlPanel = new ControlPanel(actor);
            this.compendiumSearchPanel = new CompendiumSearchPanel(actor);
            this.favoritesPanel = new FavoritesPanel(actor);
            this.buildsPanel = new BuildsPanel(actor);
            this.spellsPanel = new SpellsPanel(actor);
            this.weaponsPanel = new WeaponsPanel(actor);
            this.inventoryPanel = new InventoryPanel(actor);
            this.featuresPanel = new FeaturesPanel(actor);
            this.characterSummaryPanel = new CharacterSummaryPanel(actor);
        }
        // Always create these panels regardless of actor (for handle icons and multi-select functionality)
        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();
        this.hiddenCategories = new Set();
        
        // Register panels with HookManager
        this._registerPanelsWithHookManager();
        
        // Create handle manager for handle-specific functionality
        this.handleManager = new HandleManager(this);
    }

    /**
     * Actor to use when opening tray panels from the menubar before normal tray init completes.
     */
    static actorForMenubarFallback() {
        const controlled = canvas?.tokens?.controlled?.find(t => t.actor?.isOwner);
        if (controlled?.actor) return controlled.actor;
        const placeables = canvas?.tokens?.placeables;
        if (placeables?.length) {
            const firstOwned = placeables.find(t => t.actor?.isOwner);
            if (firstOwned?.actor) return firstOwned.actor;
        }
        return game.user?.character ?? null;
    }

    /**
     * Ensure {@link PanelManager.instance} exists. Menubar onClick can run before the delayed
     * tray bootstrap or while another initialize() is in flight.
     */
    static async ensureReadyForMenubar() {
        if (PanelManager.instance) return true;

        const actor = PanelManager.actorForMenubarFallback();
        await PanelManager.initialize(actor);

        let spins = 0;
        while (!PanelManager.instance && PanelManager._initializationInProgress && spins < 120) {
            await new Promise(r => setTimeout(r, 50));
            spins++;
        }
        if (PanelManager.instance) return true;

        await new Promise(r => setTimeout(r, 150));
        await PanelManager.initialize(actor);

        spins = 0;
        while (!PanelManager.instance && PanelManager._initializationInProgress && spins < 120) {
            await new Promise(r => setTimeout(r, 50));
            spins++;
        }

        return !!PanelManager.instance;
    }

    static async initialize(actor = null, { force = false } = {}) {
        // Check if user is excluded - with safety check for setting registration
        let excludedUsers = [];
        try {
            const excludedUsersSetting = game.settings.get(MODULE.ID, 'excludedUsers');
            if (excludedUsersSetting) {
                excludedUsers = excludedUsersSetting.split(',').map(id => id.trim());
            }
        } catch (error) {
            // Setting not registered yet, treat as not excluded
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                'Settings not yet registered, treating user as not excluded',
                { error },
                false,
                false
            );
        }
        
        if (excludedUsers.includes(game.user.id)) {
            // If we have an existing tray, remove it
            if (PanelManager.element) {
                PanelManager.element.remove();
                PanelManager.element = null;
            }
            return;
        }

        // Debounce initialization - don't initialize more than once every 100ms.
        // `force` bypasses the debounce for deliberate rebuilds (e.g. last token deleted,
        // where the controlToken release handler has just stamped _lastInitTime).
        const now = Date.now();
        if (!force && now - PanelManager._lastInitTime < 100) {
            return;
        }
        PanelManager._lastInitTime = now;
        
        // Prevent overlapping initializations 
        if (PanelManager._initializationInProgress) {
            return;
        }
        
        try {
            PanelManager._initializationInProgress = true;
            
            // Check if this is the first time loading
            const isFirstLoad = !PanelManager.instance;
            
            // Set default viewMode based on user preference
            if (isFirstLoad) {
                const defaultMode = game.settings.get(MODULE.ID, 'viewDefaultMode');
                if (defaultMode === 'last') {
                    // Load whatever was last viewed (or fallback to 'player' if none)
                    PanelManager.viewMode = game.settings.get(MODULE.ID, 'viewMode') || 'player';
                } else {
                    // Use their specified default tab
                    PanelManager.viewMode = defaultMode;
                    await game.settings.set(MODULE.ID, 'viewMode', defaultMode);
                }
            } else {
                // Load the saved viewMode
                PanelManager.viewMode = game.settings.get(MODULE.ID, 'viewMode');
            }
            
            // Validate that the initial viewMode is enabled
            const enabledTabs = ['player']; // Player is always enabled
            if (game.settings.get(MODULE.ID, 'showTabParty')) enabledTabs.push('party');
            
            if (!enabledTabs.includes(PanelManager.viewMode)) {
                // Fallback to first enabled tab
                PanelManager.viewMode = enabledTabs[0];
                await game.settings.set(MODULE.ID, 'viewMode', enabledTabs[0]);
            }
            
            // If we have an instance with the same actor, do nothing
            if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) {
                PanelManager._initializationInProgress = false;
                return;
            }

            // Set up cleanup interval if not already set
            if (!PanelManager._cleanupInterval) {
                // One periodic sweep: `trackModuleInterval` already registers with timer-utils.
                // Add only to `_intervals` so `cleanup()` clears it once via `clearTrackedInterval` (avoid duplicate register + double clearInterval).
                const intervalId = trackModuleInterval(() => {
                    const changed = PanelManager.cleanupNewlyAddedItems();
                    // Re-render the inventory panel only when a "new" marker actually expired or was cleared
                    if (changed && PanelManager.instance?.inventoryPanel?.element) {
                        PanelManager.instance.inventoryPanel.render(PanelManager.instance.inventoryPanel.element);
                        PanelManager.instance.controlPanel?.reapplyFilters();
                    }
                }, 30000); // Check every 30 seconds
                PanelManager._cleanupInterval = intervalId;
                PanelManager._intervals.add(intervalId);
            }


            // Clean up old instance before creating new one to prevent memory leaks
            if (PanelManager.instance) {
                PanelManager._cleanupOldInstance();
            }

            // Create or update instance
            PanelManager.currentActor = actor;
            
            // Always create a new instance to ensure clean state
            PanelManager.instance = new PanelManager(actor);

            // Reconcile with the character sheet's own favourites. On an actor
            // that has never synced this is the initial merge; afterwards it
            // catches anything that changed while Squire was not watching — a
            // sheet edit by another client, or with Squire disabled. It writes
            // nothing when the two already agree.
            if (actor) await syncFavorites(actor);

            // Check if this is a monster/NPC and auto-favorite items
            if (actor && actor.type !== "character") {
                // Check if actor is from a compendium before trying to modify it
                const isFromCompendium = actor.pack || (actor.collection && actor.collection.locked);
                if (isFromCompendium) {
                    // Skip auto-favoriting for actors from compendiums
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    blacksmith?.utils.postConsoleAndNotification(
                        MODULE.NAME,
                        "SQUIRE | Skipping auto-favorites initialization for actor from compendium",
                        { 
                            actorName: actor.name, 
                            actorType: actor.type,
                            pack: actor.pack,
                            collectionName: actor.collection?.metadata?.name || 'Unknown',
                            collectionId: actor.collection?.id || 'Unknown'
                        },
                        false,
                        false
                    );
                } else {
                    // Repair before favoriting: a weapon that gains ammunition
                    // is the same item either way, but the GM sees one coherent
                    // pass rather than a warning that clears a moment later.
                    await StatblockUtility.autoFixIfEnabled(actor);
                    await FavoritesPanel.syncNpcAutoFavorites(actor);
                }
            }


            // Abort if instance was cleared by another hook (e.g. deleteToken) during await
            if (!PanelManager.instance) return;

            // Remove any existing trays first
            // v13: Use native DOM instead of jQuery
            document.querySelectorAll('.squire-tray').forEach(el => el.remove());
            
            // Create the tray
            await PanelManager.instance.createTray();

            // Abort if instance was cleared by another hook (e.g. deleteToken) during await
            if (!PanelManager.instance) return;
            
            // Update health panel with current token selection
            await _updateTrayFromSelection();
        } finally {
            PanelManager._initializationInProgress = false;
        }
    }

    async createTray() {
        // Ensure handle-character-portrait partial is registered before rendering
        // This prevents race conditions where templates render before partials are loaded
        if (!Handlebars.partials['handle-character-portrait']) {
            try {
                const handleCharacterPortraitPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-character-portrait.hbs`).then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch handle-character-portrait.hbs: ${response.status} ${response.statusText}`);
                    }
                    return response.text();
                });
                Handlebars.registerPartial('handle-character-portrait', handleCharacterPortraitPartial);
            } catch (error) {
                console.error('Coffee Pub Squire | Error registering handle-character-portrait partial in createTray:', error);
                // Register a fallback partial to prevent template errors
                Handlebars.registerPartial('handle-character-portrait', '{{!-- Character portrait partial failed to load --}}');
            }
        }
        
        // Use the current viewMode (which is either default or from settings)
        const viewMode = PanelManager.viewMode;
        
        const trayHtml = await renderTemplate(TEMPLATES.TRAY, {
            actor: this.actor,
            isGM: game.user.isGM,
            canStartVote: isGMOrPartyLeader(),
            canDeployParty: canDeployParty(),
            ownedCharacters: PanelManager.getOwnedCharacters(this.actor),
            effects: this.actor?.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            settings: {
                showGmPanel: game.settings.get(MODULE.ID, 'showGmPanel'),
                showCharacterSummaryPanel: game.settings.get(MODULE.ID, 'showCharacterSummaryPanel'),
                showPartyStatsPanel: game.settings.get(MODULE.ID, 'showPartyStatsPanel')
            },
            viewMode: viewMode,
            showTabParty: game.settings.get(MODULE.ID, 'showTabParty'),
            newlyAddedItems: Object.fromEntries(PanelManager.newlyAddedItems),
            defaultPartyName: getCampaignContext().party,
        });
        // v13: Create native DOM element instead of jQuery
        const wrapper = document.createElement('div');
        wrapper.innerHTML = trayHtml;
        const trayElement = wrapper.firstElementChild || wrapper;
        
        document.body.appendChild(trayElement);
        PanelManager.element = trayElement;

        // Restore the pin state FIRST, and specifically before applyHandleMode()
        // below. That call ends in updateUiMargin(), which branches on
        // PanelManager.isPinned — so with the restore underneath it, every load
        // computed the margin against the class default of `false` and reserved
        // a handle's width for a tray that was about to be pinned open. The
        // symptom was a tray that came back pinned over an unshifted interface,
        // with unpin-then-repin as the only way to fix it, because setPinned()
        // is the one path that updates the margin after isPinned is true.
        PanelManager.isPinned = game.settings.get(MODULE.ID, 'isPinned');
        if (PanelManager.isPinned) {
            trayElement.classList.add('pinned', 'expanded');
        }

        PanelManager.applyHandleMode();

        // Ensure viewMode is properly set
        PanelManager.viewMode = viewMode;
        
        await this.renderPanels(trayElement);
        this.activateListeners(trayElement);
        
        // Populate handle with rich data immediately after creation
        await this.handleManager.updateHandle();
        
        // Set view mode
        if (viewMode === 'player') {
            await this.setViewMode('player');
        }

        // Handle fade effect is now managed by HandleManager
    }

    async updateTray() {
        // The live tray is the STATIC element. `this.element` is assigned null in the
        // constructor and never set again — createTray/updateTray only ever write
        // `PanelManager.element` — so guarding on the instance field made this whole
        // method unreachable. It has never run.
        const tray = PanelManager.element;
        if (!tray) return;

        // Store current state
        // v13: Use native classList instead of jQuery hasClass
        const wasExpanded = tray.classList.contains('expanded');
        const wasPinned = tray.classList.contains('pinned');
        
        // Create new tray element
        const viewMode = PanelManager.viewMode;
        
        const trayHtml = await renderTemplate(TEMPLATES.TRAY, {
            actor: this.actor,
            isGM: game.user.isGM,
            canStartVote: isGMOrPartyLeader(),
            canDeployParty: canDeployParty(),
            ownedCharacters: PanelManager.getOwnedCharacters(this.actor),
            effects: this.actor.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            settings: {
                showGmPanel: game.settings.get(MODULE.ID, 'showGmPanel'),
                showCharacterSummaryPanel: game.settings.get(MODULE.ID, 'showCharacterSummaryPanel'),
                showPartyStatsPanel: game.settings.get(MODULE.ID, 'showPartyStatsPanel')
            },
            viewMode: viewMode,
            showTabParty: game.settings.get(MODULE.ID, 'showTabParty'),
            defaultPartyName: getCampaignContext().party
        });
        // v13: Create native DOM element instead of jQuery
        const wrapper = document.createElement('div');
        wrapper.innerHTML = trayHtml;
        const newTrayElement = wrapper.firstElementChild || wrapper;
        
        // Preserve expanded/pinned state without animation
        // v13: Use native classList instead of jQuery addClass
        if (wasExpanded) {
            newTrayElement.classList.add('expanded');
        }
        if (wasPinned) {
            newTrayElement.classList.add('pinned', 'expanded');
        }
        
        // Replace the old tray with the new one
        // v13: Use native DOM replaceWith method
        PanelManager.element.replaceWith(newTrayElement);
        PanelManager.element = newTrayElement;
        PanelManager.applyHandleMode();

        // Re-attach listeners and render panels
        this.activateListeners(PanelManager.element);

        // Create new panel instances with updated element references
        this.characterPanel = new CharacterPanel(this.actor);
        this.controlPanel = new ControlPanel(this.actor);
        this.compendiumSearchPanel = new CompendiumSearchPanel(this.actor);
        this.favoritesPanel = new FavoritesPanel(this.actor);
        this.buildsPanel = new BuildsPanel(this.actor);
        this.spellsPanel = new SpellsPanel(this.actor);
        this.weaponsPanel = new WeaponsPanel(this.actor);
        this.inventoryPanel = new InventoryPanel(this.actor);
        this.featuresPanel = new FeaturesPanel(this.actor);
        this.characterSummaryPanel = new CharacterSummaryPanel(this.actor);

        this.partyPanel = new PartyPanel();
        this.partyStatsPanel = new PartyStatsPanel();

        // Update panel element references for non-popped panels
        this.characterPanel.element = PanelManager.element;
        if (this.gmPanel) {
            this.gmPanel.element = PanelManager.element;
        }
        this.controlPanel.element = PanelManager.element;
        this.compendiumSearchPanel.element = PanelManager.element;
        this.favoritesPanel.element = PanelManager.element;
        this.buildsPanel.element = PanelManager.element;
        this.spellsPanel.element = PanelManager.element;
        this.weaponsPanel.element = PanelManager.element;
        this.inventoryPanel.element = PanelManager.element;
        this.featuresPanel.element = PanelManager.element;
        this.characterSummaryPanel.element = PanelManager.element;

        // Render all panels
        await this.renderPanels(PanelManager.element);


    }


    async updateHandle() {
        // Delegate to the handle manager
        if (this.handleManager) {
            await this.handleManager.updateHandle();
        }
    }

    async renderActorPanels(element) {
        if (!element) return;

        if (this.actor) {
            this.characterPanel?.render(element);
            // GM-only, and now individually toggleable like the other panels.
            if (game.user.isGM && game.settings.get(MODULE.ID, 'showGmPanel')) {
                if (this.gmPanel) {
                    this.gmPanel.render(element, PanelManager.gmDetails);
                }
            } else {
                PanelManager.removePanelDom(this.gmPanel);
            }
            this.controlPanel?.render(element);
            this.buildsPanel?.render(element);
            this.favoritesPanel?.render(element);
            this.spellsPanel?.render(element);
            this.weaponsPanel?.render(element);
            this.inventoryPanel?.render(element);
            this.featuresPanel?.render(element);
            this.controlPanel?.reapplyFilters();

            // Dice Tray is window-only and has no tray render path.
            if (game.settings.get(MODULE.ID, 'showCharacterSummaryPanel')) {
                this.characterSummaryPanel?.render(element);
            } else {
                PanelManager.removePanelDom(this.characterSummaryPanel);
            }
        }
    }

    async renderPanels(element) {
        if (!element) return;

        await this.renderActorPanels(element);

        // Party renders lazily: it defers its first render until the tab is
        // viewed (setViewMode) or an event-driven refresh renders it directly,
        // then stays warm across subsequent renderPanels calls.
        //
        if (this.partyPanel && game.settings.get(MODULE.ID, 'showTabParty')) {
            if (PanelManager.viewMode === 'party' || this.partyPanel._hasRenderedOnce) {
                this.partyPanel._hasRenderedOnce = true;
                this.partyPanel.render(element);
            }
        }

        // Party-stats lives inside the party tab — same lazy rules plus its own setting
        if (game.settings.get(MODULE.ID, 'showPartyStatsPanel')) {
            if (this.partyStatsPanel
                && (PanelManager.viewMode === 'party' || this.partyStatsPanel._hasRenderedOnce)) {
                this.partyStatsPanel._hasRenderedOnce = true;
                this.partyStatsPanel.render(element);
            }
        } else {
            PanelManager.removePanelDom(this.partyStatsPanel);
        }
    }

    activateListeners(tray) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeTray = tray;
        if (tray && (tray.jquery || typeof tray.find === 'function')) {
            nativeTray = tray[0] || tray.get?.(0) || tray;
        }
        
        const handle = nativeTray.querySelector('.tray-handle');

        // Character switcher chips — delegated, since chips re-render with the character
        // panel and also appear in the no-character message. Guarded against re-binding
        // (activateListeners can run again on the same tray element).
        if (!nativeTray.dataset.characterSwitcherBound) {
            nativeTray.dataset.characterSwitcherBound = 'true';
            nativeTray.addEventListener('click', async (event) => {
                const chip = event.target.closest('.character-switcher-chip');
                if (!chip) return;
                const actorId = chip.dataset.actorId;
                if (!actorId || actorId === PanelManager.currentActor?.id) return;
                await PanelManager.switchToCharacter(actorId);
            });
        }

        // Drag items out of the tray — to chat, a journal, the hotbar, another
        // sheet, or any of Squire's own drop zones. Nothing in Foundry drags unless it
        // is wired to: the row carries draggable="true" (in the templates, so it
        // survives a re-render for free) and this supplies the payload.
        //
        // Delegated and bound once, deliberately. Every panel rebuilds its items on
        // each render, so a per-item listener would need re-binding every time — the
        // pattern that has repeatedly left handlers pointing at markup that no longer
        // exists. One listener on the stable tray root outlives all of it.
        if (!nativeTray.dataset.itemDragBound) {
            nativeTray.dataset.itemDragBound = 'true';

            // A press that begins on one of the row's action icons (heart, shield,
            // lightbulb, share, feather) must never start a row drag: Chromium's drag
            // threshold is only a few pixels, so a quick click on a small icon often
            // registers as an aborted drag instead — and the click never fires. Gate
            // draggability per-press; every mousedown recomputes it, and re-renders
            // restore the template's draggable="true" anyway.
            nativeTray.addEventListener('mousedown', (event) => {
                const row = event.target.closest?.('.panel-item[data-item-id]');
                if (!row || !nativeTray.contains(row)) return;
                row.draggable = !event.target.closest('.tray-buttons');
            });

            nativeTray.addEventListener('dragstart', (event) => {
                const row = event.target.closest?.('.panel-item[data-item-id]');
                if (!row || !nativeTray.contains(row)) return;

                const item = PanelManager.currentActor?.items?.get(row.dataset.itemId);
                if (!item) return;

                // The tray is itself a drop zone (item transfer). A drag that
                // starts here must not light it up or accept the drop — the
                // actor already owns the item, so a self-drop just duplicates
                // it. The transfer zone checks this flag; cleared on dragend.
                PanelManager._trayItemDragActive = true;

                // toDragData() is the canonical payload every Foundry drop target
                // understands — {type, uuid, data}. Hand-rolling {type:'Item', uuid}
                // would work today and rot the moment core changes the shape.
                event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
                event.dataTransfer.effectAllowed = 'copyLink';

                const img = row.querySelector('.panel-item-image');
                if (img) event.dataTransfer.setDragImage(img, 16, 16);
            });

            // dragend fires on the source element (bubbling here) whether the
            // drop landed, was cancelled, or went nowhere.
            nativeTray.addEventListener('dragend', () => {
                PanelManager._trayItemDragActive = false;
                // Cancelling with Escape over the handle fires no dragleave, so
                // the drop highlight has to be cleared from the one event that
                // always fires. This handler already owns "the drag is over".
                nativeTray.querySelector('.tray-handle')?.classList.remove('handle-drop-target');
                nativeTray.querySelectorAll('.handle-favorite-icon.drop-above')
                    .forEach(icon => icon.classList.remove('drop-above'));
            });
        }

        // View tab buttons
        const tabButtons = nativeTray.querySelectorAll('.tray-tab-button');
        tabButtons.forEach(button => {
            // Clone to remove existing listeners
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const view = event.currentTarget.dataset.view;
                await this.setViewMode(view);
            });
        });
        
        // GM-only buttons
        if (game.user.isGM) {
            // Experience — Blacksmith's XP distribution window.
            //
            // This used to be an "Award" button that reflected over four possible
            // paths to the dnd5e Award application (`game.dnd5e.applications.Award`
            // and three fallbacks) and guessed at the party from controlled tokens.
            // Blacksmith owns XP now and registers the window for any module to open,
            // so this asks for it by id and lets Blacksmith decide what it awards to.
            const experienceButton = nativeTray.querySelector('[data-action="experience"]');
            if (experienceButton) {
                // Clone to remove existing listeners
                const newButton = experienceButton.cloneNode(true);
                experienceButton.parentNode?.replaceChild(newButton, experienceButton);

                newButton.addEventListener('click', async () => {
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    if (typeof blacksmith?.openWindow !== 'function') {
                        ui.notifications.warn('The Experience window is not available.');
                        return;
                    }
                    await blacksmith.openWindow('blacksmith-xp');
                    playToolbarSound();
                });
            }
        }

        // Vote — Blacksmith's vote window. Shown to the GM and the party leader;
        // Blacksmith re-checks and refuses anyone else, so a stale leader setting
        // costs a warning rather than an unexpected vote.
        const voteButton = nativeTray.querySelector('[data-action="vote"]');
        if (voteButton) {
            // Clone to remove existing listeners
            const newButton = voteButton.cloneNode(true);
            voteButton.parentNode?.replaceChild(newButton, voteButton);

            newButton.addEventListener('click', async () => {
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (typeof blacksmith?.openWindow !== 'function') {
                    ui.notifications.warn('The Vote window is not available.');
                    return;
                }
                await blacksmith.openWindow('blacksmith-vote');
                playToolbarSound();
            });
        }

        // Deploy / Clear Party — Blacksmith's, exposed on its api as of 13.16.1.
        // Both keep their GM guard inside utility-party.js and return an empty
        // result rather than throwing, so there is no second guard here to drift
        // out of step with theirs; the buttons are simply not rendered for
        // non-GMs or against a Blacksmith too old to have them.
        const deployPartyButton = nativeTray.querySelector('[data-action="deploy-party"]');
        if (deployPartyButton) {
            // Clone to remove existing listeners
            const newButton = deployPartyButton.cloneNode(true);
            deployPartyButton.parentNode?.replaceChild(newButton, deployPartyButton);

            newButton.addEventListener('click', async () => {
                const blacksmith = getBlacksmith();
                if (typeof blacksmith?.deployParty !== 'function') return;
                const deployed = await blacksmith.deployParty();
                // Returns Token[]; an empty array means refused or nothing to place,
                // and Blacksmith has already said why.
                if (Array.isArray(deployed) && deployed.length) playToolbarSound();
            });
        }

        const clearPartyButton = nativeTray.querySelector('[data-action="clear-party"]');
        if (clearPartyButton) {
            // Clone to remove existing listeners
            const newButton = clearPartyButton.cloneNode(true);
            clearPartyButton.parentNode?.replaceChild(newButton, clearPartyButton);

            newButton.addEventListener('click', async () => {
                const blacksmith = getBlacksmith();
                if (typeof blacksmith?.clearPartyFromCanvas !== 'function') return;
                const removed = await blacksmith.clearPartyFromCanvas();
                if (Number(removed) > 0) playToolbarSound();
            });
        }

        // Select Party Button - available to all users
        const selectPartyButton = nativeTray.querySelector('[data-action="select-party"]');
        if (selectPartyButton) {
            // Clone to remove existing listeners
            const newButton = selectPartyButton.cloneNode(true);
            selectPartyButton.parentNode?.replaceChild(newButton, selectPartyButton);
            
            newButton.addEventListener('click', async (event) => {
            // Find all player character tokens on the canvas
            const partyTokens = canvas.tokens.placeables.filter(t => 
                t.actor?.hasPlayerOwner && t.actor?.type === "character"
            );
            
            if (partyTokens.length === 0) {
                ui.notifications.warn("No player character tokens found on this scene.");
                return;
            }
            
            // For players, only select tokens they own
            const tokensToSelect = game.user.isGM 
                ? partyTokens 
                : partyTokens.filter(t => t.actor.isOwner);
                
            if (tokensToSelect.length === 0) {
                ui.notifications.warn("You don't have ownership of any party tokens on this scene.");
                return;
            }
            
            // Deselect all currently selected tokens
            canvas.tokens.releaseAll();
            
            // Select all appropriate party tokens
            tokensToSelect.forEach(token => token.control({releaseOthers: false}));
            
            playToolbarSound();
            });
        }

        // Add drag and drop handlers for stacked panels
        const stackedContainer = nativeTray.querySelector('.panel-containers.stacked');
        
        if (stackedContainer) {
            // v13: Store handler references for cleanup (can't use namespaced events in native DOM)
            // For now, we'll remove old handlers by cloning the container
            const containerClone = stackedContainer.cloneNode(true);
            stackedContainer.parentNode?.replaceChild(containerClone, stackedContainer);
            const newStackedContainer = containerClone;
            
            // v13: Add new drag event listeners with native DOM
            newStackedContainer.addEventListener('dragenter', (event) => {
                // A drag that started in the tray must not treat the tray as a
                // drop target — the actor already owns the item (self-drop
                // would duplicate it). No highlight, no sound, no preventDefault.
                if (PanelManager._trayItemDragActive) return;
                event.preventDefault();
                // Add drop hover styles for any drag operation
                event.currentTarget.classList.add('drop-target');
                // Play hover sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
            });

            newStackedContainer.addEventListener('dragleave', (event) => {
                event.preventDefault();
                // Remove the style if we're leaving the container or entering a child element
                const container = event.currentTarget;
                const relatedTarget = event.relatedTarget;
                // Check if we're actually leaving the container
                if (!relatedTarget || !newStackedContainer.contains(relatedTarget)) {
                    container.classList.remove('drop-target');
                }
            });

            newStackedContainer.addEventListener('dragover', (event) => {
                // Without preventDefault the browser refuses the drop here —
                // exactly what we want for a drag that started in the tray.
                if (PanelManager._trayItemDragActive) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            });

            newStackedContainer.addEventListener('drop', async (event) => {
                if (PanelManager._trayItemDragActive) return;
                event.preventDefault();

                // Get the container and remove hover state
                const container = event.currentTarget;
                container.classList.remove('drop-target');
            
            try {
                // v13: Use event.dataTransfer directly (no originalEvent in native DOM)
                const dataTransfer = event.dataTransfer.getData('text/plain');
                const data = JSON.parse(dataTransfer);
                
                // Play drop sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Get the current actor
                const actor = PanelManager.currentActor;
                if (!actor) {
                    ui.notifications.warn("No character selected.");
                    return;
                }
                
                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        // This could be either a world item OR a drag from character sheet
                        // Classify by what the uuid actually points at, not by
                        // its prefix. An item on an unlinked token is
                        // `Scene.x.Token.y.Actor.z.Item.i`, which does not START
                        // with "Actor." — so a startsWith test routes an NPC's
                        // item to the world-item branch below, where it is
                        // copied onto the target and left on the source with
                        // none of the transfer guards run.
                        if ((data.actorId && (data.data?.itemId || data.embedId)) ||
                            data.fromInventory ||
                            /Actor\.[^.]+\.Item\./.test(String(data.uuid || ''))) {
                            

                            // This is a drag from character sheet
                            let sourceActorId;
                            let itemId;
                            
                            // Parse from UUID format if present (Actor.actorId.Item.itemId)
                            const uuidMatch = String(data.uuid || '').match(/Actor\.([^.]+)\.Item\.([^.]+)/);
                            if (uuidMatch) {
                                sourceActorId = uuidMatch[1];
                                itemId = uuidMatch[2];
                            } else {
                                sourceActorId = data.actorId;
                                itemId = data.data?.itemId || data.embedId || data.uuid?.split('.').pop();
                            }
                            
                            const { sourceActor, sourceItem } = await resolveDroppedItem(data, sourceActorId, itemId);
                            if (!sourceActor || !sourceItem) {
                            showSquireToast('Could not find that item on its owner.', {
                                subtitle: 'Nothing was transferred.',
                                icon: 'fa-solid fa-triangle-exclamation',
                                color: '#e05c3c'
                            });
                            return;
                            }

                            // Same-actor drop is a no-op: transferring an item to
                            // its own owner just duplicates it. Belt-and-braces
                            // behind the _trayItemDragActive gate — this also
                            // catches a drag from this actor's own sheet.
                            if (sourceActor.id === actor.id) return;
                            

                            // A packed container can't be handed over: dnd5e keeps
                            // containment on the child as `system.container`, so a
                            // copy on the target has an id its contents never point
                            // at. Refuse in front of the quantity dialog.
                            const containerBlocker = getTransferBlocker(sourceItem, sourceActor);
                            if (containerBlocker) {
                                showSquireToast('Unpack it first', {
                                    subtitle: containerBlocker.message,
                                    icon: 'fa-solid fa-box-open',
                                    color: '#e0a53c'
                                });
                                return;
                            }
                            
                            // Handle quantity logic for stackable items
                            const hasQuantity = sourceItem.system.quantity != null;
                            
                            // Check if we have direct permission to modify both actors
                            const hasSourcePermission = sourceActor.isOwner;
                            const hasTargetPermission = actor.isOwner;

                            const { selectTransferQuantityWithTool } = await import('./window-transfer-tool.js');
                            const selectedQuantity = await selectTransferQuantityWithTool({
                                sourceActor,
                                targetActor: actor,
                                item: sourceItem
                            });
                            
                            if (selectedQuantity <= 0) return; // User cancelled
                            
                            if (!hasSourcePermission || !hasTargetPermission) {
                                // Prepare transfer data
                                const transferId = `transfer_${Date.now()}`;
                                const transferData = {
                                    id: transferId,
                                    sourceActorId: sourceActor.id,
                                    targetActorId: actor.id,
                                    itemId: sourceItem.id,
                                    itemName: sourceItem.name,
                                    quantity: selectedQuantity,
                                    hasQuantity: hasQuantity,
                                    isPlural: selectedQuantity > 1,
                                    sourceActorName: getActorDisplayName(sourceActor),
                                    targetActorName: actor.name,
                                    status: 'pending',
                                    timestamp: Date.now(),
                                    sourceUserId: game.user.id
                                };
                                
                                const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
                                
                                // Sender: request sent message
                                await transferRequestSender({
                                    targetActorName: actor.name,
                                    itemName: sourceItem.name,
                                    quantity: selectedQuantity,
                                    hasQuantity: !!hasQuantity,
                                    isPlural: selectedQuantity > 1,
                                    waitingOn: gmApprovalRequired ? "Waiting for GM approval." : "Waiting for receiver to accept.",
                                    speaker: { alias: "System" },
                                    whisper: [game.user.id],
                                    flags: {
                                        transferId,
                                        type: 'transferRequest',
                                        isTransferSender: true,
                                        data: transferData
                                    }
                                });
                                
                                if (gmApprovalRequired) {
                                    // GM: approval request with Approve/Deny buttons
                                    const gmUsers = game.users.filter(u => u.isGM);
                                    if (gmUsers.length > 0) {
                                        // If current user is not a GM, use socketlib to have a GM create the message
                                        if (!game.user.isGM) {
                                            const socket = game.modules.get(MODULE.ID)?.socket;
                                            if (socket) {
                                                await socket.executeAsGM('createTransferRequestChat', {
                                                    sourceActorId: sourceActor.id,
                                                    sourceActorName: `${getActorDisplayName(sourceActor)} (${game.user.name})`,
                                                    targetActorId: actor.id,
                                                    targetActorName: actor.name,
                                                    itemId: sourceItem.id,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isGMApproval: true,
                                                    transferId,
                                                    receiverIds: gmUsers.map(u => u.id),
                                                    transferData
                                                });
                                            }
                                        } else {
                                            await transferRequestGMApproval({
                                                sourceActorName: `${getActorDisplayName(sourceActor)} (${game.user.name})`,
                                                targetActorName: actor.name,
                                                itemName: sourceItem.name,
                                                quantity: selectedQuantity,
                                                hasQuantity: !!hasQuantity,
                                                isPlural: selectedQuantity > 1,
                                                transferId,
                                                speaker: { alias: "System Transfer" },
                                                whisper: gmUsers.map(u => u.id),
                                                flags: {
                                                    transferId,
                                                    type: 'transferRequest',
                                                    isGMApproval: true,
                                                    data: transferData
                                                }
                                            });
                                        }
                                    }
                                } else {
                                    // Receiver: actionable message (with Accept/Reject buttons) - only if GM approval NOT required
                                    const targetUsers = game.users.filter(u => !u.isGM && actor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                                    if (targetUsers.length > 0) {
                                        // If current user is not a GM, use socketlib to have a GM create the message
                                        if (!game.user.isGM) {
                                            const socket = game.modules.get(MODULE.ID)?.socket;
                                            if (socket) {
                                                await socket.executeAsGM('createTransferRequestChat', {
                                                    sourceActorId: sourceActor.id,
                                                    sourceActorName: getActorDisplayName(sourceActor),
                                                    targetActorId: actor.id,
                                                    targetActorName: actor.name,
                                                    itemId: sourceItem.id,
                                                    itemName: sourceItem.name,
                                                    quantity: selectedQuantity,
                                                    hasQuantity: !!hasQuantity,
                                                    isPlural: selectedQuantity > 1,
                                                    isTransferReceiver: true,
                                                    transferId,
                                                    receiverIds: targetUsers.map(u => u.id),
                                                    transferData
                                                });
                                            }
                                        } else {
                                            await transferRequestReceiver({
                                                sourceActorName: getActorDisplayName(sourceActor),
                                                targetActorName: actor.name,
                                                itemName: sourceItem.name,
                                                quantity: selectedQuantity,
                                                hasQuantity: !!hasQuantity,
                                                isPlural: selectedQuantity > 1,
                                                transferId,
                                                speaker: { alias: "System" },
                                                whisper: targetUsers.map(u => u.id),
                                                flags: {
                                                    transferId,
                                                    type: 'transferRequest',
                                                    isTransferReceiver: true,
                                                    targetUsers: targetUsers.map(u => u.id),
                                                    data: transferData
                                                }
                                            });
                                        }
                                    }
                                }
                                // Do not execute transfer yet - wait for button clicks
                                return;
                            } else {
                                await this._completeItemTransfer(sourceActor, actor, sourceItem, selectedQuantity, hasQuantity);
                                return;
                            }
                        } else {
                            try {
                                // Get the item from the UUID
                                const item = await fromUuid(data.uuid);
                                if (!item) {
                                    return;
                                }
                                // Create the item on the actor
                                const createdItem = await actor.createEmbeddedDocuments('Item', [item.toObject()]);
                                // Add to newlyAddedItems in PanelManager
                                if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                                    game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(createdItem[0].id, Date.now());
                                }
                                
                                // Send chat notification. Named for the actor the
                                // item was dropped on — the card used to name
                                // whichever actor the tray happened to be showing,
                                // which is the same one only by coincidence.
                                await itemReceived({
                                    icon: this._getDropIcon(item.type),
                                    title: this._getDropTitle(item.type),
                                    actorName: actor.name,
                                    itemName: item.name,
                                    speaker: ChatMessage.getSpeaker({ actor })
                                });

                                // Determine which panel to re-render based on item type
                                let targetPanel;
                                switch (item.type) {
                                    case 'weapon':
                                        targetPanel = 'weapons';
                                        break;
                                    case 'spell':
                                        targetPanel = 'spells';
                                        break;
                                    case 'feat':
                                        targetPanel = 'features';
                                        break;
                                    default:
                                        targetPanel = 'inventory';
                                }
                                // Re-render the appropriate panel
                                switch (targetPanel) {
                                    case 'favorites':
                                        if (this.favoritesPanel) await this.favoritesPanel.render(PanelManager.element);
                                        break;
                                    case 'weapons':
                                        if (this.weaponsPanel) await this.weaponsPanel.render(PanelManager.element);
                                        break;
                                    case 'spells':
                                        if (this.spellsPanel) await this.spellsPanel.render(PanelManager.element);
                                        break;
                                    case 'features':
                                        if (this.featuresPanel) await this.featuresPanel.render(PanelManager.element);
                                        break;
                                    case 'inventory':
                                        if (this.inventoryPanel) await this.inventoryPanel.render(PanelManager.element);
                                        break;
                                }
                                this.controlPanel?.reapplyFilters();
                            } catch (error) {
                                console.error('DROPZONE | Error processing world item:', error);
                                ui.notifications.error("Error processing dropped item. See console for details.");
                            }
                        }
                        break;
                    default:
                }
                
            } catch (error) {
                console.error('DROPZONE | Error handling drop:', error);
                ui.notifications.error("Error handling drop. See console for details.");
            }
            });
        }


    }

    async setViewMode(mode) {
        // Only proceed if the view mode is actually changing
        if (PanelManager.viewMode === mode) {
            return; // No change needed
        }
        
        // Validate that the requested mode is enabled
        const enabledTabs = ['player']; // Player is always enabled
        if (game.settings.get(MODULE.ID, 'showTabParty')) enabledTabs.push('party');
        
        if (!enabledTabs.includes(mode)) {
            return;
        }
        
        // Update viewMode
        PanelManager.viewMode = mode;
        await game.settings.set(MODULE.ID, 'viewMode', mode);
        
        // Play tab change sound only when view mode actually changes
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'tabChangeSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        // Safety check: ensure tray element exists before manipulating it
        const tray = PanelManager.element;
        if (!tray) {
            return;
        }
        
        // v13: Use native DOM methods instead of jQuery
        // Update tab buttons
        const tabButtons = tray.querySelectorAll('.tray-tab-button');
        tabButtons.forEach(btn => btn.classList.remove('active'));
        const activeTab = tray.querySelector(`.tray-tab-button[data-view="${mode}"]`);
        if (activeTab) activeTab.classList.add('active');
        
        // Update view content visibility
        const viewContents = tray.querySelectorAll('.tray-view-content');
        viewContents.forEach(vc => vc.classList.add('hidden'));
        const activeView = tray.querySelector(`.${mode}-view`);
        if (activeView) activeView.classList.remove('hidden');

        // Lazy tabs: first view triggers the deferred initial render (renderPanels
        // skips enabled-but-inactive journal/party tabs until they're actually opened)
        const lazyPanelByMode = {
            party: this.partyPanel
        };
        const lazyPanel = lazyPanelByMode[mode];
        if (lazyPanel && !lazyPanel._hasRenderedOnce) {
            lazyPanel._hasRenderedOnce = true;
            await lazyPanel.render(tray);
        }
        if (mode === 'party'
            && this.partyStatsPanel
            && !this.partyStatsPanel._hasRenderedOnce
            && game.settings.get(MODULE.ID, 'showPartyStatsPanel')) {
            this.partyStatsPanel._hasRenderedOnce = true;
            await this.partyStatsPanel.render(tray);
        }
        
        // Update tools toolbar visibility
        const toolsToolbar = tray.querySelector('.tray-tools-toolbar');
        if (toolsToolbar) {
            if (mode !== 'party') {
                toolsToolbar.classList.add('hidden');
            } else {
                toolsToolbar.classList.remove('hidden');
            }
        }
        
        // Update handle content using HandleManager to avoid code duplication
        await this.handleManager.updateHandle();
    }

    // Helper method to get the appropriate icon based on item type
    _getDropIcon(type) {
        switch(type) {
            case 'spell': return 'fa-solid fa-stars';
            case 'weapon': return 'fa-solid fa-swords';
            case 'feat': return 'fa-solid fa-sparkles';
            default: return 'fa-solid fa-backpack';
        }
    }

    // Helper method to get the appropriate title based on item type
    _getDropTitle(type) {
        switch(type) {
            case 'spell': return 'New Spell Added';
            case 'weapon': return 'New Weapon Added';
            case 'feat': return 'New Feature Added';
            default: return 'New Item Added';
        }
    }

    /**
     * Toggle visibility of a category
     * @param {string} categoryId - The ID of the category to toggle
     * @param {HTMLElement} panel - The panel element containing the category
     * @param {boolean} [active] - Optional force state (true = show, false = hide)
     */
    toggleCategory(categoryId, panel, active = null) {
        const filter = panel.querySelector(`[data-filter-id="${categoryId}"]`);
        const rows = panel.querySelectorAll(`.panel-item[data-category-id="${categoryId}"]`);
        
        // If active is not provided, toggle based on current state
        const shouldBeActive = active !== null ? active : !filter?.classList.contains('active');
        
        // Update filter button state
        if (filter) {
            if (shouldBeActive) {
                filter.classList.add('active');
                this.hiddenCategories.delete(categoryId);
            } else {
                filter.classList.remove('active');
                this.hiddenCategories.add(categoryId);
            }
        }

        // Stamp only the rows. Headers are derived from row state by
        // _updateHeadersVisibility, so a collapsed category and an active search
        // can both have their say instead of the later one winning.
        rows.forEach(row => setRowFilter(row, 'category', !shouldBeActive));

        this._updateHeadersVisibility(panel);
    }

    /**
     * Update visibility of category headers based on visible items
     * @param {HTMLElement} panel - The panel element
     * @private
     */
    _updateHeadersVisibility(panel) {
        const headers = panel.querySelectorAll('.category-header');
        
        headers.forEach(header => {
            const categoryId = header.dataset.categoryId;
            if (this.hiddenCategories.has(categoryId)) {
                header.style.display = 'none';
                return;
            }

            // Scoped to the header's own group where there is one. The
            // inventory's bag view repeats every category once per container, so
            // a panel-wide row query would keep an empty "Tools" heading in one
            // bag alive because a different bag has tools in it.
            const scope = header.closest('.inventory-group') ?? panel;
            const rows = scope.querySelectorAll(`.panel-item[data-category-id="${categoryId}"]`);
            const hasVisibleItems = Array.from(rows).some(isRowVisible);

            header.style.display = hasVisibleItems ? '' : 'none';
        });

        // A bag whose every row is filtered away takes its own heading with it,
        // rather than leaving a label over nothing.
        panel.querySelectorAll('.inventory-group').forEach(group => {
            const rows = group.querySelectorAll('.panel-item');
            const hasVisibleItems = Array.from(rows).some(isRowVisible);
            group.style.display = hasVisibleItems ? '' : 'none';
        });
    }

    /**
     * Reset all categories to visible
     * @param {HTMLElement} panel - The panel element
     */
    resetCategories(panel) {
        if (!panel) return; // v13: Guard against undefined panel
        this.hiddenCategories.clear();
        const filters = panel.querySelectorAll('[data-filter-id]');
        filters.forEach(filter => {
            filter.classList.add('active');
            this.toggleCategory(filter.dataset.filterId, panel, true);
        });
    }

    /**
     * Actors the current (non-GM) user can switch the tray to — any actor they own,
     * including NPCs like pets/companions, not just characters. Sorted assigned
     * character first, then characters, then the rest.
     * Shown when the user owns 2+ actors, or owns any while the tray has no actor
     * (so the no-character state doubles as a recovery path). GMs are selection-driven.
     * @returns {Array<{id, name, img, active}>|null}
     */
    static getOwnedCharacters(currentActor = null) {
        if (game.user.isGM) return null;
        const owned = game.actors.filter(a => a.isOwner);
        if (!owned.length) return null;
        if (owned.length < 2 && currentActor) return null;
        const assignedId = game.user.character?.id;
        const rank = (a) => a.id === assignedId ? 0 : (a.type === 'character' ? 1 : 2);
        const hasToken = (a) => (a.getActiveTokens?.()?.length ?? 0) > 0;
        // Group on-canvas actors before off-canvas ones; assigned/characters/rest within each group
        owned.sort((a, b) =>
            (hasToken(b) - hasToken(a)) || (rank(a) - rank(b)) || a.name.localeCompare(b.name));
        const chips = owned.map(a => ({
            id: a.id,
            name: a.name,
            img: a.img,
            active: a.id === currentActor?.id,
            onScene: hasToken(a)
        }));
        // Divider renders before the first off-canvas chip (only when both groups exist)
        const firstOff = chips.findIndex(c => !c.onScene);
        if (firstOff > 0) chips[firstOff].divider = true;
        return chips;
    }

    /**
     * Switch the tray to one of the user's owned characters (character switcher chips).
     * Remembers the choice so canvas fallbacks (scene load, token deletion) prefer it.
     */
    static async switchToCharacter(actorId) {
        const actor = game.actors.get(actorId);
        if (!actor || !actor.isOwner) return;
        try { await game.user.setFlag(MODULE.ID, 'lastCharacterId', actorId); } catch (_) {}
        // Sync canvas selection BEFORE rebuilding: initialize() ends by aligning the tray
        // to the current selection (_updateTrayFromSelection), so a stale selection
        // would snap the freshly built tray straight back to the previously selected token.
        // Select the character's token if it has one on the viewed scene; otherwise release
        // the current selection.
        const token = actor.getActiveTokens?.()?.[0];
        if (token?.control) {
            token.control({ releaseOthers: true });
        } else {
            canvas.tokens?.releaseAll?.();
        }
        await PanelManager.initialize(actor, { force: true });
    }

    // Add this new method for cleanup
    // Returns true when anything expired or was cleared, so callers can skip rerenders on idle sweeps.
    static cleanupNewlyAddedItems() {
        const actor = game.actors.get(PanelManager.currentActor?.id);
        const actorNeedsFlagSweep = !!actor && PanelManager._lastFlagSweepActorId !== actor.id;

        // Idle world: nothing tracked and the current actor's flags were already swept
        if (PanelManager.newlyAddedItems.size === 0 && !actorNeedsFlagSweep) return false;

        let changed = false;
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds

        // First clean up items in the Map
        for (const [itemId, timestamp] of PanelManager.newlyAddedItems) {
            if (timestamp < fiveMinutesAgo) {
                PanelManager.newlyAddedItems.delete(itemId);
                changed = true;
                // Also clear the isNew flag
                const item = actor?.items.get(itemId);
                if (item) {
                    item.unsetFlag(MODULE.ID, 'isNew');
                }
            }
        }

        // Then check for any items with the isNew flag that aren't in the Map.
        // Flags persist across reloads while the Map is in-memory, so sweep once per actor.
        if (actorNeedsFlagSweep) {
            PanelManager._lastFlagSweepActorId = actor.id;
            for (const item of actor.items) {
                const isNew = item.getFlag(MODULE.ID, 'isNew');
                if (isNew && !PanelManager.newlyAddedItems.has(item.id)) {
                    // If the item has the flag but isn't in the Map, clear the flag
                    item.unsetFlag(MODULE.ID, 'isNew');
                    changed = true;
                }
            }
        }

        return changed;
    }

    // Add this new method to mark an item as new
    static async markItemAsNew(itemId, actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const item = actor.items.get(itemId);
        if (!item) return;
        
        // Set a flag on the item to mark it as new
        await item.setFlag(MODULE.ID, 'isNew', true);
        
        // Also update the static Map for backward compatibility
        PanelManager.newlyAddedItems.set(itemId, Date.now());
    }

    // Add this new method to clear the new status
    static async clearNewStatus(itemId, actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const item = actor.items.get(itemId);
        if (!item) return;
        
        // Clear the flag
        await item.unsetFlag(MODULE.ID, 'isNew');
        
        // Also update the static Map for backward compatibility
        PanelManager.newlyAddedItems.delete(itemId);
    }

    // Add this new method to complete an item transfer between actors
    async _completeItemTransfer(sourceActor, targetActor, sourceItem, quantityToTransfer, hasQuantity) {
        // Container guard at the mutation, not only at the drop handlers.
        // Entry-point checks are for giving a good message early; this is the
        // one that cannot be routed around, whichever path got here.
        const packed = getTransferBlocker(sourceItem, sourceActor);
        if (packed) {
            showSquireToast('Unpack it first', {
                subtitle: packed.message,
                icon: 'fa-solid fa-box-open',
                color: '#e0a53c'
            });
            return false;
        }

        // The quantity was chosen in a client-side dialog and can be stale by the
        // time it reaches the mutation — the stack may have been spent, sold, or
        // partly handed to someone else since. Unchecked, the create below mints
        // the full requested amount while the delete below removes the source
        // stack, turning a stale client value into duplicated items.
        const available = sourceItem.system?.quantity ?? 1;
        if (quantityToTransfer > available) {
            showSquireToast('Not enough left', {
                subtitle: `${getActorDisplayName(sourceActor)} has only ${available} ${sourceItem.name}.`,
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return false;
        }

        // Create a copy of the item data to transfer
        const transferData = sourceItem.toObject();
        if (hasQuantity) {
            transferData.system.quantity = quantityToTransfer;
        }
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [transferData]);
        if (hasQuantity && quantityToTransfer < sourceItem.system.quantity) {
            await sourceItem.update({
                'system.quantity': sourceItem.system.quantity - quantityToTransfer
            });
        } else {
            await sourceItem.delete();
        }
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
        }
        
        // Create chat messages for direct transfer completion
        try {
            // One card, whispered to everyone involved.
            //
            // This used to send a "You sent…" card to the source's owners and a
            // separate "You received…" card to the target's, plus a GM copy —
            // up to three messages describing one event, and every GM saw all of
            // them. The third-person wording reads correctly for all three
            // audiences, so one message says the same thing once.
            const sourceUsers = game.users.filter(user => sourceActor.ownership?.[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            const targetUsers = game.users.filter(user => targetActor.ownership?.[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            const gmUsers = game.users.filter(u => u.isGM);
            const receiverIds = [...new Set([
                ...sourceUsers.map(u => u.id),
                ...targetUsers.map(u => u.id),
                ...gmUsers.map(u => u.id)
            ])];

            const payload = {
                sourceActorId: sourceActor.id,
                sourceActorName: getActorDisplayName(sourceActor),
                targetActorId: targetActor.id,
                targetActorName: getActorDisplayName(targetActor),
                itemId: sourceItem.id,
                itemName: sourceItem.name,
                quantity: quantityToTransfer,
                hasQuantity: hasQuantity,
                isPlural: quantityToTransfer > 1,
                receiverIds
            };

            const socket = game.modules.get(MODULE.ID)?.socket;
            if (socket) {
                await socket.executeAsGM('createTransferCompleteChat', payload);
            } else {
                // No socket: a player cannot whisper on someone else's behalf,
                // so this only reaches whoever is looking. Better than silence.
                await transferComplete({
                    ...payload,
                    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
                    whisper: receiverIds
                });
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error creating transfer complete chat message:', error);
        }
    }

    /**
     * Clean up old instance before creating new one to prevent memory leaks
     * @private
     */
    static _cleanupOldInstance() {
        if (!PanelManager.instance) return;
        
        // Destroy individual panels to clean up their hooks and event listeners
        if (PanelManager.instance.gmPanel && typeof PanelManager.instance.gmPanel.destroy === 'function') {
            PanelManager.instance.gmPanel.destroy();
        }
        if (PanelManager.instance.characterPanel && typeof PanelManager.instance.characterPanel.destroy === 'function') {
            PanelManager.instance.characterPanel.destroy();
        }
        if (PanelManager.instance.partyPanel && typeof PanelManager.instance.partyPanel.destroy === 'function') {
            PanelManager.instance.partyPanel.destroy();
        }
        if (PanelManager.instance.partyStatsPanel && typeof PanelManager.instance.partyStatsPanel.destroy === 'function') {
            PanelManager.instance.partyStatsPanel.destroy();
        }
        if (PanelManager.instance.handleManager && typeof PanelManager.instance.handleManager.destroy === 'function') {
            PanelManager.instance.handleManager.destroy();
        }
        
        // Clean up other panels that might have event listeners
        if (PanelManager.instance.buildsPanel && typeof PanelManager.instance.buildsPanel.destroy === 'function') {
            PanelManager.instance.buildsPanel.destroy();
        }
        if (PanelManager.instance.favoritesPanel && typeof PanelManager.instance.favoritesPanel.destroy === 'function') {
            PanelManager.instance.favoritesPanel.destroy();
        }
        if (PanelManager.instance.spellsPanel && typeof PanelManager.instance.spellsPanel.destroy === 'function') {
            PanelManager.instance.spellsPanel.destroy();
        }
        if (PanelManager.instance.weaponsPanel && typeof PanelManager.instance.weaponsPanel.destroy === 'function') {
            PanelManager.instance.weaponsPanel.destroy();
        }
        if (PanelManager.instance.inventoryPanel && typeof PanelManager.instance.inventoryPanel.destroy === 'function') {
            PanelManager.instance.inventoryPanel.destroy();
        }
        if (PanelManager.instance.featuresPanel && typeof PanelManager.instance.featuresPanel.destroy === 'function') {
            PanelManager.instance.featuresPanel.destroy();
        }
        if (PanelManager.instance.characterSummaryPanel && typeof PanelManager.instance.characterSummaryPanel.destroy === 'function') {
            PanelManager.instance.characterSummaryPanel.destroy();
        }
        if (PanelManager.instance.controlPanel && typeof PanelManager.instance.controlPanel.destroy === 'function') {
            PanelManager.instance.controlPanel.destroy();
        }
        
        // Clear the old instance reference
        PanelManager.instance = null;
        PanelManager.gmDetails = {
            resistances: [],
            immunities: [],
            biography: '',
            biographyHtml: ''
        };
    }

    /**
     * Comprehensive cleanup method to prevent memory leaks
     */
    static cleanup() {
        // Clear all intervals
        PanelManager._intervals.forEach(intervalId => {
            clearTrackedInterval(intervalId);
        });
        PanelManager._intervals.clear();

        // Clear all timeouts
        PanelManager._timeouts.forEach(timeoutId => {
            clearTrackedTimeout(timeoutId);
        });
        PanelManager._timeouts.clear();

        // Remove all event listeners
        PanelManager._eventListeners.forEach(({ element, event, handler }, key) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        PanelManager._eventListeners.clear();

        // `_cleanupInterval` is cleared with the rest of `_intervals` above; only null the handle.
        PanelManager._cleanupInterval = null;

        // Clear the newly added items map
        PanelManager.newlyAddedItems.clear();

        // Destroy all panels and null the instance
        PanelManager._cleanupOldInstance();

        // Remove the tray element
        if (PanelManager.element) {
            PanelManager.element.remove();
            PanelManager.element = null;
        }

        // Reset static properties
        PanelManager.instance = null;
        PanelManager.currentActor = null;
        PanelManager.isPinned = false;
        PanelManager.viewMode = 'player';
        PanelManager._initializationInProgress = false;
        PanelManager._lastInitTime = 0;

        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'PanelManager cleanup completed',
            {},
            false,
            false
        );
    }

    /**
     * Track a timeout for cleanup
     */
    static trackTimeout(timeoutId) {
        registerTimeoutId(timeoutId);
        PanelManager._timeouts.add(timeoutId);
        return timeoutId;
    }

    /**
     * Track an interval for cleanup
     */
    static trackInterval(intervalId) {
        registerIntervalId(intervalId);
        PanelManager._intervals.add(intervalId);
        return intervalId;
    }

    /**
     * Track an event listener for cleanup
     */
    static trackEventListener(element, event, handler) {
        const key = `${element.id || 'unknown'}-${event}`;
        PanelManager._eventListeners.set(key, { element, event, handler });
        return key;
    }

    // Utility to remove a panel's DOM from the tray
    static removePanelDom(panel) {
        if (panel && panel.element) {
            // v13: Use native DOM instead of jQuery
            let nativeElement = panel.element;
            if (panel.element.jquery || typeof panel.element.find === 'function') {
                nativeElement = panel.element[0] || panel.element.get?.(0) || panel.element;
            }
            
            const panelName = panel.constructor.name.toLowerCase();
            const dom = nativeElement.querySelector(`#${panelName}-panel, .${panelName}-panel`);
            if (dom) dom.remove();
        }
    }

    static setGmDetails(details) {
        PanelManager.gmDetails = {
            resistances: details?.resistances ?? [],
            immunities: details?.immunities ?? [],
            biography: details?.biography ?? '',
            biographyHtml: details?.biographyHtml ?? ''
        };

        if (game.user.isGM && PanelManager.instance?.gmPanel?.element) {
            PanelManager.instance.gmPanel.render(
                PanelManager.instance.gmPanel.element,
                PanelManager.gmDetails
            );
        }
    }
    
    /**
     * Register panels with HookManager
     * @private
     */
    _registerPanelsWithHookManager() {
        try {
            // Import HookManager dynamically to avoid circular dependencies
            // Panel registration is now handled by Blacksmith HookManager
            // No need to register panels with local HookManager
        } catch (error) {
            console.error('Error registering panels with HookManager:', error);
        }
    }

    /**
     * Check if the current view mode should have fade animations
     * Only player and party views need fade animations when changing tokens
     * @private
     * @returns {boolean} True if fade animation should be applied
     */
    _shouldApplyFadeAnimation() {
        return PanelManager.viewMode === 'player' || PanelManager.viewMode === 'party';
    }

    /**
     * Apply fade-out animation to tray panel wrapper if appropriate
     * @private
     */
    _applyFadeOutAnimation() {
        if (this._shouldApplyFadeAnimation() && PanelManager.element) {
            // v13: Use native DOM instead of jQuery
            const trayPanelWrapper = PanelManager.element?.querySelector('.tray-panel-wrapper');
            if (trayPanelWrapper) {
                trayPanelWrapper.classList.add('content-updating');
            }
        }
    }

    /**
     * Apply fade-in animation to tray panel wrapper if appropriate
     * @private
     */
    _applyFadeInAnimation() {
        if (this._shouldApplyFadeAnimation() && PanelManager.element) {
            // v13: Use native DOM instead of jQuery
            const trayPanelWrapper = PanelManager.element?.querySelector('.tray-panel-wrapper');
            if (trayPanelWrapper) {
                trayPanelWrapper.classList.remove('content-updating');
                trayPanelWrapper.classList.add('content-updated');
                
                // Remove the content-updated class after animation completes
                trackModuleTimeout(() => {
                    trayPanelWrapper.classList.remove('content-updated');
                }, 200);
            }
        }
    }
}

// =====================================================
// ======================  Hooks  ======================    
// =====================================================

// Consolidated initialization function - called after settings are registered
async function initializeSquireAfterSettings() {
    // Try to find a suitable actor in this order:
    // 1. Currently controlled token(s) - prioritizing player character tokens
    // 2. User's default character
    // 3. First owned character-type token
    // 4. Any owned token
    let initialActor = null;
    let selectionReason = "";
    
    // 1. Check for controlled tokens
    const controlledTokens = canvas.tokens?.controlled.filter(t => t.actor?.isOwner);
    if (controlledTokens?.length > 0) {
        // First check for player character tokens
        const playerTokens = controlledTokens.filter(t => t.actor?.type === 'character' && t.actor?.hasPlayerOwner);
        
        if (playerTokens.length > 0) {
            // Use the most recent player token (last one in the array)
            initialActor = playerTokens[playerTokens.length - 1].actor;
            selectionReason = "most recent player character token";
        } else {
            // Use the most recent controlled token
            initialActor = controlledTokens[controlledTokens.length - 1].actor;
            selectionReason = "most recent controlled token";
        }
    }
    
    // 2. Try default character if no controlled token
    if (!initialActor) {
        initialActor = game.user.character;
        if (initialActor) {
            selectionReason = "default character";
        }
    }
    
    // 3. Try to find first owned character token
    if (!initialActor) {
        const characterToken = canvas.tokens?.placeables.find(token => 
            token.actor?.isOwner && token.actor?.type === 'character'
        );
        initialActor = characterToken?.actor;
        if (initialActor) {
            selectionReason = "first owned character token";
        }
    }
    
    // 4. Fall back to any owned token
    if (!initialActor) {
        const anyToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        initialActor = anyToken?.actor;
        if (initialActor) {
            selectionReason = "first owned token";
        }
    }

    // Initialize with the found actor
    if (initialActor) {
        if (PanelManager.element) {
            // v13: Use native classList instead of jQuery
            PanelManager.element.classList.remove('expanded');
        }
        
        // initialize() ends in createTray(), which builds the tray from scratch — there
        // is nothing left to refresh. This used to be followed by an updateTray() call
        // ("force a complete tray refresh") that was a silent no-op for as long as
        // instance.element was null; now that the getter makes updateTray() reachable,
        // keeping it would rebuild the whole tray a second time on every startup.
        await PanelManager.initialize(initialActor);

        PanelManager.expandTray();
    }
}

// Note: controlToken hook is now managed centrally by HookManager

// Helper function to update selection display
export async function _updateSelectionDisplay() {
    if (!PanelManager.instance || !PanelManager.element) return;

    // Legacy shared selection wrapper has been removed.
    // Clean up any stale DOM from older renders.
    PanelManager.element.querySelector('.tray-selection-wrapper')?.remove();
}

// Helper function to update health panel from current selection
/**
 * Re-point the tray at the current canvas selection.
 *
 * Named for the health panel until that window moved to Blacksmith, which is
 * all it used to do on top of this — the tray re-pointing was the part that
 * mattered and the part that stayed.
 */
export async function _updateTrayFromSelection() {
    // Get a list of all controlled tokens that the user owns
    const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    
    // If no tokens are controlled, return
    if (!controlledTokens.length) return;

    // Determine which token to use for primary operations:
    // - If the list includes player-owned characters, use the most recent player character
    // - Otherwise, use the most recently selected token
    let tokenToUse = controlledTokens[0]; // Default to the first token
   
    // Look for player character tokens
    const playerTokens = controlledTokens.filter(t => t.actor?.type === 'character' && t.actor?.hasPlayerOwner);
    
    if (playerTokens.length > 0) {
        // Use the most recent player token (last one in the array)
        tokenToUse = playerTokens[playerTokens.length - 1];
    }

    // Use the actor from the primary token for the tray
    const actorToUse = tokenToUse.actor;

    // EARLY RETURN OPTIMIZATION: Skip expensive operations if nothing changed
    // This prevents lag during multi-select when selecting same-type tokens
    const actorUnchanged = PanelManager.currentActor?.id === actorToUse.id;
    const actorChanged = !actorUnchanged;
    // Token set last seen by this function. It used to be read off the health
    // panel's list, which Blacksmith owns now; the diff is still what keeps
    // multi-select from rebuilding the tray per token.
    const currentTokenIds = (PanelManager._lastControlledTokenIds || []).slice().sort();
    const newTokenIds = controlledTokens.map(t => t.id).sort();
    const tokensUnchanged = JSON.stringify(currentTokenIds) === JSON.stringify(newTokenIds);
    PanelManager._lastControlledTokenIds = newTokenIds;
    
    if (actorUnchanged) {
        if (tokensUnchanged) {
            // Nothing meaningful changed - skip all expensive operations
            return;
        }
    }

    // Store the current tray state before initializing
    // v13: Use native DOM classList instead of jQuery hasClass
    const wasExpanded = PanelManager.element?.classList.contains('expanded') || false;
    
    // Check if we need to change actors
    if (actorChanged) {
        // Actor changed - update the instance without recreating the tray
        
        // Add fade-out animation to tray panel wrapper if appropriate
        if (PanelManager.instance) {
            PanelManager.instance._applyFadeOutAnimation();
        }
        
        PanelManager.currentActor = actorToUse;
        if (PanelManager.instance) {
            PanelManager.instance.actor = actorToUse;
            
            // Update the actor reference in all panel instances
            if (PanelManager.instance.characterPanel) PanelManager.instance.characterPanel.actor = actorToUse;
            if (PanelManager.instance.controlPanel) PanelManager.instance.controlPanel.actor = actorToUse;
            if (PanelManager.instance.favoritesPanel) PanelManager.instance.favoritesPanel.actor = actorToUse;
            if (PanelManager.instance.buildsPanel) PanelManager.instance.buildsPanel.actor = actorToUse;
            if (PanelManager.instance.spellsPanel) PanelManager.instance.spellsPanel.actor = actorToUse;
            if (PanelManager.instance.weaponsPanel) PanelManager.instance.weaponsPanel.actor = actorToUse;
            if (PanelManager.instance.inventoryPanel) PanelManager.instance.inventoryPanel.actor = actorToUse;
            if (PanelManager.instance.featuresPanel) PanelManager.instance.featuresPanel.actor = actorToUse;
            if (PanelManager.instance.characterSummaryPanel) PanelManager.instance.characterSummaryPanel.actor = actorToUse;
            
            // Update the handle manager's actor reference
            if (PanelManager.instance.handleManager) {
                PanelManager.instance.handleManager.updateActor(actorToUse);
            }
        }
    }
    
    // Force refresh of items collection to ensure up-to-date handle favorites
    if (PanelManager.instance && PanelManager.instance.actor?.items && typeof PanelManager.instance.actor.items._flush === 'function') {
        await PanelManager.instance.actor.items._flush();
    }
    
    // Always update the handle for the new actor
    if (PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
    
    // Re-render only actor-dependent panels with the new actor data.
    if (actorChanged && PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.renderActorPanels(PanelManager.element);
    }
    
    // Add fade-in animation to tray panel wrapper after update if appropriate
    if (PanelManager.instance) {
        PanelManager.instance._applyFadeInAnimation();
    }
    
    // Re-open the tray only if it was open before the selection changed. A pinned
    // tray never closed, so it has nothing to restore.
    if (wasExpanded && !PanelManager.isPinned) {
        PanelManager.expandTray();
    }


}

// Note: closeGame hook is now managed centrally by HookManager

// Note: disableModule hook is now managed centrally by HookManager

// Note: canvasReady hook is now managed centrally by HookManager


// Note: createToken hook is now managed centrally by HookManager

