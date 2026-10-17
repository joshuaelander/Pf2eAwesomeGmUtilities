/**
 * PF2e Awesome GM Utilities - Sound Pad Application
 * Detachable, multi-bank soundboard with seeking/sampling controls, drag-and-drop,
 * and live volume management.
 */

import { MODULE_ID, COLOR_THEMES, DEFAULT_BANKS } from "./constants.js";
import { audioController } from "./audio-controller.js";
import { SoundConfigDialog } from "./sound-config-dialog.js";

// Determine base Application class (ApplicationV2 for Foundry v14, fallback for v11/v12)
const isAppV2 = !!(foundry.applications?.api?.ApplicationV2 && foundry.applications?.api?.HandlebarsApplicationMixin);
const BaseClass = isAppV2
  ? foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)
  : Application;

export class SoundPadApp extends BaseClass {
  constructor(options = {}) {
    super(options);

    this.activeBankId = "bank-combat";
    this.isEditMode = false;
    this.isCompactMode = false;

    // Subscribe to audio controller updates
    audioController.subscribe(() => {
      this._updatePlaybackUI();
    });
  }

  /* ------------------------------------------------------------------------- */
  /* Static Options & Configuration (ApplicationV2 / Application)             */
  /* ------------------------------------------------------------------------- */

