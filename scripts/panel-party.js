import { MODULE, TEMPLATES } from './const.js';

export class PartyPanel {
    constructor() {
        this.element = null;
        this._onTokenUpdate = this._onTokenUpdate.bind(this);
        this._onActorUpdate = this._onActorUpdate.bind(this);
        this._onControlToken = this._onControlToken.bind(this);
        
        // Register hooks for updates
        Hooks.on('updateToken', this._onTokenUpdate);
        Hooks.on('updateActor', this._onActorUpdate);
        Hooks.on('controlToken', this._onControlToken);
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        this.element = element;
        const partyContainer = element.find('[data-panel="party"]');
        if (!partyContainer.length) return;

        // Get all player-owned tokens on the canvas
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        
        // Get currently controlled tokens' actor IDs
        const controlledTokenIds = canvas.tokens.controlled
            .filter(token => token.actor)
            .map(token => token.actor.id);

        const html = await renderTemplate(TEMPLATES.PANEL_PARTY, { 
            tokens,
            controlledTokenIds
        });
        partyContainer.html(html);

        this.activateListeners(partyContainer);
    }

    activateListeners(html) {
        // Handle character sheet button clicks
        html.find('.open-sheet').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(event.target).closest('.character-card').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Handle portrait clicks
        html.find('.character-image.clickable').click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actorId = $(event.currentTarget).closest('.character-card').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor) {
                const imagePopout = new ImagePopout(actor.img, {
                    title: actor.name,
                    shareable: true,
                    uuid: actor.uuid
                });
                imagePopout.render(true);
            }
        });

        // Handle character card clicks for token selection
        html.find('.character-card.clickable').click(async (event) => {
            // Don't handle clicks if they originated from the open-sheet button or portrait
            if ($(event.target).closest('.open-sheet, .character-image.clickable').length) return;

            const actorId = $(event.currentTarget).data('actor-id');
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) {
                token.control({releaseOthers: true});
            }
        });
    }

    _onTokenUpdate(token, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if token position or visibility changes
            if (foundry.utils.hasProperty(changes, "x") || foundry.utils.hasProperty(changes, "y") || foundry.utils.hasProperty(changes, "hidden")) {
                this.render(this.element);
            }
        }
    }

    _onActorUpdate(actor, changes) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render if HP changes
            if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {
                this.render(this.element);
            }
        }
    }

    _onControlToken(token, isControlled) {
        // Only re-render if the element exists
        if (this.element) {
            // Re-render to highlight the currently selected token
            this.render(this.element);
        }
    }

    destroy() {
        // Remove hooks when panel is destroyed
        Hooks.off('updateToken', this._onTokenUpdate);
        Hooks.off('updateActor', this._onActorUpdate);
        Hooks.off('controlToken', this._onControlToken);
    }
} 