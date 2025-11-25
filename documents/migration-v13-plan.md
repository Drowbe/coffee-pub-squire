# Coffee Pub Squire - v13 Migration Plan

> **Migration Status:** Planning Phase  
> **Target Version:** FoundryVTT v13  
> **Reference Guide:** See `documents/migration-v13-global.md`

---

## Executive Summary

This module requires extensive jQuery-to-native-DOM migration. The codebase has:
- **204+ instances** of `html.find()` calls
- **186+ instances** of `$()` jQuery constructor
- **59 files** with `activateListeners` methods that receive `html` parameters
- **6 Application/FormApplication classes** that need jQuery detection
- **No `getSceneControlButtons` hooks** ✅ (no migration needed)
- **No deprecated APIs** (.target, FilePicker) ✅ (no migration needed)

**Module Configuration:** Already configured for v13 in `module.json` ✅

---

## Migration Strategy

### Approach
- **Clean v13-only migration** (no dual compatibility)
- File-by-file migration with testing after each file
- Priority: Critical path → Core panels → Windows → Utilities

### Key Patterns to Apply
1. **jQuery Detection Pattern** (critical for FormApplication classes)
2. **Native DOM replacements** (querySelector, forEach, addEventListener)
3. **Event handler cleanup** (store references for removeEventListener)
4. **Multiple DOM roots** (for popout windows)

---

## Phase 1: Pre-Migration Setup

### 1.1 Environment Preparation
- [ ] Create v13 testing FoundryVTT instance
- [ ] Create feature branch: `v13-migration`
- [ ] Document baseline functionality (screenshots, feature list)
- [ ] Backup current working codebase

### 1.2 Module Configuration
- [x] Verify `module.json` has `"minimum": "13.0.0"` ✅ (Already done)
- [ ] Update module version in `module.json` to `13.0.0` (or `13.0.0-beta.1` for testing)
- [ ] Review CHANGELOG structure for v13 entry

---

## Phase 2: Critical Path Migration

**Priority: HIGH** - These files block core functionality

### 2.1 Core Manager Files

#### `scripts/manager-panel.js`
**Impact:** Core tray initialization and management  
**Changes Needed:**
- Replace `$(trayHtml)`, `$('body')`, `$(event.currentTarget)` patterns
- Convert all `html.find()` calls to `querySelector`/`querySelectorAll`
- Replace `.append()`, `.after()` with native DOM methods
- Update event handlers: `.on()` → `addEventListener()`, `.off()` → `removeEventListener()`
- Convert `.each()` to `.forEach()`
- Add jQuery detection in `activateListeners(html)`
- Handle `this.element` conversion (may be jQuery in v13)

**Key Areas:**
- Lines 274-338: Tray element creation and appending
- Lines 582-715: `activateListeners()` method
- Lines 710-745: Drag and drop handlers
- Lines 1726: Panel element finding

**Estimated Complexity:** HIGH (core functionality, many interactions)

---

#### `scripts/squire.js`
**Impact:** Module initialization and hook registration  
**Changes Needed:**
- Replace `$('.squire-tray').remove()` with native DOM removal
- Replace `$('.squire-questpin-tooltip').remove()` with native DOM removal
- Review all hooks that receive `html` parameters (currently using Blacksmith HookManager)
- Verify hook callbacks handle native DOM elements

**Key Areas:**
- Lines 2061-2062: Cleanup operations
- Lines 78-196: Hook callbacks that receive `html` parameters

**Estimated Complexity:** MEDIUM (mostly cleanup code, hooks managed by Blacksmith)

---

#### `scripts/manager-handle.js`
**Impact:** Tray handle functionality  
**Changes Needed:**
- Replace all `handle.find()`, `handle.off()`, `handle.on()` patterns
- Convert event handlers to native DOM
- Convert `.closest()` usage (already native-compatible, but verify context)
- Handle jQuery detection for `handle` elements

**Key Areas:**
- Lines 258+: All handle button event handlers
- Lines 293-775: Multiple button click handlers

**Estimated Complexity:** HIGH (extensive event handler usage)

---

### 2.2 Application/FormApplication Classes

These classes need **jQuery detection patterns** in `activateListeners()` and `_getNativeElement()` helper methods.

