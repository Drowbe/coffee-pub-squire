import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { MacrosWindow } from './window-macros.js';
import { PanelManager } from './manager-panel.js';
import { trackModuleTimeout } from './timer-utils.js';
import { renderTemplate, getNativeElement } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Hide Foundry hotbar if setting is enabled
export function updateHotbarVisibility() {
  // Only run if the setting is registered
  if (!game.settings.settings.has(`${MODULE.ID}.hideFoundryHotbar`)) return;
  const shouldHide = game.settings.get(MODULE.ID, 'hideFoundryHotbar');
  let styleTag = document.getElementById('squire-hide-hotbar-style');
  if (shouldHide) {
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'squire-hide-hotbar-style';
      styleTag.innerText = '#hotbar { display: none !important; }';
      document.head.appendChild(styleTag);
    }
  } else if (styleTag) {
    styleTag.remove();
  }
}

// Function to open macros window from menubar
export async function openMacros() {
  try {
    // Get the current actor from PanelManager
    const actor = PanelManager.instance?.actor;
    
    // Create or get the macros panel
    let macrosPanel = PanelManager.instance?.macrosPanel;
    if (!macrosPanel) {
      macrosPanel = new MacrosPanel({ actor });
      PanelManager.instance.macrosPanel = macrosPanel;
    }
    
    // If already popped out, just focus the window
    if (macrosPanel.isPoppedOut && macrosPanel.window) {
      macrosPanel.window.bringToTop();
      return;
    }
    
    // Pop out the macros window
    await macrosPanel._onPopOut();
    
  } catch (error) {
    console.error('Coffee Pub Squire | Error opening macros:', error);
    ui.notifications.error('Failed to open macros');
  }
}

// Note: Hooks are now managed centrally by HookManager
// No need to register hooks here anymore

export class MacrosPanel {
    static isWindowOpen = false;
    static activeWindow = null;

    constructor(options = {}) {
        this.element = null;
        this.actor = options.actor || null;
        
        // Check if there's an active window and restore state
        this.window = MacrosPanel.activeWindow;
        this.isPoppedOut = MacrosPanel.isWindowOpen;

        // Only register for actor updates if we have an actor
        if (this.actor) {
            this.actor.apps[this.id] = this;
        }
        
        // Update hotbar visibility when panel is created
        updateHotbarVisibility();
    }

