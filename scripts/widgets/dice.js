/**
 * dice.js — one to five dice, rolled with the shared unbiased random source.
 *
 * The roll result is decided first and the animation only presents it, the same
 * rule the Random Picker follows. The shuffle animation is CSS and is skipped
 * entirely under Reduce Motion.
 */

import { el, clamp } from '../utils.js';
import { randomInt } from '../random.js';
import { state } from '../state.js';

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

const DEFAULTS = { count: 1, faces: 6, values: [1] };
const ROLL_MS = 700;

export default {
  id: 'dice',
  title: 'Dice',
  icon: 'dice',
  size: 'lg',
  singleton: false,
  description: 'Roll one to five dice.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let count = clamp(Number(saved.count) || 1, 1, 5);
    let faces = [6, 10, 12, 20].includes(Number(saved.faces)) ? Number(saved.faces) : 6;
    let values = Array.isArray(saved.values) && saved.values.length ? saved.values : [1];
    let rolling = false;
    let timer = 0;

    const tray = el('div', { class: 'w-dice__tray', role: 'status', 'aria-live': 'polite' });
    const total = el('p', { class: 'w-dice__total' });

    const rollButton = el('button', { type: 'button', class: 'btn', text: 'Roll', onClick: () => roll() });

    const countButtons = [1, 2, 3, 4, 5].map((n) => el('button', {
      type: 'button', class: 'chip-btn', text: String(n),
      'aria-label': `${n} ${n === 1 ? 'die' : 'dice'}`,
      onClick: () => {
        count = n;
        values = values.slice(0, n);
        while (values.length < n) values.push(1);
        persist();
        render();
      },
    }));

    const faceButtons = [6, 10, 12, 20].map((n) => el('button', {
      type: 'button', class: 'chip-btn', text: `d${n}`,
      'aria-label': `${n}-sided dice`,
      onClick: () => { faces = n; persist(); render(); },
    }));

    const element = el('div', { class: 'w-dice' }, [
      el('div', { class: 'w-dice__stage' }, [tray, total]),
      el('div', { class: 'w-dice__controls' }, [rollButton]),
      el('div', { class: 'w-dice__options' }, [
        el('div', { class: 'w-dice__group', role: 'group', 'aria-label': 'How many dice' }, countButtons),
        el('div', { class: 'w-dice__group', role: 'group', 'aria-label': 'Sides per die' }, faceButtons),
      ]),
    ]);

    function persist() {
      ctx.data.set({ count, faces, values });
    }

    function face(value) {
      // Six-sided dice get pips; the bigger dice just show the number.
      if (faces !== 6) {
        return el('div', { class: 'w-dice__die w-dice__die--number' }, [
          el('span', { class: 'w-dice__number', text: String(value) }),
        ]);
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('class', 'w-dice__pips');
      svg.setAttribute('aria-hidden', 'true');
      for (const [cx, cy] of PIPS[value] || PIPS[1]) {
        const pip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pip.setAttribute('cx', String(cx));
        pip.setAttribute('cy', String(cy));
        pip.setAttribute('r', '8.5');
        svg.append(pip);
      }
      return el('div', { class: 'w-dice__die' }, [svg]);
    }

    function render() {
      tray.replaceChildren(...values.slice(0, count).map((value, index) => {
        const die = face(value);
        die.setAttribute('aria-label', `Die ${index + 1}: ${value}`);
        return die;
      }));
      total.textContent = count > 1 ? `Total ${values.slice(0, count).reduce((sum, n) => sum + n, 0)}` : '';
      total.hidden = count < 2;

      countButtons.forEach((button, index) => {
        button.classList.toggle('is-active', index + 1 === count);
        button.setAttribute('aria-pressed', String(index + 1 === count));
      });
      faceButtons.forEach((button, index) => {
        const value = [6, 10, 12, 20][index];
        button.classList.toggle('is-active', value === faces);
        button.setAttribute('aria-pressed', String(value === faces));
      });
      rollButton.disabled = rolling;
      element.classList.toggle('is-rolling', rolling);
    }

    function roll() {
      if (rolling) return;
      // Decide the result first; the tumble is only presentation.
      const result = Array.from({ length: count }, () => randomInt(faces) + 1);

      if (state.motionReduced) {
        values = result;
        persist();
        render();
        return;
      }

      rolling = true;
      render();
      const startedAt = performance.now();

      const tumble = () => {
        if (performance.now() - startedAt >= ROLL_MS) {
          rolling = false;
          values = result;
          persist();
          render();
          return;
        }
        values = Array.from({ length: count }, () => randomInt(faces) + 1);
        render();
        timer = setTimeout(tumble, 90);
      };
      tumble();
    }

    render();

    return {
      element,
      destroy() { clearTimeout(timer); },
    };
  },
};
