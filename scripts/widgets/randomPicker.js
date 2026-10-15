/**
 * randomPicker.js — picks a pupil at random from the active class.
 *
 * The winner is drawn FIRST, from the available pool, using crypto-quality
 * randomness. Only then is the animation told which card to land on, so no
 * visual detail can influence the draw.
 *
 * 3D (a Three.js carousel) is used only when Settings → Performance allows it
 * and WebGL exists; otherwise — and whenever Reduce Motion is on — the same
 * draw is presented with a CSS name reel. Both paths run on timers/rAF that
 * stop the moment the winner is shown.
 *
 * Fires `randomPicker:selected` on document with { studentId, studentName }.
 */

import { el, toast } from '../utils.js';
import { classManager } from '../classes.js';
import { state } from '../state.js';
import { randomInt, shuffle } from '../random.js';

const SPIN_MS = 3800;
const REEL_MS = 2600;
const MAX_CARDS = 18;
const MAX_CARDS_LOW = 10;

const DEFAULTS = { avoidRecent: true };

export default {
  id: 'randomPicker',
  title: 'Random Picker',
  icon: 'randomPicker',
  size: 'xl',   // the flagship widget: give the carousel room to be read across a room
  singleton: false,
  description: 'Pick a pupil at random from the active class.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };

    // Session-only state: never written to storage, never touches the register.
    const history = [];             // student ids already picked this session
    const removed = new Set();      // student ids taken out of the pool this session

    let wheel = null;               // Three.js carousel, created on demand
    let wheelPending = null;
    let threeFailed = false;
    let reelTimer = 0;
    let picking = false;
    let winner = null;

    /* ---------- DOM ---------- */
    const stage = el('div', { class: 'w-pick__stage' });
    const reelName = el('p', { class: 'w-pick__reel-name' });
    const reel = el('div', { class: 'w-pick__reel' }, [reelName]);
    const empty = el('p', { class: 'w-pick__empty', text: 'Add students to this class first.' });
    stage.append(reel, empty);

    const winnerName = el('p', { class: 'w-pick__winner-name' });
    const winnerBox = el('div', { class: 'w-pick__winner', role: 'status', 'aria-live': 'polite' }, [
      el('p', { class: 'w-pick__winner-label', text: 'Selected' }),
      winnerName,
    ]);

    const pickButton = el('button', { type: 'button', class: 'btn', text: 'Pick', onClick: () => pick() });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset history',
      title: 'Bring everyone back into the pool',
      onClick: () => {
        history.length = 0;
        removed.clear();
        winner = null;
        renderState();
        toast('Everyone is back in the pool');
      },
    });
    const removeButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove winner',
      title: 'Take this pupil out of the pool for this lesson only',
      onClick: () => {
        if (!winner) return;
        removed.add(winner.id);
        toast(`${winner.name} is out of the pool for now`);
        winner = null;
        renderState();
      },
    });

    const avoidInput = el('input', {
      type: 'checkbox', checked: options.avoidRecent,
      onChange: (event) => {
        options = { ...options, avoidRecent: event.target.checked };
        ctx.data.set(options);
        renderState();
      },
    });

    const meta = el('p', { class: 'w-pick__meta' });

    const element = el('div', { class: 'w-pick' }, [
      stage,
      winnerBox,
      el('div', { class: 'w-pick__controls' }, [pickButton, resetButton, removeButton]),
      el('div', { class: 'w-pick__footer' }, [
        el('label', { class: 'w-pick__option' }, [avoidInput, el('span', { text: 'Avoid recently selected pupils' })]),
        meta,
      ]),
    ]);

    /* ---------- pool ---------- */
    const roster = () => {
      const active = classManager.active();
      return active ? active.students.filter((student) => student.active) : [];
    };
    const usable = () => roster().filter((student) => !removed.has(student.id));
    const available = () => {
      const list = usable();
      if (!options.avoidRecent) return list;
      const fresh = list.filter((student) => !history.includes(student.id));
      return fresh.length ? fresh : list;
    };

    /* ---------- rendering ---------- */
    function renderState() {
      const all = roster();
      const pool = available();
      const hasStudents = all.length > 0;

      empty.hidden = hasStudents;
      reel.hidden = !hasStudents || use3D();
      element.classList.toggle('is-empty', !hasStudents);
      element.classList.toggle('has-winner', Boolean(winner));

      winnerName.textContent = winner ? winner.name : '';
      winnerBox.hidden = !winner;

      pickButton.textContent = winner ? 'Pick again' : 'Pick';
      pickButton.disabled = !hasStudents || picking || pool.length === 0;
      removeButton.disabled = !winner || picking;
      resetButton.disabled = picking || (!history.length && !removed.size);
      avoidInput.checked = options.avoidRecent;
      avoidInput.disabled = picking;

      const parts = [`${pool.length} of ${all.length} available`];
      if (history.length) parts.push(`${history.length} picked this session`);
      if (removed.size) parts.push(`${removed.size} set aside`);
      meta.textContent = hasStudents ? parts.join(' · ') : 'No pupils in this class yet.';

      if (!hasStudents) {
        reelName.textContent = '';
        teardownWheel();
      } else if (use3D()) {
        ensureWheel();
      } else {
        teardownWheel();
        if (!picking && !winner) reelName.textContent = 'Ready';
        else if (!picking && winner) reelName.textContent = winner.name;
      }
    }

    /* ---------- 3D lifecycle ---------- */
    const use3D = () => state.use3D && !threeFailed;

    function ensureWheel() {
      if (wheel || wheelPending || !use3D()) return wheelPending;
      wheelPending = import('../three/randomPickerWheel.js')
        .then(({ createWheel }) => createWheel({
          mount: stage,
          lowPerformance: state.settings.performance.lowPerformance,
        }))
        .then((created) => {
          wheelPending = null;
          if (!element.isConnected) {          // widget was removed while loading
            created.dispose();
            return null;
          }
          wheel = created;
          wheel.setCards(idleLabels());
          return wheel;
        })
        .catch((error) => {
          wheelPending = null;
          threeFailed = true;
          console.warn('[randomPicker] 3D unavailable, using the 2D reel', error);
          renderState();
          return null;
        });
      return wheelPending;
    }

    function teardownWheel() {
      if (wheel) {
        wheel.dispose();
        wheel = null;
      }
    }

    /** A calm set of names for the idle wheel. */
    function idleLabels() {
      const names = available().map((student) => student.name);
      const cap = state.settings.performance.lowPerformance ? MAX_CARDS_LOW : MAX_CARDS;
      return (names.length ? names : ['Ready']).slice(0, cap);
    }

    /**
     * Build the visible card set for one draw: the winner plus a sample of
     * other names, capped so a 100-pupil class never creates 100 meshes.
     * @returns {{ labels: string[], index: number }}
     */
    function buildCards(pool, chosen) {
      const cap = state.settings.performance.lowPerformance ? MAX_CARDS_LOW : MAX_CARDS;
      const others = pool.filter((student) => student.id !== chosen.id).map((student) => student.name);
      const labels = others.length <= cap - 1
        ? [...others, chosen.name]
        : [...shuffle(others).slice(0, cap - 1), chosen.name];
      const shuffled = shuffle(labels);
      return { labels: shuffled, index: shuffled.lastIndexOf(chosen.name) };
    }

    /* ---------- the 2D reel (fallback + Reduce Motion) ---------- */
    function runReel(pool, chosen) {
      return new Promise((resolve) => {
        clearTimeout(reelTimer);
        reel.hidden = false;

        if (state.motionReduced || pool.length < 2) {
          reelName.textContent = chosen.name;
          resolve();
          return;
        }

        const names = shuffle(pool.map((student) => student.name));
        const startedAt = performance.now();
        let index = 0;

        const step = () => {
          const t = (performance.now() - startedAt) / REEL_MS;
          if (t >= 1) {
            reelName.textContent = chosen.name;
            reel.classList.add('is-final');
            resolve();
            return;
          }
          reelName.textContent = names[index % names.length];
          index += 1;
          reel.classList.toggle('is-flip', index % 2 === 0);
          // Ease-out: steps get slower as the reel settles.
          reelTimer = setTimeout(step, 45 + (430 * (t ** 3)));
        };

        reel.classList.remove('is-final');
        step();
      });
    }

    /* ---------- picking ---------- */
    async function pick() {
      if (picking) return;

      const all = roster();
      if (!all.length) { renderState(); return; }

      let pool = available();
      if (!pool.length) { toast('Everyone is set aside — reset the history first'); return; }

      // If avoid-recent has exhausted the class, start the cycle again.
      if (options.avoidRecent && usable().every((student) => history.includes(student.id))) {
        history.length = 0;
        toast('Everyone has had a turn — starting again');
        pool = available();
      }

      // 1. Draw the winner. 2. Only then animate towards it.
      const chosen = pool[randomInt(pool.length)];

      picking = true;
      winner = null;
      renderState();

      try {
        if (use3D()) {
          await ensureWheel();
        }
        if (wheel && use3D()) {
          const { labels, index } = buildCards(pool, chosen);
          wheel.setCards(labels);
          reel.hidden = true;
          await wheel.spinTo(index, { duration: state.motionReduced ? 0 : SPIN_MS });
        } else {
          await runReel(pool, chosen);
        }
      } catch (error) {
        console.warn('[randomPicker] animation failed, showing the winner directly', error);
      }

      picking = false;
      winner = { id: chosen.id, name: chosen.name };
      history.push(chosen.id);
      renderState();

      document.dispatchEvent(new CustomEvent('randomPicker:selected', {
        bubbles: true,
        detail: { studentId: chosen.id, studentName: chosen.name },
      }));
    }

    /* ---------- react to class and settings changes ---------- */
    const unsubscribe = state.subscribe((event) => {
      if (['classes', 'activeClass', 'replaced'].includes(event.type)) {
        winner = null;
        history.length = 0;
        removed.clear();
        if (wheel) wheel.setCards(idleLabels());
        renderState();
      } else if (event.type === 'performance') {
        // Switching 3D or Reduce Motion swaps the presentation immediately.
        if (!state.use3D) teardownWheel();
        renderState();
      }
    });

    renderState();

    return {
      element,

      onActive(isActive) {
        if (isActive) {
          if (use3D()) ensureWheel();
          if (wheel) wheel.resize();
        } else if (!picking) {
          // Nothing renders while the card is hidden or minimized.
          teardownWheel();
        }
      },

      destroy() {
        clearTimeout(reelTimer);
        unsubscribe();
        teardownWheel();
        if (wheelPending) wheelPending.then((created) => created && created.dispose()).catch(() => {});
      },
    };
  },
};
