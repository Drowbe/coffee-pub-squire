import { MODULE, TEMPLATES } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getObjectiveTooltipData } from './helpers.js';
import { QuestParser } from './quest-parser.js';
import { QuestPin } from './quest-pin.js';
import { DiceTrayPanel } from './panel-dicetray.js';
import { MacrosPanel } from './panel-macros.js';
import { HealthPanel } from './panel-health.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class HandleManager {
    constructor(panelManager) {
        this.panelManager = panelManager;
        this.actor = panelManager.actor;
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
        if (PanelManager.viewMode === 'quest') {
            pinnedQuest = await this._getPinnedQuestData();
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

        const handleTemplate = await renderTemplate(TEMPLATES.TRAY, trayData);
        
        // Extract just the handle-view content from the rendered template
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = handleTemplate;
        const handleContent = tempDiv.querySelector('.handle-view').innerHTML;
        
        // Update the handle content
        const handleLeft = PanelManager.element.find('.handle-view');
        handleLeft.html(handleContent);

        // Reattach event listeners for handle elements
        this._attachHandleEventListeners();
    }

    /**
     * Attach all event listeners for handle elements
     * @private
     */
    _attachHandleEventListeners() {
        const handle = PanelManager.element.find('.tray-handle');
        
        // Handle dice tray icon clicks
        handle.find('#dice-tray-button').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (PanelManager.instance?.dicetrayPanel && !PanelManager.instance.dicetrayPanel.isPoppedOut) {
                await PanelManager.instance.dicetrayPanel._onPopOut();
            }
        });

        // Handle pinned quest clicks
        handle.find('.handle-pinned-quest-name').on('click', async (event) => {
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
        handle.find('.handle-healthbar').on('click', async (event) => {
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
        handle.find('.handle-condition-icon').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const conditionName = $(event.currentTarget).data('tooltip');
            const isActive = $(event.currentTarget).hasClass('active');
            
            if (!conditionName) {
                console.warn('HandleManager: No condition name found for condition icon');
                return;
            }
            
            if (isActive) {
                // Remove condition
                const effect = this.actor.effects.find(e => e.name === conditionName);
                if (effect) {
                    await effect.delete();
                }
            } else {
                // Add condition
                const conditionData = CONFIG.DND5E.conditionTypes[conditionName.toLowerCase()];
                if (conditionData) {
                    const effectData = {
                        label: conditionName,
                        icon: conditionData.icon,
                        duration: { rounds: 1 },
                        changes: [],
                        flags: { dae: { specialDuration: ['1Round'] } }
                    };
                    await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
                }
            }
        });

        // Handle macros icon clicks
        handle.find('#macros-button').on('click', async (event) => {
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
        handle.find('.handle-partymember-healthbar .handle-healthbar-fill.clickable').on('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(this).closest('.handle-partymember-icon').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor && PanelManager.instance?.healthPanel) {
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
                if (token) {
                    token.control({releaseOthers: true});
                }
                PanelManager.instance.healthPanel.updateActor(actor);
                await PanelManager.instance.healthPanel._onPopOut();
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
     * Attach objective click handlers to the handle
     * @param {jQuery} handle - The handle element
     * @private
     */
    _attachObjectiveClickHandlers(handle) {
        // Handle objective clicks in quest progress (handle)
        
        // Remove existing handlers first to prevent duplicates
        handle.find('.handle-quest-progress-fill').off('click mouseenter mouseleave');
        
        handle.find('.handle-quest-progress-fill').on('click', async (event) => {
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
        handle.find('.handle-quest-progress-fill').on('mouseenter', async (event) => {
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

        handle.find('.handle-quest-progress-fill').on('mouseleave', (event) => {
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
            
            if (!pinnedQuestUuid) return null;
            
            const doc = await fromUuid(pinnedQuestUuid);
            if (!doc) return null;
            
            // Get the quest data from the journal entry
            const enrichedHtml = await TextEditor.enrichHTML(doc.text.content, { async: true });
            const entry = await QuestParser.parseSinglePage(doc, enrichedHtml);
            
            if (!entry) return null;
            
            return {
                name: entry.title,
                uuid: pinnedQuestUuid,
                tasks: entry.tasks || []
            };
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
