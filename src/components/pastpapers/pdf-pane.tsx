"use client";

/**
 * PdfPane — mobile-first PDF viewer over pdf.js (pdfjs-dist v4).
 *
 * Why a custom viewer (decided with the user): native <iframe> PDF embeds are
 * unreliable on Android Chrome and iOS Safari; canvas rendering works
 * everywhere a demo student is likely to be.
 *
 * Performance architecture (v2 — the v1 viewer felt choppy; measured causes
 * were: doc.cleanup() on every scroll frame, canvases destroyed mid-scroll
 * with no hysteresis, offsetTop loops per scroll frame, layout driven through
 * React state, and the whole doc being re-fetched when a pane was toggled):
 *
 *   - fit-width by default (recomputed on container resize), zoom on top of fit;
 *   - IntersectionObserver page tracking — zero work per scroll frame; the
 *     "center page" is recomputed only when the near-zone (rootMargin 300%)
 *     intersection set changes, with a passive-scroll fallback for ancient
 *     browsers;
 *   - virtualised window: pages within RENDER_RADIUS of the center hold a
 *     canvas, rendered NEAREST-FIRST; a hysteresis band keeps canvases alive
 *     out to CLEAR_RADIUS and an idle sweep (SWEEP_DELAY_MS after the last
 *     window change) frees anything beyond it — no canvas is ever destroyed
 *     mid-scroll, so no blank flashes;
 *   - pdf.js caches are NEVER wiped while mounted (no doc.cleanup()) — pages
 *     re-entering the window re-render instantly from the warm cache;
 *   - double-buffered painting: every render draws into a detached canvas and
 *     swaps atomically on completion, so zoom/resize re-fits never blank the
 *     document (the old canvas stays visible until the new one lands), and
 *     scroll position is preserved through the zoom by scaling the anchor;
 *   - layout sizes are imperative (holder inline styles via refs), NOT React
 *     state — rendering a page triggers zero re-renders; React state is only
 *     phase/numPages/currentPage/zoom;
 *   - the document SURVIVES pane toggling: hidden split panes (mobile A/B,
 *     desktop QP|MS|Split) keep their doc, canvases and scroll position —
 *     active=false merely pauses tracking; teardown happens only on url/
 *     retry/unmount.
 *
 * PDFs stream straight from the syllabai-pastpapers corpus on
 * raw.githubusercontent.com (CORS-enabled); nothing is proxied or vendored
 * except the version-matched pdf.js worker (public/pdfjs/).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
type PdfPage = import("pdfjs-dist").PDFPageProxy;
type RenderTask = import("pdfjs-dist").RenderTask;

export interface PdfPaneProps {
  url: string;
  /** download/open fallback link (the same raw corpus URL) */
  downloadUrl?: string;
  label: string;
  /** when false (hidden split pane) tracking pauses; the loaded doc stays */
  active: boolean;
  className?: string;
}

/** Pages holding a canvas: center ± RENDER_RADIUS (nearest-first). */
const RENDER_RADIUS = 3;
/** Hysteresis: canvases survive out to center ± CLEAR_RADIUS … */
const CLEAR_RADIUS = 6;
/** … but never more than MAX_CANVASES at once (desktop wide-pane safety). */
const MAX_CANVASES = 9;
/** Idle delay before the sweep frees canvases beyond the hysteresis band. */
const SWEEP_DELAY_MS = 350;

