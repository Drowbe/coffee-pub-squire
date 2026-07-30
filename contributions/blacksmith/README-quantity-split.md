# Quantity/Split Control Contribution

This is the exact Squire interaction Blacksmith requested for the shared
quantity/split component:

- `quantity-split-control.hbs` — semantic range input with Give, Keep, and
  Transfer Amount outputs.
- `quantity-split-control.css` — compact layout using Blacksmith Tool variables;
  it does not style or override the host frame.
- `quantity-split-control.js` — per-instance attachment, initial synchronization,
  clamping, change reporting, programmatic value access, and cleanup.

## Behavior contract

- `value` is the quantity being given.
- `keep` is always `max - value`.
- Default range is `1..max`.
- The component owns no submit, cancel, close, socket, transfer, or document
  mutation behavior.
- It may be embedded in a Tool window or DialogV2 form.
- The host reads `input.value` normally or uses the returned controller.
- Reattaching is a host lifecycle decision; call `destroy()` before discarding a
  controller whose root remains alive.

The current Squire transfer UI used pseudo-elements for the labels and a
template-injected script. This contribution deliberately replaces those with
real accessible markup and an attachable controller because ApplicationV2 does
not execute scripts injected through body templates.

## Verification

Test at minimum:

1. `max = 1`, `max = 2`, and a large stack.
2. Initial values at both bounds.
3. Mouse and keyboard changes.
4. Give + Keep always equals Max.
5. Light, Dark, and Glass Tool themes.
6. Two controls in one Tool window and two Tool instances simultaneously.
