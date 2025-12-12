import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { FavoritesPanel } from './panel-favorites.js';
import { CharactersWindow } from './window-characters.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { TransferUtils } from './transfer-utils.js';
import { LightUtility } from './utility-lights.js';

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = { all: [], byType: {} }; // Initialize empty, will be populated in render
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedInventory');
        // Don't set panelManager in constructor
        this._transferDialogOpen = false; // Guard to prevent multiple dialogs
        // Store event handler references for cleanup
        this._eventHandlers = [];
    }

    _getActionType(item) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = item.system.activities;
        if (!activities) return null;
        
        // Get the first activity (usually there's only one)
        const activity = Object.values(activities)[0];
        if (!activity?.activation?.type) return null;
        
        // Check the activation type
        const activationType = activity.activation.type;
        
        switch(activationType) {
            case 'action': return 'action';
            case 'bonus': return 'bonus';
            case 'reaction': return 'reaction';
            case 'special': return 'special';
            default: return null;
        }
    }

    async _getItems() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
        );
        
        // Map items with favorite state and action type
        const mappedItems = await Promise.all(items.map(async item => ({
            id: item.id,
            name: item.name,
            img: item.img || 'icons/svg/item-bag.svg',
            type: item.type,
            system: item.system,
            isFavorite: favorites.includes(item.id),
            categoryId: `category-inventory-${item.type === 'backpack' ? 'container' : item.type}`,
            actionType: this._getActionType(item),
            flags: item.flags || {},
            isNew: item.getFlag(MODULE.ID, 'isNew') || false,
            isLightSource: await LightUtility.isLightSource(item)
        })));

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
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped,
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
            this.panelManager.resetCategories(inventoryPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.inventory-item').forEach((item) => {
            const itemId = item.dataset.itemId;
            const inventoryItem = this.items.all.find(i => i.id === itemId);
            
            if (!inventoryItem) return;
            
            const categoryId = inventoryItem.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const equippedMatch = !this.showOnlyEquipped || inventoryItem.system.equipped;
            
            item.style.display = (!isCategoryHidden && equippedMatch) ? '' : 'none';
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(nativeHtml);
        this.panelManager._updateEmptyMessage(nativeHtml);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        this.items.all.forEach(item => {
            const heartIcon = nativeElement.querySelector(`[data-item-id="${item.id}"] .fa-heart`);
            if (heartIcon) {
                if (item.isFavorite) {
                    heartIcon.classList.remove('faded');
                } else {
                    heartIcon.classList.add('faded');
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

        // Add filter toggle handler
        // v13: Use native DOM event delegation
        const filterToggleHandler = async (event) => {
            const filterToggle = event.target.closest('.inventory-filter-toggle');
            if (!filterToggle) return;
            
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedInventory', this.showOnlyEquipped);
            filterToggle.classList.toggle('active', this.showOnlyEquipped);
            filterToggle.classList.toggle('faded', !this.showOnlyEquipped);
            this._updateVisibility(nativeHtml);
        };
        panel.addEventListener('click', filterToggleHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: filterToggleHandler });

        // Item info click (feather icon)
        // v13: Use native DOM event delegation
        const featherIconHandler = async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            const inventoryItem = featherIcon.closest('.inventory-item');
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
            
            const inventoryItem = heartIcon.closest('.inventory-item');
            if (!inventoryItem) return;
            const itemId = inventoryItem.dataset.itemId;
            await FavoritesPanel.manageFavorite(this.actor, itemId);
            // Refresh the panel data to update heart icon states
            this.items = await this._getItems();
            this._updateHeartIcons();
        };
        panel.addEventListener('click', heartIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: heartIconHandler });

        // Item use click (image overlay)
        // v13: Use native DOM event delegation
        const rollOverlayHandler = async (event) => {
            const rollOverlay = event.target.closest('.inventory-image-container .inventory-roll-overlay');
            if (!rollOverlay) return;
            
            const inventoryItem = rollOverlay.closest('.inventory-item');
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
            
            const inventoryItem = shieldIcon.closest('.inventory-item');
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
            const lightIcon = event.target.closest('.tray-buttons .fa-lightbulb, .tray-buttons .fa-lightbulb-on');
            if (!lightIcon) return;
            
            const inventoryItem = lightIcon.closest('.inventory-item');
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
            const lightApplied = await LightUtility.toggleLightForToken(token, item);
            
            // Update icon state to reflect light status
            const currentLight = token.document?.light || token.light;
            const hasLight = currentLight && (currentLight.dim > 0 || currentLight.bright > 0);
            
            if (hasLight) {
                lightIcon.classList.remove('faded');
                lightIcon.classList.add('fa-lightbulb-on');
                lightIcon.classList.remove('fa-lightbulb');
            } else {
                lightIcon.classList.add('faded');
                lightIcon.classList.remove('fa-lightbulb-on');
                lightIcon.classList.add('fa-lightbulb');
            }
        };
        panel.addEventListener('click', lightIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: lightIconHandler });
    }

    async _openCharacterSelection(item) {
        // Prevent multiple dialogs from opening
        if (this._transferDialogOpen) return;
        
        // Check if item has quantity and show quantity selection dialog first
        const hasQuantity = item.system.quantity !== undefined && item.system.quantity > 1;
        const maxQuantity = hasQuantity ? item.system.quantity : 1;
        
        let selectedQuantity = 1;
        
        if (hasQuantity && maxQuantity > 1) {
            // Show quantity selection dialog
            this._transferDialogOpen = true;
            try {
                selectedQuantity = await this._showTransferQuantityDialog(item, this.actor, null, maxQuantity, hasQuantity);
                if (selectedQuantity <= 0) {
                    this._transferDialogOpen = false;
                    return; // User cancelled
                }
            } catch (error) {
                this._transferDialogOpen = false;
                throw error;
            }
        }
        
        // Create character selection window with the selected quantity
        const characterWindow = new CharactersWindow({
            item: item,
            sourceActor: this.actor,
            sourceItemId: item.id,
            selectedQuantity: selectedQuantity,
            hasQuantity: hasQuantity,
            onCharacterSelected: async (...args) => {
                this._transferDialogOpen = false;
                await this._handleCharacterSelected(...args);
            }
        });
        
        // Render the window
        await characterWindow.render(true);
        // Reset flag when character window closes (if quantity dialog wasn't shown)
        if (!hasQuantity || maxQuantity <= 1) {
            characterWindow.app.onClose = () => {
                this._transferDialogOpen = false;
            };
        }
    }

    async _handleCharacterSelected(targetActor, item, sourceActor, sourceItemId, selectedQuantity, hasQuantity) {
        // Use the shared transfer utility with the selected quantity
        await TransferUtils.executeTransfer({
            sourceActor,
            targetActor,
            item,
            quantity: selectedQuantity,
            hasQuantity
        });
        
        // Panel refresh is handled automatically by the deleteItem hook
    }

    async _showTransferQuantityDialog(sourceItem, sourceActor, targetActor, maxQuantity, hasQuantity) {
        const timestamp = Date.now();
        
        // Check if a dialog with this ID already exists
        const existingDialog = document.querySelector(`#transfer-item-${timestamp}`);
        if (existingDialog) {
            // Dialog already exists, don't create another
            return 0;
        }
        
        // Prepare template data for sender's dialog
        const senderTemplateData = {
            sourceItem,
            sourceActor,
            targetActor,
            maxQuantity,
            timestamp,
            canAdjustQuantity: hasQuantity && maxQuantity > 1,
            isReceiveRequest: false,
            hasQuantity
        };
        
        // Render the transfer dialog template for the sender
        const senderContent = await renderTemplate(TEMPLATES.TRANSFER_DIALOG, senderTemplateData);
        
        // Initiate the transfer process
        const selectedQuantity = await new Promise(resolve => {
            const dialog = new Dialog({
                title: "Transfer Item",
                content: senderContent,
                buttons: {
                    transfer: {
                        icon: '<i class="fa-solid fa-exchange-alt"></i>',
                        label: "Transfer",
                        callback: html => {
                            // v13: Convert jQuery to native DOM if needed
                            let nativeHtml = html;
                            if (html && (html.jquery || typeof html.find === 'function')) {
                                nativeHtml = html[0] || html.get?.(0) || html;
                            }
                            
                            if (hasQuantity && maxQuantity > 1) {
                                // v13: Use native DOM querySelector and value
                                const input = nativeHtml.querySelector(`input[name="quantity_${timestamp}"]`);
                                const quantity = Math.clamp(
                                    parseInt(input?.value || '1'),
                                    1,
                                    maxQuantity
                                );
                                this._transferDialogOpen = false;
                                resolve(quantity);
                            } else {
                                this._transferDialogOpen = false;
                                resolve(1);
                            }
                        }
                    },
                    cancel: {
                        icon: '<i class="fa-solid fa-times"></i>',
                        label: "Cancel",
                        callback: () => {
                            this._transferDialogOpen = false;
                            resolve(0);
                        }
                    }
                },
                default: "transfer",
                close: () => {
                    this._transferDialogOpen = false;
                    resolve(0);
                }
            }, {
                classes: ["transfer-item"],
                id: `transfer-item-${timestamp}`,
                width: 320,
                height: "auto"
            });
            
            dialog.render(true);
        });
        
        return selectedQuantity;
    }
} 