"""Regression guards for the defects found in the final code review (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/regressions_audit.py
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


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # --- a hidden widget must stay hidden across a reload ---
    page.locator('#launcherRail .tile:has-text("Clock")').click()
    page.locator('#launcherRail .tile[aria-label^="Add Timer"]').click()
    page.wait_for_timeout(250)
    point_at(page.locator('.widget[data-widget="clock"]'))
    page.locator('.widget[data-widget="clock"] [data-role="hide"]').click()
    page.wait_for_timeout(250)
    check("hiding a widget takes it off the board", page.locator(".widget").count() == 1)
    page.reload()
    page.wait_for_selector(".widget")
    page.wait_for_timeout(300)
    check("a hidden widget does not come back after a reload",
          page.locator(".widget").count() == 1, page.locator(".widget").count())
    check("the launcher still offers it back", page.locator('.tile:has-text("Hidden")').count() == 1)
    page.locator('.tile:has-text("Hidden")').click()
    page.wait_for_timeout(250)
    check("showing it again adds exactly one card", page.locator(".widget").count() == 2)

    # --- clearing the board must work with a hidden widget present ---
    point_at(page.locator('.widget[data-widget="clock"]'))
    page.locator('.widget[data-widget="clock"] [data-role="hide"]').click()
    page.wait_for_timeout(250)
    page.locator("#btnResetLayout").click()
    page.wait_for_selector('.modal button:has-text("Clear screen")')
    page.locator('.modal button:has-text("Clear screen")').last.click()
    page.wait_for_timeout(350)
    check("clear screen empties the board even with a hidden widget",
          page.locator(".widget").count() == 0)
    check("clear screen empties the stored screen too",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[0].widgets.length") == 0)

    # --- importing the wrong kind of file must not destroy the register ---
    page.evaluate("""(() => {
        const { storage, state } = window.classroomDisplay;
        storage.saveClasses([{ id: 'c1', name: 'My class', students: [{ id: 's1', name: 'Ali', active: true }] }]);
        storage.saveActiveClassId('c1');
        state.notifyReplaced();
        return 'seeded';
    })()""")
    outcome = page.evaluate("""(() => {
        const { storage } = window.classroomDisplay;
        const classExport = { app: 'Science Classroom', type: 'class', class: { id: 'c1', name: 'My class', students: [] } };
        try { storage.importDocument(JSON.stringify(classExport)); return 'accepted'; }
        catch (error) { return 'rejected'; }
    })()""")
    check("a single class export is refused as a backup", outcome == "rejected", outcome)
    check("the register survives the refused import",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).classes.map(c => c.name)") == ["My class"])

    rubbish = page.evaluate("""(() => {
        const { storage } = window.classroomDisplay;
        try { storage.importDocument(JSON.stringify({ hello: 'world' })); return 'accepted'; }
        catch (error) { return 'rejected'; }
    })()""")
    check("an unrelated JSON file is refused too", rubbish == "rejected", rubbish)
    check("a real backup is still accepted",
          page.evaluate("""(() => {
              const { storage } = window.classroomDisplay;
              const backup = storage.exportDocument();
              try { storage.importDocument(JSON.stringify(backup)); return 'accepted'; }
              catch (error) { return 'rejected: ' + error.message; }
          })()""") == "accepted")

    # --- unreadable payloads must not pile up in storage ---
    for _ in range(3):
        page.evaluate(f"localStorage.setItem('{KEY}', '{{broken')")
        page.reload()
        page.wait_for_selector("#launcherRail .tile")
    check("only the most recent unreadable copy is kept",
          page.evaluate("Object.keys(localStorage).filter(k => k.includes('corrupt')).length") == 1,
          page.evaluate("Object.keys(localStorage).filter(k => k.includes('corrupt')).length"))

    # --- the timer must not rewrite the DOM on every tick ---
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    page.locator('#launcherRail .tile[aria-label^="Add Timer"]').click()
    page.wait_for_selector(".w-timer")
    page.locator('.w-timer button:has-text("Start")').click()
    page.evaluate("""(() => {
        window.__w = 0;
        const node = document.querySelector('.w-timer__time');
        window.__obs = new MutationObserver(r => { window.__w += r.length; });
        window.__obs.observe(node, { childList: true, characterData: true, subtree: true, attributes: true });
        return 'watching';
    })()""")
    page.wait_for_timeout(2000)
    writes = page.evaluate("window.__w")
    page.evaluate("window.__obs.disconnect()")
    check("the timer writes to the DOM about once a second", writes <= 6, f"{writes} mutations in 2s")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
