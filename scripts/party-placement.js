/**
 * PF2e Awesome GM Utilities - Party Placement Utility
 * Allows GMs to click on any scene to smoothly place/move all PC members
 * of the party next to each other in a clean grid formation centered around the cursor.
 */

import { MODULE_ID } from "./constants.js";

export class PartyPlacement {
  static _activePlacement = null;

  /**
   * Discovers member actors of the current party.
   * Priority:
   * 1. PF2e game.actors.party.members (native PF2e Party Actor)
   * 2. Any active Party actor's members
   * 3. Character actors with player owners
   * 4. Any character actors
   * @returns {Actor[]}
   */
  static getPartyActors() {
    // 1. Primary PF2e party actor
    const primaryParty = game.actors?.party;
    if (primaryParty?.members?.length > 0) {
      return primaryParty.members.filter(a => a && typeof a.getTokenDocument === "function");
    }

    // 2. Any party-type actor with members
    const partyActors = game.actors?.filter(a => a.type === "party") || [];
    const activeParty = partyActors.find(a => a.system?.active) || partyActors[0];
    if (activeParty?.members?.length > 0) {
      return activeParty.members.filter(a => a && typeof a.getTokenDocument === "function");
    }

    // 3. Fallback: Character actors with player owners
    const pcsWithPlayer = game.actors?.filter(a => a.type === "character" && a.hasPlayerOwner) || [];
    if (pcsWithPlayer.length > 0) {
      return pcsWithPlayer;
    }

    // 4. Fallback: Any character actors
    return game.actors?.filter(a => a.type === "character") || [];
  }

  /**
   * Activates placement mode. Changes cursor to crosshair, shows visual banner,
   * and awaits a click on the scene canvas.
   */
  static startPlacement() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can place party tokens.");
      return;
    }

    if (!canvas?.ready || !canvas?.scene) {
      ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.NoScene"));
      return;
    }

    const actors = this.getPartyActors();
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.NoActors"));
      return;
    }

    // If an existing placement session is running, cancel it first
    if (this._activePlacement) {
      this._activePlacement.cancel();
    }

    // Create placement session
    this._activePlacement = new PartyPlacementSession(actors);
    this._activePlacement.start();
  }

  /**
   * Directly places the party at a specific canvas coordinate { x, y } without waiting for click.
   * @param {{x: number, y: number}} coords
   * @returns {Promise<void>}
   */
  static async placeAt(coords) {
    const actors = this.getPartyActors();
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.NoActors"));
      return;
    }
    return PartyPlacementSession.executePlacement(actors, coords);
  }
}

class PartyPlacementSession {
  constructor(actors) {
    this.actors = actors;
    this.bannerEl = null;
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
  }

  start() {
    document.body.classList.add("pf2e-placement-mode");

    const bannerText = game.i18n.format("PF2E_AWESOME_GM.PartyPlacement.Banner", { count: this.actors.length })
      || `Click anywhere on the map to place the party (${this.actors.length} PCs)`;
    const hintText = game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.BannerHint")
      || "(Right-click or ESC to cancel)";

    // Create floating placement banner
    this.bannerEl = document.createElement("div");
    this.bannerEl.className = "pf2e-placement-banner";
    this.bannerEl.innerHTML = `
      <i class="fa-solid fa-users"></i>
      <span>${bannerText}</span>
      <span class="cancel-hint">${hintText}</span>
    `;
    document.body.appendChild(this.bannerEl);

    // Register capture-phase listeners on window
    window.addEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.addEventListener("keydown", this._onKeyDown, { capture: true });
    window.addEventListener("contextmenu", this._onContextMenu, { capture: true });
  }

  cancel() {
    this._cleanup();
    ui.notifications.info(game.i18n.localize("PF2E_AWESOME_GM.PartyPlacement.Canceled"));
  }

  _cleanup() {
    document.body.classList.remove("pf2e-placement-mode");
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
    window.removeEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.removeEventListener("keydown", this._onKeyDown, { capture: true });
    window.removeEventListener("contextmenu", this._onContextMenu, { capture: true });
    PartyPlacement._activePlacement = null;
  }

