import { MODULE } from './const.js';

/**
 * TILE FOOTPRINTS, FOR EVERY PANEL THAT HAS TILES.
 *
 * Favourites and Builds both let a tile take more than one cell, and both put
 * the choice behind the same `Tile Size` flyout. That was written twice — the
 * same four values, the same four icons, the same read/write pair differing
 * only in which flag it stored under, and the same menu entry down to the
 * `×` in the label.
 *
 * Nothing linked the two copies. Adding a fifth footprint, swapping an icon or
 * changing how the default is stored would have landed in one panel and not
 * the other, and the two menus would have quietly stopped agreeing. This is
 * that vocabulary in one place, with the one genuine difference — the flag a
 * panel stores its spans under — passed in.
 *
 * The CSS half of the same idea is `styles/tray-tiles.css`, keyed on
 * `squire-tile-grid`.
 */

/**
 * The footprints a tile can take, as `columns x rows`.
 *
 * Width first, height second, the way CSS grid reads: `2x1` is two cells wide
 * and one tall. Order here is the order they appear in the menu.
 */
export const TILE_SPANS = ['1x1', '2x1', '1x2', '2x2'];

/** The default, and the one stored as absence rather than as a value. */
export const DEFAULT_TILE_SPAN = '1x1';

/** The glyph for each footprint — the shape it makes, not an abstraction of it. */
export const TILE_SPAN_ICONS = {
    '1x1': 'fa-square',
    '2x1': 'fa-rectangle-wide',
    '1x2': 'fa-rectangle-vertical',
    '2x2': 'fa-table-cells-large'
};

/** `2x1` as the menu says it. */
const spanLabel = span => span.replace('x', ' × ');

/**
 * How much of the grid one tile takes.
 *
 * Stored per actor in a map under `flagKey`, rather than on the item or the
 * build it describes, because it is a fact about a panel's layout and not
 * about the longsword. Writing it to a document would also put a Squire key on
 * something that may be shared, moved or exported, to say something that means
 * nothing outside this grid.
 *
 * Keys for things no longer in the panel are simply ignored on read. They cost
 * a few bytes, and clearing them on removal would mean the heart silently
 * discarding a layout choice that comes straight back the moment the item is
 * favourited again.
 */
export function getTileSpan(actor, flagKey, id) {
    const spans = actor?.getFlag(MODULE.ID, flagKey) || {};
    const span = spans[id];
    return TILE_SPANS.includes(span) ? span : DEFAULT_TILE_SPAN;
}

export async function setTileSpan(actor, flagKey, id, span) {
    if (!actor || !id || !TILE_SPANS.includes(span)) return;

    const spans = { ...(actor.getFlag(MODULE.ID, flagKey) || {}) };
    // The default is stored as absence. Otherwise every tile anybody ever
    // touched would sit in the map saying "ordinary", and the map would only
    // ever grow.
    if (span === DEFAULT_TILE_SPAN) delete spans[id];
    else spans[id] = span;

    await actor.setFlag(MODULE.ID, flagKey, spans);
}

/**
 * The `Tile Size` entry, as a flyout.
 *
 * The four footprints are one question with four answers, and four sibling
 * rows in the top level would have read as four unrelated commands.
 *
 * Callers decide whether to offer it at all — neither panel does in the list
 * layout, because offering to make a list row two cells tall would be offering
 * nothing — and callers push their own separator, because where it sits in the
 * menu is a decision about that menu.
 */
export function tileSizeMenuEntry({ current, onPick }) {
    return {
        name: 'Tile Size',
        icon: 'fa-solid fa-up-right-and-down-left-from-center',
        description: spanLabel(current),
        submenu: TILE_SPANS.map(span => ({
            name: spanLabel(span),
            icon: `fa-solid ${TILE_SPAN_ICONS[span]}`,
            // The current size is shown but not clickable, so the menu says
            // which one you are on instead of leaving you to infer it from the
            // tile — and clicking it cannot be a silent no-op that looks like a
            // failure.
            disabled: span === current,
            callback: () => onPick(span)
        }))
    };
}
