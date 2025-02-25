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
    }

    _onTokenUpdate(token, changes) {
        // Re-render if token position or visibility changes
        if (hasProperty(changes, "x") || hasProperty(changes, "y") || hasProperty(changes, "hidden")) {
            this.render(this.element);
        }
    }

    _onActorUpdate(actor, changes) {
        // Re-render if HP changes
        if (hasProperty(changes, "system.attributes.hp")) {
            this.render(this.element);
        }
    }

    destroy() {
        // Remove hooks when panel is destroyed
        Hooks.off('updateToken', this._onTokenUpdate);
        Hooks.off('updateActor', this._onActorUpdate);
    }
} 