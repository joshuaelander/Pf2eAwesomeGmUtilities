# PF2e Awesome GM Utilities

A comprehensive suite of widgets, utilities, and UI enhancements designed to make running Pathfinder 2e games on Foundry VTT (v14) faster, smoother, and more intuitive for Game Masters.

For detailed walkthroughs, configuration options, and technical guides, see the [Full Wiki & Utilities Reference Guide](file:///c:/Users/joshu/source/repos/Pf2eAwesomeGmUtilities/WIKI.md).

---

## High-Level Utility Overview

### 1. Music & SFX Sound Pad
An audio trigger board built natively for Foundry VTT v14 to streamline session music, ambience, and sound effects.
- **Audio Trigger Board:** Organize audio into tabs such as Combat, Ambience, Tavern, and SFX, or build custom banks.
- **Playback Modes:** Configure slots as looping background music, toggle play/stop, one-shot sound effects, or restart on press.
- **Private GM Audition Mode:** Privately preview songs through your headphones without alerting players, then broadcast to the world with a single click.
- **Drag-and-Drop Mapping:** Drag any playlist or individual sound from Foundry's sidebar directly onto a slot to instantly configure it.
- **Volume & Crossfading:** Master volume controls, track scrubbers, skip forward/backward buttons, and optional automatic background music crossfading.

### 2. Session Scene Switcher
A dedicated prep and session dock for organizing and navigating the maps planned for game night.
- **Session Curation:** Keep a focused list of scenes needed for the current adventure without browsing deep folder trees.
- **Fast Scene Transitions:** Three distinct navigation actions: View (inspect privately as GM), Activate (activate globally for everyone), and Pull Players (force-teleport all connected player screens).
- **Day and Night Lighting Toggle:** Instant darkness toggle on each scene card to flip between daylight and dark atmosphere without opening scene configuration sheets.
- **Active Scene Banner:** A prominent top banner showing the currently active map, combat indicators, and a one-click button to gather all players.
- **Drag-and-Drop Organizing:** Drag scenes directly from the sidebar or navigation bar to add them to your session queue.

### 3. Resource & Subsystem Tracker and Floating HUD
A versatile tracking panel for party supplies, complex victory point systems, radial clocks, and character afflictions.
- **Party Consumables:** Track shared party supplies such as rations, clean water, torches, ammunition, and camping gear with tactile adjustment buttons.
- **Subsystem Radial Clocks:** Authentic 4, 6, 8, 10, or 12-slice circular progress clocks and countdown doom timers for heists, infiltration, research, and chases.
- **Character Links & Afflictions:** Link trackers to player character actors to monitor sanity, stress, or multi-stage diseases and poisons (1 to 6+ stages) with save DCs and symptom reminders.
- **Smart Stat Block Parser:** Drag and drop monster abilities or compendium hazards directly into the tracker to automatically extract save DCs, traits, onset times, and stage descriptions.
- **Player-Visible Floating HUD:** Pin any tracker to a compact, transparent on-screen HUD widget. Toggle player visibility to let players watch countdown timers and tension clocks in real time with synchronized updates.
- **Chat Status Cards:** Post formatted tracker and clock status cards directly into the game chat with one click.

### 4. Party Placement Tool
A rapid positioning utility for moving the entire adventuring party onto a new map.
- **One-Click Gathering:** Automatically identifies all active player characters assigned to the party.
- **Grid-Aligned Formations:** Click anywhere on the active scene canvas to place the party in a clean, organized formation centered on your cursor without dragging tokens individually from the sidebar.

### 5. Interactive Map Pins & Scene Links
Navigation pins and journal links that allow the GM to jump between interconnected maps.
- **Map-to-Map Navigation:** Place pins on world maps or regional overland maps that connect directly to local battle maps or interior locations.
- **Interactive Transition Menu:** Clicking or double-clicking a scene pin presents options to inspect the scene privately or activate it for the entire table.
- **Drag-and-Drop Pin Creation:** Drag any scene document directly onto the canvas to automatically generate an interactive scene navigation pin.
- **Journal Integration:** Scene links embedded inside journal entries open the interactive Scene Transition panel to view, activate, or configure maps.

### 6. Advanced Journal Editor & AP Styler
A publishing and styling toolkit integrated into Foundry's ProseMirror journal editor.
- **Adventure Path Layout Templates:** Insert pre-styled narrative elements including Read-Aloud boxed text, GM Callouts (Treasure, Tactics, Hazards, Investigation, XP Awards, Secrets), and multi-column responsive sections.
- **Entity & Scene Link Cards:** Insert rich interactive cards for battle maps (with thumbnail art and clickable scene links), creature rosters (portraits, levels, AC, HP, Perception), and item loot cards.
- **Skill Check Tables:** Generate formatted DC tables with all four degrees of success (Critical Success, Success, Failure, Critical Failure) or compact inline check tags.
- **Drag-and-Drop Publishing:** Drag formatted cards or templates directly from the utility window into open journal pages at your cursor position.

### 7. Performance Checker & Module Profiler (GM Only, Opt-In)
An opt-in, strictly GM-only diagnostic suite (disabled by default for zero overhead, and never active on player clients) to help GMs pinpoint slow, memory-heavy, or error-prone modules in Foundry v14 + PF2e.
- **Live Telemetry & Mini HUD:** Tracks real-time canvas FPS, frame times, 60-second FPS timeline, JS heap memory with leak trend monitoring, and main-thread freezes (>50ms) with LoAF script/layout/paint/hook/GC root-cause attribution, plus an optional compact floating HUD pill.
- **Module Impact Leaderboard:** Ranks all active modules by runtime errors, hook CPU timings, LoAF freeze spikes, browser asset download weight/load time, and stored Settings/Document Flags size, with a quick button to open Manage Modules.
- **Live & 10-Second Burst Hook Profiler:** Time Foundry hook callbacks on demand to catch exactly which hook and module spikes during token movement, sheet opens, or combat.
- **PF2e World & Canvas Deep Audit:** Non-blocking background audit detecting PF2e chat log bloat, heavy scenes (walls/lights/tokens/dimensions), bloated PF2e actors (high item/rule element counts), WebGL texture cache, and oversized assets.

### 8. PF2e Character Completeness Checker
A build auditor and character sheet assistant that helps GMs and players verify every part of a PF2e character—with native support for Dual Class (PF2e Awesome Variant Rules), Free Archetype, Ancestry Paragon, and Gradual Ability Boosts.
- **Party & Character Audit Dashboard:** Review every PC in the party for missing Ancestry, Heritage, Background, Class/Dual Class, Deity, Languages, Attribute Boosts per level tier, empty Feat slots, missing Trained Skills/Skill Increases, and missing Spellcasting Entries—then whisper the checklist directly to the owning player with one click.
- **Inline Character Sheet Guides:** Displays native parchment guides directly on the Character, Skills, Spellcasting, and Feats tabs showing expected Trained Skills (Class/Dual Class + Background + Overlap + INT), Skill Increases (including Rogue/Investigator fast progression), Languages, and empty Feat slots.
- **One-Click Spellcasting Entry Creator & Slot Sync:** Detects both slot-based and Focus spellcasting feats from Primary Class, Dual Class, and Multiclass/Free Archetype dedications (Basic, Expert, Master, Breadth, Divine Font, Arcane School, Flexible Spellcaster, Animist Prepared + Apparition, Impossible Magic 2-slot Magus, Summoner, and Necromancer progressions, plus Focus entries like Champion Devotion Spells, Magus Conflux Spells, Bard Composition Spells, Cleric Domain Spells, Druid Order Spells, Monk Qi Spells, Ranger Warden Spells, and Blessed One), creates properly configured PF2e spellcasting entries with exact level-scaled slots, and syncs slot counts on level-up without erasing prepared spells.

---

## Quick Access & Keybindings

| Utility | Scene Control Layer | Sidebar Location | Default Keybinding |
| :--- | :--- | :--- | :--- |
| Music & SFX Sound Pad | Playlists (Sounds) / GM Utilities | Playlists Directory Header | Shift + M |
| Session Scene Switcher | Scenes (Navigation) / GM Utilities | Scenes Directory Header | Shift + S |
| Resource & Subsystem Tracker | GM Utilities Layer | GM Utilities Palette | Shift + R |
| Floating Trackers HUD | Token Controls / Utilities | Toolbar Button (GM & Players) | Shift + H (GM & Players) |
| Party Placement Tool | GM Utilities Layer | None | Macro / Control Button |
| Place Scene Link Pin | GM Utilities Layer | Canvas Drag & Drop | Macro / Control Button |
| AP Journal Editor & Styler | GM Utilities Layer | ProseMirror Editor Toolbar | Feather Icon on Toolbar |
| PF2e Character Completeness Checker | GM Utilities Layer | Character Sheet Guides & Checklist Button | Macro / Control Button |
| Performance Checker (GM Only, Opt-In) | GM Utilities Layer (GM only, when enabled) | None (Enable in Module Settings) | Shift + P (GM only, when enabled) |

---

## Documentation & Wiki

For comprehensive usage guides, configuration settings, drag-and-drop workflows, macro setup, and developer API references, read the [Full Wiki & Reference Guide](file:///c:/Users/joshu/source/repos/Pf2eAwesomeGmUtilities/WIKI.md).

---

## Support & Attribution

If you find this module helpful and wish to support continued development, you can support me on Patreon:  
https://patreon.com/AeneasPF2e

**Author:** Aeneas (Joshua Elander)  
**System:** Pathfinder 2nd Edition (PF2e)  
**Foundry VTT Compatibility:** Version 14+
