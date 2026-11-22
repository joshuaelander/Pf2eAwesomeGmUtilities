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
  analyzeCharacter,
  createOrSyncAllSpellcastingEntries,
  createSpellcastingEntry,
  postChecklistToChat,
  syncSpellcastingEntrySlots
} from "./character-checker-engine.js";

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
  return [
    { value: "arcane", label: "Arcane", selected: selected === "arcane" },
    { value: "divine", label: "Divine", selected: selected === "divine" },
    { value: "occult", label: "Occult", selected: selected === "occult" },
    { value: "primal", label: "Primal", selected: selected === "primal" }
  ];
}

function getAbilityOptions(selected = "int") {
  return [
    { value: "int", label: "INT", selected: selected === "int" },
    { value: "wis", label: "WIS", selected: selected === "wis" },
    { value: "cha", label: "CHA", selected: selected === "cha" }
  ];
}

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
        completenessPct: report.completenessPct,
        status: report.status,
        statusLabel: report.statusLabel,
        actionableMissingCount: report.actionableMissingCount,
        isSelected
      });
      if (isSelected) selectedReport = report;
    }

    const selectedActor = this._selectedActorId ? game.actors?.get(this._selectedActorId) : null;
    const canModifySpells = canAutoModifySpellcasting(selectedActor);

    // Enrich spellcasting rows with template-friendly flags & dropdown options
    if (selectedReport) {
      selectedReport.spellcasting.sources = selectedReport.spellcasting.sources.map(src => ({
        ...src,
        castingTypeLabel: src.flexible ? "Flexible" : (CASTING_TYPE_LABELS[src.castingType] || src.castingType),
        traditionLabel: TRADITION_LABELS[src.tradition] || "Choose Tradition",
        abilityLabel: ABILITY_LABELS[src.ability] || String(src.ability || "").toUpperCase(),
        isMissing: !src.entryExists,
        isOutdated: Boolean(src.entryExists && src.slotsOutdated),
        isNeedsSpells: Boolean(src.entryExists && !src.slotsOutdated && src.status === "incomplete"),
        isComplete: src.status === "complete",
        hasCantrips: src.cantrips > 0,
        traditionOptions: getTraditionOptions(src.tradition || "arcane"),
        abilityOptions: getAbilityOptions(src.ability || "int")
      }));

      selectedReport.skills.isTrainedMissing = selectedReport.skills.trainedStatus === "missing";
      selectedReport.skills.isTrainedComplete = selectedReport.skills.trainedStatus === "complete";
      selectedReport.skills.isIncreasesMissing = selectedReport.skills.increasesStatus === "missing";
      selectedReport.skills.isIncreasesComplete = selectedReport.skills.increasesStatus === "complete";
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
      roster,
      hasRoster: roster.length > 0,
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
        if (actor?.sheet) actor.sheet.render(true);
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
        const abilSelect = card?.querySelector(".pf2e-cc-abil-select");
        const overrides = {};
        if (tradSelect?.value) overrides.tradition = tradSelect.value;
        if (abilSelect?.value) overrides.ability = abilSelect.value;

        const created = await createSpellcastingEntry(actor, spec, overrides);
        if (created) {
          ui.notifications?.info(`Created spellcasting entry "${created.name}" on ${actor.name}!`);
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

        const ok = await syncSpellcastingEntrySlots(actor, entryId, spec);
        if (ok) {
          ui.notifications?.info(`Updated spell slots for "${spec.matchedEntryName || spec.title}" to Level ${report.level}!`);
          this.render({ force: false });
        }
        break;
      }

      case "sync-all-spells": {
        if (!actor || !canAutoModifySpellcasting(actor)) return;
        const res = await createOrSyncAllSpellcastingEntries(actor);
        const parts = [];
        if (res.created.length > 0) parts.push(`Created: ${res.created.join(", ")}`);
        if (res.synced.length > 0) parts.push(`Synced slots: ${res.synced.join(", ")}`);
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

/**
 * Registers the `renderCharacterSheetPF2e` hook that injects helpful, native parchment-styled
 * completeness guides directly onto the Character, Skills, Spellcasting, and Feats tabs.
 *
 * @param {(actor: Actor) => void} onOpenCheckerForActor
 */
export function registerCharacterSheetCheckerIntegration(onOpenCheckerForActor) {
  Hooks.on("renderCharacterSheetPF2e", (sheet, html) => {
    if (!isSheetGuidesEnabled()) return;

    const actor = sheet?.actor ?? sheet?.document;
    if (!actor || actor.type !== "character") return;

    // Only show build guides to GM or character owners (not observer/limited party members)
    if (!game.user?.isGM && !actor.isOwner) return;

    const root = html instanceof HTMLElement ? html : (html?.[0] ?? sheet?.element);
    if (!root || typeof root.querySelector !== "function") return;

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
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-char-bar status-${report.status}`;

      const topMissing = report.allIssues
        .filter(i => i.severity === "critical" || i.severity === "warning")
        .slice(0, 3)
        .map(i => i.title)
        .join(" · ");

      const summaryHtml = report.actionableMissingCount > 0
        ? `<strong>Build Check (${report.completenessPct}%):</strong> <span class="pf2e-cc-sheet-missing-list">${esc(topMissing)}${report.actionableMissingCount > 3 ? ` (+${report.actionableMissingCount - 3} more)` : ""}</span>`
        : `<strong>Build Check (${report.completenessPct}%):</strong> Character build looks complete for Level ${report.level}!`;

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-banner-main">
          <div class="pf2e-cc-sheet-banner-text">${summaryHtml}</div>
        </div>
        <button type="button" class="pf2e-cc-sheet-btn" data-cc-open="1" title="Open Full Character Completeness Checker">
          Checklist
        </button>
      `;

      bar.querySelector('[data-cc-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenCheckerForActor?.(actor);
      });

      charTab.prepend(bar);
    }

    // ---------------------------------------------------------------------
    // B. Skills / Proficiencies Tab: Trained Skills & Skill Increases Guide
    // ---------------------------------------------------------------------
    const skillsTab = root.querySelector('.tab[data-tab="proficiencies"], .tab[data-tab="skills"]');
    if (skillsTab && !skillsTab.querySelector(".pf2e-cc-sheet-skills-bar")) {
      const sk = report.skills;
      const lang = report.languages;
      const bar = document.createElement("div");
      bar.className = `pf2e-cc-sheet-banner pf2e-cc-sheet-skills-bar status-${(sk.missingTrained > 0 || sk.missingIncreases > 0 || sk.overCapSkills.length > 0) ? "warning" : "complete"}`;

      const trainedClass = sk.missingTrained > 0 ? "is-missing" : "is-ok";
      const incClass = sk.missingIncreases > 0 ? "is-missing" : (sk.excessIncreases > 0 ? "is-warn" : "is-ok");
      const langClass = lang.missing > 0 ? "is-warn" : "is-ok";

      const overCapHtml = sk.overCapSkills.length > 0
        ? `<div class="pf2e-cc-sheet-subline is-missing">Above level cap: ${esc(sk.overCapSkills.map(s => `${s.label} (${s.rankLabel} requires Lv ${s.requiredLevel}+)`).join(", "))}</div>`
        : "";

      const loreNote = sk.bgLoreCount > 0
        ? ` · +${sk.bgLoreCount} BG Lore (${sk.loreCount} Lore total)`
        : (sk.loreCount > 0 ? ` · ${sk.loreCount} Lore` : "");

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-banner-col">
          <div class="pf2e-cc-sheet-chips-row">
            <span class="pf2e-cc-sheet-chip ${trainedClass}" title="Expected Trained Skills: ${esc(sk.formulaText)}">
              Trained Skills: <strong>${sk.currentTrained} / ${sk.expectedTrained}</strong>
              ${sk.missingTrained > 0 ? `<em>(${sk.missingTrained} left)</em>` : ""}
            </span>
            <span class="pf2e-cc-sheet-chip ${incClass}" title="Skill increases unlocked at level(s): ${esc(sk.increaseLevelsText)}">
              Skill Increases: <strong>${sk.spentIncreases} / ${sk.expectedIncreases}</strong>
              ${sk.missingIncreases > 0 ? `<em>(${sk.missingIncreases} left)</em>` : ""}
            </span>
            ${lang.expected > 0 ? `
              <span class="pf2e-cc-sheet-chip ${langClass}" title="Expected Languages from Ancestry + INT">
                Languages: <strong>${lang.current} / ${lang.expected}</strong>
              </span>
            ` : ""}
          </div>
          <div class="pf2e-cc-sheet-subline">
            ${esc(sk.formulaText)}${esc(loreNote)} · Increases at Lv: <strong>${esc(sk.increaseLevelsText)}</strong>${sk.isFastProgression ? " (Fast Progression)" : ""}
          </div>
          ${overCapHtml}
        </div>
        <button type="button" class="pf2e-cc-sheet-btn" data-cc-open="1" title="Open Full Character Completeness Checker">
          Check
        </button>
      `;

      bar.querySelector('[data-cc-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenCheckerForActor?.(actor);
      });

      // Place cleanly after Dual Class's existing note if present, otherwise at top of Skills tab
      const existingDcNote = skillsTab.querySelector(".pf2e-avr-dc-skills-note");
      if (existingDcNote) {
        existingDcNote.insertAdjacentElement("afterend", bar);
      } else {
        skillsTab.prepend(bar);
      }
    }

    // ---------------------------------------------------------------------
    // C. Spellcasting Tab: Expected Spells/Slots & 1-Click Entry Creator
    // ---------------------------------------------------------------------
    const spellTab = root.querySelector('.tab[data-tab="spellcasting"]');
    if (spellTab && report.spellcasting.hasExpectedSources && !spellTab.querySelector(".pf2e-cc-sheet-spells-bar")) {
      const sp = report.spellcasting;
      const panel = document.createElement("div");
      panel.className = `pf2e-cc-sheet-spells-bar status-${sp.missingEntryCount > 0 ? "critical" : (sp.outdatedSlotCount > 0 ? "warning" : "complete")}`;

      const rowsHtml = sp.sources.map(src => {
        const tradLabel = TRADITION_LABELS[src.tradition] || "Select Tradition";
        const typeLabel = src.flexible ? "Flexible" : (CASTING_TYPE_LABELS[src.castingType] || src.castingType);
        const abilLabel = ABILITY_LABELS[src.ability] || String(src.ability || "").toUpperCase();

        let actionHtml = "";
        if (!src.entryExists && isEditable) {
          const tradSelectHtml = src.traditionMissing ? `
            <select class="pf2e-cc-sheet-select pf2e-cc-sheet-trad" title="Choose Spellcasting Tradition">
              <option value="arcane">Arcane</option>
              <option value="divine">Divine</option>
              <option value="occult">Occult</option>
              <option value="primal">Primal</option>
            </select>
          ` : "";
          actionHtml = `
            <div class="pf2e-cc-sheet-row-actions">
              ${tradSelectHtml}
              <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-create="${esc(src.key)}" title="Create ${esc(src.entryName)} with Level ${report.level} slots">
                + Add Entry
              </button>
            </div>
          `;
        } else if (src.entryExists && src.slotsOutdated && isEditable) {
          actionHtml = `
            <div class="pf2e-cc-sheet-row-actions">
              <button type="button" class="pf2e-cc-sheet-btn is-warn" data-cc-sync="${esc(src.key)}" data-entry-id="${esc(src.entryId)}" title="Update spell slot maximums to Level ${report.level} (${esc(src.slotDiffText)})">
                Sync Slots
              </button>
            </div>
          `;
        } else if (!src.entryExists) {
          actionHtml = `<span class="pf2e-cc-sheet-pill is-missing">Missing Entry</span>`;
        } else if (src.slotsOutdated) {
          actionHtml = `<span class="pf2e-cc-sheet-pill is-warn">Slots Outdated</span>`;
        } else {
          actionHtml = `<span class="pf2e-cc-sheet-pill is-ok">${src.cantrips > 0 ? `C:${src.currentCantrips}/${src.cantrips} · ` : ""}${src.currentLeveledSpells} spells</span>`;
        }

        return `
          <div class="pf2e-cc-sheet-spell-row">
            <div class="pf2e-cc-sheet-spell-info">
              <div class="pf2e-cc-sheet-spell-head">
                <strong>${esc(src.title)}</strong>
                <span class="pf2e-cc-sheet-tag">${esc(src.sourceBadge)}</span>
                <span class="pf2e-cc-sheet-meta">${esc(typeLabel)} · ${esc(tradLabel)} · ${esc(abilLabel)}</span>
              </div>
              <div class="pf2e-cc-sheet-subline">
                ${src.cantrips > 0 ? `<strong>Cantrips:</strong> ${src.cantrips} · ` : ""}<strong>Slots:</strong> ${esc(src.slotsSummary)}
                ${src.slotsOutdated ? ` · <span class="is-missing">Diff: ${esc(src.slotDiffText)}</span>` : ""}
              </div>
              <div class="pf2e-cc-sheet-subline is-muted">${esc(src.expectedSpellsNote)}</div>
            </div>
            ${actionHtml}
          </div>
        `;
      }).join("");

      panel.innerHTML = `
        <div class="pf2e-cc-sheet-spells-header">
          <span>
            <strong>Expected Spellcasting (Level ${report.level})</strong>
          </span>
          <div class="pf2e-cc-sheet-header-btns">
            ${isEditable && sp.needsActionCount > 0 ? `
              <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-sync-all="1" title="Create all missing entries and sync outdated slots">
                Auto-Add / Sync All
              </button>
            ` : ""}
            <button type="button" class="pf2e-cc-sheet-btn" data-cc-open="1" title="Open Full Character Completeness Checker">
              Full Check
            </button>
          </div>
        </div>
        <div class="pf2e-cc-sheet-spells-list">
          ${rowsHtml}
        </div>
      `;

      panel.querySelector('[data-cc-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenCheckerForActor?.(actor);
      });

      panel.querySelector('[data-cc-sync-all="1"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const res = await createOrSyncAllSpellcastingEntries(actor);
        const msg = [];
        if (res.created.length) msg.push(`Created: ${res.created.join(", ")}`);
        if (res.synced.length) msg.push(`Synced: ${res.synced.join(", ")}`);
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
          const created = await createSpellcastingEntry(actor, spec, tradVal ? { tradition: tradVal } : {});
          if (created) {
            ui.notifications?.info(`Added spellcasting entry "${created.name}" to ${actor.name}!`);
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
          const ok = await syncSpellcastingEntrySlots(actor, entryId, spec);
          if (ok) {
            ui.notifications?.info(`Synced spell slots for "${spec.matchedEntryName || spec.title}" to Level ${report.level}!`);
          }
        });
      });

      spellTab.prepend(panel);
    }

    // ---------------------------------------------------------------------
    // D. Feats Tab: Compact Missing Feat Slots & Dual Class Feature Sync
    // ---------------------------------------------------------------------
    const featsTab = root.querySelector('.tab[data-tab="feats"]');
    if (featsTab && (report.feats.emptySlotsTotal > 0 || report.feats.hasMissingDualFeatures) && !featsTab.querySelector(".pf2e-cc-sheet-feats-bar")) {
      const bar = document.createElement("div");
      bar.className = "pf2e-cc-sheet-banner pf2e-cc-sheet-feats-bar status-warning";

      const emptySummaries = report.feats.groups
        .filter(g => g.empty > 0)
        .map(g => `${g.label} (Lv ${g.emptyLevelsText})`)
        .join(" · ");

      const dualNote = report.feats.hasMissingDualFeatures
        ? `<div class="pf2e-cc-sheet-subline is-missing">${report.feats.missingDualFeatures.length} Dual Class (${esc(report.dualClassName)}) class feature(s) missing for Level ${report.level}.</div>`
        : "";

      const canSyncDual = Boolean(
        report.feats.hasMissingDualFeatures
        && (sheet.isEditable ?? actor.isOwner)
        && typeof game.pf2eAwesomeVariantRules?.syncSecondaryClassFeatures === "function"
      );

      bar.innerHTML = `
        <div class="pf2e-cc-sheet-banner-col">
          <div class="pf2e-cc-sheet-banner-text">
            ${emptySummaries ? `<strong>Empty Feat Slots (${report.feats.emptySlotsTotal}):</strong> ${esc(emptySummaries)}` : `<strong>Dual Class Features Out of Sync</strong>`}
          </div>
          ${dualNote}
        </div>
        <div class="pf2e-cc-sheet-header-btns">
          ${canSyncDual ? `
            <button type="button" class="pf2e-cc-sheet-btn is-primary" data-cc-sync-dual="1">
              Sync Dual Features
            </button>
          ` : ""}
          <button type="button" class="pf2e-cc-sheet-btn" data-cc-open="1">
            Check
          </button>
        </div>
      `;

      bar.querySelector('[data-cc-open="1"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onOpenCheckerForActor?.(actor);
      });

      bar.querySelector('[data-cc-sync-dual="1"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await game.pf2eAwesomeVariantRules.syncSecondaryClassFeatures(actor, { refreshSource: true, notify: true });
        actor.reset();
        sheet.render({ force: false });
      });

      featsTab.prepend(bar);
    }
  });
}
