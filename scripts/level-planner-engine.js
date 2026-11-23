/**
 * PF2e Awesome GM Utilities - Level 1-20 Build Planner & Guided Level-Up Engine
 *
 * Lightweight, zero-hardcoded-data PF2e build roadmap and guided level-up executor:
 *  - Opt-in World setting (`enableLevelPlanner`, default OFF -> zero overhead when disabled)
 *  - Reads Level 1-20 slot schedules & Class Features directly from the actor's live Class item(s)
 *    (supports Primary Class, Dual Class via PF2e Awesome Variant Rules, Free Archetype,
 *     Ancestry Paragon, Gradual Ability Boosts, and homebrew classes/feats/spells!)
 *  - Stores future build plans lightly in `actor.flags[MODULE_ID].levelPlan` (UUID references only)
 *  - Projects Attribute Modifiers (exact PF2e partial-boost math) and Skill Ranks (U/T/E/M/L)
 *    across Levels 1-20 with soft prerequisite validation
 *  - Executes guided 1-click Level Up (Lv N -> N+1) natively on the actor, letting PF2e's own
 *    Rule Elements, ChoiceSets, Dual Class sync, and Spellcasting slot sync run cleanly.
 */

import { MODULE_ID } from "./constants.js";
import {
  ABILITY_LABELS,
  CORE_SKILL_SLUGS,
  TRADITION_LABELS,
  analyzeCharacter,
  createOrSyncAllSpellcastingEntries,
  formatSlotsSummary,
  getActiveVariantRules,
  getActorDualClassInfo,
  normalizeSlug
} from "./character-checker-engine.js";

const PLAN_FLAG_KEY = "levelPlan";
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const RANK_SHORT = ["U", "T", "E", "M", "L"];
const RANK_FULL = ["Untrained", "Trained", "Expert", "Master", "Legendary"];

/** Gradual Ability Boosts 4-level sets (no duplicate attribute within the same set) */
const GRADUAL_BOOST_SETS = [
  [2, 3, 4, 5],
  [7, 8, 9, 10],
  [12, 13, 14, 15],
  [17, 18, 19, 20]
];

/** Lazy in-memory compendium index cache (populated ONLY on first Quick Pick click) */
let _featIndexCache = null;
let _spellIndexCache = null;

/* ------------------------------------------------------------------------- */
/* 1. OPT-IN SETTING & PLAN FLAG ACCESSORS                                   */
/* ------------------------------------------------------------------------- */

export function isLevelPlannerEnabled() {
  try {
    if (!game?.settings?.settings?.has?.(`${MODULE_ID}.enableLevelPlanner`)) return false;
    return Boolean(game.settings.get(MODULE_ID, "enableLevelPlanner"));
  } catch {
    return false;
  }
}

export function getActorLevelPlan(actor) {
  if (!actor || actor.type !== "character") return { version: 1, levels: {} };
  const raw = actor.getFlag?.(MODULE_ID, PLAN_FLAG_KEY);
  if (!raw || typeof raw !== "object") return { version: 1, levels: {} };
  return {
    version: raw.version || 1,
    levels: raw.levels && typeof raw.levels === "object" ? foundry.utils.deepClone(raw.levels) : {}
  };
}

export async function saveActorLevelPlan(actor, plan) {
  if (!actor || actor.type !== "character") return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  const clean = {
    version: 1,
    levels: plan?.levels && typeof plan.levels === "object" ? plan.levels : {}
  };
  await actor.setFlag(MODULE_ID, PLAN_FLAG_KEY, clean);
  return true;
}

export async function updatePlannedLevelData(actor, levelNum, mutatorFn) {
  const plan = getActorLevelPlan(actor);
  const key = String(levelNum);
  if (!plan.levels[key] || typeof plan.levels[key] !== "object") {
    plan.levels[key] = { boosts: [], skillIncrease: null, feats: {}, spells: [] };
  }
  const entry = plan.levels[key];
  if (!Array.isArray(entry.boosts)) entry.boosts = [];
  if (!entry.feats || typeof entry.feats !== "object") entry.feats = {};
  if (!Array.isArray(entry.spells)) entry.spells = [];

  mutatorFn(entry, plan);
  return await saveActorLevelPlan(actor, plan);
}

export async function clearActorLevelPlan(actor) {
  if (!actor || actor.type !== "character") return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  await actor.unsetFlag(MODULE_ID, PLAN_FLAG_KEY);
  return true;
}

/* ------------------------------------------------------------------------- */
/* 2. HELPERS FOR SCHEDULES, BOOST MATH & PREREQUISITE SOFT-CHECKS           */
/* ------------------------------------------------------------------------- */

function extractLevelArray(field, fallback = []) {
  const raw = Array.isArray(field) ? field : (Array.isArray(field?.value) ? field.value : []);
  const parsed = raw.map(v => Number(v)).filter(n => Number.isFinite(n) && n >= 1 && n <= 20);
  if (parsed.length === 0) return [...fallback];
  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

function unionLevels(...arrays) {
  const set = new Set();
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 20) set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Safely converts an Array, Set, iterable, or `{ value: Array|Set }` into a plain Array.
 * Critical because PF2e's CompendiumBrowser `indexData` stores `traits` and `traditions` as Sets!
 */
function toStringArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw instanceof Set) return Array.from(raw);
  if (typeof raw !== "string" && typeof raw[Symbol.iterator] === "function") {
    return Array.from(raw);
  }
  if (typeof raw === "object" && raw.value) {
    return toStringArray(raw.value);
  }
  return [];
}

/** Generic creature/rarity traits that should NOT be used as ancestry/class feat filters */
const GENERIC_NON_ANCESTRY_TRAITS = new Set([
  "humanoid", "undead", "construct", "fey", "plant", "fungus", "beast",
  "dragon", "elemental", "fiend", "celestial", "monitor", "aberration",
  "astral", "ethereal", "spirit", "amphibious", "aquatic", "incorporeal",
  "mindless", "common", "uncommon", "rare", "unique"
]);

/**
 * Extracts authoritative ancestry & versatile-heritage feat traits for an actor:
 *  1. PF2e's own native `ancestry` / `ancestryparagon` FeatGroup `featFilter`
 *     (automatically handles Remaster slugs, Versatile Heritages, and Adopted Ancestry!)
 *  2. Live `actor.ancestry` traits & slug
 *  3. Live `actor.heritage` traits (and slug only when it is a Versatile Heritage)
 */
function extractActorAncestryTraits(actor) {
  const traits = new Set();

  for (const groupId of ["ancestry", "ancestryparagon"]) {
    const ff = actor?.feats?.get?.(groupId)?.featFilter;
    if (Array.isArray(ff)) {
      for (const token of ff) {
        if (typeof token === "string" && token.startsWith("traits-")) {
          const slug = normalizeSlug(token.slice("traits-".length));
          if (slug && !GENERIC_NON_ANCESTRY_TRAITS.has(slug)) traits.add(slug);
        }
      }
    }
  }

  if (actor?.ancestry) {
    for (const t of toStringArray(actor.ancestry.system?.traits?.value)) {
      const slug = normalizeSlug(t);
      if (slug && !GENERIC_NON_ANCESTRY_TRAITS.has(slug)) traits.add(slug);
    }
    const ancSlug = normalizeSlug(actor.ancestry.slug || actor.ancestry.system?.slug || actor.ancestry.name);
    if (ancSlug && !GENERIC_NON_ANCESTRY_TRAITS.has(ancSlug)) traits.add(ancSlug);
  }

  if (actor?.heritage) {
    for (const t of toStringArray(actor.heritage.system?.traits?.value)) {
      const slug = normalizeSlug(t);
      if (slug && !GENERIC_NON_ANCESTRY_TRAITS.has(slug)) traits.add(slug);
    }
    // Only include heritage slug itself if it's a versatile heritage (no parent ancestry bound),
    // preventing non-trait sub-heritages like "whisper-elf" from breaking Compendium Browser trait filters.
    const isVersatile = !actor.heritage.system?.ancestry;
    if (isVersatile) {
      const herSlug = normalizeSlug(actor.heritage.slug || actor.heritage.system?.slug || actor.heritage.name);
      if (herSlug && !GENERIC_NON_ANCESTRY_TRAITS.has(herSlug)) traits.add(herSlug);
    }
  }

  return Array.from(traits);
}