export function PdfPane({ url, downloadUrl, label, active, className }: PdfPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const holderRefs = useRef(new Map<number, HTMLDivElement>());
  const docRef = useRef<PdfDoc | null>(null);
  const tasksRef = useRef(new Map<number, RenderTask>());
  /** pages currently holding a live canvas */
  const canvasesRef = useRef(new Set<number>());
  const centerRef = useRef(1);
  const aspectRef = useRef(297 / 210); // A4 portrait fallback (h/w)
  const zoomRef = useRef(1);
  const anchorRef = useRef<{ top: number; pageH: number; at: number } | null>(null);
  const sweepTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  const [reloadKey, setReloadKey] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  /** zoom multiplier on fit-width — ref for render math, state for the toolbar */
  const [zoomPct, setZoomPct] = useState(100);

  // ── geometry ─────────────────────────────────────────────────────────────
  const fitFor = useCallback((page: PdfPage) => {
    const base = page.getViewport({ scale: 1 });
    const w = scrollRef.current?.clientWidth ?? 800;
    const avail = Math.max(240, w - 24);
    const scale = Math.min(4, (avail / base.width) * zoomRef.current);
    return { scale, cssW: Math.round(base.width * scale), cssH: Math.round(base.height * scale) };
  }, []);

  /** Size every canvas-less holder from the container width + page-1 aspect. */
  const applyPlaceholderStyles = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const avail = Math.max(240, scroller.clientWidth - 24);
    const w = Math.round(avail * zoomRef.current);
    const h = Math.round(w * aspectRef.current);
    for (const [n, el] of holderRefs.current) {
      if (canvasesRef.current.has(n)) continue;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
  }, []);

  // ── idle sweep: free canvases beyond the hysteresis band (never mid-scroll)
  const scheduleSweep = useCallback(() => {
    if (sweepTimerRef.current !== null) return; // already pending — coalesce
    sweepTimerRef.current = window.setTimeout(() => {
      sweepTimerRef.current = null;
      const center = centerRef.current;
      // farthest-first: band-escapees always freed; then overflow down to cap
      const ordered = [...canvasesRef.current].sort(
        (a, b) => Math.abs(b - center) - Math.abs(a - center),
      );
      let live = canvasesRef.current.size;
      for (const n of ordered) {
        const beyondBand = Math.abs(n - center) > CLEAR_RADIUS;
        if (!beyondBand && live <= MAX_CANVASES) break; // closest pages survive
        tasksRef.current.get(n)?.cancel();
        tasksRef.current.delete(n);
        canvasesRef.current.delete(n);
        holderRefs.current.get(n)?.replaceChildren();
        live--;
      }
    }, SWEEP_DELAY_MS);
  }, []);

  // ── rendering (double-buffered: paint detached, swap atomically) ─────────
  const renderPage = useCallback(
    async (n: number) => {
      const doc = docRef.current;
      const holder = holderRefs.current.get(n);
      if (!doc || !holder || !holder.isConnected) return;
      tasksRef.current.get(n)?.cancel(); // supersede any in-flight render
      let page: PdfPage;
      try {
        page = await doc.getPage(n);
      } catch {
        return; // doc destroyed while unmounting
      }
      if (docRef.current !== doc || !holder.isConnected) return;
      const { scale, cssW, cssH } = fitFor(page);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.className = "block";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport }) as RenderTask;
      tasksRef.current.set(n, task);
      try {
        await task.promise;
      } catch {
        if (tasksRef.current.get(n) === task) tasksRef.current.delete(n);
        return; // cancelled or transient
      }
      if (tasksRef.current.get(n) !== task) return; // superseded by a newer render
      tasksRef.current.delete(n);
      // wandered far off-viewport while painting → don't mount, sweep will not
      if (Math.abs(n - centerRef.current) > CLEAR_RADIUS) return;
      holder.replaceChildren(canvas);
      holder.style.width = `${cssW}px`;
      holder.style.height = `${cssH}px`;
      canvasesRef.current.add(n);
      // zoom/resize scroll preservation: on the center page's first swap,
      // scale scrollTop by the height ratio so the same content stays in view
      const anchor = anchorRef.current;
      if (anchor && n === centerRef.current && Date.now() - anchor.at < 3000 && anchor.pageH > 0) {
        anchorRef.current = null;
        const sc = scrollRef.current;
        if (sc) sc.scrollTop = Math.round((anchor.top * cssH) / anchor.pageH);
      }
      scheduleSweep();
    },
    [fitFor, scheduleSweep],
  );

  /** Render wanted pages (center ± RENDER_RADIUS, nearest-first). */
  const syncWindow = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    const center = centerRef.current;
    for (let d = 0; d <= RENDER_RADIUS; d++) {
      for (const n of d === 0 ? [center] : [center - d, center + d]) {
        if (n < 1 || n > doc.numPages) continue;
        if (canvasesRef.current.has(n) || tasksRef.current.has(n)) continue;
        void renderPage(n);
      }
    }
    scheduleSweep();
  }, [renderPage, scheduleSweep]);

  /** Zoom/resize re-fit: re-render in-radius canvases at the new scale while
   * the old ones stay visible (double buffering), re-style placeholders. */
  const refreeze = useCallback(() => {
    const doc = docRef.current;
    const scroller = scrollRef.current;
    if (!doc || !scroller) return;
    const center = centerRef.current;
    const pageH = holderRefs.current.get(center)?.offsetHeight ?? 0;
    anchorRef.current = { top: scroller.scrollTop, pageH, at: Date.now() };
    for (const n of [...canvasesRef.current]) {
      if (Math.abs(n - center) <= RENDER_RADIUS) void renderPage(n);
    }
    applyPlaceholderStyles();
    scheduleSweep();
  }, [renderPage, applyPlaceholderStyles, scheduleSweep]);

  // ── center-page tracking ─────────────────────────────────────────────────
  const computeCenter = useCallback((): number | null => {
    const scroller = scrollRef.current;
    if (!scroller) return null;
    // rect-based (NOT offsetTop — holders live in a different coordinate
    // space whenever the scroller isn't their offsetParent); converted to
    // scroller-relative offsets so scrollTop/clientHeight compare correctly
    const sr = scroller.getBoundingClientRect();
    const mid = scroller.clientHeight / 2;
    let best = 1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [n, el] of holderRefs.current) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue; // hidden pane
      const top = r.top - sr.top;
      const bottom = top + r.height;
      const dist = mid < top ? top - mid : mid > bottom ? mid - bottom : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    return best;
  }, []);

  const onNearChange = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const c = computeCenter();
      if (c != null && c !== centerRef.current) {
        centerRef.current = c;
        setCurrentPage(c);
      }
      syncWindow();
    });
  }, [computeCenter, syncWindow]);

  // ── load document (loads once per url/retry; survives active toggles) ────
  useEffect(() => {
    if (!active) return;
    if (docRef.current) return; // re-activated pane — doc, canvases, scroll kept
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        const p1 = await doc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        aspectRef.current = vp.height / vp.width;
        setNumPages(doc.numPages);
        centerRef.current = 1;
        setCurrentPage(1);
        setPhase("ready");
        syncWindow(); // holders may not exist yet — the ready-kick re-runs this
      } catch (err) {
        if (cancelled) return;
        setErrorMsg((err as Error)?.message ?? "Could not load the PDF");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, active, reloadKey, syncWindow]);

  /** Hard teardown — only on url/retry change or unmount (NOT on toggles). */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (sweepTimerRef.current !== null) {
        window.clearTimeout(sweepTimerRef.current);
        sweepTimerRef.current = null;
      }
      for (const t of tasksRef.current.values()) t.cancel();
      tasksRef.current.clear();
      canvasesRef.current.clear();
      holderRefs.current.clear();
      anchorRef.current = null;
      const doc = docRef.current;
      docRef.current = null;
      void doc?.destroy();
    };
  }, [url, reloadKey]);

  /** When the doc becomes ready the placeholder divs must exist in the DOM
   * before any canvas can mount into them — re-kick the window post-commit
   * (also covers a pane re-activating in split view). */
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    applyPlaceholderStyles();
    syncWindow();
  }, [phase, active, applyPlaceholderStyles, syncWindow]);

  // ── near-zone tracking: IntersectionObserver (passive-scroll fallback) ───
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (typeof IntersectionObserver === "undefined") {
      const onScroll = () => onNearChange();
      scroller.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => scroller.removeEventListener("scroll", onScroll);
    }
    const io = new IntersectionObserver(() => onNearChange(), {
      root: scroller,
      rootMargin: "300% 0px",
      threshold: 0,
    });
    for (const el of holderRefs.current.values()) io.observe(el);
    onNearChange();
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, active, numPages, onNearChange]);

  // ── resize → re-fit placeholders now, re-render debounced ────────────────
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    let lastW = scroller.clientWidth;
    let t: number | null = null;
    const ro = new ResizeObserver(() => {
      const w = scroller.clientWidth;
      if (Math.abs(w - lastW) < 8) return; // scrollbar jitter
      lastW = w;
      applyPlaceholderStyles();
      if (t !== null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        t = null;
        refreeze();
      }, 150);
    });
    ro.observe(scroller);
    return () => {
      ro.disconnect();
      if (t !== null) window.clearTimeout(t);
    };
  }, [phase, active, applyPlaceholderStyles, refreeze]);

  // ── toolbar actions ──────────────────────────────────────────────────────
  const scrollToPage = useCallback((n: number) => {
    const el = holderRefs.current.get(n);
    const scroller = scrollRef.current;
    if (el && scroller) {
      // rect-based, coordinate-space-safe (see computeCenter)
      const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollTo({ top: scroller.scrollTop + delta - 8, behavior: "smooth" });
    }
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const next = Math.min(3, Math.max(1, zoomRef.current * factor));
      if (next === zoomRef.current) return;
      zoomRef.current = next;
      setZoomPct(Math.round(next * 100));
      refreeze();
    },
    [refreeze],
  );

  const resetFit = useCallback(() => {
    if (zoomRef.current === 1) return;
    zoomRef.current = 1;
    setZoomPct(100);
    refreeze();
  }, [refreeze]);

  /** Stable holder ref — sizes the placeholder on mount without React state.
   * (React 19 ref-cleanup form: the returned fn runs on unmount.) */
  const holderRefCb = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const n = Number(el.dataset.page);
    holderRefs.current.set(n, el);
    if (!canvasesRef.current.has(n) && !el.style.width) {
      const avail = Math.max(240, (el.parentElement?.clientWidth ?? 800) - 24);
      const w = Math.round(avail * zoomRef.current);
      el.style.width = `${w}px`;
      el.style.height = `${Math.round(w * aspectRef.current)}px`;
    }
    return () => {
      holderRefs.current.delete(n);
    };
  }, []);

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/30", className)}>
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-background/95 px-2 py-1.5 print:hidden">
        <span className="mr-1 min-w-0 truncate text-xs font-semibold" title={label}>
          {label}
        </span>
        {phase === "ready" && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </Button>
            <span className="min-w-14 text-center font-mono text-[11px] tabular-nums">
              {currentPage} / {numPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              aria-label="Next page"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => zoomBy(1 / 1.25)}
              aria-label="Zoom out"
              disabled={zoomPct <= 100}
              title={`Zoom: ${zoomPct}% of fit width`}
            >
              <Minus className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => zoomBy(1.25)}
              aria-label="Zoom in"
              title={`Zoom: ${zoomPct}% of fit width`}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={resetFit}
              aria-label="Reset to fit width"
              disabled={zoomPct <= 100}
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </Button>
          </div>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
            aria-label={`Open or download ${label}`}
          >
            <Download className="size-3.5" aria-hidden />
            PDF
          </a>
        )}
      </div>

      {/* content */}
      {phase === "loading" && (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          Loading {label}…
        </div>
      )}
      {phase === "error" && (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="size-6 text-amber-500" aria-hidden />
          <p className="max-w-xs text-sm text-muted-foreground">
            Couldn&apos;t load <span className="font-medium">{label}</span>
            {errorMsg ? ` — ${errorMsg}` : ""}. The archive may be briefly unavailable.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPhase("loading");
                setErrorMsg(null);
                setReloadKey((k) => k + 1);
              }}
            >
              Retry
            </Button>
            {downloadUrl && (
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">
                  Open raw PDF
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
      {phase === "ready" && (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {Array.from({ length: numPages }, (_, i) => {
            const n = i + 1;
            return (
              <div
                key={n}
                data-page={n}
                ref={holderRefCb}
                className="mx-auto mb-3 rounded bg-background shadow-sm"
              />
            );
          })}
          <p className="pb-2 pt-1 text-center text-[10px] text-muted-foreground">
            End of document · {numPages} page{numPages === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
