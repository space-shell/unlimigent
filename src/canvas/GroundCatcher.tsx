import { useRef } from "react";
import type { Runtime } from "../app/runtime";

/** Invisible catch plane under the plates: background pan + tap-to-deselect.
 * Plates stop propagation, so this only sees empty-canvas pointers. */
export function GroundCatcher({ runtime }: { runtime: Runtime }) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

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
          runtime.bus.dispatch({ type: "camera.focus", source: "touch", id: undefined });
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
