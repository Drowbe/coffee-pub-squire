import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getObjectiveTooltipData } from './helpers.js';
import { QuestParser } from './quest-parser.js';
import { QuestPin } from './quest-pin.js';
import { DiceTrayPanel } from './panel-dicetray.js';
import { MacrosPanel } from './panel-macros.js';
import { HealthPanel } from './panel-health.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';
import { getBlacksmith } from './helpers.js';

// FoundryVTT function imports
const { renderTemplate, fromUuid, TextEditor } = globalThis;

export class HandleManager {
    constructor(panelManager) {
        this.panelManager = panelManager;
        this.actor = panelManager.actor;
        
        // Resize listener will be set up after first successful updateHandle call
        this._resizeHandler = null;
    }

    /**
     * Set up window resize listener for handle fade effect
     * @private
     */
    _setupResizeListener() {
        // Remove any existing listener to prevent duplicates
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        
        // Bind the handler to this instance
        this._resizeHandler = this._updateHandleFade.bind(this);
        
        // Add the resize listener
        window.addEventListener('resize', this._resizeHandler);
    }

    /**
     * Update the handle content with current actor data
     * This is the single source of truth for all handle data preparation
     */
    async updateHandle() {
        if (!PanelManager.element) {
            console.warn('HandleManager.updateHandle: No tray element available');
            return;
        }

        // Helper function to calculate health status and percentage
        const calculateHealthStatus = (actor) => {
            if (!actor || !actor.system?.attributes?.hp) return { status: 'dead', percentage: 0 };
            
            const currentHP = actor.system.attributes.hp.value;
            const maxHP = actor.system.attributes.hp.max;
            const percentage = maxHP > 0 ? (currentHP / maxHP) * 100 : 0;
            
            let status = 'dead';
            if (percentage > 90) status = 'healthy';
            else if (percentage > 40) status = 'injured';
            else if (percentage > 25) status = 'bloodied';
            else if (percentage > 0) status = 'critical';
            
            return { status, percentage };
        };

        // Build favorite macros array
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);

        // Fetch pinned quest data for quest handle
        let pinnedQuest = null;
        console.log('HandleManager: Current view mode:', PanelManager.viewMode);
        
        // Always try to fetch quest data if we're in quest view, or if we have a pinned quest
        console.log('HandleManager: Current view mode when deciding quest fetch:', PanelManager.viewMode);
        
        if (PanelManager.viewMode === 'quest') {
            console.log('HandleManager: Fetching pinned quest data for quest view');
            pinnedQuest = await this._getPinnedQuestData();
        } else {
            // Check if there's a pinned quest even if not in quest view
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const hasPinnedQuest = Object.values(pinnedQuests).some(uuid => uuid !== null);
            console.log('HandleManager: Pinned quests found:', pinnedQuests, 'Has pinned quest:', hasPinnedQuest);
            
            if (hasPinnedQuest) {
                console.log('HandleManager: Found pinned quest, fetching data even though not in quest view');
                pinnedQuest = await this._getPinnedQuestData();
            } else {
                console.log('HandleManager: No pinned quest found, skipping quest data fetch');
            }
        }

        // Always gather party context
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        const controlledTokenIds = canvas.tokens.controlled
            .filter(token => token.actor)
            .map(token => token.actor.id);

        // Use the first controlled actor, or the first party member if none selected
        let currentActor = null;
        if (controlledTokenIds.length > 0) {
            currentActor = game.actors.get(controlledTokenIds[0]);
        } else if (tokens.length > 0) {
            currentActor = tokens[0].actor;
        }

        // Add health data to currentActor if it exists
        if (currentActor) {
            const healthData = calculateHealthStatus(currentActor);
            currentActor.healthStatus = healthData.status;
            currentActor.healthPercentage = healthData.percentage;
        }

        const otherPartyMembers = tokens
            .filter(token => token.actor && token.actor.id !== currentActor?.id)
            .map(token => ({
                id: token.actor.id,
                name: token.actor.name,
                img: token.actor.img,
                system: token.actor.system,
                isOwner: token.actor.isOwner,
                healthStatus: calculateHealthStatus(token.actor).status,
                healthPercentage: calculateHealthStatus(token.actor).percentage
            }));

        // Fetch handle favorites
        const handleFavoriteIds = FavoritesPanel.getHandleFavorites(this.actor);
        const handleFavorites = handleFavoriteIds.map(id => {
            const item = this.actor.items.get(id);
            return item ? {
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                equipped: item.system.equipped,
                hasEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showEquipToggle: ['weapon', 'equipment', 'tool', 'consumable'].includes(item.type),
                showStarIcon: item.type === 'feat',
                isHandleFavorite: true
            } : null;
        }).filter(Boolean);

