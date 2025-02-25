import { MODULE, TEMPLATES } from './const.js';

export class PartyPanel {
    constructor() {
        this.element = null;
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
            const actorId = $(event.target).closest('.character-card').data('actor-id');
            const actor = game.actors.get(actorId);
            if (actor) {
                actor.sheet.render(true);
            }
        });
    }
} 