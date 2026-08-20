import { useFrame, useThree } from "@react-three/fiber";
import type { Runtime } from "../app/runtime";

/** Syncs the three.js camera from store camera state. Dumb by design: all
 * camera decisions happen in the intent controller. R3F keeps the ortho
 * frustum matched to the viewport, so zoom semantics are px-per-world-unit. */
export function CameraRig({ runtime }: { runtime: Runtime }) {
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const cam = runtime.store.getState().camera;
    camera.position.set(cam.x, cam.y, 10);
    const ortho = camera as unknown as {
      zoom: number;
      updateProjectionMatrix: () => void;
    };
    if (ortho.zoom !== cam.zoom) {
      ortho.zoom = cam.zoom;
      ortho.updateProjectionMatrix();
    }
  });

  return null;
}