        // Build handle data object
        const handleData = {
            actor: this.actor ? (() => {
                const healthData = calculateHealthStatus(this.actor);
                // Add health properties to the original actor object without spreading
                this.actor.healthStatus = healthData.status;
                this.actor.healthPercentage = healthData.percentage;
                return this.actor;
            })() : null,
            isGM: game.user.isGM,
            effects: this.actor?.effects?.map(e => ({
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.icon || 'icons/svg/aura.svg'
            })) || [],
            pinnedQuest,
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleStatsPrimary: game.settings.get(MODULE.ID, 'showHandleStatsPrimary'),
            showHandleStatsSecondary: game.settings.get(MODULE.ID, 'showHandleStatsSecondary'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            showHandleDiceTray: game.settings.get(MODULE.ID, 'showHandleDiceTray'),
            showHandleMacros: game.settings.get(MODULE.ID, 'showHandleMacros'),
            isDiceTrayPopped: DiceTrayPanel.isWindowOpen,
            isMacrosPopped: MacrosPanel.isWindowOpen,
            isHealthPopped: HealthPanel.isWindowOpen,
            defaultPartyName: game.settings.get(MODULE.ID, 'defaultPartyName'),
            favoriteMacros,
            handleFavorites
        };

        // If party view, add party context for handle-party
        if (PanelManager.viewMode === 'party') {
            handleData.actor = currentActor ? (() => {
                const healthData = calculateHealthStatus(currentActor);
                // Add health properties to the original actor object without spreading
                currentActor.healthStatus = healthData.status;
                currentActor.healthPercentage = healthData.percentage;
                return currentActor;
            })() : null;
            handleData.otherPartyMembers = otherPartyMembers;
        }

        // Use the tray template which includes the correct partial
        const trayData = {
            viewMode: PanelManager.viewMode,
            ...handleData
        };

        console.log('HandleManager: Tray data being sent to template:', trayData);
        console.log('HandleManager: Pinned quest data:', trayData.pinnedQuest);

        const handleTemplate = await renderTemplate(TEMPLATES.TRAY, trayData);
        
        // Extract just the tray-handle-content-wrapper content from the rendered template
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = handleTemplate;
        const handleContent = tempDiv.querySelector('.tray-handle-content-wrapper').innerHTML;
        
        // Update the handle content
        const handleLeft = PanelManager.element.find('.tray-handle-content-wrapper');
        handleLeft.html(handleContent);

        // Set up resize listener if not already set up
        if (!this._resizeHandler) {
            this._setupResizeListener();
        }

        // Check for handle overflow and toggle fade effect
        this._updateHandleFade();

        // Reattach event listeners for handle elements
        this._attachHandleEventListeners();
    }

