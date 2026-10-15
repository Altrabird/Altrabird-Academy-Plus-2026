/**
 * classes.js — the class and student domain.
 *
 * Shape (spec §5 / Milestone 3):
 *   { id, name, students: [{ id, name, active }] }
 *
 * Every mutation goes through `state.saveClasses`, which persists via
 * StorageManager and notifies subscribers, so the top-bar selector and the
 * settings panel never drift apart. Nothing here touches localStorage directly.
 */

import { storage } from './storage.js';
import { state } from './state.js';
import { uid } from './utils.js';

const MAX_NAME = 60;

const cleanName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

function normalizeStudent(student) {
  return {
    id: student && student.id ? String(student.id) : uid('student'),
    name: cleanName(student && student.name) || 'Unnamed',
    active: student && student.active === false ? false : true,
  };
}

/** Repair anything odd that arrives from an old backup or hand-edited JSON. */
export function normalizeClass(item, index = 0) {
  return {
    id: item && item.id ? String(item.id) : uid('class'),
    name: cleanName(item && item.name) || `Class ${index + 1}`,
    students: Array.isArray(item && item.students) ? item.students.map(normalizeStudent) : [],
  };
}

export function normalizeClasses(list) {
  return Array.isArray(list) ? list.map(normalizeClass) : [];
}

function save(classes) {
  state.saveClasses(classes);
  return classes;
}

export const classManager = {
  /* ---------- reading ---------- */
  all() { return normalizeClasses(storage.loadClasses()); },

  get(classId) { return this.all().find((item) => item.id === classId) || null; },

  activeId() { return storage.loadActiveClassId(); },

  active() {
    const all = this.all();
    return all.find((item) => item.id === this.activeId()) || all[0] || null;
  },

  /** Student names of a class, in order. `onlyActive` skips students set aside. */
  names(classId, { onlyActive = false } = {}) {
    const found = this.get(classId);
    if (!found) return [];
    return found.students.filter((student) => !onlyActive || student.active).map((student) => student.name);
  },

  /* ---------- classes ---------- */
  create(name) {
    const classes = this.all();
    const item = normalizeClass({ name: cleanName(name) || `Class ${classes.length + 1}`, students: [] }, classes.length);
    classes.push(item);
    save(classes);
    if (classes.length === 1) this.select(item.id);
    return item;
  },

  rename(classId, name) {
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    if (!item) return null;
    item.name = cleanName(name) || item.name;
    save(classes);
    return item;
  },

  duplicate(classId) {
    const classes = this.all();
    const source = classes.find((entry) => entry.id === classId);
    if (!source) return null;

    const copy = {
      id: uid('class'),
      name: cleanName(`${source.name} (copy)`),
      students: source.students.map((student) => ({ ...student, id: uid('student') })),
    };
    classes.splice(classes.indexOf(source) + 1, 0, copy);
    save(classes);
    return copy;
  },

  remove(classId) {
    const classes = this.all().filter((item) => item.id !== classId);
    save(classes);
    if (this.activeId() === classId) {
      state.setActiveClass(classes.length ? classes[0].id : null);
    }
    return classes;
  },

  select(classId) {
    state.setActiveClass(classId);
    return classId;
  },

  /* ---------- students ---------- */
  addStudent(classId, name) {
    const clean = cleanName(name);
    if (!clean) return null;
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    if (!item) return null;

    const student = normalizeStudent({ name: clean });
    item.students.push(student);
    save(classes);
    return student;
  },

  renameStudent(classId, studentId, name) {
    const clean = cleanName(name);
    if (!clean) return null;
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    const student = item && item.students.find((entry) => entry.id === studentId);
    if (!student) return null;
    student.name = clean;
    save(classes);
    return student;
  },

  /** Set aside (or bring back) a student without deleting them. */
  setStudentActive(classId, studentId, active) {
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    const student = item && item.students.find((entry) => entry.id === studentId);
    if (!student) return null;
    student.active = Boolean(active);
    save(classes);
    return student;
  },

  removeStudent(classId, studentId) {
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    if (!item) return false;
    const before = item.students.length;
    item.students = item.students.filter((student) => student.id !== studentId);
    save(classes);
    return item.students.length < before;
  },

  /** Move one student to another class, keeping their name and active flag. */
  moveStudent(fromClassId, studentId, toClassId) {
    if (fromClassId === toClassId) return false;
    const classes = this.all();
    const from = classes.find((entry) => entry.id === fromClassId);
    const to = classes.find((entry) => entry.id === toClassId);
    if (!from || !to) return false;

    const student = from.students.find((entry) => entry.id === studentId);
    if (!student) return false;

    from.students = from.students.filter((entry) => entry.id !== studentId);
    to.students.push({ ...student, id: uid('student') });
    save(classes);
    return true;
  },

  clearStudents(classId) {
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    if (!item) return false;
    item.students = [];
    save(classes);
    return true;
  },

  /**
   * Bulk import, one name per line.
   * Whitespace is trimmed, empty lines ignored, and names that already exist in
   * the class (or repeat within the paste) are skipped so a double paste cannot
   * silently double the register.
   * @returns {{ added: string[], duplicates: string[], blank: number }}
   */
  importNames(classId, text) {
    const classes = this.all();
    const item = classes.find((entry) => entry.id === classId);
    if (!item) return { added: [], duplicates: [], blank: 0 };

    const lines = String(text ?? '').split(/\r?\n/);
    const seen = new Set(item.students.map((student) => student.name.toLowerCase()));
    const added = [];
    const duplicates = [];
    let blank = 0;

    for (const line of lines) {
      const name = cleanName(line);
      if (!name) {
        blank += 1;
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        duplicates.push(name);
        continue;
      }
      seen.add(key);
      item.students.push(normalizeStudent({ name }));
      added.push(name);
    }

    if (added.length) save(classes);
    return { added, duplicates, blank };
  },

  /* ---------- export ---------- */
  exportClass(classId) {
    const item = this.get(classId);
    if (!item) return null;
    return {
      app: 'Science Classroom',
      type: 'class',
      exportedAt: new Date().toISOString(),
      class: item,
    };
  },
};
