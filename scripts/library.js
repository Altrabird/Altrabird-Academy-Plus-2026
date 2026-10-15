/**
 * library.js — screen decks and the folders that hold them.
 *
 * A deck is a set of screens (one lesson, one subject, one class). The OPEN
 * deck's screens are the top-level `screens` list that screens.js and the
 * widget manager already work on; every other deck keeps its own screens in
 * its entry. Opening a deck swaps the two, so nothing else had to learn about
 * decks.
 *
 * Storage shape (schema v3):
 *   decks: [{ id, name, folderId, screens?, activeScreenId? }]   (no screens on the open one)
 *   activeDeckId, folders: [{ id, name }]
 */

import { storage } from './storage.js';
import { state } from './state.js';
import { screens, cloneScreen, clean } from './screens.js';
import { trash } from './trash.js';
import { uid } from './utils.js';

const blankScreen = () => ({ id: uid('screen'), name: 'Screen 1', background: 'none', widgets: [] });

export const decks = {
  all() {
    const list = storage.loadDecks();
    return Array.isArray(list) && list.length ? list : [{ id: 'deck-1', name: 'My screens', folderId: null }];
  },

  activeId() {
    const list = this.all();
    const id = storage.loadActiveDeckId();
    return list.some((deck) => deck.id === id) ? id : list[0].id;
  },

  active() {
    return this.all().find((deck) => deck.id === this.activeId());
  },

  /** The screens of any deck, open or not. */
  screensOf(deckId) {
    if (deckId === this.activeId()) return screens.all();
    const deck = this.all().find((item) => item.id === deckId);
    return (deck && deck.screens) || [];
  },

  open(deckId) {
    const list = this.all();
    const target = list.find((deck) => deck.id === deckId);
    if (!target || deckId === this.activeId()) return false;

    // Park the open deck's screens in its own entry, then bring the target's out.
    const current = list.find((deck) => deck.id === this.activeId());
    if (current) {
      current.screens = screens.all();
      current.activeScreenId = screens.activeId();
    }
    const nextScreens = Array.isArray(target.screens) && target.screens.length ? target.screens : [blankScreen()];
    const nextActive = target.activeScreenId;
    delete target.screens;
    delete target.activeScreenId;

    storage.saveDecks(list);
    storage.saveScreens(nextScreens);
    storage.saveActiveScreenId(nextScreens.some((s) => s.id === nextActive) ? nextActive : nextScreens[0].id);
    storage.saveActiveDeckId(deckId);
    state.notifyScreens();
    return true;
  },

  /** New deck (optionally pre-filled, e.g. from an imported file), opened straight away. */
  create(name, { folderId = null, screenList = null } = {}) {
    const list = this.all();
    const filled = Array.isArray(screenList) && screenList.length ? screenList : [blankScreen()];
    const deck = {
      id: uid('deck'),
      name: clean(name) || `Deck ${list.length + 1}`,
      folderId,
      screens: filled,
      activeScreenId: filled[0].id,
    };
    list.push(deck);
    storage.saveDecks(list);
    this.open(deck.id);
    return deck;
  },

  rename(deckId, name) {
    const list = this.all();
    const deck = list.find((item) => item.id === deckId);
    if (!deck || !clean(name)) return null;
    deck.name = clean(name);
    storage.saveDecks(list);
    state.notifyScreens();
    return deck;
  },

  move(deckId, folderId) {
    const list = this.all();
    const deck = list.find((item) => item.id === deckId);
    if (!deck) return null;
    deck.folderId = folderId && folders.all().some((folder) => folder.id === folderId) ? folderId : null;
    storage.saveDecks(list);
    return deck;
  },

  duplicate(deckId) {
    const list = this.all();
    const source = list.find((item) => item.id === deckId);
    if (!source) return null;
    const copy = {
      id: uid('deck'),
      name: clean(`${source.name} (copy)`),
      folderId: source.folderId || null,
      screens: this.screensOf(deckId).map((screen) => cloneScreen(screen)),
    };
    copy.activeScreenId = copy.screens[0] && copy.screens[0].id;
    list.splice(list.indexOf(source) + 1, 0, copy);
    storage.saveDecks(list);
    return copy;
  },

  /** Into Recently deleted. The last deck cannot go: there is always one to show. */
  remove(deckId) {
    if (this.all().length < 2) return false;
    if (deckId === this.activeId()) {
      const other = this.all().find((deck) => deck.id !== deckId);
      this.open(other.id);
    }
    const list = this.all();
    const deck = list.find((item) => item.id === deckId);
    if (!deck) return false;
    trash.add('deck', deck);
    storage.saveDecks(list.filter((item) => item.id !== deckId));
    state.notifyScreens();
    return true;
  },
};

export const folders = {
  all() {
    const list = storage.loadFolders();
    return Array.isArray(list) ? list : [];
  },

  add(name) {
    const folder = { id: uid('folder'), name: clean(name) || `Folder ${this.all().length + 1}` };
    storage.saveFolders([...this.all(), folder]);
    return folder;
  },

  rename(folderId, name) {
    const list = this.all();
    const folder = list.find((item) => item.id === folderId);
    if (!folder || !clean(name)) return null;
    folder.name = clean(name);
    storage.saveFolders(list);
    return folder;
  },

  /** Removing a folder never removes its decks: they move back to the top level. */
  remove(folderId) {
    const deckList = decks.all();
    deckList.forEach((deck) => { if (deck.folderId === folderId) deck.folderId = null; });
    storage.saveDecks(deckList);
    storage.saveFolders(this.all().filter((folder) => folder.id !== folderId));
  },
};
