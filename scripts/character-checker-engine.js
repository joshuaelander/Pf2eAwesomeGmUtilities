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

    // Check Psychic Conscious Mind Psi Cantrips (+3 at Lv 1-5, +4 at Lv 6-9, +5 at Lv 10+)
    // and Conscious Mind Granted Spells (+1 bonus repertoire spell per spell rank 1-9)
    let bonusGrantedLeveled = 0;
    if (classSlug === "psychic") {
      const hasConsciousMind = feats.some(f => isPsychicConsciousMindFeat(f));
      if (hasConsciousMind) {
        const psiCount = level >= 10 ? 5 : (level >= 6 ? 4 : 3);
        cantrips = def.cantrips + psiCount;
        bonusGrantedLeveled = Math.min(9, Math.ceil(level / 2));
        extraNote = `Includes ${def.cantrips} Occult + ${psiCount} Psi Cantrips & +${bonusGrantedLeveled} Conscious Mind granted spell(s)`;
      }
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
      repertoireExpected = totalLeveledSlots + bonusGrantedLeveled;
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
      const fontChoice = detectClericDivineFontChoice(actor, feats, featSlugs);
      const fontSpell = fontChoice === "harm" ? "Harm" : (fontChoice === "heal" ? "Heal" : "Heal / Harm");

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
        expectedSpellsNote: fontChoice
          ? `Remaster Divine Font grants ${fontCount} extra Rank ${fontRank} ${fontSpell} slot(s) per day (auto-prepared on Sync)`
          : `Remaster Divine Font grants ${fontCount} extra Rank ${fontRank} Heal or Harm slot(s) per day — pick Healing or Harmful Font on Level 1 to auto-prepare`,
        repertoireExpected: null,
        signatureExpected: 0,
        isDivineFont: true,
        divineFontChoice: fontChoice,
        divineFontRank: fontRank,
        divineFontCount: fontCount,
        divineFontSpellName: fontChoice ? fontSpell : ""
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

/* ------------------------------------------------------------------------- */
/* 6B. DATA-DRIVEN PF2E AUTO-GRANTED & FOCUS SPELL DISCOVERY (ZERO HARDCODE) */
/* ------------------------------------------------------------------------- */

const SPELL_UUID_TOKEN_REGEX = /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g;
const NON_SPELL_PACK_REGEX = /(?:^|[._-])(?:spell-effects|effects?|actions?|conditions?|feats?|equipment|journals?|macros?|tables?|rolltables?|ancestr|heritage|background|class|deit|hazard|bestiary|boon|campaign)/i;
const RANK_SUBHEADER_REGEX = /^(?:cantrips?|1st|2nd|3rd|[4-9]th|1[0-9]th|20th)(?:[\s-]+(?:rank|level))?\s*:?$/i;
const TIER_SUBHEADER_REGEX = /^(?:initial|advanced|greater|surface|deeper|deepest)(?:\s+(?:psi\s+cantrip|focus\s+spell|bloodline\s+spell|school\s+spell|revelation\s+spell|spell|cantrip))?\s*:?$/i;
const INLINE_AMP_SUBHEADER_REGEX = /^(?:amp(?:\s+heightened.*)?|heightened(?:\s*\([^)]+\))?|trigger|requirements?|frequency|range|targets?|area|duration|defense|saving\s+throw|success|critical\s+success|failure|critical\s+failure)\s*:?$/i;

/**
 * Dynamically detects whether a Cleric has selected Healing Font (`"heal"`), Harmful Font (`"harm"`),
 * or has not yet chosen (`""`), inspecting PF2e feats, `Divine Font (Healing/Harmful)` names,
 * `flags.pf2e.rulesSelections`, `ChoiceSet` rules, `actor.rollOptions.all`, and `actor.deity.system.font`.
 */
function detectClericDivineFontChoice(actor, feats = null, featSlugs = null) {
  const allFeats = Array.isArray(feats) ? feats : (actor?.itemTypes?.feat || []);
  const slugs = featSlugs instanceof Set ? featSlugs : new Set(allFeats.map(getItemSlug));

  if (slugs.has("harmful-font")) return "harm";
  if (slugs.has("healing-font")) return "heal";

  const parseFontToken = (raw) => {
    if (!raw) return "";
    const str = typeof raw === "string" ? raw : (typeof raw?.value === "string" ? raw.value : "");
    if (!str) return "";
    if (str.startsWith("Compendium.") || str.startsWith("Item.")) {
      const meta = resolveSyncSpellMeta(str);
      const n = String(meta?.name || "").toLowerCase();
      if (/\bharm(?:ful)?(?:\s+font|-font)?\b/.test(n)) return "harm";
      if (/\bheal(?:ing)?(?:\s+font|-font)?\b/.test(n)) return "heal";
      return "";
    }
    const lower = str.toLowerCase();
    if (/\bharm(?:ful)?(?:-font)?\b/.test(lower)) return "harm";
    if (/\bheal(?:ing)?(?:-font)?\b/.test(lower)) return "heal";
    return "";
  };

  for (const feat of allFeats) {
    const slug = getItemSlug(feat);
    const name = String(feat.name || "");
    if (slug !== "divine-font" && !/\bdivine\s+font\b/i.test(name)) continue;

    // 1. Check PF2e ChoiceSet / rulesSelections on Divine Font
    const sels = feat.flags?.pf2e?.rulesSelections;
    if (sels && typeof sels === "object") {
      for (const val of Object.values(sels)) {
        const hit = parseFontToken(val);
        if (hit) return hit;
      }
    }
    const rules = Array.isArray(feat.system?.rules) ? feat.system.rules : [];
    for (const r of rules) {
      if (r?.key === "ChoiceSet") {
        const hit = parseFontToken(r.selection);
        if (hit) return hit;
      }
    }

    // 2. Check parenthetical / renamed item title e.g. "Divine Font (Healing)" or "Divine Font (Harmful Font)"
    const paren = name.match(/\(([^)]+)\)/);
    if (paren) {
      const hit = parseFontToken(paren[1]);
      if (hit) return hit;
    }
  }

  // 3. Check live PF2e actor rollOptions
  const rollAll = actor?.rollOptions?.all || {};
  for (const [k, v] of Object.entries(rollAll)) {
    if (!v) continue;
    if (/(?:^|:)(?:divine-font|font):harm|feature:harmful-font/i.test(k)) return "harm";
    if (/(?:^|:)(?:divine-font|font):heal|feature:healing-font/i.test(k)) return "heal";
  }

  // 4. Fallback to deity's allowed font when the deity only allows one choice
  const deityFonts = Array.isArray(actor?.deity?.system?.font)
    ? actor.deity.system.font.map(f => String(f || "").toLowerCase()).filter(Boolean)
    : [];
  if (deityFonts.length === 1) {
    if (deityFonts[0] === "harm") return "harm";
    if (deityFonts[0] === "heal") return "heal";
  }

  return "";
}

/**
 * Checks whether an embedded feat/classfeature is a Psychic Conscious Mind subclass feature.
 */
function isPsychicConsciousMindFeat(feat) {
  if (!feat) return false;
  const slug = getItemSlug(feat);
  if (slug === "conscious-mind") return false;
  const desc = String(feat.system?.description?.value || "");
  if (/<(?:strong|b|h[1-6])[^>]*>\s*(?:Standard\s+Psi\s+Cantrips?|Unique\s+Psi\s+Cantrips?|Surface\s+Psi\s+Cantrip|Deeper\s+Psi\s+Cantrip|Deepest\s+Psi\s+Cantrip|Psi\s+Cantrips?)\s*[:<]/i.test(desc)) {
    return true;
  }
  const traits = Array.isArray(feat.system?.traits?.value) ? feat.system.traits.value : [];
  const isPsychicFeature = traits.includes("psychic") || feat.system?.category === "classfeature";
  if (isPsychicFeature && /<(?:strong|b|h[1-6])[^>]*>\s*Granted\s+Spells?\s*[:<]/i.test(desc) && /\bpsi\s+cantrip/i.test(desc)) {
    return true;
  }
  return false;
}

/** Lazily populated per-pack `{ size, byName }` lookup for named `@UUID[Compendium...Item.Name]` links */
const _packNameIndexCache = new Map();

/** Lazily populated domainSlug -> { initial: { uuid, name }|null, advanced: { uuid, name }|null } from PF2e's own Journals */
let _domainSpellCache = null;
let _domainSpellCachePromise = null;

function lookupCompendiumIndexEntrySync(uuid) {
  if (typeof uuid !== "string" || !uuid.startsWith("Compendium.")) return null;
  const parts = uuid.split(".");
  // Compendium.<scope>.<pack>.Item.<idOrName> OR Compendium.<scope>.<pack>.<idOrName>
  if (parts.length < 4) return null;
  const packKey = `${parts[1]}.${parts[2]}`;
  const pack = game.packs?.get?.(packKey);
  if (!pack?.index || pack.index.size === 0) return null;

  const docKey = parts.length >= 5 && parts[3] === "Item" ? parts.slice(4).join(".") : parts.slice(3).join(".");
  if (!docKey) return null;

  const direct = pack.index.get(docKey);
  if (direct) return { packKey, entry: direct, canonicalUuid: `Compendium.${packKey}.Item.${direct._id}` };

  // Fallback for name-based UUID links (e.g. Compendium.pf2e.spells-srd.Item.Force Bolt)
  let cached = _packNameIndexCache.get(packKey);
  if (!cached || cached.size !== pack.index.size) {
    const byName = new Map();
    for (const e of pack.index.values()) {
      if (e?.name) byName.set(String(e.name).toLowerCase(), e);
    }
    cached = { size: pack.index.size, byName };
    if (byName.size > 0) _packNameIndexCache.set(packKey, cached);
  }
  const named = cached.byName.get(docKey.toLowerCase());
  if (named) return { packKey, entry: named, canonicalUuid: `Compendium.${packKey}.Item.${named._id}` };
  return null;
}

/**
 * Synchronously checks whether a Foundry `@UUID[...]` target points to a PF2e Spell document.
 * Inspects live loaded documents & compendium indices first (zero hardcoded spell lists).
 */
function isLikelySpellUuid(uuid) {
  if (typeof uuid !== "string" || !uuid.trim()) return false;
  const clean = uuid.trim();

  try {
    if (typeof fromUuidSync === "function") {
      const syncDoc = fromUuidSync(clean);
      if (syncDoc && typeof syncDoc === "object" && "type" in syncDoc) {
        return syncDoc.type === "spell";
      }
    }
  } catch { /* ignore sync lookup errors */ }

  if (clean.startsWith("Item.")) {
    const worldItem = game.items?.get?.(clean.slice(5));
    return worldItem ? worldItem.type === "spell" : false;
  }

  const idxHit = lookupCompendiumIndexEntrySync(clean);
  if (idxHit?.entry) {
    return idxHit.entry.type === "spell";
  }

  if (clean.startsWith("Compendium.")) {
    const parts = clean.split(".");
    const packName = parts[2] || "";
    if (NON_SPELL_PACK_REGEX.test(packName)) return false;
    return /spell/i.test(packName);
  }

  return false;
}

/**
 * Resolves live display metadata (`uuid`, `name`, `img`) for a spell UUID synchronously
 * from Foundry's already-loaded compendium index or world items.
 */
