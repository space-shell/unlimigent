// bundled build avoids elkjs' node-only "web-worker" import in browsers
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphStore } from "./store";

const elk = new ELK();

/** Grid cell in world units — nodes snap to multiples of this. */
export const GRID_WORLD = 2;

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": String(GRID_WORLD * 1.5),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(GRID_WORLD * 2),
  "elk.nodeSize.minimum": "(4, 1.5)",
};

/** Node footprint in world units — keep in sync with NODE_HALF_W/H in
 * canvas/cameraMath.ts. */
export const ELK_NODE_W = 4;
export const ELK_NODE_H = 1.5;

export interface ArrangeResult {
  moved: number;
}

const snap = (v: number) => Math.round(v / GRID_WORLD) * GRID_WORLD;

/** Snap a single coordinate to the grid (used by manual node drags too). */
export const snapToGrid = snap;

/** Auto-arrange the whole graph with elk layered layout, snapped to the
 * grid so nodes sit on the plus-mark intersections. Runs automatically when
 * a gateway snapshot adds nodes; manually placed (pinned) nodes keep their
 * position. */
export async function autoArrange(store: GraphStore): Promise<ArrangeResult> {
  const state = store.getState();
  const nodes = Object.values(state.nodes);
  if (nodes.length === 0) return { moved: 0 };

  const layout = await elk.layout({
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: ELK_NODE_W,
      height: ELK_NODE_H,
    })),
    edges: Object.values(state.edges).map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  });

  let moved = 0;
  for (const child of layout.children ?? []) {
    const node = store.getState().nodes[child.id];
    if (!node || node.pinned) continue;
    const x = snap(child.x ?? 0);
    const y = snap(child.y ?? 0);
    if (node.position.x !== x || node.position.y !== y) {
      store.getState().moveNode(child.id, { x, y });
      moved += 1;
    }
  }
  return { moved };
}
