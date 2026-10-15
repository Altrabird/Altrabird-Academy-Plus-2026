/**
 * libraryPanel.js — the Library: every deck (sorted into folders), the
 * template library, and Recently deleted, in one dialog with three tabs.
 */

import { el, toast, pickTextFile } from '../utils.js';
import { openModal, confirmDialog } from './modal.js';
import { textField } from './forms.js';
import { icon } from './icons.js';
import { decks, folders } from '../library.js';
import { screens } from '../screens.js';
import { trash, TRASH_DAYS } from '../trash.js';
import { TEMPLATES } from '../templates.js';
import { exportDeckFile, importBoardFile } from '../transfer.js';
import { widgets } from '../widgets/registry.js';

const TABS = [
  { id: 'decks', label: 'My decks' },
  { id: 'templates', label: 'Templates' },
  { id: 'trash', label: 'Recently deleted' },
];

const titleOf = (widgetId) => (widgets.find((definition) => definition.id === widgetId) || {}).title || widgetId;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Ask for a name. Resolves the text, or null when cancelled. */
export function promptText({ title, label, value = '', confirmLabel = 'Save' }) {
  return new Promise((resolve) => {
    let text = value;
    let settled = false;
    openModal({
      title,
      body: textField({ label, value, onInput: (next) => { text = next; } }),
      actions: [
        { label: 'Cancel', variant: 'ghost', onClick: () => { settled = true; resolve(null); } },
        { label: confirmLabel, onClick: () => { settled = true; resolve(text.trim() ? text : null); } },
      ],
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}

/** Import a screen or deck file chosen by the teacher; reports the outcome as a toast. */
export async function importFromFile() {
  const text = await pickTextFile('application/json,.json');
  if (text === null) return null;
  try {
    const result = await importBoardFile(text);
    toast(result.kind === 'deck'
      ? `Deck "${result.name}" imported with ${plural(result.screens, 'screen')}`
      : `Screen "${result.name}" added with ${plural(result.widgets, 'widget')}`, 4000);
    return result;
  } catch (error) {
    toast(error.message || 'That file could not be imported.', 6000);
    return null;
  }
}

export function openLibrary({ tab = 'decks' } = {}) {
  let current = tab;
  const panel = el('div', { role: 'tabpanel', id: 'libraryPanel', 'aria-label': 'Library' });
  const tabs = el('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': 'Library sections' });
  const buttons = TABS.map((item) => el('button', {
    type: 'button', class: 'segmented__opt', role: 'tab', text: item.label,
    dataset: { tab: item.id },
    'aria-controls': 'libraryPanel',
    onClick: () => { current = item.id; render(); },
  }));
  tabs.append(...buttons);

  let modal = null;

  function render() {
    buttons.forEach((button, index) => {
      const selected = String(TABS[index].id === current);
      button.setAttribute('aria-pressed', selected);
      button.setAttribute('aria-selected', selected);
    });
    const view = { decks: decksView, templates: templatesView, trash: trashView }[current];
    panel.replaceChildren(...[].concat(view()));
  }

  /* ---------- decks & folders ---------- */
  function deckRow(deck) {
    const isOpen = deck.id === decks.activeId();
    const count = decks.screensOf(deck.id).length;
    const move = el('select', {
      class: 'select lib-move', 'aria-label': `Folder for ${deck.name}`,
      onChange: (event) => { decks.move(deck.id, event.target.value || null); render(); },
    }, [
      el('option', { value: '', selected: !deck.folderId }, 'No folder'),
      ...folders.all().map((folder) => el('option', { value: folder.id, selected: deck.folderId === folder.id }, folder.name)),
    ]);

    return el('div', { class: `screenrow${isOpen ? ' is-active' : ''}`, dataset: { deck: deck.id } }, [
      el('button', {
        type: 'button', class: 'screenrow__pick', 'aria-label': `Open ${deck.name}`,
        onClick: () => {
          decks.open(deck.id);
          if (modal) modal.close();
          toast(`Opened ${deck.name}`);
        },
      }, [
        el('span', { class: 'screenrow__name', text: deck.name }),
        el('span', { class: 'screenrow__meta', text: plural(count, 'screen') }),
      ]),
      isOpen ? el('span', { class: 'tile__soon', text: 'Open' }) : null,
      move,
      el('span', { class: 'screenrow__tools' }, [
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('pencil'), 'aria-label': `Rename ${deck.name}`,
          onClick: async () => {
            const name = await promptText({ title: `Rename ${deck.name}`, label: 'Deck name', value: deck.name });
            if (name) { decks.rename(deck.id, name); render(); }
          },
        }),
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('copy'), 'aria-label': `Duplicate ${deck.name}`,
          onClick: () => { const copy = decks.duplicate(deck.id); render(); if (copy) toast(`Duplicated as ${copy.name}`); },
        }),
        el('button', {
          type: 'button', class: 'iconbtn', html: icon('download'), 'aria-label': `Save ${deck.name} to a file`,
          onClick: async () => { if (await exportDeckFile(deck.id)) toast(`${deck.name} saved to a file`); },
        }),
        el('button', {
          type: 'button', class: 'iconbtn iconbtn--danger', html: icon('trash'), 'aria-label': `Delete ${deck.name}`,
          onClick: async () => {
            if (decks.all().length < 2) { toast('Keep at least one deck'); return; }
            const ok = await confirmDialog({
              title: `Delete ${deck.name}?`,
              message: `It moves to Recently deleted, where you can restore it for ${TRASH_DAYS} days.`,
              confirmLabel: 'Delete deck',
              danger: true,
            });
            if (ok && decks.remove(deck.id)) { render(); toast(`${deck.name} moved to Recently deleted`); }
          },
        }),
      ]),
    ]);
  }

  function decksView() {
    const all = decks.all();
    const loose = all.filter((deck) => !deck.folderId || !folders.all().some((folder) => folder.id === deck.folderId));

    const toolbar = el('div', { class: 'lib-toolbar' }, [
      el('button', {
        type: 'button', class: 'btn btn--sm', dataset: { action: 'new-deck' },
        onClick: async () => {
          const name = await promptText({ title: 'New deck', label: 'Deck name', value: `Deck ${all.length + 1}`, confirmLabel: 'Create deck' });
          if (!name) return;
          decks.create(name);
          if (modal) modal.close();
          toast(`${name} created`);
        },
      }, [el('span', { html: icon('plus', 16), 'aria-hidden': 'true' }), ' New deck']),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm', dataset: { action: 'new-folder' },
        onClick: async () => {
          const name = await promptText({ title: 'New folder', label: 'Folder name', value: `Folder ${folders.all().length + 1}`, confirmLabel: 'Create folder' });
          if (name) { folders.add(name); render(); }
        },
      }, [el('span', { html: icon('folder', 16), 'aria-hidden': 'true' }), ' New folder']),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm', dataset: { action: 'import' },
        onClick: async () => { if (await importFromFile()) render(); },
      }, [el('span', { html: icon('upload', 16), 'aria-hidden': 'true' }), ' Open a file']),
    ]);

    const groups = folders.all().map((folder) => {
      const inside = all.filter((deck) => deck.folderId === folder.id);
      return el('section', { class: 'lib-folder', dataset: { folder: folder.id } }, [
        el('div', { class: 'lib-folder__head' }, [
          el('span', { class: 'lib-folder__name' }, [el('span', { html: icon('folder'), 'aria-hidden': 'true' }), folder.name]),
          el('button', {
            type: 'button', class: 'iconbtn', html: icon('pencil'), 'aria-label': `Rename folder ${folder.name}`,
            onClick: async () => {
              const name = await promptText({ title: `Rename ${folder.name}`, label: 'Folder name', value: folder.name });
              if (name) { folders.rename(folder.id, name); render(); }
            },
          }),
          el('button', {
            type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'), 'aria-label': `Remove folder ${folder.name}`,
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Remove the folder ${folder.name}?`,
                message: 'Only the folder goes. The decks inside it are kept and move back to the top level.',
                confirmLabel: 'Remove folder',
              });
              if (ok) { folders.remove(folder.id); render(); }
            },
          }),
        ]),
        inside.length
          ? el('div', { class: 'screenlist' }, inside.map(deckRow))
          : el('p', { class: 'lib-folder__empty', text: 'Empty — move a deck here with its folder menu.' }),
      ]);
    });

    return [
      el('p', { class: 'field__hint', text: 'A deck is a set of screens — one per lesson, subject or class. Folders keep them tidy.' }),
      toolbar,
      ...groups,
      loose.length ? el('div', { class: 'screenlist' }, loose.map(deckRow)) : null,
    ].filter(Boolean);
  }

  /* ---------- templates ---------- */
  function templatesView() {
    const cards = TEMPLATES.map((template) => el('article', { class: 'lib-template', dataset: { template: template.id } }, [
      el('div', { class: 'lib-template__preview', dataset: { wallpaper: template.background || 'none' }, 'aria-hidden': 'true' },
        template.widgets.map((widget) => el('span', {
          class: 'lib-template__block',
          style: `left:${widget.x}%;top:${widget.y}%;width:${widget.w}%;height:${widget.h}%`,
        }))),
      el('span', { class: 'lib-template__name', text: template.name }),
      el('p', { class: 'lib-template__text', text: template.description }),
      el('p', { class: 'lib-template__text', text: template.widgets.map((widget) => titleOf(widget.widgetId)).join(' · ') }),
      el('button', {
        type: 'button', class: 'btn btn--sm',
        onClick: () => {
          const screen = screens.addFromSpec(template);
          if (modal) modal.close();
          toast(`${screen.name} added to ${decks.active().name}`);
        },
      }, 'Use this template'),
    ]));
    return [
      el('p', { class: 'field__hint', text: 'A template is added as a new screen in the deck you have open. Your other screens are not changed.' }),
      el('div', { class: 'lib-templates' }, cards),
    ];
  }

  /* ---------- recently deleted ---------- */
  function trashView() {
    const items = trash.list();
    const rows = items.map((entry) => {
      const name = entry.item.name || (entry.kind === 'deck' ? 'Deck' : 'Screen');
      const left = trash.daysLeft(entry);
      const detail = entry.kind === 'deck'
        ? `Deck · ${plural((entry.item.screens || []).length, 'screen')}`
        : `Screen · ${plural((entry.item.widgets || []).length, 'widget')}`;
      return el('div', { class: 'screenrow', dataset: { bin: entry.id } }, [
        el('span', { class: 'screenrow__pick' }, [
          el('span', { class: 'screenrow__name', text: name }),
          el('span', { class: 'screenrow__meta', text: `${detail} · ${plural(left, 'day')} left` }),
        ]),
        el('span', { class: 'screenrow__tools' }, [
          el('button', {
            type: 'button', class: 'btn btn--ghost btn--sm', dataset: { action: 'restore' },
            onClick: () => { trash.restore(entry.id); render(); toast(`${name} restored`); },
          }, [el('span', { html: icon('restore', 16), 'aria-hidden': 'true' }), ' Restore']),
          el('button', {
            type: 'button', class: 'iconbtn iconbtn--danger', html: icon('trash'), 'aria-label': `Delete ${name} for good`,
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Delete ${name} for good?`, message: 'This cannot be undone.', confirmLabel: 'Delete for good', danger: true,
              });
              if (ok) { trash.forget(entry.id); render(); }
            },
          }),
        ]),
      ]);
    });
    return [
      el('p', { class: 'field__hint', text: `Deleted screens and decks wait here for ${TRASH_DAYS} days, then go for good.` }),
      rows.length ? el('div', { class: 'screenlist' }, rows) : el('p', { class: 'lib-empty', text: 'Nothing has been deleted recently.' }),
      rows.length ? el('div', { class: 'lib-toolbar' }, [el('button', {
        type: 'button', class: 'btn btn--danger btn--sm', dataset: { action: 'empty-bin' },
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Empty Recently deleted?', message: `${plural(items.length, 'item')} will be deleted for good.`, confirmLabel: 'Empty', danger: true,
          });
          if (ok) { trash.empty(); render(); }
        },
      }, 'Empty Recently deleted')]) : null,
    ].filter(Boolean);
  }

  render();
  modal = openModal({
    title: 'Library',
    wide: true,
    body: [tabs, panel],
    actions: [{ label: 'Done', variant: 'ghost' }],
  });
  return modal;
}
