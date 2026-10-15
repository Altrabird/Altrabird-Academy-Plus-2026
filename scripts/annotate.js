/**
 * annotate.js — the annotation bar: draw straight over the whole board.
 *
 * One transparent canvas sits above every widget on the 16:9 board. While the
 * bar is open it takes the pointer (pen, highlighter, eraser); when it is
 * closed the ink stays visible but every click goes through to the widgets
 * underneath. Ink belongs to a screen and is stored like the Drawing tool's:
 * points as fractions of the board, so it lands in the same place on a laptop
 * and on the projector. There is no animation loop — it redraws on change.
 */

import { el, on, clamp, toast } from './utils.js';
import { storage } from './storage.js';
import { screens } from './screens.js';
import { icon } from './ui/icons.js';

const COLOURS = ['#f8fafc', '#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const WIDTHS = [3, 6, 12];               // px on a 1000px-wide board, scaled to the real width
const HIGHLIGHT_ALPHA = 0.35;
const MAX_POINTS = 30000;                // per screen, keeps ink well inside the storage budget
const HEX = /^#[0-9a-f]{6}$/i;

/** Validate ink from storage or an imported file. */
export function sanitizeStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  let budget = MAX_POINTS * 2;
  const out = [];
  for (const stroke of raw) {
    if (!stroke || !HEX.test(stroke.c) || !Array.isArray(stroke.p) || stroke.p.length < 2) continue;
    const points = stroke.p.slice(0, Math.max(0, budget)).filter((n) => Number.isFinite(n)).map((n) => clamp(n, 0, 1));
    if (points.length < 2) continue;
    if (points.length % 2) points.pop();
    budget -= points.length;
    out.push({ c: stroke.c, w: clamp(Number(stroke.w) || 6, 1, 60), a: stroke.a === HIGHLIGHT_ALPHA ? HIGHLIGHT_ALPHA : 1, p: points });
    if (budget <= 0) break;
  }
  return out;
}

const round = (n) => Math.round(n * 10000) / 10000;

let ink = null;          // the overlay canvas
let bar = null;          // the floating toolbar
let strokes = [];
let active = false;
let tool = { colour: COLOURS[2], width: 1, highlighter: false, eraser: false };
let current = null;
let onToggle = () => {};

function loadStrokes() {
  strokes = sanitizeStrokes(screens.active().annotations);
}

function saveStrokes() {
  const list = screens.all();
  const screen = list.find((item) => item.id === screens.activeId());
  if (!screen) return;
  screen.annotations = strokes;
  storage.saveScreens(list);
}

function render() {
  if (!ink) return;
  const box = ink.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  if (ink.width !== width || ink.height !== height) { ink.width = width; ink.height = height; }

  const g = ink.getContext('2d');
  g.clearRect(0, 0, width, height);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const scale = width / 1000;
  for (const stroke of current && current.p ? [...strokes, current] : strokes) {
    g.globalAlpha = stroke.a;
    g.strokeStyle = stroke.c;
    g.lineWidth = stroke.w * scale;
    g.beginPath();
    g.moveTo(stroke.p[0] * width, stroke.p[1] * height);
    if (stroke.p.length === 2) g.lineTo((stroke.p[0] * width) + 0.01, stroke.p[1] * height);   // a dot
    for (let i = 2; i < stroke.p.length; i += 2) g.lineTo(stroke.p[i] * width, stroke.p[i + 1] * height);
    g.stroke();
  }
  g.globalAlpha = 1;
  ink.hidden = !active && !strokes.length;
}

function pointAt(event) {
  const box = ink.getBoundingClientRect();
  return [round(clamp((event.clientX - box.left) / box.width, 0, 1)), round(clamp((event.clientY - box.top) / box.height, 0, 1))];
}

/** Erase whole strokes that pass within a few pixels of the pointer. */
function eraseAt(event) {
  const box = ink.getBoundingClientRect();
  const [x, y] = pointAt(event);
  const reach = 14;
  const before = strokes.length;
  strokes = strokes.filter((stroke) => {
    for (let i = 0; i < stroke.p.length; i += 2) {
      if (Math.hypot((stroke.p[i] - x) * box.width, (stroke.p[i + 1] - y) * box.height) < reach + (stroke.w / 2)) return false;
    }
    return true;
  });
  if (strokes.length !== before) render();
  return strokes.length !== before;
}

function totalPoints() {
  return strokes.reduce((sum, stroke) => sum + (stroke.p.length / 2), 0);
}