#### `scripts/window-characters.js`
**Impact:** Character selection window  
**Changes Needed:**
- Add `_getNativeElement()` helper method
- Add jQuery detection in `activateListeners(html)`
- Replace `$(html)` return in `_renderInner()`
- Replace `html.find()`, `html.closest()`, `.click()` patterns
- Replace `this.element.toggleClass()` with native classList

**Key Areas:**
- Line 109: `return $(html);` → return native DOM
- Lines 112-140: `activateListeners()` method
- Line 178: `this.element.toggleClass()`

**Estimated Complexity:** MEDIUM

---

#### `scripts/window-health.js`
**Impact:** Health window popout  
**Changes Needed:**
- Add `_getNativeElement()` helper method
- Add jQuery detection in `activateListeners(html)`
- Replace `$(html)` return
- Replace `html.find()` and `.closest()` patterns

**Key Areas:**
- Line 114: `return $(html);`
- Lines 117-125: `activateListeners()` method

**Estimated Complexity:** LOW

---

#### `scripts/window-macros.js`
**Impact:** Macros window popout  
**Changes Needed:**
- Add jQuery detection in `activateListeners(html)`
- Verify panel integration with native DOM

**Key Areas:**
- Lines 85-103: `activateListeners()` method

**Estimated Complexity:** LOW

---

#### `scripts/window-dicetray.js`
**Impact:** Dice tray window  
**Changes Needed:**
- Add jQuery detection in `activateListeners(html)`
- Verify panel integration

**Key Areas:**
- Lines 74-75: `activateListeners()` method

**Estimated Complexity:** LOW

---

#### `scripts/panel-codex.js` - `CodexForm` class
**Impact:** Codex entry form (FormApplication)  
**Changes Needed:**
- Add `_getNativeElement()` helper method
- Add jQuery detection in `activateListeners(html)`
- Replace ALL `html.find()` patterns (extensive usage)
- Replace `.on()`, `.off()` event handlers
- Replace `.val()`, `.attr()`, form manipulation
- Replace `.append()` with native DOM
- Convert `.each()` to `.forEach()`

**Key Areas:**
- Lines 190-309: `activateListeners()` method (FormApplication)
- Lines 722-785: Search functionality
- Lines 307-327: Drag and drop handlers

**Estimated Complexity:** VERY HIGH (most complex FormApplication, many jQuery patterns)

---

#### `scripts/window-quest.js` - `QuestForm` class
**Impact:** Quest form (FormApplication)  
**Changes Needed:**
- Add `_getNativeElement()` helper method
- Add jQuery detection in `activateListeners(html)`
- Replace jQuery patterns in form handling

**Key Areas:**
- Lines 256-257: `activateListeners()` method

**Estimated Complexity:** MEDIUM

---

## Phase 3: Core Panel Migration

**Priority: HIGH** - Core user-facing panels

### 3.1 High-Usage Panels

#### `scripts/panel-quest.js`
**Impact:** Quest management panel (most complex panel)  
**Changes Needed:**
- Replace **extensive** `html.find()` usage (100+ instances)
- Replace all `.each()` patterns (4 instances)
- Replace `.on()`, `.off()` event handlers (15+ instances)
- Replace `.show()`, `.hide()`, `.addClass()`, `.removeClass()` patterns
- Replace `.append()` with native DOM
- Convert drag/drop handlers to native DOM events
- Handle search functionality with native DOM
- Add jQuery detection in `_activateListeners(html)`

**Key Areas:**
- Lines 711-883: Search and filter functionality
- Lines 959-1062: Drag handlers
- Lines 1284-1300: Event handlers
- Lines 2180-2215: Drag and drop handlers
- Lines 2480+: Context menu handlers

**Estimated Complexity:** VERY HIGH (largest file, most jQuery usage)

---

#### `scripts/panel-favorites.js`
**Impact:** Favorites panel  
**Changes Needed:**
- Replace `html.find()` patterns (15+ instances)
- Replace `.each()` patterns (3 instances)
- Replace `.on()`, `.off()` event handlers (20+ instances)
- Replace `$(li)`, `$(item)`, `$(el)` patterns
- Replace `.append()` with native DOM
- Add jQuery detection in `_activateListeners(html)`

