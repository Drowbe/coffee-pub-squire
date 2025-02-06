import { MODULE, TEMPLATES, PANELS, CSS_CLASSES } from './const.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { FavoritesPanel } from './panel-favorites.js';

export class PanelManager extends Application {
    static instance = null;
    static currentActor = null;
    static isPinned = false;

    constructor(actor) {
        super();
        this.actor = actor;
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
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

        // If we already have an instance, just update it with the new actor
        if (PanelManager.instance) {
            PanelManager.currentActor = actor;
            PanelManager.instance.actor = actor;
            PanelManager.instance.favoritesPanel = new FavoritesPanel(actor);
            PanelManager.instance.spellsPanel = new SpellsPanel(actor);
            PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            await PanelManager.instance.render(true);
            
            // Set active panel after updating
            const rememberLast = game.settings.get(MODULE.ID, 'rememberLastPanel');
            const panelId = rememberLast ? 
                game.settings.get(MODULE.ID, 'lastActivePanel') : 
                game.settings.get(MODULE.ID, 'defaultPanel');
            PanelManager.instance._switchPanel(panelId);
            return;
        }

        // Create new instance only if one doesn't exist
        PanelManager.currentActor = actor;
        PanelManager.instance = new PanelManager(actor);
        await PanelManager.instance.render(true);
        
        // Apply initial settings
        PanelManager.instance._applySettings();
        
        // Set initial active panel
        const rememberLast = game.settings.get(MODULE.ID, 'rememberLastPanel');
        const panelId = rememberLast ? 
            game.settings.get(MODULE.ID, 'lastActivePanel') : 
            game.settings.get(MODULE.ID, 'defaultPanel');
        PanelManager.instance._switchPanel(panelId);

        // Register this application with the actor
        if (actor.apps) {
            actor.apps[PanelManager.instance.appId] = PanelManager.instance;
        }
    }

    static async toggleTray() {
        if (!PanelManager.instance) return;
        const tray = PanelManager.instance.element;
        
        tray.toggleClass('expanded');
    }

    async _render(force = false, options = {}) {
        await super._render(force, options);
        
        // Apply position immediately after rendering
        const position = game.settings.get(MODULE.ID, 'trayPosition');
        this.element.attr('data-position', position);
        
        // Render all panels
        await this.favoritesPanel.render(this.element);
        await this.spellsPanel.render(this.element);
        await this.weaponsPanel.render(this.element);

        // Set initial active panel if none is visible
        if (!this.element.find('.panel-container.panel-visible').length) {
            const rememberLast = game.settings.get(MODULE.ID, 'rememberLastPanel');
            const panelId = rememberLast ? 
                game.settings.get(MODULE.ID, 'lastActivePanel') : 
                game.settings.get(MODULE.ID, 'defaultPanel');
            this._switchPanel(panelId);
        }

        // Log current state for debugging
        console.log(`${MODULE.TITLE} | Tray rendered with position:`, position);
    }

    activateListeners(html) {
        super.activateListeners(html);

        const tray = html;
        const handle = tray.find('.tray-handle');
        
        console.log(`${MODULE.TITLE} | Activating listeners with position:`, 'left');
        
        // HP Controls
        tray.find('.death-toggle').click(async () => {
            const isDead = this.actor.system.attributes.hp.value <= 0;
            await this.actor.update({
                'system.attributes.hp.value': isDead ? 1 : 0,
                'system.attributes.death.failure': isDead ? 0 : 3
            });
            await this._updateHPDisplay();
        });

        // Clear HP amount input on click
        tray.find('.hp-amount').click(function() {
            $(this).val('');
        });

        tray.find('.hp-up, .hp-down').click(async (event) => {
            const isIncrease = event.currentTarget.classList.contains('hp-up');
            const hp = this.actor.system.attributes.hp;
            const inputValue = parseInt(tray.find('.hp-amount').val()) || 1;
            const change = isIncrease ? inputValue : -inputValue;
            
            await this.actor.update({
                'system.attributes.hp.value': Math.clamped(
                    hp.value + change,
                    0,
                    hp.max
                )
            });
            await this._updateHPDisplay();
        });

        tray.find('.hp-full').click(async () => {
            const hp = this.actor.system.attributes.hp;
            await this.actor.update({
                'system.attributes.hp.value': hp.max
            });
            await this._updateHPDisplay();
        });

        // Ability Score Buttons
        tray.find('.ability-btn').click(async (event) => {
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilityTest(ability);
        });

        tray.find('.ability-btn').contextmenu(async (event) => {
            event.preventDefault();
            const ability = event.currentTarget.dataset.ability;
            await this.actor.rollAbilitySave(ability);
        });

        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.click((event) => {
            event.stopPropagation();
            PanelManager.isPinned = !PanelManager.isPinned;
            tray.toggleClass('pinned');
            
            if (PanelManager.isPinned) {
                tray.addClass('expanded');
            } else {
                tray.removeClass('expanded');
            }
        });

        // Handle click on handle
        handle.click((event) => {
            if ($(event.target).closest('.pin-button').length) return;
            this.constructor.toggleTray();
        });

        // Only apply hover behavior if not pinned
        let hoverTimeout;
        const clearHoverTimeout = () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
        };

        const handleMouseEnter = () => {
            clearHoverTimeout();
            if (!PanelManager.isPinned) {
                tray.addClass('expanded');
            }
        };

        const handleMouseLeave = (event) => {
            clearHoverTimeout();
            if (!PanelManager.isPinned) {
                hoverTimeout = setTimeout(() => {
                    if (!tray[0].contains(document.activeElement) && !tray[0].matches(':hover')) {
                        tray.removeClass('expanded');
                    }
                }, 100);
            }
        };

        if (!PanelManager.isPinned) {
            tray.on('mouseenter', handleMouseEnter);
            tray.on('mouseleave', handleMouseLeave);
        }
    }

    _switchPanel(panelId) {
        const html = this.element;
        if (!html) return;  // Guard against missing element
        
        console.log(`${MODULE.TITLE} | Switching to panel:`, panelId);

        // Update panel visibility
        html.find('.panel-container').removeClass(CSS_CLASSES.PANEL_VISIBLE);
        const targetPanel = html.find(`.panel-container[data-panel="${panelId}"]`);
        targetPanel.addClass(CSS_CLASSES.PANEL_VISIBLE);
        
        // Verify panel visibility
        console.log(`${MODULE.TITLE} | Panel visibility:`, {
            panelId,
            isVisible: targetPanel.hasClass(CSS_CLASSES.PANEL_VISIBLE),
            panel: targetPanel[0]
        });
    }

    _applySettings() {
        const tray = this.element;
        const content = tray.find('.panel-containers');
        
        // Apply position
        tray.attr('data-position', 'left');
        console.log(`${MODULE.TITLE} | Applying position: left`);
        
        // Apply height
        content.css('max-height', '80vh');
        
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
            actor: this.actor,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        };
    }

    async _updateHPDisplay() {
        const hp = this.actor.system.attributes.hp;
        const hpBar = this.element.find('.hp-bar');
        const hpValue = hpBar.find('.hp-current .hp-value');
        const hpMax = hpBar.find('.hp-max .hp-value');
        const hpFill = hpBar.find('.hp-fill');
        
        if (hpValue.length && hpMax.length && hpFill.length) {
            hpValue.text(hp.value);
            hpMax.text(hp.max);
            const percentage = Math.clamped((hp.value / hp.max) * 100, 0, 100);
            hpFill.css('width', `${percentage}%`);
        }
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