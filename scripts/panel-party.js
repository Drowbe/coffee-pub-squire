import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PartyPanel {
    constructor() {
        this.element = null;
        this._onTokenUpdate = this._onTokenUpdate.bind(this);
        this._onActorUpdate = this._onActorUpdate.bind(this);
        this._onControlToken = this._onControlToken.bind(this);
        this._handleTransferButtons = this._handleTransferButtons.bind(this);
        
        // Note: Hooks are now managed centrally by HookManager
        // No need to register hooks here anymore
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        this.element = element;
        const partyContainer = element.find('[data-panel="party"]');
        if (!partyContainer.length) return;

        // Get all player-owned tokens on the canvas
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        
        // Get non-player tokens (for GM only)
        const nonPlayerTokens = game.user.isGM ? 
            canvas.tokens.placeables.filter(token => token.actor && !token.actor.hasPlayerOwner) : 
            [];

        // Add health status to tokens without breaking the structure
        tokens.forEach(token => {
            if (token.actor?.system?.attributes?.hp) {
                const hp = token.actor.system.attributes.hp;
                let healthbarStatus = 'squire-tray-healthbar-healthy';
                
                if (hp.max > 0) {
                    const hpPercentage = (hp.value / hp.max) * 100;
                    
                    if (hp.value <= 0) {
                        healthbarStatus = 'squire-tray-healthbar-dead';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdCritical')) {
                        healthbarStatus = 'squire-tray-healthbar-critical';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdBloodied')) {
                        healthbarStatus = 'squire-tray-healthbar-bloodied';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdInjured')) {
                        healthbarStatus = 'squire-tray-healthbar-injured';
                    }
                }
                
                // Add healthbarStatus directly to the token object
                token.healthbarStatus = healthbarStatus;
            }
        });

        // Add health status to non-player tokens as well
        nonPlayerTokens.forEach(token => {
            if (token.actor?.system?.attributes?.hp) {
                const hp = token.actor.system.attributes.hp;
                let healthbarStatus = 'squire-tray-healthbar-healthy';
                
                if (hp.max > 0) {
                    const hpPercentage = (hp.value / hp.max) * 100;
                    
                    if (hp.value <= 0) {
                        healthbarStatus = 'squire-tray-healthbar-dead';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdCritical')) {
                        healthbarStatus = 'squire-tray-healthbar-critical';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdBloodied')) {
                        healthbarStatus = 'squire-tray-healthbar-bloodied';
                    } else if (hpPercentage <= game.settings.get(MODULE.ID, 'healthThresholdInjured')) {
                        healthbarStatus = 'squire-tray-healthbar-injured';
                    }
                }
                
                // Add healthbarStatus directly to the token object
                token.healthbarStatus = healthbarStatus;
            }
        });
        
        // Get currently controlled tokens' token IDs (UUIDs)
        const controlledTokenIds = canvas.tokens.controlled
            .filter(token => token.actor)
            .map(token => token.id);

        // Calculate party health totals
        const partyRemainingHP = tokens.reduce((total, token) => {
            const hp = token.actor?.system?.attributes?.hp;
            return total + (hp?.value || 0);
        }, 0);
        
        const partyTotalHP = tokens.reduce((total, token) => {
            const hp = token.actor?.system?.attributes?.hp;
            return total + (hp?.max || 0);
        }, 0);

        // Calculate party health status for unified colors
        let partyHealthbarStatus = 'squire-tray-healthbar-healthy';
        if (partyTotalHP > 0) {
            const partyHPPercentage = (partyRemainingHP / partyTotalHP) * 100;
            
            if (partyRemainingHP <= 0) {
                partyHealthbarStatus = 'squire-tray-healthbar-dead';
            } else if (partyHPPercentage <= game.settings.get(MODULE.ID, 'healthThresholdCritical')) {
                partyHealthbarStatus = 'squire-tray-healthbar-critical';
            } else if (partyHPPercentage <= game.settings.get(MODULE.ID, 'healthThresholdBloodied')) {
                partyHealthbarStatus = 'squire-tray-healthbar-bloodied';
            } else if (partyHPPercentage <= game.settings.get(MODULE.ID, 'healthThresholdInjured')) {
                partyHealthbarStatus = 'squire-tray-healthbar-injured';
            }
        }

        // Prepare other party members data for the handle
        const currentActor = game.actors.get(controlledTokenIds[0]);
        const otherPartyMembers = tokens
            .filter(token => token.actor && token.actor.id !== currentActor?.id)
            .map(token => ({
                id: token.actor.id,
                name: token.actor.name,
                img: token.actor.img,
                system: token.actor.system,
                isOwner: token.actor.isOwner
            }));

        const html = await renderTemplate(TEMPLATES.PANEL_PARTY, { 
            tokens,
            nonPlayerTokens,
            controlledTokenIds,
            isGM: game.user.isGM,
            actor: currentActor,
            otherPartyMembers,
            partyRemainingHP,
            partyTotalHP,
            partyHealthbarStatus,
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros')
        });
        partyContainer.html(html);

        this.activateListeners(partyContainer);
    }

    activateListeners(html) {
        // Handle character sheet button clicks
        html.find('.open-sheet').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tokenId = $(event.target).closest('.character-card').data('token-id');
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            if (token?.actor) {
                token.actor.sheet.render(true);
            }
        });

        // Handle portrait clicks
        html.find('.character-image.clickable').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tokenId = $(event.currentTarget).closest('.character-card').data('token-id');
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            if (token?.actor) {
                const imagePopout = new ImagePopout(token.actor.img, {
                    title: token.actor.name,
                    shareable: true,
                    uuid: token.actor.uuid
                });
                imagePopout.render(true);
            }
        });

        // Handle character card clicks for token selection
        html.find('.character-card.clickable').click(async (event) => {
            // Don't handle clicks if they originated from the open-sheet button or portrait
            if ($(event.target).closest('.open-sheet, .character-image.clickable').length) return;

            const tokenId = $(event.currentTarget).data('token-id');
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            if (token) {
                // Check ownership - only allow selection of tokens the user owns
                if (!token.actor.isOwner) return;
                
                // Multi-select with shift+click, single select without shift
                const releaseOthers = !event.shiftKey;
                token.control({releaseOthers});
            }
        });

        // Handle party overview health bar clicks
        html.find('.party-health-card').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get all player-owned tokens on the canvas
            const partyTokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
            
            if (partyTokens.length === 0) return;
            
            // Select all party tokens
            partyTokens.forEach(token => {
                token.control({releaseOthers: false});
            });
            
            // Open health window and populate with party data
            if (PanelManager.instance?.healthPanel) {
                const healthPanel = PanelManager.instance.healthPanel;
                
                // Get all party actors
                const partyActors = partyTokens.map(token => token.actor).filter(actor => actor);
                
                // Update the health panel with all party actors
                healthPanel.updateActors(partyActors);
                
                // If health panel is not already open, pop it out
                if (!healthPanel.isPoppedOut) {
                    await healthPanel._onPopOut();
                }
            }
        });
        
        // Add drag and drop functionality to character cards
        const characterCards = html.find('.character-card');
        
        // Remove any existing drag event listeners
        characterCards.off('dragenter.squire dragleave.squire dragover.squire drop.squire');
        
        // Add new drag event listeners
        characterCards.on('dragenter.squire', (event) => {
            event.preventDefault();
            
            try {
                const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                const dropType = data.type;
                
                // Only handle item-related drops
                if (['Item', 'ItemDirectory', 'Actor'].includes(dropType)) {
                    // Add drop hover styles
                    $(event.currentTarget).addClass('drop-target');
                    
                    // Play hover sound
                    const blacksmith = getBlacksmith();
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

        characterCards.on('dragleave.squire', (event) => {
            event.preventDefault();
            // Remove the style if we're leaving the card or entering a child element
            const card = $(event.currentTarget);
            const relatedTarget = $(event.relatedTarget);
            
            // Check if we're actually leaving the card
            if (!relatedTarget.closest('.character-card').is(card)) {
                card.removeClass('drop-target');
            }
        });

        characterCards.on('dragover.squire', (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        characterCards.on('drop.squire', async (event) => {
            event.preventDefault();
            
            // Get the character card and remove hover state
            const $card = $(event.currentTarget);
            $card.removeClass('drop-target');
            
            try {
                const dataTransfer = event.originalEvent.dataTransfer.getData('text/plain');
                const data = JSON.parse(dataTransfer);
                
                // Play drop sound
                const blacksmith = getBlacksmith();
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Get the actor for this card
                const targetTokenId = $card.data('token-id');
                const targetToken = canvas.tokens.placeables.find(t => t.id === targetTokenId);
                const targetActor = targetToken?.actor;
                
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
                            const hasSourcePermission = sourceActor.isOwner;
                            
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
                            
                            if (!hasSourcePermission || !hasTargetPermission) {
                                // Prepare transfer data
                                const transferId = `transfer_${Date.now()}`;
                                const transferData = {
                                    id: transferId,
                                    sourceActorId: sourceActor.id,
                                    targetActorId: targetActor.id,
                                    itemId: sourceItem.id,
                                    itemName: sourceItem.name,
                                    quantity: selectedQuantity,
                                    hasQuantity: hasQuantity,
                                    isPlural: selectedQuantity > 1,
                                    sourceActorName: sourceActor.name,
                                    targetActorName: targetActor.name,
                                    status: 'pending',
                                    timestamp: Date.now(),
                                    sourceUserId: game.user.id
                                };
                                // Sender: request sent message (no Accept/Reject buttons)
                                await ChatMessage.create({
                                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                        isPublic: false,
                                        cardType: "transfer-request",
                                        strCardIcon: "fas fa-people-arrows",
                                        strCardTitle: "Transfer Request",
                                        sourceActor,
                                        sourceActorName: sourceActor.name,
                                        targetActor,
                                        targetActorName: targetActor.name,
                                        item: sourceItem,
                                        itemName: sourceItem.name,
                                        quantity: selectedQuantity,
                                        hasQuantity: !!hasQuantity,
                                        isPlural: selectedQuantity > 1,
                                        isTransferSender: true,
                                        transferId
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
                                // Receiver: actionable message (with Accept/Reject buttons)
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
                                                itemId: sourceItem.id,
                                                itemName: sourceItem.name,
                                                quantity: selectedQuantity,
                                                hasQuantity: !!hasQuantity,
                                                isPlural: selectedQuantity > 1,
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
                                                strCardIcon: "fas fa-people-arrows",
                                                strCardTitle: "Transfer Request",
                                                sourceActor,
                                                sourceActorName: sourceActor.name,
                                                targetActor,
                                                targetActorName: targetActor.name,
                                                item: sourceItem,
                                                itemName: sourceItem.name,
                                                quantity: selectedQuantity,
                                                hasQuantity: !!hasQuantity,
                                                isPlural: selectedQuantity > 1,
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
                                                    targetUsers: targetUsers.map(u => u.id),
                                                    data: transferData
                                                }
                                            }
                                        });
                                    }
                                }
                                // GM: only if approval is required (no Accept/Reject buttons)
                                const gmUsers = game.users.filter(u => u.isGM);
                                const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
                                if (gmApprovalRequired && gmUsers.length > 0) {
                                    await ChatMessage.create({
                                        content: `<div class="transfer-request-content">
                                            <p>Transfer request approval needed:</p>
                                            <p>From: ${sourceActor.name} (${game.user.name})</p>
                                            <p>To: ${targetActor.name}</p>
                                            <p>Item: ${selectedQuantity}x ${sourceItem.name}</p>
                                        </div>`,
                                        speaker: { alias: "System Transfer" },
                                        whisper: gmUsers.map(u => u.id),
                                        flags: {
                                            [MODULE.ID]: {
                                                transferId,
                                                type: 'transferRequest',
                                                isGMNotification: true,
                                                data: transferData
                                            }
                                        }
                                    });
                                }
                                // Do not execute the transfer yet
                                return;
                            }
                            
                            if (hasSourcePermission && hasTargetPermission) {
                                await this._completeItemTransfer(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                                return;
                            } else {
                                const socket = game.modules.get(MODULE.ID)?.socket;
                                if (!socket) {
                                    ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                                    return;
                                }
                                await socket.executeAsGM('executeItemTransfer', {
                                    sourceActorId: sourceActor.id,
                                    targetActorId: targetActor.id,
                                    sourceItemId: sourceItem.id,
                                    quantity: selectedQuantity,
                                    hasQuantity: hasQuantity
                                });
                                return;
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
                            const cardDataWorld = this._getTransferCardData({ cardType: "transfer-gm", targetActor, item });
                            const chatContent = await renderTemplate(TEMPLATES.CHAT_CARD, cardDataWorld);
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
                            const cardDataCompendium = this._getTransferCardData({ cardType: "transfer-gm", targetActor, item: itemData });
                            const dirItemChatContent = await renderTemplate(TEMPLATES.CHAT_CARD, cardDataCompendium);
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
                        const hasSourcePermission = sourceActor.isOwner;
                        
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
                        
                        if (!hasSourcePermission || !hasTargetPermission) {
                            // Prepare transfer data
                            const transferId = `transfer_${Date.now()}`;
                            const transferData = {
                                id: transferId,
                                sourceActorId: sourceActor.id,
                                targetActorId: targetActor.id,
                                itemId: sourceItem.id,
                                itemName: sourceItem.name,
                                quantity: selectedQuantity,
                                hasQuantity: hasQuantity,
                                isPlural: selectedQuantity > 1,
                                sourceActorName: sourceActor.name,
                                targetActorName: targetActor.name,
                                status: 'pending',
                                timestamp: Date.now(),
                                sourceUserId: game.user.id
                            };
                            // Sender: request sent message (no Accept/Reject buttons)
                            await ChatMessage.create({
                                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                    isPublic: false,
                                    cardType: "transfer-request",
                                    strCardIcon: "fas fa-people-arrows",
                                    strCardTitle: "Transfer Request",
                                    sourceActor,
                                    sourceActorName: sourceActor.name,
                                    targetActor,
                                    targetActorName: targetActor.name,
                                    item: sourceItem,
                                    itemName: sourceItem.name,
                                    quantity: selectedQuantity,
                                    hasQuantity: !!hasQuantity,
                                    isPlural: selectedQuantity > 1,
                                    isTransferSender: true,
                                    transferId
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
                            // Receiver: actionable message (with Accept/Reject buttons)
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
                                            itemId: sourceItem.id,
                                            itemName: sourceItem.name,
                                            quantity: selectedQuantity,
                                            hasQuantity: !!hasQuantity,
                                            isPlural: selectedQuantity > 1,
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
                                            strCardIcon: "fas fa-people-arrows",
                                            strCardTitle: "Transfer Request",
                                            sourceActor,
                                            sourceActorName: sourceActor.name,
                                            targetActor,
                                            targetActorName: targetActor.name,
                                            item: sourceItem,
                                            itemName: sourceItem.name,
                                            quantity: selectedQuantity,
                                            hasQuantity: !!hasQuantity,
                                            isPlural: selectedQuantity > 1,
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
                                                targetUsers: targetUsers.map(u => u.id),
                                                data: transferData
                                            }
                                        }
                                    });
                                }
                            }
                            // GM: only if approval is required (no Accept/Reject buttons)
                            const gmUsers = game.users.filter(u => u.isGM);
                            const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
                            if (gmApprovalRequired && gmUsers.length > 0) {
                                await ChatMessage.create({
                                    content: `<div class="transfer-request-content">
                                        <p>Transfer request approval needed:</p>
                                        <p>From: ${sourceActor.name} (${game.user.name})</p>
                                        <p>To: ${targetActor.name}</p>
                                        <p>Item: ${selectedQuantity}x ${sourceItem.name}</p>
                                    </div>`,
                                    speaker: { alias: "System Transfer" },
                                    whisper: gmUsers.map(u => u.id),
                                    flags: {
                                        [MODULE.ID]: {
                                            transferId,
                                            type: 'transferRequest',
                                            isGMNotification: true,
                                            data: transferData
                                        }
                                    }
                                });
                            }
                            // Do not execute the transfer yet
                            return;
                        }
                        
                        if (hasSourcePermission && hasTargetPermission) {
                            await this._completeItemTransfer(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                            return;
                        } else {
                            const socket = game.modules.get(MODULE.ID)?.socket;
                            if (!socket) {
                                ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                                return;
                            }
                            await socket.executeAsGM('executeItemTransfer', {
                                sourceActorId: sourceActor.id,
                                targetActorId: targetActor.id,
                                sourceItemId: sourceItem.id,
                                quantity: selectedQuantity,
                                hasQuantity: hasQuantity
                            });
                            return;
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
                        // Just update the inventory panel content, don't recreate the entire tray
                        if (panelManager.instance.inventoryPanel) {
                            await panelManager.instance.inventoryPanel.render(panelManager.instance.element);
                        }
                    }
                }
                
            } catch (error) {
                console.error('Error handling drop on character card:', error);
                ui.notifications.error("Failed to add item to character.");
            }
        });

        // Handle individual character health bar clicks in the party tab
        html.find('.character-card .party-hp-bar').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tokenId = $(event.currentTarget).closest('.character-card').data('token-id');
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            if (token?.actor && PanelManager.instance && PanelManager.instance.healthPanel) {
                PanelManager.instance.healthPanel.updateActor(token.actor);
                await PanelManager.instance.healthPanel._onPopOut();
            }
        });

        // Note: Handle party member icon clicks are handled by the handle manager, not the party panel

        // Note: Handle party member health bar clicks are handled by the handle manager, not the party panel
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
        // Note: Hooks are now managed centrally by HookManager
        // No need to manually remove hooks here anymore
        this.element = null;
    }

    async _completeItemTransfer(sourceActor, targetActor, sourceItem, quantityToTransfer, hasQuantity) {
        // Create a copy of the item data to transfer
        const transferData = sourceItem.toObject();
        if (hasQuantity) {
            transferData.system.quantity = quantityToTransfer;
        }
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [transferData]);
        if (hasQuantity && quantityToTransfer < sourceItem.system.quantity) {
            await sourceItem.update({
                'system.quantity': sourceItem.system.quantity - quantityToTransfer
            });
        } else {
            await sourceItem.delete();
        }
        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
            await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
        }
        
        // Create chat message for direct transfer completion
        try {
            const socket = game.modules.get(MODULE.ID)?.socket;
            if (socket) {
                await socket.executeAsGM('createTransferCompleteChat', {
                    sourceActorId: sourceActor.id,
                    sourceActorName: sourceActor.name,
                    targetActorId: targetActor.id,
                    targetActorName: targetActor.name,
                    itemId: sourceItem.id,
                    itemName: sourceItem.name,
                    quantity: quantityToTransfer,
                    hasQuantity: hasQuantity,
                    isPlural: quantityToTransfer > 1,
                    isTransferSender: true,
                    receiverIds: [game.user.id] // Send to current user
                });
            } else {
                // Fallback: create message directly if socket not available
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-complete",
                        strCardIcon: "fas fa-backpack",
                        strCardTitle: "Transfer Complete",
                        sourceActor,
                        sourceActorName: sourceActor.name,
                        targetActor,
                        targetActorName: targetActor.name,
                        item: sourceItem,
                        itemName: sourceItem.name,
                        quantity: quantityToTransfer,
                        hasQuantity: hasQuantity,
                        isPlural: quantityToTransfer > 1,
                        isTransferSender: true
                    }),
                    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                    whisper: [game.user.id]
                });
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error creating transfer complete chat message:', error);
        }
    }
    
    async _sendTransferRequest(sourceActor, targetActor, item, quantity = 1, hasQuantity, timestamp) {
        try {
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

            // Find target users (who own the target character)
            const targetUsers = game.users.filter(user => 
                user.character?.id === targetActor.id && 
                user.active && 
                !user.isGM
            );
            if (targetUsers.length === 0) {
                throw new Error("No active users found for the target character");
            }

            // Get GM users
            const gmUsers = game.users.filter(u => u.isGM);
            const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');
            const systemSpeaker = {
                alias: "System Transfer",
                user: gmUsers[0]?.id || game.user.id
            };

            // Sender: request sent message (no Accept/Reject buttons)
            await ChatMessage.create({
                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                    isPublic: false,
                    cardType: "transfer-request",
                    strCardIcon: "fas fa-people-arrows",
                    strCardTitle: "Transfer Request",
                    sourceActor,
                    sourceActorName: sourceActor.name,
                    targetActor,
                    targetActorName: targetActor.name,
                    item,
                    itemName: item.name,
                    quantity,
                    hasQuantity: !!hasQuantity,
                    isPlural: quantity > 1,
                    isTransferSender: true,
                    transferId
                }),
                speaker: systemSpeaker,
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

            // Receiver: actionable message (with Accept/Reject buttons)
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
                            hasQuantity: !!hasQuantity,
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
                            strCardIcon: "fas fa-people-arrows",
                            strCardTitle: "Transfer Request",
                            sourceActor,
                            sourceActorName: sourceActor.name,
                            targetActor,
                            targetActorName: targetActor.name,
                            item: item,
                            quantity: quantity,
                            hasQuantity: !!hasQuantity,
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
                                targetUsers: targetUsers.map(u => u.id),
                                data: transferData
                            }
                        }
                    });
                }
            }

            // GM: only if approval is required (no Accept/Reject buttons)
            if (gmApprovalRequired && gmUsers.length > 0) {
                await ChatMessage.create({
                    content: `<div class="transfer-request-content">
                        <p>Transfer request approval needed:</p>
                        <p>From: ${sourceActor.name} (${game.user.name})</p>
                        <p>To: ${targetActor.name}</p>
                        <p>Item: ${quantity}x ${item.name}</p>
                    </div>`,
                    speaker: systemSpeaker,
                    whisper: gmUsers.map(u => u.id),
                    flags: {
                        [MODULE.ID]: {
                            transferId,
                            type: 'transferRequest',
                            isGMNotification: true,
                            data: transferData
                        }
                    }
                });
            }

            ui.notifications.info(`Transfer request sent to ${targetActor.name}`);
        } catch (error) {
            console.error('Error sending transfer request:', error);
            ui.notifications.error("Failed to send transfer request. Please try again or contact your GM.");
        }
    }

    _handleTransferButtons(message, html) {
        if (!message.flags?.[MODULE.ID]?.type) return;

        // Only handle transfer request buttons
        if (message.flags[MODULE.ID].type === 'transferRequest') {
            if (html.find('.transfer-request-button').data('handlers-attached')) return;
            const buttons = html.find('.transfer-request-button');
            buttons.data('handlers-attached', true);
            buttons.click(async (event) => {
                const button = event.currentTarget;
                const transferId = button.dataset.transferId;
                const isAccept = button.classList.contains('accept');
                
                // Get transfer data from the current message (the one with the buttons)
                const transferData = message.getFlag(MODULE.ID, 'data');
                if (!transferData) {
                    ui.notifications.error("Transfer request data not found");
                    return;
                }
                const sourceActor = game.actors.get(transferData.sourceActorId);
                const targetActor = game.actors.get(transferData.targetActorId);
                const item = sourceActor?.items.get(transferData.itemId);
                const senderUser = game.users.get(transferData.sourceUserId);
                const receiverUsers = game.users.filter(user => user.character?.id === targetActor.id && user.active && !user.isGM);
                const gmUsers = game.users.filter(u => u.isGM);
                const gmApprovalRequired = game.settings.get(MODULE.ID, 'transfersGMApproves');

                // Disable the buttons immediately to prevent double-clicking
                html.find('.transfer-request-button').prop('disabled', true);
                html.find('.transfer-request-button').addClass('disabled');
                html.find('.transfer-request-buttons').append('<div class="processing-message" style="margin-top: 5px; text-align: center; font-style: italic;">Processing...</div>');

                // First handle the original message to avoid ordering issues in chat
                try {
                    // Create a replacement message for the user FIRST
                    const isAcceptText = isAccept ? "accepted" : "rejected";
                    const replacementContent = `
                        <span style="visibility: none">coffeepub-hide-header</span>
                        <div class="blacksmith-card theme-default">
                          <div class="section-header">
                            <i class="${isAccept ? 'fas fa-check-circle' : 'fas fa-times-circle'}"></i> Transfer ${isAcceptText.charAt(0).toUpperCase() + isAcceptText.slice(1)}
                          </div>
                          <div class="section-content">
                            <p>You have ${isAcceptText} the transfer request.</p>
                          </div>
                        </div>
                    `;
                    
                    // First create a replacement message
                    if (!game.user.isGM) {
                        await ChatMessage.create({
                            content: replacementContent,
                            whisper: [game.user.id],
                            speaker: ChatMessage.getSpeaker()
                        });
                    }
                    
                    // Then ask a GM to delete the original message
                    const currentMessage = game.messages.get(message.id);
                    if (currentMessage) {
                        if (game.user.isGM) {
                            await currentMessage.delete();
                        } else {
                            const socket = game.modules.get(MODULE.ID)?.socket;
                            if (socket) {
                                socket.executeAsGM('deleteTransferRequestMessage', currentMessage.id);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error handling transfer request message:', error);
                }

                if (isAccept) {
                    // Execute the transfer first
                    const socket = game.modules.get(MODULE.ID)?.socket;
                    if (!socket) {
                        ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                        return;
                    }
                    await socket.executeAsGM('executeItemTransfer', {
                        sourceActorId: sourceActor.id,
                        targetActorId: targetActor.id,
                        sourceItemId: item.id,
                        quantity: transferData.quantity,
                        hasQuantity: true
                    });



                    // Single completion message for sender - SEND VIA SOCKETLIB
                    if (!game.user.isGM) {
                        const socket = game.modules.get(MODULE.ID)?.socket;
                        if (socket) {
                            await socket.executeAsGM('createTransferCompleteChat', {
                                sourceActorId: sourceActor.id,
                                sourceActorName: sourceActor.name,
                                targetActorId: targetActor.id,
                                targetActorName: targetActor.name,
                                itemId: item.id,
                                itemName: item.name,
                                quantity: transferData.quantity,
                                hasQuantity: true,
                                isPlural: transferData.quantity > 1,
                                isTransferSender: true,
                                receiverId: senderUser.id,
                                transferId
                            });
                        }
                    } else {
                        // GM creates and sends the message directly
                        await ChatMessage.create({
                            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                isPublic: false,
                                cardType: "transfer-complete",
                                strCardIcon: "fas fa-backpack",
                                strCardTitle: "Transfer Complete",
                                sourceActor,
                                sourceActorName: sourceActor.name,
                                targetActor,
                                targetActorName: targetActor.name,
                                item,
                                itemName: item.name,
                                quantity: transferData.quantity,
                                hasQuantity: true,
                                isPlural: transferData.quantity > 1
                            }),
                            whisper: [senderUser.id],
                            // When GM sends it, it's properly from the GM
                            speaker: ChatMessage.getSpeaker({user: game.user})
                        });
                    }

                    // Single completion message for receiver - ONLY IF the receiver is not the sender
                    if (receiverUsers.length > 0 && !receiverUsers.some(u => u.id === senderUser.id)) {
                        if (!game.user.isGM) {
                            const socket = game.modules.get(MODULE.ID)?.socket;
                            if (socket) {
                                await socket.executeAsGM('createTransferCompleteChat', {
                                    sourceActorId: sourceActor.id,
                                    sourceActorName: sourceActor.name,
                                    targetActorId: targetActor.id,
                                    targetActorName: targetActor.name,
                                    itemId: item.id,
                                    itemName: item.name,
                                    quantity: transferData.quantity,
                                    hasQuantity: true,
                                    isPlural: transferData.quantity > 1,
                                    isTransferReceiver: true,
                                    receiverIds: receiverUsers.map(u => u.id),
                                    transferId
                                });
                            }
                        } else {
                            // GM creates and sends the message directly
                            await ChatMessage.create({
                                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                    isPublic: false,
                                    cardType: "transfer-complete",
                                    strCardIcon: "fas fa-backpack",
                                    strCardTitle: "Transfer Complete",
                                    sourceActor,
                                    sourceActorName: sourceActor.name,
                                    targetActor,
                                    targetActorName: targetActor.name,
                                    item,
                                    itemName: item.name,
                                    quantity: transferData.quantity,
                                    hasQuantity: true,
                                    isPlural: transferData.quantity > 1
                                }),
                                whisper: receiverUsers.map(u => u.id),
                                // When GM sends it, it's properly from the GM
                                speaker: ChatMessage.getSpeaker({user: game.user})
                            });
                        }
                    }
                } else {
                    // Single rejection message for sender
                    if (!game.user.isGM) {
                        const socket = game.modules.get(MODULE.ID)?.socket;
                        if (socket) {
                            await socket.executeAsGM('createTransferRejectedChat', {
                                sourceActorId: sourceActor.id,
                                sourceActorName: sourceActor.name,
                                targetActorId: targetActor.id,
                                targetActorName: targetActor.name,
                                itemId: item.id,
                                itemName: item.name,
                                quantity: transferData.quantity,
                                hasQuantity: true,
                                isPlural: transferData.quantity > 1,
                                isTransferSender: true,
                                receiverId: senderUser.id,
                                transferId
                            });
                        }
                    } else {
                        // GM creates and sends the message directly
                        await ChatMessage.create({
                            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                isPublic: false,
                                cardType: "transfer-rejected",
                                strCardIcon: "fas fa-times-circle",
                                strCardTitle: "Transfer Rejected", 
                                sourceActor,
                                sourceActorName: sourceActor.name,
                                targetActor,
                                targetActorName: targetActor.name,
                                item,
                                itemName: item.name,
                                quantity: transferData.quantity,
                                hasQuantity: true,
                                isPlural: transferData.quantity > 1
                            }),
                            whisper: [senderUser.id],
                            // When GM sends it, it's properly from the GM
                            speaker: ChatMessage.getSpeaker({user: game.user})
                        });
                    }

                    // Single rejection message for receiver - ONLY IF the receiver is not the sender
                    if (receiverUsers.length > 0 && !receiverUsers.some(u => u.id === senderUser.id)) {
                        if (!game.user.isGM) {
                            const socket = game.modules.get(MODULE.ID)?.socket;
                            if (socket) {
                                await socket.executeAsGM('createTransferRejectedChat', {
                                    sourceActorId: sourceActor.id,
                                    sourceActorName: sourceActor.name,
                                    targetActorId: targetActor.id,
                                    targetActorName: targetActor.name,
                                    itemId: item.id,
                                    itemName: item.name,
                                    quantity: transferData.quantity,
                                    hasQuantity: true,
                                    isPlural: transferData.quantity > 1,
                                    isTransferReceiver: true,
                                    receiverIds: receiverUsers.map(u => u.id),
                                    transferId
                                });
                            }
                        } else {
                            // GM creates and sends the message directly
                            await ChatMessage.create({
                                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                                    isPublic: false,
                                    cardType: "transfer-rejected",
                                    strCardIcon: "fas fa-times-circle",
                                    strCardTitle: "Transfer Rejected",
                                    sourceActor,
                                    sourceActorName: sourceActor.name,
                                    targetActor,
                                    targetActorName: targetActor.name,
                                    item,
                                    itemName: item.name,
                                    quantity: transferData.quantity,
                                    hasQuantity: true,
                                    isPlural: transferData.quantity > 1
                                }),
                                whisper: receiverUsers.map(u => u.id),
                                // When GM sends it, it's properly from the GM
                                speaker: ChatMessage.getSpeaker({user: game.user})
                            });
                        }
                    }
                }
            });
        }
    }

    // Utility to generate unified card data for all transfer/chat card types
    _getTransferCardData({
        cardType = "generic", // e.g. "compendium-drop", "actor-transfer", "request", "response", "execution"
        sourceActor = null,
        targetActor = null,
        item = null,
        quantity = 1,
        hasQuantity = false,
        isPlural = false,
        responderName = null,
        transferStatus = null,
        showTransferButtons = false,
        showExecuteButton = false
    } = {}) {
        return {
            cardType,
            isPublic: cardType === "compendium-drop" || cardType === "world-drop" || cardType === "actor-transfer",
            strCardIcon: item ? this._getDropIcon(item.type) : "fas fa-backpack",
            strCardTitle: this._getDropTitle(item?.type),
            isTransferFromCharacter: cardType === "actor-transfer" || cardType === "request" || cardType === "response" || cardType === "execution",
            sourceActorName: sourceActor?.name || (cardType === "compendium-drop" ? "Compendium" : null),
            targetActorName: targetActor?.name || null,
            itemName: item?.name || null,
            hasQuantity,
            quantity,
            isPlural,
            responderName,
            transferStatus,
            showTransferButtons,
            showExecuteButton,
            // fallback
            strCardContent: (cardType === "compendium-drop" || cardType === "world-drop") && targetActor && item ? `<p><strong>${targetActor.name}</strong> received <strong>${item.name}</strong> via the Squire tray.</p>` : undefined
        };
    }

    destroy() {
        // Remove hooks when panel is destroyed
        Hooks.off('updateToken', this._onTokenUpdate);
        Hooks.off('updateActor', this._onActorUpdate);
        Hooks.off('controlToken', this._onControlToken);
        Hooks.off('renderChatMessage', this._handleTransferButtons);
        this.element = null;
    }
} 
