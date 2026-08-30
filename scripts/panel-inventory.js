import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { FavoritesPanel } from './panel-favorites.js';
import { getNativeElement, renderTemplate, getContainerInfo, activateContainerListener, applyItemTooltips, showSquireToast, setRowFilter, getActionType, getActionTypes, useOrOpenItem, CONTAINER_ITEM_TYPES} from './helpers.js';
import { TransferUtils } from './transfer-utils.js';
import { LightUtility } from './utility-lights.js';
import { QuantityEditor } from './utility-quantity.js';

/**
 * Normalise an item type to the category it belongs to.
 *
 * Only containers need it, and only because dnd5e has called that type two
 * things — see CONTAINER_ITEM_TYPES in helpers.js, which is where the pair is
 * named. Without this a `backpack` lands in a section of its own with a heading
 * nobody expects.
 */
function inventoryCategoryType(type) {
    return CONTAINER_ITEM_TYPES.includes(type) ? 'container' : type;
}

/**
 * The inventory's categories, in the order they are shown.
 *
 * One list, read by both views. The template used to carry this five times over
 * as copy-pasted blocks, which is why "group these by bag as well" would have
 * meant a second copy of the whole thing rather than a second loop over one.
 */
const INVENTORY_CATEGORIES = [
    { type: 'equipment', label: 'Equipment' },
    { type: 'consumable', label: 'Consumables' },
    { type: 'tool', label: 'Tools' },
    { type: 'loot', label: 'Loot' },
    { type: 'container', label: 'Containers' }
];

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = { all: [], byType: {} }; // Initialize empty, will be populated in render
        // Don't set panelManager in constructor
        this._transferDialogOpen = false; // Guard to prevent multiple dialogs
        // Store event handler references for cleanup
        this._eventHandlers = [];
    }

    async _getItems() {
        if (!this.actor) return { all: [], byType: {} };
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get inventory items.
        //
        // `container` is here because dnd5e renamed the type and this list did
        // not follow: it read `backpack` only, so on any world running a current
        // dnd5e every container was filtered out of the inventory before
        // anything else could see it. The Containers category has therefore
        // never rendered on those worlds, and bag view put everything in General
        // because it could not find a single bag to group by. Both names, since
        // an old world can still hold the old type.
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', ...CONTAINER_ITEM_TYPES].includes(item.type)
        );
        
        // Get active light source ID for this actor (from actor flag - most reliable)
        // This is similar to how favorites work - direct flag check
        const effectiveActiveLightSourceId = LightUtility.getActiveLightSourceId(this.actor);

        const canEditQuantity = QuantityEditor.canEdit(this.actor);

        // Map items with favorite state and action type
        const mappedItems = await Promise.all(items.map(async item => {
            const isLightSource = await LightUtility.isLightSource(item);
            let isLightActive = false;
            
            if (isLightSource && effectiveActiveLightSourceId) {
                const itemLightSourceId = await LightUtility.getLightSourceId(item);
                isLightActive = itemLightSourceId === effectiveActiveLightSourceId;
            }
            
            return {
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                isFavorite: favorites.includes(item.id),
                categoryId: `category-inventory-${inventoryCategoryType(item.type)}`,
                actionType: getActionType(item),
                actionTypes: getActionTypes(item).join(' '),
                // Omitted entirely for item types dnd5e has no `equipped` field
                // for — loot, and anything else that can't be worn or wielded.
                // A missing attribute is how a row says the Equipped chip
                // doesn't apply to it, which is what keeps that chip from
                // emptying the panel of things it has no opinion about.
                equipState: item.system?.equipped === undefined
                    ? null
                    : (item.system.equipped ? 'equipped' : 'unequipped'),
                flags: item.flags || {},
                // Both sources: the persisted flag survives a reload, the session
                // map covers the window before the flag write lands. The template
                // used to test them separately and could render two badges.
                isNew: !!(item.getFlag(MODULE.ID, 'isNew') || PanelManager.newlyAddedItems?.has(item.id)),
                container: getContainerInfo(item, this.actor),
                isLightSource: isLightSource,
                isLightActive: isLightActive,
                // Only stackable items have a quantity to edit; showing the badge
                // for everything else would offer an edit that means nothing.
                canEditQuantity: canEditQuantity && item.system?.quantity !== undefined
            };
        }));

        // Grouped by the CATEGORY type, not the raw item type: the header's
        // filter icons look this up by category name, so an old-style `backpack`
        // bucketed under its own key left the Containers filter icon missing on
        // exactly the worlds that still had backpacks. `item.type` is untouched
        // on the item itself — equip checks and drag payloads read the real one.
        const itemsByType = {};
        mappedItems.forEach(item => {
            const key = inventoryCategoryType(item.type);
            if (!itemsByType[key]) {
                itemsByType[key] = [];
            }
            itemsByType[key].push(item);
        });

        // Sort each category alphabetically by name (removing HTML tags for sorting)
        Object.values(itemsByType).forEach(items => {
            items.sort((a, b) => {
                const nameA = a.name.replace(/<[^>]*>/g, '').toLowerCase();
                const nameB = b.name.replace(/<[^>]*>/g, '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        return {
            all: mappedItems,
            byType: itemsByType
        };
    }

    /**
     * The category blocks for one set of items, in INVENTORY_CATEGORIES order.
     *
     * Empty categories are dropped rather than passed through as empty arrays,
     * so neither view has to ask whether a block is worth rendering.
     *
     * Sorts here rather than relying on the pre-sorted `byType` buckets: bag
     * view slices the same items along a different axis, so the sort has to
     * happen after the slice or each bag's contents come out in whatever order
     * the actor's item collection happens to hold them. Names are stripped of
     * markup first — some come through with tags, and `<` sorts before every
     * letter.
     */
    _categorise(items) {
        const plain = name => (name ?? '').replace(/<[^>]*>/g, '').toLowerCase();
        return INVENTORY_CATEGORIES
            .map(({ type, label }) => ({
                id: `category-inventory-${type}`,
                label,
                items: items
                    .filter(item => item.categoryId === `category-inventory-${type}`)
                    .sort((a, b) => plain(a.name).localeCompare(plain(b.name)))
            }))
            .filter(category => category.items.length);
    }

    /**
     * The inventory as General plus one section per container.
     *
     * A container appears ONLY as its own heading, never also as a row inside
     * General — it is the section, and listing it twice would be the same object
     * claiming to be in two places. Its row actions are reachable in list view,
     * which is the view that treats a bag as a thing you carry rather than as a
     * place things are.
     *
     * Deliberately FLAT: a bag inside a bag gets its own top-level section
     * rather than nesting. Nesting is a tree, and a tree in a 400px column is a
     * thing you navigate instead of a thing you read. The parent bag still shows
     * on each row via the sack icon, which is where "where is this actually" is
     * already answered.
     *
     * An item whose `system.container` points at an id the actor does not have
     * falls into General. That is a broken back-reference — the container was
     * deleted out from under it — and the one place it must not do is vanish.
     */
    _groupByContainer(mappedItems) {
        const containers = mappedItems.filter(item => item.categoryId === 'category-inventory-container');
        const containerIds = new Set(containers.map(item => item.id));

        const general = [];
        const byContainer = new Map(containers.map(item => [item.id, []]));

        for (const item of mappedItems) {
            if (containerIds.has(item.id)) continue;
            const parentId = item.system?.container;
            if (parentId && byContainer.has(parentId)) byContainer.get(parentId).push(item);
            else general.push(item);
        }

        const groups = [];
        const generalCategories = this._categorise(general);
        if (generalCategories.length) {
            groups.push({
                key: 'general',
                name: 'General',
                // Says what it is rather than leaving the template to infer it
                // from the absence of an image. General is not a bag: it has
                // nothing to open and no artwork, and both of those follow from
                // the one fact rather than each standing in for it.
                isBag: false,
                img: null,
                count: general.length,
                categories: generalCategories
            });
        }

        // Bags in name order. Empty ones are kept: "this bag is empty" is an
        // answer, and a section that disappears when you take the last thing out
        // of it looks like the bag went with it.
        containers
            .slice()
            .sort((a, b) => a.name.replace(/<[^>]*>/g, '').localeCompare(b.name.replace(/<[^>]*>/g, '')))
            .forEach(container => {
                const contents = byContainer.get(container.id) ?? [];
                groups.push({
                    key: container.id,
                    name: container.name,
                    isBag: true,
                    img: container.img,
                    count: contents.length,
                    categories: this._categorise(contents)
                });
            });

        return groups;
    }

    /** Whether the panel is grouping by container. */
    static isBagView() {
        try {
            return game.settings.get(MODULE.ID, 'inventoryViewMode') === 'bag';
        } catch (error) {
            return false;
        }
    }

    /**
     * Coins, shaped like the item rows they sit above.
     *
     * Currency is not an item — it lives on `system.currency`, not in the items
     * collection — so it is handed to the template separately. Everything else
     * about it is deliberately identical to an inventory row: the same icon,
     * name and quantity badge, so the section reads as part of the list rather
     * than as a widget bolted to the top of it.
     *
     * dnd5e ships an image per denomination and a localised name, so both come
     * from CONFIG rather than being invented here — which also means homebrew
     * currencies appear correctly and in the system's own order.
     */
    _getCurrency() {
        const currency = this.actor?.system?.currency;
        if (!currency) return null;

        const entries = Object.entries(CONFIG.DND5E?.currencies ?? {})
            .filter(([, config]) => config.conversion)
            // Largest denomination first, which is how a sheet reads.
            .sort((a, b) => a[1].conversion - b[1].conversion)
            .map(([key, config]) => ({
                key,
                name: game.i18n.localize(config.label ?? key),
                abbr: game.i18n.localize(config.abbreviation ?? key),
                img: config.icon ?? 'icons/svg/coins.svg',
                quantity: Number(currency[key]) || 0
            }));

        return entries.length ? entries : null;
    }

    /**
     * Consolidate coins to the fewest pieces.
     *
     * Calls dnd5e's conversion directly rather than opening its Currency
     * Manager: the dialog's convert tab is a button that runs exactly this, so
     * showing it would be asking the user to confirm what they already asked
     * for. The transfer half of that dialog is not used either — Squire has its
     * own transfer experience.
     */
    async _convertCurrency() {
        const CurrencyManager = game.dnd5e?.applications?.CurrencyManager;
        if (!CurrencyManager?.convertCurrency || !this.actor) return;

        try {
            await CurrencyManager.convertCurrency(this.actor);
            showSquireToast('Coins consolidated.', { icon: 'fa-solid fa-coins' });
        } catch (error) {
            console.error('Coffee Pub Squire | Currency conversion failed:', error);
            ui.notifications.error('The coins could not be consolidated.');
        }
    }

    async render(html) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh items data
        this.items = await this._getItems();

        const itemData = {
            items: this.items.all,
            itemsByType: this.items.byType,
            bagView: InventoryPanel.isBagView(),
            categories: this._categorise(this.items.all),
            groups: InventoryPanel.isBagView() ? this._groupByContainer(this.items.all) : [],
            currency: this._getCurrency(),
            newlyAddedItems: PanelManager.newlyAddedItems,
            flags: this.items.all.reduce((acc, item) => {
                acc[item.id] = item.flags || {};
                return acc;
            }, {})
        };

        const template = await renderTemplate(TEMPLATES.PANEL_INVENTORY, itemData);
        // v13: Use native DOM querySelector
        const inventoryPanel = this.element.querySelector('[data-panel="inventory"]');
        
        // Clean up old event listeners before updating HTML
        this._removeEventListeners(inventoryPanel);
        
        // v13: Use native DOM innerHTML instead of jQuery html()
        inventoryPanel.innerHTML = template;
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(inventoryPanel);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
        this._updateLightIcons(this.element);

        PanelManager.instance?.controlPanel?.reapplyFilters();
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Scope to this panel: a favorited item renders here and in the
        // favorites list under the same data-item-id, so a tray-wide query would
        // apply this equipped filter to the favorites copy as well.
        const panel = nativeHtml.querySelector('[data-panel="inventory"]');
        if (!panel) return;

        panel.querySelectorAll('.panel-item').forEach((item) => {
            const itemId = item.dataset.itemId;
            const inventoryItem = this.items.all.find(i => i.id === itemId);

            if (!inventoryItem) return;

            const categoryId = inventoryItem.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            // Category collapse is all this panel decides now; Equipped moved
            // to the filter bar.
            setRowFilter(item, 'category', isCategoryHidden);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(panel);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;

        // Scope to this panel: the same item also renders a heart in the favorites
        // list, which sits earlier in the tray DOM and would steal a tray-wide
        // querySelector's first match — leaving this panel's icon stale.
        const panel = nativeElement.querySelector('[data-panel="inventory"]');
        if (!panel) return;

        this.items.all.forEach(item => {
            const heartIcon = panel.querySelector(`[data-item-id="${item.id}"] .fa-heart`);
            if (heartIcon) {
                if (item.isFavorite) {
                    heartIcon.classList.remove('faded');
                } else {
                    heartIcon.classList.add('faded');
                }
            }
        });
    }

    /**
     * Update light icon states to reflect current light status
     */
    _updateLightIcons(html) {
        if (!html) {
            html = this.element;
        }
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(html);
        if (!nativeElement) return;

        // Scope to this panel — same first-match hazard as _updateHeartIcons: a
        // favorited light source renders a lightbulb in the favorites list too.
        const panel = nativeElement.querySelector('[data-panel="inventory"]') || nativeElement;

        this.items.all.forEach(item => {
            if (!item.isLightSource) return;

            const lightIcon = panel.querySelector(`[data-item-id="${item.id}"] .fa-lightbulb`);
            if (lightIcon) {
                if (item.isLightActive) {
                    lightIcon.classList.remove('faded');
                    lightIcon.classList.add('light-active');
                } else {
                    lightIcon.classList.add('faded');
                    lightIcon.classList.remove('light-active');
                }
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        // Remove all stored event listeners
        this._eventHandlers.forEach(({ element, event, handler }) => {
            if (element && handler) {
                element.removeEventListener(event, handler);
            }
        });
        // Clear the handlers array
        this._eventHandlers = [];
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Same rich hover card the dnd5e sheet shows for these items.
        applyItemTooltips(nativeHtml, this.actor);

        // Use event delegation for all handlers
        const panel = nativeHtml.querySelector('[data-panel="inventory"]');
        if (!panel) return;

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        // v13: Use native DOM event delegation
        const categoryFilterHandler = (event) => {
            const filter = event.target.closest('.inventory-category-filter');
            if (!filter) return;
            const categoryId = filter.dataset.filterId;
            if (categoryId) {
                this.panelManager.toggleCategory(categoryId, panel);
            }
        };
        panel.addEventListener('click', categoryFilterHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: categoryFilterHandler });

        // List <-> bag view. A full re-render rather than a reshuffle of the
        // existing rows: the two views are different groupings of the same data,
        // and re-deriving them is both simpler and the only way the category
        // headers end up in the right sections.
        const viewToggleHandler = async (event) => {
            if (!event.target.closest('.inventory-view-toggle')) return;
            event.preventDefault();
            event.stopPropagation();
            const next = InventoryPanel.isBagView() ? 'list' : 'bag';
            await game.settings.set(MODULE.ID, 'inventoryViewMode', next);
            await this.render(this.element);
        };
        panel.addEventListener('click', viewToggleHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: viewToggleHandler });

        // Currency rows: consolidate, and send
        this._activateCurrencyListeners(panel);

        // Inline quantity editing on the count badge
        const quantityHandler = QuantityEditor.activateListener(panel, this.actor);
        if (quantityHandler) {
            this._eventHandlers.push({ element: panel, event: 'click', handler: quantityHandler });
        }

        // Open the container an item is stored inside
        const containerHandler = activateContainerListener(panel, this.actor);
        if (containerHandler) {
            this._eventHandlers.push({ element: panel, event: 'click', handler: containerHandler });
        }

        // Item info click (feather icon)
        // v13: Use native DOM event delegation
        const featherIconHandler = async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            const inventoryItem = featherIcon.closest('.panel-item');
            if (!inventoryItem) return;
            const itemId = inventoryItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        };
        panel.addEventListener('click', featherIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: featherIconHandler });

        // Toggle favorite
        // v13: Use native DOM event delegation
        const heartIconHandler = async (event) => {
            const heartIcon = event.target.closest('.tray-buttons .fa-heart');
            if (!heartIcon) return;
            
            const inventoryItem = heartIcon.closest('.panel-item');
            if (!inventoryItem) return;
            const itemId = inventoryItem.dataset.itemId;
            await FavoritesPanel.manageFavorite(this.actor, itemId);
            // manageFavorite() already updates all panels, including this one
        };
        panel.addEventListener('click', heartIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: heartIconHandler });

        // Item use click (image overlay)
        // v13: Use native DOM event delegation
        const rollOverlayHandler = async (event) => {
            const rollOverlay = event.target.closest('.panel-item-image-container .panel-item-roll-overlay');
            if (!rollOverlay) return;
            
            const inventoryItem = rollOverlay.closest('.panel-item');
            if (!inventoryItem) return;
            const itemId = inventoryItem.dataset.itemId;
            await useOrOpenItem(this.actor.items.get(itemId), event);
        };
        panel.addEventListener('click', rollOverlayHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: rollOverlayHandler });

        // Toggle equip state (shield icon)
        // v13: Use native DOM event delegation
        const shieldIconHandler = async (event) => {
            const shieldIcon = event.target.closest('.tray-buttons .fa-shield-alt');
            if (!shieldIcon) return;
            
            const inventoryItem = shieldIcon.closest('.panel-item');
            if (!inventoryItem) return;
            const itemId = inventoryItem.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                inventoryItem.classList.toggle('prepared', newEquipped);
                shieldIcon.classList.toggle('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(nativeHtml);
            }
        };
        panel.addEventListener('click', shieldIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: shieldIconHandler });

        // Send item (share icon)
        // v13: Use native DOM event delegation
        const sendButtonHandler = async (event) => {
            const sendButton = event.target.closest('.inventory-send-item');
            if (!sendButton) return;
            
            // Prevent multiple dialogs from opening
            if (this._transferDialogOpen) {
                event.stopPropagation();
                return;
            }
            
            const itemId = sendButton.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                // Open character selection window
                await this._openCharacterSelection(item);
            }
        };
        panel.addEventListener('click', sendButtonHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: sendButtonHandler });

        // Light source click (light icon)
        // v13: Use native DOM event delegation
        const lightIconHandler = async (event) => {
            const lightIcon = event.target.closest('.tray-buttons .fa-lightbulb');
            if (!lightIcon) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            // Prevent multiple rapid clicks
            if (lightIcon.dataset.processing === 'true') return;
            lightIcon.dataset.processing = 'true';
            
            try {
                const inventoryItem = lightIcon.closest('.panel-item');
                if (!inventoryItem) return;
                const itemId = inventoryItem.dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (!item) return;

                // Get the player's token
                const token = LightUtility.getPlayerToken(this.actor);
                if (!token) {
                    ui.notifications.warn('No token selected. Please select a token on the canvas.');
                    return;
                }

                // Toggle light on/off
                const result = await LightUtility.toggleLightForToken(token, item);
                
                // Refresh items to update all light icon states
                this.items = await this._getItems();
                
                // Update all light icons in the panel
                this._updateLightIcons(nativeHtml);
            } finally {
                // Remove processing flag after a short delay to allow for async operations
                setTimeout(() => {
                    lightIcon.dataset.processing = 'false';
                }, 500);
            }
        };
        panel.addEventListener('click', lightIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: lightIconHandler });
    }

    /**
     * Currency row actions.
     *
     * Delegated on the panel rather than bound per row, since the panel
     * re-renders whenever anything in the inventory changes.
     */
    _activateCurrencyListeners(panel) {
        const handler = async (event) => {
            const convert = event.target.closest('.currency-convert');
            const send = event.target.closest('.currency-send');
            if (!convert && !send) return;

            event.preventDefault();
            event.stopPropagation();

            if (convert) {
                await this._convertCurrency();
                return;
            }

            await this._sendCurrency(send.dataset.denomination);
        };

        panel.addEventListener('click', handler);
        this._eventHandlers.push({ element: panel, event: 'click', handler });
    }

    /**
     * Hand coins to another character, through Squire's own transfer tool.
     *
     * Deliberately not dnd5e's Currency Manager: its transfer tab is a different
     * recipient picker with different rules, and the point of the tray is that
     * moving things works the same way whatever the thing is.
     *
     * The move itself is Blacksmith's `api.inventory.transferCurrency`, which
     * locks both actors, verifies the shortfall against live values before
     * writing, and rolls back a partial transfer.
     *
     * LIMITATION, stated rather than hidden: that API writes to both actors
     * directly and has no GM-routing escape, so it needs ownership of BOTH —
     * true for a GM, and for a player moving coins between their own characters.
     * Player-to-player currency additionally needs the approval pipeline item
     * transfers use, which is built around an item document (container checks,
     * item-keyed chat cards, an approval payload naming an item).
     */
    async _sendCurrency(denomination) {
        const config = CONFIG.DND5E?.currencies?.[denomination];
        if (!config || !this.actor) return;

        const available = Number(this.actor.system?.currency?.[denomination]) || 0;
        const name = game.i18n.localize(config.label ?? denomination);

        if (available <= 0) {
            showSquireToast(`No ${name} to send.`, { icon: 'fa-solid fa-coins' });
            return;
        }

        if (this._transferDialogOpen) return;
        this._transferDialogOpen = true;

        try {
            const { openCurrencyTransferTool } = await import('./window-transfer-tool.js');
            await openCurrencyTransferTool({
                sourceActor: this.actor,
                denomination,
                denominationName: name,
                denominationImg: config.icon ?? 'icons/svg/coins.svg',
                available,
                onSubmit: async ({ targetActor, quantity }) => {
                    if (!targetActor) throw new Error('No recipient selected.');

                    const inventory = game.modules.get('coffee-pub-blacksmith')?.api?.inventory;
                    if (typeof inventory?.transferCurrency !== 'function') {
                        throw new Error("Blacksmith's inventory API is unavailable, so coins cannot be moved.");
                    }

                    const amount = Number(quantity) || 0;
                    if (amount <= 0) throw new Error(`No ${name} to send.`);

                    // Blacksmith owns the move: it locks both actors, checks the
                    // shortfall against live values before writing anything, and
                    // rolls back a half-applied transfer. Squire doing its own
                    // pair of updates would be a worse copy of all three, and
                    // would race the sheet if coins were spent mid-dialog.
                    const result = await inventory.transferCurrency({
                        sourceActorUuid: this.actor.uuid,
                        targetActorUuid: targetActor.uuid,
                        currency: { [denomination]: amount }
                    });

                    if (result?.ok === false || result?.error) {
                        // INSUFFICIENT_CURRENCY is the expected one: the dialog
                        // may have been open while the coins were spent.
                        throw new Error(result.code === 'INSUFFICIENT_CURRENCY'
                            ? `${this.actor.name} no longer has ${amount} ${name}.`
                            : `The coins could not be moved (${result.code ?? 'unknown error'}).`);
                    }

                    showSquireToast(`Sent ${amount} ${name} to ${targetActor.name}.`, {
                        icon: 'fa-solid fa-coins'
                    });
                },
                onClose: () => { this._transferDialogOpen = false; }
            });
        } catch (error) {
            this._transferDialogOpen = false;
            throw error;
        }
    }

    async _openCharacterSelection(item) {
        if (this._transferDialogOpen) return;
        this._transferDialogOpen = true;

        try {
            const { openItemTransferTool } = await import('./window-transfer-tool.js');
            await openItemTransferTool({
                item,
                sourceActor: this.actor,
                onSubmit: async ({ targetActor, quantity }) => {
                    const liveItem = this.actor?.items?.get(item.id);
                    if (!liveItem) throw new Error(`${item.name} is no longer available.`);
                    const completed = await TransferUtils.executeTransfer({
                        sourceActor: this.actor,
                        targetActor,
                        item: liveItem,
                        quantity,
                        hasQuantity: liveItem.system.quantity !== undefined && liveItem.system.quantity > 1
                    });
                    if (completed === false) throw new Error('The transfer could not be started.');
                },
                onClose: () => {
                    this._transferDialogOpen = false;
                }
            });
        } catch (error) {
            this._transferDialogOpen = false;
            throw error;
        }
    }
}


