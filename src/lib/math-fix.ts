/**
 * Corpus math normalizer — KaTeX pre-processor for SME-derived content.
 *
 * Research finding (2026-09-18): SaveMyExams ships ZERO client-side math
 * dependencies — they emit native MathML (`<math xmlns="…/Math/MathML">`,
 * authored in Wiris MathType, `<semantics><annotation
 * encoding="application/vnd.wiris.mtweb-params+json">`) and let browser
 * MathML Core render it. Our corpus took a different path upstream: the
 * Wiris MathML was converted to LaTeX `$…$`, so KaTeX is the right renderer
 * here — but the conversion was lossy in one systematic way: it dropped the
 * space between a control word and the variable that follows it
 * (`A\capB`, `a^{m}\timesa^{n}`, `y\leqx`, `\DeltaE`, `V=IR\RightarrowR=…`).
 * KaTeX then fails with "Undefined control sequence" and the app shows the
 * raw source in red. Corpus audit: 102,963 math segments, 2,532 parse
 * errors, 97.5% of them this single glued-macro class.
 *
 * normalizeCorpusMath fixes all of that safely, without touching prose:
 *   1. inside `$…$` / `$$…$$` segments, re-splits glued macros
 *      (`\capB` → `\cap B`) using a longest-known-prefix match. Inserting a
 *      space between a control word and a letter never changes the meaning
 *      of input that already parses, and repairs input that doesn't.
 *   2. converts `\(...\)` inline-math delimiters (165 segments, unsupported
 *      by remark-math) to `$…$` — but only when the content parses as
 *      valid KaTeX math, so escaped-prose parentheses like `\(see note\)`
 *      are left untouched.
 *
 * Strings without any `$` or `\(` short-circuit untouched.
 */

import katex from "katex";

/** KaTeX control words that appear (or plausibly appear) glued to variables
 * in the corpus. Matched longest-first, so e.g. `\leq` wins over `\le`,
 * `\dots` over `\dot`, `\subseteq` over `\subset` over `\sup`. */
const MACRO_NAMES = [
  // Greek (upper + lower) and variant forms
  "Delta", "Gamma", "Lambda", "Sigma", "Omega", "Theta", "Phi", "Psi",
  "Upsilon", "Xi", "Pi",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "rho", "sigma",
  "tau", "upsilon", "phi", "chi", "psi", "omega",
  "varepsilon", "vartheta", "varphi", "varpi", "varrho", "varsigma",
  "imath", "jmath", "ell", "hbar", "aleph",
  // relations
  "leq", "geq", "neq", "equiv", "approx", "sim", "simeq", "cong",
  "propto", "le", "ge", "ne",
  // set algebra
  "cap", "cup", "in", "notin", "subset", "supset", "subseteq", "supseteq",
  "emptyset", "setminus", "bigcap", "bigcup", "bigsqcup", "biguplus",
  "infty", "int", "iint", "iiint", "oint", "idotsint", "injlim",
  // binary operators
  "times", "div", "pm", "mp", "cdot", "ast", "star", "circ", "bullet",
  "oplus", "ominus", "otimes", "odot", "wedge", "vee", "land", "lor",
  "bigoplus", "bigotimes", "bigodot", "bigvee", "bigwedge",
  // arrows
  "Rightarrow", "Leftarrow", "Leftrightarrow", "rightarrow", "leftarrow",
  "leftrightarrow", "longrightarrow", "longleftarrow", "longleftrightarrow",
  "implies", "iff", "to", "gets", "mapsto", "longmapsto",
  "hookrightarrow", "hookleftarrow", "uparrow", "downarrow", "updownarrow",
  "Uparrow", "Downarrow", "Updownarrow", "rightleftharpoons",
  "xrightleftharpoons", "xleftrightarrow",
  // named functions
  "sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "coth",
  "arcsin", "arccos", "arctan", "log", "ln", "lg", "exp", "max", "min",
  "lim", "limsup", "liminf", "sup", "gcd", "deg", "det", "dim", "arg",
  "hom", "ker", "Pr", "mod", "bmod", "pmod",
  // big operators
  "sum", "prod", "coprod",
  // accents, bars, decorations
  "hat", "bar", "vec", "dot", "tilde", "overline", "underline",
  "overbrace", "underbrace", "widehat", "widetilde", "overleftarrow",
  "overrightarrow", "overleftrightarrow", "stackrel", "overset",
  "underset", "ddots", "vdots", "dots", "ldots", "cdots",
  // text / font switches
  "text", "textbf", "textit", "texttt", "textrm", "textsf", "textnormal",
  "mathrm", "mathbf", "mathit", "mathbb", "mathcal", "mathfrak", "mathscr",
  "mathsf", "mathtt", "boldsymbol", "pmb",
  // structure
  "sqrt", "frac", "dfrac", "tfrac", "binom", "dbinom", "tbinom", "over",
  // misc symbols
  "langle", "rangle", "angle", "perp", "parallel", "mid", "nmid",
  "therefore", "because", "forall", "exists", "neg", "wp", "Re", "Im",
  "quad", "qquad",
].sort((a, b) => b.length - a.length);

