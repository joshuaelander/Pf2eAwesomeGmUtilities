/**
 * PF2e Awesome GM Utilities - PF2e Spellcasting Rules, Class/Archetype Quirks & Auto-Spell Discovery
 *
 * Isolates all PF2e-specific spellcasting progression tables, class/subclass/archetype rules
 * (Wizard Arcane Schools, Elementalist, Runelord, Flexible Spellcaster, Wellspring Mage,
 * Battle Harbinger, Animist, Psychic Conscious Mind, Druid Order Explorer/Order Magic,
 * Cleric Divine Font, Hedge Mage, Multiclass/Free Archetype spellcasting, and Focus Spellcasting),
 * plus zero-hardcode dynamic auto-granted spell & focus spell discovery from live PF2e actor items
 * and compendiums.
 *
 * Shared by both `character-checker-engine.js` and `level-planner-engine.js` with zero circular imports.
 */

export const VARIANT_RULES_MODULE_ID = "pf2e-awesome-variant-rules";

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

export const SPELLBOOK_CLASS_SLUGS = new Set(["wizard", "witch", "magus"]);
export const SPELLBOOK_ARCHETYPE_SLUGS = new Set(["wizard", "witch", "magus", "hedge-mage"]);

/* ------------------------------------------------------------------------- */
/* 1. SHARED PURE NORMALIZATION & ITEM HELPERS                               */
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

export function getItemSlug(item) {
  return normalizeSlug(item?.slug || item?.system?.slug || item?.name || "");
}

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Checks if a feat with any of the provided slugs exists on the actor.
 */
export function actorHasFeatSlug(actor, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return false;
  const targetSet = new Set(slugs.map(normalizeSlug));
  return (actor.itemTypes?.feat || []).some(f => targetSet.has(getItemSlug(f)));
}

/**
 * Finds the first matching feat document on the actor by predicate.
 */
export function findActorFeat(actor, predicate) {
  return (actor.itemTypes?.feat || []).find(predicate) || null;
}

/**
 * Remaster Player Core Cleric Divine Font slot progression:
 * 4 slots at Lv 1–4, 5 slots at Lv 5–14, 6 slots at Lv 15–20.
 */
