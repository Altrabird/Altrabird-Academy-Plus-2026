/**
 * video.js — play a video on the board.
 *
 * Two ways in:
 *  - Paste a link: YouTube (any link form, or the bare video id), Vimeo, a
 *    Google Drive file, or a direct https link to a video file. The link is
 *    saved with the board, so the video is ready again after a reload. This
 *    needs the internet, like the Web page tool.
 *  - Choose a file from this computer. It plays as a local object URL and is
 *    never uploaded or copied into storage (a lesson video would blow the quota
 *    many times over), so after a reload the card asks for the file again.
 */

import { el, on, toast } from '../utils.js';
import { openModal } from '../ui/modal.js';
import { switchRow, section } from '../ui/forms.js';
import { icon } from '../ui/icons.js';

const DEFAULTS = { loop: false, muted: false, name: '', link: '' };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];
const FILE_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)$/i;
// Embedded players get scripts (they need them) but cannot reach this page.
const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';

/** "90", "1m30s", "1h2m3s" -> seconds. */
function seconds(value) {
  const text = String(value || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || !text) return 0;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}

/**
 * Turn whatever the teacher pasted into something playable, or null.
 * @returns {{ kind: 'youtube'|'vimeo'|'drive'|'file', id?: string, src: string, start?: number } | null}
 */
export function parseVideoLink(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return { kind: 'youtube', id: raw, start: 0, src: raw };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || YT_HOSTS.includes(host)) {
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    else if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    if (!YT_ID.test(id)) return null;
    const start = seconds(url.searchParams.get('t') || url.searchParams.get('start'));
    return { kind: 'youtube', id, start, src: raw };
  }

  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((part) => /^\d{5,12}$/.test(part));
    return id ? { kind: 'vimeo', id, src: raw } : null;
  }

  if (host === 'drive.google.com') {
    const index = parts.indexOf('d');
    const id = (index >= 0 && parts[index + 1]) || url.searchParams.get('id') || '';
    return /^[A-Za-z0-9_-]{10,}$/.test(id) ? { kind: 'drive', id, src: raw } : null;
  }

  if (url.protocol === 'https:' && FILE_EXT.test(url.pathname)) return { kind: 'file', src: url.href };
  return null;
}

/** The address the player frame loads, with the card's loop / mute settings. */
function embedUrl(video, { loop, muted }) {
  if (video.kind === 'youtube') {
    const params = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1' });
    if (video.start) params.set('start', String(video.start));
    if (loop) { params.set('loop', '1'); params.set('playlist', video.id); }
    if (muted) params.set('mute', '1');
    return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
  }
  if (video.kind === 'vimeo') {
    const params = new URLSearchParams();
    if (loop) params.set('loop', '1');
    if (muted) params.set('muted', '1');
    return `https://player.vimeo.com/video/${video.id}${params.toString() ? `?${params}` : ''}`;
  }
  if (video.kind === 'drive') return `https://drive.google.com/file/d/${video.id}/preview`;
  return '';
}

