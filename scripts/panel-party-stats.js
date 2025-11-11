import { MODULE, TEMPLATES, SQUIRE } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PartyStatsPanel {
    constructor() {
        this.element = null;
        this._boundUpdateHandler = this._onStatsUpdate.bind(this);
        this._sessionRetryTimeout = null;
        this._sessionRetryAttempts = 0;
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

        if (window.BlacksmithAPI?.waitForReady) {
            try {
                await window.BlacksmithAPI.waitForReady();
            } catch (readyError) {
                console.error('Error waiting for Blacksmith readiness:', readyError);
            }
        }

        const blacksmith = getBlacksmith();

        let trackPlayerStats = false;
        try {
            trackPlayerStats = game.settings.get('coffee-pub-blacksmith', 'trackPlayerStats');
        } catch (settingsError) {
            console.error('Error reading Blacksmith player stats setting:', settingsError);
        }

        const canUseSessionStats = Boolean(
            trackPlayerStats &&
            blacksmith?.stats?.player &&
            typeof blacksmith.stats.player.getSessionStats === 'function'
        );

        let totalSessionSeconds = 0;
        let sessionAttempted = false;
        let sessionSucceeded = false;

        try {
            // Get fresh reference to Blacksmith API
            if (!blacksmith?.stats?.player) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    MODULE.NAME,
                    'Blacksmith Stats API (player) not available',
                    { blacksmith },
                    false,
                    false
                );
                return data;
            }

            // Get all player characters
            const playerCharacters = game.actors.filter(actor => 
                actor.type === 'character' && actor.hasPlayerOwner
            );

            // Initialize stat tracking
            let hitsByPlayer = new Map();
            let critsByPlayer = new Map();
            let turnTimeByPlayer = new Map();

            // Process each player's stats
            for (const actor of playerCharacters) {
                try {
                    const stats = await blacksmith.stats.player.getLifetimeStats(actor.id);
                    
                    if (!stats) {
                        continue;
                    }

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

                    if (canUseSessionStats) {
                        sessionAttempted = true;
                        try {
                            const sessionStats = blacksmith.stats.player.getSessionStats(actor.id);
                            if (sessionStats?.turnStats?.total) {
                                totalSessionSeconds += Number(sessionStats.turnStats.total) || 0;
                                sessionSucceeded = true;
                            } else if (Array.isArray(sessionStats?.currentCombat?.turns)) {
                                for (const turn of sessionStats.currentCombat.turns) {
                                    if (typeof turn?.duration === 'number') {
                                        totalSessionSeconds += turn.duration;
                                        sessionSucceeded = true;
                                    }
                                }
                            }
                        } catch (sessionError) {
                            getBlacksmith()?.utils.postConsoleAndNotification(
                                MODULE.NAME,
                                'PARTY STATS failed to read session stats',
                                { actor: actor.name, sessionError },
                                true,
                                false
                            );
                            console.error('Error reading Blacksmith session stats:', sessionError);
                        }
                    }

                } catch (error) {
                    console.error(`Error processing stats for ${actor.name}:`, { actor: actor.name, error });
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

            if (canUseSessionStats && totalSessionSeconds > 0) {
                data.sessionDuration = blacksmith.utils.formatTime(totalSessionSeconds * 1000);

                if (data.totalHits > 0) {
                    const hours = totalSessionSeconds / 3600;
                    if (hours > 0) {
                        data.actionsPerHour = Math.round(data.totalHits / hours);
                    }
                }
            }

        } catch (error) {
            console.error('Error gathering party stats:', error);
        } finally {
            if (sessionAttempted && !sessionSucceeded) {
                this._scheduleSessionRetry();
            }
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

        // Note: Hooks are now managed centrally by HookManager
        // No need to register hooks here anymore
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
        // Note: Hooks are now managed centrally by HookManager
        // No need to manually remove hooks here anymore
        if (this._sessionRetryTimeout) {
            clearTimeout(this._sessionRetryTimeout);
            this._sessionRetryTimeout = null;
            this._sessionRetryAttempts = 0;
        }
        this.element = null;
    }

    _scheduleSessionRetry() {
        const MAX_RETRIES = 6;
        if (this._sessionRetryTimeout || this._sessionRetryAttempts >= MAX_RETRIES) {
            return;
        }

        const delay = 500 * Math.pow(2, this._sessionRetryAttempts);
        this._sessionRetryAttempts += 1;

        this._sessionRetryTimeout = setTimeout(async () => {
            this._sessionRetryTimeout = null;
            if (this.element) {
                await this._updateDisplay();
            }
        }, delay);
    }
} 
