/**
 * classesPanel.js — Settings → Classes.
 *
 * Left column: the five (or however many) classes — select, rename, duplicate,
 * delete. Right column: the students of the active class — add, edit, move,
 * delete, set aside, bulk import, copy and export.
 *
 * The panel always reads fresh data from classManager and re-renders after its
 * own mutations, so it can never show a stale register.
 */

import { el, toast, downloadJSON, copyText } from '../utils.js';
import { openModal, confirmDialog } from './modal.js';
import { textField } from './forms.js';
import { icon } from './icons.js';
import { classManager } from '../classes.js';

export function classesSection() {
  const root = el('div', { class: 'classes' });

  function render() {
    const classes = classManager.all();
    const active = classManager.active();

    /* ---------------- classes column ---------------- */
    const list = el('div', { class: 'classes__list', role: 'list' });

    for (const item of classes) {
      const isActive = active && item.id === active.id;
      list.append(el('div', { class: `classrow${isActive ? ' is-active' : ''}`, role: 'listitem' }, [
        el('button', {
          type: 'button', class: 'classrow__pick', 'aria-pressed': String(Boolean(isActive)),
          'aria-label': `Use ${item.name} as the active class`,
          onClick: () => { classManager.select(item.id); render(); },
        }, [
          el('span', { class: 'classrow__name', text: item.name }),
          el('span', { class: 'classrow__meta', text: `${item.students.length} pupil${item.students.length === 1 ? '' : 's'}` }),
        ]),
        isActive ? el('span', { class: 'tile__soon', text: 'Active' }) : null,
        el('span', { class: 'classrow__tools' }, [
          el('button', {
            type: 'button', class: 'iconbtn', html: icon('pencil'), 'aria-label': `Rename ${item.name}`,
            onClick: () => renameClassDialog(item),
          }),
          el('button', {
            type: 'button', class: 'iconbtn', html: icon('copy'), 'aria-label': `Duplicate ${item.name}`,
            onClick: () => {
              const copy = classManager.duplicate(item.id);
              render();
              if (copy) toast(`Duplicated as ${copy.name}`);
            },
          }),
          el('button', {
            type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'), 'aria-label': `Delete ${item.name}`,
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Delete ${item.name}?`,
                message: `${item.name} and its ${item.students.length} pupil${item.students.length === 1 ? '' : 's'} will be removed from this computer. This cannot be undone.`,
                confirmLabel: 'Delete class',
                danger: true,
              });
              if (!ok) return;
              classManager.remove(item.id);
              render();
              toast(`${item.name} deleted`);
            },
          }),
        ]),
      ]));
    }

    if (!classes.length) {
      list.append(el('p', { class: 'field__hint', text: 'No classes yet. Add your first class below.' }));
    }

    const classesColumn = el('section', { class: 'classes__col' }, [
      el('div', { class: 'classes__head' }, [
        el('h3', { text: 'Classes' }),
        el('button', {
          type: 'button', class: 'btn btn--sm', text: '+ Add class',
          onClick: () => addClassDialog(),
        }),
      ]),
      list,
    ]);

    /* ---------------- students column ---------------- */
    const studentsColumn = el('section', { class: 'classes__col' });

    if (!active) {
      studentsColumn.append(el('p', { class: 'callout', text: 'Add a class to start building your register.' }));
      root.replaceChildren(classesColumn, studentsColumn);
      return;
    }

    const nameInput = el('input', {
      class: 'input', type: 'text', placeholder: 'Add a pupil…', 'aria-label': `Add a pupil to ${active.name}`,
    });
    const addStudent = () => {
      const student = classManager.addStudent(active.id, nameInput.value);
      if (!student) return;
      nameInput.value = '';
      render();
      const fresh = root.querySelector('.classes__add input');
      if (fresh) fresh.focus();
    };
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); addStudent(); }
    });

    const studentList = el('div', { class: 'classes__students', role: 'list' });

    for (const student of active.students) {
      studentList.append(el('div', {
        class: `studentrow${student.active ? '' : ' is-set-aside'}`, role: 'listitem',
      }, [
        el('label', { class: 'studentrow__toggle' }, [
          el('input', {
            type: 'checkbox', checked: student.active,
            'aria-label': `${student.name} takes part in picks`,
            onChange: (event) => {
              classManager.setStudentActive(active.id, student.id, event.target.checked);
              render();
            },
          }),
        ]),
        el('span', { class: 'studentrow__name', text: student.name }),
        !student.active ? el('span', { class: 'studentrow__flag', text: 'Set aside' }) : null,
        el('span', { class: 'studentrow__tools' }, [
          el('button', {
            type: 'button', class: 'iconbtn', html: icon('pencil'), 'aria-label': `Edit ${student.name}`,
            onClick: () => editStudentDialog(active, student),
          }),
          el('button', {
            type: 'button', class: 'iconbtn', html: icon('move'), 'aria-label': `Move ${student.name} to another class`,
            onClick: () => moveStudentDialog(active, student),
          }),
          el('button', {
            type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'), 'aria-label': `Delete ${student.name}`,
            onClick: () => {
              classManager.removeStudent(active.id, student.id);
              render();
            },
          }),
        ]),
      ]));
    }

    if (!active.students.length) {
      studentList.append(el('p', {
        class: 'field__hint',
        text: 'No pupils yet. Add them one at a time, or paste the whole register with Import names.',
      }));
    }

    studentsColumn.append(
      el('div', { class: 'classes__head' }, [
        el('h3', { text: active.name }),
        el('span', { class: 'classrow__meta', text: `${active.students.length} pupil${active.students.length === 1 ? '' : 's'}` }),
      ]),
      el('div', { class: 'classes__add' }, [
        nameInput,
        el('button', { type: 'button', class: 'btn btn--sm', text: 'Add', onClick: addStudent }),
      ]),
      studentList,
      el('div', { class: 'classes__actions' }, [
        el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Import names', onClick: () => importDialog(active) }),
        el('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', text: 'Copy names',
          onClick: async () => {
            const names = classManager.names(active.id);
            if (!names.length) { toast('There are no pupils to copy'); return; }
            const ok = await copyText(names.join('\n'));
            toast(ok ? `${names.length} names copied` : 'Copying was blocked by the browser');
          },
        }),
        el('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', text: 'Export JSON',
          onClick: () => {
            const payload = classManager.exportClass(active.id);
            if (!payload) return;
            const slug = active.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
            downloadJSON(`${slug}.json`, payload);
            toast(`${active.name} exported`);
          },
        }),
        el('button', {
          type: 'button', class: 'btn btn--danger btn--sm', text: 'Clear students',
          onClick: async () => {
            if (!active.students.length) { toast('There are no pupils to clear'); return; }
            const ok = await confirmDialog({
              title: `Clear every pupil in ${active.name}?`,
              message: `All ${active.students.length} pupils will be removed from ${active.name}. The class itself stays. This cannot be undone.`,
              confirmLabel: 'Clear students',
              danger: true,
            });
            if (!ok) return;
            classManager.clearStudents(active.id);
            render();
            toast('Student list cleared');
          },
        }),
      ]),
    );

    root.replaceChildren(classesColumn, studentsColumn);
  }

  /* ---------------- dialogs ---------------- */

  function addClassDialog() {
    let name = '';
    openModal({
      title: 'Add class',
      body: textField({
        label: 'Class name', placeholder: 'e.g. 2 Bestari',
        onInput: (value) => { name = value; },
      }),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Add class',
          onClick: () => {
            const created = classManager.create(name);
            render();
            toast(`${created.name} added`);
          },
        },
      ],
    });
  }

  function renameClassDialog(item) {
    let name = item.name;
    openModal({
      title: `Rename ${item.name}`,
      body: textField({ label: 'Class name', value: item.name, onInput: (value) => { name = value; } }),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Save name', onClick: () => { classManager.rename(item.id, name); render(); } },
      ],
    });
  }

  function editStudentDialog(classItem, student) {
    let name = student.name;
    openModal({
      title: 'Edit pupil',
      body: textField({ label: 'Name', value: student.name, onInput: (value) => { name = value; } }),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Save', onClick: () => { classManager.renameStudent(classItem.id, student.id, name); render(); } },
      ],
    });
  }

  function moveStudentDialog(classItem, student) {
    const others = classManager.all().filter((item) => item.id !== classItem.id);
    if (!others.length) {
      toast('There is no other class to move them to');
      return;
    }
    let target = others[0].id;
    const select = el('select', {
      class: 'select', 'aria-label': 'Move to class',
      onChange: (event) => { target = event.target.value; },
    }, others.map((item) => el('option', { value: item.id }, item.name)));

    openModal({
      title: `Move ${student.name}`,
      body: el('div', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Move to class' }),
        select,
      ]),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Move pupil',
          onClick: () => {
            const moved = classManager.moveStudent(classItem.id, student.id, target);
            render();
            if (moved) {
              const to = classManager.get(target);
              toast(`${student.name} moved to ${to ? to.name : 'the other class'}`);
            }
          },
        },
      ],
    });
  }

  function importDialog(classItem) {
    const area = el('textarea', {
      class: 'textarea', rows: '10',
      'aria-label': 'Student names, one per line',
      placeholder: 'Ali\nAbu\nSiti\nMei Ling\nKumar',
    });
    const summary = el('p', { class: 'callout', hidden: true });

    openModal({
      title: `Import pupils into ${classItem.name}`,
      body: [
        el('p', { class: 'field__hint', text: 'Paste student names here, one student per line.' }),
        area,
        el('p', {
          class: 'field__hint',
          text: 'Blank lines are ignored and names already in this class are skipped, so pasting twice will not duplicate the register.',
        }),
        summary,
      ],
      actions: [
        { label: 'Close', variant: 'ghost' },
        {
          label: 'Import names',
          close: false,
          onClick: () => {
            const result = classManager.importNames(classItem.id, area.value);
            render();

            if (!result.added.length && !result.duplicates.length) {
              summary.textContent = 'Nothing to import — paste one name per line first.';
              summary.hidden = false;
              return false;
            }

            const parts = [`${result.added.length} added`];
            if (result.duplicates.length) parts.push(`${result.duplicates.length} skipped as duplicates`);
            if (result.blank) parts.push(`${result.blank} blank line${result.blank === 1 ? '' : 's'} ignored`);
            summary.textContent = parts.join(' · ');
            summary.hidden = false;
            area.value = '';
            toast(`${result.added.length} pupils imported`);
            return false;
          },
        },
      ],
    });
  }

  render();
  return root;
}
