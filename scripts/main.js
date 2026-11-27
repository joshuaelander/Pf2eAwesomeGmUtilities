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
  PLACE_SCENE_LINK_MACRO_NAME,
  PLACE_SCENE_LINK_MACRO_ICON,
  CHARACTER_CHECKER_MACRO_NAME,
  CHARACTER_CHECKER_MACRO_ICON,
  GM_SCREEN_MACRO_NAME,
  GM_SCREEN_MACRO_ICON,
  MACRO_FOLDER_NAME,
  MACRO_FOLDER_COLOR,
  GM_UTILITIES_MENU_ICON,
  DEFAULT_BANKS,
  DEFAULT_SESSION_SCENES,
  DEFAULT_RESOURCE_TRACKERS
} from "./constants.js";
import { audioController } from "./sound-pad/audio-controller.js";
import { SoundPadApp } from "./sound-pad/sound-pad-app.js";
import { SceneSwitcherApp } from "./scenes/scene-switcher.js";
import { ResourceTrackerApp } from "./resource-tracker/resource-tracker-app.js";
import { ResourceWidgetApp } from "./resource-tracker/resource-widget-app.js";
import { PartyPlacement } from "./scenes/party-placement.js";
import { SceneLinks } from "./scenes/scene-links.js";
import { JournalEditor, JournalTemplateDialog } from "./tools/journal-editor.js";
import { performanceMonitor, PerformanceMonitorApp, PerformanceHudApp } from "./tools/performance-monitor.js";
import { CharacterCheckerApp, registerCharacterSheetCheckerIntegration } from "./character/character-checker-app.js";
import { analyzeCharacter, createOrSyncAllSpellcastingEntries } from "./character/character-checker-engine.js";
import { LevelPlannerApp, registerSheetLevelUpPrompt } from "./character/level-planner-app.js";
import {
  applyPlannedLevelUp,
  buildLevelRoadmap,
  inspectLevelRevert,
  isLevelPlannerEnabled,
  revertActorToLevel
} from "./character/level-planner-engine.js";
import { GmScreenApp } from "./gm-screen/gm-screen-app.js";

let soundPadInstance = null;
let sceneSwitcherInstance = null;
let resourceTrackerInstance = null;
let resourceWidgetInstance = null;
let performanceMonitorInstance = null;
let performanceHudInstance = null;
let characterCheckerInstance = null;
let levelPlannerInstance = null;
let gmScreenInstance = null;

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

function getPerformanceHud() {
  if (!performanceHudInstance) {
    performanceHudInstance = new PerformanceHudApp({
      onOpenDashboard: () => {
        const app = getPerformanceMonitor();
        app.render({ force: true });
      }
    });
  }
  return performanceHudInstance;
}

function getPerformanceMonitor() {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitorApp({
      onToggleHud: () => getPerformanceHud().toggle()
    });
  }
  return performanceMonitorInstance;
}

function getSelectedCanvasPcActor() {
  const controlled = canvas?.tokens?.controlled || [];
  for (const token of controlled) {
    const actor = token?.actor;
    if (actor?.type === "character" && (game.user?.isGM || actor.isOwner)) {
      return actor;
    }
  }
  return null;
}

function toggleCharacterCheckerForSelection() {
  const app = getCharacterChecker();
  const selectedPc = getSelectedCanvasPcActor();
  if (app.rendered) {
    if (selectedPc && app._selectedActorId !== selectedPc.id) {
      app.openForActor(selectedPc);
    } else {
      app.close();
    }
  } else if (selectedPc) {
    app.openForActor(selectedPc);
  } else {
    app.toggle();
  }
}

function toggleLevelPlannerForSelection() {
  const app = getLevelPlanner();
  const selectedPc = getSelectedCanvasPcActor();
  if (app.rendered) {
    if (selectedPc && app._selectedActorId !== selectedPc.id) {
      app.openForActor(selectedPc);
    } else {
      app.close();
    }
  } else if (selectedPc) {
    app.openForActor(selectedPc);
  } else {
    app.toggle();
  }
}

