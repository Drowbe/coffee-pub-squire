/**
 * Codex Pin Event Handlers for Blacksmith Pin API
 *
 * Registers a left-click handler that opens the Codex panel and scrolls to
 * the matching entry. Right-click uses Blacksmith's default context menu
 * (no custom items registered here).
 */

import { MODULE } from './const.js';
import { getPinsApi, isPinsApiAvailable } from './utility-quest-pins.js';
import { reconcileCodexPins } from './utility-codex-pins.js';
import { trackModuleTimeout } from './timer-utils.js';

let codexPinEventsRegistered  = false;
let codexPinClickDisposer     = null;
let codexPinHandlerController = null;
let codexPinSyncRegistered    = false;
let codexPinSceneSyncHookId   = null;
let codexPinSyncDebounceTimer = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Scroll the codex panel to an entry, expand its category section, and briefly highlight it.
 * @param {string} entryUuid - Journal page UUID stored in the entry's data-uuid attribute
 * @returns {boolean} True if the entry element was found
 */
function focusCodexEntryInDom(entryUuid) {
    // NOTE: data-uuid is a plain attribute value string — do NOT use CSS.escape() here;
    // it would incorrectly escape dots in Foundry UUIDs and break the selector.
    const entry = document.querySelector(`.codex-entry[data-uuid="${entryUuid}"]`);
    if (!entry) return false;

    // Expand the containing category section if it is collapsed
    const section = entry.closest('.codex-section');
    if (section) section.classList.remove('collapsed');

    // Expand the entry itself and highlight it
    entry.classList.remove('collapsed');
    entry.classList.add('codex-highlighted');
    entry.scrollIntoView({ behavior: 'smooth', block: 'center' });

    trackModuleTimeout(() => {
        entry.classList.remove('codex-highlighted');
    }, 2000);

    return true;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register left-click handler for codex pins.
 * A single left click opens the Codex panel and navigates to the entry.
 * Call once per canvas-ready event.
 */
export async function registerCodexPinEvents() {
    const pins = getPinsApi();
    if (!pins || !isPinsApiAvailable()) return;
    if (codexPinEventsRegistered) return;

    if (typeof pins.whenReady === 'function') {
        try { await pins.whenReady(); } catch (_) {}
    }

    codexPinHandlerController = new AbortController();
    const signal = codexPinHandlerController.signal;

    codexPinClickDisposer = pins.on(
        'click',
        async (evt) => {
            try {
                let pin = evt?.pin ?? evt?.pinData;
                if (!pin && evt?.pinId && typeof pins.get === 'function') {
                    pin = pins.get(evt.pinId, evt.sceneId ? { sceneId: evt.sceneId } : undefined);
                }
                if (!pin) return;
                if (pin.moduleId != null && pin.moduleId !== MODULE.ID) return;

                // Key off config.codexUuid — only codex entry pins carry this field
                const codexUuid = pin.config?.codexUuid;
                if (!codexUuid) return;

                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                if (!panelManager) return;

                // Expand the tray if collapsed
                if (panelManager.element && !panelManager.element.classList.contains('expanded')) {
                    panelManager.element.classList.add('expanded');
                }

                // Switch to codex tab; always render afterward so entries are in the DOM
                if (typeof panelManager.setViewMode === 'function') {
                    await panelManager.setViewMode('codex');
                }
                if (panelManager.codexPanel && typeof panelManager.codexPanel.render === 'function' && panelManager.element) {
                    await panelManager.codexPanel.render(panelManager.element);
                }

                // Attempt focus immediately then retry a few times while render settles
                const tryFocus = () => focusCodexEntryInDom(codexUuid);
                tryFocus();
                trackModuleTimeout(tryFocus, 200);
                trackModuleTimeout(tryFocus, 500);
                trackModuleTimeout(tryFocus, 1000);
            } catch (err) {
                console.error('Coffee Pub Squire | codex pin click handler:', err);
            }
        },
        { moduleId: MODULE.ID, signal }
    );

    codexPinEventsRegistered = true;
}

/**
 * Unregister codex pin event handlers (teardown / module disable).
 */
export function unregisterCodexPinEvents() {
    if (codexPinHandlerController) {
        codexPinHandlerController.abort();
        codexPinHandlerController = null;
    }
    if (codexPinClickDisposer && typeof codexPinClickDisposer === 'function') {
        codexPinClickDisposer();
        codexPinClickDisposer = null;
    }
    codexPinEventsRegistered = false;
}

/**
 * Register Blacksmith pin hooks so codex page flags stay in sync with pin
 * lifecycle events (delete, unplace, etc.).
 */
export function registerCodexPinSync() {
    if (codexPinSyncRegistered) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const doSync = async (payload = {}) => {
        if (payload.moduleId && payload.moduleId !== MODULE.ID) return;
        await reconcileCodexPins({ sceneId: payload.sceneId });
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.codexPanel?.render && panelManager.element) {
            await panelManager.codexPanel.render(panelManager.element);
        }
    };

    const handle = (payload = {}) => {
        if (payload.moduleId && payload.moduleId !== MODULE.ID) return;
        if (codexPinSyncDebounceTimer) clearTimeout(codexPinSyncDebounceTimer);
        codexPinSyncDebounceTimer = trackModuleTimeout(() => {
            codexPinSyncDebounceTimer = null;
            doSync(payload);
        }, 50);
    };

    Hooks.on('blacksmith.pins.deleted',          handle);
    Hooks.on('blacksmith.pins.unplaced',         handle);
    Hooks.on('blacksmith.pins.placed',           handle);
    Hooks.on('blacksmith.pins.updated',          handle);
    Hooks.on('blacksmith.pins.created',          handle);
    Hooks.on('blacksmith.pins.deletedAll',       handle);
    Hooks.on('blacksmith.pins.deletedAllByType', handle);

    if (!codexPinSceneSyncHookId) {
        codexPinSceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || !changes?.flags) return;
            reconcileCodexPins({ sceneId: scene.id });
        });
    }

    codexPinSyncRegistered = true;
}
