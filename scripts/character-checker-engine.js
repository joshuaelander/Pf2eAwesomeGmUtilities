/**
 * PF2e Awesome GM Utilities - Character Completeness & Spellcasting Engine
 *
 * Inspects PF2e `character` actors to verify build completeness and guide GMs & players:
 *  - Core identity (Ancestry, Heritage, Background, Class, Dual Class, Deity, Languages)
 *  - Attribute boosts across Ancestry, Background, Class, Dual Class, and Level tiers
 *    (supports standard 1/5/10/15/20, Alternate Ancestry Boosts, and Gradual Ability Boosts)
 *  - Exact Trained Skills & Skill Increases math (Class + Dual Class higher additional +
 *    INT modifier + Background + overlap replacements + Rogue/Investigator extra increases)
 *  - Slotted Feat Groups (Ancestry, Ancestry Paragon, Class, Dual Class, Free Archetype, Skill, General)
 *  - Spellcasting Entries, Expected Cantrips, Slots per Rank, Repertoire/Spellbook counts,
 *    and 1-click Spellcasting Entry creation / level-up slot synchronization for Primary Class,
 *    Dual Class (PF2e Awesome Variant Rules), and Multiclass / Free Archetype spellcasting feats.
 */

import { MODULE_ID } from "./constants.js";

export const VARIANT_RULES_MODULE_ID = "pf2e-awesome-variant-rules";

export const CORE_SKILL_SLUGS = [
  "acrobatics",
  "arcana",
  "athletics",
  "crafting",
  "deception",
  "diplomacy",
  "intimidation",
  "medicine",
  "nature",
  "occultism",
  "performance",
  "religion",
  "society",
  "stealth",
  "survival",
  "thievery"
];

const LEGACY_SKILL_MAP = {
  acr: "acrobatics",
  arc: "arcana",
  ath: "athletics",
  cra: "crafting",
  dec: "deception",
  dip: "diplomacy",
  itm: "intimidation",
  med: "medicine",
  nat: "nature",
  occ: "occultism",
  prf: "performance",
  rel: "religion",
  soc: "society",
  ste: "stealth",
  sur: "survival",
  thi: "thievery"
};

export const ABILITY_LABELS = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA"
};

export const TRADITION_LABELS = {
  arcane: "Arcane",
  divine: "Divine",
  occult: "Occult",
  primal: "Primal"
};

export const CASTING_TYPE_LABELS = {
  prepared: "Prepared",
  spontaneous: "Spontaneous",
  innate: "Innate",
  focus: "Focus"
};

/* ------------------------------------------------------------------------- */
/* 1. PF2E SPELLCASTING PROGRESSION TABLES (REMASTER & CORE)                 */
/* ------------------------------------------------------------------------- */

/**
 * Full-caster slots per rank for levels 1-20.
 * @param {number} level - Character level (1-20)
 * @param {number} maxPerRank - Standard slots at full rank (2 = Psychic/Animist Prep/Magus/Summoner/Necromancer, 3 = Wiz/Clr/Drd/Wtc/Brd, 4 = Sor/Ora)
 * @param {{ bonusPerRank?: number, hasTenthFeat?: boolean, includeTenth?: boolean }} [options]
 * @returns {Record<number, number>}
 */
function buildFullCasterSlots(level, maxPerRank, { bonusPerRank = 0, hasTenthFeat = false, includeTenth = true } = {}) {
  const slots = {};
  for (let r = 1; r <= 9; r++) {
    const unlockLvl = r * 2 - 1;
    if (level < unlockLvl) {
      slots[r] = 0;
    } else if (level === unlockLvl) {
      slots[r] = Math.max(1, maxPerRank - 1) + bonusPerRank;
    } else {
      slots[r] = maxPerRank + bonusPerRank;
    }
  }
  slots[10] = (includeTenth && level >= 19) ? (hasTenthFeat && level >= 20 ? 2 : 1) : 0;
  return slots;
}

/**
 * Animist Apparition spontaneous slots (1 per unlocked rank 1-9, plus 10th at L19 via Supreme Apparition).
 */
function buildAnimistApparitionSlots(level) {
  const slots = {};
  const maxRank = Math.min(9, Math.ceil(level / 2));
  for (let r = 1; r <= 9; r++) {
    slots[r] = r <= maxRank ? 1 : 0;
  }
  slots[10] = 0; // 10th-rank slot is on Animist's Prepared entry (or shared supreme feature)
  return slots;
}

/**
 * Standard Multiclass / Free Archetype spellcasting slots (Basic / Expert / Master + optional Breadth).
 */
function buildArchetypeSlots(level, { hasBasic = false, hasExpert = false, hasMaster = false, hasBreadth = false } = {}) {
  const slots = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  if (hasBasic) {
    if (level >= 4) slots[1] = 1;
    if (level >= 6) slots[2] = 1;
    if (level >= 8) slots[3] = 1;
  }
  if (hasExpert) {
    if (level >= 12) slots[4] = 1;
    if (level >= 14) slots[5] = 1;
    if (level >= 16) slots[6] = 1;
  }
  if (hasMaster) {
    if (level >= 18) slots[7] = 1;
    if (level >= 20) slots[8] = 1;
  }

  // Breadth feat (Lv 8+): +1 slot per rank EXCEPT the two highest archetype spell ranks
  if (hasBreadth) {
    let highestRank = 0;
    for (let r = 8; r >= 1; r--) {
      if (slots[r] > 0) {
        highestRank = r;
        break;
      }
    }
    for (let r = 1; r <= highestRank - 2; r++) {
      if (slots[r] > 0) slots[r] += 1;
    }
  }

  return slots;
}

/**
 * Class spellcasting metadata registry for all official PF2e spellcasting classes.
 */
const CLASS_SPELLCASTING_DEFS = {
  wizard: {
    className: "Wizard",
    castingType: "prepared",
    tradition: "arcane",
    ability: "int",
    baseSlotsPerRank: 3,
    cantrips: 5,
    mode: "full",
    spellbookBase: 5,
    spellbookPerLevel: 2,
    spellbookCantrips: 10,
    repertoireMatchesSlots: false,
    extraTenthFeats: ["archwizards-might", "archwizard-s-might"]
  },
  cleric: {
    className: "Cleric",
    castingType: "prepared",
    tradition: "divine",
    ability: "wis",
    baseSlotsPerRank: 3,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: false,
    hasDivineFont: true,
    extraTenthFeats: ["maker-of-miracles"]
  },
  druid: {
    className: "Druid",
    castingType: "prepared",
    tradition: "primal",
    ability: "wis",
    baseSlotsPerRank: 3,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: false,
    extraTenthFeats: ["hierophants-power", "hierophant-s-power"]
  },
  witch: {
    className: "Witch",
    castingType: "prepared",
    tradition: null, // Determined by Patron
    ability: "int",
    baseSlotsPerRank: 3,
    cantrips: 5,
    mode: "full",
    spellbookBase: 5,
    spellbookPerLevel: 2,
    spellbookCantrips: 10,
    repertoireMatchesSlots: false,
    extraTenthFeats: ["patrons-truth", "patron-s-truth"]
  },
  bard: {
    className: "Bard",
    castingType: "spontaneous",
    tradition: "occult",
    ability: "cha",
    baseSlotsPerRank: 3,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: true,
    signatureFromLevel: 3,
    extraTenthFeats: ["symphony-of-the-muse"]
  },
  sorcerer: {
    className: "Sorcerer",
    castingType: "spontaneous",
    tradition: null, // Determined by Bloodline
    ability: "cha",
    baseSlotsPerRank: 4,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: true,
    signatureFromLevel: 3,
    extraTenthFeats: ["bloodline-conduit"]
  },
  oracle: {
    className: "Oracle",
    castingType: "spontaneous",
    tradition: "divine",
    ability: "cha",
    baseSlotsPerRank: 4, // PF2e Remaster (Player Core 2)
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: true,
    signatureFromLevel: 3,
    extraTenthFeats: ["oracular-providence"]
  },
  psychic: {
    className: "Psychic",
    castingType: "spontaneous",
    tradition: "occult",
    ability: null, // INT or CHA from Subconscious Mind
    baseSlotsPerRank: 2,
    cantrips: 3, // +3 psi cantrips from Conscious Mind
    mode: "full",
    repertoireMatchesSlots: true,
    signatureFromLevel: 3,
    extraTenthFeats: ["mind-over-matter"]
  },
  animist: {
    className: "Animist",
    castingType: "prepared",
    tradition: "divine",
    ability: "wis",
    baseSlotsPerRank: 2,
    cantrips: 2, // +2-4 apparition cantrips
    mode: "animist",
    repertoireMatchesSlots: false,
    extraTenthFeats: ["eternal-guide"]
  },
  magus: {
    className: "Magus",
    castingType: "prepared",
    tradition: "arcane",
    ability: "int",
    baseSlotsPerRank: 2, // PF2e Remaster (Impossible Magic): 2 slots per rank (Ranks 1-9, no longer bounded)
    includeTenth: false,
    cantrips: 5,
    mode: "full",
    spellbookBase: 4,
    spellbookPerLevel: 2,
    spellbookCantrips: 8,
    repertoireMatchesSlots: false
  },
  summoner: {
    className: "Summoner",
    castingType: "spontaneous",
    tradition: null, // Determined by Eidolon
    ability: "cha",
    baseSlotsPerRank: 2, // PF2e Remaster (Impossible Magic): 2 slots per rank (Ranks 1-9, no longer bounded)
    includeTenth: false,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: true,
    signatureFromLevel: 3
  },
  necromancer: {
    className: "Necromancer",
    castingType: "prepared",
    tradition: "occult",
    ability: "int",
    baseSlotsPerRank: 2, // PF2e Impossible Magic: 2 slots per rank (Ranks 1-9 + 10th at Lv 19)
    includeTenth: true,
    cantrips: 5,
    mode: "full",
    repertoireMatchesSlots: false,
    extraTenthFeats: ["mortem-ultimatum"]
  }
};

/**
 * Known Multiclass & Spellcasting Archetype metadata.
 */
