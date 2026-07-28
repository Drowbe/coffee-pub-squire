import { MODULE, TEMPLATES } from './const.js';
import { renderTemplate, getNativeElement } from './helpers.js';

export class CharacterSummaryPanel {
    constructor(actor) {
        this.actor = actor;
        this.element = null;
    }

    async render(html) {
        if (html) this.element = html;
        const root = getNativeElement(this.element);
        const panel = root?.querySelector?.('[data-panel="character-summary"]');
        if (!panel || !this.actor) return;

        const abilities = Object.entries(this.actor.system?.abilities || {}).map(([key, ability]) => {
            const configuredAbility = CONFIG.DND5E?.abilities?.[key];
            const configuredLabel = typeof configuredAbility === 'string'
                ? configuredAbility
                : configuredAbility?.label;
            return {
                key,
                label: game.i18n.localize(configuredLabel || key),
                mod: ability.mod,
                value: ability.value
            };
        });
        const skills = Object.entries(this.actor.system?.skills || {}).map(([key, skill]) => {
            const configuredSkill = CONFIG.DND5E?.skills?.[key];
            const configuredLabel = typeof configuredSkill === 'string'
                ? configuredSkill
                : configuredSkill?.label;
            return {
                key,
                shortLabel: key.slice(0, 3).toUpperCase(),
                label: game.i18n.localize(configuredLabel || key),
                mod: skill.mod ?? 0,
                proficient: Number(skill.value ?? skill.proficient ?? 0) > 0
            };
        });

        const content = await renderTemplate(TEMPLATES.PANEL_CHARACTER_SUMMARY, {
            actor: this.actor,
            abilities,
            skills,
            passivePerception: this.actor.system?.skills?.prc?.passive ?? 10,
            isCollapsed: game.settings.get(MODULE.ID, 'isCharacterSummaryPanelCollapsed')
        });
        panel.innerHTML = content;
        this._activateListeners(panel);
    }

    _activateListeners(panel) {
        const header = panel.querySelector('.character-summary-header');
        header?.addEventListener('click', async () => {
            const content = panel.querySelector('.character-summary-content');
            const toggle = panel.querySelector('.character-summary-toggle');
            if (!content || !toggle) return;
            const collapsed = content.classList.toggle('collapsed');
            toggle.classList.toggle('fa-chevron-right', collapsed);
            toggle.classList.toggle('fa-chevron-down', !collapsed);
            await game.settings.set(MODULE.ID, 'isCharacterSummaryPanelCollapsed', collapsed);
        });

        panel.querySelectorAll('.character-summary-ability[data-ability]').forEach((button) => {
            const rollTarget = button.querySelector('.character-summary-ability-roll');
            rollTarget?.addEventListener('click', async (event) => {
                const ability = button.dataset.ability;
                if (!ability) return;
                try {
                    await this.actor.rollAbilityCheck({ ability });
                } catch (error) {
                    console.error('Coffee Pub Squire | Ability check failed:', error);
                    ui.notifications.error('Failed to roll ability check.');
                }
            });
            rollTarget?.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                const ability = button.dataset.ability;
                if (!ability) return;
                try {
                    await this.actor.rollSavingThrow({ ability });
                } catch (error) {
                    console.error('Coffee Pub Squire | Saving throw failed:', error);
                    ui.notifications.error('Failed to roll saving throw.');
                }
            });
        });

        panel.querySelectorAll('.character-summary-skill[data-skill]').forEach((row) => {
            const rollTarget = row.querySelector('.character-summary-skill-roll');
            rollTarget?.addEventListener('click', async () => {
                const skill = row.dataset.skill;
                if (!skill) return;
                try {
                    await this.actor.rollSkill({ skill });
                } catch (error) {
                    console.error('Coffee Pub Squire | Skill check failed:', error);
                    ui.notifications.error('Failed to roll skill check.');
                }
            });
        });
    }
}
