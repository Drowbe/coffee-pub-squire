import { MODULE, TEMPLATES } from './const.js';

export class PartyPanel {
    constructor() {
        this.element = null;
        this._onTokenUpdate = this._onTokenUpdate.bind(this);
        this._onActorUpdate = this._onActorUpdate.bind(this);
        this._onControlToken = this._onControlToken.bind(this);
        this._handleTransferButtons = this._handleTransferButtons.bind(this);
        
        // Register hooks for updates
        Hooks.on('updateToken', this._onTokenUpdate);
        Hooks.on('updateActor', this._onActorUpdate);
        Hooks.on('controlToken', this._onControlToken);
        Hooks.on('renderChatMessage', this._handleTransferButtons);
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        this.element = element;
        const partyContainer = element.find('[data-panel="party"]');
        if (!partyContainer.length) return;

        // Get all player-owned tokens on the canvas
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        
        // Get currently controlled tokens' actor IDs
        const controlledTokenIds = canvas.tokens.controlled
            .filter(token => token.actor)
            .map(token => token.actor.id);

        const html = await renderTemplate(TEMPLATES.PANEL_PARTY, { 
            tokens,
            controlledTokenIds
        });
        partyContainer.html(html);

        this.activateListeners(partyContainer);
    }

    activateListeners(html) {
        // Handle character sheet button clicks
        html.find('.open-sheet').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(event.target).closest('.character-card').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Handle portrait clicks
        html.find('.character-image.clickable').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(event.currentTarget).closest('.character-card').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor) {
                const imagePopout = new ImagePopout(actor.img, {
                    title: actor.name,
                    shareable: true,
                    uuid: actor.uuid
                });
                imagePopout.render(true);
            }
        });

        // Handle character card clicks for token selection
        html.find('.character-card.clickable').click(async (event) => {
            // Don't handle clicks if they originated from the open-sheet button or portrait
            if ($(event.target).closest('.open-sheet, .character-image.clickable').length) return;

            const actorId = $(event.currentTarget).data('actor-id');
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) {
                token.control({releaseOthers: true});
            }
        });
        
        // Add drag and drop functionality to character cards
        const characterCards = html.find('.character-card');
        
        // Remove any existing drag event listeners
        characterCards.off('dragenter dragleave dragover drop');
        
        // Add new drag event listeners
        characterCards.on('dragenter', (event) => {
            event.preventDefault();
            
            try {
                const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                const dropType = data.type;
                
                // Only handle item-related drops
                if (['Item', 'ItemDirectory', 'Actor'].includes(dropType)) {
                    // Add drop hover styles
                    $(event.currentTarget).addClass('drop-target');
                    
                    // Play hover sound
                    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                    if (blacksmith) {
                        const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                        blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                    }
                }
            } catch (error) {
                // If we can't parse data, still show hover state
                $(event.currentTarget).addClass('drop-target');
            }
        });

        characterCards.on('dragleave', (event) => {
            event.preventDefault();
            // Remove the style if we're leaving the card or entering a child element
            const card = $(event.currentTarget);
            const relatedTarget = $(event.relatedTarget);
            
            // Check if we're actually leaving the card
            if (!relatedTarget.closest('.character-card').is(card)) {
                card.removeClass('drop-target');
            }
        });

        characterCards.on('dragover', (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        characterCards.on('drop', async (event) => {
            event.preventDefault();
            
            // Get the character card and remove hover state
            const $card = $(event.currentTarget);
            $card.removeClass('drop-target');
            
            try {
                const dataTransfer = event.originalEvent.dataTransfer.getData('text/plain');
                // Debug log the raw data transfer
                console.log("SQUIRE | Party Panel Raw drop data:", dataTransfer);
                
                const data = JSON.parse(dataTransfer);
                
                // Log the parsed data
                console.log("SQUIRE | Party Panel Parsed drop data:", data);
                
                // Play drop sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Get the actor for this card
                const targetActorId = $card.data('actor-id');
                const targetActor = game.actors.get(targetActorId);
                
                if (!targetActor) {
                    ui.notifications.warn("Could not find the character to add the item to.");
                    return;
                }
                
                // We no longer check for direct target permission here
                // This allows players to initiate transfer requests
                // to characters they don't own

                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        // This could be either a world item OR a drag from character sheet
                        // Check for different indicators of a character sheet drag:
                        // 1. data.actorId + data.data.itemId (standard from older code)
                        // 2. data.actorId + data.embedId (common format for dnd5e character sheet)
                        // 3. data.fromInventory flag (indicates drag from inventory)
                        // 4. data.uuid in format "Actor.actorId.Item.itemId" (common format for dnd5e)
                        if ((data.actorId && (data.data?.itemId || data.embedId)) || 
                            data.fromInventory || 
                            (data.uuid && data.uuid.startsWith("Actor."))) {
                            
                            // This is a drag from character sheet
                            // Get source actor ID based on different data formats
                            let sourceActorId;
                            let itemId;
                            
                            // Parse from UUID format if present (Actor.actorId.Item.itemId)
                            if (data.uuid && data.uuid.startsWith("Actor.")) {
                                const parts = data.uuid.split(".");
                                if (parts.length >= 4 && parts[2] === "Item") {
                                    sourceActorId = parts[1];
                                    itemId = parts[3];
                                }
                            } else {
                                sourceActorId = data.actorId;
                                itemId = data.data?.itemId || data.embedId || data.uuid?.split('.').pop();
                            }
                            
                            const sourceActor = game.actors.get(sourceActorId);
                            if (!sourceActor || !itemId) {
                                ui.notifications.warn("Could not determine the source actor or item.");
                                
                                // Try the regular Item import as fallback
                                item = await Item.implementation.fromDropData(data);
                                if (!item) return;
                                const createdItem = await targetActor.createEmbeddedDocuments('Item', [item.toObject()]);
                                break;
                            }
                            
                            // Get the item from the source actor
                            const sourceItem = sourceActor.items.get(itemId);
                            if (!sourceItem) {
                                ui.notifications.warn("Could not find the item on the source character.");
                                return;
                            }
                            
                            // Check permissions on source actor
                            if (!sourceActor.isOwner) {
                                ui.notifications.warn(`You don't have permission to remove items from ${sourceActor.name}.`);
                                return;
                            }
                            
                            // Handle quantity logic for stackable items
                            let quantityToTransfer = 1;
                            const hasQuantity = sourceItem.system.quantity != null;
                            const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
                            
                            // Always create a dialog, even for single items
                            const timestamp = Date.now();
                            
                            // Check if we have direct permission to modify the target actor
                            const hasTargetPermission = targetActor.isOwner;
                            
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
                            let selectedQuantity = await new Promise(resolve => {
                                new Dialog({
                                    title: "Transfer Item",
                                    content: senderContent,
                                    buttons: {
                                        transfer: {
                                            icon: '<i class="fas fa-exchange-alt"></i>',
                                            label: "Transfer",
                                            callback: html => {
                                                if (hasQuantity && maxQuantity > 1) {
                                                    const quantity = Math.clamp(
                                                        parseInt(html.find(`input[name="quantity_${timestamp}"]`).val()),
                                                        1,
                                                        maxQuantity
                                                    );
                                                    resolve(quantity);
                                                } else {
                                                    resolve(1);
                                                }
                                            }
                                        },
                                        cancel: {
                                            icon: '<i class="fas fa-times"></i>',
                                            label: "Cancel",
                                            callback: () => resolve(0)
                                        }
                                    },
                                    default: "transfer",
                                    close: () => resolve(0)
                                }, {
                                    classes: ["transfer-item"],
                                    id: `transfer-item-${timestamp}`,
                                    width: 320,
                                    height: "auto"
                                }).render(true);
                            });
                            
                            if (selectedQuantity <= 0) return; // User cancelled
                            
                            // If we have direct permission, complete the transfer
                            if (hasTargetPermission) {
                                await this._completeItemTransfer(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                                return;
                            }
                            
                            // Without direct permission, we need to send a request to the target user
                            // Find the owning user of the target actor
                            const targetUsers = game.users.filter(u => 
                                !u.isGM && 
                                targetActor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                            );
                            
                            if (!targetUsers.length) {
                                ui.notifications.warn(`Cannot find a player who owns ${targetActor.name}.`);
                                return;
                            }
                            
                            // Create a transfer request
                            await this._sendTransferRequest(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, timestamp);
                            
                        } else {
                            // This is a regular world item
                            item = await Item.implementation.fromDropData(data);
                            if (!item) return;
                            
                            // Create the item on the actor
                            const createdItem = await targetActor.createEmbeddedDocuments('Item', [item.toObject()]);
                            
                            // Add to newlyAddedItems in PanelManager
                            if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                                game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(createdItem[0].id, Date.now());
                            }
                            
                            // Send chat notification
                            const chatData = {
                                isPublic: true,
                                strCardIcon: this._getDropIcon(item.type),
                                strCardTitle: this._getDropTitle(item.type),
                                strCardContent: `<p><strong>${targetActor.name}</strong> received <strong>${item.name}</strong> via the Squire tray.</p>`
                            };
                            const chatContent = await renderTemplate(TEMPLATES.CHAT_CARD, chatData);
                            await ChatMessage.create({
                                content: chatContent,
                                speaker: ChatMessage.getSpeaker({ actor: targetActor })
                            });
                        }
                        break;

                    case 'ItemDirectory':
                        const itemData = game.items.get(data.uuid)?.toObject();
                        if (itemData) {
                            const newItem = await targetActor.createEmbeddedDocuments('Item', [itemData]);
                            
                            // Add to newlyAddedItems in PanelManager
                            if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                                game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(newItem[0].id, Date.now());
                            }
                            
                            // Send chat notification
                            const dirItemChatData = {
                                isPublic: true,
                                strCardIcon: this._getDropIcon(itemData.type),
                                strCardTitle: this._getDropTitle(itemData.type),
                                strCardContent: `<p><strong>${targetActor.name}</strong> received <strong>${itemData.name}</strong> via the Squire tray.</p>`
                            };
                            const dirItemChatContent = await renderTemplate(TEMPLATES.CHAT_CARD, dirItemChatData);
                            await ChatMessage.create({
                                content: dirItemChatContent,
                                speaker: ChatMessage.getSpeaker({ actor: targetActor })
                            });
                        }
                        break;

                    // Special case: Actor -> Actor item transfer
                    case 'Actor':
                        // Extract item data from drop event
                        const sourceActorId = data.id;
                        const sourceActor = game.actors.get(sourceActorId);
                        const itemId = data.data?.itemId || data.uuid?.split('.').pop();
                        
                        if (!sourceActor || !itemId) {
                            ui.notifications.warn("Could not determine the source actor or item.");
                            return;
                        }
                        
                        // Get the item from the source actor
                        const sourceItem = sourceActor.items.get(itemId);
                        if (!sourceItem) {
                            ui.notifications.warn("Could not find the item on the source character.");
                            return;
                        }
                        
                        // Check permissions on source actor
                        if (!sourceActor.isOwner) {
                            ui.notifications.warn(`You don't have permission to remove items from ${sourceActor.name}.`);
                            return;
                        }
                        
                        // Handle quantity logic for stackable items
                        let quantityToTransfer = 1;
                        const hasQuantity = sourceItem.system.quantity != null;
                        const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
                        
                        // Always create a dialog, even for single items
                        const timestamp = Date.now();
                        
                        // Check if we have direct permission to modify the target actor
                        const hasTargetPermission = targetActor.isOwner;
                        
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
                        let selectedQuantity = await new Promise(resolve => {
                            new Dialog({
                                title: "Transfer Item",
                                content: senderContent,
                                buttons: {
                                    transfer: {
                                        icon: '<i class="fas fa-exchange-alt"></i>',
                                        label: "Transfer",
                                        callback: html => {
                                            if (hasQuantity && maxQuantity > 1) {
                                                const quantity = Math.clamp(
                                                    parseInt(html.find(`input[name="quantity_${timestamp}"]`).val()),
                                                    1,
                                                    maxQuantity
                                                );
                                                resolve(quantity);
                                            } else {
                                                resolve(1);
                                            }
                                        }
                                    },
                                    cancel: {
                                        icon: '<i class="fas fa-times"></i>',
                                        label: "Cancel",
                                        callback: () => resolve(0)
                                    }
                                },
                                default: "transfer",
                                close: () => resolve(0)
                            }, {
                                classes: ["transfer-item"],
                                id: `transfer-item-${timestamp}`,
                                width: 320,
                                height: "auto"
                            }).render(true);
                        });
                        
                        if (selectedQuantity <= 0) return; // User cancelled
                        
                        // If we have direct permission, complete the transfer
                        if (hasTargetPermission) {
                            await this._completeItemTransfer(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                            return;
                        }
                        
                        // Without direct permission, we need to send a request to the target user
                        // Find the owning user of the target actor
                        const targetUsers = game.users.filter(u => 
                            !u.isGM && 
                            targetActor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                        );
                        
                        if (!targetUsers.length) {
                            ui.notifications.warn(`Cannot find a player who owns ${targetActor.name}.`);
                            return;
                        }
                        
                        // Create a transfer request
                        await this._sendTransferRequest(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, timestamp);
                        break;
                }
                
                // Re-render the party panel to reflect any changes
                this.render(this.element);
                
                // Also refresh the main tray if the active character was involved
                const panelManager = game.modules.get('coffee-pub-squire')?.api?.PanelManager;
                if (panelManager?.instance) {
                    const currentActorId = panelManager.currentActor?.id;
                    if (currentActorId === targetActorId || 
                        (data.type === 'Actor' && data.id === currentActorId)) {
                        panelManager.instance.updateTray();
                    }
                }
                
            } catch (error) {
                console.error(`${MODULE.TITLE} | Error handling drop on character card:`, error);
                ui.notifications.error("Failed to add item to character.");
            }
        });
    }
    
    // Helper method to get the appropriate icon based on item type
    _getDropIcon(type) {
        switch(type) {
            case 'spell': return 'fas fa-stars';
            case 'weapon': return 'fas fa-swords';
            case 'feat': return 'fas fa-sparkles';
            default: return 'fas fa-backpack';
        }
    }

    // Helper method to get the appropriate title based on item type
    _getDropTitle(type) {
        switch(type) {
            case 'spell': return 'New Spell Added';
            case 'weapon': return 'New Weapon Added';
            case 'feat': return 'New Feature Added';
            default: return 'New Item Added';
        }
    }

    _onTokenUpdate(token, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if token position or visibility changes
            if (foundry.utils.hasProperty(changes, "x") || foundry.utils.hasProperty(changes, "y") || foundry.utils.hasProperty(changes, "hidden")) {
                this.render(this.element);
            }
        }
    }

    _onActorUpdate(actor, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if HP changes
            if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {
                this.render(this.element);
            }
        }
    }

    _onControlToken(token, isControlled) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render to highlight the currently selected token
            this.render(this.element);
        }
    }

    destroy() {
        // Remove hooks when panel is destroyed
        Hooks.off('updateToken', this._onTokenUpdate);
        Hooks.off('updateActor', this._onActorUpdate);
        Hooks.off('controlToken', this._onControlToken);
    }

    async _completeItemTransfer(sourceActor, targetActor, sourceItem, quantityToTransfer, hasQuantity) {
        // Create a copy of the item data to transfer
        const transferData = sourceItem.toObject();
        
        // Set the correct quantity on the new item
        if (hasQuantity) {
            transferData.system.quantity = quantityToTransfer;
        }
        
        // Create the item on the target actor
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [transferData]);
        
        // Reduce quantity or remove the item from source actor
        if (hasQuantity && quantityToTransfer < sourceItem.system.quantity) {
            // Just reduce the quantity
            await sourceItem.update({
                'system.quantity': sourceItem.system.quantity - quantityToTransfer
            });
        } else {
            // Remove the item entirely
            await sourceItem.delete();
        }
        
        // Mark the item as new using both systems
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            // Use the static Map for backward compatibility
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
            // Use the new flag system
            await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
        }
        
        // Send chat notification
        const transferChatData = {
            isPublic: true,
            strCardIcon: this._getDropIcon(sourceItem.type),
            strCardTitle: "Item Transferred",
            strCardContent: `<p><strong>${sourceActor.name}</strong> gave ${hasQuantity ? `${quantityToTransfer} ${quantityToTransfer > 1 ? 'units of' : 'unit of'}` : ''} <strong>${sourceItem.name}</strong> to <strong>${targetActor.name}</strong>.</p>`
        };
        const transferChatContent = await renderTemplate(TEMPLATES.CHAT_CARD, transferChatData);
        await ChatMessage.create({
            content: transferChatContent,
            speaker: ChatMessage.getSpeaker({ actor: targetActor })
        });
    }
    
    async _sendTransferRequest(sourceActor, targetActor, item, quantity = 1, hasQuantity, timestamp) {
        try {
            // Create transfer data
            const transferId = `transfer_${timestamp}`;
            const transferData = {
                id: transferId,
                sourceActorId: sourceActor.id,
                targetActorId: targetActor.id,
                itemId: item.id,
                itemName: item.name,
                quantity: quantity,
                status: 'pending',
                timestamp: timestamp,
                sourceUserId: game.user.id,
                sourceActorName: sourceActor.name,
                targetActorName: targetActor.name
            };

            // Create hidden message to GM with transfer data
            await ChatMessage.create({
                content: `<div class="transfer-request-content">
                    <p>Transfer request from ${sourceActor.name} to ${targetActor.name}</p>
                    <p>Item: ${quantity}x ${item.name}</p>
                </div>`,
                whisper: game.users.filter(u => u.isGM).map(u => u.id),
                flags: {
                    [MODULE.ID]: {
                        transferId: transferId,
                        type: 'transferRequest',
                        data: transferData
                    }
                }
            });

            // Find target users (who own the target character)
            const targetUsers = game.users.filter(user => 
                user.character?.id === targetActor.id && 
                user.active && 
                !user.isGM
            );

            if (targetUsers.length === 0) {
                throw new Error("No active users found for the target character");
            }

            // Create visible message to target player
            const messageContent = `
                <div class="transfer-request-content">
                    <p>${sourceActor.name} wants to transfer ${quantity}x ${item.name} to ${targetActor.name}</p>
                    <div class="transfer-request-buttons">
                        <button class="transfer-request-button accept" data-transfer-id="${transferId}">Accept</button>
                        <button class="transfer-request-button reject" data-transfer-id="${transferId}">Reject</button>
                    </div>
                </div>
            `;

            // Create visible message - whisper only to target users and GMs
            await ChatMessage.create({
                content: messageContent,
                speaker: {
                    actor: sourceActor.id,
                    alias: sourceActor.name
                },
                whisper: [...targetUsers.map(u => u.id), ...game.users.filter(u => u.isGM).map(u => u.id)],
                flags: {
                    [MODULE.ID]: {
                        transferId: transferId,
                        type: 'transferRequest',
                        targetUsers: targetUsers.map(u => u.id)  // Store target users for permission checking
                    }
                }
            });

            // Notify the source player that the request was sent
            ui.notifications.info(`Transfer request sent to ${targetActor.name}`);

        } catch (error) {
            console.error("Error sending transfer request:", error);
            ui.notifications.error("Failed to send transfer request. Please try again or contact your GM.");
        }
    }

    _handleTransferButtons(message, html) {
        // Handle both transfer request and execution messages
        if (!message.flags?.[MODULE.ID]?.type) return;

        console.log("SQUIRE | Found message:", message);

        // Handle transfer request buttons
        if (message.flags[MODULE.ID].type === 'transferRequest') {
            // Check if we've already attached handlers
            if (html.find('.transfer-request-button').data('handlers-attached')) return;

            const buttons = html.find('.transfer-request-button');
            console.log("SQUIRE | Found transfer buttons:", buttons.length);
            
            buttons.data('handlers-attached', true);
            
            // Disable buttons for the sender
            const targetUserIds = message.getFlag(MODULE.ID, 'targetUsers') || [];
            if (game.user.id === message.getFlag(MODULE.ID, 'sourceUserId')) {
                buttons.prop('disabled', true).css('opacity', '0.5');
            }

            // Attach click handlers
            buttons.click(async (event) => {
                console.log("SQUIRE | Button clicked:", event.currentTarget.className);
                const button = event.currentTarget;
                const transferId = button.dataset.transferId;
                const isAccept = button.classList.contains('accept');
                
                // Find the GM message with the transfer data
                const gmMessage = game.messages.find(m => 
                    m.getFlag(MODULE.ID, 'transferId') === transferId && 
                    m.getFlag(MODULE.ID, 'type') === 'transferRequest' &&
                    m.getFlag(MODULE.ID, 'data')
                );

                if (!gmMessage) {
                    ui.notifications.error("Transfer request not found");
                    return;
                }

                const transferData = gmMessage.getFlag(MODULE.ID, 'data');
                
                // Create a new response message instead of updating the original
                await ChatMessage.create({
                    content: `<div class="transfer-request-content">
                        <p>${message.speaker.alias} wanted to transfer ${transferData.quantity}x ${transferData.itemName} to ${message.speaker.alias}</p>
                        <p class="transfer-request-status ${isAccept ? 'accepted' : 'rejected'}">
                            ${isAccept ? 'Accepted' : 'Rejected'} by ${game.user.name}
                        </p>
                    </div>`,
                    whisper: [...game.users.filter(u => u.isGM).map(u => u.id), transferData.sourceUserId],
                    flags: {
                        [MODULE.ID]: {
                            transferId: transferId,
                            type: 'transferResponse',
                            response: isAccept ? 'accepted' : 'rejected',
                            responseUserId: game.user.id
                        }
                    }
                });

                // If accepted, either create GM execution message or auto-execute
                if (isAccept) {
                    const transfersGMApproves = game.settings.get(MODULE.ID, 'transfersGMApproves');
                    
                    if (transfersGMApproves) {
                        // Create a GM-only message to execute the transfer
                        const gmExecuteMessage = await ChatMessage.create({
                            content: `<div class="transfer-execution">
                                <p>Executing transfer of ${transferData.quantity}x ${transferData.itemName} from ${transferData.sourceActorName} to ${transferData.targetActorName}</p>
                                <button class="transfer-execute-button" data-transfer-id="${transferId}">Execute Transfer</button>
                            </div>`,
                            whisper: game.users.filter(u => u.isGM).map(u => u.id),
                            flags: {
                                [MODULE.ID]: {
                                    transferId: transferId,
                                    type: 'transferExecution'
                                }
                            }
                        });
                    } else {
                        // Auto-execute the transfer as if GM clicked the button
                        try {
                            const sourceActor = game.actors.get(transferData.sourceActorId);
                            const targetActor = game.actors.get(transferData.targetActorId);
                            const sourceItem = sourceActor.items.get(transferData.itemId);

                            if (!sourceActor || !targetActor || !sourceItem) {
                                throw new Error("Could not find source actor, target actor, or item");
                            }

                            // Find a GM user to execute the transfer
                            const gmUser = game.users.find(u => u.isGM && u.active);
                            if (!gmUser) {
                                throw new Error("No active GM available to execute transfer");
                            }

                            // Only proceed with transfer if we are the GM
                            if (game.user.isGM) {
                                await this._completeItemTransfer(sourceActor, targetActor, sourceItem, transferData.quantity, transferData.quantity != null);
                                
                                // Create success message visible to involved parties
                                await ChatMessage.create({
                                    content: `<div class="transfer-execution">
                                        <p>Transfer of ${transferData.quantity}x ${transferData.itemName} from ${transferData.sourceActorName} to ${transferData.targetActorName} completed successfully</p>
                                    </div>`,
                                    whisper: [transferData.sourceUserId, ...game.users.filter(u => u.isGM).map(u => u.id)],
                                    flags: {
                                        [MODULE.ID]: {
                                            transferId: transferId,
                                            type: 'transferComplete'
                                        }
                                    }
                                });
                            }
                        } catch (error) {
                            console.error("SQUIRE | Error auto-executing transfer:", error);
                            await ChatMessage.create({
                                content: `<div class="transfer-execution error">
                                    <p>Error executing transfer: ${error.message}</p>
                                </div>`,
                                whisper: [transferData.sourceUserId, ...game.users.filter(u => u.isGM).map(u => u.id)],
                                flags: {
                                    [MODULE.ID]: {
                                        transferId: transferId,
                                        type: 'transferError'
                                    }
                                }
                            });
                        }
                    }
                }
            });
        }
        
        // Handle execute button
        if (message.flags[MODULE.ID].type === 'transferExecution') {
            // Check if we've already attached handlers
            if (html.find('.transfer-execute-button').data('handlers-attached')) return;

            const executeButton = html.find('.transfer-execute-button');
            console.log("SQUIRE | Found execute button:", executeButton.length);

            // Only allow GMs to see and use the execute button
            if (!game.user.isGM) {
                executeButton.prop('disabled', true).css('opacity', '0.5');
                return;
            }

            executeButton.data('handlers-attached', true);

            executeButton.click(async () => {
                try {
                    // Find the original transfer data
                    const gmMessage = game.messages.find(m => 
                        m.getFlag(MODULE.ID, 'transferId') === message.getFlag(MODULE.ID, 'transferId') && 
                        m.getFlag(MODULE.ID, 'type') === 'transferRequest' &&
                        m.getFlag(MODULE.ID, 'data')
                    );

                    if (!gmMessage) {
                        throw new Error("Could not find original transfer request");
                    }

                    const transferData = gmMessage.getFlag(MODULE.ID, 'data');
                    console.log("SQUIRE | Execute button clicked, transfer data:", transferData);

                    const sourceActor = game.actors.get(transferData.sourceActorId);
                    const targetActor = game.actors.get(transferData.targetActorId);
                    const sourceItem = sourceActor.items.get(transferData.itemId);

                    if (!sourceActor || !targetActor || !sourceItem) {
                        throw new Error("Could not find source actor, target actor, or item");
                    }

                    await this._completeItemTransfer(sourceActor, targetActor, sourceItem, transferData.quantity, transferData.quantity != null);
                    await message.update({
                        content: `<div class="transfer-execution">
                            <p>Transfer of ${transferData.quantity}x ${transferData.itemName} from ${sourceActor.name} to ${targetActor.name} completed successfully</p>
                        </div>`
                    });
                } catch (error) {
                    console.error("SQUIRE | Error executing transfer:", error);
                    await message.update({
                        content: `<div class="transfer-execution error">
                            <p>Error executing transfer: ${error.message}</p>
                        </div>`
                    });
                }
            });
        }
    }
} 