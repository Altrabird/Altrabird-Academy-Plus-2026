/**
 * wallpapers.js — the backdrop behind the widgets of a screen.
 *
 * Built-in wallpapers are drawn with CSS gradients, so there are no image files
 * to ship and nothing to go stale offline. The teacher can also add their own
 * photos (kept in IndexedDB by photos.js, stored on the screen as "photo:<id>"),
 * and let a screen rotate through several backgrounds on a timer — the
 * carousel. A wallpaper belongs to a screen, so the starter screen and the
 * activity screen can look different. Widgets keep their solid surfaces, so the
 * backdrop never competes with the text a class has to read.
 */

import { el, on, toast } from './utils.js';
import { openModal, confirmDialog } from './ui/modal.js';
import { switchRow, segmented, section } from './ui/forms.js';
import { storage } from './storage.js';
import { state } from './state.js';
import { screens } from './screens.js';
import { photos } from './photos.js';
import { icon } from './ui/icons.js';

export const WALLPAPERS = [
  { id: 'none', name: 'Theme', hint: 'Plain background from the theme' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'meadow', name: 'Meadow' },
  { id: 'reef', name: 'Reef' },
  { id: 'sunrise', name: 'Sunrise' },
  { id: 'chalkboard', name: 'Chalkboard' },
  { id: 'graph', name: 'Graph paper' },
  { id: 'dots', name: 'Dots' },
  { id: 'lab', name: 'Lab bench' },
  { id: 'ocean', name: 'Deep ocean' },
  { id: 'forest', name: 'Rainforest' },
  { id: 'space', name: 'Night sky' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'notebook', name: 'Exercise book' },
  { id: 'cork', name: 'Cork board' },
  { id: 'songket', name: 'Songket' },
  { id: 'candy', name: 'Candy' },
  { id: 'flow', name: 'Colour flow', hint: 'Slowly drifting colours' },
  { id: 'waves', name: 'Waves', hint: 'Gently moving waves' },
  { id: 'starfield', name: 'Twinkle', hint: 'Twinkling stars' },
];

export const CAROUSEL_MINUTES = [1, 5, 10, 15, 30];
const isBuiltIn = (id) => WALLPAPERS.some((paper) => paper.id === id);
export const isPhoto = (id) => typeof id === 'string' && id.startsWith('photo:');
export const isKnownBackground = (id) => isBuiltIn(id) || isPhoto(id);

let carouselTimer = 0;
let carouselIndex = 0;
let paintToken = 0;

const rotating = (screen) => Boolean(screen && screen.carousel && screen.carousel.enabled
  && Array.isArray(screen.carousel.ids) && screen.carousel.ids.length > 1);

/** What a screen shows right now: its carousel's current slide, or its one background. */
function currentBackground(screen) {
  if (rotating(screen)) return screen.carousel.ids[carouselIndex % screen.carousel.ids.length];
  return (screen && screen.background) || 'none';
}

async function paint(canvas, id) {
  const token = (paintToken += 1);
  if (isPhoto(id)) {
    let url = null;
    try { url = await photos.url(id.slice(6)); } catch { url = null; }
    if (token !== paintToken) return;            // a newer paint won the race
    if (url) {
      canvas.style.setProperty('--photo', `url("${url}")`);
      canvas.dataset.wallpaper = 'photo';
      return;
    }
    id = 'none';                                  // the picture was deleted
  }
  canvas.style.removeProperty('--photo');
  canvas.dataset.wallpaper = isBuiltIn(id) ? id : 'none';
}

/** Paint the active screen's wallpaper onto the canvas and (re)start its carousel. */
export function applyWallpaper(canvas = document.getElementById('canvas')) {
  if (!canvas) return;
  clearInterval(carouselTimer);
  carouselTimer = 0;
  carouselIndex = 0;

  const screen = screens.active();
  paint(canvas, currentBackground(screen));

  if (rotating(screen)) {
    const minutes = CAROUSEL_MINUTES.includes(screen.carousel.minutes) ? screen.carousel.minutes : 5;
    carouselTimer = setInterval(() => advanceCarousel(canvas), minutes * 60 * 1000);
  }
}

/** Show the next slide of the active screen's carousel (also used by the tests). */
export function advanceCarousel(canvas = document.getElementById('canvas')) {
  carouselIndex += 1;
  paint(canvas, currentBackground(screens.active()));
}

function updateScreen(patch) {
  const list = screens.all();
  const screen = list.find((item) => item.id === screens.activeId());
  if (!screen) return null;
  Object.assign(screen, patch);
  storage.saveScreens(list);
  applyWallpaper();
  return screen;
}

export function setWallpaper(screenId, wallpaperId) {
  const list = screens.all();
  const screen = list.find((item) => item.id === screenId);
  if (!screen) return null;
  screen.background = isKnownBackground(wallpaperId) ? wallpaperId : 'none';
  storage.saveScreens(list);
  applyWallpaper();
  return screen.background;
}

