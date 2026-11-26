/**
 * PF2e Awesome GM Utilities - PF2e Remaster Quick-Reference Data & Calculators
 *
 * Pure, self-contained Pathfinder 2e Remaster (Player Core / GM Core) reference tables
 * for the Instant-Access GM Screen. Zero Foundry mutations, zero external dependencies.
 */

export const SIMPLE_DCS = [
  { rank: "Untrained", dc: 10, note: "Everyday task" },
  { rank: "Trained", dc: 15, note: "Basic training" },
  { rank: "Expert", dc: 20, note: "Skilled specialist" },
  { rank: "Master", dc: 30, note: "Exceptional mastery" },
  { rank: "Legendary", dc: 40, note: "Mythic feat" }
];

export const DC_ADJUSTMENTS = [
  { key: "incredibly-easy", label: "Incredibly Easy", shortLabel: "Incr. Easy", delta: -10, rarity: "" },
  { key: "very-easy", label: "Very Easy", shortLabel: "Very Easy", delta: -5, rarity: "" },
  { key: "easy", label: "Easy", shortLabel: "Easy", delta: -2, rarity: "" },
  { key: "standard", label: "Standard", shortLabel: "Standard", delta: 0, rarity: "Common" },
  { key: "hard", label: "Hard", shortLabel: "Hard", delta: 2, rarity: "Uncommon" },
  { key: "very-hard", label: "Very Hard", shortLabel: "Very Hard", delta: 5, rarity: "Rare" },
  { key: "incredibly-hard", label: "Incredibly Hard", shortLabel: "Incr. Hard", delta: 10, rarity: "Unique" }
];

/** GM Core Table 2-1: DCs by Level (0–25) */
export const DC_BY_LEVEL = [
  { level: 0, dc: 14 }, { level: 1, dc: 15 }, { level: 2, dc: 16 }, { level: 3, dc: 18 },
  { level: 4, dc: 19 }, { level: 5, dc: 20 }, { level: 6, dc: 22 }, { level: 7, dc: 23 },
  { level: 8, dc: 24 }, { level: 9, dc: 26 }, { level: 10, dc: 27 }, { level: 11, dc: 28 },
  { level: 12, dc: 30 }, { level: 13, dc: 31 }, { level: 14, dc: 32 }, { level: 15, dc: 34 },
  { level: 16, dc: 35 }, { level: 17, dc: 36 }, { level: 18, dc: 38 }, { level: 19, dc: 39 },
  { level: 20, dc: 40 }, { level: 21, dc: 42 }, { level: 22, dc: 44 }, { level: 23, dc: 46 },
  { level: 24, dc: 48 }, { level: 25, dc: 50 }
];

/** GM Core Spell Rank DCs (Ranks 1–10) & Player Core Learn a Spell Costs */
export const SPELL_RANK_DCS = [
  { rank: 1, dc: 15, learnCost: "2 gp", minLevel: 1 },
  { rank: 2, dc: 18, learnCost: "6 gp", minLevel: 3 },
  { rank: 3, dc: 20, learnCost: "16 gp", minLevel: 5 },
  { rank: 4, dc: 23, learnCost: "36 gp", minLevel: 7 },
  { rank: 5, dc: 26, learnCost: "70 gp", minLevel: 9 },
  { rank: 6, dc: 28, learnCost: "140 gp", minLevel: 11 },
  { rank: 7, dc: 31, learnCost: "300 gp", minLevel: 13 },
  { rank: 8, dc: 34, learnCost: "650 gp", minLevel: 15 },
  { rank: 9, dc: 36, learnCost: "1,500 gp", minLevel: 17 },
  { rank: 10, dc: 39, learnCost: "7,000 gp", minLevel: 19 }
];

export const DEGREES_OF_SUCCESS = [
  { degree: "Critical Success", cls: "is-crit-succ", rule: "Beat DC by 10+ (or Nat 20 upgrades degree by 1 step)." },
  { degree: "Success", cls: "is-succ", rule: "Meet or exceed DC (DC to DC+9)." },
  { degree: "Failure", cls: "is-fail", rule: "Below DC (DC-1 to DC-9)." },
  { degree: "Critical Failure", cls: "is-crit-fail", rule: "Miss DC by 10+ (or Nat 1 downgrades degree by 1 step)." }
];

