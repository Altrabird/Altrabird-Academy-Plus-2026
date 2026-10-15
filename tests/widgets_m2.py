"""Milestone 2 acceptance test — the six core 2D widgets (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/widgets_m2.py

Requires Playwright + Chromium. The app itself has no dependencies.
"""

import os
import re
import sys
import time
from datetime import datetime, timedelta

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def seconds(text):
    """'01:23' or '1:02:03' -> seconds."""
    parts = [int(p) for p in re.findall(r"\d+", text)]
    while len(parts) < 3:
        parts.insert(0, 0)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def add_widget(page, label):
    """Add a tool from the bar, or from the More catalogue when it is not pinned."""
    tile = page.locator(f'#launcherRail .tile:has-text("{label}")')
    if tile.count():
        tile.first.click()
    else:
        page.locator(".tile--more").click()
        page.wait_for_selector(".tools__grid")
        page.locator(f'.toolcard:has-text("{label}") .toolcard__add').first.click()
        page.keyboard.press("Escape")
    page.wait_for_timeout(250)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ================= all six coexist =================
    for label in ("Timer", "Traffic Light", "Work Mode", "Announcement", "Clock", "Schedule"):
        add_widget(page, label)
    check("all six widgets coexist", page.locator(".widget").count() == 6, page.locator(".widget").count())
    check("each widget rendered its own content",
          page.locator(".w-timer").count() == 1 and page.locator(".w-traffic").count() == 1
          and page.locator(".w-work").count() == 1 and page.locator(".w-note").count() == 1
          and page.locator(".w-clock__time").count() == 1 and page.locator(".w-sched").count() == 1)
    check("no widget rendered an error card", page.locator(".widget-error").count() == 0)

    timer = page.locator(".widget[data-widget='timer']")
    traffic = page.locator(".widget[data-widget='trafficLight']")
    work = page.locator(".widget[data-widget='workMode']")
    note = page.locator(".widget[data-widget='announcement']")
    sched = page.locator(".widget[data-widget='schedule']")

    # ================= TIMER =================
    timer.locator('.chip-btn:has-text("1 min")').click()
    check("timer preset sets the duration", timer.locator(".w-timer__time").inner_text() == "01:00")
    check("timer starts idle", timer.locator(".w-timer__status").text_content() == "Ready")

    started = time.time()
    timer.locator('button:has-text("Start")').click()
    time.sleep(2.4)
    elapsed = time.time() - started
    shown = seconds(timer.locator(".w-timer__time").inner_text())
    drift = abs(shown - (60 - elapsed))
    check("timer is accurate against the wall clock", drift <= 1.2, f"shown={shown}s drift={drift:.2f}s")
    check("timer reports running", timer.locator(".w-timer__status").text_content() == "Counting down")

    timer.locator('button:has-text("Pause")').click()
    paused_at = timer.locator(".w-timer__time").inner_text()
    time.sleep(1.1)
    check("pause holds the clock", timer.locator(".w-timer__time").inner_text() == paused_at, paused_at)
    check("timer reports paused", timer.locator(".w-timer__status").text_content() == "Paused")

    before = seconds(timer.locator(".w-timer__time").inner_text())
    timer.locator('button:has-text("+30 sec")').click()
    check("+30 sec adds thirty seconds",
          seconds(timer.locator(".w-timer__time").inner_text()) - before == 30)
    timer.locator('button:has-text("+1 min")').click()
    check("+1 min adds sixty seconds",
          seconds(timer.locator(".w-timer__time").inner_text()) - before == 90)

    timer.locator('button:has-text("Reset")').click()
    check("reset returns to the set duration", timer.locator(".w-timer__time").inner_text() == "01:00")
    check("reset returns to idle", timer.locator(".w-timer__status").text_content() == "Ready")

    # --- completion: a 3-second custom duration ---
    page.evaluate("window.__timerEvents = 0;"
                  "document.addEventListener('timer:complete', () => { window.__timerEvents += 1; });")
    timer.locator('button[aria-label="Timer settings"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="number"]').first.fill("0")
    page.locator('.modal input[type="number"]').nth(1).fill("3")
    page.locator('.modal button:has-text("Use this duration")').click()
    page.keyboard.press("Escape")
    check("custom duration applied", timer.locator(".w-timer__time").inner_text() == "00:03")

    timer.locator('button:has-text("Start")').click()
    page.wait_for_timeout(400)
    check("ten-second warning shows while running",
          "is-warning" in (timer.locator(".w-timer").get_attribute("class") or ""))
    time.sleep(3.4)
    check("timer completes with TIME'S UP!",
          timer.locator(".w-timer__status").text_content() == "TIME'S UP!",
          timer.locator(".w-timer__status").text_content())
    check("timer:complete fired once", page.evaluate("window.__timerEvents") == 1,
          page.evaluate("window.__timerEvents"))
    time.sleep(1.2)
    check("timer:complete does not repeat", page.evaluate("window.__timerEvents") == 1)
    check("completed timer shows zero", timer.locator(".w-timer__time").inner_text() == "00:00")

    # ================= TRAFFIC LIGHT =================
    check("traffic light defaults to red",
          traffic.locator(".w-traffic__lamp--red").get_attribute("aria-pressed") == "true")
    check("default labels are the classroom ones",
          traffic.locator(".w-traffic__lamp--red .w-traffic__title").inner_text() == "SILENT WORK"
          and traffic.locator(".w-traffic__lamp--yellow .w-traffic__title").inner_text() == "GET READY"
          and traffic.locator(".w-traffic__lamp--green .w-traffic__title").inner_text() == "DISCUSSION")
    traffic.locator(".w-traffic__lamp--green").click()
    check("selecting a light switches state",
          traffic.locator(".w-traffic__lamp--green").get_attribute("aria-pressed") == "true"
          and traffic.locator(".w-traffic__lamp--red").get_attribute("aria-pressed") == "false")
    check("state is text, not colour alone",
          traffic.locator(".w-traffic__lamp--green .w-traffic__subtitle").inner_text() != "")

    traffic.locator('button[aria-label="Traffic Light settings"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="text"]').first.fill("QUIET SCIENCE")
    page.locator('.modal button:has-text("Save labels")').click()
    check("labels are editable",
          traffic.locator(".w-traffic__lamp--red .w-traffic__title").inner_text() == "QUIET SCIENCE")

    # ================= WORK MODE =================
    check("work mode defaults to silent",
          work.locator(".w-work__title").inner_text() == "SILENT WORK")
    work.locator('.w-work__card[data-mode="group"]').click()
    check("choosing a card changes the big display",
          work.locator(".w-work__title").inner_text() == "GROUP WORK")
    check("chosen card is marked",
          work.locator('.w-work__card[data-mode="group"]').get_attribute("aria-pressed") == "true")

    # ================= ANNOUNCEMENT =================
    MESSAGE = "Observe what happens when we heat the water."
    note.locator('button:has-text("Edit")').click()
    note.locator(".w-note__editor").fill(MESSAGE)
    note.locator('button:has-text("Save")').click()
    check("announcement saves the message", note.locator(".w-note__text").inner_text() == MESSAGE)

    scale_before = note.locator(".w-note__stage").evaluate("el => getComputedStyle(el).getPropertyValue('--note-scale')")
    note.locator('button[aria-label="Larger text"]').click()
    scale_after = note.locator(".w-note__stage").evaluate("el => getComputedStyle(el).getPropertyValue('--note-scale')")
    check("font size control works", float(scale_after) > float(scale_before), f"{scale_before} -> {scale_after}")

    note.locator('button[aria-label="Align left"]').click()
    check("alignment control works",
          note.locator(".w-note__text").evaluate("el => getComputedStyle(el).textAlign") == "left")

    # ================= SCHEDULE =================
    now = datetime.now()

    # Lessons may not cross midnight (the app refuses end <= start), so both
    # slots are kept inside today whatever time the suite runs at.
    if now.hour == 23 and now.minute >= 25:
        now_start, now_end = "23:00", "23:59"
    else:
        now_start = (now - timedelta(minutes=30)).strftime("%H:%M")
        now_end = (now + timedelta(minutes=30)).strftime("%H:%M")

    later_start, later_end = "10:00", "11:00"
    for hour in (10, 13, 15, 8, 19):
        start = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=1)
        if not (start <= now < end):
            later_start, later_end = start.strftime("%H:%M"), end.strftime("%H:%M")
            break

    def add_lesson(start, end, subject, activity):
        sched.locator('button:has-text("Add lesson")').click()
        page.wait_for_selector(".modal")
        page.locator('.modal input[type="time"]').first.fill(start)
        page.locator('.modal input[type="time"]').nth(1).fill(end)
        page.locator('.modal input[type="text"]').first.fill(subject)
        page.locator('.modal input[type="text"]').nth(1).fill(activity)
        page.locator('.modal button:has-text("Add lesson")').last.click()
        page.wait_for_timeout(150)

    add_lesson(now_start, now_end, "Science", "Heating water")
    add_lesson(later_start, later_end, "Bahasa Melayu", "Reading")
    check("lessons are added", sched.locator(".w-sched__row").count() == 2)
    check("current lesson is highlighted", sched.locator(".w-sched__row.is-now").count() == 1)
    check("the highlighted lesson is the right one",
          "Science" in sched.locator(".w-sched__row.is-now").inner_text())

    # validation: end before start is refused
    sched.locator('button:has-text("Add lesson")').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="time"]').first.fill("10:00")
    page.locator('.modal input[type="time"]').nth(1).fill("09:00")
    page.locator('.modal input[type="text"]').first.fill("Bad lesson")
    page.locator('.modal button:has-text("Add lesson")').last.click()
    check("invalid times are refused", page.locator(".modal").count() == 1)
    check("the reason is explained", page.locator(".modal .callout--warn").is_visible())
    page.keyboard.press("Escape")

    # edit and delete
    sched.locator('.w-sched__row:has-text("Bahasa Melayu")').locator('button[aria-label^="Edit"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal input[type="text"]').first.fill("Mathematics")
    page.locator('.modal button:has-text("Save lesson")').click()
    page.wait_for_timeout(150)
    check("a lesson can be edited", "Mathematics" in sched.inner_text())

    sched.locator('.w-sched__row:has-text("Mathematics")').locator('button[aria-label^="Delete"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal button:has-text("Delete")').last.click()
    page.wait_for_timeout(150)
    check("a lesson can be deleted", sched.locator(".w-sched__row").count() == 1)

    # ================= independence =================
    add_widget(page, "Timer")
    timers = page.locator(".widget[data-widget='timer']")
    check("a second timer is independent",
          timers.nth(1).locator(".w-timer__status").text_content() == "Ready"
          and timers.nth(0).locator(".w-timer__status").text_content() == "TIME'S UP!")
    add_widget(page, "Announcement")
    notes = page.locator(".widget[data-widget='announcement']")
    check("a second announcement has its own text",
          notes.nth(1).locator(".w-note__empty").is_visible()
          and notes.nth(0).locator(".w-note__text").inner_text() == MESSAGE)
    check("adding widgets did not disturb the others",
          page.locator(".w-traffic__lamp--red .w-traffic__title").inner_text() == "QUIET SCIENCE"
          and page.locator(".w-work__title").inner_text() == "GROUP WORK"
          and page.locator(".w-sched__row").count() == 1)

    page.screenshot(path=os.path.join(SHOT, "m2-board.png"))

    # ================= reduce motion =================
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: true })")
    timers.nth(1).locator('.chip-btn:has-text("1 min")').click()
    timers.nth(1).locator('button:has-text("Start")').click()
    timers.nth(1).locator('button:has-text("+30 sec")').click()   # keep it well above zero
    page.evaluate("""(() => {
      const el = document.querySelectorAll(".widget[data-widget='timer']")[1].querySelector('.w-timer');
      el.classList.add('is-warning');
    })()""")
    anim = page.evaluate("""getComputedStyle(document.querySelectorAll(".widget[data-widget='timer']")[1]
        .querySelector('.w-timer__time')).animationName""")
    check("reduce motion disables the timer flash", anim == "none", anim)
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")
    anim_on = page.evaluate("""getComputedStyle(document.querySelectorAll(".widget[data-widget='timer']")[1]
        .querySelector('.w-timer__time')).animationName""")
    check("the flash returns when motion is allowed", anim_on == "timer-pulse", anim_on)
    timers.nth(1).locator('button:has-text("Reset")').click()

    # ================= persistence across reload =================
    page.reload()
    page.wait_for_selector(".widget")
    check("every widget survives reload", page.locator(".widget").count() == 8, page.locator(".widget").count())
    check("traffic light labels persist",
          page.locator(".w-traffic__lamp--red .w-traffic__title").inner_text() == "QUIET SCIENCE")
    check("traffic light selection persists",
          page.locator(".w-traffic__lamp--green").get_attribute("aria-pressed") == "true")
    check("work mode persists", page.locator(".w-work__title").inner_text() == "GROUP WORK")
    check("announcement text persists",
          page.locator(".widget[data-widget='announcement'] .w-note__text").first.inner_text() == MESSAGE)
    check("announcement alignment persists",
          page.locator(".widget[data-widget='announcement'] .w-note__text").first
          .evaluate("el => getComputedStyle(el).textAlign") == "left")
    check("schedule persists", page.locator(".w-sched__row").count() == 1)
    check("schedule still highlights the current lesson", page.locator(".w-sched__row.is-now").count() == 1)
    restored_timer = page.locator(".widget[data-widget='timer']").first
    check("a finished timer stays finished after reload",
          restored_timer.locator(".w-timer__time").inner_text() == "00:00"
          and restored_timer.locator(".w-timer__status").text_content() == "TIME'S UP!")
    restored_timer.locator('button:has-text("Reset")').click()
    check("the chosen duration persisted across reload",
          restored_timer.locator(".w-timer__time").inner_text() == "00:03")
    check("clock still ticks after reload", ":" in page.locator(".w-clock__time").inner_text())

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
