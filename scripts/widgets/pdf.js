/**
 * pdf.js — show a PDF from this computer.
 *
 * The browser's own PDF viewer does the work: the file is opened as a local
 * object URL, never uploaded and never copied into storage. Like the video
 * card, that makes the choice last for the session — the card says so instead
 * of pretending it will still be there tomorrow.
 */

import { el, on, toast } from '../utils.js';

const DEFAULTS = { name: '' };

export default {
  id: 'pdf',
  title: 'PDF',
  icon: 'pdf',
  size: 'xl',
  singleton: false,
  description: 'Show a PDF from this computer.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let objectUrl = '';

    const frame = el('iframe', {
      class: 'w-pdf__frame', title: 'PDF document', referrerpolicy: 'no-referrer',
    });
    const fileInput = el('input', {
      type: 'file', accept: 'application/pdf,.pdf', class: 'w-pdf__file',
      'aria-label': 'Choose a PDF file',
    });

    const chooseButton = el('button', {
      type: 'button', class: 'btn btn--sm', text: 'Choose PDF', onClick: () => fileInput.click(),
    });
    const hint = el('p', { class: 'w-pdf__hint' });
    const empty = el('div', { class: 'w-pdf__empty' }, [
      hint,
      chooseButton,
      el('p', {
        class: 'w-pdf__note',
        text: 'Opened with your browser’s own viewer. Nothing is uploaded, and the file is not saved into the board.',
      }),
    ]);

    const stage = el('div', { class: 'w-pdf__stage' }, [frame, empty, fileInput]);

    const replaceButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Change', onClick: () => fileInput.click(),
    });
    const openButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Open in a tab',
      onClick: () => { if (objectUrl) window.open(objectUrl, '_blank', 'noopener'); },
    });
    const removeButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove', onClick: () => clear(),
    });
    const toolbar = el('div', { class: 'w-pdf__toolbar' }, [replaceButton, openButton, removeButton]);

    const element = el('div', { class: 'w-pdf' }, [stage, toolbar]);

    function persist() { ctx.data.set(options); }

    function release() {
      frame.removeAttribute('src');
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
    }

    function clear() {
      release();
      options = { name: '' };
      persist();
      render();
    }

    function load(file) {
      const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
      if (!isPdf) {
        toast('That file is not a PDF');
        return;
      }
      release();
      objectUrl = URL.createObjectURL(file);
      frame.src = `${objectUrl}#view=FitH`;
      options = { name: file.name || '' };
      persist();
      render();
    }

    on(fileInput, 'change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) load(file);
    });

    on(stage, 'dragover', (event) => { event.preventDefault(); stage.classList.add('is-dropping'); });
    on(stage, 'dragleave', () => stage.classList.remove('is-dropping'));
    on(stage, 'drop', (event) => {
      event.preventDefault();
      stage.classList.remove('is-dropping');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) load(file);
    });

    function render() {
      const open = Boolean(objectUrl);
      frame.hidden = !open;
      empty.hidden = open;
      toolbar.hidden = !open;
      hint.textContent = options.name
        ? `“${options.name}” — choose the file again to show it.`
        : 'Choose a PDF, or drop one here.';
      element.classList.toggle('has-pdf', open);
    }

    render();

    return {
      element,
      destroy() { release(); },
    };
  },
};
