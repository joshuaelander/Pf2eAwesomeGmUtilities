/**
 * PF2e Awesome GM Utilities - Session Scene Switcher
 * A fast, floating ApplicationV2 utility allowing GMs to curate a session scenes list,
 * switch views privately, activate scenes for the world, and pull players with one click.
 */

import { MODULE_ID } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Resolves a reliable thumbnail or preview image for any scene in Foundry VTT v14.
 * Handles client-side resolved thumbnails, background image sources, core v14 scene levels,
 * legacy properties, tiles, and fallback default icons.
 * @param {Scene} scene
 * @returns {string} Image path
 */
export function getSceneThumbnail(scene) {
  if (!scene) return "icons/svg/map.svg";

  // 1. Scene client getter (Foundry v12-v14 resolves generated or default thumbnail)
  if (scene.thumbnail && typeof scene.thumbnail === "string" && scene.thumbnail.trim() !== "") {
    return scene.thumbnail;
  }

  // 2. Direct thumb field on document
  if (scene.thumb && typeof scene.thumb === "string" && scene.thumb.trim() !== "") {
    return scene.thumb;
  }

  // 3. Primary background image source
  if (scene.background?.src && typeof scene.background.src === "string" && scene.background.src.trim() !== "") {
    return scene.background.src;
  }

  // 4. v14 Core Scene Levels (Multi-level scene backgrounds)
  if (scene.levels && scene.levels.size > 0) {
    for (const level of scene.levels) {
      if (level.background?.src && typeof level.background.src === "string" && level.background.src.trim() !== "") {
        return level.background.src;
      }
    }
  }

  // 5. Legacy img property
  if (scene.img && typeof scene.img === "string" && scene.img.trim() !== "") {
    return scene.img;
  }

  // 6. Foreground image
  if (scene.foreground && typeof scene.foreground === "string" && scene.foreground.trim() !== "") {
    return scene.foreground;
  }

  // 7. Tiles placed on canvas
  if (scene.tiles && scene.tiles.size > 0) {
    for (const tile of scene.tiles) {
      const src = tile.texture?.src || tile.img;
      if (src && typeof src === "string" && src.trim() !== "") {
        return src;
      }
    }
  }

  // 8. Fallback default map icon
  return "icons/svg/map.svg";
}

