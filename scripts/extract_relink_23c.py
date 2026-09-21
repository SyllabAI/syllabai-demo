"""Extract SME 'More Revision Notes you might like' links from the 5 fetched
topic-questions pages, match to local corpus notes by URL, preview new
relatedNoteIds lists. DRY RUN — no patching here.
"""
import json
import re
from urllib.parse import urlsplit

DIR = "/home/z/my-project/work/relink_23c"
CONTENT = "/home/z/my-project/content"

PAGES = [
    ("igcse-english-literature-16", "macbeth--exam-questions", f"{DIR}/lit-macbeth.1.html"),
    ("igcse-english-literature-16", "romeo-and-juliet--exam-questions", f"{DIR}/lit-romeo.1.html"),
    ("igcse-english-literature-16", "an-inspector-calls---exam-questions", f"{DIR}/lit-inspector.1.html"),
    ("igcse-maths-a-modular-24-foundation-unit-1", "linear-equations--exam-questions", f"{DIR}/math-lin.1.html"),
    ("igcse-economics-17", "business-costs-revenues-and-profit--exam-questions", f"{DIR}/econ-costs.1.html"),
]

def norm(u: str) -> str:
    u = urlsplit(u)
    return f"https://www.savemyexams.com{u.path.rstrip('/')}"

# local note url -> (noteId, title) per package
def note_map(pkg):
    notes = json.load(open(f"{CONTENT}/{pkg}/notes.json"))
    m = {}
    for n in notes:
        m[norm(n["sourceUrl"])] = (n["noteId"], n["title"])
    return m

def widget_links(html):
    """Ordered hrefs from the RelatedResources widget only (not nav)."""
    # anchors: <a class="RelatedResources_linkButton__XXXX" ... href="...">
    # attribute order can vary — find anchor tags containing the class
    out = []
    for m in re.finditer(r'<a\b([^>]*)>', html):
        attrs = m.group(1)
        if 'RelatedResources_linkButton' not in attrs:
            continue
        hm = re.search(r'href="([^"]+)"', attrs)
        if hm:
            out.append(hm.group(1))
    return out

report = []
for pkg, slug, path in PAGES:
    html = open(path, encoding="utf-8", errors="replace").read()
    links = widget_links(html)
    urls = [norm(h) for h in links]
    nm = note_map(pkg)
    matched, missing = [], []
    for u in urls:
        if u in nm:
            matched.append({"url": u, "noteId": nm[u][0], "title": nm[u][1]})
        else:
            missing.append(u)
    qs = json.load(open(f"{CONTENT}/{pkg}/questions.json"))
    qset = next(s for s in qs if s.get("slug") == slug)
    old = qset["relatedNoteIds"]
    dead = [r for r in old if r not in {n["noteId"] for n in json.load(open(f"{CONTENT}/{pkg}/notes.json"))}]
    new = [m["noteId"] for m in matched]
    print(f"\n=== {pkg} :: {slug}")
    print(f"  widget links: {len(urls)} | matched: {len(matched)} | unmatched: {len(missing)}")
    print(f"  old refs: {len(old)} (dead: {len(dead)}) | new refs: {len(new)}")
    only_old = [r for r in old if r not in new]
    only_new = [m['noteId'] for m in matched if m['noteId'] not in old]
    print(f"  would DROP {len(only_old)} old-valid refs not on current widget: {only_old}")
    print(f"  would ADD {len(only_new)} refs not in old list")
    for m in matched:
        mark = "*" if m["noteId"] not in old else " "
        print(f"    {mark} {m['noteId']}  {m['title']}")
    for u in missing:
        print(f"    ! UNMATCHED: {u}")
    report.append({"pkg": pkg, "slug": slug, "widget": urls, "matched": matched,
                   "missing": missing, "old": old, "dead": dead})

json.dump(report, open(f"{DIR}/relink_dryrun.json", "w"), indent=2)
print("\nsaved work/relink_23c/relink_dryrun.json")
