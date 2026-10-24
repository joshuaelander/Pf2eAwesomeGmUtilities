/**
 * PF2e Awesome GM Utilities - Sound Pad Slot Configuration Dialog
 */

import { MODULE_ID, COLOR_THEMES } from "./constants.js";
import { volumeToSlider, sliderToVolume } from "./audio-controller.js";

export class SoundConfigDialog {
  /**
   * Open the configuration dialog for a specific slot
   * @param {object} slot The slot data to configure
   * @param {string} bankId The parent bank ID
   * @param {Function} onSave Callback when slot is saved
   */
  static async open(slot, bankId, onSave) {
    // Prepare playlists and sounds for dropdowns
    const playlists = game.playlists.contents.map(p => ({
      id: p.id,
      name: p.name,
      sounds: p.sounds.contents.map(s => ({
        id: s.id,
        name: s.name,
        path: s.path
      }))
    }));

    // Selected playlist
    let selectedPlaylistId = slot.playlistId || (playlists[0]?.id || "");
    let selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);

    // If soundId is missing on the slot, try to resolve it from the sound path across playlists
    let soundId = slot.soundId || "";
    if (!soundId && slot.src) {
      let match = selectedPlaylist?.sounds.find(s => s.path === slot.src);
      if (!match) {
        for (const pl of playlists) {
          match = pl.sounds.find(s => s.path === slot.src);
          if (match) {
            selectedPlaylistId = pl.id;
            selectedPlaylist = pl;
            break;
          }
        }
      }
      if (match) {
        soundId = match.id;
      }
    }

    const sounds = selectedPlaylist ? selectedPlaylist.sounds : [];

    // Color themes options
    const colorThemes = Object.entries(COLOR_THEMES).map(([key, val]) => ({
      key,
      label: val.label,
      color: val.color,
      selected: (slot.color || "crimson") === key
    }));

    // Mode options
    const modes = [
      { key: "loop", label: "Looping Music (Repeats continuously until stopped)", selected: slot.mode === "loop" },
      { key: "toggle", label: "Toggle (Click to start, click again to stop)", selected: slot.mode === "toggle" },
      { key: "oneshot", label: "One-Shot (Plays once and stops, ideal for SFX)", selected: slot.mode === "oneshot" },
      { key: "restart", label: "Restart on Press (Re-triggers from start each click)", selected: slot.mode === "restart" }
    ];

    const defPct = (game.settings.get(MODULE_ID, "soundPadDefaultVolume") ?? 40);
    const fallbackVol = sliderToVolume(defPct / 100);
    const currentVol = slot.volume != null ? slot.volume : fallbackVol;
    const currentSlider = volumeToSlider(currentVol);

    const context = {
      slot: {
        id: slot.id,
        name: slot.name || "",
        type: slot.type || "playlist-sound",
        playlistId: selectedPlaylistId,
        soundId: soundId,
        src: slot.src || "",
        icon: slot.icon || "fa-solid fa-music",
        volume: currentVol,
        volumeSlider: currentSlider,
        displayVolume: Math.round(currentSlider * 100),
        fadeDuration: slot.fadeDuration ?? 1.5,
        color: slot.color || "crimson"
      },
      playlists,
      sounds,
      colorThemes,
      modes
    };

    const content = await renderTemplate(
      `modules/${MODULE_ID}/templates/sound-config.hbs`,
      context
    );

