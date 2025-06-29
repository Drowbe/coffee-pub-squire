import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';
import { QuestPanel } from './panel-quest.js';
import { QuestForm } from './quest-form.js';
import { QuestParser } from './quest-parser.js';

let socket;

// Move socketlib registration to its own hook
Hooks.once('socketlib.ready', () => {
    console.log("SQUIRE | Socketlib ready hook fired", {
        socketlib: game.modules.get('socketlib'),
        api: game.modules.get('socketlib')?.api,
        globalSocketlib: typeof socketlib !== 'undefined' ? socketlib : undefined
    });
    
    try {
        if (typeof socketlib === 'undefined') {
            throw new Error("Global socketlib variable is not defined");
        }

        socket = socketlib.registerModule(MODULE.ID);
        console.log("SQUIRE | Socket registered", { 
            socket,
            functions: socket?.functions,
            socketName: socket?.socketName
        });
        
        if (!socket) {
            throw new Error("Failed to register socket");
        }
        
        // Store socket in module API for access from other files
        game.modules.get(MODULE.ID).socket = socket;
        
        // Register socket functions with socket handlers
        socket.register("executeItemTransfer", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get actors and item
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                const sourceItem = sourceActor.items.get(data.sourceItemId);
                
                if (!sourceActor || !targetActor || !sourceItem) {
                    console.error(`SQUIRE | Missing actor or item data for transfer`, data);
                    return;
                }
                
                // Create a copy of the item data to transfer
                const itemData = sourceItem.toObject();
                
                // Set the correct quantity on the new item if applicable
                if (data.hasQuantity) {
                    itemData.system.quantity = data.quantity;
                }
                
                // Create the item on the target actor
                const transferredItem = await targetActor.createEmbeddedDocuments('Item', [itemData]);
                
                // Reduce quantity or remove the item from source actor
                if (data.hasQuantity && data.quantity < sourceItem.system.quantity) {
                    // Just reduce the quantity
                    await sourceItem.update({
                        'system.quantity': sourceItem.system.quantity - data.quantity
                    });
                } else {
                    // Remove the item entirely
                    await sourceItem.delete();
                }
                
                // Mark the item as newly added
                if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                    game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(transferredItem[0].id, Date.now());
                    await transferredItem[0].setFlag(MODULE.ID, 'isNew', true);
                }
                
                console.log(`SQUIRE | Transfer completed successfully:`, {
                    from: sourceActor.name,
                    to: targetActor.name,
                    item: sourceItem.name,
                    quantity: data.hasQuantity ? data.quantity : 1
                });
            } catch (error) {
                console.error(`SQUIRE | Error executing item transfer:`, error);
            }
        });
        
        socket.register("createTransferRequestChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error("SQUIRE | Missing required actors for transfer request message", {data});
                    return;
                }

                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-request",
                        strCardIcon: "fas fa-people-arrows",
                        strCardTitle: "Transfer Request",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural,
                        isTransferReceiver: true,
                        transferId: data.transferId
                    }),
                    speaker: { alias: "System" },
                    whisper: data.receiverIds,
                    flags: {
                        [MODULE.ID]: {
                            transferId: data.transferId,
                            type: 'transferRequest',
                            isTransferReceiver: true,
                            targetUsers: data.receiverIds,
                            data: data.transferData
                        }
                    }
                });
            } catch (error) {
                console.error("SQUIRE | Error creating transfer request message:", error);
            }
        });
        
        socket.register("setTransferRequestFlag", setTransferRequestFlag);
        socket.register("processTransferResponse", processTransferResponse);
        
        socket.register("createTransferCompleteChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error("SQUIRE | Missing required actors for transfer complete message", {data});
                    return;
                }
                
                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-complete",
                        strCardIcon: "fas fa-backpack",
                        strCardTitle: "Transfer Complete",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural
                    }),
                    whisper: data.isTransferSender ? [data.receiverId] : data.receiverIds,
                    speaker: ChatMessage.getSpeaker({user: game.user}) // From GM
                });
            } catch (error) {
                console.error("SQUIRE | Error creating transfer complete message:", error);
            }
        });

        socket.register("createTransferRejectedChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    console.error("SQUIRE | Missing required actors for transfer rejected message", {data});
                    return;
                }
                
                // Create the chat message as GM
                await ChatMessage.create({
                    content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                        isPublic: false,
                        cardType: "transfer-rejected",
                        strCardIcon: "fas fa-times-circle",
                        strCardTitle: "Transfer Rejected",
                        sourceActor,
                        sourceActorName: data.sourceActorName,
                        targetActor,
                        targetActorName: data.targetActorName,
                        itemName: data.itemName,
                        quantity: data.quantity,
                        hasQuantity: data.hasQuantity,
                        isPlural: data.isPlural
                    }),
                    whisper: data.isTransferSender ? [data.receiverId] : data.receiverIds,
                    speaker: ChatMessage.getSpeaker({user: game.user}) // From GM
                });
            } catch (error) {
                console.error("SQUIRE | Error creating transfer rejected message:", error);
            }
        });
        
        // Add socket handler for deleting transfer request messages
        socket.register("deleteTransferRequestMessage", async (messageId) => {
            if (!game.user.isGM) return;
            
            try {
                const message = game.messages.get(messageId);
                if (message) {
                    await message.delete();
                    console.log(`SQUIRE | Successfully deleted transfer request message ${messageId}`);
                } else {
                    console.warn(`SQUIRE | Could not find message with ID ${messageId} to delete`);
                }
            } catch (error) {
                console.error(`SQUIRE | Error deleting transfer request message:`, error);
            }
        });
        
        console.log("SQUIRE | Socket handler registered successfully", {
            registeredFunctions: socket?.functions ? Array.from(socket.functions.keys()) : []
        });
    } catch (error) {
        console.error("SQUIRE | Error during socketlib initialization:", error);
    }
});

