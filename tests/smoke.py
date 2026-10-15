"""Milestone 1 acceptance test for Science Classroom (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/smoke.py

Requires Playwright + Chromium. The app itself has no dependencies.
"""

import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))
KEY = "classroomDisplay:v1"

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def watch(page, tag=""):
    page.on("console", lambda m: errors.append(f"{tag}console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{tag}pageerror: {e}"))


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1366, "height": 768})
    page = ctx.new_page()
    watch(page)

    # ---- 1. page loads without console errors, empty state is shown ----
    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    check("1. loads with no widgets on a fresh board", page.locator(".widget").count() == 0)
    check("1. empty state message", page.locator("#boardEmpty .board__empty-title").inner_text()
          == "Add a classroom tool to get started.")
    check("1. the page is named after the app", "Science Classroom" in page.title())
    check("1. the board fills the window", page.evaluate(
        "(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; })()"))

    # ---- 2. widget launcher ----
    tiles = page.locator("#launcherRail .tile")
    check("2. the toolbar holds the chosen tools plus More", tiles.count() == 11, tiles.count())
    check("2. every launcher button is usable", page.locator("#launcherRail .tile[disabled]").count() == 0)
    labels = page.eval_on_selector_all("#launcherRail .tile span:nth-child(2)", "els => els.map(e => e.textContent)")
    expected = ["Poll", "Random Picker", "Noise Meter", "Image", "Text", "Work Mode",
                "Traffic Light", "Schedule", "Timer", "Clock", "More"]
    check("2. launcher order matches the spec", labels == expected, labels)

    # ---- 3. placeholder widget can be added ----
    page.locator('#launcherRail .tile:has-text("Work Mode")').click()
    check("3. a widget can be added", page.locator(".widget").count() == 1)
    check("3. it renders its own content", page.locator(".w-work__title").count() == 1)
    check("3. empty state hides once a widget exists", page.locator("#boardEmpty").is_visible() is False)
    check("3. widget structure matches spec",
          page.evaluate("""(() => {
            const w = document.querySelector('.widget');
            return !!(w.querySelector('.widget-header') && w.querySelector('.widget-header .widget-title')
                   && w.querySelector('.widget-header .widget-controls') && w.querySelector('.widget-content'));
          })()"""))
    check("3. widget has a unique id",
          bool(page.locator(".widget").first.get_attribute("data-instance")))

    page.locator('#launcherRail .tile:has-text("Clock")').click()
    page.locator('#launcherRail .tile:has-text("Traffic Light")').click()
    ids = page.eval_on_selector_all(".widget", "els => els.map(e => e.dataset.instance)")
    check("3. every widget id is unique", len(set(ids)) == len(ids) == 3, ids)
    check("3. real Clock widget renders the time", ":" in page.locator(".w-clock__time").inner_text())

    # ---- 4. widget can be removed ----
    point_at(page.locator(".widget").first)
    page.locator(".widget").first.locator('button[aria-label^="Remove"]').click()
    check("4. widget removed", page.locator(".widget").count() == 2)
    stored = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[0].widgets.length")
    check("4. removal persisted", stored == 2, f"stored={stored}")

    # ---- 5. minimize / restore ----
    first = page.locator(".widget").first
    point_at(first)
    first.locator('[data-role="minimize"]').click()
    check("5. minimize collapses the widget", "is-minimized" in (first.get_attribute("class") or ""))
    check("5. content hidden while minimized", first.locator(".widget-content").is_visible() is False)
    check("5. minimize state persisted",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[0].widgets[0].minimized") is True)
    point_at(first)
    first.locator('[data-role="minimize"]').click()
    check("5. restore expands it again", "is-minimized" not in (first.get_attribute("class") or ""))
    check("5. content visible after restore", first.locator(".widget-content").is_visible())

    # ---- 6. settings opens / closes ----
    page.locator("#btnSettings").click()
    page.wait_for_selector(".modal")
    tab_labels = page.eval_on_selector_all('.modal [role="tab"]', "els => els.map(e => e.textContent)")
    check("6. settings opens with all five sections",
          tab_labels == ["Classes", "Appearance", "Performance", "Timer", "Data"], tab_labels)
    page.locator('.modal [role="tab"]:has-text("Appearance")').click()
    page.locator('.modal .swatch:has-text("Ocean")').click()
    check("6. theme control works", page.evaluate("document.documentElement.dataset.theme") == "ocean")
    page.locator('.modal [role="tab"]:has-text("Performance")').click()
    page.locator('.modal .switchrow:has-text("Reduce motion") input').check()
    check("6. reduce motion control works", page.evaluate("document.documentElement.dataset.motion") == "reduced")
    check("6. reduce motion switches 3D off", page.evaluate("window.classroomDisplay.state.use3D") is False)
    page.locator('.modal [role="tab"]:has-text("Data")').click()
    check("6. data section offers reset", page.locator('.modal button:has-text("Reset application data")').count() == 1)
    page.keyboard.press("Escape")
    check("6. settings closes with Escape", page.locator(".modal").count() == 0)

    # ---- 7. presentation mode ----
    page.locator("#btnPresent").click()
    page.wait_for_timeout(200)
    check("7. full screen keeps the tool dock", page.locator("#launcher").is_visible())
    check("7. presentation hides the top bar", page.locator("#topbar").is_visible() is False)
    check("7. exit button stays available", page.locator("#btnExitPresent").is_visible())
    page.locator("#btnExitPresent").click()
    page.wait_for_timeout(200)
    check("7. exit button leaves presentation", page.locator("#topbar").is_visible())
    page.locator("#btnPresent").click()
    page.wait_for_timeout(150)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    check("7. Escape also leaves presentation", page.locator("#topbar").is_visible())

    # ---- active class selector ----
    page.select_option("#classSelect", "class-3")
    check("class selector switches class",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).activeClassId") == "class-3")
    check("class selector lists five classes", page.locator("#classSelect option").count() == 5)

    # ---- 8/9/11. everything survives a reload ----
    page.reload()
    page.wait_for_selector(".widget")
    check("8. theme persists after reload", page.evaluate("document.documentElement.dataset.theme") == "ocean")
    check("9. reduce motion persists after reload", page.evaluate("document.documentElement.dataset.motion") == "reduced")
    check("11. widget list restored", page.locator(".widget").count() == 2)
    check("11. widget types restored",
          page.eval_on_selector_all(".widget", "els => els.map(e => e.dataset.widget)") == ["clock", "trafficLight"])
    check("11. active class restored", page.locator("#classSelect").input_value() == "class-3")

    # turn reduce motion back off for the screenshots
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")

    # ---- 10. two projector resolutions ----
    for width, height in ((1920, 1080), (1366, 768)):
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(200)
        no_overflow = page.evaluate(
            "document.documentElement.scrollWidth <= document.documentElement.clientWidth"
            " && document.documentElement.scrollLeft === 0")
        check(f"10. {width}x{height}: no sideways scroll", no_overflow)
        check(f"10. {width}x{height}: top bar visible", page.locator("#topbar").is_visible())
        check(f"10. {width}x{height}: launcher visible", page.locator("#launcher").is_visible())
        check(f"10. {width}x{height}: clock stays large",
              page.evaluate("parseFloat(getComputedStyle(document.querySelector('.w-clock__time')).fontSize)") >= 40)
        page.screenshot(path=os.path.join(SHOT, f"shot-{width}x{height}.png"))

    # ---- resilience: corrupt data, blocked storage ----
    page.evaluate(f"localStorage.setItem('{KEY}', '{{not json at all')")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    check("corrupt saved data still boots", page.locator("#boardEmpty").is_visible())
    check("corrupt payload kept aside", page.evaluate("Object.keys(localStorage).some(k => k.includes('corrupt'))"))

    blocked = ctx.new_page()
    watch(blocked, "no-storage ")
    blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});")
    blocked.goto(URL)
    blocked.wait_for_selector("#launcherRail .tile")
    blocked.locator('#launcherRail .tile:has-text("Work Mode")').click()
    check("works with localStorage blocked", blocked.locator(".widget").count() == 1)
    check("warns when storage is blocked", blocked.locator(".toast").count() >= 1)
    blocked.close()

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
