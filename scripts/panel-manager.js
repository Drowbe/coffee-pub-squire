import { MODULE, TEMPLATES, PANELS, CSS_CLASSES } from './const.js';

export class PanelManager extends Application {
    static instance = null;

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'squire-tray',
            template: TEMPLATES.TRAY,
            popOut: false,
            minimizable: false,
            resizable: false
        });
    }

    static async initialize() {
        PanelManager.instance = new PanelManager();
        await PanelManager.instance.render(true);
        
        // Initially hide the tray
        PanelManager.instance.element.hide();
        
        // Apply initial settings
        PanelManager.instance._applySettings();
        
        // Set up auto-hide if enabled
        if (game.settings.get(MODULE.ID, 'autoHide')) {
            $(document).on('click', (event) => {
                const tray = PanelManager.instance.element[0];
                if (tray && !tray.contains(event.target)) {
                    PanelManager.instance.element.slideUp(200);
                }
            });
        }
    }

    static async toggleTray() {
        if (!PanelManager.instance) return;
        const tray = PanelManager.instance.element;
        
        if (tray.is(':visible')) {
            tray.slideUp(200);
        } else {
            tray.slideDown(200);
            
            // Set active panel based on settings
            const rememberLast = game.settings.get(MODULE.ID, 'rememberLastPanel');
            const panelId = rememberLast ? 
                game.settings.get(MODULE.ID, 'lastActivePanel') : 
                game.settings.get(MODULE.ID, 'defaultPanel');
                
            PanelManager.instance._switchPanel(panelId);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

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
        const content = tray.find('.tray-content');
        
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
            panels: PANELS
        };
    }
} 