function makeDedicationDescriptor(name, slug = "") {
  const cleanName = String(name || "").trim();
  const shortLabel = cleanName.replace(/\s+Dedication$/i, "").trim() || cleanName;
  return {
    name: cleanName,
    nameLower: cleanName.toLowerCase(),
    shortLabel,
    shortSlug: normalizeSlug(shortLabel),
    slug: normalizeSlug(slug || cleanName)
  };
}

/**
 * Computes the set of Feat UUIDs belonging to one or more Archetype Dedications
 * using an iterative prerequisite closure (so chained follow-ups like
 * Basic -> Expert -> Master Spellcasting or Mature -> Incredible -> Specialized Companion
 * are all included automatically, while unrelated archetypes are excluded!).
 *
 * @param {Array<object>} allFeats - Lightweight feat index array
 * @param {Array<object>} dedications - Dedication descriptors from `slot.dedications`
 * @returns {Set<string>}
 */
export function computeMatchingArchetypeFeatUuids(allFeats, dedications = []) {
  const matchedUuids = new Set();
  if (!Array.isArray(allFeats) || !Array.isArray(dedications) || dedications.length === 0) {
    return matchedUuids;
  }

  const seedNames = new Set();
  const shortSlugs = new Set();
  for (const d of dedications) {
    if (d?.nameLower && d.nameLower.length >= 5) seedNames.add(d.nameLower);
    if (d?.shortSlug && d.shortSlug.length >= 3) shortSlugs.add(d.shortSlug);
  }

  const archetypeFeats = allFeats.filter(f =>
    f.traits.includes("archetype")
    && !f.traits.includes("dedication")
    && f.category !== "classfeature"
    && f.category !== "ancestryfeature"
  );

  const prereqMatches = (prereqs, nameSet) => {
    for (const rawP of prereqs || []) {
      const p = String(rawP || "").toLowerCase().trim();
      if (!p) continue;
      if (nameSet.has(p)) return true;
      for (const known of nameSet) {
        if (known.length >= 5 && p.includes(known)) return true;
      }
    }
    return false;
  };

  for (let pass = 0; pass < 4; pass++) {
    let addedAny = false;
    for (const f of archetypeFeats) {
      if (matchedUuids.has(f.uuid)) continue;
      const matchesPrereq = prereqMatches(f.prerequisites, seedNames);
      const matchesTrait = pass === 0 && f.traits.some(t => shortSlugs.has(t));
      if (matchesPrereq || matchesTrait) {
        matchedUuids.add(f.uuid);
        const fLower = String(f.name || "").toLowerCase().trim();
        if (fLower.length >= 5) seedNames.add(fLower);
        addedAny = true;
      }
    }
    if (!addedAny) break;
  }

  return matchedUuids;
}
function extractActorClassTraits(actor, groupId, fallbackSlug) {
  const traits = new Set();
  const ff = actor?.feats?.get?.(groupId)?.featFilter;
  if (Array.isArray(ff)) {
    for (const token of ff) {
      if (typeof token === "string" && token.startsWith("traits-")) {
        const slug = normalizeSlug(token.slice("traits-".length));
        if (slug && !GENERIC_NON_ANCESTRY_TRAITS.has(slug)) traits.add(slug);
      }
    }
  }
  if (fallbackSlug) traits.add(normalizeSlug(fallbackSlug));
  return Array.from(traits).filter(Boolean);
}

/**
 * Exact PF2e attribute modifier & partial-boost math from total boost count.
 */
function computeModFromBoostCount(totalBoosts) {
  if (totalBoosts <= 4) {
    return { mod: totalBoosts, partial: false };
  }
  const aboveFour = totalBoosts - 4;
  return {
    mod: 4 + Math.floor(aboveFour / 2),
    partial: (aboveFour % 2) === 1
  };
}

/**
 * Reconstructs current raw boost count per attribute up to `actor.level` so future
 * planned boosts project exact PF2e partial-boost modifiers accurately.
 */
function getBaseBoostCounts(actor, currentLevel, dualInfo) {
  const buildAttrs = actor.system?.build?.attributes;
  const counts = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

  if (!buildAttrs || buildAttrs.manual || !buildAttrs.boosts) {
    // Fallback from current live modifiers
    for (const a of ABILITY_KEYS) {
      const m = Number(actor.system?.abilities?.[a]?.mod ?? 0);
      counts[a] = m <= 4 ? m : 4 + ((m - 4) * 2);
    }
    return counts;
  }

  const boosts = buildAttrs.boosts;
  const flaws = buildAttrs.flaws || {};

  const addList = (arr, delta = 1) => {
    if (typeof arr === "string" && ABILITY_KEYS.includes(arr)) {
      counts[arr] += delta;
    } else if (Array.isArray(arr)) {
      for (const a of arr) {
        if (ABILITY_KEYS.includes(a)) counts[a] += delta;
      }
    }
  };

  addList(boosts.ancestry, 1);
  addList(flaws.ancestry, -1);
  addList(flaws.voluntary, -1);
  addList(boosts.background, 1);
  addList(boosts.class, 1);

  // Include Dual Class effective key boost if active
  const dualBoostAttr = dualInfo?.summary?.keyAbility?.effectiveBoostAttribute;
  if (dualBoostAttr && ABILITY_KEYS.includes(dualBoostAttr)) {
    counts[dualBoostAttr] += 1;
  }

  for (let lvl = 1; lvl <= currentLevel; lvl++) {
    addList(boosts[lvl], 1);
  }

  return counts;
}

/**
 * Returns the maximum PF2e skill rank legally allowed via Skill Increases at `level`.
 * (Lv 1-2: Trained=1, Lv 3-6: Expert=2, Lv 7-14: Master=3, Lv 15-20: Legendary=4)
 */
export function maxSkillRankForLevel(level) {
  if (level >= 15) return 4;
  if (level >= 7) return 3;
  if (level >= 3) return 2;
  return 1;
}

/**
 * Soft-checks a planned feat's level & text prerequisites against the character's
 * projected state at `slotLevel` (never blocks picking; returns friendly warning strings).
 */
function checkPlannedFeatPrereqs(plannedFeat, slotLevel, projectedSkillRanks, knownFeatNamesLower) {
  const warnings = [];
  if (!plannedFeat) return warnings;

  const featLvl = Number(plannedFeat.level ?? 0);
  if (featLvl > slotLevel) {
    warnings.push(`Feat level ${featLvl} exceeds Level ${slotLevel} slot`);
  }

  const prereqs = Array.isArray(plannedFeat.prerequisites) ? plannedFeat.prerequisites : [];
  const rankWordMap = { trained: 1, expert: 2, master: 3, legendary: 4 };

  for (const rawP of prereqs) {
    const pText = typeof rawP === "string" ? rawP : (rawP?.value || "");
    if (!pText) continue;
    const pLower = pText.toLowerCase().trim();

    // Check skill rank prerequisites like "expert in Athletics" or "master in Stealth"
    const skillMatch = pLower.match(/\b(trained|expert|master|legendary)\s+in\s+([a-z]+)/i);
    if (skillMatch) {
      const reqRank = rankWordMap[skillMatch[1].toLowerCase()] || 0;
      const skillName = skillMatch[2].toLowerCase();
      if (CORE_SKILL_SLUGS.includes(skillName)) {
        const projRank = Number(projectedSkillRanks[skillName] ?? 0);
        if (projRank < reqRank) {
          warnings.push(`Requires ${capitalize(skillMatch[1])} in ${capitalize(skillName)} (projected: ${RANK_FULL[projRank]})`);
        }
      }
      continue;
    }

    // Check dedication/feat-name prereq (only flag if it looks clearly like a single feat name containing Dedication)
    if (pLower.includes("dedication") && !knownFeatNamesLower.has(pLower)) {
      const foundPartial = Array.from(knownFeatNamesLower).some(n => n.includes(pLower) || pLower.includes(n));
      if (!foundPartial) {
        warnings.push(`Requires ${pText}`);
      }
    }
  }

  return warnings;
}

/**
 * Computes which spell ranks unlock or gain extra slots at a specific future level `lvl`
 * based on the actor's active spellcasting sources (Primary Class, Dual Class, Free Archetype).
 */
