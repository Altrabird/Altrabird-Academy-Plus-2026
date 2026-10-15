/**
 * noiseMeter.js — a classroom loudness meter.
 *
 * PRIVACY: the microphone is only ever measured. Audio is never recorded,
 * stored, uploaded or transmitted; no MediaRecorder is created and no sample
 * ever leaves this function. The stream is opened only when the teacher presses
 * the button, and is closed again whenever the widget stops, is minimized,
 * hidden, removed, or the tab goes to the background.
 *
 * States: off · requesting · active · denied · unavailable
 */

import { el, clamp, on } from '../utils.js';
import { state } from '../state.js';
import { playCue } from '../audio.js';

const SAMPLE_MS = 100;          // sample + repaint 10x a second, not every audio frame
const SMOOTHING = 0.35;         // extra smoothing on top of the AnalyserNode
const ALERT_HOLD_MS = 1500;     // how long it must stay over the line before alerting
const ALERT_COOLDOWN_MS = 8000;

const DEFAULTS = { threshold: 55, autoAlert: false };

const BANDS = [
  { max: 0.4, key: 'quiet', label: 'QUIET' },
  { max: 0.75, key: 'ok', label: 'OK' },
  { max: 1, key: 'loud', label: 'LOUD' },
  { max: Infinity, key: 'over', label: 'TOO LOUD' },
];

const UNAVAILABLE_TEXT = 'Microphone access is unavailable. You can still use the other classroom tools.';
const INSECURE_TEXT = 'Browsers only allow the microphone on https:// or localhost. Open this page over https to use the noise meter — you can still use the other classroom tools.';