// Add a ready hook to verify socket is available
Hooks.once('ready', () => {
    console.log("SQUIRE | Checking socket availability:", {
        socket: game.modules.get(MODULE.ID).socket,
        socketlib: game.modules.get('socketlib'),
        api: game.modules.get('socketlib')?.api,
        globalSocketlib: typeof socketlib !== 'undefined' ? socketlib : undefined,
        registeredFunctions: game.modules.get(MODULE.ID).socket?.functions ? 
            Array.from(game.modules.get(MODULE.ID).socket.functions.keys()) : []
    });
});

Hooks.once('init', async function() {
    game.modules.get('coffee-pub-blacksmith')?.api?.utils?.postConsoleAndNotification(
        `${MODULE.TITLE} | Initializing ${MODULE.NAME}`,
        null,
        false,
        true,
        false,
        MODULE.TITLE
    );
    
    // Register module settings -- moved to READY
    //registerSettings();

    // Load CSS
    const cssFiles = [
        `modules/${MODULE.ID}/styles/window-transfer.css`,
        `modules/${MODULE.ID}/styles/panel-notes.css`
    ];
    
    // Add CSS files to head
    cssFiles.forEach(cssPath => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssPath;
        document.head.appendChild(link);
    });

    // Register handle-player template
    const handlePlayerTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-player.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-player', handlePlayerTemplate);
    
    // Register handle-party template
    const handlePartyTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-party.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-party', handlePartyTemplate);
    
    // Register handle-quest template
    const handleQuestTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-quest.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-quest', handleQuestTemplate);
    
    // Set up API to expose PanelManager to other modules
    game.modules.get(MODULE.ID).api = {
        PanelManager
    };
    
    // Create and store PartyPanel instance
    game.modules.get(MODULE.ID).PartyPanel = new PartyPanel();

    // Add quest panel to panel manager
    PanelManager.prototype.initializePanels = function() {
        // ... existing code ...
        this.questPanel = new QuestPanel();
        // ... existing code ...
    };

    // Add quest panel to render
    PanelManager.prototype.render = function(element) {
        // ... existing code ...
        this.questPanel.render(element);
        // ... existing code ...
    };

    // Add quest form to Hooks
    window.QuestForm = QuestForm;
});

