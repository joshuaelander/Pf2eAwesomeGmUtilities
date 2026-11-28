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

import { MODULE_ID } from "../constants.js";
import {
  SPELLBOOK_ARCHETYPE_SLUGS,
  SPELLBOOK_CLASS_SLUGS,
  computeExpectedSlotsForSourceAtLevel
} from "./spellcasting-rules.js";
import {
  ABILITY_LABELS,
  CORE_SKILL_SLUGS,
  TRADITION_LABELS,
  VARIANT_RULES_MODULE_ID,
  analyzeCharacter,
  capitalize,
  collectActorGrantedSpellsProgression,
  createOrSyncAllSpellcastingEntries,
  extractGroupSlots,
  formatSlotsSummary,
  getActiveVariantRules,
  getActorDualClassInfo,
  normalizeSlug,
  resolveSpellDocumentByUuid,
  syncSpellcastingEntrySlots
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
let _formulaIndexCache = null;
const _coreBuildIndexCache = new Map();
/** Lightweight per-UUID item metadata cache (rules, traits, description) for future class features & planned feats */
const _plannerItemMetaCache = new Map();

/** Tracks actor IDs currently being updated by Level Planner itself so sheet auto-prompt never misfires */
const _plannerUpdatingActors = new Set();

export function isPlannerUpdatingActor(actorId) {
  return Boolean(actorId && _plannerUpdatingActors.has(actorId));
}

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

async function saveActorLevelPlan(actor, plan) {
  if (!actor || actor.type !== "character") return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  const clean = {
    version: 1,
    levels: plan?.levels && typeof plan.levels === "object" ? plan.levels : {}
  };
  await actor.setFlag(MODULE_ID, PLAN_FLAG_KEY, clean);
  return true;
}

function createEmptyLevelPlanEntry() {
  return {
    boosts: [],
    skillIncrease: null,
    intBonusSkill: null,
    intBonusLanguage: "",
    feats: {},
    spells: [],
    formulas: []
  };
}

function ensurePlanLevelEntry(plan, levelNum) {
  const key = String(levelNum);
  if (!plan.levels[key] || typeof plan.levels[key] !== "object") {
    plan.levels[key] = createEmptyLevelPlanEntry();
  }
  const entry = plan.levels[key];
  if (!Array.isArray(entry.boosts)) entry.boosts = [];
  if (!("skillIncrease" in entry)) entry.skillIncrease = null;
  if (!("intBonusSkill" in entry)) entry.intBonusSkill = null;
  if (typeof entry.intBonusLanguage !== "string") entry.intBonusLanguage = "";
  if (!entry.feats || typeof entry.feats !== "object") entry.feats = {};
  if (!Array.isArray(entry.spells)) entry.spells = [];
  if (!Array.isArray(entry.formulas)) entry.formulas = [];
  return entry;
}

export async function updatePlannedLevelData(actor, levelNum, mutatorFn) {
  const plan = getActorLevelPlan(actor);
  const entry = ensurePlanLevelEntry(plan, levelNum);
  mutatorFn(entry, plan);
  return await saveActorLevelPlan(actor, plan);
}

export function hasAnySavedLevelPlan(actor) {
  const plan = getActorLevelPlan(actor);
  const levelsObj = plan?.levels;
  if (!levelsObj || typeof levelsObj !== "object") return false;
  for (const entry of Object.values(levelsObj)) {
    if (!entry || typeof entry !== "object") continue;
    if (Array.isArray(entry.boosts) && entry.boosts.length > 0) return true;
    if (typeof entry.skillIncrease === "string" && entry.skillIncrease) return true;
    if (typeof entry.intBonusSkill === "string" && entry.intBonusSkill) return true;
    if (typeof entry.intBonusLanguage === "string" && entry.intBonusLanguage.trim()) return true;
    if (entry.feats && typeof entry.feats === "object" && Object.values(entry.feats).some(f => Boolean(f && (f.uuid || f.itemData)))) return true;
    if (Array.isArray(entry.spells) && entry.spells.length > 0) return true;
    if (Array.isArray(entry.formulas) && entry.formulas.length > 0) return true;
  }
  return false;
}

function resolveLanguageSlug(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const langs = CONFIG.PF2E?.languages;
  if (!langs || typeof langs !== "object") return null;

  const lower = raw.toLowerCase();
  const norm = normalizeSlug(raw);
  if (langs[lower]) return lower;
  if (langs[norm]) return norm;

  for (const [slug, labelKey] of Object.entries(langs)) {
    const localized = String(game.i18n?.localize?.(labelKey) || labelKey || slug).trim().toLowerCase();
    if (localized === lower || normalizeSlug(localized) === norm) {
      return slug;
    }
  }
  return null;
}

function getAvailableLanguageChoices(excludeSlugs = new Set()) {
  const langs = CONFIG.PF2E?.languages;
  if (!langs || typeof langs !== "object") return [];
  const options = [];
  for (const [slug, labelKey] of Object.entries(langs)) {
    if (excludeSlugs.has(slug)) continue;
    const label = String(game.i18n?.localize?.(labelKey) || capitalize(slug)).trim();
    options.push({ slug, label });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

export async function clearPlannedFeatChoice(actor, levelNum, slotKey, choiceFlag) {
  if (!actor || actor.type !== "character" || !slotKey || !choiceFlag) return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  const key = String(levelNum);
  const ForcedDeletion = foundry.data.operators.ForcedDeletion;
  const delOp = globalThis._del ?? (typeof ForcedDeletion === "function" ? new ForcedDeletion() : ForcedDeletion);

  await actor.update({
    [`flags.${MODULE_ID}.${PLAN_FLAG_KEY}.levels.${key}.feats.${slotKey}.choices.${choiceFlag}`]: delOp
  });
  return true;
}

export async function setPlannedFeatSnapshot(actor, levelNum, slotKey, snapshot) {
  if (!actor || actor.type !== "character" || !slotKey || !snapshot) return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  const key = String(levelNum);
  const existing = actor.getFlag?.(MODULE_ID, PLAN_FLAG_KEY)?.levels?.[key]?.feats?.[slotKey];
  // Clear stale nested sub-choices when replacing an existing feat in the same slot
  if (existing?.choices && existing.uuid !== snapshot.uuid) {
    const ForcedDeletion = foundry.data.operators.ForcedDeletion;
    const delOp = globalThis._del ?? (typeof ForcedDeletion === "function" ? new ForcedDeletion() : ForcedDeletion);
    await actor.update({
      [`flags.${MODULE_ID}.${PLAN_FLAG_KEY}.levels.${key}.feats.${slotKey}.choices`]: delOp
    });
  }
  await updatePlannedLevelData(actor, levelNum, (entry) => {
    entry.feats[slotKey] = snapshot;
  });
  return true;
}

export async function clearPlannedFeat(actor, levelNum, slotKey) {
  if (!actor || actor.type !== "character" || !slotKey) return false;
  if (!game.user?.isGM && !actor.isOwner) return false;
  const key = String(levelNum);

  // Use Foundry v14's native ForcedDeletion operator (`_del`)
  const ForcedDeletion = foundry.data.operators.ForcedDeletion;
  const delOp = globalThis._del ?? (typeof ForcedDeletion === "function" ? new ForcedDeletion() : ForcedDeletion);

  await actor.update({
    [`flags.${MODULE_ID}.${PLAN_FLAG_KEY}.levels.${key}.feats.${slotKey}`]: delOp
  });

  // Defensive fallback in case an exotic slotKey wasn't deleted by the operator
  const stillPresent = actor.getFlag?.(MODULE_ID, PLAN_FLAG_KEY)?.levels?.[key]?.feats?.[slotKey];
  if (stillPresent) {
    await actor.update({
      [`flags.${MODULE_ID}.${PLAN_FLAG_KEY}.levels.${key}.feats.${slotKey}`]: null
    });
  }
  return true;
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

function parseLevelList(targetLevels) {
  return Array.from(new Set(
    (Array.isArray(targetLevels) ? targetLevels : [targetLevels])
      .map(Number)
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 20)
  )).sort((a, b) => a - b);
}

function getBaseAncestryLanguageSet(actor) {
  return new Set(
    (Array.isArray(actor.ancestry?.system?.languages?.value) ? actor.ancestry.system.languages.value : [])
      .map(s => String(s || "").toLowerCase())
      .filter(Boolean)
  );
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

/** Generic creature/rarity/meta traits that should NOT be used as ancestry/class feat filters */
const GENERIC_NON_ANCESTRY_TRAITS = new Set([
  "humanoid", "undead", "construct", "fey", "plant", "fungus", "beast",
  "dragon", "elemental", "fiend", "celestial", "monitor", "aberration",
  "astral", "ethereal", "spirit", "amphibious", "aquatic", "incorporeal",
  "mindless", "common", "uncommon", "rare", "unique",
  "holy", "unholy", "lawful", "chaotic", "good", "evil", "mythic",
  "minion", "summoned", "eidolon", "companion", "amorphous", "telepathy",
  "troop", "swarm", "tech", "living", "shadow", "time", "dream",
  "tiny", "small", "medium", "large", "huge", "gargantuan", "oni",
  "custom-mixed-heritage", "mixed-ancestry"
]);

/**
 * PF2e Remaster & Legacy mixed-heritage / renamed-ancestry trait expansions.
 * Ensures Aiuvarin/Half-Elf unlocks Elf + Aiuvarin + Half-Elf feats, Dromaar/Half-Orc
 * unlocks Orc + Dromaar + Half-Orc feats, and Remaster/Legacy renames interoperate cleanly.
 */
const ANCESTRY_HERITAGE_TRAIT_EXPANSIONS = {
  "aiuvarin": ["elf", "half-elf"],
  "half-elf": ["elf", "aiuvarin"],
  "dromaar": ["orc", "half-orc"],
  "half-orc": ["orc", "dromaar"],
  "aasimar": ["nephilim"],
  "tiefling": ["nephilim"],
  "aphorite": ["nephilim"],
  "ganzi": ["nephilim"],
  "nephilim": ["aasimar", "tiefling"],
  "gnoll": ["kholo"],
  "kholo": ["gnoll"],
  "grippli": ["tripkee"],
  "tripkee": ["grippli"],
  "ifrit": ["naari"],
  "naari": ["ifrit"]
};

/** Legacy trait slugs hidden from dropdown display labels when their Remaster equivalent is already shown */
const LEGACY_DISPLAY_ALIAS_TO_REMASTER = {
  "half-elf": "aiuvarin",
  "half-orc": "dromaar",
  "aasimar": "nephilim",
  "tiefling": "nephilim",
  "gnoll": "kholo",
  "grippli": "tripkee",
  "ifrit": "naari"
};

/** Symmetric search-box aliases so typing legacy or Remaster terms finds both */
export const ANCESTRY_SEARCH_ALIASES = {
  "half-elf": ["half-elf", "aiuvarin"],
  "aiuvarin": ["aiuvarin", "half-elf"],
  "half-orc": ["half-orc", "dromaar"],
  "dromaar": ["dromaar", "half-orc"],
  "aasimar": ["aasimar", "nephilim"],
  "tiefling": ["tiefling", "nephilim"],
  "nephilim": ["nephilim", "aasimar", "tiefling"],
  "gnoll": ["gnoll", "kholo"],
  "kholo": ["kholo", "gnoll"],
  "grippli": ["grippli", "tripkee"],
  "tripkee": ["tripkee", "grippli"],
  "ifrit": ["ifrit", "naari"],
  "naari": ["naari", "ifrit"]
};

/**
 * Formats an ancestry/class trait list for compact UI dropdown labels, omitting redundant
 * legacy aliases (e.g. `half-elf`) when their Remaster equivalent (`aiuvarin`) is already listed.
 */
export function formatTraitSummaryList(traits = []) {
  const clean = (Array.isArray(traits) ? traits : []).map(normalizeSlug).filter(Boolean);
  const set = new Set(clean);
  return clean
    .filter(t => {
      const remaster = LEGACY_DISPLAY_ALIAS_TO_REMASTER[t];
      return !(remaster && set.has(remaster));
    })
    .map(t => capitalize(t.replace(/-/g, " ")));
}

/**
 * Extracts authoritative ancestry, versatile/mixed heritage, and Adopted Ancestry feat traits:
 *  1. PF2e's own native `ancestry` / `ancestryparagon` FeatGroup `featFilter` / `filter`
 *  2. Live post-Rule-Element `actor.system.traits.value` & `actor.traits` (filtered to ancestry/heritage traits)
 *  3. Live `actor.ancestry` & `actor.heritage` traits, slugs, `ActorTraits` / `ChoiceSet` rules & `rulesSelections`
 *  4. Live `Adopted Ancestry` feat selection (rulesSelections, ChoiceSet, or parenthetical name)
 *  5. PF2e Remaster/Legacy mixed-heritage expansions (e.g. Aiuvarin/Half-Elf -> Elf, Dromaar/Half-Orc -> Orc)
 */
export function extractActorAncestryTraits(actor) {
  const traits = new Set();
  const knownAncestryTraits = CONFIG.PF2E?.ancestryTraits && typeof CONFIG.PF2E.ancestryTraits === "object"
    && Object.keys(CONFIG.PF2E.ancestryTraits).length > 0
    ? CONFIG.PF2E.ancestryTraits
    : null;

  const isKnownAncestrySlug = (slug, { requireRegistry = false } = {}) => Boolean(
    slug
    && !GENERIC_NON_ANCESTRY_TRAITS.has(slug)
    && (
      Object.prototype.hasOwnProperty.call(ANCESTRY_HERITAGE_TRAIT_EXPANSIONS, slug)
      || (knownAncestryTraits
        ? Object.prototype.hasOwnProperty.call(knownAncestryTraits, slug)
        : !requireRegistry)
    )
  );

  const addTrait = (raw, { strictKnown = false, requireRegistry = false } = {}) => {
    const slug = normalizeSlug(raw);
    if (!slug || GENERIC_NON_ANCESTRY_TRAITS.has(slug)) return;
    if (strictKnown && !isKnownAncestrySlug(slug, { requireRegistry })) return;
    traits.add(slug);
  };

  const ingestFilterToken = (token) => {
    if (typeof token !== "string") return;
    if (token.startsWith("traits-")) {
      addTrait(token.slice("traits-".length));
    } else if (token.startsWith("item:trait:")) {
      addTrait(token.slice("item:trait:".length));
    } else if (token.startsWith("trait:")) {
      addTrait(token.slice("trait:".length));
    }
  };

  // 1. PF2e native FeatGroup filters (`featFilter` & `filter`)
  for (const groupId of ["ancestry", "ancestryparagon"]) {
    const grp = actor?.feats?.get?.(groupId);
    if (!grp) continue;
    for (const src of [grp.featFilter, grp.filter]) {
      if (Array.isArray(src)) {
        for (const token of src) ingestFilterToken(token);
      } else if (src && typeof src === "object") {
        for (const t of toStringArray(src.traits)) {
          if (typeof t === "string") {
            if (t.startsWith("traits-") || t.includes("trait:")) ingestFilterToken(t);
            else addTrait(t);
          } else if (t && typeof t === "object" && typeof t.value === "string") {
            addTrait(t.value);
          }
        }
      }
    }
  }

  // 2. Live post-Rule-Element actor traits (where Aiuvarin/Half-Elf/Dromaar/Custom Mixed Heritage add `elf`/`orc`/etc.)
  for (const t of [
    ...toStringArray(actor?.system?.traits?.value),
    ...toStringArray(actor?.traits)
  ]) {
    addTrait(t, { strictKnown: true });
  }

  // Helper to inspect ActorTraits & ChoiceSet rules + rulesSelections on an ancestry/heritage/feat item
  const ingestItemGrantedAncestryTraits = (item) => {
    if (!item) return;
    const selections = item.flags?.pf2e?.rulesSelections && typeof item.flags.pf2e.rulesSelections === "object"
      ? item.flags.pf2e.rulesSelections
      : null;

    if (selections) {
      for (const val of Object.values(selections)) {
        if (typeof val === "string") addTrait(val, { strictKnown: true, requireRegistry: true });
      }
    }

    const rules = Array.isArray(item.system?.rules) ? item.system.rules : [];
    for (const rule of rules) {
      if (!rule || typeof rule !== "object") continue;
      if (rule.key === "ActorTraits") {
        for (const rawAdd of toStringArray(rule.add)) {
          if (typeof rawAdd !== "string") continue;
          const tplMatch = rawAdd.match(/\{item\|flags\.pf2e\.rulesSelections\.([^}]+)\}/i);
          if (tplMatch && selections) {
            const resolved = selections[tplMatch[1].trim()];
            if (typeof resolved === "string") addTrait(resolved, { strictKnown: true, requireRegistry: true });
          } else if (!rawAdd.includes("{")) {
            addTrait(rawAdd, { strictKnown: true });
          }
        }
      } else if (rule.key === "ChoiceSet" && typeof rule.selection === "string") {
        addTrait(rule.selection, { strictKnown: true, requireRegistry: true });
      }
    }
  };

  // 3. Live `actor.ancestry`
  if (actor?.ancestry) {
    for (const t of toStringArray(actor.ancestry.system?.traits?.value)) {
      addTrait(t);
    }
    addTrait(actor.ancestry.slug || actor.ancestry.system?.slug || actor.ancestry.name);
    ingestItemGrantedAncestryTraits(actor.ancestry);
  }

  // 4. Live `actor.heritage`
  if (actor?.heritage) {
    for (const t of toStringArray(actor.heritage.system?.traits?.value)) {
      addTrait(t);
    }
    const herSlug = normalizeSlug(actor.heritage.slug || actor.heritage.system?.slug || actor.heritage.name);
    // Include heritage slug if it is a Versatile Heritage (no bound parent ancestry) OR a known
    // mixed/legacy heritage (e.g., Legacy Half-Elf / Half-Orc which bound `ancestry: human`).
    const isVersatile = !actor.heritage.system?.ancestry;
    if (herSlug && (isVersatile || Object.prototype.hasOwnProperty.call(ANCESTRY_HERITAGE_TRAIT_EXPANSIONS, herSlug))) {
      addTrait(herSlug);
    }
    ingestItemGrantedAncestryTraits(actor.heritage);
  }

  // 5. Live `Adopted Ancestry` feat (or Custom Mixed Ancestry feat)
  for (const feat of actor?.itemTypes?.feat || []) {
    const fSlug = normalizeSlug(feat.slug || feat.system?.slug || feat.name);
    if (fSlug === "adopted-ancestry" || /^adopted-ancestry(?:-|$)/.test(fSlug) || /adopted\s+ancestry/i.test(feat.name || "")) {
      ingestItemGrantedAncestryTraits(feat);
      const parenMatch = String(feat.name || "").match(/\(([^)]+)\)/);
      if (parenMatch) addTrait(parenMatch[1], { strictKnown: true });
    }
  }

  // 6. Expand mixed-heritage & Remaster/Legacy trait equivalences (e.g. aiuvarin -> elf + half-elf)
  for (const existing of Array.from(traits)) {
    const extras = ANCESTRY_HERITAGE_TRAIT_EXPANSIONS[existing];
    if (Array.isArray(extras)) {
      for (const ex of extras) addTrait(ex);
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
function maxSkillRankForLevel(level) {
  if (level >= 15) return 4;
  if (level >= 7) return 3;
  if (level >= 3) return 2;
  return 1;
}

const RANK_WORD_MAP = { trained: 1, expert: 2, master: 3, legendary: 4 };
const RECALL_KNOWLEDGE_SKILLS = ["arcana", "crafting", "medicine", "nature", "occultism", "religion", "society"];
const ATTR_WORD_TO_KEY = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha"
};

/**
 * Evaluates a single PF2e prerequisite atom against the character's sheet/projected state.
 * Returns `{ status: "met" | "unmet" | "unknown", reason?: string }`.
 * Unknown/narrative prerequisites always return `"unknown"` (never false-hiding valid feats).
 */
function evaluateSinglePrereqAtom(rawAtom, prereqState, allFeatNamesLower = null) {
  const text = String(rawAtom || "").trim().replace(/\.$/, "");
  if (!text || !prereqState) return { status: "unknown" };
  const lower = text.toLowerCase();

  // 1. Proficiency rank prerequisites: "trained/expert/master/legendary in ..."
  //    (Skip if target itself contains a second "<rank> in ..." phrase so outer OR-splitter handles mixed ranks)
  const profMatch = lower.match(/\b(trained|expert|master|legendary)\s+in\s+(.+)$/i);
  if (profMatch && !/\b(?:trained|expert|master|legendary)\s+in\b/i.test(profMatch[2])) {
    const reqWord = profMatch[1].toLowerCase();
    const reqRank = RANK_WORD_MAP[reqWord] || 0;
    const target = profMatch[2].trim();

    // 1a. Recall Knowledge skill prerequisite (e.g. "trained in at least one skill with the Recall Knowledge action")
    if (/recall\s+knowledge/i.test(target)) {
      const bestRk = Math.max(
        Number(prereqState.maxLoreRank ?? 0),
        ...RECALL_KNOWLEDGE_SKILLS.map(s => Number(prereqState.skillRanks?.[s] ?? 0))
      );
      return bestRk >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in a Recall Knowledge skill` };
    }

    // 1b. Generic Lore skill ("trained in a Lore skill", "expert in Lore", "trained in at least one Lore skill")
    if (/(?:^|\b)(?:a|an|any|at\s+least\s+one)\s+lore\b|^lore(?:\s+skill)?$/i.test(target)) {
      const bestLore = Number(prereqState.maxLoreRank ?? 0);
      return bestLore >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in Lore (sheet: ${RANK_FULL[bestLore]})` };
    }

    // 1c. Generic "any skill" / "at least one skill" / "a skill"
    if (/(?:at\s+least\s+(?:one|a)|any|a)\s+skill\b/i.test(target) && !CORE_SKILL_SLUGS.some(s => new RegExp(`\\b${s}\\b`, "i").test(target))) {
      const bestAny = Math.max(
        Number(prereqState.maxLoreRank ?? 0),
        ...CORE_SKILL_SLUGS.map(s => Number(prereqState.skillRanks?.[s] ?? 0))
      );
      return bestAny >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in any skill (best: ${RANK_FULL[bestAny]})` };
    }

    // 1d. Perception
    if (/\bperception\b/i.test(target)) {
      const percRank = Number(prereqState.perceptionRank ?? 0);
      return percRank >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in Perception (sheet: ${RANK_FULL[percRank]})` };
    }

    // 1e. Armor / Defense proficiency
    const armorMatch = target.match(/\b(unarmored|light|medium|heavy)\s+(?:armor|defense)\b/i);
    if (armorMatch && prereqState.armorRanks) {
      const k = armorMatch[1].toLowerCase();
      const cur = Number(prereqState.armorRanks[k] ?? 0);
      return cur >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in ${armorMatch[0]} (sheet: ${RANK_FULL[cur]})` };
    }

    // 1f. Weapon / Attack proficiency
    const weapMatch = target.match(/\b(unarmed|simple|martial|advanced)\s+(?:weapons?|attacks?)\b/i);
    if (weapMatch && prereqState.weaponRanks) {
      const k = weapMatch[1].toLowerCase();
      const cur = Number(prereqState.weaponRanks[k] ?? 0);
      return cur >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in ${weapMatch[0]} (sheet: ${RANK_FULL[cur]})` };
    }

    // 1g. Saving throws
    const saveMatch = target.match(/\b(fortitude|reflex|will)(?:\s+saves?)?\b/i);
    if (saveMatch && prereqState.saveRanks) {
      const k = saveMatch[1].toLowerCase();
      const cur = Number(prereqState.saveRanks[k] ?? 0);
      return cur >= reqRank
        ? { status: "met" }
        : { status: "unmet", reason: `${capitalize(reqWord)} in ${capitalize(k)} (sheet: ${RANK_FULL[cur]})` };
    }

    // 1h. Named core skill(s) (and optional Lore): supports single, "A or B", "A, B, or C", and "A and B"
    const mentionedSkills = CORE_SKILL_SLUGS.filter(s => new RegExp(`\\b${s}\\b`, "i").test(target));
    const mentionsLore = /\blore\b/i.test(target);
    if (mentionedSkills.length > 0 || mentionsLore) {
      const checks = mentionedSkills.map(s => ({
        label: capitalize(s),
        cur: Number(prereqState.skillRanks?.[s] ?? 0)
      }));
      if (mentionsLore) {
        checks.push({ label: "Lore", cur: Number(prereqState.maxLoreRank ?? 0) });
      }
      const isAndList = /\band\b/i.test(target) && !/\bor\b/i.test(target);
      if (isAndList) {
        const failed = checks.filter(c => c.cur < reqRank);
        if (failed.length === 0) return { status: "met" };
        const missingStr = failed.map(c => `${c.label} (${RANK_FULL[c.cur]})`).join(", ");
        return { status: "unmet", reason: `${capitalize(reqWord)} in ${missingStr}` };
      }
      const anyPassed = checks.some(c => c.cur >= reqRank);
      if (anyPassed) return { status: "met" };
      if (checks.length === 1) {
        return { status: "unmet", reason: `${capitalize(reqWord)} in ${checks[0].label} (current: ${RANK_FULL[checks[0].cur]})` };
      }
      return { status: "unmet", reason: `${capitalize(reqWord)} in ${checks.map(c => c.label).join(" or ")}` };
    }

    return { status: "unknown" };
  }

  // 2. Attribute modifier or legacy ability score prerequisites ("Strength +2", "Dexterity 14", "Strength +2, Constitution +2")
  const attrRegex = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\s*(?:\+(\d+)|(\d+))\b/gi;
  const attrMatches = [];
  let am;
  while ((am = attrRegex.exec(lower)) !== null) {
    const key = ATTR_WORD_TO_KEY[am[1].toLowerCase()];
    const rawNum = Number(am[2] ?? am[3]);
    if (!key || !Number.isFinite(rawNum)) continue;
    // Remaster uses modifiers (+2, +3); Legacy uses scores (12, 14, 16, 18)
    const reqMod = am[2] !== undefined ? rawNum : (rawNum >= 10 ? Math.floor((rawNum - 10) / 2) : rawNum);
    attrMatches.push({ key, reqMod });
  }
  if (attrMatches.length > 0) {
    const isOrList = /\bor\b/i.test(lower) && !/\band\b/i.test(lower);
    if (isOrList) {
      const anyPassed = attrMatches.some(req => Number(prereqState.attrMods?.[req.key] ?? 0) >= req.reqMod);
      if (anyPassed) return { status: "met" };
      const summary = attrMatches.map(req => `${ABILITY_LABELS[req.key]} +${req.reqMod}`).join(" or ");
      return { status: "unmet", reason: summary };
    }
    const failed = attrMatches.filter(req => Number(prereqState.attrMods?.[req.key] ?? 0) < req.reqMod);
    if (failed.length === 0) return { status: "met" };
    const missingStr = failed
      .map(req => `${ABILITY_LABELS[req.key]} +${req.reqMod} (current: ${Number(prereqState.attrMods?.[req.key] ?? 0) >= 0 ? "+" : ""}${Number(prereqState.attrMods?.[req.key] ?? 0)})`)
      .join(", ");
    return { status: "unmet", reason: missingStr };
  }

  // 3. Spellcasting / Tradition / Focus Pool / Deity prerequisites
  const tradCastMatch = lower.match(/\bability\s+to\s+cast\s+(arcane|divine|occult|primal)\s+spells?\b/i);
  if (tradCastMatch) {
    const trad = tradCastMatch[1].toLowerCase();
    const hasTrad = Boolean(prereqState.spellcastingTraditions?.has?.(trad));
    return hasTrad
      ? { status: "met" }
      : { status: "unmet", reason: `${capitalize(trad)} spellcasting` };
  }
  if (/\bability\s+to\s+cast\s+focus\s+spells?\b|\bfocus\s+pool\b/i.test(lower)) {
    return prereqState.hasFocusPool
      ? { status: "met" }
      : { status: "unmet", reason: "Focus pool" };
  }
  if (/\bability\s+to\s+cast\s+spells?\b|\bspellcasting\s+class\s+feature\b/i.test(lower)) {
    return prereqState.isSpellcaster
      ? { status: "met" }
      : { status: "unmet", reason: "Spellcasting ability" };
  }
  if (/^you\s+follow\s+a\s+deity\b/i.test(lower)) {
    return prereqState.hasDeity
      ? { status: "met" }
      : { status: "unmet", reason: "Follow a deity" };
  }

  // 4. Dedication or known PF2e Feat prerequisite
  const knownFeats = prereqState.knownFeatNamesLower;
  const knownBase = prereqState.knownFeatBaseNamesLower;
  const hasKnownFeat = (targetLower) => {
    if (!targetLower) return false;
    if (knownFeats?.has?.(targetLower) || knownBase?.has?.(targetLower)) return true;
    const stripped = targetLower.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (stripped && (knownFeats?.has?.(stripped) || knownBase?.has?.(stripped))) return true;
    return false;
  };

  if (lower.includes("dedication")) {
    if (hasKnownFeat(lower)) return { status: "met" };
    const foundPartial = knownFeats && Array.from(knownFeats).some(n => n.length >= 6 && (n.includes(lower) || lower.includes(n)));
    return foundPartial ? { status: "met" } : { status: "unmet", reason: text };
  }

  if (allFeatNamesLower && allFeatNamesLower.size > 0) {
    const cleanLower = lower.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (allFeatNamesLower.has(lower) || (cleanLower && allFeatNamesLower.has(cleanLower))) {
      return hasKnownFeat(lower)
        ? { status: "met" }
        : { status: "unmet", reason: text };
    }
  }

  return { status: "unknown" };
}

/**
 * Evaluates all prerequisites on a PF2e feat against a character's live sheet & projected
 * Level Planner state at `slotLevel`. Never falsely rejects unverified narrative prerequisites.
 *
 * @param {{ prerequisites?: Array<string|{value:string}>, level?: number }} feat
 * @param {object} prereqState
 * @param {Set<string>|null} [allFeatNamesLower]
 * @returns {{ met: boolean, unmetReasons: string[] }}
 */
export function evaluateFeatPrerequisites(feat, prereqState, allFeatNamesLower = null) {
  const unmetReasons = [];
  if (!feat || !prereqState) return { met: true, unmetReasons };

  const prereqs = Array.isArray(feat.prerequisites) ? feat.prerequisites : [];
  for (const rawP of prereqs) {
    const pText = (typeof rawP === "string" ? rawP : (rawP?.value || "")).trim();
    if (!pText) continue;

    // Split semicolon-separated AND clauses
    const andClauses = pText.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean);
    for (const clause of andClauses) {
      // First try evaluating the full clause directly (handles "trained in A, B, or C" as one proficiency check)
      const direct = evaluateSinglePrereqAtom(clause, prereqState, allFeatNamesLower);
      if (direct.status === "met") continue;

      // If clause contains " or " (e.g. "Strength +2 or Dexterity +2", "expert in Acrobatics or trained in Athletics", "Feat A or Feat B")
      if (/\bor\b/i.test(clause) && !/^\s*(?:trained|expert|master|legendary)\s+in\s+(?:(?!(?:trained|expert|master|legendary)\s+in\b).)+$/i.test(clause)) {
        const orBranches = clause.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
        if (orBranches.length > 1) {
          const branchResults = orBranches.map(b => evaluateSinglePrereqAtom(b, prereqState, allFeatNamesLower));
          // If ANY branch is met or unknown (unverifiable prose), give benefit of the doubt
          if (branchResults.some(r => r.status === "met" || r.status === "unknown")) continue;
          const summary = branchResults.map(r => r.reason).filter(Boolean).join(" or ");
          unmetReasons.push(summary || clause);
          continue;
        }
      }

      if (direct.status === "unmet") {
        unmetReasons.push(direct.reason || clause);
      }
    }
  }

  return { met: unmetReasons.length === 0, unmetReasons };
}