    async render(html, { showAddSlot = false } = {}) {
        // Always render into the panel container inside the placeholder if not popped out
        if (!this.isPoppedOut) {
            // v13: Use native DOM instead of jQuery
            const placeholder = document.querySelector('#macros-panel-placeholder');
            // NULL SAFETY: If placeholder doesn't exist in DOM, skip rendering
            // This prevents crashes during multi-select when DOM is being rebuilt
            if (!placeholder) {
                return;
            }
            let container = placeholder.querySelector('.panel-container[data-panel="macros"]');
            if (!container) {
                // Create the panel container if it doesn't exist
                container = document.createElement('div');
                container.className = 'panel-container';
                container.setAttribute('data-panel', 'macros');
                placeholder.appendChild(container);
            }
            this.element = container;
        } else if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element || this.isPoppedOut) {
            return;
        }
        // Load macros and favorites from settings
        let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
        // Ensure at least one empty slot if macros is empty
        if (!macros.length) {
            macros = [{ id: null, name: null, img: null }];
        }
        let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
        let favoriteMacros = favoriteMacroIds.map(id => {
            const macro = game.macros.get(id);
            return macro ? { id: macro.id, name: macro.name, img: macro.img } : null;
        }).filter(Boolean);
        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isMacrosPopped: this.isPoppedOut,
            macros,
            showAddSlot,
            favoriteMacroIds,
            favoriteMacros
        };

        // Skip rendering in tray if popped out
        if (this.isPoppedOut) {
            // Let the MacrosWindow handle its own rendering
            if (this.window?.rendered) {
                this.window.render(false);
            }
            return;
        }

        // Only render in tray if not popped out
        const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
        // v13: Use native DOM innerHTML instead of jQuery html()
        this.element.innerHTML = content;
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element;
        const isCollapsed = game.settings.get(MODULE.ID, 'isMacrosPanelCollapsed');
        if (isCollapsed) {
            // v13: Use native DOM instead of jQuery
            const macrosContent = panel.querySelector('#macros-content');
            const toggle = panel.querySelector('#macros-toggle');
            if (macrosContent) macrosContent.classList.add('collapsed');
            if (toggle) toggle.style.transform = 'rotate(-90deg)';
        }
    }

    _activateListeners(html) {
        if (!html) return;

        // v13: Convert jQuery to native DOM if needed
        const panel = getNativeElement(html);
        if (!panel) return;

        // Initialize dragActive as instance variable if not already set
        if (this._dragActive === undefined) {
            this._dragActive = false;
        }

        // Toggle panel handler
        // v13: Use native DOM event delegation
        const trayTitle = panel.querySelector('.tray-title-small');
        if (trayTitle) {
            const newTitle = trayTitle.cloneNode(true);
            trayTitle.parentNode?.replaceChild(newTitle, trayTitle);
            newTitle.addEventListener('click', () => {
                const macrosContent = panel.querySelector('#macros-content');
                const toggle = panel.querySelector('#macros-toggle');
                if (macrosContent && toggle) {
                    const isCollapsed = macrosContent.classList.contains('collapsed');
                    macrosContent.classList.toggle('collapsed');
                    toggle.style.transform = macrosContent.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                    // Save collapsed state
                    game.settings.set(MODULE.ID, 'isMacrosPanelCollapsed', macrosContent.classList.contains('collapsed'));
                }
            });
        }

        // Pop-out button handler
        // v13: Use native DOM event delegation
        const popOutButton = panel.querySelector('.pop-out-button');
        if (popOutButton) {
            const newButton = popOutButton.cloneNode(true);
            popOutButton.parentNode?.replaceChild(newButton, popOutButton);
            newButton.addEventListener('click', () => this._onPopOut());
        }

        // Open macro folder button handler
        // v13: Use native DOM event delegation
        const openFolderButton = panel.querySelector('.open-macro-folder');
        if (openFolderButton) {
            const newButton = openFolderButton.cloneNode(true);
            openFolderButton.parentNode?.replaceChild(newButton, openFolderButton);
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (ui.macros && typeof ui.macros.renderPopout === 'function') ui.macros.renderPopout();
            });
        }

        // Add drag and drop handlers to the panel container and macros grid
        // v13: Use native DOM event listeners
        const panelContainer = panel.closest('[data-panel="macros"]') || panel.closest('.panel-container');
        const macrosGrid = panel.querySelector('.macros-grid');
        
        // Find the panel container and window for visual feedback
        let windowElement = null;
        if (this.isPoppedOut && this.window && this.window.element) {
            // FoundryVTT Application.element is the window content, we need the .app wrapper
            windowElement = this.window.element.closest('.app') || 
                           document.querySelector(`#${this.window.id || 'squire-macros-window'}`);
        }
        
        // Helper function to get the last slot element
        const getLastSlot = () => {
            if (!macrosGrid) return null;
            const slots = macrosGrid.querySelectorAll('.macro-slot:not(.add-slot)');
            return slots.length > 0 ? slots[slots.length - 1] : null;
        };
        
        // Helper function to show drop target visual feedback
        const showDropTarget = () => {
            // Add drop target class to window (the .app element)
            if (windowElement && windowElement.classList) {
                windowElement.classList.add('macro-drop-target');
            }
            // Also add to panel container for tray view
            if (panelContainer && panelContainer.classList) {
                panelContainer.classList.add('macro-drop-target');
            }
            // Highlight last slot
            const lastSlot = getLastSlot();
            if (lastSlot && lastSlot.classList) {
                lastSlot.classList.add('drop-target-slot');
            }
        };
        
        // Helper function to hide drop target visual feedback
        const hideDropTarget = () => {
            // Remove drop target class from window
            if (windowElement && windowElement.classList) {
                windowElement.classList.remove('macro-drop-target');
            }
            // Remove from panel container
            if (panelContainer && panelContainer.classList) {
                panelContainer.classList.remove('macro-drop-target');
            }
            // Remove highlight from last slot
            const lastSlot = getLastSlot();
            if (lastSlot && lastSlot.classList) {
                lastSlot.classList.remove('drop-target-slot');
            }
        };
        
        // Helper function to handle external macro drop
        const handleExternalMacroDrop = async (e) => {
            hideDropTarget();
            
            // Check if this is an external macro drop
            let data;
            try {
                data = JSON.parse(e.dataTransfer.getData('text/plain'));
            } catch (error) {
                // Not JSON, might be external macro - check Foundry's drag data format
                const textData = e.dataTransfer.getData('text/plain');
                if (textData) {
                    // Foundry macro drags use format like: {"type":"Macro","uuid":"Macro.xxx"}
                    try {
                        const foundryData = JSON.parse(textData);
                        if (foundryData.type === 'Macro' && foundryData.uuid) {
                            const macroId = foundryData.uuid.split('Macro.')[1];
                            const macro = game.macros.get(macroId);
                            if (macro) {
                                let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                                macros = macros.filter(m => m && typeof m === 'object');
                                macros.push({ id: macro.id, name: macro.name, img: macro.img });
                                await game.settings.set(MODULE.ID, 'userMacros', macros);
                                if (this.isPoppedOut && this.window) {
                                    this.window.macros = macros;
                                    await this.window.render(false);
                                }
                                await this.render();
                                return true;
                            }
                        }
                    } catch (e2) {
                        // Not Foundry format either
                    }
                }
                return false;
            }
            
            // If it's internal reorder, don't handle here
            if (data.type === 'internal-macro') {
                return false;
            }
            
            // External macro drop - add to last slot
            const macroId = data.id || data.data?.id || data.uuid?.split('.').pop();
            const isMacro = data.type === 'Macro' || data.data?.type === 'Macro' || data.uuid?.startsWith('Macro.');
            if (isMacro && macroId) {
                const macro = game.macros.get(macroId);
                if (macro) {
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    macros = macros.filter(m => m && typeof m === 'object');
                    macros.push({ id: macro.id, name: macro.name, img: macro.img });
                    await game.settings.set(MODULE.ID, 'userMacros', macros);
                    if (this.isPoppedOut && this.window) {
                        this.window.macros = macros;
                        await this.window.render(false);
                    }
                    await this.render();
                    return true;
                }
            }
            return false;
        };
        
        // Add drag handlers to panel container (so dragging anywhere shows drop target)
        if (panelContainer) {
            panelContainer.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showDropTarget();
            });
            
            panelContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                showDropTarget();
            });
            
            panelContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only hide if leaving the container
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || !panelContainer.contains(relatedTarget)) {
                    hideDropTarget();
                }
            });
            
            // Drop handler on panel container
            panelContainer.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await handleExternalMacroDrop(e);
            });
        }
        
        // Add drag and drop handlers for the macros grid
        if (macrosGrid) {
            // Clone to remove old listeners
            const newGrid = macrosGrid.cloneNode(true);
            macrosGrid.parentNode?.replaceChild(newGrid, macrosGrid);
            
            // Drop handler on grid itself - handle external macro drops
            newGrid.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await handleExternalMacroDrop(e);
            });
        }

        // Note: Handle macro icon clicks are handled by the handle manager, not the macros panel

        // Macro grid interactions
        // v13: Use native DOM instead of jQuery
        const self = this;
        const macroSlots = panel.querySelectorAll('.macro-slot');
        macroSlots.forEach((slotElement, idx) => {
            // Clone to remove old listeners
            const slot = slotElement.cloneNode(true);
            slotElement.parentNode?.replaceChild(slot, slotElement);
            
            // Drag & drop events
            slot.addEventListener('dragstart', function(e) {
                if (!slot.classList.contains('empty')) {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'internal-macro',
                        fromIndex: idx
                    }));
                    // Optionally, set a drag image
                    const img = slot.querySelector('img');
                    if (img) e.dataTransfer.setDragImage(img, 16, 16);
                }
            });
            slot.setAttribute('draggable', !slot.classList.contains('empty'));

            // Restore dragover, dragenter, dragleave for drop to work and feedback
            // v13: Use native DOM event listeners
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            });
            slot.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.add('dragover');
            });
            slot.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.remove('dragover');
            });

            slot.addEventListener('drop', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.remove('dragover');
                
                let data;
                try {
                    data = JSON.parse(e.dataTransfer.getData('text/plain'));
                } catch (error) {
                    ui.notifications.warn('Invalid drag data.');
                    return;
                }
                
                // Internal reorder - this still works per-slot
                if (data.type === 'internal-macro' && typeof data.fromIndex === 'number') {
                    if (data.fromIndex === idx) {
                        return; // No-op if dropped on itself
                    }
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    // Preserve all slots including empty ones
                    macros = macros.filter(m => m && typeof m === 'object');
                    const [moved] = macros.splice(data.fromIndex, 1);
                    macros.splice(idx, 0, moved);
                    await game.settings.set(MODULE.ID, 'userMacros', macros);
                    if (self.isPoppedOut && self.window) {
                        self.window.macros = macros;
                        await self.window.render(false);
                    }
                    await self.render();
                    // Update handle in case favorites order changed
                    const panelManager = PanelManager.instance;
                    if (panelManager) {
                        await panelManager.updateHandle();
                    }
                    return;
                }
                
                // External drop - always add to last slot regardless of where dropped
                const macroId = data.id || data.data?.id || data.uuid?.split('.').pop();
                const isMacro = data.type === 'Macro' || data.data?.type === 'Macro' || data.uuid?.startsWith('Macro.');
                if (isMacro && macroId) {
                    const macro = game.macros.get(macroId);
                    if (macro) {
                        let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                        // Preserve array structure
                        macros = macros.filter(m => m && typeof m === 'object');
                        // Always add to the end (last slot)
                        macros.push({ id: macro.id, name: macro.name, img: macro.img });
                        await game.settings.set(MODULE.ID, 'userMacros', macros);
                        if (self.isPoppedOut && self.window) {
                            self.window.macros = macros;
                            await self.window.render(false);
                        }
                        await self.render();
                    } else {
                        ui.notifications.warn('Macro not found.');
                    }
                } else {
                    ui.notifications.warn('Only macros can be dropped here.');
                }
            });
            // Left click: run macro (unless Shift is held)
            // v13: Use native DOM event listeners
            slot.addEventListener('click', async function(e) {
                if (slot.classList.contains('empty')) return;
                if (e.button === 0 && !e.shiftKey) {
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    const macroId = macros[idx]?.id;
                    const macro = game.macros.get(macroId);
                    if (macro) {
                        // Show loader animation
                        if (!slot.querySelector('.macro-loader')) {
                            const loader = document.createElement('span');
                            loader.className = 'macro-loader';
                            loader.innerHTML = '<i class="fa-solid fa-sun macro-spinner"></i>';
                            slot.appendChild(loader);
                        }
                        slot.classList.add('loading');
                        trackModuleTimeout(() => {
                            slot.classList.remove('loading');
                            const loader = slot.querySelector('.macro-loader');
                            if (loader) loader.remove();
                        }, 600);
                        macro.execute();
                    }
                }
            });
            // Right click: toggle favorite on/off
            // v13: Use native DOM event listeners
            slot.addEventListener('contextmenu', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (slot.classList.contains('empty')) return;
                let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
                const macroId = macros[idx]?.id;
                if (!macroId) return;
                const isFav = favoriteMacroIds.includes(macroId);
                if (isFav) {
                    favoriteMacroIds = favoriteMacroIds.filter(id => id !== macroId);
                } else {
                    favoriteMacroIds.push(macroId);
                }
                await game.settings.set(MODULE.ID, 'userFavoriteMacros', favoriteMacroIds);
                if (self.isPoppedOut && self.window) {
                    self.window.macros = macros;
                    await self.window.render(false);
                }
                await self.render();
                const panelManager = PanelManager.instance;
                if (panelManager) {
                    await panelManager.updateHandle();
                }
            });
            // Middle click or Shift+Left click: clear/remove slot
            // v13: Use native DOM event listeners
            slot.addEventListener('mousedown', async function(e) {
                if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    let removedMacroId = null;
                    // Treat as having a macro only if id is a non-empty string
                    if (macros[idx] && typeof macros[idx].id === 'string' && macros[idx].id.length > 0) {
                        // If slot has a macro, clear it
                        removedMacroId = macros[idx].id;
                        macros[idx] = { id: null, name: null, img: null };
                    } else {
                        // Else (slot is empty), remove it (unless it's the last slot)
                        if (macros.length > 1) {
                            removedMacroId = macros[idx]?.id || null;
                            macros.splice(idx, 1);
                        }
                    }
                    // Always leave at least one slot
                    if (macros.length === 0) {
                        macros = [{ id: null, name: null, img: null }];
                    }
                    await game.settings.set(MODULE.ID, 'userMacros', macros);
                    // Remove from favorites if no longer present
                    if (removedMacroId) {
                        const stillPresent = macros.some(m => m.id === removedMacroId);
                        if (!stillPresent) {
                            let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
                            favoriteMacroIds = favoriteMacroIds.filter(id => id !== removedMacroId);
                            await game.settings.set(MODULE.ID, 'userFavoriteMacros', favoriteMacroIds);
                        }
                    }
                    if (self.isPoppedOut && self.window) {
                        self.window.macros = macros;
                        await self.window.render(false);
                    }
                    await self.render();
                    const panelManager = PanelManager.instance;
                    if (panelManager) {
                        await panelManager.updateHandle();
                    }
                }
            });
        });
    }

    // Helper to get current macros from settings
    getCurrentMacros() {
        return game.settings.get(MODULE.ID, 'userMacros') || [];
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Remove the panel container from the placeholder
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#macros-panel-placeholder');
        if (placeholder) {
            const container = placeholder.querySelector('.panel-container[data-panel="macros"]');
            if (container) {
                container.remove();
            }
        }

        // Set state before creating window
        MacrosPanel.isWindowOpen = true;
        this.isPoppedOut = true;
        await this._saveWindowState(true);

        // Create and render the window, passing current macros
        this.window = new MacrosWindow({ panel: this, macros: this.getCurrentMacros() });
        MacrosPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async returnToTray() {
        if (!this.isPoppedOut) return;

        // Reset state
        MacrosPanel.isWindowOpen = false;
        this.isPoppedOut = false;
        MacrosPanel.activeWindow = null;
        this.window = null;
        await this._saveWindowState(false);

        // Check if macros panel is enabled in settings
        const isMacrosEnabled = game.settings.get(MODULE.ID, 'showMacrosPanel');
        if (!isMacrosEnabled) return;

        // (Re)create the panel container inside the placeholder if missing
        // v13: Use native DOM instead of jQuery
        const placeholder = document.querySelector('#macros-panel-placeholder');
        if (!placeholder) return;
        let container = placeholder.querySelector('.panel-container[data-panel="macros"]');
        if (!container) {
            container = document.createElement('div');
            container.className = 'panel-container';
            container.setAttribute('data-panel', 'macros');
            placeholder.appendChild(container);
        }
        this.element = container;
        // Re-render into the panel container
        await this.render();
    }

    // Update actor reference and window if needed
    updateActor(actor) {
        // Unregister from old actor
        if (this.actor) {
            delete this.actor.apps[this.id];
        }

        // Update actor reference
        this.actor = actor || null;
        
        // Register with new actor
        if (this.actor) {
            this.actor.apps[this.id] = this;
        }
        
        // Update window if popped out
        if (this.isPoppedOut && this.window) {
            this.window.actor = this.actor;
            this.window.updateActor(this.actor);
        } else {
            // Re-render in tray if not popped out
            this.render();
        }
    }

    updateElement(element) {
        this.element = element;
    }

    /**
     * Save window state to user flags
     * @param {boolean} isOpen - Whether the window is open
     * @private
     */
    async _saveWindowState(isOpen) {
        try {
            const windowStates = game.user.getFlag(MODULE.ID, 'windowStates') || {};
            windowStates.macros = isOpen;
            await game.user.setFlag(MODULE.ID, 'windowStates', windowStates);
        } catch (error) {
            console.error('Error saving macros window state:', error);
        }
    }

    destroy() {
        // Note: Hooks are now managed centrally by HookManager
        // No need to manually remove hooks here anymore
        this.element = null;
    }
}

// Register a Handlebars helper to always provide 5 slots
if (typeof Handlebars !== 'undefined' && !Handlebars.helpers.macrosOrPlaceholders) {
    Handlebars.registerHelper('macrosOrPlaceholders', function(macros) {
        macros = macros || [];
        return Array.from({ length: 5 }, (_, i) => macros[i] || { id: null, name: null, img: null });
    });
} 
