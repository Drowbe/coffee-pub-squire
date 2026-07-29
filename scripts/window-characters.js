import { MODULE } from './const.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.()
    || (await import('/modules/coffee-pub-blacksmith/scripts/window-base.js')).BlacksmithWindowBaseV2;

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for CharactersWindow');
}

export class CharactersWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'characters-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: `${MODULE.ID}-characters-window`,
            classes: ['characters-window', 'squire-window'],
            position: { width: 400, height: 300 },
            window: { title: 'Select Character', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 160, minHeight: 180 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-characters.hbs`
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? CharactersWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CharactersWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, CharactersWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.item = options.item;
        this.sourceActor = options.sourceActor;
        this.sourceItemId = options.sourceItemId;
        this.selectedQuantity = options.selectedQuantity || 1;
        this.hasQuantity = options.hasQuantity || false;
        this.onCharacterSelected = options.onCharacterSelected;
        this.onClose = options.onClose;
    }

    async getData() {
        const actors = game.user.isGM
            ? (canvas.tokens?.placeables || [])
                .filter(token => token.actor && ['character', 'npc', 'monster'].includes(token.actor.type))
                .map(token => token.actor)
            : (canvas.tokens?.placeables || [])
                .filter(token => token.actor?.hasPlayerOwner && token.actor.type === 'character')
                .map(token => token.actor);
        const currentCharacterId = this.sourceActor?.id;

        return {
            characters: actors.map(actor => {
                let type = actor.type;
                if (actor.type === 'npc') {
                    type = (actor.disposition || 0) <= -1 ? 'monster' : 'npc';
                }
                return {
                    id: actor.id,
                    uuid: actor.uuid,
                    name: actor.name,
                    img: actor.img,
                    type,
                    clickable: actor.id !== currentCharacterId
                };
            }),
            item: this.item,
            sourceActor: this.sourceActor,
            sourceItemId: this.sourceItemId,
            selectedQuantity: this.selectedQuantity,
            hasQuantity: this.hasQuantity
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this.element?.querySelectorAll?.('.character-slot[data-clickable="true"]').forEach(slot => {
            slot.addEventListener('click', async event => {
                const target = event.currentTarget;
                const actorUuid = target.dataset.actorUuid;
                const actorId = target.dataset.characterId;
                const targetActor = actorUuid
                    ? await foundry.utils.fromUuid(actorUuid)
                    : game.actors.get(actorId);
                if (!targetActor) return;

                await this.onCharacterSelected?.(
                    targetActor,
                    this.item,
                    this.sourceActor,
                    this.sourceItemId,
                    this.selectedQuantity,
                    this.hasQuantity
                );
                await this.close();
            }, { once: true });
        });
    }

    async close(options = {}) {
        this.onClose?.();
        return super.close(options);
    }
}
