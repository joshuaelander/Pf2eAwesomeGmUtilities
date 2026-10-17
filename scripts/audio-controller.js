/**
 * PF2e Awesome GM Utilities - Audio Controller
 * Handles soundboard playback, crossfading, seeking/scrubbing, volume control,
 * and private GM sampling/preview mode.
 */

import { MODULE_ID } from "./constants.js";

export class AudioController {
  constructor() {
    /** @type {HTMLAudioElement|null} Local preview player for GM sampling */
    this.previewAudio = null;
    /** @type {object|null} Metadata for currently previewed track */
    this.previewData = null;

    /** @type {Map<string, object>} Tracks active direct audio instances */
    this.directSounds = new Map();

    /** @type {object|null} Currently tracked active track for the dock scrubber */
    this.activeTrack = null;

    /** @type {number|null} Interval ID for polling playback time */
    this.playbackPollInterval = null;

    /** @type {Set<Function>} Listeners notified on playback state changes */
    this.changeListeners = new Set();

    this._initHooks();
  }

  /* ------------------------------------------------------------------------- */
  /* Initialization & Foundry Hooks                                            */
  /* ------------------------------------------------------------------------- */

  _initHooks() {
    Hooks.once("ready", () => {
      this._startTimeTracker();
    });

    // Synchronize Sound Pad states when Foundry playlists change
    Hooks.on("updatePlaylistSound", (soundDoc, changes) => {
      if ("playing" in changes || "volume" in changes || "pausedTime" in changes) {
        this._notifyListeners();
      }
    });

    Hooks.on("updatePlaylist", (playlistDoc, changes) => {
      if ("playing" in changes || "sounds" in changes) {
        this._notifyListeners();
      }
    });

    Hooks.on("deletePlaylistSound", () => this._notifyListeners());
    Hooks.on("deletePlaylist", () => this._notifyListeners());
  }

  /**
   * Register a callback to be called whenever playback state updates
   * @param {Function} callback
   */
  subscribe(callback) {
    this.changeListeners.add(callback);
  }

  /**
   * Unregister a state change callback
   * @param {Function} callback
   */
  unsubscribe(callback) {
    this.changeListeners.delete(callback);
  }