    /**
     * Attach all event listeners for handle elements
     * @private
     */
    _attachHandleEventListeners() {
        // Check if PanelManager.element exists before proceeding
        if (!PanelManager.element) return;
        
        const handle = PanelManager.element.find('.tray-handle');
        
        // Handle click on handle (collapse chevron)
        handle.off('click').on('click', (event) => {
            // Only allow tray toggle on specific elements
            const $target = $(event.target);
            const isToggleButton = $target.closest('.tray-handle-button-toggle').length > 0;
            const isCharacterPanel = $target.closest('[data-clickable="true"]').length > 0;
            
            // If not clicking on toggle button or character panel, don't toggle
            if (!isToggleButton && !isCharacterPanel) {
                return;
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            // If pinned, don't allow closing
            if (PanelManager.isPinned) {
                ui.notifications.warn("You have the tray pinned open. Unpin the tray to close it.");
                return false;
            }
            
            // Play tray open sound when expanding
            const tray = handle.closest('.squire-tray');
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

        // Pin button handling
        handle.find('.tray-handle-button-pin').off('click').on('click', async (event) => {
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
                // When pinning, ensure tray is expanded
                const tray = handle.closest('.squire-tray');
                tray.addClass('pinned expanded');
                // Update UI margin when pinned - only need trayWidth + offset since handle is included in width
                const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            } else {
                // When unpinning, maintain expanded state but remove pinned class
                const tray = handle.closest('.squire-tray');
                tray.removeClass('pinned');
                // Reset UI margin when unpinned - need both handle width and offset
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            }
            
            return false;
        });

        // View mode toggle button
        handle.find('.tray-handle-button-viewcycle').off('click').on('click', async (event) => {
            event.preventDefault();
            const currentMode = PanelManager.viewMode;
            
            // Get enabled tabs from settings
            const enabledTabs = ['player']; // Player is always enabled
            if (game.settings.get(MODULE.ID, 'showTabParty')) enabledTabs.push('party');
            if (game.settings.get(MODULE.ID, 'showTabNotes')) enabledTabs.push('notes');
            if (game.settings.get(MODULE.ID, 'showTabCodex')) enabledTabs.push('codex');
            if (game.settings.get(MODULE.ID, 'showTabQuests')) enabledTabs.push('quest');
            
            // Find current position in enabled tabs
            const currentIndex = enabledTabs.indexOf(currentMode);
            if (currentIndex === -1) {
                // Current mode not in enabled tabs, default to first enabled tab
                await PanelManager.instance.setViewMode(enabledTabs[0]);
                return;
            }
            
            // Cycle to next enabled tab
            const nextIndex = (currentIndex + 1) % enabledTabs.length;
            const newMode = enabledTabs[nextIndex];
            
            await PanelManager.instance.setViewMode(newMode);
        });

        // Handle dice tray icon clicks
        handle.find('#dice-tray-button').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (PanelManager.instance?.dicetrayPanel && !PanelManager.instance.dicetrayPanel.isPoppedOut) {
                await PanelManager.instance.dicetrayPanel._onPopOut();
            }
        });

        // Handle pinned quest clicks
        handle.find('.handle-pinned-quest-name').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (pinnedQuestUuid) {
                try {
                    const doc = await fromUuid(pinnedQuestUuid);
                    if (doc) {
                        doc.sheet.render(true);
                    }
                } catch (error) {
                    console.error('Error opening pinned quest:', error);
                    ui.notifications.warn('Could not open pinned quest.');
                }
            }
        });

        // Handle health bar clicks
        handle.find('.handle-healthbar').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (PanelManager.instance?.healthPanel && !PanelManager.instance.healthPanel.isPoppedOut) {
                await PanelManager.instance.healthPanel._onPopOut();
            }
        });

        // Handle health tray icon clicks (GM only)
        handle.find('#health-tray-button').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (game.user.isGM && PanelManager.instance?.healthPanel && !PanelManager.instance.healthPanel.isPoppedOut) {
                await PanelManager.instance.healthPanel._onPopOut();
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

        // Handle condition icon clicks
        handle.find('.handle-condition-icon').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const conditionName = $(event.currentTarget).data('tooltip');
            
            if (!conditionName) {
                console.warn('HandleManager: No condition name found for condition icon');
                return;
            }
            
            // Show condition description dialog
            try {
                // Try to get the condition data from CONFIG.DND5E.conditionTypes
                let description = "No description available.";
                const conditionData = Object.values(CONFIG.DND5E.conditionTypes).find(
                    condition => condition.label === conditionName
                );

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
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error getting condition description',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
                ui.notifications.warn("Could not load condition description.");
            }
        }).off('contextmenu').on('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can remove effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can remove effects.");
                return;
            }
            
            const conditionName = $(event.currentTarget).data('tooltip');
            if (!conditionName) {
                console.warn('HandleManager: No condition name found for condition icon');
                return;
            }
            
            // Remove condition
            const effect = this.actor.effects.find(e => e.name === conditionName);
            if (effect) {
                await effect.delete();
            }
        });

        // Handle conditions button clicks - PRIMARY IMPLEMENTATION
        // (This opens the Add Condition dialog with grid of available conditions)
        handle.find('#conditions-button').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only GMs can add effects
            if (!game.user.isGM) {
                ui.notifications.warn("Only GMs can add effects.");
                return;
            }

            // Close any existing Add Effect dialog
            const existing = Object.values(ui.windows).find(w => w.title && w.title.includes('Add Effect'));
            if (existing) existing.close();

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
                        <i class="fas fa-sparkles"></i>
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
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                'Error managing condition',
                                { error },
                                false,
                                false,
                                true,
                                MODULE.TITLE
                            );
                            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${condition.label}`);
                        }
                    });
                }
            }, {
                classes: ["dnd5e", "dialog", "window-app", "squire-description-dialog"],
                width: 400,
                height: "auto"
            });
            dialog.render(true);
        });

        // Handle macros icon clicks
        handle.find('#macros-button').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (PanelManager.instance?.macrosPanel && !PanelManager.instance.macrosPanel.isPoppedOut) {
                await PanelManager.instance.macrosPanel._onPopOut();
            }
        });

        // Add click handler for favorite macros in handle
        handle.find('.handle-macro-icon').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const macroId = $(this).data('macro-id');
            const macro = game.macros.get(macroId);
            if (macro) macro.execute();
        });

        // Add click handler for party member portraits in the handle
        handle.find('.handle-partymember-icon.clickable').on('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(this).closest('.handle-partymember-icon').data('actor-id');
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) {
                token.control({releaseOthers: true});
            }
        });

        // Add click handler for party member health bars in the handle
        const partyHealthBars = handle.find('.handle-healthbar.party.clickable');
        console.log('HandleManager: Found party health bars:', partyHealthBars.length);
        
        partyHealthBars.on('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log('HandleManager: Clicked element:', this);
            console.log('HandleManager: Clicked element classes:', this.className);
            console.log('HandleManager: Clicked element data attributes:', $(this).data());
            
            // Get the actor ID directly from the clicked health bar element
            const actorId = $(this).data('actor-id');
            console.log('HandleManager: Party member health bar clicked, actor ID:', actorId);
            
            if (!actorId) {
                console.warn('HandleManager: No actor ID found on party member health bar');
                return;
            }
            
            const actor = game.actors.get(actorId);
            if (!actor) {
                console.warn('HandleManager: Could not find actor with ID:', actorId);
                return;
            }
            
            console.log('HandleManager: Found party member actor:', actor.name);
            
            if (PanelManager.instance?.healthPanel) {
                // Control the token if it exists on canvas
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
                if (token) {
                    token.control({releaseOthers: true});
                }
                
                // Update PanelManager's current actor reference so the health panel shows the correct data
                PanelManager.currentActor = actor;
                console.log('HandleManager: Updated PanelManager.currentActor to:', actor.name);
                
                // Update the health panel with the party member's actor
                PanelManager.instance.healthPanel.updateActor(actor);
                console.log('HandleManager: Updated health panel actor to:', actor.name);
                
                // If health panel is already popped out, update the window directly
                if (PanelManager.instance.healthPanel.isPoppedOut && PanelManager.instance.healthPanel.window) {
                    console.log('HandleManager: Health panel already popped out, updating window directly');
                    PanelManager.instance.healthPanel.window.updateActor(actor);
                } else {
                    // Pop out the health panel
                    await PanelManager.instance.healthPanel._onPopOut();
                }
            } else {
                console.warn('HandleManager: Health panel not available');
            }
        });

        // Handle character portrait click in the handle
        handle.find('.handle-character-icon').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Use the actor from the handle context
            const actor = this.actor || PanelManager.currentActor;
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Attach objective click handlers
        this._attachObjectiveClickHandlers(handle);
    }

    /**
     * Clean up event listeners and resources
     */
    destroy() {
        // Remove resize event listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
    }

    /**
     * Check for handle overflow and toggle fade effect
     * @private
     */
    _updateHandleFade() {
        // Check if PanelManager.element exists before proceeding
        if (!PanelManager.element) return;
        
        const handle = PanelManager.element.find('.tray-handle');
        if (!handle || !handle.length) return;
        
        const container = handle.find('.tray-handle-content-container');
        const fade = handle.find('.tray-handle-fade-bottom');
        if (!container || !container.length || !fade || !fade.length) return;
        
        // Check if content is overflowing vertically
        const isOverflowing = container[0].scrollHeight > container[0].clientHeight;
        fade.toggle(isOverflowing);
    }

    /**
     * Attach objective click handlers to the handle
     * @param {jQuery} handle - The handle element
     * @private
     */
    _attachObjectiveClickHandlers(handle) {
        // Handle objective clicks in quest progress (handle)
        
        // Remove existing handlers first to prevent duplicates
        handle.find('.handle-pinnedquest-icon-fill').off('click mouseenter mouseleave');
        
        handle.find('.handle-pinnedquest-icon-fill').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const objectiveElement = $(event.currentTarget);
            const taskIndex = parseInt(objectiveElement.data('task-index'));
            
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (!pinnedQuestUuid) {
                ui.notifications.warn('No quest is currently pinned.');
                return;
            }
            
            // Check if the objective is hidden for non-GM users
            if (!game.user.isGM) {
                try {
                    // Find the journal page by UUID
                    let page = null;
                    for (const journal of game.journal.contents) {
                        page = journal.pages.find(p => p.uuid === pinnedQuestUuid);
                        if (page) break;
                    }
                    
                    if (page) {
                        // Enrich the page HTML if needed
                        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
                        // Parse the quest entry using the source of truth
                        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
                        
                        if (entry && entry.tasks[taskIndex]) {
                            const task = entry.tasks[taskIndex];
                            if (task.state === 'hidden') {
                                ui.notifications.warn(`No pin found for objective ${taskIndex + 1}.`);
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error checking objective visibility:', error);
                }
            }
            
            // Find the corresponding quest pin on the canvas
            if (canvas.squirePins && canvas.squirePins.children) {
                const questPins = canvas.squirePins.children.filter(child =>
                    child instanceof QuestPin && child.questUuid === pinnedQuestUuid && child.objectiveIndex === taskIndex
                );
                if (questPins.length > 0) {
                    const pin = questPins[0];
                    canvas.animatePan({ x: pin.x, y: pin.y });
                    pin.alpha = 0.6;
                    setTimeout(() => { pin.alpha = 1.0; }, 200);
                } else {
                    ui.notifications.warn(`No pin found for objective ${taskIndex + 1}.`);
                }
            } else {
                ui.notifications.warn('Quest pins are not available on this scene.');
            }
        });

        // Add enhanced tooltip functionality
        handle.find('.handle-pinnedquest-icon-fill').on('mouseenter', async (event) => {
            const objectiveElement = $(event.currentTarget);
            const taskIndex = parseInt(objectiveElement.data('task-index'));
            // Get the pinned quest UUID from the current data
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            if (!pinnedQuestUuid) return;
            try {
                const tooltipData = await getObjectiveTooltipData(pinnedQuestUuid, taskIndex);
                if (!tooltipData) return;
                // Add handle-specific controls text
                tooltipData.controls = 'Left-click: Pan to objective pin on map';
                showQuestTooltip('squire-handle-objective-tooltip', tooltipData, event, 500); // 500ms delay before showing tooltip
            } catch (error) {
                console.error('Error creating tooltip:', error);
            }
        });

        handle.find('.handle-pinnedquest-icon-fill').on('mouseleave', (event) => {
            hideQuestTooltip('squire-handle-objective-tooltip');
        });
    }

    /**
     * Get pinned quest data for quest handle
     * @private
     */
    async _getPinnedQuestData() {
        try {
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (!pinnedQuestUuid) {
                console.warn('HandleManager: No pinned quest UUID found');
                return null;
            }
            
            console.log('HandleManager: Found pinned quest UUID:', pinnedQuestUuid);
            
            const doc = await fromUuid(pinnedQuestUuid);
            if (!doc) {
                console.warn('HandleManager: Could not resolve document from UUID:', pinnedQuestUuid);
                return null;
            }
            
            console.log('HandleManager: Resolved document:', doc);
            console.log('HandleManager: Document text content:', doc.text?.content);
            console.log('HandleManager: Document name:', doc.name);
            
            // Get the quest data from the journal entry
            const enrichedHtml = await TextEditor.enrichHTML(doc.text.content, { async: true });
            console.log('HandleManager: Enriched HTML content:', enrichedHtml);
            
            const entry = await QuestParser.parseSinglePage(doc, enrichedHtml);
            
            console.log('HandleManager: Parsed quest entry:', entry);
            
            if (!entry) {
                console.warn('HandleManager: QuestParser returned null/undefined entry');
                return null;
            }
            
            if (!entry.title) {
                console.warn('HandleManager: Entry missing title:', entry);
            }
            
            if (!entry.tasks || !Array.isArray(entry.tasks)) {
                console.warn('HandleManager: Entry missing or invalid tasks:', entry.tasks);
            } else {
                console.log('HandleManager: Entry tasks:', entry.tasks);
                entry.tasks.forEach((task, index) => {
                    console.log(`HandleManager: Task ${index}:`, task);
                });
            }
            
            // If QuestParser failed to parse tasks, create a basic fallback
            let fallbackTasks = [];
            if (!entry.tasks || entry.tasks.length === 0) {
                console.warn('HandleManager: QuestParser returned no tasks, creating fallback');
                // Create a basic fallback with just the quest name
                fallbackTasks = [{
                    text: 'Quest details available in journal',
                    state: 'active',
                    completed: false
                }];
            }
            
            const result = {
                name: entry.title || doc.name || 'Unknown Quest',
                title: entry.title || doc.name || 'Unknown Quest', // Keep both for compatibility
                uuid: pinnedQuestUuid,
                tasks: entry.tasks && entry.tasks.length > 0 ? entry.tasks : fallbackTasks
            };
            
            console.log('HandleManager: Returning quest data:', result);
            return result;
        } catch (error) {
            console.error('Error getting pinned quest data:', error);
            return null;
        }
    }

    /**
     * Update the actor reference when it changes
     * @param {Actor} newActor - The new actor to use
     */
    updateActor(newActor) {
        this.actor = newActor;
    }
}