function getCharacterChecker() {
  if (!characterCheckerInstance) {
    characterCheckerInstance = new CharacterCheckerApp({
      onOpenLevelPlanner: (actor) => getLevelPlanner().openForActor(actor)
    });
  }
  return characterCheckerInstance;
}

function getLevelPlanner() {
  if (!levelPlannerInstance) {
    levelPlannerInstance = new LevelPlannerApp({
      onOpenChecker: (actor) => getCharacterChecker().openForActor(actor)
    });
  }
  return levelPlannerInstance;
}

function getGmScreen() {
  if (!gmScreenInstance) {
    gmScreenInstance = new GmScreenApp();
  }
  return gmScreenInstance;
}

function rerenderOpenCharacterSheets() {
  const apps = new Set();
  if (ui?.windows) {
    for (const app of Object.values(ui.windows)) apps.add(app);
  }
  if (foundry?.applications?.instances) {
    for (const app of foundry.applications.instances.values()) apps.add(app);
  }
  for (const app of apps) {
    const appActor = app?.actor ?? app?.document;
    if (!appActor || appActor.type !== "character") continue;
    try {
      app.render({ force: false });
    } catch {
      try { app.render(); } catch { /* ignore */ }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* 1. SETTINGS REGISTRATION                                                  */
/* ------------------------------------------------------------------------- */

function registerSettings() {
  const isGM = performanceMonitor.isUserGM();

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
        soundPadInstance.render({ force: false });
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

  // Default Sound Pad Volume (percentage 5-100)
  game.settings.register(MODULE_ID, "soundPadDefaultVolume", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadDefaultVolume.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadDefaultVolume.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 5, max: 100, step: 5 },
    default: 40
  });

  // Use Track Volume on Drop
  game.settings.register(MODULE_ID, "soundPadUseTrackVolume", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadUseTrackVolume.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadUseTrackVolume.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Sound Pad Window Opacity (GM-only client preference)
  game.settings.register(MODULE_ID, "soundPadOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SoundPadOpacity.Hint"),
    scope: "client",
    config: isGM,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = document.querySelector("#pf2e-sound-pad");
      if (el) el.style.opacity = `${val / 100}`;
    }
  });

  // Scene Switcher Window Opacity (GM-only client preference)
  game.settings.register(MODULE_ID, "sceneSwitcherOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneSwitcherOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneSwitcherOpacity.Hint"),
    scope: "client",
    config: isGM,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = document.querySelector("#pf2e-scene-switcher");
      if (el) el.style.opacity = `${val / 100}`;
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

  // Resource Tracker Window Opacity (GM-only client preference)
  game.settings.register(MODULE_ID, "resourceTrackerOpacity", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.ResourceTrackerOpacity.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.ResourceTrackerOpacity.Hint"),
    scope: "client",
    config: isGM,
    type: Number,
    range: { min: 40, max: 100, step: 5 },
    default: 100,
    onChange: (val) => {
      const el = document.querySelector("#pf2e-resource-tracker");
      if (el) el.style.opacity = `${val / 100}`;
    }
  });

  // Scene Link Default Action
  game.settings.register(MODULE_ID, "sceneLinkDefaultAction", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkDefaultAction.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkDefaultAction.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      prompt: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionPrompt"),
      view: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionDirectView"),
      activate: game.i18n.localize("PF2E_AWESOME_GM.SceneLinks.ActionDirectActivate")
    },
    default: "prompt"
  });

  // Scene Link Default Pin Icon
  game.settings.register(MODULE_ID, "sceneLinkDefaultIcon", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkDefaultIcon.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkDefaultIcon.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/castle.svg"
  });

  // Scene Link Single-Click Activation (GM-only client preference)
  game.settings.register(MODULE_ID, "sceneLinkSingleClick", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkSingleClick.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.SceneLinkSingleClick.Hint"),
    scope: "client",
    config: isGM,
    type: Boolean,
    default: false
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

  // Performance Checker & Module Profiler Master Switch (GM-Only World Setting, Default OFF)
  game.settings.register(MODULE_ID, "enablePerformanceMonitor", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.EnablePerformanceMonitor.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.EnablePerformanceMonitor.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (enabled) => {
      if (!game.user?.isGM) return;
      if (enabled) {
        performanceMonitor.activate();
        ui.notifications?.info("Performance Checker enabled (GM Only)! Open it from the GM Utilities menu (or press Shift+P). Reload once (F5) for full startup hook attribution.");
      } else {
        performanceMonitor.deactivate();
        if (performanceMonitorInstance?.rendered) performanceMonitorInstance.close();
        if (performanceHudInstance?.rendered) performanceHudInstance.close();
        ui.notifications?.info("Performance Checker disabled (all background telemetry stopped).");
      }
      ui.controls?.render?.({ reset: true });
    }
  });

  // Performance Checker: Stutter / Frame Spike Threshold in ms (GM-Only World Setting)
  game.settings.register(MODULE_ID, "perfSpikeThresholdMs", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.PerfSpikeThresholdMs.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.PerfSpikeThresholdMs.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 50, max: 300, step: 25 },
    default: 100,
    onChange: (val) => {
      if (!game.user?.isGM) return;
      performanceMonitor.setSpikeThresholdMs(val);
    }
  });

  // Compact Performance HUD Position (Client)
  game.settings.register(MODULE_ID, "perfHudPosition", {
    name: "Performance HUD Position",
    scope: "client",
    config: false,
    type: Object,
    default: { left: 110, top: 14 }
  });

  // PF2e GM Screen: Hidden Card IDs (Client preference, auto-saved from Customize drawer)
  game.settings.register(MODULE_ID, "gmScreenHiddenCards", {
    name: "GM Screen Hidden Cards",
    hint: "Card IDs hidden by this GM in the PF2e GM Screen.",
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  // Character Completeness Checker: Inline Character Sheet Guides
  game.settings.register(MODULE_ID, "showCharacterSheetGuides", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.ShowCharacterSheetGuides.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.ShowCharacterSheetGuides.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      rerenderOpenCharacterSheets();
    }
  });

  // Character Completeness Checker: Allow Players to Auto-Add & Sync Spellcasting Entries
  game.settings.register(MODULE_ID, "allowPlayerAutoSpellcasting", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.AllowPlayerAutoSpellcasting.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.AllowPlayerAutoSpellcasting.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      rerenderOpenCharacterSheets();
      if (characterCheckerInstance?.rendered) {
        characterCheckerInstance.render({ force: false });
      }
    }
  });

  // Level 1-20 Build Planner & Guided Level-Up (Opt-In World Setting, Default OFF)
  game.settings.register(MODULE_ID, "enableLevelPlanner", {
    name: game.i18n.localize("PF2E_AWESOME_GM.Settings.EnableLevelPlanner.Name"),
    hint: game.i18n.localize("PF2E_AWESOME_GM.Settings.EnableLevelPlanner.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (enabled) => {
      if (!enabled && levelPlannerInstance?.rendered) {
        levelPlannerInstance.close();
      }
      rerenderOpenCharacterSheets();
      if (characterCheckerInstance?.rendered) {
        characterCheckerInstance.render({ force: false });
      }
      ui.controls?.render?.({ reset: true });
      if (game.user?.isGM) {
        ui.notifications?.info(
          enabled
            ? "Level 1-20 Build Planner enabled! GMs and players can now plan future levels and apply guided level-ups from Character Sheets."
            : "Level 1-20 Build Planner disabled (zero sheet or menu overhead)."
        );
      }
    }
  });
}

