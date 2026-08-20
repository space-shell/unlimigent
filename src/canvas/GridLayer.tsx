import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import { GRID_WORLD } from "../graph/arrange";
import { screenToWorld, worldToScreen, type Viewport } from "./cameraMath";

const MIN_SPACING_PX = 24;
const ARM_WORLD = GRID_WORLD * 0.14;

/** World-anchored grid of "+" marks lying on the ground plane — with the 3D
 * iso projection the arms align to the projected ground axes. LOD hides it
 * when dense. One concatenated path per redraw. */
export function GridLayer({
  runtime,
  viewport,
}: {
  runtime: Runtime;
  viewport: Viewport;
}) {
  const camera = useStore(runtime.store, (s) => s.camera);

  const step = GRID_WORLD * camera.zoom;
  if (step < MIN_SPACING_PX) return null;

  const corners = [
    screenToWorld(0, 0, camera, viewport),
    screenToWorld(viewport.width, 0, camera, viewport),
    screenToWorld(0, viewport.height, camera, viewport),
    screenToWorld(viewport.width, viewport.height, camera, viewport),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));

  const i0 = Math.ceil(minX / GRID_WORLD);
  const i1 = Math.floor(maxX / GRID_WORLD);
  const j0 = Math.ceil(minY / GRID_WORLD);
  const j1 = Math.floor(maxY / GRID_WORLD);

  let d = "";
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const x = i * GRID_WORLD;
      const y = j * GRID_WORLD;
      const h1 = worldToScreen(x - ARM_WORLD, y, camera, viewport);
      const h2 = worldToScreen(x + ARM_WORLD, y, camera, viewport);
      const v1 = worldToScreen(x, y - ARM_WORLD, camera, viewport);
      const v2 = worldToScreen(x, y + ARM_WORLD, camera, viewport);
      d += `M${h1.x.toFixed(1)} ${h1.y.toFixed(1)}L${h2.x.toFixed(1)} ${h2.y.toFixed(1)}`;
      d += `M${v1.x.toFixed(1)} ${v1.y.toFixed(1)}L${v2.x.toFixed(1)} ${v2.y.toFixed(1)}`;
    }
  }

  return (
    <svg
      className="grid-layer"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
