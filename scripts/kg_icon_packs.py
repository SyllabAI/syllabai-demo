#!/usr/bin/env python3
"""kg_icon_packs.py — per-subject node icon packs for the OpenHuman KG fork.

Icon style contract (must match the build's existing `icon()` library):
  - SVG inner markup drawn around origin (0,0), nominal radius ~10
  - stroke-only (group attrs: fill:none, stroke-width:2, round caps/joins)
  - accent dots via class="topicIconFill" (fill:currentColor, stroke:none)
  - no <text>, no external assets, no emoji — single-file portability

PACKS: family -> spec dict:
  emblem    icon kind for Subject nodes
  sections  cycled Section icons (fallback when secRules miss)
  secRules  ordered [icon, [keywords...]] matched against Section labels
  rules     ordered [icon, [keywords...]] matched against SubTopic labels
            (first .includes match wins — same semantics as the build)
  default   SubTopic fallback
  nonSub    fallback for non-Subject/Section/SubTopic nodes (ExamPaper...)
  chemMode  chemistry keeps the build's exact section-index mapping

The chemistry pack replicates the build's original topicIconKey table
verbatim — that equivalence is enforced by the golden gate (kg_icon_gate.js).
"""

# ---------------------------------------------------------------------------
# new icon markup (existing 28 kinds stay inside the build untouched)
# ---------------------------------------------------------------------------
ICONS = {
    # --- biology ---
    "dna": '<path d="M-5-10q9 10 0 20M5-10q-9 10 0 20"/><path d="M-3-5h6M-4 0h8M-3 5h6"/>',
    "cell": '<ellipse cx="0" cy="0" rx="10" ry="8"/><circle cx="-1" cy="1" r="3.5"/><circle cx="4" cy="-3" r="1" class="topicIconFill"/><circle cx="-6" cy="-2" r="1" class="topicIconFill"/>',
    "leaf": '<path d="M0 9C-7 4-7-4 0-10c7 6 7 14 0 19z"/><path d="M0-7V6M0-3l4-3M0-3l-4-3M0 3l4-3M0 3l-4-3"/>',
    "heart": '<path d="M0 8C-7 3-9-2-6-5c2-2 5-1 6 1 1-2 4-3 6-1 3 3 1 8-6 13z"/>',
    "brain": '<path d="M-3-9c-4-1-7 2-5 5-4 2-3 7 1 8-1 3 3 5 6 3 3 2 7 0 7-3 4-2 4-7 0-8 1-3-2-6-5-5-1 0-3 0-4 0z"/><path d="M0-6v10"/>',
    "lungs": '<path d="M0-10v6"/><path d="M0-4c0 2-2 3-4 4M0-4c0 2 2 3 4 4"/><path d="M-4 0c-3 2-5 5-5 9h6c0-4 0-6-1-9z"/><path d="M4 0c3 2 5 5 5 9h-6c0-4 0-6 1-9z"/>',
    "sprout": '<path d="M0 9V0"/><path d="M0 1C0-4-4-6-8-6c0 5 4 7 8 7z"/><path d="M0 1c0-5 4-7 8-7 0 5-4 7-8 7z"/>',
    "ecosystem": '<circle cx="0" cy="-3" r="6"/><path d="M0 3v5M-9 8h18"/>',
    "microscope": '<path d="M-3-10l7 4-4 7"/><path d="M0 1c3 1 5 4 5 7"/><path d="M-7 10h15"/><path d="M-5 6h7"/>',
    # --- physics ---
    "circuit": '<path d="M-9 0h3l2-5 3 10 3-10 3 10 2-5h3"/><circle cx="-9" cy="0" r="1.3" class="topicIconFill"/><circle cx="9" cy="0" r="1.3" class="topicIconFill"/>',
    "wave": '<path d="M-10 0c3-8 7-8 10 0 3 8 7 8 10 0"/>',
    "magnet": '<path d="M-5-9v7a5 5 0 0 0 10 0v-7"/><path d="M-8-9h6M2-9h6M-8-5h3M5-5h3"/>',
    "nuclear": '<circle cx="0" cy="0" r="3"/><circle cx="8" cy="-5" r="1.4" class="topicIconFill"/><circle cx="-8" cy="-3" r="1.4" class="topicIconFill"/><circle cx="0" cy="9" r="1.4" class="topicIconFill"/><path d="M3-7c4 2 5 7 3 10M-4 6c-4-2-5-6-3-9"/>',
    "motion": '<path d="M-9 7C-5-4 1-7 6 4"/><circle cx="6" cy="4" r="1.5" class="topicIconFill"/>',
    "field": '<circle cx="-6" cy="0" r="4"/><path d="M-8 0h4"/><circle cx="6" cy="0" r="4"/><path d="M4 0h4M6-2v4"/>',
    # --- maths ---
    "graph": '<path d="M-8-9V9H10"/><path d="M-5 7C0 7-1-6 8-7"/>',
    "algebra": '<path d="M-6-7L6 7M6-7L-6 7"/>',
    "integral": '<path d="M2-10c-3 0-4 2-4 5v10c0 3-1 5-4 5"/><path d="M5 4l5 5M10 4l-5 5"/>',
    "trig": '<path d="M-7-8V8H9z"/><path d="M-7 3h5v5"/>',
    "stats": '<path d="M-9 9H9"/><path d="M-5 9V3M0 9V-2M5 9V-6"/>',
    "shapes": '<rect x="-9" y="-9" width="11" height="11"/><circle cx="4" cy="4" r="5"/>',
    "number": '<path d="M-2-9L-4 9M6-9L4 9M-8-3H8M-9 3H7"/>',
    "network": '<circle cx="-6" cy="-5" r="2.5"/><circle cx="6" cy="-6" r="2.5"/><circle cx="0" cy="2" r="2.5"/><circle cx="-6" cy="8" r="2.5"/><circle cx="7" cy="7" r="2.5"/><path d="M-4-4L-1 0M4-5L1 0M-1 4l-3 3M1 4l5 2"/>',
    "vector": '<path d="M-8 8L8-8"/><path d="M8-8h-6M8-8v6"/>',
    # --- economics / business / accounting ---
    "supplydemand": '<path d="M-9 8C-3 8 3-8 9-8"/><path d="M-9-8C-3-8 3 8 9 8"/>',
    "bank": '<path d="M0-10L-9-5h18z"/><path d="M-7-4v7M-2-4v7M3-4v7M7-4v7"/><path d="M-9 4h18M-7 7h14"/>',
    "coins": '<circle cx="-4" cy="0" r="6"/><circle cx="4" cy="0" r="6"/><path d="M-4-2.5v5M4-2.5v5"/>',
    "globe": '<circle cx="0" cy="0" r="9"/><ellipse cx="0" cy="0" rx="4" ry="9"/><path d="M-8.5-3h17M-8.5 3h17"/>',
    "people": '<circle cx="-4.5" cy="-3.5" r="3"/><path d="M-10 8c0-4 2.5-6 5.5-6s5.5 2 5.5 6"/><circle cx="4.5" cy="-2.5" r="2.5"/><path d="M1 8c0-3.5 2-5 4.5-5s4.5 1.5 4.5 5"/>',
    "scales": '<path d="M0-8v13M-5 7h10M-9-5h18"/><path d="M-9-5l-3 6M9-5l3 6"/><path d="M-15 1a3 3 0 0 0 6 0zM9 1a3 3 0 0 0 6 0z"/>',
    "briefcase": '<rect x="-9" y="-4" width="18" height="12" rx="2"/><path d="M-4-4v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M-9 1h18"/>',
    "megaphone": '<path d="M-8-3v6l10 5V-8z"/><path d="M6-5c2.5 3 2.5 7 0 10"/>',
    "factory": '<path d="M-9 8V-2h3v4l4-3v3l4-3v3l4-3V8z"/><path d="M-3 8V3h4v5"/>',
    "target": '<circle cx="0" cy="0" r="8"/><circle cx="0" cy="0" r="4"/><circle cx="0" cy="0" r="1.2" class="topicIconFill"/>',
    "ledger": '<rect x="-8" y="-9" width="16" height="18" rx="2"/><path d="M-4-9v18"/><path d="M-1-5h5M-1-1h5M-1 3h5"/>',
    "percent": '<path d="M-6 6L6-6"/><circle cx="-5" cy="-5" r="2.5"/><circle cx="5" cy="5" r="2.5"/>',
    "trend": '<path d="M-8 7l5-7 3 3 8-9"/><path d="M8-6h-4M8-6v4"/>',
    # --- english ---
    "book": '<path d="M0 7C-3 4-7 3-10 3V-7c3 0 7 1 10 3 3-2 7-3 10-3v10c-3 0-7 1-10 4z"/><path d="M0-4v11"/>',
    "quill": '<path d="M8-9C2-8-4-3-6 3l-1 5 5-1c6-2 10-8 10-16z"/><path d="M-7 8L3-2"/>',
    "speech": '<path d="M-6-9h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-6 5v-5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/><circle cx="-2" cy="-3" r="1" class="topicIconFill"/><circle cx="2" cy="-3" r="1" class="topicIconFill"/>',
    # --- geography ---
    "terrain": '<path d="M-10 6l6-10 4 6 3-5 7 9"/><path d="M-10 9h20"/>',
    "volcano": '<path d="M-9 8L-3-4h6L9 8z"/><path d="M0-6v-3M-4-7l-2-3M4-7l2-3"/>',
    "city": '<path d="M-9 8V-3h6V8M-3 8V-9h6V8M3 8V-1h6V8"/><path d="M-6.5 0h1M-.5-5h1M-.5 2h1M5 3h1M-6.5 4h1"/>',
    "map": '<path d="M-9-7l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M-3-9v14M3-7v14"/>',
    # --- ict ---
    "monitor": '<rect x="-9" y="-8" width="18" height="12" rx="1.5"/><path d="M0 4v3M-5 7h10"/>',
    "chip": '<rect x="-6" y="-6" width="12" height="12" rx="1"/><rect x="-2.5" y="-2.5" width="5" height="5"/><path d="M-2-9v3M2-9v3M-2 6v3M2 6v3M-9-2h3M-9 2h3M6-2h3M6 2h3"/>',
    "software": '<rect x="-9" y="-8" width="18" height="16" rx="1.5"/><path d="M-9-4h18"/><path d="M-3-1l-2 2 2 2M3-1l2 2-2 2"/>',
    "lock": '<rect x="-6" y="-2" width="12" height="10" rx="1.5"/><path d="M-3.5-2v-3a3.5 3.5 0 0 1 7 0v3"/><circle cx="0" cy="3" r="1.2" class="topicIconFill"/>',
    # --- science (combined) emblem ---
    "beaker": '<path d="M-4-9v12a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V-9"/><path d="M-6-9h12M-4-3h8"/>',
}

