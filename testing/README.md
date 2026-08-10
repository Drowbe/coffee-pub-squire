# Squire Test Harness

`test-harness-macro.js` is a pasteable Foundry **Script Macro** for GM integration testing.

1. Refresh Foundry so the current local Blacksmith and Squire sources are loaded.
2. Create a Script Macro.
3. Paste the complete contents of `testing/test-harness-macro.js`.
4. Target a token, keep the browser console open, and run the macro.

The harness stays open while scenarios run. Most scenarios are read-only previews. Anything
that can move an item or rewrite journal data is prefixed **LIVE** and requires a second
destructive confirmation.

The harness intentionally calls real public windows and workflow entry points rather than
reimplementing their logic. Update it whenever a migration adds a reusable workflow that
would otherwise require repetitive manual setup.

The Audit tab includes Entity List readability in Light/Dark/Glass and two-instance Tool
action delegation. The Transfers tab previews every final Transfer Tool shape without
moving data: selectable item recipient, selectable note recipient, fixed-recipient
quantity split, and incoming approval.

## `preflight.py` — run before loading Foundry

```
python testing/preflight.py      # from the module root
```

Static checks only; no Foundry, no world. It exists because the same class of mistake has
shipped a broken build twice — once a deleted script still listed in `esmodules`, once an
import of a function that had just been removed. Both are silent until Foundry refuses to
load the module.

It checks that:

1. **every script parses as an ES module** — note this is `node --check` on a **`.mjs` copy**,
   not on the `.js` file. `node --check foo.js` parses as CommonJS *script*, which is more
   permissive: it accepted a genuine `SyntaxError` that then broke the world at load. Checking
   the `.js` directly is worse than not checking at all, because it reports success.
2. every `esmodules` / `styles` path in `module.json` exists on disk;
3. every static **and dynamic** (`await import(...)`) specifier resolves;
4. every named binding in an import is actually exported by the file it comes from — this is
   what catches "deleted the function, left the import";
5. every `@import` in a stylesheet resolves;
6. every `modules/coffee-pub-squire/...` asset path written in any script or template exists —
   templates, partials, stylesheets, JSON.

A clean run is not a substitute for loading a world. It only proves the module can be parsed
and that nothing points at a file that isn't there.
