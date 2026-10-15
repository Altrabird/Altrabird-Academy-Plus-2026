/**
 * storage.js — the ONLY module allowed to touch localStorage.
 *
 * Everything is kept in a single versioned document so that a future schema
 * change can be migrated in one place. If localStorage is unavailable
 * (private mode, kiosk lockdown, disabled cookies) the manager silently falls
 * back to an in-memory document so the app still runs for the lesson.
 */

const STORAGE_KEY = 'classroomDisplay:v1';
export const SCHEMA_VERSION = 3;

/** Five starter classes so the class selector works before the class manager lands. */
function defaultClasses() {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `class-${n}`,
    name: `Class ${n}`,
    students: [],
    groups: [],
  }));
}

/** The shape of a brand-new install. */
export function defaultDocument() {
  return {
    version: SCHEMA_VERSION,
    classes: defaultClasses(),
    activeClassId: 'class-1',
    settings: {
      performance: {
        enable3D: true,
        reduceMotion: false,
        lowPerformance: false,
      },
      audio: {
        enabled: true,
        volume: 0.7,
      },
      // null means "use the default bar"
      widgetBar: null,
      celebration: {
        enabled: true,
        effect: 'confetti',
        message: '🎉 WELL DONE!',
        onTimer: true,
        onPick: true,
      },
      // Colour and font a new widget starts with (Pro-style widget themes).
      widgetStyle: { tint: 'default', font: 'default' },
    },
    timerPresets: [],
    // The OPEN deck's screens live here; each screen places its own widgets on
    // the canvas. Other decks keep their screens inside their entry in `decks`
    // and are swapped in when opened (library.js), so everything that works on
    // "the screens" keeps working unchanged.
    screens: [{ id: 'screen-1', name: 'Screen 1', background: 'none', widgets: [] }],
    activeScreenId: 'screen-1',
    decks: [{ id: 'deck-1', name: 'My screens', folderId: null }],
    activeDeckId: 'deck-1',
    folders: [],
    // Deleted screens and decks, kept for 30 days: [{ id, kind, deletedAt, item, deckId? }]
    trash: [],
    theme: {
      name: 'lab',
      scheme: 'light',
      contrast: 'normal',
      textSize: 'md',
    },
    widgetData: {},
  };
}

