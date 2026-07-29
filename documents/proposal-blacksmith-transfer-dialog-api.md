# Proposal to Blacksmith: Reusable Transfer/Share Window and DialogV2 API

## Summary

Coffee Pub modules need two related UI primitives:

1. A reusable, themed **Transfer/Share workflow window** for sending, giving, transferring, or sharing something with a recipient.
2. A small, consistent **DialogV2 API** for confirmations, choices, and short prompts that should remain dialogs.

Squire currently implements an item transfer as three separate experiences:

1. Select a quantity.
2. Select a recipient.
3. Ask the recipient to approve or reject the transfer.

The quantity selector is already a strong interaction and should not be visually or functionally degraded. The problem is architectural: the flow is split across legacy dialogs, a module-specific picker window, duplicated quantity code, and socket handling. Notes use a separate recipient picker to give a private note to another user.

The proposed Blacksmith APIs would provide a consistent shell and lifecycle while leaving domain rules with the consuming module.

---

## 1. Transfer/Share Workflow Window

### Goal

Provide a generic Blacksmith Application V2 window that can support:

- Send an item
- Transfer an item or quantity from a stack
- Give a private note
- Share a document
- Assign something to a user or Actor
- Request recipient approval

The API should not know Foundry item-transfer rules, Squire note ownership, or any other module's business logic. It owns presentation, navigation, validation, themes, and workflow state. The consumer owns the data and operation.

### Proposed Layout

```text
[ HEADER ]

[ ACTION / SUBJECT DETAILS                           ]
[ icon ] [ name                                      ]
[        [ description, source, or contextual details ]

[ CONFIGURATION — optional                          ]
[ module-provided fields, e.g. quantity slider       ]

[ RECIPIENT                                          ]
[ actor/user/token/custom recipient selection         ]

[ Cancel                              Primary Action ]
```

The window should use Blacksmith's normal Application V2 frame, themes, sizing, position persistence, and responsive layout.

### Required Capabilities

#### Header

- Title
- Optional icon
- Optional subtitle
- Optional action verb such as Send, Transfer, Give, Share, or Assign

#### Subject details

- Image or icon
- Name
- Optional description
- Optional source label
- Optional metadata rows or badges
- Consumer-provided enriched HTML when needed

#### Configuration

- Entire section is optional.
- Consumer may supply fields or a rendered template.
- Supports initial values, live validation, and value collection.
- Must support the existing Squire quantity interaction:
  - Give/keep values
  - Slider
  - Clear minimum and maximum
  - Singular/plural display
  - Keyboard-accessible controls

#### Recipient selection

Built-in providers should eventually support:

- Foundry Users
- Actors
- Canvas Tokens
- Blacksmith campaign party members
- Custom consumer-supplied recipients

Each recipient should support:

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

The consumer must be able to filter recipients and prevent invalid choices such as transferring an item back to its current owner.

#### Actions

- Configurable primary action label and icon
- Cancel action
- Optional secondary actions
- Async callback support
- Disable actions while processing
- Prevent duplicate submission
- Inline validation errors
- Preserve the window when the operation fails
- Close only after a successful result unless the consumer explicitly requests otherwise

### Workflow Modes

The same component should support both single-window and distributed workflows.

#### Immediate

The initiating user selects configuration and recipient, then the consumer executes immediately.

#### Approval required

The initiating user submits a request. The recipient receives the same workflow window in an approval state:

```text
[ HEADER: Transfer Request ]
[ subject and sender details ]
[ quantity/configuration summary ]
[ recipient summary ]
[ Reject ] [ Accept ]
```

Blacksmith should manage only the UI state. The consumer remains responsible for sockets, authorization, revalidation, and document changes.

### Suggested API Shape

Names are illustrative.

```js
const result = await blacksmith.transfer.open({
  id: 'coffee-pub-squire-item-transfer',
  mode: 'transfer',
  title: 'Transfer Item',
  actionLabel: 'Transfer',

  subject: {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    description: `${sourceActor.name} is giving ${item.name}`,
    metadata: [
      { label: 'Source', value: sourceActor.name }
    ]
  },

  configuration: {
    template: 'modules/coffee-pub-squire/templates/transfer-quantity.hbs',
    data: {
      quantity: 1,
      maximum: item.system.quantity
    },
    getValue: root => ({
      quantity: Number(root.querySelector('[name="quantity"]').value)
    }),
    validate: values => {
      if (values.quantity < 1) return 'Choose at least one item.';
      if (values.quantity > item.system.quantity) return 'Not enough items are available.';
      return null;
    }
  },

  recipients: {
    type: 'actor',
    items: eligibleActors,
    selectedId: null
  },

  onSubmit: async ({ recipient, values }) => {
    return requestItemTransfer({
      itemUuid: item.uuid,
      targetActorUuid: recipient.uuid,
      quantity: values.quantity
    });
  }
});
```

For simpler use cases:

```js
await blacksmith.transfer.open({
  mode: 'give',
  title: 'Give Note',
  subject: {
    name: note.name,
    img: note.img,
    description: 'Choose the player who should own this private note.'
  },
  recipients: {
    type: 'user',
    items: eligibleUsers
  },
  actionLabel: 'Give Note',
  onSubmit: ({ recipient }) => giveNoteToUser(note, recipient)
});
```

### Return Contract

The returned promise should resolve predictably:

```js
{ action: 'submit', recipient, values, result }
{ action: 'cancel' }
{ action: 'close' }
```

It should not reject for ordinary cancellation. It may reject for configuration or framework errors.

### Extension and Ownership Boundary

Blacksmith should own:

