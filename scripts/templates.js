/**
 * templates.js — ready-made screens for common lesson moments.
 *
 * Each template is a portable screen spec (see screenFromSpec in screens.js):
 * widget placements in percent of the 16:9 canvas plus the settings each widget
 * starts with. Adding one creates a new screen in the open deck; the teacher's
 * other screens are never touched.
 */

const MIN = 60 * 1000;
const timer = (minutes) => ({ durationMs: minutes * MIN, remainingMs: minutes * MIN, status: 'idle', endAt: 0 });

export const TEMPLATES = [
  {
    id: 'lesson-starter',
    name: 'Lesson starter',
    description: 'Welcome message, clock, timer, traffic light and the day’s lessons.',
    background: 'aurora',
    widgets: [
      { widgetId: 'announcement', x: 2, y: 3, w: 60, h: 30, data: { text: 'Welcome! Today we will learn…', sizeStep: 3, align: 'center' } },
      { widgetId: 'clock', x: 64, y: 3, w: 34, h: 30 },
      { widgetId: 'timer', x: 2, y: 37, w: 30, h: 42, data: timer(5) },
      { widgetId: 'trafficLight', x: 34, y: 37, w: 30, h: 58 },
      { widgetId: 'schedule', x: 66, y: 37, w: 32, h: 58 },
    ],
  },
  {
    id: 'silent-work',
    name: 'Silent work',
    description: 'Work mode on silent, a visual timer, the noise meter and what to do when finished.',
    background: 'chalkboard',
    widgets: [
      { widgetId: 'workMode', x: 2, y: 3, w: 46, h: 45, data: { active: 'silent' } },
      { widgetId: 'visualTimer', x: 50, y: 3, w: 30, h: 45, data: timer(10) },
      { widgetId: 'noiseMeter', x: 2, y: 52, w: 40, h: 44 },
      {
        widgetId: 'textBox', x: 44, y: 52, w: 54, h: 44,
        data: { text: 'When you finish:\n1. Check your work\n2. Read your book quietly', sizeStep: 2, align: 'left', colour: 'text', bold: true, plain: false },
      },
    ],
  },
  {
    id: 'group-activity',
    name: 'Group activity',
    description: 'Make groups, set the task and give them a time limit.',
    background: 'meadow',
    widgets: [
      { widgetId: 'groupMaker', x: 2, y: 3, w: 44, h: 64 },
      { widgetId: 'timer', x: 48, y: 3, w: 26, h: 40, data: timer(15) },
      { widgetId: 'workMode', x: 76, y: 3, w: 22, h: 40, data: { active: 'group' } },
      {
        widgetId: 'textBox', x: 48, y: 47, w: 50, h: 40,
        data: { text: 'Task:\nDiscuss and write your answers on the mahjong paper.', sizeStep: 2, align: 'left', colour: 'text', bold: true, plain: false },
      },
    ],
  },
  {
    id: 'quiz-time',
    name: 'Quiz time',
    description: 'Four-team scoreboard, random picker, a short timer and a poll.',
    background: 'space',
    widgets: [
      {
        widgetId: 'scoreboard', x: 2, y: 3, w: 40, h: 56,
        data: {
          step: 1,
          teams: [
            { id: 'team-1', name: 'Team 1', score: 0 }, { id: 'team-2', name: 'Team 2', score: 0 },
            { id: 'team-3', name: 'Team 3', score: 0 }, { id: 'team-4', name: 'Team 4', score: 0 },
          ],
        },
      },
      { widgetId: 'randomPicker', x: 44, y: 3, w: 34, h: 56 },
      { widgetId: 'timer', x: 80, y: 3, w: 18, h: 40, data: timer(1) },
      { widgetId: 'poll', x: 44, y: 62, w: 54, h: 35, data: { question: 'Which answer is correct?', showCounts: true, options: [
        { id: 'opt-1', label: 'A', votes: 0 }, { id: 'opt-2', label: 'B', votes: 0 },
        { id: 'opt-3', label: 'C', votes: 0 }, { id: 'opt-4', label: 'D', votes: 0 },
      ] } },
    ],
  },
  {
    id: 'science-experiment',
    name: 'Science experiment',
    description: 'Visualiser camera, stopwatch and the steps of the experiment.',
    background: 'lab',
    widgets: [
      { widgetId: 'webcam', x: 2, y: 3, w: 56, h: 72 },
      { widgetId: 'stopwatch', x: 60, y: 3, w: 38, h: 36 },
      {
        widgetId: 'textBox', x: 60, y: 42, w: 38, h: 54,
        data: { text: 'Steps:\n1. Predict\n2. Test\n3. Observe\n4. Record\n5. Conclude', sizeStep: 2, align: 'left', colour: 'text', bold: true, plain: false },
      },
    ],
  },
  {
    id: 'morning-routine',
    name: 'Morning routine',
    description: 'Clock, calendar, the day’s timetable, a notice and a countdown.',
    background: 'sunrise',
    widgets: [
      { widgetId: 'clock', x: 2, y: 3, w: 30, h: 30 },
      { widgetId: 'calendar', x: 2, y: 36, w: 30, h: 60 },
      { widgetId: 'schedule', x: 34, y: 3, w: 34, h: 93 },
      { widgetId: 'announcement', x: 70, y: 3, w: 28, h: 44, data: { text: 'Good morning!', sizeStep: 3, align: 'center' } },
      { widgetId: 'countdown', x: 70, y: 51, w: 28, h: 45 },
    ],
  },
  {
    id: 'exit-ticket',
    name: 'Exit ticket',
    description: 'A closing question, a QR code to your form and a quick confidence poll.',
    background: 'dusk',
    widgets: [
      { widgetId: 'announcement', x: 2, y: 3, w: 56, h: 30, data: { text: 'Exit ticket: what did you learn today?', sizeStep: 2, align: 'center' } },
      { widgetId: 'qrCode', x: 60, y: 3, w: 38, h: 60, data: { text: '', label: 'Scan to answer' } },
      { widgetId: 'poll', x: 2, y: 37, w: 56, h: 60, data: { question: 'How well did you understand today?', showCounts: true, options: [
        { id: 'opt-1', label: 'I can teach it', votes: 0 }, { id: 'opt-2', label: 'I understand', votes: 0 },
        { id: 'opt-3', label: 'Still unsure', votes: 0 },
      ] } },
      { widgetId: 'timer', x: 60, y: 66, w: 38, h: 31, data: timer(3) },
    ],
  },
  {
    id: 'brain-break',
    name: 'Brain break',
    description: 'Dice, a two-minute timer, a celebration and a big instruction.',
    background: 'candy',
    widgets: [
      { widgetId: 'dice', x: 2, y: 3, w: 30, h: 46 },
      { widgetId: 'timer', x: 34, y: 3, w: 30, h: 46, data: timer(2) },
      { widgetId: 'celebration', x: 66, y: 3, w: 32, h: 46 },
      {
        widgetId: 'textBox', x: 2, y: 53, w: 96, h: 43,
        data: { text: 'Stand up, stretch and roll the dice!', sizeStep: 4, align: 'center', colour: 'accent', bold: true, plain: true },
      },
    ],
  },
];
