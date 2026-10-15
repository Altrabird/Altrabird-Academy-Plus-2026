/**
 * main.js — boots the shell and wires the chrome (top bar, class selector,
 * widget launcher, presentation mode). Widget behaviour lives in
 * scripts/widgets/*, widget lifecycle in scripts/widgetManager.js.
 */

import { el, on, qs, toast, pad2 } from './utils.js';
import { state, applyTheme } from './state.js';
import { storage } from './storage.js';
import { WidgetManager } from './widgetManager.js';
import { widgets, DEFAULT_BAR } from './widgets/registry.js';
import { openSettings } from './ui/settings.js';
import { openToolCatalogue } from './ui/toolbarPanel.js';
import { openModal, anyModalOpen, confirmDialog } from './ui/modal.js';
import { textField } from './ui/forms.js';
import { icon, hasIcon } from './ui/icons.js';
import { screens } from './screens.js';
import { applyWallpaper, openWallpaperPicker } from './wallpapers.js';
import { initCelebration } from './celebration.js';
import { decks } from './library.js';
import { trash, TRASH_DAYS } from './trash.js';
import { openLibrary, importFromFile } from './ui/libraryPanel.js';
import { exportScreenFile } from './transfer.js';
import { initAnnotations, setAnnotating, isAnnotating, refreshAnnotations } from './annotate.js';

/* ---------- theme first, so nothing flashes ---------- */
applyTheme();

// Celebrations are global: they fire from timers and picks wherever those live.
initCelebration();

const app = qs('#app');

// Recently deleted keeps things for 30 days; anything older goes before the board is built.
trash.purgeExpired();

const manager = new WidgetManager({
  canvas: qs('#canvas'),
  empty: qs('#boardEmpty'),
  board: qs('#board'),
  storage,
  state,
});

widgets.forEach((definition) => manager.register(definition));
manager.loadScreen();
applyWallpaper();

qs('#btnBackground').querySelector('[data-icon]').innerHTML = icon('background', 26);
// Corner and pager buttons draw their icons from the same set as everything else.
[['#btnPresent', 'expand'], ['#btnSettings', 'sliders'], ['#btnResetLayout', 'trash']]
  .forEach(([selector, name]) => { qs(selector).querySelector('[data-icon]').innerHTML = icon(name, 18); });
on(qs('#btnBackground'), 'click', () => openWallpaperPicker());

/* ---------- annotation bar: ink over the whole board ---------- */
const annotateButtons = [qs('#btnAnnotate')];
qs('#btnAnnotate').querySelector('[data-icon]').innerHTML = icon('annotate', 22);
initAnnotations(qs('#canvas'), {
  onChange: (active) => annotateButtons.forEach((button) => button.setAttribute('aria-pressed', String(active))),
});
annotateButtons.forEach((button) => on(button, 'click', () => setAnnotating(!isAnnotating())));

/* ---------- the dock can be tucked away for a clean screen ---------- */
const dockToggle = qs('#btnDockToggle');
function setDockCollapsed(collapsed) {
  qs('#launcher').classList.toggle('is-collapsed', collapsed);
  dockToggle.setAttribute('aria-expanded', String(!collapsed));
  dockToggle.title = collapsed ? 'Show the tools' : 'Hide the tools';
  dockToggle.querySelector('.btn__text').textContent = collapsed ? 'Show tools' : 'Hide tools';
  dockToggle.querySelector('[data-icon]').innerHTML = icon(collapsed ? 'expand' : 'collapse', 20);
}
on(dockToggle, 'click', () => setDockCollapsed(!qs('#launcher').classList.contains('is-collapsed')));
setDockCollapsed(false);

/* ---------- library: decks, folders, templates, recently deleted ---------- */
qs('#btnLibrary').querySelector('[data-icon]').innerHTML = icon('folder', 18);
on(qs('#btnLibrary'), 'click', () => openLibrary());

/* ---------- widget launcher ---------- */
const rail = qs('#launcherRail');

function barDefinitions() {
  const chosen = state.settings.widgetBar;
  const ids = Array.isArray(chosen) && chosen.length ? chosen : DEFAULT_BAR;
  return ids
    .map((id) => manager.getDefinition(id))
    .filter(Boolean);
}

