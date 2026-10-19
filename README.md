# PF2e Awesome GM Utilities

A comprehensive suite of widgets, utilities, and UI enhancements designed to make running **Pathfinder 2e** games on **Foundry VTT (v14)** faster, smoother, and more intuitive for Game Masters.

---

## Music & SFX Sound Pad

The first utility in this suite is the **Music & SFX Sound Pad** — an MPC / Stream Deck style audio trigger board built natively for Foundry VTT v14.

### Key Features

1. **Detachable, Floating Soundboard (v14 Standard)**

2. **Instant One-Click Playback & Stop**

3. **Seek & Skip Ahead**

4. **Private GM Audition / Sampling Mode (Headphone Icon)**
   - Need to preview songs before your players enter a room or test sound balance before a session without alerting players?
   - Ready to drop the beat on your party? Hit the **"Go Live!"** button on the player dock to instantly broadcast that auditioned song to everyone in the world!

5. **Drag-and-Drop Mapping**
   - Simply drag any `PlaylistSound` or whole `Playlist` from Foundry's Playlists sidebar and drop it onto any slot!
   - Automatically imports the track name, playlist ID, sound ID, and audio path.

6. **Multi-Tab Organization & Customization**
   - Comes preloaded with 4 ready-to-use sections:
     - **Combat**
     - **Ambience**
     - **Tavern & Town**
     - **SFX**
   - Add, rename, reorder, or delete custom banks for specific campaigns or adventures.
   - Customize slot color themes (Crimson, Gold, Amber, Forest Nature, Ocean Blue, Arcane Violet, Shadow Slate, Inferno Fire).
   - Configure playback mode: **Looping Music (BGM)**, **Toggle (Play/Stop)**, **One-Shot (SFX)**, or **Restart on Press**.

7. **Volume Management & Crossfading**
   - Master soundboard volume slider with quick mute.
   - Individual track volume slider on the active dock.
   - Optional **Auto-Stop Other Music**: Automatically fades out previous background music when triggering a new music track.

8. **Convenient GM Access**
   - **Scene Controls**: Quick-launch button and Panic Stop tool under the Playlists (Sounds) control layer.
   - **Playlists Sidebar**: Direct "Sound Pad" button in the Playlists directory header.
   - **Keybinding**: Press `Shift + M` to toggle the Sound Pad at any time.
   - **Smart Macro Sync**: Automatically creates ready-to-use macros in the `PF2e Awesome GM Utilities` macro folder.

---

## Session Scene Switcher

The second utility in this suite is the **Session Scene Switcher** — a dedicated prep & play dock for Game Masters to curate, navigate, and manage the scenes planned for the current game session.

### Key Features

1. **Curated Session Scenes List**
   - Save only the scenes you expect to use during the session, eliminating constant scrolling through massive world scene folders.
   - Preserved in persistent world settings so your session plan is ready whenever you log in.

2. **One-Click Scene Transitions**
   - **View Scene**: Instantly switches the GM's canvas to inspect the scene, tokens, notes, or fog privately without moving or disturbing players.
   - **Activate Scene**: Activates the scene globally in Foundry for all players.
   - **Pull Players**: Emits a socket signal to force-pull all connected player clients to the scene immediately.

3. **Active Scene Quick Banner**
   - High-contrast banner at the top showing the world's currently active scene, active combat/token indicators, and a one-click **"Pull All Players Here"** button.

4. **Day / Night Lighting Quick Toggle**
   - Interactive badge on each scene card (`☀️ Day` / `🌙 Night (85%)`) that instantly flips scene darkness between daylight (`0.0`) and darkness (`0.85`) without opening scene sheets.

5. **Instant Drag-and-Drop & Quick Add**
   - Drag any scene from Foundry's Scenes directory sidebar or navigation bar and drop it directly onto the window to add it to your session plan.
   - One-click buttons to **"Add Current Scene"** or **"Import Navigated Scenes"**.
   - Built-in dropdown selector to add unlisted scenes with a single click.

