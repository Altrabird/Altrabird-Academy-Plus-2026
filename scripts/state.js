/**
 * state.js — the app's single source of truth for settings, theme and the
 * active class. It reads and writes through StorageManager and notifies
 * subscribers; nothing else in the app persists these values itself.
 */

import { storage } from './storage.js';
import { detectWebGL, systemPrefersReducedMotion } from './utils.js';

const listeners = new Set();
const capabilities = {
  webgl: detectWebGL(),
  storage: storage.available,
};

function emit(type, detail = {}) {
  for (const listener of listeners) {
    try { listener({ type, ...detail }); } catch (error) { console.error('[state] listener failed', error); }
  }
}

export const state = {
  capabilities,

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /* ---------- theme ---------- */
  get theme() { return storage.loadTheme(); },
  setTheme(patch) {
    const theme = { ...storage.loadTheme(), ...patch };
    storage.saveTheme(theme);
    applyTheme();
    emit('theme', { theme });
    return theme;
  },

  /* ---------- settings ---------- */
  get settings() { return storage.loadSettings(); },
  setPerformance(patch) {
    const settings = storage.loadSettings();
    settings.performance = { ...settings.performance, ...patch };
    storage.saveSettings(settings);
    applyTheme();
    emit('performance', { performance: settings.performance });
    return settings.performance;
  },
  setAudio(patch) {
    const settings = storage.loadSettings();
    settings.audio = { ...settings.audio, ...patch };
    storage.saveSettings(settings);
    emit('audio', { audio: settings.audio });
    return settings.audio;
  },

  setWidgetBar(ids) {
    const settings = storage.loadSettings();
    settings.widgetBar = Array.isArray(ids) && ids.length ? ids.slice() : null;
    storage.saveSettings(settings);
    emit('widgetBar', { widgetBar: settings.widgetBar });
    return settings.widgetBar;
  },

  setWidgetStyle(style) {
    const settings = storage.loadSettings();
    settings.widgetStyle = { ...style };
    storage.saveSettings(settings);
    emit('widgetStyle', { widgetStyle: settings.widgetStyle });
    return settings.widgetStyle;
  },

  setCelebration(patch) {
    const settings = storage.loadSettings();
    settings.celebration = { ...settings.celebration, ...patch };
    storage.saveSettings(settings);
    emit('celebration', { celebration: settings.celebration });
    return settings.celebration;
  },

  /* ---------- derived flags every widget should respect ---------- */
  /** True when animation should be minimal (app setting OR the OS preference). */
  get motionReduced() {
    return Boolean(this.settings.performance.reduceMotion) || systemPrefersReducedMotion();
  },
  /** True only when 3D is wanted, allowed, and actually possible. */
  get use3D() {
    const perf = this.settings.performance;
    return Boolean(perf.enable3D) && !perf.lowPerformance && !this.motionReduced && capabilities.webgl;
  },

  /* ---------- classes (managed fully in Milestone 3) ---------- */
  get classes() { return storage.loadClasses(); },
  get activeClass() {
    const id = storage.loadActiveClassId();
    return this.classes.find((item) => item.id === id) || null;
  },
  setActiveClass(id) {
    storage.saveActiveClassId(id);
    emit('activeClass', { id });
  },
  saveClasses(classes) {
    storage.saveClasses(classes);
    emit('classes', { classes });
    return classes;
  },

  /** The screen deck changed (added, renamed, switched, removed). */
  notifyScreens() {
    emit('screens', {});
  },

  /** Used by "Reset application data" and by importing a backup. */
  notifyReplaced() {
    applyTheme();
    emit('replaced', {});
  },
};

/** Push theme + accessibility + motion flags onto <html> so CSS can react. */
export function applyTheme() {
  const theme = storage.loadTheme();
  const root = document.documentElement;
  root.dataset.theme = theme.name;
  root.dataset.scheme = theme.scheme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme.scheme;
  root.dataset.contrast = theme.contrast;
  root.dataset.textsize = theme.textSize;
  root.dataset.motion = state.motionReduced ? 'reduced' : 'full';
  root.dataset.perf = state.settings.performance.lowPerformance ? 'low' : 'full';
}

// Keep "auto" scheme and the OS motion preference live without a reload.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (storage.loadTheme().scheme === 'auto') applyTheme();
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  applyTheme();
  emit('performance', { performance: storage.loadSettings().performance });
});