/**
 * Injects clean plain-text section headers (no icons) into the module's Configure Settings tab.
 * Works safely with both ApplicationV2 (HTMLElement) and legacy jQuery renderSettingsConfig hooks.
 * @param {HTMLElement|jQuery} html
 */
function injectSettingsSectionHeaders(html) {
  const root = html instanceof HTMLElement
    ? html
    : (html?.[0] instanceof HTMLElement ? html[0] : null);
  if (!root) return;

  const isGM = Boolean(game.user?.isGM);
  const sections = [
    {
      id: "pf2e-gm-hdr-soundpad",
      title: "Music & SFX Sound Pad",
      gmOnly: true,
      keys: ["autoStopOtherMusic", "defaultFadeDuration", "soundPadDefaultVolume", "soundPadUseTrackVolume", "soundPadOpacity"]
    },
    {
      id: "pf2e-gm-hdr-sceneswitcher",
      title: "Session Scene Switcher",
      gmOnly: true,
      keys: ["sceneSwitcherOpacity"]
    },
    {
      id: "pf2e-gm-hdr-resourcetracker",
      title: "Resource & Subsystem Tracker",
      gmOnly: true,
      keys: ["resourceTrackerOpacity"]
    },
    {
      id: "pf2e-gm-hdr-scenelinks",
      title: "Scene Links & Map Pins",
      gmOnly: true,
      keys: ["sceneLinkDefaultAction", "sceneLinkDefaultIcon", "sceneLinkSingleClick"]
    },
    {
      id: "pf2e-gm-hdr-macros",
      title: "Macros & General",
      gmOnly: true,
      keys: ["autoSyncMacros"]
    },
    {
      id: "pf2e-gm-hdr-performance",
      title: "Performance Checker (GM Only)",
      gmOnly: true,
      keys: ["enablePerformanceMonitor", "perfSpikeThresholdMs"]
    },
    {
      id: "pf2e-gm-hdr-characterchecker",
      title: "Character Completeness Checker",
      gmOnly: true,
      keys: ["showCharacterSheetGuides", "allowPlayerAutoSpellcasting"]
    },
    {
      id: "pf2e-gm-hdr-levelplanner",
      title: "Level 1-20 Build Planner & Guided Level-Up",
      gmOnly: true,
      keys: ["enableLevelPlanner"]
    }
  ];

  for (const sec of sections) {
    if (sec.gmOnly && !isGM) continue;
    if (root.querySelector(`#${sec.id}`)) continue;
    let firstGroup = null;
    for (const key of sec.keys) {
      const target = root.querySelector(`[name="${MODULE_ID}.${key}"]`)
        || root.querySelector(`[data-setting-id="${MODULE_ID}.${key}"]`);
      if (target) {
        firstGroup = target.closest(".form-group") || target;
        if (firstGroup) break;
      }
    }
    if (!firstGroup) continue;

    const header = document.createElement("h4");
    header.id = sec.id;
    header.className = "pf2e-gm-settings-header";
    header.textContent = sec.title;
    firstGroup.before(header);
  }
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
        pad.render({ force: true });
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

  game.keybindings.register(MODULE_ID, "togglePerformanceMonitor", {
    name: "Toggle Performance Checker (GM Only)",
    hint: "Open or close the GM Performance Checker & Module Profiler (requires the Performance Checker setting to be enabled).",
    editable: [
      { key: "KeyP", modifiers: ["Shift"] }
    ],
    onDown: () => {
      if (!game.user?.isGM || !performanceMonitor.isEnabled()) return false;
      getPerformanceMonitor().toggle();
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "toggleGmScreen", {
    name: "Toggle PF2e GM Screen (GM Only)",
    hint: "Quickly open, focus, or close the Instant-Access PF2e Quick-Reference GM Screen.",
    editable: [
      { key: "KeyG", modifiers: ["Shift"] }
    ],
    onDown: () => {
      if (!game.user?.isGM) return false;
      getGmScreen().toggle();
      return true;
    },
    restricted: true,
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
    // unless they have explicitly closed it during this session
    if (!isGM && visibleCount > 0 && !widget._userClosed) {
      widget.render({ force: true });
    }
  }
}

/* ------------------------------------------------------------------------- */
/* 3. SCENE CONTROLS INTEGRATION                                             */
/* ------------------------------------------------------------------------- */

function registerSceneControls(controls) {
  const isGM = Boolean(game.user?.isGM);

  // Support Array (v12 and earlier), Map/Collection, or Record/Object (v13/v14)
  const findControl = (name) => {
    if (Array.isArray(controls)) return controls.find(c => c?.name === name);
    if (controls instanceof Map || typeof controls?.get === "function") return controls.get(name);
    if (controls && typeof controls === "object") return controls[name] || Object.values(controls).find(c => c?.name === name);
    return null;
  };

  const scenesControl = findControl("scenes");
  const tokenControl = Array.isArray(controls)
    ? controls.find(c => c?.name === "token" || c?.name === "tokens")
    : (controls.get?.("token") || controls.get?.("tokens") || controls?.token || controls?.tokens);
  const tokenLayerName = tokenControl?.layer || "tokens";

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

  const placeSceneLinkTool = {
    name: "pf2e-place-scene-link",
    title: "Place Scene Link Pin",
    icon: "fa-solid fa-location-dot",
    visible: true,
    button: true,
    onClick: () => {
      SceneLinks.openPlacementPicker();
    }
  };

  const openJournalStylerTool = {
    name: "pf2e-journal-styler",
    title: "AP Journal Editor & Styler",
    icon: "fa-solid fa-feather-pointed",
    visible: true,
    button: true,
    onClick: () => {
      JournalTemplateDialog.open();
    }
  };

  const openPerformanceMonitorTool = {
    name: "pf2e-performance-monitor",
    title: "Performance Checker & Profiler",
    icon: "fa-solid fa-gauge-high",
    visible: true,
    button: true,
    onClick: () => {
      getPerformanceMonitor().toggle();
    }
  };

  const openCharacterCheckerTool = {
    name: "pf2e-character-checker",
    title: "PF2e Character Completeness Checker",
    icon: "fa-solid fa-clipboard-check",
    visible: true,
    button: true,
    onClick: () => {
      toggleCharacterCheckerForSelection();
    }
  };

  const openLevelPlannerTool = {
    name: "pf2e-level-planner",
    title: "PF2e Level 1-20 Build Planner",
    icon: "fa-solid fa-stairs",
    visible: true,
    button: true,
    onClick: () => {
      toggleLevelPlannerForSelection();
    }
  };

  const openGmScreenTool = {
    name: "pf2e-gm-screen",
    title: "PF2e Quick-Reference GM Screen",
    icon: "fa-solid fa-book-open-reader",
    visible: true,
    button: true,
    onClick: () => {
      getGmScreen().toggle();
    }
  };

  // Native Token Select tool (Foundry v14 requires `interaction: true` and `control: true`
  // on the select tool so Token._canControl allows clicking & drag-selecting tokens)
  const nativeSelectTool = Array.isArray(tokenControl?.tools)
    ? tokenControl.tools.find(t => t?.name === "select")
    : (tokenControl?.tools?.get?.("select") || tokenControl?.tools?.select || null);
  const selectTokensTool = {
    ...(nativeSelectTool ? foundry.utils.deepClone(nativeSelectTool) : {}),
    name: "select",
    title: nativeSelectTool?.title || (game.i18n?.has?.("CONTROLS.BasicSelect")
      ? game.i18n.localize("CONTROLS.BasicSelect")
      : "Select Tokens"),
    icon: nativeSelectTool?.icon || "fa-solid fa-expand",
    interaction: true,
    control: true,
    order: 0,
    visible: true
  };

  // GM-only tools added to Foundry built-in control groups
  if (isGM) {
    if (scenesControl) {
      insertTool(scenesControl, openSceneSwitcherTool);
      insertTool(scenesControl, placeSceneLinkTool);
    }
  }

  // Primary Utilities control group (Performance Checker is strictly GM-only; Level Planner is opt-in)
  const perfEnabled = isGM && performanceMonitor.isEnabled();
  const plannerEnabled = isLevelPlannerEnabled();
  const activeTools = (isGM
    ? [selectTokensTool, openGmScreenTool, openSoundPadTool, openSceneSwitcherTool, placePartyTool, placeSceneLinkTool, openJournalStylerTool, openResourceTrackerTool, openResourceWidgetTool, openCharacterCheckerTool, ...(plannerEnabled ? [openLevelPlannerTool] : []), ...(perfEnabled ? [openPerformanceMonitorTool] : []), panicToolData]
    : [selectTokensTool, openResourceWidgetTool, ...(plannerEnabled ? [openLevelPlannerTool] : [])]
  ).map((tool, index) => ({ ...tool, order: index }));

  const activeToolsObj = {};
  for (const t of activeTools) {
    activeToolsObj[t.name] = t;
  }

  let syncingTokenLayer = false;
  const gmUtilitiesControls = {
    name: "pf2e-gm-utilities",
    title: isGM ? "PF2e GM Utilities" : "PF2e Trackers HUD",
    icon: isGM ? GM_UTILITIES_MENU_ICON : "fa-solid fa-layer-group",
    layer: tokenLayerName,
    activeTool: "select",
    visible: true,
    onChange: (_event, active) => {
      if (!active || syncingTokenLayer || !canvas?.ready || !canvas.tokens) return;
      if (!canvas.tokens.active) {
        syncingTokenLayer = true;
        try {
          canvas.tokens.activate();
          if (ui.controls?.control?.name !== "pf2e-gm-utilities" && typeof ui.controls?.activate === "function") {
            ui.controls.activate({ control: "pf2e-gm-utilities", tool: "select" });
          }
        } finally {
          syncingTokenLayer = false;
        }
      }
    },
    onToolChange: () => {
      canvas?.tokens?.setAllRenderFlags?.({ refreshState: true });
    },
    tools: Array.isArray(controls) ? activeTools : activeToolsObj
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
/* 4. SIDEBAR DIRECTORY HEADER BUTTONS                                       */
/* ------------------------------------------------------------------------- */

function injectSidebarHeaderButton(html, { className, title, icon, label, onClick }) {
  if (!game.user.isGM) return;

  // In Foundry v14, html can be a native HTMLElement, DocumentFragment, or jQuery object
  const root = html instanceof HTMLElement
    ? html
    : (html?.[0] instanceof HTMLElement ? html[0] : (typeof $ !== "undefined" ? $(html)[0] : null));
  if (!root) return;

  const headerActions = root.querySelector?.(".header-actions");
  if (headerActions && !headerActions.querySelector(`.${className}`)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.title = title;
    btn.innerHTML = `<i class="${icon}"></i> ${label}`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
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
  },
  {
    name: PLACE_SCENE_LINK_MACRO_NAME,
    icon: PLACE_SCENE_LINK_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.placeSceneLink();`
  },
  {
    name: CHARACTER_CHECKER_MACRO_NAME,
    icon: CHARACTER_CHECKER_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.characterChecker.toggle();`
  },
  {
    name: GM_SCREEN_MACRO_NAME,
    icon: GM_SCREEN_MACRO_ICON,
    command: `game.pf2eAwesomeGmUtilities.gmScreen.toggle();`
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
    const currentDef = folder.ownership?.default;
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
      const currentDefault = existing.ownership?.default;
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

Hooks.once("init", () => {
  console.log("PF2e Awesome GM Utilities | Initializing Module...");
  registerSettings();
  performanceMonitor.onInit();
  registerKeybindings();
  JournalEditor.initialize();
});

Hooks.once("setup", () => {
  // Register libWrapper wrappers during `setup` (after lib-wrapper initializes in `init`)
  SceneLinks._patchNotePlaceables();
});

Hooks.on("getSceneControlButtons", (controls) => {
  registerSceneControls(controls);
});

Hooks.on("renderPlaylistDirectory", (app, html) => {
  injectSidebarHeaderButton(html, {
    className: "pf2e-sound-pad-btn",
    title: "Open Music & SFX Sound Pad",
    icon: "fa-solid fa-compact-disc",
    label: "Sound Pad",
    onClick: () => {
      const pad = getSoundPad();
      if (pad.rendered) pad.close();
      else pad.render({ force: true });
    }
  });
});

Hooks.on("renderSceneDirectory", (app, html) => {
  injectSidebarHeaderButton(html, {
    className: "pf2e-scene-switcher-btn",
    title: "Open Session Scene Switcher",
    icon: "fa-solid fa-map-location-dot",
    label: "Scene Switcher",
    onClick: () => getSceneSwitcher().toggle()
  });
});

Hooks.on("renderSettingsConfig", (app, html) => {
  injectSettingsSectionHeaders(html);
});

Hooks.once("ready", async () => {
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("is-gm", Boolean(game.user?.isGM));
    document.body.classList.toggle("is-player", !game.user?.isGM);
  }
  // Ensure GM-only client settings are strictly hidden from non-GM players in Configure Settings
  for (const key of ["soundPadOpacity", "sceneSwitcherOpacity", "resourceTrackerOpacity", "sceneLinkSingleClick"]) {
    const reg = game.settings?.settings?.get?.(`${MODULE_ID}.${key}`);
    if (reg) reg.config = Boolean(game.user?.isGM);
  }
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

  // Scene Links API & Initialization
  game.pf2eAwesomeGmUtilities.placeSceneLink = (options) => SceneLinks.openPlacementPicker(options);
  game.pf2eAwesomeGmUtilities.sceneLinks = SceneLinks;
  SceneLinks.initialize();

  // Advanced Journal Editor API
  game.pf2eAwesomeGmUtilities.journalEditor = {
    open: (options) => JournalTemplateDialog.open(options)
  };

  // PF2e Character Completeness Checker & Opt-In Level 1-20 Build Planner API
  registerCharacterSheetCheckerIntegration(
    (actor) => getCharacterChecker().openForActor(actor),
    (actor) => getLevelPlanner().openForActor(actor)
  );
  registerSheetLevelUpPrompt((actor, focusLevel) => getLevelPlanner().openForActor(actor, focusLevel));
  game.pf2eAwesomeGmUtilities.characterChecker = {
    get app() { return getCharacterChecker(); },
    toggle: () => toggleCharacterCheckerForSelection(),
    open: (actorOrId) => getCharacterChecker().openForActor(actorOrId),
    analyze: (actor) => analyzeCharacter(actor),
    syncSpellcasting: (actor) => createOrSyncAllSpellcastingEntries(actor)
  };
  game.pf2eAwesomeGmUtilities.levelPlanner = {
    get app() { return getLevelPlanner(); },
    isEnabled: () => isLevelPlannerEnabled(),
    toggle: () => toggleLevelPlannerForSelection(),
    open: (actorOrId, focusLevel) => getLevelPlanner().openForActor(actorOrId, focusLevel),
    buildRoadmap: (actor) => buildLevelRoadmap(actor),
    applyLevelUp: (actor) => applyPlannedLevelUp(actor),
    inspectRevert: (actor, targetLevel) => inspectLevelRevert(actor, targetLevel),
    revertToLevel: (actor, targetLevel, options) => revertActorToLevel(actor, targetLevel, options)
  };

  // Performance Checker & Module Profiler API + Quick-Reference GM Screen API (Strictly GM-Only)
  performanceMonitor.onReady();
  if (game.user.isGM) {
    game.pf2eAwesomeGmUtilities.gmScreen = {
      get app() { return getGmScreen(); },
      toggle: () => getGmScreen().toggle(),
      render: (options = { force: true }) => getGmScreen().render(options)
    };

    game.pf2eAwesomeGmUtilities.performanceMonitor = {
      engine: performanceMonitor,
      get app() { return getPerformanceMonitor(); },
      get hud() { return getPerformanceHud(); },
      toggle: () => {
        if (!game.user?.isGM) return;
        if (!performanceMonitor.isEnabled()) {
          ui.notifications?.warn("Enable 'Performance Checker & Module Profiler' in Module Settings first.");
          return;
        }
        getPerformanceMonitor().toggle();
      },
      toggleHud: () => {
        if (!game.user?.isGM) return;
        if (!performanceMonitor.isEnabled()) {
          ui.notifications?.warn("Enable 'Performance Checker & Module Profiler' in Module Settings first.");
          return;
        }
        getPerformanceHud().toggle();
      },
      runAudit: () => (game.user?.isGM ? performanceMonitor.runDeepAudit() : null),
      exportReport: () => (game.user?.isGM ? performanceMonitor.generateReportText() : "")
    };
  }

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
      game.socket.on(SOCKET_EVENT, (payload) => {
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