const ARCHETYPE_SPELLCASTING_DEFS = {
  wizard: {
    label: "Wizard Archetype",
    dedicationSlugs: ["wizard-dedication"],
    basicSlugs: ["basic-wizard-spellcasting"],
    expertSlugs: ["expert-wizard-spellcasting"],
    masterSlugs: ["master-wizard-spellcasting"],
    breadthSlugs: ["arcane-breadth"],
    castingType: "prepared",
    tradition: "arcane",
    ability: "int",
    cantrips: 2,
    bounded: false
  },
  cleric: {
    label: "Cleric Archetype",
    dedicationSlugs: ["cleric-dedication"],
    basicSlugs: ["basic-cleric-spellcasting"],
    expertSlugs: ["expert-cleric-spellcasting"],
    masterSlugs: ["master-cleric-spellcasting"],
    breadthSlugs: ["divine-breadth"],
    castingType: "prepared",
    tradition: "divine",
    ability: "wis",
    cantrips: 2,
    bounded: false
  },
  druid: {
    label: "Druid Archetype",
    dedicationSlugs: ["druid-dedication"],
    basicSlugs: ["basic-druid-spellcasting"],
    expertSlugs: ["expert-druid-spellcasting"],
    masterSlugs: ["master-druid-spellcasting"],
    breadthSlugs: ["primal-breadth"],
    castingType: "prepared",
    tradition: "primal",
    ability: "wis",
    cantrips: 2,
    bounded: false
  },
  witch: {
    label: "Witch Archetype",
    dedicationSlugs: ["witch-dedication"],
    basicSlugs: ["basic-witch-spellcasting"],
    expertSlugs: ["expert-witch-spellcasting"],
    masterSlugs: ["master-witch-spellcasting"],
    breadthSlugs: ["patrons-breadth", "patron-s-breadth"],
    castingType: "prepared",
    tradition: null,
    ability: "int",
    cantrips: 2,
    bounded: false
  },
  bard: {
    label: "Bard Archetype",
    dedicationSlugs: ["bard-dedication"],
    basicSlugs: ["basic-bard-spellcasting"],
    expertSlugs: ["expert-bard-spellcasting"],
    masterSlugs: ["master-bard-spellcasting"],
    breadthSlugs: ["occult-breadth"],
    castingType: "spontaneous",
    tradition: "occult",
    ability: "cha",
    cantrips: 2,
    bounded: false
  },
  sorcerer: {
    label: "Sorcerer Archetype",
    dedicationSlugs: ["sorcerer-dedication"],
    basicSlugs: ["basic-sorcerer-spellcasting"],
    expertSlugs: ["expert-sorcerer-spellcasting"],
    masterSlugs: ["master-sorcerer-spellcasting"],
    breadthSlugs: ["bloodline-breadth"],
    castingType: "spontaneous",
    tradition: null,
    ability: "cha",
    cantrips: 2,
    bounded: false
  },
  oracle: {
    label: "Oracle Archetype",
    dedicationSlugs: ["oracle-dedication"],
    basicSlugs: ["basic-oracle-spellcasting"],
    expertSlugs: ["expert-oracle-spellcasting"],
    masterSlugs: ["master-oracle-spellcasting"],
    breadthSlugs: ["mysterious-breadth"],
    castingType: "spontaneous",
    tradition: "divine",
    ability: "cha",
    cantrips: 2,
    bounded: false
  },
  psychic: {
    label: "Psychic Archetype",
    dedicationSlugs: ["psychic-dedication"],
    basicSlugs: ["basic-psychic-spellcasting"],
    expertSlugs: ["expert-psychic-spellcasting"],
    masterSlugs: ["master-psychic-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: "occult",
    ability: null,
    cantrips: 1,
    bounded: false
  },
  animist: {
    label: "Animist Archetype",
    dedicationSlugs: ["animist-dedication"],
    basicSlugs: ["basic-animist-spellcasting"],
    expertSlugs: ["expert-animist-spellcasting"],
    masterSlugs: ["master-animist-spellcasting"],
    breadthSlugs: ["apparition-breadth", "spirit-breadth"],
    castingType: "prepared",
    tradition: "divine",
    ability: "wis",
    cantrips: 2,
    bounded: false
  },
  magus: {
    label: "Magus Archetype",
    dedicationSlugs: ["magus-dedication"],
    basicSlugs: ["basic-magus-spellcasting", "basic-bounded-spellcasting"],
    expertSlugs: ["expert-magus-spellcasting", "expert-bounded-spellcasting"],
    masterSlugs: ["master-magus-spellcasting", "master-bounded-spellcasting"],
    breadthSlugs: [],
    castingType: "prepared",
    tradition: "arcane",
    ability: "int",
    cantrips: 2,
    bounded: false
  },
  summoner: {
    label: "Summoner Archetype",
    dedicationSlugs: ["summoner-dedication"],
    basicSlugs: ["basic-summoner-spellcasting"],
    expertSlugs: ["expert-summoner-spellcasting"],
    masterSlugs: ["master-summoner-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: null,
    ability: "cha",
    cantrips: 2,
    bounded: false
  },
  necromancer: {
    label: "Necromancer Archetype",
    dedicationSlugs: ["necromancer-dedication"],
    basicSlugs: ["basic-necromancer-spellcasting"],
    expertSlugs: ["expert-necromancer-spellcasting"],
    masterSlugs: ["master-necromancer-spellcasting"],
    breadthSlugs: [],
    castingType: "prepared",
    tradition: "occult",
    ability: "int",
    cantrips: 2,
    bounded: false
  },
  captivator: {
    label: "Captivator Archetype",
    dedicationSlugs: ["captivator-dedication"],
    basicSlugs: ["basic-captivator-spellcasting"],
    expertSlugs: ["expert-captivator-spellcasting"],
    masterSlugs: ["master-captivator-spellcasting"],
    breadthSlugs: [],
    castingType: "innate",
    tradition: "occult",
    ability: "cha",
    cantrips: 2,
    bounded: false
  },
  "cathartic-mage": {
    label: "Cathartic Mage Archetype",
    dedicationSlugs: ["cathartic-mage-dedication"],
    basicSlugs: ["basic-cathartic-spellcasting"],
    expertSlugs: ["expert-cathartic-spellcasting"],
    masterSlugs: ["master-cathartic-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: null,
    ability: "cha",
    cantrips: 1,
    bounded: false
  },
  "eldritch-researcher": {
    label: "Eldritch Researcher Archetype",
    dedicationSlugs: ["eldritch-researcher-dedication"],
    basicSlugs: ["basic-eldritch-researcher-spellcasting"],
    expertSlugs: ["expert-eldritch-researcher-spellcasting"],
    masterSlugs: ["master-eldritch-researcher-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: "occult",
    ability: "int",
    cantrips: 1,
    bounded: false
  }
};

/* ------------------------------------------------------------------------- */
/* 2. NORMALIZATION & VARIANT RULE DETECTION HELPERS                         */
/* ------------------------------------------------------------------------- */

export function normalizeSlug(val) {
  if (!val) return "";
  return String(val)
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSkillSlug(skill) {
  const key = String(skill || "").toLowerCase().trim();
  return LEGACY_SKILL_MAP[key] || key;
}

function extractLevelArray(field) {
  const raw = Array.isArray(field) ? field : (Array.isArray(field?.value) ? field.value : []);
  return raw
    .map(v => Number(v))
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

function getItemSlug(item) {
  return normalizeSlug(item?.slug || item?.system?.slug || item?.name || "");
}

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function hasWizardArcaneSchool(feats, featSlugs) {
  const isUnified = featSlugs.has("school-of-unified-magical-theory")
    || featSlugs.has("universalist")
    || feats.some(f => /unified magical theory|universalist/i.test(f.name || ""));
  const hasSchool = feats.some(f => /arcane school|school of /i.test(f.name || "") || getItemSlug(f).startsWith("school-of-"));
  return hasSchool && !isUnified;
}

/**
 * Safely inspect active PF2e & PF2e Awesome Variant Rules settings for this world.
 */
export function getActiveVariantRules() {
  const avrActive = Boolean(game.modules?.get(VARIANT_RULES_MODULE_ID)?.active);
  let dualClassEnabled = false;
  let ancestryParagonEnabled = false;
  let freeArchetypeEnabled = false;
  let gradualBoostsEnabled = false;

  if (avrActive) {
    try {
      dualClassEnabled = Boolean(
        game.pf2eAwesomeVariantRules?.isDualClassEnabled?.()
        ?? game.settings?.get(VARIANT_RULES_MODULE_ID, "dualClassEnabled")
      );
    } catch { /* ignore */ }
    try {
      ancestryParagonEnabled = Boolean(
        game.pf2eAwesomeVariantRules?.isAncestryParagonEnabled?.()
        ?? game.settings?.get(VARIANT_RULES_MODULE_ID, "ancestryParagonEnabled")
      );
    } catch { /* ignore */ }
  }

  try {
    freeArchetypeEnabled = Boolean(game.settings?.get("pf2e", "freeArchetypeVariant"));
  } catch { /* ignore */ }
  try {
    gradualBoostsEnabled = Boolean(game.settings?.get("pf2e", "gradualBoostsVariant"));
  } catch { /* ignore */ }

  return {
    avrActive,
    dualClassEnabled,
    ancestryParagonEnabled,
    freeArchetypeEnabled,
    gradualBoostsEnabled
  };
}

/**
 * Retrieve Dual Class data from `pf2e-awesome-variant-rules` (if installed & set on actor).
 */
export function getActorDualClassInfo(actor, variants = null) {
  if (!actor || actor.type !== "character") return null;
  const activeVariants = variants || getActiveVariantRules();
  if (!activeVariants.dualClassEnabled) return null;

  const flagData = game.pf2eAwesomeVariantRules?.getSecondaryClass?.(actor)
    ?? actor.getFlag?.(VARIANT_RULES_MODULE_ID, "dualClass")
    ?? null;

  if (!flagData?.itemData) return null;
  const summary = game.pf2eAwesomeVariantRules?.getDualClassSummary?.(actor) ?? null;
  return {
    data: flagData,
    summary,
    slug: normalizeSlug(flagData.slug || flagData.itemData?.system?.slug || flagData.itemData?.name),
    name: flagData.itemData?.name || flagData.name || "Second Class",
    system: flagData.itemData?.system || {}
  };
}

/* ------------------------------------------------------------------------- */
/* 3. ATTRIBUTE BOOSTS ANALYSIS                                              */
/* ------------------------------------------------------------------------- */

function analyzeAttributeBoosts(actor, level, variants, dualInfo) {
  const buildAttrs = actor.system?.build?.attributes;
  if (!buildAttrs) {
    return {
      manual: false,
      tiers: [],
      missingBoostsTotal: 0,
      issues: []
    };
  }

  if (buildAttrs.manual) {
    return {
      manual: true,
      tiers: [],
      missingBoostsTotal: 0,
      issues: []
    };
  }

  const boosts = buildAttrs.boosts || {};
  const allowed = buildAttrs.allowedBoosts || {};
  const tiers = [];
  const issues = [];
  let missingBoostsTotal = 0;

  const checkTier = (key, label, selectedArr, expectedCount) => {
    const selected = Array.isArray(selectedArr)
      ? selectedArr.filter(Boolean).length
      : (typeof selectedArr === "string" && selectedArr ? 1 : 0);
    const exp = Number(expectedCount ?? 0);
    if (exp <= 0) return;
    const missing = Math.max(0, exp - selected);
    missingBoostsTotal += missing;
    tiers.push({
      key,
      label,
      selected,
      expected: exp,
      missing,
      complete: missing === 0
    });
    if (missing > 0) {
      issues.push({
        severity: "warning",
        category: "Attributes",
        title: `${label} Boosts (${selected}/${exp})`,
        detail: `${missing} attribute boost${missing === 1 ? "" : "s"} still unassigned in the Attribute Builder.`
      });
    }
  };

  // Ancestry Boosts
  if (actor.ancestry) {
    let expectedAnc = Number(allowed.ancestry ?? 0);
    if (!expectedAnc) {
      const ancBoosts = Object.values(actor.ancestry.system?.boosts || {});
      expectedAnc = ancBoosts.filter(b => Array.isArray(b?.value) && b.value.length > 0).length || 2;
      // Handle PF2e Alternate Ancestry Boosts (2 free boosts instead of 3 + flaw)
      if (actor.ancestry.system?.alternateAncestryBoosts) expectedAnc = 2;
    }
    checkTier("ancestry", "Ancestry", boosts.ancestry, expectedAnc);
  }

  // Background Boosts
  if (actor.background) {
    const expectedBg = Number(allowed.background ?? 2);
    checkTier("background", "Background", boosts.background, expectedBg);
  }

  // Primary Class Key Boost
  if (actor.class) {
    const classKeySelected = boosts.class || actor.system?.details?.keyability?.value;
    checkTier("class", "Class Key", classKeySelected, 1);
  }

  // Level-based free boosts (supports both Standard [1,5,10,15,20] & Gradual Boosts!)
  const levelTiers = variants.gradualBoostsEnabled
    ? [1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20]
    : [1, 5, 10, 15, 20];

  for (const tierLvl of levelTiers) {
    if (level < tierLvl) continue;
    let exp = Number(allowed[tierLvl] ?? 0);
    if (!exp) {
      exp = tierLvl === 1 ? 4 : (variants.gradualBoostsEnabled ? 1 : 4);
    }
    checkTier(`lvl-${tierLvl}`, `Level ${tierLvl}`, boosts[tierLvl], exp);
  }

  // Dual Class Key Boost check (when enabled & set)
  if (dualInfo?.summary?.keyAbility) {
    const ka = dualInfo.summary.keyAbility;
    if (!ka.selected) {
      issues.push({
        severity: "warning",
        category: "Attributes",
        title: `Dual Class (${dualInfo.name}) Key Attribute`,
        detail: "No key attribute selected for your Second Class."
      });
    }
  }

  return {
    manual: false,
    tiers,
    missingBoostsTotal,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 4. SKILLS & SKILL INCREASES ANALYSIS                                      */
/* ------------------------------------------------------------------------- */

/**
 * Extract core skill slugs automatically granted by Rule Elements on embedded items.
 */
function collectRuleElementTrainedSkills(actor) {
  const autoSlugs = new Set();
  for (const item of actor.items || []) {
    const rules = item.system?.rules;
    if (!Array.isArray(rules)) continue;
    const selections = item.flags?.pf2e?.rulesSelections || {};
    for (const rule of rules) {
      if (rule?.key !== "ActiveEffectLike" || typeof rule.path !== "string") continue;
      let path = rule.path;
      // Resolve simple `{item|flags.pf2e.rulesSelections.<key>}` templates
      path = path.replace(/\{item\|flags\.pf2e\.rulesSelections\.([^}]+)\}/g, (_, k) => {
        return typeof selections[k] === "string" ? selections[k] : "";
      });
      const m = path.match(/^system\.skills\.([a-z]+)\.rank$/i);
      if (m) {
        const slug = normalizeSkillSlug(m[1]);
        if (CORE_SKILL_SLUGS.includes(slug)) {
          autoSlugs.add(slug);
        }
      }
    }
  }
  return autoSlugs;
}

function analyzeSkills(actor, level, dualInfo) {
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  const pClassSys = actor.class?.system || {};
  const dClassSys = dualInfo?.system || null;
  const bgSys = actor.background?.system || {};

  // 1. Gather automatic core skill grants from Class, Dual Class, Background, and Rule Elements
  const primaryAutoSkills = (Array.isArray(pClassSys.trainedSkills?.value) ? pClassSys.trainedSkills.value : [])
    .map(normalizeSkillSlug)
    .filter(s => CORE_SKILL_SLUGS.includes(s));

  const dualAutoSkills = (Array.isArray(dClassSys?.trainedSkills?.value) ? dClassSys.trainedSkills.value : [])
    .map(normalizeSkillSlug)
    .filter(s => CORE_SKILL_SLUGS.includes(s));

  const bgAutoSkills = (Array.isArray(bgSys.trainedSkills?.value) ? bgSys.trainedSkills.value : [])
    .map(normalizeSkillSlug)
    .filter(s => CORE_SKILL_SLUGS.includes(s));

  const bgLores = Array.isArray(bgSys.trainedSkills?.lore) ? bgSys.trainedSkills.lore.filter(Boolean) : [];

  // Overlaps among Primary Class + Dual Class + Background grant 1 free replacement trained skill each
  const allClassBgRaw = [...primaryAutoSkills, ...dualAutoSkills, ...bgAutoSkills];
  const uniqueClassBgSet = new Set(allClassBgRaw);
  const overlapReplacements = Math.max(0, allClassBgRaw.length - uniqueClassBgSet.size);

  // Also detect any skill auto-granted by Subclass / Heritage / Feats / Rule Elements
  const ruleAutoSet = collectRuleElementTrainedSkills(actor);
  const autoTrainedSet = new Set([...uniqueClassBgSet, ...ruleAutoSet]);

  let trainedCoreCount = 0;
  let manualCoreIncreasesSpent = 0;
  const rankCounts = { trained: 0, expert: 0, master: 0, legendary: 0 };
  const overCapSkills = [];

  for (const slug of CORE_SKILL_SLUGS) {
    const effRank = Number(actor.system?.skills?.[slug]?.rank ?? 0);
    const srcRank = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);

    if (effRank >= 1 && srcRank === 0) {
      autoTrainedSet.add(slug);
    }

    if (effRank >= 1) {
      trainedCoreCount++;
      if (effRank === 1) rankCounts.trained++;
      else if (effRank === 2) rankCounts.expert++;
      else if (effRank === 3) rankCounts.master++;
      else if (effRank >= 4) rankCounts.legendary++;
    }

    // Manual skill increases spent (above Trained)
    if (srcRank > 1) {
      manualCoreIncreasesSpent += (srcRank - 1);
      // Verify PF2e level caps on manually bumped ranks
      if (srcRank === 2 && level < 3) {
        overCapSkills.push({ slug, label: capitalize(slug), rankLabel: "Expert", requiredLevel: 3 });
      } else if (srcRank === 3 && level < 7) {
        overCapSkills.push({ slug, label: capitalize(slug), rankLabel: "Master", requiredLevel: 7 });
      } else if (srcRank === 4 && level < 15) {
        overCapSkills.push({ slug, label: capitalize(slug), rankLabel: "Legendary", requiredLevel: 15 });
      }
    }
  }

  // 2. Additional trained skills from Class (higher of Dual Classes) + INT modifier
  const primaryAdd = Number(pClassSys.trainedSkills?.additional ?? 0);
  const dualAdd = dClassSys ? Number(dClassSys.trainedSkills?.additional ?? 0) : 0;
  const effectiveClassAdd = dualInfo ? Math.max(primaryAdd, dualAdd) : primaryAdd;
  const classAddSource = dualInfo && dualAdd > primaryAdd
    ? dualInfo.name
    : (actor.class?.name || "Class");

  const additionalFromClassAndInt = actor.class
    ? Math.max(0, effectiveClassAdd + intMod)
    : Math.max(0, intMod);

  const expectedTrainedRaw = autoTrainedSet.size + overlapReplacements + additionalFromClassAndInt;

  // 3. Lore skills (Background lore, Additional Lore feats, extra manual Lores)
  const loreItems = actor.itemTypes?.lore || [];
  const normalizeLoreKey = (val) => String(val || "")
    .toLowerCase()
    .replace(/\blore\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const knownLoreKeys = new Set(loreItems.map(l => normalizeLoreKey(l.name)).filter(Boolean));
  const knownLoreNames = loreItems.map(l => l.name).filter(Boolean);

  // Detect named Background Lore(s) AND choice-based/custom Background Lore(s)
  const bgCustomSkillText = String(bgSys.trainedSkills?.custom || "").trim();
  const bgDescText = String(bgSys.description?.value || "").toLowerCase();
  const hasCustomBgLore = bgLores.length === 0 && Boolean(
    actor.background && (/\blore\b/i.test(bgCustomSkillText) || /\blore\s+skill\b/i.test(bgDescText))
  );
  const expectedBgLoreCount = bgLores.length > 0 ? bgLores.length : (hasCustomBgLore ? 1 : 0);

  const missingBgLores = [];
  for (const rawBgLore of bgLores) {
    const key = normalizeLoreKey(rawBgLore);
    if (!key) continue;
    const matched = knownLoreKeys.has(key)
      || Array.from(knownLoreKeys).some(k => k.includes(key) || key.includes(k));
    if (!matched) {
      const displayName = /\blore$/i.test(String(rawBgLore).trim())
        ? String(rawBgLore).trim()
        : `${String(rawBgLore).trim()} Lore`;
      missingBgLores.push(displayName);
    }
  }

  let featLoreCount = 0;
  let manualLoreIncreasesSpent = 0;

  // Feats that auto-grant a Lore item (Additional Lore, Esoteric Lore, Bardic Lore, Gnome Obsession, etc.)
  const loreGrantingFeatSlugs = new Set([
    "additional-lore",
    "bardic-lore",
    "esoteric-lore",
    "gossip-lore",
    "loremaster-dedication",
    "gnome-obsession"
  ]);
  for (const feat of actor.itemTypes?.feat || []) {
    const slug = getItemSlug(feat);
    if (loreGrantingFeatSlugs.has(slug)) featLoreCount++;
  }

  // Also count Lore items with PF2e grantedBy flag
  const grantedLoreIds = new Set();
  for (const lore of loreItems) {
    if (lore.flags?.pf2e?.grantedBy?.id) grantedLoreIds.add(lore.id);
    const srcLoreRank = Number(lore._source?.system?.proficient?.value ?? 1);
    if (srcLoreRank > 1 && !grantedLoreIds.has(lore.id)) {
      manualLoreIncreasesSpent += (srcLoreRank - 1);
    }
  }

  const expectedMinLores = expectedBgLoreCount + featLoreCount;
  const missingLoreCount = Math.max(missingBgLores.length, Math.max(0, expectedMinLores - loreItems.length));
  const effectiveAutoLores = Math.max(expectedMinLores, grantedLoreIds.size);
  const extraManualLores = Math.max(0, loreItems.length - effectiveAutoLores);

  // Players can spend trained skill picks on either Core Skills OR extra Lore skills
  const currentTrainedEffective = trainedCoreCount + extraManualLores;
  const missingTrainedSkills = Math.max(0, expectedTrainedRaw - currentTrainedEffective);
  const extraTrainedSkills = Math.max(0, currentTrainedEffective - expectedTrainedRaw);

  // 4. Skill Increases by Level (union of Primary Class + Dual Class unique extra levels!)
  const defaultIncLevels = [3, 5, 7, 9, 11, 13, 15, 17, 19];
  const primaryIncLevels = extractLevelArray(pClassSys.skillIncreaseLevels);
  const dualIncLevels = dClassSys ? extractLevelArray(dClassSys.skillIncreaseLevels) : [];

  const mergedIncSet = new Set(primaryIncLevels.length > 0 ? primaryIncLevels : (actor.class ? defaultIncLevels : []));
  for (const l of dualIncLevels) mergedIncSet.add(l);

  const unlockedIncreaseLevels = Array.from(mergedIncSet)
    .filter(l => l <= level)
    .sort((a, b) => a - b);

  const expectedIncreases = unlockedIncreaseLevels.length;
  const spentIncreases = manualCoreIncreasesSpent + manualLoreIncreasesSpent;

  // If a player used a skill increase to become Trained in a brand-new skill (legal in PF2e!)
  const increasesUsedForTraining = spentIncreases < expectedIncreases
    ? Math.min(expectedIncreases - spentIncreases, extraTrainedSkills)
    : 0;
  const effectiveIncreasesSpent = spentIncreases + increasesUsedForTraining;
  const missingIncreases = Math.max(0, expectedIncreases - effectiveIncreasesSpent);
  const excessIncreases = Math.max(0, spentIncreases - expectedIncreases);

  const isFastProgression = unlockedIncreaseLevels.includes(2) || primaryIncLevels.includes(2) || dualIncLevels.includes(2);

  // Build readable formula breakdown
  const formulaParts = [];
  if (autoTrainedSet.size > 0) formulaParts.push(`${autoTrainedSet.size} Auto (Class/BG/Features)`);
  if (overlapReplacements > 0) formulaParts.push(`+${overlapReplacements} Overlap Bonus`);
  if (actor.class) formulaParts.push(`+${effectiveClassAdd} ${classAddSource}`);
  if (intMod !== 0) formulaParts.push(`${intMod > 0 ? "+" : ""}${intMod} INT`);
  const formulaText = formulaParts.join(" ") || "Select a Class & Background";

  const issues = [];
  if (actor.class && missingTrainedSkills > 0) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingTrainedSkills} Trained Skill${missingTrainedSkills === 1 ? "" : "s"} (${currentTrainedEffective}/${expectedTrainedRaw})`,
      detail: `Expected ${expectedTrainedRaw} trained skills (${formulaText})${expectedBgLoreCount ? ` plus ${expectedBgLoreCount} Background Lore` : ""}.`
    });
  }
  if (missingBgLores.length > 0) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Missing Background Lore: ${missingBgLores.join(", ")}`,
      detail: `Your ${actor.background?.name || "Background"} grants Trained in ${missingBgLores.join(", ")}. Add the Lore skill on the Skills tab.`
    });
  } else if (expectedBgLoreCount > 0 && loreItems.length < expectedBgLoreCount) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Missing Background Lore (${loreItems.length}/${expectedBgLoreCount})`,
      detail: `Your ${actor.background?.name || "Background"} grants a Lore skill${bgCustomSkillText ? ` (${bgCustomSkillText})` : ""}, but no Lore skill is on the sheet yet.`
    });
  } else if (missingLoreCount > 0) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingLoreCount} Lore Skill${missingLoreCount === 1 ? "" : "s"} (${loreItems.length}/${expectedMinLores})`,
      detail: `Expected at least ${expectedMinLores} Lore skill(s) from Background (${expectedBgLoreCount}) and Lore feats (${featLoreCount}).`
    });
  }
  if (actor.class && missingIncreases > 0) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingIncreases} Skill Increase${missingIncreases === 1 ? "" : "s"} (${effectiveIncreasesSpent}/${expectedIncreases})`,
      detail: `At Level ${level}, you have earned ${expectedIncreases} skill increase(s) at level(s): ${unlockedIncreaseLevels.join(", ")}.`
    });
  }
  if (overCapSkills.length > 0) {
    issues.push({
      severity: "warning",
      category: "Skills",
      title: `Skill Proficiency Above Level Cap`,
      detail: overCapSkills.map(s => `${s.label} (${s.rankLabel} requires Lv ${s.requiredLevel}+)`).join(", ")
    });
  }

  return {
    intMod,
    autoTrainedCount: autoTrainedSet.size,
    overlapReplacements,
    effectiveClassAdd,
    classAddSource,
    additionalFromClassAndInt,
    expectedTrained: expectedTrainedRaw,
    trainedCoreCount,
    loreCount: loreItems.length,
    knownLoreNames,
    bgLoreCount: expectedBgLoreCount,
    bgLoreNames: bgLores,
    missingBgLores,
    hasMissingBgLore: missingBgLores.length > 0 || (expectedBgLoreCount > 0 && loreItems.length < expectedBgLoreCount),
    expectedMinLores,
    missingLoreCount,
    loreStatus: missingLoreCount > 0 ? "missing" : "complete",
    extraManualLores,
    currentTrained: currentTrainedEffective,
    missingTrained: missingTrainedSkills,
    extraTrained: extraTrainedSkills,
    trainedStatus: missingTrainedSkills > 0 ? "missing" : (extraTrainedSkills > 0 ? "extra" : "complete"),
    expectedIncreases,
    spentIncreases: effectiveIncreasesSpent,
    rawSpentIncreases: spentIncreases,
    increasesUsedForTraining,
    missingIncreases,
    excessIncreases,
    unlockedIncreaseLevels,
    increaseLevelsText: unlockedIncreaseLevels.length > 0 ? unlockedIncreaseLevels.join(", ") : "None yet (starts Lv 3)",
    isFastProgression,
    increasesStatus: missingIncreases > 0 ? "missing" : (excessIncreases > 0 ? "extra" : "complete"),
    overCapSkills,
    rankCounts,
    formulaText,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 4.5. ALCHEMIST & CRAFTING FORMULAS ANALYSIS                               */
/* ------------------------------------------------------------------------- */

/**
 * Computes expected free crafting formulas (PF2e Remaster Player Core 2 Alchemist +
 * Alchemical/Magical/Snare Crafting feats) vs formulas currently in `actor.system.crafting.formulas`.
 *
 * Remaster Alchemist Formula Book:
 *  - Level 1: 8 common 1st-level alchemical formulas (4 Alchemical Crafting + 2 Formula Book + 2 Research Field)
 *  - Each level after 1: +2 free common alchemical formulas (up to actor's level) -> 8 + 2 * (level - 1)
 */
function analyzeFormulas(actor, level, dualInfo = null) {
  const primarySlug = actor.class ? getItemSlug(actor.class) : "";
  const isAlchemist = primarySlug === "alchemist" || dualInfo?.slug === "alchemist";
  const feats = actor.itemTypes?.feat || [];
  const featSlugs = new Set(feats.map(getItemSlug));

  const hasAlchemicalCrafting = featSlugs.has("alchemical-crafting") || featSlugs.has("alchemist-dedication");
  const hasSnareCrafting = featSlugs.has("snare-crafting");
  const hasMagicalCrafting = featSlugs.has("magical-crafting");

  let expected = 0;
  const parts = [];

  if (isAlchemist) {
    // 4 Alchemical Crafting + 2 Formula Book + 2 Research Field at Lv 1, plus +2 per level for Lv 2..level
    const lvlUps = Math.max(0, level - 1) * 2;
    expected += 8 + lvlUps;
    parts.push(`8 Alchemist Lv 1 (4 Alchemical Crafting + 2 Formula Book + 2 Research Field)`);
    if (lvlUps > 0) parts.push(`+${lvlUps} Level-Ups (2/lv for Lv 2–${level})`);
  } else if (hasAlchemicalCrafting) {
    expected += 4;
    parts.push("4 Alchemical Crafting");
  }

  if (hasSnareCrafting) {
    expected += 4;
    parts.push("+4 Snare Crafting");
  }
  if (hasMagicalCrafting) {
    expected += 4;
    parts.push("+4 Magical Crafting");
  }

  const rawFormulas = actor.system?.crafting?.formulas;
  const current = Array.isArray(rawFormulas)
    ? rawFormulas.filter(Boolean).length
    : (rawFormulas && typeof rawFormulas === "object" ? Object.values(rawFormulas).filter(Boolean).length : 0);

  const hasFormulas = expected > 0 || current > 0;
  const missing = Math.max(0, expected - current);
  const formulaText = parts.join(" ");
  const issues = [];

  if (expected > 0 && missing > 0) {
    issues.push({
      severity: "warning",
      category: "Formulas",
      title: `Missing ${missing} ${isAlchemist ? "Alchemical " : ""}Formula${missing === 1 ? "" : "s"} (${current}/${expected})`,
      detail: `Expected at least ${expected} free formula(s) at Level ${level}: ${formulaText}. Add them on the Crafting tab.`
    });
  }

  return {
    hasFormulas,
    isAlchemist,
    perLevelGain: isAlchemist ? 2 : 0,
    current,
    expected,
    missing,
    complete: missing === 0,
    formulaText,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 5. FEATS & FEAT SLOTS ANALYSIS                                            */
/* ------------------------------------------------------------------------- */

export function extractGroupSlots(group) {
  const raw = group?.slots;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw.values === "function") return Array.from(raw.values());
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

function analyzeFeats(actor, level, dualInfo) {
  const groups = [];
  const issues = [];
  let totalSlots = 0;
  let filledSlots = 0;
  let emptySlotsTotal = 0;

  // Inspect every slotted FeatGroup natively prepared on `actor.feats`
  // Covers Ancestry, Ancestry Paragon, Class, Dual Class, Free Archetype, Skill, General!
  const skipGroupIds = new Set(["classfeature", "pfsboon", "deityboon", "curse", "bonus", "mythic", "calling"]);
  const featsCol = actor.feats;

  if (featsCol && typeof featsCol.values === "function") {
    for (const group of featsCol.values()) {
      if (!group || skipGroupIds.has(group.id)) continue;
      const slots = extractGroupSlots(group);
      if (slots.length === 0) continue;

      const emptyLevels = [];
      let groupFilled = 0;

      for (const slot of slots) {
        const hasFeat = Boolean(slot?.feat);
        if (hasFeat) {
          groupFilled++;
        } else {
          const lvl = slot?.level ?? slot?.label ?? "?";
          emptyLevels.push(String(lvl));
        }
      }

      const groupTotal = slots.length;
      const groupEmpty = groupTotal - groupFilled;

      totalSlots += groupTotal;
      filledSlots += groupFilled;
      emptySlotsTotal += groupEmpty;

      const label = game.i18n?.localize?.(group.label) || group.label || capitalize(group.id);
      groups.push({
        id: group.id,
        label,
        filled: groupFilled,
        total: groupTotal,
        empty: groupEmpty,
        emptyLevels,
        emptyLevelsText: emptyLevels.join(", "),
        complete: groupEmpty === 0
      });

      if (groupEmpty > 0) {
        issues.push({
          severity: "warning",
          category: "Feats",
          title: `${label}: ${groupEmpty} Empty Slot${groupEmpty === 1 ? "" : "s"} (${groupFilled}/${groupTotal})`,
          detail: `Empty slot level(s): ${emptyLevels.join(", ")}.`
        });
      }
    }
  }

  // Check if Dual Class features are behind the character's current level
  const missingDualFeatures = [];
  if (dualInfo?.system?.items) {
    const classItems = Object.entries(dualInfo.system.items);
    for (const [key, entry] of classItems) {
      const reqLvl = Number(entry?.level ?? 1);
      if (!entry?.uuid || reqLvl > level) continue;
      const targetSlug = normalizeSlug(entry.name);
      const hasIt = actor.items.some(i => {
        const dcFlags = i.flags?.[VARIANT_RULES_MODULE_ID];
        if (dcFlags?.grantedByDualClass && dcFlags.dualClassFeatureKey === key) return true;
        const src = i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? i.sourceId;
        if (src && src === entry.uuid) return true;
        if (targetSlug && i.type === "feat" && getItemSlug(i) === targetSlug) return true;
        return false;
      });
      if (!hasIt) {
        missingDualFeatures.push({ name: entry.name || "Class Feature", level: reqLvl });
      }
    }

    if (missingDualFeatures.length > 0) {
      issues.push({
        severity: "warning",
        category: "Dual Class",
        title: `${missingDualFeatures.length} Missing ${dualInfo.name} Class Feature${missingDualFeatures.length === 1 ? "" : "s"}`,
        detail: missingDualFeatures.slice(0, 5).map(f => `${f.name} (Lv ${f.level})`).join(", ") + (missingDualFeatures.length > 5 ? ` (+${missingDualFeatures.length - 5} more)` : "")
      });
    }
  }

  return {
    groups,
    totalSlots,
    filledSlots,
    emptySlotsTotal,
    missingDualFeatures,
    hasMissingDualFeatures: missingDualFeatures.length > 0,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 6. SPELLCASTING DETECTION, EXPECTED SLOTS & ENTRY CREATION                */
/* ------------------------------------------------------------------------- */

/**
 * Inspects an actor's embedded feats/features to detect dynamic tradition (Sorcerer/Witch/Summoner)
 * or spellcasting ability (Psychic).
 */
function detectDynamicTradition(actor, hintKeywords = []) {
  const feats = actor.itemTypes?.feat || [];
  const candidates = [];

  for (const feat of feats) {
    const slug = getItemSlug(feat);
    const name = String(feat.name || "").toLowerCase();
    const traits = feat.system?.traits?.value || [];
    const matchesHint = hintKeywords.length === 0 || hintKeywords.some(k =>
      slug.includes(k) || name.includes(k) || traits.includes(k)
    );
    if (!matchesHint) continue;
    candidates.push(feat);
  }

  // Known PF2e bloodline / patron / eidolon keyword maps first
  const traditionKeywords = {
    arcane: ["imperial", "draconic", "dragon", "inscribed-one", "spinner-of-threads", "construct-eidolon", "runelord", "arcane"],
    divine: ["angelic", "demonic", "diabolic", "undead", "wyrmblessed", "faiths-flamekeeper", "angel-eidolon", "demon-eidolon", "psychopomp-eidolon", "divine"],
    occult: ["aberrant", "hag", "harrow", "shadow", "resentment", "starless-shadow", "silence-in-snow", "anger-phantom", "devotion-phantom", "occult"],
    primal: ["elemental", "fey", "phoenix", "wilding-steward", "ripple-in-the-deep", "beast-eidolon", "fey-eidolon", "plant-eidolon", "primal"]
  };

  for (const feat of candidates) {
    // Check PF2e ChoiceSet rule selections on the feat first (e.g., Monk Qi Spells, Witch Patron, Sorcerer Bloodline)
    const selections = feat.flags?.pf2e?.rulesSelections;
    if (selections && typeof selections === "object") {
      for (const val of Object.values(selections)) {
        const sVal = String(val || "").toLowerCase();
        if (["arcane", "divine", "occult", "primal"].includes(sVal)) return sVal;
      }
    }

    const slug = getItemSlug(feat);
    const desc = String(feat.system?.description?.value || "").toLowerCase();

    // Explicit PF2e description patterns ("Tradition arcane", "Spell List divine", "cast primal spells")
    const explicitMatch = desc.match(/(?:tradition|spell\s*list)\s*[:<>/a-z\s]{0,20}\b(arcane|divine|occult|primal)\b/i)
      || desc.match(/\bcast\s+(arcane|divine|occult|primal)\s+spells\b/i);
    if (explicitMatch) {
      return explicitMatch[1].toLowerCase();
    }

    for (const [trad, keys] of Object.entries(traditionKeywords)) {
      if (keys.some(k => k !== trad && slug.includes(k))) {
        return trad;
      }
    }
  }

  // Check actor rollOptions for explicit PF2e bloodline/patron/eidolon tradition options
  const rollAll = actor.rollOptions?.all || {};
  for (const trad of ["arcane", "divine", "occult", "primal"]) {
    if (rollAll[`bloodline:tradition:${trad}`] || rollAll[`patron:tradition:${trad}`]) {
      return trad;
    }
  }

  return null;
}

function detectPsychicAbility(actor) {
  const feats = actor.itemTypes?.feat || [];
  for (const feat of feats) {
    const slug = getItemSlug(feat);
    if (slug.includes("emotional-acceptance") || slug.includes("wandering-reverie")) return "cha";
    if (slug.includes("gathered-lore") || slug.includes("precise-discipline")) return "int";
  }
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
  return intMod >= chaMod ? "int" : "cha";
}

/**
 * Checks if a feat with any of the provided slugs exists on the actor.
 */
function actorHasFeatSlug(actor, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return false;
  const targetSet = new Set(slugs.map(normalizeSlug));
  return (actor.itemTypes?.feat || []).some(f => targetSet.has(getItemSlug(f)));
}

/**
 * Finds the first matching feat document on the actor by slug list or predicate.
 */
function findActorFeat(actor, predicate) {
  return (actor.itemTypes?.feat || []).find(predicate) || null;
}

/**
 * Formats a slots object `{ 1: 3, 2: 2, ... }` into a compact display summary.
 */
export function formatSlotsSummary(slots) {
  const parts = [];
  for (let r = 1; r <= 10; r++) {
    const count = Number(slots?.[r] || 0);
    if (count > 0) parts.push(`R${r}: ${count}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Cantrips only";
}

