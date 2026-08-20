import { useEffect, useRef } from "react";
import type { Runtime } from "../app/runtime";

const TAP_SLOP_PX = 6;
const LONG_PRESS_MS = 450;

interface PointerInfo {
  x: number;
  y: number;
}

/** Background gesture surface: one-finger pan/tap, two-finger pinch zoom,
 * wheel zoom (desktop convenience). Node cards sit above this layer and
 * stop propagation, so only empty-canvas gestures arrive here. */
export function GestureLayer({ runtime }: { runtime: Runtime }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bus = runtime.bus;

    const pointers = new Map<number, PointerInfo>();
    let pan: { startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null = null;
    let pinch: { dist: number } | null = null;
    let longPress: ReturnType<typeof setTimeout> | null = null;
    let longPressFired = false;

    const midOf = (): PointerInfo | null => {
      const list = [...pointers.values()];
      if (list.length < 2) return null;
      return {
        x: (list[0]!.x + list[1]!.x) / 2,
        y: (list[0]!.y + list[1]!.y) / 2,
      };
    };
    const distOf = (): number | null => {
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
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        pan = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
        longPressFired = false;
        longPress = setTimeout(() => {
          if (pan && !pan.moved && pointers.size === 1) longPressFired = true;
        }, LONG_PRESS_MS);
      } else {
        if (longPress) clearTimeout(longPress);
        longPress = null;
        pan = null;
        pinch = { dist: distOf() ?? 0 };
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && pan) {
        if (
          !pan.moved &&
          Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY) > TAP_SLOP_PX
        ) {
          pan.moved = true;
          if (longPress) clearTimeout(longPress);
        }
        if (pan.moved) {
          bus.dispatch({
            type: "camera.pan",
            source: "touch",
            delta: { x: e.clientX - pan.lastX, y: e.clientY - pan.lastY },
          });
        }
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
      } else if (pointers.size >= 2 && pinch) {
        const dist = distOf() ?? pinch.dist;
        if (pinch.dist > 0 && dist > 0) {
          const origin = midOf();
          bus.dispatch({
            type: "camera.zoom",
            source: "touch",
            delta: dist / pinch.dist,
            origin: origin ?? undefined,
          });
        }
        pinch.dist = dist;
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (longPress) clearTimeout(longPress);
      longPress = null;
      if (pointers.size === 0) {
        if (pan && !pan.moved && !longPressFired) {
          bus.dispatch({ type: "camera.focus", source: "touch", id: undefined });
        }
        pan = null;
        pinch = null;
      } else if (pointers.size === 1) {
        // pinch -> single: restart as a fresh pan without tap
        const only = [...pointers.values()][0]!;
        pan = { startX: only.x, startY: only.y, lastX: only.x, lastY: only.y, moved: true };
        pinch = null;
      }
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
  }, [runtime]);

  return <div ref={ref} className="gesture-layer" />;
}