function computeSpellMilestonesByLevel(actor, currentLevel, dualInfo, baseReport) {
  const byLevel = {};
  const sources = baseReport?.spellcasting?.sources || [];
  if (sources.length === 0) return byLevel;

  // Determine highest rank & slot note for each non-focus casting source at level L
  const getSlotsAtLevel = (src, lvl) => {
    const slots = {};
    if (src.isFocus || src.castingType === "focus") {
      return { isFocus: true, focusRank: Math.min(10, Math.ceil(lvl / 2)) };
    }
    if (src.isDivineFont) {
      const r = Math.min(10, Math.ceil(lvl / 2));
      slots[r] = lvl >= 19 ? 6 : (lvl >= 15 ? 5 : 4);
      return { slots, maxRank: r };
    }
    if (src.sourceKind === "archetype") {
      // Standard Basic (4/6/8), Expert (12/14/16), Master (18/20)
      if (lvl >= 4) slots[1] = 1;
      if (lvl >= 6) slots[2] = 1;
      if (lvl >= 8) slots[3] = 1;
      if (lvl >= 12) slots[4] = 1;
      if (lvl >= 14) slots[5] = 1;
      if (lvl >= 16) slots[6] = 1;
      if (lvl >= 18) slots[7] = 1;
      if (lvl >= 20) slots[8] = 1;
      let maxRank = 0;
      for (let r = 8; r >= 1; r--) {
        if (slots[r] > 0) { maxRank = r; break; }
      }
      return { slots, maxRank };
    }

    // Class full caster (2, 3, or 4 slots per rank; Magus/Summoner cap at 9th)
    const slug = src.classSlug || "";
    const maxPerRank = (slug === "sorcerer" || slug === "oracle")
      ? 4
      : ((slug === "psychic" || slug === "magus" || slug === "summoner" || slug === "necromancer" || (slug === "animist" && src.castingType === "prepared"))
        ? 2
        : (slug === "animist" && src.castingType === "spontaneous" ? 1 : 3));
    const includeTenth = slug !== "magus" && slug !== "summoner" && !(slug === "animist" && src.castingType === "spontaneous");
    let maxRank = 0;
    for (let r = 1; r <= 9; r++) {
      const unlock = r * 2 - 1;
      if (lvl < unlock) slots[r] = 0;
      else if (maxPerRank === 1) slots[r] = 1;
      else slots[r] = lvl === unlock ? Math.max(1, maxPerRank - 1) : maxPerRank;
      if (slots[r] > 0) maxRank = r;
    }
    if (includeTenth && lvl >= 19) {
      slots[10] = 1;
      maxRank = 10;
    }
    return { slots, maxRank };
  };

  for (let lvl = 1; lvl <= 20; lvl++) {
    const notes = [];
    for (const src of sources) {
      if (src.isDivineFont) continue;
      if (src.isFocus) continue; // Focus spells auto-heighten every odd level automatically
      const cur = getSlotsAtLevel(src, lvl);
      const prev = lvl > 1 ? getSlotsAtLevel(src, lvl - 1) : { slots: {}, maxRank: 0 };

      const gained = [];
      let unlockedNewRank = 0;
      for (let r = 1; r <= 10; r++) {
        const diff = (cur.slots[r] || 0) - (prev.slots[r] || 0);
        if (diff > 0) {
          gained.push(`+${diff} Rank ${r}`);
          if ((prev.slots[r] || 0) === 0) unlockedNewRank = Math.max(unlockedNewRank, r);
        }
      }
      if (gained.length > 0) {
        notes.push({
          entryKey: src.key,
          entryId: src.entryId || null,
          title: src.title,
          tradition: src.tradition || "",
          traditionLabel: TRADITION_LABELS[src.tradition] || "Any",
          castingType: src.castingType,
          maxRank: cur.maxRank || 1,
          unlockedNewRank,
          deltaText: gained.join(", "),
          fullSlotsText: formatSlotsSummary(cur.slots)
        });
      }
    }
    if (notes.length > 0) {
      byLevel[lvl] = notes;
    }
  }

  return byLevel;
}

/* ------------------------------------------------------------------------- */
/* 3. MASTER LEVEL 1-20 ROADMAP BUILDER                                      */
/* ------------------------------------------------------------------------- */

/**
 * Builds the complete Level 1–20 Build Roadmap for a character actor, combining:
 *  - Live sheet data for Levels 1..actor.level
 *  - Planned flag data + projected Attributes & Skills for Levels (actor.level+1)..20
 *  - Auto-read Class Features (Primary + Dual Class) across all 20 levels
 *  - Active variant rules (Dual Class, Free Archetype, Ancestry Paragon, Gradual Boosts)
 *
 * @param {Actor} actor
 * @returns {object|null}
 */
