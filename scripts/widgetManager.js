/**
 * widgetManager.js — creates, places, arranges and persists widgets.
 *
 * The board is a free 16:9 canvas rather than a grid: every widget carries its
 * own position and size as a percentage of that canvas, so a board laid out on
 * a laptop looks the same on the projector. Widgets are dragged by their
 * header, resized from the bottom-right corner, and raised to the front when
 * touched. Placements belong to the active screen of the deck (screens.js).
 *
 * A widget definition looks like:
 *   { id, title, icon, size, singleton, description, create(ctx) }
 * and create(ctx) returns an instance:
 *   { element, destroy?(), openSettings?(), onActive?(isActive), onResize?() }
 *
 * The manager never assumes a widget behaves: every call into widget code is
 * wrapped so one broken widget can only break its own card.
 */

import { el, on, uid, qsa, clamp } from './utils.js';
import { icon } from './ui/icons.js';
import { screens } from './screens.js';
import { sanitizeStyle, openWidgetStyle } from './ui/widgetStyle.js';

/** Default footprints on the canvas, in percent of its width/height. */
const SIZES = {
  md: { w: 24, h: 34 },
  lg: { w: 34, h: 38 },
  xl: { w: 40, h: 54 },
};
const MIN_W = 18;              // narrow enough to tile, wide enough for the header controls
const MIN_H = 16;
const SNAP = 0.5;               // percent — enough to keep edges tidy
// Widgets stack below the ink layer (55), the fixed corner buttons (60), the
// spotlight (80/90) and dialogs (120). Every raise adds one, so the order is
// re-numbered 1..n before it can climb past this.
const Z_CEILING = 50;
// New cards are placed clear of the corner buttons (top) and the dock (bottom).
const TOP_CLEAR = 7;
const DOCK_CLEAR = 15;

const snap = (value) => Math.round(value / SNAP) * SNAP;

export class WidgetManager {
  /**
   * @param {{ canvas: HTMLElement, empty: HTMLElement, board: HTMLElement, storage: object, state: object }} options
   */
  constructor({ canvas, empty, board, storage, state }) {
    this.canvas = canvas;
    this.empty = empty;
    this.board = board;
    this.storage = storage;
    this.state = state;

    this.definitions = new Map();
    this.entries = new Map();   // instanceId -> { entry, instance, frame }
    this.spotlightId = null;
    this.selectedId = null;    // the card whose tools are showing
    this.screenId = null;
    this.topZ = 1;
    this.needsPlacementSave = false;

    on(document, 'visibilitychange', () => this.#broadcastActive(!document.hidden));
    // A click on the empty board puts the tools away.
    on(canvas, 'pointerdown', (event) => { if (event.target === canvas) this.select(null); });
    on(window, 'resize', () => this.#each((record) => this.#safe(record, 'onResize')));
  }

  /* ================= registry ================= */

  register(definition) {
    this.definitions.set(definition.id, definition);
    return this;
  }

  getDefinition(id) { return this.definitions.get(id) || null; }

  listDefinitions() { return Array.from(this.definitions.values()); }

  /** Instances currently on the board for a given widget type. */
  instancesOf(widgetId) {
    return Array.from(this.entries.values()).filter((record) => record.entry.widgetId === widgetId);
  }

  /* ================= screens ================= */

  /** Tear the board down and build the given screen (defaults to the active one). */
  loadScreen(screenId = screens.activeId()) {
    this.#clearBoard();

    const screen = screens.all().find((item) => item.id === screenId) || screens.active();
    this.screenId = screen.id;

    for (const stored of screen.widgets) {
      if (!this.definitions.has(stored.widgetId)) continue;   // widget from a newer build
      const entry = this.#normalise(stored);
      if (entry.hidden) {
        this.entries.set(entry.instanceId, { entry, frame: null, instance: null, backdrop: null });
        continue;
      }
      this.#createFrame(entry);
    }

    if (this.needsPlacementSave || this.topZ > Z_CEILING) {
      this.needsPlacementSave = false;
      this.saveLayout();
      return;
    }
    this.#refreshEmptyState();
    document.dispatchEvent(new CustomEvent('layoutchange'));
  }

  #clearBoard() {
    if (this.spotlightId) this.toggleSpotlight(this.spotlightId, false);
    for (const record of this.entries.values()) {
      this.#destroyInstance(record);
      if (record.frame) record.frame.remove();
    }
    this.entries.clear();
    this.selectedId = null;
    this.topZ = 1;
  }

  /** Fill in anything an older or hand-edited entry is missing. */
  #normalise(stored) {
    const definition = this.definitions.get(stored.widgetId);
    const fallback = SIZES[(definition && definition.size) || 'md'] || SIZES.md;
    const w = clamp(Number(stored.w) || fallback.w, MIN_W, 100);
    const h = clamp(Number(stored.h) || fallback.h, MIN_H, 100);
    const placed = Number.isFinite(stored.x) && Number.isFinite(stored.y);

    const entry = {
      instanceId: stored.instanceId || uid(stored.widgetId),
      widgetId: stored.widgetId,
      w,
      h,
      x: placed ? clamp(stored.x, 0, 100 - w) : 0,
      y: placed ? clamp(stored.y, 0, 100 - h) : 0,
      z: Number(stored.z) || 0,
      minimized: Boolean(stored.minimized),
      hidden: Boolean(stored.hidden),
      style: sanitizeStyle(stored.style),
    };

    // Entries carried over from the grid era have no coordinates yet: place
    // them now and remember to write the placement back once.
    if (!placed) {
      const spot = this.#freeSpot(entry.w, entry.h);
      entry.x = spot.x;
      entry.y = spot.y;
      this.needsPlacementSave = true;
    }
    this.topZ = Math.max(this.topZ, entry.z);
    return entry;
  }

