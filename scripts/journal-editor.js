/**
 * PF2e Awesome GM Utilities - Advanced Journal Editor & AP Styler
 * Provides Adventure Path (AP) formatting templates, rich entity/scene link cards,
 * and quick skill check tables directly in Foundry's ProseMirror journal editor.
 */

import { MODULE_ID, JOURNAL_AP_TEMPLATES } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class JournalTemplateDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static _activeDialog = null;

  static DEFAULT_OPTIONS = {
    id: "pf2e-journal-template-dialog",
    tag: "dialog",
    classes: ["pf2e-gm-utility", "pf2e-journal-dialog"],
    window: {
      title: "PF2e AP Journal Editor & Styler",
      icon: "fa-solid fa-feather-pointed",
      resizable: true,
      controls: []
    },
    position: {
      width: 780,
      height: 600
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-awesome-gm-utilities/templates/journal-template-dialog.hbs"
    }
  };

  constructor(options = {}) {
    super(options);
    this.targetMenu = options.menu || null;
    this.targetView = options.view || options.menu?.view || null;

    this.activeTab = "templates"; // 'templates' | 'entities' | 'checks'
    this.templateCategory = "all";
    this.selectedTemplateId = "read-aloud";

    this.entityQuery = "";
    this.entityType = "all";
    this.selectedEntityUuid = null;
    this.entityFormat = "scene-card";

    this.checkData = {
      skill: "perception",
      dc: 20,
      purpose: "to Search the Archives",
      format: "table",
      traits: ""
    };
  }

  /**
   * Singleton open method. Ensures existing dialog is focused or created.
   * @param {object} [options]
   * @returns {JournalTemplateDialog}
   */
  static open(options = {}) {
    if (this._activeDialog && this._activeDialog.rendered) {
      this._activeDialog.targetMenu = options.menu || this._activeDialog.targetMenu;
      this._activeDialog.targetView = options.view || options.menu?.view || this._activeDialog.targetView;
      this._activeDialog.bringToFront();
      return this._activeDialog;
    }
    const dialog = new JournalTemplateDialog(options);
    this._activeDialog = dialog;
    dialog.render({ force: true });
    return dialog;
  }

  /* ------------------------------------------------------------------------- */
  /*  Data Preparation                                                         */
  /* ------------------------------------------------------------------------- */

  async _prepareContext(options = {}) {
    // 1. Templates Filter
    let filteredTemplates = JOURNAL_AP_TEMPLATES;
    if (this.templateCategory !== "all") {
      filteredTemplates = JOURNAL_AP_TEMPLATES.filter(t => t.category === this.templateCategory);
    }

    // 2. Entities Search
    const entities = this._searchEntities();
    if (!this.selectedEntityUuid && entities.length > 0) {
      this.selectedEntityUuid = entities[0].uuid;
    }
    const selectedEntity = this.selectedEntityUuid ? this._resolveEntity(this.selectedEntityUuid) : null;

    // Adjust default format if entity type changes
    if (selectedEntity) {
      if (selectedEntity.type === "Scene" && this.entityFormat !== "inline") this.entityFormat = "scene-card";
      else if (selectedEntity.type === "Actor" && this.entityFormat !== "inline") this.entityFormat = "creature-card";
      else if (selectedEntity.type === "Item" && this.entityFormat !== "inline") this.entityFormat = "item-card";
      else if (selectedEntity.type === "JournalEntry") this.entityFormat = "inline";
    }

    // 3. Live Preview HTML Generation
    const renderedPreviewHtml = await this._generatePreviewHtml(selectedEntity);

    return {
      activeTab: this.activeTab,
      templateCategory: this.templateCategory,
      templates: filteredTemplates,
      selectedTemplateId: this.selectedTemplateId,
      entityQuery: this.entityQuery,
      entityType: this.entityType,
      entities: entities.slice(0, 40),
      selectedEntityUuid: this.selectedEntityUuid,
      selectedEntity: selectedEntity,
      entityFormat: this.entityFormat,
      checkData: this.checkData,
      renderedPreviewHtml: renderedPreviewHtml
    };
  }

  /* ------------------------------------------------------------------------- */
  /*  Entity Search & Resolution                                               */
  /* ------------------------------------------------------------------------- */

  _searchEntities() {
    const query = (this.entityQuery || "").trim().toLowerCase();
    const typeFilter = this.entityType;
    const results = [];

    // Helper to test name matching
    const matches = (doc) => !query || (doc.name || "").toLowerCase().includes(query);

    // Scenes
    if (typeFilter === "all" || typeFilter === "Scene") {
      for (const scene of game.scenes || []) {
        if (matches(scene)) {
          results.push({
            uuid: scene.uuid,
            id: scene.id,
            name: scene.name,
            type: "Scene",
            typeLabel: "Scene / Map",
            icon: "fa-solid fa-map-location-dot",
            img: scene.thumb || scene.background?.src || "icons/svg/castle.svg"
          });
        }
      }
    }

    // Actors
    if (typeFilter === "all" || typeFilter === "Actor") {
      for (const actor of game.actors || []) {
        if (matches(actor)) {
          results.push({
            uuid: actor.uuid,
            id: actor.id,
            name: actor.name,
            type: "Actor",
            typeLabel: `${actor.type.capitalize()} (Lvl ${actor.level ?? actor.system?.details?.level?.value ?? 0})`,
            icon: actor.type === "character" ? "fa-solid fa-user-ninja" : "fa-solid fa-dragon",
            img: actor.img || "icons/svg/mystery-man.svg"
          });
        }
      }
    }

    // Items
    if (typeFilter === "all" || typeFilter === "Item") {
      for (const item of game.items || []) {
        if (matches(item)) {
          results.push({
            uuid: item.uuid,
            id: item.id,
            name: item.name,
            type: "Item",
            typeLabel: `${item.type.capitalize()} (Lvl ${item.system?.level?.value ?? 0})`,
            icon: "fa-solid fa-shield-halved",
            img: item.img || "icons/svg/item-bag.svg"
          });
        }
      }
    }

    // Journals
    if (typeFilter === "all" || typeFilter === "JournalEntry") {
      for (const j of game.journal || []) {
        if (matches(j)) {
          results.push({
            uuid: j.uuid,
            id: j.id,
            name: j.name,
            type: "JournalEntry",
            typeLabel: "Journal",
            icon: "fa-solid fa-book-open",
            img: "icons/svg/book.svg"
          });
        }
      }
    }

    return results;
  }

  _resolveEntity(uuid) {
    if (!uuid) return null;
    const doc = fromUuidSync(uuid);
    if (!doc) return null;
    return {
      uuid: doc.uuid,
      id: doc.id,
      name: doc.name,
      type: doc.documentName,
      doc: doc
    };
  }

  /* ------------------------------------------------------------------------- */
  /*  Live Preview & HTML Generators                                           */
  /* ------------------------------------------------------------------------- */

  async _generatePreviewHtml(selectedEntity) {
    if (this.activeTab === "templates") {
      const template = JOURNAL_AP_TEMPLATES.find(t => t.id === this.selectedTemplateId);
      if (!template) return "<p>Select a template on the left.</p>";
      // Strip <selection> markers for visual preview
      const cleanHtml = template.html.replace(/<\/?selection>/gi, "");
      return cleanHtml;
    }

    if (this.activeTab === "entities") {
      if (!selectedEntity || !selectedEntity.doc) {
        return "<p style='color: #64748b;'>Select an entity on the left to preview.</p>";
      }
      return this._generateEntityHtml(selectedEntity.doc, this.entityFormat);
    }

    if (this.activeTab === "checks") {
      return this._generateCheckHtml(this.checkData);
    }

    return "<p>No preview available.</p>";
  }

  _generateEntityHtml(doc, format) {
    const uuid = doc.uuid;
    const name = doc.name;

    // 1. Simple Inline Link
    if (format === "inline") {
      return `<p>@UUID[${uuid}]{${name}}</p>`;
    }

    // 2. Scene / Battle Map Card
    if (doc.documentName === "Scene") {
      const thumb = doc.thumb || doc.background?.src || "icons/svg/castle.svg";
      const navName = doc.navName || doc.name;
      const darkness = doc.environment?.darknessLevel ?? doc.darkness ?? 0;
      const lightingText = darkness > 0.5 ? "Dark / Night" : "Bright / Day";

      return `<section class="pf2e-ap-card pf2e-scene-card" data-scene-id="${doc.id}" data-scene-uuid="${uuid}">
  <div class="pf2e-scene-card-header">
    <div class="pf2e-scene-card-thumb" style="background-image: url('${thumb}');"></div>
    <div class="pf2e-scene-card-info">
      <h4 class="pf2e-scene-card-title">@UUID[${uuid}]{${name}}</h4>
      <span class="pf2e-scene-card-type"><i class="fa-solid fa-compass"></i> ${navName} &bull; ${lightingText}</span>
    </div>
  </div>
</section>`;
    }

    // 3. Creature / Actor Roster Card
    if (doc.documentName === "Actor") {
      const portrait = doc.img || "icons/svg/mystery-man.svg";
      const level = doc.level ?? doc.system?.details?.level?.value ?? 0;
      const traits = doc.system?.traits?.value || [];
      const traitsHtml = traits.slice(0, 4).map(t => `<span class="pf2e-trait-pill">${t}</span>`).join(" ");
      const ac = doc.attributes?.ac?.value ?? doc.system?.attributes?.ac?.value ?? 10;
      const hp = doc.system?.attributes?.hp?.max ?? doc.system?.attributes?.hp?.value ?? 10;
      const per = doc.system?.perception?.mod !== undefined ? (doc.system.perception.mod >= 0 ? `+${doc.system.perception.mod}` : doc.system.perception.mod) : "+0";

      return `<section class="pf2e-ap-card pf2e-creature-card" data-actor-uuid="${uuid}">
  <div class="pf2e-creature-card-portrait" style="background-image: url('${portrait}');"></div>
  <div class="pf2e-creature-card-details">
    <div class="pf2e-creature-card-name-row">
      <h4 class="pf2e-creature-card-name">@UUID[${uuid}]{${name}}</h4>
      <span class="pf2e-creature-level-badge">Level ${level}</span>
    </div>
    ${traitsHtml ? `<div class="pf2e-creature-traits">${traitsHtml}</div>` : ""}
    <div class="pf2e-creature-stats">
      <span><strong>AC:</strong> ${ac}</span>
      <span><strong>HP:</strong> ${hp}</span>
      <span><strong>Perception:</strong> ${per}</span>
    </div>
  </div>
</section>`;
    }

    // 4. Item / Loot Card
    if (doc.documentName === "Item") {
      const img = doc.img || "icons/svg/item-bag.svg";
      const level = doc.system?.level?.value ?? 0;
      const rarity = doc.system?.traits?.rarity || "common";
      const price = doc.system?.price?.value ? `${doc.system.price.value.gp || 0} gp` : "Special";
      const rawDesc = doc.system?.description?.value || "";
      const textSummary = rawDesc.replace(/<[^>]*>/g, "").slice(0, 140).trim();

      return `<section class="pf2e-ap-card pf2e-item-card" data-item-uuid="${uuid}">
  <img class="pf2e-item-card-img" src="${img}" alt="${name}">
  <div class="pf2e-item-card-details">
    <div class="pf2e-item-card-header">
      <h4 class="pf2e-item-card-title">@UUID[${uuid}]{${name}}</h4>
      <span class="pf2e-item-level-badge">Item ${level}</span>
    </div>
    <div class="pf2e-item-meta">
      <span class="pf2e-item-price">${price}</span>
      <span class="pf2e-trait-pill">${rarity}</span>
    </div>
    ${textSummary ? `<div class="pf2e-item-desc">${textSummary}...</div>` : ""}
  </div>
</section>`;
    }

    // Fallback: Inline Link
    return `<p>@UUID[${uuid}]{${name}}</p>`;
  }

  _generateCheckHtml(checkData) {
    const { skill, dc, purpose, format, traits } = checkData;
    const traitPart = traits ? `|traits:${traits.toLowerCase().replace(/\s+/g, "")}` : "";
    const purposeText = purpose ? ` ${purpose}` : "";
    const checkTag = `@Check[${skill}|dc:${dc}${traitPart}]`;

    if (format === "inline") {
      return `<p><strong>Check:</strong> ${checkTag}${purposeText}</p>`;
    }

    return `<table class="pf2e-check-table">
  <thead>
    <tr>
      <th colspan="2">${checkTag}${purposeText}</th>
    </tr>
  </thead>
  <tbody>
    <tr class="crit-success">
      <td><strong>Critical Success</strong></td>
      <td>You achieve complete success with outstanding results and unexpected advantages.</td>
    </tr>
    <tr class="success">
      <td><strong>Success</strong></td>
      <td>You accomplish your goal smoothly.</td>
    </tr>
    <tr class="failure">
      <td><strong>Failure</strong></td>
      <td>You do not succeed, but suffer no catastrophic setback.</td>
    </tr>
    <tr class="crit-failure">
      <td><strong>Critical Failure</strong></td>
      <td>You fail completely and trigger a complication, hazard, or alarm.</td>
    </tr>
  </tbody>
</table>`;
  }

  /* ------------------------------------------------------------------------- */
  /*  Insertion Execution                                                      */
  /* ------------------------------------------------------------------------- */

  async _executeInsert() {
    let htmlToInsert = "";

    if (this.activeTab === "templates") {
      const template = JOURNAL_AP_TEMPLATES.find(t => t.id === this.selectedTemplateId);
      if (!template) return;
      htmlToInsert = template.html;
    } else if (this.activeTab === "entities") {
      const entity = this.selectedEntityUuid ? this._resolveEntity(this.selectedEntityUuid) : null;
      if (!entity || !entity.doc) {
        ui.notifications.warn("Please select an entity first.");
        return;
      }
      htmlToInsert = this._generateEntityHtml(entity.doc, this.entityFormat);
    } else if (this.activeTab === "checks") {
      htmlToInsert = this._generateCheckHtml(this.checkData);
    }

    if (!htmlToInsert) return;

    // 1. Try to find active ProseMirror editor view
    const view = this._findActiveEditorView();
    if (view) {
      try {
        this._insertHtmlIntoView(view, htmlToInsert);
        ui.notifications.info("Inserted AP template into journal!");
        this.close();
        return;
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Failed to insert HTML into ProseMirror view:", err);
      }
    }

    // 2. Check for active HTML Source Editor (<textarea class="source-editor">)
    const activeTextarea = document.querySelector(".editor:focus-within textarea.source-editor, .journal-entry-page:focus-within textarea, textarea.source-editor");
    if (activeTextarea) {
      const start = activeTextarea.selectionStart ?? activeTextarea.value.length;
      const end = activeTextarea.selectionEnd ?? activeTextarea.value.length;
      const val = activeTextarea.value;
      const cleanHtml = htmlToInsert.replace(/<\/?selection>/gi, "");
      activeTextarea.value = val.substring(0, start) + cleanHtml + val.substring(end);
      activeTextarea.selectionStart = activeTextarea.selectionEnd = start + cleanHtml.length;
      activeTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      ui.notifications.info("Inserted AP template into source HTML editor!");
      this.close();
      return;
    }

    // 3. Fallback: Copy to clipboard if no editor view is currently active
    try {
      const cleanHtml = htmlToInsert.replace(/<\/?selection>/gi, "");
      await navigator.clipboard.writeText(cleanHtml);
      ui.notifications.info("No active journal editor window detected. Template HTML copied to clipboard!");
    } catch (err) {
      ui.notifications.warn("Could not find an active ProseMirror editor window.");
    }

    this.close();
  }

  _findActiveEditorView() {
    // 1. Check explicitly passed targetView / targetMenu
    if (this.targetView?.dom?.isConnected && this.targetView?.state && this.targetView?.dispatch) {
      return this.targetView;
    }
    if (this.targetMenu?.view?.dom?.isConnected && this.targetMenu.view.state) {
      return this.targetMenu.view;
    }

    // 2. Check last active tracked view
    if (JournalEditor.lastActiveView?.dom?.isConnected) {
      return JournalEditor.lastActiveView;
    }

    // 3. Check any tracked active views
    for (const view of JournalEditor.activeViews) {
      if (view?.dom?.isConnected) {
        return view;
      }
    }

    // 4. Query DOM for ProseMirror elements with __pmView attached
    const pmElements = document.querySelectorAll("prose-mirror .editor-content.ProseMirror, .editor-content.ProseMirror, .ProseMirror");
    for (const el of pmElements) {
      if (el.__pmView?.dom?.isConnected) {
        JournalEditor.registerEditorView(el.__pmView);
        return el.__pmView;
      }
    }

    // 5. Look for active journal sheet
    const activeJournal = document.querySelector(".journal-entry-page.active prose-mirror, .journal-sheet.active prose-mirror, prose-mirror");
    if (activeJournal) {
      const el = activeJournal.querySelector(".editor-content.ProseMirror") || activeJournal.querySelector(".ProseMirror");
      if (el?.__pmView) return el.__pmView;
    }

    return null;
  }

  _insertHtmlIntoView(view, html) {
    const { state } = view;
    const { $from, $to } = state.selection;

    let selection = "";
    if ($from && $to && !state.selection.empty) {
      selection = state.doc.textBetween($from.pos, $to.pos);
    }

    // Replace <selection> tags if present
    html = html.replace(/<selection>(.*?)<\/selection>/gi, (_, alt) => selection || alt || "");

    const pm = globalThis.ProseMirror || foundry?.prosemirror;
    const parserClass = pm?.DOMParser || foundry?.prosemirror?.DOMParser;

    const template = document.createElement("template");
    template.innerHTML = html;

    if (parserClass && state.schema) {
      const parser = parserClass.fromSchema(state.schema);
      const slice = parser.parseSlice(template.content);
      let tr = state.tr.replaceSelection(slice);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    }

    if (pm?.dom?.parseString) {
      const parsed = pm.dom.parseString(html, state.schema);
      const doc = parsed?.content?.content?.[0] ?? parsed;
      let tr = state.tr.replaceSelectionWith(doc);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    }

    throw new Error("ProseMirror parser unavailable");
  }

  /* ------------------------------------------------------------------------- */
  /*  Event Listeners                                                          */
  /* ------------------------------------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    // Tab Navigation
    root.querySelectorAll(".pf2e-jd-tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.activeTab = btn.dataset.tab;
        this.render({ force: true });
      });
    });

    // Template Category Filter
    root.querySelectorAll(".pf2e-jd-pill[data-category]").forEach(pill => {
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        this.templateCategory = pill.dataset.category;
        this.render({ force: true });
      });
    });

    // Template Select
    root.querySelectorAll("[data-action='select-template']").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectedTemplateId = item.dataset.templateId;
        this.render({ force: true });
      });
    });

    // Entity Search Input
    const searchInput = root.querySelector(".pf2e-jd-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", foundry.utils.debounce((e) => {
        this.entityQuery = e.target.value;
        this.render({ force: true });
      }, 150));
    }

    // Entity Type Filter
    root.querySelectorAll(".pf2e-jd-pill[data-entity-type]").forEach(pill => {
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        this.entityType = pill.dataset.entityType;
        this.render({ force: true });
      });
    });

    // Entity Select
    root.querySelectorAll("[data-action='select-entity']").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectedEntityUuid = item.dataset.entityUuid;
        this.render({ force: true });
      });
    });

    // Entity Format Select
    const formatSelect = root.querySelector(".pf2e-jd-entity-format");
    if (formatSelect) {
      formatSelect.addEventListener("change", (e) => {
        this.entityFormat = e.target.value;
        this.render({ force: true });
      });
    }

    // Check Inputs Update
    root.querySelectorAll("[data-action='update-check']").forEach(input => {
      const eventType = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventType, () => {
        this.checkData = {
          skill: root.querySelector(".pf2e-jd-check-skill")?.value || "perception",
          dc: parseInt(root.querySelector(".pf2e-jd-check-dc")?.value, 10) || 20,
          purpose: root.querySelector(".pf2e-jd-check-purpose")?.value || "",
          format: root.querySelector(".pf2e-jd-check-format")?.value || "table",
          traits: root.querySelector(".pf2e-jd-check-traits")?.value || ""
        };
        this.render({ force: true });
      });
    });

    // Insert Button
    const insertBtn = root.querySelector("[data-action='insert']");
    if (insertBtn) {
      insertBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this._executeInsert();
      });
    }

    // Cancel Button
    const cancelBtn = root.querySelector("[data-action='close']");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.close();
      });
    }

    // -------------------------------------------------------------------------
    // HTML5 Drag-and-Drop Setup
    // -------------------------------------------------------------------------

    const getHtmlForCurrentPreview = () => {
      if (this.activeTab === "templates") {
        const t = JOURNAL_AP_TEMPLATES.find(x => x.id === this.selectedTemplateId);
        return t ? t.html.replace(/<\/?selection>/gi, "") : "";
      } else if (this.activeTab === "entities") {
        const entity = this.selectedEntityUuid ? this._resolveEntity(this.selectedEntityUuid) : null;
        return entity?.doc ? this._generateEntityHtml(entity.doc, this.entityFormat) : "";
      } else if (this.activeTab === "checks") {
        return this._generateCheckHtml(this.checkData);
      }
      return "";
    };

    const attachDragToElement = (el, htmlGetter) => {
      if (!el) return;
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", (e) => {
        const html = typeof htmlGetter === "function" ? htmlGetter() : htmlGetter;
        if (!html) return;
        e.dataTransfer.setData("text/html", html);
        e.dataTransfer.setData("text/plain", html);
        e.dataTransfer.effectAllowed = "copy";
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
      });
    };

    // Drag handle & preview box
    const dragHandle = root.querySelector(".pf2e-jd-drag-handle");
    const previewBox = root.querySelector(".pf2e-jd-preview-scroll");
    attachDragToElement(dragHandle, getHtmlForCurrentPreview);
    attachDragToElement(previewBox, getHtmlForCurrentPreview);

    // Drag template list items
    root.querySelectorAll(".pf2e-jd-list-item[data-action='select-template']").forEach(item => {
      attachDragToElement(item, () => {
        const tmplId = item.dataset.templateId;
        const tmpl = JOURNAL_AP_TEMPLATES.find(t => t.id === tmplId);
        return tmpl ? tmpl.html.replace(/<\/?selection>/gi, "") : "";
      });
    });

    // Drag entity list items
    root.querySelectorAll(".pf2e-jd-list-item[data-action='select-entity']").forEach(item => {
      attachDragToElement(item, () => {
        const uuid = item.dataset.entityUuid;
        const resolved = this._resolveEntity(uuid);
        return resolved?.doc ? this._generateEntityHtml(resolved.doc, this.entityFormat) : "";
      });
    });
  }

  _onClose(options) {
    if (JournalTemplateDialog._activeDialog === this) {
      JournalTemplateDialog._activeDialog = null;
    }
    super._onClose(options);
  }
}

/* ------------------------------------------------------------------------- */
/*  Journal Editor Subsystem Initializer                                     */
/* ------------------------------------------------------------------------- */