export default {
  id: 'noiseMeter',
  title: 'Noise Meter',
  icon: 'noiseMeter',
  size: 'md',
  singleton: false,
  description: 'Microphone loudness, measured on this computer only.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let status = 'off';         // off | requesting | active | denied | unavailable
    let stream = null;
    let audioContext = null;
    let analyser = null;
    let source = null;
    let sampler = 0;
    let buffer = null;
    let smoothed = 0;
    let shownLevel = -1;
    let overSince = 0;
    let lastAlert = 0;
    let resumeOnReturn = false;
    let unavailableText = UNAVAILABLE_TEXT;

    /* ---------- DOM ---------- */
    const levelWord = el('p', { class: 'w-noise__word' });
    const barFill = el('div', { class: 'w-noise__fill' });
    const marker = el('div', { class: 'w-noise__marker', 'aria-hidden': 'true' });
    const bar = el('div', {
      class: 'w-noise__bar', role: 'meter',
      'aria-label': 'Classroom noise level', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
    }, [barFill, marker]);

    const message = el('p', { class: 'w-noise__message' });

    const enableButton = el('button', {
      type: 'button', class: 'btn', text: 'Enable Microphone',
      onClick: () => start(),
    });
    const stopButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Stop', hidden: true,
      onClick: () => { resumeOnReturn = false; stop(); },
    });

    const thresholdInput = el('input', {
      type: 'range', class: 'input w-noise__threshold', min: '10', max: '95', step: '5',
      value: String(options.threshold), 'aria-label': 'Noise threshold',
      onInput: (event) => {
        options = { ...options, threshold: clamp(Number(event.target.value) || 55, 10, 95) };
        ctx.data.set(options);
        renderThreshold();
        paint(smoothed, true);
      },
    });
    const thresholdValue = el('span', { class: 'w-noise__threshold-value' });

    const alertInput = el('input', {
      type: 'checkbox', checked: options.autoAlert,
      onChange: (event) => {
        options = { ...options, autoAlert: event.target.checked };
        ctx.data.set(options);
      },
    });

    const privacy = el('p', {
      class: 'w-noise__privacy',
      text: 'Sound is measured on this computer only. Nothing is recorded, saved or sent anywhere.',
    });

    const element = el('div', { class: 'w-noise' }, [
      el('div', { class: 'w-noise__display' }, [levelWord, bar, message]),
      el('div', { class: 'w-noise__controls' }, [enableButton, stopButton]),
      el('div', { class: 'w-noise__settings' }, [
        el('label', { class: 'w-noise__row' }, [
          el('span', { text: 'Threshold' }), thresholdInput, thresholdValue,
        ]),
        el('label', { class: 'w-pick__option' }, [alertInput, el('span', { text: 'Alert when it goes over' })]),
      ]),
      privacy,
    ]);

    /* ---------- rendering ---------- */
    function renderThreshold() {
      thresholdValue.textContent = `${options.threshold}%`;
      marker.style.insetInlineStart = `${options.threshold}%`;
      thresholdInput.value = String(options.threshold);
    }

    function bandFor(level) {
      const ratio = options.threshold > 0 ? level / options.threshold : 0;
      return BANDS.find((band) => ratio <= band.max) || BANDS[BANDS.length - 1];
    }

    /** Repaint only when the value actually moved — not on every sample. */
    function paint(level, force = false) {
      const rounded = Math.round(level);
      if (!force && rounded === shownLevel) return;
      shownLevel = rounded;

      const band = bandFor(rounded);
      barFill.style.width = `${clamp(rounded, 0, 100)}%`;
      bar.setAttribute('aria-valuenow', String(clamp(rounded, 0, 100)));
      bar.setAttribute('aria-valuetext', `${rounded}% — ${band.label}`);
      element.dataset.band = band.key;

      // Only a running meter owns the big word; off/denied/unavailable states
      // keep the status text that renderStatus() put there.
      if (status === 'active') levelWord.textContent = band.label;
    }

    function renderStatus() {
      element.dataset.status = status;
      enableButton.hidden = status === 'active' || status === 'requesting';
      stopButton.hidden = status !== 'active';
      thresholdInput.disabled = status === 'unavailable';

      if (status === 'off') {
        levelWord.textContent = 'MICROPHONE OFF';
        message.textContent = 'Press Enable Microphone to measure how loud the room is.';
        paint(0, true);
      } else if (status === 'requesting') {
        levelWord.textContent = 'REQUESTING…';
        message.textContent = 'Allow microphone access in your browser to continue.';
      } else if (status === 'denied') {
        levelWord.textContent = 'PERMISSION DENIED';
        message.textContent = 'Microphone permission was refused. Allow it in your browser, then press Enable Microphone again. You can still use the other classroom tools.';
        enableButton.textContent = 'Try again';
        paint(0, true);
      } else if (status === 'unavailable') {
        levelWord.textContent = 'UNAVAILABLE';
        message.textContent = unavailableText;
        enableButton.hidden = true;
        paint(0, true);
      } else {
        message.textContent = '';
      }
    }

    /* ---------- audio ---------- */
    function computeLevel() {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const deviation = (buffer[i] - 128) / 128;   // -1 .. 1
        sum += deviation * deviation;
      }
      const rms = Math.sqrt(sum / buffer.length);
      // Map RMS onto a friendly 0-100 scale (classroom speech sits mid-range).
      return clamp(rms * 240, 0, 100);
    }

    function sample() {
      if (status !== 'active' || !analyser) return;
      const level = computeLevel();
      smoothed = (smoothed * (1 - SMOOTHING)) + (level * SMOOTHING);
      paint(smoothed);

      if (options.autoAlert) {
        const now = Date.now();
        if (smoothed >= options.threshold) {
          if (!overSince) overSince = now;
          if (now - overSince >= ALERT_HOLD_MS && now - lastAlert >= ALERT_COOLDOWN_MS) {
            lastAlert = now;
            element.classList.add('is-alerting');
            setTimeout(() => element.classList.remove('is-alerting'), 1800);
            playCue([440, 392], { gap: 0.16, length: 0.3 });
          }
        } else {
          overSince = 0;
        }
      }
    }

    async function start() {
      if (status === 'active' || status === 'requesting') return;

      // Browsers expose getUserMedia only in a secure context; say so plainly
      // rather than looking broken on an http:// LAN address.
      if (window.isSecureContext === false) {
        unavailableText = INSECURE_TEXT;
        status = 'unavailable';
        renderStatus();
        return;
      }

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function'
        || !(window.AudioContext || window.webkitAudioContext)) {
        unavailableText = UNAVAILABLE_TEXT;
        status = 'unavailable';
        renderStatus();
        return;
      }

      status = 'requesting';
      renderStatus();

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
      } catch (error) {
        status = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
          ? 'denied' : 'unavailable';
        console.warn('[noiseMeter] microphone not available', error);
        renderStatus();
        return;
      }

      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        audioContext = new Ctor();
        if (audioContext.state === 'suspended') await audioContext.resume();

        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        buffer = new Uint8Array(analyser.fftSize);
        source.connect(analyser);          // analyser only — never to the speakers, never recorded

        status = 'active';
        smoothed = 0;
        overSince = 0;
        renderStatus();
        paint(0, true);

        clearInterval(sampler);
        sampler = setInterval(sample, SAMPLE_MS);
      } catch (error) {
        console.warn('[noiseMeter] could not start audio analysis', error);
        status = 'unavailable';
        stop();
        renderStatus();
      }
    }

    /** Release everything: tracks, nodes and the AudioContext. */
    function stop() {
      clearInterval(sampler);
      sampler = 0;

      if (source) {
        try { source.disconnect(); } catch { /* already gone */ }
        source = null;
      }
      analyser = null;
      buffer = null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (audioContext) {
        const closing = audioContext;
        audioContext = null;
        if (typeof closing.close === 'function' && closing.state !== 'closed') {
          closing.close().catch(() => {});
        }
      }

      if (status === 'active' || status === 'requesting') status = 'off';
      smoothed = 0;
      renderStatus();
    }

    // A tab in the background has no business holding the microphone open.
    const offVisibility = on(document, 'visibilitychange', () => {
      if (document.hidden && status === 'active') {
        resumeOnReturn = true;
        stop();
      } else if (!document.hidden && resumeOnReturn) {
        resumeOnReturn = false;
        start();
      }
    });

    renderThreshold();
    renderStatus();

    return {
      element,

      onActive(isActive) {
        if (!isActive && status === 'active') {
          resumeOnReturn = true;
          stop();
        } else if (isActive && resumeOnReturn) {
          resumeOnReturn = false;
          start();
        }
      },

      destroy() {
        resumeOnReturn = false;
        offVisibility();
        stop();
      },
    };
  },
};