function renderLauncher() {
  rail.replaceChildren();

  for (const definition of barDefinitions()) {
    const instances = manager.instancesOf(definition.id);
    const hiddenInstance = instances.find((record) => record.entry.hidden);
    const onBoard = instances.filter((record) => !record.entry.hidden).length;

    rail.append(el('button', {
      type: 'button',
      class: `tile${onBoard ? ' is-active' : ''}`,
      dataset: { tool: definition.id },
      title: definition.description || definition.title,
      'aria-label': hiddenInstance
        ? `Show ${definition.title} again`
        : `Add ${definition.title} to the board`,
      onClick: () => {
        if (hiddenInstance) manager.showWidget(hiddenInstance.entry.instanceId);
        else manager.addWidget(definition.id);
        renderLauncher();
      },
    }, [
      hasIcon(definition.icon)
        ? el('span', { class: 'tile__icon', 'aria-hidden': 'true', html: icon(definition.icon, 26) })
        : el('span', { class: 'tile__icon', 'aria-hidden': 'true', text: definition.icon }),
      el('span', { text: definition.shortTitle || definition.title }),
      hiddenInstance ? el('span', { class: 'tile__soon', text: 'Hidden' }) : null,
      onBoard > 1 ? el('span', { class: 'tile__soon', text: `×${onBoard}` }) : null,
    ]));
  }

  // Everything that is not in the bar lives behind More.
  rail.append(el('button', {
    type: 'button', class: 'tile tile--more', 'aria-haspopup': 'dialog',
    'aria-label': 'All tools, and choose what the toolbar holds',
    onClick: () => openToolCatalogue({ manager, onChange: renderLauncher }),
  }, [
    el('span', { class: 'tile__icon', 'aria-hidden': 'true', html: icon('grid', 26) }),
    el('span', { text: 'More' }),
  ]));
}

renderLauncher();
on(document, 'layoutchange', () => {
  renderLauncher();
  renderScreenBar();
});

/* ---------- presentation clock ---------- */
const presentClock = qs('#presentClock');

function tickTopClock() {
  const now = new Date();
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  presentClock.textContent = time;   // the one piece of chrome presentation mode keeps
  // Wake on the next minute boundary rather than running a loop.
  setTimeout(tickTopClock, 60000 - (Date.now() % 60000) + 20);
}
tickTopClock();

/* ---------- active class selector ---------- */
const classSelect = qs('#classSelect');

function renderClassSelect() {
  const classes = state.classes;
  const activeId = (state.activeClass || classes[0] || {}).id;
  classSelect.replaceChildren(
    ...classes.map((item) => el('option', { value: item.id, selected: item.id === activeId }, item.name)),
  );
  classSelect.disabled = classes.length === 0;
}

renderClassSelect();
on(classSelect, 'change', () => {
  state.setActiveClass(classSelect.value);
  const active = state.activeClass;
  if (active) toast(`Active class: ${active.name}`);
});
state.subscribe((event) => {
  // Settings → Classes can add, rename, delete or switch classes while open.
  if (['classes', 'activeClass', 'replaced'].includes(event.type)) renderClassSelect();
  if (event.type === 'widgetBar') renderLauncher();
  if (event.type === 'screens' || event.type === 'replaced') {
    manager.loadScreen();
    renderScreenBar();
    renderLauncher();
    applyWallpaper();
    refreshAnnotations();
  }
});

/* ---------- screen deck ---------- */
const screenName = qs('#screenName');
const screenCount = qs('#screenCount');

function renderScreenBar() {
  const all = screens.all();
  const active = screens.active();
  screenName.textContent = active.name;
  screenCount.textContent = `${screens.index() + 1}/${all.length}`;
  qs('#btnScreenMenu').title = `${active.name} — all screens in this deck`;
  qs('#btnScreenPrev').disabled = all.length < 2;
  qs('#btnScreenNext').disabled = all.length < 2;
}

function switchScreen(step) {
  screens.step(step);
}

on(qs('#btnScreenPrev'), 'click', () => switchScreen(-1));
on(qs('#btnScreenNext'), 'click', () => switchScreen(1));
on(qs('#btnScreenAdd'), 'click', () => {
  const screen = screens.add();
  toast(`${screen.name} added`);
});

on(qs('#btnScreenMenu'), 'click', () => openScreenManager());