export const QUICK_CHECK_SKILLS = [
  { slug: "perception", label: "Perception" },
  { slug: "acrobatics", label: "Acrobatics" },
  { slug: "arcana", label: "Arcana" },
  { slug: "athletics", label: "Athletics" },
  { slug: "crafting", label: "Crafting" },
  { slug: "deception", label: "Deception" },
  { slug: "diplomacy", label: "Diplomacy" },
  { slug: "intimidation", label: "Intimidation" },
  { slug: "medicine", label: "Medicine" },
  { slug: "nature", label: "Nature" },
  { slug: "occultism", label: "Occultism" },
  { slug: "performance", label: "Performance" },
  { slug: "religion", label: "Religion" },
  { slug: "society", label: "Society" },
  { slug: "stealth", label: "Stealth" },
  { slug: "survival", label: "Survival" },
  { slug: "thievery", label: "Thievery" },
  { slug: "fortitude", label: "Fortitude Save" },
  { slug: "reflex", label: "Reflex Save" },
  { slug: "will", label: "Will Save" },
  { slug: "flat", label: "Flat Check" }
];

/** Player Core Table 4-2: Income Earned (per day) */
export const EARN_INCOME_TABLE = [
  { level: 0, label: "0", dc: 14, failed: "1 cp", trained: "5 cp", expert: "5 cp", master: "5 cp", legendary: "5 cp" },
  { level: 1, label: "1", dc: 15, failed: "2 cp", trained: "2 sp", expert: "2 sp", master: "2 sp", legendary: "2 sp" },
  { level: 2, label: "2", dc: 16, failed: "4 cp", trained: "3 sp", expert: "3 sp", master: "3 sp", legendary: "3 sp" },
  { level: 3, label: "3", dc: 18, failed: "8 cp", trained: "5 sp", expert: "5 sp", master: "5 sp", legendary: "5 sp" },
  { level: 4, label: "4", dc: 19, failed: "1 sp", trained: "7 sp", expert: "8 sp", master: "8 sp", legendary: "8 sp" },
  { level: 5, label: "5", dc: 20, failed: "2 sp", trained: "9 sp", expert: "1 gp", master: "1 gp", legendary: "1 gp" },
  { level: 6, label: "6", dc: 22, failed: "3 sp", trained: "1 gp, 5 sp", expert: "2 gp", master: "2 gp", legendary: "2 gp" },
  { level: 7, label: "7", dc: 23, failed: "4 sp", trained: "2 gp", expert: "2 gp, 5 sp", master: "2 gp, 5 sp", legendary: "2 gp, 5 sp" },
  { level: 8, label: "8", dc: 24, failed: "5 sp", trained: "2 gp, 5 sp", expert: "3 gp", master: "3 gp", legendary: "3 gp" },
  { level: 9, label: "9", dc: 26, failed: "6 sp", trained: "3 gp", expert: "4 gp", master: "4 gp", legendary: "4 gp" },
  { level: 10, label: "10", dc: 27, failed: "7 sp", trained: "4 gp", expert: "5 gp", master: "6 gp", legendary: "6 gp" },
  { level: 11, label: "11", dc: 28, failed: "8 sp", trained: "5 gp", expert: "6 gp", master: "8 gp", legendary: "8 gp" },
  { level: 12, label: "12", dc: 30, failed: "9 sp", trained: "6 gp", expert: "8 gp", master: "10 gp", legendary: "10 gp" },
  { level: 13, label: "13", dc: 31, failed: "1 gp", trained: "7 gp", expert: "10 gp", master: "15 gp", legendary: "15 gp" },
  { level: 14, label: "14", dc: 32, failed: "1 gp, 5 sp", trained: "8 gp", expert: "15 gp", master: "20 gp", legendary: "20 gp" },
  { level: 15, label: "15", dc: 34, failed: "2 gp", trained: "10 gp", expert: "20 gp", master: "28 gp", legendary: "28 gp" },
  { level: 16, label: "16", dc: 35, failed: "2 gp, 5 sp", trained: "13 gp", expert: "25 gp", master: "36 gp", legendary: "40 gp" },
  { level: 17, label: "17", dc: 36, failed: "3 gp", trained: "15 gp", expert: "30 gp", master: "45 gp", legendary: "55 gp" },
  { level: 18, label: "18", dc: 38, failed: "4 gp", trained: "20 gp", expert: "45 gp", master: "70 gp", legendary: "90 gp" },
  { level: 19, label: "19", dc: 39, failed: "6 gp", trained: "30 gp", expert: "60 gp", master: "100 gp", legendary: "130 gp" },
  { level: 20, label: "20", dc: 40, failed: "8 gp", trained: "40 gp", expert: "75 gp", master: "150 gp", legendary: "200 gp" },
  { level: 21, label: "20 (Crit)", dc: 40, failed: "—", trained: "50 gp", expert: "90 gp", master: "175 gp", legendary: "300 gp" }
];

