/**
 * PF2e Awesome GM Utilities - Main Entry Point
 */

import {
  MODULE_ID,
  SOCKET_EVENT,
  SOUND_PAD_MACRO_NAME,
  SOUND_PAD_MACRO_ICON,
  PANIC_STOP_MACRO_NAME,
  PANIC_STOP_MACRO_ICON,
  SCENE_SWITCHER_MACRO_NAME,
  SCENE_SWITCHER_MACRO_ICON,
  RESOURCE_TRACKER_MACRO_NAME,
  RESOURCE_TRACKER_MACRO_ICON,
  RESOURCE_WIDGET_MACRO_NAME,
  RESOURCE_WIDGET_MACRO_ICON,
  PLACE_PARTY_MACRO_NAME,
  PLACE_PARTY_MACRO_ICON,
  MACRO_FOLDER_NAME,
  MACRO_FOLDER_COLOR,
  DEFAULT_BANKS,
  DEFAULT_SESSION_SCENES,
  DEFAULT_RESOURCE_TRACKERS
} from "./constants.js";
import { audioController } from "./audio-controller.js";
import { SoundPadApp } from "./sound-pad-app.js";
import { SceneSwitcherApp } from "./scene-switcher.js";
import { ResourceTrackerApp } from "./resource-tracker-app.js";
import { ResourceWidgetApp } from "./resource-widget-app.js";
import { PartyPlacement } from "./party-placement.js";

let soundPadInstance = null;
let sceneSwitcherInstance = null;
let resourceTrackerInstance = null;
let resourceWidgetInstance = null;

function getSoundPad() {
  if (!soundPadInstance) {
    soundPadInstance = new SoundPadApp();
  }
  return soundPadInstance;
}

function getSceneSwitcher() {
  if (!sceneSwitcherInstance) {
    sceneSwitcherInstance = new SceneSwitcherApp();
  }
  return sceneSwitcherInstance;
}

function getResourceTracker() {
  if (!resourceTrackerInstance) {
    resourceTrackerInstance = new ResourceTrackerApp();
  }
  return resourceTrackerInstance;
}

function getResourceWidget() {
  if (!resourceWidgetInstance) {
    resourceWidgetInstance = new ResourceWidgetApp();
  }
  return resourceWidgetInstance;
}

/* ------------------------------------------------------------------------- */
/* 1. SETTINGS REGISTRATION                                                  */
/* ------------------------------------------------------------------------- */

