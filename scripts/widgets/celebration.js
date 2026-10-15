/**
 * celebration.js (widget) — the manual "Celebrate" button and the settings for
 * the shared celebration service: which effect, which message, and whether it
 * fires by itself when a timer finishes or a pupil is picked.
 *
 * The settings are global (one celebration service), so every Celebration card
 * shows the same choices.
 */

import { el } from '../utils.js';
import { icon } from '../ui/icons.js';
import { state } from '../state.js';
import { celebrate, EFFECTS, MESSAGES } from '../celebration.js';

const EFFECT_LABELS = {
  confetti: 'Confetti',
  stars: 'Stars',
  fireworks: 'Fireworks',
  surprise: 'Surprise me',
};

export default {
  id: 'celebration',
  title: 'Celebration',
  icon: 'celebration',
  size: 'md',
  singleton: false,
  description: 'Confetti, stars or fireworks with a well-done message.',

  create() {
    const config = () => state.settings.celebration;

    const button = el('button', {
      type: 'button', class: 'btn w-cel__go',
      onClick: () => celebrate({}),
    }, [
      el('span', { class: 'w-cel__go-icon', 'aria-hidden': 'true', html: icon('celebration', 22) }),
      el('span', { text: 'Celebrate' }),
    ]);

    const effectButtons = [...EFFECTS, 'surprise'].map((value) => el('button', {
      type: 'button', class: 'chip-btn', text: EFFECT_LABELS[value],
      'aria-pressed': String(config().effect === value),
      onClick: () => {
        state.setCelebration({ effect: value });
        render();
      },
    }));

    const messageSelect = el('select', {
      class: 'select', 'aria-label': 'Celebration message',
      onChange: (event) => {
        if (event.target.value === '__custom') {
          customInput.hidden = false;
          customInput.focus();
          return;
        }
        customInput.hidden = true;
        state.setCelebration({ message: event.target.value });
      },
    });

    const customInput = el('input', {
      class: 'input', type: 'text', hidden: true, maxlength: '40',
      placeholder: 'Your own message',
      'aria-label': 'Custom celebration message',
      onInput: (event) => state.setCelebration({ message: event.target.value || MESSAGES[0] }),
    });

    const onTimer = el('input', {
      type: 'checkbox',
      onChange: (event) => state.setCelebration({ onTimer: event.target.checked }),
    });
    const onPick = el('input', {
      type: 'checkbox',
      onChange: (event) => state.setCelebration({ onPick: event.target.checked }),
    });

    const element = el('div', { class: 'w-cel' }, [
      button,
      el('div', { class: 'w-cel__effects', role: 'group', 'aria-label': 'Celebration effect' }, effectButtons),
      el('div', { class: 'w-cel__message' }, [messageSelect, customInput]),
      el('div', { class: 'w-cel__triggers' }, [
        el('label', { class: 'w-pick__option' }, [onTimer, el('span', { text: 'When a timer finishes' })]),
        el('label', { class: 'w-pick__option' }, [onPick, el('span', { text: 'When a pupil is picked' })]),
      ]),
    ]);

    function render() {
      const current = config();

      effectButtons.forEach((node, index) => {
        const value = [...EFFECTS, 'surprise'][index];
        node.setAttribute('aria-pressed', String(current.effect === value));
        node.classList.toggle('is-active', current.effect === value);
      });

      const known = MESSAGES.includes(current.message);
      messageSelect.replaceChildren(
        ...MESSAGES.map((message) => el('option', { value: message, selected: known && message === current.message }, message)),
        el('option', { value: '__custom', selected: !known }, 'Custom message…'),
      );
      customInput.hidden = known;
      customInput.value = known ? '' : current.message;

      onTimer.checked = Boolean(current.onTimer);
      onPick.checked = Boolean(current.onPick);
    }

    const unsubscribe = state.subscribe((event) => {
      if (event.type === 'celebration' || event.type === 'replaced') render();
    });

    render();

    return {
      element,
      destroy() { unsubscribe(); },
    };
  },
};
