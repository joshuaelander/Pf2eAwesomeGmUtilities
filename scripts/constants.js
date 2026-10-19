/**
 * PF2e Awesome GM Utilities - Constants & Default Configurations
 */

export const MODULE_ID = "pf2e-awesome-gm-utilities";
export const SOCKET_EVENT = `module.${MODULE_ID}`;

export const SOUND_PAD_MACRO_NAME = "PF2e Music Sound Pad";
export const SOUND_PAD_MACRO_ICON = "icons/svg/sound.svg";

export const PANIC_STOP_MACRO_NAME = "Stop All Music (Panic)";
export const PANIC_STOP_MACRO_ICON = "icons/svg/sound-off.svg";

export const SCENE_SWITCHER_MACRO_NAME = "PF2e Scene Switcher";
export const SCENE_SWITCHER_MACRO_ICON = "icons/svg/castle.svg";

export const RESOURCE_TRACKER_MACRO_NAME = "PF2e Resource Tracker";
export const RESOURCE_TRACKER_MACRO_ICON = "icons/svg/clockwork.svg";

export const RESOURCE_WIDGET_MACRO_NAME = "PF2e Floating Trackers HUD";
export const RESOURCE_WIDGET_MACRO_ICON = "icons/svg/eye.svg";

export const MACRO_FOLDER_NAME = "PF2e Awesome GM Utilities";
export const MACRO_FOLDER_COLOR = "#8b1e1e";

export const DEFAULT_SESSION_SCENES = [];

export const DEFAULT_RESOURCE_PRESETS = [
  {
    presetId: "rations",
    name: "Rations / Food",
    category: "party",
    type: "counter",
    value: 14,
    min: 0,
    max: 30,
    color: "nature",
    icon: "fa-solid fa-bread-slice",
    notes: "Daily party food supplies. 1 used per PC each day."
  },
  {
    presetId: "water",
    name: "Clean Water",
    category: "party",
    type: "counter",
    value: 12,
    min: 0,
    max: 30,
    color: "ocean",
    icon: "fa-solid fa-droplet",
    notes: "Potable water in skins/casks."
  },
  {
    presetId: "supplies",
    name: "Camp & Travel Supplies",
    category: "party",
    type: "counter",
    value: 10,
    min: 0,
    max: 20,
    color: "amber",
    icon: "fa-solid fa-campground",
    notes: "Firewood, bandages, lantern oil, and campsite gear."
  },
  {
    presetId: "victory-points",
    name: "Victory Points (VP)",
    category: "subsystem",
    type: "progress",
    value: 6,
    min: 0,
    max: 20,
    color: "gold",
    icon: "fa-solid fa-trophy",
    notes: "Track progress in Chases, Research, Infiltration, or Heists."
  },
  {
    presetId: "alert-clock",
    name: "Alarm / Alert Level",
    category: "subsystem",
    type: "clock",
    clockSegments: 6,
    value: 2,
    min: 0,
    max: 6,
    color: "crimson",
    icon: "fa-solid fa-bell",
    notes: "Guards raise the alarm when filled! Triggers combat on 6."
  },
  {
    presetId: "doom-clock",
    name: "Ritual Countdown Clock",
    category: "subsystem",
    type: "clock",
    clockSegments: 4,
    value: 3,
    min: 0,
    max: 4,
    color: "arcane",
    direction: "countdown",
    icon: "fa-solid fa-hourglass-half",
    notes: "Rounds or turns remaining before the ritual completes."
  },
  {
    presetId: "sanity",
    name: "Sanity / Stress",
    category: "actor",
    type: "progress",
    value: 15,
    min: 0,
    max: 20,
    color: "shadow",
    icon: "fa-solid fa-brain",
    notes: "Mental fortitude against cosmic horror and maddening sights."
  },
  {
    presetId: "generic-affliction",
    name: "Affliction (Disease / Poison / Curse)",
    category: "actor",
    type: "stage",
    value: 1,
    min: 1,
    max: 5,
    color: "fire",
    icon: "fa-solid fa-biohazard",
    stages: [
      { stage: 1, name: "Stage 1", effect: "Initial symptoms / Sickened 1" },
      { stage: 2, name: "Stage 2", effect: "Clumsy 1 and Sickened 1" },
      { stage: 3, name: "Stage 3", effect: "Clumsy 2, Drained 1" },
      { stage: 4, name: "Stage 4", effect: "Clumsy 2, Drained 2, and Enfeebled 1" },
      { stage: 5, name: "Stage 5", effect: "Unconscious / Lethal progression" }
    ],
    notes: "Save DC 15 Fortitude; progression checks at end of interval."
  }
];

