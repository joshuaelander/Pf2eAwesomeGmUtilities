/**
 * PF2e Awesome GM Utilities - Instant-Access PF2e GM Screen (ApplicationV2)
 *
 * Features:
 *  - Scannable single-glance Remaster PF2e reference tables (no clicking through journal links)
 *  - Live instant search across ALL tabs simultaneously
 *  - Auto-synced Party Level highlighting (DC by Level, Earn Income, Treasure, Spell Ranks)
 *  - Live Quick DC Calculator with Adjustment chips & 1-click PF2e `@Check` chat prompt
 *  - Interactive Counteract Rank evaluator & Encounter XP Threat Builder
 */

import { MODULE_ID } from "../constants.js";
import {
  ACCOMPLISHMENT_XP,
  COMBAT_ACTIONS,
  COVER_RULES,
  CREATURE_XP_TABLE,
  DC_ADJUSTMENTS,
  DC_BY_LEVEL,
  DEGREES_OF_SUCCESS,
  DETECTION_STATES,
  DYING_FALLING_RULES,
  EARN_INCOME_TABLE,
  EXPLORATION_ACTIVITIES,
  PF2E_CONDITIONS,
  QUICK_CHECK_SKILLS,
  RECALL_KNOWLEDGE_SKILLS,
  SIMPLE_DCS,
  SPELL_RANK_DCS,
  TRAVEL_SPEED_TABLE,
  TREASURE_BY_LEVEL,
  TREAT_WOUNDS_TABLE,
  evaluateCounteract,
  evaluateEncounterBudget,
  getLevelDc,
  getSpellRankDc
} from "./gm-screen-data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const GM_SCREEN_TEMPLATE = `modules/${MODULE_ID}/templates/gm-screen.hbs`;

const TABS = [
  { id: "dcs", label: "DCs & Counteract", icon: "fa-solid fa-bullseye" },
  { id: "combat", label: "Combat & Health", icon: "fa-solid fa-swords" },
  { id: "skills", label: "Skills & Downtime", icon: "fa-solid fa-coins" },
  { id: "conditions", label: "Conditions", icon: "fa-solid fa-biohazard" },
  { id: "encounters", label: "Encounters & Loot", icon: "fa-solid fa-dragon" }
];

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
      width: 1040,
      height: 740
    }
  };

  static PARTS = {
    main: {
      template: GM_SCREEN_TEMPLATE,
      scrollable: [".pf2e-gs-body"]
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
    const baseDc = this._simpleDcOverride ? this._simpleDcOverride.dc : getLevelDc(lvl);
    const adj = Number(this._dcAdjustment) || 0;
    const finalDc = baseDc + adj;
    const adjObj = DC_ADJUSTMENTS.find(a => a.delta === adj) || DC_ADJUSTMENTS[3];
    const spellRank = Math.max(1, Math.min(10, Math.ceil(Math.max(1, lvl) / 2)));
    const spellRankDc = getSpellRankDc(spellRank);

    // Split DC by Level into two side-by-side 13-row columns (0–12 and 13–25) so all 26 levels fit cleanly!
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

    return {
      activeTab: this._activeTab,
      tabs: TABS.map(t => ({ ...t, isActive: t.id === this._activeTab })),
      searchQuery: this._searchQuery,
      focusLevel: lvl,
      partyLevel: partyDefaults.level,
      isAtPartyLevel: lvl === partyDefaults.level,
      simpleDcOverride: this._simpleDcOverride,
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
      counteract,
      coverRules: COVER_RULES,
      detectionStates: DETECTION_STATES,
      combatActions: COMBAT_ACTIONS,
      dyingFallingRules: DYING_FALLING_RULES,
      treatWoundsRows: TREAT_WOUNDS_TABLE,
      earnIncomeRows,
      recallKnowledgeSkills: RECALL_KNOWLEDGE_SKILLS,
      explorationActivities: EXPLORATION_ACTIVITIES,
      conditions: PF2E_CONDITIONS,
      encounterEval,
      encounterEntries: this._encounterEntries,
      hasEncounterEntries: this._encounterEntries.length > 0,
      creatureXpRows,
      treasureRows,
      travelSpeedRows: TRAVEL_SPEED_TABLE,
      accomplishmentXp: ACCOMPLISHMENT_XP
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
        if (e.key !== "Escape" || !this.rendered) return;
        const searchEl = this.element?.querySelector?.(".pf2e-gs-search");
        if (this._searchQuery) {
          e.preventDefault();
          this._searchQuery = "";
          if (searchEl) searchEl.value = "";
          const inner = this.element?.querySelector?.(".pf2e-gs-root");
          if (inner) this._applySearchFilter(inner);
          return;
        }
        e.preventDefault();
        this.close();
      };
      this._keyDownView = targetView;
      targetView.addEventListener("keydown", this._onKeyDownBound);
    }

    this._bindDomEvents(root);
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

  _applySearchFilter(root) {
    const query = String(this._searchQuery || "").trim().toLowerCase();
    const clearBtn = root.querySelector(".pf2e-gs-search-clear");
    const banner = root.querySelector(".pf2e-gs-search-banner");
    const emptyEl = root.querySelector(".pf2e-gs-empty-search");

    if (clearBtn) clearBtn.style.display = query ? "" : "none";

    const panels = root.querySelectorAll("[data-gs-panel]");
    if (!query) {
      if (banner) banner.style.display = "none";
      if (emptyEl) emptyEl.classList.remove("is-visible");
      panels.forEach(p => {
        p.style.display = p.dataset.gsPanel === this._activeTab ? "" : "none";
      });
      root.querySelectorAll(".pf2e-gs-card.is-hidden, [data-gs-row].is-hidden").forEach(el => {
        el.classList.remove("is-hidden");
      });
      return;
    }

    // Live cross-tab search: reveal all panels, filter cards & individual rows cleanly
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

        if (matchesTokens(cardMeta)) {
          card.classList.remove("is-hidden");
          rows.forEach(r => r.classList.remove("is-hidden"));
          panelHasHit = true;
          visibleCards++;
          return;
        }

        if (rows.length > 0) {
          let rowHits = 0;
          rows.forEach(r => {
            const hit = matchesTokens(`${r.dataset.gsKeywords || ""} ${r.textContent || ""}`);
            r.classList.toggle("is-hidden", !hit);
            if (hit) rowHits++;
          });
          card.classList.toggle("is-hidden", rowHits === 0);
          if (rowHits > 0) {
            panelHasHit = true;
            visibleCards++;
          }
        } else {
          const hit = matchesTokens(card.textContent || "");
          card.classList.toggle("is-hidden", !hit);
          if (hit) {
            panelHasHit = true;
            visibleCards++;
          }
        }
      });
      panel.style.display = panelHasHit ? "" : "none";
    });

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
      case "select-tab": {
        const tabId = el.dataset.tab;
        if (!tabId) return;
        this._activeTab = tabId;
        // Clear active search if user intentionally clicks a tab
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
