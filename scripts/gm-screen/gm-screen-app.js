/**
 * PF2e Awesome GM Utilities - Instant-Access PF2e GM Screen (ApplicationV2)
 *
 * Features:
 *  - Scannable single-glance Remaster PF2e reference tables & niche rules across 7 organized tabs
 *  - Customizable card visibility (checkboxes per card saved persistently per GM client)
 *  - Balanced 2-column masonry layout that auto-reflows with zero gaps when hiding/filtering cards
 *  - Live instant search across ALL tabs simultaneously (surfaces hidden matches with a subtle tag)
 *  - Auto-synced Party Level highlighting (DC by Level, Earn Income, Treasure, Spell Ranks)
 *  - Live Quick DC Calculator with Adjustment chips & 1-click PF2e `@Check` chat prompt
 *  - Interactive Counteract Rank evaluator & Encounter XP Threat Builder
 */

import { MODULE_ID } from "../constants.js";
import {
  ACCOMPLISHMENT_XP,
  AFFLICTION_CORE_RULES,
  ALCOHOL_STAGES,
  COMBAT_ACTIONS,
  COVER_RULES,
  CREATURE_XP_TABLE,
  CURSE_RULES,
  DC_ADJUSTMENTS,
  DC_BY_LEVEL,
  DEGREES_OF_SUCCESS,
  DETECTION_STATES,
  DISEASE_RULES,
  DOWNTIME_NICHE_RULES,
  DRUGS_ALCOHOL_RULES,
  DYING_RECOVERY_RULES,
  EARN_INCOME_TABLE,
  EXPLORATION_ACTIVITIES,
  FALLING_TERRAIN_RULES,
  FLAT_CHECK_QUICK_RULES,
  FLYING_RULES,
  GM_SCREEN_CARDS,
  GM_SCREEN_TABS,
  HAZARDS_HAUNTS_RULES,
  HERO_POINT_RULES,
  INVISIBILITY_RULES,
  LIGHT_VISION_RULES,
  MOUNTED_COMBAT_RULES,
  OBJECTS_ENVIRONMENT_RULES,
  PF2E_CONDITIONS,
  POISON_RULES,
  QUICK_CHECK_SKILLS,
  RECALL_KNOWLEDGE_SKILLS,
  SIMPLE_DCS,
  SOCIAL_ATTITUDE_RULES,
  SPELL_RANK_DCS,
  STEALTH_SNEAKING_RULES,
  SUBSYSTEM_CHASES_RULES,
  SUBSYSTEM_DUELS_RULES,
  SUBSYSTEM_HEXPLORATION_RULES,
  SUBSYSTEM_HEXPLORATION_SPEEDS,
  SUBSYSTEM_INFILTRATION_RULES,
  SUBSYSTEM_INFLUENCE_RULES,
  SUBSYSTEM_LEADERSHIP_RULES,
  SUBSYSTEM_REPUTATION_NOTES,
  SUBSYSTEM_REPUTATION_TIERS,
  SUBSYSTEM_RESEARCH_RULES,
  SUBSYSTEM_VEHICLES_RULES,
  SWIMMING_UNDERWATER_RULES,
  TACTICAL_MISC_RULES,
  TRAVEL_SPEED_TABLE,
  TREASURE_BY_LEVEL,
  TREAT_WOUNDS_TABLE,
  VICTORY_POINT_OUTCOMES,
  VICTORY_POINT_TIPS,
  evaluateCounteract,
  evaluateEncounterBudget,
  getLevelDc,
  getSpellRankDc
} from "./gm-screen-data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const GM_SCREEN_TEMPLATE = `modules/${MODULE_ID}/templates/gm-screen.hbs`;
const HIDDEN_CARDS_SETTING = "gmScreenHiddenCards";
const VALID_CARD_IDS = new Set(GM_SCREEN_CARDS.map(c => c.id));

function loadHiddenCards() {
  try {
    const raw = game.settings?.get?.(MODULE_ID, HIDDEN_CARDS_SETTING);
    if (Array.isArray(raw)) {
      return new Set(raw.filter(id => typeof id === "string" && VALID_CARD_IDS.has(id)));
    }
  } catch { /* ignore if setting not registered yet */ }
  return new Set();
}

