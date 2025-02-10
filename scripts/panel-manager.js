import { MODULE, TEMPLATES, CSS_CLASSES, SQUIRE } from './const.js';
import { CharacterPanel } from './panel-character.js';
import { SpellsPanel } from './panel-spells.js';
import { WeaponsPanel } from './panel-weapons.js';
import { InventoryPanel } from './panel-inventory.js';
import { FavoritesPanel } from './panel-favorites.js';
import { ControlPanel } from './panel-control.js';

export class PanelManager {
    static instance = null;
    static currentActor = null;
    static isPinned = false;
    static element = null;

    constructor(actor) {
        this.actor = actor;
        this.characterPanel = new CharacterPanel(actor);
        this.controlPanel = new ControlPanel(actor);
        this.favoritesPanel = new FavoritesPanel(actor);
        this.spellsPanel = new SpellsPanel(actor);
        this.weaponsPanel = new WeaponsPanel(actor);
        this.inventoryPanel = new InventoryPanel(actor);
    }

    static async initialize(actor = null) {
        // If we have an instance with the same actor, do nothing
        if (PanelManager.instance && PanelManager.currentActor?.id === actor?.id) return;

        // Log actor data for debugging conditions
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Actor Data for Conditions",
            {
                conditions: actor?.system?.conditions,
                effects: actor?.effects?.map(e => e.label),
                statuses: actor?.statuses,
                flags: actor?.flags
            },
            false,
            true,
            false
        );

        // Create or update instance
        PanelManager.currentActor = actor;
        if (!PanelManager.instance) {
            PanelManager.instance = new PanelManager(actor);
            await PanelManager.instance.createTray();
        } else {
            PanelManager.instance.actor = actor;
            PanelManager.instance.characterPanel = new CharacterPanel(actor);
            PanelManager.instance.controlPanel = new ControlPanel(actor);
            PanelManager.instance.favoritesPanel = new FavoritesPanel(actor);
            PanelManager.instance.spellsPanel = new SpellsPanel(actor);
            PanelManager.instance.weaponsPanel = new WeaponsPanel(actor);
            PanelManager.instance.inventoryPanel = new InventoryPanel(actor);
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
            // Re-render the entire tray template
            const trayHtml = await renderTemplate(TEMPLATES.TRAY, { actor: this.actor });
            const newTrayElement = $(trayHtml);
            
            // Preserve expanded/pinned state without animation
            if (PanelManager.element.hasClass('expanded')) {
                newTrayElement.addClass('expanded').css('animation', 'none');
            }
            if (PanelManager.element.hasClass('pinned')) {
                newTrayElement.addClass('pinned');
            }
            
            // Replace the old tray with the new one
            PanelManager.element.replaceWith(newTrayElement);
            PanelManager.element = newTrayElement;
            
            // Re-attach listeners and render panels
            this.activateListeners(PanelManager.element);
            await this.renderPanels(PanelManager.element);

            // Remove the animation override after a brief delay
            setTimeout(() => {
                PanelManager.element.css('animation', '');
            }, 100);
        }
    }

    async renderPanels(element) {
        await this.characterPanel.render(element);
        await this.controlPanel.render(element);
        await this.favoritesPanel.render(element);
        await this.spellsPanel.render(element);
        await this.weaponsPanel.render(element);
        await this.inventoryPanel.render(element);
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

        // Handle favorite item clicks
        handle.find('.handle-favorite-icon').on('click', async (event) => {
            if ($(event.target).hasClass('handle-favorite-roll-overlay')) {
                const itemId = $(event.currentTarget).data('item-id');
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
            }
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
                // Update UI margin when pinned - only need trayWidth + offset since handle is included in width
                const trayWidth = game.settings.get(MODULE.ID, 'trayWidth');
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${trayWidth + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
                }
            } else {
                tray.removeClass('pinned expanded');
                // Reset UI margin when unpinned - need both handle width and offset
                const uiLeft = document.querySelector('#ui-left');
                if (uiLeft) {
                    uiLeft.style.marginLeft = `${parseInt(SQUIRE.TRAY_HANDLE_WIDTH) + parseInt(SQUIRE.TRAY_OFFSET_WIDTH)}px`;
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