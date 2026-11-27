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
 *
 * Class/subclass/archetype-specific PF2e spellcasting rules & dynamic auto-spell discovery live in
 * `./spellcasting-rules.js` to keep this core completeness engine clean and modular.
 */

import { MODULE_ID } from "../constants.js";
import {
  ABILITY_LABELS,
  CASTING_TYPE_LABELS,
  TRADITION_LABELS,
  VARIANT_RULES_MODULE_ID,
  actorHasFeatSlug,
  capitalize,
  collectActorGrantedSpellsProgression,
  detectClericDivineFontChoice,
  detectExpectedSpellcastingSources,
  ensureDomainSpellCacheWarm,
  formatSlotsSummary,
  getCachedDomainSpell,
  getClericDivineFontCount,
  getItemSlug,
  isSpellAlreadyInEntry,
  normalizeSlug,
  resolveSpellDocumentByUuid,
  warmDomainSpellCache
} from "./spellcasting-rules.js";

// Re-export shared spellcasting constants & helpers for full backwards compatibility
export {
  ABILITY_LABELS,
  CASTING_TYPE_LABELS,
  TRADITION_LABELS,
  VARIANT_RULES_MODULE_ID,
  capitalize,
  collectActorGrantedSpellsProgression,
  formatSlotsSummary,
  normalizeSlug,
  resolveSpellDocumentByUuid
};

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

/* ------------------------------------------------------------------------- */
/* 1. NORMALIZATION & VARIANT RULE DETECTION HELPERS                         */
/* ------------------------------------------------------------------------- */

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
/* 1.5. PER-CHARACTER GM BONUSES & ISSUE ACKNOWLEDGEMENTS                    */
/* ------------------------------------------------------------------------- */

const OVERRIDES_FLAG_KEY = "checkerOverrides";
const SKILL_RANK_LABELS = ["Untrained", "Trained", "Expert", "Master", "Legendary"];
const SKILL_RANK_WORD_MAP = { trained: 1, expert: 2, master: 3, legendary: 4 };

/**
 * Produces a dot-free, deterministic issue key safe for Foundry dot-notation flag updates & ForcedDeletion.
 */
export function sanitizeIssueId(id) {
  return String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clampInt(val, min, max) {
  const n = Math.trunc(Number(val));
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function isOverridesObjectEmpty(ov) {
  if (!ov) return true;
  return ov.bonusTrainedSkills === 0
    && ov.bonusSkillIncreases === 0
    && ov.bonusLores === 0
    && ov.bonusLanguages === 0
    && !ov.note
    && Object.keys(ov.acknowledgedIssues || {}).length === 0;
}

/**
 * Reads normalized per-character GM bonuses and accepted/acknowledged issues
 * from `actor.flags[MODULE_ID].checkerOverrides`.
 *
 * @param {Actor} actor
 * @returns {{ bonusTrainedSkills: number, bonusSkillIncreases: number, bonusLores: number, bonusLanguages: number, note: string, acknowledgedIssues: Record<string, boolean> }}
 */
export function getCheckerOverrides(actor) {
  const empty = {
    bonusTrainedSkills: 0,
    bonusSkillIncreases: 0,
    bonusLores: 0,
    bonusLanguages: 0,
    note: "",
    acknowledgedIssues: {}
  };
  if (!actor || actor.type !== "character") return empty;
  const raw = actor.getFlag?.(MODULE_ID, OVERRIDES_FLAG_KEY);
  if (!raw || typeof raw !== "object") return empty;

  const acknowledgedIssues = {};
  if (raw.acknowledgedIssues && typeof raw.acknowledgedIssues === "object") {
    for (const [k, v] of Object.entries(raw.acknowledgedIssues)) {
      const safe = sanitizeIssueId(k);
      if (safe && Boolean(v)) acknowledgedIssues[safe] = true;
    }
  }

  return {
    bonusTrainedSkills: clampInt(raw.bonusTrainedSkills, -10, 20),
    bonusSkillIncreases: clampInt(raw.bonusSkillIncreases, -10, 20),
    bonusLores: clampInt(raw.bonusLores, 0, 20),
    bonusLanguages: clampInt(raw.bonusLanguages, -10, 20),
    note: String(raw.note || "").trim().slice(0, 240),
    acknowledgedIssues
  };
}

/**
 * Saves per-character GM bonuses & optional note while preserving existing accepted issues.
 * GM-only. Automatically clears the flag when all values are reset to defaults.
 */
export async function saveCheckerOverrides(actor, patch = {}) {
  if (!actor || actor.type !== "character" || !game.user?.isGM) return false;
  const current = getCheckerOverrides(actor);
  const next = {
    bonusTrainedSkills: "bonusTrainedSkills" in patch
      ? clampInt(patch.bonusTrainedSkills, -10, 20)
      : current.bonusTrainedSkills,
    bonusSkillIncreases: "bonusSkillIncreases" in patch
      ? clampInt(patch.bonusSkillIncreases, -10, 20)
      : current.bonusSkillIncreases,
    bonusLores: "bonusLores" in patch
      ? clampInt(patch.bonusLores, 0, 20)
      : current.bonusLores,
    bonusLanguages: "bonusLanguages" in patch
      ? clampInt(patch.bonusLanguages, -10, 20)
      : current.bonusLanguages,
    note: "note" in patch
      ? String(patch.note || "").trim().slice(0, 240)
      : current.note,
    acknowledgedIssues: { ...current.acknowledgedIssues }
  };

  if (isOverridesObjectEmpty(next)) {
    await actor.unsetFlag(MODULE_ID, OVERRIDES_FLAG_KEY);
  } else {
    await actor.setFlag(MODULE_ID, OVERRIDES_FLAG_KEY, next);
  }
  return true;
}

/**
 * Marks a specific checker issue ID as acknowledged/accepted by the GM on this character.
 */
export async function acknowledgeCheckerIssue(actor, issueId) {
  if (!actor || actor.type !== "character" || !game.user?.isGM) return false;
  const safeId = sanitizeIssueId(issueId);
  if (!safeId) return false;

  await actor.update({
    [`flags.${MODULE_ID}.${OVERRIDES_FLAG_KEY}.acknowledgedIssues.${safeId}`]: true
  });
  return true;
}

/**
 * Restores a previously acknowledged checker issue ID using Foundry v14 ForcedDeletion.
 */
export async function restoreCheckerIssue(actor, issueId) {
  if (!actor || actor.type !== "character" || !game.user?.isGM) return false;
  const safeId = sanitizeIssueId(issueId);
  if (!safeId) return false;

  const ForcedDeletion = foundry.data.operators.ForcedDeletion;
  const delOp = globalThis._del ?? (typeof ForcedDeletion === "function" ? new ForcedDeletion() : ForcedDeletion);

  await actor.update({
    [`flags.${MODULE_ID}.${OVERRIDES_FLAG_KEY}.acknowledgedIssues.${safeId}`]: delOp
  });

  // Clean up flag entirely if no bonuses, note, or remaining acknowledgements exist
  const after = getCheckerOverrides(actor);
  if (isOverridesObjectEmpty(after)) {
    await actor.unsetFlag(MODULE_ID, OVERRIDES_FLAG_KEY);
  }
  return true;
}

/**
 * Removes all GM bonuses, notes, and accepted issue overrides from this character.
 */
export async function clearCheckerOverrides(actor) {
  if (!actor || actor.type !== "character" || !game.user?.isGM) return false;
  await actor.unsetFlag(MODULE_ID, OVERRIDES_FLAG_KEY);
  return true;
}

/* ------------------------------------------------------------------------- */
/* 2. ATTRIBUTE BOOSTS ANALYSIS                                              */
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
        id: sanitizeIssueId(`attributes:missing-${key}`),
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
        id: "attributes:missing-dual-key",
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
/* 3. SKILLS & SKILL INCREASES ANALYSIS                                      */
/* ------------------------------------------------------------------------- */

/**
 * Splits a comma-separated argument list at top-level parentheses (no eval).
 */
function splitTopLevelArgs(str) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(str.slice(start).trim());
  return parts;
}

/**
 * Safely evaluates numeric/conditional PF2e Rule Element value expressions such as:
 *   2, "2", "ternary(gte(@actor.level,15),4,ternary(gte(@actor.level,7),3,2))",
 *   or bracketed objects `{ brackets: [{ start, end, value }] }`.
 * Zero `eval` / `Function` usage.
 */
function evaluateSkillRuleRankValue(rawVal, level, itemLevel = 1) {
  if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
    return Math.max(0, Math.min(4, Math.trunc(rawVal)));
  }

  if (rawVal && typeof rawVal === "object") {
    if (Array.isArray(rawVal.brackets)) {
      for (const b of rawVal.brackets) {
        const start = b?.start != null ? Number(b.start) : -Infinity;
        const end = b?.end != null ? Number(b.end) : Infinity;
        if (level >= start && level <= end) {
          return evaluateSkillRuleRankValue(b.value, level, itemLevel);
        }
      }
      return null;
    }
    if ("value" in rawVal) {
      return evaluateSkillRuleRankValue(rawVal.value, level, itemLevel);
    }
    return null;
  }

  if (typeof rawVal !== "string") return null;
  const trimmed = rawVal.trim();
  if (!trimmed) return null;

  const numDirect = Number(trimmed);
  if (Number.isFinite(numDirect)) {
    return Math.max(0, Math.min(4, Math.trunc(numDirect)));
  }

  // Substitute common level references safely
  const substituted = trimmed
    .replace(/@actor\.system\.details\.level\.value\b/gi, String(level))
    .replace(/@actor\.level\b/gi, String(level))
    .replace(/@item\.system\.level\.value\b/gi, String(itemLevel))
    .replace(/@item\.level\b/gi, String(itemLevel));

  const evalExpr = (expr, depth = 0) => {
    if (depth > 10) return null;
    let s = String(expr || "").trim();
    // Unwrap matching outer parentheses
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

    const fnMatch = s.match(/^([a-z]+)\(([\s\S]*)\)$/i);
    if (!fnMatch) return null;
    const fn = fnMatch[1].toLowerCase();
    const args = splitTopLevelArgs(fnMatch[2]);

    if (fn === "ternary" && args.length === 3) {
      const cond = evalExpr(args[0], depth + 1);
      if (cond === null) return null;
      return cond ? evalExpr(args[1], depth + 1) : evalExpr(args[2], depth + 1);
    }
    if ((fn === "gte" || fn === "gt" || fn === "lte" || fn === "lt" || fn === "eq") && args.length === 2) {
      const a = evalExpr(args[0], depth + 1);
      const b = evalExpr(args[1], depth + 1);
      if (a === null || b === null) return null;
      if (fn === "gte") return a >= b ? 1 : 0;
      if (fn === "gt") return a > b ? 1 : 0;
      if (fn === "lte") return a <= b ? 1 : 0;
      if (fn === "lt") return a < b ? 1 : 0;
      if (fn === "eq") return a === b ? 1 : 0;
    }
    if (fn === "min" || fn === "max") {
      const vals = args.map(a => evalExpr(a, depth + 1));
      if (vals.some(v => v === null)) return null;
      return fn === "min" ? Math.min(...vals) : Math.max(...vals);
    }
    return null;
  };

  const result = evalExpr(substituted);
  return result !== null && Number.isFinite(result)
    ? Math.max(0, Math.min(4, Math.trunc(result)))
    : null;
}

