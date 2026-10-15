"""Milestone 8 final test — a whole teacher journey from a clean profile.

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/journey_m8.py

Runs the twelve steps a teacher would take before a lesson, then checks
projector readability at three resolutions and the presentation, reduce-motion
and low-performance modes.
"""

import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))
NAMES = ["Ali", "Abu", "Siti", "Mei Ling", "Kumar", "Farah", "Daniel", "Nurul"]

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def font_px(page, selector):
    return page.evaluate("""(sel) => {
        const node = document.querySelector(sel);
        return node ? parseFloat(getComputedStyle(node).fontSize) : 0;
    }""", selector)


def dismiss_celebration(page):
    if page.locator(".celebration").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

def add_tool(page, name):
    """Add a tool from the bar, or from the More catalogue when it is not pinned."""
    tile = page.locator(f'#launcherRail .tile:has-text("{name}")')
    if tile.count():
        tile.first.click()
    else:
        page.locator(".tile--more").click()
        page.wait_for_selector(".tools__grid")
        page.locator(f'.toolcard:has-text("{name}") .toolcard__add').first.click()
        page.keyboard.press("Escape")
    page.wait_for_timeout(250)



def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    ])
    # A clean profile: no storage, nothing carried over.
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, permissions=["microphone"])
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    check("a clean profile opens on the empty board", page.locator("#boardEmpty").is_visible())

    # ---------- 1. select a class ----------
    page.select_option("#classSelect", label="Class 2")
    page.wait_for_timeout(150)
    check("1. a class can be selected",
          page.locator("#classSelect option:checked").inner_text() == "Class 2")

    # ---------- 2. add students ----------
    page.locator("#btnSettings").click()
    page.wait_for_selector(".classes")
    page.locator('.classes button:has-text("Import names")').click()
    page.wait_for_selector(".modal textarea")
    page.locator(".modal textarea").fill("\n".join(NAMES))
    page.locator('.modal button:has-text("Import names")').last.click()
    page.wait_for_timeout(250)
    page.locator('.modal button:has-text("Close")').last.click()
    page.wait_for_timeout(150)
    check("2. students can be added", page.locator(".studentrow").count() == len(NAMES))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # ---------- build the deck: teaching screen, then activity screen ----------
    for tool in ("Timer", "Traffic Light", "Work Mode", "Announcement"):
        add_tool(page, tool)
    check("screen 1 holds the teaching tools", page.locator(".widget").count() == 4,
          page.locator(".widget").count())
    check("auto-placed widgets do not overlap", page.evaluate("""
        (() => {
            const boxes = Array.from(document.querySelectorAll('.widget')).map(w => w.getBoundingClientRect());
            for (let i = 0; i < boxes.length; i += 1) {
                for (let j = i + 1; j < boxes.length; j += 1) {
                    const a = boxes[i], b = boxes[j];
                    if (a.left < b.right - 1 && b.left < a.right - 1
                        && a.top < b.bottom - 1 && b.top < a.bottom - 1) return false;
                }
            }
            return true;
        })()
    """))

    # ---------- 3. start the timer ----------
    timer = page.locator('.widget[data-widget="timer"]')
    timer.get_by_role("button", name="5 min", exact=True).click()
    timer.locator('button:has-text("Start")').click()
    page.wait_for_timeout(400)
    check("3. the timer runs", timer.locator(".w-timer__status").text_content() == "Counting down")

    # ---------- 4. traffic light ----------
    traffic = page.locator('.widget[data-widget="trafficLight"]')
    traffic.locator(".w-traffic__lamp--green").click()
    check("4. the traffic light changes",
          traffic.locator(".w-traffic__lamp--green").get_attribute("aria-pressed") == "true")

    # ---------- 5. work mode ----------
    work = page.locator('.widget[data-widget="workMode"]')
    work.locator('.w-work__card[data-mode="pair"]').click()
    check("5. work mode changes", work.locator(".w-work__title").inner_text() == "PAIR WORK")

    # ---------- 6. announcement ----------
    note = page.locator('.widget[data-widget="announcement"]')
    note.locator('button:has-text("Edit")').click()
    note.locator(".w-note__editor").fill("Observe what happens when we heat the water.")
    note.locator('button:has-text("Save")').click()
    check("6. an announcement is displayed",
          note.locator(".w-note__text").inner_text() == "Observe what happens when we heat the water.")

    # ---------- a second screen for the activity tools ----------
    page.locator("#btnScreenAdd").click()
    page.wait_for_timeout(500)
    check("a new screen starts empty", page.locator(".widget").count() == 0)
    check("the screen bar counts the deck", page.locator("#screenCount").inner_text() == "2/2",
          page.locator("#screenCount").inner_text())
    for tool in ("Random Picker", "Group Maker", "Celebration", "Noise Meter"):
        add_tool(page, tool)
    check("screen 2 holds the activity tools", page.locator(".widget").count() == 4)

    # ---------- 7. pick a pupil ----------
    picker = page.locator('.widget[data-widget="randomPicker"]')
    picker.locator('button:has-text("Pick")').first.click()
    page.wait_for_function("""(() => {
        const el = document.querySelector('.w-pick__winner-name');
        return el && el.textContent.trim().length > 0;
    })()""", timeout=20000)
    winner = picker.locator(".w-pick__winner-name").inner_text()
    check("7. a pupil is picked from the class", winner in NAMES, winner)

    # ---------- 9. the pick celebrates (and the manual button works) ----------
    page.wait_for_selector(".celebration", timeout=6000)
    check("9. a pick triggers the celebration",
          page.locator(".celebration__subtitle").inner_text() == winner)
    dismiss_celebration(page)
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=6000)
    check("9. the manual celebrate button works", page.locator(".celebration").count() == 1)
    dismiss_celebration(page)

    # ---------- 8. groups ----------
    groups = page.locator('.widget[data-widget="groupMaker"]')
    groups.locator(".w-group__amount").fill("3")
    groups.locator(".w-group__amount").dispatch_event("input")
    groups.locator('button:has-text("Generate")').click()
    page.wait_for_timeout(2200)
    placed = page.eval_on_selector_all(".groupcard__member", "els => els.map(e => e.textContent)")
    check("8. groups are created with everyone in exactly one",
          sorted(placed) == sorted(NAMES), f"{len(placed)} placed")

    # ---------- 10. noise meter ----------
    noise = page.locator('.widget[data-widget="noiseMeter"]')
    noise.locator('button:has-text("Enable Microphone")').click()
    page.wait_for_function("""document.querySelector('.w-noise').dataset.status === 'active'""", timeout=10000)
    check("10. the noise meter runs", noise.locator(".w-noise").get_attribute("data-status") == "active")

    # ---------- projector readability at three resolutions ----------
    MINIMUMS = {
        ".w-pick__winner-name": 24,
        ".groupcard__member": 15,
        ".w-noise__word": 20,
    }
    for width, height in ((1920, 1080), (1366, 768), (1280, 720)):
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(350)
        sizes = {sel: font_px(page, sel) for sel in MINIMUMS}
        too_small = {sel: size for sel, size in sizes.items() if size < MINIMUMS[sel]}
        check(f"{width}x{height}: everything stays readable", not too_small, too_small or
              " ".join(f"{sel.split('__')[-1]}={size:.0f}px" for sel, size in sizes.items()))
        check(f"{width}x{height}: the page never scrolls sideways",
              page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"))

    page.set_viewport_size({"width": 1920, "height": 1080})
    page.wait_for_timeout(250)

    # back to the teaching screen for the rest of the checks
    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(600)
    check("switching back restores screen 1", page.locator(".widget").count() == 4)
    check("screen 1 kept its work", page.locator(".w-work__title").inner_text() == "PAIR WORK")

    TEACHING_MINIMUMS = {
        ".w-timer__time": 44,
        ".w-traffic__title": 15,
        ".w-work__title": 22,
        ".w-note__text": 20,
    }
    sizes = {sel: font_px(page, sel) for sel in TEACHING_MINIMUMS}
    too_small = {sel: size for sel, size in sizes.items() if size < TEACHING_MINIMUMS[sel]}
    check("the teaching displays stay readable", not too_small, too_small or
          " ".join(f"{sel.split('__')[-1]}={size:.0f}px" for sel, size in sizes.items()))

    # ---------- spotlight ----------
    point_at(timer)
    timer.locator('[data-role="spotlight"]').click()
    page.wait_for_timeout(250)
    check("spotlight expands one widget",
          "is-spotlight" in (timer.get_attribute("class") or ""))
    check("spotlight dims the rest", page.locator(".spotlight-backdrop").count() == 1)
    check("the spotlit timer is bigger than the card was",
          font_px(page, ".w-timer__time") >= 44)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Escape leaves spotlight", page.locator(".spotlight-backdrop").count() == 0)

    # ---------- 11. presentation mode ----------
    page.locator("#btnPresent").click()
    page.wait_for_timeout(400)
    check("11. presentation hides the top bar", page.locator("#topbar").is_visible() is False)
    check("11. full screen keeps the tool dock", page.locator("#launcher").is_visible())
    check("11. presentation keeps a clock", page.locator("#presentClock").is_visible())
    check("11. presentation keeps the exit button", page.locator("#btnExitPresent").is_visible())
    check("11. presentation hides the widget edit controls",
          page.locator('.widget [data-role="remove"]:visible').count() == 0
          and page.locator('.widget [data-role="settings"]:visible').count() == 0)
    point_at(timer)
    check("11. presentation keeps spotlight available",
          page.locator('.widget [data-role="spotlight"]:visible').count() >= 1)
    check("11. presentation keeps the widgets", page.locator(".widget:visible").count() == 4)
    check("11. presentation keeps operating controls",
          page.locator('.w-timer button:has-text("Pause")').is_visible())
    check("11. presentation hides the announcement toolbar",
          page.locator(".w-note__toolbar").is_visible() is False)
    check("11. presentation makes the timer bigger", font_px(page, ".w-timer__time") >= 52,
          font_px(page, ".w-timer__time"))

    page.screenshot(path=os.path.join(SHOT, "m8-presentation.png"))

    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("11. Escape leaves presentation mode", page.locator("#topbar").is_visible())

    # ---------- 12. reload keeps everything ----------
    page.reload()
    page.wait_for_selector(".widget")
    page.wait_for_timeout(500)
    check("12. the active screen is restored", page.locator(".widget").count() == 4)
    check("12. the deck is remembered", page.locator("#screenCount").inner_text() == "1/2",
          page.locator("#screenCount").inner_text())
    check("12. the class is remembered",
          page.locator("#classSelect option:checked").inner_text() == "Class 2")
    check("12. the announcement is remembered",
          page.locator(".w-note__text").first.inner_text() == "Observe what happens when we heat the water.")
    check("12. the traffic light is remembered",
          page.locator(".w-traffic__lamp--green").get_attribute("aria-pressed") == "true")
    check("12. work mode is remembered", page.locator(".w-work__title").inner_text() == "PAIR WORK")
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(600)
    check("12. the groups are remembered", page.locator(".groupcard").count() == 3)
    check("12. the microphone is off again after a reload",
          page.locator(".w-noise").get_attribute("data-status") == "off")
    check("12. widget positions survive the reload",
          page.evaluate("JSON.parse(localStorage.getItem('classroomDisplay:v1')).screens[1].widgets.every(w => Number.isFinite(w.x) && Number.isFinite(w.y))"))
    page.locator("#btnScreenPrev").click()
    page.wait_for_timeout(600)
    check("12. the timer kept counting across the reload",
          page.locator(".w-timer__status").first.text_content() in ("Counting down", "Paused"),
          page.locator(".w-timer__status").first.text_content())

    # ---------- reduce motion ----------
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: true })")
    page.wait_for_timeout(300)
    check("reduce motion switches 3D off",
          page.evaluate("window.classroomDisplay.state.use3D") is False)
    check("reduce motion removes the 3D canvases",
          page.evaluate("document.querySelectorAll('.widget canvas').length") == 0)
    check("reduce motion makes transitions instant",
          page.evaluate("""(() => {
              const w = document.querySelector('.widget');
              return parseFloat(getComputedStyle(w).transitionDuration) <= 0.002;
          })()"""))
    page.locator("#btnScreenNext").click()
    page.wait_for_timeout(600)
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=6000)
    check("reduce motion celebrates without particles",
          page.locator(".celebration").get_attribute("data-mode") == "still")
    dismiss_celebration(page)
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")

    # ---------- low-performance mode ----------
    page.evaluate("window.classroomDisplay.state.setPerformance({ lowPerformance: true })")
    page.wait_for_timeout(300)
    check("low-performance mode is flagged on the page",
          page.evaluate("document.documentElement.dataset.perf") == "low")
    check("low-performance mode switches 3D off",
          page.evaluate("window.classroomDisplay.state.use3D") is False)
    check("low-performance mode drops shadows",
          page.evaluate("""getComputedStyle(document.querySelector('.widget')).boxShadow""") == "none")
    check("low-performance mode drops the backdrop blur",
          page.evaluate("""getComputedStyle(document.querySelector('.topbar')).backdropFilter""") == "none")
    check("low-performance mode shortens transitions",
          page.evaluate("""parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur'))""") <= 120)
    page.evaluate("window.classroomDisplay.state.setPerformance({ lowPerformance: false })")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
