import { MODULE } from './const.js';
import { copyToClipboard } from './helpers.js';
import { trackModuleTimeout } from './timer-utils.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

const BlacksmithWindowBaseV2 = getBlacksmith()?.BlacksmithWindowBaseV2
    || getBlacksmith()?.getWindowBaseV2?.();

if (!BlacksmithWindowBaseV2) {
    throw new Error('Coffee Pub Squire | BlacksmithWindowBaseV2 is unavailable for DataExportWindow');
}

export class DataExportWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'squire-data-export-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: `${MODULE.ID}-data-export`,
            classes: ['squire-data-export-window', 'squire-window'],
            position: { width: 640, height: 620 },
            window: { title: 'Export JSON', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 420, minHeight: 320 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-data-export.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${MODULE.ID}-data-export-${foundry.utils.randomID().slice(0, 8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DataExportWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DataExportWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        opts.window.title = options.title || opts.window.title;
        super(opts);

        this.exportTitle = options.title || 'Export JSON';
        this.data = String(options.data ?? '');
        this.filename = options.filename || 'squire-export.json';
        this.summary = Array.isArray(options.summary) ? options.summary : [];
        this.sceneNames = Array.isArray(options.sceneNames) ? options.sceneNames : [];
        this._actionRoot = null;
        this._actionHandler = null;
    }

    async getData() {
        return {
            appId: this.id,
            exportTitle: this.exportTitle,
            data: this.data,
            filename: this.filename,
            summary: this.summary,
            sceneNames: this.sceneNames
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this.element?.querySelector?.('.squire-data-export-window[data-app-id]');
        if (!root || root === this._actionRoot) return;
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }
        this._actionRoot = root;
        this._actionHandler = async event => {
            const button = event.target?.closest?.('[data-action]');
            if (!button || !root.contains(button)) return;
            const action = button.dataset.action;
            if (!['copy', 'download', 'close'].includes(action)) return;
            event.preventDefault();
            if (action === 'copy') {
                await copyToClipboard(this.data);
            } else if (action === 'download') {
                this._download();
            } else {
                await this.close();
            }
        };
        root.addEventListener('click', this._actionHandler, true);
        root.querySelector('textarea')?.select?.();
    }

    _download() {
        try {
            if (typeof saveDataToFile === 'function') {
                saveDataToFile(this.data, 'application/json;charset=utf-8', this.filename);
            } else {
                const blob = new Blob([this.data], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = this.filename;
                anchor.rel = 'noopener';
                anchor.style.display = 'none';
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                trackModuleTimeout(() => URL.revokeObjectURL(url), 0);
            }
            ui.notifications.info(`Export saved as ${this.filename}`);
        } catch (error) {
            console.error('Coffee Pub Squire | Export download failed:', error);
            void copyToClipboard(this.data);
            ui.notifications.warn('Download failed. Export data copied to the clipboard instead.');
        }
    }

    async close(options = {}) {
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }
        this._actionRoot = null;
        this._actionHandler = null;
        return super.close(options);
    }
}

export function openDataExportWindow(options = {}) {
    const window = new DataExportWindow(options);
    window.render(true);
    return window;
}
