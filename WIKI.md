# PF2e Awesome GM Utilities - Comprehensive Wiki & Reference Guide

Welcome to the complete documentation for **PF2e Awesome GM Utilities**, an all-in-one suite of GM tools, floating widgets, and rich styling enhancements designed specifically for **Pathfinder 2e** running on **Foundry Virtual Tabletop (v14+)**.

---

## Table of Contents
1. [Core Architecture & General Workflow](#1-core-architecture--general-workflow)
2. [Music & SFX Sound Pad](#2-music--sfx-sound-pad)
3. [Session Scene Switcher](#3-session-scene-switcher)
4. [Resource & Subsystem Tracker](#4-resource--subsystem-tracker)
5. [Floating Trackers HUD Widget](#5-floating-trackers-hud-widget)
6. [Party Placement Tool](#6-party-placement-tool)
7. [Interactive Map Pins & Scene Links](#7-interactive-map-pins--scene-links)
8. [Advanced Journal Editor & AP Styler](#8-advanced-journal-editor--ap-styler)
9. [Module Settings & Configuration](#9-module-settings--configuration)
10. [Macro & Developer JavaScript API](#10-macro--developer-javascript-api)

---

## 1. Core Architecture & General Workflow

All tools in this suite are built using Foundry's modern **ApplicationV2** framework and vanilla CSS design systems. They are designed to keep the GM in total control without disrupting player immersion.

### Key Ergonomic Principles
- **Multi-Access Design:** Every tool can be opened via the left **Scene Controls** bar (under the dedicated PF2e GM Utilities layer), the relevant directory headers (Playlists, Scenes), configurable keyboard shortcuts, or auto-synced macros.
- **Detached & Non-Blocking:** Dialogs and windows float independently over the canvas. You can interact with map tokens, read journal sheets, or roll dice while keeping the utilities open.
- **Smart Drag-and-Drop:** Native HTML5 drag-and-drop is supported across the suite. Drag playlists onto audio slots, drag scenes onto the session planner, drag monster abilities into affliction trackers, and drag adventure cards directly into open journals.
- **Real-Time Client Synchronization:** Features designed for player visibility (such as the Floating Trackers HUD) utilize low-latency WebSocket events to sync states instantaneously across all connected clients.

---

## 2. Music & SFX Sound Pad

The **Music & SFX Sound Pad** is an MPC / Stream Deck style audio trigger board built natively for Foundry VTT. It solves the frustration of searching through cluttered playlist sidebars during tense encounters.

### 2.1 Soundboard Layout
- **Master Audio Bar (Top):**
  - **Master Volume Slider:** Adjusts overall volume output for sounds triggered from the pad.
  - **Master Mute:** Instantly mutes or unmutes all sound pad playback.
  - **Panic: Stop All Button:** Fades out and immediately stops every sound currently playing across the entire soundboard.
- **Bank Tabs:**
  - Preloaded with four standard banks: **Combat**, **Ambience**, **Tavern & Town**, and **SFX**.
  - **Add Bank:** Create unlimited additional tabs for specific campaigns, dungeons, or story arcs.
  - **Bank Management:** Click the gear icon on any bank to rename or delete it.
- **Sound Slots (Grid):**
  - 12 tactile trigger pads per bank (expandable as needed).
  - Slots display custom labels, icons, playback status badges, and color themes.
- **Active Track Playback Dock (Bottom):**
  - Displays the currently playing track name and soundboard bank.
  - **Track Scrubber:** Live timeline showing current progress and track duration. Click anywhere on the scrubber bar to seek instantly.
  - **Skip Buttons:** Skip backward 10 seconds or forward 10 seconds.
  - **Individual Volume Slider:** Fine-tune the active track volume independently.
  - **Stop Button:** Halts the currently active track.

### 2.2 Playback Modes
Each sound pad slot can be configured with one of four playback behaviors:
1. **Looping Music (BGM):** Loops continuously until manually stopped or crossfaded by another track.
2. **Toggle (Play/Stop):** Clicking starts playback; clicking again stops playback.
3. **One-Shot (SFX):** Plays the sound once from beginning to end and automatically resets to idle. Ideal for sword clashes, thunderclaps, tavern laughs, or magical explosions.
4. **Restart on Press:** Re-triggers the audio sample from the start with every press.

### 2.3 Private GM Audition / Sampling Mode (Headphone Mode)
- **The Problem:** GMs often need to verify whether a track has vocals, check the sound balance, or preview music before introducing a villain, without giving away surprises to the players.
- **The Workflow:**
  1. Click the **Headphone** icon on any slot.
  2. The track plays **privately in the GM's browser only** via a local HTML5 audio element. No sound is emitted to connected players.
  3. The active player dock highlights in purple with a **"Sampling (Private GM Preview)"** badge.
  4. When you are ready to reveal the scene to your table, click the **"Go Live!"** button on the player dock. The track seamlessly transfers into a world-broadcast sound that everyone hears.

### 2.4 Drag-and-Drop Track Mapping
- Open Foundry's **Playlists** sidebar directory.
- Drag any single sound track (or an entire playlist) and drop it onto any slot in the Sound Pad.
- The slot automatically configures its name, audio file path, playlist ID, and sound ID.

### 2.5 Auto-Stop Other Music (Crossfading)
- In the module settings, enable **Auto-Stop Other Music**.
- When you click a new music track (Loop or Toggle mode), the previously playing background track will smoothly fade out over the configured fade duration (default: 1.5 seconds) while the new track takes over.

---

## 3. Session Scene Switcher

The **Session Scene Switcher** is a dedicated prep and play dashboard that curates only the maps planned for your upcoming session, eliminating endless scrolling through large world scene directories.

### 3.1 Curating the Session Queue
- **Drag-and-Drop:** Drag scenes from Foundry's Scenes sidebar or top navigation bar directly into the Scene Switcher window.
- **Add Current Scene:** Click the plus button to immediately add whichever canvas you are currently viewing.
- **Import Navigated Scenes:** Imports all scenes currently pinned to Foundry's top navigation bar with one click.
- **Dropdown Selector:** Quickly pick from any unlisted world scene via a built-in search dropdown.
- **Persistent Storage:** Your session queue is stored in world settings and remains saved between GM logins.

### 3.2 Scene Actions
Every scene card in your session list provides instant controls:
- **View Scene:** Switches the GM's canvas to inspect the map, tokens, lighting, or notes privately. Players remain on their current scene undisturbed.
- **Activate Scene:** Activates the map globally in Foundry, loading it for all connected players.
- **Pull Players:** Emits a socket signal to force-pull all connected player viewports to this scene immediately.
- **Activate & Pull:** Activates the scene and pulls all players in a single synchronized click.
- **Day / Night Quick Toggle:** Click the lighting badge on any card to flip the scene darkness level between daylight (0.0) and dark night (0.85) without opening the scene configuration sheet.
- **Reorder & Remove:** Use up/down buttons to match your intended story progression, or remove completed maps from your session queue without deleting the scene document.

### 3.3 Active Scene Banner
The top banner highlights the world's currently active scene, indicates whether combat is active, shows token counts, and provides a prominent **"Pull All Players Here"** button.

---

## 4. Resource & Subsystem Tracker

The **Resource & Subsystem Tracker** provides flexible, tactile tracking for shared party consumables, PF2e Victory Point subsystems, radial tension clocks, and multi-stage character afflictions.

### 4.1 Party Consumables & Supplies
- Track shared supplies such as **Rations / Food**, **Clean Water**, **Camping Supplies**, **Torches**, or **Ammunition**.
- Use quick tactile buttons: `+1`, `-1`, `+5`, `-5`, or double-click the number to type an exact value.
- Configurable minimums, maximum capacity limits, and custom warning thresholds.

### 4.2 PF2e Subsystem Radial Clocks & Victory Points
- **Progress Clocks:** Authentic radial segmented clocks supporting **4, 6, 8, 10, or 12 slices**.
- **Interactive Clicking:** Click directly on any radial slice or pip to set the clock to that specific value instantly. Clicking the currently filled slice steps it down by one.
- **Victory Points (VP):** Horizontal progress meters with fraction readouts, perfect for Infiltration, Chases, Research, and Influence subsystems.
- **Countdown Doom Timers:** Switch clocks to count down from target to zero (e.g. ritual countdowns, dungeon collapse timers, or escalating castle alerts).

### 4.3 Character-Linked Trackers & Sanity Meters
- Link any tracker directly to a player character actor in your world.
- Displays the actor's official portrait avatar and name badge.
- Perfect for tracking individual character Sanity, Stress, Focus Points, or persistent conditions.

### 4.4 Dynamic Affliction Stages (Diseases, Poisons & Curses)
- Dedicated affliction progression layout supporting anywhere from **1 to 6+ stages** (e.g. *Ghast Fever*, *Mummy Rot*, *Arsenic*).
- Displays Save DC (Fortitude or Reflex), traits, onset delay, custom stage symptoms, damage values, and cure requirements.
- Step through stages during recovery or degradation with one click.

### 4.5 Intelligent Stat Block Parser (Drag & Drop or Text Paste)
- **Compendium & Sheet Drag:** Drag **any** monster ability or affliction item directly from an NPC stat block or compendium into the tracker window.
- The parser automatically cleans formatting tags, extracts the disease name, Save DC, Onset, and all numbered stages into the tracker card.
- **Text Import Tool:** Click **"Import Affliction"** and paste raw text copied from PDFs or stat blocks; the parser handles the extraction automatically.

### 4.6 Chat Status Broadcasting
Click the chat bubble button on any tracker card to post a formatted PF2e chat card displaying the current count, clock pips, or active affliction stage to the game chat log.

---

## 5. Floating Trackers HUD Widget

The **Floating Trackers HUD Widget** is a compact, translucent overlay designed to sit on your game screen for at-a-glance monitoring.

### 5.1 Player Visibility & Tension
- Every tracker in your master tracker list has an **Eye** toggle button.
- Toggling the eye icon makes that tracker **visible to connected players** on their screens.
- Ideal for countdown timers, party sanity meters, heist alert levels, or doom clocks that you want your players to watch in suspense.

### 5.2 Real-Time Socket Synchronization
- Whenever the GM adjusts a value on the master panel or the HUD, a socket event updates all connected player screens immediately with zero latency.

### 5.3 HUD Interface Features
- **Mini Radial Clocks:** Displays authentic SVG donut clocks and mini progress bars.
- **Collapsible Header:** Click the minimize icon to collapse the HUD into a sleek title tab when screen space is needed.
- **Draggable & Persistent:** Freely drag the widget anywhere on your screen. Window position and collapsed states are saved per user.
- **Player Access & Show/Hide Controls:** Connected players have full control over opening and closing their HUD view:
  - **Toolbar Button:** A dedicated Trackers HUD button is available on the left sidebar controls (both in their active Token Controls rail and the dedicated PF2e Trackers group).
  - **Quick Keybinding:** Pressing `Shift + H` toggles the HUD on or off for both GMs and players.
  - **Persistent Session State:** If a player closes the HUD with the close (`X`) button, it stays closed during their session and will not intrusively pop back open during combat or tracker adjustments until they decide to reopen it.
- **Reset Position:** If the widget is moved off-screen, click the reset position button in the header or use the API call `game.pf2eAwesomeGmUtilities.resourceWidget.resetPosition()` to return it under the left menu.

---

## 6. Party Placement Tool

The **Party Placement Tool** teleports and arranges the entire adventuring party onto any scene with a single click.

### 6.1 How It Works
1. Trigger the tool via the **PF2e GM Utilities** scene controls palette or the **Place Party Formation** macro.
2. The tool automatically detects all active player characters currently assigned to the party.
3. Click anywhere on the canvas.
4. All party tokens are instantly summoned to that coordinate, aligned neatly to the scene's grid in a compact formation centered on your cursor.
5. Tokens not currently present on the scene are spawned automatically from the Actor directory; existing tokens are relocated smoothly.

---

## 7. Interactive Map Pins & Scene Links

Interactive Map Pins connect world maps, regional overland charts, and town diagrams directly to their underlying battle maps.

### 7.1 Creating Scene Link Pins
- **Canvas Drag-and-Drop:** Drag any scene document from Foundry's Scenes sidebar directly onto the canvas. A map pin is created at that point, linked to the dropped scene.
- **Macro Placement:** Run the **Place Scene Link Pin** macro to open an interactive picker, choose a scene, and click the canvas to plant the pin.
- **Custom Map Pin Notes:** Right-click any existing journal map pin to select a linked scene from the drop-down menu in the Note Configuration dialog.

### 7.2 Navigation & Transition
- Double-clicking (or single-clicking, if enabled in settings) a scene pin opens an instant transition menu:
  - **View Scene:** Takes the GM to inspect the destination scene privately.
  - **Activate Scene:** Activates the destination scene for all players.
  - **Cancel:** Dismisses the menu.
- **Journal Links:** When scenes are linked inside journal entries using the AP Editor cards, clicking the map name link directly opens the Scene Transition panel to view, activate, or configure the scene.

---

## 8. Advanced Journal Editor & AP Styler

The **Advanced Journal Editor & AP Styler** brings official Paizo Adventure Path formatting into Foundry's built-in ProseMirror editor.

### 8.1 Accessing the Styler
- **Editor Toolbar:** Click the **Feather** icon on the ProseMirror editor toolbar when editing any journal page.
- **GM Utilities Layer:** Click the **AP Journal Styler** button on the left scene controls palette.
- **Native Inserts Dropdown:** Browse pre-configured templates under the native ProseMirror inserts menu group.

### 8.2 Adventure Path Templates Catalog
- **Read-Aloud (Boxed Text):** Off-white parchment styling with crimson accent borders and italicized narrative text for boxed room descriptions.
- **GM Callout Boxes:**
  - **Treasure / Loot:** Golden amber accents for hidden chests, magic items, and coin rewards.
  - **Tactics / Combat:** Crimson accents for enemy behavior, morale triggers, and positioning tips.
  - **Hazards & Traps:** Vivid orange accents for hazard triggers, disable DCs, and reset conditions.
  - **Investigation & Clues:** Blue accents for Recall Knowledge DCs, library searches, and NPC evidence.
  - **XP Award:** Emerald green accents for milestone accomplishments and bonus quest rewards.
  - **Secret / Lore:** Purple accents for GM-only world lore, foreshadowing, and plot twists. Features PF2e's native **GM Text Inline** (`<span data-visibility="gm">`) so that sensitive text is strictly hidden from players.
  - **GM Text Inline & GM Text Block:** Dedicated templates inserting PF2e's native inline (`<span data-visibility="gm">`) and block (`<div class="pf2e-gm-block" data-visibility="gm">`) markup, rendering with the signature dashed border for GMs while remaining completely invisible to players.
- **Layouts & Structures:**
  - **Two-Column Responsive Layout:** Organizes text into balanced side-by-side columns that stack cleanly on smaller screens.
  - **Encounter Summary Header:** Header blocks displaying threat levels, party level targets, and environmental hazards.

### 8.3 Entity & Scene Linker Cards
Generate rich, clickable display cards for documents in your world:
- **Battle Map Cards:** Features map thumbnail art, navigation title, lighting summary, and an enriched `@UUID` document link that opens the Scene Transition menu on click.
- **Creature Roster Cards:** Features actor portrait avatar, level badge, trait pills, AC, HP, and Perception modifiers.
- **Item & Loot Cards:** Features item image, level badge, price in gold pieces, rarity tag, and concise description summaries.
- **Inline Links:** Standard `@UUID[...]` links with clean enriched names.

### 8.4 Skill Checks & DC Tables
- Select any of the 16 PF2e skills, Perception, or saving throws (Fortitude, Reflex, Will).
- Set the target Difficulty Class (DC) and optional traits (e.g. *secret*, *exploration*).
- Choose output format:
  - **4-Degree Results Table:** Formatted table with distinct colored row badges for Critical Success, Success, Failure, and Critical Failure.
  - **Inline Enricher:** Compact inline tag such as `@Check[athletics|dc:20]`.

### 8.5 Drag-and-Drop Publishing & Insertion
- **Drag from Preview:** Click and drag the **"Drag to Journal"** handle (or the live preview container itself) directly into an open journal editor to place the formatted card at your cursor.
- **Drag from Lists:** Individual template items and entity search results can also be dragged directly into journals.
- **Insert Button:** Click **Insert into Journal** to insert content directly into your active editor at your current cursor position. If the journal is in HTML source mode, the HTML code is inserted into the textarea.

---

## 9. Module Settings & Configuration

Access module settings via **Game Settings &rarr; Configure Settings &rarr; PF2e Awesome GM Utilities**:

| Setting Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **Auto-Stop Other Music** | Boolean | `true` | Automatically fades out existing soundboard background music when triggering a new music track. |
| **Default Fade Duration** | Number | `1.5` | Crossfade duration in seconds between soundboard music tracks. |
| **Sound Pad Opacity** | Number | `95` | Window opacity percentage for the Sound Pad so the canvas remains visible underneath. |
| **Scene Switcher Opacity** | Number | `95` | Window opacity percentage for the Scene Switcher window. |
| **Resource Tracker Opacity** | Number | `95` | Window opacity percentage for the Resource Tracker window. |
| **Auto-Sync GM Utilities Macros** | Boolean | `true` | Automatically creates ready-to-use macros in the `PF2e Awesome GM Utilities` macro directory folder. |
| **Scene Link Default Action** | Choice | `Prompt Dialog` | Choose default behavior when clicking map pins: `Prompt Dialog`, `View Scene (GM Only)`, or `Activate Scene`. |
| **Default Map Pin Icon** | Text | Castle icon | Default icon path applied when dragging a scene onto the map to create a pin. |
| **Single-Click Map Pin Transition** | Boolean | `false` | When enabled, single-clicking a scene map pin transitions immediately rather than requiring a double-click. |

---

## 10. Macro & Developer JavaScript API

All utilities expose comprehensive JavaScript methods under `game.pf2eAwesomeGmUtilities` for macro creation, stream deck integrations, and custom module hooks.

### 10.1 Sound Pad API
```javascript
// Toggle Sound Pad window
game.pf2eAwesomeGmUtilities.soundPad.toggle();

// Stop all soundboard audio immediately
game.pf2eAwesomeGmUtilities.soundPad.stopAll();

// Seek active track to 45 seconds
game.pf2eAwesomeGmUtilities.soundPad.seek(45);

// Skip active track forward (+) or backward (-) in seconds
game.pf2eAwesomeGmUtilities.soundPad.skip(10);
game.pf2eAwesomeGmUtilities.soundPad.skip(-10);

// Set master soundboard volume (0.0 to 1.0)
game.pf2eAwesomeGmUtilities.soundPad.setVolume(0.8);
```

### 10.2 Scene Switcher API
```javascript
// Toggle Scene Switcher window
game.pf2eAwesomeGmUtilities.sceneSwitcher.toggle();

// View a scene privately as GM
game.pf2eAwesomeGmUtilities.sceneSwitcher.view("sceneId123");

// Activate a scene globally for all players
game.pf2eAwesomeGmUtilities.sceneSwitcher.activate("sceneId123");

// Force-pull all player viewports to a scene
game.pf2eAwesomeGmUtilities.sceneSwitcher.pull("sceneId123");

// Activate and pull players in one call
game.pf2eAwesomeGmUtilities.sceneSwitcher.activateAndPull("sceneId123");

// Add a scene to the session queue by ID
game.pf2eAwesomeGmUtilities.sceneSwitcher.addScene("sceneId123");

// Remove a scene from the session queue
game.pf2eAwesomeGmUtilities.sceneSwitcher.removeScene("sceneId123");
```

### 10.3 Resource Tracker & HUD API
```javascript
// Toggle full Resource Tracker master panel
game.pf2eAwesomeGmUtilities.resourceTracker.toggle();

// Adjust tracker value by delta (+/-)
game.pf2eAwesomeGmUtilities.resourceTracker.adjust("trackerId123", -1);
game.pf2eAwesomeGmUtilities.resourceTracker.adjust("trackerId123", 5);

// Set an exact tracker value
game.pf2eAwesomeGmUtilities.resourceTracker.setValue("trackerId123", 4);

// Reset a tracker to its default starting value
game.pf2eAwesomeGmUtilities.resourceTracker.reset("trackerId123");

// Broadcast tracker status card to chat
game.pf2eAwesomeGmUtilities.resourceTracker.postToChat("trackerId123");

// Toggle the Floating Trackers HUD widget
game.pf2eAwesomeGmUtilities.resourceWidget.toggle();

// Reset the HUD position to center of screen
await game.pf2eAwesomeGmUtilities.resourceWidget.resetPosition();
```

### 10.4 Party Placement API
```javascript
// Trigger party placement on the active canvas
game.pf2eAwesomeGmUtilities.placeParty();
```

### 10.5 Map Pin & Scene Link API
```javascript
// Open scene pin placement picker
game.pf2eAwesomeGmUtilities.placeSceneLink();

// Place a pin for a specific scene directly
game.pf2eAwesomeGmUtilities.placeSceneLink({ sceneId: "sceneId123" });
```

### 10.6 Journal Styler API
```javascript
// Open AP Journal Styler dialog
game.pf2eAwesomeGmUtilities.journalEditor.open();
```
