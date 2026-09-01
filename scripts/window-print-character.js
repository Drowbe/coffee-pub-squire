import { MODULE } from './const.js';

/**
 * The base class comes from Blacksmith's bridge module, not from `module.api`.
 * See the note in window-cleanup.js: `extends` is evaluated at file-evaluation
 * time, before `game` exists, and ESM caches a failed evaluation for the whole
 * session.
 */
import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

/**
 * The rendered character sheet, in a window you can read.
 *
 * This replaced a `window.open('', '_blank')` popup, which never worked in the
 * desktop client: it is Electron, where a renderer may only open a window if
 * the main process registered a `setWindowOpenHandler`, and Foundry's does not.
 * The call returned null and the module reported a blocked pop-up, sending
 * people to a browser setting that could not have helped. A Foundry window has
 * no such problem and is the same window in both clients.
 *
 * The sheet lives in an IFRAME rather than being inlined into the body. It is a
 * complete HTML document -- its own `<head>`, its own `body` rules, its own
 * `@page` and `@media print` blocks -- and inlining it would put those rules in
 * the same cascade as Foundry's and this module's. The iframe keeps it whole,
 * and it is also what makes Print work: printing an iframe prints its document,
 * not the application around it.
 */
export class PrintCharacterWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['squire-tool-window', 'squire-print-window'],
            // Wide enough for the sheet's own 900px column plus the window
            // chrome, so it opens without a horizontal scrollbar.
            position: { width: 960, height: 800 },
            window: { title: 'Character Sheet', resizable: true, minimizable: true },
            windowSizeConstraints: {
                minWidth: 480,
                minHeight: 360,
                maxWidth: 1400,
                maxHeight: 'calc(100vh - 80px)'
            },
            toolTitlebar: 'full',
            rememberPosition: true,
            windowPositionKey: 'squire-print'
        }
    );

    static ACTION_HANDLERS = {
        cancel: (_event, _target, win) => win.close(),
        print: (_event, _target, win) => win.printSheet()
    };

    /**
     * One window per actor, tracked here rather than read back from
     * `foundry.applications.instances` -- that is not written until the first
     * render completes, so two quick clicks would both miss it.
     */
    static open = new Map();

    constructor(actor, sheetHtml, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = `${MODULE.ID}-print-${actor.id}`;
        super(opts);

        this.actor = actor;
        this.sheetHtml = sheetHtml;

        PrintCharacterWindow.open.set(actor.id, this);
    }

    get title() {
        return `Character Sheet: ${this.actor?.name ?? ''}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        return {
            appId: this.id,
            // Empty on purpose. Writing the document here would mean escaping a
            // whole HTML file into an attribute; it is written into the frame in
            // _onRender instead, where there is a real document to write to.
            bodyContent: '<iframe class="squire-print-frame" title="Character sheet"></iframe>',
            showToolFooter: true,
            toolFooterRight: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
                    <i class="fa-solid fa-xmark"></i> Close
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="print">
                    <i class="fa-solid fa-print"></i> Print or Save as PDF
                </button>`
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);

        const frame = this.element?.querySelector('.squire-print-frame');
        const doc = frame?.contentDocument;
        if (!doc) {
            console.error('Squire | Print window produced no frame document.');
            return;
        }

        // document.write rather than srcdoc: srcdoc has to carry the whole file
        // as an escaped attribute, and this is a document with quotes in it.
        doc.open();
        doc.write(this.sheetHtml);
        doc.close();
    }

    /**
     * Hand the frame's document to the browser's print dialog, which is also
     * where "Save as PDF" lives in both clients.
     */
    printSheet() {
        const frameWindow = this.element?.querySelector('.squire-print-frame')?.contentWindow;
        if (!frameWindow) return;
        // Focus first: an unfocused frame prints the parent document in some
        // engines, which would print Foundry rather than the sheet.
        frameWindow.focus();
        frameWindow.print();
    }

    async close(options) {
        PrintCharacterWindow.open.delete(this.actor?.id);
        return super.close(options);
    }
}

/**
 * Show the sheet, reusing the window if this actor already has one open.
 */
export async function openPrintCharacterWindow(actor, sheetHtml) {
    const existing = PrintCharacterWindow.open.get(actor.id);
    if (existing) {
        existing.sheetHtml = sheetHtml;
        await existing.render(true);
        existing.bringToFront?.();
        return existing;
    }
    const win = new PrintCharacterWindow(actor, sheetHtml);
    await win.render(true);
    return win;
}
