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
                const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                
                // Play drop sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Get the actor for this card
                const actorId = $card.data('actor-id');
                const actor = game.actors.get(actorId);
                
                if (!actor) {
                    ui.notifications.warn("Could not find the character to add the item to.");
                    return;
                }
                
                // Check if the user has permission to modify this actor
                if (!actor.isOwner) {
                    ui.notifications.warn(`You don't have permission to modify ${actor.name}.`);
                    return;
                }
                
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Party card drop data",
                    { data, actorId, actor: actor.name },
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );
                
                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        item = await Item.implementation.fromDropData(data);
                        if (!item) return;
                        // Create the item on the actor
                        const createdItem = await actor.createEmbeddedDocuments('Item', [item.toObject()]);
                        
                        // Add to newlyAddedItems in PanelManager
                        if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                            game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(createdItem[0].id, Date.now());
                        }
                        
                        // Send chat notification
                        const chatData = {
                            isPublic: true,
                            strCardIcon: this._getDropIcon(item.type),
                            strCardTitle: this._getDropTitle(item.type),
                            strCardContent: `<p><strong>${actor.name}</strong> received <strong>${item.name}</strong> via the Squire tray.</p>`
                        };
                        const chatContent = await renderTemplate(TEMPLATES.CHAT_CARD, chatData);
                        await ChatMessage.create({
                            content: chatContent,
                            speaker: ChatMessage.getSpeaker({ actor })
                        });
                        break;

                    case 'ItemDirectory':
                        const itemData = game.items.get(data.uuid)?.toObject();
                        if (itemData) {
                            const newItem = await actor.createEmbeddedDocuments('Item', [itemData]);
                            
                            // Add to newlyAddedItems in PanelManager
                            if (game.modules.get('coffee-pub-squire')?.api?.PanelManager) {
                                game.modules.get('coffee-pub-squire').api.PanelManager.newlyAddedItems.set(newItem[0].id, Date.now());
                            }
                            
                            // Send chat notification
                            const dirItemChatData = {
                                isPublic: true,
                                strCardIcon: this._getDropIcon(itemData.type),
                                strCardTitle: this._getDropTitle(itemData.type),
                                strCardContent: `<p><strong>${actor.name}</strong> received <strong>${itemData.name}</strong> via the Squire tray.</p>`
                            };
                            const dirItemChatContent = await renderTemplate(TEMPLATES.CHAT_CARD, dirItemChatData);
                            await ChatMessage.create({
                                content: dirItemChatContent,
                                speaker: ChatMessage.getSpeaker({ actor })
                            });
                        }
                        break;
                }
                
                // Re-render the party panel to reflect any changes
                this.render(this.element);
                
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
} 