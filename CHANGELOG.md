# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.0.0] - v13 Migration Begins

## [12.1.14] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Squire compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

## [12.1.13] - Character Panel Render Safety Fix

### Fixed
- **Character Panel Render Crash**: Fixed `TypeError: Cannot read properties of null (reading 'find')` error in `CharacterPanel.render()` method
  - Added comprehensive safety checks after async operations to validate `this.element` exists and is a valid jQuery object
  - Added validation for character panel container existence in DOM before attempting DOM manipulation
  - Prevents crashes when element becomes null during async operations (TextEditor.enrichHTML, renderTemplate)
  - Added graceful error handling with early returns when element is invalid

### Added
- **Render Cancellation System**: Implemented render cancellation flag to prevent race conditions
  - Added `_renderInProgress` flag and `_renderCancellationToken` tracking to prevent overlapping renders
  - Cancels stale renders when new render starts, preventing race conditions during rapid token selection
  - Ensures only the most recent render completes, preventing UI inconsistencies
  - Added `try/finally` block to guarantee render flag is always cleared, even on errors

### Changed
- **Error Handling**: Enhanced `CharacterPanel.render()` with comprehensive validation and error logging
  - Added validation checks after async operations to ensure element is still valid before DOM manipulation
  - Added error logging using Blacksmith API for better debugging when render issues occur
  - Improved error messages with actor context (actorId, actorName) for easier troubleshooting

### Technical Improvements
- **Memory Safety**: Verified no memory leaks introduced - all new properties are primitives (boolean, Symbol) that are properly garbage collected
- **Performance**: Improved performance by preventing wasted async computation and DOM manipulation when element is invalid
- **Race Condition Prevention**: Implemented token-based cancellation system to prevent overlapping renders from interfering with each other
- **Code Quality**: Removed redundant flag clearing (finally block handles cleanup), improved code clarity



## [12.1.12] - Auto-Favor Actions for NPCs

### Fixed
- **NPC Auto-Favoring**: Fixed auto-favoring not working when items were created on NPCs before the panel was initialized
  - Updated `createItem` hook to trigger `initializeNpcFavorites` for NPCs even when panel isn't active
  - Added deferred execution pattern using `Promise.resolve().then()` to prevent race conditions during actor/item creation
  - Re-fetches actor to ensure latest state before initializing favorites
  - Added duplicate work prevention to avoid re-initializing if favorites already exist
- **Item Creation Race Conditions**: Fixed potential race conditions when items are created as part of actor creation by deferring auto-favor initialization until after synchronous hook cycle completes

### Changed
- **Error Handling**: Enhanced `createItem` hook with comprehensive try-catch error handling to prevent hook failures from breaking other functionality
- **Safety Checks**: Added validation for item and parent existence before processing in `createItem` hook

### Technical Improvements
- **Deferred Execution**: Implemented microtask-based deferred execution to ensure items are fully initialized before auto-favoring logic runs
- **Actor State Verification**: Added actor re-fetch and state verification to ensure accurate favorite initialization

## [12.1.11] - Timer Tracking & Memory Leak Fixes

### Added
- **Timer Utilities**: Introduced `scripts/timer-utils.js` with shared helpers (`trackModuleTimeout`, `trackModuleInterval`, `moduleDelay`, etc.) so every timeout/interval is registered and automatically cleaned up during `cleanupModule()`.

### Changed
- **Global Timer Usage**: Updated `squire.js`, `manager-panel.js`, quest panels, notes/codex/macro panels, quest pins, helpers, and transfer flows to use the new timer helpers, ensuring consistent cleanup and easier diagnostics.
- **Cleanup Module**: Replaced the zero-delay `setInterval(() => {}, 0)` sweep with targeted `clearAllModuleTimers()` plus tracked animation-frame cancellation to avoid spawning a runaway interval.

