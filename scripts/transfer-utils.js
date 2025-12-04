import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { renderTemplate } from './helpers.js';

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
            const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
            
            // Send waiting message to sender
            await this._sendTransferSenderMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData, gmApprovalRequired);
            
            if (gmApprovalRequired) {
                // Send to GM for approval first
                await this._sendGMTransferNotification(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData);
            } else {
                // Send directly to receiver
                await this._sendTransferReceiverMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData);
            }
        } else {
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
        // EXACT COPY of working drag-and-drop _createTransferData
        return {
            id: transferId,
            sourceActorId: sourceActor.id,
            targetActorId: targetActor.id,
            itemId: item.id,
            itemName: item.name,
            quantity: quantity,
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
        // EXACT COPY of working drag-and-drop _sendGMTransferNotification
        const gmUsers = game.users.filter(u => u.isGM);
        
        if (gmUsers.length > 0) {
            // If current user is not a GM, use socketlib to have a GM create the message
            if (!game.user.isGM) {
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    await socket.executeAsGM('createTransferRequestChat', {
                        cardType: "transfer-request",
                        sourceActorId: sourceActor.id,
                        sourceActorName: `${sourceActor.name} (${game.user.name})`,
                        targetActorId: targetActor.id,
                        targetActorName: targetActor.name,
                        itemId: item.id,
                        itemName: item.name,
                        quantity: quantity,
                        hasQuantity: hasQuantity,
                        isPlural: quantity > 1,
                        isGMApproval: true,
                        transferId,
                        receiverIds: gmUsers.map(u => u.id),
                        transferData
                    });
                }
            } else {
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-request",
                        strCardIcon: "fa-solid fa-gavel",
                        strCardTitle: "GM Approval Required",
                        sourceActor,
                        sourceActorName: `${sourceActor.name} (${game.user.name})`,
                        targetActor,
                        targetActorName: targetActor.name,
                        item: item,
                        itemName: item.name,
                        quantity: quantity,
                        hasQuantity: hasQuantity,
                        isPlural: quantity > 1,
                        isGMApproval: true,
                        transferId
                    }),
                    speaker: { alias: "System Transfer" },
                    whisper: gmUsers.map(u => u.id),
                    flags: {
                        [MODULE.ID]: {
                            transferId,
                            type: 'transferRequest',
                            isGMApproval: true,
                            data: transferData
                        }
                    }
                });
            }
        }
    }

    /**
     * Send transfer request to receiver
     */
    static async _sendTransferReceiverMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData) {
        // EXACT COPY of working drag-and-drop _sendTransferReceiverMessage
        const targetUsers = game.users.filter(u => !u.isGM && targetActor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        
        if (targetUsers.length > 0) {
            // If current user is not a GM, use socketlib to have a GM create the message
            if (!game.user.isGM) {
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    await socket.executeAsGM('createTransferRequestChat', {
                        cardType: "transfer-request",
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
                        transferId,
                        receiverIds: targetUsers.map(u => u.id),
                        transferData
                    });
                }
            } else {
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-request",
                        strCardIcon: "fa-solid fa-people-arrows",
                        strCardTitle: "Transfer Request",
                        sourceActor,
                        sourceActorName: sourceActor.name,
                        targetActor,
                        targetActorName: targetActor.name,
                        item: item,
                        itemName: item.name,
                        quantity: quantity,
                        hasQuantity: hasQuantity,
                        isPlural: quantity > 1,
                        isTransferReceiver: true,
                        transferId
                    }),
                    speaker: { alias: "System" },
                    whisper: targetUsers.map(u => u.id),
                    flags: {
                        [MODULE.ID]: {
                            transferId,
                            type: 'transferRequest',
                            isTransferReceiver: true,
                            isTransferSender: false,
                            isGMApproval: false,
                            data: transferData,
                            targetUsers: targetUsers.map(u => u.id)
                        }
                    }
                });
            }
        }
    }

    /**
     * Send waiting message to sender
     */
    static async _sendTransferSenderMessage(sourceActor, targetActor, item, quantity, hasQuantity, transferId, transferData, gmApprovalRequired) {
        // EXACT COPY of working drag-and-drop _sendTransferSenderMessage
        await ChatMessage.create({
            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                isPublic: false,
                cardType: "transfer-request",
                strCardIcon: "fa-solid fa-people-arrows",
                strCardTitle: "Transfer Request",
                sourceActor,
                sourceActorName: sourceActor.name,
                targetActor,
                targetActorName: targetActor.name,
                item: item,
                itemName: item.name,
                quantity: quantity,
                hasQuantity: hasQuantity,
                isPlural: quantity > 1,
                isTransferSender: true,
                transferId,
                strCardContent: gmApprovalRequired ? "Waiting for GM approval." : "Waiting for receiver to accept."
            }),
            speaker: { alias: "System" },
            whisper: [game.users.get(transferData.sourceUserId).id],
            flags: {
                [MODULE.ID]: {
                    transferId,
                    type: 'transferRequest',
                    isTransferSender: true,
                    data: transferData
                }
            }
        });
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
