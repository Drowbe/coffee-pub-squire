import { MODULE, TEMPLATES } from './const.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
    }

    _getSpells() {
        if (!this.actor) return [];
        return this.actor.items.filter(item => item.type === 'spell');
    }

    async render(html) {
        const spellData = {
            spells: this.spells.map(spell => ({
                id: spell.id,
                name: spell.name,
                level: spell.system.level,
                description: spell.system.description.value,
                prepared: spell.system.preparation?.prepared || false
            })),
            spellSlots: this._getSpellSlots()
        };

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        html.find('[data-panel="spells"]').html(template);
        this._activateListeners(html);
    }

    _getSpellSlots() {
        if (!this.actor) return {};
        const spellbook = this.actor.system.spells;
        return Object.entries(spellbook)
            .filter(([key, slot]) => key.startsWith('spell'))
            .map(([key, slot]) => ({
                level: parseInt(key.replace('spell', '')),
                value: slot.value,
                max: slot.max
            }));
    }

    _activateListeners(html) {
        // Spell casting
        html.find('.cast-spell').click(async (event) => {
            const spellId = event.currentTarget.dataset.spellId;
            const spell = this.actor.items.get(spellId);
            if (spell) {
                await spell.roll();
            }
        });

        // Spell slot tracking
        html.find('.spell-slot-use').click(async (event) => {
            const level = event.currentTarget.dataset.level;
            const spells = duplicate(this.actor.system.spells);
            const slot = spells[`spell${level}`];
            
            if (slot.value > 0) {
                slot.value--;
                await this.actor.update({ 'system.spells': spells });
            }
        });
    }
} 