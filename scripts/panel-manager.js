import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { CharacterPanel } from './panel-character.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { ControlPanel } from './panel-control.js';
import { FeaturesPanel } from './panel-features.js';
import { DiceTrayPanel } from "./panel-dicetray.js";
import { ExperiencePanel } from "./panel-experience.js";
import { HealthPanel } from "./panel-health.js";
import { StatsPanel } from "./panel-stats.js";
import { AbilitiesPanel } from "./panel-abilities.js";

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
        this.dicetrayPanel = new DiceTrayPanel();
        this.experiencePanel = new ExperiencePanel(actor);
        this.healthPanel = new HealthPanel(actor);
        this.statsPanel = new StatsPanel(actor);
        this.abilitiesPanel = new AbilitiesPanel(actor);
        this.hiddenCategories = new Set();
    }

    static async initialize(actor = null) {
        // If we have an instance with the same actor, do nothing
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // Preserve health window state from old instance
        const oldHealthPanel = PanelManager.instance?.healthPanel;
        const hadHealthWindow = oldHealthPanel?.isPoppedOut && oldHealthPanel?.window;

        // Create or update instance
        PanelManager.currentActor = actor;
        
        // Always create a new instance to ensure clean state
        PanelManager.instance = new PanelManager(actor);

        // Restore health window state if it was open
        if (hadHealthWindow) {
            PanelManager.instance.healthPanel.isPoppedOut = true;
            PanelManager.instance.healthPanel.window = oldHealthPanel.window;
            PanelManager.instance.healthPanel.window.panel = PanelManager.instance.healthPanel;
            HealthPanel.isWindowOpen = true;
            HealthPanel.activeWindow = PanelManager.instance.healthPanel.window;
            // Update the panel and window with the new actor
            PanelManager.instance.healthPanel.updateActor(actor);
        }

        // Remove any existing trays first
        $('.squire-tray').remove();
        
        // Create the tray
        await PanelManager.instance.createTray();
    }

    async createTray() {
        const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
            actor: this.actor,
            effects: this.actor.effects?.map(e => e.name) || [],
            settings: {
                showExperiencePanel: game.settings.get(MODULE.ID, 'showExperiencePanel'),
                showHealthPanel: game.settings.get(MODULE.ID, 'showHealthPanel'),
                showAbilitiesPanel: game.settings.get(MODULE.ID, 'showAbilitiesPanel'),
                showStatsPanel: game.settings.get(MODULE.ID, 'showStatsPanel'),
                showDiceTrayPanel: game.settings.get(MODULE.ID, 'showDiceTrayPanel')
            },
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
            showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen
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

    async updateTray() {
        if (PanelManager.element) {
            // Re-render the entire tray template
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
                actor: this.actor,
                effects: this.actor.effects?.map(e => e.name) || [],
                settings: {
                    showExperiencePanel: game.settings.get(MODULE.ID, 'showExperiencePanel'),
                    showHealthPanel: game.settings.get(MODULE.ID, 'showHealthPanel'),
                    showAbilitiesPanel: game.settings.get(MODULE.ID, 'showAbilitiesPanel'),
                    showStatsPanel: game.settings.get(MODULE.ID, 'showStatsPanel'),
                    showDiceTrayPanel: game.settings.get(MODULE.ID, 'showDiceTrayPanel')
                },
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
                isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
                isHealthPopped: HealthPanel.isWindowOpen
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

            // Create new panel instances with updated element references
            this.characterPanel = new CharacterPanel(this.actor);
            this.controlPanel = new ControlPanel(this.actor);
            this.favoritesPanel = new FavoritesPanel(this.actor);
            this.spellsPanel = new SpellsPanel(this.actor);
            this.weaponsPanel = new WeaponsPanel(this.actor);
            this.inventoryPanel = new InventoryPanel(this.actor);
            this.featuresPanel = new FeaturesPanel(this.actor);
            this.experiencePanel = new ExperiencePanel(this.actor);

            // Only create health panel if not popped out
            if (!HealthPanel.isWindowOpen) {
                this.healthPanel = new HealthPanel(this.actor);
            }

            this.statsPanel = new StatsPanel(this.actor);
            this.abilitiesPanel = new AbilitiesPanel(this.actor);

            // Update panel element references for non-popped panels
            this.characterPanel.element = PanelManager.element;
            this.controlPanel.element = PanelManager.element;
            this.favoritesPanel.element = PanelManager.element;
            this.spellsPanel.element = PanelManager.element;
            this.weaponsPanel.element = PanelManager.element;
            this.inventoryPanel.element = PanelManager.element;
            this.featuresPanel.element = PanelManager.element;
            this.experiencePanel.element = PanelManager.element;
            if (!HealthPanel.isWindowOpen) {
                this.healthPanel.element = PanelManager.element;
            }
            this.statsPanel.element = PanelManager.element;
            this.abilitiesPanel.element = PanelManager.element;

            // Render all panels
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
                effects: this.actor.effects?.map(e => e.name) || [],
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
        if (!DiceTrayPanel.isWindowOpen) {
            await this.dicetrayPanel.render(element);
        }
        await this.experiencePanel.render(element);
        if (!HealthPanel.isWindowOpen) {
            await this.healthPanel.render(element);
        }
        await this.statsPanel.render(element);
        await this.abilitiesPanel.render(element);
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
        const headers = panel.querySelectorAll('.category-header');
        
        headers.forEach(header => {
            const categoryId = header.dataset.categoryId;
            if (this.hiddenCategories.has(categoryId)) {
                header.style.display = 'none';
                return;
            }

            const items = panel.querySelectorAll(`[data-category-id="${categoryId}"]:not(.category-header)`);
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
Hooks.on('canvasReady', async () => {
    // Debug log the available tokens and ownership
    console.log("SQUIRE | Canvas Ready Token Debug", {
        availableTokens: canvas.tokens?.placeables.map(t => ({
            name: t.name,
            actorId: t.actor?.id,
            isOwner: t.actor?.isOwner,
            isControlled: t.controlled,
            type: t.actor?.type
        })),
        defaultCharacter: game.user.character?.name,
        userId: game.user.id
    });

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
        console.log("SQUIRE | Using controlled token:", initialActor.name);
    }
    
    // 2. Try default character if no controlled token
    if (!initialActor) {
        initialActor = game.user.character;
        if (initialActor) {
            selectionReason = "default character";
            console.log("SQUIRE | Using default character:", initialActor.name);
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
            console.log("SQUIRE | Using first owned character token:", initialActor.name);
        }
    }
    
    // 4. Fall back to any owned token
    if (!initialActor) {
        const anyToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
        initialActor = anyToken?.actor;
        if (initialActor) {
            selectionReason = "first owned token";
            console.log("SQUIRE | Using first owned token:", initialActor.name);
        }
    }
    
    // Initialize with the found actor
    if (initialActor) {
        console.log("SQUIRE | Selected Initial Actor", {
            name: initialActor.name,
            id: initialActor.id,
            type: initialActor.type,
            isOwner: initialActor.isOwner,
            selectionReason: selectionReason
        });

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

// Also handle when tokens are selected
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
Hooks.on('deleteToken', async (token) => {
    if (PanelManager.currentActor?.id === token.actor?.id) {
        PanelManager.instance = null;
        PanelManager.currentActor = null;
        
        // Try to find another token to display
        const nextToken = canvas.tokens?.placeables.find(t => t.actor?.isOwner);
        if (nextToken) {
            await PanelManager.initialize(nextToken.actor);
        }
    }
});

Hooks.on('updateActor', async (actor) => {
    if (PanelManager.currentActor?.id === actor.id) {
        await PanelManager.initialize(actor);
        
        // Force a re-render of all panels
        if (PanelManager.instance) {
            await PanelManager.instance.renderPanels(PanelManager.element);
        }
    }
});

// Add a hook for when the game is paused/unpaused to ensure panels stay responsive
Hooks.on('pauseGame', async (paused) => {
    if (!paused && PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
}); 