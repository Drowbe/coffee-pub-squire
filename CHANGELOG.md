# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [12.0.22] - Quest Import/Export Fix & Major Code Refactoring

### Fixed
- **Quest Import/Export Field Mapping**: Fixed critical mismatch between export and import field names that prevented rich quest data from being properly restored
  - **Field Name Alignment**: Import now correctly maps `gmnotes` → `gmHint` and `tasktreasure` → `treasureUnlocks`
  - **Treasure Format Conversion**: Import converts export format `[[treasure]]` to expected format `((treasure))`
  - **Progress Preservation**: Existing quest completion status, task states, visibility settings, and scene pin positions are fully preserved during import
  - **Backward Compatibility**: Import works with both old and new export formats
  - **Files Modified**: `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods

### Technical Improvements
- **Smart Field Mapping**: Import logic now checks for both field name formats to ensure compatibility
- **Rich Data Restoration**: GM notes and task treasure are now properly restored during import operations
- **State Preservation**: Enhanced import system maintains all existing quest progress and player states
- **Format Consistency**: Treasure format is automatically converted to match QuestParser expectations

### Added
- **New HandleManager Class**: Created dedicated `scripts/manager-handle.js` to centralize all handle-related functionality
- **Separation of Concerns**: Cleanly separated handle UI logic from overall tray management
- **Enhanced Event Handling**: Implemented `.off().on()` pattern to prevent duplicate event listeners on re-renders
- **Handle Fade Logic**: Added automatic handle overflow detection with fade effect and resize listener management

### Changed
- **Panel Manager Refactoring**: Moved all handle-related methods and event handlers from `PanelManager` to `HandleManager`
- **Event Handler Consolidation**: Centralized all handle click events, condition management, health interactions, and quest handling
- **Template Improvements**: Fixed typo in `handle-conditions.hbs` ("Condtitions" → "Conditions")
- **Party View Enhancement**: Updated `handle-party.hbs` to properly pass member context to health partials
- **Quest Data Loading**: Enhanced quest parsing with fallback data and improved error handling

### Additional Fixes
- **Initial Handle Data Loading**: Fixed issue where handle data was missing on initial client load by ensuring `HandleManager.updateHandle()` is called after tray creation
- **Duplicate Event Handlers**: Eliminated duplicate click handlers that were causing conflicts between `PanelManager` and `HandleManager`
- **Condition Click Events**: Fixed condition icon clicks (left-click for description, right-click for remove) and conditions button functionality
- **Quest Data Parsing**: Resolved NaN values and missing quest names by improving quest data fallbacks and template handling
- **Party Member Health Bar Clicks**: Fixed party member health bars loading current player's health instead of clicked member's data
- **Import/Export Issues**: Resolved module import errors for `SQUIRE`, `Dialog`, `getBlacksmith`, and other dependencies
- **Handle Fade Errors**: Fixed `TypeError` in `_updateHandleFade` by adding robust null checks and proper initialization timing

### Additional Technical Improvements
- **Code Organization**: Eliminated code duplication between `PanelManager` and `HandleManager`
- **Event Management**: Improved event listener lifecycle management with proper cleanup and reattachment
- **Error Handling**: Enhanced error handling throughout handle operations with comprehensive logging
- **Template System**: Added Handlebars `add` helper for quest objective numbering
- **Memory Management**: Added proper cleanup methods to prevent memory leaks from event listeners

### Files Modified
- `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods
- `scripts/panel-manager.js` - Removed handle-related code, added HandleManager integration
- `scripts/manager-handle.js` - New file with all handle functionality
- `scripts/helpers.js` - Exported `getBlacksmith()` function
- `scripts/squire.js` - Added Handlebars `add` helper
- `templates/partials/handle-conditions.hbs` - Fixed typo
- `templates/handle-party.hbs` - Enhanced member context passing
- `templates/partials/handle-quest.hbs` - Improved quest data handling


## [12.0.21] - Enhanced Codex

### Added
- **Phase 1: Enhanced Add Window with Drag & Drop**
  - Drag & drop functionality for tokens, items, and journal entries to auto-populate form fields
  - Smart auto-population: Name, Category, Tags, and Image fields automatically filled based on dropped entity
  - Category detection: Auto-suggests "Characters" for actors, "Items" for items, and extracts categories from journal content
  - Tag generation: Auto-generates relevant tags based on entity properties (actor type/race/class, item type/rarity)
  - Image handling: Automatically sets entity images and provides preview with remove functionality
  - Enhanced form layout with organized sections and improved visual hierarchy

