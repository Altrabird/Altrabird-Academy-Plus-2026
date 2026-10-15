/**
 * random.js — the app's only source of randomness.
 *
 * Uses crypto-quality bytes where available and rejection sampling so there is
 * no modulo bias, and a real Fisher-Yates shuffle (never `sort(() => Math.random() - 0.5)`,
 * which is biased and implementation-dependent).
 */

/** Uniform random integer in [0, max). */
export function randomInt(max) {
  if (max <= 1) return 0;
  const crypto = window.crypto || window.msCrypto;
  if (crypto && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;   // discard the biased tail
    let value;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % max;
  }
  return Math.floor(Math.random() * max);
}

/** Fisher-Yates. Returns a new array; the input is left alone. */
export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One random member of a list (undefined when empty). */
export const pickOne = (list) => (list.length ? list[randomInt(list.length)] : undefined);
