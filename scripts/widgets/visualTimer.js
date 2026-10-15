/**
 * visualTimer.js — a countdown a child can read without reading numbers.
 *
 * A coloured wedge shrinks as the time goes: how much is left is obvious from
 * across the room. Timing comes from the same wall-clock approach as the Timer,
 * and it fires the same `timer:complete` event, so a celebration still follows.
 */

import { el, clamp, pad2 } from '../utils.js';
import { playFinish } from '../audio.js';

const MINUTE = 60000;
const PRESETS = [1, 2, 5, 10, 15, 20, 30];
const TICK_MS = 200;
const DEFAULTS = { durationMs: 5 * MINUTE, remainingMs: 5 * MINUTE, status: 'idle', endAt: 0 };

const SIZE = 100;
const RADIUS = 44;

/** SVG path for a pie wedge covering `fraction` of the circle, clockwise from 12. */
function wedge(fraction) {
  const value = clamp(fraction, 0, 1);
  if (value <= 0) return '';
  if (value >= 1) {
    return `M ${SIZE / 2} ${SIZE / 2 - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${(SIZE / 2) - 0.01} ${SIZE / 2 - RADIUS} Z`;
  }
  const angle = value * Math.PI * 2;
  const x = (SIZE / 2) + (Math.sin(angle) * RADIUS);
  const y = (SIZE / 2) - (Math.cos(angle) * RADIUS);
  return `M ${SIZE / 2} ${SIZE / 2} L ${SIZE / 2} ${SIZE / 2 - RADIUS} A ${RADIUS} ${RADIUS} 0 ${value > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
}

export default {
  id: 'visualTimer',
  title: 'Visual Timer',
  icon: 'visualTimer',
  size: 'md',
  singleton: false,
  description: 'A shrinking wedge — how much time is left, without reading numbers.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let durationMs = Math.max(1000, Number(saved.durationMs) || DEFAULTS.durationMs);
    let remainingMs = Math.max(0, Number(saved.remainingMs) || 0);
    let status = ['idle', 'running', 'paused', 'completed'].includes(saved.status) ? saved.status : 'idle';
    let endAt = Number(saved.endAt) || 0;
    let tickId = 0;
    let completeFired = false;

    if (status === 'running') {
      const left = endAt - Date.now();
      if (left > 0) {
        remainingMs = left;
      } else {
        remainingMs = 0;
        status = 'completed';
        completeFired = true;
      }
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const dial = document.createElementNS(svgNS, 'svg');
    dial.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    dial.setAttribute('class', 'w-vtimer__dial');
    dial.setAttribute('aria-hidden', 'true');

    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', String(SIZE / 2));
    track.setAttribute('cy', String(SIZE / 2));
    track.setAttribute('r', String(RADIUS));
    track.setAttribute('class', 'w-vtimer__track');

    const slice = document.createElementNS(svgNS, 'path');
    slice.setAttribute('class', 'w-vtimer__slice');

    const rim = document.createElementNS(svgNS, 'circle');
    rim.setAttribute('cx', String(SIZE / 2));
    rim.setAttribute('cy', String(SIZE / 2));
    rim.setAttribute('r', String(RADIUS));
    rim.setAttribute('class', 'w-vtimer__rim');

    dial.append(track, slice, rim);

    const readout = el('p', { class: 'w-vtimer__time', role: 'timer', 'aria-live': 'off' });
    const stage = el('div', { class: 'w-vtimer__stage' }, [dial, readout]);

    const startButton = el('button', { type: 'button', class: 'btn btn--sm', onClick: () => toggle() });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset', onClick: () => reset(),
    });
    const presets = el('div', { class: 'w-vtimer__presets', role: 'group', 'aria-label': 'Minutes' },
      PRESETS.map((minutes) => el('button', {
        type: 'button', class: 'chip-btn', text: `${minutes}`,
        'aria-label': `${minutes} minutes`,
        onClick: () => setDuration(minutes * MINUTE),
      })));

    const element = el('div', { class: 'w-vtimer' }, [
      stage,
      el('div', { class: 'w-vtimer__controls' }, [startButton, resetButton]),
      presets,
    ]);

    function persist() {
      ctx.data.set({ durationMs, remainingMs, status, endAt });
    }

    function stop() {
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
      tickId = setTimeout(tick, TICK_MS);
    }

    function toggle() {
      if (status === 'running') {
        remainingMs = Math.max(0, endAt - Date.now());
        status = 'paused';
        stop();
      } else {
        if (remainingMs <= 0) remainingMs = durationMs;
        endAt = Date.now() + remainingMs;
        status = 'running';
        completeFired = false;
        stop();
        tick();
      }
      persist();
      render();
    }

    function reset() {
      stop();
      remainingMs = durationMs;
      status = 'idle';
      endAt = 0;
      completeFired = false;
      persist();
      render();
    }

    function setDuration(ms) {
      durationMs = ms;
      stop();
      remainingMs = ms;
      status = 'idle';
      endAt = 0;
      completeFired = false;
      persist();
      render();
    }

    function complete() {
      stop();
      remainingMs = 0;
      status = 'completed';
      endAt = 0;
      persist();
      render();
      if (completeFired) return;
      completeFired = true;
      playFinish();
      document.dispatchEvent(new CustomEvent('timer:complete', {
        bubbles: true,
        detail: { instanceId: ctx.instanceId, durationMs, source: 'visualTimer' },
      }));
    }

    function render() {
      const fraction = durationMs > 0 ? clamp(remainingMs / durationMs, 0, 1) : 0;
      slice.setAttribute('d', wedge(fraction));

      const totalSeconds = Math.ceil(remainingMs / 1000);
      readout.textContent = status === 'completed'
        ? "TIME'S UP!"
        : `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`;
      readout.setAttribute('aria-label', `${Math.round(fraction * 100)} percent of the time left`);

      element.dataset.status = status;
      element.classList.toggle('is-low', status === 'running' && fraction <= 0.15);
      startButton.textContent = status === 'running' ? 'Pause' : (status === 'paused' ? 'Resume' : 'Start');
      presets.querySelectorAll('.chip-btn').forEach((button, index) => {
        const active = PRESETS[index] * MINUTE === durationMs;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    render();
    if (status === 'running') tick();

    return {
      element,
      destroy() { stop(); },
    };
  },
};
