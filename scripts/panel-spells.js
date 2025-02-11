import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        this.panelManager = PanelManager.instance;
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
        // Map spells with favorite state
        const mappedSpells = spells.map(spell => {
            const isFavorite = favorites.includes(spell.id);
            const level = spell.system.level;
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                isFavorite: isFavorite,
                categoryId: `category-spell-level-${level}`
            };
        });
        
        return mappedSpells;
    }

    _handleSearch(searchTerm) {
        if (!this.element || !this.panelManager) return;
        this.panelManager.updateSearchVisibility(searchTerm, this.element[0], '.spell-item');
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) {
            return;
        }

        // Refresh spells data
        this.spells = this._getSpells();

        // Group spells by level
        const spellsByLevel = {};
        this.spells.forEach(spell => {
            const level = spell.system.level;
            if (!spellsByLevel[level]) {
                spellsByLevel[level] = [];
            }
            spellsByLevel[level].push(spell);
        });

        const spellData = {
            spells: this.spells,
            spellsByLevel: spellsByLevel,
            spellSlots: this._getSpellSlots(),
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyPrepared: this.showOnlyPrepared
        };

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        const spellsPanel = this.element.find('[data-panel="spells"]');
        spellsPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(spellsPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _getSpellSlots() {
        if (!this.actor) return [];
        const spellbook = this.actor.system.spells;
        
        // Convert spellbook data into array format
        const slots = [];
        for (let i = 1; i <= 9; i++) {
            const spellLevelData = spellbook[`spell${i}`];
            if (spellLevelData) {
                slots.push({
                    level: i,
                    value: spellLevelData.value || 0,
                    max: spellLevelData.max || 0
                });
            }
        }
        return slots;
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.spell-item');
        items.each((_, item) => {
            const $item = $(item);
            const spellId = $item.data('spell-id');
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) return;
            
            const categoryId = spell.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const preparedMatch = !this.showOnlyPrepared || 
                spell.system.level === 0 || // Cantrips are always prepared
                spell.system.preparation?.prepared;
            
            $item.toggle(!isCategoryHidden && preparedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Level filter toggles
        html.find('.spell-level-filter').click((event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, html[0]);
        });

        // Search functionality
        const $search = html.find('.spell-search');
        $search.on('input', (event) => {
            this._handleSearch(event.target.value);
        });

        // Clear search
        html.find('.clear-search').click(() => {
            $search.val('').trigger('input');
        });

        // Toggle prepared state (sun icon)
        html.find('.tray-buttons .fa-sun').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                const newPrepared = !spell.system.preparation.prepared;
                await spell.update({
                    'system.preparation.prepared': newPrepared
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.spell-item');
                $item.toggleClass('prepared', newPrepared);
                $(event.currentTarget).toggleClass('faded', !newPrepared);
                // Update visibility in case we're filtering by prepared
                this._updateVisibility(html);
            }
        });

        // Toggle prepared spells only
        html.find('.spell-filter-toggle').click(async (event) => {
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            $(event.currentTarget)
                .toggleClass('active', this.showOnlyPrepared)
                .toggleClass('faded', !this.showOnlyPrepared);
            this._updateVisibility(html);
        });

        // Remove from favorites
        html.find('.spell-item .fa-heart').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
        });

        // Cast spell
        html.find('.spell-image-container').click(async (event) => {
            if ($(event.target).hasClass('spell-roll-overlay')) {
                const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
                const spell = this.actor.items.get(spellId);
                if (spell) {
                    await spell.use({}, { event });
                }
            }
        });

        // View spell details
        html.find('.spell-item .fa-feather').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });
    }
} 