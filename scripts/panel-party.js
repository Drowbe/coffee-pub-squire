import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';
import { TransferUtils } from './transfer-utils.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getHealthbarStatusClass, getNativeElement, getTransferBlocker, renderTemplate, resolveDroppedItem, showSquireToast, getActorDisplayName, openHealthWindow, getTokenDisposition } from './helpers.js';
import {
    transferByGM, transferComplete, transferRejected, transferRequestSender,
    retireCard
} from './manager-cards.js';

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

        // Note: Hooks are now managed centrally by HookManager
        // No need to register hooks here anymore
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);
        const partyContainer = this.element?.querySelector('[data-panel="party"]');
        if (!partyContainer) return;

        // Get all player-owned tokens on the canvas
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        
        // Get non-player tokens (for GM only)
        const nonPlayerTokens = game.user.isGM ? 
            canvas.tokens.placeables.filter(token => token.actor && !token.actor.hasPlayerOwner) : 
            [];

        // Both lists get the same decoration. It used to be written out twice,
        // identically, which is how a field added to one of them ends up missing
        // from the other half of the panel.
        [...tokens, ...nonPlayerTokens].forEach(token => this._decorateToken(token));
        
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

        const partyHealthbarStatus = getHealthbarStatusClass({
            value: partyRemainingHP,
            max: partyTotalHP
        });

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

        const reputation = await this._getReputationData();

        const html = await renderTemplate(TEMPLATES.PANEL_PARTY, { 
            tokens,
            reputation,
            nonPlayerTokens,
            controlledTokenIds,
            isGM: game.user.isGM,
            actor: currentActor,
            otherPartyMembers,
            partyRemainingHP,
            partyTotalHP,
            partyHealthbarStatus,
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar')
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        partyContainer.innerHTML = html;

        this.activateListeners(partyContainer);
    }

    /**
     * Walking speed as a display string, or null when there isn't one.
     *
     * dnd5e stores movement values either as plain numbers or as `{value: n}`
     * depending on version, so this normalises rather than reading `.walk`
     * directly. Only walking speed: the card has one line to spend, and a
     * creature's fly or swim speed is a detail for the sheet, not the roster.
     */
    _getSpeedDisplay(actor) {
        const movement = actor?.system?.attributes?.movement;
        if (!movement) return null;

        let walk = movement.walk;
        if (walk && typeof walk === 'object' && 'value' in walk) walk = walk.value;

        const speed = Number(walk);
        if (!Number.isFinite(speed) || speed <= 0) return null;

        const units = movement.units || '';
        return units ? `${speed} ${units}` : `${speed}`;
    }

    /**
     * Party reputation for the CURRENT SCENE, from Blacksmith.
     *
     * Reputation is per-scene by design — `blacksmithPartyData.scenes[id].reputation` —
     * so the scene name is part of the reading, not decoration. Without it a GM
     * looking at a number has no way to know which place it describes, and would
     * reasonably assume it was the campaign's.
     *
     * Returns null when Blacksmith is absent or no scene is active, and the
     * template omits the whole block rather than showing a meaningless zero.
     */
    async _getReputationData() {
        const blacksmith = getBlacksmith();
        const scene = canvas?.scene;
        if (!scene?.id || typeof blacksmith?.getPartyReputation !== 'function') return null;

        try {
            const value = blacksmith.getPartyReputation(scene);
            const entry = typeof blacksmith.getReputationScaleEntry === 'function'
                ? await blacksmith.getReputationScaleEntry(value)
                : null;

            return {
                sceneName: scene.name,
                value,
                label: entry?.label ?? 'Unknown',
                description: entry?.description ?? '',
                // -100..100 mapped to 0..100 — the marker's position along the
                // spectrum, not a fill width. 0 sits at 50%.
                percent: Math.round(((value + 100) / 200) * 100),
                // setPartyReputation is GM-only in Blacksmith and returns false for
                // anyone else, so the controls are GM-only here too rather than
                // offering buttons that silently do nothing.
                canEdit: game.user.isGM
            };
        } catch (error) {
            console.error('Coffee Pub Squire | Error reading party reputation:', error);
            return null;
        }
    }

    /**
     * Nudge reputation by a delta. Blacksmith clamps to -100..100 and owns the write;
     * this re-renders so the band label and bar follow the new value.
     */
    async _adjustReputation(delta) {
        const blacksmith = getBlacksmith();
        const scene = canvas?.scene;
        if (!scene?.id || typeof blacksmith?.setPartyReputation !== 'function') return;

        const current = blacksmith.getPartyReputation(scene);
        const ok = await blacksmith.setPartyReputation(current + delta, scene);
        if (!ok) {
            showSquireToast('Only the GM can change party reputation.', 'warning');
            return;
        }
        if (this.element) await this.render(this.element);
    }

    activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Handle character card clicks for token selection (first, so card clone doesn't remove other listeners)
        const clickableCards = nativeHtml.querySelectorAll('.party-card.party-card-clickable');
        clickableCards.forEach(card => {
            // Clone to remove existing listeners
            const newCard = card.cloneNode(true);
            card.parentNode?.replaceChild(newCard, card);
            
            newCard.addEventListener('click', async (event) => {
                // Don't handle clicks if they originated from the open-sheet button or portrait
                // v13: Use native DOM methods
                const clickedElement = event.target.closest('.open-sheet, .party-card-image.party-card-clickable');
                if (clickedElement) return;

                const tokenId = event.currentTarget.dataset.tokenId;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                if (token) {
                    // Check ownership - only allow selection of tokens the user owns
                    if (!token.actor.isOwner) return;
                    
                    // Multi-select with shift+click, single select without shift
                    const releaseOthers = !event.shiftKey;
                    token.control({releaseOthers});
                }
            });
        });

        // Handle character sheet button clicks (after card replacement so listeners are not lost)
        const openSheetButtons = nativeHtml.querySelectorAll('.open-sheet');
        openSheetButtons.forEach(button => {
            // Clone to remove existing listeners
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                // v13: Use native DOM methods
                const partyCard = event.target.closest('.party-card');
                const tokenId = partyCard?.dataset.tokenId;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                if (token?.actor) {
                    if (PanelManager.instance) {
                        PanelManager.instance._suppressSheetRender = true;
                    }
                    token.actor.sheet.render(true);
                }
            });
        });

        // Handle portrait clicks (after card replacement so listeners are not lost)
        const portraitButtons = nativeHtml.querySelectorAll('.party-card-image.party-card-clickable');
        portraitButtons.forEach(button => {
            // Clone to remove existing listeners
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                // v13: Use native DOM methods
                const partyCard = event.currentTarget.closest('.party-card');
                const tokenId = partyCard?.dataset.tokenId;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                if (token?.actor) {
                    // v13 AppV2 signature: src and title live in options
                    const imagePopout = new foundry.applications.apps.ImagePopout({
                        src: token.actor.img,
                        uuid: token.actor.uuid,
                        shareable: true,
                        window: { title: token.actor.name }
                    });
                    imagePopout.render(true);
                }
            });
        });

        // Handle party overview health bar clicks
        // Reputation adjustment buttons (GM only; absent from the DOM otherwise)
        nativeHtml.querySelectorAll('.party-reputation-adjust').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const delta = Number(event.currentTarget.dataset.delta);
                if (!Number.isFinite(delta)) return;
                await this._adjustReputation(delta);
            });
        });

        // Clicking the reputation readout posts the current standing to chat.
        const reputationCard = nativeHtml.querySelector('.party-reputation-card .party-reputation-readout');
        if (reputationCard) {
            reputationCard.addEventListener('click', async () => {
                const blacksmith = getBlacksmith();
                if (typeof blacksmith?.postCurrentReputationCard !== 'function') return;
                await blacksmith.postCurrentReputationCard(blacksmith);
            });
        }

        const partyHealthCard = nativeHtml.querySelector('.party-health-card');
        if (partyHealthCard) {
            // Clone to remove existing listeners
            const newCard = partyHealthCard.cloneNode(true);
            partyHealthCard.parentNode?.replaceChild(newCard, partyHealthCard);
            
            newCard.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get all player-owned tokens on the canvas
            const partyTokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
            
            if (partyTokens.length === 0) return;
            
            // Select all party tokens
            partyTokens.forEach(token => {
                token.control({releaseOthers: false});
            });
            
            await openHealthWindow(partyTokens);
        });
        }
        
        // Add drag and drop functionality to character cards
        // v13: Use nativeHtml instead of html
        const characterCards = nativeHtml.querySelectorAll('.party-card');
        
        // v13: Add new drag event listeners using native DOM
        characterCards.forEach(card => {
            card.addEventListener('dragenter', (event) => {
                event.preventDefault();
                
                try {
                    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
                    const dropType = data.type;
                    
                    // Only handle item-related drops
                    if (['Item', 'ItemDirectory', 'Actor'].includes(dropType)) {
                        // Add drop hover styles
                        event.currentTarget.classList.add('drop-target');
                        
                        // Play hover sound
                        const blacksmith = getBlacksmith();
                        if (blacksmith) {
                            const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                        }
                    }
                } catch (error) {
                    // If we can't parse data, still show hover state
                    event.currentTarget.classList.add('drop-target');
                }
            });

            card.addEventListener('dragleave', (event) => {
                event.preventDefault();
                // Remove the style if we're leaving the card or entering a child element
                const cardElement = event.currentTarget;
                const relatedTarget = event.relatedTarget;
                
                // Check if we're actually leaving the card
                if (!relatedTarget || !cardElement.contains(relatedTarget)) {
                    cardElement.classList.remove('drop-target');
                }
            });

            card.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            });

            card.addEventListener('drop', async (event) => {
                event.preventDefault();
                
                // Get the character card and remove hover state
                const cardElement = event.currentTarget;
                cardElement.classList.remove('drop-target');
                
                try {
                    const dataTransfer = event.dataTransfer.getData('text/plain');
                    const data = JSON.parse(dataTransfer);
                    
                    // Play drop sound
                    const blacksmith = getBlacksmith();
                    if (blacksmith) {
                        const sound = game.settings.get(MODULE.ID, 'dropSound');
                        blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                    }
                    
                    // Get the actor for this card
                    const targetTokenId = cardElement.dataset.tokenId;
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
                        // Classify by what the uuid actually points at, not by
                        // its prefix. An item on an unlinked token is
                        // `Scene.x.Token.y.Actor.z.Item.i`, which does not START
                        // with "Actor." — so a startsWith test routes an NPC's
                        // item to the world-item branch below, where it is
                        // copied onto the target and left on the source with
                        // none of the transfer guards run.
                        if ((data.actorId && (data.data?.itemId || data.embedId)) ||
                            data.fromInventory ||
                            /Actor\.[^.]+\.Item\./.test(String(data.uuid || ''))) {
                            
                            // This is a drag from character sheet
                            // Get source actor ID based on different data formats
                            let sourceActorId;
                            let itemId;
                            
                            // Parse from UUID format if present (Actor.actorId.Item.itemId)
                            const uuidMatch = String(data.uuid || '').match(/Actor\.([^.]+)\.Item\.([^.]+)/);
                            if (uuidMatch) {
                                sourceActorId = uuidMatch[1];
                                itemId = uuidMatch[2];
                            } else {
                                sourceActorId = data.actorId;
                                itemId = data.data?.itemId || data.embedId || data.uuid?.split('.').pop();
                            }
                            
                            const { sourceActor, sourceItem } = await resolveDroppedItem(data, sourceActorId, itemId);
                            if (!sourceActor || !sourceItem) {
                                showSquireToast('Could not find that item on its owner.', {
                                    subtitle: 'Nothing was transferred.',
                                    icon: 'fa-solid fa-triangle-exclamation',
                                    color: '#e05c3c'
                                });
                                return;
                            }

                            // A packed container can't be handed over: dnd5e keeps
                            // containment on the child as `system.container`, so a
                            // copy on the target has an id its contents never point
                            // at. Refuse in front of the quantity dialog.
                            const containerBlocker = getTransferBlocker(sourceItem, sourceActor);
                            if (containerBlocker) {
                                showSquireToast('Unpack it first', {
                                    subtitle: containerBlocker.message,
                                    icon: 'fa-solid fa-box-open',
                                    color: '#e0a53c'
                                });
                                return;
                            }
                            
                            // Check permissions on source actor
                            const hasSourcePermission = sourceActor.isOwner;
                            
                            // Handle quantity logic for stackable items
                            const hasQuantity = sourceItem.system.quantity != null;
                            const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
                            
                            // Check if we have direct permission to modify the target actor
                            const hasTargetPermission = targetActor.isOwner;
                            
                            // Show quantity selection dialog
                            const selectedQuantity = await this._showTransferQuantityTool(sourceItem, sourceActor, targetActor);
                            if (selectedQuantity <= 0) return; // User cancelled
                            
                            if (!hasSourcePermission || !hasTargetPermission) {
                                // Use unified transfer flow for all transfers
                                await TransferUtils.executeTransfer({
                                    sourceActor,
                                    targetActor,
                                    item: sourceItem,
                                    quantity: selectedQuantity,
                                    hasQuantity
                                });
                                // Do not execute the transfer yet
                                return;
                            }
                            
                            await TransferUtils.executeTransferWithPermissions(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                            return;
                            
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
                            await transferByGM({
                                icon: this._getDropIcon(item.type),
                                title: this._getDropTitle(item.type),
                                itemName: item.name,
                                targetActorName: targetActor.name,
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
                            await transferByGM({
                                icon: this._getDropIcon(itemData.type),
                                title: this._getDropTitle(itemData.type),
                                itemName: itemData.name,
                                targetActorName: targetActor.name,
                                speaker: ChatMessage.getSpeaker({ actor: targetActor })
                            });
                        }
                        break;

                    // Special case: Actor -> Actor item transfer
                    case 'Actor':
                        // Extract item data from drop event
                        const sourceActorId = data.id;
                        const itemId = data.data?.itemId || data.uuid?.split('.').pop();

                        const { sourceActor, sourceItem } = await resolveDroppedItem(data, sourceActorId, itemId);
                        if (!sourceActor || !sourceItem) {
                            showSquireToast('Could not find that item on its owner.', {
                                subtitle: 'Nothing was transferred.',
                                icon: 'fa-solid fa-triangle-exclamation',
                                color: '#e05c3c'
                            });
                            return;
                        }

                        // A packed container can't be handed over: dnd5e keeps
                        // containment on the child as `system.container`, so a
                        // copy on the target has an id its contents never point
                        // at. Refuse in front of the quantity dialog.
                        const containerBlocker = getTransferBlocker(sourceItem, sourceActor);
                        if (containerBlocker) {
                            showSquireToast('Unpack it first', {
                                subtitle: containerBlocker.message,
                                icon: 'fa-solid fa-box-open',
                                color: '#e0a53c'
                            });
                            return;
                        }
                        
                        // Check permissions on source actor
                        const hasSourcePermission = sourceActor.isOwner;
                        
                        // Handle quantity logic for stackable items
                        const hasQuantity = sourceItem.system.quantity != null;
                        const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
                        
                        // Check if we have direct permission to modify the target actor
                        const hasTargetPermission = targetActor.isOwner;
                        
                        // Show quantity selection dialog
                        const selectedQuantity = await this._showTransferQuantityTool(sourceItem, sourceActor, targetActor);
                        if (selectedQuantity <= 0) return; // User cancelled
                        
                        if (!hasSourcePermission || !hasTargetPermission) {
                            // Use unified transfer flow for all transfers
                            await TransferUtils.executeTransfer({
                                sourceActor,
                                targetActor,
                                item: sourceItem,
                                quantity: selectedQuantity,
                                hasQuantity
                            });
                            // Do not execute the transfer yet
                            return;
                        }
                        
                        await this._executeTransferWithPermissions(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity);
                        return;
                        break;
                }
                
                // Re-render the party panel to reflect any changes
                this.render(this.element);
                
                // Also refresh the main tray if the active character was involved
                const panelManager = game.modules.get('coffee-pub-squire')?.api?.PanelManager;
                if (panelManager?.instance) {
                    const currentActorId = panelManager.currentActor?.id;
                    if (currentActorId === targetActor.id || 
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
        });

        // Handle individual character health bar clicks in the party tab
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.party-card .party-hp-bar').forEach(hpBar => {
            const newHpBar = hpBar.cloneNode(true);
            hpBar.parentNode?.replaceChild(newHpBar, hpBar);
            newHpBar.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const partyCard = event.currentTarget.closest('.party-card');
                if (!partyCard) return;
                const tokenId = partyCard.dataset.tokenId;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                // Named rather than selected — a click on one member's health
                // bar shouldn't change what the user has selected on canvas.
                if (token?.actor) await openHealthWindow([token]);
            });
        });

        // Note: Handle party member icon clicks are handled by the handle manager, not the party panel

        // Note: Handle party member health bar clicks are handled by the handle manager, not the party panel
    }
    
    // Helper method to get the appropriate icon based on item type
    _getDropIcon(type) {
        switch(type) {
            case 'spell': return 'fa-solid fa-stars';
            case 'weapon': return 'fa-solid fa-swords';
            case 'feat': return 'fa-solid fa-sparkles';
            default: return 'fa-solid fa-backpack';
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

    /**
     * Debounced re-render: multi-select bursts, token movement steps, and HP storms
     * each fire one hook per event — coalesce them into a single render pass.
     * @private
     */
    _scheduleRender() {
        if (!this.element) return;
        if (this._renderTimer) clearTrackedTimeout(this._renderTimer);
        this._renderTimer = trackModuleTimeout(() => {
            this._renderTimer = null;
            if (this.element) this.render(this.element);
        }, 100);
    }

    _onTokenUpdate(token, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if token position or visibility changes
            if (foundry.utils.hasProperty(changes, "x") || foundry.utils.hasProperty(changes, "y") || foundry.utils.hasProperty(changes, "hidden")) {
                this._scheduleRender();
            }
        }
    }

    _onActorUpdate(actor, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if HP changes
            if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {
                this._scheduleRender();
            }
        }
    }

    _onControlToken(token, isControlled) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render to highlight the currently selected token
            this._scheduleRender();
        }
    }

    /**
     * Calculate healthbar status class based on HP values
     * @param {Object} hp - HP object with value and max properties
     * @returns {string} - CSS class name for healthbar status
     */
    /**
     * Everything the party card needs that is not already on the token.
     *
     * `disposition` is stamped for every token, including player characters:
     * disposition is a property of the TOKEN, so a PC placed hostile is a real
     * and worth-seeing state. Whether the badge is actually drawn is the
     * template's call — see the note there about not labelling the default.
     *
     * @private
     */
    _decorateToken(token) {
        if (token.actor?.system?.attributes?.hp) {
            token.healthbarStatus = this._calculateHealthbarStatus(token.actor.system.attributes.hp);
        }
        token.speedDisplay = this._getSpeedDisplay(token.actor);
        token.disposition = getTokenDisposition(token);
    }

    _calculateHealthbarStatus(hp) {
        return getHealthbarStatusClass(hp);
    }

    /**
     * Create standardized transfer data object
     * @param {string} transferId - Unique transfer identifier
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {Item} sourceItem - Item being transferred
     * @param {number} selectedQuantity - Quantity to transfer
     * @param {boolean} hasQuantity - Whether item has quantity property
     * @returns {Object} - Transfer data object
     */

    /**
     * Show the fixed-recipient Transfer Tool for an item transfer.
     * @param {Item} sourceItem - Item being transferred
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @returns {Promise<number>} - Selected quantity (0 if cancelled)
     */
    async _showTransferQuantityTool(sourceItem, sourceActor, targetActor) {
        const { selectTransferQuantityWithTool } = await import('./window-transfer-tool.js');
        return selectTransferQuantityWithTool({
            sourceActor,
            targetActor,
            item: sourceItem
        });
    }

    /**
     * Execute item transfer based on permissions
     * @param {Actor} sourceActor - Source actor
     * @param {Actor} targetActor - Target actor
     * @param {Item} sourceItem - Item being transferred
     * @param {number} selectedQuantity - Quantity to transfer
     * @param {boolean} hasQuantity - Whether item has quantity property
     */
    async _executeTransferWithPermissions(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity) {
        const hasSourcePermission = sourceActor.isOwner;
        const hasTargetPermission = targetActor.isOwner;
        
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
    }

    async _completeItemTransfer(sourceActor, targetActor, sourceItem, quantityToTransfer, hasQuantity) {
        // Container guard at the mutation, not only at the drop handlers.
        // Entry-point checks are for giving a good message early; this is the
        // one that cannot be routed around, whichever path got here.
        const packed = getTransferBlocker(sourceItem, sourceActor);
        if (packed) {
            showSquireToast('Unpack it first', {
                subtitle: packed.message,
                icon: 'fa-solid fa-box-open',
                color: '#e0a53c'
            });
            return false;
        }

        // The quantity was chosen in a client-side dialog and can be stale by the
        // time it reaches the mutation — the stack may have been spent, sold, or
        // partly handed to someone else since. Unchecked, the create below mints
        // the full requested amount while the delete below removes the source
        // stack, turning a stale client value into duplicated items.
        const available = sourceItem.system?.quantity ?? 1;
        if (quantityToTransfer > available) {
            showSquireToast('Not enough left', {
                subtitle: `${getActorDisplayName(sourceActor)} has only ${available} ${sourceItem.name}.`,
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return false;
        }

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
        }
        
        // Create chat messages for direct transfer completion
        try {
            // One card, whispered to everyone involved.
            //
            // This used to send a "You sent…" card to the source's owners and a
            // separate "You received…" card to the target's, plus a GM copy —
            // up to three messages describing one event, and every GM saw all of
            // them. The third-person wording reads correctly for all three
            // audiences, so one message says the same thing once.
            const sourceUsers = game.users.filter(user => sourceActor.ownership?.[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            const targetUsers = game.users.filter(user => targetActor.ownership?.[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active && !user.isGM);
            const gmUsers = game.users.filter(u => u.isGM);
            const receiverIds = [...new Set([
                ...sourceUsers.map(u => u.id),
                ...targetUsers.map(u => u.id),
                ...gmUsers.map(u => u.id)
            ])];

            const payload = {
                sourceActorId: sourceActor.id,
                sourceActorName: getActorDisplayName(sourceActor),
                targetActorId: targetActor.id,
                targetActorName: getActorDisplayName(targetActor),
                itemId: sourceItem.id,
                itemName: sourceItem.name,
                quantity: quantityToTransfer,
                hasQuantity: hasQuantity,
                isPlural: quantityToTransfer > 1,
                receiverIds
            };

            const socket = game.modules.get(MODULE.ID)?.socket;
            if (socket) {
                await socket.executeAsGM('createTransferCompleteChat', payload);
            } else {
                // No socket: a player cannot whisper on someone else's behalf,
                // so this only reaches whoever is looking. Better than silence.
                await transferComplete({
                    ...payload,
                    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
                    whisper: receiverIds
                });
            }
        } catch (error) {
            console.error('Coffee Pub Squire | Error creating transfer complete chat message:', error);
        }
    }

    /**
     * Register the transfer card buttons, once per client at startup.
     *
     * These used to be wired by walking every rendered message for
     * `.transfer-request-button` and routing through the party panel instance,
     * which meant a transfer could only be answered while a tray happened to be
     * open. Blacksmith resolves an action handler from its own registry each
     * time a card paints, so these are static, they cover cards already in the
     * log, and they survive a reload.
     */
    static registerCardActions() {
        const chatCards = getBlacksmith()?.chatCards;
        if (!chatCards) return;

        chatCards.registerAction(MODULE.ID, 'transfer-accept',
            ({ message, value }) => PartyPanel._handleTransferResponse(message, value, true));
        chatCards.registerAction(MODULE.ID, 'transfer-reject',
            ({ message, value }) => PartyPanel._handleTransferResponse(message, value, false));
        chatCards.registerAction(MODULE.ID, 'transfer-approve',
            ({ message, value }) => PartyPanel._handleGMApproval(message, value, true));
        chatCards.registerAction(MODULE.ID, 'transfer-deny',
            ({ message, value }) => PartyPanel._handleGMApproval(message, value, false));
    }

    /**
     * The receiver answering a transfer request.
     *
     * @param {ChatMessage} message - the request card the button sits on
     * @param {string} transferId - carried on the button as its value
     * @param {boolean} isAccept
     */
    static async _handleTransferResponse(message, transferId, isAccept) {
        // Hiding a button is not authorisation, and neither is whispering the
        // card. A whispered ChatMessage is still a document on every client, and
        // the action registry is callable from any of them — so without this,
        // any player could accept a transfer addressed to somebody else. The
        // card records who it was sent to; check against that rather than
        // trusting that only the right person can see it.
        const addressedTo = message.getFlag(MODULE.ID, 'targetUsers');
        if (Array.isArray(addressedTo) && !addressedTo.includes(game.user.id) && !game.user.isGM) return;

        // Get transfer data from the current message (the one with the buttons)
        const transferData = message.getFlag(MODULE.ID, 'data');
        if (!transferData) {
            ui.notifications.error("Transfer request data not found");
            return;
        }
        
        // Check if transfer has expired
        const timeoutSeconds = game.settings.get(MODULE.ID, 'transferTimeout');
        const currentTime = Date.now();
        const transferAge = currentTime - transferData.timestamp;
        const transferAgeSeconds = Math.floor(transferAge / 1000);
        
        if (transferAgeSeconds > timeoutSeconds) {
            // Transfer has expired - tell everyone involved, then retire the card
            const socket = game.modules.get(MODULE.ID)?.socket;
            if (socket) {
                // Send expiration message to sender
                const senderUser = game.users.get(transferData.sourceUserId);
                if (senderUser && !senderUser.isGM) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isTransferSender: true,
                        receiverIds: [senderUser.id],
                        transferId
                    });
                }
                
                // Send expiration message to receiver
                const receiverUsers = game.users.filter(user => user.character?.id === transferData.targetActorId && user.active && !user.isGM);
                if (receiverUsers.length > 0) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isTransferReceiver: true,
                        receiverIds: receiverUsers.map(u => u.id),
                        transferId
                    });
                }
                
                // Send expiration message to GMs
                const gmUsers = game.users.filter(u => u.isGM);
                if (gmUsers.length > 0) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isGMNotification: true,
                        receiverIds: gmUsers.map(u => u.id),
                        transferId
                    });
                }
            }
            
            // Retire the request rather than deleting it: whoever pressed the
            // button is owed an answer, and "expired" is one.
            await retireCard(message, {
                text: 'Expired',
                tone: 'negative',
                icon: 'fa-solid fa-clock'
            });

            return; // Exit early - don't process the expired transfer
        }
        const sourceActor = game.actors.get(transferData.sourceActorId);
        const targetActor = game.actors.get(transferData.targetActorId);
        const item = sourceActor?.items.get(transferData.itemId);
        const senderUser = game.users.get(transferData.sourceUserId);
        const receiverUsers = game.users.filter(user => user.character?.id === targetActor.id && user.active && !user.isGM);
        const gmUsers = game.users.filter(u => u.isGM);
        
        // Filter out GMs from sender/receiver users for message targeting
        const senderUsers = senderUser && !senderUser.isGM ? [senderUser] : [];

        // Retire the card up front rather than disabling its buttons in this
        // one browser. The old guard was a local DOM change, so a second client
        // showing the same whisper still had live buttons; rewriting the message
        // takes them away everywhere, which is what stops the double-click.
        //
        // The band records the ANSWER, not whether the goods arrived — the
        // transfer below can still fail on a stale quantity, and when it does
        // the socket handler whispers its own Transfer Failed card saying why.
        await retireCard(message, isAccept
            ? { text: 'Accepted', tone: 'positive', icon: 'fa-solid fa-circle-check' }
            : { text: 'Rejected', tone: 'negative', icon: 'fa-solid fa-circle-xmark' });

        if (isAccept) {
            // Execute the transfer
            const socket = game.modules.get(MODULE.ID)?.socket;
            if (!socket) {
                ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
                return;
            }
            
            const transferSucceeded = await socket.executeAsGM('executeItemTransfer', {
                sourceActorId: sourceActor.id,
                targetActorId: targetActor.id,
                sourceItemId: item?.id || transferData.itemId,
                quantity: transferData.quantity,
                hasQuantity: true,
                sourceUserId: senderUser.id,
                targetUserId: game.user.id,
                itemName: item?.name || transferData.itemName
            });
            
            // The receiver's request card was retired above.

            // Delete sender's "Waiting" message
            if (game.user.isGM) {
                const senderWaitingMessage = game.messages.find(msg => 
                    msg.getFlag(MODULE.ID, 'transferId') === transferId && 
                    msg.getFlag(MODULE.ID, 'isTransferSender') === true
                );
                if (senderWaitingMessage) {
                    await senderWaitingMessage.delete();
                }
            } else {
                // Non-GM: ask GM to delete the sender's waiting message
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    socket.executeAsGM('deleteSenderWaitingMessage', transferId);
                }
            }
            
            // If transfer failed, the socket handler already sent error messages - we're done
            if (!transferSucceeded) {
                return;
            }
            
            // Transfer succeeded - create success messages
            if (socket) {
                // One card for everyone involved, same as the direct
                // transfer path: three messages describing one event
                // meant every GM read the sender's copy, the receiver's
                // copy and their own.
                const receiverIds = [...new Set([
                    ...senderUsers.map(u => u.id),
                    ...receiverUsers.map(u => u.id),
                    ...gmUsers.map(u => u.id)
                ])];
                if (receiverIds.length > 0) {
                    await socket.executeAsGM('createTransferCompleteChat', {
                        sourceActorId: sourceActor.id,
                        sourceActorName: getActorDisplayName(sourceActor),
                        targetActorId: targetActor.id,
                        targetActorName: getActorDisplayName(targetActor),
                        itemId: item?.id || transferData.itemId,
                        itemName: item?.name || transferData.itemName,
                        quantity: transferData.quantity,
                        hasQuantity: true,
                        isPlural: transferData.quantity > 1,
                        receiverIds,
                        transferId
                    });
                }
            }
        } else {
            // Delete sender's "Waiting" message
            if (game.user.isGM) {
                const senderWaitingMessage = game.messages.find(msg => 
                    msg.getFlag(MODULE.ID, 'transferId') === transferId && 
                    msg.getFlag(MODULE.ID, 'isTransferSender') === true
                );
                if (senderWaitingMessage) {
                    await senderWaitingMessage.delete();
                }
            } else {
                // Non-GM: ask GM to delete the sender's waiting message
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    socket.executeAsGM('deleteSenderWaitingMessage', transferId);
                }
            }
            
            // Single rejection message for sender
            if (!game.user.isGM) {
                const socket = game.modules.get(MODULE.ID)?.socket;
                if (socket) {
                    await socket.executeAsGM('createTransferRejectedChat', {
                        sourceActorId: sourceActor.id,
                        sourceActorName: getActorDisplayName(sourceActor),
                        targetActorId: targetActor.id,
                        targetActorName: getActorDisplayName(targetActor),
                    itemId: item?.id || transferData.itemId,
                    itemName: item?.name || transferData.itemName,
                        quantity: transferData.quantity,
                        hasQuantity: true,
                        isPlural: transferData.quantity > 1,
                    isTransferSender: false,
                        receiverId: senderUser.id,
                        transferId
                    });
                }
            } else {
                // GM creates and sends the message directly. Neutral
                // wording, matching the socket branch above: both post
                // the same card, and only the route differs.
                await transferRejected({
                    sourceActorName: getActorDisplayName(sourceActor),
                    targetActorName: getActorDisplayName(targetActor),
                    itemName: item?.name || transferData.itemName,
                    quantity: transferData.quantity,
                    hasQuantity: true,
                    isPlural: transferData.quantity > 1,
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
                            sourceActorName: getActorDisplayName(sourceActor),
                            targetActorId: targetActor.id,
                            targetActorName: getActorDisplayName(targetActor),
                        itemId: item?.id || transferData.itemId,
                        itemName: item?.name || transferData.itemName,
                            quantity: transferData.quantity,
                            hasQuantity: true,
                            isPlural: transferData.quantity > 1,
                            isTransferReceiver: true,
                            receiverIds: receiverUsers.map(u => u.id),
                            transferId
                        });
                    }
                } else {
                    // GM creates and sends the message directly. The
                    // socket branch above marks this one as the
                    // receiver's copy, so this does too.
                    await transferRejected({
                        perspective: 'receiver',
                        sourceActorName: getActorDisplayName(sourceActor),
                        targetActorName: getActorDisplayName(targetActor),
                        itemName: item?.name || transferData.itemName,
                        quantity: transferData.quantity,
                        hasQuantity: true,
                        isPlural: transferData.quantity > 1,
                        whisper: receiverUsers.map(u => u.id),
                        // When GM sends it, it's properly from the GM
                        speaker: ChatMessage.getSpeaker({user: game.user})
                    });
                }
            }
        }
    }

    /**
     * Handle GM approval button clicks (Approve/Deny)
     * @param {Event} event - Click event
     * @param {ChatMessage} message - The chat message
     * @param {jQuery} html - The message HTML
     */
    static async _handleGMApproval(message, transferId, isApprove) {
        // Hiding a button is not authorisation — any client can fire an action
        // whatever its own copy of the card looks like.
        if (!game.user.isGM) return;

        // Get transfer data from the message
        const transferData = message.getFlag(MODULE.ID, 'data');
        if (!transferData) {
            ui.notifications.error("Transfer request data not found");
            return;
        }
        
        // Check if transfer has expired
        const timeoutSeconds = game.settings.get(MODULE.ID, 'transferTimeout');
        const currentTime = Date.now();
        const transferAge = currentTime - transferData.timestamp;
        const transferAgeSeconds = Math.floor(transferAge / 1000);
        
        if (transferAgeSeconds > timeoutSeconds) {
            // Transfer has expired - tell everyone involved, then retire the card
            const socket = game.modules.get(MODULE.ID)?.socket;
            if (socket) {
                // Send expiration message to sender
                const senderUser = game.users.get(transferData.sourceUserId);
                if (senderUser && !senderUser.isGM) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isTransferSender: true,
                        receiverIds: [senderUser.id],
                        transferId
                    });
                }
                
                // Send expiration message to receiver
                const receiverUsers = game.users.filter(user => user.character?.id === transferData.targetActorId && user.active && !user.isGM);
                if (receiverUsers.length > 0) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isTransferReceiver: true,
                        receiverIds: receiverUsers.map(u => u.id),
                        transferId
                    });
                }
                
                // Send expiration message to GMs
                const gmUsers = game.users.filter(u => u.isGM);
                if (gmUsers.length > 0) {
                    await socket.executeAsGM('createTransferExpiredChat', {
                        sourceActorId: transferData.sourceActorId,
                        sourceActorName: transferData.sourceActorName,
                        targetActorId: transferData.targetActorId,
                        targetActorName: transferData.targetActorName,
                        itemId: transferData.sourceItemId,
                        itemName: transferData.itemName,
                        quantity: transferData.selectedQuantity,
                        hasQuantity: transferData.hasQuantity,
                        isPlural: transferData.selectedQuantity > 1,
                        isGMNotification: true,
                        receiverIds: gmUsers.map(u => u.id),
                        transferId
                    });
                }
            }
            
            await retireCard(message, {
                text: 'Expired',
                tone: 'negative',
                icon: 'fa-solid fa-clock'
            });

            return; // Exit early - don't process the expired transfer
        }

        const sourceActor = game.actors.get(transferData.sourceActorId);
        const targetActor = game.actors.get(transferData.targetActorId);
        const item = sourceActor?.items.get(transferData.itemId);
        const senderUser = game.users.get(transferData.sourceUserId);

        // Retire the approval card to the decision it now records. This
        // replaces both the local button-disabling and the "Processing..." line
        // that used to be appended to this one browser's DOM: rewriting the
        // message takes the buttons away on every client, which is what
        // actually prevents a second GM answering the same request.
        await retireCard(message, isApprove
            ? { text: 'Approved', tone: 'positive', icon: 'fa-solid fa-circle-check' }
            : { text: 'Denied', tone: 'negative', icon: 'fa-solid fa-circle-xmark' });

        // The sender's "Waiting for GM approval" card is superseded by the one
        // posted below, so it still goes.
        try {
            const senderWaitingMessage = game.messages.find(msg =>
                msg.getFlag(MODULE.ID, 'transferId') === transferId &&
                msg.getFlag(MODULE.ID, 'isTransferSender') === true
            );
            if (senderWaitingMessage) await senderWaitingMessage.delete();
        } catch (error) {
            console.error('Error deleting sender waiting message:', error);
        }


        if (isApprove) {
            // GM approved - now send to receiver for their accept/reject.
            // This lives on TransferUtils, not here: as `this._send...` it was
            // always undefined and always threw, and now that the handler is
            // dispatched by Blacksmith — which logs a throwing handler rather
            // than surfacing it — the failure would be silent, leaving the card
            // retired to "Approved" with no receiver card ever posted.
            await TransferUtils._sendTransferReceiverMessage(sourceActor, targetActor, item || { name: transferData.itemName }, transferData.quantity, transferData.hasQuantity, transferId, transferData);
            
            // Send updated message to sender showing GM approval
            if (senderUser) {
                await transferRequestSender({
                    targetActorName: getActorDisplayName(targetActor),
                    itemName: item?.name || transferData.itemName,
                    quantity: transferData.quantity,
                    hasQuantity: transferData.hasQuantity,
                    isPlural: transferData.quantity > 1,
                    waitingOn: "GM approved. Waiting for receiver to accept.",
                    speaker: { alias: "System" },
                    whisper: [senderUser.id],
                    flags: {
                        transferId,
                        type: 'transferRequest',
                        isTransferSender: true
                    }
                });
            }
        } else {
            // GM denied - send rejection message to sender. Only the GM reaches
            // here, so there is no socket hop to make: the non-GM branch this
            // used to carry was unreachable behind the guard at the top.
            if (senderUser) {
                await transferRejected({
                    title: "Transfer Denied",
                    sourceActorName: getActorDisplayName(sourceActor),
                    targetActorName: getActorDisplayName(targetActor),
                    itemName: item?.name || transferData.itemName,
                    quantity: transferData.quantity,
                    hasQuantity: transferData.hasQuantity,
                    isPlural: transferData.quantity > 1,
                    reason: "The GM denied this transfer request.",
                    whisper: [senderUser.id],
                    speaker: ChatMessage.getSpeaker({user: game.user})
                });
            }
        }
    }

    destroy() {
        // Clean up any pending debounced render
        if (this._renderTimer) {
            clearTrackedTimeout(this._renderTimer);
            this._renderTimer = null;
        }

        this.element = null;
    }

}