export function getClericDivineFontCount(level) {
  const lvl = Math.max(1, Number(level || 1));
  return lvl >= 15 ? 6 : (lvl >= 5 ? 5 : 4);
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

export function countTotalLeveledSlots(slots) {
  let total = 0;
  for (let r = 1; r <= 10; r++) {
    total += Number(slots?.[r] || 0);
  }
  return total;
}

/* ------------------------------------------------------------------------- */
/* 2. CLASS ARCHETYPE & SUBCLASS RECOGNITION HELPERS                         */
/* ------------------------------------------------------------------------- */

/**
 * Matches Elementalist class-archetype features & dedication feats, including parenthetical
 * or suffixed variants such as "Elemental Philosophy (Fire)".
 */
function isElementalistClassFeature(feat) {
  if (!feat) return false;
  const slug = getItemSlug(feat);
  if (
    slug === "elementalist"
    || slug === "elementalist-dedication"
    || slug === "elemental-magic"
    || slug === "elemental-philosophy"
    || /^elemental-(?:magic|philosophy)-/.test(slug)
  ) {
    return true;
  }
  const name = String(feat.name || "");
  return /^elemental\s+(?:magic|philosophy)\b|^elementalist(?:\s+dedication)?$/i.test(name);
}

/**
 * Detects whether an actor has taken the PF2e Elementalist class archetype (Rage of Elements / Secrets of Magic).
 */
export function hasElementalistArchetype(feats, featSlugs) {
  if (
    featSlugs.has("elementalist")
    || featSlugs.has("elementalist-dedication")
    || featSlugs.has("elemental-magic")
    || featSlugs.has("elemental-philosophy")
  ) {
    return true;
  }
  return feats.some(isElementalistClassFeature);
}

/**
 * Resolves the canonical Arcane or Primal tradition for an Elementalist caster deterministically
 * (Primary Class before Dual Class, strictly restricted to Arcane/Primal so Divine/Occult classes
 * never leak into Elementalist focus-spell folding).
 */
function resolveElementalistTradition(actor, dualInfo, primarySlug) {
  const classOrder = [primarySlug, dualInfo?.slug].filter(Boolean);
  for (const cls of classOrder) {
    if (cls === "wizard") return "arcane";
    if (cls === "druid") return "primal";
    if (cls === "sorcerer") {
      const t = detectDynamicTradition(actor, ["bloodline", "sorcerer"]);
      if (t === "arcane" || t === "primal") return t;
    }
    if (cls === "witch") {
      const t = detectDynamicTradition(actor, ["patron", "witch"]);
      if (t === "arcane" || t === "primal") return t;
    }
  }
  return "";
}

/**
 * Detects whether a Wizard has a specialized Arcane School (grants +1 curriculum slot/rank,
 * +1 curriculum cantrip, and School Focus Spells), including Runelord and Elementalist Wizards,
 * while excluding Unified Magical Theory / Universalist Wizards.
 */
export function hasWizardArcaneSchool(feats, featSlugs) {
  const isUnified = featSlugs.has("school-of-unified-magical-theory")
    || featSlugs.has("universalist")
    || feats.some(f => /unified magical theory|universalist/i.test(f.name || ""));
  const hasSchool = featSlugs.has("runelord")
    || featSlugs.has("runelord-dedication")
    || hasElementalistArchetype(feats, featSlugs)
    || feats.some(f =>
      /arcane school|school of |thassilonian rune magic/i.test(f.name || "")
      || getItemSlug(f).startsWith("school-of-")
    );
  return hasSchool && !isUnified;
}

/* ------------------------------------------------------------------------- */
/* 3. PF2E SPELLCASTING PROGRESSION TABLES & REGISTRIES (REMASTER & CORE)    */
/* ------------------------------------------------------------------------- */

/**
 * Full-caster slots per rank for levels 1-20.
 * @param {number} level - Character level (1-20)
 * @param {number} maxPerRank - Standard slots at full rank (2 = Psychic/Animist Prep/Magus/Summoner/Necromancer, 3 = Wiz/Clr/Drd/Wtc/Brd, 4 = Sor/Ora)
 * @param {{ bonusPerRank?: number, hasTenthFeat?: boolean, includeTenth?: boolean }} [options]
 * @returns {Record<number, number>}
 */
export function buildFullCasterSlots(level, maxPerRank, { bonusPerRank = 0, hasTenthFeat = false, includeTenth = true } = {}) {
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
 * Animist Apparition spontaneous slots (1 per unlocked rank 1-9, plus 10th at L19 via Supreme Incarnation).
 */
export function buildAnimistApparitionSlots(level) {
  const slots = {};
  const maxRank = Math.min(9, Math.ceil(level / 2));
  for (let r = 1; r <= 9; r++) {
    slots[r] = r <= maxRank ? 1 : 0;
  }
  slots[10] = level >= 19 ? 1 : 0;
  return slots;
}

/**
 * Battle Harbinger (Cleric class archetype, Divine Mysteries) bounded spell slot progression.
 */
export function buildBattleHarbingerSlots(level) {
  const slots = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  if (level <= 1) {
    slots[1] = 1;
  } else if (level === 2) {
    slots[1] = 2;
  } else if (level === 3) {
    slots[1] = 2;
    slots[2] = 1;
  } else if (level === 4) {
    slots[1] = 2;
    slots[2] = 2;
  } else if (level >= 20) {
    slots[9] = 2;
    slots[10] = 2;
  } else {
    const topRank = Math.min(9, Math.ceil(level / 2));
    slots[topRank - 1] = 2;
    slots[topRank] = 2;
  }
  return slots;
}

/**
 * Standard Multiclass / Free Archetype spellcasting slots (Basic / Expert / Master + optional Breadth).
 */
export function buildArchetypeSlots(level, { hasBasic = false, hasExpert = false, hasMaster = false, hasBreadth = false } = {}) {
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
  if (hasBreadth && level >= 8) {
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
export const CLASS_SPELLCASTING_DEFS = {
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
    repertoireMatchesSlots: false
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
export const ARCHETYPE_SPELLCASTING_DEFS = {
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
  },
  "hedge-mage": {
    label: "Hedge Mage Archetype",
    dedicationSlugs: ["hedge-mage-dedication"],
    basicSlugs: ["basic-hedge-mage-spellcasting"],
    expertSlugs: ["expert-hedge-mage-spellcasting"],
    masterSlugs: ["master-hedge-mage-spellcasting"],
    breadthSlugs: [],
    castingType: "prepared",
    tradition: null, // Chosen via skill: Arcana/Nature/Occultism/Religion
    ability: null,   // INT or WIS
    allowedAbilities: ["int", "wis"],
    cantrips: 2,     // Keepsake holds 4 common cantrips; prepares 2 daily
    bounded: false
  },
  "eldritch-archer": {
    label: "Eldritch Archer Archetype",
    dedicationSlugs: ["eldritch-archer-dedication"],
    basicSlugs: ["basic-eldritch-archer-spellcasting"],
    expertSlugs: ["expert-eldritch-archer-spellcasting"],
    masterSlugs: ["master-eldritch-archer-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: null,
    ability: "cha",
    cantrips: 1,
    bounded: false
  },
  "beast-gunner": {
    label: "Beast Gunner Archetype",
    dedicationSlugs: ["beast-gunner-dedication"],
    basicSlugs: ["basic-beast-gunner-spellcasting"],
    expertSlugs: ["expert-beast-gunner-spellcasting"],
    masterSlugs: ["master-beast-gunner-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: null,
    ability: "cha",
    cantrips: 1,
    bounded: false
  },
  "rivethun-involutionist": {
    label: "Rivethun Involutionist Archetype",
    dedicationSlugs: ["rivethun-involutionist-dedication"],
    basicSlugs: ["basic-rivethun-involutionist-spellcasting"],
    expertSlugs: ["expert-rivethun-involutionist-spellcasting"],
    masterSlugs: ["master-rivethun-involutionist-spellcasting"],
    breadthSlugs: [],
    castingType: "spontaneous",
    tradition: "divine",
    ability: "wis",
    cantrips: 2,
    bounded: false
  }
};

/**
 * Computes the single source of truth for leveled spell slots (Ranks 1–10) and `maxRank`
 * for any non-focus, non-font spellcasting source descriptor at an arbitrary character `level`.
 *
 * Used by BOTH the Character Completeness Checker and the Level 1–20 Build Planner so slot
 * progression logic (Flexible Spellcaster, Wellspring Mage, Battle Harbinger, Wizard Arcane School
 * / Runelord / Elementalist, Animist Prepared & Apparition, Archetype + Breadth) never drifts.
 *
 * @param {object} src - Spellcasting source descriptor from `detectExpectedSpellcastingSources`
 * @param {number} level - Target character level (1–20)
 * @param {{ projectAllArchetypeTiers?: boolean }} [options]
 * @returns {{ slots: Record<number, number>, maxRank: number }}
 */
export function computeExpectedSlotsForSourceAtLevel(src, level, { projectAllArchetypeTiers = false } = {}) {
  const lvl = Math.max(1, Math.min(20, Number(level || 1)));
  const getMaxRank = (slotsObj) => {
    for (let r = 10; r >= 1; r--) {
      if (Number(slotsObj?.[r] || 0) > 0) return r;
    }
    return 0;
  };

  if (!src || src.isFocus || src.isDivineFont) {
    return { slots: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }, maxRank: 0 };
  }

  // 1. Multiclass / Free Archetype spellcasting
  if (src.sourceKind === "archetype") {
    const hasBreadth = Boolean(src.hasBreadth || /\bbreadth\b/i.test(String(src.expectedSpellsNote || "")));
    const slots = buildArchetypeSlots(lvl, {
      hasBasic: projectAllArchetypeTiers ? true : Boolean(src.hasBasic),
      hasExpert: projectAllArchetypeTiers ? true : Boolean(src.hasExpert),
      hasMaster: projectAllArchetypeTiers ? true : Boolean(src.hasMaster),
      hasBreadth
    });
    return { slots, maxRank: getMaxRank(slots) };
  }

  // 2. Class & Class-Archetype spellcasting
  const slug = String(src.classSlug || "").toLowerCase();
  const noteLower = String(src.expectedSpellsNote || "").toLowerCase();
  const def = CLASS_SPELLCASTING_DEFS[slug] || null;

  const isBattleHarbinger = Boolean(src.isBattleHarbinger || (slug === "cleric" && noteLower.includes("battle harbinger")));
  if (isBattleHarbinger) {
    const slots = buildBattleHarbingerSlots(lvl);
    return { slots, maxRank: getMaxRank(slots) };
  }

  const isAnimistApparition = Boolean(src.isAnimistApparition || (slug === "animist" && src.castingType === "spontaneous"));
  if (isAnimistApparition) {
    const slots = buildAnimistApparitionSlots(lvl);
    return { slots, maxRank: getMaxRank(slots) };
  }

  const isAnimistPrepared = Boolean(src.isAnimistPrepared || (slug === "animist" && src.castingType === "prepared"));
  const hasWizardSchool = Boolean(
    src.hasWizardSchool
    || (slug === "wizard" && (noteLower.includes("arcane school") || noteLower.includes("elemental curriculum")))
  );
  const isFlexible = Boolean(src.flexible || (src.castingType === "prepared" && noteLower.includes("flexible spellcaster")));
  const isWellspring = Boolean(src.isWellspring || (src.castingType === "spontaneous" && noteLower.includes("wellspring mage")));

  const baseSlotsPerRank = Number(src.baseSlotsPerRank || def?.baseSlotsPerRank || (isAnimistPrepared ? 2 : 3));
  const includeTenth = src.includeTenth !== undefined
    ? Boolean(src.includeTenth)
    : (isAnimistPrepared ? false : (def ? def.includeTenth !== false : true));
  const bonusPerRank = hasWizardSchool ? 1 : 0;

  const slots = buildFullCasterSlots(lvl, baseSlotsPerRank, {
    bonusPerRank,
    hasTenthFeat: Boolean(src.hasTenthFeat),
    includeTenth
  });

  // Flexible Spellcaster (prepared full casters): base slots cap at 2/rank (keeps Lv 1 = 2 + Wizard school bonus)
  if (isFlexible && src.castingType === "prepared") {
    for (let r = 1; r <= 9; r++) {
      if (slots[r] <= 0) continue;
      if (baseSlotsPerRank >= 3) {
        slots[r] = 2 + bonusPerRank;
      } else if (slots[r] > 1) {
        slots[r] = Math.max(1, slots[r] - 1);
      }
    }
  }

  // Wellspring Mage (spontaneous casters): -1 slot per rank (min 1)
  if (isWellspring && src.castingType === "spontaneous") {
    for (let r = 1; r <= 9; r++) {
      if (slots[r] > 1) slots[r] = Math.max(1, slots[r] - 1);
    }
  }

  return { slots, maxRank: getMaxRank(slots) };
}

/* ------------------------------------------------------------------------- */
/* 4. DYNAMIC TRADITION, ABILITY & SOURCE DETECTION                          */
/* ------------------------------------------------------------------------- */

/**
 * Inspects an actor's embedded feats/features to detect dynamic tradition (Sorcerer/Witch/Summoner)
 * or spellcasting ability (Psychic).
 */
export function detectDynamicTradition(actor, hintKeywords = []) {
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
    occult: ["aberrant", "hag", "harrow", "shadow", "resentment", "starless-shadow", "anger-phantom", "devotion-phantom", "occult"],
    primal: ["elemental", "fey", "phoenix", "wilding-steward", "ripple-in-the-deep", "silence-in-snow", "beast-eidolon", "fey-eidolon", "plant-eidolon", "primal"]
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

export function detectPsychicAbility(actor) {
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
 * Dynamically detects tradition & spellcasting key attribute from a spellcasting archetype's
 * dedication feat (`flags.pf2e.rulesSelections`, `ChoiceSet` rules, item title, or `rollOptions`),
 * including skill-to-tradition mappings (`arcana`->`arcane`, `nature`->`primal`, `occultism`->`occult`,
 * `religion`->`divine`) and multi-ability choices (e.g. Hedge Mage INT or WIS).
 */
export function detectArchetypeChoiceTraditionAndAbility(actor, featSlugsToCheck = [], allowedAbilities = null) {
  const feats = actor.itemTypes?.feat || [];
  const slugSet = new Set(featSlugsToCheck.map(normalizeSlug));
  const skillToTrad = {
    arcana: "arcane",
    arcane: "arcane",
    nature: "primal",
    primal: "primal",
    occultism: "occult",
    occult: "occult",
    religion: "divine",
    divine: "divine"
  };
  const abilMap = {
    int: "int",
    intelligence: "int",
    wis: "wis",
    wisdom: "wis",
    cha: "cha",
    charisma: "cha"
  };

  let tradition = "";
  let ability = "";

  const inspectToken = (raw) => {
    if (!raw) return;
    const str = typeof raw === "string"
      ? raw
      : (typeof raw?.value === "string" ? raw.value : "");
    if (!str) return;
    const lower = str.toLowerCase().trim();
    if (!tradition && skillToTrad[lower]) tradition = skillToTrad[lower];
    if (!ability && abilMap[lower] && (!allowedAbilities || allowedAbilities.includes(abilMap[lower]))) {
      ability = abilMap[lower];
    }
    if (!tradition) {
      const tm = lower.match(/\b(arcane|divine|occult|primal|arcana|nature|occultism|religion)\b/);
      if (tm && skillToTrad[tm[1]]) tradition = skillToTrad[tm[1]];
    }
    if (!ability) {
      const am = lower.match(/\b(intelligence|wisdom|charisma|int|wis|cha)\b/);
      if (am && abilMap[am[1]] && (!allowedAbilities || allowedAbilities.includes(abilMap[am[1]]))) {
        ability = abilMap[am[1]];
      }
    }
  };

  for (const feat of feats) {
    if (!slugSet.has(getItemSlug(feat))) continue;
    const sels = feat.flags?.pf2e?.rulesSelections;
    if (sels && typeof sels === "object") {
      for (const val of Object.values(sels)) inspectToken(val);
    }
    const rules = Array.isArray(feat.system?.rules) ? feat.system.rules : [];
    for (const r of rules) {
      if (r?.key === "ChoiceSet") inspectToken(r.selection);
    }
    const paren = String(feat.name || "").match(/\(([^)]+)\)/);
    if (paren) inspectToken(paren[1]);
  }

  if ((!tradition || !ability) && actor.rollOptions?.all) {
    for (const slug of slugSet) {
      const base = slug.replace(/-dedication$/, "");
      for (const [k, v] of Object.entries(actor.rollOptions.all)) {
        if (!v || !k.includes(base)) continue;
        if (!tradition) {
          const tm = k.match(/:(arcane|divine|occult|primal|arcana|nature|occultism|religion)(?:$|:)/i);
          if (tm && skillToTrad[tm[1].toLowerCase()]) tradition = skillToTrad[tm[1].toLowerCase()];
        }
        if (!ability) {
          const am = k.match(/:(int|wis|cha|intelligence|wisdom|charisma)(?:$|:)/i);
          if (am && abilMap[am[1].toLowerCase()] && (!allowedAbilities || allowedAbilities.includes(abilMap[am[1].toLowerCase()]))) {
            ability = abilMap[am[1].toLowerCase()];
          }
        }
      }
    }
  }

  if (!ability && Array.isArray(allowedAbilities) && allowedAbilities.length > 0) {
    let bestAbil = allowedAbilities[0];
    let bestMod = Number(actor.system?.abilities?.[bestAbil]?.mod ?? -Infinity);
    for (const a of allowedAbilities.slice(1)) {
      const m = Number(actor.system?.abilities?.[a]?.mod ?? -Infinity);
      if (m > bestMod) {
        bestMod = m;
        bestAbil = a;
      }
    }
    ability = bestAbil;
  }

  return { tradition, ability };
}

/**
 * Build all expected spellcasting sources for an actor based on:
 *  1. Primary Class + class spellcasting features on Feats tab (incl. Elementalist, Flexible, Wellspring, Battle Harbinger, Runelord)
 *  2. Dual Class (PF2e Awesome Variant Rules) + dual class spellcasting features on Feats tab
 *  3. Multiclass & Spellcasting Archetype feats on Feats tab (Class Feats, Dual Class Feats, Free Archetype)
 *  4. Focus Spellcasting sources (Class, Dual Class, Archetype, and generic focus feats)
 */
export function detectExpectedSpellcastingSources(actor, level, dualInfo) {
  const sources = [];
  const feats = actor.itemTypes?.feat || [];
  const featSlugs = new Set(feats.map(getItemSlug));

  const hasFlexibleCaster = featSlugs.has("flexible-spellcaster-dedication") || featSlugs.has("flexible-spellcaster");
  const hasWellspringMage = featSlugs.has("wellspring-mage-dedication") || featSlugs.has("wellspring-magic");
  const hasBattleHarbinger = featSlugs.has("battle-creed") || featSlugs.has("battle-harbinger-dedication");
  const hasElementalist = hasElementalistArchetype(feats, featSlugs);

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
      const prepSpecBase = {
        classSlug,
        sourceKind,
        castingType: "prepared",
        flexible: hasFlexibleCaster,
        isAnimistPrepared: true,
        baseSlotsPerRank: 2,
        includeTenth: false
      };
      const prepSlots = computeExpectedSlotsForSourceAtLevel(prepSpecBase, level).slots;
      const prepCantrips = hasFlexibleCaster ? 1 : 2;
      prepSlots[0] = prepCantrips;
      sources.push({
        key: `class:${classSlug}:prepared:${sourceKind}`,
        classSlug,
        sourceKind,
        sourceBadge,
        title: `${def.className} Prepared Spells`,
        entryName: `Divine ${hasFlexibleCaster ? "Flexible" : "Prepared"} Spells (${def.className})`,
        castingType: "prepared",
        flexible: hasFlexibleCaster,
        isAnimistPrepared: true,
        baseSlotsPerRank: 2,
        includeTenth: false,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: prepCantrips,
        slots: prepSlots,
        totalLeveledSlots: countTotalLeveledSlots(prepSlots),
        slotsSummary: formatSlotsSummary(prepSlots),
        expectedSpellsNote: hasFlexibleCaster
          ? "Prepares daily from the full common Divine spell list · Flexible Spellcaster"
          : "Prepares daily from the full common Divine spell list",
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
        isAnimistApparition: true,
        baseSlotsPerRank: 1,
        includeTenth: true,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: apparitionCantrips,
        slots: appSlots,
        totalLeveledSlots: countTotalLeveledSlots(appSlots),
        slotsSummary: formatSlotsSummary(appSlots),
        expectedSpellsNote: "Spontaneous repertoire from attuned Apparitions (all act as signature spells; 10th-rank slot at Lv 19 via Supreme Incarnation)",
        repertoireExpected: null,
        signatureExpected: 0
      });
      return;
    }

    // Standard Full Caster (plus Battle Harbinger Cleric bounded casting & Elementalist Arcane/Primal casters)
    const isBattleHarbingerCleric = classSlug === "cleric" && hasBattleHarbinger;
    const isElementalistCaster = hasElementalist
      && (tradition === "arcane" || tradition === "primal" || classSlug === "wizard" || classSlug === "druid");
    let cantrips = def.cantrips;
    let extraNote = "";
    const flexible = !isBattleHarbingerCleric && def.castingType === "prepared" && hasFlexibleCaster;
    const isWellspring = def.castingType === "spontaneous" && hasWellspringMage;

    // Check Wizard Arcane School / Runelord / Elementalist bonus curriculum slot
    // (all specialized schools except Unified Magical Theory / Universalist)
    const hasWizSchool = classSlug === "wizard" && hasWizardArcaneSchool(feats, featSlugs);
    if (hasWizSchool) {
      cantrips = 6; // 5 base + 1 curriculum cantrip
      extraNote = isElementalistCaster
        ? "Elementalist · Includes +1 elemental curriculum slot per rank & +1 cantrip (Elemental Spell List)"
        : "Includes +1 Arcane School curriculum slot per rank & +1 cantrip";
    } else if (isElementalistCaster) {
      extraNote = "Elementalist (Elemental Spell List)";
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

    const slotSpec = {
      classSlug,
      sourceKind,
      castingType: def.castingType,
      baseSlotsPerRank: def.baseSlotsPerRank,
      includeTenth: def.includeTenth !== false,
      hasTenthFeat,
      hasWizardSchool: hasWizSchool,
      flexible,
      isWellspring,
      isBattleHarbinger: isBattleHarbingerCleric
    };
    const slots = computeExpectedSlotsForSourceAtLevel(slotSpec, level).slots;

    if (isBattleHarbingerCleric) {
      extraNote = "Battle Harbinger (bounded spell slots + Battle Font)";
    }

    if (flexible) {
      cantrips = Math.max(1, cantrips - 2);
      extraNote = extraNote
        ? `${extraNote}; Flexible Spellcaster (2 base slots/rank, -2 cantrips)`
        : "Flexible Spellcaster (2 base slots/rank, -2 cantrips, flexible collection)";
    }

    if (isWellspring) {
      cantrips = Math.max(1, cantrips - 1);
      extraNote = extraNote
        ? `${extraNote}; Wellspring Mage (-1 slot/rank, -1 cantrip)`
        : "Wellspring Mage (-1 slot/rank, -1 cantrip, temporary surges)";
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
      const listLabel = isElementalistCaster ? "Elemental" : (TRADITION_LABELS[tradition] || "");
      expectedSpellsNote = `Prepares ${cantrips} cantrips + ${totalLeveledSlots} leveled spells daily from full ${listLabel} list`;
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
      isWellspring,
      isBattleHarbinger: isBattleHarbingerCleric,
      isElementalist: isElementalistCaster,
      hasWizardSchool: hasWizSchool,
      hasTenthFeat,
      baseSlotsPerRank: def.baseSlotsPerRank,
      includeTenth: def.includeTenth !== false,
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

    // Cleric Divine Font (Remaster Player Core: 4 slots at Lv 1-4, 5 at Lv 5-14, 6 at Lv 15-20 at highest spell rank)
    // Battle Harbinger replaces Healing/Harmful Font with Battle Font (Bless / Bane, plus Benediction / Malediction with Aura Enhancement)
    if (def.hasDivineFont) {
      const fontRank = isBattleHarbingerCleric
        ? (level >= 20 ? 10 : Math.min(9, Math.ceil(level / 2)))
        : Math.min(10, Math.ceil(level / 2));
      const fontCount = getClericDivineFontCount(level);
      const fontSlots = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
      fontSlots[fontRank] = fontCount;
      const fontChoice = isBattleHarbingerCleric ? "" : detectClericDivineFontChoice(actor, feats, featSlugs);
      const hasAuraEnhancement = isBattleHarbingerCleric && featSlugs.has("aura-enhancement");
      const fontSpell = isBattleHarbingerCleric
        ? (hasAuraEnhancement ? "Bless / Bane / Benediction / Malediction" : "Bless / Bane")
        : (fontChoice === "harm" ? "Harm" : (fontChoice === "heal" ? "Heal" : "Heal / Harm"));

      sources.push({
        key: `class:cleric:divine-font:${sourceKind}`,
        classSlug: "cleric",
        sourceKind,
        sourceBadge: `${sourceBadge} · Font`,
        title: isBattleHarbingerCleric ? "Cleric Battle Font" : `Cleric Divine Font (${fontSpell})`,
        entryName: isBattleHarbingerCleric ? "Battle Font (Bless / Bane)" : `Divine Font (${fontSpell})`,
        castingType: "prepared",
        flexible: false,
        tradition: "divine",
        ability: "wis",
        traditionMissing: false,
        cantrips: 0,
        slots: fontSlots,
        totalLeveledSlots: fontCount,
        slotsSummary: `R${fontRank}: ${fontCount} (${fontSpell})`,
        expectedSpellsNote: isBattleHarbingerCleric
          ? `Battle Font grants ${fontCount} extra Rank ${fontRank} battle aura slot(s) per day (${fontSpell})`
          : (fontChoice
            ? `Remaster Divine Font grants ${fontCount} extra Rank ${fontRank} ${fontSpell} slot(s) per day (auto-prepared on Sync)`
            : `Remaster Divine Font grants ${fontCount} extra Rank ${fontRank} Heal or Harm slot(s) per day — pick Healing or Harmful Font on Level 1 to auto-prepare`),
        repertoireExpected: null,
        signatureExpected: 0,
        isDivineFont: true,
        isBattleFont: isBattleHarbingerCleric,
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
      const flexible = castingType === "prepared" && hasFlexibleCaster;
      const isWellspring = castingType === "spontaneous" && hasWellspringMage;
      const cantrips = Math.max(1, 5 - (flexible ? 2 : (isWellspring ? 1 : 0)));
      const slots = computeExpectedSlotsForSourceAtLevel({
        classSlug: slug,
        sourceKind: "classfeature",
        castingType,
        baseSlotsPerRank: 3,
        includeTenth: true,
        flexible,
        isWellspring
      }, level).slots;
      slots[0] = castingType === "prepared" ? cantrips : 0;
      const ability = tradition === "arcane" ? "int" : (tradition === "divine" || tradition === "primal" ? "wis" : "cha");

      const totalLeveledSlots = countTotalLeveledSlots(slots);
      const archSuffix = flexible
        ? " · Flexible Spellcaster"
        : (isWellspring ? " · Wellspring Mage" : "");
      sources.push({
        key: genericKey,
        classSlug: slug,
        sourceKind: "classfeature",
        sourceBadge: "Class Feature",
        title: feat.name || "Class Spellcasting",
        entryName: `${tradition ? `${TRADITION_LABELS[tradition]} ` : ""}${flexible ? "Flexible" : CASTING_TYPE_LABELS[castingType]} (${feat.name})`,
        castingType,
        flexible,
        isWellspring,
        baseSlotsPerRank: 3,
        includeTenth: true,
        tradition,
        ability,
        traditionMissing: !tradition,
        cantrips,
        slots,
        totalLeveledSlots,
        slotsSummary: formatSlotsSummary(slots),
        expectedSpellsNote: `Detected from "${feat.name}" on Feats tab · Standard full-caster slot progression${archSuffix}`,
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
    let ability = def.ability;
    if (!tradition || !ability) {
      const choiceInfo = detectArchetypeChoiceTraditionAndAbility(
        actor,
        [...def.dedicationSlugs, ...def.basicSlugs],
        def.allowedAbilities || null
      );
      if (!tradition && choiceInfo.tradition) tradition = choiceInfo.tradition;
      if (!ability && choiceInfo.ability) ability = choiceInfo.ability;
    }

    if (!tradition) {
      if (archKey === "sorcerer") tradition = detectDynamicTradition(actor, ["bloodline", "sorcerer"]);
      else if (archKey === "witch") tradition = detectDynamicTradition(actor, ["patron", "witch"]);
      else if (archKey === "summoner") tradition = detectDynamicTradition(actor, ["eidolon", "summoner"]);
      else if (archKey === "cathartic-mage") tradition = detectDynamicTradition(actor, ["cathartic"]);
    }

    if (!ability && archKey === "psychic") {
      ability = detectPsychicAbility(actor);
    }

    const slots = buildArchetypeSlots(level, { hasBasic, hasExpert, hasMaster, hasBreadth });
    const cantripCount = def.cantrips + (archKey === "psychic" && featSlugs.has("psi-development") ? 1 : 0);

    slots[0] = def.castingType === "prepared" ? cantripCount : 0;

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
      ? `Feats: ${tierTags.join(", ")} · ${cantripCount} cantrip${cantripCount === 1 ? "" : "s"} + ${totalLeveledSlots} leveled slot(s)${signatureExpected > 0 ? ` (${signatureExpected} signature)` : ""}`
      : `Feats: ${tierTags.join(", ")} · ${cantripCount} cantrip${cantripCount === 1 ? "" : "s"} (take Basic Spellcasting at Lv 4+ for leveled slots)`;

    sources.push({
      key: `archetype:${archKey}`,
      classSlug: archKey,
      sourceKind: "archetype",
      sourceBadge: isFreeArchetypeSlot ? "Free Archetype" : "Archetype",
      title: def.label,
      entryName: `${tradition ? `${tradLabel} ` : ""}${typeLabel} (${def.label})`,
      castingType: def.castingType,
      flexible: false,
      hasBasic,
      hasExpert,
      hasMaster,
      hasBreadth,
      tradition: tradition || "",
      ability: ability || "cha",
      traditionMissing: !tradition,
      cantrips: cantripCount,
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
    const dedSlug = `${archSlug}-dedication`;
    const dedFeat = findActorFeat(actor, f => getItemSlug(f) === dedSlug);
    const combinedDesc = `${String(dedFeat?.system?.description?.value || "")} ${String(rec.sampleFeat?.system?.description?.value || "")}`.toLowerCase();
    const choiceInfo = detectArchetypeChoiceTraditionAndAbility(actor, [dedSlug, getItemSlug(rec.sampleFeat)]);
    const tradMatch = combinedDesc.match(/\b(arcane|divine|occult|primal)\b/);
    const tradition = choiceInfo.tradition || (tradMatch ? tradMatch[1] : "");
    const castingType = /\bprepared\b|\bprepare\s+(?:two|your|\d+)\s+(?:cantrips?|spells?)\b/i.test(combinedDesc)
      ? "prepared"
      : (/\binnate\b/i.test(combinedDesc) ? "innate" : "spontaneous");
    let ability = choiceInfo.ability;
    if (!ability) {
      const abilCandidates = [];
      if (/\bintelligence\b/i.test(combinedDesc)) abilCandidates.push("int");
      if (/\bwisdom\b/i.test(combinedDesc)) abilCandidates.push("wis");
      if (/\bcharisma\b/i.test(combinedDesc)) abilCandidates.push("cha");
      if (abilCandidates.length > 0) {
        ability = abilCandidates.reduce((best, cur) =>
          Number(actor.system?.abilities?.[cur]?.mod ?? -Infinity) > Number(actor.system?.abilities?.[best]?.mod ?? -Infinity) ? cur : best
        , abilCandidates[0]);
      } else {
        ability = tradition === "arcane" ? "int" : (tradition === "divine" || tradition === "primal" ? "wis" : "cha");
      }
    }
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
      hasBasic: rec.hasBasic,
      hasExpert: rec.hasExpert,
      hasMaster: rec.hasMaster,
      hasBreadth: rec.hasBreadth,
      tradition,
      ability,
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
 * Ranger Warden Spells, Wizard School / Elementalist Spells, Sorcerer Bloodline Spells,
 * Witch Hexes, Oracle Revelation Spells, Summoner Link Spells, Animist Vessel Spells,
 * Necromancer Grave Spells), Multiclass / Free Archetype focus feats, and a generic
 * fallback for any other focus-spell-granting feat on the Feats tab.
 */
export function detectFocusSpellcastingSources(actor, level, dualInfo, primarySlug, feats, featSlugs) {
  const focusSources = [];
  const coveredFeatIds = new Set();
  const focusRank = Math.min(10, Math.ceil(level / 2));
  const focusPoolMax = Number(actor.system?.resources?.focus?.max ?? 0);
  const emptySlots = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  const hasElementalist = hasElementalistArchetype(feats, featSlugs);

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

  // 3. Bard: Composition Spells (Counter Performance + Courageous Anthem + Muse / Composition Focus Feats)
  matchFeats(["martial-performance", "courageous-advance", "courageous-assault", "courageous-onslaught", "harmonize", "melodious-spell", "triumphant-inspiration", "accompany", "inspirational-focus"]);
  const bardFocusFeats = matchFeats([
    "composition-spells", "counter-performance", "courageous-anthem", "inspire-courage",
    "lingering-composition", "hymn-of-healing", "uplifting-overture", "dirge-of-doom",
    "house-of-imaginary-walls", "soothing-ballad", "ode-to-ouroboros", "allegro",
    "fatal-aria", "symphony-of-the-unfettered-heart", "rallying-anthem", "song-of-strength",
    "fortissimo-composition", "triple-time", "song-of-marching", "soothing-mists",
    "inspire-defense", "inspire-heroics"
  ]);
  if (hasClassOrDual("bard") || featSlugs.has("composition-spells")) {
    const baseSkip = new Set(["composition-spells", "counter-performance", "courageous-anthem", "inspire-courage"]);
    const bonusFeats = bardFocusFeats.filter(f => !baseSkip.has(getItemSlug(f))).length;
    const expectedCount = 2 + bonusFeats; // Counter Performance + Courageous Anthem base
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

  // 5. Druid: Order Spells (Order Explorer does NOT grant an extra order spell until Order Magic is taken)
  matchFeats([
    "order-spells", "druidic-order", "order-explorer", "storm-born", "primal-focus", "primal-wellspring",
    "order-magic", "advanced-elemental-spell", "untamed-form", "wild-shape",
    "wind-caller", "storm-lord", "primal-summons", "impaling-briars", "healing-sprout"
  ]);
  for (const f of feats) {
    const s = getItemSlug(f);
    const d = String(f.system?.description?.value || "");
    if (s.endsWith("-order") || /<(?:strong|b|h[1-6])[^>]*>\s*Order\s+Spell\s*[:<]/i.test(d)) {
      coveredFeatIds.add(f.id);
    }
  }
  if (hasClassOrDual("druid") || featSlugs.has("order-spells")) {
    const extraOrder = matchFeats([
      "order-magic", "advanced-elemental-spell", "wind-caller", "storm-lord", "primal-summons", "impaling-briars", "healing-sprout"
    ]).length;
    // Untamed Form / Wild Shape grants an extra focus spell if taken via Order Explorer by a non-Untamed/Wild primary Druid
    const orderExplorerIds = new Set(feats.filter(f => getItemSlug(f) === "order-explorer").map(f => f.id));
    const hasPrimaryUntamed = feats.some(f => {
      const s = getItemSlug(f);
      if (s !== "untamed-order" && s !== "wild-order") return false;
      const gBy = f.flags?.pf2e?.grantedBy?.id;
      return !(gBy && orderExplorerIds.has(gBy));
    });
    const extraUntamedForm = !hasPrimaryUntamed && (featSlugs.has("untamed-form") || featSlugs.has("wild-shape")) ? 1 : 0;
    const totalExpected = 1 + extraOrder + extraUntamedForm;
    pushFocusSource({
      key: `focus:druid:${classSourceKind("druid")}`,
      classSlug: "druid",
      sourceKind: classSourceKind("druid"),
      sourceBadge: classSourceBadge("druid"),
      title: "Druid Order Spells",
      entryName: "Order Spells (Druid)",
      tradition: "primal",
      ability: "wis",
      expectedFocusSpells: totalExpected,
      matchKeywords: ["order", "druid"],
      note: `Druid Order Focus Spells (Primal, WIS) — 1 initial order spell${(extraOrder + extraUntamedForm) > 0 ? ` + ${extraOrder + extraUntamedForm} additional` : ""}`
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

  // 9. Wizard: Arcane School / Elementalist Focus Spells (if specialized school, Elementalist, Runelord, or Hand of the Apprentice)
  if (hasClassOrDual("wizard")) {
    const hasSpecializedSchool = hasWizardArcaneSchool(feats, featSlugs);
    const wizFocusFeats = matchFeats(["hand-of-the-apprentice", "advanced-school-spell"]);
    if (hasElementalist) {
      for (const f of feats) {
        if (isElementalistClassFeature(f)) coveredFeatIds.add(f.id);
      }
    }
    const hasInitialSchoolSpell = hasSpecializedSchool || featSlugs.has("hand-of-the-apprentice");
    if (hasInitialSchoolSpell || wizFocusFeats.length > 0) {
      const expectedCount = (hasSpecializedSchool ? 1 : 0) + wizFocusFeats.length;
      const isElemWiz = hasElementalist && !feats.some(f => getItemSlug(f).startsWith("school-of-"));
      pushFocusSource({
        key: `focus:wizard:${classSourceKind("wizard")}`,
        classSlug: "wizard",
        sourceKind: classSourceKind("wizard"),
        sourceBadge: classSourceBadge("wizard"),
        title: isElemWiz ? "Elementalist Wizard Focus Spells" : "Wizard School Spells",
        entryName: isElemWiz ? "Elemental School Spells (Wizard)" : "School Spells (Wizard)",
        tradition: "arcane",
        ability: "int",
        expectedFocusSpells: Math.max(1, expectedCount),
        matchKeywords: isElemWiz ? ["elemental", "school", "wizard"] : ["school", "wizard"],
        note: isElemWiz
          ? `Elementalist Wizard Focus Spells (Arcane, INT) — ${Math.max(1, expectedCount)} focus spell(s)`
          : `Wizard Arcane School Focus Spells (Arcane, INT) — ${Math.max(1, expectedCount)} focus spell(s)`
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
    },
    {
      key: "focus:archetype:bard",
      classSlug: "bard",
      slugs: ["counter-perform", "anthemic-performance", "inspirational-performance"],
      title: "Bard Archetype Composition Spells",
      entryName: "Composition Spells (Bard Archetype)",
      tradition: "occult",
      ability: "cha",
      matchKeywords: ["composition", "bard"],
      skipIfClass: "bard"
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
  // Catches Shadowdancer, Time Mage, Soul Warden, Beastmaster, Elementalist focus feats, Psychic focus feats, homebrew, etc.
  const refocusOrPassiveExclusions = /(?:^|-)(?:focus|wellspring|refocus|desperate-prayer|psi-strikes|psychic-dedication|conscious-mind|subconscious-mind|mercy|affliction-mercy|cruelty|covenant|order-explorer|martial-performance|storm-born|druidic-order|elementalist-dedication|expanded-elemental-magic|elemental-familiar|burning-spell|dousing-spell|current-spell|rockslide-spell|reverberating-spell|wind-tossed-spell|redirect-elements|metabolize-element)(?:$|-)|-(?:order|bloodline|mystery|patron|muse)$|^school-of-/;
  const focusGrantRegex = /(?:you\s+(?:gain|learn|receive)|grants?\s+you|you\s+can\s+cast)\s+(?:the\s+)?[^.<]{0,80}\b(?:focus\s+spell|focus\s+pool)\b/i;

  // Fallback tradition for Elementalist focus feats that reference "your spellcasting tradition" instead of naming arcane/primal
  const elementalistFallbackTrad = hasElementalist
    ? resolveElementalistTradition(actor, dualInfo, primarySlug)
    : "";

  for (const feat of feats) {
    if (coveredFeatIds.has(feat.id)) continue;
    if (isElementalistClassFeature(feat)) continue;
    const slug = getItemSlug(feat);
    if (refocusOrPassiveExclusions.test(slug)) continue;

    const desc = String(feat.system?.description?.value || "");
    if (!focusGrantRegex.test(desc)) continue;
    if (/(?:don't|do\s+not)\s+(?:gain|learn|receive)[^.<]{0,60}\b(?:focus|order|composition)\b/i.test(desc)) continue;

    const tradMatch = desc.match(/\b(arcane|divine|occult|primal)\b/i);
    let detectedTrad = tradMatch ? tradMatch[1].toLowerCase() : "";
    if (!detectedTrad && elementalistFallbackTrad && /elemental/i.test(`${feat.name} ${slug} ${desc}`)) {
      detectedTrad = elementalistFallbackTrad;
    }

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
/* 5. DATA-DRIVEN PF2E AUTO-GRANTED & FOCUS SPELL DISCOVERY (ZERO HARDCODE)  */
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
export function detectClericDivineFontChoice(actor, feats = null, featSlugs = null) {
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
export function isPsychicConsciousMindFeat(feat) {
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
    const m = k.match(/(?:^|:)(?:element|elemental-bloodline|elemental-philosophy|dragon-type|bloodline|patron|mystery|school|domain|tradition|energy|damage-type|mind|order|study):([a-z0-9-]+)$/i);
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
export async function warmDomainSpellCache() {
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
 * Triggers a background warm-up of the PF2e Domain Spell journal cache if not yet populated.
 */
export function ensureDomainSpellCacheWarm() {
  if (!_domainSpellCache && !_domainSpellCachePromise) {
    warmDomainSpellCache().catch(() => {});
  }
}

/**
 * Reads a cached PF2e Domain Spell entry `{ uuid, name, img } | null` synchronously.
 */
export function getCachedDomainSpell(domainSlug, tier = "initial") {
  if (!domainSlug || !_domainSpellCache) return null;
  const rec = _domainSpellCache.get(normalizeSlug(domainSlug));
  return rec?.[tier || "initial"] || null;
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
  const refOnlyBeforeRe = /(?:instead\s+of|similar\s+to|as\s+if\s+casting|when\s+you\s+(?:cast|have)|if\s+you\s+(?:cast|have|later\s+gain)|while\s+you\s+have|affecting|prerequisite|don't\s+gain|do\s+not\s+gain|such\s+as|extend(?:s|ing)?)\s*(?:a|an|the|your|its)?\s*$/i;
  const negOrCondBeforeRe = /(?:don't|do\s+not)\s+(?:gain|learn|receive)|if\s+you\s+(?:have|later\s+gain)\s+(?:a|an|the)|when\s+you\s+have\s+(?:a|an|the)/i;

  let filtered = allRefs.filter(r => {
    const beforeTrim = r.beforeCtx.trim();
    if (refOnlyBeforeRe.test(beforeTrim) || negOrCondBeforeRe.test(beforeTrim)) return false;
    return grantBeforeRe.test(r.beforeCtx) || grantAfterRe.test(r.afterCtx);
  });

  if (filtered.length === 0 && allowAllIfSingle && allRefs.length === 1) {
    const b0 = allRefs[0].beforeCtx.trim();
    if (!refOnlyBeforeRe.test(b0) && !negOrCondBeforeRe.test(b0)) {
      filtered = allRefs;
    }
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
  const featSlugs = new Set();
  for (const f of feats) {
    const slug = getItemSlug(f);
    if (slug) {
      featSlugs.add(slug);
      if (!featBySlug.has(slug)) featBySlug.set(slug, f);
    }
  }

  const hasElementalist = hasElementalistArchetype(feats, featSlugs);

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

    // Divine Font spell (Heal / Harm) — skipped for Battle Harbinger (which uses Battle Font: Bless/Bane)
    const isBattleHarbinger = featBySlug.has("battle-creed") || featBySlug.has("battle-harbinger-dedication");
    const fontChoice = isBattleHarbinger ? "" : detectClericDivineFontChoice(actor, feats);
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

  // --- 3. WIZARD: Arcane School / Elementalist Curriculum + School Focus Spells + Hand of the Apprentice ---
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
      return /<(?:strong|b|h[1-6])[^>]*>\s*(?:(?:Arcane\s+|Elemental\s+)?Curriculum|(?:Elemental\s+)?School\s+Spells?)\s*[:<]/i.test(desc);
    });

    if (schoolFeat) {
      const desc = String(schoolFeat.system?.description?.value || "");
      const sQuals = extractActorQualifiers(actor, schoolFeat);

      if (isWizClass) {
        const currHtml = extractNamedSectionHtml(desc, [/^(?:arcane\s+|elemental\s+)?curriculum(?:\s+spells?)?$/i]);
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

      const focusHtml = extractNamedSectionHtml(desc, [/^(?:elemental\s+)?school\s+spells?$/i]);
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

    // Elementalist Wizard fallback: inspect Elementalist / Elemental Magic / Elemental Philosophy features
    // for direct rule spell UUIDs or focus spell sections when no standard School of ... feature exists
    if (isWizClass && hasElementalist) {
      const elemFeatures = feats.filter(f =>
        f !== schoolFeat
        && isElementalistClassFeature(f)
        && getItemSlug(f) !== "elementalist-dedication"
      );
      for (const ef of elemFeatures) {
        const desc = String(ef.system?.description?.value || "");
        const eQuals = extractActorQualifiers(actor, ef);
        const directRefs = extractDirectRuleSpellUuids(ef);
        for (const r of directRefs) {
          const treatAsFocus = r.isFocus === true
            || (r.isFocus == null && r.isCantrip !== true && /\b(?:focus|school)\s+spell\b/i.test(desc));
          pushAutoSpell({
            uuid: r.uuid,
            name: r.name,
            img: r.img,
            rank: r.isCantrip ? 0 : (treatAsFocus ? null : (r.baseRank || 1)),
            isCantrip: Boolean(r.isCantrip),
            isFocus: treatAsFocus,
            unlockLevel: inferFeatAcquiredLevel(ef, 1),
            targetSourceKey: treatAsFocus ? wizFocusKey : wizSpellKey,
            targetClassSlug: "wizard",
            sourceLabel: ef.name,
            tier: "elementalist",
            countsTowardRepertoire: false
          });
        }
        const focusSec = extractNamedSectionHtml(desc, [/^(?:elemental\s+)?(?:school|focus)\s+spells?$/i]);
        let addedFromFocusSec = false;
        if (focusSec) {
          const tiers = parseTieredSpellSection(focusSec);
          if (tiers.initial) {
            addedFromFocusSec = true;
            pushTieredFocusRefs(tiers.initial, {
              targetSourceKey: wizFocusKey,
              targetClassSlug: "wizard",
              sourceLabel: ef.name,
              tier: "initial",
              unlockLevel: 1
            });
          }
          const advUnlock = getFeatUnlockLevel(["advanced-school-spell"]);
          if (advUnlock.unlocked && tiers.advanced) {
            addedFromFocusSec = true;
            pushTieredFocusRefs(tiers.advanced, {
              targetSourceKey: wizFocusKey,
              targetClassSlug: "wizard",
              sourceLabel: ef.name,
              tier: "advanced",
              unlockLevel: advUnlock.level
            });
          }
          // Handle untiered Focus/School Spell sections without explicit Initial/Advanced sub-labels
          if (!addedFromFocusSec) {
            const untieredRefs = extractSpellRefsFromText(focusSec);
            if (untieredRefs.length > 0) {
              addedFromFocusSec = true;
              pushTieredFocusRefs(untieredRefs, {
                targetSourceKey: wizFocusKey,
                targetClassSlug: "wizard",
                sourceLabel: ef.name,
                tier: "initial",
                unlockLevel: inferFeatAcquiredLevel(ef, 1)
              });
            }
          }
        }
        if (!addedFromFocusSec && directRefs.length === 0) {
          const parsedFocus = parseDirectFeatSpells(ef, eQuals, { allowAllIfSingle: false });
          for (const r of parsedFocus.auto) {
            if (r.isFocus === false) continue;
            pushAutoSpell({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: null,
              isCantrip: false,
              isFocus: true,
              unlockLevel: inferFeatAcquiredLevel(ef, 1),
              targetSourceKey: wizFocusKey,
              targetClassSlug: "wizard",
              sourceLabel: ef.name,
              tier: "elementalist",
              countsTowardRepertoire: false
            });
          }
          if (parsedFocus.auto.length === 0 && parsedFocus.choice?.length > 0) {
            pushTieredFocusRefs(parsedFocus.choice, {
              targetSourceKey: wizFocusKey,
              targetClassSlug: "wizard",
              sourceLabel: ef.name,
              tier: "elementalist",
              unlockLevel: inferFeatAcquiredLevel(ef, 1)
            });
          }
        }
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
    for (const psyArchFeat of [featBySlug.get("psychic-dedication"), featBySlug.get("psi-development")].filter(Boolean)) {
      const direct = extractDirectRuleSpellUuids(psyArchFeat);
      for (const r of direct) {
        pushAutoSpell({
          uuid: r.uuid,
          name: r.name,
          img: r.img,
          rank: 0,
          isCantrip: true,
          isFocus: false,
          unlockLevel: inferFeatAcquiredLevel(psyArchFeat, getItemSlug(psyArchFeat) === "psi-development" ? 6 : 2),
          targetSourceKey: "archetype:psychic",
          targetClassSlug: "psychic",
          sourceLabel: psyArchFeat.name,
          tier: "psi",
          countsTowardRepertoire: false
        });
      }
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
  // (Never include passive/modifier feats like Martial Performance, which only *mention* Song of Strength / Rallying Anthem!)
  if (hasClassOrDual("bard") || featBySlug.has("composition-spells")) {
    const kind = classKind("bard");
    const key = `focus:bard:${kind}`;
    const bardSpellKey = `class:bard:${kind}`;
    const bardNonGrantExclusions = new Set([
      "martial-performance", "courageous-advance", "courageous-assault", "courageous-onslaught",
      "harmonize", "melodious-spell", "triumphant-inspiration", "accompany", "eclectic-skill",
      "inspirational-focus", "warrior", "maestro", "enigma", "polymath", "zoophonia", "muses-whispers", "muse-s-whispers"
    ]);
    const bardCompSlugs = new Set([
      "composition-spells", "counter-performance", "courageous-anthem", "inspire-courage",
      "lingering-composition", "hymn-of-healing", "uplifting-overture", "dirge-of-doom",
      "house-of-imaginary-walls", "soothing-ballad", "ode-to-ouroboros", "allegro",
      "fatal-aria", "symphony-of-the-unfettered-heart", "rallying-anthem", "song-of-strength",
      "fortissimo-composition", "triple-time", "song-of-marching", "soothing-mists",
      "inspire-defense", "inspire-heroics"
    ]);
    const bardGrantRe = /(?:you\s+(?:gain|learn|receive)|grants?\s+you)\s+(?:the\s+)?[^.<]{0,80}\b(?:composition\s+(?:spell|cantrip)|focus\s+spell)\b/i;
    // Also capture any Bard feat whose description explicitly GRANTS a composition spell/cantrip dynamically,
    // plus any Bard Muse feature that grants a 1st-rank repertoire spell (e.g. Maestro -> Soothe, Enigma -> Sure Strike)
    for (const f of feats) {
      const fSlug = getItemSlug(f);
      const desc = String(f.system?.description?.value || "");
      const hasBardTrait = Array.isArray(f.system?.traits?.value) && f.system.traits.value.includes("bard");
      if (hasBardTrait && !bardNonGrantExclusions.has(fSlug) && bardGrantRe.test(desc)) {
        bardCompSlugs.add(fSlug);
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
  } else if (featBySlug.has("counter-perform") || featBySlug.has("anthemic-performance") || featBySlug.has("inspirational-performance")) {
    addDirectFocusFeats(
      new Set(["counter-perform", "anthemic-performance", "inspirational-performance"]),
      "focus:archetype:bard",
      "bard"
    );
  }

  // Druid Order Spells
  // IMPORTANT: Order Explorer adds a second Druidic Order feature onto the sheet, but does NOT grant
  // that order's initial focus spell until the Druid also takes the Order Magic feat!
  if (hasClassOrDual("druid") || featBySlug.has("order-spells")) {
    const key = `focus:druid:${classKind("druid")}`;
    const orderExplorerFeats = feats.filter(f => getItemSlug(f) === "order-explorer");
    const orderExplorerIds = new Set(orderExplorerFeats.map(f => f.id));
    const orderMagicFeats = feats.filter(f => getItemSlug(f) === "order-magic");

    // Collect any order slug/UUID explicitly selected inside Order Explorer's rulesSelections/ChoiceSets
    const exploredOrderTokens = new Set();
    for (const oe of orderExplorerFeats) {
      const sels = oe.flags?.pf2e?.rulesSelections;
      if (sels && typeof sels === "object") {
        for (const val of Object.values(sels)) {
          if (typeof val === "string" && val.trim()) {
            exploredOrderTokens.add(val.trim().toLowerCase());
            exploredOrderTokens.add(normalizeSlug(val));
          }
        }
      }
      for (const r of (Array.isArray(oe.system?.rules) ? oe.system.rules : [])) {
        if (r?.key === "ChoiceSet" && typeof r.selection === "string" && r.selection.trim()) {
          exploredOrderTokens.add(r.selection.trim().toLowerCase());
          exploredOrderTokens.add(normalizeSlug(r.selection));
        }
      }
    }

    const isOrderFeature = (f) => {
      const desc = String(f.system?.description?.value || "");
      return /<(?:strong|b|h[1-6])[^>]*>\s*Order\s+Spell\s*[:<]/i.test(desc);
    };

    const allOrderFeatures = feats.filter(isOrderFeature);
    const druidicOrderFeatIds = new Set(feats.filter(f => getItemSlug(f) === "druidic-order").map(f => f.id));
    const hasPrimaryMarkedOrder = allOrderFeatures.some(f => druidicOrderFeatIds.has(f.flags?.pf2e?.grantedBy?.id));
    const isExploredOrder = (f) => {
      if (!isOrderFeature(f) || orderExplorerFeats.length === 0) return false;
      const gBy = f.flags?.pf2e?.grantedBy?.id;
      if (gBy && orderExplorerIds.has(gBy)) return true;
      if (hasPrimaryMarkedOrder && (!gBy || !druidicOrderFeatIds.has(gBy))) return true;
      const fSlug = getItemSlug(f);
      const srcUuid = String(f._stats?.compendiumSource || f.flags?.core?.sourceId || "").toLowerCase();
      if (exploredOrderTokens.has(fSlug) || (srcUuid && exploredOrderTokens.has(srcUuid))) return true;
      // If multiple order features exist alongside Order Explorer, any order acquired at Lv 2+ is explored
      if (allOrderFeatures.length > 1 && inferFeatAcquiredLevel(f, 1) >= 2) return true;
      return false;
    };

    const exploredOrders = allOrderFeatures.filter(isExploredOrder);
    const exploredOrderIdSet = new Set(exploredOrders.map(f => f.id));

    const druidNonGrantExclusions = new Set([
      "order-explorer", "storm-born", "primal-focus", "primal-wellspring", "ley-line-conduit", "order-magic"
    ]);
    const druidSlugs = new Set([
      "order-spells", "advanced-elemental-spell", "untamed-form", "wild-shape",
      "wind-caller", "storm-lord", "primal-summons", "impaling-briars", "healing-sprout"
    ]);
    const druidGrantRe = /(?:you\s+(?:gain|learn|receive)|grants?\s+you)\s+(?:the\s+)?[^.<]{0,80}\border\s+spell\b/i;

    for (const f of feats) {
      if (exploredOrderIdSet.has(f.id)) continue;
      const fSlug = getItemSlug(f);
      if (druidNonGrantExclusions.has(fSlug)) continue;
      const desc = String(f.system?.description?.value || "");
      if (isOrderFeature(f)) {
        druidSlugs.add(fSlug);
      } else if (f.system?.traits?.value?.includes("druid") && druidGrantRe.test(desc) && !/(?:don't|do\s+not)\s+gain/i.test(desc)) {
        druidSlugs.add(fSlug);
      }
    }

    // Only unlock explored orders' initial Order Spells when the Druid actually has `Order Magic`!
    if (orderMagicFeats.length > 0) {
      let resolvedViaOrderMagic = 0;
      const matchedExploredIds = new Set();

      for (const om of orderMagicFeats) {
        const directRefs = extractDirectRuleSpellUuids(om);
        if (directRefs.length > 0) {
          for (const r of directRefs) {
            pushAutoSpell({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: r.isCantrip ? 0 : null,
              isCantrip: Boolean(r.isCantrip),
              isFocus: true,
              unlockLevel: inferFeatAcquiredLevel(om, 4),
              targetSourceKey: key,
              targetClassSlug: "druid",
              sourceLabel: om.name,
              tier: "feat",
              countsTowardRepertoire: false
            });
          }
          resolvedViaOrderMagic++;
          continue;
        }
        // Check if Order Magic's ChoiceSet / rulesSelections names a specific explored order
        const omQuals = extractActorQualifiers(actor, om);
        const targetOrder = exploredOrders.find(eo => {
          if (matchedExploredIds.has(eo.id)) return false;
          const eoSlug = getItemSlug(eo);
          const eoBase = eoSlug.replace(/-order$/, "");
          return omQuals.has(eoSlug) || (eoBase && omQuals.has(eoBase));
        });
        if (targetOrder) {
          matchedExploredIds.add(targetOrder.id);
          const orderSec = extractNamedSectionHtml(String(targetOrder.system?.description?.value || ""), [/^order\s+spell$/i]);
          for (const r of extractSpellRefsFromText(orderSec)) {
            pushAutoSpell({
              uuid: r.uuid,
              name: r.name,
              img: r.img,
              rank: r.isCantrip ? 0 : null,
              isCantrip: Boolean(r.isCantrip),
              isFocus: true,
              unlockLevel: inferFeatAcquiredLevel(om, 4),
              targetSourceKey: key,
              targetClassSlug: "druid",
              sourceLabel: `${om.name} (${targetOrder.name})`,
              tier: "order",
              countsTowardRepertoire: false
            });
          }
          resolvedViaOrderMagic++;
        }
      }

      const remainingMagicPicks = Math.max(0, orderMagicFeats.length - resolvedViaOrderMagic);
      const remainingExplored = exploredOrders.filter(eo => !matchedExploredIds.has(eo.id));
      if (remainingMagicPicks > 0 && remainingExplored.length > 0) {
        if (remainingExplored.length <= remainingMagicPicks) {
          const omUnlockLvl = inferFeatAcquiredLevel(orderMagicFeats[0], 4);
          for (const eo of remainingExplored) {
            const orderSec = extractNamedSectionHtml(String(eo.system?.description?.value || ""), [/^order\s+spell$/i]);
            for (const r of extractSpellRefsFromText(orderSec)) {
              pushAutoSpell({
                uuid: r.uuid,
                name: r.name,
                img: r.img,
                rank: r.isCantrip ? 0 : null,
                isCantrip: Boolean(r.isCantrip),
                isFocus: true,
                unlockLevel: omUnlockLvl,
                targetSourceKey: key,
                targetClassSlug: "druid",
                sourceLabel: `Order Magic (${eo.name})`,
                tier: "order",
                countsTowardRepertoire: false
              });
            }
          }
        } else {
          // Multiple explored orders, fewer Order Magic feats without ChoiceSet -> offer a 1-click choice!
          const opts = [];
          for (const eo of remainingExplored) {
            const orderSec = extractNamedSectionHtml(String(eo.system?.description?.value || ""), [/^order\s+spell$/i]);
            for (const r of extractSpellRefsFromText(orderSec)) {
              opts.push({
                uuid: r.uuid,
                name: r.name,
                img: r.img,
                rank: r.isCantrip ? 0 : (r.baseRank || 1),
                isCantrip: Boolean(r.isCantrip),
                qualifier: eo.name
              });
            }
          }
          if (opts.length > 0) {
            choiceGroups.push({
              id: `${key}:order-magic`,
              targetSourceKey: key,
              targetClassSlug: "druid",
              sourceLabel: "Order Magic",
              rank: 1,
              isCantrip: false,
              isFocus: true,
              isCurriculum: false,
              unlockLevel: inferFeatAcquiredLevel(orderMagicFeats[0], 4),
              pickCount: remainingMagicPicks,
              label: `Order Magic — Choose ${remainingMagicPicks} Explored Order Spell${remainingMagicPicks === 1 ? "" : "s"}`,
              options: opts
            });
          }
        }
      }
    }

    // Filter out explored orders before passing to addDirectFocusFeats
    const nonExploredDruidSlugs = new Set(druidSlugs);
    addDirectFocusFeats(nonExploredDruidSlugs, key, "druid", { sectionPatterns: [/^order\s+spell$/i] });
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

  // Generic Focus-Granting Feats (matches `focus:feat:<slug>` or folded focus feats, incl. Elementalist focus feats)
  const genericExclusions = /(?:^|-)(?:focus|wellspring|refocus|desperate-prayer|psi-strikes|psychic-dedication|conscious-mind|subconscious-mind|mercy|affliction-mercy|cruelty|covenant|order-explorer|martial-performance|storm-born|druidic-order|elementalist-dedication|expanded-elemental-magic|elemental-familiar|burning-spell|dousing-spell|current-spell|rockslide-spell|reverberating-spell|wind-tossed-spell|redirect-elements|metabolize-element)(?:$|-)|-(?:order|bloodline|mystery|patron|muse)$|^school-of-/;
  const genericGrantRe = /(?:you\s+(?:gain|learn|receive)|grants?\s+you|you\s+can\s+cast)\s+(?:the\s+)?[^.<]{0,80}\b(?:focus\s+spell|focus\s+pool)\b/i;
  const elementalistTradHint = hasElementalist
    ? resolveElementalistTradition(actor, dualInfo, primarySlug)
    : "";

  for (const f of feats) {
    if (isElementalistClassFeature(f)) continue;
    const slug = getItemSlug(f);
    if (genericExclusions.test(slug)) continue;
    const desc = String(f.system?.description?.value || "");
    if (/<(?:strong|b|h[1-6])[^>]*>\s*(?:Order|Bloodline|School|Revelation|Conflux|Vessel)\s+Spells?\s*[:<]/i.test(desc)) continue;
    if (!genericGrantRe.test(desc)) continue;
    if (/(?:don't|do\s+not)\s+(?:gain|learn|receive)[^.<]{0,60}\b(?:focus|order|composition)\b/i.test(desc)) continue;
    // Skip if already captured under a specific class/archetype focus source
    const fRefs = parseDirectFeatSpells(f, extractActorQualifiers(actor, f));
    if (fRefs.auto.length === 0 && !fRefs.choice) continue;
    const alreadyCovered = fRefs.auto.some(r => Array.from(autoKeySet).some(k => k.endsWith(`|${r.uuid.toLowerCase()}`)));
    if (alreadyCovered) continue;

    // Route to matching generic key `focus:feat:<slug>` (and analyzeSpellcasting also matches by tradition fallback!)
    const targetKey = `focus:feat:${slug}`;
    const uLvl = inferFeatAcquiredLevel(f, 1);
    const detectedTrad = (desc.match(/\b(arcane|divine|occult|primal)\b/i)?.[1] || "").toLowerCase()
      || (elementalistTradHint && /elemental/i.test(`${f.name} ${slug} ${desc}`) ? elementalistTradHint : "");
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
          fallbackTradition: detectedTrad
        });
      }
    } else if (fRefs.choice?.length > 0) {
      const choiceAlreadyCovered = fRefs.choice.some(opt => Array.from(autoKeySet).some(k => k.endsWith(`|${opt.uuid.toLowerCase()}`)));
      if (!choiceAlreadyCovered) {
        choiceGroups.push({
          id: `${targetKey}:choice`,
          targetSourceKey: targetKey,
          targetClassSlug: slug,
          sourceLabel: f.name,
          rank: 1,
          isCantrip: false,
          isFocus: true,
          isCurriculum: false,
          unlockLevel: uLvl,
          pickCount: 1,
          label: `${f.name} — Choose Focus Spell`,
          fallbackTradition: detectedTrad,
          options: fRefs.choice.map(r => ({
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
export function isSpellAlreadyInEntry(spellMeta, existingUuids, existingNames) {
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
