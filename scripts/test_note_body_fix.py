#!/usr/bin/env python3
"""Task 20 pre-build sanity: run the TS sanitizer logic (ported here) over
real corpus samples to confirm the transforms before compiling."""
import json, re
from pathlib import Path

HEADING_RE = re.compile(r"^(#{1,4})\s+(.+?)\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
CHIP_LINE_RE = re.compile(r"^\s*>\s*\*\*Spec point\*\*")
CHIP_ID_ONLY_RE = re.compile(r"^[ \t]*>[ \t]*\*\*Spec point\*\*[ \t]*[—–-][ \t]*(`)?spcpt_[A-Za-z0-9_-]+(`)?[ \t]*$", re.M)
CHIP_ID_MIDDLE_RE = re.compile(r"(`)?spcpt_[A-Za-z0-9_-]+(`)?(\s*·\s*)")


def strip_leading_title(body, title):
    t = title.strip().lower()
    body = re.sub(r"^\s*#\s+([^\n]+)\n?", lambda m: "" if m.group(1).strip().lower() == t else m.group(0), body, count=1)
    body = re.sub(r"^\s*##\s+([^\n]+)\n+", lambda m: "" if m.group(1).strip().lower() == t else m.group(0), body, count=1)
    return body


def collapse_dup_headings(body):
    lines = body.split("\n")
    out, pending_idx, pending_text, in_fence = [], -1, "", False
    for line in lines:
        if FENCE_RE.match(line):
            pending_idx, pending_text = -1, ""
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence:
            m = HEADING_RE.match(line)
            if m:
                text = m.group(2).strip().lower()
                if pending_idx >= 0 and text == pending_text:
                    continue
                pending_idx = len(out)
                pending_text = text
                out.append(line)
                continue
            if line.strip() and not CHIP_LINE_RE.match(line):
                pending_idx, pending_text = -1, ""
        out.append(line)
    return "\n".join(out)


def sanitize(body, title):
    md = strip_leading_title(body, title)
    md = CHIP_ID_ONLY_RE.sub("", md)
    md = CHIP_ID_MIDDLE_RE.sub(" ", md)
    return collapse_dup_headings(md)


# ── corpus-wide simulation ──────────────────────────────────────────────
leak_pat = re.compile(r"^>\s*\*\*Spec point\*\*\s*—\s*`spcpt_[A-Za-z0-9_-]+`\s*$", re.M)
head_re = re.compile(r"^(#{1,4})\s+(.+?)\s*$", re.M)
total_leak_after = 0
total_dup_after = 0
pilot_text_kept = 0
pilot_id_leak = 0
for d in sorted(Path("content").iterdir()):
    if not (d / "notes.json").exists():
        continue
    for n in json.loads((d / "notes.json").read_text()):
        out = sanitize(n["bodyMd"], n["title"])
        total_leak_after += len(re.findall(r"spcpt_[A-Za-z0-9_-]+", out))
        # dup heading count post-sanitize (window: only blank lines between)
        lines = out.split("\n")
        heads = [(i, m.group(2).strip().lower()) for i, m in enumerate((HEADING_RE.match(l), l)[0:1] and [(m.group(2), m) for m in [None]] or [(None, None)] for m in [None])] if False else [(i, m.group(2).strip().lower()) for i, l in enumerate(lines) for m in [HEADING_RE.match(l)] if m]
        for k in range(len(heads) - 1):
            i1, t1 = heads[k]
            i2, t2 = heads[k + 1]
            between = lines[i1 + 1:i2]
            if t1 == t2 and all(l.strip() == "" for l in between):
                total_dup_after += 1
    # pilot text chips keep readable text
    if d.name == "igcse-chemistry-19":
        for n in json.loads((d / "notes.json").read_text()):
            out = sanitize(n["bodyMd"], n["title"])
            pilot_text_kept += len(re.findall(r"Spec point\*\* — [^`\n]", out))
print(f"spcpt_ refs remaining after sanitize (corpus-wide): {total_leak_after}")
print(f"adjacent blank-separated duplicate headings remaining: {total_dup_after}")
print(f"pilot readable spec-text chips kept: {pilot_text_kept}")

# ── fence safety spot test ──────────────────────────────────────────────
fence_test = "# T\n\n## A\n\n```py\n# A\nprint(1)\n```\n\n## A\n\n- real content\n"
print("fence test collapses safely (no heading inside fence treated as dup):",
      collapse_dup_headings(fence_test).count("## A") == 2)

# ── idempotency ─────────────────────────────────────────────────────────
notes = json.loads(Path("content/ial-biology-18/notes.json").read_text())
n = [x for x in notes if x["noteId"] == "rn_b945nQSBby2tWXy7"][0]
once = sanitize(n["bodyMd"], n["title"])
twice = sanitize(once, n["title"])
print("idempotent:", once == twice)
print("--- ial-biology sample after sanitize (first 300):")
print(once[:300])
