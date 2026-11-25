/**
 * PF2e Awesome GM Utilities - Level 1-20 Build Planner & Guided Level-Up UI
 *
 * Lightweight, opt-in ApplicationV2 build planner integrated with:
 *  - PF2e's native Compendium Browser (pre-filtered per slot + Drag & Drop)
 *  - Optional lazy inline Quick Pick modals (Feat & Spell search)
 *  - Live 1-20 Attribute & Skill Rank projection + Soft Prerequisite checks
 *  - Guided 1-Click "Apply Level Up (Lv N -> N+1)" with confirmation preview
 *  - Direct tie-in with Character Completeness Checker
 */

import { MODULE_ID } from "./constants.js";
import {
  ABILITY_LABELS,
  TRADITION_LABELS,
  analyzeCharacter,
  normalizeSlug
} from "./character-checker-engine.js";
import {
  FORMULA_CRAFTABLE_TYPES,
  applyPlannedLevelChoices,
  applyPlannedLevelUp,
  buildLevelRoadmap,
  clearActorLevelPlan,
  clearPlannedFeat,
  computeMatchingArchetypeFeatUuids,
  getLightweightFeatIndex,
  getLightweightFormulaIndex,
  getLightweightSpellIndex,
  hasAnySavedLevelPlan,
  inspectLevelRevert,
  inspectPlannedLevels,
  isLevelPlannerEnabled,
  isPlannerUpdatingActor,
  openNativeBrowserForFeatSlot,
  openNativeBrowserForFormulas,
  openNativeBrowserForSpells,
  revertActorToLevel,
  updatePlannedLevelData
} from "./level-planner-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------------- */
/* HELPERS                                                                   */
/* ------------------------------------------------------------------------- */

