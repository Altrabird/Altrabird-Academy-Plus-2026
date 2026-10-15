/**
 * toolbarPanel.js — the "All tools" catalogue behind the More button.
 *
 * With two dozen tools, the bar cannot hold them all. This dialog lists every
 * tool, adds one to the board with a click, and lets the teacher choose which
 * ones live in the bar itself — so a Year 2 Science board can keep Timer,
 * Traffic Light and Picker to hand and leave the rest in here.
 */

import { el, toast } from '../utils.js';
import { openModal } from './modal.js';
import { icon, hasIcon } from './icons.js';
import { state } from '../state.js';
import { DEFAULT_BAR } from '../widgets/registry.js';

const MAX_IN_BAR = 12;

/**
 * @param {{ manager: object, onChange: Function }} options
 */
export function openToolCatalogue({ manager, onChange }) {
  const inBar = el('div', { class: 'tools__grid tools__grid--bar' });
  const others = el('div', { class: 'tools__grid' });
  const barHint = el('p', { class: 'field__hint' });

  const barIds = () => {
    const chosen = state.settings.widgetBar;
    return Array.isArray(chosen) && chosen.length ? chosen : DEFAULT_BAR;
  };

  function setBar(ids) {
    state.setWidgetBar(ids.slice(0, MAX_IN_BAR));
    if (onChange) onChange();
    render();
  }

  /** A tool: icon over its name. A small round badge pins it into the bar. */
  function card(definition, { pinned }) {
    const position = barIds().indexOf(definition.id);

    const move = (delta) => {
      const ids = barIds().slice();
      [ids[position + delta], ids[position]] = [ids[position], ids[position + delta]];
      setBar(ids);
    };

    return el('div', { class: `toolcard${pinned ? ' is-pinned' : ''}`, dataset: { tool: definition.id } }, [
      el('button', {
        type: 'button', class: 'toolcard__add',
        'aria-label': `Add ${definition.title} to the board`,
        title: definition.description || definition.title,
        onClick: () => {
          manager.addWidget(definition.id);
          toast(`${definition.title} added`);
          if (onChange) onChange();
        },
      }, [
        el('span', {
          class: 'toolcard__icon', 'aria-hidden': 'true',
          html: hasIcon(definition.icon) ? icon(definition.icon, 26) : '',
        }),
        el('span', { class: 'toolcard__name', text: definition.shortTitle || definition.title }),
      ]),
      el('button', {
        type: 'button', class: 'toolcard__pin',
        'aria-pressed': String(pinned),
        'aria-label': pinned ? `Take ${definition.title} out of the bar` : `Put ${definition.title} in the bar`,
        title: pinned ? 'In the toolbar — click to take it out' : 'Put in the toolbar',
        html: icon(pinned ? 'check' : 'plus', 14),
        onClick: () => {
          const ids = barIds().filter((id) => id !== definition.id);
          if (!pinned) {
            if (barIds().length >= MAX_IN_BAR) {
              toast(`The bar holds ${MAX_IN_BAR} tools — take one out first`);
              return;
            }
            ids.push(definition.id);
          }
          setBar(ids);
        },
      }),
      pinned ? el('div', { class: 'toolcard__tools' }, [
        el('button', {
          type: 'button', class: 'toolcard__move', text: '‹',
          'aria-label': `Move ${definition.title} earlier in the bar`,
          disabled: position <= 0,
          onClick: () => move(-1),
        }),
        el('button', {
          type: 'button', class: 'toolcard__move', text: '›',
          'aria-label': `Move ${definition.title} later in the bar`,
          disabled: position === barIds().length - 1,
          onClick: () => move(1),
        }),
      ]) : null,
    ]);
  }

  function render() {
    const ids = barIds();
    const definitions = manager.listDefinitions();
    const pinned = ids.map((id) => definitions.find((d) => d.id === id)).filter(Boolean);
    const rest = definitions.filter((definition) => !ids.includes(definition.id));

    inBar.replaceChildren(...pinned.map((definition) => card(definition, { pinned: true })));
    others.replaceChildren(...rest.map((definition) => card(definition, { pinned: false })));
    barHint.textContent = `${pinned.length} of ${MAX_IN_BAR} places used · click a tool to add it to the board · ✓ takes it out of the toolbar, + puts it in`;
  }

  render();

  return openModal({
    title: 'All tools',
    wide: true,
    body: [
      el('h3', { class: 'tools__heading', text: 'In the toolbar' }),
      barHint,
      inBar,
      el('h3', { class: 'tools__heading', text: 'More tools' }),
      others,
    ],
    actions: [
      {
        label: 'Reset the bar',
        variant: 'ghost',
        close: false,
        onClick: () => { setBar(DEFAULT_BAR); toast('Toolbar reset'); return false; },
      },
      { label: 'Done', variant: 'ghost' },
    ],
  });
}
