import { MODULE } from './const.js';

/**
 * Where the live codex / notes panels are, and how to reach them.
 *
 * These panels are rendered by whatever is hosting them — today the tray,
 * shortly their own windows — and a dozen callers across the pin manager, the
 * notification watcher, and the editor windows need to re-render or reveal one.
 * Those callers used to reach through `api.PanelManager.instance.codexPanel`,
 * which hard-codes both the host (the tray) and the way to bring a panel into
 * view (switch the tray's view mode). Neither survives the move to windows.
 *
 * The host registers itself here and supplies the two things only it can know:
 * which element the panel renders into, and what "show me this panel" means. A
 * caller then asks for a kind, not for the tray.
 *
 * Kinds: 'codex' | 'notes'.
 */

/** @type {Map<string, {panel: object, getElement: () => (HTMLElement|null), reveal: () => (void|Promise<void>)}>} */
const hosts = new Map();

/**
 * Register the live panel for a kind, replacing any previous registration.
 *
 * Called by the host on every rebuild, since panel instances are recreated when
 * the tray (or window) rebuilds and a stale instance renders into a detached
 * element that nobody sees.
 *
 * @param {string} kind
 * @param {object} host
 * @param {object} host.panel - the panel instance
 * @param {() => (HTMLElement|null)} host.getElement - the element to render into
 * @param {() => (void|Promise<void>)} [host.reveal] - bring the panel into view
 */
export function registerCampaignPanel(kind, { panel, getElement, reveal } = {}) {
    if (!kind || !panel || typeof getElement !== 'function') return;
    hosts.set(kind, { panel, getElement, reveal: typeof reveal === 'function' ? reveal : null });
}

/** Drop a registration. Safe to call for a kind that was never registered. */
export function unregisterCampaignPanel(kind) {
    hosts.delete(kind);
}

/** The live panel instance for a kind, or null. */
export function getCampaignPanel(kind) {
    return hosts.get(kind)?.panel ?? null;
}

/**
 * The element the panel renders into, or null when it has no host yet.
 *
 * Null is the normal answer for a panel whose host isn't open, not an error —
 * callers are expected to skip rather than warn.
 */
export function getCampaignPanelElement(kind) {
    const host = hosts.get(kind);
    if (!host) return null;
    try {
        return host.getElement() ?? null;
    } catch (error) {
        console.error(`${MODULE.ID}: campaign panel host for '${kind}' failed to supply an element:`, error);
        return null;
    }
}

/**
 * Re-render a panel into its host, if both exist. Returns whether it rendered,
 * so a caller can fall back when the panel isn't on screen.
 */
export async function refreshCampaignPanel(kind) {
    const panel = getCampaignPanel(kind);
    const element = getCampaignPanelElement(kind);
    if (!panel || !element || typeof panel.render !== 'function') return false;
    await panel.render(element);
    return true;
}

/**
 * Bring a panel into view and re-render it — the "a pin was clicked, show me
 * that entry" path. What revealing means belongs to the host: switching the
 * tray's view mode today, focusing a window later.
 */
export async function revealCampaignPanel(kind) {
    let host = hosts.get(kind);

    // Nothing hosting it means the browser window isn't open. Clicking a pin
    // should open that browser window, not silently do nothing — so ask the
    // opener, then look again. Registration happens during that window's first
    // render, which is awaited here.
    if (!host) {
        const open = game.modules.get(MODULE.ID)?.api?.openCampaignBrowser;
        if (typeof open !== 'function') return false;
        try {
            await open(kind);
        } catch (error) {
            console.error(`${MODULE.ID}: failed to open the '${kind}' browser:`, error);
            return false;
        }
        host = hosts.get(kind);
        if (!host) return false;
    }
    if (host.reveal) {
        try {
            await host.reveal();
        } catch (error) {
            console.error(`${MODULE.ID}: campaign panel host for '${kind}' failed to reveal:`, error);
        }
    }
    return refreshCampaignPanel(kind);
}
