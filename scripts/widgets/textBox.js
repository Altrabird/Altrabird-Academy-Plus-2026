/**
 * textBox.js — a plain text box for the board.
 *
 * Where the Announcement widget is one big message in a card, this is a label
 * you can drop anywhere: a heading over a group of widgets, an instruction, a
 * word to spell. It can sit on a transparent background so it reads as writing
 * straight on the wallpaper.
 */

import { el, clamp, on } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { segmented, switchRow, section } from '../ui/forms.js';

const SIZES = [0.85, 1, 1.35, 1.8, 2.4];
const ALIGNMENTS = ['left', 'center', 'right'];
const COLOURS = [
  { id: 'text', label: 'Default' },
  { id: 'accent', label: 'Accent' },
  { id: 'warn', label: 'Amber' },
  { id: 'danger', label: 'Red' },
  { id: 'ok', label: 'Green' },
];

const DEFAULTS = {
  text: '',
  sizeStep: 2,
  align: 'left',
  colour: 'text',
  bold: true,
  plain: false,     // plain = no card background, writing straight on the board
};

export default {
  id: 'textBox',
  title: 'Text',
  icon: 'textBox',
  size: 'md',
  singleton: false,
  description: 'A text box you can place anywhere on the board.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let options = {
      ...DEFAULTS,
      ...saved,
      sizeStep: clamp(Number.isFinite(Number(saved.sizeStep)) ? Number(saved.sizeStep) : 2, 0, SIZES.length - 1),
      align: ALIGNMENTS.includes(saved.align) ? saved.align : 'left',
      colour: COLOURS.some((c) => c.id === saved.colour) ? saved.colour : 'text',
    };
    let editing = false;

    const view = el('p', { class: 'w-text__view' });
    const empty = el('p', { class: 'w-text__empty', text: 'Double-click to write…' });
    const editor = el('textarea', {
      class: 'w-text__editor textarea',
      'aria-label': 'Text',
      placeholder: 'Type here…',
    });
    const stage = el('div', { class: 'w-text__stage' }, [view, empty, editor]);

    const editButton = el('button', {
      type: 'button', class: 'btn btn--sm',
      onClick: () => toggleEdit(),
    });

    const toolbar = el('div', { class: 'w-text__toolbar' }, [editButton]);

    const element = el('div', { class: 'w-text' }, [stage, toolbar]);

    function persist() {
      ctx.data.set(options);
    }

    function toggleEdit() {
      if (editing) {
        options.text = editor.value;
        editing = false;
        persist();
      } else {
        editing = true;
        editor.value = options.text;
      }
      render();
      if (editing) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }

    function render() {
      view.textContent = options.text;
      view.hidden = editing || !options.text;
      empty.hidden = editing || Boolean(options.text);
      editor.hidden = !editing;

      stage.style.setProperty('--text-scale-step', String(SIZES[options.sizeStep]));
      view.style.textAlign = options.align;
      editor.style.textAlign = options.align;
      view.dataset.colour = options.colour;
      view.style.fontWeight = options.bold ? '800' : '500';
      editor.style.fontWeight = view.style.fontWeight;

      editButton.textContent = editing ? 'Save' : 'Edit';
      editButton.setAttribute('aria-label', editing ? 'Save text' : 'Edit text');

      // "Plain" strips the card so the text sits on the wallpaper itself.
      const frame = element.closest('.widget');
      if (frame) frame.classList.toggle('is-plain', options.plain);
    }

    // Double-clicking the text is the quickest way in.
    on(stage, 'dblclick', () => { if (!editing) toggleEdit(); });

    on(editor, 'keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleEdit();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        editing = false;
        render();
      }
    });

    render();
    // The frame does not exist yet on the first render; catch up once it does.
    queueMicrotask(render);

    return {
      element,

      /** Size, alignment, colour and the plain/card choice live here so the
       *  card itself keeps nothing but the text and an Edit button. */
      openSettings() {
        const apply = (patch) => {
          options = { ...options, ...patch };
          persist();
          render();
        };

        openModal({
          title: 'Text',
          body: section('Appearance', [
            segmented({
              label: 'Text size',
              value: String(options.sizeStep),
              options: ['Small', 'Normal', 'Large', 'Bigger', 'Huge'].map((label, index) => ({ value: String(index), label })),
              onChange: (value) => apply({ sizeStep: Number(value) }),
            }),
            segmented({
              label: 'Alignment',
              value: options.align,
              options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
              ],
              onChange: (align) => apply({ align }),
            }),
            segmented({
              label: 'Colour',
              value: options.colour,
              options: COLOURS.map((colour) => ({ value: colour.id, label: colour.label })),
              onChange: (colour) => apply({ colour }),
            }),
            switchRow({ label: 'Bold', checked: options.bold, onChange: (bold) => apply({ bold }) }),
            switchRow({
              label: 'No card',
              hint: 'Write straight onto the board, with no panel behind the text.',
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
