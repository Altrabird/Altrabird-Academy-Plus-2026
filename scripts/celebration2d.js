/**
 * celebration2d.js — canvas confetti, stars and fireworks.
 *
 * Used whenever 3D is unavailable or switched off. One canvas, one short
 * requestAnimationFrame loop that ends by itself, and `cancel()` for an early
 * dismissal. Nothing is retained after the effect finishes.
 */

import { randomInt } from './random.js';

const COLORS = ['#14b8a6', '#38bdf8', '#a78bfa', '#fb923c', '#f472b6', '#facc15', '#4ade80'];

const rand = (min, max) => min + (Math.random() * (max - min));
const pickColor = () => COLORS[randomInt(COLORS.length)];

function fit(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

/* ---------------- effects ---------------- */

function confetti(width, height, count) {
  return Array.from({ length: count }, () => ({
    x: rand(0, width),
    y: rand(-height * 0.5, 0),
    vx: rand(-0.6, 0.6),
    vy: rand(1.8, 4.2),
    w: rand(6, 12),
    h: rand(9, 16),
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.14, 0.14),
    color: pickColor(),
  }));
}

function drawConfetti(ctx, pieces, t, height) {
  ctx.globalAlpha = t > 0.75 ? Math.max(0, 1 - ((t - 0.75) / 0.25)) : 1;
  for (const piece of pieces) {
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.vy += 0.035;
    piece.rot += piece.vr;
    if (piece.y > height + 20) piece.y = -20;

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rot);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function stars(width, height, count) {
  return Array.from({ length: count }, () => ({
    x: rand(0, width),
    y: rand(height * 0.2, height),
    vy: rand(-1.5, -0.5),
    size: rand(6, 18),
    twinkle: rand(0, Math.PI * 2),
    speed: rand(0.06, 0.16),
    color: pickColor(),
  }));
}

function drawStar(ctx, x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const px = x + (Math.cos(angle) * r);
    const py = y + (Math.sin(angle) * r);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStars(ctx, list, t) {
  const fade = t > 0.7 ? Math.max(0, 1 - ((t - 0.7) / 0.3)) : 1;
  for (const star of list) {
    star.y += star.vy;
    star.twinkle += star.speed;
    ctx.globalAlpha = fade * (0.55 + (Math.sin(star.twinkle) * 0.45));
    ctx.fillStyle = star.color;
    drawStar(ctx, star.x, star.y, star.size);
  }
  ctx.globalAlpha = 1;
}

function burst(width, height, count) {
  const cx = rand(width * 0.2, width * 0.8);
  const cy = rand(height * 0.18, height * 0.55);
  const color = pickColor();
  return {
    born: performance.now(),
    particles: Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(1.4, 4.4);
      return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color };
    }),
  };
}

function drawBursts(ctx, bursts, now) {
  for (const item of bursts) {
    const age = (now - item.born) / 1200;
    if (age > 1) continue;
    ctx.globalAlpha = Math.max(0, 1 - age);
    for (const particle of item.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.045;
      particle.vx *= 0.99;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------------- runner ---------------- */

const DURATIONS = { confetti: 3200, stars: 2800, fireworks: 3000 };

/**
 * Play one effect on a canvas.
 * @returns {{ done: Promise<void>, cancel: () => void }}
 */
export function run2D(canvas, effect = 'confetti', { lowPerformance = false } = {}) {
  const { ctx, width, height } = fit(canvas);
  const duration = DURATIONS[effect] || DURATIONS.confetti;
  const scale = lowPerformance ? 0.45 : 1;

  const pieces = effect === 'confetti' ? confetti(width, height, Math.round(150 * scale)) : [];
  const starList = effect === 'stars' ? stars(width, height, Math.round(60 * scale)) : [];
  const bursts = [];
  let nextBurst = 0;

  let frameId = 0;
  let cancelled = false;
  let settle = () => {};
  const done = new Promise((resolve) => { settle = resolve; });

  const startedAt = performance.now();

  const tick = (now) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startedAt) / duration);
    ctx.clearRect(0, 0, width, height);

    if (effect === 'confetti') drawConfetti(ctx, pieces, t, height);
    else if (effect === 'stars') drawStars(ctx, starList, t);
    else {
      if (now - startedAt >= nextBurst && nextBurst <= duration - 1000) {
        bursts.push(burst(width, height, Math.round(70 * scale)));
        nextBurst += 620;
      }
      drawBursts(ctx, bursts, now);
    }

    if (t < 1) {
      frameId = requestAnimationFrame(tick);
      return;
    }
    frameId = 0;
    ctx.clearRect(0, 0, width, height);
    settle();
  };

  frameId = requestAnimationFrame(tick);

  return {
    done,
    cancel() {
      cancelled = true;
      cancelAnimationFrame(frameId);
      frameId = 0;
      ctx.clearRect(0, 0, width, height);
      settle();
    },
  };
}

export const EFFECT_DURATIONS = DURATIONS;
