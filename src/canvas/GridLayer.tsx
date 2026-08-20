import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import { worldToScreen, type Viewport } from "./cameraMath";

const GRID_WORLD = 2; // world units between grid points
const MIN_SPACING_PX = 22; // hide grid below this density
const PLUS_ARM_PX = 3.5;

/** World-anchored grid of "+" marks, aligned to the (rotated) world axes.
 * One concatenated path for cheap redraws; LOD hides it when dense. */
export function GridLayer({
  runtime,
  viewport,
}: {
  runtime: Runtime;
  viewport: Viewport;
}) {
  const camera = useStore(runtime.store, (s) => s.camera);

  const sp = GRID_WORLD * camera.zoom;
  if (sp < MIN_SPACING_PX) return null;

  const th = camera.theta ?? 0;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const origin = worldToScreen(0, 0, camera, viewport);

  // world axis unit steps in screen space (includes the y-flip)
  const e1 = { x: c * sp, y: -s * sp }; // world +x
  const e2 = { x: -s * sp, y: -c * sp }; // world +y

  const n = Math.ceil(Math.hypot(viewport.width, viewport.height) / (2 * sp)) + 1;
  const arm = PLUS_ARM_PX;

  let d = "";
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = origin.x + i * e1.x + j * e2.x;
      const y = origin.y + i * e1.y + j * e2.y;
      // plus arms aligned to the rotated world axes
      const a1x = (c * arm), a1y = (-s * arm);
      const a2x = (-s * arm), a2y = (-c * arm);
      d += `M${(x - a1x).toFixed(1)} ${(y - a1y).toFixed(1)}L${(x + a1x).toFixed(1)} ${(y + a1y).toFixed(1)}`;
      d += `M${(x - a2x).toFixed(1)} ${(y - a2y).toFixed(1)}L${(x + a2x).toFixed(1)} ${(y + a2y).toFixed(1)}`;
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
