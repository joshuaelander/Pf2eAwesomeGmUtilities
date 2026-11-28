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

import { MODULE_ID } from "../constants.js";
import {
  TRADITION_LABELS,
  analyzeCharacter,
  capitalize,
  collectCandidateActors,
  normalizeSlug,
  resolveSpellDocumentByUuid
} from "./character-checker-engine.js";
import {
  ANCESTRY_SEARCH_ALIASES,
  FORMULA_CRAFTABLE_TYPES,
  applyPlannedLevelChoices,
  applyPlannedLevelUp,
  buildLevelRoadmap,
  clearActorLevelPlan,
  clearPlannedFeat,
  clearPlannedFeatChoice,
  computeMatchingArchetypeFeatUuids,
  embedLiveCoreItem,
  evaluateFeatPrerequisites,
  formatTraitSummaryList,
  getActorLevelPlan,
  getLightweightCoreBuildIndex,
  getLightweightFeatIndex,
  getLightweightFormulaIndex,
  getLightweightSpellIndex,
  hasAnySavedLevelPlan,
  inspectLevelRevert,
  inspectPlannedLevels,
  isLevelPlannerEnabled,
  isPlannerUpdatingActor,
  matchesChoiceSetFeatFilter,
  openNativeBrowserForFeatSlot,
  openNativeBrowserForFormulas,
  openNativeBrowserForSpells,
  openNativePackForCoreBuild,
  preloadPlannerProjectionData,
  revertActorToLevel,
  setPlannedFeatSnapshot,
  updatePlannedLevelData,
  warmPlannerItemMeta
} from "./level-planner-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------------- */
/* HELPERS                                                                   */
/* ------------------------------------------------------------------------- */

function formatLevelRange(fromLevel, toLevel, { prefix = "Lv", pluralPrefix = prefix } = {}) {
  if (fromLevel === toLevel) return prefix ? `${prefix} ${toLevel}` : `${toLevel}`;
  return pluralPrefix ? `${pluralPrefix} ${fromLevel}–${toLevel}` : `${fromLevel}–${toLevel}`;
}

function notifyAppliedLevelChoices(actor, res, { headline, reminderPrefix }) {
  const postReport = analyzeCharacter(actor);
  const remainingNote = postReport?.actionableMissingCount > 0
    ? ` | ${postReport.actionableMissingCount} checklist item(s) remaining`
    : " | Build 100% Complete!";
  const summaryStr = res.summary.length > 0 ? ` — ${res.summary.join(" | ")}` : "";
  ui.notifications?.info(`${headline}${summaryStr}${remainingNote}`);
  if (Array.isArray(res.reminders) && res.reminders.length > 0) {
    ui.notifications?.warn(`${reminderPrefix} Reminders: ${res.reminders.join(" · ")}`);
  }
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
    let doc = await fromUuid(uuid);
    if (!doc) doc = await resolveSpellDocumentByUuid(uuid);
    if (doc?.sheet) {
      doc.sheet.render({ force: true });
    } else {
      ui.notifications?.warn("Could not open item sheet for this entry.");
    }
  } catch (err) {
    console.warn("PF2e Awesome GM Utilities | Failed to inspect UUID:", uuid, err);
  }
}

/* ------------------------------------------------------------------------- */
/* SHARED LIGHTWEIGHT QUICK PICK DIALOGS (REUSED BY PLANNER & CHECKLIST)     */
/* ------------------------------------------------------------------------- */

export function openQuickPickerDialog({
  title,
  icon,
  width = 650,
  closeAction = "done",
  closeLabel = "Done",
  closeIcon = "fa-solid fa-check",
  browseLabel = "PF2e Browser",
  browseTitle = "Open PF2e's full native Compendium Browser",
  showGoal = false,
  controlsHtml,
  loadingText,
  onBrowse,
  onReady,
  loadItems,
  filterItems,
  formatStatus,
  emptyText,
  renderRow,
  onSelect,
  changeSelectors = []
}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const esc = foundry.utils.escapeHTML;
  const content = `
    <div class="pf2e-lp-picker">
      ${showGoal ? '<div class="pf2e-lp-picker-goal" style="display:none;"></div>' : ""}
      <div class="pf2e-lp-picker-controls">
        ${controlsHtml}
        ${onBrowse ? `
          <button type="button" class="pf2e-lp-picker-browser-btn" title="${esc(browseTitle)}">
            <i class="fa-solid fa-compass"></i> ${esc(browseLabel)}
          </button>
        ` : ""}
      </div>
      <div class="pf2e-lp-picker-status">${loadingText}</div>
      <div class="pf2e-lp-picker-list"></div>
    </div>
  `;

  const dialog = new DialogV2({
    window: { title, icon, resizable: true },
    position: { width, height: 540 },
    classes: ["pf2e-gm-utility", "pf2e-lp-picker-dialog"],
    content,
    buttons: [{ action: closeAction, label: closeLabel, icon: closeIcon }]
  });

  dialog.addEventListener("render", async () => {
    const root = dialog.element?.querySelector?.(".pf2e-lp-picker");
    if (!root) return;

    const searchInput = root.querySelector(".pf2e-lp-picker-search");
    const browserBtn = root.querySelector(".pf2e-lp-picker-browser-btn");
    const statusEl = root.querySelector(".pf2e-lp-picker-status");
    const listEl = root.querySelector(".pf2e-lp-picker-list");

    browserBtn?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await onBrowse?.(root);
    });

    const ctx = (await onReady?.(root, dialog)) || {};
    const allItems = await loadItems(root, ctx);

    const renderList = () => {
      const query = (searchInput?.value || "").trim().toLowerCase();
      const matched = filterItems(allItems, { root, query, ctx });
      const capped = matched.slice(0, 120);
      statusEl.textContent = formatStatus(matched.length, ctx);

      if (capped.length === 0) {
        const emptyMsg = typeof emptyText === "function" ? emptyText(ctx) : emptyText;
        listEl.innerHTML = `<div class="pf2e-lp-picker-empty">${emptyMsg}</div>`;
        return;
      }

      listEl.innerHTML = capped.map((item, idx) => renderRow(item, idx, ctx)).join("");

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
          await onSelect(chosen, { btn, root, dialog, ctx });
        });
      });
    };

    let debounce = null;
    searchInput?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(renderList, 60);
    });
    for (const sel of changeSelectors) {
      root.querySelector(sel)?.addEventListener("change", renderList);
    }

    renderList();
    searchInput?.focus();
  }, { once: true });

  dialog.render({ force: true });
}