Hooks.once('ready', async function() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE} | Required dependency 'coffee-pub-blacksmith' not found!`);
        return;
    }

    // Register module settings
    registerSettings();


    // Check if current user is excluded
    const excludedUsers = game.settings.get(MODULE.ID, 'excludedUsers').split(',').map(id => id.trim());
    const currentUserId = game.user.id;
    const currentUserName = game.user.name;
    
    // Check if user is excluded by either ID or name
    const isExcluded = excludedUsers.some(excluded => 
        excluded === currentUserId || excluded === currentUserName
    );

    // Debug log the exclusion status
    blacksmith.utils.postConsoleAndNotification(
        `${MODULE.TITLE} | User Exclusion Check`,
        {
            currentUserId,
            currentUserName,
            isExcluded,
            excludedUsers,
            allUsers: game.users.map(u => ({ id: u.id, name: u.name }))
        },
        false,
        true,
        false,
        MODULE.TITLE
    );

    if (isExcluded) {
        // Simply hide the tray with CSS
        const style = document.createElement('style');
        style.textContent = '.squire-tray { display: none !important; }';
        document.head.appendChild(style);
        return;
    }

    // Set up tray for non-excluded users
    const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
    document.documentElement.style.setProperty('--squire-tray-handle-width', SQUIRE.TRAY_HANDLE_WIDTH);
    document.documentElement.style.setProperty('--squire-tray-handle-adjustment', SQUIRE.TRAY_HANDLE_ADJUSTMENT);
    document.documentElement.style.setProperty('--squire-tray-width', `${trayWidth}px`);
    document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${trayWidth - parseInt(SQUIRE.TRAY_HANDLE_WIDTH) - parseInt(SQUIRE.TRAY_HANDLE_ADJUSTMENT)}px)`);

    // Set offset variables
    const topOffset = game.settings.get(MODULE.ID, 'topOffset');
    const bottomOffset = game.settings.get(MODULE.ID, 'bottomOffset');
    document.documentElement.style.setProperty('--squire-tray-top-offset', `${topOffset}px`);
    document.documentElement.style.setProperty('--squire-tray-bottom-offset', `${bottomOffset}px`);

    // Set UI position
    const isPinned = game.settings.get(MODULE.ID, 'isPinned');
    const uiLeft = document.querySelector('#ui-left');
    if (uiLeft) {
        if (isPinned) {
            uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        } else {
            uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
        }
    }
    
    // Register Handlebars helpers
    registerHelpers();
    
    // Debug log for Blacksmith sound choices
    blacksmith.utils.postConsoleAndNotification(
        `${MODULE.TITLE} | Blacksmith API`,
        {
            api: blacksmith,
            BLACKSMITH: blacksmith.BLACKSMITH,
            soundChoices: blacksmith.BLACKSMITH?.arrSoundChoices
        },
        false,
        true,
        false,
        MODULE.TITLE
    );

    const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
    await PanelManager.initialize(firstOwnedToken?.actor || null);
});

// Initialize panel when character sheet is rendered
Hooks.on('renderActorSheet5e', async (app, html, data) => {
    if (!app.actor) return;
    await PanelManager.initialize(app.actor);
});

// Also handle when tokens are selected
Hooks.on('controlToken', async (token, controlled) => {
    // Only care about token selection, not deselection
    if (!controlled) return;
    
    // Only proceed if it's a GM or the token owner
    if (!game.user.isGM && !token.actor?.isOwner) return;
    
    await PanelManager.initialize(token.actor);
});

// Hooks
Hooks.on('canvasReady', async () => {
    // Try to find a suitable actor in this order:
    // 1. Currently controlled token
    // 2. User's default character
    // 3. First owned character-type token
    // 4. Any owned token
    let initialActor = null;
    let selectionReason = "";
    
    // 1. Check for controlled token
    initialActor = canvas.tokens?.controlled[0]?.actor;
    if (initialActor) {
        selectionReason = "controlled token";
    }
    
    // 2. Try default character if no controlled token
    if (!initialActor) {
        initialActor = game.user.character;
        if (initialActor) {
            selectionReason = "default character";
        }
    }
    
    // 3. Try to find first owned character token
    if (!initialActor) {
        const characterToken = canvas.tokens?.placeables.find(token => 
            token.actor?.isOwner && token.actor?.type === 'character'
        );
        initialActor = characterToken?.actor;
        if (initialActor) {
            selectionReason = "first owned character token";
        }
    }
    
    // 4. Fall back to any owned token
    if (!initialActor) {
        const anyToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        initialActor = anyToken?.actor;
        if (initialActor) {
            selectionReason = "first owned token";
        }
    }

    // Initialize with the found actor
    if (initialActor) {
        if (PanelManager.element) {
            PanelManager.element.removeClass('expanded');
        }
        
        await PanelManager.initialize(initialActor);
        
        // Force a complete tray refresh
        if (PanelManager.instance) {
            await PanelManager.instance.updateTray();
        }
        
        // Play tray open sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        if (PanelManager.element) {
            PanelManager.element.addClass('expanded');
        }
    } else {
        console.log("SQUIRE | No Initial Actor Found", {
            reason: "Could not find any suitable token or character"
        });
    }
});

/**
 * Handle an incoming transfer request notification from another player
 * @param {Object} transferData The transfer request data
 */
