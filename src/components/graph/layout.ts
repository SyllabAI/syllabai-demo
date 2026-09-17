/**
 * Ported layered graph layout — adapted from the production
 * syllabai-web KnowledgeGraphView (F-036/T-028) computeLayout.
 *
 * Columns = KG depth (subject → unit → topic → subtopic → spec point);
 * leaf nodes slot top-to-bottom, parents centre over children, then a
 * per-column de-collision sweep. Prerequisite edges route forward via side
 * ports or backward via sag curves so direction stays readable.
 *
 * The demo generalises the input from backend DTOs to the demo contracts.
 */

export const NODE_W = 216;
export const NODE_H = 44;
export const COL_W = 264;
export const ROW_H = 60;
export const PAD = 16;

export interface LayoutNode {
  id: string;
  code: string;
  title: string;
  family: string;
  childIds: string[];
  /** optional overlay value 0..1 (mastery) — colours the node */
  value?: number | null;
  band?: string | null;
}

export interface Positioned {
  node: LayoutNode;
  depth: number;
  x: number;
  y: number;
}

export function computeLayeredLayout(
  nodes: LayoutNode[],
  rootId: string,
): { positioned: Map<string, Positioned>; width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const yById = new Map<string, number>();
  const depthById = new Map<string, number>();
  const slotByDepth: number[] = [];
  const placed = new Set<string>(); // cycle/diamond guard

  const place = (id: string, depth: number): number => {
    if (placed.has(id)) return yById.get(id) ?? 0;
    placed.add(id);
    depthById.set(id, depth);
    const node = byId.get(id);
    const childIds = (node?.childIds ?? []).filter((cid) => byId.has(cid));
    if (childIds.length === 0) {
      const slot = slotByDepth[depth] ?? 0;
      slotByDepth[depth] = slot + 1;
      const y = slot * ROW_H;
      yById.set(id, y);
      return y;
    }
    const childYs = childIds.map((cid) => place(cid, depth + 1));
    const mean = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    yById.set(id, mean);
    return mean;
  };
  if (byId.has(rootId)) place(rootId, 0);

  const positioned = new Map<string, Positioned>();
  for (const n of nodes) {
    if (!depthById.has(n.id)) continue;
    const depth = depthById.get(n.id)!;
    positioned.set(n.id, {
      node: n,
      depth,
      x: depth * COL_W + PAD,
      y: yById.get(n.id) ?? 0,
    });
  }

  // de-collision sweep per column
  const byDepth = new Map<number, Positioned[]>();
  for (const p of positioned.values()) {
    const list = byDepth.get(p.depth) ?? [];
    list.push(p);
    byDepth.set(p.depth, list);
  }
  for (const list of byDepth.values()) {
    list.sort((a, b) => a.y - b.y);
    let prevY = -Infinity;
    for (const p of list) {
      if (p.y < prevY + NODE_H + 12) p.y = prevY + NODE_H + 12;
      prevY = p.y;
    }
  }

  let maxY = PAD;
  for (const p of positioned.values()) maxY = Math.max(maxY, p.y + NODE_H);
  const maxDepth = Math.max(0, ...[...positioned.values()].map((p) => p.depth));
  return {
    positioned,
    width: (maxDepth + 1) * COL_W + PAD * 2,
    height: maxY + PAD,
  };
}

/** Cubic bezier from a node's right edge to another node's left edge. */
export function hierarchyPath(parent: Positioned, child: Positioned): string {
  const x1 = parent.x + NODE_W;
  const y1 = parent.y + NODE_H / 2;
  const x2 = child.x;
  const y2 = child.y + NODE_H / 2;
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Prerequisite curve: forward uses side ports; backward routes below both nodes. */
export function prerequisiteGeometry(
  prerequisite: Positioned,
  dependent: Positioned,
): { path: string; arrow: string } {
  const forward = dependent.x > prerequisite.x + NODE_W;
  if (forward) {
    const x1 = prerequisite.x + NODE_W;
    const y1 = prerequisite.y + NODE_H / 2;
    const x2 = dependent.x - 8;
    const y2 = dependent.y + NODE_H / 2;
    const dx = Math.max(24, (x2 - x1) / 2);
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const angle = Math.atan2(0, dx);
    return { path, arrow: arrowHead(x2, y2, angle) };
  }
  const x1 = prerequisite.x + NODE_W / 2;
  const y1 = prerequisite.y + NODE_H;
  const x2 = dependent.x + NODE_W / 2;
  const y2 = dependent.y + NODE_H;
  const sag = Math.max(y1, y2) + 34;
  const path = `M ${x1} ${y1} C ${x1} ${sag}, ${x2} ${sag}, ${x2} ${y2 + 8}`;
  const angle = Math.atan2(y2 - sag, 0.0001);
  return { path, arrow: arrowHead(x2, y2 + 8, angle) };
}

export function arrowHead(x: number, y: number, angle: number): string {
  const size = 7;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tipX = x + dx * 2;
  const tipY = y + dy * 2;
  const baseX = x - dx * size;
  const baseY = y - dy * size;
  const nx = -dy * size * 0.55;
  const ny = dx * size * 0.55;
  return `M ${tipX} ${tipY} L ${baseX + nx} ${baseY + ny} L ${baseX - nx} ${baseY - ny} Z`;
}
