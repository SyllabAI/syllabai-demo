#!/usr/bin/env python3
"""Task 19 follow-ups: render-time duplicate headings, outbound links in
question bodies, flashcard hygiene, failed-asset image reachability."""
import json, re, html
from pathlib import Path
from collections import Counter

ROOT = Path("/home/z/my-project")
CONTENT = ROOT / "content"

# ── 1. TRUE render-time adjacent duplicate headings ────────────────────
# simulate reader strip: leading H1/H2 equal to note title (once each)
head_re = re.compile(r"^(#{1,4})\s+(.+?)\s*$", re.M)
total_pairs = 0
notes_hit = 0
course_counts = Counter()
examples = []
for d in sorted(CONTENT.iterdir()):
    if not (d / "notes.json").exists():
        continue
    notes = json.loads((d / "notes.json").read_text())
    c = 0
    for n in notes:
        title = n["title"].strip().lower()
        b = n["bodyMd"]
        # reader strip simulation
        b = re.sub(r"^\s*#\s+([^\n]+)\n?", lambda m: "" if m.group(1).strip().lower() == title else m.group(0), b, count=1)
        b = re.sub(r"^\s*##\s+([^\n]+)\n+", lambda m: "" if m.group(1).strip().lower() == title else m.group(0), b, count=1)
        heads = [(m.start(), m.group(2).strip().lower().replace("*", "").replace("`", "")) for m in head_re.finditer(b)]
        pairs = 0
        for i in range(len(heads)):
            for j in range(i + 1, min(i + 4, len(heads))):
                if heads[i][1] and heads[i][1] == heads[j][1] and (heads[j][0] - heads[i][0]) < 260:
                    pairs += 1
                    if len(examples) < 6 and d.name not in {e[0] for e in examples}:
                        seg = b[heads[i][0]:min(heads[j][0] + 120, len(b))]
                        examples.append((d.name, n["noteId"], seg[:220].replace("\n", " ⏎ ")))
                    break
        c += pairs
        if pairs:
            notes_hit += 1
    if c:
        course_counts[d.name] = c
    total_pairs += c
print(f"[1] render-visible adjacent duplicate heading pairs: {total_pairs} in {notes_hit} notes; "
      f"{len(course_counts)} courses; worst: {course_counts.most_common(5)}")
for e in examples:
    print("   e.g.", e[0], e[1], "::", e[1] and e[2][:180])

# ── 2. outbound links in question problem/solution bodies ──────────────
pat = re.compile(r"\]\((https?://[^)]*)\)")
hosts = Counter()
for d in sorted(CONTENT.iterdir()):
    if not (d / "questions.json").exists():
        continue
    for t in json.loads((d / "questions.json").read_text()):
        for q in t.get("questions") or []:
            for p in q.get("parts") or []:
                for f in ("problemMd", "solutionMd"):
                    for m in pat.finditer(p.get(f) or ""):
                        hosts[re.match(r"https?://([^/]+)", m.group(1)).group(1)] += 1
print(f"[2] links inside question bodies by host: {dict(hosts.most_common(8))}")

# ── 3. flashcard front/back hygiene: raw ids, brand, links ────────────
raw = re.compile(r"\b(?:spcpt|sbt|sec|top)_[A-Za-z0-9_-]+")
brand = re.compile(r"save\s*my\s*exams", re.I)
fr = fb = br = 0
courses = set()
for d in sorted(CONTENT.iterdir()):
    if not (d / "flashcards.json").exists():
        continue
    for c in json.loads((d / "flashcards.json").read_text()):
        for f in ("front", "back"):
            txt = c.get(f) or ""
            if raw.search(txt):
                fr += 1
                courses.add(d.name)
            if brand.search(txt):
                br += 1
print(f"[3] flashcard sides containing raw corpus ids: {fr} (in {len(courses)} courses: {sorted(courses)[:5]}); brand mentions: {br}")

# ── 4. all image srcs in note bodies grouped by host ──────────────────
img = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)")
imghosts = Counter()
for d in sorted(CONTENT.iterdir()):
    if not (d / "notes.json").exists():
        continue
    for n in json.loads((d / "notes.json").read_text()):
        for m in img.finditer(n.get("bodyMd") or ""):
            imghosts[re.match(r"https?://([^/]+)", m.group(1)).group(1)] += 1
print(f"[4] note image hosts: {dict(imghosts.most_common(8))}")
