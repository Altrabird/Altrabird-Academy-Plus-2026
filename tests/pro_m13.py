"""Milestone 13 — Pro-level board features (dev only).

Decks and folders, Recently deleted, templates, screen/deck files, photo
backgrounds, the background carousel, custom widget themes and the
annotation bar.

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/pro_m13.py
"""

import json
import os
import struct
import sys
import tempfile
import zlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
KEY = "classroomDisplay:v1"
TMP = tempfile.mkdtemp(prefix="pro_m13_")

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def doc(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")


def png_bytes(w=64, h=36, rgb=(200, 40, 90)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def top_modal(page):
    return page.locator(".modal").last


def prompt(page, value, button):
    modal = top_modal(page)
    modal.locator("input.input").fill(value)
    modal.locator(f'button:has-text("{button}")').click()
    page.wait_for_timeout(150)


def close_modals(page):
    while page.locator(".modal").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(80)


def add_tool(page, label):
    if not page.locator(f'#launcherRail .tile:has-text("{label}")').count():
        page.locator(".tile--more").click()
        page.wait_for_selector(".tools__grid")
        page.locator(f'.toolcard:has-text("{label}") .toolcard__add').first.click()
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        return
    page.locator(f'#launcherRail .tile:has-text("{label}")').first.click()
    page.wait_for_timeout(120)


def open_library(page, tab=None):
    page.locator("#btnLibrary").click()
    page.wait_for_selector("#libraryPanel")
    if tab:
        page.locator(f'.settings-tabs [data-tab="{tab}"]').click()
        page.wait_for_timeout(100)


def accept_confirm(page, label):
    top_modal(page).locator(f'button:has-text("{label}")').click()
    page.wait_for_timeout(150)


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1366, "height": 768}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ================= decks & folders =================
    add_tool(page, "Timer")
    check("a fresh install has one deck", len(doc(page)["decks"]) == 1 and doc(page)["version"] == 3)
    open_library(page)
    check("the library lists the open deck", top_modal(page).locator('[data-deck] .screenrow__name').all_inner_texts() == ["My screens"])
    top_modal(page).locator('[data-action="new-deck"]').click()
    prompt(page, "Science", "Create deck")
    page.wait_for_timeout(200)
    check("a new deck opens on an empty board", page.locator(".widget").count() == 0)
    add_tool(page, "Clock")
    d = doc(page)
    check("the new deck is the active one", next(x for x in d["decks"] if x["id"] == d["activeDeckId"])["name"] == "Science")

    open_library(page)
    top_modal(page).locator('[data-deck] button[aria-label="Open My screens"]').click()
    page.wait_for_timeout(250)
    check("opening the first deck brings its timer back",
          page.locator('.widget[data-widget="timer"]').count() == 1 and page.locator('.widget[data-widget="clock"]').count() == 0)
    d = doc(page)
    science = next(x for x in d["decks"] if x["name"] == "Science")
    check("the closed deck keeps its own screens", len(science["screens"]) == 1 and science["screens"][0]["widgets"][0]["widgetId"] == "clock")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    check("the open deck survives a reload", page.locator('.widget[data-widget="timer"]').count() == 1)

    open_library(page)
    top_modal(page).locator('[data-action="new-folder"]').click()
    prompt(page, "Year 2", "Create folder")
    top_modal(page).locator(f'[data-deck="{science["id"]}"] select').select_option(label="Year 2")
    page.wait_for_timeout(150)
    check("a deck can be moved into a folder",
          top_modal(page).locator(f'[data-folder] [data-deck="{science["id"]}"]').count() == 1)
    top_modal(page).locator('button[aria-label="Remove folder Year 2"]').click()
    accept_confirm(page, "Remove folder")
    check("removing a folder keeps its decks",
          len(doc(page)["folders"]) == 0 and any(x["name"] == "Science" and x["folderId"] is None for x in doc(page)["decks"]))
    close_modals(page)

    # ================= recently deleted =================
    page.locator("#btnScreenAdd").click()
    page.wait_for_timeout(200)
    add_tool(page, "Text")
    tid = page.locator('.widget[data-widget="textBox"]').get_attribute("data-instance")
    page.evaluate(f"""() => {{ const d = JSON.parse(localStorage.getItem('{KEY}'));
        d.widgetData['{tid}'] = {{ text: 'Keep me', sizeStep: 2, align: 'left', colour: 'text', bold: true, plain: false }};
        localStorage.setItem('{KEY}', JSON.stringify(d)); }}""")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    page.locator("#btnScreenMenu").click()
    page.locator('.modal button[aria-label="Delete Screen 2"]').click()
    accept_confirm(page, "Delete screen")
    close_modals(page)
    d = doc(page)
    check("a deleted screen goes to the bin", len(d["screens"]) == 1 and len(d["trash"]) == 1 and d["trash"][0]["kind"] == "screen")
    check("its widget settings are kept while it is in the bin", d["widgetData"].get(tid, {}).get("text") == "Keep me")
    open_library(page, "trash")
    check("the bin shows days left", "30 days left" in top_modal(page).locator("[data-bin]").inner_text())
    top_modal(page).locator('[data-bin] [data-action="restore"]').click()
    page.wait_for_timeout(200)
    close_modals(page)
    check("restoring brings the screen back", len(doc(page)["screens"]) == 2 and len(doc(page)["trash"]) == 0)
    check("restoring does not switch away from the screen in use", page.locator("#screenName").inner_text() == "Screen 1")
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(200)
    check("the restored screen still has its text", "Keep me" in page.locator('.widget[data-widget="textBox"]').inner_text())

    open_library(page)
    top_modal(page).locator('button[aria-label="Delete Science"]').click()
    accept_confirm(page, "Delete deck")
    check("a deleted deck goes to the bin", len(doc(page)["decks"]) == 1 and doc(page)["trash"][0]["kind"] == "deck")
    page.locator('.settings-tabs [data-tab="trash"]').click()
    top_modal(page).locator('[data-bin] [data-action="restore"]').click()
    page.wait_for_timeout(150)
    check("a deck can be restored", any(x["name"] == "Science" for x in doc(page)["decks"]))
    close_modals(page)

    # expiry: a bin entry older than 30 days is forgotten at start-up, with its widget data
    page.locator("#btnScreenMenu").click()
    page.locator('.modal button[aria-label="Delete Screen 2"]').click()
    accept_confirm(page, "Delete screen")
    close_modals(page)
    page.evaluate(f"""() => {{ const d = JSON.parse(localStorage.getItem('{KEY}'));
        d.trash[0].deletedAt = Date.now() - 31 * 864e5; localStorage.setItem('{KEY}', JSON.stringify(d)); }}""")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    d = doc(page)
    check("items older than 30 days are deleted for good", len(d["trash"]) == 0 and tid not in d["widgetData"])

    # ================= templates =================
    open_library(page, "templates")
    check("the template library offers eight templates", top_modal(page).locator(".lib-template").count() == 8)
    top_modal(page).locator('[data-template="lesson-starter"] button').click()
    page.wait_for_timeout(300)
    check("a template becomes a new screen with its widgets", page.locator(".widget").count() == 5, page.locator(".widget").count())
    check("template widgets start with their settings", "Welcome" in page.locator('.widget[data-widget="announcement"]').inner_text())
    check("the template sets its background", page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "aurora")
    check("no widget in a template failed to start", page.locator(".widget-error").count() == 0)

    # ================= screen & deck files =================
    page.locator("#btnScreenMenu").click()
    with page.expect_download() as info:
        page.locator('.modal .screenrow.is-active button[aria-label$="to a file"]').click()
    screen_file = os.path.join(TMP, "screen.json")
    info.value.save_as(screen_file)
    data = json.load(open(screen_file, encoding="utf-8"))
    check("a screen saves to a file with its widgets and settings",
          data["type"] == "altrabird-screen" and len(data["screen"]["widgets"]) == 5
          and any(w.get("data", {}).get("text", "").startswith("Welcome") for w in data["screen"]["widgets"]))
    before = len(doc(page)["screens"])
    with page.expect_file_chooser() as chooser:
        top_modal(page).locator('button:has-text("Open a file")').click()
    chooser.value.set_files(screen_file)
    page.wait_for_timeout(500)
    check("a screen file is added as a new screen", len(doc(page)["screens"]) == before + 1 and page.locator(".widget").count() == 5)
    close_modals(page)

    hostile = {
        "type": "altrabird-screen", "format": 1,
        "screen": {"name": "Hostile", "background": "javascript:alert(1)", "widgets": [
            {"widgetId": "evil", "x": 1, "y": 1, "w": 20, "h": 20},
            {"widgetId": "embed", "x": -50, "y": 500, "w": 30, "h": 40, "data": {"url": "javascript:alert(1)"}},
            {"widgetId": "image", "x": 50, "y": 2, "w": 30, "h": 40, "data": {"src": "https://tracker.example/pixel.png", "alt": ""}},
        ]},
    }
    hostile_file = os.path.join(TMP, "hostile.json")
    json.dump(hostile, open(hostile_file, "w", encoding="utf-8"))
    page.locator("#btnScreenMenu").click()
    with page.expect_file_chooser() as chooser:
        top_modal(page).locator('button:has-text("Open a file")').click()
    chooser.value.set_files(hostile_file)
    page.wait_for_timeout(500)
    close_modals(page)
    frames = page.evaluate("[...document.querySelectorAll('.w-embed__frame')].map(f => f.getAttribute('src') || '')")
    check("unknown widgets in a file are dropped", page.locator(".widget").count() == 2)
    check("a javascript: address never reaches the web page frame", all(not s.startswith("javascript") for s in frames), frames)
    check("a picture from a web address is not loaded", page.evaluate("[...document.querySelectorAll('.w-image__picture')].every(i => !i.src.startsWith('http'))"))
    check("a bad background falls back to the theme", page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "none")
    w = next(x for x in doc(page)["screens"][-1]["widgets"] if x["widgetId"] == "embed")
    check("positions from a file are clamped to the board", 0 <= w["x"] <= 70 and 0 <= w["y"] <= 60, (w["x"], w["y"]))

    not_board = os.path.join(TMP, "nope.json")
    json.dump({"hello": 1}, open(not_board, "w"))
    count = len(doc(page)["screens"])
    page.locator("#btnScreenMenu").click()
    with page.expect_file_chooser() as chooser:
        top_modal(page).locator('button:has-text("Open a file")').click()
    chooser.value.set_files(not_board)
    page.wait_for_timeout(400)
    check("a file that is not a board is refused without changes",
          len(doc(page)["screens"]) == count and "not a screen or deck file" in page.locator("#toastRoot").inner_text())
    close_modals(page)

    open_library(page)
    deck_id = doc(page)["activeDeckId"]
    with page.expect_download() as info:
        top_modal(page).locator(f'[data-deck="{deck_id}"] button[aria-label$="to a file"]').click()
    deck_file = os.path.join(TMP, "deck.json")
    info.value.save_as(deck_file)
    deck_data = json.load(open(deck_file, encoding="utf-8"))
    check("a deck saves to a file with every screen", deck_data["type"] == "altrabird-deck"
          and len(deck_data["deck"]["screens"]) == len(doc(page)["screens"]))
    with page.expect_file_chooser() as chooser:
        top_modal(page).locator('[data-action="import"]').click()
    chooser.value.set_files(deck_file)
    page.wait_for_timeout(600)
    d = doc(page)
    check("a deck file becomes a new, open deck", len(d["decks"]) == 3 and len(d["screens"]) == len(deck_data["deck"]["screens"]))
    close_modals(page)

    # ================= photo backgrounds =================
    page.locator("#btnScreenAdd").click()
    page.wait_for_timeout(200)
    page.locator("#btnBackground").click()
    page.wait_for_selector(".wallpapers")
    page.locator("#photoBackgroundFile").set_input_files({"name": "class-photo.png", "mimeType": "image/png", "buffer": png_bytes()})
    page.wait_for_timeout(800)
    check("an uploaded picture becomes the background",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "photo"
          and "blob:" in page.evaluate("document.getElementById('canvas').style.getPropertyValue('--photo')"))
    bg = doc(page)["screens"][-1]["background"]
    check("the screen stores only a reference to the picture", bg.startswith("photo:") and len(json.dumps(doc(page))) < 200000)
    close_modals(page)
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    page.wait_for_timeout(400)
    check("the picture background survives a reload (IndexedDB)",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "photo")

    page.locator("#btnScreenMenu").click()
    with page.expect_download() as info:
        page.locator('.modal .screenrow.is-active button[aria-label$="to a file"]').click()
    photo_file = os.path.join(TMP, "photo-screen.json")
    info.value.save_as(photo_file)
    photo_data = json.load(open(photo_file, encoding="utf-8"))
    check("an exported screen carries its picture", bg[6:] in photo_data.get("photos", {})
          and photo_data["photos"][bg[6:]].startswith("data:image/"))
    close_modals(page)

    # ================= carousel =================
    page.locator("#btnBackground").click()
    page.wait_for_selector(".wallpapers")
    top_modal(page).locator('.switchrow:has-text("Rotate backgrounds") input').check()
    page.wait_for_timeout(100)
    top_modal(page).locator('.wallpaper[data-background="aurora"]').click()
    top_modal(page).locator('.wallpaper[data-background="dusk"]').click()
    top_modal(page).locator('button.segmented__opt:has-text("1 min")').click()
    car = doc(page)["screens"][-1]["carousel"]
    check("the carousel keeps the ticked backgrounds in order",
          car["enabled"] and car["ids"] == [bg, "aurora", "dusk"] and car["minutes"] == 1, car)
    check("tiles in the carousel show their order", top_modal(page).locator(".wallpaper__order").count() == 3)
    close_modals(page)
    page.evaluate("import('./scripts/wallpapers.js').then(m => m.advanceCarousel())")
    page.wait_for_timeout(200)
    check("the carousel moves to the next background", page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "aurora")
    page.evaluate("import('./scripts/wallpapers.js').then(m => m.advanceCarousel())")
    page.wait_for_timeout(200)
    check("and the next", page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "dusk")

    page.locator("#btnBackground").click()
    page.wait_for_selector(".wallpapers")
    top_modal(page).locator('.switchrow:has-text("Rotate backgrounds") input').uncheck()
    top_modal(page).locator(f'button[aria-label="Delete the picture class-photo.png"]').click()
    accept_confirm(page, "Delete picture")
    page.wait_for_timeout(400)
    check("deleting a picture puts its screens back on the theme",
          doc(page)["screens"][-1]["background"] == "none"
          and page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "none")
    close_modals(page)

    # ================= widget themes =================
    add_tool(page, "Timer")
    add_tool(page, "Clock")
    timer = page.locator('.widget[data-widget="timer"]')
    point_at(timer)
    timer.locator('[data-role="style"]').click()
    top_modal(page).locator('.swatch:has-text("Rose")').click()
    top_modal(page).locator('button.segmented__opt:has-text("Serif")').click()
    check("a widget takes its own colour and font",
          timer.get_attribute("data-tint") == "rose" and timer.get_attribute("data-font") == "serif")
    check("the font really changes", "Georgia" in page.evaluate(
        "getComputedStyle(document.querySelector('.widget[data-widget=\"timer\"]')).fontFamily"))
    check("the colour really changes", page.evaluate(
        "getComputedStyle(document.querySelector('.widget[data-widget=\"timer\"]')).backgroundColor")
          != page.evaluate("getComputedStyle(document.querySelector('.widget[data-widget=\"clock\"]')).backgroundColor"))
    top_modal(page).locator('button:has-text("Apply to every widget")').click()
    page.wait_for_timeout(150)
    check("a style can be applied to every widget on the screen",
          page.locator('.widget[data-tint="rose"]').count() == page.locator(".widget").count() == 2)
    point_at(timer)
    timer.locator('[data-role="style"]').click()
    top_modal(page).locator('.swatch:has-text("Paper")').click()
    top_modal(page).locator('button:has-text("Use for new widgets")').click()
    page.wait_for_timeout(100)
    add_tool(page, "Stopwatch")
    newest = page.locator(".widget").last
    check("new widgets start with the chosen style", newest.get_attribute("data-tint") == "paper")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    check("widget styles survive a reload", page.locator('.widget[data-widget="clock"]').get_attribute("data-tint") == "rose")

    # ================= annotation bar =================
    page.locator("#btnAnnotate").click()
    check("Annotate opens the ink bar", page.locator(".ink-bar").is_visible() and "is-active" in page.locator(".ink").get_attribute("class"))
    box = page.locator("#canvas").bounding_box()
    def stroke(x0, y0, x1, y1):
        page.mouse.move(box["x"] + box["width"] * x0, box["y"] + box["height"] * y0)
        page.mouse.down()
        for i in range(1, 11):
            page.mouse.move(box["x"] + box["width"] * (x0 + (x1 - x0) * i / 10), box["y"] + box["height"] * (y0 + (y1 - y0) * i / 10))
        page.mouse.up()
        page.wait_for_timeout(80)
    stroke(0.1, 0.9, 0.5, 0.9)
    page.locator('.ink-bar [data-tool="highlighter"]').click()
    stroke(0.1, 0.8, 0.6, 0.8)
    ink = doc(page)["screens"][-1].get("annotations", [])
    check("strokes are saved with the screen", len(ink) == 2 and ink[1]["a"] == 0.35 and all(0 <= v <= 1 for v in ink[0]["p"]))
    page.locator('.ink-bar [data-action="undo"]').click()
    check("undo removes the last stroke", len(doc(page)["screens"][-1]["annotations"]) == 1)
    page.locator('.ink-bar [data-tool="eraser"]').click()
    stroke(0.3, 0.85, 0.3, 0.95)
    check("the eraser removes a stroke it touches", len(doc(page)["screens"][-1]["annotations"]) == 0)
    page.locator('.ink-bar [data-tool="eraser"]').click()
    stroke(0.1, 0.9, 0.5, 0.9)
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    check("Escape closes the ink bar", not page.locator(".ink-bar").is_visible())
    check("closed ink lets clicks through to widgets",
          page.evaluate("getComputedStyle(document.querySelector('.ink')).pointerEvents") == "none"
          and page.locator(".ink").is_visible())
    point_at(page.locator('.widget[data-widget="clock"]'))
    page.locator('.widget[data-widget="clock"] [data-role="minimize"]').click()
    check("a widget under the ink can still be used", "is-minimized" in page.locator('.widget[data-widget="clock"]').get_attribute("class"))
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    check("ink survives a reload", page.locator(".ink").is_visible() and len(doc(page)["screens"][-1]["annotations"]) == 1)
    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(200)
    check("each screen keeps its own ink", page.locator(".ink").is_hidden())
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(200)
    page.locator("#btnAnnotate").click()
    page.locator('.ink-bar [data-action="clear"]').click()
    page.locator('.ink-bar [data-action="done"]').click()
    check("Clear wipes the screen's ink", doc(page)["screens"][-1]["annotations"] == [])

    page.locator("#btnPresent").click()
    page.wait_for_timeout(300)
    check("full screen keeps the dock", page.locator("#launcher").is_visible() and page.locator(".pager").is_visible())
    page.locator("#btnAnnotate").click()
    check("ink can be used while presenting", page.locator(".ink-bar").is_visible())
    page.keyboard.press("Escape")
    before_count = page.locator(".widget").count()
    page.locator('#launcherRail .tile:has-text("Clock")').click()
    page.wait_for_timeout(200)
    added = page.locator(".widget").last
    check("tools can be picked while in full screen", page.locator(".widget").count() == before_count + 1)
    point_at(added)
    check("a card added in full screen can still be moved and removed",
          added.locator('[data-role="remove"]').is_visible() and added.locator(".widget-grip").is_visible())
    page.locator("#btnDockToggle").click()
    check("the dock can be tucked away for a clean screen",
          page.locator("#launcherRail").is_hidden() and page.locator("#btnDockToggle").is_visible())
    page.locator("#btnDockToggle").click()
    check("and brought back", page.locator("#launcherRail").is_visible())
    page.locator("#btnExitPresent").click()
    page.wait_for_timeout(200)

    # ================= video links =================
    parsed = page.evaluate("""() => import('./scripts/widgets/video.js').then(({ parseVideoLink: p }) => [
        'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s', 'https://youtu.be/aqz-KE-bpKQ', 'youtube.com/shorts/aqz-KE-bpKQ',
        'aqz-KE-bpKQ', 'https://vimeo.com/76979871', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing',
        'https://example.com/clip.mp4', 'javascript:alert(1)', 'https://example.com/page', 'http://example.com/clip.mp4',
    ].map((x) => { const v = p(x); return v ? [v.kind, v.id || '', v.start || 0] : null; }))""")
    check("YouTube links in every common form are understood",
          parsed[0] == ["youtube", "aqz-KE-bpKQ", 90] and parsed[1][:2] == ["youtube", "aqz-KE-bpKQ"]
          and parsed[2][:2] == ["youtube", "aqz-KE-bpKQ"] and parsed[3][:2] == ["youtube", "aqz-KE-bpKQ"], parsed[:4])
    check("Vimeo, Google Drive and video-file links are understood",
          parsed[4][:2] == ["vimeo", "76979871"] and parsed[5][:2] == ["drive", "1AbCdEfGhIjKlMnOp"] and parsed[6][0] == "file", parsed[4:7])
    check("anything else is refused", parsed[7] is None and parsed[8] is None and parsed[9] is None, parsed[7:])

    page.evaluate("window.classroomDisplay.manager.addWidget('video')")
    vid = page.locator('.widget[data-widget="video"]')
    vid.locator(".w-video__link").fill("not a video")
    vid.locator('button:has-text("Play video")').click()
    check("a link that is not a video says so", vid.locator(".w-video__error").is_visible())
    vid.locator(".w-video__link").fill("https://youtu.be/aqz-KE-bpKQ?t=60")
    vid.locator('button:has-text("Play video")').click()
    page.wait_for_timeout(200)
    src = vid.locator(".w-video__frame").get_attribute("src") or ""
    check("a YouTube link plays in the card", vid.locator(".w-video__frame").is_visible()
          and src.startswith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?") and "start=60" in src, src)
    check("the player frame is sandboxed", "allow-top-navigation" not in (vid.locator(".w-video__frame").get_attribute("sandbox") or "x"))
    page.reload()
    page.wait_for_selector('.widget[data-widget="video"]')
    check("a video link is still there after a reload", vid.locator(".w-video__frame").is_visible())
    vid.locator('.w-video__toolbar button:has-text("Change")').click()
    check("Change shows the link box again with the link in it",
          vid.locator(".w-video__link").is_visible() and "aqz-KE-bpKQ" in vid.locator(".w-video__link").input_value())
    vid.locator('button:has-text("Play video")').click()
    vid.locator('.w-video__toolbar button:has-text("Remove")').click()
    check("Remove empties the card", vid.locator(".w-video__link").is_visible() and not vid.locator(".w-video__frame").get_attribute("src"))

    # ================= card tools stay out of the way =================
    page.mouse.click(5, 300)
    page.wait_for_timeout(300)   # the tools fade out
    check("no card shows its tools until it is selected",
          page.evaluate("[...document.querySelectorAll('.widget:not(.is-minimized) .widget-header')].every(h => getComputedStyle(h).visibility === 'hidden')"))
    point_at(vid)
    check("the selected card under the pointer shows its tools",
          vid.locator(".widget-header").evaluate("h => getComputedStyle(h).visibility") == "visible")
    page.mouse.move(5, 300)
    page.wait_for_timeout(250)
    check("moving away hides them again, so they never cover a neighbour",
          vid.locator(".widget-header").evaluate("h => getComputedStyle(h).visibility") == "hidden")

    # ================= stacking stays under the dialogs =================
    page.evaluate("""() => { const w = [...document.querySelectorAll('.widget')];
        for (let i = 0; i < 120; i += 1) w[i % w.length].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }""")
    zs = [w["z"] for w in doc(page)["screens"][-1]["widgets"]]
    check("raising widgets again and again keeps their layer under the dialogs", max(zs) <= 50 and len(set(zs)) == len(zs), zs)
    page.locator("#btnLibrary").click()
    page.wait_for_selector("#libraryPanel")
    check("ink never covers a dialog", page.evaluate(
        "+getComputedStyle(document.querySelector('.ink')).zIndex < +getComputedStyle(document.querySelector('.modal')).zIndex"))
    close_modals(page)
    page.locator("#btnScreenAdd").click()
    add_tool(page, "Timer")
    page.evaluate(f"""() => {{ const d = JSON.parse(localStorage.getItem('{KEY}'));
        const s = d.screens.find(x => x.id === d.activeScreenId); s.widgets[0].w = 18;
        localStorage.setItem('{KEY}', JSON.stringify(d)); }}""")
    page.reload()
    page.wait_for_selector(".widget")
    point_at(page.locator(".widget").first)
    check("a card at its narrowest still shows its remove button", page.evaluate(
        """() => { const x = document.querySelector('.widget [data-role=remove]'); const r = x.getBoundingClientRect();
                   return getComputedStyle(x).visibility === 'visible' && r.right <= innerWidth && r.left >= 0; }"""))

    page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "m13-pro.png"))
    browser.close()

print()
print("console/page errors:", "none" if not errors else "")
for line in errors:
    print("  ", line)
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