function wireCanvas() {
  let erased = false;
  on(ink, 'pointerdown', (event) => {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    ink.setPointerCapture(event.pointerId);
    if (tool.eraser) { erased = eraseAt(event); current = { erasing: true }; return; }
    if (totalPoints() >= MAX_POINTS) { toast('This screen is full of ink — clear some to keep drawing.'); return; }
    current = {
      c: tool.colour,
      w: WIDTHS[tool.width] * (tool.highlighter ? 3 : 1),
      a: tool.highlighter ? HIGHLIGHT_ALPHA : 1,
      p: pointAt(event),
    };
    render();
  });
  on(ink, 'pointermove', (event) => {
    if (!current) return;
    if (current.erasing) { erased = eraseAt(event) || erased; return; }
    const [x, y] = pointAt(event);
    const n = current.p.length;
    // Skip points closer than ~1px apart: same line, a fraction of the storage.
    if (Math.abs(x - current.p[n - 2]) + Math.abs(y - current.p[n - 1]) < 0.0012) return;
    current.p.push(x, y);
    render();
  });
  const finish = () => {
    if (!current) return;
    if (!current.erasing) strokes.push(current);
    const changed = !current.erasing || erased;
    current = null;
    erased = false;
    render();
    if (changed) saveStrokes();
  };
  on(ink, 'pointerup', finish);
  on(ink, 'pointercancel', finish);
}

function buildBar() {
  const colourButtons = COLOURS.map((colour) => el('button', {
    type: 'button', class: 'ink-bar__colour', style: `--pen:${colour}`, 'aria-label': `Pen colour ${colour}`,
    dataset: { colour },
    onClick: () => { tool = { ...tool, colour, eraser: false }; paintBar(); },
  }));
  const widthButtons = WIDTHS.map((_, index) => el('button', {
    type: 'button', class: 'ink-bar__width', 'aria-label': ['Thin', 'Medium', 'Thick'][index],
    dataset: { width: String(index) },
    onClick: () => { tool = { ...tool, width: index }; paintBar(); },
  }, [el('span', { style: `--dot:${4 + (index * 4)}px` })]));

  const toggle = (name, label, key) => el('button', {
    type: 'button', class: 'iconbtn ink-bar__tool', html: icon(name), 'aria-label': label, dataset: { tool: key },
    onClick: () => {
      tool = key === 'eraser'
        ? { ...tool, eraser: !tool.eraser }
        : { ...tool, highlighter: !tool.highlighter, eraser: false };
      paintBar();
    },
  });

  bar = el('div', { class: 'ink-bar', role: 'toolbar', 'aria-label': 'Annotation tools', hidden: true }, [
    el('span', { class: 'ink-bar__label', html: icon('annotate', 16) }),
    el('div', { class: 'ink-bar__group' }, colourButtons),
    el('div', { class: 'ink-bar__group' }, widthButtons),
    toggle('highlighter', 'Highlighter', 'highlighter'),
    toggle('eraser', 'Eraser', 'eraser'),
    el('button', {
      type: 'button', class: 'iconbtn', html: icon('undo'), 'aria-label': 'Undo last stroke', dataset: { action: 'undo' },
      onClick: () => { if (strokes.pop()) { render(); saveStrokes(); } },
    }),
    el('button', {
      type: 'button', class: 'iconbtn iconbtn--danger', html: icon('trash'), 'aria-label': 'Clear all ink on this screen', dataset: { action: 'clear' },
      onClick: () => { if (!strokes.length) return; strokes = []; render(); saveStrokes(); toast('Ink cleared'); },
    }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'Done', dataset: { action: 'done' }, onClick: () => setAnnotating(false) }),
  ]);
  document.body.append(bar);
}

function paintBar() {
  if (!bar) return;
  bar.querySelectorAll('.ink-bar__colour').forEach((button) => {
    button.setAttribute('aria-pressed', String(!tool.eraser && button.dataset.colour === tool.colour));
  });
  bar.querySelectorAll('.ink-bar__width').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.width) === tool.width));
  });
  bar.querySelector('[data-tool="highlighter"]').setAttribute('aria-pressed', String(tool.highlighter && !tool.eraser));
  bar.querySelector('[data-tool="eraser"]').setAttribute('aria-pressed', String(tool.eraser));
  if (ink) ink.dataset.tool = tool.eraser ? 'eraser' : 'pen';
}

export function isAnnotating() { return active; }

export function setAnnotating(next) {
  active = Boolean(next);
  if (!ink) return;
  ink.classList.toggle('is-active', active);
  bar.hidden = !active;
  paintBar();
  render();
  onToggle(active);
  if (active) bar.querySelector('button').focus();
}

/** Call after the screen changes (switch, deck open, import, reset). */
export function refreshAnnotations() {
  current = null;
  loadStrokes();
  render();
}

export function initAnnotations(canvas, { onChange } = {}) {
  ink = el('canvas', { class: 'ink', 'aria-hidden': 'true', hidden: true });
  canvas.append(ink);
  if (typeof onChange === 'function') onToggle = onChange;
  buildBar();
  wireCanvas();
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => render()).observe(canvas);
  refreshAnnotations();
}
