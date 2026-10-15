/**
 * qrCode.js — turns a link into a QR code the class can scan.
 *
 * The encoder is vendored (qrcode-generator, MIT) and loaded from /vendor on
 * first use, so this works with no internet: the code is drawn locally onto a
 * canvas and nothing about the link is sent anywhere. The canvas also gives us
 * a PNG download without any extra library.
 */

import { el, toast, copyText } from '../utils.js';

const DEFAULTS = { text: '', label: '' };
const QUIET = 4;                 // modules of quiet zone, per the QR spec
const VENDOR = new URL('../../vendor/qrcode-generator.js', import.meta.url).href;

let loading = null;

/** Load the vendored encoder once. It is a classic script, not a module. */
function loadEncoder() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VENDOR;
    script.async = true;
    script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('encoder missing')));
    script.onerror = () => reject(new Error('encoder failed to load'));
    document.head.append(script);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

export default {
  id: 'qrCode',
  title: 'QR Code',
  icon: 'qrCode',
  size: 'md',
  singleton: false,
  description: 'Turn a link into a QR code for pupils to scan.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let failed = false;

    const canvas = el('canvas', { class: 'w-qr__canvas', role: 'img' });
    const caption = el('p', { class: 'w-qr__caption' });
    const message = el('p', { class: 'w-qr__message' });
    const stage = el('div', { class: 'w-qr__stage' }, [canvas, caption, message]);

    const input = el('input', {
      class: 'input w-qr__input', type: 'text', value: options.text,
      placeholder: 'Paste a link or type some text',
      'aria-label': 'Link or text for the QR code',
    });
    const makeButton = el('button', {
      type: 'button', class: 'btn btn--sm', text: 'Make code',
      onClick: () => apply(input.value),
    });
    const copyButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy link',
      onClick: async () => {
        if (!options.text) return;
        const ok = await copyText(options.text);
        toast(ok ? 'Link copied' : 'Copying was blocked by the browser');
      },
    });
    const saveButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Save PNG',
      onClick: () => download(),
    });
    const clearButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear',
      onClick: () => { options = { ...options, text: '' }; input.value = ''; persist(); render(); },
    });

    const element = el('div', { class: 'w-qr' }, [
      stage,
      el('div', { class: 'w-qr__form' }, [input, makeButton]),
      el('div', { class: 'w-qr__toolbar' }, [copyButton, saveButton, clearButton]),
    ]);

    function persist() { ctx.data.set(options); }

    function apply(value) {
      const text = String(value || '').trim();
      options = { ...options, text };
      persist();
      render();
      if (text) toast('QR code ready');
    }

    /** Draw the code at whatever size the card currently allows. */
    async function draw() {
      if (!options.text) return;
      let encoder;
      try {
        encoder = await loadEncoder();
      } catch (error) {
        failed = true;
        console.warn('[qrCode] encoder unavailable', error);
        render();
        return;
      }

      try {
        const qr = encoder(0, 'M');            // 0 = pick the smallest version that fits
        qr.addData(options.text);
        qr.make();

        const count = qr.getModuleCount();
        const box = stage.getBoundingClientRect();
        const available = Math.max(120, Math.min(box.width || 240, (box.height || 240) - 46));
        const scale = Math.max(2, Math.floor(available / (count + (QUIET * 2))));
        const size = (count + (QUIET * 2)) * scale;

        canvas.width = size;
        canvas.height = size;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';         // scanners want a light quiet zone
        context.fillRect(0, 0, size, size);
        context.fillStyle = '#000000';
        for (let row = 0; row < count; row += 1) {
          for (let col = 0; col < count; col += 1) {
            if (!qr.isDark(row, col)) continue;
            context.fillRect((col + QUIET) * scale, (row + QUIET) * scale, scale, scale);
          }
        }
        canvas.setAttribute('aria-label', `QR code for ${options.text}`);
      } catch (error) {
        // Usually "too much data" — say so rather than showing a blank square.
        failed = true;
        console.warn('[qrCode] could not encode that text', error);
        render();
      }
    }

    function download() {
      if (!options.text) return;
      try {
        const link = el('a', { href: canvas.toDataURL('image/png'), download: 'qr-code.png' });
        document.body.append(link);
        link.click();
        link.remove();
        toast('QR code saved as a PNG');
      } catch (error) {
        console.warn('[qrCode] could not save', error);
        toast('That could not be saved');
      }
    }

    function render() {
      const has = Boolean(options.text);
      canvas.hidden = !has || failed;
      caption.hidden = !has || failed;
      copyButton.disabled = !has;
      saveButton.disabled = !has || failed;
      clearButton.disabled = !has;

      caption.textContent = options.text;
      message.hidden = has && !failed;
      message.textContent = failed
        ? 'That could not be turned into a QR code. Try a shorter link.'
        : 'Type a link below and press Make code.';

      if (has && !failed) draw();
    }

    render();

    return {
      element,
      onResize() { if (options.text && !failed) draw(); },
    };
  },
};