export const TREAT_WOUNDS_TABLE = [
  { rank: "Trained", dc: 15, success: "2d8", critSuccess: "4d8", critFail: "1d8 dmg" },
  { rank: "Expert", dc: 20, success: "2d8 + 10", critSuccess: "4d8 + 10", critFail: "1d8 dmg" },
  { rank: "Master", dc: 30, success: "2d8 + 30", critSuccess: "4d8 + 30", critFail: "1d8 dmg" },
  { rank: "Legendary", dc: 40, success: "2d8 + 50", critSuccess: "4d8 + 50", critFail: "1d8 dmg" }
];

export const RECALL_KNOWLEDGE_SKILLS = [
  { skill: "Arcana", creatures: "Arcane, Beast, Construct, Dragon, Elemental" },
  { skill: "Nature", creatures: "Animal, Beast, Fey, Fungus, Leshy, Plant" },
  { skill: "Occultism", creatures: "Aberration, Astral, Dream, Ethereal, Occult, Spirit, Time" },
  { skill: "Religion", creatures: "Celestial, Fiend, Monitor, Undead" },
  { skill: "Society", creatures: "Humanoid (and settlements, history, politics)" },
  { skill: "Lore (Specific)", creatures: "Applies Easy (-2) or Very Easy (-5) DC adjustment" }
];

export const EXPLORATION_ACTIVITIES = [
  { name: "Avoid Notice", speed: "Half", summary: "Roll Stealth for initiative; may start Hidden/Undetected." },
  { name: "Defend", speed: "Half", summary: "Raise a Shield before your first turn in combat." },
  { name: "Detect Magic", speed: "Half", summary: "Cast Detect Magic regularly; sense magic within 30 ft." },
  { name: "Follow the Expert", speed: "Normal", summary: "Gain +2/+3/+4 circ. bonus & add level to matching skill check." },
  { name: "Hustle", speed: "Double", summary: "Move at 2× speed for Con mod × 10 min (min 10 min)." },
  { name: "Investigate", speed: "Half", summary: "Use Recall Knowledge on clues and surroundings." },
  { name: "Repeat a Spell", speed: "Half", summary: "Keep casting a 2-action or shorter spell (e.g. Shield, Guidance)." },
  { name: "Scout", speed: "Half", summary: "Party gets +1 circumstance bonus to initiative rolls." },
  { name: "Search", speed: "Half", summary: "Seek hidden doors, hazards, and traps (max 300 ft/min for traps)." }
];

export const COVER_RULES = [
  { type: "Lesser Cover", bonus: "+1 AC", notes: "Another creature in the way; cannot Take Cover or Hide." },
  { type: "Standard Cover", bonus: "+2 AC, Ref, Stealth", notes: "Low wall, corner, tree; Take Cover (1A) upgrades to Greater." },
  { type: "Greater Cover", bonus: "+4 AC, Ref, Stealth", notes: "Arrow slit, prone behind wall, or Take Cover from Standard." }
];

export const DETECTION_STATES = [
  { state: "Observed", flatDc: "—", notes: "Clearly seen with a precise sense; no penalty." },
  { state: "Concealed", flatDc: "DC 5", notes: "Dim light, fog, mist. Targeted effects require Flat DC 5." },
  { state: "Hidden", flatDc: "DC 11", notes: "Know square only (e.g. Invisible/Darkness). Off-Guard to it; Flat DC 11." },
  { state: "Undetected", flatDc: "DC 11*", notes: "Square unknown. Off-Guard to it; guess square + secret Flat DC 11." },
  { state: "Unnoticed", flatDc: "—", notes: "Completely unaware the creature is present at all." }
];