**Key Areas:**
- Lines 467-778: Event handlers and panel updates
- Lines 510-528: Handler cleanup

**Estimated Complexity:** HIGH

---

#### `scripts/panel-party.js`
**Impact:** Party management panel  
**Changes Needed:**
- Replace `html.find()` patterns (10+ instances)
- Replace `$(event.currentTarget)`, `$(event.target)` patterns
- Replace `.on()`, `.off()` drag handlers
- Replace `.append()` with native DOM
- Replace `.prop()`, `.addClass()` patterns
- Add jQuery detection in `activateListeners(html)`

**Key Areas:**
- Lines 120-613: Event handlers
- Lines 199-244: Drag and drop handlers
- Lines 793-1240: GM approval and transfer handlers

**Estimated Complexity:** HIGH

---

#### `scripts/panel-notes.js`
**Impact:** Journal notes panel  
**Changes Needed:**
- Replace `html.find()` patterns (20+ instances)
- Replace `.on()`, `.off()` event handlers (15+ instances)
- Replace `.val()`, `.html()` patterns
- Handle journal content manipulation with native DOM
- Add jQuery detection in `activateListeners(html, journal, page)`

**Key Areas:**
- Lines 204-422: Event handlers
- Lines 775-1357: Journal content manipulation

**Estimated Complexity:** HIGH

---

### 3.2 Standard Panels

#### `scripts/panel-weapons.js`
**Changes Needed:**
- Replace `html.find()` patterns
- Replace `.each()` patterns
- Replace `.on()`, `.off()` event handlers
- Replace `$(item)`, `$(event.currentTarget)` patterns
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** MEDIUM

---

#### `scripts/panel-inventory.js`
**Changes Needed:**
- Same patterns as `panel-weapons.js`
- Replace `.each()` patterns
- Replace event handlers
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** MEDIUM

---

#### `scripts/panel-spells.js`
**Changes Needed:**
- Replace `.each()` patterns
- Replace event handlers
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** MEDIUM

---

#### `scripts/panel-macros.js`
**Changes Needed:**
- Replace `$('#macros-panel-placeholder')` patterns
- Replace `$('<div>')` element creation
- Replace `.append()` patterns
- Replace `.each()` patterns
- Replace extensive drag/drop handlers
- Replace `$(document).off().on()` patterns
- Add jQuery detection in `_activateListeners(html)`

**Key Areas:**
- Lines 84-241: Panel creation and drag handlers
- Lines 178-230: Drag and drop event handlers

**Estimated Complexity:** HIGH

---

#### `scripts/panel-health.js`
**Changes Needed:**
- Replace `$('#health-panel-placeholder')` patterns
- Replace `$('<div>')` element creation
- Replace `.append()` patterns
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** MEDIUM

---

#### `scripts/panel-character.js`
**Changes Needed:**
- Replace `$(event.currentTarget)` patterns
- Replace `.val()` patterns
- Replace `.append()` with native DOM (death skull icon)
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-gm.js`
**Changes Needed:**
- Replace `panel.find()` patterns
- Replace `.off()`, `.on()` patterns
- Add jQuery detection in `_activateListeners(panel)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-codex.js` - CodexPanel class
**Changes Needed:**
- Replace `html.find()` patterns (search functionality)
- Replace `.each()` patterns
- Replace `.on()`, `.off()` event handlers
- Add jQuery detection in `_activateListeners(html)`

**Note:** Separate from CodexForm FormApplication class

**Estimated Complexity:** MEDIUM

---

#### `scripts/panel-features.js`
**Changes Needed:**
- Replace `.each()` patterns
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-abilities.js`
**Changes Needed:**
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-stats.js`
**Changes Needed:**
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-experience.js`
**Changes Needed:**
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-dicetray.js`
**Changes Needed:**
- Replace `.append()` patterns
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-control.js`
**Changes Needed:**
- Replace `.each()` patterns
- Replace `panel.find()` patterns
- Add jQuery detection in `_activateListeners(html)`

**Estimated Complexity:** LOW

---

#### `scripts/panel-party-stats.js`
**Changes Needed:**
- Replace jQuery detection for `this.element` (already has some detection)
- Verify native DOM usage

**Key Areas:**
- Line 101: jQuery detection pattern (may need update)

**Estimated Complexity:** LOW

