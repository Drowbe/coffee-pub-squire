# jQuery Detection Pattern Audit

## Purpose
This document tracks which jQuery detection patterns are necessary vs. transitional/technical debt.

## Key Principles

1. **Elements from `querySelector()` are ALWAYS native DOM** - No detection needed
2. **Elements from `querySelectorAll()` are ALWAYS native DOM** - No detection needed  
3. **Elements created with `document.createElement()` are ALWAYS native DOM** - No detection needed
4. **`this.element` in FormApplication classes MAY be jQuery** - Detection needed
5. **`html` parameter in `activateListeners(html)` from Application classes MAY be jQuery** - Detection needed
6. **Elements from `this.element.querySelector()` AFTER `_getNativeElement()` are guaranteed native** - No detection needed

## Necessary Detection Patterns

### FormApplication Classes
- **Location**: `_getNativeElement()` methods in FormApplication classes
- **Why**: `this.element` in FormApplication instances can be jQuery objects in v13
- **Files**: 
  - `scripts/window-quest.js` - `QuestForm._getNativeElement()`
  - `scripts/panel-codex.js` - `CodexForm._getNativeElement()`
- **Status**: ✅ KEEP - These are necessary

### Application activateListeners Methods
- **Location**: `activateListeners(html)` methods in Application/FormApplication classes
- **Why**: `html` parameter from FoundryVTT Application classes may be jQuery
- **Files**:
  - `scripts/panel-codex.js` - `CodexForm.activateListeners(html)`
  - `scripts/panel-quest.js` - `QuestPanel._activateListeners(html)`
  - `scripts/panel-party.js` - `PartyPanel.activateListeners(html)`
  - All other panel `_activateListeners(html)` methods
- **Status**: ✅ KEEP - These are necessary during migration

### Dialog Callbacks
- **Location**: Dialog callback functions
- **Why**: Dialog callbacks receive `html` parameter that may be jQuery
- **Files**:
  - `scripts/panel-party.js` - Transfer quantity dialog callback (line 660)
  - `scripts/panel-inventory.js` - Transfer quantity dialog callback
  - `scripts/panel-weapons.js` - Transfer quantity dialog callback
- **Status**: ✅ KEEP - These are necessary

## Unnecessary Detection Patterns (Technical Debt)

### Methods Receiving Already-Converted Elements
- **Location**: Helper methods that receive `nativeHtml` (already converted)
- **Why**: If the caller already converted jQuery to native DOM, no detection needed
- **Files**:
  - `scripts/panel-codex.js`:
    - `_setupFormInteractions(nativeHtml)` - receives already-converted `nativeHtml`
    - `_setupImageManagement(nativeHtml)` - receives already-converted `nativeHtml`
    - `_setupDragAndDrop(nativeHtml)` - receives already-converted `nativeHtml`
- **Status**: ⚠️ REMOVE - These methods can assume native DOM

### Elements from querySelector() Results
- **Location**: Variables assigned from `querySelector()` or `querySelectorAll()`
- **Why**: `querySelector()` always returns native DOM
- **Example**:
  ```javascript
  const codexContainer = this.element?.querySelector('[data-panel="panel-codex"]');
  // codexContainer is guaranteed native DOM - no detection needed
  ```
- **Files**:
  - `scripts/panel-codex.js` - `codexContainer` in `CodexPanel.render()`
  - Any variable assigned from `querySelector()` result
- **Status**: ⚠️ REMOVE - Detection is unnecessary

## Action Items

### Completed
- [x] Documented necessary vs. unnecessary patterns
- [x] Identified FormApplication patterns that must stay
- [x] Identified activateListeners patterns that must stay

### To Do
- [ ] Remove unnecessary detection in `CodexForm._setupFormInteractions()` - receives `nativeHtml`
- [ ] Remove unnecessary detection in `CodexForm._setupImageManagement()` - receives `nativeHtml`
- [ ] Remove unnecessary detection in `CodexForm._setupDragAndDrop()` - receives `nativeHtml`
- [ ] Review all files for similar patterns where elements come from `querySelector()`
- [ ] Add comments documenting why detection is kept in necessary cases

## Notes

- This audit is part of the v13 migration cleanup phase
- Goal is to remove technical debt while keeping necessary safety checks
- All removals should be tested to ensure no regressions

