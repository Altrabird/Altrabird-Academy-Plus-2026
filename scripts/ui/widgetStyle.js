/**
 * widgetStyle.js — custom widget themes: a colour and a font per widget.
 *
 * The style lives on the widget's placement entry ({ tint, font }), so it is
 * saved with the screen, copied when a screen is duplicated and carried in an
 * exported file. The widget manager turns it into data-tint / data-font on the
 * card and CSS does the rest, so no widget had to change.
 */

import { el } from '../utils.js';
import { openModal } from './modal.js';
import { swatchPicker, segmented } from './forms.js';

export const TINTS = [
  { value: 'default', label: 'Theme', color: 'var(--surface-3)' },
  { value: 'teal', label: 'Teal', color: '#14b8a6' },
  { value: 'sky', label: 'Sky', color: '#38bdf8' },
  { value: 'violet', label: 'Violet', color: '#a78bfa' },
  { value: 'rose', label: 'Rose', color: '#fb7185' },
  { value: 'amber', label: 'Amber', color: '#fbbf24' },
  { value: 'lime', label: 'Lime', color: '#a3e635' },
  { value: 'paper', label: 'Paper', color: '#fffdf6' },
  { value: 'ink', label: 'Ink', color: '#0b1220' },
  { value: 'glass', label: 'Glass', color: 'rgba(255,255,255,.35)' },
];

// System fonts only, so a theme looks the same with the network unplugged.
export const FONTS = [
  { value: 'default', label: 'Theme' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Typewriter' },
  { value: 'hand', label: 'Handwriting' },
];

export const DEFAULT_STYLE = { tint: 'default', font: 'default' };

/** Anything unknown falls back to the theme, so a hand-edited file cannot inject CSS. */
export function sanitizeStyle(style) {
  const tint = style && TINTS.some((item) => item.value === style.tint) ? style.tint : 'default';
  const font = style && FONTS.some((item) => item.value === style.font) ? style.font : 'default';
  return { tint, font };
}

export const isDefaultStyle = (style) => {
  const clean = sanitizeStyle(style);
  return clean.tint === 'default' && clean.font === 'default';
};

/**
 * @param {{ title: string, value: object, onChange: Function, onApplyAll: Function, onMakeDefault: Function }} options
 */
export function openWidgetStyle({ title, value, onChange, onApplyAll, onMakeDefault }) {
  let current = sanitizeStyle(value);
  const update = (patch) => {
    current = { ...current, ...patch };
    onChange(current);
  };

  openModal({
    title: `Style — ${title}`,
    body: [
      el('p', { class: 'field__hint', text: 'Give this widget its own colour and lettering. Text stays readable on every colour.' }),
      swatchPicker({ label: 'Colour', value: current.tint, options: TINTS, onChange: (tint) => update({ tint }) }),
      segmented({ label: 'Font', value: current.font, options: FONTS, onChange: (font) => update({ font }) }),
    ],
    actions: [
      { label: 'Apply to every widget on this screen', variant: 'ghost', onClick: () => onApplyAll(current) },
      { label: 'Use for new widgets', variant: 'ghost', onClick: () => onMakeDefault(current) },
      { label: 'Done' },
    ],
  });
}