function resolveSyncSpellMeta(rawUuid, fallbackLabel = "") {
  const cleanUuid = String(rawUuid || "").trim();
  let canonicalUuid = cleanUuid;
  let name = String(fallbackLabel || "").trim();
  let img = "systems/pf2e/icons/default-icons/spell.svg";
  let isCantrip = null;
  let isFocus = null;
  let baseRank = null;

  try {
    if (typeof fromUuidSync === "function") {
      const doc = fromUuidSync(cleanUuid);
      if (doc && doc.type === "spell") {
        if (doc.uuid) canonicalUuid = doc.uuid;
        if (!name && doc.name) name = String(doc.name);
        if (doc.img) img = doc.img;
        const traits = Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [];
        if (doc.isCantrip != null || traits.includes("cantrip")) isCantrip = Boolean(doc.isCantrip || traits.includes("cantrip"));
        if (doc.isFocusSpell != null || doc.isFocus != null || traits.includes("focus")) {
          isFocus = Boolean(doc.isFocusSpell || doc.isFocus || traits.includes("focus"));
        }
        const lvl = Number(doc.system?.level?.value);
        if (Number.isFinite(lvl) && lvl > 0) baseRank = lvl;
      }
    }
  } catch { /* ignore */ }

  const idxHit = lookupCompendiumIndexEntrySync(cleanUuid);
  if (idxHit?.entry) {
    canonicalUuid = idxHit.canonicalUuid;
    if (!name && idxHit.entry.name) name = String(idxHit.entry.name);
    if (idxHit.entry.img && img === "systems/pf2e/icons/default-icons/spell.svg") img = idxHit.entry.img;
  }

  if (!name) {
    const lastSeg = cleanUuid.split(".").pop() || "Spell";
    name = /^[A-Za-z0-9]{16}$/.test(lastSeg) ? "Spell" : lastSeg;
  }

  return { uuid: canonicalUuid, rawUuid: cleanUuid, name, img, isCantrip, isFocus, baseRank };
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&rsquo;|&#8217;|&#39;/gi, "'")
    .replace(/&lsquo;|&#8216;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&amp;/gi, "&");
}

function htmlToPlainLines(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<hr\b[^>]*>/gi, "\n---HR---\n")
      .replace(/<(?:br\s*\/?|\/p|\/li|\/div|\/tr|\/h[1-6])[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts all spell `@UUID[...]{...}` tokens from a plain/HTML snippet, along with
 * any immediate trailing parenthetical qualifier (e.g. `(fire)`, `(arcane)`, `(air)`).
 */
function extractSpellRefsFromText(text) {
  const plain = htmlToPlainLines(text);
  const refs = [];
  const seen = new Set();
  const re = new RegExp(SPELL_UUID_TOKEN_REGEX.source, "g");
  let match;

  while ((match = re.exec(plain)) !== null) {
    const rawUuid = (match[1] || "").trim();
    const rawLabel = (match[2] || "").trim();
    if (!isLikelySpellUuid(rawUuid)) continue;

    const meta = resolveSyncSpellMeta(rawUuid, rawLabel);
    const dedupeKey = meta.uuid.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const endIdx = match.index + match[0].length;
    const afterImmediate = plain.slice(endIdx, endIdx + 48);
    const beforeCtx = plain.slice(Math.max(0, match.index - 90), match.index);
    const afterCtx = plain.slice(endIdx, endIdx + 70);

    // Immediate trailing qualifier like `(fire)`, `(water)`, `(arcane)`, `(acid or fire)`
    let qualifier = "";
    const qualMatch = afterImmediate.match(/^\s*\(([a-z][a-z\s/-]{1,32})\)/i);
    if (qualMatch) {
      const cand = qualMatch[1].trim().toLowerCase();
      if (!/^(?:see|page|pg|p\.|apg|crb|pc\d|da|som|roe|remaster|legacy|only|if|at|heightened|cantrip|rank)/i.test(cand)) {
        qualifier = cand;
      }
    }

    refs.push({
      ...meta,
      qualifier,
      beforeCtx,
      afterCtx,
      index: match.index,
      endIndex: endIdx
    });
  }

  return refs;
}

/**
 * Extracts the HTML slice belonging to a named bold/heading section in a PF2e item description
 * (e.g. `Sorcerous Gifts`, `Granted Spells`, `Curriculum`, `Bloodline Spells`, `School Spells`,
 * `Revelation Spells`, `Standard Psi Cantrips`, `Unique Psi Cantrips`, `Hex Cantrip`, `Conflux Spell`).
 * Respects HTML heading hierarchy (`h1`..`h6` vs `strong`) and keeps rank/tier (and optional Amp)
 * sub-labels inside the section while stopping cleanly at the next sibling/major heading.
 */
function extractNamedSectionHtml(descHtml, headingPatterns, { stopAtHr = true, ignoreAmpSubheaders = false } = {}) {
  const html = String(descHtml || "");
  if (!html) return "";

  const headingRegex = /<(strong|b|h[1-6])\b[^>]*>([^<]{1,80})<\/\1>|<hr\b[^>]*>/gi;
  const markers = [];
  let m;
  while ((m = headingRegex.exec(html)) !== null) {
    const isHr = /^<hr/i.test(m[0]);
    const tag = isHr ? "hr" : String(m[1] || "").toLowerCase();
    const level = isHr ? 0 : (tag.startsWith("h") ? Number.parseInt(tag.slice(1), 10) : 7);
    const label = isHr
      ? "---HR---"
      : decodeHtmlEntities(m[2] || "").replace(/[:—–-]+\s*$/, "").trim();
    markers.push({
      isHr,
      level,
      label,
      start: m.index,
      end: m.index + m[0].length
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    if (mk.isHr) continue;
    if (!headingPatterns.some(pat => pat.test(mk.label))) continue;

    // Collect content until the next major heading of equal or higher prominence
    let endPos = html.length;
    for (let j = i + 1; j < markers.length; j++) {
      const next = markers[j];
      if (next.isHr) {
        if (stopAtHr) {
          endPos = next.start;
          break;
        }
        continue;
      }
      // If the section started at <h1>..<h6>, keep all lower-level subheadings (e.g. <h4>, <strong>) inside it!
      if (mk.level <= 6 && next.level > mk.level) {
        continue;
      }
      if (/@UUID\[/i.test(next.label)) {
        continue;
      }
      if (RANK_SUBHEADER_REGEX.test(next.label) || TIER_SUBHEADER_REGEX.test(next.label)) {
        continue;
      }
      if (ignoreAmpSubheaders && INLINE_AMP_SUBHEADER_REGEX.test(next.label)) {
        continue;
      }
      endPos = next.start;
      break;
    }
    return html.slice(mk.end, endPos);
  }

  return "";
}

/**
 * Strips `<p><strong>Amp...</strong>...</p>` and `<p><strong>Heightened...</strong>...</p>`
 * paragraphs from a Psychic Psi Cantrip HTML snippet so flavor spells cited inside Amp rules
 * are not misread as granted cantrips.
 */
function stripAmpParagraphs(html) {
  return String(html || "").replace(
    /<p[^>]*>\s*<(?:strong|b)[^>]*>\s*(?:Amp(?:\s+Heightened[^<]*)?|Heightened[^<]*)\s*[:<][\s\S]*?<\/p>/gi,
    "\n"
  );
}

/**
 * Collects normalized qualifier tokens (element, dragon tradition, domain, etc.) currently chosen
 * on the actor from `flags.pf2e.rulesSelections`, `ChoiceSet` rules, `actor.rollOptions.all`,
 * and parenthetical feat names so conditional spell lists disambiguate automatically.
 */
function extractActorQualifiers(actor, focusFeat = null) {
  const tokens = new Set();
  const ignore = new Set(["true", "false", "spell", "spells", "bloodline", "patron", "school", "mystery", "tradition", "choice", "feat", "feature", "arcane-school", "elemental"]);

  const ingest = (raw) => {
    if (!raw || typeof raw !== "string") return;
    if (raw.startsWith("Compendium.") || raw.startsWith("Item.") || raw.startsWith("Actor.")) return;
    const clean = normalizeSlug(raw);
    if (!clean) return;
    if (!ignore.has(clean)) tokens.add(clean);
    for (const part of clean.split("-")) {
      if (part.length >= 3 && !ignore.has(part)) tokens.add(part);
    }
  };

  const inspectFeat = (feat) => {
    if (!feat) return;
    const sels = feat.flags?.pf2e?.rulesSelections;
    if (sels && typeof sels === "object") {
      for (const val of Object.values(sels)) {
        if (typeof val === "string") ingest(val);
        else if (val && typeof val === "object" && typeof val.value === "string") ingest(val.value);
      }
    }
    const rules = Array.isArray(feat.system?.rules) ? feat.system.rules : [];
    for (const r of rules) {
      if (r?.key === "ChoiceSet" && typeof r.selection === "string") ingest(r.selection);
    }
    const paren = String(feat.name || "").match(/\(([^)]+)\)/);
    if (paren) ingest(paren[1]);
  };

  if (focusFeat) inspectFeat(focusFeat);
  for (const f of actor?.itemTypes?.feat || []) {
    if (f !== focusFeat) inspectFeat(f);
  }

  const rollAll = actor?.rollOptions?.all || {};
  for (const [k, v] of Object.entries(rollAll)) {
    if (!v) continue;
    const m = k.match(/(?:^|:)(?:element|elemental-bloodline|dragon-type|bloodline|patron|mystery|school|domain|tradition|energy|damage-type|mind|order|study):([a-z0-9-]+)$/i);
    if (m) ingest(m[1]);
  }

  return tokens;
}

function qualifierMatchesActor(qualifierText, actorQualifiers) {
  if (!qualifierText || !actorQualifiers || actorQualifiers.size === 0) return false;
  const parts = qualifierText.toLowerCase().split(/\s*(?:,|\/|\bor\b|\band\b)\s*/).map(normalizeSlug).filter(Boolean);
  return parts.some(p => actorQualifiers.has(p));
}

/**
 * Extracts direct spell UUIDs stored in PF2e `rulesSelections`, `ChoiceSet.selection`, or `GrantItem.uuid` on a feat.
 */
function extractDirectRuleSpellUuids(feat) {
  const out = [];
  const seen = new Set();
  const pushIfSpell = (val) => {
    if (typeof val !== "string") return;
    const clean = val.trim();
    if (!clean || !isLikelySpellUuid(clean)) return;
    const meta = resolveSyncSpellMeta(clean);
    const key = meta.uuid.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(meta);
  };

  const sels = feat?.flags?.pf2e?.rulesSelections;
  if (sels && typeof sels === "object") {
    for (const val of Object.values(sels)) {
      if (typeof val === "string") pushIfSpell(val);
      else if (val && typeof val === "object" && typeof val.value === "string") pushIfSpell(val.value);
    }
  }

  const rules = Array.isArray(feat?.system?.rules) ? feat.system.rules : [];
  for (const r of rules) {
    if (r?.key === "ChoiceSet" && typeof r.selection === "string") pushIfSpell(r.selection);
    if (r?.key === "GrantItem" && typeof r.uuid === "string") pushIfSpell(r.uuid);
  }

  return out;
}

/**
 * Extracts the selected Cleric/Champion Domain slug from a domain feat
 * (e.g. `Domain Initiate (Fire)` -> `"fire"`, `Advanced Domain (Healing)` -> `"healing"`).
 */
function extractSelectedDomainSlug(feat) {
  if (!feat) return "";
  const sels = feat.flags?.pf2e?.rulesSelections;
  if (sels && typeof sels === "object") {
    for (const [k, v] of Object.entries(sels)) {
      const val = typeof v === "string" ? v : (typeof v?.value === "string" ? v.value : "");
      if (!val || val.startsWith("Compendium.") || val.startsWith("Item.")) continue;
      if (/domain/i.test(k) || Object.keys(sels).length === 1) {
        return normalizeSlug(val.replace(/^domain:/i, ""));
      }
    }
  }
  const rules = Array.isArray(feat.system?.rules) ? feat.system.rules : [];
  for (const r of rules) {
    if (r?.key === "ChoiceSet" && typeof r.selection === "string" && !r.selection.startsWith("Compendium.")) {
      return normalizeSlug(r.selection.replace(/^domain:/i, ""));
    }
  }
  const paren = String(feat.name || "").match(/\(([^)]+)\)/);
  if (paren) return normalizeSlug(paren[1]);
  return "";
}

/**
 * Lazily scans PF2e's own Journals (`pf2e.journals` -> Domains journal, plus World Journals)
 * to map every PF2e Domain slug to its live Initial and Advanced Domain Spell UUIDs.
 * Zero hardcoded domain/spell tables — stays automatically up to date with PF2e & homebrew.
 */
async function warmDomainSpellCache() {
  if (_domainSpellCache) return _domainSpellCache;
  if (_domainSpellCachePromise) return _domainSpellCachePromise;

  _domainSpellCachePromise = (async () => {
    const cache = new Map();

    const ingestDomainJournal = (journal) => {
      if (!journal?.pages) return;
      for (const page of journal.pages) {
        const rawName = String(page.name || "").trim();
        if (!rawName) continue;
        const html = String(page.text?.content || "");
        if (!html.includes("@UUID[")) continue;

        // PF2e Domains journal pages list "Domain Spell" / "Initial" and "Advanced Domain Spell" / "Advanced"
        const advSec = extractNamedSectionHtml(html, [/^advanced(?:\s+domain)?\s+spell$/i, /^advanced$/i]);
        const initSec = extractNamedSectionHtml(html, [/^domain\s+spell$/i, /^initial(?:\s+domain)?\s+spell$/i, /^initial$/i]);
        let initialRef = extractSpellRefsFromText(initSec)[0] || null;
        let advancedRef = extractSpellRefsFromText(advSec)[0] || null;

        if (!initialRef || !advancedRef) {
          const allRefs = extractSpellRefsFromText(html);
          if (!initialRef && allRefs[0]) initialRef = allRefs[0];
          if (!advancedRef && allRefs[1]) advancedRef = allRefs[1];
        }

        if (initialRef || advancedRef) {
          const slug = normalizeSlug(rawName.replace(/\s+domain$/i, ""));
          if (slug && !cache.has(slug)) {
            cache.set(slug, {
              initial: initialRef ? { uuid: initialRef.uuid, name: initialRef.name, img: initialRef.img } : null,
              advanced: advancedRef ? { uuid: advancedRef.uuid, name: advancedRef.name, img: advancedRef.img } : null
            });
          }
        }
      }
    };

    try {
      // 1. World journals first (supports custom/homebrew domain journals)
      for (const j of game.journal?.contents || []) {
        if (/\bdomains?\b/i.test(String(j.name || ""))) {
          ingestDomainJournal(j);
        }
      }

      // 2. PF2e system & module JournalEntry compendiums (prioritize pf2e.journals)
      const journalPacks = Array.from(game.packs || [])
        .filter(p => p.documentName === "JournalEntry")
        .sort((a, b) => (b.collection === "pf2e.journals" ? 1 : 0) - (a.collection === "pf2e.journals" ? 1 : 0));

      for (const pack of journalPacks) {
        const col = String(pack.collection || "");
        if (col !== "pf2e.journals" && !/domain|journal/i.test(col)) continue;
        try {
          const idx = await pack.getIndex();
          for (const entry of idx) {
            if (!/\bdomains?\b/i.test(String(entry.name || ""))) continue;
            const doc = await pack.getDocument(entry._id);
            if (doc) ingestDomainJournal(doc);
          }
        } catch (err) {
          console.warn(`PF2e Awesome GM Utilities | Failed scanning domain journal pack "${col}":`, err);
        }
      }
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Failed building dynamic domain spell cache:", err);
    }

    _domainSpellCache = cache;
    _domainSpellCachePromise = null;
    return cache;
  })();

  return _domainSpellCachePromise;
}

/**
 * Estimates the character level at which an embedded feat/feature was acquired on the actor.
 */
function inferFeatAcquiredLevel(feat, fallbackLevel = 1) {
  if (!feat) return fallbackLevel;
  const loc = String(feat.system?.location || "");
  const m = loc.match(/-(\d+)$/);
  if (m) return Math.max(1, Math.min(20, Number(m[1])));
  const lvl = Number(feat.system?.level?.value);
  if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 20) return lvl;
  return fallbackLevel;
}

/**
 * Parses a ranked spell progression section (Sorcerous Gifts, Granted Spells, Wizard Curriculum,
 * Apparition Spells, etc.) into `{ autoSpells, choiceGroups }` across ranks Cantrip & 1st–10th.
 */
function parseRankedSpellSection(sectionHtml, actorQualifiers, {
  isCurriculum = false,
  targetSourceKey,
  targetClassSlug,
  sourceLabel,
  tier = "gift",
  countsTowardRepertoire = false
}) {
  const autoSpells = [];
  const choiceGroups = [];
  if (!sectionHtml) return { autoSpells, choiceGroups };

  const plain = htmlToPlainLines(sectionHtml);
  if (!plain.includes("@UUID[")) return { autoSpells, choiceGroups };

  // Find every rank marker (`cantrip(s)`, `1st`..`10th`) that introduces spells
  // Supports line/list/semicolon delimiters AND comma-separated `1st: ..., 2nd: ...` or `1st @UUID[...], 2nd @UUID[...]`
  const rankRe = /(?:(?:^|[\n;•])\s*(cantrips?|1st|2nd|3rd|[4-9]th|10th)(?:[\s-]+(?:rank|level))?\s*[:—–-]?\s*|,\s*(cantrips?|1st|2nd|3rd|[4-9]th|10th)(?:[\s-]+(?:rank|level))?\s*(?::\s*|\s+(?=@UUID\[)))/gi;
  const rankMatches = [];
  let m;
  while ((m = rankRe.exec(plain)) !== null) {
    const rawToken = (m[1] || m[2] || "").toLowerCase();
    const rank = rawToken.startsWith("cantrip") ? 0 : Number.parseInt(rawToken, 10);
    if (!Number.isFinite(rank) || rank < 0 || rank > 10) continue;
    rankMatches.push({
      rank,
      start: m.index,
      contentStart: m.index + m[0].length
    });
  }

  // Fallback for single-rank `Granted Spell` sections without an explicit "1st:" prefix
  if (rankMatches.length === 0) {
    const refs = extractSpellRefsFromText(plain);
    if (refs.length > 0) {
      const rank = refs[0].isCantrip ? 0 : (refs[0].baseRank || 1);
      rankMatches.push({ rank, start: 0, contentStart: 0 });
    }
  }

  for (let i = 0; i < rankMatches.length; i++) {
    const cur = rankMatches[i];
    const nextStart = i + 1 < rankMatches.length ? rankMatches[i + 1].start : plain.length;
    const segText = plain.slice(cur.contentStart, nextStart);
    const refs = extractSpellRefsFromText(segText);
    if (refs.length === 0) continue;

    const rank = cur.rank;
    const isCantrip = rank === 0;
    const unlockLevel = isCantrip ? 1 : Math.max(1, rank * 2 - 1);

    const makeRecord = (ref) => ({
      uuid: ref.uuid,
      name: ref.name,
      img: ref.img,
      rank,
      isCantrip,
      isFocus: false,
      unlockLevel,
      targetSourceKey,
      targetClassSlug,
      sourceLabel,
      tier,
      countsTowardRepertoire: Boolean(countsTowardRepertoire && !isCantrip)
    });

    if (isCurriculum) {
      // PF2e Remaster Wizard Arcane School Curriculum: 1 cantrip + 2 1st-rank at Lv 1, 1 per new rank Lv 3..17
      const pickCount = rank === 1 ? 2 : 1;
      if (refs.length <= pickCount) {
        for (const ref of refs) autoSpells.push(makeRecord(ref));
      } else {
        choiceGroups.push({
          id: `${targetSourceKey}:curriculum:r${rank}`,
          targetSourceKey,
          targetClassSlug,
          sourceLabel,
          rank,
          isCantrip,
          isFocus: false,
          isCurriculum: true,
          unlockLevel,
          pickCount,
          label: isCantrip
            ? `${sourceLabel} — Pick ${pickCount} Curriculum Cantrip`
            : `${sourceLabel} — Pick ${pickCount} Rank ${rank} Curriculum Spell${pickCount === 1 ? "" : "s"}`,
          options: refs.map(ref => ({
            uuid: ref.uuid,
            name: ref.name,
            img: ref.img,
            rank,
            isCantrip,
            qualifier: ref.qualifier || ""
          }))
        });
      }
      continue;
    }

    // Non-curriculum ranked spell (Sorcerous Gifts, Psychic Granted Spells, Oracle Granted Spells, Apparition Spells)
    if (refs.length === 1) {
      autoSpells.push(makeRecord(refs[0]));
      continue;
    }

    // Check if options carry parenthetical qualifiers like `(fire)`, `(water)`, `(arcane)`
    const hasQualifiers = refs.some(r => Boolean(r.qualifier));
    if (hasQualifiers) {
      const matched = refs.filter(r => qualifierMatchesActor(r.qualifier, actorQualifiers));
      if (matched.length === 1) {
        autoSpells.push(makeRecord(matched[0]));
      } else {
        const pool = matched.length > 1 ? matched : refs;
        choiceGroups.push({
          id: `${targetSourceKey}:${tier}:r${rank}`,
          targetSourceKey,
          targetClassSlug,
          sourceLabel,
          rank,
          isCantrip,
          isFocus: false,
          isCurriculum: false,
          countsTowardRepertoire: Boolean(countsTowardRepertoire && !isCantrip),
          unlockLevel,
          pickCount: 1,
          label: isCantrip
            ? `${sourceLabel} — Choose Cantrip`
            : `${sourceLabel} — Choose Rank ${rank} Granted Spell`,
          options: pool.map(ref => ({
            uuid: ref.uuid,
            name: ref.name,
            img: ref.img,
            rank,
            isCantrip,
            qualifier: ref.qualifier || ""
          }))
        });
      }
      continue;
    }

    // Multiple unqualified spells in the same rank: check if joined by "or" (exclusive choice) vs "and"/comma (all granted)
    const betweenFirstTwo = segText.slice(refs[0].endIndex, refs[1].index);
    if (/\bor\b/i.test(betweenFirstTwo) && !/\band\b/i.test(betweenFirstTwo)) {
      choiceGroups.push({
        id: `${targetSourceKey}:${tier}:r${rank}`,
        targetSourceKey,
        targetClassSlug,
        sourceLabel,
        rank,
        isCantrip,
        isFocus: false,
        isCurriculum: false,
        countsTowardRepertoire: Boolean(countsTowardRepertoire && !isCantrip),
        unlockLevel,
        pickCount: 1,
        label: isCantrip
          ? `${sourceLabel} — Choose Cantrip`
          : `${sourceLabel} — Choose Rank ${rank} Spell`,
        options: refs.map(ref => ({
          uuid: ref.uuid,
          name: ref.name,
          img: ref.img,
          rank,
          isCantrip,
          qualifier: ""
        }))
      });
    } else {
      for (const ref of refs) autoSpells.push(makeRecord(ref));
    }
  }

  return { autoSpells, choiceGroups };
}

/**
 * Parses a tiered focus/psi section (`initial:`, `advanced:`, `greater:` OR `surface:`, `deeper:`, `deepest:`)
 * into a map `{ tierName -> SpellRef[] }`.
 */
function parseTieredSpellSection(sectionHtml, { stripAmps = false } = {}) {
  const byTier = {};
  if (!sectionHtml) return byTier;
  const cleanedHtml = stripAmps ? stripAmpParagraphs(sectionHtml) : sectionHtml;
  const plain = htmlToPlainLines(cleanedHtml);
  if (!plain.includes("@UUID[")) return byTier;

  const tierRe = /(?:^|[\n;,•])\s*(initial|advanced|greater|surface|deeper|deepest)(?:\s+(?:psi\s+cantrip|focus\s+spell|bloodline\s+spell|school\s+spell|revelation\s+spell|spell|cantrip))?\s*[:—–-]?\s*/gi;
  const matches = [];
  let m;
  while ((m = tierRe.exec(plain)) !== null) {
    matches.push({
      tier: m[1].toLowerCase(),
      start: m.index,
      contentStart: m.index + m[0].length
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : plain.length;
    const seg = plain.slice(cur.contentStart, nextStart);
    const refs = extractSpellRefsFromText(seg);
    if (refs.length > 0) byTier[cur.tier] = refs;
  }

  return byTier;
}

/**
 * Parses focus or direct-grant spells from an individual feat/classfeature dynamically
 * using PF2e's own `rulesSelections` / `ChoiceSet` / `GrantItem` first, then grant-context `@UUID[...]` parsing.
 */
function parseDirectFeatSpells(feat, actorQualifiers, { sectionPatterns = null, allowAllIfSingle = true } = {}) {
  if (!feat) return { auto: [], choice: null };

  // 1. Authoritative PF2e ChoiceSet / GrantItem / rulesSelections direct spell UUIDs
  const ruleRefs = extractDirectRuleSpellUuids(feat);
  if (ruleRefs.length > 0) {
    return { auto: ruleRefs, choice: null };
  }

  const desc = String(feat.system?.description?.value || "");
  if (!desc.includes("@UUID[")) return { auto: [], choice: null };

  // 2. Explicit named section if requested (e.g. "Hex Cantrip", "Conflux Spell", "Vessel Spell")
  let targetHtml = "";
  if (Array.isArray(sectionPatterns) && sectionPatterns.length > 0) {
    targetHtml = extractNamedSectionHtml(desc, sectionPatterns);
  }

  if (!targetHtml) {
    // Strip leading PF2e statblock header lines (Prerequisites/Access/Trigger/Requirements/Frequency + divider <hr>)
    // without discarding the feat body that follows them!
    let body = desc.replace(/^\s*(?:<p[^>]*>\s*<(?:strong|b)[^>]*>\s*(?:Prerequisites?|Access|Frequency|Trigger|Requirements?|Cost)\b[\s\S]*?<\/p>\s*)+/i, "");
    body = body.replace(/^\s*<hr\b[^>]*>\s*/i, "");
    // Only truncate trailing Special tail sections so cross-references aren't misread
    const specialIdx = body.search(/<p[^>]*>\s*<(?:strong|b)[^>]*>\s*Special\b/i);
    targetHtml = specialIdx >= 0 ? body.slice(0, specialIdx) : body;
  }

  const allRefs = extractSpellRefsFromText(targetHtml);
  if (allRefs.length === 0) return { auto: [], choice: null };

  const grantBeforeRe = /(?:you\s+(?:gain|learn|receive|know|add|can\s+cast)|grants?\s+you|familiar\s+learns?|cast\s+the|focus\s+spell|devotion\s+spell|composition\s+(?:spell|cantrip)|conflux\s+spell|order\s+spell|hex(?:\s+cantrip)?|warden\s+spell|qi\s+spell|ki\s+spell|link\s+spell|vessel\s+spell|grave\s+spell|school\s+spell|bloodline\s+spell|revelation\s+spell|granted\s+spell)\b/i;
  const grantAfterRe = /^\s*(?:\([^)]+\)\s*)?(?:focus\s+spell|devotion\s+spell|composition\s+(?:spell|cantrip)|conflux\s+spell|order\s+spell|hex(?:\s+cantrip)?|warden\s+spell|qi\s+spell|ki\s+spell|link\s+spell|vessel\s+spell|grave\s+spell|school\s+spell|bloodline\s+spell|revelation\s+spell|cantrip|spell)\b/i;
  const refOnlyBeforeRe = /(?:instead\s+of|similar\s+to|as\s+if\s+casting|when\s+you\s+cast|if\s+you\s+cast|affecting|prerequisite)\s*$/i;

  let filtered = allRefs.filter(r => {
    if (refOnlyBeforeRe.test(r.beforeCtx.trim())) return false;
    return grantBeforeRe.test(r.beforeCtx) || grantAfterRe.test(r.afterCtx);
  });

  if (filtered.length === 0 && allowAllIfSingle && allRefs.length === 1 && !refOnlyBeforeRe.test(allRefs[0].beforeCtx.trim())) {
    filtered = allRefs;
  }
  if (filtered.length === 0) return { auto: [], choice: null };
  if (filtered.length === 1) return { auto: filtered, choice: null };

  // Check if multiple spells represent an unresolved "choose A or B" choice
  const plain = htmlToPlainLines(targetHtml);
  const firstRef = filtered[0];
  const secondRef = filtered[1];
  const between = plain.slice(firstRef.endIndex, secondRef.index);
  const isChoiceWording = /\b(?:choose|either|one\s+of|select)\b/i.test(firstRef.beforeCtx)
    || (/\bor\b/i.test(between) && !/\band\b/i.test(between));

  if (isChoiceWording) {
    // Try disambiguating via actor qualifiers (e.g. ChoiceSet selection slug matching a spell name!)
    const matched = filtered.filter(r =>
      qualifierMatchesActor(r.qualifier, actorQualifiers)
      || actorQualifiers.has(normalizeSlug(r.name))
    );
    if (matched.length === 1) return { auto: matched, choice: null };
    return { auto: [], choice: filtered };
  }

  return { auto: filtered, choice: null };
}

/**
 * Dynamically collects ALL auto-granted subclass, deity, font, and focus spells (plus structured
 * subclass spell choices like Remaster Wizard Arcane School Curriculum) across Levels 1–20 directly
 * from the actor's live PF2e items and compendiums (zero hardcoded spell lists).
 *
 * Used by BOTH Character Completeness Checker (`analyzeSpellcasting` / sync) and Level 1–20 Build Planner!
 *
 * @param {Actor} actor
 * @param {object|null} dualInfo
 * @param {{ plannedFeatLevelsBySlug?: Map<string, number> }} [options]
 * @returns {{ autoSpells: object[], choiceGroups: object[], hasDeferredDomain: boolean }}
 */
export function collectActorGrantedSpellsProgression(actor, dualInfo = null, { plannedFeatLevelsBySlug = null } = {}) {
  const autoSpells = [];
  const choiceGroups = [];
  let hasDeferredDomain = false;

  if (!actor || actor.type !== "character") {
    return { autoSpells, choiceGroups, hasDeferredDomain };
  }

  const feats = actor.itemTypes?.feat || [];
  const primarySlug = actor.class ? getItemSlug(actor.class) : "";
  const hasClassOrDual = (clsSlug) => primarySlug === clsSlug || dualInfo?.slug === clsSlug;
  const classKind = (clsSlug) => (dualInfo?.slug === clsSlug && primarySlug !== clsSlug ? "dual" : "primary");

  const featBySlug = new Map();
  for (const f of feats) {
    const slug = getItemSlug(f);
    if (slug && !featBySlug.has(slug)) featBySlug.set(slug, f);
  }

  const getFeatUnlockLevel = (slugList) => {
    for (const rawSlug of slugList) {
      const s = normalizeSlug(rawSlug);
      const liveFeat = featBySlug.get(s);
      if (liveFeat) return { unlocked: true, level: inferFeatAcquiredLevel(liveFeat, 1), feat: liveFeat };
      if (plannedFeatLevelsBySlug?.has(s)) {
        return { unlocked: true, level: plannedFeatLevelsBySlug.get(s), feat: null, isPlanned: true };
      }
    }
    return { unlocked: false, level: 99, feat: null };
  };

  const actorQualifiers = extractActorQualifiers(actor);
  const autoKeySet = new Set();

  const pushAutoSpell = (rec) => {
    if (!rec || !rec.targetSourceKey) return;
    const idPart = rec.uuid
      ? rec.uuid.toLowerCase()
      : (rec.domainSlug ? `domain:${rec.domainSlug}:${rec.domainTier}` : normalizeSlug(rec.name));
    const key = `${rec.targetSourceKey}|${idPart}`;
    if (autoKeySet.has(key)) return;
    autoKeySet.add(key);
    autoSpells.push(rec);
  };

  const pushTieredFocusRefs = (refs, { targetSourceKey, targetClassSlug, sourceLabel, tier, unlockLevel, isFocus = true, isCantrip = false, rank = null }) => {
    if (!Array.isArray(refs) || refs.length === 0) return;
    if (refs.length === 1) {
      const r = refs[0];
      pushAutoSpell({
        uuid: r.uuid,
        name: r.name,
        img: r.img,
        rank: isCantrip ? 0 : (rank ?? r.baseRank ?? null),
        isCantrip: Boolean(isCantrip || r.isCantrip),
        isFocus,
        unlockLevel,
        targetSourceKey,
        targetClassSlug,
        sourceLabel,
        tier,
        countsTowardRepertoire: false
      });
      return;
    }

    const matched = refs.filter(r =>
      qualifierMatchesActor(r.qualifier, actorQualifiers)
      || actorQualifiers.has(normalizeSlug(r.name))
    );
    if (matched.length === 1) {
      const r = matched[0];
      pushAutoSpell({
        uuid: r.uuid,
        name: r.name,
        img: r.img,
        rank: isCantrip ? 0 : (rank ?? r.baseRank ?? null),
        isCantrip: Boolean(isCantrip || r.isCantrip),
        isFocus,
        unlockLevel,
        targetSourceKey,
        targetClassSlug,
        sourceLabel,
        tier,
        countsTowardRepertoire: false
      });
    } else {
      choiceGroups.push({
        id: `${targetSourceKey}:tier:${tier}`,
        targetSourceKey,
        targetClassSlug,
        sourceLabel,
        rank: isCantrip ? 0 : (rank ?? 1),
        isCantrip,
        isFocus,
        isCurriculum: false,
        unlockLevel,
        pickCount: 1,
        label: `${sourceLabel} (${capitalize(tier)}) — Choose Spell`,
        options: (matched.length > 1 ? matched : refs).map(r => ({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: isCantrip ? 0 : (rank ?? r.baseRank ?? 1),
          isCantrip: Boolean(isCantrip || r.isCantrip),
          qualifier: r.qualifier || ""
        }))
      });
    }
  };

  const pushDomainFeat = (feat, targetSourceKey, targetClassSlug) => {
    const slug = getItemSlug(feat);
    const tier = slug.includes("advanced") ? "advanced" : "initial";
    const unlockLevel = inferFeatAcquiredLevel(feat, tier === "advanced" ? 8 : 1);

    // First check if the feat already stores a direct spell UUID in rulesSelections / GrantItem
    const direct = extractDirectRuleSpellUuids(feat);
    if (direct.length > 0) {
      for (const r of direct) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: r.baseRank ?? null,
          isCantrip: Boolean(r.isCantrip),
          isFocus: true,
          unlockLevel,
          targetSourceKey,
          targetClassSlug,
          sourceLabel: feat.name,
          tier: `domain-${tier}`,
          countsTowardRepertoire: false
        });
      }
      return;
    }

    const domainSlug = extractSelectedDomainSlug(feat);
    if (!domainSlug) return;

    const cached = _domainSpellCache?.get(domainSlug);
    const resolved = cached?.[tier] || null;
    if (resolved?.uuid) {
      pushAutoSpell({
        uuid: resolved.uuid,
        name: resolved.name,
        img: resolved.img || "systems/pf2e/icons/default-icons/spell.svg",
        rank: null,
        isCantrip: false,
        isFocus: true,
        unlockLevel,
        targetSourceKey,
        targetClassSlug,
        sourceLabel: `${capitalize(domainSlug)} Domain (${capitalize(tier)})`,
        tier: `domain-${tier}`,
        countsTowardRepertoire: false,
        domainSlug,
        domainTier: tier
      });
    } else if (!_domainSpellCache) {
      hasDeferredDomain = true;
      pushAutoSpell({
        uuid: null,
        name: `${capitalize(domainSlug)} ${tier === "advanced" ? "Advanced " : ""}Domain Spell`,
        img: "systems/pf2e/icons/default-icons/spell.svg",
        rank: null,
        isCantrip: false,
        isFocus: true,
        unlockLevel,
        targetSourceKey,
        targetClassSlug,
        sourceLabel: feat.name,
        tier: `domain-${tier}`,
        countsTowardRepertoire: false,
        domainSlug,
        domainTier: tier,
        isDeferredDomain: true
      });
    }
  };

  // --- 1. CLERIC: Deity Granted Spells (`actor.deity.system.spells`) & Divine Font ---
  if (hasClassOrDual("cleric")) {
    const kind = classKind("cleric");
    const clericEntryKey = `class:cleric:${kind}`;
    const fontEntryKey = `class:cleric:divine-font:${kind}`;
    const deity = actor.deity;

    if (deity?.system?.spells && typeof deity.system.spells === "object") {
      for (const [rankKey, rawUuid] of Object.entries(deity.system.spells)) {
        const rank = Number.parseInt(rankKey, 10);
        if (!Number.isFinite(rank) || rank < 0 || rank > 10) continue;
        if (typeof rawUuid !== "string" || !rawUuid.trim()) continue;
        const meta = resolveSyncSpellMeta(rawUuid.trim());
        pushAutoSpell({
          uuid: meta.uuid,
          name: meta.name,
          img: meta.img,
          rank,
          isCantrip: rank === 0,
          isFocus: false,
          unlockLevel: rank === 0 ? 1 : Math.max(1, rank * 2 - 1),
          targetSourceKey: clericEntryKey,
          targetClassSlug: "cleric",
          sourceLabel: deity.name || "Deity",
          tier: "deity",
          countsTowardRepertoire: false
        });
      }
    }

    // Divine Font spell (Heal / Harm) resolved dynamically from Divine Font / Healing Font / Harmful Font
    const fontChoice = detectClericDivineFontChoice(actor, feats);
    if (fontChoice) {
      const desiredName = fontChoice === "harm" ? "harm" : "heal";
      const desiredTitle = fontChoice === "harm" ? "Harm" : "Heal";
      const fontFeats = [
        featBySlug.get(fontChoice === "harm" ? "harmful-font" : "healing-font"),
        featBySlug.get("divine-font"),
        ...feats.filter(f => /\bdivine\s+font\b/i.test(String(f.name || "")))
      ].filter(Boolean);

      let matchedFont = null;
      let fontLabel = `Divine Font (${desiredTitle})`;
      for (const ff of fontFeats) {
        fontLabel = ff.name || fontLabel;
        const directRefs = extractDirectRuleSpellUuids(ff);
        const directHit = directRefs.find(r => normalizeSlug(r.name) === desiredName);
        if (directHit) {
          matchedFont = directHit;
          break;
        }
        const descRefs = extractSpellRefsFromText(ff.system?.description?.value || "");
        const descHit = descRefs.find(r => normalizeSlug(r.name) === desiredName);
        if (descHit) {
          matchedFont = descHit;
          break;
        }
      }

      // Live PF2e spells-srd index fallback (zero hardcoded IDs) if Divine Font text omits a @UUID link
      if (!matchedFont) {
        matchedFont = resolveSyncSpellMeta(`Compendium.pf2e.spells-srd.Item.${desiredTitle}`, desiredTitle);
      }

      if (matchedFont) {
        pushAutoSpell({
          uuid: matchedFont.uuid,
          name: matchedFont.name || desiredTitle,
          img: matchedFont.img,
          rank: 1,
          isCantrip: false,
          isFocus: false,
          unlockLevel: 1,
          targetSourceKey: fontEntryKey,
          targetClassSlug: "cleric",
          sourceLabel: fontLabel,
          tier: "font",
          countsTowardRepertoire: false
        });
      }
    }
  }

  // --- 2. SORCERER: Bloodline Sorcerous Gifts / Granted Spells + Bloodline Focus Spells ---
  const isSorcClass = hasClassOrDual("sorcerer");
  const isSorcArch = !isSorcClass && (featBySlug.has("sorcerer-dedication") || featBySlug.has("basic-bloodline-spell") || featBySlug.has("advanced-bloodline"));
  if (isSorcClass || isSorcArch) {
    const kind = isSorcClass ? classKind("sorcerer") : "archetype";
    const sorcSpellKey = isSorcClass ? `class:sorcerer:${kind}` : "archetype:sorcerer";
    const sorcFocusKey = isSorcClass ? `focus:sorcerer:${kind}` : "focus:archetype:sorcerer";

    const bloodlineFeat = feats.find(f => {
      const desc = String(f.system?.description?.value || "");
      return /<(?:strong|b|h[1-6])[^>]*>\s*(?:Sorcerous\s+Gifts?|Bloodline\s+Spells?)\s*[:<]/i.test(desc)
        || (getItemSlug(f).includes("bloodline") && /Granted\s+Spells/i.test(desc));
    });

    if (bloodlineFeat) {
      const desc = String(bloodlineFeat.system?.description?.value || "");
      const bQuals = extractActorQualifiers(actor, bloodlineFeat);

      if (isSorcClass) {
        const giftsHtml = extractNamedSectionHtml(desc, [/^sorcerous\s+gifts?$/i, /^granted\s+spells?$/i]);
        const parsed = parseRankedSpellSection(giftsHtml, bQuals, {
          isCurriculum: false,
          targetSourceKey: sorcSpellKey,
          targetClassSlug: "sorcerer",
          sourceLabel: bloodlineFeat.name,
          tier: "gift",
          countsTowardRepertoire: true
        });
        for (const sp of parsed.autoSpells) pushAutoSpell(sp);
        choiceGroups.push(...parsed.choiceGroups);
      }

      const focusHtml = extractNamedSectionHtml(desc, [/^bloodline\s+spells?$/i]);
      const tiers = parseTieredSpellSection(focusHtml);
      const initUnlock = isSorcClass
        ? { unlocked: true, level: 1 }
        : getFeatUnlockLevel(["basic-bloodline-spell"]);
      if (initUnlock.unlocked && tiers.initial) {
        pushTieredFocusRefs(tiers.initial, {
          targetSourceKey: sorcFocusKey,
          targetClassSlug: "sorcerer",
          sourceLabel: bloodlineFeat.name,
          tier: "initial",
          unlockLevel: initUnlock.level
        });
      }
      const advUnlock = getFeatUnlockLevel(["advanced-bloodline"]);
      if (advUnlock.unlocked && tiers.advanced) {
        pushTieredFocusRefs(tiers.advanced, {
          targetSourceKey: sorcFocusKey,
          targetClassSlug: "sorcerer",
          sourceLabel: bloodlineFeat.name,
          tier: "advanced",
          unlockLevel: advUnlock.level
        });
      }
      const greaterUnlock = getFeatUnlockLevel(["greater-bloodline"]);
      if (greaterUnlock.unlocked && tiers.greater) {
        pushTieredFocusRefs(tiers.greater, {
          targetSourceKey: sorcFocusKey,
          targetClassSlug: "sorcerer",
          sourceLabel: bloodlineFeat.name,
          tier: "greater",
          unlockLevel: greaterUnlock.level
        });
      }
    }
  }

  // --- 3. WIZARD: Arcane School Curriculum + School Focus Spells + Hand of the Apprentice ---
  const isWizClass = hasClassOrDual("wizard");
  const isWizArch = !isWizClass && (featBySlug.has("wizard-dedication") || featBySlug.has("arcane-school-spell"));
  if (isWizClass || isWizArch) {
    const kind = isWizClass ? classKind("wizard") : "archetype";
    const wizSpellKey = isWizClass ? `class:wizard:${kind}` : "archetype:wizard";
    const wizFocusKey = isWizClass ? `focus:wizard:${kind}` : "focus:archetype:wizard";

    const schoolFeat = feats.find(f => {
      const slug = getItemSlug(f);
      if (slug.includes("unified-magical-theory") || slug.includes("universalist")) return false;
      const desc = String(f.system?.description?.value || "");
      return /<(?:strong|b|h[1-6])[^>]*>\s*(?:(?:Arcane\s+)?Curriculum|School\s+Spells?)\s*[:<]/i.test(desc);
    });

    if (schoolFeat) {
      const desc = String(schoolFeat.system?.description?.value || "");
      const sQuals = extractActorQualifiers(actor, schoolFeat);

      if (isWizClass) {
        const currHtml = extractNamedSectionHtml(desc, [/^(?:arcane\s+)?curriculum(?:\s+spells?)?$/i]);
        const parsed = parseRankedSpellSection(currHtml, sQuals, {
          isCurriculum: true,
          targetSourceKey: wizSpellKey,
          targetClassSlug: "wizard",
          sourceLabel: schoolFeat.name,
          tier: "curriculum",
          countsTowardRepertoire: false
        });
        for (const sp of parsed.autoSpells) pushAutoSpell(sp);
        choiceGroups.push(...parsed.choiceGroups);
      }

      const focusHtml = extractNamedSectionHtml(desc, [/^school\s+spells?$/i]);
      const tiers = parseTieredSpellSection(focusHtml);
      const initUnlock = isWizClass
        ? { unlocked: true, level: 1 }
        : getFeatUnlockLevel(["arcane-school-spell"]);
      if (initUnlock.unlocked && tiers.initial) {
        pushTieredFocusRefs(tiers.initial, {
          targetSourceKey: wizFocusKey,
          targetClassSlug: "wizard",
          sourceLabel: schoolFeat.name,
          tier: "initial",
          unlockLevel: initUnlock.level
        });
      }
      const advUnlock = getFeatUnlockLevel(["advanced-school-spell"]);
      if (advUnlock.unlocked && tiers.advanced) {
        pushTieredFocusRefs(tiers.advanced, {
          targetSourceKey: wizFocusKey,
          targetClassSlug: "wizard",
          sourceLabel: schoolFeat.name,
          tier: "advanced",
          unlockLevel: advUnlock.level
        });
      }
    }

    const hota = featBySlug.get("hand-of-the-apprentice");
    if (hota && isWizClass) {
      const parsed = parseDirectFeatSpells(hota, actorQualifiers);
      for (const r of parsed.auto) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: null,
          isCantrip: false,
          isFocus: true,
          unlockLevel: inferFeatAcquiredLevel(hota, 1),
          targetSourceKey: wizFocusKey,
          targetClassSlug: "wizard",
          sourceLabel: hota.name,
          tier: "feat",
          countsTowardRepertoire: false
        });
      }
    }
  }

  // --- 4. ORACLE: Mystery Granted Spells + Revelation Focus Spells + Domain Acumen ---
  const isOraClass = hasClassOrDual("oracle");
  const isOraArch = !isOraClass && (featBySlug.has("oracle-dedication") || featBySlug.has("first-revelation") || featBySlug.has("advanced-revelation"));
  if (isOraClass || isOraArch) {
    const kind = isOraClass ? classKind("oracle") : "archetype";
    const oraSpellKey = isOraClass ? `class:oracle:${kind}` : "archetype:oracle";
    const oraFocusKey = isOraClass ? `focus:oracle:${kind}` : "focus:archetype:oracle";

    const mysteryFeat = feats.find(f => {
      const desc = String(f.system?.description?.value || "");
      return /<(?:strong|b|h[1-6])[^>]*>\s*Revelation\s+Spells?\s*[:<]/i.test(desc);
    });

    if (mysteryFeat) {
      const desc = String(mysteryFeat.system?.description?.value || "");
      const mQuals = extractActorQualifiers(actor, mysteryFeat);

      if (isOraClass) {
        const grantedHtml = extractNamedSectionHtml(desc, [/^granted\s+spells?$/i, /^mystery\s+spells?$/i]);
        const parsed = parseRankedSpellSection(grantedHtml, mQuals, {
          isCurriculum: false,
          targetSourceKey: oraSpellKey,
          targetClassSlug: "oracle",
          sourceLabel: mysteryFeat.name,
          tier: "gift",
          countsTowardRepertoire: false
        });
        for (const sp of parsed.autoSpells) pushAutoSpell(sp);
        choiceGroups.push(...parsed.choiceGroups);

        // Some Legacy/Remaster Oracle mysteries list "Granted Cantrip" separately
        const cantripHtml = extractNamedSectionHtml(desc, [/^granted\s+cantrip$/i, /^cantrip$/i]);
        for (const r of extractSpellRefsFromText(cantripHtml)) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: 0,
            isCantrip: true,
            isFocus: false,
            unlockLevel: 1,
            targetSourceKey: oraSpellKey,
            targetClassSlug: "oracle",
            sourceLabel: mysteryFeat.name,
            tier: "gift",
            countsTowardRepertoire: false
          });
        }
      }

      const revHtml = extractNamedSectionHtml(desc, [/^revelation\s+spells?$/i]);
      const tiers = parseTieredSpellSection(revHtml);
      const initUnlock = isOraClass
        ? { unlocked: true, level: 1 }
        : getFeatUnlockLevel(["first-revelation"]);
      if (initUnlock.unlocked && tiers.initial) {
        pushTieredFocusRefs(tiers.initial, {
          targetSourceKey: oraFocusKey,
          targetClassSlug: "oracle",
          sourceLabel: mysteryFeat.name,
          tier: "initial",
          unlockLevel: initUnlock.level
        });
      }
      const advUnlock = getFeatUnlockLevel(["advanced-revelation"]);
      if (advUnlock.unlocked && tiers.advanced) {
        pushTieredFocusRefs(tiers.advanced, {
          targetSourceKey: oraFocusKey,
          targetClassSlug: "oracle",
          sourceLabel: mysteryFeat.name,
          tier: "advanced",
          unlockLevel: advUnlock.level
        });
      }
      const greaterUnlock = getFeatUnlockLevel(["greater-revelation"]);
      if (greaterUnlock.unlocked && tiers.greater) {
        pushTieredFocusRefs(tiers.greater, {
          targetSourceKey: oraFocusKey,
          targetClassSlug: "oracle",
          sourceLabel: mysteryFeat.name,
          tier: "greater",
          unlockLevel: greaterUnlock.level
        });
      }
    }

    const domAcumen = featBySlug.get("domain-acumen");
    if (domAcumen && isOraClass) {
      pushDomainFeat(domAcumen, oraFocusKey, "oracle");
    }
  }

  // --- 5. PSYCHIC: Conscious Mind Granted Spells + Standard & Unique Psi Cantrips ---
  if (hasClassOrDual("psychic")) {
    const kind = classKind("psychic");
    const psySpellKey = `class:psychic:${kind}`;

    const mindFeat = feats.find(f => isPsychicConsciousMindFeat(f));

    if (mindFeat) {
      const desc = String(mindFeat.system?.description?.value || "");
      const pQuals = extractActorQualifiers(actor, mindFeat);

      const grantedHtml = extractNamedSectionHtml(desc, [/^granted\s+spells?$/i]);
      const parsed = parseRankedSpellSection(grantedHtml, pQuals, {
        isCurriculum: false,
        targetSourceKey: psySpellKey,
        targetClassSlug: "psychic",
        sourceLabel: mindFeat.name,
        tier: "gift",
        countsTowardRepertoire: false
      });
      for (const sp of parsed.autoSpells) pushAutoSpell(sp);
      choiceGroups.push(...parsed.choiceGroups);

      // Standard Psi Cantrips (handles both concise single-line AND multi-paragraph Amp blocks!)
      const rawStdPsiHtml = extractNamedSectionHtml(
        desc,
        [/^standard\s+psi\s+cantrips?$/i, /^psi\s+cantrips?$/i],
        { stopAtHr: false, ignoreAmpSubheaders: true }
      );
      // If heading was generic `Psi Cantrips`, trim off any nested Unique / Surface / Deeper / Deepest tail
      const uniqueCutIdx = rawStdPsiHtml.search(/<(?:strong|b|h[1-6])\b[^>]*>\s*(?:Unique\s+Psi\s+Cantrips?|Surface(?:\s+Psi\s+Cantrip)?|Deeper(?:\s+Psi\s+Cantrip)?|Deepest(?:\s+Psi\s+Cantrip)?)\s*[:<]/i);
      const stdPsiScope = uniqueCutIdx >= 0 ? rawStdPsiHtml.slice(0, uniqueCutIdx) : rawStdPsiHtml;
      const stdPsiCleaned = stripAmpParagraphs(stdPsiScope);
      let stdRefs = extractSpellRefsFromText(stdPsiCleaned);
      if (stdRefs.length === 0 && stdPsiScope) stdRefs = extractSpellRefsFromText(stdPsiScope);
      for (const r of stdRefs) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: 0,
          isCantrip: true,
          isFocus: false,
          unlockLevel: 1,
          targetSourceKey: psySpellKey,
          targetClassSlug: "psychic",
          sourceLabel: `${mindFeat.name} (Psi Cantrip)`,
          tier: "psi",
          countsTowardRepertoire: false
        });
      }

      // Unique Psi Cantrips (handles BOTH grouped `Unique Psi Cantrips` AND standalone `Surface / Deeper / Deepest Psi Cantrip` headings!)
      const uniquePsiHtml = extractNamedSectionHtml(
        desc,
        [/^unique\s+psi\s+cantrips?$/i],
        { stopAtHr: false, ignoreAmpSubheaders: true }
      );
      const psiTiers = parseTieredSpellSection(uniquePsiHtml, { stripAmps: true });

      const tierSpecs = [
        { key: "surface", unlockLevel: 1, headingRe: [/^surface(?:\s+psi\s+cantrip)?$/i] },
        { key: "deeper", unlockLevel: 6, headingRe: [/^deeper(?:\s+psi\s+cantrip)?$/i] },
        { key: "deepest", unlockLevel: 10, headingRe: [/^deepest(?:\s+psi\s+cantrip)?$/i] }
      ];
      for (const ts of tierSpecs) {
        let refs = psiTiers[ts.key];
        if (!refs || refs.length === 0) {
          const standaloneHtml = extractNamedSectionHtml(desc, ts.headingRe, { stopAtHr: false, ignoreAmpSubheaders: true });
          const cleaned = stripAmpParagraphs(standaloneHtml);
          refs = extractSpellRefsFromText(cleaned);
          if (refs.length === 0 && standaloneHtml) refs = extractSpellRefsFromText(standaloneHtml);
        }
        if (refs && refs.length > 0) {
          pushTieredFocusRefs(refs, {
            targetSourceKey: psySpellKey,
            targetClassSlug: "psychic",
            sourceLabel: mindFeat.name,
            tier: ts.key,
            unlockLevel: ts.unlockLevel,
            isFocus: false,
            isCantrip: true,
            rank: 0
          });
        }
      }
    }

    // Also inspect Psychic child features/feats that grant extra psi cantrips directly via rulesSelections/GrantItem
    // OR via description grant text (e.g. Parallel Breakthrough, Psi Development, or Conscious Mind child features)
    const passivePsychicExclusions = /(?:^|-)(?:conscious-mind|subconscious-mind|unleash-psyche|conservation-of-energy|emotional-acceptance|gathered-lore|precise-discipline|wandering-reverie|psi-strikes|strain-mind|violent-unleash|dark-persona|psi-burst|psi-cantrips-and-amps|signature-spells|mind-over-matter|infinite-mind)(?:$|-)/;
    for (const f of feats) {
      if (f === mindFeat) continue;
      const slug = getItemSlug(f);
      if (passivePsychicExclusions.test(slug)) continue;
      const traits = Array.isArray(f.system?.traits?.value) ? f.system.traits.value : [];
      const desc = String(f.system?.description?.value || "");
      const isPsiGrantFeat = traits.includes("psychic")
        || slug.includes("psi-cantrip")
        || slug === "parallel-breakthrough"
        || slug === "psi-development"
        || /\b(?:surface|deeper|deepest)\s+psi\s+cantrip\b/i.test(String(f.name || ""));
      if (!isPsiGrantFeat) continue;

      const uLvl = inferFeatAcquiredLevel(f, 1);
      const directRefs = extractDirectRuleSpellUuids(f);
      let refsToAdd = directRefs;
      if (refsToAdd.length === 0 && /\bpsi\s+cantrip\b|\badd\s+the\b|\byou\s+(?:gain|learn)\b/i.test(desc)) {
        const cleanedDescFeat = { ...f, system: { ...f.system, description: { value: stripAmpParagraphs(desc) } } };
        refsToAdd = parseDirectFeatSpells(cleanedDescFeat, extractActorQualifiers(actor, f), { allowAllIfSingle: false }).auto;
      }

      for (const r of refsToAdd) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: r.isCantrip === false ? (r.baseRank || 1) : 0,
          isCantrip: r.isCantrip !== false,
          isFocus: false,
          unlockLevel: uLvl,
          targetSourceKey: psySpellKey,
          targetClassSlug: "psychic",
          sourceLabel: f.name,
          tier: "psi",
          countsTowardRepertoire: false
        });
      }
    }
  } else if (featBySlug.has("psychic-dedication")) {
    const psyDed = featBySlug.get("psychic-dedication");
    const direct = extractDirectRuleSpellUuids(psyDed);
    for (const r of direct) {
      pushAutoSpell({
        uuid: r.uuid,
        name: r.name,
        img: r.img,
        rank: 0,
        isCantrip: true,
        isFocus: false,
        unlockLevel: inferFeatAcquiredLevel(psyDed, 2),
        targetSourceKey: "archetype:psychic",
        targetClassSlug: "psychic",
        sourceLabel: psyDed.name,
        tier: "psi",
        countsTowardRepertoire: false
      });
    }
  }

  // --- 6. WITCH: Patron Hex Cantrip + Granted Spell + Lesson Hexes & Familiar Spells ---
  const isWitchClass = hasClassOrDual("witch");
  const isWitchArch = !isWitchClass && (featBySlug.has("witch-dedication") || featBySlug.has("basic-lesson") || featBySlug.has("greater-lesson") || featBySlug.has("major-lesson"));
  if (isWitchClass || isWitchArch) {
    const kind = isWitchClass ? classKind("witch") : "archetype";
    const witchSpellKey = isWitchClass ? `class:witch:${kind}` : "archetype:witch";
    const witchFocusKey = isWitchClass ? `focus:witch:${kind}` : "focus:archetype:witch";

    const patronFeat = feats.find(f => {
      const desc = String(f.system?.description?.value || "");
      return /<(?:strong|b|h[1-6])[^>]*>\s*Hex\s+Cantrip\s*[:<]/i.test(desc);
    });

    if (patronFeat && isWitchClass) {
      const desc = String(patronFeat.system?.description?.value || "");
      const hexHtml = extractNamedSectionHtml(desc, [/^hex\s+cantrip$/i]);
      for (const r of extractSpellRefsFromText(hexHtml)) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: 0,
          isCantrip: true,
          isFocus: true,
          unlockLevel: 1,
          targetSourceKey: witchFocusKey,
          targetClassSlug: "witch",
          sourceLabel: patronFeat.name,
          tier: "hex",
          countsTowardRepertoire: false
        });
      }

      const grantedHtml = extractNamedSectionHtml(desc, [/^granted\s+spell$/i]);
      for (const r of extractSpellRefsFromText(grantedHtml)) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: r.baseRank || 1,
          isCantrip: Boolean(r.isCantrip),
          isFocus: false,
          unlockLevel: 1,
          targetSourceKey: witchSpellKey,
          targetClassSlug: "witch",
          sourceLabel: patronFeat.name,
          tier: "gift",
          countsTowardRepertoire: false
        });
      }
    }

    // Witch Lesson sub-features (`lesson-of-*`) & Cackle
    for (const f of feats) {
      const slug = getItemSlug(f);
      const desc = String(f.system?.description?.value || "");
      const isLesson = slug.startsWith("lesson-of-") || slug === "cackle"
        || (f.system?.traits?.value?.includes("witch") && /\bhex\b/i.test(desc) && /\bfamiliar\s+learns?\b/i.test(desc));
      if (!isLesson) continue;

      const uLvl = inferFeatAcquiredLevel(f, 1);
      const refs = extractSpellRefsFromText(desc);
      for (const r of refs) {
        const isFamiliarSpell = /\bfamiliar\s+(?:learns?|gains?|adds?)\b/i.test(r.beforeCtx)
          && !/\bhex\b/i.test(r.afterCtx)
          && r.isFocus !== true;
        const isHexSpell = r.isFocus === true
          || /\bhex(?:\s+cantrip)?\b/i.test(r.afterCtx)
          || (/\bhex\b/i.test(r.beforeCtx) && !isFamiliarSpell)
          || slug === "cackle";
        if (isHexSpell && !isFamiliarSpell) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: null,
            isCantrip: Boolean(r.isCantrip),
            isFocus: true,
            unlockLevel: uLvl,
            targetSourceKey: witchFocusKey,
            targetClassSlug: "witch",
            sourceLabel: f.name,
            tier: "lesson",
            countsTowardRepertoire: false
          });
        } else if (isFamiliarSpell) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: r.baseRank || 1,
            isCantrip: Boolean(r.isCantrip),
            isFocus: false,
            unlockLevel: uLvl,
            targetSourceKey: witchSpellKey,
            targetClassSlug: "witch",
            sourceLabel: `${f.name} (Familiar)`,
            tier: "lesson",
            countsTowardRepertoire: false
          });
        }
      }
    }
  }

  // --- 7. MAGUS: Hybrid Study Conflux Spell + Conflux Feats ---
  const isMagusClass = hasClassOrDual("magus");
  const isMagusArch = !isMagusClass && (featBySlug.has("magus-dedication") || featBySlug.has("conflux-spell"));
  if (isMagusClass || isMagusArch) {
    const kind = isMagusClass ? classKind("magus") : "archetype";
    const magusFocusKey = isMagusClass ? `focus:magus:${kind}` : "focus:archetype:magus";
    const magusSpellKey = isMagusClass ? `class:magus:${kind}` : "archetype:magus";

    for (const f of feats) {
      const slug = getItemSlug(f);
      const desc = String(f.system?.description?.value || "");
      const isHybridStudy = /<(?:strong|b|h[1-6])[^>]*>\s*Conflux\s+Spell\s*[:<]/i.test(desc);
      if (isHybridStudy) {
        const initUnlock = isMagusClass ? { unlocked: true, level: 1 } : getFeatUnlockLevel(["conflux-spell"]);
        if (initUnlock.unlocked) {
          const cfHtml = extractNamedSectionHtml(desc, [/^conflux\s+spell$/i]);
          for (const r of extractSpellRefsFromText(cfHtml)) {
            pushAutoSpell({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: null,
              isCantrip: false,
              isFocus: true,
              unlockLevel: initUnlock.level,
              targetSourceKey: magusFocusKey,
              targetClassSlug: "magus",
              sourceLabel: f.name,
              tier: "conflux",
              countsTowardRepertoire: false
            });
          }
        }
        // Studious Spells (Magus Lv 7/11/13)
        if (isMagusClass) {
          const studHtml = extractNamedSectionHtml(desc, [/^studious\s+spells?$/i]);
          if (studHtml) {
            const plain = htmlToPlainLines(studHtml);
            const lvlRe = /(?:^|[\n;•])\s*(7th|11th|13th)\s*[:—–-]?\s*/gi;
            const lm = [];
            let mm;
            while ((mm = lvlRe.exec(plain)) !== null) {
              lm.push({ level: Number.parseInt(mm[1], 10), start: mm.index, contentStart: mm.index + mm[0].length });
            }
            for (let i = 0; i < lm.length; i++) {
              const seg = plain.slice(lm[i].contentStart, i + 1 < lm.length ? lm[i + 1].start : plain.length);
              for (const r of extractSpellRefsFromText(seg)) {
                pushAutoSpell({
                  uuid: r.uuid,
                  name: r.name,
                  img: r.img,
                  rank: r.baseRank || (lm[i].level === 7 ? 2 : (lm[i].level === 11 ? 3 : 4)),
                  isCantrip: false,
                  isFocus: false,
                  unlockLevel: lm[i].level,
                  targetSourceKey: magusSpellKey,
                  targetClassSlug: "magus",
                  sourceLabel: `${f.name} (Studious Spell)`,
                  tier: "studious",
                  countsTowardRepertoire: false
                });
              }
            }
          }
        }
        continue;
      }

      if (["force-fang", "runic-impression", "arcane-shroud"].includes(slug)) {
        const parsed = parseDirectFeatSpells(f, actorQualifiers);
        for (const r of parsed.auto) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: null,
            isCantrip: false,
            isFocus: true,
            unlockLevel: inferFeatAcquiredLevel(f, 2),
            targetSourceKey: magusFocusKey,
            targetClassSlug: "magus",
            sourceLabel: f.name,
            tier: "conflux",
            countsTowardRepertoire: false
          });
        }
      }
    }
  }

  // --- 8. ANIMIST: Embedded Apparitions (Vessel Focus Spells + Apparition Spontaneous Spells) ---
  if (hasClassOrDual("animist")) {
    const kind = classKind("animist");
    const animFocusKey = `focus:animist:${kind}`;
    const animAppKey = `class:animist:apparition:${kind}`;

    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      const hasVessel = /<(?:strong|b|h[1-6])[^>]*>\s*Vessel\s+Spell\s*[:<]/i.test(desc);
      const hasAppSpells = /<(?:strong|b|h[1-6])[^>]*>\s*Apparition\s+Spells?\s*[:<]/i.test(desc);
      if (!hasVessel && !hasAppSpells) continue;

      if (hasVessel) {
        const vHtml = extractNamedSectionHtml(desc, [/^vessel\s+spell$/i]);
        for (const r of extractSpellRefsFromText(vHtml)) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: null,
            isCantrip: false,
            isFocus: true,
            unlockLevel: 1,
            targetSourceKey: animFocusKey,
            targetClassSlug: "animist",
            sourceLabel: f.name,
            tier: "vessel",
            countsTowardRepertoire: false
          });
        }
      }

      if (hasAppSpells) {
        const aHtml = extractNamedSectionHtml(desc, [/^apparition\s+spells?$/i]);
        const parsed = parseRankedSpellSection(aHtml, actorQualifiers, {
          isCurriculum: false,
          targetSourceKey: animAppKey,
          targetClassSlug: "animist",
          sourceLabel: f.name,
          tier: "apparition",
          countsTowardRepertoire: false
        });
        for (const sp of parsed.autoSpells) pushAutoSpell(sp);
        choiceGroups.push(...parsed.choiceGroups);
      }
    }
  }

  // --- 9. DIRECT FOCUS-GRANTING FEATS & FEATURES (Champion, Bard, Cleric Domains, Druid, Summoner, Necromancer, Monk, Ranger, Archetypes & Generic) ---
  const addDirectFocusFeats = (slugSet, targetSourceKey, targetClassSlug, { sectionPatterns = null } = {}) => {
    const matched = feats.filter(f => slugSet.has(getItemSlug(f)));
    const resolvedFromSpecific = new Set();

    // Process specific feats first (e.g. `lay-on-hands` before generic `devotion-spells`!)
    const ordered = [...matched].sort((a, b) => {
      const aGen = /^(?:devotion-spells|composition-spells|order-spells|link-spells|grave-spells|qi-spells|warden-spells|initiate-warden|advanced-warden|masterful-warden)$/.test(getItemSlug(a)) ? 1 : 0;
      const bGen = /^(?:devotion-spells|composition-spells|order-spells|link-spells|grave-spells|qi-spells|warden-spells|initiate-warden|advanced-warden|masterful-warden)$/.test(getItemSlug(b)) ? 1 : 0;
      return aGen - bGen;
    });

    for (const f of ordered) {
      const slug = getItemSlug(f);
      const uLvl = inferFeatAcquiredLevel(f, 1);
      const fQuals = extractActorQualifiers(actor, f);
      const parsed = parseDirectFeatSpells(f, fQuals, { sectionPatterns });

      if (parsed.auto.length > 0) {
        for (const r of parsed.auto) {
          resolvedFromSpecific.add(r.uuid.toLowerCase());
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: r.isCantrip ? 0 : null,
            isCantrip: Boolean(r.isCantrip),
            isFocus: true,
            unlockLevel: uLvl,
            targetSourceKey,
            targetClassSlug,
            sourceLabel: f.name,
            tier: "feat",
            countsTowardRepertoire: false
          });
        }
      } else if (parsed.choice && parsed.choice.length > 0) {
        // Skip redundant generic choice if a specific sub-feat already resolved one of its options!
        const alreadySatisfied = parsed.choice.some(opt => resolvedFromSpecific.has(opt.uuid.toLowerCase()));
        if (!alreadySatisfied) {
          choiceGroups.push({
            id: `${targetSourceKey}:feat:${slug}`,
            targetSourceKey,
            targetClassSlug,
            sourceLabel: f.name,
            rank: 1,
            isCantrip: false,
            isFocus: true,
            isCurriculum: false,
            unlockLevel: uLvl,
            pickCount: 1,
            label: `${f.name} — Choose Focus Spell`,
            options: parsed.choice.map(r => ({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: r.isCantrip ? 0 : (r.baseRank || 1),
              isCantrip: Boolean(r.isCantrip),
              qualifier: r.qualifier || ""
            }))
          });
        }
      }
    }
  };

  // Champion Devotion & Domains
  if (hasClassOrDual("champion") || featBySlug.has("devotion-spells")) {
    const key = `focus:champion:${classKind("champion")}`;
    addDirectFocusFeats(new Set([
      "devotion-spells", "lay-on-hands", "touch-of-corruption", "touch-of-the-void", "touch-of-void",
      "shields-of-the-spirit", "litany-against-wrath", "litany-against-sloth", "litany-of-depravity",
      "litany-of-righteousness", "litany-of-self-interest", "litany-of-warding", "unimpeded-step"
    ]), key, "champion");
    for (const f of feats) {
      if (["deitys-domain", "deity-s-domain", "advanced-deitys-domain", "advanced-deity-s-domain", "domain-initiate", "expanded-domain-initiate", "advanced-domain"].includes(getItemSlug(f))) {
        pushDomainFeat(f, key, "champion");
      }
    }
  } else if (featBySlug.has("healing-touch") || featBySlug.has("devotion-spell")) {
    addDirectFocusFeats(new Set(["healing-touch", "devotion-spell"]), "focus:archetype:champion", "champion");
  }

  // Cleric Domains
  if (hasClassOrDual("cleric")) {
    const key = `focus:cleric:${classKind("cleric")}`;
    for (const f of feats) {
      if (["domain-initiate", "expanded-domain-initiate", "advanced-domain"].includes(getItemSlug(f))) {
        pushDomainFeat(f, key, "cleric");
      }
    }
  } else if (!hasClassOrDual("champion")) {
    for (const f of feats) {
      if (["domain-initiate", "expanded-domain-initiate", "advanced-domain"].includes(getItemSlug(f))) {
        pushDomainFeat(f, "focus:archetype:cleric", "cleric");
      }
    }
  }

  // Bard Composition Spells & Feats + Muse Granted Spell
  if (hasClassOrDual("bard") || featBySlug.has("composition-spells")) {
    const kind = classKind("bard");
    const key = `focus:bard:${kind}`;
    const bardSpellKey = `class:bard:${kind}`;
    const bardCompSlugs = new Set([
      "composition-spells", "counter-performance", "courageous-anthem", "inspire-courage",
      "lingering-composition", "hymn-of-healing", "uplifting-overture", "dirge-of-doom",
      "house-of-imaginary-walls", "soothing-ballad", "ode-to-ouroboros", "allegro",
      "fatal-aria", "symphony-of-the-unfettered-heart", "rallying-anthem", "song-of-strength",
      "fortissimo-composition", "triple-time", "song-of-marching", "soothing-mists",
      "martial-performance", "inspire-defense", "inspire-heroics"
    ]);
    // Also capture any Bard feat whose description grants a composition spell/cantrip dynamically,
    // plus any Bard Muse feature that grants a 1st-rank repertoire spell (e.g. Maestro -> Soothe, Enigma -> Sure Strike)
    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      const hasBardTrait = Array.isArray(f.system?.traits?.value) && f.system.traits.value.includes("bard");
      if (hasBardTrait && /(?:composition\s+(?:spell|cantrip)|focus\s+spell)/i.test(desc)) {
        bardCompSlugs.add(getItemSlug(f));
      }
      if (hasClassOrDual("bard") && (hasBardTrait || /muse/i.test(String(f.name || "")))) {
        const grantedMuseHtml = extractNamedSectionHtml(desc, [/^granted\s+spell$/i, /^muse\s+spell$/i]);
        if (grantedMuseHtml) {
          for (const r of extractSpellRefsFromText(grantedMuseHtml)) {
            pushAutoSpell({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: r.baseRank || 1,
              isCantrip: Boolean(r.isCantrip),
              isFocus: false,
              unlockLevel: 1,
              targetSourceKey: bardSpellKey,
              targetClassSlug: "bard",
              sourceLabel: f.name,
              tier: "gift",
              countsTowardRepertoire: false
            });
          }
        }
      }
    }
    addDirectFocusFeats(bardCompSlugs, key, "bard");
  }

  // Druid Order Spells
  if (hasClassOrDual("druid") || featBySlug.has("order-spells")) {
    const key = `focus:druid:${classKind("druid")}`;
    const druidSlugs = new Set([
      "order-spells", "order-magic", "advanced-elemental-spell", "untamed-form", "wild-shape",
      "tempest-surge", "goodberry", "cornucopia", "heal-animal", "wildfire", "crushing-ground",
      "rising-surf", "pulmonary-steed", "storm-born"
    ]);
    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      if (/<(?:strong|b|h[1-6])[^>]*>\s*Order\s+Spell\s*[:<]/i.test(desc)
        || (f.system?.traits?.value?.includes("druid") && /\border\s+spell\b/i.test(desc))) {
        druidSlugs.add(getItemSlug(f));
      }
    }
    addDirectFocusFeats(druidSlugs, key, "druid", { sectionPatterns: [/^order\s+spell$/i] });
  } else if (featBySlug.has("order-spell") || plannedFeatLevelsBySlug?.has("order-spell")) {
    const orderSpellUnlock = getFeatUnlockLevel(["order-spell"]);
    const archDruidSlugs = new Set(["order-spell"]);
    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      if (/<(?:strong|b|h[1-6])[^>]*>\s*Order\s+Spell\s*[:<]/i.test(desc)) {
        const orderSec = extractNamedSectionHtml(desc, [/^order\s+spell$/i]);
        for (const r of extractSpellRefsFromText(orderSec)) {
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: null,
            isCantrip: Boolean(r.isCantrip),
            isFocus: true,
            unlockLevel: orderSpellUnlock.level,
            targetSourceKey: "focus:archetype:druid",
            targetClassSlug: "druid",
            sourceLabel: f.name,
            tier: "order",
            countsTowardRepertoire: false
          });
        }
      }
    }
    addDirectFocusFeats(archDruidSlugs, "focus:archetype:druid", "druid", { sectionPatterns: [/^order\s+spell$/i] });
  }

  // Summoner Link Spells
  if (hasClassOrDual("summoner") || featBySlug.has("link-spells")) {
    const key = `focus:summoner:${classKind("summoner")}`;
    const sumSlugs = new Set(["link-spells", "evolution-surge", "boost-eidolon", "lifelink-surge", "extend-boost", "reinforce-eidolon", "protect-companion"]);
    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      if (f.system?.traits?.value?.includes("summoner") && /\blink\s+(?:spell|cantrip)\b/i.test(desc)) {
        sumSlugs.add(getItemSlug(f));
      }
    }
    addDirectFocusFeats(sumSlugs, key, "summoner");
  }

  // Necromancer Grave Spells
  if (hasClassOrDual("necromancer") || featBySlug.has("grave-spells")) {
    const key = `focus:necromancer:${classKind("necromancer")}`;
    const necroSlugs = new Set(["grave-spells", "create-thrall"]);
    for (const f of feats) {
      const desc = String(f.system?.description?.value || "");
      if (f.system?.traits?.value?.includes("necromancer") && /\bgrave\s+(?:spell|cantrip)\b/i.test(desc)) {
        necroSlugs.add(getItemSlug(f));
      }
    }
    addDirectFocusFeats(necroSlugs, key, "necromancer");
  }

  // Monk Qi Spells
  const monkQiSlugs = new Set([
    "qi-spells", "ki-strike", "inner-upheaval", "ki-rush", "qi-rush", "wholeness-of-body",
    "harmonize-self", "abundant-step", "wind-jump", "quivering-palm", "ki-blast", "qi-blast",
    "ki-form", "qi-form", "wronged-monks-wrath", "medusas-wrath", "ki-cutting-sight", "golden-body"
  ]);
  for (const f of feats) {
    const desc = String(f.system?.description?.value || "");
    if (f.system?.traits?.value?.includes("monk") && /\b(?:qi|ki)\s+spell\b/i.test(desc)) {
      monkQiSlugs.add(getItemSlug(f));
    }
  }
  if (feats.some(f => monkQiSlugs.has(getItemSlug(f)))) {
    const key = hasClassOrDual("monk") ? `focus:monk:${classKind("monk")}` : "focus:archetype:monk";
    addDirectFocusFeats(monkQiSlugs, key, "monk");
  }

  // Ranger Warden Spells
  const rangerWardenSlugs = new Set([
    "warden-spells", "initiate-warden", "advanced-warden", "masterful-warden",
    "gravity-weapon", "heal-companion", "magic-hide", "snare-hopping", "animal-feature",
    "soothing-mist", "terrain-transposition", "ephemeral-tracking", "enlarge-companion",
    "hunters-vision", "hunter-s-vision"
  ]);
  for (const f of feats) {
    const desc = String(f.system?.description?.value || "");
    if (f.system?.traits?.value?.includes("ranger") && /\bwarden\s+spell\b/i.test(desc)) {
      rangerWardenSlugs.add(getItemSlug(f));
    }
  }
  if (feats.some(f => rangerWardenSlugs.has(getItemSlug(f)))) {
    const key = hasClassOrDual("ranger") ? `focus:ranger:${classKind("ranger")}` : "focus:archetype:ranger";
    addDirectFocusFeats(rangerWardenSlugs, key, "ranger");
  }

  // Blessed One Dedication
  if (featBySlug.has("blessed-one-dedication")) {
    addDirectFocusFeats(new Set(["blessed-one-dedication"]), "focus:archetype:blessed-one", "blessed-one");
  }

  // Generic Focus-Granting Feats (matches `focus:feat:<slug>` or folded focus feats)
  const genericExclusions = /(?:^|-)(?:focus|wellspring|refocus|desperate-prayer|psi-strikes|psychic-dedication|conscious-mind|subconscious-mind|mercy|affliction-mercy|cruelty|covenant)(?:$|-)/;
  const genericGrantRe = /(?:you\s+(?:gain|learn|receive)|grants?\s+you|you\s+can\s+cast)\s+(?:the\s+)?[^.<]{0,80}\b(?:focus\s+spell|focus\s+pool)\b/i;
  for (const f of feats) {
    const slug = getItemSlug(f);
    if (genericExclusions.test(slug)) continue;
    const desc = String(f.system?.description?.value || "");
    if (!genericGrantRe.test(desc)) continue;
    // Skip if already captured under a specific class/archetype focus source
    const fRefs = parseDirectFeatSpells(f, extractActorQualifiers(actor, f));
    if (fRefs.auto.length === 0 && !fRefs.choice) continue;
    const alreadyCovered = fRefs.auto.some(r => Array.from(autoKeySet).some(k => k.endsWith(`|${r.uuid.toLowerCase()}`)));
    if (alreadyCovered) continue;

    // Route to matching generic key `focus:feat:<slug>` (and analyzeSpellcasting also matches by tradition fallback!)
    const targetKey = `focus:feat:${slug}`;
    const uLvl = inferFeatAcquiredLevel(f, 1);
    if (fRefs.auto.length > 0) {
      for (const r of fRefs.auto) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: r.isCantrip ? 0 : null,
          isCantrip: Boolean(r.isCantrip),
          isFocus: true,
          unlockLevel: uLvl,
          targetSourceKey: targetKey,
          targetClassSlug: slug,
          sourceLabel: f.name,
          tier: "feat",
          countsTowardRepertoire: false,
          fallbackTradition: (desc.match(/\b(arcane|divine|occult|primal)\b/i)?.[1] || "").toLowerCase()
        });
      }
    }
  }

  // Sort deterministically by unlockLevel -> rank -> name
  autoSpells.sort((a, b) =>
    (a.unlockLevel - b.unlockLevel)
    || ((a.rank ?? 0) - (b.rank ?? 0))
    || a.name.localeCompare(b.name)
  );
  choiceGroups.sort((a, b) =>
    (a.unlockLevel - b.unlockLevel)
    || ((a.rank ?? 0) - (b.rank ?? 0))
    || a.label.localeCompare(b.label)
  );

  return { autoSpells, choiceGroups, hasDeferredDomain };
}