async function handleTransferRequest(transferData) {
    try {
        // Get the actors and item involved
        const sourceActor = game.actors.get(transferData.sourceActorId);
        const targetActor = game.actors.get(transferData.targetActorId);
        const sourceItem = sourceActor.items.get(transferData.sourceItemId);
        
        if (!sourceActor || !targetActor || !sourceItem) {
            ui.notifications.error("Cannot process item transfer: Missing actor or item data");
            return;
        }
        
        // Create the request dialog
        const timestamp = transferData.timestamp;
        
        // Prepare template data for receiver's dialog
        const receiverTemplateData = {
            sourceItem,
            sourceActor,
            targetActor,
            maxQuantity: transferData.hasQuantity ? sourceItem.system.quantity : 1,
            timestamp,
            selectedQuantity: transferData.selectedQuantity,
            canAdjustQuantity: false,
            isReceiveRequest: true,
            hasQuantity: transferData.hasQuantity
        };
        
        // Render the transfer dialog template for the receiver
        const receiverContent = await renderTemplate(`modules/${MODULE.ID}/templates/window-transfer.hbs`, receiverTemplateData);
        
        // Play notification sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            blacksmith.utils.playSound('notification', 0.7, false, false);
        }
        
        // Create a dialog to approve/reject the transfer
        let response = await new Promise(resolve => {
            new Dialog({
                title: "Item Transfer Request",
                content: receiverContent,
                buttons: {
                    accept: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Accept",
                        cssClass: "accept",
                        callback: () => resolve(true)
                    },
                    decline: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Decline",
                        cssClass: "decline",
                        callback: () => resolve(false)
                    }
                },
                default: "accept",
                close: () => resolve(false)
            }, {
                classes: ["transfer-item"],
                id: `transfer-item-request-${timestamp}`,
                width: 320,
                height: "auto"
            }).render(true);
        });
        
        // Send response back through socketlib
        if (game.modules.get('socketlib')?.active) {
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Notify the requester of the response
            socket.executeAsUser(
                'processTransferResponse', 
                transferData.requester, 
                { 
                    accepted: response,
                    transferData: transferData
                }
            );
            
            // If accepted, find a GM to execute the transfer
            if (response) {
                const gmUsers = game.users.filter(u => u.isGM && u.active);
                if (gmUsers.length > 0) {
                    // Ask any GM to execute the transfer
                    socket.executeAsGM('executeItemTransfer', transferData, response);
                    ui.notifications.info(`Transfer request accepted - waiting for GM to process.`);
                } else {
                    ui.notifications.warn(`No active GM available to process the transfer. Please notify a GM to complete the transfer.`);
                }
            }
        } else {
            // No socketlib - notify the user to coordinate manually
            if (response) {
                ui.notifications.info(`You've accepted the transfer, but without socketlib module, the GM needs to manually execute the transfer.`);
            } else {
                ui.notifications.info(`You've declined the transfer.`);
            }
        }
        
        // Update the flag status if we have permission
        if (targetActor.isOwner) {
            try {
                await targetActor.setFlag(MODULE.ID, `transferRequest_${timestamp}`, {
                    ...transferData,
                    status: response ? 'accepted' : 'rejected'
                });
            } catch (error) {
                console.error('SQUIRE | Error updating transfer request flag:', error);
            }
        } else if (game.modules.get('socketlib')?.active) {
            // Ask a GM to update the flag
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Find a GM to handle this
            const gmUsers = game.users.filter(u => u.isGM && u.active);
            if (gmUsers.length > 0) {
                const updatedFlagData = {
                    ...transferData,
                    status: response ? 'accepted' : 'rejected'
                };
                socket.executeAsGM('setTransferRequestFlag', targetActor.id, `transferRequest_${timestamp}`, updatedFlagData);
            }
        }
        
    } catch (error) {
        console.error('SQUIRE | Error handling transfer request:', error);
        ui.notifications.error("Error processing transfer request");
    }
}

/**
 * Process the response from a transfer request
 * @param {Object} responseData The response data
 */
async function processTransferResponse(responseData) {
    const { accepted, transferData } = responseData;
    
    // If we have the transfer data, try to get the real actor names
    const targetActorName = game.actors.get(transferData.targetActorId)?.name || transferData.targetActorName;
    
    if (accepted) {
        ui.notifications.info(`${targetActorName} accepted your item transfer.`);
    } else {
        ui.notifications.warn(`${targetActorName} declined your item transfer.`);
    }
}

/**
 * Helper function to get an icon for item type
 */
function getIconForItemType(itemType) {
    switch(itemType) {
        case 'weapon': return 'fa-sword';
        case 'equipment': return 'fa-shield-alt';
        case 'consumable': return 'fa-flask';
        case 'tool': return 'fa-hammer';
        case 'backpack': return 'fa-backpack';
        case 'loot': return 'fa-coins';
        default: return 'fa-box';
    }
}