  _notifyListeners() {
    for (const callback of this.changeListeners) {
      try {
        callback();
      } catch (err) {
        console.error("PF2e Awesome GM Utilities | Error in playback listener:", err);
      }
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Time Tracking & Scrubber Polling                                          */
  /* ------------------------------------------------------------------------- */

  _startTimeTracker() {
    if (this.playbackPollInterval) clearInterval(this.playbackPollInterval);
    this.playbackPollInterval = setInterval(() => {
      this._pollCurrentPlaybackTime();
    }, 250);
  }

  _pollCurrentPlaybackTime() {
    if (!game?.ready || !game?.playlists) return;

    // 1. If currently in private GM preview mode
    if (this.previewAudio && !this.previewAudio.paused) {
      const cur = this.previewAudio.currentTime || 0;
      const dur = this.previewAudio.duration || 0;
      this.activeTrack = {
        slotId: this.previewData?.slotId || "",
        name: this.previewData?.name || "Sample Preview",
        playlistName: "GM Preview (Private)",
        currentTime: cur,
        duration: isFinite(dur) ? dur : 0,
        isPlaying: true,
        isSampling: true,
        volume: this.previewAudio.volume || 1.0,
        mode: this.previewData?.mode || "loop"
      };
      this._notifyListeners();
      return;
    }

    // 2. Otherwise inspect live Foundry PlaylistSounds
    const playingSound = this.getCurrentlyPlayingPlaylistSound();
    if (playingSound) {
      const soundDoc = playingSound.soundDoc;
      const soundObj = soundDoc.sound;
      let cur = 0;
      let dur = 0;

      if (soundObj) {
        const mediaEl = soundObj.container || soundObj.element;
        if (mediaEl && typeof mediaEl.currentTime === "number") {
          cur = mediaEl.currentTime;
          dur = mediaEl.duration || 0;
        } else if (typeof soundObj.currentTime === "number") {
          cur = soundObj.currentTime;
          dur = soundObj.duration || 0;
        }
      }

      this.activeTrack = {
        slotId: playingSound.slotId,
        soundId: soundDoc.id,
        playlistId: playingSound.playlist.id,
        name: soundDoc.name,
        playlistName: playingSound.playlist.name,
        currentTime: cur,
        duration: isFinite(dur) ? dur : 0,
        isPlaying: true,
        isSampling: false,
        volume: soundDoc.volume,
        mode: soundDoc.repeat ? "loop" : "oneshot"
      };
      this._notifyListeners();
      return;
    }

    // 3. Nothing active
    if (this.activeTrack && !this.activeTrack.isSampling) {
      this.activeTrack = null;
      this._notifyListeners();
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Main Playback Controls                                                    */
  /* ------------------------------------------------------------------------- */

  /**
   * Toggle or trigger a sound slot on the pad
   * @param {object} slot Sound slot data
   */
  async triggerSlot(slot) {
    if (!slot) return;

    // Check if slot has valid configuration
    const isFile = slot.type === "file" && slot.src;
    const isPlaylist = slot.type === "playlist" && slot.playlistId;
    const isPlaylistSound = (slot.type === "playlist-sound" || !slot.type) && (slot.soundId || slot.src);

    if (!isFile && !isPlaylist && !isPlaylistSound) {
      ui.notifications.info(`Sound Pad: Slot "${slot.name || 'Slot'}" has no sound assigned. Drag a track onto it or click edit to configure.`);
      return;
    }

    // Check if this slot is already playing
    const isPlaying = this.isSlotPlaying(slot);

    if (isPlaying) {
      if (slot.mode === "restart") {
        await this.stopSlot(slot);
        await this.playSlot(slot);
      } else {
        // Toggle off
        await this.stopSlot(slot);
      }
    } else {
      // Auto-stop other music tracks if configured
      if (slot.mode === "loop" || slot.mode === "toggle") {
        const autoStop = game.settings.get(MODULE_ID, "autoStopOtherMusic");
        if (autoStop) {
          await this.stopOtherMusicTracks(slot.id);
        }
      }
      await this.playSlot(slot);
    }
  }

  /**
   * Start playing a slot
   * @param {object} slot
   */
  async playSlot(slot) {
    const masterVol = game.settings.get(MODULE_ID, "soundPadMasterVolume") ?? 1.0;
    const targetVolume = Math.min(1.0, Math.max(0.0, (slot.volume ?? 0.8) * masterVol));

    // Handle File / SFX
    if (slot.type === "file" && slot.src) {
      await this.playDirectFile(slot, targetVolume);
      return;
    }

    // Handle Whole Playlist
    if (slot.type === "playlist" && slot.playlistId) {
      const playlist = game.playlists.get(slot.playlistId);
      if (playlist) {
        await playlist.playAll();
      }
      return;
    }

    // Handle Playlist Sound
    const found = this.resolvePlaylistSound(slot);
    if (found) {
      const { playlist, sound } = found;

      // Update volume & repeat flag if different
      const updates = {};
      if (sound.volume !== targetVolume) updates.volume = targetVolume;
      const shouldLoop = slot.mode === "loop";
      if (sound.repeat !== shouldLoop) updates.repeat = shouldLoop;

      if (Object.keys(updates).length > 0) {
        await sound.update(updates);
      }

      await playlist.playSound(sound);
      this._notifyListeners();
    } else if (slot.src) {
      // Fallback: direct play if file path exists
      await this.playDirectFile(slot, targetVolume);
    }
  }

  /**
   * Stop playing a slot
   * @param {object} slot
   */
  async stopSlot(slot) {
    // If previewing this slot locally, stop preview
    if (this.previewData?.slotId === slot.id) {
      this.stopPreview();
    }

    // Direct file
    if (this.directSounds.has(slot.id)) {
      const soundInst = this.directSounds.get(slot.id);
      try {
        if (soundInst.stop) soundInst.stop();
        else if (soundInst.pause) soundInst.pause();
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Error stopping direct sound:", err);
      }
      this.directSounds.delete(slot.id);
      this._notifyListeners();
      return;
    }

    // Whole playlist
    if (slot.type === "playlist" && slot.playlistId) {
      const playlist = game.playlists.get(slot.playlistId);
      if (playlist) await playlist.stopAll();
      return;
    }

    // Playlist sound
    const found = this.resolvePlaylistSound(slot);
    if (found) {
      await found.playlist.stopSound(found.sound);
      this._notifyListeners();
    }
  }

  /**
   * Check if a specific slot is currently active/playing
   * @param {object} slot
   * @returns {boolean}
   */
  isSlotPlaying(slot) {
    if (!slot) return false;

    // Check preview
    if (this.previewData?.slotId === slot.id && this.previewAudio && !this.previewAudio.paused) {
      return true;
    }

    // Check direct sound
    if (this.directSounds.has(slot.id)) {
      return true;
    }

    // Check playlist
    if (slot.type === "playlist" && slot.playlistId) {
      const pl = game.playlists.get(slot.playlistId);
      return pl ? pl.playing : false;
    }

    // Check playlist sound
    const found = this.resolvePlaylistSound(slot);
    return found ? !!found.sound.playing : false;
  }

  /**
   * Resolve Playlist and PlaylistSound document from slot references
   * @param {object} slot
   * @returns {{ playlist: Playlist, sound: PlaylistSound } | null}
   */
  resolvePlaylistSound(slot) {
    if (!slot) return null;

    // 1. Try direct playlistId + soundId
    if (slot.playlistId && slot.soundId) {
      const pl = game.playlists.get(slot.playlistId);
      const snd = pl?.sounds.get(slot.soundId);
      if (snd) return { playlist: pl, sound: snd };
    }

    // 2. Search by soundId across all playlists if playlistId moved
    if (slot.soundId) {
      for (const pl of game.playlists) {
        const snd = pl.sounds.get(slot.soundId);
        if (snd) return { playlist: pl, sound: snd };
      }
    }

    // 3. Search by src path
    if (slot.src) {
      for (const pl of game.playlists) {
        const snd = pl.sounds.find(s => s.path === slot.src);
        if (snd) return { playlist: pl, sound: snd };
      }
    }

    return null;
  }

  /**
   * Plays a direct sound file via Foundry's AudioHelper or AudioContext
   */
  async playDirectFile(slot, volume) {
    try {
      // Use Foundry's sound helper
      if (foundry.audio?.AudioHelper?.play) {
        const sound = await foundry.audio.AudioHelper.play({
          src: slot.src,
          volume: volume,
          loop: slot.mode === "loop"
        });
        if (sound) {
          this.directSounds.set(slot.id, sound);
          sound.on("end", () => {
            this.directSounds.delete(slot.id);
            this._notifyListeners();
          });
        }
      } else if (typeof AudioHelper !== "undefined" && AudioHelper.play) {
        const sound = await AudioHelper.play({
          src: slot.src,
          volume: volume,
          loop: slot.mode === "loop"
        });
        if (sound) {
          this.directSounds.set(slot.id, sound);
          if (sound.on) {
            sound.on("end", () => {
              this.directSounds.delete(slot.id);
              this._notifyListeners();
            });
          }
        }
      } else {
        // Fallback to HTMLAudioElement
        const audio = new Audio(slot.src);
        audio.volume = volume;
        audio.loop = slot.mode === "loop";
        await audio.play();
        this.directSounds.set(slot.id, audio);
        audio.addEventListener("ended", () => {
          this.directSounds.delete(slot.id);
          this._notifyListeners();
        });
      }
      this._notifyListeners();
    } catch (err) {
      console.error("PF2e Awesome GM Utilities | Failed to play audio file:", slot.src, err);
      ui.notifications.error(`Could not play audio file: ${slot.src}`);
    }
  }

  /**
   * Finds the primary currently playing PlaylistSound in the world
   */
  getCurrentlyPlayingPlaylistSound() {
    if (!game?.ready || !game?.playlists) return null;
    for (const pl of game.playlists) {
      if (!pl.playing) continue;
      for (const snd of pl.sounds) {
        if (snd.playing) {
          return { playlist: pl, soundDoc: snd, slotId: this._findSlotIdForSound(snd.id, snd.path) };
        }
      }
    }
    return null;
  }

  _findSlotIdForSound(soundId, src) {
    if (!game?.ready || !game?.settings?.settings?.has?.(`${MODULE_ID}.soundboardData`)) return "";
    let data;
    try {
      data = game.settings.get(MODULE_ID, "soundboardData");
    } catch {
      return "";
    }
    if (!data?.banks) return "";
    for (const bank of data.banks) {
      for (const slot of bank.slots) {
        if (slot.soundId === soundId || (src && slot.src === src)) {
          return slot.id;
        }
      }
    }
    return "";
  }

  /* ------------------------------------------------------------------------- */
  /* Seeking & Skipping Ahead Controls                                         */
  /* ------------------------------------------------------------------------- */

  /**
   * Seek / skip ahead to a specific time (in seconds)
   * @param {number} targetSeconds
   */
  async seek(targetSeconds) {
    targetSeconds = Math.max(0, targetSeconds);

    // 1. If currently sampling/previewing
    if (this.previewAudio) {
      if (isFinite(this.previewAudio.duration)) {
        targetSeconds = Math.min(targetSeconds, this.previewAudio.duration);
      }
      this.previewAudio.currentTime = targetSeconds;
      if (this.activeTrack) this.activeTrack.currentTime = targetSeconds;
      this._notifyListeners();
      return;
    }

    // 2. If playing a live PlaylistSound
    const playing = this.getCurrentlyPlayingPlaylistSound();
    if (playing) {
      const soundDoc = playing.soundDoc;
      const soundObj = soundDoc.sound;

      if (soundObj) {
        // A. Direct container/element seek
        const mediaEl = soundObj.container || soundObj.element;
        if (mediaEl && typeof mediaEl.currentTime === "number") {
          mediaEl.currentTime = targetSeconds;
          if (this.activeTrack) this.activeTrack.currentTime = targetSeconds;
          this._notifyListeners();
          return;
        }

        // B. Method seek
        if (typeof soundObj.seek === "function") {
          soundObj.seek(targetSeconds);
          if (this.activeTrack) this.activeTrack.currentTime = targetSeconds;
          this._notifyListeners();
          return;
        }

        // C. Offset restart for Web Audio buffer nodes
        if (typeof soundObj.play === "function") {
          soundObj.stop();
          soundObj.play({
            offset: targetSeconds,
            volume: soundDoc.volume,
            loop: soundDoc.repeat
          });
          if (this.activeTrack) this.activeTrack.currentTime = targetSeconds;
          this._notifyListeners();
          return;
        }
      }

      // Update pausedTime if supported by document
      try {
        await soundDoc.update({ pausedTime: targetSeconds });
      } catch (e) {
        // ignore if not supported
      }
    }
  }

  /**
   * Jump forward or backward by an offset
   * @param {number} deltaSeconds
   */
  async skipOffset(deltaSeconds) {
    const current = this.activeTrack?.currentTime || 0;
    await this.seek(current + deltaSeconds);
  }

  /* ------------------------------------------------------------------------- */
  /* Private GM Preview / Sampling Mode                                        */
  /* ------------------------------------------------------------------------- */

  /**
   * Preview a sound privately on the GM's client with instantaneous scrub controls
   * @param {object} slot
   */
  async startPreview(slot) {
    if (!slot) return;

    // Determine audio source URL
    let audioSrc = slot.src;
    if (!audioSrc && slot.soundId) {
      const found = this.resolvePlaylistSound(slot);
      if (found) audioSrc = found.sound.path;
    }

    if (!audioSrc) {
      ui.notifications.warn("Cannot preview: No valid audio file path found for this slot.");
      return;
    }

    // Stop existing preview if any
    this.stopPreview();

    try {
      this.previewAudio = new Audio(audioSrc);
      const masterVol = game.settings.get(MODULE_ID, "soundPadMasterVolume") ?? 1.0;
      this.previewAudio.volume = Math.min(1.0, Math.max(0.0, (slot.volume ?? 0.8) * masterVol));
      this.previewAudio.loop = slot.mode === "loop";

      this.previewData = {
        slotId: slot.id,
        name: slot.name || "Preview Track",
        mode: slot.mode,
        src: audioSrc
      };

      this.previewAudio.addEventListener("ended", () => {
        this.stopPreview();
      });

      this.previewAudio.addEventListener("error", (e) => {
        console.error("PF2e Awesome GM Utilities | Error previewing track:", e);
        ui.notifications.error("Could not preview audio file. Check file path format.");
        this.stopPreview();
      });

      await this.previewAudio.play();
      ui.notifications.info(`Sampling: "${this.previewData.name}" (Private GM Audition)`);
      this._notifyListeners();
    } catch (err) {
      console.error("PF2e Awesome GM Utilities | Preview play error:", err);
      this.stopPreview();
    }
  }

  /**
   * Stop the current private preview
   */
  stopPreview() {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.currentTime = 0;
      this.previewAudio = null;
    }
    this.previewData = null;
    if (this.activeTrack?.isSampling) {
      this.activeTrack = null;
    }
    this._notifyListeners();
  }

  /**
   * Broadcast the currently previewed track to the live world for all players
   */
  async broadcastPreviewToWorld() {
    if (!this.previewData) return;
    const slotId = this.previewData.slotId;
    this.stopPreview();

    // Find slot in soundboard data
    const data = game.settings.get(MODULE_ID, "soundboardData");
    if (!data?.banks) return;

    for (const bank of data.banks) {
      const slot = bank.slots.find(s => s.id === slotId);
      if (slot) {
        await this.playSlot(slot);
        ui.notifications.info(`Now Broadcasting: "${slot.name}" to all players!`);
        break;
      }
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Volume & Panic Stop Controls                                              */
  /* ------------------------------------------------------------------------- */

  /**
   * Set live volume for active track or a specific slot
   * @param {number} volume (0.0 to 1.0)
   */
  async setTrackVolume(volume) {
    volume = Math.min(1.0, Math.max(0.0, volume));

    // Preview
    if (this.previewAudio) {
      this.previewAudio.volume = volume;
      if (this.activeTrack) this.activeTrack.volume = volume;
      this._notifyListeners();
      return;
    }

    // Live playlist sound
    const playing = this.getCurrentlyPlayingPlaylistSound();
    if (playing) {
      await playing.soundDoc.update({ volume: volume });
      if (this.activeTrack) this.activeTrack.volume = volume;
      this._notifyListeners();
    }
  }

  /**
   * Update master soundboard volume
   * @param {number} volume
   */
  async setMasterVolume(volume) {
    volume = Math.min(1.0, Math.max(0.0, volume));
    await game.settings.set(MODULE_ID, "soundPadMasterVolume", volume);

    // Apply to preview
    if (this.previewAudio && this.activeTrack) {
      this.previewAudio.volume = Math.min(1.0, (this.activeTrack.volume || 0.8) * volume);
    }
    this._notifyListeners();
  }

  /**
   * Auto-stop other music tracks when a new music track starts
   * @param {string} excludeSlotId
   */
  async stopOtherMusicTracks(excludeSlotId) {
    const fadeDuration = game.settings.get(MODULE_ID, "defaultFadeDuration") ?? 1.5;

    for (const pl of game.playlists) {
      for (const snd of pl.sounds) {
        if (snd.playing) {
          const slotId = this._findSlotIdForSound(snd.id, snd.path);
          if (slotId !== excludeSlotId) {
            await pl.stopSound(snd);
          }
        }
      }
    }
  }

  /**
   * Stop all playing audio instantly (Panic Button)
   */
  async stopAll() {
    // 1. Stop preview
    this.stopPreview();

    // 2. Stop direct sounds
    for (const [id, sound] of this.directSounds) {
      try {
        if (sound.stop) sound.stop();
        else if (sound.pause) sound.pause();
      } catch (err) {}
    }
    this.directSounds.clear();

    // 3. Stop all Foundry playlists
    for (const pl of game.playlists) {
      if (pl.playing) {
        await pl.stopAll();
      }
    }

    this.activeTrack = null;
    this._notifyListeners();
    ui.notifications.info("Sound Pad: All sounds stopped.");
  }
}

export const audioController = new AudioController();