function countTotalLeveledSlots(slots) {
  let total = 0;
  for (let r = 1; r <= 10; r++) {
    total += Number(slots?.[r] || 0);
  }
  return total;
}

/**
 * Build all expected spellcasting sources for an actor based on:
 *  1. Primary Class + class spellcasting features on Feats tab
 *  2. Dual Class (PF2e Awesome Variant Rules) + dual class spellcasting features on Feats tab
 *  3. Multiclass & Spellcasting Archetype feats on Feats tab (Class Feats, Dual Class Feats, Free Archetype)
 */
function detectExpectedSpellcastingSources(actor, level, dualInfo) {
  const sources = [];
  const feats = actor.itemTypes?.feat || [];
  const featSlugs = new Set(feats.map(getItemSlug));

  const hasFlexibleCaster = featSlugs.has("flexible-spellcaster-dedication") || featSlugs.has("flexible-spellcaster");

  // Helper to construct a class spellcasting spec (Primary or Dual Class)
  const addClassCaster = (classSlug, sourceKind) => {
    const def = CLASS_SPELLCASTING_DEFS[classSlug];
    if (!def) return;

    const isDual = sourceKind === "dual";
    const sourceBadge = isDual ? "Dual Class" : "Primary Class";

    // Detect dynamic tradition / ability
    let tradition = def.tradition;
    if (!tradition) {
      if (classSlug === "sorcerer") tradition = detectDynamicTradition(actor, ["bloodline", "sorcerer"]);
      else if (classSlug === "witch") tradition = detectDynamicTradition(actor, ["patron", "witch"]);
      else if (classSlug === "summoner") tradition = detectDynamicTradition(actor, ["eidolon", "summoner"]);
    }

    let ability = def.ability;
    if (!ability && classSlug === "psychic") {
      ability = detectPsychicAbility(actor);
    }

    const hasTenthFeat = actorHasFeatSlug(actor, def.extraTenthFeats || []);

    // Special case: Animist has TWO distinct spellcasting entries (Prepared Divine + Spontaneous Apparition)
    if (def.mode === "animist") {
      const prepSlots = buildFullCasterSlots(level, 2, { hasTenthFeat });
      prepSlots[0] = 2;
      sources.push({
        key: `class:${classSlug}:prepared:${sourceKind}`,
        classSlug,
        sourceKind,
        sourceBadge,
        title: `${def.className} Prepared Spells`,
        entryName: `Divine Prepared Spells (${def.className})`,
        castingType: "prepared",
        flexible: hasFlexibleCaster,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: 2,
        slots: prepSlots,
        totalLeveledSlots: countTotalLeveledSlots(prepSlots),
        slotsSummary: formatSlotsSummary(prepSlots),
        expectedSpellsNote: "Prepares daily from the full common Divine spell list",
        repertoireExpected: null,
        signatureExpected: 0
      });

      const appSlots = buildAnimistApparitionSlots(level);
      appSlots[0] = 0;
      const apparitionCantrips = level >= 15 ? 4 : (level >= 7 ? 3 : 2);
      sources.push({
        key: `class:${classSlug}:apparition:${sourceKind}`,
        classSlug,
        sourceKind,
        sourceBadge,
        title: `${def.className} Apparition Spells`,
        entryName: `Apparition Spells (${def.className})`,
        castingType: "spontaneous",
        flexible: false,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: apparitionCantrips,
        slots: appSlots,
        totalLeveledSlots: countTotalLeveledSlots(appSlots),
        slotsSummary: formatSlotsSummary(appSlots),
        expectedSpellsNote: "Spontaneous repertoire from attuned Apparitions (all act as signature spells)",
        repertoireExpected: null,
        signatureExpected: 0
      });
      return;
    }

    // Standard Full Caster
    let cantrips = def.cantrips;
    let extraNote = "";
    let flexible = false;

    // Check Wizard Arcane School bonus curriculum slot (all schools except Unified Magical Theory / Universalist)
    let bonusPerRank = 0;
    if (classSlug === "wizard" && hasWizardArcaneSchool(feats, featSlugs)) {
      bonusPerRank = 1;
      cantrips = 6; // 5 base + 1 curriculum cantrip
      extraNote = "Includes +1 Arcane School curriculum slot per rank & +1 cantrip";
    }

    const slots = buildFullCasterSlots(level, def.baseSlotsPerRank, {
      bonusPerRank,
      hasTenthFeat,
      includeTenth: def.includeTenth !== false
    });

    // Apply Flexible Spellcaster archetype adjustment for prepared full casters
    if (def.castingType === "prepared" && hasFlexibleCaster) {
      flexible = true;
      for (let r = 1; r <= 9; r++) {
        if (slots[r] > 1) slots[r] = Math.max(1, slots[r] - 1);
      }
      extraNote = extraNote ? `${extraNote}; Flexible Spellcaster (-1 slot/rank)` : "Flexible Spellcaster (-1 slot/rank, flexible collection)";
    }

    // Set slot0 (cantrip preparation count for prepared casters; 0 for spontaneous)
    slots[0] = def.castingType === "prepared" ? cantrips : 0;

    const totalLeveledSlots = countTotalLeveledSlots(slots);

    // Expected spell count guidance (Repertoire vs Spellbook vs Full Tradition List)
    let repertoireExpected = null;
    let expectedSpellsNote = "";
    let signatureExpected = 0;

    if (def.repertoireMatchesSlots) {
      repertoireExpected = totalLeveledSlots;
      if (def.signatureFromLevel && level >= def.signatureFromLevel) {
        signatureExpected = Math.min(9, Math.ceil(level / 2));
      }
      expectedSpellsNote = `Repertoire: ${cantrips} cantrips + ${repertoireExpected} leveled spells${signatureExpected > 0 ? ` (${signatureExpected} signature)` : ""}`;
    } else if (def.spellbookBase) {
      const bookExpected = def.spellbookBase + Math.max(0, level - 1) * (def.spellbookPerLevel || 2);
      expectedSpellsNote = `Spellbook / Familiar: ~${def.spellbookCantrips} cantrips & ~${bookExpected} leveled spells learned (${cantrips} cantrips + ${totalLeveledSlots} slots prepared daily)`;
    } else {
      expectedSpellsNote = `Prepares ${cantrips} cantrips + ${totalLeveledSlots} leveled spells daily from full ${TRADITION_LABELS[tradition] || ""} list`;
    }
    if (extraNote) {
      expectedSpellsNote = `${expectedSpellsNote} · ${extraNote}`;
    }

    const tradLabel = TRADITION_LABELS[tradition] || "Choose Tradition";
    const typeLabel = flexible ? "Flexible" : (CASTING_TYPE_LABELS[def.castingType] || capitalize(def.castingType));

    sources.push({
      key: `class:${classSlug}:${sourceKind}`,
      classSlug,
      sourceKind,
      sourceBadge,
      title: `${def.className} Spellcasting`,
      entryName: `${tradition ? `${tradLabel} ` : ""}${typeLabel} Spells (${def.className})`,
      castingType: def.castingType,
      flexible,
      tradition: tradition || "",
      ability: ability || "int",
      traditionMissing: !tradition,
      cantrips,
      slots,
      totalLeveledSlots,
      slotsSummary: formatSlotsSummary(slots),
      expectedSpellsNote,
      repertoireExpected,
      signatureExpected
    });

    // Cleric Divine Font (Remaster: 4 slots at L1-14, 5 at L15-18, 6 at L19-20 at highest spell rank)
    if (def.hasDivineFont) {
      const fontRank = Math.min(10, Math.ceil(level / 2));
      const fontCount = level >= 19 ? 6 : (level >= 15 ? 5 : 4);
      const fontSlots = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
      fontSlots[fontRank] = fontCount;
      const isHarm = featSlugs.has("harmful-font");
      const fontSpell = isHarm ? "Harm" : "Heal";

      sources.push({
        key: `class:cleric:divine-font:${sourceKind}`,
        classSlug: "cleric",
        sourceKind,
        sourceBadge: `${sourceBadge} · Font`,
        title: `Cleric Divine Font (${fontSpell})`,
        entryName: `Divine Font (${fontSpell})`,
        castingType: "prepared",
        flexible: false,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: 0,
        slots: fontSlots,
        totalLeveledSlots: fontCount,
        slotsSummary: `R${fontRank}: ${fontCount} (${fontSpell})`,
        expectedSpellsNote: `Remaster Divine Font grants ${fontCount} extra Rank ${fontRank} ${fontSpell} slot(s) per day`,
        repertoireExpected: null,
        signatureExpected: 0,
        isDivineFont: true
      });
    }
  };

  // 1. Primary Class
  const coveredClassSlugs = new Set();
  const primarySlug = actor.class ? getItemSlug(actor.class) : "";
  if (primarySlug && CLASS_SPELLCASTING_DEFS[primarySlug]) {
    coveredClassSlugs.add(primarySlug);
    addClassCaster(primarySlug, "primary");
  }

  // 2. Dual Class (PF2e Awesome Variant Rules)
  if (dualInfo?.slug && dualInfo.slug !== primarySlug && CLASS_SPELLCASTING_DEFS[dualInfo.slug]) {
    coveredClassSlugs.add(dualInfo.slug);
    addClassCaster(dualInfo.slug, "dual");
  }

  // 2b. Direct Class Spellcasting Features on the Feats tab
  //     Catches Dual Class features even if Dual Class setting was toggled / added via another
  //     module (e.g. PF2e Workbench) or homebrew spellcasting class features placed on the Feats tab!
  for (const feat of feats) {
    const category = feat.system?.category;
    if (category !== "classfeature" && category !== "class") continue;
    const slug = getItemSlug(feat);
    const nameLower = String(feat.name || "").toLowerCase();
    const isClassSpellcastingFeat = (
      slug.endsWith("-spellcasting")
      && !slug.startsWith("basic-")
      && !slug.startsWith("expert-")
      && !slug.startsWith("master-")
    ) || (nameLower.includes("spellcasting") && category === "classfeature" && !/^(basic|expert|master)\b/i.test(nameLower));

    if (!isClassSpellcastingFeat) continue;

    // Identify which official PF2e class this feature belongs to via traits, dual-class flag, or slug
    const traits = Array.isArray(feat.system?.traits?.value) ? feat.system.traits.value.map(normalizeSlug) : [];
    const dualFlagSlug = normalizeSlug(feat.flags?.[VARIANT_RULES_MODULE_ID]?.dualClassSlug || "");

    let matchedClassSlug = "";
    if (dualFlagSlug && CLASS_SPELLCASTING_DEFS[dualFlagSlug]) {
      matchedClassSlug = dualFlagSlug;
    } else {
      matchedClassSlug = traits.find(t => Boolean(CLASS_SPELLCASTING_DEFS[t])) || "";
    }
    if (!matchedClassSlug) {
      for (const clsSlug of Object.keys(CLASS_SPELLCASTING_DEFS)) {
        if (slug.includes(clsSlug)) {
          matchedClassSlug = clsSlug;
          break;
        }
      }
    }

    if (matchedClassSlug) {
      if (coveredClassSlugs.has(matchedClassSlug)) continue;
      coveredClassSlugs.add(matchedClassSlug);
      const kind = feat.flags?.[VARIANT_RULES_MODULE_ID]?.grantedByDualClass ? "dual" : "primary";
      addClassCaster(matchedClassSlug, kind);
    } else {
      // Custom / homebrew class spellcasting feature on the Feats tab
      const genericKey = `classfeature:${slug}`;
      if (sources.some(s => s.key === genericKey)) continue;
      const desc = String(feat.system?.description?.value || "").toLowerCase();
      const tradMatch = slug.match(/\b(arcane|divine|occult|primal)\b/) || desc.match(/\b(arcane|divine|occult|primal)\b/);
      const tradition = tradMatch ? tradMatch[1] : "";
      const castingType = desc.includes("spontaneous") ? "spontaneous" : "prepared";
      const slots = buildFullCasterSlots(level, 3);
      slots[0] = castingType === "prepared" ? 5 : 0;
      const ability = tradition === "arcane" ? "int" : (tradition === "divine" || tradition === "primal" ? "wis" : "cha");

      const totalLeveledSlots = countTotalLeveledSlots(slots);
      sources.push({
        key: genericKey,
        classSlug: slug,
        sourceKind: "classfeature",
        sourceBadge: "Class Feature",
        title: feat.name || "Class Spellcasting",
        entryName: `${tradition ? `${TRADITION_LABELS[tradition]} ` : ""}${CASTING_TYPE_LABELS[castingType]} (${feat.name})`,
        castingType,
        flexible: castingType === "prepared" && hasFlexibleCaster,
        tradition,
        ability,
        traditionMissing: !tradition,
        cantrips: 5,
        slots,
        totalLeveledSlots,
        slotsSummary: formatSlotsSummary(slots),
        expectedSpellsNote: `Detected from "${feat.name}" on Feats tab · Standard full-caster slot progression`,
        repertoireExpected: castingType === "spontaneous" ? totalLeveledSlots : null,
        signatureExpected: castingType === "spontaneous" && level >= 3 ? Math.min(9, Math.ceil(level / 2)) : 0
      });
    }
  }

  // 3. Known Multiclass & Free Archetype Spellcasting Feats on the Feats Tab
  const detectedArchetypeKeys = new Set();

  for (const [archKey, def] of Object.entries(ARCHETYPE_SPELLCASTING_DEFS)) {
    const hasDedication = actorHasFeatSlug(actor, def.dedicationSlugs);
    const hasBasic = actorHasFeatSlug(actor, def.basicSlugs);
    const hasExpert = actorHasFeatSlug(actor, def.expertSlugs);
    const hasMaster = actorHasFeatSlug(actor, def.masterSlugs);
    const hasBreadth = actorHasFeatSlug(actor, def.breadthSlugs);

    if (!hasDedication && !hasBasic && !hasExpert && !hasMaster) continue;
    detectedArchetypeKeys.add(archKey);

    let tradition = def.tradition;
    if (!tradition) {
      if (archKey === "sorcerer") tradition = detectDynamicTradition(actor, ["bloodline", "sorcerer"]);
      else if (archKey === "witch") tradition = detectDynamicTradition(actor, ["patron", "witch"]);
      else if (archKey === "summoner") tradition = detectDynamicTradition(actor, ["eidolon", "summoner"]);
      else if (archKey === "cathartic-mage") tradition = detectDynamicTradition(actor, ["cathartic"]);
    }

    let ability = def.ability;
    if (!ability && archKey === "psychic") {
      ability = detectPsychicAbility(actor);
    }

    const slots = buildArchetypeSlots(level, { hasBasic, hasExpert, hasMaster, hasBreadth });

    slots[0] = def.castingType === "prepared" ? def.cantrips : 0;

    const totalLeveledSlots = countTotalLeveledSlots(slots);
    const tierTags = [
      hasDedication ? "Dedication" : null,
      hasBasic ? "Basic" : null,
      hasExpert ? "Expert" : null,
      hasMaster ? "Master" : null,
      hasBreadth ? "Breadth" : null
    ].filter(Boolean);

    // Check if placed inside Free Archetype slot group for nicer badge labeling
    const dedFeat = findActorFeat(actor, f =>
      def.dedicationSlugs.includes(getItemSlug(f)) || def.basicSlugs.includes(getItemSlug(f))
    );
    const isFreeArchetypeSlot = typeof dedFeat?.system?.location === "string" && dedFeat.system.location.startsWith("archetype-");

    const tradLabel = TRADITION_LABELS[tradition] || "Choose Tradition";
    const typeLabel = CASTING_TYPE_LABELS[def.castingType] || capitalize(def.castingType);

    let signatureExpected = 0;
    if (def.castingType === "spontaneous" && hasBasic) {
      if (level >= 6) signatureExpected++;
      if (hasExpert && level >= 12) signatureExpected++;
      if (hasMaster && level >= 18) signatureExpected++;
    }

    const expectedSpellsNote = totalLeveledSlots > 0
      ? `Feats: ${tierTags.join(", ")} · ${def.cantrips} cantrips + ${totalLeveledSlots} leveled slot(s)${signatureExpected > 0 ? ` (${signatureExpected} signature)` : ""}`
      : `Feats: ${tierTags.join(", ")} · ${def.cantrips} cantrip(s) (take Basic Spellcasting at Lv 4+ for leveled slots)`;

    sources.push({
      key: `archetype:${archKey}`,
      classSlug: archKey,
      sourceKind: "archetype",
      sourceBadge: isFreeArchetypeSlot ? "Free Archetype" : "Archetype",
      title: def.label,
      entryName: `${tradition ? `${tradLabel} ` : ""}${typeLabel} (${def.label})`,
      castingType: def.castingType,
      flexible: false,
      tradition: tradition || "",
      ability: ability || "cha",
      traditionMissing: !tradition,
      cantrips: def.cantrips,
      slots,
      totalLeveledSlots,
      slotsSummary: formatSlotsSummary(slots),
      expectedSpellsNote,
      repertoireExpected: def.castingType === "spontaneous" ? totalLeveledSlots : null,
      signatureExpected
    });
  }

  // 4. Generic Fallback Detector for ANY other "Basic/Expert/Master <X> Spellcasting" feats
  //    (covers custom homebrew or newer Paizo archetypes automatically!)
  const genericArchetypes = new Map();
  for (const feat of feats) {
    const slug = getItemSlug(feat);
    const m = slug.match(/^(basic|expert|master)-([a-z0-9-]+)-spellcasting$/);
    if (!m) continue;
    const tier = m[1];
    const archNameSlug = m[2];
    if (detectedArchetypeKeys.has(archNameSlug)) continue;
    // Skip bounded aliases already handled
    if (archNameSlug === "bounded" && (detectedArchetypeKeys.has("magus") || detectedArchetypeKeys.has("summoner"))) continue;

    let rec = genericArchetypes.get(archNameSlug);
    if (!rec) {
      rec = { archNameSlug, hasBasic: false, hasExpert: false, hasMaster: false, hasBreadth: false, sampleFeat: feat };
      genericArchetypes.set(archNameSlug, rec);
    }
    if (tier === "basic") rec.hasBasic = true;
    if (tier === "expert") rec.hasExpert = true;
    if (tier === "master") rec.hasMaster = true;
  }

  for (const [archSlug, rec] of genericArchetypes.entries()) {
    const desc = String(rec.sampleFeat?.system?.description?.value || "").toLowerCase();
    const tradMatch = desc.match(/\b(arcane|divine|occult|primal)\b/);
    const tradition = tradMatch ? tradMatch[1] : "";
    const castingType = desc.includes("prepared") ? "prepared" : (desc.includes("innate") ? "innate" : "spontaneous");
    const slots = buildArchetypeSlots(level, rec);
    slots[0] = castingType === "prepared" ? 2 : 0;
    const totalLeveledSlots = countTotalLeveledSlots(slots);
    const slotsSummary = formatSlotsSummary(slots);
    const prettyName = archSlug.split("-").map(capitalize).join(" ");

    sources.push({
      key: `archetype:${archSlug}`,
      classSlug: archSlug,
      sourceKind: "archetype",
      sourceBadge: "Archetype",
      title: `${prettyName} Spellcasting`,
      entryName: `${tradition ? `${TRADITION_LABELS[tradition]} ` : ""}${CASTING_TYPE_LABELS[castingType]} (${prettyName})`,
      castingType,
      flexible: false,
      tradition,
      ability: tradition === "arcane" ? "int" : (tradition === "divine" || tradition === "primal" ? "wis" : "cha"),
      traditionMissing: !tradition,
      cantrips: 2,
      slots,
      totalLeveledSlots,
      slotsSummary,
      expectedSpellsNote: `Detected from archetype spellcasting feat(s) · ${slotsSummary}`,
      repertoireExpected: castingType === "spontaneous" ? totalLeveledSlots : null,
      signatureExpected: 0
    });
  }

  // 5. Focus Spellcasting Sources (Primary Class, Dual Class, Class Feats, and Archetypes)
  const focusSources = detectFocusSpellcastingSources(actor, level, dualInfo, primarySlug, feats, featSlugs);
  sources.push(...focusSources);

  return sources;
}

