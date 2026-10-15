/**
 * sticker.js — a single large mark to stamp on the board.
 *
 * Pick a shape and a colour: a tick for finished work, a star for well done,
 * an arrow pointing at another widget. It sits on the board with no card, so
 * it reads as a stamp rather than a panel.
 */

import { el } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { segmented, section, switchRow } from '../ui/forms.js';
import { icon, hasIcon } from '../ui/icons.js';

const SHAPES = [
  { id: 'stickers', label: 'Sticker' },
  { id: 'celebration', label: 'Party' },
  { id: 'crystal', label: 'Gem' },
  { id: 'bulb', label: 'Idea' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'droplet', label: 'Drop' },
  { id: 'atom', label: 'Atom' },
  { id: 'magnet', label: 'Magnet' },
  { id: 'move', label: 'Arrow' },
];

const COLOURS = [
  { id: 'accent', label: 'Accent' },
  { id: 'ok', label: 'Green' },
  { id: 'warn', label: 'Amber' },
  { id: 'danger', label: 'Red' },
  { id: 'text', label: 'Plain' },
];

const DEFAULTS = { shape: 'stickers', colour: 'accent', plain: true, caption: '' };

export default {
  id: 'sticker',
  title: 'Sticker',
  icon: 'stickers',
  size: 'md',
  singleton: false,
  description: 'Stamp a mark on the board.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let options = {
      ...DEFAULTS,
      ...saved,
      shape: hasIcon(saved.shape) ? saved.shape : DEFAULTS.shape,
      colour: COLOURS.some((c) => c.id === saved.colour) ? saved.colour : 'accent',
    };

    const mark = el('span', { class: 'w-sticker__mark', 'aria-hidden': 'true' });
    const caption = el('p', { class: 'w-sticker__caption' });
    const element = el('div', { class: 'w-sticker' }, [mark, caption]);

    function persist() { ctx.data.set(options); }

    function render() {
      mark.innerHTML = icon(options.shape, 96);
      mark.dataset.colour = options.colour;
      caption.textContent = options.caption || '';
      caption.hidden = !options.caption;

      const shapeName = (SHAPES.find((shape) => shape.id === options.shape) || SHAPES[0]).label;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', options.caption || `${shapeName} sticker`);

      const frame = element.closest('.widget');
      if (frame) frame.classList.toggle('is-plain', options.plain);
    }

    render();
    queueMicrotask(render);   // the frame does not exist during the first render

    return {
      element,

      openSettings() {
        const apply = (patch) => {
          options = { ...options, ...patch };
          persist();
          render();
        };

        openModal({
          title: 'Sticker',
          body: section('Sticker', [
            segmented({
              label: 'Shape',
              value: options.shape,
              options: SHAPES.map((shape) => ({ value: shape.id, label: shape.label })),
              onChange: (shape) => apply({ shape }),
            }),
            segmented({
              label: 'Colour',
              value: options.colour,
              options: COLOURS.map((colour) => ({ value: colour.id, label: colour.label })),
              onChange: (colour) => apply({ colour }),
            }),
            switchRow({
              label: 'No card',
              hint: 'Stamp it straight onto the board with no panel behind it.',
              checked: options.plain,
              onChange: (plain) => apply({ plain }),
            }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },

      destroy() {
        const frame = element.closest('.widget');
        if (frame) frame.classList.remove('is-plain');
      },
    };
  },
};