export function buildLevelRoadmap(actor) {
  if (!actor || actor.type !== "character") return null;

  const currentLevel = Math.max(1, Math.min(20, Number(actor.level ?? actor.system?.details?.level?.value ?? 1)));
  const variants = getActiveVariantRules();
  const dualInfo = getActorDualClassInfo(actor);
  const plan = getActorLevelPlan(actor);
  const checkerReport = analyzeCharacter(actor);

  const pClass = actor.class;
  const pSys = pClass?.system || {};
  const dSys = dualInfo?.system || null;
  const primaryName = pClass?.name || "Primary Class";
  const primarySlug = pClass ? normalizeSlug(pClass.slug || pClass.system?.slug || pClass.name) : "";
  const dualName = dualInfo?.name || "";
  const dualSlug = dualInfo?.slug || "";
  const actorAncestryTraits = extractActorAncestryTraits(actor);
  const actorPrimaryClassTraits = extractActorClassTraits(actor, "class", primarySlug);
  const actorDualClassTraits = dualSlug ? extractActorClassTraits(actor, "dualclass", dualSlug) : [];

  // 1. Exact Level 1-20 Slot Schedules read directly from live Class item(s)
  const ancestryLevels = unionLevels(
    extractLevelArray(pSys.ancestryFeatLevels, [1, 5, 9, 13, 17]),
    dSys ? extractLevelArray(dSys.ancestryFeatLevels, []) : []
  );

  // Ancestry Paragon bonus levels (extra Lv 1 + non-overlapping odd levels)
  const ancestrySet = new Set(ancestryLevels);
  const ancestryParagonLevels = variants.ancestryParagonEnabled
    ? [1, ...[3, 5, 7, 9, 11, 13, 15, 17, 19].filter(l => !ancestrySet.has(l))]
    : [];

  const classFeatLevels = extractLevelArray(pSys.classFeatLevels, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  const dualClassFeatLevels = dSys
    ? extractLevelArray(dSys.classFeatLevels, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
    : [];
  const freeArchetypeLevels = variants.freeArchetypeEnabled
    ? [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    : [];
  const skillFeatLevels = unionLevels(
    extractLevelArray(pSys.skillFeatLevels, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]),
    dSys ? extractLevelArray(dSys.skillFeatLevels, []) : []
  );
  const generalFeatLevels = unionLevels(
    extractLevelArray(pSys.generalFeatLevels, [3, 7, 11, 15, 19]),
    dSys ? extractLevelArray(dSys.generalFeatLevels, []) : []
  );
  const skillIncreaseLevels = unionLevels(
    extractLevelArray(pSys.skillIncreaseLevels, [3, 5, 7, 9, 11, 13, 15, 17, 19]),
    dSys ? extractLevelArray(dSys.skillIncreaseLevels, []) : []
  );

  const boostLevels = variants.gradualBoostsEnabled
    ? [2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20]
    : [5, 10, 15, 20];
  const boostsPerTier = variants.gradualBoostsEnabled ? 1 : 4;

  // 2. Collect Class Features (Lv 1-20) directly from Primary Class & Dual Class `system.items`
  const classFeaturesByLevel = {};
  const collectClassItems = (itemsMap, sourceName, isDual) => {
    if (!itemsMap || typeof itemsMap !== "object") return;
    for (const entry of Object.values(itemsMap)) {
      if (!entry?.name) continue;
      const lvl = Math.max(1, Math.min(20, Number(entry.level ?? 1)));
      if (!classFeaturesByLevel[lvl]) classFeaturesByLevel[lvl] = [];
      // Deduplicate identical names across dual classes on the same level
      if (classFeaturesByLevel[lvl].some(f => normalizeSlug(f.name) === normalizeSlug(entry.name))) continue;
      classFeaturesByLevel[lvl].push({
        name: entry.name,
        uuid: entry.uuid || null,
        img: entry.img || "systems/pf2e/icons/default-icons/feat.svg",
        sourceName,
        isDual
      });
    }
  };
  collectClassItems(pSys.items, primaryName, false);
  if (dSys) collectClassItems(dSys.items, dualName, true);

  // 3. Index live slotted feats currently on the actor (for Levels 1..currentLevel)
  const liveFeatsBySlotKey = new Map();
  const knownFeatNamesLower = new Set();
  const knownDedicationsMap = new Map();
  for (const feat of actor.itemTypes?.feat || []) {
    const fName = String(feat.name || "").trim();
    knownFeatNamesLower.add(fName.toLowerCase());
    const fTraits = toStringArray(feat.system?.traits?.value).map(normalizeSlug);
    if (fTraits.includes("dedication") || /\bdedication\b/i.test(fName)) {
      const desc = makeDedicationDescriptor(fName, feat.slug || feat.system?.slug);
      if (desc.nameLower) knownDedicationsMap.set(desc.nameLower, desc);
    }
    const loc = feat.system?.location;
    if (typeof loc === "string" && loc) {
      liveFeatsBySlotKey.set(loc, feat);
    }
  }
  // Also scan `actor.feats` groups directly (most authoritative mapping for PF2e v14!)
  if (actor.feats && typeof actor.feats.values === "function") {
    for (const group of actor.feats.values()) {
      const slots = Array.isArray(group?.slots)
        ? group.slots
        : (typeof group?.slots?.values === "function" ? Array.from(group.slots.values()) : Object.values(group?.slots || {}));
      for (const slot of slots) {
        if (slot?.feat && slot?.level) {
          const k = `${group.id}-${slot.level}`;
          if (!liveFeatsBySlotKey.has(k)) liveFeatsBySlotKey.set(k, slot.feat);
        }
      }
    }
  }

  // 4. Spellcasting milestones across Levels 1-20
  const spellMilestones = computeSpellMilestonesByLevel(actor, currentLevel, dualInfo, checkerReport);

  // 5. Running Projections for Attributes & Skill Ranks across Levels 1-20
  const projectedBoostCounts = getBaseBoostCounts(actor, currentLevel, dualInfo);
  const projectedSkillRanks = {};
  for (const slug of CORE_SKILL_SLUGS) {
    projectedSkillRanks[slug] = Number(actor.system?.skills?.[slug]?.rank ?? 0);
  }

  const boostSetUsed = new Map(); // setIdx -> Set of attributes used in that gradual set (levels 2-5, 7-10, 12-15, 17-20)
  if (variants.gradualBoostsEnabled) {
    const liveBoosts = actor.system?.build?.attributes?.boosts || {};
    GRADUAL_BOOST_SETS.forEach((setLvls, idx) => {
      const used = new Set();
      for (const l of setLvls) {
        if (l <= currentLevel && Array.isArray(liveBoosts[l])) {
          for (const a of liveBoosts[l]) if (ABILITY_KEYS.includes(a)) used.add(a);
        }
      }
      boostSetUsed.set(idx, used);
    });
  }

  // Helper to build a feat slot descriptor
  const buildFeatSlot = (groupId, groupLabel, category, traits, slotLevel, isFuture, levelPlanData, activeDedications = []) => {
    const slotKey = `${groupId}-${slotLevel}`;
    const liveFeat = liveFeatsBySlotKey.get(slotKey) || null;
    const plannedFeat = levelPlanData?.feats?.[slotKey] || null;

    if (!isFuture) {
      return {
        slotKey,
        groupId,
        groupLabel,
        category,
        traits,
        dedications: activeDedications,
        level: slotLevel,
        isFuture: false,
        filled: Boolean(liveFeat),
        feat: liveFeat ? {
          id: liveFeat.id,
          uuid: liveFeat.uuid,
          name: liveFeat.name,
          img: liveFeat.img || "systems/pf2e/icons/default-icons/feat.svg",
          level: Number(liveFeat.system?.level?.value ?? slotLevel)
        } : null,
        warnings: []
      };
    }

    const warnings = checkPlannedFeatPrereqs(plannedFeat, slotLevel, projectedSkillRanks, knownFeatNamesLower);
    if (plannedFeat?.name) {
      knownFeatNamesLower.add(String(plannedFeat.name).toLowerCase().trim());
    }

    return {
      slotKey,
      groupId,
      groupLabel,
      category,
      traits,
      dedications: activeDedications,
      level: slotLevel,
      isFuture: true,
      filled: Boolean(plannedFeat),
      feat: plannedFeat,
      warnings,
      hasWarnings: warnings.length > 0
    };
  };

  // 6. Build all 20 Level Rows!
  const levels = [];
  const liveAttrBoosts = actor.system?.build?.attributes?.boosts || {};

  for (let lvl = 1; lvl <= 20; lvl++) {
    const isPast = lvl < currentLevel;
    const isCurrent = lvl === currentLevel;
    const isNextLevel = lvl === currentLevel + 1;
    const isFuture = lvl > currentLevel;
    const lp = plan.levels[String(lvl)] || { boosts: [], skillIncrease: null, feats: {}, spells: [] };

    // A. Attribute Boosts for this level
    const hasBoosts = boostLevels.includes(lvl);
    let boostInfo = null;
    if (hasBoosts) {
      const selectedBoosts = isFuture
        ? (Array.isArray(lp.boosts) ? lp.boosts.filter(a => ABILITY_KEYS.includes(a)) : [])
        : (Array.isArray(liveAttrBoosts[lvl]) ? liveAttrBoosts[lvl].filter(a => ABILITY_KEYS.includes(a)) : []);

      // Determine gradual set blocked attributes (from OTHER levels in the same 4-level set)
      let blockedInSet = new Set();
      let gradualSetIdx = -1;
      if (variants.gradualBoostsEnabled) {
        gradualSetIdx = GRADUAL_BOOST_SETS.findIndex(s => s.includes(lvl));
        if (gradualSetIdx >= 0) {
          blockedInSet = new Set(boostSetUsed.get(gradualSetIdx) || []);
          for (const a of selectedBoosts) blockedInSet.delete(a);
        }
      }

      // Apply planned future boosts to running projection
      if (isFuture) {
        for (const a of selectedBoosts) {
          projectedBoostCounts[a] = (projectedBoostCounts[a] || 0) + 1;
          if (gradualSetIdx >= 0) {
            boostSetUsed.get(gradualSetIdx)?.add(a);
          }
        }
      }

      const attrButtons = ABILITY_KEYS.map(a => {
        const isSelected = selectedBoosts.includes(a);
        const isDisabled = !isFuture
          || (!isSelected && selectedBoosts.length >= boostsPerTier)
          || (!isSelected && blockedInSet.has(a));
        const modState = computeModFromBoostCount(projectedBoostCounts[a] || 0);
        return {
          key: a,
          label: ABILITY_LABELS[a],
          selected: isSelected,
          disabled: isDisabled,
          projectedMod: `${modState.mod >= 0 ? "+" : ""}${modState.mod}${modState.partial ? "*" : ""}`
        };
      });

      boostInfo = {
        expected: boostsPerTier,
        selectedCount: selectedBoosts.length,
        selectedLabels: selectedBoosts.map(a => ABILITY_LABELS[a]).join(", "),
        complete: selectedBoosts.length >= boostsPerTier,
        buttons: attrButtons
      };
    }

    // B. Skill Increase for this level
    const hasSkillIncrease = skillIncreaseLevels.includes(lvl);
    let skillIncreaseInfo = null;
    if (hasSkillIncrease) {
      const maxLegal = maxSkillRankForLevel(lvl);
      const chosenSlug = isFuture && typeof lp.skillIncrease === "string" && CORE_SKILL_SLUGS.includes(lp.skillIncrease)
        ? lp.skillIncrease
        : "";

      const options = [];
      let chosenTransition = "";
      let chosenValid = true;

      if (isFuture) {
        for (const slug of CORE_SKILL_SLUGS) {
          const curRank = Number(projectedSkillRanks[slug] ?? 0);
          const nextRank = curRank + 1;
          const canUpgrade = nextRank <= maxLegal;
          const isChosen = slug === chosenSlug;
          if (!canUpgrade && !isChosen) continue;
          const transition = `${capitalize(slug)} (${RANK_SHORT[curRank]} → ${RANK_SHORT[Math.min(4, nextRank)]})`;
          if (isChosen) {
            chosenTransition = transition;
            if (!canUpgrade) chosenValid = false;
          }
          options.push({
            slug,
            label: transition,
            selected: isChosen,
            invalid: !canUpgrade
          });
        }

        // Advance running projected skill rank for subsequent levels
        if (chosenSlug && chosenValid) {
          projectedSkillRanks[chosenSlug] = Math.min(maxLegal, (projectedSkillRanks[chosenSlug] || 0) + 1);
        }
      }

      skillIncreaseInfo = {
        maxLegalRank: maxLegal,
        maxLegalLabel: RANK_FULL[maxLegal],
        chosenSlug,
        chosenTransition,
        chosenValid,
        complete: !isFuture || (Boolean(chosenSlug) && chosenValid),
        options
      };
    }

    // C. Feat Slots at this level
    // Snapshot dedications already active (live on sheet or planned at earlier levels)
    const activeDedications = Array.from(knownDedicationsMap.values());
    const featSlots = [];

    if (ancestryLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("ancestry", "Ancestry Feat", "ancestry", actorAncestryTraits, lvl, isFuture, lp, activeDedications));
    }
    if (ancestryParagonLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("ancestryparagon", "Ancestry Paragon", "ancestry", actorAncestryTraits, lvl, isFuture, lp, activeDedications));
    }
    if (classFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("class", `${primaryName} Feat`, "class", actorPrimaryClassTraits, lvl, isFuture, lp, activeDedications));
    }
    if (dualClassFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("dualclass", `${dualName} Feat (Dual)`, "class", actorDualClassTraits, lvl, isFuture, lp, activeDedications));
    }
    if (freeArchetypeLevels.includes(lvl)) {
      const archBrowserTraits = activeDedications.length > 0 ? ["archetype"] : ["dedication"];
      featSlots.push(buildFeatSlot("archetype", "Free Archetype", "class", archBrowserTraits, lvl, isFuture, lp, activeDedications));
    }
    if (skillFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("skill", "Skill Feat", "skill", [], lvl, isFuture, lp, activeDedications));
    }
    if (generalFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("general", "General Feat", "general", [], lvl, isFuture, lp, activeDedications));
    }

    // Record any newly planned Dedication feats at this level for subsequent future levels (lvl+1..20)
    if (isFuture) {
      for (const s of featSlots) {
        if (s.feat?.name && (s.feat.isDedication || /\bdedication\b/i.test(s.feat.name))) {
          const desc = makeDedicationDescriptor(s.feat.name);
          if (desc.nameLower) knownDedicationsMap.set(desc.nameLower, desc);
        }
      }
    }

    // D. Class Features unlocked at this level
    const classFeatures = classFeaturesByLevel[lvl] || [];

    // E. Spellcasting milestones & planned spells
    const milestones = spellMilestones[lvl] || [];
    const plannedSpells = isFuture && Array.isArray(lp.spells) ? lp.spells : [];

    // F. Level plan completion badge (for future levels)
    let plannedItemsTotal = featSlots.length + (hasBoosts ? 1 : 0) + (hasSkillIncrease ? 1 : 0);
    let plannedItemsDone = featSlots.filter(s => s.filled).length
      + (hasBoosts && boostInfo?.complete ? 1 : 0)
      + (hasSkillIncrease && skillIncreaseInfo?.complete ? 1 : 0);

    levels.push({
      level: lvl,
      isPast,
      isCurrent,
      isNextLevel,
      isFuture,
      classFeatures,
      hasClassFeatures: classFeatures.length > 0,
      hasBoosts,
      boostInfo,
      hasSkillIncrease,
      skillIncreaseInfo,
      featSlots,
      hasFeatSlots: featSlots.length > 0,
      spellMilestones: milestones,
      hasSpellMilestones: milestones.length > 0,
      plannedSpells,
      hasPlannedSpells: plannedSpells.length > 0,
      plannedItemsTotal,
      plannedItemsDone,
      isLevelPlanComplete: plannedItemsTotal > 0 && plannedItemsDone >= plannedItemsTotal
    });
  }

  // Final Level 20 projected attributes & trained/upgraded skills snapshot
  const finalProjectedAttrs = ABILITY_KEYS.map(a => {
    const s = computeModFromBoostCount(projectedBoostCounts[a] || 0);
    return {
      key: a,
      label: ABILITY_LABELS[a],
      mod: `${s.mod >= 0 ? "+" : ""}${s.mod}${s.partial ? "*" : ""}`
    };
  });

  const finalProjectedSkills = CORE_SKILL_SLUGS
    .map(slug => ({
      slug,
      label: capitalize(slug),
      rank: projectedSkillRanks[slug] || 0,
      rankShort: RANK_SHORT[projectedSkillRanks[slug] || 0],
      rankFull: RANK_FULL[projectedSkillRanks[slug] || 0]
    }))
    .filter(s => s.rank >= 1)
    .sort((a, b) => (b.rank - a.rank) || a.label.localeCompare(b.label));

  return {
    actorId: actor.id,
    actorName: actor.name,
    actorImg: actor.img || "icons/svg/mystery-man.svg",
    currentLevel,
    canLevelUp: currentLevel < 20,
    nextLevel: Math.min(20, currentLevel + 1),
    classDisplay: dualInfo ? `${primaryName} / ${dualName}` : primaryName,
    primaryName,
    dualName,
    isDualClass: Boolean(dualInfo),
    variants,
    activeVariantBadges: checkerReport?.activeVariantBadges || [],
    hasVariantBadges: (checkerReport?.activeVariantBadges?.length || 0) > 0,
    checkerReport,
    levels,
    finalProjectedAttrs,
    finalProjectedSkills
  };
}

