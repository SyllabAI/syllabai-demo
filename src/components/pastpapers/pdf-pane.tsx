"use client";

/**
 * PdfPane — mobile-first PDF viewer over pdf.js (pdfjs-dist v4).
 *
 * Why a custom viewer (decided with the user): native <iframe> PDF embeds are
 * unreliable on Android Chrome and iOS Safari; canvas rendering works
 * everywhere a demo student is likely to be.
 *
 * Mobile-first specifics:
 *   - fit-width by default (recomputed on container resize), zoom in/out on
 *     top of fit;
 *   - continuous vertical scroll, pages rendered VIRTUALLY: a page's canvas
 *     exists only while it is near the viewport (render window = current
 *     page ± BUFFER_PAGES) and is destroyed + freed when it scrolls away —
 *     a 20-page paper on a phone never holds 20 bitmaps;
 *   - placeholder boxes use the page-1 aspect ratio so scroll position and
 *     scrollbar behave correctly before/after render; rendered sizes are
 *     React state, so zoom/resize re-layouts never fight imperative DOM;
 *   - hidden panes (split-view toggle) stay MOUNTED: display:none preserves
 *     scroll position and rendered pages, and a hidden pane renders nothing
 *     until it becomes visible again.
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
  /** when false (hidden split pane) nothing loads and rendering pauses */
  active: boolean;
  className?: string;
}

/** Pages holding a canvas: current page ± BUFFER_PAGES. The rest are freed. */
const BUFFER_PAGES = 3;

export function PdfPane({ url, downloadUrl, label, active, className }: PdfPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const holderRefs = useRef(new Map<number, HTMLDivElement>());
  const docRef = useRef<PdfDoc | null>(null);
  const tasksRef = useRef(new Map<number, RenderTask>());
  const renderedRef = useRef(new Set<number>());
  const [reloadKey, setReloadKey] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  /** zoom multiplier on fit-width — state for render, ref for render callbacks */
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  /** scroll container width (state — refs may not be read during render) */
  const [containerW, setContainerW] = useState(0);
  /** css sizes of currently-rendered pages (drives placeholder layout) */
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  /** aspect ratio (h/w) from page 1, used for unrendered placeholders */
  const [aspect, setAspect] = useState(297 / 210); // A4 portrait fallback

  const scaleFor = useCallback((page: PdfPage): { scale: number; cssW: number } => {
    const base = page.getViewport({ scale: 1 });
    const containerW = scrollRef.current?.clientWidth ?? 800;
    const avail = Math.max(240, containerW - 24);
    const fit = avail / base.width;
    const scale = Math.min(4, fit * zoomRef.current);
    return { scale, cssW: Math.round(base.width * scale) };
  }, []);

  const clearPage = useCallback((n: number) => {
    tasksRef.current.get(n)?.cancel();
    tasksRef.current.delete(n);
    renderedRef.current.delete(n);
    holderRefs.current.get(n)?.replaceChildren();
    setSizes((prev) => {
      if (!(n in prev)) return prev;
      const next = { ...prev };
      delete next[n];
      return next;
    });
  }, []);

  const renderPage = useCallback(
    async (n: number) => {
      const doc = docRef.current;
      const holder = holderRefs.current.get(n);
      if (!doc || !holder || !holder.isConnected || renderedRef.current.has(n) || tasksRef.current.has(n))
        return;
      let page: PdfPage;
      try {
        page = await doc.getPage(n);
      } catch {
        return; // doc destroyed while unmounting
      }
      if (tasksRef.current.has(n) || !holder.isConnected) return;
      const { scale, cssW } = scaleFor(page);
      const cssH = Math.round(page.getViewport({ scale }).height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.className = "block";
      holder.replaceChildren(canvas);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport }) as RenderTask;
      tasksRef.current.set(n, task);
      try {
        await task.promise;
        renderedRef.current.add(n);
        setSizes((prev) => (prev[n]?.h === cssH && prev[n]?.w === cssW ? prev : { ...prev, [n]: { w: cssW, h: cssH } }));
      } catch {
        // cancelled or transient — leave the placeholder clean
      } finally {
        tasksRef.current.delete(n);
      }
    },
    [scaleFor],
  );

  /** Render window: [center-BUFFER, center+BUFFER]; free the rest. */
  const syncWindow = useCallback(
    (center: number) => {
      const doc = docRef.current;
      if (!doc) return;
      for (let n = 1; n <= doc.numPages; n++) {
        if (Math.abs(n - center) <= BUFFER_PAGES) {
          if (!renderedRef.current.has(n)) void renderPage(n);
        } else if (renderedRef.current.has(n)) {
          clearPage(n);
        }
      }
      try {
        doc.cleanup();
      } catch {
        /* noop */
      }
    },
    [renderPage, clearPage],
  );

  /** Zoom changed → free everything; the window re-renders at the new scale. */
  const refreeze = useCallback(
    (center: number) => {
      for (const n of [...renderedRef.current]) clearPage(n);
      syncWindow(center);
    },
    [clearPage, syncWindow],
  );

  // ── load document ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
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
        setAspect(vp.height / vp.width);
        setNumPages(doc.numPages);
        setPhase("ready");
        setCurrentPage(1);
        syncWindow(1);
      } catch (err) {
        if (cancelled) return;
        setErrorMsg((err as Error)?.message ?? "Could not load the PDF");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      for (const t of tasksRef.current.values()) t.cancel();
      tasksRef.current.clear();
      renderedRef.current.clear();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url, active, reloadKey]);

  /** When the doc becomes ready the placeholder divs must exist in the DOM
   * before any canvas can mount into them — the load effect's syncWindow call
   * races the React render, so re-kick the window here (also covers a pane
   * re-activating in split view). */
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    syncWindow(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, active]);

  // ── scroll tracking → current page + render window ───────────────────────
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = scroller.scrollTop + scroller.clientHeight / 2;
        let best = 1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const [n, el] of holderRefs.current) {
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          const dist = mid < top ? top - mid : mid > bottom ? mid - bottom : 0;
          if (dist < bestDist) {
            bestDist = dist;
            best = n;
          }
        }
        setCurrentPage(best);
        syncWindow(best);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [phase, active, numPages, syncWindow]);

  // ── resize → re-fit + re-render ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready" || !active) return;
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    let lastW = scroller.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = scroller.clientWidth;
      setContainerW(w); // state for render-time placeholder sizing
      if (Math.abs(w - lastW) < 8) return; // scrollbar jitter
      lastW = w;
      refreeze(currentPage);
    });
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [phase, active, currentPage, refreeze]);

  const scrollToPage = useCallback((n: number) => {
    const el = holderRefs.current.get(n);
    const scroller = scrollRef.current;
    if (el && scroller) scroller.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      zoomRef.current = Math.min(3, Math.max(1, zoomRef.current * factor));
      setZoom(zoomRef.current);
      refreeze(currentPage);
    },
    [currentPage, refreeze],
  );

  const resetFit = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    refreeze(currentPage);
  }, [currentPage, refreeze]);

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
              disabled={zoom <= 1}
            >
              <Minus className="size-3.5" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
              <Plus className="size-3.5" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={resetFit} aria-label="Reset to fit width">
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
            const size = sizes[n];
            const availW = Math.max(280, containerW - 24);
            const placeholderH = Math.round(availW * aspect);
            return (
              <div
                key={n}
                data-page={n}
                ref={(el) => {
                  if (el) holderRefs.current.set(n, el);
                  else holderRefs.current.delete(n);
                }}
                className="mx-auto mb-3 rounded shadow-sm"
                style={size ? { width: size.w, height: size.h } : { width: availW, height: placeholderH }}
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
