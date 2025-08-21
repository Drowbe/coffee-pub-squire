import { MODULE, SQUIRE } from './const.js';
import { PanelManager } from './manager-panel.js';

/**
 * Centralized Hook Manager for Squire
 * Consolidates all journal-related hooks and routes them to appropriate panels
 */
export class HookManager {
    static instance = null;
    
    // Store references to panels
    static codexPanel = null;
    static questPanel = null;
    static notesPanel = null;
    static questPins = null;
    
    // Hook IDs for cleanup
    static hookIds = new Map();
    
    /**
     * Initialize the hook manager
     */
    static initialize() {
        if (HookManager.instance) return HookManager.instance;
        
        HookManager.instance = new HookManager();
        HookManager.instance._setupHooks();
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'HookManager initialized',
            {},
            false,
            false
        );
        
        return HookManager.instance;
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
            false,
            false
        );
    }
    
    /**
     * Set up all journal-related hooks
     * @private
     */
    _setupHooks() {
        // Journal Entry Page Update Hook - Consolidated
        const journalHookId = Hooks.on("updateJournalEntryPage", async (page, changes, options, userId) => {
            await this._handleJournalEntryPageUpdate(page, changes, options, userId);
        });
        
        HookManager.hookIds.set('updateJournalEntryPage', journalHookId);
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Journal hooks consolidated in HookManager',
            { hookId: journalHookId },
            false,
            false
        );
    }
    
    /**
     * Handle journal entry page updates and route to appropriate panels
     * @private
     */
    async _handleJournalEntryPageUpdate(page, changes, options, userId) {
        const blacksmith = getBlacksmith();
        
        // Debug: journal entry page update processed
        
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
        HookManager.hookIds.forEach((hookId, hookName) => {
            Hooks.off(hookName, hookId);
        });
        
        HookManager.hookIds.clear();
        HookManager.instance = null;
        
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'HookManager cleaned up',
            {},
            false,
            false
        );
    }
}

// Helper function to safely get Blacksmith API
function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}
