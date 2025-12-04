import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate } from './helpers.js';

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class PartyStatsPanel {
    constructor() {
        this.element = null;
        this._boundUpdateHandler = this._onStatsUpdate.bind(this);
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

        const playerActors = game.actors.filter((actor) => actor.type === 'character' && actor.hasPlayerOwner && !actor.isToken);

        for (const actor of playerActors) {
            try {
                const stats = await playerApi.getStats(actor.id);
                const mvp = stats?.lifetime?.mvp;
                if (!mvp || (mvp.combats ?? 0) <= 0) continue;

                payload.leaderboard.push({
                    actorId: actor.id,
                    rank: 0,
                    name: actor.prototypeToken?.name ?? actor.name,
                    img: actor.img,
                    totalScore: Number(mvp.totalScore ?? 0),
                    combats: Number(mvp.combats ?? 0),
                    averageScore: Number(mvp.averageScore ?? 0),
                    bestScore: Number(mvp.highScore ?? 0)
                });
            } catch (error) {
                getBlacksmith()?.utils?.postConsoleAndNotification(
                    MODULE.NAME,
                    'PARTY STATS failed to load player MVP data',
                    { actorId: actor.id, error },
                    true,
                    false
                );
                console.error(`Error loading MVP stats for ${actor.name}:`, error);
            }
        }

        payload.leaderboard.sort((a, b) => b.totalScore - a.totalScore);
        payload.leaderboard.forEach((entry, index) => {
            entry.rank = index + 1;
            entry.totalScoreDisplay = entry.totalScore.toFixed(1);
            entry.averageScoreDisplay = entry.averageScore.toFixed(2);
            entry.bestScoreDisplay = entry.bestScore.toFixed(1);
        });

        return payload;
    }

    async _onStatsUpdate() {
        if (this.element) {
            await this._updateDisplay();
        }
    }

    async render(element) {
        if (!element) return;
        this.element = element;
        await this._updateDisplay();
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
        this.element = null;
    }
}
