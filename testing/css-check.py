"""Squire CSS check. Run from the module root: `python testing/css-check.py`

Looks for CSS that silently does nothing. That is the failure mode this module
keeps producing, and it is the hard one, because it is invisible in the source
AND in the computed-styles panel. Real examples this would have caught:

  * `width: var(--tray-handle-width)` where nothing has ever defined that
    variable. The declaration was invalid, so it was dropped, so the tray handle
    had no width at all and was sized by whatever happened to be widest inside
    it. It looked deliberate for years.
  * `transform: scale(1.1) rotate(inherit)` -- `inherit` is not a legal value
    inside a transform function, so the whole declaration was dropped and that
    hover effect never once ran.
  * `background-image: X; background-size: Y; background: Z` -- the shorthand
    resets the two longhands above it, so a texture never rendered.
  * `@keyframes pulse` defined three times here and a fourth time by core
    Foundry. Keyframe names are GLOBAL with no scoping of any kind; ours won, so
    Squire displaced Foundry's own paused-game indicator for every world that
    installed the module.

Exit code is non-zero if anything in the FAIL section fires.
"""
import io
import os
import re
import glob
import collections

STYLES = sorted(glob.glob('styles/*.css'))
FOUNDRY = r"c:/Program Files/Foundry Virtual Tabletop/resources/app/public/css/foundry2.css"
EXTERNAL_DIRS = [
    r"c:/Users/drowb/AppData/Local/FoundryVTT/Data/modules/coffee-pub-blacksmith/styles",
    r"c:/Users/drowb/AppData/Local/FoundryVTT/Data/systems",
]


def decomment(t):
    return re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), t, flags=re.S)


def rules(text):
    """Yield (line, selector, [declarations]) for every innermost block."""
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', text):
        sel = ' '.join(m.group(1).split())
        if not sel:
            continue
        yield (text[:m.start()].count('\n') + 1, sel,
               [d.strip() for d in m.group(2).split(';') if ':' in d])


fail, warn = [], []

# ------------------------------------------------------------- brace balance
for f in STYLES:
    t = io.open(f, encoding='utf-8').read()
    if t.count('{') != t.count('}'):
        fail.append("%s: unbalanced braces (%d open, %d close)"
                    % (f, t.count('{'), t.count('}')))

# -------------------------------------------------------------- import graph
default = io.open('styles/default.css', encoding='utf-8').read()
imported = re.findall(r'@import\s+"([^"]+)"', default)
for n in imported:
    if not os.path.isfile(os.path.join('styles', n)):
        fail.append("default.css imports %s, which does not exist" % n)
for f in STYLES:
    b = os.path.basename(f)
    if b != 'default.css' and b not in imported:
        warn.append("%s is never imported, so none of it loads" % b)

# --------------------------------------------------------- custom properties
defined = set()
srcs = STYLES + ([FOUNDRY] if os.path.isfile(FOUNDRY) else [])
for d in EXTERNAL_DIRS:
    if os.path.isdir(d):
        srcs += glob.glob(os.path.join(d, '**', '*.css'), recursive=True)
for f in srcs:
    try:
        defined |= set(re.findall(r'(--[A-Za-z0-9_-]+)\s*:',
                                  io.open(f, encoding='utf-8', errors='ignore').read()))
    except OSError:
        pass
for f in STYLES:
    t = decomment(io.open(f, encoding='utf-8').read())
    for m in re.finditer(r'var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)', t):
        if m.group(1) not in defined and not m.group(2):
            fail.append("%s:%d var(%s) is defined nowhere and has no fallback, so the "
                        "whole declaration is invalid and dropped"
                        % (os.path.basename(f), t[:m.start()].count('\n') + 1, m.group(1)))

# ----------------------------------------------------------------- keyframes
kf_def, kf_use = set(), set()
SKIP = {'none', 'infinite', 'alternate', 'alternate-reverse', 'reverse', 'forwards',
        'backwards', 'both', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear',
        'paused', 'running', 'normal', 'step-start', 'step-end'}