/* ------------------------------------------------------------------------- */
/* 4. LAZY COMPENDIUM INDEX LOADER & NATIVE PF2E COMPENDIUM BROWSER HELPER   */
/* ------------------------------------------------------------------------- */

/**
 * Resets all checkboxes, multiselects, and search text on a Compendium Browser filter object
 * so stale filters from a previous browsing session (e.g. Class + Archetype + Dedication)
 * never leak into a newly requested slot filter.
 */
function resetBrowserFilterObject(filter) {
  if (!filter || typeof filter !== "object") return;
  if (filter.search && typeof filter.search === "object") {
    filter.search.text = "";
  }
  if (filter.checkboxes && typeof filter.checkboxes === "object") {
    for (const box of Object.values(filter.checkboxes)) {
      if (!box || typeof box !== "object") continue;
      box.selected = [];
      box.isExpanded = false;
      if (box.options && typeof box.options === "object") {
        for (const opt of Object.values(box.options)) {
          if (opt && typeof opt === "object") opt.selected = false;
        }
      }
    }
  }
  if (filter.multiselects && typeof filter.multiselects === "object") {
    for (const ms of Object.values(filter.multiselects)) {
      if (!ms || typeof ms !== "object") continue;
      ms.selected = [];
      if ("conjunction" in ms) ms.conjunction = "and";
    }
  }
}

/**
 * Finds the feat-category checkbox group dynamically across PF2e versions
 * (`category`, `categories`, `feattype`, `featType`, or option-key detection).
 */
function findFeatCategoryCheckbox(filter) {
  const cbs = filter?.checkboxes;
  if (!cbs || typeof cbs !== "object") return null;
  return cbs.category
    || cbs.categories
    || cbs.feattype
    || cbs.featType
    || Object.values(cbs).find(b => b?.options && ("ancestry" in b.options) && ("class" in b.options))
    || null;
}

/**
 * Opens a PF2e Compendium Browser tab with a pre-configured `filter` safely across
 * both PF2e v5/v6 (`tab.open(filter)`) and PF2e v6.8+/v7 Svelte (`browser.openTab(name, { filter })`),
 * verifying afterward that stale filters from a previously open tab were replaced.
 */
