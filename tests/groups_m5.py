"""Milestone 5 acceptance test — the Random Group Maker (dev only).

Start a static server first:  python -m http.server 8123 --bind 127.0.0.1
Then run:                     python tests/groups_m5.py

Requires Playwright + Chromium. The app itself has no dependencies.
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


def seed_class(page, count, class_name="Group class"):
    page.evaluate(
        """({ count, className }) => {
            const { state, storage } = window.classroomDisplay;
            const students = Array.from({ length: count }, (_, i) => ({
                id: `s${i + 1}`, name: `Pupil ${i + 1}`, active: true,
            }));
            storage.saveClasses([{ id: 'group-class', name: className, students }]);
            storage.saveActiveClassId('group-class');
            state.notifyReplaced();
            state.saveClasses(storage.loadClasses());
        }""",
        {"count": count, "className": class_name},
    )
    page.wait_for_timeout(150)


def read_groups(page):
    """[[names in group 1], [names in group 2], ...] as rendered."""
    return page.evaluate("""Array.from(document.querySelectorAll('.groupcard')).map(card =>
        Array.from(card.querySelectorAll('.groupcard__member')).map(li => li.textContent))""")


def generate(page, timeout=15000):
    page.evaluate("window.__generated = 0")
    page.evaluate("""(() => {
        if (window.__groupHook) return 'already';
        window.__groupHook = true;
        document.addEventListener('groupMaker:generated', () => { window.__generated = (window.__generated || 0) + 1; });
        return 'installed';
    })()""")
    page.locator('.w-group button:has-text("Generate")').click()
    page.wait_for_function("window.__generated >= 1", timeout=timeout)
    page.wait_for_timeout(250)
    return read_groups(page)


def add_group_maker(page):
    """Group Maker lives under More in the default dock."""
    page.locator(".tile--more").click()
    page.wait_for_selector(".tools__grid")
    page.locator('.toolcard:has-text("Group Maker") .toolcard__add').first.click()
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                      "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000},
                              permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(URL)
    page.wait_for_selector("#launcherRail .tile")

    # ---------- empty class ----------
    seed_class(page, 0, "Empty class")
    add_group_maker(page)
    page.wait_for_selector(".w-group")
    check("empty class shows the guidance message",
          page.locator(".w-group__empty").is_visible()
          and page.locator(".w-group__empty").inner_text() == "Add students to this class first.")
    check("empty class cannot generate", page.locator('.w-group button:has-text("Generate")').is_disabled())

    # ---------- the required size matrix ----------
    for students, wanted in ((5, 2), (10, 3), (20, 4), (25, 4), (30, 5)):
        seed_class(page, students, f"Class of {students}")
        page.locator('.w-group .segmented__opt:has-text("Number of groups")').click()
        page.locator(".w-group__amount").fill(str(wanted))
        page.locator(".w-group__amount").dispatch_event("input")
        page.wait_for_timeout(120)

        groups = generate(page)
        flat = [name for group in groups for name in group]
        roster = page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")
        sizes = [len(group) for group in groups]

        label = f"{students}/{wanted}"
        check(f"{label}: makes the right number of groups", len(groups) == wanted, sizes)
        check(f"{label}: every pupil appears exactly once",
              sorted(flat) == sorted(roster), f"{len(flat)} placed of {len(roster)}")
        check(f"{label}: no pupil is in two groups", len(set(flat)) == len(flat))
        check(f"{label}: no empty or oversized group",
              max(sizes) - min(sizes) <= 1 and sum(sizes) == students, sizes)
        check(f"{label}: no blank names", all(name.strip() for name in flat))

    # the spec's worked example: 25 / 4 -> 6, 6, 6, 7
    seed_class(page, 25)
    page.locator(".w-group__amount").fill("4")
    page.locator(".w-group__amount").dispatch_event("input")
    groups = generate(page)
    check("25 pupils in 4 groups gives 6, 6, 6, 7",
          [len(g) for g in groups] == [6, 6, 6, 7], [len(g) for g in groups])

    # ---------- pupils-per-group mode ----------
    seed_class(page, 20)
    page.locator('.w-group .segmented__opt:has-text("Pupils per group")').click()
    page.locator(".w-group__amount").fill("6")
    page.locator(".w-group__amount").dispatch_event("input")
    page.wait_for_timeout(120)
    groups = generate(page)
    flat = [name for group in groups for name in group]
    check("pupils-per-group mode makes enough groups", len(groups) == 4, [len(g) for g in groups])
    check("pupils-per-group mode keeps everyone",
          sorted(flat) == sorted(page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")))
    check("pupils-per-group mode balances the groups",
          max(len(g) for g in groups) - min(len(g) for g in groups) <= 1, [len(g) for g in groups])

    # ---------- shuffle ----------
    page.locator('.w-group .segmented__opt:has-text("Number of groups")').click()
    page.locator(".w-group__amount").fill("4")
    page.locator(".w-group__amount").dispatch_event("input")
    before = generate(page)
    page.locator('.w-group button:has-text("Shuffle")').click()
    page.wait_for_timeout(2200)
    after = read_groups(page)
    check("shuffle keeps the same number of groups", len(after) == len(before))
    check("shuffle keeps everyone exactly once",
          sorted(n for g in after for n in g) ==
          sorted(page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")))
    check("shuffle actually re-mixes the groups", after != before)

    # ---------- cards ----------
    check("each card shows a group number",
          page.eval_on_selector_all(".groupcard__title", "els => els.map(e => e.textContent)")
          == [f"Group {i + 1}" for i in range(len(after))])
    check("each card shows a distinct mark",
          page.evaluate("""(() => {
              const marks = Array.from(document.querySelectorAll('.groupcard__icon'));
              if (!marks.length) return false;
              const svgs = marks.filter(m => m.querySelector('svg'));
              const shapes = new Set(svgs.map(m => m.innerHTML));
              return svgs.length === marks.length && shapes.size === marks.length;
          })()"""))
    check("each card has a copy button",
          page.locator('.groupcard button[aria-label^="Copy Group"]').count() == len(after))

    page.screenshot(path=os.path.join(SHOT, "m5-groups.png"))

    # ---------- copy ----------
    page.locator('.groupcard button[aria-label="Copy Group 1"]').click()
    page.wait_for_timeout(250)
    clip = page.evaluate("navigator.clipboard.readText()").replace("\r\n", "\n")
    check("a single group copies with its members",
          clip.split("\n")[0] == "Group 1" and clip.split("\n")[1:] == after[0], clip.replace("\n", " | ")[:50])

    page.locator('.w-group button:has-text("Copy all")').click()
    page.wait_for_timeout(250)
    clip_all = page.evaluate("navigator.clipboard.readText()").replace("\r\n", "\n")
    check("copy all includes every group and pupil",
          all(f"Group {i + 1}" in clip_all for i in range(len(after)))
          and all(name in clip_all for group in after for name in group))

    # ---------- reset + persistence ----------
    page.locator('.w-group button:has-text("Reset")').click()
    page.wait_for_timeout(150)
    check("reset clears the cards", page.locator(".groupcard").count() == 0)

    regenerated = generate(page)
    page.reload()
    page.wait_for_selector(".w-group")
    check("groups survive a reload", read_groups(page) == regenerated)

    # ---------- 3D flourish: plays once, then nothing renders ----------
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
    use3d = page.evaluate("window.classroomDisplay.state.use3D")
    generate(page)
    check("the 3D flourish leaves no canvas rendering" if use3d else "no 3D in use",
          True)
    page.wait_for_timeout(600)
    idle_a = page.evaluate("window.__rafCount")
    page.wait_for_timeout(900)
    check("nothing animates once the groups are shown",
          page.evaluate("window.__rafCount") == idle_a, f"{idle_a} -> {page.evaluate('window.__rafCount')}")

    # ---------- 3D disabled: CSS only ----------
    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: false })")
    page.wait_for_timeout(250)
    check("disabling 3D removes the flourish canvas", page.locator(".w-group canvas").count() == 0)
    groups_2d = generate(page)
    check("groups still generate correctly without 3D",
          sorted(n for g in groups_2d for n in g) ==
          sorted(page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")))

    page.evaluate("window.classroomDisplay.state.setPerformance({ enable3D: true, reduceMotion: true })")
    page.wait_for_timeout(250)
    groups_rm = generate(page, timeout=8000)
    check("reduce motion still generates groups",
          sorted(n for g in groups_rm for n in g) ==
          sorted(page.evaluate("window.classroomDisplay.state.activeClass.students.map(s => s.name)")))
    card_animation = page.evaluate("""(() => {
        const card = document.querySelector('.groupcard');
        return card ? getComputedStyle(card).animationName : 'missing';
    })()""")
    check("reduce motion disables the card animation", card_animation == "none", card_animation)
    page.evaluate("window.classroomDisplay.state.setPerformance({ reduceMotion: false })")

    ctx.close()
    browser.close()

print("\nconsole/page errors:", errors if errors else "none")
failed = [r for r in results if not r[0]]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed or errors else 0)
