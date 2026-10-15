/**
 * timer.js — classroom countdown.
 *
 * Timing is always derived from wall-clock timestamps (`Date.now()` against a
 * stored `endAt`), never by decrementing a counter, so a throttled or delayed
 * tab still shows the correct remaining time. The tick only exists to repaint.
 *
 * States: idle · running · paused · completed
 * Fires a single `timer:complete` CustomEvent on `document` when it reaches 0.
 */

import { el, pad2, clamp, toast } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { textField, section } from '../ui/forms.js';
import { storage } from '../storage.js';
import { playFinish, playWarning } from '../audio.js';

const MINUTE = 60000;
const BUILTIN_PRESETS = [1, 2, 5, 10, 15, 20];
const WARNING_MS = 10000;
const TICK_MS = 200;

const DEFAULTS = {
  durationMs: 5 * MINUTE,
  remainingMs: 5 * MINUTE,
  status: 'idle',
  endAt: 0,
};

function formatDuration(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

export default {
  id: 'timer',
  title: 'Timer',
  icon: 'timer',
  size: 'lg',   // display + four controls + six presets need the room
  singleton: false,
  description: 'Countdown with presets, a ten-second warning and a finish sound.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);

    let durationMs = Number(saved.durationMs) || DEFAULTS.durationMs;
    // Not clamped to the duration: "+30 sec" can legitimately push the
    // remaining time above the configured duration.
    let remainingMs = Math.max(0, Number(saved.remainingMs) || 0);
    let status = ['idle', 'running', 'paused', 'completed'].includes(saved.status) ? saved.status : 'idle';
    let endAt = Number(saved.endAt) || 0;
    let tickId = 0;
    let completeFired = false;
    let warningPlayed = false;

    // Restore a timer that was running when the page was closed.
    if (status === 'running') {
      const left = endAt - Date.now();
      if (left > 0) {
        remainingMs = left;
      } else {
        remainingMs = 0;
        status = 'completed';
        completeFired = true;   // never fire the event for a completion we missed
      }
    }

    /* ---------- DOM ---------- */
    // A horizontal bar rather than a ring: it stays readable and never collides
    // with the digits, whatever shape the card is resized to.
    const barFill = el('div', { class: 'w-timer__bar-fill' });
    const bar = el('div', {
      class: 'w-timer__bar', role: 'progressbar',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Time remaining',
    }, [barFill]);

    const timeNode = el('p', { class: 'w-timer__time', role: 'timer', 'aria-live': 'off' });
    const statusNode = el('p', { class: 'w-timer__status' });
    const display = el('div', { class: 'w-timer__display' }, [
      el('div', { class: 'w-timer__readout' }, [timeNode, statusNode]),
      bar,
    ]);

    const startButton = el('button', { type: 'button', class: 'btn btn--sm', onClick: () => toggleRun() });
    const resetButton = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset', onClick: () => reset() });
    const add30Button = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '+30 sec', onClick: () => addTime(30000) });
    const add60Button = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '+1 min', onClick: () => addTime(MINUTE) });

    const controls = el('div', { class: 'w-timer__controls' }, [startButton, resetButton, add30Button, add60Button]);
    const presets = el('div', { class: 'w-timer__presets', role: 'group', 'aria-label': 'Timer presets' });

    const element = el('div', { class: 'w-timer' }, [display, controls, presets]);

    /* ---------- presets ---------- */
    function customPresets() {
      const list = storage.loadTimerPresets();
      return Array.isArray(list) ? list : [];
    }

    function renderPresets() {
      const all = [
        ...BUILTIN_PRESETS.map((minutes) => ({ id: `m${minutes}`, label: `${minutes} min`, ms: minutes * MINUTE })),
        ...customPresets(),
      ];
      presets.replaceChildren(...all.map((preset) => el('button', {
        type: 'button',
        class: `chip-btn${preset.ms === durationMs ? ' is-active' : ''}`,
        text: preset.label,
        'aria-pressed': String(preset.ms === durationMs),
        onClick: () => setDuration(preset.ms),
      })));
    }

    /* ---------- state changes ---------- */
    function persist() {
      ctx.data.set({ durationMs, remainingMs, status, endAt });
    }

    function stopTick() {
      clearTimeout(tickId);
      tickId = 0;
    }

    function tick() {
      if (status !== 'running') return;
      remainingMs = Math.max(0, endAt - Date.now());
      render();

      if (remainingMs <= 0) {
        complete();
        return;
      }
      if (!warningPlayed && remainingMs <= WARNING_MS) {
        warningPlayed = true;
        playWarning();
      }
      tickId = setTimeout(tick, Math.min(TICK_MS, remainingMs));
    }

    function start() {
      if (remainingMs <= 0) remainingMs = durationMs;
      if (remainingMs <= 0) return;
      endAt = Date.now() + remainingMs;
      status = 'running';
      completeFired = false;
      warningPlayed = remainingMs <= WARNING_MS;
      persist();
      stopTick();
      tick();
    }

    function pause() {
      if (status !== 'running') return;
      remainingMs = Math.max(0, endAt - Date.now());
      status = 'paused';
      stopTick();
      persist();
      render();
    }

    function toggleRun() {
      if (status === 'running') pause();
      else start();
    }

    function reset() {
      stopTick();
      remainingMs = durationMs;
      status = 'idle';
      endAt = 0;
      completeFired = false;
      warningPlayed = false;
      persist();
      render();
    }

    function complete() {
      stopTick();
      remainingMs = 0;
      status = 'completed';
      endAt = 0;
      persist();
      render();

      if (completeFired) return;          // exactly one event per countdown
      completeFired = true;
      playFinish();
      document.dispatchEvent(new CustomEvent('timer:complete', {
        bubbles: true,
        detail: { instanceId: ctx.instanceId, durationMs },
      }));
    }

    /**
     * Extend the countdown in progress. The configured duration is left alone
     * on purpose: Reset must return to the duration the teacher chose, not to
     * the choice plus whatever was added during the lesson.
     */
    function addTime(ms) {
      if (status === 'running') {
        endAt += ms;
        remainingMs = Math.max(0, endAt - Date.now());
      } else {
        remainingMs = Math.max(0, remainingMs + ms);
        if (status === 'completed') status = 'paused';
      }
      completeFired = false;
      warningPlayed = remainingMs <= WARNING_MS;
      persist();
      render();
      renderPresets();
    }

    function setDuration(ms) {
      durationMs = Math.max(1000, Math.round(ms));
      stopTick();
      remainingMs = durationMs;
      status = 'idle';
      endAt = 0;
      completeFired = false;
      warningPlayed = false;
      persist();
      render();
      renderPresets();
    }

    /* ---------- rendering ---------- */
    const STATUS_TEXT = {
      idle: 'Ready',
      running: 'Counting down',
      paused: 'Paused',
      completed: "TIME'S UP!",
    };

    // The tick runs five times a second; the display only changes once a
    // second, so nothing is written to the DOM unless it actually differs.
    let painted = { time: '', status: '', progress: -1 };

    function render() {
      const warning = status === 'running' && remainingMs <= WARNING_MS;
      const time = formatDuration(remainingMs);
      const progress = durationMs > 0
        ? Math.round(clamp(remainingMs / durationMs, 0, 1) * 1000) / 10
        : 0;

      if (time !== painted.time || status !== painted.status) {
        timeNode.textContent = time;
        timeNode.setAttribute('aria-label', `${time} remaining, ${STATUS_TEXT[status]}`);
      }
      if (status !== painted.status) {
        statusNode.textContent = STATUS_TEXT[status];
        element.dataset.status = status;
        startButton.textContent = status === 'running' ? 'Pause' : (status === 'paused' ? 'Resume' : 'Start');
        startButton.setAttribute('aria-label', status === 'running' ? 'Pause timer' : 'Start timer');
      }
      if (progress !== painted.progress) {
        barFill.style.width = `${progress}%`;
        bar.setAttribute('aria-valuenow', String(Math.round(progress)));
      }

      element.classList.toggle('is-warning', warning);
      element.classList.toggle('is-complete', status === 'completed');

      painted = { time, status, progress };
    }

    renderPresets();
    render();
    if (status === 'running') tick();

    return {
      element,

      // The countdown deliberately keeps running while minimized or hidden —
      // the teacher still expects it to finish. Timestamps keep it exact.
      destroy() { stopTick(); },

      openSettings() {
        let minutes = Math.floor(durationMs / MINUTE);
        let seconds = Math.round((durationMs % MINUTE) / 1000);
        const savedList = el('div', { class: 'w-timer__saved' });

        function renderSaved() {
          const list = customPresets();
          savedList.replaceChildren(
            ...(list.length
              ? list.map((preset) => el('div', { class: 'w-timer__saved-row' }, [
                el('span', { text: preset.label }),
                el('button', {
                  type: 'button', class: 'btn btn--ghost btn--sm', text: 'Delete',
                  onClick: () => {
                    storage.saveTimerPresets(customPresets().filter((item) => item.id !== preset.id));
                    renderSaved();
                    renderPresets();
                  },
                }),
              ]))
              : [el('p', { class: 'field__hint', text: 'No custom presets saved yet.' })]),
          );
        }
        renderSaved();

        const customMs = () => clamp((minutes * MINUTE) + (seconds * 1000), 1000, 24 * 3600000);

        openModal({
          title: 'Timer',
          body: [
            section('Custom duration', [
              el('div', { class: 'w-timer__custom' }, [
                textField({
                  label: 'Minutes', type: 'number', value: String(minutes),
                  onInput: (value) => { minutes = clamp(Number(value) || 0, 0, 600); },
                }),
                textField({
                  label: 'Seconds', type: 'number', value: String(seconds),
                  onInput: (value) => { seconds = clamp(Number(value) || 0, 0, 59); },
                }),
              ]),
              el('div', { class: 'w-timer__custom-actions' }, [
                el('button', {
                  type: 'button', class: 'btn btn--sm', text: 'Use this duration',
                  onClick: () => { setDuration(customMs()); toast(`Timer set to ${formatDuration(customMs())}`); },
                }),
                el('button', {
                  type: 'button', class: 'btn btn--ghost btn--sm', text: 'Save as preset',
                  onClick: () => {
                    const ms = customMs();
                    const label = ms % MINUTE === 0 ? `${ms / MINUTE} min` : formatDuration(ms);
                    const list = customPresets();
                    if (list.some((preset) => preset.ms === ms)) {
                      toast('That preset already exists');
                      return;
                    }
                    list.push({ id: `custom-${ms}`, label, ms });
                    storage.saveTimerPresets(list);
                    renderSaved();
                    renderPresets();
                    toast(`Preset saved: ${label}`);
                  },
                }),
              ]),
            ]),
            section('Saved presets', savedList),
          ],
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },
    };
  },
};
