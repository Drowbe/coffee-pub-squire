"""Exercise mergeFavorites() from scripts/manager-favorites-sync.js.

    python testing/test-favorites-merge.py        # from the module root

The merge is a three-way diff against a recorded ancestor, and the cases that
matter are the ones where the two lists differ for OPPOSITE reasons: an item in
Squire but not on the sheet is either a Squire addition or a sheet removal, and
treating one as the other silently undoes a real edit. Those cases are
indistinguishable by inspection, which is why they are pinned here.

It lifts the function out of the module rather than importing it, so it runs
without Foundry.
"""
import io
import os
import subprocess

src = io.open('scripts/manager-favorites-sync.js', encoding='utf-8').read()
i = src.index('export function mergeFavorites')
j = src.index('const sameList =')
fn = src[i:j].replace('export function', 'function')

cases = [
    # label, squire, sheet, last, expected
    ("first run: union, squire order leads", ["a", "b"], ["b", "c"], None, ["a", "b", "c"]),
    ("first run: squire empty adopts sheet", [], ["x", "y"], None, ["x", "y"]),
    ("first run: sheet empty keeps squire", ["x", "y"], [], None, ["x", "y"]),
    ("first run: both empty", [], [], None, []),

    ("steady: no change", ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"]),

    ("squire added", ["a", "b", "c"], ["a", "b"], ["a", "b"], ["a", "b", "c"]),
    ("sheet added", ["a", "b"], ["a", "b", "c"], ["a", "b"], ["a", "b", "c"]),

    # The cases a plain union gets wrong: a removal looks identical to
    # an addition on the other side unless you diff against the ancestor.
    ("squire removed stays removed", ["a"], ["a", "b"], ["a", "b"], ["a"]),
    ("sheet removed stays removed", ["a", "b"], ["a"], ["a", "b"], ["a"]),

    # A removal on either side is honoured. "Squire wins" governs ORDER, not
    # membership: putting a sheet-removed item back would make unfavouriting
    # on the character sheet impossible.
    ("squire re-adds after sheet removal is NOT a thing", ["a", "b"], ["a"], ["a", "b"], ["a"]),

    ("both add different items", ["a", "c"], ["a", "d"], ["a"], ["a", "c", "d"]),
    ("squire adds c while sheet removes a", ["a", "c"], [], ["a"], ["c"]),

    ("squire reorder wins", ["b", "a"], ["a", "b"], ["a", "b"], ["b", "a"]),
]

lines = [fn, "let pass = 0, fail = 0;",
         "function check(label, got, want) {",
         "  const ok = JSON.stringify(got) === JSON.stringify(want);",
         "  if (ok) { pass++; return; }",
         "  fail++;",
         "  console.log('FAIL  ' + label);",
         "  console.log('   got  ' + JSON.stringify(got));",
         "  console.log('   want ' + JSON.stringify(want));",
         "}"]

for label, squire, sheet, last, want in cases:
    import json
    lines.append("check(%s, mergeFavorites(%s, %s, %s), %s);" % (
        json.dumps(label), json.dumps(squire), json.dumps(sheet),
        'null' if last is None else json.dumps(last), json.dumps(want)))

lines.append("console.log(pass + ' passed, ' + fail + ' failed');")
lines.append("if (fail) process.exit(1);")

path = os.path.join(os.environ.get('TEMP', '.'), 'merge_harness.mjs')
io.open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print(subprocess.run(['node', path], capture_output=True, text=True).stdout)
print(subprocess.run(['node', path], capture_output=True, text=True).stderr[:400])
