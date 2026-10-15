/**
 * randomPickerWheel.js — the 3D carousel behind the Random Picker.
 *
 * Deliberately cheap: one shared PlaneGeometry, one MeshBasicMaterial per card
 * (so no lights, no shadows, no post-processing), small canvas textures, and a
 * render loop that exists ONLY while the wheel is spinning. Everything is
 * disposed on `dispose()`.
 *
 * The winner is decided by the caller; this module is told which card index to
 * land on, so the animation can never influence the draw.
 */

import { loadThree } from './loadThree.js';

const CARD_W = 2.9;
const CARD_H = 0.98;
const TEX_W = 512;
const TEX_H = 170;

/** Read a CSS custom property so the wheel follows the app theme. */
function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw one name onto a small canvas used as the card texture. */
function drawCard(name, colors) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, TEX_W, TEX_H);
  ctx.fillStyle = colors.surface;
  roundedRect(ctx, 6, 6, TEX_W - 12, TEX_H - 12, 26);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  let size = 62;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.text;
  do {
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
    size -= 4;
  } while (ctx.measureText(name).width > TEX_W - 60 && size > 22);

  ctx.fillText(name, TEX_W / 2, TEX_H / 2 + 2);
  return canvas;
}

/**
 * @param {{ mount: HTMLElement, lowPerformance?: boolean }} options
 */
export async function createWheel({ mount, lowPerformance = false }) {
  const THREE = await loadThree();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  const baseZ = 7.4;
  camera.position.set(0, 0.4, baseZ);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPerformance,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPerformance ? 1 : 1.5));
  renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 220, false);
  renderer.domElement.classList.add('w-pick__canvas');
  mount.append(renderer.domElement);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
  let cards = [];          // { mesh, material, texture }
  let frameId = 0;
  let disposed = false;
  let radius = 4;

  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function clearCards() {
    for (const card of cards) {
      group.remove(card.mesh);
      card.texture.dispose();
      card.material.dispose();
    }
    cards = [];
  }

  /** Build the carousel from a list of labels (the caller caps how many). */
  function setCards(labels) {
    clearCards();
    const colors = {
      surface: themeColor('--surface-2', '#1a2540'),
      border: themeColor('--border-strong', 'rgba(255,255,255,.2)'),
      text: themeColor('--text', '#f2f6fb'),
    };

    const count = Math.max(labels.length, 1);
    // Keep the cards from overlapping however many there are.
    radius = Math.max(3.2, (count * CARD_W) / (2 * Math.PI) + 0.6);
    camera.position.z = baseZ + Math.max(0, radius - 4) * 1.15;

    labels.forEach((label, index) => {
      const texture = new THREE.CanvasTexture(drawCard(label, colors));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 1;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      material.color.setHex(0x8fa0ba);

      const mesh = new THREE.Mesh(geometry, material);
      const angle = (index / count) * Math.PI * 2;
      mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      mesh.rotation.y = angle;
      group.add(mesh);
      cards.push({ mesh, material, texture });
    });

    group.rotation.y = 0;
    highlight(-1);
    render();
  }

  /** Bring one card forward visually; -1 clears every highlight. */
  function highlight(index) {
    cards.forEach((card, i) => {
      const on = i === index;
      card.material.color.setHex(on ? 0xffffff : 0x8fa0ba);
      card.mesh.scale.setScalar(on ? 1.14 : 1);
      card.mesh.position.y = on ? 0.06 : 0;
    });
  }

  const easeOutQuart = (t) => 1 - ((1 - t) ** 4);

  /**
   * Spin so that `index` ends up facing the camera.
   * @returns {Promise<void>} resolves when the wheel has stopped
   */
  function spinTo(index, { duration = 3800, spins = 4 } = {}) {
    return new Promise((resolve) => {
      if (disposed || !cards.length) { resolve(); return; }

      const step = (Math.PI * 2) / cards.length;
      const start = group.rotation.y;
      // Land exactly on the card, after a few whole turns.
      const landing = -index * step;
      const turns = Math.PI * 2 * spins;
      const target = landing - turns + (((start - landing) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      const startedAt = performance.now();
      highlight(-1);

      const tick = (now) => {
        if (disposed) { resolve(); return; }
        const t = Math.min(1, (now - startedAt) / duration);
        const eased = easeOutQuart(t);
        group.rotation.y = start + (target - start) * eased;

        // A small push-in over the last quarter of the spin.
        const zoom = t > 0.75 ? (t - 0.75) / 0.25 : 0;
        camera.position.z = (baseZ + Math.max(0, radius - 4) * 1.15) * (1 - 0.11 * easeOutQuart(zoom));

        render();

        if (t < 1) {
          frameId = requestAnimationFrame(tick);
          return;
        }
        // Settle exactly, highlight, draw one last frame, then stop rendering.
        frameId = 0;
        group.rotation.y = landing;
        highlight(index);
        render();
        resolve();
      };

      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(tick);
    });
  }

  /** Abort an in-flight spin and settle immediately on `index`. */
  function settle(index) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    if (!cards.length) return;
    group.rotation.y = -index * ((Math.PI * 2) / cards.length);
    highlight(index);
    render();
  }

  function resize() {
    if (disposed) return;
    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 220;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  // Resizing inside the observer callback can re-trigger layout in the same
  // frame ("ResizeObserver loop" warning), so the work is deferred one frame.
  let resizeQueued = false;
  const observer = new ResizeObserver(() => {
    if (resizeQueued || disposed) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  });
  observer.observe(mount);
  resize();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    observer.disconnect();
    clearCards();
    geometry.dispose();
    renderer.dispose();
    if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return { setCards, spinTo, settle, highlight, resize, render, dispose, get isDisposed() { return disposed; } };
}
