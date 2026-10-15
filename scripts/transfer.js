/**
 * transfer.js — save a screen or a whole deck to a file, and load one back.
 *
 * This is how boards travel between computers and colleagues without any
 * server: the file carries the widget placements, each widget's settings, the
 * screen's background, carousel and annotations, and any of the teacher's own
 * background pictures it uses. Everything read from a file is checked before it
 * touches the board — unknown widgets are dropped, numbers are clamped and only
 * data-URL images are accepted.
 */

import { storage } from './storage.js';
import { screens, screenFromSpec } from './screens.js';
import { decks } from './library.js';
import { photos, blobToDataURL, dataURLToBlob } from './photos.js';
import { isKnownBackground, isPhoto, CAROUSEL_MINUTES } from './wallpapers.js';
import { sanitizeStyle } from './ui/widgetStyle.js';
import { sanitizeStrokes } from './annotate.js';
import { widgets } from './widgets/registry.js';
import { downloadJSON, clamp } from './utils.js';

const FORMAT = 1;
const MAX_FILE_CHARS = 40 * 1024 * 1024;     // a deck full of pictures, with room to spare
const MAX_WIDGETS = 80;
const MAX_SCREENS = 60;
const PHOTO_ID = /^[a-z0-9]{1,40}$/i;

const slug = (name) => String(name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';

/* ---------------- export ---------------- */

function screenSpec(screen) {
  return {
    name: screen.name,
    background: screen.background || 'none',
    ...(screen.carousel ? { carousel: screen.carousel } : {}),
    ...(screen.annotations && screen.annotations.length ? { annotations: screen.annotations } : {}),
    widgets: screen.widgets.map((widget) => {
      const { instanceId, ...placement } = widget;
      const data = storage.loadWidgetData(instanceId);
      return data ? { ...placement, data } : placement;
    }),
  };
}

/** Every "photo:<id>" a set of screens uses, as data URLs. */
async function photosFor(specs) {
  const ids = new Set();
  for (const spec of specs) {
    if (isPhoto(spec.background)) ids.add(spec.background.slice(6));
    for (const id of (spec.carousel && spec.carousel.ids) || []) if (isPhoto(id)) ids.add(id.slice(6));
  }
  const out = {};
  for (const id of ids) {
    try {
      const blob = await photos.blob(id);
      if (blob) out[id] = await blobToDataURL(blob);
    } catch { /* a missing picture just falls back to the theme on import */ }
  }
  return out;
}

export async function exportScreenFile(screenId) {
  const screen = screens.all().find((item) => item.id === screenId);
  if (!screen) return false;
  const spec = screenSpec(screen);
  downloadJSON(`${slug(screen.name)}.screen.json`, {
    type: 'altrabird-screen', format: FORMAT, exportedAt: new Date().toISOString(),
    screen: spec, photos: await photosFor([spec]),
  });
  return true;
}

export async function exportDeckFile(deckId) {
  const deck = decks.all().find((item) => item.id === deckId);
  if (!deck) return false;
  const specs = decks.screensOf(deckId).map(screenSpec);
  downloadJSON(`${slug(deck.name)}.deck.json`, {
    type: 'altrabird-deck', format: FORMAT, exportedAt: new Date().toISOString(),
    deck: { name: deck.name, screens: specs }, photos: await photosFor(specs),
  });
  return true;
}

/* ---------------- import ---------------- */

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback);

function cleanWidget(raw, known) {
  if (!isPlainObject(raw) || typeof raw.widgetId !== 'string' || !known.has(raw.widgetId)) return null;
  const w = num(raw.w, 18, 100, 24);
  const h = num(raw.h, 16, 100, 34);
  return {
    widgetId: raw.widgetId,
    w, h,
    x: num(raw.x, 0, 100 - w, 2),
    y: num(raw.y, 0, 100 - h, 2),
    z: num(raw.z, 0, 100000, 0),
    minimized: Boolean(raw.minimized),
    hidden: Boolean(raw.hidden),
    style: sanitizeStyle(raw.style),
    ...(isPlainObject(raw.data) ? { data: cleanData(raw.widgetId, raw.data) } : {}),
  };
}

