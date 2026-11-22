/**
 * PF2e Awesome GM Utilities - Performance Checker & Module Profiler
 * Lightweight, opt-in GM diagnostic tool for Foundry VTT v14 + PF2e.
 * Measures real-time FPS, frame spikes, main-thread long tasks, JS heap memory,
 * per-module hook CPU timings, runtime error attribution, browser resource/asset
 * load weights, and PF2e world/scene/flag bloat.
 *
 * ZERO overhead when disabled (default: OFF in Module Settings).
 */

import { MODULE_ID } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------------- */
/* Utility Formatting Helpers                                                */
/* ------------------------------------------------------------------------- */

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b <= 0) return "0 B";
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms) {
  const v = Number(ms) || 0;
  if (v < 0.01) return "0.00 ms";
  if (v < 10) return `${v.toFixed(2)} ms`;
  if (v < 1000) return `${v.toFixed(1)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

function formatTimeStamp(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function safeJsonByteLength(obj) {
  if (obj == null) return 0;
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------------- */
/* 1. PERFORMANCE MONITOR ENGINE (SINGLETON)                                 */
/* ------------------------------------------------------------------------- */

export class PerformanceMonitorEngine {
  constructor() {
    this.enabled = false;
    this.hookProfiling = false;
    this._startupAttributed = false;

    // Hook attribution & profiling internals
    this._hooksPatched = false;
    this._origHooksOn = null;
    this._origHooksOff = null;
    this._hookOwners = new Map();       // hookId -> { moduleId, hook }
    this._wrappedEntries = new Map();   // hookId -> { entry, origFn, wrapperFn }
    this._activeHookContext = null;

    // Per-hook & per-module execution metrics
    this._hookStats = new Map();        // hookName -> { hook, calls, totalMs, maxMs, modules: Set }
    this._moduleHookStats = new Map();  // moduleId -> { calls, totalMs, maxMs, slowestHook, slowestHookMs }
    this._recentHookEvents = [];        // Ring buffer (max 100) of hook calls >= 3ms for freeze correlation
    this._loafSpikesByModule = new Map(); // moduleId -> { count, totalMs, maxMs, lastScript }

    // Lightweight GM activity breadcrumbs (only bound when enabled)
    this._recentActivities = [];        // Ring buffer (max 30) of { ts, label }
    this._activityHookIds = [];
    this._onActivityPointerBound = null;
    this._onActivityWheelBound = null;
    this._lastInteractionTs = 0;

    // Error tracking
    this._errorListenersBound = false;
    this._errorHookId = null;
    this._onWindowErrorBound = null;
    this._onUnhandledRejectionBound = null;
    this._errors = [];                  // Array of error records (max 100)
    this._errorCountByModule = new Map();

    // Frame rate & long-task tracking
    this._rafId = null;
    this._lastFrameTime = 0;
    this._lastSecTime = 0;
    this._frameTimesThisSec = [];
    this._spikesThisSec = 0;

    this._currentFps = 0;
    this._avgFrameMs = 0;
    this._maxFrameMs = 0;
    this._recentMaxFrameMs = 0;
    this._history = [];                 // Last 60 seconds: { fps, frameMs, heapMB, spikes }
    this._heapSamples = [];             // { ts, mb } for leak trend calculation
    this._peakHeapMB = 0;
    this._lastHeapBytes = 0;

    this._longTaskObserver = null;
    this._loafSupported = false;
    this._longTasks = [];               // Recent >50ms freezes (max 60)
    this._longTaskCount = 0;
    this._severeSpikeCount = 0;         // >150ms freezes

    // Burst capture state
    this._burstTimer = null;
    this._burstRemaining = 0;

    // On-demand deep audit snapshot
    this._auditData = null;

    // Subscribers notified on 1-second ticks or state changes
    this._subscribers = new Set();
  }

  /**
   * Strictly verifies that the current client user is a Gamemaster (or Assistant GM).
   * Works safely both during early `init` (before `game.user` exists) and after `ready`.
   * @returns {boolean}
   */
  isUserGM() {
    if (game?.user) return Boolean(game.user.isGM);
    try {
      const uid = game?.userId;
      const users = game?.data?.users;
      if (uid && Array.isArray(users)) {
        const u = users.find(x => x._id === uid);
        const minGmRole = CONST?.USER_ROLES?.ASSISTANT ?? 3;
        return Boolean(u && (u.role ?? 0) >= minGmRole);
      }
    } catch {
      // Ignore early access errors
    }
    return false;
  }

  /**
   * Checks whether the Performance Checker is enabled AND the current user is a GM.
   * Always returns false for non-GM players.
   * @returns {boolean}
   */
  isEnabled() {
    if (!this.isUserGM()) return false;
    try {
      if (!game?.settings?.settings?.has?.(`${MODULE_ID}.enablePerformanceMonitor`)) return false;
      return Boolean(game.settings.get(MODULE_ID, "enablePerformanceMonitor"));
    } catch {
      return false;
    }
  }

  /**
   * Subscribe a callback to live metric ticks & state updates.
   * @param {Function} fn
   * @returns {Function} Unsubscribe callback
   */
  subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  _notify(fullRender = false) {
    for (const fn of this._subscribers) {
      try {
        fn(fullRender);
      } catch (err) {
        console.warn("PF2e Awesome GM Utilities | Performance Monitor subscriber error:", err);
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Lifecycle: Init / Ready / Activate / Deactivate                         */
  /* ----------------------------------------------------------------------- */

  /**
   * Called during Hooks.once("init").
   * Does NOTHING if the setting is OFF (default).
   */
  onInit() {
    if (!this.isEnabled()) return;
    this._startupAttributed = true;
    this._installHookAttribution();
    this._installErrorListeners();
  }

  /**
   * Called during Hooks.once("ready").
   * Does NOTHING if the setting is OFF (default).
   */
  onReady() {
    if (!this.isEnabled()) return;
    this.activate();
  }

  /**
   * Starts live performance telemetry (FPS, memory, long tasks, errors, breadcrumbs).
   * Strictly restricted to GM clients.
   */
  activate() {
    if (!this.isUserGM()) return;
    if (this.enabled) return;
    this.enabled = true;
    this._lastHeapBytes = performance?.memory?.usedJSHeapSize || 0;
    this._installHookAttribution();
    this._installErrorListeners();
    this._installActivityBreadcrumbs();
    this._startFrameLoop();
    this._startLongTaskObserver();
    this._notify(true);
  }

  /**
   * Completely stops all monitoring, unwraps hooks, disconnects observers,
   * and frees timers so zero background overhead remains.
   */
  deactivate() {
    this.stopBurstProfile();
    this.stopHookProfiling();
    this._stopFrameLoop();
    this._stopLongTaskObserver();
    this._uninstallActivityBreadcrumbs();
    this._uninstallErrorListeners();
    this._uninstallHookAttribution();
    this.enabled = false;
    this._notify(true);
  }

  /**
   * Resets collected timing, spike, history, and error statistics.
   */
  resetStats() {
    this._hookStats.clear();
    this._moduleHookStats.clear();
    this._recentHookEvents = [];
    this._loafSpikesByModule.clear();
    this._recentActivities = [];
    this._errors = [];
    this._errorCountByModule.clear();
    this._longTasks = [];
    this._longTaskCount = 0;
    this._severeSpikeCount = 0;
    this._maxFrameMs = 0;
    this._recentMaxFrameMs = 0;
    this._history = [];
    this._heapSamples = [];
    this._peakHeapMB = 0;
    this._notify(true);
  }

  /* ----------------------------------------------------------------------- */
  /* Module Attribution Helpers                                              */
  /* ----------------------------------------------------------------------- */

  /**
   * Resolves a human-readable package title from a module/system/core ID.
   * @param {string} id
   * @returns {string}
   */
  getPackageTitle(id) {
    if (!id || id === "unknown") return "Core / Unattributed";
    if (id === "core") return "Foundry VTT Core";
    if (id.startsWith("system:")) {
      const sysId = id.slice(7);
      if (game?.system?.id === sysId) return `${game.system.title || sysId} (System)`;
      return `${sysId} (System)`;
    }
    const mod = game?.modules?.get?.(id);
    if (mod) return mod.title || mod.id;
    return id;
  }

  /**
   * Extracts the responsible module/system ID from a JS Error stack trace or URL.
   * @param {string} stackOrUrl
   * @param {boolean} [ignoreSelf=true]
   * @returns {string}
   */
  extractPackageFromStack(stackOrUrl, ignoreSelf = true) {
    if (!stackOrUrl || typeof stackOrUrl !== "string") return "unknown";
    const lines = stackOrUrl.split("\n");
    let systemCandidate = null;
    let coreCandidate = false;

    for (const line of lines) {
      // Match /modules/<module-id>/
      const modMatch = line.match(/\/modules\/([^/\s:?#)"']+)/i);
      if (modMatch?.[1]) {
        const modId = decodeURIComponent(modMatch[1]);
        if (ignoreSelf && modId === MODULE_ID && line.includes("performance-monitor.js")) {
          continue;
        }
        return modId;
      }

      // Match /systems/<system-id>/
      if (!systemCandidate) {
        const sysMatch = line.match(/\/systems\/([^/\s:?#)"']+)/i);
        if (sysMatch?.[1]) {
          systemCandidate = `system:${decodeURIComponent(sysMatch[1])}`;
        }
      }

      if (!coreCandidate && (/\/scripts\/foundry\.mjs/i.test(line) || /\/common\//i.test(line))) {
        coreCandidate = true;
      }
    }

    if (systemCandidate) return systemCandidate;
    if (coreCandidate) return "core";
    return "unknown";
  }

  /**
   * Best-effort module owner lookup for an existing Hooks entry.
   * @param {object} entry
   * @returns {string}
   */
  _resolveHookEntryOwner(entry) {
    if (!entry) return "unknown";
    const recorded = this._hookOwners.get(entry.id);
    if (recorded?.moduleId) return recorded.moduleId;

    // Best-effort heuristic for hooks registered before our init ran
    const fn = entry.fn?._pf2ePerfOrigFn || entry.fn;
    if (typeof fn === "function") {
      try {
        const src = Function.prototype.toString.call(fn);
        // Check for direct module ID literals inside callback body
        if (game?.modules) {
          for (const mod of game.modules.values()) {
            if (!mod.active) continue;
            if (src.includes(`"${mod.id}"`) || src.includes(`'${mod.id}'`)) {
              this._hookOwners.set(entry.id, { moduleId: mod.id, hook: entry.hook });
              return mod.id;
            }
          }
        }
        if (src.includes("pf2e") || src.includes("PF2e") || src.includes("PF2E")) {
          return `system:${game?.system?.id || "pf2e"}`;
        }
      } catch {
        // Native/bound function cannot be inspected
      }
    }
    return "unknown";
  }

  /* ----------------------------------------------------------------------- */
  /* Hook Attribution & Live Hook Profiler                                   */
  /* ----------------------------------------------------------------------- */

  _installHookAttribution() {
    if (this._hooksPatched || typeof Hooks === "undefined") return;
    this._hooksPatched = true;
    this._origHooksOn = Hooks.on;
    this._origHooksOff = Hooks.off;

    const self = this;

    // Patch Hooks.on to record registering module (and auto-wrap if live profiling is ON)
    Hooks.on = function (hook, fn, options) {
      let ownerId = "unknown";
      try {
        const err = new Error();
        ownerId = self.extractPackageFromStack(err.stack, true);
      } catch {
        // Ignore stack capture errors
      }

      const id = self._origHooksOn.call(this, hook, fn, options);
      self._hookOwners.set(id, { moduleId: ownerId, hook });

      // If live hook profiling is active, immediately wrap the newly registered entry
      if (self.hookProfiling && hook !== "error") {
        const list = Hooks.events?.[hook];
        const entry = list?.find(e => e.id === id);
        if (entry) {
          self._wrapHookEntry(entry, ownerId);
        }
      }
      return id;
    };

    // Patch Hooks.off so unregistering by original function reference continues working seamlessly
    Hooks.off = function (hook, fn) {
      if (typeof fn === "number") {
        self._wrappedEntries.delete(fn);
        self._hookOwners.delete(fn);
        return self._origHooksOff.call(this, hook, fn);
      }
      if (typeof fn === "function") {
        const list = Hooks.events?.[hook];
        const match = list?.find(e => e.fn === fn || e.fn?._pf2ePerfOrigFn === fn);
        if (match) {
          self._wrappedEntries.delete(match.id);
          self._hookOwners.delete(match.id);
          return self._origHooksOff.call(this, hook, match.id);
        }
      }
      return self._origHooksOff.call(this, hook, fn);
    };
  }

  _uninstallHookAttribution() {
    if (!this._hooksPatched) return;
    this.stopHookProfiling();
    if (this._origHooksOn) Hooks.on = this._origHooksOn;
    if (this._origHooksOff) Hooks.off = this._origHooksOff;
    this._origHooksOn = null;
    this._origHooksOff = null;
    this._hooksPatched = false;
  }

  _wrapHookEntry(entry, forcedOwner = null) {
    if (!entry || typeof entry.fn !== "function") return;
    if (this._wrappedEntries.has(entry.id) || entry.fn._pf2ePerfOrigFn) return;
    if (entry.hook === "error") return; // Never recursively wrap error hook

    const origFn = entry.fn;
    const hookName = entry.hook;
    const ownerId = forcedOwner || this._resolveHookEntryOwner(entry);
    const self = this;

    const wrapperFn = function (...args) {
      const prevCtx = self._activeHookContext;
      self._activeHookContext = `${hookName} (${self.getPackageTitle(ownerId)})`;
      const t0 = performance.now();
      try {
        return origFn.apply(this, args);
      } finally {
        const t1 = performance.now();
        const dt = t1 - t0;
        self._activeHookContext = prevCtx;
        self._recordHookTiming(hookName, ownerId, dt, t0, t1);
      }
    };

    wrapperFn._pf2ePerfOrigFn = origFn;
    entry.fn = wrapperFn;
    this._wrappedEntries.set(entry.id, { entry, origFn, wrapperFn });
  }

  _recordHookTiming(hookName, ownerId, dt, t0 = performance.now(), t1 = t0 + dt) {
    // 1. Per-hook aggregate
    let hStat = this._hookStats.get(hookName);
    if (!hStat) {
      hStat = { hook: hookName, calls: 0, totalMs: 0, maxMs: 0, modules: new Set() };
      this._hookStats.set(hookName, hStat);
    }
    hStat.calls++;
    hStat.totalMs += dt;
    if (dt > hStat.maxMs) hStat.maxMs = dt;
    hStat.modules.add(ownerId);

    // 2. Per-module aggregate
    let mStat = this._moduleHookStats.get(ownerId);
    if (!mStat) {
      mStat = { calls: 0, totalMs: 0, maxMs: 0, slowestHook: hookName, slowestHookMs: 0 };
      this._moduleHookStats.set(ownerId, mStat);
    }
    mStat.calls++;
    mStat.totalMs += dt;
    if (dt > mStat.maxMs) mStat.maxMs = dt;
    if (dt > mStat.slowestHookMs) {
      mStat.slowestHookMs = dt;
      mStat.slowestHook = hookName;
    }

    // 3. Keep short timeline of notable hooks (>=3ms) for LoAF / LongTask overlap correlation
    if (dt >= 3) {
      this._recentHookEvents.push({ hook: hookName, ownerId, start: t0, end: t1, dt });
      if (this._recentHookEvents.length > 120) this._recentHookEvents.shift();
    }

    // 4. Record severe hook spike directly into long-task log if >= 50ms
    if (dt >= 50) {
      const pkgTitle = this.getPackageTitle(ownerId);
      this._recordLongTask({
        durationMs: dt,
        perfEnd: t1,
        culprit: pkgTitle,
        category: "Hook Callback",
        details: `Hook "${hookName}" took ${formatMs(dt)} in ${pkgTitle}`
      });
    }
  }

  /**
   * Starts timing all registered Foundry Hooks callbacks (GM only).
   */
  startHookProfiling() {
    if (!this.isUserGM()) return;
    if (!this.enabled) this.activate();
    if (this.hookProfiling) return;

    this._installHookAttribution();
    this.hookProfiling = true;

    const events = Hooks.events || {};
    for (const [hookName, entries] of Object.entries(events)) {
      if (hookName === "error" || !Array.isArray(entries)) continue;
      for (const entry of entries) {
        this._wrapHookEntry(entry);
      }
    }
    this._notify(true);
  }

  /**
   * Cleanly restores every wrapped Hook callback to its exact original function.
   */
  stopHookProfiling() {
    if (!this.hookProfiling && this._wrappedEntries.size === 0) return;
    this.hookProfiling = false;

    for (const { entry, origFn, wrapperFn } of this._wrappedEntries.values()) {
      if (entry && entry.fn === wrapperFn) {
        entry.fn = origFn;
      }
    }
    this._wrappedEntries.clear();
    this._notify(true);
  }

  /**
   * Runs a focused N-second Hook Profiling capture, then automatically stops.
   * Ideal for profiling a specific action (moving a token, opening a sheet, rolling).
   * @param {number} [seconds=10]
   */
  startBurstProfile(seconds = 10) {
    this.stopBurstProfile();
    this._hookStats.clear();
    this._moduleHookStats.clear();
    this.startHookProfiling();

    this._burstRemaining = seconds;
    this._notify(true);

    this._burstTimer = setInterval(() => {
      this._burstRemaining--;
      if (this._burstRemaining <= 0) {
        this.stopBurstProfile();
        this.stopHookProfiling();
        ui.notifications?.info("Performance Checker: 10s Hook Profile capture complete!");
        this._notify(true);
      } else {
        this._notify(false);
      }
    }, 1000);
  }

  stopBurstProfile() {
    if (this._burstTimer) {
      clearInterval(this._burstTimer);
      this._burstTimer = null;
    }
    this._burstRemaining = 0;
  }

  /* ----------------------------------------------------------------------- */
  /* Runtime Error & Hook Exception Attribution                              */
  /* ----------------------------------------------------------------------- */

  _installErrorListeners() {
    if (this._errorListenersBound) return;
    this._errorListenersBound = true;

    // 1. Foundry's built-in error hook (catches Hook crashes & core onError calls)
    const origOn = this._origHooksOn || Hooks.on;
    this._errorHookId = origOn.call(Hooks, "error", (location, error, data) => {
      const stack = error?.stack || "";
      let moduleId = this.extractPackageFromStack(stack, false);
      if (moduleId === "unknown" && data?.fn) {
        try {
          const fnStr = Function.prototype.toString.call(data.fn);
          if (game?.modules) {
            for (const mod of game.modules.values()) {
              if (mod.active && fnStr.includes(mod.id)) {
                moduleId = mod.id;
                break;
              }
            }
          }
        } catch {
          // Ignore
        }
      }
      const source = data?.hook ? `Hook: ${data.hook}` : (location || "Foundry Error");
      this._recordError(moduleId, source, error?.message || String(error), stack);
    });

    // 2. Uncaught browser errors
    this._onWindowErrorBound = (event) => {
      const stack = event.error?.stack || event.filename || "";
      const moduleId = this.extractPackageFromStack(stack, false);
      const msg = event.message || event.error?.message || "Uncaught Error";
      this._recordError(moduleId, "Uncaught Exception", msg, stack);
    };
    window.addEventListener("error", this._onWindowErrorBound);

    // 3. Unhandled Promise rejections
    this._onUnhandledRejectionBound = (event) => {
      const reason = event.reason;
      const stack = reason?.stack || "";
      const moduleId = this.extractPackageFromStack(stack, false);
      const msg = reason?.message || (typeof reason === "string" ? reason : "Unhandled Promise Rejection");
      this._recordError(moduleId, "Unhandled Promise", msg, stack);
    };
    window.addEventListener("unhandledrejection", this._onUnhandledRejectionBound);
  }

  _uninstallErrorListeners() {
    if (!this._errorListenersBound) return;
    this._errorListenersBound = false;

    if (this._errorHookId != null) {
      const origOff = this._origHooksOff || Hooks.off;
      origOff.call(Hooks, "error", this._errorHookId);
      this._errorHookId = null;
    }
    if (this._onWindowErrorBound) {
      window.removeEventListener("error", this._onWindowErrorBound);
      this._onWindowErrorBound = null;
    }
    if (this._onUnhandledRejectionBound) {
      window.removeEventListener("unhandledrejection", this._onUnhandledRejectionBound);
      this._onUnhandledRejectionBound = null;
    }
  }

  _recordError(moduleId, source, message, stack) {
    const cleanMod = moduleId || "unknown";
    const now = Date.now();
    this._errorCountByModule.set(cleanMod, (this._errorCountByModule.get(cleanMod) || 0) + 1);

    // Deduplicate consecutive identical errors from same module/message
    const existing = this._errors.find(e => e.moduleId === cleanMod && e.message === message && e.source === source);
    if (existing) {
      existing.count++;
      existing.timestamp = now;
      existing.timeStr = formatTimeStamp(now);
    } else {
      this._errors.unshift({
        id: `err-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        timeStr: formatTimeStamp(now),
        moduleId: cleanMod,
        moduleTitle: this.getPackageTitle(cleanMod),
        source,
        message: String(message || "Unknown Error").slice(0, 300),
        stack: String(stack || "").slice(0, 1500),
        count: 1
      });
      if (this._errors.length > 100) this._errors.pop();
    }
    this._notify(false);
  }

  /* ----------------------------------------------------------------------- */
  /* FPS, Frame Time, Long Tasks & Memory Loop                               */
  /* ----------------------------------------------------------------------- */

  _startFrameLoop() {
    if (this._rafId != null) return;
    this._lastFrameTime = performance.now();
    this._lastSecTime = this._lastFrameTime;
    this._frameTimesThisSec = [];
    this._spikesThisSec = 0;

    const tick = (now) => {
      if (!this.enabled) {
        this._rafId = null;
        return;
      }

      const dt = now - this._lastFrameTime;
      this._lastFrameTime = now;

      // Ignore huge pauses caused by switching browser tabs (> 2500ms)
      if (dt > 0 && dt < 2500) {
        this._frameTimesThisSec.push(dt);
        if (dt > this._maxFrameMs) this._maxFrameMs = dt;

        // Detect frame drop spike if PerformanceObserver isn't available
        if (dt >= 50) {
          this._spikesThisSec++;
          if (!this._longTaskObserver) {
            const diag = this._diagnoseFreezeWindow(now - dt, now, dt, null);
            this._recordLongTask({
              durationMs: dt,
              perfEnd: now,
              culprit: diag.culprit,
              category: diag.category,
              details: diag.details
            });
          }
        }
      }

      // Every 1 second, compute rolling summary & notify subscribers
      if (now - this._lastSecTime >= 1000) {
        const elapsed = (now - this._lastSecTime) / 1000;
        const count = this._frameTimesThisSec.length;
        const fps = count > 0 ? Math.min(240, Math.round(count / elapsed)) : 0;
        const sumMs = this._frameTimesThisSec.reduce((a, b) => a + b, 0);
        const avgMs = count > 0 ? (sumMs / count) : 0;
        const secMaxMs = count > 0 ? Math.max(...this._frameTimesThisSec) : 0;

        this._currentFps = fps;
        this._avgFrameMs = avgMs;

        // Memory sample (Chromium / Electron)
        const mem = this.getMemorySnapshot();
        const heapMB = mem.available ? mem.usedMB : 0;
        if (heapMB > this._peakHeapMB) this._peakHeapMB = heapMB;
        if (mem.available) {
          this._heapSamples.push({ ts: Date.now(), mb: heapMB });
          if (this._heapSamples.length > 180) this._heapSamples.shift(); // 3-minute rolling trend
        }

        this._history.push({
          fps,
          frameMs: Number(avgMs.toFixed(1)),
          maxMs: Number(secMaxMs.toFixed(1)),
          heapMB: Number(heapMB.toFixed(1)),
          spikes: this._spikesThisSec
        });
        if (this._history.length > 60) this._history.shift();

        this._recentMaxFrameMs = this._history.reduce((m, h) => Math.max(m, h.maxMs || 0), 0);

        this._frameTimesThisSec = [];
        this._spikesThisSec = 0;
        this._lastSecTime = now;

        this._notify(false);
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._rafId = requestAnimationFrame(tick);
  }

  _stopFrameLoop() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Lightweight Activity Breadcrumbs & LoAF / LongTask Cause Attribution    */
  /* ----------------------------------------------------------------------- */

  _pushActivity(label) {
    if (!label) return;
    this._recentActivities.push({ ts: performance.now(), label });
    if (this._recentActivities.length > 30) this._recentActivities.shift();
  }

  _installActivityBreadcrumbs() {
    if (this._activityHookIds.length > 0) return;
    const origOn = this._origHooksOn || Hooks.on;

    const addHook = (hookName, fn) => {
      try {
        const id = origOn.call(Hooks, hookName, fn);
        this._activityHookIds.push({ hook: hookName, id });
      } catch {
        // Ignore
      }
    };

    addHook("canvasInit", (c) => this._pushActivity(`Scene Load: "${c?.scene?.name || "Scene"}"`));
    addHook("canvasReady", (c) => this._pushActivity(`Canvas Ready: "${c?.scene?.name || "Scene"}"`));
    addHook("renderApplicationV2", (app) => {
      const name = app?.title || app?.constructor?.name || "Window";
      if (app?.id !== "pf2e-performance-monitor" && app?.id !== "pf2e-performance-hud") {
        this._pushActivity(`Rendered UI: "${name}"`);
      }
    });
    addHook("renderApplication", (app) => {
      const name = app?.title || app?.constructor?.name || "Sheet";
      this._pushActivity(`Rendered Sheet: "${name}"`);
    });
    addHook("createChatMessage", (doc) => {
      this._pushActivity(`Chat Message (${doc?.speaker?.alias || "System"})`);
    });

    // Throttled pointer/wheel interaction breadcrumbs (at most 1 per 150ms, passive)
    this._onActivityPointerBound = (e) => {
      const now = performance.now();
      if (now - this._lastInteractionTs < 150) return;
      this._lastInteractionTs = now;
      const appEl = e.target?.closest?.(".application, .app, #sidebar, #ui-left, #board");
      const targetName = appEl?.id === "board"
        ? "Canvas Interaction"
        : (appEl?.querySelector?.(".window-title")?.textContent?.trim() || appEl?.id || "UI Click");
      this._pushActivity(`User Click: ${targetName}`);
    };
    this._onActivityWheelBound = () => {
      const now = performance.now();
      if (now - this._lastInteractionTs < 250) return;
      this._lastInteractionTs = now;
      this._pushActivity("Canvas Pan / Zoom");
    };
    window.addEventListener("pointerdown", this._onActivityPointerBound, { capture: true, passive: true });
    window.addEventListener("wheel", this._onActivityWheelBound, { capture: true, passive: true });
  }

  _uninstallActivityBreadcrumbs() {
    const origOff = this._origHooksOff || Hooks.off;
    for (const { hook, id } of this._activityHookIds) {
      try {
        origOff.call(Hooks, hook, id);
      } catch {
        // Ignore
      }
    }
    this._activityHookIds = [];

    if (this._onActivityPointerBound) {
      window.removeEventListener("pointerdown", this._onActivityPointerBound, { capture: true });
      this._onActivityPointerBound = null;
    }
    if (this._onActivityWheelBound) {
      window.removeEventListener("wheel", this._onActivityWheelBound, { capture: true });
      this._onActivityWheelBound = null;
    }
  }

  _shortFileName(url) {
    if (!url) return "";
    try {
      const clean = url.split("?")[0].split("#")[0];
      return decodeURIComponent(clean.split("/").pop() || clean);
    } catch {
      return url;
    }
  }

  /**
   * Correlates LoAF script timings, Hook Profiler timeline, recent UI/Canvas breadcrumbs,
   * newly decoded assets, and JS heap GC drops to identify what caused a freeze.
   */
  _diagnoseFreezeWindow(startTime, endTime, durationMs, loafEntry) {
    const detailParts = [];
    let culprit = "";
    let category = "";

    // 1. Long Animation Frame (LoAF) native V8/Blink script & rendering attribution
    if (loafEntry) {
      const scripts = Array.isArray(loafEntry.scripts) ? [...loafEntry.scripts] : [];
      scripts.sort((a, b) => (b.duration || 0) - (a.duration || 0));

      let totalScriptMs = 0;
      const topScriptDesc = [];
      for (const s of scripts) {
        const sDur = Number(s.duration || 0);
        totalScriptMs += sDur;
        if (sDur < 8) continue;

        const url = s.sourceURL || "";
        const pkgId = this.extractPackageFromStack(url, false);
        const pkgTitle = this.getPackageTitle(pkgId);
        const file = this._shortFileName(url);
        const fnName = s.sourceFunctionName ? ` → ${s.sourceFunctionName}()` : "";
        const invoker = s.invoker ? ` [${s.invoker}]` : (s.invokerType ? ` [${s.invokerType}]` : "");

        // Attribute notable script freezes directly to module leaderboard
        if (pkgId !== "unknown" && sDur >= 20) {
          let rec = this._loafSpikesByModule.get(pkgId);
          if (!rec) {
            rec = { count: 0, totalMs: 0, maxMs: 0, lastScript: "" };
            this._loafSpikesByModule.set(pkgId, rec);
          }
          rec.count++;
          rec.totalMs += sDur;
          if (sDur > rec.maxMs) {
            rec.maxMs = sDur;
            rec.lastScript = `${file}${fnName}` || s.invoker || "script";
          }
        }

        if (!culprit && pkgId !== "unknown") {
          culprit = pkgTitle;
          category = "Script";
        }
        if (topScriptDesc.length < 2) {
          const where = file ? `${file}${fnName}` : (s.invoker || s.invokerType || "anonymous script");
          topScriptDesc.push(`${pkgId !== "unknown" ? pkgTitle + " " : ""}(${where}: ${sDur.toFixed(1)}ms${invoker})`);
        }
      }

      if (topScriptDesc.length > 0) {
        detailParts.push(`Scripts: ${topScriptDesc.join("; ")}`);
      }

      // Check browser Style/Layout reflow vs WebGL/Canvas Paint
      const renderStart = loafEntry.renderStart || 0;
      const styleStart = loafEntry.styleAndLayoutStart || 0;
      const renderMs = renderStart > 0 ? Math.max(0, endTime - renderStart) : 0;
      const styleMs = styleStart > 0 ? Math.max(0, endTime - styleStart) : 0;

      if (!culprit && (styleMs >= 25 || renderMs >= 25) && totalScriptMs < durationMs * 0.45) {
        if (styleMs >= 25 && styleMs >= renderMs * 0.5) {
          culprit = "Browser Layout / CSS";
          category = "Style & Layout";
          detailParts.push(`Style & DOM layout reflow took ~${styleMs.toFixed(0)}ms`);
        } else {
          culprit = canvas?.scene?.name ? `Canvas (${canvas.scene.name})` : "WebGL / Canvas Render";
          category = "Rendering";
          detailParts.push(`Canvas/WebGL paint & composite took ~${renderMs.toFixed(0)}ms`);
        }
      } else if (styleMs >= 30) {
        detailParts.push(`Layout/Reflow: ~${styleMs.toFixed(0)}ms`);
      } else if (renderMs >= 30) {
        detailParts.push(`Render/Paint: ~${renderMs.toFixed(0)}ms`);
      }
    }

    // 2. Overlapping Hook Profiler events (if Hook Profiler was running)
    const overlappingHooks = this._recentHookEvents
      .filter(h => h.end >= (startTime - 15) && h.start <= (endTime + 15))
      .sort((a, b) => b.dt - a.dt);

    if (overlappingHooks.length > 0) {
      const top = overlappingHooks.slice(0, 2);
      if (!culprit) {
        culprit = this.getPackageTitle(top[0].ownerId);
        category = "Hook Callback";
      }
      detailParts.push(
        `Hooks: ${top.map(h => `"${h.hook}" (${this.getPackageTitle(h.ownerId)}: ${h.dt.toFixed(1)}ms)`).join(", ")}`
      );
    }

    // 3. Recent Asset Decode / Load correlation
    try {
      if (typeof performance?.getEntriesByType === "function") {
        const resEntries = performance.getEntriesByType("resource") || [];
        const recentRes = [];
        for (let i = resEntries.length - 1; i >= Math.max(0, resEntries.length - 40); i--) {
          const r = resEntries[i];
          if (r.responseEnd < startTime - 200) break;
          const bytes = r.decodedBodySize || r.transferSize || 0;
          if (r.responseEnd <= endTime + 60 && (bytes >= 80 * 1024 || r.duration >= 60)) {
            recentRes.push({ name: this._shortFileName(r.name), bytes, pkg: this.extractPackageFromStack(r.name, false) });
          }
        }
        if (recentRes.length > 0) {
          const topRes = recentRes[0];
          if (!culprit) {
            culprit = topRes.pkg !== "unknown" ? this.getPackageTitle(topRes.pkg) : "Asset Decode";
            category = "Asset / Texture";
          }
          detailParts.push(`Asset loaded: ${topRes.name} (${formatBytes(topRes.bytes)})`);
        }
      }
    } catch {
      // Ignore
    }

    // 4. Garbage Collection (GC) pause check via sudden JS Heap drop
    const curHeap = performance?.memory?.usedJSHeapSize || 0;
    if (curHeap > 0 && this._lastHeapBytes > 0) {
      const freedMB = (this._lastHeapBytes - curHeap) / (1024 * 1024);
      if (freedMB >= 15) {
        if (!culprit) {
          culprit = "V8 Garbage Collector";
          category = "GC Pause";
        }
        detailParts.push(`Memory GC freed ~${freedMB.toFixed(1)} MB`);
      }
    }
    if (curHeap > 0) this._lastHeapBytes = curHeap;

    // 5. Recent UI / Canvas / User Activity Breadcrumbs
    const recentActs = this._recentActivities
      .filter(a => a.ts >= (startTime - 400) && a.ts <= (endTime + 50));
    if (recentActs.length > 0) {
      const latest = recentActs[recentActs.length - 1];
      if (!culprit) {
        culprit = latest.label;
        category = "Activity";
      }
      detailParts.push(`During: ${latest.label}`);
    }

    // 6. Honest fallback if truly outside JS (e.g. OS scheduling, GPU driver sync, browser without LoAF)
    if (!culprit) {
      culprit = "Browser / GPU Stall";
      category = "Engine / GPU";
    }
    if (detailParts.length === 0) {
      detailParts.push(
        this._loafSupported
          ? "No single JS script dominated — likely GPU/WebGL draw sync, shader compile, or browser GC."
          : "Click '10s Burst Profile' while repeating the action to capture exact module hook timings."
      );
    }

    return {
      culprit,
      category,
      details: detailParts.join(" · ")
    };
  }

  _startLongTaskObserver() {
    if (this._longTaskObserver || typeof PerformanceObserver === "undefined") return;
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];

      // Prefer modern Long Animation Frames API (LoAF) — gives exact module script URLs & layout/paint breakdown!
      if (supported.includes("long-animation-frame")) {
        this._loafSupported = true;
        this._longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) {
              const startTime = entry.startTime;
              const endTime = startTime + entry.duration;
              const diag = this._diagnoseFreezeWindow(startTime, endTime, entry.duration, entry);
              this._recordLongTask({
                durationMs: entry.duration,
                perfEnd: endTime,
                culprit: diag.culprit,
                category: diag.category,
                details: diag.details
              });
            }
          }
        });
        this._longTaskObserver.observe({ type: "long-animation-frame", buffered: false });
        return;
      }

      // Fallback: legacy Long Tasks API + Hook/Activity/Asset/GC correlation
      if (supported.includes("longtask")) {
        this._loafSupported = false;
        this._longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) {
              const startTime = entry.startTime;
              const endTime = startTime + entry.duration;
              const diag = this._diagnoseFreezeWindow(startTime, endTime, entry.duration, null);
              this._recordLongTask({
                durationMs: entry.duration,
                perfEnd: endTime,
                culprit: diag.culprit,
                category: diag.category,
                details: diag.details
              });
            }
          }
        });
        this._longTaskObserver.observe({ type: "longtask", buffered: false });
      }
    } catch {
      this._longTaskObserver = null;
    }
  }

  _stopLongTaskObserver() {
    if (this._longTaskObserver) {
      try {
        this._longTaskObserver.disconnect();
      } catch {
        // Ignore
      }
      this._longTaskObserver = null;
    }
  }

  _recordLongTask({ durationMs, perfEnd = performance.now(), culprit = "Browser / GPU Stall", category = "Spike", details = "" }) {
    const dur = Number((durationMs || 0).toFixed(1));
    const severity = dur >= 150 ? "critical" : "warning";

    // Merge/deduplicate if a hook spike & its enclosing LoAF fire within 35ms of each other
    const latest = this._longTasks[0];
    if (latest && Math.abs((latest.perfEnd || 0) - perfEnd) <= 35) {
      if (dur > latest.durationMs) {
        if (latest.severity !== "critical" && severity === "critical") this._severeSpikeCount++;
        latest.durationMs = dur;
        latest.severity = severity;
      }
      if (category === "Hook Callback" || latest.category === "Engine / GPU") {
        latest.culprit = culprit;
        latest.category = category;
      }
      if (details && !latest.details.includes(details)) {
        latest.details = latest.details ? `${latest.details} · ${details}` : details;
        latest.context = `${latest.culprit} — ${latest.details}`;
      }
      return;
    }

    this._longTaskCount++;
    if (severity === "critical") this._severeSpikeCount++;

    const now = Date.now();
    this._longTasks.unshift({
      timestamp: now,
      perfEnd,
      timeStr: formatTimeStamp(now),
      durationMs: dur,
      severity,
      culprit,
      category,
      details,
      context: details ? `${culprit} — ${details}` : culprit
    });
    if (this._longTasks.length > 60) this._longTasks.pop();
  }

  /* ----------------------------------------------------------------------- */
  /* Snapshots: Memory, Live Stats, Resource Timing, Deep World Audit        */
  /* ----------------------------------------------------------------------- */

  /**
   * Reads Chromium/Electron JS Heap telemetry (graceful fallback on Firefox).
   */
  getMemorySnapshot() {
    const mem = performance?.memory;
    if (!mem || typeof mem.usedJSHeapSize !== "number") {
      return {
        available: false,
        usedMB: 0,
        totalMB: 0,
        limitMB: 0,
        pct: 0,
        peakMB: 0,
        trendMBPerMin: 0,
        trendLabel: "N/A"
      };
    }

    const usedMB = mem.usedJSHeapSize / (1024 * 1024);
    const totalMB = mem.totalJSHeapSize / (1024 * 1024);
    const limitMB = mem.jsHeapSizeLimit / (1024 * 1024);
    const pct = limitMB > 0 ? Math.round((usedMB / limitMB) * 100) : 0;

    // Estimate memory trend over the last 30–180 seconds
    let trendMBPerMin = 0;
    if (this._heapSamples.length >= 15) {
      const first = this._heapSamples[0];
      const last = this._heapSamples[this._heapSamples.length - 1];
      const elapsedMin = (last.ts - first.ts) / 60000;
      if (elapsedMin >= 0.25) {
        trendMBPerMin = (last.mb - first.mb) / elapsedMin;
      }
    }

    const trendSign = trendMBPerMin > 0.5 ? "+" : "";
    const trendLabel = this._heapSamples.length < 15
      ? "Measuring..."
      : `${trendSign}${trendMBPerMin.toFixed(1)} MB/min`;

    return {
      available: true,
      usedMB: Number(usedMB.toFixed(1)),
      totalMB: Number(totalMB.toFixed(1)),
      limitMB: Number(limitMB.toFixed(0)),
      pct,
      peakMB: Number(Math.max(this._peakHeapMB, usedMB).toFixed(1)),
      trendMBPerMin: Number(trendMBPerMin.toFixed(1)),
      trendLabel
    };
  }

  /**
   * Returns current live FPS, memory, DOM, canvas, and spike stats.
   */
  getLiveMetrics() {
    const mem = this.getMemorySnapshot();
    const pixiFps = Math.round(canvas?.app?.ticker?.FPS || 0);
    const fps = this._currentFps || pixiFps || 0;
    const avgHistoryFps = this._history.length > 0
      ? Math.round(this._history.reduce((s, h) => s + h.fps, 0) / this._history.length)
      : fps;
    const minHistoryFps = this._history.length > 0
      ? this._history.reduce((m, h) => Math.min(m, h.fps), 999)
      : fps;

    const domNodes = document.getElementsByTagName("*").length;
    const openWindows = (foundry?.applications?.instances?.size || 0) + Object.keys(ui?.windows || {}).length;
    const totalErrors = this._errors.reduce((s, e) => s + e.count, 0);

    let fpsClass = "good";
    if (fps > 0 && fps < 25) fpsClass = "critical";
    else if (fps > 0 && fps < 45) fpsClass = "warning";

    let memClass = "good";
    if (mem.available) {
      if (mem.pct >= 75 || mem.usedMB >= 1800) memClass = "critical";
      else if (mem.pct >= 55 || mem.usedMB >= 1100 || mem.trendMBPerMin > 20) memClass = "warning";
    }

    let spikeClass = "good";
    if (this._severeSpikeCount >= 5 || this._recentMaxFrameMs >= 200) spikeClass = "critical";
    else if (this._longTaskCount >= 5 || this._recentMaxFrameMs >= 80) spikeClass = "warning";

    let domClass = "good";
    if (domNodes >= 15000) domClass = "critical";
    else if (domNodes >= 8000) domClass = "warning";

    return {
      fps,
      pixiFps,
      avgFps: avgHistoryFps,
      minFps: minHistoryFps === 999 ? 0 : minHistoryFps,
      avgFrameMs: Number(this._avgFrameMs.toFixed(1)),
      maxFrameMs: Number(this._maxFrameMs.toFixed(1)),
      recentMaxFrameMs: Number(this._recentMaxFrameMs.toFixed(1)),
      fpsClass,
      memory: mem,
      memClass,
      longTaskCount: this._longTaskCount,
      severeSpikeCount: this._severeSpikeCount,
      spikeClass,
      domNodes,
      domClass,
      openWindows,
      totalErrors,
      uniqueErrors: this._errors.length,
      hookProfiling: this.hookProfiling,
      burstRemaining: this._burstRemaining,
      history: this._history
    };
  }

  /**
   * Builds SVG polyline points for the 60-second FPS sparkline.
   */
  buildSparklineSVG(width = 340, height = 54) {
    const pts = this._history;
    if (!pts.length) {
      return { linePoints: "", areaPoints: "", hasData: false };
    }
    const maxFps = Math.max(60, ...pts.map(p => p.fps));
    const stepX = pts.length > 1 ? width / (pts.length - 1) : width;

    const coords = pts.map((p, i) => {
      const x = Number((i * stepX).toFixed(1));
      const y = Number((height - 4 - ((Math.min(p.fps, maxFps) / maxFps) * (height - 8))).toFixed(1));
      return `${x},${y}`;
    });

    const linePoints = coords.join(" ");
    const lastX = Number(((pts.length - 1) * stepX).toFixed(1));
    const areaPoints = `0,${height} ${linePoints} ${lastX},${height}`;
    return { linePoints, areaPoints, hasData: true };
  }

  /**
   * Analyzes browser Resource Timing entries to attribute network/asset load weight per module.
   */
  getResourceStats() {
    const byModule = new Map();
    const heavyAssets = [];

    if (typeof performance?.getEntriesByType !== "function") {
      return { byModule, heavyAssets, totalAssets: 0, totalBytes: 0 };
    }

    const entries = performance.getEntriesByType("resource") || [];
    let totalBytes = 0;

    for (const entry of entries) {
      const url = entry.name || "";
      const modId = this.extractPackageFromStack(url, false);
      const sizeBytes = entry.decodedBodySize || entry.transferSize || 0;
      const durationMs = entry.duration || 0;
      totalBytes += sizeBytes;

      let agg = byModule.get(modId);
      if (!agg) {
        agg = { count: 0, totalMs: 0, bytes: 0 };
        byModule.set(modId, agg);
      }
      agg.count++;
      agg.totalMs += durationMs;
      agg.bytes += sizeBytes;

      if (sizeBytes >= 100 * 1024 || durationMs >= 200) {
        let shortName = url;
        try {
          const parsed = new URL(url, window.location.origin);
          shortName = decodeURIComponent(parsed.pathname);
        } catch {
          // Keep raw url
        }
        heavyAssets.push({
          url,
          shortName: shortName.length > 68 ? `...${shortName.slice(-65)}` : shortName,
          moduleId: modId,
          moduleTitle: this.getPackageTitle(modId),
          type: entry.initiatorType || "other",
          sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
          durationMs: Number(durationMs.toFixed(1))
        });
      }
    }

    heavyAssets.sort((a, b) => (b.sizeBytes - a.sizeBytes) || (b.durationMs - a.durationMs));

    return {
      byModule,
      heavyAssets: heavyAssets.slice(0, 20),
      totalAssets: entries.length,
      totalBytes
    };
  }

  /**
   * Runs an on-demand Deep Audit of World Collections, PF2e Actors, Active Scene,
   * WebGL/PIXI cache, and per-module Settings & Document Flag storage (GM only).
   */
  runDeepAudit() {
    if (!this.isUserGM()) return null;
    const t0 = performance.now();

    // 1. World Collections size & count
    const measureCollection = (label, col, icon, cap = 500) => {
      const items = col?.contents || [];
      const count = items.length;
      let bytes = 0;
      const sampleCount = Math.min(count, cap);
      for (let i = 0; i < sampleCount; i++) {
        bytes += safeJsonByteLength(items[i]?.toObject?.(false) ?? items[i]?._source);
      }
      if (count > sampleCount && sampleCount > 0) {
        bytes = Math.round((bytes / sampleCount) * count);
      }
      return {
        label,
        icon,
        count,
        bytes,
        sizeFormatted: formatBytes(bytes),
        estimated: count > sampleCount
      };
    };

    const collections = [
      measureCollection("Actors", game.actors, "fa-solid fa-users", 400),
      measureCollection("Items", game.items, "fa-solid fa-suitcase", 500),
      measureCollection("Scenes", game.scenes, "fa-solid fa-map", 200),
      measureCollection("Journals", game.journal, "fa-solid fa-book-open", 300),
      measureCollection("Chat Messages", game.messages, "fa-solid fa-comments", 600),
      measureCollection("Combats", game.combats, "fa-solid fa-swords", 100),
      measureCollection("Macros", game.macros, "fa-solid fa-code", 300),
      measureCollection("Playlists", game.playlists, "fa-solid fa-music", 100),
      measureCollection("Roll Tables", game.tables, "fa-solid fa-table-list", 200)
    ];

    const totalWorldBytes = collections.reduce((s, c) => s + c.bytes, 0);

    // 2. PF2e Heavy Actors (embedded items + rule elements + byte size)
    const heavyActors = (game.actors?.contents || []).map(actor => {
      const itemCount = actor.items?.size || 0;
      const ruleCount = Array.isArray(actor.rules) ? actor.rules.length : 0;
      const bytes = safeJsonByteLength(actor._source);
      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        itemCount,
        ruleCount,
        bytes,
        sizeFormatted: formatBytes(bytes),
        isHeavy: itemCount >= 120 || bytes >= 250 * 1024
      };
    }).sort((a, b) => (b.bytes - a.bytes) || (b.itemCount - a.itemCount)).slice(0, 10);

    // 3. Heaviest Scenes
    const heavyScenes = (game.scenes?.contents || []).map(scene => {
      const walls = scene.walls?.size || 0;
      const lights = scene.lights?.size || 0;
      const tokens = scene.tokens?.size || 0;
      const tiles = scene.tiles?.size || 0;
      const sounds = scene.sounds?.size || 0;
      const notes = scene.notes?.size || 0;
      const regions = scene.regions?.size || 0;
      const w = scene.width || 0;
      const h = scene.height || 0;
      const megapixels = Number(((w * h) / 1000000).toFixed(1));
      const complexity = walls + (lights * 4) + (tokens * 3) + (tiles * 2) + (megapixels * 10);
      return {
        id: scene.id,
        name: scene.name,
        active: scene.active,
        isViewed: canvas?.scene?.id === scene.id,
        dimensions: `${w} × ${h}`,
        megapixels,
        walls,
        lights,
        tokens,
        tiles,
        sounds,
        notes,
        regions,
        complexity: Math.round(complexity),
        isHeavy: walls >= 400 || lights >= 35 || tokens >= 50 || megapixels >= 40
      };
    }).sort((a, b) => b.complexity - a.complexity).slice(0, 10);

    // 4. Per-Module Data Bloat (Settings + Document Flags)
    const storageByModule = new Map();
    const addStorage = (modId, bytes, kind) => {
      if (!modId || bytes <= 0) return;
      let rec = storageByModule.get(modId);
      if (!rec) {
        rec = { settingsBytes: 0, flagsBytes: 0, totalBytes: 0 };
        storageByModule.set(modId, rec);
      }
      if (kind === "settings") rec.settingsBytes += bytes;
      else rec.flagsBytes += bytes;
      rec.totalBytes = rec.settingsBytes + rec.flagsBytes;
    };

    // World settings storage
    try {
      const worldStorage = game.settings?.storage?.get?.("world");
      if (worldStorage) {
        for (const settingDoc of worldStorage.values()) {
          const fullKey = settingDoc?.key || "";
          const ns = fullKey.split(".")[0];
          if (!ns || ns === "core") continue;
          const id = ns === game.system?.id ? `system:${ns}` : ns;
          addStorage(id, safeJsonByteLength(settingDoc.value), "settings");
        }
      }
    } catch {
      // Ignore storage access errors
    }

    // Document flags across key collections
    const flagCollections = [
      game.actors?.contents || [],
      game.scenes?.contents || [],
      game.items?.contents || [],
      (game.messages?.contents || []).slice(-500),
      game.journal?.contents || [],
      game.users?.contents || []
    ];
    for (const docs of flagCollections) {
      for (const doc of docs) {
        const flags = doc?.flags || doc?._source?.flags;
        if (!flags || typeof flags !== "object") continue;
        for (const [ns, val] of Object.entries(flags)) {
          if (ns === "core" || val == null) continue;
          const id = ns === game.system?.id ? `system:${ns}` : ns;
          addStorage(id, safeJsonByteLength(val), "flags");
        }
      }
    }

    // 5. Active Canvas & WebGL GPU Info
    const activeScene = canvas?.scene;
    let gpuRenderer = "Unavailable";
    let maxTextureSize = 0;
    try {
      const gl = canvas?.app?.renderer?.gl;
      if (gl) {
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "WebGL";
        } else {
          gpuRenderer = gl.getParameter(gl.RENDERER) || "WebGL";
        }
      }
    } catch {
      // Ignore WebGL read errors
    }

    let cachedTextures = 0;
    try {
      const managed = canvas?.app?.renderer?.texture?.managedTextures;
      if (managed) {
        cachedTextures = typeof managed.size === "number" ? managed.size : (managed.length || 0);
      } else if (globalThis.PIXI?.utils?.TextureCache) {
        cachedTextures = Object.keys(PIXI.utils.TextureCache).length;
      }
    } catch {
      // Ignore
    }

    // Core Foundry Performance Settings
    const perfModeMap = { 0: "Low", 1: "Medium", 2: "High", 3: "Maximum" };
    let perfModeLabel = "Unknown";
    let maxFPS = 60;
    let noCanvas = false;
    try {
      const pm = game.settings.get("core", "performanceMode");
      perfModeLabel = perfModeMap[pm] ?? String(pm);
      maxFPS = game.settings.get("core", "maxFPS") ?? 60;
      noCanvas = Boolean(game.settings.get("core", "noCanvas"));
    } catch {
      // Ignore
    }

    const canvasInfo = {
      ready: Boolean(canvas?.ready && activeScene),
      noCanvas,
      sceneName: activeScene?.name || "No Active Scene",
      dimensions: activeScene ? `${activeScene.width} × ${activeScene.height}` : "—",
      megapixels: activeScene ? Number(((activeScene.width * activeScene.height) / 1000000).toFixed(1)) : 0,
      tokens: canvas?.tokens?.placeables?.length || 0,
      walls: canvas?.walls?.placeables?.length || 0,
      lights: canvas?.lighting?.placeables?.length || 0,
      sounds: canvas?.sounds?.placeables?.length || 0,
      tiles: canvas?.tiles?.placeables?.length || 0,
      drawings: canvas?.drawings?.placeables?.length || 0,
      notes: canvas?.notes?.placeables?.length || 0,
      regions: canvas?.regions?.placeables?.length || 0,
      cachedTextures,
      gpuRenderer,
      maxTextureSize,
      perfModeLabel,
      maxFPS
    };

    const scanMs = Number((performance.now() - t0).toFixed(1));

    this._auditData = {
      timestamp: Date.now(),
      timeStr: formatTimeStamp(Date.now()),
      scanMs,
      collections,
      totalWorldBytes,
      totalWorldFormatted: formatBytes(totalWorldBytes),
      compendiumCount: game.packs?.size || 0,
      heavyActors,
      heavyScenes,
      storageByModule,
      canvasInfo,
      chatCount: game.messages?.size || 0,
      actorCount: game.actors?.size || 0
    };

    this._notify(true);
    return this._auditData;
  }

  /**
   * Builds the unified per-module impact leaderboard combining:
   * errors, hook CPU timings, registered hook count, resource assets, and stored data bloat.
   */
  getModuleBreakdown() {
    const resourceStats = this.getResourceStats();
    const storageMap = this._auditData?.storageByModule || new Map();

    // Count currently registered hooks per module
    const hookCountByMod = new Map();
    const events = Hooks.events || {};
    for (const entries of Object.values(events)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const owner = this._resolveHookEntryOwner(entry);
        hookCountByMod.set(owner, (hookCountByMod.get(owner) || 0) + 1);
      }
    }

    // Collect all active module IDs + system + any module with recorded activity
    const ids = new Set();
    if (game?.modules) {
      for (const mod of game.modules.values()) {
        if (mod.active) ids.add(mod.id);
      }
    }
    if (game?.system?.id) ids.add(`system:${game.system.id}`);
    for (const id of this._moduleHookStats.keys()) ids.add(id);
    for (const id of this._loafSpikesByModule.keys()) ids.add(id);
    for (const id of this._errorCountByModule.keys()) ids.add(id);
    for (const id of resourceStats.byModule.keys()) ids.add(id);
    for (const id of storageMap.keys()) ids.add(id);

    const rows = [];
    for (const id of ids) {
      if (id === "unknown" && !this._moduleHookStats.has(id) && !this._errorCountByModule.has(id)) continue;

      const mod = game?.modules?.get?.(id);
      const isSystem = id.startsWith("system:");
      const isCore = id === "core";
      const isUnknown = id === "unknown";
      const isSelf = id === MODULE_ID;

      const errors = this._errorCountByModule.get(id) || 0;
      const hStat = this._moduleHookStats.get(id);
      const loafStat = this._loafSpikesByModule.get(id);
      const hookCount = hookCountByMod.get(id) || 0;
      const rStat = resourceStats.byModule.get(id);
      const sStat = storageMap.get(id);

      const hookCalls = hStat?.calls || 0;
      const hookTotalMs = (hStat?.totalMs || 0);
      const hookAvgMs = hookCalls > 0 ? (hookTotalMs / hookCalls) : 0;
      const hookMaxMs = Math.max(hStat?.maxMs || 0, loafStat?.maxMs || 0);
      const slowestHook = hStat?.slowestHook || (loafStat?.lastScript ? `Script: ${loafStat.lastScript}` : "");
      const loafSpikes = loafStat?.count || 0;
      const loafTotalMs = loafStat?.totalMs || 0;

      const assetCount = rStat?.count || 0;
      const assetLoadMs = rStat?.totalMs || 0;
      const assetBytes = rStat?.bytes || 0;

      const storageBytes = sStat?.totalBytes ?? null;
      const settingsBytes = sStat?.settingsBytes ?? 0;
      const flagsBytes = sStat?.flagsBytes ?? 0;

      // Calculate composite impact score to bubble problematic modules to the top
      let impactScore = 0;
      impactScore += errors * 40;
      impactScore += Math.min(80, (hookTotalMs + loafTotalMs) / 5);
      impactScore += loafSpikes * 12;
      impactScore += hookMaxMs >= 50 ? 35 : (hookMaxMs >= 16 ? 15 : 0);
      impactScore += assetBytes >= 5 * 1024 * 1024 ? 25 : (assetBytes >= 1024 * 1024 ? 10 : 0);
      impactScore += assetLoadMs >= 1500 ? 15 : (assetLoadMs >= 500 ? 6 : 0);
      if (storageBytes != null) {
        impactScore += storageBytes >= 2 * 1024 * 1024 ? 30 : (storageBytes >= 500 * 1024 ? 12 : 0);
      }
      impactScore = Math.round(impactScore);

      let impactLevel = "low";
      let impactLabel = "Low";
      if (errors > 0 || impactScore >= 60 || hookMaxMs >= 80) {
        impactLevel = "critical";
        impactLabel = errors > 0 ? "Errors" : "High";
      } else if (impactScore >= 25 || hookTotalMs >= 50 || hookMaxMs >= 20 || loafSpikes > 0) {
        impactLevel = "warning";
        impactLabel = "Medium";
      }

      const combinedCpuMs = hookTotalMs + (hookCalls === 0 ? loafTotalMs : 0);
      rows.push({
        id,
        title: this.getPackageTitle(id),
        version: mod?.version || (isSystem ? game.system?.version : (isCore ? game.version : "")),
        isModule: Boolean(mod),
        isSystem,
        isCore,
        isUnknown,
        isSelf,
        errors,
        hasErrors: errors > 0,
        loafSpikes,
        hasLoafSpikes: loafSpikes > 0,
        hookCount,
        hookCalls,
        hookTotalMs: Number(combinedCpuMs.toFixed(2)),
        hookTotalFormatted: (hookCalls > 0 || loafSpikes > 0) ? formatMs(combinedCpuMs) : "—",
        hookAvgMs: Number(hookAvgMs.toFixed(2)),
        hookMaxMs: Number(hookMaxMs.toFixed(2)),
        hookMaxFormatted: (hookCalls > 0 || loafSpikes > 0) ? formatMs(hookMaxMs) : "—",
        slowestHook,
        assetCount,
        assetLoadMs: Number(assetLoadMs.toFixed(0)),
        assetLoadFormatted: assetCount > 0 ? formatMs(assetLoadMs) : "—",
        assetBytes,
        assetSizeFormatted: assetBytes > 0 ? formatBytes(assetBytes) : "—",
        storageBytes: storageBytes ?? -1,
        storageFormatted: storageBytes != null ? formatBytes(storageBytes) : "Run Audit",
        storageTooltip: storageBytes != null
          ? `Settings: ${formatBytes(settingsBytes)} | Document Flags: ${formatBytes(flagsBytes)}`
          : "Click 'Run Deep Audit' to scan world settings & document flags",
        impactScore,
        impactLevel,
        impactLabel,
        isFlagged: impactLevel === "critical" || impactLevel === "warning"
      });
    }

    return rows;
  }

  /**
   * Returns sorted hot-hooks table from Live Hook Profiler data.
   */
  getHotHooks(sortBy = "totalMs") {
    const list = [];
    for (const stat of this._hookStats.values()) {
      const avgMs = stat.calls > 0 ? (stat.totalMs / stat.calls) : 0;
      const listeners = Hooks.events?.[stat.hook]?.length || 0;
      const mods = Array.from(stat.modules).map(m => this.getPackageTitle(m));
      list.push({
        hook: stat.hook,
        calls: stat.calls,
        totalMs: Number(stat.totalMs.toFixed(2)),
        totalFormatted: formatMs(stat.totalMs),
        avgMs: Number(avgMs.toFixed(2)),
        avgFormatted: formatMs(avgMs),
        maxMs: Number(stat.maxMs.toFixed(2)),
        maxFormatted: formatMs(stat.maxMs),
        listeners,
        modulesText: mods.slice(0, 3).join(", ") + (mods.length > 3 ? ` (+${mods.length - 3})` : ""),
        isSlow: stat.maxMs >= 50 || stat.totalMs >= 100
      });
    }

    list.sort((a, b) => {
      if (sortBy === "maxMs") return b.maxMs - a.maxMs;
      if (sortBy === "calls") return b.calls - a.calls;
      if (sortBy === "avgMs") return b.avgMs - a.avgMs;
      return b.totalMs - a.totalMs;
    });
    return list;
  }

  /**
   * Computes overall Health Score (0-100) and actionable PF2e diagnostics list.
   */
  getHealthDiagnostics(liveMetrics, moduleRows) {
    let score = 100;
    const issues = [];

    // 1. Runtime errors from modules
    const erroredModules = moduleRows.filter(m => m.errors > 0 && !m.isCore);
    if (erroredModules.length > 0) {
      score -= Math.min(35, erroredModules.length * 12);
      const top = erroredModules.sort((a, b) => b.errors - a.errors).slice(0, 3);
      issues.push({
        severity: "critical",
        icon: "fa-solid fa-bug",
        category: "Runtime Errors",
        title: `${erroredModules.length} package(s) throwing runtime errors`,
        detail: top.map(m => `${m.title} (${m.errors}×)`).join(", "),
        suggestion: "Open the Errors tab to inspect stack traces, check for module updates, or disable broken modules."
      });
    }

    // 2. FPS & Frame Timing
    if (liveMetrics.fps > 0 && liveMetrics.fps < 25) {
      score -= 25;
      issues.push({
        severity: "critical",
        icon: "fa-solid fa-gauge-simple",
        category: "Frame Rate",
        title: `Low Canvas FPS (${liveMetrics.fps} FPS / ${liveMetrics.avgFrameMs} ms frame time)`,
        detail: "Canvas rendering is struggling to maintain smooth animation.",
        suggestion: "Lower Foundry Performance Mode, reduce dynamic lights/walls on this scene, or run a 10s Hook Profile."
      });
    } else if (liveMetrics.fps > 0 && liveMetrics.fps < 45) {
      score -= 10;
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-gauge",
        category: "Frame Rate",
        title: `Moderate Frame Rate Drop (${liveMetrics.fps} FPS)`,
        detail: `Average frame time is ${liveMetrics.avgFrameMs} ms (recent max spike ${liveMetrics.recentMaxFrameMs} ms).`,
        suggestion: "Check the World & Canvas tab for scene complexity and run a 10s Hook Profile during gameplay."
      });
    }

    // 3. Severe Freezes / Long Tasks
    if (liveMetrics.severeSpikeCount >= 3) {
      score -= 15;
      issues.push({
        severity: "critical",
        icon: "fa-solid fa-bolt",
        category: "Main-Thread Stutters",
        title: `${liveMetrics.severeSpikeCount} severe freeze(s) over 150ms detected`,
        detail: `Total >50ms stutters: ${liveMetrics.longTaskCount}. Peak frame spike: ${liveMetrics.maxFrameMs} ms.`,
        suggestion: "Start the 10s Burst Hook Profiler and repeat the action that causes lag to pinpoint the exact module."
      });
    } else if (liveMetrics.longTaskCount >= 8) {
      score -= 8;
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-bolt",
        category: "Main-Thread Stutters",
        title: `${liveMetrics.longTaskCount} minor main-thread pauses (>50ms)`,
        detail: `Peak frame spike: ${liveMetrics.maxFrameMs} ms.`,
        suggestion: "Review the Hooks & Spikes tab to see which hooks take longest."
      });
    }

    // 4. Memory Pressure / Growth
    if (liveMetrics.memory.available) {
      if (liveMetrics.memory.pct >= 75 || liveMetrics.memory.usedMB >= 1800) {
        score -= 20;
        issues.push({
          severity: "critical",
          icon: "fa-solid fa-memory",
          category: "Memory",
          title: `High JS Heap Memory Usage (${liveMetrics.memory.usedMB} MB / ${liveMetrics.memory.pct}%)`,
          detail: `Peak heap: ${liveMetrics.memory.peakMB} MB. Trend: ${liveMetrics.memory.trendLabel}.`,
          suggestion: "Reload Foundry to flush cached textures, move unused Actors/Scenes to Compendiums, and flush Chat Log."
        });
      } else if (liveMetrics.memory.trendMBPerMin >= 20) {
        score -= 10;
        issues.push({
          severity: "warning",
          icon: "fa-solid fa-memory",
          category: "Memory Growth",
          title: `Rapid Memory Growth Detected (${liveMetrics.memory.trendLabel})`,
          detail: `Current heap: ${liveMetrics.memory.usedMB} MB (Peak: ${liveMetrics.memory.peakMB} MB).`,
          suggestion: "Watch if memory drops after garbage collection. Persistent climb can indicate a leaking canvas/UI module."
        });
      }
    }

    // 5. PF2e Chat Log Bloat (Huge PF2e performance killer!)
    const chatCount = game.messages?.size || 0;
    if (chatCount >= 1000) {
      score -= 15;
      issues.push({
        severity: "critical",
        icon: "fa-solid fa-comments",
        category: "PF2e Chat Bloat",
        title: `Very Large Chat Log (${chatCount.toLocaleString()} messages)`,
        detail: "PF2e chat cards carry rich roll & rule data; over 1,000 messages slows load times and consumes memory for every player.",
        suggestion: "Export your chat log from the Chat sidebar and clear old messages."
      });
    } else if (chatCount >= 350) {
      score -= 6;
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-comments",
        category: "PF2e Chat Bloat",
        title: `Growing Chat Log (${chatCount.toLocaleString()} messages)`,
        detail: "Keeping chat history compact helps keep player browser memory low in PF2e.",
        suggestion: "Consider clearing chat messages between adventures."
      });
    }

    // 6. Active Scene Complexity
    const activeScene = canvas?.scene;
    if (activeScene) {
      const walls = activeScene.walls?.size || 0;
      const lights = activeScene.lights?.size || 0;
      const tokens = activeScene.tokens?.size || 0;
      const mp = (activeScene.width * activeScene.height) / 1000000;
      if (walls >= 500 || lights >= 40 || tokens >= 60 || mp >= 45) {
        score -= 12;
        issues.push({
          severity: "warning",
          icon: "fa-solid fa-map",
          category: "Active Scene Load",
          title: `Heavy Active Scene: "${activeScene.name}"`,
          detail: `${activeScene.width}×${activeScene.height} (${mp.toFixed(1)} MP), ${walls} walls, ${lights} lights, ${tokens} tokens.`,
          suggestion: "Merge redundant wall segments, disable animations on distant lights, or split giant maps into linked scenes."
        });
      }
    }

    // 7. Active Module Count
    const activeModsCount = game.modules ? Array.from(game.modules.values()).filter(m => m.active).length : 0;
    if (activeModsCount >= 100) {
      score -= 10;
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-cubes",
        category: "Module Count",
        title: `${activeModsCount} Active Modules Loaded`,
        detail: "Large module lists increase hook fan-out, startup time, and memory usage across all clients.",
        suggestion: "Review the Modules tab sorted by Impact Score to identify candidates to disable."
      });
    } else if (activeModsCount >= 60) {
      score -= 4;
      issues.push({
        severity: "info",
        icon: "fa-solid fa-cubes",
        category: "Module Count",
        title: `${activeModsCount} Active Modules Loaded`,
        detail: "Moderate-to-large module load. Keep unused modules disabled when not needed.",
        suggestion: "Use the Modules tab to inspect asset size, hook CPU time, and stored flags per module."
      });
    }

    // 8. Heavy Hook CPU Spikes
    const slowHookMods = moduleRows.filter(m => !m.isCore && (m.hookMaxMs >= 50 || m.hookTotalMs >= 250));
    if (slowHookMods.length > 0) {
      score -= 12;
      const top = slowHookMods.sort((a, b) => b.hookTotalMs - a.hookTotalMs).slice(0, 3);
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-stopwatch",
        category: "Slow Module Hooks",
        title: `${slowHookMods.length} package(s) showing heavy Hook CPU time`,
        detail: top.map(m => `${m.title} (${m.hookTotalFormatted}, max ${m.hookMaxFormatted} in ${m.slowestHook})`).join("; "),
        suggestion: "Inspect the Hooks & Spikes tab to see which events are causing slowdowns."
      });
    }

    // 9. DOM Node Bloat
    if (liveMetrics.domNodes >= 15000) {
      score -= 10;
      issues.push({
        severity: "warning",
        icon: "fa-solid fa-code",
        category: "DOM Complexity",
        title: `High DOM Node Count (${liveMetrics.domNodes.toLocaleString()} elements)`,
        detail: "Excessive HTML elements slow browser layout & style recalculation.",
        suggestion: "Close unused character sheets/journals and clear old chat messages."
      });
    }

    // 10. Deep Audit Findings (if run)
    if (this._auditData) {
      const bloatedActors = this._auditData.heavyActors.filter(a => a.itemCount >= 150);
      if (bloatedActors.length > 0) {
        score -= 6;
        issues.push({
          severity: "warning",
          icon: "fa-solid fa-user-shield",
          category: "PF2e Actor Bloat",
          title: `${bloatedActors.length} Actor(s) with 150+ embedded items`,
          detail: bloatedActors.slice(0, 3).map(a => `${a.name} (${a.itemCount} items, ${a.sizeFormatted})`).join(", "),
          suggestion: "PF2e evaluates rule elements on actors frequently. Clean up huge loot stashes or move archived NPCs to Compendiums."
        });
      }

      const bloatedModStorage = moduleRows.filter(m => m.storageBytes >= 2 * 1024 * 1024);
      if (bloatedModStorage.length > 0) {
        score -= 8;
        issues.push({
          severity: "warning",
          icon: "fa-solid fa-database",
          category: "Module Data Bloat",
          title: `${bloatedModStorage.length} module(s) storing over 2 MB in Settings/Flags`,
          detail: bloatedModStorage.slice(0, 3).map(m => `${m.title} (${m.storageFormatted})`).join(", "),
          suggestion: "Check those modules' cleanup/purge settings to shrink world load times."
        });
      }
    }

    score = Math.max(0, Math.min(100, score));
    let grade = "Healthy";
    let statusClass = "good";
    if (score < 55) {
      grade = "Needs Attention";
      statusClass = "critical";
    } else if (score < 80) {
      grade = "Fair";
      statusClass = "warning";
    }

    if (issues.length === 0) {
      issues.push({
        severity: "good",
        icon: "fa-solid fa-circle-check",
        category: "All Clear",
        title: "No Major Performance Bottlenecks Detected",
        detail: "FPS, memory, error rates, and scene complexity look healthy right now.",
        suggestion: "Run a 'Deep Audit' or '10s Burst Hook Profile' while performing an action if you notice intermittent lag."
      });
    }

    return { score, grade, statusClass, issues };
  }

  /**
   * Generates a clean Markdown diagnostic report for copying or troubleshooting.
   */
  generateReportText() {
    const live = this.getLiveMetrics();
    const mods = this.getModuleBreakdown().sort((a, b) => b.impactScore - a.impactScore);
    const health = this.getHealthDiagnostics(live, mods);
    const activeCount = game.modules ? Array.from(game.modules.values()).filter(m => m.active).length : 0;

    const lines = [
      `# Foundry VTT Performance Diagnostic Report`,
      `- **Generated:** ${new Date().toLocaleString()}`,
      `- **Foundry VTT:** v${game.version} | **System:** ${game.system?.title} v${game.system?.version}`,
      `- **Active Modules:** ${activeCount}`,
      `- **Health Score:** ${health.score}/100 (${health.grade})`,
      ``,
      `## Live Telemetry`,
      `- **FPS:** ${live.fps} FPS (Avg: ${live.avgFps}, Min: ${live.minFps}) | **Avg Frame:** ${live.avgFrameMs} ms | **Peak Spike:** ${live.maxFrameMs} ms`,
      `- **JS Heap Memory:** ${live.memory.available ? `${live.memory.usedMB} MB / ${live.memory.limitMB} MB (${live.memory.pct}%, Peak: ${live.memory.peakMB} MB, Trend: ${live.memory.trendLabel})` : "Unavailable in this browser"}`,
      `- **Long Tasks (>50ms):** ${live.longTaskCount} (Severe >150ms: ${live.severeSpikeCount})`,
      `- **DOM Nodes:** ${live.domNodes.toLocaleString()} | **Open Windows:** ${live.openWindows} | **Chat Messages:** ${game.messages?.size || 0}`,
      `- **Captured Errors:** ${live.totalErrors} total (${live.uniqueErrors} unique)`,
      ``
    ];

    if (health.issues.length > 0) {
      lines.push(`## Diagnostics & Issues`);
      for (const iss of health.issues) {
        lines.push(`- **[${iss.severity.toUpperCase()}] ${iss.title}**: ${iss.detail}`);
      }
      lines.push(``);
    }

    const topMods = mods.filter(m => !m.isCore).slice(0, 12);
    if (topMods.length > 0) {
      lines.push(`## Top Modules by Impact`);
      for (const m of topMods) {
        lines.push(`- **${m.title}** (\`${m.id}\` v${m.version || "?"}) — Score: ${m.impactScore} | Errors: ${m.errors} | Hooks CPU: ${m.hookTotalFormatted} (max ${m.hookMaxFormatted}) | Assets: ${m.assetSizeFormatted} (${m.assetLoadFormatted}) | Data: ${m.storageFormatted}`);
      }
      lines.push(``);
    }

    if (this._errors.length > 0) {
      lines.push(`## Recent Errors`);
      for (const e of this._errors.slice(0, 10)) {
        lines.push(`- [${e.timeStr}] **${e.moduleTitle}** (${e.source}, ${e.count}×): ${e.message}`);
      }
      lines.push(``);
    }

    if (this._auditData) {
      const c = this._auditData.canvasInfo;
      lines.push(`## Active Scene & World Audit`);
      lines.push(`- **Scene:** ${c.sceneName} (${c.dimensions}, ${c.megapixels} MP) — Walls: ${c.walls}, Lights: ${c.lights}, Tokens: ${c.tokens}, Tiles: ${c.tiles}, Cached Textures: ${c.cachedTextures}`);
      lines.push(`- **GPU:** ${c.gpuRenderer} (Max Texture: ${c.maxTextureSize}px) | **Perf Mode:** ${c.perfModeLabel} (Max FPS: ${c.maxFPS})`);
      lines.push(`- **World Payload Estimate:** ${this._auditData.totalWorldFormatted} across ${this._auditData.collections.map(x => `${x.label}: ${x.count} (${x.sizeFormatted})`).join(", ")}`);
    }

    return lines.join("\n");
  }
}

