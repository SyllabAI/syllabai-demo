#!/usr/bin/env python3
"""Task 21-d / SME-parity corpus completeness audit.
Checks every package for: resource file presence, notes<->curriculum spec mapping,
dangling references, question set counts, flashcard coverage, registry consistency."""
import json, os

ROOT = '/home/z/my-project/content'

def load(path):
    with open(path) as f:
        return json.load(f)

def collect_codes(nodes, out):
    """curriculum nodes: FLAT array, hierarchy via `parents` arrays.
    out: list of (code, is_leaf). Leaf = no other node lists it as parent."""
    if not isinstance(nodes, list):
        return
    parented = set()
    for n in nodes:
        parented.update(n.get('parents') or [])
    for n in nodes:
        code = n.get('code')
        if code:
            out.append((code, code not in parented))

rows = []
issues = []
pkgs = sorted(d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)))
for pkg in pkgs:
    p = os.path.join(ROOT, pkg)
    r = {'pkg': pkg}
    try:
        man = load(os.path.join(p, 'manifest.json'))
        cur = load(os.path.join(p, 'curriculum.json'))
        notes = load(os.path.join(p, 'notes.json'))
        qs = load(os.path.join(p, 'questions.json'))
        fc = load(os.path.join(p, 'flashcards.json'))
        ls = load(os.path.join(p, 'learner-sim.json'))
    except Exception as e:
        issues.append(f'{pkg}: LOAD FAIL {e}')
        continue

    # curriculum codes
    nodes = []
    collect_codes(cur.get('nodes', []), nodes)
    all_codes = {c for c, _ in nodes}
    leaves = {c for c, leaf in nodes if leaf}
    r['cur_nodes'] = len(nodes)
    r['cur_leaves'] = len(leaves)

    # notes mapping
    r['notes'] = len(notes)
    mapped = [n for n in notes if n.get('specPointIds') or n.get('specPointCodes')]
    r['notes_mapped'] = len(mapped)
    dangling_notes = set()
    for n in notes:
        for sp in (n.get('specPointIds') or []):
            if sp not in all_codes:
                dangling_notes.add(sp)
    if dangling_notes:
        issues.append(f'{pkg}: notes reference {len(dangling_notes)} specPointIds not in curriculum (e.g. {sorted(dangling_notes)[:3]})')

    # note ids for cross-refs
    note_ids = {n.get('noteId') for n in notes}

    # questions
    sets = qs if isinstance(qs, list) else []
    r['qsets'] = len(sets)
    nq = 0
    dang_rel = 0
    for s in sets:
        qlist = s.get('questions') or []
        nq += len(qlist)
        for rid in (s.get('relatedNoteIds') or []):
            if rid not in note_ids:
                dang_rel += 1
    r['questions'] = nq
    if dang_rel:
        issues.append(f'{pkg}: {dang_rel} dangling relatedNoteIds in questions.json')

    # flashcards
    r['cards'] = len(fc) if isinstance(fc, list) else 0
    if r['cards'] == 0:
        issues.append(f'{pkg}: flashcards.json EMPTY (0 cards)')

    # coverage: spec leaves without notes
    covered = set()
    for n in notes:
        covered.update(n.get('specPointIds') or [])
        covered.update(n.get('specPointCodes') or [])
    uncovered = leaves - covered
    r['leaves_uncovered'] = len(uncovered)
    if leaves and len(uncovered) / len(leaves) > 0.5:
        issues.append(f'{pkg}: {len(uncovered)}/{len(leaves)} spec leaves have no notes mapped')

    # learner-sim
    r['ls_ok'] = 1 if ls else 0
    rows.append(r)

# registry consistency
reg = load(os.path.join(ROOT, 'courses.json'))
reg_ids = [c.get('courseId') or c.get('id') or c.get('slug') for c in (reg if isinstance(reg, list) else reg.get('courses', []))]
print(f'Registry entries: {len(reg_ids)}')
missing_in_reg = [p for p in pkgs if p not in reg_ids]
missing_on_disk = [i for i in reg_ids if i not in pkgs]
if missing_in_reg:
    issues.append(f'courses.json missing entries for packages: {missing_in_reg}')
if missing_on_disk:
    issues.append(f'courses.json references non-existent packages: {missing_on_disk}')

hdr = f'{"package":<55}{"nodes":>6}{"leaves":>7}{"notes":>6}{"map%":>6}{"qsets":>6}{"qs":>5}{"cards":>6}{"uncov":>6}'
print(hdr)
print('-' * len(hdr))
for r in rows:
    mappct = round(100 * r['notes_mapped'] / r['notes']) if r['notes'] else 0
    print(f"{r['pkg']:<55}{r['cur_nodes']:>6}{r['cur_leaves']:>7}{r['notes']:>6}{mappct:>5}%{r['qsets']:>6}{r['questions']:>5}{r['cards']:>6}{r['leaves_uncovered']:>6}")

print('\n=== ISSUES ===')
if issues:
    for i in issues:
        print('!!', i)
else:
    print('none')