### Fixed
- **Canvas Selection Leak**: Wrapped `canvas.selectObjects` only once per session and restored the native method during cleanup so scene swaps no longer stack wrappers or timers.
- **Quest Pin Drags**: Added `_forceEndDrag()` plus PIXI removal hooks to guarantee document-level `pointermove`/`pointerup` listeners are removed even when pins are deleted or scenes change mid-drag; hover tooltips now auto-hide on drag start/end.
- **Quest Tooltips**: Added auto-hide timers and proper cancellation, preventing hover tooltips from lingering indefinitely when events are missed.

## [12.1.10] - Party Stats Panel Improvements

### Changed
- **Party Stats Panel**: Updated MVP leaderboard to use Blacksmith lifetime data, removing the obsolete stats code path.

## [12.1.9] - Multi-Select Performance Improvements & Name Fixes

### Added
- **GM Details Panel**: Introduced a dedicated, collapsible GM-only panel that surfaces resistances, immunities, and enriched biography content with a fixed-height, scrollable layout.
- **GM Panel State Setting**: Added a persistent `isGmPanelCollapsed` client setting so each GM retains their preferred panel state between sessions.
- **Token Display Helper**: New shared utility normalises token display names (token document → token → prototype → actor) for use across panels and handle logic.

### Changed
- **Panel Manager Lifecycle**: Updated `PanelManager` to instantiate, track, and destroy the new `GmPanel`, including shared caching via `PanelManager.setGmDetails` and tray template updates.
- **Stylesheet Organization**: Hooked the new GM panel stylesheet into the default bundle to keep styling centralized and consistent.
- **Handle & Panel Names**: Character panel, handle manager, health panel, and tray headers now rely on the token display helper so UI labels always match placed tokens.
- **Party Panel Namespace**: Renamed party panel classes and selectors to a dedicated `party-` prefix, avoiding CSS bleed from the character panel.
- **Party Feather Click**: Suppressed tray re-initialization when the party-view feather icon opens an actor sheet so the tray no longer jumps actors.
- **Party Stats Panel**: Replaced the legacy combat/session aggregates with a streamlined MVP leaderboard sourced from Blacksmith lifetime data, removing the obsolete stats code path.

### Fixed
- **Multi-Select Performance**: Eliminated 5-10 second lag during multi-token selection with early return optimization
  - Added smart early return check in `_updateHealthPanelFromSelection` to skip expensive operations when nothing changed
  - Prevents unnecessary full panel re-renders, animations, and sounds during rapid multi-select
  - Reduces ~80% of unnecessary DOM operations during multi-token selection
- **Macros Panel Crash**: Fixed "Cannot read properties of null" error in macros panel during multi-select
  - Added null safety check to prevent rendering when DOM placeholder doesn't exist
  - Prevents crashes when tray is being rebuilt during rapid token selection events
- **Token Name Display**: Restored token-based naming across handle portrait, party listings, character panel, health, macros, and dice tray panels so custom token labels appear everywhere.

## [12.1.8] - Hook Restoration & Critical Sync Fixes

### Added
- **Critical Hook Restoration**: Restored missing `globalUpdateActor` hook that was causing major synchronization issues
- **Token Deletion Handling**: Restored `globalDeleteToken` hook to prevent tray crashes when tokens are deleted
- **Active Effect Hooks**: Added `createActiveEffect` and `deleteActiveEffect` hooks for proper condition synchronization
- **Comprehensive Hook Audit**: Created detailed audit report identifying 5-6 missing critical hooks
- **Multi-Token Selection Support**: Enhanced `globalControlToken` hook with optimized multi-select handling and debouncing
- **Bulk Selection Tools**: Added canvas selection support for lasso and box selection tools via `globalCanvasReady` enhancement
- **New Token Detection**: Restored `globalCreateToken` hook for automatic handle updates when new tokens are created
- **Auto-Favoriting for NPCs**: Restored automatic favoriting of equipped weapons and prepared spells for NPCs/monsters
- **Pause Game Handling**: Restored `globalPauseGame` hook to prevent stale data after game pause/resume
- **Item Transfer System**: Added "send item" functionality to weapons panel matching inventory panel capabilities
- **Panel Refresh Optimization**: Implemented targeted panel refresh for item transfers (weapons/inventory only) instead of full panel re-render

