/**
 * embed.js — put a web page on the board.
 *
 * This is the one tool that reaches the internet, so it is explicit about it:
 * only https addresses are accepted, the frame is sandboxed (no access to this
 * page, no downloads, no top-level navigation), and the card explains when a
 * site refuses to be embedded — which many do, and which the browser will not
 * tell us directly.
 */

import { el, toast } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { textField, section } from '../ui/forms.js';

const DEFAULTS = { url: '' };
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms';

function normalise(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    // http:// pages are blocked inside an https board anyway, and are not safe
    // to put in front of a class, so only https is accepted.
    if (url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

export default {
  id: 'embed',
  title: 'Web page',
  shortTitle: 'Embed',
  icon: 'embed',
  size: 'xl',
  singleton: false,
  description: 'Show a web page on the board (needs internet).',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    // Saved data can come from an imported file, so it is checked again here.
    const saved = normalise(options.url);
    options.url = saved ? saved.href : '';

    const frame = el('iframe', {
      class: 'w-embed__frame', title: 'Embedded web page',
      sandbox: SANDBOX, referrerpolicy: 'no-referrer', loading: 'lazy',
      allow: 'fullscreen',
    });
    const notice = el('p', { class: 'w-embed__notice' });
    const empty = el('div', { class: 'w-embed__empty' }, [
      el('p', { class: 'w-embed__hint', text: 'No page yet.' }),
      el('button', { type: 'button', class: 'btn btn--sm', text: 'Add a page', onClick: () => editor() }),
      el('p', {
        class: 'w-embed__note',
        text: 'This is the only tool that needs the internet. Many sites refuse to be embedded — the Link tool opens those in a new tab instead.',
      }),
    ]);
    const stage = el('div', { class: 'w-embed__stage' }, [frame, empty, notice]);

    const editButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Change', onClick: () => editor(),
    });
    const openButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Open in a tab',
      onClick: () => { if (options.url) window.open(options.url, '_blank', 'noopener'); },
    });
    const reloadButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reload',
      onClick: () => { if (options.url) frame.src = options.url; },
    });
    const toolbar = el('div', { class: 'w-embed__toolbar' }, [editButton, reloadButton, openButton]);

    const element = el('div', { class: 'w-embed' }, [stage, toolbar]);

    function persist() { ctx.data.set(options); }

    function render() {
      const has = Boolean(options.url);
      frame.hidden = !has;
      empty.hidden = has;
      toolbar.hidden = !has;
      notice.hidden = !has;
      notice.textContent = has
        ? `${options.url.replace(/^https:\/\//, '')} — if it stays blank, the site does not allow embedding.`
        : '';
      if (has && frame.src !== options.url) frame.src = options.url;
    }

    function editor() {
      let draft = options.url;
      const error = el('p', { class: 'callout callout--warn', hidden: true });

      openModal({
        title: 'Web page',
        body: section('Page', [
          textField({
            label: 'Address (https only)', value: draft, placeholder: 'example.com/page',
            onInput: (value) => { draft = value; },
          }),
          el('p', {
            class: 'callout',
            text: 'The page runs in a sandbox: it cannot reach this board, start downloads or navigate away. It still needs an internet connection, and sites that block embedding will show as blank.',
          }),
          error,
        ]),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Show page',
            onClick: () => {
              const url = normalise(draft);
              if (draft && !url) {
                error.textContent = 'That needs to be an https address, like example.com/page.';
                error.hidden = false;
                return false;
              }
              options = { url: url ? url.href : '' };
              persist();
              render();
              if (url) toast('Page added — it may take a moment to load');
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
      destroy() { frame.removeAttribute('src'); },
    };
  },
};
