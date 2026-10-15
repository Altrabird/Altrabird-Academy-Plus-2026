"""Free-canvas board and screen deck (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/canvas_m9.py
"""

import json
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


def doc(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")


def box(page, widget_id):
    return page.evaluate("""(id) => {
        const w = document.querySelector(`.widget[data-widget="${id}"]`);
        return w ? { x: parseFloat(w.style.left), y: parseFloat(w.style.top),
                     w: parseFloat(w.style.width), h: parseFloat(w.style.height) } : null;
    }""", widget_id)


def add(page, tool):
    page.locator(f'#launcherRail .tile:has-text("{tool}")').first.click()
    page.wait_for_timeout(200)


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

    # ================= placement =================
    for tool in ("Timer", "Traffic Light", "Clock"):
        add(page, tool)
    check("widgets land on the canvas", page.locator("#canvas .widget").count() == 3)
    check("each widget has a position and size",
          all(v is not None for v in (box(page, "timer"), box(page, "trafficLight"), box(page, "clock"))))
    check("auto-placement avoids overlap", page.evaluate("""
        (() => {
            const b = Array.from(document.querySelectorAll('.widget')).map(w => w.getBoundingClientRect());
            for (let i = 0; i < b.length; i += 1) for (let j = i + 1; j < b.length; j += 1) {
                if (b[i].left < b[j].right - 1 && b[j].left < b[i].right - 1
                    && b[i].top < b[j].bottom - 1 && b[j].top < b[i].bottom - 1) return false;
            }
            return true;
        })()
    """))
    check("the board fills the window", page.evaluate("""
        (() => {
            const r = document.getElementById('canvas').getBoundingClientRect();
            return r.width === innerWidth && r.height === innerHeight;
        })()
    """))

    # ================= drag =================
    before = box(page, "timer")
    point_at(page.locator('.widget[data-widget="timer"]'))
    grip = page.locator('.widget[data-widget="timer"] .widget-grip')
    gb = grip.bounding_box()
    page.mouse.move(gb["x"] + 8, gb["y"] + 8)
    page.mouse.down()
    page.mouse.move(gb["x"] + 300, gb["y"] + 200, steps=10)
    page.mouse.up()
    page.wait_for_timeout(300)
    after = box(page, "timer")
    check("dragging moves a widget", after["x"] > before["x"] + 5 and after["y"] > before["y"] + 5,
          f"{before['x']},{before['y']} -> {after['x']},{after['y']}")
    check("the move is saved",
          doc(page)["screens"][0]["widgets"][0]["x"] == after["x"] or
          any(abs(w["x"] - after["x"]) < 0.01 for w in doc(page)["screens"][0]["widgets"]))

    # ================= resize =================
    point_at(page.locator('.widget[data-widget="timer"]'))
    handle = page.locator('.widget[data-widget="timer"] .widget-resize')
    hb = handle.bounding_box()
    page.mouse.move(hb["x"] + 10, hb["y"] + 10)
    page.mouse.down()
    page.mouse.move(hb["x"] + 180, hb["y"] + 120, steps=10)
    page.mouse.up()
    page.wait_for_timeout(300)
    resized = box(page, "timer")
    check("dragging the corner resizes a widget",
          resized["w"] > after["w"] + 3 and resized["h"] > after["h"] + 3,
          f"{after['w']}x{after['h']} -> {resized['w']}x{resized['h']}")

    # ================= keyboard =================
    point_at(page.locator('.widget[data-widget="clock"]'))
    page.locator('.widget[data-widget="clock"] .widget-grip').focus()
    start = box(page, "clock")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowDown")
    moved = box(page, "clock")
    check("arrow keys move a widget", moved["x"] == start["x"] + 1 and moved["y"] == start["y"] + 1,
          f"{start['x']},{start['y']} -> {moved['x']},{moved['y']}")
    page.locator('.widget[data-widget="clock"] .widget-resize').focus()
    page.keyboard.press("Shift+ArrowRight")
    check("shift+arrow on the handle resizes", box(page, "clock")["w"] == moved["w"] + 5,
          box(page, "clock")["w"])

    # ================= stacking =================
    page.locator('.widget[data-widget="trafficLight"] .widget-content').click(position={"x": 5, "y": 5})
    page.wait_for_timeout(200)
    zs = page.evaluate("""(() => {
        const out = {};
        document.querySelectorAll('.widget').forEach(w => { out[w.dataset.widget] = Number(w.style.zIndex); });
        return out;
    })()""")
    check("clicking a widget brings it to the front", zs["trafficLight"] == max(zs.values()), zs)

    # ================= persistence =================
    snapshot = {wid: box(page, wid) for wid in ("timer", "trafficLight", "clock")}
    page.reload()
    page.wait_for_selector("#canvas .widget")
    page.wait_for_timeout(400)
    restored = {wid: box(page, wid) for wid in ("timer", "trafficLight", "clock")}
    same = all(all(abs(snapshot[wid][k] - restored[wid][k]) < 0.01 for k in ("x", "y", "w", "h"))
               for wid in snapshot)
    check("positions and sizes survive a reload", same,
          "" if same else f"{snapshot} != {restored}")

    # ================= screen deck =================
    check("the deck starts with one screen", page.locator("#screenCount").inner_text() == "1/1")
    page.locator("#btnScreenAdd").click()
    page.wait_for_timeout(500)
    check("adding a screen switches to it",
          page.locator("#screenCount").inner_text() == "2/2" and page.locator(".widget").count() == 0)
    add(page, "Work Mode")
    check("the new screen holds its own widgets", page.locator(".widget").count() == 1)

    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(500)
    check("going back restores the first screen",
          page.locator(".widget").count() == 3 and page.locator("#screenCount").inner_text() == "1/2")
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(500)
    check("going forward restores the second", page.locator(".widget").count() == 1)

    # rename / duplicate / delete through the manager dialog
    page.locator("#btnScreenMenu").click()
    page.wait_for_selector(".screenlist")
    check("the screen manager lists the deck", page.locator(".screenrow").count() == 2)
    page.locator('.screenrow:nth-child(2) button[aria-label^="Rename"]').click()
    page.wait_for_selector('.modal input[type="text"]')
    page.locator('.modal input[type="text"]').last.fill("Activities")
    page.locator('.modal button:has-text("Save name")').click()
    page.wait_for_timeout(300)
    check("a screen can be renamed", "Activities" in page.locator(".screenlist").inner_text())

    page.locator('.screenrow:has-text("Activities") button[aria-label^="Duplicate"]').click()
    page.wait_for_timeout(500)
    check("a screen can be duplicated", page.locator(".screenrow").count() == 3)
    check("the duplicate carries the widgets",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[2].widgets.length") == 1)
    check("the duplicate's widgets get fresh ids", page.evaluate(f"""(() => {{
        const s = JSON.parse(localStorage.getItem('{KEY}')).screens;
        return s[1].widgets[0].instanceId !== s[2].widgets[0].instanceId;
    }})()"""))

    page.locator('.screenrow:has-text("(copy)") button[aria-label^="Delete"]').click()
    page.wait_for_selector('.modal button:has-text("Delete screen")')
    page.locator('.modal button:has-text("Delete screen")').last.click()
    page.wait_for_timeout(400)
    check("a screen can be deleted", page.locator(".screenrow").count() == 2)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # ================= v1 documents migrate =================
    legacy = {
        "version": 1,
        "classes": [{"id": "c1", "name": "Legacy class", "students": [{"id": "s1", "name": "Ali", "active": True}]}],
        "activeClassId": "c1",
        "settings": {"performance": {"enable3D": True, "reduceMotion": False, "lowPerformance": False}},
        "timerPresets": [],
        "layout": {"widgets": [
            {"instanceId": "old_timer", "widgetId": "timer", "size": "md", "minimized": False, "hidden": False},
            {"instanceId": "old_clock", "widgetId": "clock", "size": "md", "minimized": False, "hidden": False},
        ]},
        "theme": {"name": "lab", "scheme": "dark", "contrast": "normal", "textSize": "md"},
        "widgetData": {},
    }
    page.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(legacy))})")
    page.reload()
    page.wait_for_selector(".widget")
    page.wait_for_timeout(400)
    migrated = doc(page)
    check("a v1 document is migrated to the current schema", migrated["version"] == 3, migrated["version"])
    check("the old layout becomes the first screen",
          len(migrated["screens"]) == 1 and len(migrated["screens"][0]["widgets"]) == 2)
    check("migrated widgets are given positions",
          all(isinstance(w.get("x"), (int, float)) and isinstance(w.get("y"), (int, float))
              for w in migrated["screens"][0]["widgets"]))
    check("migrated widgets appear on the canvas", page.locator("#canvas .widget").count() == 2)
    check("the old layout key is gone", "layout" not in migrated)
    check("classes came through untouched", migrated["classes"][0]["name"] == "Legacy class")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
