/**
 * scoreboard.js — team points, kept on the board.
 *
 * Teams can be renamed, added and removed; scores go up and down with big
 * buttons that work from across the room. The leader is marked with text as
 * well as colour.
 */

import { el, clamp, uid, toast } from '../utils.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { textField, segmented, section } from '../ui/forms.js';
import { icon } from '../ui/icons.js';

const MAX_TEAMS = 6;
const DEFAULTS = {
  step: 1,
  teams: [
    { id: 'team-1', name: 'Team 1', score: 0 },
    { id: 'team-2', name: 'Team 2', score: 0 },
  ],
};

export default {
  id: 'scoreboard',
  title: 'Scoreboard',
  icon: 'scoreboard',
  size: 'lg',
  singleton: false,
  description: 'Keep team points during a game.',

  create(ctx) {
    const saved = ctx.data.get(DEFAULTS);
    let teams = Array.isArray(saved.teams) && saved.teams.length
      ? saved.teams.map((team) => ({
        id: team.id || uid('team'),
        name: String(team.name || 'Team'),
        score: Number(team.score) || 0,
      }))
      : DEFAULTS.teams.map((team) => ({ ...team }));
    let step = [1, 5, 10].includes(Number(saved.step)) ? Number(saved.step) : 1;

    const board = el('div', { class: 'w-score__board', role: 'list' });

    const addButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: '+ Team',
      onClick: () => {
        if (teams.length >= MAX_TEAMS) { toast(`Up to ${MAX_TEAMS} teams`); return; }
        teams = [...teams, { id: uid('team'), name: `Team ${teams.length + 1}`, score: 0 }];
        persist();
        render();
      },
    });
    const resetButton = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', text: 'Reset scores',
      onClick: async () => {
        if (teams.every((team) => team.score === 0)) return;
        const ok = await confirmDialog({
          title: 'Reset every score?',
          message: 'All teams go back to zero. The teams themselves stay.',
          confirmLabel: 'Reset scores',
          danger: true,
        });
        if (!ok) return;
        teams = teams.map((team) => ({ ...team, score: 0 }));
        persist();
        render();
      },
    });

    const stepButtons = [1, 5, 10].map((value) => el('button', {
      type: 'button', class: 'chip-btn', text: `+${value}`,
      'aria-label': `Count in ${value}s`,
      onClick: () => { step = value; persist(); render(); },
    }));

    const element = el('div', { class: 'w-score' }, [
      board,
      el('div', { class: 'w-score__controls' }, [
        el('div', { class: 'w-score__steps', role: 'group', 'aria-label': 'Points per press' }, stepButtons),
        addButton,
        resetButton,
      ]),
    ]);

    function persist() {
      ctx.data.set({ teams, step });
    }

    function change(teamId, delta) {
      teams = teams.map((team) => (team.id === teamId
        ? { ...team, score: clamp(team.score + delta, -999, 999) }
        : team));
      persist();
      render();
    }

    function renameTeam(team) {
      let name = team.name;
      openModal({
        title: `Rename ${team.name}`,
        body: textField({ label: 'Team name', value: team.name, onInput: (value) => { name = value; } }),
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          {
            label: 'Save',
            onClick: () => {
              teams = teams.map((item) => (item.id === team.id
                ? { ...item, name: String(name).trim().slice(0, 24) || item.name }
                : item));
              persist();
              render();
            },
          },
        ],
      });
    }

    function render() {
      const best = Math.max(...teams.map((team) => team.score));
      const someoneAhead = teams.filter((team) => team.score === best).length === 1 && best > 0;

      board.replaceChildren(...teams.map((team) => {
        const leading = someoneAhead && team.score === best;
        return el('div', { class: `w-score__team${leading ? ' is-leading' : ''}`, role: 'listitem' }, [
          el('div', { class: 'w-score__head' }, [
            el('button', {
              type: 'button', class: 'w-score__name', text: team.name,
              'aria-label': `Rename ${team.name}`,
              onClick: () => renameTeam(team),
            }),
            leading ? el('span', { class: 'w-score__lead', text: 'Leading' }) : null,
            teams.length > 1 ? el('button', {
              type: 'button', class: 'iconbtn iconbtn--danger', html: icon('close'),
              'aria-label': `Remove ${team.name}`,
              onClick: () => {
                teams = teams.filter((item) => item.id !== team.id);
                persist();
                render();
              },
            }) : null,
          ]),
          el('p', { class: 'w-score__value', text: String(team.score) }),
          el('div', { class: 'w-score__buttons' }, [
            el('button', {
              type: 'button', class: 'btn btn--ghost w-score__step',
              text: `−${step}`, 'aria-label': `Take ${step} from ${team.name}`,
              onClick: () => change(team.id, -step),
            }),
            el('button', {
              type: 'button', class: 'btn w-score__step',
              text: `+${step}`, 'aria-label': `Give ${step} to ${team.name}`,
              onClick: () => change(team.id, step),
            }),
          ]),
        ]);
      }));

      stepButtons.forEach((button, index) => {
        const value = [1, 5, 10][index];
        button.classList.toggle('is-active', value === step);
        button.setAttribute('aria-pressed', String(value === step));
      });
      addButton.disabled = teams.length >= MAX_TEAMS;
      element.style.setProperty('--score-columns', String(Math.min(teams.length, 3)));
    }

    render();

    return {
      element,

      openSettings() {
        openModal({
          title: 'Scoreboard',
          body: section('Scoring', [
            segmented({
              label: 'Points per press',
              value: String(step),
              options: [1, 5, 10].map((value) => ({ value: String(value), label: `+${value}` })),
              onChange: (value) => { step = Number(value); persist(); render(); },
            }),
            el('p', { class: 'field__hint', text: 'Tap a team name on the card to rename it.' }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },
    };
  },
};
