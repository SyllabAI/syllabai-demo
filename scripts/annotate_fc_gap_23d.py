"""
T-SME-23d — document the verified flashcards gap in the 12 empty lanes' manifests.

Adds `gaps.flashcards` to manifest.json with the 4-way verification evidence
(upstream corpus / live hub / course nav / SME sitemap census 2026-09-21).
Pure manifest metadata — no card data touched.
"""
import json
import time
import urllib.request

CONTENT = "/home/z/my-project/content"
UA = "syllabai-demo-corpus-audit"

LANES = {
    "ial-further-maths-18-further-pure-1":
        "SME publishes no flashcards for IAL Further Pure 1 (sitemap census 2026-09-21: 0 flashcards URLs; /flashcards/ hub 404).",
    "igcse-accounting-17-financial-statements":
        "SME publishes no flashcards for IGCSE Accounting (sitemap census 2026-09-21: 0 flashcards URLs for the 17 spec; /flashcards/ hub 404).",
    "igcse-accounting-17-introduction-to-bookkeeping-and-accounting":
        "SME publishes no flashcards for IGCSE Accounting (sitemap census 2026-09-21: 0 flashcards URLs for the 17 spec; /flashcards/ hub 404).",
    "igcse-english-language-a-16-paper-3-coursework":
        "SME publishes no flashcards for Paper 3 Coursework (sitemap census 2026-09-21: 0 flashcards URLs; Paper 1/2 lanes have their own decks, already imported).",
    "igcse-maths-a-modular-24-foundation-unit-1":
        "SME publishes Maths A Modular 2024 flashcards for HIGHER units only (sitemap census 2026-09-21: higher-unit-1 33 URLs, higher-unit-2 28, foundation units 0) — already imported into the higher-unit lanes.",
    "igcse-maths-a-modular-24-foundation-unit-2":
        "SME publishes Maths A Modular 2024 flashcards for HIGHER units only (sitemap census 2026-09-21: higher-unit-1 33 URLs, higher-unit-2 28, foundation units 0) — already imported into the higher-unit lanes.",
    "igcse-science-double-award-modular-24-biology-unit-1":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
    "igcse-science-double-award-modular-24-biology-unit-2":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
    "igcse-science-double-award-modular-24-chemistry-unit-1":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
    "igcse-science-double-award-modular-24-chemistry-unit-2":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
    "igcse-science-double-award-modular-24-physics-unit-1":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
    "igcse-science-double-award-modular-24-physics-unit-2":
        "SME publishes no flashcards for Science (Double Award) Modular 2024 units (sitemap census 2026-09-21: 0 flashcards URLs across all 6 modular units; the LINEAR double-award/17 lanes have decks, already imported).",
}

for lane, note in LANES.items():
    p = f"{CONTENT}/{lane}/manifest.json"
    m = json.load(open(p))
    fc = json.load(open(f"{CONTENT}/{lane}/flashcards.json"))
    assert len(fc) == 0, f"{lane}: flashcards not empty — abort"
    gaps = m.setdefault("gaps", {})
    gaps["flashcards"] = {
        "status": "missing_on_sme",
        "verifiedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "note": note,
        "verifiedVia": [
            "upstream SyllabAI/syllabai-resources SME-Flashcards: lane absent (37 lanes, 2026-09-21 tree dc83f1ed24be)",
            "live /flashcards/ hub probe: 404",
            "course-page nav: global flashcard footer links only, no lane decks",
            "SME sitemap census (igcse + international-a-level, 2026-09-21): 0 flashcards URLs under this lane",
        ],
    }
    open(p, "w").write(json.dumps(m, separators=(",", ":")))
    print(f"manifest.gaps.flashcards written: {lane}")

print("\nOK — 12 manifests annotated")
