/**
 * countdown.js — days until something: a trip, a test, the holidays.
 *
 * Counts whole days from today's date, so it does not jitter through the day,
 * and refreshes on a wall-clock-aligned timeout rather than a loop.
 */

import { el } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { textField, section, switchRow } from '../ui/forms.js';

const DAY = 86400000;
const REFRESH_MS = 60000;

const DEFAULTS = { title: 'School holidays', date: '', showDate: true };

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Whole days from today (local midnight) to the target date. */
function daysUntil(iso) {
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

export default {
  id: 'countdown',
  title: 'Event Countdown',
  shortTitle: 'Countdown',
  icon: 'countdown',
  size: 'md',
  singleton: false,
  description: 'Days until a date you choose.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let refreshId = 0;

    const number = el('p', { class: 'w-count__number' });
    const unit = el('p', { class: 'w-count__unit' });
    const label = el('p', { class: 'w-count__title' });
    const when = el('p', { class: 'w-count__date' });

    const setButton = el('button', {
      type: 'button', class: 'btn btn--sm', text: 'Set a date',
      onClick: () => openEditor(),
    });

    const element = el('div', { class: 'w-count' }, [
      el('div', { class: 'w-count__stage' }, [label, number, unit, when]),
      el('div', { class: 'w-count__controls' }, [setButton]),
    ]);

    function persist() {
      ctx.data.set(options);
    }

    function render() {
      const days = options.date ? daysUntil(options.date) : null;
      label.textContent = options.title || '';
      label.hidden = !options.title;

      if (days === null) {
        number.textContent = '—';
        unit.textContent = 'no date set yet';
        when.hidden = true;
        element.dataset.state = 'empty';
        setButton.textContent = 'Set a date';
        return;
      }

      element.dataset.state = days === 0 ? 'today' : (days < 0 ? 'past' : 'future');
      number.textContent = days === 0 ? 'Today' : String(Math.abs(days));
      unit.textContent = days === 0
        ? 'is the day!'
        : `${Math.abs(days) === 1 ? 'day' : 'days'} ${days < 0 ? 'ago' : 'to go'}`;
      when.textContent = dateFormatter.format(new Date(`${options.date}T00:00:00`));
      when.hidden = !options.showDate;
      setButton.textContent = 'Change';
    }

    function openEditor() {
      const draft = { ...options };
      const error = el('p', { class: 'callout callout--warn', hidden: true });

      openModal({
        title: 'Event countdown',
        body: section('Event', [
          textField({
            label: 'What is it?', value: draft.title, placeholder: 'e.g. Science fair',
            onInput: (value) => { draft.title = value; },
          }),
          textField({
            label: 'Date', type: 'date', value: draft.date,
            onInput: (value) => { draft.date = value; },
          }),
          switchRow({
            label: 'Show the date underneath',
            checked: draft.showDate,
            onChange: (checked) => { draft.showDate = checked; },
          }),
          error,
        ]),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Save',
            onClick: () => {
              if (draft.date && daysUntil(draft.date) === null) {
                error.textContent = 'That date could not be read.';
                error.hidden = false;
                return false;
              }
              options = { ...draft };
              persist();
              render();
              return true;
            },
          },
        ],
      });
    }

    /** Re-check on the next minute so a countdown rolls over at midnight. */
    function schedule() {
      clearTimeout(refreshId);
      refreshId = setTimeout(() => {
        render();
        schedule();
      }, REFRESH_MS - (Date.now() % REFRESH_MS) + 20);
    }

    render();
    schedule();

    return {
      element,
      onActive(isActive) {
        if (isActive) { render(); schedule(); } else { clearTimeout(refreshId); }
      },
      openSettings() { openEditor(); },
      destroy() { clearTimeout(refreshId); },
    };
  },
};
