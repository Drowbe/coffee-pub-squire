import { MODULE } from './const.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.()
    || (await import('/modules/coffee-pub-blacksmith/scripts/window-base.js')).BlacksmithWindowBaseV2;

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for UsersWindow');
}

export class UsersWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'users-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: `${MODULE.ID}-users-window`,
            classes: ['users-window', 'squire-window'],
            position: { width: 400, height: 300 },
            window: { title: 'Select Player', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 160, minHeight: 180 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-users.hbs`
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? UsersWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, UsersWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, UsersWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.onUserSelected = options.onUserSelected;
        this.onClose = options.onClose;
    }

    async getData() {
        const currentUserId = game.user?.id;
        return {
            users: (game.users?.contents || []).map(user => ({
                id: user.id,
                name: user.name,
                img: user.avatar,
                clickable: user.id !== currentUserId
            }))
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this.element?.querySelectorAll?.('.user-slot[data-clickable="true"]').forEach(slot => {
            slot.addEventListener('click', async event => {
                const user = game.users?.get(event.currentTarget.dataset.userId);
                if (!user) return;

                await this.onUserSelected?.(user);
                await this.close();
            }, { once: true });
        });
    }

    async close(options = {}) {
        this.onClose?.();
        return super.close(options);
    }
}
