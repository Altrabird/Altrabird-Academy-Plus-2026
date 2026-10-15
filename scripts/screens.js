/**
 * screens.js — the screen deck.
 *
 * A board is no longer a single layout: the teacher keeps a deck of screens
 * (one per lesson phase, say) and flips between them. Each screen owns its own
 * widget placements; widget content stays keyed by instance id in widgetData,
 * so duplicating a screen clones its widgets' settings too.
 *
 * Storage shape (schema v2):
 *   screens: [{ id, name, widgets: [{ instanceId, widgetId, x, y, w, h, z, ... }] }]
 *   activeScreenId
 */

import { storage } from './storage.js';
import { state } from './state.js';
import { uid, deepCopy } from './utils.js';
import { trash } from './trash.js';

const MAX_NAME = 40;
export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** A copy of a screen with new ids for it and every widget, settings copied too. */
export function cloneScreen(source, name = source.name) {
  return {
    ...deepCopy(source),
    id: uid('screen'),
    name: clean(name),
    widgets: source.widgets.map((widget) => {
      const instanceId = uid(widget.widgetId);
      const data = storage.loadWidgetData(widget.instanceId);
      if (data) storage.saveWidgetData(instanceId, deepCopy(data));
      return { ...deepCopy(widget), instanceId };
    }),
  };
}

/**
 * Build a real screen from a portable spec (a template or an imported file):
 *   { name, background?, carousel?, annotations?, widgets: [{ widgetId, x, y, w, h, style?, data? }] }
 * Every widget gets a fresh id, and its `data` becomes its saved settings.
 */
export function screenFromSpec(spec) {
  let z = 0;
  return {
    id: uid('screen'),
    name: clean(spec.name) || 'Screen',
    background: spec.background || 'none',
    ...(spec.carousel ? { carousel: deepCopy(spec.carousel) } : {}),
    ...(spec.annotations ? { annotations: deepCopy(spec.annotations) } : {}),
    widgets: (spec.widgets || []).map((widget) => {
      const instanceId = uid(widget.widgetId);
      if (widget.data && typeof widget.data === 'object') storage.saveWidgetData(instanceId, deepCopy(widget.data));
      const { data, ...placement } = widget;
      z = Math.max(z + 1, Number(placement.z) || 0);
      return { minimized: false, hidden: false, ...deepCopy(placement), z, instanceId };
    }),
  };
}

export const screens = {
  all() {
    const list = storage.loadScreens();
    const deck = Array.isArray(list) && list.length
      ? list
      : [{ id: 'screen-1', name: 'Screen 1', background: 'none', widgets: [] }];
    // Decks made before wallpapers existed simply have no background yet.
    for (const screen of deck) if (!screen.background) screen.background = 'none';
    return deck;
  },

  activeId() {
    const list = this.all();
    const id = storage.loadActiveScreenId();
    return list.some((screen) => screen.id === id) ? id : list[0].id;
  },

  active() {
    return this.all().find((screen) => screen.id === this.activeId()) || this.all()[0];
  },

  index() {
    return this.all().findIndex((screen) => screen.id === this.activeId());
  },

  /** Replace the widget list of one screen (called by the widget manager). */
  saveWidgets(screenId, widgets) {
    const list = this.all();
    const screen = list.find((item) => item.id === screenId);
    if (!screen) return;
    screen.widgets = widgets;
    storage.saveScreens(list);
  },

  add(name) {
    const list = this.all();
    const screen = { id: uid('screen'), name: clean(name) || `Screen ${list.length + 1}`, background: 'none', widgets: [] };
    list.push(screen);
    storage.saveScreens(list);
    this.select(screen.id);
    return screen;
  },

  rename(screenId, name) {
    const list = this.all();
    const screen = list.find((item) => item.id === screenId);
    if (!screen) return null;
    screen.name = clean(name) || screen.name;
    storage.saveScreens(list);
    state.notifyScreens();
    return screen;
  },

  /** Copy a screen, giving every widget a new id and a copy of its settings. */
  duplicate(screenId) {
    const list = this.all();
    const source = list.find((item) => item.id === screenId);
    if (!source) return null;

    const copy = cloneScreen(source, `${source.name} (copy)`);
    list.splice(list.indexOf(source) + 1, 0, copy);
    storage.saveScreens(list);
    this.select(copy.id);
    return copy;
  },

  /** Insert a screen built from a template or an imported file, after the current one. */
  addFromSpec(spec) {
    const list = this.all();
    const screen = screenFromSpec(spec);
    list.splice(this.index() + 1, 0, screen);
    storage.saveScreens(list);
    this.select(screen.id);
    return screen;
  },

  remove(screenId) {
    const list = this.all();
    if (list.length <= 1) return false;         // a deck always has one screen

    // Into Recently deleted rather than gone: its widget settings stay until the bin forgets it.
    const screen = list.find((item) => item.id === screenId);
    if (screen) trash.add('screen', screen, { deckId: storage.loadActiveDeckId() });

    // Read before saving: once the screen is gone activeId() falls back to the
    // first screen and the stale id would stay stored (and revive on restore).
    const wasActive = this.activeId() === screenId;
    const remaining = list.filter((item) => item.id !== screenId);
    storage.saveScreens(remaining);
    if (wasActive) this.select(remaining[0].id);
    else state.notifyScreens();
    return true;
  },

  select(screenId) {
    storage.saveActiveScreenId(screenId);
    state.notifyScreens();
    return screenId;
  },

  step(delta) {
    const list = this.all();
    const next = list[(this.index() + delta + list.length) % list.length];
    return this.select(next.id);
  },
};
