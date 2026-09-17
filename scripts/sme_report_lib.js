// Library for SaveMyExams UX research report — cover recipe R1 + builders
// Per docx skill: design-system.md (R1 recipe, WM-1 palette), common-rules.md (Profile A)
"use strict";
const {
  Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, PageBreak,
} = require("docx");
const fs = require("fs");

// ── WM-1 Warm Teal palette (education) from design-system.md ──
const PALETTE = {
  bg: "F4F1E9", primary: "15857A", accent: "FF6A3B",
  cover: { titleColor: "15857A", subtitleColor: "606060", metaColor: "707070", footerColor: "A0A0A0" },
  table: { headerBg: "15857A", headerText: "FFFFFF", accentLine: "15857A", innerLine: "D5D0C8", surface: "F0EDE5" },
};

const NB = { style: BorderStyle.NONE };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };

// ── calcTitleLayout: Latin-aware width estimate (CJK = pt*20, Latin = pt*11 twips) ──
function estimateTextWidth(text, pt) {
  let w = 0;
  for (const ch of text) w += /[\u4e00-\u9fff\u3000-\u303f]/.test(ch) ? pt * 20 : pt * 11;
  return w;
}
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const avgCharW = (pt) => estimateTextWidth(title, pt) / title.length;
  const charsPerLine = (pt) => Math.max(2, Math.floor(maxWidthTwips / avgCharW(pt)));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    lines = splitTitleLines(title, charsPerLine(titlePt));
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Recipe R1: Pure Paragraph Cover (Left-Aligned) — from design-system.md ──
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.cover.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body builders (English report, Profile A: Times New Roman) ──
const EN = { ascii: "Times New Roman", eastAsia: "SimSun" };
const ENH = { ascii: "Times New Roman", eastAsia: "SimHei" };

function h1(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text: (num ? num + "  " : "") + text, bold: true, size: 32, color: PALETTE.primary, font: ENH })],
  });
}
function h2(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120, line: 312 },
    children: [new TextRun({ text: (num ? num + "  " : "") + text, bold: true, size: 28, color: PALETTE.primary, font: ENH })],
  });
}
// body paragraph; accepts string or array of TextRun-spec objects {text, bold}
function body(content, opts = {}) {
  const runs = (Array.isArray(content) ? content : [{ text: content }]).map(r =>
    new TextRun({ text: r.text, bold: !!r.bold, size: 24, color: "000000", font: EN }));
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: opts.after !== undefined ? opts.after : 120 },
    children: runs,
  });
}
// bullet item with lead-in bold term
function bullet(term, text) {
  const runs = [];
  if (term) runs.push(new TextRun({ text: term, bold: true, size: 24, color: "000000", font: EN }));
  runs.push(new TextRun({ text, size: 24, color: "000000", font: EN }));
  return new Paragraph({
    bullet: { level: 0 },
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 80 },
    children: runs,
  });
}
// figure: centered screenshot + caption (image keepNext so caption stays with it)
let FIG_N = 0;
function figure(file, caption) {
  FIG_N += 1;
  const buf = fs.readFileSync("/home/z/my-project/research/sme/" + file);
  const W = 560, H = Math.round(560 * (577 / 1280));
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true,
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({ data: buf, transformation: { width: W, height: H }, type: "png" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160, line: 312 },
      children: [new TextRun({ text: "Figure " + FIG_N + ": " + caption, size: 21, color: "606060", font: EN, italics: true })],
    }),
  ];
}
// table with header row; caption paragraph before (keepNext)
let TAB_N = 0;
function dataTable(caption, headers, rows, colWidths) {
  TAB_N += 1;
  const widths = colWidths || headers.map(() => Math.floor(100 / headers.length));
  const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };
  const mk = (text, isHeader) => new TableCell({
    children: [new Paragraph({
      spacing: { line: 312 },
      children: [new TextRun({ text, bold: isHeader, size: 21, color: isHeader ? PALETTE.table.headerText : "000000", font: EN })],
    })],
    shading: isHeader ? { type: ShadingType.CLEAR, fill: PALETTE.table.headerBg } : undefined,
    margins: cellMargins,
    width: { size: widths[0], type: WidthType.PERCENTAGE },
  });
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((t, i) => new TableCell({
      children: [new Paragraph({
        spacing: { line: 312 },
        children: [new TextRun({ text: t, bold: true, size: 21, color: PALETTE.table.headerText, font: EN })],
      })],
      shading: { type: ShadingType.CLEAR, fill: PALETTE.table.headerBg },
      margins: cellMargins,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = rows.map(r => new TableRow({
    cantSplit: true,
    children: r.map((t, i) => new TableCell({
      children: [new Paragraph({
        spacing: { line: 312 },
        children: [new TextRun({ text: t, size: 21, color: "000000", font: EN })],
      })],
      margins: cellMargins,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  }));
  return [
    new Paragraph({
      keepNext: true, spacing: { before: 120, after: 60, line: 312 },
      children: [new TextRun({ text: "Table " + TAB_N + ": " + caption, bold: true, size: 21, color: "404040", font: EN })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: PALETTE.table.accentLine },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: PALETTE.table.accentLine },
        left: NB, right: NB,
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PALETTE.table.innerLine },
        insideVertical: NB,
      },
      rows: [headerRow, ...dataRows],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

module.exports = {
  PALETTE, allNoBorders, noBorders, buildCoverR1,
  h1, h2, body, bullet, figure, dataTable, EN, ENH,
};
