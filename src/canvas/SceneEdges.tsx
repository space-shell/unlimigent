import { useStore } from "zustand";
import { Line } from "@react-three/drei";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import { GRID_WORLD } from "../graph/arrange";
import { tokens } from "../tokens";

const snap = (v: number) => Math.round(v / GRID_WORLD) * GRID_WORLD;

const EDGE_Z = -0.03;
/** Bend fillet radius in world units. */
const FILLET_R = 0.35;

type P2 = [number, number];

/** Replace a sharp corner with a small quadratic-arc fillet. */
function fillet(prev: P2, corner: P2, next: P2, r: number): P2[] {
  const d1x = corner[0] - prev[0];
  const d1y = corner[1] - prev[1];
  const d2x = next[0] - corner[0];
  const d2y = next[1] - corner[1];
  const l1 = Math.hypot(d1x, d1y);
  const l2 = Math.hypot(d2x, d2y);
  if (l1 === 0 || l2 === 0) return [corner];
  const rr = Math.min(r, l1 / 2, l2 / 2);
  const a: P2 = [corner[0] - (d1x / l1) * rr, corner[1] - (d1y / l1) * rr];
  const b: P2 = [corner[0] + (d2x / l2) * rr, corner[1] + (d2y / l2) * rr];
  const pts: P2[] = [a];
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const mt = 1 - t;
    pts.push([
      mt * mt * a[0] + 2 * mt * t * corner[0] + t * t * b[0],
      mt * mt * a[1] + 2 * mt * t * corner[1] + t * t * b[1],
    ]);
  }
  pts.push(b);
  return pts;
}

/** Manhattan path from → to with one grid-snapped bend, corners filleted. */
function manhattanPath(from: { x: number; y: number }, to: { x: number; y: number }): Array<[number, number, number]> {
  const midX = snap((from.x + to.x) / 2);
  const c1: P2 = [midX, from.y];
  const c2: P2 = [midX, to.y];
  const pts: P2[] = [[from.x, from.y]];
  pts.push(...fillet(pts[pts.length - 1]!, c1, c2, FILLET_R));
  pts.push(...fillet(pts[pts.length - 1]!, c2, [to.x, to.y], FILLET_R));
  pts.push([to.x, to.y]);
  return pts.map(([x, y]) => [x, y, EDGE_Z] as [number, number, number]);
}

/** Manhattan edges in-scene, under the plates: node-center to node-center
 * with a single 90° bend sitting on a grid intersection. Hidden while either
 * endpoint is inside a collapsed subtree. Edges leading INTO the focused
 * ("active") node render green (moss); thickness matches the plate border. */
export function SceneEdges({ runtime }: { runtime: Runtime }) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const edges = useStore(runtime.store, (s) => s.edges);
  const collapsedIds = useStore(runtime.store, (s) => s.collapsedIds);
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);

  const state = runtime.store.getState();
  const isHidden = (id: string) => {
    for (const c of collapsedIds) {
      if (c !== id && state.isDescendantOf(id, c)) return true;
    }
    return false;
  };

  // the full ancestor chain of the focused node — every edge along the path
  // to the root renders green (moss)
  const activePath = new Set<string>();
  let cursor = focusedNodeId ? nodes[focusedNodeId] : undefined;
  while (cursor?.parentId) {
    activePath.add(`${cursor.parentId}->${cursor.id}`);
    cursor = nodes[cursor.parentId];
  }

  const lines: Array<{ id: string; points: Array<[number, number, number]>; active: boolean }> = [];
  for (const edge of Object.values(edges)) {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) continue;
    if (isHidden(from.id) || isHidden(to.id)) continue;
    lines.push({
      id: edge.id,
      active: activePath.has(`${edge.from}->${edge.to}`),
      points: manhattanPath(from.position, to.position),
    });
  }

  return (
    <>
      {lines.map((l) => (
        <Line
          key={l.id}
          points={l.points}
          color={l.active ? tokens.moss : tokens.inkFaint}
          lineWidth={l.active ? 3 : 2}
          opacity={l.active ? 0.9 : 0.55}
          transparent
        />
      ))}
    </>
  );
}

export type { GraphNode };
