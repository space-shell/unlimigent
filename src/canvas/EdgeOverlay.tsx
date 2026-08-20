import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import { worldToScreen, type Viewport } from "./cameraMath";

/** Manhattan edges: node-center to node-center with a single 90° bend in
 * world space (renders as a clean elbow along the iso axes). SVG in screen
 * space for the 2D MVP; swaps to in-scene lines with the XR surface work. */
export function EdgeOverlay({
  runtime,
  viewport,
}: {
  runtime: Runtime;
  viewport: Viewport;
}) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const edges = useStore(runtime.store, (s) => s.edges);
  const camera = useStore(runtime.store, (s) => s.camera);

  const paths: Array<{ id: string; d: string }> = [];
  for (const edge of Object.values(edges)) {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) continue;
    const midX = (from.position.x + to.position.x) / 2;
    const p1 = worldToScreen(from.position.x, from.position.y, camera, viewport);
    const p2 = worldToScreen(midX, from.position.y, camera, viewport);
    const p3 = worldToScreen(midX, to.position.y, camera, viewport);
    const p4 = worldToScreen(to.position.x, to.position.y, camera, viewport);
    const d = `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}L${p3.x.toFixed(1)} ${p3.y.toFixed(1)}L${p4.x.toFixed(1)} ${p4.y.toFixed(1)}`;
    paths.push({ id: edge.id, d });
  }

  return (
    <svg
      className="edge-overlay"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden="true"
    >
      {paths.map((p) => (
        <path key={p.id} d={p.d} fill="none" />
      ))}
    </svg>
  );
}
