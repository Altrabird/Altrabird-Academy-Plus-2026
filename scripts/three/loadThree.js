/**
 * loadThree.js — loads Three.js on demand, once.
 *
 * The library is vendored in /vendor so the app works with no internet at all;
 * a CDN is tried only if the local copy is missing. Nothing here runs until a
 * 3D widget actually needs it, and a failure is reported to the caller so the
 * widget can fall back to its 2D path (spec §26).
 */

const SOURCES = [
  new URL('../../vendor/three.module.min.js', import.meta.url).href,
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js',
];

let pending = null;

export function loadThree() {
  if (pending) return pending;

  pending = (async () => {
    let lastError = null;
    for (const source of SOURCES) {
      try {
        return await import(source);
      } catch (error) {
        lastError = error;
        console.warn(`[three] could not load ${source}`, error);
      }
    }
    throw lastError || new Error('Three.js is unavailable');
  })();

  // A failed load must not poison later attempts (the CDN may come back).
  pending.catch(() => { pending = null; });
  return pending;
}
