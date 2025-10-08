# Refactoring Plan for panel-party.js

## Deep Analysis Complete - Key Findings

### Critical Understanding:

1. **Both duplicated code paths ARE ACTIVE**:
   - `case 'Item':` (lines 311-598) - Handles drags from character sheets/inventory
   - `case 'Actor':` (lines 621-858) - Handles Actor-type drops
   
2. **Only Difference**: How source actor/item is extracted from the drop data
   - `case 'Item':` has complex UUID parsing logic (lines 323-348)
   - `case 'Actor':` has simpler extraction (lines 623-625)
   - After extraction, **both execute IDENTICAL logic** (210+ lines)

3. **Dead Code Found**:
   - `_sendTransferRequest()` method (lines 1018-1167) - **NEVER CALLED**
   - Duplicate `destroy()` method (lines 948-952) - First one is incomplete

4. **Debug Markers Present**: 
   - "LINE 537" and "LINE 819" in the GM notification messages (your debugging)

### Safety Concerns:

1. **High Risk Area**: The transfer logic is complex with multiple async operations
2. **Permission Handling**: Critical security logic that must remain intact
3. **Chat Message Routing**: Uses socketlib and different whisper targets
4. **Panel Refresh Logic**: Post-transfer refresh varies by case (line 868-869)

---

## Final Refactoring Plan (Conservative & Safe)

### Phase 1: Extract Simple Helpers (Low Risk)

#### **1.1: Health Status Calculation**
- **Method**: `_calculateHealthbarStatus(hp)`
- **Lines to Replace**: 41-55, 66-80 (logic only, keep forEach loops separate for clarity)
- **Risk Level**: ⭐ Very Low
- **Test**: Visual check of health bars in party panel
- **Status**: ✅ Complete

#### **1.2: Transfer Data Preparation**
- **Method**: `_createTransferData(transferId, sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity)`
- **Lines to Replace**: 428-443, 710-725
- **Risk Level**: ⭐ Very Low
- **Returns**: Object with all transfer data
- **Test**: Verify transfer request creates proper data structure
- **Status**: ✅ Complete

---

### Phase 2: Extract Messaging Helpers (Medium Risk)

#### **2.1: GM Notification**
- **Method**: `_sendGMTransferNotification(sourceActor, targetActor, sourceItem, selectedQuantity, transferId, transferData)`
- **Lines to Replace**: 531-553, 813-835
- **Risk Level**: ⭐⭐ Low-Medium
- **Test**: Verify GM receives notification when `transfersGMApproves` is enabled
- **Status**: ✅ Complete
- **Bonus**: Removed debug markers "LINE 537" and "LINE 819"

#### **2.2: Sender Chat Message**
- **Method**: `_sendTransferSenderMessage(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, transferId, transferData)`
- **Lines to Replace**: 444-473, 726-755
- **Risk Level**: ⭐⭐ Low-Medium
- **Test**: Verify sender receives confirmation whisper
- **Status**: ✅ Complete

#### **2.3: Receiver Chat Message**
- **Method**: `_sendTransferReceiverMessage(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity, transferId, transferData)`
- **Lines to Replace**: 474-530, 756-812
- **Risk Level**: ⭐⭐⭐ Medium (uses socketlib conditionally)
- **Test**: Verify receiver gets actionable message with Accept/Reject buttons
- **Status**: ⬜ Not Started

---

### Phase 3: Extract Dialog & Execution (Higher Risk)

#### **3.1: Quantity Dialog**
- **Method**: `_showTransferQuantityDialog(sourceItem, sourceActor, targetActor, maxQuantity, hasQuantity)`
- **Lines to Replace**: 365-422, 647-704
- **Risk Level**: ⭐⭐⭐ Medium
- **Returns**: Promise<number> (0 = cancelled)
- **Test**: Dialog appears, quantity validation works, cancel works
- **Status**: ⬜ Not Started

#### **3.2: Transfer Execution**
- **Method**: `_executeTransferWithPermissions(sourceActor, targetActor, sourceItem, selectedQuantity, hasQuantity)`
- **Lines to Replace**: 558-575, 840-857
- **Risk Level**: ⭐⭐⭐⭐ High (handles actual item transfer)
- **Test**: Items transfer correctly with proper permissions
- **Status**: ⬜ Not Started

---

### Phase 4: High-Level Orchestration (Highest Risk)