### Fixed
- **Health Panel Sync**: Health bars now update immediately when HP changes externally (spells, damage, healing)
- **Handle Synchronization**: Handle now refreshes when actor attributes change (AC, level, movement, etc.)
- **Effect Display**: Status effects in handle now update when conditions are added/removed via token HUD
- **Spell Slot Updates**: Spells panel now refreshes when spell slots are modified
- **Token Deletion Crashes**: Tray no longer crashes when active token is deleted, gracefully switches to next available token
- **Memory Leaks**: Removed legacy dead code from panel cleanup methods that was causing hook accumulation
- **Multi-Select Performance**: Fixed 3-5 second lag during multi-token selection with optimized update logic
- **Selection Display Updates**: Fixed selection display not updating properly during rapid token selection
- **Canvas Selection Tools**: Fixed lasso and box selection tools not updating tray display
- **New Token Integration**: Fixed handle not updating when new tokens are created on canvas
- **NPC Equipment Management**: Fixed NPCs/monsters not auto-favoriting equipped weapons and prepared spells
- **Game Pause Issues**: Fixed stale data display after game pause/resume cycles
- **Item Transfer Panel Updates**: Fixed weapons and inventory panels not refreshing after item transfers
- **"New" Badge Display**: Fixed "new" badges not appearing on weapons panel after item transfers
- **Transfer Performance**: Eliminated 5+ second delay during item transfers by optimizing panel refresh logic

### Changed
- **Hook Management**: Migrated to centralized BlacksmithHookManager for consistent hook lifecycle management
- **Panel Lifecycle**: Enhanced PanelManager to properly track and update token references alongside actor references
- **Legacy Code Cleanup**: Removed outdated hook cleanup comments and dead code from panel destroy methods
- **Performance Optimization**: Simplified multi-select logic to eliminate complex debouncing that was causing delays
- **Debug Logging**: Removed excessive console.log statements and replaced with clean, production-ready comments
- **Documentation**: Updated false comments about "moved" or "centralized" hooks to reflect actual architecture
- **Code Quality**: Cleaned up temporary debug comments, keeping only durable, necessary documentation

### Technical Improvements
- **Hook Architecture**: Restored proper hook registration pattern following established BlacksmithHookManager conventions
- **Token Reference Tracking**: Enhanced system to maintain both actor and token references for proper name display
- **Error Prevention**: Added comprehensive null checks and fallbacks in hook implementations
- **Performance**: Eliminated unnecessary re-renders by implementing targeted updates for specific change types
- **Multi-Select Optimization**: Implemented efficient selection handling that scales with token count
- **Canvas Integration**: Enhanced canvas selection tools integration with proper event handling
- **Auto-Favoriting Logic**: Restored intelligent auto-favoriting system for NPCs with compendium safety checks
- **Code Cleanup**: Comprehensive removal of debug logging, false comments, and legacy code references
- **Production Readiness**: Cleaned up all temporary development artifacts for production deployment

## [12.1.7] - Bug Squashing

### Fixed
- **Duplicate Quest Notifications**: Fixed multiple identical quest/objective notifications appearing in menubar when selecting tokens
- **Memory Leaks**: Fixed severe memory leaks caused by PanelManager creating new instances without cleaning up old ones
- **Quest Panel Instance Management**: Made notification IDs global static properties to prevent duplicates across QuestPanel instances
- **Panel Cleanup**: Added proper cleanup of old PanelManager instances before creating new ones to prevent memory accumulation
- **Event Listener Leaks**: Fixed event listeners and hooks not being properly cleaned up when switching between tokens

### Changed
- **Quest Notification System**: QuestPanel now uses static notification IDs instead of instance properties to prevent duplicates
- **PanelManager Lifecycle**: Added `_cleanupOldInstance()` method to properly destroy old instances before creating new ones
- **Memory Management**: Enhanced cleanup to destroy all panel instances (questPanel, characterPanel, etc.) when switching tokens


## [12.1.6] - Item Transfer Improvements