/**
 * Detects all PF2e Focus Spellcasting sources from Primary Class, Dual Class,
 * class features/feats (e.g. Champion Devotion Spells, Magus Conflux Spells,
 * Bard Composition Spells, Cleric Domain Spells, Druid Order Spells, Monk Qi Spells,
 * Ranger Warden Spells, Wizard School Spells, Sorcerer Bloodline Spells, Witch Hexes,
 * Oracle Revelation Spells, Summoner Link Spells, Animist Vessel Spells,
 * Necromancer Grave Spells), Multiclass / Free Archetype focus feats, and a generic
 * fallback for any other focus-spell-granting feat on the Feats tab.
 */
function detectFocusSpellcastingSources(actor, level, dualInfo, primarySlug, feats, featSlugs) {
  const focusSources = [];
  const coveredFeatIds = new Set();
  const focusRank = Math.min(10, Math.ceil(level / 2));
  const focusPoolMax = Number(actor.system?.resources?.focus?.max ?? 0);
  const emptySlots = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };

  const matchFeats = (slugList) => {
    const set = new Set(slugList.map(normalizeSlug));
    const found = feats.filter(f => set.has(getItemSlug(f)));
    for (const f of found) coveredFeatIds.add(f.id);
    return found;
  };

  const hasClassOrDual = (clsSlug) => primarySlug === clsSlug || dualInfo?.slug === clsSlug;
  const classSourceKind = (clsSlug) => (dualInfo?.slug === clsSlug && primarySlug !== clsSlug ? "dual" : "primary");
  const classSourceBadge = (clsSlug) => (classSourceKind(clsSlug) === "dual" ? "Dual Class · Focus" : "Primary Class · Focus");

  const pushFocusSource = ({
    key,
    classSlug,
    sourceKind,
    sourceBadge,
    title,
    entryName,
    tradition,
    ability,
    expectedFocusSpells = 1,
    matchKeywords = [],
    note = ""
  }) => {
    const poolText = focusPoolMax > 0 ? ` · Pool: ${focusPoolMax} FP` : "";
    const slotsSummary = `Rank ${focusRank} Focus (auto-heightened)${poolText}`;
    focusSources.push({
      key,
      classSlug,
      sourceKind,
      sourceBadge,
      title,
      entryName,
      castingType: "focus",
      isFocus: true,
      flexible: false,
      tradition: tradition || "",
      ability: ability || "cha",
      traditionMissing: !tradition,
      cantrips: 0,
      slots: { ...emptySlots },
      totalLeveledSlots: 0,
      slotsSummary,
      expectedFocusSpells: Math.max(1, expectedFocusSpells),
      expectedSpellsNote: note || `Expects at least ${Math.max(1, expectedFocusSpells)} focus spell(s) in this Focus entry (Focus Pool max up to 3 FP)`,
      repertoireExpected: null,
      signatureExpected: 0,
      focusMatchKeywords: matchKeywords
    });
  };

  // --- A. Class-Based Focus Spellcasting (Primary Class OR Dual Class) ---

  // 1. Champion: Devotion Spells (Lay on Hands / Touch of the Void / Shields of the Spirit / Domains / Litanies)
  const champFocusFeats = matchFeats([
    "devotion-spells", "lay-on-hands", "touch-of-corruption", "touch-of-the-void", "touch-of-void",
    "shields-of-the-spirit", "deitys-domain", "deity-s-domain", "advanced-deitys-domain", "advanced-deity-s-domain",
    "litany-against-wrath", "litany-against-sloth", "litany-of-depravity", "litany-of-righteousness",
    "litany-of-self-interest", "litany-of-warding", "unimpeded-step"
  ]);
  if (hasClassOrDual("champion") || featSlugs.has("devotion-spells")) {
    const extraChampDomains = matchFeats(["domain-initiate", "expanded-domain-initiate", "advanced-domain"]);
    const extraCount = champFocusFeats.filter(f => getItemSlug(f) !== "devotion-spells").length + extraChampDomains.length;
    const expectedCount = Math.max(1, 1 + extraCount);
    // Avoid overcounting when both `devotion-spells` AND `lay-on-hands` feat exist for the 1st-level spell
    const baseAdjusted = (featSlugs.has("devotion-spells") && (featSlugs.has("lay-on-hands") || featSlugs.has("touch-of-corruption") || featSlugs.has("touch-of-the-void") || featSlugs.has("shields-of-the-spirit")))
      ? Math.max(1, expectedCount - 1)
      : expectedCount;
    pushFocusSource({
      key: `focus:champion:${classSourceKind("champion")}`,
      classSlug: "champion",
      sourceKind: classSourceKind("champion"),
      sourceBadge: classSourceBadge("champion"),
      title: "Champion Devotion Spells",
      entryName: "Devotion Spells (Champion)",
      tradition: "divine",
      ability: "cha",
      expectedFocusSpells: baseAdjusted,
      matchKeywords: ["devotion", "champion", "lay on hands"],
      note: `Champion Devotion Spells (Divine, CHA) — expects ${baseAdjusted} focus spell(s) at Level ${level}`
    });
  }

  // 2. Magus: Conflux Spells (Hybrid Study focus spell + Force Fang / Runic Impression / Arcane Shroud)
  const magusFocusFeats = matchFeats(["conflux-spells", "force-fang", "runic-impression", "arcane-shroud"]);
  if (hasClassOrDual("magus") || featSlugs.has("conflux-spells")) {
    const bonusFeats = magusFocusFeats.filter(f => getItemSlug(f) !== "conflux-spells").length;
    const expectedCount = 1 + bonusFeats;
    pushFocusSource({
      key: `focus:magus:${classSourceKind("magus")}`,
      classSlug: "magus",
      sourceKind: classSourceKind("magus"),
      sourceBadge: classSourceBadge("magus"),
      title: "Magus Conflux Spells",
      entryName: "Conflux Spells (Magus)",
      tradition: "arcane",
      ability: "int",
      expectedFocusSpells: expectedCount,
      matchKeywords: ["conflux", "magus"],
      note: `Magus Conflux Spells (Arcane, INT) — 1 Hybrid Study conflux spell${bonusFeats > 0 ? ` + ${bonusFeats} bonus conflux feat(s)` : ""}`
    });
  }

  // 3. Bard: Composition Spells (Counter Performance + Muse / Composition Focus Spells)
  const bardFocusFeats = matchFeats([
    "composition-spells", "counter-performance", "lingering-composition", "hymn-of-healing",
    "uplifting-overture", "dirge-of-doom", "house-of-imaginary-walls", "soothing-ballad",
    "ode-to-ouroboros", "allegro", "fatal-aria", "symphony-of-the-unfettered-heart"
  ]);
  if (hasClassOrDual("bard") || featSlugs.has("composition-spells")) {
    const bonusFeats = bardFocusFeats.filter(f => getItemSlug(f) !== "composition-spells" && getItemSlug(f) !== "counter-performance").length;
    const expectedCount = 1 + bonusFeats;
    pushFocusSource({
      key: `focus:bard:${classSourceKind("bard")}`,
      classSlug: "bard",
      sourceKind: classSourceKind("bard"),
      sourceBadge: classSourceBadge("bard"),
      title: "Bard Composition Spells",
      entryName: "Composition Spells (Bard)",
      tradition: "occult",
      ability: "cha",
      expectedFocusSpells: expectedCount,
      matchKeywords: ["composition", "bard"],
      note: `Bard Composition Focus Spells & Cantrips (Occult, CHA)`
    });
  }

  // 4. Cleric: Domain Spells (only when Domain Initiate / Expanded Domain Initiate / Advanced Domain present)
  if (hasClassOrDual("cleric")) {
    const clericDomainFeats = matchFeats(["domain-initiate", "expanded-domain-initiate", "advanced-domain"]);
    if (clericDomainFeats.length > 0) {
      pushFocusSource({
        key: `focus:cleric:${classSourceKind("cleric")}`,
        classSlug: "cleric",
        sourceKind: classSourceKind("cleric"),
        sourceBadge: classSourceBadge("cleric"),
        title: "Cleric Domain Spells",
        entryName: "Domain Spells (Cleric)",
        tradition: "divine",
        ability: "wis",
        expectedFocusSpells: clericDomainFeats.length,
        matchKeywords: ["domain", "cleric"],
        note: `Cleric Domain Focus Spells (Divine, WIS) — ${clericDomainFeats.length} domain spell feat(s) detected`
      });
    }
  }

  // 5. Druid: Order Spells
  matchFeats(["order-spells", "druidic-order", "order-magic", "advanced-elemental-spell", "untamed-form", "wild-shape", "tempest-surge", "goodberry", "heal-animal"]);
  if (hasClassOrDual("druid") || featSlugs.has("order-spells")) {
    const extraOrder = matchFeats(["order-magic", "advanced-elemental-spell"]).length;
    pushFocusSource({
      key: `focus:druid:${classSourceKind("druid")}`,
      classSlug: "druid",
      sourceKind: classSourceKind("druid"),
      sourceBadge: classSourceBadge("druid"),
      title: "Druid Order Spells",
      entryName: "Order Spells (Druid)",
      tradition: "primal",
      ability: "wis",
      expectedFocusSpells: 1 + extraOrder,
      matchKeywords: ["order", "druid"],
      note: `Druid Order Focus Spells (Primal, WIS) — 1 initial order spell${extraOrder > 0 ? ` + ${extraOrder} additional` : ""}`
    });
  }

  // 6. Sorcerer: Bloodline Spells
  if (hasClassOrDual("sorcerer")) {
    const sorcExtra = matchFeats(["advanced-bloodline", "greater-bloodline"]).length;
    matchFeats(["bloodline", "bloodline-spells"]);
    const sorcTrad = detectDynamicTradition(actor, ["bloodline", "sorcerer"]);
    pushFocusSource({
      key: `focus:sorcerer:${classSourceKind("sorcerer")}`,
      classSlug: "sorcerer",
      sourceKind: classSourceKind("sorcerer"),
      sourceBadge: classSourceBadge("sorcerer"),
      title: "Sorcerer Bloodline Spells",
      entryName: "Bloodline Spells (Sorcerer)",
      tradition: sorcTrad,
      ability: "cha",
      expectedFocusSpells: 1 + sorcExtra,
      matchKeywords: ["bloodline", "sorcerer"],
      note: `Sorcerer Bloodline Focus Spells (CHA) — ${1 + sorcExtra} bloodline focus spell(s)`
    });
  }

  // 7. Witch: Hexes & Lessons
  if (hasClassOrDual("witch") || featSlugs.has("hexes")) {
    const witchLessons = matchFeats(["cackle", "basic-lesson", "greater-lesson", "major-lesson"]).length;
    matchFeats(["hexes", "patron"]);
    const witchTrad = detectDynamicTradition(actor, ["patron", "witch"]);
    pushFocusSource({
      key: `focus:witch:${classSourceKind("witch")}`,
      classSlug: "witch",
      sourceKind: classSourceKind("witch"),
      sourceBadge: classSourceBadge("witch"),
      title: "Witch Hexes",
      entryName: "Witch Hexes",
      tradition: witchTrad,
      ability: "int",
      expectedFocusSpells: 1 + witchLessons,
      matchKeywords: ["hex", "witch", "lesson"],
      note: `Witch Patron Hexes & Lesson Focus Spells (INT) — ${1 + witchLessons} hex focus spell(s)`
    });
  }

  // 8. Oracle: Revelation Spells
  if (hasClassOrDual("oracle") || featSlugs.has("revelation-spells")) {
    const oracleExtra = matchFeats(["advanced-revelation", "greater-revelation", "domain-acumen"]).length;
    matchFeats(["revelation-spells", "mystery", "first-revelation"]);
    pushFocusSource({
      key: `focus:oracle:${classSourceKind("oracle")}`,
      classSlug: "oracle",
      sourceKind: classSourceKind("oracle"),
      sourceBadge: classSourceBadge("oracle"),
      title: "Oracle Revelation Spells",
      entryName: "Revelation Spells (Oracle)",
      tradition: "divine",
      ability: "cha",
      expectedFocusSpells: 1 + oracleExtra,
      matchKeywords: ["revelation", "oracle"],
      note: `Oracle Revelation Focus Spells (Divine, CHA) — ${1 + oracleExtra} revelation focus spell(s)`
    });
  }

  // 9. Wizard: Arcane School Focus Spells (if Arcane School other than Unified Magical Theory, or Hand of the Apprentice)
  if (hasClassOrDual("wizard")) {
    const hasSpecializedSchool = hasWizardArcaneSchool(feats, featSlugs);
    const wizFocusFeats = matchFeats(["hand-of-the-apprentice", "advanced-school-spell"]);
    const hasInitialSchoolSpell = hasSpecializedSchool || featSlugs.has("hand-of-the-apprentice");
    if (hasInitialSchoolSpell || wizFocusFeats.length > 0) {
      const expectedCount = (hasSpecializedSchool ? 1 : 0) + wizFocusFeats.length;
      pushFocusSource({
        key: `focus:wizard:${classSourceKind("wizard")}`,
        classSlug: "wizard",
        sourceKind: classSourceKind("wizard"),
        sourceBadge: classSourceBadge("wizard"),
        title: "Wizard School Spells",
        entryName: "School Spells (Wizard)",
        tradition: "arcane",
        ability: "int",
        expectedFocusSpells: Math.max(1, expectedCount),
        matchKeywords: ["school", "wizard"],
        note: `Wizard Arcane School Focus Spells (Arcane, INT) — ${Math.max(1, expectedCount)} focus spell(s)`
      });
    }
  }

  // 10. Summoner: Link Spells
  if (hasClassOrDual("summoner") || featSlugs.has("link-spells")) {
    const sumExtra = matchFeats(["lifelink-surge", "extend-boost"]).length;
    matchFeats(["link-spells", "evolution-surge", "boost-eidolon"]);
    const sumTrad = detectDynamicTradition(actor, ["eidolon", "summoner"]);
    pushFocusSource({
      key: `focus:summoner:${classSourceKind("summoner")}`,
      classSlug: "summoner",
      sourceKind: classSourceKind("summoner"),
      sourceBadge: classSourceBadge("summoner"),
      title: "Summoner Link Spells",
      entryName: "Link Spells (Summoner)",
      tradition: sumTrad,
      ability: "cha",
      expectedFocusSpells: 1 + sumExtra,
      matchKeywords: ["link", "summoner", "eidolon"],
      note: `Summoner Link Focus Spells & Cantrips (CHA) — Evolution Surge & Boost Eidolon`
    });
  }

  // 11. Animist: Vessel Spells
  if (hasClassOrDual("animist") || featSlugs.has("vessel-spells")) {
    matchFeats(["vessel-spells", "apparition-attunement"]);
    pushFocusSource({
      key: `focus:animist:${classSourceKind("animist")}`,
      classSlug: "animist",
      sourceKind: classSourceKind("animist"),
      sourceBadge: classSourceBadge("animist"),
      title: "Animist Vessel Spells",
      entryName: "Vessel Spells (Animist)",
      tradition: "divine",
      ability: "wis",
      expectedFocusSpells: 1,
      matchKeywords: ["vessel", "animist", "apparition"],
      note: `Animist Apparition Vessel Focus Spells (Divine, WIS)`
    });
  }

  // 12. Necromancer (Impossible Magic): Grave Spells
  if (hasClassOrDual("necromancer") || featSlugs.has("grave-spells")) {
    matchFeats(["grave-spells"]);
    pushFocusSource({
      key: `focus:necromancer:${classSourceKind("necromancer")}`,
      classSlug: "necromancer",
      sourceKind: classSourceKind("necromancer"),
      sourceBadge: classSourceBadge("necromancer"),
      title: "Necromancer Grave Spells",
      entryName: "Grave Spells (Necromancer)",
      tradition: "occult",
      ability: "int",
      expectedFocusSpells: 1,
      matchKeywords: ["grave", "necromancer"],
      note: `Necromancer Grave Focus Spells (Occult, INT)`
    });
  }

  // 13. Monk: Qi / Ki Spells (opt-in via Monk class feats)
  const monkQiSlugs = [
    "qi-spells", "ki-strike", "inner-upheaval", "ki-rush", "qi-rush", "wholeness-of-body",
    "harmonize-self", "abundant-step", "wind-jump", "quivering-palm", "ki-blast", "qi-blast",
    "ki-form", "qi-form", "wronged-monks-wrath", "medusas-wrath", "ki-cutting-sight",
    "golden-body"
  ];
  const monkQiFeats = matchFeats(monkQiSlugs);
  if (monkQiFeats.length > 0) {
    const isMonkClass = hasClassOrDual("monk");
    const qiTrad = detectDynamicTradition(actor, ["qi", "ki", "monk", "inner-upheaval"]);
    pushFocusSource({
      key: isMonkClass ? `focus:monk:${classSourceKind("monk")}` : "focus:archetype:monk",
      classSlug: "monk",
      sourceKind: isMonkClass ? classSourceKind("monk") : "archetype",
      sourceBadge: isMonkClass ? classSourceBadge("monk") : "Archetype · Focus",
      title: "Monk Qi Spells",
      entryName: "Qi Spells (Monk)",
      tradition: qiTrad,
      ability: "wis",
      expectedFocusSpells: monkQiFeats.length,
      matchKeywords: ["qi", "ki", "monk"],
      note: `Monk Qi/Ki Focus Spells (Occult or Divine, WIS) — ${monkQiFeats.length} Qi feat(s) detected`
    });
  }

  // 14. Ranger: Warden Spells (opt-in via Ranger class feats)
  const rangerWardenSlugs = [
    "warden-spells", "initiate-warden", "advanced-warden", "masterful-warden",
    "gravity-weapon", "heal-companion", "magic-hide", "snare-hopping", "animal-feature",
    "soothing-mist", "terrain-transposition", "ephemeral-tracking", "enlarge-companion",
    "hunters-vision", "hunter-s-vision"
  ];
  const rangerWardenFeats = matchFeats(rangerWardenSlugs);
  if (rangerWardenFeats.length > 0) {
    const isRangerClass = hasClassOrDual("ranger");
    pushFocusSource({
      key: isRangerClass ? `focus:ranger:${classSourceKind("ranger")}` : "focus:archetype:ranger",
      classSlug: "ranger",
      sourceKind: isRangerClass ? classSourceKind("ranger") : "archetype",
      sourceBadge: isRangerClass ? classSourceBadge("ranger") : "Archetype · Focus",
      title: "Ranger Warden Spells",
      entryName: "Warden Spells (Ranger)",
      tradition: "primal",
      ability: "wis",
      expectedFocusSpells: rangerWardenFeats.length,
      matchKeywords: ["warden", "ranger"],
      note: `Ranger Warden Focus Spells (Primal, WIS) — ${rangerWardenFeats.length} Warden feat(s) detected`
    });
  }

  // --- B. Iconic Archetype / Free Archetype Focus Spellcasting Feats ---
  const archFocusRules = [
    {
      key: "focus:archetype:blessed-one",
      classSlug: "blessed-one",
      slugs: ["blessed-one-dedication"],
      title: "Blessed One Focus Spells",
      entryName: "Blessed One Focus Spells",
      tradition: "divine",
      ability: "cha",
      matchKeywords: ["blessed", "lay on hands", "devotion"],
      skipIfClass: null
    },
    {
      key: "focus:archetype:champion",
      classSlug: "champion",
      slugs: ["healing-touch", "devotion-spell"],
      title: "Champion Archetype Devotion Spells",
      entryName: "Devotion Spells (Champion Archetype)",
      tradition: "divine",
      ability: "cha",
      matchKeywords: ["devotion", "champion", "healing touch"],
      skipIfClass: "champion"
    },
    {
      key: "focus:archetype:wizard",
      classSlug: "wizard",
      slugs: ["arcane-school-spell"],
      title: "Wizard Archetype School Spell",
      entryName: "School Spells (Wizard Archetype)",
      tradition: "arcane",
      ability: "int",
      matchKeywords: ["school", "wizard"],
      skipIfClass: "wizard"
    },
    {
      key: "focus:archetype:sorcerer",
      classSlug: "sorcerer",
      slugs: ["basic-bloodline-spell", "advanced-bloodline"],
      title: "Sorcerer Archetype Bloodline Spells",
      entryName: "Bloodline Spells (Sorcerer Archetype)",
      tradition: null,
      dynamicHint: ["bloodline", "sorcerer"],
      ability: "cha",
      matchKeywords: ["bloodline", "sorcerer"],
      skipIfClass: "sorcerer"
    },
    {
      key: "focus:archetype:druid",
      classSlug: "druid",
      slugs: ["order-spell"],
      title: "Druid Archetype Order Spell",
      entryName: "Order Spells (Druid Archetype)",
      tradition: "primal",
      ability: "wis",
      matchKeywords: ["order", "druid"],
      skipIfClass: "druid"
    },
    {
      key: "focus:archetype:witch",
      classSlug: "witch",
      slugs: ["basic-lesson", "greater-lesson", "major-lesson"],
      title: "Witch Archetype Hexes",
      entryName: "Witch Hexes (Archetype)",
      tradition: null,
      dynamicHint: ["patron", "witch"],
      ability: "int",
      matchKeywords: ["hex", "witch", "lesson"],
      skipIfClass: "witch"
    },
    {
      key: "focus:archetype:cleric",
      classSlug: "cleric",
      slugs: ["domain-initiate", "expanded-domain-initiate", "advanced-domain"],
      title: "Cleric Archetype Domain Spells",
      entryName: "Domain Spells (Archetype)",
      tradition: "divine",
      ability: "wis",
      matchKeywords: ["domain", "cleric"],
      skipIfClass: "cleric",
      skipAlsoIfClass: "champion"
    },
    {
      key: "focus:archetype:oracle",
      classSlug: "oracle",
      slugs: ["first-revelation", "advanced-revelation"],
      title: "Oracle Archetype Revelation Spells",
      entryName: "Revelation Spells (Archetype)",
      tradition: "divine",
      ability: "cha",
      matchKeywords: ["revelation", "oracle"],
      skipIfClass: "oracle"
    },
    {
      key: "focus:archetype:magus",
      classSlug: "magus",
      slugs: ["conflux-spell"],
      title: "Magus Archetype Conflux Spell",
      entryName: "Conflux Spells (Magus Archetype)",
      tradition: "arcane",
      ability: "int",
      matchKeywords: ["conflux", "magus"],
      skipIfClass: "magus"
    }
  ];

  for (const rule of archFocusRules) {
    if (rule.skipIfClass && hasClassOrDual(rule.skipIfClass)) continue;
    if (rule.skipAlsoIfClass && hasClassOrDual(rule.skipAlsoIfClass)) continue;
    const matched = matchFeats(rule.slugs);
    if (matched.length === 0) continue;

    const isFreeArch = matched.some(f => typeof f.system?.location === "string" && f.system.location.startsWith("archetype-"));
    const trad = rule.tradition ?? (rule.dynamicHint ? detectDynamicTradition(actor, rule.dynamicHint) : null);

    pushFocusSource({
      key: rule.key,
      classSlug: rule.classSlug,
      sourceKind: "archetype",
      sourceBadge: isFreeArch ? "Free Archetype · Focus" : "Archetype · Focus",
      title: rule.title,
      entryName: rule.entryName,
      tradition: trad,
      ability: rule.ability,
      expectedFocusSpells: matched.length,
      matchKeywords: rule.matchKeywords,
      note: `Detected from: ${matched.map(f => f.name).join(", ")}`
    });
  }

  // --- C. Generic Fallback Scanner for ANY Other Focus-Spell-Granting Feat/Archetype ---
  // Catches Shadowdancer, Time Mage, Soul Warden, Beastmaster, Psychic focus feats, homebrew, etc.
  const refocusOrPassiveExclusions = /(?:^|-)(?:focus|wellspring|refocus|desperate-prayer|psi-strikes|psychic-dedication|conscious-mind|subconscious-mind|mercy|affliction-mercy|cruelty|covenant)(?:$|-)/;
  const focusGrantRegex = /(?:you\s+(?:gain|learn|receive)|grants?\s+you|you\s+can\s+cast)\s+(?:the\s+)?[^.<]{0,80}\b(?:focus\s+spell|focus\s+pool)\b/i;

  for (const feat of feats) {
    if (coveredFeatIds.has(feat.id)) continue;
    const slug = getItemSlug(feat);
    if (refocusOrPassiveExclusions.test(slug)) continue;

    const desc = String(feat.system?.description?.value || "");
    if (!focusGrantRegex.test(desc)) continue;

    const tradMatch = desc.match(/\b(arcane|divine|occult|primal)\b/i);
    const detectedTrad = tradMatch ? tradMatch[1].toLowerCase() : "";

    // If a focus source of the same tradition already exists, fold it in rather than duplicating entries
    if (detectedTrad) {
      const existingSameTrad = focusSources.find(s => s.tradition === detectedTrad);
      if (existingSameTrad) {
        existingSameTrad.expectedFocusSpells = Math.min(10, existingSameTrad.expectedFocusSpells + 1);
        continue;
      }
    }

    const isFreeArch = typeof feat.system?.location === "string" && feat.system.location.startsWith("archetype-");
    const abil = detectedTrad === "arcane" ? "int" : (detectedTrad === "divine" || detectedTrad === "primal" ? "wis" : "cha");

    pushFocusSource({
      key: `focus:feat:${slug}`,
      classSlug: slug,
      sourceKind: "archetype",
      sourceBadge: isFreeArch ? "Free Archetype · Focus" : "Feat · Focus",
      title: `${feat.name} (Focus)`,
      entryName: `Focus Spells (${feat.name})`,
      tradition: detectedTrad,
      ability: abil,
      expectedFocusSpells: 1,
      matchKeywords: [slug.replace(/-/g, " "), "focus"],
      note: `Focus spell granted by "${feat.name}" on the Feats tab`
    });
  }

  return focusSources;
}

