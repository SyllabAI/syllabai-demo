// Reproduce with the app's EXACT react-markdown stack (rehype-level fix).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { normalizeCorpusMath, sanitizeMathTex } from "/home/z/my-project/work/tsbuild/math-fix.js";

// mirrors rehypeFixMathValues in markdown.tsx
function rehypeFixMathValues() {
  const isMathElement = (n) => {
    if (n.type !== "element") return false;
    const cls = n.properties?.className;
    const list = Array.isArray(cls) ? cls.map(String) : [];
    return list.some((c) => c === "language-math" || c === "math-inline" || c === "math-display");
  };
  const walk = (node) => {
    if (isMathElement(node) && node.children) {
      const texts = node.children.filter((c) => c.type === "text" && typeof c.value === "string");
      if (texts.length) {
        const fixed = sanitizeMathTex(texts.map((t) => t.value).join("")).replace(/\$\$/g, "\\quad ");
        texts.forEach((t, i) => {
          t.value = i === 0 ? fixed : "";
        });
        console.log("FIXED hast text ->", JSON.stringify(fixed.slice(0, 60)));
      }
    }
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}

const src =
  "Circle the value of $\\mathrm{cos}$$(360^{\\circ}+\\u03b1^{\\circ})$\n\n| $k--1$ | $k+1$ | $--k$ | $k$ |\n|---|---|---|---|";
const norm = normalizeCorpusMath(src);

const html = renderToStaticMarkup(
  React.createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [
        rehypeRaw,
        rehypeFixMathValues,
        [rehypeKatex, { throwOnError: false, errorColor: "#b91c1c", strict: "ignore" }],
      ],
    },
    norm,
  ),
);
const errs = (html.match(/katex-error/g) || []).length;
console.log("katex-error count:", errs);
console.log(errs ? "STILL FAILING" : "CLEAN RENDER");
