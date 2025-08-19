import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './panel-manager.js';
import { PartyPanel } from './panel-party.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';
import { QuestPanel } from './panel-quest.js';
import { QuestForm } from './quest-form.js';
import { QuestParser } from './quest-parser.js';
import { QuestPin, loadPersistedPinsOnCanvasReady, loadPersistedPins } from './quest-pin.js';
import { HookManager } from './hooks.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

let socket;

// Move socketlib registration to its own hook
Hooks.once('socketlib.ready', () => {
    try {
        if (typeof socketlib === 'undefined') {
            throw new Error("Global socketlib variable is not defined");
        }

        socket = socketlib.registerModule(MODULE.ID);
        
        if (!socket) {
            throw new Error("Failed to register socket");
        }
        
        // Store socket in module API for access from other files
        game.modules.get(MODULE.ID).socket = socket;
        
        // HookManager is now exposed in the ready hook to ensure proper initialization order
        
        // Register socket functions with socket handlers
        socket.register("executeItemTransfer", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get actors and item
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                const sourceItem = sourceActor.items.get(data.sourceItemId);
                
                if (!sourceActor || !targetActor || !sourceItem) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Missing actor or item data for transfer',
                        { data },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error executing item transfer',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        });
        
        socket.register("createTransferRequestChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Missing required actors for transfer request message',
                        { data },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error creating transfer request message',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Missing required actors for transfer complete message',
                        { data },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error creating transfer complete message',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        });

        socket.register("createTransferRejectedChat", async (data) => {
            if (!game.user.isGM) return;
            
            try {
                // Get the actual referenced objects
                const sourceActor = game.actors.get(data.sourceActorId);
                const targetActor = game.actors.get(data.targetActorId);
                
                if (!sourceActor || !targetActor) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'Missing required actors for transfer rejected message',
                        { data },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error creating transfer rejected message',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        });
        
        // Add socket handler for deleting transfer request messages
        socket.register("deleteTransferRequestMessage", async (messageId) => {
            if (!game.user.isGM) return;
            
            try {
                const message = game.messages.get(messageId);
                if (message) {
                    await message.delete();
                } else {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        `Could not find message with ID ${messageId} to delete`,
                        { messageId },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                }
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error deleting transfer request message',
                    { messageId, error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        });
        
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Error during socketlib initialization',
            { error },
            false,
            false,
            true,
            MODULE.TITLE
        );
    }
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
    
    // Register handle-codex template
    const handleCodexTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-codex.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-codex', handleCodexTemplate);
    
    // Register handle-notes template
    const handleNotesTemplate = await fetch(`modules/${MODULE.ID}/templates/handle-notes.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-notes', handleNotesTemplate);
    
    // Register quest-entry partial
    const questEntryPartial = await fetch(`modules/${MODULE.ID}/templates/partials/quest-entry.hbs`).then(response => response.text());
    Handlebars.registerPartial('quest-entry', questEntryPartial);
    
    // Register handle section partials
    const handleHealthPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-health.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-health', handleHealthPartial);
    
    const handleHealthTrayPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-health-tray.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-health-tray', handleHealthTrayPartial);
    
    const handleDiceTrayPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-dice-tray.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-dice-tray', handleDiceTrayPartial);
    
    const handleMacrosPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-macros.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-macros', handleMacrosPartial);
    
    const handleFavoritesPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-favorites.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-favorites', handleFavoritesPartial);
    
    const handleConditionsPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-conditions.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-conditions', handleConditionsPartial);
    
    const handlePrimaryStatsPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-primary-stats.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-primary-stats', handlePrimaryStatsPartial);
    
    const handleSecondaryStatsPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-secondary-stats.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-secondary-stats', handleSecondaryStatsPartial);
    
    const handleCharacterPortraitPartial = await fetch(`modules/${MODULE.ID}/templates/partials/handle-character-portrait.hbs`).then(response => response.text());
    Handlebars.registerPartial('handle-character-portrait', handleCharacterPortraitPartial);
    
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
    const blacksmith = getBlacksmith();
    if (!blacksmith) {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Required dependency coffee-pub-blacksmith not found',
            { blacksmith },
            false,
            false,
            true,
            MODULE.TITLE
        );
        return;
    }

    // Register module settings
    registerSettings();


    // Check if current user is excluded - with safety check for setting registration
    let excludedUsers = [];
    try {
        const excludedUsersSetting = game.settings.get(MODULE.ID, 'excludedUsers');
        if (excludedUsersSetting) {
            excludedUsers = excludedUsersSetting.split(',').map(id => id.trim());
        }
    } catch (error) {
        // Setting not registered yet, treat as not excluded
        blacksmith.utils.postConsoleAndNotification(
            'Settings not yet registered, treating user as not excluded',
            { error },
            false,
            true,
            false,
            MODULE.TITLE
        );
    }
    
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

    // Initialize Squire after settings are registered (with delay to ensure everything is ready)
    setTimeout(async () => {
        // Initialize the centralized hook manager first
        HookManager.initialize();
        
        // Expose HookManager in module API for panel registration
        game.modules.get(MODULE.ID).api = {
            ...game.modules.get(MODULE.ID).api,
            HookManager: HookManager
        };
        
        // Load quest pins first
        loadPersistedPinsOnCanvasReady();
        
        // Then initialize the main interface
        const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        await PanelManager.initialize(firstOwnedToken?.actor || null);
    }, 1000); // 1 second delay to ensure settings and canvas are fully ready
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

// Restore the squirePins container creation in the canvasInit hook
Hooks.on('canvasInit', () => {
  if (!canvas.squirePins) {
    const squirePins = new PIXI.Container();
    squirePins.sortableChildren = true;
    squirePins.interactive = true;
    squirePins.eventMode = 'static';
    if (canvas.foregroundGroup) {
      canvas.foregroundGroup.addChild(squirePins);
    } else {
      canvas.stage.addChild(squirePins);
    }
    canvas.squirePins = squirePins;
  }
});

// Ensure squirePins exists and is properly positioned when canvas is ready
Hooks.on('canvasReady', () => {
  if (!canvas.squirePins) {
    const squirePins = new PIXI.Container();
    squirePins.sortableChildren = true;
    squirePins.interactive = true;
    squirePins.eventMode = 'static';
    if (canvas.foregroundGroup) {
      canvas.foregroundGroup.addChild(squirePins);
    } else {
      canvas.stage.addChild(squirePins);
    }
    canvas.squirePins = squirePins;
  }
  
  // Move squirePins to top of display order
  if (canvas.squirePins) {
    const parent = canvas.squirePins.parent;
    if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
      parent.addChild(canvas.squirePins);
    }
    canvas.squirePins.interactive = true;
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
        const blacksmith = getBlacksmith();
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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error updating transfer request flag',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
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
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Error handling transfer request',
            { error },
            false,
            false,
            true,
            MODULE.TITLE
        );
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
        getBlacksmith()?.utils.postConsoleAndNotification(
            `Could not find actor with ID ${targetActorId}`,
            { targetActorId },
            false,
            false,
            true,
            MODULE.TITLE
        );
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
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Missing actor or item data for transfer',
            { transferData },
            false,
            false,
            true,
            MODULE.TITLE
        );
        return;
    }
    
    // Update the flag to show transfer is in progress
    await targetActor.setFlag(MODULE.ID, `transferRequest_${transferData.timestamp}`, {
        ...transferData,
        status: accepted ? 'accepted' : 'rejected'
    });
    
    if (!accepted) {
        
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
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Error executing item transfer',
            { error },
            false,
            false,
            true,
            MODULE.TITLE
        );
    }
}

// Add this to your Handlebars helpers
Handlebars.registerHelper('getFlag', function(flags, itemId, flagName) {
    if (!flags || !itemId || !flagName) return false;
    return flags[itemId]?.[flagName] || false;
});

Handlebars.registerHelper('add', function(a, b) {
    return a + b;
});

function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

/**
 * Comprehensive cleanup function for the entire module
 */
function cleanupModule() {
    try {
        // Clean up HookManager
        if (HookManager.cleanup) {
            HookManager.cleanup();
        }

        // Clean up PanelManager
        if (PanelManager.cleanup) {
            PanelManager.cleanup();
        }

        // Clean up socket
        if (socket) {
            socket.close();
            socket = null;
        }

        // Remove any remaining DOM elements
        $('.squire-tray').remove();
        $('.squire-questpin-tooltip').remove();

        // Clear any remaining timeouts or intervals
        const highestTimeoutId = setTimeout(() => {}, 0);
        for (let i = 0; i < highestTimeoutId; i++) {
            clearTimeout(i);
        }

        const highestIntervalId = setInterval(() => {}, 0);
        for (let i = 0; i < highestIntervalId; i++) {
            clearInterval(i);
        }

        getBlacksmith()?.utils.postConsoleAndNotification(
            'Squire module cleanup completed',
            {},
            false,
            false,
            false,
            MODULE.TITLE
        );
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Error during module cleanup',
            { error },
            false,
            false,
            true,
            MODULE.TITLE
        );
    }
}

// Register cleanup hooks
Hooks.on('disableModule', (moduleId) => {
    if (moduleId === MODULE.ID) {
        cleanupModule();
    }
});

Hooks.on('closeGame', () => {
    cleanupModule();
});
