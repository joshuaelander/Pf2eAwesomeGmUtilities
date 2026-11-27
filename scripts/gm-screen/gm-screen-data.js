/**
 * PF2e Awesome GM Utilities - PF2e Remaster Quick-Reference Data & Calculators
 *
 * Pure, self-contained Pathfinder 2e Remaster (Player Core / GM Core, plus Legacy GMG Drugs/Alcohol)
 * reference tables and niche rules for the Instant-Access GM Screen.
 * Zero Foundry mutations, zero external dependencies.
 */

/* ------------------------------------------------------------------------- */
/* 0. CUSTOMIZABLE CARD REGISTRY (SINGLE SOURCE OF TRUTH FOR SHOW / HIDE)    */
/* ------------------------------------------------------------------------- */

export const GM_SCREEN_TABS = [
  { id: "dcs", label: "DCs & Core", icon: "fa-solid fa-bullseye" },
  { id: "combat", label: "Combat & Tactics", icon: "fa-solid fa-swords" },
  { id: "afflictions", label: "Afflictions & Hazards", icon: "fa-solid fa-skull-crossbones" },
  { id: "subsystems", label: "Subsystems", icon: "fa-solid fa-diagram-project" },
  { id: "skills", label: "Skills & Downtime", icon: "fa-solid fa-coins" },
  { id: "conditions", label: "Conditions", icon: "fa-solid fa-biohazard" },
  { id: "encounters", label: "Encounters & Loot", icon: "fa-solid fa-dragon" }
];

export const GM_SCREEN_CARDS = [
  // Tab 1: DCs & Core
  { id: "dc-calculator", tab: "dcs", label: "Quick DC Calculator & Simple DCs" },
  { id: "dc-by-level", tab: "dcs", label: "DC by Level (0–25)" },
  { id: "counteract", tab: "dcs", label: "Counteract Calculator & Rules" },
  { id: "degrees-of-success", tab: "dcs", label: "Degrees of Success" },
  { id: "hero-points", tab: "dcs", label: "Hero Points" },
  { id: "flat-checks", tab: "dcs", label: "Key Flat Checks & Quick Reminders" },

  // Tab 2: Combat & Tactics
  { id: "combat-actions", tab: "combat", label: "Common Combat Actions" },
  { id: "cover", tab: "combat", label: "Cover" },
  { id: "detection", tab: "combat", label: "Concealment & Detection States" },
  { id: "stealth-sneaking", tab: "combat", label: "Stealth, Hide, Sneak & Seek" },
  { id: "invisibility", tab: "combat", label: "Invisibility Rules" },
  { id: "dying-recovery", tab: "combat", label: "Dying, Wounded & Recovery" },
  { id: "falling-terrain", tab: "combat", label: "Falling, Terrain & Suffocation" },
  { id: "mounted-combat", tab: "combat", label: "Mounted Combat" },
  { id: "flying-rules", tab: "combat", label: "Flying & Aerial Combat" },
  { id: "swimming-underwater", tab: "combat", label: "Swimming & Underwater Combat" },
  { id: "tactical-misc", tab: "combat", label: "Delay, Ready, Shield Block & Squeezing" },

  // Tab 3: Afflictions & Hazards
  { id: "afflictions-core", tab: "afflictions", label: "Afflictions Core Rules (Stages & Onset)" },
  { id: "poison-rules", tab: "afflictions", label: "Poison Rules" },
  { id: "disease-rules", tab: "afflictions", label: "Disease Rules" },
  { id: "curse-rules", tab: "afflictions", label: "Curse Rules" },
  { id: "drugs-alcohol", tab: "afflictions", label: "Drugs, Alcohol & Addiction" },
  { id: "hazards-haunts", tab: "afflictions", label: "Hazards & Haunts (Simple & Complex)" },

  // Tab 4: Subsystems (GM Core Chapter 4)
  { id: "subsystem-victory-points", tab: "subsystems", label: "Victory Points (Core Framework)" },
  { id: "subsystem-chases", tab: "subsystems", label: "Chases" },
  { id: "subsystem-influence", tab: "subsystems", label: "Influence (Social Encounters)" },
  { id: "subsystem-research", tab: "subsystems", label: "Research (Libraries & Archives)" },
  { id: "subsystem-infiltration", tab: "subsystems", label: "Infiltration (Heists)" },
  { id: "subsystem-reputation", tab: "subsystems", label: "Reputation (Factions & Standing)" },
  { id: "subsystem-duels", tab: "subsystems", label: "Duels (Martial & Spellcasting)" },
  { id: "subsystem-hexploration", tab: "subsystems", label: "Hexploration (Wilderness & Mapping)" },
  { id: "subsystem-vehicles", tab: "subsystems", label: "Vehicles & Piloting" },
  { id: "subsystem-leadership", tab: "subsystems", label: "Leadership & Organizations" },

  // Tab 5: Skills & Downtime
  { id: "earn-income", tab: "skills", label: "Earn Income (Per Day)" },
  { id: "treat-wounds", tab: "skills", label: "Treat Wounds & Repair" },
  { id: "recall-knowledge", tab: "skills", label: "Recall Knowledge (Remaster)" },
  { id: "spell-rank-dcs", tab: "skills", label: "Spell Rank DCs & Learn a Spell" },
  { id: "social-attitudes", tab: "skills", label: "NPC Attitudes & Social Checks" },
  { id: "downtime-niche", tab: "skills", label: "Crafting, Identify Magic & Retraining" },
  { id: "exploration-activities", tab: "skills", label: "Exploration Activities" },

  // Tab 6: Conditions
  { id: "conditions-list", tab: "conditions", label: "PF2e Remaster Conditions" },

  // Tab 7: Encounters & Loot
  { id: "encounter-builder", tab: "encounters", label: "Quick Encounter XP Calculator" },
  { id: "treasure-by-level", tab: "encounters", label: "Party Treasure by Level" },
  { id: "travel-speed", tab: "encounters", label: "Overland Travel Speed" },
  { id: "accomplishment-xp", tab: "encounters", label: "Accomplishment XP Awards" },
  { id: "light-vision", tab: "encounters", label: "Light, Vision & Senses" },
  { id: "objects-environment", tab: "encounters", label: "Object Hardness, Doors & Environment" }
];

