/**
 * Hook Manager for Coffee Pub Squire Module
 * 
 * TODO: Future Architectural Improvement
 * =====================================
 * Consider refactoring to centralized hook management where other modules
 * register their hook needs with our API instead of directly using Hooks.on/off.
 * This would prevent cross-module interference and provide better control over
 * hook lifecycle, timing, and cleanup. Other modules would call:
 * game.modules.get('coffee-pub-squire').api.registerHook('hookName', callback)
 * instead of directly calling Hooks.on('hookName', callback).
 * 
 * Benefits:
 * - No more cross-module hook conflicts
 * - Better control over hook registration timing
 * - Centralized debugging and optimization
 * - Improved module compatibility
 */
import { MODULE, SQUIRE } from './const.js';
import { getBlacksmith } from './helpers.js';
import { FavoritesPanel } from './panel-favorites.js';
import { QuestPin, loadPersistedPins } from './quest-pin.js';

// Helper function to get PanelManager dynamically to avoid circular dependencies
function getPanelManager() {
    return game.modules.get('coffee-pub-squire')?.api?.PanelManager;
}

/**
 * Centralized Hook Manager for Squire
 * Consolidates all hooks and routes them to appropriate panels
 */
export class HookManager {
    static instance = null;
    
    // Store references to panels
    static codexPanel = null;
    static questPanel = null;
    static notesPanel = null;
    static questPins = null;
    static characterPanel = null;
    static partyPanel = null;
    static macrosPanel = null;
    static partyStatsPanel = null;
    
    // Enhanced hook management system
    static hookRegistry = new Map(); // hookName -> { handler, panels, hookId, isActive }
    static panelHooks = new Map();   // panelType -> Set of hookNames
    static hookIds = new Map();      // hookName -> hookId (for backward compatibility)
    
    /**
     * Initialize the hook manager
     */
    static initialize() {
        if (HookManager.instance) return HookManager.instance;
        
        HookManager.instance = new HookManager();
        HookManager.instance._setupHooks();
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'HookManager initialized with enhanced registry system',
            'success',
            false,
            false
        );
        
