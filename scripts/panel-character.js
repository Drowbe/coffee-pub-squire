import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { getTokenDisplayName, getNativeElement, getTextEditor, renderTemplate } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Register custom Handlebars helper for health percentage
Handlebars.registerHelper('healthOverlayHeight', function(hp) {
    if (!hp?.max) return '0%';
    const percentage = Math.round(100 - ((hp.value / hp.max) * 100));
    return `${percentage}%`;
});

export class CharacterPanel {
    constructor(actor) {
        this.actor = actor;
        this.displayName = actor?.name || '';
        
        // Render cancellation tracking to prevent race conditions
        this._renderInProgress = false;
        this._renderCancellationToken = null;
        
        // Bind the update method to this instance
        this._onActorUpdate = this._onActorUpdate.bind(this);
        
        // Note: Hooks are now managed centrally by HookManager
        // No need to register hooks here anymore
    }

    _onActorUpdate(document, change) {
        // Check if this update is for our actor and if HP changed
        if (document.id !== this.actor.id) return;
        if (!foundry.utils.hasProperty(change, "system.attributes.hp")) return;

        // Update the health overlay
        const hp = this.actor.system.attributes.hp;
        const percentage = Math.round(100 - ((hp.value / hp.max) * 100));
        const portraitElement = this.element?.find('.character-portrait');
        
        // Update health overlay height
        portraitElement?.find('.health-overlay').css('height', `${percentage}%`);
        
        // Update death skull
        if (hp.value <= 0) {
            if (!portraitElement?.find('.death-skull').length) {
                portraitElement?.append('<i class="fa-solid fa-skull death-skull"></i>');
            }
        } else {
            portraitElement?.find('.death-skull').remove();
        }
    }

