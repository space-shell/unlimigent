import type { CameraState } from "../graph/store";
import { ZOOM_MAX, ZOOM_MIN } from "../graph/store";

export type { CameraState };
export { ZOOM_MIN, ZOOM_MAX };

export interface Viewport {
  width: number;
  height: number;
}

/** Screen x grows right, screen y grows down; world x right, world y up.
 * The view is rotated by cam.theta (iso = π/4) before the y-flip. */

export function worldToScreen(
  wx: number,
  wy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  const th = cam.theta ?? 0;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const rx = wx - cam.x;
  const ry = wy - cam.y;
  return {
    x: vp.width / 2 + (rx * c - ry * s) * cam.zoom,
    y: vp.height / 2 - (rx * s + ry * c) * cam.zoom,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  const th = cam.theta ?? 0;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = (sx - vp.width / 2) / cam.zoom;
  const dy = (vp.height / 2 - sy) / cam.zoom;
  return {
    x: cam.x + dx * c + dy * s,
    y: cam.y - dx * s + dy * c,
  };
}

/** Convert a screen-space pixel delta to a world-space delta. */
export function screenDeltaToWorld(
  dxPx: number,
  dyPx: number,
  cam: CameraState,
): { x: number; y: number } {
  const th = cam.theta ?? 0;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = dxPx / cam.zoom;
  const dy = -dyPx / cam.zoom;
  return {
    x: dx * c + dy * s,
    y: -dx * s + dy * c,
  };
}

/** Pan by a screen-space pixel delta. */
export function panBy(
  cam: CameraState,
  dxPx: number,
  dyPx: number,
): CameraState {
  const d = screenDeltaToWorld(dxPx, dyPx, cam);
  return { ...cam, x: cam.x - d.x, y: cam.y - d.y };
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
  const th = cam.theta ?? 0;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = (originPx.x - vp.width / 2) / zoom;
  const dy = (vp.height / 2 - originPx.y) / zoom;
  return {
    zoom,
    theta: cam.theta,
    x: w.x - (dx * c + dy * s),
    y: w.y - (-dx * s + dy * c),
  };
}

export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Axis-aligned viewport bounds in *rotated screen space* — compare against
 * worldToScreen output, not raw world coords. */
export function viewRect(cam: CameraState, vp: Viewport): ViewRect {
  const hw = vp.width / 2;
  const hh = vp.height / 2;
  return { left: -hw, right: hw, top: -hh, bottom: hh };
}

/** Node card footprint in world units (keep in sync with ELK_NODE_W/H). */
export const NODE_HALF_W = 2;
export const NODE_HALF_H = 0.75;
