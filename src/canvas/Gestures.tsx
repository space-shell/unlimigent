import { useEffect, useRef } from "react";
import type { Runtime } from "../app/runtime";

/** Pinch + wheel gestures on the canvas wrapper element. Single-pointer pan
 * and taps live on the scene meshes (GroundCatcher / plates). */
export function useCanvasGestures(
  ref: React.RefObject<HTMLElement | null>,
  runtime: Runtime,
): void {
  const busRef = useRef(runtime.bus);
  busRef.current = runtime.bus;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bus = busRef.current;

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist: number | null = null;

    const distOf = () => {
      const list = [...pointers.values()];
      if (list.length < 2) return null;
      return Math.hypot(list[0]!.x - list[1]!.x, list[0]!.y - list[1]!.y);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      bus.dispatch({
        type: "camera.zoom",
        source: "touch",
        delta: e.deltaY < 0 ? 1.1 : 1 / 1.1,
        origin: { x: e.clientX, y: e.clientY },
      });
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinchDist = distOf();
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const dist = distOf();
        if (pinchDist && dist && pinchDist > 0) {
          const list = [...pointers.values()];
          bus.dispatch({
            type: "camera.zoom",
            source: "touch",
            delta: dist / pinchDist,
            origin: {
              x: (list[0]!.x + list[1]!.x) / 2,
              y: (list[0]!.y + list[1]!.y) / 2,
            },
          });
        }
        pinchDist = dist;
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [ref]);
}