---

## Phase 4: Utility & Helper Files

**Priority: MEDIUM** - Supporting functionality

### 4.1 Utility Files

#### `scripts/quest-pin.js`
**Impact:** Quest pin canvas functionality  
**Changes Needed:**
- Review PixiJS event handlers (`.on()`, `.off()` on PixiJS objects)
- **Note:** PixiJS `.on()/.off()` are different from jQuery - verify if changes needed
- Check if any DOM manipulation exists

**Estimated Complexity:** LOW (mostly PixiJS, not DOM)

---

#### `scripts/helpers.js`
**Changes Needed:**
- Review for any jQuery usage
- Update if needed

**Estimated Complexity:** LOW

---

#### `scripts/timer-utils.js`
**Changes Needed:**
- Review for any jQuery usage
- Update if needed

**Estimated Complexity:** LOW

---

#### `scripts/transfer-utils.js`
**Changes Needed:**
- Review for any jQuery usage
- Update if needed

**Estimated Complexity:** LOW

---

#### `scripts/utility-*.js` files
**Changes Needed:**
- Review each utility file for jQuery usage
- Update as needed

**Files:**
- `utility-codex-parser.js`
- `utility-print-character.js`
- `utility-quest-parser.js`

**Estimated Complexity:** LOW (likely minimal jQuery usage)

---

## Phase 5: Testing & Validation

### 5.1 Per-File Testing Checklist
After migrating each file, test:
- [ ] File loads without console errors
- [ ] Functionality works as expected
- [ ] No deprecation warnings
- [ ] Event handlers fire correctly
- [ ] DOM manipulation works correctly

### 5.2 Integration Testing
- [ ] Test all panels render correctly
- [ ] Test all windows open and close correctly
- [ ] Test drag and drop functionality
- [ ] Test search/filter functionality
- [ ] Test form submissions
- [ ] Test with popout windows
- [ ] Test with different user permissions (GM vs Player)

### 5.3 Edge Case Testing
- [ ] Test with empty data
- [ ] Test with large datasets
- [ ] Test error handling
- [ ] Test with other v13 modules
- [ ] Test module compatibility (Blacksmith, etc.)

---

## Phase 6: Common Patterns Reference

### Pattern 1: jQuery Detection Helper (FormApplication Classes)

Add to all FormApplication classes:

```javascript
/**
 * Get native DOM element from this.element (handles jQuery conversion)
 * @returns {HTMLElement|null} Native DOM element
 */
_getNativeElement() {
    if (!this.element) return null;
    // v13: Detect and convert jQuery to native DOM if needed
    if (this.element.jquery || typeof this.element.find === 'function') {
        return this.element[0] || this.element.get?.(0) || this.element;
    }
    return this.element;
}
```

### Pattern 2: activateListeners jQuery Detection

For all `activateListeners(html)` methods:

```javascript
activateListeners(html) {
    super.activateListeners(html);
    
    // v13: Detect and convert jQuery to native DOM if needed
    let nativeHtml = html;
    if (html && (html.jquery || typeof html.find === 'function')) {
        nativeHtml = html[0] || html.get?.(0) || html;
    }
    
    // Use nativeHtml for all DOM operations
    const button = nativeHtml.querySelector('.my-button');
    // ...
}
```

### Pattern 3: _renderInner Return Value

For Application classes that return `$(html)`:

```javascript
// BEFORE
async _renderInner(data) {
    const content = await renderTemplate(this.options.template, data);
    const html = `<div>${content}</div>`;
    return $(html);
}

// AFTER
async _renderInner(data) {
    const content = await renderTemplate(this.options.template, data);
    const html = document.createElement('div');
    html.innerHTML = content;
    return html;
}
```

### Pattern 4: Event Handler Replacement

```javascript
// BEFORE
html.find('.button').on('click', handler);
html.find('.button').off('click');

// AFTER
const buttons = nativeHtml.querySelectorAll('.button');
buttons.forEach(button => {
    button.addEventListener('click', handler);
});

// For cleanup, store references
this._handlers = this._handlers || [];
const handler = (event) => { /* ... */ };
this._handlers.push({ element: button, event: 'click', handler });
button.addEventListener('click', handler);

// Later, cleanup:
this._handlers.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
});
```