export const COMBAT_ACTIONS = [
  {
    name: "Trip",
    cost: "1A",
    traits: "Attack",
    check: "Athletics vs Reflex DC",
    summary: "Crit: Prone + 1d6 bludgeoning. Succ: Prone. Crit Fail: You fall Prone."
  },
  {
    name: "Grapple",
    cost: "1A",
    traits: "Attack",
    check: "Athletics vs Fort DC",
    summary: "Crit: Restrained. Succ: Grabbed (until end of your next turn). Crit Fail: Target grabs you or knocks you Prone."
  },
  {
    name: "Shove",
    cost: "1A",
    traits: "Attack",
    check: "Athletics vs Fort DC",
    summary: "Crit: Push 10 ft + Stride after. Succ: Push 5 ft + Stride after. Crit Fail: Fall Prone."
  },
  {
    name: "Reposition",
    cost: "1A",
    traits: "Attack",
    check: "Athletics vs Fort DC",
    summary: "Remaster: Move target 5 ft (Crit: 10 ft) within your reach; cannot enter hazardous space."
  },
  {
    name: "Disarm",
    cost: "1A",
    traits: "Attack",
    check: "Athletics vs Reflex DC",
    summary: "Remaster: Crit: Drop item. Succ: -2 circ. to use item & +2 to Disarm until they Interact to re-grip."
  },
  {
    name: "Demoralize",
    cost: "1A",
    traits: "Auditory, Fear",
    check: "Intimidation vs Will DC",
    summary: "30 ft (-4 if no shared language). Crit: Frightened 2. Succ: Frightened 1. Immune 10 min."
  },
  {
    name: "Feint",
    cost: "1A",
    traits: "Mental",
    check: "Deception vs Perc DC",
    summary: "Melee reach. Crit: Off-Guard to all your melee attacks until end of next turn. Succ: Off-Guard to next melee attack this turn."
  },
  {
    name: "Create a Diversion",
    cost: "1A",
    traits: "Mental",
    check: "Deception vs Perc DC",
    summary: "Become Hidden to creatures whose Perc DC you beat until end of turn or you act/attack. (+4 bonus to their DC for 1 min.)"
  },
  {
    name: "Tumble Through",
    cost: "1A",
    traits: "Move",
    check: "Acrobatics vs Reflex DC",
    summary: "Stride through enemy's space (difficult terrain). Fail: Movement ends & triggers reactions."
  },
  {
    name: "Escape",
    cost: "1A",
    traits: "Attack",
    check: "Unarmed/Acrob/Athl vs DC",
    summary: "Crit: Escape + Stride 5 ft. Succ: Escape Grabbed/Restrained/Immobilized. Crit Fail: Cannot Escape again this turn."
  },
  {
    name: "Aid",
    cost: "1A + R",
    traits: "—",
    check: "Skill/Attack vs DC 15",
    summary: "Remaster DC 15! Crit: +2 (+3 Master, +4 Legendary) circ. bonus. Succ: +1 circ. bonus. Crit Fail: -1 penalty."
  },
  {
    name: "Persistent Damage",
    cost: "End Turn",
    traits: "—",
    check: "Flat DC 15",
    summary: "Take damage at end of turn, then roll Flat DC 15 to end. Assisted Recovery (2A / smart fix) drops check to Flat DC 10 or auto-ends."
  }
];

export const DYING_FALLING_RULES = [
  {
    title: "Dying & Recovery (Remaster)",
    bullets: [
      "Drop to 0 HP: Move initiative directly BEFORE the attacker. Gain Dying 1 (+ Wounded), or Dying 2 (+ Wounded) if crit or crit-failed save.",
      "Recovery Check (start of turn while Dying): Flat DC = 10 + Dying value.",
      "Crit Succ: Dying -2 | Succ: Dying -1 | Fail: Dying +1 | Crit Fail: Dying +2. At Dying 4 (or 4 - Doomed): Dead.",
      "Stabilize / Regain HP: Losing Dying adds Wounded +1. Clear Wounded via Treat Wounds (or full HP + 10 min rest).",
      "Heroic Recovery: Spend ALL remaining Hero Points (min 1) to stabilize at 0 HP without increasing Wounded."
    ]
  },
  {
    title: "Falling & Grab an Edge",
    bullets: [
      "Fall ≤ 5 ft: No damage. Fall > 5 ft: Bludgeoning damage = half distance fallen (max 750 at 1,500 ft). If you take damage, land Prone.",
      "Into Water/Snow: Reduce effective fall by 20 ft (or 30 ft with DC 20–30 Athletics/Acrobatics dive).",
      "Grab an Edge (Reaction): Reflex save vs Climb DC (Crit Succ: grab cleanly; Succ: grab, take half fall dmg if already fell; Crit Fail: +20 ft fall dmg)."
    ]
  },
  {
    title: "Movement, Flanking & Suffocation",
    bullets: [
      "Difficult Terrain: +5 ft per square. Greater Difficult Terrain: +10 ft. Cannot Step into difficult terrain.",
      "Flanking: Two allies on opposite sides/corners within melee reach → target is Off-Guard (-2 circ. AC) to both.",
      "Holding Breath: 5 + Con mod rounds (min 1); attacking/casting costs 1 extra round; crit hit loses 2 rounds. Out of air: Fort DC 20 (+1/round) or fall Unconscious & suffocate."
    ]
  }
];

