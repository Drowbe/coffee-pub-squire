# Hook Manager Audit Report
**Date:** 2025-10-21  
**Comparing:** `_backups/manager-hooks.js` vs `scripts/squire.js`

## Executive Summary

The backup HookManager had **33 registered hooks**, but the current implementation only has **32 hooks**.  
Several critical hooks are **MISSING** from the active code, causing synchronization issues throughout the module.

---

## CRITICAL MISSING HOOKS

### 1. ❌ **`globalUpdateActor` Hook** (BACKUP: lines 828-877)
**Status:** COMPLETELY MISSING  
**Impact:** CRITICAL - Multiple system failures

**What it did:**
- Handled HP changes → Updated handle health bars
- Handled effects changes → Updated handle conditions  
- Handled major attribute changes (name, img, prof, level, AC, movement) → Full re-initialization
- Handled spell slot changes → Re-rendered spells panel

**Current Result:**
- ✅ Panel-specific `updateActor` hooks exist (character, party, party-stats)
- ❌ No GLOBAL hook to handle tray-wide updates
- ❌ Health bars don't update when HP changes externally
- ❌ Handle doesn't refresh on major actor changes
- ❌ Spell panel doesn't update when spell slots change

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2048: `"Note: updateActor hook is now managed centrally by HookManager"`
- **REALITY:** Only panel-specific routing hooks exist, not the global one

---

### 2. ❌ **`globalDeleteToken` Hook** (BACKUP: lines 767-826)
**Status:** COMPLETELY MISSING  
**Impact:** HIGH - Token management broken

**What it did:**
- When currently displayed token is deleted, finds next available token
- Updates all panel actor references
- Maintains tray state during actor switchover
- Properly cleans up when no tokens remain

**Current Result:**
- ❌ Tray might not update when active token is deleted
- ❌ No automatic fallback to next available actor
- ❌ Potential orphaned references

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2046: `"Note: deleteToken hook is now managed centrally by HookManager"`
- **REALITY:** Hook doesn't exist in current code

---

### 3. ❌ **`globalPauseGame` Hook** (BACKUP: lines 879-890)
**Status:** COMPLETELY MISSING  
**Impact:** MEDIUM - UX inconsistency

**What it did:**
- Re-rendered all panels when game is unpaused
- Ensured fresh data after pause periods

**Current Result:**
- ❌ Panels may show stale data after unpause

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2050: `"Note: pauseGame hook is now managed centrally by HookManager"`
- **REALITY:** Hook doesn't exist

---

### 4. ❌ **`globalCanvasReady` Hook** (BACKUP: lines 1070-1098)
**Status:** COMPLETELY MISSING  
**Impact:** MEDIUM - Multi-select handling incomplete

**What it did:**
- Monkey-patched `canvas.selectObjects` to trigger health panel updates
- Handled bulk selection operations
- Updated health panel for canvas-level selections

**Current Result:**
- ❌ Health panel may not update for certain selection methods
- ❌ Bulk canvas selections might not trigger proper updates

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2075: `"Note: canvasReady hook is now managed centrally by HookManager"`
- **REALITY:** A different `canvasReady` hook exists (line 64) but doesn't include selection handling

---

### 5. ❌ **`globalCreateToken` Hook** (BACKUP: lines 1100-1119)
**Status:** COMPLETELY MISSING  
**Impact:** LOW-MEDIUM - New token handling

**What it did:**
- Updated handle when owned tokens were created on canvas

**Current Result:**
- ❌ Handle might not update immediately when new tokens appear

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2078: `"Note: createToken hook is now managed centrally by HookManager"`
- **REALITY:** Quest pin version exists (line 604) but not global version

---

### 6. ❌ **`globalCloseGame` Hook** (BACKUP: lines 1025-1036)
**Status:** COMPLETELY MISSING  
**Impact:** LOW - Cleanup incomplete

**What it did:**
- Properly cleaned up PanelManager on game close

**Current Result:**
- ⚠️ May have cleanup issues when closing game

