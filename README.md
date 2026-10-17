# PF2e Awesome GM Utilities

A comprehensive suite of widgets, utilities, and UI enhancements designed to make running **Pathfinder 2e** games on **Foundry VTT (v14)** faster, smoother, and more intuitive for Game Masters.

---

## Music & SFX Sound Pad

The first utility in this suite is the **Music & SFX Sound Pad** — an MPC / Stream Deck style audio trigger board built natively for Foundry VTT v14.

### Key Features

1. **Detachable, Floating Soundboard (v14 Standard)**
   - Fully detachable and movable to any part of your screen or secondary monitor.
   - **Compact / Live Mode**: Strip away configuration clutter during game time into a tight, responsive soundboard grid that sits neatly next to your GM screen or encounter tracker.
   - **Window Opacity Setting**: Adjust transparency from 40% to 100% so you can see map tokens and active initiative underneath.

2. **Instant One-Click Playback & Stop**
   - Click any pad to trigger or stop a song/sound.
   - Real-time animated audio equalizer bars and color-coded pulsing aura indicate which track is currently playing.
   - Built-in **Panic Button**: Instantly stops/fades all currently playing sounds with a single click.

3. **Seek & Skip Ahead (Timeline Scrubber)**
   - Includes an interactive timeline scrubber (`01:24 / 03:45`) on the active track dock!
   - Drag the slider or use the `+10s` / `-10s` buttons to skip ahead directly to the intense part of a combat theme or audition tracks.
   - Works with Foundry's audio streaming containers and restarts smoothly at target offsets.

4. **Private GM Audition / Sampling Mode (Headphone Icon)**
   - Need to preview songs before your players enter a room or test sound balance before a session without alerting players?
   - Click the **Headphone icon** on any slot: the audio plays **privately on your client only**.
   - Features zero-latency instant scrubbing through any part of the track.
   - Ready to drop the beat on your party? Hit the **"Go Live!"** button on the player dock to instantly broadcast that auditioned song to everyone in the world!

5. **Drag-and-Drop Mapping**
   - Simply drag any `PlaylistSound` or whole `Playlist` from Foundry's Playlists sidebar and drop it onto any slot!
   - Automatically imports the track name, playlist ID, sound ID, and audio path.

6. **Multi-Bank Organization & Customization**
   - Comes preloaded with 4 ready-to-use banks:
     - **Combat & Boss**
     - **Ambience & Nature**
     - **Tavern & Town**
     - **SFX & Stingers**
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

## API & Macro Usage

Developers and GMs can control the soundboard directly via macros or chat:

```javascript
// Open or toggle the Sound Pad
game.pf2eAwesomeGmUtilities.soundPad.toggle();

// Stop all playing sounds (Panic)
game.pf2eAwesomeGmUtilities.soundPad.stopAll();

// Seek active song to 45 seconds
game.pf2eAwesomeGmUtilities.soundPad.seek(45);

// Skip forward 15 seconds
game.pf2eAwesomeGmUtilities.soundPad.skip(15);
```

---

## Roadmap & Upcoming Utilities

- [x] **Music & SFX Sound Pad with Seeking and Sampling**
- [ ] **Scene Transition & Environment Switcher**: Quick atmosphere shifts combining lighting, weather, and sound presets.
- [ ] **Enhanced GM Shop & Merchant UI**: Streamlined buying/selling interface for PF2e settlements.
- [ ] **Encounter Reward & Loot Distributor**: One-click distribution of XP and loot cards.
