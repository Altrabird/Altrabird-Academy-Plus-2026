/**
 * groupMaker.js — splits the active class into random groups.
 *
 * Two modes: a number of groups, or a number of pupils per group. Membership
 * comes from a Fisher-Yates shuffle (scripts/random.js) and any remainder is
 * spread one pupil at a time across the last groups, so sizes never differ by
 * more than one (25 pupils in 4 groups -> 6, 6, 6, 7).
 *
 * When 3D is enabled a ~1.1 s flourish plays once as the groups appear; with 3D
 * off (or Reduce Motion on) the cards simply animate in with CSS. Neither path
 * leaves anything rendering.
 */

import { el, clamp, toast, copyText } from '../utils.js';
import { classManager } from '../classes.js';
import { state } from '../state.js';
import { shuffle } from '../random.js';
import { icon, hasIcon, GROUP_ICONS } from '../ui/icons.js';

const ICONS = GROUP_ICONS;

const DEFAULTS = {
  mode: 'groups',     // 'groups' | 'size'
  groupCount: 4,
  groupSize: 5,
  groups: [],         // last generated result, kept so a reload does not lose it
};

/**
 * Split `total` pupils into `count` groups, remainder spread across the last
 * groups: 25 into 4 -> [6, 6, 6, 7].
 */
export function groupSizes(total, count) {
  const groups = clamp(count, 1, Math.max(1, total));
  const base = Math.floor(total / groups);
  const remainder = total % groups;
  return Array.from({ length: groups }, (_, index) => base + (index >= groups - remainder ? 1 : 0));
}

