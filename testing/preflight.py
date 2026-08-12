"""Squire pre-flight. Run from the module root.

Parse check note: `node --check foo.js` parses as CommonJS *script*, which accepts
things ESM rejects — it passed a genuine SyntaxError that broke the world at load.
Every file is copied to a .mjs and checked there instead.
"""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile

fail = []

js = []
for d, _, fs in os.walk('scripts'):
    for f in fs:
        if f.endswith('.js'):
            js.append(os.path.join(d, f).replace(os.sep, '/'))

# 1. every script parses AS A MODULE
tmp = tempfile.mkdtemp()
for f in js:
    mjs = os.path.join(tmp, os.path.basename(f) + '.mjs')
    shutil.copyfile(f, mjs)
    r = subprocess.run(['node', '--check', mjs], capture_output=True, text=True)
    if r.returncode:
        detail = ' | '.join(l.strip() for l in r.stderr.splitlines()[:4] if l.strip())
        fail.append('PARSE %s: %s' % (f, detail))
shutil.rmtree(tmp, ignore_errors=True)

# 2. manifest-declared paths exist
m = json.load(io.open('module.json', encoding='utf-8'))
for key in ('esmodules', 'styles', 'languages', 'packs'):
    for entry in m.get(key, []):
        path = entry if isinstance(entry, str) else entry.get('path', '')
        if path and not os.path.exists(path):
            fail.append('MANIFEST %s: missing %s' % (key, path))

# 3. static + dynamic import targets resolve
imp = re.compile(r"""(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]""")
for f in js:
    for spec in imp.findall(io.open(f, encoding='utf-8').read()):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), spec))):
            fail.append('IMPORT %s -> %s' % (f, spec))

# 4. each named binding is actually exported by its target
named = re.compile(r"import\s*\{([^}]*)\}\s*from\s*['\"](\.[^'\"]+)['\"]")
dyn = re.compile(r"(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*['\"](\.[^'\"]+)['\"]\s*\)")


def exports_of(path):
    src = io.open(path, encoding='utf-8').read()
    out = set(re.findall(r"export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)", src))
    for block in re.findall(r"export\s*\{([^}]*)\}", src):
        for part in block.split(','):
            part = part.strip()
            if part:
                out.add(part.split(' as ')[-1].strip())
    if re.search(r"export\s+default", src):
        out.add('default')
    return out


for f in js:
    src = io.open(f, encoding='utf-8').read()
    for rx in (named, dyn):
        for names, spec in rx.findall(src):
            t = os.path.normpath(os.path.join(os.path.dirname(f), spec))
            if not os.path.exists(t):
                continue
            have = exports_of(t)
            for n in names.split(','):
                n = n.strip().split(' as ')[0].strip()
                if n and not n.startswith('//') and n not in have:
                    fail.append('EXPORT %s: %s does not export %s' % (f, spec, n))

# 5. CSS @import targets
for d, _, fs in os.walk('styles'):
    for f in fs:
        if not f.endswith('.css'):
            continue
        pth = os.path.join(d, f)
        for spec in re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", io.open(pth, encoding='utf-8').read()):
            if not os.path.exists(os.path.normpath(os.path.join(d, spec))):
                fail.append('CSS @import %s -> %s' % (pth, spec))

# 5b. every stylesheet on disk is actually reachable from default.css
#     A rule in an unimported file is dead and silent: the selectors are valid,
#     the file parses, nothing warns, and the styling simply never appears.
imported = set()
for spec in re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", io.open('styles/default.css', encoding='utf-8').read()):
    imported.add(os.path.basename(spec))
for f in sorted(os.listdir('styles')):
    if not f.endswith('.css') or f == 'default.css':
        continue
    if f not in imported:
        fail.append('ORPHAN styles/%s is never imported by default.css' % f)

# 6. any module-absolute asset referenced from a script or template
SKIP_DIRS = ('.git', 'node_modules', '_backups', '.vscode')
for d, _, fs in os.walk('.'):
    # _backups holds gitignored scratch copies of files mid-refactor; they
    # legitimately reference assets that no longer exist and are not shipped.
    if any(part in d.split(os.sep) for part in SKIP_DIRS):
        continue
    for f in fs:
        if not f.endswith(('.js', '.hbs')):
            continue
        pth = os.path.join(d, f)
        txt = io.open(pth, encoding='utf-8', errors='replace').read()
        for path in re.findall(r"modules/coffee-pub-squire/([A-Za-z0-9_./-]+\.(?:hbs|css|json|js))", txt):
            if not os.path.exists(path):
                fail.append('ASSET %s -> %s' % (pth, path))

print('\n'.join(sorted(set(fail))) if fail else 'ALL CHECKS PASS')
print('(%d js files checked, as modules)' % len(js))
