// Main assembler: SaveMyExams UX Feature Research Report (.docx)
// 3-section architecture: Cover (no page#) -> TOC (Roman) -> Body (Arabic from 1)
"use strict";
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber,
  AlignmentType, HeadingLevel, SectionType, NumberFormat, PageBreak, TableOfContents,
} = require("docx");
const fs = require("fs");
const { PALETTE, buildCoverR1, EN, ENH } = require("./sme_report_lib.js");

const content1 = require("./sme_report_content1.js");
const content2 = require("./sme_report_content2.js");

const OUT = "/home/z/my-project/download/SaveMyExams_UX_Feature_Research.docx";

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: EN })],
    })],
  });
}
function docHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "SaveMyExams UX Feature Research - SyllabAI Learning Hub", size: 18, color: "808080", font: EN })],
    })],
  });
}

// ── Cover config (R1, WM-1) ──
const coverConfig = {
  title: "SaveMyExams UX Feature Research",
  subtitle: "Revision Notes and Exam Questions - feature teardown for the SyllabAI Learning Hub",
  englishLabel: "UX RESEARCH",
  metaLines: [
    "Platform studied: savemyexams.com (web, anonymous session)",
    "Method: live browser walkthrough with 25 annotated captures",
    "Focus: Edexcel IGCSE Chemistry (4CH1); A Level and CIE cross-checks",
    "Prepared for: SyllabAI - Learning Hub design (syllabai-demo)",
  ],
  footerLeft: "SyllabAI",
  footerRight: "18 September 2026",
  palette: PALETTE,
};

// ── TOC section children ──
const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: ENH, color: PALETTE.primary })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: EN,
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const doc = new Document({
  creator: "SyllabAI",
  title: "SaveMyExams UX Feature Research",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 32, bold: true, color: PALETTE.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 28, bold: true, color: PALETTE.primary },
        paragraph: { spacing: { before: 260, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer, no pageNumbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig),
    },
    { // Section 2: Front matter (TOC) — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: tocChildren,
    },
    { // Section 3: Body — Arabic from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: [...content1, ...content2],
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE", OUT, buf.length, "bytes");
}).catch(e => { console.error(e); process.exit(1); });
