import { MODULE, TEMPLATES } from './const.js';
import { MacrosWindow } from './window-macros.js';
import { PanelManager } from './panel-manager.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Hide Foundry hotbar if setting is enabled
function updateHotbarVisibility() {
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

// Only call after settings are registered
Hooks.once('init', () => {
  Hooks.on('ready', updateHotbarVisibility);
  Hooks.on('renderSettingsConfig', updateHotbarVisibility);
});

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
    }

    async render(html, { showAddSlot = false } = {}) {
        console.log('SQUIRE | PANELS | MacrosPanel.render called, isPoppedOut:', this.isPoppedOut);
        // Always render into the panel container inside the placeholder if not popped out
        if (!this.isPoppedOut) {
            const placeholder = $('#macros-panel-placeholder');
            let container = placeholder.find('.panel-container[data-panel="macros"]');
            if (!container.length) {
                // Create the panel container if it doesn't exist
                container = $('<div class="panel-container" data-panel="macros"></div>');
                placeholder.append(container);
            }
            this.element = container;
            console.log('SQUIRE | PANELS | MacrosPanel.render: using container', this.element.get(0));
        } else if (html) {
            this.element = html;
            console.log('SQUIRE | PANELS | MacrosPanel.render: using html argument');
        }
        if (!this.element || this.isPoppedOut) {
            console.log('SQUIRE | PANELS | MacrosPanel.render: skipping, element missing or popped out');
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

        console.log('SQUIRE | PANELS | MacrosPanel.render: templateData', templateData);
        // Skip rendering in tray if popped out
        if (!this.element || this.isPoppedOut) {
            // If popped out, only update the window content
            if (this.isPoppedOut && this.window?.element) {
                const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
                console.log('SQUIRE | PANELS | MacrosPanel.render: rendered content (window)', content);
                this.window.element.find('.window-content').html(content);
                this._activateListeners(this.window.element);
            }
            return;
        }

        // Only render in tray if not popped out
        const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
        console.log('SQUIRE | PANELS | MacrosPanel.render: rendered content', content);
        this.element.html(content);
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element;
        const isCollapsed = game.settings.get(MODULE.ID, 'isMacrosPanelCollapsed');
        if (isCollapsed) {
            const macrosContent = panel.find('.macros-content');
            const toggle = panel.find('.macros-toggle');
            macrosContent.addClass('collapsed');
            toggle.css('transform', 'rotate(-90deg)');
        }
    }

    _activateListeners(html) {
        if (!html) return;

        const panel = html;
        let showAddSlot = false;
        let dragActive = false;

        // Toggle panel handler
        panel.find('.tray-title-small').click(() => {
            const macrosContent = panel.find('.macros-content');
            const toggle = panel.find('.macros-toggle');
            macrosContent.toggleClass('collapsed');
            toggle.css('transform', macrosContent.hasClass('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)');
            // Save collapsed state
            game.settings.set(MODULE.ID, 'isMacrosPanelCollapsed', macrosContent.hasClass('collapsed'));
        });

        // Pop-out button handler
        panel.find('.pop-out-button').click(() => this._onPopOut());

        // Open macro folder button handler
        panel.find('.open-macro-folder').click((e) => {
            e.preventDefault();
            e.stopPropagation();
            if (ui.macros && typeof ui.macros.renderPopout === 'function') ui.macros.renderPopout();
        });

        // Add drag and drop handlers for the entire macros grid
        const macrosGrid = panel.find('.macros-grid');
        macrosGrid.off('dragenter.macroDnd dragleave.macroDnd dragover.macroDnd drop.macroDnd');
        
        macrosGrid.on('dragenter.macroDnd', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dragActive) {
                dragActive = true;
                // Only show add slot if there are no empty slots
                let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                macros = macros.filter(m => m && m.id);
                this.render(undefined, { showAddSlot: true });
            }
        });
        macrosGrid.on('dragleave.macroDnd', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragActive) {
                dragActive = false;
                this.render();
            }
        });
        macrosGrid.on('dragover.macroDnd', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.originalEvent.dataTransfer.dropEffect = 'move';
        });
        macrosGrid.on('drop.macroDnd', (e) => {
            dragActive = false;
            this.render();
        });

        // Handle favorite macro click in handle
        const handle = html.find('.handle-left');
        handle.find('.handle-macro-favorite').off('click').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const macroId = $(this).data('macro-id');
            const macro = game.macros.get(macroId);
            if (macro) macro.execute();
        });

        // Macro grid interactions
        const self = this;
        panel.find('.macro-slot').each(function(idx) {
            const slot = $(this);
            // Remove any previous event listeners
            slot.off('.macroDnd');
            // Drag & drop events
            slot.on('dragstart.macroDnd', function(e) {
                if (!slot.hasClass('empty')) {
                    e.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'internal-macro',
                        fromIndex: idx
                    }));
                    // Optionally, set a drag image
                    const img = slot.find('img')[0];
                    if (img) e.originalEvent.dataTransfer.setDragImage(img, 16, 16);
                }
            });
            slot.attr('draggable', !slot.hasClass('empty'));

            // Restore dragover, dragenter, dragleave for drop to work and feedback
            slot.on('dragover.macroDnd', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.originalEvent.dataTransfer.dropEffect = 'move';
            });
            slot.on('dragenter.macroDnd', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.addClass('dragover');
            });
            slot.on('dragleave.macroDnd', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.removeClass('dragover');
            });

            slot.on('drop.macroDnd', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                slot.removeClass('dragover');
                let data;
                try {
                    data = JSON.parse(e.originalEvent.dataTransfer.getData('text/plain'));
                } catch (error) {
                    ui.notifications.warn('Invalid drag data.');
                    return;
                }
                // Internal reorder
                if (data.type === 'internal-macro' && typeof data.fromIndex === 'number') {
                    if (data.fromIndex === idx) return; // No-op if dropped on itself
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
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
                // External drop (existing logic)
                const macroId = data.id || data.data?.id || data.uuid?.split('.').pop();
                const isMacro = data.type === 'Macro' || data.data?.type === 'Macro' || data.uuid?.startsWith('Macro.');
                if (isMacro && macroId) {
                    const macro = game.macros.get(macroId);
                    if (macro) {
                        let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                        macros = macros.filter(m => m && m.id);
                        // If dropped on add slot, push new macro
                        if (slot.hasClass('add-slot')) {
                            macros.push({ id: macro.id, name: macro.name, img: macro.img });
                        } else {
                            macros[idx] = { id: macro.id, name: macro.name, img: macro.img };
                        }
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
            // Left click: run macro
            slot.on('click.macroDnd', async function(e) {
                if (slot.hasClass('empty')) return;
                if (e.button === 0) {
                    let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    const macroId = macros[idx]?.id;
                    const macro = game.macros.get(macroId);
                    if (macro) {
                        // Show loader animation
                        if (!slot.find('.macro-loader').length) {
                            slot.append('<span class="macro-loader"><i class="fas fa-sun macro-spinner"></i></span>');
                        }
                        slot.addClass('loading');
                        setTimeout(() => {
                            slot.removeClass('loading');
                            slot.find('.macro-loader').remove();
                        }, 600);
                        macro.execute();
                    }
                }
            });
            // Right click: clear macro or remove slot
            slot.on('contextmenu.macroDnd', async function(e) {
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
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'MACROS | Slot is empty, removing slot',
                        { macros, idx },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
                    if (macros.length > 1) {
                        removedMacroId = macros[idx]?.id || null;
                        macros.splice(idx, 1);
                    }
                }
                // Always leave at least one slot
                if (macros.length === 0) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        'MACROS | Last slot detected, leaving it empty',
                        { macros },
                        false,
                        false,
                        false,
                        MODULE.TITLE
                    );
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
                // Ensure we update the handle in case a favorite macro was deleted
                const panelManager = PanelManager.instance;
                if (panelManager) {
                    await panelManager.updateHandle();
                }
            });
            // Middle click or Shift+Left click: toggle favorite
            slot.on('mousedown.macroDnd', async function(e) {
                if (!slot.hasClass('empty') && (e.button === 1 || (e.button === 0 && e.shiftKey))) {
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
                    // Ensure we update the handle immediately after toggling favorite
                    const panelManager = PanelManager.instance;
                    if (panelManager) {
                        await panelManager.updateHandle();
                    }
                }
            });
        });
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Empty the panel container but keep the placeholder
        const container = $('#macros-panel-placeholder .panel-container[data-panel="macros"]');
        if (container.length) {
            container.empty();
        }

        // Set state before creating window
        MacrosPanel.isWindowOpen = true;
        this.isPoppedOut = true;
        await this._saveWindowState(true);

        // Create and render the window
        this.window = new MacrosWindow({ panel: this });
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

        // Re-render into the panel container inside the placeholder
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
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error saving macros window state',
                { error, isOpen },
                false,
                true,
                true,
                MODULE.TITLE
            );
        }
    }
}

// Register a Handlebars helper to always provide 5 slots
if (typeof Handlebars !== 'undefined' && !Handlebars.helpers.macrosOrPlaceholders) {
    Handlebars.registerHelper('macrosOrPlaceholders', function(macros) {
        macros = macros || [];
        return Array.from({ length: 5 }, (_, i) => macros[i] || { id: null, name: null, img: null });
    });
} 