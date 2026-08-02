import { MODULE } from './const.js';

/**
 * Inline quantity editing for item rows.
 *
 * Click the `x12` badge on any item row and it becomes a number field: type a
 * value, Enter commits, Escape cancels, clicking away commits. Setting 0 removes
 * the item, since "I used the last one" and "I have zero of these" are the same
 * statement about a stack.
 *
 * Deleting is confirmed only when the item looks like it would hurt to lose —
 * magical, attuned, better than common rarity, or expensive. Burning the last
 * arrow mid-turn shouldn't cost a dialog; dropping a +2 longsword to 0 by
 * mistyping should.
 */

// Above this total gp value (price x quantity) a deletion is confirmed.
const DEFAULT_VALUE_THRESHOLD = 50;

export class QuantityEditor {

    /** Editing an actor's items requires owning the actor. */
    static canEdit(actor) {
        if (!actor) return false;
        if (actor.pack || (actor.collection && actor.collection.locked)) return false;
        return actor.isOwner === true;
    }

    static getValueThreshold() {
        try {
            const value = Number(game.settings.get(MODULE.ID, 'quantityConfirmValue'));
            return Number.isFinite(value) ? value : DEFAULT_VALUE_THRESHOLD;
        } catch (error) {
            return DEFAULT_VALUE_THRESHOLD;
        }
    }

    /** An item's unit price in gp, whatever denomination it's recorded in. */
    static getGoldValue(item) {
        const price = item?.system?.price;
        const amount = Number(price?.value) || 0;
        if (!amount) return 0;
        // CONFIG conversions are "how many of this coin per gp", so gp = amount / conversion.
        const conversion = Number(CONFIG.DND5E?.currencies?.[price?.denomination]?.conversion);
        return conversion > 0 ? amount / conversion : amount;
    }

    /**
     * Whether losing this item warrants a confirmation.
     * @returns {string|null} the reason, or null if it can go quietly
     */
    static getDeleteConcern(item) {
        if (!item) return null;

        if (item.system?.attuned) return 'is attuned';
        if (item.system?.attunement === 'required') return 'requires attunement';
        if (item.system?.properties?.has?.('mgc')) return 'is magical';

        const rarity = item.system?.rarity;
        if (rarity && rarity !== 'common') {
            const label = CONFIG.DND5E?.itemRarity?.[rarity];
            return `is ${label ? game.i18n.localize(label).toLowerCase() : rarity}`;
        }

        const threshold = this.getValueThreshold();
        if (threshold > 0) {
            const total = this.getGoldValue(item) * (Number(item.system?.quantity) || 0);
            if (total > threshold) return `is worth ${Math.round(total)} gp`;
        }

        return null;
    }

    /**
     * Apply a new quantity, deleting the item at 0.
     * @returns {Promise<boolean>} whether anything changed
     */
    static async setQuantity(actor, itemId, quantity) {
        if (!this.canEdit(actor)) return false;
        const item = actor.items.get(itemId);
        if (!item) return false;

        const next = Math.max(0, Math.floor(Number(quantity)));
        if (!Number.isFinite(next)) return false;
        if (next === (Number(item.system?.quantity) || 0)) return false;

        if (next === 0) {
            const concern = this.getDeleteConcern(item);
            if (concern) {
                const dialog = game.modules.get('coffee-pub-blacksmith')?.api?.dialog;
                if (!dialog) {
                    // Without a confirm surface, refuse rather than silently
                    // destroying something the GM wanted to be asked about.
                    ui.notifications.warn(`Squire: cannot confirm deletion of ${item.name} — remove it from the sheet instead.`);
                    return false;
                }
                const confirmed = await dialog.confirm({
                    title: 'Delete Item',
                    content: `<p>Setting the quantity to zero will delete <strong>${foundry.utils.escapeHTML(item.name)}</strong>, which ${concern}.</p>`,
                    confirmLabel: 'Delete Item',
                    confirmIcon: 'fa-solid fa-trash',
                    destructive: true
                });
                if (!confirmed) return false;
            }
            // Tagged so the GM-facing notification can tell a deliberate tray
            // edit from dnd5e consuming ammunition during an attack.
            await item.delete({ squireQuantityEdit: true });
            return true;
        }

        await item.update({ 'system.quantity': next }, { squireQuantityEdit: true });
        return true;
    }

    /**
     * Swap a quantity badge for an input, and commit or cancel on the way out.
     * Kept entirely in the DOM rather than re-rendering the panel, so the field
     * doesn't lose focus the moment it appears.
     */
    static _beginEdit(badge, actor) {
        if (badge.dataset.editing === 'true') return;
        const row = badge.closest('.panel-item');
        const itemId = row?.dataset.itemId;
        if (!itemId) return;
        const item = actor.items.get(itemId);
        if (!item) return;

        badge.dataset.editing = 'true';
        const original = badge.innerHTML;
        const current = Number(item.system?.quantity) || 0;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = String(current);
        input.className = 'quantity-edit-input';
        // The row is draggable; without this, dragging to select text in the
        // field starts an item drag instead.
        input.draggable = false;

        badge.innerHTML = '';
        badge.appendChild(input);
        input.focus();
        input.select();

        let done = false;
        const restore = () => {
            badge.innerHTML = original;
            badge.dataset.editing = 'false';
        };

        const commit = async () => {
            if (done) return;
            done = true;
            const raw = input.value.trim();
            // An emptied field means "I changed my mind", not "zero".
            if (raw === '') return restore();

            const next = Math.max(0, Math.floor(Number(raw)));
            if (!Number.isFinite(next)) return restore();

            const changed = await this.setQuantity(actor, itemId, next);
            // On a real change the item update/delete hook re-renders the panel
            // and this element is replaced; restoring covers the no-op and
            // cancelled-confirmation paths, where nothing else will.
            if (!changed) restore();
        };

        const cancel = () => {
            if (done) return;
            done = true;
            restore();
        };

        input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
            }
        });
        input.addEventListener('blur', () => commit());
        // Clicks inside the field must not reach the row's use/roll handlers.
        input.addEventListener('click', (event) => event.stopPropagation());
    }

    /**
     * Attach the delegated click handler to a panel.
     *
     * `signal` is optional: Favorites and Spells tear down with an
     * AbortController, Weapons and Inventory with a handler array. The handler
     * is returned for the latter.
     *
     * @returns {Function|undefined} the attached listener
     */
    static activateListener(panel, actor, signal) {
        if (!panel || !this.canEdit(actor)) return;

        const handler = (event) => {
            const badge = event.target.closest('.context-count[data-quantity-edit]');
            if (!badge) return;
            event.preventDefault();
            event.stopPropagation();
            this._beginEdit(badge, actor);
        };

        panel.addEventListener('click', handler, signal ? { signal } : undefined);
        return handler;
    }
}