#### **4.1: Complete Transfer Workflow**
- **Method**: `async _handleActorItemTransfer(sourceActor, sourceItem, targetActor)`
- **Combines**: Dialog → Permission Check → Either (Request Messages) OR (Execute Transfer)
- **Lines to Replace**: 357-575, 639-857
- **Risk Level**: ⭐⭐⭐⭐⭐ Very High
- **Note**: This orchestrates all the helpers from Phases 1-3
- **Status**: ⬜ Not Started

**Method Structure**:
```javascript
async _handleActorItemTransfer(sourceActor, sourceItem, targetActor) {
    // 1. Check permissions
    const hasSourcePermission = sourceActor.isOwner;
    const hasTargetPermission = targetActor.isOwner;
    const hasQuantity = sourceItem.system.quantity != null;
    const maxQuantity = hasQuantity ? sourceItem.system.quantity : 1;
    
    // 2. Show dialog
    const selectedQuantity = await this._showTransferQuantityDialog(...);
    if (selectedQuantity <= 0) return;
    
    // 3. Branch: Request workflow vs Direct transfer
    if (!hasSourcePermission || !hasTargetPermission) {
        // Create transfer data
        const { transferId, transferData } = this._createTransferData(...);
        
        // Send messages
        await this._sendTransferSenderMessage(...);
        await this._sendTransferReceiverMessage(...);
        await this._sendGMTransferNotification(...);
        return;
    }
    
    // 4. Direct transfer
    await this._executeTransferWithPermissions(...);
}
```

---

### Phase 5: Refactor Switch Cases

#### **5.1: Extract Source Data Parsing**
- **Method**: `_extractSourceActorAndItem(data)`
- **Handles**: Different data formats from Item vs Actor drops
- **Returns**: `{ sourceActor, sourceItem }` or `null`
- **Lines to Extract**: 323-355 (Item case), 623-637 (Actor case)
- **Status**: ⬜ Not Started

#### **5.2: Simplify Switch Cases**
```javascript
case 'Item':
    if ((data.actorId && ...) || ...) {
        // Parse source (complex logic)
        const { sourceActor, sourceItem } = this._extractSourceActorAndItem(data);
        if (!sourceActor || !sourceItem) { /* fallback */ return; }
        
        await this._handleActorItemTransfer(sourceActor, sourceItem, targetActor);
        return;
    } else {
        // World item logic (keep as-is)
    }
    break;

case 'Actor':
    // Parse source (simple logic)
    const { sourceActor, sourceItem } = this._extractSourceActorAndItem(data);
    if (!sourceActor || !sourceItem) return;
    
    await this._handleActorItemTransfer(sourceActor, sourceItem, targetActor);
    break;
```
- **Status**: ⬜ Not Started

---

### Phase 6: Cleanup

#### **6.1: Remove Dead Code**
- **Delete**: `_sendTransferRequest()` method (lines 1018-1167)
- **Reason**: Never called, superseded by inline logic
- **Risk**: ⭐ None (dead code)
- **Status**: ⬜ Not Started

#### **6.2: Fix Duplicate destroy()**
- **Delete**: First `destroy()` at lines 948-952
- **Keep**: Second `destroy()` at lines 1474-1481 (more complete)
- **Risk**: ⭐ Very Low
- **Note**: Comment says hooks managed by HookManager but second one still removes them
- **Status**: ⬜ Not Started

#### **6.3: Remove Debug Markers**
- **Remove**: "LINE 537" and "LINE 819" text from GM notifications
- **Risk**: ⭐ None
- **Status**: ⬜ Not Started

---

## Implementation Order (Safest Path)

### **Step 1**: Health Status (Warm-up)
- **Status**: ✅ Complete & Tested
- Implement `_calculateHealthbarStatus()`
- Replace in render() method
- **Test**: Load module, check health bars display correctly
- **Result**: ✅ All tests passed - health bars display correctly

### **Step 2**: Transfer Data Creation
- **Status**: ✅ Complete & Tested
- Implement `_createTransferData()`
- Replace both occurrences
- **Test**: Initiate transfer, check console for transferData structure
- **Result**: ✅ Transfer requests work correctly, no console errors

### **Step 3**: GM Notification
- **Status**: ✅ Complete & Tested
- Implement `_sendGMTransferNotification()`
- Replace both occurrences  
- **Test**: Enable GM approval, do transfer, verify GM gets message
- **Result**: ✅ GM notifications work correctly, debug markers removed

