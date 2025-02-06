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
                img: spell.img || 'icons/svg/spell.svg',
                prepared: spell.system.preparation?.prepared || false
            })),
            spellSlots: this._getSpellSlots(),
            position: game.settings.get(MODULE.ID, 'trayPosition')
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
        // Spell info click
        html.find('.spell-info').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });

        // Spell cast click (image overlay)
        html.find('.spell-image-container').click(async (event) => {
            // Only handle click if on the overlay
            if ($(event.target).hasClass('spell-roll-overlay')) {
                const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
                const spell = this.actor.items.get(spellId);
                if (spell) {
                    await spell.use();
                }
            }
        });

        // Spell slot tracking
        html.find('.slot-pip').click(async (event) => {
            const level = event.currentTarget.dataset.level;
            const index = parseInt(event.currentTarget.dataset.index);
            const spells = duplicate(this.actor.system.spells);
            const slot = spells[`spell${level}`];
            
            if (index < slot.value) {
                // Decrease slots
                slot.value = index;
            } else {
                // Increase slots (if not at max)
                if (index < slot.max) {
                    slot.value = index + 1;
                }
            }
            
            await this.actor.update({ 'system.spells': spells });
        });

        // Search and filter
        const searchInput = html.find('.spell-search');
        const filterSelect = html.find('.spell-filter');
        const preparedToggle = html.find('.prepared-only');
        
        const updateVisibility = () => {
            const searchTerm = searchInput.val().toLowerCase();
            const filterValue = filterSelect.val();
            const showOnlyPrepared = preparedToggle.prop('checked');
            
            html.find('.spell-item').each((i, el) => {
                const $item = $(el);
                const spell = this.spells.find(s => s.id === $item.data('spell-id'));
                if (!spell) return;

                const nameMatch = spell.name.toLowerCase().includes(searchTerm);
                const levelMatch = filterValue === 'all' || 
                    (filterValue === 'cantrip' && spell.system.level === 0) ||
                    (filterValue === spell.system.level.toString());
                const preparedMatch = !showOnlyPrepared || spell.system.preparation?.prepared;

                $item.toggle(nameMatch && levelMatch && preparedMatch);
            });
        };

        searchInput.on('input', updateVisibility);
        filterSelect.on('change', updateVisibility);
        preparedToggle.on('change', updateVisibility);
    }
} 