/**
 * Evaluates a PF2e Rule Element predicate array safely against actor level, pre-feat skill ranks,
 * and live `actor.rollOptions.all` (so level-gated Master/Legendary rules or unmet subclass
 * predicates are skipped cleanly).
 */
function evaluateSkillRulePredicate(predicate, actor, level, baseClassBgSet) {
  if (!Array.isArray(predicate) || predicate.length === 0) return true;
  const rollOpts = actor.rollOptions?.all && typeof actor.rollOptions.all === "object"
    ? actor.rollOptions.all
    : null;
  const hasRollOpts = Boolean(rollOpts && Object.keys(rollOpts).length > 0);

  const resolveMetric = (token) => {
    if (typeof token === "number") return token;
    const str = String(token || "").trim().toLowerCase();
    if (str === "self:level" || str === "actor:level" || str === "level") return level;
    const skMatch = str.match(/^skill:([a-z]+):rank$/);
    if (skMatch) {
      const slug = normalizeSkillSlug(skMatch[1]);
      if (CORE_SKILL_SLUGS.includes(slug)) {
        const srcRank = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);
        return Math.max(baseClassBgSet.has(slug) ? 1 : 0, srcRank);
      }
    }
    const num = Number(str);
    return Number.isFinite(num) ? num : null;
  };

  const evalClause = (clause) => {
    if (typeof clause === "string") {
      const term = clause.trim();
      if (!term) return true;
      const skRankMatch = term.match(/^skill:([a-z]+):rank:(\d+)$/i);
      if (skRankMatch) {
        const slug = normalizeSkillSlug(skRankMatch[1]);
        const reqRank = Number(skRankMatch[2]);
        const srcRank = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);
        const preRank = Math.max(baseClassBgSet.has(slug) ? 1 : 0, srcRank);
        return preRank >= reqRank;
      }
      if (hasRollOpts) return Boolean(rollOpts[term]);
      return true;
    }
    if (!clause || typeof clause !== "object") return true;

    if ("not" in clause) return !evalClause(clause.not);
    if (Array.isArray(clause.and)) return clause.and.every(evalClause);
    if (Array.isArray(clause.or)) return clause.or.some(evalClause);

    for (const op of ["gte", "gt", "lte", "lt", "eq"]) {
      if (Array.isArray(clause[op]) && clause[op].length === 2) {
        const lhs = resolveMetric(clause[op][0]);
        const rhs = resolveMetric(clause[op][1]);
        if (lhs === null || rhs === null) return true;
        if (op === "gte") return lhs >= rhs;
        if (op === "gt") return lhs > rhs;
        if (op === "lte") return lhs <= rhs;
        if (op === "lt") return lhs < rhs;
        if (op === "eq") return lhs === rhs;
      }
    }

    return true;
  };

  return predicate.every(evalClause);
}

/**
 * Strips HTML tags and PF2e enrichers from a feat description into plain text for fallback scanning.
 */
