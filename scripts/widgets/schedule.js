/**
 * schedule.js — today's lessons, with the current one highlighted.
 *
 * The "now" highlight is refreshed on a wall-clock-aligned timeout (every 30s)
 * and stops when the widget is hidden or minimized — no animation loop.
 */

import { el, uid, pad2, toast } from '../utils.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { textField } from '../ui/forms.js';
import { icon } from '../ui/icons.js';

const REFRESH_MS = 30000;

const DEFAULTS = { lessons: [] };

/** "08:30" -> minutes since midnight, or null when unparseable. */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function sortLessons(lessons) {
  return lessons.slice().sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));
}

export default {
  id: 'schedule',
  title: 'Class Schedule',
  shortTitle: 'Schedule',
  icon: 'schedule',
  size: 'lg',
  singleton: false,
  description: "Today's lessons, with the current one highlighted.",

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let lessons = Array.isArray(saved.lessons) ? sortLessons(saved.lessons) : [];
    let refreshId = 0;

    const list = el('div', { class: 'w-sched__list', role: 'list' });
    const addButton = el('button', {
      type: 'button', class: 'btn btn--sm', text: '+ Add lesson',
      onClick: () => openLessonDialog(null),
    });
    const element = el('div', { class: 'w-sched' }, [
      list,
      el('div', { class: 'w-sched__actions' }, [addButton]),
    ]);

    function persist() {
      lessons = sortLessons(lessons);
      ctx.data.set({ lessons });
    }

    function currentLessonId(now = new Date()) {
      const minutes = (now.getHours() * 60) + now.getMinutes();
      const match = lessons.find((lesson) => {
        const start = toMinutes(lesson.start);
        const end = toMinutes(lesson.end);
        if (start === null || end === null) return false;
        return minutes >= start && minutes < end;
      });
      return match ? match.id : null;
    }

    function render() {
      const activeId = currentLessonId();

      if (!lessons.length) {
        list.replaceChildren(el('p', { class: 'w-sched__empty', text: 'No lessons yet. Add the first one below.' }));
        return;
      }

      list.replaceChildren(...lessons.map((lesson) => {
        const isNow = lesson.id === activeId;
        return el('div', {
          class: `w-sched__row${isNow ? ' is-now' : ''}`,
          role: 'listitem',
        }, [
          el('span', { class: 'w-sched__time' }, [
            el('strong', { text: lesson.start }),
            el('span', { class: 'w-sched__time-end', text: lesson.end }),
          ]),
          el('span', { class: 'w-sched__body' }, [
            el('span', { class: 'w-sched__subject', text: lesson.subject }),
            lesson.activity ? el('span', { class: 'w-sched__activity', text: lesson.activity }) : null,
          ]),
          isNow ? el('span', { class: 'w-sched__now', text: 'NOW' }) : null,
          el('span', { class: 'w-sched__tools' }, [
            el('button', {
              type: 'button', class: 'iconbtn', html: icon('sliders'),
              'aria-label': `Edit ${lesson.subject}`,
              onClick: () => openLessonDialog(lesson),
            }),
            el('button', {
              type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'),
              'aria-label': `Delete ${lesson.subject}`,
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Delete lesson?',
                  message: `${lesson.start}–${lesson.end} ${lesson.subject} will be removed from the schedule.`,
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (!ok) return;
                lessons = lessons.filter((item) => item.id !== lesson.id);
                persist();
                render();
              },
            }),
          ]),
        ]);
      }));
    }

    function openLessonDialog(existing) {
      const now = new Date();
      const draft = existing
        ? { ...existing }
        : {
          id: uid('lesson'),
          start: `${pad2(now.getHours())}:00`,
          end: `${pad2((now.getHours() + 1) % 24)}:00`,
          subject: '',
          activity: '',
        };

      const error = el('p', { class: 'callout callout--warn', hidden: true });

      openModal({
        title: existing ? 'Edit lesson' : 'Add lesson',
        body: [
          el('div', { class: 'w-sched__fields' }, [
            textField({ label: 'Start time', type: 'time', value: draft.start, onInput: (value) => { draft.start = value; } }),
            textField({ label: 'End time', type: 'time', value: draft.end, onInput: (value) => { draft.end = value; } }),
          ]),
          textField({ label: 'Subject', value: draft.subject, onInput: (value) => { draft.subject = value; } }),
          textField({
            label: 'Activity', hint: 'Optional — what the class will be doing.',
            value: draft.activity, onInput: (value) => { draft.activity = value; },
          }),
          error,
        ],
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: existing ? 'Save lesson' : 'Add lesson',
            onClick: () => {
              const start = toMinutes(draft.start);
              const end = toMinutes(draft.end);
              const problem = !draft.subject.trim()
                ? 'Please give the lesson a subject.'
                : (start === null || end === null)
                  ? 'Please enter both times as HH:MM.'
                  : (end <= start ? 'The end time must be after the start time.' : '');

              if (problem) {
                error.textContent = problem;
                error.hidden = false;
                return false;   // keep the dialog open
              }

              draft.subject = draft.subject.trim();
              draft.activity = draft.activity.trim();
              lessons = existing
                ? lessons.map((item) => (item.id === draft.id ? draft : item))
                : [...lessons, draft];
              persist();
              render();
              toast(existing ? 'Lesson updated' : 'Lesson added');
              return true;
            },
          },
        ],
      });
    }

    /** Re-highlight on the next half-minute boundary. */
    function schedule() {
      clearTimeout(refreshId);
      const wait = REFRESH_MS - (Date.now() % REFRESH_MS);
      refreshId = setTimeout(() => {
        render();
        schedule();
      }, wait + 20);
    }

    render();
    schedule();

    return {
      element,
      onActive(isActive) {
        if (isActive) { render(); schedule(); } else { clearTimeout(refreshId); refreshId = 0; }
      },
      destroy() { clearTimeout(refreshId); },
    };
  },
};