- Window frame and Application V2 lifecycle
- Light, Dark, and Glass themes
- Standard layout and responsive behavior
- Recipient-selection presentation
- Configuration slot rendering
- Action state and validation presentation
- Loading, success, and error states
- Focus management and keyboard accessibility
- Optional approval-state presentation

Consumers should own:

- Eligible recipient calculation
- Permission checks
- Subject data
- Configuration fields and validation rules
- Socket messages
- Approval authorization
- Revalidation at execution time
- Creation, update, deletion, or ownership changes
- Notifications specific to the operation

Blacksmith must not perform an item transfer or document ownership change merely because the generic window was submitted.

### Registration

If the workflow uses the existing Window API, consumers should be able to register a named configuration/factory:

```js
blacksmith.registerTransferFlow({
  id: 'coffee-pub-squire.item-transfer',
  moduleId: 'coffee-pub-squire',
  create: options => buildSquireItemTransfer(options)
});

await blacksmith.openTransferFlow('coffee-pub-squire.item-transfer', options);
```

Direct, unregistered use should also be supported for ephemeral workflows.

---

## 2. Blacksmith DialogV2 API

### Goal

Not every legacy dialog should become a persistent window. Destructive confirmations, small choices, and exceptional prompts are better as dialogs. Blacksmith should expose a consistent wrapper around `foundry.applications.api.DialogV2` so Coffee Pub modules do not each recreate:

- Button conventions
- Destructive styling
- Icons
- Theming
- Promise results
- Focus behavior
- Error handling
- Compatibility details

### Suggested API

```js
await blacksmith.dialog.confirm({
  title: 'Delete Note',
  content: '<p>Delete this note?</p>',
  confirmLabel: 'Delete',
  confirmIcon: 'fa-solid fa-trash',
  destructive: true,
  defaultAction: 'cancel'
});
```

```js
const choice = await blacksmith.dialog.choose({
  title: 'Delete Note Pins',
  content: '<p>Choose which pins to delete.</p>',
  choices: [
    { id: 'scene', label: 'Current Scene', icon: 'fa-solid fa-map' },
    { id: 'all', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true }
  ],
  cancelValue: null
});
```

```js
const value = await blacksmith.dialog.prompt({
  title: 'Choose Journal',
  content: renderedHtml,
  getValue: root => root.querySelector('[name="journal"]').value,
  validate: value => value ? null : 'Choose a journal.'
});
```

```js
const result = await blacksmith.dialog.wait({
  title,
  content,
  buttons,
  onRender,
  closeValue: null
});
```

### Recommended Helpers

- `blacksmith.dialog.confirm(options)`
- `blacksmith.dialog.choose(options)`
- `blacksmith.dialog.prompt(options)`
- `blacksmith.dialog.wait(options)`

All helpers should:

- Return promises
- Resolve cancellation consistently
- Support async callbacks
- Support destructive actions
- Support consumer HTML or templates
- Support validation
- Disable buttons while awaiting callbacks
- Use Blacksmith's visual language
- Be built on Foundry's `DialogV2`, not legacy `Dialog`

---

## 3. Squire Migration Targets

### Transfer/Share window

The following Squire paths should converge on the proposed Transfer/Share workflow:

- Tray drop transfer quantity
- Inventory transfer quantity
- Party-panel transfer quantity
- Weapon transfer quantity
- Character recipient selection
- Recipient approval/rejection
- Give private note to another user

The current quantity selector is the visual and interaction baseline. Consolidation is worthwhile only if the shared workflow preserves or improves it.

### DialogV2 helpers

These should remain dialogs:

- Delete note confirmation
- Delete codex entry confirmation
- Delete quest confirmation
- Clean up missing note pins confirmation
- Confirm note-pin deletion
- Delete note from canvas pin
- Manual clipboard-copy fallback

These may remain dialogs or later become focused maintenance windows if their scope grows:

- Note-pin deletion scope
- Quest-pin clearing scope

### Separate reusable windows

These are larger workflows and should not be forced into simple dialogs:

- Journal and journal-page picker
- JSON/data export preview

All Squire JSON imports should migrate to Blacksmith's robust importer rather than being rebuilt on the proposed DialogV2 wrapper.

---

## 4. Recommended Delivery Phases

### Phase 1: DialogV2 helpers

Implement `confirm`, `choose`, `prompt`, and `wait` as thin, stable wrappers. This immediately gives Coffee Pub modules a supported replacement for legacy Foundry dialogs.

### Phase 2: Transfer/Share window foundation

Implement:

- Subject details
- Optional configuration slot
- Recipient provider
- Primary/cancel actions
- Async validation and submission
- Theme support

Validate it by reproducing Squire's existing quantity selector without regression.

### Phase 3: Approval state

Add the recipient approval presentation and allow Squire to connect it to its existing socket and transfer authorization logic.

### Phase 4: Broader providers and registration

Add standard party/token/user providers and optional registration through the Window API after the core interaction is proven.

---

## Acceptance Criteria

- Squire can replace all four duplicated quantity dialogs with one shared workflow.
- The quantity interaction is at least as clear and efficient as the current Squire dialog.
- The same window can give a private note without displaying an empty configuration section.
- Recipient entries can be disabled with an explanation.
- Async submission cannot run twice.
- Failed operations leave the window open with a useful error.
- Recipient approval can reuse the same subject/configuration presentation.
- Consumers retain all authority over permissions, sockets, and document mutations.
- Simple confirmations require only a small Blacksmith helper call.
- Blacksmith's dialog helpers use Foundry `DialogV2` and return consistent promise results.
- Light, Dark, and Glass presentation is readable without consumer frame overrides.