### Changed
- **Complete UI Redesign**: Modernized codex form with card-based layout, better spacing, and visual hierarchy
- **Form Structure**: Reorganized into logical sections (Basic Information, Content, Tags) with clear headings
- **Label Positioning**: Moved all form labels above their respective form elements for better readability
- **Dropdown System**: Replaced text inputs with smart dropdowns for categories and locations, including existing options and "New" options
- **Window Naming**: Renamed window ID to `codex-entry-window` for clarity and added corresponding CSS class

### Fixed
- **Critical CSS Issue**: Fixed global CSS selectors that were breaking ALL other forms in FoundryVTT by properly namespacing all styles to `.codex-form` only
- **Dropdown Visibility**: Fixed dropdown text not being visible by using FoundryVTT's proven CSS approach with `var(--color-text-light-highlight)` variables
- **Description Field**: Fixed description and plot hook fields not being properly saved by implementing robust form data handling
- **Location Formatting**: Fixed HTML entities (`&gt;`) displaying instead of actual `>` characters in location dropdowns
- **Form Submission**: Enhanced form submission with manual FormData processing to ensure all fields are captured correctly
- **Category Selection**: Fixed category dropdown not properly registering selected values
- **Tag Handling**: Improved tag processing to handle undefined/null values gracefully

### Technical Improvements
- **Proper Namespacing**: All CSS now properly scoped to avoid conflicts with other FoundryVTT modules
- **Form Data Handling**: Implemented robust FormData capture and processing for reliable form submission
- **Error Handling**: Added comprehensive debugging and error logging throughout the form submission process
- **Code Organization**: Cleaner, more maintainable code structure following FoundryVTT best practices

## [12.0.20] - Readiness

### Added
- Quest pin labels toggle functionality for both GMs and players with independent user preferences
- Auto-show quest pins feature that automatically displays pins when GMs drag quests/objectives to canvas while pins are hidden
- Enhanced quest pin visibility system with proper GM and player control

### Changed
- Renamed quest tooltip templates for better clarity: `tooltip-quest-pin.hbs` → `tooltip-pin-quests-quest.hbs`, `tooltip-quest.hbs` → `tooltip-pin-quests-objective.hbs`
- Updated quest pin tooltips to use Font Awesome icons instead of unicode characters for consistency
- Redesigned objective pins to be square with large quest type icons and improved layout
- Enhanced quest pin tooltips with better participant portrait display and improved styling
- Updated quest pin icon colors to use state-based coloring matching ring colors
- Improved quest pin title system with configurable font size, max width, vertical offset, and drop shadows
- Enhanced quest status dropdown positioning with boundary checking to prevent off-screen display
- Improved quest pin click behavior to automatically expand collapsed sections when navigating to quests

### Fixed
- Fixed deprecated `EffectsCanvasGroup#visibility` API usage in quest pins, now using `Canvas#visibility` for FoundryVTT v12+ compatibility
- Fixed settings registration timing issue that caused "excludedUsers is not a registered game setting" error by adding safety checks for unregistered settings
- Fixed error when attempting to modify actors from compendiums during auto-favorite operations for NPCs/monsters, now properly detecting compendium actors using both `actor.pack` and `actor.collection.locked` checks
- Enhanced compendium detection across all favorite management functions to prevent "You may not modify the Compendium which is currently locked" errors
- Fixed quest pin visibility toggle to work for both GMs and players (was previously restricted to players only)
- Fixed quest pin visibility logic to properly respect user preferences for all users including GMs
- Fixed quest status dropdown menu positioning and boundary issues
- Fixed quest status changes via dropdown not updating pin icons and appearance
- Fixed quest pin labels toggle to only hide/show titles while keeping quest numbers visible
- Fixed quest pin tooltip visibility reporting to use actual pin states instead of parsed journal data
- Fixed quest pin icon colors and rings for different quest statuses (Hidden, In Progress, Not Started, Failed, Completed)
- Fixed quest pin title positioning and anchoring for better text placement control
- Fixed quest pin click navigation to automatically expand collapsed sections
- Fixed quest pin title display to show actual quest names instead of "Unknown Quest/Objective"

