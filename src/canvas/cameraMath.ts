import type { CameraState } from "../graph/store";
import { PHI_ISO, ZOOM_MAX, ZOOM_MIN } from "../graph/store";

export type { CameraState };
export { ZOOM_MIN, ZOOM_MAX };

export interface Viewport {
  width: number;
  height: number;
}

/** 3D isometric projection. The world is the z=0 ground plane; the camera
 * sits at azimuth theta / elevation phi looking at the camera target, up
 * vector +z. Screen x grows right, screen y grows down.
 *
 * Basis (unit vectors in world space):
 *   right r = (-sin θ, cos θ, 0)
 *   up    u = (-cos θ sin φ, -sin θ sin φ, cos φ)
 *
 * A ground-plane point p screens as:
 *   sx = w/2 + zoom · (p − target)·r
 *   sy = h/2 − zoom · (p − target)·u
 */

function basis(cam: CameraState) {
  const th = cam.theta ?? 0;
  const ph = cam.phi ?? PHI_ISO;
  return {
    sinth: Math.sin(th),
    costh: Math.cos(th),
    sinph: Math.sin(ph),
    cosph: Math.cos(ph),
  };
}

export function worldToScreen(
  wx: number,
  wy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  const b = basis(cam);
  const ex = wx - cam.x;
  const ey = wy - cam.y;
  return {
    x: vp.width / 2 + cam.zoom * (ex * -b.sinth + ey * b.costh),
    y: vp.height / 2 - cam.zoom * (ex * -b.costh * b.sinph + ey * -b.sinth * b.sinph),
  };
}

/** Ground-plane delta for a screen-space pixel delta at a given zoom. */
function deltaWorld(dsx: number, dsy: number, zoom: number, b: ReturnType<typeof basis>) {
  const a = dsx / zoom;
  const c = -dsy / zoom;
  const det = b.sinph;
  return {
    x: (a * -b.sinph * b.sinth - b.costh * c) / det,
    y: (-b.sinth * c - a * -b.sinph * b.costh) / det,
  };
}

export function screenDeltaToWorld(
  dxPx: number,
  dyPx: number,
  cam: CameraState,
): { x: number; y: number } {
  return deltaWorld(dxPx, dyPx, cam.zoom, basis(cam));
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: CameraState,
  vp: Viewport,
): { x: number; y: number } {
  const d = screenDeltaToWorld(sx - vp.width / 2, sy - vp.height / 2, cam);
  return { x: cam.x + d.x, y: cam.y + d.y };
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
  const b = basis(cam);
  const d = deltaWorld(originPx.x - vp.width / 2, originPx.y - vp.height / 2, zoom, b);
  return { zoom, theta: cam.theta, phi: cam.phi, x: w.x - d.x, y: w.y - d.y };
}

export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Viewport bounds in screen space — compare against worldToScreen output. */
export function viewRect(cam: CameraState, vp: Viewport): ViewRect {
  const hw = vp.width / 2;
  const hh = vp.height / 2;
  return { left: -hw, right: hw, top: -hh, bottom: hh };
}

/** Node card footprint in world units (keep in sync with ELK_NODE_W/H). */
export const NODE_HALF_W = 2;
export const NODE_HALF_H = 0.75;