### Added
- **GM Approval System**: New setting to require GM approval for all player-to-player transfers
- **Transfer Request Cards**: Interactive chat cards for transfer requests with Accept/Reject buttons
- **GM Approval Cards**: Dedicated approval interface for GMs with Approve/Deny buttons
- **Transfer Validation**: Items are validated before transfer to ensure they still exist and have sufficient quantity
- **Automatic Expiration**: Transfer requests automatically expire after configurable timeout (10-180 seconds, default 30)
- **Transfer Timeout Setting**: New world setting to configure how long transfer requests remain valid
- **Personalized Messages**: Different chat messages for senders, receivers, and GMs for all transfer outcomes
- **Transfer Status Messages**: Clear feedback for waiting, accepted, rejected, expired, and failed transfers
- **Failure Notifications**: Detailed error messages when transfers fail due to missing items or insufficient quantity
- **Transfer from Tray**: New "Send" icon in inventory panel to initiate transfers via character selection window
- **Character Selection Window**: Reusable window for selecting transfer recipients with resizable interface
- **Actor Type Visualization**: Color-coded borders for different actor types (green=characters, red=monsters, blue=NPCs)
- **Unified Transfer System**: Centralized TransferUtils for consistent transfer behavior across all flows
- **Hostility-Based Classification**: NPCs classified as monsters (red) or friendly NPCs (blue) based on disposition

### Changed
- **Transfer Flow**: Completely redesigned transfer system with proper approval workflows
- **Chat Card System**: All transfer messages now use consistent chat card templates instead of hardcoded HTML
- **Message Targeting**: Improved whisper targeting to ensure correct users receive appropriate messages
- **GM Bypass**: GMs can transfer items between characters without requiring self-approval
- **Transfer Cleanup**: Automatic cleanup of request messages and waiting messages after transfer completion
- **Timer Management**: Background timer system for proactive transfer expiration with proper cleanup
- **Code Architecture**: Extracted transfer logic into reusable TransferUtils module for consistency
- **Character Window Logic**: GMs now see all actor types (characters, monsters, NPCs) while players see only party members
- **Transfer Unification**: Both drag-and-drop and send flows now use identical transfer logic

### Fixed
- **Duplicate Messages**: Fixed GM receiving duplicate transfer complete messages
- **Message Persistence**: Fixed sender "waiting" messages persisting after transfer completion
- **Deleted Item Handling**: Fixed crashes when attempting to transfer deleted items
- **Quantity Validation**: Fixed transfers proceeding when insufficient quantity available
- **Template Errors**: Fixed duplicate closing tags in chat card templates
- **Null Reference Errors**: Added proper null checks and fallbacks for deleted items
- **GM Approval for Offline Players**: Fixed GM not receiving approval cards when target player is offline in send flow
- **Transfer Data Consistency**: Fixed "Transfer request data not found" errors by ensuring proper data structure
- **Code Duplication**: Eliminated duplicate transfer methods across different panels



## [12.1.5] - Bug Squashing

### Fixed
- **Codex Import Template**: Updated codex import to load template from `prompts/prompt-codex.txt` file instead of hardcoded template
- **Rulebooks Replacement**: Codex import now properly replaces `[ADD-RULEBOOKS-HERE]` placeholder with user's default rulebooks setting
- **Build Workflow**: Added `prompts/` folder to GitHub workflow build process to ensure prompt files are included in releases

### Changed
- **Consistent Template Loading**: Both quest and codex imports now use the same dynamic template loading approach
- **Template Management**: Moved codex template from hardcoded JavaScript to external text file for easier maintenance

## [12.1.4] - Bug Squashing

### Added
- **Active Objective Notifications**: QuestPanel now manages active objective notifications using Blacksmith API
- **Quest Notification Management**: Enhanced quest notification system with proper creation, updates, and cleanup
- **Party Panel Integration**: Added party and partyStats panels to PanelManager for improved party management
- **Menubar Tool Registration**: Integrated macros functionality with Blacksmith menubar system