function registerSettings() {
  // Soundboard Banks & Slots Data (World)
  game.settings.register(MODULE_ID, "soundboardData", {
    name: "Soundboard Data",
    hint: "Internal world data storing soundboard banks, slots, colors, and mappings.",
    scope: "world",
    config: false,
    type: Object,
    default: { banks: DEFAULT_BANKS },
    onChange: () => {
      if (soundPadInstance?.rendered) {
        soundPadInstance.render(false);
      }
    }
  });

  // Auto-stop other music tracks when triggering a new music track
  game.settings.register(MODULE_ID, "autoStopOtherMusic", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.AutoStopOtherMusic.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.AutoStopOtherMusic.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Default Fade Duration
  game.settings.register(MODULE_ID, "defaultFadeDuration", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.DefaultFadeDuration.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.DefaultFadeDuration.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 5, step: 0.5 },
    default: 1.5
  });

  // Sound Pad Window Opacity
  game.settings.register(MODULE_ID, "soundPadOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadOpacity.Hint"),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = $(`#pf2e-sound-pad`);
      if (el.length) el.css("opacity", val / 100);
    }
  });

  // Scene Switcher Window Opacity
  game.settings.register(MODULE_ID, "sceneSwitcherOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneSwitcherOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneSwitcherOpacity.Hint"),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = $(`#pf2e-scene-switcher`);
      if (el.length) el.css("opacity", val / 100);
    }
  });

  // Session Scenes List (World)
  game.settings.register(MODULE_ID, "sessionScenes", {
    name: "Session Scenes",
    hint: "Curated scene IDs for the current gaming session.",
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_SESSION_SCENES,
    onChange: () => {
      if (sceneSwitcherInstance?.rendered) {
        sceneSwitcherInstance.render({ force: false });
      }
    }
  });

  // Resource Trackers Data (World)
  game.settings.register(MODULE_ID, "resourceTrackers", {
    name: "Resource Trackers",
    hint: "Custom resource, clock, and affliction trackers.",
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_RESOURCE_TRACKERS,
    onChange: () => {
      if (resourceTrackerInstance?.rendered) {
        resourceTrackerInstance.render({ force: false });
      }
      syncWidgetApp();
    }
  });

  // Resource Widget Position (Client)
  game.settings.register(MODULE_ID, "resourceWidgetPosition", {
    name: "Resource Widget Position",
    scope: "client",
    config: false,
    type: Object,
    default: { left: 18, top: 320 }
  });

  // Resource Widget Collapsed State (Client)
  game.settings.register(MODULE_ID, "resourceWidgetCollapsed", {
    name: "Resource Widget Collapsed",
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  // Resource Tracker Window Opacity (Client)
  game.settings.register(MODULE_ID, "resourceTrackerOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.ResourceTrackerOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.ResourceTrackerOpacity.Hint"),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = document.querySelector("#pf2e-resource-tracker");
      if (el) el.style.opacity = `${val / 100}`;
    }
  });

  // Master Volume (Client-side)
  game.settings.register(MODULE_ID, "soundPadMasterVolume", {
    name: "Sound Pad Master Volume",
    scope: "client",
    config: false,
    type: Number,
    default: 1.0
  });

  // Auto-sync macros
  game.settings.register(MODULE_ID, "autoSyncMacros", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadHotbarMacro.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadHotbarMacro.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/* ------------------------------------------------------------------------- */
/* 2. KEYBINDINGS                                                            */
/* ------------------------------------------------------------------------- */

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleSoundPad", {
    name: "Toggle Music Sound Pad",
    hint: "Quickly open or close the Sound Pad window.",
    editable: [
      { key: "KeyM", modifiers: ["Shift"] }
    ],
    onDown: () => {
      if (!game.user.isGM) return;
      const pad = getSoundPad();
      if (pad.rendered) {
        pad.close();
      } else {
        pad.render(true, { focus: true });
      }
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "toggleSceneSwitcher", {
    name: "Toggle Scene Switcher",
    hint: "Quickly open or close the Session Scene Switcher window.",
    editable: [
      { key: "KeyS", modifiers: ["Shift"] }
    ],
    onDown: () => {
      if (!game.user.isGM) return;
      const switcher = getSceneSwitcher();
      switcher.toggle();
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "toggleResourceTracker", {
    name: "Toggle Resource Tracker",
    hint: "Quickly open or close the Resource & Subsystem Tracker window.",
    editable: [
      { key: "KeyR", modifiers: ["Shift"] }
    ],
    onDown: () => {
      if (!game.user.isGM) return;
      const tracker = getResourceTracker();
      tracker.toggle();
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "toggleResourceWidget", {
    name: "Toggle Trackers HUD Widget",
    hint: "Quickly show or hide the floating Resource & Subsystem HUD.",
    editable: [
      { key: "KeyH", modifiers: ["Shift"] }
    ],
    onDown: () => {
      const widget = getResourceWidget();
      widget.toggle();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

/**
 * Automatically synchronizes the floating HUD widget across GM and connected players.
 */
function syncWidgetApp() {
  const trackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
  const isGM = game.user.isGM;
  const visibleCount = trackers.filter(t => isGM ? (t.isPinned || t.visibleToPlayers) : t.visibleToPlayers).length;

  const widget = getResourceWidget();
  if (widget.rendered) {
    if (!isGM && visibleCount === 0) {
      widget.close();
    } else {
      widget.render({ force: false });
    }
  } else {
    // If player has visible shared trackers, automatically display HUD
    if (!isGM && visibleCount > 0) {
      widget.render({ force: true });
    }
  }
}

/* ------------------------------------------------------------------------- */
/* 3. SCENE CONTROLS INTEGRATION                                             */
/* ------------------------------------------------------------------------- */

function registerSceneControls(controls) {
  if (!game.user.isGM) return;

  // Support Array (v12 and earlier), Map/Collection, or Record/Object (v13/v14)
  const findControl = (name) => {
    if (Array.isArray(controls)) return controls.find(c => c?.name === name);
    if (controls instanceof Map || typeof controls?.get === "function") return controls.get(name);
    if (controls && typeof controls === "object") return controls[name] || Object.values(controls).find(c => c?.name === name);
    return null;
  };

  const scenesControl = findControl("scenes");

  const openSoundPadTool = {
    name: "pf2e-sound-pad-open",
    title: "PF2e Music Sound Pad",
    icon: "fa-solid fa-compact-disc",
    visible: true,
    button: true,
    onClick: () => {
      const pad = getSoundPad();
      if (pad.rendered) {
        pad.close();
      } else {
        pad.render({ force: true });
      }
    }
  };

  const panicToolData = {
    name: "pf2e-sound-panic-stop",
    title: "Panic: Stop All Sounds",
    icon: "fa-solid fa-volume-xmark",
    visible: true,
    button: true,
    onClick: async () => {
      await audioController.stopAll();
    }
  };

  const openSceneSwitcherTool = {
    name: "pf2e-scene-switcher-open",
    title: "Session Scene Switcher",
    icon: "fa-solid fa-map-location-dot",
    visible: true,
    button: true,
    onClick: () => {
      const switcher = getSceneSwitcher();
      switcher.toggle();
    }
  };

  const openResourceTrackerTool = {
    name: "pf2e-resource-tracker-open",
    title: "PF2e Resource Tracker",
    icon: "fa-solid fa-cubes-stacked",
    visible: true,
    button: true,
    onClick: () => {
      const tracker = getResourceTracker();
      tracker.toggle();
    }
  };

  const openResourceWidgetTool = {
    name: "pf2e-resource-widget-open",
    title: "PF2e Trackers HUD",
    icon: "fa-solid fa-layer-group",
    visible: true,
    button: true,
    onClick: () => {
      const widget = getResourceWidget();
      widget.toggle();
    }
  };

  const placePartyTool = {
    name: "pf2e-place-party",
    title: "Place Party on Scene",
    icon: "fa-solid fa-users",
    visible: true,
    button: true,
    onClick: () => {
      PartyPlacement.startPlacement();
    }
  };

  const insertTool = (ctrl, tool) => {
    if (!ctrl) return;
    if (Array.isArray(ctrl.tools)) {
      const idx = ctrl.tools.findIndex(t => t?.name === tool.name);
      if (idx >= 0) ctrl.tools[idx] = tool;
      else ctrl.tools.push(tool);
    } else if (ctrl.tools instanceof Map || typeof ctrl.tools?.set === "function") {
      ctrl.tools.set(tool.name, tool);
    } else if (ctrl.tools && typeof ctrl.tools === "object") {
      ctrl.tools[tool.name] = tool;
    }
  };

  // Add tool to scenes control group
  if (scenesControl) {
    insertTool(scenesControl, openSceneSwitcherTool);
  }

  // Dedicated top-level GM Utilities control group
  const gmTools = [openSoundPadTool, openSceneSwitcherTool, placePartyTool, openResourceTrackerTool, openResourceWidgetTool, panicToolData];
  const gmUtilitiesControls = {
    name: "pf2e-gm-utilities",
    title: "PF2e GM Utilities",
    icon: "fa-solid fa-wand-magic-sparkles",
    layer: "controls",
    visible: true,
    tools: Array.isArray(controls) ? gmTools : {
      [openSoundPadTool.name]: openSoundPadTool,
      [openSceneSwitcherTool.name]: openSceneSwitcherTool,
      [placePartyTool.name]: placePartyTool,
      [openResourceTrackerTool.name]: openResourceTrackerTool,
      [openResourceWidgetTool.name]: openResourceWidgetTool,
      [panicToolData.name]: panicToolData
    }
  };

  if (Array.isArray(controls)) {
    const existingIdx = controls.findIndex(c => c?.name === "pf2e-gm-utilities");
    if (existingIdx >= 0) controls[existingIdx] = gmUtilitiesControls;
    else controls.push(gmUtilitiesControls);
  } else if (controls instanceof Map || typeof controls?.set === "function") {
    controls.set("pf2e-gm-utilities", gmUtilitiesControls);
  } else if (controls && typeof controls === "object") {
    controls["pf2e-gm-utilities"] = gmUtilitiesControls;
  }
}

/* ------------------------------------------------------------------------- */
/* 4. PLAYLIST SIDEBAR DIRECTORY HEADER BUTTON                               */
/* ------------------------------------------------------------------------- */

function registerSidebarHeaderButton(app, html) {
  if (!game.user.isGM) return;

  // In Foundry v14, html can be a native HTMLElement, DocumentFragment, or jQuery object
  const root = html instanceof HTMLElement
    ? html
    : (html?.[0] instanceof HTMLElement ? html[0] : (typeof $ !== "undefined" ? $(html)[0] : null));
  if (!root) return;

  const headerActions = root.querySelector?.(".header-actions");
  if (headerActions && !headerActions.querySelector(".pf2e-sound-pad-btn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pf2e-sound-pad-btn";
    btn.title = "Open Music & SFX Sound Pad";
    btn.innerHTML = `<i class="fa-solid fa-compact-disc"></i> Sound Pad`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const pad = getSoundPad();
      if (pad.rendered) pad.close();
      else pad.render({ force: true });
    });
    headerActions.appendChild(btn);
  }
}

function registerSceneSidebarHeaderButton(app, html) {
  if (!game.user.isGM) return;

  const root = html instanceof HTMLElement
    ? html
    : (html?.[0] instanceof HTMLElement ? html[0] : (typeof $ !== "undefined" ? $(html)[0] : null));
  if (!root) return;

  const headerActions = root.querySelector?.(".header-actions");
  if (headerActions && !headerActions.querySelector(".pf2e-scene-switcher-btn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pf2e-scene-switcher-btn";
    btn.title = "Open Session Scene Switcher";
    btn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Scene Switcher`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const switcher = getSceneSwitcher();
      switcher.toggle();
    });
    headerActions.appendChild(btn);
  }
}

/* ------------------------------------------------------------------------- */
/* 5. MACRO SMART SYNC                                                       */
/* ------------------------------------------------------------------------- */

const DESIRED_MACROS = [
  {
    name: SOUND_PAD_MACRO_NAME,
    icon: SOUND_PAD_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.soundPad.toggle();`
  },
  {
    name: PANIC_STOP_MACRO_NAME,
    icon: PANIC_STOP_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.soundPad.stopAll();`
  },
  {
    name: SCENE_SWITCHER_MACRO_NAME,
    icon: SCENE_SWITCHER_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.sceneSwitcher.toggle();`
  },
  {
    name: RESOURCE_TRACKER_MACRO_NAME,
    icon: RESOURCE_TRACKER_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.resourceTracker.toggle();`
  },
  {
    name: RESOURCE_WIDGET_MACRO_NAME,
    icon: RESOURCE_WIDGET_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.resourceWidget.toggle();`
  },
  {
    name: PLACE_PARTY_MACRO_NAME,
    icon: PLACE_PARTY_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.placeParty();`
  }
];

async function getOrCreateFolder(name, type) {
  let folder = game.folders.getName(name);
  const gmOnlyOwnership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  if (!folder) {
    try {
      folder = await Folder.create({
        name: name,
        type: type,
        parent: null,
        color: MACRO_FOLDER_COLOR,
        ownership: gmOnlyOwnership
      });
    } catch (err) {
      console.error(`PF2e Awesome GM Utilities | Failed to create folder: ${name}`, err);
      return null;
    }
  } else {
    const currentDef = folder.ownership?.default ?? folder.ownership?.["default"];
    if (currentDef !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE) {
      await folder.update({ ownership: gmOnlyOwnership });
    }
  }
  return folder;
}

async function syncMacros() {
  if (!game.user.isGM) return;
  const shouldSync = game.settings.get(MODULE_ID, "autoSyncMacros");
  if (!shouldSync) return;

  const folder = await getOrCreateFolder(MACRO_FOLDER_NAME, "Macro");
  if (!folder) return;

  const gmOnlyOwnership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };

  for (const desired of DESIRED_MACROS) {
    const existing = game.macros.find(m =>
      m.flags?.[MODULE_ID]?.isModuleMacro
        ? m.name === desired.name
        : (m.name === desired.name && m.folder?.id === folder.id)
    );

    if (existing) {
      const currentDefault = existing.ownership?.default ?? existing.ownership?.["default"];
      const needsUpdate =
        existing.command !== desired.command ||
        existing.img !== desired.icon ||
        existing.folder?.id !== folder.id ||
        currentDefault !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE ||
        !existing.flags?.[MODULE_ID]?.isModuleMacro;

      if (needsUpdate) {
        await existing.update({
          command: desired.command,
          img: desired.icon,
          folder: folder.id,
          ownership: gmOnlyOwnership,
          [`flags.${MODULE_ID}.isModuleMacro`]: true
        });
      }
    } else {
      const macroData = {
        name: desired.name,
        type: "script",
        img: desired.icon,
        command: desired.command,
        folder: folder.id,
        ownership: gmOnlyOwnership,
        flags: { [MODULE_ID]: { isModuleMacro: true } }
      };
      await Macro.create(macroData, { renderSheet: false });
    }
  }
}

/* ------------------------------------------------------------------------- */
/* 6. HOOKS AND LIFECYCLE                                                    */
/* ------------------------------------------------------------------------- */

Hooks.once("init", () => {
  console.log("PF2e Awesome GM Utilities | Initializing Module...");
  registerSettings();
  registerKeybindings();
});

Hooks.on("getSceneControlButtons", (controls) => {
  registerSceneControls(controls);
});

Hooks.on("renderPlaylistDirectory", (app, html) => {
  registerSidebarHeaderButton(app, html);
});

Hooks.on("renderSceneDirectory", (app, html) => {
  registerSceneSidebarHeaderButton(app, html);
});

Hooks.once("ready", async () => {
  // Global API namespace
  game.pf2eAwesomeGmUtilities = game.pf2eAwesomeGmUtilities || {};
  
  // Sound Pad API
  game.pf2eAwesomeGmUtilities.soundPad = {
    get app() { return getSoundPad(); },
    render: (options = { force: true }) => getSoundPad().render(options),
    toggle: () => {
      const pad = getSoundPad();
      if (pad.rendered) pad.close();
      else pad.render({ force: true });
    },
    stopAll: () => audioController.stopAll(),
    seek: (seconds) => audioController.seek(seconds),
    skip: (delta) => audioController.skipOffset(delta),
    audioController: audioController
  };

  // Scene Switcher API
  game.pf2eAwesomeGmUtilities.sceneSwitcher = {
    get app() { return getSceneSwitcher(); },
    render: (options = { force: true }) => getSceneSwitcher().render(options),
    toggle: () => getSceneSwitcher().toggle(),
    view: (id) => getSceneSwitcher().viewScene(id),
    activate: (id) => getSceneSwitcher().activateScene(id),
    pull: (id) => getSceneSwitcher().pullPlayers(id),
    activateAndPull: (id) => getSceneSwitcher().activateAndPull(id),
    addScene: (id) => getSceneSwitcher().addScene(id),
    removeScene: (id) => getSceneSwitcher().removeScene(id),
    addNavigatedScenes: () => getSceneSwitcher().addNavigatedScenes(),
    clearSession: () => getSceneSwitcher().confirmClearSession()
  };

  // Resource Tracker API
  game.pf2eAwesomeGmUtilities.resourceTracker = {
    get app() { return getResourceTracker(); },
    render: (options = { force: true }) => getResourceTracker().render(options),
    toggle: () => getResourceTracker().toggle(),
    adjust: (id, delta) => getResourceTracker().adjustValue(id, delta),
    setValue: (id, val) => getResourceTracker().setValue(id, val),
    reset: (id) => getResourceTracker().resetValue(id),
    postToChat: (id) => getResourceTracker().postToChat(id),
    addTracker: (presetId) => getResourceTracker().openCreateDialog(presetId),
    editTracker: (id) => getResourceTracker().openEditDialog(id),
    deleteTracker: (id) => getResourceTracker().deleteTracker(id)
  };

  // Floating Resource Widget HUD API
  game.pf2eAwesomeGmUtilities.resourceWidget = {
    get app() { return getResourceWidget(); },
    render: (options = { force: true }) => getResourceWidget().render(options),
    toggle: () => getResourceWidget().toggle(),
    close: () => getResourceWidget().close(),
    sync: () => syncWidgetApp(),
    resetPosition: async () => {
      const app = getResourceWidget();
      await app.resetPosition();
    }
  };

  // Party Placement API
  game.pf2eAwesomeGmUtilities.placeParty = () => PartyPlacement.startPlacement();
  game.pf2eAwesomeGmUtilities.partyPlacement = PartyPlacement;

  // Helper function to re-sync or recreate macros on demand
  game.pf2eAwesomeGmUtilities.syncMacros = async () => await syncMacros();

  // Auto-render floating widget if there are visible trackers for this user
  try {
    const initialTrackers = game.settings.get(MODULE_ID, "resourceTrackers") || [];
    const initialVisible = initialTrackers.filter(t => game.user.isGM ? (t.isPinned || t.visibleToPlayers) : t.visibleToPlayers).length;
    if (initialVisible > 0) {
      getResourceWidget().render({ force: true });
    }
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Failed to auto-render resource widget:", err);
  }

  // Socket listener for live widget synchronization across clients
  if (game.socket) {
    try {
      const socketChannel = typeof SOCKET_EVENT !== "undefined" ? SOCKET_EVENT : `module.${MODULE_ID}`;
      game.socket.on(socketChannel, (payload) => {
        if (payload?.action === "syncWidget") {
          syncWidgetApp();
        }
      });
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed to attach socket listener:", err);
    }
  }

  // Run macro sync for GM (ensures icons and GM-only ownership are up to date)
  if (game.user.isGM) {
    try {
      await syncMacros();
    } catch (err) {
      console.error("PF2e Awesome GM Utilities | Failed to sync macros:", err);
    }
  }

  console.log("PF2e Awesome GM Utilities | Ready! Sound Pad, Scene Switcher, and Resource Tracker initialized.");
});
