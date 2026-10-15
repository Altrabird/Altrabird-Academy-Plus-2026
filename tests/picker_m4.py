"""Milestone 4 acceptance test — the 3D Random Name Picker (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/picker_m4.py

Requires Playwright + Chromium (launched with a GPU-less WebGL backend).
The app itself has no dependencies.
"""

import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def seed_class(page, count, class_name="Test class"):
    """Replace the register of the active class with `count` generated pupils."""
    page.evaluate(
        """({ count, className }) => {
            const { state, storage } = window.classroomDisplay;
            const students = Array.from({ length: count }, (_, i) => ({
                id: `s${i + 1}`, name: `Pupil ${i + 1}`, active: true,
            }));
            storage.saveClasses([{ id: 'test-class', name: className, students }]);
            storage.saveActiveClassId('test-class');
            state.notifyReplaced();
            state.saveClasses(storage.loadClasses());
        }""",
        {"count": count, "className": class_name},
    )
    page.wait_for_timeout(150)


def add_picker(page):
    page.locator('#launcherRail .tile:has-text("Random Picker")').click()
    page.wait_for_selector(".w-pick")


def pick_once(page, timeout=15000):
    """Click Pick and wait for the winner, returning the selected event payload."""
    page.evaluate("window.__picked = []")
    page.evaluate("""if (!window.__pickHook) {
        window.__pickHook = true;
        document.addEventListener('randomPicker:selected', (e) => {
            (window.__picked = window.__picked || []).push(e.detail);
        });
    }""")
    page.locator('.w-pick button:has-text("Pick")').first.click()
    page.wait_for_function("window.__picked && window.__picked.length >= 1", timeout=timeout)
    return page.evaluate("window.__picked")


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    # SwiftShader gives headless Chromium a real WebGL context.
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                      "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # This suite measures the picker alone: the celebration system (Milestone 6)
    # reacts to randomPicker:selected and has its own canvas and animation loop,
    # which is covered by tests/celebration_m6.py.
    page.evaluate("window.classroomDisplay.state.setCelebration({ enabled: false })")

    webgl = page.evaluate("window.classroomDisplay.state.capabilities.webgl")
    use3d = page.evaluate("window.classroomDisplay.state.use3D")
    print(f"      (WebGL available: {webgl}, 3D active: {use3d})")

    # ================= empty class =================
    seed_class(page, 0, "Empty class")
    add_picker(page)
    check("empty class shows the guidance message",
          page.locator(".w-pick__empty").is_visible()
          and page.locator(".w-pick__empty").inner_text() == "Add students to this class first.")
    check("empty class cannot start a pick",
          page.locator('.w-pick button:has-text("Pick")').first.is_disabled())
    check("empty class creates no canvas", page.locator(".w-pick canvas").count() == 0)

    # ================= class sizes 5 / 20 / 50 / 100 =================
    for size in (5, 20, 50, 100):
        seed_class(page, size, f"Class of {size}")
        page.wait_for_timeout(200)
        check(f"{size}: pool is reported", f"of {size} available" in page.locator(".w-pick__meta").inner_text(),
              page.locator(".w-pick__meta").inner_text())
        if size == 5:
            check("3D canvas is created when 3D is on",
                  page.locator(".w-pick canvas").count() == 1 if use3d else True)

        picked = pick_once(page)
        detail = picked[-1]
        names = page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")
        ids = page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.id)")

        check(f"{size}: a winner is announced",
              page.locator(".w-pick__winner-name").inner_text() == detail["studentName"],
              detail["studentName"])
        check(f"{size}: the winner belongs to the class", detail["studentName"] in names and detail["studentId"] in ids)
        check(f"{size}: the name is never undefined",
              bool(detail["studentName"]) and "undefined" not in detail["studentName"].lower())
        check(f"{size}: exactly one event per pick", len(picked) == 1, len(picked))
        if use3d:
            check(f"{size}: still exactly one canvas", page.locator(".w-pick canvas").count() == 1)

    # ================= repeated picks + no leftover animation =================
    seed_class(page, 20, "Repeat class")
    page.wait_for_timeout(200)
    # (wrapped in an IIFE so the expression does not evaluate to a function,
    #  which Playwright would then call for us)
    page.evaluate("""(() => {
        window.__rafCount = 0;
        if (window.__rafHook) return 'already';
        window.__rafHook = true;
        const original = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (...args) {
            if (typeof args[0] === 'function') window.__rafCount += 1;
            return original(...args);
        };
        return 'installed';
    })()""")

    winners = []
    for _ in range(5):
        winners.append(pick_once(page)[-1]["studentName"])
    check("the picker works repeatedly", len(winners) == 5 and all(winners))
    check("repeated picks avoid recent winners", len(set(winners)) == 5, winners)

    page.wait_for_timeout(600)
    idle_a = page.evaluate("window.__rafCount")
    page.wait_for_timeout(900)
    idle_b = page.evaluate("window.__rafCount")
    check("no animation frames run after the winner is shown", idle_a == idle_b, f"{idle_a} -> {idle_b}")

    # ================= remove winner / reset history =================
    before_meta = page.locator(".w-pick__meta").inner_text()
    removed_name = page.locator(".w-pick__winner-name").inner_text()
    page.locator('.w-pick button:has-text("Remove winner")').click()
    page.wait_for_timeout(150)
    check("remove winner shrinks the pool for this session",
          "1 set aside" in page.locator(".w-pick__meta").inner_text(),
          page.locator(".w-pick__meta").inner_text())
    check("remove winner does not touch the register",
          removed_name in page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)"))

    page.locator('.w-pick button:has-text("Reset history")').click()
    page.wait_for_timeout(150)
    check("reset history restores the whole pool",
          page.locator(".w-pick__meta").inner_text() == "20 of 20 available",
          page.locator(".w-pick__meta").inner_text())

    # avoid-recent off allows repeats to be possible again
    page.locator(".w-pick__option input").uncheck()
    page.wait_for_timeout(120)
    pick_once(page)
    check("picking still works with avoid-recent off",
          bool(page.locator(".w-pick__winner-name").inner_text()))
    page.locator(".w-pick__option input").check()

    page.screenshot(path=os.path.join(SHOT, "m4-picker.png"))

    # ================= close / reopen: no duplicate renderers =================
    canvases_before = page.evaluate("document.querySelectorAll('canvas').length")
    for _ in range(3):
        point_at(page.locator('.widget[data-widget="randomPicker"]'))
        page.locator('.widget[data-widget="randomPicker"] button[aria-label^="Remove"]').click()
        page.wait_for_timeout(200)
        add_picker(page)
        page.wait_for_timeout(400)
    check("closing and reopening leaves one canvas",
          page.evaluate("document.querySelectorAll('canvas').length") == canvases_before,
          page.evaluate("document.querySelectorAll('canvas').length"))
    check("only one picker widget is on the board",
          page.locator('.widget[data-widget="randomPicker"]').count() == 1)

    # hiding the widget releases the renderer
    point_at(page.locator('.widget[data-widget="randomPicker"]'))
    page.locator('.widget[data-widget="randomPicker"] button[aria-label^="Hide"]').click()
    page.wait_for_timeout(300)
    check("hiding the widget disposes the renderer",
          page.evaluate("document.querySelectorAll('canvas:not(.ink)').length") == 0)
    page.locator('#launcherRail .tile:has-text("Random Picker")').click()
    page.wait_for_selector(".w-pick")
    page.wait_for_timeout(400)

    # ================= 3D disabled -> CSS fallback =================
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: false })")
    page.wait_for_timeout(300)
    check("disabling 3D removes the canvas", page.locator(".w-pick canvas").count() == 0)
    check("the 2D reel takes over", page.locator(".w-pick__reel").is_visible())
    fallback = pick_once(page)[-1]
    check("the fallback picks a real pupil",
          fallback["studentName"] in page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)"),
          fallback["studentName"])
    check("the fallback shows the winner",
          page.locator(".w-pick__winner-name").inner_text() == fallback["studentName"])

    # ================= reduce motion =================
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: true, reduceMotion: true })")
    page.wait_for_timeout(250)
    check("reduce motion keeps Three.js switched off",
          page.evaluate("window.classroomDisplay.state.use3D") is False
          and page.locator(".w-pick canvas").count() == 0)
    reduced = pick_once(page, timeout=6000)[-1]
    check("reduce motion still picks a winner",
          page.locator(".w-pick__winner-name").inner_text() == reduced["studentName"])
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")
    page.wait_for_timeout(300)

    # ================= randomness sanity =================
    seed_class(page, 6, "Spread class")
    page.wait_for_timeout(200)
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: false })")
    page.wait_for_timeout(200)
    seen = set()
    for _ in range(6):
        seen.add(pick_once(page)[-1]["studentName"])
    check("every pupil gets a turn within one cycle", len(seen) == 6, sorted(seen))
    page.wait_for_timeout(200)
    after_cycle = pick_once(page)[-1]["studentName"]
    check("the cycle restarts once everyone has had a turn", bool(after_cycle), after_cycle)

    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: true })")
    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
