// ============================================================================
// THE ITEM MENU
// ============================================================================
//
// One menu, every list row, five panels.
//
// The rows used to carry a control per action: a feather to read the item, a
// share to send it, a heart, a shield, a sun, a lightbulb, a sack, a warning.
// Eight glyphs on a 300px row, most of them pressed once a session, and the two
// that get pressed constantly — favourite and equip — buried among them.
//
// So the rare ones moved in here and the frequent ones stayed out there. The
// test is how often a thing is done, not how important it is: a toggle you flip
// every fight is worth a click, an action you take twice an evening is not.
//
// ONE BUILDER FOR EVERY PANEL, and that is the point of the file. Weapons,
// Spells, Inventory, Features and Favourites all show the same seven entries in
// the same order with the same words, and five copies of that would be five
// things to keep in step. Squire has already paid for that lesson twice — two
// placement loops that diverged and put a shield in a sheath.
//
// Every entry is CONDITIONAL on the item answering for it. A spell has no
// container, a feature cannot be sent, and an entry that does nothing is worse
// than an entry that is absent, because the reader has to try it to find out.
// ============================================================================

import { MODULE } from './const.js';
import { getBlacksmith, isContainerItem, getContainedItems, showSquireToast } from './helpers.js';
// A CYCLE, and a deliberate one: panel-favorites.js imports `buildItemMenu`
// from here so its own right-click menu can begin with the shared entries.
//
// It is safe because NOTHING in this file touches `FavoritesPanel` at module
// level — every use is inside a function body, by which time both modules have
// finished evaluating and the live binding is filled in. Adding a top-level use
// of it would break that silently, and ESM caches a failed module evaluation
// for the whole session, so the failure would take the window with it.
import { FavoritesPanel } from './panel-favorites.js';

const MENU_ID = `${MODULE.ID}-item-menu`;

/** The kinds of thing that can be equipped, sent, moved or deleted. */
const PHYSICAL = ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'backpack'];

/** What to call the thing, so the first entry names it rather than saying "item". */
function itemNoun(item) {
    switch (item?.type) {
        case 'weapon': return 'Weapon';
        case 'spell': return 'Spell';
        case 'feat': return 'Feature';
        case 'consumable': return 'Consumable';
        case 'tool': return 'Tool';
        case 'container':
        case 'backpack': return 'Container';
        case 'equipment': return 'Equipment';
        default: return 'Item';
    }
}

/**
 * Can this spell be prepared at all?
 *
 * Reads dnd5e's own table rather than a list of methods kept here — the same one
 * the Spells panel and the builder ask, so all three agree by construction. A
 * cantrip, an innate spell and an at-will one are cast by their own rules, and
 * offering to prepare any of them is offering a control that controls nothing.
 */
function canPrepare(item) {
    if (item?.type !== 'spell') return false;
    return Number(item.system?.level) > 0
        && !!CONFIG.DND5E?.spellcasting?.[item.system?.method]?.prepares;
}

/**
 * The containers this character carries, minus the item itself.
 *
 * A container cannot be put inside itself, and dnd5e will happily let you try —
 * the result is a bag that has vanished into its own mouth and can only be
 * recovered from the sheet.
 */