export const performanceMonitor = new PerformanceMonitorEngine();

/* ------------------------------------------------------------------------- */
/* 2. PERFORMANCE CHECKER DASHBOARD (ApplicationV2)                          */
/* ------------------------------------------------------------------------- */

export class PerformanceMonitorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);

    this._activeTab = "overview";      // 'overview' | 'modules' | 'hooks' | 'world' | 'errors'
    this._moduleSort = "impact";       // 'impact' | 'hookMs' | 'errors' | 'assets' | 'loadMs' | 'storage' | 'hooks' | 'name'
    this._moduleQuery = "";
    this._flaggedOnly = false;
    this._hookSort = "totalMs";        // 'totalMs' | 'maxMs' | 'calls' | 'avgMs'
    this._unsubscribe = null;
    this._onKeyDownBound = null;
    this._onToggleHudCallback = options.onToggleHud || null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-performance-monitor",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-perf-monitor-window"],
    window: {
      frame: true,
      title: "PF2E_AWESOME_GM.PerformanceMonitor.Title",
      icon: "fa-solid fa-gauge-high",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 840,
      height: 640
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/performance-monitor.hbs`
    }
  };

  render(options = {}, _legacyOptions = {}) {
    if (!performanceMonitor.isUserGM()) return this;
    if (typeof options === "boolean") {
      options = { force: options };
    }
    return super.render(options, _legacyOptions);
  }

  toggle() {
    if (!performanceMonitor.isUserGM()) return;
    if (this.rendered) {
      this.close();
    } else {
      if (!performanceMonitor.enabled) performanceMonitor.activate();
      this.render({ force: true });
    }
  }

  async _prepareContext(_options) {
    const live = performanceMonitor.getLiveMetrics();
    const sparkline = performanceMonitor.buildSparklineSVG(360, 56);
    const allModules = performanceMonitor.getModuleBreakdown();
    const health = performanceMonitor.getHealthDiagnostics(live, allModules);
    const resourceStats = performanceMonitor.getResourceStats();
    const hotHooks = performanceMonitor.getHotHooks(this._hookSort);

    // Filter & sort modules table
    const query = this._moduleQuery.trim().toLowerCase();
    let modules = allModules.filter(m => {
      if (this._flaggedOnly && !m.isFlagged) return false;
      if (query) {
        return m.title.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
      }
      return true;
    });

    modules.sort((a, b) => {
      switch (this._moduleSort) {
        case "hookMs": return (b.hookTotalMs - a.hookTotalMs) || (b.hookMaxMs - a.hookMaxMs);
        case "errors": return (b.errors - a.errors) || (b.impactScore - a.impactScore);
        case "assets": return (b.assetBytes - a.assetBytes) || (b.assetLoadMs - a.assetLoadMs);
        case "loadMs": return (b.assetLoadMs - a.assetLoadMs) || (b.assetBytes - a.assetBytes);
        case "storage": return (b.storageBytes - a.storageBytes) || (b.impactScore - a.impactScore);
        case "hooks": return (b.hookCount - a.hookCount) || (b.hookTotalMs - a.hookTotalMs);
        case "name": return a.title.localeCompare(b.title);
        case "impact":
        default:
          return (b.impactScore - a.impactScore) || (b.errors - a.errors) || (b.hookTotalMs - a.hookTotalMs) || (b.assetBytes - a.assetBytes);
      }
    });

    const activeModuleCount = game.modules ? Array.from(game.modules.values()).filter(m => m.active).length : 0;
    const flaggedCount = allModules.filter(m => m.isFlagged).length;

    return {
      isGM: Boolean(game.user?.isGM),
      activeTab: this._activeTab,
      isOverviewTab: this._activeTab === "overview",
      isModulesTab: this._activeTab === "modules",
      isHooksTab: this._activeTab === "hooks",
      isWorldTab: this._activeTab === "world",
      isErrorsTab: this._activeTab === "errors",

      live,
      sparkline,
      health,
      startupAttributed: performanceMonitor._startupAttributed,
      loafSupported: performanceMonitor._loafSupported,
      hasHookData: hotHooks.length > 0,

      modules,
      activeModuleCount,
      flaggedCount,
      moduleSort: this._moduleSort,
      moduleQuery: this._moduleQuery,
      flaggedOnly: this._flaggedOnly,

      hotHooks: hotHooks.slice(0, 60),
      hookSort: this._hookSort,
      longTasks: performanceMonitor._longTasks,
      hasLongTasks: performanceMonitor._longTasks.length > 0,

      audit: performanceMonitor._auditData,
      hasAudit: Boolean(performanceMonitor._auditData),
      heavyAssets: resourceStats.heavyAssets,
      totalAssetsCount: resourceStats.totalAssets,
      totalAssetsFormatted: formatBytes(resourceStats.totalBytes),

      errors: performanceMonitor._errors.map(e => ({ ...e, hasMultiple: e.count > 1 })),
      hasErrors: performanceMonitor._errors.length > 0
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    // Scope ALL listeners strictly inside inner container so window header buttons (close/popout) work cleanly
    const container = root.querySelector(".pf2e-perf-container");
    if (!container) return;

    // Subscribe to live 1-second ticks (surgical DOM update — no layout thrashing or scroll resets!)
    if (!this._unsubscribe) {
      this._unsubscribe = performanceMonitor.subscribe((fullRender) => {
        if (!this.rendered) return;
        if (fullRender) {
          this.render({ force: false });
        } else {
          this._updateLiveDOM();
        }
      });
    }

    // Escape key to close
    if (!this._onKeyDownBound) {
      this._onKeyDownBound = (e) => {
        if (e.key === "Escape" && this.rendered) {
          e.preventDefault();
          this.close();
        }
      };
      window.addEventListener("keydown", this._onKeyDownBound);
    }

    // Tab switching
    container.querySelectorAll(".perf-tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = btn.dataset.tab;
        if (tab && tab !== this._activeTab) {
          this._activeTab = tab;
          this.render({ force: false });
        }
      });
    });

    // Toolbar & Quick Action buttons
    container.querySelectorAll("[data-perf-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const action = btn.dataset.perfAction;
        await this._handleAction(action, btn);
      });
    });

    // Module search input
    const searchInput = container.querySelector("#perf-module-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this._moduleQuery = e.target.value || "";
        this._filterModuleRowsInPlace(container);
      });
    }

    // Module sort dropdown
    const sortSelect = container.querySelector("#perf-module-sort");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        this._moduleSort = e.target.value || "impact";
        this.render({ force: false });
      });
    }

    // Flagged-only toggle
    const flaggedCb = container.querySelector("#perf-flagged-only");
    if (flaggedCb) {
      flaggedCb.addEventListener("change", (e) => {
        this._flaggedOnly = Boolean(e.target.checked);
        this.render({ force: false });
      });
    }

    // Hook sort dropdown
    const hookSortSelect = container.querySelector("#perf-hook-sort");
    if (hookSortSelect) {
      hookSortSelect.addEventListener("change", (e) => {
        this._hookSort = e.target.value || "totalMs";
        this.render({ force: false });
      });
    }

    // Expandable error stack toggles
    container.querySelectorAll(".perf-error-toggle").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const card = btn.closest(".perf-error-card");
        card?.classList.toggle("expanded");
      });
    });
  }

  /**
   * Filters module rows in place while typing so focus & cursor position never jump.
   */
  _filterModuleRowsInPlace(container) {
    const q = this._moduleQuery.trim().toLowerCase();
    container.querySelectorAll(".perf-mod-row").forEach(row => {
      const title = (row.dataset.title || "").toLowerCase();
      const id = (row.dataset.id || "").toLowerCase();
      const visible = !q || title.includes(q) || id.includes(q);
      row.style.display = visible ? "" : "none";
    });
  }

  async _handleAction(action) {
    switch (action) {
      case "toggle-hook-profiler":
        if (performanceMonitor.hookProfiling) {
          performanceMonitor.stopBurstProfile();
          performanceMonitor.stopHookProfiling();
          ui.notifications?.info("Performance Checker: Live Hook Profiler stopped.");
        } else {
          performanceMonitor.startHookProfiling();
          ui.notifications?.info("Performance Checker: Live Hook Profiler started.");
        }
        break;

      case "burst-profile":
        performanceMonitor.startBurstProfile(10);
        ui.notifications?.info("Performance Checker: Recording hooks for 10 seconds... Perform actions on the canvas now!");
        break;

      case "run-audit":
        performanceMonitor.runDeepAudit();
        ui.notifications?.info("Performance Checker: Deep World, PF2e & Flag Audit complete!");
        break;

      case "reset-stats":
        performanceMonitor.resetStats();
        ui.notifications?.info("Performance Checker: Statistics reset.");
        break;

      case "refresh":
        this.render({ force: false });
        break;

      case "toggle-hud":
        if (this._onToggleHudCallback) {
          this._onToggleHudCallback();
        }
        break;

      case "copy-report": {
        const text = performanceMonitor.generateReportText();
        try {
          await navigator.clipboard.writeText(text);
          ui.notifications?.info("Performance Checker: Diagnostic report copied to clipboard!");
        } catch {
          console.log(text);
          ui.notifications?.warn("Could not write to clipboard; diagnostic report printed to JS Console (F12).");
        }
        break;
      }

      case "manage-modules": {
        if (!game.user?.isGM) {
          ui.notifications?.warn("Only the GM can manage world modules.");
          return;
        }
        const ModMgmt = foundry?.applications?.sidebar?.apps?.ModuleManagement || globalThis.ModuleManagement;
        if (ModMgmt) {
          new ModMgmt().render({ force: true });
        } else {
          ui.notifications?.warn("Could not open Manage Modules dialog.");
        }
        break;
      }

      case "open-tab-errors":
        this._activeTab = "errors";
        this.render({ force: false });
        break;

      case "open-tab-modules":
        this._activeTab = "modules";
        this.render({ force: false });
        break;
    }
  }

  /**
   * Lightweight 1-second surgical DOM patch (avoids full Handlebars re-render).
   */
  _updateLiveDOM() {
    const root = this.element;
    if (!root) return;
    const live = performanceMonitor.getLiveMetrics();

    const setText = (sel, text) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = text;
    };

    setText("[data-live='fps']", String(live.fps));
    setText("[data-live='frame-ms']", `${live.avgFrameMs} ms avg`);
    setText("[data-live='fps-range']", `Avg ${live.avgFps} · Min ${live.minFps}`);

    if (live.memory.available) {
      setText("[data-live='heap-used']", `${live.memory.usedMB} MB`);
      setText("[data-live='heap-sub']", `${live.memory.pct}% of ${live.memory.limitMB} MB · ${live.memory.trendLabel}`);
      const bar = root.querySelector("[data-live='heap-bar']");
      if (bar) bar.style.width = `${Math.min(100, live.memory.pct)}%`;
    }

    setText("[data-live='spikes']", String(live.longTaskCount));
    setText("[data-live='spikes-sub']", `Severe: ${live.severeSpikeCount} · Peak ${live.maxFrameMs} ms`);
    setText("[data-live='dom-nodes']", live.domNodes.toLocaleString());
    setText("[data-live='open-windows']", `${live.openWindows} open windows`);
    setText("[data-live='error-badge']", String(live.totalErrors));

    // Update burst button text if running
    const burstBtn = root.querySelector("[data-perf-action='burst-profile']");
    if (burstBtn) {
      if (live.burstRemaining > 0) {
        burstBtn.innerHTML = `<i class="fa-solid fa-circle-dot fa-fade"></i> Recording (${live.burstRemaining}s)...`;
        burstBtn.classList.add("is-recording");
      } else {
        burstBtn.innerHTML = `<i class="fa-solid fa-stopwatch"></i> 10s Burst Profile`;
        burstBtn.classList.remove("is-recording");
      }
    }

    // Update sparkline SVG polyline smoothly
    const spark = performanceMonitor.buildSparklineSVG(360, 56);
    if (spark.hasData) {
      const poly = root.querySelector("#perf-sparkline-line");
      const area = root.querySelector("#perf-sparkline-area");
      if (poly) poly.setAttribute("points", spark.linePoints);
      if (area) area.setAttribute("points", spark.areaPoints);
    }
  }

  _onClose(options) {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._onKeyDownBound) {
      window.removeEventListener("keydown", this._onKeyDownBound);
      this._onKeyDownBound = null;
    }
    super._onClose?.(options);
  }
}

/* ------------------------------------------------------------------------- */
/* 3. COMPACT LIVE STATS OVERLAY HUD (ApplicationV2)                         */
/* ------------------------------------------------------------------------- */

export class PerformanceHudApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._onOpenDashboard = options.onOpenDashboard || null;
    this._unsubscribe = null;
    this._currentPosition = { left: 110, top: 14 };
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartLeft = 0;
    this._dragStartTop = 0;
    this._onPointerMoveBound = null;
    this._onPointerUpBound = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-performance-hud",
    tag: "div",
    classes: ["pf2e-gm-utility", "pf2e-perf-hud-window"],
    window: {
      frame: false,
      positioned: false,
      resizable: false,
      minimizable: false
    },
    position: {
      width: "auto",
      height: "auto"
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/performance-hud.hbs`
    }
  };

  _insertElement(element) {
    document.body.appendChild(element);
    return element;
  }

  _removeElement(element) {
    element.remove();
  }

  render(options = {}, _legacyOptions = {}) {
    if (!performanceMonitor.isUserGM()) return this;
    if (typeof options === "boolean") {
      options = { force: options };
    }
    try {
      const saved = game.settings.get(MODULE_ID, "perfHudPosition");
      const maxLeft = typeof window !== "undefined" ? (window.innerWidth - 220) : 1000;
      const maxTop = typeof window !== "undefined" ? (window.innerHeight - 50) : 700;
      if (saved && typeof saved.left === "number" && typeof saved.top === "number"
          && saved.left >= 0 && saved.left < maxLeft && saved.top >= 0 && saved.top < maxTop) {
        this._currentPosition = { left: saved.left, top: saved.top };
      }
    } catch {
      // Fallback to default top-left position
    }
    return super.render(options, _legacyOptions);
  }

  toggle() {
    if (!performanceMonitor.isUserGM()) return;
    if (this.rendered) {
      this.close();
    } else {
      if (!performanceMonitor.enabled) performanceMonitor.activate();
      this.render({ force: true });
    }
  }

  async _prepareContext(_options) {
    const live = performanceMonitor.getLiveMetrics();
    let overallClass = "good";
    if (live.totalErrors > 0 || live.fpsClass === "critical" || live.memClass === "critical" || live.spikeClass === "critical") {
      overallClass = "critical";
    } else if (live.fpsClass === "warning" || live.memClass === "warning" || live.spikeClass === "warning") {
      overallClass = "warning";
    }
    return {
      live,
      overallClass
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    root.style.position = "fixed";
    root.style.left = `${this._currentPosition.left}px`;
    root.style.top = `${this._currentPosition.top}px`;
    root.style.zIndex = "95";

    const pill = root.querySelector(".pf2e-perf-hud-pill");
    if (!pill) return;

    // Subscribe to 1-second ticks
    if (!this._unsubscribe) {
      this._unsubscribe = performanceMonitor.subscribe(() => {
        if (this.rendered) this._updateLiveDOM();
      });
    }

    // Open full dashboard
    const openBtn = pill.querySelector("[data-hud-action='open-dashboard']");
    if (openBtn) {
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this._onOpenDashboard) this._onOpenDashboard();
      });
    }

    // Close HUD pill
    const closeBtn = pill.querySelector("[data-hud-action='close-hud']");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // Draggable handle
    const handle = pill.querySelector(".perf-hud-drag");
    if (handle) {
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        this._isDragging = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this._dragStartLeft = this._currentPosition.left;
        this._dragStartTop = this._currentPosition.top;

        this._onPointerMoveBound = (ev) => {
          if (!this._isDragging) return;
          const dx = ev.clientX - this._dragStartX;
          const dy = ev.clientY - this._dragStartY;
          const maxLeft = Math.max(0, window.innerWidth - (root.offsetWidth || 260));
          const maxTop = Math.max(0, window.innerHeight - (root.offsetHeight || 36));
          this._currentPosition.left = Math.max(0, Math.min(maxLeft, this._dragStartLeft + dx));
          this._currentPosition.top = Math.max(0, Math.min(maxTop, this._dragStartTop + dy));
          root.style.left = `${this._currentPosition.left}px`;
          root.style.top = `${this._currentPosition.top}px`;
        };

        this._onPointerUpBound = async () => {
          this._isDragging = false;
          window.removeEventListener("pointermove", this._onPointerMoveBound);
          window.removeEventListener("pointerup", this._onPointerUpBound);
          try {
            await game.settings.set(MODULE_ID, "perfHudPosition", { ...this._currentPosition });
          } catch {
            // Ignore
          }
        };

        window.addEventListener("pointermove", this._onPointerMoveBound);
        window.addEventListener("pointerup", this._onPointerUpBound);
      });
    }
  }

  _updateLiveDOM() {
    const root = this.element;
    if (!root) return;
    const live = performanceMonitor.getLiveMetrics();

    const setText = (sel, text) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = text;
    };

    setText("[data-hud='fps']", `${live.fps} FPS`);
    setText("[data-hud='frame']", `${live.avgFrameMs}ms`);
    if (live.memory.available) {
      setText("[data-hud='mem']", `${live.memory.usedMB} MB`);
    }
    setText("[data-hud='spikes']", `${live.longTaskCount}`);
    setText("[data-hud='errors']", `${live.totalErrors}`);

    const dot = root.querySelector(".perf-hud-led");
    if (dot) {
      dot.classList.remove("good", "warning", "critical");
      if (live.totalErrors > 0 || live.fpsClass === "critical" || live.memClass === "critical" || live.spikeClass === "critical") {
        dot.classList.add("critical");
      } else if (live.fpsClass === "warning" || live.memClass === "warning" || live.spikeClass === "warning") {
        dot.classList.add("warning");
      } else {
        dot.classList.add("good");
      }
    }

    const errChip = root.querySelector(".perf-hud-err-chip");
    if (errChip) {
      errChip.classList.toggle("has-errors", live.totalErrors > 0);
    }

    const recChip = root.querySelector(".perf-hud-rec-chip");
    if (recChip) {
      recChip.style.display = live.hookProfiling ? "inline-flex" : "none";
    }
  }

  _onClose(options) {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._isDragging) {
      this._isDragging = false;
      if (this._onPointerMoveBound) window.removeEventListener("pointermove", this._onPointerMoveBound);
      if (this._onPointerUpBound) window.removeEventListener("pointerup", this._onPointerUpBound);
    }
    super._onClose?.(options);
  }
}