/**
 * Shared Feat Quick Picker dialog (with prerequisite evaluation, sorting, `"Prereqs Met"` toggle,
 * and Free Archetype Dedication auto-default). Used by both Level Planner and Character Checker!
 */
export function openFeatQuickPickerDialog(actor, levelNum, slot, { prereqState: rawPrereqState = null, choiceSetSpec = null, onSelectFeat } = {}) {
  const esc = foundry.utils.escapeHTML;
  const isChoiceSetMode = Boolean(choiceSetSpec && choiceSetSpec.isFeatQuery);
  const slotDedications = Array.isArray(slot.dedications) ? slot.dedications : [];
  const hasDedications = slotDedications.length > 0;
  const dedShortNames = slotDedications.map(d => d.shortLabel).filter(Boolean).join(", ");
  const myArchLabel = slotDedications.length > 1
    ? `My Archetypes (${dedShortNames})`
    : `My Archetype (${dedShortNames})`;

  const effectiveMaxLevel = isChoiceSetMode
    ? Math.max(0, Number(choiceSetSpec.maxLevel ?? slot.level ?? levelNum))
    : Math.max(1, Number(slot.level ?? levelNum));

  const defaultScope = isChoiceSetMode
    ? "choiceset"
    : (slot.groupId === "archetype"
      ? (hasDedications ? "my-archetypes" : "archetype-dedications")
      : (slot.groupId === "class" || slot.groupId === "dualclass" ? "class-only" : "slot"));

  const defaultPrereqsOnly = isChoiceSetMode || slot.category === "skill" || slot.category === "general";

  // Build a clean prereq snapshot for this slot (excluding the feat currently sitting in THIS slot if replacing it)
  let prereqState = rawPrereqState;
  const replacingNameRaw = isChoiceSetMode ? choiceSetSpec.selection?.name : slot.feat?.name;
  if (prereqState && replacingNameRaw) {
    const replacingName = String(replacingNameRaw).trim().toLowerCase();
    const liveOwned = (actor.itemTypes?.feat || []).some(f => String(f.name || "").trim().toLowerCase() === replacingName);
    if (!liveOwned && prereqState.knownFeatNamesLower?.has?.(replacingName)) {
      const nextKnown = new Set(prereqState.knownFeatNamesLower);
      nextKnown.delete(replacingName);
      const nextBase = new Set(prereqState.knownFeatBaseNamesLower || []);
      const baseName = replacingName.replace(/\s*\([^)]*\)\s*/g, "").trim();
      if (baseName) nextBase.delete(baseName);
      prereqState = { ...prereqState, knownFeatNamesLower: nextKnown, knownFeatBaseNamesLower: nextBase };
    }
  }

  const traitDisplayList = formatTraitSummaryList(slot.traits || []);
  const traitSummary = traitDisplayList.length > 0 ? ` (${traitDisplayList.join(", ")})` : "";

  let scopeOptionsHtml = "";
  if (isChoiceSetMode) {
    scopeOptionsHtml = `
      <option value="choiceset" selected>Legal Choices (Lv ≤ ${effectiveMaxLevel})</option>
      <option value="all">All Feats (Unfiltered)</option>
    `;
  } else if (slot.groupId === "class" || slot.groupId === "dualclass") {
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

  const slotTraits = (slot.traits || []).map(normalizeSlug).filter(Boolean);
  const dialogTitle = isChoiceSetMode
    ? `${slot.feat?.name || slot.groupLabel}: ${choiceSetSpec.prompt} — Level ${levelNum}`
    : `Pick ${slot.groupLabel} — Level ${levelNum}`;
  const searchPlaceholder = isChoiceSetMode
    ? `Search granted feats (Lv ≤ ${effectiveMaxLevel})...`
    : `Search ${slot.groupLabel} (Lv ≤ ${effectiveMaxLevel})...`;

  openQuickPickerDialog({
    title: dialogTitle,
    icon: "fa-solid fa-star",
    width: 680,
    closeAction: "close",
    closeLabel: "Close",
    closeIcon: "fa-solid fa-xmark",
    controlsHtml: `
      <input type="text" class="pf2e-lp-picker-search" placeholder="${esc(searchPlaceholder)}" autofocus />
      <select class="pf2e-lp-picker-scope" title="Filter scope">${scopeOptionsHtml}</select>
      <label class="pf2e-lp-picker-check" title="Show only feats whose skill, attribute, proficiency, and feat prerequisites are met by your character sheet (and planned increases/class features up to Level ${levelNum}). Uncheck to show all with unmet prereqs sorted to the bottom.">
        <input type="checkbox" class="pf2e-lp-picker-prereqs" ${defaultPrereqsOnly ? "checked" : ""} />
        <span>Prereqs Met</span>
      </label>
      <label class="pf2e-lp-picker-check" title="Include feats higher than Level ${effectiveMaxLevel}">
        <input type="checkbox" class="pf2e-lp-picker-any-lvl" />
        <span>Any Lv</span>
      </label>
    `,
    loadingText: "Loading lightweight feat index...",
    changeSelectors: [".pf2e-lp-picker-scope", ".pf2e-lp-picker-prereqs", ".pf2e-lp-picker-any-lvl"],
    onBrowse: isChoiceSetMode
      ? () => openNativeBrowserForFeatSlot({ ...slot, level: effectiveMaxLevel, groupId: "general", category: "", traits: [] })
      : () => openNativeBrowserForFeatSlot(slot),
    loadItems: async (root, ctx) => {
      const allFeats = await getLightweightFeatIndex();
      ctx.myArchetypeUuids = hasDedications ? computeMatchingArchetypeFeatUuids(allFeats, slotDedications) : new Set();
      ctx.perDedicationUuids = slotDedications.length > 1
        ? slotDedications.map(d => computeMatchingArchetypeFeatUuids(allFeats, [d]))
        : [];
      ctx.allFeatNamesLower = new Set();
      for (const f of allFeats) {
        if (f.category === "classfeature" || f.category === "ancestryfeature") continue;
        const lower = String(f.name || "").trim().toLowerCase();
        if (lower) {
          ctx.allFeatNamesLower.add(lower);
          const stripped = lower.replace(/\s*\([^)]*\)\s*/g, "").trim();
          if (stripped) ctx.allFeatNamesLower.add(stripped);
        }
      }

      const scopeSelect = root.querySelector(".pf2e-lp-picker-scope");
      if (!isChoiceSetMode && slot.groupId === "archetype" && scopeSelect) {
        const hasEligibleOwnedAtLevel = hasDedications && allFeats.some(f =>
          ctx.myArchetypeUuids.has(f.uuid) && f.level <= slot.level
        );
        if (!hasEligibleOwnedAtLevel) {
          scopeSelect.value = "archetype-dedications";
        }
      }

      return allFeats;
    },
    filterItems: (allFeats, { root, query, ctx }) => {
      const scope = root.querySelector(".pf2e-lp-picker-scope")?.value || defaultScope;
      const anyLvl = Boolean(root.querySelector(".pf2e-lp-picker-any-lvl")?.checked);
      const prereqsOnly = Boolean(root.querySelector(".pf2e-lp-picker-prereqs")?.checked);
      const matched = [];
      let eligibleCount = 0;
      let unmetCount = 0;

      for (const f of allFeats) {
        if (!anyLvl && f.level > effectiveMaxLevel) continue;
        if (f.category === "classfeature" || f.category === "ancestryfeature") continue;

        if (scope === "choiceset" && isChoiceSetMode) {
          const filterToUse = anyLvl
            ? (choiceSetSpec.filter || []).filter(stmt => {
              if (typeof stmt === "string" && stmt.startsWith("item:level:")) return false;
              if (stmt && typeof stmt === "object") {
                const pair = stmt.lte || stmt.lt || stmt.eq;
                if (Array.isArray(pair) && pair[0] === "item:level") return false;
              }
              return true;
            })
            : (choiceSetSpec.filter || []);
          if (!matchesChoiceSetFeatFilter(f, filterToUse, { actor, slotLevel: levelNum })) continue;
        } else if (scope === "class-only") {
          if (f.category !== "class") continue;
          if (slotTraits.length > 0 && !slotTraits.some(t => f.traits.includes(t))) continue;
        } else if (scope === "class-and-archetype") {
          const isMyClass = f.category === "class" && (slotTraits.length === 0 || slotTraits.some(t => f.traits.includes(t)));
          const isArchetype = f.traits.includes("archetype") || f.traits.includes("dedication");
          if (!isMyClass && !isArchetype) continue;
        } else if (scope === "my-archetypes") {
          if (!ctx.myArchetypeUuids.has(f.uuid)) continue;
        } else if (scope.startsWith("ded:")) {
          const set = ctx.perDedicationUuids[Number(scope.slice(4))];
          if (!set || !set.has(f.uuid)) continue;
        } else if (scope === "archetype-dedications") {
          if (!f.traits.includes("dedication") && !/\bdedication\b/i.test(f.name || "")) continue;
        } else if (scope === "archetype") {
          if (!f.traits.includes("archetype") && !f.traits.includes("dedication") && !/\bdedication\b/i.test(f.name || "")) continue;
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
          const querySlug = normalizeSlug(query);
          const traitQueryTerms = ANCESTRY_SEARCH_ALIASES[querySlug] || (querySlug && querySlug !== query ? [query, querySlug] : [query]);
          const matchesName = f.name.toLowerCase().includes(query);
          const matchesTrait = f.traits.some(t => traitQueryTerms.some(term => t.includes(term)));
          const matchesPrereq = f.prerequisites.some(p => p.toLowerCase().includes(query));
          if (!matchesName && !matchesTrait && !matchesPrereq) continue;
        }

        const evalRes = prereqState
          ? evaluateFeatPrerequisites(f, prereqState, ctx.allFeatNamesLower)
          : { met: true, unmetReasons: [] };

        if (evalRes.met) {
          eligibleCount++;
        } else {
          unmetCount++;
          if (prereqsOnly) continue;
        }

        matched.push({
          ...f,
          _prereqMet: evalRes.met,
          _prereqUnmetReasons: evalRes.unmetReasons
        });
      }

      ctx.prereqsOnly = prereqsOnly;
      ctx.eligibleCount = eligibleCount;
      ctx.unmetCount = unmetCount;

      return matched.sort((a, b) =>
        (a._prereqMet === b._prereqMet ? 0 : (a._prereqMet ? -1 : 1))
        || (b.level - a.level)
        || a.name.localeCompare(b.name)
      );
    },
    formatStatus: (total, ctx) => {
      const prefix = total > 120 ? `Showing top 120 of ${total}` : `${total}`;
      if (ctx.prereqsOnly && ctx.unmetCount > 0) {
        return `${prefix} eligible feat(s) (${ctx.unmetCount} hidden: prereqs not met)`;
      }
      if (!ctx.prereqsOnly && ctx.unmetCount > 0) {
        return `${prefix} matching feat(s) — ${ctx.eligibleCount} eligible first, ${ctx.unmetCount} prereqs not met at bottom`;
      }
      return total > 120
        ? `${prefix} matching feats — type to narrow search`
        : `${total} matching feat(s)`;
    },
    emptyText: (ctx) => ctx.prereqsOnly && ctx.unmetCount > 0
      ? `No feats match your current character sheet prerequisites (${ctx.unmetCount} hidden). Uncheck "Prereqs Met" above to browse all feats.`
      : `No feats match the current filter. Try switching filter scope or clearing search.`,
    renderRow: (f, idx) => {
      const prereqStr = f.prerequisites.length > 0 ? `Prereq: ${f.prerequisites.join(", ")}` : "";
      const traitStr = f.traits.slice(0, 4).join(" · ");
      const sub = [traitStr, prereqStr].filter(Boolean).join(" — ");
      const unmet = f._prereqMet === false;
      const unmetReasonsStr = unmet && f._prereqUnmetReasons?.length > 0
        ? f._prereqUnmetReasons.join(" · ")
        : "";
      return `
        <div class="pf2e-lp-picker-row ${unmet ? "is-prereq-unmet" : ""}">
          <img src="${esc(f.img)}" alt="" class="pf2e-lp-picker-img" />
          <div class="pf2e-lp-picker-info">
            <div class="pf2e-lp-picker-name-line">
              <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Open full feat sheet">${esc(f.name)}</a>
              <span class="pf2e-lp-picker-lvl">Lv ${f.level}</span>
              ${f.rarity && f.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(f.rarity)}">${esc(capitalize(f.rarity))}</span>` : ""}
              ${unmet ? `<span class="pf2e-lp-picker-unmet-badge" title="${esc(unmetReasonsStr ? `Missing: ${unmetReasonsStr}` : "Prerequisites not met")}">Prereq Not Met</span>` : ""}
            </div>
            ${unmetReasonsStr ? `<div class="pf2e-lp-picker-unmet-note">Missing: ${esc(unmetReasonsStr)}</div>` : ""}
            ${sub ? `<div class="pf2e-lp-picker-sub">${esc(sub)}</div>` : ""}
          </div>
          <button type="button" class="pf2e-lp-picker-select" data-idx="${idx}">Select</button>
        </div>
      `;
    },
    onSelect: async (chosen, helpers) => {
      await onSelectFeat?.(chosen, helpers);
    }
  });
}

/**
 * Lightweight Quick Picker for missing Level 1 Core Build items (Ancestry, Heritage, Background, Class, Deity).
 * Embeds the chosen item directly onto the actor so PF2e runs all its native Rule Elements & ChoiceSets cleanly!
 */
export function openCoreBuildQuickPickerDialog(actor, itemKey, { onDone } = {}) {
  const esc = foundry.utils.escapeHTML;
  const labels = {
    ancestry: { title: "Ancestry", icon: "fa-solid fa-dna" },
    heritage: { title: "Heritage", icon: "fa-solid fa-feather" },
    background: { title: "Background", icon: "fa-solid fa-scroll" },
    class: { title: "Class", icon: "fa-solid fa-shield-halved" },
    deity: { title: "Deity", icon: "fa-solid fa-sun" }
  };
  const meta = labels[itemKey];
  if (!actor || !meta) return;

  const actorAncSlug = actor.ancestry
    ? normalizeSlug(actor.ancestry.slug || actor.ancestry.system?.slug || actor.ancestry.name)
    : "";
  const isHeritage = itemKey === "heritage";

  const heritageScopeHtml = isHeritage
    ? `
      <select class="pf2e-lp-picker-scope" title="Filter heritages">
        ${actorAncSlug ? `<option value="matching" selected>${esc(actor.ancestry.name)} &amp; Versatile</option>` : ""}
        <option value="versatile" ${!actorAncSlug ? "selected" : ""}>Versatile Heritages</option>
        <option value="all">All Heritages</option>
      </select>
    `
    : "";

  openQuickPickerDialog({
    title: `Choose ${meta.title} — ${actor.name}`,
    icon: meta.icon,
    width: 600,
    closeAction: "close",
    closeLabel: "Close",
    closeIcon: "fa-solid fa-xmark",
    browseLabel: "PF2e Pack",
    browseTitle: `Open PF2e's native ${meta.title} Compendium Pack`,
    controlsHtml: `
      <input type="text" class="pf2e-lp-picker-search" placeholder="Search ${esc(meta.title)}..." autofocus />
      ${heritageScopeHtml}
    `,
    loadingText: `Loading PF2e ${meta.title.toLowerCase()} index...`,
    changeSelectors: isHeritage ? [".pf2e-lp-picker-scope"] : [],
    onBrowse: () => openNativePackForCoreBuild(itemKey),
    loadItems: () => getLightweightCoreBuildIndex(itemKey),
    filterItems: (allItems, { root, query }) => {
      const scope = isHeritage ? (root.querySelector(".pf2e-lp-picker-scope")?.value || (actorAncSlug ? "matching" : "versatile")) : "all";
      const matched = [];
      for (const item of allItems) {
        if (isHeritage) {
          if (scope === "matching" && !item.isVersatile && item.ancestrySlug !== actorAncSlug) continue;
          if (scope === "versatile" && !item.isVersatile) continue;
        }
        if (query && !item.name.toLowerCase().includes(query) && !item.traits.some(t => t.includes(query)) && !(item.ancestryName && item.ancestryName.toLowerCase().includes(query))) {
          continue;
        }
        matched.push(item);
      }
      if (isHeritage && scope === "matching") {
        // Put ancestry-specific heritages first, then versatile heritages
        return matched.sort((a, b) => (Number(a.isVersatile) - Number(b.isVersatile)) || a.name.localeCompare(b.name));
      }
      return matched;
    },
    formatStatus: (total) => total > 120
      ? `Showing top 120 of ${total} matching options — type to narrow search`
      : `${total} option(s) available — click Select to add directly to ${actor.name}`,
    emptyText: `No matching ${meta.title.toLowerCase()} options found. Try clearing search or opening the PF2e Pack.`,
    renderRow: (item, idx) => {
      const subParts = [];
      if (isHeritage) subParts.push(item.isVersatile ? "Versatile Heritage" : (item.ancestryName || capitalize(item.ancestrySlug)));
      if (item.traits.length > 0) subParts.push(item.traits.slice(0, 4).join(" · "));
      const sub = subParts.filter(Boolean).join(" — ");
      return `
        <div class="pf2e-lp-picker-row">
          <img src="${esc(item.img)}" alt="" class="pf2e-lp-picker-img" />
          <div class="pf2e-lp-picker-info">
            <div class="pf2e-lp-picker-name-line">
              <a class="pf2e-lp-picker-inspect" data-idx="${idx}" title="Inspect full rules">${esc(item.name)}</a>
              ${item.rarity && item.rarity !== "common" ? `<span class="pf2e-lp-picker-rarity rarity-${esc(item.rarity)}">${esc(capitalize(item.rarity))}</span>` : ""}
            </div>
            ${sub ? `<div class="pf2e-lp-picker-sub">${esc(sub)}</div>` : ""}
          </div>
          <button type="button" class="pf2e-lp-picker-select" data-idx="${idx}">Select</button>
        </div>
      `;
    },
    onSelect: async (chosen, { dialog }) => {
      dialog.close();
      const created = await embedLiveCoreItem(actor, chosen.uuid, itemKey);
      if (created) {
        ui.notifications?.info(`Added ${meta.title} "${created.name}" to ${actor.name}!`);
        onDone?.(created);
      }
    }
  });
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
      template: `modules/${MODULE_ID}/templates/level-planner.hbs`,
      scrollable: [".pf2e-lp-scroll", ".pf2e-lp-level-list"]
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
    if (selectedActor) {
      await preloadPlannerProjectionData(selectedActor);
    }
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
            hasBoosts: l.hasBoosts,
            hasIntBonus: l.hasIntBonus,
            hasSkillIncrease: l.hasSkillIncrease,
            hasSpellMilestones: Boolean(l.hasSpellMilestones || l.hasAutoGrantedSpells || l.hasSubclassSpellChoices),
            isAlchemistFutureGain: l.isAlchemistFutureGain,
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
          showLevel1IncompleteBanner: Boolean(
            rawFocused.level === 1
            && rawFocused.isCurrent
            && Number(roadmap.checkerReport?.actionableMissingCount || 0) > 0
          ),
          level1MissingCount: Number(roadmap.checkerReport?.actionableMissingCount || 0),
          revertRangeLabel: formatLevelRange(rawFocused.level + 1, roadmap.currentLevel, { prefix: "" }),
          canStepPrev: rawFocused.level > 1,
          canStepNext: rawFocused.level < 20,
          prevLevel: Math.max(1, rawFocused.level - 1),
          nextStepLevel: Math.min(20, rawFocused.level + 1),
          showSpellsPanel: Boolean(
            rawFocused.hasSpellMilestones
            || rawFocused.hasAutoGrantedSpells
            || rawFocused.hasSubclassSpellChoices
            || rawFocused.hasPlannedSpells
            || (rawFocused.isFuture && hasAnySpellcasting)
          ),
          showFormulasPanel: Boolean(rawFocused.hasFormulaMilestone || rawFocused.hasPlannedFormulas),
          defaultSpellTradition: defaultTrad,
          defaultSpellEntryKey: defaultEntryKey,
          defaultSpellMaxRank: defaultMaxRank,
          defaultSpellUnlockRank: defaultUnlockRank,
          plannedSpellsDisplay: (rawFocused.plannedSpells || []).map(sp => ({
            ...sp,
            rankLabel: sp.isCantrip ? "Cantrip" : `Rank ${sp.rank || 1}`
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
          featsSummary: l.featSlots.map(s => {
            const subNames = (s.subChoices || []).filter(c => c.filled && c.selection?.name).map(c => c.selection.name);
            return {
              slotLabel: s.groupLabel,
              featName: s.feat?.name
                ? (subNames.length > 0 ? `${s.feat.name} → ${subNames.join(", ")}` : s.feat.name)
                : null,
              filled: s.filled,
              hasWarnings: s.hasWarnings
            };
          }),
          plannedSpellsCount: l.plannedSpells.length,
          autoSpellsText: l.hasAutoGrantedSpells
            ? `Auto: ${l.autoGrantedSpells.map(s => s.name).join(", ")}`
            : "",
          formulasText: l.isAlchemistFutureGain
            ? `Formulas: ${l.plannedFormulasCount}/${l.formulaMilestone?.gain || 2} (+${l.formulaMilestone?.gain || 2} free)`
            : (l.hasPlannedFormulas ? `${l.plannedFormulasCount} planned formula(s)` : "")
        }));

      for (const l of roadmap.levels) {
        for (const s of l.featSlots) {
          if (!s.feat) continue;
          const subSummary = (s.subChoices || []).filter(c => c.filled && c.selection?.name && !c.selection?.isFeat).map(c => c.selection.name);
          summaryFeats.push({
            level: l.level,
            isFuture: l.isFuture,
            groupLabel: s.groupLabel,
            name: subSummary.length > 0 ? `${s.feat.name} (${subSummary.join(", ")})` : s.feat.name,
            uuid: s.feat.uuid,
            img: s.feat.img || "systems/pf2e/icons/default-icons/feat.svg",
            hasWarnings: Boolean(s.hasWarnings),
            warningText: (s.warnings || []).join("; ")
          });
          for (const sc of s.subChoices || []) {
            if (sc.filled && sc.selection?.isFeat && sc.selection?.name) {
              summaryFeats.push({
                level: l.level,
                isFuture: l.isFuture,
                groupLabel: `↳ ${s.feat.name}`,
                name: sc.selection.name,
                uuid: sc.selection.uuid,
                img: sc.selection.img || "systems/pf2e/icons/default-icons/feat.svg",
                hasWarnings: false,
                warningText: ""
              });
            }
          }
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

    // 4B. Planned Feat Sub-Choice Dropdowns (e.g. Skill Training, Canny Acumen, static ChoiceSets)
    container.querySelectorAll(".pf2e-lp-subchoice-select").forEach(sel => {
      sel.addEventListener("change", async (e) => {
        const actor = this._getSelectedActor();
        if (!actor) return;
        const levelNum = Number(e.target.dataset.level || this._selectedLevel);
        const slotKey = e.target.dataset.slotKey;
        const choiceFlag = e.target.dataset.choiceFlag;
        const val = String(e.target.value || "");
        if (!levelNum || !slotKey || !choiceFlag) return;

        if (!val) {
          await clearPlannedFeatChoice(actor, levelNum, slotKey, choiceFlag);
          this.render({ force: false });
          return;
        }

        const optEl = e.target.selectedOptions?.[0];
        const label = String(optEl?.textContent || val).trim();
        const isUuid = /^(?:Compendium\.[^.]+\.[^.]+\.|Item\.)/i.test(val);
        let featSnap = null;
        if (isUuid) {
          featSnap = await warmPlannerItemMeta(val);
        }

        await updatePlannedLevelData(actor, levelNum, (entry) => {
          const fObj = entry.feats?.[slotKey];
          if (!fObj) return;
          if (!fObj.choices || typeof fObj.choices !== "object") fObj.choices = {};
          fObj.choices[choiceFlag] = {
            value: val,
            name: featSnap?.name || label,
            img: featSnap?.img || "systems/pf2e/icons/default-icons/feat.svg",
            level: featSnap?.level ?? null,
            isFeat: Boolean(isUuid),
            isDedication: Boolean(featSnap?.traits?.includes("dedication") || /\bdedication\b/i.test(featSnap?.name || "")),
            prerequisites: []
          };
        });
        this.render({ force: false });
      });
    });

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
        if (actor?.sheet) actor.sheet.render({ force: true });
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
        const lvlRow = roadmap?.levels?.find(l => l.level === levelNum);
        const slot = lvlRow?.featSlots?.find(s => s.slotKey === slotKey);
        if (slot) {
          await this._openFeatQuickPicker(actor, levelNum, slot, lvlRow?.prereqState || null);
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

      case "pick-feat-choice": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const slotKey = el.dataset.slotKey;
        const choiceFlag = el.dataset.choiceFlag;
        if (!levelNum || !slotKey || !choiceFlag) return;
        await preloadPlannerProjectionData(actor);
        const roadmap = buildLevelRoadmap(actor);
        const lvlRow = roadmap?.levels?.find(l => l.level === levelNum);
        const slot = lvlRow?.featSlots?.find(s => s.slotKey === slotKey);
        const spec = slot?.subChoices?.find(c => c.flag === choiceFlag);
        if (slot && spec?.isFeatQuery) {
          await this._openFeatChoiceQuickPicker(actor, levelNum, slot, spec, lvlRow?.prereqState || null);
        }
        break;
      }

      case "clear-feat-choice": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const slotKey = el.dataset.slotKey;
        const choiceFlag = el.dataset.choiceFlag;
        if (!levelNum || !slotKey || !choiceFlag) return;
        await clearPlannedFeatChoice(actor, levelNum, slotKey, choiceFlag);
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

      case "plan-choice-spell": {
        if (!actor) return;
        const levelNum = Number(el.dataset.level);
        const uuid = el.dataset.uuid;
        const name = el.dataset.name || "Spell";
        const img = el.dataset.img || "systems/pf2e/icons/default-icons/spell.svg";
        const isCantrip = el.dataset.isCantrip === "1";
        const rank = isCantrip ? 0 : Math.max(1, Number(el.dataset.rank || 1));
        const entryKey = el.dataset.entryKey || "";
        const tradition = el.dataset.tradition || "";
        const isCurriculumPick = el.dataset.isCurriculum === "1";
        if (!levelNum || !uuid || levelNum <= (actor.level || 1)) return;

        let removed = false;
        const uuidLower = uuid.toLowerCase();
        const nameLower = String(name || "").trim().toLowerCase();
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          const list = Array.isArray(entry.spells) ? entry.spells : [];
          const existingIdx = list.findIndex(s => {
            if (String(s?.uuid || "").toLowerCase() === uuidLower) return true;
            const sName = String(s?.name || "").trim().toLowerCase();
            if (!nameLower || sName !== nameLower) return false;
            return Boolean(s?.isCantrip) === isCantrip && (isCantrip || Number(s?.rank || 1) === rank);
          });
          if (existingIdx >= 0) {
            list.splice(existingIdx, 1);
            removed = true;
          } else {
            list.push({
              id: foundry.utils.randomID(8),
              uuid,
              name,
              img,
              rank,
              isCantrip,
              tradition,
              entryKey,
              isCurriculumPick
            });
          }
          entry.spells = list;
        });

        ui.notifications?.info(
          removed
            ? `Removed "${name}" from Level ${levelNum} plan.`
            : `Planned "${name}" for Level ${levelNum}!`
        );
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

    await setPlannedFeatSnapshot(actor, levelNum, slotKey, snapshot);
    await warmPlannerItemMeta(doc.uuid);

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

  _openQuickPickerDialog(config) {
    return openQuickPickerDialog(config);
  }

  async _openFeatQuickPicker(actor, levelNum, slot, rawPrereqState = null) {
    return openFeatQuickPickerDialog(actor, levelNum, slot, {
      prereqState: rawPrereqState,
      onSelectFeat: async (chosen, { dialog }) => {
        const snapshot = {
          uuid: chosen.uuid,
          name: chosen.name,
          img: chosen.img,
          level: chosen.level,
          category: chosen.category,
          isDedication: Boolean(chosen.traits?.includes("dedication") || /\bdedication\b/i.test(chosen.name || "")),
          prerequisites: chosen.prerequisites || []
        };
        await setPlannedFeatSnapshot(actor, levelNum, slot.slotKey, snapshot);
        await warmPlannerItemMeta(chosen.uuid);
        ui.notifications?.info(`Planned "${chosen.name}" for Level ${levelNum} (${slot.groupLabel}).`);
        dialog.close();
        this.render({ force: false });
      }
    });
  }

  async _openFeatChoiceQuickPicker(actor, levelNum, slot, choiceSetSpec, rawPrereqState = null) {
    return openFeatQuickPickerDialog(actor, levelNum, slot, {
      prereqState: rawPrereqState,
      choiceSetSpec,
      onSelectFeat: async (chosen, { dialog }) => {
        await updatePlannedLevelData(actor, levelNum, (entry) => {
          const fObj = entry.feats?.[slot.slotKey];
          if (!fObj) return;
          if (!fObj.choices || typeof fObj.choices !== "object") fObj.choices = {};
          fObj.choices[choiceSetSpec.flag] = {
            value: chosen.uuid,
            name: chosen.name,
            img: chosen.img,
            level: chosen.level,
            isFeat: true,
            isDedication: Boolean(chosen.traits?.includes("dedication") || /\bdedication\b/i.test(chosen.name || "")),
            prerequisites: chosen.prerequisites || []
          };
        });
        await warmPlannerItemMeta(chosen.uuid);
        ui.notifications?.info(`Planned "${chosen.name}" for ${slot.feat?.name || slot.groupLabel} (Level ${levelNum}).`);
        dialog.close();
        this.render({ force: false });
      }
    });
  }

  async _openSpellQuickPicker(actor, levelNum, { tradition = "", entryKey = "", maxRank = 1, unlockedNewRank = 0 } = {}) {
    const esc = foundry.utils.escapeHTML;
    const defaultRankVal = unlockedNewRank > 0 ? String(unlockedNewRank) : "upto";
    const rankOpts = [
      `<option value="upto" ${defaultRankVal === "upto" ? "selected" : ""}>All Ranks ≤ ${maxRank}</option>`,
      `<option value="cantrip">Cantrips</option>`
    ];
    for (let r = 1; r <= 10; r++) {
      rankOpts.push(`<option value="${r}" ${defaultRankVal === String(r) ? "selected" : ""}>Rank ${r}</option>`);
    }
    const tradOpts = [
      `<option value="" ${!tradition ? "selected" : ""}>All Traditions</option>`,
      ...Object.entries(TRADITION_LABELS).map(([k, lbl]) =>
        `<option value="${k}" ${tradition === k ? "selected" : ""}>${lbl}</option>`
      )
    ];

    this._openQuickPickerDialog({
      title: `Plan Spells — Level ${levelNum}`,
      icon: "fa-solid fa-hat-wizard",
      showGoal: true,
      controlsHtml: `
        <input type="text" class="pf2e-lp-picker-search" placeholder="Search spells to plan for Level ${levelNum}..." autofocus />
        <select class="pf2e-lp-picker-trad" title="Spell Tradition">${tradOpts.join("")}</select>
        <select class="pf2e-lp-picker-rank" title="Spell Rank">${rankOpts.join("")}</select>
      `,
      loadingText: "Loading lightweight spell index...",
      changeSelectors: [".pf2e-lp-picker-trad", ".pf2e-lp-picker-rank"],
      onBrowse: (root) => openNativeBrowserForSpells({
        tradition: root.querySelector(".pf2e-lp-picker-trad")?.value || tradition,
        maxRank,
        unlockedNewRank
      }),
      onReady: (root) => {
        const goalEl = root.querySelector(".pf2e-lp-picker-goal");
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

        const knownSpellUuids = new Set();
        const knownSpellNames = new Set();
        for (const sp of actor.itemTypes?.spell || []) {
          const src = sp._stats?.compendiumSource || sp.flags?.core?.sourceId;
          if (src) knownSpellUuids.add(src);
          if (sp.name) knownSpellNames.add(String(sp.name).toLowerCase());
        }
        const levelPlan = getActorLevelPlan(actor).levels[String(levelNum)];
        const addedUuids = new Set((levelPlan?.spells || []).map(s => s?.uuid).filter(Boolean));
        return { updateGoalBanner, knownSpellUuids, knownSpellNames, addedUuids };
      },
      loadItems: () => getLightweightSpellIndex(),
      filterItems: (allSpells, { root, query }) => {
        const trad = root.querySelector(".pf2e-lp-picker-trad")?.value || "";
        const rankFilter = root.querySelector(".pf2e-lp-picker-rank")?.value || "upto";
        const matched = [];
        for (const sp of allSpells) {
          if (sp.isRitual && (trad || !query)) continue;
          if (trad && !sp.traditions.includes(trad)) continue;
          if (rankFilter === "cantrip") {
            if (!sp.isCantrip) continue;
          } else if (rankFilter === "upto") {
            if (sp.isCantrip || sp.rank > maxRank) continue;
          } else {
            if (sp.isCantrip || sp.rank !== Number(rankFilter)) continue;
          }
          if (query && !sp.name.toLowerCase().includes(query)) continue;
          matched.push(sp);
        }
        return matched.sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name));
      },
      formatStatus: (total) => total > 120
        ? `Showing top 120 of ${total} matching spells — type to narrow search`
        : `${total} matching spell(s) — click Add to bookmark multiple`,
      emptyText: "No spells match the current filter. Try switching Tradition or Rank filter above.",
      renderRow: (sp, idx, ctx) => {
        const isAdded = ctx.addedUuids.has(sp.uuid);
        const isKnown = ctx.knownSpellUuids.has(sp.uuid) || ctx.knownSpellNames.has(String(sp.name || "").toLowerCase());
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
      },
      onSelect: async (chosen, { btn, root, ctx }) => {
        const chosenTrad = root.querySelector(".pf2e-lp-picker-trad")?.value || tradition || chosen.traditions[0] || "";
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
        ctx.addedUuids.add(chosen.uuid);
        btn.classList.add("is-added");
        btn.textContent = "Added ✓";
        ctx.updateGoalBanner();
        this.render({ force: false });
      }
    });
  }

  async _openFormulaQuickPicker(actor, levelNum) {
    const esc = foundry.utils.escapeHTML;

    this._openQuickPickerDialog({
      title: `Plan Alchemical Formulas — Level ${levelNum}`,
      icon: "fa-solid fa-flask",
      controlsHtml: `
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
      `,
      loadingText: "Loading lightweight equipment index...",
      changeSelectors: [".pf2e-lp-picker-scope", ".pf2e-lp-picker-any-lvl"],
      onBrowse: () => openNativeBrowserForFormulas({ maxLevel: levelNum }),
      onReady: () => {
        const knownSheetUuids = new Set(
          (Array.isArray(actor.system?.crafting?.formulas) ? actor.system.crafting.formulas : [])
            .map(f => f?.uuid)
            .filter(Boolean)
        );
        const levelPlan = getActorLevelPlan(actor).levels[String(levelNum)];
        const plannedOnThisLevel = new Set((levelPlan?.formulas || []).map(f => f?.uuid).filter(Boolean));
        return { knownSheetUuids, plannedOnThisLevel };
      },
      loadItems: () => getLightweightFormulaIndex(),
      filterItems: (allItems, { root, query }) => {
        const scope = root.querySelector(".pf2e-lp-picker-scope")?.value || "common-alchemical-consumables";
        const anyLvl = Boolean(root.querySelector(".pf2e-lp-picker-any-lvl")?.checked);
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
        return matched.sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));
      },
      formatStatus: (total) => total > 120
        ? `Showing top 120 of ${total} matching formulas — type to narrow search`
        : `${total} matching formula(s) — click Add to bookmark for Level ${levelNum}`,
      emptyText: "No matching items found. Try clearing search or changing filter scope.",
      renderRow: (item, idx, ctx) => {
        const isAdded = ctx.plannedOnThisLevel.has(item.uuid);
        const isKnown = ctx.knownSheetUuids.has(item.uuid);
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
      },
      onSelect: async (chosen, { btn, ctx }) => {
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
        ctx.plannedOnThisLevel.add(chosen.uuid);
        btn.classList.add("is-added");
        btn.textContent = "Added ✓";
        this.render({ force: false });
      }
    });
  }

  /* ----------------------------------------------------------------------- */
  /* GUIDED LEVEL-UP CONFIRMATION & EXECUTION                                */
  /* ----------------------------------------------------------------------- */

  async _confirmDialog({ title, content, yesLabel = "Confirm" }) {
    return Boolean(await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      yes: { label: yesLabel },
      no: { label: "Cancel" },
      rejectClose: false
    }));
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
        notifyAppliedLevelChoices(actor, res, {
          headline: `${actor.name} reached Level ${res.newLevel}!`,
          reminderPrefix: `Level ${res.newLevel}`
        });
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
    const DialogV2 = foundry.applications.api.DialogV2;

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
      const rangeStr = formatLevelRange(t + 1, currentLevel);
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
        const rangeLabel = formatLevelRange(state.targetLevel + 1, currentLevel);

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
              <span>Remove ${t.formulasCount} tracked / ${esc(rangeLabel)} Formula${t.formulasCount === 1 ? "" : "s"}</span>
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

        await preloadPlannerProjectionData(actor, { effectiveCurrentLevel: prevLevel });
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

        const rangeLabel = formatLevelRange(prevLevel + 1, newLevel, { prefix: "Level", pluralPrefix: "Levels" });
        const hasAnythingToApply = inspection.hasPlannedChoicesInRange
          || inspection.levels.some(ls => ls.lvlData?.hasSpellMilestones || ls.lvlData?.hasAutoGrantedSpells);

        const content = `
          <div class="pf2e-lp-confirm-body">
            <p><strong>${esc(actor.name)}</strong> leveled up directly on the sheet (<strong>Lv ${prevLevel} → Lv ${newLevel}</strong>).${hasAnythingToApply
            ? ` Would you like to apply your saved Level Planner choices for <strong>${esc(rangeLabel)}</strong>?`
            : ` Your Level Planner has saved levels for this character, but <strong>${esc(rangeLabel)}</strong> isn't filled out yet.`
          }</p>
            ${levelBlocks.join("")}
            ${hasAnythingToApply ? `<p style="font-size:0.85em;opacity:0.82;margin:6px 0 0 0;">Already-filled slots or boosts on your live sheet will not be overwritten.</p>` : ""}
          </div>
        `;

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

        const choice = await foundry.applications.api.DialogV2.wait({
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

        if (choice === "apply") {
          const res = await applyPlannedLevelChoices(actor, targetLevels, {
            updateActorLevel: false,
            effectiveCurrentLevel: prevLevel
          });
          if (res.ok) {
            notifyAppliedLevelChoices(actor, res, {
              headline: `Applied Level Planner choices for ${actor.name} (${rangeLabel})!`,
              reminderPrefix: rangeLabel
            });
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
