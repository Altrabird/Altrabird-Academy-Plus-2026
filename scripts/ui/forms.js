/**
 * forms.js — small form building blocks shared by the settings dialog and by
 * per-widget settings, so controls look and behave the same everywhere.
 */

import { el, uid } from '../utils.js';

/** Labelled on/off row. */
export function switchRow({ label, hint, checked, disabled = false, onChange }) {
  const id = uid('sw');
  const input = el('input', {
    type: 'checkbox', id, checked: Boolean(checked), disabled,
    onChange: (event) => onChange(event.target.checked),
  });
  return el('div', { class: 'switchrow' }, [
    el('span', { class: 'switchrow__text' }, [
      el('label', { class: 'field__label', for: id, text: label }),
      hint ? el('span', { class: 'field__hint', text: hint }) : null,
    ]),
    input,
  ]);
}

/** Row of mutually exclusive pills. options: [{ value, label }] */
export function segmented({ label, hint, value, options, onChange }) {
  const group = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const buttons = options.map((option) => el('button', {
    type: 'button', class: 'segmented__opt', text: option.label,
    'aria-pressed': String(option.value === value),
    onClick: () => {
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(options[index].value === option.value)));
      onChange(option.value);
    },
  }));
  group.append(...buttons);
  return el('div', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
    group,
  ]);
}

/** Colour-dot picker used for themes. options: [{ value, label, color }] */
export function swatchPicker({ label, value, options, onChange }) {
  const wrap = el('div', { class: 'swatches', role: 'group', 'aria-label': label });
  const buttons = options.map((option) => el('button', {
    type: 'button', class: 'swatch', 'aria-pressed': String(option.value === value),
    onClick: () => {
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(options[index].value === option.value)));
      onChange(option.value);
    },
  }, [
    el('span', { class: 'swatch__dot', style: `background:${option.color}` }),
    el('span', { text: option.label }),
  ]));
  wrap.append(...buttons);
  return el('div', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    wrap,
  ]);
}

/** Labelled text/number input. */
export function textField({ label, hint, value = '', type = 'text', placeholder, onInput }) {
  const id = uid('fld');
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: id, text: label }),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
    el('input', {
      class: 'input', id, type, value, placeholder,
      onInput: (event) => onInput(event.target.value),
    }),
  ]);
}

export function section(title, children) {
  return el('section', { class: 'settings-section' }, [
    el('h3', { text: title }),
    ...[].concat(children).filter(Boolean),
  ]);
}