6. **Order & Organization**
   - Reorder cards up or down to match your adventure's expected storyline or dungeon progression.
   - Quick gear button to open Foundry's standard Scene Configuration sheet.
   - Remove or Clear session list without deleting any world scenes.

7. **Convenient GM Access**
   - **Scene Controls**: Quick-launch button under the Scenes (Navigation) control layer and the `PF2e GM Utilities` layer.
   - **Scenes Sidebar**: Direct "Scene Switcher" button in the Scene Directory header.
   - **Keybinding**: Press `Shift + S` to toggle the Scene Switcher at any time.
   - **Smart Macro Sync**: Automatically creates a ready-to-use "PF2e Scene Switcher" macro in your macro directory.

---

## Resource & Subsystem Tracker

The third utility in this suite is the **Resource & Subsystem Tracker** — a versatile, floating ApplicationV2 control panel for tracking party supplies, complex subsystem clocks, and character afflictions.

### Key Features

1. **Party & Campaign Resources**
   - Track party consumables such as **Food / Rations**, **Potable Water**, **Camp Supplies**, torches, and ammunition.
   - Increment or decrement with quick `+1`, `-1`, `+5`, `-5` tactile buttons.
   - Configurable minimums and maximum capacity limits.

2. **PF2e Subsystems & Radial Clocks**
   - **Victory Points (VP)**: Progress bars for Heists, Infiltration, Research, and Chases.
   - **Segmented Clocks**: Authentic radial circular clocks (4, 6, 8, 10, or 12 slices) inspired by Blades in the Dark and PF2e subsystem rules.
   - **Interactive Slice Clicking**: Click directly on any clock slice or pip to set the clock value instantly, or click the current slice to toggle it back down.
   - **Count Up vs Count Down**: Switch between progress meters (0 &rarr; Target) and countdown clocks (Target &rarr; 0, e.g. ritual countdowns, doom timers).

3. **Per-PC Tracking & Affliction Stages (1–6+)**
   - **Linked Characters**: Link any tracker directly to a player character actor, displaying their portrait avatar and name badge.
   - **Sanity / Stress Meters**: Track mental fortitude against cosmic horror and eldritch hazards.
   - **Dynamic Affliction Stages (1–6+)**: Dedicated graduated stage layout supporting anywhere from 1 to 6+ stages (e.g. *Ghast Fever* with 6 stages, or simple poisons with 3 stages) with custom symptom effects, damage values, and cure DC reminders.
   - **Monster Ability & Compendium Drag & Drop**: Drag **any** Affliction or monster ability (e.g. *Ghast Fever*, *Ghoul Fever*, *Mummy Rot*, *Arsenic*) directly from monster sheets or compendiums onto the window! The intelligent parser extracts official art, cleans unformatted tags (`@Check`, `@Damage`), extracts Save DC, Onset, and populates all stages automatically.
   - **Quick Import / Paste Text**: Click **"Import Affliction"** or use the in-dialog paste tool to paste raw text from monster stat blocks, chat messages, or PDFs. The parser automatically extracts the name, Fortitude/Reflex DC, Onset, and all numbered stages!

4. **Rich Customization & FontAwesome / Foundry Icons**
   - Clean, reliable **FontAwesome** vector icons by default (`fa-solid fa-bread-slice`, `fa-solid fa-droplet`, `fa-solid fa-campground`, `fa-solid fa-trophy`, `fa-solid fa-bell`, `fa-solid fa-biohazard`, etc.) that never break or fail to load.
   - Choose custom graphics or core Foundry icons via Foundry's native image `FilePicker`.
   - 8 curated color themes (Pathfinder Gold, Crimson, Amber, Forest Nature, Ocean Blue, Arcane Violet, Shadow Slate, Inferno Fire).
   - Built-in quick presets: Rations, Water, Camp Supplies, Victory Points, Alert Clock, Ritual Doom Clock, Sanity, and Generic Affliction.

