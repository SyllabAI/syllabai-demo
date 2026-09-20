import katex from "katex";
import { speechExtras } from "../src/lib/speech-extras";
import { looksLikeSpeechText, speechToTexSafe } from "../src/lib/speech-math";

const SAMPLES = [
  "4.8 right enclose 8 bottom enclose 6 921... space equals space 4.89 space open parentheses 3 space s. f. close parentheses",
  "28. right enclose 2 bottom enclose 7 433... space equals space 28.27 space open parentheses 2 space d. p. close parentheses",
  "table row blank blank cell 48. bottom enclose right enclose 3 9 end enclose 3012... space end cell end table",
  "3 right enclose 1 bottom enclose.1 end enclose 3759... space equals space 31 space open parentheses 2 space s. f. close parentheses",
  "open angle brackets v subscript 1 superscript 2 close angle brackets",
  "H subscript 0 ∶ p equals 0.6<br>H subscript 1 ∶ p greater or equal than 0.6",
  "increment open parentheses N ϕ close parentheses space equals space B A N space minus space open parentheses negative B A N close parentheses",
  "g subscript 1 over g subscript 2 space equals space open parentheses r subscript 2 over r subscript 1 close parentheses squared",
  "straight P open parentheses passes vertical line no space revision close parentheses",
  "negative stack attributes charalign center stackalign right end attributes row a plus 20 d equals 43 end row row a plus 5 d equals 13 end row",
  "y italic equals open parentheses formula space in italic space x close parentheses",
  "sin open parentheses 90 degree close parentheses equals 1",
  "Q subscript 1 equals fraction numerator n over denominator _ _ _ _ _ end fraction text th value end text",
];

for (const s of SAMPLES) {
  const out = speechExtras(s);
  let status = "NULL";
  if (out !== null) {
    try { katex.renderToString(out, { throwOnError: true, strict: "ignore" }); status = "KATEX-OK"; }
    catch (e: any) { status = "KATEX-FAIL"; }
  }
  // also try the stripped recon path
  let recon: string | null = null;
  if (out === null && looksLikeSpeechText(s)) {
    const stripped = s.replace(/\s+space\b/g, "").replace(/\bspace\s+/g, " ").trim();
    for (const v of [s, stripped]) {
      const t = looksLikeSpeechText(v) ? speechToTexSafe(v) : null;
      if (t) { recon = t; break; }
    }
  }
  console.log(`${status.padEnd(10)} extras=${(out ?? "-").slice(0, 70)}${recon ? " | recon=" + recon.slice(0, 50) : ""}\n  IN: ${s.slice(0, 100)}`);
}