### **Step 4**: Sender & Receiver Messages
- **Status**: ⬜ Not Started
- Implement `_sendTransferSenderMessage()` and `_sendTransferReceiverMessage()`
- Replace all four occurrences (2 each)
- **Test**: Do transfer between two players, verify both get correct messages

### **Step 5**: Dialog & Execution
- **Status**: ⬜ Not Started
- Implement `_showTransferQuantityDialog()` and `_executeTransferWithPermissions()`
- Replace inline in both cases
- **Test**: Full transfer workflow with quantity selection

### **Step 6**: High-Level Orchestration
- **Status**: ⬜ Not Started
- Implement `_handleActorItemTransfer()`
- Replace large blocks in both cases
- **Test**: Full suite - Item drops, Actor drops, permissions, quantity, etc.

### **Step 7**: Source Parsing
- **Status**: ⬜ Not Started
- Implement `_extractSourceActorAndItem()`
- Simplify case statements
- **Test**: Both drag types still work

### **Step 8**: Cleanup
- **Status**: ⬜ Not Started
- Remove `_sendTransferRequest()`
- Fix `destroy()` duplication
- Remove debug markers
- **Test**: Full regression test

---

## Testing Checklist (For Each Step)

### Required Test Scenarios:
- [ ] **Player → Player (both own characters)**: Direct transfer
- [ ] **Player → Player (target not owned)**: Request → Accept
- [ ] **Player → Player (target not owned)**: Request → Reject
- [ ] **GM approval enabled**: GM receives notification
- [ ] **Stackable items**: Quantity dialog with multiple items
- [ ] **Single item**: Quantity dialog with 1 item
- [ ] **World item drop**: GM drops from world items
- [ ] **Drag from character sheet**: Item case
- [ ] **Drag Actor item**: Actor case
- [ ] **Cancel transfer**: User cancels dialog

---

## Risk Mitigation

### **Backup Strategy**:
1. Create backup: `panel-party.js.backup` before starting
2. Test after EACH phase
3. If any test fails, revert that phase and debug before proceeding

### **Rollback Points**:
- After Phase 1: Minor helpers only
- After Phase 2: All messaging extracted
- After Phase 3: Dialog & execution extracted
- After Phase 6: Complete refactor

### **Critical Areas to Watch**:
1. **Socketlib calls**: Ensure GM execution still works
2. **Whisper targets**: Verify correct users receive messages
3. **Permission checks**: Security critical - must remain intact
4. **Panel refresh**: Line 868-869 has special case for Actor drops

---

## Expected Outcome

### **Before**: 1483 lines
### **After**: ~1150 lines (estimate)

### **Reduction**: ~333 lines (-22%)

### **New Helper Methods**: 8-10 private methods

### **Benefits**:
- ✅ No duplicate code
- ✅ Single source of truth for transfer logic
- ✅ Easier to maintain and debug
- ✅ Bug fixes apply to both Item and Actor cases automatically
- ✅ More testable code structure
- ✅ Clearer intent with named methods

---

## Notes & Warnings

1. **DO NOT** change permission logic
2. **DO NOT** change socketlib flow
3. **DO NOT** change whisper target calculation
4. **PRESERVE** all error handling
5. **PRESERVE** the special refresh logic at line 868-869
6. **TEST** after each phase - no exceptions

**This is a structural refactor only - zero behavioral changes intended.**

---

## Progress Tracking

### Overall Progress: 35% Complete

- [x] Phase 1 Complete (2/2 tasks done)
- [ ] Phase 2 Complete (2/3 tasks done)
- [ ] Phase 3 Complete
- [ ] Phase 4 Complete
- [ ] Phase 5 Complete
- [ ] Phase 6 Complete

### Notes & Issues:
- ✅ Phase 1.1 (Health Status) - Completed and tested successfully. Health bars displaying correctly with proper color coding.
- ✅ Phase 1.2 (Transfer Data) - Completed and tested successfully. Transfer requests work correctly.
- ✅ Phase 2.1 (GM Notification) - Completed and tested successfully. Also removed debug markers "LINE 537" and "LINE 819".
- ✅ Phase 2.2 (Sender Message) - Completed successfully. Sender confirmation messages extracted to helper.
- Lines reduced so far: 170 lines saved (38 from Phase 1.1, 30 from Phase 1.2, 44 from Phase 2.1, 58 from Phase 2.2)