    return new Promise((resolve) => {
      let resolved = false;

      const dialog = new Dialog({
        title: `Configure Sound Pad Slot: ${slot.name || "Slot"}`,
        content: content,
        buttons: {
          save: {
            icon: '<i class="fa-solid fa-floppy-disk"></i>',
            label: "Save Slot",
            callback: (html) => {
              const updatedSlot = SoundConfigDialog._readForm(html, slot.id);
              if (onSave) onSave(updatedSlot);
              resolved = true;
              resolve(updatedSlot);
            }
          },
          clear: {
            icon: '<i class="fa-solid fa-trash"></i>',
            label: "Clear Slot",
            callback: () => {
              const defSlotPct = (game.settings.get(MODULE_ID, "soundPadDefaultVolume") ?? 40);
              const clearedSlot = {
                id: slot.id,
                name: "Empty Slot",
                type: "playlist-sound",
                playlistId: "",
                soundId: "",
                src: "",
                icon: "fa-solid fa-plus",
                color: "shadow",
                mode: "loop",
                volume: sliderToVolume(defSlotPct / 100),
                fadeDuration: 1.5
              };
              if (onSave) onSave(clearedSlot);
              resolved = true;
              resolve(clearedSlot);
            }
          },
          cancel: {
            icon: '<i class="fa-solid fa-xmark"></i>',
            label: "Cancel",
            callback: () => {
              resolved = true;
              resolve(null);
            }
          }
        },
        default: "save",
        render: (html) => {
          SoundConfigDialog._activateListeners(html, playlists);
        },
        close: () => {
          if (!resolved) resolve(null);
        }
      }, {
        width: 500,
        classes: ["pf2e-sound-config-dialog"]
      });

      dialog.render(true);
    });
  }

  static _readForm(html, slotId) {
    const $html = typeof $ !== "undefined" ? $(html) : html;
    const name = $html.find("#slot-name").val()?.trim() || "Sound Slot";
    const type = $html.find("#slot-source-type").val() || "playlist-sound";
    const playlistId = $html.find("#slot-playlist").val() || "";
    const soundId = $html.find("#slot-sound").val() || "";
    const src = $html.find("#slot-file-path").val()?.trim() || "";
    const color = $html.find("input[name='slot-color']:checked").val() || "crimson";
    const icon = $html.find("#slot-icon").val()?.trim() || "fa-solid fa-music";
    const mode = $html.find("#slot-mode").val() || "loop";
    const rawSlider = parseFloat($html.find("#slot-volume").val());
    const defPct = (game.settings?.get?.(MODULE_ID, "soundPadDefaultVolume") ?? 40);
    const sliderVal = isNaN(rawSlider) ? (defPct / 100) : rawSlider;
    const volume = sliderToVolume(sliderVal);
    const fadeDuration = parseFloat($html.find("#slot-fade").val()) || 1.5;

    return {
      id: slotId,
      name,
      type,
      playlistId,
      soundId,
      src,
      color,
      icon,
      mode,
      volume,
      fadeDuration
    };
  }

  static _activateListeners(html, playlists) {
    const $html = typeof $ !== "undefined" ? $(html) : html;
    const sourceTypeSelect = $html.find("#slot-source-type");
    const playlistGroup = $html.find(".group-playlist");
    const soundGroup = $html.find(".group-sound");
    const fileGroup = $html.find(".group-file");
    const playlistSelect = $html.find("#slot-playlist");
    const soundSelect = $html.find("#slot-sound");
    const slotNameInput = $html.find("#slot-name");

    function updateVisibility() {
      const type = sourceTypeSelect.val();
      if (type === "playlist-sound") {
        playlistGroup.show();
        soundGroup.show();
        fileGroup.hide();
      } else if (type === "playlist") {
        playlistGroup.show();
        soundGroup.hide();
        fileGroup.hide();
      } else {
        playlistGroup.hide();
        soundGroup.hide();
        fileGroup.show();
      }
    }
    updateVisibility();
    sourceTypeSelect.on("change", updateVisibility);

    // Dynamic Sound list update when Playlist changes
    playlistSelect.on("change", () => {
      const plId = playlistSelect.val();
      const pl = playlists.find(p => p.id === plId);
      soundSelect.empty();

      if (pl && pl.sounds.length > 0) {
        for (const s of pl.sounds) {
          soundSelect.append(`<option value="${s.id}" data-path="${s.path}">${s.name}</option>`);
        }
        // Auto-fill name if default or empty
        if (!slotNameInput.val() || slotNameInput.val() === "Sound Slot") {
          slotNameInput.val(pl.sounds[0].name);
        }
      } else {
        soundSelect.append('<option value="">(No sounds in this playlist)</option>');
      }
    });

    // Auto-fill name when sound changes
    soundSelect.on("change", () => {
      const selectedName = soundSelect.find("option:selected").text();
      if (selectedName && selectedName !== "(No sounds in this playlist)") {
        slotNameInput.val(selectedName);
      }
    });

    // FilePicker button
    html.find(".file-picker-btn").on("click", (e) => {
      e.preventDefault();
      const current = html.find("#slot-file-path").val();
      const fp = new FilePicker({
        type: "audio",
        current: current,
        callback: (path) => {
          html.find("#slot-file-path").val(path);
          // auto fill name from filename
          const filename = path.split("/").pop().replace(/\.[^/.]+$/, "");
          if (!slotNameInput.val() || slotNameInput.val() === "Sound Slot") {
            slotNameInput.val(filename);
          }
        }
      });
      fp.browse();
    });

    // Live volume indicator label
    html.find("#slot-volume").on("input", (e) => {
      const pct = Math.round(e.target.value * 100);
      html.find("#slot-volume-display").text(`${pct}%`);
    });
  }
}
