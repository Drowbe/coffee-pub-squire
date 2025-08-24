import { MODULE, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';

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
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            `Panel registered with HookManager`,
            { panelType, hasPanel: !!panel },
            true,
            false
        );
    }
    
    /**
     * Set up all journal-related hooks
     * @private
     */
    _setupHooks() {
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
    }
    
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
                if (PanelManager.instance && PanelManager.element) {
                    // Re-render the codex panel specifically
                    HookManager.codexPanel.render(PanelManager.element);
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
                if (PanelManager.instance && PanelManager.element) {
                    // Re-render the quest panel specifically
                    HookManager.questPanel.render(PanelManager.element);
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
                    if (PanelManager.instance && PanelManager.element) {
                        // Re-render the notes panel specifically
                        HookManager.notesPanel.render(PanelManager.element);
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
                if (typeof HookManager.questPins.updateAllPinVisibility === 'function') {
                    HookManager.questPins.updateAllPinVisibility();
                }
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
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'HookManager cleaned up all hooks',
            { totalHooksCleaned: HookManager.hookRegistry.size },
            false,
            false
        );
    }
}

// Helper function to safely get Blacksmith API
function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}
