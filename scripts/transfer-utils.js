import { MODULE, TEMPLATES, SQUIRE } from './const.js';

export class TransferUtils {
    /**
     * Execute a complete item transfer flow
     * @param {Object} params - Transfer parameters
     * @param {Actor} params.sourceActor - Source actor
     * @param {Actor} params.targetActor - Target actor  
     * @param {Item} params.item - Item to transfer
     * @param {number} [params.quantity=1] - Quantity to transfer
     * @param {boolean} [params.hasQuantity=false] - Whether item has quantity
     * @param {Object} [params.context] - Additional context for the transfer
     */
    static async executeTransfer({ sourceActor, targetActor, item, quantity = 1, hasQuantity = false, context = {} }) {
        // Create transfer data structure
        const transferId = `transfer_${Date.now()}`;
        const transferData = this._createTransferData(transferId, sourceActor, targetActor, item, quantity, hasQuantity);
        
        // Check permissions (same logic as working drag-and-drop code)
        const hasSourcePermission = sourceActor.isOwner;
        const hasTargetPermission = targetActor.isOwner;
        
        // Use same logic as drag-and-drop: if no permission to source OR target, use approval flow
        if (!hasSourcePermission || !hasTargetPermission) {
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: Using approval flow (no permission to source or target)`);
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: hasSourcePermission =`, hasSourcePermission);
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: hasTargetPermission =`, hasTargetPermission);
            
            // Check if GM approval is required (setting OR target player is offline)
            const settingRequiresApproval = game.settings.get(MODULE.ID, 'transfersGMApproves');
            const targetPlayerIsOffline = !this._isTargetPlayerOnline(targetActor);
            const gmApprovalRequired = settingRequiresApproval || targetPlayerIsOffline;
            
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: settingRequiresApproval =`, settingRequiresApproval);
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: targetPlayerIsOffline =`, targetPlayerIsOffline);
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: gmApprovalRequired =`, gmApprovalRequired);
            
            if (gmApprovalRequired) {
                console.log(`${MODULE.ID} | Sending GM transfer notification for approval`);
                // Send to GM for approval first
                await this._sendGMTransferNotification(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData);
            } else {
                console.log(`${MODULE.ID} | Sending direct receiver message (no GM approval needed)`);
                // Send directly to receiver
                await this._sendTransferReceiverMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData);
            }
            
            // Send waiting message to sender
            console.log(`${MODULE.ID} | Sending sender waiting message`);
            await this._sendTransferSenderMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData, gmApprovalRequired);
        } else {
            console.log(`${MODULE.ID} | TransferUtils.executeTransfer: User has permission to both actors, using direct transfer`);
            // User has permission to both actors - use direct transfer (same as drag-and-drop)
            await this.executeTransferWithPermissions(sourceActor, targetActor, item, quantity, hasQuantity);
        }
    }

    /**
     * Check if the target player is online
     */
    static _isTargetPlayerOnline(targetActor) {
        // Get all users who own this actor
        const ownerUsers = targetActor.ownership ? Object.entries(targetActor.ownership)
            .filter(([userId, permission]) => permission >= 3) // 3 = OWNER permission level
            .map(([userId]) => game.users.get(userId))
            .filter(user => user && !user.isGM) : [];
        
        // Check if any owner is online
        return ownerUsers.some(user => user.active);
    }

    /**
     * Create transfer data structure
     */
    static _createTransferData(transferId, sourceActor, targetActor, item, quantity, hasQuantity) {
        return {
            id: transferId,
            sourceActorId: sourceActor.id,
            targetActorId: targetActor.id,
            itemId: item.id,
            itemName: item.name,
            quantity: quantity,
            selectedQuantity: quantity,
            hasQuantity: hasQuantity,
            isPlural: quantity > 1,
            sourceActorName: sourceActor.name,
            targetActorName: targetActor.name,
            status: 'pending',
            timestamp: Date.now(),
            sourceUserId: game.user.id
        };
    }

    /**
     * Send GM approval notification
     */
    static async _sendGMTransferNotification(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return;
        }

        console.log(`${MODULE.ID} | _sendGMTransferNotification: Calling socket.executeAsGM with data:`, {
            sourceActorId: sourceActor.id,
            sourceActorName: sourceActor.name,
            targetActorId: targetActor.id,
            targetActorName: targetActor.name,
            itemId: item.id,
            itemName: item.name,
            quantity: quantity,
            hasQuantity: hasQuantity,
            isPlural: quantity > 1,
            isGMApproval: true,
            transferId: transferId,
            receiverIds: game.users.filter(u => u.isGM).map(u => u.id)
        });

        await socket.executeAsGM('createTransferRequestChat', {
            sourceActorId: sourceActor.id,
            sourceActorName: sourceActor.name,
            targetActorId: targetActor.id,
            targetActorName: targetActor.name,
            itemId: item.id,
            itemName: item.name,
            quantity: quantity,
            hasQuantity: hasQuantity,
            isPlural: quantity > 1,
            isGMApproval: true,
            transferId: transferId,
            transferData: transferData,
            receiverIds: game.users.filter(u => u.isGM).map(u => u.id)
        });
    }

    /**
     * Send transfer request to receiver
     */
    static async _sendTransferReceiverMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
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
                quantity: quantity,
                hasQuantity: hasQuantity,
                isPlural: quantity > 1,
                isTransferReceiver: true,
                transferId: transferId,
                transferData: transferData,
                receiverIds: targetUsers.map(u => u.id)
            });
        }
    }

    /**
     * Send waiting message to sender
     */
    static async _sendTransferSenderMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData, gmApprovalRequired) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
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
            await socket.executeAsGM('createTransferRequestChat', {
                sourceActorId: sourceActor.id,
                sourceActorName: sourceActor.name,
                targetActorId: targetActor.id,
                targetActorName: targetActor.name,
                itemId: item.id,
                itemName: item.name,
                quantity: quantity,
                hasQuantity: hasQuantity,
                isPlural: quantity > 1,
                isTransferSender: true,
                transferId: transferId,
                transferData: transferData,
                receiverIds: sourceUsers.map(u => u.id)
            });
        }
    }

    /**
     * Handle item drop transfer (for drag-and-drop scenarios)
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {string} itemId - Item ID to transfer
     * @param {number} [quantity=1] - Quantity to transfer
     */
    static async handleItemDropTransfer(sourceActor, targetActor, itemId, quantity = 1) {
        const item = sourceActor.items.get(itemId);
        if (!item) {
            ui.notifications.error(`Item with ID ${itemId} not found on ${sourceActor.name}`);
            return;
        }

        const hasQuantity = item.system.quantity !== undefined && item.system.quantity > 1;
        
        await this.executeTransfer({
            sourceActor,
            targetActor,
            item,
            quantity,
            hasQuantity
        });
    }

    /**
     * Execute transfer with permission checking (for direct transfers)
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {Item} item - Item to transfer
     * @param {number} quantity - Quantity to transfer
     * @param {boolean} hasQuantity - Whether item has quantity
     */
    static async executeTransferWithPermissions(sourceActor, targetActor, item, quantity, hasQuantity) {
        const hasSourcePermission = sourceActor.isOwner;
        const hasTargetPermission = targetActor.isOwner;
        
        if (hasSourcePermission && hasTargetPermission) {
            // Direct transfer - user has permissions on both actors
            await this._completeItemTransfer(sourceActor, targetActor, item, quantity, hasQuantity);
        } else {
            // Use socket for GM-mediated transfer
            const socket = game.modules.get(MODULE.ID)?.socket;
            if (!socket) {
                ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                return;
            }
            await socket.executeAsGM('executeItemTransfer', {
                sourceActorId: sourceActor.id,
                targetActorId: targetActor.id,
                sourceItemId: item.id,
                quantity: quantity,
                hasQuantity: hasQuantity
            });
        }
    }

    /**
     * Complete the actual item transfer (direct transfer)
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {Item} item - Item to transfer
     * @param {number} quantity - Quantity to transfer
     * @param {boolean} hasQuantity - Whether item has quantity
     */
    static async _completeItemTransfer(sourceActor, targetActor, item, quantity, hasQuantity) {
        // Create a copy of the item data to transfer
        const transferData = item.toObject();
        if (hasQuantity) {
            transferData.system.quantity = quantity;
        }
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [transferData]);
        
        if (hasQuantity && quantity < item.system.quantity) {
            await item.update({
                'system.quantity': item.system.quantity - quantity
            });
        } else {
            await item.delete();
        }
        
        // Mark as newly added
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
            await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
        }
        
        // Send completion messages
        await this._sendTransferCompletionMessages(sourceActor, targetActor, item, quantity, hasQuantity);
    }

    /**
     * Send transfer completion messages for direct transfers
     */
    static async _sendTransferCompletionMessages(sourceActor, targetActor, item, quantity, hasQuantity) {
        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) return;

        // Get source and target users
        const sourceUsers = game.users.filter(user => 
            sourceActor.ownership && 
            sourceActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && 
            user.active && 
            !user.isGM
        );

        const targetUsers = game.users.filter(user => 
            targetActor.ownership && 
            targetActor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && 
            user.active && 
            !user.isGM
        );

        const gmUsers = game.users.filter(u => u.isGM);

        // Send messages to all relevant parties
        const allUserIds = [...new Set([
            ...sourceUsers.map(u => u.id),
            ...targetUsers.map(u => u.id),
            ...gmUsers.map(u => u.id)
        ])];

        if (allUserIds.length > 0) {
            await socket.executeAsGM('createTransferCompleteChat', {
                sourceActorId: sourceActor.id,
                sourceActorName: sourceActor.name,
                targetActorId: targetActor.id,
                targetActorName: targetActor.name,
                itemId: item.id,
                itemName: item.name,
                quantity: quantity,
                hasQuantity: hasQuantity,
                isPlural: quantity > 1,
                isGMNotification: true,
                receiverIds: allUserIds
            });
        }
    }

    /**
     * Handle character selection transfer (for inventory send scenarios)
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {Item} item - Item to transfer
     * @param {number} [quantity=1] - Quantity to transfer
     * @param {boolean} [hasQuantity=false] - Whether item has quantity
     */
    static async handleCharacterSelectionTransfer(sourceActor, targetActor, item, quantity = 1, hasQuantity = false) {
        await this.executeTransfer({
            sourceActor,
            targetActor,
            item,
            quantity,
            hasQuantity
        });
    }
}
