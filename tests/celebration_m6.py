"""Milestone 6 acceptance test — the celebration system (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/celebration_m6.py

Requires Playwright + Chromium. The app itself has no dependencies.
"""

import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


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


def seed_class(page, count=6):
    page.evaluate(
        """(count) => {
            const { state, storage } = window.classroomDisplay;
            storage.saveClasses([{ id: 'cel-class', name: 'Celebration class',
                students: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `Pupil ${i + 1}`, active: true })) }]);
            storage.saveActiveClassId('cel-class');
            state.notifyReplaced();
            state.saveClasses(storage.loadClasses());
        }""", count)
    page.wait_for_timeout(150)


def install_raf_counter(page):
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


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                      "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    seed_class(page)

    use3d = page.evaluate("window.classroomDisplay.state.use3D")
    print(f"      (3D active: {use3d})")

    # ---------- the widget ----------
    add_tool(page, "Celebration")
    page.wait_for_selector(".w-cel")
    check("celebration widget offers a manual button",
          page.locator('.w-cel button:has-text("Celebrate")').count() == 1)
    check("all three effects plus surprise are offered",
          [t.strip() for t in page.eval_on_selector_all(".w-cel__effects .chip-btn", "els => els.map(e => e.textContent)")]
          == ["Confetti", "Stars", "Fireworks", "Surprise me"])
    check("confetti is the default effect",
          page.evaluate("window.classroomDisplay.state.settings.celebration.effect") == "confetti")
    check("the default message is the well-done one",
          page.evaluate("window.classroomDisplay.state.settings.celebration.message") == "🎉 WELL DONE!")

    # ---------- manual celebrate ----------
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    check("the overlay appears above the board",
          page.evaluate("parseInt(getComputedStyle(document.querySelector('.celebration')).zIndex, 10)") >= 100)
    check("the message is shown",
          page.locator(".celebration__message").inner_text() == "🎉 WELL DONE!")
    check("the overlay never blocks the board",
          page.evaluate("getComputedStyle(document.querySelector('.celebration')).pointerEvents") == "none")
    check("the dismiss button is clickable",
          page.evaluate("getComputedStyle(document.querySelector('.celebration__dismiss')).pointerEvents") == "auto")
    check("a canvas is drawing the effect", page.locator(".celebration__canvas").count() == 1)

    page.screenshot(path=os.path.join(SHOT, "m6-celebration.png"))

    # widgets underneath stay clickable while it plays
    page.locator('.w-cel__effects .chip-btn:has-text("Stars")').click()
    check("controls still work during a celebration",
          page.evaluate("window.classroomDisplay.state.settings.celebration.effect") == "stars")

    # ---------- auto-dismiss within 2-4 s ----------
    started = time.time()
    page.wait_for_selector(".celebration", state="detached", timeout=8000)
    lifetime = time.time() - started
    check("it clears itself automatically", lifetime < 5.5, f"{lifetime:.1f}s after the check")
    check("no overlay is left behind", page.locator(".celebration").count() == 0)
    check("no stray canvas is left behind",
          page.evaluate("document.querySelectorAll('.celebration__canvas').length") == 0)

    # ---------- nothing renders afterwards ----------
    install_raf_counter(page)
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    page.wait_for_selector(".celebration", state="detached", timeout=8000)
    page.wait_for_timeout(500)
    idle_a = page.evaluate("window.__rafCount")
    page.wait_for_timeout(900)
    check("no animation frames run after it finishes",
          page.evaluate("window.__rafCount") == idle_a, f"{idle_a} -> {page.evaluate('window.__rafCount')}")

    # ---------- dismissible ----------
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    page.locator(".celebration__dismiss").click()
    page.wait_for_timeout(200)
    check("the dismiss button removes it", page.locator(".celebration").count() == 0)

    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Escape removes it", page.locator(".celebration").count() == 0)

    # ---------- each effect runs ----------
    for effect in ("Confetti", "Stars", "Fireworks"):
        page.locator(f'.w-cel__effects .chip-btn:has-text("{effect}")').click()
        page.locator('.w-cel button:has-text("Celebrate")').click()
        page.wait_for_selector(".celebration", timeout=5000)
        check(f"{effect.lower()} runs",
              page.locator(".celebration").get_attribute("data-effect") == effect.lower())
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)

    # ---------- custom message ----------
    page.locator(".w-cel__message select").select_option("Science Stars!")
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    check("a preset message can be chosen",
          page.locator(".celebration__message").inner_text() == "Science Stars!")
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    page.locator(".w-cel__message select").select_option("__custom")
    page.locator(".w-cel__message input").fill("Bagus sekali!")
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    check("a custom message can be typed",
          page.locator(".celebration__message").inner_text() == "Bagus sekali!")
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    page.locator(".w-cel__message select").select_option("🎉 WELL DONE!")

    # ---------- triggers ----------
    page.evaluate("""document.dispatchEvent(new CustomEvent('timer:complete', { detail: { instanceId: 'x' } }))""")
    page.wait_for_selector(".celebration", timeout=5000)
    check("timer:complete triggers a celebration", page.locator(".celebration").count() == 1)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    page.evaluate("""document.dispatchEvent(new CustomEvent('randomPicker:selected',
        { detail: { studentId: 's1', studentName: 'Pupil 2' } }))""")
    page.wait_for_selector(".celebration", timeout=5000)
    check("randomPicker:selected triggers a celebration", page.locator(".celebration").count() == 1)
    check("the picked pupil is named in the celebration",
          page.locator(".celebration__subtitle").inner_text() == "Pupil 2")
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    # a real pick, end to end
    add_tool(page, "Random Picker")
    page.wait_for_selector(".w-pick")
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: false })")   # keep the test quick
    page.wait_for_timeout(200)
    page.locator('.w-pick button:has-text("Pick")').first.click()
    page.wait_for_selector(".celebration", timeout=15000)
    winner = page.locator(".w-pick__winner-name").inner_text()
    check("a real pick celebrates the winner",
          page.locator(".celebration__subtitle").inner_text() == winner, winner)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    # triggers can be switched off
    page.locator('.w-cel__triggers label:has-text("When a pupil is picked") input').uncheck()
    page.locator('.w-pick button:has-text("Pick again")').first.click()
    page.wait_for_timeout(3500)
    check("the pick trigger can be switched off", page.locator(".celebration").count() == 0)
    page.locator('.w-cel__triggers label:has-text("When a pupil is picked") input').check()

    # ---------- 2D mode ----------
    check("with 3D off the canvas effect is used (no WebGL context)",
          page.evaluate("window.classroomDisplay.state.use3D") is False)
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    check("2D mode still draws on a canvas", page.locator(".celebration__canvas").count() == 1)
    page.keyboard.press("Escape")

    # ---------- reduce motion ----------
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: true, reduceMotion: true })")
    page.wait_for_timeout(200)
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_selector(".celebration", timeout=5000)
    check("reduce motion shows a still notice, not particles",
          page.locator(".celebration").get_attribute("data-mode") == "still"
          and page.locator(".celebration__canvas").count() == 0)
    check("reduce motion still shows the message",
          bool(page.locator(".celebration__message").inner_text()))
    check("reduce motion runs no entrance animation",
          page.evaluate("getComputedStyle(document.querySelector('.celebration__panel')).animationName") == "none")
    page.wait_for_selector(".celebration", state="detached", timeout=6000)
    check("the still notice clears itself too", page.locator(".celebration").count() == 0)

    # ---------- can be turned off entirely ----------
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")
    page.evaluate("window.classroomDisplay.state.setCelebration({ enabled: false })")
    page.locator('.w-cel button:has-text("Celebrate")').click()
    page.wait_for_timeout(600)
    check("celebrations can be disabled", page.locator(".celebration").count() == 0)
    page.evaluate("window.classroomDisplay.state.setCelebration({ enabled: true })")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
