import { MODULE, TEMPLATES } from './const.js';
import { showSquireToast, renderTemplate } from './helpers.js';

/**
 * Statblock usability checks and repairs.
 *
 * NPCs are routinely imported or hand-built with a bow and no arrows, a crossbow
 * and no bolts, or a slot-casting spell list and no spell slots. Each of those
 * makes the item unusable at the moment someone clicks it, which is the worst
 * possible time to discover it. These checks find them up front and can repair
 * them in one click.
 *
 * Everything here derives from the dnd5e system's own configuration rather than
 * hardcoded pairings — `system.ammunitionOptions` already knows arrows go with
 * bows and bolts with crossbows, `CONFIG.DND5E.spellcasting` already knows which
 * casting methods consume slots, and `CONFIG.DND5E.ammoIds` already knows where
 * the standard ammunition items live.
 *
 * GM-facing only: these are authoring problems, and "this monster has no arrows"
 * is not information a player should be handed.
 */

// Weapons whose ammunition subtype isn't explicitly set still imply one. dnd5e
// only records `system.ammunition.type` when the author bothered; without it any
// ammo item satisfies the weapon, so we have to infer what to *create*.
const BASE_ITEM_AMMO_TYPE = {
    blowgun: 'blowgunNeedle',
    handcrossbow: 'crossbowBolt',
    heavycrossbow: 'crossbowBolt',
    lightcrossbow: 'crossbowBolt',
    longbow: 'arrow',
    shortbow: 'arrow',
    sling: 'slingBullet'
};

export const STATBLOCK_ISSUES = {
    AMMO_MISSING: 'ammo-missing',
    AMMO_EMPTY: 'ammo-empty',
    SPELL_SLOTS_MISSING: 'spell-slots-missing'
};

export class StatblockUtility {

    /**
     * The three questions this utility answers are NOT the same question, and
     * conflating them is how a GM authoring aid turns into something that writes
     * to a player's sheet.
     *
     *   canWarnFor    may this user SEE problems on this actor
     *   canRepairFor  may this user FIX them
     *   canAutoFixFor may they be fixed without anyone asking
     *
     * For an NPC all three collapse to "GM, warnings on" — the GM owns the
     * statblock and repairing it is authoring. For a player character they come
     * apart completely: the owner sees their own empty quiver, only the GM can
     * act on it, and nothing is ever automatic.
     */
    static _isRepairable(actor) {
        // A compendium actor can't be repaired and isn't in play.
        if (!actor) return false;
        return !(actor.pack || (actor.collection && actor.collection.locked));
    }

    static _setting(key) {
        try {
            return game.settings.get(MODULE.ID, key);
        } catch (error) {
            return false;
        }
    }

    /** Whether this user should see warnings on this actor at all. */
    static canWarnFor(actor) {
        if (!this._isRepairable(actor)) return false;

        if (actor.type === 'character') {
            // Their own characters only. The tray follows canvas selection, so
            // without this a player who can select another PC's token would get
            // a badge about someone else's ammunition.
            if (!actor.isOwner) return false;
            return this._setting('inventoryWarnings');
        }

        // NPC statblock warnings stay a GM authoring aid.
        if (!game.user.isGM) return false;
        return this._setting('statblockShowWarnings');
    }

    /**
     * Whether this user may carry out a repair.
     *
     * GM only, for characters as well as NPCs, and deliberately not "whoever has
     * permission". A player owns their character and Foundry would happily let
     * them create the arrows themselves — but restocking is a table decision,
     * not a permissions one. The GM may want them to have searched the area, or
     * to have stocked up before the fight.
     */
    static canRepairFor(actor) {
        return game.user.isGM && this._isRepairable(actor);
    }

    /**
     * Whether repairs may be applied unattended.
     *
     * NPCs only. Auto-fix exists to save the GM doing at the table what they
     * would have done anyway while building the statblock; on a player character
     * the same write invents equipment nobody acquired, and it would happen the
     * moment their tray opened.
     */
    static canAutoFixFor(actor) {
        return this.canRepairFor(actor)
            && actor.type !== 'character'
            && this._setting('statblockAutoFix');
    }


    static getAmmoQuantity() {
        try {
            return Math.max(1, Number(game.settings.get(MODULE.ID, 'statblockAmmoQuantity')) || 20);
        } catch (error) {
            return 20;
        }
    }

