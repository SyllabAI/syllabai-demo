#!/usr/bin/env node
/* kg_icon_gate.js — semantic gate for the per-subject icon pack fork.
 *
 * Args: <forkHtml> <canonicalJson> <subjectsJson>
 *   subjectsJson: [[subject, slug, expectedFamily], ...]
 *
 * Checks:
 *   1. EXTRA path library parses; every icon kind referenced by any pack
 *      (emblem/sections/secRules/rules/default/nonSub) exists in
 *      paths ∪ KG_ICON_EXTRA  (typo guard)
 *   2. chemistry golden snapshot: for every node of the canonical 4CH1
 *      export, the pack router with the chemistry pack returns EXACTLY what
 *      the build's original table returns (chemIconKey)
 *   3. every subject case resolves to its expected family, and every
 *      expected family exists in KG_ICON_PACKS
 */
const fs = require("fs");

const [forkPath, canonicalPath, subjectsPath] = process.argv.slice(2);
const html = fs.readFileSync(forkPath, "utf8");
const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
const subjects = JSON.parse(fs.readFileSync(subjectsPath, "utf8"));

let fail = 0;
const failMsg = (m) => { console.error("FAIL: " + m); fail++; };
const ok = (m) => console.log("  ok  " + m);

// --- extract the injected block -----------------------------------------
const b = html.indexOf("/*__KG_ICONS_BEGIN*/");
const e = html.indexOf("/*__KG_ICONS_END__*/");
if (b === -1 || e === -1 || e < b) { console.error("FAIL: sentinels not found"); process.exit(1); }
const inject = html.slice(b, e + "/*__KG_ICONS_END__*/".length);

// --- extract the original table (renamed chemIconKey) --------------------
const ckStart = html.indexOf("function chemIconKey(n){");
const ckEnd = html.indexOf("\nfunction topicIconKey(n){", ckStart);
if (ckStart === -1 || ckEnd === -1) { console.error("FAIL: chemIconKey not found"); process.exit(1); }
const chemFn = html.slice(ckStart, ckEnd);

// --- extract the build's own paths keys (icon() library) -----------------
const pStart = html.indexOf("const paths={");
const pEnd = html.indexOf("g.innerHTML=paths[kind]", pStart);
if (pStart === -1 || pEnd === -1) { console.error("FAIL: paths object not found"); process.exit(1); }
const buildPathKeys = new Set();
for (const m of html.slice(pStart, pEnd).matchAll(/([A-Za-z_][A-Za-z0-9_]*):'/g)) {
  buildPathKeys.add(m[1]);
}

// --- load the pack module in isolation (pure functions, no DOM) ----------
const sandboxSrc = inject + "\n" + chemFn + `
function topicIconKey(n){return (__kgPackState&&__kgPackState.pack)?kgPackIconKey(n):chemIconKey(n);}
module.exports={KG_ICON_EXTRA,KG_ICON_PACKS,kgSetIconPack,kgPackIconKey,kgIconFamily,chemIconKey,__kgPackState};
`;
const mod = new Function("module", sandboxSrc);
const box = { module: { exports: {} } };
try { mod(box.module); } catch (err) { console.error("FAIL: pack module eval: " + err.message); process.exit(1); }
const P = box.module.exports;

// --- 1. typo guard --------------------------------------------------------
const known = new Set([...buildPathKeys, ...Object.keys(P.KG_ICON_EXTRA)]);
const missing = new Set();
const ref = (kind) => { if (!known.has(kind)) missing.add(kind); };
for (const [fam, pack] of Object.entries(P.KG_ICON_PACKS)) {
  ref(pack.emblem); ref(pack.default); ref(pack.nonSub || pack.default);
  (pack.sections || []).forEach(ref);
  (pack.rules || []).forEach((r) => ref(r[0]));
  (pack.secRules || []).forEach((r) => ref(r[0]));
  if (!Array.isArray(pack.rules) || !Array.isArray(pack.sections)) failMsg(`pack ${fam}: bad shape`);
}
if (missing.size) failMsg(`icon kinds referenced but not defined: ${[...missing].join(", ")}`);
else ok(`typo guard: all pack icon kinds resolve (${buildPathKeys.size} build + ${Object.keys(P.KG_ICON_EXTRA).length} extra kinds)`);

// --- 2. chemistry golden snapshot -----------------------------------------
P.kgSetIconPack("chemistry");
let diffs = 0, checked = 0;
for (const n of canonical.nodes) {
  if (!n || !n.type) continue;
  checked++;
  const a = P.chemIconKey(n);
  const b2 = P.kgPackIconKey(n);
  if (a !== b2) { diffs++; if (diffs <= 5) failMsg(`chem mismatch ${n.id} (${n.type} "${n.label}"): original=${a} pack=${b2}`); }
}
P.kgSetIconPack(null);
if (diffs === 0) ok(`chemistry golden snapshot: ${checked}/${checked} nodes identical to the original table`);
else failMsg(`chemistry golden snapshot: ${diffs}/${checked} nodes differ`);

// --- 3. subject -> family coverage -----------------------------------------
const fams = Object.keys(P.KG_ICON_PACKS);
let famOk = 0;
for (const [subj, slug, expected] of subjects) {
  const got = P.kgIconFamily(subj, slug);
  if (got !== expected) { failMsg(`family(${JSON.stringify(subj)}, ${JSON.stringify(slug)}) = ${got}, expected ${expected}`); continue; }
  if (!fams.includes(got)) { failMsg(`family ${got} has no pack`); continue; }
  famOk++;
}
ok(`subject coverage: ${famOk}/${subjects.length} cases resolve to an existing pack (incl. science strand + neutral probes)`);

// extra path sanity: every EXTRA icon has parseable non-empty markup
let bad = 0;
for (const [k, v] of Object.entries(P.KG_ICON_EXTRA)) {
  if (typeof v !== "string" || v.length < 8 || !/[<>]/.test(v)) { failMsg(`EXTRA icon ${k}: suspicious markup`); bad++; }
}
if (!bad) ok(`EXTRA library: ${Object.keys(P.KG_ICON_EXTRA).length} icons, all non-empty markup`);

if (fail) { console.error(`icon gate: ${fail} failure(s)`); process.exit(1); }
console.log("icon gate: ALL PASS");