    async render(html) {
        // Cancel any in-progress render to prevent race conditions
        if (this._renderInProgress) {
            this._renderCancellationToken = Symbol('cancelled');
        }
        
        // Create cancellation token for this render
        const currentToken = Symbol('render');
        this._renderCancellationToken = currentToken;
        this._renderInProgress = true;
        
        try {
            if (html) {
                this.element = html;
            }
            if (!this.element) {
                return; // finally block will clear _renderInProgress
            }

            // Prepare speed data - extract all speed types that have values
            // Always read from token.actor to get the synthetic/calculated actor (PCs & NPCs)
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            
            // Resolve the "selected token for this actor" first
            // Prefer controlled token, then fall back to active tokens on current scene
            const controlled = canvas.tokens?.controlled ?? [];
            let token = controlled.find(t => t.actor?.id === this.actor.id);
            
            if (!token) {
                // Fallback: any active token for this actor on the current scene
                const active = this.actor.getActiveTokens?.(true) ?? [];
                token = active.find(t => t.scene?.id === canvas.scene?.id) || active[0];
            }
            
            log(`CHARACTER DETAILS Token resolved: ${token ? token.id : "none"} for actor ${this.actor.id}`, '', false, false);
            
            // Prefer token.actor (synthetic) if we have it; otherwise the base actor
            const sourceActor = token?.actor ?? this.actor;
            const displayName = getTokenDisplayName(token, this.actor);
            this.displayName = displayName || this.actor.name;
            const mov = sourceActor?.system?.attributes?.movement ?? {};
            
            log(`CHARACTER DETAILS Movement data: ${JSON.stringify(mov)}`, '', false, false);
            
            // Build movement type list from system config (object OR array), with a stable fallback order
            let speedTypes;
            const mt = CONFIG.DND5E?.movementTypes;
            
            if (Array.isArray(mt)) {
                speedTypes = mt.slice();
            } else if (mt && typeof mt === "object") {
                // Keys are canonical type ids in newer 5e (e.g. walk, fly, swim, climb, burrow)
                speedTypes = Object.keys(mt);
            } else {
                speedTypes = ["burrow", "climb", "fly", "swim", "walk"];
            }
            
            // Ensure a good display order
            const desired = ["walk", "fly", "swim", "climb", "burrow"];
            speedTypes.sort((a, b) => desired.indexOf(a) - desired.indexOf(b));
            
            // Labels: prefer config labels when available
            const speedLabelFor = (type) => {
                if (mt && typeof mt === "object" && mt[type]) {
                    const labelValue = mt[type];
                    // v13: DND5E 5.1+ - movementTypes values are now objects with .label property
                    // The old string value can be accessed from .label
                    let label;
                    if (typeof labelValue === 'string') {
                        // Old format: direct string
                        label = labelValue;
                    } else if (labelValue && typeof labelValue === 'object' && labelValue.label) {
                        // New format: object with .label property
                        label = labelValue.label;
                    } else {
                        // Fallback: try to convert to string
                        label = String(labelValue || '');
                    }
                    // Localize if it's a localization key
                    return game.i18n?.localize?.(label) ?? label;
                }
                return type.charAt(0).toUpperCase() + type.slice(1);
            };
            
            const speeds = [];
            for (const type of speedTypes) {
                let v = mov[type];
                
                // Normalize: handle both {value: number} objects and direct numbers/strings
                if (v && typeof v === "object" && "value" in v) {
                    v = v.value;
                }
                
                // Only include if it's a valid number (not null, undefined, empty, or NaN)
                if (v != null && v !== "" && !Number.isNaN(Number(v))) {
                    const n = Number(v);
                    if (n > 0) {
                        speeds.push({ type, label: speedLabelFor(type), value: n });
                        log(`CHARACTER DETAILS Added speed: ${type}=${n}`, '', false, false);
                    }
                }
            }
            
            // Attach units and hover so the template can render "(hover)"
            const units = mov.units ?? "ft";
            const hover = !!mov.hover;
            
            log(`CHARACTER DETAILS Final speeds array: ${JSON.stringify(speeds)}`, '', false, false);

            // Prepare trait display helpers (resistances, immunities, etc.)
            const normalizeTraitValues = (trait) => {
                if (!trait) return { values: [], custom: '' };

                const raw = trait.value;
                let values = [];

                if (Array.isArray(raw)) {
                    values = raw;
                } else if (raw instanceof Set) {
                    values = Array.from(raw);
                } else if (raw instanceof Map) {
                    values = Array.from(raw.keys());
                } else if (raw && typeof raw === 'object') {
                    values = Object.keys(raw).filter(key => {
                        const entry = raw[key];
                        if (typeof entry === 'boolean') return entry;
                        if (entry instanceof Set || Array.isArray(entry)) return Array.from(entry).length > 0;
                        if (entry instanceof Map) return entry.size > 0;
                        if (entry && typeof entry === 'object' && 'value' in entry) return !!entry.value;
                        return true;
                    });
                } else if (typeof raw === 'string') {
                    values = raw.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                }

                const custom = (trait.custom || '').trim();

                return { values, custom };
            };

            const damageTypeLabels = CONFIG.DND5E?.damageTypes ?? {};
            const resistanceTypeLabels = CONFIG.DND5E?.damageResistanceTypes ?? damageTypeLabels;
            const immunityTypeLabels = CONFIG.DND5E?.damageImmunityTypes ?? damageTypeLabels;

            const resolveLabelEntry = (map, key) => {
                if (!map || key === undefined || key === null) return null;

                if (map instanceof Map) {
                    return map.get(key);
                }

                return map[key];
            };

            const normalizeLabelValue = (entry) => {
                if (!entry) return null;

                if (typeof entry === 'string') {
                    return entry;
                }

                if (Array.isArray(entry)) {
                    return normalizeLabelValue(entry[0]);
                }

                if (entry instanceof Map) {
                    const iterator = entry.values()?.next?.();
                    if (iterator && !iterator.done) {
                        return normalizeLabelValue(iterator.value);
                    }
                }

                if (typeof entry === 'object') {
                    if (typeof entry.label === 'string') return entry.label;
                    if (typeof entry.localizationKey === 'string') return entry.localizationKey;
                    if (typeof entry.name === 'string') return entry.name;
                }

                return null;
            };

            const safelyLocalize = (label) => {
                if (typeof label !== 'string' || label.length === 0) return null;
                try {
                    if (game.i18n?.localize) {
                        return game.i18n.localize(label);
                    }
                } catch (error) {
                    log(`CHARACTER DETAILS Localization failed for ${label}: ${error}`, '', false, false);
                }
                return label;
            };

            const labelDamageType = (value, labelMap) => {
                const rawLabel =
                    normalizeLabelValue(resolveLabelEntry(labelMap, value)) ??
                    normalizeLabelValue(resolveLabelEntry(damageTypeLabels, value));

                if (rawLabel) {
                    return safelyLocalize(rawLabel);
                }

                if (typeof value === 'string' && value.length > 0) {
                    return value.charAt(0).toUpperCase() + value.slice(1);
                }
                return null;
            };

            const buildTraitList = (trait, labelMap) => {
                const { values, custom } = normalizeTraitValues(trait);
                const labels = [];

                const rawLabels = trait?.labels ?? trait?.label;
                if (Array.isArray(rawLabels)) {
                    labels.push(...rawLabels);
                } else if (rawLabels instanceof Set) {
                    labels.push(...Array.from(rawLabels));
                } else if (rawLabels instanceof Map) {
                    labels.push(...Array.from(rawLabels.values()));
                } else if (typeof rawLabels === 'string') {
                    labels.push(...rawLabels.split(/[,;]+/).map(v => v.trim()).filter(Boolean));
                } else if (rawLabels && typeof rawLabels === 'object' && 'value' in rawLabels) {
                    if (Array.isArray(rawLabels.value)) {
                        labels.push(...rawLabels.value);
                    }
                }

                values.forEach((value) => {
                    const label = labelDamageType(value, labelMap);
                    if (label) {
                        labels.push(label);
                    }
                });

                if (custom) {
                    labels.push(custom);
                }

                const seen = new Set();
                return labels
                    .map(label => (typeof label === 'string' ? label.trim() : ''))
                    .filter(label => {
                        if (!label) return false;
                        if (seen.has(label)) return false;
                        seen.add(label);
                        return true;
                    });
            };

            const traitData = sourceActor?.system?.traits ?? {};
            const resistances = buildTraitList(traitData.dr, resistanceTypeLabels);
            const immunities = buildTraitList(traitData.di, immunityTypeLabels);

            log(`CHARACTER DETAILS Resistances: ${JSON.stringify(resistances)}`, '', false, false);
            log(`CHARACTER DETAILS Immunities: ${JSON.stringify(immunities)}`, '', false, false);

            // Prepare biography text (strip HTML/links)
            const biographySource = sourceActor?.system?.details?.biography ?? {};
            const biographyHtml = biographySource.public || biographySource.value || '';
            let biography = '';
            let biographyHtmlSafe = '';
            let biographyHtmlRaw = '';
            if (biographyHtml) {
                try {
                    const TextEditor = getTextEditor();
                    if (TextEditor?.enrichHTML) {
                        const enriched = await TextEditor.enrichHTML(biographyHtml, { async: true, secrets: false });
                        biographyHtmlRaw = typeof enriched === 'string' ? enriched : '';
                        biography = TextEditor?.getPlainText
                            ? TextEditor.getPlainText(enriched, { secrets: false })?.trim() ?? ''
                            : enriched.replace(/<[^>]+>/g, '').trim();
                    } else if (TextEditor?.getPlainText) {
                        biographyHtmlRaw = biographyHtml;
                        biography = TextEditor.getPlainText(biographyHtml, { secrets: false })?.trim() ?? '';
                    } else {
                        biographyHtmlRaw = biographyHtml;
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(biographyHtml, 'text/html');
                        biography = (doc.body.textContent || '').trim();
                    }
                } catch (error) {
                    log(`CHARACTER DETAILS Biography parsing error: ${error}`, '', false, false);
                }
            }

            if (!biographyHtmlRaw && biographyHtml) {
                biographyHtmlRaw = biographyHtml;
            }

            if (biography) {
                biographyHtmlSafe = biography
                    .split(/\r?\n+/)
                    .map(line => line.trim())
                    .filter(Boolean)
                    .join('<br>');
            }

            log(`CHARACTER DETAILS Biography summary: ${biography ? biography.substring(0, 120) : 'none'}`, '', false, false);

            if (game.user.isGM) {
                PanelManager?.setGmDetails?.({
                    resistances,
                    immunities,
                    biography,
                    biographyHtml: biographyHtmlSafe,
                    biographyHtmlRaw
                });
            }

            const template = await renderTemplate(TEMPLATES.PANEL_CHARACTER, {
                actor: this.actor,
                displayName: this.displayName,
                position: game.settings.get(MODULE.ID, 'trayPosition'),
                isGM: game.user.isGM,
                speeds,
                speedUnits: units,
                canHover: hover,
                resistances,
                immunities,
                biography,
                biographyHtml: biographyHtmlSafe,
                biographyHtmlRaw
            });
            
            // Phase 1: Safety check after async operations - validate element is still valid
            // Check if this render was cancelled (another render started)
            if (this._renderCancellationToken !== currentToken) {
                const blacksmith = getBlacksmith();
                blacksmith?.utils.postConsoleAndNotification(
                    MODULE.NAME,
                    "Character panel render cancelled - newer render in progress",
                    { actorId: this.actor?.id, actorName: this.actor?.name },
                    false,
                    false
                );
                return;
            }
            
            // v13: Convert to native DOM element if needed
            const nativeElement = getNativeElement(this.element);
            if (!nativeElement) {
                const blacksmith = getBlacksmith();
                blacksmith?.utils.postConsoleAndNotification(
                    MODULE.NAME,
                    "Character panel render called without valid element",
                    { actorId: this.actor?.id, actorName: this.actor?.name, hasElement: !!this.element },
                    false,
                    false
                );
                return;
            }
            
            // Validate character panel container exists in DOM
            // v13: Use native DOM querySelector instead of jQuery find
            const characterPanelContainer = nativeElement.querySelector('[data-panel="character"]');
            if (!characterPanelContainer) {
                const blacksmith = getBlacksmith();
                blacksmith?.utils.postConsoleAndNotification(
                    MODULE.NAME,
                    "Character panel container not found in element",
                    { actorId: this.actor?.id, actorName: this.actor?.name },
                    false,
                    false
                );
                return;
            }
            
            // All validations passed - proceed with rendering
            // v13: Use native DOM innerHTML instead of jQuery html()
            characterPanelContainer.innerHTML = template;
            this._activateListeners(nativeElement);
        } finally {
            // Always clear render flag, even if an error occurred
            this._renderInProgress = false;
        }
    }

