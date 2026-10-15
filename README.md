# Science Classroom — Interactive Classroom Display

A fullscreen classroom board for a primary-school teacher: **27 tools** — timers, traffic light,
work mode, text and drawing, pictures, clock and calendar, random name picker, group maker,
scoreboard, poll, QR codes, celebrations and a noise meter — all on one projector-friendly screen.
Boards are organised into decks and folders, start from ready-made templates, travel between
computers as files, and can be drawn on with the annotation bar.

Everything runs locally in the browser. **No login, no backend, no database, no analytics, no cloud
sync, no accounts.** Open the page and start teaching.

---

## Features

| Tool | What it does |
|---|---|
| **Timer** | Start / Pause / Reset / +30 sec / +1 min · presets 1–20 min plus custom durations you can save · amber warning at 10 s · **TIME'S UP!** with a sound · keeps time from the wall clock, so it stays accurate through rendering delays and page reloads |
| **Traffic Light** | Red / yellow / green with editable titles and subtitles (SILENT WORK · GET READY · DISCUSSION) |
| **Work Mode** | Silent / pair / group work, chosen from three cards, with editable labels and instructions |
| **Announcement** | One large message, five font sizes, three alignments |
| **Clock & Date** | HH:MM with optional seconds, weekday and date; 12- or 24-hour |
| **Class Schedule** | Add / edit / delete lessons (start, end, subject, activity); the current lesson is highlighted |
| **Random Picker** | Picks a pupil from the active class on a 3D carousel (2D name reel when 3D is off) · avoid-recent, reset history, remove winner |
| **Group Maker** | Splits the class by number of groups or pupils per group, with a fair remainder (25 in 4 → 6, 6, 6, 7) |
| **Celebration** | Confetti, stars or fireworks with a message — by hand, or automatically when a timer finishes or a pupil is picked |
| **Noise Meter** | Microphone loudness measured locally, with a configurable threshold and QUIET / OK / LOUD / TOO LOUD |
| **Text** | A text box you can place anywhere: five sizes, alignment, colour, bold, and a "no card" mode that writes straight onto the board |
| **Image** | Show a picture from this computer — choose a file, paste one, or drop it on the card. Pictures are shrunk locally to fit the browser's storage and **never uploaded**; a description field keeps them accessible |
| **Drawing** | A small whiteboard: five pen colours, three widths, eraser, undo, clear — strokes are stored as fractions of the card, so they keep their shape when you resize it |
| **Visual Timer** | The same countdown as a shrinking pie, for pupils who cannot yet read a clock face |
| **Stopwatch** | Counts up, with laps you can list and copy |
| **Event Countdown** | Days until a date you set — the holidays, the science fair, sports day |
| **Calendar** | A Monday-first month grid with today marked; pages forwards and back |
| **Dice** | One to five dice, d6 / d10 / d12 / d20, with a total. The result is decided before the roll animation, so the animation can never bias it |
| **Scoreboard** | Teams with points, counting in 1s, 5s or 10s; the leader is named in words, not only coloured |
| **Poll** | A hands-up tally with bars and percentages; options can be renamed |
| **Link** | One big button to a website, opened in a new tab so the board stays put. `https://` only |
| **QR Code** | Turns a link into a QR code the class can scan. Generated on this computer — the encoder is vendored, so it works with no internet |
| **Sticker** | Ten shapes in five colours, with or without a card, for marking up the board |
| **Video** | Paste a YouTube link (any form, or just the video id — `?t=` start times work), a Vimeo or Google Drive link, or a direct `.mp4` link, and it plays right in the card. The link is saved, so it is ready again after a reload (needs the internet). Or choose a video file from this computer — not uploaded and not stored, so it is chosen again after a reload |
| **PDF** | Opens a PDF from this computer in the browser's own viewer. Also session-only |
| **Camera** | A live picture from a webcam — a visualiser for showing a book or an experiment. Video only: **no audio track is ever requested**, and nothing is recorded |
| **Web page** | Embeds a site in a sandboxed frame. The only tool that needs the internet |
| **Classes** | Five classes out of the box: rename, duplicate, delete, bulk-import names, move pupils, export JSON, copy names |