export class JournalEditor {
  static activeViews = new Set();
  static lastActiveView = null;

  static initialize() {
    // 1. Register Native ProseMirror Inserts
    this._registerProseMirrorInserts();

    // 2. Register ProseMirror Toolbar Button and Editor Tracking
    this._registerProseMirrorToolbarButton();

    // 3. Register Global Journal Scene Button Click Delegation
    this._registerSceneCardClickDelegation();

    console.log("PF2e Awesome GM Utilities | Advanced Journal Editor & Styler initialized.");
  }

  /**
   * Registers or updates an active ProseMirror EditorView.
   * @param {EditorView} view
   */
  static registerEditorView(view) {
    if (!view?.dom) return;
    view.dom.__pmView = view;
    this.activeViews.add(view);
    this.lastActiveView = view;

    if (!view.dom.__pf2eAwesomeGmTracked) {
      view.dom.__pf2eAwesomeGmTracked = true;
      const onFocus = () => {
        JournalEditor.lastActiveView = view;
      };
      view.dom.addEventListener("focus", onFocus, { passive: true });
      view.dom.addEventListener("pointerdown", onFocus, { passive: true });
    }
  }

  /**
   * Unregisters a ProseMirror EditorView when destroyed.
   * @param {EditorView} view
   */
  static unregisterEditorView(view) {
    this.activeViews.delete(view);
    if (this.lastActiveView === view) {
      this.lastActiveView = null;
    }
  }

