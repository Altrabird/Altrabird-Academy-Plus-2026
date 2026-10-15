"""Wallpapers, the Text widget and the Drawing widget (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/board_tools_m10.py
"""

import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
KEY = "classroomDisplay:v1"

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def add(page, tool):
    if not page.locator(f'#launcherRail .tile:has-text("{tool}")').count():
        page.locator(".tile--more").click()
        page.wait_for_selector(".tools__grid")
        page.locator(f'.toolcard:has-text("{tool}") .toolcard__add').first.click()
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        return
    page.locator(f'#launcherRail .tile:has-text("{tool}")').first.click()
    page.wait_for_timeout(250)


def canvas_has_ink(page):
    return page.evaluate("""(() => {
        const c = document.querySelector('.w-draw__canvas');
        if (!c) return false;
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
        return false;
    })()""")


def draw_line(page, offset=0):
    box = page.locator(".w-draw__surface").bounding_box()
    page.mouse.move(box["x"] + 30, box["y"] + 30 + offset)
    page.mouse.down()
    for i in range(1, 10):
        page.mouse.move(box["x"] + 30 + (i * 16), box["y"] + 30 + offset + ((i % 3) * 14))
    page.mouse.up()
    page.wait_for_timeout(250)


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ================= wallpapers =================
    check("the board starts on the plain theme background",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "none")
    page.locator("#btnBackground").click()
    page.wait_for_selector(".wallpapers")
    check("a choice of backgrounds is offered", page.locator(".wallpapers[aria-label=Backgrounds] .wallpaper").count() == 21,
          page.locator(".wallpaper").count())
    page.locator('.wallpaper:has-text("Chalkboard")').click()
    page.wait_for_timeout(250)
    check("choosing one paints the canvas",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "chalkboard")
    check("the backdrop is actually drawn",
          page.evaluate("""getComputedStyle(document.getElementById('canvas'), '::before').backgroundImage""") != "none")
    check("the background is stored on the screen",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[0].background") == "chalkboard")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # a second screen keeps its own background
    page.locator("#btnScreenAdd").click()
    page.wait_for_timeout(500)
    check("a new screen starts plain",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "none")
    page.locator("#btnBackground").click()
    page.wait_for_selector(".wallpapers")
    page.locator('.wallpaper:has-text("Aurora")').click()
    page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(500)
    check("each screen keeps its own background",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "chalkboard")
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(500)
    check("and the other screen keeps its own",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "aurora")
    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(500)

    # ================= text widget =================
    add(page, "Text")
    check("the text widget starts with a prompt", page.locator(".w-text__empty").is_visible())
    page.locator('.w-text button:has-text("Edit")').click()
    page.locator(".w-text__editor").fill("Station 1: heat the water")
    page.locator('.w-text button:has-text("Save")').click()
    page.wait_for_timeout(200)
    check("text can be written and saved",
          page.locator(".w-text__view").inner_text() == "Station 1: heat the water")

    point_at(page.locator('.widget[data-widget="textBox"]'))
    page.locator('.widget[data-widget="textBox"] [data-role="settings"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal .segmented__opt:has-text("Centre")').click()
    check("alignment can be changed",
          page.locator(".w-text__view").evaluate("el => getComputedStyle(el).textAlign") == "center")
    page.locator('.modal .segmented__opt:has-text("Accent")').click()
    check("colour can be changed", page.locator(".w-text__view").get_attribute("data-colour") == "accent")
    before = page.locator(".w-text__view").evaluate("el => parseFloat(getComputedStyle(el).fontSize)")
    page.locator('.modal .segmented__opt:has-text("Huge")').click()
    page.wait_for_timeout(150)
    check("size can be changed",
          page.locator(".w-text__view").evaluate("el => parseFloat(getComputedStyle(el).fontSize)") > before)
    page.locator('.modal .switchrow:has-text("No card") input').check()
    page.wait_for_timeout(150)
    check("the card can be removed so the text sits on the board",
          "is-plain" in (page.locator('.widget[data-widget="textBox"]').get_attribute("class") or ""))
    check("a plain text widget has no panel behind it",
          page.evaluate("""(() => {
              const w = document.querySelector('.widget[data-widget="textBox"]');
              const bg = getComputedStyle(w).backgroundColor;
              return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
          })()"""))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # double-click is the quick way back into editing
    page.locator(".w-text__stage").dblclick()
    page.wait_for_timeout(200)
    check("double-clicking starts editing", page.locator(".w-text__editor").is_visible())
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    # ================= drawing widget =================
    add(page, "Drawing")
    check("the drawing starts empty", canvas_has_ink(page) is False)
    check("undo and clear start disabled",
          page.locator('.w-draw button[aria-label^="Undo"]').is_disabled()
          and page.locator('.w-draw button:has-text("Clear")').is_disabled())

    draw_line(page)
    check("drawing leaves ink on the canvas", canvas_has_ink(page))
    stored = page.evaluate(f"""(() => {{
        const data = JSON.parse(localStorage.getItem('{KEY}')).widgetData;
        const key = Object.keys(data).find(k => k.startsWith('drawing'));
        return key ? data[key].strokes.length : 0;
    }})()""")
    check("the stroke is saved", stored == 1, stored)
    check("strokes are stored as fractions of the card",
          page.evaluate(f"""(() => {{
              const data = JSON.parse(localStorage.getItem('{KEY}')).widgetData;
              const key = Object.keys(data).find(k => k.startsWith('drawing'));
              return data[key].strokes[0].points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
          }})()"""))

    draw_line(page, offset=60)
    page.locator('.w-draw button[aria-label^="Undo"]').click()
    page.wait_for_timeout(250)
    check("undo removes the last stroke only",
          page.evaluate(f"""(() => {{
              const data = JSON.parse(localStorage.getItem('{KEY}')).widgetData;
              const key = Object.keys(data).find(k => k.startsWith('drawing'));
              return data[key].strokes.length;
          }})()""") == 1)
    check("ink from the first stroke is still there", canvas_has_ink(page))

    page.locator('.w-draw .w-draw__colour').nth(4).click()
    draw_line(page, offset=90)
    check("a second pen colour can be used",
          page.evaluate(f"""(() => {{
              const data = JSON.parse(localStorage.getItem('{KEY}')).widgetData;
              const key = Object.keys(data).find(k => k.startsWith('drawing'));
              const s = data[key].strokes;
              return s.length === 2 && s[0].colour !== s[1].colour;
          }})()"""))

    # ================= everything survives a reload =================
    page.reload()
    page.wait_for_selector(".w-draw")
    page.wait_for_timeout(700)
    check("the wallpaper survives a reload",
          page.evaluate("document.getElementById('canvas').dataset.wallpaper") == "chalkboard")
    check("the text survives a reload",
          page.locator(".w-text__view").inner_text() == "Station 1: heat the water")
    check("the text styling survives a reload",
          page.locator(".w-text__view").get_attribute("data-colour") == "accent"
          and "is-plain" in (page.locator('.widget[data-widget="textBox"]').get_attribute("class") or ""))
    check("the drawing is redrawn after a reload", canvas_has_ink(page))

    # ================= resizing keeps the drawing =================
    point_at(page.locator('.widget[data-widget="drawing"]'))
    handle = page.locator('.widget[data-widget="drawing"] .widget-resize')
    hb = handle.bounding_box()
    page.mouse.move(hb["x"] + 8, hb["y"] + 8)
    page.mouse.down()
    page.mouse.move(hb["x"] + 160, hb["y"] + 100, steps=8)
    page.mouse.up()
    page.wait_for_timeout(400)
    check("the drawing survives a resize", canvas_has_ink(page))

    page.locator('.w-draw button:has-text("Clear")').click()
    page.wait_for_timeout(300)
    check("clear empties the drawing", canvas_has_ink(page) is False)

    # ================= low-performance mode flattens the backdrop =================
    page.evaluate("window.classroomDisplay.state.setPerformance({ lowPerformance: true })")
    page.wait_for_timeout(250)
    check("low-performance mode drops the gradient backdrop",
          page.evaluate("""getComputedStyle(document.getElementById('canvas'), '::before').backgroundImage""") == "none")
    page.evaluate("window.classroomDisplay.state.setPerformance({ lowPerformance: false })")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