for f in STYLES:
    t = decomment(io.open(f, encoding='utf-8').read())
    for name in re.findall(r'@keyframes\s+([\w-]+)', t):
        if not name.startswith('squire-'):
            fail.append("%s: @keyframes %s is not squire- prefixed. Keyframe names are "
                        "GLOBAL, so this silently replaces any other definition of the "
                        "same name -- including core Foundry's."
                        % (os.path.basename(f), name))
        if name in kf_def:
            fail.append("@keyframes %s is defined more than once; the last one wins "
                        "everywhere, for everyone" % name)
        kf_def.add(name)
    for body in re.findall(r'animation(?:-name)?:\s*([^;]+);', t):
        for tok in body.split():
            if tok in SKIP or re.match(r'^[\d.]+m?s$|^[\d.]+$|^cubic-bezier|^steps', tok):
                continue
            kf_use.add(tok)
for n in sorted(kf_use - kf_def):
    fail.append("animation references @keyframes %s, which is not defined anywhere" % n)
for n in sorted(kf_def - kf_use):
    warn.append("@keyframes %s is defined but never used" % n)

# ---------------------------------------- declarations that cannot take effect
SHORTHAND = {
    'background': {'background-image', 'background-size', 'background-position',
                   'background-repeat', 'background-color', 'background-attachment',
                   'background-origin', 'background-clip'},
    'border': {'border-width', 'border-style', 'border-color', 'border-image',
               'border-top', 'border-right', 'border-bottom', 'border-left'},
    'margin': {'margin-top', 'margin-right', 'margin-bottom', 'margin-left'},
    'padding': {'padding-top', 'padding-right', 'padding-bottom', 'padding-left'},
    'transition': {'transition-property', 'transition-duration',
                   'transition-timing-function', 'transition-delay'},
    'animation': {'animation-name', 'animation-duration', 'animation-timing-function',
                  'animation-delay', 'animation-iteration-count', 'animation-direction',
                  'animation-fill-mode', 'animation-play-state'},
    'flex': {'flex-grow', 'flex-shrink', 'flex-basis'},
    'font': {'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
             'line-height'},
}
for f in STYLES:
    b = os.path.basename(f)
    t = decomment(io.open(f, encoding='utf-8').read())
    for line, sel, decls in rules(t):
        for d in decls:
            if re.search(r'\w+\([^)]*\binherit\b', d.split(':', 1)[1]):
                fail.append("%s:%d %s -> %s uses `inherit` inside a function, which is "
                            "not legal there, so the whole declaration is dropped"
                            % (b, line, sel[:44], d[:50]))
        props = [d.split(':')[0].strip().lower() for d in decls]
        for p, c in collections.Counter(props).items():
            if c > 1 and not p.startswith('--'):
                vals = [d.split(':', 1)[1] for d in decls
                        if d.split(':')[0].strip().lower() == p]
                # Declaring a property twice is legitimate as a progressive-enhancement
                # fallback: a plain value first, then the same property using a function
                # older engines will reject. Anything else is one of them doing nothing.
                if not any(re.search(r'\b(round|clamp|min|max|env|color-mix)\s*\(', v)
                           for v in vals):
                    warn.append("%s:%d %s -> `%s` set %dx; only the last one applies"
                                % (b, line, sel[:44], p, c))
        for i, p in enumerate(props):
            if p in SHORTHAND:
                killed = [q for q in props[:i] if q in SHORTHAND[p]]
                if killed:
                    fail.append("%s:%d %s -> the `%s` shorthand resets %s, declared above "
                                "it in the same block"
                                % (b, line, sel[:44], p, ', '.join(killed)))

# -------------------------------------------------------------------- report
print("checked %d stylesheets\n" % len(STYLES))
if warn:
    print("WARN (%d)" % len(warn))
    for w in warn:
        print("    " + w)
    print("")
if fail:
    print("FAIL (%d)" % len(fail))
    for x in fail:
        print("    " + x)
    raise SystemExit(1)
print("PASS -- no silently-dead CSS found")