const MACRO_SET = new Set(MACRO_NAMES);

/**
 * Re-splits glued macros inside a math segment: `A\capB` → `A\cap B`.
 *
 * Walks every `\word` token; when the full word is NOT a known KaTeX macro
 * but has a longest known prefix, a space is inserted after that prefix.
 * Tokens whose full word IS known (`\overset`, `\overline`, `\int`…) are
 * never rewritten, so valid input is untouched — no regex-backtracking
 * pitfalls like `\overset{…}` being mis-split into `\over set{…}`.
 */
export function fixGluedMacros(tex: string): string {
  return tex.replace(/\\([a-zA-Z]+)/g, (match, word: string) => {
    if (MACRO_SET.has(word)) return match;
    for (const name of MACRO_NAMES) {
      // MACRO_NAMES is sorted longest-first
      if (word.startsWith(name)) {
        return `\\${word.slice(0, name.length)} ${word.slice(name.length)}`;
      }
    }
    return match;
  });
}

/**
 * Full math-value sanitizer used by the remark plugin (AST level):
 *  1. glue-split unknown `\word` tokens (fixGluedMacros);
 *  2. `%` → `\%` — KaTeX treats bare `%` as a comment start, silently
 *     swallowing the rest of the formula (`\text{4.2%}` broke);
 *  3. underscore runs `__`/`____` (fill-in-the-blank answers upstream) →
 *     escaped literal underscores — a bare `_` is a broken subscript.
 */
export function sanitizeMathTex(tex: string): string {
  return fixGluedMacros(tex)
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/_{2,}/g, (run) => run.replace(/_/g, "\\_"));
}

// segment delimiters (mirror remark-math's effective handling of this corpus)
const DISPLAY_RE = /(?<!\\)\$\$([\s\S]+?)\$\$/g;
const INLINE_RE = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
const PAREN_RE = /\\\((.+?)\\\)/g;

/** Is `tex` parseable by KaTeX? (throwOnError, silent strict-mode warnings) */
function parses(tex: string, display = false): boolean {
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Heuristic: real math never contains bare 3+-letter runs (long words only
 * appear inside control sequences like `\frac`). KaTeX parses plain English
 * words as implicit-multiplication variables, so parseability alone cannot
 * tell `\(z = \frac{1}{2}(5 \pm 4i)\)` from `\(see note 2\)` — this can.
 */
function looksLikeProse(tex: string): boolean {
  const withoutMacros = tex.replace(/\\[a-zA-Z]+/g, "");
  return /[a-zA-Z]{3,}/.test(withoutMacros);
}

/**
 * Normalize one markdown string's math content in place.
 * Cheap no-op for strings without `$` / `\(` (the vast majority of prose).
 */
export function normalizeCorpusMath(src: string): string {
  if (!src.includes("$") && !src.includes("\\(")) return src;

  let out = src.replace(DISPLAY_RE, (_m, inner: string) => `$$${fixGluedMacros(inner)}$$`);
  out = out.replace(
    INLINE_RE,
    (_m, inner: string) => `$${fixGluedMacros(inner)}$`,
  );
  // \(…) → $…$ only when the content is genuine (KaTeX-parseable) math;
  // remark-math has no \( delimiter, so these currently render as literal text.
  if (out.includes("\\(")) {
    out = out.replace(PAREN_RE, (_m, inner: string) => {
      const fixed = fixGluedMacros(inner.trim());
      return !looksLikeProse(fixed) && parses(fixed) ? `$${fixed}$` : _m;
    });
  }
  return out;
}
