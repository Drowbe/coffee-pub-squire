import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        // Don't set panelManager in constructor
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
            const isAtWill = spell.system.preparation?.mode === 'atwill';
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                actionType: this._getActionType(spell),
                isFavorite: isFavorite,
                categoryId: isAtWill ? 'category-spell-at-will' : `category-spell-level-${level}`
            };
        });

        // Group spells by type (at-will) and level
        const spellsByType = {
            atwill: mappedSpells.filter(s => s.system.preparation?.mode === 'atwill')
        };
        
        return mappedSpells;
    }

    _getActionType(spell) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = spell.system.activities;
        if (activities) {
            // Get the first activity (usually there's only one)
            const activity = Object.values(activities)[0];
            if (activity?.activation?.type) {
                switch (activity.activation.type) {
                    case 'action': return 'action';
                    case 'bonus': return 'bonus';
                    case 'reaction': return 'reaction';
                    case 'special': return 'special';
                    default: return 'action'; // Most spells use an action
                }
            }
        }

        // Default to action for most spells
        return 'action';
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) {
            return;
        }

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh spells data
        this.spells = this._getSpells();

        // Group spells by level
        const spellsByLevel = {};
        const spellsByType = {
            atwill: this.spells.filter(s => s.system.preparation?.mode === 'atwill')
        };

        this.spells.forEach(spell => {
            if (spell.system.preparation?.mode !== 'atwill') {
                const level = spell.system.level;
                if (!spellsByLevel[level]) {
                    spellsByLevel[level] = [];
                }
                spellsByLevel[level].push(spell);
            }
        });

        const spellSlots = this._getSpellSlots();
        
        const position = game.settings.get(MODULE.ID, 'trayPosition');
        const spellData = {
            spells: this.spells,
            spellsByLevel,
            spellsByType,
            spellSlots,
            position,
            showOnlyPrepared: this.showOnlyPrepared
        };

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        
        // Remove old listeners before updating HTML
        this._removeEventListeners(this.element);
        
        // Update the panel content
        this.element.find('[data-panel="spells"]').html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(this.element[0]);
        }
        
        // Activate listeners on the root element
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
                const slotData = {
                    level: i,
                    value: spellLevelData.value || 0,
                    max: (spellLevelData.override ?? spellLevelData.max) || 0,
                    used: ((spellLevelData.override ?? spellLevelData.max) || 0) - (spellLevelData.value || 0)
                };
                slots.push(slotData);
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
                spell.system.preparation?.mode === 'atwill' || // At-will spells are always prepared
                spell.system.preparation?.prepared;
            
            $item.toggle(!isCategoryHidden && preparedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) {
            return;
        }

        // Get the panel element
        const panel = html.find('[data-panel="spells"]');
        
        // Remove any existing listeners
        panel.off('click.squireSpells');

        // Add direct click handler to the filter toggle
        const filterToggle = panel.find('.spell-filter-toggle');
        filterToggle.on('click.squireSpells', async (event) => {
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            
            const $target = $(event.currentTarget);
            $target.toggleClass('active', this.showOnlyPrepared);
            $target.toggleClass('faded', !this.showOnlyPrepared);
            
            this._updateVisibility(html);
        });

        // Level filter toggles
        panel.on('click.squireSpells', '.spell-level-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Prepared toggle (sun icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-sun', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                const newPrepared = !spell.system.preparation.prepared;
                await spell.update({
                    'system.preparation.prepared': newPrepared
                });
                const $item = $(event.currentTarget).closest('.spell-item');
                $item.toggleClass('prepared', newPrepared);
                $(event.currentTarget).toggleClass('faded', !newPrepared);
                this._updateVisibility(html);
            }
        });

        // Favorite toggle (heart icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-heart', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await FavoritesPanel.manageFavorite(this.actor, spellId);
        });

        // Cast spell (roll overlay)
        panel.on('click.squireSpells', '.spell-image-container .spell-roll-overlay', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                await spell.use({}, { event });
            }
        });

        // View spell details (feather icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-feather', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel?.length) return;
        panel.off('.squireSpells');
    }
} 