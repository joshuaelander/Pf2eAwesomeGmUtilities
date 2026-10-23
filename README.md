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
- **Journal Integration:** Scene links embedded inside journal entries provide direct buttons to view or activate linked battle maps.

### 6. Advanced Journal Editor & AP Styler
A publishing and styling toolkit integrated into Foundry's ProseMirror journal editor.
- **Adventure Path Layout Templates:** Insert pre-styled narrative elements including Read-Aloud boxed text, GM Callouts (Treasure, Tactics, Hazards, Investigation, XP Awards, Secrets), and multi-column responsive sections.
- **Entity & Scene Link Cards:** Insert rich interactive cards for battle maps (with live View and Activate buttons), creature rosters (portraits, levels, AC, HP, Perception), and item loot cards.
- **Skill Check Tables:** Generate formatted DC tables with all four degrees of success (Critical Success, Success, Failure, Critical Failure) or compact inline check tags.
- **Drag-and-Drop Publishing:** Drag formatted cards or templates directly from the utility window into open journal pages at your cursor position.

---

## Quick Access & Keybindings

| Utility | Scene Control Layer | Sidebar Location | Default Keybinding |
| :--- | :--- | :--- | :--- |
| Music & SFX Sound Pad | Playlists (Sounds) / GM Utilities | Playlists Directory Header | Shift + M |
| Session Scene Switcher | Scenes (Navigation) / GM Utilities | Scenes Directory Header | Shift + S |
| Resource & Subsystem Tracker | GM Utilities Layer | GM Utilities Palette | Shift + R |
| Floating Trackers HUD | GM Utilities Layer | GM Utilities Palette | Shift + H |
| Party Placement Tool | GM Utilities Layer | None | Macro / Control Button |
| Place Scene Link Pin | GM Utilities Layer | Canvas Drag & Drop | Macro / Control Button |
| AP Journal Editor & Styler | GM Utilities Layer | ProseMirror Editor Toolbar | Feather Icon on Toolbar |

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
