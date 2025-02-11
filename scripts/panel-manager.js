import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { CharacterPanel } from './panel-character.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { ControlPanel } from './panel-control.js';
import { FeaturesPanel } from './panel-features.js';

export class PanelManager {
    static instance = null;
    static currentActor = null;
    static isPinned = false;
    static element = null;

    constructor(actor) {
        this.actor = actor;
        this.characterPanel = new CharacterPanel(actor);
        this.controlPanel = new ControlPanel(actor);
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
        this.inventoryPanel = new InventoryPanel(actor);
        this.featuresPanel = new FeaturesPanel(actor);
        this.hiddenCategories = new Set();
    }

    static async initialize(actor = null) {
        // If we have an instance with the same actor, do nothing
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // Log actor data for debugging conditions
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Actor Data for Conditions",
            {
                actorId: actor?.id,
                actorName: actor?.name,
                systemData: actor?.system,
                effects: actor?.effects?.map(e => ({
                    id: e.id,
                    label: e.label,
                    icon: e.icon,
                    flags: e.flags,
                    statuses: e.statuses
                })),
                statuses: actor?.statuses,
                flags: actor?.flags,
                tempEffects: actor?.temporaryEffects,
                activeEffects: actor?.effects?.filter(e => !e.disabled).map(e => e.label)
            },
            false,
            true,
            false,
            MODULE.TITLE
        );

