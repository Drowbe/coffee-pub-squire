import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        this.hiddenLevels = new Set(); // Track which levels are hidden
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        // Log raw spells from actor
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Raw spells from actor",
            spells,
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        // Map spells with favorite state
        const mappedSpells = spells.map(spell => {
            const isFavorite = favorites.includes(spell.id);
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                isFavorite: isFavorite
            };
        });
        
        // Log mapped spells
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Mapped spells with favorites",
            mappedSpells,
            false,
            true,
            false,
            MODULE.TITLE
        );
        
        return mappedSpells;
    }

    _handleSearch(searchTerm) {
        // Convert search term to lowercase for case-insensitive comparison
        searchTerm = searchTerm.toLowerCase();
        
        // Get all spell items
        const spellItems = this.element.find('.spell-item');
        let visibleItems = 0;
        
        spellItems.each((_, item) => {
            const $item = $(item);
            const spellName = $item.find('.spell-name').text().toLowerCase();
            
            if (searchTerm === '' || spellName.includes(searchTerm)) {
                $item.show();
                visibleItems++;
            } else {
                $item.hide();
            }
        });

        // Show/hide no matches message
        this.element.find('.no-matches').toggle(visibleItems === 0 && searchTerm !== '');

        // Update level headers visibility
        this.element.find('.level-header').each((_, header) => {
            const $header = $(header);
            const $nextSpells = $header.nextUntil('.level-header', '.spell-item:visible');
            $header.toggle($nextSpells.length > 0);
        });
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

        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        // Log spell data being sent to template
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Spell data for template",
            {
                spellsByLevel: Object.entries(spellsByLevel).map(([level, spells]) => 
                    `Level ${level}: ${spells.length} spells`
                ),
                spellSlots: spellData.spellSlots
            },
            false,
            true,
            false,
            MODULE.TITLE
        );

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        const spellsPanel = this.element.find('[data-panel="spells"]');
        spellsPanel.html(template);
        
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
        const searchInput = html.find('.spell-search');
        const searchTerm = searchInput.val()?.toLowerCase() || '';
        
        // Track visible spells for each level
        const visibleSpellsByLevel = new Map();
        
        const spellItems = html.find('.spell-item');
        spellItems.each((i, el) => {
            const $item = $(el);
            const spellId = $item.data('spell-id');
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) return;

            const nameMatch = spell.name.toLowerCase().includes(searchTerm);
            const levelMatch = !this.hiddenLevels.has(spell.system.level.toString());
            const preparedMatch = !this.showOnlyPrepared || 
                spell.system.level === 0 || // Cantrips are always prepared
                spell.system.preparation?.prepared;

            const shouldShow = nameMatch && levelMatch && preparedMatch;
            $item.toggle(shouldShow);

            // Track visible spells for this level
            if (shouldShow) {
                const level = spell.system.level;
                visibleSpellsByLevel.set(level, (visibleSpellsByLevel.get(level) || 0) + 1);
            }
        });

        // Hide/show level headers based on visible spells and level filters
        html.find('.level-header').each((i, header) => {
            const $header = $(header);
            const headerText = $header.find('span').text();
            
            // Determine the level this header represents
            let level;
            if (headerText.toLowerCase().includes('cantrip')) {
                level = 0;
            } else {
                const match = headerText.match(/Level (\d+)/);
                if (match) {
                    level = parseInt(match[1]);
                }
            }

            if (level !== undefined) {
                const hasVisibleSpells = visibleSpellsByLevel.get(level) > 0;
                const levelNotHidden = !this.hiddenLevels.has(level.toString());
                const isCantripsHeader = level === 0 && !headerText.includes('Level');
                
                // Special handling for cantrips header
                if (isCantripsHeader) {
                    $header.toggle(hasVisibleSpells && levelNotHidden);
                } else {
                    $header.toggle(hasVisibleSpells && levelNotHidden);
                }
            }
        });

        // Show/hide no matches message
        const hasVisibleSpells = Array.from(visibleSpellsByLevel.values()).some(count => count > 0);
        html.find('.no-matches').toggle(!hasVisibleSpells && searchTerm !== '');
    }

    _activateListeners(html) {
        // Search functionality
        const $search = html.find('.spell-search');
        $search.on('input', (event) => {
            this._handleSearch(event.target.value);
        });

        // Clear search
        html.find('.clear-search').click(() => {
            $search.val('').trigger('input');
        });

        // Toggle prepared state (cog icon)
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

        // Remove from favorites
        html.find('.spell-item .fa-heart').click(async (event) => {
            const itemId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
        });

        // Filter functionality
        html.find('.spell-filter').change(() => {
            this._updateVisibility(html);
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

        // Level filter toggles
        html.find('.level-filter').click((event) => {
            const $filter = $(event.currentTarget);
            const level = $filter.data('level').toString();
            
            $filter.toggleClass('active');
            
            if ($filter.hasClass('active')) {
                this.hiddenLevels.delete(level);
            } else {
                this.hiddenLevels.add(level);
            }
            
            this._updateVisibility(html);
        });
    }
} 