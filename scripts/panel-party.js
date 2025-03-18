import { MODULE, TEMPLATES } from './const.js';

export class PartyPanel {
    constructor() {
        this.element = null;
        this._onTokenUpdate = this._onTokenUpdate.bind(this);
        this._onActorUpdate = this._onActorUpdate.bind(this);
        this._onControlToken = this._onControlToken.bind(this);
        
        // Register hooks for updates
        Hooks.on('updateToken', this._onTokenUpdate);
        Hooks.on('updateActor', this._onActorUpdate);
        Hooks.on('controlToken', this._onControlToken);
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
            // Only remove the style if we're actually leaving the card
            if (!event.relatedTarget?.closest('.character-card')) {
                $(event.currentTarget).removeClass('drop-target');
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
                            const requestSuccess = await this._sendTransferRequest(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, timestamp);
                            
                            if (requestSuccess) {
                                ui.notifications.info(`Sent transfer request to ${targetActor.name}'s owner.`);
                            }
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
                        const requestSuccess = await this._sendTransferRequest(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, timestamp);
                        
                        if (requestSuccess) {
                            ui.notifications.info(`Sent transfer request to ${targetActor.name}'s owner.`);
                        }
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
        
        // Add to newlyAddedItems in PanelManager
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
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
    
    async _sendTransferRequest(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, timestamp) {
        // Store transfer data in a game flag for reference
        const transferData = {
            sourceActorId: sourceActor.id,
            targetActorId: targetActor.id,
            sourceItemId: sourceItem.id,
            selectedQuantity: selectedQuantity,
            hasQuantity: hasQuantity,
            timestamp: timestamp,
            requester: game.user.id,
            requesterName: game.user.name,
            status: 'pending'
        };
        
        // Check if we have permission to set the flag directly
        if (targetActor.isOwner) {
            try {
                // Store the request in a flag on the target actor
                await targetActor.setFlag(MODULE.ID, `transferRequest_${timestamp}`, transferData);
            } catch (error) {
                console.error("SQUIRE | Error setting flag on target actor:", error);
                ui.notifications.error("Error setting transfer request flag");
                return false;
            }
        } else {
            // We don't have permission to set the flag directly
            // Let's try to find a GM to do it for us
            const gmUsers = game.users.filter(u => u.isGM && u.active);
            if (gmUsers.length === 0) {
                ui.notifications.error("No active GM available to process transfer request");
                return false;
            }
            
            // Use chat message as a fallback since socketlib isn't working
            const whisperIds = gmUsers.map(u => u.id);
            await ChatMessage.create({
                whisper: whisperIds,
                content: `<p><strong>GM ACTION REQUIRED:</strong> Player ${game.user.name} is trying to transfer an item from ${sourceActor.name} to ${targetActor.name}. 
                Please set a flag on ${targetActor.name} with the key "transferRequest_${timestamp}" using the following data:</p>
                <details>
                <summary>Flag data (click to expand)</summary>
                <pre>${JSON.stringify(transferData, null, 2)}</pre>
                </details>`,
                speaker: ChatMessage.getSpeaker({alias: "System Message"})
            });
        }
        
        // Get users who own the target character
        const targetUsers = game.users.filter(u => 
            !u.isGM && targetActor.ownership[u.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        );
        
        // Since socketlib is having issues, we'll use chat messages
        const whisperIds = targetUsers.map(u => u.id);
        
        // Create a whispered chat message
        if (whisperIds.length > 0) {
            await ChatMessage.create({
                whisper: whisperIds,
                content: `<p><strong>${sourceActor.name}</strong> wants to give you ${hasQuantity && selectedQuantity > 1 ? `${selectedQuantity} units of` : ''} <strong>${sourceItem.name}</strong>. Please check with a GM to complete this transfer.</p>`,
                speaker: ChatMessage.getSpeaker({alias: "Item Transfer Request"})
            });
        }
        
        // Also notify the sender that they need to coordinate manually
        ui.notifications.warn(`Transfer request sent. Please coordinate with the GM to complete the transfer.`);
        
        return true;
    }
} 