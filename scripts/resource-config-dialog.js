/**
 * PF2e Awesome GM Utilities - Resource Tracker Configuration Dialog
 * Modal dialog for creating and editing resource, clock, and affliction trackers.
 */

import { MODULE_ID, COLOR_THEMES, DEFAULT_RESOURCE_PRESETS } from "./constants.js";

export class ResourceConfigDialog {
  /**
   * Open the configuration modal for creating or editing a tracker.
   * @param {object|null} tracker Existing tracker data or null for new
   * @param {Function} onSave Callback when tracker is saved (trackerData) => void
   * @param {Function} [onDelete] Callback if user deletes tracker (trackerId) => void
   */
  static async open(tracker = null, onSave, onDelete = null) {
    const isNew = !tracker;
    const currentTracker = tracker || {
      id: `tracker-${foundry.utils.randomID(8)}`,
      name: "",
      category: "party",
      type: "counter",
      value: 10,
      min: 0,
      max: 20,
      clockSegments: 6,
      direction: "countup",
      actorId: "",
      color: "gold",
      icon: "fa-solid fa-box",
      notes: "",
      stages: [
        { stage: 1, name: "Stage 1", effect: "" },
        { stage: 2, name: "Stage 2", effect: "" },
        { stage: 3, name: "Stage 3", effect: "" },
        { stage: 4, name: "Stage 4", effect: "" },
        { stage: 5, name: "Stage 5", effect: "" }
      ]
    };

    // Prepare list of player character actors
    const playerActors = game.actors
      ? game.actors.filter(a => a.type === "character").map(a => ({
          id: a.id,
          name: a.name,
          img: a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg",
          selected: currentTracker.actorId === a.id
        }))
      : [];

    // Color themes options
    const colorThemes = Object.entries(COLOR_THEMES).map(([key, val]) => ({
      key,
      label: val.label,
      color: val.color,
      selected: (currentTracker.color || "gold") === key
    }));

    // Categories
    const categories = [
      { key: "party", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.CategoryParty"), selected: currentTracker.category === "party" },
      { key: "subsystem", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.CategorySubsystem"), selected: currentTracker.category === "subsystem" },
      { key: "actor", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.CategoryActor"), selected: currentTracker.category === "actor" }
    ];

    // Tracker Types
    const types = [
      { key: "counter", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.TypeCounter"), selected: currentTracker.type === "counter" },
      { key: "progress", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.TypeProgress"), selected: currentTracker.type === "progress" },
      { key: "clock", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.TypeClock"), selected: currentTracker.type === "clock" },
      { key: "stage", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.TypeStage"), selected: currentTracker.type === "stage" }
    ];

    // Clock Segments options
    const clockSegmentsOptions = [4, 6, 8, 10, 12].map(num => ({
      value: num,
      label: `${num} Segments`,
      selected: (currentTracker.clockSegments || 6) === num
    }));

    // Direction options
    const directions = [
      { key: "countup", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.DirectionUp"), selected: currentTracker.direction !== "countdown" },
      { key: "countdown", label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.DirectionDown"), selected: currentTracker.direction === "countdown" }
    ];

    // Presets
    const presets = DEFAULT_RESOURCE_PRESETS.map(p => ({
      id: p.presetId,
      name: p.name,
      category: p.category,
      type: p.type
    }));

    // Common quick icons
    const quickIcons = [
      { icon: "fa-solid fa-bread-slice", title: "Food / Bread" },
      { icon: "fa-solid fa-droplet", title: "Water / Potion" },
      { icon: "fa-solid fa-campground", title: "Camp / Supplies" },
      { icon: "fa-solid fa-trophy", title: "Victory Points" },
      { icon: "fa-solid fa-clock", title: "Clock / Time" },
      { icon: "fa-solid fa-triangle-exclamation", title: "Alert / Alarm" },
      { icon: "fa-solid fa-biohazard", title: "Disease / Poison" },
      { icon: "fa-solid fa-skull", title: "Doom / Curse" },
      { icon: "fa-solid fa-brain", title: "Sanity / Stress" },
      { icon: "fa-solid fa-coins", title: "Treasure / Gold" },
      { icon: "fa-solid fa-shield", title: "Defense / Armor" },
      { icon: "fa-solid fa-heart", title: "Health / Vigor" }
    ];

    // Ensure 5 stages exist for stage type
    const stages = currentTracker.stages && currentTracker.stages.length >= 5
      ? currentTracker.stages
      : [
          { stage: 1, name: "Stage 1", effect: currentTracker.stages?.[0]?.effect || "" },
          { stage: 2, name: "Stage 2", effect: currentTracker.stages?.[1]?.effect || "" },
          { stage: 3, name: "Stage 3", effect: currentTracker.stages?.[2]?.effect || "" },
          { stage: 4, name: "Stage 4", effect: currentTracker.stages?.[3]?.effect || "" },
          { stage: 5, name: "Stage 5", effect: currentTracker.stages?.[4]?.effect || "" }
        ];

    const context = {
      isNew,
      tracker: currentTracker,
      playerActors,
      hasPlayerActors: playerActors.length > 0,
      colorThemes,
      categories,
      types,
      clockSegmentsOptions,
      directions,
      presets,
      quickIcons,
      stages
    };

    const content = await renderTemplate(
      `modules/${MODULE_ID}/templates/resource-config.hbs`,
      context
    );

    const dialogTitle = isNew
      ? game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.CreateTitle")
      : game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.EditTitle");

    // Dialog buttons
    const buttons = {
      save: {
        icon: '<i class="fa-solid fa-check"></i>',
        label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Save"),
        callback: (html) => {
          const root = html instanceof HTMLElement ? html : (html?.[0] || document.querySelector(".pf2e-resource-config-dialog"));
          return ResourceConfigDialog._extractFormData(root, currentTracker.id);
        }
      },
      cancel: {
        icon: '<i class="fa-solid fa-xmark"></i>',
        label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Cancel")
      }
    };

    if (!isNew && onDelete) {
      buttons.delete = {
        icon: '<i class="fa-solid fa-trash"></i>',
        label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Delete"),
        callback: () => {
          onDelete(currentTracker.id);
        }
      };
    }

    // Render Dialog
    let dialog = null;
    const dialogOptions = {
      title: dialogTitle,
      content,
      buttons,
      default: "save",
      close: () => {},
      render: (html) => {
        const root = html instanceof HTMLElement ? html : (html?.[0] || document.querySelector(".pf2e-resource-config-dialog"));
        if (!root) return;
        ResourceConfigDialog._setupEventListeners(root);
      }
    };

    if (foundry?.applications?.api?.DialogV2?.wait) {
      const result = await foundry.applications.api.DialogV2.wait({
        window: { title: dialogTitle, icon: "fa-solid fa-sliders" },
        content,
        buttons: [
          {
            action: "save",
            label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Save"),
            icon: "fa-solid fa-check",
            default: true,
            callback: (event, button, dialogEl) => {
              return ResourceConfigDialog._extractFormData(dialogEl, currentTracker.id);
            }
          },
          ...(!isNew && onDelete ? [{
            action: "delete",
            label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Delete"),
            icon: "fa-solid fa-trash",
            callback: () => {
              onDelete(currentTracker.id);
              return null;
            }
          }] : []),
          {
            action: "cancel",
            label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Cancel"),
            icon: "fa-solid fa-xmark"
          }
        ],
        render: (event, dialogEl) => {
          ResourceConfigDialog._setupEventListeners(dialogEl);
        }
      });

      if (result && result !== "cancel" && result !== "delete") {
        if (typeof onSave === "function") {
          onSave(result);
        }
      }
    } else {
      dialog = new Dialog(dialogOptions, {
        classes: ["pf2e-gm-utility-dialog", "pf2e-resource-config-dialog"],
        width: 520,
        height: "auto",
        resizable: true
      });
      const result = await new Promise((resolve) => {
        dialogOptions.buttons.save.callback = (html) => {
          const root = html instanceof HTMLElement ? html : (html?.[0] || null);
          resolve(ResourceConfigDialog._extractFormData(root, currentTracker.id));
        };
        dialogOptions.buttons.cancel.callback = () => resolve(null);
        if (buttons.delete) {
          dialogOptions.buttons.delete.callback = () => {
            if (onDelete) onDelete(currentTracker.id);
            resolve(null);
          };
        }
        dialog.render(true);
      });

      if (result && typeof onSave === "function") {
        onSave(result);
      }
    }
  }

  /**
   * Sets up interactive elements within the configuration dialog (file picker, presets, type toggles).
   * @param {HTMLElement} root
   */
  static _setupEventListeners(root) {
    // 1. Dynamic Type Visibility
    const typeSelect = root.querySelector('[name="type"]');
    const clockGroup = root.querySelector(".clock-options-group");
    const stageGroup = root.querySelector(".stage-options-group");
    const minMaxGroup = root.querySelector(".min-max-group");

    const updateTypeVisibility = () => {
      const type = typeSelect ? typeSelect.value : "counter";
      if (clockGroup) clockGroup.style.display = type === "clock" ? "block" : "none";
      if (stageGroup) stageGroup.style.display = type === "stage" ? "block" : "none";
      if (minMaxGroup) minMaxGroup.style.display = type === "stage" ? "none" : "flex";
    };

    if (typeSelect) {
      typeSelect.addEventListener("change", updateTypeVisibility);
      updateTypeVisibility();
    }

    // 2. Preset Selection Auto-fill
    const presetSelect = root.querySelector(".preset-select");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        const selectedPresetId = e.target.value;
        const preset = DEFAULT_RESOURCE_PRESETS.find(p => p.presetId === selectedPresetId);
        if (!preset) return;

        // Auto-fill form fields
        const nameInput = root.querySelector('[name="name"]');
        const catSelect = root.querySelector('[name="category"]');
        const valInput = root.querySelector('[name="value"]');
        const minInput = root.querySelector('[name="min"]');
        const maxInput = root.querySelector('[name="max"]');
        const clockInput = root.querySelector('[name="clockSegments"]');
        const dirSelect = root.querySelector('[name="direction"]');
        const iconInput = root.querySelector('[name="icon"]');
        const colorSelect = root.querySelector('[name="color"]');
        const notesInput = root.querySelector('[name="notes"]');

        if (nameInput) nameInput.value = preset.name;
        if (catSelect) catSelect.value = preset.category;
        if (typeSelect) {
          typeSelect.value = preset.type;
          updateTypeVisibility();
        }
        if (valInput) valInput.value = preset.value;
        if (minInput) minInput.value = preset.min ?? 0;
        if (maxInput) maxInput.value = preset.max ?? (preset.clockSegments || 20);
        if (clockInput && preset.clockSegments) clockInput.value = preset.clockSegments;
        if (dirSelect) dirSelect.value = preset.direction || "countup";
        if (iconInput) {
          iconInput.value = preset.icon;
          ResourceConfigDialog._updateIconPreview(root, preset.icon);
        }
        if (colorSelect) colorSelect.value = preset.color || "gold";
        if (notesInput) notesInput.value = preset.notes || "";

        // Fill stage effects if stage preset
        if (preset.stages && stageGroup) {
          preset.stages.forEach((st) => {
            const effectInput = root.querySelector(`[name="stage_effect_${st.stage}"]`);
            if (effectInput) effectInput.value = st.effect || "";
          });
        }
      });
    }

    // 3. FilePicker for selecting image icons
    const browseBtn = root.querySelector(".btn-browse-icon");
    const iconInput = root.querySelector('[name="icon"]');
    if (browseBtn && iconInput) {
      browseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const currentPath = iconInput.value || "icons/";
        const fp = new FilePicker({
          type: "image",
          current: currentPath,
          callback: (path) => {
            iconInput.value = path;
            ResourceConfigDialog._updateIconPreview(root, path);
          }
        });
        fp.browse();
      });
    }

    // 4. Quick Icons palette click
    root.querySelectorAll(".quick-icon-pill").forEach(pill => {
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        const iconClass = pill.dataset.icon;
        if (iconInput && iconClass) {
          iconInput.value = iconClass;
          ResourceConfigDialog._updateIconPreview(root, iconClass);
        }
      });
    });

    // 5. Direct icon input typing preview
    if (iconInput) {
      iconInput.addEventListener("input", () => {
        ResourceConfigDialog._updateIconPreview(root, iconInput.value);
      });
      ResourceConfigDialog._updateIconPreview(root, iconInput.value);
    }

    // 6. Linked Actor auto-fill name hint
    const actorSelect = root.querySelector('[name="actorId"]');
    if (actorSelect) {
      actorSelect.addEventListener("change", (e) => {
        const actorId = e.target.value;
        const nameInput = root.querySelector('[name="name"]');
        if (actorId && nameInput && !nameInput.value.trim()) {
          const actor = game.actors.get(actorId);
          if (actor) {
            nameInput.value = `${actor.name}'s Tracker`;
          }
        }
      });
    }
  }

  /**
   * Updates the icon preview element (supporting FontAwesome classes and images).
   * @param {HTMLElement} root
   * @param {string} iconValue
   */
  static _updateIconPreview(root, iconValue) {
    const previewContainer = root.querySelector(".icon-preview-box");
    if (!previewContainer) return;

    const val = (iconValue || "").trim();
    if (!val) {
      previewContainer.innerHTML = `<i class="fa-solid fa-box"></i>`;
      return;
    }

    if (val.startsWith("fa-") || val.includes("fa-solid") || val.includes("fa-regular")) {
      previewContainer.innerHTML = `<i class="${val}"></i>`;
    } else {
      previewContainer.innerHTML = `<img src="${val}" alt="Icon" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />`;
    }
  }

  /**
   * Extracts clean tracker object from form inputs.
   * @param {HTMLElement} root
   * @param {string} id
   * @returns {object} Tracker data
   */
  static _extractFormData(root, id) {
    if (!root) return null;

    const getVal = (name) => {
      const el = root.querySelector(`[name="${name}"]`);
      return el ? el.value : "";
    };

    const type = getVal("type") || "counter";
    const min = Number(getVal("min")) || 0;
    const max = Number(getVal("max")) || 20;
    const rawVal = Number(getVal("value")) || 0;
    const clockSegments = Number(getVal("clockSegments")) || 6;

    // Build stages if stage type
    const stages = [];
    if (type === "stage") {
      for (let s = 1; s <= 5; s++) {
        const effect = getVal(`stage_effect_${s}`);
        stages.push({
          stage: s,
          name: `Stage ${s}`,
          effect: effect || ""
        });
      }
    }

    const clampedVal = type === "stage"
      ? Math.max(1, Math.min(5, rawVal || 1))
      : type === "clock"
        ? Math.max(0, Math.min(clockSegments, rawVal))
        : Math.max(min, Math.min(max, rawVal));

    return {
      id: id || `tracker-${foundry.utils.randomID(8)}`,
      name: getVal("name").trim() || "Resource Tracker",
      category: getVal("category") || "party",
      type: type,
      value: clampedVal,
      min: type === "stage" ? 1 : type === "clock" ? 0 : min,
      max: type === "stage" ? 5 : type === "clock" ? clockSegments : max,
      clockSegments: clockSegments,
      direction: getVal("direction") || "countup",
      actorId: getVal("actorId") || "",
      color: getVal("color") || "gold",
      icon: getVal("icon").trim() || "fa-solid fa-box",
      notes: getVal("notes").trim(),
      stages: stages
    };
  }
}