function collectCandidateActors(showAllWorldPCs = false) {
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

function extractDropData(event) {
  try {
    const te = foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    if (typeof te?.getDragEventData === "function") {
      const parsed = te.getDragEventData(event);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) return parsed;
    }
  } catch { /* fallback below */ }

  try {
    const raw = event.dataTransfer?.getData("text/plain");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

async function resolveDroppedItem(dropData) {
  if (!dropData) return null;
  if (dropData.uuid) {
    try {
      const doc = await fromUuid(dropData.uuid);
      if (doc) return doc;
    } catch { /* ignore */ }
  }
  if (dropData.type === "Item" && dropData.id) {
    return game.items?.get(dropData.id) || null;
  }
  return null;
}

async function inspectDocumentByUuid(uuid) {
  if (!uuid) {
    ui.notifications?.info("This entry is a saved custom item snapshot and will be restored when you apply this level.");
    return;
  }
  try {
    const doc = await fromUuid(uuid);
    if (doc?.sheet) {
      doc.sheet.render(true);
    } else {
      ui.notifications?.warn("Could not open item sheet for this entry.");
    }
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Failed to inspect UUID:", uuid, err);
  }
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ------------------------------------------------------------------------- */
/* LEVEL PLANNER APPLICATION (ApplicationV2)                                 */
/* ------------------------------------------------------------------------- */

export class LevelPlannerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._selectedActorId = options.actorId || null;
    this._selectedLevel = null;
    this._viewMode = "focus"; // "focus" | "overview" | "summary"
    this._hidePastLevels = false;
    this._showAllWorldPCs = false;
    this._onOpenChecker = typeof options.onOpenChecker === "function" ? options.onOpenChecker : null;
    this._hookIds = [];
    this._refreshTimer = null;
    this._onKeyDownBound = null;
    this._isApplyingLevelUp = false;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-level-planner",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-lp-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.LevelPlanner.Title",
      icon: "fa-solid fa-stairs",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 1040,
      height: 720
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/level-planner.hbs`
    }
  };

  render(options = {}, _legacyOptions = {}) {
    if (typeof options === "boolean") {
      options = { force: options };
    }
    return super.render(options, _legacyOptions);
  }

  toggle() {
    if (!isLevelPlannerEnabled()) {
      ui.notifications?.warn("Enable 'PF2e Level 1-20 Build Planner & Guided Level-Up' in Module Settings first.");
      return;
    }
    if (this.rendered) {
      this.close();
    } else {
      this.render({ force: true });
    }
  }

  openForActor(actorOrId, focusLevel = null) {
    if (!isLevelPlannerEnabled()) {
      ui.notifications?.warn("The Level 1-20 Build Planner is currently disabled by the GM in Module Settings.");
      return;
    }
    const id = typeof actorOrId === "string" ? actorOrId : actorOrId?.id;
    if (id) {
      const actor = game.actors?.get(id);
      if (!actor || actor.type !== "character") return;
      if (!game.user?.isGM && !actor.isOwner) {
        ui.notifications?.warn("You can only open the Level Planner for characters you own.");
        return;
      }
      if (id !== this._selectedActorId) {
        this._selectedActorId = id;
        const curLvl = Math.max(1, Number(actor.level ?? 1));
        this._selectedLevel = focusLevel || (curLvl < 20 ? curLvl + 1 : 20);
      } else if (focusLevel) {
        this._selectedLevel = focusLevel;
      }
      if (game.user?.isGM) {
        const list = collectCandidateActors(false);
        if (!list.some(a => a.id === id)) {
          this._showAllWorldPCs = true;
        }
      }
    }
    this.render({ force: true });
  }

  async _prepareContext(_options) {
    const isGM = Boolean(game.user?.isGM);
    const actors = collectCandidateActors(this._showAllWorldPCs);

    if (!this._selectedActorId || !actors.some(a => a.id === this._selectedActorId)) {
      this._selectedActorId = actors[0]?.id || null;
      this._selectedLevel = null;
    }

    const selectedActor = this._selectedActorId ? game.actors?.get(this._selectedActorId) : null;
    const roadmap = selectedActor ? buildLevelRoadmap(selectedActor) : null;
    const canEdit = Boolean(selectedActor && (isGM || selectedActor.isOwner));

    if (roadmap) {
      if (!this._selectedLevel || this._selectedLevel < 1 || this._selectedLevel > 20) {
        this._selectedLevel = roadmap.canLevelUp ? roadmap.nextLevel : roadmap.currentLevel;
      }
    }

    const actorOptions = actors.map(a => ({
      id: a.id,
      name: a.name,
      level: Number(a.level ?? 1),
      selected: a.id === this._selectedActorId
    }));

    let navLevels = [];
    let focusedLevel = null;
    let overviewLevels = [];
    let summaryFeats = [];
    let hasAnySpellcasting = false;
    let primarySpellTradition = "";
    let primarySpellEntryKey = "";
    let nextLevelReadyCount = 0;
    let nextLevelTotalCount = 0;

    if (roadmap) {
      const spSources = roadmap.checkerReport?.spellcasting?.sources || [];
      const nonFocusSources = spSources.filter(s => !s.isFocus && !s.isDivineFont);
      hasAnySpellcasting = nonFocusSources.length > 0;
      if (nonFocusSources.length > 0) {
        primarySpellTradition = nonFocusSources[0].tradition || "";
        primarySpellEntryKey = nonFocusSources[0].key || "";
      }

      navLevels = roadmap.levels
        .filter(l => !this._hidePastLevels || !l.isPast)
        .map(l => {
          let pillText = "";
          let pillClass = "is-muted";
          if (l.isCurrent) {
            pillText = "Current";
            pillClass = "is-current";
          } else if (l.isPast) {
            pillText = "Live";
            pillClass = "is-past";
          } else if (l.isLevelPlanComplete) {
            pillText = l.isNextLevel ? "Next · Ready" : "Ready";
            pillClass = "is-ready";
          } else if (l.plannedItemsDone > 0) {
            pillText = `${l.plannedItemsDone}/${l.plannedItemsTotal}`;
            pillClass = l.isNextLevel ? "is-next" : "is-partial";
          } else {
            pillText = l.isNextLevel ? "Next" : `0/${l.plannedItemsTotal}`;
            pillClass = l.isNextLevel ? "is-next" : "is-empty";
          }

          return {
            level: l.level,
            isSelected: l.level === this._selectedLevel,
            isPast: l.isPast,
            isCurrent: l.isCurrent,
            isNextLevel: l.isNextLevel,
            isFuture: l.isFuture,
            hasBoosts: l.hasBoosts,
            hasIntBonus: l.hasIntBonus,
            hasSkillIncrease: l.hasSkillIncrease,
            hasSpellMilestones: l.hasSpellMilestones,
            isAlchemistFutureGain: l.isAlchemistFutureGain,
            featCount: l.featSlots.length,
            pillText,
            pillClass
          };
        });

      const rawFocused = roadmap.levels.find(l => l.level === this._selectedLevel) || roadmap.levels[0];
      if (rawFocused) {
        const defaultTrad = rawFocused.spellMilestones?.[0]?.tradition || primarySpellTradition;
        const defaultEntryKey = rawFocused.spellMilestones?.[0]?.entryKey || primarySpellEntryKey;
        const defaultMaxRank = rawFocused.spellMilestones?.[0]?.maxRank || Math.min(10, Math.ceil(rawFocused.level / 2));
        const defaultUnlockRank = rawFocused.spellMilestones?.[0]?.unlockedNewRank || 0;

        focusedLevel = {
          ...rawFocused,
          canEditThisLevel: Boolean(canEdit && rawFocused.isFuture),
          canRevertToThisLevel: Boolean(canEdit && rawFocused.isPast && !this._isApplyingLevelUp),
          revertRangeLabel: rawFocused.level + 1 === roadmap.currentLevel
            ? `${roadmap.currentLevel}`
            : `${rawFocused.level + 1}–${roadmap.currentLevel}`,
          canStepPrev: rawFocused.level > 1,
          canStepNext: rawFocused.level < 20,
          prevLevel: Math.max(1, rawFocused.level - 1),
          nextStepLevel: Math.min(20, rawFocused.level + 1),
          showSpellsPanel: Boolean(rawFocused.hasSpellMilestones || rawFocused.hasPlannedSpells || (rawFocused.isFuture && hasAnySpellcasting)),
          showFormulasPanel: Boolean(rawFocused.hasFormulaMilestone || rawFocused.hasPlannedFormulas),
          defaultSpellTradition: defaultTrad,
          defaultSpellEntryKey: defaultEntryKey,
          defaultSpellMaxRank: defaultMaxRank,
          defaultSpellUnlockRank: defaultUnlockRank,
          plannedSpellsDisplay: (rawFocused.plannedSpells || []).map(sp => ({
            ...sp,
            rankLabel: sp.isCantrip ? "Cantrip" : `Rank ${sp.rank || 1}`,
            traditionLabel: TRADITION_LABELS[sp.tradition] || (sp.tradition ? capitalize(sp.tradition) : "")
          }))
        };
      }

      overviewLevels = roadmap.levels
        .filter(l => !this._hidePastLevels || !l.isPast)
        .map(l => ({
          level: l.level,
          isPast: l.isPast,
          isCurrent: l.isCurrent,
          isNextLevel: l.isNextLevel,
          isFuture: l.isFuture,
          isSelected: l.level === this._selectedLevel,
          classFeaturesText: l.classFeatures.map(f => f.name).join(", ") || "—",
          boostsText: l.hasBoosts
            ? (l.boostInfo?.selectedLabels || (l.isFuture ? `Pick ${l.boostInfo?.expected || 1}` : "—"))
            : "—",
          intBonusText: l.hasIntBonus
            ? (l.intBonusInfo?.chosenSkill
              ? `${l.intBonusInfo.chosenLabel}${l.intBonusInfo.chosenLanguage ? ` + ${l.intBonusInfo.chosenLanguage}` : ""}`
              : "Pick Skill & Language")
            : "",
          skillText: l.hasSkillIncrease
            ? (l.isFuture
              ? (l.skillIncreaseInfo?.chosenTransition || "Choose Skill")
              : "Live Sheet")
            : "—",
          featsSummary: l.featSlots.map(s => ({
            slotLabel: s.groupLabel,
            featName: s.feat?.name || null,
            filled: s.filled,
            hasWarnings: s.hasWarnings
          })),
          spellsText: l.hasSpellMilestones
            ? l.spellMilestones.map(m => `${m.title}: ${m.deltaText}`).join(" · ")
            : (l.hasPlannedSpells ? `${l.plannedSpells.length} planned spell(s)` : "—"),
          plannedSpellsCount: l.plannedSpells.length,
          formulasText: l.isAlchemistFutureGain
            ? `Formulas: ${l.plannedFormulasCount}/${l.formulaMilestone?.gain || 2} (+${l.formulaMilestone?.gain || 2} free)`
            : (l.hasPlannedFormulas ? `${l.plannedFormulasCount} planned formula(s)` : "")
        }));

      for (const l of roadmap.levels) {
        for (const s of l.featSlots) {
          if (!s.feat) continue;
          summaryFeats.push({
            level: l.level,
            isFuture: l.isFuture,
            groupLabel: s.groupLabel,
            name: s.feat.name,
            uuid: s.feat.uuid,
            img: s.feat.img || "systems/pf2e/icons/default-icons/feat.svg",
            hasWarnings: Boolean(s.hasWarnings),
            warningText: (s.warnings || []).join("; ")
          });
        }
      }

      const nextData = roadmap.levels.find(l => l.isNextLevel);
      if (nextData) {
        nextLevelReadyCount = nextData.plannedItemsDone;
        nextLevelTotalCount = nextData.plannedItemsTotal;
      }
    }

    return {
      isGM,
      canEdit,
      showAllWorldPCs: this._showAllWorldPCs,
      hidePastLevels: this._hidePastLevels,
      actorOptions,
      hasMultipleActors: actorOptions.length > 1 || isGM,
      hasRoadmap: Boolean(roadmap),
      roadmap,
      navLevels,
      focusedLevel,
      overviewLevels,
      summaryFeats,
      hasSummaryFeats: summaryFeats.length > 0,
      isViewFocus: this._viewMode === "focus",
      isViewOverview: this._viewMode === "overview",
      isViewSummary: this._viewMode === "summary",
      canApplyLevelUp: Boolean(roadmap?.canLevelUp && canEdit && !this._isApplyingLevelUp),
      canDeLevel: Boolean(roadmap?.canDeLevel && canEdit && !this._isApplyingLevelUp),
      nextLevelReadyCount,
      nextLevelTotalCount,
      hasCheckerCallback: Boolean(this._onOpenChecker)
    };
  }

  _scheduleRefresh() {
    if (!this.rendered) return;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (this.rendered) this.render({ force: false });
    }, 160);
  }

  _bindReactiveHooks() {
    if (this._hookIds.length > 0) return;
    const onActorChange = (actor) => {
      if (actor?.type === "character" && actor.id === this._selectedActorId) {
        this._scheduleRefresh();
      }
    };
    const onItemChange = (item) => {
      if (item?.parent?.type === "character" && item.parent.id === this._selectedActorId) {
        this._scheduleRefresh();
      }
    };
    this._hookIds.push(
      { hook: "updateActor", id: Hooks.on("updateActor", onActorChange) },
      { hook: "createItem", id: Hooks.on("createItem", onItemChange) },
      { hook: "updateItem", id: Hooks.on("updateItem", onItemChange) },
      { hook: "deleteItem", id: Hooks.on("deleteItem", onItemChange) }
    );
  }

  _unbindReactiveHooks() {
    for (const { hook, id } of this._hookIds) {
      try {
        Hooks.off(hook, id);
      } catch { /* ignore */ }
    }
    this._hookIds = [];
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    this._bindReactiveHooks();

    // Strictly scope ALL DOM listeners inside `.pf2e-lp-container` so native header buttons work!
    const container = root.querySelector(".pf2e-lp-container");
    if (!container) return;

    if (!this._onKeyDownBound) {
      this._onKeyDownBound = (e) => {
        if (e.key === "Escape" && this.rendered) {
          // Only close if no modal dialog is on top
          const openDialog = document.querySelector(".pf2e-lp-picker-dialog");
          if (openDialog) return;
          e.preventDefault();
          this.close();
        }
      };
      window.addEventListener("keydown", this._onKeyDownBound);
    }

    // 1. Click Actions
    container.querySelectorAll("[data-lp-action]").forEach(el => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._handleAction(el.dataset.lpAction, el);
      });
    });

    // 2. Actor Dropdown
    const actorSelect = container.querySelector("#pf2e-lp-actor-select");
    if (actorSelect) {
      actorSelect.addEventListener("change", (e) => {
        const newId = e.target.value;
        if (newId && newId !== this._selectedActorId) {
          this._selectedActorId = newId;
          const actor = game.actors?.get(newId);
          const curLvl = Math.max(1, Number(actor?.level ?? 1));
          this._selectedLevel = curLvl < 20 ? curLvl + 1 : 20;
          this.render({ force: false });
        }
      });
    }

    // 3. Checkboxes (Show All World PCs, Hide Past Levels)
    const showAllCb = container.querySelector("#pf2e-lp-show-all");
    if (showAllCb) {
      showAllCb.addEventListener("change", (e) => {
        this._showAllWorldPCs = Boolean(e.target.checked);
        this.render({ force: false });
      });
    }

    const hidePastCb = container.querySelector("#pf2e-lp-hide-past");
    if (hidePastCb) {
      hidePastCb.addEventListener("change", (e) => {
        this._hidePastLevels = Boolean(e.target.checked);
        this.render({ force: false });
      });
    }

    // 4. Skill Increase Dropdown & INT Increase Bonus Controls
    const skillSelect = container.querySelector("#pf2e-lp-skill-select");
    if (skillSelect) {
      skillSelect.addEventListener("change", async (e) => {
        const actor = this._getSelectedActor();
        if (!actor) return;
        const levelNum = Number(e.target.dataset.level || this._selectedLevel);
        const slug = e.target.value || null;
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          entry.skillIncrease = slug;
        });
        this.render({ force: false });
      });
    }

    const intSkillSelect = container.querySelector("#pf2e-lp-int-skill-select");
    if (intSkillSelect) {
      intSkillSelect.addEventListener("change", async (e) => {
        const actor = this._getSelectedActor();
        if (!actor) return;
        const levelNum = Number(e.target.dataset.level || this._selectedLevel);
        const slug = e.target.value || null;
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          entry.intBonusSkill = slug;
        });
        this.render({ force: false });
      });
    }

    const intLangInput = container.querySelector("#pf2e-lp-int-lang-input");
    if (intLangInput) {
      intLangInput.addEventListener("change", async (e) => {
        const actor = this._getSelectedActor();
        if (!actor) return;
        const levelNum = Number(e.target.dataset.level || this._selectedLevel);
        const lang = String(e.target.value || "").trim();
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          entry.intBonusLanguage = lang;
        });
        this.render({ force: false });
      });
    }

    // 5. Native Drag & Drop for Future Feat Slots, Spells, and Alchemist Formulas
    const bindDropZones = (selector, onDropFn) => {
      container.querySelectorAll(selector).forEach(zone => {
        zone.addEventListener("dragover", (e) => {
          e.preventDefault();
          zone.classList.add("is-dragover");
        });
        zone.addEventListener("dragleave", () => {
          zone.classList.remove("is-dragover");
        });
        zone.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.remove("is-dragover");
          await onDropFn(e, zone);
        });
      });
    };

    bindDropZones("[data-lp-drop-slot]", (e, zone) => this._handleFeatDrop(e, zone));
    bindDropZones("[data-lp-drop-spell]", (e, zone) => this._handleSpellDrop(e, zone));
    bindDropZones("[data-lp-drop-formula]", (e, zone) => this._handleFormulaDrop(e, zone));
  }

  _getSelectedActor() {
    return this._selectedActorId ? game.actors?.get(this._selectedActorId) : null;
  }

  async _handleAction(action, el) {
    const actor = this._getSelectedActor();

    switch (action) {
      case "select-level": {
        const lvl = Number(el.dataset.level);
        if (lvl >= 1 && lvl <= 20) {
          this._selectedLevel = lvl;
          this._viewMode = "focus";
          this.render({ force: false });
        }
        break;
      }

      case "set-view": {
        const mode = el.dataset.view;
        if (mode === "focus" || mode === "overview" || mode === "summary") {
          this._viewMode = mode;
          this.render({ force: false });
        }
        break;
      }

      case "open-sheet":
        if (actor?.sheet) actor.sheet.render(true);
        break;

      case "open-checker":
        if (actor && this._onOpenChecker) {
          this._onOpenChecker(actor);
        }
        break;

      case "inspect-uuid":
        await inspectDocumentByUuid(el.dataset.uuid);
        break;

      case "toggle-boost": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const attrKey = el.dataset.attr;
        const expected = Number(el.dataset.expected || 1);
        if (!levelNum || !attrKey) return;

        await updatePlannedLevelData(actor, levelNum, (entry) => {
          const list = Array.isArray(entry.boosts) ? [...entry.boosts] : [];
          const idx = list.indexOf(attrKey);
          const hadInt = list.includes("int");
          if (idx >= 0) {
            list.splice(idx, 1);
          } else {
            if (expected === 1) {
              list.splice(0, list.length, attrKey);
            } else if (list.length < expected) {
              list.push(attrKey);
            }
          }
          entry.boosts = list;
          // Clear stale INT bonus picks if INT boost was toggled off at this level
          if (hadInt && !list.includes("int")) {
            entry.intBonusSkill = null;
            entry.intBonusLanguage = "";
          }
        });
        this.render({ force: false });
        break;
      }

      case "browse-feat": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const slotKey = el.dataset.slotKey;
        const roadmap = buildLevelRoadmap(actor);
        const slot = roadmap?.levels?.find(l => l.level === levelNum)?.featSlots?.find(s => s.slotKey === slotKey);
        if (slot) {
          await openNativeBrowserForFeatSlot(slot);
        }
        break;
      }

      case "pick-feat": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const slotKey = el.dataset.slotKey;
        const roadmap = buildLevelRoadmap(actor);
        const slot = roadmap?.levels?.find(l => l.level === levelNum)?.featSlots?.find(s => s.slotKey === slotKey);
        if (slot) {
          await this._openFeatQuickPicker(actor, levelNum, slot);
        }
        break;
      }

      case "clear-feat": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const slotKey = el.dataset.slotKey;
        if (!levelNum || !slotKey) return;
        await clearPlannedFeat(actor, levelNum, slotKey);
        this.render({ force: false });
        break;
      }

      case "browse-spells": {
        const tradition = el.dataset.tradition || "";
        const maxRank = Number(el.dataset.maxRank || 1);
        const unlockedNewRank = Number(el.dataset.unlockRank || 0);
        await openNativeBrowserForSpells({ tradition, maxRank, unlockedNewRank });
        break;
      }

      case "pick-spell": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const tradition = el.dataset.tradition || "";
        const entryKey = el.dataset.entryKey || "";
        const maxRank = Number(el.dataset.maxRank || Math.min(10, Math.ceil(levelNum / 2)));
        const unlockedNewRank = Number(el.dataset.unlockRank || 0);
        await this._openSpellQuickPicker(actor, levelNum, { tradition, entryKey, maxRank, unlockedNewRank });
        break;
      }

      case "remove-spell": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const spellPlanId = el.dataset.spellId;
        const spellUuid = el.dataset.uuid;
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          entry.spells = (entry.spells || []).filter(sp =>
            spellPlanId ? sp.id !== spellPlanId : sp.uuid !== spellUuid
          );
        });
        this.render({ force: false });
        break;
      }

      case "browse-formulas": {
        const maxLevel = Number(el.dataset.maxLevel || this._selectedLevel || 1);
        await openNativeBrowserForFormulas({ maxLevel });
        break;
      }

      case "pick-formula": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level || this._selectedLevel || 2);
        await this._openFormulaQuickPicker(actor, levelNum);
        break;
      }

      case "remove-formula": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const formulaId = el.dataset.formulaId;
        const formulaUuid = el.dataset.uuid;
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          entry.formulas = (entry.formulas || []).filter(fm =>
            formulaId ? fm.id !== formulaId : fm.uuid !== formulaUuid
          );
        });
        this.render({ force: false });
        break;
      }

      case "clear-plan": {
        if (!actor) return;
        const confirmed = await this._confirmDialog({
          title: `Clear Build Plan — ${actor.name}`,
          content: `<p>Clear all planned future attribute boosts, INT bonuses, skill increases, feats, spells, and formulas for <strong>${foundry.utils.escapeHTML(actor.name)}</strong>?</p><p style="opacity:0.8;font-size:0.9em;">This only clears future plan notes and does not change anything already on the character sheet.</p>`
        });
        if (!confirmed) return;
        await clearActorLevelPlan(actor);
        ui.notifications?.info(`Cleared future build plan for ${actor.name}.`);
        this.render({ force: false });
        break;
      }

      case "apply-level-up": {
        if (!actor || this._isApplyingLevelUp) return;
        await this._confirmAndApplyLevelUp(actor);
        break;
      }

      case "revert-to-level": {
        if (!actor || this._isApplyingLevelUp) return;
        const curLvl = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
        const requestedTarget = Number(el.dataset.level || Math.max(1, curLvl - 1));
        await this._openRevertLevelDialog(actor, requestedTarget);
        break;
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* DRAG & DROP HANDLERS                                                    */
  /* ----------------------------------------------------------------------- */

  async _handleFeatDrop(event, zone) {
    const actor = this._getSelectedActor();
    if (!actor || (!game.user?.isGM && !actor.isOwner)) return;

    const levelNum = Number(zone.dataset.level);
    const slotKey = zone.dataset.slotKey;
    const slotLabel = zone.dataset.slotLabel || "Feat Slot";
    if (!levelNum || !slotKey || levelNum <= (actor.level || 1)) return;

    const dropData = extractDropData(event);
    const doc = await resolveDroppedItem(dropData);
    if (!doc || doc.type !== "feat") {
      ui.notifications?.warn("Drop a PF2e Feat onto a planned feat slot.");
      return;
    }

    const docTraits = Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value.map(normalizeSlug) : [];
    const snapshot = {
      uuid: doc.uuid,
      name: doc.name,
      img: doc.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number(doc.system?.level?.value ?? 0),
      category: doc.system?.category || "",
      isDedication: docTraits.includes("dedication") || /\bdedication\b/i.test(doc.name || ""),
      prerequisites: (doc.system?.prerequisites?.value || []).map(p => p?.value || p).filter(Boolean)
    };

    await updatePlannedLevelData(actor, levelNum, (entry) => {
      entry.feats[slotKey] = snapshot;
    });

    ui.notifications?.info(`Planned "${doc.name}" for Level ${levelNum} (${slotLabel}).`);
    this.render({ force: false });
  }

  async _handleSpellDrop(event, zone) {
    const actor = this._getSelectedActor();
    if (!actor || (!game.user?.isGM && !actor.isOwner)) return;

    const levelNum = Number(zone.dataset.level);
    const defaultTrad = zone.dataset.tradition || "";
    const defaultEntryKey = zone.dataset.entryKey || "";
    if (!levelNum || levelNum <= (actor.level || 1)) return;

    const dropData = extractDropData(event);
    const doc = await resolveDroppedItem(dropData);
    if (!doc || doc.type !== "spell") {
      ui.notifications?.warn("Drop a PF2e Spell onto the Spell Planning area.");
      return;
    }

    const traits = Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [];
    const rawTrads = doc.system?.traits?.traditions ?? doc.system?.traditions?.value ?? doc.system?.traditions;
    const docTrads = Array.isArray(rawTrads) ? rawTrads : (rawTrads instanceof Set ? Array.from(rawTrads) : []);
    const snapshot = {
      id: foundry.utils.randomID(8),
      uuid: doc.uuid,
      name: doc.name,
      img: doc.img || "systems/pf2e/icons/default-icons/spell.svg",
      rank: Number(doc.system?.level?.value ?? 1),
      isCantrip: traits.includes("cantrip"),
      tradition: defaultTrad || docTrads[0] || "",
      entryKey: defaultEntryKey
    };

    await updatePlannedLevelData(actor, levelNum, (entry) => {
      const exists = entry.spells.some(s => s.uuid === snapshot.uuid && Number(s.rank) === snapshot.rank);
      if (!exists) entry.spells.push(snapshot);
    });

    ui.notifications?.info(`Planned spell "${doc.name}" for Level ${levelNum}.`);
    this.render({ force: false });
  }

  async _handleFormulaDrop(event, zone) {
    const actor = this._getSelectedActor();
    if (!actor || (!game.user?.isGM && !actor.isOwner)) return;

    const levelNum = Number(zone.dataset.level);
    if (!levelNum || levelNum <= (actor.level || 1)) return;

    const dropData = extractDropData(event);
    const doc = await resolveDroppedItem(dropData);
    if (!doc || !FORMULA_CRAFTABLE_TYPES.has(doc.type)) {
      ui.notifications?.warn("Drop a PF2e alchemical or craftable item onto the Alchemist Formulas panel.");
      return;
    }

    const snapshot = {
      id: foundry.utils.randomID(8),
      uuid: doc.uuid,
      name: doc.name,
      img: doc.img || "systems/pf2e/icons/default-icons/consumable.svg",
      level: Number(doc.system?.level?.value ?? 0)
    };

    await updatePlannedLevelData(actor, levelNum, (entry) => {
      const exists = (entry.formulas || []).some(f => f.uuid === snapshot.uuid);
      if (!exists) entry.formulas.push(snapshot);
    });

    ui.notifications?.info(`Planned formula "${doc.name}" for Level ${levelNum}.`);
    this.render({ force: false });
  }

  /* ----------------------------------------------------------------------- */
  /* LIGHTWEIGHT INLINE QUICK PICK MODALS                                    */
  /* ----------------------------------------------------------------------- */

  async _openFeatQuickPicker(actor, levelNum, slot) {
    const esc = foundry.utils.escapeHTML;
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      await openNativeBrowserForFeatSlot(slot);
      return;
    }

    const slotDedications = Array.isArray(slot.dedications) ? slot.dedications : [];
    const hasDedications = slotDedications.length > 0;
    const dedShortNames = slotDedications.map(d => d.shortLabel).filter(Boolean).join(", ");
    const myArchLabel = slotDedications.length > 1
      ? `My Archetypes (${dedShortNames})`
      : `My Archetype (${dedShortNames})`;

    const defaultScope = slot.groupId === "archetype"
      ? (hasDedications ? "my-archetypes" : "archetype-dedications")
      : (slot.groupId === "class" || slot.groupId === "dualclass" ? "class-only" : "slot");

    const traitDisplayList = (slot.traits || [])
      .filter(Boolean)
      .map(t => capitalize(String(t).replace(/-/g, " ")));
    const traitSummary = traitDisplayList.length > 0 ? ` (${traitDisplayList.join(", ")})` : "";

    let scopeOptionsHtml = "";
    if (slot.groupId === "class" || slot.groupId === "dualclass") {
      scopeOptionsHtml = `
        <option value="class-only" selected>Class Feats Only${esc(traitSummary)}</option>
        ${hasDedications ? `<option value="my-archetypes">${esc(myArchLabel)}</option>` : ""}
        <option value="class-and-archetype">Class + Archetypes</option>
        <option value="archetype-dedications">Archetype Dedications</option>
        <option value="archetype">All Archetype Feats</option>
        <option value="all">All Feats (Unfiltered)</option>
      `;
    } else if (slot.groupId === "archetype") {
      const perDedOptions = slotDedications.length > 1
        ? slotDedications.map((d, idx) => `<option value="ded:${idx}">Only: ${esc(d.shortLabel)}</option>`).join("")
        : "";
      scopeOptionsHtml = `
        ${hasDedications ? `<option value="my-archetypes" selected>${esc(myArchLabel)}</option>` : ""}
        ${perDedOptions}
        <option value="archetype-dedications" ${!hasDedications ? "selected" : ""}>Archetype Dedications</option>
        <option value="archetype">All Archetype Feats &amp; Dedications</option>
        <option value="all">All Feats (Unfiltered)</option>
      `;
    } else if (slot.category === "ancestry") {
      scopeOptionsHtml = `
        <option value="slot" selected>My Ancestry${esc(traitSummary)}</option>
        <option value="all-ancestry">All Ancestry Feats</option>
        <option value="all">All Feats (Unfiltered)</option>
      `;
    } else if (slot.category === "general") {
      scopeOptionsHtml = `
        <option value="slot" selected>General &amp; Skill Feats</option>
        <option value="general-only">General Feats Only</option>
        <option value="all">All Feats (Unfiltered)</option>
      `;
    } else {
      scopeOptionsHtml = `
        <option value="slot" selected>Matching Slot (${esc(capitalize(slot.category || "All"))})</option>
        <option value="all">All Feats (Unfiltered)</option>
      `;
    }

    const content = `
      <div class="pf2e-lp-picker">
        <div class="pf2e-lp-picker-controls">
          <input type="text" class="pf2e-lp-picker-search" placeholder="Search ${esc(slot.groupLabel)} (Lv ≤ ${slot.level})..." autofocus />
          <select class="pf2e-lp-picker-scope" title="Filter scope">
            ${scopeOptionsHtml}
          </select>
          <label class="pf2e-lp-picker-check" title="Include feats higher than Level ${slot.level}">
            <input type="checkbox" class="pf2e-lp-picker-any-lvl" />
            <span>Any Lv</span>
          </label>
          <button type="button" class="pf2e-lp-picker-browser-btn" title="Open PF2e's full native Compendium Browser">
            <i class="fa-solid fa-compass"></i> PF2e Browser
          </button>
        </div>
        <div class="pf2e-lp-picker-status">Loading lightweight feat index...</div>
        <div class="pf2e-lp-picker-list"></div>
      </div>
    `;

    const dialog = new DialogV2({
      window: {
        title: `Pick ${slot.groupLabel} — Level ${levelNum}`,
        icon: "fa-solid fa-star",
        resizable: true
      },
      position: { width: 640, height: 540 },
      classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog"],
      content,
      buttons: [
        {
          action: "close",
          label: "Close",
          icon: "fa-solid fa-xmark"
        }
      ]
    });

    dialog.addEventListener("render", async () => {
      const root = dialog.element?.querySelector?.(".pf2e-lp-picker");
      if (!root) return;

      const searchInput = root.querySelector(".pf2e-lp-picker-search");
      const scopeSelect = root.querySelector(".pf2e-lp-picker-scope");
      const anyLvlCb = root.querySelector(".pf2e-lp-picker-any-lvl");
      const browserBtn = root.querySelector(".pf2e-lp-picker-browser-btn");
      const statusEl = root.querySelector(".pf2e-lp-picker-status");
      const listEl = root.querySelector(".pf2e-lp-picker-list");

      browserBtn?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openNativeBrowserForFeatSlot(slot);
      });

      const allFeats = await getLightweightFeatIndex();
      const slotTraits = (slot.traits || []).map(normalizeSlug).filter(Boolean);
      const myArchetypeUuids = hasDedications
        ? computeMatchingArchetypeFeatUuids(allFeats, slotDedications)
        : new Set();
      const perDedicationUuids = slotDedications.length > 1
        ? slotDedications.map(d => computeMatchingArchetypeFeatUuids(allFeats, [d]))
        : [];

      const renderList = () => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const scope = scopeSelect?.value || defaultScope;
        const anyLvl = Boolean(anyLvlCb?.checked);

        const matched = [];
        for (const f of allFeats) {
          if (!anyLvl && f.level > slot.level) continue;
          if (f.category === "classfeature" || f.category === "ancestryfeature") continue;

          if (scope === "class-only") {
            if (f.category !== "class") continue;
            if (slotTraits.length > 0 && !slotTraits.some(t => f.traits.includes(t))) continue;
          } else if (scope === "class-and-archetype") {
            const isMyClass = f.category === "class" && (slotTraits.length === 0 || slotTraits.some(t => f.traits.includes(t)));
            const isArchetype = f.traits.includes("archetype") || f.traits.includes("dedication");
            if (!isMyClass && !isArchetype) continue;
          } else if (scope === "my-archetypes") {
            if (!myArchetypeUuids.has(f.uuid)) continue;
          } else if (scope.startsWith("ded:")) {
            const dIdx = Number(scope.slice(4));
            const set = perDedicationUuids[dIdx];
            if (!set || !set.has(f.uuid)) continue;
          } else if (scope === "archetype-dedications") {
            if (!f.traits.includes("dedication")) continue;
          } else if (scope === "archetype") {
            const isArchetype = f.traits.includes("archetype") || f.traits.includes("dedication");
            if (!isArchetype) continue;
          } else if (scope === "all-ancestry") {
            if (f.category !== "ancestry") continue;
          } else if (scope === "general-only") {
            if (f.category !== "general") continue;
          } else if (scope === "slot") {
            if (slot.category === "general") {
              if (f.category !== "general" && f.category !== "skill") continue;
            } else if (slot.category === "ancestry") {
              if (f.category !== "ancestry") continue;
              if (slotTraits.length > 0 && !slotTraits.some(t => f.traits.includes(t))) continue;
            } else if (slot.category && f.category !== slot.category) {
              continue;
            }
          }

          if (query) {
            const nameMatch = f.name.toLowerCase().includes(query);
            const traitMatch = f.traits.some(t => t.includes(query));
            if (!nameMatch && !traitMatch) continue;
          }

          matched.push(f);
        }

        // Sort highest level first (near slot level) then alphabetical — feels awesome when picking Lv 8/10 feats!
        matched.sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));

        const capped = matched.slice(0, 120);
        statusEl.textContent = matched.length > 120
          ? `Showing top 120 of ${matched.length} matching feats — type to narrow search`
          : `${matched.length} matching feat(s)`;

        if (capped.length === 0) {
          listEl.innerHTML = `<div class="pf2e-lp-picker-empty">No feats match the current filter. Try switching filter to "All Feats" or clearing search.</div>`;
          return;
        }

        listEl.innerHTML = capped.map((f, idx) => {
          const prereqStr = f.prerequisites.length > 0 ? `Prereq: ${f.prerequisites.join(", ")}` : "";
          const traitStr = f.traits.slice(0, 4).join(" · ");
          const sub = [traitStr, prereqStr].filter(Boolean).join(" — ");
          return `
            <div class="pf2e-lp-picker-row">
              <img src="${esc(f.img)}" alt="" class="pf2e-lp-picker-img" />
              <div class="pf2e-lp-picker-info">
                <div class="pf2e-lp-picker-name-line">
                  <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Open full feat sheet">${esc(f.name)}</a>
                  <span class="pf2e-lp-picker-lvl">Lv ${f.level}</span>
                  ${f.rarity && f.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(f.rarity)}">${esc(capitalize(f.rarity))}</span>` : ""}
                </div>
                ${sub ? `<div class="pf2e-lp-picker-sub">${esc(sub)}</div>` : ""}
              </div>
              <button type="button" class="pf2e-lp-picker-select" data-idx="${idx}">Select</button>
            </div>
          `;
        }).join("");

        listEl.querySelectorAll(".pf2e-lp-picker-inspect").forEach(link => {
          link.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const item = capped[Number(link.dataset.idx)];
            if (item?.uuid) await inspectDocumentByUuid(item.uuid);
          });
        });

        listEl.querySelectorAll(".pf2e-lp-picker-select").forEach(btn => {
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const chosen = capped[Number(btn.dataset.idx)];
            if (!chosen) return;
            await updatePlannedLevelData(actor, levelNum, (entry) => {
              entry.feats[slot.slotKey] = {
                uuid: chosen.uuid,
                name: chosen.name,
                img: chosen.img,
                level: chosen.level,
                category: chosen.category,
                isDedication: Boolean(chosen.traits?.includes("dedication") || /\bdedication\b/i.test(chosen.name || "")),
                prerequisites: chosen.prerequisites || []
              };
            });
            ui.notifications?.info(`Planned "${chosen.name}" for Level ${levelNum} (${slot.groupLabel}).`);
            dialog.close();
            this.render({ force: false });
          });
        });
      };

      let debounce = null;
      searchInput?.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(renderList, 60);
      });
      scopeSelect?.addEventListener("change", renderList);
      anyLvlCb?.addEventListener("change", renderList);

      renderList();
      searchInput?.focus();
    }, { once: true });

    dialog.render({ force: true });
  }

  async _openSpellQuickPicker(actor, levelNum, { tradition = "", entryKey = "", maxRank = 1, unlockedNewRank = 0 } = {}) {
    const esc = foundry.utils.escapeHTML;
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      await openNativeBrowserForSpells({ tradition, maxRank, unlockedNewRank });
      return;
    }

    const defaultRankVal = unlockedNewRank > 0 ? String(unlockedNewRank) : "upto";
    const rankOpts = [
      `<option value="upto" ${defaultRankVal === "upto" ? "selected" : ""}>All Ranks ≤ ${maxRank}</option>`,
      `<option value="cantrip">Cantrips</option>`
    ];
    for (let r = 1; r <= 10; r++) {
      rankOpts.push(`<option value="${r}" ${defaultRankVal === String(r) ? "selected" : ""}>Rank ${r}</option>`);
    }

    const content = `
      <div class="pf2e-lp-picker">
        <div class="pf2e-lp-picker-goal" style="display:none;"></div>
        <div class="pf2e-lp-picker-controls">
          <input type="text" class="pf2e-lp-picker-search" placeholder="Search spells to plan for Level ${levelNum}..." autofocus />
          <select class="pf2e-lp-picker-trad" title="Spell Tradition">
            <option value="" ${!tradition ? "selected" : ""}>All Traditions</option>
            <option value="arcane" ${tradition === "arcane" ? "selected" : ""}>Arcane</option>
            <option value="divine" ${tradition === "divine" ? "selected" : ""}>Divine</option>
            <option value="occult" ${tradition === "occult" ? "selected" : ""}>Occult</option>
            <option value="primal" ${tradition === "primal" ? "selected" : ""}>Primal</option>
          </select>
          <select class="pf2e-lp-picker-rank" title="Spell Rank">
            ${rankOpts.join("")}
          </select>
          <button type="button" class="pf2e-lp-picker-browser-btn" title="Open PF2e's full native Compendium Browser">
            <i class="fa-solid fa-compass"></i> PF2e Browser
          </button>
        </div>
        <div class="pf2e-lp-picker-status">Loading lightweight spell index...</div>
        <div class="pf2e-lp-picker-list"></div>
      </div>
    `;

    const dialog = new DialogV2({
      window: {
        title: `Plan Spells — Level ${levelNum}`,
        icon: "fa-solid fa-hat-wizard",
        resizable: true
      },
      position: { width: 650, height: 540 },
      classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog"],
      content,
      buttons: [
        {
          action: "done",
          label: "Done",
          icon: "fa-solid fa-check"
        }
      ]
    });

    dialog.addEventListener("render", async () => {
      const root = dialog.element?.querySelector?.(".pf2e-lp-picker");
      if (!root) return;

      const goalEl = root.querySelector(".pf2e-lp-picker-goal");
      const searchInput = root.querySelector(".pf2e-lp-picker-search");
      const tradSelect = root.querySelector(".pf2e-lp-picker-trad");
      const rankSelect = root.querySelector(".pf2e-lp-picker-rank");
      const browserBtn = root.querySelector(".pf2e-lp-picker-browser-btn");
      const statusEl = root.querySelector(".pf2e-lp-picker-status");
      const listEl = root.querySelector(".pf2e-lp-picker-list");

      const updateGoalBanner = () => {
        if (!goalEl) return;
        const rm = buildLevelRoadmap(actor);
        const lvlRow = rm?.levels?.find(l => l.level === levelNum);
        const targetMilestone = entryKey
          ? lvlRow?.spellMilestones?.find(m => m.entryKey === entryKey)
          : (lvlRow?.spellMilestones?.find(m => m.isMandatory) || lvlRow?.spellMilestones?.[0]);

        if (targetMilestone?.promptText) {
          goalEl.style.display = "";
          goalEl.classList.toggle("is-complete", Boolean(targetMilestone.isMandatory && targetMilestone.complete));
          goalEl.classList.toggle("is-needed", Boolean(targetMilestone.isMandatory && !targetMilestone.complete));
          goalEl.innerHTML = `<strong>Level ${levelNum} (${esc(targetMilestone.title)}):</strong> ${esc(targetMilestone.promptText)}${targetMilestone.signatureNote ? ` · <em>${esc(targetMilestone.signatureNote)}</em>` : ""}`;
        } else {
          goalEl.style.display = "none";
        }
      };
      updateGoalBanner();

      browserBtn?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openNativeBrowserForSpells({
          tradition: tradSelect?.value || tradition,
          maxRank,
          unlockedNewRank
        });
      });

      const allSpells = await getLightweightSpellIndex();
      const knownSpellUuids = new Set();
      const knownSpellNames = new Set();
      for (const sp of actor.itemTypes?.spell || []) {
        const src = sp._stats?.compendiumSource || sp.flags?.core?.sourceId;
        if (src) knownSpellUuids.add(src);
        if (sp.name) knownSpellNames.add(String(sp.name).toLowerCase());
      }
      const roadmapNow = buildLevelRoadmap(actor);
      const addedUuids = new Set(
        (roadmapNow?.levels?.find(l => l.level === levelNum)?.plannedSpells || [])
          .map(s => s?.uuid)
          .filter(Boolean)
      );

      const renderList = () => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const trad = tradSelect?.value || "";
        const rankFilter = rankSelect?.value || "upto";

        const matched = [];
        for (const sp of allSpells) {
          if (sp.isRitual && (trad || !query)) continue;
          // Skip focus spells without traditions when filtering by tradition
          if (trad && !sp.traditions.includes(trad)) continue;

          if (rankFilter === "cantrip") {
            if (!sp.isCantrip) continue;
          } else if (rankFilter === "upto") {
            if (sp.isCantrip) continue;
            if (sp.rank > maxRank) continue;
          } else {
            const targetR = Number(rankFilter);
            if (sp.isCantrip || sp.rank !== targetR) continue;
          }

          if (query && !sp.name.toLowerCase().includes(query)) continue;
          matched.push(sp);
        }

        matched.sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name));
        const capped = matched.slice(0, 120);
        statusEl.textContent = matched.length > 120
          ? `Showing top 120 of ${matched.length} matching spells — type to narrow search`
          : `${matched.length} matching spell(s) — click Add to bookmark multiple`;

        if (capped.length === 0) {
          listEl.innerHTML = `<div class="pf2e-lp-picker-empty">No spells match the current filter. Try switching Tradition or Rank filter above.</div>`;
          return;
        }

        listEl.innerHTML = capped.map((sp, idx) => {
          const isAdded = addedUuids.has(sp.uuid);
          const isKnown = knownSpellUuids.has(sp.uuid) || knownSpellNames.has(String(sp.name || "").toLowerCase());
          const tradText = sp.traditions.map(capitalize).join(", ") || (sp.isFocus ? "Focus" : "Special");
          return `
            <div class="pf2e-lp-picker-row">
              <img src="${esc(sp.img)}" alt="" class="pf2e-lp-picker-img" />
              <div class="pf2e-lp-picker-info">
                <div class="pf2e-lp-picker-name-line">
                  <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Open full spell sheet">${esc(sp.name)}</a>
                  <span class="pf2e-lp-picker-lvl">${sp.isCantrip ? "Cantrip" : `Rank ${sp.rank}`}</span>
                  ${sp.rarity && sp.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(sp.rarity)}">${esc(capitalize(sp.rarity))}</span>` : ""}
                  ${isKnown ? `<span class="pf2e-lp-picker-known">Known</span>` : ""}
                </div>
                <div class="pf2e-lp-picker-sub">${esc(tradText)}</div>
              </div>
              <button type="button" class="pf2e-lp-picker-select ${isAdded ? "is-added" : ""}" data-idx="${idx}">
                ${isAdded ? "Added ✓" : "+ Add"}
              </button>
            </div>
          `;
        }).join("");

        listEl.querySelectorAll(".pf2e-lp-picker-inspect").forEach(link => {
          link.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const item = capped[Number(link.dataset.idx)];
            if (item?.uuid) await inspectDocumentByUuid(item.uuid);
          });
        });

        listEl.querySelectorAll(".pf2e-lp-picker-select").forEach(btn => {
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const chosen = capped[Number(btn.dataset.idx)];
            if (!chosen) return;
            const chosenTrad = tradSelect?.value || tradition || chosen.traditions[0] || "";
            await updatePlannedLevelData(actor, levelNum, (entry) => {
              const exists = entry.spells.some(s => s.uuid === chosen.uuid && Number(s.rank) === chosen.rank);
              if (!exists) {
                entry.spells.push({
                  id: foundry.utils.randomID(8),
                  uuid: chosen.uuid,
                  name: chosen.name,
                  img: chosen.img,
                  rank: chosen.rank,
                  isCantrip: chosen.isCantrip,
                  tradition: chosenTrad,
                  entryKey
                });
              }
            });
            addedUuids.add(chosen.uuid);
            btn.classList.add("is-added");
            btn.textContent = "Added ✓";
            updateGoalBanner();
            this.render({ force: false });
          });
        });
      };

      let debounce = null;
      searchInput?.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(renderList, 60);
      });
      tradSelect?.addEventListener("change", renderList);
      rankSelect?.addEventListener("change", renderList);

      renderList();
      searchInput?.focus();
    }, { once: true });

    dialog.render({ force: true });
  }

  async _openFormulaQuickPicker(actor, levelNum) {
    const esc = foundry.utils.escapeHTML;
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      await openNativeBrowserForFormulas({ maxLevel: levelNum });
      return;
    }

    const content = `
      <div class="pf2e-lp-picker">
        <div class="pf2e-lp-picker-controls">
          <input type="text" class="pf2e-lp-picker-search" placeholder="Search bombs, elixirs, mutagens, poisons (Lv ≤ ${levelNum})..." autofocus />
          <select class="pf2e-lp-picker-scope" title="Filter scope">
            <option value="common-alchemical-consumables" selected>Common Alchemical Consumables</option>
            <option value="common-alchemical">All Common Alchemical (incl. Gear)</option>
            <option value="all-alchemical-consumables">All Alchemical Consumables</option>
            <option value="all-alchemical">All Alchemical (Any Rarity)</option>
            <option value="all-items">All Craftable Equipment</option>
          </select>
          <label class="pf2e-lp-picker-check" title="Include items higher than Level ${levelNum}">
            <input type="checkbox" class="pf2e-lp-picker-any-lvl" />
            <span>Any Lv</span>
          </label>
          <button type="button" class="pf2e-lp-picker-browser-btn" title="Open PF2e's full native Compendium Browser">
            <i class="fa-solid fa-compass"></i> PF2e Browser
          </button>
        </div>
        <div class="pf2e-lp-picker-status">Loading lightweight equipment index...</div>
        <div class="pf2e-lp-picker-list"></div>
      </div>
    `;

    const dialog = new DialogV2({
      window: {
        title: `Plan Alchemical Formulas — Level ${levelNum}`,
        icon: "fa-solid fa-flask",
        resizable: true
      },
      position: { width: 650, height: 540 },
      classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog"],
      content,
      buttons: [
        {
          action: "done",
          label: "Done",
          icon: "fa-solid fa-check"
        }
      ]
    });

    dialog.addEventListener("render", async () => {
      const root = dialog.element?.querySelector?.(".pf2e-lp-picker");
      if (!root) return;

      const searchInput = root.querySelector(".pf2e-lp-picker-search");
      const scopeSelect = root.querySelector(".pf2e-lp-picker-scope");
      const anyLvlCb = root.querySelector(".pf2e-lp-picker-any-lvl");
      const browserBtn = root.querySelector(".pf2e-lp-picker-browser-btn");
      const statusEl = root.querySelector(".pf2e-lp-picker-status");
      const listEl = root.querySelector(".pf2e-lp-picker-list");

      browserBtn?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openNativeBrowserForFormulas({ maxLevel: levelNum });
      });

      const allItems = await getLightweightFormulaIndex();
      const knownSheetUuids = new Set(
        (Array.isArray(actor.system?.crafting?.formulas) ? actor.system.crafting.formulas : [])
          .map(f => f?.uuid)
          .filter(Boolean)
      );
      const roadmapNow = buildLevelRoadmap(actor);
      const plannedOnThisLevel = new Set(
        (roadmapNow?.levels?.find(l => l.level === levelNum)?.plannedFormulas || [])
          .map(f => f?.uuid)
          .filter(Boolean)
      );

      const renderList = () => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const scope = scopeSelect?.value || "common-alchemical-consumables";
        const anyLvl = Boolean(anyLvlCb?.checked);

        const matched = [];
        for (const item of allItems) {
          if (!anyLvl && item.level > levelNum) continue;

          if (scope === "common-alchemical-consumables") {
            if (!item.isAlchemical || !item.isConsumable || item.rarity !== "common") continue;
          } else if (scope === "common-alchemical") {
            if (!item.isAlchemical || item.rarity !== "common") continue;
          } else if (scope === "all-alchemical-consumables") {
            if (!item.isAlchemical || !item.isConsumable) continue;
          } else if (scope === "all-alchemical") {
            if (!item.isAlchemical) continue;
          }

          if (query) {
            const nameMatch = item.name.toLowerCase().includes(query);
            const traitMatch = item.traits.some(t => t.includes(query));
            const catMatch = (item.category && item.category.includes(query)) || (item.group && item.group.includes(query));
            if (!nameMatch && !traitMatch && !catMatch) continue;
          }
          matched.push(item);
        }

        matched.sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));
        const capped = matched.slice(0, 120);
        statusEl.textContent = matched.length > 120
          ? `Showing top 120 of ${matched.length} matching formulas — type to narrow search`
          : `${matched.length} matching formula(s) — click Add to bookmark for Level ${levelNum}`;

        if (capped.length === 0) {
          listEl.innerHTML = `<div class="pf2e-lp-picker-empty">No matching items found. Try clearing search or changing filter scope.</div>`;
          return;
        }

        listEl.innerHTML = capped.map((item, idx) => {
          const isAdded = plannedOnThisLevel.has(item.uuid);
          const isKnown = knownSheetUuids.has(item.uuid);
          const traitStr = item.traits.slice(0, 5).join(" · ");
          return `
            <div class="pf2e-lp-picker-row">
              <img src="${esc(item.img)}" alt="" class="pf2e-lp-picker-img" />
              <div class="pf2e-lp-picker-info">
                <div class="pf2e-lp-picker-name-line">
                  <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Open item sheet">${esc(item.name)}</a>
                  <span class="pf2e-lp-picker-lvl">Lv ${item.level}</span>
                  ${item.rarity && item.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(item.rarity)}">${esc(capitalize(item.rarity))}</span>` : ""}
                  ${isKnown ? `<span class="pf2e-lp-picker-known">Known</span>` : ""}
                </div>
                ${traitStr ? `<div class="pf2e-lp-picker-sub">${esc(traitStr)}</div>` : ""}
              </div>
              <button type="button" class="pf2e-lp-picker-select ${isAdded ? "is-added" : ""}" data-idx="${idx}">
                ${isAdded ? "Added ✓" : "+ Add"}
              </button>
            </div>
          `;
        }).join("");

        listEl.querySelectorAll(".pf2e-lp-picker-inspect").forEach(link => {
          link.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const item = capped[Number(link.dataset.idx)];
            if (item?.uuid) await inspectDocumentByUuid(item.uuid);
          });
        });

        listEl.querySelectorAll(".pf2e-lp-picker-select").forEach(btn => {
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const chosen = capped[Number(btn.dataset.idx)];
            if (!chosen) return;
            await updatePlannedLevelData(actor, levelNum, (entry) => {
              const exists = (entry.formulas || []).some(f => f.uuid === chosen.uuid);
              if (!exists) {
                entry.formulas.push({
                  id: foundry.utils.randomID(8),
                  uuid: chosen.uuid,
                  name: chosen.name,
                  img: chosen.img,
                  level: chosen.level
                });
              }
            });
            plannedOnThisLevel.add(chosen.uuid);
            btn.classList.add("is-added");
            btn.textContent = "Added ✓";
            this.render({ force: false });
          });
        });
      };

      let debounce = null;
      searchInput?.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(renderList, 60);
      });
      scopeSelect?.addEventListener("change", renderList);
      anyLvlCb?.addEventListener("change", renderList);

      renderList();
      searchInput?.focus();
    }, { once: true });

    dialog.render({ force: true });
  }

  /* ----------------------------------------------------------------------- */
  /* GUIDED LEVEL-UP CONFIRMATION & EXECUTION                                */
  /* ----------------------------------------------------------------------- */

  async _confirmDialog({ title, content, yesLabel = "Confirm" }) {
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (DialogV2?.confirm) {
      return Boolean(await DialogV2.confirm({
        window: { title },
        content,
        yes: { label: yesLabel },
        no: { label: "Cancel" },
        rejectClose: false
      }));
    }
    return Boolean(await Dialog.confirm({ title, content }));
  }

  async _confirmAndApplyLevelUp(actor) {
    const roadmap = buildLevelRoadmap(actor);
    if (!roadmap || !roadmap.canLevelUp) return;

    const targetLevel = roadmap.nextLevel;
    const inspection = inspectPlannedLevels(actor, [targetLevel], { effectiveCurrentLevel: roadmap.currentLevel });
    const lvlSummary = inspection.levels[0];
    if (!lvlSummary) return;

    const esc = foundry.utils.escapeHTML;
    const plannedRows = lvlSummary.plannedItems.map(item =>
      `<li><strong>${esc(item.label)}:</strong> ${esc(item.text)}</li>`
    );

    const warnBoxHtml = lvlSummary.unplannedItems.length > 0
      ? `
        <div class="pf2e-lp-prompt-warn-box">
          <strong>Note — Level ${targetLevel} is not fully filled out (${lvlSummary.filledCount}/${lvlSummary.expectedCount}):</strong>
          <ul>
            ${lvlSummary.unplannedItems.map(u => `<li>${esc(u)}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    const content = `
      <div class="pf2e-lp-confirm-body">
        <p>Apply guided level-up for <strong>${esc(actor.name)}</strong> from <strong>Level ${roadmap.currentLevel} → Level ${targetLevel}</strong>?</p>
        ${plannedRows.length > 0
          ? `<ul style="margin:6px 0 8px 0;padding-left:18px;line-height:1.45;">${plannedRows.join("")}</ul>`
          : `<p style="opacity:0.85;margin:6px 0;">No planned items are filled out for Level ${targetLevel} yet — only your character level will increase.</p>`
        }
        ${warnBoxHtml}
        <p style="font-size:0.86em;opacity:0.82;margin:0;">PF2e will run any native ChoiceSet dialogs automatically for newly granted class features or feats.</p>
      </div>
    `;

    const confirmed = await this._confirmDialog({
      title: `Apply Level Up — ${actor.name} (Lv ${roadmap.currentLevel} → ${targetLevel})`,
      content,
      yesLabel: `Level Up to Lv ${targetLevel}`
    });
    if (!confirmed) return;

    this._isApplyingLevelUp = true;
    this.render({ force: false });

    try {
      const res = await applyPlannedLevelUp(actor);
      if (res.ok) {
        const postReport = analyzeCharacter(actor);
        const remainingNote = postReport?.actionableMissingCount > 0
          ? ` | ${postReport.actionableMissingCount} checklist item(s) remaining`
          : " | Build 100% Complete!";
        const summaryStr = res.summary.length > 0 ? ` — ${res.summary.join(" | ")}` : "";
        ui.notifications?.info(`${actor.name} reached Level ${res.newLevel}!${summaryStr}${remainingNote}`);
        if (Array.isArray(res.reminders) && res.reminders.length > 0) {
          ui.notifications?.warn(`Level ${res.newLevel} Reminders: ${res.reminders.join(" · ")}`);
        }
        this._selectedLevel = res.newLevel < 20 ? res.newLevel + 1 : 20;
      }
    } finally {
      this._isApplyingLevelUp = false;
      if (this.rendered) this.render({ force: false });
    }
  }

  /* ----------------------------------------------------------------------- */
  /* DE-LEVEL / REVERT TO EARLIER LEVEL DIALOG & EXECUTION                   */
  /* ----------------------------------------------------------------------- */

  async _openRevertLevelDialog(actor, initialTargetLevel = null) {
    const currentLevel = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
    if (currentLevel <= 1) {
      ui.notifications?.info(`${actor.name} is already Level 1 and cannot be de-leveled further.`);
      return;
    }

    const cleanInitial = Math.max(1, Math.min(currentLevel - 1, Math.floor(Number(initialTargetLevel) || (currentLevel - 1))));
    const esc = foundry.utils.escapeHTML;
    const DialogV2 = foundry?.applications?.api?.DialogV2;

    if (!DialogV2) {
      const ok = await this._confirmDialog({
        title: `De-Level ${actor.name} (Lv ${currentLevel} → Lv ${cleanInitial})`,
        content: `<p>Save Level ${cleanInitial + 1 === currentLevel ? currentLevel : `${cleanInitial + 1}–${currentLevel}`} choices into the Build Plan and revert <strong>${esc(actor.name)}</strong> back to <strong>Level ${cleanInitial}</strong>?</p>`,
        yesLabel: `Revert to Lv ${cleanInitial}`
      });
      if (ok) {
        await this._executeRevertLevel(actor, {
          targetLevel: cleanInitial,
          saveToPlan: true,
          revertBoosts: true,
          revertFeats: true,
          revertSkills: true,
          revertSpells: true,
          revertFormulas: true,
          postChatReminder: true,
          manualSkillPicks: {}
        });
      }
      return;
    }

    const state = {
      targetLevel: cleanInitial,
      saveToPlan: true,
      revertBoosts: true,
      revertFeats: true,
      revertSkills: true,
      revertSpells: true,
      revertFormulas: true,
      postChatReminder: true,
      manualSkillPicks: {}
    };

    const targetOpts = [];
    for (let t = currentLevel - 1; t >= 1; t--) {
      const rangeStr = (t + 1 === currentLevel) ? `Lv ${currentLevel}` : `Lv ${t + 1}–${currentLevel}`;
      targetOpts.push(
        `<option value="${t}" ${t === cleanInitial ? "selected" : ""}>Level ${t} (saves &amp; reverts ${rangeStr})</option>`
      );
    }

    const content = `
      <div class="pf2e-lp-revert-body">
        <p class="pf2e-lp-revert-intro">
          Revert <strong>${esc(actor.name)}</strong> from <strong>Level ${currentLevel}</strong> back to an earlier level.
          Applied build choices from reverted levels can be saved directly into your <strong>Build Plan</strong> so you can tweak them and re-apply with 1 click later.
        </p>

        <div class="pf2e-lp-revert-target-row">
          <label for="pf2e-lp-revert-target-select">Revert Character Back To:</label>
          <select id="pf2e-lp-revert-target-select" class="pf2e-lp-revert-target">
            ${targetOpts.join("")}
          </select>
        </div>

        <div class="pf2e-lp-revert-preview">
          <div class="pf2e-lp-picker-empty">Inspecting live build choices...</div>
        </div>
      </div>
    `;

    let confirmedPayload = null;

    const dialog = new DialogV2({
      window: {
        title: `De-Level / Revert — ${actor.name}`,
        icon: "fa-solid fa-rotate-left",
        resizable: true
      },
      position: { width: 620 },
      classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog", "pf2e-lp-revert-dialog"],
      content,
      buttons: [
        {
          action: "confirm",
          label: `Revert to Lv ${cleanInitial}`,
          icon: "fa-solid fa-rotate-left",
          default: true,
          callback: () => {
            confirmedPayload = {
              ...state,
              manualSkillPicks: { ...state.manualSkillPicks }
            };
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-xmark"
        }
      ]
    });

    dialog.addEventListener("close", async () => {
      if (confirmedPayload) {
        const payload = confirmedPayload;
        confirmedPayload = null;
        await this._executeRevertLevel(actor, payload);
      }
    }, { once: true });

    dialog.addEventListener("render", async () => {
      const root = dialog.element?.querySelector?.(".pf2e-lp-revert-body");
      if (!root) return;

      const targetSelect = root.querySelector(".pf2e-lp-revert-target");
      const previewEl = root.querySelector(".pf2e-lp-revert-preview");
      const confirmBtn = dialog.element?.querySelector?.('button[data-action="confirm"]');

      let renderToken = 0;

      const updateConfirmLabel = () => {
        if (!confirmBtn) return;
        const iconEl = confirmBtn.querySelector("i");
        const iconHtml = iconEl ? iconEl.outerHTML : '<i class="fa-solid fa-rotate-left"></i>';
        confirmBtn.innerHTML = `${iconHtml} <span>Revert to Lv ${state.targetLevel}</span>`;
      };

      const refreshPreview = async () => {
        const myToken = ++renderToken;
        previewEl.innerHTML = `<div class="pf2e-lp-picker-empty">Inspecting Levels ${state.targetLevel + 1}–${currentLevel}...</div>`;
        updateConfirmLabel();

        const preview = await inspectLevelRevert(actor, state.targetLevel);
        if (myToken !== renderToken) return;

        if (!preview?.ok) {
          previewEl.innerHTML = `<div class="pf2e-lp-picker-empty">Unable to inspect revert range.</div>`;
          return;
        }

        const t = preview.totals;
        const rangeLabel = (state.targetLevel + 1 === currentLevel)
          ? `Lv ${currentLevel}`
          : `Lv ${state.targetLevel + 1}–${currentLevel}`;

        const optionRows = [];
        optionRows.push(`
          <label class="pf2e-lp-revert-opt is-highlight">
            <input type="checkbox" data-revert-opt="saveToPlan" ${state.saveToPlan ? "checked" : ""} />
            <span><strong>Save reverted choices into Build Plan (${esc(rangeLabel)})</strong> — keeps your build ready to edit or re-apply later</span>
          </label>
        `);

        if (!preview.manualAttributes && t.boostLevelsCount > 0) {
          optionRows.push(`
            <label class="pf2e-lp-revert-opt">
              <input type="checkbox" data-revert-opt="revertBoosts" ${state.revertBoosts ? "checked" : ""} />
              <span>Clear reverted Attribute Boosts (${t.boostPicksCount} boost${t.boostPicksCount === 1 ? "" : "s"} across ${t.boostLevelsCount} tier${t.boostLevelsCount === 1 ? "" : "s"})</span>
            </label>
          `);
        }

        if (t.featsCount > 0) {
          optionRows.push(`
            <label class="pf2e-lp-revert-opt">
              <input type="checkbox" data-revert-opt="revertFeats" ${state.revertFeats ? "checked" : ""} />
              <span>Remove reverted Slotted Feats (${t.featsCount})${t.customFeatsCount > 0 ? ` · includes ${t.customFeatsCount} custom snapshot` : ""}</span>
            </label>
          `);
        }

        if (t.trackedSkillsCount > 0 || t.overCapSkillsCount > 0 || t.untrackedSkillSlotsCount > 0 || t.intDropsCount > 0) {
          const skillNoteParts = [];
          if (t.trackedSkillsCount > 0) skillNoteParts.push(`${t.trackedSkillsCount} tracked/over-cap increase${t.trackedSkillsCount === 1 ? "" : "s"}`);
          if (t.untrackedSkillSlotsCount > 0) skillNoteParts.push(`${t.untrackedSkillSlotsCount} optional manual pick${t.untrackedSkillSlotsCount === 1 ? "" : "s"} below`);
          if (t.intDropsCount > 0) skillNoteParts.push(`${t.intDropsCount} INT drop`);
          optionRows.push(`
            <label class="pf2e-lp-revert-opt">
              <input type="checkbox" data-revert-opt="revertSkills" ${state.revertSkills ? "checked" : ""} />
              <span>Revert Skill Increases &amp; INT Bonus Skills/Languages${skillNoteParts.length > 0 ? ` (${skillNoteParts.join(" · ")})` : ""}</span>
            </label>
          `);
        }

        if (t.spellsCount > 0 || t.spellEntriesToSync.length > 0) {
          optionRows.push(`
            <label class="pf2e-lp-revert-opt">
              <input type="checkbox" data-revert-opt="revertSpells" ${state.revertSpells ? "checked" : ""} />
              <span>Sync Spell Slots to Lv ${state.targetLevel}${t.spellsCount > 0 ? ` &amp; remove ${t.spellsCount} over-rank/tracked spell${t.spellsCount === 1 ? "" : "s"}` : ""}</span>
            </label>
          `);
        }

        if (t.formulasCount > 0) {
          optionRows.push(`
            <label class="pf2e-lp-revert-opt">
              <input type="checkbox" data-revert-opt="revertFormulas" ${state.revertFormulas ? "checked" : ""} />
              <span>Remove ${t.formulasCount} tracked / Lv ${esc(rangeLabel)} Formula${t.formulasCount === 1 ? "" : "s"}</span>
            </label>
          `);
        }

        optionRows.push(`
          <label class="pf2e-lp-revert-opt">
            <input type="checkbox" data-revert-opt="postChatReminder" ${state.postChatReminder ? "checked" : ""} />
            <span>Post whispered Chat Reminder Card with exact counts of any manual removals (skills, languages, spells, formulas)</span>
          </label>
        `);

        const levelCardsHtml = preview.levels.map(info => {
          const rows = [];

          if (info.boosts.length > 0) {
            const intBadge = info.intModDrop
              ? ` <span class="pf2e-lp-revert-tag is-warn">INT ${esc(info.intModDrop.fromModStr)} &rarr; ${esc(info.intModDrop.toModStr)}</span>`
              : "";
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Boosts:</strong> ${esc(info.boostLabels)}${intBadge}</div>`);
          }

          if (info.trackedIntBonusSkillRevert || info.trackedIntBonusLanguageWillRemove) {
            const intParts = [];
            if (info.trackedIntBonusSkillRevert) intParts.push(`Skill: ${info.trackedIntBonusSkillRevert.transition}`);
            if (info.trackedIntBonusLanguageWillRemove) intParts.push(`Language: ${info.trackedIntBonusLanguage}`);
            rows.push(`<div class="pf2e-lp-revert-row"><strong>INT Bonus:</strong> ${esc(intParts.join(" · "))}</div>`);
          }

          if (info.trackedSkillIncrease) {
            const badge = info.trackedSkillIncrease.source === "over-cap"
              ? `<span class="pf2e-lp-revert-tag is-warn">Over Lv ${state.targetLevel} Cap</span>`
              : `<span class="pf2e-lp-revert-tag is-info">Tracked</span>`;
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Skill Increase:</strong> ${esc(info.trackedSkillIncrease.transition)} ${badge}</div>`);
          } else if (info.untrackedSkillIncrease && preview.untrackedSkillCandidates.length > 0) {
            const chosenManual = state.manualSkillPicks[info.level] || "";
            const candOpts = preview.untrackedSkillCandidates.map(c =>
              `<option value="${esc(c.slug)}" ${chosenManual === c.slug ? "selected" : ""}>${esc(c.optionLabel)}</option>`
            ).join("");
            rows.push(`
              <div class="pf2e-lp-revert-row pf2e-lp-revert-skill-row">
                <strong>Skill Increase (untracked):</strong>
                <select class="pf2e-lp-revert-skill-pick" data-level="${info.level}" title="Optionally pick which skill you raised at Level ${info.level} to revert & save">
                  <option value="">-- Leave skills untouched on sheet --</option>
                  ${candOpts}
                </select>
              </div>
            `);
          }

          if (info.overCapExtraAdjustments?.length > 0) {
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Over-Cap Skill Clamp:</strong> ${esc(info.overCapExtraAdjustments.map(x => x.transition).join(", "))}</div>`);
          }

          if (info.feats.length > 0) {
            const featList = info.feats.map(f =>
              `<span class="pf2e-lp-revert-chip"><em>${esc(f.groupLabel)}:</em> ${esc(f.name)}${f.isCustomSnapshot ? ' <span class="pf2e-lp-revert-tag is-warn">Custom</span>' : ""}</span>`
            ).join("");
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Feats:</strong> <div class="pf2e-lp-revert-chips">${featList}</div></div>`);
          }

          if (info.spells.length > 0) {
            const spList = info.spells.map(sp =>
              `<span class="pf2e-lp-revert-chip is-spell">${esc(sp.name)} <em>(${esc(sp.rankLabel)})</em></span>`
            ).join("");
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Spells:</strong> <div class="pf2e-lp-revert-chips">${spList}</div></div>`);
          }

          if (info.formulas.length > 0) {
            const fmList = info.formulas.map(fm =>
              `<span class="pf2e-lp-revert-chip is-formula">${esc(fm.name)} <em>(Lv ${fm.level})</em></span>`
            ).join("");
            rows.push(`<div class="pf2e-lp-revert-row"><strong>Formulas:</strong> <div class="pf2e-lp-revert-chips">${fmList}</div></div>`);
          }

          if (info.classFeaturesRemoved.length > 0 || info.dualClassFeaturesToDelete.length > 0) {
            const names = [
              ...info.classFeaturesRemoved,
              ...info.dualClassFeaturesToDelete.map(d => `${d.name} (Dual)`)
            ];
            const uniqueNames = Array.from(new Set(names));
            rows.push(`<div class="pf2e-lp-revert-row is-muted"><strong>Class Features (Auto-Removed):</strong> ${esc(uniqueNames.join(", "))}</div>`);
          }

          if (rows.length === 0) {
            rows.push(`<div class="pf2e-lp-revert-row is-muted">No slotted choices detected on live sheet for Level ${info.level}.</div>`);
          }

          return `
            <div class="pf2e-lp-revert-card">
              <div class="pf2e-lp-revert-card-head">
                <span class="pf2e-lp-revert-lvl">Level ${info.level}</span>
                <span class="pf2e-lp-revert-tag is-save" data-save-badge-lvl="${info.level}">${state.saveToPlan ? `Saves to Lv ${info.level} Plan` : "Revert Only (Not Saved)"}</span>
              </div>
              <div class="pf2e-lp-revert-card-body">
                ${rows.join("")}
              </div>
            </div>
          `;
        }).join("");

        const spellSyncHtml = t.spellEntriesToSync.length > 0
          ? `<div class="pf2e-lp-revert-sync-note"><i class="fa-solid fa-wand-sparkles"></i> Spellcasting slot counts will sync down to Level ${state.targetLevel} for: <strong>${esc(t.spellEntriesToSync.map(e => e.name).join(", "))}</strong>.</div>`
          : "";

        const remindersHtml = preview.reminders.length > 0
          ? `
            <div class="pf2e-lp-prompt-warn-box">
              <strong>Notes &amp; Manual Checks:</strong>
              <ul>
                ${preview.reminders.map(r => `<li>${esc(r)}</li>`).join("")}
              </ul>
            </div>
          `
          : "";

        previewEl.innerHTML = `
          <div class="pf2e-lp-revert-opts">${optionRows.join("")}</div>
          <div class="pf2e-lp-revert-cards">${levelCardsHtml}</div>
          ${spellSyncHtml}
          ${remindersHtml}
        `;

        previewEl.querySelectorAll("[data-revert-opt]").forEach(cb => {
          cb.addEventListener("change", (ev) => {
            const key = ev.target.dataset.revertOpt;
            if (key && key in state) {
              state[key] = Boolean(ev.target.checked);
              if (key === "saveToPlan") {
                previewEl.querySelectorAll("[data-save-badge-lvl]").forEach(badge => {
                  const lvl = badge.dataset.saveBadgeLvl;
                  badge.textContent = state.saveToPlan ? `Saves to Lv ${lvl} Plan` : "Revert Only (Not Saved)";
                  badge.classList.toggle("is-save", state.saveToPlan);
                  badge.classList.toggle("is-warn", !state.saveToPlan);
                });
              }
            }
          });
        });

        previewEl.querySelectorAll(".pf2e-lp-revert-skill-pick").forEach(sel => {
          sel.addEventListener("change", (ev) => {
            const lvl = Number(ev.target.dataset.level);
            const val = ev.target.value || "";
            if (val) state.manualSkillPicks[lvl] = val;
            else delete state.manualSkillPicks[lvl];
          });
        });
      };

      targetSelect?.addEventListener("change", async (ev) => {
        const nextTarget = Number(ev.target.value);
        if (Number.isFinite(nextTarget) && nextTarget >= 1 && nextTarget < currentLevel) {
          state.targetLevel = nextTarget;
          await refreshPreview();
        }
      });

      await refreshPreview();
    }, { once: true });

    dialog.render({ force: true });
  }

  async _executeRevertLevel(actor, payload) {
    if (!actor || !payload || this._isApplyingLevelUp) return;
    this._isApplyingLevelUp = true;
    if (this.rendered) this.render({ force: false });

    try {
      const res = await revertActorToLevel(actor, payload.targetLevel, {
        saveToPlan: payload.saveToPlan,
        revertBoosts: payload.revertBoosts,
        revertFeats: payload.revertFeats,
        revertSkills: payload.revertSkills,
        revertSpells: payload.revertSpells,
        revertFormulas: payload.revertFormulas,
        postChatReminder: payload.postChatReminder !== false,
        manualSkillPicks: payload.manualSkillPicks
      });

      if (res.ok) {
        const summaryStr = res.summary.length > 0 ? ` — ${res.summary.join(" | ")}` : "";
        const manualCount = Array.isArray(res.manualActions) ? res.manualActions.length : 0;
        const chatNote = manualCount > 0 && payload.postChatReminder !== false
          ? ` | Posted ${manualCount} manual cleanup reminder${manualCount === 1 ? "" : "s"} to Chat.`
          : "";
        ui.notifications?.info(`${actor.name} reverted from Level ${res.oldLevel} → Level ${res.newLevel}!${summaryStr}${chatNote}`);
        if (manualCount > 0 && payload.postChatReminder === false) {
          ui.notifications?.warn(`Level ${res.newLevel} Manual Cleanup: ${res.manualActions.map(a => a.title).join(" · ")}`);
        }
        // Focus the newly reverted next level so the saved plan is immediately visible & editable!
        this._selectedLevel = Math.min(20, res.newLevel + 1);
        this._viewMode = "focus";
      }
    } catch (err) {
      console.error("PF2e Awesome GM Utilities | Failed reverting character level:", err);
      ui.notifications?.error(`Failed to revert ${actor.name}: ${err?.message || err}`);
    } finally {
      this._isApplyingLevelUp = false;
      if (this.rendered) this.render({ force: false });
    }
  }

  _onClose(options) {
    this._unbindReactiveHooks();
    if (this._onKeyDownBound) {
      window.removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
    }
    super._onClose?.(options);
  }
}

