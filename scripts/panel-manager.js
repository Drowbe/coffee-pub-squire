import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { CharacterPanel } from './panel-character.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { FavoritesPanel } from './panel-favorites.js';

export class PanelManager {
    static instance = null;
    static currentActor = null;
    static isPinned = false;
    static element = null;

    constructor(actor) {
        this.actor = actor;
        this.characterPanel = new CharacterPanel(actor);
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
    }

    static async initialize(actor = null) {
        // If we have an instance with the same actor, do nothing
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // Create or update instance
        PanelManager.currentActor = actor;
        if (!PanelManager.instance) {
            PanelManager.instance = new PanelManager(actor);
            await PanelManager.instance.createTray();
        } else {
            PanelManager.instance.actor = actor;
            PanelManager.instance.characterPanel = new CharacterPanel(actor);
            PanelManager.instance.favoritesPanel = new FavoritesPanel(actor);
            PanelManager.instance.spellsPanel = new SpellsPanel(actor);
            PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            await PanelManager.instance.updateTray();
        }
    }

    async createTray() {
        // Create the tray if it doesn't exist
        if (!document.getElementById('squire-tray')) {
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { actor: this.actor });
            const trayElement = $(trayHtml);
            $('body').append(trayElement);
            PanelManager.element = trayElement;
            
            // Set initial position and restore pin state
            trayElement.attr('data-position', 'left');
            PanelManager.isPinned = game.settings.get(MODULE.ID, 'isPinned');
            if (PanelManager.isPinned) {
                trayElement.addClass('pinned expanded');
            }

            this.activateListeners(trayElement);
            await this.renderPanels(trayElement);
        }
    }

    async updateTray() {
        if (PanelManager.element) {
            await this.renderPanels(PanelManager.element);
        }
    }

    async renderPanels(element) {
        await this.characterPanel.render(element);
        await this.favoritesPanel.render(element);
        await this.spellsPanel.render(element);
        await this.weaponsPanel.render(element);
    }

    activateListeners(tray) {
        const handle = tray.find('.tray-handle');
        
        // Handle click on handle (collapse chevron)
        handle.on('click', (event) => {
            if ($(event.target).closest('.pin-button').length) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            if (PanelManager.isPinned) {
                ui.notifications.warn("You have the tray pinned open. Unpin the tray to close it.");
                return false;
            }
            
            tray.toggleClass('expanded');
            return false;
        });

        // Pin button handling
        const pinButton = handle.find('.pin-button');
        pinButton.on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            PanelManager.isPinned = !PanelManager.isPinned;
            await game.settings.set(MODULE.ID, 'isPinned', PanelManager.isPinned);
            
            if (PanelManager.isPinned) {
                tray.addClass('pinned expanded');
                // Update UI margin when pinned
                const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${trayWidth - parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            } else {
                tray.removeClass('pinned expanded');
                // Reset UI margin when unpinned
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = SQUIRE.TRAY_OFFSET_WIDTH;
                }
            }
            
            return false;
        });
    }
}

// Hooks
Hooks.on('ready', async () => {
    const firstOwnedToken = canvas.tokens?.placeables.find(token => token.actor?.isOwner);
    await PanelManager.initialize(firstOwnedToken?.actor || null);
});

Hooks.on('controlToken', async (token, controlled) => {
    // Only care about token selection, not deselection
    if (!controlled) return;
    
    // Only proceed if it's a GM or the token owner
    if (!game.user.isGM && !token.actor?.isOwner) return;

    // If not pinned, handle the animation sequence
    if (!PanelManager.isPinned && PanelManager.element) {
        PanelManager.element.removeClass('expanded');
        await PanelManager.initialize(token.actor);
        PanelManager.element.addClass('expanded');
        return;
    }

    // If pinned, just update the data immediately
    await PanelManager.initialize(token.actor);
});

// Also handle when tokens are deleted or actors are updated
Hooks.on('deleteToken', (token) => {
    if (PanelManager.currentActor?.id === token.actor?.id) {
        PanelManager.instance = null;
        PanelManager.currentActor = null;
    }
});

Hooks.on('updateActor', (actor) => {
    if (PanelManager.currentActor?.id === actor.id) {
        PanelManager.initialize(actor);
    }
}); 