    /* ---------------------------------------------------------------- */
    /*  Detection                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Which ammunition subtype a weapon needs, or null if it needs none.
     * Prefers the weapon's explicit declaration and falls back to its base item.
     */
    static getRequiredAmmoType(weapon) {
        if (weapon?.type !== 'weapon') return null;
        if (!weapon.system?.properties?.has?.('amm')) return null;
        return weapon.system.ammunition?.type
            || BASE_ITEM_AMMO_TYPE[weapon.system.type?.baseItem]
            || 'arrow';
    }

    /**
     * Ammunition issues for a single weapon.
     *
     * `system.ammunitionOptions` is dnd5e's own resolver: it returns [] unless the
     * weapon carries the `amm` property, filters the actor's consumables down to
     * ammo matching the weapon's declared subtype, and flags entries with no
     * quantity as `disabled`. Using it means subtype matching stays correct
     * without us maintaining a weapon→ammo table.
     */
    /**
     * How to refer to the actor in a warning.
     *
     * The same sentence is read by a GM auditing a monster and by a player
     * looking at their own character, so "this creature has none" is wrong half
     * the time.
     */
    static _subjectFor(actor) {
        if (actor?.type !== 'character') return { subject: 'this creature', verb: 'has' };
        // The owner reading about their own character.
        if (actor.isOwner && !game.user.isGM) return { subject: 'you', verb: 'have' };
        return { subject: actor.name, verb: 'has' };
    }

    /** A readable name for an ammunition subtype ("Arrows", "Bolts", ...). */
    static getAmmoLabel(ammoType) {
        const typeLabel = CONFIG.DND5E?.consumableTypes?.ammo?.subtypes?.[ammoType];
        return typeLabel ? game.i18n.localize(typeLabel) : 'ammunition';
    }

    static getWeaponIssues(actor, weapon) {
        if (!actor || weapon?.type !== 'weapon') return [];
        if (!weapon.system?.properties?.has?.('amm')) return [];

        const { subject, verb } = this._subjectFor(actor);
        const options = weapon.system.ammunitionOptions ?? [];
        const ammoType = this.getRequiredAmmoType(weapon);
        const ammoLabel = this.getAmmoLabel(ammoType);

        if (options.length === 0) {
            return [{
                type: STATBLOCK_ISSUES.AMMO_MISSING,
                itemId: weapon.id,
                itemName: weapon.name,
                ammoType,
                message: `${weapon.name} requires ${ammoLabel} but ${subject} ${verb} none.`,
                fixLabel: `Add ${ammoLabel}`
            }];
        }

        if (options.every(option => option.disabled)) {
            return [{
                type: STATBLOCK_ISSUES.AMMO_EMPTY,
                itemId: weapon.id,
                itemName: weapon.name,
                ammoType,
                ammoItemId: options[0]?.item?.id ?? options[0]?.value,
                message: `${weapon.name} is out of ${ammoLabel}.`,
                fixLabel: `Restock ${ammoLabel}`
            }];
        }

        return [];
    }

    /**
     * Whether a casting method draws on spell slots, and which pool it uses.
     * Read from CONFIG so at-will/innate/ritual stay silent — they need no slots
     * and make up most modern statblocks — and so homebrew methods registered by
     * other modules are handled without a code change here.
     */
    static getSlotModel(method) {
        const model = CONFIG.DND5E?.spellcasting?.[method];
        if (!model) return null;
        // `slots` is a getter on instantiated method models. Slotless methods
        // (at-will, innate, ritual) are plain config entries with neither it nor
        // a slot table, so fall back to the table when the getter is absent.
        const providesSlots = model.slots ?? !!model.table;
        return providesSlots ? model : null;
    }

    /**
     * The lowest caster level that grants a slot of the given spell level.
     * Inverts dnd5e's own slot table rather than assuming the 5e progression.
     */
    static getRequiredCasterLevel(spellLevel) {
        const table = CONFIG.DND5E?.SPELL_SLOT_TABLE ?? [];
        for (let i = 0; i < table.length; i++) {
            if ((table[i]?.length ?? 0) >= spellLevel) return i + 1;
        }
        return table.length || 20;
    }

