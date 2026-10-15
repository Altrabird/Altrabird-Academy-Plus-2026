"""The full tool catalogue and the customisable toolbar (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/catalogue_m12.py

Covers the tools added after Milestone 11: visual timer, stopwatch, dice,
calendar, countdown, scoreboard, poll, link, sticker, QR code, camera, embed,
video and PDF, plus the More catalogue that holds them.
"""

import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
KEY = "classroomDisplay:v1"

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def add_tool(page, name):
    """Add a tool from the bar, or from the More catalogue when it is not pinned."""
    tile = page.locator(f'#launcherRail .tile[aria-label^="Add {name} "]')
    if tile.count():
        tile.first.click()
    else:
        page.locator(".tile--more").click()
        page.wait_for_selector(".tools__grid")
        page.locator(f'.toolcard [aria-label="Add {name} to the board"]').first.click()
        page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def clear_board(page):
    page.evaluate("""(() => {
        window.classroomDisplay.manager.resetLayout();
        return 'cleared';
    })()""")
    page.wait_for_timeout(200)


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    tmp = tempfile.mkdtemp(prefix="classroom-catalogue-")
    pdf_path = os.path.join(tmp, "worksheet.pdf")
    with open(pdf_path, "wb") as handle:
        handle.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                     b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                     b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
                     b"trailer<</Root 1 0 R>>\n%%EOF\n")

    browser = p.chromium.launch(args=["--use-fake-device-for-media-stream",
                                      "--use-fake-ui-for-media-stream"])
    ctx = browser.new_context(viewport={"width": 1700, "height": 1000}, permissions=["camera"])
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ================= the catalogue =================
    check("the toolbar shows a curated set plus More",
          page.locator("#launcherRail .tile").count() == 11,
          page.locator("#launcherRail .tile").count())
    page.locator(".tile--more").click()
    page.wait_for_selector(".tools__grid")
    total = page.locator(".toolcard").count()
    check("every tool is in the catalogue", total == 27, total)
    check("the catalogue is split into bar and the rest",
          page.locator(".tools__grid").first.locator(".toolcard").count() == 10
          and page.locator(".tools__grid").nth(1).locator(".toolcard").count() == 17)
    check("every tool card carries an icon",
          page.locator(".toolcard__icon svg").count() == total)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # every tool starts without error
    page.locator(".tile--more").click()
    page.wait_for_selector(".tools__grid")
    names = page.eval_on_selector_all(".toolcard__name", "els => els.map(e => e.textContent)")
    page.keyboard.press("Escape")
    check("the catalogue names read cleanly", all(names) and len(set(names)) == total, len(set(names)))

    # ================= each new tool works =================
    add_tool(page, "Visual Timer")
    page.locator('.w-vtimer .chip-btn:has-text("2")').first.click()
    page.locator('.w-vtimer button:has-text("Start")').click()
    page.wait_for_timeout(500)
    check("visual timer draws a wedge and runs",
          len(page.locator(".w-vtimer__slice").get_attribute("d") or "") > 20
          and page.locator(".w-vtimer button:has-text('Pause')").count() == 1)
    clear_board(page)

    add_tool(page, "Stopwatch")
    page.locator('.w-watch button:has-text("Start")').click()
    page.wait_for_timeout(1100)
    running = page.locator(".w-watch__time").inner_text()
    page.get_by_role("button", name="Lap", exact=True).click()
    page.wait_for_timeout(200)
    check("stopwatch counts up and records laps",
          running != "00:00.0" and page.locator(".w-watch__lap").count() == 1, running)
    clear_board(page)

    add_tool(page, "Dice")
    page.locator('.w-dice .w-dice__group').first.locator('button:has-text("3")').click()
    page.locator('.w-dice button:has-text("Roll")').click()
    page.wait_for_timeout(1200)
    check("dice rolls the number of dice asked for",
          page.locator(".w-dice__die").count() == 3)
    check("dice shows a total for more than one die",
          "Total" in page.locator(".w-dice__total").inner_text())
    clear_board(page)

    add_tool(page, "Calendar")
    check("calendar shows this month with today marked",
          page.locator(".w-cal__day.is-today").count() == 1
          and len(page.locator(".w-cal__month").inner_text()) > 6)
    page.locator('.w-cal button[aria-label="Next month"]').click()
    page.wait_for_timeout(200)
    check("calendar can page forward", page.locator(".w-cal__day.is-today").count() == 0)
    page.locator('.w-cal button:has-text("Today")').click()
    page.wait_for_timeout(200)
    check("Today comes back", page.locator(".w-cal__day.is-today").count() == 1)
    clear_board(page)

    add_tool(page, "Event Countdown")
    page.locator('.w-count button:has-text("Set a date")').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="date"]').fill("2030-01-01")
    page.locator('.modal input[type="text"]').first.fill("Space trip")
    page.locator('.modal button:has-text("Save")').click()
    page.wait_for_timeout(300)
    check("countdown counts the days",
          page.locator(".w-count__number").inner_text().isdigit()
          and page.locator(".w-count__title").inner_text().lower() == "space trip",
          page.locator(".w-count__number").inner_text())
    clear_board(page)

    add_tool(page, "Scoreboard")
    page.locator('.w-score__team').first.locator('button:has-text("+1")').click()
    page.locator('.w-score__team').first.locator('button:has-text("+1")').click()
    page.locator('.w-score__team').nth(1).locator('button:has-text("+1")').click()
    page.wait_for_timeout(200)
    check("scoreboard counts points",
          page.locator(".w-score__value").first.inner_text() == "2")
    check("the leader is named, not just coloured",
          page.locator(".w-score__lead").count() == 1
          and page.locator(".w-score__lead").inner_text().strip().lower() == "leading",
          page.locator(".w-score__lead").count())
    page.locator('.w-score__team').first.locator('button:has-text("−1")').click()
    page.wait_for_timeout(150)
    check("points can come off again",
          page.locator(".w-score__value").first.inner_text() == "1")
    clear_board(page)

    add_tool(page, "Poll")
    page.locator(".w-poll__bar").first.click()
    page.locator(".w-poll__bar").first.click()
    page.locator(".w-poll__bar").nth(1).click()
    page.wait_for_timeout(250)
    check("poll counts hands", "3 votes" in page.locator(".w-poll__total").inner_text(),
          page.locator(".w-poll__total").inner_text())
    check("poll shows a share of the vote",
          "67%" in page.locator(".w-poll__count").first.inner_text(),
          page.locator(".w-poll__count").first.inner_text())
    check("poll bars are drawn to the counts",
          page.evaluate("""(() => {
              const fills = Array.from(document.querySelectorAll('.w-poll__fill'));
              return parseFloat(fills[0].style.width) > parseFloat(fills[1].style.width);
          })()"""))
    clear_board(page)

    add_tool(page, "Link")
    page.locator('.w-link button:has-text("Add a link")').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="text"]').first.fill("not a link")
    page.locator('.modal button:has-text("Save link")').click()
    check("a bad address is refused", page.locator(".modal .callout--warn").is_visible())
    page.locator('.modal input[type="text"]').first.fill("bbc.co.uk/bitesize")
    page.locator('.modal button:has-text("Save link")').click()
    page.wait_for_timeout(300)
    check("a link opens in a new tab, not in the board",
          page.locator(".w-link__button").get_attribute("target") == "_blank"
          and "noopener" in (page.locator(".w-link__button").get_attribute("rel") or ""))
    check("the whole address is on show",
          "bbc.co.uk/bitesize" in page.locator(".w-link__host").inner_text())
    clear_board(page)

    add_tool(page, "Sticker")
    check("a sticker stamps a mark with no card",
          page.locator(".w-sticker__mark svg").count() == 1
          and "is-plain" in (page.locator('.widget[data-widget="sticker"]').get_attribute("class") or ""))
    check("the sticker is described for screen readers",
          "sticker" in (page.locator(".w-sticker").get_attribute("aria-label") or "").lower())
    clear_board(page)

    # ================= QR code, offline =================
    add_tool(page, "QR Code")
    page.locator(".w-qr__input").fill("https://example.com/lesson")
    page.locator('.w-qr button:has-text("Make code")').click()
    page.wait_for_timeout(900)
    check("the QR code is drawn locally",
          page.evaluate("""(() => {
              const c = document.querySelector('.w-qr__canvas');
              if (!c || !c.width) return false;
              const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              let dark = 0;
              for (let i = 0; i < d.length; i += 4) if (d[i] < 40) dark += 1;
              return dark > 400;
          })()"""))
    check("the encoder came from the vendored copy",
          page.evaluate("""Array.from(document.scripts).some(s => s.src.includes('/vendor/qrcode-generator.js'))"""))
    page.reload()
    page.wait_for_selector(".w-qr")
    page.wait_for_timeout(900)
    check("the QR code comes back after a reload",
          page.evaluate("""(() => {
              const c = document.querySelector('.w-qr__canvas');
              const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              let dark = 0;
              for (let i = 0; i < d.length; i += 4) if (d[i] < 40) dark += 1;
              return dark > 400;
          })()"""))
    clear_board(page)

    # ================= camera =================
    add_tool(page, "Camera")
    check("the camera starts off",
          page.locator(".w-cam").get_attribute("data-status") == "off")
    check("the camera explains it records nothing",
          "Nothing is recorded" in page.locator(".w-cam__privacy").inner_text())
    page.locator('.w-cam button:has-text("Turn on camera")').click()
    page.wait_for_function("document.querySelector('.w-cam').dataset.status === 'active'", timeout=10000)
    check("the camera shows a live picture",
          page.evaluate("""(() => {
              const v = document.querySelector('.w-cam__video');
              return Boolean(v.srcObject) && v.srcObject.getVideoTracks().some(t => t.readyState === 'live');
          })()"""))
    check("the camera never opens the microphone",
          page.evaluate("""(() => {
              const v = document.querySelector('.w-cam__video');
              return v.srcObject.getAudioTracks().length === 0;
          })()"""))
    point_at(page.locator('.widget[data-widget="webcam"]'))
    page.locator('.widget[data-widget="webcam"] [data-role="remove"]').click()
    page.wait_for_timeout(500)
    check("removing the camera card releases the camera",
          page.evaluate("""(() => document.querySelectorAll('.w-cam').length === 0)()"""))

    # ================= embed and PDF =================
    add_tool(page, "Web page")
    page.locator('.w-embed button:has-text("Add a page")').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="text"]').first.fill("http://example.com")
    page.locator('.modal button:has-text("Show page")').click()
    check("an http address is refused", page.locator(".modal .callout--warn").is_visible())
    page.locator('.modal input[type="text"]').first.fill("example.com")
    page.locator('.modal button:has-text("Show page")').click()
    page.wait_for_timeout(400)
    check("an embedded page is sandboxed",
          "allow-scripts" in (page.locator(".w-embed__frame").get_attribute("sandbox") or "")
          and "allow-top-navigation" not in (page.locator(".w-embed__frame").get_attribute("sandbox") or ""))
    check("the embed says what to expect",
          "embedding" in page.locator(".w-embed__notice").inner_text())
    clear_board(page)

    add_tool(page, "PDF")
    check("the PDF card says the file is not stored",
          "not saved into the board" in page.locator(".w-pdf__note").inner_text())
    page.locator(".w-pdf__file").set_input_files(pdf_path)
    page.wait_for_timeout(700)
    check("a PDF opens from a local file",
          (page.locator(".w-pdf__frame").get_attribute("src") or "").startswith("blob:"))
    clear_board(page)

    add_tool(page, "Video")
    check("the video card explains it stays local",
          "uploaded" in page.locator(".w-video__note").inner_text())
    clear_board(page)

    # ================= the toolbar can be changed =================
    page.locator(".tile--more").click()
    page.wait_for_selector(".tools__grid")
    page.locator('.tools__grid').first.locator('.toolcard__pin').first.click()
    page.wait_for_timeout(300)
    check("a tool can be taken out of the bar",
          page.locator(".tools__grid").first.locator(".toolcard").count() == 9)
    page.locator('.tools__grid').nth(1).locator('.toolcard__pin').first.click()
    page.wait_for_timeout(300)
    check("a tool can be pinned into the bar",
          page.locator(".tools__grid").first.locator(".toolcard").count() == 10)
    for _ in range(2):   # fill the bar to its twelve
        page.locator('.tools__grid').nth(1).locator('.toolcard__pin').first.click()
        page.wait_for_timeout(200)
    page.locator('.tools__grid').nth(1).locator('.toolcard__pin').first.click()
    page.wait_for_timeout(300)
    check("a full bar refuses a thirteenth tool",
          page.locator(".tools__grid").first.locator(".toolcard").count() == 12)
    page.locator('.modal button:has-text("Reset the bar")').click()
    page.wait_for_timeout(300)
    check("the bar can be reset",
          page.locator(".tools__grid").first.locator(".toolcard").count() == 10)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    page.evaluate("""(() => {
        window.classroomDisplay.state.setWidgetBar(['timer', 'dice', 'poll']);
        return 'set';
    })()""")
    page.wait_for_timeout(300)
    check("a chosen bar is used", page.locator("#launcherRail .tile").count() == 4,
          page.locator("#launcherRail .tile").count())
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    check("the chosen bar survives a reload",
          page.locator("#launcherRail .tile").count() == 4)
    check("the choice is stored",
          page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).settings.widgetBar")
          == ["timer", "dice", "poll"])

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