  _handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  }

  _handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }

  async _handlePointerDown(event) {
    // Right click cancels
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }

    // Only respond to main left click
    if (event.button !== 0) return;

    // Check if clicked inside Foundry UI elements (sidebar, menus, dialogs)
    const uiTarget = event.target.closest("#interface, .window-app, #sidebar, #controls, #navigation, #hotbar, .pf2e-resource-widget-window");
    if (uiTarget) {
      return; // Let normal UI interaction happen
    }

    event.preventDefault();
    event.stopPropagation();

    // Determine canvas world coordinates
    let coords = null;
    if (typeof canvas?.canvasCoordinatesFromClient === "function") {
      coords = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
    } else if (canvas?.mousePosition) {
      coords = { x: canvas.mousePosition.x, y: canvas.mousePosition.y };
    }

    this._cleanup();

    if (!coords || isNaN(coords.x) || isNaN(coords.y)) {
      return;
    }

    await PartyPlacementSession.executePlacement(this.actors, coords);
  }

  /**
   * Calculate grid positions and place/move party tokens.
   */
  static async executePlacement(actors, originCoords) {
    if (!canvas?.ready || !canvas?.scene || !actors?.length) return;

    const gridSize = canvas.grid?.size || 100;
    
    // Snap origin to grid top-left
    const getTopLeft = (pt) => {
      if (typeof canvas.grid?.getTopLeftPoint === "function") {
        return canvas.grid.getTopLeftPoint(pt);
      }
      return {
        x: Math.round(pt.x / gridSize) * gridSize,
        y: Math.round(pt.y / gridSize) * gridSize
      };
    };

    const centerPoint = getTopLeft(originCoords);

    // Calculate cluster formation
    const N = actors.length;
    const cols = N <= 2 ? N : (N <= 4 ? 2 : (N <= 6 ? 3 : Math.ceil(Math.sqrt(N))));
    const rows = Math.ceil(N / cols);

    const occupiedCells = new Set();
    const actorPlacements = [];

    for (let i = 0; i < N; i++) {
      const actor = actors[i];
      const tokWidth = Math.max(1, Math.round(actor.prototypeToken?.width || 1));
      const tokHeight = Math.max(1, Math.round(actor.prototypeToken?.height || 1));

      const row = Math.floor(i / cols);
      const col = i % cols;
      const itemsInRow = (row === rows - 1) ? (N - row * cols) : cols;

      const colOffset = col - Math.floor(itemsInRow / 2);
      const rowOffset = row - Math.floor(rows / 2);

      const preferredPt = getTopLeft({
        x: centerPoint.x + colOffset * gridSize,
        y: centerPoint.y + rowOffset * gridSize
      });

      // Find free position (checking all cells occupied by token width/height)
      const finalPt = this._findFreeCell(preferredPt, tokWidth, tokHeight, occupiedCells, gridSize, getTopLeft);

      // Mark occupied cells
      for (let w = 0; w < tokWidth; w++) {
        for (let h = 0; h < tokHeight; h++) {
          const key = `${Math.round(finalPt.x + w * gridSize)},${Math.round(finalPt.y + h * gridSize)}`;
          occupiedCells.add(key);
        }
      }

      actorPlacements.push({ actor, point: finalPt });
    }

    // Separate into updates (existing tokens on scene) and creates (new tokens)
    const tokenUpdates = [];
    const tokenCreates = [];
    const touchedTokenIds = [];

    for (const { actor, point } of actorPlacements) {
      const existingToken = canvas.scene.tokens.find(t => t.actorId === actor.id);
      if (existingToken) {
        tokenUpdates.push({
          _id: existingToken.id,
          x: point.x,
          y: point.y
        });
        touchedTokenIds.push(existingToken.id);
      } else {
        const tokenDoc = await actor.getTokenDocument({ x: point.x, y: point.y });
        tokenCreates.push(tokenDoc.toObject());
      }
    }

    try {
      if (tokenUpdates.length > 0) {
        await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates, { animate: true });
      }

      if (tokenCreates.length > 0) {
        const createdDocs = await canvas.scene.createEmbeddedDocuments("Token", tokenCreates);
        for (const doc of createdDocs) {
          touchedTokenIds.push(doc.id);
        }
      }

      // Visual ping at center point
      if (typeof canvas.ping === "function") {
        canvas.ping(centerPoint, { color: "#d4af37", duration: 800 });
      }

      // Select placed tokens
      setTimeout(() => {
        try {
          canvas.tokens.releaseAll();
          for (const id of touchedTokenIds) {
            const tok = canvas.tokens.get(id);
            if (tok) tok.control({ releaseOthers: false });
          }
        } catch (_) {}
      }, 150);

      const names = actors.map(a => a.name).join(", ");
      const msg = game.i18n.format("PF2E_AWESOME_GM.PartyPlacement.Success", { count: actors.length, names })
        || `Placed party (${actors.length} members): ${names}`;
      ui.notifications.info(msg);
    } catch (err) {
      console.error("PF2e Awesome GM Utilities | Failed to place party tokens:", err);
      ui.notifications.error("Failed to place some party tokens on the scene.");
    }
  }

  static _findFreeCell(preferredPt, tokWidth, tokHeight, occupied, gridSize, getTopLeft) {
    const isFree = (pt) => {
      for (let w = 0; w < tokWidth; w++) {
        for (let h = 0; h < tokHeight; h++) {
          const key = `${Math.round(pt.x + w * gridSize)},${Math.round(pt.y + h * gridSize)}`;
          if (occupied.has(key)) return false;
        }
      }
      return true;
    };

    if (isFree(preferredPt)) return preferredPt;

    // Spiral search outward
    let radius = 1;
    while (radius <= 15) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const candidate = getTopLeft({
            x: preferredPt.x + dx * gridSize,
            y: preferredPt.y + dy * gridSize
          });
          if (isFree(candidate)) {
            return candidate;
          }
        }
      }
      radius++;
    }

    return preferredPt;
  }
}