/**
 * Matches expected spellcasting sources 1-to-1 against existing `spellcastingEntry` items on the actor,
 * compares slots & spell counts, and identifies missing or outdated entries.
 */
function analyzeSpellcasting(actor, level, dualInfo) {
  const expectedSources = detectExpectedSpellcastingSources(actor, level, dualInfo);
  const existingEntries = (actor.itemTypes?.spellcastingEntry || []).filter(e => {
    const prepVal = e.system?.prepared?.value;
    // Include prepared, spontaneous, innate, and focus entries; exclude ritual/item-only containers
    return prepVal !== "ritual" && prepVal !== "items";
  });
  const focusEntries = existingEntries.filter(e => e.system?.prepared?.value === "focus");
  const allSpells = actor.itemTypes?.spell || [];

  // Score how strongly an existing entry matches an expected source
  const usedEntryIds = new Set();
  const matchedPairs = new Map(); // source.key -> entry

  // Pass 1: Exact flag match (entries created by this utility)
  for (const src of expectedSources) {
    const exact = existingEntries.find(e =>
      !usedEntryIds.has(e.id) && e.flags?.[MODULE_ID]?.spellSourceKey === src.key
    );
    if (exact) {
      usedEntryIds.add(exact.id);
      matchedPairs.set(src.key, exact);
    }
  }

  // Pass 2: Best heuristic match (name/class/archetype + castingType + tradition)
  for (const src of expectedSources) {
    if (matchedPairs.has(src.key)) continue;

    let bestEntry = null;
    let bestScore = -1;

    for (const entry of existingEntries) {
      if (usedEntryIds.has(entry.id)) continue;

      const eType = entry.system?.prepared?.value || "";
      const eTrad = entry.system?.tradition?.value || "";
      const eName = String(entry.name || "").toLowerCase();
      let score = 0;

      // Divine Font special matching
      if (src.isDivineFont) {
        if (eName.includes("font") || eName.includes("heal") || eName.includes("harm")) score += 40;
        else continue; // Never match a normal Cleric spellcasting entry as Divine Font!
      } else if (eName.includes("font")) {
        continue; // Never match Divine Font as a normal entry
      }

      // Animist Apparition special matching
      if (src.key.includes(":apparition:")) {
        if (eName.includes("apparition") || eType === "spontaneous") score += 25;
      }

      if (eType === src.castingType) score += 20;
      else if (src.castingType === "innate" && eType === "spontaneous") score += 8;
      else continue; // Must match casting type (focus ONLY matches focus!)

      if (src.tradition && eTrad === src.tradition) score += 18;
      else if (!src.tradition && eTrad) score += 6;
      else if (src.tradition && eTrad && eTrad !== src.tradition) score -= 15;

      // Focus keyword matching (e.g. "Devotion", "Conflux", "Composition", "Hex", "Order", "Qi", "Warden")
      if (src.isFocus && Array.isArray(src.focusMatchKeywords)) {
        for (const kw of src.focusMatchKeywords) {
          if (kw && eName.includes(kw)) {
            score += 22;
            break;
          }
        }
      }

      // Name contains class/archetype keyword
      if (src.classSlug && eName.includes(src.classSlug.replace(/-/g, " "))) score += 25;
      if (src.sourceKind === "archetype" && (eName.includes("archetype") || eName.includes("dedication"))) score += 15;
      if (src.sourceKind !== "archetype" && !eName.includes("archetype") && !eName.includes("dedication")) score += 5;

      if (score > bestScore && score >= 20) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (bestEntry) {
      usedEntryIds.add(bestEntry.id);
      matchedPairs.set(src.key, bestEntry);
    }
  }

  // Evaluate each expected source against its matched entry (if any)
  const items = [];
  const issues = [];
  let missingEntryCount = 0;
  let outdatedSlotCount = 0;
  let totalExpectedCantrips = 0;
  let totalCurrentCantrips = 0;
  let totalExpectedSlots = 0;
  let totalCurrentSlots = 0;

  for (const src of expectedSources) {
    const entry = matchedPairs.get(src.key) || null;
    totalExpectedCantrips += src.cantrips;
    totalExpectedSlots += src.totalLeveledSlots;

    if (!entry) {
      missingEntryCount++;
      items.push({
        ...src,
        entryId: null,
        entryExists: false,
        status: "missing",
        statusLabel: "Missing Entry",
        slotsOutdated: false,
        slotDiffs: [],
        currentCantrips: 0,
        currentLeveledSpells: 0,
        currentFocusSpells: 0,
        currentSlotsSummary: "None",
        spellsMissingNote: src.isFocus
          ? "Create this Focus spellcasting entry and add your focus spell(s)"
          : "Create this spellcasting entry to add slots & spells"
      });
      issues.push({
        severity: "critical",
        category: "Spellcasting",
        title: `Missing Spellcasting Entry: ${src.title}`,
        detail: `${src.sourceBadge} · ${CASTING_TYPE_LABELS[src.castingType] || src.castingType} ${TRADITION_LABELS[src.tradition] || "(choose tradition)"} · ${src.isFocus ? src.slotsSummary : `Expected ${src.cantrips > 0 ? `${src.cantrips} cantrips & ` : ""}${src.slotsSummary}`}.`
      });
      continue;
    }

    // Entry exists! Count its current spells
    const entrySpells = allSpells.filter(s => s.system?.location?.value === entry.id);

    // Special evaluation path for Focus Spellcasting entries (no daily slots — tracks Focus Spells)
    if (src.isFocus || src.castingType === "focus") {
      const currentFocusSpells = entrySpells.length;
      const expectedFocusSpells = Math.max(1, Number(src.expectedFocusSpells || 1));
      const missingFocus = Math.max(0, expectedFocusSpells - currentFocusSpells);

      const status = missingFocus > 0 ? "incomplete" : "complete";
      const statusLabel = missingFocus > 0 ? "Needs Spells" : "Ready";

      items.push({
        ...src,
        entryId: entry.id,
        matchedEntryName: entry.name,
        entryExists: true,
        tradition: entry.system?.tradition?.value || src.tradition,
        ability: entry.system?.ability?.value || src.ability,
        status,
        statusLabel,
        slotsOutdated: false,
        slotDiffs: [],
        slotDiffText: "",
        currentCantrips: 0,
        currentLeveledSpells: currentFocusSpells,
        currentFocusSpells,
        expectedFocusSpells,
        currentSlotsSummary: src.slotsSummary,
        spellsMissingNote: missingFocus > 0
          ? `Add ${missingFocus} focus spell${missingFocus === 1 ? "" : "s"} to "${entry.name}"`
          : `${currentFocusSpells} focus spell(s) configured`
      });

      if (missingFocus > 0) {
        issues.push({
          severity: "info",
          category: "Spellcasting",
          title: `${entry.name}: ${missingFocus} focus spell${missingFocus === 1 ? "" : "s"} missing`,
          detail: `Focus spells in entry: ${currentFocusSpells}/${expectedFocusSpells} · ${src.expectedSpellsNote}`
        });
      }
      continue;
    }

    let currentCantrips = 0;
    let currentLeveledSpells = 0;

    for (const sp of entrySpells) {
      const isCantrip = Boolean(sp.isCantrip || sp.system?.traits?.value?.includes("cantrip"));
      if (isCantrip) {
        currentCantrips++;
      } else {
        currentLeveledSpells++;
      }
    }

    totalCurrentCantrips += currentCantrips;

    // Compare slot maximums against expected slots for this level
    const slotDiffs = [];
    const curSlotsObj = {};
    for (let r = 0; r <= 10; r++) {
      const curMax = Number(entry.system?.slots?.[`slot${r}`]?.max ?? 0);
      curSlotsObj[r] = curMax;
      if (r >= 1) totalCurrentSlots += curMax;

      if (r === 0 && src.castingType !== "prepared") continue;
      const expMax = Number(src.slots[r] || 0);
      if (curMax !== expMax) {
        slotDiffs.push({
          rank: r,
          label: r === 0 ? "Cantrips" : `R${r}`,
          current: curMax,
          expected: expMax
        });
      }
    }

    const flexibleMismatch = src.flexible && !entry.system?.prepared?.flexible && entry.system?.prepared?.value === "prepared";
    const slotsOutdated = slotDiffs.length > 0 || flexibleMismatch;
    if (slotsOutdated) outdatedSlotCount++;

    const missingCantrips = Math.max(0, src.cantrips - currentCantrips);
    const missingRepertoire = src.repertoireExpected != null
      ? Math.max(0, src.repertoireExpected - currentLeveledSpells)
      : (src.totalLeveledSlots > 0 && currentLeveledSpells === 0 ? src.totalLeveledSlots : 0);

    let status = "complete";
    let statusLabel = "Ready";
    if (slotsOutdated) {
      status = "outdated";
      statusLabel = "Slots Outdated";
    } else if (missingCantrips > 0 || missingRepertoire > 0) {
      status = "incomplete";
      statusLabel = "Needs Spells";
    }

    const missingParts = [];
    if (missingCantrips > 0) missingParts.push(`${missingCantrips} cantrip${missingCantrips === 1 ? "" : "s"}`);
    if (src.repertoireExpected != null && missingRepertoire > 0) {
      missingParts.push(`${missingRepertoire} repertoire spell${missingRepertoire === 1 ? "" : "s"}`);
    } else if (src.totalLeveledSlots > 0 && currentLeveledSpells === 0) {
      missingParts.push(`no leveled spells added yet`);
    }

    items.push({
      ...src,
      entryId: entry.id,
      matchedEntryName: entry.name,
      entryExists: true,
      tradition: entry.system?.tradition?.value || src.tradition,
      ability: entry.system?.ability?.value || src.ability,
      status,
      statusLabel,
      slotsOutdated,
      slotDiffs,
      slotDiffText: slotDiffs.map(d => `${d.label}: ${d.current}→${d.expected}`).join(", "),
      currentCantrips,
      currentLeveledSpells,
      currentFocusSpells: 0,
      currentSlotsSummary: formatSlotsSummary(curSlotsObj),
      spellsMissingNote: missingParts.length > 0 ? `Missing ${missingParts.join(" & ")}` : "Spells & slots look good"
    });

    if (slotsOutdated) {
      issues.push({
        severity: "warning",
        category: "Spellcasting",
        title: `Spell Slots Outdated: ${entry.name}`,
        detail: `Level ${level} expects ${src.slotsSummary} (diffs: ${slotDiffs.map(d => `${d.label} ${d.current}→${d.expected}`).join(", ")}).`
      });
    } else if (missingCantrips > 0 || missingRepertoire > 0) {
      issues.push({
        severity: "info",
        category: "Spellcasting",
        title: `${entry.name}: ${missingParts.join(" & ")} missing`,
        detail: `Cantrips: ${currentCantrips}/${src.cantrips} · Leveled spells added: ${currentLeveledSpells}${src.repertoireExpected != null ? `/${src.repertoireExpected}` : ""}.`
      });
    }
  }

  return {
    isSpellcaster: expectedSources.length > 0 || existingEntries.length > 0 || focusEntries.length > 0,
    hasExpectedSources: expectedSources.length > 0,
    sources: items,
    existingCount: existingEntries.length,
    focusCount: focusEntries.length,
    missingEntryCount,
    outdatedSlotCount,
    needsActionCount: missingEntryCount + outdatedSlotCount,
    totalExpectedCantrips,
    totalCurrentCantrips,
    totalExpectedSlots,
    totalCurrentSlots,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 7. CREATE / SYNC SPELLCASTING ENTRIES ON ACTOR                            */
/* ------------------------------------------------------------------------- */

/**
 * Create a new PF2e `spellcastingEntry` embedded item on the actor with exact
 * casting type, tradition, key ability, and level-appropriate spell slots.
 *
 * @param {Actor} actor
 * @param {object} spec - Source spec from `analyzeCharacter(actor).spellcasting.sources`
 * @param {{ tradition?: string, ability?: string, name?: string }} [overrides]
 * @returns {Promise<Item|null>}
 */
export async function createSpellcastingEntry(actor, spec, overrides = {}) {
  if (!actor || !spec) return null;

  const tradition = overrides.tradition ?? spec.tradition ?? "";
  const ability = overrides.ability ?? spec.ability ?? "int";
  const castingType = spec.castingType || "prepared";
  const flexible = Boolean(spec.flexible && castingType === "prepared");

  const tradLabel = TRADITION_LABELS[tradition] || "";
  const typeLabel = flexible ? "Flexible" : (CASTING_TYPE_LABELS[castingType] || capitalize(castingType));
  const entryName = overrides.name
    || ((spec.isDivineFont || spec.isFocus || castingType === "focus")
      ? spec.entryName
      : `${tradLabel ? `${tradLabel} ` : ""}${typeLabel} Spells (${spec.title.replace(/ Spellcasting$/i, "")})`);

  const slots = {};
  for (let r = 0; r <= 10; r++) {
    const max = (castingType === "focus" || (r === 0 && castingType !== "prepared")) ? 0 : Number(spec.slots?.[r] || 0);
    slots[`slot${r}`] = { value: max, max };
  }

  const entryData = {
    name: entryName,
    type: "spellcastingEntry",
    system: {
      prepared: {
        value: castingType,
        flexible
      },
      tradition: {
        value: tradition
      },
      ability: {
        value: ability
      },
      slots,
      showSlotlessLevels: {
        value: true
      }
    },
    flags: {
      [MODULE_ID]: {
        spellSourceKey: spec.key
      }
    }
  };

  const created = await actor.createEmbeddedDocuments("Item", [entryData]);
  return created?.[0] || null;
}

/**
 * Updates an existing PF2e `spellcastingEntry`'s slot maximums to match the character's current level
 * without wiping any prepared spells or overriding currently spent daily slots unfairly.
 *
 * @param {Actor} actor
 * @param {string} entryId
 * @param {object} spec
 * @returns {Promise<boolean>}
 */
export async function syncSpellcastingEntrySlots(actor, entryId, spec) {
  if (!actor || !entryId || !spec) return false;
  const entry = actor.items?.get(entryId);
  if (!entry || entry.type !== "spellcastingEntry") return false;

  const castingType = entry.system?.prepared?.value || spec.castingType || "prepared";
  const updates = {};

  for (let r = 0; r <= 10; r++) {
    if (r === 0 && castingType !== "prepared") continue;
    const targetMax = Number(spec.slots?.[r] || 0);
    const curSlot = entry.system?.slots?.[`slot${r}`];
    const curMax = Number(curSlot?.max ?? 0);
    const curVal = Number(curSlot?.value ?? 0);

    if (curMax !== targetMax) {
      updates[`system.slots.slot${r}.max`] = targetMax;
      const delta = targetMax - curMax;
      const nextVal = delta > 0 ? Math.min(targetMax, curVal + delta) : Math.min(targetMax, curVal);
      updates[`system.slots.slot${r}.value`] = Math.max(0, nextVal);
    }
  }

  if (spec.flexible && castingType === "prepared" && !entry.system?.prepared?.flexible) {
    updates["system.prepared.flexible"] = true;
  }

  if (!entry.flags?.[MODULE_ID]?.spellSourceKey && spec.key) {
    updates[`flags.${MODULE_ID}.spellSourceKey`] = spec.key;
  }

  if (Object.keys(updates).length === 0) return false;
  await entry.update(updates);
  return true;
}

/**
 * Creates all missing spellcasting entries AND syncs all outdated spellcasting entries on an actor.
 * @param {Actor} actor
 * @returns {Promise<{ created: string[], synced: string[], skippedNeedsTradition: string[] }>}
 */
export async function createOrSyncAllSpellcastingEntries(actor) {
  const analysis = analyzeCharacter(actor);
  const created = [];
  const synced = [];
  const skippedNeedsTradition = [];

  if (!analysis) return { created, synced, skippedNeedsTradition };

  for (const src of analysis.spellcasting.sources) {
    if (!src.entryExists) {
      if (src.traditionMissing && !src.tradition) {
        skippedNeedsTradition.push(src.title);
        continue;
      }
      const doc = await createSpellcastingEntry(actor, src);
      if (doc) created.push(doc.name);
    } else if (src.slotsOutdated && src.entryId) {
      const ok = await syncSpellcastingEntrySlots(actor, src.entryId, src);
      if (ok) synced.push(src.matchedEntryName || src.title);
    }
  }

  return { created, synced, skippedNeedsTradition };
}

/* ------------------------------------------------------------------------- */
/* 8. MASTER CHARACTER COMPLETENESS ANALYZER                                 */
/* ------------------------------------------------------------------------- */

/**
 * Performs a full PF2e build completeness check on a character actor.
 * @param {Actor} actor
 * @returns {object|null}
 */
export function analyzeCharacter(actor) {
  if (!actor || actor.type !== "character") return null;

  const level = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  const variants = getActiveVariantRules();
  const dualInfo = getActorDualClassInfo(actor, variants);

  const primarySlug = actor.class ? getItemSlug(actor.class) : "";
  const requiresDeity = primarySlug === "cleric"
    || primarySlug === "champion"
    || dualInfo?.slug === "cleric"
    || dualInfo?.slug === "champion";

  // 1. Core Identity checks
  const coreIssues = [];
  const coreItems = [
    {
      key: "ancestry",
      label: "Ancestry",
      value: actor.ancestry?.name || "",
      present: Boolean(actor.ancestry),
      required: true
    },
    {
      key: "heritage",
      label: "Heritage",
      value: actor.heritage?.name || "",
      present: Boolean(actor.heritage),
      required: true
    },
    {
      key: "background",
      label: "Background",
      value: actor.background?.name || "",
      present: Boolean(actor.background),
      required: true
    },
    {
      key: "class",
      label: "Primary Class",
      value: actor.class?.name || "",
      present: Boolean(actor.class),
      required: true
    }
  ];

  if (variants.dualClassEnabled) {
    coreItems.push({
      key: "dualClass",
      label: "Second Class (Dual Class)",
      value: dualInfo?.name || "",
      present: Boolean(dualInfo),
      required: true
    });
  }

  if (requiresDeity) {
    coreItems.push({
      key: "deity",
      label: "Deity",
      value: actor.deity?.name || "",
      present: Boolean(actor.deity),
      required: true
    });
  }

  for (const ci of coreItems) {
    if (ci.required && !ci.present) {
      coreIssues.push({
        severity: "critical",
        category: "Core Build",
        title: `Missing ${ci.label}`,
        detail: `No ${ci.label} is assigned to ${actor.name} yet.`
      });
    }
  }

  // Languages check
  const knownLangs = Array.isArray(actor.system?.details?.languages?.value)
    ? actor.system.details.languages.value.filter(Boolean)
    : [];
  const customLangStr = String(actor.system?.details?.languages?.details || "").trim();
  const customLangCount = customLangStr ? customLangStr.split(",").map(s => s.trim()).filter(Boolean).length : 0;
  const currentLangCount = knownLangs.length + customLangCount;

  const ancBaseLangs = Array.isArray(actor.ancestry?.system?.languages?.value)
    ? actor.ancestry.system.languages.value.length
    : 0;
  const ancExtraLangs = Number(actor.ancestry?.system?.additionalLanguages?.count ?? 0);
  const multilingualCount = (actor.itemTypes?.feat || []).filter(f => getItemSlug(f) === "multilingual").length;
  const expectedLangCount = actor.ancestry
    ? ancBaseLangs + Math.max(0, ancExtraLangs + Math.max(0, intMod)) + (multilingualCount * 2)
    : 0;
  const missingLangs = Math.max(0, expectedLangCount - currentLangCount);

  if (actor.ancestry && missingLangs > 0) {
    coreIssues.push({
      severity: "info",
      category: "Languages",
      title: `Missing ${missingLangs} Language${missingLangs === 1 ? "" : "s"} (${currentLangCount}/${expectedLangCount})`,
      detail: `Ancestry grants ${ancBaseLangs} base + ${ancExtraLangs} extra + ${Math.max(0, intMod)} from INT${multilingualCount ? ` + ${multilingualCount * 2} Multilingual` : ""}.`
    });
  }

  // 2. Sub-analyses
  const attributes = analyzeAttributeBoosts(actor, level, variants, dualInfo);
  const skills = analyzeSkills(actor, level, dualInfo);
  const formulas = analyzeFormulas(actor, level, dualInfo);
  const feats = analyzeFeats(actor, level, dualInfo);
  const spellcasting = analyzeSpellcasting(actor, level, dualInfo);

  // 3. Lightweight Readiness (Informational only)
  const hasWeapon = (actor.itemTypes?.weapon || []).length > 0;
  const hasArmor = (actor.itemTypes?.armor || []).length > 0;
  const maxHp = Number(actor.system?.attributes?.hp?.max ?? 0);
  const readinessNotes = [];
  if (!hasWeapon && !spellcasting.isSpellcaster) {
    readinessNotes.push("No weapon equipped or carried in Inventory.");
  }
  if (!hasArmor && primarySlug !== "monk" && !spellcasting.isSpellcaster) {
    readinessNotes.push("No armor in Inventory (verify unarmored AC is intentional).");
  }

  // 4. Aggregate Issues & Completeness Score
  const allIssues = [
    ...coreIssues,
    ...attributes.issues,
    ...skills.issues,
    ...formulas.issues,
    ...feats.issues,
    ...spellcasting.issues
  ];

  const criticalCount = allIssues.filter(i => i.severity === "critical").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const infoCount = allIssues.filter(i => i.severity === "info").length;
  const actionableMissingCount = criticalCount + warningCount;

  // Weighted checklist score (0-100%)
  let totalChecks = 0;
  let passedChecks = 0;

  // Core items (weight 2 each)
  for (const ci of coreItems) {
    totalChecks += 2;
    if (ci.present) passedChecks += 2;
  }
  // Attribute tiers
  for (const t of attributes.tiers) {
    totalChecks += 1;
    if (t.complete) passedChecks += 1;
  }
  // Skills, Lore & skill increases
  if (actor.class) {
    totalChecks += 2;
    if (skills.missingTrained === 0) passedChecks += 1;
    if (skills.missingIncreases === 0) passedChecks += 1;
  }
  if (skills.expectedMinLores > 0) {
    totalChecks += 1;
    if (skills.missingLoreCount === 0) passedChecks += 1;
  }
  // Crafting / Alchemist formulas
  if (formulas.expected > 0) {
    totalChecks += 1;
    if (formulas.complete) passedChecks += 1;
  }
  // Feat slots
  if (feats.totalSlots > 0) {
    totalChecks += feats.totalSlots;
    passedChecks += feats.filledSlots;
  }
  // Spellcasting entries
  for (const s of spellcasting.sources) {
    totalChecks += 2;
    if (s.entryExists && !s.slotsOutdated) passedChecks += 2;
    else if (s.entryExists) passedChecks += 1;
  }

  const completenessPct = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

  let status = "complete";
  let statusLabel = "Complete";
  if (criticalCount > 0) {
    status = "critical";
    statusLabel = `${actionableMissingCount} Missing`;
  } else if (warningCount > 0) {
    status = "warning";
    statusLabel = `${actionableMissingCount} Missing`;
  } else if (infoCount > 0) {
    status = "info";
    statusLabel = `${infoCount} Note${infoCount === 1 ? "" : "s"}`;
  }

  // Owning non-GM players (for whisper button)
  const owners = (game.users?.contents || []).filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));

  const classDisplay = dualInfo
    ? `${actor.class?.name || "No Class"} / ${dualInfo.name}`
    : (actor.class?.name || "No Class");

  return {
    actorId: actor.id,
    actorName: actor.name,
    actorImg: actor.img || "icons/svg/mystery-man.svg",
    level,
    intMod,
    maxHp,
    classDisplay,
    isDualClass: Boolean(dualInfo),
    dualClassName: dualInfo?.name || "",
    variants,
    activeVariantBadges: [
      variants.dualClassEnabled ? "Dual Class" : null,
      variants.freeArchetypeEnabled ? "Free Archetype" : null,
      variants.ancestryParagonEnabled ? "Ancestry Paragon" : null,
      variants.gradualBoostsEnabled ? "Gradual Boosts" : null
    ].filter(Boolean),
    coreItems,
    languages: {
      current: currentLangCount,
      expected: expectedLangCount,
      missing: missingLangs,
      complete: missingLangs === 0
    },
    attributes,
    skills,
    formulas,
    feats,
    spellcasting,
    readinessNotes,
    allIssues,
    criticalCount,
    warningCount,
    infoCount,
    actionableMissingCount,
    completenessPct,
    status,
    statusLabel,
    owners: owners.map(u => ({ id: u.id, name: u.name })),
    hasOwners: owners.length > 0
  };
}

/* ------------------------------------------------------------------------- */
/* 9. CHAT CHECKLIST CARD (PUBLIC OR WHISPER TO OWNING PLAYER)               */
/* ------------------------------------------------------------------------- */

/**
 * Posts a clean PF2e Character Completeness Checklist card to Foundry Chat
 * (either public or whispered directly to the character's owning player(s) + GM).
 *
 * @param {Actor} actor
 * @param {{ whisperToOwners?: boolean }} [options]
 */
export async function postChecklistToChat(actor, { whisperToOwners = false } = {}) {
  const report = analyzeCharacter(actor);
  if (!report) return null;

  const esc = foundry.utils.escapeHTML;
  const issueRows = report.allIssues.length > 0
    ? report.allIssues.map(iss => `
        <li class="pf2e-cc-chat-item sev-${esc(iss.severity)}">
          <strong>[${esc(iss.category)}] ${esc(iss.title)}</strong>
          <div class="pf2e-cc-chat-detail">${esc(iss.detail)}</div>
        </li>
      `).join("")
    : `<li class="pf2e-cc-chat-item sev-good"><strong>All Clear!</strong> No missing build items detected for Level ${report.level}.</li>`;

  const spellLines = report.spellcasting.sources.map(s => `
    <div class="pf2e-cc-chat-spell">
      <strong>${esc(s.title)}</strong> (${esc(s.sourceBadge)}):
      ${s.cantrips > 0 ? `${s.cantrips} cantrips · ` : ""}${esc(s.slotsSummary)}
      ${!s.entryExists ? ` — <span class="pf2e-cc-chat-miss">Missing Entry</span>` : (s.slotsOutdated ? ` — <span class="pf2e-cc-chat-warn">Slots Outdated</span>` : "")}
    </div>
  `).join("");

  const content = `
    <div class="pf2e-cc-chat-card">
      <div class="pf2e-cc-chat-header">
        <img src="${esc(report.actorImg)}" alt="" />
        <div>
          <div class="pf2e-cc-chat-title">${esc(report.actorName)} — Level ${report.level}</div>
          <div class="pf2e-cc-chat-sub">${esc(report.classDisplay)} · Completeness: <strong>${report.completenessPct}%</strong></div>
        </div>
      </div>
      <div class="pf2e-cc-chat-summary">
        <span><strong>Trained Skills:</strong> ${report.skills.currentTrained}/${report.skills.expectedTrained}</span>
        <span><strong>Skill Increases:</strong> ${report.skills.spentIncreases}/${report.skills.expectedIncreases}</span>
        <span><strong>Feats:</strong> ${report.feats.filledSlots}/${report.feats.totalSlots}</span>
      </div>
      ${spellLines ? `<div class="pf2e-cc-chat-spells">${spellLines}</div>` : ""}
      <ul class="pf2e-cc-chat-list">${issueRows}</ul>
    </div>
  `;

  const msgData = {
    speaker: ChatMessage.getSpeaker({ alias: "Character Completeness Checker" }),
    content
  };

  if (whisperToOwners) {
    const ownerIds = report.owners.map(o => o.id);
    if (ownerIds.length === 0) {
      ui.notifications?.warn(`${report.actorName} has no non-GM player owner assigned; whispering to GM only.`);
      msgData.whisper = [game.user.id];
    } else {
      msgData.whisper = Array.from(new Set([...ownerIds, game.user.id]));
    }
  }

  return await ChatMessage.create(msgData);
}
