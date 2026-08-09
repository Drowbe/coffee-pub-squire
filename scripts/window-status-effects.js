import { MODULE } from './const.js';
import { getTextEditor } from './helpers.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.();

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for StatusEffectsWindow');
}

export const STATUS_EFFECTS_WINDOW_ID = `${MODULE.ID}-status-effects-window`;
let statusEffectsWindowInstance = null;

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
            position: { width: 900, height: 680 },
            window: { title: 'Status Effects', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 780, minHeight: 420 }
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
        this.descriptionEffectId = opts.descriptionEffectId || null;
        this.descriptionStatusId = opts.descriptionStatusId || null;
        this._actionRoot = null;
        this._actionHandler = null;
        statusEffectsWindowInstance = this;
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
        if (!this.descriptionEffectId && !this.descriptionStatusId) {
            const defaultCondition = configuredStatuses.find(status => status.isActive)
                || configuredStatuses[0];
            if (defaultCondition) this.descriptionStatusId = defaultCondition.id;
            else if (otherEffects[0]) this.descriptionEffectId = otherEffects[0].id;
        }
        for (const status of configuredStatuses) {
            status.isSelected = status.id === this.descriptionStatusId;
        }
        for (const effect of otherEffects) {
            effect.isSelected = effect.id === this.descriptionEffectId;
        }
        const selectedDescription = await this._getSelectedDescription(configuredStatuses);

        const canManage = !!this.actor?.isOwner;
        return {
            appId: this.id,
            actorName: this.actor?.name || 'Unknown Actor',
            actorImg: this.actor?.img || 'icons/svg/mystery-man.svg',
            canManage,
            canRemoveAll: canManage && configuredStatuses.some(condition => condition.isActive),
            conditions: configuredStatuses,
            otherEffects,
            hasOtherEffects: otherEffects.length > 0,
            selectedDescription
        };
    }

    async _getSelectedDescription(configuredStatuses) {
        let effect = this.descriptionEffectId
            ? this.actor?.effects?.get?.(this.descriptionEffectId)
            : null;
        let statusId = this.descriptionStatusId;

        if (effect && !statusId) {
            const configuredIds = new Set(configuredStatuses.map(status => status.id));
            statusId = Array.from(effect.statuses || []).find(id => configuredIds.has(id)) || null;
        }
        if (!effect && statusId) {
            const statusName = configuredStatuses
                .find(status => status.id === statusId)
                ?.name
                ?.toLocaleLowerCase();
            effect = this.actor?.effects?.find?.(candidate => {
                const statuses = candidate.statuses instanceof Set
                    ? candidate.statuses
                    : new Set(candidate.statuses || []);
                const name = String(candidate.name || candidate.label || '').toLocaleLowerCase();
                return statuses.has(statusId) && (!statusName || name === statusName);
            }) || null;
        }

        const configuredStatus = configuredStatuses.find(status => status.id === statusId);
        if (!effect && !configuredStatus) return null;

        let rawDescription = effect?.description || '';
        let relativeTo = effect || this.actor;
        if (!rawDescription && statusId) {
            const condition = CONFIG.DND5E?.conditionTypes?.[statusId];
            rawDescription = condition?.description || '';
            if (!rawDescription && condition?.reference) {
                rawDescription = `@Embed[${condition.reference} inline]`;
            }
        }

        let html = '<p>No description is available for this effect.</p>';
        if (rawDescription) {
            try {
                if (game.i18n?.has?.(rawDescription)) {
                    rawDescription = game.i18n.localize(rawDescription);
                }
                const TextEditorImpl = getTextEditor();
                html = await TextEditorImpl.enrichHTML(rawDescription, {
                    relativeTo,
                    rollData: this.actor?.getRollData?.() || {}
                });
            } catch (error) {
                console.warn('Coffee Pub Squire | Could not enrich ActiveEffect description:', error);
                html = rawDescription;
            }
        }

        return {
            name: effect?.name || effect?.label || configuredStatus?.name || 'Effect',
            icon: effect?.img || configuredStatus?.icon || 'icons/svg/aura.svg',
            html
        };
    }

    async _showDescription({ effectId = null, statusId = null } = {}) {
        this.descriptionEffectId = effectId;
        this.descriptionStatusId = statusId;
        await this.render({ force: true });
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachActionListeners();
        this._registerEffectHooks();
    }

    _attachActionListeners() {
        const root = this.element?.querySelector?.('.status-effects-window[data-app-id]');
        if (!root || root === this._actionRoot) return;
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }

        this._actionRoot = root;
        this._actionHandler = async (event) => {
            const target = event.target?.closest?.('[data-action]');
            if (!target || !root.contains(target)) return;
            const action = target.dataset.action;
            if (!['toggleEffect', 'removeAll', 'removeEffect', 'showDescription', 'close'].includes(action)) return;
            event.preventDefault();

            if (action === 'toggleEffect') {
                const conditionId = target.dataset.conditionId;
                if (conditionId) await this._toggleCondition(conditionId);
            } else if (action === 'removeAll') {
                await this._removeAllConditions();
            } else if (action === 'removeEffect') {
                const effectId = target.dataset.effectId;
                if (effectId) await this._removeEffect(effectId);
            } else if (action === 'showDescription') {
                event.stopPropagation();
                await this._showDescription({
                    effectId: target.dataset.effectId || null,
                    statusId: target.dataset.conditionId || null
                });
            } else {
                await this.close();
            }
        };
        root.addEventListener('click', this._actionHandler, true);
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
            if (this.descriptionEffectId === effectId) this.descriptionEffectId = null;
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
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }
        this._actionRoot = null;
        this._actionHandler = null;
        if (statusEffectsWindowInstance === this) statusEffectsWindowInstance = null;
        return super.close(options);
    }
}

