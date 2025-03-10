# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2024-02-25

### Added
- Added new Party Stats Panel with real-time combat statistics
- Added collapsible sections for Combat Overview, Individual Contributions, and Session Information
- Added automatic stat updates using Blacksmith's Stats API
- Added visual styling to match the tray's aesthetic with section-specific colors
- Added party view mode toggle in tray handle

### Changed
- Improved panel organization with dedicated CSS files
- Enhanced section headers with icons and collapsible functionality
- Updated stat display with more readable formatting and better visual hierarchy

### Fixed
- Fixed context menu functionality for reordering favorites
- Fixed issue where moving favorites would break tray expand/collapse functionality
- Fixed pin button functionality after reordering favorites
- Fixed issue where odd/even number of moves would affect tray functionality
- Eliminated all deprecation warnings for D&D5e+
- Readiness for version 13
- Prep for version 14

## [1.0.2] - 2024-02-08

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

## [1.0.1] - 2024-02-07

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

## [1.0.0] - 2024-02-06

### Added
- Initial release
- Sliding tray interface with three panels (Spells, Weapons, Info)
- Spell management with spell slot tracking
- Weapon management with ammunition tracking
- Character info panel with HP, ability scores, and resource tracking
- Customizable settings for tray position, theme, and behavior
- Integration with Coffee Pub Blacksmith API 