/** Rename, duplicate, delete and jump between the screens of the deck. */
function openScreenManager() {
  const body = el('div', { class: 'screenlist' });

  const render = () => {
    const all = screens.all();
    const activeId = screens.activeId();
    body.replaceChildren(...all.map((screen) => el('div', {
      class: `screenrow${screen.id === activeId ? ' is-active' : ''}`,
    }, [
      el('button', {
        type: 'button', class: 'screenrow__pick',
        'aria-label': `Show ${screen.name}`,
        onClick: () => { screens.select(screen.id); render(); },
      }, [
        el('span', { class: 'screenrow__name', text: screen.name }),
        el('span', {
          class: 'screenrow__meta',
          text: `${screen.widgets.filter((w) => !w.hidden).length} widget${screen.widgets.filter((w) => !w.hidden).length === 1 ? '' : 's'}`,
        }),
      ]),
      screen.id === activeId ? el('span', { class: 'tile__soon', text: 'Showing' }) : null,
      el('span', { class: 'screenrow__tools' }, [
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('download'), 'aria-label': `Save ${screen.name} to a file`,
          onClick: async () => { if (await exportScreenFile(screen.id)) toast(`${screen.name} saved to a file`); },
        }),
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('pencil'), 'aria-label': `Rename ${screen.name}`,
          onClick: () => renameScreenDialog(screen, render),
        }),
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('copy'), 'aria-label': `Duplicate ${screen.name}`,
          onClick: () => { const copy = screens.duplicate(screen.id); render(); if (copy) toast(`Duplicated as ${copy.name}`); },
        }),
        el('button', {
          type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'),
          'aria-label': `Delete ${screen.name}`,
          onClick: async () => {
            if (screens.all().length < 2) { toast('A deck keeps at least one screen'); return; }
            const ok = await confirmDialog({
              title: `Delete ${screen.name}?`,
              message: `It moves to Recently deleted (Library), where you can restore it for ${TRASH_DAYS} days. Your classes and settings are not affected.`,
              confirmLabel: 'Delete screen',
              danger: true,
            });
            if (!ok) return;
            screens.remove(screen.id);
            render();
          },
        }),
      ]),
    ])));
  };
  render();

  const modal = openModal({
    title: `Screens in ${decks.active().name}`,
    body: [
      el('p', { class: 'field__hint', text: 'Each screen keeps its own board. Use them for the phases of a lesson, or one per class. Other decks are in the Library.' }),
      body,
    ],
    actions: [
      { label: 'Add screen', close: false, onClick: () => { screens.add(); render(); return false; } },
      { label: 'From a template', variant: 'ghost', onClick: () => { openLibrary({ tab: 'templates' }); } },
      { label: 'Open a file', variant: 'ghost', close: false, onClick: () => { importFromFile().then(() => { if (modal.panel.isConnected) render(); }); return false; } },
      { label: 'Done', variant: 'ghost' },
    ],
  });
}

function renameScreenDialog(screen, afterwards) {
  let name = screen.name;
  openModal({
    title: `Rename ${screen.name}`,
    body: textField({ label: 'Screen name', value: screen.name, onInput: (value) => { name = value; } }),
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: 'Save name', onClick: () => { screens.rename(screen.id, name); if (afterwards) afterwards(); } },
    ],
  });
}

renderScreenBar();

/* ---------- settings ---------- */
on(qs('#btnSettings'), 'click', () => openSettings({
  onReset: () => manager.resetLayout(),
}));

on(qs('#btnResetLayout'), 'click', async () => {
  if (!manager.entries.size) { toast('This screen is already empty'); return; }
  const ok = await confirmDialog({
    title: `Clear ${screens.active().name}?`,
    message: 'Every widget on this screen will be removed. Other screens, your classes and your settings are not affected.',
    confirmLabel: 'Clear screen',
    danger: true,
  });
  if (!ok) return;
  manager.resetLayout();
  renderLauncher();
  toast('Screen cleared');
});

/* ---------- presentation mode ---------- */
const exitButton = qs('#btnExitPresent');
let presenting = false;

async function setPresenting(next) {
  presenting = next;
  app.classList.toggle('is-presenting', presenting);
  exitButton.hidden = !presenting;
  presentClock.hidden = !presenting;

  try {
    if (presenting && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!presenting && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Fullscreen can be blocked by browser policy — the in-page layout still applies.
  }
  if (presenting) exitButton.focus();
  else qs('#btnPresent').focus();
}

on(qs('#btnPresent'), 'click', () => setPresenting(true));
on(exitButton, 'click', () => setPresenting(false));

on(document, 'fullscreenchange', () => {
  // Leaving fullscreen with F11 or Esc should also leave presentation mode.
  if (!document.fullscreenElement && presenting) setPresenting(false);
});

on(document, 'keydown', (event) => {
  if (event.key !== 'Escape' || anyModalOpen()) return;
  if (isAnnotating()) {
    setAnnotating(false);
    return;
  }
  if (manager.spotlightId) {
    manager.toggleSpotlight(manager.spotlightId, false);
    return;
  }
  if (presenting) setPresenting(false);
});

/* ---------- storage health + global safety net ---------- */
if (!state.capabilities.storage) {
  toast('Local storage is blocked — this session will not be saved', 6000);
} else if (storage.corrupted) {
  toast('Saved data was unreadable and has been reset', 6000);
}

on(document, 'storage:full', () => {
  toast('This browser’s storage is full — that change was not saved. Remove a picture or clear a screen.', 7000);
});

on(window, 'error', (event) => {
  console.error('[app] uncaught error', event.error || event.message);
});
on(window, 'unhandledrejection', (event) => {
  console.error('[app] unhandled promise rejection', event.reason);
});

// Handy during development; harmless in class.
window.classroomDisplay = { manager, state, storage };
