# Dev Note: Unplaced Pin Support (Pins Not Tied to Canvas)

## Problem
We need to create and configure pins even when they are **not placed on a canvas scene**. Pins might later be placed on the canvas, or attached to other future targets. Today the API assumes `sceneId + x/y` are always required.

## Proposal: Unplaced Pins
Allow a pin to exist in an **unplaced state** (no scene attachment). The pin is a first‑class object even before it is rendered.

### Key Behavior
- Pins can be **created without** `sceneId`, `x`, `y`.
- Unplaced pins are **not rendered** on any canvas.
- Later, they can be **placed** on a scene when needed.
- Hooks should still fire for create/update/delete regardless of placement.

## API Additions (Suggested)

### 1) Create unplaced pin
```js
await pins.create({
  id: crypto.randomUUID(),
  moduleId: 'coffee-pub-squire',
  type: 'note',
  image: 'fa-solid fa-book-open',
  text: 'Note Pin',
  config: { noteUuid }
  // no sceneId, x, y
});
```

### 2) Place pin on a scene later
Either a dedicated method:
```js
await pins.place(pinId, { sceneId, x, y });
```

Or reusing update:
```js
await pins.update(pinId, { sceneId, x, y });
```

### 3) Unplace pin
```js
await pins.unplace(pinId); // clears sceneId/x/y but keeps pin data
```

## Data Model Suggestions
Add a placement state so the renderer knows whether to show it:

```ts
interface PinData {
  id: string;
  moduleId: string;
  sceneId?: string;
  x?: number;
  y?: number;
  placement?: 'placed' | 'unplaced';
  // ...rest of pin properties...
}
```

Rules:
- If `sceneId/x/y` missing, treat as `placement = 'unplaced'`.
- Renderer skips unplaced pins.

## Hooks (Expected)
The following should still fire even for unplaced pins:
- `blacksmith.pins.updated`
- `blacksmith.pins.deleted`

Optional additions:
- `blacksmith.pins.placed`
- `blacksmith.pins.unplaced`

## Why This Matters
- **Notes** can exist without canvas pins.
- Pin design is meaningful even without placement.
- We can later pin to other surfaces (journals, pages, maps, UI, etc.).

## Minimal Change Alternative
If new methods are too heavy, allow:
- `pins.create()` with no `sceneId/x/y`.
- `pins.update()` accepts `sceneId/x/y` later to place.
- `pins.delete()` works on both placed/unplaced.

This is enough for current module needs.