/* ------------------------------------------------------------------------- */
/* 1. DCs, ADJUSTMENTS, DEGREES, HERO POINTS & FLAT CHECKS                   */
/* ------------------------------------------------------------------------- */

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
  { degree: "Success", cls: "is-succ", rule: "Meet or exceed DC (DC to DC+9). Ties always go to the roller." },
  { degree: "Failure", cls: "is-fail", rule: "Below DC (DC-1 to DC-9)." },
  { degree: "Critical Failure", cls: "is-crit-fail", rule: "Miss DC by 10+ (or Nat 1 downgrades degree by 1 step)." }
];

export const HERO_POINT_RULES = [
  { label: "Starting & Cap", text: "Each PC starts every session with 1 Hero Point (max 3; unspent points reset next session)." },
  { label: "Awarding", text: "Award ~1 Hero Point per hour of play for clever tactics, heroism, or great roleplay." },
  { label: "Reroll (1 Point)", text: "Spend 1 to reroll a check (Fortune effect; must use the 2nd result; cannot stack with other Fortune/Misfortune)." },
  { label: "Heroic Recovery (All)", text: "Spend ALL remaining Hero Points (min 1) when your Dying value would increase to stabilize at 0 HP without gaining Wounded." }
];

export const FLAT_CHECK_QUICK_RULES = [
  { dc: "DC 5", when: "Target Concealed; Manipulate while Grabbed; Auditory action while Deafened; Dazzled sight checks." },
  { dc: "DC 5 + X", when: "Cast a Spell while Stupefied X (spell is lost/disrupted on Failure)." },
  { dc: "DC 10 + X", when: "Recovery Check at start of turn while Dying X (Crit -2, Succ -1, Fail +1, Crit Fail +2)." },
  { dc: "DC 11", when: "Target Hidden or Undetected (secret if Undetected); end Confused when taking damage." },
  { dc: "DC 15", when: "End Persistent Damage at end of turn (drops to DC 10 with Assisted Recovery)." }
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

/* ------------------------------------------------------------------------- */
/* 2. COMBAT, STEALTH, INVISIBILITY, MOUNTED, FLYING & SWIMMING              */
/* ------------------------------------------------------------------------- */

export const COVER_RULES = [
  { type: "Lesser Cover", bonus: "+1 AC", notes: "Another creature in the way; cannot Take Cover or Hide." },
  { type: "Standard Cover", bonus: "+2 AC, Ref, Stealth", notes: "Low wall, corner, tree; Take Cover (1A) upgrades to Greater." },
  { type: "Greater Cover", bonus: "+4 AC, Ref, Stealth", notes: "Arrow slit, prone behind wall, or Take Cover from Standard." }
];

export const DETECTION_STATES = [
  { state: "Observed", flatDc: "—", notes: "Clearly seen with a precise sense; no penalty." },
  { state: "Concealed", flatDc: "DC 5", notes: "Dim light, fog, mist. Targeted effects require Flat DC 5." },
  { state: "Hidden", flatDc: "DC 11", notes: "Know square only (Invisible/Darkness). Off-Guard to it; Flat DC 11." },
  { state: "Undetected", flatDc: "DC 11*", notes: "Square unknown. Off-Guard to it; guess square + secret Flat DC 11." },
  { state: "Unnoticed", flatDc: "—", notes: "Completely unaware the creature is present at all." }
];

export const STEALTH_SNEAKING_RULES = [
  { label: "Hide (1A, Secret)", text: "Needs Standard/Greater Cover or Concealment. Stealth (+2/+4 cover) vs Perception DC → become Hidden (still in known square)." },
  { label: "Sneak (1A, Move, Secret)", text: "Must start Hidden/Undetected. Move up to ½ Speed; roll Stealth vs Perception DC at end (needs cover/concealment at destination)." },
  { label: "Sneak Outcomes", text: "Succ: Undetected throughout move. Fail: Hidden (known square). Crit Fail: Observed (stays Hidden if impossible to see, e.g. Invisible)." },
  { label: "Seek (1A, Conc., Secret)", text: "30-ft cone or 15-ft burst. Perception vs Stealth DC. Crit: Observed | Succ: Undetected → Hidden, Hidden → Observed." },
  { label: "Point Out (1A)", text: "Point out a creature you observe; it becomes Hidden (not Undetected) to allies who can see/hear you." },
  { label: "Breaking Stealth", text: "Any action other than Hide, Sneak, or Step makes you Observed — target stays Off-Guard for your triggering Strike." }
];

export const INVISIBILITY_RULES = [
  { label: "Detection Baseline", text: "Undetected to sight-only foes; Hidden if pinpointed by an imprecise sense (hearing/scent) or a successful Seek." },
  { label: "Combat Advantage", text: "Foes are Off-Guard (-2 AC) to you. Targeting you requires Flat DC 11 (or guessing your square + secret Flat DC 11 if Undetected)." },
  { label: "Moving Invisibly", text: "Normal Stride reveals your square via sound (Hidden). Use Sneak (½ Speed) to stay Undetected; Crit Fail downgrades to Fail (Hidden)." },
  { label: "Invisibility Spell", text: "Rank 2 ends right after a hostile action (target is still Off-Guard for that attack). Rank 4 lasts 1 min even while attacking." },
  { label: "Counters", text: "See the Unseen (makes Invisible foes Concealed DC 5), Revealing Light (Dazzled + Concealed instead of Invisible), tremorsense/echolocation." }
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

export const DYING_RECOVERY_RULES = [
  { label: "Drop to 0 HP", text: "Move initiative directly BEFORE the attacker. Gain Dying 1 (+Wounded), or Dying 2 (+Wounded) on a crit or crit-failed save." },
  { label: "Recovery Check", text: "Start of turn while Dying: Flat DC = 10 + Dying value. Crit Succ: -2 | Succ: -1 | Fail: +1 | Crit Fail: +2." },
  { label: "Death Threshold", text: "Die at Dying 4 (reduced by Doomed: 4 - Doomed). Taking damage while Dying adds +1 (+2 on crit)." },
  { label: "Stabilize & Wounded", text: "Losing Dying adds Wounded +1. Clear Wounded via Treat Wounds or reaching full HP + 10 min rest." }
];

export const FALLING_TERRAIN_RULES = [
  { label: "Falling Damage", text: "≤ 5 ft: 0 dmg. > 5 ft: bludgeoning dmg = ½ distance fallen (max 750 at 1,500 ft). If damaged, land Prone." },
  { label: "Water / Snow", text: "Reduce effective fall by 20 ft, or 30 ft if you intentionally dive in (capped at water/snow depth)." },
  { label: "Grab an Edge (R)", text: "Acrobatics or Reflex vs Climb DC. Crit: grab (even full hands), fall 30 ft shorter | Succ: grab (1 free hand), 20 ft shorter | Crit Fail: keep falling (+10 dmg/20 ft if fallen ≥ 20 ft)." },
  { label: "Terrain & Flanking", text: "Difficult Terrain: +5 ft/sq (Greater: +10 ft; no Step). Flanking opposite sides/corners in melee reach → Off-Guard (-2 AC)." },
  { label: "Holding Breath", text: "5 + Con mod rounds (min 1); attack/cast costs +1 rd, crit hit loses 2 rds. Out of air: auto-Unconscious & suffocate — Fort DC 20 (+5/rd): Fail 1d10 (+1d10/rd), Crit Fail death." }
];

export const MOUNTED_COMBAT_RULES = [
  { label: "Requirements & Turn", text: "Mount must be willing & ≥ 1 size larger. Acts on your initiative; spend Command an Animal (1A) for it to take 2 actions (auto-pass with Ride feat / Companion)." },
  { label: "Shared MAP", text: "You and your mount share a single Multiple Attack Penalty across both of your attacks." },
  { label: "Space & Reach", text: "You occupy all squares of your mount. On a Large/Huge mount: 5-ft or 10-ft reach hits adjacent squares; 15-ft reach hits within 10 ft (also for flanking)." },
  { label: "Targeting & Areas", text: "Attackers choose you or mount (any mount square counts for reach/range). Area effects hit both if spaces overlap." },
  { label: "Mount / Dismount (1A)", text: "Move trait. Dismount into any adjacent square; if a moving mount falls/dies, Reflex DC 20 or fall Prone." }
];

export const FLYING_RULES = [
  { label: "Must Fly Every Turn", text: "If airborne and you don't use a Fly action on your turn (even 0 ft to hover), you fall at the end of your turn!" },
  { label: "Upward & Downward", text: "Moving upward (straight or diagonal) is difficult terrain (10 ft per 5 ft). Moving straight down moves 10 ft per 5 ft spent." },
  { label: "No Step or Leap", text: "Ground movement actions like Step and Leap cannot be used while flying." },
  { label: "Maneuver in Flight (1A)", text: "Trained Acrobatics for tricky stunts: steep ascent (DC 15), fly vs wind / sharp turn (DC 20), fly in storm / reverse (DC 25–30)." },
  { label: "Arrest a Fall (Reaction)", text: "Requires Fly Speed. Acrobatics or Reflex DC 15 (higher in severe wind) to fall gently for 0 damage." }
];

export const SWIMMING_UNDERWATER_RULES = [
  { label: "Swim Action (1A)", text: "Athletics: calm DC 10, choppy DC 15, storm DC 20, raging DC 25–30 (Crit: 10 ft, Succ: 5 ft; +5 ft per 20 ft Speed). Swim Speed auto-moves & gives +4 circ. in rough water." },
  { label: "Underwater Off-Guard", text: "You are Off-Guard (-2 AC) underwater unless you have a Swim Speed." },
  { label: "Melee & Ranged", text: "Melee bludgeoning/slashing take -2 circ. penalty (piercing unaffected). Ranged bludgeoning/slashing auto-miss; piercing range increments halved." },
  { label: "Fire & Resistances", text: "Gain Resistance 5 to acid & fire. Cannot cast fire spells or use fire-trait actions underwater." },
  { label: "Walking on Bottom", text: "Sinking and walking along the bottom counts as greater difficult terrain (+10 ft per square)." }
];

export const TACTICAL_MISC_RULES = [
  { label: "Delay (Free, Start)", text: "Skip turn & re-enter after any creature (no reactions while delaying). Harmful start/end-of-turn effects trigger & buffs expire immediately; negative end-of-turn reductions (e.g. Frightened) wait until you act." },
  { label: "Ready (2A, Conc.)", text: "Prepare one 1A/free action with a trigger (spent as your Reaction; carries your turn's MAP!)." },
  { label: "Shield Block (R)", text: "Requires Raised Shield. Reduce physical damage by Hardness; both you and shield take remaining damage (Broken at ≤ ½ HP)." },
  { label: "Squeeze / Stand / Crawl", text: "Squeeze (Acrobatics): 5 ft/min (Crit: 10 ft). Stand (1A, Move; triggers reactions). Crawl (1A, 5 ft while Prone)." }
];

/* ------------------------------------------------------------------------- */
/* 3. AFFLICTIONS, POISONS, DISEASES, CURSES, DRUGS/ALCOHOL & HAZARDS        */
/* ------------------------------------------------------------------------- */

export const AFFLICTION_CORE_RULES = [
  { label: "Initial Save", text: "Crit Succ / Succ: unaffected. Fail: Stage 1. Crit Fail: Stage 2." },
  { label: "Onset Delay", text: "If an Onset is listed, wait that duration before applying Stage 1 (or Stage 2 on Crit Fail). No Onset = immediate!" },
  { label: "Interval Saves", text: "Roll a new save at the end of each stage's interval: Crit Succ: Stage -2 | Succ: Stage -1 (<1 = cured) | Fail: Stage +1 | Crit Fail: Stage +2." },
  { label: "Maximum Duration", text: "Ends automatically when max duration elapses (conditions tied directly to the affliction end with it)." },
  { label: "Virulent Trait", text: "Requires 2 consecutive successes to drop stage by 1 (Crit Success reduces stage by 1 only)." },
  { label: "Counteracting", text: "Affliction Counteract Rank = ⌈Level / 2⌉. Cleanse Affliction (Rank 2–4) treats or counteracts afflictions." }
];

export const POISON_RULES = [
  { label: "Pacing & Traits", text: "Usually fast intervals (rounds/minutes) with a Maximum Duration. Fortitude save unless noted." },
  { label: "Delivery Types", text: "Injury (needs piercing/slashing dmg), Contact (skin touch; has Onset), Ingested (eaten/drunk; has Onset), Inhaled (cloud; holding breath = +2 circ. Fort)." },
  { label: "Multiple Exposures", text: "STACKS! Failing a save against the same poison you already have increases stage by +1 (+2 on Crit Fail) immediately (doesn't extend max duration)." },
  { label: "Applying & Waste", text: "Usually 1–3 Interact actions. A Crit Fail Strike with an injury-poisoned weapon wastes the dose." },
  { label: "Treat Poison (1A, Med.)", text: "Medicine vs Poison DC: Succ gives +2 circ. (+4 on Crit) to target's next save; Crit Fail imposes -2 circ. penalty." }
];

export const DISEASE_RULES = [
  { label: "Pacing & Persistence", text: "Slow intervals (hours, days, or weeks) and usually no Maximum Duration — persists until cured by saves or magic." },
  { label: "Multiple Exposures", text: "DOES NOT STACK! Re-exposure to a disease you already suffer from normally has no extra effect." },
  { label: "Treat Disease (8h, Med.)", text: "Downtime Medicine vs Disease DC: Succ grants +2 circ. (+4 on Crit) to next save; Crit Fail imposes -2 circ. penalty." },
  { label: "Long-Term Rest & Magic", text: "24-hr bed rest doubles HP recovery & speeds condition recovery (disease save bonuses come from Treat Disease/feats). Cleanse Affliction (Rank 3+) counteracts diseases." }
];

export const CURSE_RULES = [
  { label: "Static vs Staged", text: "Magical afflictions (often Will or Fort save). Most apply a permanent static penalty until broken; severe curses may use Affliction stages." },
  { label: "Breaking a Curse", text: "Medicine and rest cannot cure curses. Requires fulfilling the curse's specific break condition, a tailored ritual, or Cleanse Affliction (Rank 4+)." },
  { label: "Cursed Items", text: "Cannot normally be discarded, unequipped, or uninvested until the curse is counteracted." },
  { label: "Counteract Rank", text: "Rank = ⌈Curse Level / 2⌉ (or spell rank if inflicted by a spell)." }
];

export const DRUGS_ALCOHOL_RULES = [
  { label: "Voluntary Failure", text: "A character can willingly fail their initial save against a drug/alcohol to gain its benefits (Legacy GMG guidelines)." },
  { label: "Addiction (Disease)", text: "Each drug dose triggers a Fort save vs Addiction (tracked per drug). Relapsing can jump straight to your prior highest addiction stage." },
  { label: "Alcohol Basics", text: "DC 12 Fort, Onset 10 min, 10 min/stage. Failing interval saves NEVER worsens stage — only drinking more advances it. Cannot Retch away Alcohol's Sickened!" }
];

export const ALCOHOL_STAGES = [
  { stage: "Stg 1", effect: "+1 item bonus to saves vs fear" },
  { stage: "Stg 2", effect: "Off-Guard, +1 item vs fear" },
  { stage: "Stg 3", effect: "Clumsy 1, Off-Guard, Stupefied 2" },
  { stage: "Stg 4", effect: "Clumsy 2, Sickened 2" },
  { stage: "Stg 5", effect: "Clumsy 2, Sickened 2, Stupefied 2" },
  { stage: "Stg 6–7", effect: "Stg 6: Unconscious (8 hr) · Stg 7: Death" }
];

export const HAZARDS_HAUNTS_RULES = [
  { label: "Simple vs Complex", text: "Simple: 1 reaction when triggered, resolved in Exploration Mode (⅕ creature XP). Complex: triggers reaction, rolls Initiative (Stealth mod), runs Routine each round (full creature XP)." },
  { label: "Detection & Stealth", text: "Secret Perception vs Stealth DC (Complex DC = 10 + Stealth mod). Min proficiency rank required for auto-detect; Searching grants checks; Detect Magic spots unranked magical hazards." },
  { label: "Disabling (2A)", text: "Must detect first. Traps: Thievery · Environmental: Survival/Nature · Haunts: Religion/Occultism · Magical: Dispel Magic. Crit Fail normally triggers it!" },
  { label: "Haunts", text: "Spiritual echoes bound to a site/object. Even if disabled or reduced to 0 HP, Haunts reset until their underlying unrest is resolved." },
  { label: "Breaking Traps", text: "Physical hazards use AC, Hardness, HP, and Broken Threshold (BT = ½ HP; usually stops functioning when Broken). Check immunities (crit, precision, mental)." }
];

/* ------------------------------------------------------------------------- */
/* 3.5. GM CORE SUBSYSTEMS (VICTORY POINTS, CHASES, INFLUENCE, RESEARCH...)  */
/* ------------------------------------------------------------------------- */

export const VICTORY_POINT_OUTCOMES = [
  { degree: "Critical Success", cls: "is-crit-succ", points: "+2 VP", note: "Major breakthrough or bonus momentum." },
  { degree: "Success", cls: "is-succ", points: "+1 VP", note: "Steady progress toward the current threshold." },
  { degree: "Failure", cls: "is-fail", points: "0 VP", note: "No progress (or +1 Awareness Point in Infiltrations)." },
  { degree: "Critical Failure", cls: "is-crit-fail", points: "-1 VP", note: "Setback (min 0 VP; or +2 Awareness Points / complication)." }
];

export const VICTORY_POINT_TIPS = [
  { label: "Setting Thresholds", text: "Scale to party size & rounds (e.g., 4 PCs over 3 rounds ≈ 6–8 VP Moderate, 9–12 VP Hard). Award XP by overall encounter threat." },
  { label: "DC Scaling", text: "Base on Party/Task Level DC; apply Easy (-2) for clever/ideal skills or Hard (+2) for risky or tangential approaches." },
  { label: "Time & Stakes", text: "Run in discrete rounds (1 round, 10 min, 1 hr, or 1 day) against a ticking clock, rival, or escalating complication track." }
];

export const SUBSYSTEM_CHASES_RULES = [
  { label: "Structure", text: "Linear or branching track of ~8–10 obstacles; pursued starts 1–2 obstacles ahead. Replaces raw Speed with cinematic turns." },
  { label: "Chase Points (CP)", text: "Each obstacle typically needs 1 CP per PC (e.g. 4 CP for 4 PCs) to clear. Crit Succ: +2 CP | Succ: +1 CP | Fail: 0 | Crit Fail: -1 CP." },
  { label: "Clearing Obstacles", text: "Excess CP are discarded once an obstacle is cleared — each PC gets 1 main check/action per chase round (skills, spells, or Aid)." },
  { label: "Split Paths & Costs", text: "Offer 2–3 skill options per obstacle (or creative spells/resources for auto-CP). Pursuers catch up on the same obstacle; pursued escapes after the final obstacle." }
];

export const SUBSYSTEM_INFLUENCE_RULES = [
  { label: "Social Rounds", text: "Run in timed rounds (e.g. 15–30 min at a gala or negotiation). Each PC takes 1 main action per round: Discover or Influence." },
  { label: "Discover (Secret)", text: "Perception or listed skill vs Discovery DC. Crit: learn 2 facts (lowest-DC skill, Weakness, Resistance, or personal Bias) | Succ: 1 fact | Crit Fail: false read." },
  { label: "Influence Check", text: "Roll a listed Influence skill vs that NPC's DC. Crit: +2 IP | Succ: +1 IP | Fail: 0 | Crit Fail: -1 IP (risk of offending NPC)." },
  { label: "Weaknesses & Biases", text: "Using an NPC's Weakness lowers DC by 1 step (-2 or -5); triggering a Resistance raises DC (+2) or imposes a penalty. Hit IP thresholds to win favors." }
];

export const SUBSYSTEM_RESEARCH_RULES = [
  { label: "Research Rounds", text: "Tracked in 10-min, 1-hr, or 1-day rounds under a deadline, rival scholars, or hazardous archive conditions." },
  { label: "Research Check", text: "Relevant Lore/Arcana/Occultism/Religion/Society vs Source DC. Crit: +2 RP | Succ: +1 RP | Fail: 0 | Crit Fail: -1 RP or complication." },
  { label: "Source Caps", text: "Each tome, archive wing, or witness has a Maximum RP cap — PCs must consult multiple sources to reach higher lore thresholds." },
  { label: "Thresholds & Events", text: "Reaching Research Point (RP) tiers unlocks progressive clues; missed deadlines or Crit Fails trigger guardians, curses, or rival advances." }
];

export const SUBSYSTEM_INFILTRATION_RULES = [
  { label: "Dual Tracks", text: "Earn Infiltration Points (IP) to clear obstacles (Crit +2 IP, Succ +1 IP) while keeping Awareness Points (AP) low (Fail +1 AP, Crit Fail +2 AP)." },
  { label: "Individual vs Group", text: "Individual obstacles require each PC to clear required IP; Group obstacles pool the party's IP together." },
  { label: "Awareness Escalation", text: "Every AP threshold (typically every 5 AP) triggers Complications (raised DCs, patrols, lockdowns); max AP (≈ 2× total IP) fails the heist." },
  { label: "Prep & Edge Points (EP)", text: "Downtime prep (scouting, bribes, forged papers) earns Edge Points. Spend 1 matching EP to turn a Failure or Crit Failure into a Success!" },
  { label: "Time Pressure", text: "GM may add +1 AP at the end of each infiltration round or when PCs take noisy/disruptive actions." }
];

export const SUBSYSTEM_REPUTATION_TIERS = [
  { tier: "Revered", range: "+30 to +50", raised: "Major favor", lowered: "Mod / Major" },
  { tier: "Admired", range: "+15 to +29", raised: "Major favor", lowered: "Any disservice" },
  { tier: "Liked", range: "+5 to +14", raised: "Mod / Major", lowered: "Any disservice" },
  { tier: "Ignored", range: "-4 to +4", raised: "Any favor", lowered: "Any disservice" },
  { tier: "Disliked", range: "-5 to -14", raised: "Any favor", lowered: "Mod / Major" },
  { tier: "Hated", range: "-15 to -29", raised: "Any favor", lowered: "Major disservice" },
  { tier: "Hunted", range: "-30 to -50", raised: "Mod / Major", lowered: "Major disservice" }
];

export const SUBSYSTEM_REPUTATION_NOTES = [
  { label: "Point Awards", text: "Minor favor/disservice: ±1 pt · Moderate: ±2 pts · Major: ±5+ pts. Attitudes range from Helpful (Revered) to Hostile/ambush on sight (Hunted)." }
];

export const SUBSYSTEM_DUELS_RULES = [
  { label: "Combat Duels", text: "Re-roll initiative every round (Deception, Intimidation, or Perception). Follow agreed terms; ends on First Blood, Submission, or Unconsciousness." },
  { label: "Spellcasting Duels", text: "Roll initiative once normally (Arcana, Nature, Occultism, or Religion). If Trained, your initiative skill sets your starting Tradition Focus." },
  { label: "Dueling Counter (R)", text: "When your foe Casts a Spell of your focused tradition, expend a prepared spell or spell slot and attempt a counteract check against it." },
  { label: "Change Focus & Mixed", text: "Spend 1A (Change Tradition Focus, Trained in matching skill) to shift traditions. Mixed duels re-roll initiative each round using combat or magic skills." }
];

export const SUBSYSTEM_HEXPLORATION_SPEEDS = [
  { speed: "≤ 10 ft", perDay: "½ / day" },
  { speed: "15–25 ft", perDay: "1 / day" },
  { speed: "30–40 ft", perDay: "2 / day" },
  { speed: "45–55 ft", perDay: "3 / day" },
  { speed: "60+ ft", perDay: "4 / day" }
];

export const SUBSYSTEM_HEXPLORATION_RULES = [
  { label: "12-Mile Hexes", text: "Daily activities depend on the slowest PC's Speed. Unused progress into a hex carries over to the next day." },
  { label: "Travel & Reconnoiter", text: "Open terrain: 1 activity · Difficult (forest/desert): 2 · Greater Difficult (swamp/mountain): 3. Roads reduce Travel cost by 1 step." },
  { label: "Map & Camp", text: "Reconnoiter finds hidden landmarks/hazards and lets PCs Map the Area (Survival) to avoid getting lost." },
  { label: "Forced March", text: "+1 Travel activity (Travel only that day). Safe for Con mod days (min 1); beyond that → Fatigued until a full rest day." }
];

export const SUBSYSTEM_VEHICLES_RULES = [
  { label: "Drive (1A / 2A / 3A)", text: "1A: Piloting check → move Speed (Fail: straight; Crit Fail: straight + Uncontrolled). 2A (Reckless): 2× Speed straight. 3A (Reckless, -5): 3× Speed straight." },
  { label: "Momentum Rule", text: "If a vehicle moved last round, the pilot MUST Drive or Stop on their turn — otherwise it keeps moving and becomes Uncontrolled!" },
  { label: "Take Control (1A)", text: "Adjacent to controls + Piloting check (Driving/Sailing/Piloting Lore or Nature) to take over or stabilize an Uncontrolled vehicle (max 1 move/round)." },
  { label: "Run Over (3A, Reckless)", text: "Move 2× Speed straight. Creatures ≥ 2 sizes smaller take Collision Dmg (basic Reflex vs Collision DC). Ramming a target 1 size smaller or larger deals Collision Dmg — if damaged, pilot & vehicle also take Collision Dmg (no save) and stop!" }
];

export const SUBSYSTEM_LEADERSHIP_RULES = [
  { label: "Followers & Lieutenants", text: "Organization scales Lv 1–20 (~2× followers per lower level, managed by Lieutenants). Noncombatant support — never free crafting, magic, or combat labor." },
  { label: "Base & Free Upkeep", text: "Requires a formal base of operations by ~Lv 6. Follower labor covers routine maintenance and expansions — PCs do NOT pay basic upkeep." },
  { label: "Leadership Events", text: "Inject periodic downtime events: Windfalls (uncommon access, clues, prestige), Opportunities (strategic/moral choices), and Troubles (crises needing PCs)." },
  { label: "Campaign Balance", text: "Keep Troubles smaller in cost than Windfalls so the organization stays a net-positive narrative asset without bogging down table pacing." }
];

/* ------------------------------------------------------------------------- */
/* 4. SKILLS, DOWNTIME, RECALL KNOWLEDGE, SOCIAL & EXPLORATION               */
/* ------------------------------------------------------------------------- */

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

export const SOCIAL_ATTITUDE_RULES = [
  { label: "5 NPC Attitudes", text: "Helpful → Friendly → Indifferent → Unfriendly → Hostile." },
  { label: "Make an Impression", text: "1 min conversation, Diplomacy vs Will DC. Crit Succ: +2 steps | Succ: +1 step | Crit Fail: -1 step (for current encounter)." },
  { label: "Request (1A)", text: "Diplomacy vs Will DC (Friendly/Helpful only). Crit: agrees cleanly | Succ: agrees with caveats | Crit Fail: refuses & drops 1 step." },
  { label: "Coerce (1+ min)", text: "Intimidation vs Will DC. Compels cooperation briefly, then target shifts to Unfriendly afterward!" },
  { label: "Lie (Deception)", text: "Secret Deception vs Perception DC (Sense Motive). Failed Lies usually prevent retrying the same lie." }
];

export const DOWNTIME_NICHE_RULES = [
  { label: "Craft (Remaster)", text: "Setup = 2 days (1 day if you have the formula). Pay ½ price upfront, roll Crafting vs Item Lv DC. Finish by paying remaining ½ OR work extra days using Earn Income." },
  { label: "Identify Magic (10 min)", text: "Secret Arcana/Nature/Occultism/Religion vs Item/Spell Lv DC. Crit: full properties & curse hints. Fail: cannot retry for 1 day." },
  { label: "Retraining", text: "Feat / Skill / Swappable choice = 1 week of Downtime; major class feature (e.g. subclass) = 1 month (with teacher/tools as needed)." },
  { label: "Subsist (Downtime)", text: "Society or Survival vs area DC. Succ: free modest living; Fail: Fatigued until fed; Crit Fail: -2 to Subsist for 1 week & starving risk." }
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

/* ------------------------------------------------------------------------- */
/* 5. CONDITIONS (CLICK OPENS LIVE PF2e COMPENDIUM SHEET)                    */
/* ------------------------------------------------------------------------- */

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

/* ------------------------------------------------------------------------- */
/* 6. ENCOUNTERS, TREASURE, TRAVEL, LIGHT & ENVIRONMENT                      */
/* ------------------------------------------------------------------------- */

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

export const LIGHT_VISION_RULES = [
  { label: "Bright Light", text: "Normal vision sees clearly. Torch = 20 ft bright + 20 ft dim; Lantern = 30 ft bright + 30 ft dim." },
  { label: "Dim Light", text: "Everything is Concealed (Flat DC 5) to normal vision. Ignored by Low-Light Vision and Darkvision." },
  { label: "Darkness", text: "Creatures without Darkvision are Blinded (all targets Hidden DC 11, all terrain difficult)." },
  { label: "Sense Tiers", text: "Precise (vision) → Observed | Imprecise (hearing, scent, tremorsense) → max Hidden (DC 11) | Vague (smell) → Undetected only." }
];

export const OBJECTS_ENVIRONMENT_RULES = [
  { label: "Hardness / HP (BT)", text: "Thin Wood 3 / 12 (6) · Wood 5 / 20 (10) · Stone 7 / 28 (14) · Iron/Steel 9 / 36 (18) · Reinforced Door 10 / 40 (20)." },
  { label: "Force Open (1A, Athl.)", text: "Simple door DC 15 · Sturdy/locked door DC 20–25 · Barred/iron/stone door DC 30+." },
  { label: "Temperature Effects", text: "Severe Cold/Heat: Fatigued after 4 hr + minor dmg/hr. Extreme: Fatigued after 4 hr + minor dmg/10 min. Incredible: Fatigued after 2 hr + moderate dmg/min." },
  { label: "Bulk & Encumbrance", text: "Encumbered above 5 + Str mod Bulk (Clumsy 1, -10 ft Speed). Max carry = 10 + Str mod Bulk. 10 Light = 1 Bulk." }
];

/* ------------------------------------------------------------------------- */
/* 7. PURE MATH HELPERS                                                      */
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