export const DEFAULT_RESOURCE_TRACKERS = [
  {
    id: "tracker-food",
    name: "Party Rations",
    category: "party",
    type: "counter",
    value: 16,
    min: 0,
    max: 30,
    color: "nature",
    icon: "fa-solid fa-bread-slice",
    notes: "1 ration per PC per day of wilderness travel."
  },
  {
    id: "tracker-water",
    name: "Clean Water",
    category: "party",
    type: "counter",
    value: 12,
    min: 0,
    max: 24,
    color: "ocean",
    icon: "fa-solid fa-droplet",
    notes: "Fresh water stored in canteens and barrels."
  },
  {
    id: "tracker-vp",
    name: "Infiltration Progress (VP)",
    category: "subsystem",
    type: "progress",
    value: 8,
    min: 0,
    max: 20,
    color: "gold",
    icon: "fa-solid fa-trophy",
    notes: "Accumulate 20 Victory Points to breach the inner sanctum.",
    isPinned: true,
    visibleToPlayers: true
  },
  {
    id: "tracker-alert",
    name: "Castle Alert Clock",
    category: "subsystem",
    type: "clock",
    clockSegments: 6,
    value: 3,
    min: 0,
    max: 6,
    color: "crimson",
    icon: "fa-solid fa-bell",
    notes: "Fills when guards notice suspicious noise or missing patrols.",
    isPinned: true,
    visibleToPlayers: true
  }
];



export const COLOR_THEMES = {
  crimson: { label: "Crimson (Combat)", color: "#8b1e1e", border: "#c93b3b", glow: "rgba(201, 59, 59, 0.45)" },
  gold: { label: "Pathfinder Gold", color: "#997300", border: "#d4af37", glow: "rgba(212, 175, 55, 0.45)" },
  amber: { label: "Amber (Tavern)", color: "#92400e", border: "#d97706", glow: "rgba(217, 119, 6, 0.45)" },
  nature: { label: "Forest Green (Nature)", color: "#1e5239", border: "#2d6a4f", glow: "rgba(45, 106, 79, 0.45)" },
  ocean: { label: "Ocean Blue (Calm)", color: "#1b436e", border: "#2563eb", glow: "rgba(37, 99, 235, 0.45)" },
  arcane: { label: "Arcane Violet (Magic)", color: "#542577", border: "#8b5cf6", glow: "rgba(139, 92, 246, 0.45)" },
  shadow: { label: "Shadow Slate (Dungeon)", color: "#27272a", border: "#52525b", glow: "rgba(82, 82, 91, 0.45)" },
  fire: { label: "Inferno Orange (Danger)", color: "#9a3412", border: "#ea580c", glow: "rgba(234, 88, 12, 0.45)" }
};