        // Create or update instance
        PanelManager.currentActor = actor;
        if (!PanelManager.instance) {
            PanelManager.instance = new PanelManager(actor);
            await PanelManager.instance.createTray();
        } else {
            PanelManager.instance.actor = actor;
            PanelManager.instance.characterPanel = new CharacterPanel(actor);
            PanelManager.instance.controlPanel = new ControlPanel(actor);
            PanelManager.instance.favoritesPanel = new FavoritesPanel(actor);
            PanelManager.instance.spellsPanel = new SpellsPanel(actor);
            PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            PanelManager.instance.inventoryPanel = new InventoryPanel(actor);
            PanelManager.instance.featuresPanel = new FeaturesPanel(actor);
            await PanelManager.instance.updateTray();
        }
    }

    async createTray() {
        // Create the tray if it doesn't exist
        if (!document.getElementById('squire-tray')) {
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
                actor: this.actor,
                effects: this.actor.effects?.map(e => e.label) || [],
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar')
            });
            const trayElement = $(trayHtml);
            $('body').append(trayElement);
            PanelManager.element = trayElement;
            
            // Set initial position and restore pin state
            trayElement.attr('data-position', 'left');
            PanelManager.isPinned = game.settings.get(MODULE.ID, 'isPinned');
            if (PanelManager.isPinned) {
                trayElement.addClass('pinned expanded');
            }

            this.activateListeners(trayElement);
            await this.renderPanels(trayElement);
        }
    }

    async updateTray() {
        if (PanelManager.element) {
            // Re-render the entire tray template
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
                actor: this.actor,
                effects: this.actor.effects?.map(e => e.label) || [],
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar')
            });
            const newTrayElement = $(trayHtml);
            
            // Preserve expanded/pinned state without animation
            if (PanelManager.element.hasClass('expanded')) {
                newTrayElement.addClass('expanded').css('animation', 'none');
            }
            if (PanelManager.element.hasClass('pinned')) {
                newTrayElement.addClass('pinned');
            }
            
            // Replace the old tray with the new one
            PanelManager.element.replaceWith(newTrayElement);
            PanelManager.element = newTrayElement;
            
            // Re-attach listeners and render panels
            this.activateListeners(PanelManager.element);
            await this.renderPanels(PanelManager.element);

            // Remove the animation override after a brief delay
            setTimeout(() => {
                PanelManager.element.css('animation', '');
            }, 100);
        }
    }

    async updateHandle() {
        if (PanelManager.element) {
            const handleTemplate = await renderTemplate(TEMPLATES.HANDLE_PLAYER, {
                actor: this.actor,
                effects: this.actor.effects?.map(e => e.label) || [],
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar')
            });
            const handle = PanelManager.element.find('.handle-left');
            handle.html(handleTemplate);
            this.activateListeners(PanelManager.element);
        }
    }

    async renderPanels(element) {
        await this.characterPanel.render(element);
        await this.controlPanel.render(element);
        await this.favoritesPanel.render(element);
        await this.spellsPanel.render(element);
        await this.weaponsPanel.render(element);
        await this.inventoryPanel.render(element);
        await this.featuresPanel.render(element);
    }

    activateListeners(tray) {
        const handle = tray.find('.tray-handle');
        
        // Handle click on handle (collapse chevron)
        handle.on('click', (event) => {
            if ($(event.target).closest('.pin-button').length || $(event.target).closest('.handle-favorite-icon').length) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            if (PanelManager.isPinned) {
                ui.notifications.warn("You have the tray pinned open. Unpin the tray to close it.");
                return false;
            }
            
            // Play tray open sound when expanding
            if (!tray.hasClass('expanded')) {
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
            }
            
            tray.toggleClass('expanded');
            return false;
        });

        // Handle favorite item clicks
        handle.find('.handle-favorite-icon').on('click', async (event) => {
            if ($(event.target).hasClass('handle-favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
        });

        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            PanelManager.isPinned = !PanelManager.isPinned;
            await game.settings.set(MODULE.ID, 'isPinned', PanelManager.isPinned);
            
            // Play pin/unpin sound
            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
            if (blacksmith) {
                const sound = game.settings.get(MODULE.ID, PanelManager.isPinned ? 'pinSound' : 'unpinSound');
                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
            }
            
            if (PanelManager.isPinned) {
                tray.addClass('pinned expanded');
                // Update UI margin when pinned - only need trayWidth + offset since handle is included in width
                const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            } else {
                tray.removeClass('pinned expanded');
                // Reset UI margin when unpinned - need both handle width and offset
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            }
            
            return false;
        });

        // Add drop handling
        const trayContent = tray.find('.tray-content');
        
        // Drag enter/leave events for visual feedback
        trayContent.on('dragenter', (event) => {
            event.preventDefault();
            try {
                const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                const dropType = data.type;
                let dropMessage = "Drop to Add";
                
                // Play hover sound
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                // Customize message based on type
                switch(dropType) {
                    case 'Item':
                        dropMessage = `Drop to Add ${data.name || 'Item'}`;
                        break;
                    case 'ItemDirectory':
                        dropMessage = `Drop to Add from Compendium`;
                        break;
                    case 'Actor':
                        dropMessage = `Drop to Add from Character`;
                        break;
                }
                
                trayContent.addClass('drop-hover');
                trayContent.attr('data-drop-type', dropType.toLowerCase());
                trayContent.attr('data-drop-message', dropMessage);
            } catch (error) {
                // If we can't parse the data, use default message
                trayContent.addClass('drop-hover');
            }
        });

        trayContent.on('dragleave', (event) => {
            event.preventDefault();
            if (!event.relatedTarget?.closest('.tray-content')) {
                trayContent.removeClass('drop-hover');
                trayContent.removeAttr('data-drop-type');
                trayContent.removeAttr('data-drop-message');
            }
        });

        // Handle drops
        trayContent.on('drop', async (event) => {
            event.preventDefault();
            trayContent.removeClass('drop-hover');

            try {
                const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                
                // Play drop sound
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
                
                blacksmith?.utils.postConsoleAndNotification(
                    "SQUIRE | Drop data received",
                    data,
                    false,
                    true,
                    false,
                    MODULE.TITLE
                );

                if (!this.actor) {
                    ui.notifications.warn("Please select a character before dropping items.");
                    return;
                }

                // Handle different drop types
                let item;
                switch (data.type) {
                    case 'Item':
                        item = await Item.implementation.fromDropData(data);
                        if (!item) return;
                        // Create the item on the actor
                        const createdItem = await this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
                        
                        // Debug log the UUID generation
                        const itemUUID = this._getItemUUID(createdItem[0], data);
                        // blacksmith?.utils.postConsoleAndNotification(
                        //     "SQUIRE | Generated UUID for Item drop",
                        //     {
                        //         data,
                        //         createdItem: createdItem[0],
                        //         generatedUUID: itemUUID
                        //     },
                        //     false,
                        //     true,
                        //     false,
                        //     MODULE.TITLE
                        // );
                        
                        // Send chat notification
                        const chatData = {
                            isPublic: true,
                            strCardIcon: this._getDropIcon(item.type),
                            strCardTitle: this._getDropTitle(item.type),
                            strCardContent: `<p><strong>${this.actor.name}</strong> received <strong>${item.name}</strong> via the Squire tray.</p>`
                        };
                        const chatContent = await renderTemplate(TEMPLATES.CHAT_CARD, chatData);
                        await ChatMessage.create({
                            content: chatContent,
                            speaker: ChatMessage.getSpeaker({ actor: this.actor })
                        });
                        break;

                    case 'ItemDirectory':
                        const itemData = game.items.get(data.uuid)?.toObject();
                        if (itemData) {
                            const newItem = await this.actor.createEmbeddedDocuments('Item', [itemData]);
                            
                            // Debug log the UUID generation
                            const dirItemUUID = this._getItemUUID(newItem[0], data);
                            blacksmith?.utils.postConsoleAndNotification(
                                "SQUIRE | Generated UUID for ItemDirectory drop",
                                {
                                    data,
                                    newItem: newItem[0],
                                    generatedUUID: dirItemUUID
                                },
                                false,
                                true,
                                false,
                                MODULE.TITLE
                            );
                            
                            // Send chat notification
                            const dirItemChatData = {
                                isPublic: true,
                                strCardIcon: this._getDropIcon(itemData.type),
                                strCardTitle: this._getDropTitle(itemData.type),
                                strCardContent: `<p><strong>${this.actor.name}</strong> received <strong>${itemData.name}</strong> via the Squire tray.</p>`
                            };
                            const dirItemChatContent = await renderTemplate(TEMPLATES.CHAT_CARD, dirItemChatData);
                            await ChatMessage.create({
                                content: dirItemChatContent,
                                speaker: ChatMessage.getSpeaker({ actor: this.actor })
                            });
                        }
                        break;

                    // Add more cases as needed for other drop types
                }

                // Update the tray display
                await this.updateTray();

            } catch (error) {
                console.error(`${MODULE.TITLE} | Error handling drop:`, error);
            }
        });

        // Prevent default drag over behavior
        trayContent.on('dragover', (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
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

    // Helper method to get the appropriate UUID format
    _getItemUUID(item, data) {
        // For compendium items
        if (data.pack) {
            return `@UUID[Compendium.${data.pack}.Item.${item._id}]{${item.name}}`;
        }
        // For regular items
        return `@UUID[Item.${item._id}]{${item.name}}`;
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
     * Toggle visibility of a category
     * @param {string} categoryId - The ID of the category to toggle
     * @param {HTMLElement} panel - The panel element containing the category
     * @param {boolean} [active] - Optional force state (true = show, false = hide)
     */
    toggleCategory(categoryId, panel, active = null) {
        const filter = panel.querySelector(`[data-filter-id="${categoryId}"]`);
        const items = panel.querySelectorAll(`[data-category-id="${categoryId}"]`);
        
        // If active is not provided, toggle based on current state
        const shouldBeActive = active !== null ? active : !filter?.classList.contains('active');
        
        // Update filter button state
        if (filter) {
            if (shouldBeActive) {
                filter.classList.add('active');
                this.hiddenCategories.delete(categoryId);
            } else {
                filter.classList.remove('active');
                this.hiddenCategories.add(categoryId);
            }
        }

        // Update visibility of items and headers
        items.forEach(item => {
            if (shouldBeActive) {
                item.style.removeProperty('display');
            } else {
                item.style.display = 'none';
            }
        });

        // Update visibility of empty sections
        this._updateEmptyMessage(panel);
    }

    /**
     * Update visibility of items based on search text
     * @param {string} searchText - The text to search for
     * @param {HTMLElement} panel - The panel element containing the items
     * @param {string} itemSelector - The selector for items (e.g., '.spell-item', '.weapon-item')
     */
    updateSearchVisibility(searchText, panel, itemSelector) {
        const items = panel.querySelectorAll(itemSelector);
        const normalizedSearch = searchText.toLowerCase().trim();
        let hasVisibleItems = false;

        items.forEach(item => {
            const name = item.querySelector('.weapon-name, .spell-name, .inventory-name')?.textContent.toLowerCase() || '';
            const categoryId = item.dataset.categoryId;
            const matchesSearch = !normalizedSearch || name.includes(normalizedSearch);
            const categoryVisible = !this.hiddenCategories.has(categoryId);

            if (matchesSearch && categoryVisible) {
                item.style.removeProperty('display');
                hasVisibleItems = true;
            } else {
                item.style.display = 'none';
            }
        });

        // Update headers visibility
        this._updateHeadersVisibility(panel);
        this._updateEmptyMessage(panel, hasVisibleItems);
    }

    /**
     * Update visibility of category headers based on visible items
     * @param {HTMLElement} panel - The panel element
     * @private
     */
    _updateHeadersVisibility(panel) {
        const headers = panel.querySelectorAll('.weapons-header, .features-header, .inventory-header, .level-header');
        
        headers.forEach(header => {
            const categoryId = header.dataset.categoryId;
            if (this.hiddenCategories.has(categoryId)) {
                header.style.display = 'none';
                return;
            }

            const items = panel.querySelectorAll(`[data-category-id="${categoryId}"]:not(.weapons-header):not(.features-header):not(.inventory-header):not(.level-header)`);
            let hasVisibleItems = false;

            items.forEach(item => {
                if (item.style.display !== 'none') {
                    hasVisibleItems = true;
                }
            });

            header.style.display = hasVisibleItems ? '' : 'none';
        });
    }

    /**
     * Update visibility of the "no matches" message
     * @param {HTMLElement} panel - The panel element
     * @param {boolean} hasVisibleItems - Whether there are any visible items
     * @private
     */
    _updateEmptyMessage(panel, hasVisibleItems = null) {
        const noMatchesMsg = panel.querySelector('.no-matches');
        if (!noMatchesMsg) return;

        if (hasVisibleItems === null) {
            // Calculate if there are visible items
            const items = panel.querySelectorAll('.weapon-item, .spell-item, .inventory-item');
            hasVisibleItems = Array.from(items).some(item => item.style.display !== 'none');
        }

        noMatchesMsg.style.display = hasVisibleItems ? 'none' : 'block';
    }

    /**
     * Reset all categories to visible
     * @param {HTMLElement} panel - The panel element
     */
    resetCategories(panel) {
        this.hiddenCategories.clear();
        const filters = panel.querySelectorAll('[data-filter-id]');
        filters.forEach(filter => {
            filter.classList.add('active');
            this.toggleCategory(filter.dataset.filterId, panel, true);
        });
    }
}

// Hooks
Hooks.on('ready', async () => {
    const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
    await PanelManager.initialize(firstOwnedToken?.actor || null);
});

Hooks.on('controlToken', async (token, controlled) => {
    // Only care about token selection, not deselection
    if (!controlled) return;
    
    // Only proceed if it's a GM or the token owner
    if (!game.user.isGM && !token.actor?.isOwner) return;

    // If not pinned, handle the animation sequence
    if (!PanelManager.isPinned && PanelManager.element) {
        PanelManager.element.removeClass('expanded');
        await PanelManager.initialize(token.actor);
        
        // Play tray open sound
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (blacksmith) {
            const sound = game.settings.get(MODULE.ID, 'trayOpenSound');
            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
        }
        
        PanelManager.element.addClass('expanded');
        return;
    }

    // If pinned, just update the data immediately
    await PanelManager.initialize(token.actor);
});

// Also handle when tokens are deleted or actors are updated
Hooks.on('deleteToken', (token) => {
    if (PanelManager.currentActor?.id === token.actor?.id) {
        PanelManager.instance = null;
        PanelManager.currentActor = null;
    }
});

Hooks.on('updateActor', (actor) => {
    if (PanelManager.currentActor?.id === actor.id) {
        PanelManager.initialize(actor);
    }
}); 