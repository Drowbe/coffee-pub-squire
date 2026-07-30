# Resolved Proposal: Blacksmith Dialog and Form Components for Squire Transfers

> **Base class confirmed:** The final Transfer experience extends `BlacksmithToolWindowBaseV2`. Ephemeral, non-menubar Tool windows are supported through direct construction and render; Window API registration is optional and is not appropriate for this action-launched tool.

## Decision

Blacksmith accepted the proposed DialogV2 helpers and rejected the proposed hub-owned Transfer/Share workflow window. The agreed architecture is smaller and cleaner:

1. Blacksmith provides `api.dialog`.
2. Blacksmith provides a shared selectable-entity component.
3. Blacksmith provides a shared quantity/split control.
4. Squire builds and owns its Transfer tool on `BlacksmithToolWindowBaseV2`.
5. Squire owns both sides of recipient approval and connects them through its sockets.
6. Squire JSON imports migrate independently to Blacksmith's existing robust importer.

The earlier proposal for `transfer.open`, workflow modes, approval orchestration, and a separate transfer-flow registry is superseded. A shared workflow window should be reconsidered only if real duplication remains across multiple consumer modules after the smaller components are in use.

---

## 1. Blacksmith `api.dialog`

### Purpose

Provide a consistent wrapper over `foundry.applications.api.DialogV2` for confirmations, choices, prompts, and short custom interactions.

Blacksmith already has many raw DialogV2 call sites but no shared dialog presentation. This is framework infrastructure: presentation and promise semantics without consumer domain logic or cross-client state.

### API

```js
await blacksmith.dialog.confirm(options);
await blacksmith.dialog.choose(options);
await blacksmith.dialog.prompt(options);
await blacksmith.dialog.wait(options);
```

### Global dismissal contract

User dismissal must never reject:

- Pressing Escape resolves the configured `closeValue`.
- Clicking the title-bar close button resolves `closeValue`.
- Clicking an explicit Cancel button resolves `cancelValue`.
- If a helper does not distinguish close from cancel, both resolve the same documented fallback.
- Exceptions thrown by consumer callbacks or framework failures may still reject.

Every helper should set or internally enforce the equivalent of `rejectClose: false`.

The shared result vocabulary should be used where an object result is appropriate:

```js
{ action: 'submit', value, result }
{ action: 'cancel', value: cancelValue }
{ action: 'close', value: closeValue }
```

Simple `confirm` calls may continue to resolve a boolean if Blacksmith prefers compatibility with `DialogV2.confirm`.

### Content contract

`content` should accept:

```ts
string | HTMLElement | Promise<string | HTMLElement>
```

Consumers render their own Handlebars templates before calling the helper. The dialog API should not own template loading.

Accepting DOM is required for content that must remain literal rather than being interpreted as markup.

### `confirm`

```js
const confirmed = await blacksmith.dialog.confirm({
  title: 'Delete Note',
  content: '<p>Delete this note?</p>',
  confirmLabel: 'Delete',
  confirmIcon: 'fa-solid fa-trash',
  destructive: true,
  defaultAction: 'cancel',
  closeValue: false
});
```

### `choose`

`choose` is the genuinely new surface and needs the clearest contract.

```js
const result = await blacksmith.dialog.choose({
  title: 'Delete Note Pins',
  content: '<p>Choose which pins to delete.</p>',
  choices: [
    { id: 'scene', label: 'Current Scene', icon: 'fa-solid fa-map' },
    { id: 'all', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true }
  ],
  cancelValue: null,
  closeValue: null
});
```

Each choice may provide:

```js
{
  id,
  label,
  icon,
  description,
  disabled,
  destructive,
  callback
}
```

### `prompt`

```js
const result = await blacksmith.dialog.prompt({
  title: 'Choose Journal',
  content: renderedContent,
  getValue: root => root.querySelector('[name="journal"]').value,
  validate: value => value ? null : 'Choose a journal.',
  cancelValue: null,
  closeValue: null
});
```

