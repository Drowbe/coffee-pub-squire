import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { FavoritesPanel } from './panel-favorites.js';
import { getNativeElement, renderTemplate, getContainerInfo, activateContainerListener, applyItemTooltips, showSquireToast, setRowFilter, getActionType, getActionTypes} from './helpers.js';
import { TransferUtils } from './transfer-utils.js';
import { LightUtility } from './utility-lights.js';
import { QuantityEditor } from './utility-quantity.js';

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
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
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
                categoryId: `category-inventory-${item.type === 'backpack' ? 'container' : item.type}`,
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

        // Group items by type and sort alphabetically within each type
        const itemsByType = {};
        mappedItems.forEach(item => {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
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
        this.panelManager._updateEmptyMessage(panel);
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
            const item = this.actor.items.get(itemId);
            if (item) {
                await item.use({}, { event });
            }
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