export class SceneSwitcherApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);

    this._isCompact = false;
    this._filterQuery = "";

    // Hook listeners setup
    this._boundOnHookUpdate = foundry.utils.debounce(this._onHookUpdate.bind(this), 150);
    this._registerHooks();
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-scene-switcher",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-scene-switcher-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.SceneSwitcher.Title",
      icon: "fa-solid fa-map-location-dot",
      resizable: true,
      minimizable: true,
      controls: [
        {
          icon: "fa-solid fa-table-cells",
          label: "PF2E_AWESOME_GM.SoundPad.ToggleCompact",
          action: "toggleCompact"
        }
      ]
    },
    position: {
      width: 490,
      height: "auto",
      left: 180,
      top: 120
    },
    actions: {
      toggleCompact: SceneSwitcherApp._onToggleCompactAction
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-awesome-gm-utilities/templates/scene-switcher.hbs"
    }
  };

  /* ------------------------------------------------------------------------- */
  /* Lifecycle & Render Protection                                             */
  /* ------------------------------------------------------------------------- */

  /**
   * Safe render wrapper ensuring compatibility with legacy boolean invocations.
   */
  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = { force: options };
    }
    return super.render(options, _legacyOptions);
  }

  /**
   * Register system hooks to automatically refresh UI on scene changes.
   */
  _registerHooks() {
    Hooks.on("canvasReady", this._boundOnHookUpdate);
    Hooks.on("updateScene", this._boundOnHookUpdate);
    Hooks.on("deleteScene", this._boundOnHookUpdate);
  }

  _onHookUpdate() {
    if (this.rendered) {
      this.render({ force: false });
    }
  }

  _onClose(options) {
    if (this._onKeyDownBound) {
      window.removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
    }
    // Unhook when window is closed to save cycles
    Hooks.off("canvasReady", this._boundOnHookUpdate);
    Hooks.off("updateScene", this._boundOnHookUpdate);
    Hooks.off("deleteScene", this._boundOnHookUpdate);
    super._onClose(options);
  }

  /* ------------------------------------------------------------------------- */
  /* Context Preparation                                                       */
  /* ------------------------------------------------------------------------- */

  /**
   * Prepares template data for Handlebars rendering.
   */
  async _prepareContext(options = {}) {
    const savedIds = game.settings.get(MODULE_ID, "sessionScenes") || [];
    const viewedSceneId = canvas.scene?.id || null;
    const activeWorldScene = game.scenes.active || null;

    // Build the curated session scenes list
    const sessionScenes = [];
    const validSavedIds = [];

    for (let index = 0; index < savedIds.length; index++) {
      const id = savedIds[index];
      const scene = game.scenes.get(id);
      if (!scene) continue;

      validSavedIds.push(id);

      const darkness = scene.environment?.darknessLevel ?? scene.darkness ?? 0;
      const isDark = darkness >= 0.5;
      const darknessPct = Math.round(darkness * 100);

      // Check if combat is currently active on this scene
      const hasCombat = game.combats ? game.combats.some(c => c.scene?.id === scene.id) : false;

      // Robust thumbnail resolution
      const thumb = getSceneThumbnail(scene);

      // Trigger asynchronous background thumbnail generation if missing
      if (!scene.thumb && typeof scene.createThumbnail === "function" && game.user.isGM) {
        scene.createThumbnail().then(t => {
          if (t?.thumb && t.thumb !== scene.thumb) {
            scene.update({ thumb: t.thumb }, { diff: false });
          }
        }).catch(() => {});
      }

      sessionScenes.push({
        id: scene.id,
        index: index,
        name: scene.name,
        thumb: thumb,
        isActive: scene.active,
        isViewing: viewedSceneId === scene.id,
        inNavigation: scene.navigation,
        tokenCount: scene.tokens?.size ?? 0,
        hasCombat: hasCombat,
        darkness: darkness,
        darknessPct: darknessPct,
        isDark: isDark,
        gridDistance: scene.grid?.distance ?? 5,
        gridUnits: scene.grid?.units || "ft",
        canMoveUp: index > 0,
        canMoveDown: index < savedIds.length - 1
      });
    }

    // Auto-clean any stale deleted scene IDs from settings if changed
    if (validSavedIds.length !== savedIds.length) {
      game.settings.set(MODULE_ID, "sessionScenes", validSavedIds);
    }

    // Active Scene Summary
    let activeSceneData = null;
    if (activeWorldScene) {
      activeSceneData = {
        id: activeWorldScene.id,
        name: activeWorldScene.name,
        thumb: getSceneThumbnail(activeWorldScene),
        isViewing: viewedSceneId === activeWorldScene.id,
        tokenCount: activeWorldScene.tokens?.size ?? 0
      };
    }

    // Available scenes for the dropdown (scenes not yet in the session list)
    const availableScenes = game.scenes
      .filter(s => !validSavedIds.includes(s.id))
      .map(s => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const canAddCurrent = viewedSceneId && !validSavedIds.includes(viewedSceneId);

    return {
      sessionScenes: sessionScenes,
      hasScenes: sessionScenes.length > 0,
      activeScene: activeSceneData,
      availableScenes: availableScenes,
      hasAvailableScenes: availableScenes.length > 0,
      canAddCurrent: canAddCurrent,
      viewedSceneName: canvas.scene?.name || "",
      isCompact: this._isCompact,
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
    const opacity = game.settings.get(MODULE_ID, "sceneSwitcherOpacity") || 100;
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

    // 1. Drag and Drop Mapping on the list container
    this._setupDragAndDrop(root);

    // 2. Action Buttons on each Scene Card inside the container ONLY (never hijack window header controls)
    const container = root.querySelector(".pf2e-scene-switcher-container") || root;
    container.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", this._handleActionClick.bind(this));
    });

    // 3. Dropdown Add Button
    const addSelectBtn = root.querySelector(".btn-add-selected");
    const sceneSelect = root.querySelector(".scene-select-dropdown");
    if (addSelectBtn && sceneSelect) {
      addSelectBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const selectedId = sceneSelect.value;
        if (selectedId) {
          await this.addScene(selectedId);
        }
      });
    }

    // 4. Quick Actions
    const addCurrentBtn = root.querySelector(".btn-add-current");
    if (addCurrentBtn) {
      addCurrentBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (canvas.scene) {
          await this.addScene(canvas.scene.id);
        }
      });
    }

    const addNavigatedBtn = root.querySelector(".btn-add-navigated");
    if (addNavigatedBtn) {
      addNavigatedBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.addNavigatedScenes();
      });
    }

    const clearAllBtn = root.querySelector(".btn-clear-session");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.confirmClearSession();
      });
    }
  }

  /**
   * Handles user clicks on interactive data-action elements.
   */
  async _handleActionClick(event) {
    const actionEl = event.currentTarget;
    const action = actionEl.dataset.action;
    const sceneId = actionEl.dataset.sceneId;

    if (action === "close") {
      event.preventDefault();
      return this.close();
    }

    event.preventDefault();
    event.stopPropagation();

    switch (action) {
      case "view":
        await this.viewScene(sceneId);
        break;

      case "activate":
        await this.activateScene(sceneId);
        break;

      case "pull":
        await this.pullPlayers(sceneId);
        break;

      case "activate-and-pull":
        await this.activateScene(sceneId);
        break;

      case "configure":
        this.configureScene(sceneId);
        break;

      case "toggle-lighting":
        await this.toggleLighting(sceneId);
        break;

      case "remove":
        await this.removeScene(sceneId);
        break;

      case "move-up":
        await this.moveScene(sceneId, -1);
        break;

      case "move-down":
        await this.moveScene(sceneId, 1);
        break;

      case "toggle-compact":
        this._isCompact = !this._isCompact;
        this.render({ force: true });
        break;
    }
  }

  /**
   * Sets up native drag and drop listeners on the scenes container.
   */
  _setupDragAndDrop(root) {
    const dropZone = root.querySelector(".session-scenes-list") || root.querySelector(".pf2e-scene-switcher-container");
    if (!dropZone) return;

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");

      let data = null;
      try {
        if (typeof TextEditor?.getDragEventDataWithErrors === "function") {
          data = TextEditor.getDragEventDataWithErrors(e);
        } else if (typeof TextEditor?.getDragEventData === "function") {
          data = TextEditor.getDragEventData(e);
        } else {
          data = JSON.parse(e.dataTransfer.getData("text/plain"));
        }
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Invalid drag drop data", err);
        return;
      }

      if (data?.type === "Scene") {
        let scene = null;
        if (data.uuid) {
          scene = await fromUuid(data.uuid);
        } else if (data.id) {
          scene = game.scenes.get(data.id);
        }

        if (scene) {
          await this.addScene(scene.id);
        }
      }
    });
  }

  /* ------------------------------------------------------------------------- */
  /* Core Scene Actions & Operations                                           */
  /* ------------------------------------------------------------------------- */

  /**
   * Switch GM canvas to view the specified scene (private preview).
   * @param {string} sceneId
   */
  async viewScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;

    await scene.view();
    ui.notifications.info(game.i18n.format("PF2E_AWESOME_GM.SceneSwitcher.NotificationViewing", { name: scene.name }));
    this.render({ force: false });
  }

  /**
   * Globally activate the scene for all players.
   * In Foundry VTT, activating a scene brings all connected players by default.
   * We also emit socket pull signals to ensure any desynced clients navigate immediately.
   * @param {string} sceneId
   */
  async activateScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;

    await scene.activate({ pullUsers: true });

    ui.notifications.info(game.i18n.format("PF2E_AWESOME_GM.SceneSwitcher.NotificationActivated", { name: scene.name }));
    this.render({ force: false });
  }

  /**
   * Pull all connected players to the specified scene.
   * Utilizes the native Foundry v14 Scene#pullUsers method (same as Scene Navigation's "Pull Everyone").
   * This pulls all active users to view the scene without changing which scene is active.
   * @param {string} sceneId
   */
  async pullPlayers(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;

    // Use native Foundry v14 Scene#pullUsers to pull all connected users without activating
    if (typeof scene.pullUsers === "function") {
      scene.pullUsers(game.users);
    } else {
      // Fallback for older versions
      for (const u of game.users) {
        if (!u.active || u.id === game.user.id) continue;
        game.socket.emit("pullToScene", scene.id, u.id);
      }
      game.socket.emit("pullToScene", scene.id);
    }

    ui.notifications.info(game.i18n.format("PF2E_AWESOME_GM.SceneSwitcher.NotificationPulled", { name: scene.name }));
    this.render({ force: false });
  }

  /**
   * Alias for activateScene.
   * @param {string} sceneId
   */
  async activateAndPull(sceneId) {
    return this.activateScene(sceneId);
  }

  /**
   * Open the standard Foundry Scene Configuration sheet.
   * @param {string} sceneId
   */
  configureScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (scene?.sheet) {
      scene.sheet.render(true);
    }
  }

  /**
   * Toggle scene darkness between day (0.0) and darkness (0.85).
   * @param {string} sceneId
   */
  async toggleLighting(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;

    const curDarkness = scene.environment?.darknessLevel ?? scene.darkness ?? 0;
    const newDarkness = curDarkness >= 0.5 ? 0.0 : 0.85;

    await scene.update({
      "environment.darknessLevel": newDarkness,
      darkness: newDarkness
    });

    this.render({ force: false });
  }

  /**
   * Add a scene ID to the session scenes list.
   * @param {string} sceneId
   */
  async addScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;

    const savedIds = game.settings.get(MODULE_ID, "sessionScenes") || [];
    if (!savedIds.includes(sceneId)) {
      savedIds.push(sceneId);
      await game.settings.set(MODULE_ID, "sessionScenes", savedIds);
      this.render({ force: true });
    }
  }

  /**
   * Remove a scene ID from the session scenes list.
   * @param {string} sceneId
   */
  async removeScene(sceneId) {
    const savedIds = game.settings.get(MODULE_ID, "sessionScenes") || [];
    const updated = savedIds.filter(id => id !== sceneId);
    await game.settings.set(MODULE_ID, "sessionScenes", updated);
    this.render({ force: true });
  }

  /**
   * Move a scene up or down in the session list order.
   * @param {string} sceneId
   * @param {number} delta (-1 for up, 1 for down)
   */
  async moveScene(sceneId, delta) {
    const savedIds = [...(game.settings.get(MODULE_ID, "sessionScenes") || [])];
    const currentIndex = savedIds.indexOf(sceneId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + delta;
    if (newIndex < 0 || newIndex >= savedIds.length) return;

    // Swap positions
    const temp = savedIds[currentIndex];
    savedIds[currentIndex] = savedIds[newIndex];
    savedIds[newIndex] = temp;

    await game.settings.set(MODULE_ID, "sessionScenes", savedIds);
    this.render({ force: true });
  }

  /**
   * Import all scenes currently marked as visible in the top navigation bar.
   */
  async addNavigatedScenes() {
    const savedIds = game.settings.get(MODULE_ID, "sessionScenes") || [];
    const navScenes = game.scenes.filter(s => s.navigation).map(s => s.id);

    let changed = false;
    for (const id of navScenes) {
      if (!savedIds.includes(id)) {
        savedIds.push(id);
        changed = true;
      }
    }

    if (changed) {
      await game.settings.set(MODULE_ID, "sessionScenes", savedIds);
      this.render({ force: true });
    }
  }

  /**
   * Prompt confirmation and clear all scenes from the session list.
   */
  async confirmClearSession() {
    const confirmMsg = game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.ConfirmClear");
    let proceed = false;

    if (foundry?.applications?.api?.DialogV2?.confirm) {
      proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.ClearAll") },
        content: `<p>${confirmMsg}</p>`,
        rejectClose: false
      });
    } else {
      proceed = await Dialog.confirm({
        title: game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.ClearAll"),
        content: `<p>${confirmMsg}</p>`,
        defaultYes: false
      });
    }

    if (proceed) {
      await game.settings.set(MODULE_ID, "sessionScenes", []);
      this.render({ force: true });
    }
  }

  /**
   * Toggle window open/close.
   */
  toggle() {
    if (this.rendered) {
      this.close();
    } else {
      this.render({ force: true });
    }
  }

  static _onToggleCompactAction(event, target) {
    this._isCompact = !this._isCompact;
    this.render({ force: true });
  }
}
