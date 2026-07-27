import { MODULE } from './const.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.();

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for StatusEffectsWindow');
}

export const STATUS_EFFECTS_WINDOW_ID = `${MODULE.ID}-status-effects-window`;

function getConditionName(id, condition) {
    const label = condition?.label || condition?.name || id;
    return game.i18n?.has?.(label) ? game.i18n.localize(label) : label;
}

function getConditionIcon(id, condition) {
    return condition?.icon
        || condition?.img
        || condition?.image
        || `modules/dnd5e/icons/conditions/${id}.svg`;
}

export class StatusEffectsWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'status-effects-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: STATUS_EFFECTS_WINDOW_ID,
            classes: ['status-effects-window', 'squire-window'],
            position: { width: 560, height: 680 },
            window: { title: 'Status Effects', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 400, minHeight: 420 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-status-effects.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? STATUS_EFFECTS_WINDOW_ID;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, StatusEffectsWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, StatusEffectsWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.actorUuid = opts.actorUuid || opts.actor?.uuid || null;
        this.actor = opts.actor || null;
        this._effectHookIds = [];
    }

    async _resolveActor() {
        if (this.actor?.uuid === this.actorUuid || (!this.actorUuid && this.actor)) return this.actor;
        this.actor = this.actorUuid ? await foundry.utils.fromUuid(this.actorUuid) : null;
        return this.actor;
    }

    _isConditionActive(id, name) {
        return this.actor?.effects?.some(effect => {
            const statuses = effect.statuses instanceof Set
                ? effect.statuses
                : new Set(effect.statuses || []);
            return statuses.has(id) || effect.name === name || effect.label === name;
        }) ?? false;
    }

    async getData() {
        await this._resolveActor();
        const conditions = Object.entries(CONFIG.DND5E?.conditionTypes || {})
            .map(([id, condition]) => {
                const name = getConditionName(id, condition);
                return {
                    id,
                    name,
                    icon: getConditionIcon(id, condition),
                    isActive: this._isConditionActive(id, name)
                };
            })
            .filter(condition => condition.name)
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            appId: this.id,
            actorName: this.actor?.name || 'Unknown Actor',
            actorImg: this.actor?.img || 'icons/svg/mystery-man.svg',
            canManage: !!game.user?.isGM,
            canRemoveAll: !!game.user?.isGM && conditions.some(condition => condition.isActive),
            conditions
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._registerEffectHooks();
    }

    _registerEffectHooks() {
        if (this._effectHookIds.length) return;
        const refresh = (effect) => {
            if (effect?.parent?.uuid !== this.actorUuid) return;
            this.render({ force: true });
        };
        this._effectHookIds.push(
            ['createActiveEffect', Hooks.on('createActiveEffect', refresh)],
            ['deleteActiveEffect', Hooks.on('deleteActiveEffect', refresh)],
            ['updateActiveEffect', Hooks.on('updateActiveEffect', refresh)]
        );
    }

    _unregisterEffectHooks() {
        for (const [hook, id] of this._effectHookIds) Hooks.off(hook, id);
        this._effectHookIds = [];
    }

    async _toggleCondition(conditionId) {
        if (!game.user?.isGM) {
            ui.notifications.warn('Only GMs can add or remove effects.');
            return;
        }

        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return;
        }

        const condition = CONFIG.DND5E?.conditionTypes?.[conditionId];
        if (!condition) {
            ui.notifications.error('That condition is no longer available.');
            return;
        }

        const name = getConditionName(conditionId, condition);
        const existing = this.actor.effects.find(effect => {
            const statuses = effect.statuses instanceof Set
                ? effect.statuses
                : new Set(effect.statuses || []);
            return statuses.has(conditionId) || effect.name === name || effect.label === name;
        });

        try {
            if (existing) {
                await existing.delete();
                ui.notifications.info(`Removed ${name} from ${this.actor.name}`);
            } else {
                await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                    name,
                    img: getConditionIcon(conditionId, condition),
                    origin: this.actor.uuid,
                    disabled: false,
                    statuses: [conditionId]
                }]);
                ui.notifications.info(`Added ${name} to ${this.actor.name}`);
            }

            await game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.handleManager?.updateHandle?.();
        } catch (error) {
            console.error('Coffee Pub Squire | Error managing status effect:', error);
            ui.notifications.error(`Could not ${existing ? 'remove' : 'add'} ${name}`);
        }
    }

    async _removeAllConditions() {
        if (!game.user?.isGM) {
            ui.notifications.warn('Only GMs can remove effects.');
            return;
        }

        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return;
        }

        const conditionEntries = Object.entries(CONFIG.DND5E?.conditionTypes || {});
        const conditionIds = new Set(conditionEntries.map(([id]) => id));
        const conditionNames = new Set(
            conditionEntries.map(([id, condition]) => getConditionName(id, condition))
        );
        const effects = this.actor.effects.filter(effect => {
            const statuses = effect.statuses instanceof Set
                ? effect.statuses
                : new Set(effect.statuses || []);
            return Array.from(statuses).some(status => conditionIds.has(status))
                || conditionNames.has(effect.name)
                || conditionNames.has(effect.label);
        });

        if (!effects.length) return;

        try {
            await this.actor.deleteEmbeddedDocuments('ActiveEffect', effects.map(effect => effect.id));
            ui.notifications.info(`Removed all conditions from ${this.actor.name}`);
            await game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.handleManager?.updateHandle?.();
        } catch (error) {
            console.error('Coffee Pub Squire | Error removing all status effects:', error);
            ui.notifications.error(`Could not remove all conditions from ${this.actor.name}`);
        }
    }

    async close(options = {}) {
        this._unregisterEffectHooks();
        return super.close(options);
    }

    static async _actionToggleEffect(event, target) {
        event?.preventDefault?.();
        const instance = StatusEffectsWindow._ref;
        const conditionId = target?.dataset?.conditionId;
        if (!instance || !conditionId) return;
        await instance._toggleCondition(conditionId);
    }

    static async _actionClose(event) {
        event?.preventDefault?.();
        await StatusEffectsWindow._ref?.close();
    }

    static async _actionRemoveAll(event) {
        event?.preventDefault?.();
        await StatusEffectsWindow._ref?._removeAllConditions();
    }
}

StatusEffectsWindow.ACTION_HANDLERS = {
    toggleEffect: StatusEffectsWindow._actionToggleEffect,
    removeAll: StatusEffectsWindow._actionRemoveAll,
    close: StatusEffectsWindow._actionClose
};

export async function openStatusEffectsWindow(options = {}) {
    const actor = options.actor
        || (options.actorUuid ? await foundry.utils.fromUuid(options.actorUuid) : null);
    if (!actor) {
        ui.notifications.warn('Select a character before opening Status Effects.');
        return null;
    }

    const existing = StatusEffectsWindow._ref;
    if (existing?.actorUuid === actor.uuid) {
        await existing.render({ force: true });
        return existing;
    }
    if (existing) await existing.close();

    const windowInstance = new StatusEffectsWindow({ ...options, actor, actorUuid: actor.uuid });
    await windowInstance.render(true);
    return windowInstance;
}

export function registerStatusEffectsWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    return blacksmith.registerWindow(STATUS_EFFECTS_WINDOW_ID, {
        open: openStatusEffectsWindow,
        title: 'Status Effects',
        moduleId: MODULE.ID
    });
}