/** Authoritative PF2e Remaster Conditions with crisp 1-line mechanics (clicks open live PF2e Condition sheet) */
export const PF2E_CONDITIONS = [
  { slug: "blinded", name: "Blinded", valued: false, summary: "All terrain is difficult; auto-fail sight checks; everything is Hidden (DC 11); immune to visual." },
  { slug: "broken", name: "Broken", valued: false, summary: "Item at ≤ half HP; cannot be used for normal function (armor gives -1/-2/-3 status AC penalty)." },
  { slug: "clumsy", name: "Clumsy X", valued: true, summary: "-X status penalty to Dex-based checks & DCs (AC, Reflex, ranged/finesse attacks, Acrob/Stealth/Thiev)." },
  { slug: "concealed", name: "Concealed", valued: false, summary: "Attackers must succeed at a DC 5 flat check to target you." },
  { slug: "confused", name: "Confused", valued: false, summary: "Off-Guard; cannot Delay/Ready/react; must use all actions to Strike/cast offensive cantrips at random targets. Flat DC 11 when damaged." },
  { slug: "controlled", name: "Controlled", valued: false, summary: "Controller dictates how you act on your turn." },
  { slug: "dazzled", name: "Dazzled", valued: false, summary: "If vision is your only precise sense, all creatures and objects are Concealed (Flat DC 5) from you." },
  { slug: "deafened", name: "Deafened", valued: false, summary: "-2 status to Perception for initiative/hearing; auto-fail auditory checks; Flat DC 5 for auditory actions; immune to auditory." },
  { slug: "doomed", name: "Doomed X", valued: true, summary: "Maximum Dying value before death reduced by X (normally 4 - X). Decreases by 1 per full night's rest." },
  { slug: "drained", name: "Drained X", valued: true, summary: "-X status to Con checks/Fort saves; lose X × Level current & max HP. Decreases by 1 per full night's rest." },
  { slug: "dying", name: "Dying X", valued: true, summary: "Unconscious at 0 HP. Start of turn: Recovery Flat DC 10 + X. Die at Dying 4 (reduced by Doomed)." },
  { slug: "encumbered", name: "Encumbered", valued: false, summary: "Clumsy 1 and -10 ft penalty to all Speeds (min 5 ft)." },
  { slug: "enfeebled", name: "Enfeebled X", valued: true, summary: "-X status penalty to Str-based rolls & DCs (melee attacks, melee damage, Athletics)." },
  { slug: "fascinated", name: "Fascinated", valued: false, summary: "-2 status to Perception & skill checks; cannot use Concentrate actions unless targeting subject. Ends on hostile action." },
  { slug: "fatigued", name: "Fatigued", valued: false, summary: "-1 status penalty to AC and saving throws; cannot use Exploration activities. Cleared by full night's rest." },
  { slug: "fleeing", name: "Fleeing", valued: false, summary: "Must spend each action escaping the source as expediently as possible; cannot Delay or Ready." },
  { slug: "frightened", name: "Frightened X", valued: true, summary: "-X status penalty to ALL checks and DCs (attacks, AC, saves, skills, spell DC). Drops by 1 at end of your turn." },
  { slug: "grabbed", name: "Grabbed", valued: false, summary: "Off-Guard and Immobilized; Manipulate actions require Flat DC 5 or are lost." },
  { slug: "hidden", name: "Hidden", valued: false, summary: "Space known, not seen. Target is Off-Guard to you; attacks against you require Flat DC 11." },
  { slug: "immobilized", name: "Immobilized", valued: false, summary: "Cannot use any action with the Move trait." },
  { slug: "invisible", name: "Invisible", valued: false, summary: "Undetected to sight (Hidden if they Seek/hear your square)." },
  { slug: "off-guard", name: "Off-Guard", valued: false, summary: "Remaster (formerly Flat-Footed): -2 circumstance penalty to AC." },
  { slug: "paralyzed", name: "Paralyzed", valued: false, summary: "Off-Guard; cannot act except Recall Knowledge and purely mental actions." },
  { slug: "petrified", name: "Petrified", valued: false, summary: "Turned to stone; cannot act, sense, or age; Hardness 8, same max HP." },
  { slug: "prone", name: "Prone", valued: false, summary: "Off-Guard and -2 circumstance penalty to attack rolls. Only Move actions allowed are Crawl & Stand (1A). Can Take Cover (+4 AC vs ranged)." },
  { slug: "quickened", name: "Quickened", valued: false, summary: "Gain 1 extra action at start of turn (usually restricted, e.g. Stride or Strike)." },
  { slug: "restrained", name: "Restrained", valued: false, summary: "Off-Guard and Immobilized; cannot use Attack or Manipulate actions except Escape or Force Open." },
  { slug: "sickened", name: "Sickened X", valued: true, summary: "-X status penalty to ALL checks and DCs; cannot willingly ingest anything. Retch (1A): Fort save vs source DC (-1 on Succ, -2 on Crit)." },
  { slug: "slowed", name: "Slowed X", valued: true, summary: "Regain X fewer actions at the start of your turn." },
  { slug: "stunned", name: "Stunned X", valued: true, summary: "Cannot act. Lose X total actions (or for duration); overrides Slowed (apply whichever loses more actions)." },
  { slug: "stupefied", name: "Stupefied X", valued: true, summary: "-X status to Int/Wis/Cha checks & DCs (Will, spell attacks/DCs); casting a spell requires Flat DC 5 + X or spell is disrupted." },
  { slug: "unconscious", name: "Unconscious", valued: false, summary: "Cannot act; -4 status to AC, Perception, Reflex; Blinded and Off-Guard; drop held items and fall Prone." },
  { slug: "undetected", name: "Undetected", valued: false, summary: "Location unknown; foes are Off-Guard to you and must guess your square + secret Flat DC 11." },
  { slug: "wounded", name: "Wounded X", valued: true, summary: "If you gain Dying, increase Dying by +X. Cleared by Treat Wounds or reaching full HP + 10 min rest." }
];