/** Recursive merge of a stored document over the defaults (arrays are replaced). */
function mergeDefaults(base, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const current = out[key];
    if (current && typeof current === 'object' && !Array.isArray(current)
      && value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeDefaults(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Bring older documents forward. Each step is additive and must be safe to re-run. */
function migrate(doc) {
  const next = { ...doc };

  // v1 -> v2: the single grid layout becomes the first screen of a deck.
  // The defaults already supply an (empty) deck, so the carried-over layout has
  // to be checked on its own merits or a v1 board would be silently dropped.
  const carried = (next.layout && Array.isArray(next.layout.widgets)) ? next.layout.widgets : [];
  const deckIsEmpty = !Array.isArray(next.screens) || !next.screens.length
    || next.screens.every((screen) => !Array.isArray(screen.widgets) || !screen.widgets.length);

  if (carried.length && deckIsEmpty) {
    next.screens = [{ id: 'screen-1', name: 'Screen 1', widgets: carried }];
    next.activeScreenId = 'screen-1';
  } else if (!Array.isArray(next.screens) || !next.screens.length) {
    next.screens = [{ id: 'screen-1', name: 'Screen 1', widgets: [] }];
    next.activeScreenId = 'screen-1';
  }
  delete next.layout;

  next.version = SCHEMA_VERSION;
  return next;
}

export class StorageManager {
  constructor(key = STORAGE_KEY) {
    this.key = key;
    this.available = StorageManager.probe();
    this.corrupted = false;
    this.migrated = false;
    this.memory = null;
    this.doc = this.#read();
    // A document that had to be brought forward is written back straight away,
    // so an older copy of the schema is never left lying in storage.
    if (this.migrated) this.#write();
  }

  /** Can we actually read and write? Some browsers throw on access itself. */
  static probe() {
    try {
      const probeKey = '__classroomDisplay_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  }

  #read() {
    if (!this.available) {
      this.memory = defaultDocument();
      return this.memory;
    }
    let raw = null;
    try {
      raw = window.localStorage.getItem(this.key);
    } catch {
      this.available = false;
      this.memory = defaultDocument();
      return this.memory;
    }
    if (!raw) return defaultDocument();

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      this.migrated = parsed.version !== SCHEMA_VERSION || Boolean(parsed.layout);
      return migrate(mergeDefaults(defaultDocument(), parsed));
    } catch (error) {
      // Keep the bad payload aside so nothing is silently destroyed, then start clean.
      this.corrupted = true;
      this.#stashCorrupt(raw);
      console.warn('[storage] stored data was unreadable, starting fresh', error);
      return defaultDocument();
    }
  }

  /** Keep the most recent unreadable payload only, so it cannot fill the quota. */
  #stashCorrupt(raw) {
    try {
      const prefix = `${this.key}.corrupt.`;
      window.localStorage.setItem(`${prefix}${Date.now()}`, raw);
      const stale = Object.keys(window.localStorage)
        .filter((key) => key.startsWith(prefix))
        .sort();
      while (stale.length > 1) window.localStorage.removeItem(stale.shift());
    } catch { /* storage may be full or blocked; the app still runs */ }
  }

  #write() {
    if (!this.available) {
      this.memory = this.doc;
      return false;
    }
    try {
      window.localStorage.setItem(this.key, JSON.stringify(this.doc));
      return true;
    } catch (error) {
      const full = error && (error.name === 'QuotaExceededError'
        || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22);
      console.warn(`[storage] could not save (${full ? 'quota' : 'permissions'})`, error);

      if (full) {
        // A too-large value (usually a picture) must not turn saving off for
        // everything else — say so instead, and let smaller writes carry on.
        document.dispatchEvent(new CustomEvent('storage:full'));
      } else {
        this.available = false;
      }
      this.memory = this.doc;
      return false;
    }
  }

  /* ---------- generic ---------- */
  getAll() { return this.doc; }

  replaceAll(doc) {
    this.doc = migrate(mergeDefaults(defaultDocument(), doc));
    this.#write();
    return this.doc;
  }

  reset() {
    this.doc = defaultDocument();
    if (this.available) {
      try { window.localStorage.removeItem(this.key); } catch { /* ignore */ }
    }
    return this.doc;
  }

  #section(name, value) {
    if (value === undefined) return this.doc[name];
    this.doc[name] = value;
    this.#write();
    return value;
  }

  /* ---------- named sections (spec §20) ---------- */
  loadClasses() { return this.#section('classes'); }
  saveClasses(classes) { return this.#section('classes', classes); }

  loadActiveClassId() { return this.doc.activeClassId; }
  saveActiveClassId(id) { return this.#section('activeClassId', id); }

  loadSettings() { return this.doc.settings; }
  saveSettings(settings) { return this.#section('settings', settings); }

  loadTimerPresets() { return this.doc.timerPresets; }
  saveTimerPresets(presets) { return this.#section('timerPresets', presets); }

  loadScreens() { return this.doc.screens; }
  saveScreens(screens) { return this.#section('screens', screens); }

  loadActiveScreenId() { return this.doc.activeScreenId; }
  saveActiveScreenId(id) { return this.#section('activeScreenId', id); }

  loadDecks() { return this.doc.decks; }
  saveDecks(decks) { return this.#section('decks', decks); }

  loadActiveDeckId() { return this.doc.activeDeckId; }
  saveActiveDeckId(id) { return this.#section('activeDeckId', id); }

  loadFolders() { return this.doc.folders; }
  saveFolders(folders) { return this.#section('folders', folders); }

  loadTrash() { return this.doc.trash; }
  saveTrash(trash) { return this.#section('trash', trash); }

  loadTheme() { return this.doc.theme; }
  saveTheme(theme) { return this.#section('theme', theme); }

  /** Per-widget-instance blob (announcement text, clock options, ...). */
  loadWidgetData(instanceId) { return this.doc.widgetData[instanceId] || null; }
  saveWidgetData(instanceId, data) {
    this.doc.widgetData[instanceId] = data;
    this.#write();
    return data;
  }
  clearWidgetData(instanceId) {
    delete this.doc.widgetData[instanceId];
    this.#write();
  }

  /* ---------- import / export ---------- */
  exportDocument() {
    return {
      ...this.doc,
      exportedAt: new Date().toISOString(),
      app: 'Science Classroom',
    };
  }

  /**
   * Restore a full backup. Anything that is not one is refused *before* the
   * stored document is touched: importing a single-class export used to wipe
   * every class, setting and widget back to defaults.
   */
  importDocument(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('That file is not a Science Classroom backup, so nothing was changed.');
    }
    if (parsed.type === 'class') {
      throw new Error('That is a single class export, not a full backup. Nothing was changed — use a file made with "Export a backup file".');
    }
    const looksLikeBackup = Number.isFinite(parsed.version)
      && (Array.isArray(parsed.classes)
        || Array.isArray(parsed.screens)
        || Array.isArray(parsed.decks)
        || (parsed.settings && typeof parsed.settings === 'object')
        || (parsed.layout && typeof parsed.layout === 'object'));   // v1 backups
    if (!looksLikeBackup) {
      throw new Error('That file does not look like a Science Classroom backup, so nothing was changed.');
    }

    delete parsed.exportedAt;
    delete parsed.app;
    return this.replaceAll(parsed);
  }
}

export const storage = new StorageManager();