5. **Floating Trackers HUD Widget (Player-Visible Live Overlay)**
   - Pin any tracker to a compact, non-intrusive floating overlay that sits on your game screen.
   - **Player Visibility Option**: Toggle the eye icon on any tracker to make it visible to connected players! Perfect for countdown timers, doom clocks, party sanity, infiltration VP meters, or castle alert levels that you want the whole table to watch in suspense.
   - **Live Real-Time Synchronization**: Any GM value adjustment immediately re-renders the HUD on all player screens with zero latency.
   - **Sleek HUD Aesthetics**: Features glowing borders, mini SVG donut clocks, progress bars, and collapsible header mode.
   - **Draggable & Persistent**: Freely drag the widget anywhere on screen; position and collapsed state are remembered per user.

6. **Post Status to Chat**
   - Click the chat bubble on any tracker card to immediately broadcast a beautifully formatted PF2e chat card to all players, displaying the current value, clock pips, or active affliction stage!

7. **Convenient GM & Player Access**
   - **Scene Controls**: Dedicated buttons for the Resource Tracker and Floating Trackers HUD in the `PF2e GM Utilities` control bar.
   - **Keybindings**:
     - Press `Shift + R` to toggle the full Resource Tracker window.
     - Press `Shift + H` to toggle the Floating Trackers HUD widget.
   - **Smart Macro Sync**: Automatically creates macros for both the Resource Tracker and Floating HUD in your macro folder.

---

## API & Macro Usage

Developers and GMs can control all utilities directly via macros or chat:

```javascript
// --- SOUND PAD ---
game.pf2eAwesomeGmUtilities.soundPad.toggle();
game.pf2eAwesomeGmUtilities.soundPad.stopAll();
game.pf2eAwesomeGmUtilities.soundPad.seek(45);
game.pf2eAwesomeGmUtilities.soundPad.skip(15);

// --- SCENE SWITCHER ---
game.pf2eAwesomeGmUtilities.sceneSwitcher.toggle();
game.pf2eAwesomeGmUtilities.sceneSwitcher.view("sceneId123");
game.pf2eAwesomeGmUtilities.sceneSwitcher.activate("sceneId123");
game.pf2eAwesomeGmUtilities.sceneSwitcher.pull("sceneId123");
game.pf2eAwesomeGmUtilities.sceneSwitcher.activateAndPull("sceneId123");

// --- RESOURCE TRACKER & FLOATING HUD ---
game.pf2eAwesomeGmUtilities.resourceTracker.toggle();
game.pf2eAwesomeGmUtilities.resourceTracker.adjust("tracker-food", -1);
game.pf2eAwesomeGmUtilities.resourceTracker.setValue("tracker-alert", 4);
game.pf2eAwesomeGmUtilities.resourceTracker.postToChat("tracker-alert");

// Toggle or sync the Floating HUD Widget
game.pf2eAwesomeGmUtilities.resourceWidget.toggle();
game.pf2eAwesomeGmUtilities.resourceWidget.sync();
```

---

## Roadmap & Upcoming Utilities

- [x] **Music & SFX Sound Pad with Seeking and Sampling**
- [x] **Session Scene Switcher with Quick View, Activate, and Pull**
- [x] **Resource & Subsystem Tracker for Supplies, Clocks, and Afflictions**
- [ ] **Unified GM Master Control Panel** (condensed tabbed / docked panel embedding Sound Pad, Scene Switcher, and Resource Tracker)
- [ ] **Scene Transition & Environment Switcher**: Quick atmosphere shifts combining lighting, weather, and sound presets.
- [ ] **Enhanced GM Shop & Merchant UI**: Streamlined buying/selling interface for PF2e settlements.
- [ ] **Encounter Reward & Loot Distributor**: One-click distribution of XP and loot cards.

---

If you'd like you can help support me over on Patreon to see this and many other fun tools, maps, etc related to PF2e. Linked here: https://patreon.com/AeneasPF2e

Author: Aeneas (Joshua Elander)

Disclaimer: All code here is the work of and belongs to the author. I hereby give you permission to use it by importing it into foundry vtt and using it with PF2e. However, if you wish to fork or use this code in your own code, please request permission to use this code first. The user acknowledge that all work here is on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

