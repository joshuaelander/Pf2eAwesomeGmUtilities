/**
 * PF2e Awesome GM Utilities - Scene Links & World Map Pins
 * Allows GMs to place interactive scene links on maps (world maps, hinterlands, etc.)
 * and enhances journal/chat scene links to navigate/activate scenes instead of opening SceneConfig.
 */

import { MODULE_ID, MAP_PIN_ICONS } from "./constants.js";
import { getSceneThumbnail } from "./scene-switcher.js";
import { PartyPlacement } from "./party-placement.js";

export class SceneLinks {
  static _activePlacement = null;
  static _initialized = false;

  /**
   * Initializes scene link interceptors, drag-and-drop hooks, and note double-click patches.
   */
  static initialize() {
    if (this._initialized) return;
    this._initialized = true;

    // 1. Intercept scene content links clicked in Journals, Chat, or Sheets
    this._registerContentLinkInterceptor();

    // 2. Patch Note canvas placeables for double-click and single-click activation
    this._patchNotePlaceables();

    // 3. Register Canvas drag-and-drop handler for Scenes
    Hooks.on("dropCanvasData", this._onDropCanvasData.bind(this));

    // 4. Register Note HUD hook to add instant Scene Transition icon
    Hooks.on("renderNoteHUD", this._onRenderNoteHUD.bind(this));

    // 5. Register Note Config sheet hook to allow linking existing notes to scenes
    Hooks.on("renderNoteConfig", this._onRenderNoteConfig.bind(this));

    // 6. Direct Note lifecycle hooks to ensure notes remain interactive across all tools & layers
    Hooks.on("drawNote", (note) => SceneLinks.setupNoteInteractivity(note));
    Hooks.on("refreshNote", (note) => SceneLinks.setupNoteInteractivity(note));
    Hooks.on("canvasReady", () => SceneLinks.refreshAllNotes());

    // Run immediate refresh in case canvas is already ready
    if (canvas?.ready) {
      SceneLinks.refreshAllNotes();
    }
  }

  /* ------------------------------------------------------------------------- */
  /* 1. JOURNAL & CONTENT LINK INTERCEPTION                                    */
  /* ------------------------------------------------------------------------- */

  /**
   * Captures clicks on scene content links across journals, actor sheets, and chat.
   * Intercepts core behavior (which opens SceneConfig) and provides scene navigation.
   */
  static _registerContentLinkInterceptor() {
    document.addEventListener("click", async (event) => {
      // Find content link or entity link
      const link = event.target.closest("a.content-link, a.entity-link");
      if (!link) return;

      const uuid = link.dataset.uuid || "";
      const type = link.dataset.type || link.dataset.entity || "";
      const isSceneLink = type === "Scene" || uuid.startsWith("Scene.");
      if (!isSceneLink) return;

      // Only GM can navigate/activate scenes
      if (!game.user.isGM) return;

      // Alt + Click retains core behavior (opens SceneConfig)
      if (event.altKey) return;

      // Prevent core Foundry TextEditor._onClickContentLink from firing SceneConfig
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const sceneId = link.dataset.id || (uuid.startsWith("Scene.") ? uuid.split(".")[1] : null);
      let scene = null;
      if (uuid) {
        scene = await fromUuid(uuid).catch(() => null);
      }
      if (!scene && sceneId) {
        scene = game.scenes.get(sceneId);
      }

      if (!scene) {
        ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.SceneNotFound"));
        return;
      }

      // Handle shortcuts
      if (event.shiftKey) {
        await SceneLinks.activateScene(scene);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        await SceneLinks.viewScene(scene);
        return;
      }

      // Check default action setting
      const defaultAction = game.settings.get(MODULE_ID, "sceneLinkDefaultAction") || "prompt";
      if (defaultAction === "view") {
        await SceneLinks.viewScene(scene);
      } else if (defaultAction === "activate") {
        await SceneLinks.activateScene(scene);
      } else {
        SceneLinks.showTransitionMenu(scene, { event });
      }
    }, { capture: true });
  }

  /* ------------------------------------------------------------------------- */
  /* 2. NOTE CANVAS DOUBLE-CLICK & SINGLE-CLICK PATCHES                        */
  /* ------------------------------------------------------------------------- */

