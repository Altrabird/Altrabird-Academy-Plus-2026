/**
 * celebration.js — the shared celebration service.
 *
 * Listens for `timer:complete` and `randomPicker:selected`, and can be called
 * directly by the Celebration widget's button. One celebration runs at a time.
 *
 * The overlay sits above the widgets but is `pointer-events: none` apart from
 * its dismiss button, so the teacher can keep using the board while it plays.
 * It clears itself after 2-4 s, can be dismissed with a click or Escape, and
 * with Reduce Motion it becomes a still notification with no particles at all.
 */

import { el, on } from './utils.js';
import { state } from './state.js';
import { pickOne } from './random.js';
import { run2D } from './celebration2d.js';

export const EFFECTS = ['confetti', 'stars', 'fireworks'];

export const MESSAGES = [
  '🎉 WELL DONE!',
  'Great Work!',
  'Science Stars!',
  'Excellent!',
  'Keep Going!',
  'Well Done!',
  '🎉 Tahniah!',
];

const MAX_LIFETIME = 5000;   // safety net: nothing stays on screen longer than this

let active = null;           // { overlay, runner, disposers, timers }
let started = false;

function settings() {
  return state.settings.celebration;
}

function teardown() {
  if (!active) return;
  const current = active;
  active = null;

  current.timers.forEach((id) => clearTimeout(id));
  current.disposers.forEach((dispose) => {
    try { dispose(); } catch (error) { console.warn('[celebration] cleanup', error); }
  });
  current.overlay.remove();
}

/** Public: stop any celebration immediately. */
export function stopCelebration() {
  teardown();
}

/**
 * Play a celebration.
 * @param {{ effect?: string, message?: string, subtitle?: string }} [options]
 */
export async function celebrate(options = {}) {
  const config = settings();
  if (!config.enabled) return;

  teardown();

  const requested = options.effect || config.effect || 'confetti';
  const effect = requested === 'surprise' ? pickOne(EFFECTS) : (EFFECTS.includes(requested) ? requested : 'confetti');
  const message = options.message || config.message || MESSAGES[0];

  /* ---------- overlay ---------- */
  const canvas = el('canvas', { class: 'celebration__canvas', 'aria-hidden': 'true' });
  const dismiss = el('button', {
    type: 'button', class: 'celebration__dismiss', text: 'Dismiss',
    onClick: () => teardown(),
  });
  const overlay = el('div', {
    class: 'celebration', role: 'status', 'aria-live': 'polite',
    dataset: { effect, mode: state.motionReduced ? 'still' : 'animated' },
  }, [
    canvas,
    el('div', { class: 'celebration__panel' }, [
      el('p', { class: 'celebration__message', text: message }),
      options.subtitle ? el('p', { class: 'celebration__subtitle', text: options.subtitle }) : null,
      dismiss,
    ]),
  ]);

  const disposers = [];
  const timers = [];
  active = { overlay, disposers, timers };
  document.body.append(overlay);

  disposers.push(on(document, 'keydown', (event) => {
    if (event.key === 'Escape') teardown();
  }, true));

  /* ---------- Reduce Motion: a still notice, no particles ---------- */
  if (state.motionReduced) {
    canvas.remove();
    timers.push(setTimeout(teardown, 2600));
    return;
  }

  /* ---------- particles ---------- */
  const lowPerformance = state.settings.performance.lowPerformance;
  let runner = null;

  if (state.use3D) {
    try {
      const { runCelebration } = await import('./three/celebrationEffect.js');
      if (!active || active.overlay !== overlay) return;      // dismissed while loading
      runner = await runCelebration({ canvas, effect, lowPerformance });
      disposers.push(() => runner.dispose());
    } catch (error) {
      console.warn('[celebration] 3D unavailable, using canvas', error);
      runner = null;
    }
  }

  if (!runner) {
    if (!active || active.overlay !== overlay) return;
    runner = run2D(canvas, effect, { lowPerformance });
    disposers.push(() => runner.cancel());
  }

  active.runner = runner;
  timers.push(setTimeout(teardown, MAX_LIFETIME));
  runner.done.then(() => {
    if (active && active.overlay === overlay) teardown();
  });
}

/** Attach the automatic triggers. Safe to call once, from main.js. */
export function initCelebration() {
  if (started) return;
  started = true;

  on(document, 'timer:complete', () => {
    if (settings().onTimer) celebrate({ message: settings().message });
  });

  on(document, 'randomPicker:selected', (event) => {
    if (!settings().onPick) return;
    const name = event.detail && event.detail.studentName;
    celebrate({ subtitle: name });
  });
}