export async function openStatusEffectsWindow(options = {}) {
    const actor = options.actor
        || (options.actorUuid ? await foundry.utils.fromUuid(options.actorUuid) : null);
    if (!actor) {
        ui.notifications.warn('Select a character before opening Status Effects.');
        return null;
    }

    const existing = statusEffectsWindowInstance;
    if (existing?.actorUuid === actor.uuid) {
        if (options.descriptionEffectId || options.descriptionStatusId) {
            existing.descriptionEffectId = options.descriptionEffectId || null;
            existing.descriptionStatusId = options.descriptionStatusId || null;
        }
        await existing.render({ force: true });
        return existing;
    }
    if (existing) await existing.close();

    const windowInstance = new StatusEffectsWindow({ ...options, actor, actorUuid: actor.uuid });
    await windowInstance.render(true);
    return windowInstance;
}

/**
 * Well-known id Blacksmith's Health window looks for when deciding whether to
 * render its per-row conditions button.
 *
 * Blacksmith will not name a Squire window, so the integration is inverted: any
 * module may claim this id, and the button appears only if someone does.
 * Registering it here restores the behaviour the Health window had while it
 * lived in Squire.
 */
export const BLACKSMITH_STATUS_EFFECTS_WINDOW_ID = 'blacksmith-status-effects';

export function registerStatusEffectsWindow() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    const descriptor = {
        open: openStatusEffectsWindow,
        title: 'Status Effects',
        moduleId: MODULE.ID
    };

    const own = blacksmith.registerWindow(STATUS_EFFECTS_WINDOW_ID, descriptor);
    // Opting into the integration. Failure here is not fatal — another module
    // may already hold the id, in which case its window services the button.
    const shared = blacksmith.registerWindow(BLACKSMITH_STATUS_EFFECTS_WINDOW_ID, descriptor);
    if (!shared) {
        console.warn(`${MODULE.ID}: could not claim ${BLACKSMITH_STATUS_EFFECTS_WINDOW_ID}; the Health window's conditions button will use whichever module holds it.`);
    }
    return own;
}
