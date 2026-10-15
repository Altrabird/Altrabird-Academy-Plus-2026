"""Milestone 7 acceptance test — the local microphone noise meter (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/noise_m7.py

Chromium is launched with a fake microphone, so no real audio device is used.
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


# Records every stream handed out, so the test can prove the tracks were stopped.
TRACK_SPY = """(() => {
    if (window.__micSpy) return 'already';
    window.__micSpy = { calls: 0, streams: [] };
    if (!navigator.mediaDevices) return 'no mediaDevices';
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (...args) {
        window.__micSpy.calls += 1;
        const stream = await original(...args);
        window.__micSpy.streams.push(stream);
        return stream;
    };
    return 'installed';
})()"""

LIVE_TRACKS = """(() => {
    if (!window.__micSpy) return -1;
    return window.__micSpy.streams
        .flatMap(s => s.getTracks())
        .filter(t => t.readyState === 'live').length;
})()"""


def add_meter(page):
    page.locator('#launcherRail .tile:has-text("Noise Meter")').click()
    page.wait_for_selector(".w-noise")


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = browser.new_context(viewport={"width": 1400, "height": 900}, permissions=["microphone"])
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    page.evaluate(TRACK_SPY)

    # ---------- nothing happens until the teacher asks ----------
    add_meter(page)
    page.wait_for_timeout(400)
    check("the meter starts switched off",
          page.locator(".w-noise").get_attribute("data-status") == "off")
    check("no microphone is requested on load", page.evaluate("window.__micSpy.calls") == 0)
    check("the button invites the teacher to enable it",
          page.locator('.w-noise button:has-text("Enable Microphone")').is_visible())
    check("the privacy promise is on screen",
          "Nothing is recorded" in page.locator(".w-noise__privacy").inner_text())
    check("the meter reads zero while off",
          page.locator(".w-noise__bar").get_attribute("aria-valuenow") == "0")

    # ---------- enable ----------
    page.locator('.w-noise button:has-text("Enable Microphone")').click()
    page.wait_for_function("""document.querySelector('.w-noise').dataset.status === 'active'""", timeout=10000)
    check("permission is requested only after the click", page.evaluate("window.__micSpy.calls") == 1)
    check("the meter reports ACTIVE",
          page.locator(".w-noise").get_attribute("data-status") == "active")
    check("a live microphone track is open", page.evaluate(LIVE_TRACKS) == 1)
    check("the stop button appears", page.locator('.w-noise button:has-text("Stop")').is_visible())

    # the fake device plays a tone, so the meter should move off zero
    page.wait_for_function("""parseInt(document.querySelector('.w-noise__bar').getAttribute('aria-valuenow'), 10) > 0""",
                           timeout=8000)
    level = int(page.locator(".w-noise__bar").get_attribute("aria-valuenow"))
    check("the meter responds to sound", 0 < level <= 100, f"{level}%")
    check("a level word is shown",
          page.locator(".w-noise__word").inner_text() in ("QUIET", "OK", "LOUD", "TOO LOUD"),
          page.locator(".w-noise__word").inner_text())
    check("the bar is drawn to the level",
          page.evaluate("""(() => {
              const fill = document.querySelector('.w-noise__fill');
              return parseFloat(fill.style.width) > 0;
          })()"""))

    page.screenshot(path=os.path.join(SHOT, "m7-noise.png"))

    # ---------- the DOM is not touched on every audio sample ----------
    page.evaluate("""(() => {
        window.__meterUpdates = 0;
        const target = document.querySelector('.w-noise__bar');
        window.__meterObserver = new MutationObserver((records) => { window.__meterUpdates += records.length; });
        window.__meterObserver.observe(target, { attributes: true, attributeFilter: ['aria-valuenow'] });
        return 'watching';
    })()""")
    page.wait_for_timeout(1000)
    updates = page.evaluate("window.__meterUpdates")
    page.evaluate("window.__meterObserver.disconnect()")
    check("the display updates at most ~10 times a second", updates <= 14, f"{updates} updates in 1s")

    # ---------- threshold ----------
    page.locator(".w-noise__threshold").fill("20")
    page.locator(".w-noise__threshold").dispatch_event("input")
    page.wait_for_timeout(200)
    check("the threshold is configurable",
          page.locator(".w-noise__threshold-value").inner_text() == "20%")
    check("the threshold marker moves",
          page.evaluate("""document.querySelector('.w-noise__marker').style.insetInlineStart""") == "20%")
    page.locator(".w-noise__threshold").fill("90")
    page.locator(".w-noise__threshold").dispatch_event("input")
    page.wait_for_timeout(300)
    check("a high threshold reads as quieter",
          page.locator(".w-noise__word").inner_text() in ("QUIET", "OK"),
          page.locator(".w-noise__word").inner_text())

    # ---------- stop releases the microphone ----------
    page.locator('.w-noise button:has-text("Stop")').click()
    page.wait_for_timeout(400)
    check("stopping returns to the off state",
          page.locator(".w-noise").get_attribute("data-status") == "off")
    check("stopping ends every microphone track", page.evaluate(LIVE_TRACKS) == 0)

    # ---------- minimizing releases it too, and restoring brings it back ----------
    page.locator('.w-noise button:has-text("Enable Microphone")').click()
    page.wait_for_function("""document.querySelector('.w-noise').dataset.status === 'active'""", timeout=10000)
    point_at(page.locator('.widget[data-widget="noiseMeter"]'))
    page.locator('.widget[data-widget="noiseMeter"] [data-role="minimize"]').click()
    page.wait_for_timeout(500)
    check("minimizing the widget closes the microphone", page.evaluate(LIVE_TRACKS) == 0)
    point_at(page.locator('.widget[data-widget="noiseMeter"]'))
    page.locator('.widget[data-widget="noiseMeter"] [data-role="minimize"]').click()
    page.wait_for_function("""document.querySelector('.w-noise').dataset.status === 'active'""", timeout=10000)
    check("restoring it opens the microphone again", page.evaluate(LIVE_TRACKS) == 1)

    # ---------- removing the widget must never leave the mic on ----------
    point_at(page.locator('.widget[data-widget="noiseMeter"]'))
    page.locator('.widget[data-widget="noiseMeter"] button[aria-label^="Remove"]').click()
    page.wait_for_timeout(500)
    check("removing the widget closes the microphone", page.evaluate(LIVE_TRACKS) == 0)
    check("the widget is gone", page.locator(".w-noise").count() == 0)

    # ---------- permission denied ----------
    page.evaluate("""(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            const error = new Error('denied by test');
            error.name = 'NotAllowedError';
            throw error;
        };
        return 'blocked';
    })()""")
    add_meter(page)
    page.locator('.w-noise button:has-text("Enable Microphone")').click()
    page.wait_for_function("""document.querySelector('.w-noise').dataset.status === 'denied'""", timeout=8000)
    check("a refused permission shows the denied state",
          page.locator(".w-noise__word").inner_text() == "PERMISSION DENIED")
    check("the denied message points at the other tools",
          "other classroom tools" in page.locator(".w-noise__message").inner_text())
    check("the teacher can try again",
          page.locator('.w-noise button:has-text("Try again")').is_visible())
    check("the rest of the app still works after a refusal",
          page.locator("#btnSettings").is_enabled())
    point_at(page.locator('.widget[data-widget="noiseMeter"]'))
    page.locator('.widget[data-widget="noiseMeter"] button[aria-label^="Remove"]').click()
    page.wait_for_timeout(200)

    # ---------- no microphone support at all ----------
    page2 = ctx.new_page()
    page2.on("pageerror", lambda e: errors.append(f"pageerror(no-mic): {e}"))
    page2.add_init_script("Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined });")
    page2.goto(URL)
    page2.wait_for_selector("#launcherRail .tile")
    page2.locator('#launcherRail .tile:has-text("Noise Meter")').click()
    page2.wait_for_selector(".w-noise")
    page2.locator('.w-noise button:has-text("Enable Microphone")').click()
    page2.wait_for_timeout(400)
    check("with no microphone support the exact fallback message is shown",
          page2.locator(".w-noise__message").inner_text()
          == "Microphone access is unavailable. You can still use the other classroom tools.")
    page2.locator('#launcherRail .tile[aria-label^="Add Timer"]').click()
    page2.wait_for_timeout(200)
    check("other widgets keep working with no microphone",
          page2.locator(".w-timer").count() == 1)
    page2.close()

    # ---------- settings persist, microphone state does not ----------
    add_meter(page)
    page.locator(".w-noise__threshold").fill("35")
    page.locator(".w-noise__threshold").dispatch_event("input")
    page.locator('.w-noise .w-pick__option input').check()
    page.wait_for_timeout(200)
    page.reload()
    page.wait_for_selector(".w-noise")
    check("the threshold survives a reload",
          page.locator(".w-noise__threshold-value").inner_text() == "35%")
    check("the alert setting survives a reload",
          page.locator(".w-noise .w-pick__option input").is_checked())
    check("the microphone is never on after a reload",
          page.locator(".w-noise").get_attribute("data-status") == "off")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