  /**
   * Registers AP templates into CONFIG.TextEditor.inserts for native dropdown menu access.
   */
  static _registerProseMirrorInserts() {
    if (!CONFIG.TextEditor) return;
    CONFIG.TextEditor.inserts = CONFIG.TextEditor.inserts || [];

    const existingIdx = CONFIG.TextEditor.inserts.findIndex(i => i.action === "pf2e-ap-templates-group");
    const groupInsert = {
      action: "pf2e-ap-templates-group",
      title: "PF2e AP Adventure Templates",
      children: JOURNAL_AP_TEMPLATES.map(t => ({
        action: `pf2e-${t.id}`,
        title: t.title,
        html: t.html
      }))
    };

    if (existingIdx >= 0) {
      CONFIG.TextEditor.inserts[existingIdx] = groupInsert;
    } else {
      CONFIG.TextEditor.inserts.push(groupInsert);
    }
  }

  /**
   * Registers custom button into the ProseMirror toolbar.
   */
  static _registerProseMirrorToolbarButton() {
    // 1. Hook createProseMirrorEditor to track all ProseMirror EditorView instances
    Hooks.on("createProseMirrorEditor", (uuid, plugins, options) => {
      const pm = globalThis.ProseMirror || foundry?.prosemirror;
      if (!pm?.Plugin) return;
      plugins.pf2eAwesomeGmEditorTracker = new pm.Plugin({
        view(editorView) {
          JournalEditor.registerEditorView(editorView);
          return {
            destroy() {
              JournalEditor.unregisterEditorView(editorView);
            }
          };
        }
      });
    });

    // 2. Add toolbar button into ProseMirror menu
    Hooks.on("getProseMirrorMenuItems", (menu, items) => {
      if (items.some(i => i.action === "pf2e-ap-templates")) return;

      const scopes = menu?.constructor?._MENU_ITEM_SCOPES || { BOTH: "", TEXT: "text", HTML: "html" };
      items.push({
        action: "pf2e-ap-templates",
        title: "PF2e AP Styles & Entity Linker",
        icon: '<i class="fa-solid fa-feather-pointed fa-fw"></i>',
        scope: scopes.TEXT,
        weight: 450,
        cmd: (state, dispatch, view) => {
          const activeView = view || menu?.view;
          if (activeView) JournalEditor.registerEditorView(activeView);
          JournalTemplateDialog.open({ menu, view: activeView });
        }
      });

      if (menu?.view) {
        JournalEditor.registerEditorView(menu.view);
      }
    });

    // 3. Global listener for editor focus
    document.addEventListener("focusin", (event) => {
      const pmDom = event.target.closest(".editor-content.ProseMirror") || event.target.closest(".ProseMirror");
      if (pmDom?.__pmView) {
        JournalEditor.registerEditorView(pmDom.__pmView);
      }
    }, { capture: true, passive: true });

    document.addEventListener("pointerdown", (event) => {
      const pmDom = event.target.closest(".editor-content.ProseMirror") || event.target.closest(".ProseMirror");
      if (pmDom?.__pmView) {
        JournalEditor.registerEditorView(pmDom.__pmView);
      }
    }, { capture: true, passive: true });
  }

  /**
   * Global click delegation for interactive Scene Cards in journals.
   */
  static _registerSceneCardClickDelegation() {
    document.addEventListener("click", async (event) => {
      const btn = event.target.closest(".pf2e-scene-card-btn");
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();

      const sceneId = btn.dataset.sceneId;
      if (!sceneId) return;

      const scene = game.scenes.get(sceneId);
      if (!scene) {
        ui.notifications.warn("Linked Scene could not be found.");
        return;
      }

      if (btn.classList.contains("view-scene")) {
        await scene.view();
        ui.notifications.info(`Viewing Scene: ${scene.name}`);
      } else if (btn.classList.contains("activate-scene")) {
        if (!game.user.isGM) {
          ui.notifications.warn("Only GMs can activate scenes.");
          return;
        }
        await scene.activate();
        ui.notifications.info(`Activated Scene: ${scene.name}`);
      }
    });
  }
}