  /**
   * Patches Note permissions, getters, and click handlers to execute scene transitions.
   */
  static _patchNotePlaceables() {
    const NoteClass = CONFIG.Note?.objectClass || foundry.canvas?.placeables?.Note;
    if (!NoteClass?.prototype) return;

    // 1. isInteractable getter: ensure scene links are always interactive for GM across all tools & layers
    const originalIsInteractable = Object.getOwnPropertyDescriptor(NoteClass.prototype, "isInteractable")?.get;
    Object.defineProperty(NoteClass.prototype, "isInteractable", {
      get: function () {
        if (this.isPreview) return false;
        if (this.document?.getFlag(MODULE_ID, "isSceneLink") && game.user?.isGM) {
          return true;
        }
        if (originalIsInteractable) return originalIsInteractable.call(this);
        return false;
      },
      configurable: true
    });

    // 2. _canView: allow GM to double-click note even with entryId = null
    const originalCanView = NoteClass.prototype._canView;
    NoteClass.prototype._canView = function (user, event) {
      if (this.document?.getFlag(MODULE_ID, "isSceneLink")) {
        return game.user?.isGM ?? false;
      }
      return originalCanView.call(this, user, event);
    };

    // 3. _canControl: allow GM single-click if sceneLinkSingleClick setting is enabled
    const originalCanControl = NoteClass.prototype._canControl;
    NoteClass.prototype._canControl = function (user, event) {
      if (this.document?.getFlag(MODULE_ID, "isSceneLink")) {
        const singleClick = game.settings.get(MODULE_ID, "sceneLinkSingleClick");
        if (singleClick && game.user?.isGM) return true;
      }
      return originalCanControl.call(this, user, event);
    };

    // 4. Double-click handler
    const originalOnClickLeft2 = NoteClass.prototype._onClickLeft2;
    NoteClass.prototype._onClickLeft2 = function (event) {
      const isSceneLink = this.document?.getFlag(MODULE_ID, "isSceneLink");
      if (isSceneLink && game.user?.isGM) {
        SceneLinks.handleNoteActivate(this.document, event);
        return;
      }
      return originalOnClickLeft2.call(this, event);
    };

    // 5. Optional single-click handler
    const originalOnClickLeft = NoteClass.prototype._onClickLeft;
    NoteClass.prototype._onClickLeft = function (event) {
      const isSceneLink = this.document?.getFlag(MODULE_ID, "isSceneLink");
      const singleClickSetting = game.settings.get(MODULE_ID, "sceneLinkSingleClick");
      if (isSceneLink && singleClickSetting && game.user?.isGM && !event.shiftKey && !event.ctrlKey) {
        SceneLinks.handleNoteActivate(this.document, event);
        return;
      }
      return originalOnClickLeft.call(this, event);
    };
  }

  /**
   * Directly configures a Note placeable object on canvas to ensure it is always
   * interactive and responds to clicks and double clicks across all layers and tools.
   * @param {Note} note
   */
  static setupNoteInteractivity(note) {
    if (!note?.document?.getFlag(MODULE_ID, "isSceneLink")) return;
    if (!game.user?.isGM) return;

    // Ensure PIXI receives pointer events
    note.eventMode = "static";
    note.cursor = "pointer";

    // Update MouseInteractionManager permissions directly if initialized
    if (note.mouseInteractionManager) {
      note.mouseInteractionManager.permissions.clickLeft2 = () => game.user?.isGM ?? false;
      if (game.settings.get(MODULE_ID, "sceneLinkSingleClick")) {
        note.mouseInteractionManager.permissions.clickLeft = () => game.user?.isGM ?? false;
      }
    }

    // Attach direct PIXI pointerdown listener to guarantee responsiveness across all layers & tools
    if (!note._pf2eSceneLinkBound) {
      note._pf2eSceneLinkBound = true;
      let lastDownTime = 0;

      note.on("pointerdown", (event) => {
        if (!game.user?.isGM) return;
        if (!note.document?.getFlag(MODULE_ID, "isSceneLink")) return;
        // Primary left mouse button only
        if (event.button !== 0) return;

        const now = Date.now();
        const diff = now - lastDownTime;
        const isDouble = diff > 0 && diff < 380;
        lastDownTime = now;

        const singleClickSetting = game.settings.get(MODULE_ID, "sceneLinkSingleClick");

        if (isDouble) {
          event.stopPropagation();
          SceneLinks.handleNoteActivate(note.document, event);
        } else if (singleClickSetting && !event.shiftKey && !event.ctrlKey) {
          event.stopPropagation();
          SceneLinks.handleNoteActivate(note.document, event);
        }
      });
    }
  }

