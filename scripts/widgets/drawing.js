/**
 * drawing.js — a small whiteboard.
 *
 * Strokes are kept as normalised 0-1 coordinates, so a drawing keeps its shape
 * when the widget is resized or shown on a different screen size, and they
 * survive a reload. The canvas is only redrawn when something changes: there is
 * no animation loop.
 */

import { el, on, clamp, toast } from '../utils.js';

const COLOURS = ['#f2f6fb', '#14b8a6', '#38bdf8', '#fbbf24', '#f87171'];
const WIDTHS = [2, 4, 8];
const MAX_POINTS = 12000;      // keeps a drawing well inside the storage budget

const DEFAULTS = { strokes: [], colour: COLOURS[1], width: 1 };

export default {
  id: 'drawing',
  title: 'Drawing',
  icon: 'drawing',
  size: 'lg',
  singleton: false,
  description: 'Sketch on the board with a pen and eraser.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let strokes = Array.isArray(saved.strokes) ? saved.strokes : [];
    let colour = COLOURS.includes(saved.colour) ? saved.colour : COLOURS[1];
    let width = clamp(Number(saved.width) || 1, 0, WIDTHS.length - 1);
    let erasing = false;
    let drawing = null;

    const canvas = el('canvas', { class: 'w-draw__canvas', 'aria-label': 'Drawing area' });
    const surface = el('div', { class: 'w-draw__surface' }, [canvas]);

    const colourButtons = COLOURS.map((value) => el('button', {
      type: 'button', class: 'w-draw__colour', style: `--pen: ${value}`,
      'aria-label': `Pen colour ${value}`,
      onClick: () => { colour = value; erasing = false; render(); },
    }));

    const widthButtons = WIDTHS.map((value, index) => el('button', {
      type: 'button', class: 'w-draw__width', 'aria-label': `Pen size ${index + 1}`,
      onClick: () => { width = index; erasing = false; render(); },
    }, [el('span', { style: `width:${value * 2}px; height:${value * 2}px` })]));

    const eraserButton = el('button', {
      type: 'button', class: 'iconbtn', text: '⌫', 'aria-label': 'Eraser',
      onClick: () => { erasing = !erasing; render(); },
    });
    const undoButton = el('button', {
      type: 'button', class: 'iconbtn', text: '↶', 'aria-label': 'Undo the last stroke',
      onClick: () => {
        if (!strokes.length) return;
        strokes.pop();
        persist();
        paint();
        render();
      },
    });
    const clearButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear',
      onClick: () => {
        if (!strokes.length) return;
        strokes = [];
        persist();
        paint();
        render();
      },
    });

    const toolbar = el('div', { class: 'w-draw__toolbar' }, [
      ...colourButtons,
      el('span', { class: 'w-note__divider', 'aria-hidden': 'true' }),
      ...widthButtons,
      el('span', { class: 'w-note__divider', 'aria-hidden': 'true' }),
      eraserButton, undoButton,
      el('span', { class: 'w-note__spacer' }),
      clearButton,
    ]);

    const element = el('div', { class: 'w-draw' }, [surface, toolbar]);

    /* ---------- painting ---------- */
    function sizeCanvas() {
      const box = surface.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(box.width));
      const h = Math.max(1, Math.round(box.height));
      if (canvas.width === Math.round(w * ratio) && canvas.height === Math.round(h * ratio)) return;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function paint() {
      sizeCanvas();
      const context = canvas.getContext('2d');
      const box = surface.getBoundingClientRect();
      const w = box.width || 1;
      const h = box.height || 1;

      context.clearRect(0, 0, w, h);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      for (const stroke of strokes) {
        if (!stroke.points || stroke.points.length < 2) continue;
        context.strokeStyle = stroke.colour;
        context.lineWidth = WIDTHS[stroke.width] || WIDTHS[1];
        context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
        if (stroke.erase) context.lineWidth = (WIDTHS[stroke.width] || WIDTHS[1]) * 4;

        context.beginPath();
        context.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
        for (let i = 1; i < stroke.points.length; i += 1) {
          context.lineTo(stroke.points[i][0] * w, stroke.points[i][1] * h);
        }
        context.stroke();
      }
      context.globalCompositeOperation = 'source-over';
    }

    function persist() {
      ctx.data.set({ strokes, colour, width });
    }

    function pointFrom(event) {
      const box = surface.getBoundingClientRect();
      return [
        clamp((event.clientX - box.left) / (box.width || 1), 0, 1),
        clamp((event.clientY - box.top) / (box.height || 1), 0, 1),
      ];
    }

    function totalPoints() {
      return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    }

    on(canvas, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();          // do not start a widget drag
      canvas.setPointerCapture(event.pointerId);
      drawing = { colour, width, erase: erasing, points: [pointFrom(event)] };
      strokes.push(drawing);
    });

    on(canvas, 'pointermove', (event) => {
      if (!drawing) return;
      event.preventDefault();
      drawing.points.push(pointFrom(event));
      paint();
    });

    const finish = () => {
      if (!drawing) return;
      const stroke = drawing;
      drawing = null;
      if (stroke.points.length < 2) strokes.pop();       // a tap is not a stroke
      if (totalPoints() > MAX_POINTS) {
        strokes.shift();
        toast('The drawing is full — the oldest stroke was dropped');
      }
      persist();
      paint();
      render();
    };
    on(canvas, 'pointerup', finish);
    on(canvas, 'pointercancel', finish);

    function render() {
      colourButtons.forEach((button, index) => {
        button.setAttribute('aria-pressed', String(!erasing && COLOURS[index] === colour));
      });
      widthButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === width)));
      eraserButton.setAttribute('aria-pressed', String(erasing));
      undoButton.disabled = strokes.length === 0;
      clearButton.disabled = strokes.length === 0;
      element.classList.toggle('is-erasing', erasing);
    }

    const observer = new ResizeObserver(() => {
      // Redraw after the layout settles, never inside the callback itself.
      requestAnimationFrame(() => paint());
    });
    observer.observe(surface);

    render();
    queueMicrotask(paint);

    return {
      element,
      onResize() { paint(); },
      destroy() {
        observer.disconnect();
      },
    };
  },
};
