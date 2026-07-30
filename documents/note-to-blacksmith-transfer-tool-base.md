# Note to Blacksmith: Transfer Window Base-Class Clarification

Thank you for the corrections. We agree with the component-level counterproposal:

- Blacksmith owns `api.dialog`.
- Blacksmith owns the shared selectable-entity component.
- Squire contributes the quantity/split control upstream.
- Squire owns the transfer workflow, sockets, permissions, validation, mutations, and sender/recipient states.
- There is no `transfer.open` API, transfer mode enum, separate registry, or Blacksmith-owned approval orchestration.

There is one important clarification: our intended Squire Transfer window was always a **Tool V2 window**, not a standard document/form window.

The planned class is:

```js
class TransferWindow extends BlacksmithToolWindowBaseV2
```

The transfer experience is a compact canvas utility:

```text
[ tool title bar ]
[ subject/action details ]
[ optional quantity or configuration ]
[ recipient selection ]
[ cancel / primary action ]
```

It is operational, focused, and opened over the canvas to complete a short action. It is closer in purpose to Dice Tray or Health than to the Notes, Codex, or Quest document editors. Micro/Full title bars and Light/Dark/Glass presentation are intentional parts of the desired experience.

Therefore, the Light/Dark/Glass acceptance criterion is satisfiable and should remain—but specifically because Squire will build on `BlacksmithToolWindowBaseV2`. We are not requesting that themes be added to `BlacksmithWindowBaseV2`, and no standard-base design-system expansion should ride along with this work.

This does not change the ownership decision. The Tool base supplies presentation and lifecycle only. Squire still owns:

- Item/note domain rules
- Subject content
- Quantity rules
- Recipient eligibility
- Permission checks
- Socket messages
- Recipient approval
- Revalidation
- Document mutations and ownership changes
- Notifications

We also agree with the other two corrections:

1. Validate the entity component's single-select mode through `MenuBar.showLeaderDialog` using `api.dialog`.
2. Validate multi-select through `window-toast-send.js`.
3. Defer `window-skillcheck.js`; it is too large and specialized to serve as a clean component-validation target.
4. Keep the embedded component selection-driven (`onSelectionChange`, `getSelection`, `setSelection`). Submit/cancel/close semantics belong to its host window or dialog, not the embedded component.

One implementation question remains for Blacksmith:

> Is `BlacksmithToolWindowBaseV2` intended to support ephemeral, workflow-launched tools that are not exposed in the menubar, or does it currently assume every Tool window is registered/persistent?

Our preference is that using the Tool base should not require a menubar button. Squire can register the class with the existing Window API if lifecycle consistency requires it, but the Transfer tool should open only from transfer/give/share actions rather than appearing as a general launcher.

Assuming ephemeral/non-menubar Tool windows are supported, the resolved architecture is:

1. Blacksmith ships and verifies `api.dialog`.
2. Blacksmith ships and verifies the shared entity component in single- and multi-select modes.
3. Squire contributes the current quantity/split control upstream for Blacksmith form-control documentation and styling.
4. Squire builds its compact, themed Transfer tool on `BlacksmithToolWindowBaseV2`.
5. Squire opens the same Tool class in a separate approval state on the recipient client through Squire-owned sockets.

That retains the smaller reusable Blacksmith surface you recommended while delivering the compact themed canvas workflow we intended.