/** A picture must be embedded in the file: a web address would make the board fetch it. */
function cleanData(widgetId, data) {
  if (widgetId === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(String(data.src || ''))) {
    return { ...data, src: '' };
  }
  return data;
}

function cleanScreen(raw, known, storedPhotos) {
  if (!isPlainObject(raw) || !Array.isArray(raw.widgets)) return null;
  const allowed = (id) => isKnownBackground(id) && (!isPhoto(id) || storedPhotos.has(id.slice(6)));
  const spec = {
    name: String(raw.name || 'Imported screen'),
    background: allowed(raw.background) ? raw.background : 'none',
    widgets: raw.widgets.slice(0, MAX_WIDGETS).map((widget) => cleanWidget(widget, known)).filter(Boolean),
  };
  if (isPlainObject(raw.carousel)) {
    spec.carousel = {
      enabled: Boolean(raw.carousel.enabled),
      minutes: CAROUSEL_MINUTES.includes(raw.carousel.minutes) ? raw.carousel.minutes : 5,
      ids: (Array.isArray(raw.carousel.ids) ? raw.carousel.ids : []).filter(allowed).slice(0, 30),
    };
  }
  const strokes = sanitizeStrokes(raw.annotations);
  if (strokes.length) spec.annotations = strokes;
  return spec;
}

/** Put the file's pictures into this browser's store; returns the ids that made it. */
async function storePhotos(raw) {
  const stored = new Set();
  if (!isPlainObject(raw)) return stored;
  for (const [id, url] of Object.entries(raw)) {
    if (!PHOTO_ID.test(id) || typeof url !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) continue;
    try {
      await photos.put(id, dataURLToBlob(url));
      stored.add(id);
    } catch { /* IndexedDB unavailable: that screen falls back to the theme background */ }
  }
  return stored;
}

/**
 * Read a screen or deck file and add it: a screen joins the open deck, a deck
 * becomes a new deck. Throws a teacher-readable Error for anything else, before
 * changing anything.
 */
export async function importBoardFile(text) {
  if (typeof text !== 'string' || text.length > MAX_FILE_CHARS) throw new Error('That file is too large to be a screen or deck file.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not a screen or deck file, so nothing was changed.'); }
  if (!isPlainObject(parsed) || !['altrabird-screen', 'altrabird-deck'].includes(parsed.type)) {
    throw new Error('That file is not a screen or deck file. (Full backups are restored from Settings → Data.)');
  }
  if (Number(parsed.format) > FORMAT) throw new Error('That file was made by a newer version of this app.');

  const known = new Set(widgets.map((definition) => definition.id));

  if (parsed.type === 'altrabird-screen') {
    if (!isPlainObject(parsed.screen) || !Array.isArray(parsed.screen.widgets)) throw new Error('That screen file is damaged, so nothing was changed.');
    const stored = await storePhotos(parsed.photos);
    const spec = cleanScreen(parsed.screen, known, stored);
    const screen = screens.addFromSpec(spec);
    return { kind: 'screen', name: screen.name, widgets: screen.widgets.length };
  }

  const deck = parsed.deck;
  if (!isPlainObject(deck) || !Array.isArray(deck.screens) || !deck.screens.length) throw new Error('That deck file is damaged, so nothing was changed.');
  const stored = await storePhotos(parsed.photos);
  const specs = deck.screens.slice(0, MAX_SCREENS).map((raw) => cleanScreen(raw, known, stored)).filter(Boolean);
  if (!specs.length) throw new Error('That deck file has no screens this app can show.');
  const created = decks.create(String(deck.name || 'Imported deck'), { screenList: specs.map(screenFromSpec) });
  return { kind: 'deck', name: created.name, screens: specs.length };
}
