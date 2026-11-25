/**
 * PF2e Awesome GM Utilities - Character Completeness Checker UI & Sheet Integration
 *
 * Provides:
 *  1. `CharacterCheckerApp` (ApplicationV2): Full Party & Character Completeness Dashboard
 *     for GMs and players (players only see characters they own).
 *  2. `registerCharacterSheetCheckerIntegration`: Native parchment-styled inline guides on
 *     PF2e `CharacterSheetPF2e` tabs (Character, Skills, Spellcasting, Feats) including
 *     1-click Spellcasting Entry creation & slot sync for Primary Class, Dual Class, and
 *     Multiclass / Free Archetype spellcasting feats.
 */

import { MODULE_ID } from "./constants.js";
import {
  ABILITY_LABELS,
  CASTING_TYPE_LABELS,
  TRADITION_LABELS,
  addSingleSpellToEntry,
  analyzeCharacter,
  createOrSyncAllSpellcastingEntries,
  createSpellcastingEntry,
  postChecklistToChat,
  syncSpellcastingEntrySlots
} from "./character-checker-engine.js";
import { isLevelPlannerEnabled } from "./level-planner-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------------- */
/* HELPERS                                                                   */
/* ------------------------------------------------------------------------- */

function isSheetGuidesEnabled() {
  try {
    return Boolean(game.settings.get(MODULE_ID, "showCharacterSheetGuides"));
  } catch {
    return true;
  }
}

function canAutoModifySpellcasting(actor) {
  if (!actor) return false;
  if (game.user?.isGM) return true;
  if (!actor.isOwner) return false;
  try {
    return Boolean(game.settings.get(MODULE_ID, "allowPlayerAutoSpellcasting"));
  } catch {
    return true;
  }
}

function getTraditionOptions(selected = "") {
  return Object.entries(TRADITION_LABELS).map(([value, label]) => ({
    value,
    label,
    selected: selected === value
  }));
}

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

  // GM view: Party members first, then player-owned characters, optionally all world characters
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

/* ------------------------------------------------------------------------- */
/* 1. CHARACTER COMPLETENESS CHECKER DASHBOARD (ApplicationV2)               */
/* ------------------------------------------------------------------------- */

