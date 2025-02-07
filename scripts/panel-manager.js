import { MODULE, TEMPLATES, CSS_CLASSES } from './const.js';
import { CharacterPanel } from './panel-character.js';
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
        this.characterPanel = new CharacterPanel(actor);
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'squire-tray',
            template: TEMPLATES.TRAY,
            popOut: false,
            minimizable: false,
            resizable: false,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false
        });
    }

    static async initialize(actor = null) {
        // If we have an instance and it's for the same actor, just return
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // If we already have an instance, just update it with the new actor
        if (PanelManager.instance) {
            PanelManager.currentActor = actor;
            PanelManager.instance.actor = actor;
            if (actor) {
                PanelManager.instance.characterPanel = new CharacterPanel(actor);
                PanelManager.instance.favoritesPanel = new FavoritesPanel(actor);
                PanelManager.instance.spellsPanel = new SpellsPanel(actor);
                PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            }
            await PanelManager.instance.render(true);
            return;
        }

        // Create new instance
        PanelManager.currentActor = actor;
        PanelManager.instance = new PanelManager(actor);
        await PanelManager.instance.render(true);
        
        // Apply initial settings
        PanelManager.instance._applySettings();

        // Register this application with the actor if we have one
        if (actor?.apps) {
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
        await this.characterPanel.render(this.element);
        await this.favoritesPanel.render(this.element);
        await this.spellsPanel.render(this.element);
        await this.weaponsPanel.render(this.element);
    }

    /** @override */
    close(options={}) {
        // If pinned, never close
        if (PanelManager.isPinned) return this;
        
        // If not pinned, just collapse
        this.element?.removeClass('expanded');
        return this;
    }

    activateListeners(html) {
        super.activateListeners(html);

        const tray = html;
        const handle = tray.find('.tray-handle');
        
        // Prevent any clicks within tray content from bubbling up
        tray.find('.tray-content').on('mousedown click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            return false;
        });
        
        // HP Controls
        tray.find('.death-toggle').on('mousedown click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const isDead = this.actor.system.attributes.hp.value <= 0;
            await this.actor.update({
                'system.attributes.hp.value': isDead ? 1 : 0,
                'system.attributes.death.failure': isDead ? 0 : 3
            });
            await this._updateHPDisplay();
            return false;
        });

        // Clear HP amount input on click
        tray.find('.hp-amount').on('mousedown click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            $(this).val('');
            return false;
        });

        tray.find('.hp-up, .hp-down').on('mousedown click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const isIncrease = event.currentTarget.classList.contains('hp-up');
            const hp = this.actor.system.attributes.hp;
            const inputValue = parseInt(tray.find('.hp-amount').val()) || 1;
            const change = isIncrease ? inputValue : -inputValue;
            
            await this.actor.update({
                'system.attributes.hp.value': Math.clamp(
                    hp.value + change,
                    0,
                    hp.max
                )
            });
            await this._updateHPDisplay();
            return false;
        });

        tray.find('.hp-full').on('mousedown click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const hp = this.actor.system.attributes.hp;
            await this.actor.update({
                'system.attributes.hp.value': hp.max
            });
            await this._updateHPDisplay();
            return false;
        });

        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.on('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Toggle pin state
            PanelManager.isPinned = !PanelManager.isPinned;
            tray.toggleClass('pinned');
            
            if (!PanelManager.isPinned) {
                // If unpinning, collapse the tray
                tray.removeClass('expanded');
            }

            // Handle UI movement when pinned/unpinned
            const moveUIWhenPinned = game.settings.get(MODULE.ID, 'moveUIWhenPinned');
            const uiLeft = document.querySelector('#ui-left');
            if (uiLeft && moveUIWhenPinned) {
                uiLeft.style.marginLeft = PanelManager.isPinned ? game.settings.get(MODULE.ID, 'trayWidth') : '0';
            }
            return false;
        });

        // Handle click on handle (collapse chevron)
        handle.on('click', (event) => {
            if ($(event.target).closest('.pin-button').length) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            // If pinned and clicking handle, unpin and collapse
            if (PanelManager.isPinned) {
                PanelManager.isPinned = false;
                tray.removeClass('pinned');
                
                // Update UI margin if needed
                const moveUIWhenPinned = game.settings.get(MODULE.ID, 'moveUIWhenPinned');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft && moveUIWhenPinned) {
                    uiLeft.style.marginLeft = '0';
                }
            }
            
            // Toggle expanded state
            tray.toggleClass('expanded');
            return false;
        });

        // Mouse enter/leave behavior
        const handleMouseEnter = () => {
            const openOnHover = game.settings.get(MODULE.ID, 'openOnHover');
            if (openOnHover && !PanelManager.isPinned) {
                tray.addClass('expanded');
            }
        };

        const handleMouseLeave = () => {
            if (!PanelManager.isPinned) {
                tray.removeClass('expanded');
            }
        };

        // Apply hover behaviors
        tray.on('mouseenter', handleMouseEnter);
        tray.on('mouseleave', handleMouseLeave);
    }

    _applySettings() {
        const tray = this.element;
        const content = tray.find('.panel-containers');
        
        // Apply position
        tray.attr('data-position', 'left');
        
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
            const percentage = Math.clamp((hp.value / hp.max) * 100, 0, 100);
            hpFill.css('width', `${percentage}%`);
        }
    }

    /** @override */
    _getHeaderButtons() {
        return [];
    }

    /** @override */
    _canDragStart() {
        return false;
    }

    /** @override */
    _canDragDrop() {
        return false;
    }

    /** @override */
    _onClickDocumentMouse(event) {
        // If pinned, do nothing
        if (PanelManager.isPinned) return false;
        
        // If clicking inside the tray, do nothing
        if ($(event.target).closest('.squire-tray').length) {
            return false;
        }
        
        // If clicking outside and not pinned, just collapse
        this.element?.removeClass('expanded');
        return false;
    }

    /** @override */
    _shouldClosePanels() {
        // Never let the Application close panels
        return false;
    }

    /** @override */
    _onClickPanel() {
        // Never let the Application handle panel clicks
        return false;
    }
}

// Update token selection hooks
Hooks.on('ready', async () => {
    // Find the first owned token on the canvas
    const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
    
    // Initialize with the owned token's actor, or null for default state
    await PanelManager.initialize(firstOwnedToken?.actor || null);
});

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