function containerOptions(actor, item) {
    return (actor?.items ?? [])
        .filter(candidate => isContainerItem(candidate) && candidate.id !== item?.id)
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Send this item to another character, through the transfer tool.
 *
 * The same route the send-to glyph used, lifted out of the two panels that had
 * a copy each so the menu does not become a third.
 */
async function sendItem(actor, item) {
    const { openItemTransferTool } = await import('./window-transfer-tool.js');
    const { TransferUtils } = await import('./transfer-utils.js');

    await openItemTransferTool({
        item,
        sourceActor: actor,
        onSubmit: async ({ targetActor, quantity }) => {
            // Re-read rather than trusting the item captured when the menu
            // opened: a menu can sit open while something else moves the item.
            const live = actor?.items?.get(item.id);
            if (!live) throw new Error(`${item.name} is no longer available.`);

            const completed = await TransferUtils.executeTransfer({
                sourceActor: actor,
                targetActor,
                item: live,
                quantity,
                hasQuantity: live.system.quantity !== undefined && live.system.quantity > 1
            });
            if (completed === false) throw new Error('The transfer could not be started.');
        }
    });
}

/** Ask before the one entry in this menu that cannot be undone. */
async function deleteItem(actor, item) {
    const confirmed = await getBlacksmith().dialog.confirm({
        title: `Delete ${itemNoun(item)}`,
        content: `<p>Delete <strong>${foundry.utils.escapeHTML(item.name)}</strong> from `
            + `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>?</p>`
            + (isContainerItem(item) && getContainedItems(item, actor).length
                ? '<p><strong>What is inside it comes out</strong> rather than going with it.</p>'
                : '')
            + '<p>This cannot be undone.</p>',
        confirmLabel: 'Delete',
        confirmIcon: 'fa-solid fa-trash',
        destructive: true
    });
    if (!confirmed) return;

    await item.delete();
}

/**
 * The menu for one row.
 *
 * Returns an array of entries; the caller shows it. Split from `showItemMenu`
 * so it can be tested and so a panel with something of its own to add has
 * somewhere to add it.
 */
export function buildItemMenu(actor, item) {
    if (!actor || !item) return [];

    const owns = actor.isOwner;
    const physical = PHYSICAL.includes(item.type);
    const noun = itemNoun(item);
    const entries = [];

    // WHAT YOU RIGHT-CLICKED, said at the top.
    //
    // A context menu opens near the cursor but not on it, and with nine entries
    // it is tall enough to drift a long way from the row that opened it — so by
    // the time you have read down to Delete, the thing you are about to delete
    // is off the top of your attention. The heading is the answer to "delete
    // WHAT", asked at the moment it matters.
    //
    // `information` rather than a disabled row: a disabled entry dims itself and
    // shows a not-allowed cursor, which says an action was taken away from you
    // rather than that you are reading a statement.
    entries.push({
        information: true,
        name: item.name,
        description: noun,
        icon: `<img class="context-menu-item-portrait" src="${foundry.utils.escapeHTML(item.img ?? '')}" alt="">`
    });

    entries.push({ separator: true });

    // FIRST of the actions, because it is the one that only reads. The row's
    // title does the same thing on a click; this is here for the reader who came
    // to the menu looking for it rather than knowing the title was live.
    entries.push({
        name: `View ${noun} Details`,
        icon: 'fa-solid fa-feather',
        callback: () => item.sheet?.render(true)
    });

    // Grouped with View Details because neither changes anything: one shows the
    // item, the other hands you a reference to it. Sending it to chat used to
    // sit here too and has moved down to join sending it to a person — the two
    // are one idea with two destinations, which is what a flyout is for.
    entries.push({
        name: 'Copy UUID Link',
        icon: 'fa-solid fa-link',
        callback: async () => {
            // `item.link` is the enricher form — `@UUID[...]{Name}` — which is
            // what you paste into a journal or a chat message and get a working
            // link with a readable name. The bare uuid is the fallback for a
            // document that has no link getter; it still resolves, it just
            // arrives as a wall of ids.
            const link = item.link ?? `@UUID[${item.uuid}]{${item.name}}`;
            await game.clipboard.copyPlainText(link);
            showSquireToast(item.name, {
                subtitle: 'Link copied to the clipboard',
                icon: 'fa-solid fa-link'
            });
        }
    });

    entries.push({ separator: true });

    const favourite = FavoritesPanel.getPanelFavorites(actor).includes(item.id);
    entries.push({
        name: favourite ? 'Remove from Favorites' : 'Add to Favorites',
        icon: favourite ? 'fa-solid fa-heart-crack' : 'fa-solid fa-heart',
        callback: () => FavoritesPanel.manageFavorite(actor, item.id)
    });

    // EQUIP or PREPARE, never both: an item has one of these questions or the
    // other, and dnd5e's own fields say which.
    if (owns && item.system?.equipped !== undefined) {
        entries.push({
            name: item.system.equipped ? `Unequip ${noun}` : `Equip ${noun}`,
            icon: 'fa-solid fa-shield-alt',
            callback: () => item.update({ 'system.equipped': !item.system.equipped })
        });
    } else if (owns && canPrepare(item)) {
        const prepared = Number(item.system?.prepared) > 0;
        entries.push({
            name: prepared ? 'Unprepare Spell' : 'Prepare Spell',
            icon: 'fa-solid fa-sun',
            callback: () => item.update({ 'system.prepared': prepared ? 0 : 1 })
        });
    }

    const onHandle = FavoritesPanel.getHandleFavorites(actor).includes(item.id);
    entries.push({
        name: onHandle ? 'Remove from Handle' : 'Add to Handle',
        icon: 'fa-solid fa-dagger',
        callback: async () => {
            const current = FavoritesPanel.getHandleFavorites(actor);
            await FavoritesPanel.setHandleFavorites(actor, onHandle
                ? current.filter(id => id !== item.id)
                : [...current, item.id]);
        }
    });

    // SEND, MOVE, DELETE — the three that change where a thing IS, fenced off
    // from the ones above that only change how it is marked.
    const containers = physical && owns ? containerOptions(actor, item) : [];
    const inContainer = !!item.system?.container;

    entries.push({ separator: true });

    // ONE IDEA, TWO DESTINATIONS. "Send to Chat" and "Send Item…" were separate
    // rows at opposite ends of the menu, which made two halves of the same
    // sentence look like unrelated features. Chat is always available — anything
    // with a card can be shown to the table — and a person is not, since a
    // feature cannot be handed over.
    const destinations = [];
    if (physical && owns) {
        destinations.push({
            name: 'A character…',
            icon: 'fa-solid fa-user',
            callback: () => sendItem(actor, item)
        });
    }
    destinations.push({
        name: 'The chat',
        icon: 'fa-solid fa-comment',
        callback: () => item.displayCard?.()
    });

    entries.push({
        name: 'Send to',
        icon: 'fa-solid fa-share',
        submenu: destinations
    });

    if (containers.length || inContainer) {

        const submenu = containers.map(container => ({
            name: container.name,
            icon: 'fa-solid fa-sack',
            disabled: container.id === item.system?.container,
            callback: () => item.update({ 'system.container': container.id })
        }));

        // Only when it is in one. "Take it out" on something already out is an
        // entry that does nothing, which this menu does not have.
        if (inContainer) {
            if (submenu.length) submenu.push({ separator: true });
            submenu.push({
                name: 'Not in a container',
                icon: 'fa-solid fa-hand',
                callback: () => item.update({ 'system.container': null })
            });
        }

        entries.push({
            name: 'Move to Container',
            icon: 'fa-solid fa-backpack',
            submenu
        });
    }

    if (owns) {
        entries.push({ separator: true });
        entries.push({
            name: `Delete ${noun}`,
            icon: 'fa-solid fa-trash',
            callback: () => deleteItem(actor, item)
        });
    }

    return entries;
}

/**
 * Open the menu at an event's position.
 *
 * Both routes in land here — the row's own `⋯` and a right-click anywhere on
 * the row — so the two can never offer different things.
 */
export function showItemMenu(actor, item, event) {
    const entries = buildItemMenu(actor, item);
    if (!entries.length) return;

    getBlacksmith()?.uiContextMenu?.show({
        id: MENU_ID,
        x: event.clientX,
        y: event.clientY,
        zones: entries,
        className: 'squire-item-context-menu'
    });
}

/**
 * Wire a panel's rows to the menu. Delegated, so a list of any length costs two
 * listeners and a redrawn row keeps working.
 */
export function activateItemMenu(panel, actor, signal = null) {
    if (!panel) return [];

    const open = (event) => {
        const row = event.target.closest('.panel-item[data-item-id]');
        if (!row) return;

        const item = actor?.items?.get(row.dataset.itemId);
        if (!item) return;

        event.preventDefault();
        event.stopPropagation();
        showItemMenu(actor, item, event);
    };

    const handlers = [
        // The ellipsis is the discoverable route; right-click anywhere on the
        // row is the fast one. Same menu from both, because two ways in that
        // offered different things would be worse than one way in.
        { element: panel, event: 'click', handler: (event) => {
            if (event.target.closest('.squire-item-menu')) open(event);
        } },
        { element: panel, event: 'contextmenu', handler: open }
    ];

    // The panels are split between two idioms for tearing listeners down — an
    // AbortSignal in three of them, a tracked array in the other two — so this
    // serves both rather than forcing a refactor of five files to add a menu.
    for (const { event, handler } of handlers) {
        panel.addEventListener(event, handler, signal ? { signal } : undefined);
    }

    return handlers;
}