function stripHtmlToPlainText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/(?:p|li|div|h\d)>/gi, ". ")
    .replace(/@UUID\[[^\]]*\]\{([^}]+)\}/gi, "$1")
    .replace(/@(?:UUID|Check|Damage|Condition|Template|Localize)\[[^\]]*\]/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dynamically inspects all embedded PF2e items (feats, archetype dedications, class features,
 * heritages, ancestries) to detect:
 *  1. Auto-trained core skills (`ActiveEffectLike` rank 1+)
 *  2. Auto-upgraded skill ranks (`ActiveEffectLike` rank 2/3/4, level-scaling `ternary` formulas
 *     like Acrobat Dedication / Inventor Crafting, Medic Dedication Expert Medicine at Lv 2, etc.)
 *  3. Description-based fallback for archetype/dedication early rank upgrades lacking RE automation
 *  4. Trained-skill overlap replacements from Ancestry Lore feats & Dedications
 *  5. Free-choice skill feats (`Skill Mastery` +2 increases, unautomated `Skill Training` +1 trained)
 */
function collectItemSkillGrants(actor, level, baseClassBgSet) {
  const autoTrainedSlugs = new Set();
  const autoMinRankBySkill = {};
  const autoAddDeltaBySkill = {};
  const autoUpgradeSourceBySkill = {};
  const seenTrainedSources = new Set(baseClassBgSet);
  const featBonusIncreaseSources = [];
  const featBonusTrainedSources = [];
  const autoScalingLoreKeys = new Set();
  let featOverlapReplacements = 0;
  let featBonusIncreases = 0;
  let featBonusTrained = 0;

  const normalizeLoreKeySimple = (val) => String(val || "")
    .toLowerCase()
    .replace(/\blore\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const recordAutoRank = (slug, rank, sourceName, { upgradeOnly = false } = {}) => {
    if (!CORE_SKILL_SLUGS.includes(slug) || rank < 1) return;
    if (!upgradeOnly) {
      autoTrainedSlugs.add(slug);
    }
    if (rank >= 2 && rank > (autoMinRankBySkill[slug] || 0)) {
      autoMinRankBySkill[slug] = rank;
      autoUpgradeSourceBySkill[slug] = sourceName || "Archetype / Feature";
    }
  };

  const inspectableTypes = new Set(["feat", "heritage", "ancestry", "class", "background"]);

  for (const item of actor.items || []) {
    if (!inspectableTypes.has(item.type)) continue;

    const itemSlug = getItemSlug(item);
    const itemName = item.name || capitalize(itemSlug);
    const itemLevel = Math.max(1, Number(item.system?.level?.value ?? 1));
    const rules = Array.isArray(item.system?.rules) ? item.system.rules : [];
    const selections = item.flags?.pf2e?.rulesSelections || {};
    const plainDesc = stripHtmlToPlainText(item.system?.description?.value);
    const prereqText = (Array.isArray(item.system?.prerequisites?.value) ? item.system.prerequisites.value : [])
      .map(p => (typeof p === "string" ? p : (p?.value || "")))
      .join(" ")
      .toLowerCase();

    const itemRequiresTrainedIn = (slug) => {
      if (!slug) return false;
      const re = new RegExp(`\\b${slug}\\b`, "i");
      if (prereqText && re.test(prereqText)) return true;
      return false;
    };

    // Track auto-scaling Lore feats (e.g. Additional Lore, Esoteric Lore, Bardic Lore)
    if (item.type === "feat" && (itemSlug === "additional-lore" || itemSlug === "esoteric-lore" || itemSlug === "bardic-lore" || itemSlug === "loremaster-dedication")) {
      for (const val of Object.values(selections)) {
        const rawStr = typeof val === "string" ? val : (typeof val?.value === "string" ? val.value : "");
        const k = normalizeLoreKeySimple(rawStr);
        if (k) autoScalingLoreKeys.add(k);
      }
      if (itemSlug === "esoteric-lore") autoScalingLoreKeys.add("esoteric");
      if (itemSlug === "bardic-lore") autoScalingLoreKeys.add("bardic");
      if (itemSlug === "loremaster-dedication") autoScalingLoreKeys.add("loremaster");
    }

    // Identify whether this item already resolved any ChoiceSet to a core skill
    const resolvedChoiceSkillSlugs = new Set();
    for (const val of Object.values(selections)) {
      const rawStr = typeof val === "string" ? val : (typeof val?.value === "string" ? val.value : "");
      const norm = normalizeSkillSlug(rawStr);
      if (CORE_SKILL_SLUGS.includes(norm)) resolvedChoiceSkillSlugs.add(norm);
    }

    const itemResolvedTrainedSlugs = new Set();
    const itemResolvedUpgradeSlugs = new Set();
    const itemPendingGrants = [];

    // Pass 1: PF2e ActiveEffectLike Rule Elements targeting `system.skills.<slug>.rank`
    for (const rule of rules) {
      if (rule?.key !== "ActiveEffectLike" || typeof rule.path !== "string") continue;

      const hadTemplate = /\{item\|flags\.pf2e\.rulesSelections\.[^}]+\}/.test(rule.path);
      const resolvedPath = rule.path.replace(/\{item\|flags\.pf2e\.rulesSelections\.([^}]+)\}/g, (_, k) => {
        const sel = selections[k];
        if (typeof sel === "string") return sel;
        if (sel && typeof sel === "object" && typeof sel.value === "string") return sel.value;
        return "";
      });

      const m = resolvedPath.match(/^system\.skills\.([a-z]+)\.rank$/i);
      if (!m) continue;
      const slug = normalizeSkillSlug(m[1]);
      if (!CORE_SKILL_SLUGS.includes(slug)) continue;

      if (!evaluateSkillRulePredicate(rule.predicate, actor, level, baseClassBgSet)) continue;

      const mode = String(rule.mode || "upgrade").toLowerCase();
      let grantedRank = evaluateSkillRuleRankValue(rule.value, level, itemLevel);
      const srcRank = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);
      const effRank = Number(actor.system?.skills?.[slug]?.rank ?? 0);

      if (mode === "add") {
        const delta = Math.max(1, grantedRank ?? 1);
        autoAddDeltaBySkill[slug] = (autoAddDeltaBySkill[slug] || 0) + delta;
        const preRank = Math.max(seenTrainedSources.has(slug) ? 1 : 0, Math.min(1, srcRank));
        grantedRank = Math.min(4, preRank + delta);
      } else if (grantedRank === null) {
        grantedRank = 1;
      }

      if (grantedRank < 1) continue;

      itemPendingGrants.push({
        slug,
        grantedRank,
        hadTemplate,
        mode,
        srcRank,
        hasSkillPredicate: Array.isArray(rule.predicate) && JSON.stringify(rule.predicate).toLowerCase().includes(`skill:${slug}:rank`)
      });
    }

    // Aggregate per-item skill grants so upgrade-only dedications (e.g. Medic, Acrobat, Dandy,
    // Archaeologist, Bounty Hunter when already trained) never inflate expected trained skill counts!
    const upgradedOnThisItem = new Set(itemPendingGrants.filter(g => g.grantedRank >= 2).map(g => g.slug));

    for (const g of itemPendingGrants) {
      const { slug, grantedRank, hadTemplate, mode, srcRank, hasSkillPredicate } = g;
      const isUpgradeOnly = (
        (grantedRank >= 2 && (itemRequiresTrainedIn(slug) || hasSkillPredicate || srcRank >= 1))
        || (upgradedOnThisItem.has(slug) && srcRank >= 1 && !baseClassBgSet.has(slug))
        || (mode === "add" && srcRank >= 1)
      );

      recordAutoRank(slug, grantedRank, itemName, { upgradeOnly: isUpgradeOnly });
      itemResolvedTrainedSlugs.add(slug);
      if (grantedRank >= 2) itemResolvedUpgradeSlugs.add(slug);

      // Detect Trained-skill overlap replacement on feats (e.g. Elven Lore / Dedications granting a static Trained skill already known)
      if (
        item.type === "feat"
        && grantedRank === 1
        && !isUpgradeOnly
        && !upgradedOnThisItem.has(slug)
        && !hadTemplate
        && seenTrainedSources.has(slug)
        && !Array.from(resolvedChoiceSkillSlugs).some(s => s !== slug)
      ) {
        const isAncestryLoreFeat = /-lore$/.test(itemSlug) && itemSlug !== "additional-lore";
        const descGrantsReplacement = /(?:already\s+trained|would\s+automatically\s+become\s+trained)[\s\S]{0,180}?(?:skill\s+of\s+your\s+choice|another\s+skill)/i.test(plainDesc);
        if (isAncestryLoreFeat || descGrantsReplacement) {
          featOverlapReplacements++;
        }
      }

      if (!isUpgradeOnly) {
        seenTrainedSources.add(slug);
      }
    }

    // Pass 2: Standard PF2e free-choice skill feats (only if not already automated by REs)
    if (item.type === "feat") {
      if (itemSlug === "skill-mastery" || /^skill-mastery-/.test(itemSlug)) {
        const remaining = Math.max(0, 2 - itemResolvedUpgradeSlugs.size);
        if (remaining > 0) {
          featBonusIncreases += remaining;
          featBonusIncreaseSources.push({ source: itemName, count: remaining });
        }
      } else if (itemSlug === "skill-training") {
        if (itemResolvedTrainedSlugs.size === 0) {
          featBonusTrained += 1;
          featBonusTrainedSources.push({ source: itemName, count: 1 });
        }
      }
    }

    // Pass 3: Safe sentence-scoped description fallback for archetype/feat rank upgrades
    // (handles unautomated or homebrew dedications like Medic/Acrobat/Archaeologist/Dandy)
    if ((item.type === "feat" || item.type === "heritage") && plainDesc) {
      const sentences = plainDesc.split(/(?<=[.!?;])\s+|,\s*(?=and\s+at\s+\d+(?:st|nd|rd|th)\s+level\b)|(?=\band\s+at\s+\d+(?:st|nd|rd|th)\s+level\b)/i);
      for (const sentence of sentences) {
        if (!/\b(?:expert|master|legendary)\b/i.test(sentence)) continue;
        // Skip conditional requirement checks ("if you are an expert in Medicine, you heal...")
        if (/\b(?:if|when|while)\s+you\s+(?:are|become)\s+(?:an?\s+)?(?:expert|master|legendary)\b/i.test(sentence)) continue;

        // Check level gate in the sentence (e.g. "At 7th level, you become a master in Acrobatics")
        const lvlGateMatch = sentence.match(/\bat\s+(\d+)(?:st|nd|rd|th)\s+level\b/i);
        if (lvlGateMatch && level < Number(lvlGateMatch[1])) continue;

        const requiresPreTrained = /\bif\s+you\s+(?:are|were)\s+already\s+trained\b/i.test(sentence);

        let targetRank = 0;
        let skillClause = "";

        const mBecome = sentence.match(/\byou\s+become\s+(?:an?\s+)?(expert|master|legendary)\s+in\s+([^.;]+)/i);
        if (mBecome) {
          targetRank = SKILL_RANK_WORD_MAP[mBecome[1].toLowerCase()] || 0;
          skillClause = mBecome[2] || "";
        } else {
          const mIncrease = sentence.match(/\b(?:your\s+proficiency\s+rank\s+in|increase\s+your\s+proficiency\s+rank\s+in)\s+([^.;]+?)\s+(?:increases?\s+to|to)\s+(expert|master|legendary)\b/i);
          if (mIncrease) {
            skillClause = mIncrease[1] || "";
            targetRank = SKILL_RANK_WORD_MAP[mIncrease[2].toLowerCase()] || 0;
          }
        }

        if (targetRank < 2 || !skillClause) continue;

        // Trim trailing non-skill clauses ("instead", "and you gain...", "for the purposes of...", etc.)
        const trimmedClause = skillClause.split(/\b(?:instead|rather|when|while|for|with|if|which|that|as well as|and you|and gain|and can)\b/i)[0] || "";
        const mentioned = CORE_SKILL_SLUGS.filter(s => new RegExp(`\\b${s}\\b`, "i").test(trimmedClause));
        if (mentioned.length === 0) continue;

        const isChoiceOr = mentioned.length > 1 && /\bor\b/i.test(trimmedClause) && !/\band\b/i.test(trimmedClause);
        if (isChoiceOr) {
          // Only credit at most one skill from an "A or B" choice — pick whichever is actually >= targetRank
          const chosen = mentioned.find(slug => {
            if (itemResolvedUpgradeSlugs.has(slug)) return false;
            const eff = Number(actor.system?.skills?.[slug]?.rank ?? 0);
            const src = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);
            return Math.max(eff, src) >= targetRank;
          });
          if (chosen) {
            recordAutoRank(chosen, targetRank, itemName, { upgradeOnly: true });
          }
        } else {
          for (const slug of mentioned) {
            if (itemResolvedUpgradeSlugs.has(slug)) continue;
            if (requiresPreTrained) {
              const src = Number(actor._source?.system?.skills?.[slug]?.rank ?? 0);
              const eff = Number(actor.system?.skills?.[slug]?.rank ?? 0);
              if (!baseClassBgSet.has(slug) && src < 1 && eff < targetRank) continue;
            }
            recordAutoRank(slug, targetRank, itemName, { upgradeOnly: true });
          }
        }
      }
    }
  }

  return {
    autoTrainedSlugs,
    autoMinRankBySkill,
    autoAddDeltaBySkill,
    autoUpgradeSourceBySkill,
    featOverlapReplacements,
    featBonusIncreases,
    featBonusIncreaseSources,
    featBonusTrained,
    featBonusTrainedSources,
    autoScalingLoreKeys
  };
}

