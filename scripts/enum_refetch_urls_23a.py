#!/usr/bin/env python3
"""Enumerate unique SME pages to re-fetch for math re-extraction:
- affected note sourceUrls
- affected questionSet source.pageUrl
- affected flashcards -> their sourceNoteId -> note sourceUrl
"""
import json, re
from pathlib import Path
from urllib.parse import urlparse

CONTENT = Path('/home/z/my-project/content')

MARKERS = re.compile(
    r'\b(open parentheses|close parentheses|open bracket|close bracket|'
    r'open curly|close curly|fraction numerator|over denominator|end fraction|'
    r'end table|end cell|end row|to the power of|end exponent|'
    r'square root of|end root|cube root|with bar on top|'
    r'open square brackets|close square brackets|plus-or-minus|'
    r'direct double arrow|rightwards arrow|identical to|cross times|'
    r'plus sign|minus sign|percent sign|subscript|superscript|stack sum|'
    r'sum from|end style|begin mathsize)\b'
)
CODE_SPAN = re.compile(r'`([^`\n]+)`')
DOLLAR = re.compile(r'(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)')


def polluted(text):
    for m in CODE_SPAN.finditer(text or ''):
        if MARKERS.search(m.group(1)):
            return True
    for m in DOLLAR.finditer(text or ''):
        if MARKERS.search(m.group(1)):
            return True
    return False


def iter_texts(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            yield from iter_texts(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from iter_texts(v)
    elif isinstance(obj, str):
        yield obj


note_urls, qset_urls = set(), set()
flash_hit = 0
note_id_to_url = {}

for pkg_dir in sorted(CONTENT.iterdir()):
    if not pkg_dir.is_dir() or pkg_dir.name == 'courses.json':
        continue
    # notes
    fp = pkg_dir / 'notes.json'
    if fp.exists():
        data = json.loads(fp.read_text())
        items = data if isinstance(data, list) else data.get('notes', [])
        for n in items:
            note_id_to_url[n.get('noteId')] = n.get('sourceUrl')
            if any(polluted(t) for t in iter_texts(n)):
                if n.get('sourceUrl'):
                    note_urls.add(n['sourceUrl'])
    # questions
    fp = pkg_dir / 'questions.json'
    if fp.exists():
        data = json.loads(fp.read_text())
        qsets = data if isinstance(data, list) else data.get('questionSets', [])
        for s in qsets:
            if any(polluted(t) for t in iter_texts(s)):
                u = (s.get('source') or {}).get('pageUrl')
                if u:
                    qset_urls.add(u)
    # flashcards
    fp = pkg_dir / 'flashcards.json'
    if fp.exists():
        data = json.loads(fp.read_text())
        cards = data if isinstance(data, list) else data.get('flashcards', [])
        for c in cards:
            if any(polluted(t) for t in iter_texts(c)):
                flash_hit += 1

print(f"unique affected NOTE pages:      {len(note_urls)}")
print(f"unique affected QUESTION pages:  {len(qset_urls)}")
print(f"affected FLASHCARDS:             {flash_hit} (resolvable via sourceNoteId -> note url)")

# how many affected flashcards resolve to an already-listed note url?
dom = {}
for u in note_urls | qset_urls:
    dom[urlparse(u).netloc] = dom.get(urlparse(u).netloc, 0) + 1
print('domains:', dom)

Path('/tmp/refetch_note_urls.txt').write_text('\n'.join(sorted(note_urls)))
Path('/tmp/refetch_qset_urls.txt').write_text('\n'.join(sorted(qset_urls)))
print('URL lists saved to /tmp/refetch_note_urls.txt, /tmp/refetch_qset_urls.txt')
