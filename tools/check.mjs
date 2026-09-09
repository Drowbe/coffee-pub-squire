#!/usr/bin/env node
/**
 * PREFLIGHT.
 *
 * Everything that can be checked without Foundry running, in one command:
 *
 *     node tools/check.mjs
 *
 * It exists because `node --check` is not enough and I kept discovering that
 * the hard way. Two real failures shipped in one afternoon:
 *
 *   - `HINTS` was referenced inside an array declared ABOVE it. Valid syntax,
 *     and a `ReferenceError` the moment the module evaluated — which in ESM
 *     means the file is dead for the whole session, and every window that
 *     imports it with it.
 *   - A stray apostrophe closed a string early. That one `node --check` does
 *     catch, but only if it is actually run against the file AFTER the write.
 *
 * So: syntax, then EVALUATION, then the two file types nothing was checking at
 * all — templates and stylesheets — then the docs.
 *
 * What it cannot do is run Foundry. A method that is never called still passes
 * everything here. This narrows the gap; it does not close it.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;

function fail(where, message) {
    failures += 1;
    console.error(`  FAIL  ${where}\n        ${message}`);
}

function pass(label, count) {
    console.log(`  ok    ${label} (${count})`);
}

/** Every file under `dir` with one of `exts`, recursively. */
function walk(dir, exts, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, exts, out);
        else if (exts.includes(extname(entry.name))) out.push(full);
    }
    return out;
}

const rel = file => relative(ROOT, file).replace(/\\/g, '/');

// ============================================================================
// 1. SYNTAX
// ============================================================================
function checkSyntax(files) {
    console.log('\nSyntax');
    for (const file of files) {
        checks += 1;
        try {
            execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        } catch (error) {
            fail(rel(file), String(error.stderr || error.message).trim().split('\n')[0]);
        }
    }
    pass('scripts parse', files.length);
}

// ============================================================================
// 2. EVALUATION
//
// The check that would have caught the `HINTS` crash. A module is imported for
// real, with just enough Foundry stubbed to get past the globals a top-level
// statement might touch. Anything that reaches into `game` or `CONFIG` at
// module level SHOULD fail here — that is a bug in the module, not in the stub.
//
// Only modules that are safe to import in isolation: anything importing the
// Blacksmith bridge by absolute URL cannot resolve outside Foundry, and a
// module that registers hooks on import would do so into the void.
// ============================================================================
const EVALUABLE = [
    'scripts/const.js',
    'scripts/utility-builds.js',
    'scripts/transfer-utils.js'
];

const STUB = `
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 }, TEXTURE_DATA_FIT_MODES: ['fill', 'contain'] };
globalThis.CONFIG = { DND5E: { itemRarity: {}, spellcasting: {}, spellPreparationStates: {} }, Token: {} };
globalThis.game = {
    modules: { get: () => null },
    settings: { get: () => undefined, set: async () => {}, register: () => {} },
    i18n: { localize: s => s, format: s => s },
    users: [], actors: { get: () => null }
};
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.foundry = { utils: { randomID: () => 'x', escapeHTML: s => s, mergeObject: (a, b) => ({ ...a, ...b }) } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };

// const.js fetches module.json at the TOP LEVEL, which is fine in Foundry and
// impossible in Node - its fetch refuses file: URLs. The module is not at fault,
// so the harness answers the question instead of excluding the module from it.
// A copy of module.json sits beside the scripts directory in the sandbox.
// (No backticks in here: this whole block lives inside a template literal.)
{
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath: toPath } = await import('node:url');
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url ?? String(input);
        if (!url.startsWith('file:')) return real(input, init);
        const body = await readFile(toPath(url), 'utf8');
        return { ok: true, status: 200, async json() { return JSON.parse(body); }, async text() { return body; } };
    };
}
`;

