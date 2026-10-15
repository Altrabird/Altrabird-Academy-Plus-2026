/**
 * groupReveal.js — a short 3D flourish played once when groups are generated.
 *
 * One low-poly token per group (capped), flat MeshBasicMaterial, no lights and
 * no shadows. It renders for ~1.1 s and then stops completely: there is no
 * idle loop, and `dispose()` releases the renderer, geometry and materials.
 */

import { loadThree } from './loadThree.js';

const MAX_TOKENS = 8;
const DURATION = 1100;

function themeColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * @param {{ mount: HTMLElement, lowPerformance?: boolean }} options
 */
export async function createReveal({ mount, lowPerformance = false }) {
  const THREE = await loadThree();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 40);
  camera.position.set(0, 0, 9);

  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPerformance,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPerformance ? 1 : 1.5));
  renderer.domElement.classList.add('w-group__canvas');
  mount.append(renderer.domElement);

  // One shared low-poly shape for every token.
  const geometry = new THREE.IcosahedronGeometry(0.62, 0);
  const tokens = [];
  let frameId = 0;
  let disposed = false;

  function size() {
    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 200;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function clearTokens() {
    for (const token of tokens) {
      scene.remove(token.mesh);
      token.material.dispose();
    }
    tokens.length = 0;
  }

  function build(count) {
    clearTokens();
    const accent = new THREE.Color(themeColor('--accent', '#14b8a6'));
    const total = Math.max(1, Math.min(count, lowPerformance ? 4 : MAX_TOKENS));

    for (let i = 0; i < total; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: accent.clone().offsetHSL((i / total) * 0.16 - 0.08, 0, (i % 2) * 0.08),
        transparent: true,
        opacity: 0,
        wireframe: i % 2 === 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const angle = (i / total) * Math.PI * 2;
      tokens.push({
        mesh,
        material,
        angle,
        spin: 0.6 + ((i % 3) * 0.35),
      });
      scene.add(mesh);
    }
  }

  /**
   * Play the flourish once.
   * @returns {Promise<void>} resolves when the last frame has been drawn
   */
  function play(groupCount) {
    return new Promise((resolve) => {
      if (disposed) { resolve(); return; }
      size();
      build(groupCount);

      const startedAt = performance.now();
      const easeOut = (t) => 1 - ((1 - t) ** 3);

      const tick = (now) => {
        if (disposed) { resolve(); return; }
        const t = Math.min(1, (now - startedAt) / DURATION);
        const eased = easeOut(t);

        tokens.forEach((token, index) => {
          const spread = 4.6 * eased;
          token.mesh.position.set(
            Math.cos(token.angle) * spread,
            Math.sin(token.angle) * spread * 0.55,
            -index * 0.05,
          );
          token.mesh.rotation.x = eased * token.spin * 4;
          token.mesh.rotation.y = eased * token.spin * 5;
          const scale = 0.35 + (eased * 0.9);
          token.mesh.scale.setScalar(scale);
          // Fade up quickly, then out over the last 45%.
          token.material.opacity = t < 0.25 ? t / 0.25 : Math.max(0, 1 - ((t - 0.55) / 0.45));
        });

        renderer.render(scene, camera);

        if (t < 1) {
          frameId = requestAnimationFrame(tick);
          return;
        }
        frameId = 0;
        renderer.clear();          // leave nothing on screen; stop rendering
        resolve();
      };

      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(tick);
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    clearTokens();
    geometry.dispose();
    renderer.dispose();
    if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  size();
  return { play, dispose, get isDisposed() { return disposed; } };
}
