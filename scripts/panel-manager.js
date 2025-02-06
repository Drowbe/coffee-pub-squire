import { MODULE, TEMPLATES, PANELS, CSS_CLASSES } from './const.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InfoPanel } from './panel-info.js';

export class PanelManager extends Application {
    static instance = null;
    static currentActor = null;
    static isPinned = false;

    constructor(actor) {
        super();
        this.actor = actor;
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
        this.infoPanel = new InfoPanel(actor);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'squire-tray',
            template: TEMPLATES.TRAY,
            popOut: false,
            minimizable: false,
            resizable: false
        });
    }

    static async initialize(actor) {
        // If we have an instance and it's for the same actor, just return
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // If we have a pinned instance, update its actor instead of creating new
        if (PanelManager.instance && PanelManager.isPinned) {
            PanelManager.currentActor = actor;
            PanelManager.instance.actor = actor;
            PanelManager.instance.spellsPanel = new SpellsPanel(actor);
            PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            PanelManager.instance.infoPanel = new InfoPanel(actor);
            await PanelManager.instance.render(true);
            return;
        }

        // Create new instance for new actor
        PanelManager.currentActor = actor;
        PanelManager.instance = new PanelManager(actor);
        await PanelManager.instance.render(true);
        
        // Apply initial settings
        PanelManager.instance._applySettings();
    }

    static async toggleTray() {
        if (!PanelManager.instance) return;
        const tray = PanelManager.instance.element;
        tray.toggleClass('expanded');
        
        if (tray.hasClass('expanded')) {
            // Set active panel based on settings
            const rememberLast = game.settings.get(MODULE.ID, 'rememberLastPanel');
            const panelId = rememberLast ? 
                game.settings.get(MODULE.ID, 'lastActivePanel') : 
                game.settings.get(MODULE.ID, 'defaultPanel');
                
            PanelManager.instance._switchPanel(panelId);
        }
    }

    async _render(force = false, options = {}) {
        await super._render(force, options);
        
        // Render all panels
        await this.spellsPanel.render(this.element);
        await this.weaponsPanel.render(this.element);
        await this.infoPanel.render(this.element);
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle hover behavior
        const tray = html;
        const handle = tray.find('.tray-handle');
        
        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.click((event) => {
            event.stopPropagation(); // Prevent tray toggle
            PanelManager.isPinned = !PanelManager.isPinned;
            tray.toggleClass('pinned');
            
            if (PanelManager.isPinned) {
                tray.addClass('expanded');
                // Set active panel if none is active
                if (!tray.find('.tab-item.tab-active').length) {
                    const defaultPanel = game.settings.get(MODULE.ID, 'defaultPanel');
                    this._switchPanel(defaultPanel);
                }
            } else {
                tray.removeClass('expanded');
            }
        });

        // Only apply hover behavior if not pinned
        const applyHoverBehavior = () => {
            if (!PanelManager.isPinned) {
                // Open on hover
                handle.hover(
                    () => {
                        if (!PanelManager.isPinned) {
                            tray.addClass('expanded');
                            // Set active panel if none is active
                            if (!tray.find('.tab-item.tab-active').length) {
                                const defaultPanel = game.settings.get(MODULE.ID, 'defaultPanel');
                                this._switchPanel(defaultPanel);
                            }
                        }
                    },
                    () => {
                        // Only close if we're not hovering the content and not pinned
                        if (!PanelManager.isPinned && !tray.find('.tray-content:hover').length) {
                            tray.removeClass('expanded');
                        }
                    }
                );

                // Keep open while hovering content
                tray.find('.tray-content').hover(
                    () => {
                        if (!PanelManager.isPinned) {
                            tray.addClass('expanded');
                            // Set active panel if none is active
                            if (!tray.find('.tab-item.tab-active').length) {
                                const defaultPanel = game.settings.get(MODULE.ID, 'defaultPanel');
                                this._switchPanel(defaultPanel);
                            }
                        }
                    },
                    () => !PanelManager.isPinned && tray.removeClass('expanded')
                );
            }
        };

        applyHoverBehavior();

        // Handle click on handle (for mobile)
        handle.click((event) => {
            if ($(event.target).closest('.pin-button').length) return;
            if (!PanelManager.isPinned) {
                this.constructor.toggleTray();
            }
        });

        // Tab switching
        html.find('.tab-item').click(event => {
            const tab = event.currentTarget;
            const panelId = tab.dataset.tab;
            this._switchPanel(panelId);
            
            // Save last active panel if enabled
            if (game.settings.get(MODULE.ID, 'rememberLastPanel')) {
                game.settings.set(MODULE.ID, 'lastActivePanel', panelId);
            }
        });
    }

    _switchPanel(panelId) {
        const html = this.element;
        
        // Update tab states
        html.find('.tab-item').removeClass(CSS_CLASSES.TAB_ACTIVE);
        html.find(`.tab-item[data-tab="${panelId}"]`).addClass(CSS_CLASSES.TAB_ACTIVE);

        // Update panel visibility
        html.find('.panel-container').removeClass(CSS_CLASSES.PANEL_VISIBLE);
        html.find(`.panel-container[data-panel="${panelId}"]`).addClass(CSS_CLASSES.PANEL_VISIBLE);
    }

    _applySettings() {
        const tray = this.element;
        const content = tray.find('.panel-containers');
        
        // Apply position
        const position = game.settings.get(MODULE.ID, 'trayPosition');
        tray.attr('data-position', position);
        
        // Apply height
        const height = game.settings.get(MODULE.ID, 'panelHeight');
        content.css('max-height', `${height}px`);
        
        // Apply theme
        const theme = game.settings.get(MODULE.ID, 'theme');
        tray.attr('data-theme', theme);
        
        // Apply custom theme if selected
        if (theme === 'custom') {
            try {
                const colors = JSON.parse(game.settings.get(MODULE.ID, 'customThemeColors'));
                const style = document.getElementById('squire-custom-theme') || document.createElement('style');
                style.id = 'squire-custom-theme';
                
                const css = `
                    .squire-tray[data-theme="custom"] {
                        background: ${colors.background};
                        color: ${colors.text};
                        border-color: ${colors.border};
                    }
                    .squire-tray[data-theme="custom"] .tab-item.tab-active {
                        background: ${colors.accent};
                    }
                    .squire-tray[data-theme="custom"] .cast-spell,
                    .squire-tray[data-theme="custom"] .weapon-attack {
                        background: ${colors.accent};
                    }
                `;
                
                style.textContent = css;
                document.head.appendChild(style);
            } catch (e) {
                console.error(`${MODULE.TITLE} | Error applying custom theme:`, e);
            }
        }
    }

    getData() {
        return {
            panels: PANELS,
            actor: this.actor
        };
    }
}

// Update token selection hooks
Hooks.on('controlToken', (token, controlled) => {
    if (controlled && token.actor) {
        PanelManager.initialize(token.actor);
    }
});

// Also handle when tokens are deleted or actors are updated
Hooks.on('deleteToken', (token) => {
    if (PanelManager.currentActor?.id === token.actor?.id) {
        PanelManager.instance?.close();
        PanelManager.instance = null;
        PanelManager.currentActor = null;
    }
});

Hooks.on('updateActor', (actor) => {
    if (PanelManager.currentActor?.id === actor.id) {
        PanelManager.initialize(actor);
    }
}); 