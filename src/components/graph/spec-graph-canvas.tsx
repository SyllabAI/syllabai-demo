"use client";

/**
 * SpecGraphCanvas — layered left-to-right SVG over the OFFICIAL CURRICULUM
 * ANCHOR (spec skeleton from graph-as-code), optionally overlaid with the
 * SIMULATED learner state.
 *
 * Ported from syllabai-web KnowledgeGraphView (F-036/T-028): columns are KG
 * depth, solid muted edges are PART_OF hierarchy, dashed primary edges are
 * REQUIRES_PREREQUISITE relations. Nodes colour by mastery band when the
 * overlay is on. Every node is a focusable button with an aria-label.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  computeLayeredLayout,
  hierarchyPath,
  prerequisiteGeometry,
  type LayoutNode,
} from "./layout";
import { cn } from "@/lib/utils";

export interface SpecGraphProps {
  nodes: LayoutNode[];
  rootId: string;
  prerequisiteEdges: { source: string; target: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** show SIMULATED mastery overlay colours */
  overlay: boolean;
  /** node the viewport should scroll to on mount / change (e.g. root or selection) */
  focusId?: string | null;
}

const bandText: Record<string, string> = {
  LOW: "text-rose-600 dark:text-rose-400",
  DEVELOPING: "text-amber-600 dark:text-amber-400",
  SECURE: "text-emerald-600 dark:text-emerald-400",
};

export function SpecGraphCanvas({
  nodes,
  rootId,
  prerequisiteEdges,
  selectedId,
  onSelect,
  overlay,
  focusId,
}: SpecGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { positioned, width, height } = useMemo(
    () => computeLayeredLayout(nodes, rootId),
    [nodes, rootId],
  );

  // keep the focused node in view (root on mount, selection on change)
  useEffect(() => {
    const target = focusId ?? rootId;
    const p = positioned.get(target);
    const el = scrollRef.current;
    if (!p || !el) return;
    el.scrollTo({ top: Math.max(p.y - el.clientHeight / 2 + 44, 0), left: 0, behavior: "smooth" });
  }, [focusId, rootId, positioned]);

  const hierarchy = useMemo(() => {
    const list: { path: string; key: string }[] = [];
    for (const p of positioned.values()) {
      for (const cid of p.node.childIds) {
        const child = positioned.get(cid);
        if (child) list.push({ path: hierarchyPath(p, child), key: `${p.node.id}->${cid}` });
      }
    }
    return list;
  }, [positioned]);

  const prereqs = useMemo(
    () =>
      prerequisiteEdges
        .map((e) => {
          const from = positioned.get(e.source);
          const to = positioned.get(e.target);
          if (!from || !to) return null;
          return { ...prerequisiteGeometry(from, to), key: `${e.source}->${e.target}` };
        })
        .filter((e): e is { path: string; arrow: string; key: string } => e !== null),
    [prerequisiteEdges, positioned],
  );

  return (
    <div
      ref={scrollRef}
      className="max-h-[72vh] overflow-auto rounded-md border bg-muted/20"
    >
      <svg
        role="img"
        width={Math.max(width, 320)}
        height={height}
        viewBox={`0 0 ${Math.max(width, 320)} ${height}`}
        className="block"
        aria-label="Specification graph: nodes coloured by mastery band, solid edges show structure, dashed edges show prerequisites"
      >
        {hierarchy.map((e) => (
          <path
            key={`h-${e.key}`}
            d={e.path}
            fill="none"
            className="stroke-muted-foreground"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        ))}
        {prereqs.map((e) => (
          <g key={`p-${e.key}`}>
            <path
              d={e.path}
              fill="none"
              className="stroke-primary"
              strokeOpacity={0.85}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <path d={e.arrow} className="fill-primary" fillOpacity={0.9} />
          </g>
        ))}
        {[...positioned.values()].map((p) => {
          const n = p.node;
          const selected = n.id === selectedId;
          const band = overlay ? (n.band ?? null) : null;
          const colour = band ? (bandText[band] ?? "") : "text-muted-foreground";
          return (
            <g
              key={n.id}
              transform={`translate(${p.x}, ${p.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${n.family.toLowerCase()} ${n.title} (${n.code})${band ? `, ${band.toLowerCase()}` : ""}`}
              className={cn("cursor-pointer outline-none", colour)}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(n.id);
                }
              }}
            >
              <rect
                width={216}
                height={44}
                rx={8}
                fill="currentColor"
                fillOpacity={selected ? 0.22 : 0.08}
                stroke="currentColor"
                strokeWidth={selected ? 2 : 1}
                strokeOpacity={selected ? 1 : 0.6}
              />
              <text x={12} y={18} fontSize={11} fontWeight={n.family === "TOPIC" ? 700 : 500} className="fill-foreground">
                {truncate(n.title, 26)}
              </text>
              <text x={12} y={33} fontSize={9} className="fill-muted-foreground">
                {n.code}
                {overlay && n.value !== null && n.value !== undefined
                  ? ` · ${Math.round(n.value * 100)}%`
                  : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
