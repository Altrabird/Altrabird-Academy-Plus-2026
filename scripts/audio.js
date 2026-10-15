/**
 * audio.js — short synthesised cues, so the app ships with no sound files.
 *
 * The AudioContext is created lazily on the first cue (which always follows a
 * teacher's click, satisfying browser autoplay rules) and every call respects
 * the Audio settings in Settings → Timer.
 */

import { state } from './state.js';
import { clamp } from './utils.js';

let audioContext = null;

function getContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

/**
 * Play a short sequence of tones.
 * @param {number[]} notes frequencies in Hz
 * @param {{ gap?: number, length?: number }} [options]
 */
export function playCue(notes = [880], { gap = 0.18, length = 0.34 } = {}) {
  const settings = state.settings.audio;
  if (!settings.enabled) return;

  try {
    const ctx = getContext();
    if (!ctx) return;
    const volume = clamp(Number(settings.volume) || 0, 0, 1) * 0.25;
    if (volume <= 0) return;

    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = ctx.currentTime + index * gap;

      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + length + 0.05);
    });
  } catch (error) {
    // Audio is a nicety: never let it break a lesson.
    console.warn('[audio] cue skipped', error);
  }
}

/** Two rising notes — the timer has finished. */
export const playFinish = () => playCue([784, 1046.5, 1318.5], { gap: 0.16, length: 0.4 });

/** One soft note — ten seconds left. */
export const playWarning = () => playCue([660], { length: 0.22 });
