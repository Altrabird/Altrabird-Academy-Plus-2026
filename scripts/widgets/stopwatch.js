/**
 * stopwatch.js — counts up, with laps.
 *
 * Like the Timer, elapsed time is the difference between wall-clock timestamps,
 * never an accumulated tick, so a throttled tab or a reload cannot make it
 * drift. It keeps running across a reload if it was running when you left.
 */

import { el, pad2, toast, copyText } from '../utils.js';

const TICK_MS = 100;
const DEFAULTS = { startedAt: 0, elapsedMs: 0, running: false, laps: [] };

function format(ms) {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}:${pad2(minutes % 60)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}.${tenths}`;
}

export default {
  id: 'stopwatch',
  title: 'Stopwatch',
  icon: 'stopwatch',
  size: 'md',
  singleton: false,
  description: 'Count up, with lap times.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let startedAt = Number(saved.startedAt) || 0;
    let elapsedMs = Math.max(0, Number(saved.elapsedMs) || 0);
    let running = Boolean(saved.running) && startedAt > 0;
    let laps = Array.isArray(saved.laps) ? saved.laps : [];
    let timer = 0;
    let painted = '';

    const timeNode = el('p', { class: 'w-watch__time', role: 'timer', 'aria-live': 'off' });
    const lapList = el('ol', { class: 'w-watch__laps' });

    const startButton = el('button', { type: 'button', class: 'btn btn--sm', onClick: () => toggle() });
    const lapButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Lap',
      onClick: () => {
        laps = [...laps, current()];
        persist();
        render(true);
      },
    });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset',
      onClick: () => {
        stop();
        startedAt = 0;
        elapsedMs = 0;
        running = false;
        laps = [];
        persist();
        render(true);
      },
    });
    const copyButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy laps',
      onClick: async () => {
        if (!laps.length) { toast('No laps yet'); return; }
        const ok = await copyText(laps.map((ms, index) => `${index + 1}. ${format(ms)}`).join('\n'));
        toast(ok ? 'Lap times copied' : 'Copying was blocked by the browser');
      },
    });

    const element = el('div', { class: 'w-watch' }, [
      el('div', { class: 'w-watch__display' }, [timeNode]),
      el('div', { class: 'w-watch__controls' }, [startButton, lapButton, resetButton, copyButton]),
      lapList,
    ]);

    const current = () => (running ? elapsedMs + (Date.now() - startedAt) : elapsedMs);

    function persist() {
      ctx.data.set({ startedAt, elapsedMs, running, laps });
    }

    function stop() {
      clearTimeout(timer);
      timer = 0;
    }

    function tick() {
      render();
      if (running) timer = setTimeout(tick, TICK_MS);
    }

    function toggle() {
      if (running) {
        elapsedMs = current();
        running = false;
        startedAt = 0;
        stop();
      } else {
        startedAt = Date.now();
        running = true;
        stop();
        tick();
      }
      persist();
      render(true);
    }

    function render(force = false) {
      const text = format(current());
      if (force || text !== painted) {
        painted = text;
        timeNode.textContent = text;
        timeNode.setAttribute('aria-label', `${text} elapsed`);
      }
      if (!force) return;

      startButton.textContent = running ? 'Stop' : (current() > 0 ? 'Resume' : 'Start');
      lapButton.disabled = !running;
      resetButton.disabled = running || (current() === 0 && !laps.length);
      copyButton.disabled = !laps.length;
      element.classList.toggle('is-running', running);

      lapList.replaceChildren(...laps.map((ms, index) => el('li', { class: 'w-watch__lap' }, [
        el('span', { class: 'w-watch__lap-index', text: `${index + 1}` }),
        el('span', { class: 'w-watch__lap-time', text: format(ms) }),
        el('span', {
          class: 'w-watch__lap-split',
          text: index === 0 ? '' : `+${format(ms - laps[index - 1])}`,
        }),
      ])));
      lapList.hidden = !laps.length;
    }

    render(true);
    if (running) tick();

    return {
      element,
      destroy() { stop(); },
    };
  },
};