# ---------------------------------------------------------------------------
# packs — keyword tables built from the actual SubTopic/Section label
# inventory of the 48 exported course JSONs (scan_labels.py)
# ---------------------------------------------------------------------------
PACKS = {
    # chemistry replicates the build's original table VERBATIM (golden gate)
    "chemistry": {
        "emblem": "atom", "chemMode": True, "sections": [], "secRules": [],
        "default": "topic", "nonSub": "atom",
        "rules": [
            ("matter", ["states of matter"]),
            ("mixture", ["elements, compounds"]),
            ("atom", ["atomic structure"]),
            ("periodic", ["periodic table"]),
            ("calculator", ["formulae", "equations", "calculations"]),
            ("ionic", ["ionic bonding"]),
            ("molecule", ["covalent bonding"]),
            ("lattice", ["metallic bonding"]),
            ("electrolysis", ["electrolysis"]),
            ("flame", ["group 1"]),
            ("halogen", ["group 7"]),
            ("gas", ["gases in the atmosphere"]),
            ("reactivity", ["reactivity series"]),
            ("metal", ["extraction and uses of metals"]),
            ("acid", ["acids, alkalis", "acid"]),
            ("test", ["chemical tests"]),
            ("energy", ["energetics"]),
            ("rates", ["rates of reaction"]),
            ("equilibrium", ["reversible reactions", "equilibria"]),
            ("oil", ["crude oil"]),
            ("chain", ["alkanes"]),
            ("double", ["alkenes"]),
            ("alcohol", ["alcohols"]),
            ("acid", ["carboxylic acids"]),
            ("ester", ["esters"]),
            ("polymer", ["synthetic polymers"]),
        ],
    },
    "biology": {
        "emblem": "dna",
        "sections": ["cell", "dna", "leaf", "heart", "microscope", "sprout"],
        "secRules": [
            ("dna", ["genetic", "inheritance", "dna"]),
            ("cell", ["cell", "microbiology"]),
            ("leaf", ["plant", "ecology", "environment"]),
            ("heart", ["human", "circulation", "transport"]),
            ("microscope", ["health", "disease"]),
            ("sprout", ["reproduction", "living", "life"]),
        ],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("dna", ["dna", "gene", "genetic", "inherit", "cloning", "modification", "selective breeding"]),
            ("cell", ["cell", "membrane", "organisation"]),
            ("molecule", ["molecule", "protein", "enzyme", "diet", "nutrition"]),
            ("leaf", ["photosynthesis", "plant", "leaf"]),
            ("heart", ["circulatory", "heart", "blood", "transport"]),
            ("brain", ["brain", "nervous", "co-ordination", "coordination", "ordination"]),
            ("lungs", ["gas exchange", "lung", "breathing", "excret"]),
            ("energy", ["respiration"]),
            ("ecosystem", ["ecosystem", "environment", "biodiversity", "classification", "cycles", "feeding", "decay", "decomposition", "conservation"]),
            ("microscope", ["microbiolog", "antibiotic", "immunity", "forensic", "bacteri"]),
            ("sprout", ["reproduction", "living", "organism", "food production", "growth"]),
            ("motion", ["muscular", "movement"]),
        ],
    },
    "physics": {
        "emblem": "magnet",
        "sections": ["motion", "circuit", "wave", "nuclear", "energy", "magnet", "field", "test"],
        "secRules": [
            ("motion", ["mechanic", "motion", "force"]),
            ("circuit", ["electric", "circuit"]),
            ("wave", ["wave", "optics", "light"]),
            ("nuclear", ["nuclear", "particle", "astro", "space", "radioactiv"]),
            ("energy", ["energy", "thermal"]),
            ("magnet", ["magnet", "field"]),
            ("test", ["practical"]),
        ],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("circuit", ["circuit", "current", "resistance", "potential difference", "emf", "capacitance", "static electricity", "mains", "electrical power", "charge"]),
            ("wave", ["wave", "interference", "polarisation", "refraction", "reflection", "spectrum", "sound", "light", "photoelectric", "optics"]),
            ("magnet", ["magnet", "induction"]),
            ("nuclear", ["nuclear", "radioactiv", "fission", "fusion", "radiation", "particle", "spectra", "structure of matter", "cosmolog", "stellar", "astronomy", "universe"]),
            ("energy", ["energy", "power", "thermal", "heat", "temperature", "ideal gas", "kinetic theory", "gas", "black body", "resonance", "state"]),
            ("field", ["electric field", "gravitational field", "field"]),
            ("motion", ["force", "momentum", "motion", "projectile", "moment", "collision", "impulse", "circular", "harmonic", "kinematics", "acceleration", "density", "upthrust", "viscous", "pressure", "stretching", "material", "movement", "position"]),
            ("test", ["practical", "planning", "processing", "analysis", "measurement"]),
        ],
    },
    "maths": {
        "emblem": "calculator",
        "sections": ["calculator", "graph", "algebra", "trig", "stats", "integral", "shapes", "vector", "number", "network"],
        "secRules": [
            ("integral", ["integration", "differentiation"]),
            ("trig", ["trigonometry"]),
            ("stats", ["statistics", "probability", "data"]),
            ("graph", ["coordinate", "geometry"]),
            ("algebra", ["algebra", "functions", "number"]),
            ("network", ["decision", "algorithms", "discrete"]),
            ("motion", ["mechanics"]),
        ],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("network", ["algorithm", "spanning", "shortest path", "route inspection", "salesman", "critical path", "linear programming", "lp problems"]),
            ("motion", ["forces", "momentum", "newton", "collision", "projectile", "acceleration", "moments", "centres of mass", "kinematics", "impulse", "inclined", "friction", "work", "energy", "power"]),
            ("stats", ["probability", "distribution", "statistic", "data", "average", "histogram", "correlation", "regression", "sampling", "venn", "hypothesis", "frequency", "cumulative"]),
            ("integral", ["differentiat", "integrat", "differential", "calculus", "gradient"]),
            ("trig", ["trigonometry", "trigonometric", "radian", "sine", "cosine", "pythagoras", "circle theorem", "circle", "arc", "sector"]),
            ("graph", ["graph", "coordinate", "function", "straight line"]),
            ("vector", ["vector", "matrix", "matrice", "complex"]),
            ("shapes", ["shape", "angle", "area", "perimeter", "volume", "surface", "congruence", "similar", "symmetry", "bearing", "construction", "loci", "polygon", "transformation"]),
            ("algebra", ["algebra", "equation", "inequalit", "factoris", "bracket", "proof", "fraction", "partial", "rational", "surd", "indices", "logarithm", "exponential", "binomial", "sequence", "series", "polynomial", "quadratic", "simultaneous", "completing the square", "formula", "express"]),
            ("number", ["number", "percent", "ratio", "proportion", "rounding", "calculator", "prime", "hcf", "lcm", "standard form", "unit", "interest", "exchange", "money", "numerical", "place value"]),
        ],
    },
    "economics": {
        "emblem": "scales",
        "sections": ["supplydemand", "coins", "bank", "trend", "globe", "people"],
        "secRules": [],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("supplydemand", ["demand", "supply", "market", "elasticity", "equilibrium", "price"]),
            ("coins", ["cost", "revenue", "profit", "production", "productivity", "economic problem", "assumption", "externalit", "sector"]),
            ("bank", ["government", "policy", "intervention", "tax", "mixed economy"]),
            ("trend", ["macroeconomic", "objective", "inflation", "growth"]),
            ("globe", ["trade", "globalisation", "exchange rate", "international"]),
            ("people", ["labour", "wage", "employment"]),
        ],
    },
    "business": {
        "emblem": "briefcase",
        "sections": ["target", "megaphone", "people", "factory", "coins", "briefcase"],
        "secRules": [],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("megaphone", ["market", "research", "mix"]),
            ("coins", ["finance", "cash", "cost", "break even", "account", "financial", "money"]),
            ("people", ["organisation", "structure", "employee", "recruitment", "training", "motivation", "reward", "communication"]),
            ("factory", ["production", "quality", "economies", "scale", "location", "factors"]),
            ("target", ["objective", "successful", "classification", "external", "government", "international"]),
        ],
    },
    "accounting": {
        "emblem": "ledger",
        "sections": ["ledger", "percent", "coins", "briefcase"],
        "secRules": [],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("percent", ["ratio", "interpretation"]),
            ("ledger", ["ledger", "entry", "trial balance", "control accounts", "reconciliation", "receivable", "payable", "debts", "depreciation", "expenditure", "financial statements", "partnership", "sole trader", "manufacturer", "incomplete records", "adjustment", "books of original", "error"]),
            ("monitor", ["technology"]),
            ("briefcase", ["documentation", "business organisation", "ethics"]),
        ],
    },
    "english": {
        "emblem": "book",
        "sections": ["book", "quill", "speech", "topic"],
        "secRules": [],
        "default": "book", "nonSub": "book",
        "rules": [
            ("quill", ["writing", "how to answer", "how to approach", "portfolio", "assignment"]),
            ("speech", ["speaking", "listening", "spoken", "communication"]),
            ("book", ["reading", "anthology", "poetry", "unseen"]),
        ],
    },
    "geography": {
        "emblem": "globe",
        "sections": ["globe", "terrain", "city", "volcano", "leaf", "factory", "map"],
        "secRules": [],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("terrain", ["river", "water", "drainage", "coast"]),
            ("volcano", ["hazard", "earthquake", "volcano", "tectonic"]),
            ("city", ["urban", "rural", "city"]),
            ("leaf", ["biomes", "ecosystem", "fragile", "environment"]),
            ("factory", ["economic", "energy", "sector", "development", "globalis", "welfare", "resources"]),
            ("map", ["practical", "enquiry", "geographical"]),
        ],
    },
    "ict": {
        "emblem": "monitor",
        "sections": ["monitor", "chip", "network", "software", "lock"],
        "secRules": [],
        "default": "topic", "nonSub": "topic",
        "rules": [
            ("lock", ["securing", "risk", "security"]),
            ("network", ["network", "lan", "communication", "internet", "online", "service"]),
            ("chip", ["memory", "processor", "digital device", "peripheral", "hardware", "ict system", "technology"]),
            ("software", ["software", "spreadsheet", "word processing", "presentation", "graphics", "web authoring", "database", "file management"]),
        ],
    },
    "neutral": {
        "emblem": "topic", "sections": ["topic"], "secRules": [],
        "default": "topic", "nonSub": "topic", "rules": [],
    },
}

