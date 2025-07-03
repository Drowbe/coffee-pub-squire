import { MODULE, TEMPLATES, SQUIRE } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PartyStatsPanel {
    constructor() {
        this.element = null;
        this._boundUpdateHandler = this._onStatsUpdate.bind(this);
    }

    async getData() {
        const data = {
            sections: {
                combat: {
                    title: "Combat Overview",
                    icon: "fa-swords",
                    collapsible: true
                },
                contributions: {
                    title: "Individual Contributions",
                    icon: "fa-medal",
                    collapsible: true
                },
                session: {
                    title: "Session Information",
                    icon: "fa-hourglass-half",
                    collapsible: true
                }
            },
            // Combat Overview
            totalHits: 0,
            totalMisses: 0,
            hitRate: '-',
            criticalHits: 0,
            critRate: '-',
            
            // Individual Contributions
            mostAccurate: { name: '-', value: 0 },
            criticalMaster: { name: '-', value: 0 },
            totalHealing: 0,
            
            // Session Information
            sessionDuration: '0:00:00',
            averageTurnTime: '0:00:00',
            actionsPerHour: '-'
        };

        try {
            // Get fresh reference to Blacksmith API
            const blacksmith = getBlacksmith();
            // console.log('SQUIRE | STATS Blacksmith API object:', blacksmith);

            if (!blacksmith?.stats?.player) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Blacksmith Stats API (player) not available',
                    { blacksmith },
                    false,
                    false,
                    false,
                    MODULE.TITLE
                );
                return data;
            }

            // Get all player characters
            const playerCharacters = game.actors.filter(actor => 
                actor.type === 'character' && actor.hasPlayerOwner
            );
            // console.log('SQUIRE | STATS Found player characters:', playerCharacters.map(pc => pc.name));

            // Initialize stat tracking
            let hitsByPlayer = new Map();
            let critsByPlayer = new Map();
            let turnTimeByPlayer = new Map();

            // Process each player's stats
            for (const actor of playerCharacters) {
                try {
                    // console.log(`SQUIRE | STATS Getting lifetime stats for ${actor.name}...`);
                    const stats = await blacksmith.stats.player.getLifetimeStats(actor.id);
                    
                    if (!stats) {
                        // console.log(`SQUIRE | STATS No lifetime stats found for ${actor.name}`);
                        continue;
                    }

                    // console.log(`SQUIRE | STATS Raw stats for ${actor.name}:`, stats);

                    // Extract stats with null checks
                    const hits = stats.attacks?.totalHits ?? 0;
                    const misses = stats.attacks?.totalMisses ?? 0;
                    const crits = stats.attacks?.criticals ?? 0;
                    const healing = stats.healing?.total ?? 0;
                    const turnTime = stats.turnStats?.average ?? 0;

                    // Accumulate totals
                    data.totalHits += hits;
                    data.totalMisses += misses;
                    data.criticalHits += crits;
                    data.totalHealing += healing;

                    // Track individual contributions
                    if (hits > 0) hitsByPlayer.set(actor.name, hits);
                    if (crits > 0) critsByPlayer.set(actor.name, crits);
                    if (turnTime > 0) turnTimeByPlayer.set(actor.name, turnTime);

                } catch (error) {
                    getBlacksmith()?.utils.postConsoleAndNotification(
                        `Error processing stats for ${actor.name}`,
                        { actor: actor.name, error },
                        false,
                        false,
                        true,
                        MODULE.TITLE
                    );
                }
            }

            // Calculate hit rate
            const totalAttempts = data.totalHits + data.totalMisses;
            if (totalAttempts > 0) {
                data.hitRate = `${Math.round((data.totalHits / totalAttempts) * 100)}%`;
            }

            // Calculate crit rate
            if (data.totalHits > 0) {
                data.critRate = `${Math.round((data.criticalHits / data.totalHits) * 100)}%`;
            }

            // Find top performers
            data.mostAccurate = this._getTopPerformer(hitsByPlayer);
            data.criticalMaster = this._getTopPerformer(critsByPlayer);

            // Calculate average turn time
            if (turnTimeByPlayer.size > 0) {
                const totalTime = Array.from(turnTimeByPlayer.values()).reduce((a, b) => a + b, 0);
                const averageTime = totalTime / turnTimeByPlayer.size;
                data.averageTurnTime = blacksmith.utils.formatTime(averageTime * 1000);
            }

            // Get session duration and calculate actions per hour
            try {
                const sessionStats = blacksmith.stats.player.getSessionStats();
                if (sessionStats?.turnStats?.total) {
                    const totalSeconds = sessionStats.turnStats.total;
                    data.sessionDuration = blacksmith.utils.formatTime(totalSeconds * 1000);
                    
                    if (data.totalHits > 0 && totalSeconds > 0) {
                        const hours = totalSeconds / 3600;
                        data.actionsPerHour = Math.round(data.totalHits / hours);
                    }
                }
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'Error getting session duration',
                    { error },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }

            // console.log('SQUIRE | STATS Final party stats data:', data);

        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Error gathering party stats',
                { error },
                false,
                false,
                true,
                MODULE.TITLE
            );
        }

        return data;
    }

    _getTopPerformer(statsMap) {
        if (statsMap.size === 0) return { name: '-', value: 0 };
        
        let topName = '-';
        let topValue = 0;

        for (const [name, value] of statsMap.entries()) {
            if (value > topValue) {
                topName = name;
                topValue = value;
            }
        }

        return { name: topName, value: topValue };
    }

    async _onStatsUpdate() {
        if (this.element) {
            await this._updateDisplay();
        }
    }

    async render(element) {
        if (!element) return;
        this.element = element;

        // Initial render
        await this._updateDisplay();

        // Register hooks for updates
        Hooks.on('updateCombat', this._boundUpdateHandler);
        Hooks.on('updateActor', this._boundUpdateHandler);
        Hooks.on('createChatMessage', this._boundUpdateHandler);
    }

    async _updateDisplay() {
        const data = await this.getData();
        const content = await renderTemplate(TEMPLATES.PANEL_PARTY_STATS, data);
        
        const $element = this.element instanceof jQuery ? this.element : $(this.element);
        const panel = $element.find('[data-panel="party-stats"]');
        if (panel.length) {
            panel.html(content);
        }
    }

    destroy() {
        // Clean up hooks when the panel is destroyed
        Hooks.off('updateCombat', this._boundUpdateHandler);
        Hooks.off('updateActor', this._boundUpdateHandler);
        Hooks.off('createChatMessage', this._boundUpdateHandler);
        this.element = null;
    }
} 