export default {
  id: 'video',
  title: 'Video',
  icon: 'video',
  size: 'lg',
  singleton: false,
  description: 'Play a YouTube, Vimeo or Drive link, or a video file from this computer.',

  create(ctx) {
    let options = { ...DEFAULTS, ...ctx.data.get(DEFAULTS) };
    // Saved links can come from an imported file, so they are checked again here.
    let video = parseVideoLink(options.link);
    if (!video) options.link = '';
    let objectUrl = '';
    let editing = false;

    const player = el('video', {
      class: 'w-video__player', controls: true, playsinline: true, preload: 'metadata',
    });
    const frame = el('iframe', {
      class: 'w-video__frame', title: 'Video player',
      sandbox: SANDBOX, referrerpolicy: 'strict-origin-when-cross-origin',
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true,
    });
    const fileInput = el('input', {
      type: 'file', accept: 'video/*', class: 'w-video__file', 'aria-label': 'Choose a video file',
    });

    const linkInput = el('input', {
      class: 'input w-video__link', type: 'url', inputmode: 'url', autocomplete: 'off',
      placeholder: 'Paste a YouTube, Vimeo or Google Drive link…',
      'aria-label': 'Video link', value: options.link,
    });
    const playButton = el('button', { type: 'button', class: 'btn btn--sm', text: 'Play video', onClick: () => playLink() });
    const error = el('p', { class: 'w-video__error', role: 'alert', hidden: true });

    const empty = el('div', { class: 'w-video__empty' }, [
      el('span', { class: 'w-video__mark', html: icon('video', 34), 'aria-hidden': 'true' }),
      linkInput,
      error,
      playButton,
      el('p', { class: 'w-video__or' }, [
        el('span', { text: 'or ' }),
        el('button', { type: 'button', class: 'linkbtn', text: 'choose a video from this computer', onClick: () => fileInput.click() }),
      ]),
      el('p', { class: 'w-video__note' }),
    ]);

    const stage = el('div', { class: 'w-video__stage' }, [player, frame, empty, fileInput]);

    const toolbar = el('div', { class: 'w-video__toolbar' }, [
      el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Change', onClick: () => { editing = true; render(); linkInput.focus(); } }),
      el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove', onClick: () => clear() }),
    ]);

    const element = el('div', { class: 'w-video' }, [stage, toolbar]);

    function persist() { ctx.data.set(options); }

    function releaseFile() {
      player.pause();
      player.removeAttribute('src');
      player.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
    }

    function stopFrame() {
      if (frame.getAttribute('src')) frame.removeAttribute('src');
    }

    function clear() {
      releaseFile();
      stopFrame();
      video = null;
      editing = false;
      linkInput.value = '';
      options = { ...options, name: '', link: '' };
      persist();
      render();
    }

    function playLink() {
      const parsed = parseVideoLink(linkInput.value);
      if (!parsed) {
        error.textContent = 'That link is not a video this card can play. Try a YouTube, Vimeo or Google Drive link.';
        error.hidden = false;
        return;
      }
      releaseFile();
      video = parsed;
      editing = false;
      options = { ...options, link: linkInput.value.trim(), name: '' };
      persist();
      render();
    }

    function loadFile(file) {
      if (!file || !file.type.startsWith('video/')) {
        toast('That file is not a video');
        return;
      }
      releaseFile();
      stopFrame();
      video = null;
      editing = false;
      objectUrl = URL.createObjectURL(file);
      player.src = objectUrl;
      options = { ...options, name: file.name || '', link: '' };
      persist();
      render();
    }

    on(linkInput, 'input', () => {
      error.hidden = true;
      playButton.disabled = !linkInput.value.trim();
    });
    on(linkInput, 'keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); playLink(); } });
    // A pasted link that is clearly a video starts straight away, like the original.
    on(linkInput, 'paste', () => setTimeout(() => { if (parseVideoLink(linkInput.value)) playLink(); }, 0));

    on(fileInput, 'change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) loadFile(file);
    });

    on(stage, 'dragover', (event) => { event.preventDefault(); stage.classList.add('is-dropping'); });
    on(stage, 'dragleave', () => stage.classList.remove('is-dropping'));
    on(stage, 'drop', (event) => {
      event.preventDefault();
      stage.classList.remove('is-dropping');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) { loadFile(file); return; }
      const text = event.dataTransfer && event.dataTransfer.getData('text/plain');
      if (text) { linkInput.value = text; playLink(); }
    });

    function render() {
      const showFile = Boolean(objectUrl) && !editing;
      const embed = video && !editing && video.kind !== 'file' ? embedUrl(video, options) : '';
      const direct = video && !editing && video.kind === 'file' ? video.src : '';

      player.hidden = !(showFile || direct);
      frame.hidden = !embed;
      empty.hidden = Boolean(showFile || embed || direct);
      toolbar.hidden = !empty.hidden;

      if (embed) { if (frame.getAttribute('src') !== embed) frame.src = embed; } else stopFrame();
      if (direct && player.getAttribute('src') !== direct) player.src = direct;
      if (!direct && !objectUrl && player.getAttribute('src')) releaseFile();

      player.loop = options.loop;
      player.muted = options.muted;
      element.classList.toggle('has-video', empty.hidden);
      playButton.disabled = !linkInput.value.trim();
      error.hidden = true;
      empty.querySelector('.w-video__note').textContent = options.name
        ? `“${options.name}” was a file from this computer — choose it again to play it.`
        : 'Links need the internet. Files play from this computer and are never uploaded.';
    }

    render();

    return {
      element,

      // A hidden or minimized card stops making sound.
      onActive(isActive) {
        if (isActive) return;
        player.pause();
        if (frame.getAttribute('src')) frame.src = frame.getAttribute('src');
      },

      openSettings() {
        openModal({
          title: 'Video',
          body: section('Playback', [
            switchRow({
              label: 'Loop', checked: options.loop,
              onChange: (loop) => { options = { ...options, loop }; persist(); render(); },
            }),
            switchRow({
              label: 'Start muted', checked: options.muted,
              onChange: (muted) => { options = { ...options, muted }; persist(); render(); },
            }),
            el('p', {
              class: 'callout',
              text: 'A pasted link is saved with the board and plays again after a reload (it needs the internet). A file from this computer is not stored, so it has to be chosen again after a reload.',
            }),
          ]),
          actions: [{ label: 'Done', variant: 'ghost' }],
        });
      },

      destroy() { releaseFile(); stopFrame(); },
    };
  },
};
