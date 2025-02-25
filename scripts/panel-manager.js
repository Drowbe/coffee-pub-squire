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
    static newlyAddedItems = new Map();

    constructor(actor) {
        this.actor = actor;
        this.characterPanel = new CharacterPanel(actor);
        this.controlPanel = new ControlPanel(actor);
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
        this.inventoryPanel = new InventoryPanel(actor);
        this.featuresPanel = new FeaturesPanel(actor);
        this.dicetrayPanel = new DiceTrayPanel({ actor });
        this.experiencePanel = new ExperiencePanel(actor);
        this.healthPanel = new HealthPanel(actor);
        this.statsPanel = new StatsPanel(actor);
        this.abilitiesPanel = new AbilitiesPanel(actor);
        this.hiddenCategories = new Set();
    }

    static async initialize(actor = null) {
        // If we have an instance with the same actor, do nothing
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // Preserve window states from old instance
        const oldHealthPanel = PanelManager.instance?.healthPanel;
        const hadHealthWindow = oldHealthPanel?.isPoppedOut && oldHealthPanel?.window;
        const oldDiceTrayPanel = PanelManager.instance?.dicetrayPanel;
        const hadDiceTrayWindow = oldDiceTrayPanel?.isPoppedOut && oldDiceTrayPanel?.window;

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

        // Restore dice tray window state if it was open
        if (hadDiceTrayWindow) {
            PanelManager.instance.dicetrayPanel.isPoppedOut = true;
            PanelManager.instance.dicetrayPanel.window = oldDiceTrayPanel.window;
            PanelManager.instance.dicetrayPanel.window.panel = PanelManager.instance.dicetrayPanel;
            DiceTrayPanel.isWindowOpen = true;
            DiceTrayPanel.activeWindow = PanelManager.instance.dicetrayPanel.window;
            // Update the panel and window with the new actor
            PanelManager.instance.dicetrayPanel.updateActor(actor);
        }

        // Remove any existing trays first
        $('.squire-tray').remove();
        
        // Create the tray
        await PanelManager.instance.createTray();
    }

    async createTray() {
        const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
            actor: this.actor,
            isGM: game.user.isGM,
            effects: this.actor.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
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
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            newlyAddedItems: Object.fromEntries(PanelManager.newlyAddedItems)
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
        if (!this.element) return;

        // Update actor references
        if (this.actor) {
            this.characterPanel.actor = this.actor;
            this.weaponsPanel.actor = this.actor;
            this.inventoryPanel.actor = this.actor;
            this.featuresPanel.actor = this.actor;
            this.dicetrayPanel.updateActor(this.actor);
            this.experiencePanel.actor = this.actor;
            this.healthPanel.updateActor(this.actor);
            this.statsPanel.actor = this.actor;
            this.abilitiesPanel.actor = this.actor;
        }

        if (PanelManager.element) {
            // Re-render the entire tray template
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { 
                actor: this.actor,
                isGM: game.user.isGM,
                effects: this.actor.effects?.map(e => ({
                    name: e.name,
                    icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
                })) || [],
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
                showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
                isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
                isHealthPopped: HealthPanel.isWindowOpen,
                newlyAddedItems: Object.fromEntries(PanelManager.newlyAddedItems)
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
            // Get favorites in their correct order from the FavoritesPanel class
            const favoriteIds = FavoritesPanel.getFavorites(this.actor);
            const itemsById = new Map(this.actor.items.map(item => [item.id, item]));
            
            // Map favorites in their original order
            const favorites = favoriteIds
                .map((id, index) => {
                    const item = itemsById.get(id);
                    if (!item) return null;
                    return {
                        id: item.id,
                        name: item.name,
                        img: item.img || 'icons/svg/item-bag.svg',
                        type: item.type,
                        system: item.system,
                        sortOrder: index
                    };
                })
                .filter(item => item !== null);

            const handleTemplate = await renderTemplate(TEMPLATES.HANDLE_PLAYER, {
                actor: this.actor,
                isGM: game.user.isGM,
                effects: this.actor.effects?.map(e => ({
                    name: e.name,
                    icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
                })) || [],
                favorites: favorites,
                showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
                showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
                showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
                showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
                showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
                showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray')
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
        
        // Clean up existing drop event listeners
        const trayContent = tray.find('.tray-content');
        trayContent.off('dragenter dragleave dragover drop');
        
        // Handle click on handle (collapse chevron)
        handle.on('click', (event) => {
            if ($(event.target).closest('.pin-button').length || 
                $(event.target).closest('.handle-favorite-icon').length ||
                $(event.target).closest('.handle-health-bar').length ||
                $(event.target).closest('.handle-dice-tray').length) return;
            
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

        // Handle dice tray icon clicks
        handle.find('.handle-dice-tray').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.dicetrayPanel && !this.dicetrayPanel.isPoppedOut) {
                await this.dicetrayPanel._onPopOut();
            }
        });

        // Handle health bar clicks
        handle.find('.handle-health-bar').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.healthPanel && !this.healthPanel.isPoppedOut) {
                await this.healthPanel._onPopOut();
            }
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

        // Handle drop events
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
                        
                        // Add the item ID with current timestamp
                        PanelManager.newlyAddedItems.set(createdItem[0].id, Date.now());
                        
                        // Update the tray first
                        await this.updateTray();
                        await this.renderPanels(PanelManager.element);
                        
                        // Debug log the UUID generation
                        const itemUUID = this._getItemUUID(createdItem[0], data);
                        
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
                            
                            // Add the item ID with current timestamp
                            PanelManager.newlyAddedItems.set(newItem[0].id, Date.now());
                            
                            // Update the tray first
                            await this.updateTray();
                            await this.renderPanels(PanelManager.element);
                            
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

            } catch (error) {
                console.error(`${MODULE.TITLE} | Error handling drop:`, error);
            }
        });

        // Prevent default drag over behavior
        trayContent.on('dragover', (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        // Handle condition icon clicks
        tray.find('.condition-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // If this is the add effect icon, handle differently
            if ($(event.currentTarget).hasClass('add-effect-icon')) {
                // Only GMs can add effects
                if (!game.user.isGM) {
                    ui.notifications.warn("Only GMs can add effects.");
                    return;
                }

                // Get all available conditions from CONFIG.DND5E.conditionTypes
                const conditions = Object.entries(CONFIG.DND5E.conditionTypes).map(([id, condition]) => ({
                    id,
                    name: condition.label,
                    icon: condition.icon,
                    isActive: this.actor.effects.some(e => e.name === condition.label)
                }));

                // Create a dialog with condition options
                const content = `
                    <div class="squire-description-window">
                        <div class="squire-description-header">
                            <img src="icons/svg/aura.svg"/>
                            <h1>Add Condition</h1>
                        </div>
                        
                        <div class="squire-description-content">
                            <div class="effect-grid">
                                ${conditions.map(condition => `
                                    <div class="effect-option ${condition.isActive ? 'active' : ''}" data-condition-id="${condition.id}">
                                        <img src="${condition.icon}" title="${condition.name}"/>
                                        <div class="effect-name">${condition.name}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <style>
                        .squire-description-window .effect-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                            gap: 10px;
                            padding: 10px;
                            margin-top: 10px;
                        }
                        .squire-description-window .effect-option {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            cursor: pointer;
                            padding: 8px;
                            border-radius: 5px;
                            background: rgba(255, 255, 255, 0.1);
                            transition: all 0.2s ease;
                            border: 1px solid transparent;
                            position: relative;
                        }
                        .squire-description-window .effect-option:hover {
                            background: rgba(255, 255, 255, 0.2);
                            border-color: var(--color-border-highlight);
                            box-shadow: 0 0 10px var(--color-shadow-highlight);
                        }
                        .squire-description-window .effect-option.active {
                            background: rgba(var(--color-shadow-primary), 0.5);
                            border-color: var(--color-border-highlight);
                            box-shadow: 0 0 10px var(--color-shadow-highlight) inset;
                        }
                        .squire-description-window .effect-option.active:hover {
                            background: rgba(var(--color-shadow-primary), 0.7);
                        }
                        .squire-description-window .effect-option.active::after {
                            content: '✓';
                            position: absolute;
                            top: -5px;
                            right: -5px;
                            background: var(--color-shadow-primary);
                            color: var(--color-text-light-highlight);
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 12px;
                            border: 1px solid var(--color-border-highlight);
                            box-shadow: 0 0 5px var(--color-shadow-highlight);
                        }
                        .squire-description-window .effect-option img {
                            width: 40px;
                            height: 40px;
                            object-fit: contain;
                            border: none;
                            filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
                        }
                        .squire-description-window .effect-option .effect-name {
                            text-align: center;
                            font-size: 12px;
                            margin-top: 5px;
                            color: var(--color-text-light-highlight);
                            text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
                        }
                    </style>
                `;

                const dialog = new Dialog({
                    title: "Add Effect",
                    content: content,
                    buttons: {
                        close: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Close"
                        }
                    },
                    render: (html) => {
                        html.find('.effect-option').click(async (e) => {
                            const conditionId = e.currentTarget.dataset.conditionId;
                            const condition = CONFIG.DND5E.conditionTypes[conditionId];
                            const isActive = $(e.currentTarget).hasClass('active');
                            
                            try {
                                if (isActive) {
                                    // Remove the effect
                                    const effect = this.actor.effects.find(e => e.name === condition.label);
                                    if (effect) {
                                        await effect.delete();
                                        $(e.currentTarget).removeClass('active');
                                        ui.notifications.info(`Removed ${condition.label} from ${this.actor.name}`);
                                    }
                                } else {
                                    // Add the effect
                                    await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                                        name: condition.label,
                                        icon: condition.icon,
                                        origin: this.actor.uuid,
                                        disabled: false
                                    }]);
                                    $(e.currentTarget).addClass('active');
                                    ui.notifications.info(`Added ${condition.label} to ${this.actor.name}`);
                                }
                            } catch (error) {
                                console.error("SQUIRE | Error toggling condition:", error);
                                ui.notifications.error(`Could not toggle ${condition.label}`);
                            }
                        });
                    }
                }, {
                    classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                    width: 400,
                    height: "auto"
                });
                
                dialog.render(true);
                return;
            }
            
            // Regular condition icon click handling continues here...
            const conditionName = event.currentTarget.title;
            
            // Try to get the condition data from CONFIG.DND5E.conditionTypes
            let description = "No description available.";
            try {
                const conditionData = CONFIG.DND5E.conditionTypes[conditionName.toLowerCase()];

                // Get the icon path from the clicked element
                const iconPath = event.currentTarget.src;

                if (conditionData?.reference) {
                    // Parse the reference string: "Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.0b8N4FymGGfbZGpJ"
                    const [, system, packName, type, journalId, , pageId] = conditionData.reference.split(".");
                    const pack = game.packs.get(`${system}.${packName}`);
                    
                    if (pack) {
                        const journal = await pack.getDocument(journalId);
                        if (journal) {
                            const page = journal.pages.get(pageId);
                            if (page) {
                                description = page.text.content;
                            }
                        }
                    }
                }

                // Create a dialog showing the condition details
                const content = `
                    <div class="squire-description-window">
                        <div class="squire-description-header">
                            <img src="${iconPath}"/>
                            <h1>${conditionData?.label || conditionName}</h1>
                        </div>
                        
                        <div class="squire-description-content">
                            ${description.split('\n').filter(line => line.trim()).map(line => 
                                `<p>${line.trim()}</p>`
                            ).join('')}
                            ${game.user.isGM ? '<p class="gm-note"><i>Right-click to remove this condition.</i></p>' : ''}
                        </div>
                    </div>
                    <style>
                        .gm-note {
                            margin-top: 1em;
                            font-size: 0.9em;
                            color: var(--color-text-dark-secondary);
                            font-style: italic;
                        }
                    </style>`;
                
                new Dialog({
                    title: conditionData?.label || conditionName,
                    content: content,
                    buttons: {
                        close: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Close"
                        }
                    },
                    default: "close"
                }, {
                    classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                    width: 400,
                    height: "auto"
                }).render(true);
                
            } catch (error) {
                console.error("SQUIRE | Error getting condition description:", error);
                ui.notifications.warn("Could not load condition description.");
            }
        }).on('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can remove effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can remove effects.");
                return;
            }
            
            const conditionName = event.currentTarget.title;
            
            try {
                // Find the effect with this condition name
                const effect = this.actor.effects.find(e => e.name === conditionName);
                if (effect) {
                    await effect.delete();
                    ui.notifications.info(`Removed ${conditionName} from ${this.actor.name}`);
                }
            } catch (error) {
                console.error("SQUIRE | Error removing condition:", error);
                ui.notifications.error(`Could not remove ${conditionName}`);
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

    // Add this new method for cleanup
    static cleanupNewlyAddedItems() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds
        for (const [itemId, timestamp] of PanelManager.newlyAddedItems) {
            if (timestamp < fiveMinutesAgo) {
                PanelManager.newlyAddedItems.delete(itemId);
            }
        }
    }
}

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

// Handle actor updates that require full re-initialization
Hooks.on('updateActor', async (actor, changes) => {
    // Only handle major changes that require full re-initialization
    const needsFullUpdate = changes.name || // Name change
                           changes.img || // Image change
                           changes.system?.attributes?.prof || // Proficiency change
                           changes.system?.details?.level || // Level change
                           changes.system?.attributes?.ac || // AC change
                           changes.system?.attributes?.movement; // Movement change

    if (PanelManager.currentActor?.id === actor.id && needsFullUpdate) {
        await PanelManager.initialize(actor);
        
        // Force a re-render of all panels
        if (PanelManager.instance) {
            await PanelManager.instance.renderPanels(PanelManager.element);
        }
    }
    // For health, effects, and spell slot changes, update appropriately
    else if (PanelManager.currentActor?.id === actor.id) {
        if (PanelManager.instance) {
            // Handle health and effects changes
            if (changes.system?.attributes?.hp || changes.effects) {
                await PanelManager.instance.updateHandle();
            }
            
            // Handle spell slot changes
            if (changes.system?.spells) {
                // Re-render just the spells panel
                if (PanelManager.instance.spellsPanel?.element) {
                    await PanelManager.instance.spellsPanel.render(PanelManager.instance.spellsPanel.element);
                }
            }
        }
    }
});

// Add a hook for when the game is paused/unpaused to ensure panels stay responsive
Hooks.on('pauseGame', async (paused) => {
    if (!paused && PanelManager.instance && PanelManager.element) {
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle active effect creation
Hooks.on('createActiveEffect', async (effect) => {
    if (PanelManager.currentActor?.id === effect.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
});

// Handle active effect deletion
Hooks.on('deleteActiveEffect', async (effect) => {
    if (PanelManager.currentActor?.id === effect.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateHandle();
    }
});

// Handle item creation
Hooks.on('createItem', async (item) => {
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle item updates
Hooks.on('updateItem', async (item) => {
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Handle item deletion
Hooks.on('deleteItem', async (item) => {
    if (PanelManager.currentActor?.id === item.parent?.id && PanelManager.instance) {
        await PanelManager.instance.updateTray();
        await PanelManager.instance.renderPanels(PanelManager.element);
    }
});

// Set up periodic cleanup of newly added items
setInterval(() => {
    if (PanelManager.instance) {
        PanelManager.cleanupNewlyAddedItems();
        // Update the tray if there are any changes
        if (PanelManager.instance.element) {
            PanelManager.instance.updateTray();
        }
    }
}, 60000); // Check every minute 