### Pattern 5: Element Creation

```javascript
// BEFORE
const $div = $('<div class="my-class">Content</div>');
container.append($div);

// AFTER
const div = document.createElement('div');
div.className = 'my-class';
div.textContent = 'Content';
container.appendChild(div);

// OR for HTML strings:
container.insertAdjacentHTML('beforeend', '<div class="my-class">Content</div>');
```

---

## Phase 7: Migration Order (Recommended)

### Week 1: Critical Path
1. ✅ Review migration plan
2. `scripts/squire.js` (cleanup code)
3. `scripts/manager-panel.js` (core manager)
4. `scripts/manager-handle.js` (handle functionality)

### Week 2: Application Classes
5. `scripts/window-characters.js`
6. `scripts/window-health.js`
7. `scripts/window-macros.js`
8. `scripts/window-dicetray.js`
9. `scripts/panel-codex.js` - CodexForm class
10. `scripts/window-quest.js` - QuestForm class

### Week 3: Core Panels (Part 1)
11. `scripts/panel-party.js`
12. `scripts/panel-notes.js`
13. `scripts/panel-favorites.js`

### Week 4: Core Panels (Part 2)
14. `scripts/panel-quest.js` (largest, most complex)
15. `scripts/panel-macros.js`
16. `scripts/panel-weapons.js`
17. `scripts/panel-inventory.js`

### Week 5: Remaining Panels
18. `scripts/panel-spells.js`
19. `scripts/panel-health.js`
20. `scripts/panel-codex.js` - CodexPanel class
21. `scripts/panel-character.js`
22. All remaining panels (low complexity)

### Week 6: Testing & Polish
23. Full integration testing
24. Bug fixes
25. Performance testing
26. Documentation updates

---

## Phase 8: Post-Migration

### 8.1 Documentation
- [ ] Update README with v13 requirements
- [ ] Update CHANGELOG with migration notes
- [ ] Document any breaking changes for users

### 8.2 Release Preparation
- [ ] Update module version to stable v13.0.0
- [ ] Create GitHub release
- [ ] Tag release
- [ ] Announce v13 support

---

## Migration Statistics

### Files Requiring Migration
- **Critical Path:** 3 files
- **Application Classes:** 6 files
- **Core Panels:** 8 files
- **Standard Panels:** 11 files
- **Utility Files:** ~8 files
- **Total:** ~36 files

### Code Patterns to Replace
- `html.find()`: ~204 instances
- `$()`: ~186 instances
- `.each()`: ~18 instances
- `.on()/.off()`: ~164 instances
- `.append()`: ~13 instances

---

## Notes & Considerations

### Blacksmith Integration
- This module uses Blacksmith HookManager
- Verify Blacksmith handles `html` parameters correctly in v13
- May need to coordinate with Blacksmith v13 migration

### Event Namespacing
- Many event handlers use namespaced events (e.g., `.on('click.squireFavorites')`)
- Native DOM events don't support namespacing
- Store handler references and namespace manually for cleanup

### Drag and Drop
- Extensive drag/drop functionality
- Verify native DOM drag events work correctly
- Test with multiple panels

### Popout Windows
- Some panels can be "popped out"
- Elements may render to different DOM locations
- Use multiple root search pattern when needed

---

## Risk Assessment

### High Risk Areas
1. **`panel-quest.js`** - Most complex, most jQuery usage
2. **`manager-panel.js`** - Core functionality
3. **`panel-codex.js` - CodexForm** - Complex FormApplication
4. Drag and drop handlers - May have edge cases

### Medium Risk Areas
1. Event handler cleanup - Easy to miss references
2. Multiple DOM roots (popout windows)
3. Blacksmith integration points

### Low Risk Areas
1. Simple panels with minimal jQuery
2. Utility files
3. PixiJS quest pins

---

## Success Criteria

Migration is complete when:
- ✅ All files load without errors in v13
- ✅ All panels render correctly
- ✅ All interactions work (clicks, drag/drop, forms)
- ✅ No deprecation warnings
- ✅ No jQuery dependencies remain
- ✅ Integration tests pass
- ✅ Performance is acceptable (no regressions)

---

**Last Updated:** 2025-01-XX  
**Status:** Planning Complete - Ready for Migration

