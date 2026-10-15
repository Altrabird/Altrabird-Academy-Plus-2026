/**
 * trafficLight.js — three classroom states with editable labels.
 * The state is carried by size, colour AND text, never by colour alone.
 */

import { el } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { textField, section } from '../ui/forms.js';

const LIGHTS = ['red', 'yellow', 'green'];

const DEFAULTS = {
  active: 'red',
  labels: {
    red: { title: 'SILENT WORK', subtitle: 'Work on your own' },
    yellow: { title: 'GET READY', subtitle: 'Finish up and prepare' },
    green: { title: 'DISCUSSION', subtitle: 'Talk with your group' },
  },
};

function mergeLabels(saved) {
  const labels = {};
  for (const key of LIGHTS) {
    labels[key] = { ...DEFAULTS.labels[key], ...((saved && saved[key]) || {}) };
  }
  return labels;
}

export default {
  id: 'trafficLight',
  title: 'Traffic Light',
  icon: 'trafficLight',
  size: 'md',
  singleton: false,
  description: 'Red, yellow and green with your own labels.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let active = LIGHTS.includes(saved.active) ? saved.active : 'red';
    let labels = mergeLabels(saved.labels);

    const lamps = new Map();
    const list = el('div', { class: 'w-traffic__lamps', role: 'group', 'aria-label': 'Classroom state' });

    for (const key of LIGHTS) {
      const dot = el('span', { class: `w-traffic__dot w-traffic__dot--${key}`, 'aria-hidden': 'true' });
      const title = el('span', { class: 'w-traffic__title' });
      const subtitle = el('span', { class: 'w-traffic__subtitle' });
      const button = el('button', {
        type: 'button',
        class: `w-traffic__lamp w-traffic__lamp--${key}`,
        dataset: { light: key },
        onClick: () => select(key),
      }, [dot, title, subtitle]);

      lamps.set(key, { button, title, subtitle });
      list.append(button);
    }

    const element = el('div', { class: 'w-traffic' }, [list]);

    function select(key) {
      active = key;
      ctx.data.set({ active, labels });
      render();
    }

    function render() {
      element.dataset.active = active;
      for (const key of LIGHTS) {
        const lamp = lamps.get(key);
        const isActive = key === active;
        lamp.title.textContent = labels[key].title;
        lamp.subtitle.textContent = labels[key].subtitle || '';
        lamp.subtitle.hidden = !labels[key].subtitle;
        lamp.button.classList.toggle('is-active', isActive);
        lamp.button.setAttribute('aria-pressed', String(isActive));
        lamp.button.setAttribute('aria-label',
          `${labels[key].title}${labels[key].subtitle ? `. ${labels[key].subtitle}` : ''}${isActive ? '. Currently showing' : ''}`);
      }
    }

    render();

    return {
      element,

      openSettings() {
        const draft = JSON.parse(JSON.stringify(labels));
        openModal({
          title: 'Traffic Light labels',
          body: LIGHTS.map((key) => section(key === 'red' ? 'Red' : key === 'yellow' ? 'Yellow' : 'Green', [
            textField({
              label: 'Title', value: draft[key].title,
              onInput: (value) => { draft[key].title = value.toUpperCase(); },
            }),
            textField({
              label: 'Subtitle', hint: 'Optional — leave empty to hide.', value: draft[key].subtitle,
              onInput: (value) => { draft[key].subtitle = value; },
            }),
          ])),
          actions: [
            { label: 'Cancel', variant: 'ghost' },
            {
              label: 'Save labels',
              onClick: () => {
                labels = mergeLabels(draft);
                ctx.data.set({ active, labels });
                render();
              },
            },
          ],
        });
      },
    };
  },
};
