/**
 * Unit tests for src/lib/speech-extras.ts — real corpus stragglers from the
 * T-SME-23a math repair. Run: bun scripts/test_speech_extras_23a.ts
 * Every case must convert to KaTeX-parseable LaTeX with zero residual
 * Chrome speech vocabulary.
 */
import katex from "katex";
import { speechExtras, hasResidualGrammar } from "../src/lib/speech-extras";

const SAMPLES: [string, string][] = [
  ["4.8 right enclose 8 bottom enclose 6 921... space equals space 4.89 space open parentheses 3 space s. f. close parentheses", "recurring decimal"],
  ["28. right enclose 2 bottom enclose 7 433... space equals space 28.27 space open parentheses 2 space d. p. close parentheses", "recurring decimal"],
  ["3 right enclose 1 bottom enclose.1 end enclose 3759... space equals space 31 space open parentheses 2 space s. f. close parentheses", "recurring decimal"],
  ["open angle brackets v subscript 1 superscript 2 close angle brackets", "mean of squares"],
  ["H subscript 0 ∶ p equals 0.6<br>H subscript 1 ∶ p greater or equal than 0.6", "hypotheses"],
  ["increment open parentheses N ϕ close parentheses space equals space B A N space minus space open parentheses negative B A N close parentheses", "physics flux"],
  ["g subscript 1 over g subscript 2 space equals space open parentheses r subscript 2 over r subscript 1 close parentheses squared", "ratio"],
  ["straight P open parentheses passes vertical line no space revision close parentheses", "conditional probability"],
  ["negative stack attributes charalign center stackalign right end attributes row a plus 20 d equals 43 end row row a plus 5 d equals 13 end row", "arithmetic stack"],
  ["y italic equals open parentheses formula space in italic space x close parentheses", "flashcard placeholder"],
  ["sin open parentheses 90 degree close parentheses equals 1", "degree"],
  ["Q subscript 1 equals fraction numerator n over denominator _ _ _ _ _ end fraction text th value end text", "quartile blank"],
  ["straight U presubscript 92 presuperscript 235 space plus space straight n presubscript 0 presuperscript 1 space rightwards arrow space Kr presubscript 36 presuperscript 92", "fission equation"],
  ["straight Y presubscript straight Z minus 2 end presubscript presuperscript straight A minus 4 end presuperscript", "alpha decay"],
  ["4 over 15 cross times 25 over 11 equals fraction numerator 4 over denominator stack down diagonal strike 15 with 3 below end fraction cross times fraction numerator stack down diagonal strike 25 with 5 on top over denominator 11 end fraction", "cancellation"],
  ["81 equals 9 to the power of 2 space end exponent equals space open parentheses 3 squared close parentheses squared space equals space 3 to the power of 4 space to the power of space", "duplicate-power artifact"],
  ["fraction numerator cube root of 81 over denominator 3 end fraction equals fraction numerator cube root of 3 to the power of 4 end root over denominator 3 end fraction", "cube roots"],
  ["table row cell square root of 1500 end cell equals cell square root of open parentheses 2 squared cross times 5 squared close parentheses end cell end table", "table with roots"],
  ["open parentheses table row 6 row cell negative 2 end cell end table close parentheses", "column vector"],
  ["table row cell 3 a plus b end cell equals cell 7 end cell row cell 2 a plus b end cell equals cell 5 end cell end table", "simultaneous equations"],
  ["vertical line z vertical line equals vertical line z asterisk times vertical line", "modulus"],
  ["vertical line 8 straight i vertical line equals 8", "modulus"],
  ["open parentheses 2 cross times 10 cubed close parentheses cross times open parentheses 6 cross times 10 to the power of 5 close parentheses", "standard form"],
  ["4 cross times open parentheses a plus b close parentheses", "expansion"],
];

let pass = 0, fail = 0;
for (const [input, label] of SAMPLES) {
  const out = speechExtras(input);
  let status = "PASS";
  let detail = "";
  if (out === null) { status = "FAIL"; detail = "converted to null"; }
  else if (hasResidualGrammar(out)) { status = "FAIL"; detail = "residual grammar"; }
  else {
    try {
      katex.renderToString(out, { throwOnError: true, strict: "ignore" });
    } catch (e: any) {
      status = "FAIL"; detail = `katex: ${e.message?.slice(0, 60)}`;
    }
  }
  if (status === "PASS") pass++; else { fail++; console.log(`${status} [${label}] ${detail}\n  IN : ${input.slice(0, 100)}\n  OUT: ${out?.slice(0, 100)}`); }
}
console.log(`\nspeech-extras unit tests: ${pass}/${SAMPLES.length} pass`);
if (fail > 0) process.exit(1);
