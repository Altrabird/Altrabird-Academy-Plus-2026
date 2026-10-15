/**
 * settings.js — the application settings dialog.
 * Sections: Classes · Appearance · Performance · Timer · Data.
 * The Classes panel lives in classesPanel.js; Timer presets are edited on the
 * Timer widget itself.
 */

import { el, toast, downloadJSON, pickTextFile } from '../utils.js';
import { openModal, confirmDialog } from './modal.js';
import { switchRow, segmented, swatchPicker } from './forms.js';
import { state } from '../state.js';
import { classesSection } from './classesPanel.js';
import { storage } from '../storage.js';

const THEME_OPTIONS = [
  { value: 'lab', label: 'Science Lab', color: '#14b8a6' },
  { value: 'ocean', label: 'Ocean', color: '#38bdf8' },
  { value: 'forest', label: 'Forest', color: '#84cc16' },
  { value: 'space', label: 'Space', color: '#a78bfa' },
  { value: 'sunrise', label: 'Sunrise', color: '#fb923c' },
  { value: 'mecha', label: 'Mecha', color: '#38e1ff' },
];

const TABS = [
  { id: 'classes', label: 'Classes' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'performance', label: 'Performance' },
  { id: 'timer', label: 'Timer' },
  { id: 'data', label: 'Data' },
];