        return HookManager.instance;
    }
    
    /**
     * Register a hook with the hook manager
     * @param {string} hookName - Name of the hook (e.g., 'updateActor', 'updateToken')
     * @param {Function} handler - The handler function for the hook
     * @param {Array<string>} panels - Array of panel types that depend on this hook
     * @param {Object} options - Additional options for hook registration
     * @returns {string} The hook ID for cleanup
     */
    static registerHook(hookName, handler, panels = [], options = {}) {
        // Check if hook is already registered
        if (HookManager.hookRegistry.has(hookName)) {
            const existing = HookManager.hookRegistry.get(hookName);
            
            // Add new panels to existing hook
            panels.forEach(panelType => {
                if (!existing.panels.includes(panelType)) {
                    existing.panels.push(panelType);
                }
            });
            
            // Update panel hook mapping
            panels.forEach(panelType => {
                if (!HookManager.panelHooks.has(panelType)) {
                    HookManager.panelHooks.set(panelType, new Set());
                }
                HookManager.panelHooks.get(panelType).add(hookName);
            });
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Hook ${hookName} updated with additional panels`,
                { newPanels: panels, totalPanels: existing.panels },
                true,
                false
            );
            
            return existing.hookId;
        }
        
        // Register new hook
        const hookId = Hooks.on(hookName, handler);
        
        const hookInfo = {
            handler,
            panels: [...panels],
            hookId,
            isActive: true,
            options,
            registeredAt: Date.now()
        };
        
        HookManager.hookRegistry.set(hookName, hookInfo);
        HookManager.hookIds.set(hookName, hookId);
        
        // Update panel hook mapping
        panels.forEach(panelType => {
            if (!HookManager.panelHooks.has(panelType)) {
                HookManager.panelHooks.set(panelType, new Set());
            }
            HookManager.panelHooks.get(panelType).add(hookName);
        });
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Hook ${hookName} registered successfully`,
            { hookId, panels, totalHooks: HookManager.hookRegistry.size },
            true,
            false
        );
        
        return hookId;
    }
    
    /**
     * Request access to a hook for a specific panel
     * @param {string} panelType - Type of panel requesting the hook
     * @param {string} hookName - Name of the hook being requested
     * @returns {boolean} True if hook is available, false otherwise
     */
    static requestHook(panelType, hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Panel ${panelType} requested unavailable hook: ${hookName}`,
                'warning',
                true,
                false
            );
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        const hasAccess = hookInfo.panels.includes(panelType);
        
        if (!hasAccess) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Panel ${panelType} requested hook ${hookName} but doesn't have access`,
                { availablePanels: hookInfo.panels },
                true,
                false
            );
        }
        
        return hasAccess;
    }
    
    /**
     * Get all hooks for a specific panel
     * @param {string} panelType - Type of panel
     * @returns {Array<string>} Array of hook names the panel has access to
     */
    static getPanelHooks(panelType) {
        return Array.from(HookManager.panelHooks.get(panelType) || []);
    }
    
    /**
     * Get information about a specific hook
     * @param {string} hookName - Name of the hook
     * @returns {Object|null} Hook information or null if not found
     */
    static getHookInfo(hookName) {
        return HookManager.hookRegistry.get(hookName) || null;
    }
    
    /**
     * Get all registered hooks
     * @returns {Array<string>} Array of all hook names
     */
    static getAllHooks() {
        return Array.from(HookManager.hookRegistry.keys());
    }
    
    /**
     * Get hook statistics
     * @returns {Object} Statistics about registered hooks
     */
    static getHookStats() {
        const totalHooks = HookManager.hookRegistry.size;
        const activeHooks = Array.from(HookManager.hookRegistry.values()).filter(h => h.isActive).length;
        const totalPanels = HookManager.panelHooks.size;
        
        return {
            totalHooks,
            activeHooks,
            totalPanels,
            hooksByPanel: Object.fromEntries(
                Array.from(HookManager.panelHooks.entries()).map(([panel, hooks]) => [
                    panel, 
                    Array.from(hooks)
                ])
            )
        };
    }
    
    /**
     * Deactivate a hook (temporarily disable without removing)
     * @param {string} hookName - Name of the hook to deactivate
     * @returns {boolean} True if successful, false otherwise
     */
    static deactivateHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        if (hookInfo.isActive) {
            Hooks.off(hookName, hookInfo.handler);
            hookInfo.isActive = false;
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Hook ${hookName} deactivated`,
                { hookId: hookInfo.hookId },
                true,
                false
            );
        }
        
        return true;
    }
    
    /**
     * Reactivate a previously deactivated hook
     * @param {string} hookName - Name of the hook to reactivate
     * @returns {boolean} True if successful, false otherwise
     */
    static reactivateHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        if (!hookInfo.isActive) {
            const newHookId = Hooks.on(hookName, hookInfo.handler);
            hookInfo.hookId = newHookId;
            hookInfo.isActive = true;
            HookManager.hookIds.set(hookName, newHookId);
            
            getBlacksmith()?.utils.postConsoleAndNotification(
                MODULE.NAME,
                `Hook ${hookName} reactivated`,
                { newHookId },
                true,
                false
            );
        }
        
        return true;
    }
    
    /**
     * Remove a hook completely
     * @param {string} hookName - Name of the hook to remove
     * @returns {boolean} True if successful, false otherwise
     */
    static removeHook(hookName) {
        if (!HookManager.hookRegistry.has(hookName)) {
            return false;
        }
        
        const hookInfo = HookManager.hookRegistry.get(hookName);
        
        // Remove from FoundryVTT
        if (hookInfo.isActive) {
            Hooks.off(hookName, hookInfo.handler);
        }
        
        // Remove from panel mappings
        hookInfo.panels.forEach(panelType => {
            if (HookManager.panelHooks.has(panelType)) {
                HookManager.panelHooks.get(panelType).delete(hookName);
                if (HookManager.panelHooks.get(panelType).size === 0) {
                    HookManager.panelHooks.delete(panelType);
                }
            }
        });
        
        // Remove from registries
        HookManager.hookRegistry.delete(hookName);
        HookManager.hookIds.delete(hookName);
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Hook ${hookName} completely removed`,
            { removedPanels: hookInfo.panels },
            true,
            false
        );
        
        return true;
    }
    
    /**
     * Get debug information about hook state
     * @returns {Object} Debug information for troubleshooting
     */
    static getDebugInfo() {
        const stats = HookManager.getHookStats();
        const debugInfo = {
            ...stats,
            registryDetails: {},
            panelDetails: {}
        };
        
        // Add detailed registry information
        HookManager.hookRegistry.forEach((hookInfo, hookName) => {
            debugInfo.registryDetails[hookName] = {
                isActive: hookInfo.isActive,
                panels: hookInfo.panels,
                hookId: hookInfo.hookId,
                registeredAt: new Date(hookInfo.registeredAt).toISOString(),
                options: hookInfo.options
            };
        });
        
        // Add detailed panel information
        HookManager.panelHooks.forEach((hooks, panelType) => {
            debugInfo.panelDetails[panelType] = {
                totalHooks: hooks.size,
                hooks: Array.from(hooks)
            };
        });
        
        return debugInfo;
    }
    
    /**
     * Register a panel with the hook manager
     * @param {string} panelType - Type of panel ('codex', 'quest', 'notes', 'questPins')
     * @param {Object} panel - Panel instance
     */
    static registerPanel(panelType, panel) {
        HookManager[`${panelType}Panel`] = panel;
        
        // If this is the party panel and we have a stored hook ID, activate the hook
        if (panelType === 'party' && HookManager.partyRenderChatMessageHookId) {
            // The hook is already registered, just ensure it's active
            const hookInfo = HookManager.hookRegistry.get('renderChatMessage');
            if (hookInfo && !hookInfo.isActive) {
                Hooks.on('renderChatMessage', hookInfo.handler);
                hookInfo.isActive = true;
            }
        }
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Panel registered with HookManager`,
            { panelType, hasPanel: !!panel },
            true,
            false
        );
    }
    
    /**
     * Check if the HookManager is fully initialized and ready
     * @returns {boolean} True if ready, false otherwise
     */
    static isReady() {
        return HookManager.instance !== null && HookManager.hookRegistry.size > 0;
    }
    
    /**
     * Quest pin helper functions and variables - Static for global access
     */
    static questPinTimeouts = new Set();
    static questPinVisibilityDebounce = null;

    static debouncedUpdateAllPinVisibility() {
        if (HookManager.questPinVisibilityDebounce) clearTimeout(HookManager.questPinVisibilityDebounce);
        HookManager.questPinVisibilityDebounce = setTimeout(() => {
            // Only run if the global vision polygon exists
            if (canvas.visibility?.los) {
                HookManager.updateAllPinVisibility();
            }
            HookManager.questPinVisibilityDebounce = null;
        }, 50);
    }

    static async updateAllPinVisibility() {
        if (!canvas.squirePins) return;
        
        const pins = canvas.squirePins.children.filter(child => child.constructor.name === 'QuestPin');
        
        for (const pin of pins) {
            try {
                // Update quest state from journal if available
                if (pin._getQuestData) {
                    const questData = pin._getQuestData();
                    if (questData) {
                        const isVisible = await questData.getFlag(MODULE.ID, 'visible');
                        const newQuestState = (isVisible === false) ? 'hidden' : 'visible';
                        
                        // Only update if the state actually changed
                        if (pin.questState !== newQuestState) {
                            pin.questState = newQuestState;
                            // Update pin appearance to show/hide second ring for GMs
                            if (pin._updatePinAppearance) {
                                pin._updatePinAppearance();
                            }
                        }
                    }
                }
                
                if (pin.updateVisibility) {
                    pin.updateVisibility();
                }
            } catch (error) {
                // Error updating pin visibility
            }
        }
    }

    /**
     * Set up all journal-related hooks
     * @private
     */
    _setupHooks() {
        // Multi-select tracking variables
        let _multiSelectTimeout = null;
        let _lastSelectionTime = 0;
        let _selectionCount = 0;
        const MULTI_SELECT_DELAY = 150; // ms to wait after last selection event
        const SINGLE_SELECT_THRESHOLD = 300; // ms threshold to consider as single selection

        // Helper function to update selection display
        async function _updateSelectionDisplay() {
            const panelManager = getPanelManager();
            if (!panelManager?.instance || !panelManager.instance.element) return;
            
            // Calculate selection data
            const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
            const selectionCount = controlledTokens.length;
            const showSelectionBox = selectionCount > 1;
            
            // Update the selection display
            const selectionWrapper = panelManager.instance.element.find('.tray-selection-wrapper');
            const selectionCountSpan = panelManager.instance.element.find('.tray-selection-count');
            
            if (showSelectionBox) {
                // Show selection box if it doesn't exist
                if (selectionWrapper.length === 0) {
                    const selectionHtml = `
                        <div class="tray-selection-wrapper">
                            <span class="tray-selection-count">${selectionCount} tokens selected</span>
                            <div class="tray-selection-actions" data-tooltip="Use Shift+Click to select multiple or modify selection">
                                <button id="button-clear" class="tray-selection-button button-clear" data-tooltip="Clear all selections">Clear All</button>
                                ${game.user.isGM ? '<button id="button-combat" class="tray-selection-button button-combat" data-tooltip="Add selected tokens to combat">Add to Combat</button>' : ''}
                            </div>
                        </div>
                    `;
                    
                    // Insert after the party toolbar
                    const partyToolbar = panelManager.instance.element.find('.tray-tools-toolbar');
                    if (partyToolbar.length > 0) {
                        partyToolbar.after(selectionHtml);
                    }
                    
                    // Re-attach event listeners for the new buttons
                    panelManager.instance.activateListeners(panelManager.instance.element);
                } else {
                    // Update existing selection count
                    selectionCountSpan.text(`${selectionCount} tokens selected`);
                }
            } else {
                // Hide selection box if it exists
                if (selectionWrapper.length > 0) {
                    selectionWrapper.remove();
                }
            }
        }

        // Helper function to update health panel from current selection
        async function _updateHealthPanelFromSelection() {
            // Get a list of all controlled tokens that the user owns
            const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
            
            if (controlledTokens.length === 0) {
                // No tokens selected, hide the health panel
                const panelManager = getPanelManager();
                if (panelManager?.instance && panelManager.instance.healthPanel) {
                    panelManager.instance.healthPanel.hide();
                }
                return;
            }

            // Update the health panel with the selected tokens
            const panelManager = getPanelManager();
            if (panelManager?.instance && panelManager.instance.healthPanel) {
                await panelManager.instance.healthPanel.updateFromTokens(controlledTokens);
            }
        }
        
        // Journal Entry Page Update Hook - Consolidated
        const journalHookId = HookManager.registerHook(
            "updateJournalEntryPage", 
            async (page, changes, options, userId) => {
                await this._handleJournalEntryPageUpdate(page, changes, options, userId);
            },
            ['codex', 'quest', 'notes', 'questPins']
        );
        
        // Character Panel Hooks - Consolidated
        const characterActorHookId = HookManager.registerHook(
            "updateActor",
            (document, change) => {
                // Route to character panel if it exists
                if (HookManager.characterPanel && HookManager.characterPanel._onActorUpdate) {
                    HookManager.characterPanel._onActorUpdate(document, change);
                }
            },
            ['character']
        );
        
        const characterTokenHookId = HookManager.registerHook(
            "updateToken",
            (document, change) => {
                // Route to character panel if it exists
                if (HookManager.characterPanel && HookManager.characterPanel._onActorUpdate) {
                    HookManager.characterPanel._onActorUpdate(document, change);
                }
            },
            ['character']
        );
        
        // Party Panel Hooks - Consolidated
        const partyTokenHookId = HookManager.registerHook(
            "updateToken",
            (document, change) => {
                // Route to party panel if it exists
                if (HookManager.partyPanel && HookManager.partyPanel._onTokenUpdate) {
                    HookManager.partyPanel._onTokenUpdate(document, change);
                }
            },
            ['party']
        );
        
        const partyActorHookId = HookManager.registerHook(
            "updateActor",
            (document, change) => {
                // Route to party panel if it exists
                if (HookManager.partyPanel && HookManager.partyPanel._onActorUpdate) {
                    HookManager.partyPanel._onActorUpdate(document, change);
                }
            },
            ['party']
        );
        
        const partyControlTokenHookId = HookManager.registerHook(
            "controlToken",
            (token, controlled) => {
                // Route to party panel if it exists
                if (HookManager.partyPanel && HookManager.partyPanel._onControlToken) {
                    HookManager.partyPanel._onControlToken(token, controlled);
                }
            },
            ['party']
        );
        
        const partyRenderChatMessageHookId = HookManager.registerHook(
            "renderChatMessage",
            (message, html, data) => {
                // Route to party panel if it exists
                if (HookManager.partyPanel && HookManager.partyPanel._handleTransferButtons) {
                    HookManager.partyPanel._handleTransferButtons(message, html, data);
                }
            },
            ['party']
        );
        
        // Store the hook ID for later activation when party panel is registered
        HookManager.partyRenderChatMessageHookId = partyRenderChatMessageHookId;
        
        // Macros Panel Hooks - Consolidated
        const macrosReadyHookId = HookManager.registerHook(
            "ready",
            () => {
                // Route to macros panel if it exists
                if (HookManager.macrosPanel && HookManager.macrosPanel.updateHotbarVisibility) {
                    HookManager.macrosPanel.updateHotbarVisibility();
                }
            },
            ['macros']
        );
        
        const macrosRenderSettingsConfigHookId = HookManager.registerHook(
            "renderSettingsConfig",
            () => {
                // Route to macros panel if it exists
                if (HookManager.macrosPanel && HookManager.macrosPanel.updateHotbarVisibility) {
                    HookManager.macrosPanel.updateHotbarVisibility();
                }
            },
            ['macros']
        );
        
        // Party Stats Panel Hooks - Consolidated
        const partyStatsUpdateCombatHookId = HookManager.registerHook(
            "updateCombat",
            (combat, change) => {
                // Route to party stats panel if it exists
                if (HookManager.partyStatsPanel && HookManager.partyStatsPanel._boundUpdateHandler) {
                    HookManager.partyStatsPanel._boundUpdateHandler(combat, change);
                }
            },
            ['partyStats']
        );
        
        const partyStatsUpdateActorHookId = HookManager.registerHook(
            "updateActor",
            (actor, change) => {
                // Route to party stats panel if it exists
                if (HookManager.partyStatsPanel && HookManager.partyStatsPanel._boundUpdateHandler) {
                    HookManager.partyStatsPanel._boundUpdateHandler(actor, change);
                }
            },
            ['partyStats']
        );
        
        const partyStatsCreateChatMessageHookId = HookManager.registerHook(
            "createChatMessage",
            (message) => {
                // Route to party stats panel if it exists
                if (HookManager.partyStatsPanel && HookManager.partyStatsPanel._boundUpdateHandler) {
                    HookManager.partyStatsPanel._boundUpdateHandler(message);
                }
            },
            ['partyStats']
        );
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Journal, Character, Party, Macros, and Party Stats hooks consolidated in HookManager',
            { 
                journalHookId, 
                characterActorHookId, 
                characterTokenHookId,
                partyTokenHookId,
                partyActorHookId,
                partyControlTokenHookId,
                partyRenderChatMessageHookId,
                macrosReadyHookId,
                macrosRenderSettingsConfigHookId,
                partyStatsUpdateCombatHookId,
                partyStatsUpdateActorHookId,
                partyStatsCreateChatMessageHookId,
                totalHooks: HookManager.getHookStats().totalHooks
            },
            true,
            false
        );

        // Update the logging message to reflect all consolidated hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered`,
            '',
            true,
            false
        );

        // Global System Hooks - Consolidated
        const globalControlTokenHookId = HookManager.registerHook(
            "controlToken",
            async (token, controlled) => {
                // Only proceed if it's a GM or the token owner
                if (!game.user.isGM && !token.actor?.isOwner) return;
                
                // Update selection display for both selection and release
                await _updateSelectionDisplay();
                
                // Only care about token selection for health panel updates
                if (!controlled) return;

                // Track selection timing and count
                const now = Date.now();
                const timeSinceLastSelection = now - _lastSelectionTime;
                _lastSelectionTime = now;
                _selectionCount++;

                // Clear any existing timeout
                if (_multiSelectTimeout) {
                    clearTimeout(_multiSelectTimeout);
                    _multiSelectTimeout = null;
                }

                // Determine if this is likely multi-selection
                const isMultiSelect = _selectionCount > 1 && timeSinceLastSelection < SINGLE_SELECT_THRESHOLD;

                // For multi-selection, debounce the update
                if (isMultiSelect) {
                    _multiSelectTimeout = setTimeout(async () => {
                        await _updateHealthPanelFromSelection();
                        _selectionCount = 0; // Reset counter
                    }, MULTI_SELECT_DELAY);
                    return;
                }

                // For single selection or first selection, update immediately
                await _updateHealthPanelFromSelection();
                
                // Reset counter if enough time has passed
                if (timeSinceLastSelection > SINGLE_SELECT_THRESHOLD) {
                    _selectionCount = 0;
                }
            },
            ['global']
        );

        const globalDeleteTokenHookId = HookManager.registerHook(
            "deleteToken",
            async (token) => {
                const panelManager = getPanelManager();
                if (panelManager?.currentActor?.id === token.actor?.id) {
                    // Try to find another token to display
                    const nextToken = canvas.tokens?.placeables.find(t => t.actor?.isOwner);
                    if (nextToken) {
                        // Add fade-out animation to tray panel wrapper if appropriate
                        if (panelManager.instance) {
                            panelManager.instance._applyFadeOutAnimation();
                        }
                        
                        // Update the actor without recreating the tray
                        panelManager.currentActor = nextToken.actor;
                        if (panelManager.instance) {
                            panelManager.instance.actor = nextToken.actor;
                            
                            // Update the actor reference in all panel instances
                            if (panelManager.instance.characterPanel) panelManager.instance.characterPanel.actor = nextToken.actor;
                            if (panelManager.instance.controlPanel) panelManager.instance.controlPanel.actor = nextToken.actor;
                            if (panelManager.instance.favoritesPanel) panelManager.instance.favoritesPanel.actor = nextToken.actor;
                            if (panelManager.instance.spellsPanel) panelManager.instance.spellsPanel.actor = nextToken.actor;
                            if (panelManager.instance.weaponsPanel) panelManager.instance.weaponsPanel.actor = nextToken.actor;
                            if (panelManager.instance.inventoryPanel) panelManager.instance.inventoryPanel.actor = nextToken.actor;
                            if (panelManager.instance.featuresPanel) panelManager.instance.featuresPanel.actor = nextToken.actor;
                            if (panelManager.instance.experiencePanel) panelManager.instance.experiencePanel.actor = nextToken.actor;
                            if (panelManager.instance.statsPanel) panelManager.instance.statsPanel.actor = nextToken.actor;
                            if (panelManager.instance.abilitiesPanel) panelManager.instance.abilitiesPanel.actor = nextToken.actor;
                            if (panelManager.instance.dicetrayPanel) panelManager.instance.dicetrayPanel.actor = nextToken.actor;
                            if (panelManager.instance.macrosPanel) panelManager.instance.macrosPanel.actor = nextToken.actor;
                            
                            // Update the handle manager's actor reference
                            if (panelManager.instance.handleManager) {
                                panelManager.instance.handleManager.updateActor(nextToken.actor);
                            }
                            
                            await panelManager.instance.updateHandle();
                            
                            // Re-render all panels with the new actor data
                            await panelManager.instance.renderPanels(panelManager.instance.element);
                            
                            // Add fade-in animation to tray panel wrapper after update if appropriate
                            if (panelManager.instance) {
                                panelManager.instance._applyFadeInAnimation();
                            }
                            
                            // Re-attach event listeners to ensure tray functionality works
                        }
                    } else {
                        // No more tokens, clear the instance
                        panelManager.instance = null;
                        panelManager.currentActor = null;
                    }
                }
            },
            ['global']
        );

        const globalUpdateActorHookId = HookManager.registerHook(
            "updateActor",
            async (actor, changes) => {
                const panelManager = getPanelManager();
                // Only process if this is the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== actor.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // Only handle major changes that require full re-initialization
                const needsFullUpdate = changes.name || // Name change
                                       changes.img || // Image change
                                       changes.system?.attributes?.prof || // Proficiency change
                                       changes.system?.details?.level || // Level change
                                       changes.system?.attributes?.ac || // AC change
                                       changes.system?.attributes?.movement; // Movement change

                if (needsFullUpdate) {
                    await panelManager.initialize(actor);
                    // Force a re-render of all panels
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                    await panelManager.instance.updateHandle();
                }
                // For health, effects, and spell slot changes, update appropriately
                else {
                    // Handle health and effects changes
                    if (changes.system?.attributes?.hp || changes.effects) {
                        await panelManager.instance.updateHandle();
                    }
                    // Handle spell slot changes
                    if (changes.system?.spells) {
                        // Re-render just the spells panel
                        if (panelManager.instance.spellsPanel?.element) {
                            await panelManager.instance.spellsPanel.render(panelManager.instance.spellsPanel.element);
                        }
                    } else {
                        // For other changes, just update the handle
                        await panelManager.instance.updateHandle();
                    }
                }
            },
            ['global']
        );

        const globalPauseGameHookId = HookManager.registerHook(
            "pauseGame",
            async (paused) => {
                const panelManager = getPanelManager();
                if (!paused && panelManager?.instance && panelManager.instance.element) {
                    await panelManager.instance.renderPanels(panelManager.instance.element);
                }
            },
            ['global']
        );

        const globalCreateActiveEffectHookId = HookManager.registerHook(
            "createActiveEffect",
            async (effect) => {
                const panelManager = getPanelManager();
                // Only process if this effect belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== effect.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
            },
            ['global']
        );

        const globalDeleteActiveEffectHookId = HookManager.registerHook(
            "deleteActiveEffect",
            async (effect) => {
                const panelManager = getPanelManager();
                // Only process if this effect belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== effect.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
            },
            ['global']
        );

        const globalCreateItemHookId = HookManager.registerHook(
            "createItem",
            async (item) => {
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // No need to recreate the entire tray - just update relevant panels and handle
                await panelManager.instance.renderPanels(panelManager.instance.element);
                await panelManager.instance.updateHandle();
            },
            ['global']
        );

        const globalUpdateItemHookId = HookManager.registerHook(
            "updateItem",
            async (item, changes) => {
                if (!item.parent) return;
                
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // Check if this is an NPC/monster and the item is a weapon being equipped
                // or a spell being prepared
                if (item.parent.type !== "character") {
                    // Check if actor is from a compendium before trying to modify it
                    const isFromCompendium = item.parent.pack || (item.parent.collection && item.parent.collection.locked);
                    if (isFromCompendium) {
                        // Skip auto-favoriting for actors from compendiums
                    } else {
                        // For weapons, check if equipped status changed to true
                        if (item.type === "weapon" && item.system.equipped === true) {
                            // Add to favorites if it's now equipped
                            await FavoritesPanel.manageFavorite(item.parent, item.id);
                        }
                        // For spells, check if prepared status changed to true
                        else if (item.type === "spell" && item.system.preparation?.mode === "prepared" && item.system.preparation?.prepared === true) {
                            // Add to favorites if it's now prepared
                            await FavoritesPanel.manageFavorite(item.parent, item.id);
                        }
                    }
                } else {
                    // For other changes, just update the handle
                    await panelManager.instance.updateHandle();
                }
            },
            ['global']
        );

        const globalDeleteItemHookId = HookManager.registerHook(
            "deleteItem",
            async (item) => {
                const panelManager = getPanelManager();
                // Only process if this item belongs to the actor currently being managed by Squire
                if (panelManager?.currentActor?.id !== item.parent?.id) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                if (!panelManager?.instance) {
                    return;
                }
                
                // No need to recreate the entire tray - just update relevant panels and handle
                await panelManager.instance.renderPanels(panelManager.instance.element);
                await panelManager.instance.updateHandle();
            },
            ['global']
        );

        const globalCloseGameHookId = HookManager.registerHook(
            "closeGame",
            () => {
                const panelManager = getPanelManager();
                if (panelManager?.instance) {
                    panelManager.cleanup();
                }
            },
            ['global']
        );

        const globalDisableModuleHookId = HookManager.registerHook(
            "disableModule",
            (moduleId) => {
                if (moduleId === MODULE.ID) {
                    // Clear any pending multi-select timeout
                    if (_multiSelectTimeout) {
                        clearTimeout(_multiSelectTimeout);
                        _multiSelectTimeout = null;
                    }
                    // Reset selection tracking
                    _selectionCount = 0;
                    _lastSelectionTime = 0;
                    
                    // Clear quest pin timeouts
                    HookManager.questPinTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
                    HookManager.questPinTimeouts.clear();
                    if (HookManager.questPinVisibilityDebounce) {
                        clearTimeout(HookManager.questPinVisibilityDebounce);
                        HookManager.questPinVisibilityDebounce = null;
                    }
                    
                    const panelManager = getPanelManager();
                    if (panelManager) {
                        panelManager.cleanup();
                    }
                }
            },
            ['global']
        );

        const globalCanvasReadyHookId = HookManager.registerHook(
            "canvasReady",
            () => {
                // Monitor canvas selection changes
                const originalSelectObjects = canvas.selectObjects;
                canvas.selectObjects = function(...args) {
                    const result = originalSelectObjects.apply(this, args);
                    
                    // Clear any existing multi-select timeout since we're using a different selection method
                    if (_multiSelectTimeout) {
                        clearTimeout(_multiSelectTimeout);
                        _multiSelectTimeout = null;
                    }
                    
                    // Reset selection tracking since this is a different selection method
                    _selectionCount = 0;
                    
                    // After selection, update the health panel if needed
                    setTimeout(async () => {
                        await _updateHealthPanelFromSelection();
                    }, 100); // Slightly longer delay for canvas selection methods
                    
                    return result;
                };
            },
            ['global']
        );

        const globalCreateTokenHookId = HookManager.registerHook(
            "createToken",
            async (token) => {
                // Only process if this token is owned by the user
                if (!token.actor?.isOwner) {
                    return;
                }
                
                // Only process if PanelManager instance exists
                const panelManager = getPanelManager();
                if (!panelManager?.instance) {
                    return;
                }
                
                await panelManager.instance.updateHandle();
            },
            ['global']
        );

        // Update the logging message to reflect all consolidated hooks including global system hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `HookManager: All hooks consolidated - ${HookManager.hookRegistry.size} total hooks registered (including global system hooks)`,
            '',
            true,
            false
        );

        // Quest Pin Hooks - Consolidated
        const questPinDropCanvasDataHookId = HookManager.registerHook(
            "dropCanvasData",
            async (canvas, data) => {
                if (data.type !== 'quest-objective' && data.type !== 'quest-quest') return; // Let Foundry handle all other drops!
                
                // Only GMs can create quest pins
                if (!game.user.isGM) return false;
                
                if (data.type === 'quest-objective') {
                    // Handle objective-level pins
                    const { questUuid, objectiveIndex, objectiveState, questIndex, questCategory, questState } = data;
                    
                    // Use the objective state from the drag data (default to 'active' if not provided)
                    const finalObjectiveState = objectiveState || 'active';
                    
                    const pin = new QuestPin({ 
                        x: data.x, 
                        y: data.y, 
                        questUuid, 
                        objectiveIndex, 
                        objectiveState: finalObjectiveState, 
                        questIndex, 
                        questCategory,
                        questState: questState || 'visible'
                    });
                    
                    if (canvas.squirePins) {
                        canvas.squirePins.addChild(pin);
                        // Save to persistence
                        pin._saveToPersistence();
                        
                        // Auto-show quest pins if they're currently hidden and this is a GM
                        if (game.user.isGM && game.user.getFlag(MODULE.ID, 'hideQuestPins')) {
                            await game.user.setFlag(MODULE.ID, 'hideQuestPins', false);
                            ui.notifications.info('Quest pins automatically shown after placing new objective pin.');
                            
                            // Update the toggle button in the quest panel to reflect the new state
                            const toggleButton = document.querySelector('.toggle-pin-visibility');
                            if (toggleButton) {
                                toggleButton.classList.remove('fa-location-dot');
                                toggleButton.classList.add('fa-location-dot-slash');
                                toggleButton.title = 'Hide Quest Pins';
                            }
                        }
                    } else {
                        // canvas.squirePins is not available
                    }
                    return true;
                } else if (data.type === 'quest-quest') {
                    // Handle quest-level pins
                    const { questUuid, questIndex, questCategory, questState, questStatus, participants } = data;
                    
                    // Convert participant UUIDs to participant objects with names
                    const processedParticipants = [];
                    if (participants && Array.isArray(participants)) {
                        for (const participantUuid of participants) {
                            try {
                                if (participantUuid && participantUuid.trim()) {
                                    // Try to get actor name from UUID
                                    const actor = await fromUuid(participantUuid);
                                    if (actor && actor.name) {
                                        processedParticipants.push({
                                            uuid: participantUuid,
                                            name: actor.name,
                                            img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                                        });
                                    } else {
                                        // Fallback: use UUID as name
                                        processedParticipants.push({
                                            uuid: participantUuid,
                                            name: participantUuid,
                                            img: 'icons/svg/mystery-man.svg'
                                        });
                                    }
                                }
                            } catch (error) {
                                // If UUID lookup fails, use UUID as name
                                processedParticipants.push({
                                    uuid: participantUuid,
                                    name: participantUuid,
                                    img: 'icons/svg/mystery-man.svg'
                                });
                            }
                        }
                    }
                    
                    const pin = new QuestPin({ 
                        x: data.x, 
                        y: data.y, 
                        questUuid, 
                        objectiveIndex: null, // Indicates quest-level pin
                        objectiveState: null, // Not applicable for quest pins
                        questIndex, 
                        questCategory,
                        questState: questState || 'visible',
                        questStatus: questStatus || 'Not Started',
                        participants: processedParticipants
                    });
                    
                    if (canvas.squirePins) {
                        canvas.squirePins.addChild(pin);
                        // Save to persistence
                        pin._saveToPersistence();
                        
                        // Auto-show quest pins if they're currently hidden and this is a GM
                        if (game.user.isGM && game.user.getFlag(MODULE.ID, 'hideQuestPins')) {
                            await game.user.setFlag(MODULE.ID, 'hideQuestPins', false);
                            ui.notifications.info('Quest pins automatically shown after placing new quest pin.');
                            
                            // Update the toggle button in the quest panel to reflect the new state
                            const toggleButton = document.querySelector('.toggle-pin-visibility');
                            if (toggleButton) {
                                toggleButton.classList.remove('fa-location-dot');
                                toggleButton.classList.add('fa-location-dot-slash');
                                toggleButton.title = 'Hide Quest Pins';
                            }
                        }
                    } else {
                        // canvas.squirePins is not available
                    }
                    return true;
                }
            },
            ['questPins']
        );

        const questPinCanvasSceneChangeHookId = HookManager.registerHook(
            "canvasSceneChange",
            (scene) => {
                // Delay loading to ensure scene is fully loaded
                const timeoutId = setTimeout(() => {
                    loadPersistedPins();
                    HookManager.questPinTimeouts.delete(timeoutId);
                }, 1000); // Increased delay for scene changes
                HookManager.questPinTimeouts.add(timeoutId);
            },
            ['questPins']
        );

        const questPinUpdateSceneHookId = HookManager.registerHook(
            "updateScene",
            (scene, changes, options, userId) => {
                if (scene.id === canvas.scene?.id && changes.flags && changes.flags[MODULE.ID]) {
                    // Delay loading to ensure the scene update is fully processed
                    setTimeout(() => {
                        loadPersistedPins();
                    }, 500);
                }
            },
            ['questPins']
        );

        const questPinUpdateTokenHookId = HookManager.registerHook(
            "updateToken",
            (token, changes) => {
                if (changes.x !== undefined || changes.y !== undefined || changes.vision !== undefined) {
                    HookManager.debouncedUpdateAllPinVisibility();
                }
            },
            ['questPins']
        );

        const questPinCreateTokenHookId = HookManager.registerHook(
            "createToken",
            (token) => {
                HookManager.debouncedUpdateAllPinVisibility();
            },
            ['questPins']
        );

        const questPinDeleteTokenHookId = HookManager.registerHook(
            "deleteToken",
            (token) => {
                HookManager.debouncedUpdateAllPinVisibility();
            },
            ['questPins']
        );

        const questPinRenderQuestPanelHookId = HookManager.registerHook(
            "renderQuestPanel",
            () => {
                HookManager.debouncedUpdateAllPinVisibility();
            },
            ['questPins']
        );

        const questPinSightRefreshHookId = HookManager.registerHook(
            "sightRefresh",
            () => {
                HookManager.debouncedUpdateAllPinVisibility();
            },
            ['questPins']
        );



        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Quest Pin hooks consolidated in HookManager',
            { 
                questPinDropCanvasDataHookId,
                questPinCanvasSceneChangeHookId,
                questPinUpdateSceneHookId,
                questPinUpdateTokenHookId,
                questPinCreateTokenHookId,
                questPinDeleteTokenHookId,
                questPinRenderQuestPanelHookId,
                questPinSightRefreshHookId,
                totalHooks: HookManager.getHookStats().totalHooks
            },
            true,
            false
        );
    } // End of _setupHooks method
    
    /**
     * Handle journal entry page updates and route to appropriate panels
     * @private
     */
    async _handleJournalEntryPageUpdate(page, changes, options, userId) {
        const blacksmith = getBlacksmith();
        

        
        // Route to appropriate panels based on content type and journal
        
        await Promise.all([
            this._routeToCodexPanel(page, changes, options, userId),
            this._routeToQuestPanel(page, changes, options, userId),
            this._routeToNotesPanel(page, changes, options, userId),
            this._routeToQuestPins(page, changes, options, userId)
        ]);
    }
    
    /**
     * Route update to CODEX panel if applicable
     * @private
     */
    async _routeToCodexPanel(page, changes, options, userId) {
        if (!HookManager.codexPanel) return;
        
        try {
            // Check if this is a CODEX entry and belongs to the selected journal
            if (HookManager.codexPanel._isPageInSelectedJournal && 
                HookManager.codexPanel._isPageInSelectedJournal(page) &&
                HookManager.codexPanel._isCodexEntry && 
                HookManager.codexPanel._isCodexEntry(page)) {
                
                // Skip panel refresh if currently importing
                if (HookManager.codexPanel.isImporting) {
                    return;
                }
                
                const blacksmith = getBlacksmith();
                
                // Always refresh the data first
                await HookManager.codexPanel._refreshData();
                
                // Trigger a refresh through the PanelManager if it's available
                const panelManager = getPanelManager();
                if (panelManager?.instance && panelManager.element) {
                    // Re-render the codex panel specifically
                    HookManager.codexPanel.render(panelManager.element);
                }
            }
        } catch (error) {
            console.error('HookManager: Error routing to CODEX panel', { error, pageName: page.name });
        }
    }
    
    /**
     * Route update to Quest panel if applicable
     * @private
     */
    async _routeToQuestPanel(page, changes, options, userId) {
        if (!HookManager.questPanel) return;
        
        try {
            // Check if this belongs to the selected quest journal
            if (HookManager.questPanel._isPageInSelectedJournal && 
                HookManager.questPanel._isPageInSelectedJournal(page)) {
                
                // Skip panel refresh if currently importing
                if (HookManager.questPanel.isImporting) {
                    return;
                }
                
                const blacksmith = getBlacksmith();
                
                // Always refresh the data first
                
                await HookManager.questPanel._refreshData();
                
                // Trigger a refresh through the PanelManager if it's available
                const panelManager = getPanelManager();
                if (panelManager?.instance && panelManager.element) {
                    // Re-render the quest panel specifically
                    HookManager.questPanel.render(panelManager.element);
                }
                
                // Handle quest-specific logic (visibility changes, pin updates, etc.)
                await this._handleQuestSpecificUpdates(page, changes);
            }
        } catch (error) {
            console.error('HookManager: Error routing to Quest panel', { error, pageName: page.name });
        }
    }
    
    /**
     * Route update to Notes panel if applicable
     * @private
     */
    async _routeToNotesPanel(page, changes, options, userId) {
        if (!HookManager.notesPanel) return;
        
        try {
            // Check if this is the currently displayed page in notes panel
            if (HookManager.notesPanel.element) {
                const currentPageId = HookManager.notesPanel.element.find('.journal-content').data('page-id');
                if (currentPageId === page.id) {
                    
                    const blacksmith = getBlacksmith();
                    
                                    // Trigger a refresh through the PanelManager if it's available
                const panelManager = getPanelManager();
                if (panelManager?.instance && panelManager.element) {
                    // Re-render the notes panel specifically
                    HookManager.notesPanel.render(panelManager.element);
                }
                }
            }
        } catch (error) {
            console.error('HookManager: Error routing to Notes panel', { error, pageName: page.name });
        }
    }
    
    /**
     * Route update to Quest Pins if applicable
     * @private
     */
    async _routeToQuestPins(page, changes, options, userId) {
        if (!HookManager.questPins) return;
        
        try {
            // Check if this affects quest pins - either through flags or content changes
            const hasFlagChanges = changes.flags && changes.flags[MODULE.ID];
            const hasContentChanges = changes.text && changes.text.content;
            
            if (hasFlagChanges || hasContentChanges) {
                
                const blacksmith = getBlacksmith();
                
                // Update pin visibility and states
                HookManager.updateAllPinVisibility();
            }
        } catch (error) {
            console.error('HookManager: Error routing to Quest Pins', { error, pageName: page.name });
        }
    }
    
    /**
     * Handle quest-specific updates (visibility, pin updates, etc.)
     * @private
     */
    async _handleQuestSpecificUpdates(page, changes) {
        try {
            const blacksmith = getBlacksmith();
            
            // Handle quest visibility changes
            if (changes.flags && changes.flags[MODULE.ID] && changes.flags[MODULE.ID].visible !== undefined) {
                const isVisible = changes.flags[MODULE.ID].visible;
                
                // If quest is being hidden from players, unpin it from all players
                if (isVisible === false && HookManager.questPanel._unpinHiddenQuestFromPlayers) {
                    await HookManager.questPanel._unpinHiddenQuestFromPlayers(page.uuid);
                }
                
                // Update quest pins if they exist for this quest
                if (canvas.squirePins) {
                    const questPins = canvas.squirePins.children.filter(child => 
                        child.constructor.name === 'QuestPin' && child.questUuid === page.uuid
                    );
                    
                    questPins.forEach(pin => {
                        try {
                            // Update quest state
                            pin.questState = isVisible ? 'visible' : 'hidden';
                            
                            // Update pin appearance
                            if (pin._updatePinAppearance) {
                                pin._updatePinAppearance();
                            }
                            
                            // Update visibility
                            if (pin.updateVisibility) {
                                pin.updateVisibility();
                            }
                            
                            // Update objective states if applicable
                            this._updateQuestPinObjectiveStates(pin, page);
                        } catch (error) {
                            console.error('HookManager: Error updating quest pin state', { error, pin, page });
                        }
                    });
                }
            } else {
                // Regular quest content update - check for status changes
                this._updateQuestPinStatuses(page);
            }
        } catch (error) {
            console.error('HookManager: Error handling quest-specific updates', { error, page });
        }
    }
    
    /**
     * Update quest pin objective states based on page content
     * @private
     */
    _updateQuestPinObjectiveStates(pin, page) {
        try {
            let content = page.text.content;
            const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
            
            if (tasksMatch && pin.objectiveIndex !== undefined) {
                const tasksHtml = tasksMatch[1];
                const parser = new DOMParser();
                const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                const ul = ulDoc.querySelector('ul');
                
                if (ul) {
                    const liList = Array.from(ul.children);
                    const li = liList[pin.objectiveIndex];
                    
                    if (li) {
                        let newState = 'active';
                        if (li.querySelector('s')) {
                            newState = 'completed';
                        } else if (li.querySelector('code')) {
                            newState = 'failed';
                        } else if (li.querySelector('em')) {
                            newState = 'hidden';
                        }
                        
                        if (pin.updateObjectiveState) {
                            pin.updateObjectiveState(newState);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('HookManager: Error updating quest pin objective states', { error, pin, page });
        }
    }
    
    /**
     * Update quest pin statuses based on page content
     * @private
     */
    _updateQuestPinStatuses(page) {
        try {
            let content = page.text.content;
            const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
            const newStatus = statusMatch ? statusMatch[1].trim() : '';
            
            if (newStatus && canvas.squirePins) {
                const questPins = canvas.squirePins.children.filter(child => 
                    child.constructor.name === 'QuestPin' && child.questUuid === page.uuid
                );
                
                questPins.forEach(pin => {
                    try {
                        // Update quest status for quest-level pins
                        if (pin.pinType === 'quest' && pin.updateQuestStatus) {
                            pin.updateQuestStatus(newStatus);
                        }
                        
                        // Update objective states for objective pins
                        if (pin.pinType === 'objective') {
                            this._updateQuestPinObjectiveStates(pin, page);
                        }
                    } catch (error) {
                        console.error('HookManager: Error updating quest pin status', { error, pin, page });
                    }
                });
            }
        } catch (error) {
            console.error('HookManager: Error updating quest pin statuses', { error, page });
        }
    }
    
    /**
     * Clean up all hooks
     */
    static cleanup() {
        // Clean up all registered hooks
        HookManager.hookRegistry.forEach((hookInfo, hookName) => {
            if (hookInfo.isActive) {
                Hooks.off(hookName, hookInfo.handler);
            }
        });
        
        // Clear all registries
        HookManager.hookRegistry.clear();
        HookManager.panelHooks.clear();
        HookManager.hookIds.clear();
        HookManager.instance = null;
        
        // Clear quest pin timeouts
        HookManager.questPinTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        HookManager.questPinTimeouts.clear();
        if (HookManager.questPinVisibilityDebounce) {
            clearTimeout(HookManager.questPinVisibilityDebounce);
            HookManager.questPinVisibilityDebounce = null;
        }
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'HookManager cleaned up all hooks',
            { totalHooksCleaned: HookManager.hookRegistry.size },
            false,
            false
        );
    }
}