  /**
   * Refreshes all note placeables on the current canvas.
   */
  static refreshAllNotes() {
    if (!game.user?.isGM) return;
    if (!canvas?.ready || !canvas?.notes?.placeables) return;

    const hasSceneLinks = canvas.notes.placeables.some(n => n.document?.getFlag(MODULE_ID, "isSceneLink"));
    if (hasSceneLinks && canvas.notes) {
      canvas.notes.objects.visible = true;
      canvas.notes.interactiveChildren = true;
    }

    for (const note of canvas.notes.placeables) {
      this.setupNoteInteractivity(note);
    }
  }

  static _lastActivation = 0;

  /**
   * Handles activation when a Note map pin is clicked or double-clicked.
   * @param {NoteDocument|Note} noteDoc
   * @param {MouseEvent|PIXI.FederatedEvent} event
   */
  static async handleNoteActivate(noteDoc, event = {}) {
    // Debounce to prevent dual dispatch from PIXI event + Foundry interaction manager
    const now = Date.now();
    if (now - this._lastActivation < 300) return;
    this._lastActivation = now;

    const doc = noteDoc?.document || noteDoc;
    const sceneUuid = doc.getFlag?.(MODULE_ID, "sceneUuid") || doc.flags?.[MODULE_ID]?.sceneUuid;
    const sceneId = doc.getFlag?.(MODULE_ID, "sceneId") || doc.flags?.[MODULE_ID]?.sceneId;
    let scene = null;

    if (sceneUuid) {
      scene = await fromUuid(sceneUuid).catch(() => null);
    }
    if (!scene && sceneId) {
      scene = game.scenes.get(sceneId);
    }

    if (!scene) {
      ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.SceneNotFound"));
      return;
    }

    // Alt + Click opens Note configuration
    if (event.altKey) {
      doc.sheet?.render(true);
      return;
    }

    // Shift + Click: Quick Activate globally
    if (event.shiftKey) {
      await SceneLinks.activateScene(scene);
      return;
    }

    // Ctrl/Cmd + Click: Quick View privately
    if (event.ctrlKey || event.metaKey) {
      await SceneLinks.viewScene(scene);
      return;
    }

    // Check custom pin setting or global setting
    const pinAction = doc.getFlag?.(MODULE_ID, "clickAction") || doc.flags?.[MODULE_ID]?.clickAction;
    const defaultAction = pinAction && pinAction !== "default"
      ? pinAction
      : (game.settings.get(MODULE_ID, "sceneLinkDefaultAction") || "prompt");

    if (defaultAction === "view") {
      await SceneLinks.viewScene(scene);
    } else if (defaultAction === "activate") {
      await SceneLinks.activateScene(scene);
    } else {
      SceneLinks.showTransitionMenu(scene, { noteDoc: doc, event });
    }
  }

  /* ------------------------------------------------------------------------- */
  /* 3. SCENE TRANSITION ACTIONS                                               */
  /* ------------------------------------------------------------------------- */

  /**
   * GM navigates to view a scene privately without altering active world scene or moving players.
   * @param {Scene} scene
   */
  static async viewScene(scene) {
    if (!scene) return;
    await scene.view();
    ui.notifications.info(game.i18n.format("PF2E_AWESOME_GM.SceneLinks.NotificationViewing", { name: scene.name }));
  }

  /**
   * Activates a scene globally for the world and pulls all players.
   * @param {Scene} scene
   * @param {boolean} pullPlayers
   */
  static async activateScene(scene, pullPlayers = true) {
    if (!scene) return;
    await scene.activate({ pullUsers: pullPlayers });
    ui.notifications.info(game.i18n.format("PF2E_AWESOME_GM.SceneLinks.NotificationActivated", { name: scene.name }));
  }

  /**
   * Activates a scene globally, pulls all players, and triggers Party Placement muster.
   * @param {Scene} scene
   */
  static async activateAndPlaceParty(scene) {
    if (!scene) return;
    await scene.activate({ pullUsers: true });
    // Let canvas render active scene before starting muster
    setTimeout(() => {
      PartyPlacement.startPlacement();
    }, 250);
  }