    /**
     * Spell-slot issues for an actor, reported against the highest-level spell
     * that can't be cast. One issue rather than one per spell: the repair is a
     * single caster-level field, so nine separate warnings would all be the
     * same fix.
     */
    static getSpellIssues(actor) {
        if (!actor?.system?.spells) return [];

        const spells = actor.items.filter(item => item.type === 'spell');
        if (!spells.length) return [];

        const unusable = [];
        for (const spell of spells) {
            const level = Number(spell.system?.level) || 0;
            // Cantrips never consume a slot.
            if (level < 1) continue;

            const model = this.getSlotModel(spell.system?.method);
            if (!model) continue;

            const key = model.getSpellSlotKey?.(level) ?? `spell${level}`;
            const pool = actor.system.spells[key];
            if ((Number(pool?.max) || 0) === 0) {
                unusable.push({ spell, level, key, method: spell.system.method });
            }
        }

        if (!unusable.length) return [];

        const highest = unusable.reduce((a, b) => (b.level > a.level ? b : a));
        const names = unusable.map(u => u.spell.name);
        const requiredLevel = this.getRequiredCasterLevel(highest.level);

        // The repair sets the NPC caster level, which dnd5e only feeds into the
        // standard multi-level `spell` progression. A pact-magic NPC with no
        // slots is still worth reporting, but we can't correctly repair it from
        // one field — flag it and let the GM set pact slots on the sheet.
        const canFix = unusable.every(u => u.method === 'spell');

        return [{
            type: STATBLOCK_ISSUES.SPELL_SLOTS_MISSING,
            itemIds: unusable.map(u => u.spell.id),
            itemId: highest.spell.id,
            itemName: highest.spell.name,
            spellLevel: highest.level,
            requiredLevel,
            canFix,
            message: `${names.length === 1 ? names[0] : `${names.length} spells`} cannot be cast — this creature has no level ${highest.level} spell slots.`,
            fixLabel: canFix
                ? `Grant spell slots (caster level ${requiredLevel})`
                : 'Set pact slots on the sheet — Squire cannot infer them'
        }];
    }

    /** Every issue on an actor. */
    static getIssues(actor) {
        if (!this.canWarnFor(actor)) return [];
        try {
            const weaponIssues = actor.items
                .filter(item => item.type === 'weapon')
                .flatMap(weapon => this.getWeaponIssues(actor, weapon));

            // Ammunition only for player characters. The spell-slot check asks
            // "can every known spell be cast right now", which for a statblock
            // means it is broken and for a character is routine: a wizard scribes
            // spells above their casting level, a multiclass or a feat grants one
            // with no matching slots. It would fire constantly and correctly
            // teach people to ignore the badge.
            if (actor.type === 'character') return weaponIssues;

            return [...weaponIssues, ...this.getSpellIssues(actor)];
        } catch (error) {
            console.error(`${MODULE.ID}: Error checking statblock:`, error);
            return [];
        }
    }

    /**
     * Issues indexed by the item id a badge should hang off, so a panel can look
     * up its row in O(1) instead of re-running detection per item. Spell-slot
     * issues are attached to every affected spell, since the GM may only have
     * one of them favorited.
     */
    static getIssueMap(actor) {
        const map = new Map();
        for (const issue of this.getIssues(actor)) {
            for (const id of issue.itemIds ?? [issue.itemId]) {
                if (!map.has(id)) map.set(id, []);
                map.get(id).push(issue);
            }
        }
        return map;
    }

