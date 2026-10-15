/**
 * hyperlink.js — a big button that opens a page.
 *
 * Useful for the site a lesson is heading to. The link opens in a new tab so
 * the board is never navigated away from mid-lesson, and the address is shown
 * in full so a class (and the teacher) can see where it goes before clicking.
 */

import { el, toast, copyText } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { textField, section } from '../ui/forms.js';
import { icon } from '../ui/icons.js';

const DEFAULTS = { url: '', label: '', note: '' };

/** Accept what a teacher would type; refuse anything that is not a web link. */
function normalise(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

export default {
  id: 'hyperlink',
  title: 'Link',
  icon: 'hyperlink',
  size: 'md',
  singleton: false,
  description: 'A big button that opens a web page in a new tab.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };

    const label = el('span', { class: 'w-link__label' });
    const host = el('span', { class: 'w-link__host' });
    const open = el('a', {
      class: 'w-link__button', target: '_blank', rel: 'noopener noreferrer',
    }, [el('span', { class: 'w-link__icon', 'aria-hidden': 'true', html: icon('hyperlink', 22) }), label, host]);

    const note = el('p', { class: 'w-link__note' });
    const empty = el('div', { class: 'w-link__empty' }, [
      el('p', { class: 'w-link__hint', text: 'No link yet.' }),
      el('button', { type: 'button', class: 'btn btn--sm', text: 'Add a link', onClick: () => editor() }),
    ]);

    const copyBtn = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy address',
      onClick: async () => {
        const ok = await copyText(options.url);
        toast(ok ? 'Address copied' : 'Copying was blocked by the browser');
      },
    });
    const editBtn = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Edit', onClick: () => editor(),
    });
    const toolbar = el('div', { class: 'w-link__toolbar' }, [editBtn, copyBtn]);

    const element = el('div', { class: 'w-link' }, [
      el('div', { class: 'w-link__stage' }, [open, note, empty]),
      toolbar,
    ]);

    function persist() { ctx.data.set(options); }

    function render() {
      const url = normalise(options.url);
      const has = Boolean(url);

      open.hidden = !has;
      note.hidden = !has || !options.note;
      empty.hidden = has;
      toolbar.hidden = !has;

      if (has) {
        open.href = url.href;
        label.textContent = options.label || url.hostname.replace(/^www\./, '');
        host.textContent = url.href.replace(/^https?:\/\//, '');
        open.setAttribute('aria-label', `${options.label || url.hostname}: opens ${url.href} in a new tab`);
        note.textContent = options.note;
      }
    }

    function editor() {
      const draft = { ...options };
      const error = el('p', { class: 'callout callout--warn', hidden: true });

      openModal({
        title: 'Link',
        body: section('Link', [
          textField({
            label: 'Address', value: draft.url, placeholder: 'example.com/page',
            onInput: (value) => { draft.url = value; },
          }),
          textField({
            label: 'Button text', hint: 'Optional — the site name is used otherwise.',
            value: draft.label, onInput: (value) => { draft.label = value; },
          }),
          textField({
            label: 'Note for the class', hint: 'Optional — shown under the button.',
            value: draft.note, onInput: (value) => { draft.note = value; },
          }),
          el('p', { class: 'field__hint', text: 'Links open in a new tab, so the board stays put.' }),
          error,
        ]),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Save link',
            onClick: () => {
              const url = normalise(draft.url);
              if (draft.url && !url) {
                error.textContent = 'That does not look like a web address. Try something like example.com/page.';
                error.hidden = false;
                return false;
              }
              options = { ...draft, url: url ? url.href : '' };
              persist();
              render();
              return true;
            },
          },
        ],
      });
    }

    render();

    return {
      element,
      openSettings() { editor(); },
    };
  },
};
