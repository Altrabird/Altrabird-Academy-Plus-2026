"""Milestone 14 — phones and tablets, either way round (dev only).

Runs the board on real device profiles (touch, mobile viewport, device pixel
ratio) standing up and lying down, rotates one phone live, and checks a tablet
keeps the free canvas.

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/mobile_m14.py
"""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
KEY = "classroomDisplay:v1"
PHONES = ["iPhone SE", "iPhone 13", "iPhone 14 Pro Max", "Pixel 7", "Galaxy S9+", "Galaxy A55"]

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def profile(p, name, landscape=False):
    device = dict(p.devices[name])
    device.pop("default_browser_type", None)
    if landscape:
        w, h = device["viewport"]["width"], device["viewport"]["height"]
        device["viewport"] = {"width": h, "height": w}
        if "screen" in device:
            device["screen"] = {"width": device["screen"]["height"], "height": device["screen"]["width"]}
    return device


LAYOUT = """() => {
    const vw = innerWidth, vh = innerHeight;
    const inside = (el) => { const r = el.getBoundingClientRect(); return r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5; };
    const cards = [...document.querySelectorAll('.widget')].map((w) => w.getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i], b = cards[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap = true;
    }
    const tops = new Set(cards.map((r) => Math.round(r.top)));
    return {
        hscroll: document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1,
        corners: [...document.querySelectorAll('#btnLibrary, #classSelect, #btnPresent, #btnSettings')].every(inside),
        dock: inside(document.getElementById('launcher')),
        pager: inside(document.querySelector('.pager')),
        cardsFit: cards.every((r) => r.left >= 0 && r.right <= vw + 0.5 && r.width >= 200),
        overlap,
        perRow: cards.length / tops.size,
        barsShown: [...document.querySelectorAll('.widget [data-role="remove"]')].every((b) => getComputedStyle(b).visibility === 'visible'),
        boardScrolls: document.getElementById('board').scrollHeight > document.getElementById('board').clientHeight,
    };
}"""


with sync_playwright() as p:
    browser = p.chromium.launch()

    for name in PHONES:
        for landscape in (False, True):
            tag = f"{name} {'lying down' if landscape else 'standing up'}"
            ctx = browser.new_context(**profile(p, name, landscape))
            page = ctx.new_page()
            page.on("console", lambda m, t=tag: errors.append(f"{t}: console.{m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e, t=tag: errors.append(f"{t}: pageerror: {e}"))
            page.goto(URL)
            page.wait_for_selector("#launcherRail .tile")

            # a teacher taps tools in the dock (scrolling it sideways where needed)
            for tool in ("timer", "trafficLight", "clock", "textBox"):
                page.locator(f'#launcherRail .tile[data-tool="{tool}"]').tap()
                page.wait_for_timeout(120)
            check(f"{tag}: tapping dock tools adds cards", page.locator(".widget").count() == 4)
            page.locator(".tile--more").tap()
            page.wait_for_selector(".tools__grid")
            check(f"{tag}: More opens the full catalogue", page.locator(".toolcard").count() == 27)
            page.keyboard.press("Escape")
            page.wait_for_timeout(100)

            r = page.evaluate(LAYOUT)
            check(f"{tag}: nothing scrolls sideways", not r["hscroll"])
            check(f"{tag}: corner buttons, dock and pager are on screen", r["corners"] and r["dock"] and r["pager"], r)
            check(f"{tag}: cards fit the width and never overlap", r["cardsFit"] and not r["overlap"], r)
            check(f"{tag}: every card shows its buttons without hover", r["barsShown"])
            if landscape:
                check(f"{tag}: lying down shows cards side by side", r["perRow"] > 1, r["perRow"])
            else:
                check(f"{tag}: the board scrolls to reach every card", r["boardScrolls"])

            last = page.locator(".widget").last
            last.scroll_into_view_if_needed()
            check(f"{tag}: the last card can be scrolled into view", last.is_visible())
            stored = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).screens[0].widgets")
            check(f"{tag}: board positions are still saved for the projector",
                  all(isinstance(w["x"], (int, float)) and isinstance(w["y"], (int, float)) for w in stored))

            page.locator('.widget[data-widget="clock"] [data-role="remove"]').tap()
            page.wait_for_timeout(150)
            check(f"{tag}: a card can be closed with a tap", page.locator('.widget[data-widget="clock"]').count() == 0)

            for opener in ("#btnLibrary", "#btnSettings"):
                page.locator(opener).tap()
                page.wait_for_selector(".modal__panel")
                fits = page.evaluate("(() => { const r = document.querySelector('.modal__panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; })()")
                check(f"{tag}: {opener[4:]} dialog fits the screen", fits)
                page.keyboard.press("Escape")
                page.wait_for_timeout(100)

            page.locator("#btnAnnotate").tap()
            bar_fits = page.evaluate("(() => { const r = document.querySelector('.ink-bar').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; })()")
            check(f"{tag}: the annotation bar fits", bar_fits)
            page.keyboard.press("Escape")
            ctx.close()

    # ---------- rotating one phone while it is in use ----------
    ctx = browser.new_context(**profile(p, "iPhone 13"))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"rotate: pageerror: {e}"))
    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    for tool in ("timer", "clock", "trafficLight"):
        page.locator(f'#launcherRail .tile[data-tool="{tool}"]').tap()
    vp = page.viewport_size
    page.set_viewport_size({"width": vp["height"], "height": vp["width"]})
    page.wait_for_timeout(300)
    r = page.evaluate(LAYOUT)
    check("rotating to landscape re-lays the cards side by side", r["perRow"] > 1 and not r["hscroll"] and not r["overlap"], r)
    page.set_viewport_size(vp)
    page.wait_for_timeout(300)
    r = page.evaluate(LAYOUT)
    check("rotating back stacks them again", r["perRow"] == 1 and not r["hscroll"] and r["cardsFit"], r)
    ctx.close()

    # ---------- a tablet keeps the free canvas ----------
    for landscape in (False, True):
        ctx = browser.new_context(**profile(p, "iPad Mini", landscape))
        page = ctx.new_page()
        page.goto(URL)
        page.wait_for_selector("#launcherRail .tile")
        page.locator('#launcherRail .tile[data-tool="timer"]').tap()
        pos = page.evaluate("getComputedStyle(document.querySelector('.widget')).position")
        hs = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        check(f"iPad Mini {'landscape' if landscape else 'portrait'}: keeps the free board", pos == "absolute" and not hs, pos)
        ctx.close()

    browser.close()

print()
print("console/page errors:", "none" if not errors else "")
for line in errors:
    print("  ", line)
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
