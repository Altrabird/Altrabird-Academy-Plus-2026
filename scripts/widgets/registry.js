/**
 * registry.js — every tool the launcher can add to the board.
 *
 * Every tool in the launcher is real; `createPlaceholder` stays for anything
 * scheduled but not yet built.
 */

import timer from './timer.js';
import trafficLight from './trafficLight.js';
import workMode from './workMode.js';
import announcement from './announcement.js';
import clock from './clock.js';
import schedule from './schedule.js';
import randomPicker from './randomPicker.js';
import groupMaker from './groupMaker.js';
import celebration from './celebration.js';
import noiseMeter from './noiseMeter.js';
import textBox from './textBox.js';
import drawing from './drawing.js';
import image from './image.js';
import dice from './dice.js';
import stopwatch from './stopwatch.js';
import visualTimer from './visualTimer.js';
import countdown from './countdown.js';
import calendar from './calendar.js';
import scoreboard from './scoreboard.js';
import poll from './poll.js';
import hyperlink from './hyperlink.js';
import sticker from './sticker.js';
import qrCode from './qrCode.js';
import video from './video.js';
import pdf from './pdf.js';
import webcam from './webcam.js';
import embed from './embed.js';
import { createPlaceholder } from './placeholder.js';

const REAL = [timer, trafficLight, workMode, announcement, clock, schedule,
  randomPicker, groupMaker, celebration, noiseMeter, textBox, drawing, image,
  dice, stopwatch, visualTimer, countdown, calendar,
  scoreboard, poll, hyperlink, sticker, qrCode,
  video, pdf, webcam, embed];

const PLACEHOLDERS = [];

const byId = new Map([
  ...REAL.map((definition) => [definition.id, definition]),
  ...PLACEHOLDERS.map((spec) => [spec.id, createPlaceholder(spec)]),
]);

/** Launcher order, left to right. */
export const LAUNCHER_ORDER = [
  'timer', 'visualTimer', 'stopwatch', 'trafficLight', 'workMode', 'textBox', 'drawing',
  'image', 'announcement', 'noiseMeter', 'clock', 'calendar', 'countdown', 'schedule',
  'dice', 'qrCode', 'randomPicker', 'groupMaker', 'scoreboard', 'poll',
  'hyperlink', 'sticker', 'video', 'pdf', 'webcam', 'embed', 'celebration',
];

export const widgets = LAUNCHER_ORDER.map((id) => byId.get(id));

/** What the toolbar holds until the teacher changes it. The rest live in "More". */
export const DEFAULT_BAR = [
  'poll', 'randomPicker', 'noiseMeter', 'image', 'textBox',
  'workMode', 'trafficLight', 'schedule', 'timer', 'clock',
];