/**
 * Checks if a discovered auto/choice spell is already present inside a spellcasting entry.
 */
function isSpellAlreadyInEntry(spellMeta, existingUuids, existingNames) {
  if (!spellMeta) return false;
  if (spellMeta.uuid && existingUuids.has(spellMeta.uuid.toLowerCase())) return true;
  if (spellMeta.name && !spellMeta.isDeferredDomain && existingNames.has(String(spellMeta.name).trim().toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Resolves a Foundry spell document cleanly from either an ID-based or name-based UUID.
 */
export async function resolveSpellDocumentByUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  const clean = uuid.trim();
  try {
    const doc = await fromUuid(clean);
    if (doc?.type === "spell") return doc;
  } catch { /* fallback below */ }

  let idxHit = lookupCompendiumIndexEntrySync(clean);
  if (!idxHit && clean.startsWith("Compendium.")) {
    const parts = clean.split(".");
    if (parts.length >= 4) {
      const packKey = `${parts[1]}.${parts[2]}`;
      const pack = game.packs?.get?.(packKey);
      if (pack && (!pack.index || pack.index.size === 0)) {
        try {
          await pack.getIndex();
          _packNameIndexCache.delete(packKey);
          idxHit = lookupCompendiumIndexEntrySync(clean);
        } catch { /* ignore */ }
      }
    }
  }
  if (idxHit?.canonicalUuid && idxHit.canonicalUuid !== clean) {
    try {
      const doc = await fromUuid(idxHit.canonicalUuid);
      if (doc?.type === "spell") return doc;
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Matches expected spellcasting sources 1-to-1 against existing `spellcastingEntry` items on the actor,
 * compares slots & spell counts, and identifies missing entries, outdated slots, and missing auto-granted / focus spells.
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

  // Dynamically discover all auto-granted subclass, deity, font & focus spells from live PF2e items
  const grantedProg = collectActorGrantedSpellsProgression(actor, dualInfo);
  if (grantedProg.hasDeferredDomain && !_domainSpellCache && !_domainSpellCachePromise) {
    warmDomainSpellCache().catch(() => {});
  }

  // Re-map any generic `focus:feat:*` spells folded into an existing same-tradition focus source
  const sourceKeysSet = new Set(expectedSources.map(s => s.key));
  for (const sp of grantedProg.autoSpells) {
    if (!sourceKeysSet.has(sp.targetSourceKey) && sp.isFocus && sp.fallbackTradition) {
      const folded = expectedSources.find(s => s.isFocus && s.tradition === sp.fallbackTradition);
      if (folded) sp.targetSourceKey = folded.key;
    }
  }

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
  let entriesNeedingAutoSpellsCount = 0;
  let totalMissingAutoSpells = 0;
  let totalExpectedCantrips = 0;
  let totalCurrentCantrips = 0;
  let totalExpectedSlots = 0;
  let totalCurrentSlots = 0;

  for (const src of expectedSources) {
    const entry = matchedPairs.get(src.key) || null;
    totalExpectedCantrips += src.cantrips;
    totalExpectedSlots += src.totalLeveledSlots;

    const unlockedAutoSpells = grantedProg.autoSpells.filter(sp =>
      sp.targetSourceKey === src.key && sp.unlockLevel <= level
    );
    const unlockedChoiceGroups = grantedProg.choiceGroups.filter(g =>
      g.targetSourceKey === src.key && g.unlockLevel <= level
    );

    if (!entry) {
      missingEntryCount++;
      totalMissingAutoSpells += unlockedAutoSpells.length;
      const pendingChoiceGroups = unlockedChoiceGroups.map(g => ({
        ...g,
        pickedCount: 0,
        remainingCount: g.pickCount,
        options: g.options.map(o => ({ ...o, alreadyKnown: false }))
      }));
      const autoHint = unlockedAutoSpells.length > 0
        ? ` — will auto-add ${unlockedAutoSpells.length} spell${unlockedAutoSpells.length === 1 ? "" : "s"} (${unlockedAutoSpells.slice(0, 3).map(s => s.name).join(", ")}${unlockedAutoSpells.length > 3 ? ` +${unlockedAutoSpells.length - 3}` : ""})`
        : "";
      items.push({
        ...src,
        expectedFocusSpells: src.isFocus ? Math.max(src.expectedFocusSpells || 1, unlockedAutoSpells.length) : src.expectedFocusSpells,
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
        unlockedAutoSpells,
        missingAutoSpells: unlockedAutoSpells,
        missingAutoSpellsCount: unlockedAutoSpells.length,
        hasMissingAutoSpells: unlockedAutoSpells.length > 0,
        missingAutoSpellsText: unlockedAutoSpells.map(s => s.name).join(", "),
        pendingChoiceGroups,
        hasPendingChoices: pendingChoiceGroups.length > 0,
        spellsMissingNote: (src.isFocus
          ? "Create this Focus spellcasting entry and add your focus spell(s)"
          : "Create this spellcasting entry to add slots & spells") + autoHint
      });
      issues.push({
        severity: "critical",
        category: "Spellcasting",
        title: `Missing Spellcasting Entry: ${src.title}`,
        detail: `${src.sourceBadge} · ${CASTING_TYPE_LABELS[src.castingType] || src.castingType} ${TRADITION_LABELS[src.tradition] || "(choose tradition)"} · ${src.isFocus ? src.slotsSummary : `Expected ${src.cantrips > 0 ? `${src.cantrips} cantrips & ` : ""}${src.slotsSummary}`}.${autoHint}`
      });
      continue;
    }

    // Entry exists! Count its current spells & compare against dynamically discovered auto-granted spells
    const entrySpells = allSpells.filter(s => s.system?.location?.value === entry.id);
    const existingUuids = new Set();
    const existingNames = new Set();
    for (const sp of entrySpells) {
      const cSrc = sp._stats?.compendiumSource || sp.flags?.core?.sourceId;
      if (typeof cSrc === "string" && cSrc.trim()) existingUuids.add(cSrc.trim().toLowerCase());
      if (sp.name) existingNames.add(String(sp.name).trim().toLowerCase());
    }

    const missingAutoSpells = unlockedAutoSpells.filter(sp => !isSpellAlreadyInEntry(sp, existingUuids, existingNames));

    // For Cleric Divine Font: check whether the chosen Heal / Harm spell is already prepared in all fontRank slots!
    let needsFontPrepare = false;
    let preparedFontCount = 0;
    if (src.isDivineFont && src.divineFontChoice && src.divineFontRank > 0 && src.divineFontCount > 0) {
      const targetSlot = entry.system?.slots?.[`slot${src.divineFontRank}`];
      const prepList = Array.isArray(targetSlot?.prepared)
        ? targetSlot.prepared
        : (targetSlot?.prepared && typeof targetSlot.prepared === "object" ? Object.values(targetSlot.prepared) : []);
      const desiredLower = src.divineFontChoice === "harm" ? "harm" : "heal";
      const hasVersatileFont = actorHasFeatSlug(actor, ["versatile-font"]);
      const matchingFontIds = new Set(
        entrySpells
          .filter(sp => {
            const spSlug = normalizeSlug(sp.slug || sp.system?.slug || sp.name);
            return hasVersatileFont ? (spSlug === "heal" || spSlug === "harm") : spSlug === desiredLower;
          })
          .map(sp => sp.id)
      );
      preparedFontCount = prepList.filter(slot => slot?.id && matchingFontIds.has(slot.id)).length;

      let hasStalePrepared = false;
      for (let r = 1; r <= 10; r++) {
        if (r === src.divineFontRank) continue;
        const otherPrep = entry.system?.slots?.[`slot${r}`]?.prepared;
        const otherList = Array.isArray(otherPrep)
          ? otherPrep
          : (otherPrep && typeof otherPrep === "object" ? Object.values(otherPrep) : []);
        if (otherList.some(slot => Boolean(slot?.id))) {
          hasStalePrepared = true;
          break;
        }
      }
      needsFontPrepare = preparedFontCount < src.divineFontCount || hasStalePrepared;
    }

    if (missingAutoSpells.length > 0 || needsFontPrepare) {
      entriesNeedingAutoSpellsCount++;
      totalMissingAutoSpells += missingAutoSpells.length;
    }

    const pendingChoiceGroups = unlockedChoiceGroups
      .map(g => {
        const options = g.options.map(o => ({
          ...o,
          alreadyKnown: isSpellAlreadyInEntry(o, existingUuids, existingNames)
        }));
        const pickedCount = options.filter(o => o.alreadyKnown).length;
        const remainingCount = Math.max(0, g.pickCount - pickedCount);
        return { ...g, options, pickedCount, remainingCount };
      })
      .filter(g => g.remainingCount > 0);

    // Special evaluation path for Focus Spellcasting entries (no daily slots — tracks Focus Spells)
    if (src.isFocus || src.castingType === "focus") {
      const currentFocusSpells = entrySpells.length;
      const expectedFocusSpells = Math.max(1, Number(src.expectedFocusSpells || 1), unlockedAutoSpells.length);
      const missingFocus = Math.max(0, expectedFocusSpells - currentFocusSpells);

      const hasMissing = missingFocus > 0 || missingAutoSpells.length > 0;
      const status = hasMissing ? "incomplete" : "complete";
      const statusLabel = missingAutoSpells.length > 0
        ? `Add ${missingAutoSpells.length} Focus Spell${missingAutoSpells.length === 1 ? "" : "s"}`
        : (missingFocus > 0 ? "Needs Spells" : "Ready");

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
        unlockedAutoSpells,
        missingAutoSpells,
        missingAutoSpellsCount: missingAutoSpells.length,
        hasMissingAutoSpells: missingAutoSpells.length > 0,
        missingAutoSpellsText: missingAutoSpells.map(s => s.name).join(", "),
        pendingChoiceGroups,
        hasPendingChoices: pendingChoiceGroups.length > 0,
        spellsMissingNote: missingAutoSpells.length > 0
          ? `Auto-add available: ${missingAutoSpells.map(s => s.name).join(", ")}`
          : (missingFocus > 0
            ? `Add ${missingFocus} focus spell${missingFocus === 1 ? "" : "s"} to "${entry.name}"`
            : `${currentFocusSpells} focus spell(s) configured`)
      });

      if (hasMissing) {
        issues.push({
          severity: "info",
          category: "Spellcasting",
          title: missingAutoSpells.length > 0
            ? `${entry.name}: ${missingAutoSpells.length} focus spell${missingAutoSpells.length === 1 ? "" : "s"} ready to auto-add`
            : `${entry.name}: ${missingFocus} focus spell${missingFocus === 1 ? "" : "s"} missing`,
          detail: missingAutoSpells.length > 0
            ? `Detected from PF2e features: ${missingAutoSpells.map(s => s.name).join(", ")} (${currentFocusSpells}/${expectedFocusSpells} in entry).`
            : `Focus spells in entry: ${currentFocusSpells}/${expectedFocusSpells} · ${src.expectedSpellsNote}`
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
    } else if (missingAutoSpells.length > 0) {
      status = "incomplete";
      statusLabel = `${missingAutoSpells.length} Auto Spell${missingAutoSpells.length === 1 ? "" : "s"}`;
    } else if (needsFontPrepare) {
      status = "incomplete";
      statusLabel = `Prepare ${src.divineFontCount}× ${src.divineFontSpellName}`;
    } else if (missingCantrips > 0 || missingRepertoire > 0 || pendingChoiceGroups.length > 0) {
      status = "incomplete";
      statusLabel = "Needs Spells";
    }

    const missingParts = [];
    if (missingAutoSpells.length > 0) {
      missingParts.push(`${missingAutoSpells.length} auto-granted (${missingAutoSpells.slice(0, 2).map(s => s.name).join(", ")}${missingAutoSpells.length > 2 ? ` +${missingAutoSpells.length - 2}` : ""})`);
    }
    if (needsFontPrepare) {
      missingParts.push(`${preparedFontCount}/${src.divineFontCount} Rank ${src.divineFontRank} ${src.divineFontSpellName} slots prepared`);
    }
    if (missingCantrips > 0) missingParts.push(`${missingCantrips} cantrip${missingCantrips === 1 ? "" : "s"}`);
    if (src.repertoireExpected != null && missingRepertoire > 0) {
      missingParts.push(`${missingRepertoire} repertoire spell${missingRepertoire === 1 ? "" : "s"}`);
    } else if (src.totalLeveledSlots > 0 && currentLeveledSpells === 0 && missingAutoSpells.length === 0) {
      missingParts.push(`no leveled spells added yet`);
    }
    if (pendingChoiceGroups.length > 0) {
      const totalChoicePicks = pendingChoiceGroups.reduce((sum, g) => sum + g.remainingCount, 0);
      missingParts.push(`${totalChoicePicks} curriculum/subclass pick${totalChoicePicks === 1 ? "" : "s"}`);
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
      unlockedAutoSpells,
      missingAutoSpells,
      missingAutoSpellsCount: missingAutoSpells.length,
      hasMissingAutoSpells: missingAutoSpells.length > 0,
      missingAutoSpellsText: missingAutoSpells.map(s => s.name).join(", "),
      needsFontPrepare,
      preparedFontCount,
      pendingChoiceGroups,
      hasPendingChoices: pendingChoiceGroups.length > 0,
      spellsMissingNote: missingParts.length > 0 ? `Missing ${missingParts.join(" · ")}` : "Spells & slots look good"
    });

    if (slotsOutdated) {
      issues.push({
        severity: "warning",
        category: "Spellcasting",
        title: `Spell Slots Outdated: ${entry.name}`,
        detail: `Level ${level} expects ${src.slotsSummary} (diffs: ${slotDiffs.map(d => `${d.label} ${d.current}→${d.expected}`).join(", ")}).${missingAutoSpells.length > 0 ? ` Also ${missingAutoSpells.length} auto-granted spell(s) ready to add.` : ""}`
      });
    } else if (missingAutoSpells.length > 0 || needsFontPrepare || missingCantrips > 0 || missingRepertoire > 0 || pendingChoiceGroups.length > 0) {
      issues.push({
        severity: "info",
        category: "Spellcasting",
        title: `${entry.name}: ${missingParts.join(" · ")}`,
        detail: needsFontPrepare
          ? `Divine Font (${src.divineFontSpellName}): ${preparedFontCount}/${src.divineFontCount} Rank ${src.divineFontRank} slots prepared — click Sync to prepare automatically.`
          : `Cantrips: ${currentCantrips}/${src.cantrips} · Leveled spells added: ${currentLeveledSpells}${src.repertoireExpected != null ? `/${src.repertoireExpected}` : ""}${missingAutoSpells.length > 0 ? ` · Ready to auto-add: ${missingAutoSpells.map(s => s.name).join(", ")}` : ""}.`
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
    entriesNeedingAutoSpellsCount,
    totalMissingAutoSpells,
    needsActionCount: missingEntryCount + outdatedSlotCount + entriesNeedingAutoSpellsCount,
    totalExpectedCantrips,
    totalCurrentCantrips,
    totalExpectedSlots,
    totalCurrentSlots,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 7. CREATE / SYNC SPELLCASTING ENTRIES & AUTO-GRANTED SPELLS ON ACTOR      */
/* ------------------------------------------------------------------------- */

/**
 * Resolves and embeds any missing dynamically-discovered auto-granted or focus spells
 * into the target `spellcastingEntry` on the actor (skipping duplicates safely).
 *
 * @param {Actor} actor
 * @param {string} entryId
 * @param {object} spec
 * @returns {Promise<{ addedNames: string[], addedCount: number }>}
 */
export async function syncAutoGrantedSpellsForEntry(actor, entryId, spec) {
  if (!actor || !entryId || !spec) return { addedNames: [], addedCount: 0 };
  const entry = actor.items?.get(entryId);
  if (!entry || entry.type !== "spellcastingEntry") return { addedNames: [], addedCount: 0 };

  const level = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
  const candidates = Array.isArray(spec.unlockedAutoSpells)
    ? spec.unlockedAutoSpells
    : collectActorGrantedSpellsProgression(actor, getActorDualClassInfo(actor, getActiveVariantRules()))
      .autoSpells.filter(sp => sp.targetSourceKey === spec.key && sp.unlockLevel <= level);

  if (candidates.length === 0) {
    const preparedFont = spec.isDivineFont ? await prepareDivineFontSlots(actor, entryId, spec) : null;
    return { addedNames: [], addedCount: 0, preparedFont };
  }

  // Ensure dynamic PF2e domain journal lookup is warm if any candidate is a deferred Domain spell
  if (candidates.some(c => c.domainSlug && !c.uuid)) {
    await warmDomainSpellCache();
  }

  const isFocusEntry = entry.system?.prepared?.value === "focus" || Boolean(spec.isFocus);
  const existingSpells = (actor.itemTypes?.spell || []).filter(s => s.system?.location?.value === entryId);
  const existingUuids = new Set();
  const existingNames = new Set();
  for (const sp of existingSpells) {
    const cSrc = sp._stats?.compendiumSource || sp.flags?.core?.sourceId;
    if (typeof cSrc === "string" && cSrc.trim()) existingUuids.add(cSrc.trim().toLowerCase());
    if (sp.name) existingNames.add(String(sp.name).trim().toLowerCase());
  }

  const toCreate = [];
  const addedNames = [];

  for (const cand of candidates) {
    let targetUuid = cand.uuid;
    if (!targetUuid && cand.domainSlug) {
      const domainRec = _domainSpellCache?.get(cand.domainSlug);
      targetUuid = domainRec?.[cand.domainTier || "initial"]?.uuid || null;
    }
    if (!targetUuid) continue;
    if (existingUuids.has(targetUuid.toLowerCase())) continue;

    try {
      const doc = await resolveSpellDocumentByUuid(targetUuid);
      if (!doc || doc.type !== "spell") continue;

      const resolvedUuid = doc.uuid || targetUuid;
      const docNameLower = String(doc.name || "").trim().toLowerCase();
      if (existingUuids.has(resolvedUuid.toLowerCase()) || existingNames.has(docNameLower)) continue;

      // Verify Focus vs Daily-slot compatibility against live PF2e spell traits
      const traits = Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [];
      const docTraditions = Array.from(doc.system?.traits?.traditions || doc.system?.traditions?.value || []);
      const docIsCantrip = Boolean(doc.isCantrip || traits.includes("cantrip"));
      const docIsPureFocus = Boolean(doc.isFocusSpell || doc.isFocus || traits.includes("focus")) && !docIsCantrip;
      const docIsFocusCompatible = Boolean(
        doc.isFocusSpell || doc.isFocus || traits.includes("focus")
        || traits.includes("composition") || traits.includes("hex")
        || traits.includes("eidolon") || (docIsCantrip && docTraditions.length === 0)
      );

      if (isFocusEntry && !docIsFocusCompatible) continue;
      if (!isFocusEntry && docIsPureFocus) continue;

      const obj = doc.toObject();
      delete obj._id;
      obj._stats = obj._stats || {};
      obj._stats.compendiumSource = resolvedUuid;
      obj.system = obj.system || {};
      obj.system.location = { ...(obj.system.location || {}), value: entryId };

      // Heighten if subclass/deity explicitly grants a lower-rank spell at a higher rank
      const baseRank = Number(obj.system?.level?.value ?? 1);
      if (!isFocusEntry && !spec.isDivineFont && !docIsCantrip && Number(cand.rank) > baseRank) {
        obj.system.location.heightenedLevel = Number(cand.rank);
      }

      toCreate.push(obj);
      addedNames.push(doc.name);
      existingUuids.add(resolvedUuid.toLowerCase());
      existingNames.add(docNameLower);
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed resolving auto-granted spell "${cand.name}" (${targetUuid}):`, err);
    }
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", toCreate);
  }

  // Auto-prepare Cleric Divine Font (Heal / Harm) into all highest-rank Font slots!
  let preparedFont = null;
  if (spec.isDivineFont) {
    preparedFont = await prepareDivineFontSlots(actor, entryId, spec);
  }

  return { addedNames, addedCount: addedNames.length, preparedFont };
}

/**
 * Automatically prepares the Cleric's chosen Divine Font spell (`Heal` or `Harm`) into all
 * highest-rank Font slots (preserving any already-expended slots at the current rank and clearing
 * stale lower-rank prepared slots after a level-up).
 */
async function prepareDivineFontSlots(actor, entryId, spec) {
  if (!actor || !entryId || !spec?.isDivineFont) return null;
  const entry = actor.items?.get(entryId);
  if (!entry || entry.type !== "spellcastingEntry") return null;
  if (entry.system?.prepared?.value !== "prepared") return null;

  const fontChoice = spec.divineFontChoice || detectClericDivineFontChoice(actor);
  if (!fontChoice) return null;

  const level = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
  const fontRank = Math.max(1, Math.min(10, Number(spec.divineFontRank || Math.ceil(level / 2))));
  const fontCount = Math.max(1, Number(spec.divineFontCount || spec.slots?.[fontRank] || (level >= 19 ? 6 : (level >= 15 ? 5 : 4))));
  const desiredLower = fontChoice === "harm" ? "harm" : "heal";
  const fontSpellTitle = fontChoice === "harm" ? "Harm" : "Heal";
  const hasVersatileFont = actorHasFeatSlug(actor, ["versatile-font"]);
  const entrySpells = (actor.itemTypes?.spell || []).filter(sp => sp.system?.location?.value === entryId);
  const fontSpellDoc = entrySpells.find(sp => normalizeSlug(sp.slug || sp.system?.slug || sp.name) === desiredLower);
  if (!fontSpellDoc) return null;

  const validFontIds = new Set(
    entrySpells
      .filter(sp => {
        const spSlug = normalizeSlug(sp.slug || sp.system?.slug || sp.name);
        return hasVersatileFont ? (spSlug === "heal" || spSlug === "harm") : spSlug === desiredLower;
      })
      .map(sp => sp.id)
  );

  const makeDeleteOp = () => (typeof foundry?.data?.operators?.ForcedDeletion === "function"
    ? new foundry.data.operators.ForcedDeletion()
    : { id: null, expended: false });

  const prepUpdates = {};
  let changed = false;

  // 1. Fill all `fontCount` slots at `fontRank` (preserving existing expended state on matching slots)
  const curTargetSlot = entry.system?.slots?.[`slot${fontRank}`];
  const curPrepared = curTargetSlot?.prepared;
  const useObjectShape = Boolean(curPrepared && typeof curPrepared === "object" && !Array.isArray(curPrepared));

  if (useObjectShape) {
    const nextObj = {};
    for (let i = 0; i < fontCount; i++) {
      const existing = curPrepared[String(i)] ?? curPrepared[i];
      if (existing?.id && validFontIds.has(existing.id)) {
        nextObj[i] = { ...existing };
      } else {
        nextObj[i] = { id: fontSpellDoc.id, expended: false };
        changed = true;
      }
    }
    for (const k of Object.keys(curPrepared)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= fontCount) {
        nextObj[k] = makeDeleteOp();
        changed = true;
      }
    }
    if (changed) prepUpdates[`system.slots.slot${fontRank}.prepared`] = nextObj;
  } else {
    const curArr = Array.isArray(curPrepared) ? curPrepared : [];
    const nextArr = [];
    for (let i = 0; i < fontCount; i++) {
      const existing = curArr[i];
      if (existing?.id && validFontIds.has(existing.id)) {
        nextArr.push({ ...existing });
      } else {
        nextArr.push({ id: fontSpellDoc.id, expended: false });
        changed = true;
      }
    }
    if (curArr.length !== fontCount) changed = true;
    if (changed) prepUpdates[`system.slots.slot${fontRank}.prepared`] = nextArr;
  }

  // 2. Clear stale prepared slots on zeroed ranks (e.g. Rank 1 slots after leveling up to Lv 3 / Rank 2)
  for (let r = 1; r <= 10; r++) {
    if (r === fontRank) continue;
    if (Number(spec.slots?.[r] || 0) > 0) continue;
    const otherPrep = entry.system?.slots?.[`slot${r}`]?.prepared;
    const otherList = Array.isArray(otherPrep)
      ? otherPrep
      : (otherPrep && typeof otherPrep === "object" ? Object.values(otherPrep) : []);
    if (otherList.some(s => Boolean(s?.id))) {
      if (Array.isArray(otherPrep)) {
        prepUpdates[`system.slots.slot${r}.prepared`] = [];
      } else if (otherPrep && typeof otherPrep === "object") {
        const cleared = {};
        for (const k of Object.keys(otherPrep)) {
          cleared[k] = makeDeleteOp();
        }
        prepUpdates[`system.slots.slot${r}.prepared`] = cleared;
      }
      changed = true;
    }
  }

  if (Object.keys(prepUpdates).length > 0) {
    try {
      await entry.update(prepUpdates);
    } catch (err) {
      console.warn("PF2e Awesome GM Utilities | Atomic Divine Font preparation update failed, trying native prepareSpell fallback:", err);
      changed = false;
    }
  }

  // 3. Fallback verification via PF2e's native `entry.spells.prepareSpell` if any slot remained empty
  const liveAfter = entry.system?.slots?.[`slot${fontRank}`]?.prepared;
  const liveArr = Array.isArray(liveAfter)
    ? liveAfter
    : (liveAfter && typeof liveAfter === "object" ? Object.values(liveAfter) : []);
  const filledAfter = liveArr.filter(s => s?.id && validFontIds.has(s.id)).length;
  if (filledAfter < fontCount && typeof entry.spells?.prepareSpell === "function") {
    for (let i = 0; i < fontCount; i++) {
      const slotEntry = Array.isArray(liveAfter) ? liveAfter[i] : (liveAfter?.[String(i)] ?? liveAfter?.[i]);
      if (slotEntry?.id && validFontIds.has(slotEntry.id)) continue;
      try {
        await entry.spells.prepareSpell(fontSpellDoc, fontRank, i);
        changed = true;
      } catch (err) {
        console.warn(`PF2e Awesome GM Utilities | Fallback prepareSpell failed for Divine Font slot ${i}:`, err);
      }
    }
  }

  return changed
    ? { count: fontCount, rank: fontRank, spellName: fontSpellDoc.name || fontSpellTitle }
    : null;
}

/**
 * Embeds a single spell (e.g. a 1-click Wizard Curriculum or Subclass choice) into a spellcasting entry.
 *
 * @param {Actor} actor
 * @param {string} entryId
 * @param {string} uuid
 * @param {{ rank?: number|null }} [options]
 * @returns {Promise<Item|null>}
 */
export async function addSingleSpellToEntry(actor, entryId, uuid, { rank = null } = {}) {
  if (!actor || !entryId || !uuid) return null;
  const entry = actor.items?.get(entryId);
  if (!entry || entry.type !== "spellcastingEntry") return null;

  const doc = await resolveSpellDocumentByUuid(uuid);
  if (!doc || doc.type !== "spell") return null;

  const resolvedUuid = doc.uuid || uuid;
  const docNameLower = String(doc.name || "").trim().toLowerCase();
  const duplicate = (actor.itemTypes?.spell || []).some(existing =>
    existing.system?.location?.value === entryId
    && (
      String(existing._stats?.compendiumSource || existing.flags?.core?.sourceId || "").toLowerCase() === resolvedUuid.toLowerCase()
      || String(existing.name || "").trim().toLowerCase() === docNameLower
    )
  );
  if (duplicate) return null;

  const obj = doc.toObject();
  delete obj._id;
  obj._stats = obj._stats || {};
  obj._stats.compendiumSource = resolvedUuid;
  obj.system = obj.system || {};
  obj.system.location = { ...(obj.system.location || {}), value: entryId };

  const traits = Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [];
  const docIsCantrip = Boolean(doc.isCantrip || traits.includes("cantrip"));
  const baseRank = Number(obj.system?.level?.value ?? 1);
  if (entry.system?.prepared?.value !== "focus" && !docIsCantrip && Number(rank) > baseRank) {
    obj.system.location.heightenedLevel = Number(rank);
  }

  const created = await actor.createEmbeddedDocuments("Item", [obj]);
  return created?.[0] || null;
}

/**
 * Create a new PF2e `spellcastingEntry` embedded item on the actor with exact
 * casting type, tradition, key ability, level-appropriate spell slots, and any
 * dynamically discovered auto-granted / focus spells.
 *
 * @param {Actor} actor
 * @param {object} spec - Source spec from `analyzeCharacter(actor).spellcasting.sources`
 * @param {{ tradition?: string, ability?: string, name?: string, autoAddSpells?: boolean, resultOut?: object }} [overrides]
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
  const createdEntry = created?.[0] || null;

  if (createdEntry && overrides.autoAddSpells !== false) {
    try {
      const spellRes = await syncAutoGrantedSpellsForEntry(actor, createdEntry.id, spec);
      if (overrides.resultOut && typeof overrides.resultOut === "object") {
        overrides.resultOut.addedSpells = spellRes.addedNames;
        overrides.resultOut.preparedFont = spellRes.preparedFont || null;
      }
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed auto-adding spells to "${createdEntry.name}":`, err);
    }
  }

  return createdEntry;
}

/**
 * Updates an existing PF2e `spellcastingEntry`'s slot maximums to match the character's current level
 * without wiping any prepared spells, and optionally auto-adds missing focus / subclass / deity spells.
 *
 * @param {Actor} actor
 * @param {string} entryId
 * @param {object} spec
 * @param {{ includeAutoSpells?: boolean, resultOut?: object }} [options]
 * @returns {Promise<boolean>}
 */
export async function syncSpellcastingEntrySlots(actor, entryId, spec, { includeAutoSpells = true, resultOut = null } = {}) {
  if (!actor || !entryId || !spec) return false;
  const entry = actor.items?.get(entryId);
  if (!entry || entry.type !== "spellcastingEntry") return false;

  const castingType = entry.system?.prepared?.value || spec.castingType || "prepared";
  const updates = {};

  if (castingType !== "focus" && !spec.isFocus) {
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
  }

  const hasSlotUpdates = Object.keys(updates).length > 0;

  if (!entry.flags?.[MODULE_ID]?.spellSourceKey && spec.key) {
    updates[`flags.${MODULE_ID}.spellSourceKey`] = spec.key;
  }

  let slotsChanged = false;
  if (Object.keys(updates).length > 0) {
    await entry.update(updates);
    slotsChanged = hasSlotUpdates;
  }

  let addedSpells = [];
  let preparedFont = null;
  if (includeAutoSpells) {
    try {
      const spellRes = await syncAutoGrantedSpellsForEntry(actor, entryId, spec);
      addedSpells = spellRes.addedNames;
      preparedFont = spellRes.preparedFont || null;
    } catch (err) {
      console.warn(`PF2e Awesome GM Utilities | Failed syncing auto-granted spells for "${entry.name}":`, err);
    }
  }

  if (resultOut && typeof resultOut === "object") {
    resultOut.slotsChanged = slotsChanged;
    resultOut.addedSpells = addedSpells;
    resultOut.preparedFont = preparedFont;
  }

  return slotsChanged || addedSpells.length > 0 || Boolean(preparedFont);
}

/**
 * Creates all missing spellcasting entries, syncs outdated spell slots, AND auto-adds
 * dynamically discovered focus / subclass / deity spells (plus prepares Cleric Divine Font slots).
 *
 * @param {Actor} actor
 * @returns {Promise<{ created: string[], synced: string[], addedSpells: string[], preparedFonts: string[], skippedNeedsTradition: string[] }>}
 */
export async function createOrSyncAllSpellcastingEntries(actor) {
  const analysis = analyzeCharacter(actor);
  const created = [];
  const synced = [];
  const addedSpells = [];
  const preparedFonts = [];
  const skippedNeedsTradition = [];

  if (!analysis) return { created, synced, addedSpells, preparedFonts, skippedNeedsTradition };

  for (const src of analysis.spellcasting.sources) {
    if (!src.entryExists) {
      if (src.traditionMissing && !src.tradition) {
        skippedNeedsTradition.push(src.title);
        continue;
      }
      const resOut = {};
      const doc = await createSpellcastingEntry(actor, src, { resultOut: resOut });
      if (doc) created.push(doc.name);
      if (Array.isArray(resOut.addedSpells) && resOut.addedSpells.length > 0) {
        addedSpells.push(...resOut.addedSpells);
      }
      if (resOut.preparedFont) {
        preparedFonts.push(`${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
      }
    } else if ((src.slotsOutdated || src.hasMissingAutoSpells || src.needsFontPrepare) && src.entryId) {
      const resOut = {};
      const ok = await syncSpellcastingEntrySlots(actor, src.entryId, src, { includeAutoSpells: true, resultOut: resOut });
      if (ok && resOut.slotsChanged) synced.push(src.matchedEntryName || src.title);
      if (Array.isArray(resOut.addedSpells) && resOut.addedSpells.length > 0) {
        addedSpells.push(...resOut.addedSpells);
      }
      if (resOut.preparedFont) {
        preparedFonts.push(`${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
      }
    }
  }

  return { created, synced, addedSpells, preparedFonts, skippedNeedsTradition };
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