export function openSettings({ onReset } = {}) {
  let current = 'classes';
  const panel = el('div', { role: 'tabpanel', id: 'settingsPanel', 'aria-label': 'Settings' });

  const tabs = el('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
  const buttons = TABS.map((tab) => el('button', {
    type: 'button', class: 'segmented__opt', role: 'tab', text: tab.label,
    'aria-controls': 'settingsPanel',
    'aria-pressed': String(tab.id === current), 'aria-selected': String(tab.id === current),
    onClick: () => {
      current = tab.id;
      buttons.forEach((button, index) => {
        const selected = String(TABS[index].id === current);
        button.setAttribute('aria-pressed', selected);
        button.setAttribute('aria-selected', selected);
      });
      renderPanel();
    },
  }));
  tabs.append(...buttons);

  function renderPanel() {
    panel.replaceChildren(SECTIONS[current]({ onReset }));
  }
  renderPanel();

  return openModal({
    title: 'Settings',
    body: [tabs, panel],
    actions: [{ label: 'Done', variant: 'ghost' }],
    wide: true,
  });
}

const SECTIONS = {
  classes() {
    return classesSection();
  },

  timer() {
    const audio = state.settings.audio;
    const volumeLabel = el('span', { class: 'field__hint', text: `Volume: ${Math.round(audio.volume * 100)}%` });
    return el('div', { class: 'settings-section' }, [
      el('p', { class: 'callout', text: 'Presets (1, 2, 5, 10, 15 and 20 minutes) are built in; custom durations are saved from the Timer widget’s own settings. The sound settings below apply to the Timer.' }),
      switchRow({
        label: 'Enable sounds',
        hint: 'Timer alerts and celebration chimes.',
        checked: audio.enabled,
        onChange: (checked) => state.setAudio({ enabled: checked }),
      }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'volumeRange', text: 'Sound volume' }),
        volumeLabel,
        el('input', {
          class: 'input', id: 'volumeRange', type: 'range', min: '0', max: '100', step: '5',
          value: String(Math.round(audio.volume * 100)),
          onInput: (event) => {
            volumeLabel.textContent = `Volume: ${event.target.value}%`;
            state.setAudio({ volume: Number(event.target.value) / 100 });
          },
        }),
      ]),
    ]);
  },

  appearance() {
    const theme = state.theme;
    return el('div', { class: 'settings-section' }, [
      swatchPicker({
        label: 'Theme colour',
        value: theme.name,
        options: THEME_OPTIONS,
        onChange: (name) => state.setTheme({ name }),
      }),
      segmented({
        label: 'Brightness',
        hint: 'Dark reads well on most classroom projectors.',
        value: theme.scheme,
        options: [
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'auto', label: 'Match device' },
        ],
        onChange: (scheme) => state.setTheme({ scheme }),
      }),
      segmented({
        label: 'Text size',
        value: theme.textSize,
        options: [
          { value: 'md', label: 'Normal' },
          { value: 'lg', label: 'Large' },
          { value: 'xl', label: 'Extra large' },
        ],
        onChange: (textSize) => state.setTheme({ textSize }),
      }),
      switchRow({
        label: 'High contrast',
        hint: 'Stronger borders and flat backgrounds for bright rooms.',
        checked: theme.contrast === 'high',
        onChange: (checked) => state.setTheme({ contrast: checked ? 'high' : 'normal' }),
      }),
    ]);
  },

  performance() {
    const perf = state.settings.performance;
    const webgl = state.capabilities.webgl;
    return el('div', { class: 'settings-section' }, [
      switchRow({
        label: 'Enable 3D effects',
        hint: webgl
          ? 'Used by the Random Picker’s 3D carousel. Off means it uses the 2D name reel instead.'
          : 'This computer reports no WebGL support, so 3D stays off.',
        checked: perf.enable3D && webgl,
        disabled: !webgl,
        onChange: (checked) => state.setPerformance({ enable3D: checked }),
      }),
      switchRow({
        label: 'Reduce motion',
        hint: 'Replaces animations with instant changes. Also switches 3D off.',
        checked: perf.reduceMotion,
        onChange: (checked) => state.setPerformance({ reduceMotion: checked }),
      }),
      switchRow({
        label: 'Low-performance mode',
        hint: 'For older classroom PCs: no 3D, lighter effects.',
        checked: perf.lowPerformance,
        onChange: (checked) => state.setPerformance({ lowPerformance: checked }),
      }),
      el('p', {
        class: 'callout',
        text: `Detected: WebGL ${webgl ? 'available' : 'unavailable'} · 3D currently ${state.use3D ? 'on' : 'off'}.`,
      }),
    ]);
  },

  data({ onReset }) {
    const rows = [];

    if (!state.capabilities.storage) {
      rows.push(el('p', {
        class: 'callout callout--warn',
        text: 'This browser is blocking local storage, so classes, layout and settings will be forgotten when the tab closes. Everything still works for this lesson.',
      }));
    } else if (storage.corrupted) {
      rows.push(el('p', {
        class: 'callout callout--warn',
        text: 'Saved data could not be read and was replaced with a fresh copy. The unreadable copy was kept aside in browser storage.',
      }));
    }

    rows.push(
      el('p', { class: 'callout', text: 'Everything stays on this computer. Science Classroom has no account, no server and no analytics.' }),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--block', text: 'Export a backup file',
        onClick: () => {
          const stamp = new Date().toISOString().slice(0, 10);
          downloadJSON(`science-classroom-backup-${stamp}.json`, storage.exportDocument());
          toast('Backup downloaded');
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--block', text: 'Import a backup file',
        onClick: async () => {
          const text = await pickTextFile();
          if (!text) return;
          try {
            storage.importDocument(text);
            state.notifyReplaced();
            toast('Backup restored — reloading');
            setTimeout(() => window.location.reload(), 600);
          } catch (error) {
            console.error(error);
            toast(error && error.message ? error.message : 'That file could not be read', 6000);
          }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn--danger btn--block', text: 'Reset application data',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Reset everything?',
            message: 'Classes, widgets, layout and settings on this computer will be deleted. This cannot be undone.',
            confirmLabel: 'Delete everything',
            danger: true,
          });
          if (!ok) return;
          storage.reset();
          state.notifyReplaced();
          if (typeof onReset === 'function') onReset();
          setTimeout(() => window.location.reload(), 400);
        },
      }),
    );

    return el('div', { class: 'settings-section' }, rows);
  },
};
