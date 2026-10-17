/**
 * PF2e Awesome GM Utilities - Main Entry Point
 */

import {
  MODULE_ID,
  SOUND_PAD_MACRO_NAME,
  SOUND_PAD_MACRO_ICON,
  PANIC_STOP_MACRO_NAME,
  PANIC_STOP_MACRO_ICON,
  MACRO_FOLDER_NAME,
  MACRO_FOLDER_COLOR,
  DEFAULT_BANKS
} from "./constants.js";
import { audioController } from "./audio-controller.js";
import { SoundPadApp } from "./sound-pad-app.js";

let soundPadInstance = null;

function getSoundPad() {
  if (!soundPadInstance) {
    soundPadInstance = new SoundPadApp();
  }
  return soundPadInstance;
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
}

/* ------------------------------------------------------------------------- */
/* 3. SCENE CONTROLS INTEGRATION                                             */
/* ------------------------------------------------------------------------- */

function registerSceneControls(controls) {
  if (!game.user.isGM) return;

  // Support Array (v12 and earlier), Map/Collection, or Record/Object (v13/v14)
  let soundsControl = null;
  if (Array.isArray(controls)) {
    soundsControl = controls.find(c => c?.name === "sounds");
  } else if (controls instanceof Map || typeof controls?.get === "function") {
    soundsControl = controls.get("sounds");
  } else if (controls && typeof controls === "object") {
    soundsControl = controls.sounds || Object.values(controls).find(c => c?.name === "sounds");
  }

  const openToolData = {
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

  // Add tools to the sounds control group if available
  if (soundsControl) {
    if (Array.isArray(soundsControl.tools)) {
      const existingOpen = soundsControl.tools.findIndex(t => t?.name === openToolData.name);
      if (existingOpen >= 0) soundsControl.tools[existingOpen] = openToolData;
      else soundsControl.tools.push(openToolData);

      const existingPanic = soundsControl.tools.findIndex(t => t?.name === panicToolData.name);
      if (existingPanic >= 0) soundsControl.tools[existingPanic] = panicToolData;
      else soundsControl.tools.push(panicToolData);
    } else if (soundsControl.tools instanceof Map || typeof soundsControl.tools?.set === "function") {
      soundsControl.tools.set(openToolData.name, openToolData);
      soundsControl.tools.set(panicToolData.name, panicToolData);
    } else if (soundsControl.tools && typeof soundsControl.tools === "object") {
      soundsControl.tools[openToolData.name] = openToolData;
      soundsControl.tools[panicToolData.name] = panicToolData;
    }
  }

  // Also register a dedicated top-level GM Utilities control group
  const gmUtilitiesControls = {
    name: "pf2e-gm-utilities",
    title: "PF2e GM Utilities",
    icon: "fa-solid fa-wand-magic-sparkles",
    layer: "controls",
    visible: true,
    tools: Array.isArray(controls) ? [openToolData, panicToolData] : {
      [openToolData.name]: openToolData,
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
  }
];

async function getOrCreateFolder(name, type) {
  let folder = game.folders.getName(name);
  if (!folder) {
    try {
      folder = await Folder.create({
        name: name,
        type: type,
        parent: null,
        color: MACRO_FOLDER_COLOR
      });
    } catch (err) {
      console.error(`PF2e Awesome GM Utilities | Failed to create folder: ${name}`, err);
      return null;
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

  const existingMacros = game.macros.filter(m => m.flags?.[MODULE_ID]?.isModuleMacro);
  const desiredNames = DESIRED_MACROS.map(m => m.name);
  const observerOwnership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };

  for (const desired of DESIRED_MACROS) {
    const existing = existingMacros.find(m => m.name === desired.name);

    if (existing) {
      if (
        existing.command !== desired.command ||
        existing.img !== desired.icon ||
        existing.folder?.id !== folder.id
      ) {
        await existing.update({
          command: desired.command,
          img: desired.icon,
          folder: folder.id,
          ownership: observerOwnership
        });
      }
    } else {
      const macroData = {
        name: desired.name,
        type: "script",
        img: desired.icon,
        command: desired.command,
        folder: folder.id,
        ownership: observerOwnership,
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

Hooks.once("ready", async () => {
  // Global API namespace
  game.pf2eAwesomeGmUtilities = game.pf2eAwesomeGmUtilities || {};
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

  // Run macro sync
  if (game.user.isGM) {
    const currentVersion = game.modules.get(MODULE_ID)?.version || "1.0.0";
    let folder = game.folders.getName(MACRO_FOLDER_NAME);
    const storedVersion = folder ? folder.getFlag(MODULE_ID, "moduleVersion") : null;

    if (currentVersion !== storedVersion) {
      await syncMacros();
      folder = game.folders.getName(MACRO_FOLDER_NAME);
      if (folder) {
        await folder.setFlag(MODULE_ID, "moduleVersion", currentVersion);
      }
    }
  }

  console.log("PF2e Awesome GM Utilities | Ready! Sound Pad ready at game.pf2eAwesomeGmUtilities.soundPad");
});