/**
 * Handler for setting transfer request flags on actors (GM only)
 * @param {string} targetActorId The ID of the target actor
 * @param {string} flagKey The flag key to set
 * @param {Object} flagData The flag data to set
 */
async function setTransferRequestFlag(targetActorId, flagKey, flagData) {
    if (!game.user.isGM) return;
    
    const targetActor = game.actors.get(targetActorId);
    if (!targetActor) {
        console.error(`SQUIRE | Could not find actor with ID ${targetActorId}`);
        return;
    }
    
    await targetActor.setFlag(MODULE.ID, flagKey, flagData);
}

/**
 * Executes an item transfer between two actors (GM only)
 * @param {Object} transferData The transfer data
 * @param {boolean} accepted Whether the transfer was accepted
 */
async function executeItemTransfer(transferData, accepted) {
    if (!game.user.isGM) return;
    
    // Get actors and item
    const sourceActor = game.actors.get(transferData.sourceActorId);
    const targetActor = game.actors.get(transferData.targetActorId);
    const sourceItem = sourceActor.items.get(transferData.sourceItemId);
    
    if (!sourceActor || !targetActor || !sourceItem) {
        console.error(`SQUIRE | Missing actor or item data for transfer`, transferData);
        return;
    }
    
    // Update the flag to show transfer is in progress
    await targetActor.setFlag(MODULE.ID, `transferRequest_${transferData.timestamp}`, {
        ...transferData,
        status: accepted ? 'accepted' : 'rejected'
    });
    
    if (!accepted) {
        console.log(`SQUIRE | Transfer request ${transferData.timestamp} rejected`);
        
        // Create a rejection chat message as GM
        if (game.modules.get('socketlib')?.active) {
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Prepare the message data
            const messageData = {
                sourceActorId: transferData.sourceActorId,
                sourceActorName: sourceActor.name,
                targetActorId: transferData.targetActorId,
                targetActorName: targetActor.name,
                itemId: transferData.sourceItemId,
                itemName: sourceItem.name,
                quantity: transferData.selectedQuantity,
                hasQuantity: transferData.hasQuantity,
                isPlural: transferData.isPlural,
                receiverId: transferData.requester,
                receiverIds: [transferData.requester, game.user.id],
                isTransferSender: false
            };
            
            // Create the rejection message as GM
            socket.executeAsGM('createTransferRejectedChat', messageData);
        }
        
        return;
    }
    
    try {
        // Create a copy of the item data to transfer
        const itemData = sourceItem.toObject();
        
        // Set the correct quantity on the new item
        if (transferData.hasQuantity) {
            itemData.system.quantity = transferData.selectedQuantity;
        }
        
        // Create the item on the target actor
        const transferredItem = await targetActor.createEmbeddedDocuments('Item', [itemData]);
        
        // Reduce quantity or remove the item from source actor
        if (transferData.hasQuantity && transferData.selectedQuantity < sourceItem.system.quantity) {
            // Just reduce the quantity
            await sourceItem.update({
                'system.quantity': sourceItem.system.quantity - transferData.selectedQuantity
            });
        } else {
            // Remove the item entirely
            await sourceItem.delete();
        }
        
        // Create a completion chat message as GM
        if (game.modules.get('socketlib')?.active) {
            const socketlib = game.modules.get('socketlib').api;
            const socket = socketlib.getSocketHandler(MODULE.ID);
            
            // Prepare the message data
            const messageData = {
                sourceActorId: transferData.sourceActorId,
                sourceActorName: sourceActor.name,
                targetActorId: transferData.targetActorId,
                targetActorName: targetActor.name,
                itemId: transferData.sourceItemId,
                itemName: sourceItem.name,
                quantity: transferData.selectedQuantity,
                hasQuantity: transferData.hasQuantity,
                isPlural: transferData.isPlural,
                receiverId: transferData.requester,
                receiverIds: [transferData.requester, game.user.id],
                isTransferSender: false
            };
            
            // Create the completion message as GM
            socket.executeAsGM('createTransferCompleteChat', messageData);
        }
        
    } catch (error) {
        console.error(`SQUIRE | Error executing item transfer:`, error);
    }
}

// Add this to your Handlebars helpers
Handlebars.registerHelper('getFlag', function(flags, itemId, flagName) {
    if (!flags || !itemId || !flagName) return false;
    return flags[itemId]?.[flagName] || false;
});
