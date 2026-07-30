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
