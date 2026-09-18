#!/usr/bin/env python3
"""Survey upstream MCQ `choices` coverage across all 39 courses.
Fetches every SME-ExamQuestion topic.json (cache-aware) and reports."""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

WORK = "/home/z/my-project/work"
CACHE = os.path.join(WORK, "corpus-cache2", "SME-ExamQuestion")
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
HEADERS = {"User-Agent": "syllabai-demo-importer"}
MAX_WORKERS = 16
RETRIES = 4

# 1. course slugs from the demo content dir
COURSES = sorted(os.listdir("/home/z/my-project/content"))
COURSES = [c for c in COURSES if not c.endswith(".json")]
print(f"{len(COURSES)} courses to survey")


def fetch(repo_path: str) -> bytes:
    dest = os.path.join(CACHE, repo_path)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return open(dest, "rb").read()
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    last = None
    for i in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last  # type: ignore[misc]


# 2. per course, fetch course manifest to get section/topic slugs
topics = []  # (course, section_slug, topic_slug)
for c in COURSES:
    try:
        m = json.loads(fetch(f"SME-ExamQuestion/{c}/manifest.json"))
    except Exception as e:  # noqa: BLE001
        print(f"  !! manifest fail {c}: {e}", file=sys.stderr)
        continue
    for t in m.get("topics", []):
        topics.append((c, t["section_slug"], t["topic_slug"]))
print(f"{len(topics)} upstream topics to fetch")

stats = {
    "mcq_parts": 0, "with_choices": 0, "choices_correct_flag": 0, "topics_fetched": 0,
    "structured_parts": 0, "structured_with_solution": 0,
    "per_course": {},
}
fails = []


def do_topic(args):
    c, s, t = args
    d = json.loads(fetch(f"SME-ExamQuestion/{c}/{s}/{t}/topic.json"))
    return c, d


with ThreadPoolExecutor(MAX_WORKERS) as ex:
    futs = {ex.submit(do_topic, a): a for a in topics}
    done = 0
    for f in as_completed(futs):
        c = futs[f][0]
        try:
            _, d = f.result()
        except Exception as e:  # noqa: BLE001
            fails.append((futs[f], str(e)))
            continue
        stats["topics_fetched"] += 1
        pc = stats["per_course"].setdefault(c, {"mcq": 0, "choices": 0})
        for q in d.get("questions", []):
            for p in q.get("parts", []):
                qt = p.get("question_type")
                if qt == "multiple_choice":
                    stats["mcq_parts"] += 1
                    pc["mcq"] += 1
                    ch = p.get("choices")
                    if ch:
                        stats["with_choices"] += 1
                        pc["choices"] += 1
                        if any(x.get("is_correct") for x in ch):
                            stats["choices_correct_flag"] += 1
                elif qt == "structured":
                    stats["structured_parts"] += 1
                    if p.get("solution_md"):
                        stats["structured_with_solution"] += 1
        done += 1
        if done % 150 == 0:
            print(f"  ... {done}/{len(topics)} topics")

print(json.dumps({k: v for k, v in stats.items() if k != "per_course"}, indent=1))
zero = {c: v for c, v in stats["per_course"].items() if v["mcq"] > v["choices"]}
print(f"courses with MCQs lacking choices: {zero if zero else 'NONE'}")
print(f"topic fetch failures: {len(fails)}")
for a, e in fails[:10]:
    print("  FAIL", a, e)
