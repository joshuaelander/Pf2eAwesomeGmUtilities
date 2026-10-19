/**
 * PF2e Awesome GM Utilities - Resource Tracker Configuration Dialog
 * Modal dialog for creating and editing resource, clock, and affliction trackers.
 */

import { MODULE_ID, COLOR_THEMES, DEFAULT_RESOURCE_PRESETS } from "./constants.js";

export class ResourceConfigDialog {
  /**
   * Resolves the dialog's root HTMLElement from any candidate object,
   * event, button, ApplicationV2/Dialog instance, or DOM query.
   * @param {...*} candidates
   * @returns {HTMLElement|null}
   */
  static _resolveRoot(...candidates) {
    for (const item of candidates) {
      if (!item) continue;
      // 1. If it's a DOM element (like a button or target)
      if (item instanceof HTMLElement) {
        const app = item.closest?.(".application") || item.closest?.(".window-app") || item.closest?.(".dialog");
        if (app) {
          const form = app.querySelector(".resource-config-form") || app.querySelector(".window-content");
          if (form) return form;
        }
        const configForm = item.closest?.(".resource-config-form");
        if (configForm) return configForm;
        const winContent = item.closest?.(".window-content");
        if (winContent) return winContent;
      }
      // 2. If it's an ApplicationV2 / Dialog instance with .element
      if (item?.element instanceof HTMLElement) {
        return item.element.querySelector?.(".resource-config-form") || item.element.querySelector?.(".window-content") || item.element;
      }
      // 3. If it's an Event
      if (item?.target) {
        const targetEl = item.target instanceof HTMLElement ? item.target : item.target?.element;
        if (targetEl instanceof HTMLElement) {
          const app = targetEl.closest?.(".application") || targetEl.closest?.(".window-app") || targetEl.closest?.(".dialog");
          if (app) {
            const form = app.querySelector(".resource-config-form") || app.querySelector(".window-content");
            if (form) return form;
          }
        }
      }
    }
    return document.querySelector(".resource-config-form") || document.querySelector(".pf2e-resource-config-dialog .window-content") || null;
  }

  /**
   * Cleans raw PF2e inline enrichment tags (@Check, @Damage, @Condition, @UUID) and HTML
   * into clean, readable text.
   * @param {string} rawText
   * @returns {string}
   */
  static cleanPf2eText(rawText) {
    if (!rawText) return "";
    let text = String(rawText);

    // 1. Strip HTML tags but preserve line breaks
    text = text.replace(/<br\s*[\/]?>/gi, " ");
    text = text.replace(/<\/p>/gi, " ");
    text = text.replace(/<[^>]+>/g, " ");

    // 2. Format @Check[...] tags: e.g. @Check[fortitude|dc:16], @Check[type:fortitude|dc:16], @Check[fortitude|dc:]
    text = text.replace(/@Check\[(?:type:)?([a-zA-Z]+)(?:\|dc:(\d*))?[^\]]*\]/gi, (match, type, dc) => {
      const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
      return dc ? `DC ${dc} ${typeCap}` : `${typeCap} Save`;
    });

