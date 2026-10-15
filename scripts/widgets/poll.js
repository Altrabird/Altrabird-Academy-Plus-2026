/**
 * poll.js — a hands-up tally the class can see.
 *
 * Pupils need no devices: the teacher counts hands and taps an option, and the
 * bars grow live. Options can be renamed, added and removed, and the counts
 * reset without losing the question.
 */

import { el, uid, clamp, toast, copyText } from '../utils.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { textField, switchRow, section } from '../ui/forms.js';
import { icon } from '../ui/icons.js';

const MAX_OPTIONS = 6;
const DEFAULTS = {
  question: 'What do you think?',
  showCounts: true,
  options: [
    { id: 'opt-1', label: 'Yes', votes: 0 },
    { id: 'opt-2', label: 'No', votes: 0 },
  ],
};

export default {
  id: 'poll',
  title: 'Poll',
  icon: 'poll',
  size: 'lg',
  singleton: false,
  description: 'Count hands and show the result as bars.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let question = String(saved.question ?? DEFAULTS.question);
    let showCounts = saved.showCounts !== false;
    let options = Array.isArray(saved.options) && saved.options.length
      ? saved.options.map((option) => ({
        id: option.id || uid('opt'),
        label: String(option.label || 'Option'),
        votes: Math.max(0, Number(option.votes) || 0),
      }))
      : DEFAULTS.options.map((option) => ({ ...option }));

    const questionNode = el('button', {
      type: 'button', class: 'w-poll__question',
      'aria-label': 'Change the question',
      onClick: () => editQuestion(),
    });
    const list = el('div', { class: 'w-poll__options', role: 'list' });
    const totalNode = el('p', { class: 'w-poll__total' });

    const addButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: '+ Option',
      onClick: () => {
        if (options.length >= MAX_OPTIONS) { toast(`Up to ${MAX_OPTIONS} options`); return; }
        options = [...options, { id: uid('opt'), label: `Option ${options.length + 1}`, votes: 0 }];
        persist();
        render();
      },
    });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear votes',
      onClick: async () => {
        if (options.every((option) => option.votes === 0)) return;
        const ok = await confirmDialog({
          title: 'Clear the votes?',
          message: 'Every count goes back to zero. The question and the options stay.',
          confirmLabel: 'Clear votes',
          danger: true,
        });
        if (!ok) return;
        options = options.map((option) => ({ ...option, votes: 0 }));
        persist();
        render();
      },
    });
    const copyButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy result',
      onClick: async () => {
        const lines = [question, ...options.map((option) => `${option.label}: ${option.votes}`)];
        const ok = await copyText(lines.join('\n'));
        toast(ok ? 'Result copied' : 'Copying was blocked by the browser');
      },
    });

    const element = el('div', { class: 'w-poll' }, [
      questionNode,
      list,
      el('div', { class: 'w-poll__foot' }, [totalNode, addButton, resetButton, copyButton]),
    ]);

    function persist() {
      ctx.data.set({ question, showCounts, options });
    }

    function vote(optionId, delta) {
      options = options.map((option) => (option.id === optionId
        ? { ...option, votes: clamp(option.votes + delta, 0, 999) }
        : option));
      persist();
      render();
    }

    function editQuestion() {
      let draft = question;
      openModal({
        title: 'Poll question',
        body: textField({ label: 'Question', value: question, onInput: (value) => { draft = value; } }),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Save',
            onClick: () => {
              question = String(draft).trim().slice(0, 90) || question;
              persist();
              render();
            },
          },
        ],
      });
    }

    function renameOption(option) {
      let draft = option.label;
      openModal({
        title: 'Rename option',
        body: textField({ label: 'Option', value: option.label, onInput: (value) => { draft = value; } }),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Save',
            onClick: () => {
              options = options.map((item) => (item.id === option.id
                ? { ...item, label: String(draft).trim().slice(0, 30) || item.label }
                : item));
              persist();
              render();
            },
          },
        ],
      });
    }

    function render() {
      questionNode.textContent = question;
      const total = options.reduce((sum, option) => sum + option.votes, 0);
      const best = Math.max(1, ...options.map((option) => option.votes));

      list.replaceChildren(...options.map((option) => {
        const share = total ? Math.round((option.votes / total) * 100) : 0;
        return el('div', { class: 'w-poll__row', role: 'listitem' }, [
          el('button', {
            type: 'button', class: 'w-poll__bar',
            'aria-label': `${option.label}: ${option.votes} ${option.votes === 1 ? 'vote' : 'votes'}. Add one.`,
            onClick: () => vote(option.id, 1),
          }, [
            el('span', {
              class: 'w-poll__fill',
              style: `width:${Math.round((option.votes / best) * 100)}%`,
              'aria-hidden': 'true',
            }),
            el('span', { class: 'w-poll__label', text: option.label }),
            showCounts
              ? el('span', { class: 'w-poll__count', text: `${option.votes}${total ? ` · ${share}%` : ''}` })
              : null,
          ]),
          el('span', { class: 'w-poll__tools' }, [
            el('button', {
              type: 'button', class: 'iconbtn', text: '−',
              'aria-label': `Take one from ${option.label}`,
              onClick: () => vote(option.id, -1),
            }),
            el('button', {
              type: 'button', class: 'iconbtn', html: icon('pencil'),
              'aria-label': `Rename ${option.label}`,
              onClick: () => renameOption(option),
            }),
            options.length > 2 ? el('button', {
              type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'),
              'aria-label': `Remove ${option.label}`,
              onClick: () => {
                options = options.filter((item) => item.id !== option.id);
                persist();
                render();
              },
            }) : null,
          ]),
        ]);
      }));

      totalNode.textContent = total
        ? `${total} ${total === 1 ? 'vote' : 'votes'}`
        : 'Tap a bar to count a hand';
      addButton.disabled = options.length >= MAX_OPTIONS;
    }

    render();

    return {
      element,

      openSettings() {
        openModal({
          title: 'Poll',
          body: section('Poll', [
            textField({
              label: 'Question', value: question,
              onInput: (value) => { question = value; persist(); render(); },
            }),
            switchRow({
              label: 'Show the numbers',
              hint: 'Turn off to show only the bars.',
              checked: showCounts,
              onChange: (checked) => { showCounts = checked; persist(); render(); },
            }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },
    };
  },
};
