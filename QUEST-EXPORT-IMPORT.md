# Quest Export/Import System with Scene Pins

## Overview

The enhanced quest export/import system now includes **scene pin data**, allowing you to transfer both quest content and pin placements between different Foundry VTT worlds or installations.

## Features

### ✅ **What's Included**
- **Quest Content**: All quest data, tasks, rewards, participants, etc.
- **Scene Pins**: Quest pin positions on all scenes
- **Pin States**: Objective completion status, quest visibility, etc.
- **Smart Merging**: Prevents duplicates and preserves progress

### ✅ **What's Preserved**
- Quest progress (completed objectives, failed objectives)
- Quest status (Not Started, In Progress, Complete, Failed)
- Pin positions on scenes
- Quest associations and objective mappings
- Participant information

## Export Process

### 1. **Access Export**
- Open the Quest Panel
- Click the **Export** button (📤 icon)
- System automatically collects:
  - All quests from all categories
  - All scene pin data
  - Export metadata and version info

### 2. **Export Format**
The export creates a JSON file with this structure:

```json
{
  "quests": [...],           // Array of quest objects
  "scenePins": {             // Scene pin data
    "sceneId1": {
      "sceneName": "Scene Name",
      "sceneId": "sceneId1",
      "questPins": [...]
    }
  },
  "exportVersion": "1.1",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "totalQuests": 15,
    "totalScenesWithPins": 3,
    "totalPins": 25
  }
}
```

### 3. **Download & Save**
- Copy the JSON text or use the download button
- Save the file for transfer to another world

## Import Process

### 1. **Access Import**
- Open the Quest Panel in the target world
- Click the **Import** button (📥 icon)
- Paste the JSON data

### 2. **Smart Import Logic**
The system automatically:

- **Detects Format**: Legacy (quests only) or Enhanced (quests + pins)
- **Updates Existing**: Matches quests by name and updates them
- **Creates New**: Adds new quests that don't exist
- **Merges Pins**: Intelligently combines scene pin data
- **Preserves Progress**: Maintains existing quest states and completion

### 3. **Import Results**
- Quests are imported/updated
- Scene pins are placed on matching scenes
- Progress is preserved (no reset)
- Duplicates are prevented

## Use Cases

### **World Transfer**
1. Export from source world
2. Import to target world
3. All quests and pins appear exactly as they were

### **Backup & Restore**
1. Export current state
2. Save as backup
3. Import later to restore progress

### **Multi-GM Collaboration**
1. GM A exports their world state
2. GM B imports and continues
3. Progress is maintained across GMs

### **Compendium Workaround**
Since scene flags don't transfer with compendiums, use this system to:
1. Export quests and pins before adding to compendium
2. Import the data after placing the scene from compendium
3. All pin placements are restored

## Compatibility

### **Backward Compatible**
- **Legacy exports** (quests only) still work
- **Enhanced exports** work in both old and new systems
- **No breaking changes** to existing functionality

### **Version Support**
- **Foundry V12**: ✅ Fully supported
- **Foundry V13**: ✅ Expected to work (scene flags are stable)
- **Foundry V14**: ✅ Expected to work

## Troubleshooting

### **Common Issues**

#### **Pins Not Appearing After Import**
- Check if scenes exist with matching names
- Verify the import completed successfully
- Try refreshing the canvas or changing scenes

#### **Duplicate Pins**
- The system should prevent this automatically
- If duplicates occur, clear all pins and re-import

#### **Quest Progress Reset**
- This should not happen with the smart merge
- Check that you're importing to the correct world
- Verify the import data contains the expected quests

### **Debug Information**
- Check the browser console for detailed logs
- Look for notifications about import/export results
- Verify scene pin data in scene flags

## Technical Details

### **Data Storage**
- **Quests**: Stored in journal entries (standard Foundry)
- **Scene Pins**: Stored in scene flags under `coffee-pub-squire.questPins`
- **Export Format**: JSON with versioning and metadata

### **Smart Merging Logic**
- Pins are matched by `questUuid + objectiveIndex`
- Existing pins preserve their state and progress
- New pins are added with generated IDs
- Invalid pin data is filtered out

### **Performance Considerations**
- Export: Processes all scenes and pins
- Import: Updates only changed data
- Canvas refresh: Automatic after import completion

## Best Practices

### **Before Export**
- Ensure all quests are in the desired state
- Verify pin placements are correct
- Test the export with a small dataset first

### **Before Import**
- Backup the target world
- Ensure scenes exist with matching names
- Close any open quest forms or dialogs

### **After Import**
- Verify quests appear correctly
- Check that pins are placed on scenes
- Test quest functionality and pin interactions
- Refresh the canvas if pins don't appear immediately

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify the import/export data format
3. Ensure all required modules are active
4. Check Foundry VTT version compatibility