/** The picker the teacher opens from the toolbar. */
export function openWallpaperPicker() {
  const screen = screens.active();
  const builtIn = el('div', { class: 'wallpapers', role: 'group', 'aria-label': 'Backgrounds' });
  const mine = el('div', { class: 'wallpapers', role: 'group', 'aria-label': 'Your pictures' });
  const carouselBox = el('div');
  const fileInput = el('input', {
    type: 'file', accept: 'image/*', class: 'w-image__file', id: 'photoBackgroundFile',
    'aria-label': 'Add a picture as a background',
  });
  let myPhotos = [];
  let photosAvailable = true;

  const carousel = () => screens.active().carousel || { enabled: false, minutes: 5, ids: [] };

  /** In carousel mode a tile toggles membership; otherwise it sets the background. */
  const tile = (id, name, swatch, extra = null) => {
    const inCarousel = carousel().enabled;
    const order = carousel().ids.indexOf(id);
    const selected = inCarousel ? order >= 0 : (screens.active().background || 'none') === id;
    return el('div', { class: 'wallpaper-cell' }, [
      el('button', {
        type: 'button',
        class: `wallpaper${selected ? ' is-active' : ''}`,
        'aria-pressed': String(selected),
        dataset: { background: id },
        title: inCarousel ? `Include ${name} in the carousel` : name,
        onClick: () => {
          if (inCarousel) {
            const ids = carousel().ids.slice();
            if (order >= 0) ids.splice(order, 1); else ids.push(id);
            updateScreen({ carousel: { ...carousel(), ids } });
          } else {
            setWallpaper(screens.activeId(), id);
          }
          render();
        },
      }, [
        swatch,
        el('span', { class: 'wallpaper__name', text: name }),
        inCarousel && order >= 0 ? el('span', { class: 'wallpaper__order', text: String(order + 1) }) : null,
      ]),
      extra,
    ]);
  };

  const render = () => {
    builtIn.replaceChildren(...WALLPAPERS.map((paper) => tile(
      paper.id, paper.name,
      el('span', { class: 'wallpaper__swatch', dataset: { wallpaper: paper.id }, 'aria-hidden': 'true' }),
    )));

    const photoTiles = myPhotos.map((photo) => {
      const swatch = el('span', { class: 'wallpaper__swatch wallpaper__swatch--photo', 'aria-hidden': 'true' });
      photos.url(photo.id).then((url) => { if (url) swatch.style.backgroundImage = `url("${url}")`; }).catch(() => {});
      return tile(`photo:${photo.id}`, photo.name, swatch, el('button', {
        type: 'button', class: 'iconbtn iconbtn--danger wallpaper__remove', html: icon('trash'),
        'aria-label': `Delete the picture ${photo.name}`,
        onClick: () => removePhoto(photo),
      }));
    });
    mine.replaceChildren(
      ...photoTiles,
      el('button', {
        type: 'button', class: 'wallpaper wallpaper--add', disabled: !photosAvailable,
        onClick: () => fileInput.click(),
      }, [
        el('span', { class: 'wallpaper__swatch wallpaper__swatch--add', html: icon('plus', 28), 'aria-hidden': 'true' }),
        el('span', { class: 'wallpaper__name', text: photosAvailable ? 'Add a picture' : 'Not available in this browser' }),
      ]),
    );

    const current = carousel();
    carouselBox.replaceChildren(
      switchRow({
        label: 'Rotate backgrounds (carousel)',
        hint: 'When on, tick the backgrounds to rotate through — they change on their own.',
        checked: current.enabled,
        onChange: (enabled) => {
          const ids = current.ids.length ? current.ids : [screens.active().background || 'none'];
          updateScreen({ carousel: { ...current, enabled, ids } });
          render();
        },
      }),
      current.enabled ? segmented({
        label: 'Change every',
        value: current.minutes,
        options: CAROUSEL_MINUTES.map((minutes) => ({ value: minutes, label: `${minutes} min` })),
        onChange: (minutes) => { updateScreen({ carousel: { ...carousel(), minutes } }); },
      }) : null,
      current.enabled && current.ids.length < 2
        ? el('p', { class: 'callout', text: 'Tick at least two backgrounds for the carousel to rotate.' })
        : null,
    );
  };

  async function loadPhotos() {
    try {
      myPhotos = await photos.list();
      photosAvailable = true;
    } catch {
      myPhotos = [];
      photosAvailable = false;
    }
    render();
  }

  async function removePhoto(photo) {
    const ok = await confirmDialog({
      title: `Delete ${photo.name}?`,
      message: 'The picture is removed from this browser. Screens using it go back to the theme background.',
      confirmLabel: 'Delete picture',
      danger: true,
    });
    if (!ok) return;
    await photos.remove(photo.id);
    const id = `photo:${photo.id}`;
    const list = screens.all();
    for (const item of list) {
      if (item.background === id) item.background = 'none';
      if (item.carousel && Array.isArray(item.carousel.ids)) item.carousel.ids = item.carousel.ids.filter((x) => x !== id);
    }
    storage.saveScreens(list);
    applyWallpaper();
    loadPhotos();
  }

  on(fileInput, 'change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const id = await photos.add(file);
      if (!carousel().enabled) setWallpaper(screens.activeId(), `photo:${id}`);
      toast('Picture added');
    } catch (error) {
      console.warn('[wallpapers] could not add picture', error);
      toast('That picture could not be added — try a JPEG or PNG.', 5000);
    }
    loadPhotos();
  });

  render();
  loadPhotos();

  openModal({
    title: `Background for ${screen.name}`,
    wide: true,
    body: [
      section('Backgrounds', [
        el('p', { class: 'field__hint', text: 'Each screen keeps its own background. These are drawn by the browser — nothing is downloaded.' }),
        builtIn,
      ]),
      section('Your pictures', [
        el('p', {
          class: 'field__hint',
          text: 'Pictures are shrunk and kept in this browser only — never uploaded. Export a screen or deck to take them to another computer.',
        }),
        mine,
        fileInput,
      ]),
      section('Carousel', carouselBox),
      state.settings.performance.lowPerformance
        ? el('p', { class: 'callout', text: 'Low-performance mode is on, so built-in backgrounds are drawn flat and do not move.' })
        : null,
    ],
    actions: [{ label: 'Done', variant: 'ghost' }],
  });
}
