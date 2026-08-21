"""Prove a CSS refactor changed nothing. Run from the module root:

    python testing/css-cascade-diff.py            # working tree vs git HEAD
    python testing/css-cascade-diff.py <ref>      # working tree vs any git ref

Flattens the whole @import graph from styles/default.css into the exact ordered
list of (selector, declarations) a browser would see, and diffs that against the
same list built from a git ref. Comments and whitespace are normalised away;
ORDER IS NOT, because in CSS order is behaviour.

This is what makes a big restyle safe to do in one go. Moving rules between
files, splitting a stylesheet, or regrouping selectors is only safe if the
flattened result is identical -- and eyeballing a 400-rule diff does not
establish that. When it reports IDENTICAL, the refactor cannot have changed
what any element looks like.

When it reports differences, read them: every line should be a change you
intended. That is the review, and it is far smaller than the file diff.

Exit code is 0 for identical, 1 for different, 2 if it could not run.
"""
import io
import os
import re
import sys
import difflib
import subprocess


def flatten(read_file, entry='default.css'):
    """read_file(name) -> text, or None if missing. Returns ordered rule list."""
    out = []

    def emit(chunk):
        # innermost blocks only; an @media wrapper contributes its inner rules
        # in place, which is what the cascade actually sees
        for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', chunk):
            sel = ' '.join(m.group(1).split())
            if not sel:
                continue
            decls = tuple(' '.join(d.split()) for d in m.group(2).split(';') if d.strip())
            out.append((sel, decls))

    def load(name, seen):
        if name in seen:
            return
        seen.add(name)
        t = read_file(name)
        if t is None:
            print("  (missing: %s)" % name, file=sys.stderr)
            return
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        pos = 0
        for m in re.finditer(r'@import\s+"([^"]+)"\s*;', t):
            emit(t[pos:m.start()])
            load(m.group(1), seen)
            pos = m.end()
        emit(t[pos:])

    load(entry, set())
    return out


def from_worktree(name):
    p = os.path.join('styles', name)
    return io.open(p, encoding='utf-8').read() if os.path.isfile(p) else None


def from_git(ref):
    def read(name):
        r = subprocess.run(['git', 'show', '%s:styles/%s' % (ref, name)],
                           capture_output=True)
        return r.stdout.decode('utf-8', 'replace') if r.returncode == 0 else None
    return read


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
    if not os.path.isfile('styles/default.css'):
        print("run this from the module root", file=sys.stderr)
        return 2
    try:
        before = flatten(from_git(ref))
    except OSError:
        print("could not read git ref %s" % ref, file=sys.stderr)
        return 2
    if not before:
        print("no rules found at %s -- is that ref valid?" % ref, file=sys.stderr)
        return 2
    after = flatten(from_worktree)

    if before == after:
        print("IDENTICAL cascade vs %s: %d rules, same order, same declarations"
              % (ref, len(before)))
        return 0

    print("DIFFERENT vs %s: %d rules before, %d now\n" % (ref, len(before), len(after)))
    fmt = lambda rs: ["%s {%s}" % (s, '; '.join(d)) for s, d in rs]
    shown = 0
    for line in difflib.unified_diff(fmt(before), fmt(after), ref, 'working tree',
                                     lineterm='', n=1):
        print(line[:220])
        shown += 1
        if shown > 200:
            print("... truncated")
            break
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
