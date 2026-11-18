#!/usr/bin/env python3
"""
Apply the "loop" fields (try_it / interview_questions / common_mistakes /
further_reading) to topic YAML files by *appending text*.

Why a fragment applier instead of a YAML round-trip:

  The authoring rules allow LaTeX in block scalars (`|`, `>`) where backslashes
  are literal. A `yaml.safe_load` + `yaml.safe_dump` round-trip rewrites those
  block scalars as double-quoted strings, and in a double-quoted YAML scalar a
  backslash IS an escape character — `\\sigma` silently becomes `\sigma` and
  matrix row separators (`\\\\`) get mangled. The corpus would look fine and
  render wrong.

  Every topic file ends with `body:` as its last top-level key and keeps body's
  children at two-space indent, so appending a two-space-indented fragment is
  both safe and lossless.

Usage:
    python3 scripts/apply-loop.py [--dry-run]

Fragments live in content/loop/<topic-id>.yaml and are plain YAML starting at
two-space indent, e.g.

      try_it: >-
        Take the 2x2 matrix ...
      interview_questions:
        - question: "Why ...?"
          level: mid
          key_points:
            - "..."
            - "..."
      common_mistakes:
        - "..."
      further_reading:
        - label: "..."
          url: "https://..."

The script is idempotent: a topic that already has `try_it` is skipped.
"""

from __future__ import annotations

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = os.path.join(ROOT, "content", "tracks")
FRAGMENTS = os.path.join(ROOT, "content", "loop")

REQUIRED = ("try_it", "interview_questions", "common_mistakes", "further_reading")

TOPIC_ID_RE = re.compile(r"^id:\s*(\S+)\s*$", re.MULTILINE)


def index_topics() -> dict[str, str]:
    """Map topic id -> file path, using the file's own `id:` line."""
    out: dict[str, str] = {}
    for path in glob.glob(os.path.join(TOPICS, "*", "topics", "*.yaml")):
        head = open(path, encoding="utf-8").read()
        m = TOPIC_ID_RE.search(head)
        if m:
            out[m.group(1).strip("\"'")] = path
    return out


def has_loop(text: str) -> bool:
    return bool(re.search(r"^  try_it:", text, re.MULTILINE))


def indent_ok(text: str) -> bool:
    """Every non-blank line must be indented at least two spaces."""
    for line in text.splitlines():
        if line.strip() and not line.startswith("  "):
            return False
    return True


def main() -> int:
    dry = "--dry-run" in sys.argv
    topics = index_topics()
    frags = sorted(glob.glob(os.path.join(FRAGMENTS, "*.yaml")))
    if not frags:
        print("no fragments found in content/loop/")
        return 0

    applied, skipped, errors = 0, 0, []
    for frag in frags:
        tid = os.path.splitext(os.path.basename(frag))[0]
        path = topics.get(tid)
        if not path:
            errors.append(f"{tid}: no topic with that id")
            continue
        text = open(path, encoding="utf-8").read()
        if has_loop(text):
            skipped += 1
            continue
        body = open(frag, encoding="utf-8").read().rstrip("\n")
        if not indent_ok(body):
            errors.append(f"{tid}: fragment contains an unindented line")
            continue
        for key in REQUIRED:
            if not re.search(rf"^  {key}:", body, re.MULTILINE):
                errors.append(f"{tid}: fragment missing `{key}`")
                break
        else:
            if not dry:
                with open(path, "a", encoding="utf-8") as fh:
                    fh.write("\n" + body + "\n")
            applied += 1

    for e in errors:
        print("  ✗", e)
    print(f"{'would apply' if dry else 'applied'}: {applied}  already had loop: {skipped}  errors: {len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
