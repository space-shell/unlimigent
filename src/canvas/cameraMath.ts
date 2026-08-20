import type { CameraState } from "../graph/store";
import { ZOOM_MAX, ZOOM_MIN } from "../graph/store";

export type { CameraState };
export { ZOOM_MIN, ZOOM_MAX };

export interface Viewport {
  width: number;
  height: number;
}

/** World unit -> screen px. Screen y grows down, world y grows up. */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    y: vp.height / 2 - (wy - cam.y) * cam.zoom,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: (vp.height / 2 - sy) / cam.zoom + cam.y,
  };
}

/** Pan by a screen-space pixel delta. */
export function panBy(
  cam: CameraState,
  dxPx: number,
  dyPx: number,
): CameraState {
  return {
    ...cam,
    x: cam.x - dxPx / cam.zoom,
    y: cam.y + dyPx / cam.zoom,
  };
}

/** Zoom by a multiplicative factor, keeping the world point under
 * `originPx` pinned to the same screen position. */
export function zoomAt(
  cam: CameraState,
  factor: number,
  originPx: { x: number; y: number } | null,
  vp: Viewport,
): CameraState {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * factor));
  if (zoom === cam.zoom) return cam;
  if (!originPx) return { ...cam, zoom };
  const w = screenToWorld(originPx.x, originPx.y, cam, vp);
  return {
    zoom,
    x: w.x - (originPx.x - vp.width / 2) / zoom,
    y: w.y - (vp.height / 2 - originPx.y) / zoom,
  };
}

export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function viewRect(cam: CameraState, vp: Viewport): ViewRect {
  const hw = vp.width / 2 / cam.zoom;
  const hh = vp.height / 2 / cam.zoom;
  return { left: cam.x - hw, right: cam.x + hw, top: cam.y + hh, bottom: cam.y - hh };
}

/** Is a world-space AABB visible (with margin in world units)? */
export function rectVisible(rect: ViewRect, center: { x: number; y: number }, halfW: number, halfH: number, margin: number): boolean {
  return (
    center.x + halfW + margin >= rect.left &&
    center.x - halfW - margin <= rect.right &&
    center.y + halfH + margin >= rect.bottom &&
    center.y - halfH - margin <= rect.top
  );
}

/** Node card footprint in world units (must match arrange.ts elk sizes). */
export const NODE_HALF_W = 2;
export const NODE_HALF_H = 0.75;