/** GM Core Table 2-6 & 2-7: Encounter Threat Budgets & Creature/Hazard XP */
export const ENCOUNTER_BUDGETS = [
  { key: "trivial", label: "Trivial", baseXp: 40, perPc: 10, cls: "sev-trivial" },
  { key: "low", label: "Low", baseXp: 60, perPc: 15, cls: "sev-low" },
  { key: "moderate", label: "Moderate", baseXp: 80, perPc: 20, cls: "sev-moderate" },
  { key: "severe", label: "Severe", baseXp: 120, perPc: 30, cls: "sev-severe" },
  { key: "extreme", label: "Extreme", baseXp: 160, perPc: 40, cls: "sev-extreme" }
];

export const CREATURE_XP_TABLE = [
  { offset: -4, label: "Party -4", creatureXp: 10, simpleHazardXp: 2, role: "Low-threat lackey" },
  { offset: -3, label: "Party -3", creatureXp: 15, simpleHazardXp: 3, role: "Low/Moderate lackey" },
  { offset: -2, label: "Party -2", creatureXp: 20, simpleHazardXp: 4, role: "Any lackey / standard" },
  { offset: -1, label: "Party -1", creatureXp: 30, simpleHazardXp: 6, role: "Standard foe" },
  { offset: 0, label: "Party +0", creatureXp: 40, simpleHazardXp: 8, role: "Standard / Low boss" },
  { offset: 1, label: "Party +1", creatureXp: 60, simpleHazardXp: 12, role: "Moderate/Low boss" },
  { offset: 2, label: "Party +2", creatureXp: 80, simpleHazardXp: 16, role: "Moderate/Severe boss" },
  { offset: 3, label: "Party +3", creatureXp: 120, simpleHazardXp: 24, role: "Severe/Extreme boss" },
  { offset: 4, label: "Party +4", creatureXp: 160, simpleHazardXp: 32, role: "Extreme solo boss" }
];