async function saveHiddenCards(hiddenSet) {
  try {
    const clean = Array.from(hiddenSet).filter(id => VALID_CARD_IDS.has(id));
    await game.settings?.set?.(MODULE_ID, HIDDEN_CARDS_SETTING, clean);
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Failed saving GM Screen hidden cards:", err);
  }
}

function detectPartyDefaults() {
  const party = game.actors?.party;
  const partyMembers = (party?.members || []).filter(m => m?.type === "character");
  let level = Number(party?.level);
  if (!Number.isFinite(level) || level < 0) {
    if (partyMembers.length > 0) {
      level = Math.round(partyMembers.reduce((s, m) => s + Number(m.level || 1), 0) / partyMembers.length);
    } else {
      const pcs = (game.actors?.contents || []).filter(a => a.type === "character");
      level = pcs.length > 0 ? Math.max(...pcs.map(a => Number(a.level || 1))) : 1;
    }
  }
  const partySize = partyMembers.length > 0 ? partyMembers.length : 4;
  return {
    level: Math.max(0, Math.min(25, Math.round(level || 1))),
    partySize: Math.max(1, Math.min(10, partySize))
  };
}

let _conditionIndexCache = null;

async function openOfficialConditionSheet(slug, fallbackName) {
  try {
    const pack = game.packs?.get?.("pf2e.conditionitems");
    if (!pack) {
      ui.notifications?.warn("PF2e Conditions compendium pack (`pf2e.conditionitems`) was not found.");
      return;
    }
    if (!_conditionIndexCache) {
      _conditionIndexCache = await pack.getIndex({ fields: ["system.slug"] });
    }
    const cleanSlug = String(slug || "").toLowerCase();
    const cleanName = String(fallbackName || "").replace(/\s+x$/i, "").trim().toLowerCase();
    const hit = _conditionIndexCache.find(e =>
      String(e?.system?.slug || "").toLowerCase() === cleanSlug
      || String(e?.name || "").toLowerCase() === cleanName
    );
    if (!hit) {
      ui.notifications?.warn(`Could not locate condition "${fallbackName}" in PF2e compendium.`);
      return;
    }
    const doc = await pack.getDocument(hit._id);
    if (doc?.sheet) {
      doc.sheet.render({ force: true });
    }
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Failed opening condition sheet:", slug, err);
  }
}