  static get defaultOptions() {
    if (isAppV2) return super.defaultOptions;
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pf2e-sound-pad",
      title: "PF2e Music Sound Pad",
      template: `modules/${MODULE_ID}/templates/sound-pad.hbs`,
      classes: ["pf2e-sound-pad-window"],
      width: 580,
      height: "auto",
      resizable: true,
      minimizable: true
    });
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-sound-pad",
    classes: ["pf2e-sound-pad-window"],
    tag: "div",
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.SoundPad.Title",
      icon: "fa-solid fa-compact-disc",
      resizable: true,
      minimizable: true,
      controls: [
        {
          icon: "fa-solid fa-compress",
          label: "PF2E_AWESOME_GM.SoundPad.ToggleCompact",
          action: "toggleCompact"
        },
        {
          icon: "fa-solid fa-ban",
          label: "PF2E_AWESOME_GM.SoundPad.Panic",
          action: "panicStop"
        }
      ]
    },
    position: {
      width: 580,
      height: "auto"
    },
    actions: {
      toggleCompact: SoundPadApp._onActionToggleCompact,
      panicStop: SoundPadApp._onActionPanicStop
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/sound-pad.hbs`
    }
  };

  /**
   * Universal render method compatible with both ApplicationV2 (options object)
   * and legacy Application (force boolean, options object).
   */
  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = Object.assign({ force: options }, _legacyOptions);
    } else if (!options || typeof options !== "object") {
      options = { force: true };
    }
    return super.render(options);
  }

  /* ------------------------------------------------------------------------- */
  /* Data Context Preparation                                                  */
  /* ------------------------------------------------------------------------- */

  async _prepareContext(options) {
    return this.getData();
  }

  async getData(options = {}) {
    const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
    const banks = data.banks || DEFAULT_BANKS;

    // Verify active bank
    let activeBank = banks.find(b => b.id === this.activeBankId);
    if (!activeBank) {
      activeBank = banks[0];
      this.activeBankId = activeBank?.id || "";
    }

    // Process banks for rendering
    const processedBanks = banks.map(b => ({
      ...b,
      isActive: b.id === this.activeBankId
    }));

    // Process slots for active bank
    const masterVol = game.settings.get(MODULE_ID, "soundPadMasterVolume") ?? 1.0;
    const processedSlots = (activeBank?.slots || []).map(slot => {
      const isPlaying = audioController.isSlotPlaying(slot);
      const isPreviewing = audioController.previewData?.slotId === slot.id;
      const theme = COLOR_THEMES[slot.color] || COLOR_THEMES.crimson;

      return {
        ...slot,
        isPlaying,
        isPreviewing,
        themeColor: theme.color,
        themeBorder: theme.border,
        themeGlow: theme.glow,
        isEmpty: !slot.soundId && !slot.src && !slot.playlistId,
        displayVolume: Math.round((slot.volume ?? 0.8) * 100),
        modeLabel: slot.mode === "loop" ? "BGM Loop" : (slot.mode === "oneshot" ? "SFX" : "Toggle")
      };
    });

    // Active track information for bottom player dock
    const activeTrack = audioController.activeTrack;
    let formattedCurrentTime = "00:00";
    let formattedDuration = "00:00";
    let seekPercentage = 0;

    if (activeTrack) {
      formattedCurrentTime = this._formatTime(activeTrack.currentTime || 0);
      formattedDuration = this._formatTime(activeTrack.duration || 0);
      if (activeTrack.duration > 0) {
        seekPercentage = Math.min(100, (activeTrack.currentTime / activeTrack.duration) * 100);
      }
    }

    return {
      banks: processedBanks,
      activeBank,
      slots: processedSlots,
      isEditMode: this.isEditMode,
      isCompactMode: this.isCompactMode,
      masterVolume: masterVol,
      masterVolumePct: Math.round(masterVol * 100),
      isMuted: masterVol === 0,
      activeTrack: activeTrack ? {
        ...activeTrack,
        formattedCurrentTime,
        formattedDuration,
        seekPercentage,
        trackVolumePct: Math.round((activeTrack.volume || 0.8) * 100)
      } : null
    };
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  /* ------------------------------------------------------------------------- */
  /* DOM Rendering & Event Listeners                                           */
  /* ------------------------------------------------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;
    const html = typeof $ !== "undefined" ? $(root) : root;
    this.activateListeners(html);
  }

  activateListeners(html) {
    if (!isAppV2) super.activateListeners(html);

    // Apply saved opacity
    const opacity = game.settings.get(MODULE_ID, "soundPadOpacity") ?? 100;
    html.css("opacity", opacity / 100);

    // Bank Navigation Tabs
    html.find(".bank-tab").on("click", (e) => {
      const bankId = $(e.currentTarget).data("bank-id");
      if (bankId && bankId !== this.activeBankId) {
        this.activeBankId = bankId;
        this.render({ force: false });
      }
    });

    // Add New Bank
    html.find("#add-bank-btn").on("click", () => this._onAddBank());

    // Edit/Delete Current Bank
    html.find("#bank-options-btn").on("click", () => this._onBankOptions());

    // Toggle Edit Mode
    html.find("#toggle-edit-mode").on("click", () => {
      this.isEditMode = !this.isEditMode;
      this.render({ force: false });
    });

    // Toggle Compact Mode
    html.find("#toggle-compact-mode").on("click", () => {
      this.isCompactMode = !this.isCompactMode;
      this.render({ force: false });
    });

    // Panic / Stop All Sounds Button
    html.find("#panic-stop-btn").on("click", async () => {
      await audioController.stopAll();
      this.render({ force: false });
    });

    // Master Volume Slider
    html.find("#master-volume-slider").on("input", async (e) => {
      const val = parseFloat(e.target.value);
      html.find("#master-vol-display").text(`${Math.round(val * 100)}%`);
      await audioController.setMasterVolume(val);
    });

    // Master Mute Toggle
    html.find("#master-mute-btn").on("click", async () => {
      const current = game.settings.get(MODULE_ID, "soundPadMasterVolume") ?? 1.0;
      if (current > 0) {
        this._previousVolume = current;
        await audioController.setMasterVolume(0);
      } else {
        await audioController.setMasterVolume(this._previousVolume || 0.8);
      }
      this.render({ force: false });
    });

    // Add Slot to Bank
    html.find("#add-slot-btn").on("click", () => this._onAddSlot());

    // Sound Pad Slot Trigger (Left Click)
    html.find(".sound-pad-btn").on("click", async (e) => {
      // Ignore if clicking on sub-buttons
      if ($(e.target).closest(".slot-actions").length) return;

      const slotId = $(e.currentTarget).data("slot-id");
      const slot = this._getSlot(slotId);
      if (slot) {
        if (slot.isEmpty && this.isEditMode) {
          await this._onEditSlot(slotId);
        } else {
          await audioController.triggerSlot(slot);
        }
      }
    });

    // Right-click to edit slot
    html.find(".sound-pad-btn").on("contextmenu", async (e) => {
      e.preventDefault();
      const slotId = $(e.currentTarget).data("slot-id");
      await this._onEditSlot(slotId);
    });

    // Edit Slot button (Gear icon)
    html.find(".slot-edit-btn").on("click", async (e) => {
      e.stopPropagation();
      const slotId = $(e.currentTarget).data("slot-id");
      await this._onEditSlot(slotId);
    });

    // Preview / Sampling button (Headphone icon)
    html.find(".slot-preview-btn").on("click", async (e) => {
      e.stopPropagation();
      const slotId = $(e.currentTarget).data("slot-id");
      const slot = this._getSlot(slotId);
      if (slot) {
        if (audioController.previewData?.slotId === slotId) {
          audioController.stopPreview();
        } else {
          await audioController.startPreview(slot);
        }
      }
    });

    // Delete Slot button (Trash icon in edit mode)
    html.find(".slot-delete-btn").on("click", async (e) => {
      e.stopPropagation();
      const slotId = $(e.currentTarget).data("slot-id");
      await this._onDeleteSlot(slotId);
    });

    // Drag and Drop Handling on Pad Slots
    this._activateDragDrop(html);

    // Active Track Dock Controls
    this._activateDockControls(html);
  }

  /* ------------------------------------------------------------------------- */
  /* Drag and Drop Handling                                                    */
  /* ------------------------------------------------------------------------- */

  _activateDragDrop(html) {
    const slots = html.find(".sound-pad-btn");

    slots.on("dragover", (e) => {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = "copy";
      $(e.currentTarget).addClass("drag-target");
    });

    slots.on("dragleave", (e) => {
      $(e.currentTarget).removeClass("drag-target");
    });

    slots.on("drop", async (e) => {
      e.preventDefault();
      const targetEl = $(e.currentTarget);
      targetEl.removeClass("drag-target");
      const slotId = targetEl.data("slot-id");

      let data;
      try {
        data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain"));
      } catch (err) {
        return;
      }

      await this._handleDroppedAudio(slotId, data);
    });
  }

  async _handleDroppedAudio(slotId, data) {
    if (!slotId || !data) return;

    let title = "";
    let soundId = "";
    let playlistId = "";
    let src = "";
    let type = "playlist-sound";

    // Case 1: PlaylistSound dropped directly
    if (data.type === "PlaylistSound") {
      soundId = data.id || data.soundId;
      playlistId = data.playlistId;

      // Resolve document
      let soundDoc = null;
      if (data.uuid) {
        soundDoc = await fromUuid(data.uuid);
      }
      if (!soundDoc && playlistId) {
        const pl = game.playlists.get(playlistId);
        soundDoc = pl?.sounds.get(soundId);
      }

      if (soundDoc) {
        title = soundDoc.name;
        src = soundDoc.path;
        playlistId = soundDoc.parent?.id || playlistId;
      }
    }
    // Case 2: Whole Playlist dropped
    else if (data.type === "Playlist") {
      type = "playlist";
      playlistId = data.id;
      let playlistDoc = null;
      if (data.uuid) {
        playlistDoc = await fromUuid(data.uuid);
      } else {
        playlistDoc = game.playlists.get(playlistId);
      }
      if (playlistDoc) {
        title = playlistDoc.name;
      }
    }
    // Case 3: Raw audio file / macro / other
    else if (data.src || data.path) {
      type = "file";
      src = data.src || data.path;
      title = src.split("/").pop().replace(/\.[^/.]+$/, "");
    } else {
      return;
    }

    // Update slot
    const slot = this._getSlot(slotId);
    if (!slot) return;

    slot.name = title || slot.name;
    slot.type = type;
    slot.soundId = soundId;
    slot.playlistId = playlistId;
    slot.src = src;

    // Pick appropriate icon
    if (type === "playlist") slot.icon = "fa-solid fa-list-music";
    else if (type === "file") slot.icon = "fa-solid fa-music";

    await this._saveCurrentBankSlots();
    ui.notifications.info(`Mapped "${slot.name}" to sound pad slot!`);
    this.render({ force: false });
  }

  /* ------------------------------------------------------------------------- */
  /* Active Track Player Dock Controls & Scrubber                              */
  /* ------------------------------------------------------------------------- */

  _activateDockControls(html) {
    const dock = html.find(".active-track-dock");
    if (!dock.length) return;

    // Play/Pause button
    dock.find("#dock-play-pause-btn").on("click", async () => {
      const active = audioController.activeTrack;
      if (!active) return;
      if (active.isSampling && audioController.previewAudio) {
        if (audioController.previewAudio.paused) audioController.previewAudio.play();
        else audioController.previewAudio.pause();
      } else {
        const slot = this._getSlot(active.slotId);
        if (slot) await audioController.stopSlot(slot);
      }
    });

    // Stop button
    dock.find("#dock-stop-btn").on("click", async () => {
      const active = audioController.activeTrack;
      if (active?.isSampling) {
        audioController.stopPreview();
      } else {
        await audioController.stopAll();
      }
    });

    // Broadcast Preview to World Button
    dock.find("#dock-broadcast-btn").on("click", async () => {
      await audioController.broadcastPreviewToWorld();
      this.render({ force: false });
    });

    // Skip -10s
    dock.find("#dock-skip-back").on("click", async () => {
      await audioController.skipOffset(-10);
    });

    // Skip +10s
    dock.find("#dock-skip-fwd").on("click", async () => {
      await audioController.skipOffset(10);
    });

    // Seek / Scrub slider
    const seekSlider = dock.find("#dock-seek-slider");
    seekSlider.on("input", async (e) => {
      const targetSeconds = parseFloat(e.target.value);
      await audioController.seek(targetSeconds);
      dock.find("#dock-current-time").text(this._formatTime(targetSeconds));
    });

    // Track Volume slider
    const volSlider = dock.find("#dock-volume-slider");
    volSlider.on("input", async (e) => {
      const vol = parseFloat(e.target.value);
      dock.find("#dock-volume-pct").text(`${Math.round(vol * 100)}%`);
      await audioController.setTrackVolume(vol);
    });
  }

  /* ------------------------------------------------------------------------- */
  /* UI Auto-Refresh on Playback Ticks                                         */
  /* ------------------------------------------------------------------------- */

  _updatePlaybackUI() {
    if (!this.rendered || !this.element) return;
    const html = typeof $ !== "undefined" ? $(this.element) : null;
    if (!html || !html.length) return;

    const active = audioController.activeTrack;
    const dock = html.find(".active-track-dock");

    // If dock visibility needs to toggle when track starts/stops, re-render
    if ((active && !dock.length) || (!active && dock.length)) {
      this.render({ force: false });
      return;
    }

    // Update active pads styling & equalizer
    html.find(".sound-pad-btn").each((_, el) => {
      const slotId = $(el).data("slot-id");
      const slot = this._getSlot(slotId);
      const isPlaying = slot ? audioController.isSlotPlaying(slot) : false;
      const isPreview = audioController.previewData?.slotId === slotId;

      $(el).toggleClass("is-playing", isPlaying);
      $(el).toggleClass("is-previewing", isPreview);
    });

    // Update dock scrubber if rendered
    if (active && dock.length) {
      dock.find("#dock-track-name").text(active.name);
      dock.find("#dock-playlist-name").text(active.playlistName || (active.isSampling ? "GM Preview" : ""));
      dock.find("#dock-current-time").text(this._formatTime(active.currentTime));
      dock.find("#dock-total-duration").text(this._formatTime(active.duration));

      const seekSlider = dock.find("#dock-seek-slider");
      if (!seekSlider.is(":active")) {
        seekSlider.attr("max", active.duration || 100);
        seekSlider.val(active.currentTime || 0);
      }
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Bank & Slot Management                                                    */
  /* ------------------------------------------------------------------------- */

  _getSlot(slotId) {
    const data = game.settings.get(MODULE_ID, "soundboardData");
    const bank = data?.banks?.find(b => b.id === this.activeBankId);
    return bank?.slots?.find(s => s.id === slotId) || null;
  }

  async _saveCurrentBankSlots() {
    const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
    await game.settings.set(MODULE_ID, "soundboardData", data);
  }

  async _onEditSlot(slotId) {
    const slot = this._getSlot(slotId);
    if (!slot) return;

    await SoundConfigDialog.open(slot, this.activeBankId, async (updatedSlot) => {
      const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
      const bank = data.banks.find(b => b.id === this.activeBankId);
      if (bank) {
        const idx = bank.slots.findIndex(s => s.id === slotId);
        if (idx !== -1) {
          bank.slots[idx] = updatedSlot;
          await game.settings.set(MODULE_ID, "soundboardData", data);
          this.render({ force: false });
        }
      }
    });
  }

  async _onAddSlot() {
    const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
    const bank = data.banks.find(b => b.id === this.activeBankId);
    if (!bank) return;

    const newSlotId = `slot-${Date.now()}`;
    const newSlot = {
      id: newSlotId,
      name: `Slot ${bank.slots.length + 1}`,
      type: "playlist-sound",
      playlistId: "",
      soundId: "",
      src: "",
      color: "crimson",
      icon: "fa-solid fa-music",
      mode: "loop",
      volume: 0.8,
      fadeDuration: 1.5
    };

    bank.slots.push(newSlot);
    await game.settings.set(MODULE_ID, "soundboardData", data);
    this.render({ force: false });
  }

  async _onDeleteSlot(slotId) {
    const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
    const bank = data.banks.find(b => b.id === this.activeBankId);
    if (!bank) return;

    bank.slots = bank.slots.filter(s => s.id !== slotId);
    await game.settings.set(MODULE_ID, "soundboardData", data);
    this.render({ force: false });
  }

  async _onAddBank() {
    new Dialog({
      title: "Create Soundboard Bank",
      content: `
        <form style="padding: 5px;">
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">Bank Name:</label>
            <input type="text" id="new-bank-name" placeholder="e.g., Dungeon Delve, Boss Themes" />
          </div>
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">Icon (FontAwesome):</label>
            <input type="text" id="new-bank-icon" value="fa-solid fa-music" />
          </div>
        </form>
      `,
      buttons: {
        create: {
          icon: '<i class="fa-solid fa-plus"></i>',
          label: "Create Bank",
          callback: async (html) => {
            const name = html.find("#new-bank-name").val()?.trim() || "New Bank";
            const icon = html.find("#new-bank-icon").val()?.trim() || "fa-solid fa-music";
            const newBankId = `bank-${Date.now()}`;

            const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
            data.banks.push({
              id: newBankId,
              name,
              icon,
              slots: [
                { id: `slot-${Date.now()}-1`, name: "Track 1", type: "playlist-sound", playlistId: "", soundId: "", src: "", color: "crimson", icon: "fa-solid fa-music", mode: "loop", volume: 0.8, fadeDuration: 1.5 },
                { id: `slot-${Date.now()}-2`, name: "Track 2", type: "playlist-sound", playlistId: "", soundId: "", src: "", color: "crimson", icon: "fa-solid fa-music", mode: "loop", volume: 0.8, fadeDuration: 1.5 },
                { id: `slot-${Date.now()}-3`, name: "Track 3", type: "playlist-sound", playlistId: "", soundId: "", src: "", color: "crimson", icon: "fa-solid fa-music", mode: "loop", volume: 0.8, fadeDuration: 1.5 }
              ]
            });

            await game.settings.set(MODULE_ID, "soundboardData", data);
            this.activeBankId = newBankId;
            this.render({ force: false });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "create"
    }).render(true);
  }

  async _onBankOptions() {
    const data = game.settings.get(MODULE_ID, "soundboardData") || { banks: DEFAULT_BANKS };
    const bank = data.banks.find(b => b.id === this.activeBankId);
    if (!bank) return;

    new Dialog({
      title: `Bank Options: ${bank.name}`,
      content: `
        <form style="padding: 5px;">
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">Rename Bank:</label>
            <input type="text" id="edit-bank-name" value="${bank.name}" />
          </div>
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">Icon (FontAwesome):</label>
            <input type="text" id="edit-bank-icon" value="${bank.icon}" />
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fa-solid fa-floppy-disk"></i>',
          label: "Save Changes",
          callback: async (html) => {
            bank.name = html.find("#edit-bank-name").val()?.trim() || bank.name;
            bank.icon = html.find("#edit-bank-icon").val()?.trim() || bank.icon;
            await game.settings.set(MODULE_ID, "soundboardData", data);
            this.render({ force: false });
          }
        },
        delete: {
          icon: '<i class="fa-solid fa-trash"></i>',
          label: "Delete Bank",
          callback: async () => {
            if (data.banks.length <= 1) {
              ui.notifications.warn("Cannot delete the only remaining soundboard bank.");
              return;
            }
            data.banks = data.banks.filter(b => b.id !== bank.id);
            this.activeBankId = data.banks[0].id;
            await game.settings.set(MODULE_ID, "soundboardData", data);
            this.render({ force: false });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "save"
    }).render(true);
  }

  /* ------------------------------------------------------------------------- */
  /* Static Action Handlers for ApplicationV2 Window Controls                  */
  /* ------------------------------------------------------------------------- */

  static _onActionToggleCompact(event, target) {
    this.isCompactMode = !this.isCompactMode;
    this.render({ force: false });
  }

  static async _onActionPanicStop(event, target) {
    await audioController.stopAll();
    this.render({ force: false });
  }
}