**Comments claiming it exists:**
- `scripts/manager-panel.js` line 2071: `"Note: closeGame hook is now managed centrally by HookManager"`
- **REALITY:** Hook exists but at different location (line 120 in squire.js)
- **STATUS:** Actually EXISTS but registered differently

---

## HOOKS THAT EXIST (Comparison)

### ✅ Properly Migrated Hooks

| Hook Name | Backup Location | Current Location | Status |
|-----------|----------------|------------------|---------|
| `updateJournalEntryPage` | 526 | 131 | ✅ EXISTS |
| `updateActor` (character) | 537 | 149 | ✅ EXISTS |
| `updateToken` (character) | 550 | 163 | ✅ EXISTS |
| `updateToken` (party) | 564 | 178 | ✅ EXISTS |
| `updateActor` (party) | 577 | 192 | ✅ EXISTS |
| `controlToken` (party) | 590 | 206 | ✅ EXISTS |
| `renderChatMessage` (party) | 603 | 220 | ✅ EXISTS |
| `ready` (macros) | 620 | 235 | ✅ EXISTS |
| `renderSettingsConfig` (macros) | 633 | 249 | ✅ EXISTS |
| `updateCombat` (party stats) | 647 | 264 | ✅ EXISTS |
| `updateActor` (party stats) | 660 | 278 | ✅ EXISTS |
| `createChatMessage` (party stats) | 673 | 292 | ✅ EXISTS |
| `controlToken` (global) | 718 | 307 | ✅ EXISTS |
| `createActiveEffect` | 892 | 386 | ✅ JUST ADDED |
| `deleteActiveEffect` | 913 | 407 | ✅ JUST ADDED |
| `createItem` | 934 | 324 | ✅ EXISTS |
| `updateItem` | 957 | 346 | ✅ EXISTS |
| `deleteItem` | 1002 | 367 | ✅ EXISTS |
| `disableModule` | 1038 | 98 | ✅ EXISTS |
| `dropCanvasData` (quest pins) | 1131 | 429 | ✅ EXISTS |
| `canvasSceneChange` (quest pins) | 1259 | 552 | ✅ EXISTS |
| `updateScene` (quest pins) | 1274 | 565 | ✅ EXISTS |
| `updateToken` (quest pins) | 1289 | 580 | ✅ EXISTS |
| `createToken` (quest pins) | 1301 | 604 | ✅ EXISTS |
| `deleteToken` (quest pins) | 1311 | 615 | ✅ EXISTS |
| `renderQuestPanel` (quest pins) | 1321 | 626 | ✅ EXISTS |
| `sightRefresh` (quest pins) | 1331 | 648 | ✅ EXISTS |

---

## IMPLEMENTATION DIFFERENCES

### `globalControlToken` Hook - SIMPLIFIED (DEGRADED)

**BACKUP (lines 718-765):**
- Complex multi-selection tracking with timing logic
- Debouncing for multi-select operations
- Separate handling for single vs multi-select
- Called `_updateSelectionDisplay()` and `_updateHealthPanelFromSelection()`

**CURRENT (lines 307-322):**
```javascript
callback: async (token, controlled) => {
    if (!game.user.isGM && !token.actor?.isOwner) return;
    const panelManager = getPanelManager();
    if (panelManager?.instance) {
        await panelManager.instance.renderPanels(panelManager.instance.element);
    }
}
```

**RESULT:** 
- ❌ Lost multi-selection debouncing
- ❌ Lost selection tracking
- ❌ Lost health panel-specific updates
- ❌ Lost selection display management
- ⚠️ Over-renders - calls `renderPanels()` for every token control event

---

### `globalUpdateItem` Hook - AUTO-FAVORITING REMOVED

**BACKUP (lines 976-994):**
- Had complex auto-favoriting logic for NPCs
- Automatically favorited equipped weapons
- Automatically favorited prepared spells
- Checked for compendium actors to avoid errors