### Changed
- **Menubar Tool Titles**: Updated menubar tool titles for clarity - "Open Dice Tray" → "Dice Tray", "Open Macros" → "Macros"
- **Tray Positioning**: Enhanced CSS positioning to account for Blacksmith menubar interface offset
- **Quest Notification Messages**: Improved clarity of quest notification messages for better user feedback
- **Panel Manager Structure**: Enhanced panel management system with proper party panel integration

### Fixed
- **Tray Layout Issues**: Fixed tray positioning conflicts with Blacksmith menubar interface
- **Quest Notification Cleanup**: Improved quest notification cleanup when module is disabled
- **Panel Registration**: Fixed party and partyStats panel registration in PanelManager
- **Active Objective Management**: Enhanced active objective notification handling with proper ID tracking


## [12.1.3] - Quest Improvements

### Added
- GM notes now display inline with objectives instead of requiring hover tooltips
- GM notes use certificate icon (fa-file-certificate) and golden styling for easy identification
- GM notes are only visible to GMs, maintaining privacy

### Changed
- Objective pins on canvas now display objective text instead of quest title
- Improved objective highlighting with yellow border and background when selected from canvas pins
- Enhanced visual styling for GM notes and treasure indicators

### Fixed
- Objective pins now correctly show the actual objective description rather than generic "Objective X" text
- Improved CSS specificity for treasure and GM note icons


## [12.1.2] - Bug Fixes

### Fixed
- Fixed tag

## [12.1.1] - Bug Fixes

### Fixed
- Fixed tag


## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Blacksmith API Integration**: Full migration to use Blacksmith API for enhanced functionality and consistency
- **New Favoriting System**: Completely redesigned favoriting system with separate regular favorites and handle favorites
- **Handle Favorite Toggle**: New square-heart icon in favorites panel to toggle items for handle display
- **Auto-Handle Favorites for NPCs**: NPCs and monsters now automatically add their key abilities to both panel and handle favorites
- **Performance Optimizations**: Dramatically improved favoriting performance with targeted DOM updates instead of full panel re-renders
- **Interactive Spell Slot Management**: GM-only click system for managing spell slot usage with visual feedback
- **Party Health Integration**: Clicking party health bar now opens/populates health panel with entire party data

### Changed
- **Favoriting Architecture**: Separated regular favorites (shows in favorites panel) from handle favorites (shows in handle)
- **Heart Icon Behavior**: Heart icons in all panels now correctly reflect regular favorite status
- **Handle Display Logic**: Handle now only shows items that are explicitly handle-favorited, not all favorites
- **Module Structure**: Reorganized module.json to follow standardized structure with proper field grouping
- **Spell Slot Visual States**: Implemented correct visual representation matching character sheet (filled=available, unfilled=expended)
- **Token Selection System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support

### Fixed
- **Heart Icon State**: Fixed heart icons in inventory, weapons, and spells panels not showing correct favorited state
- **Performance Issues**: Eliminated massive over-rendering that caused favoriting operations to be very slow
- **Handle Favorite Logic**: Fixed handle showing all favorites instead of only handle-favorited items
- **Missing Handlebars Helper**: Added missing `getHandleFavorites` helper for handle template functionality
- **Event Listener Duplication**: Fixed critical event listener duplication issue that caused exponential performance degradation
- **Legacy Auto-Sync Logic**: Removed conflicting auto-sync logic for handle favorites to allow full manual control
- **Visual State Updates**: Fixed heart icon states not updating correctly across all panels after favoriting changes
- **Handle Item Availability**: Added "unavailable" class to handle favorites for unequipped/unprepared items
- **Handle Order Consistency**: Fixed handle favorites order to match panel favorites (with visual reversal for handle rotation)
- **Spell Level Filtering**: Fixed broken spell level filtering in Spells panel by correcting event listener target
- **Spell Slot System**: Implemented interactive spell slot management for GMs with correct visual states and click logic
- **Token Selection Logic**: Fixed token selection in Party tab to use unique token IDs instead of shared actor IDs
- **Monster Name Display**: Fixed Party tab to show specific token names instead of generic actor names
- **Dice Tray Button**: Fixed dice tray button not showing in handle due to typo in template condition
- **Memory Leaks**: Fixed severe hook accumulation causing game slowdown by implementing proper cleanup in all panel destroy methods
- **Duplicate Event Handlers**: Removed duplicate event handlers for conditions button, macro icons, party member icons, and print character button
- **NPC Favorites Initialization**: Fixed TypeError in NPC auto-favorite system when accessing actor collection
- **Party Health Bar Click**: Fixed party overview health bar to properly select all player-owned tokens and populate health panel
- **Handle Favorites Order**: Fixed handle favorites to display in correct order matching panel favorites (reversed for handle rotation)