### `wait`

```js
const result = await blacksmith.dialog.wait({
  title,
  content,
  buttons,
  onRender,
  cancelValue: null,
  closeValue: null
});
```

### Shared behavior

All helpers should:

- Use Foundry `DialogV2`.
- Never reject for ordinary dismissal.
- Invoke consumer callbacks after the dialog closes, with the captured form available for reading.
- Support destructive button treatment.
- Implement prompt validation as a bounded reopen loop that preserves the entered value and presents the error.
- Accept HTML strings or DOM.
- Use Blacksmith dialog styles and action conventions.
- Restore focus appropriately after closing.

DialogV2 closes when an action is activated, so in-place validation, disabling a submitted
button while work runs, and duplicate-click prevention are not dialog guarantees. Workflows
that must remain visible after a failed operation belong in a Tool window.

### Blacksmith verification

The same Blacksmith change should:

1. Add `styles/dialog.css`.
2. Import it from Blacksmith's `default.css`.
3. Convert the thirteen-dialog cluster in `window-pin-layers.js` (eleven confirmations and two prompts).

That proves semantics, styling, and real-world use before Squire adopts the API.

---

## 2. Shared Selectable-Entity Component

### Purpose

Provide reusable single- and multi-select entity presentation without owning the workflow that consumes the selection.

Known consumers already exist:

- Blacksmith multi-user selection in `window-toast-send.js`.
- Blacksmith single actor/owner selection in `MenuBar.showLeaderDialog`.
- Squire character selection for item transfers.
- Squire user selection for giving private notes.

### Entity descriptor

```js
{
  id,
  uuid,
  name,
  img,
  type,
  disabled,
  disabledReason,
  badges,
  metadata
}
```

### Capabilities

- Single-select and multi-select.
- Portrait/image plus name.
- Optional type treatment.
- Optional badges and metadata.
- Disabled entries with an accessible explanation.
- Keyboard navigation.
- Selected-state styling.
- Consumer filtering.
- Empty-state presentation.
- Configurable compact/list/grid variants if Blacksmith's existing consumers require them.

### Providers

Blacksmith may provide convenience adapters for:

- Users
- Actors
- Canvas Tokens
- Blacksmith campaign party members

Consumers must also be able to provide descriptor arrays directly.

### Embedded component contract

The embedded entity component does not submit, cancel, close, or return a workflow result. It reports selection changes and lets its host read or set the current selection:

```js
onSelectionChange: ({ selected, changed, sourceEvent }) => {}
getSelection: () => selectedEntities
setSelection: (ids) => {}
```

For single-select mode, `selected` contains zero or one entity. For multi-select mode, it may contain many.

The `{ action: 'submit' | 'cancel' | 'close' }` vocabulary belongs only to something that owns an open/close lifecycle, such as `api.dialog` or a possible future dialog-opening picker helper. That helper should be considered only after a second real consumer requires it; it is not part of the embedded component.

The component itself should not open or close a window, submit a form, open sockets, transfer documents, change ownership, or send notifications.

### Blacksmith verification

Verify both selection modes:

1. Convert `MenuBar.showLeaderDialog` from its bare `<select>` in a raw DialogV2 to `api.dialog` plus the entity component in single-select mode. This proves the mode Squire's transfer workflow needs and improves a real Blacksmith interaction.
2. Convert the user checkbox list in `window-toast-send.js` to the entity component in multi-select mode.
3. Render the entity component in a scratch `BlacksmithToolWindowBaseV2` under Light, Dark, and Glass. Its surfaces must inherit the `--blacksmith-tool-*` variables rather than hard-coding an opaque background. The DialogV2 and standard-window targets do not exercise translucent Glass presentation.

Do not use `window-skillcheck.js` as an initial validation target. Its large actor rows, four filters, and roughly 2,700-line implementation make that a skill-check-window refactor rather than a focused component test. It can adopt the component later when that work is independently justified.

---

