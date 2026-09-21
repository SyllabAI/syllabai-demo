"""Probe SME live flashcards for the 12 empty lanes.
Derives each lane's course base from a notes.json sourceUrl, then probes
<base>/flashcards/ (hub). 404 => SME has no flashcards for that course.
Saves results to work/fc23d/probe_results.json.
"""
import json
import os
import re
import time
import urllib.request

CONTENT = "/home/z/my-project/content"
OUT = "/home/z/my-project/work/fc23d"
os.makedirs(OUT, exist_ok=True)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

LANES = [
    "ial-further-maths-18-further-pure-1",
    "igcse-accounting-17-financial-statements",
    "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
    "igcse-english-language-a-16-paper-3-coursework",
    "igcse-maths-a-modular-24-foundation-unit-1",
    "igcse-maths-a-modular-24-foundation-unit-2",
    "igcse-science-double-award-modular-24-biology-unit-1",
    "igcse-science-double-award-modular-24-biology-unit-2",
    "igcse-science-double-award-modular-24-chemistry-unit-1",
    "igcse-science-double-award-modular-24-chemistry-unit-2",
    "igcse-science-double-award-modular-24-physics-unit-1",
    "igcse-science-double-award-modular-24-physics-unit-2",
]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:
        return -1, url, str(e)

results = {}
for lane in LANES:
    notes = json.load(open(f"{CONTENT}/{lane}/notes.json"))
    src = next((n["sourceUrl"] for n in notes if n.get("sourceUrl")), None)
    if not src:
        results[lane] = {"error": "no sourceUrl in notes"}
        continue
    # course base = URL up to and including the spec segment (before /revision-notes/)
    base = src.split("/revision-notes/")[0]
    hub = base + "/flashcards/"
    code, final, html = fetch(hub)
    info = {"base": base, "hubUrl": hub, "hubStatus": code, "finalUrl": final}
    if code == 200 and html:
        # does the hub actually list flashcard decks for this course?
        topics = sorted(set(re.findall(
            r'href="(' + re.escape(base) + r'/flashcards/[^"]+)"', html)))
        # the hub itself matches base/flashcards/ — count only deck links
        deck_links = [u for u in topics if u.rstrip("/") != base + "/flashcards"]
        info["deckLinks"] = len(deck_links)
        info["sampleDecks"] = deck_links[:5]
        title = re.search(r"<title[^>]*>(.*?)</title>", html)
        info["title"] = title.group(1)[:90] if title else "?"
    results[lane] = info
    print(f"{lane}\n  base: {base}\n  hub: {code}  decks: {info.get('deckLinks', '-')}")
    time.sleep(1.5)

json.dump(results, open(f"{OUT}/probe_results.json", "w"), indent=2)
print("\nsaved", f"{OUT}/probe_results.json")
