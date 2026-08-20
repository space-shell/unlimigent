// bundled build avoids elkjs' node-only "web-worker" import in browsers
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphStore } from "./store";

const elk = new ELK();

/** Grid cell in world units — nodes snap to multiples of this. */
export const GRID_WORLD = 2;

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": String(GRID_WORLD * 2),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(GRID_WORLD * 2),
  "elk.nodeSize.minimum": "(1.5, 4)",
};

/** Node footprints in world units after the plate's 90° Z-rotation (tall in
 * Y, narrow in X). Info nodes (server/project/workspace/worktree) are shorter
 * than content nodes (agents). Keep in sync with GroundNodes specs. */
export const ELK_NODE_W = 1.5;
export const ELK_INFO_H = 1.5;
export const ELK_CONTENT_H = 4;

const INFO_KINDS = new Set(["server", "project", "workspace", "worktree"]);

export interface ArrangeResult {
  moved: number;
}

const snap = (v: number) => Math.round(v / GRID_WORLD) * GRID_WORLD;

/** Auto-arrange the whole graph with elk layered layout, snapped to the
 * grid so nodes sit on the plus-mark intersections. There is no manual
 * placement — the graph is always daemon-arranged. */
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
      height: INFO_KINDS.has(n.kind) ? ELK_INFO_H : ELK_CONTENT_H,
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
    if (!node) continue;
    const x = snap(child.x ?? 0);
    const y = snap(child.y ?? 0);
    if (node.position.x !== x || node.position.y !== y) {
      store.getState().moveNode(child.id, { x, y });
      moved += 1;
    }
  }
  return { moved };
}
