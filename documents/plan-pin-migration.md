# Plan: Pin API Migration (Squire → Blacksmith Pins API)

This plan assumes the **final API** and `pins.configure()` contract are now documented and stable. It focuses on replacing Squire’s custom pin config window and aligning all pin operations with the new API.

---

## Goals
- Use `pins.configure()` instead of `NoteIconPicker`.
- Use `pins.requestGM()` for all player pin writes.
- Ensure a **stable image/icon format**.
- Use the new `type` field consistently (`coffee-pub-squire-sticky-notes`).
- Keep note flags as the source of truth for tray state.

---

## Decisions (confirm before coding)
- **Image normalization**: FA class string + image URL string (recommended).
- **Ownership**: Continue sending explicit `ownership` in create/update, or switch fully to `resolveOwnership`.
- **Default storage**: Use the `notesPinDefaultDesign` setting (or migrate to new API default if needed).

---

## Migration Steps

### 1) Replace NoteIconPicker with `pins.configure()`
- Identify all entry points:
  - Pin context menu (configure)
  - Note editor header icon
- Replace with:
  ```js
  await pins.configure(pinId, {
    sceneId,
    moduleId: MODULE.ID,
    useAsDefault: true,
    defaultSettingKey: NOTE_PIN_DEFAULT_SETTING,
    onSelect: (config) => { /* map to note flags */ }
  })
  ```
- Map config payload → note flags:
  - `icon` → `noteIcon`
  - `pinSize` → `notePinSize`
  - `pinStyle` → `notePinStyle`
  - `pinShape` → `notePinShape`
  - `pinDropShadow` → `notePinDropShadow`
  - `pinTextConfig.*` → the text flags

### 2) Normalize icon/image format
- Store **FA icons** as class strings (e.g. `fa-solid fa-star`).
- Store **images** as URL strings.
- Ensure helpers (`buildNoteIconHtml`, `normalizeNoteIconFlag`) accept both.

### 3) Use `pins.requestGM()` everywhere for player writes
- **Create**: `pins.requestGM('create', { sceneId, payload })`
- **Update**: `pins.requestGM('update', { sceneId, pinId, patch })`
- **Delete**: `pins.requestGM('delete', { sceneId, pinId })`
- Keep GM direct calls for GMs.

### 4) Type usage
- Enforce `type: 'coffee-pub-squire-sticky-notes'` for create/update.
- Use `deleteAllByType(type, { moduleId })` for bulk delete.

### 5) Reconciliation / cleanup
- Replace custom cleanup logic with `pins.reconcile()` once stable.
- Listen for `blacksmith.pins.deletedAllByType` to clear note flags.

---

## Checklist

### API readiness
- [ ] `pins.configure()` is available and stable
- [ ] `onSelect` payload matches documented contract
- [ ] `defaultSettingKey` behavior confirmed
- [ ] `requestGM` works for create/update/delete

### UI migration
- [ ] Replace `NoteIconPicker` usage in notes panel
- [ ] Replace `NoteIconPicker` usage in note editor
- [ ] Verify preview updates on selection

### Data / flags
- [ ] Map config → note flags correctly
- [ ] Ensure note flags remain source of truth
- [ ] Ensure tray pin state matches flags

### Pin lifecycle
- [ ] Create pin with `type`
- [ ] Update pin with `type`
- [ ] Delete pin via `requestGM` when player
- [ ] Bulk delete uses `deleteAllByType`

### Ownership
- [ ] Decide: explicit ownership vs resolver hook
- [ ] Test visibility when GM toggles note private/party

### Regression tests
- [ ] Player pin create (no GM errors)
- [ ] Player pin update (no GM errors)
- [ ] Player unpin (pin removed for all)
- [ ] GM set note private (pin stays for GM, tray stays pinned)
- [ ] Cleanup pins (missing pins cleared, existing pins re-linked)

---

## Reference: Current Squire Pin Config Payload

```js
onSelect({
  icon: { type: 'fa' | 'img', value: string },
  pinSize: { w: number, h: number },
  pinShape: 'circle' | 'square' | 'none',
  pinStyle: { fill?: string, stroke?: string, strokeWidth?: number },
  pinDropShadow: boolean,
  pinTextConfig: {
    textLayout: 'under' | 'over' | 'around',
    textDisplay: 'always' | 'hover' | 'never' | 'gm',
    textColor: string,
    textSize: number,
    textMaxLength: number,
    textScaleWithPin: boolean
  }
})
```

---

## Notes
- No code changes should be made until the API is fully confirmed in `api-pins.md`.
- Keep `NoteIconPicker` intact until the replacement is verified.
