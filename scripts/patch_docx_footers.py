#!/usr/bin/env python3
"""Patch docx footers for WPS compatibility:
- Roman-numeral section footer: PAGE -> PAGE \\* ROMAN \\* MERGEFORMAT
- Arabic section footer:        PAGE -> PAGE \\* arabic \\* MERGEFORMAT
- Remove empty <w:pgNumType/> elements (cover section artifact)
"""
import re
import shutil
import sys
import zipfile

DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/SaveMyExams_UX_Feature_Research.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

# 1. Remove empty pgNumType from document.xml
doc = data["word/document.xml"].decode("utf-8")
doc, n_removed = re.subn(r"<w:pgNumType/>", "", doc)
data["word/document.xml"] = doc.encode("utf-8")

# 2. Identify section order of footer references to map roman vs arabic.
# Section 2 (front matter) footer -> ROMAN; Section 3 (body) footer -> arabic.
# docx-js emits footer references in sectPr order; find them:
sect_footers = re.findall(r'<w:footerReference w:type="default" r:id="(rId\d+)"/>', doc)
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))
ordered_footers = [rid_to_target.get(r) for r in sect_footers if rid_to_target.get(r)]
print("footer refs in section order:", ordered_footers)

def patch_footer(xml: str, fmt: str) -> str:
    return re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )

for i, fname in enumerate(ordered_footers):
    key = "word/" + fname
    xml = data[key].decode("utf-8")
    fmt = "ROMAN" if i == 0 else "arabic"
    patched = patch_footer(xml, fmt)
    if patched != xml:
        print(f"patched {fname} -> {fmt}")
    data[key] = patched.encode("utf-8")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, DOCX)
print(f"OK: removed {n_removed} empty pgNumType; footers patched -> {DOCX}")
