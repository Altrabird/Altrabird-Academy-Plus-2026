/**
 * workMode.js — silent / pair / group work.
 * The chosen mode fills the card; the three cards below switch it.
 */

import { el } from '../utils.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { textField, section } from '../ui/forms.js';

const MODES = ['silent', 'pair', 'group'];
const ICONS = { silent: 'modeSilent', pair: 'modePair', group: 'modeGroup' };

const DEFAULTS = {
  active: 'silent',
  modes: {
    silent: { title: 'SILENT WORK', instruction: 'Work quietly on your own' },
    pair: { title: 'PAIR WORK', instruction: 'Talk with your partner' },
    group: { title: 'GROUP WORK', instruction: 'Work together in your group' },
  },
};

function mergeModes(saved) {
  const modes = {};
  for (const key of MODES) modes[key] = { ...DEFAULTS.modes[key], ...((saved && saved[key]) || {}) };
  return modes;
}

export default {
  id: 'workMode',
  title: 'Work Mode',
  icon: 'workMode',
  size: 'md',
  singleton: false,
  description: 'Show whether pupils work alone, in pairs or in groups.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let active = MODES.includes(saved.active) ? saved.active : 'silent';
    let modes = mergeModes(saved.modes);

    const stageIcon = el('span', { class: 'w-work__icon', 'aria-hidden': 'true' });
    const stageTitle = el('p', { class: 'w-work__title' });
    const stageText = el('p', { class: 'w-work__instruction' });
    const stage = el('div', { class: 'w-work__stage' }, [stageIcon, stageTitle, stageText]);

    const chooser = el('div', { class: 'w-work__chooser', role: 'group', 'aria-label': 'Choose the work mode' });
    const cards = new Map();

    for (const key of MODES) {
      const label = el('span', { class: 'w-work__card-title' });
      const card = el('button', {
        type: 'button', class: 'w-work__card', dataset: { mode: key },
        onClick: () => select(key),
      }, [
        el('span', { class: 'w-work__card-icon', 'aria-hidden': 'true', html: icon(ICONS[key], 22) }),
        label,
      ]);
      cards.set(key, { card, label });
      chooser.append(card);
    }

    const element = el('div', { class: 'w-work' }, [stage, chooser]);

    function select(key) {
      active = key;
      ctx.data.set({ active, modes });
      render();
    }

    function render() {
      element.dataset.mode = active;
      stageIcon.innerHTML = icon(ICONS[active], 64);
      stageTitle.textContent = modes[active].title;
      stageText.textContent = modes[active].instruction || '';
      stageText.hidden = !modes[active].instruction;

      for (const key of MODES) {
        const entry = cards.get(key);
        const isActive = key === active;
        entry.label.textContent = modes[key].title;
        entry.card.classList.toggle('is-active', isActive);
        entry.card.setAttribute('aria-pressed', String(isActive));
      }
    }

    render();

    return {
      element,

      openSettings() {
        const draft = JSON.parse(JSON.stringify(modes));
        openModal({
          title: 'Work Mode labels',
          body: MODES.map((key) => section(DEFAULTS.modes[key].title, [
            textField({
              label: 'Title', value: draft[key].title,
              onInput: (value) => { draft[key].title = value.toUpperCase(); },
            }),
            textField({
              label: 'Instruction', hint: 'Optional — leave empty to hide.', value: draft[key].instruction,
              onInput: (value) => { draft[key].instruction = value; },
            }),
          ])),
          actions: [
            { label: 'Cancel', variant: 'ghost' },
            {
              label: 'Save labels',
              onClick: () => {
                modes = mergeModes(draft);
                ctx.data.set({ active, modes });
                render();
              },
            },
          ],
        });
      },
    };
  },
};