export class GmScreenApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    const defaults = detectPartyDefaults();
    this._activeTab = "dcs";
    this._searchQuery = "";
    this._customizeOpen = false;
    this._hiddenCards = loadHiddenCards();
    this._focusLevel = defaults.level;
    this._dcAdjustment = 0;
    this._simpleDcOverride = null; // { rank, dc } or null
    this._selectedCheckSkill = "perception";
    this._secretCheck = false;
    this._counteractYourRank = Math.max(1, Math.min(10, Math.ceil(Math.max(1, defaults.level) / 2)));
    this._counteractTargetRank = this._counteractYourRank;
    this._partySize = defaults.partySize;
    this._encounterEntries = []; // [{ id, label, xp, isHazard }]
    this._onKeyDownBound = null;
    this._keyDownView = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-gm-screen",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-gs-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.GmScreen.Title",
      icon: "fa-solid fa-book-open-reader",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 1080,
      height: 760
    }
  };

  static PARTS = {
    main: {
      template: GM_SCREEN_TEMPLATE,
      scrollable: [".pf2e-gs-body", ".pf2e-gs-customize-scroll"]
    }
  };

  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = { force: options };
    }
    return super.render(options, _legacyOptions);
  }

  toggle() {
    if (this.rendered) {
      this.close();
    } else {
      this._hiddenCards = loadHiddenCards();
      this._syncFromPartyIfFresh();
      this.render({ force: true });
    }
  }

  _syncFromPartyIfFresh() {
    const defaults = detectPartyDefaults();
    if (this._encounterEntries.length === 0) {
      this._partySize = defaults.partySize;
    }
  }

  _buildContext() {
    const partyDefaults = detectPartyDefaults();
    const lvl = Math.max(0, Math.min(25, Number(this._focusLevel) || 0));
    const levelStandardDc = getLevelDc(lvl);
    const baseDc = this._simpleDcOverride ? this._simpleDcOverride.dc : levelStandardDc;
    const adj = Number(this._dcAdjustment) || 0;
    const finalDc = baseDc + adj;
    const adjObj = DC_ADJUSTMENTS.find(a => a.delta === adj) || DC_ADJUSTMENTS[3];
    const spellRank = Math.max(1, Math.min(10, Math.ceil(Math.max(1, lvl) / 2)));
    const spellRankDc = getSpellRankDc(spellRank);

    // Split DC by Level into two side-by-side 13-row columns (0–12 and 13–25)
    const dcRows = DC_BY_LEVEL.map(row => ({
      ...row,
      isActive: row.level === lvl,
      isNearby: Math.abs(row.level - lvl) === 1
    }));
    const dcByLevelPaired = [];
    for (let i = 0; i < 13; i++) {
      dcByLevelPaired.push({
        left: dcRows[i],
        right: dcRows[i + 13]
      });
    }

    const spellRankRows = SPELL_RANK_DCS.map(r => ({
      ...r,
      isActive: r.rank === spellRank
    }));

    const earnIncomeRows = EARN_INCOME_TABLE.map(r => ({
      ...r,
      clickLevel: Math.min(20, r.level),
      isActive: r.level === Math.min(20, lvl),
      isNearby: r.level <= 20 && Math.abs(r.level - Math.min(20, lvl)) === 1
    }));

    const treasureRows = TREASURE_BY_LEVEL.map(r => ({
      ...r,
      isActive: r.level === Math.max(1, Math.min(20, lvl)),
      isNearby: Math.abs(r.level - Math.max(1, Math.min(20, lvl))) === 1
    }));

    const counteract = evaluateCounteract(this._counteractYourRank, this._counteractTargetRank);
    const totalEncounterXp = this._encounterEntries.reduce((sum, e) => sum + Number(e.xp || 0), 0);
    const encounterEval = evaluateEncounterBudget(this._partySize, totalEncounterXp);

    const creatureXpRows = CREATURE_XP_TABLE.map(c => ({
      ...c,
      effectiveLevel: lvl + c.offset,
      effectiveLevelLabel: `Lv ${lvl + c.offset}`
    }));

    // Build per-tab Customize checkbox groups
    const hiddenCardMap = {};
    for (const id of this._hiddenCards) hiddenCardMap[id] = true;

    const customizeGroups = GM_SCREEN_TABS.map(tab => {
      const cards = GM_SCREEN_CARDS
        .filter(c => c.tab === tab.id)
        .map(c => ({
          id: c.id,
          label: c.label,
          visible: !this._hiddenCards.has(c.id)
        }));
      const hiddenInTab = cards.filter(c => !c.visible).length;
      return {
        tabId: tab.id,
        label: tab.label,
        icon: tab.icon,
        cards,
        hiddenInTab,
        allVisible: hiddenInTab === 0
      };
    });

    const hiddenCardCount = this._hiddenCards.size;

    return {
      activeTab: this._activeTab,
      tabs: GM_SCREEN_TABS.map(t => {
        const grp = customizeGroups.find(g => g.tabId === t.id);
        return {
          ...t,
          isActive: t.id === this._activeTab,
          allHidden: Boolean(grp && grp.cards.length > 0 && grp.hiddenInTab === grp.cards.length)
        };
      }),
      searchQuery: this._searchQuery,
      customizeOpen: this._customizeOpen,
      customizeGroups,
      hiddenCardMap,
      hiddenCardCount,
      hasHiddenCards: hiddenCardCount > 0,
      focusLevel: lvl,
      partyLevel: partyDefaults.level,
      isAtPartyLevel: lvl === partyDefaults.level,
      simpleDcOverride: this._simpleDcOverride,
      levelStandardDc,
      levelEasyDc: levelStandardDc - 2,
      levelHardDc: levelStandardDc + 2,
      baseDc,
      dcAdjustment: adj,
      dcAdjustmentLabel: adjObj.label,
      dcAdjustmentSigned: adj > 0 ? `+${adj}` : String(adj),
      finalDc,
      spellRank,
      spellRankDc,
      simpleDcs: SIMPLE_DCS.map(s => ({
        ...s,
        isActive: this._simpleDcOverride?.rank === s.rank
      })),
      dcAdjustments: DC_ADJUSTMENTS.map(a => ({
        ...a,
        deltaSigned: a.delta > 0 ? `+${a.delta}` : String(a.delta),
        isActive: a.delta === adj
      })),
      quickCheckSkills: QUICK_CHECK_SKILLS.map(s => ({
        ...s,
        selected: s.slug === this._selectedCheckSkill
      })),
      secretCheck: this._secretCheck,
      dcByLevelPaired,
      spellRankRows,
      degreesOfSuccess: DEGREES_OF_SUCCESS,
      heroPointRules: HERO_POINT_RULES,
      flatCheckQuickRules: FLAT_CHECK_QUICK_RULES,
      counteract,
      coverRules: COVER_RULES,
      detectionStates: DETECTION_STATES,
      stealthSneakingRules: STEALTH_SNEAKING_RULES,
      invisibilityRules: INVISIBILITY_RULES,
      combatActions: COMBAT_ACTIONS,
      dyingRecoveryRules: DYING_RECOVERY_RULES,
      fallingTerrainRules: FALLING_TERRAIN_RULES,
      mountedCombatRules: MOUNTED_COMBAT_RULES,
      flyingRules: FLYING_RULES,
      swimmingUnderwaterRules: SWIMMING_UNDERWATER_RULES,
      tacticalMiscRules: TACTICAL_MISC_RULES,
      afflictionCoreRules: AFFLICTION_CORE_RULES,
      poisonRules: POISON_RULES,
      diseaseRules: DISEASE_RULES,
      curseRules: CURSE_RULES,
      drugsAlcoholRules: DRUGS_ALCOHOL_RULES,
      alcoholStages: ALCOHOL_STAGES,
      hazardsHauntsRules: HAZARDS_HAUNTS_RULES,
      victoryPointOutcomes: VICTORY_POINT_OUTCOMES,
      victoryPointTips: VICTORY_POINT_TIPS,
      subsystemChasesRules: SUBSYSTEM_CHASES_RULES,
      subsystemInfluenceRules: SUBSYSTEM_INFLUENCE_RULES,
      subsystemResearchRules: SUBSYSTEM_RESEARCH_RULES,
      subsystemInfiltrationRules: SUBSYSTEM_INFILTRATION_RULES,
      subsystemReputationTiers: SUBSYSTEM_REPUTATION_TIERS,
      subsystemReputationNotes: SUBSYSTEM_REPUTATION_NOTES,
      subsystemDuelsRules: SUBSYSTEM_DUELS_RULES,
      subsystemHexplorationSpeeds: SUBSYSTEM_HEXPLORATION_SPEEDS,
      subsystemHexplorationRules: SUBSYSTEM_HEXPLORATION_RULES,
      subsystemVehiclesRules: SUBSYSTEM_VEHICLES_RULES,
      subsystemLeadershipRules: SUBSYSTEM_LEADERSHIP_RULES,
      treatWoundsRows: TREAT_WOUNDS_TABLE,
      earnIncomeRows,
      recallKnowledgeSkills: RECALL_KNOWLEDGE_SKILLS,
      socialAttitudeRules: SOCIAL_ATTITUDE_RULES,
      downtimeNicheRules: DOWNTIME_NICHE_RULES,
      explorationActivities: EXPLORATION_ACTIVITIES,
      conditions: PF2E_CONDITIONS,
      encounterEval,
      encounterEntries: this._encounterEntries,
      hasEncounterEntries: this._encounterEntries.length > 0,
      creatureXpRows,
      treasureRows,
      travelSpeedRows: TRAVEL_SPEED_TABLE,
      accomplishmentXp: ACCOMPLISHMENT_XP,
      lightVisionRules: LIGHT_VISION_RULES,
      objectsEnvironmentRules: OBJECTS_ENVIRONMENT_RULES
    };
  }

  async _prepareContext(_options) {
    return this._buildContext();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element?.querySelector?.(".pf2e-gs-root");
    if (!root) return;

    const targetView = root.ownerDocument?.defaultView || window;
    if (this._onKeyDownBound && this._keyDownView && this._keyDownView !== targetView) {
      this._keyDownView.removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
      this._keyDownView = null;
    }
    if (!this._onKeyDownBound) {
      this._onKeyDownBound = (e) => {
        if (e.key !== "Escape" || !this.rendered || this.minimized) return;
        const winEl = this.element;
        if (!winEl) return;
        // Only handle Escape if this window has focus or is the topmost open ApplicationV2/window
        const activeEl = winEl.ownerDocument?.activeElement;
        const hasInternalFocus = Boolean(activeEl && winEl.contains(activeEl));
        if (!hasInternalFocus) {
          const myZ = Number(getComputedStyle(winEl).zIndex) || 0;
          const higherOpen = Array.from(winEl.ownerDocument?.querySelectorAll?.(".application, .window-app") || [])
            .some(other => other !== winEl && !other.classList.contains("minimized") && (Number(getComputedStyle(other).zIndex) || 0) > myZ);
          if (higherOpen) return;
        }
        const inner = winEl.querySelector?.(".pf2e-gs-root");
        const searchEl = inner?.querySelector?.(".pf2e-gs-search");
        if (this._searchQuery) {
          e.preventDefault();
          this._searchQuery = "";
          if (searchEl) searchEl.value = "";
          if (inner) this._applySearchFilter(inner);
          return;
        }
        if (this._customizeOpen) {
          e.preventDefault();
          this._customizeOpen = false;
          if (inner) this._syncCustomizeDrawerDom(inner);
          return;
        }
        e.preventDefault();
        this.close();
      };
      this._keyDownView = targetView;
      targetView.addEventListener("keydown", this._onKeyDownBound);
    }

    this._bindDomEvents(root);
    this._syncCustomizeDrawerDom(root);
    this._applySearchFilter(root);
  }

  _bindDomEvents(root) {
    const refresh = () => this.render({ force: false });

    // Search filter (0ms DOM-only filtering, zero re-render, works across ALL tabs)
    const searchInput = root.querySelector(".pf2e-gs-search");
    const clearBtn = root.querySelector(".pf2e-gs-search-clear");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this._searchQuery = searchInput.value || "";
        this._applySearchFilter(root);
      });
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this._searchQuery) {
          e.preventDefault();
          e.stopPropagation();
          this._searchQuery = "";
          searchInput.value = "";
          this._applySearchFilter(root);
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this._searchQuery = "";
        if (searchInput) {
          searchInput.value = "";
          searchInput.focus();
        }
        this._applySearchFilter(root);
      });
    }

    // Skill check dropdown & secret toggle
    const skillSel = root.querySelector(".pf2e-gs-check-skill");
    if (skillSel) {
      skillSel.addEventListener("change", (e) => {
        this._selectedCheckSkill = e.target.value || "perception";
      });
    }
    const secretCb = root.querySelector(".pf2e-gs-check-secret");
    if (secretCb) {
      secretCb.addEventListener("change", (e) => {
        this._secretCheck = Boolean(e.target.checked);
      });
    }

    // Customize card show/hide checkboxes (instant 0ms DOM toggle + persistent save!)
    root.querySelectorAll(".pf2e-gs-cust-cb[data-card-id]").forEach(cb => {
      cb.addEventListener("change", () => {
        const cardId = cb.dataset.cardId;
        if (!cardId || !VALID_CARD_IDS.has(cardId)) return;
        if (cb.checked) {
          this._hiddenCards.delete(cardId);
        } else {
          this._hiddenCards.add(cardId);
        }
        saveHiddenCards(this._hiddenCards);
        this._syncCustomizeDrawerDom(root);
        this._applySearchFilter(root);
      });
    });

    // Unified click delegation for all data-gs-action buttons & rows
    root.querySelectorAll("[data-gs-action]").forEach(el => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = el.dataset.gsAction;
        await this._handleAction(action, el, { root, refresh });
      });
    });
  }

  /**
   * Synchronizes Customize drawer visibility, checkboxes, hidden count badges, and per-tab All/None buttons
   * in 0ms without re-rendering or disturbing scroll position.
   */
  _syncCustomizeDrawerDom(root) {
    const drawer = root.querySelector(".pf2e-gs-customize-drawer");
    if (drawer) {
      drawer.classList.toggle("is-open", this._customizeOpen);
    }

    const hiddenCount = this._hiddenCards.size;
    const toggleBtn = root.querySelector('[data-gs-action="toggle-customize"]');
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-active", this._customizeOpen);
      toggleBtn.classList.toggle("pf2e-gs-btn-accent", hiddenCount > 0);
      const lbl = toggleBtn.querySelector(".pf2e-gs-cust-btn-label");
      if (lbl) {
        lbl.textContent = hiddenCount > 0 ? `Customize (${hiddenCount} hidden)` : "Customize";
      }
    }

    const showAllBtn = root.querySelector('[data-gs-action="show-all-cards"]');
    if (showAllBtn) {
      showAllBtn.style.display = hiddenCount > 0 ? "" : "none";
    }

    root.querySelectorAll(".pf2e-gs-cust-cb[data-card-id]").forEach(cb => {
      cb.checked = !this._hiddenCards.has(cb.dataset.cardId);
    });

    // Update per-tab toggle button text & tab dimming when all cards on a tab are hidden
    for (const tab of GM_SCREEN_TABS) {
      const tabCards = GM_SCREEN_CARDS.filter(c => c.tab === tab.id);
      const hiddenInTab = tabCards.filter(c => this._hiddenCards.has(c.id)).length;
      const allVisible = hiddenInTab === 0;
      const allHidden = tabCards.length > 0 && hiddenInTab === tabCards.length;

      const tabToggle = root.querySelector(`[data-gs-action="toggle-tab-cards"][data-tab="${tab.id}"]`);
      if (tabToggle) {
        tabToggle.textContent = allVisible ? "Hide All" : "Show All";
      }
      const tabBtn = root.querySelector(`.pf2e-gs-tab[data-tab="${tab.id}"]`);
      if (tabBtn) {
        tabBtn.classList.toggle("is-all-hidden", allHidden);
      }
    }
  }

  /**
   * Keeps 2-column masonry containers balanced (collapsing to 1 column when only 1 card is visible,
   * or hiding completely when 0 cards are visible so there are never phantom vertical gaps).
   */
  _syncMasonryContainers(root) {
    root.querySelectorAll(".pf2e-gs-masonry").forEach(masonry => {
      const cards = Array.from(masonry.querySelectorAll(":scope > .pf2e-gs-card"));
      const visibleCount = cards.filter(c => {
        if (c.classList.contains("is-hidden")) return false;
        if (c.classList.contains("is-user-hidden") && !c.classList.contains("is-search-override")) return false;
        return true;
      }).length;
      masonry.style.display = visibleCount === 0 ? "none" : "";
      masonry.classList.toggle("is-single", visibleCount === 1);
    });
  }

  _applySearchFilter(root) {
    const query = String(this._searchQuery || "").trim().toLowerCase();
    const clearBtn = root.querySelector(".pf2e-gs-search-clear");
    const banner = root.querySelector(".pf2e-gs-search-banner");
    const emptyEl = root.querySelector(".pf2e-gs-empty-search");
    const emptyTabEl = root.querySelector(".pf2e-gs-empty-tab");

    if (clearBtn) clearBtn.style.display = query ? "" : "none";

    // Always sync user-hidden class onto every card first
    root.querySelectorAll(".pf2e-gs-card[data-gs-card]").forEach(card => {
      const isUserHidden = this._hiddenCards.has(card.dataset.gsCard);
      card.classList.toggle("is-user-hidden", isUserHidden);
      card.classList.remove("is-search-override");
    });

    const panels = root.querySelectorAll("[data-gs-panel]");
    if (!query) {
      if (banner) banner.style.display = "none";
      if (emptyEl) emptyEl.classList.remove("is-visible");

      let visibleInActiveTab = 0;
      panels.forEach(p => {
        const isActive = p.dataset.gsPanel === this._activeTab;
        p.style.display = isActive ? "" : "none";
        if (isActive) {
          visibleInActiveTab = Array.from(p.querySelectorAll(".pf2e-gs-card[data-gs-card]"))
            .filter(c => !c.classList.contains("is-user-hidden"))
            .length;
        }
      });

      root.querySelectorAll(".pf2e-gs-card.is-hidden, [data-gs-row].is-hidden").forEach(el => {
        el.classList.remove("is-hidden");
      });
      root.querySelectorAll(".pf2e-gs-table.is-empty-table").forEach(tbl => {
        tbl.classList.remove("is-empty-table");
      });

      this._syncMasonryContainers(root);
      if (emptyTabEl) {
        emptyTabEl.classList.toggle("is-visible", visibleInActiveTab === 0);
      }
      return;
    }

    if (emptyTabEl) emptyTabEl.classList.remove("is-visible");

    // Live cross-tab search: reveal all matching cards (including hidden ones with a subtle pill!)
    const tokens = query.split(/\s+/).filter(Boolean);
    const matchesTokens = (text) => {
      const lower = String(text || "").toLowerCase();
      return tokens.every(tok => lower.includes(tok));
    };

    let visibleCards = 0;
    panels.forEach(panel => {
      let panelHasHit = false;
      const cards = panel.querySelectorAll(".pf2e-gs-card");
      cards.forEach(card => {
        const cardMeta = `${card.dataset.gsKeywords || ""} ${card.querySelector(".pf2e-gs-card-head")?.textContent || ""}`;
        const rows = card.querySelectorAll("[data-gs-row]");
        let cardMatched = false;

        if (matchesTokens(cardMeta)) {
          card.classList.remove("is-hidden");
          rows.forEach(r => r.classList.remove("is-hidden"));
          cardMatched = true;
        } else if (rows.length > 0) {
          let rowHits = 0;
          rows.forEach(r => {
            const hit = matchesTokens(`${r.dataset.gsKeywords || ""} ${r.textContent || ""}`);
            r.classList.toggle("is-hidden", !hit);
            if (hit) rowHits++;
          });
          card.classList.toggle("is-hidden", rowHits === 0);
          cardMatched = rowHits > 0;
        } else {
          const hit = matchesTokens(card.textContent || "");
          card.classList.toggle("is-hidden", !hit);
          cardMatched = hit;
        }

        // Hide any table inside a mixed card (e.g. Alcohol Stages) when all its rows are filtered out
        card.querySelectorAll(".pf2e-gs-table").forEach(tbl => {
          const tblRows = tbl.querySelectorAll("tbody tr[data-gs-row]");
          if (tblRows.length === 0) return;
          const anyVisible = Array.from(tblRows).some(tr => !tr.classList.contains("is-hidden"));
          tbl.classList.toggle("is-empty-table", !anyVisible);
        });

        if (cardMatched) {
          if (card.classList.contains("is-user-hidden")) {
            card.classList.add("is-search-override");
          }
          panelHasHit = true;
          visibleCards++;
        }
      });
      panel.style.display = panelHasHit ? "" : "none";
    });

    this._syncMasonryContainers(root);

    if (banner) {
      banner.style.display = "";
      banner.textContent = `${visibleCards} section${visibleCards === 1 ? "" : "s"} matching "${this._searchQuery.trim()}"`;
    }
    if (emptyEl) {
      emptyEl.classList.toggle("is-visible", visibleCards === 0);
    }
  }

  async _handleAction(action, el, { root, refresh }) {
    switch (action) {
      case "toggle-customize": {
        this._customizeOpen = !this._customizeOpen;
        this._syncCustomizeDrawerDom(root);
        break;
      }

      case "show-all-cards": {
        this._hiddenCards.clear();
        await saveHiddenCards(this._hiddenCards);
        this._syncCustomizeDrawerDom(root);
        this._applySearchFilter(root);
        ui.notifications?.info("Restored all PF2e GM Screen sections.");
        break;
      }

      case "toggle-tab-cards": {
        const tabId = el.dataset.tab;
        const tabCards = GM_SCREEN_CARDS.filter(c => c.tab === tabId);
        if (tabCards.length === 0) return;
        const allVisible = tabCards.every(c => !this._hiddenCards.has(c.id));
        for (const c of tabCards) {
          if (allVisible) this._hiddenCards.add(c.id);
          else this._hiddenCards.delete(c.id);
        }
        await saveHiddenCards(this._hiddenCards);
        this._syncCustomizeDrawerDom(root);
        this._applySearchFilter(root);
        break;
      }

      case "select-tab": {
        const tabId = el.dataset.tab;
        if (!tabId) return;
        this._activeTab = tabId;
        if (this._searchQuery) {
          this._searchQuery = "";
          const searchEl = root.querySelector(".pf2e-gs-search");
          if (searchEl) searchEl.value = "";
        }
        root.querySelectorAll(".pf2e-gs-tab").forEach(btn => {
          btn.classList.toggle("is-active", btn.dataset.tab === tabId);
        });
        this._applySearchFilter(root);
        const body = root.querySelector(".pf2e-gs-body");
        if (body) body.scrollTop = 0;
        break;
      }

      case "level-step": {
        const delta = Number(el.dataset.delta || 0);
        this._focusLevel = Math.max(0, Math.min(25, this._focusLevel + delta));
        this._simpleDcOverride = null;
        await refresh();
        break;
      }

      case "set-level": {
        const lvl = Number(el.dataset.level);
        if (Number.isFinite(lvl)) {
          this._focusLevel = Math.max(0, Math.min(25, lvl));
          this._simpleDcOverride = null;
          await refresh();
        }
        break;
      }

      case "reset-party-level": {
        const defaults = detectPartyDefaults();
        this._focusLevel = defaults.level;
        this._simpleDcOverride = null;
        this._dcAdjustment = 0;
        this._counteractYourRank = Math.max(1, Math.min(10, Math.ceil(Math.max(1, defaults.level) / 2)));
        this._counteractTargetRank = this._counteractYourRank;
        await refresh();
        break;
      }

      case "set-dc-adj": {
        const delta = Number(el.dataset.delta || 0);
        this._dcAdjustment = delta;
        await refresh();
        break;
      }

      case "set-simple-dc": {
        const rank = el.dataset.rank;
        const dc = Number(el.dataset.dc);
        if (!rank || !Number.isFinite(dc)) return;
        if (this._simpleDcOverride?.rank === rank) {
          this._simpleDcOverride = null;
        } else {
          this._simpleDcOverride = { rank, dc };
        }
        await refresh();
        break;
      }

      case "send-check-chat": {
        const ctx = this._buildContext();
        const skill = this._selectedCheckSkill || "perception";
        const skillLabel = QUICK_CHECK_SKILLS.find(s => s.slug === skill)?.label || skill;
        const traitsPart = this._secretCheck ? "|traits:secret" : "";
        const sourceNote = this._simpleDcOverride
          ? `${this._simpleDcOverride.rank} Simple DC`
          : `Level ${ctx.focusLevel} DC`;
        const adjNote = ctx.dcAdjustment !== 0 ? ` (${ctx.dcAdjustmentLabel} ${ctx.dcAdjustmentSigned})` : "";
        const checkEnricher = `@Check[type:${skill}|dc:${ctx.finalDc}${traitsPart}]`;
        const content = `
          <div class="pf2e-gs-chat-check">
            <div><strong>${foundry.utils.escapeHTML(skillLabel)} Check</strong> — ${foundry.utils.escapeHTML(sourceNote + adjNote)}</div>
            <div style="margin-top:4px;">${checkEnricher}</div>
          </div>
        `;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ alias: "PF2e GM Screen" }),
          content
        });
        ui.notifications?.info(`Posted ${skillLabel} (DC ${ctx.finalDc}) check prompt to Chat.`);
        break;
      }

      case "counteract-step": {
        const which = el.dataset.which;
        const delta = Number(el.dataset.delta || 0);
        if (which === "your") {
          this._counteractYourRank = Math.max(1, Math.min(10, this._counteractYourRank + delta));
        } else if (which === "target") {
          this._counteractTargetRank = Math.max(1, Math.min(10, this._counteractTargetRank + delta));
        }
        await refresh();
        break;
      }

      case "open-condition": {
        const slug = el.dataset.slug;
        const name = el.dataset.name || slug;
        await openOfficialConditionSheet(slug, name);
        break;
      }

      case "party-size-step": {
        const delta = Number(el.dataset.delta || 0);
        this._partySize = Math.max(1, Math.min(10, this._partySize + delta));
        await refresh();
        break;
      }

      case "enc-add": {
        const offset = Number(el.dataset.offset || 0);
        const isHazard = el.dataset.kind === "hazard";
        const row = CREATURE_XP_TABLE.find(c => c.offset === offset);
        if (!row) return;
        const xp = isHazard ? row.simpleHazardXp : row.creatureXp;
        const effLvl = this._focusLevel + offset;
        this._encounterEntries.push({
          id: foundry.utils.randomID(6),
          label: `${isHazard ? "Hazard" : "Creature"} Lv ${effLvl} (${offset >= 0 ? `+${offset}` : offset})`,
          xp,
          isHazard
        });
        await refresh();
        break;
      }

      case "enc-remove": {
        const id = el.dataset.id;
        this._encounterEntries = this._encounterEntries.filter(entry => entry.id !== id);
        await refresh();
        break;
      }

      case "enc-clear": {
        this._encounterEntries = [];
        await refresh();
        break;
      }
    }
  }

  _onClose(options) {
    if (this._onKeyDownBound) {
      (this._keyDownView || window).removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
      this._keyDownView = null;
    }
    super._onClose?.(options);
  }
}