/** GM Core Table 2-9: Party Treasure by Level (4 PCs) */
export const TREASURE_BY_LEVEL = [
  { level: 1, total: "175 gp", permanent: "2×2nd, 2×1st", consumables: "2×2nd, 3×1st", currency: "40 gp", perExtraPc: "+10 gp, 1×2nd perm, 1×1st cons" },
  { level: 2, total: "300 gp", permanent: "2×3rd, 2×2nd", consumables: "2×3rd, 2×2nd, 2×1st", currency: "70 gp", perExtraPc: "+18 gp, 1×3rd perm, 1×2nd cons" },
  { level: 3, total: "500 gp", permanent: "2×4th, 2×3rd", consumables: "2×4th, 2×3rd, 2×2nd", currency: "120 gp", perExtraPc: "+30 gp, 1×4th perm, 1×3rd cons" },
  { level: 4, total: "850 gp", permanent: "2×5th, 2×4th", consumables: "2×5th, 2×4th, 2×3rd", currency: "200 gp", perExtraPc: "+50 gp, 1×5th perm, 1×4th cons" },
  { level: 5, total: "1,350 gp", permanent: "2×6th, 2×5th", consumables: "2×6th, 2×5th, 2×4th", currency: "320 gp", perExtraPc: "+80 gp, 1×6th perm, 1×5th cons" },
  { level: 6, total: "2,000 gp", permanent: "2×7th, 2×6th", consumables: "2×7th, 2×6th, 2×5th", currency: "500 gp", perExtraPc: "+125 gp, 1×7th perm, 1×6th cons" },
  { level: 7, total: "2,900 gp", permanent: "2×8th, 2×7th", consumables: "2×8th, 2×7th, 2×6th", currency: "720 gp", perExtraPc: "+180 gp, 1×8th perm, 1×7th cons" },
  { level: 8, total: "4,000 gp", permanent: "2×9th, 2×8th", consumables: "2×9th, 2×8th, 2×7th", currency: "1,000 gp", perExtraPc: "+250 gp, 1×9th perm, 1×8th cons" },
  { level: 9, total: "5,700 gp", permanent: "2×10th, 2×9th", consumables: "2×10th, 2×9th, 2×8th", currency: "1,400 gp", perExtraPc: "+350 gp, 1×10th perm, 1×9th cons" },
  { level: 10, total: "8,000 gp", permanent: "2×11th, 2×10th", consumables: "2×11th, 2×10th, 2×9th", currency: "2,000 gp", perExtraPc: "+500 gp, 1×11th perm, 1×10th cons" },
  { level: 11, total: "11,500 gp", permanent: "2×12th, 2×11th", consumables: "2×12th, 2×11th, 2×10th", currency: "2,800 gp", perExtraPc: "+700 gp, 1×12th perm, 1×11th cons" },
  { level: 12, total: "16,500 gp", permanent: "2×13th, 2×12th", consumables: "2×13th, 2×12th, 2×11th", currency: "4,000 gp", perExtraPc: "+1,000 gp, 1×13th perm, 1×12th cons" },
  { level: 13, total: "25,000 gp", permanent: "2×14th, 2×13th", consumables: "2×14th, 2×13th, 2×12th", currency: "6,000 gp", perExtraPc: "+1,500 gp, 1×14th perm, 1×13th cons" },
  { level: 14, total: "36,500 gp", permanent: "2×15th, 2×14th", consumables: "2×15th, 2×14th, 2×13th", currency: "9,000 gp", perExtraPc: "+2,250 gp, 1×15th perm, 1×14th cons" },
  { level: 15, total: "54,500 gp", permanent: "2×16th, 2×15th", consumables: "2×16th, 2×15th, 2×14th", currency: "13,000 gp", perExtraPc: "+3,250 gp, 1×16th perm, 1×15th cons" },
  { level: 16, total: "82,500 gp", permanent: "2×17th, 2×16th", consumables: "2×17th, 2×16th, 2×15th", currency: "20,000 gp", perExtraPc: "+5,000 gp, 1×17th perm, 1×16th cons" },
  { level: 17, total: "128,000 gp", permanent: "2×18th, 2×17th", consumables: "2×18th, 2×17th, 2×16th", currency: "30,000 gp", perExtraPc: "+7,500 gp, 1×18th perm, 1×17th cons" },
  { level: 18, total: "208,000 gp", permanent: "2×19th, 2×18th", consumables: "2×19th, 2×18th, 2×17th", currency: "48,000 gp", perExtraPc: "+12,000 gp, 1×19th perm, 1×18th cons" },
  { level: 19, total: "355,000 gp", permanent: "2×20th, 2×19th", consumables: "2×20th, 2×19th, 2×18th", currency: "80,000 gp", perExtraPc: "+20,000 gp, 1×20th perm, 1×19th cons" },
  { level: 20, total: "490,000 gp", permanent: "4×20th", consumables: "4×20th, 2×19th", currency: "140,000 gp", perExtraPc: "+35,000 gp, 1×20th perm, 1×20th cons" }
];

export const TRAVEL_SPEED_TABLE = [
  { speed: "15 ft", perMin: "150 ft", perHour: "1.5 mi", perDay: "12 mi" },
  { speed: "20 ft", perMin: "200 ft", perHour: "2 mi", perDay: "16 mi" },
  { speed: "25 ft", perMin: "250 ft", perHour: "2.5 mi", perDay: "20 mi" },
  { speed: "30 ft", perMin: "300 ft", perHour: "3 mi", perDay: "24 mi" },
  { speed: "35 ft", perMin: "350 ft", perHour: "3.5 mi", perDay: "28 mi" },
  { speed: "40 ft", perMin: "400 ft", perHour: "4 mi", perDay: "32 mi" }
];

