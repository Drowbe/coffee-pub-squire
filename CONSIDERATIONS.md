# Coffee Pub Squire - Development Considerations

## Panel Manager Initialization Pattern

### Root Cause Analysis
- The `panelManager` was being initialized in panel constructors before it was available in the game system
- This is a common timing issue in FoundryVTT where system managers need time to fully initialize
- Moving initialization to render time aligns with Foundry's lifecycle management
- The Favorites panel worked because it followed this pattern already

### Solution Implementation
- Moved `panelManager` initialization from constructor to render time in:
  - Spells Panel
  - Features Panel
  - Weapons Panel
  - Inventory Panel
- Added consistent debug logging across all panels
- Maintained all existing functionality without modifying unrelated code
- Preserved event handling and UI behavior

### Best Practices Identified
1. **Initialization Timing**
   - Always initialize managers and system references at render time
   - Use constructor only for basic property setup
   - Verify system availability before accessing

2. **Debug Logging**
   - Added timestamps to track initialization sequence
   - Logged existence of critical components
   - Maintained consistent logging format across panels

3. **Code Maintenance**
   - Focused changes only on affected functionality
   - Preserved existing code structure
   - Maintained consistent patterns across panels

### Future Development Guidelines
1. **New Panel Development**
   - Initialize system managers in render method
   - Add comprehensive debug logging
   - Follow established event handling patterns

2. **Foundry VTT Compatibility**
   - Pattern aligns with both V12 and V13 lifecycle management
   - Supports future Application V2 API integration
   - Maintains compatibility with D&D5E system updates

3. **Module Integration**
   - Consistent with Coffee Pub architecture
   - Supports integration with Coffee Pub Blacksmith
   - Maintains clean separation of concerns

### Lessons Learned
1. **Timing is Critical**
   - System initialization order matters
   - Defensive coding prevents race conditions
   - Proper lifecycle management ensures stability

2. **Debug First**
   - Comprehensive logging aids troubleshooting
   - Consistent logging patterns help identify issues
   - Timestamps help track initialization sequence

3. **Minimal Changes**
   - Focus on specific issues
   - Don't modify unrelated code
   - Maintain existing patterns when possible

## Future Considerations

### Documentation
- Document initialization patterns for future Coffee Pub modules
- Maintain clear logging standards
- Update API documentation to reflect best practices

### Testing
- Add initialization order tests
- Verify panel behavior across different load conditions
- Test integration with other Coffee Pub modules

### Performance
- Monitor initialization timing
- Track event handling efficiency
- Maintain responsive UI during loading

## AI Development Guidelines

### Code Modification Rules
1. **Change Control**
   - Never modify code unrelated to the current issue
   - Don't optimize or clean up code without explicit request
   - Preserve existing whitespace and formatting
   - Always discuss changes before implementation

2. **Module Architecture**
   - Coffee Pub Squire is part of the larger Coffee Pub ecosystem
   - Relies on Coffee Pub Blacksmith for module registration and communication
   - Uses FoundryVTT's Application V2 API patterns
   - Designed for D&D5E system version 4.0+

3. **Development Standards**
   - Use `postConsoleAndNotification` from global.js instead of direct console logging
   - Prefix console errors/warnings with "SQUIRE | "
   - Follow Foundry V12 API with V13 readiness in mind
   - Maintain compatibility with socketlib and libwrapper

4. **Debugging Approach**
   - Start with logging and observation
   - Focus on specific components or panels
   - Verify timing and initialization sequence
   - Test changes in isolation before integration

5. **Communication Guidelines**
   - Ask clarifying questions before making changes
   - Present a clear plan for review
   - Document any assumptions made
   - Highlight potential impacts on other modules

6. **Resource References**
   - FoundryVTT V12 API: https://foundryvtt.com/api/v12/
   - FoundryVTT V13 API: https://foundryvtt.com/api/v13/
   - Application V2 API: https://foundryvtt.wiki/en/development/api/applicationv2
   - D&D5E System: https://github.com/foundryvtt/dnd5e/wiki
   - Socketlib: https://github.com/manuelVo/foundryvtt-socketlib
   - Libwrapper: https://github.com/ruipin/fvtt-lib-wrapper

7. **Testing Considerations**
   - Verify changes across different Foundry versions
   - Test with various D&D5E character configurations
   - Check integration with other Coffee Pub modules
   - Ensure backward compatibility

This document should be updated as new patterns and considerations are identified during development. 