### Cleaned Up
- Removed unnecessary debug logging from quest pin system while maintaining error trapping for actual problems
- Cleaned up console noise from constructor, state changes, click events, and loading operations
- Kept essential error logging for data fetching, persistence operations, and state management failures

## [1.0.19] - Debug Removal

### Fixed
- Debug removal

## [1.0.18] - Quest Overhaul

### Added
- Comprehensive quest management tools: clear all quest pins (scene-level and all-scenes), clear quest pins for specific quests, hide/show objective pins toggle for players.
- Pin visibility class to handle quest progress: objectives with visible pins are now visually marked.
- Player toggle button for pin visibility with icon state changes and user flag persistence.
- GM scene-level and quest-level buttons with confirmation dialogs for pin management.
- Player notifications when quests are automatically unpinned.
- Proper quest state synchronization across all components.
- Persistent window state management for macros, dice tray, and health windows, including viewport validation and error handling.
- Tools are now accessible regardless of context.

### Changed
- Unified tooltip data for quests: all tooltips now use a shared Handlebars template and QuestParser as the source of truth.
- Enhanced pin visibility updates with proper appearance refresh and automatic unpinning when quests are hidden from players.
- Quest-level visibility now properly controls all objective pin visibility for players.
- Enhanced health window update detection for real-time HP changes.
- Improved error handling and Blacksmith logging for window state restoration.

### Fixed
- Fixed syntax error in quest pin state update (panel-quest.js).
- Removed duplicate event handler setup in panel-manager.js.
- Fixed duplicate class attribute in partials/quest-entry.hbs.
- Fixed tray window click issue that caused the tray to disappear.
- Fixed squire tray disappearing on scene change.
- Fixed handle quest progress order and index mapping.
- Fixed handle quest data loading on scene change.
- Fixed tooltip data consistency between handle and pin.
- Fixed quest visibility toggle pin refresh and pin appearance for GM/players.
- Fixed excludedUsers settings issue and critical startup error.
- Fixed quest import/export and tooltip data consistency.
- Fixed most critical bugs and improved data consistency and code architecture.

## [1.0.17] - Printing Character Sheets

### Added
- New character sheet printing functionality accessible from the character panel
- Comprehensive print template with professional styling and layout
- Print button (scroll icon) in character panel header for easy access
- Detailed character information including portrait, basic info, and class details
- Complete ability scores display with modifiers and visual icons
- Skills section with dual-column layout and ability score associations
- Inventory management with item details, quantities, weights, and prices
- Spell listing with school, level, and usage information
- Features and traits section with detailed descriptions
- Print-optimized CSS with proper page breaks and A4 formatting
- Image loading timeout handling for reliable printing
- Error handling for popup blockers and invalid actor data

### Changed
- Enhanced character panel with print functionality integration
- Improved item description parsing to separate main content from additional details
- Updated template system to support comprehensive character data export
- Optimized print layout for both screen viewing and physical printing

### Fixed
- Resolved item weight display issues for various data structures
- Fixed skill icon mapping for all D&D 5e skills
- Improved error handling for missing or invalid character data
- Enhanced template rendering reliability with proper validation

## [1.0.16] - Macros and Handles

### Added
- Added empty macro slot placeholder with "Add" button when no macros are present
- Added visual feedback for macro handles during drag operations
- Added proper event handling for macro creation and updates

### Changed
- Improved macro panel rendering to always show at least one empty slot
- Enhanced macro handle functionality with proper drag and drop support
- Improved macro handle positioning and interaction areas
- Enhanced macro panel refresh logic to maintain UI state
- Improved macro panel performance with optimized rendering

### Fixed
- Fixed macro panel layout to maintain consistent spacing and alignment
- Fixed macro handle visibility and interaction states

## [1.0.15] - Drag and Drop Fix

### Fixed
- Fixed persistent issue with drag and drop functionality where subsequent drops wouldn't work until switching tabs
- Implemented proper event handler reattachment after DOM updates in the panel manager
- Ensured drag and drop handlers are explicitly removed and reattached after tray updates
- Added dedicated method for attaching drag handlers to improve code organization
- Added debug logging to track event handler reattachment

