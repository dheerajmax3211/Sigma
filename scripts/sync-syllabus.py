#!/usr/bin/env python3
"""
Rebuild `content/syllabus.yaml` topic lists from what is actually on disk.

Why this exists: the syllabus had drifted into a wish-list. It declared 92
topics across 7 tracks while 78 files existed, referenced topics that were never
written (`cs-feature-stores`, `cost-of-a-bad-model`), and omitted every topic
authored since. The loader never reads it for membership — the directory and its
`track.yaml` are authoritative — so the drift was invisible until a validator
compared the two.

After this runs, the syllabus is a *derived ordering*: every entry exists, every
topic is listed, and `pos`/`prereq`/`title` come from the topic file itself.

Track order is preserved from the existing syllabus; tracks not yet listed are
appended in `sortOrder` order.

Usage: python3 scripts/sync-syllabus.py [--dry-run]
"""

from __future__ import annotations

import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYLLABUS = os.path.join(ROOT, "content", "syllabus.yaml")
TRACKS = os.path.join(ROOT, "content", "tracks")


def load_tracks() -> list[dict]:
    """Every track that actually exists, with its topics in file order."""
    out = []
    for track_file in sorted(glob.glob(os.path.join(TRACKS, "*", "track.yaml"))):
        meta = (yaml.safe_load(open(track_file, encoding="utf-8")) or {}).get("track") or {}
        if not meta.get("id"):
            continue
        topics = []
        for topic_file in glob.glob(os.path.join(os.path.dirname(track_file), "topics", "*.yaml")):
            d = yaml.safe_load(open(topic_file, encoding="utf-8")) or {}
            if not d.get("id"):
                continue
            topics.append(
                {
                    "id": d["id"],
                    "pos": d.get("position", 0),
                    "prereq": d.get("prerequisites", []) or [],
                    "title": d.get("title", d["id"]),
                }
            )
        topics.sort(key=lambda t: (t["pos"], t["id"]))
        out.append({"meta": meta, "topics": topics})
    return out


def main() -> int:
    dry = "--dry-run" in sys.argv
    existing = yaml.safe_load(open(SYLLABUS, encoding="utf-8")) or {}

    tracks = load_tracks()
    # Order by the curriculum's own fields, not by the old syllabus order: the
    # old file used different ids for two tracks (`vision-multimodal`), so
    # matching on id silently demoted them to the end.
    ordered = sorted(
        tracks, key=lambda t: (t["meta"].get("tier", 99), t["meta"].get("sortOrder", 99), t["meta"]["id"])
    )

    result_tracks = []
    for t in ordered:
        m = t["meta"]
        result_tracks.append(
            {
                "id": m["id"],
                "title": m.get("title", m["id"]),
                "slug": m.get("slug", m["id"]),
                "tier": m.get("tier", 0),
                "sortOrder": m.get("sortOrder", 0),
                "outcomes": m.get("outcomes", []),
                "topics": t["topics"],
            }
        )

    doc = {"version": existing.get("version", 1), "tracks": result_tracks}
    text = yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100)

    total = sum(len(t["topics"]) for t in result_tracks)
    print(f"tracks: {len(result_tracks)}  topics: {total}")
    for t in result_tracks:
        print(f"  {t['id']:<18} {len(t['topics']):>3} topics")

    if dry:
        print("(dry run — not written)")
        return 0
    open(SYLLABUS, "w", encoding="utf-8").write(text)
    print("wrote", SYLLABUS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