async function checkEvaluation() {
    console.log('\nEvaluation');
    // The sandbox MIRRORS the module's own shape — `module.json` at the top and
    // a `scripts/` directory under it — because `const.js` reaches for
    // `../module.json` relative to its own URL. A flat copy resolves that to
    // nothing, which looked like the module failing rather than the harness.
    const dir = mkdtempSync(join(tmpdir(), 'squire-check-'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'module.json'), readFileSync(join(ROOT, 'module.json'), 'utf8'));

    try {
        for (const target of EVALUABLE) {
            checks += 1;
            const source = join(ROOT, target);
            if (!existsSync(source)) {
                fail(target, 'listed as evaluable but the file does not exist');
                continue;
            }

            // Copy the module and everything it imports relatively, so the real
            // import graph is exercised rather than a rewritten one.
            const copied = new Set();
            const copy = (file) => {
                if (copied.has(file)) return;
                copied.add(file);
                const text = readFileSync(file, 'utf8');
                writeFileSync(join(dir, 'scripts', relative(join(ROOT, 'scripts'), file)), text);
                for (const [, spec] of text.matchAll(/from\s+'(\.\/[^']+)'/g)) {
                    const next = resolve(dirname(file), spec);
                    if (existsSync(next)) copy(next);
                }
            };
            copy(source);

            const name = relative(join(ROOT, 'scripts'), source);
            const entry = join(dir, 'scripts', `run-${name}`);
            writeFileSync(entry, `${STUB}\nawait import('./${name}');\n`);

            try {
                await import(pathToFileURL(entry).href);
            } catch (error) {
                fail(target, `does not evaluate: ${error.message}`);
            }
        }
        pass('modules evaluate', EVALUABLE.length);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ============================================================================
// 3. IMPORTS RESOLVE
//
// A relative import naming a file that is not there, or an export that no
// longer exists. Renaming an export and missing one consumer is the single
// easiest mistake to make in a module this size.
// ============================================================================
function checkImports(files) {
    console.log('\nImports');
    const sources = new Map(files.map(file => [file, readFileSync(file, 'utf8')]));

    for (const [file, text] of sources) {
        for (const match of text.matchAll(/import\s+\{([^}]+)\}\s+from\s+'(\.[^']+)'/g)) {
            checks += 1;
            const target = resolve(dirname(file), match[2]);
            if (!existsSync(target)) {
                fail(rel(file), `imports a file that does not exist: ${match[2]}`);
                continue;
            }

            const targetText = sources.get(target) ?? readFileSync(target, 'utf8');
            for (const name of match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
                const exported = new RegExp(
                    `export\\s+(async\\s+)?(function|class|const|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`
                );
                if (!exported.test(targetText)) {
                    fail(rel(file), `imports { ${name} } from ${match[2]}, which does not export it`);
                }
            }
        }
    }
    console.log(`  ok    imports resolve`);
}

// ============================================================================
// 4. TEMPLATES
//
// Handlebars blocks have to balance. Nothing checked this, and a half-applied
// edit to a template fails at render with a message that names the template
// rather than the line.
// ============================================================================
function checkTemplates(files) {
    console.log('\nTemplates');
    const OPEN = /\{\{~?#(if|each|unless|with|times)\b/g;
    const CLOSE = /\{\{~?\/(if|each|unless|with|times)~?\}\}/g;

    for (const file of files) {
        checks += 1;
        const text = readFileSync(file, 'utf8');
        const open = (text.match(OPEN) || []).length;
        const close = (text.match(CLOSE) || []).length;
        if (open !== close) fail(rel(file), `${open} block opens, ${close} closes`);

        const divsOpen = (text.match(/<div\b/g) || []).length;
        const divsClose = (text.match(/<\/div>/g) || []).length;
        if (divsOpen !== divsClose) fail(rel(file), `${divsOpen} <div>, ${divsClose} </div>`);
    }
    pass('templates balance', files.length);
}

// ============================================================================
// 5. STYLESHEETS
//
// Braces, and that every `@import` names a file that is there — default.css is
// the only stylesheet the manifest loads, so a rule in a file it does not
// import is a rule that never applies and never says so.
// ============================================================================
function checkStyles(files) {
    console.log('\nStyles');
    for (const file of files) {
        checks += 1;
        const text = readFileSync(file, 'utf8');
        const open = (text.match(/\{/g) || []).length;
        const close = (text.match(/\}/g) || []).length;
        if (open !== close) fail(rel(file), `${open} '{', ${close} '}'`);

        for (const [, spec] of text.matchAll(/@import\s+"([^"]+)"/g)) {
            if (!existsSync(resolve(dirname(file), spec))) {
                fail(rel(file), `@import names a file that does not exist: ${spec}`);
            }
        }
    }
    pass('stylesheets balance', files.length);
}

// ============================================================================
// 6. DOCS
// ============================================================================
function checkDocs(files) {
    console.log('\nDocs');
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        for (const [, link] of text.matchAll(/\]\(([^)\s#]+\.(?:md|webp|png|jpg|jpeg|gif|svg))(?:#[^)]*)?\)/g)) {
            if (link.startsWith('http')) continue;
            checks += 1;
            if (!existsSync(resolve(dirname(file), link))) {
                fail(rel(file), `broken link: ${link}`);
            }
        }
    }
    console.log('  ok    doc links resolve');
}

// ============================================================================

const scripts = walk(join(ROOT, 'scripts'), ['.js']);
const templates = walk(join(ROOT, 'templates'), ['.hbs']);
const styles = walk(join(ROOT, 'styles'), ['.css']);
const docs = [
    ...walk(join(ROOT, 'documentation'), ['.md']),
    join(ROOT, 'README.md'),
    join(ROOT, 'CHANGELOG.md')
].filter(existsSync);

checkSyntax(scripts);
await checkEvaluation();
checkImports(scripts);
checkTemplates(templates);
checkStyles(styles);
checkDocs(docs);

console.log(`\n${failures ? `${failures} PROBLEM(S)` : 'All clear'} — ${checks} checks over `
    + `${scripts.length} scripts, ${templates.length} templates, ${styles.length} stylesheets.`);

process.exit(failures ? 1 : 0);
