// Semantic UX audit: headings, generic link text, missing alt/aria names, lang, title.
(() => {
  const out = { h1: [], headingOrder: [], genericLinks: [], unnamedControls: [], imgsNoAlt: [] };
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(h => {
    const s = getComputedStyle(h);
    return s.display !== "none" && s.visibility !== "hidden" && h.textContent.trim();
  });
  for (const h of headings) {
    const item = { tag: h.tagName, text: h.textContent.trim().slice(0, 70) };
    if (h.tagName === "H1") out.h1.push(item.text);
    out.headingOrder.push(h.tagName);
  }
  const generic = /^(click here|here|learn more|more|read more|link|this|details|view|open|go|see more|start|continue)$/i;
  for (const a of document.querySelectorAll("a[href]")) {
    const s = getComputedStyle(a);
    if (s.display === "none") continue;
    const t = (a.getAttribute("aria-label") || a.textContent || "").trim();
    if (!t) out.genericLinks.push({ href: a.getAttribute("href"), text: "(empty)" });
    else if (generic.test(t) && t.length < 12) out.genericLinks.push({ href: a.getAttribute("href"), text: t });
  }
  for (const el of document.querySelectorAll("button, [role=button], input[type=submit]")) {
    const s = getComputedStyle(el);
    if (s.display === "none") continue;
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
    if (!name) out.unnamedControls.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), html: el.outerHTML.slice(0, 80) });
  }
  for (const img of document.querySelectorAll("img")) {
    if (!img.getAttribute("alt") && img.getAttribute("aria-hidden") !== "true" && img.getAttribute("role") !== "presentation")
      out.imgsNoAlt.push({ src: (img.src || "").slice(-60), cls: String(img.className).slice(0, 50) });
  }
  out.headingOrder = out.headingOrder.join(" ");
  out.genericLinks = out.genericLinks.slice(0, 10);
  out.unnamedControls = out.unnamedControls.slice(0, 10);
  out.imgsNoAlt = out.imgsNoAlt.slice(0, 10);
  return JSON.stringify(out, null, 1);
})()
