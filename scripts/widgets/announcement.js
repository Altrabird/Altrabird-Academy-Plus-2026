/**
 * announcement.js — one large message for the class.
 * Edit / Save / Clear, with font size and alignment saved per widget.
 */

import { el, clamp, toast } from '../utils.js';

const SIZE_STEPS = [0.8, 1, 1.25, 1.6, 2];
const ALIGNMENTS = [
  { value: 'left', label: 'Left', glyph: '⯇' },
  { value: 'center', label: 'Centre', glyph: '≡' },
  { value: 'right', label: 'Right', glyph: '⯈' },
];

const DEFAULTS = {
  text: '',
  sizeStep: 2,
  align: 'center',
};

export default {
  id: 'announcement',
  title: 'Announcement',
  icon: 'announcement',
  size: 'lg',
  singleton: false,
  description: 'A large message for the whole class to read.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let text = typeof saved.text === 'string' ? saved.text : '';
    let sizeStep = clamp(
      Number.isFinite(Number(saved.sizeStep)) ? Number(saved.sizeStep) : DEFAULTS.sizeStep,
      0, SIZE_STEPS.length - 1,
    );
    let align = ALIGNMENTS.some((item) => item.value === saved.align) ? saved.align : 'center';
    let editing = false;

    const display = el('p', { class: 'w-note__text' });
    const empty = el('p', { class: 'w-note__empty', text: 'Press Edit to write a message for the class.' });
    const editor = el('textarea', {
      class: 'w-note__editor textarea',
      'aria-label': 'Announcement text',
      placeholder: 'Observe what happens when we heat the water.',
    });

    const stage = el('div', { class: 'w-note__stage' }, [display, empty, editor]);

    const editButton = el('button', { type: 'button', class: 'btn btn--sm', onClick: () => toggleEdit() });
    const clearButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear',
      onClick: () => {
        text = '';
        editor.value = '';
        persist();
        render();
        toast('Announcement cleared');
      },
    });

    const smaller = el('button', {
      type: 'button', class: 'iconbtn', text: 'A−', 'aria-label': 'Smaller text',
      onClick: () => { sizeStep = clamp(sizeStep - 1, 0, SIZE_STEPS.length - 1); persist(); render(); },
    });
    const bigger = el('button', {
      type: 'button', class: 'iconbtn', text: 'A+', 'aria-label': 'Larger text',
      onClick: () => { sizeStep = clamp(sizeStep + 1, 0, SIZE_STEPS.length - 1); persist(); render(); },
    });

    const alignButtons = ALIGNMENTS.map((item) => el('button', {
      type: 'button', class: 'iconbtn', text: item.glyph, 'aria-label': `Align ${item.label.toLowerCase()}`,
      onClick: () => { align = item.value; persist(); render(); },
    }));

    const toolbar = el('div', { class: 'w-note__toolbar' }, [
      editButton, clearButton,
      el('span', { class: 'w-note__spacer' }),
      smaller, bigger,
      el('span', { class: 'w-note__divider', 'aria-hidden': 'true' }),
      ...alignButtons,
    ]);

    const element = el('div', { class: 'w-note' }, [stage, toolbar]);

    function persist() {
      ctx.data.set({ text, sizeStep, align });
    }

    function toggleEdit() {
      if (editing) {
        text = editor.value.trim();
        editing = false;
        persist();
        toast('Announcement saved');
      } else {
        editing = true;
        editor.value = text;
      }
      render();
      if (editing) editor.focus();
    }

    function render() {
      display.textContent = text;
      display.hidden = editing || !text;
      empty.hidden = editing || Boolean(text);
      editor.hidden = !editing;

      stage.style.setProperty('--note-scale', String(SIZE_STEPS[sizeStep]));
      display.style.textAlign = align;
      editor.style.textAlign = align;

      editButton.textContent = editing ? 'Save' : 'Edit';
      editButton.setAttribute('aria-label', editing ? 'Save announcement' : 'Edit announcement');
      alignButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(ALIGNMENTS[index].value === align)));
      smaller.disabled = sizeStep === 0;
      bigger.disabled = sizeStep === SIZE_STEPS.length - 1;
    }

    // Ctrl+Enter saves, Escape cancels — handy on a classroom keyboard.
    editor.addEventListener('keydown', (event) => {
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

    return { element };
  },
};
