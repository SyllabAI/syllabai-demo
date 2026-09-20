#!/usr/bin/env python3
"""Quantify MathML speech-text artifact scale across the whole corpus.
Counts polluted code spans / $..$ segments per package & file type,
plus unique source URLs affected (for potential re-extraction).
"""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict

CONTENT = Path('/home/z/my-project/content')

# Chrome MathML speech-text grammar markers
MARKERS = re.compile(
    r'\b(open parentheses|close parentheses|open bracket|close bracket|'
    r'open curly|close curly|fraction numerator|over denominator|end fraction|'
    r'end table|end cell|end row|to the power of|end exponent|'
    r'square root of|end root|cube root|with bar on top|'
    r'open square brackets|close square brackets|plus-or-minus|'
    r'direct double arrow|rightwards arrow|less than or|greater than or|'
    r'identical to|cross times|divided by|plus sign|minus sign|percent sign|'
    r'subscript|superscript|stack sum|sum from|end style|begin mathsize)\b'
)
CODE_SPAN = re.compile(r'`([^`\n]+)`')
DOLLAR = re.compile(r'(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)')


def scan_text(text):
    spans = []
    for m in CODE_SPAN.finditer(text):
        if MARKERS.search(m.group(1)):
            spans.append(m.group(1))
    for m in DOLLAR.finditer(text):
        if MARKERS.search(m.group(1)):
            spans.append(m.group(1))
    return spans


def iter_texts(obj, path=''):
    """Yield (path, text) for every string field that looks like content markdown."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from iter_texts(v, f'{path}.{k}')
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from iter_texts(v, f'{path}[{i}]')
    elif isinstance(obj, str):
        yield path, obj


pkg_stats = {}
all_urls = set()
per_file_records = []

for pkg_dir in sorted(CONTENT.iterdir()):
    if not pkg_dir.is_dir() or pkg_dir.name == 'courses.json':
        continue
    stat = {}
    for fname in ['notes.json', 'questions.json', 'flashcards.json']:
        fp = pkg_dir / fname
        if not fp.exists():
            continue
        data = json.loads(fp.read_text())
        items = data if isinstance(data, list) else data.get('notes') or data.get('questionSets') or data.get('flashcards') or data.get('items') or []
        spans_total = 0
        items_hit = 0
        urls = set()
        sample = []
        for item in items:
            item_spans = 0
            for path, text in iter_texts(item):
                if len(text) > 200000:
                    continue
                found = scan_text(text)
                item_spans += len(found)
                if found and len(sample) < 2:
                    sample.append(found[0][:90])
            if item_spans:
                items_hit += 1
                spans_total += item_spans
                u = item.get('sourceUrl') or item.get('url')
                if u:
                    urls.add(u)
            # collect urls regardless (for coverage mapping)
            u = item.get('sourceUrl') or item.get('url')
            if u:
                all_urls.add(u)
        stat[fname] = dict(spans=spans_total, items=items_hit, urls_hit=len(urls))
        if sample:
            per_file_records.append((pkg_dir.name, fname, sample))
    if stat:
        pkg_stats[pkg_dir.name] = stat

total_spans = sum(s['spans'] for st in pkg_stats.values() for s in st.values())
total_items = sum(s['items'] for st in pkg_stats.values() for s in st.values())
pkgs_hit = sum(1 for st in pkg_stats.values() if any(s['spans'] for s in st.values()))

print(f"PACKAGES HIT: {pkgs_hit}/{len(pkg_stats)}")
print(f"TOTAL ARTIFACT SPANS: {total_spans}  across {total_items} items")
print()
print(f"{'package':55s} {'notes':>18s} {'questions':>18s} {'flashcards':>18s}")
for pkg, st in sorted(pkg_stats.items(), key=lambda kv: -sum(s['spans'] for s in kv[1].values())):
    row = []
    any_hit = False
    for fname in ['notes.json', 'questions.json', 'flashcards.json']:
        s = st.get(fname)
        if s and s['spans']:
            row.append(f"{s['spans']:,}/{s['items']:,}")
            any_hit = True
        else:
            row.append('-')
    if any_hit:
        print(f"{pkg:55s} {row[0]:>18s} {row[1]:>18s} {row[2]:>18s}")

print("\nSAMPLE ARTIFACTS:")
for pkg, fname, samples in per_file_records[:12]:
    print(f"  {pkg} / {fname}: {samples[0]}")
