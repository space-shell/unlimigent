import { useRef } from "react";
import type { Runtime } from "../app/runtime";
import { ZOOM_DEFAULT } from "../graph/store";

/** Invisible catch plane under the plates: background pan, tap-to-deselect,
 * and double-tap to return to the initial zoom level. Plates stop
 * propagation, so this only sees empty-canvas pointers. */
export function GroundCatcher({ runtime }: { runtime: Runtime }) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTapTimer = () => {
    if (tapTimerRef.current !== null) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  };

  return (
    <mesh
      position={[0, 0, -0.05]}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        e.stopPropagation();
        const x = e.nativeEvent.clientX;
        const y = e.nativeEvent.clientY;
        if (Math.hypot(x - d.x, y - d.y) > 4) d.moved = true;
        if (d.moved) {
          runtime.bus.dispatch({
            type: "camera.pan",
            source: "touch",
            delta: { x: x - d.x, y: y - d.y },
          });
          d.x = x;
          d.y = y;
        }
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          const now = performance.now();
          if (now - lastTapRef.current < 300) {
            // double tap on the background: cancel the pending deselect and
            // glide back to the initial zoom level
            lastTapRef.current = 0;
            cancelTapTimer();
            const cam = runtime.store.getState().camera;
            runtime.bus.dispatch({
              type: "camera.teleport",
              source: "touch",
              target: { x: cam.x, y: cam.y },
              zoom: ZOOM_DEFAULT,
            });
          } else {
            // single tap (delayed so a second tap can cancel the deselect)
            lastTapRef.current = now;
            cancelTapTimer();
            tapTimerRef.current = setTimeout(() => {
              tapTimerRef.current = null;
              runtime.bus.dispatch({ type: "camera.focus", source: "touch", id: undefined });
            }, 300);
          }
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