/**
 * Soft-checks a planned feat's level & text prerequisites against the character's
 * projected state at `slotLevel` (never blocks picking; returns friendly warning strings).
 */
function checkPlannedFeatPrereqs(plannedFeat, slotLevel, prereqState) {
  const warnings = [];
  if (!plannedFeat) return warnings;

  const featLvl = Number(plannedFeat.level ?? 0);
  if (featLvl > slotLevel) {
    warnings.push(`Feat level ${featLvl} exceeds Level ${slotLevel} slot`);
  }

  const evalRes = evaluateFeatPrerequisites(plannedFeat, prereqState);
  for (const reason of evalRes.unmetReasons) {
    warnings.push(`Requires ${reason}`);
  }

  return warnings;
}

/**
 * Formats a concise human-readable prompt for how many spells remain to be picked for a milestone.
 * e.g. "Choose 2 Rank 2 spells", "Choose 1 more Rank 2 spell", "Choose 1 more spell (up to Rank 3)", "2/2 planned ✓".
 */
function formatSpellPickPrompt(milestone, plannedForSource = [], claimedCurriculumSpells = null) {
  const nonCantrips = plannedForSource.filter(sp => !sp?.isCantrip);

  if (milestone.learnMode === "upto-rank") {
    const req = Math.max(0, Number(milestone.requiredTotal || 0));
    // Remaster Wizard Curriculum picks are bonus spells on top of the 2 free spells learned per level
    const eligible = nonCantrips.filter(sp =>
      !sp?.isCurriculumPick
      && !(claimedCurriculumSpells?.has(sp))
      && Number(sp.rank || 1) <= milestone.maxRank
    );
    const picked = eligible.length;
    const left = Math.max(0, req - picked);
    const complete = left === 0;
    const bookLabel = milestone.classSlug === "witch" ? "Familiar" : "Spellbook";
    let promptText = "";
    if (complete) {
      promptText = `${picked}/${req} ${bookLabel} spell${req === 1 ? "" : "s"} planned ✓`;
    } else if (picked > 0) {
      promptText = `Add ${left} more ${bookLabel} spell${left === 1 ? "" : "s"} (up to Rank ${milestone.maxRank})`;
    } else {
      promptText = `Add ${req} ${bookLabel} spell${req === 1 ? "" : "s"} (up to Rank ${milestone.maxRank})`;
    }
    return {
      pickedCount: picked,
      requiredCount: req,
      remainingCount: left,
      remainingByRank: {},
      complete,
      isMandatory: req > 0,
      promptText
    };
  }

  if (milestone.learnMode === "by-rank") {
    const reqByRank = milestone.requiredByRank || {};
    const ranks = Object.keys(reqByRank).map(Number).filter(r => r >= 1 && reqByRank[r] > 0).sort((a, b) => a - b);
    const reqTotal = ranks.reduce((sum, r) => sum + Number(reqByRank[r] || 0), 0);
    const autoFilled = Number(milestone.autoFilledCount || 0);
    const autoSuffix = autoFilled > 0 ? ` (+${autoFilled} auto-granted)` : "";

    if (reqTotal === 0 && autoFilled > 0) {
      return {
        pickedCount: 0,
        requiredCount: 0,
        remainingCount: 0,
        remainingByRank: {},
        complete: true,
        isMandatory: false,
        promptText: `${autoFilled} repertoire spell${autoFilled === 1 ? "" : "s"} auto-granted ✓`
      };
    }

    const pickedByRank = {};
    for (const sp of nonCantrips) {
      const r = Math.max(1, Number(sp.rank || 1));
      pickedByRank[r] = (pickedByRank[r] || 0) + 1;
    }

    // Match exact rank first, and allow any unmatched lower-rank planned spell to count toward a higher-rank slot
    // if the player explicitly planned a lower-rank spell for their higher-rank repertoire pick (valid in PF2e!)
    const remainingByRank = {};
    let pickedMatched = 0;
    const leftoverPicked = { ...pickedByRank };

    for (const r of ranks) {
      const need = Number(reqByRank[r] || 0);
      const exact = Math.min(need, leftoverPicked[r] || 0);
      leftoverPicked[r] = (leftoverPicked[r] || 0) - exact;
      remainingByRank[r] = need - exact;
      pickedMatched += exact;
    }
    // Any remaining planned spells of rank <= r can fill remaining slot at rank r
    for (const r of ranks) {
      let stillNeed = remainingByRank[r] || 0;
      if (stillNeed <= 0) continue;
      for (let lr = r; lr >= 1 && stillNeed > 0; lr--) {
        const avail = leftoverPicked[lr] || 0;
        if (avail <= 0) continue;
        const used = Math.min(stillNeed, avail);
        leftoverPicked[lr] -= used;
        stillNeed -= used;
        pickedMatched += used;
      }
      remainingByRank[r] = stillNeed;
    }

    const totalLeft = Object.values(remainingByRank).reduce((s, n) => s + n, 0);
    const complete = totalLeft === 0;
    const hasAnyPicked = pickedMatched > 0;

    let promptText = "";
    if (complete) {
      promptText = `${pickedMatched}/${reqTotal} spell${reqTotal === 1 ? "" : "s"} planned ✓${autoSuffix}`;
    } else {
      const parts = ranks
        .filter(r => (remainingByRank[r] || 0) > 0)
        .map(r => {
          const left = remainingByRank[r];
          return `${left} ${hasAnyPicked ? "more " : ""}Rank ${r} spell${left === 1 ? "" : "s"}`;
        });
      promptText = `Choose ${parts.join(" & ")}${autoSuffix}`;
    }

    return {
      pickedCount: pickedMatched,
      requiredCount: reqTotal,
      remainingCount: totalLeft,
      remainingByRank,
      complete,
      isMandatory: reqTotal > 0,
      promptText
    };
  }

  // Optional (Full-list prepared casters like Cleric, Druid, Animist, Necromancer)
  const picked = nonCantrips.length;
  const maxR = milestone.unlockedNewRank || milestone.maxRank || 1;
  const promptText = milestone.unlockedNewRank > 0
    ? `Full ${milestone.traditionLabel} list — bookmark optional Rank ${maxR} spells`
    : `Full ${milestone.traditionLabel} list — bookmark favorite spells (optional)`;

  return {
    pickedCount: picked,
    requiredCount: 0,
    remainingCount: 0,
    remainingByRank: {},
    complete: true,
    isMandatory: false,
    promptText
  };
}

/**
 * Computes which spell ranks unlock, gain extra slots, and how many new spells to learn
 * at each level `1..20` based on the actor's active spellcasting sources.
 */
