# How the New Notes System Works

This document explains how the new Notes system will work and how it differs from the current implementation.

## Current System (What You Hate)

### Current Experience:
1. **Manual Journal Selection**: GM must manually select a journal in settings
2. **Page-by-Page Navigation**: You view one page at a time, must use dropdown to switch pages
3. **No Quick Capture**: To create a note, you must:
   - Open the journal sheet
   - Create a new page
   - Edit it in the full journal editor
   - Close the sheet
4. **No Organization**: All notes are just pages in a journal - no filtering, no tags, no search
5. **No Spatial Context**: Notes aren't tied to scenes or canvas locations
6. **No Privacy Control**: All pages in the journal are visible to everyone with access
7. **Heavy UI**: Uses full Foundry journal editor for everything

### Problems:
- **Slow**: Too many clicks to create/view notes
- **Unorganized**: Hard to find specific notes
- **No Context**: Can't see which scene a note relates to
- **No Privacy**: Can't have private notes vs shared notes
- **Clunky**: Full journal editor is overkill for quick notes

---

## New System (What We're Building)

### New Experience:

#### 1. **Quick Note Creation** (Like Slack/Notion)
- Click "New Note" button → lightweight form opens instantly
- Type markdown text, paste images, add tags
- Toggle Private/Party visibility
- Click Save → done in seconds
- **OR** drag image/text to canvas → note form opens with location pre-filled

#### 2. **Card-Based Display** (Like Pinterest/Notion)
- Notes display as **cards** (not a single page viewer)
- Each card shows:
  - Title
  - Image (if present)
  - Content preview
  - Tags
  - Author & timestamp
  - Scene name (if pinned)
- Cards are **grouped by scene** or date

#### 3. **Powerful Filtering** (Like Codex)
- **Search bar**: Live search across all note content
- **Tag cloud**: Click tags to filter (multi-select)
- **Scene filter**: Show only notes from specific scenes
- **Visibility filter**: Show all/private/party notes
- Filters work together (AND logic)

#### 4. **Spatial Pinning** (Optional)
- Notes can be pinned to canvas locations
- Shows as sticky note icon on canvas
- Click pin → opens note in panel
- Drag pin → updates note location
- Notes persist across scene changes

#### 5. **Privacy Control**
- **Private notes**: Only you (and GM) can see
- **Party notes**: All players can see
- Set when creating note (simple toggle)
- Enforced via Foundry permissions (not just UI hiding)

#### 6. **Fast & Lightweight**
- Form is Application V2 (not heavy FormApplication)
- Minimal UI - just what you need
- No full journal editor unless you want it
- Quick save, quick view

---

## Key Differences

| Feature | Current System | New System |
|---------|---------------|------------|
| **Note Creation** | Open journal → New page → Full editor | Click button → Light form → Save |
| **Display** | Single page viewer with dropdown | Card grid with filtering |
| **Organization** | None (just pages) | Tags, search, scene grouping |
| **Privacy** | All or nothing (journal-level) | Per-note (private/party) |
| **Spatial Context** | None | Optional canvas pins |
| **Speed** | Slow (many clicks) | Fast (few clicks) |
| **UI Weight** | Heavy (full journal editor) | Light (minimal form) |
| **Finding Notes** | Scroll through pages | Search, filter, tag cloud |

---

## User Workflows

### Creating a Quick Note (New System)
```
1. Click "New Note" button
2. Type: "Met NPC named Zephyr in Phlan"
3. Add tags: "npc, phlan, informant"
4. Toggle to "Party" (share with everyone)
5. Click Save
→ Done in 10 seconds
```

### Creating a Note from Canvas (New System)
```
1. Right-click on canvas → "Create Note"
   OR drag image to canvas
2. Form opens with scene/location pre-filled
3. Type note, add tags
4. Click Save
→ Note is pinned to that location
```

### Finding a Note (New System)
```
1. Open Notes panel
2. See all notes as cards
3. Type "Zephyr" in search → filters instantly
   OR click "npc" tag → shows all NPC notes
   OR select scene → shows all notes from that scene
4. Click card → view full note
```

### Current System (For Comparison)
```
1. Open Notes panel
2. Use dropdown to find page (if you remember which one)
3. Scroll through pages manually
4. Hope you find it
→ Slow and frustrating
```

---

## Technical Improvements

### 1. **Metadata in Flags** (Not HTML)
- Tags, scene, location, visibility stored in flags
- No fragile HTML parsing
- Single source of truth
- Easy to query and filter

### 2. **Parser Only for Content**
- Parser extracts content/images from HTML
- Metadata comes from flags (no parsing needed)
- Simpler, more reliable

### 3. **Ownership-Based Privacy**
- Private notes: author = Owner, others = None
- Party notes: author = Owner, others = Observer
- Enforced by Foundry, not just UI hiding

### 4. **Blacksmith Pin Integration**
- Uses Blacksmith Pin API for canvas pins
- No custom pin code needed
- Handles persistence, dragging, clicking

---

## What Stays the Same

- Still uses Journals as storage (familiar to GMs)
- Still uses Foundry's permission system
- Still works with journal sheets (can edit there if you want)
- Still supports images and rich text

---

## What Gets Better

✅ **Speed**: 10 seconds to create vs 2 minutes  
✅ **Organization**: Tags, search, filtering vs manual scrolling  
✅ **Privacy**: Per-note control vs all-or-nothing  
✅ **Context**: Scene grouping vs no context  
✅ **Spatial**: Canvas pins vs no spatial awareness  
✅ **UX**: Lightweight form vs heavy editor  

---

## Example: Typical Session

### Current System:
- Player wants to note something → opens journal → creates page → types → saves → closes
- Later, player wants to find note → scrolls through pages → gives up
- GM wants to see what players noted → opens journal → scrolls through pages

### New System:
- Player wants to note something → clicks "New Note" → types → saves (10 seconds)
- Later, player wants to find note → types in search → finds it instantly
- GM wants to see what players noted → opens panel → sees all notes as cards → filters by scene/tags

---

## Summary

The new Notes system transforms Notes from a **journal viewer** into a **player memory system**:
- **Fast capture** for quick notes during play
- **Smart organization** with tags, search, and filtering
- **Spatial context** with optional canvas pins
- **Privacy control** with per-note visibility
- **Lightweight UI** that doesn't get in the way

It's designed for **players to quickly capture and retrieve memories** during gameplay, not for GMs to write lore (that's what Journals and Codex are for).