# subject (meta.subject, lowercased) -> family; 'science' handled strand-aware
FAMILY_MAP = {
    "maths": "maths", "further maths": "maths",
    "biology": "biology", "chemistry": "chemistry", "physics": "physics",
    "economics": "economics", "business": "business", "accounting": "accounting",
    "english language": "english", "english literature": "english",
    "geography": "geography", "ict": "ict",
}

BEGIN = "/*__KG_ICONS_BEGIN*/"
END = "/*__KG_ICONS_END__*/"


def _js_pack(name, p):
    rules = ",".join(
        "['%s',[%s]]" % (icon, ",".join("'%s'" % k.replace("'", "\\'") for k in kws))
        for icon, kws in p.get("rules", []))
    secrules = ",".join(
        "['%s',[%s]]" % (icon, ",".join("'%s'" % k for k in kws))
        for icon, kws in p.get("secRules", []))
    secs = ",".join("'%s'" % s for s in p.get("sections", []))
    return (" %s:{emblem:'%s',chemMode:%s,sections:[%s],secRules:[%s],"
            "rules:[%s],default:'%s',nonSub:'%s'}"
            % (name, p["emblem"], "true" if p.get("chemMode") else "false",
               secs, secrules, rules, p["default"], p["nonSub"]))


def _js_family_map() -> str:
    return "{" + ",".join("'%s':'%s'" % (k, v) for k, v in FAMILY_MAP.items()) + "}"