function analyzeSkills(actor, level, dualInfo, overrides = null) {
  const ov = overrides || getCheckerOverrides(actor);
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  const pClassSys = actor.class?.system || {};
  const dClassSys = dualInfo?.system || null;
  const bgSys = actor.background?.system || {};

  // Compute Skill Increase schedule upfront so Rogue/Investigator Level 2 Expert cap is exact!
  const defaultIncLevels = [3, 5, 7, 9, 11, 13, 15, 17, 19];
  const primaryIncLevels = extractLevelArray(pClassSys.skillIncreaseLevels);
  const dualIncLevels = dClassSys ? extractLevelArray(dClassSys.skillIncreaseLevels) : [];

  const mergedIncSet = new Set(primaryIncLevels.length > 0 ? primaryIncLevels : (actor.class ? defaultIncLevels : []));
  for (const l of dualIncLevels) mergedIncSet.add(l);

  const unlockedIncreaseLevels = Array.from(mergedIncSet)
    .filter(l => l <= level)
    .sort((a, b) => a - b);

  const isFastProgression = unlockedIncreaseLevels.includes(2) || primaryIncLevels.includes(2) || dualIncLevels.includes(2);
  const expertMinLevel = isFastProgression ? 2 : 3;

  // 1. Gather automatic core skill grants from Class, Dual Class, Background, and Item Rule Elements / Archetypes
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
  const baseOverlapReplacements = Math.max(0, allClassBgRaw.length - uniqueClassBgSet.size);

  // Detect skills, rank auto-upgrades (Medic/Acrobat/Inventor/etc.), overlaps & bonus feats from embedded items
  const itemGrants = collectItemSkillGrants(actor, level, uniqueClassBgSet);
  const overlapReplacements = baseOverlapReplacements + itemGrants.featOverlapReplacements;
  const autoTrainedSet = new Set([...uniqueClassBgSet, ...itemGrants.autoTrainedSlugs]);

  let trainedCoreCount = 0;
  let manualCoreIncreasesSpent = 0;
  const rankCounts = { trained: 0, expert: 0, master: 0, legendary: 0 };
  const overCapSkills = [];
  const autoSkillUpgrades = [];

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

    // Highest proficiency rank automatically granted by PF2e Rule Elements, Archetypes, or Class Features.
    // For additive (`mode: "add"`) rules, avoid treating player-stacked `effRank` as the baseline so manual
    // increases spent on top of an additive bonus still count accurately.
    const addDelta = Number(itemGrants.autoAddDeltaBySkill?.[slug] || 0);
    const liveUpgradeBaseline = addDelta > 0 ? 0 : (effRank > srcRank ? effRank : 0);
    const autoMinRank = Math.max(
      itemGrants.autoMinRankBySkill[slug] || 0,
      liveUpgradeBaseline,
      autoTrainedSet.has(slug) ? 1 : 0
    );

    if (autoMinRank >= 2) {
      autoSkillUpgrades.push({
        slug,
        label: capitalize(slug),
        rank: autoMinRank,
        rankLabel: SKILL_RANK_LABELS[autoMinRank] || `Rank ${autoMinRank}`,
        source: itemGrants.autoUpgradeSourceBySkill[slug] || "Archetype / Feature"
      });
    }

    // Only count manual skill increases spent ABOVE the auto-granted baseline (so Medic Dedication
    // granting Expert at Lv 2 never charges a class increase even if later upgraded to Master at Lv 7!)
    const manualIncreasesForSkill = addDelta > 0
      ? Math.max(0, srcRank - 1)
      : Math.max(0, srcRank - Math.max(1, autoMinRank));
    if (manualIncreasesForSkill > 0) {
      manualCoreIncreasesSpent += manualIncreasesForSkill;
    }

    // Verify PF2e level caps ONLY on ranks manually bumped above auto-granted minimums
    if (srcRank > autoMinRank) {
      if (srcRank === 2 && level < expertMinLevel) {
        overCapSkills.push({
          slug,
          rank: 2,
          issueId: sanitizeIssueId(`skills:over-cap:${slug}:2`),
          label: capitalize(slug),
          rankLabel: "Expert",
          requiredLevel: expertMinLevel
        });
      } else if (srcRank === 3 && level < 7) {
        overCapSkills.push({
          slug,
          rank: 3,
          issueId: sanitizeIssueId(`skills:over-cap:${slug}:3`),
          label: capitalize(slug),
          rankLabel: "Master",
          requiredLevel: 7
        });
      } else if (srcRank >= 4 && level < 15) {
        overCapSkills.push({
          slug,
          rank: 4,
          issueId: sanitizeIssueId(`skills:over-cap:${slug}:4`),
          label: capitalize(slug),
          rankLabel: "Legendary",
          requiredLevel: 15
        });
      }
    }
  }

  // 2. Additional trained skills from Class (higher of Dual Classes) + INT modifier + Feats + GM Bonus
  const primaryAdd = Number(pClassSys.trainedSkills?.additional ?? 0);
  const dualAdd = dClassSys ? Number(dClassSys.trainedSkills?.additional ?? 0) : 0;
  const effectiveClassAdd = dualInfo ? Math.max(primaryAdd, dualAdd) : primaryAdd;
  const classAddSource = dualInfo && dualAdd > primaryAdd
    ? dualInfo.name
    : (actor.class?.name || "Class");

  const additionalFromClassAndInt = actor.class
    ? Math.max(0, effectiveClassAdd + intMod)
    : Math.max(0, intMod);

  const gmBonusTrained = ov.bonusTrainedSkills || 0;
  const gmBonusIncreases = ov.bonusSkillIncreases || 0;
  const gmBonusLores = Math.max(0, ov.bonusLores || 0);

  const expectedTrainedRaw = Math.max(
    0,
    autoTrainedSet.size + overlapReplacements + additionalFromClassAndInt + itemGrants.featBonusTrained + gmBonusTrained
  );

  // 3. Lore skills (Background lore, Additional Lore feats, GM-awarded Bonus Lores, extra manual Lores)
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

  // Feats that auto-grant a Lore item (Additional Lore, Esoteric Lore, Bardic Lore, Ancestry Lore feats like Elven Lore, etc.)
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
    const isAncestryLoreFeat = feat.system?.category === "ancestry" && /-lore$/.test(slug);
    const hasLoreRule = Array.isArray(feat.system?.rules)
      && feat.system.rules.some(r => r?.key === "Lore" || (r?.key === "GrantItem" && typeof r?.uuid === "string" && /\blore\b/i.test(r.uuid)));
    if (loreGrantingFeatSlugs.has(slug) || isAncestryLoreFeat || hasLoreRule) {
      featLoreCount++;
    }
  }

  // Count Lore items with PF2e grantedBy flag or auto-scaling Lore feat match
  const grantedLoreIds = new Set();
  for (const lore of loreItems) {
    if (lore.flags?.pf2e?.grantedBy?.id) grantedLoreIds.add(lore.id);
    const loreKey = normalizeLoreKey(lore.name);
    const isAutoScalingLore = grantedLoreIds.has(lore.id)
      || (loreKey && itemGrants.autoScalingLoreKeys.has(loreKey));
    const srcLoreRank = Number(lore._source?.system?.proficient?.value ?? 1);
    if (srcLoreRank > 1 && !isAutoScalingLore) {
      manualLoreIncreasesSpent += (srcLoreRank - 1);
    }
  }

  const expectedMinLores = expectedBgLoreCount + featLoreCount + gmBonusLores;
  const missingLoreCount = Math.max(missingBgLores.length, Math.max(0, expectedMinLores - loreItems.length));
  const effectiveAutoLores = Math.max(expectedMinLores, grantedLoreIds.size + gmBonusLores);
  const extraManualLores = Math.max(0, loreItems.length - effectiveAutoLores);

  // Players can spend trained skill picks on either Core Skills OR extra Lore skills
  const currentTrainedEffective = trainedCoreCount + extraManualLores;
  const missingTrainedSkills = Math.max(0, expectedTrainedRaw - currentTrainedEffective);
  const extraTrainedSkills = Math.max(0, currentTrainedEffective - expectedTrainedRaw);

  // 4. Skill Increases by Level + Archetype/Feat Bonus Increases (e.g. Skill Mastery) + GM Bonus
  const expectedIncreases = Math.max(0, unlockedIncreaseLevels.length + itemGrants.featBonusIncreases + gmBonusIncreases);
  const spentIncreases = manualCoreIncreasesSpent + manualLoreIncreasesSpent;

  // If a player used a skill increase to become Trained in a brand-new skill (legal in PF2e!)
  const increasesUsedForTraining = spentIncreases < expectedIncreases
    ? Math.min(expectedIncreases - spentIncreases, extraTrainedSkills)
    : 0;
  const effectiveIncreasesSpent = spentIncreases + increasesUsedForTraining;
  const missingIncreases = Math.max(0, expectedIncreases - effectiveIncreasesSpent);
  const excessIncreases = Math.max(0, spentIncreases - expectedIncreases);
  const unexplainedExtraTrained = Math.max(0, extraTrainedSkills - increasesUsedForTraining);

  // Build readable formula breakdown
  const formulaParts = [];
  if (autoTrainedSet.size > 0) formulaParts.push(`${autoTrainedSet.size} Auto (Class/BG/Features)`);
  if (overlapReplacements > 0) formulaParts.push(`+${overlapReplacements} Overlap Bonus`);
  if (actor.class) formulaParts.push(`+${effectiveClassAdd} ${classAddSource}`);
  if (intMod !== 0) formulaParts.push(`${intMod > 0 ? "+" : ""}${intMod} INT`);
  if (itemGrants.featBonusTrained > 0) formulaParts.push(`+${itemGrants.featBonusTrained} Feat Bonus`);
  if (gmBonusTrained !== 0) formulaParts.push(`${gmBonusTrained > 0 ? "+" : ""}${gmBonusTrained} GM Bonus`);
  const formulaText = formulaParts.join(" ") || "Select a Class & Background";

  // Build readable bonus skill increases breakdown (Skill Mastery, GM Bonus, etc.)
  const increaseBonusParts = [];
  for (const s of itemGrants.featBonusIncreaseSources) {
    increaseBonusParts.push(`+${s.count} ${s.source}`);
  }
  if (gmBonusIncreases !== 0) {
    increaseBonusParts.push(`${gmBonusIncreases > 0 ? "+" : ""}${gmBonusIncreases} GM Bonus`);
  }
  const increaseBonusText = increaseBonusParts.join(", ");
  const autoSkillUpgradesText = autoSkillUpgrades
    .map(u => `${u.label} (${u.rankLabel} — ${u.source})`)
    .join(", ");

  const issues = [];
  if (actor.class && missingTrainedSkills > 0) {
    issues.push({
      id: "skills:missing-trained",
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingTrainedSkills} Trained Skill${missingTrainedSkills === 1 ? "" : "s"} (${currentTrainedEffective}/${expectedTrainedRaw})`,
      detail: `Expected ${expectedTrainedRaw} trained skills (${formulaText})${expectedBgLoreCount ? ` plus ${expectedBgLoreCount} Background Lore` : ""}.`
    });
  }
  if (actor.class && unexplainedExtraTrained > 0) {
    issues.push({
      id: "skills:extra-trained",
      severity: "info",
      category: "Skills",
      title: `${unexplainedExtraTrained} Extra Trained Skill${unexplainedExtraTrained === 1 ? "" : "s"} / Lore (${currentTrainedEffective}/${expectedTrainedRaw})`,
      detail: `Expected ${expectedTrainedRaw} trained skills (${formulaText}). If this is a GM reward or extra Lore, add it in GM Adjustments or click Accept.`
    });
  }
  if (missingBgLores.length > 0) {
    issues.push({
      id: "skills:missing-bg-lore",
      severity: "warning",
      category: "Skills",
      title: `Missing Background Lore: ${missingBgLores.join(", ")}`,
      detail: `Your ${actor.background?.name || "Background"} grants Trained in ${missingBgLores.join(", ")}. Add the Lore skill on the Skills tab.`
    });
  } else if (expectedBgLoreCount > 0 && loreItems.length < expectedBgLoreCount) {
    issues.push({
      id: "skills:missing-bg-lore",
      severity: "warning",
      category: "Skills",
      title: `Missing Background Lore (${loreItems.length}/${expectedBgLoreCount})`,
      detail: `Your ${actor.background?.name || "Background"} grants a Lore skill${bgCustomSkillText ? ` (${bgCustomSkillText})` : ""}, but no Lore skill is on the sheet yet.`
    });
  } else if (missingLoreCount > 0) {
    const loreSourceNotes = [];
    if (expectedBgLoreCount > 0) loreSourceNotes.push(`Background (${expectedBgLoreCount})`);
    if (featLoreCount > 0) loreSourceNotes.push(`Lore feats (${featLoreCount})`);
    if (gmBonusLores > 0) loreSourceNotes.push(`GM Bonus (${gmBonusLores})`);
    issues.push({
      id: "skills:missing-lore",
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingLoreCount} Lore Skill${missingLoreCount === 1 ? "" : "s"} (${loreItems.length}/${expectedMinLores})`,
      detail: `Expected at least ${expectedMinLores} Lore skill(s) from ${loreSourceNotes.join(", ") || "character features"}.`
    });
  }
  if (actor.class && missingIncreases > 0) {
    issues.push({
      id: "skills:missing-increases",
      severity: "warning",
      category: "Skills",
      title: `Missing ${missingIncreases} Skill Increase${missingIncreases === 1 ? "" : "s"} (${effectiveIncreasesSpent}/${expectedIncreases})`,
      detail: `At Level ${level}, you have earned ${expectedIncreases} skill increase(s)${unlockedIncreaseLevels.length > 0 ? ` at level(s): ${unlockedIncreaseLevels.join(", ")}` : ""}${increaseBonusText ? ` (${increaseBonusText})` : ""}.`
    });
  }
  if (actor.class && excessIncreases > 0) {
    issues.push({
      id: "skills:excess-increases",
      severity: "warning",
      category: "Skills",
      title: `${excessIncreases} Extra Skill Increase${excessIncreases === 1 ? "" : "s"} Spent (${spentIncreases}/${expectedIncreases})`,
      detail: `Sheet has ${spentIncreases} manual skill increase(s) spent vs ${expectedIncreases} expected${increaseBonusText ? ` (including ${increaseBonusText})` : ""}. Add a GM Bonus in GM Adjustments or click Accept.`
    });
  }
  for (const s of overCapSkills) {
    issues.push({
      id: s.issueId,
      severity: "warning",
      category: "Skills",
      title: `Skill Above Level Cap: ${s.label} (${s.rankLabel})`,
      detail: `${s.label} is ${s.rankLabel}, which normally requires Level ${s.requiredLevel}+ unless granted by an archetype, feat, or GM boon.`
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
    gmBonusTrained,
    gmBonusIncreases,
    gmBonusLores,
    featBonusTrained: itemGrants.featBonusTrained,
    featBonusIncreases: itemGrants.featBonusIncreases,
    currentTrained: currentTrainedEffective,
    missingTrained: missingTrainedSkills,
    extraTrained: extraTrainedSkills,
    unexplainedExtraTrained,
    trainedStatus: missingTrainedSkills > 0 ? "missing" : (unexplainedExtraTrained > 0 ? "extra" : "complete"),
    expectedIncreases,
    spentIncreases: effectiveIncreasesSpent,
    rawSpentIncreases: spentIncreases,
    increasesUsedForTraining,
    missingIncreases,
    excessIncreases,
    unlockedIncreaseLevels,
    increaseLevelsText: unlockedIncreaseLevels.length > 0 ? unlockedIncreaseLevels.join(", ") : `None yet (starts Lv ${expertMinLevel})`,
    increaseBonusText,
    autoSkillUpgrades,
    autoSkillUpgradesText,
    hasAutoSkillUpgrades: autoSkillUpgrades.length > 0,
    isFastProgression,
    increasesStatus: missingIncreases > 0 ? "missing" : (excessIncreases > 0 ? "extra" : "complete"),
    overCapSkills,
    rankCounts,
    formulaText,
    issues
  };
}

/* ------------------------------------------------------------------------- */
/* 3.5. ALCHEMIST & CRAFTING FORMULAS ANALYSIS                               */
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
      id: "formulas:missing",
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
/* 4. FEATS & FEAT SLOTS ANALYSIS                                            */
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
          id: sanitizeIssueId(`feats:empty-${group.id}`),
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
        id: "feats:missing-dual-features",
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
/* 5. SPELLCASTING ANALYSIS & ENTRY MATCHING                                 */
/* ------------------------------------------------------------------------- */

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
  if (grantedProg.hasDeferredDomain) {
    ensureDomainSpellCacheWarm();
  }

  // Re-map any generic `focus:feat:*` spells or choice groups folded into an existing same-tradition focus source
  const sourceKeysSet = new Set(expectedSources.map(s => s.key));
  for (const sp of grantedProg.autoSpells) {
    if (!sourceKeysSet.has(sp.targetSourceKey) && sp.isFocus && sp.fallbackTradition) {
      const folded = expectedSources.find(s => s.isFocus && s.tradition === sp.fallbackTradition);
      if (folded) sp.targetSourceKey = folded.key;
    }
  }
  for (const g of grantedProg.choiceGroups) {
    if (!sourceKeysSet.has(g.targetSourceKey) && g.isFocus && g.fallbackTradition) {
      const folded = expectedSources.find(s => s.isFocus && s.tradition === g.fallbackTradition);
      if (folded) g.targetSourceKey = folded.key;
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
        id: sanitizeIssueId(`spells:missing-entry:${src.key}`),
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
          id: sanitizeIssueId(`spells:focus-missing:${src.key}`),
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

    const hasTooManySlots = slotDiffs.some(d => d.current > d.expected);
    const hasTooFewSlots = slotDiffs.some(d => d.current < d.expected);
    const onlyCantripSlotDiff = !flexibleMismatch && slotDiffs.length === 1 && slotDiffs[0].rank === 0;

    let slotIssueKind = null;
    let slotStatusLabel = "";
    let slotIssueHeading = "";
    let slotDiffPrefix = "Slot differences";
    if (slotsOutdated) {
      if (hasTooManySlots && !hasTooFewSlots && !flexibleMismatch) {
        slotIssueKind = "excess";
        slotStatusLabel = onlyCantripSlotDiff ? "Too Many Cantrips" : "Too Many Slots";
        slotIssueHeading = onlyCantripSlotDiff ? "Too Many Cantrip Slots" : "Too Many Spell Slots";
        slotDiffPrefix = onlyCantripSlotDiff ? "Too many cantrip slots" : "Too many spell slots";
      } else if (hasTooFewSlots && !hasTooManySlots && !flexibleMismatch) {
        slotIssueKind = "outdated";
        slotStatusLabel = "Slots Outdated";
        slotIssueHeading = "Spell Slots Outdated";
        slotDiffPrefix = "Slot differences";
      } else {
        slotIssueKind = "misconfigured";
        slotStatusLabel = "Slots Misconfigured";
        slotIssueHeading = "Spell Slots Misconfigured";
        slotDiffPrefix = "Misconfigured slots";
      }
    }

    const diffParts = slotDiffs.map(d => `${d.label}: ${d.current}→${d.expected}`);
    if (flexibleMismatch) diffParts.push("Flexible Casting disabled");
    const slotDiffText = diffParts.join(", ");

    const missingCantrips = Math.max(0, src.cantrips - currentCantrips);
    const missingRepertoire = src.repertoireExpected != null
      ? Math.max(0, src.repertoireExpected - currentLeveledSpells)
      : (src.totalLeveledSlots > 0 && currentLeveledSpells === 0 ? src.totalLeveledSlots : 0);

    let status = "complete";
    let statusLabel = "Ready";
    if (slotsOutdated) {
      status = "outdated";
      statusLabel = slotStatusLabel;
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
      slotIssueKind,
      slotStatusLabel,
      slotDiffPrefix,
      onlyCantripSlotDiff,
      slotDiffs,
      slotDiffText,
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
      const expectedLine = onlyCantripSlotDiff
        ? `Level ${level} expects ${src.cantrips} cantrip slot${src.cantrips === 1 ? "" : "s"}`
        : `Level ${level} expects ${src.slotsSummary}${src.castingType === "prepared" && src.cantrips > 0 ? ` (${src.cantrips} cantrips)` : ""}`;
      issues.push({
        id: sanitizeIssueId(`spells:slots-outdated:${src.key}`),
        severity: "warning",
        category: "Spellcasting",
        title: `${slotIssueHeading}: ${entry.name}`,
        detail: `${expectedLine} (${slotDiffText}).${missingAutoSpells.length > 0 ? ` Also ${missingAutoSpells.length} auto-granted spell(s) ready to add.` : ""}`
      });
    } else if (missingAutoSpells.length > 0 || needsFontPrepare || missingCantrips > 0 || missingRepertoire > 0 || pendingChoiceGroups.length > 0) {
      issues.push({
        id: sanitizeIssueId(`spells:incomplete:${src.key}`),
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
/* 6. CREATE / SYNC SPELLCASTING ENTRIES & AUTO-GRANTED SPELLS ON ACTOR      */
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
      targetUuid = getCachedDomainSpell(cand.domainSlug, cand.domainTier || "initial")?.uuid || null;
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
  const fontCount = Math.max(1, Number(spec.divineFontCount || spec.slots?.[fontRank] || getClericDivineFontCount(level)));
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
/* 7. MASTER CHARACTER COMPLETENESS ANALYZER                                 */
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
  const overrides = getCheckerOverrides(actor);
  const ackMap = overrides.acknowledgedIssues || {};
  const isAck = (issueId) => Boolean(issueId && ackMap[sanitizeIssueId(issueId)]);

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
        id: sanitizeIssueId(`core:missing-${ci.key}`),
        severity: "critical",
        category: "Core Build",
        title: `Missing ${ci.label}`,
        detail: `No ${ci.label} is assigned to ${actor.name} yet.`
      });
    }
  }

  // Languages check (includes Multilingual & GM Bonus Languages)
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
  const gmBonusLanguages = overrides.bonusLanguages || 0;
  const expectedLangCount = actor.ancestry
    ? Math.max(0, ancBaseLangs + Math.max(0, ancExtraLangs + Math.max(0, intMod)) + (multilingualCount * 2) + gmBonusLanguages)
    : 0;
  const missingLangs = Math.max(0, expectedLangCount - currentLangCount);

  if (actor.ancestry && missingLangs > 0) {
    coreIssues.push({
      id: "languages:missing",
      severity: "info",
      category: "Languages",
      title: `Missing ${missingLangs} Language${missingLangs === 1 ? "" : "s"} (${currentLangCount}/${expectedLangCount})`,
      detail: `Ancestry grants ${ancBaseLangs} base + ${ancExtraLangs} extra + ${Math.max(0, intMod)} from INT${multilingualCount ? ` + ${multilingualCount * 2} Multilingual` : ""}${gmBonusLanguages !== 0 ? ` ${gmBonusLanguages > 0 ? "+" : ""}${gmBonusLanguages} GM Bonus` : ""}.`
    });
  }

  // 2. Sub-analyses
  const attributes = analyzeAttributeBoosts(actor, level, variants, dualInfo);
  const skills = analyzeSkills(actor, level, dualInfo, overrides);
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

  // 4. Aggregate Issues, Partition GM-Accepted Items & Compute Completeness Score
  const rawIssues = [
    ...coreIssues,
    ...attributes.issues,
    ...skills.issues,
    ...formulas.issues,
    ...feats.issues,
    ...spellcasting.issues
  ].map(iss => ({
    ...iss,
    id: sanitizeIssueId(iss.id || `${iss.category}:${iss.title}`)
  }));

  const allIssues = [];
  const acknowledgedIssues = [];
  for (const iss of rawIssues) {
    if (isAck(iss.id)) {
      acknowledgedIssues.push(iss);
    } else {
      allIssues.push(iss);
    }
  }

  const criticalCount = allIssues.filter(i => i.severity === "critical").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const infoCount = allIssues.filter(i => i.severity === "info").length;
  const actionableMissingCount = criticalCount + warningCount;

  // Weighted checklist score (0-100%, counting GM-accepted items as resolved)
  let totalChecks = 0;
  let passedChecks = 0;

  // Core items (weight 2 each)
  for (const ci of coreItems) {
    totalChecks += 2;
    if (ci.present || isAck(`core:missing-${ci.key}`)) passedChecks += 2;
  }
  // Attribute tiers
  for (const t of attributes.tiers) {
    totalChecks += 1;
    if (t.complete || isAck(`attributes:missing-${t.key}`)) passedChecks += 1;
  }
  // Skills, Lore & skill increases
  if (actor.class) {
    totalChecks += 2;
    if (skills.missingTrained === 0 || isAck("skills:missing-trained")) passedChecks += 1;
    if (skills.missingIncreases === 0 || isAck("skills:missing-increases")) passedChecks += 1;
  }
  if (skills.expectedMinLores > 0) {
    totalChecks += 1;
    const activeLoreAckId = skills.hasMissingBgLore ? "skills:missing-bg-lore" : "skills:missing-lore";
    if (skills.missingLoreCount === 0 || isAck(activeLoreAckId)) passedChecks += 1;
  }
  // Crafting / Alchemist formulas
  if (formulas.expected > 0) {
    totalChecks += 1;
    if (formulas.complete || isAck("formulas:missing")) passedChecks += 1;
  }
  // Feat slots
  if (feats.totalSlots > 0) {
    for (const g of feats.groups) {
      totalChecks += g.total;
      passedChecks += isAck(`feats:empty-${g.id}`) ? g.total : g.filled;
    }
  }
  // Spellcasting entries
  for (const s of spellcasting.sources) {
    totalChecks += 2;
    const entryOk = s.entryExists || isAck(`spells:missing-entry:${s.key}`);
    const slotsOk = !s.slotsOutdated || isAck(`spells:slots-outdated:${s.key}`);
    if (entryOk && slotsOk) passedChecks += 2;
    else if (entryOk) passedChecks += 1;
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

  // GM Bonuses human-readable summary
  const gmBonusesParts = [];
  if (overrides.bonusTrainedSkills !== 0) {
    gmBonusesParts.push(`${overrides.bonusTrainedSkills > 0 ? "+" : ""}${overrides.bonusTrainedSkills} Trained Skill${Math.abs(overrides.bonusTrainedSkills) === 1 ? "" : "s"}`);
  }
  if (overrides.bonusSkillIncreases !== 0) {
    gmBonusesParts.push(`${overrides.bonusSkillIncreases > 0 ? "+" : ""}${overrides.bonusSkillIncreases} Skill Increase${Math.abs(overrides.bonusSkillIncreases) === 1 ? "" : "s"}`);
  }
  if (overrides.bonusLores > 0) {
    gmBonusesParts.push(`+${overrides.bonusLores} Lore${overrides.bonusLores === 1 ? "" : "s"}`);
  }
  if (overrides.bonusLanguages !== 0) {
    gmBonusesParts.push(`${overrides.bonusLanguages > 0 ? "+" : ""}${overrides.bonusLanguages} Language${Math.abs(overrides.bonusLanguages) === 1 ? "" : "s"}`);
  }
  const hasGmBonuses = gmBonusesParts.length > 0 || Boolean(overrides.note);
  const gmBonusesSummary = gmBonusesParts.join(" · ");
  const savedAckCount = Object.keys(ackMap).length;
  const hasAnySavedOverrides = hasGmBonuses || savedAckCount > 0;

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
      gmBonus: gmBonusLanguages,
      complete: missingLangs === 0 || isAck("languages:missing")
    },
    attributes,
    skills,
    formulas,
    feats,
    spellcasting,
    readinessNotes,
    overrides,
    hasGmBonuses,
    gmBonusesSummary,
    hasAnySavedOverrides,
    allIssues,
    acknowledgedIssues,
    acknowledgedCount: acknowledgedIssues.length,
    hasAcknowledgedIssues: acknowledgedIssues.length > 0,
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
/* 8. CHAT CHECKLIST CARD (PUBLIC OR WHISPER TO OWNING PLAYER)               */
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
      ${!s.entryExists ? ` — <span class="pf2e-cc-chat-miss">Missing Entry</span>` : (s.slotsOutdated ? ` — <span class="pf2e-cc-chat-warn">${esc(s.slotStatusLabel || "Slots Misconfigured")}</span>` : "")}
    </div>
  `).join("");

  const gmNoteParts = [];
  if (report.gmBonusesSummary) gmNoteParts.push(`GM Bonuses: ${report.gmBonusesSummary}`);
  if (report.overrides?.note) gmNoteParts.push(report.overrides.note);
  if (report.acknowledgedCount > 0) gmNoteParts.push(`${report.acknowledgedCount} item${report.acknowledgedCount === 1 ? "" : "s"} accepted by GM`);
  const gmNoteHtml = gmNoteParts.length > 0
    ? `<div class="pf2e-cc-chat-detail" style="margin-top: 5px;"><em>${esc(gmNoteParts.join(" · "))}</em></div>`
    : "";

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
      ${gmNoteHtml}
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

/**
 * Returns candidate PC actors visible to the current user (Party + player-owned for GMs,
 * or all world PCs when `showAllWorldPCs` is true; owned PCs only for players).
 */
export function collectCandidateActors(showAllWorldPCs = false) {
  const isGM = Boolean(game.user?.isGM);
  const byId = new Map();

  if (!isGM) {
    for (const actor of game.actors?.contents || []) {
      if (actor.type === "character" && actor.isOwner) {
        byId.set(actor.id, actor);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  const partyMembers = game.actors?.party?.members || [];
  for (const m of partyMembers) {
    if (m?.type === "character") byId.set(m.id, m);
  }

  for (const actor of game.actors?.contents || []) {
    if (actor.type !== "character") continue;
    const hasPlayerOwner = (game.users?.contents || []).some(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
    if (showAllWorldPCs || hasPlayerOwner || byId.size === 0) {
      byId.set(actor.id, actor);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
