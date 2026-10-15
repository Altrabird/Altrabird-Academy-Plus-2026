/**
 * trash.js — Recently deleted.
 *
 * A deleted screen or deck is not destroyed straight away: it waits here for
 * 30 days so a slip of the mouse can be undone. Widget settings stay in
 * widgetData while an item is in the bin and are only cleared when the item is
 * deleted for good, so a restore brings everything back exactly as it was.
 *
 * Kept free of screens.js / library.js imports so either can call it without
 * an import cycle.
 */

import { storage } from './storage.js';
import { state } from './state.js';
import { uid } from './utils.js';

export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Every widget instance id held by a bin entry. */
function widgetIds(entry) {
  const screenList = entry.kind === 'deck' ? (entry.item.screens || []) : [entry.item];
  return screenList.flatMap((screen) => (screen.widgets || []).map((widget) => widget.instanceId));
}

function forgetData(entry) {
  widgetIds(entry).forEach((id) => storage.clearWidgetData(id));
}

export const trash = {
  list() {
    const list = storage.loadTrash();
    return Array.isArray(list) ? list : [];
  },

  /** kind: 'screen' (with the deck it came from) or 'deck'. */
  add(kind, item, extra = {}) {
    const entry = { id: uid('bin'), kind, deletedAt: Date.now(), item, ...extra };
    storage.saveTrash([entry, ...this.list()]);
    return entry;
  },

  daysLeft(entry, now = Date.now()) {
    return Math.max(0, Math.ceil(((entry.deletedAt + (TRASH_DAYS * DAY)) - now) / DAY));
  },

  /** Put an item back where it came from (or into the open deck if that deck is gone). */
  restore(entryId) {
    const list = this.list();
    const entry = list.find((item) => item.id === entryId);
    if (!entry) return null;

    if (entry.kind === 'deck') {
      storage.saveDecks([...storage.loadDecks(), entry.item]);
    } else {
      const decks = storage.loadDecks();
      const home = decks.find((deck) => deck.id === entry.deckId);
      if (home && home.id !== storage.loadActiveDeckId() && Array.isArray(home.screens)) {
        home.screens.push(entry.item);
        storage.saveDecks(decks);
      } else {
        storage.saveScreens([...storage.loadScreens(), entry.item]);
      }
    }
    storage.saveTrash(list.filter((item) => item.id !== entryId));
    state.notifyScreens();
    return entry;
  },

  /** Delete for good, freeing the storage its widgets used. */
  forget(entryId) {
    const list = this.list();
    const entry = list.find((item) => item.id === entryId);
    if (!entry) return false;
    forgetData(entry);
    storage.saveTrash(list.filter((item) => item.id !== entryId));
    return true;
  },

  empty() {
    this.list().forEach(forgetData);
    storage.saveTrash([]);
  },

  /** Called at start-up: anything past its 30 days goes for good. */
  purgeExpired(now = Date.now()) {
    const list = this.list();
    const keep = list.filter((entry) => this.daysLeft(entry, now) > 0);
    if (keep.length === list.length) return 0;
    list.filter((entry) => !keep.includes(entry)).forEach(forgetData);
    storage.saveTrash(keep);
    return list.length - keep.length;
  },
};
