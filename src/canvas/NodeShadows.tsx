import { useStore } from "zustand";
import { useRuntime } from "../app/RuntimeContext";
import { tokens } from "../tokens";

/** Soft ground shadows under node cards — anchors the screen-space cards to
 * the 3D plane and sells the isometric depth. */
export function NodeShadows() {
  const { store } = useRuntime();
  const nodes = useStore(store, (s) => s.nodes);
  const camera = useStore(store, (s) => s.camera);
  // hide when zoomed far out (cards are dots; shadows read as noise)
  if (camera.zoom < 12) return null;

  return (
    <>
      {Object.values(nodes).map((n) => (
        <mesh key={n.id} position={[n.position.x, n.position.y, 0]} renderOrder={-1}>
          <circleGeometry args={[1.9, 24]} />
          <meshBasicMaterial
            color={tokens.ink}
            transparent
            opacity={n.status === "archived" ? 0.03 : 0.07}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
