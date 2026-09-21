// Injected via agent-browser eval. Returns JSON audit of the current page:
// contrast violations (WCAG 2.x), tiny fonts, small touch targets, overflow.
(() => {
  // ---- color parsing: rgb(), hex, lab() (CSS Color 4, D50), oklch() ----
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const gam = (v) => {
    v = clamp01(v);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  const d50to65 = (x, y, z) => [
    0.9555766 * x - 0.0230393 * y + 0.0631636 * z,
    -0.0282895 * x + 1.0099416 * y + 0.0210077 * z,
    0.0122982 * x - 0.020483 * y + 1.3299098 * z,
  ];
  const xyz65ToLinRgb = (x, y, z) => [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const labToRgb = (L, a, b) => {
    const e = 216 / 24389, k = 24389 / 27;
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
    const yr = L > k * e ? ((L + 16) / 116) ** 3 : L / k;
    const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
    const d50 = [0.9642956764, 1, 0.8251046025];
    const [x65, y65, z65] = d50to65(xr * d50[0], yr * d50[1], zr * d50[2]);
    return xyz65ToLinRgb(x65, y65, z65).map(gam);
  };
  const oklchToRgb = (L, C, Hdeg) => {
    const h = (Hdeg * Math.PI) / 180;
    const A = C * Math.cos(h), B = C * Math.sin(h);
    const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
    const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
    const s_ = L - 0.0894841775 * A - 1.291485548 * B;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(gam);
  };
  const nums = (s) => s.replace(/%/g, "").match(/-?[\d.]+/g).map(Number);
  const norm = (c) => {
    if (!c || c === "transparent") return null;
    c = c.trim();
    let m;
    if ((m = c.match(/^rgba?\(([^)]+)\)$/))) {
      const p = nums(m[1]);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    if ((m = c.match(/^#([0-9a-f]{3,8})$/i))) {
      const h = m[1];
      if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
      if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
      if (h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16) / 255 };
      return null;
    }
    if ((m = c.match(/^lab\(([^)]+)\)$/))) {
      const p = nums(m[1]);
      const [r, g, b] = labToRgb(p[0], p[1], p[2]);
      return { r: r * 255, g: g * 255, b: b * 255, a: p.length > 3 ? p[3] : 1 };
    }
    if ((m = c.match(/^oklch\(([^)]+)\)$/))) {
      const p = nums(m[1]);
      const [r, g, b] = oklchToRgb(p[0], p[1], p[2] || 0);
      return { r: r * 255, g: g * 255, b: b * 255, a: p.length > 3 ? p[3] : 1 };
    }
    if ((m = c.match(/^oklab\(([^)]+)\)$/))) {
      const p = nums(m[1]);
      const [r, g, b] = oklchToRgb(p[0], Math.hypot(p[1], p[2]), (Math.atan2(p[2], p[1]) * 180) / Math.PI);
      return { r: r * 255, g: g * 255, b: b * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const effBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = norm(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.01) return c.a >= 0.99 ? c : blend(c, effBgFromParent(node));
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const effBgFromParent = (el) => effBg(el.parentElement || document.body);

  const problems = [];
  const seen = new Set();
  const isSkipped = (el) => {
    const s = getComputedStyle(el);
    return s.display === "none" || s.visibility === "hidden" || +s.opacity === 0;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const tn of nodes) {
    const txt = tn.textContent.trim();
    if (!txt) continue;
    const el = tn.parentElement;
    if (!el || isSkipped(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    const fg = norm(s.color);
    if (!fg) continue;
    const bg = effBg(el);
    const cr = ratio(fg.a < 1 ? blend(fg, bg) : fg, bg);
    const fs = parseFloat(s.fontSize);
    const fw = +s.fontWeight || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    const key = txt.slice(0, 40) + "|" + Math.round(fs) + "|" + s.color;
    if (cr < need && !seen.has(key)) {
      seen.add(key);
      const path = (() => {
        let p = [], n = el;
        while (n && n !== document.body && p.length < 4) {
          p.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(" ").slice(0,2).join(".") : ""));
          n = n.parentElement;
        }
        return p.join(">");
      })();
      problems.push({
        kind: "contrast", ratio: +cr.toFixed(2), need,
        fs: +fs.toFixed(1), fw, color: s.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        text: txt.slice(0, 60), path,
      });
    }
    if (fs < 11 && !seen.has("tiny|" + txt.slice(0, 30) + fs)) {
      seen.add("tiny|" + txt.slice(0, 30) + fs);
      problems.push({ kind: "tiny-font", fs: +fs.toFixed(1), text: txt.slice(0, 60) });
    }
  }

  // touch targets: interactive elements with height < 24px (below WCAG 2.5.8 minimum)
  const targets = document.querySelectorAll('a[href], button, [role="button"], input, select, [tabindex]:not([tabindex="-1"])');
  const smallTargets = [];
  for (const el of targets) {
    if (isSkipped(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 24) {
      smallTargets.push({ h: +r.height.toFixed(1), w: +r.width.toFixed(1), tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40) });
    }
  }
  const stSeen = new Set();
  const small = smallTargets.filter(t => { const k = t.text + t.h; if (stSeen.has(k)) return false; stSeen.add(k); return true; }).slice(0, 12);

  const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  return JSON.stringify({ problems: problems.slice(0, 40), smallTouchTargets: small, overflowXPx: overflowX }, null, 1);
})()
