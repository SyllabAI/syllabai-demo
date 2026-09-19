#!/usr/bin/env python3
"""Task 17 audit: does the tree hide multiple notes / question sets per sub-topic?

Replicates src/lib/spec-tree.ts mapping exactly:
  subtopicOfNote: note.specPointCodes -> subtopicOfSpecPoint; else note.topicSlug if in subtopicByCode;
                  else note.specPointIds -> subtopicOfSpecPoint
  subtopicOfQuestionSet: topic.topicSlug if in subtopicByCode; else spec-anchor tally (majority)
  subtopicOfFlashcard: card.subtopicCode -> specPointIds -> specPointCode -> source note -> topicSlug

Then reports, per course: subtopics with >1 note, >1 question SET, and what the
sidebar hrefs (last-write-wins) would point at vs. what exists.
"""
import json, os, re, sys
from collections import defaultdict, Counter

CONTENT = os.path.join(os.path.dirname(__file__), "..", "content")


def load(course):
    d = os.path.join(CONTENT, course)
    rd = lambda f: json.load(open(os.path.join(d, f)))
    return rd("curriculum.json"), rd("notes.json"), rd("questions.json"), rd("flashcards.json")


def build_index(cur):
    """returns (subtopics ordered, subtopicOfSpecPoint, subtopicByCode set)"""
    nodes = cur["nodes"]
    topics = [n for n in nodes if n.get("family") == "TOPIC"]
    topics.sort(key=lambda n: (n.get("order", 10**9), n["code"]))
    subs = []  # (code, topic_code, [specpoint codes])
    sub_of_sp = {}
    sub_codes = set()
    for t in topics:
        tsubs = [n for n in nodes if n.get("family") == "SUBTOPIC" and t["code"] in n.get("parents", [])]
        tsubs.sort(key=lambda n: (n.get("order", 10**9), n["code"]))
        orphan = []
        seen = set()
        for j, s in enumerate(tsubs):
            pts = [n["code"] for n in nodes if n.get("family") == "SPEC_POINT" and s["code"] in n.get("parents", [])]
            pts.sort(key=lambda c: (int(re.findall(r"\d+", c)[1]) if len(re.findall(r"\d+", c)) > 1 else 0,))
            for c in pts:
                sub_of_sp[c] = s["code"]
                seen.add(c)
            subs.append((s["code"], t["code"], pts))
            sub_codes.add(s["code"])
        for n in nodes:
            if n.get("family") == "SPEC_POINT" and t["code"] in n.get("parents", []) and n["code"] not in seen:
                orphan.append(n["code"])
        if orphan:
            gen = f'{t["code"]}-gen'
            subs.append((gen, t["code"], orphan))
            sub_codes.add(gen)
            for c in orphan:
                sub_of_sp[c] = gen
    return subs, sub_of_sp, sub_codes


def subtopic_of_note(note, sub_of_sp, sub_codes):
    for c in note.get("specPointCodes") or []:
        if c in sub_of_sp:
            return sub_of_sp[c]
    if note.get("topicSlug") and note["topicSlug"] in sub_codes:
        return note["topicSlug"]
    for i in note.get("specPointIds") or []:
        if i in sub_of_sp:
            return sub_of_sp[i]
    return None


def subtopic_of_set(topic, sub_of_sp, sub_codes):
    if topic.get("topicSlug") and topic["topicSlug"] in sub_codes:
        return topic["topicSlug"]
    tally = Counter()
    for q in topic.get("questions", []):
        codes = set()
        for p in q.get("parts", []):
            for c in (p.get("specPointCodes") or []) + (p.get("specPointIds") or []):
                if c in sub_of_sp:
                    codes.add(sub_of_sp[c])
        for s in codes:
            tally[s] += 1
    return tally.most_common(1)[0][0] if tally else None


def audit(course):
    cur, notes, sets, cards = load(course)
    subs, sub_of_sp, sub_codes = build_index(cur)
    notes_by_sub = defaultdict(list)
    sets_by_sub = defaultdict(list)
    unplaced_notes = []
    for n in notes:
        s = subtopic_of_note(n, sub_of_sp, sub_codes)
        if s:
            notes_by_sub[s].append(n["noteId"])
        else:
            unplaced_notes.append(n["noteId"])
    unplaced_sets = []
    for t in sets:
        s = subtopic_of_set(t, sub_of_sp, sub_codes)
        if s:
            sets_by_sub[s].append(t["slug"])
        else:
            unplaced_sets.append(t["slug"])
    multi_notes = {k: v for k, v in notes_by_sub.items() if len(v) > 1}
    multi_sets = {k: v for k, v in sets_by_sub.items() if len(v) > 1}
    print(f"\n=== {course} ===")
    print(f"  subtopics in tree: {len(subs)} | notes: {len(notes)} | question sets: {len(sets)}")
    print(f"  notes placed: {len(notes)-len(unplaced_notes)} | sets placed: {len(sets)-len(unplaced_sets)}")
    if unplaced_notes:
        print(f"  !! unplaced notes: {len(unplaced_notes)} e.g. {unplaced_notes[:3]}")
    if unplaced_sets:
        print(f"  !! unplaced sets: {len(unplaced_sets)} e.g. {unplaced_sets[:3]}")
    print(f"  subtopics with >1 NOTE: {len(multi_notes)} (max {max((len(v) for v in notes_by_sub.values()), default=0)})")
    print(f"  subtopics with >1 SET:  {len(multi_sets)} (max {max((len(v) for v in sets_by_sub.values()), default=0)})")
    # sidebar href consequence: last-write-wins
    hidden_notes = sum(len(v) - 1 for v in notes_by_sub.values())
    hidden_sets = sum(len(v) - 1 for v in sets_by_sub.values())
    print(f"  => tree row links to 1 of N: {hidden_notes} notes unreachable from tree, {hidden_sets} sets unreachable from tree")
    for k in list(multi_notes)[:3]:
        title = next((s for s, tc, _ in subs if s == k), k)
        print(f"     e.g. {k} ({title[:45]}): {len(multi_notes[k])} notes")
    for k in list(multi_sets)[:3]:
        title = next((s for s, tc, _ in subs if s == k), k)
        print(f"     e.g. {k} ({title[:45]}): {len(multi_sets[k])} sets -> {multi_sets[k][:2]}")
    return multi_notes, multi_sets


if __name__ == "__main__":
    courses = sys.argv[1:] or ["igcse-chemistry-19"]
    for c in courses:
        audit(c)
