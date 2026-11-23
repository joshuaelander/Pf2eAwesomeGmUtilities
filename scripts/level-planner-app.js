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
  applyPlannedLevelUp,
  buildLevelRoadmap,
  clearActorLevelPlan,
  computeMatchingArchetypeFeatUuids,
  getLightweightFeatIndex,
  getLightweightSpellIndex,
  isLevelPlannerEnabled,
  openNativeBrowserForFeatSlot,
  openNativeBrowserForSpells,
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
  if (!uuid) return;
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
            hasSkillIncrease: l.hasSkillIncrease,
            hasSpellMilestones: l.hasSpellMilestones,
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
          canStepPrev: rawFocused.level > 1,
          canStepNext: rawFocused.level < 20,
          prevLevel: Math.max(1, rawFocused.level - 1),
          nextStepLevel: Math.min(20, rawFocused.level + 1),
          showSpellsPanel: Boolean(rawFocused.hasSpellMilestones || rawFocused.hasPlannedSpells || (rawFocused.isFuture && hasAnySpellcasting)),
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
          plannedSpellsCount: l.plannedSpells.length
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

    // 4. Skill Increase Dropdown
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

    // 5. Native Drag & Drop on Future Feat Slots
    container.querySelectorAll("[data-lp-drop-slot]").forEach(zone => {
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
        await this._handleFeatDrop(e, zone);
      });
    });

    // 6. Native Drag & Drop on Future Spell Planning Dropzone
    container.querySelectorAll("[data-lp-drop-spell]").forEach(zone => {
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
        await this._handleSpellDrop(e, zone);
      });
    });
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
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          if (entry.feats && slotKey) delete entry.feats[slotKey];
        });
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

      case "clear-plan": {
        if (!actor) return;
        const confirmed = await this._confirmDialog({
          title: `Clear Build Plan — ${actor.name}`,
          content: `<p>Clear all planned future attribute boosts, skill increases, feats, and spells for <strong>${foundry.utils.escapeHTML(actor.name)}</strong>?</p><p style="opacity:0.8;font-size:0.9em;">This only clears future plan notes and does not change anything already on the character sheet.</p>`
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

    const snapshot = {
      uuid: doc.uuid,
      name: doc.name,
      img: doc.img || "systems/pf2e/icons/default-icons/feat.svg",
      level: Number(doc.system?.level?.value ?? 0),
      category: doc.system?.category || "",
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
    const docTrads = Array.isArray(doc.system?.traits?.traditions) ? doc.system.traits.traditions : [];
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

      const searchInput = root.querySelector(".pf2e-lp-picker-search");
      const tradSelect = root.querySelector(".pf2e-lp-picker-trad");
      const rankSelect = root.querySelector(".pf2e-lp-picker-rank");
      const browserBtn = root.querySelector(".pf2e-lp-picker-browser-btn");
      const statusEl = root.querySelector(".pf2e-lp-picker-status");
      const listEl = root.querySelector(".pf2e-lp-picker-list");

      browserBtn?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openNativeBrowserForSpells({
          tradition: tradSelect?.value || tradition,
          maxRank,
          unlockedNewRank
        });
      });

      const allSpells = await getLightweightSpellIndex();
      const addedUuids = new Set();

      const renderList = () => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const trad = tradSelect?.value || "";
        const rankFilter = rankSelect?.value || "upto";

        const matched = [];
        for (const sp of allSpells) {
          // Skip focus spells without traditions unless unfiltered
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
          listEl.innerHTML = `<div class="pf2e-lp-picker-empty">No spells match the current filter.</div>`;
          return;
        }

        listEl.innerHTML = capped.map((sp, idx) => {
          const isAdded = addedUuids.has(sp.uuid);
          const tradText = sp.traditions.map(capitalize).join(", ") || "Focus / Special";
          return `
            <div class="pf2e-lp-picker-row">
              <img src="${esc(sp.img)}" alt="" class="pf2e-lp-picker-img" />
              <div class="pf2e-lp-picker-info">
                <div class="pf2e-lp-picker-name-line">
                  <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Open full spell sheet">${esc(sp.name)}</a>
                  <span class="pf2e-lp-picker-lvl">${sp.isCantrip ? "Cantrip" : `Rank ${sp.rank}`}</span>
                  ${sp.rarity && sp.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(sp.rarity)}">${esc(capitalize(sp.rarity))}</span>` : ""}
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
    const lvlData = roadmap.levels.find(l => l.level === targetLevel);
    if (!lvlData) return;

    const esc = foundry.utils.escapeHTML;
    const rows = [];

    if (lvlData.hasClassFeatures) {
      rows.push(`<li><strong>Class Features (Auto-Granted):</strong> ${esc(lvlData.classFeatures.map(f => f.name).join(", "))}</li>`);
    }

    if (lvlData.hasBoosts) {
      const sel = lvlData.boostInfo?.selectedLabels;
      rows.push(sel
        ? `<li><strong>Attribute Boosts:</strong> ${esc(sel)}</li>`
        : `<li style="color:#fbbf24;"><strong>Attribute Boosts:</strong> None planned yet (${lvlData.boostInfo?.expected} available — you can pick them on the sheet afterward)</li>`
      );
    }

    if (lvlData.hasSkillIncrease) {
      const sk = lvlData.skillIncreaseInfo?.chosenTransition;
      rows.push(sk
        ? `<li><strong>Skill Increase:</strong> ${esc(sk)}</li>`
        : `<li style="color:#fbbf24;"><strong>Skill Increase:</strong> Not selected yet (you can raise a skill on the sheet afterward)</li>`
      );
    }

    for (const slot of lvlData.featSlots) {
      if (slot.filled && slot.feat) {
        rows.push(`<li><strong>${esc(slot.groupLabel)}:</strong> ${esc(slot.feat.name)}</li>`);
      } else {
        rows.push(`<li style="color:#fbbf24;"><strong>${esc(slot.groupLabel)}:</strong> <em>Unplanned (slot will remain open on your sheet)</em></li>`);
      }
    }

    if (lvlData.hasSpellMilestones) {
      const mText = lvlData.spellMilestones.map(m => `${m.title} (${m.deltaText})`).join("; ");
      rows.push(`<li><strong>Spellcasting Slots Sync:</strong> ${esc(mText)}</li>`);
    }

    if (lvlData.hasPlannedSpells) {
      rows.push(`<li><strong>Planned Spells to Add:</strong> ${esc(lvlData.plannedSpells.map(s => s.name).join(", "))}</li>`);
    }

    const content = `
      <div class="pf2e-lp-confirm-body">
        <p>Apply guided level-up for <strong>${esc(actor.name)}</strong> from <strong>Level ${roadmap.currentLevel} → Level ${targetLevel}</strong>?</p>
        <ul style="margin:6px 0 8px 0;padding-left:18px;line-height:1.45;">
          ${rows.join("")}
        </ul>
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
        this._selectedLevel = res.newLevel < 20 ? res.newLevel + 1 : 20;
      }
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