## [1.0.13] - Quests and Codex

### Added
- Visual feedback for drag and drop operations with highlighted drop targets
- CSS styling for drop targets with green borders and animations
- Improved quest journal entry handling with better section management

### Changed
- Modified tag system to only include explicit tags from quest entries
- Removed automatic inclusion of participant names and status as tags
- Improved persistence of collapsed/expanded state for quest categories
- Enhanced drag and drop functionality for actors and items
- Updated quest panel data attribute selectors for better state tracking

### Fixed
- Fixed issue with collapsed/expanded state not persisting between sessions
- Resolved problem with duplicate "Participants:" sections when dragging actors
- Fixed drag and drop functionality for adding actors as participants
- Fixed drag and drop functionality for adding items as treasure
- Improved drag handler implementation using DOM-based approach instead of regex

## [1.0.12] - Bug Fixees

### Fixed
- Fixed participant issue
- Fixed missing tasks for players

## [1.0.11] - Notes Panel & Quest Improvements

### Added
- New journal notes panel in the tray for easy access to journal entries
- Read-only journal content display with proper formatting
- Journal page selection dropdown for multi-page journals
- Custom toolbar with edit and open buttons to access Foundry's native journal editor
- Live content updates when journal entries are modified
- Visual overlay indicating when content is being edited by any user
- Proper hooks integration to refresh content when journal pages are updated
- Auto-favorite equipped weapons and prepared spells for monsters/NPCs when first selected (only if they don't already have favorites)
- Dynamic codex category icons based on category (Characters, Locations, Artifacts)
- Always-enabled clear (X) button that clears both search and tag filters and resets results
- Clicking a tag in an entry now clears all filters and filters by that tag only
- Reorganized quests by status (In Progress, Not Started, Completed, Failed) rather than by category
- Quest counts now display in section headers (e.g., "In Progress (3)")
- Pinning functionality for quests in the "In Progress" section with auto-expansion
- JSON export/import functionality for both quest and codex panels
- Added feather icon to quest cards to open the quest journal directly

### Changed
- Improved CSS organization and removed duplicate styles
- Plot Hook and other fields are now robustly parsed regardless of colon placement or HTML structure
- Improved tag/search/expand/collapse logic for all filter states
- Changed progress bar to only display when progress is greater than 0%
- Modified the border styling for expanded quest entries
- Enhanced quest import functionality to check for existing entries and update them
- Quest export now includes quests from all status groups, not just category groupings
- Cleaned up the codebase by removing unnecessary console.log debug statements

### Fixed
- Fixed scrollbar issues to ensure only one scrollbar appears in the notes panel
- Resolved content refresh issues when journal entries are edited
- Fixed critical hook function naming issue that was preventing content updates
- Improved CSS styling for better integration with Foundry's UI
- Consolidated duplicate CSS to improve maintainability
- Fixed event handler binding to prevent odd expand/collapse behavior after filtering
- Fixed quest import to properly handle UUID and preserve original category information

## [1.0.10] - Transfers and More

### Fixed
- Fixed issue where players were receiving both sender and receiver transfer messages
- Resolved permission errors when players attempted to delete or update chat messages
- Improved handling of socketlib for transfer message management
- Fixed duplicate chat messages during item transfers between characters
- Addressed transfer chat messages not being removed after acceptance/rejection
- Fixed message ordering in chat log to maintain logical conversation flow

### Changed
- Improved transfer chat messages with personalized text based on sender/receiver status
- Enhanced the chat templates to properly handle singular/plural item descriptions
- Restructured socket handlers for more reliable GM-mediated message delivery
- Improved handling of transfer request buttons to prevent double-clicking
- Updated chat message flow to ensure logical ordering of acceptance and completion messages

### Added
- Added notes in the tray... very alpha
- Added GM-mediated message deletion for transfer request cleanup
- Implemented visual feedback during transfer processing with disabled buttons
- Added replacement messages for transfer requests after processing
- Created new socket handler for GM-executed message cleanup
- Added proper error handling and fallbacks for socket communication

## [1.0.9] - Event Handler Fixes

### Fixed
- Fixed multiple click events being triggered when using weapons, spells, features, and inventory items
- Added proper event cleanup and namespacing to prevent event handler accumulation
- Improved event delegation consistency across all panels

## [1.0.8] - Bug Fixes

### Fixed
- Fixed tray behavior when switching between tokens to prevent disappearing and re-sliding
- Resolved issue with panel settings not being properly registered
- Improved tray state preservation during token switches
- Fixed animation glitches during tray updates
- Ensured proper panel instance management during token transitions

### Changed
- Refactored tray update logic to maintain consistent state
- Improved panel instance handling for better stability
- Enhanced tray element management to prevent duplicate elements
- Updated panel visibility settings handling for better reliability

## [1.0.7] - Unified cards

### Changed
- Unified all item transfer chat cards to use a single utility for consistent data and appearance.
- Updated transfer card types to: `transfer-gm` (GM/compendium/world drops), `transfer-complete` (actor-to-actor transfers), and `transfer-request` (transfer requests with accept/reject).
- Refactored `panel-party.js` and `panel-manager.js` to use the new card system for all transfer scenarios.
- Reverted transfer request chat message logic to its original, pre-card-system form for stability and compatibility.

### Fixed
- Fixed duplication of transfer request chat messages in GM and sender clients.
- Fixed "Transfer request not found" error when accepting/rejecting a transfer.
- Fixed ReferenceError for `sourceActor` in transfer request button handler by fetching all data from chat message flags.
- Ensured only the correct clients receive transfer request messages (GM and receiver get the actionable message, sender gets a confirmation).

## [1.0.6] - Transfers

### Added
- New item transfer system between characters
- Party panel for managing item transfers and player interactions
- Support for quantity selection when transferring stackable items
- Dialog confirmation for item transfer requests
- Chat message notifications for completed transfers
- Transfer history tracking with timestamps
- Flag-based transfer request system for persistent state

### Changed
- Improved drag and drop handling for items
- Enhanced user permissions checking for item transfers
- Added ability for GMs to facilitate transfers between players

## [1.0.5] - Exclude Users

### Fixed
- Fixed critical issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.4] - Cleanup