  /**
   * Find somewhere the new widget does not cover an existing one: scan the
   * board top-left to bottom-right in small steps and take the first clear
   * spot. Only when the screen is genuinely full does it cascade instead.
   */
  #freeSpot(w, h) {
    const placed = Array.from(this.entries.values())
      .filter((record) => !record.entry.hidden && record.frame)
      .map((record) => record.entry);

    const STEP = 2;
    const overlaps = (x, y) => placed.some((other) => !(x + w <= other.x || other.x + other.w <= x
      || y + h <= other.y || other.y + other.h <= y));
    const top = Math.min(TOP_CLEAR, 100 - h);
    const bottom = Math.max(top, 100 - h - DOCK_CLEAR);

    for (let y = top; y <= bottom; y += STEP) {
      for (let x = 2; x <= 100 - w; x += STEP) {
        if (!overlaps(x, y)) return { x: snap(x), y: snap(y) };
      }
    }
    // The screen is full. Rather than dropping the widget on top of another
    // one's controls, take the position that covers the least.
    let best = { x: 2, y: top, cover: Infinity };
    for (let y = top; y <= bottom; y += STEP) {
      for (let x = 2; x <= 100 - w; x += STEP) {
        const cover = placed.reduce((sum, other) => {
          const overlapW = Math.max(0, Math.min(x + w, other.x + other.w) - Math.max(x, other.x));
          const overlapH = Math.max(0, Math.min(y + h, other.y + other.h) - Math.max(y, other.y));
          return sum + (overlapW * overlapH);
        }, 0);
        if (cover < best.cover) best = { x, y, cover };
      }
    }
    return { x: snap(best.x), y: snap(best.y) };
  }

  /* ================= layout persistence ================= */

  saveLayout() {
    if (this.topZ > Z_CEILING) this.#compactZ();
    const ordered = Array.from(this.entries.values()).map((record) => ({ ...record.entry }));
    screens.saveWidgets(this.screenId, ordered);
    this.#refreshEmptyState();
    document.dispatchEvent(new CustomEvent('layoutchange'));
  }

  /** Empty the current screen. */
  resetLayout() {
    for (const instanceId of Array.from(this.entries.keys())) this.removeWidget(instanceId, { silent: true });
    this.saveLayout();
  }

  /* ================= lifecycle ================= */

  addWidget(widgetId, options = {}) {
    const definition = this.definitions.get(widgetId);
    if (!definition) return null;

    if (definition.singleton) {
      const existing = this.instancesOf(widgetId)[0];
      if (existing) {
        if (existing.entry.hidden) return this.showWidget(existing.entry.instanceId);
        this.#raise(existing);
        this.#flash(existing.frame);
        return existing.entry.instanceId;
      }
    }

    const footprint = SIZES[options.size || definition.size || 'md'] || SIZES.md;
    const spot = this.#freeSpot(footprint.w, footprint.h);
    const entry = {
      instanceId: uid(widgetId),
      widgetId,
      w: footprint.w,
      h: footprint.h,
      x: spot.x,
      y: spot.y,
      z: (this.topZ += 1),
      minimized: false,
      hidden: false,
      style: sanitizeStyle(this.state.settings.widgetStyle),
    };
    this.#createFrame(entry);
    this.select(entry.instanceId);
    this.saveLayout();
    return entry.instanceId;
  }

  /** Show one card's tools (null puts them all away). */
  select(instanceId) {
    if (this.selectedId === instanceId) return;
    const previous = this.entries.get(this.selectedId);
    if (previous && previous.frame) previous.frame.classList.remove('is-selected');
    this.selectedId = instanceId;
    const next = this.entries.get(instanceId);
    if (next && next.frame) next.frame.classList.add('is-selected');
  }

  removeWidget(instanceId, { silent = false } = {}) {
    const record = this.entries.get(instanceId);
    if (!record) return;
    if (this.spotlightId === instanceId) this.toggleSpotlight(instanceId, false);
    this.#destroyInstance(record);
    // A hidden widget has no frame, so this must stay null-safe.
    if (record.frame) record.frame.remove();
    this.entries.delete(instanceId);
    this.storage.clearWidgetData(instanceId);
    if (!silent) this.saveLayout();
  }

  /** Keeps the widget (and its saved data) but takes it off the board. */
  hideWidget(instanceId) {
    const record = this.entries.get(instanceId);
    if (!record || record.entry.hidden) return;
    if (this.spotlightId === instanceId) this.toggleSpotlight(instanceId, false);
    this.#destroyInstance(record);
    if (record.frame) record.frame.remove();
    record.frame = null;
    record.instance = null;
    record.entry.hidden = true;
    this.saveLayout();
  }

  showWidget(instanceId) {
    const record = this.entries.get(instanceId);
    if (!record || !record.entry.hidden) return instanceId;
    record.entry.hidden = false;
    record.entry.z = (this.topZ += 1);
    this.entries.delete(instanceId);
    this.#createFrame(record.entry);
    this.selectedId = null;
    this.select(instanceId);
    this.saveLayout();
    return instanceId;
  }

  /** Patch an entry (position, size, minimized) and reflect it in the DOM. */
  updateWidget(instanceId, patch = {}) {
    const record = this.entries.get(instanceId);
    if (!record) return;
    Object.assign(record.entry, patch);
    if (record.frame) {
      this.#applyFrame(record);
      const toggle = record.frame.querySelector('[data-role="minimize"]');
      if (toggle) {
        toggle.innerHTML = icon(record.entry.minimized ? 'plus' : 'minus');
        toggle.setAttribute('aria-label', record.entry.minimized ? 'Expand widget' : 'Minimize widget');
        toggle.setAttribute('aria-expanded', String(!record.entry.minimized));
      }
    }
    this.saveLayout();
    this.#safe(record, 'onResize');
  }

  minimizeWidget(instanceId) {
    this.updateWidget(instanceId, { minimized: true });
    this.#safe(this.entries.get(instanceId), 'onActive', false);
  }

  restoreWidget(instanceId) {
    this.updateWidget(instanceId, { minimized: false });
    this.#safe(this.entries.get(instanceId), 'onActive', !document.hidden);
  }

  toggleMinimize(instanceId) {
    const record = this.entries.get(instanceId);
    if (!record) return;
    if (record.entry.minimized) this.restoreWidget(instanceId);
    else this.minimizeWidget(instanceId);
  }

  /** Custom widget theme: { tint, font } on one widget, or on every widget of the screen. */
  setStyle(instanceId, style) {
    const record = this.entries.get(instanceId);
    if (!record) return;
    record.entry.style = sanitizeStyle(style);
    this.#applyFrame(record);
    this.saveLayout();
  }

  styleAll(style) {
    const clean = sanitizeStyle(style);
    this.#each((record) => { record.entry.style = { ...clean }; this.#applyFrame(record); });
    this.saveLayout();
  }

  toggleSpotlight(instanceId, force) {
    const record = this.entries.get(instanceId);
    if (!record || !record.frame) return;
    const next = force === undefined ? this.spotlightId !== instanceId : force;

    if (this.spotlightId && this.spotlightId !== instanceId) this.toggleSpotlight(this.spotlightId, false);

    if (next) {
      record.backdrop = el('div', {
        class: 'spotlight-backdrop',
        onClick: () => this.toggleSpotlight(instanceId, false),
      });
      document.body.append(record.backdrop);
      record.frame.classList.add('is-spotlight');
      this.spotlightId = instanceId;
    } else {
      record.frame.classList.remove('is-spotlight');
      if (record.backdrop) { record.backdrop.remove(); record.backdrop = null; }
      if (this.spotlightId === instanceId) this.spotlightId = null;
    }

    const button = record.frame.querySelector('[data-role="spotlight"]');
    if (button) {
      button.innerHTML = icon(next ? 'collapse' : 'expand');
      button.setAttribute('aria-label', next ? 'Exit spotlight' : 'Spotlight this widget');
      button.setAttribute('aria-pressed', String(next));
    }
    this.#safe(record, 'onResize');
  }

  /** Nudge a widget with the keyboard (percentage steps). */
  move(instanceId, dx, dy) {
    const record = this.entries.get(instanceId);
    if (!record || !record.frame) return;
    const { entry } = record;
    entry.x = snap(clamp(entry.x + dx, 0, 100 - entry.w));
    entry.y = snap(clamp(entry.y + dy, 0, 100 - entry.h));
    this.#applyFrame(record);
    this.saveLayout();
  }

  /* ================= internals ================= */

  #applyFrame(record) {
    const { entry, frame } = record;
    if (!frame) return;
    frame.classList.toggle('is-minimized', entry.minimized);
    frame.style.left = `${entry.x}%`;
    frame.style.top = `${entry.y}%`;
    frame.style.width = `${entry.w}%`;
    frame.style.height = entry.minimized ? 'auto' : `${entry.h}%`;
    frame.style.zIndex = String(entry.z || 1);
    const style = sanitizeStyle(entry.style);
    frame.dataset.tint = style.tint;
    frame.dataset.font = style.font;
    // Tools float above the card, or below it when the card touches the top edge.
    frame.dataset.bar = entry.y < 9 ? 'below' : 'above';
    frame.dataset.barX = entry.x + entry.w > 75 ? 'end' : 'start';
    // On a phone the cards become a list; this keeps it in the board's reading order.
    frame.style.order = String((Math.round(entry.y) * 1000) + Math.round(entry.x));
  }

  /** Renumber the stacking order 1..n, keeping who is in front of whom. */
  #compactZ() {
    const records = Array.from(this.entries.values()).sort((a, b) => (a.entry.z || 0) - (b.entry.z || 0));
    records.forEach((record, index) => {
      record.entry.z = index + 1;
      if (record.frame) record.frame.style.zIndex = String(index + 1);
    });
    this.topZ = records.length;
  }

  #raise(record) {
    if (record.entry.z === this.topZ) return;
    record.entry.z = (this.topZ += 1);
    if (record.frame) record.frame.style.zIndex = String(record.entry.z);
    this.saveLayout();
  }

  #createFrame(entry) {
    const definition = this.definitions.get(entry.widgetId);
    if (!definition) return;

    const grip = el('button', {
      type: 'button', class: 'widget-grip', html: icon('grip'),
      'aria-label': `Move ${definition.title}. Use the arrow keys to move it around the board.`,
    });
    const titleNode = el('h2', { class: 'widget-title', text: definition.title });
    const body = el('div', { class: 'widget-content' });
    const tools = el('div', { class: 'widget-controls' });
    const resizer = el('button', {
      type: 'button', class: 'widget-resize', dataset: { role: 'resize' },
      'aria-label': `Resize ${definition.title}. Use the arrow keys to change its size.`,
    });

    const frame = el('article', {
      class: 'widget',
      // Focusable, so a keyboard can reach a card and then its (hidden) tools.
      tabindex: '0',
      'aria-label': definition.title,
      dataset: { instance: entry.instanceId, widget: entry.widgetId },
    }, [
      el('header', { class: 'widget-header' }, [grip, titleNode, tools]),
      body,
      resizer,
    ]);

    const record = { entry, frame, instance: null, backdrop: null };
    this.entries.set(entry.instanceId, record);
    if (!entry.z) entry.z = (this.topZ += 1);

    // --- build the widget itself, isolated from the shell ---
    let instance = null;
    try {
      instance = definition.create(this.#context(entry, titleNode));
      if (!instance || !instance.element) throw new Error('widget returned no element');
      body.append(instance.element);
    } catch (error) {
      console.error(`[widget:${entry.widgetId}] failed to start`, error);
      body.append(this.#errorCard(definition, entry));
      instance = null;
    }
    record.instance = instance;

    // --- header controls ---
    tools.append(el('button', {
      type: 'button', class: 'iconbtn', dataset: { role: 'minimize' },
      html: icon(entry.minimized ? 'plus' : 'minus'),
      'aria-label': entry.minimized ? 'Expand widget' : 'Minimize widget',
      'aria-expanded': String(!entry.minimized),
      onClick: () => this.toggleMinimize(entry.instanceId),
    }));

    if (instance && typeof instance.openSettings === 'function') {
      tools.append(el('button', {
        type: 'button', class: 'iconbtn', dataset: { role: 'settings' }, html: icon('sliders'),
        'aria-label': `${definition.title} settings`, 'aria-haspopup': 'dialog',
        onClick: () => this.#safe(record, 'openSettings'),
      }));
    }

    tools.append(el('button', {
      type: 'button', class: 'iconbtn', dataset: { role: 'style' }, html: icon('palette'),
      'aria-label': `${definition.title} colour and font`, 'aria-haspopup': 'dialog',
      onClick: () => openWidgetStyle({
        title: definition.title,
        value: record.entry.style,
        onChange: (style) => this.setStyle(entry.instanceId, style),
        onApplyAll: (style) => this.styleAll(style),
        onMakeDefault: (style) => this.state.setWidgetStyle(style),
      }),
    }));

    tools.append(el('button', {
      type: 'button', class: 'iconbtn', dataset: { role: 'spotlight' }, html: icon('expand'),
      'aria-label': 'Spotlight this widget', 'aria-pressed': 'false',
      onClick: () => this.toggleSpotlight(entry.instanceId),
    }));

    tools.append(el('button', {
      type: 'button', class: 'iconbtn', dataset: { role: 'hide' }, html: icon('eyeOff'),
      'aria-label': 'Hide widget (keeps its settings)',
      onClick: () => this.hideWidget(entry.instanceId),
    }));

    tools.append(el('button', {
      type: 'button', class: 'iconbtn iconbtn--danger', dataset: { role: 'remove' }, html: icon('close'),
      'aria-label': `Remove ${definition.title} from the board`,
      onClick: () => this.removeWidget(entry.instanceId),
    }));

    this.#wireDrag(grip, frame, record);
    this.#wireResize(resizer, record);
    on(frame, 'pointerdown', () => { this.#raise(record); this.select(entry.instanceId); });

    this.canvas.append(frame);
    this.#applyFrame(record);
    this.#refreshEmptyState();
  }

  #context(entry, titleNode) {
    const manager = this;
    return {
      instanceId: entry.instanceId,
      state: this.state,
      data: {
        get: (fallback = {}) => ({ ...fallback, ...(manager.storage.loadWidgetData(entry.instanceId) || {}) }),
        set: (value) => manager.storage.saveWidgetData(entry.instanceId, value),
      },
      setTitle: (text) => { titleNode.textContent = text; },
      requestSpotlight: (wanted = true) => manager.toggleSpotlight(entry.instanceId, wanted),
      isActive: () => !document.hidden && !entry.minimized && !entry.hidden,
    };
  }

  #errorCard(definition, entry) {
    return el('div', { class: 'widget-error' }, [
      el('strong', { text: 'This widget could not start' }),
      el('p', { text: `${definition.title} hit an error. The rest of the board is unaffected.` }),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove it',
        onClick: () => this.removeWidget(entry.instanceId),
      }),
    ]);
  }

  #destroyInstance(record) {
    this.#safe(record, 'destroy');
    record.instance = null;
  }

  /** Call a method on a widget instance without letting it take down the app. */
  #safe(record, method, ...args) {
    const instance = record && record.instance;
    if (!instance || typeof instance[method] !== 'function') return undefined;
    try {
      return instance[method](...args);
    } catch (error) {
      console.error(`[widget:${record.entry.widgetId}] ${method}() failed`, error);
      return undefined;
    }
  }

  #each(fn) { for (const record of this.entries.values()) fn(record); }

  #broadcastActive(isActive) {
    this.#each((record) => this.#safe(record, 'onActive', isActive && !record.entry.minimized));
  }

  #refreshEmptyState() {
    if (this.empty) this.empty.hidden = qsa('.widget', this.canvas).length > 0;
  }

  #flash(frame) {
    frame.animate?.(
      [{ boxShadow: '0 0 0 0 var(--accent)' }, { boxShadow: '0 0 0 6px transparent' }],
      { duration: this.state.motionReduced ? 0 : 600, easing: 'ease-out' },
    );
  }

  /** Canvas size in pixels, for turning pointer movement into percentages. */
  #canvasBox() {
    const box = this.canvas.getBoundingClientRect();
    return { w: box.width || 1, h: box.height || 1 };
  }

  /* ---------- drag to move (pointer events, no library) ---------- */
  #wireDrag(grip, frame, record) {
    const manager = this;
    let start = null;

    on(grip, 'keydown', (event) => {
      const step = event.shiftKey ? 5 : 1;
      const moves = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (!moves[event.key]) return;
      event.preventDefault();
      manager.move(record.entry.instanceId, moves[event.key][0], moves[event.key][1]);
    });

    on(grip, 'pointerdown', (event) => {
      if (event.button !== 0 || manager.spotlightId) return;
      manager.#raise(record);
      start = {
        px: event.clientX, py: event.clientY,
        x: record.entry.x, y: record.entry.y,
        active: false,
      };
      grip.setPointerCapture(event.pointerId);
    });

    on(grip, 'pointermove', (event) => {
      if (!start) return;
      const dx = event.clientX - start.px;
      const dy = event.clientY - start.py;
      if (!start.active && Math.hypot(dx, dy) < 4) return;
      if (!start.active) {
        start.active = true;
        frame.classList.add('is-dragging');
      }
      event.preventDefault();

      const box = manager.#canvasBox();
      const { entry } = record;
      entry.x = snap(clamp(start.x + ((dx / box.w) * 100), 0, 100 - entry.w));
      entry.y = snap(clamp(start.y + ((dy / box.h) * 100), 0, 100 - entry.h));
      frame.style.left = `${entry.x}%`;
      frame.style.top = `${entry.y}%`;
    });

    const finish = () => {
      if (!start) return;
      const moved = start.active;
      start = null;
      frame.classList.remove('is-dragging');
      if (moved) {
        manager.#applyFrame(record);   // the tools may need to flip above/below
        manager.saveLayout();
      }
    };
    on(grip, 'pointerup', finish);
    on(grip, 'pointercancel', finish);
  }

  /* ---------- drag the corner to resize ---------- */
  #wireResize(handle, record) {
    const manager = this;
    let start = null;

    on(handle, 'keydown', (event) => {
      const step = event.shiftKey ? 5 : 1;
      const sizes = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!sizes[event.key]) return;
      event.preventDefault();
      const { entry } = record;
      entry.w = snap(clamp(entry.w + sizes[event.key][0], MIN_W, 100 - entry.x));
      entry.h = snap(clamp(entry.h + sizes[event.key][1], MIN_H, 100 - entry.y));
      manager.#applyFrame(record);
      manager.saveLayout();
      manager.#safe(record, 'onResize');
    });

    on(handle, 'pointerdown', (event) => {
      if (event.button !== 0 || manager.spotlightId || record.entry.minimized) return;
      manager.#raise(record);
      start = { px: event.clientX, py: event.clientY, w: record.entry.w, h: record.entry.h };
      handle.setPointerCapture(event.pointerId);
      record.frame.classList.add('is-resizing');
    });

    on(handle, 'pointermove', (event) => {
      if (!start) return;
      event.preventDefault();
      const box = manager.#canvasBox();
      const { entry } = record;
      entry.w = snap(clamp(start.w + (((event.clientX - start.px) / box.w) * 100), MIN_W, 100 - entry.x));
      entry.h = snap(clamp(start.h + (((event.clientY - start.py) / box.h) * 100), MIN_H, 100 - entry.y));
      record.frame.style.width = `${entry.w}%`;
      record.frame.style.height = `${entry.h}%`;
    });

    const finish = () => {
      if (!start) return;
      start = null;
      record.frame.classList.remove('is-resizing');
      manager.saveLayout();
      manager.#safe(record, 'onResize');
    };
    on(handle, 'pointerup', finish);
    on(handle, 'pointercancel', finish);
  }
}

export { SIZES };
