/**
 * modal.js — one accessible dialog implementation for the whole app.
 * Focus is trapped while open and returned to the trigger on close.
 */

import { el, on } from '../utils.js';
import { icon } from './icons.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openStack = [];

/**
 * @param {object} options
 * @param {string} options.title
 * @param {Node|Node[]} options.body
 * @param {Array<{label:string, variant?:string, close?:boolean, onClick?:Function}>} [options.actions]
 * @param {boolean} [options.wide]
 * @param {Function} [options.onClose]
 * @returns {{ close: Function, panel: HTMLElement }}
 */
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const previousFocus = document.activeElement;
  const root = document.getElementById('modalRoot');

  const closeBtn = el('button', {
    type: 'button', class: 'iconbtn', 'aria-label': 'Close dialog', html: icon('close'),
  });

  const panel = el('div', {
    class: `modal__panel${wide ? ' modal__panel--wide' : ''}`,
    role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
  }, [
    el('header', { class: 'modal__head' }, [
      el('h2', { class: 'modal__title', text: title }),
      closeBtn,
    ]),
    el('div', { class: 'modal__body' }, [].concat(body)),
  ]);

  const overlay = el('div', { class: 'modal' }, [panel]);

  function close() {
    if (!overlay.isConnected) return;
    disposers.forEach((dispose) => dispose());
    overlay.remove();
    openStack.splice(openStack.indexOf(entry), 1);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    if (typeof onClose === 'function') onClose();
  }

  if (actions.length) {
    panel.append(el('footer', { class: 'modal__foot' }, actions.map((action) => el('button', {
      type: 'button',
      class: `btn ${action.variant ? `btn--${action.variant}` : ''}`.trim(),
      text: action.label,
      onClick: () => {
        const result = action.onClick ? action.onClick(close) : undefined;
        if (action.close !== false && result !== false) close();
      },
    }))));
  }

  const disposers = [
    on(closeBtn, 'click', close),
    on(overlay, 'mousedown', (event) => { if (event.target === overlay) close(); }),
    on(document, 'keydown', (event) => {
      if (openStack[openStack.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        trapFocus(event, panel);
      }
    }, true),
  ];

  const entry = { close, panel };
  openStack.push(entry);
  root.append(overlay);

  const first = panel.querySelector(FOCUSABLE);
  (first || panel).focus();

  return entry;
}

function trapFocus(event, panel) {
  const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export const anyModalOpen = () => openStack.length > 0;

/** Yes/no dialog. Resolves true when confirmed. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    openModal({
      title,
      body: el('p', { text: message }),
      actions: [
        { label: 'Cancel', variant: 'ghost', onClick: () => { settled = true; resolve(false); } },
        {
          label: confirmLabel,
          variant: danger ? 'danger' : undefined,
          onClick: () => { settled = true; resolve(true); },
        },
      ],
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}
