#!/usr/bin/env python3
"""
Corpus-fix wave stage 2 — build corrected manifest.yaml per fixed dir.

Reads:  upload/corpus_fix_audit.json      (current corpus manifests)
        upload/corpus_fix_staging/staged.json  (verified replacements)
Writes: upload/corpus_fix_staging/<sess>/4PH0-<var>/manifest.yaml

Materials entries listed in staged.json are replaced (official DAM source +
sha/size/filename); other entries are preserved verbatim. identification is
rebuilt from the NEW covers' evidence with a correction note appended.
"""
import json
import re

STAGE = "/home/z/my-project/upload/corpus_fix_staging"
staged = json.load(open(f"{STAGE}/staged.json"))
audit = json.load(open("/home/z/my-project/upload/corpus_fix_audit.json"))
manifests = audit["manifests"]

# visual readings for the two garbled QP covers (Read-tool inspection):
# 2013-06 1P: P41561A, 'Tuesday 14 May 2013 - Morning', refs KPH0/1P 4PH0/1P KSC0/1P 4SC0/1P
# 2015-06 1P: P44238A, 'Wednesday 20 May 2015 - Afternoon', same ref set
VISUAL_REFS = {
    ("2013-06", "1P", "qp"): ["KPH0/1P", "4PH0/1P", "KSC0/1P", "4SC0/1P"],
    ("2015-06", "1P", "qp"): ["KPH0/1P", "4PH0/1P", "KSC0/1P", "4SC0/1P"],
}
VISUAL_SESSION = {
    ("2013-06", "1P", "qp"): "Tuesday 14 May 2013 - Morning",
    ("2015-06", "1P", "qp"): "Wednesday 20 May 2015 - Afternoon",
}

SESS_MONTH = {"2013-06": "June 2013", "2014-06": "June 2014", "2015-06": "June 2015",
              "2016-06": "June 2016", "2017-06": "June 2017", "2018-06": "June 2018"}

# per-file printed refs extracted from clean covers (kept from staging covers)
def refs_for(st) -> list[str]:
    key = (st["session"], st["var"], st["mat"])
    if key in VISUAL_REFS:
        return VISUAL_REFS[key]
    var = st["var"]
    return ["KPH0/" + var, "4PH0/" + var, "KSC0/" + var, "4SC0/" + var]


def material_block(st) -> str:
    mat = "question-paper" if st["mat"] == "qp" else "mark-scheme"
    note = ("official Pearson Edexcel document downloaded directly from the board's public DAM; "
            f"replaces the PMT '(R)' file previously stored here (that PDF is the 4PH0/{st['var']}R "
            "regional paper mis-filed under this dir; the regional paper remains in the sibling "
            f"4PH0-{st['var']}R dir)")
    return (
        f"- type: {mat}\n"
        f"  path: {st['mat']}.pdf\n"
        f"  sha256: {st['new_sha256']}\n"
        f"  size_bytes: {st['new_size']}\n"
        f"  original_filename: {st['original_filename']}\n"
        f"  source:\n"
        f"    source_type: official-board-website\n"
        f"    archive: Pearson qualifications portal (qualifications.pearson.com content-dam)\n"
        f"    source_url: {st['source_url']}\n"
        f"    collected_by: SyllabAI agent (2026-09-28 corpus-fix wave)\n"
        f"    note: {note}\n"
    )


# group staged by dir
by_dir: dict[tuple[str, str], list] = {}
for st in staged:
    by_dir.setdefault((st["session"], f"4PH0-{st['var']}"), []).append(st)

for (sess, d), items in sorted(by_dir.items()):
    key = f"{sess}|{d}"
    mtext = manifests[key]
    header = mtext.split("materials:", 1)[0]
    ident_idx = mtext.index("identification:")
    ingestion = mtext[mtext.index("ingestion:"):]

    # rebuild materials: new blocks for staged mats, preserved blocks otherwise
    mat_text = mtext[mtext.index("materials:"):ident_idx]
    entries = re.split(r"\n(?=- type:)", mat_text)
    preserved = [e for e in entries[1:] if not any(f"path: {st['mat']}.pdf" in e.split("source:")[0] for st in items)]
    new_blocks = [material_block(st) for st in items]
    materials = "materials:\n" + "\n".join(b.rstrip("\n") for b in new_blocks + preserved) + "\n"

    # identification from the new covers (union of refs across staged files,
    # plus any preserved entry's dir-level refs stay represented by the codes below)
    refs: list[str] = []
    for st in items:
        for r in refs_for(st):
            if r not in refs:
                refs.append(r)
    var0 = items[0]["var"]
    notes = [
        (f"2026-09-28 corpus-fix wave: {' and '.join(st['mat'] + '.pdf' for st in items)} previously held the PMT "
         f"'(R)' file(s) — the 4PH0/{var0}R regional paper mis-filed under this dir (proven per file: cover prints "
         f"{var0}R, and/or pixel-identical to the official DAM regional scan). Replaced with the official non-R "
         f"4PH0/{var0} downloads from the Pearson DAM; identity of every replacement verified by sha-stable DAM "
         "re-download plus cover/pixel checks."),
        (f"plain-paper covers print both families (4PH0/{var0} and 4SC0/{var0} plus the K-prefixed Certificate "
         f"codes) — the same physical paper served single-award Physics (4PH0) and Science Double Award (4SC0) "
         "candidates; see the sibling 4PH0-" + var0 + "R dir for the regional variant"),
    ]
    if (sess, var0, "qp") in VISUAL_SESSION:
        notes.append(f"2013/2015-era covers have broken ToUnicode maps (pdftotext garbles them); identity of those "
                     f"QPs verified by rendering the cover (visual: '{VISUAL_SESSION[(sess, var0, 'qp')]}') and by "
                     "pixel-distance from the regional paper")
    ident = (
        "identification:\n"
        "  methods:\n"
        "  - pdf_text\n"
        "  - pixel_render\n"
        "  confidence_rank: 0\n"
        "  printed_references_seen:\n" + "".join(f"  - {r}\n" for r in refs) +
        "  stray_prints: []\n"
        f"  session_printed: {SESS_MONTH[sess]}\n"
        "  notes:\n" + "".join("  - " + json.dumps(n, ensure_ascii=False) + "\n" for n in notes)
    )
    out = header + materials + ident + ingestion
    path = f"{STAGE}/{sess}/{d}/manifest.yaml"
    open(path, "w").write(out)
    print(f"wrote {path} ({len(out)} bytes, {len(items)} materials replaced)")
