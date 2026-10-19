/**
 * PF2e Awesome GM Utilities - Floating Trackers HUD Widget
 * Compact, draggable HUD overlay displaying pinned party resources, clocks,
 * and affliction trackers live on screen for GMs and players.
 */

import {
  MODULE_ID,
  COLOR_THEMES
} from "./constants.js";
import { ResourceTrackerApp } from "./resource-tracker-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ResourceWidgetApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);

    this._isCollapsed = Boolean(game.settings.get(MODULE_ID, "resourceWidgetCollapsed"));
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartLeft = 0;
    this._dragStartTop = 0;
    this._onPointerMoveBound = null;
    this._onPointerUpBound = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-resource-widget",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-resource-widget-window"],
    window: {
      frame: false,
      positioned: false,
      resizable: false,
      minimizable: false
    },
    position: {
      width: 230,
      height: "auto",
      left: 18,
      top: 320
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/resource-widget.hbs`
    }
  };

  /* ------------------------------------------------------------------------- */
  /* Lifecycle & DOM Mounting                                                  */
  /* ------------------------------------------------------------------------- */

  /**
   * Mount the HUD element directly to document.body,
   * bypassing Foundry's #interface flex container which traps it to the right of chat.
   * @param {HTMLElement} element
   * @returns {HTMLElement}
   */
  _insertElement(element) {
    document.body.appendChild(element);
    return element;
  }

  /**
   * Cleanly remove the HUD element from the DOM on close.
   * @param {HTMLElement} element
   */
  _removeElement(element) {
    element.remove();
  }

  /**
   * Safe render wrapper ensuring compatibility with boolean and object invocations,
   * restoring saved floating coordinates.
   * @param {object|boolean} options
   * @param {object} [_legacyOptions]
   */
  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = { force: options };
    }

    try {
      const saved = game.settings.get(MODULE_ID, "resourceWidgetPosition");
      // Sanity check: Ensure not stuck off-screen or far right past chat
      const maxLeft = typeof window !== "undefined" ? (window.innerWidth - 300) : 1000;
      if (saved && typeof saved.left === "number" && typeof saved.top === "number" && saved.left >= 0 && saved.left < maxLeft) {
        this.position.left = saved.left;
        this.position.top = saved.top;
      } else {
        this.position.left = 18;
        this.position.top = 320;
      }
    } catch (e) {
      // Setting may not be registered yet during early init
      this.position.left = 18;
      this.position.top = 320;
    }

    return super.render(options, _legacyOptions);
  }

  /**
   * Toggle opening or closing of the floating widget.
   */
  toggle() {
    if (this.rendered) {
      this.close();
    } else {
      this.render({ force: true });
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Context Preparation                                                       */
  /* ------------------------------------------------------------------------- */

  /**
   * Prepares template data for the floating HUD.
   * GMs see all pinned or player-visible trackers.
   * Players see any tracker marked visible to players.
   * @param {object} _options
   * @returns {Promise<object>}
   */
  async _prepareContext(_options) {
    const rawTrackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const isGM = game.user.isGM;

    // Filter trackers based on permission & pinning:
    // GMs see all pinned or player-visible trackers.
    // Players see any tracker marked visible to players.
    const filtered = rawTrackers.filter(t => {
      if (isGM) {
        return Boolean(t.isPinned || t.visibleToPlayers);
      }
      return Boolean(t.visibleToPlayers);
    });

    // Enrich each visible tracker for display
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
      if (isClock) {
        const totalSegments = t.clockSegments || 6;
        const clampedVal = Math.min(totalSegments, Math.max(0, currentVal));
        clockSlices = ResourceTrackerApp._generateClockSlices(
          totalSegments,
          clampedVal,
          theme.border || theme.color
        );
      }

      // Stage affliction data
      let stages = [];
      let currentStageName = "";
      let currentStageEffect = "";
      if (isStage) {
        const rawStages = t.stages && t.stages.length > 0 ? t.stages : [
          { stage: 1, name: "Stage 1", effect: "" },
          { stage: 2, name: "Stage 2", effect: "" },
          { stage: 3, name: "Stage 3", effect: "" },
          { stage: 4, name: "Stage 4", effect: "" },
          { stage: 5, name: "Stage 5", effect: "" }
        ];

        const maxStage = rawStages.length;
        const activeStageNum = Math.min(maxStage, Math.max(1, currentVal));
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
        stages,
        currentStageName,
        currentStageEffect
      };
    });

    return {
      trackers,
      hasTrackers: trackers.length > 0,
      isCollapsed: this._isCollapsed,
      isGM: isGM
    };
  }

  /* ------------------------------------------------------------------------- */
  /* Event Listeners & Drag Handling                                           */
  /* ------------------------------------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    // Safety: Ensure mounted directly into document.body to escape any parent flex/grid styling
    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }

    // Force fixed viewport positioning so it floats freely under the left tools menu
    const targetLeft = typeof this.position.left === "number" ? this.position.left : 18;
    const targetTop = typeof this.position.top === "number" ? this.position.top : 320;

    root.style.setProperty("position", "fixed", "important");
    root.style.setProperty("left", `${targetLeft}px`, "important");
    root.style.setProperty("top", `${targetTop}px`, "important");
    root.style.setProperty("right", "auto", "important");
    root.style.setProperty("bottom", "auto", "important");
    root.style.setProperty("width", `${this.position.width || 230}px`, "important");
    root.style.setProperty("z-index", "70", "important");

    // Custom Draggable Header handling
    const dragHandle = root.querySelector("[data-drag-handle]");
    if (dragHandle) {
      dragHandle.addEventListener("pointerdown", (e) => {
        // Ignore if clicking on interactive control buttons in header
        if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) {
          return;
        }
        e.preventDefault();
        this._startDrag(e);
      });

      // Double-click header to snap position back under the left tools menu
      dragHandle.addEventListener("dblclick", async (e) => {
        if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) return;
        e.preventDefault();
        e.stopPropagation();
        await this.resetPosition();
      });
    }

    // Attach data-action click listeners
    root.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", this._handleActionClick.bind(this));
    });
  }

  /**
   * Reset widget coordinates directly below the left tools menu (x: 18, y: 320).
   */
  async resetPosition() {
    const defaultPos = { left: 18, top: 320 };
    this.position.left = defaultPos.left;
    this.position.top = defaultPos.top;

    if (this.element) {
      if (this.element.parentElement !== document.body) {
        document.body.appendChild(this.element);
      }
      this.element.style.setProperty("position", "fixed", "important");
      this.element.style.setProperty("left", `${defaultPos.left}px`, "important");
      this.element.style.setProperty("top", `${defaultPos.top}px`, "important");
      this.element.style.setProperty("right", "auto", "important");
      this.element.style.setProperty("bottom", "auto", "important");
      this.element.style.setProperty("width", `${this.position.width || 230}px`, "important");
    }

    try {
      await game.settings.set(MODULE_ID, "resourceWidgetPosition", defaultPos);
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed to save reset position:", err);
    }

    ui.notifications.info("Trackers HUD reset under left menu.");
  }

  /**
   * Initializes smooth pointer tracking for moving the floating widget.
   * @param {PointerEvent} e
   */
  _startDrag(e) {
    this._isDragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;

    const rect = this.element.getBoundingClientRect();
    this._dragStartLeft = rect.left;
    this._dragStartTop = rect.top;

    this.element.classList.add("dragging");

    this._onPointerMoveBound = (evt) => {
      if (!this._isDragging) return;
      const deltaX = evt.clientX - this._dragStartX;
      const deltaY = evt.clientY - this._dragStartY;

      const newLeft = Math.max(0, Math.min(window.innerWidth - 60, this._dragStartLeft + deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - 40, this._dragStartTop + deltaY));

      this.position.left = newLeft;
      this.position.top = newTop;

      if (this.element) {
        this.element.style.setProperty("left", `${newLeft}px`, "important");
        this.element.style.setProperty("top", `${newTop}px`, "important");
        this.element.style.setProperty("right", "auto", "important");
        this.element.style.setProperty("bottom", "auto", "important");
      }
    };

    this._onPointerUpBound = async (_evt) => {
      if (!this._isDragging) return;
      this._isDragging = false;
      this.element.classList.remove("dragging");

      window.removeEventListener("pointermove", this._onPointerMoveBound);
      window.removeEventListener("pointerup", this._onPointerUpBound);

      const rect = this.element.getBoundingClientRect();
      const pos = {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      };

      try {
        await game.settings.set(MODULE_ID, "resourceWidgetPosition", pos);
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Failed to save widget position:", err);
      }
    };

    window.addEventListener("pointermove", this._onPointerMoveBound);
    window.addEventListener("pointerup", this._onPointerUpBound);
  }

  _onClose(options) {
    if (this._isDragging) {
      this._isDragging = false;
      if (this._onPointerMoveBound) window.removeEventListener("pointermove", this._onPointerMoveBound);
      if (this._onPointerUpBound) window.removeEventListener("pointerup", this._onPointerUpBound);
    }
    return super._onClose(options);
  }

  /* ------------------------------------------------------------------------- */
  /* Action Handling                                                           */
  /* ------------------------------------------------------------------------- */

  /**
   * Handles user clicks on interactive widget actions.
   * @param {MouseEvent} event
   */
  async _handleActionClick(event) {
    const actionEl = event.currentTarget;
    const action = actionEl.dataset.action;
    const trackerId = actionEl.dataset.id;

    event.preventDefault();
    event.stopPropagation();

    switch (action) {
      case "toggle-collapse": {
        this._isCollapsed = !this._isCollapsed;
        await game.settings.set(MODULE_ID, "resourceWidgetCollapsed", this._isCollapsed);
        this.render({ force: false });
        break;
      }

      case "close-widget": {
        this.close();
        break;
      }

      case "open-manager": {
        if (game.pf2eAwesomeGmUtilities?.resourceTracker) {
          game.pf2eAwesomeGmUtilities.resourceTracker.render({ force: true });
        }
        break;
      }

      case "reset-position": {
        await this.resetPosition();
        break;
      }

      case "adjust-value": {
        if (!game.user.isGM) return;
        const delta = parseInt(actionEl.dataset.delta, 10) || 0;
        await game.pf2eAwesomeGmUtilities?.resourceTracker?.adjust(trackerId, delta);
        break;
      }

      case "set-clock-segment": {
        if (!game.user.isGM) return;
        const seg = parseInt(actionEl.dataset.segment, 10);
        await game.pf2eAwesomeGmUtilities?.resourceTracker?.app?.setClockSegment(trackerId, seg);
        break;
      }

      case "set-stage": {
        if (!game.user.isGM) return;
        const stageNum = parseInt(actionEl.dataset.stage, 10);
        await game.pf2eAwesomeGmUtilities?.resourceTracker?.setValue(trackerId, stageNum);
        break;
      }

      case "post-chat": {
        if (!game.user.isGM) return;
        await game.pf2eAwesomeGmUtilities?.resourceTracker?.postToChat(trackerId);
        break;
      }

      case "unpin-tracker": {
        if (!game.user.isGM) return;
        await game.pf2eAwesomeGmUtilities?.resourceTracker?.app?.togglePin(trackerId);
        break;
      }
    }
  }
}
