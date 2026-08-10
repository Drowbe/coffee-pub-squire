import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, getNativeElement, getPartyActors, openPartyStatsWindow, openPlayerStatsWindow } from './helpers.js';
import { trackModuleTimeout } from './timer-utils.js';

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PartyStatsPanel {
    constructor() {
        this.element = null;
        this._boundUpdateHandler = this._onStatsUpdate.bind(this);
        this._updateTimer = null;
    }

    async getData() {
        const payload = {
            hasBlacksmith: false,
            leaderboard: [],
            isGM: game.user.isGM
        };

        if (window.BlacksmithAPI?.waitForReady) {
            try {
                await window.BlacksmithAPI.waitForReady();
            } catch (readyError) {
                console.error('Error waiting for Blacksmith readiness:', readyError);
            }
        }

        const blacksmith = getBlacksmith();
        const playerApi = blacksmith?.stats?.player;

        if (!playerApi || typeof playerApi.getStats !== 'function') {
            getBlacksmith()?.utils?.postConsoleAndNotification(
                MODULE.NAME,
                'Blacksmith Stats API (player) not available for MVP leaderboard',
                { playerApi },
                false,
                false
            );
            return payload;
        }

        payload.hasBlacksmith = true;

        const playerActors = getPartyActors();

        // Fetch all members' stats concurrently instead of one sequential await per actor
        const entries = await Promise.all(playerActors.map(async (actor) => {
            try {
                const stats = await playerApi.getStats(actor.id);
                const mvp = stats?.lifetime?.mvp;

                // Every party member appears, including those who have not fought
                // yet. Dropping them made the board answer "who has scored?" when
                // the question it is asked is "how is the party doing?" — and a
                // new character silently missing from the roster reads as a bug.
                const combats = Number(mvp?.combats ?? 0);

                return {
                    actorId: actor.id,
                    rank: 0,
                    name: actor.prototypeToken?.name ?? actor.name,
                    img: actor.img,
                    totalScore: Number(mvp?.totalScore ?? 0),
                    combats,
                    averageScore: Number(mvp?.averageScore ?? 0),
                    bestScore: Number(mvp?.highScore ?? 0),
                    unranked: combats <= 0
                };
            } catch (error) {
                getBlacksmith()?.utils?.postConsoleAndNotification(
                    MODULE.NAME,
                    'PARTY STATS failed to load player MVP data',
                    { actorId: actor.id, error },
                    true,
                    false
                );
                console.error(`Error loading MVP stats for ${actor.name}:`, error);
                return null;
            }
        }));
        payload.leaderboard.push(...entries.filter(Boolean));

        // Unfought members sort last regardless of score, then by name, so the
        // ranked part of the board is not interrupted by a run of zeroes.
        payload.leaderboard.sort((a, b) => {
            if (a.unranked !== b.unranked) return a.unranked ? 1 : -1;
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return a.name.localeCompare(b.name);
        });
        payload.leaderboard.forEach((entry, index) => {
            // Rank numbers only mean something once there is a score behind them;
            // an unfought member gets a dash rather than a place it did not earn.
            entry.rank = entry.unranked ? '—' : index + 1;
            entry.totalScoreDisplay = entry.unranked ? '—' : entry.totalScore.toFixed(1);
            entry.averageScoreDisplay = entry.unranked ? '—' : entry.averageScore.toFixed(2);
            entry.bestScoreDisplay = entry.unranked ? '—' : entry.bestScore.toFixed(1);
            entry.combatsDisplay = entry.unranked ? '—' : entry.combats;
        });

        return payload;
    }

    _onStatsUpdate() {
        if (!this.element) return;
        // Debounce: combat rounds and roll bursts fire several hooks back-to-back;
        // one trailing recompute is enough for a leaderboard
        if (this._updateTimer) clearTimeout(this._updateTimer);
        this._updateTimer = trackModuleTimeout(async () => {
            this._updateTimer = null;
            if (this.element) await this._updateDisplay();
        }, 250);
    }

    async render(element) {
        if (!element) return;
        this.element = element;
        await this._updateDisplay();
    }

    async _updateDisplay() {
        const data = await this.getData();
        const content = await renderTemplate(TEMPLATES.PANEL_PARTY_STATS, data);

        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (nativeElement) {
            const panel = nativeElement.querySelector('[data-panel="party-stats"]');
            if (panel) {
                panel.innerHTML = content;
                this._activateListeners(panel);
            }
        }
    }

    /**
     * The leaderboard is a summary; the detail lives in Blacksmith's stats
     * windows. A row opens that player's stats, the header icon opens the
     * party view — so there is a way to the whole set from a single row.
     *
     * Bound after every render because the panel replaces its own innerHTML.
     */
    _activateListeners(panel) {
        panel.querySelectorAll('[data-action="open-player-stats"]').forEach((row) => {
            const open = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await openPlayerStatsWindow(row.dataset.actorId);
            };
            row.addEventListener('click', open);
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') open(event);
            });
        });

        const all = panel.querySelector('[data-action="open-party-stats"]');
        if (!all) return;
        const openAll = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await openPartyStatsWindow();
        };
        all.addEventListener('click', openAll);
        all.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') openAll(event);
        });
    }

    destroy() {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = null;
        }
        this.element = null;
    }
}