### Library and board extras

| Feature | What it does |
|---|---|
| **Decks & folders** | **Library → My decks**: keep a deck of screens per lesson, subject or class, and sort decks into folders. Open, rename, duplicate, move or delete a deck. Removing a folder keeps its decks |
| **Templates** | **Library → Templates**: eight ready-made screens (lesson starter, silent work, group activity, quiz time, science experiment, morning routine, exit ticket, brain break), added as a new screen in the open deck |
| **Recently deleted** | Deleted screens and decks wait in **Library → Recently deleted** for 30 days, with their widget settings, and can be restored. After 30 days they go for good |
| **Save / open files** | Save one screen (Screens menu, download icon) or a whole deck (Library) to a `.json` file — widgets, their settings, background, carousel, ink and your own pictures included — and open it on another computer with **Open a file**. Files are checked before use: unknown tools are dropped, positions clamped, only embedded pictures accepted |
| **Your own backgrounds** | **Background → Your pictures**: add a photo from this computer. It is shrunk to projector size and kept in this browser (IndexedDB), never uploaded |
| **Background carousel** | **Background → Carousel**: tick several backgrounds and the screen rotates through them every 1, 5, 10, 15 or 30 minutes |
| **Widget colours & fonts** | The palette button on any widget gives it its own colour (ten, including paper, ink and glass) and font (rounded, serif, typewriter, handwriting). Apply it to every widget on the screen, or make it the default for new widgets |
| **Annotate** | Draw straight over the whole board — seven colours, three widths, highlighter, eraser, undo and clear. Ink belongs to each screen and stays when the bar is closed, while clicks go through to the widgets. Also available in Presentation Mode; `Esc` closes the bar |

### The board

The layout follows the simple look of a classroom-screen app: **the board is the whole window**. The
Library button sits in the top-left corner; the class, Presentation Mode and Settings in the top-right;
one **dock** of tools at the bottom (icon over a short name) with Annotate on its left; and the screen
pager (`‹ 1/2 › +`) plus Clear screen in the bottom-right corner.

**Full screen** (the ⤢ button, top right) keeps the dock and the pager, so tools can still be picked,
moved and closed; only the top corners give way to a clock and the exit button. In-card editing
controls (Edit, Add lesson, Change…) step aside on the projector and come back on the card you click.
The button at the right end of the dock tucks it away into one small button for a clean screen.

**Phones** (any screen under 700px wide or 520px tall, standing up or lying down): a free board of
percentages cannot fit a phone, so the cards become a scrolling list — one column standing up, two or
three side by side lying down — in the board's reading order (top-to-bottom, left-to-right). Each card
carries its own slim bar with finger-sized buttons (narrow cards keep minimize, settings, spotlight and
close so the name stays readable). The dock spans the bottom and scrolls sideways; lying down it shows
icons only. Dialogs use the whole phone, and notches and home bars are kept clear. Nothing saved
changes, so the same board still lands in place on the projector. Tablets keep the free board.

* **Plain cards** — a widget is just its content. Click a card to select it; while the pointer is on the
  selected card its tools appear in a small bar above it (move, minimize, settings, colour, spotlight,
  hide, remove) and a round handle appears at the corner for resizing. Moving away or clicking the
  empty board puts them away again, so they never sit over a neighbouring card's buttons. Keyboard:
  Tab to a card to show its tools, then arrow keys on the move/resize handles.
* **Free canvas** — put any widget anywhere; positions are stored as percentages of the window, so a
  board arranged on a laptop lands in the same place on the projector (a little stretched if the two
  screens have different shapes). New cards are placed clear of the corner buttons and the dock.
* **Backgrounds** — twenty-one wallpapers (aurora, chalkboard, graph paper, exercise book, songket,
  three gently moving ones…) drawn entirely with CSS gradients: nothing to download, nothing to go
  stale offline — plus your own photos and a rotating carousel. Each screen keeps its own;
  low-performance mode and Reduce Motion flatten and still them automatically.
