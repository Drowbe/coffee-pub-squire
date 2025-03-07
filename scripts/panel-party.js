import { MODULE, TEMPLATES } from './const.js';

export class PartyPanel {
    constructor() {
        this.element = null;
        this._onTokenUpdate = this._onTokenUpdate.bind(this);
        this._onActorUpdate = this._onActorUpdate.bind(this);
        
        // Register hooks for updates
        Hooks.on('updateToken', this._onTokenUpdate);
        Hooks.on('updateActor', this._onActorUpdate);
    }

    async render(element) {
        this.element = element;
        const partyContainer = element.find('[data-panel="party"]');
        if (!partyContainer.length) return;

        // Get all player-owned tokens on the canvas
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);

        const html = await renderTemplate(TEMPLATES.PANEL_PARTY, { tokens });
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
        // Re-render if token position or visibility changes
        if (foundry.utils.hasProperty(changes, "x") || foundry.utils.hasProperty(changes, "y") || foundry.utils.hasProperty(changes, "hidden")) {
            this.render(this.element);
        }
    }

    _onActorUpdate(actor, changes) {
        // Re-render if HP changes
        if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {
            this.render(this.element);
        }
    }

    destroy() {
        // Remove hooks when panel is destroyed
        Hooks.off('updateToken', this._onTokenUpdate);
        Hooks.off('updateActor', this._onActorUpdate);
    }
} 