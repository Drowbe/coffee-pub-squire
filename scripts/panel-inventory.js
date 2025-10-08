import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { FavoritesPanel } from './panel-favorites.js';
import { CharactersWindow } from './window-characters.js';

export class InventoryPanel {
    constructor(actor) {
        this.actor = actor;
        this.items = this._getItems();
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedInventory');
        // Don't set panelManager in constructor
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

    _getItems() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get inventory items
        const items = this.actor.items.filter(item => 
            ['equipment', 'consumable', 'tool', 'loot', 'backpack'].includes(item.type)
        );
        
        // Map items with favorite state and action type
        const mappedItems = items.map(item => ({
            id: item.id,
            name: item.name,
            img: item.img || 'icons/svg/item-bag.svg',
            type: item.type,
            system: item.system,
            isFavorite: favorites.includes(item.id),
            categoryId: `category-inventory-${item.type === 'backpack' ? 'container' : item.type}`,
            actionType: this._getActionType(item),
            flags: item.flags || {},
            isNew: item.getFlag(MODULE.ID, 'isNew') || false
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

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh items data
        this.items = this._getItems();

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
        const inventoryPanel = this.element.find('[data-panel="inventory"]');
        
        // Clean up old event listeners before updating HTML
        this._removeEventListeners(inventoryPanel);
        
        inventoryPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(inventoryPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.inventory-item');
        items.each((_, item) => {
            const $item = $(item);
            const itemId = $item.data('item-id');
            const inventoryItem = this.items.all.find(i => i.id === itemId);
            
            if (!inventoryItem) return;
            
            const categoryId = inventoryItem.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const equippedMatch = !this.showOnlyEquipped || inventoryItem.system.equipped;
            
            $item.toggle(!isCategoryHidden && equippedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        this.items.all.forEach(item => {
            const $heartIcon = this.element.find(`[data-item-id="${item.id}"] .fa-heart`);
            if ($heartIcon.length) {
                $heartIcon.toggleClass('faded', !item.isFavorite);
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        // Remove all event listeners using proper namespacing
        panel.off('.squireInventory');
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="inventory"]');

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        panel.on('click.squireInventory', '.inventory-category-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Add filter toggle handler
        panel.on('click.squireInventory', '.inventory-filter-toggle', async (event) => {
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedInventory', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('active', this.showOnlyEquipped);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyEquipped);
            this._updateVisibility(html);
        });

        // Item info click (feather icon)
        panel.on('click.squireInventory', '.tray-buttons .fa-feather', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        });

        // Toggle favorite
        panel.on('click.squireInventory', '.tray-buttons .fa-heart', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
            // Refresh the panel data to update heart icon states
            this.items = this._getItems();
            this._updateHeartIcons();
        });

        // Item use click (image overlay)
        panel.on('click.squireInventory', '.inventory-image-container .inventory-roll-overlay', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                await item.use({}, { event });
            }
        });

        // Toggle equip state (shield icon)
        panel.on('click.squireInventory', '.tray-buttons .fa-shield-alt', async (event) => {
            const itemId = $(event.currentTarget).closest('.inventory-item').data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                const newEquipped = !item.system.equipped;
                await item.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.inventory-item');
                $item.toggleClass('prepared', newEquipped);
                $(event.currentTarget).toggleClass('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(html);
            }
        });

        // Send item (share icon)
        panel.on('click.squireInventory', '.inventory-send-item', async (event) => {
            const itemId = $(event.currentTarget).data('item-id');
            const item = this.actor.items.get(itemId);
            if (item) {
                // Open character selection window
                await this._openCharacterSelection(item);
            }
        });
    }

    async _openCharacterSelection(item) {
        // Create character selection window
        const characterWindow = new CharactersWindow({
            item: item,
            sourceActor: this.actor,
            sourceItemId: item.id,
            onCharacterSelected: this._handleCharacterSelected.bind(this)
        });
        
        // Render the window
        await characterWindow.render(true);
    }

    async _handleCharacterSelected(targetActor, item, sourceActor, sourceItemId) {
        // Reuse the existing transfer logic from panel-party.js
        // We need to simulate the drop event that would happen in party panel
        const transferData = {
            sourceActorId: sourceActor.id,
            targetActorId: targetActor.id,
            sourceItemId: sourceItemId,
            item: item
        };

        // Call the existing transfer logic
        await this._executeItemTransfer(transferData);
    }

    async _executeItemTransfer(transferData) {
        const { sourceActor, targetActor, item } = transferData;
        
        // Check if GM approval is required
        const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
        
        if (gmApprovalRequired) {
            // Send to GM for approval first
            await this._sendGMTransferNotification(sourceActor, targetActor, item);
        } else {
            // Send directly to receiver
            await this._sendTransferReceiverMessage(sourceActor, targetActor, item);
        }
        
        // Send waiting message to sender
        await this._sendTransferSenderMessage(sourceActor, targetActor, item);
    }

    async _sendGMTransferNotification(sourceActor, targetActor, item) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        await socket.executeAsGM('createTransferRequestChat', {
            sourceActorId: sourceActor.id,
            sourceActorName: sourceActor.name,
            targetActorId: targetActor.id,
            targetActorName: targetActor.name,
            itemId: item.id,
            itemName: item.name,
            quantity: 1,
            hasQuantity: false,
            isPlural: false,
            isGMApproval: true,
            receiverIds: game.users.filter(u => u.isGM).map(u => u.id)
        });
    }

    async _sendTransferReceiverMessage(sourceActor, targetActor, item) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        // Validate targetActor exists
        if (!targetActor) {
            console.error('Target actor is undefined in _sendTransferReceiverMessage');
            return;
        }

        // Get target actor owners (non-GM users)
        const targetUsers = game.users.filter(user => 
            targetActor.ownership && 
            targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && 
            user.active && 
            !user.isGM
        );

        if (targetUsers.length > 0) {
            await socket.executeAsGM('createTransferRequestChat', {
                sourceActorId: sourceActor.id,
                sourceActorName: sourceActor.name,
                targetActorId: targetActor.id,
                targetActorName: targetActor.name,
                itemId: item.id,
                itemName: item.name,
                quantity: 1,
                hasQuantity: false,
                isPlural: false,
                isTransferReceiver: true,
                receiverIds: targetUsers.map(u => u.id)
            });
        }
    }

    async _sendTransferSenderMessage(sourceActor, targetActor, item) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        // Validate actors exist
        if (!sourceActor || !targetActor) {
            console.error('Source or target actor is undefined in _sendTransferSenderMessage');
            return;
        }

        // Get source actor owners (non-GM users)
        const sourceUsers = game.users.filter(user => 
            sourceActor.ownership && 
            sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && 
            user.active && 
            !user.isGM
        );

        if (sourceUsers.length > 0) {
            const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
            
            await socket.executeAsGM('createTransferRequestChat', {
                sourceActorId: sourceActor.id,
                sourceActorName: sourceActor.name,
                targetActorId: targetActor.id,
                targetActorName: targetActor.name,
                itemId: item.id,
                itemName: item.name,
                quantity: 1,
                hasQuantity: false,
                isPlural: false,
                isTransferSender: true,
                receiverIds: sourceUsers.map(u => u.id)
            });
        }
    }
} 