def emit_js() -> str:
    """The JS injection block: extra icon paths, packs, resolver, dispatcher."""
    extra = ",\n ".join("'%s':'%s'" % (k, v) for k, v in ICONS.items())
    order = ["chemistry", "biology", "physics", "maths", "economics", "business",
             "accounting", "english", "geography", "ict", "neutral"]
    packs = ",\n".join(_js_pack(n, PACKS[n]) for n in order)
    return BEGIN + """
// per-subject icon packs (syllabai-demo). Renderer untouched: this block is
// data + one dispatcher; with no pack active topicIconKey behaves exactly as
// the original build (chemistry inline dataset).
var KG_ICON_EXTRA={
 """ + extra + """
};
var KG_ICON_PACKS={
""" + packs + """
};
KG_ICON_PACKS.science={emblem:'beaker',
 sections:KG_ICON_PACKS.biology.sections,
 secRules:[].concat(KG_ICON_PACKS.biology.secRules,KG_ICON_PACKS.physics.secRules),
 rules:[].concat(KG_ICON_PACKS.biology.rules,KG_ICON_PACKS.physics.rules,KG_ICON_PACKS.chemistry.rules),
 default:'topic',nonSub:'topic'};
var __kgPackState={pack:null};
function kgSetIconPack(f){__kgPackState.pack=KG_ICON_PACKS[f]||null;return !!__kgPackState.pack;}
function kgPackIconKey(n){
 const P=__kgPackState.pack;
 if(n.type==='Subject')return P.emblem;
 if(n.type==='Section'){
  if(P.chemMode)return n.section==='1'?'flask':n.section==='2'?'periodic':n.section==='3'?'energy':'organic';
  const l=(n.label||'').toLowerCase();
  for(const r of P.secRules){for(const k of r[1])if(l.includes(k))return r[0];}
  const arr=P.sections,i=Math.max(0,(parseInt(n.section,10)||1)-1);
  return arr[i%arr.length];
 }
 const l=(n.label||'').toLowerCase();
 for(const r of P.rules){for(const k of r[1])if(l.includes(k))return r[0];}
 return n.type==='SubTopic'?P.default:(P.nonSub||P.default);
}
function kgIconFamily(subject,slug){
 const s=(subject||'').trim().toLowerCase();
 if(s==='science'){const m=/(biology|chemistry|physics)/.exec(slug||'');return m?m[1]:'science';}
 return """ + _js_family_map() + """[s]||'neutral';
}
""" + END
