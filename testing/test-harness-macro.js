// ==================================================================
// ===== SQUIRE TEST HARNESS (testing/test-harness-macro.js) ========
// ==================================================================
// Paste this entire file into a Foundry SCRIPT macro and run it as GM.
// It exercises Squire's real public windows, Blacksmith dialog contract,
// transfer entry points, quest data, and source-level migration audits.
//
// Setup:
//   - Run as GM after Blacksmith and Squire finish loading.
//   - Target a token first (falls back to the first selected token).
//   - Tests marked "LIVE" can change world data and always confirm first.
//   - Keep F12 open. Every scenario reports a concise result here and a
//     detailed record to the console.
// ==================================================================

(async () => {

const SQUIRE_ID = 'coffee-pub-squire';
const BLACKSMITH_ID = 'coffee-pub-blacksmith';
const MODULE_PATH = `/modules/${SQUIRE_ID}/scripts`;

const squire = game.modules.get(SQUIRE_ID)?.api;
const blacksmith = game.modules.get(BLACKSMITH_ID)?.api;
if (!game.user?.isGM) return ui.notifications.warn('The Squire test harness must be run by a GM.');
if (!squire) return ui.notifications.error('Squire API is unavailable. Refresh Foundry and try again.');
if (!blacksmith) return ui.notifications.error('Blacksmith API is unavailable. Refresh Foundry and try again.');
if (!blacksmith.dialog) return ui.notifications.error('Blacksmith api.dialog is unavailable.');

const {
    showJournalPicker,
    showPagePicker
} = await import(`${MODULE_PATH}/utility-journal.js`);
const { openDataExportWindow } = await import(`${MODULE_PATH}/window-data-export.js`);
const { CharactersWindow } = await import(`${MODULE_PATH}/window-characters.js`);
const { UsersWindow } = await import(`${MODULE_PATH}/window-users.js`);
const { normalizeQuestCategory, normalizeQuestStatus } = await import(`${MODULE_PATH}/utility-quest-parser.js`);

const DialogV2 = foundry.applications.api.DialogV2;
const SOURCE_FILES = [
    'helpers.js',
    'manager-panel.js',
    'manager-pins.js',
    'panel-codex.js',
    'panel-inventory.js',
    'panel-notes.js',
    'panel-party.js',
    'panel-quest.js',
    'panel-weapons.js',
    'squire.js',
    'utility-journal.js',
    'window-quest.js'
];

function subjectToken() {
    const token = Array.from(game.user.targets ?? [])[0] ?? canvas.tokens.controlled[0] ?? null;
    if (!token?.actor) ui.notifications.warn('Target or select a token with an Actor first.');
    return token?.actor ? token : null;
}

function subjectActor() {
    return subjectToken()?.actor ?? null;
}

function configuredJournal(setting) {
    const id = game.settings.get(SQUIRE_ID, setting);
    return id && id !== 'none' ? game.journal.get(id) : null;
}

function actorItems(actor) {
    return actor?.items?.filter(item => item.type !== 'spell' && item.type !== 'feat') ?? [];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function logResult(label, detail, level = 'info') {
    const record = { label, detail, timestamp: new Date().toISOString() };
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('SQUIRE HARNESS', record);
    const output = document.querySelector('.squire-harness-output');
    if (output) {
        const row = document.createElement('div');
        row.className = `squire-harness-result ${level}`;
        row.textContent = `${new Date().toLocaleTimeString()} · ${label}: ${detail}`;
        output.prepend(row);
    }
    ui.notifications[level](`${label}: ${detail}`);
}

async function confirmLive(title, content) {
    return blacksmith.dialog.confirm({
        title,
        content,
        confirmLabel: 'Run Live Test',
        confirmIcon: 'fa-solid fa-flask',
        destructive: true
    });
}

async function openRegisteredWindow(id, options = {}) {
    if (typeof blacksmith.openWindow !== 'function') throw new Error('Blacksmith openWindow is unavailable.');
    const result = await blacksmith.openWindow(id, options);
    if (!result) throw new Error(`Window "${id}" did not open.`);
    return result;
}

const TABS = [
    { id: 'windows', label: '🪟 Windows' },
    { id: 'dialogs', label: '💬 Dialogs' },
    { id: 'transfers', label: '↔️ Transfers' },
    { id: 'quests', label: '🧭 Quests' },
    { id: 'audit', label: '🔎 Audit' }
];

const SCENARIOS = [
    {
        tab: 'windows',
        label: 'Open Dice Tray',
        run: async () => {
            await openRegisteredWindow(squire.DICE_TRAY_WINDOW_ID || `${SQUIRE_ID}-dice-tray-window`);
            logResult('Dice Tray', 'opened through Blacksmith Window API');
        }
    },
    {
        tab: 'windows',
        label: 'Open Macros',
        run: async () => {
            await openRegisteredWindow(squire.MACROS_WINDOW_ID || `${SQUIRE_ID}-macros-window`);
            logResult('Macros', 'opened through Blacksmith Window API');
        }
    },
    {
        tab: 'windows',
        label: 'Open Health',
        run: async () => {
            await openRegisteredWindow(squire.HEALTH_WINDOW_ID || `${SQUIRE_ID}-health-window`);
            logResult('Health', 'opened; verify current selection and live bars');
        }
    },
    {
        tab: 'windows',
        label: 'Open Status Effects → subject',
        run: async () => {
            const actor = subjectActor();
            if (!actor) return;
            await squire.openStatusEffectsWindow({ actor });
            logResult('Status Effects', `opened for ${actor.name}`);
        }
    },
    {
        tab: 'windows',
        label: 'Open new Codex editor',
        run: async () => {
            await squire.openCodexWindow();
            logResult('Codex editor', 'opened a new unsaved editor');
        }
    },
    {
        tab: 'windows',
        label: 'Open new Note editor',
        run: async () => {
            await squire.openNotesWindow();
            logResult('Note editor', 'opened a new unsaved editor');
        }
    },
    {
        tab: 'windows',
        label: 'Open new Quest editor',
        run: async () => {
            await squire.openQuestWindow();
            logResult('Quest editor', 'opened a new unsaved editor');
        }
    },
    {
        tab: 'windows',
        label: 'Open two Codex editors (instance safety)',
        run: async () => {
            await squire.openCodexWindow();
            await squire.openCodexWindow();
            logResult('Codex instance safety', 'opened two editors; edit/cancel each independently');
        }
    },
    {
        tab: 'windows',
        label: 'Preview shared Export window',
        run: () => {
            openDataExportWindow({
                title: 'Squire Harness Export Preview',
                data: JSON.stringify({ harness: true, world: game.world?.id, timestamp: new Date().toISOString() }, null, 2),
                filename: 'squire-harness-preview.json',
                summary: [
                    { label: 'Purpose', value: 'Visual and copy/download test' },
                    { label: 'Expected', value: 'Independent multi-instance ApplicationV2 window' }
                ],
                sceneNames: [canvas.scene?.name || 'No active scene']
            });
            logResult('Export window', 'opened a harmless sample export');
        }
    },

    {
        tab: 'dialogs',
        label: 'Confirm contract',
        run: async () => {
            const result = await blacksmith.dialog.confirm({
                title: 'Harness: Confirm',
                content: '<p>Confirm, Cancel, Escape, and title-bar close should all resolve without console errors.</p>',
                confirmLabel: 'Confirm Test',
                confirmIcon: 'fa-solid fa-check'
            });
            logResult('Confirm contract', `resolved ${String(result)}`);
        }
    },
    {
        tab: 'dialogs',
        label: 'Choose contract',
        run: async () => {
            const result = await blacksmith.dialog.choose({
                title: 'Harness: Choose',
                content: '<p>Choose one result or dismiss the dialog.</p>',
                choices: [
                    { id: 'alpha', label: 'Alpha', icon: 'fa-solid fa-a' },
                    { id: 'beta', label: 'Beta', icon: 'fa-solid fa-b' }
                ],
                cancelValue: null,
                closeValue: null
            });
            logResult('Choose contract', JSON.stringify(result));
        }
    },
    {
        tab: 'dialogs',
        label: 'Prompt validation/reopen',
        run: async () => {
            const result = await blacksmith.dialog.prompt({
                title: 'Harness: Prompt',
                content: ({ value }) => `<div class="form-group"><label>Required value</label><input name="value" value="${escapeHtml(value)}"></div>`,
                submitLabel: 'Validate',
                focusSelector: '[name="value"]',
                getValue: form => form.elements.value.value.trim(),
                validate: value => value ? null : 'Enter a value. The dialog should reopen and display this message.',
                cancelValue: null,
                closeValue: null
            });
            logResult('Prompt contract', JSON.stringify(result));
        }
    },
    {
        tab: 'dialogs',
        label: 'Wait contract',
        run: async () => {
            const result = await blacksmith.dialog.wait({
                title: 'Harness: Wait',
                content: '<p>Callbacks run after the dialog closes.</p><input name="sample" value="captured value">',
                buttons: [
                    { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' },
                    {
                        action: 'capture',
                        label: 'Capture',
                        icon: 'fa-solid fa-camera',
                        default: true,
                        callback: form => form.elements.sample.value
                    }
                ],
                cancelValue: null,
                closeValue: null
            });
            logResult('Wait contract', JSON.stringify(result));
        }
    },
    {
        tab: 'dialogs',
        label: 'Journal picker (no setting change)',
        run: async () => {
            await showJournalPicker({
                title: 'Harness: Journal Picker',
                selectedId: 'none',
                hint: 'This test reports the selection but does not change a setting.',
                onSelect: async id => logResult('Journal picker', `selected ${game.journal.get(id)?.name || id}`)
            });
        }
    },
    {
        tab: 'dialogs',
        label: 'Journal page picker',
        run: async () => {
            const journal = configuredJournal('questJournal') || configuredJournal('codexJournal') || configuredJournal('notesJournal') || game.journal.contents[0];
            if (!journal) return ui.notifications.warn('Create or configure a Journal first.');
            await showPagePicker(journal, {
                onSelect: async id => logResult('Page picker', `selected ${journal.pages.get(id)?.name || id}`)
            });
        }
    },

    {
        tab: 'transfers',
        label: 'Quantity control preview',
        run: async () => {
            const actor = subjectActor();
            if (!actor) return;
            const item = actorItems(actor).find(entry => Number(entry.system?.quantity) > 1) || actorItems(actor)[0];
            if (!item) return ui.notifications.warn(`${actor.name} has no suitable item.`);
            const max = Math.max(2, Number(item.system?.quantity) || 5);
            const timestamp = Date.now();
            const content = await foundry.applications.handlebars.renderTemplate(
                `modules/${SQUIRE_ID}/templates/window-transfer.hbs`,
                {
                    sourceItem: item,
                    sourceActor: actor,
                    targetActor: actor,
                    maxQuantity: max,
                    timestamp,
                    canAdjustQuantity: true,
                    isReceiveRequest: false,
                    hasQuantity: true
                }
            );
            const result = await blacksmith.dialog.wait({
                title: 'Harness: Transfer Quantity',
                content,
                classes: ['transfer-item'],
                buttons: [
                    { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' },
                    {
                        action: 'inspect',
                        label: 'Inspect Only',
                        icon: 'fa-solid fa-magnifying-glass',
                        default: true,
                        callback: form => Number(form.elements[`quantity_${timestamp}`]?.value) || 1
                    }
                ],
                onRender: root => {
                    const input = root.querySelector(`[name="quantity_${timestamp}"]`);
                    const selected = root.querySelector('.quantity-label');
                    const remaining = root.querySelector('.range-value');
                    const update = () => {
                        const value = Number(input?.value) || 1;
                        if (selected) selected.textContent = value;
                        if (remaining) remaining.textContent = Math.max(0, max - value);
                    };
                    input?.addEventListener('input', update);
                    update();
                }
            });
            logResult('Quantity control', `resolved ${JSON.stringify(result)}; no item moved`);
        }
    },
    {
        tab: 'transfers',
        label: 'Recipient picker preview',
        run: async () => {
            const actor = subjectActor();
            if (!actor) return;
            const item = actorItems(actor)[0];
            if (!item) return ui.notifications.warn(`${actor.name} has no item to preview.`);
            const picker = new CharactersWindow({
                item,
                sourceActor: actor,
                sourceItemId: item.id,
                selectedQuantity: 1,
                hasQuantity: item.system?.quantity != null,
                onCharacterSelected: async target => logResult('Recipient picker', `selected ${target.name}; no transfer executed`),
                onClose: () => {}
            });
            await picker.render(true);
        }
    },
    {
        tab: 'transfers',
        label: 'Player picker preview',
        run: async () => {
            const picker = new UsersWindow({
                onUserSelected: async user => logResult('Player picker', `selected ${user.name}; no note sent`),
                onClose: () => {}
            });
            await picker.render(true);
        }
    },
    {
        tab: 'transfers',
        label: 'Approval dialog preview',
        run: async () => {
            const actor = subjectActor();
            if (!actor) return;
            const item = actorItems(actor)[0];
            if (!item) return ui.notifications.warn(`${actor.name} has no item to preview.`);
            const content = await foundry.applications.handlebars.renderTemplate(
                `modules/${SQUIRE_ID}/templates/window-transfer.hbs`,
                {
                    sourceItem: item,
                    sourceActor: actor,
                    targetActor: actor,
                    selectedQuantity: 1,
                    canAdjustQuantity: false,
                    isReceiveRequest: true,
                    hasQuantity: item.system?.quantity != null
                }
            );
            const accepted = await blacksmith.dialog.confirm({
                title: 'Harness: Item Transfer Request',
                content,
                classes: ['transfer-item'],
                confirmLabel: 'Accept Preview',
                confirmIcon: 'fa-solid fa-check',
                cancelLabel: 'Decline Preview',
                cancelIcon: 'fa-solid fa-xmark'
            });
            logResult('Approval preview', `${accepted ? 'accepted' : 'declined/dismissed'}; no socket message sent`);
        }
    },
    {
        tab: 'transfers',
        label: '⚠ LIVE inventory transfer',
        run: async () => {
            const panel = squire.PanelManager?.instance?.inventoryPanel;
            const actor = panel?.actor || subjectActor();
            const item = actorItems(actor).find(entry => Number(entry.system?.quantity) > 0);
            if (!panel || !item) return ui.notifications.warn('Open the Squire tray on a character with an inventory item first.');
            const confirmed = await confirmLive(
                'Run Live Transfer?',
                `<p>This opens Squire's real transfer pipeline for <strong>${escapeHtml(item.name)}</strong>. Choosing a recipient can move the item and create real chat/socket activity.</p>`
            );
            if (!confirmed) return;
            await panel._openCharacterSelection(item);
            logResult('Live transfer', `opened real workflow for ${item.name}`, 'warn');
        }
    },

    {
        tab: 'quests',
        label: 'Audit configured quest data',
        run: () => {
            const journal = configuredJournal('questJournal');
            if (!journal) return ui.notifications.warn('No Quest journal is configured.');
            const report = { pages: journal.pages.size, categories: {}, statuses: {}, legacyOutcomeFlags: 0 };
            for (const page of journal.pages) {
                const content = String(page.text?.content || '');
                const category = content.match(/<strong>Category:<\/strong>\s*([^<]*)/i)?.[1]?.trim() || '(missing)';
                const status = content.match(/<strong>Status:<\/strong>\s*([^<]*)/i)?.[1]?.trim() || '(missing)';
                report.categories[category] = (report.categories[category] || 0) + 1;
                report.statuses[status] = (report.statuses[status] || 0) + 1;
                if (page.getFlag(SQUIRE_ID, 'questOutcome') != null || /<strong>Outcome:<\/strong>/i.test(content)) report.legacyOutcomeFlags++;
            }
            console.table(report.categories);
            console.table(report.statuses);
            logResult('Quest audit', `${journal.name}: ${report.pages} pages, ${report.legacyOutcomeFlags} legacy outcome records`);
        }
    },
    {
        tab: 'quests',
        label: 'Normalize sample values (read-only)',
        run: () => {
            const samples = [
                ['Main Quest', 'Available'],
                ['Side Quest', 'Active'],
                ['Completed', 'Complete'],
                ['Failed', 'Failed'],
                ['Badlands > Oasis', 'In Progress']
            ].map(([category, status]) => ({
                input: `${category} / ${status}`,
                normalized: `${normalizeQuestCategory(category)} / ${normalizeQuestStatus(status)}`
            }));
            console.table(samples);
            logResult('Quest normalization', 'sample mappings written to console');
        }
    },
    {
        tab: 'quests',
        label: '⚠ LIVE migrate quest journal',
        run: async () => {
            const journal = configuredJournal('questJournal');
            if (!journal) return ui.notifications.warn('No Quest journal is configured.');
            const confirmed = await confirmLive(
                'Migrate Quest Journal?',
                `<p>This repeat-safe migration updates real pages in <strong>${escapeHtml(journal.name)}</strong> and removes obsolete outcome/category flags.</p>`
            );
            if (!confirmed) return;
            const result = await squire.migrateQuestJournalData(journal);
            logResult('Quest migration', JSON.stringify(result), 'warn');
        }
    },

    {
        tab: 'audit',
        label: 'Entity List: Light → Dark → Glass',
        run: async () => {
            if (!blacksmith.entityList) throw new Error('Blacksmith api.entityList is unavailable.');
            const ToolBase = blacksmith.BlacksmithToolWindowBaseV2 || blacksmith.getToolWindowBaseV2?.();
            if (!ToolBase) throw new Error('BlacksmithToolWindowBaseV2 is unavailable.');
            const entities = [
                {
                    id: 'selected',
                    name: 'Selected Hero',
                    img: subjectActor()?.img || 'icons/svg/mystery-man.svg',
                    type: 'Character',
                    badges: [{ label: 'Selected', variant: 'success' }]
                },
                {
                    id: 'available',
                    name: 'Available Ally',
                    img: 'icons/svg/mystery-man.svg',
                    type: 'Character',
                    badges: ['Online']
                },
                {
                    id: 'disabled',
                    name: 'Unavailable Recipient',
                    img: 'icons/svg/mystery-man.svg',
                    type: 'Character',
                    disabled: true,
                    disabledReason: 'Harness disabled-state example',
                    badges: [{ label: 'Disabled', variant: 'warning' }]
                }
            ];
            const list = blacksmith.entityList.create({
                entities,
                mode: 'single',
                inputName: 'squire-harness-entity',
                selected: 'selected',
                onSelectionChange: ({ selected }) => {
                    logResult('Entity List selection', selected.map(entity => entity.name).join(', ') || 'none');
                }
            });

            class SquireEntityThemeProbe extends ToolBase {
                static DEFAULT_OPTIONS = foundry.utils.mergeObject(
                    foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
                    {
                        id: 'squire-entity-theme-probe',
                        rememberPosition: false,
                        position: { width: 360, height: 'auto' },
                        window: { title: 'Squire Entity List Theme Test', resizable: false }
                    }
                );
                async getData() {
                    return { appId: this.id, bodyContent: list.html };
                }
                async _onRender(context, options) {
                    await super._onRender?.(context, options);
                    list.attach(this.element);
                }
                _onClose(options) {
                    list.destroy();
                    return super._onClose?.(options);
                }
            }

            const probe = new SquireEntityThemeProbe();
            await probe.render(true);
            for (const theme of ['light', 'dark', 'glass']) {
                await probe.setToolTheme(theme);
                logResult('Entity List theme', `${theme}: inspect portraits, names, badges, disabled reason, and selected ring`);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            logResult('Entity List themes', 'cycle complete; probe left open on Glass for inspection');
        }
    },
    {
        tab: 'audit',
        label: 'Two-instance Tool action delegation',
        run: async () => {
            const ToolBase = blacksmith.BlacksmithToolWindowBaseV2 || blacksmith.getToolWindowBaseV2?.();
            if (!ToolBase) throw new Error('BlacksmithToolWindowBaseV2 is unavailable.');

            class SquireDelegationProbe extends ToolBase {
                static DEFAULT_OPTIONS = foundry.utils.mergeObject(
                    foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
                    {
                        rememberPosition: false,
                        position: { width: 260, height: 'auto' },
                        window: { title: 'Delegation Probe', resizable: false }
                    }
                );
                static ACTION_HANDLERS = {
                    prove: (_event, _target, win) => win.recordAction()
                };
                constructor(label) {
                    super({
                        id: `squire-delegation-probe-${label.toLowerCase()}-${foundry.utils.randomID(4)}`,
                        window: { title: `Delegation Probe ${label}` }
                    });
                    this.label = label;
                    this.hits = 0;
                }
                async getData() {
                    return {
                        appId: this.id,
                        bodyContent: `<div style="padding:8px">
                            <p>Instance <strong>${escapeHtml(this.label)}</strong></p>
                            <button type="button" data-action="prove">Route action to ${escapeHtml(this.label)}</button>
                            <div class="squire-delegation-result">Hits: ${this.hits}</div>
                        </div>`
                    };
                }
                recordAction() {
                    this.hits += 1;
                    const result = this.element?.querySelector('.squire-delegation-result');
                    if (result) result.textContent = `Hits: ${this.hits}`;
                }
            }

            const first = new SquireDelegationProbe('A');
            const second = new SquireDelegationProbe('B');
            await first.render(true);
            await second.render(true);
            first.element?.querySelector('[data-action="prove"]')?.click();
            second.element?.querySelector('[data-action="prove"]')?.click();
            const passed = first.hits === 1 && second.hits === 1;
            logResult(
                'Two-instance delegation',
                passed
                    ? 'PASS: A received A click and B received B click; both probes left open'
                    : `FAIL: A=${first.hits}, B=${second.hits}`,
                passed ? 'info' : 'error'
            );
            if (!passed) throw new Error(`Per-instance delegation failed: A=${first.hits}, B=${second.hits}`);
        }
    },
    {
        tab: 'audit',
        label: 'Blacksmith capability report',
        run: () => {
            const report = {
                dialog: Object.keys(blacksmith.dialog || {}),
                importer: Object.keys(blacksmith.importer || {}),
                windowBase: Boolean(blacksmith.BlacksmithWindowBaseV2 || blacksmith.getWindowBaseV2?.()),
                toolBase: Boolean(blacksmith.BlacksmithToolWindowBaseV2 || blacksmith.getToolWindowBaseV2?.()),
                openWindow: typeof blacksmith.openWindow === 'function'
            };
            console.log('SQUIRE HARNESS | Blacksmith capabilities', report);
            logResult('Blacksmith capabilities', `dialog=${report.dialog.join(', ') || 'missing'}; importer=${report.importer.join(', ') || 'not published'}`);
        }
    },
    {
        tab: 'audit',
        label: 'Squire public API report',
        run: () => {
            const keys = Object.keys(squire).sort();
            console.log('SQUIRE HARNESS | Squire API', keys);
            logResult('Squire API', `${keys.length} exported members; details in console`);
        }
    },
    {
        tab: 'audit',
        label: 'Scan source for legacy Dialog APIs',
        run: async () => {
            const matches = [];
            for (const file of SOURCE_FILES) {
                const response = await fetch(`${MODULE_PATH}/${file}?harness=${Date.now()}`);
                if (!response.ok) {
                    matches.push(`${file}: fetch ${response.status}`);
                    continue;
                }
                const source = await response.text();
                const count = (source.match(/\b(?:new\s+Dialog|Dialog\.(?:confirm|wait|prompt))\b/g) || []).length;
                if (count) matches.push(`${file}: ${count}`);
            }
            console.log('SQUIRE HARNESS | Legacy Dialog audit', matches);
            logResult('Legacy Dialog audit', matches.length ? `FOUND ${matches.join(', ')}` : `clean across ${SOURCE_FILES.length} migration files`, matches.length ? 'warn' : 'info');
        }
    },
    {
        tab: 'audit',
        label: 'Subject and selection report',
        run: () => {
            const token = subjectToken();
            if (!token) return;
            const actor = token.actor;
            const hp = actor.system?.attributes?.hp;
            const report = {
                token: token.name,
                actor: actor.name,
                type: actor.type,
                hp: `${hp?.value ?? '?'} / ${hp?.max ?? '?'}`,
                items: actor.items.size,
                effects: actor.effects.size,
                controlled: canvas.tokens.controlled.map(entry => entry.name),
                targeted: Array.from(game.user.targets ?? []).map(entry => entry.name)
            };
            console.table(report);
            logResult('Subject report', `${actor.name}: HP ${report.hp}, ${report.items} items, ${report.effects} effects`);
        }
    },
    {
        tab: 'audit',
        label: 'Configured journal report',
        run: () => {
            const settings = ['notesJournal', 'codexJournal', 'questJournal'];
            const report = Object.fromEntries(settings.map(key => {
                const id = game.settings.get(SQUIRE_ID, key);
                return [key, { id, name: game.journal.get(id)?.name || '(not configured)' }];
            }));
            console.table(report);
            logResult('Journal settings', settings.map(key => `${key}=${report[key].name}`).join(' · '));
        }
    }
];

const tabButtons = TABS.map((tab, index) => `
    <button type="button" data-tab-button="${tab.id}"
        style="flex:1; padding:6px 4px; white-space:nowrap; ${index === 0 ? 'font-weight:700; border-bottom:2px solid var(--color-warm-2, #c9a66b);' : 'opacity:0.7;'}">
        ${tab.label}
    </button>`).join('');

const tabPanels = TABS.map((tab, index) => `
    <section data-tab-panel="${tab.id}" style="display:${index === 0 ? 'block' : 'none'};">
        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px;">
            ${SCENARIOS.map((scenario, scenarioIndex) => scenario.tab === tab.id ? `
                <button type="button" data-scenario="${scenarioIndex}"
                    style="width:100%; min-height:34px; margin:0; padding:6px 8px; text-align:left; white-space:normal; line-height:1.2;">
                    ${scenario.label}
                </button>` : '').join('')}
        </div>
    </section>`).join('');

await DialogV2.wait({
    window: { title: 'Squire Test Harness' },
    content: `
        <p style="margin:0 0 8px;">Target a token first. The harness stays open so scenarios can be run repeatedly.
        Tests prefixed <strong>LIVE</strong> modify world data only after a second confirmation.</p>
        <nav style="display:flex; gap:2px; margin-bottom:6px;">${tabButtons}</nav>
        ${tabPanels}
        <hr>
        <div class="squire-harness-output" style="max-height:120px; overflow:auto; display:flex; flex-direction:column; gap:2px; font-size:0.85em;"></div>`,
    buttons: [{ action: 'close', label: 'Close', icon: 'fa-solid fa-xmark', default: true }],
    position: { width: 900, height: 'auto' },
    rejectClose: false,
    render: (_event, dialog) => {
        const root = dialog?.element ?? dialog;
        root.querySelectorAll('[data-scenario]').forEach(button => {
            button.addEventListener('click', async () => {
                const scenario = SCENARIOS[Number(button.dataset.scenario)];
                button.disabled = true;
                try {
                    await scenario.run();
                } catch (error) {
                    console.error('SQUIRE HARNESS | Scenario failed', scenario.label, error);
                    logResult(scenario.label, error?.message || String(error), 'error');
                } finally {
                    button.disabled = false;
                }
            });
        });
        root.querySelectorAll('[data-tab-button]').forEach(tabButton => {
            tabButton.addEventListener('click', () => {
                const target = tabButton.dataset.tabButton;
                root.querySelectorAll('[data-tab-panel]').forEach(panel => {
                    panel.style.display = panel.dataset.tabPanel === target ? 'block' : 'none';
                });
                root.querySelectorAll('[data-tab-button]').forEach(button => {
                    const active = button.dataset.tabButton === target;
                    button.style.fontWeight = active ? '700' : '400';
                    button.style.opacity = active ? '1' : '0.7';
                    button.style.borderBottom = active ? '2px solid var(--color-warm-2, #c9a66b)' : 'none';
                });
            });
        });
    }
});

})().catch(error => {
    console.error('SQUIRE HARNESS | Fatal error', error);
    ui.notifications.error(`Squire test harness failed: ${error?.message || error}`);
});