**CURRENT (lines 351-364):**
```javascript
callback: async (item, changes) => {
    if (!item.parent) return;
    const panelManager = getPanelManager();
    if (panelManager?.currentActor?.id !== item.parent?.id) return;
    if (panelManager?.instance) {
        await panelManager.instance.updateHandle();
    }
}
```

**RESULT:**
- ❌ Lost auto-favoriting for NPCs/monsters
- ❌ Lost equipped weapon auto-add
- ❌ Lost prepared spell auto-add
- ✅ Simpler, more predictable behavior

---

## FALSE CLAIMS - "Managed Centrally" Comments

The following comments claim hooks are managed, but they're actually MISSING:

| File | Line | Comment | Reality |
|------|------|---------|---------|
| `manager-panel.js` | 2046 | deleteToken managed centrally | ❌ MISSING |
| `manager-panel.js` | 2048 | updateActor managed centrally | ❌ MISSING (global) |
| `manager-panel.js` | 2050 | pauseGame managed centrally | ❌ MISSING |
| `manager-panel.js` | 2052 | createActiveEffect managed centrally | ✅ NOW EXISTS |
| `manager-panel.js` | 2054 | deleteActiveEffect managed centrally | ✅ NOW EXISTS |
| `manager-panel.js` | 2056 | createItem managed centrally | ✅ EXISTS |
| `manager-panel.js` | 2058 | updateItem managed centrally | ✅ EXISTS |
| `manager-panel.js` | 2060 | deleteItem managed centrally | ✅ EXISTS |
| `manager-panel.js` | 2071 | closeGame managed centrally | ✅ EXISTS |
| `manager-panel.js` | 2075 | canvasReady managed centrally | ⚠️ PARTIAL |
| `manager-panel.js` | 2078 | createToken managed centrally | ❌ MISSING (global) |

---

## SUMMARY OF ISSUES

### Count:
- **Total hooks in backup:** 33
- **Total hooks in current:** 32
- **Missing critical hooks:** 5-6
- **Degraded implementations:** 2
- **False documentation claims:** 5

### Primary Problems Caused:

1. **Health System Broken:**
   - Missing `globalUpdateActor` → HP changes don't update UI
   - Missing selection handling in `globalCanvasReady` → Bulk selections broken

2. **Token Management Broken:**
   - Missing `globalDeleteToken` → No fallback when active token deleted

3. **Item/Effect Updates Incomplete:**
   - Missing auto-favoriting → NPCs don't auto-add equipment
   - Lost prepared spell detection

4. **Performance Issues:**
   - Simplified `globalControlToken` → Over-renders on every control event
   - Lost debouncing → Multiple rapid updates

5. **General Sync Issues:**
   - Missing `globalPauseGame` → Stale data after unpause
   - Missing `globalCreateToken` → New tokens don't trigger updates

---

## RECOMMENDED ACTIONS

### Immediate (Critical):
1. ✅ **DONE:** Add `createActiveEffect` and `deleteActiveEffect` hooks
2. **TODO:** Add `globalUpdateActor` hook (HP, effects, major changes)
3. **TODO:** Add `globalDeleteToken` hook (token deletion handling)

### High Priority:
4. **TODO:** Restore full `globalControlToken` implementation (multi-select, debouncing)
5. **TODO:** Add `globalPauseGame` hook
6. **TODO:** Add `globalCanvasReady` hook with selection handling
7. **TODO:** Add `globalCreateToken` hook

### Medium Priority:
8. **DECIDE:** Restore auto-favoriting in `globalUpdateItem` hook (or keep simple)
9. **TODO:** Update or remove misleading "managed centrally" comments

### Documentation:
10. **TODO:** Create migration guide documenting hook changes
11. **TODO:** Update architecture docs to reflect current hook structure

---

## NOTES

- The backup file represents a more mature, battle-tested implementation
- Current implementation appears to be a partial migration that wasn't completed
- Many synchronization issues likely stem from these missing hooks
- The "managed centrally" comments suggest intention but incomplete execution

