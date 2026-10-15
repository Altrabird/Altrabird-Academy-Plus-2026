/**
 * clock.js — current time, weekday and date, sized to fill its card.
 *
 * Ticks with a self-correcting setTimeout aligned to the wall clock (never a
 * per-frame loop) and stops entirely when the widget is hidden or minimized.
 */

import { el, pad2 } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { switchRow, segmented, section } from '../ui/forms.js';

const DEFAULTS = {
  hour12: false,
  showSeconds: true,
  showDate: true,
  showDay: true,
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });

export default {
  id: 'clock',
  title: 'Clock & Date',
  shortTitle: 'Clock',
  icon: 'clock',
  size: 'md',
  singleton: false,
  description: 'Time, weekday and date at a glance.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let timer = 0;
    let running = false;

    const dayNode = el('p', { class: 'w-clock__day' });
    const timeNode = el('span');
    const secondsNode = el('span', { class: 'w-clock__secs' });
    const meridiemNode = el('span', { class: 'w-clock__meridiem' });
    const timeWrap = el('time', { class: 'w-clock__time' }, [timeNode, secondsNode, meridiemNode]);
    const dateNode = el('p', { class: 'w-clock__date' });

    const element = el('div', { class: 'w-stage' }, [dayNode, timeWrap, dateNode]);

    function render() {
      const now = new Date();
      const hours24 = now.getHours();
      const hours = options.hour12 ? (hours24 % 12 || 12) : hours24;

      timeNode.textContent = `${options.hour12 ? hours : pad2(hours)}:${pad2(now.getMinutes())}`;
      secondsNode.textContent = options.showSeconds ? `:${pad2(now.getSeconds())}` : '';
      meridiemNode.textContent = options.hour12 ? (hours24 < 12 ? 'AM' : 'PM') : '';

      dayNode.textContent = options.showDay ? dayFormatter.format(now).toUpperCase() : '';
      dayNode.hidden = !options.showDay;
      dateNode.textContent = options.showDate ? dateFormatter.format(now) : '';
      dateNode.hidden = !options.showDate;

      timeWrap.setAttribute('datetime', `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(hours24)}:${pad2(now.getMinutes())}`);
      timeWrap.setAttribute('aria-label', `${dayFormatter.format(now)}, ${dateFormatter.format(now)}, ${pad2(hours24)}:${pad2(now.getMinutes())}`);
    }

    /** Wake exactly on the next second (or minute) boundary — no drift, no rAF. */
    function schedule() {
      if (!running) return;
      const now = Date.now();
      const step = options.showSeconds ? 1000 : 60000;
      const wait = step - (now % step);
      timer = setTimeout(() => {
        render();
        schedule();
      }, wait + 15);
    }

    function start() {
      if (running) return;
      running = true;
      render();
      schedule();
    }

    function stop() {
      running = false;
      clearTimeout(timer);
      timer = 0;
    }

    start();

    return {
      element,

      onActive(isActive) { if (isActive) start(); else stop(); },

      destroy() { stop(); },

      openSettings() {
        const apply = (patch) => {
          options = { ...options, ...patch };
          ctx.data.set(options);
          stop();
          start();
        };

        openModal({
          title: 'Clock & Date',
          body: section('Display', [
            segmented({
              label: 'Time format',
              value: options.hour12 ? '12' : '24',
              options: [{ value: '24', label: '24-hour' }, { value: '12', label: '12-hour' }],
              onChange: (value) => apply({ hour12: value === '12' }),
            }),
            switchRow({
              label: 'Show seconds',
              hint: 'Turn off to update once a minute.',
              checked: options.showSeconds,
              onChange: (checked) => apply({ showSeconds: checked }),
            }),
            switchRow({ label: 'Show day of week', checked: options.showDay, onChange: (checked) => apply({ showDay: checked }) }),
            switchRow({ label: 'Show date', checked: options.showDate, onChange: (checked) => apply({ showDate: checked }) }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },
    };
  },
};
