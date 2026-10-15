"""The Image widget (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/image_m11.py

Generates its own test pictures — nothing is downloaded.
"""

import os
import struct
import sys
import tempfile
import zlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8123/"
KEY = "classroomDisplay:v1"

results = []
errors = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))
    print(("ok    " if condition else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


def make_png(path, width, height, colour=(20, 184, 166)):
    """Write a plain PNG without any third-party library."""
    raw = b"".join(b"\x00" + bytes(colour) * width for _ in range(height))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 6))
           + chunk(b"IEND", b""))
    with open(path, "wb") as handle:
        handle.write(png)
    return path


def stored_image(page):
    return page.evaluate(f"""(() => {{
        const data = JSON.parse(localStorage.getItem('{KEY}')).widgetData;
        const key = Object.keys(data).find(k => k.startsWith('image'));
        return key ? data[key] : null;
    }})()""")


def point_at(widget):
    """A card's tools show on the selected card under the pointer, as a teacher would use them."""
    widget.dispatch_event("pointerdown")
    widget.hover(position={"x": 12, "y": 12}, force=True)


with sync_playwright() as p:
    tmp = tempfile.mkdtemp(prefix="classroom-images-")
    small = make_png(os.path.join(tmp, "beaker.png"), 320, 240)
    huge = make_png(os.path.join(tmp, "microscope.png"), 3200, 2400, (56, 189, 248))

    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # Every request the page makes, so "nothing is uploaded" can be proven.
    requests = []
    page.on("request", lambda r: requests.append((r.method, r.url)))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")
    page.locator('#launcherRail .tile:has-text("Image")').first.click()
    page.wait_for_selector(".w-image")

    # ---------- empty state ----------
    check("the image widget starts empty", page.locator(".w-image__empty").is_visible())
    check("it explains where the file goes",
          "nothing is uploaded" in page.locator(".w-image__note").inner_text())
    check("no picture element is shown yet", page.locator(".w-image__picture").is_visible() is False)
    check("the toolbar is hidden until there is a picture",
          page.locator(".w-image__toolbar").is_visible() is False)

    # ---------- choosing a file ----------
    page.locator(".w-image__file").set_input_files(small)
    page.wait_for_timeout(800)
    check("the picture appears", page.locator(".w-image__picture").is_visible())
    check("the picture actually decoded",
          page.evaluate("""(() => {
              const img = document.querySelector('.w-image__picture');
              return img.complete && img.naturalWidth > 0;
          })()"""))
    saved = stored_image(page)
    check("the picture is stored locally as a data URL",
          bool(saved) and saved["src"].startswith("data:image/"), (saved or {}).get("src", "")[:24])
    off_box = [f"{m} {u}" for m, u in requests if not u.startswith(URL)]
    uploads = [f"{m} {u}" for m, u in requests if m not in ("GET", "HEAD")]
    check("nothing left this computer", not off_box and not uploads, (off_box + uploads)[:2])
    check("a description is filled in from the file name",
          (saved or {}).get("alt") == "beaker", (saved or {}).get("alt"))
    check("the description reaches the picture",
          page.locator(".w-image__picture").get_attribute("alt") == "beaker")

    # ---------- a very large picture is shrunk, not refused ----------
    page.locator(".w-image__file").set_input_files(huge)
    page.wait_for_timeout(1500)
    big = stored_image(page)
    check("a 3200px picture is accepted", bool(big) and big["src"].startswith("data:image/"))
    check("it was shrunk to fit storage", len(big["src"]) < 700000, f"{len(big['src']) // 1024} KB of characters")
    check("the shrunk picture still renders",
          page.evaluate("""(() => {
              const img = document.querySelector('.w-image__picture');
              return img.complete && img.naturalWidth > 0 && img.naturalWidth <= 1280;
          })()"""))

    # ---------- settings ----------
    point_at(page.locator('.widget[data-widget="image"]'))
    page.locator('.widget[data-widget="image"] [data-role="settings"]').click()
    page.wait_for_selector(".modal")
    page.locator('.modal .segmented__opt:has-text("Fill the card")').click()
    page.wait_for_timeout(200)
    check("the fit can be changed",
          page.locator(".w-image__picture").evaluate("el => getComputedStyle(el).objectFit") == "cover")
    page.locator('.modal input[type="text"]').last.fill("A microscope on the bench")
    page.wait_for_timeout(300)
    check("a description can be written",
          page.locator(".w-image__picture").get_attribute("alt") == "A microscope on the bench")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # ---------- persistence ----------
    page.reload()
    page.wait_for_selector(".w-image")
    page.wait_for_timeout(800)
    check("the picture survives a reload", page.locator(".w-image__picture").is_visible())
    check("its description survives too",
          page.locator(".w-image__picture").get_attribute("alt") == "A microscope on the bench")
    check("its fit survives too",
          page.locator(".w-image__picture").evaluate("el => getComputedStyle(el).objectFit") == "cover")

    # ---------- remove ----------
    page.locator('.w-image button:has-text("Remove")').click()
    page.wait_for_timeout(300)
    check("the picture can be removed", page.locator(".w-image__empty").is_visible())
    check("removing it frees the storage", (stored_image(page) or {}).get("src") == "")

    # ---------- a full quota is reported, not swallowed ----------
    page.evaluate("""(() => {
        window.__realSet = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function (key, value) {
            if (key === 'classroomDisplay:v1') {
                const error = new Error('quota');
                error.name = 'QuotaExceededError';
                throw error;
            }
            return window.__realSet(key, value);
        };
        return 'storage stubbed full';
    })()""")
    page.locator(".w-image__file").set_input_files(small)
    page.wait_for_timeout(900)
    check("a full storage is reported to the teacher",
          page.locator('.toast:has-text("storage is full")').count() >= 1)
    check("the app keeps working when storage is full",
          page.locator(".w-image__picture").is_visible() and page.locator(".widget").count() == 1)
    check("saving is not switched off wholesale",
          page.evaluate("window.classroomDisplay.storage.available") is True)
    # wrapped so the expression does not evaluate to a function, which
    # Playwright would then call with no arguments
    page.evaluate("(() => { localStorage.setItem = window.__realSet; return 'restored'; })()")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
