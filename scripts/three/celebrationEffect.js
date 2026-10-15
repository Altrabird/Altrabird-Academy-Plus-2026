/**
 * celebrationEffect.js — the 3D confetti / stars / fireworks burst.
 *
 * Everything is instanced or point-based so each effect is one or two draw
 * calls: tiny shared geometry, flat MeshBasicMaterial / PointsMaterial, no
 * textures, no lights, no shadows, no post-processing. The render loop lives
 * only for the 2.6-3.2 s the effect lasts and `dispose()` frees everything.
 */

import { loadThree } from './loadThree.js';
import { randomInt } from '../random.js';

const PALETTE = [0x14b8a6, 0x38bdf8, 0xa78bfa, 0xfb923c, 0xf472b6, 0xfacc15, 0x4ade80];
const DURATIONS = { confetti: 3200, stars: 2800, fireworks: 3000 };

const rand = (min, max) => min + (Math.random() * (max - min));

/**
 * @param {{ canvas: HTMLCanvasElement, effect?: string, lowPerformance?: boolean }} options
 * @returns {Promise<{ done: Promise<void>, cancel: Function, dispose: Function }>}
 */
export async function runCelebration({ canvas, effect = 'confetti', lowPerformance = false }) {
  const THREE = await loadThree();

  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPerformance, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPerformance ? 1 : 1.5));
  renderer.setSize(width, height, false);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.z = 12;
  const viewHeight = 2 * Math.tan((50 * Math.PI) / 360) * camera.position.z;
  const viewWidth = viewHeight * (width / height);

  const scene = new THREE.Scene();
  const disposables = [];
  const items = [];          // per-instance simulation state
  let mesh = null;
  let points = [];           // firework point clouds
  const duration = DURATIONS[effect] || DURATIONS.confetti;
  const count = Math.round((effect === 'stars' ? 90 : 170) * (lowPerformance ? 0.45 : 1));

  const dummy = new THREE.Object3D();

  function buildInstanced(geometry, material) {
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    instanced.frustumCulled = false;
    scene.add(instanced);
    disposables.push(geometry, material);
    return instanced;
  }

  if (effect === 'confetti' || effect === 'stars') {
    const geometry = effect === 'confetti'
      ? new THREE.PlaneGeometry(0.26, 0.4)
      : new THREE.OctahedronGeometry(0.17, 0);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, opacity: 1, vertexColors: false,
    });
    mesh = buildInstanced(geometry, material);

    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      items.push(effect === 'confetti'
        ? {
          x: rand(-viewWidth / 2, viewWidth / 2),
          y: rand(viewHeight / 2, viewHeight * 1.4),
          z: rand(-2, 2),
          vy: rand(-4.4, -2.4),
          vx: rand(-0.7, 0.7),
          rx: rand(0, Math.PI), ry: rand(0, Math.PI),
          sx: rand(-3, 3), sy: rand(-3, 3),
          scale: rand(0.7, 1.25),
        }
        : {
          x: rand(-viewWidth / 2, viewWidth / 2),
          y: rand(-viewHeight / 2, viewHeight / 2),
          z: rand(-2, 2),
          vy: rand(0.8, 2.2),
          vx: rand(-0.25, 0.25),
          rx: rand(0, Math.PI), ry: rand(0, Math.PI),
          sx: rand(-1.6, 1.6), sy: rand(-1.6, 1.6),
          scale: rand(0.6, 1.3),
          phase: rand(0, Math.PI * 2),
        });
      color.setHex(PALETTE[randomInt(PALETTE.length)]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  } else {
    // Fireworks: three small point clouds, each expanding then fading.
    const perBurst = Math.round(90 * (lowPerformance ? 0.5 : 1));
    for (let b = 0; b < 3; b += 1) {
      const positions = new Float32Array(perBurst * 3);
      const velocities = [];
      const origin = {
        x: rand(-viewWidth * 0.3, viewWidth * 0.3),
        y: rand(-viewHeight * 0.1, viewHeight * 0.3),
      };
      for (let i = 0; i < perBurst; i += 1) {
        positions[i * 3] = origin.x;
        positions[i * 3 + 1] = origin.y;
        positions[i * 3 + 2] = 0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(rand(-1, 1));
        const speed = rand(2.2, 5.4);
        velocities.push({
          x: Math.sin(phi) * Math.cos(theta) * speed,
          y: Math.sin(phi) * Math.sin(theta) * speed,
          z: Math.cos(phi) * speed * 0.4,
        });
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: PALETTE[randomInt(PALETTE.length)],
        size: 0.22,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const cloud = new THREE.Points(geometry, material);
      cloud.frustumCulled = false;
      scene.add(cloud);
      disposables.push(geometry, material);
      points.push({ cloud, positions, velocities, delay: b * 620, material });
    }
  }

  let frameId = 0;
  let cancelled = false;
  let settle = () => {};
  const done = new Promise((resolve) => { settle = resolve; });
  const startedAt = performance.now();
  let last = startedAt;

  function step(now) {
    if (cancelled) return;
    const elapsed = now - startedAt;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = Math.min(1, elapsed / duration);

    if (mesh) {
      mesh.material.opacity = t > 0.72 ? Math.max(0, 1 - ((t - 0.72) / 0.28)) : 1;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        item.y += item.vy * dt;
        item.x += item.vx * dt;
        item.rx += item.sx * dt;
        item.ry += item.sy * dt;

        if (effect === 'confetti' && item.y < -viewHeight * 0.7) item.y = viewHeight * 0.7;
        const twinkle = effect === 'stars' ? 0.75 + (Math.sin((item.phase += dt * 4)) * 0.25) : 1;

        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(item.rx, item.ry, 0);
        dummy.scale.setScalar(item.scale * twinkle);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const burst of points) {
      const age = elapsed - burst.delay;
      if (age < 0) { burst.material.opacity = 0; continue; }
      const life = Math.min(1, age / 1400);
      burst.material.opacity = Math.max(0, 1 - life);
      const array = burst.positions;
      for (let i = 0; i < burst.velocities.length; i += 1) {
        const velocity = burst.velocities[i];
        array[i * 3] += velocity.x * dt;
        array[i * 3 + 1] += (velocity.y - (2.6 * life)) * dt;
        array[i * 3 + 2] += velocity.z * dt;
      }
      burst.cloud.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);

    if (t < 1) {
      frameId = requestAnimationFrame(step);
      return;
    }
    frameId = 0;
    renderer.clear();
    settle();
  }

  frameId = requestAnimationFrame(step);

  function cancel() {
    cancelled = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    settle();
  }

  function dispose() {
    cancel();
    if (mesh) scene.remove(mesh);
    for (const burst of points) scene.remove(burst.cloud);
    points = [];
    for (const item of disposables) item.dispose();
    disposables.length = 0;
    renderer.dispose();
    if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
  }

  return { done, cancel, dispose };
}

export const CELEBRATION_DURATIONS = DURATIONS;