## 3. Shared Quantity/Split Control

### Purpose

Upstream Squire's existing quantity selector as a Blacksmith form component instead of recreating it from a description.

The current Squire interaction is the acceptance baseline:

- Clear Give and Keep values.
- Slider between valid bounds.
- Immediate visual updates.
- Correct singular/plural behavior.
- Keyboard accessibility.
- Compact layout.
- No loss of clarity or speed.

### Ownership

Blacksmith owns:

- Shared markup contract.
- Shared CSS in `window-form-controls.css`.
- Value/update behavior if supplied as a component helper.
- Documentation in `design-components.md`.
- Light, Dark, and Glass presentation inherited from Tool variables when hosted in a Tool window, while remaining usable in DialogV2 and standard-window consumers.

Consumers own:

- Minimum, maximum, and initial values.
- Labels.
- Domain validation.
- What the resulting number means.

### Contributed implementation

Squire's exact contribution is now packaged under `contributions/blacksmith/`:

- `quantity-split-control.hbs`
- `quantity-split-control.css`
- `quantity-split-control.js`
- `README-quantity-split.md`

It preserves the Give/Keep interaction while replacing the old template-injected script
with an attachable per-instance controller suitable for ApplicationV2. Blacksmith may align
final filenames with its component registry, but the behavior and accessibility contract
should remain intact.

### Blacksmith verification

Reproduce Squire's current quantity interaction with the contributed markup and styling before Squire removes its local version.

---

## 4. Squire-Owned Transfer Window

### Architecture

Squire will build one reusable Transfer tool on:

- `BlacksmithToolWindowBaseV2`
- Blacksmith's selectable-entity component
- Blacksmith's quantity/split control
- Blacksmith's standard fields, badges, sliders, inputs, and action buttons

Blacksmith does not need a transfer-specific API, mode enumeration, registry, socket behavior, or approval orchestration.

### Layout

```text
[ HEADER ]

[ DETAILS ]
[ item/note image, name, source, and action context ]

[ CONFIGURATION — optional ]
[ quantity/split control for stack transfers ]

[ RECIPIENT ]
[ shared selectable-entity component ]

[ Cancel                                  Transfer ]
```

The configuration section does not render when it is unnecessary.

### Launch and lifecycle

The Transfer tool is ephemeral and action-launched:

```js
const transfer = new TransferTool(options);
await transfer.render(true);
```

- Do not register it with the Window API.
- Do not add a menubar launcher.
- Set `rememberPosition: false`; multiple simultaneous instances must not compete over the class-name position key.
- Theme persistence remains available because Tool theme keys are stored separately from position persistence.
- Application options are frozen. Runtime theme changes must use `setToolTheme()` rather than mutating `this.options`.
- Constrain the recipient area and verify a large party against the Tool maximum height (`calc(100vh - 16px)`); the recipient list is the primary growth axis.

### Multi-instance event safety

The sender tool and an incoming approval tool may be open at the same time. Blacksmith has
replaced its class-static dispatcher with per-instance frame delegation and passes the
instance as the third handler argument (and as `this`).

For `TransferTool`:

- Use the handler instance argument or bind listeners per instance against `this.element`.
- Remove or naturally discard those listeners with the instance DOM.
- Never resolve a button action through class-static instance state.
- Live-test two simultaneous TransferTool instances and confirm each instance mutates only its own transfer state.

The Squire harness now includes a two-instance Tool probe that clicks one action in each
instance and asserts that both receive exactly one hit.

### Squire use cases

One Squire implementation should cover:

- Tray drop item transfer.
- Inventory item transfer.
- Party-panel item transfer.
- Weapon transfer.
- Character recipient selection.
- Giving a private note to another user.

### Recipient approval

Approval remains a Squire pattern:

1. Sender opens Squire's Transfer window.
2. Sender submits the transfer request.
3. Squire sends its socket message.
4. The recipient client opens a separate Squire Transfer window in approval presentation.
5. Squire revalidates authorization and document state.
6. Squire applies or rejects the transfer.

