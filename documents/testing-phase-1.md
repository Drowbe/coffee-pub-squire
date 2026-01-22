# Phase 1 Testing Guide

This document outlines how to test the Phase 1 refactoring (Journal Utilities and Base Parser).

## Pre-Testing Setup

1. **Load FoundryVTT** with the module enabled
2. **Open browser console** (F12) to check for errors
3. **Have test data ready**:
   - At least one Journal with pages
   - Codex journal with entries (if testing codex)
   - Quest journal with entries (if testing quests)

## Testing Checklist

### ✅ Phase 1.1: Journal Utilities

#### Test 1: Notes Panel - Journal Selection
1. Open Squire tray
2. Navigate to Notes panel
3. **As GM**: Click "Set Journal" button
4. **Expected**: Journal picker dialog opens (grid view)
5. Select a journal
6. **Expected**: 
   - Journal selected notification appears
   - If journal has pages, page picker opens
   - Notes panel refreshes and shows journal content

#### Test 2: Notes Panel - Page Selection
1. In Notes panel, use page dropdown
2. Select "Browse Pages" option
3. **Expected**: Page picker dialog opens (grid view)
4. Select a page
5. **Expected**: Page content displays in notes panel

#### Test 3: Codex Panel - Journal Selection
1. Navigate to Codex panel
2. Click "Set Journal" button
3. **Expected**: Journal picker dialog opens (dropdown/select view)
4. Select a journal from dropdown
5. Click "Save"
6. **Expected**: 
   - Codex panel refreshes
   - Codex entries load from selected journal

#### Test 4: Quest Panel - Journal Selection
1. Navigate to Quest panel
2. Click "Set Journal" button
3. **Expected**: Journal picker dialog opens (grid view)
4. Select a journal
5. **Expected**: 
   - Quest panel refreshes
   - Quests load from selected journal

#### Test 5: Notes Panel - Content Rendering
1. In Notes panel, select a journal with a text page
2. **Expected**: 
   - Page content renders correctly
   - Images display if present
   - Links are clickable
   - Text is properly formatted

#### Test 6: Permission Checking
1. **As Player**: Try to access Notes panel
2. **Expected**: Only pages you have permission to view are shown
3. **As GM**: Verify you can see all pages

### ✅ Phase 1.2: Base Parser

#### Test 7: Codex Panel - Entry Parsing
1. Navigate to Codex panel
2. Select a codex journal with entries
3. **Expected**: 
   - All codex entries load correctly
   - Images display correctly
   - Tags are extracted and displayed
   - Categories are extracted correctly
   - Descriptions, plot hooks, locations all parse correctly
   - Links (if any) work correctly

#### Test 8: Codex Panel - Legacy Methods
1. Check browser console for any errors
2. **Expected**: No errors related to `extractDescription`, `extractPlotHook`, etc.
3. Verify codex entries still display all fields correctly

## Quick Console Tests

You can also test directly in the browser console:

### Test Journal Utilities
```javascript
// Test userCanAccessPage
const page = game.journal.getName("Your Journal Name")?.pages.contents[0];
const canAccess = game.modules.get('coffee-pub-squire')?.api?.userCanAccessPage?.(page, game.user, {NONE: 0, OBSERVER: 2, OWNER: 3});
console.log('Can access page:', canAccess);

// Test showJournalPicker (will open dialog)
import { showJournalPicker } from './scripts/utility-journal.js';
showJournalPicker({
    title: 'Test Journal Picker',
    getCurrentId: () => 'none',
    onSelect: (id) => console.log('Selected:', id),
    reRender: () => console.log('Would refresh')
});
```

### Test Base Parser
```javascript
// Test extractImage
import { BaseParser } from './scripts/utility-base-parser.js';
const testHtml = '<p>Test</p><img src="test.jpg" /><p>More</p>';
const img = BaseParser.extractImage(testHtml);
console.log('Extracted image:', img); // Should be "test.jpg"

// Test extractFieldFromHTML
const fieldHtml = '<p><strong>Description:</strong> This is a test description</p>';
const desc = BaseParser.extractFieldFromHTML(fieldHtml, 'Description');
console.log('Extracted description:', desc); // Should be "This is a test description"

// Test extractTags
const tagsHtml = '<p><strong>Tags:</strong> npc, phlan, informant</p>';
const tags = BaseParser.extractTags(tagsHtml);
console.log('Extracted tags:', tags); // Should be ["npc", "phlan", "informant"]
```

## Common Issues to Watch For

1. **Journal picker doesn't open**: Check console for errors, verify utility is imported
2. **Page content doesn't render**: Check if `renderJournalContent` is being called correctly
3. **Codex entries missing fields**: Verify BaseParser methods are working, check HTML structure
4. **Permission errors**: Verify `userCanAccessPage` is working correctly
5. **Import errors**: Check that all files are loading (check Network tab in DevTools)

## Success Criteria

- ✅ All three panels (Notes, Codex, Quest) can select journals
- ✅ Notes panel can select pages
- ✅ Content renders correctly in all panels
- ✅ No console errors
- ✅ Permissions work correctly
- ✅ Codex entries parse all fields correctly
- ✅ Legacy codex methods still work (backward compatibility)

## If Something Breaks

1. **Check browser console** for error messages
2. **Check Network tab** - ensure all JS files are loading
3. **Verify imports** - make sure utility-journal.js and utility-base-parser.js are in module.json (they should be auto-loaded via imports)
4. **Rollback**: If needed, you can revert the changes using git

## Next Steps After Testing

Once Phase 1 is verified working:
- Proceed to Phase 2: Create NotesParser
- Or continue with other phases if Phase 1 is solid