export default {
  id: 'groupMaker',
  title: 'Group Maker',
  icon: 'groupMaker',
  size: 'xl',
  singleton: false,
  description: 'Split the class into random groups.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    let groups = Array.isArray(options.groups) ? options.groups : [];
    let reveal = null;
    let revealPending = null;
    let threeFailed = false;
    let busy = false;

    const roster = () => {
      const active = classManager.active();
      return active ? active.students.filter((student) => student.active) : [];
    };

    /* ---------- DOM ---------- */
    const modeButtons = [
      { value: 'groups', label: 'Number of groups' },
      { value: 'size', label: 'Pupils per group' },
    ].map((option) => el('button', {
      type: 'button', class: 'segmented__opt', text: option.label,
      'aria-pressed': String(options.mode === option.value),
      onClick: () => {
        options = { ...options, mode: option.value };
        persist();
        renderControls();
        renderMeta();
      },
    }));

    const amountInput = el('input', {
      class: 'input w-group__amount', type: 'number', min: '1', max: '40',
      'aria-label': 'How many',
      onInput: () => {
        const value = clamp(Number(amountInput.value) || 1, 1, 40);
        options = options.mode === 'groups'
          ? { ...options, groupCount: value }
          : { ...options, groupSize: value };
        persist();
        renderMeta();
      },
    });

    const generateButton = el('button', { type: 'button', class: 'btn', text: 'Generate', onClick: () => generate() });
    const shuffleButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Shuffle',
      title: 'Keep the same number of groups, mix the pupils again',
      onClick: () => generate({ keepShape: true }),
    });
    const copyAllButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy all',
      onClick: async () => {
        if (!groups.length) { toast('Generate some groups first'); return; }
        const text = groups
          .map((group) => [`${group.title}`, ...group.members.map((member) => member.name)].join('\n'))
          .join('\n\n');
        const ok = await copyText(text);
        toast(ok ? 'All groups copied' : 'Copying was blocked by the browser');
      },
    });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset',
      onClick: () => {
        groups = [];
        persist();
        renderGroups();
        renderMeta();
      },
    });

    const controls = el('div', { class: 'w-group__controls' }, [
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Grouping mode' }, modeButtons),
      amountInput,
      el('div', { class: 'w-group__buttons' }, [generateButton, shuffleButton, copyAllButton, resetButton]),
    ]);

    const grid = el('div', { class: 'w-group__grid', role: 'list' });
    const empty = el('p', { class: 'w-group__empty', text: 'Add students to this class first.' });
    const stage = el('div', { class: 'w-group__stage' }, [grid, empty]);
    const meta = el('p', { class: 'w-group__meta' });

    const element = el('div', { class: 'w-group' }, [controls, stage, meta]);

    function persist() {
      ctx.data.set({ ...options, groups });
    }

    /* ---------- rendering ---------- */
    function renderControls() {
      modeButtons.forEach((button, index) => {
        button.setAttribute('aria-pressed', String(options.mode === (index === 0 ? 'groups' : 'size')));
      });
      amountInput.value = String(options.mode === 'groups' ? options.groupCount : options.groupSize);
      amountInput.setAttribute('aria-label', options.mode === 'groups' ? 'Number of groups' : 'Pupils per group');
    }

    function plannedCount(total) {
      if (!total) return 0;
      return options.mode === 'groups'
        ? clamp(options.groupCount, 1, total)
        : Math.ceil(total / clamp(options.groupSize, 1, total));
    }

    function renderMeta() {
      const total = roster().length;
      const hasStudents = total > 0;
      empty.hidden = hasStudents;
      generateButton.disabled = !hasStudents || busy;
      shuffleButton.disabled = !groups.length || busy;
      copyAllButton.disabled = !groups.length;
      resetButton.disabled = !groups.length;

      if (!hasStudents) {
        meta.textContent = 'No pupils in this class yet.';
        return;
      }
      if (groups.length) {
        const sizes = groups.map((group) => group.members.length);
        const range = sizes.every((size) => size === sizes[0]) ? `${sizes[0]}` : `${Math.min(...sizes)}–${Math.max(...sizes)}`;
        meta.textContent = `${total} pupils · ${groups.length} groups of ${range}`;
        return;
      }
      const count = plannedCount(total);
      meta.textContent = `${total} pupils · will make ${count} group${count === 1 ? '' : 's'}`;
    }

    function renderGroups({ animate = false } = {}) {
      grid.replaceChildren(...groups.map((group, index) => {
        const card = el('article', { class: 'groupcard', role: 'listitem' }, [
          el('header', { class: 'groupcard__head' }, [
            // Groups saved before the icon set existed still hold an emoji.
            hasIcon(group.icon)
              ? el('span', { class: 'groupcard__icon', 'aria-hidden': 'true', html: icon(group.icon, 20) })
              : el('span', { class: 'groupcard__icon', 'aria-hidden': 'true', text: group.icon }),
            el('h3', { class: 'groupcard__title', text: group.title }),
            el('span', { class: 'groupcard__count', text: `${group.members.length}` }),
            el('button', {
              type: 'button', class: 'iconbtn', html: icon('copy'), 'aria-label': `Copy ${group.title}`,
              onClick: async () => {
                const ok = await copyText([group.title, ...group.members.map((member) => member.name)].join('\n'));
                toast(ok ? `${group.title} copied` : 'Copying was blocked by the browser');
              },
            }),
          ]),
          el('ol', { class: 'groupcard__list' },
            group.members.map((member) => el('li', { class: 'groupcard__member', text: member.name }))),
        ]);
        if (animate && !state.motionReduced) {
          card.classList.add('is-new');
          card.style.setProperty('--stagger', `${index * 70}ms`);
        }
        return card;
      }));
    }

    /* ---------- 3D flourish ---------- */
    const use3D = () => state.use3D && !threeFailed;

    function ensureReveal() {
      if (reveal || revealPending || !use3D()) return revealPending;
      revealPending = import('../three/groupReveal.js')
        .then(({ createReveal }) => createReveal({
          mount: stage,
          lowPerformance: state.settings.performance.lowPerformance,
        }))
        .then((created) => {
          revealPending = null;
          if (!element.isConnected) { created.dispose(); return null; }
          reveal = created;
          return reveal;
        })
        .catch((error) => {
          revealPending = null;
          threeFailed = true;
          console.warn('[groupMaker] 3D flourish unavailable, using CSS only', error);
          return null;
        });
      return revealPending;
    }

    function teardownReveal() {
      if (reveal) {
        reveal.dispose();
        reveal = null;
      }
    }

    /* ---------- generating ---------- */
    async function generate({ keepShape = false } = {}) {
      if (busy) return;
      const pool = roster();
      if (!pool.length) { renderMeta(); return; }

      const count = keepShape && groups.length ? groups.length : plannedCount(pool.length);
      const sizes = groupSizes(pool.length, count);
      const order = shuffle(pool);

      const icons = shuffle(ICONS);
      let cursor = 0;
      groups = sizes.map((size, index) => {
        const members = order.slice(cursor, cursor + size).map((student) => ({ id: student.id, name: student.name }));
        cursor += size;
        return {
          id: `group-${index + 1}`,
          title: `Group ${index + 1}`,
          icon: icons[index % icons.length],
          members,
        };
      });

      persist();
      busy = true;
      renderMeta();

      if (use3D()) {
        try {
          await ensureReveal();
          if (reveal) await reveal.play(groups.length);
        } catch (error) {
          console.warn('[groupMaker] flourish failed', error);
        }
      }

      busy = false;
      renderGroups({ animate: true });
      renderMeta();

      document.dispatchEvent(new CustomEvent('groupMaker:generated', {
        bubbles: true,
        detail: { groups: groups.map((group) => ({ title: group.title, members: group.members.map((m) => m.name) })) },
      }));
    }

    /* ---------- react to class and settings changes ---------- */
    const unsubscribe = state.subscribe((event) => {
      if (['classes', 'activeClass', 'replaced'].includes(event.type)) {
        groups = [];
        persist();
        renderGroups();
        renderMeta();
      } else if (event.type === 'performance') {
        if (!state.use3D) teardownReveal();
        renderMeta();
      }
    });

    renderControls();
    renderGroups();
    renderMeta();

    return {
      element,

      onActive(isActive) {
        if (!isActive && !busy) teardownReveal();
      },

      destroy() {
        unsubscribe();
        teardownReveal();
        if (revealPending) revealPending.then((created) => created && created.dispose()).catch(() => {});
      },
    };
  },
};
