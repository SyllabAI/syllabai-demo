// Bisect: where does the sanitized value get lost?
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import remarkParse from "remark-parse";
import katex from "katex";
import { sanitizeMathTex, normalizeCorpusMath } from "/home/z/my-project/work/tsbuild/math-fix.js";

function makePlugin(label) {
  return () => (tree) => {
    const walk = (node) => {
      if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
        console.log(`[${label}]`, JSON.stringify(node.value.slice(0, 50)));
        node.value = sanitizeMathTex(node.value).replace(/\$\$/g, "\\quad ");
      }
      (node.children ?? []).forEach(walk);
    };
    walk(tree);
  };
}

const src =
  "Circle the value of $\\mathrm{cos}$$(360^{\\circ}+\\u03b1^{\\circ})$\n\n| $k--1$ | $k+1$ | $--k$ | $k$ |\n|---|---|---|---|";
const norm = normalizeCorpusMath(src);

// A) unified manual: parse → math → myPlugin → rehype → katex
const procA = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(makePlugin("A-math-node"))
  .use(remarkRehype, { allowDangerousHtml: true });
const treeA = procA.parse(norm);
const hastA = procA.runSync(treeA);
// find math elements in hast
const visit = (n, cb) => {
  cb(n);
  (n.children ?? []).forEach((c) => visit(c, cb));
};
visit(hastA, (n) => {
  const cls = n.properties?.className;
  if (Array.isArray(cls) && cls.some((c) => String(c).includes("math"))) {
    console.log("A hast math element:", JSON.stringify(n.children?.[0]?.value?.slice(0, 60)));
  }
});

// B) react-markdown full (same as debug_reactmd)
function remarkFixGluedMacros() {
  const walk = (node) => {
    if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
      console.log(`[B-rmd]`, JSON.stringify(node.value.slice(0, 50)));
      node.value = sanitizeMathTex(node.value).replace(/\$\$/g, "\\quad ");
    }
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}
const html = renderToStaticMarkup(
  React.createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm, remarkMath, remarkFixGluedMacros],
      rehypePlugins: [[rehypeKatex, { throwOnError: false, errorColor: "#b91c1c", strict: "ignore" }]],
    },
    norm,
  ),
);
console.log("B katex-error:", (html.match(/katex-error/g) || []).length);