async function openBrowserTabWithFilter(browser, tab, tabName, filter, verifyFn) {
  const openTabSrc = typeof browser?.openTab === "function"
    ? Function.prototype.toString.call(browser.openTab)
    : "";
  const openTabUsesFilterObj = /\bfilter\b/.test(openTabSrc)
    && (/\{\s*[^}]*\bfilter\b/.test(openTabSrc) || /\.\s*filter\b/.test(openTabSrc) || /\?\.\s*filter\b/.test(openTabSrc));

  const tryOpenTabObj = async () => {
    if (typeof browser?.openTab === "function") {
      await browser.openTab(tabName, { filter });
      return true;
    }
    return false;
  };

  const tryTabOpen = async () => {
    if (typeof tab?.open === "function") {
      const tabOpenSrc = Function.prototype.toString.call(tab.open);
      const paramIsObj = /^[^(]*\(\s*\{[^)]*\bfilter\b/.test(tabOpenSrc);
      if (paramIsObj) {
        await tab.open({ filter });
      } else {
        await tab.open(filter);
      }
      return true;
    }
    return false;
  };

  // Attempt 1: preferred signature for the detected PF2e version
  if (openTabUsesFilterObj) {
    await tryOpenTabObj();
  } else {
    const opened = await tryTabOpen();
    if (!opened) await tryOpenTabObj();
  }

  // Verify live tab.filterData actually updated (handles Svelte cached tab state & API signature differences)
  if (typeof verifyFn === "function" && tab?.filterData && !verifyFn(tab.filterData)) {
    // Attempt 2: try the alternate open call
    if (openTabUsesFilterObj) {
      await tryTabOpen();
    } else {
      await tryOpenTabObj();
    }
  }

  // Attempt 3: if the already-mounted tab still held stale filterData, patch it in place and re-render
  if (typeof verifyFn === "function" && tab?.filterData && !verifyFn(tab.filterData)) {
    try {
      resetBrowserFilterObject(tab.filterData);
      if (filter.checkboxes && tab.filterData.checkboxes) {
        for (const [k, srcBox] of Object.entries(filter.checkboxes)) {
          const dstBox = tab.filterData.checkboxes[k];
          if (!dstBox || !srcBox) continue;
          dstBox.selected = [...(srcBox.selected || [])];
          dstBox.isExpanded = Boolean(srcBox.isExpanded);
          if (dstBox.options && srcBox.options) {
            for (const [ok, sOpt] of Object.entries(srcBox.options)) {
              if (dstBox.options[ok]) dstBox.options[ok].selected = Boolean(sOpt.selected);
            }
          }
        }
      }
      if (filter.multiselects && tab.filterData.multiselects) {
        for (const [k, srcMs] of Object.entries(filter.multiselects)) {
          const dstMs = tab.filterData.multiselects[k];
          if (!dstMs || !srcMs) continue;
          dstMs.selected = foundry.utils.deepClone(srcMs.selected || []);
          if ("conjunction" in dstMs && srcMs.conjunction) dstMs.conjunction = srcMs.conjunction;
        }
      }
      if (filter.sliders && tab.filterData.sliders) {
        for (const [k, srcSl] of Object.entries(filter.sliders)) {
          const dstSl = tab.filterData.sliders[k];
          if (!dstSl || !srcSl?.values) continue;
          if (Array.isArray(dstSl.values) && Array.isArray(srcSl.values)) {
            dstSl.values = [...srcSl.values];
          } else if (dstSl.values && typeof dstSl.values === "object") {
            if (srcSl.values.min !== undefined) dstSl.values.min = srcSl.values.min;
            if (srcSl.values.max !== undefined) dstSl.values.max = srcSl.values.max;
          }
          dstSl.isExpanded = Boolean(srcSl.isExpanded);
        }
      }
      browser.render?.({ force: false });
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Could not patch live Compendium Browser filterData:", err);
    }
  }
}

/**
 * Opens PF2e's built-in Compendium Browser pre-filtered for a specific Feat slot
 * so players can browse natively and drag-and-drop onto any slot!
 */
export async function openNativeBrowserForFeatSlot(slotSpec) {
  const browser = game.pf2e?.compendiumBrowser;
  const tab = browser?.tabs?.feat;
  if (!browser || !tab) {
    ui.notifications?.warn("PF2e Compendium Browser is unavailable.");
    return;
  }

  try {
    // Ensure tab options (categories, traits) are initialized before reading filter schema
    if (!tab.isInitialized) {
      if (typeof tab.init === "function") await tab.init();
      else if (typeof tab.loadData === "function") await tab.loadData();
    }

    let filter = null;
    if (typeof tab.getFilterData === "function") {
      filter = await tab.getFilterData();
    } else if (tab.defaultFilterData) {
      filter = foundry.utils.deepClone(tab.defaultFilterData);
    } else if (tab.filterData) {
      filter = foundry.utils.deepClone(tab.filterData);
    }

    if (!filter || typeof filter !== "object") {
      await browser.openTab?.("feat");
      return;
    }

    // Wipe any stale filters from previous browsing sessions (e.g. Class + Archetype + Dedication)
    resetBrowserFilterObject(filter);

    // 1. Level slider (handles both { min, max } object and [min, max] array formats)
    const maxLvl = Math.max(1, Number(slotSpec.level || 20));
    if (filter?.sliders?.level?.values) {
      if (Array.isArray(filter.sliders.level.values)) {
        filter.sliders.level.values = [0, maxLvl];
      } else {
        filter.sliders.level.values.min = filter.sliders.level.values.lowerLimit ?? 0;
        filter.sliders.level.values.max = Math.min(filter.sliders.level.values.upperLimit ?? 20, maxLvl);
      }
      filter.sliders.level.isExpanded = true;
    }

    // 2. Category checkboxes (ancestry, class, skill, general)
    // Free Archetype slots filter strictly to `class` + archetype/dedication trait (matching native PF2e)
    const targetCats = slotSpec.groupId === "archetype"
      ? ["class"]
      : (slotSpec.category === "general"
        ? ["general", "skill"]
        : (slotSpec.category ? [slotSpec.category] : []));

    const catBox = findFeatCategoryCheckbox(filter);
    if (catBox) {
      catBox.selected = [];
      for (const c of targetCats) {
        if (catBox.options?.[c]) {
          catBox.options[c].selected = true;
          catBox.selected.push(c);
        } else if (!catBox.options || Object.keys(catBox.options).length === 0) {
          catBox.selected.push(c);
        }
      }
      if (catBox.selected.length > 0) catBox.isExpanded = true;
    }

    // 3. Trait multiselect (only include valid traits recognized by PF2e's browser options!)
    const traitSelect = filter?.multiselects?.traits;
    let selectedTraits = [];
    if (traitSelect) {
      const rawTraits = Array.isArray(slotSpec.traits) ? slotSpec.traits.filter(Boolean) : [];
      const rawOpts = traitSelect.options;
      const validOpts = Array.isArray(rawOpts)
        ? rawOpts
        : (rawOpts && typeof rawOpts === "object"
          ? Object.entries(rawOpts).map(([k, v]) => (typeof v === "string" ? { value: k, label: v } : { value: v?.value || k, label: v?.label || capitalize(k) }))
          : []);

      for (const t of rawTraits) {
        if (validOpts.length > 0) {
          const match = validOpts.find(o => o?.value === t);
          if (match) {
            selectedTraits.push({ value: match.value, label: match.label, not: false });
          }
        } else {
          selectedTraits.push({ value: t, label: capitalize(t.replace(/-/g, " ")), not: false });
        }
      }
      traitSelect.selected = selectedTraits;
      if ("conjunction" in traitSelect) {
        traitSelect.conjunction = selectedTraits.length > 1 ? "or" : "and";
      }
    }

    await openBrowserTabWithFilter(browser, tab, "feat", filter, (liveFilter) => {
      const liveCat = findFeatCategoryCheckbox(liveFilter);
      const liveSelectedCats = Array.isArray(liveCat?.selected) ? liveCat.selected : [];
      const catsOk = targetCats.length === 0
        || (liveSelectedCats.length === targetCats.length && targetCats.every(c => liveSelectedCats.includes(c)));
      const liveTraits = Array.isArray(liveFilter?.multiselects?.traits?.selected)
        ? liveFilter.multiselects.traits.selected.map(o => o?.value)
        : [];
      const expectedTraitVals = selectedTraits.map(o => o.value);
      const traitsOk = liveTraits.length === expectedTraitVals.length
        && expectedTraitVals.every(v => liveTraits.includes(v));
      return catsOk && traitsOk;
    });
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Fallback opening Compendium Browser feat tab:", err);
    await browser.openTab?.("feat");
  }
}

export async function openNativeBrowserForSpells({ tradition = "", maxRank = 1, unlockedNewRank = 0 } = {}) {
  const browser = game.pf2e?.compendiumBrowser;
  const tab = browser?.tabs?.spell;
  if (!browser || !tab) {
    ui.notifications?.warn("PF2e Compendium Browser is unavailable.");
    return;
  }

  try {
    if (!tab.isInitialized) {
      if (typeof tab.init === "function") await tab.init();
      else if (typeof tab.loadData === "function") await tab.loadData();
    }

    let filter = null;
    if (typeof tab.getFilterData === "function") {
      filter = await tab.getFilterData();
    } else if (tab.defaultFilterData) {
      filter = foundry.utils.deepClone(tab.defaultFilterData);
    } else if (tab.filterData) {
      filter = foundry.utils.deepClone(tab.filterData);
    }

    if (!filter || typeof filter !== "object") {
      await browser.openTab?.("spell");
      return;
    }

    resetBrowserFilterObject(filter);

    // Tradition checkbox
    const tradBox = filter?.checkboxes?.traditions;
    if (tradBox?.options && tradition && tradBox.options[tradition]) {
      tradBox.selected = [tradition];
      tradBox.options[tradition].selected = true;
      tradBox.isExpanded = true;
    }

    // Rank checkbox (highlight newly unlocked rank if any, else up to maxRank)
    const rankBox = filter?.checkboxes?.ranks || filter?.checkboxes?.rank || filter?.checkboxes?.level;
    const targetRank = unlockedNewRank > 0 ? unlockedNewRank : Math.max(1, maxRank);
    const rankKey = String(targetRank);
    if (rankBox?.options && rankBox.options[rankKey]) {
      rankBox.options[rankKey].selected = true;
      rankBox.selected = [rankKey];
      rankBox.isExpanded = true;
    }

    await openBrowserTabWithFilter(browser, tab, "spell", filter, (liveFilter) => {
      const liveTrad = liveFilter?.checkboxes?.traditions?.selected || [];
      const liveRank = (liveFilter?.checkboxes?.ranks || liveFilter?.checkboxes?.rank || liveFilter?.checkboxes?.level)?.selected || [];
      const tradOk = !tradition || (liveTrad.length === 1 && liveTrad[0] === tradition);
      const rankOk = !rankBox || (liveRank.length === 1 && String(liveRank[0]) === rankKey);
      return tradOk && rankOk;
    });
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Fallback opening Compendium Browser spell tab:", err);
    await browser.openTab?.("spell");
  }
}

/**
 * Lazily retrieves lightweight Feat index entries (reusing PF2e Compendium Browser's
 * own cache when already loaded, or calling `pack.getIndex` once — never hydrating full docs!).
 */
export async function getLightweightFeatIndex() {
  if (_featIndexCache) return _featIndexCache;

  const browserIndex = game.pf2e?.compendiumBrowser?.tabs?.feat?.indexData;
  const browserHasPrereqs = Array.isArray(browserIndex)
    && browserIndex.length > 0
    && browserIndex.some(e => toStringArray(e.prerequisites ?? e.system?.prerequisites?.value).length > 0);

  if (browserHasPrereqs) {
    _featIndexCache = browserIndex.map(e => ({
      uuid: e.uuid,
      name: e.name,
      img: e.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number(e.level ?? e.system?.level?.value ?? 0),
      category: e.category || e.featType || e.system?.category || "",
      traits: toStringArray(e.traits ?? e.system?.traits?.value).map(normalizeSlug).filter(Boolean),
      rarity: e.rarity || e.system?.traits?.rarity || "common",
      prerequisites: toStringArray(e.prerequisites ?? e.system?.prerequisites?.value)
        .map(p => (typeof p === "string" ? p : (p?.value || "")))
        .filter(Boolean)
    }));
    return _featIndexCache;
  }

  const results = [];
  const seen = new Set();

  // Include World feat items first (homebrew!)
  for (const item of game.items || []) {
    if (item.type !== "feat") continue;
    if (seen.has(item.uuid)) continue;
    seen.add(item.uuid);
    results.push({
      uuid: item.uuid,
      name: item.name,
      img: item.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number(item.system?.level?.value ?? 0),
      category: item.system?.category || "",
      traits: toStringArray(item.system?.traits?.value).map(normalizeSlug).filter(Boolean),
      rarity: item.system?.traits?.rarity || "common",
      prerequisites: toStringArray(item.system?.prerequisites?.value)
        .map(p => (typeof p === "string" ? p : (p?.value || "")))
        .filter(Boolean)
    });
  }

  // Lazy pack.getIndex on Item compendiums containing feats
  const packs = Array.from(game.packs || []).filter(p =>
    p.documentName === "Item" && (p.collection === "pf2e.feats-srd" || /feat/i.test(p.collection) || /feat/i.test(p.title))
  );

  for (const pack of packs) {
    try {
      const idx = await pack.getIndex({
        fields: ["type", "img", "system.level.value", "system.category", "system.traits.value", "system.traits.rarity", "system.prerequisites.value"]
      });
      for (const e of idx) {
        if (e.type !== "feat") continue;
        const uuid = e.uuid || `Compendium.${pack.collection}.Item.${e._id}`;
        if (seen.has(uuid)) continue;
        seen.add(uuid);
        results.push({
          uuid,
          name: e.name,
          img: e.img || "systems/pf2e/icons/default-icons/feat.svg",
          level: Number(e.system?.level?.value ?? 0),
          category: e.system?.category || "",
          traits: toStringArray(e.system?.traits?.value).map(normalizeSlug).filter(Boolean),
          rarity: e.system?.traits?.rarity || "common",
          prerequisites: toStringArray(e.system?.prerequisites?.value)
            .map(p => (typeof p === "string" ? p : (p?.value || "")))
            .filter(Boolean)
        });
      }
    } catch { /* skip unreadable pack */ }
  }

  results.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
  _featIndexCache = results;
  return _featIndexCache;
}

/**
 * Lazily retrieves lightweight Spell index entries (zero startup overhead).
 */
export async function getLightweightSpellIndex() {
  if (_spellIndexCache) return _spellIndexCache;

  const browserIndex = game.pf2e?.compendiumBrowser?.tabs?.spell?.indexData;
  if (Array.isArray(browserIndex) && browserIndex.length > 0) {
    _spellIndexCache = browserIndex.map(e => {
      const spTraits = toStringArray(e.traits ?? e.system?.traits?.value).map(normalizeSlug);
      return {
        uuid: e.uuid,
        name: e.name,
        img: e.img || "systems/pf2e/icons/default-icons/spell.svg",
        rank: Number(e.rank ?? e.level ?? e.system?.level?.value ?? 1),
        isCantrip: Boolean(e.isCantrip || spTraits.includes("cantrip")),
        traditions: toStringArray(e.traditions ?? e.system?.traits?.traditions).map(normalizeSlug).filter(Boolean),
        rarity: e.rarity || e.system?.traits?.rarity || "common"
      };
    });
    return _spellIndexCache;
  }

  const results = [];
  const seen = new Set();

  for (const item of game.items || []) {
    if (item.type !== "spell") continue;
    if (seen.has(item.uuid)) continue;
    seen.add(item.uuid);
    const traits = Array.isArray(item.system?.traits?.value) ? item.system.traits.value : [];
    results.push({
      uuid: item.uuid,
      name: item.name,
      img: item.img || "systems/pf2e/icons/default-icons/spell.svg",
      rank: Number(item.system?.level?.value ?? 1),
      isCantrip: traits.includes("cantrip"),
      traditions: Array.isArray(item.system?.traits?.traditions) ? item.system.traits.traditions.map(normalizeSlug) : [],
      rarity: item.system?.traits?.rarity || "common"
    });
  }

  const packs = Array.from(game.packs || []).filter(p =>
    p.documentName === "Item" && (p.collection === "pf2e.spells-srd" || /spell/i.test(p.collection) || /spell/i.test(p.title))
  );

  for (const pack of packs) {
    try {
      const idx = await pack.getIndex({
        fields: ["type", "img", "system.level.value", "system.traits.value", "system.traits.traditions", "system.traits.rarity"]
      });
      for (const e of idx) {
        if (e.type !== "spell") continue;
        const uuid = e.uuid || `Compendium.${pack.collection}.Item.${e._id}`;
        if (seen.has(uuid)) continue;
        seen.add(uuid);
        const traits = Array.isArray(e.system?.traits?.value) ? e.system.traits.value : [];
        results.push({
          uuid,
          name: e.name,
          img: e.img || "systems/pf2e/icons/default-icons/spell.svg",
          rank: Number(e.system?.level?.value ?? 1),
          isCantrip: traits.includes("cantrip"),
          traditions: Array.isArray(e.system?.traits?.traditions) ? e.system.traits.traditions.map(normalizeSlug) : [],
          rarity: e.system?.traits?.rarity || "common"
        });
      }
    } catch { /* skip unreadable pack */ }
  }

  results.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
  _spellIndexCache = results;
  return _spellIndexCache;
}

/* ------------------------------------------------------------------------- */
/* 5. GUIDED 1-CLICK LEVEL-UP EXECUTOR (Lv N -> Lv N+1)                      */
/* ------------------------------------------------------------------------- */

/**
 * Resolves the exact live PF2e `slot.id` on `actor.feats` for a given groupId & level
 * so embedded feats snap cleanly into their exact native character sheet slot.
 */
function resolveLiveFeatSlotId(actor, groupId, targetLevel) {
  const group = actor.feats?.get?.(groupId);
  if (group?.slots) {
    const slots = Array.isArray(group.slots)
      ? group.slots
      : (typeof group.slots.values === "function" ? Array.from(group.slots.values()) : Object.values(group.slots));
    const emptyMatch = slots.find(s => Number(s?.level) === targetLevel && !s?.feat);
    if (emptyMatch?.id) return emptyMatch.id;
    const anyMatch = slots.find(s => Number(s?.level) === targetLevel);
    if (anyMatch?.id) return anyMatch.id;
  }
  return `${groupId}-${targetLevel}`;
}

/**
 * Applies the next level-up (actor.level -> actor.level + 1) natively on the live actor:
 *  1. Updates `system.details.level.value` (+ planned Attribute Boosts & Skill Increase)
 *  2. Waits briefly for native PF2e & Dual Class feature grants
 *  3. Embeds planned Feats sequentially into their exact native `system.location` slots
 *     (allowing PF2e ChoiceSet dialogs to prompt cleanly)
 *  4. Syncs Spellcasting Entry slots and embeds any planned Spells into matching entries
 *
 * @param {Actor} actor
 * @returns {Promise<{ ok: boolean, newLevel: number, summary: string[] }>}
 */
export async function applyPlannedLevelUp(actor) {
  if (!actor || actor.type !== "character") return { ok: false, newLevel: 0, summary: [] };
  if (!game.user?.isGM && !actor.isOwner) {
    ui.notifications?.warn("You do not have permission to level up this character.");
    return { ok: false, newLevel: actor.level || 1, summary: [] };
  }

  const currentLevel = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
  if (currentLevel >= 20) {
    ui.notifications?.info(`${actor.name} is already Level 20!`);
    return { ok: false, newLevel: 20, summary: [] };
  }

  const targetLevel = currentLevel + 1;
  const roadmap = buildLevelRoadmap(actor);
  const lvlData = roadmap?.levels?.find(l => l.level === targetLevel);
  const plan = getActorLevelPlan(actor);
  const lp = plan.levels[String(targetLevel)] || { boosts: [], skillIncrease: null, feats: {}, spells: [] };
  const summary = [];

  // 1. Level + Attribute Boosts + Skill Increase in one clean actor.update()
  const actorUpdates = {
    "system.details.level.value": targetLevel
  };

  if (lvlData?.hasBoosts && !actor.system?.build?.attributes?.manual) {
    const validBoosts = (Array.isArray(lp.boosts) ? lp.boosts : []).filter(a => ABILITY_KEYS.includes(a));
    if (validBoosts.length > 0) {
      actorUpdates[`system.build.attributes.boosts.${targetLevel}`] = validBoosts;
      summary.push(`Boosts: ${validBoosts.map(a => ABILITY_LABELS[a]).join(", ")}`);
    }
  }

  if (lvlData?.hasSkillIncrease && typeof lp.skillIncrease === "string" && CORE_SKILL_SLUGS.includes(lp.skillIncrease)) {
    const slug = lp.skillIncrease;
    const curRank = Number(actor.system?.skills?.[slug]?.rank ?? 0);
    const maxLegal = maxSkillRankForLevel(targetLevel);
    const nextRank = Math.min(maxLegal, curRank + 1);
    if (nextRank > curRank) {
      actorUpdates[`system.skills.${slug}.rank`] = nextRank;
      summary.push(`Skill: ${capitalize(slug)} → ${RANK_FULL[nextRank]}`);
    }
  }

  await actor.update(actorUpdates);

  // Allow PF2e's native level-up feature grants & Dual Class auto-sync hook to settle
  await new Promise(resolve => setTimeout(resolve, 350));

  // 2. Embed planned Feats sequentially so PF2e ChoiceSet prompts work cleanly
  const addedFeats = [];
  for (const slot of lvlData?.featSlots || []) {
    const planned = lp.feats?.[slot.slotKey];
    if (!planned?.uuid) continue;

    try {
      const sourceDoc = await fromUuid(planned.uuid);
      if (!sourceDoc || sourceDoc.type !== "feat") continue;

      const obj = sourceDoc.toObject();
      delete obj._id;
      const liveSlotId = resolveLiveFeatSlotId(actor, slot.groupId, targetLevel);
      if (obj.system) {
        obj.system.location = liveSlotId;
      }
      obj.flags = obj.flags || {};
      obj.flags.core = obj.flags.core || {};
      obj.flags.core.sourceId = planned.uuid;
      obj._stats = obj._stats || {};
      obj._stats.compendiumSource = planned.uuid;

      const created = await actor.createEmbeddedDocuments("Item", [obj]);
      if (created?.length > 0) {
        addedFeats.push(created[0].name);
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed to add planned feat "${planned.name}":`, err);
    }
  }
  if (addedFeats.length > 0) {
    summary.push(`Feats: ${addedFeats.join(", ")}`);
  }

  // 3. Sync Spellcasting Entry slots for the new level
  try {
    const syncRes = await createOrSyncAllSpellcastingEntries(actor);
    if (syncRes.created.length > 0) summary.push(`Created entries: ${syncRes.created.join(", ")}`);
    if (syncRes.synced.length > 0) summary.push(`Synced spell slots: ${syncRes.synced.join(", ")}`);
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Spellcasting sync during level-up failed:", err);
  }

  // 4. Embed any planned Spells into their matching Spellcasting Entry
  const plannedSpells = Array.isArray(lp.spells) ? lp.spells : [];
  if (plannedSpells.length > 0) {
    const postReport = analyzeCharacter(actor);
    const addedSpells = [];

    for (const sp of plannedSpells) {
      if (!sp?.uuid) continue;
      try {
        const spellDoc = await fromUuid(sp.uuid);
        if (!spellDoc || spellDoc.type !== "spell") continue;

        // Match target spellcasting entry by entryKey, tradition, or first non-focus entry
        let targetEntryId = null;
        if (sp.entryKey) {
          const matchedSrc = postReport?.spellcasting?.sources?.find(s => s.key === sp.entryKey && s.entryId);
          if (matchedSrc) targetEntryId = matchedSrc.entryId;
        }
        if (!targetEntryId && sp.tradition) {
          const byTrad = (actor.itemTypes?.spellcastingEntry || []).find(e =>
            e.system?.tradition?.value === sp.tradition && e.system?.prepared?.value !== "focus"
          );
          if (byTrad) targetEntryId = byTrad.id;
        }
        if (!targetEntryId) {
          const fallbackEntry = (actor.itemTypes?.spellcastingEntry || []).find(e => e.system?.prepared?.value !== "focus");
          if (fallbackEntry) targetEntryId = fallbackEntry.id;
        }
        if (!targetEntryId) continue;

        const obj = spellDoc.toObject();
        delete obj._id;
        obj.system = obj.system || {};
        obj.system.location = obj.system.location || {};
        obj.system.location.value = targetEntryId;
        if (sp.rank && Number(sp.rank) > Number(obj.system.level?.value ?? 1)) {
          obj.system.location.heightenedLevel = Number(sp.rank);
        }

        const created = await actor.createEmbeddedDocuments("Item", [obj]);
        if (created?.length > 0) addedSpells.push(created[0].name);
      } catch (err) {
        console.warn(`PF2e Awesome GM Utilities | Failed to add planned spell "${sp.name}":`, err);
      }
    }

    if (addedSpells.length > 0) {
      summary.push(`Spells: ${addedSpells.join(", ")}`);
    }
  }

  return {
    ok: true,
    newLevel: targetLevel,
    summary
  };
}
