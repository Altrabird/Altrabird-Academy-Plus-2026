"""Milestone 3 acceptance test — class and student management (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/classes_m3.py

Requires Playwright + Chromium. The app itself has no dependencies.
"""

import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
SHOT = os.path.dirname(os.path.abspath(__file__))
KEY = "classroomDisplay:v1"

NAMES = ["Ali", "Abu", "Siti", "Mei Ling", "Kumar",
         "Farah", "Daniel", "Nurul", "Wei Jie", "Aisyah"]

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def stored(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")


def open_classes(page):
    if page.locator(".modal").count() == 0:
        page.locator("#btnSettings").click()
        page.wait_for_selector(".modal")
    page.locator('.modal [role="tab"]:has-text("Classes")').click()
    page.wait_for_selector(".classes")


def close_modal(page):
    while page.locator(".modal").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(80)


def class_row(page, name):
    return page.locator(".classrow", has=page.locator(f'.classrow__name:text-is("{name}")'))


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000},
                              permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ---------- starting point ----------
    open_classes(page)
    check("five classes ship by default", page.locator(".classrow").count() == 5,
          page.locator(".classrow").count())
    check("the active class is marked", page.locator(".classrow.is-active").count() == 1)

    # ============ 1. create a class ============
    page.locator('.classes button:has-text("+ Add class")').click()
    page.wait_for_selector('.modal:last-of-type input[type="text"]')
    page.locator('.modal input[type="text"]').last.fill("2 Bestari")
    page.locator('.modal button:has-text("Add class")').last.click()
    page.wait_for_timeout(150)
    check("1. a class can be created", class_row(page, "2 Bestari").count() == 1)
    check("1. it is added to storage",
          any(c["name"] == "2 Bestari" for c in stored(page)["classes"]))

    # make it the active class
    class_row(page, "2 Bestari").locator(".classrow__pick").click()
    page.wait_for_timeout(120)
    check("1. selecting a class makes it active",
          "is-active" in (class_row(page, "2 Bestari").get_attribute("class") or ""))
    check("1. the top bar follows the selection",
          page.locator("#classSelect option:checked").inner_text() == "2 Bestari")

    # ============ 2. add ten students ============
    # nine by bulk import (with deliberate blank lines and padding), one by hand
    page.locator('.classes button:has-text("Import names")').click()
    page.wait_for_selector(".modal textarea")
    paste = "\n".join(["  " + NAMES[0], ""] + NAMES[1:9] + ["   ", ""])
    page.locator(".modal textarea").fill(paste)
    page.locator('.modal button:has-text("Import names")').last.click()
    page.wait_for_timeout(200)
    check("2. bulk import adds the pasted names", page.locator(".studentrow").count() == 9,
          page.locator(".studentrow").count())
    check("2. import trims whitespace",
          page.locator(".studentrow__name").first.inner_text() == "Ali")
    check("2. import reports what it did", ".modal .callout" and "9 added" in page.locator(".modal .callout").inner_text(),
          page.locator(".modal .callout").inner_text())

    # paste the same list again — nothing should double up
    page.locator(".modal textarea").fill("\n".join(NAMES[:9]))
    page.locator('.modal button:has-text("Import names")').last.click()
    page.wait_for_timeout(200)
    check("2. a repeated paste does not duplicate", page.locator(".studentrow").count() == 9)
    check("2. duplicates are reported", "9 skipped as duplicates" in page.locator(".modal .callout").inner_text(),
          page.locator(".modal .callout").inner_text())
    page.locator('.modal button:has-text("Close")').last.click()
    page.wait_for_timeout(120)

    page.locator('.classes__add input').fill(NAMES[9])
    page.locator('.classes__add button:has-text("Add")').click()
    page.wait_for_timeout(150)
    check("2. a pupil can be added by hand", page.locator(".studentrow").count() == 10)

    saved_class = [c for c in stored(page)["classes"] if c["name"] == "2 Bestari"][0]
    check("2. ten students are stored", len(saved_class["students"]) == 10, len(saved_class["students"]))
    check("2. the data model matches the spec",
          all(set(s.keys()) == {"id", "name", "active"} for s in saved_class["students"]))
    ids = [s["id"] for s in saved_class["students"]]
    check("2. every student id is unique", len(set(ids)) == 10)
    check("2. students start active", all(s["active"] for s in saved_class["students"]))

    # ============ 3 & 4. refresh, students remain ============
    close_modal(page)
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    open_classes(page)
    check("3/4. all ten students survive a refresh", page.locator(".studentrow").count() == 10,
          page.locator(".studentrow").count())
    check("3/4. the names are intact",
          page.eval_on_selector_all(".studentrow__name", "els => els.map(e => e.textContent)") == NAMES)

    # ============ 5 & 6 & 7. switch class, refresh, still active ============
    class_row(page, "Class 4").locator(".classrow__pick").click()
    page.wait_for_timeout(120)
    check("5. switching class updates the top bar",
          page.locator("#classSelect option:checked").inner_text() == "Class 4")
    close_modal(page)
    page.reload()
    page.wait_for_selector("#classSelect")
    check("6/7. the active class survives a refresh",
          page.locator("#classSelect option:checked").inner_text() == "Class 4")
    check("6/7. and is the one stored",
          stored(page)["activeClassId"] ==
          [c for c in stored(page)["classes"] if c["name"] == "Class 4"][0]["id"])

    # switching from the top bar works too
    page.select_option("#classSelect", label="2 Bestari")
    page.wait_for_timeout(120)
    open_classes(page)
    check("5. the top-bar selector drives the panel",
          "is-active" in (class_row(page, "2 Bestari").get_attribute("class") or ""))
    check("5. class-specific data is preserved when switching",
          page.locator(".studentrow").count() == 10)

    # ============ student editing ============
    first_student = page.locator(".studentrow").first
    first_student.locator('button[aria-label^="Edit"]').click()
    page.wait_for_selector('.modal input[type="text"]')
    page.locator('.modal input[type="text"]').last.fill("Ali bin Ahmad")
    page.locator('.modal button:has-text("Save")').last.click()
    page.wait_for_timeout(150)
    check("a pupil can be renamed",
          page.locator(".studentrow__name").first.inner_text() == "Ali bin Ahmad")

    page.locator(".studentrow").first.locator('input[type="checkbox"]').uncheck()
    page.wait_for_timeout(150)
    check("a pupil can be set aside without deleting",
          page.locator(".studentrow.is-set-aside").count() == 1
          and page.locator(".studentrow").count() == 10)
    page.locator(".studentrow").first.locator('input[type="checkbox"]').check()
    page.wait_for_timeout(120)

    # move a student to another class
    page.locator(".studentrow").last.locator('button[aria-label^="Move"]').click()
    page.wait_for_selector(".modal select")
    page.locator(".modal select").select_option(label="Class 4")
    page.locator('.modal button:has-text("Move pupil")').click()
    page.wait_for_timeout(180)
    check("a pupil can be moved to another class", page.locator(".studentrow").count() == 9)
    moved_to = [c for c in stored(page)["classes"] if c["name"] == "Class 4"][0]
    check("the pupil arrived in the other class",
          [s["name"] for s in moved_to["students"]] == [NAMES[9]], moved_to["students"])

    page.locator(".studentrow").last.locator('button[aria-label^="Delete"]').click()
    page.wait_for_timeout(150)
    check("a pupil can be deleted", page.locator(".studentrow").count() == 8)

    # ============ export + clipboard ============
    with page.expect_download() as download_info:
        page.locator('.classes button:has-text("Export JSON")').click()
    download = download_info.value
    with open(download.path(), encoding="utf-8") as handle:
        payload = json.load(handle)
    check("a class exports as JSON",
          payload["type"] == "class" and payload["class"]["name"] == "2 Bestari"
          and len(payload["class"]["students"]) == 8, download.suggested_filename)

    page.locator('.classes button:has-text("Copy names")').click()
    page.wait_for_timeout(200)
    # Windows normalises clipboard newlines to CRLF on read
    clipboard = page.evaluate("navigator.clipboard.readText()").replace("\r\n", "\n")
    check("names copy to the clipboard",
          clipboard.split("\n") == page.eval_on_selector_all(".studentrow__name", "els => els.map(e => e.textContent)"),
          clipboard.replace("\n", " | ")[:60])

    page.screenshot(path=os.path.join(SHOT, "m3-classes.png"))

    # ============ safety: confirmations ============
    page.locator('.classes button:has-text("Clear students")').click()
    page.wait_for_selector('.modal:has-text("Clear every pupil")')
    page.locator('.modal button:has-text("Cancel")').last.click()
    page.wait_for_timeout(150)
    check("clearing students can be cancelled", page.locator(".studentrow").count() == 8)

    page.locator('.classes button:has-text("Clear students")').click()
    page.wait_for_selector('.modal:has-text("Clear every pupil")')
    page.locator('.modal button:has-text("Clear students")').last.click()
    page.wait_for_timeout(180)
    check("clearing students works after confirming", page.locator(".studentrow").count() == 0)
    check("the class itself is still there", class_row(page, "2 Bestari").count() == 1)

    # ============ rename / duplicate / delete a class ============
    class_row(page, "Class 2").locator('button[aria-label^="Rename"]').click()
    page.wait_for_selector('.modal input[type="text"]')
    page.locator('.modal input[type="text"]').last.fill("2 Cerdik")
    page.locator('.modal button:has-text("Save name")').click()
    page.wait_for_timeout(150)
    check("a class can be renamed", class_row(page, "2 Cerdik").count() == 1)

    class_row(page, "Class 4").locator('button[aria-label^="Duplicate"]').click()
    page.wait_for_timeout(180)
    check("a class can be duplicated", class_row(page, "Class 4 (copy)").count() == 1)
    copy_class = [c for c in stored(page)["classes"] if c["name"] == "Class 4 (copy)"][0]
    source_class = [c for c in stored(page)["classes"] if c["name"] == "Class 4"][0]
    check("the duplicate carries the students",
          [s["name"] for s in copy_class["students"]] == [s["name"] for s in source_class["students"]])
    check("the duplicate gets fresh ids",
          not set(s["id"] for s in copy_class["students"]) & set(s["id"] for s in source_class["students"])
          and copy_class["id"] != source_class["id"])

    before = page.locator(".classrow").count()
    class_row(page, "Class 4 (copy)").locator('button[aria-label^="Delete"]').click()
    page.wait_for_selector('.modal:has-text("Delete Class 4 (copy)?")')
    page.locator('.modal button:has-text("Cancel")').last.click()
    page.wait_for_timeout(150)
    check("deleting a class can be cancelled", page.locator(".classrow").count() == before)

    class_row(page, "Class 4 (copy)").locator('button[aria-label^="Delete"]').click()
    page.wait_for_selector('.modal:has-text("Delete Class 4 (copy)?")')
    page.locator('.modal button:has-text("Delete class")').last.click()
    page.wait_for_timeout(180)
    check("deleting a class works after confirming", page.locator(".classrow").count() == before - 1)
    check("it is gone from storage",
          not any(c["name"] == "Class 4 (copy)" for c in stored(page)["classes"]))

    # deleting the active class hands over to another one
    active_name = page.locator(".classrow.is-active .classrow__name").inner_text()
    page.locator(".classrow.is-active").locator('button[aria-label^="Delete"]').click()
    page.wait_for_selector(".modal .btn--danger")
    page.locator('.modal button:has-text("Delete class")').last.click()
    page.wait_for_timeout(200)
    check("deleting the active class picks another one",
          page.locator(".classrow.is-active").count() == 1
          and page.locator(".classrow.is-active .classrow__name").inner_text() != active_name)
    close_modal(page)
    check("the top bar never shows a deleted class",
          page.locator("#classSelect option:checked").inner_text() != active_name)

    # ============ everything persists ============
    page.reload()
    page.wait_for_selector("#launcherRail .tile")
    final = stored(page)
    check("final register persists",
          [c["name"] for c in final["classes"]] == ["Class 1", "2 Cerdik", "Class 3", "Class 4", "Class 5"],
          [c["name"] for c in final["classes"]])
    check("the moved pupil is still in Class 4",
          [s["name"] for s in [c for c in final["classes"] if c["name"] == "Class 4"][0]["students"]] == [NAMES[9]])

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
