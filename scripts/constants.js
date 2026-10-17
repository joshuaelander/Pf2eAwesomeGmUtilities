/**
 * PF2e Awesome GM Utilities - Constants & Default Configurations
 */

export const MODULE_ID = "pf2e-awesome-gm-utilities";
export const SOCKET_EVENT = `module.${MODULE_ID}`;

export const SOUND_PAD_MACRO_NAME = "PF2e Music Sound Pad";
export const SOUND_PAD_MACRO_ICON = "icons/tools/instruments/drum-leather-brown.webp";

export const PANIC_STOP_MACRO_NAME = "Stop All Music (Panic)";
export const PANIC_STOP_MACRO_ICON = "icons/magic/control/debuff-energy-hold-levitate-yellow.webp";

export const MACRO_FOLDER_NAME = "PF2e Awesome GM Utilities";
export const MACRO_FOLDER_COLOR = "#8b1e1e";

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