    /** Escape text destined for an HTML attribute (item names are user data). */
    static _escapeAttr(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Badge view-model for one item row, or null when the item is fine.
     * Shared by the Favorites, Weapons, and Spells panels so all three describe
     * the same problem identically.
     */
    static getBadge(issues, actor = null) {
        if (!issues?.length) return null;

        const body = issues.map(issue => this._escapeAttr(issue.message)).join('<br>');

        // A player is being told what is wrong and offered a way to ask; a GM is
        // being offered the repair itself. Promising "click to fix" to someone
        // whose click opens a request would be a lie about what happens next.
        const canRepair = actor ? this.canRepairFor(actor) : true;
        const isCharacter = actor?.type === 'character';
        const title = isCharacter ? 'Inventory Problem' : 'Statblock Problem';

        if (!canRepair) {
            return {
                // `canFix` drives the `no-fix` class, and the click handler
                // returns early on it — a request is still an action, so this
                // stays clickable.
                canFix: true,
                tooltip: `<strong>${title}</strong><br>${body}<br><em>Click to ask the GM</em>`
            };
        }

        const canFix = issues.every(issue => issue.canFix !== false);
        const action = canFix
            ? `Click to fix: ${this._escapeAttr(issues[0].fixLabel)}`
            : this._escapeAttr(issues[0].fixLabel);
        return {
            canFix,
            tooltip: `<strong>${title}</strong><br>${body}<br><em>${action}</em>`
        };
    }

    /**
     * Attach a delegated click handler that repairs the clicked row's item and
     * refreshes the open panels. Shared by every panel that renders a badge.
     *
     * `signal` is optional because the panels don't agree on teardown: Favorites
     * uses an AbortController, Weapons and Spells push onto a handler array. The
     * handler is returned so the latter can register it for their own cleanup.
     *
     * @returns {Function|undefined} the attached listener
     */
    static activateBadgeListener(panel, actor, signal) {
        if (!panel || !actor) return;
        const handler = async (event) => {
            const badge = event.target.closest('.statblock-warning');
            if (!badge) return;
            event.preventDefault();
            event.stopPropagation();
            if (badge.classList.contains('no-fix')) return;

            const row = badge.closest('.panel-item');
            const itemId = row?.dataset.itemId;
            if (!itemId) return;

            // Guard against a double click firing two creates before the first
            // repair has re-rendered the row away.
            if (badge.dataset.processing === 'true') return;
            badge.dataset.processing = 'true';

            try {
                const issues = this.getIssueMap(actor).get(itemId) ?? [];

                // A player clicking their own empty quiver is asking, not
                // fixing. Restocking is a table decision — the GM may want them
                // to have searched the area, or to have stocked up before the
                // fight — so the click sends a request and the GM decides.
                if (!this.canRepairFor(actor)) {
                    for (const issue of issues) await this.requestRepair(actor, issue);
                    return;
                }

                let applied = 0;
                for (const issue of issues) {
                    if (await this.fixIssue(actor, issue)) applied++;
                }
                if (applied > 0) {
                    showSquireToast(`Repaired ${applied} statblock ${applied === 1 ? 'issue' : 'issues'} on ${actor.name}.`, {
                        icon: 'fa-solid fa-wrench'
                    });
                    await this.refreshPanels();
                }
            } finally {
                badge.dataset.processing = 'false';
            }
        };

        panel.addEventListener('click', handler, signal ? { signal } : undefined);
        return handler;
    }

    /** Re-render the panels a repair can change. */
    static async refreshPanels() {
        const { PanelManager } = await import('./manager-panel.js');
        const instance = PanelManager.instance;
        if (!instance) return;
        for (const panel of [instance.favoritesPanel, instance.weaponsPanel, instance.spellsPanel, instance.inventoryPanel]) {
            if (panel?.element) await panel.render(panel.element);
        }
    }

    /* ---------------------------------------------------------------- */
    /*  Repair                                                           */
    /* ---------------------------------------------------------------- */

    /**
     * Apply a single repair.
     *
     * These write to actor content, which Squire otherwise leaves strictly alone.
     * That's deliberate and narrow: a repair only ever runs from an explicit GM
     * click or the opt-in auto-fix setting, only adds what the statblock already
     * says it needs, and never removes or rebalances anything.
     *
     * @returns {Promise<boolean>} whether the repair was applied
     */
    static async fixIssue(actor, issue) {
        if (!actor || !issue) return false;
        if (!game.user.isGM) return false;
        if (actor.pack || (actor.collection && actor.collection.locked)) return false;

        if (issue.canFix === false) return false;

        try {
            switch (issue.type) {
                case STATBLOCK_ISSUES.AMMO_MISSING:
                    return await this._fixMissingAmmo(actor, issue);
                case STATBLOCK_ISSUES.AMMO_EMPTY:
                    return await this._fixEmptyAmmo(actor, issue);
                case STATBLOCK_ISSUES.SPELL_SLOTS_MISSING:
                    return await this._fixMissingSpellSlots(actor, issue);
                default:
                    return false;
            }
        } catch (error) {
            console.error(`${MODULE.ID}: Error repairing statblock issue:`, error);
            ui.notifications.error(`Squire: could not repair ${issue.itemName ?? 'statblock'} — see console.`);
            return false;
        }
    }

    /**
     * Ask the GM to restock. Mirrors the compendium add request, because it is
     * the same decision wearing different clothes: whether this character may
     * have this equipment now.
     *
     * Sends the actor's UUID rather than its id — a token actor on a scene is
     * not reachable through `game.actors.get()`.
     */
    static async requestRepair(actor, issue) {
        if (issue.type !== STATBLOCK_ISSUES.AMMO_MISSING && issue.type !== STATBLOCK_ISSUES.AMMO_EMPTY) {
            return false;
        }

        const socket = game.modules.get(MODULE.ID)?.socket;
        if (!socket) {
            ui.notifications.error('Socketlib socket is not ready. Please wait for Foundry to finish loading, then try again.');
            return false;
        }

        if (!game.users.some(user => user.isGM && user.active)) {
            showSquireToast('No GM is online', {
                subtitle: 'Restocking needs GM approval.',
                icon: 'fa-solid fa-triangle-exclamation',
                color: '#e05c3c'
            });
            return false;
        }

        const ammoLabel = this.getAmmoLabel(issue.ammoType);
        await socket.executeAsGM('createAmmoRequestChat', {
            actorUuid: actor.uuid,
            actorName: actor.name,
            weaponId: issue.itemId,
            weaponName: issue.itemName,
            ammoType: issue.ammoType,
            ammoItemId: issue.ammoItemId ?? null,
            ammoLabel,
            quantity: this.getAmmoQuantity(),
            issueType: issue.type,
            requesterId: game.user.id,
            requesterName: game.user.name
        });

        showSquireToast(`Requested ${ammoLabel}`, {
            subtitle: 'Waiting for the GM.',
            icon: 'fa-solid fa-hourglass-half',
            stackKey: `squire-ammo-request-${issue.itemId}`
        });
        return true;
    }

    /** GM side: put the request in front of every GM. */
    static async createRequestChat(data) {
        if (!game.user.isGM) return;

        const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
        if (!gmIds.length) return;

        await ChatMessage.create({
            content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                isPublic: false,
                cardType: 'ammo-request',
                ...data
            }),
            speaker: { alias: 'System' },
            whisper: gmIds,
            flags: { [MODULE.ID]: { type: 'ammoRequest', data } }
        });
    }

    /**
     * Wire Approve/Deny on a request card. Called for every chat render, so it
     * returns immediately for anything that isn't ours.
     */
    static handleRequestButtons(message, html) {
        if (message?.flags?.[MODULE.ID]?.type !== 'ammoRequest') return;
        if (!game.user.isGM) return;

        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        if (!nativeHtml) return;

        const buttons = nativeHtml.querySelectorAll('.ammo-request-button');
        if (!buttons.length) return;
        // Chat re-renders on edit and on scrollback; without this the same
        // button collects a second handler and one click approves twice.
        if (buttons[0].dataset.handlersAttached === 'true') return;

        const data = message.flags[MODULE.ID].data ?? {};

        buttons.forEach(button => {
            button.dataset.handlersAttached = 'true';
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                buttons.forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('disabled');
                });
                await this.resolveRequest(data, button.classList.contains('approve'), message);
            });
        });
    }

    /** Carry out the GM's decision and tell the player either way. */
    static async resolveRequest(data, approved, message) {
        const requester = game.users.get(data.requesterId);
        const whisperIds = [data.requesterId, ...game.users.filter(u => u.isGM).map(u => u.id)]
            .filter(Boolean);

        const outcome = async (cardType, extra = {}) => {
            await ChatMessage.create({
                content: await renderTemplate(TEMPLATES.CHAT_CARD, {
                    isPublic: false,
                    cardType,
                    ...data,
                    ...extra
                }),
                speaker: { alias: 'System' },
                whisper: whisperIds
            });
        };

        try {
            if (!approved) {
                await outcome('ammo-denied');
                return;
            }

            const actor = await fromUuid(data.actorUuid);
            if (!actor) {
                await outcome('ammo-failed', {
                    failureReason: `${data.actorName} could not be found, so no ${data.ammoLabel} was added.`
                });
                return;
            }

            // The request may have outlived the ownership that justified it —
            // a character reassigned between the click and the approval. The GM
            // is approving "restock that player's character", not "write to
            // whatever this actor is now".
            if (requester && !actor.testUserPermission(requester, 'OWNER')) {
                await outcome('ammo-failed', {
                    failureReason: `${data.requesterName} no longer owns ${data.actorName}, so no ${data.ammoLabel} was added.`
                });
                return;
            }

            // Re-detected rather than trusted: the issue was described when the
            // player clicked, and they may have bought arrows since.
            const weapon = actor.items.get(data.weaponId);
            const issues = weapon ? this.getWeaponIssues(actor, weapon) : [];
            if (!issues.length) {
                await outcome('ammo-failed', {
                    failureReason: `${data.actorName} no longer needs ${data.ammoLabel}.`
                });
                return;
            }

            let applied = 0;
            for (const issue of issues) {
                if (await this.fixIssue(actor, issue)) applied++;
            }

            if (!applied) {
                await outcome('ammo-failed', {
                    failureReason: `${data.ammoLabel} could not be added to ${data.actorName}.`
                });
                return;
            }

            await outcome('ammo-approved');
            await this.refreshPanels();
        } catch (error) {
            console.error(`${MODULE.ID}: Failed to resolve ammo request:`, error);
            await outcome('ammo-failed', {
                failureReason: `Something went wrong adding ${data.ammoLabel} to ${data.actorName}.`
            });
        } finally {
            const current = game.messages.get(message?.id);
            if (current) await current.delete();
        }
    }

    static async _fixMissingAmmo(actor, issue) {
        const uuid = CONFIG.DND5E?.ammoIds?.[issue.ammoType];
        if (!uuid) {
            ui.notifications.warn(`Squire: no standard item is configured for ${issue.ammoType}; add it manually.`);
            return false;
        }

        const source = await fromUuid(uuid);
        if (!source) {
            ui.notifications.warn('Squire: the dnd5e equipment compendium is unavailable, so ammunition could not be added.');
            return false;
        }

        const data = source.toObject();
        data.system.quantity = this.getAmmoQuantity();
        delete data._id;
        await actor.createEmbeddedDocuments('Item', [data]);
        return true;
    }

    static async _fixEmptyAmmo(actor, issue) {
        const ammo = actor.items.get(issue.ammoItemId);
        if (!ammo) return false;
        await ammo.update({ 'system.quantity': this.getAmmoQuantity() });
        return true;
    }

    static async _fixMissingSpellSlots(actor, issue) {
        // For an NPC with no spellcasting class, dnd5e derives the entire slot
        // table from this one field (Actor5e#_prepareSpellcasting), so setting it
        // is the correct repair — writing per-level overrides would fight the
        // system's own derivation.
        const current = Number(actor.system?.attributes?.spell?.level) || 0;
        if (current >= issue.requiredLevel) return false;
        await actor.update({ 'system.attributes.spell.level': issue.requiredLevel });
        return true;
    }

    /**
     * Repair every issue on an actor, re-detecting between passes so that one
     * fix resolving several problems doesn't cause redundant writes.
     * @returns {Promise<number>} how many repairs were applied
     */
    static async fixAll(actor) {
        let applied = 0;
        // Bounded: each pass must fix at least one issue or we stop, so a repair
        // that doesn't clear its own detection can't spin.
        for (let pass = 0; pass < 10; pass++) {
            const issues = this.getIssues(actor);
            if (!issues.length) break;
            const before = applied;
            for (const issue of issues) {
                if (await this.fixIssue(actor, issue)) applied++;
            }
            if (applied === before) break;
        }
        return applied;
    }

    /**
     * Auto-repair on actor selection when the GM has opted in.
     */
    static async autoFixIfEnabled(actor) {
        if (!this.canAutoFixFor(actor)) return 0;

        const applied = await this.fixAll(actor);
        if (applied > 0) {
            showSquireToast(`Repaired ${applied} statblock ${applied === 1 ? 'issue' : 'issues'} on ${actor.name}.`, {
                icon: 'fa-solid fa-wrench'
            });
        }
        return applied;
    }
}