  /**
   * Displays the styled Scene Transition Dialog.
   * @param {Scene} scene
   * @param {object} options
   */
  static async showTransitionMenu(scene, options = {}) {
    const isViewing = canvas.scene?.id === scene.id;
    const isActive = scene.isActive;
    const darkness = scene.darkness ?? 0;
    const darknessPct = Math.round(darkness * 100);

    let lightIcon = "fa-sun";
    let lightLabel = game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.Day");
    if (darkness >= 0.65) {
      lightIcon = "fa-moon";
      lightLabel = game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.Night");
    } else if (darkness >= 0.35) {
      lightIcon = "fa-cloud-sun";
      lightLabel = game.i18n.localize("PF2E_AWESOME_GM.SceneSwitcher.Dusk");
    }

    const context = {
      name: scene.name,
      thumb: getSceneThumbnail(scene),
      isActive,
      isViewing,
      darknessPct,
      lightIcon,
      lightLabel,
      tokenCount: scene.tokens?.size ?? 0,
      gridDistance: scene.grid?.distance ?? 5,
      gridUnits: scene.grid?.units ?? "ft",
      journalEntry: options.noteDoc?.entry || null
    };

    const content = await renderTemplate(
      `modules/${MODULE_ID}/templates/scene-transition-dialog.hbs`,
      context
    );

    new Dialog({
      title: `${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.TransitionDialogTitle")}: ${scene.name}`,
      content,
      buttons: {},
      render: (html) => {
        const root = html instanceof HTMLElement ? html : html[0];
        root.querySelectorAll("[data-action]").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            const action = btn.dataset.action;
            const dialogApp = ui.windows[btn.closest(".dialog")?.dataset?.appid];
            if (dialogApp) dialogApp.close();

            if (action === "view") {
              await SceneLinks.viewScene(scene);
            } else if (action === "activate") {
              await SceneLinks.activateScene(scene, true);
            } else if (action === "activate-party") {
              await SceneLinks.activateAndPlaceParty(scene);
            } else if (action === "journal" && options.noteDoc?.entry) {
              options.noteDoc.entry.sheet.render(true);
            } else if (action === "config") {
              scene.sheet.render(true);
            }
          });
        });
      }
    }, {
      classes: ["pf2e-gm-utility", "pf2e-scene-transition-modal"],
      width: 460,
      height: "auto",
      resizable: false
    }).render(true);
  }

  /* ------------------------------------------------------------------------- */
  /* 4. DRAG & DROP CANVAS INTEGRATION                                         */
  /* ------------------------------------------------------------------------- */

  /**
   * Hook for canvas drops. Catches dragged Scenes and creates Scene Link Pins.
   */
  static async _onDropCanvasData(canvasObj, data) {
    if (!game.user.isGM) return true;

    const isScene = data?.type === "Scene" || (typeof data?.uuid === "string" && data.uuid.startsWith("Scene."));
    if (!isScene) return true;

    let scene = null;
    if (data.uuid) {
      scene = await fromUuid(data.uuid).catch(() => null);
    }
    if (!scene && data.id) {
      scene = game.scenes.get(data.id);
    }

    if (!scene) return true;

    // Determine canvas world coordinates
    let coords = { x: data.x, y: data.y };
    if (coords.x === undefined || coords.y === undefined) {
      coords = canvas?.mousePosition || { x: 0, y: 0 };
    }

    const defaultIcon = game.settings.get(MODULE_ID, "sceneLinkDefaultIcon") || "icons/svg/castle.svg";
    await SceneLinks.createSceneLinkNote(canvasObj, coords, scene, {
      icon: defaultIcon === "scene-thumb" ? getSceneThumbnail(scene) : defaultIcon
    });

    return false;
  }

  /* ------------------------------------------------------------------------- */
  /* 5. NOTE HUD & NOTE CONFIG INTEGRATIONS                                    */
  /* ------------------------------------------------------------------------- */

  /**
   * Injects quick navigation button onto the canvas Note HUD when right-clicked.
   */
  static _onRenderNoteHUD(hud, html, data) {
    if (!game.user.isGM) return;
    const noteDoc = hud.object?.document;
    if (!noteDoc?.getFlag(MODULE_ID, "isSceneLink")) return;

    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    // Check if already injected
    if (root.querySelector(".pf2e-scene-link-hud-btn")) return;

    const btn = document.createElement("div");
    btn.className = "control-icon pf2e-scene-link-hud-btn";
    btn.title = game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.HudJumpTooltip");
    btn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hud.clear();
      SceneLinks.handleNoteActivate(noteDoc, e);
    });

    const col = root.querySelector(".col.left") || root.querySelector(".col.right") || root;
    col.appendChild(btn);
  }

  /**
   * Injects linked scene configuration fields into NoteConfig sheet.
   */
  static _onRenderNoteConfig(app, html, data) {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    if (root.querySelector(".pf2e-scene-link-fieldset")) return;

    const noteDoc = app.document;
    const isSceneLink = noteDoc?.getFlag(MODULE_ID, "isSceneLink") || false;
    const currentSceneId = noteDoc?.getFlag(MODULE_ID, "sceneId") || "";
    const currentClickAction = noteDoc?.getFlag(MODULE_ID, "clickAction") || "prompt";

    const scenes = game.scenes.contents.map(s => ({
      id: s.id,
      name: s.name,
      selected: s.id === currentSceneId
    }));

    const fieldset = document.createElement("fieldset");
    fieldset.className = "pf2e-scene-link-fieldset";
    fieldset.innerHTML = `
      <legend><i class="fa-solid fa-map-location-dot"></i> ${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ConfigLegend")}</legend>
      <div class="form-group">
        <label>${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.LinkToScene")}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.sceneId" class="pf2e-scene-select">
            <option value="">${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.NoLinkedScene")}</option>
            ${scenes.map(s => `<option value="${s.id}" ${s.selected ? "selected" : ""}>${s.name}</option>`).join("")}
          </select>
        </div>
        <p class="notes">${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.LinkHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.DefaultAction")}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.clickAction">
            <option value="prompt" ${currentClickAction === "prompt" ? "selected" : ""}>${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionPrompt")}</option>
            <option value="view" ${currentClickAction === "view" ? "selected" : ""}>${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionDirectView")}</option>
            <option value="activate" ${currentClickAction === "activate" ? "selected" : ""}>${game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionDirectActivate")}</option>
          </select>
        </div>
      </div>
      <input type="hidden" name="flags.${MODULE_ID}.isSceneLink" value="${isSceneLink ? "true" : "false"}" />
      <input type="hidden" name="flags.${MODULE_ID}.sceneUuid" value="${noteDoc?.getFlag(MODULE_ID, "sceneUuid") || ""}" />
    `;

    const select = fieldset.querySelector(".pf2e-scene-select");
    const isLinkInput = fieldset.querySelector(`input[name="flags.${MODULE_ID}.isSceneLink"]`);
    const uuidInput = fieldset.querySelector(`input[name="flags.${MODULE_ID}.sceneUuid"]`);
    const textInput = root.querySelector('input[name="text"]');

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const targetScene = game.scenes.get(selectedId);
      if (targetScene) {
        isLinkInput.value = "true";
        uuidInput.value = targetScene.uuid;
        if (textInput && (!textInput.value || textInput.value.trim() === "")) {
          textInput.value = targetScene.name;
        }
      } else {
        isLinkInput.value = "false";
        uuidInput.value = "";
      }
    });

    const form = root.querySelector("form") || root;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.before(fieldset);
    } else {
      form.appendChild(fieldset);
    }
  }

  /* ------------------------------------------------------------------------- */
  /* 6. INTERACTIVE PLACEMENT PICKER & CANVAS SESSION                          */
  /* ------------------------------------------------------------------------- */

  /**
   * Opens the interactive modal to pick target scene, icon, size, and label before placing.
   */
  static async openPlacementPicker() {
    if (!game.user.isGM) return;
    if (!canvas?.ready || !canvas?.scene) {
      ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.NoScene"));
      return;
    }

    const currentSceneId = canvas.scene.id;
    const scenes = game.scenes.contents.map(s => ({
      id: s.id,
      name: s.name,
      thumb: getSceneThumbnail(s),
      folderName: s.folder?.name || "",
      isActive: s.isActive,
      isSelected: s.id !== currentSceneId
    }));

    // Auto-select first non-current scene if available
    const initialScene = scenes.find(s => s.id !== currentSceneId) || scenes[0];
    const initialSceneId = initialScene?.id || "";

    const defaultIcon = game.settings.get(MODULE_ID, "sceneLinkDefaultIcon") || "icons/svg/castle.svg";
    const pinIcons = MAP_PIN_ICONS.map(p => ({
      ...p,
      isSelected: p.id === defaultIcon
    }));

    const context = {
      scenes,
      selectedSceneId: initialSceneId,
      pinLabel: initialScene?.name || "",
      pinIcons,
      customIconPath: defaultIcon === "scene-thumb" ? "" : defaultIcon,
      pinSize: 48,
      clickAction: "prompt",
      isGlobal: false
    };

    const content = await renderTemplate(
      `modules/${MODULE_ID}/templates/scene-link-picker.hbs`,
      context
    );

    new Dialog({
      title: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.PickerTitle"),
      content,
      buttons: {
        place: {
          icon: '<i class="fa-solid fa-map-location-dot"></i>',
          label: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.PlaceOnMapBtn"),
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html[0];
            const sceneId = root.querySelector('input[name="selectedSceneId"]')?.value;
            const targetScene = game.scenes.get(sceneId);
            if (!targetScene) {
              ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.SelectSceneWarn"));
              return;
            }

            const label = root.querySelector('input[name="pinLabel"]')?.value || targetScene.name;
            const selectedIconBtn = root.querySelector(".btn-pin-icon.selected");
            let iconPath = selectedIconBtn?.dataset?.iconPath || root.querySelector('input[name="customIconPath"]')?.value || "icons/svg/castle.svg";
            if (iconPath === "scene-thumb") {
              iconPath = getSceneThumbnail(targetScene);
            }

            const pinSize = parseInt(root.querySelector('select[name="pinSize"]')?.value || "48", 10);
            const clickAction = root.querySelector('select[name="clickAction"]')?.value || "prompt";
            const isGlobal = root.querySelector('input[name="isGlobal"]')?.checked || false;

            SceneLinks.startPlacement(targetScene, {
              label,
              icon: iconPath,
              iconSize: pinSize,
              clickAction,
              global: isGlobal
            });
          }
        },
        cancel: {
          icon: '<i class="fa-solid fa-xmark"></i>',
          label: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.Cancel")
        }
      },
      default: "place",
      render: (html) => {
        const root = html instanceof HTMLElement ? html : html[0];

        // Scene filter search
        const filterInput = root.querySelector(".scene-filter-input");
        const cards = root.querySelectorAll(".scene-picker-card");
        const hiddenInput = root.querySelector('input[name="selectedSceneId"]');
        const labelInput = root.querySelector('input[name="pinLabel"]');

        filterInput?.addEventListener("input", (e) => {
          const val = e.target.value.toLowerCase().trim();
          cards.forEach(card => {
            const name = (card.dataset.sceneName || "").toLowerCase();
            card.style.display = name.includes(val) ? "flex" : "none";
          });
        });

        // Scene card selection
        cards.forEach(card => {
          card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            const sid = card.dataset.sceneId;
            if (hiddenInput) hiddenInput.value = sid;
            if (labelInput && (!labelInput.value || labelInput.dataset.autoFilled)) {
              labelInput.value = card.dataset.sceneName || "";
              labelInput.dataset.autoFilled = "true";
            }
          });
        });

        // Pin icon selection
        const iconButtons = root.querySelectorAll(".btn-pin-icon");
        const customIconInput = root.querySelector('input[name="customIconPath"]');
        iconButtons.forEach(btn => {
          btn.addEventListener("click", () => {
            iconButtons.forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            if (customIconInput) {
              customIconInput.value = btn.dataset.iconPath;
            }
          });
        });

        // FilePicker browse button
        const browseBtn = root.querySelector(".btn-file-picker");
        browseBtn?.addEventListener("click", () => {
          new FilePicker({
            type: "image",
            current: customIconInput?.value || "icons/svg/",
            callback: (path) => {
              if (customIconInput) customIconInput.value = path;
              iconButtons.forEach(b => b.classList.remove("selected"));
            }
          }).render(true);
        });
      }
    }, {
      classes: ["pf2e-gm-utility", "pf2e-scene-link-picker-window"],
      width: 520,
      height: "auto",
      resizable: true
    }).render(true);
  }

  /**
   * Begins interactive click session on canvas.
   * @param {Scene} scene Target scene
   * @param {object} config Placement config
   */
  static startPlacement(scene, config = {}) {
    if (this._activePlacement) {
      this._activePlacement.cancel();
    }
    this._activePlacement = new SceneLinkPlacementSession(scene, config);
    this._activePlacement.start();
  }

  /**
   * Creates the Note document on canvas.scene.
   * @param {Canvas} canvasObj
   * @param {{x: number, y: number}} coords
   * @param {Scene} scene
   * @param {object} options
   */
  static async createSceneLinkNote(canvasObj, coords, scene, options = {}) {
    if (!canvas?.scene) return;

    const iconPath = options.icon || "icons/svg/castle.svg";
    const label = options.label || scene.name;
    const iconSize = options.iconSize || 48;
    const clickAction = options.clickAction || "prompt";
    const isGlobal = options.global ?? false;

    const noteData = {
      entryId: null,
      x: Math.round(coords.x),
      y: Math.round(coords.y),
      icon: iconPath,
      texture: {
        src: iconPath
      },
      iconSize,
      text: label,
      fontFamily: "Signika",
      fontSize: 24,
      textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
      textColor: "#ffffff",
      global: isGlobal,
      flags: {
        [MODULE_ID]: {
          isSceneLink: true,
          sceneId: scene.id,
          sceneUuid: scene.uuid,
          sceneName: scene.name,
          clickAction
        }
      }
    };

    const created = await canvas.scene.createEmbeddedDocuments("Note", [noteData]);

    // Automatically enable notes display toggle if it's currently turned off
    try {
      if (game.settings.get("core", "notesDisplayToggle") === false) {
        await game.settings.set("core", "notesDisplayToggle", true);
      }
      if (canvas.notes) {
        canvas.notes.objects.visible = true;
        canvas.notes.interactiveChildren = true;
      }
    } catch (e) {
      // Ignore if setting not accessible
    }

    // Refresh all note placeables on canvas to ensure immediate interactivity
    SceneLinks.refreshAllNotes();

    ui.notifications.info(
      game.i18n.format("PF2E_AWESOME_GM.SceneLinks.NotificationPlaced", { name: scene.name })
    );

    return created;
  }
}

