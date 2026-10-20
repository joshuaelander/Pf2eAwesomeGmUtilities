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

export const PLACE_PARTY_MACRO_NAME = "Place Party on Scene";
export const PLACE_PARTY_MACRO_ICON = "icons/svg/target.svg";

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
  },
  {
    presetId: "research",
    name: "Library Research (RP)",
    category: "subsystem",
    type: "progress",
    value: 4,
    min: 0,
    max: 15,
    color: "arcane",
    icon: "fa-solid fa-book-bookmark",
    notes: "Research Points (RP). Milestones: 5 RP (Basic Clue), 10 RP (Deep Lore), 15 RP (Mastery & Hidden Secret)."
  },
  {
    presetId: "reputation",
    name: "Faction Reputation",
    category: "subsystem",
    type: "reputation",
    value: 0,
    min: -50,
    max: 50,
    color: "gold",
    icon: "fa-solid fa-scale-balanced",
    notes: "Hunted (≤-30), Hated (-29 to -15), Disliked (-14 to -5), Ignored (-4 to +4), Liked (+5 to +14), Admired (+15 to +29), Revered (+30 to +50)."
  },
  {
    presetId: "npc-attitude",
    name: "NPC Attitude",
    category: "actor",
    type: "attitude",
    value: 3,
    min: 1,
    max: 5,
    color: "ocean",
    icon: "fa-solid fa-handshake",
    notes: "Hostile (1), Unfriendly (2), Indifferent (3, default), Friendly (4), Helpful (5). Modify via Make an Impression or Coerce."
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

/**
 * Standard PF2e Reputation Subsystem Tiers (-50 to +50).
 * Reference: https://2e.aonprd.com/Rules.aspx?ID=3072
 */
export const REPUTATION_TIERS = [
  { key: "hunted", label: "Hunted", min: -50, max: -30, threshold: -30, color: "#c084fc", border: "#a855f7", class: "rep-hunted", description: "Actively hunted down by the faction as a mortal enemy." },
  { key: "hated", label: "Hated", min: -29, max: -15, threshold: -15, color: "#f87171", border: "#ef4444", class: "rep-hated", description: "Ostracized, despised, and treated with active hostility." },
  { key: "disliked", label: "Disliked", min: -14, max: -5, threshold: -5, color: "#fb923c", border: "#f97316", class: "rep-disliked", description: "Distrusted, treated with cold suspicion and reluctance." },
  { key: "ignored", label: "Ignored", min: -4, max: 4, threshold: 0, color: "#94a3b8", border: "#64748b", class: "rep-ignored", description: "Unknown or neutral newcomer; standard baseline standing." },
  { key: "liked", label: "Liked", min: 5, max: 14, threshold: 5, color: "#4ade80", border: "#22c55e", class: "rep-liked", description: "Well regarded; members are friendly and grant minor favors." },
  { key: "admired", label: "Admired", min: 15, max: 29, threshold: 15, color: "#38bdf8", border: "#0ea5e9", class: "rep-admired", description: "Highly respected; access to major faction resources and allies." },
  { key: "revered", label: "Revered", min: 30, max: 50, threshold: 30, color: "#facc15", border: "#eab308", class: "rep-revered", description: "Legendary paragon of the faction with highest authority." }
];

export function getReputationTier(value) {
  const v = Number(value) || 0;
  if (v >= 30) return REPUTATION_TIERS[6]; // Revered
  if (v >= 15) return REPUTATION_TIERS[5]; // Admired
  if (v >= 5)  return REPUTATION_TIERS[4]; // Liked
  if (v >= -4) return REPUTATION_TIERS[3]; // Ignored
  if (v >= -14) return REPUTATION_TIERS[2]; // Disliked
  if (v >= -29) return REPUTATION_TIERS[1]; // Hated
  return REPUTATION_TIERS[0]; // Hunted
}

/**
 * Standard PF2e Social NPC Attitudes (1 to 5).
 * Reference: Player Core / Core Rulebook (Social Encounters)
 */
export const NPC_ATTITUDES = [
  {
    value: 1,
    key: "hostile",
    label: "Hostile",
    icon: "fa-solid fa-face-angry",
    color: "#ef4444",
    border: "#dc2626",
    class: "att-hostile",
    description: "Actively works against you—and might attack you just because of their dislike."
  },
  {
    value: 2,
    key: "unfriendly",
    label: "Unfriendly",
    icon: "fa-solid fa-face-frown",
    color: "#f97316",
    border: "#ea580c",
    class: "att-unfriendly",
    description: "Dislikes you and doesn’t want to help you."
  },
  {
    value: 3,
    key: "indifferent",
    label: "Indifferent",
    icon: "fa-solid fa-face-meh",
    color: "#94a3b8",
    border: "#64748b",
    class: "att-indifferent",
    description: "Doesn’t care about you either way. (Most NPCs start out indifferent.)"
  },
  {
    value: 4,
    key: "friendly",
    label: "Friendly",
    icon: "fa-solid fa-face-smile",
    color: "#38bdf8",
    border: "#0284c7",
    class: "att-friendly",
    description: "Has a good attitude toward you, but won’t necessarily stick their neck out to help you."
  },
  {
    value: 5,
    key: "helpful",
    label: "Helpful",
    icon: "fa-solid fa-face-laugh-beam",
    color: "#22c55e",
    border: "#16a34a",
    class: "att-helpful",
    description: "Willing to help you and responds favorably to your requests."
  }
];

export function getAttitudeInfo(value) {
  const v = Math.min(5, Math.max(1, Number(value) || 3));
  return NPC_ATTITUDES.find(a => a.value === v) || NPC_ATTITUDES[2];
}

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