    _activateListeners(html) {
        // v13: Convert to native DOM if needed
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;

        // Character sheet toggle
        // v13: Use native DOM querySelector and addEventListener
        const sheetToggle = nativeHtml.querySelector('.character-sheet-toggle');
        if (sheetToggle) {
            sheetToggle.addEventListener('click', () => {
                this.actor.sheet.render(true);
            });
        }

        // Print character button
        // v13: Use native DOM querySelector and addEventListener
        const printButton = nativeHtml.querySelector('.print-character');
        if (printButton) {
            printButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this.actor) {
                    const { PrintCharacterSheet } = await import('./utility-print-character.js');
                    await PrintCharacterSheet.print(this.actor);
                }
            });
        }

        // Share portrait
        // v13: Use native DOM querySelector and addEventListener
        const portrait = nativeHtml.querySelector('.character-portrait');
        if (portrait) {
            portrait.addEventListener('click', () => {
                const imagePopout = new ImagePopout(this.actor.img, {
                    title: this.displayName || this.actor.name,
                    shareable: true,
                    uuid: this.actor.uuid
                });
                imagePopout.render(true);
            });
        }

        // Note: Conditions button is handled by the handle manager, not the character panel

        // Refresh tray
        // v13: Use native DOM querySelector and addEventListener
        const refreshButton = nativeHtml.querySelector('.tray-refresh');
        if (refreshButton) {
            refreshButton.addEventListener('click', async (event) => {
                const refreshIcon = event.currentTarget;
                if (PanelManager.instance && !refreshIcon.classList.contains('spinning')) {
                    try {
                        refreshIcon.classList.add('spinning');
                        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
                        await PanelManager.initialize(this.actor);
                        // Force a re-render of all panels
                        if (PanelManager.instance) {
                            await PanelManager.instance.renderPanels(PanelManager.element);
                        }
                    } catch (error) {
                        console.error('Error refreshing tray:', error);
                        ui.notifications.error("Failed to refresh tray");
                    } finally {
                        refreshIcon.classList.remove('spinning');
                    }
                }
            });
        }

        // HP Controls
        // v13: Use native DOM querySelector and addEventListener
        const deathToggle = nativeHtml.querySelector('.death-toggle');
        if (deathToggle) {
            deathToggle.addEventListener('click', async () => {
                const isDead = this.actor.system.attributes.hp.value <= 0;
                await this.actor.update({
                    'system.attributes.hp.value': isDead ? 1 : 0,
                    'system.attributes.death.failure': isDead ? 0 : 3
                });
                await this._updateHPDisplay();
            });
        }

        // Clear HP amount input on click
        // v13: Use native DOM querySelector and addEventListener
        const hpAmount = nativeHtml.querySelector('.hp-amount');
        if (hpAmount) {
            hpAmount.addEventListener('click', function() {
                this.value = '';
            });
        }

        // HP up/down buttons
        // v13: Use native DOM querySelectorAll and addEventListener
        const hpButtons = nativeHtml.querySelectorAll('.hp-up, .hp-down');
        hpButtons.forEach(button => {
            button.addEventListener('click', async (event) => {
                const isIncrease = event.currentTarget.classList.contains('hp-up');
                const hp = this.actor.system.attributes.hp;
                const hpAmountInput = nativeHtml.querySelector('.hp-amount');
                const inputValue = parseInt(hpAmountInput?.value || '0') || 1;
                const change = isIncrease ? inputValue : -inputValue;
                
                await this.actor.update({
                    'system.attributes.hp.value': Math.clamp(
                        hp.value + change,
                        0,
                        hp.max
                    )
                });
                await this._updateHPDisplay();
            });
        });

        // HP full button
        // v13: Use native DOM querySelector and addEventListener
        const hpFull = nativeHtml.querySelector('.hp-full');
        if (hpFull) {
            hpFull.addEventListener('click', async () => {
                const hp = this.actor.system.attributes.hp;
                await this.actor.update({
                    'system.attributes.hp.value': hp.max
                });
                await this._updateHPDisplay();
            });
        }

        // Ability Score Buttons
        // v13: Use native DOM querySelectorAll and addEventListener
        const abilityButtons = nativeHtml.querySelectorAll('.ability-btn');
        abilityButtons.forEach(button => {
            button.addEventListener('click', async (event) => {
                const abilityKey = event.currentTarget.dataset.ability;
                // v13: D&D5e v5.2.2 API - rollAbilityCheck expects an object with 'ability' property
                try {
                    await this.actor.rollAbilityCheck({ ability: abilityKey });
                } catch (error) {
                    console.error('Error rolling ability check:', error);
                    ui.notifications?.error('Failed to roll ability check.');
                }
            });
            
            button.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                const abilityKey = event.currentTarget.dataset.ability;
                // v13: D&D5e v5.2.2 API - rollAbilitySave expects an object with 'ability' property
                try {
                    await this.actor.rollAbilitySave({ ability: abilityKey });
                } catch (error) {
                    console.error('Error rolling ability save:', error);
                    ui.notifications?.error('Failed to roll ability save.');
                }
            });
        });

        // Note: Print character button is handled by the panel manager, not the character panel
    }

    async _updateHPDisplay() {
        // v13: Use native DOM methods
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        const hp = this.actor.system.attributes.hp;
        const hpBar = nativeElement.querySelector('.hp-bar');
        if (!hpBar) return;
        
        const hpValue = hpBar.querySelector('.hp-current .hp-value');
        const hpMax = hpBar.querySelector('.hp-max .hp-value');
        const hpFill = hpBar.querySelector('.hp-fill');
        
        if (hpValue && hpMax && hpFill) {
            hpValue.textContent = hp.value;
            hpMax.textContent = hp.max;
            const percentage = Math.clamped((hp.value / hp.max) * 100, 0, 100);
            hpFill.style.width = `${percentage}%`;
        }
    }

    destroy() {
        // Note: Hooks are now managed centrally by HookManager
        // No need to manually remove hooks here anymore
        this.element = null;
    }
} 