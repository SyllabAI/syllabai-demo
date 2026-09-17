"use client";

/**
 * ConceptWeb — the graph-derived layer explorer (T-C11 concepts,
 * misconceptions, semantic edges from graph-as-code).
 *
 * HONESTY RULES (ported from the production ConceptGraphView):
 *  - the GRAPH-DERIVED layer is visually distinct from the official
 *    curriculum anchor; every node/edge shows its real provenance tier;
 *  - a spec point with no settled concept graph shows an explicit empty
 *    state, never fabricated content;
 *  - this visualization is a UI/interaction layer — it does not establish
 *    educational truth.
 *
 * Layout: deterministic radial grouping — focus node at the centre, its
 * graph neighbours on a ring (misconceptions pushed outward). No physics,
 * so it is fast and stable on mobile.
 */
import { useMemo } from "react";
import type { ConceptGraph } from "@/lib/contracts";
import { NODE_W, NODE_H, arrowHead } from "./layout";

export interface ConceptWebProps {
  graph: ConceptGraph;
  /** focus node code (a spec point like 4CH1-1.1, or a concept code) */
  focus: string;
  /** optional display title when the focus is an edge-anchored code (spec point) */
  focusTitle?: string | null;
  onSelect: (code: string) => void;
  width: number;
  height: number;
}

interface Placed {
  code: string;
  title: string;
  family: string;
  tier: string;
  x: number;
  y: number;
}

interface WebEdge {
  path: string;
  arrow: string;
  key: string;
  tier: string;
  relation: string;
}

interface WebModel {
  placed: Map<string, Placed>;
  edges: WebEdge[];
  ok: boolean;
}

export function ConceptWeb({ graph, focus, focusTitle, onSelect, width, height }: ConceptWebProps) {
  const model = useMemo<WebModel>(() => {
    const empty: WebModel = { placed: new Map(), edges: [], ok: false };
    const byCode = new Map(graph.nodes.map((n) => [n.code, n]));
    const cx = width / 2;
    const cy = height / 2;
    const placed = new Map<string, Placed>();

    // the focus may be a real T-C11 node, or a spec-point code that only
    // appears as an edge anchor — synthesize the centre node in that case
    const focusNode = byCode.get(focus) ?? {
      code: focus,
      family: "SPEC_POINT",
      title: focusTitle?.slice(0, 60) || focus,
      provenanceTier: "RULE_DERIVED",
    };
    if (!focus) return empty;

    placed.set(focusNode.code, {
      code: focusNode.code, title: focusNode.title, family: focusNode.family,
      tier: focusNode.provenanceTier, x: cx - NODE_W / 2, y: cy - NODE_H / 2,
    });

    // direct edges from/to focus
    const touching = graph.edges.filter((e) => e.source === focus || e.target === focus);
    for (const e of touching) {
      const other = e.source === focus ? e.target : e.source;
      const n = byCode.get(other);
      if (!n || placed.has(other)) continue;
      placed.set(other, {
        code: n.code, title: n.title, family: n.family, tier: n.provenanceTier, x: 0, y: 0,
      });
    }

    // ring placement (misconceptions pushed outward)
    const ringNodes = [...placed.values()].filter((p) => p.code !== focus);
    ringNodes.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ringNodes.length, 1) - Math.PI / 2;
      const r = p.family === "MISCONCEPTION" ? 205 : 150;
      p.x = cx + Math.cos(angle) * r - NODE_W / 2;
      p.y = cy + Math.sin(angle) * r - NODE_H / 2;
    });

    const edges: WebEdge[] = [];
    for (const e of touching) {
      const a = placed.get(e.source);
      const b = placed.get(e.target);
      if (!a || !b) continue;
      const x1 = a.x + NODE_W / 2;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x + NODE_W / 2;
      const y2 = b.y + NODE_H / 2;
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.14;
      const my = (y1 + y2) / 2 - (x2 - x1) * 0.14;
      const path = `M ${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}`;
      const angle = Math.atan2(y2 - my, x2 - mx);
      edges.push({
        path,
        arrow: ["REQUIRES_PREREQUISITE", "MISCONCEPTION_OF", "REMEDIATED_BY"].includes(e.relation)
          ? arrowHead(x2, y2, angle)
          : "",
        key: `${e.source}->${e.relation}->${e.target}`,
        tier: e.provenanceTier,
        relation: e.relation,
      });
    }
    return { placed, edges, ok: true };
  }, [graph, focus, focusTitle, width, height]);

  if (!model.ok && !focus) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No settled graph slice for <span className="mx-1 font-mono">{focus}</span> yet — pick
        another spec point. (Empty state, not fabricated content.)
      </div>
    );
  }

  return (
    <svg
      role="img"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      aria-label={`Concept web centred on ${focus}: neighbouring concepts and misconceptions with provenance`}
    >
      {model.edges.map((e) => (
        <g key={e.key}>
          <path
            d={e.path}
            fill="none"
            className="stroke-foreground"
            strokeOpacity={0.3}
            strokeWidth={1.25}
            strokeDasharray={e.relation === "PART_OF" ? "" : "5 4"}
          />
          {e.arrow && <path d={e.arrow} className="fill-foreground" fillOpacity={0.55} />}
        </g>
      ))}
      {[...model.placed.values()].map((p) => {
        const selected = p.code === focus;
        const isMis = p.family === "MISCONCEPTION";
        return (
          <g
            key={p.code}
            transform={`translate(${p.x}, ${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${isMis ? "misconception" : "concept"} ${p.title} (${p.code}), ${p.tier}`}
            className="cursor-pointer outline-none"
            onClick={() => onSelect(p.code)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelect(p.code);
              }
            }}
          >
            <rect
              width={NODE_W}
              height={NODE_H}
              rx={isMis ? 20 : 8}
              className={
                selected
                  ? "fill-primary/15 stroke-primary"
                  : isMis
                    ? "fill-rose-500/10 stroke-rose-400"
                    : "fill-muted/60 stroke-foreground/40"
              }
              strokeWidth={selected ? 2 : 1}
            />
            <text x={12} y={18} fontSize={11} fontWeight={selected ? 700 : 500} className="fill-foreground">
              {truncate(p.title, 30)}
            </text>
            <text x={12} y={32} fontSize={9} className="fill-muted-foreground">
              {p.family === "MISCONCEPTION" ? "MISCONCEPTION · " : ""}
              {p.tier}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
