/**
 * webcam.js — a live camera view, for showing an object or a page to the class.
 *
 * PRIVACY: the picture is only ever displayed. Nothing is recorded, saved,
 * uploaded or transmitted — there is no MediaRecorder and no network call. The
 * camera is opened only when the teacher presses the button, and is released
 * when the card is stopped, minimized, hidden, removed, or the tab goes to the
 * background. It is never on after a reload.
 *
 * States: off · requesting · active · denied · unavailable
 */

import { el, on } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { switchRow, section } from '../ui/forms.js';

const UNAVAILABLE_TEXT = 'Camera access is unavailable. You can still use the other classroom tools.';
const INSECURE_TEXT = 'Browsers only allow the camera on https:// or localhost. Open this page over https to use the camera — you can still use the other classroom tools.';

const DEFAULTS = { mirror: true };

export default {
  id: 'webcam',
  title: 'Camera',
  icon: 'webcam',
  size: 'lg',
  singleton: false,
  description: 'Show what the camera sees — a document camera for the class.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let status = 'off';
    let stream = null;
    let resumeOnReturn = false;
    let unavailableText = UNAVAILABLE_TEXT;

    const video = el('video', {
      class: 'w-cam__video', autoplay: true, playsinline: true, muted: true,
      'aria-label': 'Live camera picture',
    });
    const message = el('p', { class: 'w-cam__message' });
    const stage = el('div', { class: 'w-cam__stage' }, [video, message]);

    const startButton = el('button', {
      type: 'button', class: 'btn', text: 'Turn on camera', onClick: () => start(),
    });
    const stopButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Stop', hidden: true,
      onClick: () => { resumeOnReturn = false; stop(); },
    });

    const privacy = el('p', {
      class: 'w-cam__privacy',
      text: 'The picture is shown on this computer only. Nothing is recorded, saved or sent anywhere.',
    });

    const element = el('div', { class: 'w-cam' }, [
      stage,
      el('div', { class: 'w-cam__controls' }, [startButton, stopButton]),
      privacy,
    ]);

    function persist() { ctx.data.set(options); }

    function render() {
      element.dataset.status = status;
      video.hidden = status !== 'active';
      video.style.transform = options.mirror ? 'scaleX(-1)' : 'none';
      startButton.hidden = status === 'active' || status === 'requesting';
      stopButton.hidden = status !== 'active';

      if (status === 'off') {
        message.textContent = 'Press Turn on camera to show what it sees.';
      } else if (status === 'requesting') {
        message.textContent = 'Allow camera access in your browser to continue.';
      } else if (status === 'denied') {
        message.textContent = 'Camera permission was refused. Allow it in your browser, then press Try again. You can still use the other classroom tools.';
        startButton.textContent = 'Try again';
      } else if (status === 'unavailable') {
        message.textContent = unavailableText;
        startButton.hidden = true;
      } else {
        message.textContent = '';
      }
      message.hidden = status === 'active';
    }

    async function start() {
      if (status === 'active' || status === 'requesting') return;

      if (window.isSecureContext === false) {
        unavailableText = INSECURE_TEXT;
        status = 'unavailable';
        render();
        return;
      }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        unavailableText = UNAVAILABLE_TEXT;
        status = 'unavailable';
        render();
        return;
      }

      status = 'requesting';
      render();

      try {
        // Video only: the camera microphone is never opened here.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (error) {
        status = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
          ? 'denied' : 'unavailable';
        console.warn('[webcam] camera not available', error);
        render();
        return;
      }

      video.srcObject = stream;
      status = 'active';
      render();
    }

    /** Release the camera: stop every track and drop the stream. */
    function stop() {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      video.srcObject = null;
      if (status === 'active' || status === 'requesting') status = 'off';
      render();
    }

    // A backgrounded tab has no business holding the camera open.
    const offVisibility = on(document, 'visibilitychange', () => {
      if (document.hidden && status === 'active') {
        resumeOnReturn = true;
        stop();
      } else if (!document.hidden && resumeOnReturn) {
        resumeOnReturn = false;
        start();
      }
    });

    render();

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

      openSettings() {
        openModal({
          title: 'Camera',
          body: section('Camera', [
            switchRow({
              label: 'Mirror the picture',
              hint: 'On for showing yourself, off for showing a page or an object.',
              checked: options.mirror,
              onChange: (mirror) => { options = { ...options, mirror }; persist(); render(); },
            }),
            el('p', {
              class: 'callout',
              text: 'Nothing is recorded or sent. The camera turns itself off when this card is stopped, hidden or removed, and after a reload.',
            }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },

      destroy() {
        resumeOnReturn = false;
        offVisibility();
        stop();
      },
    };
  },
};
