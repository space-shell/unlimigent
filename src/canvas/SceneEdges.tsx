import { useStore } from "zustand";
import { Line } from "@react-three/drei";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import { GRID_WORLD } from "../graph/arrange";
import { tokens } from "../tokens";

const snap = (v: number) => Math.round(v / GRID_WORLD) * GRID_WORLD;

const EDGE_Z = -0.03;

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

  const lines: Array<{ id: string; points: Array<[number, number, number]>; active: boolean }> = [];
  for (const edge of Object.values(edges)) {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) continue;
    if (isHidden(from.id) || isHidden(to.id)) continue;
    const midX = snap((from.position.x + to.position.x) / 2);
    lines.push({
      id: edge.id,
      active: focusedNodeId !== null && edge.to === focusedNodeId,
      points: [
        [from.position.x, from.position.y, EDGE_Z],
        [midX, from.position.y, EDGE_Z],
        [midX, to.position.y, EDGE_Z],
        [to.position.x, to.position.y, EDGE_Z],
      ],
    });
  }

  return (
    <>
      {lines.map((l) => (
        <Line
          key={l.id}
          points={l.points}
          color={l.active ? tokens.moss : tokens.inkFaint}
          lineWidth={1}
          opacity={l.active ? 0.9 : 0.55}
          transparent
        />
      ))}
    </>
  );
}

export type { GraphNode };