### Technical Improvements
- **Targeted DOM Updates**: Replaced 4 full panel re-renders with smart DOM updates for 10-20x performance improvement
- **Data Consistency**: Ensured all panel data structures stay synchronized without full re-renders
- **Event Handler Optimization**: Streamlined event handling for favoriting operations
- **Memory Management**: Improved cleanup and data synchronization between panels
- **Namespaced Events**: Implemented proper event namespacing to prevent duplicate event listeners
- **Spell Slot Management**: Added comprehensive spell slot system with visual feedback and real-time updates
- **Token ID System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support
- **Template Condition Fixes**: Corrected Handlebars template conditions for proper conditional rendering
- **Debug Code Cleanup**: Removed verbose debug logging and debug comments for cleaner production code
- **Hook Cleanup System**: Implemented comprehensive destroy methods for all panels to prevent FoundryVTT hook accumulation
- **Module-Level Cleanup**: Added module disable hooks to clean up global hooks and prevent memory leaks
- **Panel Lifecycle Management**: Enhanced PanelManager cleanup to properly destroy all instantiated panels

### Files Modified
- `scripts/panel-favorites.js` - Complete favoriting system overhaul with performance optimizations and NPC auto-favorites
- `scripts/panel-inventory.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-spells.js` - Updated to check correct favorites flag for heart icon state and added spell slot management
- `scripts/panel-weapons.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-party.js` - Fixed token selection logic, monster name display, and party health bar integration
- `scripts/panel-character.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-macros.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-party-stats.js` - Added destroy method for hook cleanup
- `scripts/manager-panel.js` - Enhanced cleanup method to destroy all instantiated panels
- `scripts/manager-handle.js` - Removed debug code and optimized event handling
- `scripts/helpers.js` - Added missing `getHandleFavorites` Handlebars helper
- `scripts/squire.js` - Removed verbose debug logging
- `scripts/manager-hooks.js` - Removed debug comments
- `scripts/quest-pin.js` - Added module-level cleanup hooks for global hook management
- `styles/panel-favorites.css` - Added styling for handle favorite toggle icons
- `styles/panel-spells.css` - Added spell slot styling and hover effects
- `styles/tray.css` - Updated handle favorite icon colors for consistency
- `templates/partials/handle-favorites.hbs` - Updated to use handleFavorites data source and added unavailable class logic
- `templates/panel-spells.hbs` - Added spell slot template with proper visual states and order
- `templates/panel-party.hbs` - Fixed monster name display to use token names and token ID selection
- `templates/handle-player.hbs` - Fixed dice tray button display condition
- `templates/handle-codex.hbs` - Fixed dice tray button display condition
- `templates/handle-notes.hbs` - Fixed dice tray button display condition
- `templates/handle-party.hbs` - Fixed dice tray button display condition
- `templates/handle-quest.hbs` - Fixed dice tray button display condition
- `module.json` - Reorganized to follow standardized structure

### Breaking Changes
- **Favoriting System**: The way favorites work has fundamentally changed - regular favorites and handle favorites are now separate
- **Handle Display**: Items in the handle must now be explicitly handle-favorited, not just regular favorites
- **Performance**: Favoriting operations are now much faster but use different update mechanisms

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
- `scripts/manager-panel.js` - Removed handle-related code, added HandleManager integration
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
- Removed duplicate event handler setup in manager-panel.js.
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
- Refactored `panel-party.js` and `manager-panel.js` to use the new card system for all transfer scenarios.
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