export class CharacterCheckerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._selectedActorId = options.actorId || null;
    this._showAllWorldPCs = false;
    this._onOpenLevelPlanner = typeof options.onOpenLevelPlanner === "function" ? options.onOpenLevelPlanner : null;
    this._hookIds = [];
    this._refreshTimer = null;
    this._onKeyDownBound = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-character-checker",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-cc-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.CharacterChecker.Title",
      icon: "fa-solid fa-clipboard-check",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 940,
      height: 680
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/character-checker.hbs`
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
      this.render({ force: true });
    }
  }

  openForActor(actorOrId) {
    const id = typeof actorOrId === "string" ? actorOrId : actorOrId?.id;
    if (id) {
      this._selectedActorId = id;
      const actor = game.actors?.get(id);
      if (actor && game.user?.isGM) {
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

    // Ensure selected actor is valid
    if (!this._selectedActorId || !actors.some(a => a.id === this._selectedActorId)) {
      this._selectedActorId = actors[0]?.id || null;
    }

    const roster = [];
    let selectedReport = null;

    for (const actor of actors) {
      const report = analyzeCharacter(actor);
      if (!report) continue;
      const isSelected = actor.id === this._selectedActorId;
      roster.push({
        id: actor.id,
        name: report.actorName,
        img: report.actorImg,
        level: report.level,
        classDisplay: report.classDisplay,
        status: report.status,
        statusLabel: report.statusLabel,
        isSelected
      });
      if (isSelected) selectedReport = report;
    }

    const selectedActor = this._selectedActorId ? game.actors?.get(this._selectedActorId) : null;
    const canModifySpells = canAutoModifySpellcasting(selectedActor);

    // Enrich spellcasting rows with template-friendly flags & dropdown options
    if (selectedReport) {
      selectedReport.spellcasting.sources = selectedReport.spellcasting.sources.map(src => {
        const isFocus = src.castingType === "focus";
        const autoCount = Number(src.missingAutoSpellsCount || 0);
        const needsFontPrep = Boolean(src.needsFontPrepare);
        const canSyncEntry = Boolean(src.entryExists && (src.slotsOutdated || autoCount > 0 || needsFontPrep));
        let syncBtnLabel = `Sync Slots to Level ${selectedReport.level}`;
        if (src.slotsOutdated && needsFontPrep) {
          syncBtnLabel = `Sync & Prepare ${src.divineFontCount}× ${src.divineFontSpellName}`;
        } else if (src.slotsOutdated && autoCount > 0) {
          syncBtnLabel = `Sync Slots & Add ${autoCount} Spell${autoCount === 1 ? "" : "s"}`;
        } else if (!src.slotsOutdated && needsFontPrep) {
          syncBtnLabel = `Prepare ${src.divineFontCount}× ${src.divineFontSpellName}`;
        } else if (!src.slotsOutdated && autoCount > 0) {
          syncBtnLabel = isFocus
            ? `Add ${autoCount} Focus Spell${autoCount === 1 ? "" : "s"}`
            : `Add ${autoCount} Auto Spell${autoCount === 1 ? "" : "s"}`;
        }
        const createBtnLabel = src.isDivineFont && src.divineFontChoice
          ? `Add Entry & Prepare ${src.divineFontCount}× ${src.divineFontSpellName}`
          : (autoCount > 0
            ? `Add Entry + ${autoCount} Spell${autoCount === 1 ? "" : "s"}`
            : "Add Spellcasting Entry");

        const missingAutoSpellsDisplay = (src.missingAutoSpells || []).map(sp => ({
          ...sp,
          rankTag: sp.isFocus
            ? "Focus"
            : (sp.isCantrip ? "Cantrip" : `Rank ${sp.rank || 1}`)
        }));

        return {
          ...src,
          castingTypeLabel: src.flexible ? "Flexible" : (CASTING_TYPE_LABELS[src.castingType] || src.castingType),
          traditionLabel: TRADITION_LABELS[src.tradition] || "Choose Tradition",
          abilityLabel: ABILITY_LABELS[src.ability] || String(src.ability || "").toUpperCase(),
          isFocus,
          isMissing: !src.entryExists,
          isOutdated: Boolean(src.entryExists && src.slotsOutdated),
          canSyncEntry,
          syncBtnLabel,
          createBtnLabel,
          missingAutoSpellsDisplay,
          hasCantrips: src.cantrips > 0,
          traditionOptions: getTraditionOptions(src.tradition || "arcane")
        };
      });

      selectedReport.skills.isTrainedMissing = selectedReport.skills.trainedStatus === "missing";
      selectedReport.skills.isIncreasesMissing = selectedReport.skills.increasesStatus === "missing";
      selectedReport.skills.isLoreMissing = selectedReport.skills.missingLoreCount > 0;
      selectedReport.skills.knownLoresText = selectedReport.skills.knownLoreNames.join(", ");
      selectedReport.skills.missingBgLoresText = selectedReport.skills.missingBgLores.join(", ");
      selectedReport.skills.intModSigned = selectedReport.skills.intMod >= 0
        ? `+${selectedReport.skills.intMod}`
        : String(selectedReport.skills.intMod);

      selectedReport.hasIssues = selectedReport.allIssues.length > 0;
      selectedReport.hasVariantBadges = selectedReport.activeVariantBadges.length > 0;
      selectedReport.hasReadinessNotes = selectedReport.readinessNotes.length > 0;
      selectedReport.canSyncDualClass = Boolean(
        selectedReport.feats.hasMissingDualFeatures
        && typeof game.pf2eAwesomeVariantRules?.syncSecondaryClassFeatures === "function"
        && (isGM || selectedActor?.isOwner)
      );
      selectedReport.canModifySpells = canModifySpells;
      selectedReport.hasActionableSpells = Boolean(canModifySpells && selectedReport.spellcasting.needsActionCount > 0);
    }

    return {
      isGM,
      showAllWorldPCs: this._showAllWorldPCs,
      levelPlannerEnabled: Boolean(isLevelPlannerEnabled() && this._onOpenLevelPlanner),
      roster,
      report: selectedReport,
      hasReport: Boolean(selectedReport)
    };
  }

  _scheduleRefresh() {
    if (!this.rendered) return;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (this.rendered) this.render({ force: false });
    }, 150);
  }

  _bindReactiveHooks() {
    if (this._hookIds.length > 0) return;
    const onActorChange = (actor) => {
      if (actor?.type === "character") this._scheduleRefresh();
    };
    const onItemChange = (item) => {
      if (item?.parent?.type === "character") this._scheduleRefresh();
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

    // Scope ALL DOM listeners strictly inside inner container so window header buttons work natively
    const container = root.querySelector(".pf2e-cc-container");
    if (!container) return;

    if (!this._onKeyDownBound) {
      this._onKeyDownBound = (e) => {
        if (e.key === "Escape" && this.rendered) {
          e.preventDefault();
          this.close();
        }
      };
      window.addEventListener("keydown", this._onKeyDownBound);
    }

    container.querySelectorAll("[data-cc-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._handleAction(btn.dataset.ccAction, btn);
      });
    });

    const showAllCb = container.querySelector("#pf2e-cc-show-all");
    if (showAllCb) {
      showAllCb.addEventListener("change", (e) => {
        this._showAllWorldPCs = Boolean(e.target.checked);
        this.render({ force: false });
      });
    }
  }

  async _handleAction(action, btn) {
    const actor = this._selectedActorId ? game.actors?.get(this._selectedActorId) : null;

    switch (action) {
      case "select-actor": {
        const actorId = btn.dataset.actorId;
        if (actorId && actorId !== this._selectedActorId) {
          this._selectedActorId = actorId;
          this.render({ force: false });
        }
        break;
      }

      case "refresh":
        this.render({ force: false });
        break;

      case "open-sheet":
        if (actor?.sheet) actor.sheet.render({ force: true });
        break;

      case "open-level-planner":
        if (actor && this._onOpenLevelPlanner) {
          this._onOpenLevelPlanner(actor);
        }
        break;

      case "whisper-player":
        if (!actor || !game.user?.isGM) return;
        await postChecklistToChat(actor, { whisperToOwners: true });
        ui.notifications?.info(`Sent character completeness checklist whisper for ${actor.name}.`);
        break;

      case "post-chat":
        if (!actor) return;
        await postChecklistToChat(actor, { whisperToOwners: false });
        ui.notifications?.info(`Posted character completeness checklist for ${actor.name} to chat.`);
        break;

      case "sync-dual-class": {
        if (!actor || typeof game.pf2eAwesomeVariantRules?.syncSecondaryClassFeatures !== "function") return;
        await game.pf2eAwesomeVariantRules.syncSecondaryClassFeatures(actor, { refreshSource: true, notify: true });
        actor.reset();
        this.render({ force: false });
        break;
      }

      case "create-spell-entry": {
        if (!actor || !canAutoModifySpellcasting(actor)) {
          ui.notifications?.warn("You do not have permission to auto-create spellcasting entries on this character.");
          return;
        }
        const sourceKey = btn.dataset.sourceKey;
        const report = analyzeCharacter(actor);
        const spec = report?.spellcasting?.sources?.find(s => s.key === sourceKey);
        if (!spec) return;

        const card = btn.closest(".pf2e-cc-spell-card");
        const tradSelect = card?.querySelector(".pf2e-cc-trad-select");
        const resOut = {};
        const overrides = {
          ...(tradSelect?.value ? { tradition: tradSelect.value } : {}),
          resultOut: resOut
        };

        const created = await createSpellcastingEntry(actor, spec, overrides);
        if (created) {
          const extras = [];
          if (resOut.addedSpells?.length) extras.push(`auto-added: ${resOut.addedSpells.join(", ")}`);
          if (resOut.preparedFont) extras.push(`prepared ${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
          const spellNote = extras.length ? ` (${extras.join("; ")})` : "";
          ui.notifications?.info(`Created spellcasting entry "${created.name}" on ${actor.name}${spellNote}!`);
          this.render({ force: false });
        }
        break;
      }

      case "sync-spell-entry": {
        if (!actor || !canAutoModifySpellcasting(actor)) return;
        const sourceKey = btn.dataset.sourceKey;
        const entryId = btn.dataset.entryId;
        const report = analyzeCharacter(actor);
        const spec = report?.spellcasting?.sources?.find(s => s.key === sourceKey);
        if (!spec || !entryId) return;

        const resOut = {};
        const ok = await syncSpellcastingEntrySlots(actor, entryId, spec, { includeAutoSpells: true, resultOut: resOut });
        if (ok) {
          const parts = [];
          if (resOut.slotsChanged) parts.push(`synced slots to Level ${report.level}`);
          if (resOut.addedSpells?.length) parts.push(`added ${resOut.addedSpells.join(", ")}`);
          if (resOut.preparedFont) parts.push(`prepared ${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
          ui.notifications?.info(`${spec.matchedEntryName || spec.title}: ${parts.join(" & ") || "up to date"}!`);
          this.render({ force: false });
        } else {
          ui.notifications?.info(`"${spec.matchedEntryName || spec.title}" is already up to date.`);
        }
        break;
      }

      case "add-choice-spell": {
        if (!actor || !canAutoModifySpellcasting(actor)) return;
        const entryId = btn.dataset.entryId;
        const uuid = btn.dataset.uuid;
        const rank = btn.dataset.rank ? Number(btn.dataset.rank) : null;
        if (!entryId || !uuid) return;

        const created = await addSingleSpellToEntry(actor, entryId, uuid, { rank });
        if (created) {
          ui.notifications?.info(`Added "${created.name}" to ${actor.name}'s spellcasting entry!`);
          this.render({ force: false });
        } else {
          ui.notifications?.info("That spell is already in this spellcasting entry.");
        }
        break;
      }

      case "sync-all-spells": {
        if (!actor || !canAutoModifySpellcasting(actor)) return;
        const res = await createOrSyncAllSpellcastingEntries(actor);
        const parts = [];
        if (res.created.length > 0) parts.push(`Created: ${res.created.join(", ")}`);
        if (res.synced.length > 0) parts.push(`Synced slots: ${res.synced.join(", ")}`);
        if (res.addedSpells?.length > 0) parts.push(`Auto-added spells: ${res.addedSpells.join(", ")}`);
        if (res.preparedFonts?.length > 0) parts.push(`Prepared Font: ${res.preparedFonts.join(", ")}`);
        if (res.skippedNeedsTradition.length > 0) {
          parts.push(`Choose tradition first for: ${res.skippedNeedsTradition.join(", ")}`);
        }
        if (parts.length > 0) {
          ui.notifications?.info(`Spellcasting Sync (${actor.name}) | ${parts.join(" | ")}`);
        } else {
          ui.notifications?.info(`All spellcasting entries on ${actor.name} are already up to date.`);
        }
        this.render({ force: false });
        break;
      }
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
/* 2. CHARACTER SHEET INLINE GUIDES (PF2e Parchment Aesthetic)               */
/* ------------------------------------------------------------------------- */

/** Tracks which character sheets currently have collapsible inline tab guides expanded */
const expandedSkillsGuideActors = new Set();
const expandedSpellGuideActors = new Set();
const expandedFormulaGuideActors = new Set();

/**
 * Registers the `renderCharacterSheetPF2e` hook that injects helpful, unified
 * completeness guides directly onto the Character, Skills, Spellcasting, Feats,
 * and Crafting tabs, plus an optional `Planner` button when `enableLevelPlanner` is ON.
 *
 * @param {(actor: Actor) => void} onOpenCheckerForActor
 * @param {(actor: Actor) => void} [onOpenLevelPlannerForActor]
 */
export function registerCharacterSheetCheckerIntegration(onOpenCheckerForActor, onOpenLevelPlannerForActor = null) {
  Hooks.on("renderCharacterSheetPF2e", (sheet, html) => {
    const guidesEnabled = isSheetGuidesEnabled();
    const plannerEnabled = isLevelPlannerEnabled() && typeof onOpenLevelPlannerForActor === "function";
    if (!guidesEnabled && !plannerEnabled) return;

    const actor = sheet?.actor ?? sheet?.document;
    if (!actor || actor.type !== "character") return;

    // Only show build guides / planner to GM or character owners (not observer/limited party members)
    if (!game.user?.isGM && !actor.isOwner) return;

    const root = html instanceof HTMLElement ? html : (html?.[0] ?? sheet?.element);
    if (!root || typeof root.querySelector !== "function") return;

    const plannerBtnHtml = plannerEnabled
      ? `<button type="button" class="pf2e-cc-sheet-btn is-primary" data-lp-open="1" title="Open Level 1-20 Build Planner & Guided Level-Up">Planner</button>`
      : "";
    const checklistBtnHtml = `<button type="button" class="pf2e-cc-sheet-btn" data-cc-open="1" title="Open Full Character Completeness Checklist">Checklist</button>`;

    const bindCommonStripButtons = (el) => {
      el.querySelector('[data-lp-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenLevelPlannerForActor?.(actor);
      });
      el.querySelector('[data-cc-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenCheckerForActor?.(actor);
      });
    };

    const bindCollapsibleStrip = (panel, expandedSet) => {
      const toggle = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const nowCollapsed = panel.classList.toggle("is-collapsed");
        if (nowCollapsed) expandedSet.delete(actor.id);
        else expandedSet.add(actor.id);
        const toggleBtn = panel.querySelector('[data-cc-toggle-label="1"]');
        if (toggleBtn) toggleBtn.textContent = nowCollapsed ? "Details" : "Hide";
      };
      panel.querySelectorAll('[data-cc-toggle-details="1"]').forEach(el => {
        el.addEventListener("click", toggle);
      });
    };

    // Lightweight fast path: if Completeness Guides are OFF but Level Planner is ON,
    // inject ONLY a minimal 1-line Planner strip on the Character tab (zero analysis).
    if (!guidesEnabled) {
      const charTabOnly = root.querySelector('.tab[data-tab="character"]');
      if (charTabOnly && !charTabOnly.querySelector(".pf2e-cc-sheet-char-bar")) {
        const bar = document.createElement("div");
        bar.className = "pf2e-cc-sheet-banner pf2e-cc-sheet-char-bar status-complete";
        bar.innerHTML = `
          <div class="pf2e-cc-sheet-banner-main">
            <div class="pf2e-cc-sheet-banner-text"><strong>Build Planner:</strong> Plan Levels 1&ndash;20 and apply guided level-ups.</div>
          </div>
          <div class="pf2e-cc-sheet-header-btns">
            ${plannerBtnHtml}
          </div>
        `;
        bindCommonStripButtons(bar);
        charTabOnly.prepend(bar);
      }
      return;
    }

    const report = analyzeCharacter(actor);
    if (!report) return;

    const esc = foundry.utils.escapeHTML;
    const isEditable = (sheet.isEditable ?? actor.isOwner) && canAutoModifySpellcasting(actor);

    // ---------------------------------------------------------------------
    // A. Character Tab: Compact Build Completeness Strip
    // ---------------------------------------------------------------------
    const charTab = root.querySelector('.tab[data-tab="character"]');
    if (charTab && !charTab.querySelector(".pf2e-cc-sheet-char-bar")) {
      const bar = document.createElement("div");
      const charStatusCls = report.actionableMissingCount > 0 ? "critical" : report.status;
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-char-bar status-${charStatusCls}`;

      const topMissing = report.allIssues
        .filter(i => i.severity === "critical" || i.severity === "warning")
        .slice(0, 3)
        .map(i => i.title)
        .join(" · ");

      const summaryHtml = report.actionableMissingCount > 0
        ? `<strong>Build Check (${report.completenessPct}%):</strong> <span class="pf2e-cc-sheet-missing-list">${esc(topMissing)}${report.actionableMissingCount > 3 ? ` (+${report.actionableMissingCount - 3} more)` : ""}</span>`
        : `<strong>Build Check (100%):</strong> <span class="pf2e-cc-sheet-ok-text">Complete for Lv ${report.level}</span>`;

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-banner-main">
          <div class="pf2e-cc-sheet-banner-text">${summaryHtml}</div>
        </div>
        <div class="pf2e-cc-sheet-header-btns">
          ${plannerBtnHtml}
          ${checklistBtnHtml}
        </div>
      `;

      bindCommonStripButtons(bar);
      charTab.prepend(bar);
    }

    // Helper: compact consecutive level runs ("1, 2, 3, 4, 5" -> "1–5") for tidy inline strips
    const formatCompactLevels = (levelsArr, fallbackText = "") => {
      if (!Array.isArray(levelsArr) || levelsArr.length === 0) return fallbackText;
      if (levelsArr.some(v => !Number.isFinite(Number(v)))) return fallbackText;
      const sorted = [...new Set(levelsArr.map(Number))].sort((a, b) => a - b);
      if (sorted.length === 0) return fallbackText;
      const ranges = [];
      let start = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) {
          prev = sorted[i];
        } else {
          ranges.push(prev - start >= 2 ? `${start}–${prev}` : (prev > start ? `${start}, ${prev}` : `${start}`));
          start = prev = sorted[i];
        }
      }
      ranges.push(prev - start >= 2 ? `${start}–${prev}` : (prev > start ? `${start}, ${prev}` : `${start}`));
      return ranges.join(", ");
    };

    // ---------------------------------------------------------------------
    // B. Skills / Proficiencies Tab: Collapsible Unified Skills Check Strip
    // ---------------------------------------------------------------------
    const skillsTab = root.querySelector('.tab[data-tab="proficiencies"], .tab[data-tab="skills"]');
    if (skillsTab && !skillsTab.querySelector(".pf2e-cc-sheet-skills-bar")) {
      const sk = report.skills;
      const lang = report.languages;
      const isExpanded = expandedSkillsGuideActors.has(actor.id);

      const hasMissing = sk.missingTrained > 0 || sk.missingIncreases > 0 || sk.missingLoreCount > 0 || sk.hasMissingBgLore || lang.missing > 0;
      const hasSoftWarn = sk.overCapSkills.length > 0 || sk.excessIncreases > 0;
      const statusCls = hasMissing ? "critical" : (hasSoftWarn ? "warning" : "complete");

      const bar = document.createElement("div");
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-collapsible pf2e-cc-sheet-skills-bar status-${statusCls} ${isExpanded ? "" : "is-collapsed"}`;

      const missingParts = [];
      const okParts = [];

      if (sk.missingTrained > 0) {
        missingParts.push(`Missing ${sk.missingTrained} Trained (${sk.currentTrained}/${sk.expectedTrained})`);
      } else {
        okParts.push(`Trained ${sk.currentTrained}/${sk.expectedTrained}`);
      }

      if (sk.missingIncreases > 0) {
        missingParts.push(`Missing ${sk.missingIncreases} Increase${sk.missingIncreases === 1 ? "" : "s"} (${sk.spentIncreases}/${sk.expectedIncreases})`);
      } else {
        okParts.push(`Increases ${sk.spentIncreases}/${sk.expectedIncreases}`);
      }

      if (sk.missingBgLores.length > 0) {
        missingParts.push(`Missing BG Lore: ${sk.missingBgLores.join(", ")}`);
      } else if (sk.hasMissingBgLore) {
        missingParts.push(`Missing BG Lore (${sk.loreCount}/${sk.bgLoreCount})`);
      } else if (sk.missingLoreCount > 0) {
        missingParts.push(`Missing ${sk.missingLoreCount} Lore (${sk.loreCount}/${sk.expectedMinLores})`);
      } else if (sk.expectedMinLores > 0 || sk.loreCount > 0) {
        okParts.push(`Lore ${sk.loreCount}${sk.expectedMinLores > 0 ? `/${sk.expectedMinLores}` : ""}`);
      }

      if (lang.expected > 0) {
        if (lang.missing > 0) {
          missingParts.push(`Missing ${lang.missing} Language${lang.missing === 1 ? "" : "s"} (${lang.current}/${lang.expected})`);
        } else {
          okParts.push(`Languages ${lang.current}/${lang.expected}`);
        }
      }

      const warnParts = [];
      if (sk.overCapSkills.length > 0) {
        warnParts.push(`Above Lv cap: ${sk.overCapSkills.map(s => `${s.label} (${s.rankLabel} Lv ${s.requiredLevel}+)`).join(", ")}`);
      }
      if (sk.excessIncreases > 0) {
        warnParts.push(`${sk.excessIncreases} extra increase${sk.excessIncreases === 1 ? "" : "s"} spent`);
      }

      // Header stays ultra-clean 1-line when complete, or shows only actionable missing/warn items when incomplete
      const headerSegments = [];
      if (missingParts.length > 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-missing-list">${esc(missingParts.join(" · "))}</span>`);
      }
      if (warnParts.length > 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-warn-text">${esc(warnParts.join(" · "))}</span>`);
      }
      if (headerSegments.length === 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-ok-text">Complete</span>`);
      }

      const detailSegments = [];
      if (missingParts.length > 0) detailSegments.push(`<span class="pf2e-cc-sheet-missing-list">${esc(missingParts.join(" · "))}</span>`);
      if (warnParts.length > 0) detailSegments.push(`<span class="pf2e-cc-sheet-warn-text">${esc(warnParts.join(" · "))}</span>`);
      if (okParts.length > 0) detailSegments.push(`<span class="pf2e-cc-sheet-ok-text">${esc(okParts.join(" · "))}</span>`);

      const compactIncLevels = formatCompactLevels(sk.unlockedIncreaseLevels, sk.increaseLevelsText);

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-collapsible-head">
          <div class="pf2e-cc-sheet-banner-text pf2e-cc-sheet-title-toggle" data-cc-toggle-details="1" title="Click to show or hide skills breakdown">
            <strong>Skills Check:</strong> ${headerSegments.join(' <span class="pf2e-cc-sheet-sep">·</span> ')}
          </div>
          <div class="pf2e-cc-sheet-header-btns">
            <button type="button" class="pf2e-cc-sheet-btn" data-cc-toggle-details="1" data-cc-toggle-label="1" title="Expand or collapse skill counts and progression details">
              ${isExpanded ? "Hide" : "Details"}
            </button>
            ${plannerBtnHtml}
            ${checklistBtnHtml}
          </div>
        </div>
        <div class="pf2e-cc-sheet-collapsible-body">
          <div class="pf2e-cc-sheet-detail-card">
            <div class="pf2e-cc-sheet-subline">${detailSegments.join(' <span class="pf2e-cc-sheet-sep">·</span> ')}</div>
            <div class="pf2e-cc-sheet-subline is-muted">
              ${esc(sk.formulaText)} · Increases at Lv ${esc(compactIncLevels)}${sk.isFastProgression ? " (Fast Progression)" : ""}
            </div>
          </div>
        </div>
      `;

      bindCollapsibleStrip(bar, expandedSkillsGuideActors);
      bindCommonStripButtons(bar);

      // Place cleanly after Dual Class's existing note if present, otherwise at top of Skills tab
      const existingDcNote = skillsTab.querySelector(".pf2e-avr-dc-skills-note");
      if (existingDcNote) {
        existingDcNote.insertAdjacentElement("afterend", bar);
      } else {
        skillsTab.prepend(bar);
      }
    }

    // ---------------------------------------------------------------------
    // C. Spellcasting Tab: Unified Collapsible Spellcasting Check Strip
    // ---------------------------------------------------------------------
    const spellTab = root.querySelector('.tab[data-tab="spellcasting"]');
    if (spellTab && report.spellcasting.hasExpectedSources && !spellTab.querySelector(".pf2e-cc-sheet-spells-bar")) {
      const sp = report.spellcasting;
      const isExpanded = expandedSpellGuideActors.has(actor.id);
      const totalSources = sp.sources.length;
      const readyCount = sp.sources.filter(s => s.status === "complete").length;
      const incompleteSources = sp.sources.filter(s => s.status === "incomplete");

      const hasCritical = sp.missingEntryCount > 0 || incompleteSources.length > 0;
      const statusCls = hasCritical ? "critical" : (sp.outdatedSlotCount > 0 ? "warning" : "complete");

      const panel = document.createElement("div");
      panel.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-collapsible pf2e-cc-sheet-spells-bar status-${statusCls} ${isExpanded ? "" : "is-collapsed"}`;

      const headerSegments = [];
      if (sp.missingEntryCount > 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-missing-list">${sp.missingEntryCount} Missing ${sp.missingEntryCount === 1 ? "Entry" : "Entries"}</span>`);
      }
      if (sp.outdatedSlotCount > 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-warn-text">${sp.outdatedSlotCount} Outdated Slots</span>`);
      }
      if (incompleteSources.length > 0) {
        const incompleteSummary = incompleteSources
          .map(s => `${s.title} (${s.spellsMissingNote || "Needs Spells"})`)
          .join(" · ");
        headerSegments.push(`<span class="pf2e-cc-sheet-missing-list">${readyCount}/${totalSources} Ready — ${esc(incompleteSummary)}</span>`);
      } else if (sp.missingEntryCount === 0 && sp.outdatedSlotCount === 0) {
        headerSegments.push(`<span class="pf2e-cc-sheet-ok-text">${readyCount}/${totalSources} Ready</span>`);
      }

      const rowsHtml = sp.sources.map(src => {
        const tradLabel = TRADITION_LABELS[src.tradition] || "Select Tradition";
        const typeLabel = src.flexible ? "Flexible" : (CASTING_TYPE_LABELS[src.castingType] || src.castingType);
        const abilLabel = ABILITY_LABELS[src.ability] || String(src.ability || "").toUpperCase();

        let actionHtml = "";
        const autoCount = Number(src.missingAutoSpellsCount || 0);
        const needsFontPrep = Boolean(src.needsFontPrepare);
        if (!src.entryExists && isEditable) {
          const tradSelectHtml = src.traditionMissing ? `
            <select class="pf2e-cc-sheet-select pf2e-cc-sheet-trad" title="Choose Spellcasting Tradition">
              ${Object.entries(TRADITION_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
          ` : "";
          const createLbl = src.isDivineFont && src.divineFontChoice
            ? `+ Font (${src.divineFontCount}× ${src.divineFontSpellName})`
            : (autoCount > 0 ? `+ Entry (+${autoCount})` : "+ Add Entry");
          actionHtml = `
            <div class="pf2e-cc-sheet-row-actions">
              ${tradSelectHtml}
              <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-create="${esc(src.key)}" title="Create ${esc(src.entryName)} with Level ${report.level} slots${autoCount > 0 ? ` and auto-add ${esc(src.missingAutoSpellsText)}` : ""}">
                ${createLbl}
              </button>
            </div>
          `;
        } else if (src.entryExists && (src.slotsOutdated || autoCount > 0 || needsFontPrep) && isEditable) {
          const syncLbl = src.slotsOutdated && needsFontPrep
            ? `Sync & Prep ${src.divineFontSpellName}`
            : (src.slotsOutdated && autoCount > 0
              ? `Sync + ${autoCount}`
              : (src.slotsOutdated
                ? "Sync Slots"
                : (needsFontPrep
                  ? `Prep ${src.divineFontCount}× ${src.divineFontSpellName}`
                  : (src.isFocus ? `+ ${autoCount} Focus` : `+ ${autoCount} Auto`))));
          const btnCls = src.slotsOutdated ? "is-warn" : "is-primary";
          const syncTip = [
            src.slotsOutdated ? `Update slots to Level ${report.level} (${src.slotDiffText})` : "",
            autoCount > 0 ? `Auto-add: ${src.missingAutoSpellsText}` : "",
            needsFontPrep ? `Prepare ${src.divineFontCount}× Rank ${src.divineFontRank} ${src.divineFontSpellName}` : ""
          ].filter(Boolean).join(" · ");
          actionHtml = `
            <div class="pf2e-cc-sheet-row-actions">
              <button type="button" class="pf2e-cc-sheet-btn ${btnCls}" data-cc-sync="${esc(src.key)}" data-entry-id="${esc(src.entryId)}" title="${esc(syncTip)}">
                ${syncLbl}
              </button>
            </div>
          `;
        } else if (!src.entryExists) {
          actionHtml = `<span class="pf2e-cc-sheet-pill is-missing">Missing Entry</span>`;
        } else if (src.slotsOutdated) {
          actionHtml = `<span class="pf2e-cc-sheet-pill is-warn">Slots Outdated</span>`;
        } else if (src.isFocus || src.castingType === "focus") {
          const curF = Number(src.currentFocusSpells || 0);
          const expF = Number(src.expectedFocusSpells || 1);
          const pillCls = curF < expF ? "is-missing" : "is-ok";
          actionHtml = `<span class="pf2e-cc-sheet-pill ${pillCls}">${curF}/${expF} focus</span>`;
        } else {
          const isIncomplete = src.status !== "complete";
          const pillCls = isIncomplete ? "is-missing" : "is-ok";
          actionHtml = `<span class="pf2e-cc-sheet-pill ${pillCls}">${src.cantrips > 0 ? `C:${src.currentCantrips}/${src.cantrips} · ` : ""}${src.currentLeveledSpells} spells</span>`;
        }

        const isFocus = Boolean(src.isFocus || src.castingType === "focus");
        const slotLineHtml = isFocus
          ? `<strong>Focus:</strong> ${esc(src.slotsSummary)}`
          : `${src.cantrips > 0 ? `<strong>Cantrips:</strong> ${src.cantrips} · ` : ""}<strong>Slots:</strong> ${esc(src.slotsSummary)}${src.slotsOutdated ? ` · <span class="pf2e-cc-sheet-warn-text">Diff: ${esc(src.slotDiffText)}</span>` : ""}`;

        const autoLineHtml = autoCount > 0
          ? `<div class="pf2e-cc-sheet-subline pf2e-cc-sheet-auto-line"><strong>${src.entryExists ? "Auto-Add Ready:" : "Will Auto-Add:"}</strong> ${esc(src.missingAutoSpellsText)}</div>`
          : "";

        let choicesLineHtml = "";
        if (src.entryExists && isEditable && Array.isArray(src.pendingChoiceGroups) && src.pendingChoiceGroups.length > 0) {
          choicesLineHtml = src.pendingChoiceGroups.slice(0, 3).map(g => {
            const btns = g.options
              .filter(o => !o.alreadyKnown)
              .map(o => `<button type="button" class="pf2e-cc-sheet-choice-chip" data-cc-add-choice="1" data-entry-id="${esc(src.entryId)}" data-uuid="${esc(o.uuid)}" data-rank="${o.isCantrip ? 0 : (o.rank || 1)}" title="Add ${esc(o.name)} to ${esc(src.matchedEntryName || src.title)}">+ ${esc(o.name)}${o.qualifier ? ` (${esc(o.qualifier)})` : ""}</button>`)
              .join("");
            if (!btns) return "";
            const rankLbl = g.isCantrip ? "Cantrip" : `Rank ${g.rank}`;
            return `<div class="pf2e-cc-sheet-choice-strip"><span class="pf2e-cc-sheet-choice-lbl">${esc(g.isCurriculum ? `Curriculum ${rankLbl}` : g.sourceLabel)} (${g.remainingCount} left):</span> ${btns}</div>`;
          }).join("");
        }

        const rowStatusCls = !src.entryExists || src.status === "incomplete"
          ? "is-missing"
          : (src.slotsOutdated ? "is-warn" : "is-ok");

        return `
          <div class="pf2e-cc-sheet-spell-row ${rowStatusCls}">
            <div class="pf2e-cc-sheet-spell-info">
              <div class="pf2e-cc-sheet-spell-head">
                <strong>${esc(src.title)}</strong>
                <span class="pf2e-cc-sheet-tag">${esc(src.sourceBadge)}</span>
                <span class="pf2e-cc-sheet-meta">${esc(typeLabel)} · ${esc(tradLabel)} · ${esc(abilLabel)}</span>
              </div>
              <div class="pf2e-cc-sheet-subline">
                ${slotLineHtml}
              </div>
              ${autoLineHtml}
              ${choicesLineHtml}
              <div class="pf2e-cc-sheet-subline is-muted">${esc(src.expectedSpellsNote)}</div>
            </div>
            ${actionHtml}
          </div>
        `;
      }).join("");

      panel.innerHTML = `
        <div class="pf2e-cc-sheet-collapsible-head">
          <div class="pf2e-cc-sheet-banner-text pf2e-cc-sheet-title-toggle" data-cc-toggle-details="1" title="Click to show or hide expected spellcasting details">
            <strong>Spellcasting (Lv ${report.level}):</strong> ${headerSegments.join(' <span class="pf2e-cc-sheet-sep">·</span> ')}
          </div>
          <div class="pf2e-cc-sheet-header-btns">
            ${isEditable && sp.needsActionCount > 0 ? `
              <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-sync-all="1" title="Create missing entries, sync outdated slots, and auto-add focus / subclass / deity spells">
                Auto-Add / Sync
              </button>
            ` : ""}
            <button type="button" class="pf2e-cc-sheet-btn" data-cc-toggle-details="1" data-cc-toggle-label="1" title="Expand or collapse expected spellcasting breakdown">
              ${isExpanded ? "Hide" : "Details"}
            </button>
            ${plannerBtnHtml}
            ${checklistBtnHtml}
          </div>
        </div>
        <div class="pf2e-cc-sheet-collapsible-body pf2e-cc-sheet-spells-list">
          ${rowsHtml}
        </div>
      `;

      bindCollapsibleStrip(panel, expandedSpellGuideActors);
      bindCommonStripButtons(panel);

      panel.querySelector('[data-cc-sync-all="1"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const res = await createOrSyncAllSpellcastingEntries(actor);
        const msg = [];
        if (res.created.length) msg.push(`Created: ${res.created.join(", ")}`);
        if (res.synced.length) msg.push(`Synced: ${res.synced.join(", ")}`);
        if (res.addedSpells?.length) msg.push(`Auto-added spells: ${res.addedSpells.join(", ")}`);
        if (res.preparedFonts?.length) msg.push(`Prepared Font: ${res.preparedFonts.join(", ")}`);
        if (res.skippedNeedsTradition.length) msg.push(`Pick tradition for: ${res.skippedNeedsTradition.join(", ")}`);
        ui.notifications?.info(msg.length ? `Spellcasting | ${msg.join(" | ")}` : "Spellcasting entries are already up to date.");
      });

      panel.querySelectorAll("[data-cc-create]").forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const key = btn.dataset.ccCreate;
          const spec = report.spellcasting.sources.find(s => s.key === key);
          if (!spec) return;
          const row = btn.closest(".pf2e-cc-sheet-spell-row");
          const tradVal = row?.querySelector(".pf2e-cc-sheet-trad")?.value;
          const resOut = {};
          const created = await createSpellcastingEntry(actor, spec, {
            ...(tradVal ? { tradition: tradVal } : {}),
            resultOut: resOut
          });
          if (created) {
            const extras = [];
            if (resOut.addedSpells?.length) extras.push(`auto-added: ${resOut.addedSpells.join(", ")}`);
            if (resOut.preparedFont) extras.push(`prepared ${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
            const spellNote = extras.length ? ` (${extras.join("; ")})` : "";
            ui.notifications?.info(`Added spellcasting entry "${created.name}" to ${actor.name}${spellNote}!`);
          }
        });
      });

      panel.querySelectorAll("[data-cc-sync]").forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const key = btn.dataset.ccSync;
          const entryId = btn.dataset.entryId;
          const spec = report.spellcasting.sources.find(s => s.key === key);
          if (!spec || !entryId) return;
          const resOut = {};
          const ok = await syncSpellcastingEntrySlots(actor, entryId, spec, { includeAutoSpells: true, resultOut: resOut });
          if (ok) {
            const parts = [];
            if (resOut.slotsChanged) parts.push(`synced slots to Level ${report.level}`);
            if (resOut.addedSpells?.length) parts.push(`added ${resOut.addedSpells.join(", ")}`);
            if (resOut.preparedFont) parts.push(`prepared ${resOut.preparedFont.count}× R${resOut.preparedFont.rank} ${resOut.preparedFont.spellName}`);
            ui.notifications?.info(`${spec.matchedEntryName || spec.title}: ${parts.join(" & ") || "up to date"}!`);
          }
        });
      });

      panel.querySelectorAll("[data-cc-add-choice]").forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const entryId = btn.dataset.entryId;
          const uuid = btn.dataset.uuid;
          const rank = btn.dataset.rank ? Number(btn.dataset.rank) : null;
          if (!entryId || !uuid) return;
          const created = await addSingleSpellToEntry(actor, entryId, uuid, { rank });
          if (created) {
            ui.notifications?.info(`Added "${created.name}" to ${actor.name}!`);
          }
        });
      });

      spellTab.prepend(panel);
    }

    // ---------------------------------------------------------------------
    // D. Feats Tab: Always-Visible Unified Feat Slots & Dual Class Strip
    // ---------------------------------------------------------------------
    const featsTab = root.querySelector('.tab[data-tab="feats"]');
    if (featsTab && (report.feats.totalSlots > 0 || report.feats.hasMissingDualFeatures) && !featsTab.querySelector(".pf2e-cc-sheet-feats-bar")) {
      const hasIssues = report.feats.emptySlotsTotal > 0 || report.feats.hasMissingDualFeatures;
      const bar = document.createElement("div");
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-feats-bar status-${hasIssues ? "critical" : "complete"}`;

      const emptySummaries = report.feats.groups
        .filter(g => g.empty > 0)
        .map(g => {
          const compactLvls = formatCompactLevels(g.emptyLevels, g.emptyLevelsText);
          return `${g.label} (Lv ${compactLvls})`;
        })
        .join(" · ");

      const dualNote = report.feats.hasMissingDualFeatures
        ? `<div class="pf2e-cc-sheet-subline is-missing">${report.feats.missingDualFeatures.length} Dual Class (${esc(report.dualClassName)}) class feature(s) missing for Level ${report.level}.</div>`
        : "";

      const canSyncDual = Boolean(
        report.feats.hasMissingDualFeatures
        && (sheet.isEditable ?? actor.isOwner)
        && typeof game.pf2eAwesomeVariantRules?.syncSecondaryClassFeatures === "function"
      );

      let mainLineHtml = "";
      if (!hasIssues) {
        mainLineHtml = `<strong>Feats Check:</strong> <span class="pf2e-cc-sheet-ok-text">Complete (${report.feats.filledSlots}/${report.feats.totalSlots} slots)</span>`;
      } else if (emptySummaries) {
        mainLineHtml = `<strong>Feats Check (${report.feats.emptySlotsTotal} Empty):</strong> <span class="pf2e-cc-sheet-missing-list">${esc(emptySummaries)}</span>`;
      } else {
        mainLineHtml = `<strong>Feats Check:</strong> <span class="pf2e-cc-sheet-missing-list">Dual Class Features Out of Sync</span>`;
      }

      bar.innerHTML = `
        <div class="${dualNote ? "pf2e-cc-sheet-banner-col" : "pf2e-cc-sheet-banner-main"}">
          <div class="pf2e-cc-sheet-banner-text">${mainLineHtml}</div>
          ${dualNote}
        </div>
        <div class="pf2e-cc-sheet-header-btns">
          ${canSyncDual ? `
            <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-sync-dual="1">
              Sync Dual
            </button>
          ` : ""}
          ${plannerBtnHtml}
          ${checklistBtnHtml}
        </div>
      `;

      bindCommonStripButtons(bar);

      bar.querySelector('[data-cc-sync-dual="1"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await game.pf2eAwesomeVariantRules.syncSecondaryClassFeatures(actor, { refreshSource: true, notify: true });
        actor.reset();
        sheet.render({ force: false });
      });

      featsTab.prepend(bar);
    }

    // ---------------------------------------------------------------------
    // E. Crafting Tab: Collapsible Unified Alchemist / Free Formulas Strip
    // ---------------------------------------------------------------------
    const craftingTab = root.querySelector('.tab[data-tab="crafting"]');
    if (craftingTab && report.formulas?.expected > 0 && !craftingTab.querySelector(".pf2e-cc-sheet-crafting-bar")) {
      const fm = report.formulas;
      const isExpanded = expandedFormulaGuideActors.has(actor.id);
      const bar = document.createElement("div");
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-collapsible pf2e-cc-sheet-crafting-bar status-${fm.missing > 0 ? "critical" : "complete"} ${isExpanded ? "" : "is-collapsed"}`;

      const labelTitle = fm.isAlchemist ? "Alchemist Formulas" : "Free Formulas";
      const summaryHtml = fm.missing > 0
        ? `<strong>${labelTitle}:</strong> <span class="pf2e-cc-sheet-missing-list">Missing ${fm.missing} (${fm.current}/${fm.expected})</span>`
        : `<strong>${labelTitle}:</strong> <span class="pf2e-cc-sheet-ok-text">${fm.current}/${fm.expected} known</span>`;

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-collapsible-head">
          <div class="pf2e-cc-sheet-banner-text pf2e-cc-sheet-title-toggle" data-cc-toggle-details="1" title="Click to show or hide formula breakdown">
            ${summaryHtml}
          </div>
          <div class="pf2e-cc-sheet-header-btns">
            <button type="button" class="pf2e-cc-sheet-btn" data-cc-toggle-details="1" data-cc-toggle-label="1" title="Expand or collapse free formula breakdown">
              ${isExpanded ? "Hide" : "Details"}
            </button>
            ${plannerBtnHtml}
            ${checklistBtnHtml}
          </div>
        </div>
        <div class="pf2e-cc-sheet-collapsible-body">
          <div class="pf2e-cc-sheet-detail-card">
            <div class="pf2e-cc-sheet-subline"><strong>Level ${report.level} Breakdown:</strong> ${esc(fm.formulaText)}</div>
          </div>
        </div>
      `;

      bindCollapsibleStrip(bar, expandedFormulaGuideActors);
      bindCommonStripButtons(bar);
      craftingTab.prepend(bar);
    }
  });
}
