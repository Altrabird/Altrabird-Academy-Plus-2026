/**
 * calendar.js — the month at a glance, with today marked.
 *
 * Weeks start on Monday (the school week). The month can be paged back and
 * forth; "Today" returns. It re-renders on a wall-clock-aligned timeout so the
 * highlight moves at midnight without any loop.
 */

import { el } from '../utils.js';

const REFRESH_MS = 60000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

const DEFAULTS = { offset: 0 };

export default {
  id: 'calendar',
  title: 'Calendar',
  icon: 'calendar',
  size: 'lg',
  singleton: false,
  description: 'This month, with today highlighted.',

  create(ctx) {
    let offset = Number(ctx.data.get(DEFAULTS).offset) || 0;
    let refreshId = 0;

    const heading = el('h3', { class: 'w-cal__month' });
    const grid = el('div', { class: 'w-cal__grid', role: 'grid' });

    const prev = el('button', {
      type: 'button', class: 'iconbtn', text: '‹', 'aria-label': 'Previous month',
      onClick: () => { offset -= 1; persist(); render(); },
    });
    const next = el('button', {
      type: 'button', class: 'iconbtn', text: '›', 'aria-label': 'Next month',
      onClick: () => { offset += 1; persist(); render(); },
    });
    const today = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Today',
      onClick: () => { offset = 0; persist(); render(); },
    });

    const element = el('div', { class: 'w-cal' }, [
      el('div', { class: 'w-cal__head' }, [prev, heading, next]),
      grid,
      el('div', { class: 'w-cal__foot' }, [today]),
    ]);

    function persist() {
      ctx.data.set({ offset });
    }

    function render() {
      const now = new Date();
      const shown = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      heading.textContent = monthFormatter.format(shown);
      today.disabled = offset === 0;

      const firstWeekday = (shown.getDay() + 6) % 7;              // Monday = 0
      const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();

      const cells = WEEKDAYS.map((day) => el('span', {
        class: 'w-cal__weekday', role: 'columnheader', text: day,
      }));

      for (let i = 0; i < firstWeekday; i += 1) {
        cells.push(el('span', { class: 'w-cal__day is-empty', 'aria-hidden': 'true' }));
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const isToday = offset === 0 && day === now.getDate();
        const weekend = ((firstWeekday + day - 1) % 7) >= 5;
        cells.push(el('span', {
          class: `w-cal__day${isToday ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`,
          role: 'gridcell',
          'aria-current': isToday ? 'date' : undefined,
          text: String(day),
        }));
      }
      grid.replaceChildren(...cells);
    }

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
      destroy() { clearTimeout(refreshId); },
    };
  },
};