### Added
- Proper cleanup of CSS variables and UI margins for excluded users

### Changed
- Improved module initialization to handle excluded users properly
- Moved CSS variable setup to after user exclusion check
- Enhanced handling of Handlebars partials for excluded users

### Fixed
- Fixed issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.3] - Uswer contxt

### Changed
- Updated initialization process to better handle user context
- Improved error handling for template registration

### Fixed
- Fixed issues with user visibility and initialization
- Resolved template registration timing issues

## [1.0.2] - Improved panels

### Changed
- Updated dice tray icon to match the style of condition icons
- Enhanced dice tray icon with improved hover effects and animations
- Standardized icon sizes and visual feedback across the handle bar

### Fixed
- Fixed critical issue with panel manager initialization timing
- Improved event handling in all panels (Spells, Features, Weapons, Inventory)
- Added comprehensive debug logging for troubleshooting
- Ensured proper cleanup of event listeners

### Added
- Created CONSIDERATIONS.md with development guidelines and best practices
- Added AI development guidelines for future maintenance
- Enhanced logging system for better debugging

## [1.0.1] - Apells, weapons and Items

### Changed
- Removed "'s Squire" suffix from character names for cleaner display
- Modified tray initialization to load automatically when client connects
- Added automatic character selection based on owned tokens
- Updated UI to show "Select a Character" when no token is selected
- Improved event handling to prevent tray from closing unexpectedly
- Updated spell usage to support DnD5e 4.0+ API changes

### Fixed
- Fixed issue with tray closing when interacting with health controls
- Fixed deprecation warning for Item5e#use method
- Improved click handling within the tray content

### Added
- Enhanced tooltips for favorite items in the handle bar showing detailed information based on item type:
  - Spells: Level, school, materials, damage, and scaling information
  - Weapons: Attack type, damage, and range
  - Features: Requirements and description

## [1.0.0] - Initial Release

### Added
- Initial release
- Sliding tray interface with three panels (Spells, Weapons, Info)
- Spell management with spell slot tracking
- Weapon management with ammunition tracking
- Character info panel with HP, ability scores, and resource tracking
- Customizable settings for tray position, theme, and behavior
- Integration with Coffee Pub Blacksmith API 