    // 3. Format @Damage[...] tags: e.g. @Damage[3d8[void]], @Damage[(3d8)[void]], @Damage[1d6[poison]]
    text = text.replace(/@Damage\[\(?([0-9dD\+\-\s]+)\)?(?:\[([a-zA-Z]+)\])?[^\]]*\]/gi, (match, formula, dmgType) => {
      const f = formula.trim();
      return dmgType ? `${f} ${dmgType}` : f;
    });

    // 4. Format @Condition[...] tags: e.g. @Condition[clumsy|value:2]
    text = text.replace(/@Condition\[([a-zA-Z\-]+)(?:\|value:(\d+))?[^\]]*\]/gi, (match, cond, val) => {
      const condCap = cond.charAt(0).toUpperCase() + cond.slice(1);
      return val ? `${condCap} ${val}` : condCap;
    });

    // 5. Format @UUID[...] tags: e.g. @UUID[...]{Clumsy}
    text = text.replace(/@UUID\[[^\]]*\]\{([^}]+)\}/gi, "$1");
    text = text.replace(/@UUID\[[^\]]*\]/gi, "");

    // 6. Clean other Foundry tags
    text = text.replace(/@(Template|Localize)\[[^\]]*\]/gi, "");

    // 7. Clean whitespace and HTML entities
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/\s+/g, " ").trim();

    return text;
  }

  /**
   * Intelligently parses raw text (from monster stat blocks, abilities, chat messages, or PDFs)
   * into an affliction tracker object with dynamic stages, DC, and notes.
   * @param {string} rawText
   * @param {string} [fallbackName=""]
   * @returns {object|null}
   */
  static parseAfflictionFromText(rawText, fallbackName = "") {
    if (!rawText || typeof rawText !== "string") return null;

    const cleaned = ResourceConfigDialog.cleanPf2eText(rawText);

    // Look for stage markers (Stage 1, Stage 2, etc.)
    const hasStages = /Stage\s*1\b/i.test(cleaned) || /Stage\s*2\b/i.test(cleaned);
    if (!hasStages) return null;

    // 1. Clean Name (remove surrounding parentheses like "(Ghast Fever)")
    let name = (fallbackName || "").replace(/^\s*\(|\)\s*$/g, "").trim();
    if (!name) {
      // Try to find name before (disease) or (poison) or Saving Throw
      const nameMatch = cleaned.match(/^([A-Za-z0-9\s'-]+?)(?:\s*\((?:disease|poison|curse|virulent)[^)]*\)|\s*;\s*Level|\s*Saving Throw|\s*Stage\s*1)/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].replace(/^\s*\(|\)\s*$/g, "").trim();
      }
    }
    if (!name) name = "Affliction";

    // 2. Extract Save DC & Type
    let saveText = "";
    const saveMatch = cleaned.match(/(?:Saving Throw|Save)[:\s]+(?:(DC\s*\d+\s*(?:Fortitude|Reflex|Will)?|(?:Fortitude|Reflex|Will)\s*Save|(?:Fortitude|Reflex|Will)\s*DC\s*\d+))/i);
    if (saveMatch && saveMatch[1]) {
      saveText = saveMatch[1].trim();
    } else {
      const dcMatch = cleaned.match(/\b(DC\s*\d+\s*(?:Fortitude|Reflex|Will)?)\b/i);
      if (dcMatch) saveText = dcMatch[1].trim();
      else {
        const typeMatch = cleaned.match(/\b(Fortitude|Reflex|Will)\s*Save\b/i);
        if (typeMatch) saveText = typeMatch[0].trim();
      }
    }

    // 3. Extract Onset & Duration
    let onsetText = "";
    const onsetMatch = cleaned.match(/\bOnset\s*[:\s]*([0-9]+\s*[a-zA-Z]+)/i);
    if (onsetMatch) onsetText = onsetMatch[1].trim();

    let durationText = "";
    const durMatch = cleaned.match(/\b(?:Max(?:imum)?\s*)?Duration\s*[:\s]*([0-9]+\s*[a-zA-Z]+)/i);
    if (durMatch) durationText = durMatch[1].trim();

    // 4. Extract Stages
    const stageRegex = /Stage\s*(\d+)\s*[:\.\-]?\s*([\s\S]*?)(?=(?:Stage\s*\d+|\bOnset\b|\bMaximum\b|\bSaving Throw\b|$))/gi;
    const stages = [];
    let match;
    while ((match = stageRegex.exec(cleaned)) !== null) {
      const num = parseInt(match[1], 10);
      let effect = match[2].trim();
      effect = effect.replace(/[;,\.]\s*$/, "").trim();
      if (num && effect) {
        stages.push({
          stage: num,
          name: `Stage ${num}`,
          effect: effect
        });
      }
    }

    if (stages.length === 0) return null;

    // Sort stages by stage number
    stages.sort((a, b) => a.stage - b.stage);

    // Build clean notes
    const notesParts = [];
    if (saveText) notesParts.push(`Save: ${saveText}`);
    if (onsetText) notesParts.push(`Onset: ${onsetText}`);
    if (durationText) notesParts.push(`Max Duration: ${durationText}`);

    return {
      name: name,
      category: "actor",
      type: "stage",
      value: 1,
      min: 1,
      max: stages.length,
      color: "fire",
      icon: "fa-solid fa-biohazard",
      notes: notesParts.join(" | "),
      stages: stages
    };
  }

  /**
   * Extracts clean tracker data from a dragged PF2e Item document (Affliction, Consumable, Equipment, or Monster Ability).
   * @param {Item} item
   * @returns {object|null}
   */
  static extractItemData(item) {
    if (!item) return null;
    const system = item.system || {};

    // Clean name: strip parentheses if present (e.g. "(Ghast Fever)" -> "Ghast Fever")
    const cleanName = (item.name || "").replace(/^\s*\(|\)\s*$/g, "").trim();

    // 1. Check description text for affliction stages (handles monster abilities, strikes, actions)
    const descText = system.description?.value || "";
    const parsedFromDesc = ResourceConfigDialog.parseAfflictionFromText(descText, cleanName);
    if (parsedFromDesc) {
      if (item.img && !item.img.includes("mystery-man") && !item.img.includes("default-action") && !item.img.includes("action.svg")) {
        parsedFromDesc.icon = item.img;
      }
      return parsedFromDesc;
    }

    // 2. Official PF2e Compendium Affliction Item (with system.stages object/array)
    const isAffliction = item.type === "affliction" || Boolean(system.stages);
    if (isAffliction) {
      const stages = [];
      if (system.stages) {
        const rawStages = Array.isArray(system.stages)
          ? system.stages
          : Object.values(system.stages);

        rawStages.forEach((st, idx) => {
          const stageNum = st.stage || idx + 1;
          const conditionParts = [];
          if (st.conditions) {
            for (const [cName, cData] of Object.entries(st.conditions)) {
              const val = cData?.value ? ` ${cData.value}` : "";
              const cap = cName.charAt(0).toUpperCase() + cName.slice(1);
              conditionParts.push(`${cap}${val}`);
            }
          }
          if (st.damage) {
            for (const dmg of Object.values(st.damage)) {
              if (dmg?.formula) {
                conditionParts.push(`${dmg.formula} ${dmg.type || ""}`.trim());
              }
            }
          }
          if (st.text) {
            conditionParts.push(ResourceConfigDialog.cleanPf2eText(st.text));
          }

          stages.push({
            stage: stageNum,
            name: `Stage ${stageNum}`,
            effect: conditionParts.join("; ") || st.name || ""
          });
        });
      }

      // If no stages found in system.stages, provide at least 1-5 default stages
      if (stages.length === 0) {
        for (let s = 1; s <= 5; s++) {
          stages.push({ stage: s, name: `Stage ${s}`, effect: "" });
        }
      }

      const notesParts = [];
      if (system.save?.type || system.save?.value) {
        const saveType = system.save.type ? (system.save.type.charAt(0).toUpperCase() + system.save.type.slice(1)) : "Fortitude";
        notesParts.push(`Save: DC ${system.save.value || 15} ${saveType}`);
      }
      if (system.onset?.value) {
        notesParts.push(`Onset: ${system.onset.value} ${system.onset.unit || ""}`.trim());
      }
      if (system.duration?.value) {
        notesParts.push(`Max Duration: ${system.duration.value} ${system.duration.unit || ""}`.trim());
      }
      if (system.description?.value) {
        const cleanDesc = ResourceConfigDialog.cleanPf2eText(system.description.value);
        if (cleanDesc) {
          notesParts.push(cleanDesc.slice(0, 160) + (cleanDesc.length > 160 ? "..." : ""));
        }
      }

      return {
        name: cleanName,
        category: "actor",
        type: "stage",
        value: 1,
        min: 1,
        max: stages.length,
        color: "fire",
        icon: item.img || "fa-solid fa-biohazard",
        notes: notesParts.join(" | "),
        stages: stages
      };
    }

    // 3. Generic Consumable / Treasure / Equipment Counter
    const qty = system.quantity ?? 10;
    return {
      name: cleanName,
      category: "party",
      type: "counter",
      value: qty,
      min: 0,
      max: Math.max(20, qty * 2),
      color: "nature",
      icon: item.img || "fa-solid fa-box",
      notes: ResourceConfigDialog.cleanPf2eText(system.description?.value).slice(0, 140) || ""
    };
  }

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

    // Expanded quick icons for PF2e resources and subsystems
    const quickIcons = [
      { icon: "fa-solid fa-bread-slice", title: "Food / Bread" },
      { icon: "fa-solid fa-droplet", title: "Water / Potion" },
      { icon: "fa-solid fa-campground", title: "Camp / Supplies" },
      { icon: "fa-solid fa-trophy", title: "Victory Points" },
      { icon: "fa-solid fa-clock", title: "Clock / Time" },
      { icon: "fa-solid fa-bell", title: "Alert / Alarm" },
      { icon: "fa-solid fa-triangle-exclamation", title: "Danger / Alert" },
      { icon: "fa-solid fa-biohazard", title: "Disease / Sickened" },
      { icon: "fa-solid fa-flask-vial", title: "Poison / Elixir" },
      { icon: "fa-solid fa-skull", title: "Doom / Curse" },
      { icon: "fa-solid fa-brain", title: "Sanity / Stress" },
      { icon: "fa-solid fa-coins", title: "Treasure / Gold" },
      { icon: "fa-solid fa-shield-halved", title: "Defense / Armor" },
      { icon: "fa-solid fa-heart", title: "Health / Vigor" },
      { icon: "fa-solid fa-fire", title: "Torches / Fire" },
      { icon: "fa-solid fa-scroll", title: "Lore / Research" }
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

    let saved = false;

    // Dialog buttons definition
    const buttons = {
      save: {
        icon: '<i class="fa-solid fa-check"></i>',
        label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Save"),
        callback: (html) => {
          const root = ResourceConfigDialog._resolveRoot(html);
          const data = ResourceConfigDialog._extractFormData(root, currentTracker.id);
          if (data && typeof onSave === "function") {
            onSave(data);
            saved = true;
          }
          return data;
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
    const dialogOptions = {
      title: dialogTitle,
      content,
      buttons,
      default: "save",
      close: () => {},
      render: (html) => {
        const root = ResourceConfigDialog._resolveRoot(html);
        if (root) ResourceConfigDialog._setupEventListeners(root);
      }
    };

    if (foundry?.applications?.api?.DialogV2?.wait) {
      const result = await foundry.applications.api.DialogV2.wait({
        window: {
          title: dialogTitle,
          icon: "fa-solid fa-sliders",
          classes: ["pf2e-gm-utility-dialog", "pf2e-resource-config-dialog"]
        },
        position: { width: 560 },
        content,
        buttons: [
          {
            action: "save",
            label: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.Config.Save"),
            icon: "fa-solid fa-check",
            default: true,
            callback: (event, button, dialogEl) => {
              const root = ResourceConfigDialog._resolveRoot(button, event, dialogEl);
              const data = ResourceConfigDialog._extractFormData(root, currentTracker.id);
              if (data && typeof onSave === "function") {
                onSave(data);
                saved = true;
              }
              return data;
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
          const root = ResourceConfigDialog._resolveRoot(event, dialogEl);
          if (root) ResourceConfigDialog._setupEventListeners(root);
        }
      });

      // If the promise resolved with a data object and callback hasn't already handled it
      if (!saved && result && typeof result === "object" && typeof onSave === "function") {
        onSave(result);
      }
    } else {
      const dialog = new Dialog(dialogOptions, {
        classes: ["pf2e-gm-utility-dialog", "pf2e-resource-config-dialog"],
        width: 560,
        height: "auto",
        resizable: true
      });
      const result = await new Promise((resolve) => {
        dialogOptions.buttons.save.callback = (html) => {
          const root = ResourceConfigDialog._resolveRoot(html);
          const data = ResourceConfigDialog._extractFormData(root, currentTracker.id);
          if (data && typeof onSave === "function") {
            onSave(data);
            saved = true;
          }
          resolve(data);
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

      if (!saved && result && typeof result === "object" && typeof onSave === "function") {
        onSave(result);
      }
    }
  }

  /**
   * Sets up interactive elements within the configuration dialog (file picker, presets, type toggles, drag & drop, text parsing).
   * @param {HTMLElement|*} rootCandidate
   */
  static _setupEventListeners(rootCandidate) {
    const root = ResourceConfigDialog._resolveRoot(rootCandidate);
    if (!root) return;

    // 1. Dynamic Type Visibility
    const typeSelect = root.querySelector('[name="type"]');
    const clockGroup = root.querySelector(".clock-options-group");
    const stageGroup = root.querySelector(".stage-options-group");
    const minMaxGroup = root.querySelector(".min-max-group");

    const updateTypeVisibility = () => {
      const type = typeSelect ? typeSelect.value : "counter";
      if (clockGroup) clockGroup.style.display = type === "clock" ? "block" : "none";
      if (stageGroup) stageGroup.style.display = type === "stage" ? "block" : "none";
      if (minMaxGroup) minMaxGroup.style.display = type === "stage" ? "none" : "";
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
        const nameInput = root.querySelector('[name="name"]') || root.querySelector(".tracker-name-input");
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
          ResourceConfigDialog.renderStageRows(root, preset.stages);
        }
      });
    }

    // 3. Quick Paste Text Parser Button
    const parseBtn = root.querySelector(".btn-parse-text");
    const pasteInput = root.querySelector(".quick-paste-input");
    if (parseBtn && pasteInput) {
      parseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const rawText = pasteInput.value.trim();
        if (!rawText) {
          ui.notifications.warn("Please paste some affliction or monster ability text into the box first.");
          return;
        }

        const parsed = ResourceConfigDialog.parseAfflictionFromText(rawText);
        if (!parsed) {
          ui.notifications.warn("Could not find affliction stages (e.g. Stage 1...) in the pasted text.");
          return;
        }

        ResourceConfigDialog.populateFormWithTracker(root, parsed);
        pasteInput.value = "";
        ui.notifications.info(`Successfully parsed "${parsed.name}" with ${parsed.stages.length} stages!`);
      });
    }

    // 4. Dynamic Stage Add & Remove Controls
    const addStageBtn = root.querySelector(".btn-add-stage");
    if (addStageBtn) {
      addStageBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const list = root.querySelector(".stages-inputs-list");
        if (!list) return;

        const currentRows = list.querySelectorAll(".stage-input-row");
        const nextNum = currentRows.length + 1;
        const row = document.createElement("div");
        row.className = "stage-input-row";
        row.dataset.stage = String(nextNum);
        row.innerHTML = `
          <span class="stage-badge">Stage ${nextNum}</span>
          <input type="text" name="stage_effect_${nextNum}" class="stage-effect-input" placeholder="e.g. Clumsy 1, Sickened 1, Lethal..." />
          <button type="button" class="btn-remove-stage" data-stage="${nextNum}" title="Remove this stage">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;
        list.appendChild(row);
        ResourceConfigDialog._bindStageRowEvents(root);
      });
    }

    ResourceConfigDialog._bindStageRowEvents(root);

    // 5. FilePicker for selecting image icons
    const browseBtn = root.querySelector(".btn-browse-icon");
    const iconInput = root.querySelector('[name="icon"]');
    if (browseBtn && iconInput) {
      browseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const currentPath = iconInput.value && (iconInput.value.includes("/") || iconInput.value.includes("."))
          ? iconInput.value
          : "icons/";
        const fp = new FilePicker({
          type: "image",
          current: currentPath,
          callback: (path) => {
            iconInput.value = path;
            ResourceConfigDialog._updateIconPreview(root, path);
          }
        });
        fp.browse(currentPath);
      });
    }

    // 6. Quick Icons palette click
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

    // 7. Direct icon input typing preview
    if (iconInput) {
      iconInput.addEventListener("input", () => {
        ResourceConfigDialog._updateIconPreview(root, iconInput.value);
      });
      ResourceConfigDialog._updateIconPreview(root, iconInput.value);
    }

    // 8. Linked Actor auto-fill name hint
    const actorSelect = root.querySelector('[name="actorId"]');
    if (actorSelect) {
      actorSelect.addEventListener("change", (e) => {
        const actorId = e.target.value;
        const nameInput = root.querySelector('[name="name"]') || root.querySelector(".tracker-name-input");
        if (actorId && nameInput && !nameInput.value.trim()) {
          const actor = game.actors.get(actorId);
          if (actor) {
            nameInput.value = `${actor.name}'s Tracker`;
          }
        }
      });
    }

    // 9. Drag & Drop Support: Items, Chat Messages, Actors, or Plain Text
    root.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    root.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rawText = e.dataTransfer.getData("text/plain");
      let dropData = null;
      try {
        dropData = JSON.parse(rawText);
      } catch (err) {
        dropData = null;
      }

      let trackerData = null;

      if (dropData?.type === "Item" && dropData?.uuid) {
        const item = await fromUuid(dropData.uuid);
        if (item) trackerData = ResourceConfigDialog.extractItemData(item);
      } else if (dropData?.type === "ChatMessage" && dropData?.id) {
        const msg = game.messages.get(dropData.id);
        if (msg) trackerData = ResourceConfigDialog.parseAfflictionFromText(msg.content, msg.flavor || "Affliction");
      } else if (dropData?.type === "Actor" && dropData?.uuid) {
        const actor = await fromUuid(dropData.uuid);
        if (actor) {
          for (const it of actor.items) {
            const candidate = ResourceConfigDialog.extractItemData(it);
            if (candidate && candidate.type === "stage") {
              trackerData = candidate;
              break;
            }
          }
          if (!trackerData) {
            const actorSelectEl = root.querySelector('[name="actorId"]');
            if (actorSelectEl) actorSelectEl.value = actor.id;
            const nameInput = root.querySelector('[name="name"]') || root.querySelector(".tracker-name-input");
            if (nameInput && !nameInput.value) nameInput.value = `${actor.name}'s Tracker`;
          }
        }
      } else if (rawText && typeof rawText === "string") {
        trackerData = ResourceConfigDialog.parseAfflictionFromText(rawText);
      }

      if (trackerData) {
        ResourceConfigDialog.populateFormWithTracker(root, trackerData);
        ui.notifications.info(`Auto-filled tracker from: ${trackerData.name}`);
      }
    });
  }

  /**
   * Helper to populate form fields with tracker data and re-render dynamic stage rows.
   * @param {HTMLElement} root
   * @param {object} trackerData
   */
  static populateFormWithTracker(root, trackerData) {
    if (!root || !trackerData) return;

    const nameInput = root.querySelector('[name="name"]') || root.querySelector(".tracker-name-input");
    const catSelect = root.querySelector('[name="category"]');
    const typeSelect = root.querySelector('[name="type"]');
    const iconInput = root.querySelector('[name="icon"]');
    const colorSelect = root.querySelector('[name="color"]');
    const notesInput = root.querySelector('[name="notes"]');

    if (nameInput) nameInput.value = trackerData.name;
    if (catSelect && trackerData.category) catSelect.value = trackerData.category;
    if (typeSelect && trackerData.type) {
      typeSelect.value = trackerData.type;
      typeSelect.dispatchEvent(new Event("change"));
    }
    if (iconInput && trackerData.icon) {
      iconInput.value = trackerData.icon;
      ResourceConfigDialog._updateIconPreview(root, trackerData.icon);
    }
    if (colorSelect && trackerData.color) colorSelect.value = trackerData.color;
    if (notesInput && trackerData.notes) notesInput.value = trackerData.notes;

    if (trackerData.type === "stage" && trackerData.stages && trackerData.stages.length > 0) {
      ResourceConfigDialog.renderStageRows(root, trackerData.stages);
    }
  }

  /**
   * Re-renders the dynamic stage input rows inside the configuration dialog.
   * @param {HTMLElement} root
   * @param {Array<object>} stages
   */
  static renderStageRows(root, stages) {
    const list = root.querySelector(".stages-inputs-list");
    if (!list) return;

    list.innerHTML = "";
    stages.forEach((st, idx) => {
      const stageNum = st.stage || idx + 1;
      const row = document.createElement("div");
      row.className = "stage-input-row";
      row.dataset.stage = String(stageNum);
      row.innerHTML = `
        <span class="stage-badge">Stage ${stageNum}</span>
        <input type="text" name="stage_effect_${stageNum}" class="stage-effect-input" value="${st.effect || ""}" placeholder="e.g. Carrier (1 day) / Clumsy 1, Sickened 1 / Lethal..." />
        <button type="button" class="btn-remove-stage" data-stage="${stageNum}" title="Remove this stage">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      list.appendChild(row);
    });

    ResourceConfigDialog._bindStageRowEvents(root);
  }

  /**
   * Binds click handlers to stage remove buttons and renumbers rows on deletion.
   * @param {HTMLElement} root
   */
  static _bindStageRowEvents(root) {
    const removeBtns = root.querySelectorAll(".btn-remove-stage");
    removeBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const row = btn.closest(".stage-input-row");
        if (!row) return;
        const list = row.parentElement;
        row.remove();

        // Renumber remaining rows
        if (list) {
          const remainingRows = list.querySelectorAll(".stage-input-row");
          remainingRows.forEach((r, idx) => {
            const num = idx + 1;
            r.dataset.stage = String(num);
            const badge = r.querySelector(".stage-badge");
            if (badge) badge.textContent = `Stage ${num}`;
            const input = r.querySelector(".stage-effect-input");
            if (input) input.name = `stage_effect_${num}`;
            const removeBtn = r.querySelector(".btn-remove-stage");
            if (removeBtn) removeBtn.dataset.stage = String(num);
          });
        }
      };
    });
  }

  /**
   * Updates the icon preview element (supporting FontAwesome classes and images).
   * @param {HTMLElement|*} rootCandidate
   * @param {string} iconValue
   */
  static _updateIconPreview(rootCandidate, iconValue) {
    const root = ResourceConfigDialog._resolveRoot(rootCandidate);
    if (!root) return;
    const previewContainer = root.querySelector(".icon-preview-box");
    if (!previewContainer) return;

    const val = (iconValue || "").trim();
    if (!val) {
      previewContainer.innerHTML = `<i class="fa-solid fa-box" style="font-size: 22px; color: #64748b;"></i>`;
      return;
    }

    if (val.startsWith("fa-") || val.includes("fa-solid") || val.includes("fa-regular") || val.includes("fa-")) {
      previewContainer.innerHTML = `<i class="${val}" style="font-size: 22px; color: #d4af37;"></i>`;
    } else {
      previewContainer.innerHTML = `<img src="${val}" alt="Icon" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />`;
    }
  }

  /**
   * Extracts clean tracker object from form inputs.
   * @param {HTMLElement|*} rootCandidate
   * @param {string} id
   * @returns {object|null} Tracker data
   */
  static _extractFormData(rootCandidate, id) {
    const root = ResourceConfigDialog._resolveRoot(rootCandidate);
    if (!root) return null;

    const getVal = (name) => {
      let el = root.querySelector(`[name="${name}"]`);
      if (!el && name === "name") {
        el = root.querySelector(".tracker-name-input") || document.querySelector(".tracker-name-input");
      }
      return el ? el.value : "";
    };

    const type = getVal("type") || "counter";
    const min = Number(getVal("min")) || 0;
    const max = Number(getVal("max")) || 20;
    const rawVal = Number(getVal("value")) || 0;
    const clockSegments = Number(getVal("clockSegments")) || 6;
    const rawName = getVal("name").trim();

    // Build dynamic stages from DOM rows if stage type
    const stages = [];
    if (type === "stage") {
      const rows = root.querySelectorAll(".stage-input-row");
      if (rows && rows.length > 0) {
        rows.forEach((row, idx) => {
          const num = idx + 1;
          const input = row.querySelector(".stage-effect-input") || row.querySelector(`[name^="stage_effect_"]`);
          const effect = input ? input.value.trim() : "";
          stages.push({
            stage: num,
            name: `Stage ${num}`,
            effect: effect
          });
        });
      } else {
        for (let s = 1; s <= 5; s++) {
          const effect = getVal(`stage_effect_${s}`);
          stages.push({
            stage: s,
            name: `Stage ${s}`,
            effect: effect || ""
          });
        }
      }
    }

    const maxStages = stages.length > 0 ? stages.length : 5;

    const clampedVal = type === "stage"
      ? Math.max(1, Math.min(maxStages, rawVal || 1))
      : type === "clock"
        ? Math.max(0, Math.min(clockSegments, rawVal))
        : Math.max(min, Math.min(max, rawVal));

    return {
      id: id || `tracker-${foundry.utils.randomID(8)}`,
      name: rawName || "Resource Tracker",
      category: getVal("category") || "party",
      type: type,
      value: clampedVal,
      min: type === "stage" ? 1 : type === "clock" ? 0 : min,
      max: type === "stage" ? maxStages : type === "clock" ? clockSegments : max,
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
