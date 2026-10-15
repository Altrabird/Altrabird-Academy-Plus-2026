/**
 * image.js — a picture on the board.
 *
 * The file never leaves the computer: it is read locally, drawn to a canvas at
 * a sensible size and kept in this browser's storage as a data URL. Because
 * everything shares one localStorage document, a full-size photo would blow the
 * quota and stop *everything* saving — so every image is downscaled and
 * re-encoded until it fits the budget, and anything that still cannot fit is
 * refused with a clear message rather than silently breaking saving.
 *
 * Choose a file, paste from the clipboard, or drop one onto the card.
 */

import { el, on, toast } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { segmented, textField, section } from '../ui/forms.js';

const MAX_EDGE = 1280;          // plenty for a projector
const MAX_CHARS = 700000;       // ~510 KB once base64 is decoded
const DEFAULTS = { src: '', alt: '', fit: 'contain', name: '' };

/** Read a file, shrink it, and encode it small enough to store. */
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === 'function') bitmap.close();

  // WebP keeps transparency and is the smallest; JPEG is the fallback.
  let url = canvas.toDataURL('image/webp', 0.85);
  const webpWorked = url.startsWith('data:image/webp');
  let quality = 0.85;

  while (url.length > MAX_CHARS && quality > 0.4) {
    quality -= 0.12;
    url = canvas.toDataURL(webpWorked ? 'image/webp' : 'image/jpeg', quality);
  }
  if (url.length > MAX_CHARS) {
    // Last resort: halve the pixels once more.
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(width / 2));
    small.height = Math.max(1, Math.round(height / 2));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    url = small.toDataURL(webpWorked ? 'image/webp' : 'image/jpeg', 0.7);
  }
  return { url, width, height, tooBig: url.length > MAX_CHARS };
}

export default {
  id: 'image',
  title: 'Image',
  icon: 'image',
  size: 'lg',
  singleton: false,
  description: 'Show a picture from this computer.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };

    const picture = el('img', { class: 'w-image__picture', alt: '' });
    const fileInput = el('input', {
      type: 'file', accept: 'image/*', class: 'w-image__file',
      'aria-label': 'Choose an image file',
    });

    const chooseButton = el('button', {
      type: 'button', class: 'btn btn--sm', text: 'Choose image',
      onClick: () => fileInput.click(),
    });
    const empty = el('div', { class: 'w-image__empty' }, [
      el('p', { class: 'w-image__hint', text: 'Choose a picture, paste one, or drop a file here.' }),
      chooseButton,
      el('p', {
        class: 'w-image__note',
        text: 'The file stays on this computer — nothing is uploaded.',
      }),
    ]);

    const stage = el('div', { class: 'w-image__stage', tabindex: '0' }, [picture, empty, fileInput]);

    const replaceButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Replace',
      onClick: () => fileInput.click(),
    });
    const removeButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove',
      onClick: () => {
        options = { ...options, src: '', alt: '', name: '' };
        ctx.data.set(options);
        render();
      },
    });
    const toolbar = el('div', { class: 'w-image__toolbar' }, [replaceButton, removeButton]);

    const element = el('div', { class: 'w-image' }, [stage, toolbar]);

    /* ---------- loading ---------- */
    async function load(file) {
      if (!file || !file.type.startsWith('image/')) {
        toast('That file is not an image');
        return;
      }
      try {
        const result = await prepare(file);
        if (result.tooBig) {
          toast('That picture is too large to store, even shrunk — try a smaller one', 6000);
          return;
        }
        options = {
          ...options,
          src: result.url,
          name: file.name || '',
          alt: options.alt || (file.name || '').replace(/\.[a-z0-9]+$/i, ''),
        };
        ctx.data.set(options);
        render();
        toast('Picture added');
      } catch (error) {
        console.warn('[image] could not read that file', error);
        toast('That picture could not be read');
      }
    }

    on(fileInput, 'change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) load(file);
    });

    // paste, when the card has focus
    on(stage, 'paste', (event) => {
      const item = Array.from(event.clipboardData ? event.clipboardData.files : []).find((f) => f.type.startsWith('image/'));
      if (!item) return;
      event.preventDefault();
      load(item);
    });

    // drag and drop
    on(stage, 'dragover', (event) => {
      event.preventDefault();
      stage.classList.add('is-dropping');
    });
    on(stage, 'dragleave', () => stage.classList.remove('is-dropping'));
    on(stage, 'drop', (event) => {
      event.preventDefault();
      stage.classList.remove('is-dropping');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) load(file);
    });

    function render() {
      const has = Boolean(options.src);
      picture.hidden = !has;
      empty.hidden = has;
      toolbar.hidden = !has;
      if (has) {
        picture.src = options.src;
        picture.alt = options.alt || 'Picture on the classroom board';
        picture.style.objectFit = options.fit === 'cover' ? 'cover' : 'contain';
      } else {
        picture.removeAttribute('src');
      }
      element.classList.toggle('has-image', has);
    }

    render();

    return {
      element,

      openSettings() {
        const apply = (patch) => {
          options = { ...options, ...patch };
          ctx.data.set(options);
          render();
        };

        openModal({
          title: 'Image',
          body: section('Picture', [
            segmented({
              label: 'How it fills the card',
              value: options.fit,
              options: [
                { value: 'contain', label: 'Fit whole picture' },
                { value: 'cover', label: 'Fill the card' },
              ],
              onChange: (fit) => apply({ fit }),
            }),
            textField({
              label: 'Description',
              hint: 'Read out by screen readers. Describe what the picture shows.',
              value: options.alt,
              onInput: (alt) => apply({ alt }),
            }),
            el('p', {
              class: 'callout',
              text: options.src
                ? `Stored on this computer only${options.name ? ` (from ${options.name})` : ''}. Pictures are shrunk to fit the browser's storage.`
                : 'No picture chosen yet.',
            }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },
    };
  },
};