/* ------------------------------------------------------------------------- */
/* DIRECT CHARACTER SHEET LEVEL-UP AUTO-PROMPT HOOK                          */
/* ------------------------------------------------------------------------- */

/**
 * Watches for direct level increases made on the Character Sheet (e.g. Lv 3 -> Lv 4)
 * when `enableLevelPlanner` is ON and prompts ONLY the user who raised the level to
 * apply any saved Level Planner choices (and alerts them if the level is incomplete).
 * Zero runtime work when `enableLevelPlanner` is OFF or actor has no saved plan.
 *
 * @param {(actor: Actor, focusLevel?: number) => void} onOpenLevelPlannerForActor
 */
export function registerSheetLevelUpPrompt(onOpenLevelPlannerForActor) {
  if (registerSheetLevelUpPrompt._registered) return;
  registerSheetLevelUpPrompt._registered = true;

  const pendingLevelIncreases = new Map(); // actorId -> { prevLevel, nextLevel, ts }
  const activePromptActorIds = new Set();

  Hooks.on("preUpdateActor", (actor, changed, options) => {
    if (!isLevelPlannerEnabled()) return;
    if (!actor || actor.type !== "character") return;
    if (options?.[MODULE_ID]?.fromLevelPlanner || isPlannerUpdatingActor(actor.id)) return;

    const rawNext = changed?.system?.details?.level?.value;
    if (rawNext === undefined) return;

    const prevLevel = Math.max(1, Number(actor.level ?? actor.system?.details?.level?.value ?? 1));
    const nextLevel = Math.min(20, Math.max(1, Number(rawNext)));
    if (!Number.isFinite(nextLevel) || nextLevel <= prevLevel) return;

    pendingLevelIncreases.set(actor.id, { prevLevel, nextLevel, ts: Date.now() });
  });

  Hooks.on("updateActor", (actor, changed, options, userId) => {
    if (!isLevelPlannerEnabled()) return;
    if (!actor || actor.type !== "character") return;
    if (userId !== game.user?.id) return;

    const rawNext = changed?.system?.details?.level?.value;
    if (rawNext === undefined) return;

    const pending = pendingLevelIncreases.get(actor.id);
    pendingLevelIncreases.delete(actor.id);

    if (options?.[MODULE_ID]?.fromLevelPlanner || isPlannerUpdatingActor(actor.id)) return;
    if (!pending || (Date.now() - pending.ts) > 15000) return;

    const prevLevel = pending.prevLevel;
    const newLevel = Math.min(20, Math.max(1, Number(rawNext)));
    if (newLevel <= prevLevel) return;

    // Only prompt if the user actually has saved build plan entries on this character
    if (!hasAnySavedLevelPlan(actor)) return;
    if (activePromptActorIds.has(actor.id)) return;
    activePromptActorIds.add(actor.id);

    // Wait briefly so PF2e native level-up grants & sheet re-render settle cleanly
    setTimeout(async () => {
      try {
        const targetLevels = [];
        for (let l = prevLevel + 1; l <= newLevel; l++) targetLevels.push(l);

        const inspection = inspectPlannedLevels(actor, targetLevels, { effectiveCurrentLevel: prevLevel });
        if (!inspection || inspection.levels.length === 0) return;

        const esc = foundry.utils.escapeHTML;
        const levelBlocks = inspection.levels.map(ls => {
          const heading = targetLevels.length > 1
            ? `<div style="font-weight:700;margin-top:6px;color:var(--pf2e-gm-text-cream);">Level ${ls.level}</div>`
            : "";

          const plannedList = ls.plannedItems.length > 0
            ? `<ul style="margin:4px 0 6px 0;padding-left:18px;line-height:1.45;">
                ${ls.plannedItems.map(item => `<li><strong>${esc(item.label)}:</strong> ${esc(item.text)}</li>`).join("")}
              </ul>`
            : "";

          let warnHtml = "";
          if (ls.unplannedItems.length > 0) {
            const warnHeading = ls.hasPlanned
              ? `Level ${ls.level} is only partially planned (${ls.filledCount}/${ls.expectedCount}). Still unplanned:`
              : `Level ${ls.level} has no planned choices filled out yet in your Level Planner:`;
            warnHtml = `
              <div class="pf2e-lp-prompt-warn-box">
                <strong>${esc(warnHeading)}</strong>
                <ul>
                  ${ls.unplannedItems.map(u => `<li>${esc(u)}</li>`).join("")}
                </ul>
              </div>
            `;
          }

          return `${heading}${plannedList}${warnHtml}`;
        });

        const rangeLabel = targetLevels.length === 1
          ? `Level ${newLevel}`
          : `Levels ${prevLevel + 1}–${newLevel}`;
        const hasAnythingToApply = inspection.hasPlannedChoicesInRange
          || inspection.levels.some(ls => ls.lvlData?.hasSpellMilestones);

        const content = `
          <div class="pf2e-lp-confirm-body">
            <p><strong>${esc(actor.name)}</strong> leveled up directly on the sheet (<strong>Lv ${prevLevel} → Lv ${newLevel}</strong>).${
              hasAnythingToApply
                ? ` Would you like to apply your saved Level Planner choices for <strong>${esc(rangeLabel)}</strong>?`
                : ` Your Level Planner has saved levels for this character, but <strong>${esc(rangeLabel)}</strong> isn't filled out yet.`
            }</p>
            ${levelBlocks.join("")}
            ${hasAnythingToApply ? `<p style="font-size:0.85em;opacity:0.82;margin:6px 0 0 0;">Already-filled slots or boosts on your live sheet will not be overwritten.</p>` : ""}
          </div>
        `;

        const DialogV2 = foundry?.applications?.api?.DialogV2;
        let choice = "skip";

        if (DialogV2?.wait) {
          const buttons = [];
          if (hasAnythingToApply) {
            buttons.push({
              action: "apply",
              label: `Apply ${rangeLabel} Plan`,
              icon: "fa-solid fa-angles-up",
              default: true
            });
          }
          buttons.push({
            action: "open",
            label: "Open Level Planner",
            icon: "fa-solid fa-stairs",
            default: !hasAnythingToApply
          });
          buttons.push({
            action: "skip",
            label: "Skip",
            icon: "fa-solid fa-xmark"
          });

          choice = await DialogV2.wait({
            window: {
              title: `Level Planner — ${actor.name} (${rangeLabel})`,
              icon: "fa-solid fa-stairs"
            },
            classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog"],
            position: { width: 520 },
            content,
            buttons,
            rejectClose: false
          });
        } else if (hasAnythingToApply) {
          const ok = await Dialog.confirm({
            title: `Level Planner — ${actor.name} (${rangeLabel})`,
            content
          });
          choice = ok ? "apply" : "skip";
        }

        if (choice === "apply") {
          const res = await applyPlannedLevelChoices(actor, targetLevels, {
            updateActorLevel: false,
            effectiveCurrentLevel: prevLevel
          });
          if (res.ok) {
            const postReport = analyzeCharacter(actor);
            const remainingNote = postReport?.actionableMissingCount > 0
              ? ` | ${postReport.actionableMissingCount} checklist item(s) remaining`
              : " | Build 100% Complete!";
            const summaryStr = res.summary.length > 0 ? ` — ${res.summary.join(" | ")}` : "";
            ui.notifications?.info(`Applied Level Planner choices for ${actor.name} (${rangeLabel})!${summaryStr}${remainingNote}`);
            if (Array.isArray(res.reminders) && res.reminders.length > 0) {
              ui.notifications?.warn(`${rangeLabel} Reminders: ${res.reminders.join(" · ")}`);
            }
          }
        } else if (choice === "open") {
          onOpenLevelPlannerForActor?.(actor, newLevel);
        }
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Sheet level-up auto-prompt failed:", err);
      } finally {
        activePromptActorIds.delete(actor.id);
      }
    }, 300);
  });
}
