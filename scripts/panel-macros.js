import { MODULE, TEMPLATES } from './const.js';
import { MacrosWindow } from './window-macros.js';

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
        // Load macros from settings
        let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
        // Do NOT filter macros here! Always pass the full array to the template.
        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isMacrosPopped: this.isPoppedOut,
            macros,
            showAddSlot
        };

        if (html) {
            this.element = html;
        }
        // Skip rendering in tray if popped out
        if (!this.element || this.isPoppedOut) {
            // If popped out, only update the window content
            if (this.isPoppedOut && this.window?.element) {
                const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
                this.window.element.find('[data-panel="macros"]').html(content);
                this._activateListeners(this.window.element);
            }
            return;
        }

        // Only render in tray if not popped out
        const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
        this.element.find('[data-panel="macros"]').html(content);
        this._activateListeners(this.element);

        // Apply saved collapsed state
        const panel = this.element.find('[data-panel="macros"]');
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

        const panel = html.find('[data-panel="macros"]');
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
            e.originalEvent.dataTransfer.dropEffect = 'copy';
        });
        macrosGrid.on('drop.macroDnd', (e) => {
            dragActive = false;
            this.render();
        });

        // Macro grid interactions
        const self = this;
        panel.find('.macro-slot').each(function(idx) {
            const slot = $(this);
            // Remove any previous event listeners
            slot.off('.macroDnd');
            // Drag & drop events
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
            slot.on('dragover.macroDnd', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.originalEvent.dataTransfer.dropEffect = 'copy';
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
                // Debug: print the slot object
                console.log('SQUIRE | MACROS | Slot object at idx', idx, macros[idx]);
                // Treat as having a macro only if id is a non-empty string
                if (macros[idx] && typeof macros[idx].id === 'string' && macros[idx].id.length > 0) {
                    // If slot has a macro, clear it
                    console.log('SQUIRE | MACROS | Slot has a macro, clearing macro');
                    macros[idx] = { id: null, name: null, img: null };
                } else {
                    // Else (slot is empty), remove it (unless it's the last slot)
                    console.log('SQUIRE | MACROS | Slot is empty, removing slot');
                    if (macros.length > 1) {
                        macros.splice(idx, 1);
                    }
                }
                // Always leave at least one slot
                if (macros.length === 0) {
                    console.log('SQUIRE | MACROS | Last slot detected, leaving it empty');
                    macros = [{ id: null, name: null, img: null }];
                }
                await game.settings.set(MODULE.ID, 'userMacros', macros);
                if (self.isPoppedOut && self.window) {
                    self.window.macros = macros;
                    await self.window.render(false);
                }
                await self.render();
            });
        });
    }

    async _onPopOut() {
        if (this.window || this.isPoppedOut) return;

        // Set state before creating window
        MacrosPanel.isWindowOpen = true;
        this.isPoppedOut = true;

        // Remove the entire panel structure first
        if (this.element) {
            // Find and remove the panel container
            const container = this.element.find('[data-panel="macros"]').closest('.panel-container');
            // Store previous sibling for reinsertion
            this.previousSibling = container.prev();
            if (container.length) {
                // Also check for and remove any wrapper divs that might be left behind
                const wrappers = container.parents().filter(function() {
                    // Only target empty wrappers that are specific to the macros panel
                    return ($(this).children().length === 0 || 
                           ($(this).children().length === 1 && $(this).find('[data-panel="macros"]').length > 0)) &&
                           !$(this).is('.squire-tray'); // Don't remove the main tray
                });
                wrappers.remove();
                container.remove();
            }
        }

        // Create and render the window
        this.window = new MacrosWindow({ 
            panel: this,
            macros: game.settings.get(MODULE.ID, 'userMacros') || []
        });
        MacrosPanel.activeWindow = this.window;
        await this.window.render(true);
    }

    async returnToTray() {
        if (!this.isPoppedOut) return; // Don't do anything if not popped out

        // Reset state
        MacrosPanel.isWindowOpen = false;
        MacrosPanel.activeWindow = null;
        this.window = null;
        this.isPoppedOut = false;

        // Check if macros panel is enabled in settings
        const isMacrosEnabled = game.settings.get(MODULE.ID, 'showMacrosPanel');
        if (!isMacrosEnabled) {
            return; // Don't return to tray if panel is disabled
        }

        // Get a fresh reference to the main tray
        const mainTray = $('.squire-tray');
        if (!mainTray.length) {
            console.error(`${MODULE.ID} | Could not find main tray when returning macros panel`);
            return;
        }

        // Update our element reference
        this.element = mainTray;

        // Create the new panel container
        const macrosContainer = $('<div class="panel-container" data-panel="macros"></div>');
        
        // Insert at the stored position
        if (this.previousSibling && this.previousSibling.length) {
            if (this.previousSibling.is('.squire-tray')) {
                // If the previous sibling was the tray itself, we were first
                this.previousSibling.find('.tray-content').prepend(macrosContainer);
            } else {
                // Otherwise insert after the stored sibling
                macrosContainer.insertAfter(this.previousSibling);
            }
        } else {
            // Fallback to prepending to tray content if no position info
            mainTray.find('.tray-content').prepend(macrosContainer);
        }

        try {
            // Get current macros from settings and filter
            let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
            macros = macros.filter(m => m && m.id);

            // Render the content into the new container
            const templateData = {
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                actor: this.actor,
                isMacrosPopped: false,
                macros,
                showAddSlot: false
            };
            const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
            macrosContainer.html(content);
            
            // Activate listeners on the new content
            this._activateListeners(mainTray);
        } catch (error) {
            console.error(`${MODULE.ID} | Error returning macros panel to main tray:`, error);
            ui.notifications.error("Error returning macros panel to main tray");
        }
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
}

// Register a Handlebars helper to always provide 5 slots
if (typeof Handlebars !== 'undefined' && !Handlebars.helpers.macrosOrPlaceholders) {
    Handlebars.registerHelper('macrosOrPlaceholders', function(macros) {
        macros = macros || [];
        return Array.from({ length: 5 }, (_, i) => macros[i] || { id: null, name: null, img: null });
    });
} 