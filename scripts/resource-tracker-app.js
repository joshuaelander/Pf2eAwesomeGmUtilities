/**
 * PF2e Awesome GM Utilities - Resource & Subsystem Tracker App
 * Floating ApplicationV2 window for tracking party resources (food, water, supplies),
 * subsystem metrics (Victory Points, infiltration prep, alert clocks, doom countdowns),
 * and per-PC meters (sanity/stress, disease/curse stages).
 */

import {
  MODULE_ID,
  COLOR_THEMES,
  DEFAULT_RESOURCE_PRESETS,
  DEFAULT_RESOURCE_TRACKERS
} from "./constants.js";
import { ResourceConfigDialog } from "./resource-config-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ResourceTrackerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);

    this._activeCategory = "all"; // 'all' | 'party' | 'subsystem' | 'actor'
    this._filterQuery = "";
    this._onKeyDownBound = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-resource-tracker",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-resource-tracker-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.ResourceTracker.Title",
      icon: "fa-solid fa-cubes-stacked",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 620,
      height: "auto",
      left: 160,
      top: 120
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/resource-tracker.hbs`
    }
  };

  /* ------------------------------------------------------------------------- */
  /* Lifecycle & Render Protection                                             */
  /* ------------------------------------------------------------------------- */

  /**
   * Safe render wrapper ensuring compatibility with legacy boolean invocations.
   * @param {object|boolean} options
   * @param {object} [_legacyOptions]
   */
  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = { force: options };
    }
    return super.render(options, _legacyOptions);
  }

  /**
   * Toggle opening or closing of the tracker window.
   */
  toggle() {
    if (this.rendered) {
      this.close();
    } else {
      this.render({ force: true });
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Data Context Preparation                                                  */
  /* ------------------------------------------------------------------------- */

  /**
   * Generates SVG slice paths for radial subsystem clocks.
   * @param {number} totalSegments 4, 6, 8, 10, or 12
   * @param {number} filledSegments Current filled segments
   * @param {string} color Hex or theme color for filled slices
   * @returns {Array<object>} Slice objects with path data
   */
  static _generateClockSlices(totalSegments, filledSegments, color = "#d4af37") {
    const slices = [];
    const cx = 50;
    const cy = 50;
    const r = 42;
    const innerR = 10; // inner hub hole for modern donut/radial look

    for (let i = 0; i < totalSegments; i++) {
      const segNum = i + 1;
      const isFilled = segNum <= filledSegments;

      // Start at 12 o'clock (-PI / 2) and advance clockwise
      const startAngle = (i / totalSegments) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((i + 1) / totalSegments) * 2 * Math.PI - Math.PI / 2;

      // Outer arc points
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      // Inner arc points
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);

      // Construct SVG donut wedge path
      const largeArc = 0;
      const path = [
        `M ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
        `L ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
        "Z"
      ].join(" ");

      slices.push({
        segment: segNum,
        isFilled,
        path,
        fillColor: isFilled ? color : "rgba(255, 255, 255, 0.07)",
        strokeColor: isFilled ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.15)"
      });
    }

    return slices;
  }

  /**
   * Prepares template data context.
   */
  async _prepareContext(options = {}) {
    let rawTrackers = game.settings.get(MODULE_ID, "resourceTrackers");
    if (!Array.isArray(rawTrackers) || rawTrackers.length === 0) {
      rawTrackers = foundry.utils.deepClone(DEFAULT_RESOURCE_TRACKERS);
      if (game.user.isGM) {
        await game.settings.set(MODULE_ID, "resourceTrackers", rawTrackers);
      }
    }

    // Counts for category badges
    const allCount = rawTrackers.length;
    const partyCount = rawTrackers.filter(t => t.category === "party").length;
    const subsystemCount = rawTrackers.filter(t => t.category === "subsystem").length;
    const actorCount = rawTrackers.filter(t => t.category === "actor").length;

    // Filter trackers based on tab & search query
    let filtered = rawTrackers;
    if (this._activeCategory && this._activeCategory !== "all") {
      filtered = filtered.filter(t => t.category === this._activeCategory);
    }
    if (this._filterQuery && this._filterQuery.trim() !== "") {
      const q = this._filterQuery.trim().toLowerCase();
      filtered = filtered.filter(t =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // Enriched trackers for template
    const trackers = filtered.map((t, index) => {
      const theme = COLOR_THEMES[t.color] || COLOR_THEMES.gold;

      // Linked player character
      let linkedActor = null;
      if (t.actorId) {
        const actor = game.actors.get(t.actorId);
        if (actor) {
          linkedActor = {
            id: actor.id,
            name: actor.name,
            img: actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg"
          };
        }
      }

      // Icon detection: image path vs fontawesome icon class
      const isImageIcon = Boolean(
        t.icon && (t.icon.includes("/") || t.icon.includes("."))
      );

      // Type flags
      const isCounter = t.type === "counter";
      const isProgress = t.type === "progress";
      const isClock = t.type === "clock";
      const isStage = t.type === "stage";
      const isCountdown = t.direction === "countdown";

      // Numerical range calculation
      const minVal = t.min ?? 0;
      const maxVal = t.max ?? 100;
      const currentVal = t.value ?? minVal;

      // Progress bar percentage
      const range = Math.max(1, maxVal - minVal);
      const progressPercent = Math.min(
        100,
        Math.max(0, Math.round(((currentVal - minVal) / range) * 100))
      );

      // Clock slice data
      let clockSlices = [];
      let clockPips = [];
      let isClockFull = false;
      if (isClock) {
        const totalSegments = t.clockSegments || 6;
        const clampedVal = Math.min(totalSegments, Math.max(0, currentVal));
        isClockFull = clampedVal >= totalSegments;
        clockSlices = ResourceTrackerApp._generateClockSlices(totalSegments, clampedVal, theme.border || theme.color);

        for (let i = 1; i <= totalSegments; i++) {
          clockPips.push({
            segment: i,
            isFilled: i <= clampedVal,
            active: i === clampedVal
          });
        }
      }

      // Stage affliction data
      let stages = [];
      let currentStageName = "";
      let currentStageEffect = "";
      if (isStage) {
        const rawStages = t.stages && t.stages.length >= 5 ? t.stages : [
          { stage: 1, name: "Stage 1", effect: "" },
          { stage: 2, name: "Stage 2", effect: "" },
          { stage: 3, name: "Stage 3", effect: "" },
          { stage: 4, name: "Stage 4", effect: "" },
          { stage: 5, name: "Stage 5", effect: "" }
        ];

        const activeStageNum = Math.min(5, Math.max(1, currentVal));
        stages = rawStages.map(s => ({
          stage: s.stage,
          name: s.name || `Stage ${s.stage}`,
          effect: s.effect || "",
          isCurrent: s.stage === activeStageNum,
          isCompleted: s.stage < activeStageNum
        }));

        const activeStage = rawStages.find(s => s.stage === activeStageNum) || rawStages[0];
        currentStageName = activeStage.name || `Stage ${activeStageNum}`;
        currentStageEffect = activeStage.effect || "";
      }

      return {
        ...t,
        index,
        theme,
        linkedActor,
        isImageIcon,
        isCounter,
        isProgress,
        isClock,
        isStage,
        isCountdown,
        progressPercent,
        clockSlices,
        clockPips,
        isClockFull,
        stages,
        currentStageName,
        currentStageEffect,
        canDecrease: currentVal > minVal,
        canIncrease: currentVal < maxVal
      };
    });

    // Quick presets dropdown list
    const presets = DEFAULT_RESOURCE_PRESETS.map(p => ({
      id: p.presetId,
      name: p.name,
      category: p.category,
      type: p.type
    }));

    return {
      trackers,
      hasTrackers: trackers.length > 0,
      totalCount: rawTrackers.length,
      activeCategory: this._activeCategory,
      filterQuery: this._filterQuery,
      allCount,
      partyCount,
      subsystemCount,
      actorCount,
      presets,
      isGM: game.user.isGM
    };
  }

  /* ------------------------------------------------------------------------- */
  /* DOM Event Handlers & Native Listeners                                     */
  /* ------------------------------------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    // Apply custom opacity if configured
    const opacity = game.settings.get(MODULE_ID, "resourceTrackerOpacity") || 100;
    root.style.opacity = `${opacity / 100}`;

    // Listen for Escape key to close the window
    if (!this._onKeyDownBound) {
      this._onKeyDownBound = (e) => {
        if (e.key === "Escape" && this.rendered) {
          e.preventDefault();
          this.close();
        }
      };
      window.addEventListener("keydown", this._onKeyDownBound);
    }

    // Scoped strictly to the container to avoid intercepting window header buttons
    const container = root.querySelector(".pf2e-resource-tracker-container") || root;

    // Category Tabs
    container.querySelectorAll(".tracker-category-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const cat = tab.dataset.category || "all";
        this._activeCategory = cat;
        this.render({ force: false });
      });
    });

    // Filter Search Input
    const searchInput = container.querySelector(".tracker-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this._filterQuery = e.target.value;
        this._applyLiveFilter(container);
      });
    }

    // Quick Preset Selector
    const presetSelect = container.querySelector(".quick-preset-select");
    const addPresetBtn = container.querySelector(".btn-add-preset");
    if (addPresetBtn && presetSelect) {
      addPresetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const presetId = presetSelect.value;
        if (presetId) {
          this.openCreateDialog(presetId);
        }
      });
    }

    // Action buttons inside the tracker container
    container.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", this._handleActionClick.bind(this));
    });
  }

  _onClose(options) {
    if (this._onKeyDownBound) {
      window.removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
    }
    super._onClose(options);
  }

  /**
   * Applies client-side live filter for instant feedback without full re-render.
   */
  _applyLiveFilter(container) {
    const query = this._filterQuery.trim().toLowerCase();
    const cards = container.querySelectorAll(".resource-tracker-card");
    cards.forEach(card => {
      const name = (card.dataset.name || "").toLowerCase();
      const notes = (card.dataset.notes || "").toLowerCase();
      const match = !query || name.includes(query) || notes.includes(query);
      card.style.display = match ? "" : "none";
    });
  }

  /**
   * Handles user clicks on interactive data-action elements.
   */
  async _handleActionClick(event) {
    const actionEl = event.currentTarget;
    const action = actionEl.dataset.action;
    const trackerId = actionEl.dataset.id;

    if (action === "close") {
      event.preventDefault();
      return this.close();
    }

    event.preventDefault();
    event.stopPropagation();

    switch (action) {
      case "add-tracker":
        await this.openCreateDialog();
        break;

      case "adjust-value": {
        const delta = parseInt(actionEl.dataset.delta, 10) || 0;
        await this.adjustValue(trackerId, delta);
        break;
      }

      case "set-clock-segment": {
        const seg = parseInt(actionEl.dataset.segment, 10);
        await this.setClockSegment(trackerId, seg);
        break;
      }

      case "set-stage": {
        const stageNum = parseInt(actionEl.dataset.stage, 10);
        await this.setValue(trackerId, stageNum);
        break;
      }

      case "reset-tracker":
        await this.resetValue(trackerId);
        break;

      case "post-chat":
        await this.postToChat(trackerId);
        break;

      case "edit-tracker":
        await this.openEditDialog(trackerId);
        break;

      case "delete-tracker":
        await this.deleteTracker(trackerId);
        break;

      case "move-up":
        await this.reorderTracker(trackerId, -1);
        break;

      case "move-down":
        await this.reorderTracker(trackerId, 1);
        break;
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Tracker CRUD & Persistence Operations                                     */
  /* ------------------------------------------------------------------------- */

  /**
   * Adjusts the tracker's current value by delta (+1, -1, +5, -5).
   * @param {string} id Tracker ID
   * @param {number} delta Amount to change
   */
  async adjustValue(id, delta) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    let min = tracker.min ?? 0;
    let max = tracker.max ?? 100;

    if (tracker.type === "clock") {
      min = 0;
      max = tracker.clockSegments || 6;
    } else if (tracker.type === "stage") {
      min = 1;
      max = 5;
    }

    const current = tracker.value ?? min;
    const newVal = Math.min(max, Math.max(min, current + delta));
    tracker.value = newVal;

    await this.saveTrackers(trackers);
  }

  /**
   * Sets tracker directly to a specific value.
   * @param {string} id Tracker ID
   * @param {number} val Desired value
   */
  async setValue(id, val) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    let min = tracker.min ?? 0;
    let max = tracker.max ?? 100;

    if (tracker.type === "clock") {
      min = 0;
      max = tracker.clockSegments || 6;
    } else if (tracker.type === "stage") {
      min = 1;
      max = 5;
    }

    tracker.value = Math.min(max, Math.max(min, val));
    await this.saveTrackers(trackers);
  }

  /**
   * Clicking a clock segment: if clicking the current segment, un-fill by 1;
   * otherwise fill up to that segment.
   * @param {string} id
   * @param {number} segment
   */
  async setClockSegment(id, segment) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker || tracker.type !== "clock") return;

    const max = tracker.clockSegments || 6;
    if (tracker.value === segment) {
      // Toggle down by 1
      tracker.value = Math.max(0, segment - 1);
    } else {
      tracker.value = Math.min(max, Math.max(0, segment));
    }

    await this.saveTrackers(trackers);
  }

  /**
   * Resets tracker value to initial baseline.
   * Countup resets to min; Countdown resets to max.
   * @param {string} id
   */
  async resetValue(id) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    if (tracker.type === "clock") {
      tracker.value = tracker.direction === "countdown" ? (tracker.clockSegments || 6) : 0;
    } else if (tracker.type === "stage") {
      tracker.value = 1;
    } else {
      tracker.value = tracker.direction === "countdown" ? (tracker.max ?? 100) : (tracker.min ?? 0);
    }

    await this.saveTrackers(trackers);
  }

  /**
   * Opens dialog to create a new tracker, optionally seeded with a preset.
   * @param {string|null} [presetId]
   */
  async openCreateDialog(presetId = null) {
    let initialData = null;
    if (presetId) {
      const preset = DEFAULT_RESOURCE_PRESETS.find(p => p.presetId === presetId);
      if (preset) {
        initialData = foundry.utils.deepClone(preset);
        initialData.id = `tracker-${foundry.utils.randomID(8)}`;
      }
    }

    await ResourceConfigDialog.open(initialData, async (newTracker) => {
      const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
      trackers.push(newTracker);
      await this.saveTrackers(trackers);
      ui.notifications.info(
        game.i18n.format("PF2E_AWESOME_GM.ResourceTracker.Notifications.Saved", { name: newTracker.name })
      );
    });
  }

  /**
   * Opens dialog to edit an existing tracker.
   * @param {string} id
   */
  async openEditDialog(id) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    await ResourceConfigDialog.open(
      tracker,
      async (updatedTracker) => {
        const idx = trackers.findIndex(t => t.id === id);
        if (idx >= 0) {
          trackers[idx] = updatedTracker;
          await this.saveTrackers(trackers);
          ui.notifications.info(
            game.i18n.format("PF2E_AWESOME_GM.ResourceTracker.Notifications.Saved", { name: updatedTracker.name })
          );
        }
      },
      async (deleteId) => {
        await this.deleteTracker(deleteId);
      }
    );
  }

  /**
   * Deletes a tracker from the list.
   * @param {string} id
   */
  async deleteTracker(id) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    let confirmed = false;
    const confirmMsg = `<p>${game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.DeleteConfirm")}</p><p><strong>${tracker.name}</strong></p>`;

    if (foundry?.applications?.api?.DialogV2?.confirm) {
      confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.DeleteTracker"), icon: "fa-solid fa-trash" },
        content: confirmMsg,
        rejectClose: false
      });
    } else {
      confirmed = await new Promise((resolve) => {
        Dialog.confirm({
          title: game.i18n.localize("PF2E_AWESOME_GM.ResourceTracker.DeleteTracker"),
          content: confirmMsg,
          yes: () => resolve(true),
          no: () => resolve(false),
          defaultYes: false
        });
      });
    }

    if (!confirmed) return;

    const remaining = trackers.filter(t => t.id !== id);
    await this.saveTrackers(remaining);
    ui.notifications.info(
      game.i18n.format("PF2E_AWESOME_GM.ResourceTracker.Notifications.Deleted", { name: tracker.name })
    );
  }

  /**
   * Reorders a tracker within the list.
   * @param {string} id
   * @param {number} delta -1 for up, 1 for down
   */
  async reorderTracker(id, delta) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const idx = trackers.findIndex(t => t.id === id);
    if (idx < 0) return;

    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= trackers.length) return;

    const [moved] = trackers.splice(idx, 1);
    trackers.splice(targetIdx, 0, moved);

    await this.saveTrackers(trackers);
  }

  /**
   * Saves updated trackers array to world settings and re-renders window.
   * @param {Array<object>} trackers
   */
  async saveTrackers(trackers) {
    await game.settings.set(MODULE_ID, "resourceTrackers", trackers);
    this.render({ force: false });
  }

  /* ------------------------------------------------------------------------- */
  /* Chat Dispatch Integration                                                 */
  /* ------------------------------------------------------------------------- */

  /**
   * Posts an authentic PF2e formatted card to game chat with the tracker's current status.
   * @param {string} id
   */
  async postToChat(id) {
    const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const tracker = trackers.find(t => t.id === id);
    if (!tracker) return;

    const theme = COLOR_THEMES[tracker.color] || COLOR_THEMES.gold;
    const actor = tracker.actorId ? game.actors.get(tracker.actorId) : null;
    const actorImg = actor?.img || actor?.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";

    // Icon or Image
    let iconHtml = "";
    if (tracker.icon) {
      if (tracker.icon.includes("/") || tracker.icon.includes(".")) {
        iconHtml = `<img src="${tracker.icon}" alt="${tracker.name}" class="chat-card-icon-img" />`;
      } else {
        iconHtml = `<i class="${tracker.icon} chat-card-icon-fa" style="color: ${theme.border};"></i>`;
      }
    }

    // Body content based on tracker type
    let bodyHtml = "";
    if (tracker.type === "counter") {
      const min = tracker.min ?? 0;
      const max = tracker.max ?? 100;
      const val = tracker.value ?? min;
      bodyHtml = `
        <div class="pf2e-resource-stat-row">
          <span class="stat-badge value-badge" style="background: ${theme.color};">${val}</span>
          <span class="stat-label">Range: <strong>${min} &mdash; ${max}</strong></span>
        </div>
      `;
    } else if (tracker.type === "progress") {
      const min = tracker.min ?? 0;
      const max = tracker.max ?? 100;
      const val = tracker.value ?? min;
      const range = Math.max(1, max - min);
      const pct = Math.min(100, Math.max(0, Math.round(((val - min) / range) * 100)));
      bodyHtml = `
        <div class="pf2e-resource-progress-stat">
          <div class="progress-bar-rail" style="background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; height: 14px; border: 1px solid ${theme.border};">
            <div class="progress-bar-fill" style="width: ${pct}%; background: ${theme.border}; height: 100%;"></div>
          </div>
          <div class="progress-labels" style="display: flex; justify-content: space-between; font-size: 0.85em; margin-top: 4px;">
            <span><strong>${val}</strong> / ${max}</span>
            <span><strong>${pct}%</strong></span>
          </div>
        </div>
      `;
    } else if (tracker.type === "clock") {
      const total = tracker.clockSegments || 6;
      const val = Math.min(total, Math.max(0, tracker.value || 0));
      let pips = "";
      for (let i = 1; i <= total; i++) {
        pips += i <= val
          ? `<span class="clock-pip filled" style="color: ${theme.border}; font-size: 1.2em; margin: 0 2px;">●</span>`
          : `<span class="clock-pip empty" style="color: rgba(255,255,255,0.25); font-size: 1.2em; margin: 0 2px;">○</span>`;
      }
      bodyHtml = `
        <div class="pf2e-resource-clock-stat" style="text-align: center; margin: 6px 0;">
          <div class="pips-row">${pips}</div>
          <div class="pips-legend" style="font-size: 0.85em; color: #d4af37; margin-top: 4px;">
            <strong>${val}</strong> of <strong>${total}</strong> Segments Filled
          </div>
        </div>
      `;
    } else if (tracker.type === "stage") {
      const val = Math.min(5, Math.max(1, tracker.value || 1));
      const stages = tracker.stages || [];
      const currentStage = stages.find(s => s.stage === val) || { name: `Stage ${val}`, effect: "" };
      let stagePills = "";
      for (let s = 1; s <= 5; s++) {
        const isCurrent = s === val;
        stagePills += `<span class="stage-pip ${isCurrent ? 'active' : ''}" style="display: inline-block; padding: 2px 7px; border-radius: 3px; margin: 0 2px; font-size: 0.8em; ${isCurrent ? `background: ${theme.color}; color: #fff; font-weight: bold; border: 1px solid ${theme.border};` : 'background: rgba(0,0,0,0.3); color: #888;'}">S${s}</span>`;
      }

      bodyHtml = `
        <div class="pf2e-resource-stage-stat">
          <div class="stages-indicator" style="text-align: center; margin-bottom: 6px;">${stagePills}</div>
          <div class="stage-active-box" style="background: rgba(0,0,0,0.3); border-left: 3px solid ${theme.border}; padding: 6px 8px; border-radius: 2px;">
            <div style="font-weight: bold; color: ${theme.border};">${currentStage.name}</div>
            ${currentStage.effect ? `<div style="font-size: 0.88em; color: #ddd; margin-top: 3px;">${currentStage.effect}</div>` : ""}
          </div>
        </div>
      `;
    }

    // Notes
    let notesHtml = "";
    if (tracker.notes) {
      notesHtml = `<div class="chat-card-notes" style="font-size: 0.82em; color: #aaa; margin-top: 6px; font-style: italic; border-top: 1px dotted rgba(255,255,255,0.15); padding-top: 4px;">${tracker.notes}</div>`;
    }

    // Linked Actor Badge
    let actorBadgeHtml = "";
    if (actor) {
      actorBadgeHtml = `
        <div class="chat-card-actor" style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; background: rgba(0,0,0,0.25); padding: 3px 6px; border-radius: 4px;">
          <img src="${actorImg}" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #d4af37; object-fit: cover;" />
          <span style="font-size: 0.85em; font-weight: bold; color: #d4af37;">${actor.name}</span>
        </div>
      `;
    }

    const content = `
      <div class="pf2e chat-card pf2e-resource-chat-card" style="border: 1px solid ${theme.border}; border-radius: 6px; overflow: hidden; background: #1c202a; color: #f0f0f0;">
        <header class="card-header" style="background: linear-gradient(135deg, ${theme.color} 0%, #151820 100%); padding: 8px 10px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid ${theme.border};">
          ${iconHtml}
          <div style="flex: 1;">
            <h3 style="margin: 0; font-size: 1.05em; color: #fff; font-family: 'Signika', sans-serif;">${tracker.name}</h3>
            <span style="font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.7);">${tracker.category} &bull; ${tracker.type}</span>
          </div>
        </header>
        <div class="card-content" style="padding: 10px;">
          ${actorBadgeHtml}
          ${bodyHtml}
          ${notesHtml}
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
      content
    });

    ui.notifications.info(
      game.i18n.format("PF2E_AWESOME_GM.ResourceTracker.Notifications.PostedToChat", { name: tracker.name })
    );
  }
}