/**
 * Session controller managing pointer/keyboard events while placing a scene link pin on canvas.
 */
class SceneLinkPlacementSession {
  constructor(scene, config = {}) {
    this.scene = scene;
    this.config = config;
    this.bannerEl = null;
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
  }

  start() {
    document.body.classList.add("pf2e-placement-mode");

    const bannerText = game.i18n.format("PF2E_AWESOME_GM.SceneLinks.PlacementBanner", { name: this.scene.name })
      || `Click anywhere on the map to place link to "${this.scene.name}"`;
    const hintText = game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.BannerHint")
      || "(Right-click or ESC to cancel)";

    this.bannerEl = document.createElement("div");
    this.bannerEl.className = "pf2e-placement-banner pf2e-scene-link-banner";
    this.bannerEl.innerHTML = `
      <i class="fa-solid fa-location-dot"></i>
      <span>${bannerText}</span>
      <span class="cancel-hint">${hintText}</span>
    `;
    document.body.appendChild(this.bannerEl);

    window.addEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.addEventListener("keydown", this._onKeyDown, { capture: true });
    window.addEventListener("contextmenu", this._onContextMenu, { capture: true });
  }

  cancel() {
    this._cleanup();
    ui.notifications.info(game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.PlacementCanceled"));
  }

  _cleanup() {
    document.body.classList.remove("pf2e-placement-mode");
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
    window.removeEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.removeEventListener("keydown", this._onKeyDown, { capture: true });
    window.removeEventListener("contextmenu", this._onContextMenu, { capture: true });
    SceneLinks._activePlacement = null;
  }

  _handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  }

  _handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }

  async _handlePointerDown(event) {
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }

    if (event.button !== 0) return;

    // Check if clicked inside Foundry UI elements (sidebar, menus, dialogs)
    const uiTarget = event.target.closest("#interface, .window-app, #sidebar, #controls, #navigation, #hotbar, .pf2e-resource-widget-window");
    if (uiTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    let coords = null;
    if (typeof canvas?.canvasCoordinatesFromClient === "function") {
      coords = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
    } else if (canvas?.mousePosition) {
      coords = { x: canvas.mousePosition.x, y: canvas.mousePosition.y };
    } else {
      coords = { x: event.clientX, y: event.clientY };
    }

    this._cleanup();

    await SceneLinks.createSceneLinkNote(canvas, coords, this.scene, this.config);
  }
}