The two windows share Squire presentation and data, but Blacksmith does not coordinate them.

### Squire ownership

Squire owns:

- Item and note domain rules.
- Subject details.
- Recipient eligibility.
- Permission checks.
- Quantity validation.
- Socket messages.
- Recipient filtering.
- Revalidation.
- Document mutations.
- Ownership changes.
- Transfer notifications.
- Sender and recipient window states.

### Acceptance criteria

- Four duplicated quantity dialogs collapse into one Squire implementation.
- The existing quantity-selector experience is preserved or improved.
- Synthetic-token Actors resolve correctly.
- A sender cannot select the current owner as recipient.
- Disabled recipients explain why they are unavailable.
- A single item skips or simplifies quantity configuration.
- Giving a note does not show an empty quantity section.
- Submission cannot run twice.
- Failure leaves the window open with a useful error.
- Closing or cancelling always clears Squire's transfer lock.
- Recipient approval uses the same subject/configuration presentation.
- Light, Dark, and Glass remain readable without Squire frame overrides.
- The entity list inherits Tool theme variables and remains legible on translucent Glass.
- Two simultaneous instances route every action to the correct instance.
- Position persistence is disabled so simultaneous instances do not overwrite one shared position key.
- Runtime theme changes use `setToolTheme()` and never mutate frozen options.
- A large recipient list scrolls within the viewport-constrained Tool window.

---

## 5. Other Squire Migrations

### Keep as dialogs

After Blacksmith ships `api.dialog`, Squire should migrate these to the helpers:

- Delete note confirmation.
- Delete note from canvas pin.
- Delete codex entry confirmation.
- Delete quest confirmation.
- Clean up missing note pins.
- Confirm note-pin deletion.
- Manual clipboard-copy fallback.
- Small scope choices that do not justify a persistent tool.

### Potential Squire windows

These are larger than simple dialogs and may warrant focused Squire windows:

- Journal and journal-page picker.
- JSON/data export preview.
- Notes or Quest pin maintenance, only if their action set grows.

### JSON import

All Squire JSON imports should migrate to Blacksmith's existing robust importer:

- `window-json-import.js`
- `registry-json-import-*.js`

Begin this batch after the integrated Blacksmith source exposes the authoritative `api.dialog`
contract at runtime. A public release/version bump is not required during suite integration.
It does not require the later entity-picker, quantity-control, or action-delegation work.

---

## Delivery Sequence

1. **Complete:** Blacksmith exposes `api.dialog`; Squire consumes the public runtime namespace and has migrated all 22 legacy Dialog sites.
2. **Implemented, verify live:** Blacksmith `api.entityList` single-select behavior.
3. **Implemented, verify live:** Blacksmith `api.entityList` multi-select behavior.
4. **Harness ready, verify live:** Entity List inside a Tool window cycling Light, Dark, and Glass.
5. **Implemented upstream, verify live:** Blacksmith integrated Squire's quantity/split interaction as generated markup alongside `api.entityList`, retained the contributed layout and Tool-theme CSS, and added `aria-valuetext`, integer clamping, a consistent controller return, and silent initial attachment. Keep `contributions/blacksmith/` until Blacksmith's quantity harness passes, then delete the local duplicate.
6. **Verify live:** Run Blacksmith's combined harness: 11 headless checks across Entity List, per-instance delegation, and Quantity Split, followed by the Entity List and Quantity Split interactive Tool-theme checks.
7. Squire builds its ephemeral Transfer tool with per-instance listeners, no registration, and no position persistence.
8. Squire live-tests simultaneous sender and approval instances plus a large recipient list.
9. Squire migrates simple legacy dialogs to `api.dialog`.
10. Squire removes duplicate Quest import/export paths and moves JSON imports to Blacksmith's robust importer.
11. Reconsider a dialog-opening picker helper or shared workflow shell only if multiple real consumers still duplicate meaningful code after these steps.
