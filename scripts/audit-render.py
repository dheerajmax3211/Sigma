#!/usr/bin/env python3
"""Render audit: does every page actually contain what we claim it does?

Checks the served HTML, not the YAML. A field can exist and never render —
that was the exact defect in the note pages, where 5,000-word blueprints
rendered as 600-word cards because the component ignored them.
"""
import json
import re
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:4310"
GH = "https://raw.githubusercontent.com"  # unused; kept for offline lint


def get(path: str, timeout: int = 25) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa: BLE001
        return 0, f"__ERR__{e}"


def main() -> int:
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    topics = sorted((root / "content" / "tracks").glob("*/topics/*.yaml"))
    ids = []
    for f in topics:
        m = re.search(r"^id:\s*(\S+)\s*$", f.read_text(), re.MULTILINE)
        if m:
            ids.append((m.group(1).strip("\"'"), f))

    notes = []
    for f in sorted((root / "content" / "notes").glob("*.yaml")):
        notes.append(f.stem)

    # Pages whose formulas genuinely contain Greek/operator symbols.
    GREEK_MATH_PAGES = {
        "backpropagation", "matrix-calculus", "attention-from-first-principles",
        "transformer-block", "preference-optimisation", "gradient-descent-variants",
        "cs-llm-serving", "information-theory",
        "probability-and-likelihood", "convexity-and-duality",
    }

    fails = []

    # ── Every topic page ────────────────────────────────────────────────
    for tid, path in ids:
        code, html = get(f"/topic/{tid}")
        if code != 200:
            fails.append((tid, "topic", f"HTTP {code}"))
            continue
        # The lesson is now a four-step stepper: only step 1 is in the initial
        # HTML, so the drill/interview/warning blocks live in the RSC payload
        # until the learner advances. Assert the stepper is real, then assert
        # the step-3 content is present in the payload rather than the DOM.
        flat = html.replace("<!-- -->", "")
        if "Step 1 of 4" not in flat:
            fails.append((tid, "topic", "missing four-step stepper"))
        if "Next:" not in flat:
            fails.append((tid, "topic", "missing step navigation"))
        # Step 3 is deep-linkable, so fetch it explicitly rather than guessing
        # from the initial payload.
        code3, html3 = get(f"/topic/{tid}?step=3")
        flat3 = html3.replace("<!-- -->", "") if code3 == 200 else ""
        for marker, label in (
            ("Start the exercise", "timed drill (try_it card)"),
            ("What they will ask you", "interview-questions block"),
            ("Watch out for this", "'Watch out for this' block"),
        ):
            if marker not in flat3:
                fails.append((tid, "topic", f"missing {label} at step 3"))
        # Symbol layer: checked on pages that actually carry Greek math.
        # A blanket "katex present => tooltips" test is a false positive: the
        # Σ in the drawer button and ASCII-only formulas both trip it.
        if tid in GREEK_MATH_PAGES:
            # Formulas live in step 2 (Visual & math), so check there.
            c2, h2 = get(f"/topic/{tid}?step=2")
            if c2 != 200 or 'class="sym-tip"' not in h2.replace("<!-- -->", ""):
                fails.append((tid, "topic", "Greek math present but no symbol tooltips at step 2"))
        # Global layers.
        if "Open Code Playground" not in html:
            fails.append((tid, "topic", "missing code drawer launcher"))

    # ── Every note page ────────────────────────────────────────────────
    for nid in notes:
        code, html = get(f"/note/{nid}")
        if code != 200:
            fails.append((nid, "note", f"HTTP {code}"))
            continue
        for label in ("Overview", "Architecture", "Capacity Math", "Interview Probes"):
            if label not in html:
                fails.append((nid, "note", f"missing tab {label!r}"))
        if "60-second" not in html.lower():
            fails.append((nid, "note", "missing 60-second version"))

    # ── Global routes ──────────────────────────────────────────────────
    for path in ("/", "/roadmap", "/notes", "/interview", "/lab", "/news", "/profile", "/tracks", "/start"):
        code, html = get(path)
        if code != 200:
            fails.append((path, "route", f"HTTP {code}"))
            continue
        if "symbol dictionary" not in html and "Σ" not in html:
            fails.append((path, "route", "missing symbol dictionary button"))
        if "◈" not in html and "Local AI" not in html:
            fails.append((path, "route", "missing mascot"))

    # ── Roadmap width ──────────────────────────────────────────────────
    _, rm = get("/roadmap")
    if "Explore the dependencies" not in rm and "Explore dependencies" not in rm:
        fails.append(("/roadmap", "route", "missing collapsed explorer"))
    if rm.count("<svg") and "3,500" in rm:
        fails.append(("/roadmap", "route", "still mentions the old graph"))

    print(json.dumps({
        "topics_checked": len(ids),
        "notes_checked": len(notes),
        "failures": len(fails),
        "detail": fails[:40],
    }, indent=2))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