function computeSpellMilestonesByLevel(baseReport) {
  const byLevel = {};
  const sources = baseReport?.spellcasting?.sources || [];
  if (sources.length === 0) return byLevel;

  for (let lvl = 1; lvl <= 20; lvl++) {
    const notes = [];
    for (const src of sources) {
      if (src.isDivineFont) continue;
      if (src.isFocus) continue; // Focus spells auto-heighten every odd level automatically
      const cur = computeExpectedSlotsForSourceAtLevel(src, lvl, { projectAllArchetypeTiers: true });
      const prev = lvl > 1
        ? computeExpectedSlotsForSourceAtLevel(src, lvl - 1, { projectAllArchetypeTiers: true })
        : { slots: {}, maxRank: 0 };

      const gained = [];
      const requiredByRank = {};
      let unlockedNewRank = 0;
      let totalSlotGain = 0;

      for (let r = 1; r <= 10; r++) {
        const diff = (cur.slots[r] || 0) - (prev.slots[r] || 0);
        if (diff > 0) {
          gained.push(`+${diff} Rank ${r} slot${diff === 1 ? "" : "s"}`);
          requiredByRank[r] = diff;
          totalSlotGain += diff;
          if ((prev.slots[r] || 0) === 0) unlockedNewRank = Math.max(unlockedNewRank, r);
        }
      }

      const slug = String(src.classSlug || "").toLowerCase();
      const isSpellbookClass = src.sourceKind !== "archetype" && SPELLBOOK_CLASS_SLUGS.has(slug);
      const isSpontaneous = src.castingType === "spontaneous" && !(slug === "animist");
      const isSpellbookArchetype = src.sourceKind === "archetype" && SPELLBOOK_ARCHETYPE_SLUGS.has(slug);

      let learnMode = "optional";
      let requiredTotal = 0;
      if (lvl >= 2) {
        if (isSpellbookClass) {
          learnMode = "upto-rank";
          requiredTotal = 2;
        } else if (isSpontaneous || isSpellbookArchetype) {
          learnMode = "by-rank";
          requiredTotal = totalSlotGain;
        }
      }

      const signatureNote = (isSpontaneous && src.sourceKind !== "archetype" && lvl >= 3 && lvl % 2 === 1 && unlockedNewRank > 0)
        ? "+1 Signature Spell"
        : "";

      if (gained.length > 0 || (isSpellbookClass && lvl >= 2 && cur.maxRank > 0)) {
        const deltaText = gained.length > 0
          ? gained.join(", ")
          : `+2 Spellbook Spells (up to Rank ${cur.maxRank})`;
        notes.push({
          entryKey: src.key,
          entryId: src.entryId || null,
          title: src.title,
          classSlug: slug,
          sourceKind: src.sourceKind || "class",
          tradition: src.tradition || "",
          traditionLabel: src.isElementalist
            ? `Elemental (${TRADITION_LABELS[src.tradition] || "Any"})`
            : (TRADITION_LABELS[src.tradition] || "Any"),
          castingType: src.castingType,
          maxRank: cur.maxRank || 1,
          unlockedNewRank,
          deltaText,
          fullSlotsText: formatSlotsSummary(cur.slots),
          learnMode,
          requiredByRank,
          requiredTotal,
          signatureNote
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
/* 2B. DATA-DRIVEN RULE PROJECTION & FEAT CHOICESET ENGINE (ZERO HARDCODING) */
/* ------------------------------------------------------------------------- */

function slugToCamelCase(raw) {
  const s = normalizeSlug(raw);
  return s ? s.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase()) : "";
}

function getChoiceSetFlag(rule, itemSlugOrName, ruleIndex = 0) {
  if (typeof rule?.flag === "string" && rule.flag.trim()) return rule.flag.trim();
  const camel = slugToCamelCase(itemSlugOrName);
  return camel || `choice${ruleIndex}`;
}

function isLikelyCompendiumOrItemUuid(val) {
  return typeof val === "string" && /^(?:Compendium\.[^.]+\.[^.]+\.|Item\.)/i.test(val.trim());
}

function extractCompactItemMeta(doc, fallbackUuid = "") {
  if (!doc) return null;
  const uuid = doc.uuid || fallbackUuid || "";
  const slug = normalizeSlug(doc.slug || doc.system?.slug || doc.name);
  const traits = Array.isArray(doc.system?.traits?.value)
    ? doc.system.traits.value.map(normalizeSlug).filter(Boolean)
    : [];
  const rules = Array.isArray(doc.system?.rules) ? foundry.utils.deepClone(doc.system.rules) : [];
  const desc = String(doc.system?.description?.value || "");
  const level = Number(doc.system?.level?.value ?? 0);
  const category = String(doc.system?.category || "");
  return {
    uuid,
    name: String(doc.name || ""),
    slug,
    img: doc.img || "systems/pf2e/icons/default-icons/feat.svg",
    level: Number.isFinite(level) ? level : 0,
    category,
    traits,
    rules,
    description: desc,
    // Minimal PF2e doc-compatible shape so `collectActorGrantedSpellsProgression` can read planned focus feats seamlessly
    system: {
      slug,
      category,
      level: { value: Number.isFinite(level) ? level : 0 },
      traits: { value: traits },
      description: { value: desc },
      rules
    }
  };
}

/**
 * Fetches & caches lightweight metadata (`rules`, `traits`, `description`) for a single item UUID.
 */
export async function warmPlannerItemMeta(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  const clean = uuid.trim();
  if (!clean) return null;
  if (_plannerItemMetaCache.has(clean)) return _plannerItemMetaCache.get(clean);
  try {
    const doc = await fromUuid(clean);
    const meta = extractCompactItemMeta(doc, clean);
    _plannerItemMetaCache.set(clean, meta);
    return meta;
  } catch {
    _plannerItemMetaCache.set(clean, null);
    return null;
  }
}

/**
 * Lazily preloads `system.rules` for the actor's future class features + planned future feats
 * (and their nested sub-choice UUIDs) so `buildLevelRoadmap` stays 100% synchronous while
 * projecting class-feature proficiencies and feat ChoiceSets with zero hardcoded tables.
 */
export async function preloadPlannerProjectionData(actor, { effectiveCurrentLevel = null } = {}) {
  if (!actor || actor.type !== "character") return;

  const variants = getActiveVariantRules();
  const dualInfo = getActorDualClassInfo(actor, variants);
  const plan = getActorLevelPlan(actor);
  const liveLevel = Number.isFinite(effectiveCurrentLevel)
    ? Math.max(0, Math.min(20, Number(effectiveCurrentLevel)))
    : Math.max(1, Math.min(20, Number(actor.level ?? actor.system?.details?.level?.value ?? 1)));
  const uuidsToLoad = new Set();
  const allRelevantUuids = new Set();

  const queueUuid = (u) => {
    if (typeof u !== "string" || !u.trim()) return;
    const clean = u.trim();
    allRelevantUuids.add(clean);
    if (!_plannerItemMetaCache.has(clean)) {
      uuidsToLoad.add(clean);
    }
  };

  // 1. Future class features from Primary & Dual Class `system.items` (~8-15 per class)
  const queueClassItems = (itemsMap) => {
    if (!itemsMap || typeof itemsMap !== "object") return;
    for (const entry of Object.values(itemsMap)) {
      if (!entry?.uuid) continue;
      const lvl = Number(entry.level ?? 1);
      if (lvl > liveLevel) queueUuid(entry.uuid);
    }
  };
  queueClassItems(actor.class?.system?.items);
  queueClassItems(dualInfo?.system?.items);

  // 2. Planned future feats & any already-selected nested sub-choice feat UUIDs
  for (let l = liveLevel + 1; l <= 20; l++) {
    const lpFeats = plan.levels[String(l)]?.feats;
    if (!lpFeats || typeof lpFeats !== "object") continue;
    for (const fSnap of Object.values(lpFeats)) {
      if (fSnap?.uuid) queueUuid(fSnap.uuid);
      if (fSnap?.choices && typeof fSnap.choices === "object") {
        for (const ch of Object.values(fSnap.choices)) {
          if (ch?.value && isLikelyCompendiumOrItemUuid(ch.value)) queueUuid(ch.value);
        }
      }
    }
  }

  if (uuidsToLoad.size > 0) {
    await Promise.allSettled(Array.from(uuidsToLoad).map(u => warmPlannerItemMeta(u)));
  }

  // Second tiny pass: warm any uncached static UUID options inside ChoiceSet rules & static GrantItem UUIDs
  const secondaryUuids = new Set();
  for (const u of allRelevantUuids) {
    const meta = _plannerItemMetaCache.get(u);
    if (!meta?.rules) continue;
    for (const r of meta.rules) {
      if (r?.key === "GrantItem" && isLikelyCompendiumOrItemUuid(r.uuid) && !r.uuid.includes("{") && !_plannerItemMetaCache.has(r.uuid.trim())) {
        secondaryUuids.add(r.uuid.trim());
      }
      if (r?.key === "ChoiceSet" && Array.isArray(r.choices)) {
        for (const opt of r.choices) {
          if (isLikelyCompendiumOrItemUuid(opt?.value) && !_plannerItemMetaCache.has(opt.value.trim())) {
            secondaryUuids.add(opt.value.trim());
          }
        }
      }
    }
  }
  if (secondaryUuids.size > 0) {
    await Promise.allSettled(Array.from(secondaryUuids).map(u => warmPlannerItemMeta(u)));
  }
}

function splitTopLevelCommas(str) {
  const args = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      args.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = str.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

/**
 * Safely evaluates PF2e numeric / bracket / ternary / floor / ceil / arithmetic Rule Element
 * formulas (e.g. `ternary(gte(@actor.level,4),floor(@actor.level/2),1)`) with zero `eval()`.
 */
function evalPf2eNumericExpr(rawVal, { actorLevel = 1, itemLevel = 1 } = {}) {
  if (typeof rawVal === "number" && Number.isFinite(rawVal)) return rawVal;
  if (rawVal && typeof rawVal === "object") {
    if (Array.isArray(rawVal.brackets)) {
      for (const b of rawVal.brackets) {
        const start = b?.start != null ? Number(b.start) : -Infinity;
        const end = b?.end != null ? Number(b.end) : Infinity;
        if (actorLevel >= start && actorLevel <= end) {
          return evalPf2eNumericExpr(b.value, { actorLevel, itemLevel });
        }
      }
      return null;
    }
    if ("value" in rawVal) return evalPf2eNumericExpr(rawVal.value, { actorLevel, itemLevel });
    return null;
  }
  if (typeof rawVal !== "string") return null;
  const trimmed = rawVal.trim();
  if (!trimmed) return null;
  const directNum = Number(trimmed);
  if (Number.isFinite(directNum)) return directNum;

  const substituted = trimmed
    .replace(/\{actor\|(?:system\.details\.)?level(?:\.value)?\}/gi, String(actorLevel))
    .replace(/\{item\|(?:system\.)?level(?:\.value)?\}/gi, String(itemLevel))
    .replace(/@actor\.system\.details\.level\.value\b/gi, String(actorLevel))
    .replace(/@actor\.level\b/gi, String(actorLevel))
    .replace(/@item\.system\.level\.value\b/gi, String(itemLevel))
    .replace(/@item\.level\b/gi, String(itemLevel));

  const evalNode = (expr, depth = 0) => {
    if (depth > 14) return null;
    let s = String(expr || "").trim();
    if (!s) return null;

    // Strip matching outer parentheses
    while (s.startsWith("(") && s.endsWith(")")) {
      let d = 0;
      let wraps = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === "(") d++;
        else if (s[i] === ")") d--;
        if (d === 0 && i < s.length - 1) {
          wraps = false;
          break;
        }
      }
      if (!wraps) break;
      s = s.slice(1, -1).trim();
    }

    const asNum = Number(s);
    if (s !== "" && Number.isFinite(asNum)) return asNum;

    // Top-level binary + / - (rightmost outside parens, skipping unary leading sign)
    let paren = 0;
    for (let i = s.length - 1; i >= 1; i--) {
      const ch = s[i];
      if (ch === ")") paren++;
      else if (ch === "(") paren--;
      else if (paren === 0 && (ch === "+" || ch === "-")) {
        const prev = s.slice(0, i).trim();
        if (prev && !/[+\-*/(,]$/.test(prev)) {
          const lhs = evalNode(prev, depth + 1);
          const rhs = evalNode(s.slice(i + 1), depth + 1);
          if (lhs === null || rhs === null) return null;
          return ch === "+" ? lhs + rhs : lhs - rhs;
        }
      }
    }

    // Top-level binary * / /
    paren = 0;
    for (let i = s.length - 1; i >= 1; i--) {
      const ch = s[i];
      if (ch === ")") paren++;
      else if (ch === "(") paren--;
      else if (paren === 0 && (ch === "*" || ch === "/")) {
        const lhs = evalNode(s.slice(0, i), depth + 1);
        const rhs = evalNode(s.slice(i + 1), depth + 1);
        if (lhs === null || rhs === null) return null;
        if (ch === "/") return rhs === 0 ? null : lhs / rhs;
        return lhs * rhs;
      }
    }

    // Function calls: ternary, gte, gt, lte, lt, eq, min, max, floor, ceil, round
    const fnMatch = s.match(/^([a-z]+)\(([\s\S]*)\)$/i);
    if (!fnMatch) return null;
    const fn = fnMatch[1].toLowerCase();
    const args = splitTopLevelCommas(fnMatch[2]);

    if (fn === "ternary" && args.length === 3) {
      const cond = evalNode(args[0], depth + 1);
      return cond === null ? null : (cond ? evalNode(args[1], depth + 1) : evalNode(args[2], depth + 1));
    }
    if ((fn === "gte" || fn === "gt" || fn === "lte" || fn === "lt" || fn === "eq") && args.length === 2) {
      const a = evalNode(args[0], depth + 1);
      const b = evalNode(args[1], depth + 1);
      if (a === null || b === null) return null;
      if (fn === "gte") return a >= b ? 1 : 0;
      if (fn === "gt") return a > b ? 1 : 0;
      if (fn === "lte") return a <= b ? 1 : 0;
      if (fn === "lt") return a < b ? 1 : 0;
      return a === b ? 1 : 0;
    }
    if ((fn === "min" || fn === "max") && args.length >= 1) {
      const vals = args.map(a => evalNode(a, depth + 1));
      return vals.some(v => v === null) ? null : (fn === "min" ? Math.min(...vals) : Math.max(...vals));
    }
    if ((fn === "floor" || fn === "ceil" || fn === "round") && args.length === 1) {
      const v = evalNode(args[0], depth + 1);
      if (v === null) return null;
      return fn === "floor" ? Math.floor(v) : (fn === "ceil" ? Math.ceil(v) : Math.round(v));
    }
    return null;
  };

  return evalNode(substituted);
}

/**
 * Checks level-gated statements in a PF2e Rule Element predicate (e.g. `{ gte: ["self:level", 17] }`)
 * so level-scaling upgrades fire only at or after their exact target level.
 */
function passesLevelPredicate(predicate, evalLevel, selectionsMap = null) {
  if (!Array.isArray(predicate) || predicate.length === 0) return true;
  const evalStmt = (stmt) => {
    if (typeof stmt === "string") {
      const lvlExact = stmt.match(/^(?:self|actor):level:(\d+)$/i);
      if (lvlExact) return evalLevel === Number(lvlExact[1]);
      return true;
    }
    if (!stmt || typeof stmt !== "object") return true;
    if ("not" in stmt) {
      // Only negate if inner statement is level-based (avoid negating unknown runtime roll options!)
      const inner = stmt.not;
      if (typeof inner === "string" && /^(?:self|actor):level:/i.test(inner)) return !evalStmt(inner);
      if (inner && typeof inner === "object" && Object.keys(inner).some(k => ["gte", "gt", "lte", "lt", "eq"].includes(k))) {
        const pair = Object.values(inner)[0];
        if (Array.isArray(pair) && /^(?:self|actor):level$/i.test(String(pair[0] || ""))) return !evalStmt(inner);
      }
      return true;
    }
    if (Array.isArray(stmt.or)) return stmt.or.some(evalStmt);
    if (Array.isArray(stmt.and)) return stmt.and.every(evalStmt);
    for (const op of ["gte", "gt", "lte", "lt", "eq"]) {
      if (Array.isArray(stmt[op]) && stmt[op].length === 2) {
        const lhs = String(stmt[op][0] || "");
        const rhsRaw = stmt[op][1];
        if (/^(?:self|actor):level$/i.test(lhs)) {
          const rhs = Number(rhsRaw);
          if (!Number.isFinite(rhs)) return true;
          if (op === "gte") return evalLevel >= rhs;
          if (op === "gt") return evalLevel > rhs;
          if (op === "lte") return evalLevel <= rhs;
          if (op === "lt") return evalLevel < rhs;
          return evalLevel === rhs;
        }
        // Check flag-gated ChoiceSet predicates if selectionsMap is available
        const flagMatch = lhs.match(/^(?:item:)?flag:([a-z0-9_-]+)$/i);
        if (flagMatch && selectionsMap && flagMatch[1] in selectionsMap) {
          return String(selectionsMap[flagMatch[1]]) === String(rhsRaw);
        }
      }
    }
    return true;
  };
  return predicate.every(evalStmt);
}

/**
 * Applies PF2e `ActiveEffectLike` proficiency upgrades & cached `GrantItem` rules from a feat/classfeature
 * onto a running Level Planner projection state (`projState`). Zero hardcoded class tables!
 */
function applyRulesToPrereqState(rules, selectionsMap, evalLevel, projState, itemLevel = 1, { depth = 0, upgradeOnly = false, skipGrantItem = false } = {}) {
  if (!Array.isArray(rules) || rules.length === 0 || depth > 2) return;

  const resolvePlaceholders = (raw) => {
    if (typeof raw !== "string" || !raw.includes("{")) return raw;
    return raw.replace(/\{item\|flags\.(?:pf2e|system)\.rulesSelections\.([^}]+)\}/gi, (_, flagName) => {
      const v = selectionsMap?.[flagName];
      return v !== undefined && v !== null ? String(v) : "";
    });
  };

  const applyRankMode = (cur, target, mode) => {
    const cleanTarget = Math.max(0, Math.min(4, Math.trunc(target)));
    if (mode === "override") return cleanTarget;
    if (mode === "add") return Math.max(0, Math.min(4, cur + Math.trunc(target)));
    // Default ("upgrade"): only raise rank, never downgrade
    return Math.max(cur, cleanTarget);
  };

  for (const r of rules) {
    if (!r || typeof r !== "object") continue;
    if (!passesLevelPredicate(r.predicate, evalLevel, selectionsMap)) continue;

    if (r.key === "ActiveEffectLike" && typeof r.path === "string") {
      const resolvedPath = resolvePlaceholders(r.path).trim();
      if (!resolvedPath || resolvedPath.includes("{")) continue;
      const mode = String(r.mode || "upgrade").toLowerCase();
      if (mode !== "upgrade" && mode !== "override" && mode !== "add") continue;
      // On multi-level re-evaluation passes (live/earlier-planned items), only apply idempotent `"upgrade"` rules
      // so `"add"` never compounds every level and `"override"` never clobbers later planned Skill Increases!
      if (upgradeOnly && mode !== "upgrade") continue;

      const rawVal = typeof r.value === "string" ? resolvePlaceholders(r.value) : r.value;
      const numVal = evalPf2eNumericExpr(rawVal, { actorLevel: evalLevel, itemLevel });
      if (numVal === null || !Number.isFinite(numVal)) continue;

      if (/^system\.(?:attributes\.)?perception\.rank$/i.test(resolvedPath)) {
        projState.perceptionRank = applyRankMode(projState.perceptionRank, numVal, mode);
        continue;
      }
      const saveM = resolvedPath.match(/^system\.(?:proficiencies\.)?saves\.(fortitude|reflex|will)\.rank$/i);
      if (saveM) {
        const k = saveM[1].toLowerCase();
        projState.saveRanks[k] = applyRankMode(projState.saveRanks[k] || 0, numVal, mode);
        continue;
      }
      const defM = resolvedPath.match(/^system\.proficiencies\.defenses\.(unarmored|light|medium|heavy)\.rank$/i);
      if (defM) {
        const k = defM[1].toLowerCase();
        projState.armorRanks[k] = applyRankMode(projState.armorRanks[k] || 0, numVal, mode);
        continue;
      }
      const atkM = resolvedPath.match(/^system\.proficiencies\.attacks\.(unarmed|simple|martial|advanced)\.rank$/i);
      if (atkM) {
        const k = atkM[1].toLowerCase();
        projState.weaponRanks[k] = applyRankMode(projState.weaponRanks[k] || 0, numVal, mode);
        continue;
      }
      const skillM = resolvedPath.match(/^system\.skills\.([a-z-]+)\.rank$/i);
      if (skillM) {
        const k = skillM[1].toLowerCase();
        if (CORE_SKILL_SLUGS.includes(k)) {
          projState.skillRanks[k] = applyRankMode(projState.skillRanks[k] || 0, numVal, mode);
        }
        continue;
      }
    }

    if (!skipGrantItem && r.key === "GrantItem" && typeof r.uuid === "string") {
      const resolvedUuid = resolvePlaceholders(r.uuid).trim();
      if (!resolvedUuid || resolvedUuid.includes("{")) continue;
      const grantedMeta = _plannerItemMetaCache.get(resolvedUuid);
      if (grantedMeta) {
        projState.recordKnownFeatName?.(grantedMeta.name);
        applyRulesToPrereqState(grantedMeta.rules, {}, evalLevel, projState, grantedMeta.level || evalLevel, {
          depth: depth + 1,
          upgradeOnly
        });
      }
    }
  }
}

/**
 * Infers planned spellcasting tradition or focus pool unlocks from a planned feat's cached metadata
 * so later levels' prerequisite checks (e.g. "ability to cast arcane spells", "focus pool") see them.
 */
function applyPlannedSpellcastingProjection(meta, projState) {
  if (!meta) return;
  const desc = String(meta.description || "");
  if (!desc) return;
  const plain = desc.replace(/<[^>]+>/g, " ");
  if (/(?:don't|do\s+not)\s+(?:gain|receive)[^.]{0,50}\b(?:focus|spellcasting)\b/i.test(plain)) return;

  const tradM = plain.match(/\b(?:cast|gain|prepared|spontaneous)\s+(?:the\s+)?(arcane|divine|occult|primal)\s+(?:cantrips?|spells?|spellcasting)\b/i)
    || plain.match(/\b(arcane|divine|occult|primal)\s+spellcasting\s+(?:archetype|tradition|feature|ability)\b/i);
  if (tradM) {
    projState.spellcastingTraditions.add(tradM[1].toLowerCase());
    projState.isSpellcaster = true;
  } else if (/\byou\s+(?:become\s+a\s+spellcaster|gain\s+the\s+cast\s+a\s+spell\s+activity)\b/i.test(plain)) {
    projState.isSpellcaster = true;
  }

  if (/\b(?:focus\s+pool|gain\s+[^.]{0,60}(?:focus|warden|qi|ki|devotion|order|hex|school|bloodline|revelation|conflux|vessel|link|grave)\s+spell)\b/i.test(plain)) {
    projState.hasFocusPool = true;
  }
}

/**
 * Evaluates a PF2e `ChoiceSet` `choices.filter` predicate array against a lightweight feat index record.
 * Handles `item:category:*`, `item:trait:*`, `item:level:*`, `item:rarity:*`, `item:slug:*`,
 * `{actor|class.slug}` / `{actor|ancestry.slug}` substitution, `{ not }`, `{ or }`, `{ and }`,
 * and numeric comparisons (`lte`, `lt`, `gte`, `gt`, `eq` with `@actor.level` formulas like `floor(@actor.level/2)`).
 */
export function matchesChoiceSetFeatFilter(featRec, filterArr, { actor = null, slotLevel = 1 } = {}) {
  if (!featRec) return false;
  if (!Array.isArray(filterArr) || filterArr.length === 0) return true;

  const actorClassSlug = actor?.class ? normalizeSlug(actor.class.slug || actor.class.system?.slug || actor.class.name) : "";
  const actorAncSlug = actor?.ancestry ? normalizeSlug(actor.ancestry.slug || actor.ancestry.system?.slug || actor.ancestry.name) : "";
  const actorHerSlug = actor?.heritage ? normalizeSlug(actor.heritage.slug || actor.heritage.system?.slug || actor.heritage.name) : "";
  const featSlug = normalizeSlug(featRec.name);

  const subActorTokens = (s) => String(s || "")
    .replace(/\{actor\|class\.slug\}/gi, actorClassSlug)
    .replace(/\{actor\|ancestry\.slug\}/gi, actorAncSlug)
    .replace(/\{actor\|heritage\.slug\}/gi, actorHerSlug);

  const resolveOperand = (raw) => {
    if (typeof raw === "number") return raw;
    const str = String(raw || "").trim();
    if (str === "item:level") return Number(featRec.level ?? 0);
    return evalPf2eNumericExpr(str, { actorLevel: slotLevel });
  };

  // Tri-state evaluator (`true | false | null` where `null` = unknown/actor-runtime predicate)
  // so `{ not: "<unknown>" }` stays `null` (pass) instead of negating to `false` and hiding valid feats!
  const evalStmt = (stmt) => {
    if (typeof stmt === "string") {
      const token = subActorTokens(stmt).trim();
      if (!token) return null;
      if (token.startsWith("item:category:")) {
        return normalizeSlug(featRec.category) === normalizeSlug(token.slice("item:category:".length));
      }
      if (token.startsWith("item:trait:")) {
        const want = normalizeSlug(token.slice("item:trait:".length));
        if (!want) return null;
        return Array.isArray(featRec.traits) && featRec.traits.includes(want);
      }
      if (token.startsWith("item:level:")) {
        const wantLvl = evalPf2eNumericExpr(token.slice("item:level:".length), { actorLevel: slotLevel });
        return wantLvl === null ? null : Number(featRec.level ?? 0) === wantLvl;
      }
      if (token.startsWith("item:rarity:")) {
        return normalizeSlug(featRec.rarity || "common") === normalizeSlug(token.slice("item:rarity:".length));
      }
      if (token.startsWith("item:slug:")) {
        return featSlug === normalizeSlug(token.slice("item:slug:".length));
      }
      return null;
    }

    if (!stmt || typeof stmt !== "object") return null;
    if ("not" in stmt) {
      const inner = evalStmt(stmt.not);
      return inner === null ? null : !inner;
    }
    if (Array.isArray(stmt.or)) {
      const results = stmt.or.map(evalStmt);
      if (results.some(r => r === true)) return true;
      if (results.some(r => r === null)) return null;
      return false;
    }
    if (Array.isArray(stmt.and)) {
      const results = stmt.and.map(evalStmt);
      if (results.some(r => r === false)) return false;
      if (results.every(r => r === true)) return true;
      return null;
    }

    for (const op of ["lte", "lt", "gte", "gt", "eq"]) {
      if (Array.isArray(stmt[op]) && stmt[op].length === 2) {
        const a = resolveOperand(stmt[op][0]);
        const b = resolveOperand(stmt[op][1]);
        if (a === null || b === null) return null;
        if (op === "lte") return a <= b;
        if (op === "lt") return a < b;
        if (op === "gte") return a >= b;
        if (op === "gt") return a > b;
        return a === b;
      }
    }
    return null;
  };

  return filterArr.every(stmt => evalStmt(stmt) !== false);
}

function inferMaxLevelFromChoiceFilter(filterArr, slotLevel) {
  let maxLvl = slotLevel;
  if (!Array.isArray(filterArr)) return maxLvl;
  const visit = (stmt) => {
    if (typeof stmt === "string" && stmt.startsWith("item:level:")) {
      const n = evalPf2eNumericExpr(stmt.slice("item:level:".length), { actorLevel: slotLevel });
      if (n !== null && Number.isFinite(n)) maxLvl = Math.min(maxLvl, Math.floor(n));
    } else if (stmt && typeof stmt === "object") {
      if (Array.isArray(stmt.lte) && stmt.lte[0] === "item:level") {
        const n = evalPf2eNumericExpr(stmt.lte[1], { actorLevel: slotLevel });
        if (n !== null && Number.isFinite(n)) maxLvl = Math.min(maxLvl, Math.floor(n));
      } else if (Array.isArray(stmt.lt) && stmt.lt[0] === "item:level") {
        const n = evalPf2eNumericExpr(stmt.lt[1], { actorLevel: slotLevel });
        if (n !== null && Number.isFinite(n)) maxLvl = Math.min(maxLvl, Math.floor(n) - 1);
      } else if (Array.isArray(stmt.eq) && stmt.eq[0] === "item:level") {
        const n = evalPf2eNumericExpr(stmt.eq[1], { actorLevel: slotLevel });
        if (n !== null && Number.isFinite(n)) maxLvl = Math.min(maxLvl, Math.floor(n));
      } else if (Array.isArray(stmt.and)) {
        for (const sub of stmt.and) visit(sub);
      }
    }
  };
  for (const s of filterArr) visit(s);
  return Math.max(0, maxLvl);
}

function localizeChoiceText(raw, fallback = "") {
  const str = String(raw || "").trim();
  if (!str) return fallback;
  const loc = game.i18n?.localize?.(str);
  if (loc && loc !== str) return loc;
  if (/^PF2E\./i.test(str)) return fallback || str.split(".").pop() || "";
  return str;
}

function resolveUuidOptionLabel(uuid, rawLabel = "") {
  const loc = localizeChoiceText(rawLabel, "");
  if (loc && !isLikelyCompendiumOrItemUuid(loc)) return loc;
  const cached = _plannerItemMetaCache.get(uuid);
  if (cached?.name) return cached.name;
  if (Array.isArray(_featIndexCache)) {
    const hit = _featIndexCache.find(f => f.uuid === uuid);
    if (hit?.name) return hit.name;
  }
  const tail = String(uuid || "").split(".").pop() || "";
  return tail && !/^[A-Za-z0-9]{16}$/.test(tail) ? tail : (loc || uuid);
}

const BONUS_GRANT_CHOICE_FLAG = "__bonusGrantedFeat";

/**
 * Fallback for PF2e multiclass archetype feats that lack a native `ChoiceSet` rule in Foundry
 * (notably repeatable "Advanced <X>" feats like Advanced Deduction / Advanced Maneuver / Advanced Trickery,
 * whose description states "You gain one <class> feat... half your character level").
 * Zero hardcoded class lists — reads the target trait directly from the feat's live PF2e description.
 */
function extractVirtualBonusFeatSpec(meta, slotLevel, savedMap) {
  const rawDesc = String(meta?.description || "");
  if (!rawDesc) return null;

  let body = rawDesc.replace(/^\s*(?:<p[^>]*>\s*<(?:strong|b)[^>]*>\s*(?:Prerequisites?|Access|Frequency|Trigger|Requirements?|Cost)\b[\s\S]*?<\/p>\s*)+/i, "");
  body = body.replace(/^\s*<hr\b[^>]*>\s*/i, "");
  const specialIdx = body.search(/<p[^>]*>\s*<(?:strong|b)[^>]*>\s*Special\b/i);
  if (specialIdx >= 0) body = body.slice(0, specialIdx);
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;

  const halfLvlMatch = plain.match(
    /\byou\s+gain\s+(?:one|a|an)\s+([a-z][a-z\s-]{1,28}?)\s+feat\b[\s\S]{0,180}?\bhalf\s+your\s+(?:character\s+)?level\b/i
  );
  const basicLvlMatch = !halfLvlMatch && plain.match(
    /\byou\s+gain\s+(?:one|a|an)\s+1st-\s*or\s*2nd-level\s+([a-z][a-z\s-]{1,28}?)\s+feat\b/i
  );
  const m = halfLvlMatch || basicLvlMatch;
  if (!m) return null;

  const rawWords = String(m[1] || "")
    .toLowerCase()
    .replace(/\b(?:common|uncommon|additional|extra|bonus|class)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawWords) return null;

  const wantsImpulse = /\bimpulse\b/.test(rawWords);
  const baseWord = rawWords.replace(/\bimpulse\b/g, "").trim();
  const targetSlug = normalizeSlug(baseWord);
  if (!targetSlug || targetSlug === "archetype" || targetSlug === "dedication") return null;

  const maxLevel = halfLvlMatch ? Math.max(1, Math.floor(slotLevel / 2)) : 2;
  let filter = [];
  if (targetSlug === "general") {
    filter = [{ or: ["item:category:general", "item:category:skill"] }, { lte: ["item:level", maxLevel] }];
  } else if (targetSlug === "skill" || targetSlug === "ancestry") {
    filter = [`item:category:${targetSlug}`, { lte: ["item:level", maxLevel] }];
  } else {
    filter = ["item:category:class", `item:trait:${targetSlug}`, { lte: ["item:level", maxLevel] }];
    if (wantsImpulse) filter.push("item:trait:impulse");
  }

  const labelWord = capitalize(targetSlug.replace(/-/g, " "));
  const saved = savedMap?.[BONUS_GRANT_CHOICE_FLAG] || null;
  const savedVal = saved && typeof saved === "object" ? String(saved.value ?? "") : (typeof saved === "string" ? saved : "");

  return {
    kind: "feat-query",
    isFeatQuery: true,
    isSelect: false,
    isBonusGrant: true,
    flag: BONUS_GRANT_CHOICE_FLAG,
    ruleIndex: -1,
    prompt: `Bonus ${labelWord}${wantsImpulse ? " Impulse" : ""} Feat (Lv ≤ ${maxLevel})`,
    filter,
    maxLevel,
    filled: Boolean(savedVal),
    selection: savedVal ? {
      value: savedVal,
      uuid: savedVal,
      name: saved?.name || resolveUuidOptionLabel(savedVal),
      img: saved?.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number.isFinite(Number(saved?.level)) ? Number(saved.level) : null,
      isFeat: true,
      isDedication: Boolean(saved?.isDedication),
      prerequisites: Array.isArray(saved?.prerequisites) ? saved.prerequisites : []
    } : null
  };
}

/**
 * Inspects a planned feat's cached PF2e `ChoiceSet` rules (plus fallback for repeatable
 * half-level multiclass archetype feats lacking a native ChoiceSet) and returns lightweight
 * interactive sub-choice descriptors joined with any already-planned selection.
 */
export function extractFeatChoiceSpecs(meta, { actor = null, slotLevel = 1, plannedChoices = null } = {}) {
  if (!meta) return [];
  const rules = Array.isArray(meta.rules) ? meta.rules : [];
  const savedMap = plannedChoices && typeof plannedChoices === "object" ? plannedChoices : {};
  const specs = [];
  const usedFlags = new Set();

  // Build quick selections map from already-saved choices so predicate-gated second ChoiceSets work
  const currentSelections = {};
  for (const [k, v] of Object.entries(savedMap)) {
    if (v && typeof v === "object" && v.value !== undefined) currentSelections[k] = v.value;
    else if (typeof v === "string") currentSelections[k] = v;
  }

  for (let idx = 0; idx < rules.length; idx++) {
    const r = rules[idx];
    if (!r || r.key !== "ChoiceSet") continue;
    // Skip pre-locked ChoiceSets (PF2e already fixed selection) or runtime inventory/attack queries
    if (r.selection !== undefined && r.selection !== null && r.selection !== "") continue;
    if (!r.choices) continue;
    if (!passesLevelPredicate(r.predicate, slotLevel, currentSelections)) continue;

    if (typeof r.choices === "object" && !Array.isArray(r.choices)) {
      if (r.choices.ownedItems || r.choices.attacks || r.choices.unarmedAttacks || r.choices.spellcasting) continue;
    }

    let flag = getChoiceSetFlag(r, meta.slug || meta.name, idx);
    if (usedFlags.has(flag)) flag = `${flag}_${idx}`;
    usedFlags.add(flag);

    const saved = savedMap[flag] || null;
    const savedVal = saved && typeof saved === "object" ? String(saved.value ?? "") : (typeof saved === "string" ? saved : "");

    // Type 1: Feat Compendium Query (Basic/Advanced Deduction, General Training, Natural Ambition, Multitalented, etc.)
    const isFeatQuery = typeof r.choices === "object" && !Array.isArray(r.choices) && (
      r.choices.itemType === "feat"
      || (Array.isArray(r.choices.filter) && r.choices.filter.some(s => typeof s === "string" && (s === "item:type:feat" || s.startsWith("item:category:"))))
    );
    if (isFeatQuery) {
      const combinedFilter = [
        ...(Array.isArray(r.choices.filter) ? r.choices.filter : []),
        ...(Array.isArray(r.choices.postFilter) ? r.choices.postFilter : [])
      ];
      const maxLevel = inferMaxLevelFromChoiceFilter(combinedFilter, slotLevel);
      const prompt = localizeChoiceText(r.prompt, `Choose Feat (Lv ≤ ${maxLevel})`);
      specs.push({
        kind: "feat-query",
        isFeatQuery: true,
        isSelect: false,
        flag,
        ruleIndex: idx,
        prompt,
        filter: combinedFilter,
        maxLevel,
        filled: Boolean(savedVal),
        selection: savedVal ? {
          value: savedVal,
          uuid: savedVal,
          name: saved?.name || resolveUuidOptionLabel(savedVal),
          img: saved?.img || "systems/pf2e/icons/default-icons/feat.svg",
          level: Number.isFinite(Number(saved?.level)) ? Number(saved.level) : null,
          isFeat: true,
          isDedication: Boolean(saved?.isDedication),
          prerequisites: Array.isArray(saved?.prerequisites) ? saved.prerequisites : []
        } : null
      });
      continue;
    }

    // Type 2: Explicit static choices array (e.g. Canny Acumen, Domain/Element/Fixed Feat lists)
    if (Array.isArray(r.choices) && r.choices.length >= 2) {
      const options = [];
      for (const opt of r.choices) {
        if (!opt || opt.value === undefined || opt.value === null) continue;
        if (!passesLevelPredicate(opt.predicate, slotLevel, currentSelections)) continue;
        const val = String(opt.value);
        const isUuid = isLikelyCompendiumOrItemUuid(val);
        const label = isUuid ? resolveUuidOptionLabel(val, opt.label) : localizeChoiceText(opt.label, capitalize(val));
        options.push({
          value: val,
          label,
          isUuid,
          selected: val === savedVal
        });
      }
      if (options.length >= 2) {
        const prompt = localizeChoiceText(r.prompt, "Choose Option");
        const matchedOpt = options.find(o => o.value === savedVal);
        specs.push({
          kind: "select",
          isFeatQuery: false,
          isSelect: true,
          flag,
          ruleIndex: idx,
          prompt,
          options,
          filled: Boolean(savedVal),
          selection: savedVal ? {
            value: savedVal,
            uuid: matchedOpt?.isUuid ? savedVal : null,
            name: saved?.name || matchedOpt?.label || savedVal,
            isFeat: Boolean(matchedOpt?.isUuid)
          } : null
        });
      }
      continue;
    }

    // Type 3: PF2e CONFIG map (e.g. `{ config: "skills" }`, `{ config: "languages" }`, `{ config: "weaponGroups" }`)
    const cfgKey = typeof r.choices === "string"
      ? r.choices
      : (typeof r.choices?.config === "string" ? r.choices.config : "");
    const cfgMap = cfgKey ? CONFIG.PF2E?.[cfgKey] : null;
    if (cfgMap && typeof cfgMap === "object") {
      const options = [];
      for (const [k, v] of Object.entries(cfgMap)) {
        const rawLbl = typeof v === "string" ? v : (v?.label || k);
        const label = localizeChoiceText(rawLbl, capitalize(k.replace(/-/g, " ")));
        options.push({
          value: k,
          label,
          isUuid: false,
          selected: k === savedVal
        });
      }
      options.sort((a, b) => a.label.localeCompare(b.label));
      if (options.length >= 2 && options.length <= 200) {
        const prompt = localizeChoiceText(r.prompt, `Choose ${capitalize(cfgKey)}`);
        const matchedOpt = options.find(o => o.value === savedVal);
        specs.push({
          kind: "select",
          isFeatQuery: false,
          isSelect: true,
          flag,
          ruleIndex: idx,
          prompt,
          configKey: cfgKey,
          options,
          filled: Boolean(savedVal),
          selection: savedVal ? {
            value: savedVal,
            uuid: null,
            name: saved?.name || matchedOpt?.label || capitalize(savedVal),
            isFeat: false
          } : null
        });
      }
    }
  }

  // Fallback for PF2e multiclass feats lacking a ChoiceSet rule (e.g. "Advanced Deduction" / "Advanced Maneuver")
  if (!specs.some(s => s.isFeatQuery)) {
    const bonusSpec = extractVirtualBonusFeatSpec(meta, slotLevel, savedMap);
    if (bonusSpec) specs.push(bonusSpec);
  }

  return specs;
}

/**
 * Extracts already-chosen live ChoiceSet selections from an embedded actor feat so reverting
 * a character to an earlier level preserves nested feat/skill choices cleanly in the Build Plan.
 */
function extractLiveFeatChoicesForRevert(actor, liveDoc) {
  if (!liveDoc) return null;
  const rules = Array.isArray(liveDoc.system?.rules) ? liveDoc.system.rules : [];
  const sels = liveDoc.flags?.pf2e?.rulesSelections || {};
  const out = {};
  let count = 0;

  // Map granted child items by source UUID or name so we can snapshot name/img/level for feat choices
  const grantedChildren = (actor?.itemTypes?.feat || []).filter(f => f.flags?.pf2e?.grantedBy?.id === liveDoc.id);
  const usedFlags = new Set();

  for (let idx = 0; idx < rules.length; idx++) {
    const r = rules[idx];
    if (!r || r.key !== "ChoiceSet") continue;
    let flag = getChoiceSetFlag(r, liveDoc.slug || liveDoc.system?.slug || liveDoc.name, idx);
    if (usedFlags.has(flag)) flag = `${flag}_${idx}`;
    usedFlags.add(flag);
    const rawVal = r.selection ?? sels[flag];
    if (rawVal === undefined || rawVal === null || rawVal === "") continue;
    const val = String(rawVal);
    const isUuid = isLikelyCompendiumOrItemUuid(val);

    if (isUuid) {
      const child = grantedChildren.find(c =>
        (c._stats?.compendiumSource || c.flags?.core?.sourceId) === val
      ) || null;
      const childTraits = Array.isArray(child?.system?.traits?.value) ? child.system.traits.value.map(normalizeSlug) : [];
      out[flag] = {
        value: val,
        name: child?.name || resolveUuidOptionLabel(val),
        img: child?.img || "systems/pf2e/icons/default-icons/feat.svg",
        level: Number(child?.system?.level?.value ?? 0),
        isFeat: true,
        isDedication: childTraits.includes("dedication") || /\bdedication\b/i.test(child?.name || ""),
        prerequisites: (child?.system?.prerequisites?.value || []).map(p => p?.value || p).filter(Boolean)
      };
      count++;
    } else {
      out[flag] = {
        value: val,
        name: capitalize(val.replace(/^system\.(?:attributes\.|skills\.)?|\.rank$/gi, "").replace(/-/g, " ")),
        isFeat: false
      };
      count++;
    }
  }

  // Also capture any planner-granted Bonus Feat linked to this parent feat (e.g. Advanced Deduction -> Bonus Feat)
  const linkedBonus = (actor?.itemTypes?.feat || []).find(f => f.flags?.[MODULE_ID]?.bonusGrantParentId === liveDoc.id);
  if (linkedBonus && !out[BONUS_GRANT_CHOICE_FLAG]) {
    const { uuid: bonusUuid } = resolveReusableSourceUuid(linkedBonus, "feat");
    if (bonusUuid) {
      const bonusTraits = Array.isArray(linkedBonus.system?.traits?.value) ? linkedBonus.system.traits.value.map(normalizeSlug) : [];
      out[BONUS_GRANT_CHOICE_FLAG] = {
        value: bonusUuid,
        name: linkedBonus.name,
        img: linkedBonus.img || "systems/pf2e/icons/default-icons/feat.svg",
        level: Number(linkedBonus.system?.level?.value ?? 0),
        isFeat: true,
        isDedication: bonusTraits.includes("dedication") || /\bdedication\b/i.test(linkedBonus.name || ""),
        prerequisites: (linkedBonus.system?.prerequisites?.value || []).map(p => p?.value || p).filter(Boolean)
      };
      count++;
    }
  }

  return count > 0 ? out : null;
}

/* ------------------------------------------------------------------------- */
/* 3. MASTER LEVEL 1-20 ROADMAP BUILDER                                      */
/* ------------------------------------------------------------------------- */

/**
 * Builds the complete Level 1–20 Build Roadmap for a character actor, combining:
 *  - Live sheet data for Levels 1..currentLevel
 *  - Planned flag data + projected Attributes, INT Bonuses, Skills & Formulas for Levels (currentLevel+1)..20
 *  - Auto-read Class Features (Primary + Dual Class) across all 20 levels
 *  - Active variant rules (Dual Class, Free Archetype, Ancestry Paragon, Gradual Boosts)
 *
 * @param {Actor} actor
 * @param {{ effectiveCurrentLevel?: number }} [options]
 * @returns {object|null}
 */
export function buildLevelRoadmap(actor, options = {}) {
  if (!actor || actor.type !== "character") return null;

  const liveLevel = Math.max(1, Math.min(20, Number(actor.level ?? actor.system?.details?.level?.value ?? 1)));
  const currentLevel = Number.isFinite(options?.effectiveCurrentLevel)
    ? Math.max(0, Math.min(20, Number(options.effectiveCurrentLevel)))
    : liveLevel;
  const variants = getActiveVariantRules();
  const dualInfo = getActorDualClassInfo(actor, variants);
  const plan = getActorLevelPlan(actor);
  const checkerReport = analyzeCharacter(actor);

  const pClass = actor.class;
  const pSys = pClass?.system || {};
  const dSys = dualInfo?.system || null;
  const primaryName = pClass?.name || "Primary Class";
  const primarySlug = pClass ? normalizeSlug(pClass.slug || pClass.system?.slug || pClass.name) : "";
  const dualName = dualInfo?.name || "";
  const dualSlug = dualInfo?.slug || "";
  const isAlchemist = primarySlug === "alchemist" || dualSlug === "alchemist";
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
  const knownFeatBaseNamesLower = new Set();
  const knownDedicationsMap = new Map();
  const recordKnownFeatName = (rawName) => {
    const clean = String(rawName || "").trim().toLowerCase();
    if (!clean) return;
    knownFeatNamesLower.add(clean);
    const base = clean.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (base) knownFeatBaseNamesLower.add(base);
  };
  for (const feat of actor.itemTypes?.feat || []) {
    const fName = String(feat.name || "").trim();
    recordKnownFeatName(fName);
    const fCat = feat.system?.category || "";
    const fTraits = toStringArray(feat.system?.traits?.value).map(normalizeSlug);
    if (fCat !== "classfeature" && fCat !== "ancestryfeature" && (fTraits.includes("dedication") || /\bdedication\b/i.test(fName))) {
      const desc = makeDedicationDescriptor(fName, feat.slug || feat.system?.slug);
      if (desc.nameLower) knownDedicationsMap.set(desc.nameLower, desc);
    }
    const loc = feat.system?.location;
    if (typeof loc === "string" && loc) {
      liveFeatsBySlotKey.set(loc, feat);
    }
  }
  if (actor.heritage?.name) {
    recordKnownFeatName(actor.heritage.name);
    const herSlug = normalizeSlug(actor.heritage.slug || actor.heritage.system?.slug || actor.heritage.name);
    for (const alias of ANCESTRY_HERITAGE_TRAIT_EXPANSIONS[herSlug] || []) {
      recordKnownFeatName(alias.replace(/-/g, " "));
      recordKnownFeatName(alias);
    }
  }
  if (actor.ancestry?.name) {
    recordKnownFeatName(actor.ancestry.name);
    const ancSlug = normalizeSlug(actor.ancestry.slug || actor.ancestry.system?.slug || actor.ancestry.name);
    for (const alias of ANCESTRY_HERITAGE_TRAIT_EXPANSIONS[ancSlug] || []) {
      recordKnownFeatName(alias.replace(/-/g, " "));
      recordKnownFeatName(alias);
    }
  }
  if (actor.class?.name) recordKnownFeatName(actor.class.name);
  if (dualInfo?.name) recordKnownFeatName(dualInfo.name);
  // Also scan `actor.feats` groups directly (most authoritative mapping for PF2e v14!)
  if (actor.feats && typeof actor.feats.values === "function") {
    for (const group of actor.feats.values()) {
      for (const slot of extractGroupSlots(group)) {
        if (slot?.feat && slot?.level) {
          const k = `${group.id}-${slot.level}`;
          if (!liveFeatsBySlotKey.has(k)) liveFeatsBySlotKey.set(k, slot.feat);
        }
      }
    }
  }

  // 4. Spellcasting milestones & dynamically discovered Subclass / Focus / Deity auto-spells across Levels 1-20
  const spellMilestones = computeSpellMilestonesByLevel(checkerReport);

  // Collect planned future feat slugs -> level (plus cached docs for planned focus feats & nested sub-choices)
  // so planned feats like Advanced Bloodline, Initiate Warden, or Advanced Warden preview immediately at that level!
  const plannedFeatLevelsBySlug = new Map();
  const plannedFeatDocs = [];
  for (let l = currentLevel + 1; l <= 20; l++) {
    const lpFeats = plan.levels[String(l)]?.feats;
    if (!lpFeats || typeof lpFeats !== "object") continue;
    for (const fSnap of Object.values(lpFeats)) {
      if (!fSnap?.name) continue;
      const slug = normalizeSlug(fSnap.name);
      if (slug && !plannedFeatLevelsBySlug.has(slug)) {
        plannedFeatLevelsBySlug.set(slug, l);
      }
      if (fSnap.uuid) {
        const cachedDoc = _plannerItemMetaCache.get(fSnap.uuid);
        if (cachedDoc) plannedFeatDocs.push({ doc: cachedDoc, level: l });
      }
      if (fSnap.choices && typeof fSnap.choices === "object") {
        for (const ch of Object.values(fSnap.choices)) {
          if (ch?.name) {
            const chSlug = normalizeSlug(ch.name);
            if (chSlug && !plannedFeatLevelsBySlug.has(chSlug)) plannedFeatLevelsBySlug.set(chSlug, l);
          }
          if (ch?.value && isLikelyCompendiumOrItemUuid(ch.value)) {
            const chDoc = _plannerItemMetaCache.get(ch.value);
            if (chDoc) plannedFeatDocs.push({ doc: chDoc, level: l });
          }
        }
      }
    }
  }

  const grantedProgression = collectActorGrantedSpellsProgression(actor, dualInfo, {
    plannedFeatLevelsBySlug,
    plannedFeatDocs
  });
  const autoSpellsByLevel = {};
  for (const sp of grantedProgression.autoSpells || []) {
    const uLvl = Math.max(1, Math.min(20, Number(sp.unlockLevel || 1)));
    if (!autoSpellsByLevel[uLvl]) autoSpellsByLevel[uLvl] = [];
    autoSpellsByLevel[uLvl].push({
      ...sp,
      rankLabel: sp.isFocus ? "Focus" : (sp.isCantrip ? "Cantrip" : `Rank ${sp.rank || 1}`)
    });
  }

  const sourceTraditionByKey = new Map();
  for (const src of checkerReport?.spellcasting?.sources || []) {
    if (src?.key) sourceTraditionByKey.set(src.key, src.tradition || "");
  }

  const choiceGroupsByLevel = {};
  for (const g of grantedProgression.choiceGroups || []) {
    const uLvl = Math.max(1, Math.min(20, Number(g.unlockLevel || 1)));
    if (!choiceGroupsByLevel[uLvl]) choiceGroupsByLevel[uLvl] = [];
    choiceGroupsByLevel[uLvl].push({
      ...g,
      tradition: sourceTraditionByKey.get(g.targetSourceKey) || g.fallbackTradition || ""
    });
  }

  // Index live actor spell UUIDs & names so past/current curriculum choices show live completion state
  const liveSpellUuids = new Set();
  const liveSpellNames = new Set();
  for (const sp of actor.itemTypes?.spell || []) {
    const cSrc = sp._stats?.compendiumSource || sp.flags?.core?.sourceId;
    if (typeof cSrc === "string" && cSrc.trim()) liveSpellUuids.add(cSrc.trim().toLowerCase());
    if (sp.name) liveSpellNames.add(String(sp.name).trim().toLowerCase());
  }

  // 5. Running Projections for Attributes, Skills, Proficiencies & Spellcasting across Levels 1-20
  const projectedBoostCounts = getBaseBoostCounts(actor, currentLevel, dualInfo);
  const projectedSkillRanks = {};
  for (const slug of CORE_SKILL_SLUGS) {
    projectedSkillRanks[slug] = Number(actor.system?.skills?.[slug]?.rank ?? 0);
  }
  let projectedMaxLoreRank = 0;
  for (const lore of actor.itemTypes?.lore || []) {
    projectedMaxLoreRank = Math.max(projectedMaxLoreRank, Number(lore.system?.proficient?.value ?? 1));
  }
  const projState = {
    skillRanks: projectedSkillRanks,
    perceptionRank: Number(actor.system?.perception?.rank ?? 0),
    armorRanks: {
      unarmored: Number(actor.system?.proficiencies?.defenses?.unarmored?.rank ?? 0),
      light: Number(actor.system?.proficiencies?.defenses?.light?.rank ?? 0),
      medium: Number(actor.system?.proficiencies?.defenses?.medium?.rank ?? 0),
      heavy: Number(actor.system?.proficiencies?.defenses?.heavy?.rank ?? 0)
    },
    weaponRanks: {
      unarmed: Number(actor.system?.proficiencies?.attacks?.unarmed?.rank ?? 0),
      simple: Number(actor.system?.proficiencies?.attacks?.simple?.rank ?? 0),
      martial: Number(actor.system?.proficiencies?.attacks?.martial?.rank ?? 0),
      advanced: Number(actor.system?.proficiencies?.attacks?.advanced?.rank ?? 0)
    },
    saveRanks: {
      fortitude: Number(actor.system?.saves?.fortitude?.rank ?? 0),
      reflex: Number(actor.system?.saves?.reflex?.rank ?? 0),
      will: Number(actor.system?.saves?.will?.rank ?? 0)
    },
    spellcastingTraditions: new Set(),
    isSpellcaster: false,
    hasFocusPool: false,
    recordKnownFeatName
  };
  for (const src of checkerReport?.spellcasting?.sources || []) {
    if (src?.tradition) projState.spellcastingTraditions.add(String(src.tradition).toLowerCase());
  }
  for (const entry of actor.itemTypes?.spellcastingEntry || []) {
    const t = entry.system?.tradition?.value;
    if (t) projState.spellcastingTraditions.add(String(t).toLowerCase());
  }
  projState.isSpellcaster = projState.spellcastingTraditions.size > 0
    || Boolean(checkerReport?.spellcasting?.hasExpectedSources)
    || (actor.itemTypes?.spellcastingEntry?.length || 0) > 0;
  projState.hasFocusPool = Number(actor.system?.resources?.focus?.max ?? 0) > 0
    || (checkerReport?.spellcasting?.sources || []).some(s => Boolean(s.isFocus));
  const baseHasDeity = Boolean(actor.deity);

  // Track live feats & earlier planned feats with ActiveEffectLike rules so level-scaling upgrades
  // (e.g. Canny Acumen Lv 17, Acrobat Dedication Lv 7/15) automatically fire at their exact future levels!
  const liveScalingRuleItems = [];
  for (const f of actor.itemTypes?.feat || []) {
    const rules = Array.isArray(f.system?.rules) ? f.system.rules : [];
    if (!rules.some(r => r?.key === "ActiveEffectLike")) continue;
    const sels = { ...(f.flags?.pf2e?.rulesSelections || {}) };
    for (let idx = 0; idx < rules.length; idx++) {
      const r = rules[idx];
      if (r?.key === "ChoiceSet" && r.selection !== undefined && r.selection !== null && r.selection !== "") {
        const fl = getChoiceSetFlag(r, f.slug || f.system?.slug || f.name, idx);
        if (!(fl in sels)) sels[fl] = r.selection;
      }
    }
    liveScalingRuleItems.push({ rules, selectionsMap: sels, itemLevel: Number(f.system?.level?.value ?? 1) });
  }
  const plannedRuleItemsSoFar = [];

  const snapshotPrereqState = () => {
    const attrMods = {};
    for (const a of ABILITY_KEYS) {
      attrMods[a] = computeModFromBoostCount(projectedBoostCounts[a] || 0).mod;
    }
    return {
      skillRanks: { ...projectedSkillRanks },
      attrMods,
      maxLoreRank: projectedMaxLoreRank,
      perceptionRank: projState.perceptionRank,
      armorRanks: { ...projState.armorRanks },
      weaponRanks: { ...projState.weaponRanks },
      saveRanks: { ...projState.saveRanks },
      spellcastingTraditions: new Set(projState.spellcastingTraditions),
      isSpellcaster: projState.isSpellcaster,
      hasFocusPool: projState.hasFocusPool,
      hasDeity: baseHasDeity,
      knownFeatNamesLower: new Set(knownFeatNamesLower),
      knownFeatBaseNamesLower: new Set(knownFeatBaseNamesLower)
    };
  };

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
  const buildFeatSlot = (groupId, groupLabel, category, traits, slotLevel, isFuture, levelPlanData, activeDedications = [], levelPrereqState = null) => {
    const slotKey = `${groupId}-${slotLevel}`;
    const liveFeat = liveFeatsBySlotKey.get(slotKey) || null;
    const rawPlanned = levelPlanData?.feats?.[slotKey];
    const plannedFeat = rawPlanned && (rawPlanned.uuid || rawPlanned.itemData) ? rawPlanned : null;

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

    const slotPrereq = levelPrereqState || snapshotPrereqState();
    const warnings = checkPlannedFeatPrereqs(plannedFeat, slotLevel, slotPrereq);
    if (plannedFeat?.name) {
      recordKnownFeatName(plannedFeat.name);
    }

    // Extract any interactive PF2e ChoiceSet sub-choices (e.g. Basic/Advanced Deduction, General Training, Natural Ambition, Skill Training)
    const cachedMeta = plannedFeat?.uuid ? _plannerItemMetaCache.get(plannedFeat.uuid) : null;
    const subChoices = cachedMeta
      ? extractFeatChoiceSpecs(cachedMeta, { actor, slotLevel, plannedChoices: plannedFeat.choices })
      : [];

    for (const sc of subChoices) {
      if (sc.filled && sc.selection?.isFeat) {
        if (sc.selection.name) recordKnownFeatName(sc.selection.name);
        const subWarn = checkPlannedFeatPrereqs(
          { level: sc.selection.level ?? 0, prerequisites: sc.selection.prerequisites || [] },
          sc.maxLevel ?? slotLevel,
          slotPrereq
        );
        for (const w of subWarn) {
          warnings.push(`${sc.selection.name}: ${w}`);
        }
      }
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
      subChoices,
      hasSubChoices: subChoices.length > 0,
      warnings,
      hasWarnings: warnings.length > 0
    };
  };

  // 6. Build all 20 Level Rows!
  const levels = [];
  const liveAttrBoosts = actor.system?.build?.attributes?.boosts || {};
  const knownLanguageSlugs = new Set(
    (Array.isArray(actor.system?.details?.languages?.value) ? actor.system.details.languages.value : [])
      .map(s => String(s || "").toLowerCase())
      .filter(Boolean)
  );

  for (let lvl = 1; lvl <= 20; lvl++) {
    const isPast = lvl < currentLevel;
    const isCurrent = lvl === currentLevel;
    const isNextLevel = lvl === currentLevel + 1;
    const isFuture = lvl > currentLevel;
    const lp = plan.levels[String(lvl)] || createEmptyLevelPlanEntry();

    // 0. Forward-project auto-granted Class Features at this future level + level-scaling rules from
    //    live & earlier-planned feats (e.g. Rogue Lv 7 Perception Mastery, Fighter Weapon Mastery, Canny Acumen Lv 17)
    if (isFuture) {
      for (const cf of classFeaturesByLevel[lvl] || []) {
        if (cf?.name) recordKnownFeatName(cf.name);
        const cfMeta = cf?.uuid ? _plannerItemMetaCache.get(cf.uuid) : null;
        if (cfMeta) {
          applyRulesToPrereqState(cfMeta.rules, {}, lvl, projState, lvl);
          if (cfMeta.rules.some(r => r?.key === "ActiveEffectLike" && String(r.mode || "upgrade").toLowerCase() === "upgrade")) {
            plannedRuleItemsSoFar.push({ rules: cfMeta.rules, selectionsMap: {}, itemLevel: lvl });
          }
        }
      }
      for (const liveItem of liveScalingRuleItems) {
        applyRulesToPrereqState(liveItem.rules, liveItem.selectionsMap, lvl, projState, liveItem.itemLevel, { upgradeOnly: true });
      }
      for (const prevPlanned of plannedRuleItemsSoFar) {
        applyRulesToPrereqState(prevPlanned.rules, prevPlanned.selectionsMap, lvl, projState, prevPlanned.itemLevel, { upgradeOnly: true });
      }
    }

    // Snapshot INT modifier BEFORE applying this level's boosts (handles partial boosts accurately!)
    const prevIntMod = computeModFromBoostCount(projectedBoostCounts.int || 0).mod;

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

    // A2. INT Modifier Increase Bonus (+1 Trained Skill & +1 Language on actual modifier gain!)
    const newIntMod = computeModFromBoostCount(projectedBoostCounts.int || 0).mod;
    const intModGain = isFuture ? Math.max(0, newIntMod - prevIntMod) : 0;
    const hasIntBonus = intModGain > 0;
    let intBonusInfo = null;
    if (hasIntBonus) {
      const rawIntSkill = typeof lp.intBonusSkill === "string" ? lp.intBonusSkill : "";
      const chosenSkill = (rawIntSkill === "__lore__" || CORE_SKILL_SLUGS.includes(rawIntSkill)) ? rawIntSkill : "";
      const chosenLanguage = typeof lp.intBonusLanguage === "string" ? lp.intBonusLanguage.trim() : "";

      const skillOptions = [];
      let chosenLabel = "";
      let chosenValid = true;

      for (const slug of CORE_SKILL_SLUGS) {
        const curRank = Number(projectedSkillRanks[slug] ?? 0);
        const isChosen = slug === chosenSkill;
        if (curRank > 0 && !isChosen) continue;
        const lbl = curRank > 0
          ? `${capitalize(slug)} (Already ${RANK_FULL[curRank]})`
          : `${capitalize(slug)} (U → T)`;
        if (isChosen) {
          chosenLabel = lbl;
          if (curRank > 0) chosenValid = false;
        }
        skillOptions.push({
          slug,
          label: lbl,
          selected: isChosen,
          invalid: curRank > 0
        });
      }

      const isLoreChosen = chosenSkill === "__lore__";
      if (isLoreChosen) chosenLabel = "New Lore Skill (add on sheet)";
      skillOptions.push({
        slug: "__lore__",
        label: "New Lore Skill (add on sheet)",
        selected: isLoreChosen,
        invalid: false
      });

      // Advance projected skill rank immediately BEFORE Skill Increase & Feat Prerequisite checks!
      if (chosenSkill === "__lore__") {
        projectedMaxLoreRank = Math.max(projectedMaxLoreRank, 1);
      } else if (chosenSkill && chosenValid) {
        projectedSkillRanks[chosenSkill] = 1;
      }

      const languageOptions = getAvailableLanguageChoices(knownLanguageSlugs);
      const matchedLangSlug = resolveLanguageSlug(chosenLanguage);
      if (matchedLangSlug) knownLanguageSlugs.add(matchedLangSlug);

      intBonusInfo = {
        gain: intModGain,
        fromMod: prevIntMod,
        toMod: newIntMod,
        fromModStr: `${prevIntMod >= 0 ? "+" : ""}${prevIntMod}`,
        toModStr: `${newIntMod >= 0 ? "+" : ""}${newIntMod}`,
        chosenSkill,
        chosenLabel,
        chosenValid,
        chosenLanguage,
        isLoreChosen,
        languageOptions,
        complete: Boolean(chosenSkill) && chosenValid,
        skillOptions
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
    // Snapshot dedications & projected prereq state already active (live on sheet + planned up through this level)
    const activeDedications = Array.from(knownDedicationsMap.values());
    const levelPrereqState = snapshotPrereqState();
    const featSlots = [];

    if (ancestryLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("ancestry", "Ancestry Feat", "ancestry", actorAncestryTraits, lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (ancestryParagonLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("ancestryparagon", "Ancestry Paragon", "ancestry", actorAncestryTraits, lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (classFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("class", `${primaryName} Feat`, "class", actorPrimaryClassTraits, lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (dualClassFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("dualclass", `${dualName} Feat (Dual)`, "class", actorDualClassTraits, lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (freeArchetypeLevels.includes(lvl)) {
      const archBrowserTraits = activeDedications.length > 0 ? ["archetype"] : ["dedication"];
      featSlots.push(buildFeatSlot("archetype", "Free Archetype", "class", archBrowserTraits, lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (skillFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("skill", "Skill Feat", "skill", [], lvl, isFuture, lp, activeDedications, levelPrereqState));
    }
    if (generalFeatLevels.includes(lvl)) {
      featSlots.push(buildFeatSlot("general", "General Feat", "general", [], lvl, isFuture, lp, activeDedications, levelPrereqState));
    }

    // Record any newly planned Dedication feats, ChoiceSet sub-choices & rule proficiency upgrades for subsequent levels (lvl+1..20)
    if (isFuture) {
      for (const s of featSlots) {
        if (!s.feat) continue;
        if (s.feat.name && (s.feat.isDedication || /\bdedication\b/i.test(s.feat.name))) {
          const desc = makeDedicationDescriptor(s.feat.name);
          if (desc.nameLower) knownDedicationsMap.set(desc.nameLower, desc);
        }

        const selectionsMap = {};
        for (const sc of s.subChoices || []) {
          if (sc.filled && sc.selection?.value !== undefined) {
            selectionsMap[sc.flag] = sc.selection.value;
            if (sc.selection.isFeat) {
              if (sc.selection.isDedication || /\bdedication\b/i.test(sc.selection.name || "")) {
                const subDesc = makeDedicationDescriptor(sc.selection.name);
                if (subDesc.nameLower) knownDedicationsMap.set(subDesc.nameLower, subDesc);
              }
              const subMeta = sc.selection.uuid ? _plannerItemMetaCache.get(sc.selection.uuid) : null;
              if (subMeta) {
                applyRulesToPrereqState(subMeta.rules, {}, lvl, projState, subMeta.level || lvl);
                applyPlannedSpellcastingProjection(subMeta, projState);
                if (subMeta.rules.some(r => r?.key === "ActiveEffectLike" && String(r.mode || "upgrade").toLowerCase() === "upgrade")) {
                  plannedRuleItemsSoFar.push({ rules: subMeta.rules, selectionsMap: {}, itemLevel: subMeta.level || lvl });
                }
              }
            }
          }
        }

        const fMeta = s.feat.uuid ? _plannerItemMetaCache.get(s.feat.uuid) : null;
        if (fMeta) {
          // Skip `GrantItem` when already applied via chosen sub-feat above so `mode: "add"` never double-applies!
          const hasChosenSubFeat = (s.subChoices || []).some(sc => sc.filled && sc.selection?.isFeat);
          applyRulesToPrereqState(fMeta.rules, selectionsMap, lvl, projState, fMeta.level || lvl, { skipGrantItem: hasChosenSubFeat });
          applyPlannedSpellcastingProjection(fMeta, projState);
          if (fMeta.rules.some(r => r?.key === "ActiveEffectLike" && String(r.mode || "upgrade").toLowerCase() === "upgrade")) {
            plannedRuleItemsSoFar.push({ rules: fMeta.rules, selectionsMap, itemLevel: fMeta.level || lvl });
          }
        }
      }
    }
    // Capture post-slot prereq state so Quick Pick for any slot at this level reflects sibling planned feats too
    const finalLevelPrereqState = snapshotPrereqState();

    // D. Class Features unlocked at this level
    const classFeatures = classFeaturesByLevel[lvl] || [];

    // E. Spellcasting milestones, auto-granted subclass/focus/deity spells & planned spells
    const rawMilestones = spellMilestones[lvl] || [];
    const plannedSpells = isFuture && Array.isArray(lp.spells) ? lp.spells : [];
    const autoGrantedSpells = autoSpellsByLevel[lvl] || [];
    const rawChoiceGroups = choiceGroupsByLevel[lvl] || [];

    const plannedUuidSet = new Set(plannedSpells.map(s => String(s?.uuid || "").toLowerCase()).filter(Boolean));
    const plannedNameSet = new Set(plannedSpells.map(s => String(s?.name || "").trim().toLowerCase()).filter(Boolean));
    const claimedCurriculumSpells = new Set();

    const subclassSpellChoices = rawChoiceGroups.map(g => {
      const options = (g.options || []).map(o => {
        const uLower = String(o.uuid || "").toLowerCase();
        const nLower = String(o.name || "").trim().toLowerCase();
        const isKnown = Boolean((uLower && liveSpellUuids.has(uLower)) || (nLower && liveSpellNames.has(nLower)));
        const isPlanned = isFuture && Boolean((uLower && plannedUuidSet.has(uLower)) || (nLower && plannedNameSet.has(nLower)));
        return {
          ...o,
          isKnown,
          isPlanned,
          rankLabel: o.isCantrip ? "Cantrip" : `Rank ${o.rank || 1}`
        };
      });
      const pickedCount = isFuture
        ? options.filter(o => o.isPlanned).length
        : options.filter(o => o.isKnown).length;
      const remainingCount = Math.max(0, (g.pickCount || 1) - pickedCount);

      // Claim up to `pickCount` planned spells satisfying a Wizard Curriculum group so they never double-count
      // toward the 2 regular free Spellbook spells even if added via Pick Spells or Drag & Drop!
      if (isFuture && g.isCurriculum && pickedCount > 0) {
        const optUuids = new Set(options.map(o => String(o.uuid || "").toLowerCase()).filter(Boolean));
        const optNames = new Set(options.map(o => String(o.name || "").trim().toLowerCase()).filter(Boolean));
        const matchingPlanned = plannedSpells
          .filter(sp =>
            !claimedCurriculumSpells.has(sp)
            && ((sp?.uuid && optUuids.has(String(sp.uuid).toLowerCase()))
              || (sp?.name && optNames.has(String(sp.name).trim().toLowerCase())))
          )
          .sort((a, b) => (b?.isCurriculumPick ? 1 : 0) - (a?.isCurriculumPick ? 1 : 0));
        for (const sp of matchingPlanned.slice(0, g.pickCount || 1)) {
          claimedCurriculumSpells.add(sp);
        }
      }

      return {
        ...g,
        options,
        pickedCount,
        remainingCount,
        complete: remainingCount === 0
      };
    });

    const milestones = rawMilestones.map(m => {
      // Adjust spontaneous repertoire picks when a bloodline Sorcerous Gift automatically fills 1 slot of a new rank
      const autoRepertoireSpells = autoGrantedSpells.filter(sp =>
        sp.targetSourceKey === m.entryKey && sp.countsTowardRepertoire && !sp.isCantrip && !sp.isFocus
      );
      let adjustedMilestone = m;
      if (m.learnMode === "by-rank" && autoRepertoireSpells.length > 0) {
        const adjReqByRank = { ...(m.requiredByRank || {}) };
        let autoFilledCount = 0;
        for (const sp of autoRepertoireSpells) {
          const r = Number(sp.rank || 0);
          if (r >= 1 && (adjReqByRank[r] || 0) > 0) {
            adjReqByRank[r] -= 1;
            autoFilledCount += 1;
          }
        }
        const adjReqTotal = Object.values(adjReqByRank).reduce((s, n) => s + Math.max(0, Number(n || 0)), 0);
        adjustedMilestone = {
          ...m,
          requiredByRank: adjReqByRank,
          requiredTotal: adjReqTotal,
          autoFilledCount
        };
      }

      const matchedPlanned = plannedSpells.filter(sp => {
        if (sp?.entryKey && adjustedMilestone.entryKey) return sp.entryKey === adjustedMilestone.entryKey;
        if (rawMilestones.length === 1) return true;
        if (sp?.tradition && adjustedMilestone.tradition) return sp.tradition === adjustedMilestone.tradition;
        return false;
      });
      const pickState = isFuture
        ? formatSpellPickPrompt(adjustedMilestone, matchedPlanned, claimedCurriculumSpells)
        : {
          pickedCount: 0,
          requiredCount: adjustedMilestone.requiredTotal || 0,
          remainingCount: 0,
          remainingByRank: {},
          complete: true,
          isMandatory: false,
          promptText: adjustedMilestone.learnMode === "upto-rank"
            ? `Learned +${adjustedMilestone.requiredTotal || 2} spells (up to Rank ${adjustedMilestone.maxRank})`
            : (adjustedMilestone.learnMode === "by-rank" && adjustedMilestone.requiredTotal > 0
              ? `Learned ${adjustedMilestone.requiredTotal} new spell${adjustedMilestone.requiredTotal === 1 ? "" : "s"}`
              : `Slots: ${adjustedMilestone.fullSlotsText}`)
        };
      return {
        ...adjustedMilestone,
        ...pickState
      };
    });

    const mandatoryMilestones = isFuture ? milestones.filter(m => m.isMandatory) : [];
    // Only count bonus choice groups (e.g. Wizard Curriculum or standalone Focus choices) separately;
    // repertoire-counting bloodline choices are already covered by `mandatoryMilestones`!
    const mandatoryChoiceGroups = isFuture && lvl >= 2
      ? subclassSpellChoices.filter(g => g.isCurriculum || (!g.countsTowardRepertoire && g.pickCount > 0))
      : [];
    const hasMandatorySpells = mandatoryMilestones.length > 0 || mandatoryChoiceGroups.length > 0;
    const mandatorySpellsRequired = mandatoryMilestones.reduce((s, m) => s + (m.requiredCount || 0), 0)
      + mandatoryChoiceGroups.reduce((s, g) => s + (g.pickCount || 0), 0);
    const mandatorySpellsPicked = mandatoryMilestones.reduce((s, m) => s + (m.pickedCount || 0), 0)
      + mandatoryChoiceGroups.reduce((s, g) => s + Math.min(g.pickCount || 1, g.pickedCount || 0), 0);
    const mandatorySpellsRemaining = mandatoryMilestones.reduce((s, m) => s + (m.remainingCount || 0), 0)
      + mandatoryChoiceGroups.reduce((s, g) => s + (g.remainingCount || 0), 0);
    const spellsComplete = !hasMandatorySpells || mandatorySpellsRemaining === 0;

    let spellGoalBannerText = "";
    if (hasMandatorySpells) {
      if (spellsComplete) {
        spellGoalBannerText = `${mandatorySpellsPicked}/${mandatorySpellsRequired} spell${mandatorySpellsRequired === 1 ? "" : "s"} planned ✓`;
      } else if (mandatoryMilestones.length === 1 && mandatoryChoiceGroups.length === 0) {
        spellGoalBannerText = mandatoryMilestones[0].promptText;
      } else {
        const parts = [];
        for (const m of mandatoryMilestones) {
          if (!m.complete) {
            parts.push(mandatoryMilestones.length > 1
              ? `${m.title.replace(/ Spellcasting$/i, "")}: ${m.promptText}`
              : m.promptText);
          }
        }
        for (const g of mandatoryChoiceGroups) {
          if (!g.complete) {
            parts.push(`${g.isCurriculum ? "Curriculum" : g.sourceLabel}: pick ${g.remainingCount}`);
          }
        }
        spellGoalBannerText = parts.join(" · ");
      }
    }

    // E2. Alchemist Free Formulas milestone & planned formulas (Remaster PC2: 8 at Lv 1, +2 per level Lv 2-20)
    const formulaMilestone = isAlchemist
      ? (lvl === 1
        ? {
          gain: 8,
          expectedTotal: 8,
          maxItemLevel: 1,
          isStarting: true,
          text: "8 Starting Common Alchemical Formulas (4 Alchemical Crafting + 2 Formula Book + 2 Research Field)"
        }
        : {
          gain: 2,
          expectedTotal: 8 + (lvl - 1) * 2,
          maxItemLevel: lvl,
          isStarting: false,
          text: `+2 Free Common Alchemical Formulas (Item Lv ≤ ${lvl} · Total by Lv ${lvl}: ${8 + (lvl - 1) * 2})`
        })
      : null;
    const hasFormulaMilestone = Boolean(formulaMilestone);
    const isAlchemistFutureGain = Boolean(isAlchemist && isFuture && lvl >= 2);
    const plannedFormulas = isFuture && Array.isArray(lp.formulas) ? lp.formulas : [];
    const hasPlannedFormulas = plannedFormulas.length > 0;
    const formulasComplete = !isAlchemistFutureGain || plannedFormulas.length >= (formulaMilestone?.gain || 2);

    // F. Level plan completion badge (for future levels, including any planned feat ChoiceSet sub-choices)
    const subChoiceTotal = isFuture
      ? featSlots.reduce((sum, s) => sum + (s.subChoices?.length || 0), 0)
      : 0;
    const subChoiceDone = isFuture
      ? featSlots.reduce((sum, s) => sum + (s.subChoices || []).filter(c => c.filled).length, 0)
      : 0;
    let plannedItemsTotal = featSlots.length
      + subChoiceTotal
      + (hasBoosts ? 1 : 0)
      + (hasIntBonus ? 1 : 0)
      + (hasSkillIncrease ? 1 : 0)
      + (hasMandatorySpells ? 1 : 0)
      + (isAlchemistFutureGain ? 1 : 0);
    let plannedItemsDone = featSlots.filter(s => s.filled).length
      + subChoiceDone
      + (hasBoosts && boostInfo?.complete ? 1 : 0)
      + (hasIntBonus && intBonusInfo?.complete ? 1 : 0)
      + (hasSkillIncrease && skillIncreaseInfo?.complete ? 1 : 0)
      + (hasMandatorySpells && spellsComplete ? 1 : 0)
      + (isAlchemistFutureGain && formulasComplete ? 1 : 0);

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
      hasIntBonus,
      intBonusInfo,
      hasSkillIncrease,
      skillIncreaseInfo,
      featSlots,
      hasFeatSlots: featSlots.length > 0,
      prereqState: finalLevelPrereqState,
      spellMilestones: milestones,
      hasSpellMilestones: milestones.length > 0,
      autoGrantedSpells,
      hasAutoGrantedSpells: autoGrantedSpells.length > 0,
      subclassSpellChoices,
      hasSubclassSpellChoices: subclassSpellChoices.length > 0,
      hasMandatorySpells,
      mandatorySpellsRequired,
      mandatorySpellsPicked,
      mandatorySpellsRemaining,
      spellsComplete,
      spellGoalBannerText,
      plannedSpells,
      hasPlannedSpells: plannedSpells.length > 0,
      formulaMilestone,
      hasFormulaMilestone,
      isAlchemistFutureGain,
      plannedFormulas,
      plannedFormulasCount: plannedFormulas.length,
      hasPlannedFormulas,
      formulasComplete,
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
    liveLevel,
    currentLevel,
    canLevelUp: currentLevel < 20,
    canDeLevel: currentLevel > 1,
    prevLevel: Math.max(1, currentLevel - 1),
    nextLevel: Math.min(20, currentLevel + 1),
    classDisplay: dualInfo ? `${primaryName} / ${dualName}` : primaryName,
    primaryName,
    dualName,
    isDualClass: Boolean(dualInfo),
    isAlchemist,
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
 * Shared helper that initializes a PF2e Compendium Browser tab and returns a clean,
 * reset copy of its filter object (or `null` if unavailable).
 */
async function prepareBrowserTabFilter(tabName) {
  const browser = game.pf2e?.compendiumBrowser;
  const tab = browser?.tabs?.[tabName];
  if (!browser || !tab) {
    ui.notifications?.warn("PF2e Compendium Browser is unavailable.");
    return null;
  }

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
    await browser.openTab?.(tabName);
    return null;
  }

  resetBrowserFilterObject(filter);
  return { browser, tab, filter };
}

/**
 * Sets a Compendium Browser level slider cleanly across both `[min, max]` and `{ min, max }` formats.
 */
function applyBrowserLevelSlider(filter, maxLevel, minFallback = 0) {
  const slider = filter?.sliders?.level;
  if (!slider?.values) return;
  const maxLvl = Math.max(minFallback, Number(maxLevel || 20));
  if (Array.isArray(slider.values)) {
    slider.values = [minFallback, maxLvl];
  } else {
    slider.values.min = slider.values.lowerLimit ?? minFallback;
    slider.values.max = Math.min(slider.values.upperLimit ?? 20, maxLvl);
  }
  slider.isExpanded = true;
}

/**
 * Populates a Compendium Browser `traits` multiselect using only valid traits recognized by the tab.
 * Returns the resolved `{ value, label, not: false }[]` array.
 */
function applyBrowserTraitMultiselect(filter, rawTraits = [], fallbackAllowUnknown = false) {
  const traitSelect = filter?.multiselects?.traits;
  const selectedTraits = [];
  if (!traitSelect) return selectedTraits;

  const cleanTraits = Array.isArray(rawTraits) ? rawTraits.filter(Boolean) : [];
  const rawOpts = traitSelect.options;
  const validOpts = Array.isArray(rawOpts)
    ? rawOpts
    : (rawOpts && typeof rawOpts === "object"
      ? Object.entries(rawOpts).map(([k, v]) => (typeof v === "string" ? { value: k, label: v } : { value: v?.value || k, label: v?.label || capitalize(k) }))
      : []);

  for (const t of cleanTraits) {
    if (validOpts.length > 0) {
      const match = validOpts.find(o => o?.value === t);
      if (match) {
        selectedTraits.push({ value: match.value, label: match.label, not: false });
      } else if (fallbackAllowUnknown) {
        selectedTraits.push({ value: t, label: capitalize(t.replace(/-/g, " ")), not: false });
      }
    } else {
      selectedTraits.push({ value: t, label: capitalize(t.replace(/-/g, " ")), not: false });
    }
  }

  traitSelect.selected = selectedTraits;
  if ("conjunction" in traitSelect) {
    traitSelect.conjunction = selectedTraits.length > 1 ? "or" : "and";
  }
  return selectedTraits;
}

/**
 * Opens PF2e's built-in Compendium Browser pre-filtered for a specific Feat slot
 * so players can browse natively and drag-and-drop onto any slot!
 */
export async function openNativeBrowserForFeatSlot(slotSpec) {
  try {
    const prepared = await prepareBrowserTabFilter("feat");
    if (!prepared) return;
    const { browser, tab, filter } = prepared;

    // 1. Level slider
    applyBrowserLevelSlider(filter, Math.max(1, Number(slotSpec.level || 20)), 0);

    // 2. Category checkboxes (Free Archetype allows archetype/dedication feats across class & skill categories)
    const targetCats = slotSpec.groupId === "archetype"
      ? []
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

    // 3. Trait multiselect
    const selectedTraits = applyBrowserTraitMultiselect(filter, slotSpec.traits, false);

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
    await game.pf2e?.compendiumBrowser?.openTab?.("feat");
  }
}

export async function openNativeBrowserForSpells({ tradition = "", maxRank = 1, unlockedNewRank = 0 } = {}) {
  try {
    const prepared = await prepareBrowserTabFilter("spell");
    if (!prepared) return;
    const { browser, tab, filter } = prepared;

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
    await game.pf2e?.compendiumBrowser?.openTab?.("spell");
  }
}

function buildFeatRecord(e, fallbackPackCollection = "") {
  const uuid = e?.uuid || (fallbackPackCollection && e?._id ? `Compendium.${fallbackPackCollection}.Item.${e._id}` : "");
  if (!uuid || !e?.name) return null;
  const rawLvl = (typeof e.level === "object" ? e.level?.value : e.level)
    ?? (typeof e.system?.level === "object" ? e.system.level?.value : e.system?.level)
    ?? 0;
  return {
    uuid,
    name: String(e.name),
    img: e.img || "systems/pf2e/icons/default-icons/feat.svg",
    level: Number.isFinite(Number(rawLvl)) ? Number(rawLvl) : 0,
    category: e.category || e.featType || e.system?.category || "",
    traits: extractAnyItemTraits(e),
    rarity: e.rarity || e.system?.traits?.rarity || "common",
    prerequisites: toStringArray(e.prerequisites ?? e.system?.prerequisites?.value ?? e.system?.prerequisites)
      .map(p => (typeof p === "string" ? p : (p?.value || "")))
      .filter(Boolean)
  };
}

function collectBrowserRecords(rawIndexData, buildFn) {
  if (!rawIndexData) return [];
  let iter = [];
  if (Array.isArray(rawIndexData)) iter = rawIndexData;
  else if (rawIndexData instanceof Map || typeof rawIndexData.values === "function") iter = Array.from(rawIndexData.values());
  else if (typeof rawIndexData[Symbol.iterator] === "function") iter = Array.from(rawIndexData);
  else if (typeof rawIndexData === "object") iter = Object.values(rawIndexData);

  const out = [];
  const seen = new Set();
  for (const e of iter) {
    const rec = buildFn(e);
    if (!rec || seen.has(rec.uuid)) continue;
    seen.add(rec.uuid);
    out.push(rec);
  }
  return out;
}

async function hydrateBrowserTab(tab, results, buildFn, shouldReplaceFn, logLabel) {
  if (!tab) return;
  try {
    if (!tab.isInitialized && typeof tab.init === "function") {
      await tab.init();
    }
    if (collectBrowserRecords(tab.indexData, buildFn).length === 0 && typeof tab.loadData === "function") {
      await tab.loadData();
    }
    const hydrated = collectBrowserRecords(tab.indexData, buildFn);
    if (hydrated.length > 0) {
      const byUuid = new Map(results.map(r => [r.uuid, r]));
      for (const rec of hydrated) {
        const prev = byUuid.get(rec.uuid);
        if (!prev || shouldReplaceFn(prev, rec)) {
          byUuid.set(rec.uuid, rec);
        }
      }
      results.length = 0;
      results.push(...byUuid.values());
    }
  } catch (err) {
    console.warn(`PF2e Awesome GM Utilities | Fallback ${logLabel} browser hydration failed:`, err);
  }
}

/**
 * Lazily retrieves lightweight Feat index entries (reusing PF2e Compendium Browser's
 * own cache when already loaded with prerequisites, or calling `pack.getIndex` once).
 */
export async function getLightweightFeatIndex() {
  if (_featIndexCache && _featIndexCache.length > 0) return _featIndexCache;

  const featTab = game.pf2e?.compendiumBrowser?.tabs?.feat;
  const browserRecords = collectBrowserRecords(featTab?.indexData, buildFeatRecord);
  if (browserRecords.some(r => r.traits.length > 0) && browserRecords.some(r => r.prerequisites.length > 0)) {
    _featIndexCache = browserRecords;
    return _featIndexCache;
  }

  const results = [];
  const seen = new Set();

  // Include World feat items first (homebrew!)
  for (const item of game.items || []) {
    if (item.type !== "feat") continue;
    const rec = buildFeatRecord(item);
    if (!rec || seen.has(rec.uuid)) continue;
    seen.add(rec.uuid);
    results.push(rec);
  }

  // Lazy pack.getIndex on Item compendiums containing feats (excluding effect/feature packs!)
  const packs = Array.from(game.packs || []).filter(p => {
    if (p.documentName !== "Item") return false;
    const col = String(p.collection || "");
    const title = String(p.title || p.metadata?.label || "");
    if (col === "pf2e.feats-srd" || col === "pf2e.feats") return true;
    if (/effect|condition|action|spell|equipment|hazard|bestiary/i.test(col) || /\beffects?\b/i.test(title)) return false;
    return /feat/i.test(col) || /\bfeats?\b/i.test(title);
  });

  // Request parent objects (`system.level`, `system.traits`, `system.prerequisites`) so Foundry's
  // server `setProperty` never throws if a mixed pack entry stores a primitive number.
  const featIndexFields = ["img", "system.level", "system.category", "system.traits", "system.prerequisites"];

  for (const pack of packs) {
    try {
      const idx = await pack.getIndex({ fields: featIndexFields });
      for (const e of idx) {
        if (e.type !== "feat") continue;
        const rec = buildFeatRecord(e, pack.collection);
        if (!rec || seen.has(rec.uuid)) continue;
        seen.add(rec.uuid);
        results.push(rec);
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed indexing feat pack "${pack.collection}":`, err);
    }
  }

  // Tier 3 fallback for Feats: silently hydrate PF2e Compendium Browser feat index if pack index lacked traits or prereqs
  const traitRichCount = results.filter(r => r.traits.length > 0).length;
  const hasAnyPrereqs = results.some(r => r.prerequisites.length > 0);
  if (traitRichCount < Math.min(20, results.length) || !hasAnyPrereqs) {
    await hydrateBrowserTab(
      featTab,
      results,
      buildFeatRecord,
      (prev, rec) => {
        if (prev.traits.length === 0 && rec.traits.length > 0) {
          if (rec.prerequisites.length === 0 && prev.prerequisites.length > 0) {
            rec.prerequisites = prev.prerequisites;
          }
          return true;
        }
        if (prev.prerequisites.length === 0 && rec.prerequisites.length > 0) {
          if (rec.traits.length === 0 && prev.traits.length > 0) {
            rec.traits = prev.traits;
          }
          return true;
        }
        return false;
      },
      "feat"
    );
  }

  results.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
  if (results.length > 0 && results.filter(r => r.traits.length > 0).length >= Math.min(20, results.length)) {
    _featIndexCache = results;
  }
  return results;
}

const VALID_SPELL_TRADITIONS = new Set(["arcane", "divine", "occult", "primal"]);

/**
 * Robustly extracts normalized PF2e spell tradition slugs (`arcane`, `divine`, `occult`, `primal`)
 * from any Foundry v14 / PF2e index entry shape (Set, Array, `{ value }`, or boolean-map object).
 */
function extractSpellTraditions(e) {
  const out = new Set();
  const ingest = (raw) => {
    if (!raw) return;
    if (typeof raw === "string") {
      const s = normalizeSlug(raw);
      if (VALID_SPELL_TRADITIONS.has(s)) out.add(s);
      return;
    }
    if (Array.isArray(raw) || raw instanceof Set) {
      for (const v of raw) ingest(v);
      return;
    }
    if (typeof raw[Symbol.iterator] === "function") {
      for (const v of raw) ingest(v);
      return;
    }
    if (typeof raw === "object") {
      if ("value" in raw) ingest(raw.value);
      for (const [k, v] of Object.entries(raw)) {
        const s = normalizeSlug(k);
        if (v === true && VALID_SPELL_TRADITIONS.has(s)) out.add(s);
      }
    }
  };

  ingest(e?.traditions);
  ingest(e?.traits?.traditions);
  ingest(e?.system?.traits?.traditions);
  ingest(e?.system?.traditions);
  ingest(e?.["system.traits.traditions"]);
  ingest(e?.["system.traditions"]);
  return Array.from(out);
}

function buildSpellRecord(e, fallbackPackCollection = "") {
  const uuid = e?.uuid || (fallbackPackCollection && e?._id ? `Compendium.${fallbackPackCollection}.Item.${e._id}` : "");
  if (!uuid || !e?.name) return null;

  const traits = extractAnyItemTraits(e);
  const traditions = extractSpellTraditions(e);
  const category = normalizeSlug(e?.category || e?.system?.category || e?.["system.category"] || "");
  const rawRank = e?.rank
    ?? (typeof e?.level === "object" ? e.level?.value : e?.level)
    ?? (typeof e?.system?.level === "object" ? e.system.level?.value : e?.system?.level)
    ?? e?.["system.level.value"]
    ?? 1;
  const rank = Number.isFinite(Number(rawRank)) ? Number(rawRank) : 1;
  const isCantrip = Boolean(e?.isCantrip || traits.includes("cantrip") || category === "cantrip");
  const isFocus = Boolean(e?.isFocus || traits.includes("focus") || category === "focus");
  const isRitual = Boolean(e?.isRitual || category === "ritual" || Boolean(e?.system?.ritual));
  const rarity = normalizeSlug(
    e?.rarity
    || e?.traits?.rarity
    || e?.system?.traits?.rarity
    || e?.["system.traits.rarity"]
    || "common"
  ) || "common";

  return {
    uuid,
    name: String(e.name),
    img: e.img || "systems/pf2e/icons/default-icons/spell.svg",
    rank,
    isCantrip,
    isFocus,
    isRitual,
    traits,
    traditions,
    rarity
  };
}

/**
 * Lazily retrieves lightweight Spell index entries (zero startup overhead).
 * Uses a 3-tier pipeline (Browser Cache -> Direct Compendium Index -> Silent Browser Tab Hydration)
 * so Pick Spells ALWAYS shows spells with traditions even if PF2e Browser hasn't been opened yet!
 */
export async function getLightweightSpellIndex() {
  if (_spellIndexCache && _spellIndexCache.length > 0 && _spellIndexCache.some(r => r.traditions.length > 0)) {
    return _spellIndexCache;
  }

  // Tier 1: Reuse PF2e Compendium Browser's Spell cache ONLY if already populated with traditions
  const spellTab = game.pf2e?.compendiumBrowser?.tabs?.spell;
  const browserRecords = collectBrowserRecords(spellTab?.indexData, buildSpellRecord);
  if (browserRecords.some(r => r.traditions.length > 0)) {
    browserRecords.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
    _spellIndexCache = browserRecords;
    return _spellIndexCache;
  }

  // Tier 2: Direct lightweight `pack.getIndex` on World items + spell compendiums
  const results = [];
  const seen = new Set();

  for (const item of game.items || []) {
    if (item.type !== "spell") continue;
    const rec = buildSpellRecord(item);
    if (!rec || seen.has(rec.uuid)) continue;
    seen.add(rec.uuid);
    results.push(rec);
  }

  const packs = Array.from(game.packs || []).filter(p => {
    if (p.documentName !== "Item") return false;
    const col = String(p.collection || "");
    const title = String(p.title || p.metadata?.label || "");
    if (col === "pf2e.spells-srd" || col === "pf2e.spells") return true;
    if (/effect|condition|action|feat|equipment|hazard|bestiary/i.test(col) || /\beffects?\b/i.test(title)) return false;
    return /spell/i.test(col) || /\bspells?\b/i.test(title);
  }).sort((a, b) => (b.collection === "pf2e.spells-srd" ? 1 : 0) - (a.collection === "pf2e.spells-srd" ? 1 : 0));

  const spellIndexFields = ["img", "system.level", "system.traits", "system.traditions", "system.category", "system.ritual"];

  for (const pack of packs) {
    try {
      const idx = await pack.getIndex({ fields: spellIndexFields });
      for (const e of idx) {
        if (e.type !== "spell") continue;
        const rec = buildSpellRecord(e, pack.collection);
        if (!rec || seen.has(rec.uuid)) continue;
        seen.add(rec.uuid);
        results.push(rec);
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed indexing spell pack "${pack.collection}":`, err);
    }
  }

  if (results.some(r => r.traditions.length > 0)) {
    results.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
    _spellIndexCache = results;
    return _spellIndexCache;
  }

  // Tier 3: Silently ask PF2e's native Compendium Browser Spell tab to hydrate its index
  // (never opens the browser window; guarantees traditions/ranks load on first Pick Spells click!)
  await hydrateBrowserTab(
    spellTab,
    results,
    buildSpellRecord,
    (prev, rec) => prev.traditions.length === 0 && rec.traditions.length > 0,
    "spell"
  );

  results.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
  if (results.some(r => r.traditions.length > 0)) {
    _spellIndexCache = results;
  } else {
    console.warn(
      "PF2e Awesome GM Utilities | Spell index loaded 0 spells with traditions.",
      { packCount: packs.length, totalItems: results.length, sample: results[0] || null }
    );
  }
  return results;
}

/**
 * Opens PF2e's built-in Compendium Browser Equipment tab pre-filtered to Alchemical items
 * up to `maxLevel` so Alchemists can browse and drag-and-drop formulas directly!
 */
export async function openNativeBrowserForFormulas({ maxLevel = 1 } = {}) {
  try {
    const prepared = await prepareBrowserTabFilter("equipment");
    if (!prepared) return;
    const { browser, tab, filter } = prepared;

    applyBrowserLevelSlider(filter, Math.max(0, Number(maxLevel || 20)), 0);
    applyBrowserTraitMultiselect(filter, ["alchemical"], true);

    await openBrowserTabWithFilter(browser, tab, "equipment", filter, (liveFilter) => {
      const liveTraits = Array.isArray(liveFilter?.multiselects?.traits?.selected)
        ? liveFilter.multiselects.traits.selected.map(o => o?.value)
        : [];
      return liveTraits.includes("alchemical");
    });
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Fallback opening Compendium Browser equipment tab:", err);
    await game.pf2e?.compendiumBrowser?.openTab?.("equipment");
  }
}

/**
 * Robustly extracts normalized trait slugs from any Foundry / PF2e index entry shape
 * (Set, Array, `{ value, otherTags }`, boolean-map object, or dotted index keys).
 */
function extractAnyItemTraits(e) {
  const out = new Set();
  const ingest = (raw) => {
    if (!raw) return;
    if (typeof raw === "string") {
      const s = normalizeSlug(raw);
      if (s) out.add(s);
      return;
    }
    if (Array.isArray(raw) || raw instanceof Set) {
      for (const v of raw) ingest(v);
      return;
    }
    if (typeof raw[Symbol.iterator] === "function") {
      for (const v of raw) ingest(v);
      return;
    }
    if (typeof raw === "object") {
      if ("value" in raw) ingest(raw.value);
      if ("otherTags" in raw) ingest(raw.otherTags);
      for (const [k, v] of Object.entries(raw)) {
        if (v === true && k !== "value" && k !== "otherTags" && k !== "rarity") {
          const s = normalizeSlug(k);
          if (s) out.add(s);
        }
      }
    }
  };

  ingest(e?.traits);
  ingest(e?.system?.traits);
  ingest(e?.system?.traits?.value);
  ingest(e?.system?.traits?.otherTags);
  ingest(e?.["system.traits"]);
  ingest(e?.["system.traits.value"]);
  return Array.from(out);
}

export const FORMULA_CRAFTABLE_TYPES = new Set([
  "consumable", "equipment", "weapon", "armor", "backpack", "treasure", "ammo", "shield", "kit"
]);
const ALCHEMICAL_SUBTRAITS = new Set([
  "alchemical", "bomb", "elixir", "mutagen", "lozenge", "bottled-monstrosity"
]);
const ALCHEMICAL_CONSUMABLE_CATS = new Set([
  "elixir", "mutagen", "poison", "drug", "ammo", "alchemical"
]);

function buildFormulaRecord(e, fallbackPackCollection = "") {
  const uuid = e?.uuid || (fallbackPackCollection && e?._id ? `Compendium.${fallbackPackCollection}.Item.${e._id}` : "");
  if (!uuid || !e?.name) return null;

  const traits = extractAnyItemTraits(e);
  const itemType = normalizeSlug(e?.itemType || e?.type || "");
  const category = normalizeSlug(e?.category || e?.system?.category || e?.["system.category"] || "");
  const group = normalizeSlug(e?.group || e?.system?.group || e?.["system.group"] || "");
  const rawLvl = (typeof e?.level === "object" ? e.level?.value : e?.level)
    ?? (typeof e?.system?.level === "object" ? e.system.level?.value : e?.system?.level)
    ?? e?.["system.level.value"]
    ?? 0;
  const level = Number.isFinite(Number(rawLvl)) ? Number(rawLvl) : 0;
  const rarity = normalizeSlug(
    e?.rarity
    || e?.traits?.rarity
    || e?.system?.traits?.rarity
    || e?.["system.traits.rarity"]
    || "common"
  ) || "common";

  const isAlchemical = traits.some(t => ALCHEMICAL_SUBTRAITS.has(t))
    || group === "bomb"
    || category === "alchemical"
    || category === "elixir"
    || category === "mutagen";

  const isConsumable = itemType === "consumable"
    || itemType === "ammo"
    || traits.includes("consumable")
    || traits.includes("bomb")
    || traits.includes("elixir")
    || traits.includes("mutagen")
    || traits.includes("poison")
    || group === "bomb"
    || ALCHEMICAL_CONSUMABLE_CATS.has(category);

  return {
    uuid,
    name: String(e.name),
    img: e.img || "systems/pf2e/icons/default-icons/consumable.svg",
    level,
    type: itemType || "equipment",
    category,
    group,
    traits,
    isAlchemical,
    isConsumable,
    rarity
  };
}

/**
 * Lazily retrieves lightweight craftable/alchemical equipment index entries
 * (zero startup overhead; cached only on first Pick Formulas click).
 * Uses a 3-tier pipeline so bombs, elixirs, mutagens, poisons, and alchemical tools
 * are always found reliably across Foundry v14 / PF2e versions.
 */
export async function getLightweightFormulaIndex() {
  if (_formulaIndexCache && _formulaIndexCache.length > 0) return _formulaIndexCache;

  // Tier 1: Reuse PF2e Compendium Browser's Equipment cache ONLY if it already contains alchemical traits
  const equipTab = game.pf2e?.compendiumBrowser?.tabs?.equipment;
  const browserRecords = collectBrowserRecords(equipTab?.indexData, buildFormulaRecord);
  if (browserRecords.some(r => r.isAlchemical)) {
    browserRecords.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
    _formulaIndexCache = browserRecords;
    return _formulaIndexCache;
  }

  // Tier 2: Direct lightweight `pack.getIndex` on World items + equipment compendiums
  const results = [];
  const seen = new Set();

  for (const item of game.items || []) {
    if (!FORMULA_CRAFTABLE_TYPES.has(item.type)) continue;
    const rec = buildFormulaRecord(item);
    if (!rec || seen.has(rec.uuid)) continue;
    seen.add(rec.uuid);
    results.push(rec);
  }

  const allItemPacks = Array.from(game.packs || []).filter(p => p.documentName === "Item");
  const primaryPacks = allItemPacks
    .filter(p => {
      const col = String(p.collection || "");
      const title = String(p.title || p.metadata?.label || "");
      if (col === "pf2e.equipment-srd" || col === "pf2e.equipment") return true;
      // Never index effect, feature, action, condition, spell, or feat compendiums (e.g. pf2e.equipment-effects)
      if (/effect|feature|action|condition|spell|feat|hazard|bestiary|deity|ancestry|heritage|background|class/i.test(col)) return false;
      if (/\beffects?\b/i.test(title)) return false;
      return /equipment|alchem|consumable|treasure/i.test(col)
        || /equipment|alchem|consumable/i.test(title);
    })
    // Prioritize official `pf2e.equipment-srd` first
    .sort((a, b) => (b.collection === "pf2e.equipment-srd" ? 1 : 0) - (a.collection === "pf2e.equipment-srd" ? 1 : 0));

  // Request top-level `system.level` & `system.traits` objects (never nested `.value` paths)
  // so Foundry's server `setProperty` never throws if any pack entry stores a primitive number!
  const indexFields = [
    "img",
    "system.level",
    "system.category",
    "system.group",
    "system.traits"
  ];

  for (const pack of primaryPacks) {
    try {
      const idx = await pack.getIndex({ fields: indexFields });
      for (const e of idx) {
        if (e.type && !FORMULA_CRAFTABLE_TYPES.has(e.type)) continue;
        const rec = buildFormulaRecord(e, pack.collection);
        if (!rec || seen.has(rec.uuid)) continue;
        seen.add(rec.uuid);
        results.push(rec);
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed indexing equipment pack "${pack.collection}":`, err);
    }
  }

  if (results.some(r => r.isAlchemical)) {
    results.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
    _formulaIndexCache = results;
    return _formulaIndexCache;
  }

  // Tier 3: Ask PF2e's native Compendium Browser Equipment tab to load its own index
  await hydrateBrowserTab(
    equipTab,
    results,
    buildFormulaRecord,
    (prev, rec) => (!prev.isAlchemical && rec.isAlchemical) || (prev.traits.length === 0 && rec.traits.length > 0),
    "equipment"
  );

  results.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
  if (results.some(r => r.isAlchemical)) {
    _formulaIndexCache = results;
  } else {
    console.warn(
      "PF2e Awesome GM Utilities | Formula index loaded 0 alchemical items.",
      { packCount: primaryPacks.length, totalItems: results.length, sample: results[0] || null }
    );
  }
  return results;
}

/* ------------------------------------------------------------------------- */
/* 4B. LIGHTWEIGHT CORE BUILD (ABC / DEITY), LIVE FEAT & SHEET HELPERS       */
/* ------------------------------------------------------------------------- */

const CORE_BUILD_PACK_CONFIG = {
  ancestry: {
    itemType: "ancestry",
    label: "Ancestry",
    primaryPack: "pf2e.ancestries",
    packMatch: /ancestr/i,
    defaultImg: "systems/pf2e/icons/default-icons/ancestry.svg"
  },
  heritage: {
    itemType: "heritage",
    label: "Heritage",
    primaryPack: "pf2e.heritages",
    packMatch: /heritage/i,
    defaultImg: "systems/pf2e/icons/default-icons/heritage.svg"
  },
  background: {
    itemType: "background",
    label: "Background",
    primaryPack: "pf2e.backgrounds",
    packMatch: /background/i,
    defaultImg: "systems/pf2e/icons/default-icons/background.svg"
  },
  class: {
    itemType: "class",
    label: "Class",
    primaryPack: "pf2e.classes",
    packMatch: /class(?:es)?(?!feature)/i,
    defaultImg: "systems/pf2e/icons/default-icons/class.svg"
  },
  deity: {
    itemType: "deity",
    label: "Deity",
    primaryPack: "pf2e.deities",
    packMatch: /deit/i,
    defaultImg: "systems/pf2e/icons/default-icons/deity.svg"
  }
};

/**
 * Lazily indexes lightweight PF2e core build items (Ancestry, Heritage, Background, Class, Deity)
 * from World items and PF2e/module compendiums (zero startup cost).
 */
export async function getLightweightCoreBuildIndex(itemKey) {
  const cfg = CORE_BUILD_PACK_CONFIG[itemKey];
  if (!cfg) return [];
  if (_coreBuildIndexCache.has(itemKey) && _coreBuildIndexCache.get(itemKey).length > 0) {
    return _coreBuildIndexCache.get(itemKey);
  }

  const results = [];
  const seen = new Set();

  const buildRec = (e, fallbackPack = "") => {
    const uuid = e?.uuid || (fallbackPack && e?._id ? `Compendium.${fallbackPack}.Item.${e._id}` : "");
    if (!uuid || !e?.name) return null;
    const ancRef = e?.system?.ancestry;
    const ancSlug = typeof ancRef === "string"
      ? normalizeSlug(ancRef)
      : normalizeSlug(ancRef?.slug || ancRef?.name || "");
    const ancName = typeof ancRef === "object" && ancRef?.name ? String(ancRef.name) : "";
    const rarity = normalizeSlug(e?.system?.traits?.rarity || e?.rarity || "common") || "common";
    return {
      uuid,
      name: String(e.name),
      img: e.img || cfg.defaultImg,
      rarity,
      traits: extractAnyItemTraits(e),
      ancestrySlug: ancSlug,
      ancestryName: ancName,
      isVersatile: cfg.itemType === "heritage" && !ancSlug
    };
  };

  for (const item of game.items || []) {
    if (item.type !== cfg.itemType) continue;
    const rec = buildRec(item);
    if (!rec || seen.has(rec.uuid)) continue;
    seen.add(rec.uuid);
    results.push(rec);
  }

  const packs = Array.from(game.packs || []).filter(p => {
    if (p.documentName !== "Item") return false;
    const col = String(p.collection || "");
    if (col === cfg.primaryPack) return true;
    if (/effect|condition|action|spell|feat|equipment|hazard|bestiary|classfeature/i.test(col)) return false;
    return cfg.packMatch.test(col) || cfg.packMatch.test(String(p.title || p.metadata?.label || ""));
  }).sort((a, b) => (b.collection === cfg.primaryPack ? 1 : 0) - (a.collection === cfg.primaryPack ? 1 : 0));

  const fields = cfg.itemType === "heritage"
    ? ["img", "system.traits", "system.ancestry"]
    : ["img", "system.traits"];

  for (const pack of packs) {
    try {
      const idx = await pack.getIndex({ fields });
      for (const e of idx) {
        if (e.type !== cfg.itemType) continue;
        const rec = buildRec(e, pack.collection);
        if (!rec || seen.has(rec.uuid)) continue;
        seen.add(rec.uuid);
        results.push(rec);
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed indexing ${cfg.label} pack "${pack.collection}":`, err);
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  if (results.length > 0) _coreBuildIndexCache.set(itemKey, results);
  return results;
}

/**
 * Opens PF2e's native Compendium Pack window for a Core Build item type (Ancestry, Heritage, Background, Class, Deity).
 */
export function openNativePackForCoreBuild(itemKey) {
  const cfg = CORE_BUILD_PACK_CONFIG[itemKey];
  if (!cfg) return false;
  const pack = game.packs?.get?.(cfg.primaryPack)
    || Array.from(game.packs || []).find(p => p.documentName === "Item" && cfg.packMatch.test(String(p.collection || "")));
  if (pack) {
    pack.render(true);
    return true;
  }
  ui.notifications?.warn(`Could not find PF2e ${cfg.label} compendium pack.`);
  return false;
}

/**
 * Embeds a chosen Core Build item (Ancestry, Heritage, Background, Class, Deity) directly onto the actor
 * so PF2e runs all its native Rule Elements & ChoiceSets cleanly.
 */
export async function embedLiveCoreItem(actor, uuid, expectedItemKey) {
  const cfg = CORE_BUILD_PACK_CONFIG[expectedItemKey];
  if (!actor || !uuid || !cfg) return null;
  if (!game.user?.isGM && !actor.isOwner) return null;

  const doc = await fromUuid(uuid);
  if (!doc || doc.type !== cfg.itemType) return null;

  const obj = doc.toObject();
  delete obj._id;
  obj._stats = obj._stats || {};
  obj._stats.compendiumSource = doc.uuid || uuid;

  const created = await actor.createEmbeddedDocuments("Item", [obj]);
  return created?.[0] || null;
}

/**
 * Embeds a chosen Feat directly into a live empty PF2e feat slot on the actor
 * (triggering PF2e's native ChoiceSets automatically).
 */
export async function embedLiveFeatIntoSlot(actor, groupId, slotLevel, uuid) {
  if (!actor || !groupId || !uuid) return null;
  if (!game.user?.isGM && !actor.isOwner) return null;

  const obj = await materializePlannedItem({ uuid }, "feat");
  if (!obj) return null;

  const numLevel = Number(slotLevel || actor.level || 1);
  const group = actor.feats?.get?.(groupId);
  const groupSlots = group?.slots ? extractGroupSlots(group) : [];
  const exactEmpty = Number.isFinite(numLevel)
    ? groupSlots.find(s => Number(s?.level) === numLevel && !s?.feat)
    : null;
  const anyEmpty = exactEmpty || groupSlots.find(s => !s?.feat) || null;
  const liveSlotId = anyEmpty?.id || resolveLiveFeatSlot(actor, groupId, numLevel).id;

  if (obj.system) {
    obj.system.location = liveSlotId;
  }

  const created = await actor.createEmbeddedDocuments("Item", [obj]);
  return created?.[0] || null;
}

/**
 * Opens the actor's Character Sheet directly to a specific PF2e tab (`character`, `proficiencies`, `feats`, `spellcasting`, `crafting`).
 */
export async function openCharacterSheetToTab(actor, tabName = "character") {
  if (!actor?.sheet) return null;
  const sheet = actor.sheet;
  try {
    await sheet.render({ force: true });
  } catch {
    try { await sheet.render(true); } catch { /* ignore */ }
  }
  setTimeout(() => {
    try {
      if (typeof sheet.activateTab === "function") {
        sheet.activateTab(tabName);
      } else if (typeof sheet.changeTab === "function") {
        sheet.changeTab(tabName, "primary");
      } else {
        const root = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
        const tabBtn = root?.querySelector?.(`[data-tab="${tabName}"], nav.sheet-navigation a[data-tab="${tabName}"]`);
        tabBtn?.click?.();
      }
    } catch { /* ignore */ }
  }, 60);
  return sheet;
}

/**
 * Opens PF2e's own native Attribute Builder modal directly for the actor (falling back cleanly
 * to opening the Character Sheet's Character tab if the modal trigger isn't found).
 */
export async function openNativeAttributeBuilder(actor) {
  if (!actor?.sheet) return;
  const sheet = await openCharacterSheetToTab(actor, "character");
  if (!sheet) return;

  // Try direct PF2e sheet API if exposed, else trigger the sheet's native Attribute Modifiers Edit button
  setTimeout(() => {
    try {
      if (sheet.attributeBuilder?.render) {
        sheet.attributeBuilder.render({ force: true });
        return;
      }
      const root = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
      const attrBtn = root?.querySelector?.(
        'button[data-action="edit-attribute-boosts"], a[data-action="edit-attribute-boosts"], [data-action="open-attribute-builder"], section.attributes button.edit, .attributes-container [data-action="edit-attribute-boosts"], .attribute-modifiers [data-action*="edit"]'
      );
      if (attrBtn) {
        attrBtn.click();
      }
    } catch { /* fallback: sheet is already open on Character tab */ }
  }, 120);
}

/**
 * Opens PF2e's native Languages editor dialog from the actor's sheet (or opens the Character tab).
 */
export async function openNativeLanguagesEditor(actor) {
  if (!actor?.sheet) return;
  const sheet = await openCharacterSheetToTab(actor, "character");
  if (!sheet) return;
  setTimeout(() => {
    try {
      const root = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
      const langBtn = root?.querySelector?.(
        '[data-action="edit-languages"], .languages [data-action="edit-languages"], .pc_languages [data-action*="edit"], a[data-property="system.details.languages"]'
      );
      if (langBtn) langBtn.click();
    } catch { /* fallback: sheet is already open on Character tab */ }
  }, 120);
}

/* ------------------------------------------------------------------------- */
/* 5. PLAN INSPECTION & GUIDED LEVEL-UP EXECUTOR                             */
/* ------------------------------------------------------------------------- */

/**
 * Resolves the exact live PF2e `slot` object on `actor.feats` for a given groupId & level.
 */
function resolveLiveFeatSlot(actor, groupId, targetLevel) {
  const group = actor.feats?.get?.(groupId);
  if (group?.slots) {
    const slots = extractGroupSlots(group);
    const emptyMatch = slots.find(s => Number(s?.level) === targetLevel && !s?.feat);
    if (emptyMatch) return { id: emptyMatch.id || `${groupId}-${targetLevel}`, alreadyFilled: false };
    const filledMatch = slots.find(s => Number(s?.level) === targetLevel && s?.feat);
    if (filledMatch) return { id: filledMatch.id || `${groupId}-${targetLevel}`, alreadyFilled: true };
  }
  const fallbackId = `${groupId}-${targetLevel}`;
  const alreadyHasAtLoc = (actor.itemTypes?.feat || []).some(f => f.system?.location === fallbackId);
  return { id: fallbackId, alreadyFilled: alreadyHasAtLoc };
}

async function materializePlannedItem(planned, expectedType) {
  if (!planned) return null;
  let obj = null;
  if (planned.uuid) {
    const sourceDoc = expectedType === "spell"
      ? await resolveSpellDocumentByUuid(planned.uuid)
      : await fromUuid(planned.uuid);
    if (sourceDoc && sourceDoc.type === expectedType) {
      obj = sourceDoc.toObject();
      obj._stats = obj._stats || {};
      obj._stats.compendiumSource = sourceDoc.uuid || planned.uuid;
    }
  }
  if (!obj && planned.itemData && typeof planned.itemData === "object") {
    obj = foundry.utils.deepClone(planned.itemData);
  }
  if (!obj) return null;
  delete obj._id;
  return obj;
}

/**
 * Inspects planned vs. unplanned items across one or more target levels (e.g., [4] or [4, 5]).
 * Works both BEFORE level-up (`effectiveCurrentLevel = actor.level`) and RIGHT AFTER a direct
 * character-sheet level-up (`effectiveCurrentLevel = previousLevel`).
 */
export function inspectPlannedLevels(actor, targetLevels = [], { effectiveCurrentLevel = null } = {}) {
  const cleanLevels = parseLevelList(targetLevels);

  const hasAnyPlan = hasAnySavedLevelPlan(actor);
  if (!actor || actor.type !== "character" || cleanLevels.length === 0) {
    return {
      hasAnySavedPlan: hasAnyPlan,
      hasPlannedChoicesInRange: false,
      allLevelsComplete: true,
      totalPlannedChoices: 0,
      totalExpectedChoices: 0,
      levels: []
    };
  }

  const effCur = Number.isFinite(effectiveCurrentLevel)
    ? effectiveCurrentLevel
    : Math.min(...cleanLevels) - 1;
  const roadmap = buildLevelRoadmap(actor, { effectiveCurrentLevel: effCur });
  const levelSummaries = [];
  let totalPlannedChoices = 0;
  let totalExpectedChoices = 0;
  let hasPlannedChoicesInRange = false;
  let allLevelsComplete = true;

  for (const targetLevel of cleanLevels) {
    const lvlData = roadmap?.levels?.find(l => l.level === targetLevel);
    if (!lvlData) continue;

    const plannedItems = [];
    const unplannedItems = [];
    let hasPlanned = false;

    if (lvlData.hasClassFeatures) {
      plannedItems.push({
        kind: "auto",
        label: "Class Features (Auto-Granted)",
        text: lvlData.classFeatures.map(f => f.name).join(", ")
      });
    }

    if (lvlData.hasBoosts) {
      const bi = lvlData.boostInfo;
      if (bi?.selectedCount > 0) {
        hasPlanned = true;
        plannedItems.push({
          kind: "planned",
          label: "Attribute Boosts",
          text: bi.selectedLabels
        });
      }
      if (!bi?.complete) {
        const remaining = Math.max(1, (bi?.expected || 1) - (bi?.selectedCount || 0));
        unplannedItems.push(`Attribute Boosts (${bi?.selectedCount || 0}/${bi?.expected || 1} selected — ${remaining} remaining)`);
      }
    }

    if (lvlData.hasIntBonus) {
      const ib = lvlData.intBonusInfo;
      if (ib?.chosenSkill && ib.chosenValid) {
        hasPlanned = true;
        plannedItems.push({
          kind: "planned",
          label: `INT Increase Bonus (${ib.fromModStr} → ${ib.toModStr})`,
          text: ib.chosenLanguage ? `${ib.chosenLabel} · Language: ${ib.chosenLanguage}` : ib.chosenLabel
        });
        if (!ib.chosenLanguage) {
          unplannedItems.push(`INT Bonus Language (not specified — remember to add +1 Language on sheet)`);
        }
      } else {
        unplannedItems.push(`INT Increase Bonus Skill (${ib?.fromModStr} → ${ib?.toModStr}: +1 Trained Skill & +1 Language)`);
      }
    }

    if (lvlData.hasSkillIncrease) {
      const si = lvlData.skillIncreaseInfo;
      if (si?.chosenSlug && si.chosenValid) {
        hasPlanned = true;
        plannedItems.push({
          kind: "planned",
          label: "Skill Increase",
          text: si.chosenTransition
        });
      } else {
        unplannedItems.push(`Skill Increase (up to ${si?.maxLegalLabel || "Trained"})`);
      }
    }

    for (const slot of lvlData.featSlots || []) {
      if (slot.filled && slot.feat) {
        hasPlanned = true;
        const chosenSubLabels = (slot.subChoices || [])
          .filter(c => c.filled && c.selection?.name)
          .map(c => c.selection.name);
        plannedItems.push({
          kind: "planned",
          label: slot.groupLabel,
          text: chosenSubLabels.length > 0
            ? `${slot.feat.name} (→ ${chosenSubLabels.join(", ")})`
            : slot.feat.name
        });
        for (const sc of slot.subChoices || []) {
          if (!sc.filled) {
            unplannedItems.push(`${slot.feat.name}: ${sc.prompt}`);
          }
        }
      } else {
        unplannedItems.push(slot.groupLabel);
      }
    }

    if (lvlData.hasSpellMilestones) {
      const mText = lvlData.spellMilestones.map(m => `${m.title} (${m.deltaText})`).join("; ");
      plannedItems.push({
        kind: "auto",
        label: "Spellcasting Slots Sync",
        text: mText
      });
    }

    if (lvlData.hasAutoGrantedSpells) {
      plannedItems.push({
        kind: "auto",
        label: "Auto-Granted Spells (Subclass / Focus / Deity)",
        text: lvlData.autoGrantedSpells.map(s => `${s.name} (${s.rankLabel})`).join(", ")
      });
    }

    if (lvlData.hasPlannedSpells) {
      hasPlanned = true;
      plannedItems.push({
        kind: "planned",
        label: "Planned Spells",
        text: lvlData.plannedSpells.map(s => s.name).join(", ")
      });
    }
    if (lvlData.hasMandatorySpells && !lvlData.spellsComplete) {
      for (const m of lvlData.spellMilestones || []) {
        if (m.isMandatory && !m.complete) {
          unplannedItems.push(`${m.title}: ${m.promptText}`);
        }
      }
      for (const g of lvlData.subclassSpellChoices || []) {
        if (!g.complete) {
          unplannedItems.push(`${g.label} (${g.remainingCount} remaining)`);
        }
      }
    }

    if (lvlData.isAlchemistFutureGain) {
      const gain = lvlData.formulaMilestone?.gain || 2;
      if (lvlData.hasPlannedFormulas) {
        hasPlanned = true;
        plannedItems.push({
          kind: "planned",
          label: `Alchemist Formulas (${lvlData.plannedFormulasCount}/${gain})`,
          text: lvlData.plannedFormulas.map(f => f.name).join(", ")
        });
      }
      if (!lvlData.formulasComplete) {
        const rem = Math.max(1, gain - lvlData.plannedFormulasCount);
        unplannedItems.push(`Alchemist Free Formulas (${lvlData.plannedFormulasCount}/${gain} planned — ${rem} more free common formula${rem === 1 ? "" : "s"} up to Lv ${targetLevel})`);
      }
    } else if (lvlData.hasPlannedFormulas) {
      hasPlanned = true;
      plannedItems.push({
        kind: "planned",
        label: "Planned Formulas",
        text: lvlData.plannedFormulas.map(f => f.name).join(", ")
      });
    }

    totalPlannedChoices += lvlData.plannedItemsDone || 0;
    totalExpectedChoices += lvlData.plannedItemsTotal || 0;
    if (hasPlanned) hasPlannedChoicesInRange = true;
    const isComplete = unplannedItems.length === 0 && (lvlData.plannedItemsTotal === 0 || lvlData.isLevelPlanComplete);
    if (!isComplete) allLevelsComplete = false;

    levelSummaries.push({
      level: targetLevel,
      lvlData,
      plannedItems,
      unplannedItems,
      hasPlanned,
      isComplete,
      filledCount: lvlData.plannedItemsDone || 0,
      expectedCount: lvlData.plannedItemsTotal || 0
    });
  }

  return {
    hasAnySavedPlan: hasAnyPlan,
    hasPlannedChoicesInRange,
    allLevelsComplete,
    totalPlannedChoices,
    totalExpectedChoices,
    levels: levelSummaries
  };
}

/**
 * Applies planned choices for one or more levels cleanly on the live actor:
 *  - Optional `updateActorLevel: true` raises `system.details.level.value`
 *  - Always tags `actor.update` with `{ [MODULE_ID]: { fromLevelPlanner: true } }` so it never
 *    re-triggers the direct-sheet level-up auto-prompt hook
 *  - Applies Boosts (without overwriting already-picked live tiers), INT Bonus Skill & Language,
 *    Skill Increases (respecting newly trained INT bonus skills!), Planned Alchemist Formulas,
 *    Feats (skipping already-filled live slots), Spellcasting Slot Sync, and Planned Spells.
 *
 * @param {Actor} actor
 * @param {number|number[]} targetLevels
 * @param {{ updateActorLevel?: boolean, effectiveCurrentLevel?: number }} [options]
 * @returns {Promise<{ ok: boolean, newLevel: number, summary: string[], reminders: string[] }>}
 */
export async function applyPlannedLevelChoices(actor, targetLevels, { updateActorLevel = false, effectiveCurrentLevel = null } = {}) {
  if (!actor || actor.type !== "character") {
    return { ok: false, newLevel: 0, summary: [], reminders: [] };
  }
  if (!game.user?.isGM && !actor.isOwner) {
    ui.notifications?.warn("You do not have permission to update this character.");
    return { ok: false, newLevel: actor.level || 1, summary: [], reminders: [] };
  }

  const cleanLevels = parseLevelList(targetLevels);

  if (cleanLevels.length === 0) {
    return { ok: false, newLevel: actor.level || 1, summary: [], reminders: [] };
  }

  const maxTargetLevel = cleanLevels[cleanLevels.length - 1];
  const effCur = Number.isFinite(effectiveCurrentLevel)
    ? effectiveCurrentLevel
    : Math.min(...cleanLevels) - 1;

  await preloadPlannerProjectionData(actor, { effectiveCurrentLevel: effCur });
  const roadmap = buildLevelRoadmap(actor, { effectiveCurrentLevel: effCur });
  const plan = getActorLevelPlan(actor);
  const summary = [];
  const reminders = [];

  // Working copies so sequential updates (e.g. INT bonus training + Skill Increase at same level) compose cleanly!
  const workingSkillRanks = {};
  for (const slug of CORE_SKILL_SLUGS) {
    workingSkillRanks[slug] = Number(actor.system?.skills?.[slug]?.rank ?? 0);
  }

  const liveLangValues = Array.isArray(actor.system?.details?.languages?.value)
    ? [...actor.system.details.languages.value]
    : [];
  let langValuesDirty = false;
  let customLangText = String(actor.system?.details?.languages?.details || "").trim();
  let customLangDirty = false;

  const existingFormulasRaw = Array.isArray(actor.system?.crafting?.formulas)
    ? foundry.utils.deepClone(actor.system.crafting.formulas)
    : [];
  const existingFormulaUuids = new Set(existingFormulasRaw.map(f => f?.uuid).filter(Boolean));
  const addedFormulaNames = [];
  let formulasDirty = false;

  const actorUpdates = {};
  if (updateActorLevel) {
    actorUpdates["system.details.level.value"] = maxTargetLevel;
  }

  const liveBoostsAll = actor.system?.build?.attributes?.boosts || {};

  for (const targetLevel of cleanLevels) {
    const lvlData = roadmap?.levels?.find(l => l.level === targetLevel);
    const lp = plan.levels[String(targetLevel)] || createEmptyLevelPlanEntry();

    // 1a. Attribute Boosts (skip if live sheet already has boosts selected for this tier)
    if (lvlData?.hasBoosts && !actor.system?.build?.attributes?.manual) {
      const liveTier = Array.isArray(liveBoostsAll[targetLevel]) ? liveBoostsAll[targetLevel].filter(Boolean) : [];
      const validBoosts = (Array.isArray(lp.boosts) ? lp.boosts : []).filter(a => ABILITY_KEYS.includes(a));
      if (liveTier.length === 0 && validBoosts.length > 0) {
        actorUpdates[`system.build.attributes.boosts.${targetLevel}`] = validBoosts;
        summary.push(`Boosts (Lv ${targetLevel}): ${validBoosts.map(a => ABILITY_LABELS[a]).join(", ")}`);
      }
    }

    // 1b. INT Increase Bonus Skill & Language (applied BEFORE Skill Increase so same-level upgrade works!)
    if (lvlData?.hasIntBonus) {
      if (lp.intBonusSkill === "__lore__") {
        reminders.push(`Lv ${targetLevel} INT Increase: add your new Lore skill manually on the Skills tab.`);
      } else if (typeof lp.intBonusSkill === "string" && CORE_SKILL_SLUGS.includes(lp.intBonusSkill)) {
        const slug = lp.intBonusSkill;
        if ((workingSkillRanks[slug] || 0) === 0) {
          workingSkillRanks[slug] = 1;
          actorUpdates[`system.skills.${slug}.rank`] = 1;
          summary.push(`INT Bonus Skill: ${capitalize(slug)} → Trained`);
        }
      } else {
        reminders.push(`Lv ${targetLevel} INT Increase: pick +1 Trained Skill on the Skills tab.`);
      }

      const plannedLang = typeof lp.intBonusLanguage === "string" ? lp.intBonusLanguage.trim() : "";
      if (plannedLang) {
        const matchedSlug = resolveLanguageSlug(plannedLang);
        if (matchedSlug) {
          if (!liveLangValues.includes(matchedSlug)) {
            liveLangValues.push(matchedSlug);
            langValuesDirty = true;
            summary.push(`Language: ${capitalize(matchedSlug)}`);
          }
        } else {
          const existingParts = customLangText ? customLangText.split(",").map(s => s.trim()).filter(Boolean) : [];
          if (!existingParts.some(p => p.toLowerCase() === plannedLang.toLowerCase())) {
            existingParts.push(plannedLang);
            customLangText = existingParts.join(", ");
            customLangDirty = true;
            summary.push(`Language: ${plannedLang}`);
          }
        }
      } else {
        reminders.push(`Lv ${targetLevel} INT Increase: pick +1 Language on the Character sheet.`);
      }
    }

    // 1c. Skill Increase
    if (lvlData?.hasSkillIncrease && typeof lp.skillIncrease === "string" && CORE_SKILL_SLUGS.includes(lp.skillIncrease)) {
      const slug = lp.skillIncrease;
      const curRank = Number(workingSkillRanks[slug] ?? 0);
      const maxLegal = maxSkillRankForLevel(targetLevel);
      const nextRank = Math.min(maxLegal, curRank + 1);
      if (nextRank > curRank) {
        workingSkillRanks[slug] = nextRank;
        actorUpdates[`system.skills.${slug}.rank`] = nextRank;
        summary.push(`Skill: ${capitalize(slug)} → ${RANK_FULL[nextRank]}`);
      }
    }

    // 1d. Planned Alchemical Formulas (appended cleanly to `actor.system.crafting.formulas`)
    const plannedFormulas = Array.isArray(lp.formulas) ? lp.formulas : [];
    for (const fm of plannedFormulas) {
      if (!fm?.uuid || existingFormulaUuids.has(fm.uuid)) continue;
      existingFormulaUuids.add(fm.uuid);
      existingFormulasRaw.push({ uuid: fm.uuid });
      addedFormulaNames.push(fm.name || "Formula");
      formulasDirty = true;
    }
    if (lvlData?.isAlchemistFutureGain && plannedFormulas.length < (lvlData.formulaMilestone?.gain || 2)) {
      const rem = (lvlData.formulaMilestone?.gain || 2) - plannedFormulas.length;
      reminders.push(`Alchemist Lv ${targetLevel}: add ${rem} more free common alchemical formula${rem === 1 ? "" : "s"} (Item Lv ≤ ${targetLevel}) on the Crafting tab.`);
    }
  }

  if (langValuesDirty) {
    actorUpdates["system.details.languages.value"] = liveLangValues;
  }
  if (customLangDirty) {
    actorUpdates["system.details.languages.details"] = customLangText;
  }
  if (formulasDirty) {
    actorUpdates["system.crafting.formulas"] = existingFormulasRaw;
    summary.push(`Formulas: ${addedFormulaNames.join(", ")}`);
  }

  if (Object.keys(actorUpdates).length > 0) {
    _plannerUpdatingActors.add(actor.id);
    try {
      await actor.update(actorUpdates, { [MODULE_ID]: { fromLevelPlanner: true } });
    } finally {
      setTimeout(() => _plannerUpdatingActors.delete(actor.id), 1500);
    }
  }

  // Allow PF2e's native level-up feature grants & Dual Class auto-sync hook to settle
  if (updateActorLevel) {
    await new Promise(resolve => setTimeout(resolve, 350));
  }

  // 2. Embed planned Feats sequentially so PF2e ChoiceSet prompts work cleanly
  const addedFeats = [];
  for (const targetLevel of cleanLevels) {
    const lvlData = roadmap?.levels?.find(l => l.level === targetLevel);
    const lp = plan.levels[String(targetLevel)] || { feats: {} };

    for (const slot of lvlData?.featSlots || []) {
      const planned = lp.feats?.[slot.slotKey];
      if (!planned?.uuid && !planned?.itemData) continue;

      const liveSlot = resolveLiveFeatSlot(actor, slot.groupId, targetLevel);
      if (liveSlot.alreadyFilled) continue;

      try {
        const obj = await materializePlannedItem(planned, "feat");
        if (!obj) continue;

        if (obj.system) {
          obj.system.location = liveSlot.id;
        }

        // Pre-populate any planned PF2e ChoiceSet selections directly on the feat's rules so PF2e
        // auto-applies the chosen sub-feat/skill via native ChoiceSet + GrantItem without re-prompting!
        // Uses the exact same skip/predicate logic as `extractFeatChoiceSpecs` so flag indices always align.
        const appliedSubNames = [];
        if (planned.choices && typeof planned.choices === "object" && Array.isArray(obj.system?.rules)) {
          const itemSlugOrName = obj.system?.slug || obj.name || planned.name;
          const usedFlags = new Set();
          const currentSelections = {};
          for (const [k, v] of Object.entries(planned.choices)) {
            if (v && typeof v === "object" && v.value !== undefined) currentSelections[k] = v.value;
            else if (typeof v === "string") currentSelections[k] = v;
          }
          for (let rIdx = 0; rIdx < obj.system.rules.length; rIdx++) {
            const r = obj.system.rules[rIdx];
            if (!r || r.key !== "ChoiceSet") continue;
            if (r.selection !== undefined && r.selection !== null && r.selection !== "") continue;
            if (!r.choices) continue;
            if (!passesLevelPredicate(r.predicate, targetLevel, currentSelections)) continue;
            if (typeof r.choices === "object" && !Array.isArray(r.choices)) {
              if (r.choices.ownedItems || r.choices.attacks || r.choices.unarmedAttacks || r.choices.spellcasting) continue;
            }
            let fl = getChoiceSetFlag(r, itemSlugOrName, rIdx);
            if (usedFlags.has(fl)) fl = `${fl}_${rIdx}`;
            usedFlags.add(fl);
            const savedCh = planned.choices[fl];
            const savedVal = savedCh && typeof savedCh === "object" ? savedCh.value : savedCh;
            if (savedVal !== undefined && savedVal !== null && savedVal !== "") {
              r.selection = savedVal;
              if (savedCh?.name) appliedSubNames.push(savedCh.name);
            }
          }
        }

        const created = await actor.createEmbeddedDocuments("Item", [obj]);
        if (created?.length > 0) {
          // If this feat used a planner Bonus Feat sub-choice (e.g. "Advanced Deduction" / "Advanced Maneuver"
          // where Foundry PF2e has no native ChoiceSet rule), embed the chosen feat into PF2e's Bonus Feats section!
          const bonusChoice = planned.choices?.[BONUS_GRANT_CHOICE_FLAG];
          const bonusUuid = bonusChoice && typeof bonusChoice === "object" ? bonusChoice.value : bonusChoice;
          if (bonusUuid && isLikelyCompendiumOrItemUuid(bonusUuid)) {
            try {
              const bonusObj = await materializePlannedItem({ uuid: bonusUuid }, "feat");
              if (bonusObj) {
                bonusObj.system = bonusObj.system || {};
                bonusObj.system.location = null; // PF2e native Bonus Feats section
                bonusObj.flags = bonusObj.flags || {};
                bonusObj.flags[MODULE_ID] = {
                  ...(bonusObj.flags[MODULE_ID] || {}),
                  bonusGrantParentId: created[0].id
                };
                const bonusCreated = await actor.createEmbeddedDocuments("Item", [bonusObj]);
                if (bonusCreated?.length > 0) {
                  appliedSubNames.push(`${bonusCreated[0].name} [Bonus]`);
                }
              }
            } catch (bonusErr) {
              console.warn(`PF2e Awesome GM Utilities | Failed to add planned bonus feat for "${planned.name}":`, bonusErr);
            }
          }

          addedFeats.push(
            appliedSubNames.length > 0
              ? `${created[0].name} (→ ${appliedSubNames.join(", ")})`
              : created[0].name
          );
        }
      } catch (err) {
        console.warn(`PF2e Awesome GM Utilities | Failed to add planned feat "${planned.name}":`, err);
      }
    }
  }
  if (addedFeats.length > 0) {
    summary.push(`Feats: ${addedFeats.join(", ")}`);
  }

  // 3. Sync Spellcasting Entry slots & auto-granted focus / subclass / deity spells for the new level
  try {
    const syncRes = await createOrSyncAllSpellcastingEntries(actor);
    if (syncRes.created.length > 0) summary.push(`Created entries: ${syncRes.created.join(", ")}`);
    if (syncRes.synced.length > 0) summary.push(`Synced spell slots: ${syncRes.synced.join(", ")}`);
    if (syncRes.addedSpells?.length > 0) summary.push(`Auto-added spells: ${syncRes.addedSpells.join(", ")}`);
    if (syncRes.preparedFonts?.length > 0) summary.push(`Prepared Font: ${syncRes.preparedFonts.join(", ")}`);
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Spellcasting sync during level-up failed:", err);
  }

  // 4. Embed any planned Spells into their matching Spellcasting Entry (skipping duplicates)
  const allPlannedSpells = [];
  for (const targetLevel of cleanLevels) {
    const lp = plan.levels[String(targetLevel)];
    if (Array.isArray(lp?.spells) && lp.spells.length > 0) {
      allPlannedSpells.push(...lp.spells);
    }
  }

  if (allPlannedSpells.length > 0) {
    const postReport = analyzeCharacter(actor);
    const addedSpells = [];

    for (const sp of allPlannedSpells) {
      if (!sp?.uuid && !sp?.itemData) continue;
      try {
        const obj = await materializePlannedItem(sp, "spell");
        if (!obj) continue;

        let targetEntryId = null;
        const isFocusPlanned = String(sp.entryKey || "").startsWith("focus:");
        if (sp.entryKey) {
          const matchedSrc = postReport?.spellcasting?.sources?.find(s => s.key === sp.entryKey && s.entryId);
          if (matchedSrc) targetEntryId = matchedSrc.entryId;
        }
        if (!targetEntryId && isFocusPlanned) {
          const focusMatch = (actor.itemTypes?.spellcastingEntry || []).find(e =>
            e.system?.prepared?.value === "focus" && (!sp.tradition || e.system?.tradition?.value === sp.tradition)
          ) || (actor.itemTypes?.spellcastingEntry || []).find(e => e.system?.prepared?.value === "focus");
          if (focusMatch) targetEntryId = focusMatch.id;
        } else {
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
        }
        if (!targetEntryId) continue;

        // Avoid duplicate spell in the same spellcasting entry
        const spNameLower = String(obj.name || sp.name || "").toLowerCase();
        const duplicate = (actor.itemTypes?.spell || []).some(existing =>
          existing.system?.location?.value === targetEntryId
          && (
            (sp.uuid && (existing._stats?.compendiumSource || existing.flags?.core?.sourceId) === sp.uuid)
            || String(existing.name || "").toLowerCase() === spNameLower
          )
        );
        if (duplicate) continue;

        const targetEntryDoc = actor.items?.get(targetEntryId);
        const isFocusTarget = targetEntryDoc?.system?.prepared?.value === "focus";
        obj.system = obj.system || {};
        obj.system.location = obj.system.location || {};
        obj.system.location.value = targetEntryId;
        if (!isFocusTarget && !sp.isCantrip && sp.rank && Number(sp.rank) > Number(obj.system.level?.value ?? 1)) {
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
    newLevel: Math.max(Number(actor.level || 1), maxTargetLevel),
    summary,
    reminders
  };
}

/**
 * Applies the next level-up (actor.level -> actor.level + 1) natively on the live actor.
 *
 * @param {Actor} actor
 * @returns {Promise<{ ok: boolean, newLevel: number, summary: string[], reminders: string[] }>}
 */
export async function applyPlannedLevelUp(actor) {
  if (!actor || actor.type !== "character") return { ok: false, newLevel: 0, summary: [], reminders: [] };
  const currentLevel = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
  if (currentLevel >= 20) {
    ui.notifications?.info(`${actor.name} is already Level 20!`);
    return { ok: false, newLevel: 20, summary: [], reminders: [] };
  }
  return await applyPlannedLevelChoices(actor, [currentLevel + 1], {
    updateActorLevel: true,
    effectiveCurrentLevel: currentLevel
  });
}

/* ------------------------------------------------------------------------- */
/* 6. DE-LEVEL / REVERT TO EARLIER LEVEL (SAVE TO BUILD PLAN & ROLLBACK)     */
/* ------------------------------------------------------------------------- */

const SKIP_REVERT_FEAT_GROUPS = new Set([
  "classfeature",
  "ancestryfeature",
  "pfsboon",
  "deityboon",
  "curse",
  "bonus",
  "mythic",
  "calling"
]);

/**
 * Resolves a reusable compendium or world UUID for an embedded Actor Item so it remains
 * valid after the embedded document is deleted during a de-level.
 * Returns `{ uuid: string|null, isCustomSnapshot: boolean }`.
 */
function resolveReusableSourceUuid(doc, itemType = "feat") {
  if (!doc) return { uuid: null, isCustomSnapshot: true };

  const candidates = [
    doc._stats?.compendiumSource,
    doc.flags?.core?.sourceId,
    doc.sourceId
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim() && !raw.startsWith("Actor.")) {
      return { uuid: raw.trim(), isCustomSnapshot: false };
    }
  }

  // Fallback 1: Match in world Items directory by slug or name
  const docSlug = normalizeSlug(doc.slug || doc.system?.slug || doc.name);
  const docNameLower = String(doc.name || "").trim().toLowerCase();
  if (game.items?.contents) {
    const worldMatch = game.items.contents.find(i =>
      i.type === itemType
      && (
        (docSlug && normalizeSlug(i.slug || i.system?.slug || i.name) === docSlug)
        || (docNameLower && String(i.name || "").trim().toLowerCase() === docNameLower)
      )
    );
    if (worldMatch?.uuid) {
      return { uuid: worldMatch.uuid, isCustomSnapshot: false };
    }
  }

  // Fallback 2: Match in already-loaded lightweight compendium index cache (zero extra I/O)
  const cache = itemType === "spell" ? _spellIndexCache : (itemType === "feat" ? _featIndexCache : null);
  if (Array.isArray(cache) && docNameLower) {
    const cachedMatch = cache.find(entry => String(entry.name || "").trim().toLowerCase() === docNameLower);
    if (cachedMatch?.uuid) {
      return { uuid: cachedMatch.uuid, isCustomSnapshot: false };
    }
  }

  return { uuid: null, isCustomSnapshot: true };
}

/**
 * Produces a clean portable Item data object for custom/homebrew feats or spells
 * that lack a compendium/world source UUID so they can be restored losslessly on re-level.
 */
function sanitizeEmbeddedItemSnapshot(doc) {
  if (!doc || typeof doc.toObject !== "function") return null;
  const obj = doc.toObject();
  delete obj._id;
  delete obj.sort;
  delete obj.folder;
  delete obj.ownership;
  if (obj.flags?.pf2e && "grantedBy" in obj.flags.pf2e) {
    delete obj.flags.pf2e.grantedBy;
  }
  return obj;
}

/**
 * Reads the persisted (non-Rule-Element) manual skill rank stored on the actor document.
 * Prevents accidentally decrementing skills auto-granted purely by PF2e Rule Elements.
 */
function getStoredSourceSkillRank(actor, slug) {
  const srcSkills = actor?._source?.system?.skills;
  if (srcSkills && typeof srcSkills === "object") {
    return Math.max(0, Math.min(4, Number(srcSkills[slug]?.rank ?? 0)));
  }
  return Math.max(0, Math.min(4, Number(actor?.system?.skills?.[slug]?.rank ?? 0)));
}

/**
 * Computes the maximum leveled spell rank legally available for a spellcasting source at `level`,
 * accounting for any archetype spellcasting feats scheduled to be deleted on revert.
 */
function estimateMaxSpellRankAtLevel(src, level, deletedFeatSlugs = new Set()) {
  if (!src || src.isFocus || src.castingType === "focus") return 10;
  if (src.isDivineFont) {
    return src.isBattleFont
      ? (level >= 20 ? 10 : Math.min(9, Math.ceil(level / 2)))
      : Math.min(10, Math.ceil(level / 2));
  }

  if (src.sourceKind === "archetype") {
    const slugLower = String(src.classSlug || "").toLowerCase();
    const deletedHas = (tier) => Array.from(deletedFeatSlugs).some(s =>
      s.includes(tier) && s.includes("spellcasting") && (!slugLower || s.includes(slugLower))
    );
    const hasBasic = (src.hasBasic !== undefined ? Boolean(src.hasBasic) : true) && !deletedHas("basic");
    const hasExpert = (src.hasExpert !== undefined ? Boolean(src.hasExpert) : true) && !deletedHas("expert");
    const hasMaster = (src.hasMaster !== undefined ? Boolean(src.hasMaster) : true) && !deletedHas("master");
    return computeExpectedSlotsForSourceAtLevel(
      { ...src, hasBasic, hasExpert, hasMaster },
      level,
      { projectAllArchetypeTiers: false }
    ).maxRank;
  }

  return computeExpectedSlotsForSourceAtLevel(src, level).maxRank;
}

/**
 * Infers which level in `[minLevel..maxLevel]` unlocked a given spell rank for a casting source.
 */
function inferSpellUnlockLevel(src, spellRank, minLevel, maxLevel) {
  let rawUnlock = spellRank * 2 - 1;
  if (src?.sourceKind === "archetype") {
    const archMap = { 1: 4, 2: 6, 3: 8, 4: 12, 5: 14, 6: 16, 7: 18, 8: 20 };
    rawUnlock = archMap[spellRank] || maxLevel;
  }
  return Math.max(minLevel, Math.min(maxLevel, rawUnlock));
}

/**
 * Non-destructively inspects everything that will be saved into the character's Level Plan
 * and reverted on the live sheet when de-leveling from `actor.level` down to `targetLevel`.
 *
 * @param {Actor} actor
 * @param {number} targetLevel
 * @returns {Promise<object>}
 */
export async function inspectLevelRevert(actor, targetLevel) {
  const currentLevel = Math.max(1, Math.min(20, Number(actor?.level ?? actor?.system?.details?.level?.value ?? 1)));
  const cleanTarget = Math.max(1, Math.min(currentLevel - 1, Math.floor(Number(targetLevel) || (currentLevel - 1))));

  if (!actor || actor.type !== "character" || currentLevel <= 1 || cleanTarget >= currentLevel) {
    return {
      ok: false,
      actorId: actor?.id || null,
      actorName: actor?.name || "",
      currentLevel,
      targetLevel: cleanTarget,
      revertedLevels: [],
      levels: [],
      untrackedSkillCandidates: [],
      totals: {
        boostLevelsCount: 0,
        boostPicksCount: 0,
        featsCount: 0,
        customFeatsCount: 0,
        trackedSkillsCount: 0,
        untrackedSkillSlotsCount: 0,
        overCapSkillsCount: 0,
        intDropsCount: 0,
        spellsCount: 0,
        formulasCount: 0,
        classFeaturesCount: 0,
        dualClassFeaturesCount: 0,
        spellEntriesToSync: []
      },
      reminders: []
    };
  }

  const revertedLevels = [];
  for (let l = cleanTarget + 1; l <= currentLevel; l++) {
    revertedLevels.push(l);
  }

  const roadmap = buildLevelRoadmap(actor, { effectiveCurrentLevel: currentLevel });
  const existingPlan = getActorLevelPlan(actor);
  const dualInfo = getActorDualClassInfo(actor, roadmap?.variants);
  const checkerReport = roadmap?.checkerReport || analyzeCharacter(actor);
  const manualAttributes = Boolean(actor.system?.build?.attributes?.manual);
  const liveAttrBoosts = actor.system?.build?.attributes?.boosts || {};

  // Build per-level skeleton
  const levelMap = new Map();
  for (const lvl of revertedLevels) {
    const lvlData = roadmap?.levels?.find(x => x.level === lvl) || null;
    levelMap.set(lvl, {
      level: lvl,
      lvlData,
      hasBoostsTier: Boolean(lvlData?.hasBoosts),
      boosts: [],
      boostLabels: "",
      intModDrop: null,
      trackedIntBonusSkill: null,
      trackedIntBonusSkillRevert: null,
      trackedIntBonusLanguage: "",
      trackedIntBonusLanguageWillRemove: false,
      feats: [],
      hasSkillIncreaseSlot: Boolean(lvlData?.hasSkillIncrease),
      skillIncreaseMaxLegal: maxSkillRankForLevel(lvl),
      trackedSkillIncrease: null,
      overCapExtraAdjustments: [],
      untrackedSkillIncrease: false,
      spells: [],
      formulas: [],
      classFeaturesRemoved: (lvlData?.classFeatures || []).map(f => f.name),
      dualClassFeaturesToDelete: []
    });
  }

  // 1. Attribute Boosts & INT Modifier Drop Detection (ascending from targetLevel+1..currentLevel)
  const runningBoosts = getBaseBoostCounts(actor, cleanTarget, dualInfo);
  if (!manualAttributes) {
    for (const lvl of revertedLevels) {
      const info = levelMap.get(lvl);
      const prevIntMod = computeModFromBoostCount(runningBoosts.int || 0).mod;
      const tierRaw = Array.isArray(liveAttrBoosts[lvl])
        ? liveAttrBoosts[lvl].filter(a => ABILITY_KEYS.includes(a))
        : [];
      if (tierRaw.length > 0) {
        info.boosts = [...tierRaw];
        info.boostLabels = tierRaw.map(a => ABILITY_LABELS[a]).join(", ");
        for (const a of tierRaw) {
          runningBoosts[a] = (runningBoosts[a] || 0) + 1;
        }
      }
      const newIntMod = computeModFromBoostCount(runningBoosts.int || 0).mod;
      if (newIntMod > prevIntMod) {
        info.intModDrop = {
          fromMod: newIntMod,
          toMod: prevIntMod,
          fromModStr: `${newIntMod >= 0 ? "+" : ""}${newIntMod}`,
          toModStr: `${prevIntMod >= 0 ? "+" : ""}${prevIntMod}`
        };
        const lp = existingPlan.levels[String(lvl)];
        if (lp?.intBonusSkill === "__lore__" || (typeof lp?.intBonusSkill === "string" && CORE_SKILL_SLUGS.includes(lp.intBonusSkill))) {
          info.trackedIntBonusSkill = lp.intBonusSkill;
        }
        if (typeof lp?.intBonusLanguage === "string" && lp.intBonusLanguage.trim()) {
          info.trackedIntBonusLanguage = lp.intBonusLanguage.trim();
        }
      }
    }
  }

  // 2. Live Slotted Feats at Reverted Levels (targetLevel+1 .. currentLevel)
  const seenFeatIds = new Set();
  const deletedFeatSlugs = new Set();
  const pushLiveFeat = (lvl, slotKey, groupId, groupLabel, feat) => {
    if (!feat || seenFeatIds.has(feat.id)) return;
    if (feat.flags?.pf2e?.grantedBy?.id) return; // Granted sub-item; PF2e cascades deletion automatically
    const cat = String(feat.system?.category || "").toLowerCase();
    if (cat === "classfeature" || cat === "ancestryfeature") return;
    const info = levelMap.get(lvl);
    if (!info) return;

    seenFeatIds.add(feat.id);
    const featSlug = normalizeSlug(feat.slug || feat.system?.slug || feat.name);
    if (featSlug) deletedFeatSlugs.add(featSlug);

    const { uuid: sourceUuid, isCustomSnapshot } = resolveReusableSourceUuid(feat, "feat");
    const fTraits = toStringArray(feat.system?.traits?.value).map(normalizeSlug);
    info.feats.push({
      slotKey,
      groupId,
      groupLabel,
      itemId: feat.id,
      name: feat.name,
      img: feat.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number(feat.system?.level?.value ?? lvl),
      category: feat.system?.category || "",
      sourceUuid,
      isCustomSnapshot,
      isDedication: fTraits.includes("dedication") || /\bdedication\b/i.test(feat.name || ""),
      prerequisites: (feat.system?.prerequisites?.value || []).map(p => p?.value || p).filter(Boolean)
    });
  };

  // Scan authoritative `actor.feats` groups first
  if (actor.feats && typeof actor.feats.values === "function") {
    for (const group of actor.feats.values()) {
      if (!group || SKIP_REVERT_FEAT_GROUPS.has(group.id)) continue;
      const slots = extractGroupSlots(group);
      const groupLabel = game.i18n?.localize?.(group.label) || group.label || capitalize(group.id);
      for (const slot of slots) {
        const slotLvl = Number(slot?.level);
        if (!slot?.feat || !levelMap.has(slotLvl)) continue;
        const slotKey = `${group.id}-${slotLvl}`;
        pushLiveFeat(slotLvl, slotKey, group.id, groupLabel, slot.feat);
      }
    }
  }

  // Fallback scan of embedded feat `system.location` (e.g. "class-5", "archetype-4")
  for (const feat of actor.itemTypes?.feat || []) {
    if (seenFeatIds.has(feat.id)) continue;
    const loc = typeof feat.system?.location === "string" ? feat.system.location : "";
    const match = loc.match(/^([a-z0-9_]+)-(\d+)$/i);
    if (!match) continue;
    const groupId = match[1].toLowerCase();
    const slotLvl = Number(match[2]);
    if (SKIP_REVERT_FEAT_GROUPS.has(groupId) || !levelMap.has(slotLvl)) continue;
    const roadmapSlot = levelMap.get(slotLvl)?.lvlData?.featSlots?.find(s => s.slotKey === loc);
    pushLiveFeat(slotLvl, loc, groupId, roadmapSlot?.groupLabel || capitalize(groupId), feat);
  }

  // 3. Dual Class Features above targetLevel (in case variant module doesn't prune on level-down)
  if (dualInfo?.system?.items) {
    for (const item of actor.items || []) {
      const dcFlags = item.flags?.[VARIANT_RULES_MODULE_ID];
      if (!dcFlags?.grantedByDualClass) continue;
      const dcKey = dcFlags.dualClassFeatureKey;
      const entryMeta = dcKey ? dualInfo.system.items[dcKey] : null;
      const grantLvl = Number(entryMeta?.level ?? item.system?.level?.value ?? 1);
      if (grantLvl > cleanTarget) {
        const bucketLvl = Math.max(cleanTarget + 1, Math.min(currentLevel, grantLvl));
        levelMap.get(bucketLvl)?.dualClassFeaturesToDelete.push({
          itemId: item.id,
          name: item.name,
          level: grantLvl
        });
      }
    }
  }

  // 4. Skill Increases & INT Bonus Skill/Language (descending pass from currentLevel -> targetLevel+1)
  const workingSourceRanks = {};
  for (const slug of CORE_SKILL_SLUGS) {
    workingSourceRanks[slug] = getStoredSourceSkillRank(actor, slug);
  }

  const baseAncestryLangs = getBaseAncestryLanguageSet(actor);
  const liveLangSet = new Set(
    (Array.isArray(actor.system?.details?.languages?.value) ? actor.system.details.languages.value : [])
      .map(s => String(s || "").toLowerCase())
      .filter(Boolean)
  );
  const customLangLower = String(actor.system?.details?.languages?.details || "").toLowerCase();

  for (let i = revertedLevels.length - 1; i >= 0; i--) {
    const lvl = revertedLevels[i];
    const info = levelMap.get(lvl);
    const lp = existingPlan.levels[String(lvl)];

    // Undo Skill Increase BEFORE INT Bonus Skill (reverse of level-up application order)
    if (info.hasSkillIncreaseSlot && typeof lp?.skillIncrease === "string" && CORE_SKILL_SLUGS.includes(lp.skillIncrease)) {
      const slug = lp.skillIncrease;
      const curRank = workingSourceRanks[slug] || 0;
      if (curRank >= 1) {
        info.trackedSkillIncrease = {
          slug,
          label: capitalize(slug),
          fromRank: curRank,
          toRank: curRank - 1,
          transition: `${capitalize(slug)} (${RANK_SHORT[curRank]} → ${RANK_SHORT[curRank - 1]})`,
          source: "plan"
        };
        workingSourceRanks[slug] = curRank - 1;
      }
    }

    if (info.intModDrop) {
      if (info.trackedIntBonusSkill && info.trackedIntBonusSkill !== "__lore__") {
        const slug = info.trackedIntBonusSkill;
        const curRank = workingSourceRanks[slug] || 0;
        if (curRank >= 1) {
          info.trackedIntBonusSkillRevert = {
            slug,
            label: capitalize(slug),
            fromRank: curRank,
            toRank: curRank - 1,
            transition: `${capitalize(slug)} (${RANK_SHORT[curRank]} → ${RANK_SHORT[curRank - 1]})`
          };
          workingSourceRanks[slug] = curRank - 1;
        }
      }
      if (info.trackedIntBonusLanguage) {
        const matchedSlug = resolveLanguageSlug(info.trackedIntBonusLanguage);
        if (matchedSlug && liveLangSet.has(matchedSlug) && !baseAncestryLangs.has(matchedSlug)) {
          info.trackedIntBonusLanguageWillRemove = true;
          liveLangSet.delete(matchedSlug);
        } else if (!matchedSlug && customLangLower.includes(info.trackedIntBonusLanguage.toLowerCase())) {
          info.trackedIntBonusLanguageWillRemove = true;
        }
      }
    }
  }

  // Over-Cap Legal Rank Enforcement (catches Master/Legendary/Expert increases even without prior Level Plan!)
  const capAtTarget = maxSkillRankForLevel(cleanTarget);
  for (const slug of CORE_SKILL_SLUGS) {
    while ((workingSourceRanks[slug] || 0) > capAtTarget) {
      const curRank = workingSourceRanks[slug];
      const nextRank = curRank - 1;
      // Assign to the highest unassigned reverted skill-increase level that legally allowed `curRank`
      let assignedInfo = null;
      for (let i = revertedLevels.length - 1; i >= 0; i--) {
        const cand = levelMap.get(revertedLevels[i]);
        if (cand.hasSkillIncreaseSlot && !cand.trackedSkillIncrease && cand.skillIncreaseMaxLegal >= curRank) {
          assignedInfo = cand;
          break;
        }
      }
      const record = {
        slug,
        label: capitalize(slug),
        fromRank: curRank,
        toRank: nextRank,
        transition: `${capitalize(slug)} (${RANK_SHORT[curRank]} → ${RANK_SHORT[nextRank]})`,
        source: "over-cap"
      };
      if (assignedInfo) {
        assignedInfo.trackedSkillIncrease = record;
      } else {
        levelMap.get(currentLevel)?.overCapExtraAdjustments.push(record);
      }
      workingSourceRanks[slug] = nextRank;
    }
  }

  for (const lvl of revertedLevels) {
    const info = levelMap.get(lvl);
    info.untrackedSkillIncrease = Boolean(info.hasSkillIncreaseSlot && !info.trackedSkillIncrease);
  }

  const untrackedSkillCandidates = CORE_SKILL_SLUGS
    .filter(slug => (workingSourceRanks[slug] || 0) >= 1)
    .map(slug => {
      const curRank = workingSourceRanks[slug];
      return {
        slug,
        label: capitalize(slug),
        currentRank: curRank,
        currentRankShort: RANK_SHORT[curRank],
        nextRankShort: RANK_SHORT[curRank - 1],
        optionLabel: `${capitalize(slug)} (${RANK_SHORT[curRank]} → ${RANK_SHORT[curRank - 1]})`
      };
    });

  // 5. Spellcasting Over-Rank Spells, Tracked Planned Spells, and Slot Sync Preview
  const spSources = checkerReport?.spellcasting?.sources || [];
  const sourceByEntryId = new Map();
  const spellEntriesToSync = [];

  for (const src of spSources) {
    if (!src.entryExists || !src.entryId) continue;
    sourceByEntryId.set(src.entryId, src);
    if (src.isFocus || src.castingType === "focus") continue;
    const targetMaxRank = estimateMaxSpellRankAtLevel(src, cleanTarget, deletedFeatSlugs);
    const curMaxRank = estimateMaxSpellRankAtLevel(src, currentLevel, new Set());
    spellEntriesToSync.push({
      entryId: src.entryId,
      key: src.key,
      name: src.matchedEntryName || src.title,
      curMaxRank,
      targetMaxRank
    });
  }

  // Index planned spells in revertedLevels for tracked matching
  const plannedSpellEntries = [];
  for (const lvl of revertedLevels) {
    const lp = existingPlan.levels[String(lvl)];
    for (const sp of Array.isArray(lp?.spells) ? lp.spells : []) {
      if (!sp) continue;
      plannedSpellEntries.push({ level: lvl, sp, matched: false });
    }
  }

  const seenSpellIds = new Set();
  for (const spell of actor.itemTypes?.spell || []) {
    if (seenSpellIds.has(spell.id)) continue;
    const entryId = spell.system?.location?.value;
    if (!entryId) continue;
    const entryDoc = actor.items?.get(entryId);
    if (!entryDoc || entryDoc.type !== "spellcastingEntry") continue;

    const castingType = entryDoc.system?.prepared?.value;
    const isCantrip = Boolean(spell.isCantrip || spell.system?.traits?.value?.includes("cantrip"));
    const isRitual = castingType === "ritual" || Boolean(spell.isRitual);
    const isFocus = castingType === "focus";
    if (isRitual || isFocus) continue;

    const src = sourceByEntryId.get(entryId) || null;
    const effectiveRank = isCantrip
      ? 0
      : Number(spell.system?.location?.heightenedLevel ?? spell.rank ?? spell.system?.level?.value ?? 1);
    const { uuid: sourceUuid, isCustomSnapshot } = resolveReusableSourceUuid(spell, "spell");
    const spellNameLower = String(spell.name || "").trim().toLowerCase();

    let assignedLevel = null;
    let reason = null;

    // Check 1: Explicitly tracked in existing Level Plan for a reverted level (matching rank & cantrip flag!)
    const trackedMatch = plannedSpellEntries.find(pe => {
      if (pe.matched) return false;
      if (Boolean(pe.sp.isCantrip) !== isCantrip) return false;
      if (!isCantrip && Number(pe.sp.rank) > 0 && Number(pe.sp.rank) !== effectiveRank) return false;
      const pName = String(pe.sp.name || "").trim().toLowerCase();
      const uuidMatch = sourceUuid && pe.sp.uuid && pe.sp.uuid === sourceUuid;
      const nameMatch = pName && pName === spellNameLower;
      if (!uuidMatch && !nameMatch) return false;
      if (pe.sp.entryKey && src?.key && pe.sp.entryKey !== src.key) return false;
      return true;
    });

    if (trackedMatch) {
      trackedMatch.matched = true;
      assignedLevel = trackedMatch.level;
      reason = "plan";
    } else if (!isCantrip && src && !src.isDivineFont && castingType !== "innate") {
      // Check 2: Over-rank spell exceeding maximum legal rank at targetLevel
      const maxAtTarget = estimateMaxSpellRankAtLevel(src, cleanTarget, deletedFeatSlugs);
      if (effectiveRank > maxAtTarget) {
        assignedLevel = inferSpellUnlockLevel(src, effectiveRank, cleanTarget + 1, currentLevel);
        reason = "over-rank";
      }
    }

    if (assignedLevel && levelMap.has(assignedLevel)) {
      seenSpellIds.add(spell.id);
      levelMap.get(assignedLevel).spells.push({
        itemId: spell.id,
        name: spell.name,
        img: spell.img || "systems/pf2e/icons/default-icons/spell.svg",
        rank: isCantrip ? 0 : effectiveRank,
        isCantrip,
        rankLabel: isCantrip ? "Cantrip" : `Rank ${effectiveRank}`,
        tradition: entryDoc.system?.tradition?.value || src?.tradition || "",
        entryKey: src?.key || "",
        entryId,
        sourceUuid,
        isCustomSnapshot,
        reason
      });
    }
  }

  // 6. Alchemist / Crafting Formulas (Tracked in Plan OR within reverted level band)
  const knownFormulas = Array.isArray(actor.system?.crafting?.formulas) ? actor.system.crafting.formulas : [];
  const plannedFormulaByUuid = new Map();
  for (const lvl of revertedLevels) {
    const lp = existingPlan.levels[String(lvl)];
    for (const fm of Array.isArray(lp?.formulas) ? lp.formulas : []) {
      if (fm?.uuid && !plannedFormulaByUuid.has(fm.uuid)) {
        plannedFormulaByUuid.set(fm.uuid, { level: lvl, fm });
      }
    }
  }

  const isAlchemist = Boolean(roadmap?.isAlchemist);
  const cacheByUuid = Array.isArray(_formulaIndexCache)
    ? new Map(_formulaIndexCache.map(r => [r.uuid, r]))
    : null;

  for (const rawF of knownFormulas) {
    const fUuid = rawF?.uuid;
    if (!fUuid) continue;

    if (plannedFormulaByUuid.has(fUuid)) {
      const { level: pLvl, fm } = plannedFormulaByUuid.get(fUuid);
      levelMap.get(pLvl)?.formulas.push({
        uuid: fUuid,
        name: fm.name || "Formula",
        img: fm.img || "systems/pf2e/icons/default-icons/consumable.svg",
        level: Number(fm.level ?? pLvl),
        reason: "plan"
      });
      continue;
    }

    if (!isAlchemist) continue;

    // Resolve item level cleanly (cache first, then fast fromUuid fallback)
    let fName = "";
    let fImg = "systems/pf2e/icons/default-icons/consumable.svg";
    let fItemLvl = null;

    const cached = cacheByUuid?.get(fUuid);
    if (cached) {
      fName = cached.name;
      fImg = cached.img || fImg;
      fItemLvl = Number(cached.level ?? 0);
    } else {
      try {
        const doc = await fromUuid(fUuid);
        if (doc) {
          fName = doc.name || "Formula";
          fImg = doc.img || fImg;
          fItemLvl = Number(doc.system?.level?.value ?? 0);
        }
      } catch { /* ignore unresolvable formula UUID */ }
    }

    // Only capture formulas inside the exact reverted level band (never touch higher-level loot formulas!)
    if (fItemLvl != null && fItemLvl > cleanTarget && fItemLvl <= currentLevel) {
      levelMap.get(fItemLvl)?.formulas.push({
        uuid: fUuid,
        name: fName || "Formula",
        img: fImg,
        level: fItemLvl,
        reason: "reverted-level-band"
      });
    }
  }

  // 7. Aggregate Totals & Honest Reminders
  const levelsArr = revertedLevels.map(l => levelMap.get(l));
  const reminders = [];

  let boostLevelsCount = 0;
  let boostPicksCount = 0;
  let featsCount = 0;
  let customFeatsCount = 0;
  let trackedSkillsCount = 0;
  let untrackedSkillSlotsCount = 0;
  let overCapSkillsCount = 0;
  let intDropsCount = 0;
  let spellsCount = 0;
  let formulasCount = 0;
  let classFeaturesCount = 0;
  let dualClassFeaturesCount = 0;

  for (const info of levelsArr) {
    if (info.boosts.length > 0) {
      boostLevelsCount++;
      boostPicksCount += info.boosts.length;
    }
    featsCount += info.feats.length;
    customFeatsCount += info.feats.filter(f => f.isCustomSnapshot).length;
    if (info.trackedSkillIncrease) {
      trackedSkillsCount++;
      if (info.trackedSkillIncrease.source === "over-cap") overCapSkillsCount++;
    }
    overCapSkillsCount += info.overCapExtraAdjustments.length;
    if (info.untrackedSkillIncrease) untrackedSkillSlotsCount++;
    if (info.intModDrop) {
      intDropsCount++;
      if (!info.trackedIntBonusSkillRevert || !info.trackedIntBonusLanguageWillRemove) {
        const missingBits = [];
        if (!info.trackedIntBonusSkillRevert) missingBits.push("-1 Trained Skill / Lore");
        if (!info.trackedIntBonusLanguageWillRemove) missingBits.push("-1 Language");
        reminders.push(
          `Lv ${info.level} INT modifier drops (${info.intModDrop.fromModStr} → ${info.intModDrop.toModStr}): verify ${missingBits.join(" & ")} on the sheet.`
        );
      }
    }
    spellsCount += info.spells.length;
    formulasCount += info.formulas.length;
    classFeaturesCount += info.classFeaturesRemoved.length;
    dualClassFeaturesCount += info.dualClassFeaturesToDelete.length;
  }

  if (manualAttributes) {
    reminders.push("Attribute Builder is in Manual mode — adjust attribute modifiers manually on the Character Sheet if needed.");
  }
  if (customFeatsCount > 0) {
    reminders.push(`${customFeatsCount} custom/homebrew feat(s) have no compendium source — their full item data will be saved inside the Build Plan so they restore cleanly.`);
  }
  if (isAlchemist && formulasCount === 0) {
    const expectedLost = revertedLevels.length * 2;
    reminders.push(`Alchemist gained +${expectedLost} free formula(s) across Lv ${cleanTarget + 1}–${currentLevel}. Lower-level formulas aren't auto-removed — review Known Formulas on the Crafting tab if desired.`);
  }

  return {
    ok: true,
    actorId: actor.id,
    actorName: actor.name,
    currentLevel,
    targetLevel: cleanTarget,
    revertedLevels,
    manualAttributes,
    levels: levelsArr,
    untrackedSkillCandidates,
    totals: {
      boostLevelsCount,
      boostPicksCount,
      featsCount,
      customFeatsCount,
      trackedSkillsCount,
      untrackedSkillSlotsCount,
      overCapSkillsCount,
      intDropsCount,
      spellsCount,
      formulasCount,
      classFeaturesCount,
      dualClassFeaturesCount,
      spellEntriesToSync
    },
    checkerReport,
    reminders
  };
}

/**
 * Reverts a character actor from their current live level down to `targetLevel`,
 * first saving their currently applied build choices for Levels `(targetLevel+1)..currentLevel`
 * into the Level Planner build plan so they can easily tweak and re-apply later.
 *
 * @param {Actor} actor
 * @param {number} targetLevel
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, oldLevel: number, newLevel: number, savedLevels: number[], summary: string[], reminders: string[] }>}
 */
export async function revertActorToLevel(actor, targetLevel, options = {}) {
  const {
    saveToPlan = true,
    revertBoosts = true,
    revertFeats = true,
    revertSkills = true,
    revertSpells = true,
    revertFormulas = true,
    postChatReminder = true,
    manualSkillPicks = {}
  } = options || {};

  if (!actor || actor.type !== "character") {
    return { ok: false, oldLevel: 0, newLevel: 0, savedLevels: [], summary: [], reminders: [], manualActions: [] };
  }
  if (!game.user?.isGM && !actor.isOwner) {
    ui.notifications?.warn("You do not have permission to update this character.");
    return { ok: false, oldLevel: actor.level || 1, newLevel: actor.level || 1, savedLevels: [], summary: [], reminders: [], manualActions: [] };
  }

  const preview = await inspectLevelRevert(actor, targetLevel);
  if (!preview.ok) {
    return {
      ok: false,
      oldLevel: preview.currentLevel,
      newLevel: preview.currentLevel,
      savedLevels: [],
      summary: [],
      reminders: [],
      manualActions: []
    };
  }

  const cleanTarget = preview.targetLevel;
  const oldLevel = preview.currentLevel;
  const preReport = preview.checkerReport || analyzeCharacter(actor);
  const summary = [];
  const reminders = [];

  // Normalize any manual skill picks provided by the user for untracked skill increase slots
  const cleanManualSkills = {};
  for (const [lvlKey, slug] of Object.entries(manualSkillPicks || {})) {
    const lvlNum = Number(lvlKey);
    if (preview.revertedLevels.includes(lvlNum) && typeof slug === "string" && CORE_SKILL_SLUGS.includes(slug)) {
      cleanManualSkills[lvlNum] = slug;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 1: Save current live choices into Level Plan FIRST (zero data loss!)
  // -------------------------------------------------------------------------
  const savedLevels = [];
  if (saveToPlan) {
    const plan = getActorLevelPlan(actor);

    for (const info of preview.levels) {
      const entry = ensurePlanLevelEntry(plan, info.level);

      let touched = false;

      if (info.boosts.length > 0) {
        entry.boosts = [...info.boosts];
        touched = true;
      }

      const staleChoiceClearPaths = [];
      for (const f of info.feats) {
        const liveDoc = actor.items?.get(f.itemId);
        const liveChoices = extractLiveFeatChoicesForRevert(actor, liveDoc);
        const prevSlot = entry.feats?.[f.slotKey];
        if (prevSlot?.choices && (!liveChoices || prevSlot.uuid !== (f.sourceUuid || null))) {
          staleChoiceClearPaths.push(`flags.${MODULE_ID}.${PLAN_FLAG_KEY}.levels.${info.level}.feats.${f.slotKey}.choices`);
        }
        const snapshot = {
          uuid: f.sourceUuid || null,
          name: f.name,
          img: f.img,
          level: f.level,
          category: f.category,
          isDedication: f.isDedication,
          prerequisites: f.prerequisites
        };
        if (liveChoices) {
          snapshot.choices = liveChoices;
        }
        if (f.isCustomSnapshot && liveDoc) {
          snapshot.itemData = sanitizeEmbeddedItemSnapshot(liveDoc);
        }
        entry.feats[f.slotKey] = snapshot;
        touched = true;
      }
      if (staleChoiceClearPaths.length > 0) {
        const ForcedDeletion = foundry.data.operators.ForcedDeletion;
        const delOp = globalThis._del ?? (typeof ForcedDeletion === "function" ? new ForcedDeletion() : ForcedDeletion);
        const clearPatch = {};
        for (const p of staleChoiceClearPaths) clearPatch[p] = delOp;
        await actor.update(clearPatch);
      }

      if (info.trackedSkillIncrease?.slug) {
        entry.skillIncrease = info.trackedSkillIncrease.slug;
        touched = true;
      } else if (cleanManualSkills[info.level]) {
        entry.skillIncrease = cleanManualSkills[info.level];
        touched = true;
      }

      if (info.trackedIntBonusSkill) {
        entry.intBonusSkill = info.trackedIntBonusSkill;
        touched = true;
      }
      if (info.trackedIntBonusLanguage) {
        entry.intBonusLanguage = info.trackedIntBonusLanguage;
        touched = true;
      }

      for (const sp of info.spells) {
        const exists = entry.spells.some(existing =>
          (sp.sourceUuid && existing.uuid === sp.sourceUuid && Number(existing.rank) === Number(sp.rank))
          || (String(existing.name || "").toLowerCase() === String(sp.name || "").toLowerCase() && Number(existing.rank) === Number(sp.rank))
        );
        if (!exists) {
          const liveDoc = actor.items?.get(sp.itemId);
          const spSnap = {
            id: foundry.utils.randomID(8),
            uuid: sp.sourceUuid || null,
            name: sp.name,
            img: sp.img,
            rank: sp.rank,
            isCantrip: sp.isCantrip,
            tradition: sp.tradition,
            entryKey: sp.entryKey
          };
          if (sp.isCustomSnapshot && liveDoc) {
            spSnap.itemData = sanitizeEmbeddedItemSnapshot(liveDoc);
          }
          entry.spells.push(spSnap);
          touched = true;
        }
      }

      for (const fm of info.formulas) {
        const exists = entry.formulas.some(existing => existing.uuid === fm.uuid);
        if (!exists) {
          entry.formulas.push({
            id: foundry.utils.randomID(8),
            uuid: fm.uuid,
            name: fm.name,
            img: fm.img,
            level: fm.level
          });
          touched = true;
        }
      }

      if (touched) savedLevels.push(info.level);
    }

    await saveActorLevelPlan(actor, plan);
    if (savedLevels.length > 0) {
      summary.push(`Saved Plan: Lv ${savedLevels.join(", ")}`);
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Delete Reverted Slotted Feats & Reverted Over-Rank/Tracked Spells
  // -------------------------------------------------------------------------
  const itemIdsToDelete = new Set();
  const removedFeatNames = [];
  const removedSpellNames = [];

  if (revertFeats) {
    for (const info of preview.levels) {
      for (const f of info.feats) {
        if (actor.items?.has(f.itemId)) {
          itemIdsToDelete.add(f.itemId);
          removedFeatNames.push(f.name);
          // Also remove any linked Bonus Feat added by the planner for this parent feat (e.g. Advanced Deduction)
          for (const childBonus of actor.itemTypes?.feat || []) {
            if (childBonus.flags?.[MODULE_ID]?.bonusGrantParentId === f.itemId && !itemIdsToDelete.has(childBonus.id)) {
              itemIdsToDelete.add(childBonus.id);
              removedFeatNames.push(childBonus.name);
            }
          }
        }
      }
    }
  }

  if (revertSpells) {
    for (const info of preview.levels) {
      for (const sp of info.spells) {
        if (actor.items?.has(sp.itemId)) {
          itemIdsToDelete.add(sp.itemId);
          removedSpellNames.push(sp.name);
        }
      }
    }
  }

  if (itemIdsToDelete.size > 0) {
    try {
      await actor.deleteEmbeddedDocuments("Item", Array.from(itemIdsToDelete));
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed deleting reverted feats/spells:", err);
      reminders.push("Some reverted feats or spells could not be deleted automatically — check your sheet.");
    }
  }
  if (removedFeatNames.length > 0) {
    summary.push(`Reverted Feats (${removedFeatNames.length}): ${removedFeatNames.slice(0, 4).join(", ")}${removedFeatNames.length > 4 ? ` +${removedFeatNames.length - 4} more` : ""}`);
  }
  if (removedSpellNames.length > 0) {
    summary.push(`Reverted Spells (${removedSpellNames.length}): ${removedSpellNames.slice(0, 4).join(", ")}${removedSpellNames.length > 4 ? ` +${removedSpellNames.length - 4} more` : ""}`);
  }

  // -------------------------------------------------------------------------
  // STEP 3: Atomic Actor Update (Level, Boost Tiers, Skills, Languages, Formulas)
  // -------------------------------------------------------------------------
  const actorUpdates = {
    "system.details.level.value": cleanTarget
  };

  // 3a. Clear reverted Attribute Boost tiers
  if (revertBoosts && !preview.manualAttributes) {
    const clearedBoostLvls = [];
    for (const info of preview.levels) {
      if (info.boosts.length > 0) {
        actorUpdates[`system.build.attributes.boosts.${info.level}`] = [];
        clearedBoostLvls.push(info.level);
      }
    }
    if (clearedBoostLvls.length > 0) {
      summary.push(`Cleared Boosts (Lv ${clearedBoostLvls.join(", ")})`);
    }
  } else if (preview.manualAttributes) {
    reminders.push("Attributes are in Manual mode — adjust attribute modifiers manually on the sheet.");
  }

  // 3b. Revert Tracked / Over-Cap / User-Selected Skill Increases & Tracked INT Bonus Skill/Language
  if (revertSkills) {
    const initialSourceRanks = {};
    const workingRanks = {};
    for (const slug of CORE_SKILL_SLUGS) {
      const r = getStoredSourceSkillRank(actor, slug);
      initialSourceRanks[slug] = r;
      workingRanks[slug] = r;
    }

    const baseAncestryLangs = getBaseAncestryLanguageSet(actor);
    const liveLangValues = Array.isArray(actor.system?.details?.languages?.value)
      ? [...actor.system.details.languages.value]
      : [];
    let langValuesDirty = false;
    let customLangText = String(actor.system?.details?.languages?.details || "").trim();
    let customLangDirty = false;
    const removedLangs = [];

    for (let i = preview.levels.length - 1; i >= 0; i--) {
      const info = preview.levels[i];

      const skillSlug = info.trackedSkillIncrease?.slug || cleanManualSkills[info.level] || null;
      if (skillSlug && (workingRanks[skillSlug] || 0) >= 1) {
        workingRanks[skillSlug] = workingRanks[skillSlug] - 1;
      }

      for (const extra of info.overCapExtraAdjustments || []) {
        if (extra?.slug && (workingRanks[extra.slug] || 0) >= 1) {
          workingRanks[extra.slug] = workingRanks[extra.slug] - 1;
        }
      }

      if (info.intModDrop) {
        if (info.trackedIntBonusSkill && info.trackedIntBonusSkill !== "__lore__") {
          const iSlug = info.trackedIntBonusSkill;
          if ((workingRanks[iSlug] || 0) >= 1) {
            workingRanks[iSlug] = workingRanks[iSlug] - 1;
          }
        }
        if (info.trackedIntBonusLanguage) {
          const matchedSlug = resolveLanguageSlug(info.trackedIntBonusLanguage);
          if (matchedSlug && !baseAncestryLangs.has(matchedSlug)) {
            const idx = liveLangValues.findIndex(v => String(v || "").toLowerCase() === matchedSlug);
            if (idx >= 0) {
              liveLangValues.splice(idx, 1);
              langValuesDirty = true;
              removedLangs.push(capitalize(matchedSlug));
            }
          } else if (!matchedSlug && customLangText) {
            const parts = customLangText.split(",").map(s => s.trim()).filter(Boolean);
            const filtered = parts.filter(p => p.toLowerCase() !== info.trackedIntBonusLanguage.toLowerCase());
            if (filtered.length !== parts.length) {
              customLangText = filtered.join(", ");
              customLangDirty = true;
              removedLangs.push(info.trackedIntBonusLanguage);
            }
          }
        }
      }
    }

    // Final safety clamp to targetLevel's legal skill rank cap
    const capAtTarget = maxSkillRankForLevel(cleanTarget);
    for (const slug of CORE_SKILL_SLUGS) {
      if ((workingRanks[slug] || 0) > capAtTarget) {
        workingRanks[slug] = capAtTarget;
      }
    }

    const skillChanges = [];
    for (const slug of CORE_SKILL_SLUGS) {
      if (workingRanks[slug] !== initialSourceRanks[slug]) {
        actorUpdates[`system.skills.${slug}.rank`] = workingRanks[slug];
        skillChanges.push(`${capitalize(slug)} ${RANK_SHORT[initialSourceRanks[slug]]}→${RANK_SHORT[workingRanks[slug]]}`);
      }
    }
    if (skillChanges.length > 0) {
      summary.push(`Skills: ${skillChanges.join(", ")}`);
    }
    if (langValuesDirty) {
      actorUpdates["system.details.languages.value"] = liveLangValues;
    }
    if (customLangDirty) {
      actorUpdates["system.details.languages.details"] = customLangText;
    }
    if (removedLangs.length > 0) {
      summary.push(`Removed Languages: ${removedLangs.join(", ")}`);
    }

    // Add concise reminder for any untracked skill increase slots the user left untouched
    const stillUntracked = preview.levels
      .filter(info => info.untrackedSkillIncrease && !cleanManualSkills[info.level])
      .map(info => `Lv ${info.level}`);
    if (stillUntracked.length > 0) {
      reminders.push(`Skill Increase(s) at ${stillUntracked.join(", ")} weren't tracked — review skill ranks on the Skills tab.`);
    }
    for (const info of preview.levels) {
      if (info.intModDrop && (!info.trackedIntBonusSkillRevert || !info.trackedIntBonusLanguageWillRemove)) {
        reminders.push(`Lv ${info.level} INT drop (${info.intModDrop.fromModStr} → ${info.intModDrop.toModStr}): double-check Trained Skills & Languages on the sheet.`);
      }
    }
  }

  // 3c. Remove Tracked / Reverted-Level-Band Formulas
  if (revertFormulas) {
    const formulaUuidsToRemove = new Set();
    const removedFormulaNames = [];
    for (const info of preview.levels) {
      for (const fm of info.formulas) {
        if (fm?.uuid) {
          formulaUuidsToRemove.add(fm.uuid);
          removedFormulaNames.push(fm.name);
        }
      }
    }
    if (formulaUuidsToRemove.size > 0 && Array.isArray(actor.system?.crafting?.formulas)) {
      const filtered = foundry.utils.deepClone(actor.system.crafting.formulas)
        .filter(f => !formulaUuidsToRemove.has(f?.uuid));
      actorUpdates["system.crafting.formulas"] = filtered;
      summary.push(`Reverted Formulas (${removedFormulaNames.length}): ${removedFormulaNames.slice(0, 3).join(", ")}${removedFormulaNames.length > 3 ? ` +${removedFormulaNames.length - 3} more` : ""}`);
    }
  }

  _plannerUpdatingActors.add(actor.id);
  try {
    await actor.update(actorUpdates, { [MODULE_ID]: { fromLevelPlanner: true } });
  } finally {
    setTimeout(() => _plannerUpdatingActors.delete(actor.id), 1500);
  }

  // Allow PF2e's native level-down feature cleanup & derived data recalculation to settle
  await new Promise(resolve => setTimeout(resolve, 350));

  // -------------------------------------------------------------------------
  // STEP 4: Prune Any Remaining Higher-Level Dual Class Features
  // -------------------------------------------------------------------------
  const remainingDualIds = [];
  for (const info of preview.levels) {
    for (const dc of info.dualClassFeaturesToDelete || []) {
      if (actor.items?.has(dc.itemId)) {
        remainingDualIds.push(dc.itemId);
      }
    }
  }
  if (remainingDualIds.length > 0) {
    try {
      await actor.deleteEmbeddedDocuments("Item", Array.from(new Set(remainingDualIds)));
      summary.push(`Removed ${remainingDualIds.length} Dual Class feature(s)`);
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed pruning higher-level Dual Class features:", err);
    }
  }

  // -------------------------------------------------------------------------
  // STEP 5: Sync Spellcasting Entry Slots Down to targetLevel
  // -------------------------------------------------------------------------
  let postReport = null;
  if (revertSpells) {
    try {
      postReport = analyzeCharacter(actor);
      const syncedNames = [];
      const postMatchedEntryIds = new Set();

      for (const src of postReport?.spellcasting?.sources || []) {
        if (src.entryExists && src.entryId) {
          postMatchedEntryIds.add(src.entryId);
          if (src.slotsOutdated) {
            const ok = await syncSpellcastingEntrySlots(actor, src.entryId, src, { includeAutoSpells: false });
            if (ok) syncedNames.push(src.matchedEntryName || src.title);
          }
        }
      }

      // If an archetype spellcasting entry had its granting feat reverted, zero its daily slots cleanly
      for (const preSrc of preReport?.spellcasting?.sources || []) {
        if (preSrc.sourceKind !== "archetype" || !preSrc.entryExists || !preSrc.entryId) continue;
        if (postMatchedEntryIds.has(preSrc.entryId)) continue;
        const entryDoc = actor.items?.get(preSrc.entryId);
        if (!entryDoc || entryDoc.type !== "spellcastingEntry") continue;
        const zeroUpdates = {};
        for (let r = 1; r <= 10; r++) {
          const curMax = Number(entryDoc.system?.slots?.[`slot${r}`]?.max ?? 0);
          if (curMax > 0) {
            zeroUpdates[`system.slots.slot${r}.max`] = 0;
            zeroUpdates[`system.slots.slot${r}.value`] = 0;
          }
        }
        if (Object.keys(zeroUpdates).length > 0) {
          await entryDoc.update(zeroUpdates);
          syncedNames.push(entryDoc.name);
          reminders.push(`Spellcasting entry "${entryDoc.name}" had its granting feat reverted — slots zeroed.`);
        }
      }

      if (syncedNames.length > 0) {
        summary.push(`Synced spell slots: ${syncedNames.join(", ")}`);
        postReport = null; // Refresh below after slot updates
      }
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Spellcasting sync during de-level failed:", err);
      postReport = null;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 6: Post-Revert Audit -> Exact Manual Removal Counts + Whispered Chat Card
  // -------------------------------------------------------------------------
  if (!postReport) postReport = analyzeCharacter(actor);
  const manualActions = [];

  // 6a. Unreverted Skill Increases
  const unrevertedSkillLvls = preview.levels
    .filter(info => info.hasSkillIncreaseSlot && (!revertSkills || (info.untrackedSkillIncrease && !cleanManualSkills[info.level])))
    .map(info => info.level);
  const excessIncOnSheet = Number(postReport?.skills?.excessIncreases ?? 0);
  const skillIncToRemove = Math.max(unrevertedSkillLvls.length, excessIncOnSheet);
  if (skillIncToRemove > 0) {
    const lvlList = unrevertedSkillLvls.length > 0 ? `untracked from Lv ${unrevertedSkillLvls.join(", ")}` : `above Lv ${cleanTarget} allowance`;
    const sheetCounts = postReport?.skills
      ? ` — currently ${postReport.skills.spentIncreases}/${postReport.skills.expectedIncreases} spent on Skills tab`
      : "";
    manualActions.push({
      category: "Skills",
      title: `Remove ${skillIncToRemove} Skill Increase${skillIncToRemove === 1 ? "" : "s"}`,
      detail: `Lower ${skillIncToRemove} skill rank${skillIncToRemove === 1 ? "" : "s"} by 1 step (${lvlList}${sheetCounts}).`
    });
  }

  // 6b. Any skills still above targetLevel's rank cap (e.g. if user unchecked revertSkills)
  if (postReport?.skills?.overCapSkills?.length > 0) {
    manualActions.push({
      category: "Skills",
      title: `Lower ${postReport.skills.overCapSkills.length} Over-Cap Skill${postReport.skills.overCapSkills.length === 1 ? "" : "s"}`,
      detail: postReport.skills.overCapSkills.map(s => `${s.label} (${s.rankLabel}, requires Lv ${s.requiredLevel}+)`).join(", ")
    });
  }

  // 6c. Unreverted INT Drop Trained Skills & Languages
  const unrevertedIntSkillLvls = [];
  const unrevertedIntLangLvls = [];
  for (const info of preview.levels) {
    if (!info.intModDrop) continue;
    if (!revertSkills || !info.trackedIntBonusSkillRevert) {
      unrevertedIntSkillLvls.push(`Lv ${info.level} (${info.intModDrop.fromModStr} → ${info.intModDrop.toModStr})`);
    }
    if (!revertSkills || !info.trackedIntBonusLanguageWillRemove) {
      unrevertedIntLangLvls.push(`Lv ${info.level} (${info.intModDrop.fromModStr} → ${info.intModDrop.toModStr})`);
    }
  }
  const excessTrainedOnSheet = postReport?.skills
    ? Math.max(0, postReport.skills.currentTrained - postReport.skills.expectedTrained)
    : 0;
  const trainedToRemove = Math.max(unrevertedIntSkillLvls.length, unrevertedIntSkillLvls.length > 0 ? excessTrainedOnSheet : 0);
  if (trainedToRemove > 0) {
    const sheetCounts = postReport?.skills
      ? ` (currently ${postReport.skills.currentTrained}/${postReport.skills.expectedTrained} Trained)`
      : "";
    manualActions.push({
      category: "Skills",
      title: `Remove ${trainedToRemove} Trained Skill${trainedToRemove === 1 ? "" : "s"} (or Lore)`,
      detail: `INT modifier dropped at ${unrevertedIntSkillLvls.join(", ")}${sheetCounts}. Untrain ${trainedToRemove} skill or remove a Lore skill on the Skills tab.`
    });
  }

  const excessLangsOnSheet = postReport?.languages
    ? Math.max(0, postReport.languages.current - postReport.languages.expected)
    : 0;
  const langsToRemove = Math.max(unrevertedIntLangLvls.length, unrevertedIntLangLvls.length > 0 ? excessLangsOnSheet : 0);
  if (langsToRemove > 0) {
    const sheetCounts = postReport?.languages
      ? ` (currently ${postReport.languages.current}/${postReport.languages.expected} Languages)`
      : "";
    manualActions.push({
      category: "Languages",
      title: `Remove ${langsToRemove} Language${langsToRemove === 1 ? "" : "s"}`,
      detail: `INT modifier dropped at ${unrevertedIntLangLvls.join(", ")}${sheetCounts}. Remove ${langsToRemove} language${langsToRemove === 1 ? "" : "s"} on the Character tab.`
    });
  }

  // 6d. Spells that couldn't be auto-removed (lower-rank repertoire / spellbook spells!)
  const removedSpellsByEntryKey = new Map();
  if (revertSpells) {
    for (const info of preview.levels) {
      for (const sp of info.spells) {
        if (sp.entryKey) {
          removedSpellsByEntryKey.set(sp.entryKey, (removedSpellsByEntryKey.get(sp.entryKey) || 0) + 1);
        }
      }
    }
  }

  const preMilestonesByLvl = computeSpellMilestonesByLevel(preReport);
  const learnedInRevertedRangeByEntry = new Map();
  for (const lvl of preview.revertedLevels) {
    for (const m of preMilestonesByLvl[lvl] || []) {
      if (m.learnMode !== "optional" && m.requiredTotal > 0) {
        const prevRec = learnedInRevertedRangeByEntry.get(m.entryKey) || { count: 0, title: m.title, learnMode: m.learnMode };
        prevRec.count += m.requiredTotal;
        learnedInRevertedRangeByEntry.set(m.entryKey, prevRec);
      }
    }
  }

  for (const src of postReport?.spellcasting?.sources || []) {
    if (src.isFocus || src.isDivineFont || !src.entryExists) continue;
    const autoRemovedCount = removedSpellsByEntryKey.get(src.key) || 0;
    const learnedRec = learnedInRevertedRangeByEntry.get(src.key);

    if (src.repertoireExpected != null && src.currentLeveledSpells > src.repertoireExpected) {
      const excessSpells = src.currentLeveledSpells - src.repertoireExpected;
      manualActions.push({
        category: "Spells",
        title: `Remove ${excessSpells} Spell${excessSpells === 1 ? "" : "s"} from ${src.matchedEntryName || src.title}`,
        detail: `Currently ${src.currentLeveledSpells}/${src.repertoireExpected} leveled spells for Lv ${cleanTarget}${autoRemovedCount > 0 ? ` (${autoRemovedCount} over-rank/tracked already removed)` : ""}. Remove ${excessSpells} lower-rank spell${excessSpells === 1 ? "" : "s"} on the Spellcasting tab.`
      });
    } else if (learnedRec && learnedRec.learnMode === "upto-rank") {
      const remainingSpellbook = Math.max(0, learnedRec.count - autoRemovedCount);
      if (remainingSpellbook > 0) {
        manualActions.push({
          category: "Spells",
          title: `Remove ${remainingSpellbook} Lower-Rank Spell${remainingSpellbook === 1 ? "" : "s"} from ${src.matchedEntryName || src.title}`,
          detail: `Gained +${learnedRec.count} spellbook/familiar spells across Lv ${cleanTarget + 1}–${oldLevel}; ${autoRemovedCount} over-rank/tracked removed automatically.`
        });
      }
    }
  }

  // 6e. Alchemist Free Formulas not auto-removed
  if (preReport?.formulas?.isAlchemist) {
    const gainedFreeFormulas = preview.revertedLevels.length * 2;
    const autoRemovedFormulas = revertFormulas
      ? preview.levels.reduce((s, info) => s + info.formulas.length, 0)
      : 0;
    const remainingFormulas = Math.max(0, gainedFreeFormulas - autoRemovedFormulas);
    if (remainingFormulas > 0) {
      manualActions.push({
        category: "Formulas",
        title: `Review / Remove up to ${remainingFormulas} Formula${remainingFormulas === 1 ? "" : "s"}`,
        detail: `Alchemist gained +${gainedFreeFormulas} free formulas across Lv ${cleanTarget + 1}–${oldLevel}${autoRemovedFormulas > 0 ? ` (${autoRemovedFormulas} already removed)` : ""}. Lower-level or purchased formulas aren't auto-removed — review the Crafting tab.`
      });
    }
  }

  // 6f. Manual Attributes or Remaining Generic Reminders (e.g. Orphaned Archetype Entry)
  if (preview.manualAttributes) {
    manualActions.push({
      category: "Attributes",
      title: "Adjust Attribute Modifiers Manually",
      detail: "Attribute Builder is in Manual mode — check if any attribute boosts from reverted levels need to be lowered on the Character tab."
    });
  }
  for (const rem of reminders) {
    if (/granting feat reverted|could not be deleted/i.test(rem)) {
      manualActions.push({
        category: "Sheet Check",
        title: "Review Reverted Item / Entry",
        detail: rem
      });
    }
  }

  const result = {
    ok: true,
    oldLevel,
    newLevel: cleanTarget,
    savedLevels,
    summary,
    reminders,
    manualActions
  };

  if (postChatReminder) {
    try {
      await postDeLevelReminderToChat(actor, result, { whisper: true });
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed posting de-level reminder chat card:", err);
    }
  }

  return result;
}

/**
 * Posts a persistent whispered Chat Card summarizing a De-Level / Revert operation
 * and clearly listing exact counts of any skills, languages, spells, or formulas
 * the player/GM should manually remove on the sheet.
 *
 * @param {Actor} actor
 * @param {object} revertResult
 * @param {{ whisper?: boolean }} [options]
 */
async function postDeLevelReminderToChat(actor, revertResult, { whisper = true } = {}) {
  if (!actor || !revertResult?.ok) return null;

  const esc = foundry.utils.escapeHTML;
  const { oldLevel, newLevel, savedLevels = [], summary = [], manualActions = [] } = revertResult;
  const rangeStr = (newLevel + 1 === oldLevel) ? `Lv ${oldLevel}` : `Lv ${newLevel + 1}–${oldLevel}`;

  const autoRowsHtml = summary.length > 0
    ? summary.map(line => `<li>${esc(line)}</li>`).join("")
    : `<li>Reverted character level from Lv ${oldLevel} to Lv ${newLevel}.</li>`;

  const manualRowsHtml = manualActions.length > 0
    ? manualActions.map(act => `
        <li class="pf2e-lp-chat-action">
          <div class="pf2e-lp-chat-action-title">
            <span class="pf2e-lp-chat-cat">${esc(act.category)}</span>
            <strong>${esc(act.title)}</strong>
          </div>
          <div class="pf2e-lp-chat-action-detail">${esc(act.detail)}</div>
        </li>
      `).join("")
    : `<li class="pf2e-lp-chat-ok"><strong>All Clear!</strong> No leftover skills, languages, spells, or formulas need manual removal.</li>`;

  const savedBadge = savedLevels.length > 0
    ? `<span class="pf2e-lp-chat-badge">Saved ${esc(rangeStr)} to Build Plan</span>`
    : "";

  const content = `
    <div class="pf2e-lp-chat-card ${manualActions.length > 0 ? "has-actions" : "is-clean"}">
      <div class="pf2e-lp-chat-header">
        <img src="${esc(actor.img || "icons/svg/mystery-man.svg")}" alt="" />
        <div class="pf2e-lp-chat-head-meta">
          <div class="pf2e-lp-chat-title">${esc(actor.name)} &mdash; De-Leveled (Lv ${oldLevel} &rarr; Lv ${newLevel})</div>
          <div class="pf2e-lp-chat-sub">${savedBadge}</div>
        </div>
      </div>

      <div class="pf2e-lp-chat-section">
        <div class="pf2e-lp-chat-sec-title ${manualActions.length > 0 ? "is-alert" : "is-ok"}">
          ${manualActions.length > 0
      ? `Manual Cleanup Checklist (${manualActions.length} item${manualActions.length === 1 ? "" : "s"})`
      : "Manual Cleanup Checklist"}
        </div>
        <ul class="pf2e-lp-chat-list">${manualRowsHtml}</ul>
      </div>

      <div class="pf2e-lp-chat-section is-auto">
        <div class="pf2e-lp-chat-sec-title">Auto-Saved &amp; Reverted</div>
        <ul class="pf2e-lp-chat-auto-list">${autoRowsHtml}</ul>
      </div>
    </div>
  `;

  const msgData = {
    speaker: ChatMessage.getSpeaker({ alias: "Level Planner" }),
    content
  };

  if (whisper) {
    const ownerIds = (game.users?.contents || [])
      .filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"))
      .map(u => u.id);
    const gmIds = (game.users?.contents || [])
      .filter(u => u.isGM)
      .map(u => u.id);
    msgData.whisper = Array.from(new Set([...ownerIds, ...gmIds, game.user?.id].filter(Boolean)));
  }

  return await ChatMessage.create(msgData);
}
