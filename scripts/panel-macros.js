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

    async render(html) {
        // Load macros from settings
        let macros = game.settings.get(MODULE.ID, 'userMacros') || [];

        if (html) {
            this.element = html;
        }
        // Skip rendering in tray if popped out
        if (!this.element || this.isPoppedOut) return;

        const templateData = {
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            isMacrosPopped: this.isPoppedOut,
            macros
        };

        // If popped out, only update the window content and don't render in tray
        if (this.isPoppedOut) {
            if (this.window?.element) {
                const content = await renderTemplate(TEMPLATES.PANEL_MACROS, templateData);
                this.window.element.find('[data-panel="macros"]').html(content);
                this._activateListeners(this.window.element);
            }
            return; // Don't render in tray if popped out
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

        // Add drag and drop handlers for the entire macros grid
        const macrosGrid = panel.find('.macros-grid');
        macrosGrid.off('dragenter.macroDnd dragleave.macroDnd dragover.macroDnd drop.macroDnd');
        
        macrosGrid.on('dragenter.macroDnd', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Add a new slot if we're dragging over the grid
            const macros = game.settings.get(MODULE.ID, 'userMacros') || [];
            if (!macros.find(m => !m.id)) {
                macros.push({ id: null, name: null, img: null });
                game.settings.set(MODULE.ID, 'userMacros', macros);
                this.render();
            }
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
                try {
                    const data = JSON.parse(e.originalEvent.dataTransfer.getData('text/plain'));
                    if (data.type === 'Macro') {
                        slot.addClass('dragover');
                        // Play hover sound
                        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                        if (blacksmith) {
                            const sound = game.settings.get(MODULE.ID, 'dragEnterSound');
                            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                        }
                    }
                } catch (error) {
                    // If we can't parse the data yet, still show hover state
                    slot.addClass('dragover');
                }
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
                try {
                    const dataTransfer = e.originalEvent.dataTransfer.getData('text/plain');
                    console.log("SQUIRE | MACROS | Raw drop data:", dataTransfer);
                    
                    let data;
                    try {
                        data = JSON.parse(dataTransfer);
                        console.log("SQUIRE | MACROS | Parsed drop data:", data);
                    } catch (error) {
                        console.error("SQUIRE | MACROS | Error parsing drop data:", error);
                        ui.notifications.warn('Invalid drag data.');
                        return;
                    }

                    // Check for macro data in various formats
                    const macroId = data.id || data.data?.id || data.uuid?.split('.').pop();
                    const isMacro = data.type === 'Macro' || data.data?.type === 'Macro' || data.uuid?.startsWith('Macro.');
                    
                    if (isMacro && macroId) {
                        const macro = game.macros.get(macroId);
                        if (macro) {
                            let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                            // If dropping on the last empty slot, add a new one
                            if (idx === macros.length - 1 && !macros[idx].id) {
                                macros.push({ id: null, name: null, img: null });
                            }
                            macros[idx] = { id: macro.id, name: macro.name, img: macro.img };
                            await game.settings.set(MODULE.ID, 'userMacros', macros);
                            
                            // Update both tray and window if popped out
                            if (self.isPoppedOut && self.window) {
                                // Update window's macros data
                                self.window.macros = macros;
                                // Re-render the window
                                await self.window.render(false);
                            }
                            // Always re-render the tray
                            await self.render();
                            
                            // Play drop sound
                            const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                            if (blacksmith) {
                                const sound = game.settings.get(MODULE.ID, 'dropSound');
                                blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                            }
                        } else {
                            console.error("SQUIRE | MACROS | Macro not found:", macroId);
                            ui.notifications.warn('Macro not found.');
                        }
                    } else {
                        console.error("SQUIRE | MACROS | Invalid drop data:", data);
                        ui.notifications.warn('Only macros can be dropped here.');
                    }
                } catch (error) {
                    console.error('SQUIRE | MACROS | Error handling drop:', error);
                    ui.notifications.error('Error handling macro drop. See console for details.');
                }
            });
            // Left click: run macro
            slot.on('click.macroDnd', async function(e) {
                if (slot.hasClass('empty')) return;
                if (e.button === 0) {
                    const macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                    const macroId = macros[idx]?.id;
                    const macro = game.macros.get(macroId);
                    if (macro) macro.execute();
                }
            });
            // Right click: clear slot
            slot.on('contextmenu.macroDnd', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
                // Remove the slot and any trailing empty slots
                macros.splice(idx, 1);
                while (macros.length > 0 && !macros[macros.length - 1].id) {
                    macros.pop();
                }
                await game.settings.set(MODULE.ID, 'userMacros', macros);
                
                // Update both tray and window if popped out
                if (self.isPoppedOut && self.window) {
                    // Update window's macros data
                    self.window.macros = macros;
                    // Re-render the window
                    await self.window.render(false);
                }
                // Always re-render the tray
                await self.render();
                
                // Play drop sound for feedback
                const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                if (blacksmith) {
                    const sound = game.settings.get(MODULE.ID, 'dropSound');
                    blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                }
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

        // Find the correct insertion point - after dice tray panel
        const diceTrayPanel = mainTray.find('[data-panel="dicetray"]').closest('.panel-container');
        const macrosContainer = $('<div class="panel-container" data-panel="macros"></div>');
        
        // Insert after dice tray if found, otherwise before the stacked panels
        if (diceTrayPanel.length) {
            macrosContainer.insertAfter(diceTrayPanel);
        } else {
            const stackedPanels = mainTray.find('.panel-containers.stacked');
            if (stackedPanels.length) {
                macrosContainer.insertBefore(stackedPanels);
            } else {
                // Fallback - append to tray content
                mainTray.find('.tray-content').append(macrosContainer);
            }
        }

        try {
            // Get current macros from settings
            let macros = game.settings.get(MODULE.ID, 'userMacros') || [];
            macros = Array.from({ length: 5 }, (_, i) => macros[i] || { id: null, name: null, img: null });

            // Render the content into the new container
            const templateData = {
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                actor: this.actor,
                isMacrosPopped: false,
                macros
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