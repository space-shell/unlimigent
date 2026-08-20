import ELK from "elkjs";
import type { GraphStore } from "./store";

const elk = new ELK();

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.nodeSize.minimum": "(220, 80)",
};

export interface ArrangeResult {
  moved: number;
}

/** Auto-arrange the whole graph with elk layered layout. A tool the user
 * invokes — never an automatic policy. Positions are written back to the
 * store; manual positions are overwritten. */
export async function autoArrange(store: GraphStore): Promise<ArrangeResult> {
  const state = store.getState();
  const nodes = Object.values(state.nodes);
  if (nodes.length === 0) return { moved: 0 };

  const layout = await elk.layout({
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: 220,
      height: 80,
    })),
    edges: Object.values(state.edges).map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  });

  let moved = 0;
  for (const child of layout.children ?? []) {
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    const node = store.getState().nodes[child.id];
    if (node && (node.position.x !== x || node.position.y !== y)) {
      store.getState().moveNode(child.id, { x, y });
      moved += 1;
    }
  }
  return { moved };
}