export const ACCOMPLISHMENT_XP = [
  { type: "Minor Accomplishment", xp: "10 XP", note: "Clever roleplay, small discovery, minor sub-goal." },
  { type: "Moderate Accomplishment", xp: "30 XP", note: "Complete a side quest, solve a major mystery." },
  { type: "Major Accomplishment", xp: "80 XP", note: "Resolve a major chapter or story arc." }
];

/* ------------------------------------------------------------------------- */
/* PURE MATH HELPERS                                                         */
/* ------------------------------------------------------------------------- */

export function getLevelDc(level) {
  const clamped = Math.max(0, Math.min(25, Math.round(Number(level) || 0)));
  return DC_BY_LEVEL[clamped]?.dc ?? 15;
}

export function getSpellRankDc(rank) {
  const clamped = Math.max(1, Math.min(10, Math.round(Number(rank) || 1)));
  return SPELL_RANK_DCS[clamped - 1]?.dc ?? 15;
}

/**
 * Computes Counteract outcome thresholds and verdict for a given pair of ranks.
 */
export function evaluateCounteract(yourRank, targetRank) {
  const y = Math.max(1, Math.min(10, Math.round(Number(yourRank) || 1)));
  const t = Math.max(1, Math.min(10, Math.round(Number(targetRank) || 1)));

  const critMax = y + 3;
  const succMax = y + 1;
  const failMax = y - 1;

  let minDegreeNeeded = "Impossible (Target Rank too high)";
  let verdictClass = "is-fail";
  if (t <= failMax) {
    minDegreeNeeded = "Failure or better counteracts it!";
    verdictClass = "is-crit-succ";
  } else if (t <= succMax) {
    minDegreeNeeded = "Success or Crit Success counteracts it.";
    verdictClass = "is-succ";
  } else if (t <= critMax) {
    minDegreeNeeded = "Critical Success required to counteract.";
    verdictClass = "is-warn";
  }

  return {
    yourRank: y,
    targetRank: t,
    critMax,
    succMax,
    failMax: failMax >= 1 ? failMax : null,
    minDegreeNeeded,
    verdictClass,
    outcomes: [
      {
        degree: "Critical Success",
        cls: "is-crit-succ",
        rule: `Counteracts if Target Rank ≤ ${critMax}`,
        passes: t <= critMax
      },
      {
        degree: "Success",
        cls: "is-succ",
        rule: `Counteracts if Target Rank ≤ ${succMax}`,
        passes: t <= succMax
      },
      {
        degree: "Failure",
        cls: "is-fail",
        rule: failMax >= 1 ? `Counteracts if Target Rank ≤ ${failMax}` : "Cannot counteract (Your Rank is 1)",
        passes: t <= failMax
      },
      {
        degree: "Critical Failure",
        cls: "is-crit-fail",
        rule: "Always fails to counteract",
        passes: false
      }
    ]
  };
}

/**
 * Evaluates adjusted encounter XP budgets & current severity label for any party size.
 */
export function evaluateEncounterBudget(partySize, totalXp) {
  const pcs = Math.max(1, Math.min(10, Math.round(Number(partySize) || 4)));
  const xp = Math.max(0, Math.round(Number(totalXp) || 0));
  const delta = pcs - 4;

  const budgets = ENCOUNTER_BUDGETS.map(b => ({
    ...b,
    adjustedXp: Math.max(10, b.baseXp + delta * b.perPc)
  }));

  let severity = { label: "Empty", cls: "sev-none" };
  if (xp > 0) {
    if (xp < budgets[0].adjustedXp + Math.round((budgets[1].adjustedXp - budgets[0].adjustedXp) / 2)) {
      severity = { label: "Trivial", cls: "sev-trivial" };
    } else if (xp < budgets[1].adjustedXp + Math.round((budgets[2].adjustedXp - budgets[1].adjustedXp) / 2)) {
      severity = { label: "Low", cls: "sev-low" };
    } else if (xp < budgets[2].adjustedXp + Math.round((budgets[3].adjustedXp - budgets[2].adjustedXp) / 2)) {
      severity = { label: "Moderate", cls: "sev-moderate" };
    } else if (xp < budgets[3].adjustedXp + Math.round((budgets[4].adjustedXp - budgets[3].adjustedXp) / 2)) {
      severity = { label: "Severe", cls: "sev-severe" };
    } else {
      severity = { label: "Extreme", cls: "sev-extreme" };
    }
  }

  return { partySize: pcs, totalXp: xp, budgets, severity };
}
