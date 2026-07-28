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

function getStatusName(id, status) {
    const label = status?.name || status?.label || id;
    return game.i18n?.has?.(label) ? game.i18n.localize(label) : label;
}

function getStatusIcon(status) {
    return status?.img
        || status?.icon
        || status?.image
        || 'icons/svg/unknown.svg';
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
        this._pendingConditionIds = new Set();
        this._pendingEffectIds = new Set();
    }

    async _resolveActor() {
        if (this.actor?.uuid === this.actorUuid || (!this.actorUuid && this.actor)) return this.actor;
        this.actor = this.actorUuid ? await foundry.utils.fromUuid(this.actorUuid) : null;
        return this.actor;
    }

    async getData() {
        await this._resolveActor();
        const exhaustionLevel = Number(this.actor?.system?.attributes?.exhaustion || 0);
        const configuredStatuses = (CONFIG.statusEffects || [])
            .map(status => {
                const id = status?.id;
                const name = getStatusName(id, status);
                const isExhaustion = id === 'exhaustion';
                return {
                    id,
                    name,
                    icon: getStatusIcon(status),
                    isActive: this.actor?.statuses?.has?.(id) ?? false,
                    levelLabel: isExhaustion && exhaustionLevel > 0
                        ? `Level ${exhaustionLevel}`
                        : ''
                };
            })
            .filter(condition => condition.id && condition.name)
            .sort((a, b) => a.name.localeCompare(b.name));
        const canonicalStatusKeys = new Set(
            configuredStatuses.map(status => `${status.id}:${status.name.toLocaleLowerCase()}`)
        );
        const otherEffects = (this.actor?.effects || [])
            .filter(effect => {
                const effectName = String(effect.name || effect.label || '').toLocaleLowerCase();
                const statuses = effect.statuses instanceof Set
                    ? effect.statuses
                    : new Set(effect.statuses || []);
                return !Array.from(statuses).some(
                    statusId => canonicalStatusKeys.has(`${statusId}:${effectName}`)
                );
            })
            .map(effect => ({
                id: effect.id,
                name: effect.name || effect.label || 'Unnamed Effect',
                icon: effect.img || 'icons/svg/aura.svg',
                duration: effect.duration?.type === 'none' ? '' : (effect.duration?.label || ''),
                isDisabled: !!effect.disabled,
                isSuppressed: !!effect.isSuppressed
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const canManage = !!this.actor?.isOwner;
        return {
            appId: this.id,
            actorName: this.actor?.name || 'Unknown Actor',
            actorImg: this.actor?.img || 'icons/svg/mystery-man.svg',
            canManage,
            canRemoveAll: canManage && configuredStatuses.some(condition => condition.isActive),
            conditions: configuredStatuses,
            otherEffects,
            hasOtherEffects: otherEffects.length > 0
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._registerEffectHooks();
    }

    _registerEffectHooks() {
        if (this._effectHookIds.length) return;
        const refreshEffect = (effect) => {
            if (effect?.parent?.uuid !== this.actorUuid) return;
            this.render({ force: true });
        };
        const refreshActor = (actor, changes) => {
            const exhaustionChanged = foundry.utils.hasProperty(changes, 'system.attributes.exhaustion')
                || Object.hasOwn(changes || {}, 'system.attributes.exhaustion');
            if (actor?.uuid !== this.actorUuid || !exhaustionChanged) return;
            this.render({ force: true });
        };
        this._effectHookIds.push(
            ['createActiveEffect', Hooks.on('createActiveEffect', refreshEffect)],
            ['deleteActiveEffect', Hooks.on('deleteActiveEffect', refreshEffect)],
            ['updateActiveEffect', Hooks.on('updateActiveEffect', refreshEffect)],
            ['updateActor', Hooks.on('updateActor', refreshActor)]
        );
    }

    _unregisterEffectHooks() {
        for (const [hook, id] of this._effectHookIds) Hooks.off(hook, id);
        this._effectHookIds = [];
    }

    async _toggleCondition(conditionId) {
        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return;
        }
        if (!this.actor.isOwner) {
            ui.notifications.warn('You do not have permission to change effects on this actor.');
            return;
        }
        if (this._pendingConditionIds.has(conditionId)) return;

        const status = CONFIG.statusEffects?.find(entry => entry.id === conditionId);
        if (!status) {
            ui.notifications.error('That condition is no longer available.');
            return;
        }

        const name = getStatusName(conditionId, status);
        const isActive = this.actor.statuses?.has?.(conditionId) ?? false;

        this._pendingConditionIds.add(conditionId);
        try {
            await this.actor.toggleStatusEffect(conditionId, { active: !isActive });
            ui.notifications.info(`${isActive ? 'Removed' : 'Added'} ${name} ${isActive ? 'from' : 'to'} ${this.actor.name}`);
            await game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.handleManager?.updateHandle?.();
        } catch (error) {
            console.error('Coffee Pub Squire | Error managing status effect:', error);
            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${name}`);
        } finally {
            this._pendingConditionIds.delete(conditionId);
        }
    }

    async _removeAllConditions() {
        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return;
        }
        if (!this.actor.isOwner) {
            ui.notifications.warn('You do not have permission to change effects on this actor.');
            return;
        }

        const activeStatusIds = (CONFIG.statusEffects || [])
            .map(status => status?.id)
            .filter(id => id && this.actor.statuses?.has?.(id));
        if (!activeStatusIds.length) return;

        try {
            for (const statusId of activeStatusIds) {
                await this.actor.toggleStatusEffect(statusId, { active: false });
            }
            ui.notifications.info(`Removed all conditions from ${this.actor.name}`);
            await game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.handleManager?.updateHandle?.();
        } catch (error) {
            console.error('Coffee Pub Squire | Error removing all status effects:', error);
            ui.notifications.error(`Could not remove all conditions from ${this.actor.name}`);
        }
    }

    async _removeEffect(effectId) {
        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return;
        }
        if (!this.actor.isOwner) {
            ui.notifications.warn('You do not have permission to change effects on this actor.');
            return;
        }
        if (!effectId || this._pendingEffectIds.has(effectId)) return;

        const effect = this.actor.effects.get(effectId);
        if (!effect) return;

        this._pendingEffectIds.add(effectId);
        try {
            const name = effect.name || effect.label || 'Effect';
            await effect.delete();
            ui.notifications.info(`Removed ${name} from ${this.actor.name}`);
            await game.modules.get(MODULE.ID)?.api?.PanelManager?.instance?.handleManager?.updateHandle?.();
        } catch (error) {
            console.error('Coffee Pub Squire | Error removing ActiveEffect:', error);
            ui.notifications.error(`Could not remove ${effect.name || effect.label || 'effect'}`);
        } finally {
            this._pendingEffectIds.delete(effectId);
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

    static async _actionRemoveEffect(event, target) {
        event?.preventDefault?.();
        const effectId = target?.dataset?.effectId;
        if (!effectId) return;
        await StatusEffectsWindow._ref?._removeEffect(effectId);
    }
}

StatusEffectsWindow.ACTION_HANDLERS = {
    toggleEffect: StatusEffectsWindow._actionToggleEffect,
    removeAll: StatusEffectsWindow._actionRemoveAll,
    removeEffect: StatusEffectsWindow._actionRemoveEffect,
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