export const DEFAULT_BANKS = [
  {
    id: "bank-combat",
    name: "Combat",
    icon: "fa-solid fa-swords",
    slots: [
      {
        id: "slot-c1",
        name: "Epic Boss Battle",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "crimson",
        icon: "fa-solid fa-dragon",
        mode: "loop",
        volume: 0.8,
        fadeDuration: 1.5
      },
      {
        id: "slot-c2",
        name: "Fast Skirmish",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "crimson",
        icon: "fa-solid fa-shield-halved",
        mode: "loop",
        volume: 0.8,
        fadeDuration: 1.5
      },
      {
        id: "slot-c3",
        name: "Dire Tension",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "fire",
        icon: "fa-solid fa-skull",
        mode: "loop",
        volume: 0.75,
        fadeDuration: 2.0
      },
      {
        id: "slot-c4",
        name: "Victory Fanfare",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "gold",
        icon: "fa-solid fa-trophy",
        mode: "oneshot",
        volume: 0.85,
        fadeDuration: 0.5
      },
      {
        id: "slot-c5",
        name: "Tragic Defeat",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "shadow",
        icon: "fa-solid fa-heart-crack",
        mode: "toggle",
        volume: 0.7,
        fadeDuration: 2.0
      },
      {
        id: "slot-c6",
        name: "Chase Scene",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "fire",
        icon: "fa-solid fa-person-running",
        mode: "loop",
        volume: 0.8,
        fadeDuration: 1.0
      }
    ]
  },
  {
    id: "bank-ambience",
    name: "Ambience",
    icon: "fa-solid fa-tree",
    slots: [
      {
        id: "slot-a1",
        name: "Wilderness Camp",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "nature",
        icon: "fa-solid fa-campground",
        mode: "loop",
        volume: 0.6,
        fadeDuration: 3.0
      },
      {
        id: "slot-a2",
        name: "Rain & Thunder",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "ocean",
        icon: "fa-solid fa-cloud-showers-heavy",
        mode: "loop",
        volume: 0.65,
        fadeDuration: 3.0
      },
      {
        id: "slot-a3",
        name: "Dungeon Drip",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "shadow",
        icon: "fa-solid fa-dungeon",
        mode: "loop",
        volume: 0.6,
        fadeDuration: 3.0
      },
      {
        id: "slot-a4",
        name: "Ancient Ruins",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "arcane",
        icon: "fa-solid fa-monument",
        mode: "loop",
        volume: 0.6,
        fadeDuration: 3.0
      },
      {
        id: "slot-a5",
        name: "Spooky Crypt",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "shadow",
        icon: "fa-solid fa-ghost",
        mode: "loop",
        volume: 0.65,
        fadeDuration: 2.5
      },
      {
        id: "slot-a6",
        name: "Holy Temple",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "gold",
        icon: "fa-solid fa-sun",
        mode: "loop",
        volume: 0.6,
        fadeDuration: 2.5
      }
    ]
  },
  {
    id: "bank-tavern",
    name: "Tavern & Town",
    icon: "fa-solid fa-beer-mug-empty",
    slots: [
      {
        id: "slot-t1",
        name: "Lively Tavern",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "amber",
        icon: "fa-solid fa-beer-mug-empty",
        mode: "loop",
        volume: 0.7,
        fadeDuration: 2.0
      },
      {
        id: "slot-t2",
        name: "Bustling Market",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "amber",
        icon: "fa-solid fa-shop",
        mode: "loop",
        volume: 0.65,
        fadeDuration: 2.0
      },
      {
        id: "slot-t3",
        name: "Bard Lute Tune",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "gold",
        icon: "fa-solid fa-guitar",
        mode: "toggle",
        volume: 0.75,
        fadeDuration: 1.5
      },
      {
        id: "slot-t4",
        name: "Royal Banquet",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "gold",
        icon: "fa-solid fa-crown",
        mode: "loop",
        volume: 0.7,
        fadeDuration: 2.0
      },
      {
        id: "slot-t5",
        name: "Harbor Docks",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "ocean",
        icon: "fa-solid fa-ship",
        mode: "loop",
        volume: 0.65,
        fadeDuration: 2.5
      },
      {
        id: "slot-t6",
        name: "Mysterious Alley",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "shadow",
        icon: "fa-solid fa-mask",
        mode: "loop",
        volume: 0.65,
        fadeDuration: 2.0
      }
    ]
  },
  {
    id: "bank-sfx",
    name: "SFX & Stingers",
    icon: "fa-solid fa-bolt",
    slots: [
      {
        id: "slot-s1",
        name: "Critical Hit!",
        type: "file",
        playlistId: "",
        soundId: "",
        src: "sounds/dice.wav",
        color: "gold",
        icon: "fa-solid fa-dice-d20",
        mode: "oneshot",
        volume: 0.9,
        fadeDuration: 0.0
      },
      {
        id: "slot-s2",
        name: "Monster Roar",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "crimson",
        icon: "fa-solid fa-dragon",
        mode: "oneshot",
        volume: 0.85,
        fadeDuration: 0.0
      },
      {
        id: "slot-s3",
        name: "Trap Sprung!",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "fire",
        icon: "fa-solid fa-burst",
        mode: "oneshot",
        volume: 0.85,
        fadeDuration: 0.0
      },
      {
        id: "slot-s4",
        name: "Secret / Puzzle Solved",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "arcane",
        icon: "fa-solid fa-key",
        mode: "oneshot",
        volume: 0.8,
        fadeDuration: 0.0
      },
      {
        id: "slot-s5",
        name: "Creepy Horror Stinger",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "shadow",
        icon: "fa-solid fa-skull-crossbones",
        mode: "oneshot",
        volume: 0.85,
        fadeDuration: 0.0
      },
      {
        id: "slot-s6",
        name: "Level Up Fanfare",
        type: "playlist-sound",
        playlistId: "",
        soundId: "",
        src: "",
        color: "gold",
        icon: "fa-solid fa-angles-up",
        mode: "oneshot",
        volume: 0.9,
        fadeDuration: 0.0
      }
    ]
  }
];
