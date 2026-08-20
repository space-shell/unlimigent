import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import { worldToScreen, type Viewport } from "./cameraMath";

/** SVG hairline edges in screen space. Lives outside WebGL by design (2D MVP);
 * an in-scene line implementation swaps in with the XR TextSurface work. */
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

  const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (const edge of Object.values(edges)) {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) continue;
    const a = worldToScreen(from.position.x, from.position.y, camera, viewport);
    const b = worldToScreen(to.position.x, to.position.y, camera, viewport);
    lines.push({ id: edge.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  return (
    <svg
      className="edge-overlay"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden="true"
    >
      {lines.map((l) => (
        <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
    </svg>
  );
}