* **Screen deck** — the board is a deck of screens. Flip between them with `‹ ›` next to the toolbar,
  add one with `+`, and rename, duplicate or delete them from the screen menu. Each screen keeps its
  own widgets and their settings — one for the starter, one for the activity, one per class.
* **The dock is yours** — by default it holds Poll, Random Picker, Noise Meter, Image, Text, Work Mode,
  Traffic Light, Schedule, Timer and Clock (up to twelve); **More** opens the full catalogue of 27,
  where any tool can be added to the board, pinned into the rail, reordered with `‹ ›`, or the whole
  bar reset to its defaults. The choice is saved with everything else.
* Minimize, hide, spotlight, **Presentation Mode**, six themes (including **Mecha**, a hangar-panel
  look with chamfered armour panels and monospace readouts), light/dark, high contrast, three text
  sizes, Reduce Motion and a low-performance mode.
* Icons are one inline SVG set drawn into `scripts/ui/icons.js` — geometry adapted from the
  [Lucide](https://lucide.dev) and [Tabler](https://tabler.io/icons) icon sets (both MIT). No icon
  font, no sprite request, no emoji (which render differently on every machine and cannot be
  recoloured by the theme).

---

## Technology

* HTML5, CSS3 and vanilla **JavaScript ES modules** — no framework, no bundler, **no build step**
* **Three.js r169** (MIT) for the picker carousel, group flourish and 3D celebrations — vendored in
  `vendor/` so the app works with no internet at all
* **qrcode-generator 1.4.4** (MIT) for the QR tool — also vendored in `vendor/`, so codes are made
  on the computer in front of you and never by a web service
* Web Audio API (`AnalyserNode`) for the noise meter, `getUserMedia` (video only) for the camera,
  `localStorage` for persistence
* Python + Playwright for the development test suites (not needed to run or deploy the app)

---

## Local development

ES modules cannot be loaded from `file://`, so use a static server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works (`npx serve`, `php -S`, VS Code Live Server).
Opening `index.html` by double-clicking shows a short message explaining this.

Optional test suites (Playwright + Chromium required):

```bash
python -m http.server 8123 --bind 127.0.0.1
python tests/smoke.py               # shell, layout, storage resilience
python tests/widgets_m2.py          # the six core widgets
python tests/classes_m3.py          # classes and students
python tests/picker_m4.py           # 3D random picker
python tests/groups_m5.py           # group maker
python tests/celebration_m6.py      # celebration system
python tests/noise_m7.py            # noise meter (fake microphone)
python tests/journey_m8.py          # full teacher journey, clean profile
python tests/canvas_m9.py           # free canvas: drag, resize, z-order, screens
python tests/board_tools_m10.py     # wallpapers, text box, drawing
python tests/image_m11.py           # the image tool, and its storage limits
python tests/catalogue_m12.py       # the other 14 tools + editing the toolbar
python tests/regressions_audit.py   # guards for defects found in code review
python tests/pro_m13.py             # decks, bin, templates, files, photos, carousel, themes, ink, video links
python tests/mobile_m14.py          # six phones standing up and lying down, live rotation, a tablet
```

All fifteen suites currently pass — 743 checks, no console errors.

---

## Deployment

The repository **is** the site: no build command, no output directory, no environment variables.

### GitHub Pages

**Option A — from a branch (simplest)**

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Wait a minute, then open `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so Jekyll does not interfere. Serving from a sub-path (`/<repo>/`) is
supported and tested — every path in the app is relative.

**Option B — from Actions**

`.github/workflows/deploy-pages.yml` is included. Set **Settings → Pages → Source: GitHub Actions**
and push to `main`; the workflow uploads the folder and deploys it.

### Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, choose the repository.
2. Framework preset: **None**
   Build command: *(leave empty)*
   Build output directory: `/`
3. **Save and Deploy** — the site appears at `https://<project>.pages.dev`.

Drag-and-drop also works: **Upload assets** and drop the folder.

### Netlify

1. **Add new site → Import an existing project**, choose the repository.
2. Build command: *(leave empty)* · Publish directory: `.`
   (`netlify.toml` already sets this, plus long caching for `vendor/` and two safe headers.)
3. Deploy.

Drag-and-drop also works: drop the folder onto Netlify's manual deploy area.

All three hosts serve over **HTTPS**, which the noise meter requires.

---

## Browser requirements

* A current **Chrome, Edge, Firefox or Safari** (2023 or newer). The app uses ES modules, container
  queries, `color-mix()` and modern DOM APIs.
* **WebGL** only for the optional 3D effects. Without it — or on any computer where it fails — the app
  automatically uses its 2D equivalents; nothing breaks and the class sees no error.
* **Microphone** only for the noise meter, and **camera** only for the Camera tool — each only after
  you press its button.
* **The internet** only for the Web page tool and video links. Every other tool works with the network unplugged.
* No extensions, plugins or installs.

---

## Microphone permission

The Noise Meter is the only feature that touches the microphone.

* Permission is **never** requested when the page loads — only when you press **Enable Microphone**.
* Browsers only allow microphone access on **`https://`** or **`localhost`**. On a plain `http://`
  address the widget says so and the rest of the board keeps working.
* If you refuse, or the computer has no microphone, the widget shows a clear message and every other
  tool continues normally.
* The microphone is released — tracks stopped, audio nodes disconnected, `AudioContext` closed — when
  you press Stop, minimize or hide the card, remove the widget, or switch to another browser tab. It is
  never on after a page reload.

## Privacy

* **Audio is never recorded, saved, uploaded or transmitted.** The microphone signal goes to an
  `AnalyserNode`, which produces one number — the current loudness — that becomes a bar on screen.
  There is no `MediaRecorder` anywhere in the code and no network request of any kind.
* **The camera is video only.** `getUserMedia` is called with `audio: false`, so a microphone track is
  never even created for it. The picture is displayed and nothing else: no `MediaRecorder`, no canvas
  capture, no upload. The camera is released when you press Stop, minimize or hide the card, remove
  the widget, or switch tabs, and it is never on after a reload.
* **Video and PDF files stay on the computer.** They are opened through a local `blob:` URL that lives
  only for the session — nothing is uploaded and nothing is written into the board, so the file is
  chosen again after a reload. This is deliberate: a lesson video would not fit in `localStorage`.
* **Video links** load the player from YouTube (through its privacy-enhanced `youtube-nocookie.com`
  address), Vimeo or Google Drive, so they need the internet and that site sees the visit. The player
  runs in a sandboxed `iframe` that cannot reach the board. Only the link itself is saved.
* **Web page** (like video links) reaches the internet. The page runs in a sandboxed `iframe`
  (`allow-scripts allow-same-origin allow-popups allow-forms`) with no top-level navigation, `https://`
  addresses only, and many sites refuse embedding altogether — use the Link tool for those.
* No accounts, no tracking, no analytics, no third-party scripts at runtime.
* Pupil names live only in your browser's `localStorage` on that computer. They are never sent anywhere.
* **Background photos** are shrunk on this computer and kept in this browser's IndexedDB — never
  uploaded. Saved screen and deck files carry them inside the file, so treat those files like the
  pictures themselves.
* Because names are stored per browser profile, use **Settings → Data → Export a backup file** if you
  move to another computer, and keep that file somewhere appropriate for pupil data.

## localStorage

All state — classes and pupils, the active class, widget layout, per-widget settings, timer presets,
theme and performance settings — is kept in one versioned document under the key
**`classroomDisplay:v1`**:

```json
{ "version": 3, "classes": [], "activeClassId": "class-1", "settings": {}, "timerPresets": [],
  "screens": [{ "id": "screen-1", "name": "Screen 1", "background": "none", "widgets": [] }],
  "activeScreenId": "screen-1",
  "decks": [{ "id": "deck-1", "name": "My screens", "folderId": null }], "activeDeckId": "deck-1",
  "folders": [], "trash": [], "theme": {}, "widgetData": {} }
```

Each widget in a screen carries `{ instanceId, widgetId, x, y, w, h, z, minimized, hidden, style }`,
where `x/y/w/h` are percentages of the canvas and `style` is `{ tint, font }`. A screen may also carry
`carousel` and `annotations` (ink strokes as fractions of the board).

`screens` always holds the **open** deck; every other deck keeps its own `screens` inside its entry in
`decks`, and opening a deck swaps them. `trash` holds deleted screens and decks with their delete time.

Your own background photos are **not** in this document (they are too big): they live in IndexedDB
(`altrabirdPhotos`) and screens refer to them as `photo:<id>`. **Settings → Data → Export a backup
file** does not include them — save a deck to a file to take photos to another computer.

* **Missing properties** are filled from defaults on load, so an older backup still opens.
* **Malformed data** is set aside under `classroomDisplay:v1.corrupt.<timestamp>` (only the most recent
  copy is kept) and the app starts from defaults rather than failing.
* **Migration**: the version number and a single `migrate()` step handle schema changes — a v1
  document (single grid board) is turned into the first screen of a deck and written back on load.
* **If localStorage is unavailable** (private windows, locked-down kiosk profiles, blocked storage) the
  app warns once and runs entirely in memory — everything works for that lesson but is not saved.
* **If storage fills up** (usually too many pictures) the app says so and keeps running; saving stays on
  for everything else, so only the change that did not fit is lost.
* **Settings → Data** exports a backup, restores one (files that are not backups are refused without
  changing anything) and resets the application after a confirmation.

## Reduce Motion

**Settings → Performance → Reduce motion** (also honoured automatically when the operating system asks
for reduced motion):

* Three.js is not initialised at all — the picker uses its 2D name reel and the group flourish is skipped
* No camera movement, no flashing timer, no card animations, no confetti — the celebration becomes a
  still notice
* Transitions become instant

**Low-performance mode** is separate and aimed at older classroom PCs: no 3D, no backdrop blur, no
shadows or background gradients, shorter transitions and fewer particles.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| A picture will not save | Storage is full. Remove a picture from another screen, or clear a screen you no longer need — the app tells you when this happens. |
| A widget covers another one | Drag it by its header, or resize it from the bottom-right corner. Widgets are free to overlap; the one you click comes to the front. |
| Blank page after double-clicking `index.html` | ES modules cannot load from `file://`. Run a static server (`python -m http.server 8000`) or use the deployed URL. |
| Blank page on GitHub Pages | Make sure `.nojekyll` is in the repository root and Pages is serving `/ (root)`, not `/docs`. |
| "Microphone access is unavailable" | The page is on `http://`. Microphones need `https://` or `localhost`. |
| Microphone permission blocked | Allow it via the padlock icon in the address bar, then press **Try again**. |
| Picker shows a name reel instead of the 3D wheel | 3D is off, Reduce Motion is on, low-performance mode is on, or this computer has no WebGL. Check **Settings → Performance**. |
| Everything is forgotten after closing the browser | Local storage is blocked for this site (private window or a locked-down profile). The board warns about this at start-up. |
| Names disappeared after switching computers | Data is per browser profile. Use **Settings → Data → Export a backup file** and import it on the other computer. |
| Sluggish on an old classroom PC | Turn on **Settings → Performance → Low-performance mode**. |
| I deleted a screen or deck by mistake | **Library → Recently deleted → Restore** (within 30 days). |
| My photo background is missing on another computer | Photos stay in the browser they were added in. Save the deck to a file (Library) and open that file on the other computer. |
| A narrow widget has no colour or spotlight button | They hide on very narrow cards so close and minimize always fit. Widen the card a little. |
| Timer finished while the tab was in the background | Browsers throttle background tabs; the countdown is timestamp-based so the time stays correct, but the alert appears when you return to the tab. |
| A widget shows "This widget could not start" | That widget failed in isolation; remove and re-add it. The rest of the board is unaffected. |

---

## Project structure

```
index.html                     the whole app shell
.nojekyll                      tells GitHub Pages to serve files as-is
netlify.toml                   Netlify: publish ".", no build
.github/workflows/             optional GitHub Pages deploy workflow
styles/
  themes.css                   design tokens: theme colour x light/dark, contrast, text size, motion
  main.css                     shell: top bar, board, launcher, buttons, dialogs
  widgets.css                  widget frame, every widget, presentation and performance modes
scripts/
  main.js                      boots the shell: launcher, class selector, presentation mode
  library.js                   decks and folders (the open deck's screens are the top-level list)
  trash.js                     Recently deleted: 30-day bin for screens and decks
  templates.js                 the eight ready-made screens
  transfer.js                  save / open screen and deck files (with checks on everything read)
  photos.js                    the teacher's background pictures, in IndexedDB
  wallpapers.js                built-in wallpapers, photo backgrounds and the carousel
  annotate.js                  the annotation bar: ink over the whole board
  state.js                     settings/theme/class state + derived motion & 3D flags
  storage.js                   the only module that touches localStorage
  screens.js                   the screen deck (add, rename, duplicate, delete, switch)
  widgetManager.js             widget lifecycle, canvas placement, drag/resize, spotlight, isolation
  classes.js                   class & student domain (create, import, move, export)
  celebration.js               celebration service (triggers, overlay, cleanup)
  celebration2d.js             canvas confetti / stars / fireworks
  random.js                    crypto-quality randomInt + Fisher-Yates shuffle
  audio.js                     short synthesised cues (no sound files)
  utils.js                     small shared helpers
  ui/                          modal.js · forms.js · icons.js · settings.js · classesPanel.js
                               toolbarPanel.js (the More catalogue / edit the bar)
                               libraryPanel.js (decks, templates, recently deleted)
                               widgetStyle.js (per-widget colour and font)
  widgets/                     timer · visualTimer · stopwatch · countdown · clock · calendar
                               trafficLight · workMode · announcement · textBox · drawing · sticker
                               image · video · pdf · webcam · embed · hyperlink · qrCode
                               dice · randomPicker · groupMaker · scoreboard · poll
                               celebration · noiseMeter · schedule
                               placeholder.js (spare) · registry.js (the catalogue and the bar)
  three/                       loadThree.js · randomPickerWheel.js · groupReveal.js · celebrationEffect.js
vendor/
  three.module.min.js          Three.js r169 (MIT), vendored for offline use
  qrcode-generator.js          qrcode-generator 1.4.4 (MIT), vendored for offline use
tests/                         dev-only Playwright suites (not needed to run or deploy the app)
```

## Widget system

`WidgetManager` owns every card on the board:

| Method | Purpose |
|---|---|
| `addWidget(type)` | add a widget of that type, with a fresh unique id |
| `removeWidget(id)` | destroy it and forget its saved data |
| `minimizeWidget(id)` / `restoreWidget(id)` | collapse to the header / expand again |
| `hideWidget(id)` / `showWidget(id)` | take it off the board but keep its settings |
| `loadScreen(id)` | rebuild the board from a screen of the deck |
| `saveLayout()` | persist the current screen's placements |

Each widget is one ES module exporting `{ id, title, icon, size, description, create(ctx) }`, where
`create` returns `{ element, destroy?, openSettings?, onActive?, onResize? }`. Widget DOM is
`.widget > .widget-header (.widget-title, .widget-controls) + .widget-content`. Every call into widget
code is wrapped, so a failing widget shows an error card and the rest of the board keeps working.

---

## Licence

Application code: yours to use and adapt for your school.

* `vendor/three.module.min.js` — Three.js, © the Three.js authors, MIT licence.
* `vendor/qrcode-generator.js` — qrcode-generator, © Kazuhiko Arase, MIT licence.
* Icon geometry in `scripts/ui/icons.js` — adapted from Lucide (© Lucide contributors) and Tabler
  Icons (© Paweł Kuna), both MIT licence.
